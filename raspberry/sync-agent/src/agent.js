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
const { safeReadConfig } = require('./utils/safe-config-io');
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
const localSocket = require('./services/local-socket');

class NeoproSyncAgent {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.authRetries = 0;
    this.heartbeatInterval = null;
    this.analyticsInterval = null;
    this.connectionHealthCheckInterval = null;
    this.connected = false;
    this.configWatcher = null;
    this.videoWatcher = null;
    this.lastSuccessfulHeartbeat = null;
    this.networkProfileInterval = null;
    this.watchdogStarted = false;
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

    // Démarrer le watchdog réseau dès le boot (indépendant du WebSocket)
    // Surveille wlan0 (hotspot) et wlan1 (internet) même sans connexion cloud
    this.startNetworkWatchdog();

    // Connexion persistante au serveur local (port 3000)
    localSocket.connect();

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
      randomizationFactor: 0.5,
      timeout: 20000,
    });

    // Injecter la référence au socket pour le watchdog cloud
    networkWatchdog.setSocketRef(this.socket);

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
    // Recording toggle from cloud remote
    this.socket.on('recording-toggle', (data) => this.relayToLocalServer('recording-toggle', data));

    // =========================================================================
    // CLOUD MONITORING — Screenshot request-response
    // Unlike one-way relay events, screenshots need a response (image data)
    // from the local server back to the central server.
    // =========================================================================
    this.socket.on('screenshot-request', (data) => this.requestScreenshot(data));

    // =========================================================================
    // LICENSE STATUS
    // Receive license status from server and cache it locally
    // This enables offline operation with periodic validation
    // =========================================================================
    this.socket.on('license_status', (status) => this.handleLicenseStatus(status));

    // P3: Receive resolved sponsor IDs from central after local sponsors sync
    this.socket.on('sponsor_ids_resolved', (mapping) => this.handleSponsorIdsResolved(mapping));
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
   * Handle resolved sponsor IDs from central server.
   * Updates localSponsors[].centralId and sponsors[].site_sponsor_id in config.
   * @param {Object} mapping - { localId: centralUUID, ... }
   */
  async handleSponsorIdsResolved(mapping) {
    if (!mapping || typeof mapping !== 'object' || Object.keys(mapping).length === 0) {
      return;
    }

    logger.info('🤝 Sponsor IDs resolved from central', {
      count: Object.keys(mapping).length,
      mapping,
    });

    try {
      const configPath = config.paths.config;
      const localConfig = await safeReadConfig(configPath);

      if (!localConfig.localSponsors || localConfig.localSponsors.length === 0) {
        return;
      }

      let changed = false;

      // Update centralId on localSponsors
      for (const sponsor of localConfig.localSponsors) {
        const centralId = mapping[sponsor.localId];
        if (centralId && sponsor.centralId !== centralId) {
          sponsor.centralId = centralId;
          sponsor.syncedAt = new Date().toISOString();
          changed = true;
          logger.info('🤝 Sponsor resolved:', { localId: sponsor.localId, centralId, name: sponsor.name });
        }
      }

      // Update site_sponsor_id on sponsors[] (default loop entries)
      if (localConfig.sponsors && Array.isArray(localConfig.sponsors)) {
        for (const entry of localConfig.sponsors) {
          if (entry._sponsorLocalId && mapping[entry._sponsorLocalId]) {
            const newId = mapping[entry._sponsorLocalId];
            if (entry.site_sponsor_id !== newId) {
              entry.site_sponsor_id = newId;
              changed = true;
            }
          }
        }
      }

      // Update site_sponsor_id on timeCategories[].loopVideos[] (phase loop entries)
      if (localConfig.timeCategories && Array.isArray(localConfig.timeCategories)) {
        for (const tc of localConfig.timeCategories) {
          if (tc.loopVideos && Array.isArray(tc.loopVideos)) {
            for (const entry of tc.loopVideos) {
              if (entry._sponsorLocalId && mapping[entry._sponsorLocalId]) {
                const newId = mapping[entry._sponsorLocalId];
                if (entry.site_sponsor_id !== newId) {
                  entry.site_sponsor_id = newId;
                  changed = true;
                }
              }
            }
          }
        }
      }

      if (changed) {
        const { atomicWriteJson } = require('./utils/safe-config-io');
        await atomicWriteJson(configPath, localConfig);
        logger.info('🤝 Config updated with resolved sponsor IDs');
      }
    } catch (error) {
      logger.error('Failed to update sponsor IDs in config', { error: error.message });
    }
  }

  /**
   * Notify the local Angular app of an event via the local Socket.IO server
   * @param {string} eventName - Name of the event
   * @param {Object} data - Event data
   */
  notifyLocalApp(eventName, data) {
    localSocket.emit(eventName, data);
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
   * Request a screenshot from the local TV component and relay the response to central.
   * Unlike relayToLocalServer (fire-and-forget), this waits for a response.
   * @param {object} data - Screenshot request payload (quality, timestamp)
   */
  async requestScreenshot(data) {
    logger.info('📸 Screenshot requested from cloud, relaying to local server');
    const screenshotData = await localSocket.requestScreenshot(data);
    if (!screenshotData) {
      logger.warn('Screenshot request timed out (no response from local)');
      this.socket.emit('screenshot-data', { error: 'timeout', timestamp: Date.now() });
      return;
    }
    if (screenshotData.error) {
      logger.warn('Screenshot request failed', { error: screenshotData.error });
      this.socket.emit('screenshot-data', screenshotData);
      return;
    }
    logger.info('📸 Screenshot data received from local, forwarding to central');
    this.socket.emit('screenshot-data', screenshotData);
  }

  /**
   * Fetch player state from local Pi server via persistent connection.
   * Used by heartbeat to include the current TV player state.
   * @returns {Promise<object|null>}
   */
  fetchLocalPlayerState() {
    return localSocket.request('get-player-state', 2000);
  }

  /**
   * Relay an event from the central server (cloud remote) to the local Socket.IO server
   * This enables cloud remote control when the user cannot access the local hotspot
   * (e.g., mesh WiFi with client isolation)
   * @param {string} eventName - Name of the event to relay
   * @param {object} data - Event payload
   */
  relayToLocalServer(eventName, data) {
    logger.info('☁️ Cloud remote event received, relaying to local server', { eventName });
    localSocket.emit(eventName, data);
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

    this.authRetries = 0;
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

    // Mettre à jour la ref socket et binder les events pong pour le watchdog cloud
    // (le watchdog tourne déjà depuis start(), on lui donne juste la socket authentifiée)
    networkWatchdog.setSocketRef(this.socket);
    this.socket.on('pong', () => networkWatchdog.updateLastPong());
    this.socket.on('pong_response', () => networkWatchdog.updateLastPong());

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

      const localConfig = await safeReadConfig(configPath);
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
        localSponsors: localConfig.localSponsors || [], // P3: sponsors locaux
        timestamp: new Date().toISOString(),
      });

      logger.info('📤 Local state synced to central', {
        configHash,
        categoriesCount: localConfig.categories?.length || 0,
        videosCount: videoState.videos.length,
        localSponsorsCount: (localConfig.localSponsors || []).length,
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
    this.authRetries = (this.authRetries || 0) + 1;
    const MAX_AUTH_RETRIES = 5;
    const message = data?.message || 'Erreur inconnue';

    // Permanent errors: wrong credentials — no point retrying
    const isPermanent = message.includes('Clé API invalide')
      || message.includes('Identifiants manquants')
      || message.includes('Site non trouvé');

    logger.error('Authentication failed', {
      message,
      attempt: this.authRetries,
      maxRetries: MAX_AUTH_RETRIES,
      isPermanent,
    });

    if (isPermanent || this.authRetries >= MAX_AUTH_RETRIES) {
      logger.error('Authentication definitively failed, exiting', {
        attempts: this.authRetries,
        isPermanent,
      });
      logger.error('Vérifiez que SITE_ID et SITE_API_KEY sont corrects dans /etc/neopro/site.conf');
      this.socket.disconnect();
      process.exit(1);
    }

    // Transient error (DB timeout, server overload): let Socket.IO reconnect
    logger.warn(`Auth failed (attempt ${this.authRetries}/${MAX_AUTH_RETRIES}), will retry on reconnect`);
    // Server disconnects us after auth_error, Socket.IO auto-reconnect will retry
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
      logger.warn('Max reconnection attempts reached. Waiting 30s before retry cycle...', {
        attempts: this.reconnectAttempts,
        nextRetryIn: '30s',
      });
      this.reconnectAttempts = 0;
      this.socket.disconnect();
      setTimeout(() => {
        logger.info('Retrying connection after cooldown...');
        this.socket.connect();
      }, 30000);
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
        // Signaler la fin du déploiement (identique à deploy_video)
        // IMPORTANT: Émis AVANT le command_result et le restart du sync-agent
        // pour garantir que le serveur central marque le déploiement comme terminé
        this.socket.emit('update_progress', {
          deploymentId: data.deploymentId,
          version: data.version,
          progress: 100,
          completed: true,
        });
        // Laisser le temps à Socket.IO de flush l'event avant le restart
        await new Promise(resolve => setTimeout(resolve, 2000));
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

      // Notify server of deployment failure so dashboard shows 'failed' instead of stuck 'in_progress'
      if (type === 'deploy_video' && data.deploymentId) {
        this.socket.emit('deploy_progress', {
          deploymentId: data.deploymentId,
          videoId: data.videoId,
          error: error.message,
        });
      } else if (type === 'update_software' && data.deploymentId) {
        this.socket.emit('update_progress', {
          deploymentId: data.deploymentId,
          version: data.version,
          error: error.message,
        });
      }

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
    const HEALTH_CHECK_INTERVAL = 30000; // 30 secondes
    const STALE_THRESHOLD = 60000; // 60 secondes sans heartbeat réussi = forcer reconnexion

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
          logger.warn('Health check: heartbeats stale, forcing reconnection', {
            timeSinceLastHeartbeat,
            threshold: STALE_THRESHOLD,
            socketConnected,
          });
          this.connected = false;
          connectionStatus.setConnected(false, 'health_check_stale_heartbeat');

          // Forcer déconnexion puis reconnexion propre
          if (this.socket) {
            this.socket.disconnect();
            setTimeout(() => {
              logger.info('Reconnecting after stale heartbeat detection...');
              this.socket.connect();
            }, 2000);
          }
          return;
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
    if (this.watchdogStarted) {
      logger.debug('Network watchdog already running, skipping start');
      return;
    }

    logger.info('Starting network watchdog (Phase 4)');
    networkWatchdog.start();
    this.watchdogStarted = true;
  }

  startHeartbeat() {
    logger.info('Starting heartbeat', { interval: config.monitoring.heartbeatInterval });

    this.sendHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, config.monitoring.heartbeatInterval);
  }

  /**
   * Fetch recording state from local Pi server via persistent connection.
   * Uses cached broadcast value with explicit-fetch fallback.
   * @returns {Promise<{isRecording: boolean, isManualOverride: boolean} | null>}
   */
  fetchLocalRecordingState() {
    return localSocket.getRecordingState();
  }

  /**
   * Fetch transition metrics from local Pi server via persistent connection (get + reset).
   * @returns {Promise<{earlySwitchCount: number, safetyTimeoutCount: number, cleanupSkippedCount: number, videoErrorCount: number, totalTransitions: number} | null>}
   */
  fetchLocalTransitionMetrics() {
    return localSocket.request('get-transition-metrics', 2000);
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

        // Inclure le statut kiosk (fichier écrit par le watchdog)
        let kioskStatus = null;
        try {
          kioskStatus = await metricsCollector.getKioskStatus();
        } catch {
          // Ignore — le fichier peut ne pas encore exister
        }

        // Fetch recording state from local server
        const recordingState = await this.fetchLocalRecordingState();

        // Fetch transition metrics from local server (get + reset)
        const transitionMetrics = await this.fetchLocalTransitionMetrics();

        // Fetch player state from local server (for cloud monitoring)
        const playerState = await this.fetchLocalPlayerState();

        this.socket.emit('heartbeat', {
          siteId: config.site.id,
          timestamp: Date.now(),
          metrics,
          softwareVersion,
          versionInfo,
          kioskStatus,
          recordingState,
          transitionMetrics,
          playerState,
          wifiStatus: metrics.wifiStatus || null,
          fanStatus: metrics.fanStatus || null,
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

    localSocket.disconnect();

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
  localSocket,
};
