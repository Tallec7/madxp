/**
 * Module de collecte et d'envoi des analytics vidéo
 * Lit le buffer depuis le localStorage de l'application Angular
 * et l'envoie au serveur central
 */

const fs = require('fs');
const path = require('path');
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

class AnalyticsCollector {
  constructor() {
    this.buffer = [];
    this.lastSendTime = null;
    this.sendInterval = config.monitoring?.analyticsInterval || 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Charger le buffer depuis le fichier local
   */
  loadBuffer() {
    try {
      // Essayer de lire depuis le fichier dédié
      if (fs.existsSync(ANALYTICS_FILE_PATH)) {
        const data = fs.readFileSync(ANALYTICS_FILE_PATH, 'utf8');
        this.buffer = JSON.parse(data);
        logger.debug('Analytics buffer loaded', { count: this.buffer.length });
        return this.buffer;
      }

      // Fallback: lire depuis localStorage (plus complexe avec LevelDB)
      // Pour simplifier, on utilise un fichier JSON dédié
      return [];
    } catch (error) {
      logger.error('Failed to load analytics buffer:', error.message);
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
      logger.error('Failed to save analytics buffer:', error.message);
    }
  }

  /**
   * Ajouter des événements au buffer (appelé par l'API locale)
   */
  addEvents(events) {
    if (!Array.isArray(events)) {
      events = [events];
    }

    this.buffer.push(...events);
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
   * Envoyer les analytics au serveur central via HTTP
   */
  async sendToServer(serverUrl, siteId) {
    const events = this.loadBuffer();

    if (events.length === 0) {
      logger.debug('No analytics events to send');
      return { sent: 0 };
    }

    try {
      const url = `${serverUrl}/api/analytics/video-plays`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          site_id: siteId,
          plays: events,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const result = await response.json();

      // Vider le buffer local après envoi réussi
      this.buffer = [];
      this.saveBuffer();
      this.lastSendTime = new Date().toISOString();

      logger.info('Analytics sent to server', {
        sent: events.length,
        recorded: result.recorded,
      });

      return { sent: events.length, recorded: result.recorded };
    } catch (error) {
      logger.error('Failed to send analytics to server:', error.message);

      // Garder les événements dans le buffer pour réessayer plus tard
      return { sent: 0, error: error.message };
    }
  }
}

// Instance singleton
const analyticsCollector = new AnalyticsCollector();

module.exports = analyticsCollector;
