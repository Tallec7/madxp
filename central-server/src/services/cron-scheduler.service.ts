/**
 * Service de gestion des tâches récurrentes (cron) — orchestrateur (ADR-097).
 *
 * Responsabilités :
 * - Lifecycle (start/stop, loadSchedules)
 * - Conversion config DB → expression cron + scheduling node-cron
 * - Dispatch vers le bon executor (`cron-tasks/*.task.ts`)
 * - Tracking des exécutions (recurring_schedule_executions)
 * - API CRUD (list/get/create/update/delete/toggle/runNow/getExecutionHistory)
 *
 * Les executors de tâches sont isolés dans `central-server/src/cron-tasks/`
 * (un fichier par task_type). Ce fichier ne contient PLUS la logique métier
 * des tâches — uniquement le dispatch.
 */

import cron, { ScheduledTask } from 'node-cron';
import { query } from '../config/database';
import logger from '../config/logger';
import {
  CronTaskType,
  ExecutionResult,
  RecurringSchedule,
} from '../cron-tasks/types';
import { executeReportTask } from '../cron-tasks/report.task';
import { executeCleanupTask } from '../cron-tasks/cleanup.task';
import { executeObjectiveCheckTask } from '../cron-tasks/objective-check.task';
import { executeAggregationTask } from '../cron-tasks/aggregation.task';
import { executeBackupTask } from '../cron-tasks/backup.task';
import { executePdfReportTask } from '../cron-tasks/pdf-report.task';
import { executeMatchAutoCloseTask } from '../cron-tasks/match-autoclose.task';
import { executeVideoFtpAuditTask } from '../cron-tasks/video-ftp-audit.task';
import { executeConnectionEventsPurgeTask } from '../cron-tasks/connection-events-purge.task';
import { executeTestRenderCleanupTask } from '../cron-tasks/test-render-cleanup.task';
import { executePendingCommandsDrainTask } from '../cron-tasks/pending-commands-drain.task';

// Re-export pour préserver la compatibilité des imports externes
export { RecurringSchedule, ExecutionResult, CronTaskType } from '../cron-tasks/types';

/**
 * Dispatch table : task_type → executor isolé.
 * Centralise le routing en un seul endroit (vs switch dupliqué dans
 * `executeSchedule()` + `runNow()` avant ADR-097).
 */
const TASK_EXECUTORS: Record<CronTaskType, (s: RecurringSchedule) => Promise<ExecutionResult>> = {
  report: executeReportTask,
  cleanup: executeCleanupTask,
  objective_check: executeObjectiveCheckTask,
  aggregation: executeAggregationTask,
  backup: executeBackupTask,
  pdf_report: executePdfReportTask,
  match_session_autoclose: executeMatchAutoCloseTask,
  video_ftp_audit: executeVideoFtpAuditTask,
  connection_events_purge: executeConnectionEventsPurgeTask,
  test_render_cleanup: executeTestRenderCleanupTask,
  pending_commands_drain: executePendingCommandsDrainTask,
};

async function dispatchTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
  const executor = TASK_EXECUTORS[schedule.task_type];
  if (!executor) {
    return { success: false, message: `Unknown task type: ${schedule.task_type}` };
  }
  return executor(schedule);
}

class CronSchedulerService {
  private cronJobs: Map<string, ScheduledTask> = new Map();
  private isRunning = false;

  /**
   * Démarre le service de scheduling cron
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('CronScheduler already running');
      return;
    }

    logger.info('Starting CronScheduler service...');

    try {
      await this.loadSchedules();
      this.isRunning = true;
      logger.info('CronScheduler service started successfully');
    } catch (error) {
      // Si la migration n'est pas encore appliquée, on log un warning
      if (error instanceof Error && error.message.includes('recurring_schedules')) {
        logger.warn('CronScheduler: migration not yet applied, service disabled');
      } else {
        logger.error('Failed to start CronScheduler:', error);
      }
    }
  }

  /**
   * Arrête le service et tous les jobs cron
   */
  stop(): void {
    for (const [id, job] of this.cronJobs) {
      job.stop();
      logger.debug(`Stopped cron job: ${id}`);
    }
    this.cronJobs.clear();
    this.isRunning = false;
    logger.info('CronScheduler service stopped');
  }

  /**
   * Charge les schedules actifs depuis la base de données
   */
  private async loadSchedules(): Promise<void> {
    const result = await query<RecurringSchedule>(
      `SELECT * FROM recurring_schedules WHERE is_active = true`,
      []
    );

    for (const schedule of result.rows) {
      await this.scheduleJob(schedule);
    }

    logger.info(`Loaded ${result.rows.length} recurring schedules`);
  }

