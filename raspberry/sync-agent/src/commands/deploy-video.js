const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../logger');
const { config } = require('../config');
const { isLocked } = require('../utils/config-merge');
const { atomicWriteJson, safeReadConfig } = require('../utils/safe-config-io');

const DEFAULT_EXTENSION = '.mp4';
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

function sanitizeFilename(name) {
  const fallbackBase = 'video';
  const fallbackExt = DEFAULT_EXTENSION;

  if (!name || typeof name !== 'string') {
    return `${fallbackBase}${fallbackExt}`;
  }

  const trimmed = name.trim();
  const ext = path.extname(trimmed) || fallbackExt;
  const base = path.basename(trimmed, ext) || fallbackBase;

  const safeBase = base
    .replace(ILLEGAL_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim();

  const sanitizedBase = safeBase || fallbackBase;
  const safeExt = (ext || fallbackExt).replace(/[^a-zA-Z0-9.]/g, '').toLowerCase() || fallbackExt;

  return `${sanitizedBase}${safeExt.startsWith('.') ? safeExt : `.${safeExt}`}`;
}

async function ensureUniqueFilename(filename, directory) {
  const parsed = path.parse(filename);
  let candidate = filename;
  let counter = 1;

  while (await fs.pathExists(path.join(directory, candidate))) {
    candidate = `${parsed.name} (${counter})${parsed.ext || DEFAULT_EXTENSION}`;
    counter += 1;
  }

  return candidate;
}

function buildRelativePath(videoData) {
  const segments = ['videos', videoData.category];
  if (videoData.subcategory) {
    segments.push(videoData.subcategory);
  }
  segments.push(videoData.filename);
  return segments.join('/');
}

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
    const {
      videoUrl,
      filename,
      originalName,
      category,
      subcategory,
      locked,
      expires_at,
      checksum,
      // Nouveaux champs pour le tracking analytics
      videoId,
      sponsorId,
      analyticsCategory,
    } = data;

    // CHECKSUM OBLIGATOIRE - Garantit l'intégrité des vidéos déployées
    if (!checksum) {
      const error = new Error('Checksum is required for video deployment. Video rejected for security.');
      error.code = 'CHECKSUM_REQUIRED';
      logger.error('Video deployment rejected: no checksum provided', { filename, category });
      throw error;
    }

    // Déploiement depuis le central = contenu NEOPRO (verrouillé par défaut)
    const isNeoProContent = locked !== false;

    const preferredName = originalName || filename;

    logger.info('Starting video deployment', {
      filename: preferredName,
      category,
      subcategory,
      isNeoProContent,
      expires_at,
      checksumProvided: !!checksum,
      videoId,
      sponsorId,
      analyticsCategory,
    });

    try {
      const targetDir = path.join(
        config.paths.videos,
        category,
        subcategory || ''
      );

      await fs.ensureDir(targetDir);

      const sanitizedFilename = sanitizeFilename(preferredName || filename);
      const finalFilename = await ensureUniqueFilename(sanitizedFilename, targetDir);
      const targetPath = path.join(targetDir, finalFilename);

      if (await fs.pathExists(targetPath)) {
        logger.warn('Video already exists, will be overwritten', { targetPath });
      }

      await this.downloadFile(videoUrl, targetPath, progressCallback);

      // Vérifier le checksum (OBLIGATOIRE pour garantir l'intégrité)
      const downloadedChecksum = await calculateFileChecksum(targetPath);

      if (downloadedChecksum !== checksum) {
        // Supprimer le fichier corrompu
        const fileStats = await fs.stat(targetPath);
        await fs.remove(targetPath);

        const error = new Error(
          `Checksum incorrect (fichier téléchargé: ${Math.round(fileStats.size / 1024)}KB). ` +
          `Cela peut se produire si le fichier source était encore en cours d'upload. ` +
          `Veuillez patienter et relancer le déploiement.`
        );
        error.code = 'CHECKSUM_MISMATCH';
        error.expectedChecksum = checksum;
        error.actualChecksum = downloadedChecksum;
        logger.error('Video corrupted during transfer', {
          expected: checksum,
          actual: downloadedChecksum,
          fileSize: fileStats.size,
        });
        throw error;
      }
      logger.info('Checksum verified successfully', { checksum: downloadedChecksum });

      const finalVideoData = {
        ...data,
        filename: finalFilename,
        originalName: preferredName || finalFilename,
      };

      await this.updateConfiguration(finalVideoData);

      await this.notifyLocalApp();

      logger.info('Video deployed successfully', { targetPath });

      const stat = await fs.stat(targetPath);
      return {
        success: true,
        path: targetPath,
        size: stat.size,
        checksum, // Checksum vérifié
        filename: finalFilename,
      };
    } catch (error) {
      logger.error('Video deployment failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Télécharge un fichier avec support de reprise (resume)
   * @param {string} url URL du fichier
   * @param {string} targetPath Chemin de destination
   * @param {function} progressCallback Callback pour le progrès
   */
  async downloadFile(url, targetPath, progressCallback) {
    const tempPath = `${targetPath}.downloading`;
    let startByte = 0;
    let totalSize = 0;

    try {
      // Vérifier si un téléchargement partiel existe
      if (await fs.pathExists(tempPath)) {
        const stats = await fs.stat(tempPath);
        startByte = stats.size;
        logger.info('Resuming download from byte', { startByte, tempPath });
      }

      // Headers pour la reprise
      const headers = startByte > 0 ? { Range: `bytes=${startByte}-` } : {};

      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 600000,
        maxContentLength: config.security.maxDownloadSize,
        headers,
      });

      // Calculer la taille totale
      const contentLength = parseInt(response.headers['content-length'] || '0', 10);
      const contentRange = response.headers['content-range'];

      if (contentRange) {
        // Format: bytes 0-999/1000
        const match = contentRange.match(/\/(\d+)$/);
        totalSize = match ? parseInt(match[1], 10) : contentLength + startByte;
      } else {
        totalSize = contentLength + startByte;
      }

      // Ouvrir le fichier en mode append si reprise
      const writer = fs.createWriteStream(tempPath, { flags: startByte > 0 ? 'a' : 'w' });
      let downloadedBytes = startByte;

      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalSize > 0 && progressCallback) {
          const progress = Math.round((downloadedBytes / totalSize) * 100);
          progressCallback(progress);
        }
      });

      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Renommer le fichier temporaire en fichier final
      await fs.rename(tempPath, targetPath);

      logger.info('Download completed', {
        totalSize,
        resumed: startByte > 0,
        resumedFrom: startByte,
      });
    } catch (error) {
      const errorMsg = error.message || '';
      logger.error('Download failed', { error: errorMsg, url, targetPath });

      // Détecter les erreurs typiques de téléchargement incomplet
      const isIncompleteDownload =
        errorMsg.includes('socket hang up') ||
        errorMsg.includes('ECONNRESET') ||
        errorMsg.includes('network timeout') ||
        errorMsg.includes('read ETIMEDOUT') ||
        (error.response && error.response.status >= 500);

      // Vérifier la taille du fichier partiel pour le diagnostic
      let partialSizeInfo = '';
      if (await fs.pathExists(tempPath)) {
        try {
          const stats = await fs.stat(tempPath);
          partialSizeInfo = ` (téléchargement partiel: ${Math.round(stats.size / 1024)}KB)`;
        } catch {
          // Ignorer
        }
      }

      if (isIncompleteDownload) {
        throw new Error(
          `Téléchargement interrompu${partialSizeInfo}. ` +
          `Le fichier source peut être incomplet ou en cours d'upload. ` +
          `Veuillez patienter et relancer le déploiement.`
        );
      }

      // Ne pas supprimer le fichier temporaire pour permettre la reprise
      throw new Error(`Échec du téléchargement vidéo${partialSizeInfo}: ${errorMsg}`);
    }
  }

  async updateConfiguration(videoData) {
    try {
      const configPath = config.paths.config;

      // S'assurer que le répertoire parent existe
      await fs.ensureDir(path.dirname(configPath));

      let configuration = await safeReadConfig(configPath);

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
      const relativePath = buildRelativePath(videoData);

      const videoEntry = {
        name: videoData.originalName.replace(/\.[^/.]+$/, ''),
        filename: videoData.filename,
        path: relativePath,
        type: 'video/mp4',
        locked: isNeoProContent,
        deployed_at: new Date().toISOString(),
        // Métadonnées pour le tracking analytics (depuis le central)
        video_id: videoData.videoId || null,
        sponsor_id: videoData.sponsorId || null,
        analytics_category: videoData.analyticsCategory || null,
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

      // Mettre à jour le tableau sponsors si c'est une vidéo sponsor
      // (catégorie SPONSORS ou sponsorId défini)
      const isSponsorVideo = videoData.category?.toUpperCase() === 'SPONSORS' ||
                             videoData.analyticsCategory === 'sponsor' ||
                             videoData.sponsorId;

      if (isSponsorVideo) {
        if (!configuration.sponsors) {
          configuration.sponsors = [];
        }

        const sponsorEntry = {
          name: videoData.originalName.replace(/\.[^/.]+$/, ''),
          path: relativePath,
          type: 'video/mp4',
          // Métadonnées pour le tracking analytics
          video_id: videoData.videoId || null,
          sponsor_id: videoData.sponsorId || null,
          analytics_category: 'sponsor',
        };

        const existingSponsorIndex = configuration.sponsors.findIndex(s => s.path === relativePath);
        if (existingSponsorIndex >= 0) {
          configuration.sponsors[existingSponsorIndex] = sponsorEntry;
          logger.info('Updated sponsor in sponsors array', { path: relativePath });
        } else {
          configuration.sponsors.push(sponsorEntry);
          logger.info('Added sponsor to sponsors array', { path: relativePath });
        }
      }

      await atomicWriteJson(configPath, configuration);

      logger.info('Configuration updated', { configPath });
    } catch (error) {
      logger.error('Failed to update configuration:', error);
      throw error;
    }
  }

  async notifyLocalApp() {
    const localSocket = require('../services/local-socket');
    localSocket.emit('config_updated');
    logger.info('Local app notified of configuration change');
  }
}

module.exports = new VideoDeployHandler();
module.exports.calculateFileChecksum = calculateFileChecksum;
