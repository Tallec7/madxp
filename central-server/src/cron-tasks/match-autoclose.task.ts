/**
 * CRON task — Clôture automatique des sessions match (ADR-093 / ADR-097).
 *
 * Règles :
 * - idle : aucune `video_plays` depuis `idleHours` (défaut 4h) ET started_at plus vieux que idleHours
 *   → ended_at = dernier video_play si présent, sinon started_at + idleHours
 * - absolute : started_at plus vieux que `absoluteTimeoutHours` (défaut 24h)
 *   → ended_at = started_at + absoluteTimeoutHours
 * - ended_by = 'timeout', duration_seconds calculé.
 *
 * Smoke-test enforced (`smoke/smoke-adr093-match-sessions`) : ne pas retirer
 * la métrique Prometheus `metricsService.recordMatchSessionAutoclosed`
 * (sans elle, un bug silencieux du CRON reste invisible).
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { metricsService } from '../services/metrics.service';
import { ExecutionResult, RecurringSchedule } from './types';

export async function executeMatchAutoCloseTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
  const config = schedule.task_config as {
    idleHours?: number;
    absoluteTimeoutHours?: number;
  };
  const idleHours = config.idleHours ?? 4;
  const absoluteTimeoutHours = config.absoluteTimeoutHours ?? 24;

  // Absolute timeout first (covers sessions with no plays at all).
  const absoluteResult = await query(
    `UPDATE club_sessions cs
     SET ended_at = cs.started_at + ($1 || ' hours')::interval,
         ended_by = 'timeout',
         duration_seconds = EXTRACT(EPOCH FROM ($1 || ' hours')::interval)::int
     WHERE cs.ended_at IS NULL
       AND cs.started_at < NOW() - ($1 || ' hours')::interval`,
    [String(absoluteTimeoutHours)]
  );

  // Idle timeout based on last video_play per session.
  const idleResult = await query(
    `WITH last_play AS (
       SELECT session_id, MAX(played_at) AS last_played_at
       FROM video_plays
       WHERE session_id IS NOT NULL
       GROUP BY session_id
     )
     UPDATE club_sessions cs
     SET ended_at = COALESCE(lp.last_played_at, cs.started_at + ($1 || ' hours')::interval),
         ended_by = 'timeout',
         duration_seconds = EXTRACT(EPOCH FROM (
           COALESCE(lp.last_played_at, cs.started_at + ($1 || ' hours')::interval) - cs.started_at
         ))::int
     FROM last_play lp
     WHERE cs.ended_at IS NULL
       AND cs.id = lp.session_id
       AND lp.last_played_at < NOW() - ($1 || ' hours')::interval
       AND cs.started_at < NOW() - ($1 || ' hours')::interval`,
    [String(idleHours)]
  );

  const closedAbsolute = absoluteResult.rowCount ?? 0;
  const closedIdle = idleResult.rowCount ?? 0;
  const closed = closedAbsolute + closedIdle;

  metricsService.recordMatchSessionAutoclosed('absolute', closedAbsolute);
  metricsService.recordMatchSessionAutoclosed('idle', closedIdle);

  logger.info('[CronScheduler] Match auto-close completed', {
    closed,
    idleHours,
    absoluteTimeoutHours,
    scheduleId: schedule.id,
  });

  return {
    success: true,
    message: `Auto-closed ${closed} match sessions`,
    details: {
      closedAbsolute,
      closedIdle,
      idleHours,
      absoluteTimeoutHours,
    },
  };
}
