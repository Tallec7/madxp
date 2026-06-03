/**
 * Module `fold()` — pliage d'un ruban LED périmétrique en bandes empilées.
 *
 * Spec : `docs/proposals/PROP-014-led-perimeter-content-pipeline.md` (§2, §11, §13).
 *
 * Le modèle LED périmétrique a 3 couches (PROP-014 §2) :
 *   - Contenu (logique)  : le ruban "déroulé à plat", ex. 13344×160 px.
 *   - Transport (fichier) : le contenu **plié en bandes** à la résolution d'entrée
 *                           du processeur LED, ex. 1920×1120 (7 bandes de 1920×160).
 *   - Physique (mapping)  : le processeur (Novastar/Colorlight) **déplie** les bandes.
 *
 * Ce module produit la **couche transport** : `fold(ruban) → canvas plié`. C'est le
 * seul IP réellement nouveau (PROP-014 §11), pur et unit-testable sans matériel.
 *
 * Deux niveaux :
 *   1. **Géométrie pure** (`computeFoldGeometry`) : à partir de
 *      `(ribbonWidth, ribbonHeight, bandWidth)` calcule `bandCount = ceil(W/bandWidth)`,
 *      les dimensions du canvas plié, et la table `bands[i] = { srcX, srcY, w, h, dstY, … }`
 *      (avec padding de la dernière bande). Aucun I/O.
 *   2. **Application ffmpeg** (`buildFoldFfmpegArgs` + `applyFold`) : transforme un vrai
 *      MP4 plat en MP4 plié via `crop` de N bandes + `vstack` (prototype validé PROP-014).
 *
 * **SPIKE-free** (PROP-014 §13) : le SPIKE matériel (SPIKE-003) ne fournit que la config
 * `canvas_in` (bandWidth, bandCount, ordre) + le mode A/B. Ici tout est paramétrique :
 * remplir les vraies valeurs post-SPIKE ne demande aucune refonte de `fold()`.
 *
 * La décision mode A (plug & play) vs mode B (pixel-perfect) — PROP-014 §10 — est
 * différée post-SPIKE (ADR léger dédié). `fold()` ne produit que la couche transport
 * du mode B ; en mode A on ne plie pas (signal standard). Aucun couplage ici.
 */

import { spawn } from 'child_process';
import Joi from 'joi';
import logger from '../config/logger';

/** Ordre d'empilement des bandes dans le canvas plié. */
export type FoldOrder = 'top-to-bottom' | 'bottom-to-top';

/** Entrée du calcul de géométrie de pliage. */
export interface FoldGeometryInput {
  /** Largeur du ruban "déroulé à plat" (px). Ex. 80 m P6 → 13344. */
  ribbonWidth: number;
  /** Hauteur du ruban = hauteur d'une dalle (px). Ex. 160. */
  ribbonHeight: number;
  /** Largeur d'entrée du processeur = largeur d'une bande (px). Ex. 1920. */
  bandWidth: number;
  /**
   * Hauteur allouée à chaque bande dans le canvas plié (px). Défaut `ribbonHeight`.
   * Permet un *gutter* vertical si le processeur attend des bandes plus hautes que le
   * contenu (`bandHeight > ribbonHeight`). Doit rester ≥ `ribbonHeight`.
   */
  bandHeight?: number;
  /** Ordre d'empilement. Défaut `'top-to-bottom'` (bande 0 = segment gauche, en haut). */
  order?: FoldOrder;
}

/** Une bande : segment horizontal du ruban + sa position cible dans le canvas plié. */
export interface FoldBand {
  /** Index logique le long du ruban (0 = segment le plus à gauche). */
  index: number;
  /** Position x du segment dans le ruban plat. */
  srcX: number;
  /** Position y dans le ruban plat — toujours 0 (le ruban est mono-ligne). */
  srcY: number;
  /** Largeur réelle du contenu de la bande (< bandWidth pour la dernière). */
  w: number;
  /** Hauteur du contenu = `ribbonHeight`. */
  h: number;
  /** Position x cible dans le canvas plié — toujours 0 (aligné à gauche). */
  dstX: number;
  /** Position y cible (haut de la bande) dans le canvas plié. */
  dstY: number;
  /** Padding ajouté à droite pour atteindre `bandWidth` (`bandWidth - w`). */
  padRight: number;
}

