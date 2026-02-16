/**
 * Expiration Checker - Supprime automatiquement les vidéos NEOPRO expirées
 * S'exécute périodiquement pour nettoyer le contenu périmé
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('../logger');
const { config } = require('../config');
const { atomicWriteJson, safeReadConfig } = require('../utils/safe-config-io');

class ExpirationChecker {
  constructor() {
    this.checkIntervalMs = 60 * 60 * 1000; // Toutes les heures
    this.intervalHandle = null;
  }

  /**
   * Démarre le checker périodique
   */
  start() {
    logger.info('Starting expiration checker', { intervalMs: this.checkIntervalMs });

    // Exécuter immédiatement au démarrage
    this.checkExpiredVideos().catch(err => {
      logger.error('Initial expiration check failed:', err);
    });

    // Puis périodiquement
    this.intervalHandle = setInterval(() => {
      this.checkExpiredVideos().catch(err => {
        logger.error('Periodic expiration check failed:', err);
      });
    }, this.checkIntervalMs);
  }

  /**
   * Arrête le checker
   */
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info('Expiration checker stopped');
    }
  }

  /**
   * Vérifie et supprime les vidéos expirées
   */
  async checkExpiredVideos() {
    try {
      const configPath = config.paths.config;

      if (!(await fs.pathExists(configPath))) {
        logger.debug('No configuration file found, skipping expiration check');
        return { checked: 0, removed: 0 };
      }

      const configuration = await safeReadConfig(configPath);

      if (!configuration.categories || !Array.isArray(configuration.categories)) {
        return { checked: 0, removed: 0 };
      }

      const now = new Date();
      let checked = 0;
      let removed = 0;
      let modified = false;

      for (const category of configuration.categories) {
        // Vérifier les vidéos directes de la catégorie
        if (category.videos && Array.isArray(category.videos)) {
          const { remaining, removedCount } = await this.filterExpiredVideos(
            category.videos,
            category.name,
            now
          );
          if (removedCount > 0) {
            category.videos = remaining;
            removed += removedCount;
            modified = true;
          }
          checked += category.videos.length + removedCount;
        }

        // Vérifier les sous-catégories
        if (category.subCategories && Array.isArray(category.subCategories)) {
          for (const subCategory of category.subCategories) {
            if (subCategory.videos && Array.isArray(subCategory.videos)) {
              const { remaining, removedCount } = await this.filterExpiredVideos(
                subCategory.videos,
                `${category.name}/${subCategory.name}`,
                now
              );
              if (removedCount > 0) {
                subCategory.videos = remaining;
                removed += removedCount;
                modified = true;
              }
              checked += subCategory.videos.length + removedCount;
            }
          }
        }
      }

      // Sauvegarder la configuration si modifiée
      if (modified) {
        await atomicWriteJson(configPath, configuration);
        logger.info('Configuration updated after removing expired videos', { removed });

        // Notifier l'application locale
        await this.notifyLocalApp();
      }

      if (removed > 0) {
        logger.info('Expiration check completed', { checked, removed });
      } else {
        logger.debug('Expiration check completed, no expired videos', { checked });
      }

      return { checked, removed };
    } catch (error) {
      logger.error('Error checking expired videos:', error);
      throw error;
    }
  }

  /**
   * Filtre les vidéos expirées et supprime les fichiers
   * @param {Array} videos Liste des vidéos
   * @param {string} categoryPath Chemin de la catégorie (pour logs)
   * @param {Date} now Date actuelle
   * @returns {{ remaining: Array, removedCount: number }}
   */
  async filterExpiredVideos(videos, categoryPath, now) {
    const remaining = [];
    let removedCount = 0;

    for (const video of videos) {
      if (video.expires_at) {
        const expiresAt = new Date(video.expires_at);

        if (expiresAt < now) {
          // Vidéo expirée - supprimer le fichier
          const videoPath = path.join(config.paths.root, video.path);

          try {
            if (await fs.pathExists(videoPath)) {
              await fs.remove(videoPath);
              logger.info('Expired video removed', {
                video: video.name || video.filename,
                category: categoryPath,
                expiredAt: video.expires_at,
                path: videoPath,
              });
            }
          } catch (err) {
            logger.error('Failed to remove expired video file:', {
              video: video.name,
              path: videoPath,
              error: err.message,
            });
          }

          removedCount++;
          continue; // Ne pas ajouter à remaining
        }
      }

      remaining.push(video);
    }

    return { remaining, removedCount };
  }

  /**
   * Notifie l'application locale des changements
   */
  async notifyLocalApp() {
    const localSocket = require('../services/local-socket');
    localSocket.emit('config_updated', { reason: 'expired_videos_removed' });
    logger.debug('Local app notified of expired videos removal');
  }

  /**
   * Force une vérification immédiate
   */
  async forceCheck() {
    return this.checkExpiredVideos();
  }
}

// Singleton
const expirationChecker = new ExpirationChecker();

module.exports = expirationChecker;
