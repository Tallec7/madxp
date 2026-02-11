import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { videoRepository, deploymentRepository, siteRepository } from '../repositories';
import deploymentService from '../services/deployment.service';
import { uploadVideo, uploadVideoFromDisk, deleteVideo as deleteStorageVideo, getVideoUrl } from '../services/storage.service';
import { formatPaginatedResponse } from '../middleware/pagination';
import { uploadVerificationService, UploadStatus } from '../services/upload-verification.service';
import { imageToVideoService } from '../services/image-to-video.service';
import { cleanupTempFile } from '../middleware/upload';
import metricsService from '../services/metrics.service';

// Upload/download/delete functions are provided by storage.service.ts
// - uploadVideo(buffer, filename, contentType)
// - uploadVideoFromDisk(filePath, fileSize, filename, contentType)
// - deleteVideo(storagePath)
// - getVideoUrl(storagePath)

/**
 * Calcule le checksum SHA256 d'un buffer
 */
function calculateChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calcule le checksum SHA256 d'un fichier en streaming (sans le charger en mémoire)
 */
function calculateChecksumFromFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Sanitize un nom de fichier pour le stockage
 * - Remplace les espaces par des underscores
 * - Supprime les caractères spéciaux dangereux
 * - Conserve uniquement lettres, chiffres, tirets, underscores et points
 */
function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  // Sanitize: remplacer espaces par _, supprimer caractères spéciaux
  const sanitized = name
    .replace(/\s+/g, '_')           // Espaces → underscores
    .replace(/[àáâãäå]/gi, 'a')     // Accents a
    .replace(/[èéêë]/gi, 'e')       // Accents e
    .replace(/[ìíîï]/gi, 'i')       // Accents i
    .replace(/[òóôõö]/gi, 'o')      // Accents o
    .replace(/[ùúûü]/gi, 'u')       // Accents u
    .replace(/[ç]/gi, 'c')          // Cédille
    .replace(/[ñ]/gi, 'n')          // Tilde
    .replace(/[^a-zA-Z0-9_-]/g, '') // Supprimer tout caractère non autorisé
    .substring(0, 100);              // Limiter la longueur

  return sanitized + ext.toLowerCase();
}

/**
 * Génère un nom de fichier unique basé sur le nom original
 * Si le fichier existe déjà, ajoute un suffixe numérique (ex: video_1.mp4, video_2.mp4)
 */
async function generateUniqueFilename(originalName: string): Promise<string> {
  const sanitized = sanitizeFilename(originalName);
  const ext = path.extname(sanitized);
  const baseName = path.basename(sanitized, ext);

  // Vérifier si le nom existe déjà en base
  let filename = sanitized;
  let counter = 0;

  for (;;) {
    const exists = await videoRepository.filenameExists(filename);

    if (!exists) {
      // Nom disponible
      return filename;
    }

    // Nom pris, incrémenter le compteur
    counter++;
    filename = `${baseName}_${counter}${ext}`;

    // Sécurité: éviter boucle infinie
    if (counter > 1000) {
      // Fallback vers UUID si trop de collisions
      logger.warn('Too many filename collisions, falling back to UUID', { originalName });
      return `${baseName}_${uuidv4().substring(0, 8)}${ext}`;
    }
  }
}

export const getVideos = async (req: AuthRequest, res: Response) => {
  try {
    const { category, search } = req.query;
    const pagination = req.pagination || { page: 1, limit: 20, offset: 0 };

    const { rows, total } = await videoRepository.findAllPaginated(
      { category: category as string | undefined, search: search as string | undefined },
      pagination.limit,
      pagination.offset
    );

    // Ajouter le titre et transformer l'URL en URL publique accessible
    const videos = rows.map(video => ({
      ...video,
      title: (video.metadata as { title?: string })?.title || video.original_name || video.filename,
      url: video.url ? getVideoUrl(video.url as string) : null
    }));

    res.json(formatPaginatedResponse(videos, total, pagination));
  } catch (error) {
    logger.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des vidéos' });
  }
};

export const getVideo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const video = await videoRepository.findVideoById(id);

    if (!video) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    const result = {
      ...video,
      title: (video.metadata as { title?: string })?.title || video.original_name || video.filename,
      url: video.url ? getVideoUrl(video.url as string) : null,
    };

    res.json(result);
  } catch (error) {
    logger.error('Error fetching video:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la vidéo' });
  }
};

