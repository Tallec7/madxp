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
import { metricsService } from '../services/metrics.service';
import { canaryMonitorService } from '../services/canary-monitor.service';
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
    const { deploymentId, videoId, progress: progressValue, completed, error, deployedPath, deployedFilename } = progress;

    let resolvedStatus: string = 'in_progress';
    let resolvedDeployedCount = 0;

    if (deploymentId) {
      // Auto-complete if progress >= 100 even without explicit completed flag
      // (Socket.IO fire-and-forget can lose the completed:true signal)
      const isCompletedByProgress =
        typeof progressValue === 'number' && Number.isFinite(progressValue) && progressValue >= 100;

      if (error) {
        await query(
          `UPDATE content_deployments
           SET status = 'failed', error_message = $1, completed_at = NOW()
           WHERE id = $2`,
          [error, deploymentId]
        );
        resolvedStatus = 'failed';
      } else if (completed || isCompletedByProgress) {
        await query(
          `UPDATE content_deployments
           SET status = 'completed', progress = 100, completed_at = NOW(),
               deployed_path = COALESCE($2, deployed_path),
               deployed_filename = COALESCE($3, deployed_filename)
           WHERE id = $1`,
          [deploymentId, deployedPath || null, deployedFilename || null]
        );
        resolvedStatus = 'completed';
        const depRow = await query<{ target_type: string; target_id: string }>(
          `SELECT target_type, target_id FROM content_deployments WHERE id = $1`,
          [deploymentId]
        );
        if (depRow.rows.length > 0) {
          const { target_type, target_id } = depRow.rows[0];
          if (target_type === 'site') {
            resolvedDeployedCount = 1;
          } else if (target_type === 'group') {
            const countRow = await query<{ cnt: number }>(
              `SELECT COUNT(*)::int as cnt FROM site_groups WHERE group_id = $1`,
              [target_id]
            );
            resolvedDeployedCount = countRow.rows[0]?.cnt ?? 0;
          }
        }
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

    metricsService.recordDeployProgressEvent('content', resolvedStatus);

    // Broadcast progress to dashboard
    const io = ctx.getIO();
    if (io) {
      io.to('dashboard').emit('deploy_progress', {
        siteId,
        deploymentId,
        progress: progressValue,
        deployedCount: resolvedDeployedCount,
        status: resolvedStatus,
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
    const { deploymentId, progress: progressValue, completed, error, version, steps } = progress;

    logger.info('Update progress received', {
      siteId,
      deploymentId,
      progress: progressValue,
      completed,
      error,
      version,
    });

    metricsService.recordDeployProgressEvent('update', error ? 'failed' : completed ? 'completed' : 'in_progress');

    const updateService = await getUpdateDeploymentService();
    const isCompletedByProgress =
      typeof progressValue === 'number' && Number.isFinite(progressValue) && progressValue >= 100;

    let resolvedStatus: string = 'in_progress';
    let resolvedDeployedCount = 0;

    if (deploymentId) {
      if (error) {
        await updateService.handleDeploymentResult(deploymentId as string, siteId, false, error as string);
        resolvedStatus = 'failed';
        // Store partial OTA steps on failure too (shows which steps succeeded before crash)
        if (Array.isArray(steps) && steps.length > 0) {
          await query(
            `UPDATE update_deployments SET deployment_details = $1 WHERE id = $2`,
            [JSON.stringify(steps), deploymentId]
          );
        }
      } else if (completed || isCompletedByProgress) {
        await updateService.handleDeploymentResult(deploymentId as string, siteId, true);
        resolvedStatus = 'completed';
        const depRow = await query<{ target_type: string; target_id: string }>(
          `SELECT target_type, target_id FROM update_deployments WHERE id = $1`,
          [deploymentId]
        );
        if (depRow.rows.length > 0) {
          const { target_type, target_id } = depRow.rows[0];
          if (target_type === 'site') {
            resolvedDeployedCount = 1;
          } else if (target_type === 'group') {
            const countRow = await query<{ cnt: number }>(
              `SELECT COUNT(*)::int as cnt FROM site_groups WHERE group_id = $1`,
              [target_id]
            );
            resolvedDeployedCount = countRow.rows[0]?.cnt ?? 0;
          }
        }

        // Start canary health watch for the deployed site
        canaryMonitorService.startWatch(
          deploymentId as string,
          siteId,
          (version as string) || 'unknown'
        );

        // Store structured OTA step report if provided
        if (Array.isArray(steps) && steps.length > 0) {
          await query(
            `UPDATE update_deployments SET deployment_details = $1 WHERE id = $2`,
            [JSON.stringify(steps), deploymentId]
          );
        }
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
        deployedCount: resolvedDeployedCount,
        status: resolvedStatus,
        completed,
        error,
        version,
        ...(Array.isArray(steps) && steps.length > 0 ? { steps } : {}),
      });
    }
  } catch (err) {
    logger.error('Error handling update progress:', err);
  }
}
