/**
 * Routes vidéo pour le serveur admin Neopro
 *
 * Contrôleur mince — délègue au VideoService et VideoProcessingService.
 *
 * - GET    /api/videos                  -> Liste des vidéos
 * - POST   /api/videos/upload           -> Upload simple
 * - POST   /api/videos/upload-multiple  -> Upload multiple
 * - DELETE /api/videos/:category/:filename -> Supprimer une vidéo
 * - PUT    /api/videos/edit             -> Modifier une vidéo (déplacer, renommer)
 * - GET    /api/videos/orphans          -> Vidéos orphelines
 * - POST   /api/videos/add-to-config    -> Ajouter une orpheline à la config
 * - POST   /api/videos/add-to-config-bulk -> Ajouter plusieurs orphelines
 * - POST   /api/videos/remove-from-config -> Retirer vidéo de la config (fichier reste)
 * - DELETE /api/videos/delete-from-config -> Supprimer vidéo du disque et de la config
 * - PUT    /api/videos/reorder          -> Réordonner une vidéo
 * - PUT    /api/videos/move             -> Déplacer vers une autre catégorie
 * - GET    /api/videos/processing/:jobId -> Statut d'un job
 * - GET    /api/videos/processing       -> File d'attente
 * - GET    /api/videos/processing-config -> Config du traitement vidéo
 * - POST   /api/thumbnails/regenerate   -> Régénérer miniatures (async)
 * - POST   /api/thumbnails/regenerate-sync -> Régénérer miniatures (sync)
 */

const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

const {
  TEMP_UPLOAD_DIR,
  VIDEO_COMPRESSION_ENABLED,
  VIDEO_THUMBNAILS_ENABLED,
  sanitizeFilename,
} = require('../helpers');

const { NotFoundError, LockedError, ValidationError } = require('../services/errors');

/**
 * @param {Object} deps
 * @param {import('../services/video.service')} deps.videoService
 * @param {import('../services/video-processing.service')} deps.videoProcessingService
 * @param {import('../services/sponsor.service')} [deps.sponsorService]
 */
