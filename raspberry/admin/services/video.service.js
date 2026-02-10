/**
 * VideoService
 *
 * Logique métier pour la gestion des vidéos : upload (simple/multiple),
 * listing, modification, suppression, vidéos orphelines, ajout à config
 * (simple et bulk), réorganisation, déplacement entre catégories.
 *
 * Dépend de ConfigurationService pour les opérations sur configuration.json.
 */

const fs = require('fs').promises;
const path = require('path');

const {
  VIDEOS_DIR,
  PROCESSING_DIR,
  THUMBNAILS_DIR,
  VIDEO_COMPRESSION_ENABLED,
  VIDEO_THUMBNAILS_ENABLED,
  CONFIG_JSON_INDENT,
  sanitizeSegment,
  sanitizeFilename,
  extractPathSegments,
  buildDisplayNameFromFilename,
  resolveDisplayName,
  guessMimeFromExtension,
  createVideoEntry,
  ensureDirectory,
  canModifyVideo,
} = require('../helpers');

const { NotFoundError, LockedError, ValidationError } = require('./errors');

class VideoService {
  /**
   * @param {Object} deps
   * @param {import('./configuration.service')} deps.configService
   * @param {Object} deps.cache
   * @param {Object} deps.NAMESPACES
   */
  constructor({ configService, cache, NAMESPACES }) {
    this._configService = configService;
    this._cache = cache;
    this._NAMESPACES = NAMESPACES;
  }

  // ===========================================================================
  // VIDEO LISTING
  // ===========================================================================

  /**
   * List all video files on disk, enriched with configuration metadata.
   */
  async listVideos() {
    await ensureDirectory(VIDEOS_DIR);
    console.log('[admin] GET /api/videos - listing directory:', VIDEOS_DIR);
    const metadata = await this._getVideoMetadataFromConfig();
    return this._listVideosRecursive(VIDEOS_DIR, VIDEOS_DIR, metadata);
  }

  /**
   * List orphan videos (on disk but not referenced in configuration).
   */
  async listOrphans() {
    await ensureDirectory(VIDEOS_DIR);
    const metadata = await this._getVideoMetadataFromConfig();
    const allVideos = await this._listVideosRecursive(VIDEOS_DIR, VIDEOS_DIR, metadata);
    return allVideos.filter((video) => !video.configCategory);
  }

  // ===========================================================================
  // UPLOAD
  // ===========================================================================

  /**
   * Process a single uploaded video file.
   * @param {Object} params
   * @param {Object} params.file - multer file object
   * @param {string} params.categoryId
   * @param {string} params.subcategoryId
   * @param {boolean} params.compress
   * @param {boolean} params.thumbnail
   * @param {string} params.displayName
   * @param {Function} params.addToProcessingQueue - callback to add a job
   * @returns {Object} result with file info and optional processing info
   */
  async processUpload({
    file,
    categoryId,
    subcategoryId,
    compress,
    thumbnail,
    displayName,
    addToProcessingQueue,
  }) {
    const { category, subcategory } = await this._resolveUploadDirectories(
      categoryId,
      subcategoryId,
    );
    const targetDir = subcategory
      ? path.join(VIDEOS_DIR, category, subcategory)
      : path.join(VIDEOS_DIR, category);
    await fs.mkdir(targetDir, { recursive: true });

    const targetPath = path.join(targetDir, file.filename);

    // If compression or thumbnail requested, add to processing queue
    if (compress || thumbnail) {
      const processingPath = path.join(PROCESSING_DIR, file.filename);
      await fs.mkdir(PROCESSING_DIR, { recursive: true });
      await fs.rename(file.path, processingPath);

      const jobId = await addToProcessingQueue({
        inputPath: processingPath,
        outputPath: targetPath,
        category,
        subcategory,
        compress,
        thumbnail,
        displayName,
        categoryId,
        subcategoryId,
        mimetype: file.mimetype,
      });

      return {
        file: {
          name: file.filename,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          path: targetPath,
        },
        processing: {
          jobId,
          compress,
          thumbnail,
          status: 'pending',
        },
      };
    }

    // No processing — move directly
    await fs.rename(file.path, targetPath);
    await this._updateConfigurationWithVideo(
      categoryId,
      subcategoryId,
      category,
      subcategory,
      file.filename,
      file.mimetype,
      displayName,
    );

    return {
      file: {
        name: file.filename,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        path: targetPath,
      },
    };
  }

