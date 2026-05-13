// Studio POC — render server local.
// Pattern : bundle() au boot (1 fois, caché en mémoire), renderMedia() par requête,
// cache disque + mémoire par hash(compositionId + props). Réimplémente le pattern
// du sandbox batch.ts (withRetry transient errors, concurrency 2).
//
// V1 réel : ce code vivra dans central-server/src/services/studio-render-worker.service.ts
// avec poll PG sur render_requests au lieu d'un endpoint HTTP synchrone.

import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_REMOTION = path.resolve(__dirname, '..');
const ENTRY = path.join(TEMPLATES_REMOTION, 'src/index.ts');
const PUBLIC_DIR = path.join(TEMPLATES_REMOTION, 'public');
const RENDERS_DIR = path.join(__dirname, 'public/renders');

await fs.mkdir(RENDERS_DIR, { recursive: true });

// Retry transient Chromium errors (cf batch.ts).
const TRANSIENT_PATTERNS = [
  'ERR_NETWORK_CHANGED',
  'Could not extract frame from compositor',
  'Request closed',
  'Failed to fetch',
  'net::ERR_',
  'socket hang up',
  'ECONNRESET',
];
function isTransient(e) {
  const msg = e?.message ?? String(e);
  return TRANSIENT_PATTERNS.some((p) => msg.includes(p));
}
async function withRetry(label, fn, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || attempt === maxAttempts) throw e;
      const delayMs = 1500 * attempt;
      console.warn(
        `[retry] ${label} ${attempt}/${maxAttempts}: ${(e.message ?? '').split('\n')[0]} — retry ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// Bundle 1× au boot, partagé pour tous les renders.
console.log('[boot] bundling Remotion entry…');
const bundlePromise = bundle({
  entryPoint: ENTRY,
  publicDir: PUBLIC_DIR,
}).then((serveUrl) => {
  console.log(`[boot] bundle ready: ${serveUrl}`);
  return serveUrl;
});

const renderCache = new Map(); // hash → outPath

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/renders', express.static(RENDERS_DIR, { maxAge: '1h' }));

app.post('/api/render', async (req, res) => {
  const { compositionId, props, kind } = req.body ?? {};
  if (!compositionId) {
    return res.status(400).json({ error: 'compositionId required' });
  }
  if (kind !== 'video' && kind !== 'still') {
    return res.status(400).json({ error: 'kind must be "video" or "still"' });
  }
  // ENTREE garde son comportement legacy : startAtSec=6.6 pour capter la frame
  // finale du packshot avec révélation complète (utilisé par renderStill).
  // Pour video on force 0 pour rendre l'animation complète depuis le début.
  const rawProps = props ?? {};
  const inputProps =
    compositionId === 'JoueurEntreeGenerique' && kind === 'video'
      ? { ...rawProps, startAtSec: 0 }
      : rawProps;
  const ext = kind === 'still' ? 'png' : 'mp4';
  const hash = crypto
    .createHash('sha1')
    .update(kind + ':' + compositionId + JSON.stringify(inputProps))
    .digest('hex')
    .slice(0, 16);
  const filename = `${compositionId}_${hash}.${ext}`;
  const outPath = path.join(RENDERS_DIR, filename);
  const url = `/renders/${filename}`;

  if (renderCache.has(hash) && existsSync(outPath)) {
    return res.json({ url, cached: true, durationMs: 0 });
  }

  try {
    const serveUrl = await bundlePromise;
    const baseComposition = await withRetry('selectComposition', () =>
      selectComposition({ serveUrl, id: compositionId, inputProps }),
    );
    // Override durationInFrames pour ENTREE en mode video (Root.tsx la déclare
    // avec 1 frame parce qu'elle est designed pour renderStill).
    const composition =
      compositionId === 'JoueurEntreeGenerique' && kind === 'video'
        ? { ...baseComposition, durationInFrames: 175 }
        : baseComposition;

    const t0 = Date.now();
    if (kind === 'still') {
      await withRetry('renderStill', () =>
        renderStill({
          composition,
          serveUrl,
          output: outPath,
          inputProps,
          imageFormat: 'png',
          // Half-res preview, idem video.
          scale: 0.5,
          timeoutInMilliseconds: 60000,
        }),
      );
    } else {
      await withRetry('renderMedia', () =>
        renderMedia({
          composition,
          serveUrl,
          codec: 'h264',
          outputLocation: outPath,
          inputProps,
          concurrency: 4,
          scale: 0.5,
          timeoutInMilliseconds: 180000,
        }),
      );
    }
    const durationMs = Date.now() - t0;
    renderCache.set(hash, outPath);
    console.log(
      `[render] ${kind} ${compositionId} ${hash} → ${filename} (${(durationMs / 1000).toFixed(1)}s)`,
    );
    res.json({ url, cached: false, durationMs });
  } catch (e) {
    console.error('[render] failed', e);
    res.status(500).json({ error: e.message ?? String(e) });
  }
});

const PORT = 5175;
app.listen(PORT, () => {
  console.log(`[ready] Studio POC render server on http://127.0.0.1:${PORT}`);
});
