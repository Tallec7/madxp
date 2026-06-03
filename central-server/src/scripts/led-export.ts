/**
 * CLI d'export LED — vidéo finie → canvas plié (PROP-014 étape 6, ADR-134).
 *
 * Démontre la voie d'export "vidéo club" de bout en bout : adapte une vidéo de taille
 * quelconque au ruban du profil (scale/pad selon `fit`) puis la plie en bandes, via
 * ffmpeg pur (pas de Chromium → pas d'OOM, contrairement au rendu plat). Le studio,
 * lui, rend directement plié via Remotion (`LedPerimeterFolded`).
 *
 * Usage :
 *   npm run led:export                                  # génère un testsrc 4800×800 et le plie
 *   npm run led:export -- --in /chemin/video.mp4        # plie une vraie vidéo
 *   npm run led:export -- --sides 40,20,20 --pitch 6 --height 160 --fit contain
 *   npm run led:export -- --fit stretch --out /tmp/ruban.mp4
 *
 * Écrit le MP4 plié sur disque (chemin loggé) — pas d'upload ni de DB (outil de démo).
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import logger from '../config/logger';
import {
  computeRibbonDimensions,
  computeFoldGeometry,
  applyFoldExport,
  type LedExportFit,
} from '../services/led-fold.service';

interface Args {
  sides: number[];
  pitchMm: number;
  height: number;
  bandWidth: number;
  fit: LedExportFit;
  inPath: string | null;
  outPath: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sides = (get('--sides') ?? '40,20,20')
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  const pitchMm = Number(get('--pitch') ?? 6);
  const height = Number(get('--height') ?? 160);
  const bandWidth = Number(get('--band-width') ?? 1920);
  const fitArg = get('--fit') ?? 'contain';
  const fit: LedExportFit = fitArg === 'stretch' || fitArg === 'cover' ? fitArg : 'contain';
  const inPath = get('--in') ?? null;
  const outPath = get('--out') ?? path.join(os.tmpdir(), `led-export-${fit}.mp4`);
  return { sides: sides.length ? sides : [40], pitchMm, height, bandWidth, fit, inPath, outPath };
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (e) => reject(new Error(`ffmpeg error: ${e.message}`)));
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`))
    );
  });
}

function probeDimensions(file: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      file,
    ]);
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const m = out.trim().match(/^(\d+)x(\d+)$/);
      resolve(m ? { width: Number(m[1]), height: Number(m[2]) } : null);
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const { ribbonWidth, ribbonHeight } = computeRibbonDimensions({
    sides: args.sides,
    pitchMm: args.pitchMm,
    height: args.height,
  });
  const geometry = computeFoldGeometry({ ribbonWidth, ribbonHeight, bandWidth: args.bandWidth });

  logger.info('led-export: profil', {
    sides: args.sides,
    pitchMm: args.pitchMm,
    ribbonWidth,
    ribbonHeight,
    bandCount: geometry.bandCount,
    canvas: `${geometry.canvasWidth}×${geometry.canvasHeight}`,
    fit: args.fit,
  });

  // Source : fichier fourni, sinon un testsrc 4800×800 (créa club typique 6:1).
  let inputPath = args.inPath;
  let generated: string | null = null;
  if (!inputPath) {
    generated = path.join(os.tmpdir(), 'led-export-src-4800x800.mp4');
    logger.info('led-export: génération source testsrc 4800×800 (2s)', { generated });
    await runFfmpeg([
      '-f', 'lavfi',
      '-i', 'testsrc2=size=4800x800:duration=2:rate=25',
      '-pix_fmt', 'yuv420p',
      '-y', generated,
    ]);
    inputPath = generated;
  }

  const result = await applyFoldExport(geometry, {
    inputPath,
    outputPath: args.outPath,
    fit: args.fit,
  });

  if (!result.success) {
    logger.error('led-export: ÉCHEC', { error: result.error });
    process.exitCode = 1;
  } else {
    const dims = await probeDimensions(args.outPath);
    const size = fs.existsSync(args.outPath) ? fs.statSync(args.outPath).size : 0;
    const expected = `${geometry.canvasWidth}×${geometry.canvasHeight}`;
    const actual = dims ? `${dims.width}×${dims.height}` : 'inconnu';
    logger.info('led-export: OK', {
      outputPath: args.outPath,
      durationMs: result.durationMs,
      sizeKB: Math.round(size / 1024),
      canvasAttendu: expected,
      canvasObtenu: actual,
      match: dims ? dims.width === geometry.canvasWidth && dims.height === geometry.canvasHeight : null,
    });
    if (dims && (dims.width !== geometry.canvasWidth || dims.height !== geometry.canvasHeight)) {
      logger.warn('led-export: dimensions de sortie ≠ canvas attendu — à investiguer');
      process.exitCode = 1;
    }
  }

  if (generated) {
    try {
      fs.unlinkSync(generated);
    } catch {
      /* noop */
    }
  }
}

main().catch((err) => {
  logger.error('led-export: crash', { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
