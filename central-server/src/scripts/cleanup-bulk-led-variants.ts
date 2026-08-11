/**
 * Supprime les variantes `led-perimeter` créées par erreur par le bouton de création
 * en masse (incident 2026-08-11).
 *
 * ## Ce qui s'est passé
 *
 * `bulkCreateLedVariants` utilisait `videoRepository.findForSitePaginated`, dont le
 * nom laisse croire à un filtre alors que le `siteId` n'y sert qu'au TRI : elle
 * retourne toute la bibliothèque. Le bouton a donc créé 492 variantes sur 7 clubs
 * au lieu d'un seul — dont 8 sur Saas Lanester HB, le club qu'on ne veut surtout pas
 * activer en aveugle.
 *
 * ## Pourquoi c'est réparable
 *
 * Chaque variante créée par le bouton porte `metadata.created_by_bulk = true`. Les
 * variantes posées à la main par un opérateur n'ont pas ce marqueur et ne sont donc
 * jamais touchées.
 *
 * ## Usage
 *
 *   npx tsx src/scripts/cleanup-bulk-led-variants.ts --keep-site=<uuid>            # dry-run
 *   npx tsx src/scripts/cleanup-bulk-led-variants.ts --keep-site=<uuid> --apply
 *
 * `--keep-site` préserve les variantes légitimes du club visé. Sans lui, TOUTES les
 * variantes marquées sont candidates — à n'utiliser que si aucune n'était voulue.
 */

import { query } from '../config/database';
import logger from '../config/logger';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const keepSite = args.find((a) => a.startsWith('--keep-site='))?.split('=')[1] ?? null;

async function main(): Promise<void> {
  // On liste AVANT de supprimer : un compte-rendu par club est la seule façon de
  // vérifier que le périmètre correspond à l'incident et pas à autre chose.
  const inventory = await query<{ site: string | null; n: string }>(
    `SELECT s.site_name AS site, COUNT(*)::text AS n
     FROM video_variants vv
     JOIN videos v ON v.id = vv.video_id
     LEFT JOIN sites s ON s.id = v.uploaded_for_site_id
     WHERE vv.display_type = 'led-perimeter'
       AND vv.metadata->>'created_by_bulk' = 'true'
       AND ($1::uuid IS NULL OR v.uploaded_for_site_id IS DISTINCT FROM $1::uuid)
     GROUP BY s.site_name
     ORDER BY COUNT(*) DESC`,
    [keepSite]
  );

  const total = inventory.rows.reduce((a, r) => a + parseInt(r.n, 10), 0);
  logger.info('cleanup-bulk-led-variants: inventaire', {
    keepSite,
    total,
    parSite: inventory.rows.map((r) => `${r.site ?? '(global)'}: ${r.n}`),
  });

  if (total === 0) {
    logger.info('cleanup-bulk-led-variants: rien à supprimer');
    return;
  }

  if (!apply) {
    logger.warn('cleanup-bulk-led-variants: DRY-RUN — relancer avec --apply pour supprimer', { total });
    return;
  }

  const deleted = await query<{ id: string }>(
    `DELETE FROM video_variants vv
     USING videos v
     WHERE v.id = vv.video_id
       AND vv.display_type = 'led-perimeter'
       AND vv.metadata->>'created_by_bulk' = 'true'
       AND ($1::uuid IS NULL OR v.uploaded_for_site_id IS DISTINCT FROM $1::uuid)
     RETURNING vv.id`,
    [keepSite]
  );

  logger.info('cleanup-bulk-led-variants: supprimées', { count: deleted.rows.length, keepSite });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('cleanup-bulk-led-variants: échec', { error });
    process.exit(1);
  });
