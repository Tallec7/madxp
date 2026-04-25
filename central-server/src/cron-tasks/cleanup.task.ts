/**
 * CRON task — Nettoyage des données anciennes (ADR-097).
 *
 * Deux modes :
 * 1. Time-based : DELETE WHERE date < NOW() - INTERVAL 'X days' (config.older_than_days)
 * 2. Version-based : keep only N most recent versions per site (config.keep_versions)
 *    — réservé à `config_history` qui a une FK self-referential.
 *
 * Whitelist explicite des tables nettoyables (allowedTables) — toute table
 * absente de cette liste est silencieusement skip avec un warn.
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { ExecutionResult, RecurringSchedule } from './types';

// Tables autorisées pour le cleanup avec leur colonne de date
const ALLOWED_TABLES: Record<string, string> = {
  recurring_schedule_executions: 'started_at',
  audit_logs: 'created_at',
  video_plays: 'played_at',
  metrics: 'recorded_at',
  remote_commands: 'created_at',
  alerts: 'created_at',
  config_history: 'deployed_at', // Special handling below
  sponsor_access_tokens: 'expires_at', // P5: magic link tokens cleanup
};

export async function executeCleanupTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
  const config = schedule.task_config as {
    older_than_days?: number;
    keep_versions?: number;
    tables?: string[];
  };

  const tables = config.tables || ['recurring_schedule_executions'];
  let totalDeleted = 0;
  const details: Record<string, number> = {};

  for (const table of tables) {
    if (!ALLOWED_TABLES[table]) {
      logger.warn(`Cleanup skipped for unauthorized table: ${table}`);
      continue;
    }

    let result;

    // Special handling for config_history: keep N versions per site
    if (table === 'config_history' && config.keep_versions) {
      result = await cleanupConfigHistory(config.keep_versions);
    } else {
      // Standard time-based cleanup
      const olderThanDays = config.older_than_days || 30;
      const dateColumn = ALLOWED_TABLES[table];

      result = await query(
        `DELETE FROM ${table}
         WHERE ${dateColumn} < NOW() - INTERVAL '${olderThanDays} days'`,
        []
      );
    }

    const deletedCount = result.rowCount || 0;
    totalDeleted += deletedCount;
    details[table] = deletedCount;

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} rows from ${table}`);
    }
  }

  return {
    success: true,
    message: `Deleted ${totalDeleted} old records`,
    details: {
      tables,
      deletedByTable: details,
      totalDeleted,
      ...(config.older_than_days && { olderThanDays: config.older_than_days }),
      ...(config.keep_versions && { keepVersions: config.keep_versions }),
      scheduleId: schedule.id,
    },
  };
}

/**
 * Cleanup config_history keeping only the N most recent versions per site.
 * Handles self-referential FK (previous_version_id) by nullifying references first.
 */
async function cleanupConfigHistory(keepVersions: number): Promise<{ rowCount: number }> {
  // First, nullify FK references to records that will be deleted
  await query(
    `WITH ranked AS (
      SELECT id, site_id,
             ROW_NUMBER() OVER (PARTITION BY site_id ORDER BY deployed_at DESC) as rn
      FROM config_history
    ),
    to_delete AS (
      SELECT id FROM ranked WHERE rn > $1
    )
    UPDATE config_history
    SET previous_version_id = NULL
    WHERE previous_version_id IN (SELECT id FROM to_delete)`,
    [keepVersions]
  );

  // Then delete the old versions
  const result = await query(
    `WITH ranked AS (
      SELECT id, site_id,
             ROW_NUMBER() OVER (PARTITION BY site_id ORDER BY deployed_at DESC) as rn
      FROM config_history
    )
    DELETE FROM config_history
    WHERE id IN (
      SELECT id FROM ranked WHERE rn > $1
    )`,
    [keepVersions]
  );

  return { rowCount: result.rowCount || 0 };
}
