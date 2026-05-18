/**
 * Templates Studio — cache filesystem des assets FTP.
 *
 * Au boot du worker, télécharge tous les assets bound aux templates (WebM, MP4,
 * fonts OTF, séquences PNG frames) depuis le FTP Hostinger vers `/app/cache/
 * studio-assets/<asset-id>/` et démarre un mini serveur HTTP sur 127.0.0.1
 * pour les servir.
 *
 * `resolveTemplateAssets()` (`studio-render-worker.service.ts`) appelle
 * `getCachedAssetUrl()` avant de fallback sur l'URL FTP publique. Quand le
 * cache est warm, Chromium fetch les assets en localhost (latence ~ms) au
 * lieu de cross-region FTP Hostinger → Railway (plusieurs minutes pour un
 * mask directory de 1.3 GB sur Hobby plan).
 *
 * Le cache survit tant que le container Railway tourne (filesystem éphémère
 * sur Hobby — refetch au prochain redeploy ou OOM restart). Les checksums
 * `studio_assets.file_size` permettent de skip les fichiers déjà cachés
 * (resume après crash).
 *
 * Bénéfice mesuré attendu : render `but_generique` 14 min → ~5-8 min sur
 * Hobby (élimine la latence FTP, garde le bridage CPU `concurrency: 1`).
 */

import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import logger from '../config/logger';
import { getFtpPublicUrl } from '../config/ftp-storage';
import {
  studioAssetRepository,
  templateAssetBindingRepository,
  type StudioAssetRow,
} from '../repositories';

const CACHE_DIR = path.resolve(
  process.env.STUDIO_ASSETS_CACHE_DIR ?? '/app/cache/studio-assets',
);
const DOWNLOAD_CONCURRENCY = 5;
const PER_FILE_TIMEOUT_MS = 60_000;
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+$/;

let cacheBaseUrl: string | null = null;
let serverInstance: http.Server | null = null;
const cachedAssetIds = new Set<string>();

/**
 * Retourne l'URL HTTP locale d'un asset caché, ou `null` si le cache n'est
 * pas warm (preload pas fini ou erreur). Le worker render fallback alors sur
 * l'URL FTP publique (= comportement pré-ADR pour cet asset).
 *
 * Pour un asset directory : retourne le base URL terminé par `/` (le caller
 * append le filename de la frame interpolée via `framePattern`).
 * Pour un asset file : retourne l'URL complète incluant le filename.
 */
export function getCachedAssetUrl(
  asset: Pick<StudioAssetRow, 'id' | 'asset_kind' | 'filename'>,
): string | null {
  if (!cacheBaseUrl || !cachedAssetIds.has(asset.id)) return null;
  if (asset.asset_kind === 'directory') {
    return `${cacheBaseUrl}/${asset.id}/`;
  }
  return `${cacheBaseUrl}/${asset.id}/${encodeURIComponent(asset.filename)}`;
}