/**
 * Récupère l'historique des déploiements pour une vidéo spécifique
 */
export const getVideoDeployments = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Fetching video deployments:', { videoId: id });

    // Vérifier que la vidéo existe
    const videoExists = await videoRepository.findVideoById(id);
    if (!videoExists) {
      logger.warn('Video not found for deployments:', { videoId: id });
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    // Récupérer tous les déploiements pour cette vidéo
    const deployments = await deploymentRepository.findDeploymentsForVideo(id);

    // Statistiques résumées
    const stats = {
      total: deployments.length,
      completed: deployments.filter(d => d.status === 'completed').length,
      failed: deployments.filter(d => d.status === 'failed').length,
      pending: deployments.filter(d => d.status === 'pending').length,
      in_progress: deployments.filter(d => d.status === 'in_progress').length,
    };

    logger.info('Video deployments fetched successfully:', { videoId: id, count: deployments.length });

    res.json({
      video_id: id,
      stats,
      deployments
    });
  } catch (error) {
    logger.error('Error fetching video deployments:', { videoId: req.params.id, error });
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de la récupération de l\'historique des déploiements',
      details: errorMessage
    });
  }
};

export const createVideo = async (req: AuthRequest, res: Response) => {
  const file = req.file;
  // Disk storage : le fichier est sur disque, pas en mémoire
  const tempFilePath = file?.path;

  try {
    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }

    const { title, category, subcategory, site_id } = req.body;

    // Valider site_id si fourni (upload contextuel)
    if (site_id) {
      const siteExists = await siteRepository.exists(site_id);
      if (!siteExists) {
        return res.status(400).json({ error: 'Site non trouvé' });
      }
    }

    // Générer un nom de fichier unique basé sur le nom original
    const filename = await generateUniqueFilename(file.originalname);

    // Calculer le checksum SHA256 en streaming depuis le disque (pas de chargement en mémoire)
    const checksum = tempFilePath
      ? await calculateChecksumFromFile(tempFilePath)
      : calculateChecksum(file.buffer);

    // Upload vers le stockage en streaming depuis le disque
    logger.info('Uploading video to storage with verification:', { filename, size: file.size, mimetype: file.mimetype, siteId: site_id });

    const uploadResult = tempFilePath
      ? await uploadVideoFromDisk(tempFilePath, file.size, filename, file.mimetype)
      : await uploadVideo(file.buffer, filename, file.mimetype);

    if (!uploadResult) {
      logger.error('Failed to upload video to storage - uploadResult is null');
      return res.status(500).json({
        error: 'Erreur lors de l\'upload vers le stockage. Vérifiez la configuration FTP.'
      });
    }

    // Déterminer le statut d'upload basé sur la vérification
    const uploadStatus: UploadStatus = uploadResult.verified ? 'ready' : 'failed';

    // Utiliser le titre fourni ou le nom original du fichier
    const videoTitle = title || file.originalname;
    const original_name = file.originalname;
    const file_size = file.size;
    const mime_type = file.mimetype;

    logger.info('Inserting video metadata into database:', { filename, title: videoTitle, siteId: site_id, uploadStatus, verified: uploadResult.verified });
    const video = await videoRepository.create({
      filename,
      original_name,
      category: category || null,
      subcategory: subcategory || null,
      file_size,
      mime_type,
      storage_path: uploadResult.path,
      checksum,
      metadata: { title: videoTitle },
      uploaded_by: req.user?.id || null,
      uploaded_for_site_id: site_id || null,
      upload_status: uploadStatus,
      upload_verified_at: uploadResult.verified ? new Date() : null,
      upload_verified_size: uploadResult.actualSize ?? null,
    });

    // Ajouter le titre et l'URL à la réponse pour l'affichage client
    const videoResponse = { ...video, title: videoTitle, url: uploadResult.url };

    // Logger avec info de vérification
    if (!uploadResult.verified) {
      logger.warn('Video uploaded but verification failed:', {
        id: videoResponse.id,
        filename,
        expectedSize: file_size,
        actualSize: uploadResult.actualSize,
      });
    }

    metricsService.recordVideoUpload(uploadStatus === 'ready' ? 'success' : 'failed', file.size);
    logger.info('Video created successfully:', {
      id: videoResponse.id,
      filename,
      title: videoTitle,
      storagePath: uploadResult.path,
      checksum,
      siteId: site_id,
      uploadStatus,
      verified: uploadResult.verified,
    });
    res.status(201).json(videoResponse);
  } catch (error) {
    metricsService.recordVideoUpload('failed');
    logger.error('Error creating video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de la création de la vidéo',
      details: errorMessage
    });
  } finally {
    // Nettoyer le fichier temporaire dans tous les cas
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
  }
};

