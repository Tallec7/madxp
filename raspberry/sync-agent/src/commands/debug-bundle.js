const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const os = require('os');
const logger = require('../logger');
const { config } = require('../config');
const networkDiagnostics = require('./network-diagnostics');
const { getAnalyticsBufferStatus } = require('./analytics-buffer');

const execAsync = util.promisify(exec);

/**
 * Export un bundle de debug complet pour le support technique
 * Collecte: configuration, logs récents, métriques, diagnostics
 * Retourne un objet JSON (le ZIP sera créé côté dashboard)
 */
async function exportDebugBundle() {
  logger.info('Exporting debug bundle for support');
  const metricsCollector = require('../metrics');

  const bundle = {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
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
    const networkResult = await networkDiagnostics();
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
    bundle.sections.buffers = await getAnalyticsBufferStatus();
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
}

module.exports = exportDebugBundle;