async function downloadOne(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(PER_FILE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on ${url}`);
  }
  if (!response.body) {
    throw new Error(`empty body on ${url}`);
  }
  // Write to a `.part` file first then rename — évite qu'un crash mid-download
  // laisse un fichier tronqué qui passerait la vérification de taille au resume.
  const tmpPath = `${destPath}.part`;
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(tmpPath),
  );
  await fs.rename(tmpPath, destPath);
}

async function isAlreadyCached(destPath: string, expectedSize: number | null): Promise<boolean> {
  try {
    const stat = await fs.stat(destPath);
    if (expectedSize === null) return true;
    return stat.size === expectedSize;
  } catch {
    return false;
  }
}

function interpolateFrameName(pattern: string, idx: number): string {
  return pattern.replace(/\{i:0(\d+)d\}/, (_match, padding) =>
    String(idx).padStart(parseInt(padding, 10), '0'),
  );
}

async function cacheFileAsset(asset: StudioAssetRow): Promise<void> {
  const assetDir = path.join(CACHE_DIR, asset.id);
  await fs.mkdir(assetDir, { recursive: true });
  const destPath = path.join(assetDir, asset.filename);
  const expectedSize = asset.file_size !== null ? Number(asset.file_size) : null;
  if (await isAlreadyCached(destPath, expectedSize)) {
    cachedAssetIds.add(asset.id);
    return;
  }
  await downloadOne(getFtpPublicUrl(asset.ftp_path), destPath);
  cachedAssetIds.add(asset.id);
}

async function cacheDirectoryAsset(asset: StudioAssetRow): Promise<void> {
  if (!asset.frame_count || !asset.frame_pattern) {
    logger.warn('studio-assets-cache: skip directory without frame_count/pattern', {
      asset_id: asset.id,
      filename: asset.filename,
    });
    return;
  }
  const assetDir = path.join(CACHE_DIR, asset.id);
  await fs.mkdir(assetDir, { recursive: true });
  const baseUrlRaw = getFtpPublicUrl(asset.ftp_path);
  const baseUrl = baseUrlRaw.endsWith('/') ? baseUrlRaw : `${baseUrlRaw}/`;

  const frames = Array.from({ length: asset.frame_count }, (_unused, i) => i + 1);
  for (let start = 0; start < frames.length; start += DOWNLOAD_CONCURRENCY) {
    const batch = frames.slice(start, start + DOWNLOAD_CONCURRENCY);
    await Promise.all(
      batch.map(async (idx) => {
        const filename = interpolateFrameName(asset.frame_pattern!, idx);
        const destPath = path.join(assetDir, filename);
        if (await isAlreadyCached(destPath, null)) return;
        await downloadOne(`${baseUrl}${encodeURIComponent(filename)}`, destPath);
      }),
    );
  }
  cachedAssetIds.add(asset.id);
}

/**
 * Démarre un serveur HTTP localhost minimal pour servir le cache dir.
 * Port choisi par l'OS (`listen(0)`) pour éviter toute collision avec
 * l'API Express principale ou le bundle Remotion webpack-dev-server.
 *
 * Path sanitization stricte : assetId UUID format + filename alphanumeric
 * uniquement (anti path traversal). Refuse tout segment hors `[A-Za-z0-9._-]`.
 */
export function startStudioCacheServer(): Promise<void> {
  if (serverInstance) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length !== 2) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const [assetId, filename] = segments;
        if (
          !/^[0-9a-f-]{36}$/i.test(assetId) ||
          !SAFE_FILENAME_RE.test(decodeURIComponent(filename))
        ) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const filePath = path.join(CACHE_DIR, assetId, decodeURIComponent(filename));
        const stat = await fs.stat(filePath);
        res.statusCode = 200;
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
        const stream = (await fs.open(filePath, 'r')).createReadStream();
        stream.pipe(res);
      } catch {
        res.statusCode = 404;
        res.end();
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) {
        reject(new Error('studio-assets-cache: unexpected listen address'));
        return;
      }
      cacheBaseUrl = `http://127.0.0.1:${address.port}`;
      serverInstance = server;
      logger.info('studio-assets-cache: server started', { url: cacheBaseUrl });
      resolve();
    });
  });
}

export function stopStudioCacheServer(): void {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
    cacheBaseUrl = null;
  }
}

/**
 * Précharge tous les assets bound aux templates actifs (one-shot au boot).
 *
 * Non-bloquant pour le worker : si un render arrive avant que le preload
 * soit terminé, `getCachedAssetUrl()` retourne `null` pour les assets non
 * encore cachés → fallback FTP comme avant.
 *
 * Skip atomique des assets déjà sur disque (resume après crash via
 * comparaison `file_size` DB ↔ stat fs). Un asset directory dont les N
 * frames sont déjà toutes cachées passe en seconds, pas en minutes.
 */
export async function preloadStudioAssets(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const bindings = await templateAssetBindingRepository.findAll();
  const uniqueAssetIds = Array.from(new Set(bindings.map((b) => b.asset_id)));

  const startedAt = Date.now();
  logger.info('studio-assets-cache: preload start', {
    asset_count: uniqueAssetIds.length,
    cache_dir: CACHE_DIR,
  });

  for (const assetId of uniqueAssetIds) {
    const asset = await studioAssetRepository.findById(assetId);
    if (!asset) {
      logger.warn('studio-assets-cache: bound asset not found in DB', { asset_id: assetId });
      continue;
    }
    try {
      if (asset.asset_kind === 'directory') {
        await cacheDirectoryAsset(asset);
      } else {
        await cacheFileAsset(asset);
      }
      logger.info('studio-assets-cache: asset cached', {
        asset_id: asset.id,
        kind: asset.asset_kind,
        filename: asset.filename,
      });
    } catch (error) {
      logger.error('studio-assets-cache: cache asset failed', {
        asset_id: asset.id,
        filename: asset.filename,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('studio-assets-cache: preload done', {
    duration_ms: Date.now() - startedAt,
    cached_count: cachedAssetIds.size,
    total: uniqueAssetIds.length,
  });
}

/** Test helper — reset state between tests. Pas exporté en API publique. */
export function __resetStudioAssetsCacheForTests(): void {
  cacheBaseUrl = null;
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
  cachedAssetIds.clear();
}
