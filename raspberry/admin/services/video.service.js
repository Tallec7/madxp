/**
 * VideoService
 *
 * Logique m\u00e9tier pour la gestion des vid\u00e9os : upload (simple/multiple),
 * listing, modification, suppression, vid\u00e9os orphelines, ajout \u00e0 config
 * (simple et bulk), r\u00e9organisation, d\u00e9placement entre cat\u00e9gories.
 *
 * D\u00e9pend de ConfigurationService pour les op\u00e9rations sur configuration.json.
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
   *
   * Recursively scans VIDEOS_DIR for `.mp4`, `.mkv`, `.mov`, `.avi` files
   * and cross-references each with configuration.json to resolve display
   * names and category assignments.
   *
   * @returns {Promise<Array<{name: string, path: string, category: string, displayName: string, configCategory: string|null, configSubcategory: string|null, size: string, modified: Date}>>}
   */
  async listVideos() {
    await ensureDirectory(VIDEOS_DIR);
    console.log('[admin] GET /api/videos - listing directory:', VIDEOS_DIR);
    const metadata = await this._getVideoMetadataFromConfig();
    return this._listVideosRecursive(VIDEOS_DIR, VIDEOS_DIR, metadata);
  }

  /**
   * List orphan videos (on disk but not referenced in configuration).
   *
   * @returns {Promise<Array<{name: string, path: string, category: string, displayName: string, configCategory: null, configSubcategory: null, size: string, modified: Date}>>}
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
   *
   * If compression or thumbnail generation is requested, the file is moved
   * to PROCESSING_DIR and a job is added to the processing queue.
   * Otherwise, the file is moved directly to the target directory and
   * configuration.json is updated.
   *
   * @param {Object} params
   * @param {Object} params.file - multer file object (`{ filename, path, size, mimetype }`)
   * @param {string} params.categoryId - Target category ID
   * @param {string} params.subcategoryId - Target subcategory ID (optional)
   * @param {boolean} params.compress - Whether to compress the video
   * @param {boolean} params.thumbnail - Whether to generate a thumbnail
   * @param {string} params.displayName - Custom display name (optional)
   * @param {Function} params.addToProcessingQueue - Callback `(jobData) => Promise<string>` returning jobId
   * @returns {Promise<{file: {name: string, size: string, path: string}, processing?: {jobId: string, compress: boolean, thumbnail: boolean, status: string}}>}
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

    // No processing \u2014 move directly
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
   *
   * Each file is moved to the resolved target directory and added to
   * configuration.json. Errors on individual files do not abort the batch.
   *
   * @param {Object} params
   * @param {Array<Object>} params.files - Array of multer file objects
   * @param {string} params.categoryId - Target category ID
   * @param {string} params.subcategoryId - Target subcategory ID (optional)
   * @returns {Promise<{results: Array<{name: string, size: string, path: string, success: boolean}>, errors: Array<{name: string, error: string}>, total: number}>}
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
   * Delete a video file from disk and remove its entry from configuration.json.
   *
   * Checks whether the video or its parent category is locked (NEOPRO-managed)
   * before deletion. Also cleans up empty parent directories.
   *
   * @param {string} category - Directory path relative to VIDEOS_DIR (e.g. `'BASKETBALL/SENIORS'`)
   * @param {string} filename - Video file name
   * @returns {Promise<{path: string}>} The deleted video's relative path
   * @throws {LockedError} If the video or category is NEOPRO-managed
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
   * Edit a video: move to another category, rename file, or change display name.
   *
   * Handles both the filesystem move (including thumbnail) and the
   * configuration.json update (remove old entry, add new entry).
   *
   * @param {Object} params
   * @param {string} params.originalPath - Current relative path (e.g. `'videos/BASKET/match.mp4'`)
   * @param {string} params.categoryId - Target category ID
   * @param {string} [params.subcategoryId] - Target subcategory ID
   * @param {string} [params.displayName] - New display name
   * @param {string} [params.newFilename] - New file name (extension preserved if omitted)
   * @returns {Promise<{path: string, displayName: string, category: string, configCategory: string, configSubcategory: string|null}>}
   * @throws {ValidationError} If the path is invalid or category is missing
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
   * Add a single orphan video to configuration.json.
   *
   * If the target category or subcategory doesn't exist, it is created
   * automatically. Duplicate paths are silently skipped.
   *
   * @param {Object} params
   * @param {string} params.videoPath - Relative path from VIDEOS_DIR
   * @param {string} params.categoryId - Target category ID
   * @param {string} [params.subcategoryId] - Target subcategory ID
   * @param {string} [params.displayName] - Custom display name
   * @returns {Promise<{name: string, path: string, type: string}>} The new video entry
   * @throws {ValidationError} If videoPath or categoryId is missing
   * @throws {NotFoundError} If the video file does not exist on disk
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
   * Bulk add orphan videos to configuration.json.
   *
   * Processes an array of video paths in a single config write.
   * Missing files are reported in `errors`, duplicates in `skipped`.
   *
   * @param {Object} params
   * @param {Array<{path: string, displayName?: string}>} params.videos - Videos to add
   * @param {string} params.categoryId - Target category ID
   * @param {string} [params.subcategoryId] - Target subcategory ID
   * @returns {Promise<{added: string[], skipped: string[], errors: Array<{path: string, error: string}>}>}
   * @throws {ValidationError} If videos array is empty or categoryId is missing
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
  // REMOVE FROM CONFIG (config only — file stays on disk)
  // ===========================================================================

  /**
   * Remove a video from configuration.json without deleting the file from disk.
   *
   * Removes the video entry from its category/subcategory and also cleans up
   * any references in `config.sponsors[]` and `timeCategories[].loopVideos[]`.
   *
   * @param {string} videoPath - Relative path (e.g. `'videos/BASKET/match.mp4'` or `'BASKET/match.mp4'`)
   * @returns {Promise<{path: string}>}
   * @throws {ValidationError} If videoPath is missing
   */
  async removeFromConfig(videoPath) {
    if (!videoPath) {
      throw new ValidationError('videoPath requis');
    }

    const normalizedPath = videoPath.replace(/\\/g, '/');
    const configVideoPath = normalizedPath.startsWith('videos/')
      ? normalizedPath
      : `videos/${normalizedPath}`;

    // Remove from categories
    await this._removeVideoFromConfig(configVideoPath);

    // Remove from sponsor loops (config.sponsors[] + timeCategories[].loopVideos[])
    await this._removeVideoFromLoops(configVideoPath);

    return { path: videoPath };
  }

  // ===========================================================================
  // DELETE FROM CONFIG (+ disk)
  // ===========================================================================

  /**
   * Delete a video from both configuration.json and disk.
   *
   * Unlike `deleteVideo()`, this method accepts any videoPath format
   * (with or without `videos/` prefix) and does not check lock status.
   *
   * @param {string} videoPath - Relative path (e.g. `'videos/BASKET/match.mp4'` or `'BASKET/match.mp4'`)
   * @returns {Promise<{path: string}>}
   * @throws {ValidationError} If videoPath is missing
   */
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

    // Remove from config + loops
    const configVideoPath = videoPath.startsWith('videos/')
      ? videoPath
      : `videos/${normalizedPath}`;
    await this._removeVideoFromConfig(configVideoPath);
    await this._removeVideoFromLoops(configVideoPath);

    return { path: videoPath };
  }

  // ===========================================================================
  // REORDER
  // ===========================================================================

  /**
   * Reorder a video within its category/subcategory list.
   *
   * Moves the video from its current position to `newIndex`.
   * Adjusts the index when moving downward to account for the splice.
   *
   * @param {Object} params
   * @param {string} params.videoPath - Full config path (e.g. `'videos/BASKET/match.mp4'`)
   * @param {string} params.categoryId - Category ID containing the video
   * @param {string} [params.subcategoryId] - Subcategory ID if applicable
   * @param {number} params.newIndex - Target position (0-based)
   * @returns {Promise<{newIndex: number}>} The actual index after adjustment
   * @throws {ValidationError} If required params are missing
   * @throws {NotFoundError} If category, subcategory, or video is not found
   */
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

  /**
   * Move a video from one category/subcategory to another.
   *
   * Removes the video entry from the source list, inserts it at the
   * specified index in the target list, and saves configuration.json.
   *
   * @param {Object} params
   * @param {string} params.videoPath - Full config path (e.g. `'videos/BASKET/match.mp4'`)
   * @param {string} params.fromCategoryId - Source category ID
   * @param {string} [params.fromSubcategoryId] - Source subcategory ID
   * @param {string} params.toCategoryId - Target category ID
   * @param {string} [params.toSubcategoryId] - Target subcategory ID
   * @param {number} [params.newIndex] - Insertion index in target (defaults to end)
   * @returns {Promise<{newIndex: number}>}
   * @throws {ValidationError} If required params are missing
   * @throws {NotFoundError} If any category, subcategory, or video is not found
   */
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
   * Load video path mapping from configuration (with 60s cache).
   *
   * Maps category/subcategory IDs to their filesystem directory names
   * by inspecting existing video paths in configuration.json.
   *
   * @private
   * @returns {Promise<{categories: Object<string,string>, subcategories: Object<string,string>}>}
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
   * Get video metadata from configuration (with 60s cache).
   *
   * Builds a lookup map from config video path to
   * `{ displayName, categoryId, subcategoryId }` for each video entry,
   * including sponsors.
   *
   * @private
   * @returns {Promise<Object<string, {displayName: string, categoryId: string, subcategoryId: string|null}>>}
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
   *
   * Falls back to sanitized ID as directory name if no existing mapping is found.
   *
   * @private
   * @param {string} categoryId
   * @param {string|null} subcategoryId
   * @returns {Promise<{category: string, subcategory: string|null}>}
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
   *
   * @private
   * @param {Object} config - Full configuration object (mutated in place)
   * @param {string} categoryId
   * @param {string|null} subcategoryId
   * @param {string} resolvedCategoryDir
   * @param {string|null} resolvedSubcategoryDir
   * @returns {Promise<Array>} Reference to the target videos array
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
   *
   * Creates category/subcategory structure if needed. Skips if the
   * video path already exists in the target list.
   *
   * @private
   * @param {string} categoryId
   * @param {string|null} subcategoryId
   * @param {string} resolvedCategory - Filesystem directory name
   * @param {string|null} resolvedSubcategory - Filesystem subdirectory name
   * @param {string} filename
   * @param {string} mimeType
   * @param {string|null} displayName
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
   * Remove a video entry from configuration.json by its path.
   *
   * Searches all categories and subcategories for a matching path
   * and removes the first match found.
   *
   * @private
   * @param {string} relativePath - Full config path (e.g. `'videos/BASKET/match.mp4'`)
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
   *
   * Walks upward from `dirPath`, removing empty directories until
   * reaching `stopAt` or a non-empty directory.
   *
   * @private
   * @param {string} dirPath - Starting directory
   * @param {string} stopAt - Ancestor directory to stop at (exclusive)
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
   * Remove a video from all loop arrays in configuration.json.
   *
   * Cleans up `config.sponsors[]` and each `timeCategories[].loopVideos[]`
   * entry that references the given path.
   *
   * @private
   * @param {string} videoPath - Full config path (e.g. `'videos/BASKET/match.mp4'`)
   */
  async _removeVideoFromLoops(videoPath) {
    const config = await this._configService.loadConfig();
    let updated = false;

    // Clean config.sponsors[]
    if (Array.isArray(config.sponsors)) {
      const before = config.sponsors.length;
      config.sponsors = config.sponsors.filter((s) => s.path !== videoPath);
      if (config.sponsors.length < before) updated = true;
    }

    // Clean timeCategories[].loopVideos[]
    if (Array.isArray(config.timeCategories)) {
      for (const tc of config.timeCategories) {
        if (Array.isArray(tc.loopVideos)) {
          const before = tc.loopVideos.length;
          tc.loopVideos = tc.loopVideos.filter((v) => v.path !== videoPath);
          if (tc.loopVideos.length < before) updated = true;
        }
      }
    }

    if (updated) {
      await this._configService.saveConfig(config);
      this._configService.invalidateVideoCaches();
      console.log('[admin] Video removed from loops:', videoPath);
    }
  }

  /**
   * Recursively list video files in a directory.
   *
   * Scans for `.mp4`, `.mkv`, `.mov`, `.avi` files and enriches each
   * with metadata from the configuration lookup map.
   *
   * @private
   * @param {string} dir - Current directory to scan
   * @param {string} [baseDir=dir] - Root directory for relative path calculation
   * @param {Object} [metadata={}] - Config metadata lookup map
   * @returns {Promise<Array<{name: string, path: string, category: string, displayName: string, configCategory: string|null, configSubcategory: string|null, size: string, modified: Date}>>}
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
