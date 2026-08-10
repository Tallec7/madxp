/**
 * Mire de diagnostic LED — savoir ce que le processeur fait vraiment du signal.
 *
 * ## Pourquoi
 *
 * Le SPIKE-003 matériel bloque depuis avril parce qu'il suppose d'acheter un
 * processeur LED. Or les clubs installés en ont déjà un. Une mire numérotée
 * diffusée sur leur ruban, plus **une photo**, répond aux mêmes questions pour
 * zéro euro :
 *
 *  - le processeur redistribue-t-il lui-même le signal, ou attend-il un canvas
 *    déjà plié (le fameux mode A vs B, PROP-014 §10) ?
 *  - le ruban est-il une surface continue, ou N côtés indépendants recevant
 *    chacun le même signal ?
 *  - l'image est-elle étirée, répétée, ou cantonnée à un bout du tour ?
 *
 * On lit la réponse dans l'ordre des blocs sur la photo. Aucun jargon requis de
 * la personne sur place : elle diffuse, elle photographie.
 *
 * ## Comment
 *
 * N blocs de couleurs distinctes sur toute la largeur, chacun portant **son
 * numéro en grand**. Le premier et le dernier sont marqués (`|<` et `>|`) pour
 * lever l'ambiguïté du sens de lecture — un ruban peut être câblé à l'envers.
 *
 * ffmpeg pur, jamais Chromium : la mire doit pouvoir être générée à la largeur du
 * ruban déroulé (ex. 6400 px), taille à laquelle le rendu DOM explose (ADR-134).
 *
 * ## Ce que ça n'est pas
 *
 * Pas une feature produit : un outil de mise en service. La mire se génère, se
 * diffuse une fois, se photographie, et le club revient à son contenu.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import Joi from 'joi';
import logger from '../config/logger';

/** Couleurs des blocs — franches et distinctes même sur photo au téléphone. */
export const MIRE_COLORS = [
  '#e6194b', // rouge
  '#3cb44b', // vert
  '#ffe119', // jaune
  '#4363d8', // bleu
  '#f58231', // orange
  '#911eb4', // violet
  '#46f0f0', // cyan
  '#f032e6', // magenta
  '#bcf60c', // lime
  '#008080', // sarcelle
  '#e6beff', // lavande
  '#9a6324', // brun
];

/** Un bloc de la mire : sa position dans le signal émis et son identité visuelle. */
export interface MireBlock {
  /** Numéro affiché, 1-indexé — c'est ce qu'on lit sur la photo. */
  label: number;
  /** Position x dans le signal (px). */
  x: number;
  /** Largeur du bloc (px) — le dernier absorbe le reste de la division. */
  width: number;
  /** Couleur de fond (#rrggbb). */
  color: string;
  /** Marqueur de bord : `start` sur le premier, `end` sur le dernier. */
  edge: 'start' | 'end' | null;
}

export interface MireGeometryInput {
  /** Largeur du signal à émettre (px). */
  width: number;
  /** Hauteur du signal (px). */
  height: number;
  /** Nombre de blocs. 2 à 12. */
  blocks: number;
}

const mireSchema = Joi.object<MireGeometryInput>({
  width: Joi.number().integer().min(16).max(32768).required(),
  height: Joi.number().integer().min(8).max(4320).required(),
  blocks: Joi.number().integer().min(2).max(MIRE_COLORS.length).required(),
}).required();

/**
 * Découpe le signal en blocs numérotés. Fonction pure, aucun I/O.
 *
 * Le dernier bloc absorbe le reste de la division entière : la somme des largeurs
 * vaut EXACTEMENT `width`, sinon une colonne noire d'un pixel apparaîtrait au bord
 * et serait lue comme un artefact de mapping sur la photo.
 *
 * @throws si l'entrée est invalide (Joi).
 */
