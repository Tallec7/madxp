/**
 * CLI POC — composition « contenu par côté » → canvas plié (ADR-135, étape 3).
 *
 * Démontre de bout en bout, en ffmpeg pur, qu'on peut composer **une vidéo
 * différente par côté** dans le canvas plié : chaque côté est adapté à son ruban,
 * plié en son bloc de bandes, et tous les blocs sont empilés. Génère une source
 * `testsrc` distincte par côté (couleur + libellé) pour visualiser le zonage.
 *
 * Usage :
 *   npm run led:fold-per-side                                 # 3 côtés 40,20,20 P6
 *   npm run led:fold-per-side -- --sides 40,20,20 --pitch 6 --height 160
 *   npm run led:fold-per-side -- --out /tmp/perimetre.mp4
 *
 * Écrit le MP4 composé sur disque (chemin loggé) — pas d'upload ni de DB (démo).
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import logger from '../config/logger';
import { computeFoldGeometryPerSide, applyPerSideFold } from '../services/led-fold.service';

interface Args {
  sides: number[];
  pitchMm: number;
  height: number;
  bandWidth: number;
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
  return {
    sides: sides.length ? sides : [40, 20, 20],
    pitchMm: Number(get('--pitch') ?? 6),
    height: Number(get('--height') ?? 160),
    bandWidth: Number(get('--band-width') ?? 1920),
    outPath: get('--out') ?? path.join(os.tmpdir(), 'led-per-side.mp4'),
  };
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

const COLORS = ['red', 'green', 'blue', 'orange', 'purple', 'teal', 'magenta', 'olive'];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const geometry = computeFoldGeometryPerSide({
    sides: args.sides,
    pitchMm: args.pitchMm,
    height: args.height,
    bandWidth: args.bandWidth,
  });

  logger.info('led-per-side: géométrie', {
    sides: args.sides,
    pitchMm: args.pitchMm,
    bandCount: geometry.bandCount,
    canvas: `${geometry.canvasWidth}×${geometry.canvasHeight}`,
    parCote: geometry.segments.map((s) => `c${s.sideIndex}:${s.ribbonWidth}px/${s.bandCount}b`),
  });

  // Une source testsrc par côté (couleur + libellé distincts) à la taille de son ruban.
  const generated: string[] = [];
  for (const seg of geometry.segments) {
    const src = path.join(os.tmpdir(), `led-side-${seg.sideIndex}.mp4`);
    const color = COLORS[seg.sideIndex % COLORS.length];
    // Source de démo couleur distincte par côté, à une taille PAIRE normale
    // (comme une vraie vidéo) — le graphe la scale ensuite au ruban du côté.
    // (h264 refuse les largeurs impaires comme les rubans 6667/3333, mais le
    //  scale est intermédiaire : seul le canvas final 1920×N pair est encodé.)
    await runFfmpeg([
      '-f', 'lavfi',
      '-i', `color=c=${color}:size=1280x720:duration=2:rate=25`,
      '-pix_fmt', 'yuv420p',
      '-y', src,
    ]);
    generated.push(src);
  }

  const result = await applyPerSideFold(geometry, { inputs: generated, outputPath: args.outPath });

  if (!result.success) {
    logger.error('led-per-side: ÉCHEC', { error: result.error });
    process.exitCode = 1;
  } else {
    const dims = await probeDimensions(args.outPath);
    const size = fs.existsSync(args.outPath) ? fs.statSync(args.outPath).size : 0;
    const match = dims
      ? dims.width === geometry.canvasWidth && dims.height === geometry.canvasHeight
      : null;
    logger.info('led-per-side: OK', {
      outputPath: args.outPath,
      durationMs: result.durationMs,
      sizeKB: Math.round(size / 1024),
      canvasAttendu: `${geometry.canvasWidth}×${geometry.canvasHeight}`,
      canvasObtenu: dims ? `${dims.width}×${dims.height}` : 'inconnu',
      match,
    });
    if (match === false) process.exitCode = 1;
  }

  for (const f of generated) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* noop */
    }
  }
}

main().catch((err) => {
  logger.error('led-per-side: crash', { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
