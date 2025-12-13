/**
 * Service d'historique des synchronisations
 * Enregistre les 100 dernières opérations de sync pour debug et traçabilité
 */

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');
const { config } = require('../config');

class SyncHistoryService {
  constructor() {
    this.historyPath = path.join(config.paths.data || '/home/pi/neopro/data', 'sync-history.json');
    this.maxEntries = 100;
  }

  /**
   * Charge l'historique depuis le fichier
   * @returns {Promise<Array>}
   */
  async loadHistory() {
    try {
      if (await fs.pathExists(this.historyPath)) {
        const content = await fs.readFile(this.historyPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      logger.warn('Failed to load sync history:', error.message);
    }
    return [];
  }

  /**
   * Sauvegarde l'historique
   * @param {Array} history
   */
  async saveHistory(history) {
    try {
      await fs.ensureDir(path.dirname(this.historyPath));
      await fs.writeFile(this.historyPath, JSON.stringify(history, null, 2));
    } catch (error) {
      logger.error('Failed to save sync history:', error);
    }
  }

  /**
   * Enregistre une opération de synchronisation
   * @param {string} type Type de sync ('local_to_central', 'central_to_local', 'merge', 'command', 'connection')
   * @param {object} details Détails de l'opération
   * @param {boolean} success Si l'opération a réussi
   * @param {string} [error] Message d'erreur si échec
   */
  async recordSync(type, details, success = true, error = null) {
    try {
      const history = await this.loadHistory();

      const entry = {
        id: uuidv4(),
        type,
        timestamp: new Date().toISOString(),
        success,
        details,
        error: error || null,
      };

      // Ajouter en début de liste
      history.unshift(entry);

      // Limiter à maxEntries
      if (history.length > this.maxEntries) {
        history.length = this.maxEntries;
      }

      await this.saveHistory(history);

      logger.debug('Sync recorded', { type, success, id: entry.id });

      return entry.id;
    } catch (err) {
      logger.error('Failed to record sync:', err);
      return null;
    }
  }

  /**
   * Récupère l'historique récent
   * @param {number} limit Nombre d'entrées à retourner
   * @returns {Promise<Array>}
   */
  async getHistory(limit = 20) {
    const history = await this.loadHistory();
    return history.slice(0, limit);
  }

  /**
   * Récupère les statistiques de synchronisation
   * @returns {Promise<object>}
   */
  async getStats() {
    const history = await this.loadHistory();

    const stats = {
      total: history.length,
      success: 0,
      failed: 0,
      byType: {},
      lastSync: null,
      last24h: {
        total: 0,
        success: 0,
        failed: 0,
      },
    };

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const entry of history) {
      if (entry.success) {
        stats.success++;
      } else {
        stats.failed++;
      }

      // Par type
      stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;

      // Last 24h
      const entryDate = new Date(entry.timestamp);
      if (entryDate > dayAgo) {
        stats.last24h.total++;
        if (entry.success) {
          stats.last24h.success++;
        } else {
          stats.last24h.failed++;
        }
      }
    }

    // Dernière sync
    if (history.length > 0) {
      stats.lastSync = history[0].timestamp;
    }

    return stats;
  }

  /**
   * Recherche dans l'historique
   * @param {object} criteria Critères de recherche
   * @returns {Promise<Array>}
   */
  async search(criteria = {}) {
    const history = await this.loadHistory();

    return history.filter(entry => {
      if (criteria.type && entry.type !== criteria.type) return false;
      if (criteria.success !== undefined && entry.success !== criteria.success) return false;
      if (criteria.since) {
        const since = new Date(criteria.since);
        if (new Date(entry.timestamp) < since) return false;
      }
      if (criteria.until) {
        const until = new Date(criteria.until);
        if (new Date(entry.timestamp) > until) return false;
      }
      return true;
    });
  }

  /**
   * Nettoie l'historique (garde les N dernières entrées)
   * @param {number} keep Nombre d'entrées à garder
   */
  async cleanup(keep = 50) {
    const history = await this.loadHistory();

    if (history.length > keep) {
      history.length = keep;
      await this.saveHistory(history);
      logger.info('Sync history cleaned up', { kept: keep });
    }
  }

  // Méthodes utilitaires pour les types courants

  async recordConnection(connected, details = {}) {
    return this.recordSync(
      'connection',
      { connected, ...details },
      true
    );
  }

  async recordConfigPush(hash, categoriesCount) {
    return this.recordSync(
      'local_to_central',
      { hash, categoriesCount },
      true
    );
  }

  async recordConfigReceive(categoriesCount, videosDeployed) {
    return this.recordSync(
      'central_to_local',
      { categoriesCount, videosDeployed },
      true
    );
  }

  async recordMerge(localCategories, remoteCategories, resultCategories) {
    return this.recordSync(
      'merge',
      {
        localCategories,
        remoteCategories,
        resultCategories,
      },
      true
    );
  }

  async recordCommand(commandType, success, details = {}, error = null) {
    return this.recordSync(
      'command',
      { commandType, ...details },
      success,
      error
    );
  }

  async recordError(operation, errorMessage, details = {}) {
    return this.recordSync(
      operation,
      details,
      false,
      errorMessage
    );
  }
}

// Singleton
const syncHistory = new SyncHistoryService();

module.exports = syncHistory;
