import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { videoRepository, deploymentRepository, siteRepository, videoVariantRepository } from '../repositories';
import type { DisplayType } from '../repositories';
import deploymentService from '../services/deployment.service';
import { uploadVideo, uploadVideoFromDisk, deleteVideo as deleteStorageVideo, getVideoUrl } from '../services/storage.service';
import { formatPaginatedResponse } from '../middleware/pagination';
import { uploadVerificationService, UploadStatus } from '../services/upload-verification.service';
import { imageToVideoService } from '../services/image-to-video.service';
import { templateRendererService } from '../services/template-renderer.service';
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
 * Corrige l'encodage latin1 de multer pour les noms de fichiers UTF-8.
 * Multer 1.4.x décode le header Content-Disposition en latin1 au lieu d'UTF-8,
 * ce qui corrompt les caractères accentués (ex: "Soirée" → "SoirÃ©e").
 */
function fixMulterEncoding(filename: string): string {
  try {
    const fixed = Buffer.from(filename, 'latin1').toString('utf8');
    if (!fixed.includes('\ufffd') && fixed !== filename) {
      metricsService.recordFilenameEncodingCorrection();
      logger.info('Fixed multer latin1 encoding', { original: filename, fixed });
      return fixed;
    }
  } catch {
    // En cas d'erreur, retourner l'original
  }
  return filename;
}

/**
 * Sanitize un nom de fichier pour le stockage.
 * Utilise la normalisation Unicode NFD pour gérer correctement tous les accents.
 */
function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  const sanitized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Supprime les diacritiques (accents)
    .replace(/\s+/g, '_')             // Espaces → underscores
    .replace(/[^a-zA-Z0-9_-]/g, '')   // Supprime les caractères spéciaux
    .replace(/_+/g, '_')              // Évite les underscores multiples
    .substring(0, 100);               // Limiter la longueur

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

export const getVideoNames = async (_req: AuthRequest, res: Response) => {
  try {
    const names = await videoRepository.findAllNames();
    res.json(names);
  } catch (error) {
    logger.error('Error fetching video names:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des noms de vidéos' });
  }
};