/** Résultat complet du calcul de géométrie. */
export interface FoldGeometry {
  ribbonWidth: number;
  ribbonHeight: number;
  bandWidth: number;
  bandHeight: number;
  bandCount: number;
  /** Largeur du canvas plié = `bandWidth`. */
  canvasWidth: number;
  /** Hauteur du canvas plié = `bandCount × bandHeight`. */
  canvasHeight: number;
  order: FoldOrder;
  bands: FoldBand[];
}

/** Options d'assemblage de la commande ffmpeg. */
export interface FoldFfmpegOptions {
  inputPath: string;
  outputPath: string;
  /** Couleur de remplissage du padding (dernière bande / gutter). Défaut `'black'`. */
  padColor?: string;
  /** CRF h264 (qualité). Défaut 18 (cohérent avec le worker studio). */
  crf?: number;
  /** Preset x264. Défaut `'medium'`. */
  preset?: string;
}

/** Résultat d'un `applyFold` réel. */
export interface FoldApplyResult {
  success: boolean;
  outputPath: string | null;
  geometry: FoldGeometry;
  durationMs: number;
  error?: string;
}

// ── Validation Joi ───────────────────────────────────────────────────────────

const positiveInt = Joi.number().integer().positive().required();

const foldGeometrySchema = Joi.object<FoldGeometryInput>({
  ribbonWidth: positiveInt,
  ribbonHeight: positiveInt,
  bandWidth: positiveInt,
  // bandHeight optionnel mais, s'il est fourni, ≥ ribbonHeight (le contenu doit tenir).
  bandHeight: Joi.number().integer().positive().min(Joi.ref('ribbonHeight')).optional(),
  order: Joi.string().valid('top-to-bottom', 'bottom-to-top').optional(),
}).required();

// ── 1. Géométrie pure ─────────────────────────────────────────────────────────

/**
 * Calcule la géométrie de pliage d'un ruban vers un canvas en bandes empilées.
 * Fonction pure (aucun I/O). Valide les entrées via Joi et lève en cas d'invalide.
 *
 * @throws si les dimensions sont non entières / non positives ou `order` inconnu.
 */
export function computeFoldGeometry(input: FoldGeometryInput): FoldGeometry {
  const { error, value } = foldGeometrySchema.validate(input, { convert: false });
  if (error) {
    throw new Error(`computeFoldGeometry: entrée invalide — ${error.message}`);
  }

  const ribbonWidth = value.ribbonWidth;
  const ribbonHeight = value.ribbonHeight;
  const bandWidth = value.bandWidth;
  const bandHeight = value.bandHeight ?? ribbonHeight;
  const order: FoldOrder = value.order ?? 'top-to-bottom';

  const bandCount = Math.ceil(ribbonWidth / bandWidth);
  const canvasWidth = bandWidth;
  const canvasHeight = bandCount * bandHeight;

  const bands: FoldBand[] = [];
  for (let i = 0; i < bandCount; i++) {
    const srcX = i * bandWidth;
    const w = Math.min(bandWidth, ribbonWidth - srcX);
    // En top-to-bottom la bande i est à la i-ème position ; en bottom-to-top on
    // miroir l'empilement vertical (la bande 0 atterrit tout en bas).
    const slot = order === 'top-to-bottom' ? i : bandCount - 1 - i;
    bands.push({
      index: i,
      srcX,
      srcY: 0,
      w,
      h: ribbonHeight,
      dstX: 0,
      dstY: slot * bandHeight,
      padRight: bandWidth - w,
    });
  }

  return {
    ribbonWidth,
    ribbonHeight,
    bandWidth,
    bandHeight,
    bandCount,
    canvasWidth,
    canvasHeight,
    order,
    bands,
  };
}

// ── 1b. Profil LED → ruban déroulé ────────────────────────────────────────────

/** Entrée du calcul des dimensions du ruban depuis le profil LED (PROP-014 §3). */
export interface RibbonDimensionsInput {
  /** Longueurs des côtés du périmètre, en mètres. */
  sides: number[];
  /** Pas de pixel en mm (P6 → 6). */
  pitchMm: number;
  /** Hauteur de dalle (px). */
  height: number;
}

