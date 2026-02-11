/**
 * Command Dispatch Handler — Sends commands to Pi and handles results.
 *
 * Manages the lifecycle of commands sent to Raspberry Pi agents:
 * sending, tracking pending commands, timeout enforcement,
 * result processing, and zombie connection cleanup during sends.
 *
 * @see socket-context.ts for SocketContext interface
 */

import { query } from '../config/database';
import { CommandMessage, CommandResult } from '../types';
import logger from '../config/logger';
import metricsService from '../services/metrics.service';
import { SocketContext } from './socket-context';
import { cleanupZombieConnection } from './health-monitor.handler';

// Lazy import to avoid circular dependency
let updateDeploymentServiceForResult: {
  handleDeploymentResult: (deploymentId: string, siteId: string, success: boolean, errorMessage?: string) => Promise<void>;
} | null = null;

const getUpdateDeploymentService = async () => {
  if (!updateDeploymentServiceForResult) {
    const module = await import('../services/update-deployment.service');
    updateDeploymentServiceForResult = module.default;
  }
  return updateDeploymentServiceForResult;
};

// Configuration des timeouts par type de commande (en ms)
export const COMMAND_TIMEOUTS: Record<string, number> = {
  deploy_video: 10 * 60 * 1000,      // 10 minutes pour les gros fichiers
  update_config: 30 * 1000,           // 30 secondes
  update_software: 15 * 60 * 1000,    // 15 minutes pour les mises à jour
  reboot: 60 * 1000,                  // 1 minute
  restart_service: 60 * 1000,         // 1 minute
  get_logs: 30 * 1000,                // 30 secondes
  get_system_info: 15 * 1000,         // 15 secondes
  get_config: 15 * 1000,              // 15 secondes
  update_hotspot: 60 * 1000,          // 1 minute
  get_hotspot_config: 15 * 1000,      // 15 secondes
  network_diagnostics: 30 * 1000,     // 30 secondes pour les tests réseau
  default: 2 * 60 * 1000,             // 2 minutes par défaut
};

// Memory safety limit
export const MAX_PENDING_COMMANDS = 100;

type ConfigCommandData = {
  configVersionId?: string;
} & Record<string, unknown>;

/**
 * Send a command to a connected Raspberry Pi.
 * Validates connection health before sending.
 *
 * @returns true if the command was sent, false if the site is not connected or unhealthy
 */
export function sendCommand(
  ctx: SocketContext,
  siteId: string,
  command: CommandMessage
): boolean {
  const socket = ctx.connectedSites.get(siteId);

  if (!socket) {
    logger.warn('Cannot send command: site not in connectedSites map', { siteId });
    return false;
  }

  if (!socket.connected) {
    logger.warn('Cannot send command: socket exists but not connected (zombie)', {
      siteId,
      socketId: socket.id,
      commandType: command.type,
    });
    cleanupZombieConnection(ctx, siteId, socket);
    return false;
  }

  // Vérifier la fraîcheur du dernier pong
  const lastPong = ctx.lastPongReceived.get(siteId);
  const now = Date.now();
  if (lastPong && (now - lastPong) > 60000) {
    logger.warn('Cannot send command: last pong too old (stale connection)', {
      siteId,
      lastPongAgeMs: now - lastPong,
      commandType: command.type,
    });
    cleanupZombieConnection(ctx, siteId, socket);
    return false;
  }

  // Déterminer le timeout pour ce type de commande
  const timeoutMs = COMMAND_TIMEOUTS[command.type] || COMMAND_TIMEOUTS.default;

  // Enregistrer la commande comme en attente
  ctx.pendingCommands.set(command.id, {
    commandId: command.id,
    siteId,
    type: command.type,
    sentAt: Date.now(),
    timeoutMs,
  });

  socket.emit('command', command);
  metricsService.recordWebsocketMessage('outbound', command.type);
  logger.info('Command sent to agent', {
    siteId,
    commandId: command.id,
    type: command.type,
    timeoutMs,
  });

  return true;
}

/**
 * Send a command to multiple sites.
 * Returns success/failure counts.
 */
