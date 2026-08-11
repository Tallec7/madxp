/**
 * CRON task — Audit FTP des vidéos orphelines (PR2.2).
 *
 * Vérifie quotidiennement que chaque `videos.storage_path` pointe vers un
 * fichier réel sur le FTP Hostinger. Détecte les anomalies que la cascade
 * DELETE (PR2) ne couvre pas :
 *   - Suppression directe sur le FTP (FileZilla, SSH).
 *   - Upload qui n'a jamais réussi côté FTP malgré la création de la row DB.
 *
 * Cause racine de l'incident PR #613 (vidéo `acff5e34` morte sur SaaS NLF).
 *
 * Smoke-test enforced (`smoke-saas`) : ne pas retirer la métrique
 * `metricsService.recordVideoFtpAudit` (sans elle, un bug silencieux du CRON
 * reste invisible).
 */

import logger from '../config/logger';
import { videoFtpAuditService } from '../services/video-ftp-audit.service';
import { ExecutionResult, RecurringSchedule } from './types';

export async function executeVideoFtpAuditTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
  const config = schedule.task_config as {
    batchSize?: number;
    concurrency?: number;
  };

  const result = await videoFtpAuditService.auditAllVideos({
    batchSize: config.batchSize ?? 50,
    concurrency: config.concurrency ?? 5,
  });

  // Restitution — sans elle, l'audit ne fait que remplir une table que personne ne
  // lit (46 fichiers absents accumulés en 3 mois, `notified_at` NULL sur toutes).
  // Isolée dans son propre try : un échec d'alerting ne doit pas faire passer la
  // tâche en échec alors que le scan, lui, a bien eu lieu et est déjà persisté.
  let notified = { sitesAlerted: 0, pathsNotified: 0 };
  try {
    notified = await videoFtpAuditService.notifyMissingReferencedInProfiles();
  } catch (error) {
    logger.error('[CronScheduler] Video FTP audit: échec de la notification', {
      error: error instanceof Error ? error.message : String(error),
      scheduleId: schedule.id,
    });
  }

  logger.info('[CronScheduler] Video FTP audit completed', {
    ...result,
    ...notified,
    scheduleId: schedule.id,
  });

  return {
    success: true,
    message:
      `Scanned ${result.scanned} videos: ${result.missing} missing, ${result.unreachable} unreachable, ` +
      `${result.resolved} resolved — ${notified.sitesAlerted} site(s) alerté(s)`,
    details: { ...result, ...notified } as unknown as Record<string, unknown>,
  };
}
