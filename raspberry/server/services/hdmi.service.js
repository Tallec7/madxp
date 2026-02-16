const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const execAsync = util.promisify(exec);

/**
 * HdmiService - Detects TV power state via HDMI-CEC and display info via EDID.
 *
 * Uses `cec-client` to query the TV (device 0).
 * CEC results are cached for 10 seconds to avoid spamming the CEC bus.
 * EDID results are cached for 5 minutes (display rarely changes).
 */
class HdmiService {
  constructor() {
    this._cache = { status: null, lastCheck: 0 };
    this._CACHE_TTL = 10000; // 10 seconds

    this._displayCache = { info: null, lastCheck: 0 };
    this._DISPLAY_CACHE_TTL = 300000; // 5 minutes
  }

  async getStatus() {
    const now = Date.now();

    // Return cached result if recent
    if (this._cache.status && (now - this._cache.lastCheck) < this._CACHE_TTL) {
      return this._cache.status;
    }

    const cecStatus = {
      tv_power: null,
      tv_connected: false,
      devices_found: 0,
      cec_available: false,
      last_check_at: new Date().toISOString(),
      error: null,
    };

    // Check if cec-client is installed
    try {
      await execAsync('which cec-client', { timeout: 2000 });
      cecStatus.cec_available = true;
    } catch {
      cecStatus.cec_available = false;
      cecStatus.error = 'cec-client not installed';
      this._updateCache(cecStatus, now);
      return cecStatus;
    }

    // Query TV power state (device 0 = TV)
    try {
      const { stdout } = await execAsync(
        'echo "pow 0" | timeout 5 cec-client -s -d 1 2>/dev/null',
        { timeout: 8000 }
      );

      this._parseCecOutput(stdout, cecStatus);
    } catch (cecError) {
      cecStatus.error = cecError.message;
      cecStatus.tv_connected = false;
      console.warn('[HDMI-CEC] Check failed:', cecError.message);
    }

    this._updateCache(cecStatus, now);
    return cecStatus;
  }

  /**
   * Récupère les infos de l'écran connecté via EDID.
   * @returns {Promise<{connected: boolean, manufacturer: string|null, model: string|null, resolution: string|null, display_type: string}>}
   */
  async getDisplayInfo() {
    const now = Date.now();
    if (this._displayCache.info && (now - this._displayCache.lastCheck) < this._DISPLAY_CACHE_TTL) {
      return this._displayCache.info;
    }

    const displayInfo = {
      connected: false,
      manufacturer: null,
      model: null,
      resolution: null,
      display_type: 'unknown',
    };

    try {
      const edidPath = this._findEdidPath();
      if (edidPath) {
        displayInfo.connected = true;
        const edidBuffer = fs.readFileSync(edidPath);
        const parsed = this._parseEdid(edidBuffer);
        displayInfo.manufacturer = parsed.manufacturer;
        displayInfo.model = parsed.model;
        displayInfo.resolution = parsed.resolution;
        if (parsed.hasCeaExtension) {
          displayInfo.display_type = 'tv';
        }
      }
    } catch (error) {
      console.warn('[HDMI] Display info error:', error.message);
    }

    this._displayCache.info = displayInfo;
    this._displayCache.lastCheck = now;
    return displayInfo;
  }

  /**
   * Récupère le statut complet HDMI : CEC + display info.
   * @returns {Promise<object>}
   */
  async getFullStatus() {
    const [cec, display] = await Promise.all([
      this.getStatus(),
      this.getDisplayInfo(),
    ]);

    // Affiner le type d'écran en croisant CEC + EDID
    // Un écran peut être connecté (HDMI hot-plug) sans EDID lisible
    const screenDetected = display.connected || cec.tv_connected;
    if (display.display_type === 'unknown') {
      if (cec.devices_found > 0) {
        display.display_type = 'tv';
      } else if (cec.cec_available && cec.devices_found === 0 && screenDetected) {
        display.display_type = 'monitor';
      }
    }
    // Marquer l'écran comme connecté si détecté par CEC même sans EDID
    if (!display.connected && cec.tv_connected) {
      display.connected = true;
    }

    return { ...cec, displayInfo: display };
  }

  _findEdidPath() {
    try {
      const drmDir = '/sys/class/drm';
      if (!fs.existsSync(drmDir)) return null;
      const entries = fs.readdirSync(drmDir);
      const hdmiEntries = entries.filter(e => e.includes('HDMI'));
      for (const entry of hdmiEntries) {
        const edidPath = `${drmDir}/${entry}/edid`;
        try {
          const stat = fs.statSync(edidPath);
          if (stat.size > 0) return edidPath;
        } catch {
          // File not accessible
        }
      }
    } catch {
      // DRM directory not available
    }
    return null;
  }

  _parseEdid(edidBuffer) {
    const result = { manufacturer: null, model: null, resolution: null, hasCeaExtension: false };
    if (!edidBuffer || edidBuffer.length < 128) return result;

    const header = [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00];
    if (!header.every((b, i) => edidBuffer[i] === b)) return result;

    try {
      const mfgCode = (edidBuffer[8] << 8) | edidBuffer[9];
      result.manufacturer = String.fromCharCode(((mfgCode >> 10) & 0x1F) + 64)
        + String.fromCharCode(((mfgCode >> 5) & 0x1F) + 64)
        + String.fromCharCode((mfgCode & 0x1F) + 64);
    } catch { /* ignore */ }

    try {
      const hActive = ((edidBuffer[58] & 0xF0) << 4) | edidBuffer[56];
      const vActive = ((edidBuffer[61] & 0xF0) << 4) | edidBuffer[59];
      if (hActive > 0 && vActive > 0) result.resolution = `${hActive}x${vActive}`;
    } catch { /* ignore */ }

    for (let i = 0; i < 4; i++) {
      const offset = 54 + (i * 18);
      if (offset + 18 > edidBuffer.length) break;
      if (edidBuffer[offset] === 0 && edidBuffer[offset + 1] === 0 && edidBuffer[offset + 3] === 0xFC) {
        try {
          result.model = edidBuffer.slice(offset + 5, offset + 18).toString('ascii').replace(/[\n\r\0]/g, '').trim();
        } catch { /* ignore */ }
      }
    }

    if (edidBuffer[126] > 0 && edidBuffer.length >= 256 && edidBuffer[128] === 0x02) {
      result.hasCeaExtension = true;
    }

    return result;
  }

  _parseCecOutput(stdout, status) {
    if (stdout.includes('power status: on')) {
      status.tv_power = 'on';
      status.tv_connected = true;
    } else if (stdout.includes('power status: standby')) {
      status.tv_power = 'standby';
      status.tv_connected = true;
    } else if (stdout.includes('power status: in transition')) {
      status.tv_power = 'transitioning';
      status.tv_connected = true;
    } else if (stdout.includes('power status:')) {
      status.tv_power = 'unknown';
      status.tv_connected = true;
    } else {
      status.tv_power = null;
      status.tv_connected = false;
      status.error = 'TV not responding to CEC';
    }

    // Count CEC devices
    const devicesMatch = stdout.match(/device #(\d+):/g);
    if (devicesMatch) {
      status.devices_found = devicesMatch.length;
    }
  }

  _updateCache(status, now) {
    this._cache.status = status;
    this._cache.lastCheck = now;
  }
}

module.exports = HdmiService;
