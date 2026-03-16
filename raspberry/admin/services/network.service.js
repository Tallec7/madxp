/**
 * NetworkService
 *
 * Logique métier pour la gestion réseau : informations réseau,
 * scan WiFi, connexion, verrouillage BSSID, diagnostic hotspot.
 *
 * Les méthodes de parsing (parseIwconfigOutput, parseWifiScanResults, etc.)
 * sont pures et hautement testables.
 */

const fs = require('fs').promises;
const os = require('os');

const { execCommand, shellEscape } = require('../helpers');
const { ValidationError, NotFoundError, CommandError } = require('./errors');

class NetworkService {
  // ---------------------------------------------------------------------------
  // Pure parsers (highly testable)
  // ---------------------------------------------------------------------------

  /**
   * Parse iwconfig output for a WiFi interface.
   * @param {string} output - raw iwconfig text
   * @returns {{ ssid, bssid, quality, signal }}
   */
  parseIwconfigOutput(output) {
    const ssidMatch = output.match(/ESSID:"([^"]+)"/);
    const bssidMatch = output.match(/Access Point: ([0-9A-Fa-f:]+)/);
    const qualityMatch = output.match(/Link Quality=(\d+)\/(\d+)/);
    const signalMatch = output.match(/Signal level=(-?\d+) dBm/);

    let quality = null;
    if (qualityMatch) {
      quality = Math.round((parseInt(qualityMatch[1]) / parseInt(qualityMatch[2])) * 100);
    }

