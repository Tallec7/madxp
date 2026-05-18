/**
 * Templates Studio — worker de détourage photo joueur (in-process).
 *
 * Spec : `docs/specs/features/templates-studio.spec.md`
 *
 * Poll PG (`players WHERE cutout_status='pending'`) toutes les 5s, claim
 * atomic via `FOR UPDATE SKIP LOCKED`, télécharge `photo_raw_url`,
 * applique `removeBackground` (lib npm chargée à la demande), upload PNG
 * cutout sur FTP sous `players/{site_id}/{player_id}-cutout.png`, met à
 * jour la row.
 *
 * **Architecture (ADR-124)** : remplace l'ancien `python-rembg-worker`
 * (container Python séparé). Le central a déjà tout ce qu'il faut côté
 * Node, pas besoin de tooling ML séparé pour le volume V1 (5-50 photos/jour).
 *
 * **ADR-124 Phase 2 (2026-05-18)** : la lib npm `@imgly/background-removal-node`
 * (ONNX + BiRefNet) est désormais installée. Le mock jest global dans
 * `src/__tests__/setup.ts` neutralise la pollution `RawModule is not a
 * constructor` qui bloquait Phase 1. Heap Node passé à 1024 MB pour
 * accommoder ONNX runtime + modèle BiRefNet en RAM. Le require dynamique
 * ci-dessous reste tel quel pour la safety net (si la lib échoue à charger
 * pour une raison ENV, le worker marque `failed` au lieu de crasher).
 *
 * Invariants :
 * - `failStaleProcessingCutouts(10)` au boot (anti-orphan)
 * - Pattern singleton (un seul timer par process)
 */

import logger from '../config/logger';
import { uploadFileToFtp } from '../config/ftp-storage';
import { playerRepository } from '../repositories';
import type { PlayerRow } from '../repositories';

const POLL_INTERVAL_MS = 5_000;
const STALE_PROCESSING_MAX_AGE_MIN = 10;
const DOWNLOAD_TIMEOUT_MS = 60_000;

let timerHandle: NodeJS.Timeout | null = null;
let stopping = false;

// ── Lazy load de la lib rembg ───────────────────────────────────────────────
// ADR-124 Phase 2 : la lib `@imgly/background-removal-node` est installée
// (cf. doc de tête). Le require reste dynamique pour 2 raisons : (1) éviter
// le coût d'init ONNX au module-load des process qui n'exécutent pas le
// worker (CRON, web handlers), et (2) garder la safety net qui marque
// `failed` au lieu de crasher si l'init échoue à cause d'un env Linux
// inattendu (native bindings ONNX manquantes).
type RemoveBackgroundFn = (input: Blob) => Promise<Blob>;
let removeBgFn: RemoveBackgroundFn | null | undefined;

