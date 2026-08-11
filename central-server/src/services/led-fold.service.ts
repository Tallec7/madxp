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
import { createHash } from 'crypto';
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

/**
 * Borne physique de l'entrée processeur (px). Un Novastar/Colorlight n'accepte pas
 * un signal plus large ; au-delà, le côté doit être découpé en plusieurs bandes —
 * c'est le rôle du pliage. Sert de plafond au dérivé et de dernier recours quand le
 * terrain n'est pas encore saisi.
 */
export const MAX_LED_BAND_WIDTH = 1920;

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

// ── 1b-ter. Canvas du SITE — source de vérité unique (ADR-138) ────────────────

/** Profil LED d'un site, tel qu'il vit dans `sites.displays[].led`. */
export interface SiteLedProfile {
  sides: number[];
  /** Libellé pitch (`'P6'`) ou millimètres. */
  pitch: string | number;
  height: number;
  canvas_in?: { band_width?: number; band_count?: number; order?: FoldOrder } | null;
}

export interface SiteCanvas {
  geometry: PerSideFoldGeometry;
  /** Nb de bandes DÉRIVÉ de la géométrie du terrain. */
  derivedBandCount: number;
  /** Nb de bandes figé par un installateur, s'il y en a un. */
  confirmedBandCount: number | null;
  /**
   * `true` quand l'installateur a figé une valeur qui ne correspond PLUS au
   * dérivé. Vaut avertissement, jamais correction silencieuse : la valeur figée
   * décrit ce qui est gravé dans le processeur, on ne l'écrase pas dans son dos.
   */
  confirmedIsStale: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

/** Millimètres depuis un pitch `'P6.25'` ou `6.25`. `0` si illisible. */
export function parsePitchMm(pitch: string | number): number {
  const mm = typeof pitch === 'number' ? pitch : parseFloat(String(pitch).replace(/^P/i, ''));
  return Number.isFinite(mm) && mm > 0 ? mm : 0;
}

/**
 * Canvas processeur d'un site — **toujours plié par côté** (ADR-138).
 *
 * C'est LE point d'entrée unique. Avant, la géométrie était choisie par le
 * CONTENU (`side_files.length > 0` → par côté, sinon somme continue), ce qui
 * donnait deux canvas différents pour le même club — 7 bandes ou 8. Or un
 * processeur est gravé une fois à l'installation : émettre tantôt l'un tantôt
 * l'autre rend le second immappable.
 *
 * Le par-côté est le sur-ensemble : « uniforme » redevient une notion de
 * CONTENU (le même fichier sur tous les côtés), plus une géométrie concurrente.
 * Bonus, le contenu cesse de traverser les angles — les coupes tombent enfin
 * sur les côtés et non tous les `band_width` px.
 *
 * @throws si le profil est incomplet (pas de côtés, pitch illisible).
 */
export function computeSiteCanvas(profile: SiteLedProfile): SiteCanvas {
  if (!Array.isArray(profile.sides) || profile.sides.length === 0) {
    throw new Error('computeSiteCanvas: profil LED sans côtés');
  }
  const pitchMm = parsePitchMm(profile.pitch);
  if (pitchMm === 0) {
    throw new Error(`computeSiteCanvas: pitch illisible — ${String(profile.pitch)}`);
  }

  // Largeur d'entrée : figée à l'install si l'installateur l'a relevée, sinon DÉRIVÉE
  // du plus long côté — puisque le pliage met chaque côté dans son bloc de bandes.
  // 1920 en dur était un pari sur « une sortie HDMI standard » : chez Piraths
  // (10 m en P6.25 → 1600 px/côté), il ajoutait 320 px de noir par bande et décalait
  // tout face à un processeur gravé pour 1600. Plafonné, car au-delà aucun processeur
  // n'accepte le signal — le pliage prend alors le relais et découpe le côté.
  const bandWidth =
    profile.canvas_in?.band_width ??
    Math.min(MAX_LED_BAND_WIDTH, Math.round(Math.max(...profile.sides) * (1000 / pitchMm)));
  const geometry = computeFoldGeometryPerSide({
    sides: profile.sides,
    pitchMm,
    height: profile.height,
    bandWidth,
    order: profile.canvas_in?.order,
  });

  const confirmed = profile.canvas_in?.band_count ?? null;
  return {
    geometry,
    derivedBandCount: geometry.bandCount,
    confirmedBandCount: confirmed,
    confirmedIsStale: confirmed !== null && confirmed !== geometry.bandCount,
    canvasWidth: geometry.canvasWidth,
    canvasHeight: geometry.canvasHeight,
  };
}

/**
 * Empreinte d'un canvas plié — la clé de cache de l'étape D (ADR-139).
 *
 * Un canvas plié n'est valable que pour UNE géométrie et UNE source. Le jour où
 * l'opérateur corrige la hauteur d'un ruban de 100 à 75 cm, tous les canvas
 * fabriqués avant deviennent faux — et rien ne le signalerait.
 *
 * En faisant de la géométrie ET de la source la clé de cache, l'invalidation
 * devient **automatique** : un profil modifié produit une autre empreinte, donc
 * un cache manquant, donc une refabrication. Aucune logique d'invalidation à
 * maintenir, donc aucune à oublier.
 *
 * Inclut le `layout` : le même fichier plié en « Centré » et en « Répété » ne
 * donne pas la même image.
 *
 * Inclut le `crop` (PROP-015) pour la même raison, et c'est ce qui rend la
 * validation d'un détourage immédiatement effective : les canvas fabriqués AVANT
 * la validation ont été pliés sur le fichier entier, marges comprises. Sans le
 * `crop` dans l'empreinte ils resteraient servis — indéfiniment, puisqu'il n'y a
 * pas de TTL — et l'opérateur verrait son détourage validé sans effet.
 */
export function computeFoldedCanvasHash(input: {
  sides: number[];
  pitch: string | number;
  height: number;
  bandWidth: number;
  order?: FoldOrder;
  /** Chemin FTP de la source — un remplacement de vidéo doit invalider. */
  sourcePath: string;
  layout?: string | null;
  /** Détourage validé, en px de la source. `null`/omis = fichier entier. */
  crop?: { x: number; y: number; w: number; h: number } | null;
}): string {
  const payload = [
    input.sides.join(','),
    parsePitchMm(input.pitch),
    input.height,
    input.bandWidth,
    input.order ?? 'top-to-bottom',
    input.sourcePath,
    input.layout ?? 'default',
    input.crop ? `${input.crop.x},${input.crop.y},${input.crop.w},${input.crop.h}` : 'nocrop',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
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
 * Arrondit à l'entier pair supérieur. Sur une source `yuv420p` (chroma 4:2:0),
 * `scale=…:decrease` peut produire une dimension 1px plus grande qu'une cible
 * impaire littérale (arrondi interne swscale contraint par le sous-échantillonnage
 * chroma) — le `pad` qui suit refuse alors l'entrée avec "Padded dimensions cannot
 * be smaller than input dimensions" (incident banc d'essai LED 2026-07-23).
 * Utiliser cette valeur à la fois pour la boîte de `scale` et la cible de `pad`
 * élimine l'écart : `decrease` borne toujours le résultat par la boîte fournie,
 * donc `pad` (même boîte) ne peut jamais recevoir plus grand que sa cible. Les
 * consommateurs en aval (crop par bande) retaillent de toute façon à la valeur
 * odd d'origine, donc ce léger agrandissement interne est invisible en sortie.
 */
function evenUp(n: number): number {
  return n % 2 === 0 ? n : n + 1;
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
    default: {
      const ew = evenUp(W);
      const eh = evenUp(H);
      return `scale=${ew}:${eh}:force_original_aspect_ratio=decrease,pad=${ew}:${eh}:(ow-iw)/2:(oh-ih)/2:${padColor},setsar=1`;
    }
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
  padColor: string,
  /** Label d'entrée. `[0:v]` en mono-source, `[i:v]` pour le côté `i`. */
  inLabel = '[0:v]',
  /** Label de sortie. `[rib]` en mono-source, `[ribI]` pour le côté `i`. */
  outLabel = '[rib]',
  /** Préfixe des labels internes — sans lui, deux côtés collisionnent sur `[c0]`. */
  ns = ''
): string {
  const cw = Math.max(1, Math.round(cellPx));
  const ecw = evenUp(cw);
  const eH = evenUp(H);
  // La cadence (cw) et le crop final (H) restent basés sur les valeurs nominales
  // (spacing réel du profil LED) — seule la boîte scale/pad interne est agrandie
  // au pair pour éviter le mismatch decrease/pad (cf. evenUp).
  const cell = `scale=${ecw}:${eH}:force_original_aspect_ratio=decrease,pad=${ecw}:${eH}:(ow-iw)/2:(oh-ih)/2:${padColor},setsar=1`;

  switch (layout) {
    case 'stretched':
      return `${inLabel}scale=${W}:${H},setsar=1${outLabel}`;
    case 'centered': {
      const ew = evenUp(W);
      const eh = evenUp(H);
      return `${inLabel}scale=${ew}:${eh}:force_original_aspect_ratio=decrease,pad=${ew}:${eh}:(ow-iw)/2:(oh-ih)/2:${padColor},setsar=1${outLabel}`;
    }
    case 'scrolling': {
      // Une cellule de marge en plus pour un wrap sans couture (contenu périodique).
      const n = Math.max(2, Math.ceil(W / cw) + 1);
      const labels = Array.from({ length: n }, (_, i) => `[${ns}c${i}]`).join('');
      // crop positionnel w:h:x:y ; x = expression de défilement. La virgule de
      // `mod(…,…)` est protégée par les quotes simples (sinon = séparateur de filtre).
      return (
        `${inLabel}${cell},split=${n}${labels};` +
        `${labels}hstack=inputs=${n}[${ns}strip];` +
        `[${ns}strip]crop=${W}:${H}:'mod(t*${SCROLL_SPEED_PX_PER_SEC},${cw})':0,setsar=1${outLabel}`
      );
    }
    case 'repeated':
    default: {
      // +1 cellule de marge : garantit que le strip pavé dépasse W (robuste aux
      // arrondis de scale/pad), on crop ensuite à la largeur exacte du ruban.
      const n = Math.max(2, Math.ceil(W / cw) + 1);
      const labels = Array.from({ length: n }, (_, i) => `[${ns}c${i}]`).join('');
      return `${inLabel}${cell},split=${n}${labels};${labels}hstack=inputs=${n},crop=${W}:${H}:0:0${outLabel}`;
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

// ── 2b. Composition multi-sources par côté (ADR-135, étape 3) ─────────────────

/** Rectangle de détourage appliqué à une source AVANT toute mise à l'échelle (PROP-015). */
export interface SourceCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Options de composition par côté : une source par côté (ordre = index de côté). */
export interface PerSideFoldComposeOptions {
  /** Chemins des sources, un par côté. `inputs[i]` = vidéo du côté `i`. */
  inputs: string[];
  /**
   * Détourage VALIDÉ de chaque source (PROP-015), aligné sur `inputs`.
   * `null`/omis = on plie le fichier entier, marges comprises (comportement d'origine).
   */
  crops?: Array<SourceCrop | null>;
  outputPath: string;
  /** Couleur de remplissage (padding dernière bande de chaque côté). Défaut `'black'`. */
  padColor?: string;
  /** Mise en page de chaque source dans le ruban de son côté. Défaut `'stretched'` (v1). */
  layout?: LedExportLayout;
  /** Cadence du motif en px (= espacement_m × px/m). Requis pour repeated/scrolling. */
  cellPx?: number;
  crf?: number;
  preset?: string;
}

/** Résultat d'un `applyPerSideFold`. */
export interface PerSideFoldApplyResult {
  success: boolean;
  outputPath: string | null;
  geometry: PerSideFoldGeometry;
  durationMs: number;
  error?: string;
}

/**
 * Construit le `filter_complex` qui compose **une source par côté** dans le canvas
 * plié (ADR-135, étape 3). Pour chaque côté : la source est adaptée à son ruban
 * (`scale`), pliée en son bloc de bandes (`crop`+`pad`+`vstack`), puis tous les
 * blocs sont empilés (`vstack`) dans l'ordre des côtés. Comme chaque bloc fait
 * `bandWidth` de large et que `dstYStart` est cumulatif, l'empilement vertical
 * reproduit exactement le canvas global. Fonction pure (string) — testable sans ffmpeg.
 *
 * Adaptation source→ruban = étirement (`scale` exact) en v1 ; un `fit` par côté
 * (contain/cover) pourra être ajouté ensuite.
 *
 * `inputIndexBySide` mappe côté → **entrée ffmpeg**. Quand plusieurs côtés
 * partagent le même fichier (le cas courant : un motif répété tout autour), ils
 * pointent la même entrée, et le flux décodé est dupliqué par un `split` au lieu
 * d'être re-décodé. Sans ce mapping (défaut : identité) chaque côté est sa propre
 * entrée — c'est-à-dire un décodeur h264 par côté pour UNE seule vidéo.
 *
 * `crops[i]`, s'il est fourni, retire les marges de la source AVANT la mise à
 * l'échelle (PROP-015) — l'ordre compte : détourer après aurait déjà écrasé le
 * bandeau utile en un trait. Le détourage s'applique APRÈS le `split` ci-dessus,
 * donc par côté : deux côtés partageant une entrée peuvent avoir des cadrages
 * distincts sans forcer un second décodage.
 */
export function buildPerSideFoldFilterGraph(
  geometry: PerSideFoldGeometry,
  padColor = 'black',
  layout: LedExportLayout = 'stretched',
  cellPx?: number,
  inputIndexBySide?: number[],
  crops: Array<SourceCrop | null> = []
): string {
  const { segments, ribbonHeight, bandWidth, bandHeight } = geometry;
  const single = segments.length === 1;
  const parts: string[] = [];
  const blockLabels: string[] = [];

  const cropPad = (b: FoldBand): string =>
    `crop=${b.w}:${b.h}:${b.srcX}:0,pad=${bandWidth}:${bandHeight}:0:0:${padColor}`;

  // Quels côtés consomment quelle entrée ffmpeg (ordre d'apparition = déterministe).
  const consumersByInput = new Map<number, number[]>();
  for (const seg of segments) {
    const inputIndex = inputIndexBySide?.[seg.sideIndex] ?? seg.sideIndex;
    const consumers = consumersByInput.get(inputIndex);
    if (consumers) consumers.push(seg.sideIndex);
    else consumersByInput.set(inputIndex, [seg.sideIndex]);
  }

  // Une entrée lue par k côtés est décodée UNE fois puis dupliquée par `split`.
  const sourceLabelBySide = new Map<number, string>();
  for (const [inputIndex, consumers] of consumersByInput) {
    if (consumers.length === 1) {
      sourceLabelBySide.set(consumers[0], `[${inputIndex}:v]`);
      continue;
    }
    const outLabels = consumers.map((_, j) => `[src${inputIndex}_${j}]`);
    parts.push(`[${inputIndex}:v]split=${consumers.length}${outLabels.join('')}`);
    consumers.forEach((sideIndex, j) => sourceLabelBySide.set(sideIndex, outLabels[j]));
  }

  for (const seg of segments) {
    const i = seg.sideIndex;
    const blockLabel = single ? '[out]' : `[block${i}]`;
    // 0) retirer les marges validées de la source, AVANT toute mise à l'échelle.
    //    Sans cette étape, un fichier 4096×1416 dont le bandeau utile ne fait que
    //    306 px de haut est ramené entier à la hauteur du ruban : le visuel devient
    //    un trait dans du noir (PROP-015).
    //    Part de la source DÉDUPLIQUÉE (`sourceLabelBySide`) et non de `[i:v]` :
    //    sinon le détourage rouvrirait un décodeur par côté et annulerait le
    //    partage d'entrée. Label `crop{i}` distinct des `src{n}_{j}` du split.
    const crop = crops[i] ?? null;
    let inLabel = sourceLabelBySide.get(i) ?? `[${i}:v]`;
    if (crop) {
      parts.push(`${inLabel}crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}[crop${i}]`);
      inLabel = `[crop${i}]`;
    }
    // 1) remplir le ruban DE CE CÔTÉ selon la mise en page (pavage réel).
    //    Le motif se répète donc par côté et redémarre à chaque angle, au lieu
    //    d'être pavé sur la somme des côtés puis coupé n'importe où.
    //    `stretched` reproduit exactement le comportement d'origine (étirement v1).
    parts.push(
      buildRibbonClause(
        seg.ribbonWidth,
        ribbonHeight,
        layout,
        cellPx ?? seg.ribbonWidth,
        padColor,
        inLabel,
        `[rib${i}]`,
        `s${i}_`
      )
    );
    // 2) plier le ruban du côté en son bloc de bandes.
    if (seg.bandCount === 1) {
      parts.push(`[rib${i}]${cropPad(seg.bands[0])}${blockLabel}`);
    } else {
      const splitOut = seg.bands.map((_, k) => `[s${i}_${k}]`).join('');
      parts.push(`[rib${i}]split=${seg.bandCount}${splitOut}`);
      seg.bands.forEach((b, k) => parts.push(`[s${i}_${k}]${cropPad(b)}[b${i}_${k}]`));
      // empile les bandes du côté par dstY croissant (ordre vertical du bloc).
      const order = seg.bands
        .map((b, k) => ({ b, k }))
        .sort((a, z) => a.b.dstY - z.b.dstY);
      const vinputs = order.map((o) => `[b${i}_${o.k}]`).join('');
      parts.push(`${vinputs}vstack=inputs=${seg.bandCount}${blockLabel}`);
    }
    blockLabels.push(blockLabel);
  }

  if (!single) {
    parts.push(`${blockLabels.join('')}vstack=inputs=${segments.length}[out]`);
  }

  return parts.join(';');
}

/**
 * Assemble les arguments ffmpeg de composition par côté (N entrées → canvas plié).
 * Fonction pure (string[]). Lève si le nombre de sources ≠ nombre de côtés.
 *
 * **Les sources identiques ne sont ouvertes qu'une fois.** Un `-i` par côté, c'est
 * un décodeur h264 par côté — 4 chez Piraths pour une seule vidéo, alors que les
 * côtés diffusent presque toujours le même motif. Le décodeur est la ressource qui
 * a lâché le 2026-08-11 (« Error while opening decoder : Resource temporarily
 * unavailable »), pas le CPU : les dédupliquer réduit le coût d'un pliage d'un
 * facteur `nombre de côtés` dans le cas courant. Le `split` du filter graph
 * redistribue le flux décodé (cf. `buildPerSideFoldFilterGraph`).
 */
export function buildPerSideFoldComposeArgs(
  geometry: PerSideFoldGeometry,
  options: PerSideFoldComposeOptions
): string[] {
  if (options.inputs.length !== geometry.segments.length) {
    throw new Error(
      `buildPerSideFoldComposeArgs: ${options.inputs.length} source(s) pour ${geometry.segments.length} côté(s)`
    );
  }
  const padColor = options.padColor ?? 'black';
  const crf = options.crf ?? 18;
  const preset = options.preset ?? 'medium';

  // Côté → entrée ffmpeg, en repliant les chemins identiques sur une même entrée.
  const uniqueInputs: string[] = [];
  const inputIndexBySide = options.inputs.map((sourcePath) => {
    const existing = uniqueInputs.indexOf(sourcePath);
    if (existing !== -1) return existing;
    return uniqueInputs.push(sourcePath) - 1;
  });

  const filterGraph = buildPerSideFoldFilterGraph(
    geometry,
    padColor,
    options.layout ?? 'stretched',
    options.cellPx,
    inputIndexBySide,
    options.crops ?? []
  );
  const inputArgs = uniqueInputs.flatMap((p) => ['-i', p]);

  return [
    ...inputArgs,
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

/**
 * Compose une vidéo par côté dans le canvas plié, en une passe ffmpeg (ADR-135).
 * C'est la voie « contenu par côté » : `side_zones[i].video_id` → `inputs[i]`.
 */
export async function applyPerSideFold(
  geometry: PerSideFoldGeometry,
  options: PerSideFoldComposeOptions
): Promise<PerSideFoldApplyResult> {
  const startTime = Date.now();
  const args = buildPerSideFoldComposeArgs(geometry, options);

  logger.info('led-fold: applying per-side fold', {
    outputPath: options.outputPath,
    sides: geometry.segments.length,
    // = nombre de décodeurs ffmpeg ouverts. Écart avec `sides` = sources partagées.
    decoders: new Set(options.inputs).size,
    cropped: (options.crops ?? []).filter(Boolean).length,
    bandCount: geometry.bandCount,
    canvasWidth: geometry.canvasWidth,
    canvasHeight: geometry.canvasHeight,
  });

  try {
    await runFfmpeg(args);
    const durationMs = Date.now() - startTime;
    logger.info('led-fold: per-side fold completed', { outputPath: options.outputPath, durationMs });
    return { success: true, outputPath: options.outputPath, geometry, durationMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('led-fold: per-side fold failed', { error: message });
    return {
      success: false,
      outputPath: null,
      geometry,
      durationMs: Date.now() - startTime,
      error: message,
    };
  }
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
  computeSiteCanvas,
  computeFoldedCanvasHash,
  parsePitchMm,
  computeRibbonDimensions,
  buildPerSideFoldFilterGraph,
  buildPerSideFoldComposeArgs,
  applyPerSideFold,
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
