/**
 * Service de backup automatique local
 * Sauvegarde quotidienne de la configuration avec rétention de 7 jours
 * SÉCURITÉ: Backups chiffrés avec AES-256-GCM
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config');
const logger = require('../logger');
const { atomicWriteJson } = require('../utils/safe-config-io');

// Algorithme de chiffrement
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits pour GCM
const AUTH_TAG_LENGTH = 16; // 128 bits pour GCM
const SALT_LENGTH = 32;
const KEY_LENGTH = 32; // 256 bits pour AES-256

class LocalBackupService {
  constructor() {
    this.backupDir = path.join(config.paths.data || '/home/pi/neopro/data', 'backups');
    this.configPath = config.paths.config;
    this.retentionDays = 7;
    this.intervalId = null;
    // Clé de chiffrement dérivée du secret ou générée
    this.encryptionKey = this._deriveEncryptionKey();
  }

  /**
   * Dérive une clé de chiffrement à partir d'un secret ou la génère
   * @private
   */
  _deriveEncryptionKey() {
    const secret = process.env.BACKUP_ENCRYPTION_SECRET || process.env.SITE_API_KEY;
    if (!secret) {
      // Générer une clé persistante si aucun secret n'est configuré
      const keyPath = path.join(config.paths.data || '/home/pi/neopro/data', '.backup-key');
      try {
        if (fs.existsSync(keyPath)) {
          return Buffer.from(fs.readFileSync(keyPath, 'utf8'), 'hex');
        }
        const newKey = crypto.randomBytes(KEY_LENGTH);
        fs.ensureDirSync(path.dirname(keyPath));
        fs.writeFileSync(keyPath, newKey.toString('hex'), { mode: 0o600 });
        logger.info('Generated new backup encryption key');
        return newKey;
      } catch (error) {
        logger.error('Failed to manage encryption key, using fallback:', error);
        return crypto.createHash('sha256').update('neopro-backup-default').digest();
      }
    }
    // Dériver la clé du secret avec PBKDF2
    const salt = crypto.createHash('sha256').update('neopro-backup-salt').digest().slice(0, SALT_LENGTH);
    return crypto.pbkdf2Sync(secret, salt, 100000, KEY_LENGTH, 'sha512');
  }

  /**
   * Chiffre les données avec AES-256-GCM
   * @param {Buffer|string} data - Données à chiffrer
   * @returns {Buffer} Données chiffrées (IV + authTag + ciphertext)
   */
  _encrypt(data) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);

    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: IV (16) + AuthTag (16) + Ciphertext
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Déchiffre les données AES-256-GCM
   * @param {Buffer} encryptedData - Données chiffrées
   * @returns {Buffer} Données déchiffrées
   */
  _decrypt(encryptedData) {
    const iv = encryptedData.slice(0, IV_LENGTH);
    const authTag = encryptedData.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encryptedData.slice(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Crée un backup chiffré de la configuration
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
      // Extension .enc pour indiquer que le fichier est chiffré
      const backupPath = path.join(this.backupDir, `config-${timestamp}.json.enc`);

      // Lire et chiffrer la configuration
      const configData = await fs.readFile(this.configPath, 'utf8');
      const encryptedData = this._encrypt(configData);

      // Écrire le backup chiffré
      await fs.writeFile(backupPath, encryptedData, { mode: 0o600 });

      // Nettoyer les anciens backups
      await this.cleanOldBackups();

      logger.info('Encrypted backup created', {
        backupPath,
        originalSize: configData.length,
        encryptedSize: encryptedData.length
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
        // Support both encrypted (.enc) and legacy unencrypted (.json) backups
        if (!file.startsWith('config-') || (!file.endsWith('.json.enc') && !file.endsWith('.json'))) {
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
        // Support both encrypted (.enc) and legacy unencrypted (.json) backups
        if (!file.startsWith('config-') || (!file.endsWith('.json.enc') && !file.endsWith('.json'))) {
          continue;
        }

        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        backups.push({
          filename: file,
          path: filePath,
          size: stats.size,
          encrypted: file.endsWith('.enc'),
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
   * Restaure un backup (supporte les backups chiffrés et non chiffrés)
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

      let content;
      const isEncrypted = backupFilename.endsWith('.enc');

      if (isEncrypted) {
        // Déchiffrer le backup
        const encryptedData = await fs.readFile(backupPath);
        const decryptedData = this._decrypt(encryptedData);
        content = JSON.parse(decryptedData.toString('utf8'));
      } else {
        // Legacy: backup non chiffré
        content = await fs.readJson(backupPath);
      }

      if (!content.categories) {
        logger.error('Invalid backup format', { backupFilename });
        return false;
      }

      // Créer un backup du fichier actuel avant restauration
      const currentBackup = await this.createBackup();
      logger.info('Created safety backup before restore', { currentBackup });

      // Restaurer (toujours en clair car c'est le fichier de configuration actif)
      await atomicWriteJson(this.configPath, content);

      logger.info('Backup restored', {
        backupFilename,
        encrypted: isEncrypted,
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
