/**
 * Batch migration script: move flat FTP videos to sharded structure + generate thumbnails.
 * ADR-048: Prepared for later execution — NOT run automatically.
 *
 * Usage:
 *   cd central-server
 *   npx ts-node src/scripts/migrations/migrate-ftp-storage-batch.ts [--no-dry-run] [--thumbnails-only] [--migrate-only]
 *
 * Flags:
 *   --no-dry-run      Actually execute (default is dry run)
 *   --thumbnails-only  Only generate missing thumbnails, skip path migration
 *   --migrate-only     Only migrate paths, skip thumbnail generation
 *
 * What it does:
 * 1. Lists all videos in DB with flat storage_path (no 'videos/' prefix)
 * 2. For each video:
 *    a. Downloads video from public URL to temp file
 *    b. Re-uploads to sharded path (videos/{prefix}/{uuid}.ext)
 *    c. Verifies new file exists and size matches
 *    d. Updates storage_path in DB
 *    e. Deletes old flat file from FTP
 *    f. If thumbnail_url is NULL, generates thumbnail from temp file, uploads to FTP
 *    g. Cleans up temp file
 *
 * Safety:
 * - Dry-run mode by default (pass --no-dry-run to execute)
 * - Processes one video at a time to avoid FTP connection limits
 * - Skips already-migrated videos (storage_path starts with 'videos/')
 * - Verifies new file before deleting old one
 * - DB update happens only after FTP verification
 * - Old file deleted only after DB update succeeds
 * - Resumable: re-running skips already-migrated videos
 */

import { query, getClient } from '../../config/database';
import {
  buildShardedVideoPath,
  buildThumbnailPath,
  getThumbnailUrl,
} from '../../services/storage.service';
import {
  uploadFileToFtp,
  uploadFileToFtpFromDisk,
  deleteFileFromFtp,
  verifyFtpFileExists,
} from '../../config/ftp-storage';
import thumbnailService from '../../services/thumbnail.service';
import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import http from 'http';

const DRY_RUN = !process.argv.includes('--no-dry-run');
const THUMBNAILS_ONLY = process.argv.includes('--thumbnails-only');
const MIGRATE_ONLY = process.argv.includes('--migrate-only');

interface VideoRow {
  [key: string]: unknown;
  id: string;
  filename: string;
  storage_path: string;
  thumbnail_url: string | null;
  file_size: number;
}

function getPublicUrl(storagePath: string): string {
  const base = (process.env.FTP_PUBLIC_URL || '').replace(/\/$/, '');
  return `${base}/${storagePath}`;
}

