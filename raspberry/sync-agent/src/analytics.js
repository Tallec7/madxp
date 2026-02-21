// @ts-check
/** @typedef {import('./types').VideoPlayEvent} VideoPlayEvent */

/**
 * Module de collecte et d'envoi des analytics vidéo
 * Lit le buffer depuis le localStorage de l'application Angular
 * et l'envoie au serveur central
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');
const { config } = require('./config');

const ANALYTICS_STORAGE_KEY = 'neopro_analytics_buffer';
const LOCAL_STORAGE_PATH = path.join(
  process.env.HOME || '/home/pi',
  '.config',
  'chromium',
  'Default',
  'Local Storage',
  'leveldb'
);

// Chemin alternatif pour le fichier analytics (plus simple)
const ANALYTICS_FILE_PATH = path.join(
  process.env.HOME || '/home/pi',
  'neopro',
  'data',
  'analytics_buffer.json'
);

// Configuration des batches pour éviter les timeouts
const BATCH_SIZE = 100; // Nombre d'événements par batch
const BATCH_TIMEOUT = 15000; // 15 secondes par batch
const BATCH_DELAY = 500; // 500ms entre chaque batch

// Limite maximale du buffer (50K événements ≈ 3 mois d'activité normale)
// Évite la surcharge serveur si le Pi est offline longtemps (ex: club fermé l'été)
const MAX_BUFFER_SIZE = 50000;

class AnalyticsCollector {
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
      // Essayer de lire depuis le fichier dédié
      if (fs.existsSync(ANALYTICS_FILE_PATH)) {
        const data = fs.readFileSync(ANALYTICS_FILE_PATH, 'utf8');
        this.buffer = JSON.parse(data);

        // Appliquer la limite au chargement (FIFO: garder les plus récents)
        if (this.buffer.length > MAX_BUFFER_SIZE) {
          const overflow = this.buffer.length - MAX_BUFFER_SIZE;
          this.buffer = this.buffer.slice(overflow);
          this.saveBuffer();
          logger.warn('Analytics buffer truncated on load', {
            dropped: overflow,
            maxSize: MAX_BUFFER_SIZE,
            remaining: this.buffer.length,
          });
        }

        logger.debug('Analytics buffer loaded', { count: this.buffer.length });
        return this.buffer;
      }

      // Fallback: lire depuis localStorage (plus complexe avec LevelDB)
      // Pour simplifier, on utilise un fichier JSON dédié
      return [];
    } catch (error) {
      logger.error('Failed to load analytics buffer', { error: error.message });
      return [];
    }
  }

  /**
   * Sauvegarder le buffer dans le fichier local
   */
  saveBuffer() {
    try {
      // Créer le dossier si nécessaire
      const dir = path.dirname(ANALYTICS_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(ANALYTICS_FILE_PATH, JSON.stringify(this.buffer, null, 2));
      logger.debug('Analytics buffer saved', { count: this.buffer.length });
    } catch (error) {
      logger.error('Failed to save analytics buffer', { error: error.message });
    }
  }

  /**
   * Ajouter des événements au buffer (appelé par l'API locale)
   * Applique la limite MAX_BUFFER_SIZE en supprimant les plus anciens si nécessaire (FIFO)
   */
  addEvents(events) {
    if (!Array.isArray(events)) {
      events = [events];
    }

    this.buffer.push(...events);

    // Appliquer la limite: supprimer les plus anciens si on dépasse MAX_BUFFER_SIZE
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      const overflow = this.buffer.length - MAX_BUFFER_SIZE;
      this.buffer = this.buffer.slice(overflow);
      logger.warn('Analytics buffer overflow, dropped oldest events', {
        dropped: overflow,
        maxSize: MAX_BUFFER_SIZE,
        remaining: this.buffer.length,
      });
    }

    this.saveBuffer();

    logger.info('Analytics events added', { count: events.length, total: this.buffer.length });
  }

  /**
   * Récupérer et vider le buffer pour envoi
   */
  flushBuffer() {
    const events = [...this.buffer];
    this.buffer = [];
    this.saveBuffer();
    return events;
  }

  /**
   * Obtenir les statistiques du buffer
   */
  getStats() {
    return {
      count: this.buffer.length,
      oldestEvent: this.buffer.length > 0 ? this.buffer[0].played_at : null,
      newestEvent: this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].played_at : null,
      lastSendTime: this.lastSendTime,
    };
  }

  /**
   * Envoyer un batch d'analytics au serveur
   * @private
   */
  async sendBatch(url, siteId, batch) {
    const response = await axios.post(
      url,
      {
        site_id: siteId,
        plays: batch,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: BATCH_TIMEOUT,
      }
    );
    return response.data;
  }

  /**
   * Envoyer les analytics au serveur central via HTTP
   * Utilise des batches pour éviter les timeouts avec de gros volumes
   */
  async sendToServer(serverUrl, siteId) {
    const events = this.loadBuffer();

    if (events.length === 0) {
      logger.debug('No analytics events to send');
      return { sent: 0 };
    }

    const baseUrl = serverUrl?.replace(/\/$/, '');
    if (!baseUrl) {
      logger.error('Failed to send analytics to server', { error: 'Central server URL is not configured' });
      return { sent: 0, error: 'Central server URL is not configured' };
    }

    const url = `${baseUrl}/api/analytics/video-plays`;
    let totalSent = 0;
    let totalRecorded = 0;
    let lastError = null;

    // Diviser en batches
    const batches = [];
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      batches.push(events.slice(i, i + BATCH_SIZE));
    }

    logger.info('Sending analytics in batches', {
      totalEvents: events.length,
      batchCount: batches.length,
      batchSize: BATCH_SIZE,
    });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      let batchSent = false;

      // Retry logic: up to 2 retries for transient errors (429, 5xx, timeout)
      for (let attempt = 0; attempt < 3 && !batchSent; attempt++) {
        try {
          if (attempt > 0) {
            const retryDelay = attempt * 5000; // 5s, 10s
            logger.info('Retrying analytics batch after transient error', {
              batch: i + 1, attempt: attempt + 1, retryDelay,
            });
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }

          const result = await this.sendBatch(url, siteId, batch);
          totalSent += batch.length;
          totalRecorded += result.recorded || 0;
          batchSent = true;

          logger.debug('Batch sent successfully', {
            batch: i + 1,
            of: batches.length,
            sent: batch.length,
            recorded: result.recorded,
          });

          // Mettre à jour le buffer après chaque batch réussi
          this.buffer = events.slice(totalSent);
          this.saveBuffer();

          // Petite pause entre les batches pour ne pas surcharger le serveur
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
          }
        } catch (error) {
          const status = error.response?.status;
          const message = error.response
            ? `HTTP ${status}: ${error.response.data?.error || error.response.statusText || 'Unknown error'}`
            : error.message;

          const isTransient = !status || status === 429 || status >= 500;

          // Non-transient errors (4xx except 429) - stop immediately
          if (!isTransient) {
            logger.warn('Analytics batch rejected (non-transient), stopping', {
              batch: i + 1, of: batches.length, error: message, sentSoFar: totalSent,
            });
            lastError = message;
            i = batches.length; // Break outer loop
            break;
          }

          // Transient errors - retry if attempts remain
          if (isTransient && attempt < 2) {
            logger.warn('Analytics batch transient error, will retry', {
              batch: i + 1, attempt: attempt + 1, error: message,
            });
            continue;
          }

          // Final failure for this batch after retries
          logger.warn('Analytics batch send failed after retries, stopping', {
            batch: i + 1, of: batches.length, error: message,
            sentSoFar: totalSent, attempts: attempt + 1,
          });

          lastError = message;
          i = batches.length; // Break outer loop
          break;
        }
      }
    }

    this.lastSendTime = new Date().toISOString();

    if (totalSent > 0) {
      logger.info('Analytics sent to server', {
        sent: totalSent,
        recorded: totalRecorded,
        remaining: this.buffer.length,
      });
    }

    if (lastError && totalSent === 0) {
      logger.error('Failed to send analytics to server', { error: lastError });
      return { sent: 0, error: lastError };
    }

    return {
      sent: totalSent,
      recorded: totalRecorded,
      remaining: this.buffer.length,
      error: lastError,
    };
  }
}

// Instance singleton
const analyticsCollector = new AnalyticsCollector();

module.exports = analyticsCollector;
