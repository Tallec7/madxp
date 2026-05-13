/**
 * Templates Studio V1 — worker de rendu async (J4 walking skeleton).
 *
 * Spec : studio-template/templates-remotion/spec/STUDIO_V1.md §7
 *
 * Poll PG (`render_requests WHERE status='queued'`) toutes les 2s, claim atomic
 * via `FOR UPDATE SKIP LOCKED`, simule un rendu (STUB J4), met à jour la row.
 *
 * **STUB ÉTAT J4** : la fonction `performRender()` simule un rendu de 2s et
 * retourne une URL FTP placeholder. Le branchement réel sur
 * `bundle() + renderMedia()` (déjà dérisqué dans le POC `studio-template/`)
 * viendra dans un commit ultérieur. Le commit J4 garantit uniquement
 * l'intégration spine : poll → claim → state machine → markReady/markFailed.
 *
 * Invariants protégés par le smoke `smoke-templates-studio` :
 * - Aucun import `@remotion/renderer` ici en J4 (vient plus tard, contrôlé)
 * - `failStaleRunning(10)` appelé au boot avant le premier poll
 * - Pattern singleton (cf `.claude/rules/services.md`)
 */

import logger from '../config/logger';
import { renderRequestRepository } from '../repositories';

const POLL_INTERVAL_MS = 2_000;
const STALE_RUNNING_MAX_AGE_MIN = 10;

let timerHandle: NodeJS.Timeout | null = null;
let stopping = false;

/**
 * Simule un rendu. Sera remplacé par un appel à `bundle() + renderMedia()`
 * (déjà dérisqué dans le POC `studio-template/templates-remotion/studio-poc/server.mjs`).
 */
async function performRender(requestId: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 2_000));
  // Placeholder URL — pattern aligné sur la convention §9 du spec :
  // `renders/{YYYY-MM}/{uuid}.mp4` servi via `https://kalonpartners.bzh/neopro-video/...`
  const yyyymm = new Date().toISOString().slice(0, 7);
  return `https://kalonpartners.bzh/neopro-video/renders/${yyyymm}/${requestId}.mp4`;
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
    const outputUrl = await performRender(request.id);
    await renderRequestRepository.markReady(request.id, outputUrl);
    logger.info('studio-render-worker: render ready', {
      request_id: request.id,
      output_url: outputUrl,
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
    // Évite le retard de N*POLL_INTERVAL pour drainer N jobs lors d'un burst.
    while (await processOne()) {
      if (stopping) return;
    }
  } catch (error) {
    logger.error('studio-render-worker: tick failed', { error });
  }
}

export async function startStudioRenderWorker(): Promise<void> {
  // Garde-fou boot : remet en queued les rows 'rendering' orphelines.
  // Sans ça, une row claimée par un process mort reste bloquée ad vitam.
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

  stopping = false;
  // Fire-and-forget poll. setInterval suffit — pas besoin d'orchestrateur lourd.
  timerHandle = setInterval(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    tick();
  }, POLL_INTERVAL_MS);
  timerHandle.unref(); // Ne pas empêcher le shutdown du process

  logger.info('studio-render-worker: started', {
    poll_interval_ms: POLL_INTERVAL_MS,
  });
}

export function stopStudioRenderWorker(): void {
  stopping = true;
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

// Pattern singleton minimal — un seul timer par process.
export const studioRenderWorker = {
  start: startStudioRenderWorker,
  stop: stopStudioRenderWorker,
};
