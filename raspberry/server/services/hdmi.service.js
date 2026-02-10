const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * HdmiService - Detects TV power state via HDMI-CEC.
 *
 * Uses `cec-client` to query the TV (device 0).
 * Results are cached for 10 seconds to avoid spamming the CEC bus.
 */
class HdmiService {
  constructor() {
    this._cache = { status: null, lastCheck: 0 };
    this._CACHE_TTL = 10000; // 10 seconds
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
