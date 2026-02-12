#!/usr/bin/env node
// @ts-check
/** @typedef {import('./types').SyncAgentConfig} SyncAgentConfig */
/** @typedef {import('./types').SystemMetrics} SystemMetrics */

const io = require('socket.io-client');
const fs = require('fs-extra');
const logger = require('./logger');
const { config, validateConfig } = require('./config');
const metricsCollector = require('./metrics');
const { getVersionInfo } = require('./utils/version-info');
const commands = require('./commands');
const analyticsCollector = require('./analytics');
const sponsorImpressionsCollector = require('./sponsor-impressions');
const { calculateConfigHash } = require('./utils/config-merge');
const ConfigWatcher = require('./watchers/config-watcher');
const VideoWatcher = require('./watchers/video-watcher');
const expirationChecker = require('./tasks/expiration-checker');
const syncHistory = require('./services/sync-history');
const offlineQueue = require('./services/offline-queue');
const connectionStatus = require('./services/connection-status');
const localBackup = require('./tasks/local-backup');
const { networkDetector } = require('./services/network-detector');
const { safeNetworkOperations } = require('./services/safe-network-operations');
const networkWatchdog = require('./services/network-watchdog');
const licenseCache = require('./license-cache');

class NeoproSyncAgent {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.heartbeatInterval = null;
    this.analyticsInterval = null;
    this.connectionHealthCheckInterval = null;
    this.connected = false;
    this.configWatcher = null;
    this.videoWatcher = null;
    this.lastSuccessfulHeartbeat = null;
    this.networkProfileInterval = null;
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

    // Démarrer l'envoi des analytics immédiatement (indépendant du WebSocket)
    // Les analytics sont envoyées via HTTP, pas besoin d'attendre la connexion WS
    this.startAnalyticsSync();

    // Démarrer l'envoi des impressions sponsors
    this.startSponsorImpressionsSync();

    // Démarrer le vérificateur d'expiration des vidéos
    expirationChecker.start();

    // Démarrer le backup automatique quotidien
    localBackup.start();

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
    // Health check - Respond to server pings to prove connection is alive
    this.socket.on('ping_check', () => this.handlePingCheck());

    // =========================================================================
    // CLOUD REMOTE RELAY
    // Relay events from central server (cloud remote) to local server
    // These events are sent by the cloud remote controller and need to be
    // forwarded to the local Socket.IO server (port 3000) for TV/Remote
    // =========================================================================
    this.socket.on('score-update', (data) => this.relayToLocalServer('score-update', data));
    this.socket.on('score-reset', (data) => this.relayToLocalServer('score-reset', data));
    this.socket.on('phase-change', (data) => this.relayToLocalServer('phase-change', data));
    this.socket.on('timer-update', (data) => this.relayToLocalServer('timer-update', data));
    this.socket.on('breaking-news', (data) => this.relayToLocalServer('breaking-news', data));
    this.socket.on('match-info-updated', (data) => this.relayToLocalServer('match-info-updated', data));
    this.socket.on('options-update', (data) => this.relayToLocalServer('options-update', data));
    // Cloud remote action (play video, play sponsors) - relayed as 'command' to local server
    // The local server converts 'command' to 'action' for the TV component
    this.socket.on('cloud-remote-action', (data) => this.relayToLocalServer('command', data));

