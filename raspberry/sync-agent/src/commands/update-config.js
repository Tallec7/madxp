const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');
const { mergeConfigurations, calculateConfigHash } = require('../utils/config-merge');
const { atomicWriteJson, safeReadConfig } = require('../utils/safe-config-io');

const execAsync = util.promisify(exec);

/**
 * Met à jour la configuration avec merge intelligent
 *
 * Modes supportés :
 * - mode: 'merge' (défaut) - Fusionne le contenu NEOPRO avec la config locale
 * - mode: 'replace' - Remplace entièrement (ancien comportement, pour migration)
 * - mode: 'fix_permissions' - Corrige les permissions des dossiers
 *
 * @param {Object} data - { neoProContent, mode?, configuration? }
 */
async function updateConfig(data) {
  // Mode spécial : correction des permissions
  if (data.mode === 'fix_permissions' || data.fixPermissions) {
    return await fixPermissions();
  }

  logger.info('Updating configuration', { mode: data.mode || 'merge' });

  try {
    const configPath = config.paths.root + '/webapp/configuration.json';
    const backupPath = config.paths.root + '/webapp/configuration.backup.json';

    // Lire la configuration locale actuelle
    let localConfig = await safeReadConfig(configPath);

    // Créer un backup avant modification
    await atomicWriteJson(backupPath, localConfig);
    logger.info('Backup created', { path: backupPath });

    let finalConfig;
    const contentToApply = data.neoProContent || data.configuration;

    if (!contentToApply) {
      throw new Error('Missing neoProContent or configuration in update_config command');
    }

    if (data.mode === 'replace') {
      finalConfig = applyReplaceMode(localConfig, contentToApply);
    } else {
      // Mode merge (défaut)
      const hashBefore = calculateConfigHash(localConfig);
      finalConfig = mergeConfigurations(localConfig, contentToApply);
      const hashAfter = calculateConfigHash(finalConfig);

      logger.info('Configuration merged', {
        hashBefore,
        hashAfter,
        changed: hashBefore !== hashAfter,
      });
    }

    // Écrire la configuration fusionnée (atomic write)
    await atomicWriteJson(configPath, finalConfig);
    logger.info('Configuration written to', { path: configPath });

    // Notifier l'application locale du changement
    await notifyLocalApp();

    logger.info('Configuration updated successfully');

    return {
      success: true,
      hash: calculateConfigHash(finalConfig),
      mode: data.mode || 'merge',
    };
  } catch (error) {
    logger.error('Configuration update failed:', error);
    throw error;
  }
}

/**
 * Applique le mode replace (remplacement des champs envoyés)
 */
function applyReplaceMode(localConfig, contentToApply) {
  logger.info('Using replace mode - replacing content fields');
  const finalConfig = { ...localConfig };

  // Remplacer les champs de contenu envoyés
  if (contentToApply.sponsors !== undefined) {
    finalConfig.sponsors = contentToApply.sponsors;
  }
  if (contentToApply.categories !== undefined) {
    finalConfig.categories = contentToApply.categories;
  }
  if (contentToApply.timeCategories !== undefined) {
    finalConfig.timeCategories = contentToApply.timeCategories;
  }
  if (contentToApply.categoryMappings !== undefined) {
    finalConfig.categoryMappings = contentToApply.categoryMappings;
  }
  if (contentToApply.liveScoreEnabled !== undefined) {
    finalConfig.liveScoreEnabled = contentToApply.liveScoreEnabled;
  }
  if (contentToApply.scoreOverlay !== undefined) {
    finalConfig.scoreOverlay = contentToApply.scoreOverlay;
  }
  if (contentToApply.watermark !== undefined) {
    finalConfig.watermark = contentToApply.watermark;
  }

  // Gérer remotePassword et clubName pour l'authentification /remote
  if (contentToApply.remotePassword !== undefined || contentToApply.clubName !== undefined) {
    finalConfig.auth = finalConfig.auth || {};
    if (contentToApply.remotePassword) {
      finalConfig.auth.password = contentToApply.remotePassword;
      logger.info('Remote password updated');
    }
    if (contentToApply.clubName) {
      finalConfig.auth.clubName = contentToApply.clubName;
      logger.info('Club name updated in auth section');
    }
  }

  logger.info('Configuration replaced', {
    sponsorsCount: finalConfig.sponsors?.length || 0,
    categoriesCount: finalConfig.categories?.length || 0,
  });

  return finalConfig;
}

/**
 * Notifie l'application locale du changement de configuration
 */
async function notifyLocalApp() {
  const localSocket = require('../services/local-socket');
  localSocket.emit('config_updated');
  logger.info('Local server notified of config change');
}

/**
 * Corrige les permissions des dossiers neopro
 */
async function fixPermissions() {
  logger.info('Fixing permissions on neopro directories');
  try {
    const rootPath = config.paths.root;
    await execAsync(`sudo chown -R pi:pi ${rootPath}/webapp`);
    await execAsync(`sudo chown -R pi:pi ${rootPath}/server`);
    await execAsync(`sudo chown -R pi:pi ${rootPath}/sync-agent`);
    await execAsync(`sudo chown -R pi:pi ${rootPath}/admin 2>/dev/null || true`);
    await execAsync(`sudo chown -R pi:pi ${rootPath}/videos 2>/dev/null || true`);
    await execAsync('sudo usermod -a -G pi www-data 2>/dev/null || true');
    logger.info('Permissions fixed successfully');
    return { success: true, message: 'Permissions fixed' };
  } catch (error) {
    logger.error('Failed to fix permissions:', error);
    throw error;
  }
}

module.exports = updateConfig;
