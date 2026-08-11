import { Response } from 'express';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import logger from '../config/logger';
import { probeVideoDimensions } from '../utils/video-dimensions';
import { classifyVideoForRibbon, type FitRecommendation } from '../services/led-content-fit.service';
import { AuthRequest, type DisplayConfig, type LedProfileConfig } from '../types';
import { videoRepository, videoVariantRepository, siteRepository, videoClubGrantRepository, VARIANT_LAYOUTS, ledExportJobRepository } from '../repositories';
import type { DisplayType, VariantLayout, VideoVariantSideFile, VideoVariantCrop } from '../repositories';
import { downloadToFile } from '../utils/download-to-file';
import {
  detectCropRect,
  evaluateCropProposal,
  isRectWithin,
  type CropRect,
} from '../services/led-autocrop.service';
import { uploadVideo, uploadVideoFromDisk, deleteVideo as deleteStorageVideo, getVideoUrl } from '../services/storage.service';
import { cleanupTempFile } from '../middleware/upload';
import { fixMulterEncoding, generateUniqueFilename, calculateChecksum, calculateChecksumFromFile } from './content.helpers';
import deploymentService from '../services/deployment.service';
import { computeRibbonDimensions, validateLedFormat, fitFromLayout, normalizeLayout, computeSiteCanvas, type LedFormatNotice } from '../services/led-fold.service';

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

/**
 * Recommandation de cadrage pour une vidéo sur un ruban LED.
 *
 * Complète `format_notice` (qui juge « ça rentre ou pas ») par une PROPOSITION :
 * sur quoi la vidéo est cadrée, quelle mise en page pré-sélectionner, et ce que
 * les autres choix feraient — notamment « Étalé », qui déforme sans le dire.
 *
 * `null` dès qu'on ne sait pas (pas un ruban, profil incomplet, dimensions
 * illisibles) : ne pas conseiller vaut mieux que conseiller à tort.
 */
