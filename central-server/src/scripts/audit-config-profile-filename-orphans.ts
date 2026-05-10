/**
 * Audit `_N` suffix orphan filenames in `config_profiles.configuration` JSONB.
 *
 * Contexte (investigation 2026-05-09 NLF Mangin-Beaulieu, site
 * `c994620c-2016-40f3-9399-2d0345f69274`) : la WebView kiosk demande des
 * vidéos avec suffix `_N` (ex: `TV_PART01_LAGENCE_ET_VOUS_1.mp4`,
 * `VICTOIRE_3.mp4`) qui n'existent pas sur le disque Pi (les vraies versions
 * sont sans suffix). 404 → `MEDIA_ELEMENT_ERROR: Format error` → cache
 * Chromium 30j (asset Cache-Control immutable) → "ça plante systématiquement".
 *
 * Empilé avec :
 *   - `feedback_variant_pipeline_drift.md` : `generateUniqueFilename` ajoute
 *     `_N` à chaque re-upload, et `restoreSecondaryVariants` Pi-side préserve
 *     les stale.
 *   - `feedback_chromium_http_cache_404_immutable.md` : le 404 reste en cache
 *     30j sur le kiosk.
 *
 * Ce script (READ-ONLY) cartographie les filenames `_N` référencés dans
 * `config_profiles.configuration` qui n'ont pas de row correspondante dans
 * la table `videos` (master sans suffix existe → orphan probable).
 *
 * Output : rapport stdout structuré.
 *
 * ⚠️ FAUX POSITIFS connus (à whitelister avant cleanup) :
 *   - `joueur_NN.mp4` (1 vidéo par numéro de maillot, ce n'est pas du drift `_N`).
 *   - Tout asset où chaque suffixe correspond à une vraie variante distincte
 *     (ex: `LED_PART07_KING_JOUET_1.mp4` qui existe vraiment en `videos`).
 * Le filtre actuel `!suffixedInDB && masterInDB` capture le cas canonique :
 * "le suffixé n'existe pas en DB MAIS le master sans suffix existe".
 * Cas non-couverts à creuser : suffixe référencé en JSONB mais NI suffixé
 * NI master en DB (pointe vers un fichier FTP mort) — nécessite listing FTP
 * pour confirmation.
 *
 * Usage :
 *   cd central-server && npx ts-node src/scripts/audit-config-profile-filename-orphans.ts
 *   cd central-server && npx ts-node src/scripts/audit-config-profile-filename-orphans.ts --site c994620c-2016-40f3-9399-2d0345f69274
 *
 * Next steps après audit :
 *   - Si pattern confirmé sur plusieurs sites → écrire migration
 *     `cleanup-config-profile-suffix-orphans.sql` qui rewrite les
 *     `*_N.mp4` → `*.mp4` quand le master sans suffix existe en `videos`.
 *   - Ajouter un smoke test qui interdit l'introduction de filenames
 *     `_N` dans `config_profiles.configuration` lors d'un POST /deploy.
 */

import pool, { query } from '../config/database';

interface OrphanRow {
  site_id: string;
  site_name: string;
  profile_id: string;
  profile_name: string;
  filename: string;
  occurrences: number;
  master_exists_in_videos: boolean;
  [key: string]: unknown;
}

const SEPARATOR = '='.repeat(80);

function parseArgs(): { siteId: string | null } {
  const args = process.argv.slice(2);
  const siteIdx = args.indexOf('--site');
  return { siteId: siteIdx >= 0 ? args[siteIdx + 1] ?? null : null };
}

/**
 * Extract all filenames matching `*_<digit>.mp4` (or .webm) from a JSONB
 * config object. Recurses through `sponsors`, `categories[].videos[]`,
 * `categories[].subCategories[].videos[]`, and `variants.*.path/filename`.
 */
