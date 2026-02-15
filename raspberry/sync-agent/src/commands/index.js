// @ts-check
/** @typedef {import('../types').CommandData} CommandData */
/** @typedef {import('../types').CommandResult} CommandResult */

/**
 * Commands Index - Point d'entrée pour toutes les commandes du sync-agent
 *
 * Ce fichier orchestre les commandes en déléguant aux modules spécialisés.
 * Architecture modulaire : chaque domaine a son propre fichier.
 */

// === Modules de commandes existants ===
const deployVideo = require('./deploy-video');
const deleteVideo = require('./delete-video');
const updateSoftware = require('./update-software');
const remoteShell = require('./remote-shell');
const deployAsset = require('./deploy-asset');

// === Modules de commandes extraits (P2.4 refactoring) ===
const updateConfig = require('./update-config');
const { syncProfiles, switchProfile } = require('./sync-profiles');
const {
  runDiagnostics,
  runManualDiagnostics,
  getHealthStatus,
  getSystemInfo,
} = require('./diagnostics');
const {
  updateHotspot,
  getHotspotConfig,
  fixHotspot,
  runManualHotspotDiagnostics,
} = require('./hotspot');
const networkDiagnostics = require('./network-diagnostics');
const exportDebugBundle = require('./debug-bundle');
const { getAnalyticsBufferStatus } = require('./analytics-buffer');
const {
  getWifiBssidStatus,
  removeBssidLock,
  optimizeForMesh,
} = require('./wifi-bssid');
const {
  scanWifiNetworks,
  configureWifiClient,
} = require('./wifi-client');

// === Dépendances ===
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

/**
 * Objet commands - Registre de toutes les commandes disponibles
 *
 * Les commandes sont soit :
 * - Importées depuis des modules dédiés (deploy_video, update_config, etc.)
 * - Définies inline pour les commandes simples (reboot, restart_service, etc.)
 */
