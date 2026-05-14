/**
 * Templates Studio — worker de rendu async (in-process).
 *
 * Spec : `docs/specs/features/templates-studio.spec.md`
 *
 * Poll PG (`studio_render_requests WHERE status='queued'`) toutes les 2s,
 * claim atomic via `FOR UPDATE SKIP LOCKED`, fait le bundle Remotion
 * + render in-process, upload le MP4/PNG sur FTP, met à jour la row.
 *
 * **Architecture (ADR-124)** : tout in-process dans `central-server`. Le
 * bundle Remotion + `renderMedia()` / `renderStill()` tournent côté Node
 * via `@remotion/bundler` + `@remotion/renderer`. Chromium est installé au
 * runtime Docker (déjà présent depuis ADR-054 pour le legacy v2).
 *
 * Le code Remotion (compositions + manifests + assets) vit dans
 * `central-server/templates-studio/`. Le path est résolu via env
 * `TEMPLATES_STUDIO_DIR` (défaut Docker : `/app/templates-studio`) avec
 * fallback sur le path local pour les tests/dev.
 *
 * Invariants :
 * - `failStaleRunning(10)` appelé au boot (anti-orphan)
 * - Pattern singleton (un seul timer par process)
 * - Bundle caché in-process (le 1er render fait le bundle, les suivants
 *   réutilisent — comme le legacy `remotion-render-worker.service.ts`)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import logger from '../config/logger';
import { uploadVideoFromDisk } from './storage.service';
import {
  renderRequestRepository,
  templateDefinitionRepository,
} from '../repositories';

const POLL_INTERVAL_MS = 2_000;
const STALE_RUNNING_MAX_AGE_MIN = 10;

// Path du sous-package Remotion (compositions + manifests + assets).
// Au runtime Docker : `/app/templates-studio` (cf. Dockerfile central).
// En local : `central-server/templates-studio/` résolu depuis __dirname.
const TEMPLATES_STUDIO_DIR =
  process.env.TEMPLATES_STUDIO_DIR ?? path.resolve(__dirname, '../../templates-studio');
const TEMPLATES_STUDIO_ENTRY = path.join(TEMPLATES_STUDIO_DIR, 'index.ts');
const TEMPLATES_STUDIO_PUBLIC = path.join(TEMPLATES_STUDIO_DIR, 'public');

let timerHandle: NodeJS.Timeout | null = null;
let stopping = false;

// ── Bundle cache (in-process) ───────────────────────────────────────────────
// Un seul bundle pour toutes les compositions du registre `Root.tsx`. Le 1er
// render paie le coût (~5-10s), les suivants réutilisent le même `serveUrl`.
let cachedBundleUrl: string | null = null;
let bundleInProgress: Promise<string> | null = null;

async function getOrCreateBundle(): Promise<string> {
  if (cachedBundleUrl) return cachedBundleUrl;
  if (bundleInProgress) return bundleInProgress;

  const { bundle } = (await import('@remotion/bundler')) as typeof import('@remotion/bundler');

  logger.info('studio-render-worker: bundling Remotion entry', {
    entry: TEMPLATES_STUDIO_ENTRY,
  });

  bundleInProgress = bundle({
    entryPoint: TEMPLATES_STUDIO_ENTRY,
    publicDir: TEMPLATES_STUDIO_PUBLIC,
  })
    .then((url) => {
      cachedBundleUrl = url;
      bundleInProgress = null;
      logger.info('studio-render-worker: bundle cached', { url });
      return url;
    })
    .catch((err) => {
      bundleInProgress = null;
      throw err;
    });

  return bundleInProgress;
}

/**
 * Pré-warm optionnel : appelé au boot du process pour amortir le coût bundle
 * avant le premier render. Échec non-fatal (le 1er render relancera).
 */