    return {
      ssid: ssidMatch ? ssidMatch[1] : null,
      bssid: bssidMatch ? bssidMatch[1] : null,
      quality,
      signal: signalMatch ? parseInt(signalMatch[1]) : null,
    };
  }

  /**
   * Parse iwlist scan output into an array of network objects.
   * @param {string} output - raw iwlist scan text
   * @returns {Array<Object>}
   */
  parseWifiScanResults(output) {
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
          quality = Math.round((parseInt(qualityMatch[1]) / parseInt(qualityMatch[2])) * 100);
        }

        networks.push({
          ssid: ssidMatch[1],
          bssid: bssidMatch ? bssidMatch[1] : null,
          channel: channelMatch ? parseInt(channelMatch[1]) : null,
          signal: signalMatch ? parseInt(signalMatch[1]) : null,
          quality,
          encrypted: encryptionMatch ? encryptionMatch[1] === 'on' : false,
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
    return networks;
  }

  // ---------------------------------------------------------------------------
  // Network info
  // ---------------------------------------------------------------------------

  async getNetworkInfo() {
    const interfaces = os.networkInterfaces();
    const networkInfo = {};

    for (const [name, addrs] of Object.entries(interfaces)) {
      networkInfo[name] = addrs
        .filter((addr) => addr.family === 'IPv4')
        .map((addr) => ({
          address: addr.address,
          netmask: addr.netmask,
          mac: addr.mac,
        }));
    }

    // WiFi info for wlan1 (USB dongle - client WiFi)
    let wlan1Info = { ssid: null, bssid: null, signal: null, quality: null };
    try {
      const wifiResult = await execCommand('iwconfig wlan1 2>/dev/null');
      if (wifiResult.success && wifiResult.output) {
        wlan1Info = this.parseIwconfigOutput(wifiResult.output);
      }
    } catch {
      // wlan1 might not exist
    }

    // WiFi info for wlan0 (hotspot)
    let wlan0Info = { ssid: null, mode: null };
    try {
      const wifiResult = await execCommand('iwconfig wlan0 2>/dev/null');
      if (wifiResult.success && wifiResult.output) {
        const ssidMatch = wifiResult.output.match(/ESSID:"([^"]+)"/);
        const modeMatch = wifiResult.output.match(/Mode:(\w+)/);
        wlan0Info.ssid = ssidMatch ? ssidMatch[1] : null;
        wlan0Info.mode = modeMatch ? modeMatch[1] : null;
      }
    } catch {
      // wlan0 might not exist
    }

    return { interfaces: networkInfo, wlan0: wlan0Info, wlan1: wlan1Info };
  }

  // ---------------------------------------------------------------------------
  // WiFi scan
  // ---------------------------------------------------------------------------

  async scanWifiNetworks() {
    const result = await execCommand('sudo iwlist wlan1 scan 2>/dev/null');
    if (!result.success) {
      throw new CommandError('Scan WiFi échoué: ' + (result.error || ''));
    }

    const networks = this.parseWifiScanResults(result.output);

    // Get current connection info
    let currentBssid = null;
    let currentSsid = null;
    try {
      const iwResult = await execCommand('iwconfig wlan1 2>/dev/null');
      if (iwResult.success && iwResult.output) {
        const parsed = this.parseIwconfigOutput(iwResult.output);
        currentBssid = parsed.bssid;
        currentSsid = parsed.ssid;
      }
    } catch {
      // Ignore
    }

    return {
      networks,
      currentBssid,
      currentSsid,
      scannedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // WiFi connect (with BSSID lock)
  // ---------------------------------------------------------------------------

  async connectWifi({ ssid, password, bssid, lockBssid }) {
    if (!ssid || !password) {
      throw new ValidationError('SSID et mot de passe requis');
    }
    if (password.length < 8 || password.length > 63) {
      throw new ValidationError('Le mot de passe doit contenir entre 8 et 63 caractères (WPA2)');
    }

    // SAFETY: Detect mesh environment and block BSSID lock
    if (lockBssid) {
      try {
        const scanResult = await execCommand('sudo iwlist wlan1 scan 2>/dev/null');
        const sameSSIDRegex = new RegExp(`ESSID:"${ssid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
        const sameSSIDCount = (scanResult.output.match(sameSSIDRegex) || []).length;

        if (sameSSIDCount > 1) {
          console.log(
            `[WiFi] BLOCKED: BSSID lock requested for mesh network "${ssid}" (${sameSSIDCount} APs detected)`,
          );
          const err = new ValidationError(
            `Verrouillage BSSID interdit: ${sameSSIDCount} points d'acc\u00e8s d\u00e9tect\u00e9s pour "${ssid}". En environnement mesh, le verrouillage causerait des d\u00e9connexions.`,
          );
          err.meshDetected = true;
          err.apCount = sameSSIDCount;
          throw err;
        }
      } catch (scanError) {
        if (scanError instanceof ValidationError) throw scanError;
        console.log('[WiFi] Could not verify mesh status, allowing BSSID lock:', scanError.message);
      }
    }

    // Step 1: Check wlan1 exists
    const linkCheck = await execCommand('ip link show wlan1 2>/dev/null');
    if (!linkCheck.success) {
      throw new NotFoundError('Interface wlan1 non détectée. Vérifiez que la clé WiFi USB est branchée.');
    }

    // Step 2: Bring wlan1 up + unblock WiFi radio
    await execCommand('sudo ip link set wlan1 up 2>/dev/null');
    await execCommand('sudo rfkill unblock wifi 2>/dev/null');

    // Step 3: Hash password via wpa_passphrase (never store plaintext)
    const pskResult = await execCommand(
      `wpa_passphrase ${shellEscape(ssid)} ${shellEscape(password)}`,
    );
    if (!pskResult.success || !pskResult.output) {
      throw new CommandError('Échec de la génération du hash PSK');
    }
    const pskMatch = pskResult.output.match(/^\s+psk=([a-f0-9]{64})/m);
    if (!pskMatch) {
      throw new CommandError('Échec de la génération du hash PSK');
    }
    const pskHash = pskMatch[1];

    // Step 4: Read existing wpa_supplicant config
    const wpaConfPath = '/etc/wpa_supplicant/wpa_supplicant.conf';
    let wpaConf = '';
    try {
      const readResult = await execCommand(`sudo cat ${wpaConfPath}`);
      wpaConf = readResult.output || '';
    } catch {
      wpaConf = 'ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\nupdate_config=1\ncountry=FR\n';
    }

    // Step 5: Clean slate — keep header, remove all network blocks
    const headerLines = wpaConf
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed &&
          !trimmed.startsWith('network=') &&
          !trimmed.startsWith('ssid=') &&
          !trimmed.startsWith('psk=') &&
          !trimmed.startsWith('#psk=') &&
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

    // Step 6: Build new config with hashed PSK
    let networkBlock = `\n\nnetwork={\n    ssid="${ssid}"\n    psk=${pskHash}\n    key_mgmt=WPA-PSK`;
    if (lockBssid && bssid) {
      networkBlock += `\n    bssid=${bssid}`;
    }
    networkBlock += `\n    priority=10\n}\n`;
    const newConf = headerLines + networkBlock;

    // Step 7: Write config safely via temp file
    const tempFile = '/tmp/wpa_supplicant_new.conf';
    await fs.writeFile(tempFile, newConf);
    await execCommand(`sudo cp ${tempFile} ${wpaConfPath}`);
    await execCommand(`sudo chmod 600 ${wpaConfPath}`);

    // Step 8: Create symlink for wlan1-specific config + enable/restart service
    await execCommand(
      'sudo ln -sf /etc/wpa_supplicant/wpa_supplicant.conf /etc/wpa_supplicant/wpa_supplicant-wlan1.conf',
    );
    await execCommand('sudo systemctl enable wpa_supplicant@wlan1.service 2>/dev/null');
    await execCommand('sudo systemctl restart wpa_supplicant@wlan1.service 2>/dev/null');

    // Step 9: Trigger DHCP on wlan1
    await execCommand('sudo dhcpcd wlan1 2>/dev/null');

    // Step 10: Wait for connection (up to 10s, 5 attempts)
    let connected = false;
    let ipAddress = null;

    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const iwResult = await execCommand('iwconfig wlan1 2>/dev/null');
      if (iwResult.success && iwResult.output && iwResult.output.includes(`ESSID:"${ssid}"`)) {
        connected = true;

        // Check for IP address
        const ipResult = await execCommand('ip -4 addr show wlan1 2>/dev/null');
        if (ipResult.success && ipResult.output) {
          const ipMatch = ipResult.output.match(/inet (\d+\.\d+\.\d+\.\d+)/);
          ipAddress = ipMatch ? ipMatch[1] : null;
        }

        if (ipAddress) break;
      }
    }

    return {
      connected,
      ipAddress,
      message: connected
        ? `Connecté à ${ssid}` +
          (ipAddress ? ` (IP: ${ipAddress})` : '') +
          (lockBssid && bssid ? ` (BSSID fixé: ${bssid})` : '')
        : `Configuration enregistrée pour ${ssid}. La connexion peut prendre quelques secondes.`,
      bssidLocked: lockBssid && bssid ? bssid : null,
    };
  }

  // ---------------------------------------------------------------------------
  // WiFi current status
  // ---------------------------------------------------------------------------

  async getCurrentWifiStatus() {
    const iwResult = await execCommand('iwconfig wlan1 2>/dev/null');
    const parsed = this.parseIwconfigOutput(iwResult.output || '');

    // Check if BSSID is locked in config
    let bssidLocked = null;
    try {
      const wpaConf = await execCommand('sudo cat /etc/wpa_supplicant/wpa_supplicant.conf');
      if (wpaConf.success && wpaConf.output) {
        const bssidInConf = wpaConf.output.match(/bssid=([0-9A-Fa-f:]+)/i);
        bssidLocked = bssidInConf ? bssidInConf[1] : null;
      }
    } catch {
      // Ignore
    }

    // Get IP address
    let ipAddress = null;
    try {
      const ipResult = await execCommand('ip -4 addr show wlan1 | grep inet');
      if (ipResult.success && ipResult.output) {
        const ipMatch = ipResult.output.match(/inet (\d+\.\d+\.\d+\.\d+)/);
        ipAddress = ipMatch ? ipMatch[1] : null;
      }
    } catch {
      // Ignore
    }

    return {
      connected: !!parsed.ssid,
      ssid: parsed.ssid,
      bssid: parsed.bssid,
      bssidLocked,
      quality: parsed.quality,
      signal: parsed.signal,
      ipAddress,
    };
  }

  // ---------------------------------------------------------------------------
  // BSSID lock removal
  // ---------------------------------------------------------------------------

  async removeBssidLock() {
    const wpaConfPaths = [
      '/etc/wpa_supplicant/wpa_supplicant-wlan1.conf',
      '/etc/wpa_supplicant/wpa_supplicant.conf',
    ];

    let configPath = null;
    let wpaConf = '';

    for (const confPath of wpaConfPaths) {
      try {
        const result = await execCommand(`sudo cat ${confPath} 2>/dev/null`);
        if (result.success && result.output && result.output.includes('bssid=')) {
          configPath = confPath;
          wpaConf = result.output;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!configPath) {
      return {
        message: 'Aucun verrouillage BSSID trouv\u00e9',
        modified: false,
      };
    }

    // Remove bssid= line from config
    const newConf = wpaConf
      .split('\n')
      .filter((line) => !line.trim().startsWith('bssid='))
      .join('\n');

    const tmpPath = '/tmp/wpa_supplicant_nobssid.conf';
    await fs.writeFile(tmpPath, newConf);
    await execCommand(`sudo cp ${tmpPath} ${configPath}`);
    await execCommand(`sudo chmod 600 ${configPath}`);

    // Reconfigure wpa_supplicant
    await execCommand('sudo wpa_cli -i wlan1 reconfigure 2>/dev/null');

    return {
      message: 'Verrouillage BSSID supprim\u00e9. Le dongle peut maintenant basculer entre les APs.',
      modified: true,
      configPath,
    };
  }

  // ---------------------------------------------------------------------------
  // Hotspot fix
  // ---------------------------------------------------------------------------

  async fixHotspot({ autoFix = false } = {}) {
    const scriptPath = `${NEOPRO_DIR}/scripts/fix-hotspot.sh`;

    try {
      await fs.access(scriptPath);
    } catch {
      throw new NotFoundError('Script fix-hotspot.sh non trouv\u00e9');
    }

    const args = ['--json'];
    if (autoFix) args.push('--auto-fix');

    const cmd = `sudo bash ${scriptPath} ${args.join(' ')} 2>&1`;
    const result = await execCommand(cmd);

    if (result.success && result.output) {
      try {
        return JSON.parse(result.output.trim());
      } catch {
        return { success: true, output: result.output, manual: true };
      }
    }

    throw new CommandError(result.error || "Erreur lors de l'ex\u00e9cution du script");
  }
}

module.exports = NetworkService;
