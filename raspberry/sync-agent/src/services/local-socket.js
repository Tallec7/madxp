// @ts-check
const io = require('socket.io-client');
const logger = require('../logger');

const LOCAL_SERVER_URL = 'http://127.0.0.1:3000';

class LocalSocketService {
  constructor() {
    /** @type {import('socket.io-client').Socket | null} */
    this.socket = null;
    this._lastRecordingState = null;
  }

  /**
   * Initialize the persistent connection to the local neopro-app server.
   * Called once from agent.js start().
   */
  connect() {
    if (this.socket) return;

    this.socket = io(LOCAL_SERVER_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 5000,
    });

    this.socket.on('connect', () => {
      logger.info('LocalSocket: connected to local server', { id: this.socket.id });
    });

    this.socket.on('disconnect', (reason) => {
      logger.debug('LocalSocket: disconnected from local server', { reason });
    });

    this.socket.on('connect_error', (error) => {
      logger.debug('LocalSocket: connection error', { error: error.message });
    });

    // Cache recording-state broadcasts (emitted by server on connect + on any change)
    this.socket.on('recording-state', (data) => {
      this._lastRecordingState = {
        isRecording: !!data.isRecording,
        isManualOverride: !!data.isManualOverride,
      };
    });
  }

  /**
   * Check if connected to local server.
   * @returns {boolean}
   */
  isConnected() {
    return this.socket?.connected || false;
  }

  /**
   * Get the raw socket instance.
   * @returns {import('socket.io-client').Socket | null}
   */
  getSocket() {
    return this.socket;
  }

  /**
   * Fire-and-forget: emit an event if connected.
   * @param {string} eventName
   * @param {*} [data]
   * @returns {boolean} true if emitted, false if not connected
   */
  emit(eventName, data) {
    if (!this.isConnected()) {
      logger.debug('LocalSocket: not connected, skipping emit', { eventName });
      return false;
    }
    this.socket.emit(eventName, data);
    return true;
  }

  /**
   * Request with Socket.IO callback (Promise-based, with timeout).
   * @param {string} eventName
   * @param {number} [timeoutMs=2000]
   * @returns {Promise<*>} resolves with response or null on timeout/error
   */
  request(eventName, timeoutMs = 2000) {
    return new Promise((resolve) => {
      if (!this.isConnected()) {
        resolve(null);
        return;
      }
      const timeout = setTimeout(() => resolve(null), timeoutMs);
      this.socket.emit(eventName, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  /**
   * Request a screenshot: emits request, waits for response event.
   * Special case because the response comes as a separate event, not a callback.
   * @param {object} data
   * @param {number} [timeoutMs=10000]
   * @returns {Promise<*>} resolves with screenshot data or null on timeout
   */
  requestScreenshot(data, timeoutMs = 10000) {
    return new Promise((resolve) => {
      if (!this.isConnected()) {
        resolve(null);
        return;
      }

      const timeout = setTimeout(() => {
        this.socket.off('screenshot-data', handler);
        resolve(null);
      }, timeoutMs);

      const handler = (screenshotData) => {
        clearTimeout(timeout);
        this.socket.off('screenshot-data', handler);
        resolve(screenshotData);
      };

      this.socket.on('screenshot-data', handler);
      this.socket.emit('screenshot-request', data);
    });
  }

  /**
   * Get cached recording state, or fetch explicitly via server callback.
   * @returns {Promise<{isRecording: boolean, isManualOverride: boolean} | null>}
   */
  async getRecordingState() {
    if (this._lastRecordingState) {
      return this._lastRecordingState;
    }
    const state = await this.request('get-recording-state', 2000);
    if (state) {
      this._lastRecordingState = {
        isRecording: !!state.isRecording,
        isManualOverride: !!state.isManualOverride,
      };
    }
    return this._lastRecordingState;
  }

  /**
   * Disconnect the persistent socket. Called on agent shutdown.
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this._lastRecordingState = null;
    }
  }
}

module.exports = new LocalSocketService();
