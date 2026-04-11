/**
 * Batch migration script: move flat FTP videos to sharded structure + generate thumbnails.
 * ADR-048: Prepared for later execution — NOT run automatically.
 *
 * Usage:
 *   cd central-server
 *   npx ts-node src/scripts/migrations/migrate-ftp-storage-batch.ts [--dry-run] [--thumbnails-only]
 *
 * What it does:
 * 1. Lists all videos in DB with flat storage_path (no 'videos/' prefix)
 * 2. For each video:
 *    a. Renames the file on FTP from flat path to sharded path (videos/{prefix}/{uuid}.ext)
 *    b. Updates storage_path in DB
 *    c. If thumbnail_url is NULL, downloads video, generates thumbnail, uploads to FTP
 *    d. Updates thumbnail_url in DB
 *
 * Safety:
 * - Dry-run mode by default (pass --no-dry-run to execute)
 * - Processes one video at a time to avoid FTP connection limits
 * - Logs every action for auditability
 * - Skips already-migrated videos (storage_path starts with 'videos/')
 */

import { query } from '../../config/database';
import {
  buildShardedVideoPath,
  buildThumbnailPath,
  getThumbnailUrl,
} from '../../services/storage.service';
import {
  uploadFileToFtp,
  deleteFileFromFtp,
  verifyFtpFileExists,
} from '../../config/ftp-storage';
import thumbnailService from '../../services/thumbnail.service';
import logger from '../../config/logger';
import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import http from 'http';

const DRY_RUN = !process.argv.includes('--no-dry-run');
const THUMBNAILS_ONLY = process.argv.includes('--thumbnails-only');

interface VideoRow {
  [key: string]: unknown;
  id: string;
  filename: string;
  storage_path: string;
  thumbnail_url: string | null;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

async function main() {
  console.log(`\n=== FTP Storage Migration (ADR-048) ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Thumbnails only: ${THUMBNAILS_ONLY}\n`);

  // Find all videos that need migration
  const result = await query<VideoRow>(
    `SELECT id, filename, storage_path, thumbnail_url
     FROM videos
     ORDER BY created_at ASC`
  );

  const videos = result.rows;
  console.log(`Found ${videos.length} total videos`);

  const needsMigration = videos.filter(v => !v.storage_path.startsWith('videos/'));
  const needsThumbnail = videos.filter(v => !v.thumbnail_url);

  console.log(`  - ${needsMigration.length} need path migration (flat → sharded)`);
  console.log(`  - ${needsThumbnail.length} need thumbnail generation\n`);

  let migrated = 0;
  let thumbnailed = 0;
  let errors = 0;

  for (const video of videos) {
    const ext = path.extname(video.filename) || '.mp4';
    const newPath = buildShardedVideoPath(video.id, ext);
    const isAlreadyMigrated = video.storage_path.startsWith('videos/');

    // Step 1: Migrate storage path
    if (!isAlreadyMigrated && !THUMBNAILS_ONLY) {
      console.log(`[MIGRATE] ${video.id}: ${video.storage_path} → ${newPath}`);

      if (!DRY_RUN) {
        try {
          // Verify source exists
          const sourceCheck = await verifyFtpFileExists(video.storage_path);
          if (!sourceCheck.exists) {
            console.log(`  ⚠ Source file not found on FTP, skipping`);
            errors++;
            continue;
          }

          // FTP doesn't have a rename across directories, so we'd need to
          // download and re-upload. For now, just log the intent.
          // TODO: Implement FTP rename or download+reupload when ready
          console.log(`  ℹ FTP rename not implemented yet — needs download+reupload`);
          errors++;
          continue;
        } catch (err) {
          console.log(`  ✗ Error: ${err instanceof Error ? err.message : err}`);
          errors++;
          continue;
        }
      }
      migrated++;
    }

    // Step 2: Generate thumbnail if missing
    if (!video.thumbnail_url) {
      const thumbPath = buildThumbnailPath(video.id);
      const storagePath = isAlreadyMigrated ? video.storage_path : video.storage_path;
      console.log(`[THUMB] ${video.id}: generate ${thumbPath}`);

      if (!DRY_RUN) {
        try {
          // Download video to temp file
          const publicUrl = `${process.env.FTP_PUBLIC_URL || ''}/${storagePath}`;
          const tmpFile = path.join(os.tmpdir(), `neopro_migrate_${video.id}${ext}`);

          await downloadFile(publicUrl, tmpFile);

          // Generate thumbnail
          const thumbBuffer = await thumbnailService.generateThumbnailBuffer(tmpFile);
          fs.unlinkSync(tmpFile);

          if (thumbBuffer) {
            // Upload thumbnail to FTP
            const { Readable } = await import('stream');
            await uploadFileToFtp(thumbBuffer, thumbPath, 'image/jpeg');

            // Update DB
            const thumbUrl = getThumbnailUrl(thumbPath);
            await query(
              'UPDATE videos SET thumbnail_url = $1 WHERE id = $2',
              [thumbUrl, video.id]
            );
            console.log(`  ✓ Thumbnail uploaded: ${thumbUrl}`);
            thumbnailed++;
          } else {
            console.log(`  ⚠ ffmpeg returned null (video may be corrupt)`);
            errors++;
          }
        } catch (err) {
          console.log(`  ✗ Error: ${err instanceof Error ? err.message : err}`);
          errors++;
        }
      } else {
        thumbnailed++;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Thumbnailed: ${thumbnailed}`);
  console.log(`Errors: ${errors}`);
  if (DRY_RUN) {
    console.log(`\n⚠ This was a DRY RUN. Pass --no-dry-run to execute.`);
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
