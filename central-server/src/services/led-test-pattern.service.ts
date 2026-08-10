/**
 * Mire de diagnostic LED — savoir ce que le processeur fait vraiment du signal.
 *
 * ## Pourquoi
 *
 * Le SPIKE-003 matériel bloque depuis avril parce qu'il suppose d'acheter un
 * processeur LED. Or les clubs installés en ont déjà un. Une mire diffusée sur
 * leur ruban, plus **une photo**, répond aux mêmes questions pour zéro euro.
 *
 * ## Pourquoi une GRILLE, et une seule
 *
 * Le lecteur TV rend la vidéo en `object-fit: contain` : quelle que soit la
 * résolution du FICHIER, le processeur reçoit toujours le même signal — le mode
 * de sortie de la source. Envoyer trois fichiers de tailles différentes ne teste
 * donc rien : les trois arrivent letterboxés dans le même cadre.
 *
 * La vraie question n'est pas « quelle taille envoyer » mais **« quelle région du
 * signal le processeur pose-t-il sur le ruban, et dans quel ordre »**. Une grille
 * numérotée qui couvre tout le cadre y répond d'une seule image :
 *
 *  - une seule rangée visible, cases 1→N dans l'ordre → il mappe une bande ;
 *  - les rangées **bout à bout** le long du ruban → il DÉPLIE un canvas plié ;
 *  - toute la grille écrasée → il étire le signal entier ;
 *  - le même motif répété → les côtés sont indépendants, même signal.
 *
 * Le pliage se voit directement : déplier un canvas met ses rangées bout à bout.
 *
 * ffmpeg pur, jamais Chromium — la mire doit pouvoir être générée à n'importe
 * quelle taille, y compris celles où le rendu DOM explose (ADR-134).
 *
 * ## Ce que ça n'est pas
 *
 * Pas une feature produit : un outil de mise en service, une fois par club. La
 * réponse se consigne ensuite dans le profil, et tout en découle.
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
  /** Rangée du bloc, 0-indexée. */
  row: number;
  /** Colonne du bloc, 0-indexée. */
  colIndex: number;
  /** Position x dans le signal (px). */
  x: number;
  /** Position y dans le signal (px). */
  y: number;
  /** Largeur du bloc (px) — le dernier de la rangée absorbe le reste. */
  width: number;
  /** Hauteur du bloc (px) — la dernière rangée absorbe le reste. */
  height: number;
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
  /** Nombre de colonnes. 2 à 12. */
  blocks: number;
  /**
   * Nombre de rangées. Défaut 1 (bande simple).
   * `> 1` produit la GRILLE : c'est elle qui révèle un dépliage, en montrant les
   * rangées mises bout à bout le long du ruban.
   */
  rows?: number;
}

