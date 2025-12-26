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
   * - mode: 'update_agent' - Met à jour les fichiers du sync-agent (pour remote update)
   *
   * @param {Object} data - { neoProContent, mode?, configuration?, agentFiles? }
   */
  async update_config(data) {
    // Mode spécial : mise à jour des fichiers du sync-agent
    if (data.mode === 'update_agent' && data.agentFiles) {
      logger.info('Updating sync-agent files remotely');
      try {
        const syncAgentPath = config.paths.root + '/sync-agent';

        for (const [filePath, content] of Object.entries(data.agentFiles)) {
          const fullPath = syncAgentPath + '/' + filePath;
          const dir = require('path').dirname(fullPath);
          await fs.ensureDir(dir);
          await fs.writeFile(fullPath, content);
          logger.info('Updated sync-agent file', { path: filePath });
        }

        // Redémarrer le sync-agent pour appliquer les changements
        logger.info('Restarting sync-agent to apply updates...');
        // Utiliser spawn pour ne pas attendre (car le processus va se terminer)
        const { spawn } = require('child_process');
        spawn('sudo', ['systemctl', 'restart', 'neopro-sync-agent'], {
          detached: true,
          stdio: 'ignore'
        }).unref();

        return {
          success: true,
          message: 'Sync-agent files updated, restarting...',
          filesUpdated: Object.keys(data.agentFiles),
        };
      } catch (error) {
        logger.error('Failed to update sync-agent files:', error);
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
};

module.exports = commands;