export function prewarmStudioBundle(): void {
  if (!fs.existsSync(TEMPLATES_STUDIO_ENTRY)) {
    logger.debug('studio-render-worker: prewarm skipped — TEMPLATES_STUDIO_DIR not found', {
      TEMPLATES_STUDIO_DIR,
    });
    return;
  }
  getOrCreateBundle().catch((err) => {
    logger.warn('studio-render-worker: prewarm failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

// ── Render pipeline ─────────────────────────────────────────────────────────

async function performRenderInProcess(
  compositionId: string,
  kind: 'video' | 'still',
  inputProps: Record<string, unknown>,
  requestId: string,
): Promise<string> {
  const { renderMedia, renderStill, selectComposition } = (await import(
    '@remotion/renderer'
  )) as typeof import('@remotion/renderer');
  const browserExecutable = process.env.BROWSER_EXECUTABLE_PATH || undefined;
  const chromiumOptions = { gl: 'swangle' as const, headless: true };

  const bundled = await getOrCreateBundle();

  const composition = await selectComposition({
    serveUrl: bundled,
    id: compositionId,
    inputProps,
    chromiumOptions,
    browserExecutable,
    timeoutInMilliseconds: 90_000,
  });

  const ext = kind === 'still' ? '.png' : '.mp4';
  const tmpPath = path.join(os.tmpdir(), `studio-render-${requestId}${ext}`);

  if (kind === 'still') {
    await renderStill({
      composition,
      serveUrl: bundled,
      output: tmpPath,
      inputProps,
      chromiumOptions,
      browserExecutable,
      imageFormat: 'png',
      timeoutInMilliseconds: 90_000,
    });
  } else {
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: tmpPath,
      inputProps,
      chromiumOptions,
      browserExecutable,
      timeoutInMilliseconds: 90_000,
      pixelFormat: 'yuv420p',
      imageFormat: 'jpeg',
      jpegQuality: 85,
      concurrency: 2,
      crf: 18,
    });
  }

  // Upload FTP via la chaîne `storage.service` standard (mêmes credentials
  // + même bucket que pour les vidéos uploadées).
  const yyyymm = new Date().toISOString().slice(0, 7);
  const filename = `studio-renders/${yyyymm}/${requestId}${ext}`;
  const stat = await fs.promises.stat(tmpPath);
  const contentType = kind === 'still' ? 'image/png' : 'video/mp4';

  try {
    const result = await uploadVideoFromDisk(tmpPath, stat.size, filename, contentType);
    if (!result || !result.url) {
      throw new Error('FTP upload returned no URL');
    }
    return result.url;
  } finally {
    // Cleanup temp file (soft-fail — pas bloquant pour le render).
    fs.promises.unlink(tmpPath).catch(() => {
      /* noop */
    });
  }
}

async function processOne(): Promise<boolean> {
  const request = await renderRequestRepository.claimNextQueued();
  if (!request) return false;

  logger.info('studio-render-worker: claimed render request', {
    request_id: request.id,
    site_id: request.site_id,
    template_id: request.template_id,
  });

  try {
    const template = await templateDefinitionRepository.findById(request.template_id);
    if (!template) {
      throw new Error(`template ${request.template_id} not found in DB`);
    }

    const outputUrl = await performRenderInProcess(
      template.remotion_composition_id,
      template.kind,
      request.props_json,
      request.id,
    );

    await renderRequestRepository.markReady(request.id, outputUrl);
    logger.info('studio-render-worker: render ready', {
      request_id: request.id,
      output_url: outputUrl,
      kind: template.kind,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await renderRequestRepository.markFailed(request.id, message);
    logger.error('studio-render-worker: render failed', {
      request_id: request.id,
      error: message,
    });
  }
  return true;
}

async function tick(): Promise<void> {
  if (stopping) return;
  try {
    // Drain : on tente autant de jobs qu'il y en a dans la queue à chaque tick.
    while (await processOne()) {
      if (stopping) return;
    }
  } catch (error) {
    logger.error('studio-render-worker: tick failed', { error });
  }
}

export async function startStudioRenderWorker(): Promise<void> {
  // Garde-fou boot : remet en queued les rows 'rendering' orphelines.
  try {
    const recovered = await renderRequestRepository.failStaleRunning(
      STALE_RUNNING_MAX_AGE_MIN,
    );
    if (recovered > 0) {
      logger.warn('studio-render-worker: recovered stale rendering rows', {
        count: recovered,
      });
    }
  } catch (error) {
    logger.warn('studio-render-worker: stale recovery skipped', { error });
  }

  // Pré-warm le bundle au boot (non-bloquant). Évite la latence du 1er render.
  prewarmStudioBundle();

  stopping = false;
  timerHandle = setInterval(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    tick();
  }, POLL_INTERVAL_MS);
  timerHandle.unref();

  logger.info('studio-render-worker: started', {
    poll_interval_ms: POLL_INTERVAL_MS,
    templates_studio_dir: TEMPLATES_STUDIO_DIR,
  });
}

export function stopStudioRenderWorker(): void {
  stopping = true;
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

// Pattern singleton — un seul timer par process.
export const studioRenderWorker = {
  start: startStudioRenderWorker,
  stop: stopStudioRenderWorker,
  prewarm: prewarmStudioBundle,
};

export default studioRenderWorker;
