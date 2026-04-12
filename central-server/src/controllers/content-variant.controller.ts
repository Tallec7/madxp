import { Response } from 'express';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { videoRepository, videoVariantRepository } from '../repositories';
import type { DisplayType } from '../repositories';
import { uploadVideo, uploadVideoFromDisk, deleteVideo as deleteStorageVideo, getVideoUrl } from '../services/storage.service';
import { cleanupTempFile } from '../middleware/upload';
import { fixMulterEncoding, generateUniqueFilename, calculateChecksum, calculateChecksumFromFile } from './content.helpers';

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