  /**
   * Planifie un job cron pour un schedule
   */
  private async scheduleJob(schedule: RecurringSchedule): Promise<void> {
    const cronExpression = this.buildCronExpression(schedule);

    if (!cron.validate(cronExpression)) {
      logger.error(`Invalid cron expression for schedule ${schedule.id}: ${cronExpression}`);
      return;
    }

    if (this.cronJobs.has(schedule.id)) {
      this.cronJobs.get(schedule.id)?.stop();
    }

    const job = cron.schedule(
      cronExpression,
      async () => {
        await this.executeSchedule(schedule);
      },
      {
        timezone: schedule.timezone || 'Europe/Paris',
      }
    );

    this.cronJobs.set(schedule.id, job);

    logger.info(`Scheduled cron job: ${schedule.name}`, {
      id: schedule.id,
      cron: cronExpression,
      taskType: schedule.task_type,
    });
  }

  /**
   * Construit l'expression cron à partir de la configuration
   */
  private buildCronExpression(schedule: RecurringSchedule): string {
    if (schedule.cron_expression) {
      return schedule.cron_expression;
    }

    const minute = schedule.minute ?? 0;
    const hour = schedule.hour ?? 9;

    switch (schedule.frequency) {
      case 'daily':
        return `${minute} ${hour} * * *`;

      case 'weekly': {
        const dayOfWeek = schedule.day_of_week ?? 1;
        return `${minute} ${hour} * * ${dayOfWeek}`;
      }

      case 'monthly': {
        const dayOfMonth = schedule.day_of_month ?? 1;
        return `${minute} ${hour} ${dayOfMonth} * *`;
      }

      default:
        return `${minute} ${hour} * * *`;
    }
  }

