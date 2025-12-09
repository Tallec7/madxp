#!/usr/bin/env node

const io = require('socket.io-client');
const fs = require('fs-extra');
const logger = require('./logger');
const { config, validateConfig } = require('./config');
const metricsCollector = require('./metrics');
const commands = require('./commands');
const analyticsCollector = require('./analytics');
const { calculateConfigHash } = require('./utils/config-merge');
const ConfigWatcher = require('./watchers/config-watcher');

class NeoproSyncAgent {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.heartbeatInterval = null;
    this.analyticsInterval = null;
    this.connected = false;
    this.configWatcher = null;
  }

  async start() {
    logger.info('🚀 NEOPRO Sync Agent starting...', {
      siteId: config.site.id,
      siteName: config.site.name,
      serverUrl: config.central.url,
      apiKeyConfigured: !!config.site.apiKey,
      apiKeyLength: config.site.apiKey?.length || 0,
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

    // Envoyer l'état local au central (miroir)
    this.syncLocalState();

    // Démarrer la surveillance des changements de configuration
    this.startConfigWatcher();

    this.startHeartbeat();
    this.startAnalyticsSync();
  }

  /**
   * Démarre la surveillance du fichier de configuration
   * pour synchroniser automatiquement les changements locaux vers le central
   */
  startConfigWatcher() {
    const configPath = config.paths.config;

    this.configWatcher = new ConfigWatcher(configPath, async () => {
      logger.info('📝 Local configuration changed, syncing to central...');
      await this.syncLocalState();
    });

    this.configWatcher.start();
  }

  /**
   * Synchronise l'état local vers le serveur central (miroir)
   * Envoie la configuration actuelle pour que NEOPRO puisse voir
   * ce qu'il y a sur ce boîtier.
   */
  async syncLocalState() {
    if (!this.connected) {
      return;
    }

    try {
      const configPath = config.paths.config;

      if (!await fs.pathExists(configPath)) {
        logger.warn('No local configuration found to sync', { configPath });
        return;
      }

      const configContent = await fs.readFile(configPath, 'utf8');
      const localConfig = JSON.parse(configContent);
      const configHash = calculateConfigHash(localConfig);

      // Envoyer l'état local au central
      this.socket.emit('sync_local_state', {
        siteId: config.site.id,
        configHash,
        config: localConfig,
        timestamp: new Date().toISOString(),
      });

      logger.info('📤 Local state synced to central', {
        configHash,
        categoriesCount: localConfig.categories?.length || 0,
      });
    } catch (error) {
      logger.error('Failed to sync local state:', error);
    }
  }

  handleAuthError(data) {
    logger.error('❌ Authentication failed', data);
    logger.error(`Détails: ${data?.message || 'Erreur inconnue'}`);
    logger.error('Vérifiez que SITE_ID et SITE_API_KEY sont corrects dans /etc/neopro/site.conf');

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
            deploymentId: data.deploymentId,
            videoId: data.videoId,
            progress,
          });
        });
        // Signaler la fin du déploiement
        this.socket.emit('deploy_progress', {
          deploymentId: data.deploymentId,
          videoId: data.videoId,
          progress: 100,
          completed: true,
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

    // Arrêter la surveillance de la configuration
    if (this.configWatcher) {
      this.configWatcher.stop();
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
