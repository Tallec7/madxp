/**
 * Mesure les dimensions des vidéos qui n'en ont pas, et les persiste.
 *
 * ## Pourquoi
 *
 * La sonde ffprobe n'existe que depuis PR #1140 : tout ce qui a été uploadé avant
 * n'a aucune dimension en base. La vue « Canvas du club » affiche donc « non mesuré »
 * pour l'essentiel du parc, et ne peut pas dire ce qui, précisément, ne rentre pas
 * dans un ruban.
 *
 * Le coût de cet angle mort est concret : chez Piraths, `ALPHA_SERVICE.mp4` fait
 * 640×80 et `STRASOL_2025_08_1600x120px.mp4` fait 4096×1416 — malgré son nom. Sans
 * mesure, on en est réduit à lire les noms de fichiers, ce qui envoie redemander les
 * mauvais fichiers aux mauvaises agences.
 *
 * ## Usage
 *
 *   cd central-server
 *   npm run backfill:video-dimensions -- --site=<uuid>          # dry-run
 *   npm run backfill:video-dimensions -- --site=<uuid> --apply
 *   npm run backfill:video-dimensions -- --apply                # tout le parc
 *
 * Dry-run par défaut. `--site` restreint à un club : commencer par là, vérifier que
 * les chiffres ont du sens, puis élargir.
 */


import { probeVideoDimensions } from '../utils/video-dimensions';
import { getVideoUrl } from '../services/storage.service';
import { query } from '../config/database';
import logger from '../config/logger';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const site = args.find((a) => a.startsWith('--site='))?.split('=')[1] ?? null;
const LIMIT = 2000;

async function main(): Promise<void> {
  // Candidates : pas de largeur dans metadata. `ffprobe` sur une URL distante coûte
  // un aller-retour réseau par vidéo, donc on ne remesure jamais ce qu'on sait déjà.
  const { rows } = await query<{ id: string; storage_path: string; filename: string }>(
    `SELECT id, storage_path, filename FROM videos
     WHERE (metadata->>'width') IS NULL
       AND storage_path IS NOT NULL
       AND ($1::uuid IS NULL OR uploaded_for_site_id = $1::uuid)
     ORDER BY created_at DESC LIMIT $2`,
    [site, LIMIT]
  );

  logger.info('backfill-video-dimensions: candidats', { site, count: rows.length, apply });
  if (rows.length === 0) return;

  let measured = 0;
  let failed = 0;

  for (const v of rows) {
    const dims = await probeVideoDimensions(getVideoUrl(v.storage_path));
    if (!dims?.width || !dims?.height) {
      // Une vidéo illisible ne doit pas arrêter le lot : on la compte et on continue.
      failed++;
      logger.warn('backfill-video-dimensions: illisible', { id: v.id, filename: v.filename });
      continue;
    }
    measured++;
    logger.info('backfill-video-dimensions: mesurée', {
      filename: v.filename,
      dimensions: `${dims.width}x${dims.height}`,
    });

    if (apply) {
      // Merge JSONB : ne JAMAIS écraser `metadata`, qui porte d'autres clés
      // (source_video_id, created_by_bulk, thumbnails…).
      await query(
        `UPDATE videos SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
         WHERE id = $1`,
        [v.id, JSON.stringify({ width: dims.width, height: dims.height })]
      );
    }
  }

  logger.info('backfill-video-dimensions: terminé', {
    measured, failed, applied: apply,
  });
  if (!apply) {
    logger.warn('backfill-video-dimensions: DRY-RUN — relancer avec --apply pour persister');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('backfill-video-dimensions: échec', { error });
    process.exit(1);
  });