  /**
   * Exécute un schedule (path automatique cron-trigger).
   */
  private async executeSchedule(schedule: RecurringSchedule): Promise<void> {
    const executionId = await this.startExecution(schedule.id);

    logger.info(`Executing scheduled task: ${schedule.name}`, {
      scheduleId: schedule.id,
      executionId,
      taskType: schedule.task_type,
    });

    const startTime = Date.now();

    try {
      const result = await dispatchTask(schedule);
      await this.completeExecution(executionId, schedule.id, result, Date.now() - startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to execute scheduled task: ${schedule.name}`, {
        error,
        scheduleId: schedule.id,
      });
      await this.failExecution(executionId, schedule.id, errorMessage, Date.now() - startTime);
    }
  }

  // =============== Execution Tracking ===============

  /**
   * Démarre le tracking d'une exécution
   */
  private async startExecution(scheduleId: string): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO recurring_schedule_executions (schedule_id, status)
       VALUES ($1, 'running')
       RETURNING id`,
      [scheduleId]
    );

    return result.rows[0].id;
  }

  /**
   * Marque une exécution comme terminée avec succès
   */
  private async completeExecution(
    executionId: string,
    scheduleId: string,
    result: ExecutionResult,
    durationMs: number
  ): Promise<void> {
    await query(
      `UPDATE recurring_schedule_executions
       SET status = 'success', completed_at = NOW(), duration_ms = $1, result_summary = $2
       WHERE id = $3`,
      [durationMs, JSON.stringify(result.details || {}), executionId]
    );

    await query(
      `UPDATE recurring_schedules
       SET last_run_at = NOW(), last_run_status = 'success', run_count = run_count + 1,
           next_run_at = calculate_next_run(frequency, day_of_week, day_of_month, hour, minute, timezone)
       WHERE id = $1`,
      [scheduleId]
    );

    logger.info(`Schedule execution completed`, { scheduleId, executionId, result: result.message });
  }

  /**
   * Marque une exécution comme échouée
   */
  private async failExecution(
    executionId: string,
    scheduleId: string,
    errorMessage: string,
    durationMs: number
  ): Promise<void> {
    await query(
      `UPDATE recurring_schedule_executions
       SET status = 'failed', completed_at = NOW(), duration_ms = $1, error_message = $2
       WHERE id = $3`,
      [durationMs, errorMessage, executionId]
    );

    await query(
      `UPDATE recurring_schedules
       SET last_run_at = NOW(), last_run_status = 'failed', last_run_error = $1,
           failure_count = failure_count + 1,
           next_run_at = calculate_next_run(frequency, day_of_week, day_of_month, hour, minute, timezone)
       WHERE id = $2`,
      [errorMessage, scheduleId]
    );
  }

  // =============== API Methods ===============

  /**
   * Liste tous les schedules
   */
  async listSchedules(): Promise<RecurringSchedule[]> {
    const result = await query<RecurringSchedule>(
      `SELECT * FROM recurring_schedules ORDER BY name`,
      []
    );
    return result.rows;
  }

  /**
   * Récupère un schedule par ID
   */
  async getSchedule(id: string): Promise<RecurringSchedule | null> {
    const result = await query<RecurringSchedule>(
      `SELECT * FROM recurring_schedules WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Active ou désactive un schedule
   */
  async toggleSchedule(id: string, isActive: boolean): Promise<boolean> {
    const result = await query(
      `UPDATE recurring_schedules SET is_active = $1 WHERE id = $2 RETURNING id`,
      [isActive, id]
    );

    if (result.rowCount && result.rowCount > 0) {
      if (isActive) {
        const schedule = await this.getSchedule(id);
        if (schedule) {
          await this.scheduleJob(schedule);
        }
      } else {
        this.cronJobs.get(id)?.stop();
        this.cronJobs.delete(id);
      }
      return true;
    }

    return false;
  }

  /**
   * Exécute manuellement un schedule
   */
  async runNow(id: string): Promise<ExecutionResult> {
    const schedule = await this.getSchedule(id);
    if (!schedule) {
      return { success: false, message: 'Schedule not found' };
    }

    const executionId = await this.startExecution(id);
    const startTime = Date.now();

    try {
      const result = await dispatchTask(schedule);
      await this.completeExecution(executionId, id, result, Date.now() - startTime);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.failExecution(executionId, id, errorMessage, Date.now() - startTime);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Récupère l'historique des exécutions
   */
  async getExecutionHistory(scheduleId: string, limit = 20): Promise<Array<{
    id: string;
    started_at: Date;
    completed_at: Date | null;
    duration_ms: number | null;
    status: string;
    error_message: string | null;
    result_summary: Record<string, unknown>;
  }>> {
    const result = await query(
      `SELECT * FROM recurring_schedule_executions
       WHERE schedule_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [scheduleId, limit]
    );
    return result.rows as any[];
  }

  /**
   * Crée un nouveau schedule
   */
  async createSchedule(data: {
    name: string;
    description?: string;
    task_type: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    day_of_week?: number;
    day_of_month?: number;
    hour?: number;
    minute?: number;
    task_config?: Record<string, unknown>;
    is_active?: boolean;
    created_by?: string;
  }): Promise<RecurringSchedule> {
    const result = await query<RecurringSchedule>(
      `INSERT INTO recurring_schedules
        (name, description, task_type, frequency, day_of_week, day_of_month, hour, minute, task_config, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.name,
        data.description || null,
        data.task_type,
        data.frequency,
        data.day_of_week ?? null,
        data.day_of_month ?? null,
        data.hour ?? 9,
        data.minute ?? 0,
        JSON.stringify(data.task_config || {}),
        data.is_active ?? false,
        data.created_by ?? null,
      ]
    );

    const schedule = result.rows[0];

    if (schedule.is_active) {
      await this.scheduleJob(schedule);
    }

    return schedule;
  }

  /**
   * Met à jour un schedule
   */
  async updateSchedule(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      frequency: 'daily' | 'weekly' | 'monthly';
      day_of_week: number;
      day_of_month: number;
      hour: number;
      minute: number;
      task_config: Record<string, unknown>;
      is_active: boolean;
    }>
  ): Promise<RecurringSchedule | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(key === 'task_config' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return this.getSchedule(id);
    }

    values.push(id);

    const result = await query<RecurringSchedule>(
      `UPDATE recurring_schedules SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    const schedule = result.rows[0];

    if (schedule) {
      if (schedule.is_active) {
        await this.scheduleJob(schedule);
      } else {
        this.cronJobs.get(id)?.stop();
        this.cronJobs.delete(id);
      }
    }

    return schedule || null;
  }

  /**
   * Supprime un schedule
   */
  async deleteSchedule(id: string): Promise<boolean> {
    this.cronJobs.get(id)?.stop();
    this.cronJobs.delete(id);

    const result = await query(
      `DELETE FROM recurring_schedules WHERE id = $1`,
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }
}

export const cronSchedulerService = new CronSchedulerService();
export default cronSchedulerService;
