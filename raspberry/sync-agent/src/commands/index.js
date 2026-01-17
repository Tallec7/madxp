const deployVideo = require('./deploy-video');
const deleteVideo = require('./delete-video');
const updateSoftware = require('./update-software');
const remoteShell = require('./remote-shell');
const deployAsset = require('./deploy-asset');
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
  remote_shell: remoteShell,
  deploy_asset: deployAsset,

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
    // Mode spécial : correction des permissions (peut être appelé indépendamment)
    if (data.mode === 'fix_permissions' || data.fixPermissions) {
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
      const contentToApply = data.neoProContent || data.configuration;

      if (!contentToApply) {
        throw new Error('Missing neoProContent or configuration in update_config command');
      }

      if (data.mode === 'replace') {
        // Mode replace : remplacement des champs envoyés (sponsors, categories, etc.)
        // Les paramètres locaux (settings, siteId, apiKey, etc.) sont préservés
        logger.info('Using replace mode - replacing content fields');
        finalConfig = { ...localConfig };

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
      } else {
        // Mode merge (défaut) : fusionner le contenu NEOPRO avec la config locale
        const hashBefore = calculateConfigHash(localConfig);
        finalConfig = mergeConfigurations(localConfig, contentToApply);
        const hashAfter = calculateConfigHash(finalConfig);

        logger.info('Configuration merged', {
          hashBefore,
          hashAfter,
          changed: hashBefore !== hashAfter,
        });
      }

      // Écrire la configuration fusionnée
      const configJson = JSON.stringify(finalConfig, null, 2);
      await fs.writeFile(configPath, configJson);
      logger.info('Configuration written to', { path: configPath });

      // Notifier l'application locale du changement
      const io = require('socket.io-client');
      const socket = io('http://localhost:3000', { timeout: 5000 });
      let timeoutId = null;

      // Attendre que la connexion soit établie avant d'émettre
      socket.on('connect', () => {
        if (timeoutId) clearTimeout(timeoutId);
        logger.info('Connected to local server, sending config_updated notification');
        socket.emit('config_updated');
        setTimeout(() => socket.close(), 500);
      });

      socket.on('connect_error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        logger.warn('Failed to connect to local server for config notification:', err.message);
        socket.close();
      });

      // Timeout de sécurité si la connexion prend trop de temps
      timeoutId = setTimeout(() => {
        if (socket.connected) return;
        logger.warn('Timeout connecting to local server for config notification');
        socket.close();
      }, 5000);

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
          logger.warn('Git pull failed, continuing with restart:', gitError.message);
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

  /**
   * Récupère un rapport de santé complet du système
   * Inclut GPU, température, throttling, état des services
   * Critique pour diagnostiquer les crashs Chromium et problèmes d'alimentation
   */
  async get_health_status() {
    logger.info('Retrieving health status');

    try {
      const metricsCollector = require('../metrics');
      const healthStatus = await metricsCollector.getHealthStatus();

      return healthStatus;
    } catch (error) {
      logger.error('Failed to retrieve health status:', error);
      throw error;
    }
  },

  /**
   * Exécute le script de diagnostic complet (diagnose-pi.sh)
   * Retourne un rapport structuré avec tous les checks
   */
  async run_diagnostics() {
    logger.info('Running comprehensive diagnostics');

    try {
      const scriptPath = config.paths.root + '/scripts/diagnose-pi.sh';

      // Vérifier si le script existe
      if (!await fs.pathExists(scriptPath)) {
        // Fallback: exécuter les diagnostics manuellement
        logger.warn('diagnose-pi.sh not found, running manual diagnostics');
        return await commands.runManualDiagnostics();
      }

      // Exécuter le script avec timeout
      const { stdout, stderr } = await execAsync(`bash ${scriptPath} 2>&1`, {
        timeout: 60000, // 60 secondes max
      });

      return {
        success: true,
        timestamp: new Date().toISOString(),
        output: stdout,
        errors: stderr || null,
        scriptPath,
      };
    } catch (error) {
      logger.error('Diagnostics failed:', error);

      // En cas d'erreur du script, tenter les diagnostics manuels
      try {
        return await commands.runManualDiagnostics();
      } catch (manualError) {
        throw error;
      }
    }
  },

  /**
   * Diagnostics manuels si le script n'est pas disponible
   */
  async runManualDiagnostics() {
    const results = {
      success: true,
      timestamp: new Date().toISOString(),
      checks: [],
    };

    // 1. Services systemd
    const services = ['neopro-app', 'neopro-sync-agent', 'neopro-kiosk', 'nginx', 'hostapd', 'dnsmasq'];
    for (const service of services) {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${service} 2>/dev/null || echo "inactive"`);
        const status = stdout.trim();
        results.checks.push({
          category: 'Services',
          name: service,
          status: status === 'active' ? 'ok' : 'fail',
          value: status,
        });
      } catch {
        results.checks.push({
          category: 'Services',
          name: service,
          status: 'fail',
          value: 'error',
        });
      }
    }

    // 2. Ports
    const ports = [80, 3000, 8080];
    for (const port of ports) {
      try {
        const { stdout } = await execAsync(`ss -tlnp | grep :${port} | head -1`);
        results.checks.push({
          category: 'Ports',
          name: `Port ${port}`,
          status: stdout.trim() ? 'ok' : 'fail',
          value: stdout.trim() ? 'LISTEN' : 'NOT LISTENING',
        });
      } catch {
        results.checks.push({
          category: 'Ports',
          name: `Port ${port}`,
          status: 'fail',
          value: 'NOT LISTENING',
        });
      }
    }

    // 3. Fichiers critiques
    const files = [
      '/home/pi/neopro/webapp/index.html',
      '/home/pi/neopro/webapp/configuration.json',
      '/home/pi/neopro/sync-agent/src/agent.js',
    ];
    for (const file of files) {
      const exists = await fs.pathExists(file);
      results.checks.push({
        category: 'Files',
        name: file.split('/').pop(),
        status: exists ? 'ok' : 'fail',
        value: exists ? 'exists' : 'missing',
      });
    }

    // 4. GPU Memory
    try {
      const { stdout } = await execAsync('vcgencmd get_mem gpu 2>/dev/null');
      const match = stdout.match(/gpu=(\d+)M/);
      if (match) {
        const gpuMem = parseInt(match[1]);
        results.checks.push({
          category: 'System',
          name: 'GPU Memory',
          status: gpuMem >= 128 ? 'ok' : 'fail',
          value: `${gpuMem}M`,
          warning: gpuMem < 128 ? 'Minimum requis: 128M, recommandé: 256M' : null,
        });
      }
    } catch {
      results.checks.push({
        category: 'System',
        name: 'GPU Memory',
        status: 'unknown',
        value: 'vcgencmd not available',
      });
    }

    // 5. Température
    try {
      const { stdout } = await execAsync('vcgencmd measure_temp 2>/dev/null');
      const match = stdout.match(/temp=([\d.]+)/);
      if (match) {
        const temp = parseFloat(match[1]);
        results.checks.push({
          category: 'System',
          name: 'Temperature',
          status: temp < 80 ? 'ok' : 'warning',
          value: `${temp}°C`,
        });
      }
    } catch {
      // Fallback via systeminformation
    }

    // 6. Throttling
    try {
      const { stdout } = await execAsync('vcgencmd get_throttled 2>/dev/null');
      const match = stdout.match(/throttled=(0x[0-9a-fA-F]+)/);
      if (match) {
        const value = parseInt(match[1], 16);
        results.checks.push({
          category: 'System',
          name: 'Throttling',
          status: value === 0 ? 'ok' : 'warning',
          value: match[1],
          warning: value !== 0 ? 'Throttling détecté (alimentation ou température)' : null,
        });
      }
    } catch {
      // vcgencmd not available
    }

    // 7. Espace disque
    try {
      const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}'");
      const usage = parseInt(stdout.trim());
      results.checks.push({
        category: 'System',
        name: 'Disk Usage',
        status: usage < 90 ? 'ok' : 'warning',
        value: `${usage}%`,
      });
    } catch {
      // Error getting disk usage
    }

    // 8. Mémoire
    try {
      const { stdout } = await execAsync("free -m | grep Mem | awk '{print int($3/$2*100)}'");
      const usage = parseInt(stdout.trim());
      results.checks.push({
        category: 'System',
        name: 'Memory Usage',
        status: usage < 90 ? 'ok' : 'warning',
        value: `${usage}%`,
      });
    } catch {
      // Error getting memory usage
    }

    // 9. Connectivité Internet
    try {
      await execAsync('ping -c 1 -W 2 8.8.8.8');
      results.checks.push({
        category: 'Network',
        name: 'Internet',
        status: 'ok',
        value: 'reachable',
      });
    } catch {
      results.checks.push({
        category: 'Network',
        name: 'Internet',
        status: 'fail',
        value: 'unreachable',
      });
    }

    // 10. Résolution DNS
    try {
      await execAsync('getent hosts google.com');
      results.checks.push({
        category: 'Network',
        name: 'DNS',
        status: 'ok',
        value: 'working',
      });
    } catch {
      results.checks.push({
        category: 'Network',
        name: 'DNS',
        status: 'fail',
        value: 'not working',
      });
    }

    return results;
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

  /**
   * Met à jour les paramètres du boîtier (langue, timezone)
   * Modifie la section "settings" de configuration.json
   *
   * @param {Object} data - { language?: 'fr'|'en'|'es', timezone?: string }
   */
  async update_settings(data) {
    const { language, timezone } = data;

    logger.info('Updating site settings', { language, timezone });

    if (!language && !timezone) {
      throw new Error('At least one of language or timezone must be provided');
    }

    // Validate language
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

      // Initialize settings if not exists
      siteConfig.settings = siteConfig.settings || { language: 'fr', timezone: 'Europe/Paris' };

      // Update only provided fields
      if (language) {
        siteConfig.settings.language = language;
      }
      if (timezone) {
        siteConfig.settings.timezone = timezone;
      }

      // Write updated config
      await fs.writeFile(configPath, JSON.stringify(siteConfig, null, 2));

      logger.info('Site settings updated successfully', { settings: siteConfig.settings });

      // Notify the local app of the change
      try {
        const io = require('socket.io-client');
        const socket = io('http://localhost:3000', { timeout: 5000 });
        socket.emit('settings_updated', siteConfig.settings);
        setTimeout(() => socket.close(), 1000);
      } catch (notifyError) {
        logger.warn('Failed to notify local app of settings change:', notifyError.message);
      }

      return {
        success: true,
        settings: siteConfig.settings,
        message: 'Settings updated successfully',
      };
    } catch (error) {
      logger.error('Failed to update settings:', error);
      throw error;
    }
  },

  /**
   * Effectue un diagnostic réseau complet
   * Teste la connectivité internet, la latence, le DNS, perte de paquets, etc.
   */
  /**
   * Corrige les permissions des dossiers neopro
   * Nécessaire après une mise à jour qui aurait changé les propriétaires
   */
  async fix_permissions() {
    logger.info('Fixing permissions on neopro directories');

    try {
      const rootPath = config.paths.root;

      // Corriger les permissions pour l'utilisateur pi
      await execAsync(`sudo chown -R pi:pi ${rootPath}/webapp`);
      await execAsync(`sudo chown -R pi:pi ${rootPath}/server`);
      await execAsync(`sudo chown -R pi:pi ${rootPath}/sync-agent`);
      await execAsync(`sudo chown -R pi:pi ${rootPath}/admin 2>/dev/null || true`);
      await execAsync(`sudo chown -R pi:pi ${rootPath}/videos 2>/dev/null || true`);

      // Ajouter www-data au groupe pi pour nginx
      await execAsync('sudo usermod -a -G pi www-data 2>/dev/null || true');

      logger.info('Permissions fixed successfully');

      return {
        success: true,
        message: 'Permissions fixed for /home/pi/neopro/*',
        paths: ['webapp', 'server', 'sync-agent', 'admin', 'videos'],
      };
    } catch (error) {
      logger.error('Failed to fix permissions:', error);
      throw error;
    }
  },

  async network_diagnostics(data) {
    logger.info('Running comprehensive network diagnostics');

    const results = {
      success: true,
      timestamp: new Date().toISOString(),
      internet: {
        reachable: false,
        latency_ms: null,
        packet_loss_percent: null,
        packets_sent: 5,
        packets_received: 0,
      },
      central_server: {
        reachable: false,
        latency_ms: null,
        http_latency_ms: null,
        http_status: null,
        url: config.central.url,
        port_443_open: null,
        ssl_valid: null,
      },
      dns: {
        working: false,
        resolution_time_ms: null,
        tested_domain: null,
        resolved_ip: null,
      },
      gateway: {
        ip: null,
        reachable: false,
        latency_ms: null,
      },
      interfaces: [],
      wifi: null,
      stability: {
        interface_uptime_seconds: null,
        reconnections_24h: null,
      },
    };

    // 1. Récupérer les interfaces réseau
    try {
      const si = require('systeminformation');
      const interfaces = await si.networkInterfaces();
      results.interfaces = interfaces
        .filter(iface => !iface.iface.startsWith('lo'))
        .map(iface => ({
          name: iface.iface,
          ip4: iface.ip4 || null,
          ip6: iface.ip6 || null,
          mac: iface.mac || null,
          type: iface.type || 'unknown',
          operstate: iface.operstate || 'unknown',
          speed: iface.speed || null,
        }));
    } catch (error) {
      logger.warn('Failed to get network interfaces:', error.message);
    }

    // 2. Récupérer la passerelle par défaut
    try {
      const { stdout } = await execAsync("ip route | grep default | awk '{print $3}' | head -n1");
      const gatewayIp = stdout.trim();
      if (gatewayIp) {
        results.gateway.ip = gatewayIp;

        // Ping la passerelle
        try {
          const pingStart = Date.now();
          await execAsync(`ping -c 1 -W 2 ${gatewayIp}`);
          results.gateway.reachable = true;
          results.gateway.latency_ms = Date.now() - pingStart;
        } catch {
          results.gateway.reachable = false;
        }
      }
    } catch (error) {
      logger.warn('Failed to get default gateway:', error.message);
    }

    // 3. Tester la connectivité internet avec perte de paquets (ping 5x)
    try {
      const { stdout: pingOutput } = await execAsync('ping -c 5 -W 2 8.8.8.8 2>&1 || true');

      // Parser la sortie du ping
      const receivedMatch = pingOutput.match(/(\d+) received/);
      const lossMatch = pingOutput.match(/(\d+(?:\.\d+)?)% packet loss/);
      const avgMatch = pingOutput.match(/= [\d.]+\/([\d.]+)\//);

      if (receivedMatch) {
        results.internet.packets_received = parseInt(receivedMatch[1]);
        results.internet.reachable = results.internet.packets_received > 0;
      }
      if (lossMatch) {
        results.internet.packet_loss_percent = parseFloat(lossMatch[1]);
      }
      if (avgMatch) {
        results.internet.latency_ms = Math.round(parseFloat(avgMatch[1]));
      }
    } catch (error) {
      logger.warn('Failed to test internet connectivity:', error.message);
      results.internet.reachable = false;
    }

    // 4. Tester la résolution DNS avec IP résolue
    try {
      const testDomain = 'google.com';
      results.dns.tested_domain = testDomain;
      const dnsStart = Date.now();

      // Utiliser getent pour récupérer l'IP résolue
      try {
        const { stdout: dnsOutput } = await execAsync(`getent hosts ${testDomain} | head -n1`);
        results.dns.working = true;
        results.dns.resolution_time_ms = Date.now() - dnsStart;
        const ipMatch = dnsOutput.match(/^([\d.]+)/);
        if (ipMatch) {
          results.dns.resolved_ip = ipMatch[1];
        }
      } catch {
        // Fallback avec nslookup
        const { stdout: nsOutput } = await execAsync(`nslookup ${testDomain} 2>/dev/null | grep -A1 "Name:" | grep "Address" | head -n1`);
        results.dns.working = true;
        results.dns.resolution_time_ms = Date.now() - dnsStart;
        const ipMatch = nsOutput.match(/([\d.]+)/);
        if (ipMatch) {
          results.dns.resolved_ip = ipMatch[1];
        }
      }
    } catch {
      results.dns.working = false;
    }

    // 5. Tester la connectivité vers le serveur central (ping, HTTP, port, SSL)
    try {
      const centralUrl = config.central.url;
      if (centralUrl) {
        const url = new URL(centralUrl);
        const hostname = url.hostname;
        const isHttps = url.protocol === 'https:';

        // Test ping
        try {
          const pingStart = Date.now();
          await execAsync(`ping -c 1 -W 3 ${hostname}`);
          results.central_server.latency_ms = Date.now() - pingStart;
        } catch {
          // ICMP peut être bloqué, ce n'est pas grave
        }

        // Test port 443 ouvert
        if (isHttps) {
          try {
            await execAsync(`timeout 5 bash -c "echo > /dev/tcp/${hostname}/443" 2>/dev/null || nc -z -w 5 ${hostname} 443 2>/dev/null`);
            results.central_server.port_443_open = true;
          } catch {
            results.central_server.port_443_open = false;
          }
        }

        // Test HTTP avec timing détaillé
        try {
          const curlStart = Date.now();
          const { stdout: curlOutput } = await execAsync(
            `curl -s -o /dev/null -w "%{http_code}|%{time_total}|%{ssl_verify_result}" --connect-timeout 10 ${centralUrl}/health 2>/dev/null || echo "000|0|1"`
          );
          results.central_server.http_latency_ms = Date.now() - curlStart;

          const [httpCode, timeTotal, sslResult] = curlOutput.trim().split('|');
          results.central_server.http_status = parseInt(httpCode) || null;
          results.central_server.reachable = parseInt(httpCode) >= 200 && parseInt(httpCode) < 500;

          if (isHttps) {
            results.central_server.ssl_valid = sslResult === '0';
          }
        } catch {
          results.central_server.reachable = false;
        }
      }
    } catch (error) {
      logger.warn('Failed to test central server connectivity:', error.message);
    }

    // 6. Récupérer les infos WiFi si disponible
    try {
      const { stdout: iwconfig } = await execAsync('iwconfig 2>/dev/null || true');
      if (iwconfig && !iwconfig.includes('no wireless extensions')) {
        const ssidMatch = iwconfig.match(/ESSID:"([^"]+)"/);
        const qualityMatch = iwconfig.match(/Link Quality=(\d+)\/(\d+)/);
        const signalMatch = iwconfig.match(/Signal level=(-?\d+)/);
        const bitrateMatch = iwconfig.match(/Bit Rate[=:](\d+(?:\.\d+)?)\s*Mb\/s/);

        if (ssidMatch || qualityMatch || signalMatch) {
          results.wifi = {
            connected: !!ssidMatch,
            ssid: ssidMatch ? ssidMatch[1] : null,
            quality_percent: qualityMatch ? Math.round((parseInt(qualityMatch[1]) / parseInt(qualityMatch[2])) * 100) : null,
            signal_dbm: signalMatch ? parseInt(signalMatch[1]) : null,
            bitrate_mbps: bitrateMatch ? parseFloat(bitrateMatch[1]) : null,
          };
        }
      }
    } catch (error) {
      logger.debug('WiFi info not available:', error.message);
    }

    // 7. Stabilité réseau - uptime interface et reconnexions
    try {
      // Trouver l'interface active (eth0 ou wlan0)
      const activeInterface = results.interfaces.find(i => i.operstate === 'up' && i.ip4);
      if (activeInterface) {
        // Uptime de l'interface via /sys/class/net
        try {
          const { stdout: carrierChanges } = await execAsync(`cat /sys/class/net/${activeInterface.name}/carrier_changes 2>/dev/null || echo "0"`);
          // carrier_changes compte les up/down, donc reconnexions = changes / 2
          const changes = parseInt(carrierChanges.trim()) || 0;
          results.stability.reconnections_24h = Math.floor(changes / 2);
        } catch {
          // Pas grave si non disponible
        }

        // Calculer uptime interface depuis boot (approximation via uptime système)
        try {
          const { stdout: uptimeOutput } = await execAsync('cat /proc/uptime');
          const systemUptime = parseFloat(uptimeOutput.split(' ')[0]);
          results.stability.interface_uptime_seconds = Math.round(systemUptime);
        } catch {
          // Pas grave
        }
      }
    } catch (error) {
      logger.debug('Failed to get stability info:', error.message);
    }

    // 8. Récupérer les stats de reconnexion du sync-agent (si disponible)
    try {
      const connectionStatus = require('../services/connection-status');
      const status = connectionStatus.getStatus();
      if (status && status.reconnectAttempts !== undefined) {
        results.stability.reconnections_24h = status.reconnectAttempts;
      }
    } catch {
      // Module peut ne pas être disponible dans ce contexte
    }

    logger.info('Network diagnostics completed', {
      internet: results.internet.reachable,
      packetLoss: results.internet.packet_loss_percent,
      central: results.central_server.reachable,
      httpStatus: results.central_server.http_status,
      dns: results.dns.working,
      gateway: results.gateway.reachable,
    });

    return results;
  },

  /**
   * Récupère l'état du buffer analytics (P2.3)
   * Taille du buffer, dernière vidange, événements en attente
   */
  async get_analytics_buffer_status() {
    logger.info('Retrieving analytics buffer status');

    try {
      const analyticsFilePath = path.join(
        process.env.HOME || '/home/pi',
        'neopro',
        'data',
        'analytics_buffer.json'
      );

      const sponsorFilePath = path.join(
        process.env.HOME || '/home/pi',
        'neopro',
        'data',
        'sponsor_impressions.json'
      );

      const result = {
        success: true,
        timestamp: new Date().toISOString(),
        analytics: {
          file_exists: false,
          event_count: 0,
          file_size_bytes: 0,
          oldest_event: null,
          newest_event: null,
        },
        sponsors: {
          file_exists: false,
          event_count: 0,
          file_size_bytes: 0,
          oldest_event: null,
          newest_event: null,
        },
      };

      // Analytics buffer
      if (await fs.pathExists(analyticsFilePath)) {
        const stats = await fs.stat(analyticsFilePath);
        result.analytics.file_exists = true;
        result.analytics.file_size_bytes = stats.size;

        try {
          const data = JSON.parse(await fs.readFile(analyticsFilePath, 'utf8'));
          if (Array.isArray(data)) {
            result.analytics.event_count = data.length;
            if (data.length > 0) {
              // Les événements devraient avoir un timestamp
              const sorted = data.sort((a, b) =>
                new Date(a.timestamp || a.played_at || 0).getTime() -
                new Date(b.timestamp || b.played_at || 0).getTime()
              );
              result.analytics.oldest_event = sorted[0]?.timestamp || sorted[0]?.played_at || null;
              result.analytics.newest_event = sorted[sorted.length - 1]?.timestamp || sorted[sorted.length - 1]?.played_at || null;
            }
          }
        } catch (parseError) {
          logger.warn('Failed to parse analytics buffer:', parseError.message);
        }
      }

      // Sponsor impressions buffer
      if (await fs.pathExists(sponsorFilePath)) {
        const stats = await fs.stat(sponsorFilePath);
        result.sponsors.file_exists = true;
        result.sponsors.file_size_bytes = stats.size;

        try {
          const data = JSON.parse(await fs.readFile(sponsorFilePath, 'utf8'));
          if (Array.isArray(data)) {
            result.sponsors.event_count = data.length;
            if (data.length > 0) {
              const sorted = data.sort((a, b) =>
                new Date(a.timestamp || a.viewed_at || 0).getTime() -
                new Date(b.timestamp || b.viewed_at || 0).getTime()
              );
              result.sponsors.oldest_event = sorted[0]?.timestamp || sorted[0]?.viewed_at || null;
              result.sponsors.newest_event = sorted[sorted.length - 1]?.timestamp || sorted[sorted.length - 1]?.viewed_at || null;
            }
          }
        } catch (parseError) {
          logger.warn('Failed to parse sponsor impressions buffer:', parseError.message);
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to get analytics buffer status:', error);
      throw error;
    }
  },

  /**
   * Répare le hotspot WiFi (P2.4)
   * Exécute fix-hotspot.sh --auto-fix pour corriger les problèmes courants
   */
  async fix_hotspot(data) {
    const { autoFix = true } = data || {};
    logger.info('Running hotspot fix', { autoFix });

    try {
      const scriptPath = config.paths.root + '/scripts/fix-hotspot.sh';

      // Vérifier si le script existe
      if (!await fs.pathExists(scriptPath)) {
        logger.warn('fix-hotspot.sh not found, running manual hotspot check');
        return await commands.runManualHotspotDiagnostics();
      }

      // Exécuter le script avec ou sans --auto-fix
      const args = autoFix ? '--auto-fix' : '';
      const { stdout, stderr } = await execAsync(`sudo bash ${scriptPath} ${args} 2>&1`, {
        timeout: 120000, // 2 minutes max (le script peut prendre du temps pour scanner les canaux)
      });

      return {
        success: true,
        timestamp: new Date().toISOString(),
        autoFix,
        output: stdout,
        errors: stderr || null,
        scriptPath,
      };
    } catch (error) {
      logger.error('Hotspot fix failed:', error);

      // En cas d'erreur, tenter les diagnostics manuels
      try {
        return await commands.runManualHotspotDiagnostics();
      } catch (manualError) {
        throw error;
      }
    }
  },

  /**
   * Diagnostics manuels du hotspot si le script n'est pas disponible
   */
  async runManualHotspotDiagnostics() {
    const results = {
      success: true,
      timestamp: new Date().toISOString(),
      manual: true,
      checks: [],
    };

    // 1. Vérifier hostapd
    try {
      const { stdout } = await execAsync('systemctl is-active hostapd 2>/dev/null || echo "inactive"');
      results.checks.push({
        name: 'hostapd',
        status: stdout.trim() === 'active' ? 'ok' : 'fail',
        value: stdout.trim(),
      });
    } catch {
      results.checks.push({ name: 'hostapd', status: 'fail', value: 'error' });
    }

    // 2. Vérifier dnsmasq
    try {
      const { stdout } = await execAsync('systemctl is-active dnsmasq 2>/dev/null || echo "inactive"');
      results.checks.push({
        name: 'dnsmasq',
        status: stdout.trim() === 'active' ? 'ok' : 'fail',
        value: stdout.trim(),
      });
    } catch {
      results.checks.push({ name: 'dnsmasq', status: 'fail', value: 'error' });
    }

    // 3. Vérifier wlan0
    try {
      const { stdout } = await execAsync('ip addr show wlan0 2>/dev/null | grep "inet " | head -1');
      const hasIp = stdout.trim().length > 0;
      results.checks.push({
        name: 'wlan0 IP',
        status: hasIp ? 'ok' : 'warning',
        value: hasIp ? stdout.trim().match(/inet (\d+\.\d+\.\d+\.\d+)/)?.[1] || 'configured' : 'no IP',
      });
    } catch {
      results.checks.push({ name: 'wlan0 IP', status: 'warning', value: 'not configured' });
    }

    // 4. Lire le SSID configuré
    try {
      const { stdout } = await execAsync('grep "^ssid=" /etc/hostapd/hostapd.conf 2>/dev/null || echo ""');
      const ssid = stdout.trim().replace('ssid=', '');
      results.checks.push({
        name: 'SSID',
        status: ssid ? 'ok' : 'warning',
        value: ssid || 'not configured',
      });
    } catch {
      results.checks.push({ name: 'SSID', status: 'warning', value: 'unable to read' });
    }

    // 5. Lire le channel configuré
    try {
      const { stdout } = await execAsync('grep "^channel=" /etc/hostapd/hostapd.conf 2>/dev/null || echo ""');
      const channel = stdout.trim().replace('channel=', '');
      results.checks.push({
        name: 'Channel',
        status: channel ? 'ok' : 'warning',
        value: channel || 'not configured',
      });
    } catch {
      results.checks.push({ name: 'Channel', status: 'warning', value: 'unable to read' });
    }

    // 6. Vérifier rfkill
    try {
      const { stdout } = await execAsync('rfkill list wifi 2>/dev/null | grep -i "blocked" || echo ""');
      const blocked = stdout.toLowerCase().includes('yes');
      results.checks.push({
        name: 'rfkill',
        status: blocked ? 'fail' : 'ok',
        value: blocked ? 'WiFi blocked' : 'WiFi not blocked',
      });
    } catch {
      results.checks.push({ name: 'rfkill', status: 'ok', value: 'check failed (probably ok)' });
    }

    return results;
  },

  /**
   * Export un bundle de debug complet pour le support technique
   * Collecte: configuration, logs récents, métriques, diagnostics
   * Retourne un objet JSON (le ZIP sera créé côté dashboard)
   */
  async export_debug_bundle() {
    logger.info('Exporting debug bundle for support');
    const metricsCollector = require('../metrics');

    const bundle = {
      timestamp: new Date().toISOString(),
      hostname: require('os').hostname(),
      sections: {},
    };

    // 1. Configuration (sans données sensibles)
    try {
      const configPath = config.paths.root + '/webapp/configuration.json';
      if (await fs.pathExists(configPath)) {
        const configContent = await fs.readFile(configPath, 'utf8');
        const cfg = JSON.parse(configContent);
        // Masquer les données sensibles
        const sanitizedConfig = { ...cfg };
        if (sanitizedConfig.apiKey) {
          sanitizedConfig.apiKey = sanitizedConfig.apiKey.substring(0, 8) + '...';
        }
        if (sanitizedConfig.auth?.password) {
          sanitizedConfig.auth.password = '***';
        }
        bundle.sections.configuration = sanitizedConfig;
      }
    } catch (error) {
      bundle.sections.configuration = { error: error.message };
    }

    // 2. Version info
    try {
      const versionPath = config.paths.root + '/VERSION';
      const releasePath = config.paths.root + '/release.json';
      if (await fs.pathExists(versionPath)) {
        bundle.sections.version = (await fs.readFile(versionPath, 'utf8')).trim();
      }
      if (await fs.pathExists(releasePath)) {
        const release = JSON.parse(await fs.readFile(releasePath, 'utf8'));
        bundle.sections.release = release;
      }
    } catch (error) {
      bundle.sections.version = { error: error.message };
    }

    // 3. Health status
    try {
      bundle.sections.health = await metricsCollector.getHealthStatus();
    } catch (error) {
      bundle.sections.health = { error: error.message };
    }

    // 4. System info
    try {
      bundle.sections.systemInfo = await metricsCollector.getSystemInfo();
    } catch (error) {
      bundle.sections.systemInfo = { error: error.message };
    }

    // 5. Services status
    try {
      bundle.sections.services = await metricsCollector.getServicesStatus();
    } catch (error) {
      bundle.sections.services = { error: error.message };
    }

    // 6. Logs récents (dernières 100 lignes de chaque service)
    try {
      const services = ['neopro-sync-agent', 'neopro-app', 'neopro-kiosk', 'neopro-admin', 'nginx', 'hostapd'];
      bundle.sections.logs = {};

      for (const service of services) {
        try {
          const { stdout } = await execAsync(
            `sudo journalctl -u ${service} -n 100 --no-pager -q 2>/dev/null || echo "No logs available"`,
            { timeout: 10000 }
          );
          bundle.sections.logs[service] = stdout.trim();
        } catch {
          bundle.sections.logs[service] = 'Unable to retrieve logs';
        }
      }
    } catch (error) {
      bundle.sections.logs = { error: error.message };
    }

    // 7. Network diagnostics
    try {
      const networkResult = await commands.network_diagnostics();
      bundle.sections.network = networkResult;
    } catch (error) {
      bundle.sections.network = { error: error.message };
    }

    // 8. Disk usage
    try {
      const { stdout } = await execAsync('df -h');
      bundle.sections.diskUsage = stdout.trim();
    } catch (error) {
      bundle.sections.diskUsage = { error: error.message };
    }

    // 9. Buffer status
    try {
      bundle.sections.buffers = await commands.get_analytics_buffer_status();
    } catch (error) {
      bundle.sections.buffers = { error: error.message };
    }

    // 10. Hotspot config (sans mot de passe)
    try {
      const { stdout } = await execAsync('grep -v "wpa_passphrase" /etc/hostapd/hostapd.conf 2>/dev/null || echo ""');
      bundle.sections.hotspotConfig = stdout.trim();
    } catch (error) {
      bundle.sections.hotspotConfig = { error: error.message };
    }

    // 11. boot/config.txt (pour gpu_mem)
    try {
      const { stdout } = await execAsync('cat /boot/config.txt 2>/dev/null || cat /boot/firmware/config.txt 2>/dev/null || echo ""');
      bundle.sections.bootConfig = stdout.trim();
    } catch (error) {
      bundle.sections.bootConfig = { error: error.message };
    }

    // 12. Video list summary
    try {
      const videosPath = config.paths.root + '/videos';
      if (await fs.pathExists(videosPath)) {
        const { stdout } = await execAsync(`find "${videosPath}" -type f \\( -name "*.mp4" -o -name "*.mkv" -o -name "*.mov" \\) | head -50`);
        bundle.sections.videoFiles = stdout.trim().split('\n').filter(f => f.length > 0);
      }
    } catch (error) {
      bundle.sections.videoFiles = { error: error.message };
    }

    logger.info('Debug bundle exported successfully', { sections: Object.keys(bundle.sections) });
    return { success: true, bundle };
  },
};

module.exports = commands;
