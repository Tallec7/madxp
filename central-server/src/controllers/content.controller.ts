import { Response } from 'express';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { probeVideoDimensions, dimensionsMetadata } from '../utils/video-dimensions';
import { videoRepository, deploymentRepository, siteRepository, siteVideoRepository, configProfileRepository } from '../repositories';
import { removeVideoFromConfig } from '../utils/config-video-cleanup';
import { uploadVideo, uploadVideoFromDisk, deleteVideo as deleteStorageVideo, deleteThumbnail as deleteStorageThumbnail, getVideoUrl, uploadThumbnail, buildThumbnailPath, getThumbnailUrl } from '../services/storage.service';
import thumbnailService from '../services/thumbnail.service';
import { formatPaginatedResponse } from '../middleware/pagination';
import { UploadStatus } from '../services/upload-verification.service';
import { cleanupTempFile } from '../middleware/upload';
import metricsService from '../services/metrics.service';
import { calculateChecksum, calculateChecksumFromFile, fixMulterEncoding, generateUniqueFilename } from './content.helpers';
import socketService from '../services/socket.service';
import { commandQueueService } from '../services/command-queue.service';
import { auditService } from '../services/audit.service';
import { buildEnrichedNeoProContent } from '../services/profile-sync.service';

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

    // Ajouter le titre et transformer l'URL en URL publique accessible.
    // dup_count vient de findAllPaginated (window function) — on l'expose
    // tel quel + un boolean dérivé `is_duplicate` pour simplifier le front.
    const videos = rows.map(video => {
      const dupCount = Number(video.dup_count ?? 1);
      return {
        ...video,
        title: (video.metadata as { title?: string })?.title || video.original_name || video.filename,
        url: video.url ? getVideoUrl(video.url as string) : null,
        dup_count: dupCount,
        is_duplicate: dupCount > 1,
      };
    });

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

    // Dimensions mesurées à l'upload — socle du validateur de format et de tout
    // diagnostic « cette vidéo va-t-elle sur cet écran ». Ne bloque jamais l'upload.
    const dimensions = await probeVideoDimensions(tempFilePath);
    if (dimensions) {
      logger.info('Video dimensions probed', { filename, ...dimensions });
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
      metadata: { title: videoTitle, ...dimensionsMetadata(dimensions), ...(isDuplicate ? { deduplicatedFrom: existingVideo!.id } : {}) },
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

        // Même sonde que l'upload unitaire — un import en masse ne doit pas
        // produire des vidéos sans dimensions.
        const bulkDimensions = await probeVideoDimensions(tempFilePath);

        const video = await videoRepository.createBulk({
          filename,
          original_name,
          category: category || null,
          subcategory: subcategory || null,
          file_size,
          mime_type,
          storage_path: storagePath,
          checksum,
          metadata: { title: videoTitle, ...dimensionsMetadata(bulkDimensions), ...(existingVideo ? { deduplicatedFrom: existingVideo.id } : {}) },
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

/**
 * Liste les sites qui référencent une vidéo via la table pivot site_videos.
 * Utilisé par le dashboard avant un DELETE pour prévenir l'utilisateur de
 * l'impact cascade. Scope : `site_videos` uniquement (PR2 / Min).
 */
async function findVideoUsage(videoId: string): Promise<Array<{ id: string; name: string; site_type: string }>> {
  const siteIds = await siteVideoRepository.findSitesByVideo(videoId);
  if (siteIds.length === 0) return [];

  const sites = await Promise.all(siteIds.map(id => siteRepository.findById(id)));
  return sites
    .filter((s): s is NonNullable<typeof s> => s != null)
    .map(s => ({ id: s.id, name: s.site_name, site_type: s.site_type }));
}

/**
 * GET /api/videos/:id/usage
 * Retourne la liste des sites qui référencent la vidéo.
 * Le dashboard l'appelle avant DELETE pour afficher la modal de confirmation.
 */
export const getVideoUsage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const video = await videoRepository.findVideoById(id);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }
    const sites = await findVideoUsage(id);
    res.json({ videoId: id, sites, totalSites: sites.length });
  } catch (error) {
    logger.error('Error fetching video usage:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'usage' });
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

    // Cascade guard : si la vidéo est référencée par ≥1 site, refuser sans
    // ?cascade=true pour permettre au dashboard de confirmer avec l'utilisateur.
    // Sans ça, la suppression DB+FTP laisse les sites avec des références
    // orphelines (incident PR #613 — vidéo morte sur SaaS, écran figé).
    const usage = await findVideoUsage(id);
    const cascade = req.query.cascade === 'true' || req.query.cascade === '1';
    if (usage.length > 0 && !cascade) {
      return res.status(409).json({
        error: 'Cette vidéo est utilisée par un ou plusieurs sites. Confirmez la suppression cascade pour continuer.',
        code: 'VIDEO_IN_USE',
        usage: { sites: usage, totalSites: usage.length },
      });
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

    // PR2.1 — capturer le filename AVANT la suppression DB pour pouvoir
    // matcher les références JSONB qui utilisent le filename plutôt que le
    // video_id (entries legacy pré-enrichConfigWithAnalyticsMetadata).
    const videoRow = await videoRepository.findVideoById(id);
    const videoFilename = videoRow?.filename;

    // Supprimer de la base de données (cascade SQL nettoie site_videos /
    // campaign_videos / advertiser_videos via ON DELETE CASCADE)
    await videoRepository.deleteAndReturn(id);

    // Supprimer du stockage FTP
    if (storagePath) {
      await deleteStorageVideo(storagePath);
    }

    // Supprimer aussi le thumbnail FTP. Best-effort : un échec ne doit pas
    // bloquer la cascade (la vidéo est déjà supprimée DB+FTP). Avant ce fix,
    // les thumbnails restaient orphelins sur le FTP, source de confusion
    // (vignette affichée mais vidéo introuvable côté library).
    try {
      await deleteStorageThumbnail(buildThumbnailPath(id));
    } catch (thumbErr) {
      logger.warn('Thumbnail cleanup failed (best-effort)', {
        videoId: id, err: (thumbErr as Error).message,
      });
    }

    // PR2.1 — Cleanup cascade JSONB : retirer la vidéo des
    // `config_profiles.configuration` et `sites.local_config_mirror` qui la
    // référencent. Sans ça, le Pi/SaaS télécharge la config, voit la vidéo,
    // tente de la jouer → 404 → écran figé (incident PR #613 confirmé sur
    // 2 profils NLF + le Pi NLF prod, malgré la cascade SQL site_videos).
    let profilesCleaned = 0;
    let mirrorsCleaned = 0;
    let totalEntriesRemoved = 0;
    try {
      const referencingProfiles = await configProfileRepository.findProfilesReferencingVideo({
        videoId: id,
        filename: videoFilename,
      });
      for (const profile of referencingProfiles) {
        const removed = removeVideoFromConfig(profile.configuration as Record<string, unknown>, {
          videoId: id,
          filename: videoFilename,
        });
        if (removed > 0) {
          await configProfileRepository.replaceConfiguration(profile.id, profile.configuration, req.user?.id);
          profilesCleaned++;
          totalEntriesRemoved += removed;
        }
      }

      const referencingMirrors = await siteRepository.findSitesReferencingVideoInLocalMirror({
        videoId: id,
        filename: videoFilename,
      });
      for (const site of referencingMirrors) {
        if (!site.local_config_mirror) continue;
        const removed = removeVideoFromConfig(site.local_config_mirror as Record<string, unknown>, {
          videoId: id,
          filename: videoFilename,
        });
        if (removed > 0) {
          await siteRepository.updateLocalConfigMirror(site.id, site.local_config_mirror);
          mirrorsCleaned++;
          totalEntriesRemoved += removed;
        }
      }
    } catch (cleanupErr) {
      // Best-effort : un échec du cleanup JSONB ne doit pas faire planter
      // la suppression (la cascade SQL + FTP a déjà eu lieu). Mais on log
      // bruyamment pour qu'un admin investigate.
      logger.error('JSONB cascade cleanup failed', {
        videoId: id, err: (cleanupErr as Error).message,
      });
    }

    // Notifier les sites impactés pour qu'ils rechargent leur config :
    //   - SaaS : socket event `saas-config-updated` → le SaaS GET /api/saas/:id/config
    //   - Pi   : commande `update_config` (queue si offline) — le sync-agent
    //            re-pull la config et la re-pousse au serveur Pi local.
    // Sans cette étape, les configs déployées garderaient des références mortes.
    if (usage.length > 0) {
      for (const site of usage) {
        try {
          if (site.site_type === 'saas') {
            socketService.emitSaasConfigUpdated(site.id, { updatedBy: req.user?.email });
          } else if (site.site_type === 'pi') {
            const built = await buildEnrichedNeoProContent(site.id);
            if (!built) {
              logger.warn('Skipping update_config after cascade delete: no default profile', {
                siteId: site.id, videoId: id,
              });
              continue;
            }
            await commandQueueService.sendOrQueue(site.id, 'update_config', {
              neoProContent: built.neoProContent,
              mode: 'merge',
              reason: 'video_deleted_cascade',
              videoId: id,
            });
          }
        } catch (notifyErr) {
          // Best-effort : un échec de notification ne doit pas faire planter
          // la suppression (la cascade DB+FTP a déjà eu lieu).
          logger.warn('Failed to notify site after cascade delete', {
            siteId: site.id, videoId: id, err: (notifyErr as Error).message,
          });
        }
      }

      auditService.log({
        action: 'VIDEO_DELETED_CASCADE',
        targetType: 'video',
        targetId: id,
        details: {
          storagePath,
          videoFilename,
          affectedSites: usage.map(s => ({ id: s.id, name: s.name, site_type: s.site_type })),
          totalAffected: usage.length,
          jsonbCleanup: { profilesCleaned, mirrorsCleaned, totalEntriesRemoved },
        },
      }, req).catch(err => logger.error('audit log VIDEO_DELETED_CASCADE failed', { err }));
    }

    logger.info('Video deleted:', {
      id, storagePath, cascadeAffected: usage.length,
      jsonbProfilesCleaned: profilesCleaned, jsonbMirrorsCleaned: mirrorsCleaned, jsonbEntriesRemoved: totalEntriesRemoved,
    });
    res.json({
      message: 'Vidéo supprimée avec succès',
      cascadeAffected: usage.length,
      affectedSites: usage.map(s => s.id),
      jsonbCleanup: { profilesCleaned, mirrorsCleaned, totalEntriesRemoved },
    });
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
      // Idempotence : la pivot site_videos peut diverger du JSONB mirror /
      // config_profiles (cf. cascade PR #618). Le bouton "Retirer du site"
      // est exposé sur SaaS pour toute vidéo cloud visible — y compris
      // celles jamais liées via site_videos. L'état désiré ("non liée") est
      // déjà atteint, on renvoie 200 plutôt qu'un 404 utilisateur.
      logger.info('Video unlink no-op (already not linked)', { videoId: id, siteId });
      return res.json({ message: 'Vidéo déjà absente du site', alreadyUnlinked: true });
    }

    logger.info('Video unlinked from site:', { videoId: id, siteId });
    res.json({ message: 'Vidéo retirée du site' });
  } catch (error) {
    logger.error('Error unlinking video from site:', error);
    res.status(500).json({ error: 'Erreur lors du retrait de la vidéo' });
  }
};

/**
 * POST /api/content/videos/:id/replace (multipart, single 'video' file)
 *
 * Remplace le binaire d'une vidéo existante en gardant son `id`, `filename` et
 * `storage_path` intacts. Cas d'usage principal : la vidéo est marquée
 * orpheline FTP et l'admin a re-récupéré le bon fichier — il l'uploade
 * depuis le modal de détails, on overwrite à la même URL FTP, toutes les
 * configs Pi/SaaS qui référencent ce video_id continuent de fonctionner sans
 * modification.
 *
 * Différences avec createVideo :
 *  - id / filename / storage_path inchangés
 *  - DB UPDATE plutôt qu'INSERT (file_size, duration via thumbnail meta,
 *    checksum, updated_at, upload_status, upload_verified_at)
 *  - Auto-resolve la `video_ftp_audit_warnings` row (DELETE)
 *  - Notify les sites qui référencent la vidéo (Pi: update_config,
 *    SaaS: emitSaasConfigUpdated) pour bust le cache du player
 *  - Audit log VIDEO_REPLACED
 */
export const replaceVideo = async (req: AuthRequest, res: Response) => {
  const file = req.file;
  const tempFilePath = file?.path;
  const { id } = req.params;

  try {
    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }
    if (!file.size || file.size === 0) {
      cleanupTempFile(tempFilePath!);
      return res.status(400).json({ error: 'Le fichier vidéo est vide (0 octets)' });
    }

    // Vidéo existante (target du remplacement)
    const existing = await videoRepository.findVideoById(id);
    if (!existing) {
      cleanupTempFile(tempFilePath!);
      return res.status(404).json({ error: 'Vidéo introuvable' });
    }

    // `findVideoById` SELECT alias `storage_path AS url` (cf. video.repository.ts).
    // Lire `existing.storage_path` retourne donc undefined → bug FTP : le upload
    // écrivait `<chroot>/undefined` à chaque replace, le vrai storage_path n'était
    // jamais overwrite (cf. logs Railway 2026-04-27, 12 vidéos zombies).
    const storagePath = String(existing.url ?? '');
    const filename = String(existing.filename);
    if (!storagePath) {
      cleanupTempFile(tempFilePath!);
      logger.error('Replace video: missing storage_path on existing row', { videoId: id });
      return res.status(500).json({ error: 'Vidéo corrompue (storage_path manquant)' });
    }
    const checksum = tempFilePath
      ? await calculateChecksumFromFile(tempFilePath)
      : '';

    // Re-upload au même chemin FTP (overwrite). Le `uploadVideoFromDisk`
    // utilise le filename comme path final côté FTP — on lui passe donc
    // `storagePath` pour overwrite à l'identique.
    const uploadResult = tempFilePath
      ? await uploadVideoFromDisk(tempFilePath, file.size, storagePath, file.mimetype)
      : await uploadVideo(file.buffer, storagePath, file.mimetype);

    if (!uploadResult) {
      logger.error('Failed to replace video on FTP', { videoId: id, storagePath });
      return res.status(500).json({
        error: 'Erreur lors de l\'upload de remplacement vers le stockage.',
      });
    }

    const uploadStatus: UploadStatus = uploadResult.verified ? 'ready' : 'failed';

    // UPDATE DB : conserver id/filename/storage_path, mettre à jour le contenu.
    // file_size via le repository (interface publique) ; les colonnes plus
    // techniques (checksum, upload_status, upload_verified_at) via SQL direct
    // — elles n'ont pas vocation à entrer dans `UpdateVideoInput`.
    await videoRepository.update(id, {
      file_size: file.size,
    });
    const { query } = await import('../config/database');
    await query(
      `UPDATE videos
         SET checksum = $1,
             upload_status = $2,
             upload_verified_at = $3,
             upload_verified_size = $4,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [checksum, uploadStatus, uploadStatus === 'ready' ? new Date() : null, file.size, id],
    );

    // Re-générer le thumbnail depuis le nouveau binaire (best-effort).
    let thumbnailUrl: string | null = existing.thumbnail_url;
    if (tempFilePath && uploadStatus === 'ready') {
      try {
        const thumbBuffer = await thumbnailService.generateThumbnailBuffer(tempFilePath);
        if (thumbBuffer) {
          const thumbStoragePath = buildThumbnailPath(id);
          const thumbResult = await uploadThumbnail(thumbBuffer, thumbStoragePath);
          if (thumbResult) {
            thumbnailUrl = getThumbnailUrl(thumbStoragePath);
            await videoRepository.update(id, { thumbnail_url: thumbnailUrl });
          }
        }
      } catch (thumbError) {
        logger.warn('Thumbnail re-generation failed (non-blocking)', {
          videoId: id, error: thumbError instanceof Error ? thumbError.message : String(thumbError),
        });
      }
    }

    // Auto-resolve : si la vidéo était marquée orpheline FTP, retirer le warning.
    try {
      const { query } = await import('../config/database');
      await query(`DELETE FROM video_ftp_audit_warnings WHERE video_id = $1`, [id]);
    } catch (clearErr) {
      logger.warn('Failed to clear FTP audit warning after replace', {
        videoId: id, err: (clearErr as Error).message,
      });
    }

    // Notifier les sites qui référencent la vidéo pour bust leur cache.
    try {
      const usage = await findVideoUsage(id);
      const socketService = (await import('../services/socket.service')).default;
      const commandQueueService = (await import('../services/command-queue.service')).default;
      for (const site of usage) {
        try {
          if (site.site_type === 'saas') {
            socketService.emitSaasConfigUpdated(site.id, { updatedBy: req.user?.email });
          } else if (site.site_type === 'pi') {
            const built = await buildEnrichedNeoProContent(site.id);
            if (!built) {
              logger.warn('Skipping update_config after replace: no default profile', {
                siteId: site.id, videoId: id,
              });
              continue;
            }
            await commandQueueService.sendOrQueue(site.id, 'update_config', {
              neoProContent: built.neoProContent,
              mode: 'merge',
              reason: 'video_replaced',
              videoId: id,
            });
          }
        } catch (notifyErr) {
          logger.warn('Failed to notify site after replace', {
            siteId: site.id, videoId: id, err: (notifyErr as Error).message,
          });
        }
      }
    } catch (usageErr) {
      logger.warn('Failed to notify sites after replace', {
        videoId: id, err: (usageErr as Error).message,
      });
    }

    // Audit log
    try {
      const auditService = (await import('../services/audit.service')).default;
      await auditService.log({
        action: 'VIDEO_REPLACED',
        userId: req.user?.id,
        targetType: 'video',
        targetId: id,
        details: {
          videoId: id,
          filename,
          storagePath,
          newFileSize: file.size,
          newChecksum: checksum,
          uploadStatus,
        },
      }, req);
    } catch (auditErr) {
      logger.warn('Audit log failed for VIDEO_REPLACED (non-blocking)', {
        videoId: id, err: (auditErr as Error).message,
      });
    }

    metricsService.recordVideoUpload(uploadStatus === 'ready' ? 'success' : 'failed', file.size);

    return res.json({
      ok: true,
      videoId: id,
      filename,
      storagePath,
      file_size: file.size,
      thumbnail_url: thumbnailUrl,
      upload_status: uploadStatus,
    });
  } catch (error) {
    metricsService.recordVideoUpload('failed');
    logger.error('Replace video error:', { err: (error as Error).message, videoId: id });
    return res.status(500).json({ error: 'Erreur lors du remplacement de la vidéo' });
  } finally {
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
  }
};

// Re-export all handlers for backward compatibility (routes import * as contentController)
export { getDeployments, getDeployment, createDeployment, updateDeployment, deleteDeployment, getVideosForSite, convertImageToVideo } from './content-deployment.controller';
export { getVideoVariants, createVideoVariant, createVideoVariantFromVideo, updateVideoVariantLayout, uploadVideoVariantSide, setVideoVariantSideFromVideo, deleteVideoVariantSide, enqueueLedExport, enqueueLedTestExport, getLedExportJob, deleteVideoVariant, getVariantCounts } from './content-variant.controller';
