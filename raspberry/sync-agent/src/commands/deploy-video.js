const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../logger');
const { config } = require('../config');
const { isLocked } = require('../utils/config-merge');

/**
 * Calcule le checksum SHA256 d'un fichier
 * @param {string} filePath Chemin vers le fichier
 * @returns {Promise<string>} Checksum hexadécimal
 */
async function calculateFileChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

class VideoDeployHandler {
  async execute(data, progressCallback) {
    const { videoUrl, filename, originalName, category, subcategory, locked, expires_at, checksum } = data;

    // Déploiement depuis le central = contenu NEOPRO (verrouillé par défaut)
    const isNeoProContent = locked !== false;

    logger.info('Starting video deployment', {
      filename,
      category,
      subcategory,
      isNeoProContent,
      expires_at,
      checksumProvided: !!checksum,
    });

    try {
      const targetDir = path.join(
        config.paths.videos,
        category,
        subcategory || ''
      );

      await fs.ensureDir(targetDir);

      const targetPath = path.join(targetDir, filename);

      if (await fs.pathExists(targetPath)) {
        logger.warn('Video already exists, will be overwritten', { targetPath });
      }

      await this.downloadFile(videoUrl, targetPath, progressCallback);

      // Vérifier le checksum si fourni
      if (checksum) {
        const downloadedChecksum = await calculateFileChecksum(targetPath);
        if (downloadedChecksum !== checksum) {
          // Supprimer le fichier corrompu
          await fs.remove(targetPath);
          const error = new Error(`Checksum mismatch: expected ${checksum}, got ${downloadedChecksum}`);
          error.code = 'CHECKSUM_MISMATCH';
          throw error;
        }
        logger.info('Checksum verified successfully', { checksum: downloadedChecksum });
      } else {
        logger.warn('No checksum provided, skipping verification');
      }

      await this.updateConfiguration(data);

      await this.notifyLocalApp();

      logger.info('Video deployed successfully', { targetPath });

      const stat = await fs.stat(targetPath);
      return {
        success: true,
        path: targetPath,
        size: stat.size,
        checksum: checksum || (await calculateFileChecksum(targetPath)),
      };
    } catch (error) {
      logger.error('Video deployment failed:', error);
      throw error;
    }
  }

  async downloadFile(url, targetPath, progressCallback) {
    try {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 600000,
        maxContentLength: config.security.maxDownloadSize,
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            if (progressCallback) {
              progressCallback(progress);
            }
          }
        },
      });

      const writer = fs.createWriteStream(targetPath);

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      logger.error('Download failed:', error);
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  async updateConfiguration(videoData) {
    try {
      const configPath = config.paths.config;

      // S'assurer que le répertoire parent existe
      await fs.ensureDir(path.dirname(configPath));

      let configuration = {};
      if (await fs.pathExists(configPath)) {
        const content = await fs.readFile(configPath, 'utf-8');
        configuration = JSON.parse(content);
      }

      if (!configuration.categories) {
        configuration.categories = [];
      }

      // Déploiement depuis le central = contenu NEOPRO (verrouillé par défaut)
      const isNeoProContent = videoData.locked !== false;

      let category = configuration.categories.find(c => c.name === videoData.category);

      if (!category) {
        category = {
          id: `category-${Date.now()}`,
          name: videoData.category,
          locked: isNeoProContent,
          owner: isNeoProContent ? 'neopro' : 'club',
          videos: [],
          subCategories: [],
        };
        configuration.categories.push(category);
        logger.info('Created new category', {
          name: videoData.category,
          locked: isNeoProContent,
          owner: isNeoProContent ? 'neopro' : 'club',
        });
      }

      // Construire le chemin relatif de la vidéo
      const relativePath = videoData.subcategory
        ? `videos/${videoData.category}/${videoData.subcategory}/${videoData.filename}`
        : `videos/${videoData.category}/${videoData.filename}`;

      const videoEntry = {
        name: videoData.originalName.replace(/\.[^/.]+$/, ''),
        path: relativePath,
        type: 'video/mp4',
        locked: isNeoProContent,
        deployed_at: new Date().toISOString(),
      };

      // Ajouter la date d'expiration si présente
      if (videoData.expires_at) {
        videoEntry.expires_at = videoData.expires_at;
      }

      if (videoData.subcategory) {
        let subcategory = category.subCategories.find(s => s.name === videoData.subcategory);

        if (!subcategory) {
          subcategory = {
            id: `subcategory-${Date.now()}`,
            name: videoData.subcategory,
            locked: isNeoProContent,
            videos: [],
          };
          category.subCategories.push(subcategory);
        }

        const existingIndex = subcategory.videos.findIndex(v => v.path === relativePath);
        if (existingIndex >= 0) {
          subcategory.videos[existingIndex] = videoEntry;
        } else {
          subcategory.videos.push(videoEntry);
        }
      } else {
        const existingIndex = category.videos.findIndex(v => v.path === relativePath);
        if (existingIndex >= 0) {
          category.videos[existingIndex] = videoEntry;
        } else {
          category.videos.push(videoEntry);
        }
      }

      await fs.writeFile(configPath, JSON.stringify(configuration, null, 2));

      logger.info('Configuration updated', { configPath });
    } catch (error) {
      logger.error('Failed to update configuration:', error);
      throw error;
    }
  }

  async notifyLocalApp() {
    try {
      const io = require('socket.io-client');
      const socket = io('http://localhost:3000', { timeout: 5000 });

      socket.emit('config_updated');

      setTimeout(() => socket.close(), 1000);

      logger.info('Local app notified of configuration change');
    } catch (error) {
      logger.warn('Could not notify local app:', error.message);
    }
  }
}

module.exports = new VideoDeployHandler();
module.exports.calculateFileChecksum = calculateFileChecksum;
