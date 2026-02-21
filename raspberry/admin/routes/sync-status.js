/**
 * Routes sync-status pour le serveur admin Neopro
 *
 * Lit les fichiers d'état du sync-agent (processus séparé) pour
 * exposer le statut de synchronisation dans l'interface admin.
 *
 * - GET /api/sync-status → Statut de synchronisation agrégé
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const { NEOPRO_DIR } = require('../helpers');

module.exports = function createSyncStatusRouter() {
  const router = express.Router();

  const dataDir = path.join(NEOPRO_DIR, 'data');
  const syncHistoryPath = path.join(dataDir, 'sync-history.json');
  const offlineQueuePath = path.join(dataDir, 'offline-queue.json');
  const deadLetterPath = path.join(dataDir, 'dead-letter-queue.json');

  /**
   * Lit et parse un fichier JSON, retourne le fallback en cas d'erreur
   * (fichier inexistant au premier boot, JSON corrompu, etc.)
   */
  async function readJsonSafe(filePath, fallback) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return fallback;
    }
  }

  // GET /api/sync-status
  router.get('/api/sync-status', async (req, res) => {
    try {
      const [history, offlineQueue, deadLetterQueue] = await Promise.all([
        readJsonSafe(syncHistoryPath, []),
        readJsonSafe(offlineQueuePath, []),
        readJsonSafe(deadLetterPath, []),
      ]);

      // Statut de connexion : dernier event de type 'connection'
      const lastConnectionEvent = history.find(
        (entry) => entry.type === 'connection'
      );
      const connected = lastConnectionEvent
        ? lastConnectionEvent.details?.connected === true
        : false;

      // Dernière sync réussie (tous types)
      const lastSuccessfulSync = history.find(
        (entry) => entry.success === true
      );
      const lastSyncAt = lastSuccessfulSync
        ? lastSuccessfulSync.timestamp
        : null;

      // Dernière réception de contenu NEOPRO (F-AUD-14)
      const lastContentSync = history.find(
        (entry) => entry.type === 'content_received' && entry.success === true
      );
      const lastContentSyncAt = lastContentSync
        ? lastContentSync.timestamp
        : null;
      const lastContentSyncDetails = lastContentSync
        ? lastContentSync.details || {}
        : null;

      // Dernière erreur
      const lastError = history.find((entry) => entry.success === false);

      // Historique récent (10 dernières entrées)
      const recentHistory = history.slice(0, 10).map((entry) => ({
        type: entry.type,
        timestamp: entry.timestamp,
        success: entry.success,
        error: entry.error || null,
      }));

      res.json({
        connected,
        lastSyncAt,
        lastContentSyncAt,
        lastContentSyncDetails,
        pendingCommands: offlineQueue.length,
        deadLetters: deadLetterQueue.length,
        recentHistory,
        error: lastError ? lastError.error : null,
        lastErrorAt: lastError ? lastError.timestamp : null,
      });
    } catch (error) {
      console.error('[admin] Failed to load sync status:', error);
      res.status(500).json({
        error: 'Impossible de charger le statut de synchronisation',
      });
    }
  });

  return router;
};
