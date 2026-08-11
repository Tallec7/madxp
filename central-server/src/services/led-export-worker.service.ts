/**
 * LED export — worker de pliage async (in-process).
 *
 * Spec : `docs/specs/features/led-perimeter.spec.md` (PROP-014 étape 6, ADR-134).
 *
 * Poll `led_export_jobs WHERE status='queued'` toutes les 2s, claim atomique via
 * `FOR UPDATE SKIP LOCKED`, télécharge la vidéo source, l'adapte au ruban du profil
 * LED et la plie via ffmpeg (`applyFoldExport`, pas de Chromium → pas d'OOM), upload
 * le MP4 plié sur FTP, met à jour la row.
 *
 * Même pattern que `studio-render-worker.service.ts` : singleton, `failStaleRunning`
 * au boot (anti-orphan), timer `unref()`.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import logger from '../config/logger';
import {
  ledExportJobRepository,
  videoVariantRepository,
  videoRepository,
  siteRepository,
  type LedExportJobRow,
  type VideoVariantSideFile,
} from '../repositories';
import { getVideoUrl, uploadVideoFromDisk } from './storage.service';
import {
  applyPerSideFold,
  normalizeLayout,
  computeSiteCanvas,
  parsePitchMm,
} from './led-fold.service';

const POLL_INTERVAL_MS = 2_000;
const STALE_PROCESSING_MAX_AGE_MIN = 15;

let timerHandle: NodeJS.Timeout | null = null;
let stopping = false;

/** Télécharge une URL (http/https) vers un fichier disque. Suit un niveau de redirect. */
function downloadToFile(url: string, dest: string, redirects = 3): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('http://') ? http : https;
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('too many redirects'));
        return resolve(downloadToFile(res.headers.location, dest, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`download failed: HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (err) => reject(err));
    });
    req.on('error', (err) => reject(err));
  });
}

/** Résout le profil LED (ruban + géométrie + params bruts) du display led-perimeter d'un site. */
async function resolveGeometry(siteId: string) {
  const displays = await siteRepository.getDisplays(siteId);
  const led = displays.find((d) => d.type === 'led-perimeter')?.led;
  if (!led || !Array.isArray(led.sides) || led.sides.length === 0) {
    throw new Error('profil LED introuvable ou incomplet sur le site');
  }

  // Canvas = fonction du TERRAIN uniquement (ADR-138). Un seul appel, un seul
  // résultat : plus de branche selon le contenu.
  const canvas = computeSiteCanvas(led);
  const pitchMm = parsePitchMm(led.pitch);

  if (canvas.confirmedIsStale) {
    // La valeur figée par l'installateur décrit ce qui est gravé dans le
    // processeur : on ne l'écrase pas, on la signale.
    logger.warn('led-export-worker: band_count figé ≠ dérivé — config processeur à re-confirmer', {
      siteId,
      confirmed: canvas.confirmedBandCount,
      derived: canvas.derivedBandCount,
    });
  }

  // Cadence du motif en px (= espacement_m × px/m) pour le pavage repeated/scrolling.
  const spacingM = typeof led.spacing_m === 'number' && led.spacing_m > 0 ? led.spacing_m : 10;
  const cellPx = Math.max(1, Math.round(spacingM * (1000 / pitchMm)));

  return { canvas, cellPx, sides: led.sides.length };
}


/** Téléverse le MP4 plié produit et renvoie son URL publique. */
async function uploadFolded(jobId: string, tmpOut: string): Promise<string> {
  const yyyymm = new Date().toISOString().slice(0, 7);
  const filename = `led-exports/${yyyymm}/${jobId}.mp4`;
  const stat = await fs.promises.stat(tmpOut);
  const upload = await uploadVideoFromDisk(tmpOut, stat.size, filename, 'video/mp4');
  if (!upload || !upload.url) {
    throw new Error('FTP upload returned no URL');
  }
  return upload.url;
}

/**
 * Compose le canvas plié d'un site — **chemin unique** (ADR-138).
 *
 * La géométrie vient de `computeSiteCanvas()` : elle ne dépend QUE du terrain,
 * jamais du contenu. Avant, une variante « par côté » et une variante uniforme
 * produisaient deux canvas de hauteurs différentes pour le même club, alors
 * qu'un processeur est gravé une fois à l'installation.
 *
 * Le contenu ne décide plus que des SOURCES :
 *  - variante par côté  → `side_files[i]` pour le côté `i` ;
 *  - variante uniforme  → la même source répétée sur tous les côtés.
 */
async function performExport(job: LedExportJobRow): Promise<string> {
  const variant = await videoVariantRepository.findByVideoAndDisplay(job.video_id, job.display_type);

  // Source uniforme de repli : variante led-perimeter, sinon binaire principal.
  let uniformPath = variant?.storage_path ?? null;
  if (!uniformPath) {
    // findVideoById aliase `storage_path AS url` → le chemin FTP est dans `.url`.
    const video = await videoRepository.findVideoById(job.video_id);
    uniformPath = video?.url ?? null;
  }

  const { canvas, cellPx, sides } = await resolveGeometry(job.site_id);
  const sideFiles = (variant?.side_files ?? []) as VideoVariantSideFile[];

  const tmpFiles: string[] = [];
  const tmpOut = path.join(os.tmpdir(), `led-export-out-${job.id}.mp4`);

  try {
    // Les côtés partagent presque toujours la même source (motif répété tout autour).
    // Télécharger le même fichier une fois par côté, c'était 4 téléchargements et 4
    // copies disque pour une seule vidéo. On mémoïse par storage_path.
    const inputs: string[] = [];
    const downloaded = new Map<string, string>();
    for (let i = 0; i < sides; i++) {
      const sp = sideFiles.find((s) => s.side_index === i)?.storage_path ?? uniformPath;
      if (!sp) {
        throw new Error(`côté ${i} sans fichier et aucune source de repli`);
      }
      let tmp = downloaded.get(sp);
      if (!tmp) {
        tmp = path.join(os.tmpdir(), `led-src-${job.id}-${downloaded.size}.mp4`);
        await downloadToFile(getVideoUrl(sp), tmp);
        downloaded.set(sp, tmp);
        tmpFiles.push(tmp);
      }
      inputs.push(tmp);
    }

    logger.info('led-export-worker: composing', {
      jobId: job.id,
      sides,
      perSide: sideFiles.length > 0,
      bandCount: canvas.derivedBandCount,
      canvas: `${canvas.canvasWidth}x${canvas.canvasHeight}`,
    });

    const result = await applyPerSideFold(canvas.geometry, {
      inputs,
      outputPath: tmpOut,
      layout: normalizeLayout(job.layout),
      cellPx,
    });
    if (!result.success) {
      throw new Error(result.error ?? 'fold failed');
    }
    return await uploadFolded(job.id, tmpOut);
  } finally {
    tmpFiles.forEach((f) => fs.promises.unlink(f).catch(() => undefined));
    fs.promises.unlink(tmpOut).catch(() => undefined);
  }
}

async function processOne(): Promise<boolean> {
  const job = await ledExportJobRepository.claimNextQueued();
  if (!job) return false;

  logger.info('led-export-worker: claimed job', {
    jobId: job.id,
    site_id: job.site_id,
    video_id: job.video_id,
    display_type: job.display_type,
    layout: job.layout ?? `fit:${job.fit}`,
  });

  try {
    const outputUrl = await performExport(job);
    await ledExportJobRepository.markReady(job.id, outputUrl);
    logger.info('led-export-worker: job ready', { jobId: job.id, output_url: outputUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ledExportJobRepository.markFailed(job.id, message);
    logger.error('led-export-worker: job failed', { jobId: job.id, error: message });
  }
  return true;
}

/**
 * Un seul tick à la fois.
 *
 * `setInterval` ne connaît pas la durée d'un tick asynchrone : un pliage dure de
 * quelques secondes à plusieurs minutes, donc sans cette garde un nouveau tick
 * démarrait toutes les 2 s et réclamait un job de plus. Chaque job ouvrant un ffmpeg
 * qui décode la source une fois par côté, la concurrence réelle grimpait à des
 * dizaines de décodeurs h264 sur un conteneur Railway — d'où
 * « Error while opening decoder : Resource temporarily unavailable » sur près d'un
 * job sur deux (24 échecs sur 52 chez Piraths, 2026-08-11).
 *
 * Le pliage n'a aucune raison d'être parallèle : c'est du batch de fond, pas une
 * requête utilisateur. Une file sérialisée est plus lente mais elle aboutit.
 */
let ticking = false;

async function tick(): Promise<void> {
  if (stopping || ticking) return;
  ticking = true;
  try {
    while (await processOne()) {
      if (stopping) return;
    }
  } catch (error) {
    logger.error('led-export-worker: tick failed', { error });
  } finally {
    ticking = false;
  }
}

export async function startLedExportWorker(): Promise<void> {
  try {
    const recovered = await ledExportJobRepository.failStaleRunning(STALE_PROCESSING_MAX_AGE_MIN);
    if (recovered > 0) {
      logger.warn('led-export-worker: recovered stale processing jobs', { count: recovered });
    }
  } catch (error) {
    logger.warn('led-export-worker: stale recovery skipped', { error });
  }

  stopping = false;
  timerHandle = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  timerHandle.unref();

  logger.info('led-export-worker: started', { poll_interval_ms: POLL_INTERVAL_MS });
}

export function stopLedExportWorker(): void {
  stopping = true;
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

export const ledExportWorker = {
  start: startLedExportWorker,
  stop: stopLedExportWorker,
};

export default ledExportWorker;
