/**
 * Détourage des marges d'une vidéo LED — **détecte et propose, n'applique jamais**.
 *
 * Spec : `docs/proposals/PROP-015-led-autocrop-on-validation.md`, ADR-140.
 *
 * ## Le problème
 *
 * `STRASOL_2025_08_1600x120px.mp4` fait **4096 × 1416**. Son nom annonce un ruban et
 * il n'a pas tort sur le fond : le bandeau utile mesure 4096 × 306 (ratio 13,4:1,
 * celui d'un côté de Piraths). Mais il est posé au centre d'un grand cadre, avec
 * 554 px de noir au-dessus et 556 en dessous. Le pliage prend le fichier ENTIER :
 * ramené à 120 px de haut, le cadre passe de 4096 à ~347 px de large et le visuel
 * devient un trait perdu dans du noir. C'est ce que produit un export « propre »
 * depuis un outil de montage réglé sur un format standard.
 *
 * ## Pourquoi ça ne peut PAS être automatique
 *
 * `cropdetect` sait trouver les bandes uniformes. La tentation est de détourer
 * systématiquement ; elle est mauvaise, pour trois raisons qui sont le cœur de la
 * feature :
 *
 * 1. **Un visuel volontairement sur fond noir est indistinguable d'un export mal
 *    cadré.** Un sponsor dont la charte est noire se ferait rogner jusqu'à son logo.
 * 2. **Le résultat dépend de l'image analysée.** Un fondu au noir donnerait un
 *    rectangle différent d'une autre frame — donc un canvas qui change sans que rien
 *    n'ait changé, ce que l'invariant ADR-138 interdit.
 * 3. **`serve_folded` a déjà tranché ce type d'arbitrage** (ADR-139) : ce qui modifie
 *    ce qu'un processeur reçoit ne s'active pas tout seul.
 *
 * Ce module ne fait donc que **mesurer et argumenter**. La persistance du rectangle
 * est un geste humain distinct (`PUT …/crop`), et rien n'est détouré tant que ce
 * rectangle n'est pas enregistré.
 *
 * ## Deux garde-fous dans la mesure elle-même
 *
 * - **Plusieurs frames réparties dans la vidéo**, jamais une seule.
 * - **On retient le plus petit rectangle qui contient le contenu de TOUTES les
 *   frames** — c'est-à-dire leur UNION, pas leur intersection. L'intersection
 *   donnerait le rectangle d'un fondu au noir (quasi vide) et rognerait tout le
 *   reste ; l'union sous-détoure au pire, ce qui est exactement l'erreur
 *   acceptable : mieux vaut laisser un peu de noir que couper du contenu.
 */

import { spawn } from 'child_process';
import Joi from 'joi';
import logger from '../config/logger';

/** Rectangle de détourage, en pixels de la source. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Nombre d'instants analysés dans la vidéo. */
export const CROP_SAMPLE_COUNT = 5;

/**
 * Seuil de luminance sous lequel un pixel est considéré « noir » (`cropdetect=limit`).
 * 24/255 : au-dessus, un dégradé sombre volontaire se ferait manger ; en dessous, un
 * noir compressé en h264 (jamais parfaitement 0) ne serait pas reconnu comme marge.
 */
export const CROPDETECT_LIMIT = 24;

/**
 * Frames décodées par instant analysé. `cropdetect` n'émet rien avant d'en avoir vu
 * quelques-unes (il ignore les premières après un seek) — avec `-frames:v 1` la sonde
 * reste muette, ce qui se lirait à tort comme « aucune marge ».
 */
const FRAMES_PER_SAMPLE = 6;

/** Garde-fou : une sonde qui traîne ne doit pas tenir la requête HTTP ouverte. */
const FFMPEG_TIMEOUT_MS = 20_000;

/**
 * Marge minimale (fraction de la surface) sous laquelle on ne propose RIEN.
 *
 * Sur un 16:9 plein cadre — les clips TV, carton jaune, temps mort — `cropdetect`
 * rend le cadre entier : il n'y a aucune marge à retirer. Proposer un détourage y
 * laisserait croire à une solution alors que la bonne réponse est le bouton
 * « Retirer » de la vue Canvas (la vidéo n'a rien à faire sur un ruban).
 */