export const getVideos = async (req: AuthRequest, res: Response) => {
  try {
    const { category, search } = req.query;
    const pagination = req.pagination || { page: 1, limit: 20, offset: 0 };

    // Club users only see videos uploaded for their site
    const siteId = req.user?.role === 'club' ? req.user.site_id ?? undefined : undefined;

    const { rows, total } = await videoRepository.findAllPaginated(
      { category: category as string | undefined, search: search as string | undefined, siteId },
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

    if (!file.size || file.size === 0) {
      cleanupTempFile(tempFilePath!);
      return res.status(400).json({ error: 'Le fichier vidéo est vide (0 octets)' });
    }

    const { title, category, subcategory, site_id: body_site_id } = req.body;

    // Club users: auto-tag with their site_id (even if not in body)
    const site_id = (req.user?.role === 'club' && req.user.site_id) ? req.user.site_id : body_site_id;

    // Valider site_id si fourni (upload contextuel)
    if (site_id) {
      const siteExists = await siteRepository.exists(site_id);
      if (!siteExists) {
        return res.status(400).json({ error: 'Site non trouvé' });
      }
    }

    // Corriger l'encodage multer latin1 → UTF-8
    const correctedOriginalname = fixMulterEncoding(file.originalname);

    // Générer un nom de fichier unique basé sur le nom original
    const filename = await generateUniqueFilename(correctedOriginalname);

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
    const videoTitle = title || correctedOriginalname;
    const original_name = correctedOriginalname;
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

    const { category, subcategory, site_id: body_site_id } = req.body;

    // Club users: auto-tag with their site_id (even if not in body)
    const site_id = (req.user?.role === 'club' && req.user.site_id) ? req.user.site_id : body_site_id;

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
      const correctedOriginalname = fixMulterEncoding(file.originalname);

      try {
        if (!file.size || file.size === 0) {
          cleanupTempFile(tempFilePath);
          errors.push({ name: correctedOriginalname, error: 'Fichier vide (0 octets)' });
          continue;
        }

        // Générer un nom de fichier unique basé sur le nom original
        const filename = await generateUniqueFilename(correctedOriginalname);

        // Upload vers le stockage en streaming depuis le disque
        logger.info('Uploading video to storage (bulk):', { filename, size: file.size });

        const uploadResult = tempFilePath
          ? await uploadVideoFromDisk(tempFilePath, file.size, filename, file.mimetype)
          : await uploadVideo(file.buffer, filename, file.mimetype);

        if (!uploadResult) {
          errors.push({
            name: correctedOriginalname,
            error: 'Erreur lors de l\'upload vers le stockage. Vérifiez la configuration FTP.'
          });
          continue;
        }

        // Utiliser le nom original comme titre
        const videoTitle = correctedOriginalname;
        const original_name = correctedOriginalname;
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
        errors.push({ name: correctedOriginalname, error: errorMessage });
        logger.error('Error creating video in bulk:', { filename: correctedOriginalname, error: fileError });
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

    // Club users can only modify their own videos (not NEOPRO corporate content)
    if (req.user?.role === 'club' && req.user.site_id) {
      const video = await videoRepository.findVideoById(id);
      if (!video || video.uploaded_for_site_id !== req.user.site_id) {
        return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres vidéos' });
      }
      if (video.category?.toUpperCase() === 'NEOPRO') {
        return res.status(403).json({ error: 'Les vidéos Neopro ne peuvent pas être modifiées' });
      }
    }

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

    // Club users can only delete their own videos (not NEOPRO corporate content)
    if (req.user?.role === 'club' && req.user.site_id) {
      const video = await videoRepository.findVideoById(id);
      if (!video || video.uploaded_for_site_id !== req.user.site_id) {
        return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres vidéos' });
      }
      if (video.category?.toUpperCase() === 'NEOPRO') {
        return res.status(403).json({ error: 'Les vidéos Neopro ne peuvent pas être supprimées' });
      }
    }

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

    const videoResponse = { ...video, title: videoTitle, url: uploadResult.url };

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

// ============================================================================
// Video Variants (E-22: LED dual output)
// ============================================================================

/**
 * GET /content/videos/:id/variants
 * Liste les variantes d'une vidéo (TV, LED)
 */
export const getVideoVariants = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const video = await videoRepository.findVideoById(id);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    const variants = await videoVariantRepository.findByVideoId(id);

    res.json({
      video_id: id,
      variants: variants.map(v => ({
        ...v,
        url: getVideoUrl(v.storage_path),
      })),
    });
  } catch (error) {
    logger.error('Error getting video variants:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des variantes' });
  }
};

/**
 * POST /content/videos/:id/variants
 * Upload une variante vidéo pour un type d'écran (tv, secondary)
 * Body (FormData): video file + display_type
 */
export const createVideoVariant = async (req: AuthRequest, res: Response) => {
  const file = req.file;
  const tempFilePath = file?.path;

  try {
    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }

    const { id } = req.params;
    const displayType = req.body.display_type as DisplayType;

    if (!displayType || !['tv', 'secondary'].includes(displayType)) {
      return res.status(400).json({ error: 'display_type requis (tv ou secondary)' });
    }

    // Vérifier que la vidéo parente existe
    const video = await videoRepository.findVideoById(id);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo parente non trouvée' });
    }

    const correctedOriginalname = fixMulterEncoding(file.originalname);
    const variantFilename = await generateUniqueFilename(correctedOriginalname);

    // Checksum SHA256
    const checksum = tempFilePath
      ? await calculateChecksumFromFile(tempFilePath)
      : calculateChecksum(file.buffer);

    // Upload vers stockage dans variants/{videoId}/{displayType}/
    const storagePath = `variants/${id}/${displayType}/${variantFilename}`;

    logger.info('Uploading video variant to storage', {
      videoId: id,
      displayType,
      filename: variantFilename,
      size: file.size,
    });

    const uploadResult = tempFilePath
      ? await uploadVideoFromDisk(tempFilePath, file.size, storagePath, file.mimetype)
      : await uploadVideo(file.buffer, storagePath, file.mimetype);

    if (!uploadResult) {
      return res.status(500).json({ error: 'Erreur lors de l\'upload de la variante' });
    }

    // Parse dimensions si fournies
    const width = req.body.width ? parseInt(req.body.width, 10) : null;
    const height = req.body.height ? parseInt(req.body.height, 10) : null;

    // Créer/mettre à jour la variante (UPSERT)
    const variant = await videoVariantRepository.create({
      video_id: id,
      display_type: displayType,
      filename: variantFilename,
      original_name: correctedOriginalname,
      storage_path: uploadResult.path,
      file_size: file.size,
      checksum,
      mime_type: file.mimetype,
      width,
      height,
      duration: null,
      metadata: {},
      uploaded_by: req.user?.id || null,
    });

    logger.info('Video variant created', {
      variantId: variant.id,
      videoId: id,
      displayType,
      filename: variantFilename,
    });

    res.status(201).json({
      ...variant,
      url: uploadResult.url,
    });
  } catch (error) {
    logger.error('Error creating video variant:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de la création de la variante',
      details: errorMessage,
    });
  } finally {
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
  }
};

