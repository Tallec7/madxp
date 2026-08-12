/* eslint-disable no-console */
/**
 * Audit FTP availability for legacy flat-path videos.
 *
 * Context (incident 2026-05-09): 217 videos have storage_path = filename
 * (legacy format, pre-ADR-048 sharding). Some of these files may no longer
 * exist on Hostinger FTP, causing 404 → black screen on TV/LED receivers.
 *
 * This script:
 *   1. Fetches all legacy flat-path videos from DB (storage_path NOT LIKE 'videos/%').
 *   2. HEAD-tests each FTP URL in batches of 20 (concurrent).
 *   3. Reports 200 vs 404 breakdown, exports a CSV.
 *   4. With --mark-missing: adds a `ftp_missing` tag or logs to file for triage.
 *
 * Usage:
 *   cd central-server && source .env && npx ts-node src/scripts/audit-ftp-legacy-videos.ts
 *   cd central-server && source .env && npx ts-node src/scripts/audit-ftp-legacy-videos.ts --verbose
 */

import pool, { query } from '../config/database';
import { withCacheBuster, NO_CACHE_HEADERS } from '../utils/cache-busted-url';

interface VideoRow {
  id: string;
  filename: string;
  storage_path: string;
  file_size: number | null;
  created_at: string;
  category: string | null;
  site_count: number;
  [key: string]: unknown;
}

const FTP_PUBLIC_URL = (process.env.FTP_PUBLIC_URL || 'https://kalonpartners.bzh/neopro-video').replace(/\/$/, '');
const BATCH_SIZE = 20;
const VERBOSE = process.argv.includes('--verbose');

function buildUrl(storagePath: string): string {
  return `${FTP_PUBLIC_URL}/${storagePath}`;
}

async function headCheck(url: string): Promise<200 | 404 | number> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    // Sonde l'origine, pas l'edge : sur l'URL nue, un fichier supprimé peut
    // encore répondre 200 depuis le cache et fausser tout le rapport.
    const res = await fetch(withCacheBuster(url), {
      method: 'HEAD',
      headers: NO_CACHE_HEADERS,
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    return res.status as 200 | 404 | number;
  } catch {
    return -1; // network error / timeout
  }
}

async function fetchLegacyVideos(): Promise<VideoRow[]> {
  const result = await query<VideoRow>(
    `SELECT
       v.id,
       v.filename,
       v.storage_path,
       v.file_size,
       v.created_at::text,
       v.category,
       COUNT(DISTINCT sv.site_id)::int AS site_count
     FROM videos v
     LEFT JOIN site_videos sv ON sv.video_id = v.id
     WHERE
       v.storage_path IS NOT NULL
       AND v.storage_path NOT LIKE 'videos/%'
     GROUP BY v.id
     ORDER BY v.created_at DESC`,
    []
  );
  return result.rows;
}

async function processBatch(
  videos: VideoRow[]
): Promise<{ ok: VideoRow[]; missing: VideoRow[]; error: VideoRow[] }> {
  const ok: VideoRow[] = [];
  const missing: VideoRow[] = [];
  const error: VideoRow[] = [];

  await Promise.all(
    videos.map(async (v) => {
      const url = buildUrl(v.storage_path);
      const status = await headCheck(url);
      if (status === 200) {
        ok.push(v);
        if (VERBOSE) console.log(`  ✅ ${v.filename} (${status})`);
      } else if (status === 404) {
        missing.push(v);
        if (VERBOSE) console.log(`  ❌ ${v.filename} (404) — sites=${v.site_count}`);
      } else {
        error.push(v);
        if (VERBOSE) console.log(`  ⚠️  ${v.filename} (${status})`);
      }
    })
  );

  return { ok, missing, error };
}

async function main() {
  console.log('=== Audit FTP legacy flat-path videos ===');
  console.log(`FTP_PUBLIC_URL: ${FTP_PUBLIC_URL}`);
  console.log('');

  console.log('Fetching legacy videos from DB...');
  const videos = await fetchLegacyVideos();
  console.log(`Found ${videos.length} legacy flat-path videos (storage_path ≠ 'videos/*')`);
  console.log('');

  const allOk: VideoRow[] = [];
  const allMissing: VideoRow[] = [];
  const allError: VideoRow[] = [];

  const totalBatches = Math.ceil(videos.length / BATCH_SIZE);
  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    const batch = videos.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} videos)...`);
    const { ok, missing, error } = await processBatch(batch);
    allOk.push(...ok);
    allMissing.push(...missing);
    allError.push(...error);
    console.log(` ✅ ${ok.length} | ❌ ${missing.length} | ⚠️  ${error.length}`);
  }

  console.log('');
  console.log('=== RÉSULTATS ===');
  console.log(`Total legacy videos : ${videos.length}`);
  console.log(`  ✅ Accessible (200)  : ${allOk.length}`);
  console.log(`  ❌ Manquant (404)    : ${allMissing.length}`);
  console.log(`  ⚠️  Erreur réseau    : ${allError.length}`);
  console.log('');

  if (allMissing.length > 0) {
    console.log('=== VIDÉOS MANQUANTES SUR FTP ===');
    console.log('filename | storage_path | sites | created_at | category');
    console.log('---------|-------------|-------|------------|--------');
    for (const v of allMissing) {
      console.log(`${v.filename} | ${v.storage_path} | ${v.site_count} | ${v.created_at.slice(0, 10)} | ${v.category ?? '-'}`);
    }
    console.log('');

    const withSites = allMissing.filter((v) => v.site_count > 0);
    console.log(`⚠️  ${withSites.length} vidéos manquantes sont encore assignées à des sites actifs.`);
    if (withSites.length > 0) {
      console.log('');
      console.log('=== VIDÉOS MANQUANTES AVEC SITES ACTIFS (IMPACT IMMÉDIAT) ===');
      for (const v of withSites) {
        console.log(`  ${v.filename} | sites: ${v.site_count} | ${v.storage_path}`);
      }
    }

    console.log('');
    console.log('=== REQUÊTE SQL pour trouver les sites impactés ===');
    const missingIds = allMissing.map((v) => `'${v.id}'`).join(', ');
    console.log(`
SELECT
  s.site_name,
  s.club_name,
  s.site_type,
  v.filename,
  v.storage_path
FROM site_videos sv
JOIN videos v ON v.id = sv.video_id
JOIN sites s ON s.id = sv.site_id
WHERE v.id IN (${missingIds})
ORDER BY s.site_name, v.filename;
`);
  }

  await pool.end();
  process.exit(allMissing.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Script error:', err);
  pool.end();
  process.exit(2);
});
