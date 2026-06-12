/**
 * Backfill : tague `owner: 'club'` sur les vidéos de config qui sont en réalité
 * des uploads du club, mais à qui il manque le champ `owner`.
 *
 * Contexte (incident Piraths 2026-06-12) : dans `config_profiles.configuration`,
 * les entrées `timeCategories[].loopVideos[]` (et `categories[].videos[]`,
 * sous-catégories, sponsors) étaient écrites SANS champ `owner`. Côté dashboard,
 * `loop-manager.isNeoproVideo()` retourne `owner !== 'club'` → une vidéo sans
 * owner explicite est traitée comme **NEOPRO** (corporate, read-only). Résultat :
 * un compte `club` ne pouvait ni gérer la pondération ni supprimer ses PROPRES
 * vidéos de boucle — elles apparaissaient verrouillées (🔒).
 *
 * Le fix frontend (`applyVideoSelection` tague désormais `owner` selon
 * `isForThisSite`) corrige les futures sélections. Ce script corrige l'existant.
 *
 * Règle (sûre) : pour chaque entrée vidéo SANS `owner`, on ne pose `owner:'club'`
 * QUE si le filename (basename du `path`) correspond à une vidéo réellement
 * uploadée par ce site (`videos.uploaded_for_site_id = config_profiles.site_id`).
 * Toute entrée non appariée est laissée telle quelle → reste NEOPRO par défaut
 * (on ne déverrouille JAMAIS du contenu NEOPRO corporate).
 *
 * Idempotent : une entrée déjà taguée (owner présent) n'est jamais modifiée.
 *
 * Usage :
 *   cd central-server && npx ts-node src/scripts/backfill-loop-video-owner.ts --dry-run
 *   cd central-server && npx ts-node src/scripts/backfill-loop-video-owner.ts
 *   cd central-server && npx ts-node src/scripts/backfill-loop-video-owner.ts --site-id 43bada55-8c43-4766-a9df-93c040a53de4
 */

import logger from '../config/logger';
import pool, { query } from '../config/database';

const isDryRun = process.argv.includes('--dry-run');
const siteIdFilter = (() => {
  const idx = process.argv.indexOf('--site-id');
  return idx !== -1 ? process.argv[idx + 1] : undefined;
})();

interface VideoEntry {
  path?: string;
  owner?: string;
  [key: string]: unknown;
}

interface SubCategory {
  videos?: VideoEntry[];
  [key: string]: unknown;
}

interface Category {
  videos?: VideoEntry[];
  subCategories?: SubCategory[];
  [key: string]: unknown;
}

interface TimeCategory {
  loopVideos?: VideoEntry[];
  [key: string]: unknown;
}

interface SiteConfiguration {
  sponsors?: VideoEntry[];
  categories?: Category[];
  timeCategories?: TimeCategory[];
  [key: string]: unknown;
}

interface ProfileRow {
  id: string;
  site_id: string;
  name: string;
  is_default: boolean;
  configuration: SiteConfiguration;
  [key: string]: unknown;
}

function basename(p: string): string {
  return (p.split('/').pop() || p).toLowerCase();
}

/**
 * Stampe owner:'club' sur toutes les entrées sans owner dont le filename matche
 * un upload du club. Mute `config` en place. Retourne le nombre d'entrées taguées.
 */
function tagClubOwned(config: SiteConfiguration, clubFilenames: Set<string>): number {
  let tagged = 0;

  const tag = (entry: VideoEntry) => {
    if (entry.owner) return; // déjà tagué → ne jamais toucher
    if (!entry.path || typeof entry.path !== 'string') return;
    if (clubFilenames.has(basename(entry.path))) {
      entry.owner = 'club';
      tagged++;
    }
  };

  if (config.sponsors) for (const s of config.sponsors) tag(s);

  if (config.categories) {
    for (const cat of config.categories) {
      if (cat.videos) for (const v of cat.videos) tag(v);
      if (cat.subCategories) {
        for (const sub of cat.subCategories) {
          if (sub.videos) for (const v of sub.videos) tag(v);
        }
      }
    }
  }

  if (config.timeCategories) {
    for (const tc of config.timeCategories) {
      if (tc.loopVideos) for (const v of tc.loopVideos) tag(v);
    }
  }

  return tagged;
}

async function run() {
  logger.info('backfill-loop-video-owner: start', { isDryRun, siteIdFilter });

  const params: unknown[] = [];
  let where = '1=1';
  if (siteIdFilter) {
    where = 'site_id = $1';
    params.push(siteIdFilter);
  }

  const { rows: profiles } = await query<ProfileRow>(
    `SELECT id, site_id, name, is_default, configuration
     FROM config_profiles
     WHERE ${where}
     ORDER BY site_id, is_default DESC, name`,
    params
  );

  logger.info('backfill-loop-video-owner: profiles to check', { count: profiles.length });

  // Cache des filenames club par site (évite N requêtes par profil du même site).
  const clubFilenamesBySite = new Map<string, Set<string>>();
  const getClubFilenames = async (siteId: string): Promise<Set<string>> => {
    const cached = clubFilenamesBySite.get(siteId);
    if (cached) return cached;
    const { rows } = await query<{ filename: string }>(
      `SELECT filename FROM videos WHERE uploaded_for_site_id = $1`,
      [siteId]
    );
    const set = new Set(rows.map((r) => r.filename.toLowerCase()));
    clubFilenamesBySite.set(siteId, set);
    return set;
  };

  let totalTagged = 0;
  let profilesUpdated = 0;
  let profilesUnchanged = 0;
  let profilesFailed = 0;

  for (const profile of profiles) {
    try {
      const clubFilenames = await getClubFilenames(profile.site_id);
      if (clubFilenames.size === 0) {
        profilesUnchanged++;
        continue;
      }

      const config = profile.configuration as SiteConfiguration;
      const tagged = tagClubOwned(config, clubFilenames);

      if (tagged === 0) {
        profilesUnchanged++;
        continue;
      }

      logger.info('backfill-loop-video-owner: tagging profile', {
        profileId: profile.id,
        siteId: profile.site_id,
        profileName: profile.name,
        isDefault: profile.is_default,
        entriesTagged: tagged,
        dryRun: isDryRun,
      });

      if (!isDryRun) {
        await query(`UPDATE config_profiles SET configuration = $1 WHERE id = $2`, [
          JSON.stringify(config),
          profile.id,
        ]);
      }

      totalTagged += tagged;
      profilesUpdated++;
    } catch (err) {
      logger.error('backfill-loop-video-owner: failed for profile', {
        profileId: profile.id,
        siteId: profile.site_id,
        error: (err as Error).message,
      });
      profilesFailed++;
    }
  }

  logger.info('backfill-loop-video-owner: done', {
    totalTagged,
    profilesUpdated,
    profilesUnchanged,
    profilesFailed,
    isDryRun,
  });

  await pool.end();
}

run().catch((err) => {
  logger.error('backfill-loop-video-owner: fatal', { error: err.message });
  process.exit(1);
});