export interface RibbonDimensions {
  ribbonWidth: number;
  ribbonHeight: number;
  /** Densité linéaire = 1000 / pitch_mm (px/m). */
  pxPerMeter: number;
}

const ribbonSchema = Joi.object<RibbonDimensionsInput>({
  sides: Joi.array().items(Joi.number().positive().max(500)).min(1).max(8).required(),
  pitchMm: Joi.number().positive().max(100).required(),
  height: Joi.number().integer().positive().max(2000).required(),
}).required();

/**
 * Dimensions du ruban déroulé à plat (couche contenu, PROP-014 §2).
 * `ribbonWidth = Σ côtés (m) × (1000 / pitch_mm)`.
 *
 * **Source de vérité de la formule.** La composition Remotion
 * `templates-studio/templates/led_perimeter_ribbon` la duplique (frontière de
 * bundle : la compo est webpack-bundlée à part et ne peut pas importer `src/`) —
 * tout changement ici doit y être répercuté.
 *
 * @throws si l'entrée est invalide (Joi).
 */
export function computeRibbonDimensions(input: RibbonDimensionsInput): RibbonDimensions {
  const { error, value } = ribbonSchema.validate(input, { convert: false });
  if (error) {
    throw new Error(`computeRibbonDimensions: entrée invalide — ${error.message}`);
  }
  const pxPerMeter = 1000 / value.pitchMm;
  const sumSides = value.sides.reduce((a, b) => a + b, 0);
  return {
    ribbonWidth: Math.round(sumSides * pxPerMeter),
    ribbonHeight: value.height,
    pxPerMeter,
  };
}

// ── 1b-bis. Pliage PAR CÔTÉ (ADR-135) ─────────────────────────────────────────

/** Entrée du pliage par côté (zones = 'per-side'). */
export interface PerSideFoldInput {
  /** Longueurs des côtés (m). 1 à 8. */
  sides: number[];
  /** Pas de pixel en mm (P6 → 6). */
  pitchMm: number;
  /** Hauteur de dalle (px) = ribbonHeight. */
  height: number;
  /** Largeur d'entrée processeur = largeur d'une bande (px). Ex. 1920. */
  bandWidth: number;
  /** Hauteur allouée par bande (px). Défaut `height`. ≥ height. */
  bandHeight?: number;
  /** Ordre d'empilement DANS le bloc d'un côté. Défaut `'top-to-bottom'`. */
  order?: FoldOrder;
}

/** Bloc de bandes d'UN côté dans le canvas plié global. */
export interface PerSideFoldSegment {
  /** Index 0-based du côté (= index dans `sides`). */
  sideIndex: number;
  /** Largeur du ruban déroulé de CE côté (px) = côté(m) × 1000/pitch_mm. */
  ribbonWidth: number;
  /** Nombre de bandes de CE côté = ceil(ribbonWidth / bandWidth). */
  bandCount: number;
  /** Y (px) du haut du bloc de ce côté dans le canvas global. */
  dstYStart: number;
  /** Bandes du côté — `srcX` local au ruban du côté, `dstY` global au canvas. */
  bands: FoldBand[];
}

/** Géométrie complète d'un pliage par côté. */
export interface PerSideFoldGeometry {
  ribbonHeight: number;
  bandWidth: number;
  bandHeight: number;
  /** Total de bandes = Σ bandes de chaque côté. */
  bandCount: number;
  /** Largeur du canvas plié = `bandWidth`. */
  canvasWidth: number;
  /** Hauteur du canvas plié = `bandCount × bandHeight`. */
  canvasHeight: number;
  order: FoldOrder;
  segments: PerSideFoldSegment[];
}

const perSideFoldSchema = Joi.object<PerSideFoldInput>({
  sides: Joi.array().items(Joi.number().positive().max(500)).min(1).max(8).required(),
  pitchMm: Joi.number().positive().max(100).required(),
  height: Joi.number().integer().positive().max(2000).required(),
  bandWidth: Joi.number().integer().positive().max(7680).required(),
  bandHeight: Joi.number().integer().positive().min(Joi.ref('height')).optional(),
  order: Joi.string().valid('top-to-bottom', 'bottom-to-top').optional(),
}).required();