export function computeMireBlocks(input: MireGeometryInput): MireBlock[] {
  const { error, value } = mireSchema.validate(input, { convert: false });
  if (error) {
    throw new Error(`computeMireBlocks: entrée invalide — ${error.message}`);
  }

  const base = Math.floor(value.width / value.blocks);
  const out: MireBlock[] = [];
  for (let i = 0; i < value.blocks; i++) {
    const isLast = i === value.blocks - 1;
    out.push({
      label: i + 1,
      x: i * base,
      width: isLast ? value.width - i * base : base,
      color: MIRE_COLORS[i % MIRE_COLORS.length],
      edge: i === 0 ? 'start' : isLast ? 'end' : null,
    });
  }
  return out;
}

/** Polices candidates, par ordre de préférence. La 1ʳᵉ trouvée gagne. */
const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
];

/**
 * Le binaire ffmpeg local sait-il faire `drawtext` ?
 *
 * Le filtre exige que ffmpeg soit compilé avec libfreetype — ce n'est PAS le cas
 * de tous les builds (celui d'Homebrew au 2026-08 ne l'a pas). Trouver une police
 * ne suffit donc pas : sans cette sonde, la mire échouait avec
 * « No such filter: 'drawtext' » au lieu de retomber sur le codage par barres.
 *
 * Résultat mis en cache : la capacité ne change pas en cours de process.
 */
let drawtextCache: boolean | null = null;
export async function ffmpegSupportsDrawtext(): Promise<boolean> {
  if (drawtextCache !== null) return drawtextCache;
  drawtextCache = await new Promise<boolean>((resolve) => {
    let out = '';
    const proc = spawn('ffmpeg', ['-hide_banner', '-filters']);
    proc.stdout.on('data', (d) => { out += String(d); });
    proc.on('error', () => resolve(false));
    proc.on('close', () => resolve(/^\s*[A-Z.]+\s+drawtext\s/m.test(out)));
  });
  return drawtextCache;
}

/** Réinitialise le cache de capacité — tests uniquement. */
export function resetDrawtextCache(): void {
  drawtextCache = null;
}