async function getRemoveBg(): Promise<RemoveBackgroundFn | null> {
  if (removeBgFn !== undefined) return removeBgFn;
  try {
    // require dynamique pour éviter la résolution statique TS qui forcerait
    // l'install de la dep côté typage. La lib n'est pas dans package.json
    // pour l'instant (cf. note de tête du fichier).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@imgly/background-removal-node') as {
      removeBackground: RemoveBackgroundFn;
    };
    removeBgFn = mod.removeBackground;
  } catch {
    removeBgFn = null;
  }
  return removeBgFn;
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`download failed ${res.status}: ${url}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Détecte le mime image via les magic bytes (en-tête binaire), indépendamment
 * du `Content-Type` HTTP qui peut être absent/inexact selon le serveur FTP.
 *
 * Pourquoi : `@imgly/background-removal-node` lit `Blob.type` pour choisir
 * son décodeur. Un Blob sans type (`new Blob([buf])` → `type: ''`) fait crasher
 * la lib avec `Unsupported format: ` (vide). Incident 2026-05-18.
 */
function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  // WebP: RIFF .... WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

async function performCutout(rawBuffer: Buffer): Promise<Buffer | null> {
  const removeBackground = await getRemoveBg();
  if (!removeBackground) {
    // Lib non installée — on retourne null pour que le worker marque
    // le player `failed` proprement (vs throw qui casserait le drain).
    return null;
  }
  // `Blob.type` doit être un mime image reconnu par @imgly, sinon "Unsupported
  // format: " (incident 2026-05-18). Les uploads passent par
  // `ALLOWED_PHOTO_MIMES = jpeg|png|webp` côté controller, donc la détection
  // doit réussir sur les inputs légitimes.
  const mime = detectImageMime(rawBuffer);
  if (!mime) {
    throw new Error('Unsupported image format (no JPEG/PNG/WebP magic bytes)');
  }
  const blob = new Blob([rawBuffer], { type: mime });
  const outBlob = await removeBackground(blob);
  const arrayBuffer = await outBlob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function processOne(): Promise<boolean> {
  const player: PlayerRow | null = await playerRepository.claimNextPendingCutout();
  if (!player) return false;

  if (!player.photo_raw_url) {
    logger.warn('photo-cutout: claimed player has no raw URL — marking failed', {
      player_id: player.id,
    });
    await playerRepository.markCutoutFailed(player.id);
    return true;
  }

  logger.info('photo-cutout: claimed player', {
    player_id: player.id,
    site_id: player.site_id,
    raw_url: player.photo_raw_url,
  });

  try {
    const rawBuffer = await downloadBuffer(player.photo_raw_url);
    logger.info('photo-cutout: downloaded raw photo', {
      player_id: player.id,
      bytes: rawBuffer.length,
    });

    const cutoutBuffer = await performCutout(rawBuffer);
    if (!cutoutBuffer) {
      // Lib rembg absente — mark failed et continue (graceful degradation).
      logger.warn('photo-cutout: skipped — rembg lib not installed', {
        player_id: player.id,
      });
      await playerRepository.markCutoutFailed(player.id);
      return true;
    }
    logger.info('photo-cutout: cutout produced', {
      player_id: player.id,
      bytes_in: rawBuffer.length,
      bytes_out: cutoutBuffer.length,
    });

    // Path cohérent avec le pattern photo brute (`players/{siteId}/{playerId}-raw-{hash}.{ext}`).
    // Note : `player.site_id` peut être NULL (joueur global, ADR-123). Dans ce
    // cas on namespace sous `global/` pour éviter une collision avec un site UUID.
    const siteSegment = player.site_id ?? 'global';
    const remotePath = `players/${siteSegment}/${player.id}-cutout.png`;
    const result = await uploadFileToFtp(cutoutBuffer, remotePath, 'image/png');
    if (!result || !result.url) {
      throw new Error('FTP upload returned no URL');
    }

    await playerRepository.markCutoutReady(player.id, result.url);
    logger.info('photo-cutout: ready', {
      player_id: player.id,
      cutout_url: result.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await playerRepository.markCutoutFailed(player.id);
    logger.error('photo-cutout: failed', {
      player_id: player.id,
      error: message,
    });
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
    logger.error('photo-cutout: tick failed', { error });
  }
}

export async function startPhotoCutoutWorker(): Promise<void> {
  // Anti-orphan : recover les rows 'processing' claimées par un process mort.
  try {
    const recovered = await playerRepository.failStaleProcessingCutouts(
      STALE_PROCESSING_MAX_AGE_MIN,
    );
    if (recovered > 0) {
      logger.warn('photo-cutout: recovered stale processing rows', { count: recovered });
    }
  } catch (error) {
    logger.warn('photo-cutout: stale recovery skipped', { error });
  }

  stopping = false;
  timerHandle = setInterval(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    tick();
  }, POLL_INTERVAL_MS);
  timerHandle.unref();

  logger.info('photo-cutout: started', { poll_interval_ms: POLL_INTERVAL_MS });
}

export function stopPhotoCutoutWorker(): void {
  stopping = true;
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

// Pattern singleton — un seul timer par process.
export const photoCutoutWorker = {
  start: startPhotoCutoutWorker,
  stop: stopPhotoCutoutWorker,
};

export default photoCutoutWorker;
