/**
 * Module de surveillance des fichiers vidéo
 *
 * Surveille le dossier vidéos et notifie le callback
 * lorsque des fichiers sont ajoutés, modifiés ou supprimés.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../logger');

// Extensions vidéo supportées
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];

// Cache file for checksums
const CHECKSUM_CACHE_FILE = '.video-checksums.json';

class VideoWatcher {
  constructor(videosPath, onChange) {
    this.videosPath = videosPath;
    this.onChange = onChange;
    this.watcher = null;
    this.debounceTimer = null;
    this.debounceDelay = 2000; // 2 secondes de debounce
    this.lastVideoList = null;
    this.checksumCache = new Map(); // filename -> { checksum, size, mtime }
    this.checksumQueue = []; // Files pending checksum calculation
    this.isCalculatingChecksums = false;
  }

  /**
   * Démarre la surveillance du dossier vidéos
   */
  start() {
    if (this.watcher) {
      logger.warn('[video-watcher] Already watching videos directory');
      return;
    }

    try {
      // Vérifier que le dossier existe
      if (!fs.existsSync(this.videosPath)) {
        logger.warn('[video-watcher] Videos directory not found, creating it', { path: this.videosPath });
        fs.mkdirSync(this.videosPath, { recursive: true });
      }

      // Charger le cache des checksums
      this.loadChecksumCache();

      // Initialiser la liste des vidéos
      this.lastVideoList = this.hashVideoList(this.scanVideos());

      // Lancer le calcul des checksums en background
      this.processChecksumQueue();

      // Surveiller le dossier (récursif pour les sous-catégories)
      this.watcher = fs.watch(this.videosPath, { recursive: true }, (eventType, filename) => {
        if (filename && this.isVideoFile(filename)) {
          this.handleChange(eventType, filename);
        }
      });

      // Gérer les erreurs du watcher
      this.watcher.on('error', (error) => {
        logger.error('[video-watcher] Watcher error:', error);
        this.restart();
      });

      logger.info('[video-watcher] Started watching videos directory', { path: this.videosPath });
    } catch (error) {
      logger.error('[video-watcher] Failed to start watcher:', error);
    }
  }

  /**
   * Charge le cache des checksums depuis le disque
   */
  loadChecksumCache() {
    try {
      const cachePath = path.join(this.videosPath, CHECKSUM_CACHE_FILE);
      if (fs.existsSync(cachePath)) {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        this.checksumCache = new Map(Object.entries(data));
        logger.debug('[video-watcher] Loaded checksum cache', { entries: this.checksumCache.size });
      }
    } catch (error) {
      logger.warn('[video-watcher] Could not load checksum cache:', error.message);
      this.checksumCache = new Map();
    }
  }

  /**
   * Sauvegarde le cache des checksums sur le disque
   */
  saveChecksumCache() {
    try {
      const cachePath = path.join(this.videosPath, CHECKSUM_CACHE_FILE);
      const data = Object.fromEntries(this.checksumCache);
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
      logger.debug('[video-watcher] Saved checksum cache', { entries: this.checksumCache.size });
    } catch (error) {
      logger.warn('[video-watcher] Could not save checksum cache:', error.message);
    }
  }

  /**
   * Calcule le checksum MD5 d'un fichier (plus rapide que SHA256)
   * @param {string} filePath Chemin du fichier
   * @returns {Promise<string>} Checksum MD5
   */
  async calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (error) => reject(error));
    });
  }

  /**
   * Obtient le checksum d'un fichier (depuis cache ou calcul)
   * @param {string} fullPath Chemin complet du fichier
   * @param {object} stat Stats du fichier
   * @returns {string|null} Checksum ou null si en cours de calcul
   */
  getChecksumForFile(fullPath, stat) {
    const cacheKey = fullPath;
    const cached = this.checksumCache.get(cacheKey);

    // Vérifier si le cache est valide (même taille et mtime)
    if (cached && cached.size === stat.size && cached.mtime === stat.mtime.toISOString()) {
      return cached.checksum;
    }

    // Ajouter à la queue de calcul si pas déjà présent
    if (!this.checksumQueue.find((q) => q.path === fullPath)) {
      this.checksumQueue.push({ path: fullPath, stat });
      // Lancer le processing si pas déjà en cours
      if (!this.isCalculatingChecksums) {
        setImmediate(() => this.processChecksumQueue());
      }
    }

    return null; // Sera calculé en background
  }

  /**
   * Traite la queue des checksums à calculer
   */
  async processChecksumQueue() {
    if (this.isCalculatingChecksums || this.checksumQueue.length === 0) {
      return;
    }

    this.isCalculatingChecksums = true;
    let needsSync = false;

    while (this.checksumQueue.length > 0) {
      const item = this.checksumQueue.shift();

      try {
        // Vérifier que le fichier existe encore
        if (!fs.existsSync(item.path)) {
          continue;
        }

        const checksum = await this.calculateChecksum(item.path);

        this.checksumCache.set(item.path, {
          checksum,
          size: item.stat.size,
          mtime: item.stat.mtime.toISOString(),
        });

        needsSync = true;
        logger.debug('[video-watcher] Calculated checksum', {
          file: path.basename(item.path),
          checksum: checksum.substring(0, 8) + '...',
        });

        // Petite pause entre les fichiers pour ne pas bloquer le système
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        logger.warn('[video-watcher] Error calculating checksum:', {
          file: item.path,
          error: error.message,
        });
      }
    }

    this.isCalculatingChecksums = false;

    // Sauvegarder le cache et notifier si des checksums ont été calculés
    if (needsSync) {
      this.saveChecksumCache();
      // Notifier le changement pour que les nouveaux checksums soient envoyés
      if (this.onChange) {
        await this.onChange();
      }
    }
  }

  /**
   * Arrête la surveillance
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info('[video-watcher] Stopped watching videos directory');
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Redémarre la surveillance (utile en cas d'erreur)
   */
  restart() {
    this.stop();
    setTimeout(() => this.start(), 5000); // Attendre 5 secondes avant de redémarrer
  }

  /**
   * Vérifie si un fichier est une vidéo
   */
  isVideoFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return VIDEO_EXTENSIONS.includes(ext);
  }

  /**
   * Gère un changement détecté avec debounce
   */
  handleChange(eventType, filename) {
    logger.debug('[video-watcher] Change detected', { eventType, filename });

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
      const videos = this.scanVideos();
      const newHash = this.hashVideoList(videos);

      // Vérifier si la liste a réellement changé
      if (newHash === this.lastVideoList) {
        logger.debug('[video-watcher] No actual video list change detected');
        return;
      }

      this.lastVideoList = newHash;

      logger.info('[video-watcher] Video list change detected', {
        videoCount: videos.length,
      });

      // Appeler le callback
      if (this.onChange) {
        await this.onChange();
      }
    } catch (error) {
      logger.error('[video-watcher] Error processing change:', error);
    }
  }

  /**
   * Scanne le dossier vidéos et retourne la liste des fichiers
   * @returns {Array} Liste des vidéos avec métadonnées
   */
  scanVideos() {
    const videos = [];

    try {
      this.scanDirectory(this.videosPath, '', videos);
    } catch (error) {
      logger.error('[video-watcher] Error scanning videos directory:', error);
    }

    return videos;
  }

  /**
   * Scanne récursivement un dossier
   */
  scanDirectory(basePath, relativePath, videos) {
    const currentPath = relativePath ? path.join(basePath, relativePath) : basePath;

    if (!fs.existsSync(currentPath)) {
      return;
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        // Scanner les sous-dossiers (catégories/sous-catégories)
        this.scanDirectory(basePath, entryRelativePath, videos);
      } else if (entry.isFile() && this.isVideoFile(entry.name)) {
        try {
          const fullPath = path.join(currentPath, entry.name);
          const stat = fs.statSync(fullPath);

          // Extraire catégorie et sous-catégorie depuis le chemin
          const pathParts = relativePath.split(path.sep).filter(Boolean);
          const category = pathParts[0] || null;
          const subcategory = pathParts[1] || null;

          // Obtenir le checksum (depuis cache ou null si en cours de calcul)
          const checksum = this.getChecksumForFile(fullPath, stat);

          videos.push({
            filename: entry.name,
            path: `videos/${entryRelativePath}`,
            category,
            subcategory,
            size: stat.size,
            lastModified: stat.mtime.toISOString(),
            checksum,
          });
        } catch (error) {
          logger.warn('[video-watcher] Error reading file stats:', { file: entry.name, error: error.message });
        }
      }
    }
  }

  /**
   * Calcule un hash de la liste des vidéos pour détecter les changements
   */
  hashVideoList(videos) {
    // Créer une représentation stable de la liste
    const representation = videos
      .map((v) => `${v.path}:${v.size}:${v.lastModified}`)
      .sort()
      .join('|');
    return crypto.createHash('sha256').update(representation).digest('hex').substring(0, 16);
  }

  /**
   * Retourne les statistiques de stockage
   */
  getStorageStats() {
    try {
      const videos = this.scanVideos();
      const totalVideoSize = videos.reduce((sum, v) => sum + v.size, 0);

      // Obtenir l'espace disque (simpliste, fonctionne sur Linux)
      const diskStats = this.getDiskStats();

      return {
        videos,
        totalVideoSize,
        storage: diskStats,
      };
    } catch (error) {
      logger.error('[video-watcher] Error getting storage stats:', error);
      return {
        videos: [],
        totalVideoSize: 0,
        storage: null,
      };
    }
  }

  /**
   * Obtient les stats du disque
   */
  getDiskStats() {
    try {
      const { execSync } = require('child_process');
      const output = execSync(`df -B1 "${this.videosPath}" | tail -1`).toString();
      const parts = output.trim().split(/\s+/);

      if (parts.length >= 4) {
        return {
          total: parseInt(parts[1], 10),
          used: parseInt(parts[2], 10),
          free: parseInt(parts[3], 10),
        };
      }
    } catch (error) {
      logger.debug('[video-watcher] Could not get disk stats:', error.message);
    }

    return null;
  }
}

module.exports = VideoWatcher;
