// @ts-check
/** @typedef {import('./types').SystemMetrics} SystemMetrics */

const si = require('systeminformation');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const logger = require('./logger');

const execAsync = util.promisify(exec);

class MetricsCollector {
  constructor() {
    // Cache du modèle Pi pour éviter de lire le fichier à chaque appel
    this._piModel = null;
    this._isPi5 = null;

    // Cache EDID — l'écran change rarement, TTL 5 min
    this._displayInfoCache = null;
    this._displayInfoCacheTime = 0;
    this._secondaryDisplayInfoCache = null;
    this._secondaryDisplayInfoCacheTime = 0;
    this._DISPLAY_CACHE_TTL = 300000; // 5 minutes
  }

  /**
   * Détecte le modèle de Raspberry Pi
   * @returns {Promise<{model: string, isPi5: boolean}>}
   */
  async detectPiModel() {
    // Utiliser le cache si disponible
    if (this._piModel !== null) {
      return { model: this._piModel, isPi5: this._isPi5 };
    }

    try {
      const modelPath = '/proc/device-tree/model';
      if (fs.existsSync(modelPath)) {
        const model = fs.readFileSync(modelPath, 'utf8').replace(/\0/g, '').trim();
        this._piModel = model;
        this._isPi5 = model.includes('Raspberry Pi 5');
        logger.info(`Raspberry Pi model detected: ${model} (isPi5: ${this._isPi5})`);
        return { model: this._piModel, isPi5: this._isPi5 };
      }
    } catch (error) {
      logger.warn('Could not detect Pi model:', error.message);
    }

    this._piModel = 'unknown';
    this._isPi5 = false;
    return { model: this._piModel, isPi5: this._isPi5 };
  }
  /** @returns {Promise<SystemMetrics>} */
  async collectAll() {
    try {
      const [cpu, memory, temperature, disk, localIp, wifiStatus, fanStatus] = await Promise.all([
        this.getCpuUsage(),
        this.getMemoryUsage(),
        this.getTemperature(),
        this.getDiskUsage(),
        this.getLocalIp(),
        this.getWifiStatus(),
        this.getFanStatus(),
      ]);

      // Filesystem health (non-bloquant, collecté en parallèle des autres métriques)
      const filesystemHealth = await this.getFilesystemHealth();

      return {
        cpu,
        memory,
        temperature,
        disk,
        uptime: os.uptime(),
        localIp,
        wifiStatus,
        fanStatus,
        filesystemHealth,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Error collecting metrics:', error);
      return null;
    }
  }

  async getLocalIp() {
    try {
      const interfaces = await si.networkInterfaces();
      // Chercher une interface avec une IP locale (pas loopback)
      // Priorité: eth0/enp* (ethernet) > wlan0 (wifi)
      const ethernetIface = interfaces.find(
        iface => (iface.iface.startsWith('eth') || iface.iface.startsWith('enp'))
          && iface.ip4 && !iface.ip4.startsWith('127.')
      );
      if (ethernetIface) {
        return ethernetIface.ip4;
      }

      const wifiIface = interfaces.find(
        iface => iface.iface.startsWith('wlan')
          && iface.ip4 && !iface.ip4.startsWith('127.')
      );
      if (wifiIface) {
        return wifiIface.ip4;
      }

      // Fallback: première interface avec une IP non-loopback
      const anyIface = interfaces.find(
        iface => iface.ip4 && !iface.ip4.startsWith('127.')
      );
      return anyIface?.ip4 || null;
    } catch (error) {
      logger.error('Error getting local IP:', error);
      return null;
    }
  }

  async getCpuUsage() {
    try {
      const load = await si.currentLoad();
      return parseFloat(load.currentLoad.toFixed(1));
    } catch (error) {
      logger.error('Error getting CPU usage:', error);
      return 0;
    }
  }

  async getMemoryUsage() {
    try {
      const mem = await si.mem();
      // Utiliser (total - available) pour exclure le buff/cache Linux
      // mem.used inclut le cache, ce qui donne des valeurs trompeuses (ex: 88% alors que 73% est disponible)
      const actualUsed = mem.total - mem.available;
      const usedPercent = (actualUsed / mem.total) * 100;
      return parseFloat(usedPercent.toFixed(1));
    } catch (error) {
      logger.error('Error getting memory usage:', error);
      return 0;
    }
  }

  async getTemperature() {
    try {
      const temp = await si.cpuTemperature();
      return parseFloat((temp.main || temp.cores?.[0] || 0).toFixed(1));
    } catch (error) {
      return 0;
    }
  }

  async getDiskUsage() {
    try {
      const disks = await si.fsSize();
      const rootDisk = disks.find(d => d.mount === '/') || disks[0];
      if (rootDisk) {
        return parseFloat(rootDisk.use.toFixed(1));
      }
      return 0;
    } catch (error) {
      logger.error('Error getting disk usage:', error);
      return 0;
    }
  }

  /**
   * Récupère l'état de la connexion réseau (WiFi USB / Ethernet) pour le heartbeat.
   * Gère 3 scénarios : WiFi USB seul, Ethernet seul, dual (eth0 + wlan1).
   */
  async getWifiStatus() {
    const status = {
      interface: null,
      connected: false,
      ssid: null,
      signal: null,
      quality: null,
      connectionType: 'none',
      disconnectsLastHour: 0,
      throttled: null,
      voltageOk: true,
      powerManagement: null, // 'on' | 'off' | null (unknown)
      channel: null,
      hotspotChannel: null,
    };

    try {
      // 1. Détecter Ethernet (prioritaire)
      try {
        const { stdout } = await execAsync('ip addr show eth0 2>/dev/null');
        const hasIp = /inet\s+\d+\.\d+\.\d+\.\d+/.test(stdout);
        const isUp = /state UP/.test(stdout);
        if (hasIp && isUp) {
          status.connectionType = 'ethernet';
          status.connected = true;
        }
      } catch {
        // eth0 n'existe pas — normal sur certains Pi
      }

      // 2. Détecter wlan1
      try {
        await execAsync('ip link show wlan1 2>/dev/null');
        status.interface = 'wlan1';
      } catch {
        // wlan1 absent — normal si Ethernet uniquement
      }

      // 3. Signal WiFi (seulement si wlan1 existe)
      if (status.interface === 'wlan1') {
        try {
          const { stdout: iwOut } = await execAsync('iwconfig wlan1 2>/dev/null');

          const ssidMatch = iwOut.match(/ESSID:"([^"]*)"/);
          if (ssidMatch && ssidMatch[1]) {
            status.ssid = ssidMatch[1];
            if (status.connectionType !== 'ethernet') {
              status.connectionType = 'wifi';
              status.connected = true;
            }
          }

          const signalMatch = iwOut.match(/Signal level=(-?\d+)/);
          if (signalMatch) {
            status.signal = parseInt(signalMatch[1]);
          }

          const qualityMatch = iwOut.match(/Link Quality=(\d+)\/(\d+)/);
          if (qualityMatch) {
            status.quality = Math.round(
              (parseInt(qualityMatch[1]) / parseInt(qualityMatch[2])) * 100
            );
          }

          // Power Management status (should be 'off' after our stabilization)
          const pmMatch = iwOut.match(/Power Management:(\w+)/);
          if (pmMatch) {
            status.powerManagement = pmMatch[1].toLowerCase();
          }
        } catch {
          // iwconfig non disponible ou wlan1 pas associé
        }

        // Channel detection via iw (more reliable than iwconfig for channel info)
        try {
          const { stdout: iwLink } = await execAsync('iw dev wlan1 link 2>/dev/null');
          const freqMatch = iwLink.match(/freq: (\d+)/);
          if (freqMatch) {
            const freq = parseInt(freqMatch[1]);
            // 2.4GHz band: 2412 = ch1, 2437 = ch6, 2462 = ch11, etc.
            if (freq >= 2412 && freq <= 2484) {
              status.channel = Math.round((freq - 2407) / 5);
            }
          }
        } catch {
          // iw non disponible
        }
      }

      // Hotspot channel (wlan0)
      try {
        const { stdout: hostapd } = await execAsync('grep "^channel=" /etc/hostapd/hostapd.conf 2>/dev/null');
        const chMatch = hostapd.match(/channel=(\d+)/);
        if (chMatch) {
          status.hotspotChannel = parseInt(chMatch[1]);
        }
      } catch {
        // hostapd.conf not available
      }

      // 4. Throttling (toujours — affecte tout le système)
      try {
        const { stdout: throttledOut } = await execAsync('vcgencmd get_throttled 2>/dev/null');
        const match = throttledOut.match(/throttled=(0x[0-9a-fA-F]+)/);
        if (match) {
          status.throttled = match[1];
          const value = parseInt(match[1], 16);
          // Bits 0 (current) et 16 (occurred) = under-voltage
          status.voltageOk = !(value & 0x10001);
        }
      } catch {
        // vcgencmd non disponible (non-Raspberry Pi)
      }

      // 5. Déconnexions dernière heure (seulement si WiFi est la connexion principale)
      if (status.interface === 'wlan1' && status.connectionType === 'wifi') {
        try {
          const { stdout: journalOut } = await execAsync(
            'journalctl -u wpa_supplicant@wlan1 --since "1 hour ago" --no-pager -q 2>/dev/null | grep -c DISCONNECTED || echo 0',
            { timeout: 5000 }
          );
          status.disconnectsLastHour = parseInt(journalOut.trim()) || 0;
        } catch {
          // journalctl non disponible
        }
      }
    } catch (error) {
      logger.error('Error getting WiFi status:', error);
    }

    return status;
  }

