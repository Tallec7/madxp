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

  logger.info('[CronScheduler] Video FTP audit completed', {
    ...result,
    scheduleId: schedule.id,
  });

  return {
    success: true,
    message: `Scanned ${result.scanned} videos: ${result.missing} missing, ${result.unreachable} unreachable, ${result.resolved} resolved`,
    details: result as unknown as Record<string, unknown>,
  };
}
