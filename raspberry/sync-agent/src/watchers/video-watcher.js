/**
 * Module de surveillance des fichiers vidéo
 *
 * Surveille le dossier vidéos et notifie le callback
 * lorsque des fichiers sont ajoutés, modifiés ou supprimés.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const logger = require('../logger');

// Extensions vidéo supportées
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];

// Cache file for checksums and duration
const CHECKSUM_CACHE_FILE = '.video-checksums.json';

// Duration cache (separate for faster lookups)
const DURATION_CACHE_FILE = '.video-durations.json';

class VideoWatcher {
  constructor(videosPath, onChange) {
    this.videosPath = videosPath;
    this.onChange = onChange;
    this.watchers = []; // Multiple watchers for each subdirectory (Linux compatibility)
    this.pollInterval = null; // Fallback polling for Linux
    this.debounceTimer = null;
    this.debounceDelay = 2000; // 2 secondes de debounce
    this.lastVideoList = null;
    this.checksumCache = new Map(); // filename -> { checksum, size, mtime }
    this.checksumQueue = []; // Files pending checksum calculation
    this.isCalculatingChecksums = false;
    this.durationCache = new Map(); // filename -> { duration, size, mtime }
    this.durationQueue = []; // Files pending duration extraction
    this.isExtractingDurations = false;
    this.ffprobeAvailable = null; // Will be checked on start
  }

  /**
   * Démarre la surveillance du dossier vidéos
   * Utilise le polling sur Linux car fs.watch recursive n'est pas supporté
   */
  async start() {
    if (this.watchers.length > 0 || this.pollInterval) {
      logger.warn('[video-watcher] Already watching videos directory');
      return;
    }

    try {
      // Vérifier que le dossier existe
      if (!fs.existsSync(this.videosPath)) {
        logger.warn('[video-watcher] Videos directory not found, creating it', { path: this.videosPath });
        fs.mkdirSync(this.videosPath, { recursive: true });
      }

      // Charger les caches (checksums et durées)
      this.loadChecksumCache();
      this.loadDurationCache();

      // Vérifier si ffprobe est disponible
      await this.checkFfprobeAvailable();

      // Initialiser la liste des vidéos
      const initialVideos = this.scanVideos();
      this.lastVideoList = this.hashVideoList(initialVideos);

      // Lancer le calcul des checksums et durées en background
      this.processChecksumQueue();
      this.processDurationQueue();

      // Sur Linux, fs.watch avec recursive: true n'est pas supporté
      // On utilise un polling périodique à la place (plus fiable sur Raspberry Pi)
      const POLL_INTERVAL = 30000; // 30 secondes

      this.pollInterval = setInterval(() => {
        this.checkForChanges();
      }, POLL_INTERVAL);

      // Aussi surveiller le dossier racine pour les nouveaux sous-dossiers
      try {
        const rootWatcher = fs.watch(this.videosPath, (eventType, filename) => {
          if (filename) {
            this.handleChange(eventType, filename);
          }
        });
        rootWatcher.on('error', (error) => {
          logger.warn('[video-watcher] Root watcher error:', error.message);
        });
        this.watchers.push(rootWatcher);
      } catch (watchError) {
        logger.warn('[video-watcher] Could not create root watcher, using polling only:', watchError.message);
      }

      logger.info('[video-watcher] Started watching videos directory', {
        path: this.videosPath,
        mode: 'polling',
        interval: POLL_INTERVAL,
        initialVideoCount: initialVideos.length
      });
    } catch (error) {
      logger.error('[video-watcher] Failed to start watcher:', error);
    }
  }

  /**
   * Vérifie les changements (appelé par le polling)
   */
  checkForChanges() {
    try {
      const videos = this.scanVideos();
      const newHash = this.hashVideoList(videos);

      if (newHash !== this.lastVideoList) {
        logger.info('[video-watcher] Change detected via polling', {
          videoCount: videos.length
        });
        this.lastVideoList = newHash;
        if (this.onChange) {
          this.onChange();
        }
      }
    } catch (error) {
      logger.error('[video-watcher] Error checking for changes:', error);
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
   * Charge le cache des durées depuis le disque
   */
  loadDurationCache() {
    try {
      const cachePath = path.join(this.videosPath, DURATION_CACHE_FILE);
      if (fs.existsSync(cachePath)) {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        this.durationCache = new Map(Object.entries(data));
        logger.debug('[video-watcher] Loaded duration cache', { entries: this.durationCache.size });
      }
    } catch (error) {
      logger.warn('[video-watcher] Could not load duration cache:', error.message);
      this.durationCache = new Map();
    }
  }

  /**
   * Sauvegarde le cache des durées sur le disque
   */
  saveDurationCache() {
    try {
      const cachePath = path.join(this.videosPath, DURATION_CACHE_FILE);
      const data = Object.fromEntries(this.durationCache);
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
      logger.debug('[video-watcher] Saved duration cache', { entries: this.durationCache.size });
    } catch (error) {
      logger.warn('[video-watcher] Could not save duration cache:', error.message);
    }
  }

  /**
   * Vérifie si ffprobe est disponible sur le système
   */
  async checkFfprobeAvailable() {
    try {
      await execAsync('ffprobe -version');
      this.ffprobeAvailable = true;
      logger.info('[video-watcher] ffprobe is available, video durations will be extracted');
    } catch {
      this.ffprobeAvailable = false;
      logger.warn('[video-watcher] ffprobe not available, video durations will not be extracted');
    }
  }

  /**
   * Extrait la durée d'une vidéo via ffprobe
   * @param {string} filePath Chemin du fichier vidéo
   * @returns {Promise<number|null>} Durée en secondes ou null si erreur
   */
  async extractDuration(filePath) {
    if (!this.ffprobeAvailable) {
      return null;
    }

    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
        { timeout: 30000 } // 30s timeout
      );
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration) || duration <= 0) {
        return null;
      }
      return Math.round(duration); // Round to integer seconds
    } catch (error) {
      logger.debug('[video-watcher] Could not extract duration', { file: path.basename(filePath), error: error.message });
      return null;
    }
  }

  /**
   * Obtient la durée d'un fichier (depuis cache ou extraction)
   * @param {string} fullPath Chemin complet du fichier
   * @param {object} stat Stats du fichier
   * @returns {number|null} Durée en secondes ou null si en cours d'extraction
   */
  getDurationForFile(fullPath, stat) {
    const cacheKey = fullPath;
    const cached = this.durationCache.get(cacheKey);

    // Vérifier si le cache est valide (même taille et mtime)
    if (cached && cached.size === stat.size && cached.mtime === stat.mtime.toISOString()) {
      return cached.duration;
    }

    // Ajouter à la queue d'extraction si pas déjà présent et ffprobe disponible
    if (this.ffprobeAvailable && !this.durationQueue.find((q) => q.path === fullPath)) {
      this.durationQueue.push({ path: fullPath, stat });
      // Lancer le processing si pas déjà en cours
      if (!this.isExtractingDurations) {
        setImmediate(() => this.processDurationQueue());
      }
    }

    return null; // Sera extrait en background
  }

  /**
   * Traite la queue des durées à extraire
   */
  async processDurationQueue() {
    if (this.isExtractingDurations || this.durationQueue.length === 0) {
      return;
    }

    this.isExtractingDurations = true;
    let needsSync = false;

    while (this.durationQueue.length > 0) {
      const item = this.durationQueue.shift();

      try {
        // Vérifier que le fichier existe encore
        if (!fs.existsSync(item.path)) {
          continue;
        }

        const duration = await this.extractDuration(item.path);

        if (duration !== null) {
          this.durationCache.set(item.path, {
            duration,
            size: item.stat.size,
            mtime: item.stat.mtime.toISOString(),
          });

          needsSync = true;
          logger.debug('[video-watcher] Extracted duration', {
            file: path.basename(item.path),
            duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
          });
        }

        // Petite pause entre les fichiers pour ne pas surcharger le CPU
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        logger.warn('[video-watcher] Error extracting duration', {
          file: item.path,
          error: error.message,
        });
      }
    }

    this.isExtractingDurations = false;

    // Sauvegarder le cache et notifier si des durées ont été extraites
    if (needsSync) {
      this.saveDurationCache();
      // Notifier le changement pour que les nouvelles durées soient envoyées
      if (this.onChange) {
        await this.onChange();
      }
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
    // Arrêter tous les watchers
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch (e) {
        // Ignorer les erreurs de fermeture
      }
    }
    this.watchers = [];

    // Arrêter le polling
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    logger.info('[video-watcher] Stopped watching videos directory');
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

          // Obtenir la durée (depuis cache ou null si en cours d'extraction)
          const duration = this.getDurationForFile(fullPath, stat);

          videos.push({
            filename: entry.name,
            path: `videos/${entryRelativePath}`,
            category,
            subcategory,
            size: stat.size,
            duration, // Durée en secondes (ou null si pas encore extraite)
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
