const deployVideo = require('./deploy-video');
const deleteVideo = require('./delete-video');
const updateSoftware = require('./update-software');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');
const { mergeConfigurations, createBackup, calculateConfigHash } = require('../utils/config-merge');

const execAsync = util.promisify(exec);

const commands = {
  deploy_video: deployVideo,
  delete_video: deleteVideo,
  update_software: updateSoftware,

  /**
   * Met à jour la configuration avec merge intelligent
   *
   * Modes supportés :
   * - mode: 'merge' (défaut) - Fusionne le contenu NEOPRO avec la config locale
   * - mode: 'replace' - Remplace entièrement (ancien comportement, pour migration)
   *
   * @param {Object} data - { neoProContent, mode?, configuration? }
   */
  async update_config(data) {
    logger.info('Updating configuration', { mode: data.mode || 'merge' });

    try {
      const configPath = config.paths.root + '/webapp/configuration.json';
      const backupPath = config.paths.root + '/webapp/configuration.backup.json';

      // Lire la configuration locale actuelle
      let localConfig = {};
      if (await fs.pathExists(configPath)) {
        const localContent = await fs.readFile(configPath, 'utf8');
        localConfig = JSON.parse(localContent);
      }

      // Créer un backup avant modification
      await fs.writeFile(backupPath, JSON.stringify(localConfig, null, 2));
      logger.info('Backup created', { path: backupPath });

      let finalConfig;

      if (data.mode === 'replace' && data.configuration) {
        // Mode legacy : remplacement complet (pour rétrocompatibilité)
        logger.warn('Using legacy replace mode - local changes may be lost');
        finalConfig = data.configuration;
      } else if (data.neoProContent) {
        // Mode merge : fusionner le contenu NEOPRO avec la config locale
        const hashBefore = calculateConfigHash(localConfig);
        finalConfig = mergeConfigurations(localConfig, data.neoProContent);
        const hashAfter = calculateConfigHash(finalConfig);

        logger.info('Configuration merged', {
          hashBefore,
          hashAfter,
          changed: hashBefore !== hashAfter,
        });
      } else if (data.configuration) {
        // Fallback : ancien format (remplacement)
        logger.warn('Legacy configuration format detected, using merge');
        finalConfig = mergeConfigurations(localConfig, data.configuration);
      } else {
        throw new Error('Missing neoProContent or configuration in update_config command');
      }

      // Écrire la configuration fusionnée
      const configJson = JSON.stringify(finalConfig, null, 2);
      await fs.writeFile(configPath, configJson);
      logger.info('Configuration written to', { path: configPath });

      // Notifier l'application locale du changement
      const io = require('socket.io-client');
      const socket = io('http://localhost:3000', { timeout: 5000 });
      socket.emit('config_updated');
      setTimeout(() => socket.close(), 1000);

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
  },

  async reboot() {
    logger.warn('System reboot requested');

    setTimeout(async () => {
      try {
        await execAsync('sudo reboot');
      } catch (error) {
        logger.error('Reboot command failed:', error);
      }
    }, 2000);

    return { success: true, message: 'Rebooting in 2 seconds' };
  },

  async restart_service(data) {
    const { service } = data;

    logger.info('Restarting service', { service });

    try {
      await execAsync(`sudo systemctl restart ${service}`);

      await new Promise(resolve => setTimeout(resolve, 3000));

      const { stdout } = await execAsync(`sudo systemctl is-active ${service}`);

      if (stdout.trim() === 'active') {
        logger.info('Service restarted successfully', { service });
        return { success: true, status: 'active' };
      } else {
        throw new Error(`Service ${service} is not active after restart`);
      }
    } catch (error) {
      logger.error('Service restart failed:', error);
      throw error;
    }
  },

  async get_logs(data) {
    const { service, lines = 100 } = data;

    logger.info('Retrieving logs', { service, lines });

    try {
      let command;

      if (service === 'sync-agent') {
        command = `tail -n ${lines} ${config.logging.path}`;
      } else {
        command = `sudo journalctl -u ${service} -n ${lines} --no-pager`;
      }

      const { stdout } = await execAsync(command);

      return {
        success: true,
        logs: stdout,
      };
    } catch (error) {
      logger.error('Failed to retrieve logs:', error);
      throw error;
    }
  },

  async get_system_info() {
    logger.info('Retrieving system information');

    try {
      const metricsCollector = require('../metrics');
      const systemInfo = await metricsCollector.getSystemInfo();
      const networkStatus = await metricsCollector.getNetworkStatus();
      const metrics = await metricsCollector.collectAll();

      return {
        success: true,
        systemInfo,
        networkStatus,
        metrics,
      };
    } catch (error) {
      logger.error('Failed to retrieve system info:', error);
      throw error;
    }
  },

  async get_config() {
    logger.info('Retrieving site configuration');

    try {
      // Single source of truth: webapp/configuration.json (served by app :8080)
      const configPath = config.paths.root + '/webapp/configuration.json';

      if (!await fs.pathExists(configPath)) {
        logger.warn('Configuration file not found', { configPath });
        return {
          success: true,
          configuration: null,
          message: 'No configuration file found',
        };
      }

      const configContent = await fs.readFile(configPath, 'utf8');
      const configuration = JSON.parse(configContent);

      logger.info('Configuration retrieved successfully', { path: configPath });

      return {
        success: true,
        configuration,
      };
    } catch (error) {
      logger.error('Failed to retrieve configuration:', error);
      throw error;
    }
  },

  /**
   * Met à jour la configuration du hotspot WiFi (SSID et mot de passe)
   * Modifie /etc/hostapd/hostapd.conf et redémarre le service hostapd
   *
   * @param {Object} data - { ssid?, password? }
   */
  async update_hotspot(data) {
    const { ssid, password } = data;

    logger.info('Updating hotspot configuration', { ssid: ssid || '(unchanged)' });

    if (!ssid && !password) {
      throw new Error('At least one of ssid or password must be provided');
    }

    // Validation du mot de passe WiFi (WPA2 requiert 8-63 caractères)
    if (password && (password.length < 8 || password.length > 63)) {
      throw new Error('WiFi password must be between 8 and 63 characters');
    }

    // Validation du SSID (max 32 caractères)
    if (ssid && ssid.length > 32) {
      throw new Error('SSID must be 32 characters or less');
    }

    const hostapdPath = '/etc/hostapd/hostapd.conf';
    const backupPath = '/etc/hostapd/hostapd.conf.backup';

    try {
      // Vérifier que hostapd.conf existe
      if (!await fs.pathExists(hostapdPath)) {
        throw new Error('hostapd.conf not found - hotspot not configured on this device');
      }

      // Lire la configuration actuelle
      let hostapdContent = await fs.readFile(hostapdPath, 'utf8');

      // Créer un backup
      await execAsync(`sudo cp ${hostapdPath} ${backupPath}`);
      logger.info('Backup created', { path: backupPath });

      // Modifier le SSID si fourni
      if (ssid) {
        hostapdContent = hostapdContent.replace(/^ssid=.*/m, `ssid=${ssid}`);
        logger.info('SSID updated', { ssid });
      }

      // Modifier le mot de passe si fourni
      if (password) {
        hostapdContent = hostapdContent.replace(/^wpa_passphrase=.*/m, `wpa_passphrase=${password}`);
        logger.info('WiFi password updated');
      }

      // Écrire la nouvelle configuration (via sudo car fichier root)
      const tempPath = '/tmp/hostapd.conf.tmp';
      await fs.writeFile(tempPath, hostapdContent);
      await execAsync(`sudo mv ${tempPath} ${hostapdPath}`);
      await execAsync(`sudo chmod 600 ${hostapdPath}`);

      // Redémarrer hostapd pour appliquer les changements
      logger.info('Restarting hostapd service...');
      await execAsync('sudo systemctl restart hostapd');

      // Attendre que le service soit actif
      await new Promise(resolve => setTimeout(resolve, 3000));

      const { stdout } = await execAsync('sudo systemctl is-active hostapd');
      const isActive = stdout.trim() === 'active';

      if (!isActive) {
        // Restaurer le backup si le service ne démarre pas
        logger.error('hostapd failed to start, restoring backup');
        await execAsync(`sudo cp ${backupPath} ${hostapdPath}`);
        await execAsync('sudo systemctl restart hostapd');
        throw new Error('Failed to restart hostapd with new configuration - backup restored');
      }

      logger.info('Hotspot configuration updated successfully');

      return {
        success: true,
        message: 'Hotspot configuration updated',
        ssidUpdated: !!ssid,
        passwordUpdated: !!password,
      };
    } catch (error) {
      logger.error('Hotspot update failed:', error);
      throw error;
    }
  },

  /**
   * Récupère la configuration actuelle du hotspot (SSID uniquement, pas le mot de passe)
   */
  async get_hotspot_config() {
    logger.info('Retrieving hotspot configuration');

    const hostapdPath = '/etc/hostapd/hostapd.conf';

    try {
      if (!await fs.pathExists(hostapdPath)) {
        return {
          success: true,
          configured: false,
          message: 'Hotspot not configured on this device',
        };
      }

      const hostapdContent = await fs.readFile(hostapdPath, 'utf8');

      // Extraire le SSID
      const ssidMatch = hostapdContent.match(/^ssid=(.*)$/m);
      const ssid = ssidMatch ? ssidMatch[1] : null;

      // Extraire le channel
      const channelMatch = hostapdContent.match(/^channel=(.*)$/m);
      const channel = channelMatch ? parseInt(channelMatch[1]) : null;

      // Vérifier si hostapd est actif
      let isActive = false;
      try {
        const { stdout } = await execAsync('sudo systemctl is-active hostapd');
        isActive = stdout.trim() === 'active';
      } catch {
        isActive = false;
      }

      return {
        success: true,
        configured: true,
        ssid,
        channel,
        isActive,
      };
    } catch (error) {
      logger.error('Failed to retrieve hotspot config:', error);
      throw error;
    }
  },
};

module.exports = commands;
