/**
 * Audit drift between `video_variants.display_type` and `sites.displays[].type`.
 *
 * Contexte (incident 2026-05-08, PR #918) : 54 rows `video_variants` portaient
 * `display_type='led'` alors qu'aucun site n'avait `displays[].type='led'`.
 * La migration `normalize-led-display-type.sql` a renommé en bloc vers
 * 'led-banner' (preset dashboard), mais sans s'attaquer à la cause structurelle :
 *
 *   - L'API `POST /content/videos/:id/variants` accepte n'importe quel slug
 *     `^[a-z0-9-]+$` sans vérifier qu'un site a déclaré ce display_type.
 *   - L'éditeur dashboard `displays-editor` propose un input texte libre.
 *   - Aucune contrainte (FK / trigger / smoke) ne vérifie la cohérence
 *     `video_variants.display_type ⊆ sites.displays[].type`.
 *
 * Ce script (read-only) cartographie l'état réel pour décider :
 *   - Faut-il enforce un contrat (FK / check / trigger) ?
 *   - Faut-il revert PR #918 (la canonicalisation 'led-banner') ?
 *   - Combien de variantes sont structurellement orphelines aujourd'hui ?
 *
 * Output : rapport stdout structuré (4 sections).
 *
 * Usage :
 *   cd central-server && npx ts-node src/scripts/audit-variants-drift.ts
 *   cd central-server && npx ts-node src/scripts/audit-variants-drift.ts --site 3c62b930-0061-4526-b8ac-6206394c0052
 */

import pool, { query } from '../config/database';

interface VariantSlugRow {
  display_type: string;
  count: string;
  oldest_created_at: Date | null;
  newest_created_at: Date | null;
  sample_video_filenames: string[];
  [key: string]: unknown;
}

interface DisplaySlugRow {
  type: string;
  site_count: string;
  site_names: string[];
  [key: string]: unknown;
}

interface SiteDisplaysRow {
  id: string;
  site_name: string;
  site_type: string | null;
  displays: Array<{ type?: string; name?: string; resolution?: string }> | null;
  [key: string]: unknown;
}

interface VideoWithVariantsRow {
  video_id: string;
  filename: string;
  uploaded_for_site_id: string | null;
  variant_display_types: string[] | null;
  [key: string]: unknown;
}

const SEPARATOR = '='.repeat(80);
const SUB_SEPARATOR = '-'.repeat(80);

async function loadVariantSlugs(): Promise<VariantSlugRow[]> {
  const result = await query<VariantSlugRow>(
    `SELECT
       vv.display_type,
       COUNT(*)::text AS count,
       MIN(vv.created_at) AS oldest_created_at,
       MAX(vv.created_at) AS newest_created_at,
       (
         SELECT ARRAY_AGG(DISTINCT v.filename ORDER BY v.filename)
         FROM (
           SELECT vv2.video_id
           FROM video_variants vv2
           WHERE vv2.display_type = vv.display_type
           LIMIT 5
         ) sample
         JOIN videos v ON v.id = sample.video_id
       ) AS sample_video_filenames
     FROM video_variants vv
     GROUP BY vv.display_type
     ORDER BY count DESC, vv.display_type`,
    []
  );
  return result.rows;
}

async function loadDisplaySlugs(): Promise<DisplaySlugRow[]> {
  // Each site's displays is JSONB: [{ type, name, resolution }, ...]
  const result = await query<DisplaySlugRow>(
    `SELECT
       d.type,
       COUNT(DISTINCT s.id)::text AS site_count,
       ARRAY_AGG(DISTINCT s.site_name ORDER BY s.site_name) AS site_names
     FROM sites s,
          jsonb_array_elements(s.displays) AS display(value),
          LATERAL (SELECT (display.value->>'type') AS type) d
     WHERE s.displays IS NOT NULL
       AND jsonb_typeof(s.displays) = 'array'
       AND d.type IS NOT NULL
     GROUP BY d.type
     ORDER BY site_count DESC, d.type`,
    []
  );
  return result.rows;
}

async function loadSiteDisplays(siteId: string): Promise<SiteDisplaysRow | null> {
  const result = await query<SiteDisplaysRow>(
    `SELECT id, site_name, site_type, displays FROM sites WHERE id = $1`,
    [siteId]
  );
  return result.rows[0] ?? null;
}

