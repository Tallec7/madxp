import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { videoRepository, deploymentRepository, siteRepository, siteVideoRepository } from '../repositories';
import deploymentService from '../services/deployment.service';
import { uploadVideo, getVideoUrl, uploadThumbnail, buildThumbnailPath, getThumbnailUrl } from '../services/storage.service';
import thumbnailService from '../services/thumbnail.service';
import { formatPaginatedResponse } from '../middleware/pagination';
import { uploadVerificationService, UploadStatus } from '../services/upload-verification.service';
import { imageToVideoService } from '../services/image-to-video.service';
import { fixMulterEncoding, generateUniqueFilename, calculateChecksum } from './content.helpers';

export const getDeployments = async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const rows = await deploymentRepository.findAllWithDetails(limit);

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
    const { site_id: body_site_id } = req.body;
    const blurBackground = req.body.blurBackground === 'true' || req.body.blurBackground === true;

    // Club users: auto-tag with their site_id
    const site_id = (req.user?.role === 'club' && req.user.site_id) ? req.user.site_id : body_site_id;

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

    // Corriger l'encodage multer latin1 → UTF-8
    const correctedOriginalname = fixMulterEncoding(file.originalname);

    logger.info('Starting image to video conversion', {
      originalFilename: correctedOriginalname,
      duration,
      imageSize: file.size,
      siteId: site_id,
      blurBackground,
    });

    // Convertir l'image en vidéo
    const result = await imageToVideoService.convert(file.buffer, correctedOriginalname, {
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
    const imageBaseName = path.basename(correctedOriginalname, path.extname(correctedOriginalname));
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
      metadata: { title: videoTitle, convertedFromImage: true, originalImage: correctedOriginalname },
      uploaded_by: req.user?.id || null,
      uploaded_for_site_id: site_id || null,
      upload_status: uploadStatus,
      upload_verified_at: uploadResult.verified ? new Date() : null,
      upload_verified_size: uploadResult.actualSize ?? null,
      duration,
    });

    // Link video to site via pivot table (ADR-048)
    if (site_id) {
      await siteVideoRepository.link(site_id, video.id, req.user?.id);
    }

    // Generate thumbnail from converted video buffer (ADR-048)
    let thumbnailUrl: string | null = null;
    if (uploadStatus === 'ready') {
      try {
        const tmpVideoPath = path.join(require('os').tmpdir(), `neopro_thumb_${video.id}.mp4`);
        fs.writeFileSync(tmpVideoPath, result.buffer);
        const thumbBuffer = await thumbnailService.generateThumbnailBuffer(tmpVideoPath);
        fs.unlinkSync(tmpVideoPath);
        if (thumbBuffer) {
          const thumbStoragePath = buildThumbnailPath(video.id);
          const thumbResult = await uploadThumbnail(thumbBuffer, thumbStoragePath);
          if (thumbResult) {
            thumbnailUrl = getThumbnailUrl(thumbStoragePath);
            await videoRepository.update(video.id, { thumbnail_url: thumbnailUrl });
          }
        }
      } catch (thumbError) {
        logger.warn('Thumbnail generation failed for image-to-video (non-blocking)', {
          videoId: video.id,
          error: thumbError instanceof Error ? thumbError.message : String(thumbError),
        });
      }
    }

    const videoResponse = { ...video, title: videoTitle, url: uploadResult.url, thumbnail_url: thumbnailUrl };

    logger.info('Image converted to video successfully', {
      id: videoResponse.id,
      filename,
      title: videoTitle,
      originalImage: correctedOriginalname,
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
