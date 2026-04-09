/**
 * Hardware Metrics — CPU, memory, temperature, disk, GPU, fan, network, system info.
 * Extracted from metrics.js (ADR-044).
 */

const si = require('systeminformation');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const logger = require('../logger');

const execAsync = util.promisify(exec);

// =============================================================================
// PI MODEL CACHE
// =============================================================================

let _piModel = null;
let _isPi5 = null;

/**
 * Détecte le modèle de Raspberry Pi
 * @returns {Promise<{model: string, isPi5: boolean}>}
 */
async function detectPiModel() {
  if (_piModel !== null) {
    return { model: _piModel, isPi5: _isPi5 };
  }

  try {
    const modelPath = '/proc/device-tree/model';
    if (fs.existsSync(modelPath)) {
      const model = fs.readFileSync(modelPath, 'utf8').replace(/\0/g, '').trim();
      _piModel = model;
      _isPi5 = model.includes('Raspberry Pi 5');
      logger.info(`Raspberry Pi model detected: ${model} (isPi5: ${_isPi5})`);
      return { model: _piModel, isPi5: _isPi5 };
    }
  } catch (error) {
    logger.warn('Could not detect Pi model:', error.message);
  }

  _piModel = 'unknown';
  _isPi5 = false;
  return { model: _piModel, isPi5: _isPi5 };
}

// =============================================================================
// BASIC METRICS
// =============================================================================

async function getCpuUsage() {
  try {
    const load = await si.currentLoad();
    return parseFloat(load.currentLoad.toFixed(1));
  } catch (error) {
    logger.error('Error getting CPU usage:', error);
    return 0;
  }
}

async function getMemoryUsage() {
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

async function getTemperature() {
  try {
    const temp = await si.cpuTemperature();
    return parseFloat((temp.main || temp.cores?.[0] || 0).toFixed(1));
  } catch (error) {
    return 0;
  }
}

async function getDiskUsage() {
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

async function getLocalIp() {
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

// =============================================================================
// WIFI STATUS
// =============================================================================

/**
 * Récupère l'état de la connexion réseau (WiFi USB / Ethernet) pour le heartbeat.
 * Gère 3 scénarios : WiFi USB seul, Ethernet seul, dual (eth0 + wlan1).
 */
async function getWifiStatus() {
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

// =============================================================================
// NETWORK & SYSTEM INFO
// =============================================================================

async function getNetworkStatus() {
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

async function getSystemInfo() {
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

// =============================================================================
// FAN STATUS
// =============================================================================

/**
 * Récupère l'état du ventilateur depuis /sys/class/thermal/cooling_device0/
 * Pi 5 Active Cooler: cur_state 0-4 (off, low, medium, high, full)
 * Pi 4 Fan HAT: cur_state 0 ou 1 (off/on)
 * Retourne present: false si aucun ventilateur détecté (pas d'alerte)
 *
 * @returns {Promise<{present: boolean, type: string|null, curState: number|null, maxState: number|null, speedPercent: number|null, is_pi5: boolean}>}
 */
async function getFanStatus() {
  const { isPi5 } = await detectPiModel();

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

// =============================================================================
// FILESYSTEM HEALTH
// =============================================================================

/**
 * Santé filesystem SD card.
 * Détecte les erreurs EXT4 dans dmesg et l'état read-only.
 * Léger (pas de tune2fs qui nécessite sudo) — adapté au heartbeat périodique.
 * @returns {Promise<{ext4Errors: number, isReadOnly: boolean} | null>}
 */
async function getFilesystemHealth() {
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

// =============================================================================
// GPU INFO
// =============================================================================

/**
 * Récupère les informations GPU spécifiques au Raspberry Pi via vcgencmd
 * Critique pour diagnostiquer les crashs Chromium (Aw, Snap!)
 *
 * NOTE: Sur Pi 5 (VideoCore VII), gpu_mem n'est plus configurable.
 * Le GPU utilise la mémoire partagée CMA (Contiguous Memory Allocator).
 * vcgencmd get_mem gpu retourne toujours 4M (valeur legacy) sur Pi 5.
 * Ce n'est PAS un problème - le Pi 5 gère la mémoire GPU dynamiquement.
 */
async function getGpuInfo() {
  const { isPi5 } = await detectPiModel();

  const gpuInfo = {
    gpu_mem_mb: null,
    gpu_mem_warning: false,
    gpu_mem_note: null,
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
    try {
      const { stdout: gpuMemOutput } = await execAsync('vcgencmd get_mem gpu 2>/dev/null');
      const match = gpuMemOutput.match(/gpu=(\d+)M/);
      if (match) {
        gpuInfo.gpu_mem_mb = parseInt(match[1]);

        if (isPi5) {
          gpuInfo.gpu_mem_warning = false;
          gpuInfo.gpu_mem_note = 'Pi 5 uses dynamic shared memory (CMA). The 4M value is a legacy indicator, not actual GPU memory.';
        } else {
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

// =============================================================================
// COLLECT ALL
// =============================================================================

/** @returns {Promise<import('../types').SystemMetrics>} */
async function collectAll() {
  try {
    const [cpu, memory, temperature, disk, localIp, wifiStatus, fanStatus] = await Promise.all([
      getCpuUsage(),
      getMemoryUsage(),
      getTemperature(),
      getDiskUsage(),
      getLocalIp(),
      getWifiStatus(),
      getFanStatus(),
    ]);

    // Filesystem health (non-bloquant, collecté en parallèle des autres métriques)
    const filesystemHealth = await getFilesystemHealth();

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

module.exports = {
  detectPiModel,
  getCpuUsage,
  getMemoryUsage,
  getTemperature,
  getDiskUsage,
  getLocalIp,
  getWifiStatus,
  getNetworkStatus,
  getSystemInfo,
  getFanStatus,
  getFilesystemHealth,
  getGpuInfo,
  collectAll,
};
