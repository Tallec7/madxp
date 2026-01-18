const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');

const execAsync = util.promisify(exec);

/**
 * Get current WiFi status including BSSID lock status and mesh detection
 */
async function getWifiBssidStatus() {
  logger.info('Getting WiFi BSSID status');

  try {
    const result = {
      connected: false,
      ssid: null,
      bssid: null,
      bssidLocked: null,
      isMeshEnvironment: false,
      meshApCount: 0,
      signal: null,
      ipAddress: null
    };

    // Get current connection info
    try {
      const { stdout: iwOutput } = await execAsync('iwconfig wlan1 2>/dev/null');
      const ssidMatch = iwOutput.match(/ESSID:"([^"]+)"/);
      const bssidMatch = iwOutput.match(/Access Point: ([0-9A-Fa-f:]+)/);
      const signalMatch = iwOutput.match(/Signal level=(-?\d+) dBm/);

      result.connected = !!ssidMatch;
      result.ssid = ssidMatch ? ssidMatch[1] : null;
      result.bssid = bssidMatch ? bssidMatch[1] : null;
      result.signal = signalMatch ? parseInt(signalMatch[1]) : null;
    } catch (error) {
      logger.warn('Could not get iwconfig info:', error.message);
    }

    // Get IP address
    try {
      const { stdout: ipOutput } = await execAsync('ip -4 addr show wlan1 | grep inet');
      const ipMatch = ipOutput.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      result.ipAddress = ipMatch ? ipMatch[1] : null;
    } catch {
      // Ignore - no IP
    }

    // Check if BSSID is locked in config
    const wpaConfPaths = [
      '/etc/wpa_supplicant/wpa_supplicant-wlan1.conf',
      '/etc/wpa_supplicant/wpa_supplicant.conf'
    ];

    for (const confPath of wpaConfPaths) {
      try {
        if (await fs.pathExists(confPath)) {
          const { stdout } = await execAsync(`sudo cat ${confPath}`);
          const bssidInConf = stdout.match(/bssid=([0-9A-Fa-f:]+)/i);
          if (bssidInConf) {
            result.bssidLocked = bssidInConf[1];
            break;
          }
        }
      } catch {
        continue;
      }
    }

    // Scan for mesh detection (count APs with same SSID)
    if (result.ssid) {
      try {
        const { stdout: scanOutput } = await execAsync('sudo iwlist wlan1 scan 2>/dev/null');
        const ssidRegex = new RegExp(`ESSID:"${result.ssid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
        const matches = scanOutput.match(ssidRegex);
        result.meshApCount = matches ? matches.length : 1;
        result.isMeshEnvironment = result.meshApCount > 1;
      } catch (error) {
        logger.warn('Could not scan for mesh detection:', error.message);
      }
    }

    return {
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Failed to get WiFi BSSID status:', error);
    throw error;
  }
}

/**
 * Remove BSSID lock from wpa_supplicant configuration
 * Allows the WiFi dongle to roam between APs in mesh environments
 */
async function removeBssidLock() {
  logger.info('Removing BSSID lock from wpa_supplicant config');

  try {
    const wpaConfPaths = [
      '/etc/wpa_supplicant/wpa_supplicant-wlan1.conf',
      '/etc/wpa_supplicant/wpa_supplicant.conf'
    ];

    let configPath = null;
    let wpaConf = '';

    // Find which config file has bssid=
    for (const confPath of wpaConfPaths) {
      try {
        if (await fs.pathExists(confPath)) {
          const { stdout } = await execAsync(`sudo cat ${confPath}`);
          if (stdout.includes('bssid=')) {
            configPath = confPath;
            wpaConf = stdout;
            break;
          }
        }
      } catch {
        continue;
      }
    }

    if (!configPath) {
      return {
        success: true,
        message: 'Aucun verrouillage BSSID trouvé',
        modified: false,
        timestamp: new Date().toISOString()
      };
    }

    // Remove bssid= line from config
    const newConf = wpaConf
      .split('\n')
      .filter(line => !line.trim().startsWith('bssid='))
      .join('\n');

    // Write back the config
    const tmpPath = '/tmp/wpa_supplicant_nobssid.conf';
    await fs.writeFile(tmpPath, newConf);
    await execAsync(`sudo cp ${tmpPath} ${configPath}`);
    await execAsync(`sudo chmod 600 ${configPath}`);

    // Reconfigure wpa_supplicant to apply change
    await execAsync('sudo wpa_cli -i wlan1 reconfigure 2>/dev/null');

    logger.info('BSSID lock removed successfully', { configPath });

    return {
      success: true,
      message: 'Verrouillage BSSID supprimé. Le dongle peut maintenant basculer entre les APs.',
      modified: true,
      configPath,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Failed to remove BSSID lock:', error);
    throw error;
  }
}

/**
 * Add bgscan configuration for optimal roaming in mesh environments
 */
async function optimizeForMesh() {
  logger.info('Optimizing wpa_supplicant for mesh environment');

  try {
    const wpaConfPaths = [
      '/etc/wpa_supplicant/wpa_supplicant-wlan1.conf',
      '/etc/wpa_supplicant/wpa_supplicant.conf'
    ];

    let configPath = null;
    let wpaConf = '';

    // Find the config file
    for (const confPath of wpaConfPaths) {
      try {
        if (await fs.pathExists(confPath)) {
          const { stdout } = await execAsync(`sudo cat ${confPath}`);
          if (stdout.includes('network={')) {
            configPath = confPath;
            wpaConf = stdout;
            break;
          }
        }
      } catch {
        continue;
      }
    }

    if (!configPath) {
      return {
        success: false,
        error: 'No wpa_supplicant config found',
        timestamp: new Date().toISOString()
      };
    }

    // Check if already optimized
    if (wpaConf.includes('bgscan=')) {
      return {
        success: true,
        message: 'Configuration déjà optimisée pour mesh',
        modified: false,
        timestamp: new Date().toISOString()
      };
    }

    // Add bgscan and scan_ssid=0 to network block
    // bgscan="simple:30:-70:300" means:
    // - Scan every 300s if signal > -70dBm
    // - Scan every 30s if signal < -70dBm
    const newConf = wpaConf.replace(
      /(network=\{[^}]*)(})/g,
      (match, networkContent, closing) => {
        // Remove bssid= if present
        let content = networkContent
          .split('\n')
          .filter(line => !line.trim().startsWith('bssid='))
          .join('\n');

        // Add bgscan if not present
        if (!content.includes('bgscan=')) {
          content += '\n    bgscan="simple:30:-70:300"';
        }
        // Add scan_ssid=0 if not present
        if (!content.includes('scan_ssid=')) {
          content += '\n    scan_ssid=0';
        }

        return content + closing;
      }
    );

    // Write back the config
    const tmpPath = '/tmp/wpa_supplicant_mesh.conf';
    await fs.writeFile(tmpPath, newConf);
    await execAsync(`sudo cp ${tmpPath} ${configPath}`);
    await execAsync(`sudo chmod 600 ${configPath}`);

    // Reconfigure wpa_supplicant to apply change
    await execAsync('sudo wpa_cli -i wlan1 reconfigure 2>/dev/null');

    logger.info('Mesh optimization applied successfully', { configPath });

    return {
      success: true,
      message: 'Configuration optimisée pour mesh WiFi (bgscan activé, BSSID lock supprimé)',
      modified: true,
      configPath,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Failed to optimize for mesh:', error);
    throw error;
  }
}

module.exports = {
  getWifiBssidStatus,
  removeBssidLock,
  optimizeForMesh
};
