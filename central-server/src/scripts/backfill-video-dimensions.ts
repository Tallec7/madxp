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
 *
 * ## Pourquoi les essais répétés
 *
 * Le CDN Hostinger (`hcdn`) répond 404 sur certains edges pour des fichiers qui
 * existent, et 200 sur d'autres — mesuré le 2026-08-11 :
 * `STRASOL_2025_08_1600x120px.mp4` 5 succès sur 20 requêtes,
 * `PIRATHS_HB_NDIAYE_FILY_B.mp4` 7 sur 20, `BUT.mp4` 20 sur 20. Les en-têtes le
 * disent : `x-hcdn-request-id: …-int-edge3` renvoie 404 quand `…-int-edge5` renvoie
 * 200 avec le bon `content-length`.
 *
 * Sans réessai, une sonde unique classait 6 vidéos sur 39 « illisible » chez Piraths
 * alors qu'elles sont toutes lisibles. Un faux négatif ici est coûteux : la vidéo
 * reste sans dimension, la vue Canvas continue d'afficher « non mesuré », et rien ne
 * signale qu'il faudrait relancer. Une réussite suffit à prouver que le fichier
 * existe — d'où : on retente, et on ne conclut à l'échec qu'après épuisement.
 */


// DOIT rester le premier import. `config/ftp-storage` fige `process.env.FTP_*` dans
// des const au chargement du module ; en CLI, `dotenv.config()` de `config/database`
// s'exécute APRÈS `storage.service` (ordre des imports) et la config FTP est alors
// déjà gelée à vide → `getVideoUrl` lève « FTP storage not configured » sur la
// première vidéo. En serveur le problème n'existe pas : `server.ts` charge dotenv en tête.
import 'dotenv/config';

import { probeVideoDimensions, VideoDimensions } from '../utils/video-dimensions';
import { getVideoUrl } from '../services/storage.service';
import { query } from '../config/database';
import logger from '../config/logger';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const site = args.find((a) => a.startsWith('--site='))?.split('=')[1] ?? null;
const LIMIT = 2000;

/** Nombre total de sondes par vidéo, la première incluse. */
const PROBE_ATTEMPTS = 5;
/** Attente entre deux sondes : laisse le temps de retomber sur un autre edge. */
const PROBE_RETRY_DELAY_MS = 800;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sonde une vidéo jusqu'à `PROBE_ATTEMPTS` fois. Renvoie les dimensions dès la
 * première réussite, `null` si toutes les tentatives échouent.
 *
 * `probeVideoDimensions` ne distingue pas « fichier absent » de « edge qui a caché
 * un 404 » : les deux donnent `null`. On ne peut donc pas décider de réessayer en
 * fonction de l'erreur — on réessaie systématiquement, ce qui ne coûte cher que sur
 * les vidéos réellement introuvables.
 */
async function probeWithRetry(
  url: string,
  filename: string
): Promise<{ dims: VideoDimensions | null; attempts: number }> {
  for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt++) {
    const dims = await probeVideoDimensions(url);
    if (dims) return { dims, attempts: attempt };
    if (attempt < PROBE_ATTEMPTS) {
      logger.debug('backfill-video-dimensions: sonde en échec, nouvel essai', {
        filename,
        attempt,
      });
      await sleep(PROBE_RETRY_DELAY_MS);
    }
  }
  return { dims: null, attempts: PROBE_ATTEMPTS };
}

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
  let retried = 0;

  for (const v of rows) {
    const { dims, attempts } = await probeWithRetry(getVideoUrl(v.storage_path), v.filename);
    if (!dims?.width || !dims?.height) {
      // Une vidéo illisible ne doit pas arrêter le lot : on la compte et on continue.
      failed++;
      logger.warn('backfill-video-dimensions: illisible', {
        id: v.id,
        filename: v.filename,
        attempts,
      });
      continue;
    }
    measured++;
    if (attempts > 1) retried++;
    logger.info('backfill-video-dimensions: mesurée', {
      filename: v.filename,
      dimensions: `${dims.width}x${dims.height}`,
      ...(attempts > 1 ? { attempts } : {}),
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
    measured, failed, retried, applied: apply,
  });
  if (failed > 0) {
    // Après 5 sondes espacées, un échec n'est plus imputable à un edge CDN capricieux :
    // le fichier est probablement absent du FTP alors que sa row existe encore.
    logger.warn(
      `backfill-video-dimensions: ${failed} vidéo(s) illisible(s) après ${PROBE_ATTEMPTS} essais — vérifier leur présence sur le FTP`
    );
  }
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
