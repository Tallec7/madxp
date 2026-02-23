const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const os = require('os');
const logger = require('../logger');
const { config } = require('../config');
const networkDiagnostics = require('./network-diagnostics');
const { getAnalyticsBufferStatus } = require('./analytics-buffer');
const { getWifiBssidStatus } = require('./wifi-bssid');

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

  // 6. Logs récents (24h, cap par service pour limiter la taille)
  //    Services verbeux (heartbeat 30s) → dernières 500 lignes (~4-6h)
  //    Services calmes → 24h complet
  try {
    const verboseServices = ['neopro-sync-agent', 'neopro-app'];
    const quietServices = ['neopro-kiosk', 'neopro-admin', 'nginx', 'hostapd'];
    bundle.sections.logs = {};

    for (const service of verboseServices) {
      try {
        const { stdout } = await execAsync(
          `sudo journalctl -u ${service} --since "24 hours ago" --no-pager -q 2>/dev/null | tail -500 || echo "No logs available"`,
          { timeout: 15000 }
        );
        bundle.sections.logs[service] = stdout.trim();
      } catch {
        bundle.sections.logs[service] = 'Unable to retrieve logs';
      }
    }

    for (const service of quietServices) {
      try {
        const { stdout } = await execAsync(
          `sudo journalctl -u ${service} --since "24 hours ago" --no-pager -q 2>/dev/null || echo "No logs available"`,
          { timeout: 15000 }
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

  // 10b. Hotspot diagnostics (WiFi channel scan, connected clients, service health)
  try {
    const hotspotDiag = {};

    // Connected clients on hotspot
    try {
      const { stdout: stationsOut } = await execAsync('sudo hostapd_cli all_sta 2>/dev/null | grep -c "^[0-9a-f]" || echo "0"', { timeout: 5000 });
      hotspotDiag.connectedClients = parseInt(stationsOut.trim()) || 0;
    } catch {
      hotspotDiag.connectedClients = null;
    }

    // WiFi channel scan (interference analysis on channels 1, 6, 11)
    try {
      const { stdout: scanOut } = await execAsync(
        'sudo iwlist wlan0 scan 2>/dev/null | grep -E "Channel:|ESSID:" | paste - - 2>/dev/null | head -30 || echo ""',
        { timeout: 15000 }
      );
      const channelCounts = { 1: 0, 6: 0, 11: 0, other: 0 };
      const lines = scanOut.trim().split('\n').filter(l => l.length > 0);
      for (const line of lines) {
        const chMatch = line.match(/Channel:(\d+)/);
        if (chMatch) {
          const ch = parseInt(chMatch[1]);
          if (ch >= 1 && ch <= 3) channelCounts[1]++;
          else if (ch >= 4 && ch <= 8) channelCounts[6]++;
          else if (ch >= 9 && ch <= 13) channelCounts[11]++;
          else channelCounts.other++;
        }
      }
      hotspotDiag.channelScan = {
        totalNetworks: lines.length,
        channelGroups: channelCounts,
      };
    } catch {
      hotspotDiag.channelScan = null;
    }

    // hostapd and dnsmasq service status
    try {
      const { stdout: hostapdStatus } = await execAsync('systemctl is-active hostapd 2>/dev/null || echo "unknown"', { timeout: 5000 });
      const { stdout: dnsmasqStatus } = await execAsync('systemctl is-active dnsmasq 2>/dev/null || echo "unknown"', { timeout: 5000 });
      hotspotDiag.services = {
        hostapd: hostapdStatus.trim(),
        dnsmasq: dnsmasqStatus.trim(),
      };
    } catch {
      hotspotDiag.services = null;
    }

    // rfkill status
    try {
      const { stdout: rfkillOut } = await execAsync('rfkill list wifi 2>/dev/null | grep -i "blocked" || echo ""', { timeout: 5000 });
      hotspotDiag.rfkill = rfkillOut.trim() || 'no blocks detected';
    } catch {
      hotspotDiag.rfkill = null;
    }

    // wlan0 AP mode verification
    try {
      const { stdout: iwOut } = await execAsync('iwconfig wlan0 2>/dev/null | grep Mode || echo ""', { timeout: 5000 });
      hotspotDiag.wlan0Mode = iwOut.trim();
    } catch {
      hotspotDiag.wlan0Mode = null;
    }

    bundle.sections.hotspotDiagnostics = hotspotDiag;
  } catch (error) {
    bundle.sections.hotspotDiagnostics = { error: error.message };
  }

  // 11. boot/config.txt (pour gpu_mem)
  try {
    const { stdout } = await execAsync('cat /boot/config.txt 2>/dev/null || cat /boot/firmware/config.txt 2>/dev/null || echo ""');
    bundle.sections.bootConfig = stdout.trim();
  } catch (error) {
    bundle.sections.bootConfig = { error: error.message };
  }

  // 12. Transition metrics (read-only, no reset)
  try {
    const localSocket = require('../services/local-socket');
    const transitionMetrics = await localSocket.request('get-transition-metrics-readonly', 2000);
    bundle.sections.transitionMetrics = transitionMetrics || { note: 'No data available' };
  } catch (error) {
    bundle.sections.transitionMetrics = { error: error.message };
  }

  // 13. Kernel messages (USB disconnects, fs errors, OOM, etc.)
  try {
    const { stdout } = await execAsync(
      'sudo dmesg --time-format iso 2>/dev/null | tail -200 || sudo dmesg | tail -200 || echo ""',
      { timeout: 10000 }
    );
    bundle.sections.dmesg = stdout.trim();
  } catch (error) {
    bundle.sections.dmesg = { error: error.message };
  }

  // 14. USB devices (WiFi dongles, etc.)
  try {
    const { stdout } = await execAsync('lsusb 2>/dev/null || echo "lsusb not available"', { timeout: 5000 });
    bundle.sections.usbDevices = stdout.trim();
  } catch (error) {
    bundle.sections.usbDevices = { error: error.message };
  }

  // 15. WiFi client status (BSSID, signal, mesh detection)
  try {
    const wifiStatus = await getWifiBssidStatus();
    bundle.sections.wifiClient = {
      connected: wifiStatus.connected,
      ssid: wifiStatus.ssid,
      bssid: wifiStatus.bssid,
      signal: wifiStatus.signal,
      ipAddress: wifiStatus.ipAddress,
      bssidLocked: wifiStatus.bssidLocked,
      isMeshEnvironment: wifiStatus.isMeshEnvironment,
      meshApCount: wifiStatus.meshApCount,
    };
  } catch (error) {
    bundle.sections.wifiClient = { error: error.message };
  }

  // 16. Video list summary
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