export const MIN_MARGIN_FRACTION = 0.02;

/**
 * Écart de ratio toléré entre le rectangle détouré et le côté de ruban visé.
 * Même valeur que `led-content-fit.service.ts` — un détourage qui n'approche pas
 * la forme d'un ruban ne résout pas le problème qu'on cherche à résoudre.
 */
export const RATIO_TOLERANCE = 1.15;

// ── 1. Géométrie pure ─────────────────────────────────────────────────────────

/**
 * Instants (en secondes) à analyser, répartis dans la vidéo.
 *
 * Bornés à 5 % / 95 % : le tout premier et le tout dernier instant tombent souvent
 * sur un fondu, et bien qu'on prenne l'union (donc robuste), les analyser coûte
 * une sonde pour rien.
 */
export function computeSampleTimes(durationSec: number, count = CROP_SAMPLE_COUNT): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [0];
  const n = Math.max(1, Math.floor(count));
  if (n === 1) return [durationSec / 2];
  return Array.from({ length: n }, (_, i) => {
    const fraction = 0.05 + (0.9 * i) / (n - 1);
    return Math.round(durationSec * fraction * 100) / 100;
  });
}

/** Arguments ffmpeg d'une sonde `cropdetect` à un instant donné. Pur (string[]). */
export function buildCropdetectArgs(inputPath: string, atSeconds: number): string[] {
  return [
    '-hide_banner',
    '-ss',
    String(atSeconds),
    '-i',
    inputPath,
    '-frames:v',
    String(FRAMES_PER_SAMPLE),
    '-vf',
    `cropdetect=limit=${CROPDETECT_LIMIT}:round=2:skip=0:reset=1`,
    '-f',
    'null',
    '-',
  ];
}

/**
 * Extrait le DERNIER `crop=w:h:x:y` de la sortie ffmpeg.
 *
 * Le dernier, pas le premier : `cropdetect` affine son verdict frame après frame et
 * la ligne finale est celle qui a vu le plus d'images.
 */