  async getNetworkStatus() {
    try {
      const [interfaces, connections] = await Promise.all([
        si.networkInterfaces(),
        si.networkConnections(),
      ]);

      return {
        interfaces: interfaces.map(iface => ({
          name: iface.iface,
          ip4: iface.ip4,
          ip6: iface.ip6,
          mac: iface.mac,
          type: iface.type,
        })),
        activeConnections: connections.length,
      };
    } catch (error) {
      logger.error('Error getting network status:', error);
      return null;
    }
  }

  async getSystemInfo() {
    try {
      const [system, cpu, osInfo, memory, interfaces, raspberry] = await Promise.all([
        si.system(),
        si.cpu(),
        si.osInfo(),
        si.mem(),
        si.networkInterfaces(),
        si.get({ raspberry: 'revision,serial' }).catch(() => null),
      ]);

      const networkInterfaces = interfaces || [];

      const primaryInterface =
        networkInterfaces.find(iface =>
          (iface.iface.startsWith('eth') || iface.iface.startsWith('enp')) &&
          iface.ip4 && !iface.ip4.startsWith('127.')
        ) ||
        networkInterfaces.find(iface =>
          iface.iface.startsWith('wlan') &&
          iface.ip4 && !iface.ip4.startsWith('127.')
        ) ||
        networkInterfaces.find(iface => iface.ip4 && !iface.ip4.startsWith('127.')) ||
        networkInterfaces.find(iface => iface.ip6 && !iface.ip6.startsWith('::1')) ||
        networkInterfaces[0];

      const osName = [osInfo?.distro, osInfo?.release].filter(Boolean).join(' ')
        || osInfo?.platform
        || null;

      return {
        hostname: os.hostname(),
        os: osName,
        kernel: osInfo?.kernel || null,
        architecture: osInfo?.arch || os.arch(),
        cpu_model: cpu?.brand || cpu?.manufacturer || null,
        cpu_cores: cpu?.cores || null,
        total_memory: memory?.total || null,
        ip_address: primaryInterface?.ip4 || primaryInterface?.ip6 || null,
        mac_address: primaryInterface?.mac || null,
        // Champs détaillés conservés pour la compatibilité/diagnostics
        manufacturer: system.manufacturer,
        model: system.model,
        version: system.version,
        cpu: {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          speed: cpu.speed,
          cores: cpu.cores,
        },
        os_details: osInfo,
        network_interfaces: networkInterfaces,
        raspberry: raspberry,
      };
    } catch (error) {
      logger.error('Error getting system info:', error);
      return null;
    }
  }

  /**
   * Récupère l'état du ventilateur depuis /sys/class/thermal/cooling_device0/
   * Pi 5 Active Cooler: cur_state 0-4 (off, low, medium, high, full)
   * Pi 4 Fan HAT: cur_state 0 ou 1 (off/on)
   * Retourne present: false si aucun ventilateur détecté (pas d'alerte)
   *
   * @returns {Promise<{present: boolean, type: string|null, curState: number|null, maxState: number|null, speedPercent: number|null, is_pi5: boolean}>}
   */
  async getFanStatus() {
    const { isPi5 } = await this.detectPiModel();

    const fanStatus = {
      present: false,
      type: null,
      curState: null,
      maxState: null,
      speedPercent: null,
      is_pi5: isPi5,
    };

    const basePath = '/sys/class/thermal/cooling_device0';

    try {
      if (!fs.existsSync(basePath)) {
        return fanStatus;
      }

      fanStatus.present = true;

      // Type du ventilateur (ex: "pwm-fan")
      try {
        const typePath = `${basePath}/type`;
        if (fs.existsSync(typePath)) {
          fanStatus.type = fs.readFileSync(typePath, 'utf8').trim();
        }
      } catch {
        // type file not readable
      }

      // État courant
      try {
        const curStatePath = `${basePath}/cur_state`;
        if (fs.existsSync(curStatePath)) {
          fanStatus.curState = parseInt(fs.readFileSync(curStatePath, 'utf8').trim(), 10);
        }
      } catch {
        // cur_state not readable
      }

      // État maximum
      try {
        const maxStatePath = `${basePath}/max_state`;
        if (fs.existsSync(maxStatePath)) {
          fanStatus.maxState = parseInt(fs.readFileSync(maxStatePath, 'utf8').trim(), 10);
        }
      } catch {
        // max_state not readable
      }

      // Pourcentage de vitesse
      if (fanStatus.curState !== null && fanStatus.maxState !== null && fanStatus.maxState > 0) {
        fanStatus.speedPercent = Math.round((fanStatus.curState / fanStatus.maxState) * 100);
      }
    } catch (error) {
      logger.warn('Error reading fan status:', error.message);
    }

    return fanStatus;
  }

