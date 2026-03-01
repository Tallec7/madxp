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

// Mutex: empêche 2 deploy_video concurrents sur le même videoId
// Bug v3.87: à la reconnexion, le central peut flusher 2x la même commande,
// causant 2 downloads concurrents sur le même .downloading → corruption checksum + ENOENT
const activeDeployments = new Map(); // videoId → Promise

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
      siteSponsorId,
    } = data;

    // CHECKSUM OBLIGATOIRE - Garantit l'intégrité des vidéos déployées
    if (!checksum) {
      const error = new Error('Checksum is required for video deployment. Video rejected for security.');
      error.code = 'CHECKSUM_REQUIRED';
      logger.error('Video deployment rejected: no checksum provided', { filename, category });
      throw error;
    }

    // Mutex: si un deploy est déjà en cours pour ce videoId, attendre qu'il finisse
    // plutôt que de lancer 2 downloads concurrents sur le même .downloading
    const dedupeKey = videoId || checksum;
    if (activeDeployments.has(dedupeKey)) {
      logger.warn('Duplicate deploy_video detected, waiting for in-flight deployment', {
        videoId, filename: originalName || filename,
      });
      try {
        const existingResult = await activeDeployments.get(dedupeKey);
        logger.info('Returning result from in-flight deployment (deduplicated)', { videoId });
        return existingResult;
      } catch (existingError) {
        logger.warn('In-flight deployment failed, retrying fresh', { videoId, error: existingError.message });
        // L'autre a échoué → on relance proprement ci-dessous
      }
    }

    const deployPromise = this._executeInternal(data, progressCallback, dedupeKey);
    activeDeployments.set(dedupeKey, deployPromise);

    try {
      return await deployPromise;
    } finally {
      activeDeployments.delete(dedupeKey);
    }
  }

  async _executeInternal(data, progressCallback, _dedupeKey) {
    const {
      videoUrl,
      filename,
      originalName,
      category,
      subcategory,
      locked,
      expires_at,
      checksum,
      videoId,
      sponsorId,
      analyticsCategory,
      siteSponsorId,
    } = data;

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

      // === Secondary variant deployment (non-blocking) ===
      let secondaryResult = null;
      const secondaryVariant = data.secondaryVariant || data.ledVariant; // Rétrocompat: accepte aussi ledVariant
      if (secondaryVariant && secondaryVariant.videoUrl) {
        try {
          secondaryResult = await this.deploySecondaryVariant(secondaryVariant, finalVideoData, progressCallback);
          logger.info('Secondary variant deployed', { secondaryResult });
        } catch (secondaryError) {
          // Non-bloquant: erreur écran secondaire ne fait pas échouer le déploiement principal
          logger.warn('Secondary variant deployment failed (non-blocking)', {
            error: secondaryError.message,
            videoId: data.videoId,
          });
        }
      }

      await this.notifyLocalApp();

      logger.info('Video deployed successfully', { targetPath, hasSecondaryVariant: !!secondaryResult });

      const stat = await fs.stat(targetPath);
      return {
        success: true,
        path: targetPath,
        size: stat.size,
        checksum, // Checksum vérifié
        filename: finalFilename,
        secondaryVariant: secondaryResult,
      };
    } catch (error) {
      logger.error('Video deployment failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Déploie la variante pour l'écran secondaire d'une vidéo
   * Télécharge dans videos-secondary/{category}/{subcategory}/ et met à jour la config
   * Rétrocompat: migre automatiquement videos-led/ → videos-secondary/ si trouvé
   * @param {object} secondaryVariant Données de la variante écran secondaire
   * @param {object} tvVideoData Données de la vidéo TV déjà déployée
   * @param {function} progressCallback Callback pour le progrès
   */
  async deploySecondaryVariant(secondaryVariant, tvVideoData, progressCallback) {
    const { videoUrl, filename, checksum, width, height, duration } = secondaryVariant;

    const secondaryBaseDir = config.paths.videos.replace(/\/videos\/?$/, '/videos-secondary');
    const targetDir = path.join(secondaryBaseDir, tvVideoData.category, tvVideoData.subcategory || '');
    await fs.ensureDir(targetDir);

    // Rétrocompat: migrer l'ancien répertoire videos-led/ s'il existe
    const legacyBaseDir = config.paths.videos.replace(/\/videos\/?$/, '/videos-led');
    try {
      if (await fs.pathExists(legacyBaseDir)) {
        logger.info('Migrating legacy videos-led/ to videos-secondary/', { legacyBaseDir, secondaryBaseDir });
        await fs.move(legacyBaseDir, secondaryBaseDir, { overwrite: false });
      }
    } catch {
      // Non-bloquant: si la migration échoue (ex: déjà fait), on continue
    }

    const sanitizedFilename = sanitizeFilename(filename || tvVideoData.filename);
    const finalFilename = await ensureUniqueFilename(sanitizedFilename, targetDir);
    const targetPath = path.join(targetDir, finalFilename);

    logger.info('Deploying secondary variant', { targetPath, checksum: !!checksum });

    await this.downloadFile(videoUrl, targetPath, null); // No progress for secondary

    // Verify checksum if provided
    if (checksum) {
      const downloadedChecksum = await calculateFileChecksum(targetPath);
      if (downloadedChecksum !== checksum) {
        await fs.remove(targetPath);
        throw new Error(`Secondary variant checksum mismatch: expected ${checksum}, got ${downloadedChecksum}`);
      }
    }

    // Update configuration.json with secondary variant info on the video entry
    const configPath = config.paths.config;
    const configuration = await safeReadConfig(configPath);

    const relativePath = buildRelativePath(tvVideoData);
    // Build secondary path using the ACTUAL downloaded filename (finalFilename),
    // not the primary video's filename — they differ when the secondary variant
    // was uploaded with its own original name (e.g. "Joueur_76_entree_1.mp4"
    // vs primary "Joueur 94 entrée (3).mp4"). ADR-033 fix.
    const secondaryDir = path.dirname(relativePath).replace(/^videos/, 'videos-secondary');
    const secondaryRelativePath = secondaryDir + '/' + finalFilename;

    // Find the video entry in categories and add variants.secondary
    if (configuration.categories) {
      for (const cat of configuration.categories) {
        const addSecondaryVariant = (videoEntry) => {
          if (videoEntry.path === relativePath) {
            if (!videoEntry.variants) videoEntry.variants = {};
            // Écrire sous la nouvelle clé "secondary" et supprimer l'ancienne "led"
            videoEntry.variants.secondary = {
              path: secondaryRelativePath,
              filename: finalFilename,
              width: width || null,
              height: height || null,
              duration: duration || null,
            };
            delete videoEntry.variants.led; // Nettoyage rétrocompat
            return true;
          }
          return false;
        };

        for (const v of cat.videos || []) {
          if (addSecondaryVariant(v)) break;
        }
        for (const sub of cat.subCategories || []) {
          for (const v of sub.videos || []) {
            if (addSecondaryVariant(v)) break;
          }
        }
      }
    }

    // Also update sponsors array if it's a sponsor video
    if (configuration.sponsors) {
      for (const sponsor of configuration.sponsors) {
        if (sponsor.path === relativePath) {
          if (!sponsor.variants) sponsor.variants = {};
          sponsor.variants.secondary = {
            path: secondaryRelativePath,
            filename: finalFilename,
            width: width || null,
            height: height || null,
          };
          delete sponsor.variants.led; // Nettoyage rétrocompat
          break;
        }
      }
    }

    // Also update timeCategories[].loopVideos[] (phases de match)
    if (configuration.timeCategories) {
      for (const tc of configuration.timeCategories) {
        for (const loopVideo of tc.loopVideos || []) {
          if (loopVideo.path === relativePath) {
            if (!loopVideo.variants) loopVideo.variants = {};
            loopVideo.variants.secondary = {
              path: secondaryRelativePath,
              filename: finalFilename,
              width: width || null,
              height: height || null,
              duration: duration || null,
            };
            delete loopVideo.variants.led; // Nettoyage rétrocompat
          }
        }
      }
    }

    await atomicWriteJson(configPath, configuration);

    const stat = await fs.stat(targetPath);
    return {
      success: true,
      path: targetPath,
      size: stat.size,
      filename: finalFilename,
    };
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
        site_sponsor_id: videoData.siteSponsorId || null,
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
          site_sponsor_id: videoData.siteSponsorId || null,
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