export function parseCropdetectOutput(stderr: string): CropRect | null {
  const matches = [...stderr.matchAll(/crop=(\d+):(\d+):(-?\d+):(-?\d+)/g)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  const [w, h, x, y] = last.slice(1, 5).map((n) => parseInt(n, 10));
  if (![w, h, x, y].every(Number.isFinite) || w <= 0 || h <= 0 || x < 0 || y < 0) return null;
  return { x, y, w, h };
}

/**
 * Le plus petit rectangle qui contient le contenu de TOUTES les frames analysées.
 *
 * C'est l'UNION, délibérément — cf. l'en-tête du module. Prendre l'intersection
 * reviendrait à faire dicter le détourage par la frame la plus sombre, exactement
 * le piège que la mesure multi-frames est censée éviter.
 */
export function unionRects(rects: CropRect[]): CropRect | null {
  const valid = rects.filter((r) => r && r.w > 0 && r.h > 0);
  if (valid.length === 0) return null;
  const x1 = Math.min(...valid.map((r) => r.x));
  const y1 = Math.min(...valid.map((r) => r.y));
  const x2 = Math.max(...valid.map((r) => r.x + r.w));
  const y2 = Math.max(...valid.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Rabote le rectangle dans les bornes de la source et l'aligne sur des valeurs
 * PAIRES, en **élargissant** jamais en rétrécissant.
 *
 * Un crop impair sur une source `yuv420p` (chroma 4:2:0) fait échouer ffmpeg ou
 * décale la chroma d'un demi-pixel ; élargir plutôt que rétrécir garde la règle
 * « on ne coupe pas de contenu » vraie jusque dans l'arrondi.
 */
export function normalizeRect(rect: CropRect, sourceWidth: number, sourceHeight: number): CropRect {
  const x = Math.max(0, Math.floor(rect.x / 2) * 2);
  const y = Math.max(0, Math.floor(rect.y / 2) * 2);
  const right = Math.min(sourceWidth, Math.ceil((rect.x + rect.w) / 2) * 2);
  const bottom = Math.min(sourceHeight, Math.ceil((rect.y + rect.h) / 2) * 2);
  return { x, y, w: Math.max(2, right - x), h: Math.max(2, bottom - y) };
}

/** `true` si le rectangle tient entièrement dans la source et n'est pas dégénéré. */
export function isRectWithin(rect: CropRect, sourceWidth: number, sourceHeight: number): boolean {
  return (
    Number.isInteger(rect.x) &&
    Number.isInteger(rect.y) &&
    Number.isInteger(rect.w) &&
    Number.isInteger(rect.h) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.w > 0 &&
    rect.h > 0 &&
    rect.x + rect.w <= sourceWidth &&
    rect.y + rect.h <= sourceHeight
  );
}

// ── 2. Verdict ────────────────────────────────────────────────────────────────

export interface CropProposalInput {
  sourceWidth: number;
  sourceHeight: number;
  /** Rectangle mesuré (union des frames), déjà normalisé. */
  crop: CropRect;
  /** Largeur d'un côté du ruban, en px (= `canvas.geometry.bandWidth`). */
  targetWidth: number;
  /** Hauteur de dalle, en px. */
  targetHeight: number;
}

export interface CropProposal {
  crop: CropRect;
  source: { width: number; height: number };
  target: { width: number; height: number };
  /** `true` = à proposer à l'opérateur. `false` = ne rien suggérer. */
  recommended: boolean;
  /** Phrase en clair, destinée à l'opérateur — affichée telle quelle. */
  reason: string;
  /** Fraction de la surface qui serait retirée (0 → 1). */
  marginFraction: number;
  /** Ratio du rectangle détouré, et celui du côté visé. */
  croppedRatio: number;
  targetRatio: number;
}

function fmtRatio(r: number): string {
  return `${r.toFixed(1).replace('.', ',')}:1`;
}

function pct(f: number): string {
  return `${Math.round(f * 100)} %`;
}

/**
 * Décide s'il faut PROPOSER ce détourage — et le dit en français à l'opérateur.
 *
 * Deux refus explicites, qui valent mieux qu'une suggestion à côté de la plaque :
 *  - **rien à retirer** (plein cadre) ;
 *  - **détourer n'approche pas du ruban** (un 16:9 légèrement letterboxé reste un
 *    16:9 : le retailler ne le rend pas diffusable sur un bandeau).
 *
 * Fonction pure. @throws si l'entrée est invalide (Joi).
 */
const proposalSchema = Joi.object<CropProposalInput>({
  sourceWidth: Joi.number().integer().positive().required(),
  sourceHeight: Joi.number().integer().positive().required(),
  crop: Joi.object({
    x: Joi.number().integer().min(0).required(),
    y: Joi.number().integer().min(0).required(),
    w: Joi.number().integer().positive().required(),
    h: Joi.number().integer().positive().required(),
  }).required(),
  targetWidth: Joi.number().integer().positive().required(),
  targetHeight: Joi.number().integer().positive().required(),
}).required();

export function evaluateCropProposal(input: CropProposalInput): CropProposal {
  const { error, value } = proposalSchema.validate(input, { convert: false });
  if (error) {
    throw new Error(`evaluateCropProposal: entrée invalide — ${error.message}`);
  }

  const { sourceWidth, sourceHeight, crop, targetWidth, targetHeight } = value;
  const marginFraction = 1 - (crop.w * crop.h) / (sourceWidth * sourceHeight);
  const croppedRatio = crop.w / crop.h;
  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  const gap = croppedRatio > targetRatio ? croppedRatio / targetRatio : targetRatio / croppedRatio;

  const base = {
    crop,
    source: { width: sourceWidth, height: sourceHeight },
    target: { width: targetWidth, height: targetHeight },
    marginFraction,
    croppedRatio,
    targetRatio,
  };

  if (marginFraction < MIN_MARGIN_FRACTION) {
    return {
      ...base,
      recommended: false,
      reason:
        `Aucune marge détectée : l'image occupe déjà tout le cadre ` +
        `(${sourceWidth} × ${sourceHeight}, ${fmtRatio(sourceRatio)}). ` +
        `Si cette vidéo n'est pas faite pour un ruban ${fmtRatio(targetRatio)}, ` +
        `retire-la du ruban plutôt que de la détourer.`,
    };
  }

  if (gap > RATIO_TOLERANCE) {
    return {
      ...base,
      recommended: false,
      reason:
        `Retirer les marges donnerait ${crop.w} × ${crop.h} (${fmtRatio(croppedRatio)}), ` +
        `encore loin du ruban (${targetWidth} × ${targetHeight}, ${fmtRatio(targetRatio)}). ` +
        `Le détourage ne réglerait rien ici — demande un export au format ruban, ` +
        `ou retire cette vidéo du ruban.`,
    };
  }

  return {
    ...base,
    recommended: true,
    reason:
      `Marges détectées : ${sourceWidth} × ${sourceHeight} → ${crop.w} × ${crop.h}, ` +
      `soit un ratio ${fmtRatio(croppedRatio)} proche du ruban (${fmtRatio(targetRatio)}). ` +
      `${pct(marginFraction)} de l'image est du remplissage. ` +
      `Un export sans marges reste la meilleure réponse ; ce détourage dépanne si ` +
      `ce fichier est le seul disponible.`,
  };
}

// ── 3. Sonde ffmpeg ───────────────────────────────────────────────────────────

/** Résultat d'une détection. `crop === null` = rien de mesurable (jamais une erreur). */
export interface CropDetection {
  crop: CropRect | null;
  /** Un rectangle par instant analysé — pour tracer d'où vient l'union. */
  samples: Array<{ at: number; rect: CropRect | null }>;
}

/** Lance une sonde `cropdetect` et rend le rectangle lu. Ne lève jamais. */
function runCropdetect(inputPath: string, atSeconds: number): Promise<CropRect | null> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', buildCropdetectArgs(inputPath, atSeconds));
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
    }, FFMPEG_TIMEOUT_MS);

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on('close', () => {
      clearTimeout(timer);
      resolve(parseCropdetectOutput(stderr));
    });
  });
}

