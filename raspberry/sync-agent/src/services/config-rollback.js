/**
 * Config Rollback — save/restore configuration on risky network operations.
 * Extracted from network-watchdog.js (ADR-044).
 */

const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');

const ROLLBACK_TIMEOUT = 30 * 1000;

/**
 * @param {object} ctx - Shared context { state, socketRef, checkCloudHealth }
 */
async function saveRollbackPoint(ctx, operation, configPath = '/home/pi/neopro/webapp/configuration.json') {
  try {
    const configContent = await fs.readFile(configPath, 'utf8');
    ctx.state.rollback = {
      pending: true,
      config: configContent,
      timestamp: Date.now(),
      operation,
      configPath,
    };

    if (ctx.rollbackTimeout) {
      clearTimeout(ctx.rollbackTimeout);
    }

    ctx.rollbackTimeout = setTimeout(async () => {
      if (ctx.state.rollback.pending) {
        const cloudHealth = ctx.checkCloudHealth();
        if (cloudHealth.healthy) {
          logger.info('NetworkWatchdog: Connexion stable après opération, rollback annulé', {
            operation: ctx.state.rollback.operation,
          });
          clearRollbackPoint(ctx);
        } else {
          logger.warn('NetworkWatchdog: Connexion perdue après opération, exécution du rollback', {
            operation: ctx.state.rollback.operation,
          });
          await executeRollback(ctx);
        }
      }
    }, ROLLBACK_TIMEOUT);

    logger.info('NetworkWatchdog: Point de rollback sauvegardé', {
      operation,
      timeout: ROLLBACK_TIMEOUT,
    });

    return { success: true };
  } catch (error) {
    logger.error('NetworkWatchdog: Erreur lors de la sauvegarde du point de rollback', {
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

/**
 * @param {object} ctx - Shared context
 */
async function executeRollback(ctx) {
  if (!ctx.state.rollback.pending || !ctx.state.rollback.config) {
    logger.warn('NetworkWatchdog: Aucun rollback en attente');
    return { success: false, reason: 'no_pending_rollback' };
  }

  try {
    const { config: configContent, configPath, operation } = ctx.state.rollback;

    await fs.writeFile(configPath, configContent, 'utf8');

    logger.info('NetworkWatchdog: Rollback exécuté avec succès', {
      operation,
      configPath,
    });

    clearRollbackPoint(ctx);

    if (ctx.socketRef && ctx.socketRef.connected) {
      ctx.socketRef.emit('network_rollback', {
        siteId: config.site.id,
        operation,
        timestamp: new Date().toISOString(),
        reason: 'connection_lost_after_change',
      });
    }

    return { success: true };
  } catch (error) {
    logger.error('NetworkWatchdog: Erreur lors du rollback', {
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

/**
 * @param {object} ctx - Shared context
 */
function clearRollbackPoint(ctx) {
  if (ctx.rollbackTimeout) {
    clearTimeout(ctx.rollbackTimeout);
    ctx.rollbackTimeout = null;
  }
  ctx.state.rollback = {
    pending: false,
    config: null,
    timestamp: null,
    operation: null,
  };
}

/**
 * @param {object} ctx - Shared context
 */
function confirmOperation(ctx) {
  if (ctx.state.rollback.pending) {
    logger.info('NetworkWatchdog: Opération confirmée, rollback annulé', {
      operation: ctx.state.rollback.operation,
    });
    clearRollbackPoint(ctx);
  }
}

module.exports = {
  saveRollbackPoint,
  executeRollback,
  clearRollbackPoint,
  confirmOperation,
};