async function computeFitRecommendation(
  siteId: string | null,
  displayType: string,
  width: number | null,
  height: number | null,
): Promise<FitRecommendation | null> {
  if (displayType !== 'led-perimeter' || !siteId || !width || !height) return null;
  const displays = await siteRepository.getDisplays(siteId);
  const led = displays.find((d) => d.type === 'led-perimeter')?.led;
  if (!led || !Array.isArray(led.sides) || led.sides.length === 0) return null;

  const pitchMm = parseFloat(String(led.pitch).replace(/^P/i, ''));
  if (!Number.isFinite(pitchMm) || pitchMm <= 0) return null;

  try {
    return classifyVideoForRibbon({
      videoWidth: width,
      videoHeight: height,
      sides: led.sides,
      pitchMm,
      height: led.height,
    });
  } catch {
    return null; // profil incomplet → pas de conseil (jamais bloquant)
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
/** Type d'écran du ruban périmétrique — la variante que le pliage consomme. */
const LED_PERIMETER_DISPLAY_TYPE = 'led-perimeter';

/**
 * Plafond de vidéos traitées en une passe. Un club LED en a une dizaine ; la borne
 * existe pour qu'une bibliothèque anormalement grande ne tienne pas la requête HTTP
 * ouverte, pas pour limiter un usage réel.
 */
const BULK_LED_MAX_VIDEOS = 500;

function displaysToAllowedTypes(displays: DisplayConfig[]): string[] {
  const secondaryTypes = displays.filter(d => d.type !== 'tv').map(d => d.type);
  return secondaryTypes.length > 0 ? secondaryTypes : ['secondary'];
}

async function getAllowedDisplayTypes(siteId: string | null): Promise<string[] | null> {
  if (!siteId) return null;
  return displaysToAllowedTypes(await siteRepository.getDisplays(siteId));
}

/** Entrée de `classifyVideoForRibbon` dérivée d'un profil LED, ou `null` si illisible. */
type RibbonGeometry = { sides: number[]; pitchMm: number; height: number };

function ribbonGeometry(led: LedProfileConfig | null | undefined): RibbonGeometry | null {
  if (!led || !Array.isArray(led.sides) || led.sides.length === 0) return null;
  const pitchMm = parseFloat(String(led.pitch).replace(/^P/i, ''));
  if (!Number.isFinite(pitchMm) || pitchMm <= 0) return null;
  if (!led.height || led.height <= 0) return null;
  return { sides: led.sides, pitchMm, height: led.height };
}

/**
 * Seuil d'élongation en deçà duquel une vidéo n'est pas du contenu de ruban.
 *
 * `fillRatio` vaut exactement `ratio vidéo / ratio ruban` pour toute vidéo moins
 * allongée que le ruban : `0,25` signifie donc « au moins 4× moins allongée ».
 * Sur le ruban de Piraths (1600×120, ratio 13,3:1) : un 16:9 tombe à 0,13 et un
 * carré à 0,08 — écartés ; un 1600×160 tient 0,75 et un 400×120 exactement 0,25 —
 * gardés. Le seuil vise le clip TV, pas la tuile logo destinée à la répétition.
 */
const RIBBON_MIN_FILL_RATIO = 0.25;

/**
 * Motif d'exclusion d'une vidéo du parc ruban, ou `null` s'il faut la déclarer.
 *
 * Renvoie `null` — donc DÉCLARE — dès qu'on ne sait pas : dimensions jamais
 * mesurées, profil LED incomplet, classement en échec. Un `null` de dimensions
 * n'est pas un `false` : mieux vaut déclarer une variante que l'opérateur retire
 * d'un clic que la sauter en silence (même principe que `matches_expected` dans
 * la vue Canvas). Concrètement, tant que `backfill:video-dimensions` n'a pas
 * tourné sur le site, ce filtre est inerte — et c'est le comportement voulu.
 */
function ribbonExclusion(
  ribbon: RibbonGeometry | null,
  dims: { width: number | null; height: number | null }
): string | null {
  if (!ribbon || !dims.width || !dims.height) return null;

  let rec: FitRecommendation;
  try {
    rec = classifyVideoForRibbon({
      videoWidth: dims.width,
      videoHeight: dims.height,
      ...ribbon,
    });
  } catch {
    return null; // profil incomplet → on ne tranche pas
  }

  if (rec.fillRatio >= RIBBON_MIN_FILL_RATIO) return null;

  return (
    `Format ${dims.width}×${dims.height} : ne couvre que ${Math.round(rec.fillRatio * 100)} % ` +
    `de la largeur du ruban (${rec.target.width}×${rec.target.height}) — clip TV, ` +
    `pas du contenu de ruban. À déclarer à la main si c'est une erreur.`
  );
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

    const fit = await computeFitRecommendation(
      video.uploaded_for_site_id ?? null,
      displayType,
      width,
      height,
    );

    res.status(201).json({
      ...variant,
      url: uploadResult.url,
      ...(formatNotice ? { format_notice: formatNotice } : {}),
      ...(fit ? { fit_recommendation: fit } : {}),
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
/**
 * Crée en une fois la variante `led-perimeter` manquante sur toutes les vidéos d'un club.
 *
 * ## Pourquoi ce endpoint existe
 *
 * Le pliage automatique (ADR-139) ne s'applique qu'aux vidéos AYANT une variante
 * `led-perimeter` : `substituteFoldedCanvas` lit `variants['led-perimeter']`, donc
 * pas de variante = rien à plier. Or un club LED a typiquement dix sponsors, tous au
 * format ruban, tous à déclarer un par un. Dix allers-retours dans l'UI pour une
 * opération qui n'a aucune décision à prendre : la variante pointe vers la vidéo
 * elle-même, puisque le fichier EST déjà le ruban.
 *
 * ## Ce que ça ne fait pas
 *
 * Aucun encodage, aucune copie de fichier : la variante réutilise le `storage_path`
 * de la vidéo source. C'est une déclaration, pas une transformation — le canvas plié,
 * lui, sera fabriqué par le worker au premier déploiement.
 *
 * Les vidéos ayant déjà une variante `led-perimeter` sont laissées telles quelles :
 * un opérateur a pu y mettre un fichier différent (recadrage manuel, version par
 * côté), et l'écraser détruirait son travail.
 */
/**
 * Tableau de bord des canvas LED d'un club — une ligne par vidéo.
 *
 * ## Pourquoi
 *
 * Le pliage se contrôlait une vidéo à la fois (banc d'essai, export par variante),
 * donc les défauts se découvraient en regardant la boucle tourner, un par un et en
 * conditions réelles. Ce qui casse n'est presque jamais le pliage lui-même : c'est
 * le FORMAT SOURCE. Un sponsor livré en 1920×1080 se retrouve minuscule au centre
 * d'une bande, un trop large est rogné à droite — invisible tant qu'on ne compare
 * pas source et cible côte à côte.
 *
 * Cette vue rapproche donc, pour chaque vidéo : ce que l'agence a livré, ce que le
 * ruban attend, et l'état du canvas fabriqué.
 */
/**
 * URL publique d'un chemin de stockage, ou `null` si le stockage n'est pas
 * configuré. La vue Canvas est un outil de DIAGNOSTIC : une variable d'env
 * manquante doit lui coûter une vignette, jamais la page entière.
 */
function safeVideoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  try {
    return getVideoUrl(storagePath);
  } catch {
    return null;
  }
}

export const getLedCanvasOverview = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    const displays = await siteRepository.getDisplays(siteId);
    const led = displays.find((d) => d.type === LED_PERIMETER_DISPLAY_TYPE)?.led;
    if (!led || !Array.isArray(led.sides) || led.sides.length === 0) {
      return res.status(400).json({ error: "Ce site n'a pas de ruban LED configuré" });
    }

    // Format ATTENDU = la largeur d'entrée réellement utilisée pour plier, pas un
    // calcul refait ici. Recalculer « un côté en px » à la main ignorait deux choses
    // que la chaîne applique : le plafond MAX_LED_BAND_WIDTH et un band_width figé
    // par un installateur. Comme c'est CETTE vue qui dit aux agences quoi livrer,
    // l'écart aurait fait produire des fichiers que le worker ne consomme pas.
    let expected: { width: number; height: number } | null = null;
    try {
      expected = { width: computeSiteCanvas(led).geometry.bandWidth, height: led.height };
    } catch {
      expected = null; // profil incomplet → on n'invente pas de cible
    }

    const videoIds = await videoRepository.findIdsOwnedBySite(siteId, BULK_LED_MAX_VIDEOS);
    const rows = await Promise.all(
      videoIds.map(async (id) => {
        const video = await videoRepository.findVideoById(id);
        if (!video) return null;

        const variant = await videoVariantRepository.findByVideoAndDisplay(id, LED_PERIMETER_DISPLAY_TYPE);
        const source = dimensionsFromVideo(video);
        const job = await ledExportJobRepository.findLatestForVideo(siteId, id, LED_PERIMETER_DISPLAY_TYPE);

        const sourcePath = variant?.storage_path || video.url || null;

        return {
          video_id: id,
          filename: video.original_name || video.filename,
          // Nécessaire à l'aperçu avant/après du détourage (PROP-015) : sans le
          // fichier source, l'écran ne pourrait montrer que des chiffres.
          // `safeVideoUrl` : une config de stockage absente ne doit pas faire
          // tomber toute la vue de diagnostic pour un aperçu manquant.
          source_url: safeVideoUrl(sourcePath),
          crop: variant?.crop ?? null,
          // `0` = dimensions jamais mesurées (upload antérieur à la sonde ffprobe),
          // ce qui n'est PAS la même chose qu'un format inadapté : on ne conclut pas.
          source,
          expected,
          matches_expected:
            expected && source.width && source.height
              ? source.width === expected.width && source.height === expected.height
              : null,
          has_variant: !!variant,
          layout: variant?.layout ?? null,
          canvas: job
            ? { status: job.status, url: job.output_url ?? null, updated_at: job.updated_at }
            : { status: 'missing', url: null, updated_at: null },
        };
      })
    );

    res.json({ site_id: siteId, expected, videos: rows.filter(Boolean) });
  } catch (error) {
    logger.error('Error building LED canvas overview:', error);
    res.status(500).json({ error: 'Erreur lors de la lecture des canvas LED' });
  }
};

/**
 * Résout le club cible d'une opération LED sur une vidéo, et son profil de ruban.
 *
 * Le pliage est PAR CLUB (la taille du ruban dépend du terrain) : la vue Canvas
 * passe donc explicitement le site consulté. À défaut, le propriétaire de la vidéo.
 */
async function resolveLedTarget(
  req: AuthRequest,
  video: { uploaded_for_site_id: string | null }
): Promise<{ siteId: string; expected: { width: number; height: number } } | { error: string }> {
  const siteId =
    (typeof req.body?.target_site_id === 'string' ? req.body.target_site_id : null) ||
    video.uploaded_for_site_id ||
    null;
  if (!siteId) {
    return { error: 'Club cible requis (la taille du ruban dépend du club)' };
  }
  if (req.user?.role === 'club' && siteId !== req.user.site_id) {
    return { error: 'Un club ne peut agir que sur son propre site' };
  }

  const displays = await siteRepository.getDisplays(siteId);
  const led = displays.find((d) => d.type === LED_PERIMETER_DISPLAY_TYPE)?.led;
  if (!led || !Array.isArray(led.sides) || led.sides.length === 0) {
    return { error: "Le club cible n'a pas de profil LED périmétrique configuré" };
  }
  try {
    // Cible = la largeur d'entrée réellement utilisée par le pliage, jamais un
    // calcul refait ici (elle respecte MAX_LED_BAND_WIDTH et un band_width figé).
    return { siteId, expected: { width: computeSiteCanvas(led).geometry.bandWidth, height: led.height } };
  } catch {
    return { error: 'Profil LED incomplet — impossible de déterminer le format du ruban' };
  }
}

/**
 * POST /content/videos/:id/variants/led-perimeter/crop/detect
 *
 * Mesure les marges noires d'une variante ruban et rend une **proposition**.
 *
 * ## Cet endpoint n'écrit RIEN
 *
 * C'est le cœur de PROP-015 : `cropdetect` ne peut pas distinguer un export mal
 * cadré d'un visuel volontairement posé sur fond noir. Détourer d'office rognerait
 * un sponsor dont la charte est noire jusqu'à son logo. La mesure est donc rendue
 * telle quelle, avec son argumentaire, et c'est `PUT …/crop` — un second geste,
 * humain — qui l'enregistre.
 *
 * Sur un 16:9 plein cadre (carton jaune, temps mort), la réponse est
 * `recommended: false` : il n'y a pas de marge à retirer et la bonne action est
 * « Retirer » la vidéo du ruban, pas la détourer.
 */
export const detectLedVariantCrop = async (req: AuthRequest, res: Response) => {
  let tmpFile: string | null = null;
  try {
    const { id } = req.params;

    const video = await videoRepository.findVideoById(id);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }
    const ownershipError = clubOwnershipError(req.user, video);
    if (ownershipError) {
      return res.status(403).json({ error: 'Accès refusé', message: ownershipError });
    }

    const target = await resolveLedTarget(req, video);
    if ('error' in target) {
      return res.status(400).json({ error: target.error });
    }

    const variant = await videoVariantRepository.findByVideoAndDisplay(id, LED_PERIMETER_DISPLAY_TYPE);
    // La source analysée est celle que le pliage consomme : la variante ruban si
    // elle porte un binaire, sinon le fichier principal de la vidéo.
    const storagePath = variant?.storage_path || video.url || null;
    if (!storagePath) {
      return res.status(400).json({ error: 'Aucun fichier à analyser pour cette vidéo' });
    }

    tmpFile = path.join(os.tmpdir(), `led-crop-${id}-${Date.now()}.mp4`);
    await downloadToFile(getVideoUrl(storagePath), tmpFile);

    // On mesure le fichier plutôt que de faire confiance aux dimensions en base :
    // c'est justement un fichier dont le nom ment sur son format qui a motivé
    // PROP-015 (`STRASOL_…_1600x120px.mp4` fait 4096×1416).
    const probed = await probeVideoDimensions(tmpFile);
    if (!probed) {
      return res.status(200).json({
        video_id: id,
        site_id: target.siteId,
        target: target.expected,
        crop: null,
        recommended: false,
        reason: 'Impossible de mesurer cette vidéo (fichier illisible) — aucun détourage proposé.',
      });
    }

    const detection = await detectCropRect(tmpFile, {
      durationSec: probed.duration,
      sourceWidth: probed.width,
      sourceHeight: probed.height,
    });

    if (!detection.crop) {
      return res.status(200).json({
        video_id: id,
        site_id: target.siteId,
        source: { width: probed.width, height: probed.height },
        target: target.expected,
        crop: null,
        recommended: false,
        reason: 'La détection de marges n’a rien pu mesurer — aucun détourage proposé.',
        samples: detection.samples,
      });
    }

    const proposal = evaluateCropProposal({
      sourceWidth: probed.width,
      sourceHeight: probed.height,
      crop: detection.crop,
      targetWidth: target.expected.width,
      targetHeight: target.expected.height,
    });

    logger.info('led-autocrop: proposition rendue (aucune écriture)', {
      videoId: id,
      siteId: target.siteId,
      recommended: proposal.recommended,
      crop: `${proposal.crop.w}x${proposal.crop.h}+${proposal.crop.x}+${proposal.crop.y}`,
    });

    res.json({
      video_id: id,
      site_id: target.siteId,
      current_crop: variant?.crop ?? null,
      samples: detection.samples,
      ...proposal,
    });
  } catch (error) {
    logger.error('Error detecting LED variant crop:', error);
    res.status(500).json({ error: 'Erreur lors de l’analyse des marges' });
  } finally {
    if (tmpFile) fs.promises.unlink(tmpFile).catch(() => undefined);
  }
};

/**
 * PUT /content/videos/:id/variants/led-perimeter/crop
 * Body: `{ crop: { x, y, w, h } | null }`
 *
 * Enregistre le détourage **validé par un humain**, ou le retire avec `null`.
 * C'est la seule écriture de `crop` du système.
 *
 * Le rectangle est revérifié contre les dimensions réelles du fichier : un client
 * qui enverrait un rectangle hors cadre produirait un `crop=` ffmpeg qui fait
 * échouer tous les pliages de ce club — un refus ici vaut mieux qu'une file de
 * jobs en échec.
 */
export const setLedVariantCrop = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const rawCrop = (req.body as { crop?: CropRect | null }).crop ?? null;

    const video = await videoRepository.findVideoById(id);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }
    const ownershipError = clubOwnershipError(req.user, video);
    if (ownershipError) {
      return res.status(403).json({ error: 'Accès refusé', message: ownershipError });
    }

    const variant = await videoVariantRepository.findByVideoAndDisplay(id, LED_PERIMETER_DISPLAY_TYPE);
    if (!variant) {
      return res.status(404).json({ error: 'Variante led-perimeter non trouvée pour cette vidéo' });
    }

    if (rawCrop) {
      const dims = dimensionsFromVideo(video);
      const srcW = variant.width ?? dims.width;
      const srcH = variant.height ?? dims.height;
      if (srcW && srcH && !isRectWithin(rawCrop, srcW, srcH)) {
        return res.status(400).json({
          error: `Rectangle hors du cadre de la vidéo (${srcW} × ${srcH})`,
        });
      }
    }

    const updated = await videoVariantRepository.updateCrop(
      id,
      LED_PERIMETER_DISPLAY_TYPE,
      rawCrop as VideoVariantCrop | null
    );

    logger.info('led-autocrop: détourage validé', { videoId: id, crop: rawCrop });

    // Le canvas plié fabriqué AVANT ce détourage l'ignore : son empreinte
    // (`computeFoldedCanvasHash`) inclut le `crop`, donc changer celui-ci suffit à
    // le rendre inatteignable — le prochain déploiement remet la fabrication en
    // file. Aucune purge à écrire ici.
    res.json({ ...updated, url: updated?.storage_path ? getVideoUrl(updated.storage_path) : null });
  } catch (error) {
    logger.error('Error setting LED variant crop:', error);
    res.status(500).json({ error: 'Erreur lors de l’enregistrement du détourage' });
  }
};

