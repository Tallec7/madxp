/**
 * Deploy Progress Handler — Tracks content and software deployment progress.
 *
 * Receives progress events from Raspberry Pi agents during video deployment
 * and software update operations. Updates deployment status in DB and
 * broadcasts progress to connected dashboards.
 *
 * @see socket-context.ts for SocketContext interface
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { SocketContext } from './socket-context';

// Lazy import to avoid circular dependency
let updateDeploymentService: {
  handleDeploymentResult: (deploymentId: string, siteId: string, success: boolean, errorMessage?: string) => Promise<void>;
  updateProgress: (deploymentId: string, progress: number) => Promise<void>;
} | null = null;

const getUpdateDeploymentService = async () => {
  if (!updateDeploymentService) {
    const module = await import('../services/update-deployment.service');
    updateDeploymentService = module.default;
  }
  return updateDeploymentService;
};

/**
 * Handle content deployment progress from a Raspberry Pi.
 * Updates content_deployments table and broadcasts to dashboard.
 */
export async function handleDeployProgress(
  ctx: SocketContext,
  siteId: string,
  progress: Record<string, unknown>
): Promise<void> {
  try {
    const { deploymentId, videoId, progress: progressValue, completed, error } = progress;

    if (deploymentId) {
      if (error) {
        await query(
          `UPDATE content_deployments
           SET status = 'failed', error_message = $1, completed_at = NOW()
           WHERE id = $2`,
          [error, deploymentId]
        );
      } else if (completed) {
        await query(
          `UPDATE content_deployments
           SET status = 'completed', progress = 100, completed_at = NOW()
           WHERE id = $1`,
          [deploymentId]
        );
      } else {
        await query(
          `UPDATE content_deployments
           SET progress = $1, status = 'in_progress'
           WHERE id = $2`,
          [Math.round((progressValue as number) || 0), deploymentId]
        );
      }
    } else if (videoId) {
      // Fallback: mise à jour par videoId
      await query(
        `UPDATE content_deployments
         SET progress = $1, status = 'in_progress'
         WHERE video_id = $2 AND (target_id = $3 OR target_id IN (
           SELECT group_id FROM site_groups WHERE site_id = $3
         ))`,
        [Math.round((progressValue as number) || 0), videoId, siteId]
      );
    }

    // Broadcast progress to dashboard
    const io = ctx.getIO();
    if (io) {
      io.to('dashboard').emit('deploy_progress', {
        siteId,
        deploymentId,
        progress: progressValue,
        completed,
        error,
        ...progress,
      });
    }
  } catch (err) {
    logger.error('Error handling deploy progress:', err);
  }
}

/**
 * Handle software update progress from a Raspberry Pi.
 * Delegates to update-deployment.service and broadcasts to dashboard.
 */
export async function handleUpdateProgress(
  ctx: SocketContext,
  siteId: string,
  progress: Record<string, unknown>
): Promise<void> {
  try {
    const { deploymentId, progress: progressValue, completed, error, version } = progress;

    logger.info('Update progress received', {
      siteId,
      deploymentId,
      progress: progressValue,
      completed,
      error,
      version,
    });

    const updateService = await getUpdateDeploymentService();
    const isCompletedByProgress =
      typeof progressValue === 'number' && Number.isFinite(progressValue) && progressValue >= 100;

    if (deploymentId) {
      if (error) {
        await updateService.handleDeploymentResult(deploymentId as string, siteId, false, error as string);
      } else if (completed || isCompletedByProgress) {
        await updateService.handleDeploymentResult(deploymentId as string, siteId, true);
      } else {
        await updateService.updateProgress(deploymentId as string, (progressValue as number) || 0);
      }
    }

    // Broadcast progress to dashboard
    const io = ctx.getIO();
    if (io) {
      io.to('dashboard').emit('update_progress', {
        siteId,
        deploymentId,
        progress: progressValue,
        completed,
        error,
        version,
      });
    }
  } catch (err) {
    logger.error('Error handling update progress:', err);
  }
}