/**
 * Mesure les marges d'une vidéo sur disque, sur plusieurs instants.
 *
 * Ne lève jamais et ne modifie rien : une sonde qui échoue rend `crop: null`, ce que
 * l'appelant présente comme « je ne sais pas », jamais comme « pas de marges ».
 */
export async function detectCropRect(
  filePath: string,
  options: { durationSec: number; sourceWidth: number; sourceHeight: number; samples?: number }
): Promise<CropDetection> {
  const times = computeSampleTimes(options.durationSec, options.samples ?? CROP_SAMPLE_COUNT);

  // Séquentiel : cinq ffmpeg en parallèle sur un conteneur Railway, c'est le même
  // épuisement de décodeurs h264 qui a fait échouer un job de pliage sur deux chez
  // Piraths (cf. la garde `ticking` du worker d'export).
  const samples: CropDetection['samples'] = [];
  for (const at of times) {
    samples.push({ at, rect: await runCropdetect(filePath, at) });
  }

  const union = unionRects(samples.map((s) => s.rect).filter((r): r is CropRect => r !== null));
  const crop = union ? normalizeRect(union, options.sourceWidth, options.sourceHeight) : null;

  logger.info('led-autocrop: detection done', {
    filePath,
    samples: samples.map((s) => (s.rect ? `${s.rect.w}x${s.rect.h}+${s.rect.x}+${s.rect.y}` : 'none')),
    crop: crop ? `${crop.w}x${crop.h}+${crop.x}+${crop.y}` : null,
  });

  return { crop, samples };
}

export const ledAutocropService = {
  computeSampleTimes,
  buildCropdetectArgs,
  parseCropdetectOutput,
  unionRects,
  normalizeRect,
  isRectWithin,
  evaluateCropProposal,
  detectCropRect,
};

export default ledAutocropService;