export const bulkCreateLedVariants = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    // Le site doit réellement avoir un ruban déclaré : sinon la variante serait
    // rejetée une par une par `getAllowedDisplayTypes`, autant le dire tout de suite.
    const displays = await siteRepository.getDisplays(siteId);
    const allowedTypes = displaysToAllowedTypes(displays);
    if (!allowedTypes.includes(LED_PERIMETER_DISPLAY_TYPE)) {
      return res.status(400).json({
        error: "Ce site n'a pas d'écran LED périmétrique déclaré",
        message: `Types d'écran du site : ${allowedTypes.join(', ') || 'aucun'}`,
      });
    }

    // Géométrie du ruban — sert à écarter les clips TV (cf. `ribbonExclusion`).
    // Absente ou illisible → aucun filtrage : on préfère tout déclarer.
    const ribbon = ribbonGeometry(displays.find((d) => d.type === LED_PERIMETER_DISPLAY_TYPE)?.led);

    // `findIdsOwnedBySite` filtre RÉELLEMENT sur `uploaded_for_site_id`. Ne jamais
    // revenir à `findForSitePaginated` : malgré son nom, elle ne filtre pas — le
    // siteId n'y sert qu'au tri, et elle a fait déborder cette opération sur 7 clubs.
    const videoIds = await videoRepository.findIdsOwnedBySite(siteId, BULK_LED_MAX_VIDEOS);
    if (videoIds.length === 0) {
      return res.json({ created: 0, skipped: 0, excluded: 0, failed: 0, total: 0, variants: [], exclusions: [] });
    }

    const counts = await videoVariantRepository.findVariantCountsByVideoIds(videoIds);
    const candidates = videoIds.filter(
      (id) => !counts.get(id)?.types.includes(LED_PERIMETER_DISPLAY_TYPE)
    );

    const created: Array<{ video_id: string; variant_id: string }> = [];
    const failed: Array<{ video_id: string; error: string }> = [];
    const excluded: Array<{ video_id: string; filename: string; reason: string }> = [];

    for (const candidateId of candidates) {
      try {
        // On relit la vidéo complète : `findVideoById` aliase `url` sur storage_path
        // et porte les dimensions mesurées à l'upload, dont la variante hérite.
        const video = await videoRepository.findVideoById(candidateId);
        if (!video) continue;

        const dims = dimensionsFromVideo(video);

        // Écarter les clips TV : chez Piraths, les faits de jeu (CARTON JAUNE,
        // TEMPS MORT…) sont des 16:9 destinés à la télécommande sur la TV.
        // Écrasés à 120 px de haut, ils donnent des vignettes noires illisibles.
        const reason = ribbonExclusion(ribbon, dims);
        if (reason) {
          excluded.push({
            video_id: video.id,
            filename: video.original_name || video.filename,
            reason,
          });
          continue;
        }

        const variant = await videoVariantRepository.create({
          video_id: video.id,
          display_type: LED_PERIMETER_DISPLAY_TYPE,
          filename: video.filename,
          original_name: video.original_name,
          storage_path: video.url || video.filename,
          file_size: video.file_size,
          checksum: video.checksum || '',
          mime_type: 'video/mp4',
          width: dims.width,
          height: dims.height,
          duration: video.duration,
          metadata: { source_video_id: video.id, created_by_bulk: true },
          uploaded_by: req.user?.id || null,
        });
        created.push({ video_id: video.id, variant_id: variant.id });
      } catch (error) {
        // Une vidéo qui échoue ne doit pas annuler les neuf autres : l'opérateur
        // veut avancer, et un rapport partiel vaut mieux qu'un tout-ou-rien.
        const message = error instanceof Error ? error.message : 'Erreur inconnue';
        failed.push({ video_id: candidateId, error: message });
        logger.warn('bulk LED variant: échec sur une vidéo (les autres continuent)', {
          siteId,
          videoId: candidateId,
          error: message,
        });
      }
    }

    logger.info('Bulk LED variants created', {
      siteId,
      total: videoIds.length,
      created: created.length,
      skipped: videoIds.length - candidates.length,
      excluded: excluded.length,
      failed: failed.length,
    });

    res.json({
      total: videoIds.length,
      created: created.length,
      skipped: videoIds.length - candidates.length,
      // Écartées sur le format. Le détail EST le livrable : une exclusion muette se
      // lit comme « tout a été traité », et l'opérateur ne saurait pas qu'il doit
      // déclarer la variante à la main pour une vidéo qu'il destinait au ruban.
      excluded: excluded.length,
      exclusions: excluded,
      failed: failed.length,
      failures: failed,
      variants: created,
    });
  } catch (error) {
    logger.error('Error bulk-creating LED variants:', error);
    res.status(500).json({
      error: 'Erreur lors de la création en masse des variantes LED',
      details: error instanceof Error ? error.message : 'Erreur inconnue',
    });
  }
};

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
