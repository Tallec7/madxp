import { Response } from 'express';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { videoRepository, videoVariantRepository, siteRepository, VARIANT_LAYOUTS, ledExportJobRepository } from '../repositories';
import type { DisplayType, VariantLayout } from '../repositories';
import { uploadVideo, uploadVideoFromDisk, deleteVideo as deleteStorageVideo, getVideoUrl } from '../services/storage.service';
import { cleanupTempFile } from '../middleware/upload';
import { fixMulterEncoding, generateUniqueFilename, calculateChecksum, calculateChecksumFromFile } from './content.helpers';
import deploymentService from '../services/deployment.service';
import { computeRibbonDimensions, validateLedFormat, fitFromLayout, type LedFormatNotice } from '../services/led-fold.service';

/**
 * Validateur de format LED à l'upload (PROP-014 §6) — non bloquant.
 * Retourne un avis informatif sur l'adéquation des dimensions de la vidéo au ruban
 * du profil LED du display, ou `null` si le display n'est pas led-perimeter / sans profil.
 */
async function computeLedFormatNotice(
  siteId: string | null,
  displayType: string,
  width: number | null,
  height: number | null,
): Promise<LedFormatNotice | null> {
  if (displayType !== 'led-perimeter' || !siteId) return null;
  const displays = await siteRepository.getDisplays(siteId);
  const led = displays.find((d) => d.type === 'led-perimeter')?.led;
  if (!led || !Array.isArray(led.sides) || led.sides.length === 0) return null;

  const pitchMm = parseFloat(String(led.pitch).replace(/^P/i, ''));
  if (!Number.isFinite(pitchMm) || pitchMm <= 0) return null;

  try {
    const { ribbonWidth, ribbonHeight } = computeRibbonDimensions({
      sides: led.sides,
      pitchMm,
      height: led.height,
    });
    return validateLedFormat({ videoWidth: width, videoHeight: height, ribbonWidth, ribbonHeight });
  } catch {
    return null; // profil incomplet → pas d'avis (jamais bloquant)
  }
}

// ============================================================================
// Video Variants (E-22: LED dual output)
// ============================================================================

/**
 * Returns the allowed display_type slugs for a site.
 * - Global video (no siteId) → null = no restriction
 * - Site with displays[] configured → non-tv types from displays
 * - Site without displays[] (DEFAULT_DISPLAYS = [tv]) → F2 fallback ['secondary']
 */
