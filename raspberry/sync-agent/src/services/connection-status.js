/**
 * Service de statut de connexion
 *
 * Surveille l'etat de connexion au serveur central
 * et fournit des informations en temps reel pour l'interface.
 */

const EventEmitter = require('events');
const logger = require('../logger');
const { config } = require('../config');

class ConnectionStatusService extends EventEmitter {
  constructor() {
    super();
    this.isConnected = false;
    this.lastConnectedAt = null;
    this.lastDisconnectedAt = null;
    this.lastSyncAt = null;
    this.reconnectAttempts = 0;
    this.connectionHistory = [];
    this.maxHistoryLength = 50;
  }

  /**
   * Met a jour le statut de connexion
   * @param {boolean} connected - Etat de connexion
   * @param {string} reason - Raison du changement (optionnel)
   */
  setConnected(connected, reason = null) {
    const previousState = this.isConnected;
    this.isConnected = connected;

    const timestamp = new Date().toISOString();

    if (connected) {
      this.lastConnectedAt = timestamp;
      this.reconnectAttempts = 0;
    } else {
      this.lastDisconnectedAt = timestamp;
    }

    // Ajouter a l'historique
    this.connectionHistory.unshift({
      timestamp,
      connected,
      reason,
      reconnectAttempts: this.reconnectAttempts,
    });

    // Limiter la taille de l'historique
    if (this.connectionHistory.length > this.maxHistoryLength) {
      this.connectionHistory = this.connectionHistory.slice(0, this.maxHistoryLength);
    }

    // Emettre un evenement si l'etat a change
    if (previousState !== connected) {
      logger.info('Connection status changed', {
        connected,
        reason,
        reconnectAttempts: this.reconnectAttempts,
      });

      this.emit('statusChange', {
        connected,
        reason,
        timestamp,
        lastConnectedAt: this.lastConnectedAt,
        lastDisconnectedAt: this.lastDisconnectedAt,
      });

      if (connected) {
        this.emit('connected');
      } else {
        this.emit('disconnected', { reason });
      }
    }
  }

  /**
   * Enregistre une tentative de reconnexion
   */
  recordReconnectAttempt() {
    this.reconnectAttempts++;
    logger.debug('Reconnect attempt', { attempt: this.reconnectAttempts });
  }

  /**
   * Met a jour la date de derniere synchronisation
   * @param {string} syncType - Type de sync (config, video, metrics)
   */
  recordSync(syncType = 'general') {
    this.lastSyncAt = new Date().toISOString();
    this.emit('sync', { type: syncType, timestamp: this.lastSyncAt });
  }

  /**
   * Retourne le statut actuel complet
   * @returns {Object} Statut de connexion
   */
  getStatus() {
    const now = new Date();
    let offlineDuration = null;

    if (!this.isConnected && this.lastDisconnectedAt) {
      const disconnectedAt = new Date(this.lastDisconnectedAt);
      offlineDuration = Math.round((now - disconnectedAt) / 1000);
    }

    let timeSinceLastSync = null;
    if (this.lastSyncAt) {
      const syncAt = new Date(this.lastSyncAt);
      timeSinceLastSync = Math.round((now - syncAt) / 1000);
    }

    return {
      isConnected: this.isConnected,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      lastSyncAt: this.lastSyncAt,
      reconnectAttempts: this.reconnectAttempts,
      offlineDurationSeconds: offlineDuration,
      timeSinceLastSyncSeconds: timeSinceLastSync,
      centralServerUrl: config.central.url,
      centralServerEnabled: config.central.enabled,
    };
  }

  /**
   * Retourne l'historique des connexions
   * @param {number} limit - Nombre d'entrees (defaut: 10)
   * @returns {Array} Historique
   */
  getHistory(limit = 10) {
    return this.connectionHistory.slice(0, limit);
  }

  /**
   * Calcule les statistiques de connexion
   * @returns {Object} Statistiques
   */
  getStatistics() {
    if (this.connectionHistory.length === 0) {
      return {
        totalEvents: 0,
        connectEvents: 0,
        disconnectEvents: 0,
        averageOfflineMinutes: 0,
      };
    }

    let connectEvents = 0;
    let disconnectEvents = 0;
    let totalOfflineMs = 0;
    let lastDisconnect = null;

    for (const event of this.connectionHistory) {
      if (event.connected) {
        connectEvents++;
        if (lastDisconnect) {
          const offlineMs = new Date(event.timestamp) - new Date(lastDisconnect);
          totalOfflineMs += offlineMs;
          lastDisconnect = null;
        }
      } else {
        disconnectEvents++;
        lastDisconnect = event.timestamp;
      }
    }

    const averageOfflineMinutes = disconnectEvents > 0
      ? Math.round(totalOfflineMs / disconnectEvents / 60000)
      : 0;

    return {
      totalEvents: this.connectionHistory.length,
      connectEvents,
      disconnectEvents,
      averageOfflineMinutes,
      currentStreak: this.isConnected ? connectEvents : 0,
    };
  }

  /**
   * Formate le statut pour affichage
   * @returns {Object} Statut formatte
   */
  getDisplayStatus() {
    const status = this.getStatus();

    let statusText = 'Connecte au central';
    let statusClass = 'online';

    if (!status.centralServerEnabled) {
      statusText = 'Mode local (central desactive)';
      statusClass = 'local';
    } else if (!status.isConnected) {
      statusText = 'Mode hors ligne';
      statusClass = 'offline';

      if (status.offlineDurationSeconds) {
        if (status.offlineDurationSeconds < 60) {
          statusText += ' (' + status.offlineDurationSeconds + 's)';
        } else if (status.offlineDurationSeconds < 3600) {
          statusText += ' (' + Math.round(status.offlineDurationSeconds / 60) + ' min)';
        } else {
          statusText += ' (' + Math.round(status.offlineDurationSeconds / 3600) + 'h)';
        }
      }
    }

    let lastSyncText = 'Jamais synchronise';
    if (status.lastSyncAt) {
      const syncDate = new Date(status.lastSyncAt);
      const now = new Date();
      const diffSeconds = Math.round((now - syncDate) / 1000);

      if (diffSeconds < 60) {
        lastSyncText = 'Sync il y a ' + diffSeconds + 's';
      } else if (diffSeconds < 3600) {
        lastSyncText = 'Sync il y a ' + Math.round(diffSeconds / 60) + ' min';
      } else if (diffSeconds < 86400) {
        lastSyncText = 'Sync il y a ' + Math.round(diffSeconds / 3600) + 'h';
      } else {
        lastSyncText = 'Sync il y a ' + Math.round(diffSeconds / 86400) + ' jour(s)';
      }
    }

    return {
      statusText,
      statusClass,
      lastSyncText,
      isConnected: status.isConnected,
      reconnectAttempts: status.reconnectAttempts,
    };
  }
}

module.exports = new ConnectionStatusService();
