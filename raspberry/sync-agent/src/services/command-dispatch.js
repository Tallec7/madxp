/**
 * Command Dispatch — command execution, queue management.
 * Extracted from agent.js (ADR-044).
 */

const logger = require('../logger');
const commands = require('../commands');
const offlineQueue = require('./offline-queue');

/**
 * Handle an incoming command from the central server.
 * @param {object} agent - NeoproSyncAgent instance
 * @param {object} cmd - Command payload { id, type, data }
 */
async function handleCommand(agent, cmd) {
  const { id, type, data } = cmd;
  const { config } = require('../config');

  logger.info('📥 Command received', { commandId: id, type });

  if (!config.security.allowedCommands.includes(type)) {
    logger.warn('Command not allowed', { type, allowedCommands: config.security.allowedCommands });

    agent.socket.emit('command_result', {
      commandId: id,
      status: 'error',
      error: `Command type '${type}' is not allowed`,
    });

    return;
  }

  try {
    const handler = commands[type];

    if (!handler) {
      throw new Error(`Unknown command type: ${type}`);
    }

    let result;

    if (type === 'deploy_video') {
      result = await handler.execute(data, (progress) => {
        agent.socket.emit('deploy_progress', {
          deploymentId: data.deploymentId,
          videoId: data.videoId,
          progress,
        });
      });
      // Signaler la fin du déploiement avec le chemin réel sur le Pi
      // Construire le chemin relatif à partir des données réelles (category/subcategory/finalFilename)
      const deployedSegments = ['videos', data.category];
      if (data.subcategory) deployedSegments.push(data.subcategory);
      if (result?.filename) deployedSegments.push(result.filename);
      agent.socket.emit('deploy_progress', {
        deploymentId: data.deploymentId,
        videoId: data.videoId,
        progress: 100,
        completed: true,
        deployedPath: result?.filename ? deployedSegments.join('/') : undefined,
        deployedFilename: result?.filename || undefined,
      });
    } else if (type === 'update_software') {
      // Pause config-watcher during OTA to avoid event spam (11x duplicate syncs)
      if (agent.configWatcher) {
        agent.configWatcher.pause(120000); // 2 min — covers the full OTA duration
      }
      result = await handler.execute(data, (progress) => {
        agent.socket.emit('update_progress', {
          deploymentId: data.deploymentId,
          version: data.version,
          progress,
        });
      });
      // Signaler la fin du déploiement (identique à deploy_video)
      // IMPORTANT: Émis AVANT le command_result et le restart du sync-agent
      // pour garantir que le serveur central marque le déploiement comme terminé
      agent.socket.emit('update_progress', {
        deploymentId: data.deploymentId,
        version: data.version,
        progress: 100,
        completed: true,
        steps: result?.steps || [],
      });
      // Laisser le temps à Socket.IO de flush l'event avant le restart
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else if (typeof handler === 'function') {
      result = await handler(data);
    } else {
      result = await handler.execute(data);
    }

    logger.info('✅ Command executed successfully', { commandId: id, type });

    agent.socket.emit('command_result', {
      commandId: id,
      status: 'success',
      result,
    });
  } catch (error) {
    logger.error('❌ Command execution failed', {
      commandId: id,
      type,
      error: error.message,
      stack: error.stack,
    });

    // Notify server of deployment failure so dashboard shows 'failed' instead of stuck 'in_progress'
    if (type === 'deploy_video' && data.deploymentId) {
      agent.socket.emit('deploy_progress', {
        deploymentId: data.deploymentId,
        videoId: data.videoId,
        error: error.message,
      });
    } else if (type === 'update_software' && data.deploymentId) {
      agent.socket.emit('update_progress', {
        deploymentId: data.deploymentId,
        version: data.version,
        error: error.message,
        steps: error.steps || [],
      });
    }

    agent.socket.emit('command_result', {
      commandId: id,
      status: 'error',
      error: error.message,
    });
  }
}

/**
 * Queue a command for later execution.
 * If connected and not forced, executes immediately.
 * @param {object} agent - NeoproSyncAgent instance
 * @param {string} commandType - Type of command
 * @param {object} commandData - Command data
 * @param {object} options - Options (priority, forceQueue, etc.)
 * @returns {Promise<string|null>} Queue ID or null if executed immediately
 */
async function queueCommand(agent, commandType, commandData, options = {}) {
  // Si connecté et pas de force_queue, exécuter immédiatement
  if (agent.connected && !options.forceQueue) {
    try {
      const handler = commands[commandType];
      if (handler) {
        logger.info('Executing command immediately (connected)', { type: commandType });
        if (typeof handler === 'function') {
          await handler(commandData);
        } else {
          await handler.execute(commandData);
        }
        return null; // Pas de queue ID car exécuté immédiatement
      }
    } catch (error) {
      logger.warn('Immediate execution failed, queueing command', {
        type: commandType,
        error: error.message,
      });
    }
  }

  // Mettre en queue
  return offlineQueue.enqueue(commandType, commandData, options);
}

/**
 * Get the current offline queue status.
 * @param {object} agent - NeoproSyncAgent instance
 * @returns {Promise<object>}
 */
async function getQueueStatus(agent) {
  return {
    connected: agent.connected,
    queueStats: await offlineQueue.getStats(),
  };
}

module.exports = {
  handleCommand,
  queueCommand,
  getQueueStatus,
};
