/**
 * HostapdReaderService — ADR-074.
 *
 * Read-only parser for `/etc/hostapd/hostapd.conf`.
 *
 * Post-ADR-074, hostapd.conf is the single source of truth for hotspot
 * credentials on the Pi. Cloud is canonical, sync-agent reconciles, admin
 * panel only READS — it never writes hotspot fields.
 *
 * Writers allowed: sync-agent (services/hotspot-sync.js) and install.sh.
 * Everything else must go through this service.
 */

const fs = require('fs').promises;

const HOSTAPD_CONF = '/etc/hostapd/hostapd.conf';

/**
 * @param {string} contents
 * @returns {{ssid: string|null, psk: string|null, channel: number|null}}
 */
function parseHostapdConf(contents) {
  if (!contents || typeof contents !== 'string') {
    return { ssid: null, psk: null, channel: null };
  }
  const ssidMatch = contents.match(/^ssid=(.+)$/m);
  const pskMatch = contents.match(/^wpa_passphrase=(.+)$/m);
  const channelMatch = contents.match(/^channel=(\d+)$/m);
  return {
    ssid: ssidMatch ? ssidMatch[1].trim() : null,
    psk: pskMatch ? pskMatch[1].trim() : null,
    channel: channelMatch ? parseInt(channelMatch[1], 10) : null,
  };
}

class HostapdReaderService {
  constructor({ confPath = HOSTAPD_CONF } = {}) {
    this.confPath = confPath;
  }

  /**
   * Read and parse hostapd.conf. Returns nulls when the file is absent.
   * @returns {Promise<{ssid: string|null, psk: string|null, channel: number|null}>}
   */
  async read() {
    try {
      const contents = await fs.readFile(this.confPath, 'utf8');
      return parseHostapdConf(contents);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return { ssid: null, psk: null, channel: null };
      }
      throw err;
    }
  }
}

module.exports = HostapdReaderService;
module.exports.parseHostapdConf = parseHostapdConf;