export const createVideos = async (req: AuthRequest, res: Response) => {
  const files = req.files as Express.Multer.File[];

  try {
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }

    const { category, subcategory, site_id } = req.body;

    // Valider site_id si fourni (upload contextuel)
    if (site_id) {
      const siteExists = await siteRepository.exists(site_id);
      if (!siteExists) {
        return res.status(400).json({ error: 'Site non trouvé' });
      }
    }

    const results: Array<{ id: string; name: string; title: string; size: number; success: true }> = [];
    const errors: Array<{ name: string; error: string }> = [];

    logger.info('Starting bulk video upload:', { count: files.length, category, subcategory, siteId: site_id });

    for (const file of files) {
      const tempFilePath = file.path;

      try {
        // Générer un nom de fichier unique basé sur le nom original
        const filename = await generateUniqueFilename(file.originalname);

        // Upload vers le stockage en streaming depuis le disque
        logger.info('Uploading video to storage (bulk):', { filename, size: file.size });

        const uploadResult = tempFilePath
          ? await uploadVideoFromDisk(tempFilePath, file.size, filename, file.mimetype)
          : await uploadVideo(file.buffer, filename, file.mimetype);

        if (!uploadResult) {
          errors.push({
            name: file.originalname,
            error: 'Erreur lors de l\'upload vers le stockage. Vérifiez la configuration FTP.'
          });
          continue;
        }

        // Utiliser le nom original comme titre
        const videoTitle = file.originalname;
        const original_name = file.originalname;
        const file_size = file.size;
        const mime_type = file.mimetype;

        // Calculer le checksum SHA256 en streaming depuis le disque
        const checksum = tempFilePath
          ? await calculateChecksumFromFile(tempFilePath)
          : calculateChecksum(file.buffer);

        const video = await videoRepository.createBulk({
          filename,
          original_name,
          category: category || null,
          subcategory: subcategory || null,
          file_size,
          mime_type,
          storage_path: uploadResult.path,
          checksum,
          metadata: { title: videoTitle },
          uploaded_by: req.user?.id || null,
          uploaded_for_site_id: site_id || null,
        });

        results.push({
          id: video.id,
          name: video.name,
          title: videoTitle,
          size: video.size,
          success: true
        });

        logger.info('Video created (bulk):', { id: video.id, filename, title: videoTitle, siteId: site_id });
      } catch (fileError) {
        const errorMessage = fileError instanceof Error ? fileError.message : 'Erreur inconnue';
        errors.push({ name: file.originalname, error: errorMessage });
        logger.error('Error creating video in bulk:', { filename: file.originalname, error: fileError });
      } finally {
        // Nettoyer chaque fichier temporaire après traitement
        if (tempFilePath) {
          cleanupTempFile(tempFilePath);
        }
      }
    }

    const allSuccess = errors.length === 0;
    const message = `${results.length}/${files.length} vidéo(s) uploadée(s) avec succès`;

    logger.info('Bulk video upload completed:', { total: files.length, success: results.length, failed: errors.length });

    res.status(allSuccess ? 201 : 207).json({
      success: allSuccess,
      message,
      files: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error('Error in bulk video upload:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de l\'upload des vidéos',
      details: errorMessage
    });
  }
};

export const updateVideo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { filename, original_name, category, subcategory, file_size, duration, storage_path, thumbnail_url, metadata } = req.body;

    const result = await videoRepository.update(id, {
      filename, original_name, category, subcategory,
      file_size, duration, storage_path, thumbnail_url, metadata,
    });

    if (!result) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    logger.info('Video updated:', { id, filename });
    res.json(result);
  } catch (error) {
    logger.error('Error updating video:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la vidéo' });
  }
};

