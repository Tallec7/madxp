/**
 * SystemService
 *
 * Logique m\u00e9tier pour les informations syst\u00e8me, gestion de version,
 * lecture des logs et contr\u00f4le des services systemd.
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
    /** @private */
    this._versionCache = null;
    /** @private */
    this._versionCacheTimestamp = 0;
    /** @private @type {number} TTL in ms for version cache (1 minute) */
    this._VERSION_CACHE_TTL = 60000;
  }

  // ---------------------------------------------------------------------------
  // System info
  // ---------------------------------------------------------------------------

  /**
   * Collect comprehensive Raspberry Pi system information.
   *
   * Gathers CPU usage, memory, temperature (thermal zone), disk usage,
   * uptime, and systemd service statuses in a single call.
   *
   * @returns {Promise<{cpu: {usage: string, cores: number}, memory: {total: string, used: string, free: string, percent: string}, temperature: string, disk: object|null, uptime: string, services: Object<string,string>, hostname: string, platform: string, arch: string}>}
   */
  async getSystemInfo() {
    try {
      const cpuUsage = await this._getCpuUsage();

      // M\u00e9moire
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      // Temp\u00e9rature (Raspberry Pi)
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

  /**
   * Get the current Neopro version with fallback chain.
   *
   * Resolution order:
   * 1. `release.json` — written by the deploy pipeline
   * 2. `webapp/version.json` — written by Angular build
   * 3. `VERSION` file — manual fallback
   * 4. `package.json` — last resort
   *
   * Results are cached for 1 minute to avoid repeated file reads.
   *
   * @returns {Promise<{version: string, commit: string|null, buildDate: string|null, source: string}>}
   */
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

  /**
   * Read recent journal logs for a given service.
   *
   * @param {string} service — One of `'app'`, `'nginx'`, or `'system'`
   * @param {number} [lines=100] — Number of log lines to return
   * @returns {Promise<string>} Raw journalctl output
   * @throws {ValidationError} If the service name is not in the allowed list
   * @throws {CommandError} If journalctl fails
   */
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

  /**
   * Restart a systemd service.
   *
   * Only `neopro-app`, `nginx`, and `neopro-kiosk` are allowed.
   *
   * @param {string} service — Systemd unit name
   * @throws {ValidationError} If the service is not in the allowlist
   * @throws {CommandError} If systemctl restart fails
   */
  async restartService(service) {
    const allowedServices = ['neopro-app', 'nginx', 'neopro-kiosk'];
    if (!allowedServices.includes(service)) {
      throw new ValidationError('Service non autoris\u00e9');
    }

    const result = await execCommand(`sudo systemctl restart ${service}`);
    if (!result.success) {
      throw new CommandError(result.error);
    }
  }

  /**
   * Schedule a system reboot in 5 seconds.
   *
   * Uses `sudo reboot` via child_process. The delay gives the HTTP
   * response time to be sent before the Pi reboots.
   */
  reboot() {
    const { exec } = require('child_process');
    setTimeout(() => {
      exec('sudo reboot');
    }, 5000);
  }

  /**
   * Schedule a system shutdown in 5 seconds.
   *
   * Uses `sudo shutdown -h now` via child_process. The delay gives the
   * HTTP response time to be sent before the Pi powers off.
   */
  shutdown() {
    const { exec } = require('child_process');
    setTimeout(() => {
      exec('sudo shutdown -h now');
    }, 5000);
  }

  // ---------------------------------------------------------------------------
  // Apply systemd services & sudoers from deployed config
  // ---------------------------------------------------------------------------

  /**
   * Copy systemd service files and sudoers from the deployed config
   * into their system locations, then daemon-reload and restart.
   *
   * This fixes Pi units stuck with old service files (e.g. NoNewPrivileges=true)
   * after an OTA that only updated /home/pi/neopro/config/ but could not
   * copy into /etc/systemd/system/ due to privilege restrictions.
   *
   * @returns {Promise<{applied: string[], errors: string[]}>}
   */
  async applySystemdServices() {
    const applied = [];
    const errors = [];

    // 1. Copy sudoers if present
    const sudoersSrc = path.join(NEOPRO_DIR, 'config', 'sudoers.d', 'neopro');
    try {
      await fs.access(sudoersSrc);
      const cpResult = await execCommand(`sudo cp ${sudoersSrc} /etc/sudoers.d/neopro`);
      if (cpResult.success) {
        await execCommand('sudo chown root:root /etc/sudoers.d/neopro');
        await execCommand('sudo chmod 440 /etc/sudoers.d/neopro');
        applied.push('sudoers');
      } else {
        errors.push(`sudoers: ${cpResult.error}`);
      }
    } catch {
      // sudoers file not present in deployed config, skip
    }

    // 2. Copy all .service files from config/systemd/
    const systemdDir = path.join(NEOPRO_DIR, 'config', 'systemd');
    try {
      await fs.access(systemdDir);
      const files = await fs.readdir(systemdDir);
      const serviceFiles = files.filter(f => f.endsWith('.service'));

      for (const svcFile of serviceFiles) {
        const src = path.join(systemdDir, svcFile);
        const cpResult = await execCommand(`sudo cp ${src} /etc/systemd/system/${svcFile}`);
        if (cpResult.success) {
          await execCommand(`sudo chown root:root /etc/systemd/system/${svcFile}`);
          await execCommand(`sudo chmod 644 /etc/systemd/system/${svcFile}`);
          applied.push(svcFile);
        } else {
          errors.push(`${svcFile}: ${cpResult.error}`);
        }
      }

      // 3. daemon-reload
      if (applied.length > 0) {
        await execCommand('sudo systemctl daemon-reload');
      }

      // 4. Restart sync-agent if its service file was updated
      if (applied.includes('neopro-sync-agent.service')) {
        await execCommand('sudo systemctl restart neopro-sync-agent');
        applied.push('sync-agent-restarted');
      }
    } catch {
      // config/systemd/ directory not present, skip
    }

    // 5. Deploy udev rules if present
    const udevDir = path.join(NEOPRO_DIR, 'config', 'udev');
    try {
      await fs.access(udevDir);
      const udevFiles = await fs.readdir(udevDir);
      const ruleFiles = udevFiles.filter(f => f.endsWith('.rules'));

      for (const rule of ruleFiles) {
        const src = path.join(udevDir, rule);
        const cpResult = await execCommand(`sudo cp ${src} /etc/udev/rules.d/${rule}`);
        if (cpResult.success) {
          applied.push(rule);
        } else {
          errors.push(`${rule}: ${cpResult.error}`);
        }
      }

      if (ruleFiles.length > 0) {
        await execCommand('sudo udevadm control --reload-rules');
        await execCommand('sudo udevadm trigger');
      }
    } catch {
      // config/udev/ directory not present, skip
    }

    console.log(`[system] apply-services: applied=${applied.join(',')} errors=${errors.join(',')}`);
    return { applied, errors };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Calculate current CPU usage from os.cpus() snapshot.
   * @private
   * @returns {Promise<{usage: string, cores: number}>}
   */
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

  /**
   * Query systemd for the status of core Pi services.
   * @private
   * @returns {Promise<Object<string, 'running'|'stopped'|'unknown'|'unavailable'>>}
   */
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