const commands = {
  // === Commandes déployées depuis modules dédiés ===
  deploy_video: deployVideo,
  delete_video: deleteVideo,
  update_software: updateSoftware,
  remote_shell: remoteShell,
  deploy_asset: deployAsset,

  // === Configuration (module: update-config.js) ===
  update_config: updateConfig,

  // === Profils multi-config (module: sync-profiles.js) ===
  sync_profiles: syncProfiles,
  switch_profile: switchProfile,

  // === Diagnostics (module: diagnostics.js) ===
  run_diagnostics: runDiagnostics,
  runManualDiagnostics: runManualDiagnostics,
  get_health_status: getHealthStatus,
  get_system_info: getSystemInfo,

  // === Hotspot (module: hotspot.js) ===
  update_hotspot: updateHotspot,
  get_hotspot_config: getHotspotConfig,
  fix_hotspot: fixHotspot,
  runManualHotspotDiagnostics: runManualHotspotDiagnostics,

  // === Réseau (module: network-diagnostics.js) ===
  network_diagnostics: networkDiagnostics,

  // === Debug (module: debug-bundle.js) ===
  export_debug_bundle: exportDebugBundle,

  // === Analytics (module: analytics-buffer.js) ===
  get_analytics_buffer_status: getAnalyticsBufferStatus,

  // === WiFi BSSID (module: wifi-bssid.js) ===
  get_wifi_bssid_status: getWifiBssidStatus,
  remove_bssid_lock: removeBssidLock,
  optimize_for_mesh: optimizeForMesh,

  // === WiFi Client Configuration (module: wifi-client.js) ===
  scan_wifi_networks: scanWifiNetworks,
  configure_wifi_client: configureWifiClient,

  // === Commandes simples (inline) ===

  /**
   * Redémarre le système
   */
  async reboot() {
    logger.warn('System reboot requested');

    // Use fire-and-forget exec (not execAsync) because:
    // 1. sudo reboot kills the system before the child process can return
    // 2. execAsync would reject (non-zero exit / signal) — the error was silently caught
    // 3. The command_result is already sent before the timeout fires
    setTimeout(() => {
      logger.info('Executing sudo reboot now...');
      exec('sudo reboot', (error) => {
        if (error) {
          logger.error('Reboot command failed:', { error: error.message });
        }
      });
    }, 2000);

    return { success: true, message: 'Rebooting in 2 seconds' };
  },

  /**
   * Redémarre un service systemd
   * @param {Object} data - { service: string, update?: boolean }
   */
  async restart_service(data) {
    const { service, update } = data;

    logger.info('Restarting service', { service, update: !!update });

    try {
      // Si update=true ou si c'est le sync-agent, faire un git pull avant de redémarrer
      if (update || service === 'neopro-sync-agent') {
        const syncAgentPath = config.paths.root + '/sync-agent';
        try {
          logger.info('Updating sync-agent before restart...');
          await execAsync(`cd ${syncAgentPath} && git pull`);
          logger.info('Sync-agent updated successfully');
        } catch (gitError) {
          logger.warn('Git pull failed, continuing with restart:', { error: gitError.message });
        }
      }

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
      logger.error('Service restart failed:', { error: error.message });
      throw error;
    }
  },

  /**
   * Récupère les logs d'un service
   * @param {Object} data - { service: string, lines?: number }
   */
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
      logger.error('Failed to retrieve logs:', { error: error.message });
      throw error;
    }
  },

  /**
   * Récupère la configuration du site
   */
  async get_config() {
    logger.info('Retrieving site configuration');

    try {
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
      logger.error('Failed to retrieve configuration:', { error: error.message });
      throw error;
    }
  },

  /**
   * Met à jour les paramètres du boîtier (langue, timezone)
   * @param {Object} data - { language?: 'fr'|'en'|'es', timezone?: string }
   */
  async update_settings(data) {
    const { language, timezone } = data;

    logger.info('Updating site settings', { language, timezone });

    if (!language && !timezone) {
      throw new Error('At least one of language or timezone must be provided');
    }

    const validLanguages = ['fr', 'en', 'es'];
    if (language && !validLanguages.includes(language)) {
      throw new Error(`Invalid language. Valid values: ${validLanguages.join(', ')}`);
    }

    try {
      const configPath = config.paths.root + '/webapp/configuration.json';

      if (!await fs.pathExists(configPath)) {
        throw new Error('Configuration file not found');
      }

      const configContent = await fs.readFile(configPath, 'utf8');
      const siteConfig = JSON.parse(configContent);

      siteConfig.settings = siteConfig.settings || { language: 'fr', timezone: 'Europe/Paris' };

      if (language) {
        siteConfig.settings.language = language;
      }
      if (timezone) {
        siteConfig.settings.timezone = timezone;
      }

      await fs.writeFile(configPath, JSON.stringify(siteConfig, null, 2));

      logger.info('Site settings updated successfully', { settings: siteConfig.settings });

      // Notifier l'application locale
      const localSocket = require('../services/local-socket');
      localSocket.emit('settings_updated', siteConfig.settings);

      return {
        success: true,
        settings: siteConfig.settings,
        message: 'Settings updated successfully',
      };
    } catch (error) {
      logger.error('Failed to update settings:', { error: error.message });
      throw error;
    }
  },

  /**
   * Corrige les permissions des dossiers neopro
   */
  async fix_permissions() {
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

      return {
        success: true,
        message: 'Permissions fixed for /home/pi/neopro/*',
        paths: ['webapp', 'server', 'sync-agent', 'admin', 'videos'],
      };
    } catch (error) {
      logger.error('Failed to fix permissions:', { error: error.message });
      throw error;
    }
  },

  // === Commandes WiFi BSSID (mesh management) ===

  /**
   * Obtient le statut BSSID et détecte l'environnement mesh
   */
  async get_wifi_bssid_status() {
    return await getWifiBssidStatus();
  },

  /**
   * Supprime le verrouillage BSSID pour permettre le roaming en environnement mesh
   */
  async remove_bssid_lock() {
    return await removeBssidLock();
  },

  /**
   * Optimise la configuration wpa_supplicant pour les environnements mesh
   * Ajoute bgscan et supprime le BSSID lock
   */
  async optimize_for_mesh() {
    return await optimizeForMesh();
  },
};

module.exports = commands;
