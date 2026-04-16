import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import logger from '../config/logger';
import { uploadVideoFromDisk } from './storage.service';
import {
  videoRepository,
  remotionTemplatesRepository,
  remotionRenderJobRepository,
  type RemotionRenderJob,
} from '../repositories';

/**
 * In-process Remotion render worker (ADR-054).
 *
 * Polls `remotion_render_jobs` every 5s, claims the oldest pending job with
 * FOR UPDATE SKIP LOCKED, runs the render, and writes progress + outcome back
 * to the row. Designed for Railway single-replica but safe for multi-replica
 * thanks to the atomic claim.
 *
 * One job at a time per process — Remotion itself is CPU/GPU intensive.
 */

const REMOTION_DIR = process.env.REMOTION_DIR
  || path.resolve(__dirname, '../../../../templates-remotion');
const REMOTION_ENTRY = path.join(REMOTION_DIR, 'src', 'index.ts');
const WORKER_ID = `node-${process.pid}`;
const POLL_INTERVAL_MS = 5_000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const CLEANUP_RETENTION_DAYS = 7;

// ── Bundle cache (in-process) ───────────────────────────────────────────────
let cachedBundleUrl: string | null = null;
let bundleInProgress: Promise<string> | null = null;

async function getOrCreateBundle(): Promise<string> {
  if (cachedBundleUrl) return cachedBundleUrl;
  if (bundleInProgress) return bundleInProgress;

  const { bundle } = await import('@remotion/bundler') as typeof import('@remotion/bundler');

  logger.info('Bundling Remotion entry (will be cached)', { entry: REMOTION_ENTRY });

  bundleInProgress = bundle({
    entryPoint: REMOTION_ENTRY,
    publicDir: path.join(REMOTION_DIR, 'public'),
  }).then((url) => {
    cachedBundleUrl = url;
    bundleInProgress = null;
    logger.info('Remotion bundle cached', { url });
    return url;
  }).catch((err) => {
    bundleInProgress = null;
    throw err;
  });

  return bundleInProgress;
}

