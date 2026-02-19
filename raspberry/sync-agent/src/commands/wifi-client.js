/**
 * WiFi Client Configuration Commands
 *
 * Commandes pour scanner et configurer le WiFi client (wlan1) à distance.
 * Permet à un admin depuis le dashboard central de connecter la clé USB WiFi
 * au réseau du club, sans accès physique au Pi.
 *
 * Sécurité :
 * - Ne touche jamais à wlan0 (hotspot) ni à eth0
 * - Le mot de passe WiFi est hashé via wpa_passphrase (jamais stocké en clair)
 * - Toutes les commandes shell utilisent des arguments échappés
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');

const execAsync = util.promisify(exec);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe shell argument usage.
 * @param {string} arg
 * @returns {string}
 */
function escapeShellArg(arg) {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * Parse iwlist scan output into an array of network objects.
 * Duplicated from raspberry/admin/services/network.service.js (lignes 52-92)
 * to avoid cross-module dependency.
 *
 * @param {string} output - raw iwlist scan text
 * @returns {Array<{ssid: string, bssid: string|null, channel: number|null, signal: number|null, quality: number|null, security: string}>}
 */
function parseWifiScanResults(output) {
  const networks = [];
  const cells = output.split(/Cell \d+ - /);

  for (const cell of cells) {
    if (!cell.trim()) continue;

    const bssidMatch = cell.match(/Address: ([0-9A-Fa-f:]+)/);
    const ssidMatch = cell.match(/ESSID:"([^"]*)"/);
    const channelMatch = cell.match(/Channel:(\d+)/);
    const signalMatch = cell.match(/Signal level=(-?\d+) dBm/);
    const qualityMatch = cell.match(/Quality=(\d+)\/(\d+)/);
    const encryptionMatch = cell.match(/Encryption key:(on|off)/);
    const wpaMatch = cell.match(/WPA2?/);

    if (ssidMatch && ssidMatch[1]) {
      let quality = null;
      if (qualityMatch) {
        quality = Math.round(
          (parseInt(qualityMatch[1]) / parseInt(qualityMatch[2])) * 100
        );
      }

      networks.push({
        ssid: ssidMatch[1],
        bssid: bssidMatch ? bssidMatch[1] : null,
        channel: channelMatch ? parseInt(channelMatch[1]) : null,
        signal: signalMatch ? parseInt(signalMatch[1]) : null,
        quality,
        security: wpaMatch
          ? 'WPA2'
          : encryptionMatch && encryptionMatch[1] === 'on'
            ? 'WEP'
            : 'Open',
      });
    }
  }

  // Sort by signal strength (best first)
  networks.sort((a, b) => (b.signal || -100) - (a.signal || -100));

  // Deduplicate by SSID (keep the one with best signal)
  const seen = new Set();
  return networks.filter((n) => {
    if (seen.has(n.ssid)) return false;
    seen.add(n.ssid);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Scan available WiFi networks on wlan1.
 * Brings the interface up if needed, then runs iwlist scan.
 *
 * @returns {Promise<{success: boolean, networks: Array, currentSsid: string|null, currentBssid: string|null, scannedAt: string}>}
 */
async function scanWifiNetworks() {
  logger.info('Scanning WiFi networks on wlan1');

  try {
    // Check wlan1 exists
    try {
      await execAsync('ip link show wlan1');
    } catch {
      return {
        success: false,
        error: 'Interface wlan1 non détectée. Vérifiez que la clé WiFi USB est branchée.',
        networks: [],
        scannedAt: new Date().toISOString(),
      };
    }

    // Bring interface up (may be down if never configured)
    await execAsync('sudo ip link set wlan1 up 2>/dev/null').catch(() => {});

    // Small delay for interface to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Run the scan
    const { stdout: scanOutput } = await execAsync(
      'sudo iwlist wlan1 scan 2>/dev/null',
      { timeout: 20000 }
    );

    // Parse results
    const networks = parseWifiScanResults(scanOutput);

    // Get current connection info (if any)
    let currentSsid = null;
    let currentBssid = null;
    try {
      const { stdout: iwOutput } = await execAsync(
        'iwconfig wlan1 2>/dev/null'
      );
      const ssidMatch = iwOutput.match(/ESSID:"([^"]+)"/);
      const bssidMatch = iwOutput.match(/Access Point: ([0-9A-Fa-f:]+)/);
      currentSsid = ssidMatch ? ssidMatch[1] : null;
      currentBssid = bssidMatch ? bssidMatch[1] : null;
    } catch {
      /* not connected */
    }

    logger.info('WiFi scan completed', { networksFound: networks.length });

    return {
      success: true,
      networks,
      currentSsid,
      currentBssid,
      scannedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('WiFi scan failed:', error);
    throw error;
  }
}

/**
 * Configure and connect wlan1 to a specified WiFi network.
 * Writes wpa_supplicant config, enables the service, and verifies connection.
 *
 * Security:
 * - Password is hashed via wpa_passphrase (never stored in plaintext)
 * - Only touches wlan1 config — wlan0 (hotspot) and eth0 are unaffected
 *
 * @param {{ssid: string, password: string}} data
 * @returns {Promise<{success: boolean, connected: boolean, ssid: string, ipAddress: string|null, signal: number|null, message: string, timestamp: string}>}
 */
async function configureWifiClient(data) {
  const { ssid, password } = data || {};

  // Validate inputs
  if (!ssid || !ssid.trim()) {
    throw new Error('SSID requis');
  }
  if (!password || password.length < 8 || password.length > 63) {
    throw new Error(
      'Le mot de passe doit contenir entre 8 et 63 caractères (WPA2)'
    );
  }

  logger.info('Configuring WiFi client on wlan1', { ssid });

  try {
    // Step 1: Check wlan1 exists
    try {
      await execAsync('ip link show wlan1');
    } catch {
      throw new Error(
        'Interface wlan1 non détectée. Vérifiez que la clé WiFi USB est branchée.'
      );
    }

    // Step 2: Bring wlan1 up + unblock WiFi
    await execAsync('sudo ip link set wlan1 up 2>/dev/null').catch(() => {});
    await execAsync('sudo rfkill unblock wifi 2>/dev/null').catch(() => {});

    // Step 3: Generate PSK hash (security: never store plaintext password)
    const { stdout: wpaOutput } = await execAsync(
      `wpa_passphrase ${escapeShellArg(ssid)} ${escapeShellArg(password)}`
    );
    const pskMatch = wpaOutput.match(/^\s+psk=([a-f0-9]{64})/m);
    if (!pskMatch) {
      throw new Error('Échec de la génération du hash PSK');
    }
    const pskHash = pskMatch[1];

    // Step 4: Read existing wpa_supplicant config
    const wpaConfPath = '/etc/wpa_supplicant/wpa_supplicant.conf';
    let wpaConf = '';
    try {
      const { stdout } = await execAsync(`sudo cat ${wpaConfPath}`);
      wpaConf = stdout;
    } catch {
      // File doesn't exist — create base config
      wpaConf =
        'ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\nupdate_config=1\ncountry=FR\n';
    }

    // Step 5: Remove existing network blocks (clean slate for client WiFi)
    // We keep the header (ctrl_interface, update_config, country) and replace all network blocks
    const headerLines = wpaConf
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed &&
          !trimmed.startsWith('network=') &&
          !trimmed.startsWith('ssid=') &&
          !trimmed.startsWith('psk=') &&
          !trimmed.startsWith('key_mgmt=') &&
          !trimmed.startsWith('priority=') &&
          !trimmed.startsWith('id_str=') &&
          !trimmed.startsWith('bssid=') &&
          !trimmed.startsWith('bgscan=') &&
          !trimmed.startsWith('scan_ssid=') &&
          trimmed !== '}'
        );
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Step 6: Build new config with network block
    const newConf =
      headerLines +
      `\n\nnetwork={\n    ssid="${ssid}"\n    psk=${pskHash}\n    key_mgmt=WPA-PSK\n    priority=10\n}\n`;

    // Step 7: Write config safely via temp file
    const tmpPath = '/tmp/wpa_supplicant_wifi_client.conf';
    await fs.writeFile(tmpPath, newConf);
    await execAsync(`sudo cp ${tmpPath} ${wpaConfPath}`);
    await execAsync(`sudo chmod 600 ${wpaConfPath}`);
    await fs.remove(tmpPath).catch(() => {});

    // Step 8: Create symlink for wlan1-specific config + enable service
    await execAsync(
      'sudo ln -sf /etc/wpa_supplicant/wpa_supplicant.conf /etc/wpa_supplicant/wpa_supplicant-wlan1.conf'
    ).catch(() => {});
    await execAsync(
      'sudo systemctl enable wpa_supplicant@wlan1.service 2>/dev/null'
    ).catch(() => {});
    await execAsync(
      'sudo systemctl restart wpa_supplicant@wlan1.service 2>/dev/null'
    ).catch(() => {});

    // Step 9: Trigger DHCP on wlan1
    await execAsync('sudo dhcpcd wlan1 2>/dev/null').catch(() => {});

    // Step 10: Wait for connection (up to 10 seconds, 5 attempts)
    let connected = false;
    let ipAddress = null;
    let signal = null;

    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        const { stdout: iwOut } = await execAsync(
          'iwconfig wlan1 2>/dev/null'
        );
        if (iwOut.includes(`ESSID:"${ssid}"`)) {
          connected = true;
          const sigMatch = iwOut.match(/Signal level=(-?\d+) dBm/);
          signal = sigMatch ? parseInt(sigMatch[1]) : null;

          // Get IP
          try {
            const { stdout: ipOut } = await execAsync(
              'ip -4 addr show wlan1 | grep inet'
            );
            const ipMatch = ipOut.match(/inet (\d+\.\d+\.\d+\.\d+)/);
            ipAddress = ipMatch ? ipMatch[1] : null;
          } catch {
            /* no IP yet */
          }

          if (ipAddress) break;
        }
      } catch {
        /* keep trying */
      }
    }

    logger.info('WiFi client configuration result', {
      ssid,
      connected,
      ipAddress,
    });

    return {
      success: true,
      connected,
      ssid,
      ipAddress,
      signal,
      message: connected
        ? `Connecté à ${ssid}` + (ipAddress ? ` (IP: ${ipAddress})` : '')
        : `Configuration sauvegardée pour ${ssid}. La connexion peut prendre quelques secondes supplémentaires.`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('WiFi client configuration failed:', error);
    throw error;
  }
}

module.exports = {
  scanWifiNetworks,
  configureWifiClient,
};
