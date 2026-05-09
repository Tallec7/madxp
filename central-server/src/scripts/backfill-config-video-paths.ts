/**
 * Backfill : normalise les chemins vidéo plats dans config_profiles.configuration.
 *
 * Contexte (incident 2026-05-09) : les profils en DB stockent des noms de fichiers
 * sans préfixe (ex: "TV_BUT_01.mp4"). Le Pi route /videos/ via nginx → admin-server;
 * une URL plate http://neopro.local/TV_BUT_01.mp4 retourne 200 HTML (Angular SPA
 * fallback) au lieu de la vidéo → FFmpegDemuxer crash.
 *
 * La PR #935 ajoute normalizeConfigVideoPaths() dans buildEnrichedNeoProContent(),
 * ce qui corrige les futures émissions update_config. Mais les profils en DB restent
 * avec des chemins plats → tout reload-config depuis un Pi sans le nouveau déploiement
 * continue de propager des chemins cassés.
 *
 * Ce script corrige la DB directement pour couper le ping-pong immédiatement,
 * indépendamment du déploiement Railway.
 *
 * Règle de normalisation (même logique que normalizeConfigVideoPaths()) :
 *   - Si un chemin ne contient pas "/" → videos/default/<filename>
 *   - Sinon → inchangé (déjà prefixé)
 *
 * Idempotent : relancer le script sur un profil déjà corrigé ne change rien.
 *
 * Usage :
 *   cd central-server && npx ts-node src/scripts/backfill-config-video-paths.ts
 *   cd central-server && npx ts-node src/scripts/backfill-config-video-paths.ts --dry-run
 *   cd central-server && npx ts-node src/scripts/backfill-config-video-paths.ts --site-id c994620c-2016-40f3-9399-2d0345f69274
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
}

function fixPath(p: string): string {
  return p.includes('/') ? p : `videos/default/${p}`;
}

function normalizeConfiguration(config: SiteConfiguration): { normalized: SiteConfiguration; changed: number } {
  let changed = 0;

  const fix = (entry: VideoEntry) => {
    if (entry.path && typeof entry.path === 'string') {
      const fixed = fixPath(entry.path);
      if (fixed !== entry.path) {
        entry.path = fixed;
        changed++;
      }
    }
  };

  if (config.sponsors) {
    for (const s of config.sponsors) fix(s);
  }

  if (config.categories) {
    for (const cat of config.categories) {
      if (cat.videos) for (const v of cat.videos) fix(v);
      if (cat.subCategories) {
        for (const sub of cat.subCategories) {
          if (sub.videos) for (const v of sub.videos) fix(v);
        }
      }
    }
  }

  if (config.timeCategories) {
    for (const tc of config.timeCategories) {
      if (tc.loopVideos) for (const v of tc.loopVideos) fix(v);
    }
  }

  return { normalized: config, changed };
}

async function run() {
  logger.info('backfill-config-video-paths: start', { isDryRun, siteIdFilter });

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

  logger.info('backfill-config-video-paths: profiles to check', { count: profiles.length });

  let totalFixed = 0;
  let totalUnchanged = 0;
  let totalFailed = 0;

  for (const profile of profiles) {
    try {
      const config = profile.configuration as SiteConfiguration;
      const { normalized, changed } = normalizeConfiguration(config);

      if (changed === 0) {
        totalUnchanged++;
        continue;
      }

      logger.info('backfill-config-video-paths: fixing profile', {
        profileId: profile.id,
        siteId: profile.site_id,
        profileName: profile.name,
        isDefault: profile.is_default,
        pathsFixed: changed,
        dryRun: isDryRun,
      });

      if (!isDryRun) {
        await query(
          `UPDATE config_profiles SET configuration = $1 WHERE id = $2`,
          [JSON.stringify(normalized), profile.id]
        );
      }

      totalFixed++;
    } catch (err) {
      logger.error('backfill-config-video-paths: failed for profile', {
        profileId: profile.id,
        siteId: profile.site_id,
        error: (err as Error).message,
      });
      totalFailed++;
    }
  }

  logger.info('backfill-config-video-paths: done', {
    totalFixed,
    totalUnchanged,
    totalFailed,
    isDryRun,
  });

  await pool.end();
}

run().catch(err => {
  logger.error('backfill-config-video-paths: fatal', { error: err.message });
  process.exit(1);
});