function extractSuffixedFilenames(config: unknown, found: Map<string, number>): void {
  if (!config || typeof config !== 'object') return;

  const SUFFIX_REGEX = /(?:^|\/)([^/]+_\d+\.(?:mp4|webm))$/i;

  const walk = (node: unknown): void => {
    if (!node) return;
    if (typeof node === 'string') {
      const m = node.match(SUFFIX_REGEX);
      if (m) {
        const fn = m[1];
        found.set(fn, (found.get(fn) ?? 0) + 1);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === 'object') {
      for (const value of Object.values(node)) walk(value);
    }
  };

  walk(config);
}

/**
 * Strip the `_N` suffix from a filename. Returns null if no suffix found.
 *   `TV_PART01_LAGENCE_ET_VOUS_1.mp4` → `TV_PART01_LAGENCE_ET_VOUS.mp4`
 */
function stripSuffix(filename: string): string | null {
  const m = filename.match(/^(.+?)_\d+(\.(?:mp4|webm))$/i);
  return m ? `${m[1]}${m[2]}` : null;
}

async function checkMasterExists(filenames: string[]): Promise<Set<string>> {
  if (filenames.length === 0) return new Set();
  const result = await query<{ filename: string }>(
    `SELECT DISTINCT filename FROM videos WHERE filename = ANY($1::text[])`,
    [filenames],
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function loadProfiles(siteId: string | null): Promise<Array<{
  site_id: string;
  site_name: string;
  profile_id: string;
  profile_name: string;
  configuration: unknown;
}>> {
  const where = siteId ? `WHERE s.id = $1` : '';
  const params = siteId ? [siteId] : [];
  const result = await query<{
    site_id: string;
    site_name: string;
    profile_id: string;
    profile_name: string;
    configuration: unknown;
  }>(
    `SELECT
       s.id AS site_id,
       s.site_name,
       cp.id AS profile_id,
       cp.name AS profile_name,
       cp.configuration
     FROM config_profiles cp
     JOIN sites s ON s.id = cp.site_id
     ${where}
     ORDER BY s.site_name, cp.sort_order`,
    params,
  );
  return result.rows;
}

async function main(): Promise<void> {
  const { siteId } = parseArgs();

  console.log(SEPARATOR);
  console.log(`AUDIT — config_profiles filename orphans (_N suffix)`);
  if (siteId) console.log(`Filter: site_id = ${siteId}`);
  console.log(SEPARATOR);
  console.log();

  const profiles = await loadProfiles(siteId);
  console.log(`Loaded ${profiles.length} profile(s) from DB.\n`);

  const allOrphans: OrphanRow[] = [];

  for (const profile of profiles) {
    const found = new Map<string, number>();
    extractSuffixedFilenames(profile.configuration, found);
    if (found.size === 0) continue;

    const suffixedNames = [...found.keys()];
    const masterCandidates = suffixedNames
      .map(stripSuffix)
      .filter((s): s is string => s !== null);
    const mastersInDB = await checkMasterExists([...suffixedNames, ...masterCandidates]);

    for (const [filename, count] of found) {
      const master = stripSuffix(filename);
      // We only consider it an orphan candidate if:
      //   - the suffixed file is NOT in `videos` table (meaning no row has
      //     this exact filename), AND
      //   - the master without suffix IS in `videos` table (suggesting the
      //     suffix was added by `generateUniqueFilename` and orphaned).
      const suffixedInDB = mastersInDB.has(filename);
      const masterInDB = master ? mastersInDB.has(master) : false;
      if (!suffixedInDB && masterInDB) {
        allOrphans.push({
          site_id: profile.site_id,
          site_name: profile.site_name,
          profile_id: profile.profile_id,
          profile_name: profile.profile_name,
          filename,
          occurrences: count,
          master_exists_in_videos: true,
        });
      }
    }
  }

  if (allOrphans.length === 0) {
    console.log('✅ No orphan `_N` filenames found.');
    return;
  }

  console.log(`🚨 Found ${allOrphans.length} orphan filename reference(s):\n`);
  console.table(
    allOrphans.map((o) => ({
      site: o.site_name,
      profile: o.profile_name,
      filename: o.filename,
      occurrences: o.occurrences,
      master_OK: o.master_exists_in_videos ? '✓' : '✗',
    })),
  );

  console.log();
  console.log(SEPARATOR);
  console.log('SUMMARY');
  console.log(SEPARATOR);
  const bySite = new Map<string, number>();
  for (const o of allOrphans) {
    bySite.set(o.site_name, (bySite.get(o.site_name) ?? 0) + o.occurrences);
  }
  for (const [site, count] of [...bySite.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${site}: ${count} orphan reference(s)`);
  }
  console.log();
  console.log('Next: write a migration that rewrites `*_N.mp4` → `*.mp4`');
  console.log('      in config_profiles.configuration when master exists.');
}

main()
  .catch((error) => {
    console.error('Audit failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