/**
 * Plie le périmètre **côté par côté** (ADR-135) : chaque côté est déroulé puis plié
 * indépendamment (`computeFoldGeometry`), et les blocs de bandes sont empilés dans
 * l'ordre des côtés. Chaque côté est ainsi un **bloc de bandes contigu** → le
 * contenu d'un côté n'est jamais coupé par un angle, et un contenu/cadence par
 * côté devient trivial (étape suivante : composer chaque bloc avec sa source).
 *
 * Diffère du pliage continu (`computeRibbonDimensions` + `computeFoldGeometry`),
 * qui somme d'abord les côtés : ici on paie un peu de padding par côté (chaque
 * côté arrondit à la bande entière) contre l'alignement aux angles + le zonage.
 *
 * Fonction pure (aucun I/O). `dstY` des bandes est **global** au canvas.
 * @throws si l'entrée est invalide (Joi).
 */
export function computeFoldGeometryPerSide(input: PerSideFoldInput): PerSideFoldGeometry {
  const { error, value } = perSideFoldSchema.validate(input, { convert: false });
  if (error) {
    throw new Error(`computeFoldGeometryPerSide: entrée invalide — ${error.message}`);
  }

  const pxPerMeter = 1000 / value.pitchMm;
  const bandHeight = value.bandHeight ?? value.height;
  const order: FoldOrder = value.order ?? 'top-to-bottom';

  const segments: PerSideFoldSegment[] = [];
  let cumulativeBands = 0;

  value.sides.forEach((sideMeters, sideIndex) => {
    const ribbonWidth = Math.round(sideMeters * pxPerMeter);
    const sideGeom = computeFoldGeometry({
      ribbonWidth,
      ribbonHeight: value.height,
      bandWidth: value.bandWidth,
      bandHeight,
      order,
    });
    const dstYStart = cumulativeBands * bandHeight;
    // Décale les bandes du côté dans le canvas global (dstY relatif → absolu).
    const bands: FoldBand[] = sideGeom.bands.map((b) => ({ ...b, dstY: b.dstY + dstYStart }));
    segments.push({
      sideIndex,
      ribbonWidth,
      bandCount: sideGeom.bandCount,
      dstYStart,
      bands,
    });
    cumulativeBands += sideGeom.bandCount;
  });

  return {
    ribbonHeight: value.height,
    bandWidth: value.bandWidth,
    bandHeight,
    bandCount: cumulativeBands,
    canvasWidth: value.bandWidth,
    canvasHeight: cumulativeBands * bandHeight,
    order,
    segments,
  };
}

// ── 1c. Validateur de format à l'upload ───────────────────────────────────────

/**
 * Verdict du validateur de format (PROP-014 §6). Le validateur juge le FORMAT,
 * jamais la source — il n'est JAMAIS bloquant.
 *  - `exact`        : dimensions = profil → on plie directement.
 *  - `resize`       : même ratio, autre taille → redimensionne + plie.
 *  - `incompatible` : ratio incompatible → note informative (blocs/espaces au pliage).
 *  - `unknown`      : dimensions de la vidéo inconnues → impossible de juger.
 */
export type LedFormatVerdict = 'exact' | 'resize' | 'incompatible' | 'unknown';

export interface LedFormatInput {
  /** Dimensions de la vidéo uploadée (px). `null` si inconnues. */
  videoWidth: number | null;
  videoHeight: number | null;
  /** Dimensions du ruban cible dérivées du profil LED. */
  ribbonWidth: number;
  ribbonHeight: number;
  /** Tolérance d'écart de ratio (fraction). Défaut 0.02 (2 %). */
  ratioTolerance?: number;
}

export interface LedFormatNotice {
  verdict: LedFormatVerdict;
  /** Message FR informatif (jamais une erreur bloquante). */
  message: string;
  ribbonWidth: number;
  ribbonHeight: number;
  videoWidth: number | null;
  videoHeight: number | null;
}

/**
 * Valide le format d'une vidéo LED contre le ruban cible (PROP-014 §6).
 * Fonction pure, non bloquante : retourne toujours un verdict + un message.
 */