/** Première police disponible sur la machine, ou `null`. */
export function findFont(candidates: string[] = FONT_CANDIDATES): string | null {
  for (const f of candidates) {
    try {
      if (fs.existsSync(f)) return f;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Échappe un chemin pour `drawtext:fontfile=` (les `:` cassent le parseur ffmpeg). */
export function escapeFontPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

export interface MireFilterOptions {
  height: number;
  /** Police pour les numéros. `null` → repli sur un codage par barres. */
  fontFile: string | null;
}

/**
 * Construit le filtre ffmpeg de la mire : un fond noir, puis un `drawbox` rempli
 * par bloc, puis le numéro.
 *
 * **Repli sans police** : si aucune police n'est trouvée, le numéro est codé par N
 * barres verticales blanches dans le bloc. Moins lisible qu'un chiffre, mais
 * toujours déchiffrable sur photo — et ça évite qu'un poste sans fonts ne produise
 * une mire muette, ce qui serait pire qu'une mire moche.
 */
export function buildMireFilter(blocks: MireBlock[], options: MireFilterOptions): string {
  const h = options.height;
  const parts: string[] = [];

  for (const b of blocks) {
    parts.push(
      `drawbox=x=${b.x}:y=0:w=${b.width}:h=${h}:color=${b.color}@1.0:t=fill`
    );
  }

  if (options.fontFile) {
    const font = escapeFontPath(options.fontFile);
    const fontSize = Math.max(12, Math.floor(h * 0.55));
    for (const b of blocks) {
      const cx = b.x + Math.floor(b.width / 2);
      parts.push(
        `drawtext=fontfile='${font}':text='${b.label}':fontcolor=white:fontsize=${fontSize}` +
          `:borderw=${Math.max(2, Math.floor(fontSize / 12))}:bordercolor=black` +
          `:x=${cx}-text_w/2:y=(h-text_h)/2`
      );
    }
  } else {
    // Repli : `label` barres blanches, centrées dans le bloc.
    for (const b of blocks) {
      const barW = Math.max(2, Math.floor(h * 0.06));
      const gap = barW * 2;
      const total = b.label * barW + (b.label - 1) * gap;
      const startX = b.x + Math.floor((b.width - total) / 2);
      for (let k = 0; k < b.label; k++) {
        const x = startX + k * (barW + gap);
        parts.push(
          `drawbox=x=${x}:y=${Math.floor(h * 0.2)}:w=${barW}:h=${Math.floor(h * 0.6)}:color=white@1.0:t=fill`
        );
      }
    }
  }

  // Marqueurs de bord — un ruban peut être câblé à l'envers ; sans eux, on ne
  // saurait pas distinguer « ordre 1→8 » de « ordre 8→1 » sur la photo.
  const markW = Math.max(4, Math.floor(h * 0.1));
  parts.push(`drawbox=x=0:y=0:w=${markW}:h=${h}:color=white@1.0:t=fill`);
  const last = blocks[blocks.length - 1];
  const endX = last.x + last.width - markW;
  parts.push(`drawbox=x=${endX}:y=0:w=${markW}:h=${h}:color=black@1.0:t=fill`);

  return parts.join(',');
}

export interface MireRenderOptions extends MireGeometryInput {
  outputPath: string;
  /** Durée de la boucle (s). Défaut 10 — le temps de la diffuser et photographier. */
  durationSec?: number;
  fps?: number;
  fontFile?: string | null;
}

export interface MireRenderResult {
  success: boolean;
  outputPath: string | null;
  blocks: MireBlock[];
  usedFont: string | null;
  durationMs: number;
  error?: string;
}

/** Assemble les arguments ffmpeg. Pur — testable sans lancer ffmpeg. */
export function buildMireFfmpegArgs(options: MireRenderOptions, fontFile: string | null): string[] {
  // `computeMireBlocks` valide strictement : ne lui passer QUE la géométrie,
  // pas les options de rendu (durée, fps, police) qu'il ne connaît pas.
  const blocks = computeMireBlocks({
    width: options.width,
    height: options.height,
    blocks: options.blocks,
  });
  const duration = options.durationSec ?? 10;
  const fps = options.fps ?? 25;
  const filter = buildMireFilter(blocks, { height: options.height, fontFile });

  return [
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${options.width}x${options.height}:r=${fps}:d=${duration}`,
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-preset',
    'medium',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an', // ruban LED = pas d'audio
    '-y',
    options.outputPath,
  ];
}

/** Génère réellement le MP4 de la mire. Ne lève pas : renvoie `success: false`. */
export async function renderTestPattern(options: MireRenderOptions): Promise<MireRenderResult> {
  const started = Date.now();
  // Texte possible seulement si le filtre EXISTE **et** qu'une police est trouvée.
  const fontFile =
    options.fontFile !== undefined
      ? options.fontFile
      : (await ffmpegSupportsDrawtext())
        ? findFont()
        : null;
  let blocks: MireBlock[];
  try {
    blocks = computeMireBlocks({
      width: options.width,
      height: options.height,
      blocks: options.blocks,
    });
  } catch (err) {
    return {
      success: false,
      outputPath: null,
      blocks: [],
      usedFont: fontFile,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const args = buildMireFfmpegArgs(options, fontFile);
  if (!fontFile) {
    logger.warn('Mire LED : numéros codés par barres (drawtext indisponible ou police absente)');
  }

  return new Promise<MireRenderResult>((resolve) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += String(d);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on('error', (err) => {
      resolve({
        success: false,
        outputPath: null,
        blocks,
        usedFont: fontFile,
        durationMs: Date.now() - started,
        error: `ffmpeg introuvable ou non exécutable — ${err.message}`,
      });
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          outputPath: options.outputPath,
          blocks,
          usedFont: fontFile,
          durationMs: Date.now() - started,
        });
      } else {
        resolve({
          success: false,
          outputPath: null,
          blocks,
          usedFont: fontFile,
          durationMs: Date.now() - started,
          error: `ffmpeg a échoué (code ${code}) — ${stderr.slice(-500)}`,
        });
      }
    });
  });
}

export default {
  computeMireBlocks,
  buildMireFilter,
  buildMireFfmpegArgs,
  renderTestPattern,
  findFont,
  ffmpegSupportsDrawtext,
  escapeFontPath,
  MIRE_COLORS,
};
