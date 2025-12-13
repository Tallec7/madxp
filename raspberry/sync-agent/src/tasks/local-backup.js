/**
 * Service de backup automatique local
 * Sauvegarde quotidienne de la configuration avec rétention de 7 jours
 */

const fs = require('fs-extra');
const path = require('path');
const { config } = require('../config');
const logger = require('../logger');

class LocalBackupService {
  constructor() {
    this.backupDir = path.join(config.paths.data || '/home/pi/neopro/data', 'backups');
    this.configPath = config.paths.config;
    this.retentionDays = 7;
    this.intervalId = null;
  }

  /**
   * Crée un backup de la configuration
   * @returns {Promise<string>} Chemin du backup créé
   */
  async createBackup() {
    try {
      if (!await fs.pathExists(this.configPath)) {
        logger.warn('No configuration to backup', { configPath: this.configPath });
        return null;
      }

      await fs.ensureDir(this.backupDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `config-${timestamp}.json`);

      // Copier la configuration
      await fs.copy(this.configPath, backupPath);

      // Nettoyer les anciens backups
      await this.cleanOldBackups();

      logger.info('Backup created', {
        backupPath,
        size: (await fs.stat(backupPath)).size
      });

      return backupPath;
    } catch (error) {
      logger.error('Failed to create backup:', error);
      return null;
    }
  }

  /**
   * Nettoie les backups plus vieux que la rétention
   */
  async cleanOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      let deletedCount = 0;

      for (const file of files) {
        if (!file.startsWith('config-') || !file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.remove(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info('Old backups cleaned', { deletedCount, retentionDays: this.retentionDays });
      }
    } catch (error) {
      logger.error('Failed to clean old backups:', error);
    }
  }

  /**
   * Liste tous les backups disponibles
   * @returns {Promise<Array>}
   */
  async listBackups() {
    try {
      if (!await fs.pathExists(this.backupDir)) {
        return [];
      }

      const files = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        if (!file.startsWith('config-') || !file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        backups.push({
          filename: file,
          path: filePath,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
        });
      }

      // Trier par date décroissante
      backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return backups;
    } catch (error) {
      logger.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Restaure un backup
   * @param {string} backupFilename Nom du fichier de backup
   * @returns {Promise<boolean>}
   */
  async restoreBackup(backupFilename) {
    try {
      const backupPath = path.join(this.backupDir, backupFilename);

      if (!await fs.pathExists(backupPath)) {
        logger.error('Backup file not found', { backupFilename });
        return false;
      }

      // Valider que c'est un JSON valide
      const content = await fs.readJson(backupPath);
      if (!content.categories) {
        logger.error('Invalid backup format', { backupFilename });
        return false;
      }

      // Créer un backup du fichier actuel avant restauration
      const currentBackup = await this.createBackup();
      logger.info('Created safety backup before restore', { currentBackup });

      // Restaurer
      await fs.copy(backupPath, this.configPath, { overwrite: true });

      logger.info('Backup restored', {
        backupFilename,
        categoriesCount: content.categories.length
      });

      return true;
    } catch (error) {
      logger.error('Failed to restore backup:', error);
      return false;
    }
  }

  /**
   * Démarre le backup quotidien automatique
   * Exécute tous les jours à 3h du matin
   */
  start() {
    // Créer un backup immédiat au démarrage
    this.createBackup().catch((err) => {
      logger.error('Initial backup failed:', err);
    });

    // Calculer le temps jusqu'à 3h du matin
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(3, 0, 0, 0);

    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const msUntilNextRun = nextRun.getTime() - now.getTime();

    // Premier backup à 3h
    setTimeout(() => {
      this.createBackup();

      // Puis toutes les 24h
      this.intervalId = setInterval(() => {
        this.createBackup();
      }, 24 * 60 * 60 * 1000);
    }, msUntilNextRun);

    logger.info('Local backup service started', {
      nextRun: nextRun.toISOString(),
      retentionDays: this.retentionDays,
    });
  }

  /**
   * Arrête le service de backup
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('Local backup service stopped');
  }
}

// Singleton
const localBackupService = new LocalBackupService();

module.exports = localBackupService;
