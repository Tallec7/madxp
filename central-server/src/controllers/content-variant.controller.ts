import { Response } from 'express';
import logger from '../config/logger';
import { probeVideoDimensions } from '../utils/video-dimensions';
import { AuthRequest } from '../types';
import { videoRepository, videoVariantRepository, siteRepository, videoClubGrantRepository, VARIANT_LAYOUTS, ledExportJobRepository } from '../repositories';
import type { DisplayType, VariantLayout, VideoVariantSideFile } from '../repositories';
import { uploadVideo, uploadVideoFromDisk, deleteVideo as deleteStorageVideo, getVideoUrl } from '../services/storage.service';
import { cleanupTempFile } from '../middleware/upload';
import { fixMulterEncoding, generateUniqueFilename, calculateChecksum, calculateChecksumFromFile } from './content.helpers';
import deploymentService from '../services/deployment.service';
import { computeRibbonDimensions, validateLedFormat, fitFromLayout, normalizeLayout, type LedFormatNotice } from '../services/led-fold.service';

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
      variants: variants.map(v => ({
        ...v,
        // storage_path est nullable depuis ADR-135 (variante « par côté pure »).
        url: v.storage_path ? getVideoUrl(v.storage_path) : null,
        // Résout les URLs publiques des fichiers par côté (ADR-135).
        side_files: (v.side_files ?? []).map((s) => ({ ...s, url: getVideoUrl(s.storage_path) })),
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

    // Garde-fou club : ne peut créer une variante que sur sa propre vidéo.
    // (le tempFile est nettoyé par le bloc finally au return)
    const ownershipError = clubOwnershipError(req.user, video);
    if (ownershipError) {
      return res.status(403).json({ error: 'Accès refusé', message: ownershipError });
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

    // Dimensions MESURÉES, pas déclarées : `req.body.width/height` n'était jamais
    // envoyé par le dashboard, d'où 100 % de NULL en base et un validateur de
    // format muet. Le corps de requête ne sert plus que de repli.
    const probed = await probeVideoDimensions(tempFilePath);
    const width = probed?.width ?? (req.body.width ? parseInt(req.body.width, 10) : null);
    const height = probed?.height ?? (req.body.height ? parseInt(req.body.height, 10) : null);

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
 * Garde-fou d'ownership club pour la vidéo PARENTE (cible d'écriture de la variante).
 * Un user `club` ne peut attacher une variante qu'à SA propre vidéo
 * (`uploaded_for_site_id === site_id`). Les vidéos NEOPRO corporate restent en
 * lecture seule — pas de variante club dessus (cf. security.md). Les rôles
 * admin/operator/super_admin sont déjà filtrés par `requireRole` en amont.
 * Retourne un message d'erreur 403 si refusé, sinon `null`.
 */
function clubOwnershipError(
  user: AuthRequest['user'],
  video: { uploaded_for_site_id: string | null },
): string | null {
  if (user?.role !== 'club') return null;
  if (!user.site_id) return 'Compte club sans site associé';
  if (video.uploaded_for_site_id !== user.site_id) {
    return 'Vous ne pouvez créer une variante que sur vos propres vidéos';
  }
  return null;
}

/**
 * Vérifie qu'un user `club` a le droit d'UTILISER la vidéo source référencée :
 * sa propre vidéo, une vidéo NEOPRO, ou une vidéo grantée (ADR-082). Mirror de
 * la visibilité club de `getSiteLocalContent`. Toujours `true` pour les non-club.
 */
async function clubCanUseSourceVideo(
  user: AuthRequest['user'],
  source: { id: string; uploaded_for_site_id: string | null; category: string | null },
): Promise<boolean> {
  if (user?.role !== 'club') return true;
  if (!user.site_id) return false;
  if (source.uploaded_for_site_id === user.site_id) return true;
  if ((source.category ?? '').toUpperCase() === 'NEOPRO') return true;
  return videoClubGrantRepository.hasGrant(source.id, user.site_id);
}

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

    // Garde-fou club : ne peut créer une variante que sur sa propre vidéo.
    const ownershipError = clubOwnershipError(req.user, parentVideo);
    if (ownershipError) {
      return res.status(403).json({ error: 'Accès refusé', message: ownershipError });
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

    // Garde-fou club : la source doit être une vidéo qu'il a le droit d'utiliser.
    if (!(await clubCanUseSourceVideo(req.user, sourceVideo))) {
      return res.status(403).json({ error: 'Accès refusé', message: 'Vidéo source non autorisée pour votre club' });
    }

    const sourceDimensions = dimensionsFromVideo(sourceVideo);

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
      // Le fichier n'est pas local : on hérite des dimensions mesurées à l'upload
      // de la vidéo source, plutôt que de laisser NULL.
      width: sourceDimensions.width,
      height: sourceDimensions.height,
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

    // Garde-fou club : ne peut modifier la mise en page que d'une variante de sa propre vidéo.
    const layoutParent = await videoRepository.findVideoById(id);
    if (!layoutParent) {
      return res.status(404).json({ error: 'Vidéo parente non trouvée' });
    }
    const layoutOwnershipError = clubOwnershipError(req.user, layoutParent);
    if (layoutOwnershipError) {
      return res.status(403).json({ error: 'Accès refusé', message: layoutOwnershipError });
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
 * POST /content/videos/:id/variants/led-perimeter/sides/:sideIndex
 * Upload le fichier vidéo d'UN côté d'une variante led-perimeter « par côté »
 * (ADR-135). Stocke le fichier puis upsert l'élément dans `side_files`.
 */
/**
 * Dimensions d'une vidéo de la bibliothèque, telles que mesurées à son upload.
 *
 * Une variante « depuis une vidéo existante » ne télécharge pas le fichier : elle
 * pointe le même binaire. Ses dimensions sont donc celles de la source — les lire
 * dans `metadata` évite un NULL qui rendrait le validateur de format muet, et
 * évite surtout de re-télécharger un fichier pour mesurer ce qu'on sait déjà.
 */
function dimensionsFromVideo(video: { metadata?: unknown } | null | undefined): {
  width: number | null;
  height: number | null;
} {
  const meta = (video?.metadata ?? {}) as Record<string, unknown>;
  const w = typeof meta.width === 'number' && meta.width > 0 ? meta.width : null;
  const h = typeof meta.height === 'number' && meta.height > 0 ? meta.height : null;
  return { width: w, height: h };
}

export const uploadVideoVariantSide = async (req: AuthRequest, res: Response) => {
  const file = req.file;
  const tempFilePath = file?.path;
  try {
    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }
    if (!file.size || file.size === 0) {
      if (tempFilePath) cleanupTempFile(tempFilePath);
      return res.status(400).json({ error: 'Le fichier vidéo est vide (0 octets)' });
    }

    const { id, displayType } = req.params;
    const sideIndex = parseInt(req.params.sideIndex, 10);
    if (displayType !== 'led-perimeter') {
      return res.status(400).json({ error: 'Le contenu par côté n’existe que pour led-perimeter' });
    }

    const video = await videoRepository.findVideoById(id);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo parente non trouvée' });
    }

    // Garde-fou club : ne peut éditer un côté que d'une variante de sa propre vidéo.
    // (le tempFile est nettoyé par le bloc finally au return)
    const sideOwnershipError = clubOwnershipError(req.user, video);
    if (sideOwnershipError) {
      return res.status(403).json({ error: 'Accès refusé', message: sideOwnershipError });
    }

    const correctedOriginalname = fixMulterEncoding(file.originalname);
    const variantFilename = await generateUniqueFilename(correctedOriginalname);
    const checksum = tempFilePath
      ? await calculateChecksumFromFile(tempFilePath)
      : calculateChecksum(file.buffer);
    const storagePath = `variants/${id}/led-perimeter/side-${sideIndex}/${variantFilename}`;

    const uploadResult = tempFilePath
      ? await uploadVideoFromDisk(tempFilePath, file.size, storagePath, file.mimetype)
      : await uploadVideo(file.buffer, storagePath, file.mimetype);
    if (!uploadResult) {
      return res.status(500).json({ error: 'Erreur lors de l’upload du fichier de côté' });
    }

    // Idem : on mesure le fichier reçu.
    const probedSide = await probeVideoDimensions(tempFilePath);
    const width = probedSide?.width ?? (req.body.width ? parseInt(req.body.width, 10) : null);
    const height = probedSide?.height ?? (req.body.height ? parseInt(req.body.height, 10) : null);

    const sideFile: VideoVariantSideFile = {
      side_index: sideIndex,
      filename: variantFilename,
      original_name: correctedOriginalname,
      storage_path: uploadResult.path,
      file_size: file.size,
      checksum,
      mime_type: file.mimetype,
      width,
      height,
    };

    const variant = await videoVariantRepository.setSideFile(id, displayType as DisplayType, sideFile);
    logger.info('led side file uploaded', { videoId: id, sideIndex, filename: variantFilename });

    // NB : pas de dispatch vers les Pi ici — une variante « par côté » ne se
    // déploie qu'une fois COMPOSÉE en canvas plié (brique C/D, ADR-135).

    res.status(201).json({
      ...variant,
      side_files: (variant.side_files ?? []).map((s) => ({ ...s, url: getVideoUrl(s.storage_path) })),
    });
  } catch (error) {
    logger.error('Error uploading led side file:', error);
    res.status(500).json({ error: 'Erreur lors de l’upload du fichier de côté' });
  } finally {
    if (tempFilePath) cleanupTempFile(tempFilePath);
  }
};

/**
 * DELETE /content/videos/:id/variants/led-perimeter/sides/:sideIndex
 * Retire le fichier d'un côté (ADR-135). Supprime la variante si plus rien.
 */
/**
 * Associe une vidéo EXISTANTE de la bibliothèque à un côté d'une variante
 * led-perimeter « par côté » (ADR-135). Pas d'upload : on pointe sur le
 * storage de la vidéo source, comme `createVideoVariantFromVideo` mais ciblé
 * sur un seul côté. Pas de dispatch Pi (une variante « par côté » ne se
 * déploie qu'une fois COMPOSÉE en canvas plié — briques C/D).
 */
export const setVideoVariantSideFromVideo = async (req: AuthRequest, res: Response) => {
  try {
    const { id, displayType } = req.params;
    const sideIndex = parseInt(req.params.sideIndex, 10);
    const { source_video_id: sourceVideoId } = req.body as { source_video_id: string };

    if (displayType !== 'led-perimeter') {
      return res.status(400).json({ error: 'Le contenu par côté n’existe que pour led-perimeter' });
    }
    if (!sourceVideoId) {
      return res.status(400).json({ error: 'source_video_id requis' });
    }

    const video = await videoRepository.findVideoById(id);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo parente non trouvée' });
    }

    // Garde-fou club : variante de sa propre vidéo uniquement.
    const sideFromVideoOwnershipError = clubOwnershipError(req.user, video);
    if (sideFromVideoOwnershipError) {
      return res.status(403).json({ error: 'Accès refusé', message: sideFromVideoOwnershipError });
    }

    const sourceVideo = await videoRepository.findVideoById(sourceVideoId);
    if (!sourceVideo) {
      return res.status(404).json({ error: 'Vidéo source non trouvée' });
    }

    // Garde-fou club : la source doit être une vidéo qu'il a le droit d'utiliser.
    if (!(await clubCanUseSourceVideo(req.user, sourceVideo))) {
      return res.status(403).json({ error: 'Accès refusé', message: 'Vidéo source non autorisée pour votre club' });
    }

    const sourceDimensions = dimensionsFromVideo(sourceVideo);

    const sideFile: VideoVariantSideFile = {
      side_index: sideIndex,
      filename: sourceVideo.filename,
      original_name: sourceVideo.original_name,
      storage_path: sourceVideo.url || sourceVideo.filename, // url = storage_path aliasé dans findVideoById
      file_size: sourceVideo.file_size,
      checksum: sourceVideo.checksum || '',
      mime_type: 'video/mp4',
      width: sourceDimensions.width,
      height: sourceDimensions.height,
    };

    const variant = await videoVariantRepository.setSideFile(id, displayType as DisplayType, sideFile);
    logger.info('led side file linked from existing video', { videoId: id, sideIndex, sourceVideoId });

    res.status(201).json({
      ...variant,
      side_files: (variant.side_files ?? []).map((s) => ({ ...s, url: getVideoUrl(s.storage_path) })),
    });
  } catch (error) {
    logger.error('Error linking led side file from video:', error);
    res.status(500).json({ error: 'Erreur lors de l’association du fichier de côté' });
  }
};

export const deleteVideoVariantSide = async (req: AuthRequest, res: Response) => {
  try {
    const { id, displayType } = req.params;
    const sideIndex = parseInt(req.params.sideIndex, 10);
    if (displayType !== 'led-perimeter') {
      return res.status(400).json({ error: 'Le contenu par côté n’existe que pour led-perimeter' });
    }

    // Garde-fou club : ne peut supprimer un côté que d'une variante de sa propre vidéo.
    const delSideParent = await videoRepository.findVideoById(id);
    if (!delSideParent) {
      return res.status(404).json({ error: 'Vidéo parente non trouvée' });
    }
    const delSideOwnershipError = clubOwnershipError(req.user, delSideParent);
    if (delSideOwnershipError) {
      return res.status(403).json({ error: 'Accès refusé', message: delSideOwnershipError });
    }

    const variant = await videoVariantRepository.clearSideFile(id, displayType as DisplayType, sideIndex);
    res.json({ ok: true, side_files: variant?.side_files ?? [] });
  } catch (error) {
    logger.error('Error deleting led side file:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du fichier de côté' });
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

    // Garde-fou club : ne peut exporter que sa propre vidéo.
    const exportOwnershipError = clubOwnershipError(req.user, video);
    if (exportOwnershipError) {
      return res.status(403).json({ error: 'Accès refusé', message: exportOwnershipError });
    }

    // Le pliage est PAR CLUB : la source (même globale/partagée) est pliée à la
    // taille du ruban du club VISÉ. Cible = site passé par le dashboard (la page
    // consultée), sinon le propriétaire de la vidéo. La même source rangée par
    // (vidéo × site) est réutilisable d'un club à l'autre.
    const targetSiteId =
      (typeof req.body?.target_site_id === 'string' ? req.body.target_site_id : null) ||
      video.uploaded_for_site_id ||
      null;
    if (!targetSiteId) {
      return res.status(400).json({ error: 'Club cible requis pour plier la vidéo (la taille du ruban dépend du club)' });
    }

    // Un user club ne peut plier que pour SON propre club (jamais cibler un autre site).
    if (req.user?.role === 'club' && targetSiteId !== req.user.site_id) {
      return res.status(403).json({ error: 'Accès refusé', message: 'Un club ne peut plier une vidéo que pour son propre site' });
    }

    // Fail-fast : le club cible doit avoir un écran led-perimeter avec un profil.
    const displays = await siteRepository.getDisplays(targetSiteId);
    const led = displays.find((d) => d.type === 'led-perimeter')?.led;
    if (!led || !Array.isArray(led.sides) || led.sides.length === 0) {
      return res.status(400).json({ error: 'Le club cible n’a pas de profil LED périmétrique configuré' });
    }

    const variant = await videoVariantRepository.findByVideoAndDisplay(id, displayType as DisplayType);
    if (!variant) {
      return res.status(404).json({ error: 'Variante led-perimeter non trouvée pour cette vidéo' });
    }

    const layout = normalizeLayout(variant.layout);

    // Réutilisation : un ruban déjà plié pour ce (vidéo × club × mise en page) ?
    // On le rend directement (200) au lieu de replier inutilement.
    const existing = await ledExportJobRepository.findReady(id, targetSiteId, layout);
    if (existing) {
      logger.info('led-export: reusing ready export', { jobId: existing.id, videoId: id, siteId: targetSiteId });
      return res.status(200).json({
        job_id: existing.id,
        status: 'ready',
        output_url: existing.output_url,
        reused: true,
      });
    }

    const job = await ledExportJobRepository.create({
      site_id: targetSiteId,
      video_id: id,
      display_type: displayType,
      fit: fitFromLayout(variant.layout),
      layout,
      created_by: req.user?.id ?? null,
    });

    logger.info('led-export: job enqueued', { jobId: job.id, videoId: id, siteId: targetSiteId, layout });
    res.status(202).json({ job_id: job.id, status: job.status });
  } catch (error) {
    logger.error('Error enqueuing LED export:', error);
    res.status(500).json({ error: 'Erreur lors de la mise en file de l’export' });
  }
};

/**
 * POST /content/sites/:siteId/led-test-export
 * Banc d'essai LED : plie une vidéo AU CHOIX (par son id) pour le profil LED du
 * club, dans la mise en page demandée — sans exiger de variante led-perimeter
 * dédiée (le worker retombe sur le binaire principal). Permet à l'opérateur de
 * comparer Répété / Défilant / Étalé / Centré avant de figer la variante.
 * PROP-014 §6 / ADR-134.
 */
export const enqueueLedTestExport = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const videoId = typeof req.body?.video_id === 'string' ? req.body.video_id : null;
    if (!videoId) {
      return res.status(400).json({ error: 'video_id requis' });
    }

    const video = await videoRepository.findVideoById(videoId);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    // Fail-fast : le club doit avoir un écran led-perimeter avec un profil complet.
    const displays = await siteRepository.getDisplays(siteId);
    const led = displays.find((d) => d.type === 'led-perimeter')?.led;
    if (!led || !Array.isArray(led.sides) || led.sides.length === 0) {
      return res.status(400).json({ error: 'Ce club n’a pas de profil LED périmétrique configuré' });
    }

    const layout = normalizeLayout(req.body?.layout);

    // Réutilisation : un ruban déjà plié pour ce (vidéo × club × mise en page) ?
    const existing = await ledExportJobRepository.findReady(videoId, siteId, layout);
    if (existing) {
      logger.info('led-test-export: reusing ready export', { jobId: existing.id, videoId, siteId, layout });
      return res.status(200).json({
        job_id: existing.id,
        status: 'ready',
        output_url: existing.output_url,
        reused: true,
      });
    }

    const job = await ledExportJobRepository.create({
      site_id: siteId,
      video_id: videoId,
      display_type: 'led-perimeter',
      fit: fitFromLayout(layout),
      layout,
      created_by: req.user?.id ?? null,
    });

    logger.info('led-test-export: job enqueued', { jobId: job.id, videoId, siteId, layout });
    res.status(202).json({ job_id: job.id, status: job.status });
  } catch (error) {
    logger.error('Error enqueuing LED test export:', error);
    res.status(500).json({ error: 'Erreur lors de la mise en file de l’aperçu' });
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
    // Statut pollé toutes les 2s par le dashboard — JAMAIS de cache navigateur,
    // sinon le polling reste bloqué sur le 1er statut ('queued'/'processing') et
    // ne voit jamais 'ready' (incident 2026-06-03).
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
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
