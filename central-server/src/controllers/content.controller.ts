import { Response } from 'express';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { videoRepository, deploymentRepository, siteRepository, siteVideoRepository } from '../repositories';
import { uploadVideo, uploadVideoFromDisk, deleteVideo as deleteStorageVideo, getVideoUrl, uploadThumbnail, buildThumbnailPath, getThumbnailUrl } from '../services/storage.service';
import thumbnailService from '../services/thumbnail.service';
import { formatPaginatedResponse } from '../middleware/pagination';
import { UploadStatus } from '../services/upload-verification.service';
import { cleanupTempFile } from '../middleware/upload';
import metricsService from '../services/metrics.service';
import { calculateChecksum, calculateChecksumFromFile, fixMulterEncoding, generateUniqueFilename } from './content.helpers';

// Upload/download/delete functions are provided by storage.service.ts
// - uploadVideo(buffer, filename, contentType)
// - uploadVideoFromDisk(filePath, fileSize, filename, contentType)
// - deleteVideo(storagePath)
// - getVideoUrl(storagePath)

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

    // Utiliser le titre fourni ou le nom original du fichier
    const videoTitle = title || correctedOriginalname;
    const original_name = correctedOriginalname;
    const file_size = file.size;
    const mime_type = file.mimetype;

    // Deduplication: check if an identical file already exists (ADR-048)
    const existingVideo = await videoRepository.findByChecksum(checksum);
    let storagePath: string;
    let uploadStatus: UploadStatus;
    let thumbnailUrl: string | null = null;
    let uploadUrl: string;
    let isDuplicate = false;

    if (existingVideo) {
      // Reuse existing file on FTP — no upload needed
      storagePath = existingVideo.storage_path;
      thumbnailUrl = existingVideo.thumbnail_url;
      uploadStatus = 'ready';
      uploadUrl = getVideoUrl(storagePath);
      isDuplicate = true;
      logger.info('Duplicate video detected, reusing storage', {
        checksum,
        existingVideoId: existingVideo.id,
        storagePath,
        newFilename: filename,
      });
    } else {
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

      storagePath = uploadResult.path;
      uploadStatus = uploadResult.verified ? 'ready' : 'failed';
      uploadUrl = uploadResult.url;
    }

    logger.info('Inserting video metadata into database:', { filename, title: videoTitle, siteId: site_id, uploadStatus, isDuplicate });
    const video = await videoRepository.create({
      filename,
      original_name,
      category: category || null,
      subcategory: subcategory || null,
      file_size,
      mime_type,
      storage_path: storagePath,
      checksum,
      metadata: { title: videoTitle, ...(isDuplicate ? { deduplicatedFrom: existingVideo!.id } : {}) },
      uploaded_by: req.user?.id || null,
      uploaded_for_site_id: site_id || null,
      upload_status: uploadStatus,
      upload_verified_at: uploadStatus === 'ready' ? new Date() : null,
      upload_verified_size: null,
    });

    // Link video to site via pivot table (ADR-048)
    if (site_id) {
      await siteVideoRepository.link(site_id, video.id, req.user?.id);
    }

    // Generate thumbnail from temp file before cleanup (ADR-048)
    // Skip if we already have a thumbnail from dedup
    if (!thumbnailUrl && tempFilePath && uploadStatus === 'ready') {
      try {
        const thumbBuffer = await thumbnailService.generateThumbnailBuffer(tempFilePath);
        if (thumbBuffer) {
          const thumbStoragePath = buildThumbnailPath(video.id);
          const thumbResult = await uploadThumbnail(thumbBuffer, thumbStoragePath);
          if (thumbResult) {
            thumbnailUrl = getThumbnailUrl(thumbStoragePath);
          }
        }
      } catch (thumbError) {
        logger.warn('Thumbnail generation failed (non-blocking)', {
          videoId: video.id,
          error: thumbError instanceof Error ? thumbError.message : String(thumbError),
        });
      }
    }

    // For deduped videos, reuse existing thumbnail URL
    if (thumbnailUrl) {
      await videoRepository.update(video.id, { thumbnail_url: thumbnailUrl });
    }

    // Ajouter le titre et l'URL à la réponse pour l'affichage client
    const videoResponse = { ...video, title: videoTitle, url: uploadUrl, thumbnail_url: thumbnailUrl, deduplicated: isDuplicate };

    metricsService.recordVideoUpload(uploadStatus === 'ready' ? 'success' : 'failed', file.size);
    logger.info('Video created successfully:', {
      id: videoResponse.id,
      filename,
      title: videoTitle,
      storagePath,
      checksum,
      siteId: site_id,
      uploadStatus,
      isDuplicate,
      thumbnailUrl,
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

        // Calculer le checksum SHA256 en streaming depuis le disque
        const checksum = tempFilePath
          ? await calculateChecksumFromFile(tempFilePath)
          : calculateChecksum(file.buffer);

        // Utiliser le nom original comme titre
        const videoTitle = correctedOriginalname;
        const original_name = correctedOriginalname;
        const file_size = file.size;
        const mime_type = file.mimetype;

        // Deduplication check (ADR-048)
        const existingVideo = await videoRepository.findByChecksum(checksum);
        let storagePath: string;
        let thumbnailUrl: string | null = null;

        if (existingVideo) {
          storagePath = existingVideo.storage_path;
          thumbnailUrl = existingVideo.thumbnail_url;
          logger.info('Duplicate video detected (bulk), reusing storage', {
            checksum, existingVideoId: existingVideo.id, newFilename: filename,
          });
        } else {
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
          storagePath = uploadResult.path;
        }

        const video = await videoRepository.createBulk({
          filename,
          original_name,
          category: category || null,
          subcategory: subcategory || null,
          file_size,
          mime_type,
          storage_path: storagePath,
          checksum,
          metadata: { title: videoTitle, ...(existingVideo ? { deduplicatedFrom: existingVideo.id } : {}) },
          uploaded_by: req.user?.id || null,
          uploaded_for_site_id: site_id || null,
        });

        // Link video to site via pivot table (ADR-048)
        if (site_id) {
          await siteVideoRepository.link(site_id, video.id, req.user?.id);
        }

        // Generate thumbnail — skip if reused from dedup (ADR-048)
        if (!thumbnailUrl && tempFilePath) {
          try {
            const thumbBuffer = await thumbnailService.generateThumbnailBuffer(tempFilePath);
            if (thumbBuffer) {
              const thumbStoragePath = buildThumbnailPath(video.id);
              const thumbResult = await uploadThumbnail(thumbBuffer, thumbStoragePath);
              if (thumbResult) {
                thumbnailUrl = getThumbnailUrl(thumbStoragePath);
              }
            }
          } catch (thumbError) {
            logger.warn('Thumbnail generation failed (bulk, non-blocking)', {
              videoId: video.id,
              error: thumbError instanceof Error ? thumbError.message : String(thumbError),
            });
          }
        }
        if (thumbnailUrl) {
          await videoRepository.update(video.id, { thumbnail_url: thumbnailUrl });
        }

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

export const unlinkVideoFromSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id, siteId } = req.params;

    const removed = await siteVideoRepository.unlink(siteId, id);
    if (!removed) {
      return res.status(404).json({ error: 'Lien vidéo-site non trouvé' });
    }

    logger.info('Video unlinked from site:', { videoId: id, siteId });
    res.json({ message: 'Vidéo retirée du site' });
  } catch (error) {
    logger.error('Error unlinking video from site:', error);
    res.status(500).json({ error: 'Erreur lors du retrait de la vidéo' });
  }
};

// Re-export all handlers for backward compatibility (routes import * as contentController)
export { getDeployments, getDeployment, createDeployment, updateDeployment, deleteDeployment, getVideosForSite, convertImageToVideo } from './content-deployment.controller';
export { getVideoVariants, createVideoVariant, createVideoVariantFromVideo, deleteVideoVariant, getVariantCounts } from './content-variant.controller';
export { getAvailableTemplates, getTemplateAsset, renderTemplate } from './content-template.controller';