export const deleteVideo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Récupérer le chemin de stockage avant suppression
    const storagePath = await videoRepository.findStoragePath(id);

    if (storagePath === null) {
      // findStoragePath returns null if video not found
      const exists = await videoRepository.findVideoById(id);
      if (!exists) {
        return res.status(404).json({ error: 'Vidéo non trouvée' });
      }
    }

    // Supprimer de la base de données
    await videoRepository.deleteAndReturn(id);

    // Supprimer du stockage FTP
    if (storagePath) {
      await deleteStorageVideo(storagePath);
    }

    logger.info('Video deleted:', { id, storagePath });
    res.json({ message: 'Vidéo supprimée avec succès' });
  } catch (error) {
    logger.error('Error deleting video:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la vidéo' });
  }
};

export const getDeployments = async (req: AuthRequest, res: Response) => {
  try {
    const rows = await deploymentRepository.findAllWithDetails();

    // Ajouter video_title depuis metadata
    const deployments = rows.map(d => ({
      ...d,
      video_title: (d.metadata as { title?: string })?.title || d.original_name || d.filename
    }));

    res.json(deployments);
  } catch (error) {
    logger.error('Error fetching deployments:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des déploiements' });
  }
};

export const getDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await deploymentRepository.findWithDetails(id);

    if (!result) {
      return res.status(404).json({ error: 'Déploiement non trouvé' });
    }

    res.json(result);
  } catch (error) {
    logger.error('Error fetching deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du déploiement' });
  }
};

export const createDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { video_id, target_type, target_id, scheduled_at } = req.body;

    // === GATE: Vérifier que la vidéo est prête pour le déploiement ===
    const videoReadiness = await uploadVerificationService.isVideoReadyForDeployment(video_id);

    if (!videoReadiness.ready) {
      const errorMessage = uploadVerificationService.getDeploymentBlockedMessage(videoReadiness.status);
      logger.warn('Deployment blocked: video not ready', {
        video_id,
        upload_status: videoReadiness.status,
        error: videoReadiness.error,
      });

      return res.status(409).json({
        error: 'Video not ready for deployment',
        upload_status: videoReadiness.status,
        message: errorMessage,
        details: videoReadiness.error,
        retry_after_seconds: videoReadiness.status === 'uploading' ? 30 : 10,
      });
    }

    // Si scheduled_at est fourni, le deploiement sera planifie
    const isScheduled = !!scheduled_at;
    const status = isScheduled ? 'scheduled' : 'pending';
    const scheduledDate = isScheduled ? new Date(scheduled_at) : null;

    // Valider la date de planification
    if (isScheduled && scheduledDate) {
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: 'Date de planification invalide' });
      }
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ error: 'La date de planification doit etre dans le futur' });
      }
    }

    const deployment = await deploymentRepository.createFull({
      video_id,
      target_type: target_type || 'site',
      target_id,
      status,
      deployed_by: req.user?.id || null,
      scheduled_at: scheduledDate,
      scheduled_by: isScheduled ? req.user?.id || null : null,
    });

    if (isScheduled) {
      logger.info('Scheduled deployment created:', {
        id: deployment.id,
        video_id,
        target_type,
        target_id,
        scheduled_at: scheduledDate
      });
    } else {
      logger.info('Deployment created:', { id: deployment.id, video_id, target_type, target_id });

      // Lancer le deploiement de maniere asynchrone (seulement si non planifie)
      deploymentService.startDeployment(deployment.id as string).catch(err => {
        logger.error('Error starting deployment:', err);
      });
    }

    res.status(201).json(deployment);
  } catch (error) {
    logger.error('Error creating deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la création du déploiement' });
  }
};

export const updateDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, progress, error_message } = req.body;

    const result = await deploymentRepository.updateFields(id, { status, progress, error_message });

    if (!result) {
      return res.status(404).json({ error: 'Déploiement non trouvé' });
    }

    logger.info('Deployment updated:', { id, status, progress });
    res.json(result);
  } catch (error) {
    logger.error('Error updating deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du déploiement' });
  }
};

export const deleteDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await deploymentRepository.deleteAndReturn(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Déploiement non trouvé' });
    }

    logger.info('Deployment deleted:', { id });
    res.json({ message: 'Déploiement supprimé avec succès' });
  } catch (error) {
    logger.error('Error deleting deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du déploiement' });
  }
};

/**
 * GET /api/content/videos/for-site/:siteId
 * Récupère les vidéos avec priorisation pour un site spécifique.
 * Les vidéos uploadées pour ce site apparaissent en premier.
 */
