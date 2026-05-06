/**
 * Backfill JPEG posters for legacy WebM library assets — ADR-110.
 *
 * Lists every distinct `template_layers.video_url` referenced by ≥1 layer
 * (via templateStudioRepository.listDistinctLayerAssets), checks whether
 * the corresponding `<basename>.poster.jpg` already exists on FTP via
 * verifyFileExists, and if not :
 *   1. Downloads the WebM over HTTPS from its public FTP URL.
 *   2. Generates a JPEG poster (1ère frame, 320:-1, q=2) via
 *      thumbnailService.generateThumbnailBuffer.
 *   3. Uploads the poster to <storagePath>.poster.jpg via uploadAsset.
 *
 * Best-effort : individual failures are logged but never abort the run.
 * Exits 0 unless the whole pipeline is unconfigured.
 *
 * Usage : `cd central-server && npm run backfill:asset-posters`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

import logger from '../config/logger';
import { templateStudioRepository } from '../repositories/template-studio.repository';
import { thumbnailService } from '../services/thumbnail.service';
import {
  posterPathFromWebmPath,
} from '../services/asset-poster.service';
import {
  uploadAsset,
  verifyFileExists,
  isStorageConfigured,
} from '../services/storage.service';
import pool from '../config/database';

interface BackfillStats {
  total: number;
  skippedAlreadyExists: number;
  skippedUnparsableUrl: number;
  generated: number;
  failed: number;
}

const PUBLIC_BASE_URL = process.env.FTP_PUBLIC_URL || '';

/**
 * Derive the FTP storage path from a public URL by stripping
 * `FTP_PUBLIC_URL`. Returns null if the URL is not on our FTP.
 */
function storagePathFromUrl(url: string): string | null {
  if (!PUBLIC_BASE_URL) return null;
  const base = PUBLIC_BASE_URL.endsWith('/')
    ? PUBLIC_BASE_URL.slice(0, -1)
    : PUBLIC_BASE_URL;
  if (!url.startsWith(`${base}/`)) return null;
  return url.slice(base.length + 1);
}

function downloadToFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https://') ? https : http;
    const file = fs.createWriteStream(dest);
    const req = lib.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => undefined);
        downloadToFile(new URL(res.headers.location, url).toString(), dest)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => undefined);
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    req.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => undefined);
      reject(err);
    });
  });
}

async function backfillOne(url: string, stats: BackfillStats): Promise<void> {
  const storagePath = storagePathFromUrl(url);
  if (!storagePath) {
    stats.skippedUnparsableUrl++;
    logger.warn('backfill: skipping non-FTP URL', { url });
    return;
  }

  const posterPath = posterPathFromWebmPath(storagePath);
  const verify = await verifyFileExists(posterPath);
  if (verify.exists) {
    stats.skippedAlreadyExists++;
    return;
  }

  const tmpFile = path.join(os.tmpdir(), `backfill-poster-${Date.now()}-${Math.random().toString(36).slice(2)}.webm`);
  try {
    await downloadToFile(url, tmpFile);
    const buffer = await thumbnailService.generateThumbnailBuffer(tmpFile, 0);
    if (!buffer) {
      stats.failed++;
      logger.error('backfill: thumbnail buffer null', { url, storagePath });
      return;
    }
    const upload = await uploadAsset(buffer, posterPath, 'image/jpeg');
    if (!upload) {
      stats.failed++;
      logger.error('backfill: poster upload failed', { posterPath });
      return;
    }
    stats.generated++;
    logger.info('backfill: poster generated', {
      storagePath,
      posterPath,
      sizeBytes: buffer.length,
    });
  } catch (error) {
    stats.failed++;
    logger.error('backfill: failure', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // best-effort cleanup
    }
  }
}

async function main(): Promise<void> {
  if (!isStorageConfigured()) {
    logger.error('backfill: FTP storage not configured — aborting');
    process.exit(2);
  }
  if (!PUBLIC_BASE_URL) {
    logger.error('backfill: FTP_PUBLIC_URL env var missing — aborting');
    process.exit(2);
  }

  const rows = await templateStudioRepository.listDistinctLayerAssets();
  const stats: BackfillStats = {
    total: rows.length,
    skippedAlreadyExists: 0,
    skippedUnparsableUrl: 0,
    generated: 0,
    failed: 0,
  };

  logger.info('backfill: starting', { total: stats.total });
  for (const row of rows) {
    await backfillOne(row.url, stats);
  }
  logger.info('backfill: complete', stats);
  await pool.end();
  process.exit(0);
}

main().catch(async (error) => {
  logger.error('backfill: fatal error', {
    error: error instanceof Error ? error.message : String(error),
  });
  try {
    await pool.end();
  } catch {
    // best-effort
  }
  process.exit(1);
});
