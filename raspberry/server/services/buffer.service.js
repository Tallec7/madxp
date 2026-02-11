const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * BufferService - Generic file-based buffer with optional central forwarding.
 *
 * Used by both analytics and sponsor-impressions endpoints.
 * In cloud env: tries to forward to the central server, falls back to local.
 * On Pi: always stores locally (sync-agent will upload later).
 */
class BufferService {
  /**
   * @param {object} opts
   * @param {string} opts.filePath         - Local buffer file path
   * @param {string} opts.label            - Log prefix (e.g. 'Analytics')
   * @param {string} opts.centralUrl       - Central server base URL
   * @param {string} opts.centralEndpoint  - API path (e.g. '/api/analytics/video-plays')
   * @param {string} opts.payloadKey       - Key for the central payload (e.g. 'plays')
   * @param {string} opts.siteId           - Site identifier
   * @param {boolean} opts.isCloudEnv      - Whether running in cloud
   */
  constructor({ filePath, label, centralUrl, centralEndpoint, payloadKey, siteId, isCloudEnv }) {
    this._filePath = filePath;
    this._label = label;
    this._centralUrl = centralUrl;
    this._centralEndpoint = centralEndpoint;
    this._payloadKey = payloadKey;
    this._siteId = siteId;
    this._isCloudEnv = isCloudEnv;
  }

  /**
   * Add items to the buffer. Optionally forward to central server.
   * @param {Array} items - Array of events/impressions
   * @param {Function} [transformFn] - Optional transform applied before forwarding
   * @returns {object} Result with success, received, total/queued, forwarded, recorded
   */
  async add(items, transformFn) {
    // In cloud env, try to forward to central
    if (this._isCloudEnv && this._siteId) {
      try {
        const payload = transformFn ? transformFn(items) : items;
        const body = { [this._payloadKey]: payload };

        // For analytics, also add site_id at the top level
        if (this._payloadKey === 'plays') {
          body.site_id = this._siteId;
        }

        const response = await axios.post(
          `${this._centralUrl}${this._centralEndpoint}`,
          body,
          { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );

        console.log(`[${this._label}] Sent ${items.length} items to central server:`, response.data);
        const recorded = response.data.data?.recorded || response.data.recorded || 0;
        return { success: true, received: items.length, forwarded: true, recorded };
      } catch (forwardError) {
        console.error(`[${this._label}] Failed to forward to central:`, forwardError.message);
        // Fall through to local storage
      }
    }

    // Local storage (Pi or cloud fallback)
    const dir = path.dirname(this._filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let buffer = this._readBuffer();
    buffer.push(...items);
    fs.writeFileSync(this._filePath, JSON.stringify(buffer, null, 2));

    console.log(`[${this._label}] Received ${items.length} items, total buffer: ${buffer.length}`);
    return { success: true, received: items.length, total: buffer.length };
  }

  /**
   * Get statistics about the current buffer.
   * @param {string} [timestampField='played_at'] - Field used for oldest/newest timestamps
   * @returns {object} { count, oldest, newest }
   */
  getStats(timestampField = 'played_at') {
    const buffer = this._readBuffer();
    return {
      count: buffer.length,
      oldest: buffer.length > 0 ? buffer[0][timestampField] : null,
      newest: buffer.length > 0 ? buffer[buffer.length - 1][timestampField] : null,
    };
  }

  _readBuffer() {
    if (!fs.existsSync(this._filePath)) return [];
    try {
      const data = fs.readFileSync(this._filePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.warn(`[${this._label}] Failed to parse existing buffer:`, e.message);
      return [];
    }
  }
}

module.exports = BufferService;