/**
 * DELETE /content/videos/:videoId/variants/:displayType
 * Supprime une variante vidéo
 */
export const deleteVideoVariant = async (req: AuthRequest, res: Response) => {
  try {
    const { videoId, displayType } = req.params;

    if (!['tv', 'secondary'].includes(displayType)) {
      return res.status(400).json({ error: 'display_type invalide (tv ou secondary)' });
    }

    // Récupérer le storage_path avant suppression
    const storagePath = await videoVariantRepository.findStoragePath(
      videoId,
      displayType as DisplayType
    );

    if (!storagePath) {
      return res.status(404).json({ error: 'Variante non trouvée' });
    }

    // Supprimer du stockage FTP
    try {
      await deleteStorageVideo(storagePath);
    } catch (storageError) {
      logger.warn('Failed to delete variant from storage (non-blocking)', {
        videoId,
        displayType,
        storagePath,
        error: storageError instanceof Error ? storageError.message : String(storageError),
      });
    }

    // Supprimer de la DB
    const deleted = await videoVariantRepository.deleteByVideoAndDisplay(
      videoId,
      displayType as DisplayType
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Variante non trouvée' });
    }

    logger.info('Video variant deleted', { videoId, displayType });
    res.json({ success: true, message: 'Variante supprimée' });
  } catch (error) {
    logger.error('Error deleting video variant:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la variante' });
  }
};

// ============================================================================
// Template Rendering (overlay animation on existing MP4)
// ============================================================================

/**
 * GET /api/content/templates/available
 * Returns list of available built-in overlay templates with their variable schemas.
 */