async function downloadFile(url: string, destPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(destPath); } catch { /* ignore */ }
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
        reject(new Error(`Redirect without Location header`));
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch { /* ignore */ }
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      let bytesWritten = 0;
      response.on('data', (chunk: Buffer) => { bytesWritten += chunk.length; });
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(bytesWritten); });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function migrateVideo(video: VideoRow, newPath: string): Promise<'migrated' | 'skipped' | 'error'> {
  const ext = path.extname(video.filename) || '.mp4';
  const tmpFile = path.join(os.tmpdir(), `neopro_migrate_${video.id}${ext}`);

  try {
    // 1. Download from public URL
    const publicUrl = getPublicUrl(video.storage_path);
    console.log(`  ↓ Downloading from ${video.storage_path}...`);
    const downloadedBytes = await downloadFile(publicUrl, tmpFile);
    console.log(`  ↓ Downloaded ${formatSize(downloadedBytes)}`);

    // 2. Verify download size matches DB (if known)
    if (video.file_size > 0 && downloadedBytes !== video.file_size) {
      console.log(`  ⚠ Size mismatch: downloaded ${downloadedBytes} vs DB ${video.file_size}`);
      // Continue anyway — DB file_size may be inaccurate for old videos
    }

    // 3. Upload to new sharded path (streaming from disk)
    console.log(`  ↑ Uploading to ${newPath}...`);
    const uploadResult = await uploadFileToFtpFromDisk(tmpFile, newPath, 'video/mp4');
    if (!uploadResult) {
      console.log(`  ✗ Upload failed`);
      return 'error';
    }

    // 4. Verify new file on FTP
    const verifyResult = await verifyFtpFileExists(newPath);
    if (!verifyResult.exists) {
      console.log(`  ✗ Verification failed: new file not found on FTP`);
      return 'error';
    }
    if (verifyResult.size !== null && verifyResult.size !== downloadedBytes) {
      console.log(`  ✗ Verification failed: size mismatch (FTP: ${verifyResult.size}, expected: ${downloadedBytes})`);
      // Try to clean up the bad upload
      try { await deleteFileFromFtp(newPath); } catch { /* ignore */ }
      return 'error';
    }

    // 5. Update DB storage_path (atomic)
    await query(
      'UPDATE videos SET storage_path = $1 WHERE id = $2 AND storage_path = $3',
      [newPath, video.id, video.storage_path]
    );
    console.log(`  ✓ DB updated: storage_path = ${newPath}`);

    // 6. Delete old file from FTP (only after DB is updated)
    try {
      await deleteFileFromFtp(video.storage_path);
      console.log(`  ✓ Old file deleted: ${video.storage_path}`);
    } catch (delErr) {
      // Non-fatal: old file is orphaned but not breaking
      console.log(`  ⚠ Could not delete old file (non-fatal): ${delErr instanceof Error ? delErr.message : delErr}`);
    }

    return 'migrated';
  } catch (err) {
    console.log(`  ✗ Error: ${err instanceof Error ? err.message : err}`);
    return 'error';
  } finally {
    // Always clean up temp file
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

async function generateThumbnail(video: VideoRow): Promise<'generated' | 'skipped' | 'error'> {
  const ext = path.extname(video.filename) || '.mp4';
  const thumbStoragePath = buildThumbnailPath(video.id);
  const tmpFile = path.join(os.tmpdir(), `neopro_thumb_${video.id}${ext}`);

  try {
    // Download video to temp file
    const publicUrl = getPublicUrl(video.storage_path);
    await downloadFile(publicUrl, tmpFile);

    // Generate thumbnail
    const thumbBuffer = await thumbnailService.generateThumbnailBuffer(tmpFile);

    if (!thumbBuffer) {
      console.log(`  ⚠ ffmpeg returned null (video may be corrupt or too short)`);
      return 'error';
    }

    // Upload thumbnail to FTP
    await uploadFileToFtp(thumbBuffer, thumbStoragePath, 'image/jpeg');

    // Update DB
    const thumbUrl = getThumbnailUrl(thumbStoragePath);
    await query(
      'UPDATE videos SET thumbnail_url = $1 WHERE id = $2',
      [thumbUrl, video.id]
    );
    console.log(`  ✓ Thumbnail: ${thumbUrl} (${formatSize(thumbBuffer.length)})`);
    return 'generated';
  } catch (err) {
    console.log(`  ✗ Thumb error: ${err instanceof Error ? err.message : err}`);
    return 'error';
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

async function main() {
  console.log(`\n=== FTP Storage Migration (ADR-048) ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : '🔴 LIVE'}`);
  console.log(`Thumbnails only: ${THUMBNAILS_ONLY}`);
  console.log(`Migrate only: ${MIGRATE_ONLY}\n`);

  // Find all videos
  const result = await query<VideoRow>(
    `SELECT id, filename, storage_path, thumbnail_url, file_size
     FROM videos
     ORDER BY created_at ASC`
  );

  const videos = result.rows;
  const needsMigration = videos.filter(v => !v.storage_path.startsWith('videos/'));
  const needsThumbnail = videos.filter(v => !v.thumbnail_url);

  console.log(`Found ${videos.length} total videos`);
  console.log(`  - ${needsMigration.length} need path migration (flat → sharded)`);
  console.log(`  - ${needsThumbnail.length} need thumbnail generation`);
  console.log(`  - ${videos.length - needsMigration.length} already migrated (skipped)\n`);

  let migrated = 0;
  let thumbnailed = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const ext = path.extname(video.filename) || '.mp4';
    const newPath = buildShardedVideoPath(video.id, ext);
    const isAlreadyMigrated = video.storage_path.startsWith('videos/');
    const progress = `[${i + 1}/${videos.length}]`;

    // Step 1: Migrate storage path
    if (!isAlreadyMigrated && !THUMBNAILS_ONLY) {
      console.log(`${progress} [MIGRATE] ${video.id}: ${video.storage_path} → ${newPath}`);

      if (DRY_RUN) {
        migrated++;
      } else {
        const result = await migrateVideo(video, newPath);
        if (result === 'migrated') {
          migrated++;
          // Update local reference so thumbnail step uses new path
          video.storage_path = newPath;
        } else if (result === 'error') {
          errors++;
          // Don't skip thumbnail — it can still work with the old path
        }
      }
    } else if (isAlreadyMigrated && !THUMBNAILS_ONLY) {
      skipped++;
    }

    // Step 2: Generate thumbnail if missing
    if (!video.thumbnail_url && !MIGRATE_ONLY) {
      const thumbPath = buildThumbnailPath(video.id);
      console.log(`${progress} [THUMB] ${video.id}: → ${thumbPath}`);

      if (DRY_RUN) {
        thumbnailed++;
      } else {
        const result = await generateThumbnail(video);
        if (result === 'generated') {
          thumbnailed++;
        } else if (result === 'error') {
          errors++;
        }
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Thumbnailed: ${thumbnailed}`);
  console.log(`Skipped (already migrated): ${skipped}`);
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