export function broadcastToGroup(
  ctx: SocketContext,
  siteIds: string[],
  command: CommandMessage
): { successCount: number; failureCount: number } {
  let successCount = 0;
  let failureCount = 0;

  for (const siteId of siteIds) {
    if (sendCommand(ctx, siteId, command)) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  logger.info('Command broadcasted to group', {
    commandId: command.id,
    type: command.type,
    successCount,
    failureCount,
  });

  return { successCount, failureCount };
}

/**
 * Handle a command result from a Raspberry Pi.
 * Updates DB, triggers config/update handlers, and broadcasts to dashboard.
 *
 * @param clearPendingConfigFn Callback to clear pending config (avoids circular handler import)
 */
export async function handleCommandResult(
  ctx: SocketContext,
  siteId: string,
  result: CommandResult,
  clearPendingConfigFn: (siteId: string, versionId: string) => Promise<void>
): Promise<void> {
  try {
    // Measure command latency before deleting from pending
    const pending = ctx.pendingCommands.get(result.commandId);
    if (pending) {
      const latencySeconds = (Date.now() - pending.sentAt) / 1000;
      metricsService.recordCommandLatency(pending.type, latencySeconds);
      metricsService.recordCommand(pending.type, result.status === 'success' ? 'success' : 'failed');
    }
    ctx.pendingCommands.delete(result.commandId);

    await query(
      `UPDATE remote_commands
       SET status = $1, result = $2, error_message = $3, completed_at = NOW()
       WHERE id = $4`,
      [
        result.status === 'success' ? 'completed' : 'failed',
        result.result ? JSON.stringify(result.result) : null,
        result.error || null,
        result.commandId,
      ]
    );

    const commandRow = await query<{ command_type: string; command_data: Record<string, unknown> | null }>(
      `SELECT command_type, command_data
       FROM remote_commands
       WHERE id = $1`,
      [result.commandId]
    );

    const commandRecord = commandRow.rows[0];
    const commandData = (commandRecord?.command_data as ConfigCommandData | null) || null;
    const configVersionId = typeof commandData?.configVersionId === 'string' ? commandData.configVersionId : null;
    const updateDeploymentId =
      commandData && typeof (commandData as Record<string, unknown>).deploymentId === 'string'
        ? String((commandData as Record<string, unknown>).deploymentId)
        : null;

    if (
      result.status === 'success' &&
      commandRecord?.command_type === 'update_config' &&
      configVersionId
    ) {
      await clearPendingConfigFn(siteId, configVersionId);
    }

    // Lever le blocage config_update_pending_until quand la commande est terminée
    if (commandRecord?.command_type === 'update_config') {
      await query(`UPDATE sites SET config_update_pending_until = NULL WHERE id = $1`, [siteId]);
      logger.info('Config update pending lock cleared after command result', { siteId, status: result.status });
    }

    if (commandRecord?.command_type === 'update_software' && updateDeploymentId) {
      const updateService = await getUpdateDeploymentService();
      if (result.status === 'success') {
        await updateService.handleDeploymentResult(updateDeploymentId, siteId, true);
      } else {
        await updateService.handleDeploymentResult(
          updateDeploymentId,
          siteId,
          false,
          result.error || 'Erreur inconnue'
        );
      }
    }

    logger.info('Command result received', {
      siteId,
      commandId: result.commandId,
      status: result.status,
      ...(result.status === 'error' && result.error ? { error: result.error } : {}),
    });

    const io = ctx.getIO();
    if (io) {
      io.to('dashboard').emit('command_completed', {
        siteId,
        commandId: result.commandId,
        commandType: commandRecord?.command_type,
        status: result.status,
        result: result.result || null,
        error: result.error || null,
      });
    }
  } catch (error) {
    logger.error('Error handling command result:', error);
  }
}

/**
 * Check for timed-out commands and enforce memory limits on pendingCommands Map.
 */
export async function checkCommandTimeouts(ctx: SocketContext): Promise<void> {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [commandId, pending] of ctx.pendingCommands.entries()) {
    const elapsed = now - pending.sentAt;

    if (elapsed >= pending.timeoutMs) {
      logger.warn('Command timeout reached', {
        commandId,
        siteId: pending.siteId,
        type: pending.type,
        timeoutMs: pending.timeoutMs,
        elapsedMs: elapsed,
      });

      try {
        await query(
          `UPDATE remote_commands
           SET status = 'failed', error_message = $1, completed_at = NOW()
           WHERE id = $2 AND status IN ('pending', 'executing')`,
          [`Command timeout after ${Math.round(elapsed / 1000)}s`, commandId]
        );

        const io = ctx.getIO();
        if (io) {
          io.to('dashboard').emit('command_timeout', {
            siteId: pending.siteId,
            commandId,
            type: pending.type,
          });
        }
      } catch (error) {
        logger.error('Error marking command as timed out:', { commandId, error });
      }

      ctx.pendingCommands.delete(commandId);
      cleanedCount++;
    }
  }

  // Memory safety: if Map is still too large, remove oldest entries
  if (ctx.pendingCommands.size > MAX_PENDING_COMMANDS) {
    const entries = Array.from(ctx.pendingCommands.entries())
      .sort((a, b) => a[1].sentAt - b[1].sentAt);

    const toRemove = entries.slice(0, ctx.pendingCommands.size - MAX_PENDING_COMMANDS);
    for (const [commandId, pending] of toRemove) {
      logger.warn('Removing old pending command due to memory limit', {
        commandId,
        siteId: pending.siteId,
        type: pending.type,
        ageMs: now - pending.sentAt,
      });
      ctx.pendingCommands.delete(commandId);
      cleanedCount++;

      query(
        `UPDATE remote_commands
         SET status = 'failed', error_message = 'Evicted from memory due to queue overflow', completed_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'executing')`,
        [commandId]
      ).catch((err) => logger.error('Error marking evicted command as failed:', err));
    }
  }

  if (cleanedCount > 0) {
    logger.info('Command timeout check completed', {
      cleanedCount,
      remainingPendingCommands: ctx.pendingCommands.size,
    });
  }
}