export function validateLedFormat(input: LedFormatInput): LedFormatNotice {
  const { videoWidth, videoHeight, ribbonWidth, ribbonHeight } = input;
  const tol = input.ratioTolerance ?? 0.02;

  const base = { ribbonWidth, ribbonHeight, videoWidth, videoHeight };

  if (
    videoWidth == null ||
    videoHeight == null ||
    !Number.isFinite(videoWidth) ||
    !Number.isFinite(videoHeight) ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) {
    return {
      ...base,
      verdict: 'unknown',
      message:
        'Dimensions de la vidéo inconnues — impossible de vérifier le format. Le pliage reste possible.',
    };
  }

  if (videoWidth === ribbonWidth && videoHeight === ribbonHeight) {
    return {
      ...base,
      verdict: 'exact',
      message: `Format exact (${ribbonWidth}×${ribbonHeight}) — pliage direct.`,
    };
  }

  const ribbonAR = ribbonWidth / ribbonHeight;
  const videoAR = videoWidth / videoHeight;
  const sameRatio = Math.abs(videoAR - ribbonAR) / ribbonAR <= tol;

  if (sameRatio) {
    return {
      ...base,
      verdict: 'resize',
      message: `Même ratio que le ruban (${videoWidth}×${videoHeight} → ${ribbonWidth}×${ribbonHeight}) — redimensionnement puis pliage.`,
    };
  }

  return {
    ...base,
    verdict: 'incompatible',
    message: `Ratio incompatible (vidéo ${videoWidth}×${videoHeight} ≈ ${videoAR.toFixed(1)}:1 vs ruban ${ribbonWidth}×${ribbonHeight} ≈ ${ribbonAR.toFixed(1)}:1) → blocs/espaces au pliage. Pour un plein-cadre, refais la créa au format ruban ou via le studio.`,
  };
}

// ── 2. Application ffmpeg ──────────────────────────────────────────────────────

/**
 * Construit le `filter_complex` ffmpeg qui plie le ruban : split du flux en N,
 * `crop` de chaque bande, `pad` à `bandWidth × bandHeight`, puis `vstack` dans
 * l'ordre `dstY`. Fonction pure (string) — testable sans ffmpeg.
 *
 * Cas 1 bande : pas de split ni vstack, simple `crop` + `pad`.
 */
export function buildFoldFilterGraph(
  geometry: FoldGeometry,
  padColor = 'black',
  sourceLabel = '[0:v]'
): string {
  const { bands, bandWidth, bandHeight, bandCount } = geometry;

  const cropPad = (b: FoldBand): string =>
    `crop=${b.w}:${b.h}:${b.srcX}:${b.srcY},pad=${bandWidth}:${bandHeight}:${b.dstX}:0:${padColor}`;

  if (bandCount === 1) {
    return `${sourceLabel}${cropPad(bands[0])}[out]`;
  }

  // Split du flux source en autant de copies que de bandes.
  const splitOutputs = bands.map((_, i) => `[s${i}]`).join('');
  const parts: string[] = [`${sourceLabel}split=${bandCount}${splitOutputs}`];

  // Une chaîne crop+pad par bande → label [b<index>].
  for (const b of bands) {
    parts.push(`[s${b.index}]${cropPad(b)}[b${b.index}]`);
  }

  // Empile les bandes du haut (dstY=0) vers le bas. On trie par dstY croissant et
  // on liste les labels dans cet ordre pour `vstack` (qui empile dans l'ordre fourni).
  const stackOrder = [...bands].sort((a, b) => a.dstY - b.dstY);
  const vstackInputs = stackOrder.map((b) => `[b${b.index}]`).join('');
  parts.push(`${vstackInputs}vstack=inputs=${bandCount}[out]`);

  return parts.join(';');
}

/**
 * Mode d'adaptation d'une vidéo club au ruban avant pliage (PROP-014 §6).
 *  - `contain` : tient dans le ruban en préservant le ratio + padding (blocs/espaces).
 *  - `cover`   : remplit le ruban en préservant le ratio + crop (déborde).
 *  - `stretch` : étire au ratio du ruban (déforme).
 */
