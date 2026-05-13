/**
 * Templates Studio V1 — worker de rendu async (J5 walking skeleton).
 *
 * Spec : studio-template/templates-remotion/spec/STUDIO_V1.md §7
 *
 * Poll PG (`render_requests WHERE status='queued'`) toutes les 2s, claim atomic
 * via `FOR UPDATE SKIP LOCKED`, délègue le render à un service HTTP séparé.
 *
 * **Architecture (cf STUDIO_V1.md §3 "container Railway Remotion séparé")** :
 * Le central est orchestrateur (tenant + queue + state). Le rendu réel
 * (`bundle() + renderMedia()`) vit dans un service spécialiste (le POC
 * `studio-template/studio-poc/server.mjs` pour l'instant — déploiement Railway
 * dédié à instaurer en prod).
 *
 * **Fallback STUB** si `STUDIO_renderServerUrl` env est absente : la prod
 * peut booter avant que le render server soit déployé séparément. Le STUB
 * écrit une URL placeholder, suffisant pour démontrer la state machine.
 *
 * Invariants protégés par le smoke `smoke-templates-studio` :
 * - Pas d'import `@remotion/renderer` côté central (le rendu est délégué HTTP)
 * - `failStaleRunning(10)` appelé au boot avant le premier poll
 * - Pattern singleton (cf `.claude/rules/services.md`)
 */

import logger from '../config/logger';
import {
  renderRequestRepository,
  templateDefinitionRepository,
} from '../repositories';

const POLL_INTERVAL_MS = 2_000;
const STALE_RUNNING_MAX_AGE_MIN = 10;
// HTTP timeout par render. Aligné sur le POC : compo lourde (5 layers VP9 +
// masques PNG) prend 60-180s à demi-résolution. 5min de marge pour le premier
// render qui inclut le bundle warmup côté render server.
const RENDER_TIMEOUT_MS = 5 * 60 * 1000;
// Lu à chaque tick (pas à l'import) — facilite les tests + permet à un opérateur
// de toggle le mode HTTP/STUB sans redéployer.
function getRenderServerUrl(): string | null {
  return process.env.STUDIO_RENDER_SERVER_URL ?? null;
}

let timerHandle: NodeJS.Timeout | null = null;
let stopping = false;

interface RenderServerResponse {
  url: string;
  cached: boolean;
  durationMs: number;
}

/**
 * Délègue le render au service HTTP séparé (POC `studio-poc/server.mjs`).
 * Retourne l'URL absolue où le MP4/PNG est accessible.
 */
async function performRenderHttp(
  serverUrl: string,
  compositionId: string,
  kind: 'video' | 'still',
  props: Record<string, unknown>,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
  try {
    const res = await fetch(`${serverUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compositionId, kind, props }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`render server ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as RenderServerResponse;
    // Le service retourne un path relatif (`/renders/...`). On le préfixe avec
    // l'URL du serveur pour que le central stocke une URL absolue exploitable
    // par le frontend. En prod, le render service uploadera lui-même sur FTP
    // et retournera l'URL kalonpartners.bzh directement (cf TODO §3 du spec).
    return data.url.startsWith('http')
      ? data.url
      : `${serverUrl.replace(/\/$/, '')}${data.url}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * STUB fallback — utilisé si STUDIO_renderServerUrl n'est pas configurée.
 * Garde la state machine fonctionnelle pour démos/dev sans render server up.
 */
async function performRenderStub(requestId: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 2_000));
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

  const serverUrl = getRenderServerUrl();
  try {
    let outputUrl: string;
    if (serverUrl) {
      // Charge le template pour récupérer le compositionId Remotion + kind.
      const template = await templateDefinitionRepository.findById(
        request.template_id,
      );
      if (!template) {
        throw new Error(`template ${request.template_id} not found in DB`);
      }
      outputUrl = await performRenderHttp(
        serverUrl,
        template.remotion_composition_id,
        template.kind,
        request.props_json,
      );
    } else {
      logger.warn(
        'studio-render-worker: STUDIO_RENDER_SERVER_URL not set — using STUB',
        { request_id: request.id },
      );
      outputUrl = await performRenderStub(request.id);
    }
    await renderRequestRepository.markReady(request.id, outputUrl);
    logger.info('studio-render-worker: render ready', {
      request_id: request.id,
      output_url: outputUrl,
      mode: serverUrl ? 'http' : 'stub',
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
