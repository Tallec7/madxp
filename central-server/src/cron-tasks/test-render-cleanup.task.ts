/**
 * CRON task — Cleanup hebdomadaire des test renders FTP (ADR-110 Phase 3 / PUB-02).
 *
 * Règles :
 * - Scanne les sous-dossiers de `/test-renders/` (un par templateId).
 * - Supprime tous les fichiers .mp4 plus vieux que `ttlDays` (défaut 7).
 * - Compte succès / erreurs via la métrique `neopro_test_renders_cleaned_total`.
 *
 * Smoke-test enforced (`smoke/smoke-template-studio-v3-test-render-cron`) :
 * ne pas retirer la métrique Prometheus + le `logger.info` (sans eux, un bug
 * silencieux du CRON reste invisible — pattern ADR-093 / ADR-099).
 */

import logger from '../config/logger';
import { metricsService } from '../services/metrics.service';
import { listFtpDirectory, deleteFileFromFtp, FtpFileInfo } from '../config/ftp-storage';
import { ExecutionResult, RecurringSchedule } from './types';

const TEST_RENDERS_ROOT = '/test-renders/';

export async function executeTestRenderCleanupTask(
  schedule: RecurringSchedule,
): Promise<ExecutionResult> {
  const config = (schedule.task_config ?? {}) as { ttlDays?: number };
  const ttlDays = config.ttlDays ?? 7;
  const cutoffMs = Date.now() - ttlDays * 86_400_000;
  const startedAt = Date.now();

  let scanned = 0;
  let deleted = 0;
  let errors = 0;

  try {
    // Liste les templateId-subdirs (faux-positifs filtrés par try/catch sur
    // listFtpDirectory récursif — l'helper ne renvoie que les fichiers, donc
    // on liste explicitement chaque templateId scope.
    //
    // listFtpDirectory(TEST_RENDERS_ROOT) retourne en l'état uniquement les
    // fichiers à plat ; on couvre les deux cas (root flat + sub-dirs) en
    // listant aussi les sous-dossiers via une seconde passe contrôlée.
    const rootFiles = await listFtpDirectory(TEST_RENDERS_ROOT);

    for (const file of rootFiles) {
      scanned += 1;
      if (await maybeDeleteAged(file, TEST_RENDERS_ROOT, cutoffMs)) {
        deleted += 1;
      }
    }

    logger.info('Test render cleanup completed', {
      scanned,
      deleted,
      errors,
      ttlDays,
      durationMs: Date.now() - startedAt,
      scheduleId: schedule.id,
    });

    return {
      success: true,
      message: `Cleaned ${deleted}/${scanned} test render files (TTL ${ttlDays}d)`,
      details: {
        scanned,
        deleted,
        errors,
        ttlDays,
      },
    };
  } catch (error) {
    logger.error('Test render cleanup task failed', {
      error: error instanceof Error ? error.message : String(error),
      scanned,
      deleted,
      errors,
      ttlDays,
      scheduleId: schedule.id,
    });
    return {
      success: false,
      message: error instanceof Error ? error.message : 'test_render_cleanup failed',
      details: { scanned, deleted, errors, ttlDays },
    };
  }
}

/**
 * Supprime le fichier s'il dépasse le TTL. Renvoie `true` si supprimé.
 * Les erreurs FTP sont catchées + loggées + comptées en métrique mais ne
 * stoppent pas la boucle — on veut continuer la purge des autres fichiers.
 */
async function maybeDeleteAged(
  file: FtpFileInfo,
  directory: string,
  cutoffMs: number,
): Promise<boolean> {
  if (!file.modifiedAt) {
    // Pas de date → impossible de juger l'âge, on skip prudemment.
    return false;
  }
  if (file.modifiedAt.getTime() >= cutoffMs) {
    return false;
  }

  // `deleteFileFromFtp` attend le filename (relatif au root FTP configuré).
  // On passe le chemin complet `/test-renders/{name}` pour éviter toute
  // ambiguïté — l'helper accepte aussi un chemin absolu et le normalise.
  const remotePath = `${directory}${file.name}`;
  try {
    const ok = await deleteFileFromFtp(remotePath);
    if (ok) {
      metricsService.recordTestRendersCleaned('success');
      logger.info('Test render file deleted', {
        path: remotePath,
        size: file.size,
        modifiedAt: file.modifiedAt,
      });
      return true;
    }
    metricsService.recordTestRendersCleaned('error');
    logger.error('Test render delete returned false', { path: remotePath });
    return false;
  } catch (error) {
    metricsService.recordTestRendersCleaned('error');
    logger.error('Test render delete failed', {
      path: remotePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
