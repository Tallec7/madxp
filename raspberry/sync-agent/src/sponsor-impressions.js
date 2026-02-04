/**
 * Module de collecte et d'envoi des impressions sponsors.
 *
 * Flux de données:
 * 1. Frontend Angular envoie les impressions au serveur local (POST /api/sync/sponsor-impressions)
 * 2. Le serveur local stocke dans un buffer JSON persistant
 * 3. Ce module envoie périodiquement au central via POST /api/analytics/impressions
 *
 * Authentification:
 * - Utilise l'API key du site (SITE_API_KEY) pour s'authentifier auprès du central
 * - Le central valide l'API key et extrait le siteId automatiquement
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');
const { config } = require('./config');

// Chemin pour le fichier d'impressions sponsors
const IMPRESSIONS_FILE_PATH = path.join(
  process.env.HOME || '/home/pi',
  'neopro',
  'data',
  'sponsor_impressions.json'
);

// Limite maximale du buffer (50K événements ≈ 3 mois d'activité normale)
// Évite la surcharge serveur si le Pi est offline longtemps (ex: club fermé l'été)
const MAX_BUFFER_SIZE = 50000;

// Seuil pour déclencher un auto-flush (envoyer les données au serveur)
const AUTO_FLUSH_THRESHOLD = 100;

// Configuration des batches pour éviter les erreurs serveur (limite 500/batch côté central)
// Note: Le serveur a un rate limit de ~30 req/min sur /api/analytics/impressions
const BATCH_SIZE = 200; // Nombre d'impressions par batch (serveur supporte 500)
const BATCH_TIMEOUT = 15000; // 15 secondes par batch
const BATCH_DELAY = 2500; // 2.5s entre chaque batch (24 req/min = sous le rate limit de 30/min)

class SponsorImpressionsCollector {
  constructor() {
    this.buffer = [];
    this.lastSendTime = null;
    this.sendInterval = config.monitoring?.analyticsInterval || 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Charger le buffer depuis le fichier local
   * Applique la limite MAX_BUFFER_SIZE si le buffer existant est trop gros
   */
  loadBuffer() {
    try {
      if (fs.existsSync(IMPRESSIONS_FILE_PATH)) {
        const data = fs.readFileSync(IMPRESSIONS_FILE_PATH, 'utf8');
        this.buffer = JSON.parse(data);

        // Appliquer la limite au chargement (FIFO: garder les plus récents)
        if (this.buffer.length > MAX_BUFFER_SIZE) {
          const overflow = this.buffer.length - MAX_BUFFER_SIZE;
          this.buffer = this.buffer.slice(overflow);
          this.saveBuffer();
          logger.warn('[SponsorImpressions] Buffer truncated on load', {
            dropped: overflow,
            maxSize: MAX_BUFFER_SIZE,
            remaining: this.buffer.length,
          });
        }

        logger.debug('[SponsorImpressions] Buffer loaded', { count: this.buffer.length });
        return this.buffer;
      }
      return [];
    } catch (error) {
      logger.error('[SponsorImpressions] Failed to load buffer', { error: error.message });
      return [];
    }
  }

  /**
   * Sauvegarder le buffer dans le fichier local
   */
  saveBuffer() {
    try {
      // Créer le dossier si nécessaire
      const dir = path.dirname(IMPRESSIONS_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(IMPRESSIONS_FILE_PATH, JSON.stringify(this.buffer, null, 2));
      logger.debug('[SponsorImpressions] Buffer saved', { count: this.buffer.length });
    } catch (error) {
      logger.error('[SponsorImpressions] Failed to save buffer:', error.message);
    }
  }

  /**
   * Ajouter des impressions au buffer (appelé par l'API locale)
   * Applique la limite MAX_BUFFER_SIZE en supprimant les plus anciens si nécessaire (FIFO)
   */
  addImpressions(impressions) {
    if (!Array.isArray(impressions)) {
      impressions = [impressions];
    }

    this.buffer.push(...impressions);

    // Appliquer la limite: supprimer les plus anciens si on dépasse MAX_BUFFER_SIZE
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      const overflow = this.buffer.length - MAX_BUFFER_SIZE;
      this.buffer = this.buffer.slice(overflow);
      logger.warn('[SponsorImpressions] Buffer overflow, dropped oldest impressions', {
        dropped: overflow,
        maxSize: MAX_BUFFER_SIZE,
        remaining: this.buffer.length,
      });
    }

    this.saveBuffer();

    logger.info('[SponsorImpressions] Impressions added', {
      count: impressions.length,
      total: this.buffer.length
    });

    // Auto-flush si le buffer atteint le seuil
    if (this.buffer.length >= AUTO_FLUSH_THRESHOLD) {
      logger.info('[SponsorImpressions] Buffer threshold reached, auto-flushing');
      return true; // Indique qu'un flush devrait être déclenché
    }

    return false;
  }

  /**
   * Récupérer et vider le buffer pour envoi
   */
  flushBuffer() {
    const impressions = [...this.buffer];
    this.buffer = [];
    this.saveBuffer();
    return impressions;
  }

  /**
   * Obtenir les statistiques du buffer
   */
  getStats() {
    return {
      count: this.buffer.length,
      oldestImpression: this.buffer.length > 0 ? this.buffer[0].played_at : null,
      newestImpression: this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].played_at : null,
      lastSendTime: this.lastSendTime,
    };
  }

  /**
   * Envoyer un batch d'impressions au serveur
   * @private
   */
  async sendBatch(url, apiKey, batch) {
    const response = await axios.post(
      url,
      { impressions: batch },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: BATCH_TIMEOUT,
      }
    );
    return response.data;
  }

  /**
   * Envoyer les impressions au serveur central via HTTP.
   * Authentification par API key du site (Bearer token).
   * Utilise des batches pour éviter les erreurs serveur avec de gros volumes.
   *
   * @param {string} serverUrl - URL du serveur central
   * @param {string} siteId - ID du site (pour logging, l'auth utilise l'API key)
   * @returns {Promise<{sent: number, recorded?: number, error?: string}>}
   */
  async sendToServer(serverUrl, siteId) {
    const impressions = this.loadBuffer();

    if (impressions.length === 0) {
      logger.debug('[SponsorImpressions] No impressions to send');
      return { sent: 0 };
    }

    const baseUrl = serverUrl?.replace(/\/$/, '');
    if (!baseUrl) {
      logger.error('[SponsorImpressions] Central server URL is not configured');
      return { sent: 0, error: 'Central server URL is not configured' };
    }

    // Récupérer l'API key du site pour l'authentification
    const apiKey = config.site?.apiKey;
    if (!apiKey) {
      logger.error('[SponsorImpressions] Site API key is not configured (SITE_API_KEY)');
      return { sent: 0, error: 'Site API key is not configured (SITE_API_KEY)' };
    }

    const url = `${baseUrl}/api/analytics/impressions`;
    let totalSent = 0;
    let totalRecorded = 0;
    let totalSkipped = 0;
    let lastError = null;

    // Préparer les impressions avec site_id
    const impressionsToSend = impressions.map(imp => ({
      ...imp,
      site_id: imp.site_id || siteId  // Conservé pour rétrocompatibilité
    }));

    // Diviser en batches
    const batches = [];
    for (let i = 0; i < impressionsToSend.length; i += BATCH_SIZE) {
      batches.push(impressionsToSend.slice(i, i + BATCH_SIZE));
    }

    logger.info('[SponsorImpressions] Sending impressions in batches', {
      totalImpressions: impressions.length,
      batchCount: batches.length,
      batchSize: BATCH_SIZE,
    });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      try {
        const result = await this.sendBatch(url, apiKey, batch);
        totalSent += batch.length;
        totalRecorded += result.recorded || 0;
        totalSkipped += result.skipped || 0;

        logger.debug('[SponsorImpressions] Batch sent successfully', {
          batch: i + 1,
          of: batches.length,
          sent: batch.length,
          recorded: result.recorded || 0,
        });

        // Mettre à jour le buffer après chaque batch réussi
        // Supprimer les impressions envoyées
        this.buffer = impressions.slice(totalSent);
        this.saveBuffer();

        // Petite pause entre les batches pour ne pas surcharger le serveur
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      } catch (error) {
        // Analyser le type d'erreur pour un meilleur logging
        let message;
        let isAuthError = false;

        if (error.response) {
          const status = error.response.status;
          message = `HTTP ${status}: ${error.response.data?.message || error.response.data?.error || error.response.statusText}`;
          isAuthError = status === 401 || status === 403;
        } else {
          message = error.message;
        }

        logger.warn('[SponsorImpressions] Batch send failed, stopping', {
          batch: i + 1,
          of: batches.length,
          error: message,
          sentSoFar: totalSent,
          isAuthError,
        });

        lastError = message;
        break; // Arrêter l'envoi, on réessaiera les impressions restantes plus tard
      }
    }

    this.lastSendTime = new Date().toISOString();

    if (totalSent > 0) {
      logger.info('[SponsorImpressions] Sent to server', {
        sent: totalSent,
        recorded: totalRecorded,
        skipped: totalSkipped,
        remaining: this.buffer.length,
      });
    }

    if (lastError && totalSent === 0) {
      logger.error('[SponsorImpressions] Failed to send to server', { error: lastError });
      return { sent: 0, error: lastError };
    }

    return {
      sent: totalSent,
      recorded: totalRecorded,
      skipped: totalSkipped,
      remaining: this.buffer.length,
      error: lastError,
    };
  }

  /**
   * Initialiser et démarrer l'envoi périodique
   */
  startPeriodicSync(serverUrl, siteId) {
    // Charger le buffer au démarrage
    this.loadBuffer();

    // Envoyer immédiatement s'il y a des données en attente
    if (this.buffer.length > 0) {
      logger.info('[SponsorImpressions] Found pending impressions, sending immediately', {
        count: this.buffer.length
      });
      this.sendToServer(serverUrl, siteId);
    }

    // Configurer l'envoi périodique
    setInterval(async () => {
      if (this.buffer.length > 0) {
        await this.sendToServer(serverUrl, siteId);
      }
    }, this.sendInterval);

    logger.info('[SponsorImpressions] Periodic sync started', {
      interval: this.sendInterval / 1000,
      unit: 'seconds'
    });
  }
}

// Instance singleton
const sponsorImpressionsCollector = new SponsorImpressionsCollector();

module.exports = sponsorImpressionsCollector;
