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

class SponsorImpressionsCollector {
  constructor() {
    this.buffer = [];
    this.lastSendTime = null;
    this.sendInterval = config.monitoring?.analyticsInterval || 5 * 60 * 1000; // 5 minutes
    this.maxBufferSize = 100;
  }

  /**
   * Charger le buffer depuis le fichier local
   */
  loadBuffer() {
    try {
      if (fs.existsSync(IMPRESSIONS_FILE_PATH)) {
        const data = fs.readFileSync(IMPRESSIONS_FILE_PATH, 'utf8');
        this.buffer = JSON.parse(data);
        logger.debug('[SponsorImpressions] Buffer loaded', { count: this.buffer.length });
        return this.buffer;
      }
      return [];
    } catch (error) {
      logger.error('[SponsorImpressions] Failed to load buffer:', error.message);
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
   */
  addImpressions(impressions) {
    if (!Array.isArray(impressions)) {
      impressions = [impressions];
    }

    this.buffer.push(...impressions);
    this.saveBuffer();

    logger.info('[SponsorImpressions] Impressions added', {
      count: impressions.length,
      total: this.buffer.length
    });

    // Auto-flush si le buffer est trop gros
    if (this.buffer.length >= this.maxBufferSize) {
      logger.info('[SponsorImpressions] Buffer full, auto-flushing');
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
   * Envoyer les impressions au serveur central via HTTP.
   * Authentification par API key du site (Bearer token).
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

    try {
      const baseUrl = serverUrl?.replace(/\/$/, '');
      if (!baseUrl) {
        throw new Error('Central server URL is not configured');
      }

      // Récupérer l'API key du site pour l'authentification
      const apiKey = config.site?.apiKey;
      if (!apiKey) {
        throw new Error('Site API key is not configured (SITE_API_KEY)');
      }

      // Note: Le site_id n'est plus nécessaire dans le payload,
      // il est extrait automatiquement de l'API key par le central.
      // On le garde pour compatibilité mais le central utilise l'auth.
      const impressionsToSend = impressions.map(imp => ({
        ...imp,
        site_id: imp.site_id || siteId  // Conservé pour rétrocompatibilité
      }));

      const url = `${baseUrl}/api/analytics/impressions`;
      const response = await axios.post(
        url,
        {
          impressions: impressionsToSend,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`  // Auth par API key du site
          },
          timeout: 15000,  // 15 secondes pour les gros batches
        }
      );

      const result = response.data;

      // Vider le buffer local après envoi réussi
      this.buffer = [];
      this.saveBuffer();
      this.lastSendTime = new Date().toISOString();

      logger.info('[SponsorImpressions] Sent to server', {
        sent: impressions.length,
        recorded: result.recorded || 0,
        skipped: result.skipped || 0,
      });

      return {
        sent: impressions.length,
        recorded: result.recorded || 0,
        skipped: result.skipped || 0
      };
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

      if (isAuthError) {
        logger.error('[SponsorImpressions] Authentication failed - check SITE_API_KEY', { error: message });
      } else {
        logger.error('[SponsorImpressions] Failed to send to server', { error: message });
      }

      // Garder les impressions dans le buffer pour réessayer plus tard
      return { sent: 0, error: message };
    }
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
