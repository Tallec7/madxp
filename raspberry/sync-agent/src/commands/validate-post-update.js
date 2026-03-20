const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

/**
 * Validation post-OTA du Raspberry Pi.
 *
 * Deux niveaux :
 * - **critical** : échec = rollback automatique (services morts, app injoignable, config corrompue)
 * - **warning**  : signalé dans le rapport mais ne bloque pas l'OTA
 *
 * Peut aussi être appelé standalone via l'admin route POST /api/system/validate.
 */
class PostUpdateValidator {
  /**
   * Lance la validation complète.
   * @param {object} [options]
   * @param {boolean} [options.throwOnCritical=true] - true = throw si un check critique échoue (mode OTA)
   * @param {number}  [options.timeoutMs=30000]      - timeout global
   * @returns {Promise<ValidationReport>}
   */
  async validate(options = {}) {
    const { throwOnCritical = true, timeoutMs = 30000 } = options;
    const startTime = Date.now();

    /** @type {ValidationReport} */
    const report = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      healthy: true,
      critical: [],
      warnings: [],
      checks: {},
    };

    // --- Checks critiques (échec = rollback) ---
    await this._checkServices(report);
    await this._checkAppHealth(report);
    await this._checkAdminHealth(report);
    await this._checkConfigIntegrity(report);
    await this._checkWebappIntegrity(report);

    // --- Checks warning (informatif) ---
    await this._checkHdmiDisplay(report);
    await this._checkNginx(report);
    await this._checkDiskSpace(report);
    await this._checkAnalyticsBuffer(report);
    await this._checkVideoDirectory(report);
    await this._checkChromiumProcess(report);
    await this._checkSocketConnections(report);

    report.durationMs = Date.now() - startTime;
    report.healthy = report.critical.length === 0;

    logger.info('Post-update validation completed', {
      healthy: report.healthy,
      criticalCount: report.critical.length,
      warningCount: report.warnings.length,
      durationMs: report.durationMs,
    });

    if (throwOnCritical && report.critical.length > 0) {
      const msg = `Post-OTA validation failed: ${report.critical.map(c => c.message).join('; ')}`;
      logger.error(msg, { report });
      const err = new Error(msg);
      err.validationReport = report;
      throw err;
    }

