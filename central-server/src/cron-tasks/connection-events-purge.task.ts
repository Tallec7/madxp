/**
 * CRON task — Purge des rows `connection_events` plus vieilles que
 * `retentionDays` (défaut 90j). ADR-099 follow-up.
 *
 * Pourquoi 90 jours ?
 * - Permet les post-mortems sur "pourquoi le Pi X était-il rouge le ?".
 * - 50 Pi × ~2 events/jour × 90j = ~9k rows en régime stationnaire (peanuts).
 * - Si la flotte explose ou que la fréquence des reconnects augmente, le compteur
 *   `neopro_connection_events_rows_current` permet d'ajuster la rétention.
 *
 * Tunable via `task_config.retentionDays` dans la table `recurring_schedules`.
 *
 * Smoke-test enforced (`smoke-connection-events`) : ne pas retirer
 * `metricsService.recordConnectionEventsPurge` (sans elle, un bug silencieux
 * du CRON laisse la table grossir sans alerte).
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { connectionEventsRepository } from '../repositories';
import { metricsService } from '../services/metrics.service';
import { ExecutionResult, RecurringSchedule } from './types';

const DEFAULT_RETENTION_DAYS = 90;

export async function executeConnectionEventsPurgeTask(
  schedule: RecurringSchedule
): Promise<ExecutionResult> {
  const config = schedule.task_config as { retentionDays?: number };
  const retentionDays = Math.max(1, config.retentionDays ?? DEFAULT_RETENTION_DAYS);

  const deleted = await connectionEventsRepository.purgeOlderThan(retentionDays);

  // Compte les rows restantes pour alimenter la gauge Prometheus.
  const remainingResult = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM connection_events'
  );
  const remaining = parseInt(remainingResult.rows[0]?.count ?? '0', 10);

  metricsService.recordConnectionEventsPurge({ deleted, remaining });

  logger.info('[CronScheduler] connection_events purge completed', {
    deleted,
    remaining,
    retentionDays,
    scheduleId: schedule.id,
  });

  return {
    success: true,
    message: `Purged ${deleted} connection_events rows older than ${retentionDays}d (${remaining} remaining)`,
    details: { deleted, remaining, retentionDays },
  };
}