  /**
   * Récupère les informations GPU spécifiques au Raspberry Pi via vcgencmd
   * Critique pour diagnostiquer les crashs Chromium (Aw, Snap!)
   *
   * NOTE: Sur Pi 5 (VideoCore VII), gpu_mem n'est plus configurable.
   * Santé filesystem SD card.
   * Détecte les erreurs EXT4 dans dmesg et l'état read-only.
   * Léger (pas de tune2fs qui nécessite sudo) — adapté au heartbeat périodique.
   * @returns {Promise<{ext4Errors: number, isReadOnly: boolean} | null>}
   */
  async getFilesystemHealth() {
    try {
      const [dmesgResult, mountResult] = await Promise.all([
        execAsync('dmesg 2>/dev/null | grep -c "EXT4-fs error" || echo "0"', { timeout: 5000 }),
        execAsync('mount | grep "on / " | head -1', { timeout: 3000 }),
      ]);

      const ext4Errors = parseInt(dmesgResult.stdout.trim(), 10) || 0;
      const isReadOnly = mountResult.stdout.includes('ro,') || mountResult.stdout.includes('ro)');

      return { ext4Errors, isReadOnly };
    } catch (error) {
      logger.debug('Failed to collect filesystem health', { error: error.message });
      return null;
    }
  }

  /**
   * Le GPU utilise la mémoire partagée CMA (Contiguous Memory Allocator).
   * vcgencmd get_mem gpu retourne toujours 4M (valeur legacy) sur Pi 5.
   * Ce n'est PAS un problème - le Pi 5 gère la mémoire GPU dynamiquement.
   */
  async getGpuInfo() {
    const { isPi5 } = await this.detectPiModel();

    const gpuInfo = {
      gpu_mem_mb: null,
      gpu_mem_warning: false,
      gpu_mem_note: null,  // Explication pour Pi 5
      is_pi5: isPi5,
      temperature: null,
      temperature_warning: false,
      throttled: null,
      throttled_flags: [],
      voltage_ok: true,
      frequency_capped: false,
      throttling_active: false,
    };

    try {
      // GPU Memory
      // Sur Pi 5: vcgencmd get_mem gpu retourne toujours 4M (valeur legacy, pas un problème)
      // Sur Pi 4 et antérieurs: doit être >= 128M, recommandé 256M
      try {
        const { stdout: gpuMemOutput } = await execAsync('vcgencmd get_mem gpu 2>/dev/null');
        const match = gpuMemOutput.match(/gpu=(\d+)M/);
        if (match) {
          gpuInfo.gpu_mem_mb = parseInt(match[1]);

          if (isPi5) {
            // Pi 5: la valeur 4M est normale et attendue
            gpuInfo.gpu_mem_warning = false;
            gpuInfo.gpu_mem_note = 'Pi 5 uses dynamic shared memory (CMA). The 4M value is a legacy indicator, not actual GPU memory.';
          } else {
            // Pi 4 et antérieurs: vérifier que gpu_mem >= 128M
            gpuInfo.gpu_mem_warning = gpuInfo.gpu_mem_mb < 128;
          }
        }
      } catch {
        // vcgencmd peut ne pas être disponible (non-Raspberry Pi)
      }

      // Température GPU
      try {
        const { stdout: tempOutput } = await execAsync('vcgencmd measure_temp 2>/dev/null');
        const tempMatch = tempOutput.match(/temp=([\d.]+)/);
        if (tempMatch) {
          gpuInfo.temperature = parseFloat(tempMatch[1]);
          gpuInfo.temperature_warning = gpuInfo.temperature > 80;
        }
      } catch {
        // Fallback sur la température CPU si vcgencmd échoue
      }

      // Throttling status (crucial pour diagnostiquer les problèmes d'alimentation)
      try {
        const { stdout: throttledOutput } = await execAsync('vcgencmd get_throttled 2>/dev/null');
        const throttledMatch = throttledOutput.match(/throttled=(0x[0-9a-fA-F]+)/);
        if (throttledMatch) {
          gpuInfo.throttled = throttledMatch[1];
          const throttledValue = parseInt(throttledMatch[1], 16);

          // Décoder les flags de throttling
          // Bits 0-3: actuellement actif, Bits 16-19: s'est produit depuis le boot
          if (throttledValue !== 0) {
            if (throttledValue & 0x1) gpuInfo.throttled_flags.push('Under-voltage detected');
            if (throttledValue & 0x2) gpuInfo.throttled_flags.push('ARM frequency capped');
            if (throttledValue & 0x4) gpuInfo.throttled_flags.push('Currently throttled');
            if (throttledValue & 0x8) gpuInfo.throttled_flags.push('Soft temperature limit active');
            if (throttledValue & 0x10000) gpuInfo.throttled_flags.push('Under-voltage has occurred');
            if (throttledValue & 0x20000) gpuInfo.throttled_flags.push('ARM frequency capping has occurred');
            if (throttledValue & 0x40000) gpuInfo.throttled_flags.push('Throttling has occurred');
            if (throttledValue & 0x80000) gpuInfo.throttled_flags.push('Soft temperature limit has occurred');

            gpuInfo.voltage_ok = !(throttledValue & 0x10001);
            gpuInfo.frequency_capped = !!(throttledValue & 0x20002);
            gpuInfo.throttling_active = !!(throttledValue & 0x40004);
          }
        }
      } catch {
        // vcgencmd peut ne pas être disponible
      }

      return gpuInfo;
    } catch (error) {
      logger.error('Error getting GPU info:', error);
      return gpuInfo;
    }
  }