async function getAllowedDisplayTypes(siteId: string | null): Promise<string[] | null> {
  if (!siteId) return null;
  const displays = await siteRepository.getDisplays(siteId);
  const secondaryTypes = displays.filter(d => d.type !== 'tv').map(d => d.type);
  return secondaryTypes.length > 0 ? secondaryTypes : ['secondary'];
}

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
      // Site propriétaire de la vidéo (null pour les vidéos globales/admin). Le
      // dashboard s'en sert pour masquer l'export LED, qui exige un profil de site.
      video_site_id: video.uploaded_for_site_id ?? null,
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

    if (!displayType || !/^[a-z0-9-]+$/.test(displayType)) {
      return res.status(400).json({ error: 'display_type requis (slug alphanumérique avec tirets, ex: secondary, led-banner)' });
    }

    if (displayType === 'tv') {
      return res.status(400).json({ error: 'display_type tv est réservé — la vidéo principale est la variante tv' });
    }

    // Vérifier que la vidéo parente existe
    const video = await videoRepository.findVideoById(id);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo parente non trouvée' });
    }

    // Valider display_type contre les écrans déclarés du site (F2 fallback: secondary si aucun écran configuré)
    const allowedTypes = await getAllowedDisplayTypes(video.uploaded_for_site_id ?? null);
    if (allowedTypes && !allowedTypes.includes(displayType)) {
      return res.status(400).json({
        error: `display_type '${displayType}' non déclaré pour ce site. Types autorisés : ${allowedTypes.join(', ')}`,
      });
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

    // Notify Pi sites that have this video — fire-and-forget, must not block the response
    deploymentService.dispatchVariantUpdateToSites(id, variant).catch((err) => {
      logger.error('dispatchVariantUpdateToSites failed (non-blocking)', { videoId: id, error: err });
    });

    // Validateur de format LED (PROP-014 §6) — informatif, jamais bloquant.
    const formatNotice = await computeLedFormatNotice(
      video.uploaded_for_site_id ?? null,
      displayType,
      width,
      height,
    );

    res.status(201).json({
      ...variant,
      url: uploadResult.url,
      ...(formatNotice ? { format_notice: formatNotice } : {}),
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
 * POST /content/videos/:id/variants/from-video
 * Create a variant by referencing an existing video (no upload needed)
 * Body: { display_type, source_video_id }
 */
export const createVideoVariantFromVideo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { display_type: displayType, source_video_id: sourceVideoId } = req.body as {
      display_type: string;
      source_video_id: string;
    };

    if (!displayType || !/^[a-z0-9-]+$/.test(displayType)) {
      return res.status(400).json({ error: 'display_type requis (slug alphanumérique avec tirets)' });
    }

    if (displayType === 'tv') {
      return res.status(400).json({ error: 'display_type tv est réservé — la vidéo principale est la variante tv' });
    }

    if (!sourceVideoId) {
      return res.status(400).json({ error: 'source_video_id requis' });
    }

    // Verify parent video exists
    const parentVideo = await videoRepository.findVideoById(id);
    if (!parentVideo) {
      return res.status(404).json({ error: 'Vidéo parente non trouvée' });
    }

    // Valider display_type contre les écrans déclarés du site
    const allowedTypes = await getAllowedDisplayTypes(parentVideo.uploaded_for_site_id ?? null);
    if (allowedTypes && !allowedTypes.includes(displayType)) {
      return res.status(400).json({
        error: `display_type '${displayType}' non déclaré pour ce site. Types autorisés : ${allowedTypes.join(', ')}`,
      });
    }

    // Verify source video exists
    const sourceVideo = await videoRepository.findVideoById(sourceVideoId);
    if (!sourceVideo) {
      return res.status(404).json({ error: 'Vidéo source non trouvée' });
    }

    // Create variant pointing to the source video's storage
    const variant = await videoVariantRepository.create({
      video_id: id,
      display_type: displayType,
      filename: sourceVideo.filename,
      original_name: sourceVideo.original_name,
      storage_path: sourceVideo.url || sourceVideo.filename, // url = storage_path aliased in findVideoById
      file_size: sourceVideo.file_size,
      checksum: sourceVideo.checksum || '',
      mime_type: 'video/mp4',
      width: null,
      height: null,
      duration: sourceVideo.duration,
      metadata: { source_video_id: sourceVideoId },
      uploaded_by: req.user?.id || null,
    });

    logger.info('Video variant created from existing video', {
      variantId: variant.id,
      videoId: id,
      displayType,
      sourceVideoId,
    });

    // Notify Pi sites that have this video — fire-and-forget, must not block the response
    deploymentService.dispatchVariantUpdateToSites(id, variant).catch((err) => {
      logger.error('dispatchVariantUpdateToSites failed (non-blocking)', { videoId: id, error: err });
    });

    res.status(201).json({
      ...variant,
      url: getVideoUrl(variant.storage_path),
    });
  } catch (error) {
    logger.error('Error creating video variant from video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de la création de la variante',
      details: errorMessage,
    });
  }
};

/**
 * PATCH /content/videos/:id/variants/:displayType/layout
 * Met à jour la mise en page d'une variante LED périmétrique (PROP-014 §8, ADR-134).
 * Body: { layout: 'repeated' | 'scrolling' | 'stretched' | null }
 */
