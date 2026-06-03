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

// ── 2. Application ffmpeg ──────────────────────────────────────────────────────

/**
 * Construit le `filter_complex` ffmpeg qui plie le ruban : split du flux en N,
 * `crop` de chaque bande, `pad` à `bandWidth × bandHeight`, puis `vstack` dans
 * l'ordre `dstY`. Fonction pure (string) — testable sans ffmpeg.
 *
 * Cas 1 bande : pas de split ni vstack, simple `crop` + `pad`.
 */
export function buildFoldFilterGraph(geometry: FoldGeometry, padColor = 'black'): string {
  const { bands, bandWidth, bandHeight, bandCount } = geometry;

  const cropPad = (b: FoldBand): string =>
    `crop=${b.w}:${b.h}:${b.srcX}:${b.srcY},pad=${bandWidth}:${bandHeight}:${b.dstX}:0:${padColor}`;

  if (bandCount === 1) {
    return `[0:v]${cropPad(bands[0])}[out]`;
  }

  // Split du flux source en autant de copies que de bandes.
  const splitOutputs = bands.map((_, i) => `[s${i}]`).join('');
  const parts: string[] = [`[0:v]split=${bandCount}${splitOutputs}`];

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
  buildFoldFilterGraph,
  buildFoldFfmpegArgs,
  isFfmpegAvailable,
  applyFold,
};

export default ledFoldService;