const mireSchema = Joi.object<MireGeometryInput>({
  width: Joi.number().integer().min(16).max(32768).required(),
  height: Joi.number().integer().min(8).max(4320).required(),
  blocks: Joi.number().integer().min(2).max(MIRE_COLORS.length).required(),
  rows: Joi.number().integer().min(1).max(8).optional(),
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

  const rows = value.rows ?? 1;
  const base = Math.floor(value.width / value.blocks);
  const rowH = Math.floor(value.height / rows);
  const out: MireBlock[] = [];

  for (let r = 0; r < rows; r++) {
    const isLastRow = r === rows - 1;
    for (let i = 0; i < value.blocks; i++) {
      const isLastCol = i === value.blocks - 1;
      out.push({
        label: r * value.blocks + i + 1,
        row: r,
        colIndex: i,
        x: i * base,
        y: r * rowH,
        // Les derniers absorbent le reste de la division : la grille couvre
        // EXACTEMENT le cadre, sinon un liseré noir passerait pour un artefact.
        width: isLastCol ? value.width - i * base : base,
        height: isLastRow ? value.height - r * rowH : rowH,
        color: MIRE_COLORS[(r * value.blocks + i) % MIRE_COLORS.length],
        edge: r === 0 && i === 0 ? 'start' : isLastRow && isLastCol ? 'end' : null,
      });
    }
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
  const parts: string[] = [];

  for (const b of blocks) {
    parts.push(
      `drawbox=x=${b.x}:y=${b.y}:w=${b.width}:h=${b.height}:color=${b.color}@1.0:t=fill`
    );
  }

  if (options.fontFile) {
    const font = escapeFontPath(options.fontFile);
    for (const b of blocks) {
      const fontSize = Math.max(12, Math.floor(b.height * 0.55));
      const cx = b.x + Math.floor(b.width / 2);
      const cy = b.y + Math.floor(b.height / 2);
      parts.push(
        `drawtext=fontfile='${font}':text='${b.label}':fontcolor=white:fontsize=${fontSize}` +
          `:borderw=${Math.max(2, Math.floor(fontSize / 12))}:bordercolor=black` +
          `:x=${cx}-text_w/2:y=${cy}-text_h/2`
      );
    }
  } else {
    // Repli sans `drawtext` : coordonnées, PAS un numéro absolu.
    //
    // Coder la case 27 par 27 barres donne un code-barres illisible dès la 2ᵉ
    // rangée (constaté sur un rendu 8×4). On code donc la POSITION :
    //   - `col` barres VERTICALES, centrées → numéro de colonne (≤ 8) ;
    //   - `row` barres HORIZONTALES en bas   → numéro de rangée (≤ 8).
    // Deux orientations, deux petits comptes : lisible sur photo au téléphone.
    for (const b of blocks) {
      const col = b.colIndex + 1;
      const row = b.row + 1;

      // Deux zones DISJOINTES : verticales dans le tiers haut, horizontales en
      // bas. Sans cette séparation, la rangée 4 empiétait sur les colonnes et le
      // glyphe devenait indéchiffrable (constaté sur un rendu 8×4).
      const barW = Math.max(2, Math.floor(b.height * 0.07));
      const gap = barW * 2;
      const totalW = col * barW + (col - 1) * gap;
      const startX = b.x + Math.floor((b.width - totalW) / 2);
      const barY = b.y + Math.floor(b.height * 0.1);
      const barH = Math.floor(b.height * 0.32);
      for (let k = 0; k < col; k++) {
        parts.push(
          `drawbox=x=${startX + k * (barW + gap)}:y=${barY}:w=${barW}:h=${barH}:color=white@1.0:t=fill`
        );
      }

      const hH = Math.max(2, Math.floor(b.height * 0.045));
      const hGap = hH;
      const hW = Math.floor(b.width * 0.25);
      const hX = b.x + Math.floor((b.width - hW) / 2);
      const hTotal = row * hH + (row - 1) * hGap;
      const hY = b.y + b.height - Math.floor(b.height * 0.08) - hTotal;
      for (let k = 0; k < row; k++) {
        parts.push(
          `drawbox=x=${hX}:y=${hY + k * (hH + hGap)}:w=${hW}:h=${hH}:color=white@1.0:t=fill`
        );
      }
    }
  }

  // Marqueurs de bord — un ruban peut être câblé à l'envers ; sans eux, on ne
  // distingue pas « ordre 1→N » de « ordre N→1 » sur la photo.
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  const markW = Math.max(4, Math.floor(first.height * 0.1));
  parts.push(`drawbox=x=0:y=${first.y}:w=${markW}:h=${first.height}:color=white@1.0:t=fill`);
  parts.push(
    `drawbox=x=${last.x + last.width - markW}:y=${last.y}:w=${markW}:h=${last.height}:color=black@1.0:t=fill`
  );

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
    rows: options.rows,
  });
  const duration = options.durationSec ?? 10;
  const fps = options.fps ?? 25;
  const filter = buildMireFilter(blocks, { fontFile });

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
      rows: options.rows,
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
