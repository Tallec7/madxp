/**
 * Module de surveillance des changements de configuration
 *
 * Surveille le fichier configuration.json et notifie le callback
 * lorsque des modifications sont détectées.
 */

const fs = require('fs');
const logger = require('../logger');

class ConfigWatcher {
  constructor(configPath, onChange) {
    this.configPath = configPath;
    this.onChange = onChange;
    this.watcher = null;
    this.debounceTimer = null;
    this.debounceDelay = 2000; // 2 secondes de debounce
    this.lastHash = null;
    this.paused = false; // Pause during OTA to avoid spam
    this.resumeTimer = null;
  }

  /**
   * Démarre la surveillance du fichier de configuration
   */
  start() {
    if (this.watcher) {
      logger.warn('[config-watcher] Already watching configuration file');
      return;
    }

    try {
      // Vérifier que le fichier existe
      if (!fs.existsSync(this.configPath)) {
        logger.warn('[config-watcher] Configuration file not found', { path: this.configPath });
        return;
      }

      this.watcher = fs.watch(this.configPath, (eventType, filename) => {
        if (eventType === 'change') {
          this.handleChange();
        }
      });

      // Gérer les erreurs du watcher
      this.watcher.on('error', (error) => {
        logger.error('[config-watcher] Watcher error:', error);
        this.restart();
      });

      logger.info('[config-watcher] Started watching configuration', { path: this.configPath });
    } catch (error) {
      logger.error('[config-watcher] Failed to start watcher:', error);
    }
  }

  /**
   * Arrête la surveillance
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info('[config-watcher] Stopped watching configuration');
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    this.paused = false;
  }

  /**
   * Pause notifications (e.g. during OTA updates to avoid event spam).
   * Automatically resumes after durationMs. A single notifyChange is triggered
   * on resume if the file actually changed while paused.
   * @param {number} durationMs How long to pause (default: 30s)
   */
  pause(durationMs = 30000) {
    this.paused = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
    }
    this.resumeTimer = setTimeout(() => this.resume(), durationMs);
    logger.info('[config-watcher] Paused for OTA', { durationMs });
  }

  /**
   * Resume notifications and trigger a single change check
   */
  resume() {
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    this.paused = false;
    logger.info('[config-watcher] Resumed after OTA pause');
    // Single deferred check to catch changes that occurred while paused
    this.handleChange();
  }

  /**
   * Redémarre la surveillance (utile en cas d'erreur)
   */
  restart() {
    this.stop();
    setTimeout(() => this.start(), 5000); // Attendre 5 secondes avant de redémarrer
  }

  /**
   * Gère un changement détecté avec debounce
   */
  handleChange() {
    // Skip events while paused (OTA in progress)
    if (this.paused) return;

    // Annuler le timer précédent si il existe
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Attendre le debounce delay avant de notifier
    this.debounceTimer = setTimeout(() => {
      this.notifyChange();
    }, this.debounceDelay);
  }

  /**
   * Notifie le callback du changement
   */
  async notifyChange() {
    try {
      // Vérifier que le fichier existe toujours
      if (!fs.existsSync(this.configPath)) {
        logger.warn('[config-watcher] Configuration file deleted');
        return;
      }

      // Lire le nouveau contenu
      const content = fs.readFileSync(this.configPath, 'utf8');
      const newHash = this.calculateHash(content);

      // Vérifier si le contenu a réellement changé
      if (newHash === this.lastHash) {
        logger.debug('[config-watcher] No actual content change detected');
        return;
      }

      this.lastHash = newHash;

      logger.info('[config-watcher] Configuration change detected', {
        hash: newHash,
      });

      // Appeler le callback
      if (this.onChange) {
        await this.onChange();
      }
    } catch (error) {
      logger.error('[config-watcher] Error processing change:', error);
    }
  }

  /**
   * Calcule un hash simple du contenu
   */
  calculateHash(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}

module.exports = ConfigWatcher;
