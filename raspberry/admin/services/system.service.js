/**
 * SystemService
 *
 * Logique métier pour les informations système, gestion de version,
 * lecture des logs et contrôle des services systemd.
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const {
  NEOPRO_DIR,
  VERSION_FILE,
  RELEASE_METADATA_FILE,
  execCommand,
  formatUptime,
  parseDiskInfo,
} = require('../helpers');

const { ValidationError, CommandError } = require('./errors');

class SystemService {
  constructor() {
    this._versionCache = null;
    this._versionCacheTimestamp = 0;
    this._VERSION_CACHE_TTL = 60000; // 1 minute
  }

  // ---------------------------------------------------------------------------
  // System info
  // ---------------------------------------------------------------------------

  async getSystemInfo() {
    try {
      const cpuUsage = await this._getCpuUsage();

      // Mémoire
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      // Température (Raspberry Pi)
      const tempResult = await execCommand('cat /sys/class/thermal/thermal_zone0/temp');
      const temperature = tempResult.success
        ? (parseInt(tempResult.output) / 1000).toFixed(1)
        : 'N/A';

      // Stockage
      const diskResult = await execCommand(`df -h ${NEOPRO_DIR} | tail -1`);
      const diskInfo = diskResult.success ? parseDiskInfo(diskResult.output) : null;

      // Uptime
      const uptimeSeconds = os.uptime();
      const uptime = formatUptime(uptimeSeconds);

      // Status des services
      const services = await this._getServicesStatus();

      return {
        cpu: cpuUsage,
        memory: {
          total: (totalMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
          used: (usedMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
          free: (freeMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
          percent: ((usedMem / totalMem) * 100).toFixed(1) + '%',
        },
        temperature: temperature + '\u00B0C',
        disk: diskInfo,
        uptime,
        services,
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
      };
    } catch (error) {
      console.error('Error getting system info:', error);
      return { error: error.message };
    }
  }

  // ---------------------------------------------------------------------------
  // Version info (with TTL cache)
  // ---------------------------------------------------------------------------

  async getVersionInfo() {
    const now = Date.now();
    if (this._versionCache && now - this._versionCacheTimestamp < this._VERSION_CACHE_TTL) {
      return this._versionCache;
    }

    const info = {
      version: 'unknown',
      commit: null,
      buildDate: null,
      source: 'local',
    };

    // 1) release.json
    try {
      const releaseRaw = await fs.readFile(RELEASE_METADATA_FILE, 'utf8');
      const releaseData = JSON.parse(releaseRaw);
      if (releaseData.version) info.version = releaseData.version;
      info.commit = releaseData.commit || null;
      info.buildDate = releaseData.buildDate || null;
      info.source = releaseData.source || info.source;
    } catch {
      // release.json absent -> fallback
    }

    // 2) webapp/version.json
    if (!info.version || info.version === 'unknown') {
      try {
        const raw = await fs.readFile(path.join(NEOPRO_DIR, 'webapp', 'version.json'), 'utf8');
        const webappVersion = JSON.parse(raw);
        if (webappVersion && webappVersion.version) {
          info.version = webappVersion.version;
          info.source = 'webapp/version.json';
          info.commit = info.commit || webappVersion.commit || null;
          info.buildDate = info.buildDate || webappVersion.buildDate || null;
        }
      } catch {
        // ignore
      }
    }

    // 3) VERSION file
    if (!info.version || info.version === 'unknown') {
      try {
        const versionRaw = await fs.readFile(VERSION_FILE, 'utf8');
        const trimmed = versionRaw.trim();
        if (trimmed) {
          info.version = trimmed;
          info.source = 'version-file';
        }
      } catch {
        // ignore
      }
    }

    // 4) package.json
    if (!info.version || info.version === 'unknown') {
      try {
        const pkgRaw = await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf8');
        const pkgJson = JSON.parse(pkgRaw);
        if (pkgJson.version) {
          info.version = pkgJson.version;
          info.source = 'package.json';
        }
      } catch {
        // ignore
      }
    }

    this._versionCache = info;
    this._versionCacheTimestamp = now;
    return info;
  }

  // ---------------------------------------------------------------------------
  // Logs
  // ---------------------------------------------------------------------------

  async getServiceLogs(service, lines = 100) {
    const serviceMap = {
      app: 'neopro-app',
      nginx: 'nginx',
      system: '',
    };

    const serviceName = serviceMap[service];
    if (serviceName === undefined) {
      throw new ValidationError('Service invalide');
    }

    const command = serviceName
      ? `journalctl -u ${serviceName} -n ${lines} --no-pager`
      : `journalctl -n ${lines} --no-pager`;

    const result = await execCommand(command);
    if (!result.success) {
      throw new CommandError(result.error);
    }
    return result.output;
  }

  // ---------------------------------------------------------------------------
  // Service control
  // ---------------------------------------------------------------------------

  async restartService(service) {
    const allowedServices = ['neopro-app', 'nginx', 'neopro-kiosk'];
    if (!allowedServices.includes(service)) {
      throw new ValidationError('Service non autorisé');
    }

    const result = await execCommand(`sudo systemctl restart ${service}`);
    if (!result.success) {
      throw new CommandError(result.error);
    }
  }

  reboot() {
    const { exec } = require('child_process');
    setTimeout(() => {
      exec('sudo reboot');
    }, 5000);
  }

  shutdown() {
    const { exec } = require('child_process');
    setTimeout(() => {
      exec('sudo shutdown -h now');
    }, 5000);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  async _getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (100 * idle) / total;

    return {
      usage: usage.toFixed(1) + '%',
      cores: cpus.length,
    };
  }

  async _getServicesStatus() {
    const services = ['neopro-app', 'nginx', 'hostapd', 'dnsmasq', 'avahi-daemon'];
    const statuses = {};

    if (os.platform() !== 'linux') {
      services.forEach((service) => {
        statuses[service] = 'unavailable';
      });
      return statuses;
    }

    for (const service of services) {
      const result = await execCommand(`systemctl is-active ${service}`);
      if (!result.success || !result.output) {
        statuses[service] = 'unknown';
      } else {
        statuses[service] = result.output.trim() === 'active' ? 'running' : 'stopped';
      }
    }

    return statuses;
  }
}

module.exports = SystemService;