    return report;
  }

  // ─────────────────────── CRITICAL CHECKS ───────────────────────

  async _checkServices(report) {
    const requiredServices = ['neopro-app', 'neopro-admin'];
    const results = {};

    for (const service of requiredServices) {
      try {
        const { stdout } = await execAsync(
          `systemctl is-active ${service} 2>/dev/null || echo "inactive"`
        );
        const status = stdout.trim();
        results[service] = status;

        if (status !== 'active') {
          report.critical.push({
            check: 'services',
            message: `Service ${service} is ${status} (expected: active)`,
            service,
            status,
          });
        }
      } catch (error) {
        results[service] = 'error';
        report.critical.push({
          check: 'services',
          message: `Cannot check service ${service}: ${error.message}`,
          service,
        });
      }
    }

    report.checks.services = results;
  }

  async _checkAppHealth(report) {
    try {
      const response = await axios.get('http://localhost:3000/', { timeout: 8000 });
      const data = response.data;
      report.checks.appHealth = {
        status: data.status,
        connections: data.connections,
        responding: true,
      };

      if (data.status !== 'ok') {
        report.critical.push({
          check: 'appHealth',
          message: `App health status: ${data.status} (expected: ok)`,
        });
      }
    } catch (error) {
      report.checks.appHealth = { responding: false, error: error.message };
      report.critical.push({
        check: 'appHealth',
        message: `Socket.IO server not responding on port 3000: ${error.message}`,
      });
    }
  }

  async _checkAdminHealth(report) {
    try {
      const response = await axios.get('http://localhost:8080/api/version', { timeout: 8000 });
      report.checks.adminHealth = { responding: true, version: response.data };
    } catch (error) {
      report.checks.adminHealth = { responding: false, error: error.message };
      report.critical.push({
        check: 'adminHealth',
        message: `Admin server not responding on port 8080: ${error.message}`,
      });
    }
  }

  async _checkConfigIntegrity(report) {
    const configPath = config.paths.config;
    try {
      if (!(await fs.pathExists(configPath))) {
        report.checks.config = { exists: false };
        report.critical.push({
          check: 'config',
          message: `configuration.json missing: ${configPath}`,
        });
        return;
      }

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      const hasSiteId = !!(parsed.siteId || parsed.site_id);
      report.checks.config = { exists: true, validJson: true, hasSiteId };

      if (!hasSiteId) {
        report.warnings.push({
          check: 'config',
          message: 'configuration.json has no siteId (site not yet registered)',
        });
      }
    } catch (error) {
      report.checks.config = { exists: true, validJson: false, error: error.message };
      report.critical.push({
        check: 'config',
        message: `configuration.json is corrupted: ${error.message}`,
      });
    }
  }

  async _checkWebappIntegrity(report) {
    const webappDir = path.join(config.paths.root, 'webapp');
    const indexPath = path.join(webappDir, 'index.html');

    try {
      const exists = await fs.pathExists(indexPath);
      report.checks.webapp = { indexHtml: exists };

      if (!exists) {
        report.critical.push({
          check: 'webapp',
          message: 'webapp/index.html missing — Angular app not deployed',
        });
      }
    } catch (error) {
      report.checks.webapp = { error: error.message };
      report.critical.push({
        check: 'webapp',
        message: `Cannot verify webapp integrity: ${error.message}`,
      });
    }
  }

  // ─────────────────────── WARNING CHECKS ───────────────────────

  async _checkHdmiDisplay(report) {
    try {
      // Check DRM sysfs for any connected HDMI port
      const { stdout } = await execAsync(
        'cat /sys/class/drm/card?-HDMI-A-*/status 2>/dev/null || echo "no_drm"'
      );
      const lines = stdout.trim().split('\n');
      const anyConnected = lines.some(line => line.trim() === 'connected');

      report.checks.hdmi = {
        anyConnected,
        ports: lines.map(l => l.trim()),
      };

      if (!anyConnected && !lines.includes('no_drm')) {
        report.warnings.push({
          check: 'hdmi',
          message: 'No HDMI display connected — TV will show waiting screen',
        });
      }
    } catch (error) {
      report.checks.hdmi = { error: error.message };
    }
  }

  async _checkNginx(report) {
    try {
      // nginx sert le webapp Angular sur le port 4200 (ou 80)
      const response = await axios.get('http://localhost:4200/', {
        timeout: 5000,
        validateStatus: () => true, // Accept any HTTP status
      });
      report.checks.nginx = { responding: true, statusCode: response.status };
    } catch (error) {
      report.checks.nginx = { responding: false, error: error.message };
      report.warnings.push({
        check: 'nginx',
        message: `nginx not serving webapp on port 4200: ${error.message}`,
      });
    }
  }

  async _checkDiskSpace(report) {
    try {
      const { stdout } = await execAsync(
        "(df -B1 /home/pi 2>/dev/null || df -B1 /) | tail -1 | awk '{print $4}'"
      );
      const availableBytes = parseInt(stdout.trim()) || 0;
      const availableMB = Math.round(availableBytes / (1024 * 1024));

      report.checks.diskSpace = { availableMB };

      if (availableMB < 500) {
        report.warnings.push({
          check: 'diskSpace',
          message: `Low disk space: ${availableMB}MB available (threshold: 500MB)`,
        });
      }
    } catch (error) {
      report.checks.diskSpace = { error: error.message };
    }
  }

  async _checkAnalyticsBuffer(report) {
    const dataDir = path.join(config.paths.root, 'data');
    try {
      if (!(await fs.pathExists(dataDir))) {
        report.checks.analyticsBuffer = { exists: false };
        return;
      }

      const files = await fs.readdir(dataDir);
      const analyticsFiles = files.filter(f => f.startsWith('analytics'));
      let totalSizeMB = 0;

      for (const file of analyticsFiles) {
        try {
          const stat = await fs.stat(path.join(dataDir, file));
          totalSizeMB += stat.size / (1024 * 1024);
        } catch {
          // File may have been removed between readdir and stat
        }
      }

      totalSizeMB = Math.round(totalSizeMB * 100) / 100;
      report.checks.analyticsBuffer = { fileCount: analyticsFiles.length, totalSizeMB };

      if (totalSizeMB > 5) {
        report.warnings.push({
          check: 'analyticsBuffer',
          message: `Analytics buffer large: ${totalSizeMB}MB across ${analyticsFiles.length} files — possible sync issue`,
        });
      }
    } catch (error) {
      report.checks.analyticsBuffer = { error: error.message };
    }
  }

  async _checkVideoDirectory(report) {
    const videosDir = config.paths.videos;
    try {
      const exists = await fs.pathExists(videosDir);
      if (!exists) {
        report.checks.videos = { exists: false };
        report.warnings.push({
          check: 'videos',
          message: 'Video directory does not exist — no content available',
        });
        return;
      }

      // Count video files (non-recursive, just top-level categories)
      const categories = await fs.readdir(videosDir);
      let videoCount = 0;

      for (const cat of categories) {
        const catPath = path.join(videosDir, cat);
        try {
          const stat = await fs.stat(catPath);
          if (stat.isDirectory()) {
            const files = await fs.readdir(catPath);
            videoCount += files.filter(f => /\.(mp4|mkv|mov|webm)$/i.test(f)).length;
          }
        } catch {
          // Skip inaccessible directories
        }
      }

      report.checks.videos = { exists: true, categoryCount: categories.length, videoCount };
    } catch (error) {
      report.checks.videos = { error: error.message };
    }
  }

  async _checkChromiumProcess(report) {
    try {
      const { stdout } = await execAsync('pgrep -c chromium 2>/dev/null || echo "0"');
      const count = parseInt(stdout.trim().split('\n')[0]) || 0;
      report.checks.chromium = { running: count > 0, processCount: count };

      if (count === 0) {
        report.warnings.push({
          check: 'chromium',
          message: 'Chromium not running — kiosk display may not be active',
        });
      }
    } catch (error) {
      report.checks.chromium = { error: error.message };
    }
  }

  async _checkSocketConnections(report) {
    try {
      const response = await axios.get('http://localhost:3000/', { timeout: 5000 });
      const connections = response.data?.connections || 0;
      report.checks.socketConnections = { count: connections };

      if (connections === 0) {
        report.warnings.push({
          check: 'socketConnections',
          message: 'No Socket.IO clients connected — TV tab may not be loaded yet',
        });
      }
    } catch {
      // Already caught by _checkAppHealth
    }
  }
}

module.exports = new PostUpdateValidator();

/**
 * @typedef {object} ValidationReport
 * @property {string} timestamp
 * @property {number} durationMs
 * @property {boolean} healthy
 * @property {Array<{check: string, message: string, [key: string]: *}>} critical
 * @property {Array<{check: string, message: string, [key: string]: *}>} warnings
 * @property {Object<string, *>} checks
 */