export type LedExportFit = 'contain' | 'cover' | 'stretch';

/**
 * Mappe la mise en page de la variante (`video_variants.layout`) vers un mode
 * d'adaptation ffmpeg. `stretched` → `stretch` ; tout le reste → `contain` (le
 * tiling `repeated` et le `scrolling` animé relèvent de la compo studio, ADR-134).
 */
export function fitFromLayout(layout: string | null | undefined): LedExportFit {
  return layout === 'stretched' ? 'stretch' : 'contain';
}

/**
 * Clause ffmpeg `scale`/`pad` adaptant une source quelconque aux dimensions du ruban.
 * Pure (string). `setsar=1` normalise le sample aspect ratio (anti-déformation).
 */
function ribbonFitClause(
  ribbonWidth: number,
  ribbonHeight: number,
  fit: LedExportFit,
  padColor: string
): string {
  const W = ribbonWidth;
  const H = ribbonHeight;
  switch (fit) {
    case 'stretch':
      return `scale=${W}:${H},setsar=1`;
    case 'cover':
      return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
    case 'contain':
    default:
      return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${padColor},setsar=1`;
  }
}

/**
 * Filter graph d'EXPORT : adapte d'abord la source au ruban (scale/pad selon `fit`),
 * puis plie. Permet d'exporter la vidéo finie d'un club (taille quelconque) vers le
 * canvas plié, sans intermédiaire géant côté Chromium (le pliage est ffmpeg pur).
 * Fonction pure (string) — testable sans ffmpeg.
 */
export function buildFoldExportFilterGraph(
  geometry: FoldGeometry,
  fit: LedExportFit = 'contain',
  padColor = 'black'
): string {
  const fitClause = ribbonFitClause(geometry.ribbonWidth, geometry.ribbonHeight, fit, padColor);
  const foldGraph = buildFoldFilterGraph(geometry, padColor, '[rib]');
  return `[0:v]${fitClause}[rib];${foldGraph}`;
}

/**
 * Mise en page LED périmétrique réelle (PROP-014 §4) — comment la source remplit
 * le ruban AVANT pliage. C'est ce qui rend le rendu cohérent (un logo se RÉPÈTE le
 * long du bord, il ne reste pas une mini-image perdue au centre).
 *  - `repeated`  : motif scalé à la hauteur du ruban, pavé tous les `spacingPx`.
 *  - `scrolling` : pavé idem, mais qui défile horizontalement (animé).
 *  - `stretched` : source étirée au ratio du ruban (déforme).
 *  - `centered`  : une seule copie centrée + padding (cas « vidéo déjà ruban »).
 */
export type LedExportLayout = 'repeated' | 'scrolling' | 'stretched' | 'centered';

/** Vitesse de défilement (px/s) pour `scrolling`. */
const SCROLL_SPEED_PX_PER_SEC = 120;

/** Normalise une valeur de `video_variants.layout` (ou input UI) vers un layout d'export. */
export function normalizeLayout(layout: string | null | undefined): LedExportLayout {
  switch (layout) {
    case 'scrolling':
      return 'scrolling';
    case 'stretched':
      return 'stretched';
    case 'centered':
      return 'centered';
    case 'repeated':
    default:
      // Défaut produit bord-de-terrain = motif répété (logos sponsors).
      return 'repeated';
  }
}

/**
 * Construit la chaîne ffmpeg `[0:v]…[rib]` qui remplit le ruban (W×H) selon le layout.
 * Pour `repeated`/`scrolling` : fabrique une cellule de `cellPx×H` (motif scalé à la
 * hauteur + centré), la pave horizontalement (split+hstack), puis crop à W (+ scroll).
 * Pure (string).
 */
function buildRibbonClause(
  W: number,
  H: number,
  layout: LedExportLayout,
  cellPx: number,
  padColor: string
): string {
  const cw = Math.max(1, Math.round(cellPx));
  const cell = `scale=${cw}:${H}:force_original_aspect_ratio=decrease,pad=${cw}:${H}:(ow-iw)/2:(oh-ih)/2:${padColor},setsar=1`;

  switch (layout) {
    case 'stretched':
      return `[0:v]scale=${W}:${H},setsar=1[rib]`;
    case 'centered':
      return `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${padColor},setsar=1[rib]`;
    case 'scrolling': {
      // Une cellule de marge en plus pour un wrap sans couture (contenu périodique).
      const n = Math.max(2, Math.ceil(W / cw) + 1);
      const labels = Array.from({ length: n }, (_, i) => `[c${i}]`).join('');
      // crop positionnel w:h:x:y ; x = expression de défilement. La virgule de
      // `mod(…,…)` est protégée par les quotes simples (sinon = séparateur de filtre).
      return (
        `[0:v]${cell},split=${n}${labels};` +
        `${labels}hstack=inputs=${n}[strip];` +
        `[strip]crop=${W}:${H}:'mod(t*${SCROLL_SPEED_PX_PER_SEC},${cw})':0,setsar=1[rib]`
      );
    }
    case 'repeated':
    default: {
      // +1 cellule de marge : garantit que le strip pavé dépasse W (robuste aux
      // arrondis de scale/pad), on crop ensuite à la largeur exacte du ruban.
      const n = Math.max(2, Math.ceil(W / cw) + 1);
      const labels = Array.from({ length: n }, (_, i) => `[c${i}]`).join('');
      return `[0:v]${cell},split=${n}${labels};${labels}hstack=inputs=${n},crop=${W}:${H}:0:0[rib]`;
    }
  }
}

/**
 * Filter graph d'export piloté par la MISE EN PAGE (pavage réel), puis pliage.
 * `cellPx` = cadence du motif en px (= espacement_m × px/m du profil).
 * Pure (string) — testable sans ffmpeg.
 */
export function buildFoldExportLayoutGraph(
  geometry: FoldGeometry,
  layout: LedExportLayout,
  cellPx: number,
  padColor = 'black'
): string {
  const ribbon = buildRibbonClause(geometry.ribbonWidth, geometry.ribbonHeight, layout, cellPx, padColor);
  const foldGraph = buildFoldFilterGraph(geometry, padColor, '[rib]');
  return `${ribbon};${foldGraph}`;
}

/**
 * Assemble les arguments ffmpeg complets pour produire le MP4 plié.
 * Fonction pure (string[]) — testable sans spawn.
 */
export function buildFoldFfmpegArgs(
  geometry: FoldGeometry,
  options: FoldFfmpegOptions,
): string[] {
  const padColor = options.padColor ?? 'black';
  const crf = options.crf ?? 18;
  const preset = options.preset ?? 'medium';
  const filterGraph = buildFoldFilterGraph(geometry, padColor);

  return [
    '-i',
    options.inputPath,
    '-filter_complex',
    filterGraph,
    '-map',
    '[out]',
    '-c:v',
    'libx264',
    '-crf',
    String(crf),
    '-preset',
    preset,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an', // ruban LED = pas d'audio
    '-y',
    options.outputPath,
  ];
}

/** Options d'export (adapte la source au ruban avant pliage). */
export interface FoldExportOptions extends FoldFfmpegOptions {
  /** Mode d'adaptation source → ruban (legacy). Défaut `'contain'`. */
  fit?: LedExportFit;
  /** Mise en page réelle (pavage). Si fournie, prend le pas sur `fit`. */
  layout?: LedExportLayout;
  /** Cadence du motif en px (= espacement_m × px/m). Requis pour `repeated`/`scrolling`. */
  cellPx?: number;
}

/**
 * Assemble les arguments ffmpeg d'EXPORT (mise en page → ruban puis pliage).
 * Fonction pure (string[]). Pour la vidéo finie d'un club (taille quelconque).
 */
export function buildFoldExportFfmpegArgs(
  geometry: FoldGeometry,
  options: FoldExportOptions
): string[] {
  const padColor = options.padColor ?? 'black';
  const crf = options.crf ?? 18;
  const preset = options.preset ?? 'medium';
  // Mise en page réelle si fournie (pavage), sinon fallback legacy `fit`.
  const filterGraph = options.layout
    ? buildFoldExportLayoutGraph(geometry, options.layout, options.cellPx ?? geometry.ribbonWidth, padColor)
    : buildFoldExportFilterGraph(geometry, options.fit ?? 'contain', padColor);

  return [
    '-i',
    options.inputPath,
    '-filter_complex',
    filterGraph,
    '-map',
    '[out]',
    '-c:v',
    'libx264',
    '-crf',
    String(crf),
    '-preset',
    preset,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    '-y',
    options.outputPath,
  ];
}

/** Vérifie que ffmpeg est disponible (même sonde que `video-compression.service.ts`). */
export function isFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version']);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Applique le pliage à un vrai MP4 plat → MP4 plié. Encapsule le spawn ffmpeg
 * construit à partir de la table de mapping (`buildFoldFfmpegArgs`).
 *
 * La géométrie peut être fournie directement (déjà calculée) ou dérivée d'un
 * `FoldGeometryInput`.
 */
export async function applyFold(
  geometryOrInput: FoldGeometry | FoldGeometryInput,
  options: FoldFfmpegOptions,
): Promise<FoldApplyResult> {
  const startTime = Date.now();
  const geometry = isFoldGeometry(geometryOrInput)
    ? geometryOrInput
    : computeFoldGeometry(geometryOrInput);

  const args = buildFoldFfmpegArgs(geometry, options);

  logger.info('led-fold: applying fold', {
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    bandCount: geometry.bandCount,
    canvasWidth: geometry.canvasWidth,
    canvasHeight: geometry.canvasHeight,
    order: geometry.order,
  });

  try {
    await runFfmpeg(args);
    const durationMs = Date.now() - startTime;
    logger.info('led-fold: fold completed', {
      outputPath: options.outputPath,
      durationMs,
    });
    return { success: true, outputPath: options.outputPath, geometry, durationMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('led-fold: fold failed', { error: message, inputPath: options.inputPath });
    return {
      success: false,
      outputPath: null,
      geometry,
      durationMs: Date.now() - startTime,
      error: message,
    };
  }
}

/**
 * Exporte une vidéo source quelconque vers le canvas plié : adapte au ruban (fit)
 * puis plie, en une passe ffmpeg. C'est la voie d'export de la vidéo finie d'un club
 * (PROP-014 §6, ADR-134) — le studio, lui, rend directement plié via Remotion.
 */
export async function applyFoldExport(
  geometryOrInput: FoldGeometry | FoldGeometryInput,
  options: FoldExportOptions
): Promise<FoldApplyResult> {
  const startTime = Date.now();
  const geometry = isFoldGeometry(geometryOrInput)
    ? geometryOrInput
    : computeFoldGeometry(geometryOrInput);

  const args = buildFoldExportFfmpegArgs(geometry, options);

  logger.info('led-fold: applying fold export', {
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    layout: options.layout ?? `fit:${options.fit ?? 'contain'}`,
    cellPx: options.cellPx,
    ribbonWidth: geometry.ribbonWidth,
    bandCount: geometry.bandCount,
    canvasWidth: geometry.canvasWidth,
    canvasHeight: geometry.canvasHeight,
  });

  try {
    await runFfmpeg(args);
    const durationMs = Date.now() - startTime;
    logger.info('led-fold: fold export completed', { outputPath: options.outputPath, durationMs });
    return { success: true, outputPath: options.outputPath, geometry, durationMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('led-fold: fold export failed', { error: message, inputPath: options.inputPath });
    return {
      success: false,
      outputPath: null,
      geometry,
      durationMs: Date.now() - startTime,
      error: message,
    };
  }
}

function isFoldGeometry(v: FoldGeometry | FoldGeometryInput): v is FoldGeometry {
  return Array.isArray((v as FoldGeometry).bands);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('error', (err) => reject(new Error(`ffmpeg process error: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}

// Pattern singleton — regroupe les helpers purs + l'application réelle.
export const ledFoldService = {
  computeFoldGeometry,
  computeFoldGeometryPerSide,
  computeRibbonDimensions,
  validateLedFormat,
  fitFromLayout,
  normalizeLayout,
  buildFoldFilterGraph,
  buildFoldFfmpegArgs,
  buildFoldExportFilterGraph,
  buildFoldExportLayoutGraph,
  buildFoldExportFfmpegArgs,
  isFfmpegAvailable,
  applyFold,
  applyFoldExport,
};

export default ledFoldService;