    // =========================================================================
    // LICENSE STATUS
    // Receive license status from server and cache it locally
    // This enables offline operation with periodic validation
    // =========================================================================
    this.socket.on('license_status', (status) => this.handleLicenseStatus(status));
  }

  /**
   * Handle license status received from server
   * @param {Object} status - License status from server
   */
  handleLicenseStatus(status) {
    logger.info('📜 License status received from server', {
      status: status.status,
      reason: status.reason,
      daysLeft: status.days_left,
      daysExpired: status.days_expired
    });

    // Sauvegarder dans le cache local
    licenseCache.save(status);

    // Notifier l'application Angular locale du changement de statut
    this.notifyLocalApp('license_update', status);

    // Si le statut est bloqué, logger un warning
    if (status.status === 'BLOCKED') {
      logger.warn('⚠️ Site is BLOCKED', {
        reason: status.reason,
        messageTv: status.message_tv,
        canAutoUnblock: status.can_auto_unblock
      });
    }
  }

  /**
   * Notify the local Angular app of an event via the local Socket.IO server
   * @param {string} eventName - Name of the event
   * @param {Object} data - Event data
   */
  notifyLocalApp(eventName, data) {
    const localSocket = io('http://localhost:3000', {
      timeout: 5000,
      reconnection: false,
    });

    localSocket.on('connect', () => {
      logger.debug('Connected to local server for notification', { eventName });
      localSocket.emit(eventName, data);

      setTimeout(() => {
        localSocket.disconnect();
      }, 500);
    });

    localSocket.on('connect_error', (error) => {
      logger.debug('Could not connect to local server for notification', { eventName, error: error.message });
    });
  }

  handlePingCheck() {
    // Répondre immédiatement au ping du serveur
    if (this.socket && this.socket.connected) {
      this.socket.emit('pong_check');
      logger.debug('Responded to server ping_check');
    } else {
      // Socket morte mais on reçoit encore des événements = état incohérent
      logger.warn('Received ping_check but socket is not connected', {
        hasSocket: !!this.socket,
        socketConnected: this.socket?.connected,
        connectedFlag: this.connected,
      });
      // Corriger l'état si nécessaire
      if (this.connected) {
        this.connected = false;
        connectionStatus.setConnected(false, 'ping_check_socket_dead');
      }
    }
  }

  /**
   * Relay an event from the central server (cloud remote) to the local Socket.IO server
   * This enables cloud remote control when the user cannot access the local hotspot
   * (e.g., mesh WiFi with client isolation)
   * @param {string} eventName - Name of the event to relay
   * @param {object} data - Event payload
   */
  relayToLocalServer(eventName, data) {
    logger.info('☁️ Cloud remote event received, relaying to local server', { eventName, data });

    const localSocket = io('http://localhost:3000', {
      timeout: 5000,
      reconnection: false,
    });

    localSocket.on('connect', () => {
      logger.debug('Connected to local server for relay', { eventName });
      localSocket.emit(eventName, data);

      // Disconnect after a short delay to allow the event to be processed
      setTimeout(() => {
        localSocket.disconnect();
        logger.debug('Disconnected from local server after relay', { eventName });
      }, 500);
    });

    localSocket.on('connect_error', (err) => {
      logger.warn('Failed to relay event to local server', {
        eventName,
        error: err.message,
      });
    });

    localSocket.on('error', (err) => {
      logger.warn('Local server relay error', {
        eventName,
        error: err.message,
      });
    });
  }

  handleConnect() {
    logger.info('✅ Connected to central server');

    this.reconnectAttempts = 0;
    connectionStatus.setConnected(true, 'socket_connected');

    this.socket.emit('authenticate', {
      siteId: config.site.id,
      apiKey: config.site.apiKey,
    });
  }

  handleAuthenticated(data) {
    logger.info('Authenticated successfully', data);

    this.connected = true;
    connectionStatus.recordSync(true);

    // Enregistrer la connexion dans l'historique
    syncHistory.recordConnection(true, { siteId: config.site.id });

    // Démarrer la surveillance des changements de configuration ET des vidéos
    // IMPORTANT: Doit être fait AVANT syncLocalState pour que videoWatcher soit initialisé
    this.startConfigWatcher();

    // Envoyer l'état local au central (miroir) - après init du videoWatcher
    this.syncLocalState();

    this.startHeartbeat();
    // Note: startAnalyticsSync() est appelé dans start() car les analytics
    // sont envoyées via HTTP, indépendamment de la connexion WebSocket

    // Démarrer le health check périodique de la connexion
    this.startConnectionHealthCheck();

    // Démarrer la détection périodique du profil réseau
    this.startNetworkProfileDetection();

    // Démarrer le watchdog réseau (Phase 4 - auto-recovery)
    this.startNetworkWatchdog();

    // Traiter les commandes en attente dans la queue offline
    this.processOfflineQueue();
  }

  /**
   * Traite les commandes en attente dans la queue offline
   */
  async processOfflineQueue() {
    try {
      const queueStats = await offlineQueue.getStats();
      const queueSize = queueStats.queueSize;

      if (queueSize === 0) {
        return;
      }

      logger.info('Processing offline queue', { queueSize });

      const processStats = await offlineQueue.processQueue(async (type, data) => {
        // Exécuter la commande comme si elle venait du serveur
        const handler = commands[type];

        if (!handler) {
          throw new Error(`Unknown command type: ${type}`);
        }

        if (typeof handler === 'function') {
          return handler(data);
        }
        return handler.execute(data);
      });

      // Enregistrer dans l'historique
      syncHistory.recordSync('offline_queue', processStats, processStats.failed === 0);

      logger.info('Offline queue processed', processStats);
    } catch (error) {
      logger.error('Failed to process offline queue', { error: error.message });
    }
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

    // Démarrer également la surveillance des vidéos
    this.startVideoWatcher();
  }

  /**
   * Démarre la surveillance du dossier vidéos
   * pour synchroniser automatiquement les changements vers le central
   */
  startVideoWatcher() {
    try {
      const videosPath = config.paths.videos;
      logger.info('Starting video watcher', { videosPath });

      this.videoWatcher = new VideoWatcher(videosPath, async () => {
        logger.info('🎬 Video files changed, syncing to central...');
        await this.syncLocalState();
      });

      this.videoWatcher.start();
    } catch (error) {
      logger.error('Failed to start video watcher', { error: error.message });
    }
  }

  /**
   * Synchronise l'état local vers le serveur central (miroir)
   * Envoie la configuration actuelle et la liste des vidéos
   * pour que NEOPRO puisse voir ce qu'il y a sur ce boîtier.
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

      // Récupérer la liste des vidéos et les stats de stockage
      let videoState = { videos: [], totalVideoSize: 0, storage: null };
      if (this.videoWatcher) {
        videoState = this.videoWatcher.getStorageStats();
      }

      // Récupérer les infos du hotspot (SSID, canal, mot de passe, clients connectés)
      let hotspotInfo = { ssid: null, channel: null, password: null, clients: 0, isActive: false };
      try {
        const hostapdPath = '/etc/hostapd/hostapd.conf';
        if (await fs.pathExists(hostapdPath)) {
          const hostapdContent = await fs.readFile(hostapdPath, 'utf8');
          const ssidMatch = hostapdContent.match(/^ssid=(.*)$/m);
          const channelMatch = hostapdContent.match(/^channel=(\d+)$/m);
          const passwordMatch = hostapdContent.match(/^wpa_passphrase=(.*)$/m);
          hotspotInfo.ssid = ssidMatch ? ssidMatch[1] : null;
          hotspotInfo.channel = channelMatch ? parseInt(channelMatch[1], 10) : null;
          hotspotInfo.password = passwordMatch ? passwordMatch[1] : null;
        }

        // Vérifier si hostapd est actif
        try {
          const { execSync } = require('child_process');
          const status = execSync('systemctl is-active hostapd', { encoding: 'utf8' }).trim();
          hotspotInfo.isActive = status === 'active';
        } catch {
          hotspotInfo.isActive = false;
        }

        // Compter les clients connectés au hotspot
        if (hotspotInfo.isActive) {
          try {
            const { execSync } = require('child_process');
            const stationDump = execSync('iw dev wlan0 station dump 2>/dev/null', { encoding: 'utf8' });
            // Chaque client connecté a une ligne "Station XX:XX:XX:XX:XX:XX"
            const clientMatches = stationDump.match(/Station [0-9a-f:]+/gi);
            hotspotInfo.clients = clientMatches ? clientMatches.length : 0;
          } catch {
            hotspotInfo.clients = 0;
          }
        }
      } catch (err) {
        logger.warn('Could not read hotspot info', { error: err.message });
      }

      // Utiliser le profil réseau du NetworkDetector (détection complète avec isolation, stabilité, etc.)
      const networkProfile = networkDetector.getSimplifiedProfile() || {
        type: 'unknown',
        apCount: 0,
        bssidLocked: false,
        hasIsolation: false,
        stabilityScore: 0,
        warningCount: 0,
        detectedAt: null
      };

      // Envoyer l'état local au central
      this.socket.emit('sync_local_state', {
        siteId: config.site.id,
        configHash,
        config: localConfig,
        videos: videoState.videos,
        storage: videoState.storage,
        hotspotSsid: hotspotInfo.ssid, // Rétrocompatibilité
        hotspotInfo, // Nouvelles infos complètes
        networkProfile, // Profil réseau détecté
        timestamp: new Date().toISOString(),
      });

      logger.info('📤 Local state synced to central', {
        configHash,
        categoriesCount: localConfig.categories?.length || 0,
        videosCount: videoState.videos.length,
      });

      // Enregistrer la synchronisation réussie
      connectionStatus.recordSync(true);
    } catch (error) {
      logger.error('Failed to sync local state', { error: error.message });
      connectionStatus.recordSync(false);
    }
  }

  /**
   * Retourne le statut de connexion actuel
   * @returns {Object} Statut de connexion
   */
  getConnectionStatus() {
    return {
      ...connectionStatus.getStatus(),
      socketConnected: this.socket?.connected || false,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
    };
  }

  /**
   * Ajouter des impressions sponsors au buffer
   * @param {Array} impressions - Liste des impressions
   * @returns {boolean} - True si flush nécessaire
   */
  addSponsorImpressions(impressions) {
    return sponsorImpressionsCollector.addImpressions(impressions);
  }

  /**
   * Obtenir les stats des impressions sponsors
   * @returns {Object} - Statistiques du buffer
   */
  getSponsorImpressionsStats() {
    return sponsorImpressionsCollector.getStats();
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
    connectionStatus.setConnected(false, reason);

    // Enregistrer la déconnexion dans l'historique
    syncHistory.recordConnection(false, { reason });

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Note: On ne clear pas analyticsInterval car les analytics sont envoyées
    // via HTTP, indépendamment de la connexion WebSocket (même logique que networkProfileInterval)

    if (this.connectionHealthCheckInterval) {
      clearInterval(this.connectionHealthCheckInterval);
      this.connectionHealthCheckInterval = null;
    }

    // Note: On ne clear pas networkProfileInterval car la détection doit continuer
    // même en offline pour avoir des données fraîches à la reconnexion

    // Reset le timestamp du dernier heartbeat réussi
    this.lastSuccessfulHeartbeat = null;

    if (reason === 'io server disconnect') {
      logger.info('Server disconnected us, reconnecting...');
      this.socket.connect();
    }
  }

  handleConnectError(error) {
    this.reconnectAttempts++;
    connectionStatus.recordReconnectAttempt();

    logger.error('Connection error', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      error: error.message,
      errorType: error.type,
      errorDescription: error.description,
      errorCode: error.code,
      url: config.central.url,
      siteId: config.site.id,
      apiKeyConfigured: !!config.site.apiKey,
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
            deploymentId: data.deploymentId,
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

  /**
   * Démarre un health check périodique de la connexion
   * Détecte les connexions zombies même si handleDisconnect n'est pas appelé
   */
  startConnectionHealthCheck() {
    const HEALTH_CHECK_INTERVAL = 60000; // 60 secondes
    const STALE_THRESHOLD = 90000; // 90 secondes sans heartbeat réussi = problème

    logger.info('Starting connection health check', { interval: HEALTH_CHECK_INTERVAL });

    this.connectionHealthCheckInterval = setInterval(() => {
      // Vérifier la cohérence entre le flag et l'état réel de la socket
      const socketConnected = this.socket?.connected ?? false;

      if (this.connected && !socketConnected) {
        logger.warn('Health check: zombie connection detected (flag=true, socket=false)', {
          connected: this.connected,
          socketConnected,
          lastSuccessfulHeartbeat: this.lastSuccessfulHeartbeat,
        });
        this.connected = false;
        connectionStatus.setConnected(false, 'health_check_zombie');

        // Forcer reconnexion
        if (this.socket) {
          this.socket.connect();
        }
        return;
      }

      // Vérifier si les heartbeats passent vraiment
      if (this.connected && this.lastSuccessfulHeartbeat) {
        const timeSinceLastHeartbeat = Date.now() - this.lastSuccessfulHeartbeat;
        if (timeSinceLastHeartbeat > STALE_THRESHOLD) {
          logger.warn('Health check: heartbeats not getting through', {
            timeSinceLastHeartbeat,
            threshold: STALE_THRESHOLD,
            socketConnected,
          });
          // Ne pas déconnecter, juste logger - le serveur peut être lent
        }
      }

      logger.debug('Health check: connection OK', {
        connected: this.connected,
        socketConnected,
        lastSuccessfulHeartbeat: this.lastSuccessfulHeartbeat,
      });
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Démarre la détection périodique du profil réseau
   * Exécute une détection complète au démarrage puis toutes les heures
   */
  startNetworkProfileDetection() {
    const NETWORK_PROFILE_INTERVAL = 60 * 60 * 1000; // 1 heure

    logger.info('Starting network profile detection', { interval: NETWORK_PROFILE_INTERVAL });

    // Première détection au démarrage (avec délai pour laisser le réseau se stabiliser)
    setTimeout(async () => {
      try {
        const profile = await networkDetector.detect();
        logger.info('Initial network profile detected', {
          type: profile.type,
          apCount: profile.meshInfo?.apCount || 0,
          hasIsolation: profile.isolationInfo?.hasIsolation || false,
          warnings: profile.warnings?.length || 0
        });

        // Auto-optimize based on detected profile (remove BSSID lock, configure bgscan)
        const optimizeResult = await safeNetworkOperations.autoOptimize();
        if (optimizeResult.success && optimizeResult.actions?.length > 0) {
          logger.info('Network auto-optimization completed', {
            actions: optimizeResult.actions.length,
            details: optimizeResult.actions
          });
        }

        // Sync l'état local après la détection pour envoyer le profil au central
        if (this.connected) {
          await this.syncLocalState();
        }
      } catch (error) {
        logger.error('Failed to detect initial network profile', { error: error.message });
      }
    }, 30000); // 30 secondes après le démarrage

    // Puis toutes les heures
    this.networkProfileInterval = setInterval(async () => {
      try {
        const profile = await networkDetector.detect();
        logger.info('Periodic network profile update', {
          type: profile.type,
          apCount: profile.meshInfo?.apCount || 0,
          stabilityScore: profile.stabilityInfo?.score || 0
        });

        // Sync l'état local après la détection pour envoyer le nouveau profil
        if (this.connected) {
          await this.syncLocalState();
        }
      } catch (error) {
        logger.error('Failed to update network profile', { error: error.message });
      }
    }, NETWORK_PROFILE_INTERVAL);
  }

  /**
   * Démarre le watchdog réseau pour la surveillance et l'auto-recovery
   * Phase 4 de Network Resilience
   */
  startNetworkWatchdog() {
    logger.info('Starting network watchdog (Phase 4)');

    // Injecter la référence au socket
    networkWatchdog.setSocketRef(this.socket);

    // Démarrer le watchdog
    networkWatchdog.start();

    // Écouter les événements pong du serveur pour mettre à jour le timestamp
    this.socket.on('pong', () => {
      networkWatchdog.updateLastPong();
    });

    // Écouter également pong_response si utilisé
    this.socket.on('pong_response', () => {
      networkWatchdog.updateLastPong();
    });
  }

  startHeartbeat() {
    logger.info('Starting heartbeat', { interval: config.monitoring.heartbeatInterval });

    this.sendHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, config.monitoring.heartbeatInterval);
  }

  async sendHeartbeat() {
    // Vérifier à la fois le flag interne ET l'état réel de la socket
    if (!this.connected) {
      return;
    }

    // Détecter les connexions zombies : this.connected=true mais socket morte
    if (!this.socket?.connected) {
      logger.warn('Zombie connection detected: connected flag is true but socket is disconnected', {
        connected: this.connected,
        socketConnected: this.socket?.connected,
        socketId: this.socket?.id,
      });
      // Corriger l'état et forcer une reconnexion
      this.connected = false;
      connectionStatus.setConnected(false, 'zombie_detected');
      if (this.socket) {
        logger.info('Forcing socket reconnection...');
        this.socket.connect();
      }
      return;
    }

    try {
      const metrics = await metricsCollector.collectAll();

      if (metrics) {
        let versionInfo = null;
        let softwareVersion = null;
        try {
          versionInfo = await getVersionInfo();
          if (versionInfo?.version && versionInfo.version !== 'unknown') {
            softwareVersion = versionInfo.version;
          }
        } catch (error) {
          logger.warn('Failed to load version info for heartbeat:', error.message);
        }

        this.socket.emit('heartbeat', {
          siteId: config.site.id,
          timestamp: Date.now(),
          metrics,
          softwareVersion,
          versionInfo,
        });

        // Enregistrer le succès du heartbeat
        this.lastSuccessfulHeartbeat = Date.now();

        logger.debug('Heartbeat sent', {
          cpu: metrics.cpu,
          memory: metrics.memory,
          temperature: metrics.temperature,
          disk: metrics.disk,
        });
      }
    } catch (error) {
      logger.error('Failed to send heartbeat', { error: error.message });
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

  startSponsorImpressionsSync() {
    const interval = config.monitoring?.analyticsInterval || 5 * 60 * 1000; // 5 minutes par défaut
    logger.info('[SponsorImpressions] Starting sponsor impressions sync', { interval });

    // Démarrer la synchronisation périodique automatique
    sponsorImpressionsCollector.startPeriodicSync(
      config.central.url,
      config.site.id
    );
  }

  async sendAnalytics() {
    // Les analytics sont envoyées via HTTP, indépendamment de la connexion WebSocket
    // On vérifie seulement que la configuration est valide
    if (!config.central?.url || !config.site?.id) {
      logger.warn('Cannot send analytics: missing central URL or site ID');
      return;
    }

    try {
      const result = await analyticsCollector.sendToServer(
        config.central.url,
        config.site.id
      );

      if (result.sent > 0) {
        logger.info('Analytics sent', { sent: result.sent, recorded: result.recorded });
      } else if (result.error) {
        logger.warn('Analytics send failed', { error: result.error });
      }
    } catch (error) {
      logger.error('Failed to send analytics', { error: error.message });
    }
  }

  /**
   * Met en queue une commande pour exécution ultérieure
   * Utile quand l'agent est hors ligne ou pour les commandes non critiques
   * @param {string} commandType Type de commande
   * @param {object} commandData Données de la commande
   * @param {object} options Options (priority, etc.)
   * @returns {Promise<string|null>} ID de la commande en queue
   */
  async queueCommand(commandType, commandData, options = {}) {
    // Si connecté et pas de force_queue, exécuter immédiatement
    if (this.connected && !options.forceQueue) {
      try {
        const handler = commands[commandType];
        if (handler) {
          logger.info('Executing command immediately (connected)', { type: commandType });
          if (typeof handler === 'function') {
            await handler(commandData);
          } else {
            await handler.execute(commandData);
          }
          return null; // Pas de queue ID car exécuté immédiatement
        }
      } catch (error) {
        logger.warn('Immediate execution failed, queueing command', {
          type: commandType,
          error: error.message,
        });
      }
    }

    // Mettre en queue
    return offlineQueue.enqueue(commandType, commandData, options);
  }

  /**
   * Retourne l'état de la queue offline
   * @returns {Promise<object>}
   */
  async getQueueStatus() {
    return {
      connected: this.connected,
      queueStats: await offlineQueue.getStats(),
    };
  }

  async shutdown() {
    logger.info('Shutting down gracefully...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.analyticsInterval) {
      clearInterval(this.analyticsInterval);
    }

    if (this.connectionHealthCheckInterval) {
      clearInterval(this.connectionHealthCheckInterval);
    }

    if (this.networkProfileInterval) {
      clearInterval(this.networkProfileInterval);
    }

    // Arrêter le watchdog réseau
    networkWatchdog.stop();

    // Arrêter la surveillance de la configuration
    if (this.configWatcher) {
      this.configWatcher.stop();
    }

    // Arrêter la surveillance des vidéos
    if (this.videoWatcher) {
      this.videoWatcher.stop();
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

// Exposer l'instance de l'agent et la queue offline pour utilisation externe
const agent = new NeoproSyncAgent();
agent.start();

module.exports = {
  NeoproSyncAgent,
  agent,
  offlineQueue,
  connectionStatus,
  networkDetector,
  networkWatchdog,
};
