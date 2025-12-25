import { query } from '../config/database';
import deploymentService from './deployment.service';
import logger from '../config/logger';

// Configuration du scheduler
const SCHEDULER_CONFIG = {
  checkIntervalMs: 60 * 1000,  // Verifier toutes les minutes
  enabled: true,
};

interface ScheduledDeployment {
  deployment_type: 'content' | 'update';
  deployment_id: string;
  scheduled_at: Date;
}

class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /**
   * Demarre le scheduler
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Scheduler already running');
      return;
    }

    if (!SCHEDULER_CONFIG.enabled) {
      logger.info('Scheduler is disabled');
      return;
    }

    logger.info('Starting deployment scheduler', {
      checkInterval: `${SCHEDULER_CONFIG.checkIntervalMs / 1000}s`
    });

    // Executer immediatement au demarrage
    this.processScheduledDeployments();

    // Puis periodiquement
    this.intervalId = setInterval(() => {
      this.processScheduledDeployments();
    }, SCHEDULER_CONFIG.checkIntervalMs);
  }

  /**
   * Arrete le scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Scheduler stopped');
    }
  }

  /**
   * Traite les deploiements planifies qui sont dus
   */
  private async processScheduledDeployments(): Promise<void> {
    // Eviter les executions concurrentes
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Recuperer les deploiements planifies et dus
      const result = await query<ScheduledDeployment>(
        `SELECT * FROM get_scheduled_deployments_due()`,
        []
      );

      if (result.rows.length === 0) {
        return;
      }

      logger.info('Processing scheduled deployments', { count: result.rows.length });

      for (const deployment of result.rows) {
        await this.executeScheduledDeployment(deployment);
      }
    } catch (error) {
      // Si la fonction n'existe pas encore (migration non executee), on log un warning
      if (error instanceof Error && error.message.includes('get_scheduled_deployments_due')) {
        logger.debug('Scheduler: migration not yet applied, skipping');
      } else {
        logger.error('Error processing scheduled deployments:', error);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute un deploiement planifie
   */
  private async executeScheduledDeployment(deployment: ScheduledDeployment): Promise<void> {
    const { deployment_type, deployment_id } = deployment;

    try {
      logger.info('Executing scheduled deployment', {
        type: deployment_type,
        id: deployment_id,
        scheduledAt: deployment.scheduled_at
      });

      if (deployment_type === 'content') {
        // Passer le statut de 'scheduled' a 'pending' puis demarrer
        await query(
          `UPDATE content_deployments
           SET status = 'pending', started_at = NOW()
           WHERE id = $1 AND status = 'scheduled'`,
          [deployment_id]
        );

        // Demarrer le deploiement
        await deploymentService.startDeployment(deployment_id);

      } else if (deployment_type === 'update') {
        // Pour les mises a jour logicielles
        await query(
          `UPDATE update_deployments
           SET status = 'pending', started_at = NOW()
           WHERE id = $1 AND status = 'scheduled'`,
          [deployment_id]
        );

        // TODO: Implementer updateDeploymentService.startDeployment()
        logger.info('Update deployment scheduled execution not yet implemented', {
          deploymentId: deployment_id
        });
      }

    } catch (error) {
      logger.error('Error executing scheduled deployment:', {
        type: deployment_type,
        id: deployment_id,
        error
      });

      // Marquer comme echoue
      const table = deployment_type === 'content' ? 'content_deployments' : 'update_deployments';
      await query(
        `UPDATE ${table}
         SET status = 'failed', error_message = $1, completed_at = NOW()
         WHERE id = $2`,
        [`Scheduler error: ${error instanceof Error ? error.message : 'Unknown error'}`, deployment_id]
      );
    }
  }

  /**
   * Planifie un deploiement de contenu
   */
  async scheduleContentDeployment(
    deploymentId: string,
    scheduledAt: Date,
    scheduledBy: string
  ): Promise<void> {
    await query(
      `UPDATE content_deployments
       SET status = 'scheduled', scheduled_at = $1, scheduled_by = $2
       WHERE id = $3 AND status = 'pending'`,
      [scheduledAt, scheduledBy, deploymentId]
    );

    logger.info('Content deployment scheduled', {
      deploymentId,
      scheduledAt,
      scheduledBy
    });
  }

  /**
   * Annule la planification d'un deploiement
   */
  async cancelScheduledDeployment(
    deploymentId: string,
    deploymentType: 'content' | 'update'
  ): Promise<boolean> {
    const table = deploymentType === 'content' ? 'content_deployments' : 'update_deployments';

    const result = await query(
      `UPDATE ${table}
       SET status = 'cancelled', scheduled_at = NULL, completed_at = NOW()
       WHERE id = $1 AND status = 'scheduled'
       RETURNING id`,
      [deploymentId]
    );

    const cancelled = result.rowCount ? result.rowCount > 0 : false;

    if (cancelled) {
      logger.info('Scheduled deployment cancelled', {
        deploymentId,
        type: deploymentType
      });
    }

    return cancelled;
  }

  /**
   * Recupere les deploiements planifies a venir
   */
  async getUpcomingScheduledDeployments(limit = 50): Promise<{
    content: Array<{
      id: string;
      video_id: string;
      target_type: string;
      target_id: string;
      scheduled_at: Date;
      scheduled_by: string;
    }>;
    updates: Array<{
      id: string;
      update_id: string;
      target_type: string;
      target_id: string;
      scheduled_at: Date;
      scheduled_by: string;
    }>;
  }> {
    const [contentResult, updateResult] = await Promise.all([
      query(
        `SELECT id, video_id, target_type, target_id, scheduled_at, scheduled_by
         FROM content_deployments
         WHERE status = 'scheduled' AND scheduled_at IS NOT NULL
         ORDER BY scheduled_at ASC
         LIMIT $1`,
        [limit]
      ),
      query(
        `SELECT id, update_id, target_type, target_id, scheduled_at, scheduled_by
         FROM update_deployments
         WHERE status = 'scheduled' AND scheduled_at IS NOT NULL
         ORDER BY scheduled_at ASC
         LIMIT $1`,
        [limit]
      )
    ]);

    return {
      content: contentResult.rows as any[],
      updates: updateResult.rows as any[]
    };
  }
}

export default new SchedulerService();