  /**
   * Process multiple uploaded video files (no compression/thumbnail).
   */
  async processMultipleUploads({ files, categoryId, subcategoryId }) {
    const { category, subcategory } = await this._resolveUploadDirectories(
      categoryId,
      subcategoryId,
    );
    const targetDir = subcategory
      ? path.join(VIDEOS_DIR, category, subcategory)
      : path.join(VIDEOS_DIR, category);
    await fs.mkdir(targetDir, { recursive: true });

    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        const targetPath = path.join(targetDir, file.filename);
        await fs.rename(file.path, targetPath);
        await this._updateConfigurationWithVideo(
          categoryId,
          subcategoryId,
          category,
          subcategory,
          file.filename,
          file.mimetype,
          null,
        );

        results.push({
          name: file.filename,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          path: targetPath,
          success: true,
        });

        console.log('[admin] POST /api/videos/upload-multiple - file uploaded', {
          filename: file.filename,
          size: file.size,
          category,
          subcategory,
        });
      } catch (fileError) {
        errors.push({ name: file.filename, error: fileError.message });
        console.error('[admin] Error uploading file:', file.filename, fileError);
      }
    }

    return { results, errors, total: files.length };
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================

  /**
   * Delete a video file from disk and configuration.
   */
  async deleteVideo(category, filename) {
    const normalizedCategory = (category || '').replace(/\\/g, '/');
    const filePath = path.join(VIDEOS_DIR, normalizedCategory, filename);
    const relativePath = ['videos', normalizedCategory, filename]
      .filter(Boolean)
      .join('/')
      .replace(/\\/g, '/');

    // Check if video is locked (NEOPRO)
    const config = await this._configService.loadConfig();
    for (const cat of config.categories || []) {
      const video = (cat.videos || []).find((v) => v.path === relativePath);
      if (video) {
        const canModify = canModifyVideo(video, cat);
        if (!canModify.allowed) {
          throw new LockedError(canModify.reason);
        }
        break;
      }
      for (const sub of cat.subCategories || []) {
        const subVideo = (sub.videos || []).find((v) => v.path === relativePath);
        if (subVideo) {
          const canModify = canModifyVideo(subVideo, cat, sub);
          if (!canModify.allowed) {
            throw new LockedError(canModify.reason);
          }
          break;
        }
      }
    }

    await fs.access(filePath);
    await fs.unlink(filePath);
    await this._cleanupEmptyDirs(path.dirname(filePath), VIDEOS_DIR);
    await this._removeVideoFromConfig(relativePath);

    return { path: relativePath };
  }

  // ===========================================================================
  // EDIT (move/rename)
  // ===========================================================================

  /**
   * Edit a video: move, rename, change category/displayName.
   */
  async editVideo({
    originalPath,
    categoryId,
    subcategoryId,
    displayName,
    newFilename,
  }) {
    const normalizedOriginal = (originalPath || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^videos\//i, '');
    const cleanCategoryId = (categoryId || '').trim();
    const cleanSubcategoryId = (subcategoryId || '').trim();
    const requestedFilename = sanitizeFilename(newFilename, null);

    if (!normalizedOriginal || normalizedOriginal.includes('..')) {
      throw new ValidationError('Chemin de fichier invalide');
    }
    if (!cleanCategoryId) {
      throw new ValidationError('Cat\u00e9gorie requise');
    }

    const sourcePath = path.join(VIDEOS_DIR, normalizedOriginal);
    await fs.access(sourcePath);

    const currentFilename = path.basename(normalizedOriginal);
    const currentExt = path.extname(currentFilename);
    let finalFilename = requestedFilename || currentFilename;
    if (!path.extname(finalFilename) && currentExt) {
      finalFilename = `${finalFilename}${currentExt}`;
    }

    const { category: resolvedCategory, subcategory: resolvedSubcategory } =
      await this._resolveUploadDirectories(cleanCategoryId, cleanSubcategoryId || null);

    const destinationDir = resolvedSubcategory
      ? path.join(VIDEOS_DIR, resolvedCategory, resolvedSubcategory)
      : path.join(VIDEOS_DIR, resolvedCategory);
    await fs.mkdir(destinationDir, { recursive: true });

    const destinationPath = path.join(destinationDir, finalFilename);
    const shouldMove = path.resolve(destinationPath) !== path.resolve(sourcePath);

    const relativeDestinationPath = path
      .relative(VIDEOS_DIR, destinationPath)
      .replace(/\\/g, '/');

    if (shouldMove) {
      await fs.rename(sourcePath, destinationPath);
      await this._cleanupEmptyDirs(path.dirname(sourcePath), VIDEOS_DIR);

      // Move thumbnail if it exists
      try {
        const oldThumbnailPath = path.join(
          THUMBNAILS_DIR,
          normalizedOriginal.replace(/\.[^.]+$/, '.jpg'),
        );
        const newThumbnailPath = path.join(
          THUMBNAILS_DIR,
          relativeDestinationPath.replace(/\.[^.]+$/, '.jpg'),
        );

        await fs.access(oldThumbnailPath);
        await fs.mkdir(path.dirname(newThumbnailPath), { recursive: true });
        await fs.rename(oldThumbnailPath, newThumbnailPath);
        console.log('[admin] Thumbnail moved:', oldThumbnailPath, '->', newThumbnailPath);
        await this._cleanupEmptyDirs(path.dirname(oldThumbnailPath), THUMBNAILS_DIR);
      } catch (thumbError) {
        console.log('[admin] No thumbnail to move or error:', thumbError.message);
      }
    }

    // Update configuration
    const originalConfigPath = ['videos', normalizedOriginal]
      .filter(Boolean)
      .join('/')
      .replace(/\\/g, '/');

    await this._removeVideoFromConfig(originalConfigPath);
    await this._updateConfigurationWithVideo(
      cleanCategoryId,
      cleanSubcategoryId || null,
      resolvedCategory,
      resolvedSubcategory,
      finalFilename,
      guessMimeFromExtension(finalFilename),
      displayName,
    );

    return {
      path: relativeDestinationPath,
      displayName: resolveDisplayName(finalFilename, displayName),
      category: path.dirname(relativeDestinationPath),
      configCategory: cleanCategoryId,
      configSubcategory: cleanSubcategoryId || null,
    };
  }

  // ===========================================================================
  // ADD TO CONFIG (orphans)
  // ===========================================================================

  /**
   * Add a single orphan video to configuration.
   */
  async addToConfig({ videoPath, categoryId, subcategoryId, displayName }) {
    if (!videoPath || !categoryId) {
      throw new ValidationError('videoPath et categoryId requis');
    }

    const fullPath = path.join(VIDEOS_DIR, videoPath);
    try {
      await fs.access(fullPath);
    } catch {
      throw new NotFoundError('Fichier vid\u00e9o non trouv\u00e9');
    }

    const config = await this._configService.loadConfig();
    config.categories = config.categories || [];

    let category = config.categories.find(
      (cat) => (cat.id || '').toLowerCase() === categoryId.toLowerCase(),
    );

    if (!category) {
      category = { id: categoryId, name: categoryId, videos: [], subCategories: [] };
      config.categories.push(category);
    }

    const filename = path.basename(videoPath);
    const fullVideoPath = `videos/${videoPath}`;
    const mimeType = guessMimeFromExtension(filename);
    const newEntry = createVideoEntry(
      filename,
      fullVideoPath,
      mimeType,
      displayName || buildDisplayNameFromFilename(filename),
    );

    if (subcategoryId) {
      category.subCategories = category.subCategories || [];
      let subCategory = category.subCategories.find(
        (sub) => (sub.id || '').toLowerCase() === subcategoryId.toLowerCase(),
      );
      if (!subCategory) {
        subCategory = { id: subcategoryId, name: subcategoryId, videos: [] };
        category.subCategories.push(subCategory);
      }
      subCategory.videos = subCategory.videos || [];
      if (!subCategory.videos.some((v) => v.path === fullVideoPath)) {
        subCategory.videos.push(newEntry);
      }
    } else {
      category.videos = category.videos || [];
      if (!category.videos.some((v) => v.path === fullVideoPath)) {
        category.videos.push(newEntry);
      }
    }

    await this._configService.saveConfig(config);
    this._configService.invalidateVideoCaches();

    return newEntry;
  }

  /**
   * Bulk add orphan videos to configuration.
   */
  async addToConfigBulk({ videos, categoryId, subcategoryId }) {
    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      throw new ValidationError('videos doit \u00eatre un tableau non vide');
    }
    if (!categoryId) {
      throw new ValidationError('categoryId requis');
    }

    const config = await this._configService.loadConfig();
    config.categories = config.categories || [];

    let category = config.categories.find(
      (cat) => (cat.id || '').toLowerCase() === categoryId.toLowerCase(),
    );
    if (!category) {
      category = { id: categoryId, name: categoryId, videos: [], subCategories: [] };
      config.categories.push(category);
    }

    let targetVideosArray = (category.videos = category.videos || []);
    if (subcategoryId) {
      category.subCategories = category.subCategories || [];
      let subCategory = category.subCategories.find(
        (sub) => (sub.id || '').toLowerCase() === subcategoryId.toLowerCase(),
      );
      if (!subCategory) {
        subCategory = { id: subcategoryId, name: subcategoryId, videos: [] };
        category.subCategories.push(subCategory);
      }
      targetVideosArray = subCategory.videos = subCategory.videos || [];
    }

    const results = { added: [], skipped: [], errors: [] };

    for (const video of videos) {
      const videoPath = video.path;
      if (!videoPath) {
        results.errors.push({ path: 'unknown', error: 'Chemin manquant' });
        continue;
      }

      const fullPath = path.join(VIDEOS_DIR, videoPath);
      try {
        await fs.access(fullPath);
      } catch {
        results.errors.push({ path: videoPath, error: 'Fichier non trouv\u00e9' });
        continue;
      }

      const filename = path.basename(videoPath);
      const fullVideoPath = `videos/${videoPath}`;
      const mimeType = guessMimeFromExtension(filename);
      const newEntry = createVideoEntry(
        filename,
        fullVideoPath,
        mimeType,
        video.displayName || buildDisplayNameFromFilename(filename),
      );

      if (targetVideosArray.some((v) => v.path === fullVideoPath)) {
        results.skipped.push(videoPath);
      } else {
        targetVideosArray.push(newEntry);
        results.added.push(videoPath);
      }
    }

    await this._configService.saveConfig(config);
    this._configService.invalidateVideoCaches();

    return results;
  }

  // ===========================================================================
  // DELETE FROM CONFIG (+ disk)
  // ===========================================================================

  async deleteFromConfig(videoPath) {
    if (!videoPath) {
      throw new ValidationError('videoPath requis');
    }

    const normalizedPath = videoPath.replace(/\\/g, '/').replace(/^videos\//, '');
    const fullPath = path.join(VIDEOS_DIR, normalizedPath);

    // Delete file from disk
    try {
      await fs.access(fullPath);
      await fs.unlink(fullPath);
      console.log('[admin] File deleted:', fullPath);
      await this._cleanupEmptyDirs(path.dirname(fullPath), VIDEOS_DIR);
    } catch {
      console.warn('[admin] File not found or already deleted:', fullPath);
    }

    // Remove from config
    const configVideoPath = videoPath.startsWith('videos/')
      ? videoPath
      : `videos/${normalizedPath}`;
    await this._removeVideoFromConfig(configVideoPath);

    return { path: videoPath };
  }

  // ===========================================================================
  // REORDER
  // ===========================================================================

  async reorderVideo({ videoPath, categoryId, subcategoryId, newIndex }) {
    if (!videoPath || !categoryId || newIndex === undefined) {
      throw new ValidationError('videoPath, categoryId et newIndex sont requis');
    }

    const config = await this._configService.loadConfig();
    const category = (config.categories || []).find(
      (c) => (c.id || '').toLowerCase() === categoryId.toLowerCase(),
    );
    if (!category) {
      throw new NotFoundError('Cat\u00e9gorie non trouv\u00e9e');
    }

    let videoList;
    if (subcategoryId) {
      const subCategory = (category.subCategories || []).find(
        (s) => (s.id || '').toLowerCase() === subcategoryId.toLowerCase(),
      );
      if (!subCategory) {
        throw new NotFoundError('Sous-cat\u00e9gorie non trouv\u00e9e');
      }
      videoList = subCategory.videos || [];
      subCategory.videos = videoList;
    } else {
      videoList = category.videos || [];
      category.videos = videoList;
    }

    const currentIndex = videoList.findIndex((v) => v.path === videoPath);
    if (currentIndex === -1) {
      throw new NotFoundError('Vid\u00e9o non trouv\u00e9e dans la liste');
    }

    const [video] = videoList.splice(currentIndex, 1);
    const adjustedIndex = newIndex > currentIndex ? newIndex - 1 : newIndex;
    videoList.splice(Math.min(adjustedIndex, videoList.length), 0, video);

    await this._configService.saveConfig(config);
    this._configService.invalidateVideoCaches();

    console.log('[admin] Video reordered:', videoPath, 'to index', newIndex);
    return { newIndex: adjustedIndex };
  }

  // ===========================================================================
  // MOVE between categories
  // ===========================================================================

  async moveVideo({
    videoPath,
    fromCategoryId,
    fromSubcategoryId,
    toCategoryId,
    toSubcategoryId,
    newIndex,
  }) {
    if (!videoPath || !fromCategoryId || !toCategoryId) {
      throw new ValidationError('videoPath, fromCategoryId et toCategoryId sont requis');
    }

    const config = await this._configService.loadConfig();

    // Find source
    const fromCategory = (config.categories || []).find(
      (c) => (c.id || '').toLowerCase() === fromCategoryId.toLowerCase(),
    );
    if (!fromCategory) {
      throw new NotFoundError('Cat\u00e9gorie source non trouv\u00e9e');
    }

    let sourceList;
    if (fromSubcategoryId) {
      const fromSub = (fromCategory.subCategories || []).find(
        (s) => (s.id || '').toLowerCase() === fromSubcategoryId.toLowerCase(),
      );
      if (!fromSub) {
        throw new NotFoundError('Sous-cat\u00e9gorie source non trouv\u00e9e');
      }
      sourceList = fromSub.videos || [];
    } else {
      sourceList = fromCategory.videos || [];
    }

    const videoIndex = sourceList.findIndex((v) => v.path === videoPath);
    if (videoIndex === -1) {
      throw new NotFoundError('Vid\u00e9o non trouv\u00e9e dans la source');
    }
    const [video] = sourceList.splice(videoIndex, 1);

    // Find target
    const toCategory = (config.categories || []).find(
      (c) => (c.id || '').toLowerCase() === toCategoryId.toLowerCase(),
    );
    if (!toCategory) {
      throw new NotFoundError('Cat\u00e9gorie cible non trouv\u00e9e');
    }

    let targetList;
    if (toSubcategoryId) {
      const toSub = (toCategory.subCategories || []).find(
        (s) => (s.id || '').toLowerCase() === toSubcategoryId.toLowerCase(),
      );
      if (!toSub) {
        throw new NotFoundError('Sous-cat\u00e9gorie cible non trouv\u00e9e');
      }
      targetList = toSub.videos || [];
      toSub.videos = targetList;
    } else {
      targetList = toCategory.videos || [];
      toCategory.videos = targetList;
    }

    const insertIndex =
      newIndex !== undefined ? Math.min(newIndex, targetList.length) : targetList.length;
    targetList.splice(insertIndex, 0, video);

    await this._configService.saveConfig(config);
    this._configService.invalidateVideoCaches();

    console.log(
      '[admin] Video moved:',
      videoPath,
      'from',
      fromCategoryId,
      '/',
      fromSubcategoryId,
      'to',
      toCategoryId,
      '/',
      toSubcategoryId,
    );

    return { newIndex: insertIndex };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Load video path mapping from configuration (with cache).
   */
  async _loadVideoPathMapping() {
    return this._cache.getOrSet(this._NAMESPACES.CONFIG, 'videoMapping', async () => {
      const mapping = { categories: {}, subcategories: {} };

      try {
        const config = await this._configService.loadConfig();
        const categories = config.categories || [];

        for (const category of categories) {
          if (!category || !category.id) continue;
          const categoryKey = category.id.trim().toLowerCase();
          let categoryDir = null;

          for (const video of category.videos || []) {
            const parsed = extractPathSegments(video.path);
            if (parsed && parsed.category) {
              categoryDir = parsed.category;
              break;
            }
          }

          for (const sub of category.subCategories || []) {
            if (!sub || !sub.id) continue;
            const subKey = `${categoryKey}::${sub.id.trim().toLowerCase()}`;
            let subDir = null;

            for (const video of sub.videos || []) {
              const parsed = extractPathSegments(video.path);
              if (parsed && parsed.subcategory) {
                subDir = parsed.subcategory;
              }
              if (parsed && parsed.category && !categoryDir) {
                categoryDir = parsed.category;
              }
              if (subDir && categoryDir) break;
            }

            if (subDir) mapping.subcategories[subKey] = subDir;
          }

          if (categoryDir) mapping.categories[categoryKey] = categoryDir;
        }
      } catch (error) {
        console.warn('[admin] Erreur lors du chargement de configuration.json:', error.message);
      }

      return mapping;
    }, 60000);
  }

  /**
   * Get video metadata from configuration (with cache).
   */
  async _getVideoMetadataFromConfig() {
    return this._cache.getOrSet(this._NAMESPACES.CONFIG, 'videoMetadata', async () => {
      const metadata = {};
      try {
        const config = await this._configService.loadConfig();

        for (const category of config.categories || []) {
          if (!category) continue;
          const categoryId = (category.id || category.name || '').trim();

          (category.videos || []).forEach((video) => {
            if (!video || !video.path) return;
            metadata[video.path.replace(/\\/g, '/')] = {
              displayName: video.name,
              categoryId,
              subcategoryId: null,
            };
          });

          for (const sub of category.subCategories || []) {
            if (!sub) continue;
            const subId = (sub.id || sub.name || '').trim();
            (sub.videos || []).forEach((video) => {
              if (!video || !video.path) return;
              metadata[video.path.replace(/\\/g, '/')] = {
                displayName: video.name,
                categoryId,
                subcategoryId: subId || null,
              };
            });
          }
        }

        // Sponsors
        for (const sponsor of config.sponsors || []) {
          if (!sponsor || !sponsor.path) continue;
          const normalizedPath = sponsor.path.replace(/\\/g, '/');
          metadata[normalizedPath] = {
            displayName:
              sponsor.name || buildDisplayNameFromFilename(path.basename(normalizedPath)),
            categoryId: 'sponsor',
            subcategoryId: null,
          };
        }
      } catch (error) {
        console.warn(
          '[admin] Unable to build configuration video metadata map:',
          error.message,
        );
      }

      return metadata;
    }, 60000);
  }

  /**
   * Resolve upload directories from category/subcategory IDs using the mapping.
   */
  async _resolveUploadDirectories(categoryId, subcategoryId) {
    const mapping = await this._loadVideoPathMapping();
    const normalizedCategoryKey = (categoryId || '').trim().toLowerCase();
    const fallbackCategory = sanitizeSegment(categoryId, 'AUTRES');
    const resolvedCategory = mapping.categories[normalizedCategoryKey] || fallbackCategory;

    let resolvedSubcategory = null;
    if (subcategoryId) {
      const normalizedSubKey = `${normalizedCategoryKey}::${subcategoryId.trim().toLowerCase()}`;
      resolvedSubcategory =
        mapping.subcategories[normalizedSubKey] || sanitizeSegment(subcategoryId, null);
    }

    return {
      category: resolvedCategory || 'AUTRES',
      subcategory: resolvedSubcategory,
    };
  }

  /**
   * Ensure category/subcategory structure exists in config, return target videos array.
   */
  async _ensureCategoryStructure(
    config,
    categoryId,
    subcategoryId,
    resolvedCategoryDir,
    resolvedSubcategoryDir,
  ) {
    config.categories = config.categories || [];
    const normalizedCategoryId = (categoryId || resolvedCategoryDir || 'Autres').trim();
    const normalizedCategoryKey = normalizedCategoryId.toLowerCase();

    let category = config.categories.find(
      (cat) => (cat.id || '').trim().toLowerCase() === normalizedCategoryKey,
    );

    if (!category) {
      category = { id: normalizedCategoryId, name: normalizedCategoryId, videos: [] };
      config.categories.push(category);
    }

    if (subcategoryId || resolvedSubcategoryDir) {
      category.subCategories = category.subCategories || [];
      const normalizedSubId = (subcategoryId || resolvedSubcategoryDir).trim();
      const normalizedSubKey = normalizedSubId.toLowerCase();

      let subCategory = category.subCategories.find(
        (sub) => (sub.id || '').trim().toLowerCase() === normalizedSubKey,
      );

      if (!subCategory) {
        subCategory = { id: normalizedSubId, name: normalizedSubId, videos: [] };
        category.subCategories.push(subCategory);
      }

      subCategory.videos = subCategory.videos || [];
      return subCategory.videos;
    }

    category.videos = category.videos || [];
    return category.videos;
  }

  /**
   * Update configuration.json with a new video entry.
   */
  async _updateConfigurationWithVideo(
    categoryId,
    subcategoryId,
    resolvedCategory,
    resolvedSubcategory,
    filename,
    mimeType,
    displayName,
  ) {
    const config = await this._configService.loadConfig();

    const targetVideos = await this._ensureCategoryStructure(
      config,
      categoryId,
      subcategoryId,
      resolvedCategory,
      resolvedSubcategory,
    );

    const relativePath = [
      'videos',
      resolvedCategory || sanitizeSegment(categoryId, 'AUTRES'),
    ];
    if (resolvedSubcategory) relativePath.push(resolvedSubcategory);
    relativePath.push(filename);
    const finalPath = relativePath.filter(Boolean).join('/');

    const alreadyExists = targetVideos.some((video) => video.path === finalPath);

    if (!alreadyExists) {
      const newEntry = createVideoEntry(filename, finalPath, mimeType, displayName);
      targetVideos.push(newEntry);
      await this._configService.saveConfig(config);
      this._configService.invalidateVideoCaches();
      console.log('[admin] configuration.json updated with new video entry', newEntry);
    } else {
      console.log('[admin] configuration.json already references video path', finalPath);
    }
  }

  /**
   * Remove a video entry from configuration.json.
   */
  async _removeVideoFromConfig(relativePath) {
    const config = await this._configService.loadConfig();
    let updated = false;

    const removeFromList = (videos = []) => {
      const index = videos.findIndex((video) => video.path === relativePath);
      if (index !== -1) {
        videos.splice(index, 1);
        updated = true;
      }
    };

    for (const category of config.categories || []) {
      removeFromList(category.videos);
      for (const sub of category.subCategories || []) {
        removeFromList(sub.videos);
      }
    }

    if (updated) {
      await this._configService.saveConfig(config);
      this._configService.invalidateVideoCaches();
      console.log('[admin] configuration.json cleaned from video path', relativePath);
    }
  }

  /**
   * Cleanup empty directories up to a stop directory.
   */
  async _cleanupEmptyDirs(dirPath, stopAt) {
    const resolvedStop = path.resolve(stopAt);
    let current = path.resolve(dirPath);

    while (current.startsWith(resolvedStop) && current !== resolvedStop) {
      const entries = await fs.readdir(current);
      if (entries.length === 0) {
        await fs.rmdir(current);
        current = path.dirname(current);
      } else {
        break;
      }
    }
  }

  /**
   * Recursively list video files in a directory.
   */
  async _listVideosRecursive(dir, baseDir = dir, metadata = {}) {
    const files = await fs.readdir(dir, { withFileTypes: true });
    const videos = [];

    for (const file of files) {
      const fullPath = path.join(dir, file.name);

      if (file.isDirectory()) {
        const subVideos = await this._listVideosRecursive(fullPath, baseDir, metadata);
        videos.push(...subVideos);
      } else if (file.name.match(/\.(mp4|mkv|mov|avi)$/i)) {
        const stats = await fs.stat(fullPath);
        const relativePath = path.relative(baseDir, fullPath);
        const normalizedRelative = relativePath.replace(/\\/g, '/');
        const relativeDir = path.dirname(normalizedRelative);
        const configurationPath = ['videos', normalizedRelative].filter(Boolean).join('/');
        const configEntry = metadata[configurationPath];

        videos.push({
          name: file.name,
          path: normalizedRelative,
          category: relativeDir,
          displayName:
            (configEntry && configEntry.displayName) ||
            buildDisplayNameFromFilename(file.name),
          configCategory: configEntry ? configEntry.categoryId : null,
          configSubcategory: configEntry ? configEntry.subcategoryId : null,
          size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
          modified: stats.mtime,
        });
      }
    }

    return videos;
  }
}

module.exports = VideoService;
