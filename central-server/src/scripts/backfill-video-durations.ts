/**
 * Backfill `videos.duration` pour les entrées où la durée est NULL ou 0.
 *
 * Cause d'origine : certaines vidéos uploadées historiquement (avant que
 * l'extraction FFprobe soit systématique au pipeline upload) n'ont pas
 * de `duration` en DB. Conséquence : la barre de progression de la
 * Remote V2 (ADR-103 / PR #779) ne s'affiche pas tant que la durée n'est
 * pas connue.
 *
 * Usage :
 *   cd central-server
 *   npx ts-node src/scripts/backfill-video-durations.ts            # dry run
 *   npx ts-node src/scripts/backfill-video-durations.ts --apply    # exécution réelle
 *   npx ts-node src/scripts/backfill-video-durations.ts --apply --limit=50
 *
 * Comportement :
 * - Sélectionne les vidéos `content_type = 'video'` avec duration IS NULL OR = 0
 * - FFprobe lit la durée directement depuis l'URL publique FTP (pas de download)
 * - UPDATE videos SET duration = ROUND(seconds) WHERE id = $id
 * - Errors loggées mais n'arrêtent pas le batch (continue sur la vidéo suivante)
 *
 * Sécurité :
 * - Mode dry-run par défaut (passe `--apply` pour exécuter)
 * - Pas de delete, pas de mutation hors `duration`
 */

import { spawn } from 'child_process';
import { query } from '../config/database';
import { getFtpPublicUrl } from '../config/ftp-storage';
import logger from '../config/logger';

interface VideoRow {
  id: string;
  filename: string;
  storage_path: string;
  duration: number | null;
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

/**
 * Convertit un storage_path en URL exploitable par FFprobe.
 * Gère les 2 cas historiques : URL absolue déjà stockée vs path relatif FTP.
 */
function resolveUrl(storagePath: string): string {
  if (/^https?:\/\//i.test(storagePath)) {
    return storagePath;
  }
  return getFtpPublicUrl(storagePath);
}

function ffprobeDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      url,
    ]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (err) => reject(new Error(`ffprobe spawn: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe exit ${code}: ${stderr.trim()}`));
      }
      const seconds = parseFloat(stdout.trim());
      if (Number.isNaN(seconds) || seconds <= 0) {
        return reject(new Error(`Invalid duration parsed: "${stdout.trim()}"`));
      }
      resolve(Math.round(seconds));
    });
  });
}

async function main(): Promise<void> {
  console.log(
    `[backfill-video-durations] Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${LIMIT ? `, limit=${LIMIT}` : ''}`,
  );

  const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
  const result = await query<VideoRow>(
    `SELECT id, filename, storage_path, duration
     FROM videos
     WHERE (duration IS NULL OR duration = 0)
       AND storage_path IS NOT NULL
       AND content_type = 'video'
     ORDER BY created_at ASC
     ${limitClause}`,
  );

  console.log(
    `[backfill-video-durations] ${result.rows.length} vidéos candidates`,
  );

  let ok = 0;
  let failed = 0;
  for (const row of result.rows) {
    const url = resolveUrl(row.storage_path);
    try {
      const duration = await ffprobeDuration(url);
      console.log(`  ✓ ${row.id} ${row.filename} → ${duration}s`);
      if (APPLY) {
        await query(
          'UPDATE videos SET duration = $1, updated_at = NOW() WHERE id = $2',
          [duration, row.id],
        );
      }
      ok++;
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`  ✗ ${row.id} ${row.filename} → ${msg}`);
      logger.warn('Backfill duration failed', {
        videoId: row.id,
        filename: row.filename,
        error: msg,
      });
      failed++;
    }
  }

  console.log(
    `[backfill-video-durations] Terminé. Success: ${ok}, Failed: ${failed}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill-video-durations] Fatal:', err);
  process.exit(1);
});