module.exports = function createVideosRouter({ videoService, videoProcessingService, sponsorService }) {
  const router = express.Router();

  // ===========================================================================
  // MULTER SETUP (stays in route — it's HTTP infrastructure)
  // ===========================================================================

  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
        cb(null, TEMP_UPLOAD_DIR);
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      const cleanName = sanitizeFilename(file.originalname, file.originalname);
      cb(null, cleanName);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['video/mp4', 'video/x-matroska', 'video/quicktime'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Format vidéo non supporté. Utilisez MP4, MKV ou MOV.'));
      }
    },
  });

  /** Map service errors to HTTP status codes */
  function handleError(res, error) {
    if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof LockedError) return res.status(403).json({ error: error.message, locked: true });
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('[admin] Video error:', error);
    return res.status(500).json({ error: error.message });
  }

  // ===========================================================================
  // ROUTES
  // ===========================================================================

  // List videos
  router.get('/api/videos', async (req, res) => {
    try {
      const videos = await videoService.listVideos();
      res.json({ videos });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Upload single video
  router.post('/api/videos/upload', upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const compress = req.body.compress !== 'false' && VIDEO_COMPRESSION_ENABLED;
      const generateThumbnail = req.body.thumbnail !== 'false' && VIDEO_THUMBNAILS_ENABLED;

      const result = await videoService.processUpload({
        file: req.file,
        categoryId: req.body.category,
        subcategoryId: req.body.subcategory,
        compress,
        thumbnail: generateThumbnail,
        displayName: req.body.displayName,
        addToProcessingQueue: (jobData) => videoProcessingService.addToQueue(jobData),
      });

      console.log('[admin] POST /api/videos/upload', {
        filename: req.file.filename,
        processing: !!result.processing,
        size: req.file.size,
        category: req.body.category,
        subcategory: req.body.subcategory,
        sponsorLocalId: req.body.sponsorLocalId || null,
      });

      // Link video to sponsor if specified
      if (req.body.sponsorLocalId && sponsorService) {
        try {
          await sponsorService.linkVideo(req.body.sponsorLocalId, req.file.filename);
          if (req.body.addToLoop === 'true') {
            await sponsorService.addToLoop(req.body.sponsorLocalId);
          }
        } catch (err) {
          console.warn('[admin] Failed to link video to sponsor:', err.message);
        }
      }

      res.json({
        success: true,
        message: result.processing
          ? 'Vidéo uploadée avec succès - traitement en cours'
          : 'Vidéo uploadée avec succès',
        ...result,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Upload multiple videos
  router.post('/api/videos/upload-multiple', upload.array('videos', 20), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const { results, errors, total } = await videoService.processMultipleUploads({
        files: req.files,
        categoryId: req.body.category,
        subcategoryId: req.body.subcategory,
      });

      console.log('[admin] POST /api/videos/upload-multiple complete', {
        total, success: results.length, failed: errors.length,
        sponsorLocalId: req.body.sponsorLocalId || null,
      });

      // Link uploaded videos to sponsor if specified
      if (req.body.sponsorLocalId && sponsorService && results.length > 0) {
        try {
          for (const r of results) {
            await sponsorService.linkVideo(req.body.sponsorLocalId, r.name);
          }
          if (req.body.addToLoop === 'true') {
            await sponsorService.addToLoop(req.body.sponsorLocalId);
          }
        } catch (err) {
          console.warn('[admin] Failed to link videos to sponsor:', err.message);
        }
      }

      res.json({
        success: errors.length === 0,
        message: `${results.length}/${total} vidéo(s) uploadée(s) avec succès`,
        files: results,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Delete a video
  router.delete('/api/videos/:category/:filename', async (req, res) => {
    try {
      const result = await videoService.deleteVideo(req.params.category, req.params.filename);
      res.json({ success: true, message: 'Vidéo supprimée', path: result.path });
    } catch (error) {
      if (error instanceof LockedError) {
        return res.status(403).json({ error: error.message, locked: true });
      }
      console.error('[admin] Error deleting video:', error);
      res.status(500).json({ error: 'Impossible de supprimer la vidéo' });
    }
  });

  // Edit a video (move/rename)
  router.put('/api/videos/edit', async (req, res) => {
    try {
      const video = await videoService.editVideo(req.body || {});
      res.json({ success: true, message: 'Vidéo mise à jour', video });
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      console.error('[admin] Error editing video:', error);
      res.status(500).json({ error: 'Impossible de modifier la vidéo' });
    }
  });

  // Orphan videos
  router.get('/api/videos/orphans', async (req, res) => {
    try {
      const orphans = await videoService.listOrphans();
      res.json({ orphans });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Add orphan to config
  router.post('/api/videos/add-to-config', async (req, res) => {
    try {
      const entry = await videoService.addToConfig(req.body);
      res.json({ success: true, message: 'Vidéo ajoutée à la configuration', entry });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Bulk add orphans to config
  router.post('/api/videos/add-to-config-bulk', async (req, res) => {
    try {
      const results = await videoService.addToConfigBulk(req.body);
      res.json({
        success: true,
        message: `${results.added.length} vidéo(s) ajoutée(s)`,
        results,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Remove from config only (file stays on disk)
  router.post('/api/videos/remove-from-config', async (req, res) => {
    try {
      const result = await videoService.removeFromConfig(req.body.videoPath);
      res.json({ success: true, message: 'Vidéo retirée de la configuration', path: result.path });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Delete from config and disk
  router.delete('/api/videos/delete-from-config', async (req, res) => {
    try {
      const result = await videoService.deleteFromConfig(req.body.videoPath);
      res.json({ success: true, message: 'Vidéo supprimée', path: result.path });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Reorder video within same list
  router.put('/api/videos/reorder', async (req, res) => {
    try {
      const result = await videoService.reorderVideo(req.body);
      res.json({ success: true, message: 'Vidéo réorganisée', newIndex: result.newIndex });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Move video to another category
  router.put('/api/videos/move', async (req, res) => {
    try {
      const result = await videoService.moveVideo(req.body);
      res.json({ success: true, message: 'Vidéo déplacée', newIndex: result.newIndex });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Processing job status
  router.get('/api/videos/processing/:jobId', async (req, res) => {
    try {
      const status = await videoProcessingService.getJobStatus(req.params.jobId);
      if (!status) {
        return res.status(404).json({ error: 'Job non trouvé' });
      }
      res.json(status);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Processing queue
  router.get('/api/videos/processing', async (req, res) => {
    try {
      const queue = await videoProcessingService.getQueue();
      res.json({ queue, total: queue.length });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Processing config
  router.get('/api/videos/processing-config', (req, res) => {
    res.json(videoProcessingService.getProcessingConfig());
  });

  // Regenerate thumbnails (async)
  router.post('/api/thumbnails/regenerate', async (req, res) => {
    try {
      const { force = false } = req.body;
      const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'generate-all-thumbnails.sh');

      try {
        await fs.access(scriptPath);
      } catch {
        return res.status(500).json({ error: 'Script de génération non trouvé' });
      }

      const args = force ? '--force' : '';
      exec(`bash "${scriptPath}" ${args}`, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
        if (error) {
          console.error('[admin] Thumbnail regeneration failed:', error.message);
        } else {
          console.log('[admin] Thumbnail regeneration completed');
        }
      });

      res.json({ success: true, message: 'Régénération des miniatures lancée en arrière-plan', force });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Regenerate thumbnails (sync)
  router.post('/api/thumbnails/regenerate-sync', async (req, res) => {
    try {
      const { force = false } = req.body;
      const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'generate-all-thumbnails.sh');

      try {
        await fs.access(scriptPath);
      } catch {
        return res.status(500).json({ error: 'Script de génération non trouvé' });
      }

      const args = force ? '--force' : '';
      const { stdout } = await execAsync(`bash "${scriptPath}" ${args}`, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 600000,
      });

      const totalMatch = stdout.match(/Total vidéos\s*:\s*(\d+)/);
      const generatedMatch = stdout.match(/Générées\s*:\s*.*?(\d+)/);
      const skippedMatch = stdout.match(/Ignorées\s*:\s*.*?(\d+)/);
      const failedMatch = stdout.match(/Échecs\s*:\s*.*?(\d+)/);

      res.json({
        success: true,
        message: 'Régénération des miniatures terminée',
        stats: {
          total: totalMatch ? parseInt(totalMatch[1]) : 0,
          generated: generatedMatch ? parseInt(generatedMatch[1]) : 0,
          skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
          failed: failedMatch ? parseInt(failedMatch[1]) : 0,
        },
        output: stdout,
      });
    } catch (error) {
      console.error('[admin] Error during thumbnail regeneration:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