export const updateVideoVariantLayout = async (req: AuthRequest, res: Response) => {
  try {
    const { id, displayType } = req.params;

    if (!displayType || !/^[a-z0-9-]+$/.test(displayType)) {
      return res.status(400).json({ error: 'display_type invalide (slug alphanumérique avec tirets attendu)' });
    }

    const rawLayout = (req.body as { layout?: unknown }).layout;
    // `null` réinitialise ; sinon doit appartenir à l'enum.
    const layout: VariantLayout | null = rawLayout === null || rawLayout === undefined ? null : (rawLayout as VariantLayout);
    if (layout !== null && !VARIANT_LAYOUTS.includes(layout)) {
      return res.status(400).json({
        error: `layout invalide. Valeurs autorisées : ${VARIANT_LAYOUTS.join(', ')} (ou null)`,
      });
    }

    const updated = await videoVariantRepository.updateLayout(id, displayType as DisplayType, layout);
    if (!updated) {
      return res.status(404).json({ error: 'Variante non trouvée' });
    }

    logger.info('Video variant layout updated', { videoId: id, displayType, layout });

    // Propage aux Pi qui ont cette vidéo (fire-and-forget, non bloquant).
    deploymentService.dispatchVariantUpdateToSites(id, updated).catch((err) => {
      logger.error('dispatchVariantUpdateToSites failed (non-blocking)', { videoId: id, error: err });
    });

    res.json({ ...updated, url: getVideoUrl(updated.storage_path) });
  } catch (error) {
    logger.error('Error updating video variant layout:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la mise en page' });
  }
};

/**
 * POST /content/videos/:id/variants/:displayType/export
 * Enqueue un job d'export LED (vidéo → canvas plié, async — PROP-014 §6 / ADR-134).
 * Retourne 202 { job_id } ; le worker `led-export-worker` traite hors cycle HTTP.
 */
export const enqueueLedExport = async (req: AuthRequest, res: Response) => {
  try {
    const { id, displayType } = req.params;

    if (displayType !== 'led-perimeter') {
      return res.status(400).json({ error: "L'export plié n'existe que pour les écrans led-perimeter" });
    }

    const video = await videoRepository.findVideoById(id);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    const siteId = video.uploaded_for_site_id ?? null;
    if (!siteId) {
      return res.status(400).json({ error: 'Export LED indisponible : la vidéo n’est rattachée à aucun site (profil LED requis)' });
    }

    const variant = await videoVariantRepository.findByVideoAndDisplay(id, displayType as DisplayType);
    if (!variant) {
      return res.status(404).json({ error: 'Variante led-perimeter non trouvée pour cette vidéo' });
    }

    const job = await ledExportJobRepository.create({
      site_id: siteId,
      video_id: id,
      display_type: displayType,
      fit: fitFromLayout(variant.layout),
      created_by: req.user?.id ?? null,
    });

    logger.info('led-export: job enqueued', { jobId: job.id, videoId: id, fit: job.fit });
    res.status(202).json({ job_id: job.id, status: job.status });
  } catch (error) {
    logger.error('Error enqueuing LED export:', error);
    res.status(500).json({ error: 'Erreur lors de la mise en file de l’export' });
  }
};

/**
 * GET /content/led-export-jobs/:jobId
 * Statut d'un job d'export LED (polling dashboard).
 */
export const getLedExportJob = async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await ledExportJobRepository.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job d’export non trouvé' });
    }
    res.json({
      id: job.id,
      status: job.status,
      output_url: job.output_url,
      error_msg: job.error_msg,
    });
  } catch (error) {
    logger.error('Error getting LED export job:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du job' });
  }
};

/**
 * POST /content/videos/variant-counts
 * Batch query: retourne le nombre de variantes et les types pour chaque vidéo
 * Body: { videoIds: string[] }
 */
export const getVariantCounts = async (req: AuthRequest, res: Response) => {
  try {
    const { videoIds } = req.body as { videoIds: string[] };

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: 'videoIds requis (tableau non vide)' });
    }

    if (videoIds.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 videoIds par requête' });
    }

    const counts = await videoVariantRepository.findVariantCountsByVideoIds(videoIds);

    // Convert Map to plain object for JSON serialization
    const result: Record<string, { count: number; types: string[] }> = {};
    counts.forEach((value, key) => {
      result[key] = value;
    });

    res.json(result);
  } catch (error) {
    logger.error('Error getting variant counts:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des compteurs de variantes' });
  }
};

/**
 * DELETE /content/videos/:videoId/variants/:displayType
 * Supprime une variante vidéo
 */
export const deleteVideoVariant = async (req: AuthRequest, res: Response) => {
  try {
    const { videoId, displayType } = req.params;

    if (!displayType || !/^[a-z0-9-]+$/.test(displayType)) {
      return res.status(400).json({ error: 'display_type invalide (slug alphanumérique avec tirets attendu)' });
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