export const getAvailableTemplates = async (_req: AuthRequest, res: Response) => {
  try {
    const templateSchemas = [
      {
        id: 'tpl_player',
        name: 'Annonce Joueur',
        description: 'Prénom + Nom plein écran avec nom du club en haut et en bas',
        variables: [
          { key: 'numero', label: 'Numéro', type: 'text', required: false, placeholder: '7' },
          { key: 'prenom', label: 'Prénom', type: 'text', required: true, placeholder: 'THOMAS' },
          { key: 'nom', label: 'Nom', type: 'text', required: true, placeholder: 'DUPONT' },
          { key: 'club', label: 'Nom du club', type: 'text', required: false, placeholder: 'UCKNEF BASKET', prefillFrom: 'club_name' },
        ],
      },
      {
        id: 'tpl_score_plus',
        name: 'Score +N',
        description: 'Overlay score (+1, +2, +3) avec nom joueur et club',
        variables: [
          { key: 'score', label: 'Score', type: 'text', required: true, placeholder: '+1' },
          { key: 'nom', label: 'Nom joueur', type: 'text', required: false, placeholder: 'DUPONT' },
          { key: 'club', label: 'Nom du club', type: 'text', required: false, placeholder: 'UCKNEF BASKET' },
          { key: 'color', label: 'Couleur score', type: 'color', required: false, placeholder: '#FF3333' },
        ],
      },
      {
        id: 'tpl_buteur',
        name: 'Annonce Buteur',
        description: 'Animation BUUUUT ! avec numéro et nom',
        variables: [
          { key: 'nom', label: 'Nom', type: 'text', required: true, placeholder: 'DUPONT' },
          { key: 'numero', label: 'Numéro', type: 'text', required: false, placeholder: '7' },
          { key: 'club', label: 'Club', type: 'text', required: false, placeholder: 'UCKNEF BASKET' },
        ],
      },
    ];

    res.json({ templates: templateSchemas });
  } catch (error) {
    logger.error('Error getting available templates:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/content/render-template
 * Renders an animated overlay on top of an uploaded MP4 video.
 *
 * multipart/form-data:
 *   - video: MP4 file (the base video)
 *   - templateId: string (e.g. 'tpl_player')
 *   - variables: JSON string (e.g. '{"nom":"DUPONT","numero":"7"}')
 *   - site_id: string (optional, tag the result for a specific site)
 */
export const renderTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Aucune vidéo fournie' });
    }

    const { templateId, site_id: body_site_id } = req.body;
    if (!templateId) {
      return res.status(400).json({ error: 'templateId est requis' });
    }

    // Club users: auto-tag with their site_id
    const site_id = (req.user?.role === 'club' && req.user.site_id) ? req.user.site_id : body_site_id;

    // Parse variables
    let variables: Record<string, string> = {};
    if (req.body.variables) {
      try {
        variables = typeof req.body.variables === 'string'
          ? JSON.parse(req.body.variables)
          : req.body.variables;
      } catch {
        return res.status(400).json({ error: 'variables doit être un JSON valide' });
      }
    }

    // Validate site_id if provided
    if (site_id) {
      const siteExists = await siteRepository.exists(site_id);
      if (!siteExists) {
        return res.status(400).json({ error: 'Site non trouvé' });
      }
    }

    // Check renderer availability
    const available = await templateRendererService.isAvailable();
    if (!available) {
      logger.error('Template renderer not available (ffmpeg or puppeteer missing)');
      return res.status(503).json({
        error: 'Le service de rendu n\'est pas disponible. ffmpeg ou puppeteer manquant.',
      });
    }

    const correctedOriginalname = fixMulterEncoding(file.originalname);

    logger.info('Starting template render', {
      templateId,
      variables,
      originalFilename: correctedOriginalname,
      videoSize: file.size,
      siteId: site_id,
    });

    // Render the composite video (pass file.path for disk storage, file.buffer for memory)
    const videoInput = file.path || file.buffer;
    if (!videoInput) {
      return res.status(400).json({ error: 'Fichier vidéo non accessible' });
    }
    const result = await templateRendererService.render(
      videoInput,
      correctedOriginalname,
      { templateId, variables }
    );

    // Generate unique filename and checksum
    const filename = await generateUniqueFilename(result.filename);
    const checksum = calculateChecksum(result.buffer);

    // Upload to FTP storage
    const uploadResult = await uploadVideo(result.buffer, filename, result.mimetype);
    if (!uploadResult) {
      logger.error('Failed to upload rendered video to storage');
      return res.status(500).json({ error: 'Erreur lors de l\'upload de la vidéo rendue' });
    }

    const uploadStatus: UploadStatus = uploadResult.verified ? 'ready' : 'failed';
    const baseName = path.basename(correctedOriginalname, path.extname(correctedOriginalname));
    const videoTitle = `${baseName} (${templateId})`;

    // Insert in database
    const video = await videoRepository.create({
      filename,
      original_name: result.filename,
      category: null,
      subcategory: null,
      file_size: result.size,
      mime_type: result.mimetype,
      storage_path: uploadResult.path,
      checksum,
      metadata: {
        title: videoTitle,
        renderedFromTemplate: true,
        templateId,
        variables,
        sourceVideo: correctedOriginalname,
      },
      uploaded_by: req.user?.id || null,
      uploaded_for_site_id: site_id || null,
      upload_status: uploadStatus,
      upload_verified_at: uploadResult.verified ? new Date() : null,
      upload_verified_size: uploadResult.actualSize ?? null,
      duration: result.durationSeconds,
    });

    const videoResponse = { ...video, title: videoTitle, url: uploadResult.url };

    logger.info('Template rendered and uploaded successfully', {
      id: videoResponse.id,
      filename,
      title: videoTitle,
      templateId,
      outputSize: result.size,
      durationSeconds: result.durationSeconds,
      siteId: site_id,
    });

    res.status(201).json({
      success: true,
      message: `Vidéo rendue avec le template "${templateId}"`,
      video: videoResponse,
    });
  } catch (error) {
    logger.error('Error rendering template:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors du rendu du template',
      details: errorMessage,
    });
  }
};