export function prewarmRemotionBundle(): void {
  if (!fs.existsSync(REMOTION_DIR)) {
    logger.debug('Remotion prewarm skipped — REMOTION_DIR not found', { REMOTION_DIR });
    return;
  }
  getOrCreateBundle().catch((err) => {
    logger.warn('Remotion prewarm failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

// ── Render pipeline ─────────────────────────────────────────────────────────

async function runRemotionRender(
  compositionId: string,
  outputPath: string,
  inputProps: Record<string, unknown>,
  jobId: string,
): Promise<void> {
  const { renderMedia, selectComposition } = await import('@remotion/renderer') as typeof import('@remotion/renderer');
  const browserExecutable = process.env.BROWSER_EXECUTABLE_PATH || undefined;

  // Phase: bundling (1-10%) — already mostly cached via prewarm
  await remotionRenderJobRepository.updateProgress(jobId, 2, 'bundling');
  const bundled = await getOrCreateBundle();

  // Phase: selecting (10-15%)
  await remotionRenderJobRepository.updateProgress(jobId, 10, 'selecting');
  const chromiumOptions = { gl: 'swangle' as const, headless: true };
  const composition = await selectComposition({
    serveUrl: bundled,
    id: compositionId,
    inputProps,
    chromiumOptions,
    browserExecutable,
    timeoutInMilliseconds: 90000,
  });

  // Phase: rendering (15-95%) — driven by Remotion onProgress
  await remotionRenderJobRepository.updateProgress(jobId, 15, 'rendering');
  let lastWrittenProgress = 15;

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    chromiumOptions,
    browserExecutable,
    timeoutInMilliseconds: 90000,
    pixelFormat: 'yuv420p',
    imageFormat: 'jpeg',
    jpegQuality: 85,
    concurrency: 2,
    crf: 18,
    onProgress: ({ progress }) => {
      // Map 0-1 from Remotion to 15-95 of our job progress
      const jobProgress = 15 + Math.round(progress * 80);
      // Throttle DB writes: only update when progress jumped at least 2 points
      if (jobProgress - lastWrittenProgress >= 2) {
        lastWrittenProgress = jobProgress;
        remotionRenderJobRepository.updateProgress(jobId, jobProgress).catch((err) => {
          logger.warn('Failed to write render progress', {
            jobId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    },
  });
}

async function processJob(job: RemotionRenderJob): Promise<void> {
  const outputPath = path.join(os.tmpdir(), `remotion-render-${job.id}.mp4`);

  try {
    const template = await remotionTemplatesRepository.findPublishedById(job.template_id);
    if (!template) {
      await remotionRenderJobRepository.markFailed(job.id, 'Template non trouvé ou non publié');
      return;
    }

    if (!fs.existsSync(REMOTION_DIR)) {
      await remotionRenderJobRepository.markFailed(
        job.id,
        'Moteur Remotion non disponible (REMOTION_DIR manquant)'
      );
      return;
    }

    logger.info('Render worker picked job', {
      jobId: job.id,
      templateId: job.template_id,
      compositionId: template.composition_id,
    });

    await runRemotionRender(template.composition_id, outputPath, job.props, job.id);

    const stat = fs.statSync(outputPath);
    if (stat.size === 0) throw new Error('Remotion render produced empty file');

    // Phase: uploading (95-100%)
    await remotionRenderJobRepository.updateProgress(job.id, 95, 'uploading');

    const safeTitle = job.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    const storagePath = `videos/templates/${safeTitle}_${Date.now()}.mp4`;
    const uploadResult = await uploadVideoFromDisk(outputPath, stat.size, storagePath, 'video/mp4');
    if (!uploadResult) throw new Error('FTP upload failed');

    const video = await videoRepository.create({
      filename: storagePath.split('/').pop()!,
      original_name: `${job.title}.mp4`,
      category: 'templates',
      subcategory: template.name,
      file_size: stat.size,
      mime_type: 'video/mp4',
      storage_path: uploadResult.path,
      checksum: '',
      metadata: {
        title: job.title,
        remotion_template_id: job.template_id,
        remotion_render_job_id: job.id,
        props: job.props,
      },
      uploaded_by: job.requested_by ?? null,
      uploaded_for_site_id: job.requested_for_site_id ?? null,
      upload_status: uploadResult.verified ? 'ready' : 'failed',
      upload_verified_at: uploadResult.verified ? new Date() : null,
      upload_verified_size: null,
    });

    await remotionRenderJobRepository.markCompleted(job.id, {
      video_id: video.id,
      video_url: uploadResult.url,
      file_size: stat.size,
    });

    logger.info('Render job completed', {
      jobId: job.id,
      videoId: video.id,
      fileSize: stat.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Render job failed', { jobId: job.id, error: message });
    await remotionRenderJobRepository.markFailed(job.id, message);
  } finally {
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {
      // non-bloquant
    }
  }
}

// ── Worker loop ─────────────────────────────────────────────────────────────

let pollTimer: NodeJS.Timeout | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;
let isProcessing = false;
let stopped = false;

async function runCleanup(): Promise<void> {
  try {
    const deleted = await remotionRenderJobRepository.cleanupOlderThan(CLEANUP_RETENTION_DAYS);
    if (deleted > 0) {
      logger.info('Render jobs cleaned up', { deleted, retentionDays: CLEANUP_RETENTION_DAYS });
    }
  } catch (err) {
    logger.warn('Render job cleanup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function pollOnce(): Promise<void> {
  if (isProcessing || stopped) return;
  try {
    const job = await remotionRenderJobRepository.claimNextPending(WORKER_ID);
    if (!job) return;
    isProcessing = true;
    await processJob(job);
  } catch (error) {
    logger.error('Render worker poll error', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isProcessing = false;
  }
}

export function startRenderWorker(): void {
  if (pollTimer) return;

  // On startup, any running job claimed by a previous process is stale.
  remotionRenderJobRepository.failStaleRunningJobs(10).then((count) => {
    if (count > 0) logger.info('Marked stale running render jobs as failed', { count });
  }).catch((err) => {
    logger.warn('Failed to cleanup stale render jobs', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  stopped = false;
  pollTimer = setInterval(() => {
    pollOnce().catch((err) => {
      logger.error('Render worker unhandled error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, POLL_INTERVAL_MS);
  pollTimer.unref();

  // Daily cleanup of completed/failed jobs older than 7 days.
  cleanupTimer = setInterval(() => {
    runCleanup().catch(() => { /* already logged in runCleanup */ });
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  logger.info('Remotion render worker started', { workerId: WORKER_ID, intervalMs: POLL_INTERVAL_MS });
}

export function stopRenderWorker(): void {
  stopped = true;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  logger.info('Remotion render worker stopped');
}