async function loadSiteVideosWithVariants(siteId: string): Promise<VideoWithVariantsRow[]> {
  // Videos uploaded for this site OR videos referenced in this site's config_profiles configuration.
  const result = await query<VideoWithVariantsRow>(
    `SELECT
       v.id AS video_id,
       v.filename,
       v.uploaded_for_site_id,
       (
         SELECT ARRAY_AGG(vv.display_type ORDER BY vv.display_type)
         FROM video_variants vv
         WHERE vv.video_id = v.id
       ) AS variant_display_types
     FROM videos v
     WHERE v.uploaded_for_site_id = $1
        OR v.id IN (
          SELECT DISTINCT (video_ref->>'video_id')::uuid
          FROM config_profiles cp,
               jsonb_path_query(cp.configuration, '$.**.videos[*]') AS video_ref
          WHERE cp.site_id = $1
            AND video_ref ? 'video_id'
        )
     ORDER BY v.filename`,
    [siteId]
  );
  return result.rows;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const siteIdx = args.indexOf('--site');
  const siteFilter = siteIdx >= 0 ? args[siteIdx + 1] : null;

  console.log(SEPARATOR);
  console.log('VARIANTS DRIFT AUDIT — read-only');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(SEPARATOR);

  // --- Section 1 : slugs en DB côté variants
  console.log('\n[1] video_variants.display_type — distribution');
  console.log(SUB_SEPARATOR);
  const variantSlugs = await loadVariantSlugs();
  if (variantSlugs.length === 0) {
    console.log('  (aucune row dans video_variants — système non-adopté)');
  } else {
    for (const row of variantSlugs) {
      const oldest = row.oldest_created_at?.toISOString().slice(0, 10) ?? '?';
      const newest = row.newest_created_at?.toISOString().slice(0, 10) ?? '?';
      const samples = (row.sample_video_filenames ?? []).slice(0, 3).join(', ');
      console.log(`  ${row.display_type.padEnd(20)} | ${row.count.padStart(5)} rows | ${oldest} → ${newest}`);
      if (samples) console.log(`    sample: ${samples}`);
    }
  }

  // --- Section 2 : slugs en DB côté sites
  console.log('\n[2] sites.displays[].type — distribution');
  console.log(SUB_SEPARATOR);
  const displaySlugs = await loadDisplaySlugs();
  if (displaySlugs.length === 0) {
    console.log('  (aucun site avec displays JSONB — fallback legacy en cours)');
  } else {
    for (const row of displaySlugs) {
      const sites = (row.site_names ?? []).slice(0, 3).join(', ');
      const more = (row.site_names?.length ?? 0) > 3 ? ` +${row.site_names.length - 3}` : '';
      console.log(`  ${row.type.padEnd(20)} | ${row.site_count.padStart(5)} sites`);
      if (sites) console.log(`    sites: ${sites}${more}`);
    }
  }

  // --- Section 3 : drift bidirectionnel
  console.log('\n[3] DRIFT — slugs présents dans un côté mais pas l\'autre');
  console.log(SUB_SEPARATOR);
  const variantTypes = new Set(variantSlugs.map(r => r.display_type));
  const displayTypes = new Set(displaySlugs.map(r => r.type));
  const orphanVariants = [...variantTypes].filter(t => !displayTypes.has(t));
  const orphanDisplays = [...displayTypes].filter(t => !variantTypes.has(t));

  if (orphanVariants.length === 0 && orphanDisplays.length === 0) {
    console.log('  ✅ Cohérence parfaite — chaque slug variant correspond à un display de site.');
  }
  if (orphanVariants.length > 0) {
    console.log(`  ❌ ${orphanVariants.length} slug(s) en video_variants SANS aucun site.displays correspondant :`);
    for (const slug of orphanVariants) {
      const stats = variantSlugs.find(r => r.display_type === slug)!;
      console.log(`     - ${slug.padEnd(18)} (${stats.count} rows orphelines)`);
    }
  }
  if (orphanDisplays.length > 0) {
    console.log(`  ⚠️  ${orphanDisplays.length} slug(s) en sites.displays SANS aucune variante :`);
    for (const slug of orphanDisplays) {
      const stats = displaySlugs.find(r => r.type === slug)!;
      console.log(`     - ${slug.padEnd(18)} (${stats.site_count} site(s) déclarent ce display, 0 variante)`);
    }
  }

  // --- Section 4 : focus site (optionnel)
  if (siteFilter) {
    console.log(`\n[4] FOCUS site ${siteFilter}`);
    console.log(SUB_SEPARATOR);
    const site = await loadSiteDisplays(siteFilter);
    if (!site) {
      console.log(`  ❌ Site ${siteFilter} introuvable.`);
    } else {
      console.log(`  Site: ${site.site_name} (type=${site.site_type ?? 'null'})`);
      console.log(`  displays JSONB:`);
      if (!site.displays || site.displays.length === 0) {
        console.log('    (NULL ou vide — fallback legacy idx→\'secondary\' actif)');
      } else {
        for (const d of site.displays) {
          console.log(`    - type=${d.type ?? '?'}  name="${d.name ?? '?'}"  resolution=${d.resolution ?? '?'}`);
        }
      }

      const videos = await loadSiteVideosWithVariants(siteFilter);
      console.log(`\n  Vidéos du site (${videos.length}) — variantes par vidéo :`);
      const videosWithVariants = videos.filter(v => v.variant_display_types && v.variant_display_types.length > 0);
      const videosWithout = videos.length - videosWithVariants.length;

      if (videosWithVariants.length === 0) {
        console.log('    (aucune variante enregistrée pour les vidéos de ce site)');
      } else {
        for (const v of videosWithVariants) {
          console.log(`    - ${v.filename}  →  variants: [${(v.variant_display_types ?? []).join(', ')}]`);
        }
      }
      console.log(`    (${videosWithout} vidéo(s) du site sans aucune variante)`);

      // Cross-check : variantes du site qui pointent vers un display que le site n'a pas
      const siteDisplayTypes = new Set((site.displays ?? []).map(d => d.type).filter(Boolean));
      const incoherent: Array<{ filename: string; orphanType: string }> = [];
      for (const v of videosWithVariants) {
        for (const t of v.variant_display_types ?? []) {
          if (!siteDisplayTypes.has(t)) {
            incoherent.push({ filename: v.filename, orphanType: t });
          }
        }
      }
      if (incoherent.length > 0) {
        console.log(`\n  ❌ Variantes pointant vers un display NON déclaré par le site :`);
        for (const i of incoherent.slice(0, 10)) {
          console.log(`     - ${i.filename}  →  variant type='${i.orphanType}' (pas dans displays[])`);
        }
        if (incoherent.length > 10) console.log(`     ... +${incoherent.length - 10} autres`);
      }
    }
  }

  console.log(`\n${SEPARATOR}\n`);

  await pool.end();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