export const getVideosForSite = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { category, search } = req.query;
    const pagination = req.pagination || { page: 1, limit: 50, offset: 0 };

    // Vérifier que le site existe
    const siteExists = await siteRepository.exists(siteId);
    if (!siteExists) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const { rows, total } = await videoRepository.findForSitePaginated(
      siteId,
      { category: category as string | undefined, search: search as string | undefined },
      pagination.limit,
      pagination.offset
    );

    // Ajouter le titre et transformer l'URL en URL publique accessible
    const videos = rows.map(video => ({
      ...video,
      title: (video.metadata as { title?: string })?.title || video.original_name || video.filename,
      url: video.url ? getVideoUrl(video.url as string) : null,
      isForCurrentSite: video.is_for_site === 1,
    }));

    res.json(formatPaginatedResponse(videos, total, pagination));
  } catch (error) {
    logger.error('Error fetching videos for site:', { siteId: req.params.siteId, error });
    res.status(500).json({ error: 'Erreur lors de la récupération des vidéos' });
  }
};

/**
 * POST /api/image-to-video
 * Convertit une image en vidéo MP4 avec une durée spécifiée
 */
export const convertImageToVideo = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Aucune image fournie' });
    }

    // Récupérer les paramètres
    const duration = parseInt(req.body.duration as string, 10) || 10;
    const { site_id } = req.body;
    const blurBackground = req.body.blurBackground === 'true' || req.body.blurBackground === true;

    // Valider la durée (entre 1 et 60 secondes)
    if (duration < 1 || duration > 60) {
      return res.status(400).json({ error: 'La durée doit être entre 1 et 60 secondes' });
    }

    // Valider site_id si fourni
    if (site_id) {
      const siteExists = await siteRepository.exists(site_id);
      if (!siteExists) {
        return res.status(400).json({ error: 'Site non trouvé' });
      }
    }

    // Vérifier si ffmpeg est disponible
    const ffmpegAvailable = await imageToVideoService.isAvailable();
    if (!ffmpegAvailable) {
      logger.error('ffmpeg is not available on this system');
      return res.status(503).json({
        error: 'Le service de conversion n\'est pas disponible. ffmpeg n\'est pas installé sur le serveur.'
      });
    }

    logger.info('Starting image to video conversion', {
      originalFilename: file.originalname,
      duration,
      imageSize: file.size,
      siteId: site_id,
      blurBackground,
    });

    // Convertir l'image en vidéo
    const result = await imageToVideoService.convert(file.buffer, file.originalname, {
      duration,
      blurBackground,
    });

    // Générer un nom de fichier unique
    const filename = await generateUniqueFilename(result.filename);

    // Calculer le checksum
    const checksum = calculateChecksum(result.buffer);

    // Upload vers le stockage
    const uploadResult = await uploadVideo(result.buffer, filename, result.mimetype);

    if (!uploadResult) {
      logger.error('Failed to upload converted video to storage');
      return res.status(500).json({
        error: 'Erreur lors de l\'upload de la vidéo convertie'
      });
    }

    // Déterminer le statut d'upload
    const uploadStatus: UploadStatus = uploadResult.verified ? 'ready' : 'failed';

    // Utiliser le nom original de l'image comme titre
    const imageBaseName = path.basename(file.originalname, path.extname(file.originalname));
    const videoTitle = imageBaseName;

    // Insérer en base de données
    const video = await videoRepository.create({
      filename,
      original_name: result.filename,
      category: null,
      subcategory: null,
      file_size: result.size,
      mime_type: result.mimetype,
      storage_path: uploadResult.path,
      checksum,
      metadata: { title: videoTitle, convertedFromImage: true, originalImage: file.originalname },
      uploaded_by: req.user?.id || null,
      uploaded_for_site_id: site_id || null,
      upload_status: uploadStatus,
      upload_verified_at: uploadResult.verified ? new Date() : null,
      upload_verified_size: uploadResult.actualSize ?? null,
      duration,
    });

    const videoResponse = { ...video, title: videoTitle, url: uploadResult.url };

    logger.info('Image converted to video successfully', {
      id: videoResponse.id,
      filename,
      title: videoTitle,
      originalImage: file.originalname,
      duration,
      videoSize: result.size,
      siteId: site_id,
    });

    res.status(201).json({
      success: true,
      message: `Image convertie en vidéo de ${duration} secondes`,
      video: videoResponse,
    });
  } catch (error) {
    logger.error('Error converting image to video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de la conversion de l\'image en vidéo',
      details: errorMessage
    });
  }
};
