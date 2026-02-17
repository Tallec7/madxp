const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../logger');
const { config } = require('../config');

const NEOPRO_ROOT = '/home/pi/neopro';

/**
 * Calcule le checksum SHA256 d'un buffer
 * @param {Buffer} buffer - Buffer contenant les données
 * @returns {string} Checksum hexadécimal
 */
function calculateBufferChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Handler pour déployer des assets (images watermark, logos) sur le Pi
 */
class AssetDeployHandler {
  /**
   * Exécute le déploiement d'un asset
   * @param {Object} data - Données de l'asset
   * @param {string} data.assetUrl - URL de téléchargement de l'asset
   * @param {string} data.filename - Nom du fichier
   * @param {string} data.targetPath - Chemin relatif de destination (ex: 'assets/watermarks/logo.png')
   * @param {string} [data.checksum] - Checksum SHA256 optionnel pour vérification
   * @param {string} [data.assetType] - Type d'asset ('watermark', 'logo', etc.)
   * @param {function} progressCallback - Callback pour le progrès (0-100)
   * @returns {Promise<Object>} Résultat du déploiement
   */
  async execute(data, progressCallback) {
    const { assetUrl, filename, targetPath, checksum, assetType } = data;

    logger.info('[deploy-asset] Starting deployment', {
      filename,
      targetPath,
      assetType,
      checksumProvided: !!checksum,
    });

    if (progressCallback) {
      progressCallback(0, 'starting', `Déploiement de ${filename}...`);
    }

    try {
      // Créer le dossier cible
      // Les assets doivent être dans webapp/ car nginx sert depuis ce dossier
      const fullTargetPath = path.join(NEOPRO_ROOT, 'webapp', targetPath);
      const targetDir = path.dirname(fullTargetPath);
      await fs.ensureDir(targetDir);

      if (progressCallback) {
        progressCallback(20, 'downloading', 'Téléchargement...');
      }

      // Télécharger l'asset
      const response = await axios({
        method: 'get',
        url: assetUrl,
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 10 * 1024 * 1024, // 10 MB max pour les assets
      });

      const buffer = Buffer.from(response.data);

      if (progressCallback) {
        progressCallback(60, 'verifying', 'Vérification...');
      }

      // Vérifier le checksum si fourni
      if (checksum) {
        const downloadedChecksum = calculateBufferChecksum(buffer);
        if (downloadedChecksum !== checksum) {
          const error = new Error(`Checksum mismatch: expected ${checksum}, got ${downloadedChecksum}`);
          error.code = 'CHECKSUM_MISMATCH';
          logger.error('[deploy-asset] Checksum verification failed', {
            expected: checksum,
            actual: downloadedChecksum,
          });
          throw error;
        }
        logger.info('[deploy-asset] Checksum verified successfully');
      }

      if (progressCallback) {
        progressCallback(80, 'writing', 'Écriture...');
      }

      // Sauvegarder l'ancien fichier si existe (backup)
      if (await fs.pathExists(fullTargetPath)) {
        const backupPath = `${fullTargetPath}.backup`;
        await fs.copy(fullTargetPath, backupPath);
        logger.info('[deploy-asset] Created backup of existing file', { backupPath });
      }

      // Écrire le nouveau fichier
      await fs.writeFile(fullTargetPath, buffer);

      if (progressCallback) {
        progressCallback(100, 'completed', 'Terminé');
      }

      logger.info('[deploy-asset] Successfully deployed', {
        path: fullTargetPath,
        size: buffer.length,
      });

      // Note: PAS de notification config_updated ici.
      // deploy_asset dépose un fichier image, il ne modifie pas configuration.json.
      // C'est update_config (envoyé séparément) qui met à jour la config
      // et émet config_updated pour recharger l'app Angular.

      return {
        success: true,
        path: targetPath,
        fullPath: fullTargetPath,  // /home/pi/neopro/webapp/assets/...
        size: buffer.length,
        checksum: checksum || calculateBufferChecksum(buffer),
      };

    } catch (error) {
      logger.error('[deploy-asset] Deployment failed', {
        error: error.message,
        stack: error.stack,
      });

      if (progressCallback) {
        progressCallback(0, 'failed', error.message);
      }

      throw error;
    }
  }

}

module.exports = new AssetDeployHandler();
