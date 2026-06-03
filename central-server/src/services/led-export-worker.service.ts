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
} from '../repositories';
import { getVideoUrl, uploadVideoFromDisk } from './storage.service';
import { computeRibbonDimensions, computeFoldGeometry, applyFoldExport, normalizeLayout } from './led-fold.service';

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

/** Résout le profil LED (ruban + géométrie) du display led-perimeter d'un site. */
async function resolveGeometry(siteId: string) {
  const displays = await siteRepository.getDisplays(siteId);
  const led = displays.find((d) => d.type === 'led-perimeter')?.led;
  if (!led || !Array.isArray(led.sides) || led.sides.length === 0) {
    throw new Error('profil LED introuvable ou incomplet sur le site');
  }
  const pitchMm = parseFloat(String(led.pitch).replace(/^P/i, ''));
  if (!Number.isFinite(pitchMm) || pitchMm <= 0) {
    throw new Error(`pitch invalide: ${led.pitch}`);
  }
  const bandWidth = led.canvas_in?.band_width ?? 1920;
  const { ribbonWidth, ribbonHeight } = computeRibbonDimensions({
    sides: led.sides,
    pitchMm,
    height: led.height,
  });
  const geometry = computeFoldGeometry({ ribbonWidth, ribbonHeight, bandWidth });
  // Cadence du motif en px (= espacement_m × px/m) pour le pavage 'repeated'/'scrolling'.
  const spacingM = typeof led.spacing_m === 'number' && led.spacing_m > 0 ? led.spacing_m : 10;
  const cellPx = Math.max(1, Math.round(spacingM * (1000 / pitchMm)));
  return { geometry, cellPx };
}

async function performExport(job: LedExportJobRow): Promise<string> {
  // Source à plier : la variante led-perimeter si elle existe (export "officiel"
  // d'une vidéo déjà déclinée), sinon le binaire principal de la vidéo (banc
  // d'essai — l'opérateur teste n'importe quelle vidéo sans variante dédiée).
  const variant = await videoVariantRepository.findByVideoAndDisplay(job.video_id, job.display_type);
  let sourcePath = variant?.storage_path ?? null;
  if (!sourcePath) {
    // findVideoById aliase `storage_path AS url` → le chemin FTP est dans `.url`.
    const video = await videoRepository.findVideoById(job.video_id);
    sourcePath = video?.url ?? null;
  }
  if (!sourcePath) {
    throw new Error(`aucune source à plier pour la vidéo ${job.video_id}`);
  }

  const { geometry, cellPx } = await resolveGeometry(job.site_id);
  const inputUrl = getVideoUrl(sourcePath);

  const tmpIn = path.join(os.tmpdir(), `led-export-in-${job.id}.mp4`);
  const tmpOut = path.join(os.tmpdir(), `led-export-out-${job.id}.mp4`);

  try {
    logger.info('led-export-worker: downloading source', { jobId: job.id, inputUrl });
    await downloadToFile(inputUrl, tmpIn);

    const result = await applyFoldExport(geometry, {
      inputPath: tmpIn,
      outputPath: tmpOut,
      layout: normalizeLayout(job.layout),
      cellPx,
    });
    if (!result.success) {
      throw new Error(result.error ?? 'fold export failed');
    }

    const yyyymm = new Date().toISOString().slice(0, 7);
    const filename = `led-exports/${yyyymm}/${job.id}.mp4`;
    const stat = await fs.promises.stat(tmpOut);
    const upload = await uploadVideoFromDisk(tmpOut, stat.size, filename, 'video/mp4');
    if (!upload || !upload.url) {
      throw new Error('FTP upload returned no URL');
    }
    return upload.url;
  } finally {
    fs.promises.unlink(tmpIn).catch(() => undefined);
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

async function tick(): Promise<void> {
  if (stopping) return;
  try {
    while (await processOne()) {
      if (stopping) return;
    }
  } catch (error) {
    logger.error('led-export-worker: tick failed', { error });
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