  /**
   * Récupère l'état des services systemd critiques
   */
  async getServicesStatus() {
    const services = [
      { name: 'neopro-app', description: 'Socket.IO local (port 3000)' },
      { name: 'neopro-sync-agent', description: 'Synchronisation cloud' },
      { name: 'neopro-kiosk', description: 'Affichage TV (Chromium)' },
      { name: 'neopro-admin', description: 'Admin panel (port 8080)' },
      { name: 'nginx', description: 'Serveur web' },
      { name: 'hostapd', description: 'Hotspot WiFi' },
      { name: 'dnsmasq', description: 'DNS/DHCP hotspot' },
    ];

    const results = [];

    for (const service of services) {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${service.name} 2>/dev/null || echo "inactive"`);
        const status = stdout.trim();

        let statusInfo = {
          name: service.name,
          description: service.description,
          status: status,
          active: status === 'active',
          failed: status === 'failed',
        };

        // Si le service est failed, récupérer le message d'erreur
        if (status === 'failed') {
          try {
            const { stdout: errorOutput } = await execAsync(
              `journalctl -u ${service.name} -n 3 --no-pager -q 2>/dev/null | tail -1`
            );
            statusInfo.lastError = errorOutput.trim() || null;
          } catch {
            statusInfo.lastError = null;
          }
        }

        results.push(statusInfo);
      } catch {
        results.push({
          name: service.name,
          description: service.description,
          status: 'unknown',
          active: false,
          failed: false,
        });
      }
    }

    return results;
  }

  /**
   * Détecte les services systemd orphelins (non-légitimes) qui tournent sous le préfixe neopro-*.
   * Les services orphelins sont ceux qui ne font pas partie de la liste des services légitimes
   * et qui sont soit actifs soit en état "failed" (crash-loop via Restart=always).
   * Retourne un tableau d'objets { name, status, restarts } pour chaque orphelin détecté.
   */
  async getOrphanServices() {
    const LEGITIMATE_SERVICES = new Set([
      'neopro-app',
      'neopro-admin',
      'neopro-kiosk',
      'neopro-sync-agent',
      'neopro-sync-guardian',
      'neopro-hotspot-watchdog',
      'neopro-hotspot-optimizer',
      'neopro-usb-wifi',
      'neopro-sd-health',
      'neopro-backup',
      'neopro-video-processor',
    ]);

    const orphans = [];

    try {
      // List all neopro-* units known to systemd (active, failed, or loaded)
      const { stdout } = await execAsync(
        'systemctl list-units "neopro-*" --all --no-pager --no-legend --plain 2>/dev/null || true'
      );

      for (const line of stdout.trim().split('\n')) {
        if (!line.trim()) continue;
        // Format: UNIT LOAD ACTIVE SUB DESCRIPTION...
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;

        const unitName = parts[0].replace('.service', '');
        const activeState = parts[2]; // active, inactive, failed

        if (LEGITIMATE_SERVICES.has(unitName)) continue;
        if (!unitName.startsWith('neopro-')) continue;
        if (activeState === 'inactive') continue;

        // This is an orphan that's active or failed — get restart count
        let restarts = 0;
        try {
          const { stdout: nRestarts } = await execAsync(
            `systemctl show ${unitName} -p NRestarts --value 2>/dev/null || echo "0"`
          );
          restarts = parseInt(nRestarts.trim(), 10) || 0;
        } catch {
          // ignore
        }

        orphans.push({
          name: unitName,
          status: activeState,
          restarts,
        });
      }
    } catch (error) {
      logger.warn('Failed to detect orphan services:', error.message);
    }

    return orphans;
  }

  /**
   * Trouve le chemin du fichier EDID de l'écran HDMI connecté.
   * Cherche dans /sys/class/drm/ les connecteurs HDMI avec un EDID non vide.
   * @param {string} [portFilter] - Filtre optionnel sur le port (ex: 'HDMI-A-2' pour le secondaire)
   * @returns {string|null} Chemin vers le fichier EDID ou null
   */
  _findEdidPath(portFilter) {
    try {
      const drmDir = '/sys/class/drm';
      if (!fs.existsSync(drmDir)) return null;

      const entries = fs.readdirSync(drmDir);
      const hdmiEntries = portFilter
        ? entries.filter(e => e.includes(portFilter))
        : entries.filter(e => e.includes('HDMI'));

      for (const entry of hdmiEntries) {
        const edidPath = `${drmDir}/${entry}/edid`;
        try {
          // sysfs virtual files report stat.size=0 even when they have content.
          // Read the file and check buffer length instead.
          const buf = fs.readFileSync(edidPath);
          if (buf.length > 0) {
            return edidPath;
          }
        } catch {
          // Fichier n'existe pas ou pas accessible
        }
      }
    } catch (error) {
      logger.debug('Could not scan DRM directory for EDID:', error.message);
    }
    return null;
  }

  /**
   * Parse un buffer EDID brut (128+ bytes) pour extraire les informations d'affichage.
   * @param {Buffer} edidBuffer - Buffer EDID brut lu depuis /sys/class/drm/
   * @returns {{manufacturer: string|null, model: string|null, serial: string|null, resolution: string|null, hasCeaExtension: boolean}}
   */
  _parseEdid(edidBuffer) {
    const result = {
      manufacturer: null,
      model: null,
      serial: null,
      resolution: null,
      hasCeaExtension: false,
    };

    if (!edidBuffer || edidBuffer.length < 128) return result;

    // Vérifier le header EDID (bytes 0-7: 00 FF FF FF FF FF FF 00)
    const header = [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00];
    if (!header.every((b, i) => edidBuffer[i] === b)) return result;

    try {
      // Manufacturer ID (bytes 8-9, big-endian, 3 lettres sur 15 bits)
      const mfgCode = (edidBuffer[8] << 8) | edidBuffer[9];
      const char1 = String.fromCharCode(((mfgCode >> 10) & 0x1F) + 64);
      const char2 = String.fromCharCode(((mfgCode >> 5) & 0x1F) + 64);
      const char3 = String.fromCharCode((mfgCode & 0x1F) + 64);
      result.manufacturer = char1 + char2 + char3;
    } catch {
      // Parsing fabricant échoué
    }

    // Résolution native depuis le premier Detailed Timing Descriptor (bytes 54-71)
    try {
      const hActive = ((edidBuffer[58] & 0xF0) << 4) | edidBuffer[56];
      const vActive = ((edidBuffer[61] & 0xF0) << 4) | edidBuffer[59];
      if (hActive > 0 && vActive > 0) {
        result.resolution = `${hActive}x${vActive}`;
      }
    } catch {
      // Parsing résolution échoué
    }

    // Parcourir les 4 descriptor blocks (18 bytes chacun, à partir de byte 54)
    for (let i = 0; i < 4; i++) {
      const offset = 54 + (i * 18);
      if (offset + 18 > edidBuffer.length) break;

      if (edidBuffer[offset] === 0 && edidBuffer[offset + 1] === 0) {
        const tag = edidBuffer[offset + 3];

        if (tag === 0xFC) {
          // Monitor Name descriptor
          try {
            result.model = edidBuffer.slice(offset + 5, offset + 18)
              .toString('ascii').replace(/[\n\r\0]/g, '').trim();
          } catch {
            // Parsing nom échoué
          }
        } else if (tag === 0xFF) {
          // Serial Number descriptor
          try {
            result.serial = edidBuffer.slice(offset + 5, offset + 18)
              .toString('ascii').replace(/[\n\r\0]/g, '').trim();
          } catch {
            // Parsing serial échoué
          }
        }
      }
    }

    // CEA Extension Block (indice que c'est une TV)
    if (edidBuffer[126] > 0 && edidBuffer.length >= 256 && edidBuffer[128] === 0x02) {
      result.hasCeaExtension = true;
    }

    return result;
  }

  /**
   * Récupère les informations de l'écran connecté via EDID.
   * Permet de détecter le type d'écran (TV vs moniteur PC) et ses caractéristiques.
   * Enrichit avec edid-decode si disponible (résolutions supportées, taille physique, année).
   * @returns {Promise<{connected: boolean, manufacturer: string|null, model: string|null, serial: string|null, resolution: string|null, display_type: string, detection_method: string, edid_detailed: object|null}>}
   */
  async getDisplayInfo() {
    const now = Date.now();
    if (this._displayInfoCache && (now - this._displayInfoCacheTime) < this._DISPLAY_CACHE_TTL) {
      return this._displayInfoCache;
    }

    const displayInfo = {
      connected: false,
      manufacturer: null,
      model: null,
      serial: null,
      resolution: null,
      display_type: 'unknown',
      display_category: null,
      detection_method: 'none',
      edid_detailed: null,
    };

    try {
      const edidPath = this._findEdidPath();

      if (edidPath) {
        displayInfo.connected = true;
        try {
          const edidBuffer = fs.readFileSync(edidPath);
          const parsed = this._parseEdid(edidBuffer);
          displayInfo.manufacturer = parsed.manufacturer;
          displayInfo.model = parsed.model;
          displayInfo.serial = parsed.serial;
          displayInfo.resolution = parsed.resolution;
          displayInfo.detection_method = 'edid_raw';

          // CEA extension indique une TV potentielle, mais de nombreux moniteurs PC
          // modernes incluent aussi un bloc CEA pour la compatibilité HDMI (audio, YCbCr).
          // On utilise le manufacturer EDID pour filtrer les faux positifs :
          // les fabricants exclusivement moniteur ne doivent pas être classés "tv".
          const monitorOnlyMfg = /^(LEN|DEL|ACI|HWP|BNQ|ACR|EIZ|NEC|AOC)$/;
          if (parsed.hasCeaExtension && !monitorOnlyMfg.test((parsed.manufacturer || '').toUpperCase())) {
            displayInfo.display_type = 'tv';
          }
        } catch (error) {
          logger.debug('Could not parse EDID file:', error.message);
        }

        // Enrichir avec edid-decode si disponible
        try {
          const detailed = await this._runEdidDecode(edidPath);
          if (detailed) {
            displayInfo.edid_detailed = detailed;
          }
        } catch {
          // edid-decode non disponible ou erreur — on continue avec le parsing basique
        }
      } else {
        try {
          const drmDir = '/sys/class/drm';
          if (fs.existsSync(drmDir)) {
            const entries = fs.readdirSync(drmDir);
            const hdmiEntry = entries.find(e => e.includes('HDMI'));
            if (hdmiEntry) {
              displayInfo.detection_method = 'drm_status';
              // Vérifier le fichier status DRM pour la connexion physique
              const statusPath = `${drmDir}/${hdmiEntry}/status`;
              try {
                const status = fs.readFileSync(statusPath, 'utf8').trim();
                if (status === 'connected') {
                  displayInfo.connected = true;
                }
              } catch {
                // Fichier status inaccessible — on ne peut pas confirmer
              }
            }
          }
        } catch {
          // Pas de DRM disponible
        }
      }
    } catch (error) {
      logger.warn('Error getting display info:', error.message);
    }

    this._displayInfoCache = displayInfo;
    this._displayInfoCacheTime = now;
    return displayInfo;
  }

  /**
   * Récupère les informations EDID de l'écran secondaire (HDMI-A-2).
   * Même structure que getDisplayInfo() mais filtrée sur le second port HDMI.
   * @returns {Promise<{connected: boolean, manufacturer: string|null, model: string|null, serial: string|null, resolution: string|null, display_type: string, detection_method: string, edid_detailed: object|null}>}
   */
  async getSecondaryDisplayInfo() {
    const now = Date.now();
    if (this._secondaryDisplayInfoCache && (now - this._secondaryDisplayInfoCacheTime) < this._DISPLAY_CACHE_TTL) {
      return this._secondaryDisplayInfoCache;
    }

    const displayInfo = {
      connected: false,
      manufacturer: null,
      model: null,
      serial: null,
      resolution: null,
      display_type: 'unknown',
      display_category: null,
      detection_method: 'none',
      edid_detailed: null,
    };

    try {
      const edidPath = this._findEdidPath('HDMI-A-2');

      if (edidPath) {
        displayInfo.connected = true;
        try {
          const edidBuffer = fs.readFileSync(edidPath);
          const parsed = this._parseEdid(edidBuffer);
          displayInfo.manufacturer = parsed.manufacturer;
          displayInfo.model = parsed.model;
          displayInfo.serial = parsed.serial;
          displayInfo.resolution = parsed.resolution;
          displayInfo.detection_method = 'edid_raw';

          // CEA extension indique une TV potentielle, mais de nombreux moniteurs PC
          // modernes incluent aussi un bloc CEA pour la compatibilité HDMI (audio, YCbCr).
          // Filtrer par manufacturer EDID pour éviter les faux positifs moniteur → tv.
          const monitorOnlyMfg = /^(LEN|DEL|ACI|HWP|BNQ|ACR|EIZ|NEC|AOC)$/;
          if (parsed.hasCeaExtension && !monitorOnlyMfg.test((parsed.manufacturer || '').toUpperCase())) {
            displayInfo.display_type = 'tv';
          }
        } catch (error) {
          logger.debug('Could not parse secondary EDID file:', error.message);
        }

        // Enrichir avec edid-decode si disponible
        try {
          const detailed = await this._runEdidDecode(edidPath);
          if (detailed) {
            displayInfo.edid_detailed = detailed;
          }
        } catch {
          // edid-decode non disponible ou erreur — on continue avec le parsing basique
        }
      } else {
        try {
          const drmDir = '/sys/class/drm';
          if (fs.existsSync(drmDir)) {
            const entries = fs.readdirSync(drmDir);
            const hdmiEntry = entries.find(e => e.includes('HDMI-A-2'));
            if (hdmiEntry) {
              displayInfo.detection_method = 'drm_status';
              const statusPath = `${drmDir}/${hdmiEntry}/status`;
              try {
                const status = fs.readFileSync(statusPath, 'utf8').trim();
                if (status === 'connected') {
                  displayInfo.connected = true;
                }
              } catch {
                // Fichier status inaccessible
              }
            }
          }
        } catch {
          // Pas de DRM disponible
        }
      }
    } catch (error) {
      logger.warn('Error getting secondary display info:', error.message);
    }

    this._secondaryDisplayInfoCache = displayInfo;
    this._secondaryDisplayInfoCacheTime = now;
    return displayInfo;
  }

  /**
   * Exécute edid-decode sur le fichier EDID et parse la sortie.
   * @param {string} edidPath - Chemin vers le fichier EDID binaire
   * @returns {Promise<object|null>} Infos détaillées ou null si edid-decode indisponible
   */
  async _runEdidDecode(edidPath) {
    const { stdout } = await execAsync(`edid-decode "${edidPath}" 2>/dev/null`, { timeout: 5000 });
    return this._parseEdidDecodeOutput(stdout);
  }

  /**
   * Parse la sortie texte de edid-decode.
   * @param {string} output - Sortie stdout de edid-decode
   * @returns {object} Infos structurées extraites
   */
  _parseEdidDecodeOutput(output) {
    const result = {
      screen_size: null,
      year_of_manufacture: null,
      input_type: null,
      color_depth: null,
      supported_resolutions: [],
      audio_supported: false,
      native_resolution: null,
      max_refresh_rate: null,
      hdmi_version: null,
      hdr_supported: false,
      color_spaces: [],
      standby_supported: false,
      display_product_type: null,
      diagonal_inches: null,
    };

    const lines = output.split('\n');
    let maxRefresh = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Taille physique : "Maximum image size: 53 cm x 30 cm"
      const sizeMatch = trimmed.match(/Maximum image size:\s*(\d+)\s*cm\s*x\s*(\d+)\s*cm/i);
      if (sizeMatch) {
        result.screen_size = `${sizeMatch[1]}x${sizeMatch[2]}cm`;
      }

      // Année : "Made in week 51 of 2018" ou "Model year 2020"
      const yearMatch = trimmed.match(/(?:Made in week \d+ of|Model year)\s+(\d{4})/);
      if (yearMatch) {
        result.year_of_manufacture = parseInt(yearMatch[1], 10);
      }

      // Type d'entrée : "Digital display" ou "Analog display"
      if (/Digital display/i.test(trimmed)) {
        result.input_type = 'digital';
      } else if (/Analog display/i.test(trimmed)) {
        result.input_type = 'analog';
      }

      // Profondeur couleur : "Color depth: 8 bits" ou "8 bpc"
      const depthMatch = trimmed.match(/(?:Color depth|Maximum):\s*(\d+)\s*(?:bits|bpc)/i)
        || trimmed.match(/(\d+)\s*bpc/i);
      if (depthMatch && !result.color_depth) {
        result.color_depth = `${depthMatch[1]}bpc`;
      }

      // Résolutions depuis les detailed timings et standard timings
      const resMatch = trimmed.match(/(\d{3,5})x(\d{3,5})[pi]?\s/);
      if (resMatch) {
        const res = `${resMatch[1]}x${resMatch[2]}`;
        if (!result.supported_resolutions.includes(res)) {
          result.supported_resolutions.push(res);
        }
      }

      // Audio : "Audio:" ou "Basic audio support"
      if (/(?:Basic audio support|Audio:)/i.test(trimmed)) {
        result.audio_supported = true;
      }

      // Résolution native : premier DTD (Detailed Timing Descriptor)
      if (!result.native_resolution) {
        const nativeMatch = trimmed.match(/DTD\s+1:\s+(\d{3,5})x(\d{3,5})\s+[\d.]+\s*Hz/);
        if (nativeMatch) {
          result.native_resolution = `${nativeMatch[1]}x${nativeMatch[2]}`;
        }
      }

      // Refresh rate max depuis tous les DTDs et timings
      const hzMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*Hz/);
      if (hzMatch) {
        const hz = parseFloat(hzMatch[1]);
        if (hz > maxRefresh && hz < 500) {
          maxRefresh = hz;
        }
      }

      // Version HDMI déduite du TMDS clock max
      const tmdsMatch = trimmed.match(/Maximum TMDS clock:\s*(\d+)\s*MHz/i);
      if (tmdsMatch) {
        const tmds = parseInt(tmdsMatch[1], 10);
        if (tmds >= 600) result.hdmi_version = '2.1';
        else if (tmds >= 300) result.hdmi_version = '2.0';
        else result.hdmi_version = '1.4';
      }

      // HDR : "HDR Static Metadata", "SMPTE ST2084", "Hybrid Log-Gamma"
      if (/HDR Static Metadata|SMPTE ST2084|HDR10|Hybrid Log-Gamma|HLG/i.test(trimmed)) {
        result.hdr_supported = true;
      }

      // Espaces couleur
      if (/BT2020RGB/i.test(trimmed) && !result.color_spaces.includes('BT2020_RGB')) {
        result.color_spaces.push('BT2020_RGB');
      }
      if (/BT2020YCC/i.test(trimmed) && !result.color_spaces.includes('BT2020_YCC')) {
        result.color_spaces.push('BT2020_YCC');
      }
      if (/DC_Y444|YCbCr\s*4:4:4/i.test(trimmed) && !result.color_spaces.includes('YCbCr_444')) {
        result.color_spaces.push('YCbCr_444');
      }
      if (/YCbCr\s*4:2:2/i.test(trimmed) && !result.color_spaces.includes('YCbCr_422')) {
        result.color_spaces.push('YCbCr_422');
      }
      if (/YCbCr\s*4:2:0/i.test(trimmed) && !result.color_spaces.includes('YCbCr_420')) {
        result.color_spaces.push('YCbCr_420');
      }

      // Gestion de l'alimentation (DPMS)
      if (/DPMS levels:/i.test(trimmed)) {
        result.standby_supported = true;
      }

      // Type de produit : "Display Product Type: ..."
      const productTypeMatch = trimmed.match(/Display Product Type:\s*(.+)/i);
      if (productTypeMatch) {
        result.display_product_type = productTypeMatch[1].trim().toLowerCase();
      }
    }

    if (maxRefresh > 0) {
      result.max_refresh_rate = Math.round(maxRefresh);
    }

    // Diagonale en pouces calculée depuis la taille physique
    if (result.screen_size) {
      const sizeDigMatch = result.screen_size.match(/(\d+)x(\d+)cm/);
      if (sizeDigMatch) {
        const w = parseInt(sizeDigMatch[1], 10);
        const h = parseInt(sizeDigMatch[2], 10);
        result.diagonal_inches = Math.round(Math.sqrt(w * w + h * h) / 2.54);
      }
    }

    return result;
  }

  /**
   * Infère la catégorie d'écran en croisant nom de modèle, taille, audio et type détecté.
   * @param {string|null} model - Nom du modèle EDID
   * @param {string} displayType - 'tv' | 'monitor' | 'unknown'
   * @param {object|null} edidDetailed - Données edid-decode enrichies
   * @returns {string} 'tv_oled' | 'tv_qled' | 'tv_qned' | 'tv_led' | 'tv_lcd' | 'tv_plasma' | 'tv' | 'monitor' | 'projector' | 'unknown'
   */
  _inferDisplayCategory(model, displayType, edidDetailed, manufacturer) {
    const modelUpper = (model || '').toUpperCase();
    const detailed = edidDetailed || {};

    // Fabricants exclusivement moniteur — toujours classifier comme 'monitor'
    // même avec CEA audio/YCbCr (compatibilité HDMI standard sur moniteurs modernes)
    const monitorOnlyMfg = /^(LEN|DEL|ACI|HWP|BNQ|ACR|EIZ|NEC|AOC)$/;
    if (monitorOnlyMfg.test((manufacturer || '').toUpperCase())) {
      return 'monitor';
    }

    // Projecteur détecté via EDID
    if (detailed.display_product_type && /projector/i.test(detailed.display_product_type)) {
      return 'projector';
    }

    // Technologie de dalle détectée depuis le nom de modèle
    // Ordre important : OLED avant LED, QLED avant LED
    let panelTech = null;
    if (/OLED/.test(modelUpper)) {
      panelTech = 'oled';
    } else if (/QNED/.test(modelUpper)) {
      panelTech = 'qned';
    } else if (/QLED/.test(modelUpper)) {
      panelTech = 'qled';
    } else if (/NANO(?:CELL)?/.test(modelUpper)) {
      panelTech = 'led';
    } else if (/\bLED\b/.test(modelUpper)) {
      panelTech = 'led';
    } else if (/\bLCD\b/.test(modelUpper)) {
      panelTech = 'lcd';
    } else if (/PLASMA|PDP/.test(modelUpper)) {
      panelTech = 'plasma';
    }

    // Déterminer TV vs moniteur en croisant tous les signaux
    const diag = detailed.diagonal_inches;
    const isTV = displayType === 'tv' ||
                 detailed.audio_supported === true ||
                 (diag && diag >= 32);
    const isMonitor = displayType === 'monitor' ||
                      (diag && diag < 28 && !detailed.audio_supported);

    if (isTV && panelTech) return `tv_${panelTech}`;
    if (isTV) return 'tv';
    if (isMonitor) return 'monitor';

    return 'unknown';
  }

  /**
   * Récupère l'état de la TV via HDMI-CEC
   * Permet de savoir si la TV est allumée, en veille, ou déconnectée
   */
  async getHdmiCecStatus() {
    const cecStatus = {
      tv_power: null,        // 'on' | 'standby' | 'unknown' | null
      tv_connected: false,
      devices_found: 0,
      cec_available: false,
      last_check_at: null,
      error: null,
    };

    try {
      // Vérifier si cec-client est installé
      try {
        await execAsync('which cec-client', { timeout: 2000 });
        cecStatus.cec_available = true;
      } catch {
        cecStatus.cec_available = false;
        cecStatus.error = 'cec-client not installed';
        return cecStatus;
      }

      // Récupérer l'état de la TV (device 0 = TV)
      const { stdout } = await execAsync(
        'echo "pow 0" | timeout 5 cec-client -s -d 1 2>/dev/null',
        { timeout: 8000 }
      );

      cecStatus.last_check_at = new Date().toISOString();

      // Parser la réponse
      if (stdout.includes('power status: on')) {
        cecStatus.tv_power = 'on';
        cecStatus.tv_connected = true;
      } else if (stdout.includes('power status: standby')) {
        cecStatus.tv_power = 'standby';
        cecStatus.tv_connected = true;
      } else if (stdout.includes('power status: in transition')) {
        cecStatus.tv_power = 'transitioning';
        cecStatus.tv_connected = true;
      } else if (stdout.includes('power status:')) {
        cecStatus.tv_power = 'unknown';
        cecStatus.tv_connected = true;
      } else {
        cecStatus.tv_power = null;
        cecStatus.tv_connected = false;
        cecStatus.error = 'TV not responding to CEC';
      }

      // Compter les appareils CEC détectés
      const devicesMatch = stdout.match(/device #(\d+):/g);
      if (devicesMatch) {
        cecStatus.devices_found = devicesMatch.length;
      }

    } catch (error) {
      cecStatus.error = error.message;
      cecStatus.tv_connected = false;
      logger.warn('HDMI-CEC check failed:', error.message);
    }

    return cecStatus;
  }

  /**
   * Récupère le statut du kiosk Chromium via le fichier écrit par le watchdog.
   * Retourne null si le fichier n'existe pas (watchdog pas encore démarré).
   */
  async getKioskStatus() {
    const statusFile = '/home/pi/neopro/data/kiosk-status.json';
    try {
      const content = await fs.promises.readFile(statusFile, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Récupère un rapport de santé complet du système
   * Utilisé par la commande get_health_status
   */
  async getHealthStatus() {
    try {
      const [metrics, gpuInfo, services, systemInfo, hdmiCecStatus, displayInfo, fanStatus, secondaryDisplayInfo, orphanServices] = await Promise.all([
        this.collectAll(),
        this.getGpuInfo(),
        this.getServicesStatus(),
        this.getSystemInfo(),
        this.getHdmiCecStatus(),
        this.getDisplayInfo(),
        this.getFanStatus(),
        this.getSecondaryDisplayInfo(),
        this.getOrphanServices(),
      ]);

      // Affiner le type d'écran en croisant EDID + CEC
      // displayInfo.connected est fiable : basé sur EDID (taille > 0) ou DRM status file ("connected")
      // Note : hdmiCecStatus.tv_connected n'est PAS fiable pour la détection physique
      // (cec-client retourne "power status: unknown" même sans écran branché sur Pi 5)
      if (displayInfo.display_type === 'unknown') {
        if (hdmiCecStatus.devices_found > 0) {
          displayInfo.display_type = 'tv';
        } else if (hdmiCecStatus.cec_available && hdmiCecStatus.devices_found === 0 && displayInfo.connected) {
          displayInfo.display_type = 'monitor';
        }
      }

      // Inférer la catégorie d'écran (tv_oled, tv_led, monitor, projector, etc.)
      displayInfo.display_category = this._inferDisplayCategory(
        displayInfo.model, displayInfo.display_type, displayInfo.edid_detailed, displayInfo.manufacturer
      );

      // Inférer la catégorie du secondaire (pas de CEC — CEC = primaire uniquement sur Pi)
      if (secondaryDisplayInfo.connected) {
        secondaryDisplayInfo.display_category = this._inferDisplayCategory(
          secondaryDisplayInfo.model, secondaryDisplayInfo.display_type, secondaryDisplayInfo.edid_detailed, secondaryDisplayInfo.manufacturer
        );
      }

      // Calculer un score de santé global
      let healthScore = 100;
      const issues = [];

      // GPU Memory (critique sur Pi 4, ignoré sur Pi 5)
      // Sur Pi 5, vcgencmd get_mem gpu retourne toujours 4M (valeur legacy)
      // Ce n'est PAS un problème - le Pi 5 utilise la mémoire partagée CMA
      if (gpuInfo.gpu_mem_mb !== null && gpuInfo.gpu_mem_mb < 128 && !gpuInfo.is_pi5) {
        healthScore -= 30;
        issues.push({
          severity: 'critical',
          component: 'GPU',
          message: `Mémoire GPU insuffisante (${gpuInfo.gpu_mem_mb}M). Minimum requis: 128M, recommandé: 256M`,
          fix: 'Ajouter gpu_mem=256 dans /boot/config.txt et redémarrer',
        });
      }

      // Température
      if (gpuInfo.temperature !== null && gpuInfo.temperature > 80) {
        healthScore -= 20;
        issues.push({
          severity: 'warning',
          component: 'Temperature',
          message: `Température élevée: ${gpuInfo.temperature}°C`,
          fix: 'Améliorer la ventilation ou ajouter un dissipateur thermique',
        });
      }

      // Ventilateur (alerter uniquement si installé et arrêté à haute température)
      if (fanStatus.present && metrics && metrics.temperature > 70 && fanStatus.curState === 0) {
        healthScore -= 15;
        issues.push({
          severity: 'warning',
          component: 'Fan',
          message: `Ventilateur arrêté alors que la température est de ${metrics.temperature}°C`,
          fix: 'Vérifier la connexion du ventilateur ou les paramètres de refroidissement',
        });
      }

      // Alimentation (throttling)
      if (!gpuInfo.voltage_ok) {
        healthScore -= 25;
        issues.push({
          severity: 'critical',
          component: 'Power',
          message: 'Sous-voltage détecté. Alimentation insuffisante.',
          fix: 'Utiliser un chargeur 5V/3A officiel',
        });
      }

      // Services critiques
      const criticalServices = ['neopro-app', 'neopro-sync-agent', 'neopro-kiosk', 'nginx'];
      for (const svc of services) {
        if (criticalServices.includes(svc.name) && svc.failed) {
          healthScore -= 15;
          issues.push({
            severity: 'critical',
            component: 'Service',
            message: `Service ${svc.name} en échec`,
            fix: `sudo systemctl restart ${svc.name}`,
            lastError: svc.lastError,
          });
        }
      }

      // Kiosk Chromium check — le service systemd peut être "active" (watchdog tourne)
      // mais Chromium peut être crashé. Vérifier le fichier de statut du watchdog.
      const kioskStatus = await this.getKioskStatus();
      if (kioskStatus) {
        if (!kioskStatus.chromiumAlive) {
          healthScore -= 20;
          issues.push({
            severity: 'critical',
            component: 'Kiosk',
            message: 'Chromium non actif — la TV n\'affiche rien',
            fix: 'sudo systemctl restart neopro-kiosk',
          });
        }
        if (kioskStatus.restartCount > 3) {
          healthScore -= 10;
          issues.push({
            severity: 'warning',
            component: 'Kiosk',
            message: `Chromium a redémarré ${kioskStatus.restartCount} fois récemment (instabilité GPU)`,
            fix: 'Vérifier les logs GPU: journalctl -u neopro-kiosk -n 50',
          });
        }
        if (kioskStatus.lxpanelKillCount > 0) {
          issues.push({
            severity: 'warning',
            component: 'Kiosk',
            message: `lxpanel tuée ${kioskStatus.lxpanelKillCount} fois (barre de tâches parasite)`,
            fix: 'Vérifier autostart LXDE: grep lxpanel ~/.config/lxsession/LXDE-pi/autostart — doit être absent',
          });
        }
        if (kioskStatus.gpuDecodeMode === 'software') {
          healthScore -= 5;
          issues.push({
            severity: 'warning',
            component: 'Kiosk',
            message: 'GPU decode en mode software (hardware V4L2 crashé — coil whine PMIC possible)',
            fix: 'Redémarrer le boîtier pour re-tenter le hardware decode. Si récurrent, vérifier version Chromium (128+ requis) et V4L2: v4l2-ctl --list-devices',
          });
        }
      }

      // Mémoire système
      if (metrics && metrics.memory > 90) {
        healthScore -= 10;
        issues.push({
          severity: 'warning',
          component: 'Memory',
          message: `Utilisation mémoire élevée: ${metrics.memory}%`,
          fix: 'Redémarrer le boîtier pour libérer la mémoire',
        });
      }

      // Disque
      if (metrics && metrics.disk > 90) {
        healthScore -= 10;
        issues.push({
          severity: 'warning',
          component: 'Disk',
          message: `Espace disque faible: ${metrics.disk}% utilisé`,
          fix: 'Supprimer des vidéos inutilisées',
        });
      }

      // HDMI Failover — pénaliser si le Pi fonctionne en mode failover
      // (HDMI-0 perdu, Chromium promu sur HDMI-1)
      if (kioskStatus && kioskStatus.hdmiFailoverActive) {
        healthScore -= 15;
        issues.push({
          severity: 'warning',
          component: 'HDMI',
          message: 'HDMI-0 déconnecté — failover actif sur HDMI-1',
          fix: 'Vérifier le câble HDMI sur le port HDMI-0 (le plus proche du USB-C)',
        });
      }

      // HDMI-CEC / TV Status — ne pas alerter si c'est un moniteur PC (CEC non supporté)
      const isMonitor = displayInfo.display_type === 'monitor';
      if (hdmiCecStatus.cec_available && !hdmiCecStatus.tv_connected && !isMonitor) {
        issues.push({
          severity: 'warning',
          component: 'HDMI-CEC',
          message: 'TV non détectée via HDMI-CEC',
          fix: 'Vérifier le câble HDMI et que la TV supporte CEC',
        });
      } else if (hdmiCecStatus.tv_power === 'standby') {
        issues.push({
          severity: 'warning',
          component: 'HDMI-CEC',
          message: 'TV en veille',
          fix: 'La TV est en veille - les vidéos ne sont pas visibles',
        });
      }

      // Orphan systemd services — manually installed services crash-looping
      if (orphanServices.length > 0) {
        healthScore -= 5;
        for (const orphan of orphanServices) {
          issues.push({
            severity: 'warning',
            component: 'SystemdOrphan',
            message: `Service orphelin ${orphan.name} (${orphan.status}, ${orphan.restarts} restarts)`,
            fix: `sudo systemctl disable --now ${orphan.name} && sudo rm -f /etc/systemd/system/${orphan.name}.service && sudo systemctl daemon-reload`,
          });
        }
      }

      return {
        success: true,
        timestamp: new Date().toISOString(),
        healthScore: Math.max(0, healthScore),
        healthStatus: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'critical',
        issues,
        gpu: gpuInfo,
        fanStatus,
        services,
        orphanServices: orphanServices.length > 0 ? orphanServices : undefined,
        metrics,
        hdmiCecStatus,
        displayInfo,
        secondaryDisplayInfo: secondaryDisplayInfo.connected ? secondaryDisplayInfo : undefined,
        system: {
          hostname: systemInfo?.hostname,
          os: systemInfo?.os,
          uptime: metrics?.uptime,
          localIp: metrics?.localIp,
        },
      };
    } catch (error) {
      logger.error('Error getting health status:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

module.exports = new MetricsCollector();
