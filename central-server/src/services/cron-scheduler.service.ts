/**
 * Service de gestion des tâches récurrentes (cron)
 *
 * Gère l'exécution automatique de:
 * - Rapports périodiques (quotidiens, hebdomadaires, mensuels)
 * - Nettoyage des données anciennes
 * - Vérification des objectifs clubs
 * - Agrégation de statistiques
 */

import cron, { ScheduledTask } from 'node-cron';
import { query } from '../config/database';
import emailService from './email.service';
import logger from '../config/logger';

interface RecurringSchedule {
  [key: string]: unknown;  // Index signature for QueryResultRow compatibility
  id: string;
  name: string;
  description: string | null;
  task_type: 'report' | 'cleanup' | 'aggregation' | 'backup' | 'objective_check';
  cron_expression: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | null;
  day_of_week: number | null;
  day_of_month: number | null;
  hour: number;
  minute: number;
  timezone: string;
  task_config: Record<string, unknown>;
  is_active: boolean;
  last_run_at: Date | null;
  next_run_at: Date | null;
}

interface ExecutionResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
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
      // Charger et activer les schedules depuis la base
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

    // Arrêter l'ancien job s'il existe
    if (this.cronJobs.has(schedule.id)) {
      this.cronJobs.get(schedule.id)?.stop();
    }

    // Créer le nouveau job
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
    // Si une expression cron est définie, l'utiliser directement
    if (schedule.cron_expression) {
      return schedule.cron_expression;
    }

    const minute = schedule.minute ?? 0;
    const hour = schedule.hour ?? 9;

    switch (schedule.frequency) {
      case 'daily':
        // Tous les jours à l'heure spécifiée
        return `${minute} ${hour} * * *`;

      case 'weekly': {
        // Chaque semaine le jour spécifié
        const dayOfWeek = schedule.day_of_week ?? 1; // Lundi par défaut
        return `${minute} ${hour} * * ${dayOfWeek}`;
      }

      case 'monthly': {
        // Chaque mois le jour spécifié
        const dayOfMonth = schedule.day_of_month ?? 1; // 1er par défaut
        return `${minute} ${hour} ${dayOfMonth} * *`;
      }

      default:
        // Par défaut: quotidien à 9h
        return `${minute} ${hour} * * *`;
    }
  }

  /**
   * Exécute un schedule
   */
  private async executeSchedule(schedule: RecurringSchedule): Promise<void> {
    const executionId = await this.startExecution(schedule.id);

    logger.info(`Executing scheduled task: ${schedule.name}`, {
      scheduleId: schedule.id,
      executionId,
      taskType: schedule.task_type,
    });

    const startTime = Date.now();
    let result: ExecutionResult;

    try {
      switch (schedule.task_type) {
        case 'report':
          result = await this.executeReportTask(schedule);
          break;
        case 'cleanup':
          result = await this.executeCleanupTask(schedule);
          break;
        case 'objective_check':
          result = await this.executeObjectiveCheckTask(schedule);
          break;
        case 'aggregation':
          result = await this.executeAggregationTask(schedule);
          break;
        case 'backup':
          result = await this.executeBackupTask(schedule);
          break;
        default:
          result = { success: false, message: `Unknown task type: ${schedule.task_type}` };
      }

      await this.completeExecution(executionId, schedule.id, result, Date.now() - startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to execute scheduled task: ${schedule.name}`, { error, scheduleId: schedule.id });

      await this.failExecution(executionId, schedule.id, errorMessage, Date.now() - startTime);
    }
  }

  // =============== Task Executors ===============

  /**
   * Exécute une tâche de rapport
   */
  private async executeReportTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
    const config = schedule.task_config as {
      report_type?: string;
      recipients?: string[];
      sites?: string[];
      include_charts?: boolean;
      include_pdf?: boolean;
    };

    // Récupérer les destinataires
    let recipients: string[] = [];
    if (config.recipients?.includes('admin')) {
      // Récupérer les emails des admins
      const adminsResult = await query<{ email: string }>(
        `SELECT email FROM users WHERE role IN ('admin', 'super_admin') AND email IS NOT NULL`,
        []
      );
      recipients = adminsResult.rows.map(r => r.email);
    } else if (config.recipients) {
      recipients = config.recipients;
    }

    if (recipients.length === 0) {
      return { success: false, message: 'No recipients configured for report' };
    }

    // Récupérer les données pour le rapport
    const period = config.report_type?.includes('weekly') ? 'hebdomadaire' : 'mensuel';
    const reportData = await this.gatherReportData(config.sites || ['all']);

    // Envoyer le rapport par email
    const sent = await emailService.sendSummaryReport(recipients, {
      period,
      totalSites: reportData.totalSites,
      onlineSites: reportData.onlineSites,
      alertsCount: reportData.alertsCount,
      deploymentsCount: reportData.deploymentsCount,
      highlights: reportData.highlights,
    });

    return {
      success: sent,
      message: sent ? `Report sent to ${recipients.length} recipients` : 'Failed to send report',
      details: {
        recipients,
        period,
        stats: reportData,
      },
    };
  }

  /**
   * Rassemble les données pour un rapport
   */
  private async gatherReportData(sites: string[]): Promise<{
    totalSites: number;
    onlineSites: number;
    alertsCount: number;
    deploymentsCount: number;
    highlights: string[];
  }> {
    // Sites stats
    const sitesResult = await query<{ total: string; online: string }>(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'online') as online
       FROM sites`,
      []
    );

    // Alertes des 7 derniers jours
    const alertsResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM alerts
       WHERE created_at > NOW() - INTERVAL '7 days'`,
      []
    );

    // Déploiements des 7 derniers jours
    const deploymentsResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM content_deployments
       WHERE created_at > NOW() - INTERVAL '7 days'`,
      []
    );

    // Highlights
    const highlights: string[] = [];

    // Top vidéo jouée
    const topVideoResult = await query<{ filename: string; play_count: string }>(
      `SELECT v.filename, COUNT(*) as play_count
       FROM video_plays vp
       JOIN videos v ON v.id = vp.video_id
       WHERE vp.created_at > NOW() - INTERVAL '7 days'
       GROUP BY v.id, v.filename
       ORDER BY play_count DESC
       LIMIT 1`,
      []
    );

    if (topVideoResult.rows.length > 0) {
      highlights.push(`Vidéo la plus jouée: ${topVideoResult.rows[0].filename} (${topVideoResult.rows[0].play_count} lectures)`);
    }

    // Site le plus actif
    const topSiteResult = await query<{ name: string; screen_time: string }>(
      `SELECT s.name, SUM(cds.screen_time_seconds) as screen_time
       FROM club_daily_stats cds
       JOIN sites s ON s.id = cds.site_id
       WHERE cds.date > NOW() - INTERVAL '7 days'
       GROUP BY s.id, s.name
       ORDER BY screen_time DESC
       LIMIT 1`,
      []
    );

    if (topSiteResult.rows.length > 0) {
      const hours = Math.round(parseInt(topSiteResult.rows[0].screen_time) / 3600);
      highlights.push(`Site le plus actif: ${topSiteResult.rows[0].name} (${hours}h d'écran)`);
    }

    return {
      totalSites: parseInt(sitesResult.rows[0]?.total || '0'),
      onlineSites: parseInt(sitesResult.rows[0]?.online || '0'),
      alertsCount: parseInt(alertsResult.rows[0]?.count || '0'),
      deploymentsCount: parseInt(deploymentsResult.rows[0]?.count || '0'),
      highlights,
    };
  }

  /**
   * Exécute une tâche de nettoyage
   *
   * Supports two cleanup modes:
   * 1. Time-based: Delete records older than X days (older_than_days)
   * 2. Version-based: Keep only N most recent versions per site (keep_versions) - for config_history
   */
  private async executeCleanupTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
    const config = schedule.task_config as {
      older_than_days?: number;
      keep_versions?: number;
      tables?: string[];
    };

    const tables = config.tables || ['recurring_schedule_executions'];
    let totalDeleted = 0;
    const details: Record<string, number> = {};

    // Tables autorisées pour le cleanup avec leur colonne de date
    const allowedTables: Record<string, string> = {
      'recurring_schedule_executions': 'started_at',
      'audit_logs': 'created_at',
      'video_plays': 'played_at',
      'sponsor_impressions': 'played_at',
      'metrics': 'recorded_at',
      'remote_commands': 'created_at',
      'alerts': 'created_at',
      'config_history': 'deployed_at', // Special handling below
    };

    for (const table of tables) {
      if (!allowedTables[table]) {
        logger.warn(`Cleanup skipped for unauthorized table: ${table}`);
        continue;
      }

      let result;

      // Special handling for config_history: keep N versions per site
      if (table === 'config_history' && config.keep_versions) {
        result = await this.cleanupConfigHistory(config.keep_versions);
      } else {
        // Standard time-based cleanup
        const olderThanDays = config.older_than_days || 30;
        const dateColumn = allowedTables[table];

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
      },
    };
  }

  /**
   * Cleanup config_history keeping only the N most recent versions per site
   * Handles self-referential FK (previous_version_id) by nullifying references first
   */
  private async cleanupConfigHistory(keepVersions: number): Promise<{ rowCount: number }> {
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

  /**
   * Exécute une vérification des objectifs
   */
  private async executeObjectiveCheckTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
    const config = schedule.task_config as {
      check_type?: string;
      send_alerts?: boolean;
    };

    // Vérifier si la table club_objectives existe
    try {
      const objectivesResult = await query<{
        id: string;
        site_id: string;
        site_name: string;
        name: string;
        metric_type: string;
        target_value: number;
        current_value: number;
        progress_percent: number;
      }>(
        `SELECT
          co.id,
          co.site_id,
          s.name as site_name,
          co.name,
          co.metric_type,
          co.target_value,
          COALESCE(cop.current_value, 0) as current_value,
          COALESCE(cop.progress_percent, 0) as progress_percent
         FROM club_objectives co
         JOIN sites s ON s.id = co.site_id
         LEFT JOIN club_objectives_progress cop ON cop.objective_id = co.id
           AND cop.period_date = CURRENT_DATE
         WHERE co.status = 'active'
           AND co.start_date <= CURRENT_DATE
           AND (co.end_date IS NULL OR co.end_date >= CURRENT_DATE)`,
        []
      );

      const atRiskObjectives = objectivesResult.rows.filter(o => o.progress_percent < 50);
      const achievedObjectives = objectivesResult.rows.filter(o => o.progress_percent >= 100);

      // Envoyer des alertes si configuré
      if (config.send_alerts && atRiskObjectives.length > 0) {
        // TODO: Envoyer des notifications pour les objectifs à risque
        logger.info(`${atRiskObjectives.length} objectives at risk`);
      }

      return {
        success: true,
        message: `Checked ${objectivesResult.rows.length} objectives`,
        details: {
          total: objectivesResult.rows.length,
          atRisk: atRiskObjectives.length,
          achieved: achievedObjectives.length,
        },
      };
    } catch (error) {
      // Table n'existe peut-être pas encore
      if (error instanceof Error && error.message.includes('club_objectives')) {
        return { success: true, message: 'Objectives table not yet created, skipping' };
      }
      throw error;
    }
  }

  /**
   * Exécute une tâche d'agrégation
   */
  private async executeAggregationTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
    // Appeler la fonction d'agrégation des stats quotidiennes
    try {
      await query(`SELECT calculate_all_daily_stats(CURRENT_DATE - 1)`, []);
      return {
        success: true,
        message: 'Daily stats aggregation completed',
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('calculate_all_daily_stats')) {
        return { success: true, message: 'Aggregation function not found, skipping' };
      }
      throw error;
    }
  }

  /**
   * Exécute une tâche de backup (placeholder)
   */
  private async executeBackupTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
    // TODO: Implémenter la logique de backup
    return {
      success: true,
      message: 'Backup task not yet implemented',
    };
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

    // Mettre à jour le schedule
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

    // Mettre à jour le schedule
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
      // Recharger le job si activé, sinon l'arrêter
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

    // Créer une exécution temporaire pour le tracking
    const executionId = await this.startExecution(id);
    const startTime = Date.now();

    try {
      let result: ExecutionResult;

      switch (schedule.task_type) {
        case 'report':
          result = await this.executeReportTask(schedule);
          break;
        case 'cleanup':
          result = await this.executeCleanupTask(schedule);
          break;
        case 'objective_check':
          result = await this.executeObjectiveCheckTask(schedule);
          break;
        case 'aggregation':
          result = await this.executeAggregationTask(schedule);
          break;
        case 'backup':
          result = await this.executeBackupTask(schedule);
          break;
        default:
          result = { success: false, message: `Unknown task type: ${schedule.task_type}` };
      }

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

    // Si actif, planifier immédiatement
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
      // Reconfigurer le job
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
    // Arrêter le job s'il existe
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
