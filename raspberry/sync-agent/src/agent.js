#!/usr/bin/env node

const io = require('socket.io-client');
const logger = require('./logger');
const { config, validateConfig } = require('./config');
const metricsCollector = require('./metrics');
const commands = require('./commands');
const analyticsCollector = require('./analytics');

class NeoproSyncAgent {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.heartbeatInterval = null;
    this.analyticsInterval = null;
    this.connected = false;
  }

  async start() {
    logger.info('🚀 NEOPRO Sync Agent starting...', {
      siteId: config.site.id,
      siteName: config.site.name,
      serverUrl: config.central.url,
    });

    if (!validateConfig()) {
      logger.error('Invalid configuration. Exiting.');
      process.exit(1);
    }

    this.connect();

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  connect() {
    logger.info('Connecting to central server...', { url: config.central.url });

    this.socket = io(config.central.url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionDelayMax: 30000,
      timeout: 20000,
    });

    this.socket.on('connect', () => this.handleConnect());
    this.socket.on('disconnect', (reason) => this.handleDisconnect(reason));
    this.socket.on('connect_error', (error) => this.handleConnectError(error));
    this.socket.on('authenticated', (data) => this.handleAuthenticated(data));
    this.socket.on('auth_error', (data) => this.handleAuthError(data));
    this.socket.on('command', (cmd) => this.handleCommand(cmd));
  }

  handleConnect() {
    logger.info('✅ Connected to central server');

    this.reconnectAttempts = 0;

    this.socket.emit('authenticate', {
      siteId: config.site.id,
      apiKey: config.site.apiKey,
    });
  }

  handleAuthenticated(data) {
    logger.info('✅ Authenticated successfully', data);

    this.connected = true;

    this.startHeartbeat();
    this.startAnalyticsSync();
  }

  handleAuthError(data) {
    logger.error('❌ Authentication failed', data);

    this.socket.disconnect();
    process.exit(1);
  }

  handleDisconnect(reason) {
    logger.warn('Disconnected from central server', { reason });

    this.connected = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.analyticsInterval) {
      clearInterval(this.analyticsInterval);
      this.analyticsInterval = null;
    }

    if (reason === 'io server disconnect') {
      logger.info('Server disconnected us, reconnecting...');
      this.socket.connect();
    }
  }

  handleConnectError(error) {
    this.reconnectAttempts++;

    logger.error('Connection error', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      error: error.message,
    });

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Exiting.');
      process.exit(1);
    }
  }

  async handleCommand(cmd) {
    const { id, type, data } = cmd;

    logger.info('📥 Command received', { commandId: id, type });

    if (!config.security.allowedCommands.includes(type)) {
      logger.warn('Command not allowed', { type, allowedCommands: config.security.allowedCommands });

      this.socket.emit('command_result', {
        commandId: id,
        status: 'error',
        error: `Command type '${type}' is not allowed`,
      });

      return;
    }

    try {
      const handler = commands[type];

      if (!handler) {
        throw new Error(`Unknown command type: ${type}`);
      }

      let result;

      if (type === 'deploy_video') {
        result = await handler.execute(data, (progress) => {
          this.socket.emit('deploy_progress', {
            videoId: data.videoId,
            progress,
          });
        });
      } else if (type === 'update_software') {
        result = await handler.execute(data, (progress) => {
          this.socket.emit('update_progress', {
            version: data.version,
            progress,
          });
        });
      } else if (typeof handler === 'function') {
        result = await handler(data);
      } else {
        result = await handler.execute(data);
      }

      logger.info('✅ Command executed successfully', { commandId: id, type });

      this.socket.emit('command_result', {
        commandId: id,
        status: 'success',
        result,
      });
    } catch (error) {
      logger.error('❌ Command execution failed', {
        commandId: id,
        type,
        error: error.message,
        stack: error.stack,
      });

      this.socket.emit('command_result', {
        commandId: id,
        status: 'error',
        error: error.message,
      });
    }
  }

  startHeartbeat() {
    logger.info('Starting heartbeat', { interval: config.monitoring.heartbeatInterval });

    this.sendHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, config.monitoring.heartbeatInterval);
  }

  async sendHeartbeat() {
    if (!this.connected) {
      return;
    }

    try {
      const metrics = await metricsCollector.collectAll();

      if (metrics) {
        this.socket.emit('heartbeat', {
          siteId: config.site.id,
          timestamp: Date.now(),
          metrics,
        });

        logger.debug('Heartbeat sent', {
          cpu: metrics.cpu,
          memory: metrics.memory,
          temperature: metrics.temperature,
          disk: metrics.disk,
        });
      }
    } catch (error) {
      logger.error('Failed to send heartbeat:', error);
    }
  }

  startAnalyticsSync() {
    const interval = config.monitoring?.analyticsInterval || 5 * 60 * 1000; // 5 minutes par défaut
    logger.info('Starting analytics sync', { interval });

    // Envoyer immédiatement les analytics en attente
    this.sendAnalytics();

    // Puis envoyer périodiquement
    this.analyticsInterval = setInterval(() => {
      this.sendAnalytics();
    }, interval);
  }

  async sendAnalytics() {
    if (!this.connected) {
      return;
    }

    try {
      const result = await analyticsCollector.sendToServer(
        config.central.url,
        config.site.id
      );

      if (result.sent > 0) {
        logger.info('Analytics sent', { sent: result.sent, recorded: result.recorded });
      }
    } catch (error) {
      logger.error('Failed to send analytics:', error);
    }
  }

  async shutdown() {
    logger.info('Shutting down gracefully...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.analyticsInterval) {
      clearInterval(this.analyticsInterval);
    }

    // Envoyer les analytics restants avant de fermer
    if (this.connected) {
      try {
        await this.sendAnalytics();
      } catch (error) {
        logger.warn('Failed to send final analytics:', error.message);
      }
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    logger.info('Goodbye! 👋');
    process.exit(0);
  }
}

const agent = new NeoproSyncAgent();
agent.start();

module.exports = NeoproSyncAgent;
