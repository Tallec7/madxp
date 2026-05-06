/**
 * Audit orphan site_sponsor_id references in config_profiles.configuration.
 *
 * Context (logs 2026-05-06) : config-sync.handler.ts emits "Skipping video sync
 * for non-existent site_sponsor" warnings on Pi reconnect when the Pi's local
 * config (mirror of cloud config_profiles.configuration) references
 * site_sponsor IDs that no longer exist in site_sponsors. Root cause :
 * a sponsor was deleted but the JSONB references survived.
 *
 * This script :
 *   1. Scans every config_profiles.configuration for site_sponsor_id
 *      references in `sponsors[]` and `timeCategories[].loopVideos[]`.
 *   2. Cross-references against site_sponsors (active + soft-deleted).
 *   3. Reports orphans grouped by site/profile/video filename.
 *   4. With --apply, nullifies the orphan refs (UPDATE config_profiles SET
 *      configuration = ... WHERE id = ...). The Pi gets the cleaned config
 *      on next deploy / cascade-delete-triggered update_config.
 *
 * Usage :
 *   cd central-server && npx ts-node src/scripts/audit-orphan-site-sponsors.ts          # dry-run
 *   cd central-server && npx ts-node src/scripts/audit-orphan-site-sponsors.ts --apply  # write
 */

import pool, { query } from '../config/database';
import logger from '../config/logger';

interface ProfileRow {
  id: string;
  site_id: string;
  name: string;
  configuration: Record<string, unknown>;
  site_name: string;
  [key: string]: unknown;
}

interface OrphanRef {
  profileId: string;
  siteId: string;
  siteName: string;
  profileName: string;
  siteSponsorId: string;
  location: string;
  filename: string;
}

async function loadProfilesWithSponsorRefs(): Promise<ProfileRow[]> {
  const result = await query<ProfileRow>(
    `SELECT cp.id, cp.site_id, cp.name, cp.configuration, s.site_name
     FROM config_profiles cp
     JOIN sites s ON s.id = cp.site_id
     WHERE cp.configuration::text LIKE '%site_sponsor_id%'`,
    []
  );
  return result.rows;
}

async function loadValidSponsorIds(): Promise<Set<string>> {
  // Include all rows regardless of status — a soft-deleted sponsor is still
  // a valid FK for cleanup purposes (only TRULY missing IDs are orphans).
  const result = await query<{ id: string }>('SELECT id FROM site_sponsors', []);
  return new Set(result.rows.map(r => r.id));
}

interface SponsorVideoLike {
  site_sponsor_id?: string;
  path?: string;
  filename?: string;
}

function extractRefs(profile: ProfileRow): Array<{
  siteSponsorId: string;
  location: string;
  filename: string;
}> {
  const refs: Array<{ siteSponsorId: string; location: string; filename: string }> = [];
  const cfg = (profile.configuration ?? {}) as {
    sponsors?: SponsorVideoLike[];
    timeCategories?: Array<{ loopVideos?: SponsorVideoLike[] }>;
  };

  const sponsors = cfg.sponsors ?? [];
  for (let idx = 0; idx < sponsors.length; idx++) {
    const video = sponsors[idx];
    if (video?.site_sponsor_id) {
      refs.push({
        siteSponsorId: video.site_sponsor_id,
        location: `sponsors[${idx}]`,
        filename: video.path ?? video.filename ?? '<unknown>',
      });
    }
  }

  const tcs = cfg.timeCategories ?? [];
  for (let tcIdx = 0; tcIdx < tcs.length; tcIdx++) {
    const loopVideos = tcs[tcIdx]?.loopVideos ?? [];
    for (let vIdx = 0; vIdx < loopVideos.length; vIdx++) {
      const video = loopVideos[vIdx];
      if (video?.site_sponsor_id) {
        refs.push({
          siteSponsorId: video.site_sponsor_id,
          location: `timeCategories[${tcIdx}].loopVideos[${vIdx}]`,
          filename: video.path ?? video.filename ?? '<unknown>',
        });
      }
    }
  }

  return refs;
}

function nullifyOrphans(
  configuration: unknown,
  orphanIds: Set<string>
): { fixed: Record<string, unknown>; cleared: number } {
  // Deep-clone so the original JSONB stays untouched if the caller doesn't want
  // to persist (dry-run path).
  const cfg = JSON.parse(JSON.stringify(configuration ?? {})) as {
    sponsors?: SponsorVideoLike[];
    timeCategories?: Array<{ loopVideos?: SponsorVideoLike[] }>;
  };
  let cleared = 0;

  for (const video of cfg.sponsors ?? []) {
    if (video?.site_sponsor_id && orphanIds.has(video.site_sponsor_id)) {
      delete video.site_sponsor_id;
      cleared++;
    }
  }
  for (const tc of cfg.timeCategories ?? []) {
    for (const video of tc?.loopVideos ?? []) {
      if (video?.site_sponsor_id && orphanIds.has(video.site_sponsor_id)) {
        delete video.site_sponsor_id;
        cleared++;
      }
    }
  }

  return { fixed: cfg as Record<string, unknown>, cleared };
}

async function main() {
  const apply = process.argv.includes('--apply');

  logger.info('Audit start', { mode: apply ? 'apply' : 'dry-run' });

  const [profiles, validIds] = await Promise.all([
    loadProfilesWithSponsorRefs(),
    loadValidSponsorIds(),
  ]);

  const orphans: OrphanRef[] = [];
  const orphansByProfile = new Map<string, Set<string>>();

  for (const profile of profiles) {
    const refs = extractRefs(profile);
    const profileOrphans = new Set<string>();
    for (const ref of refs) {
      if (!validIds.has(ref.siteSponsorId)) {
        orphans.push({
          profileId: profile.id,
          siteId: profile.site_id,
          siteName: profile.site_name,
          profileName: profile.name,
          ...ref,
        });
        profileOrphans.add(ref.siteSponsorId);
      }
    }
    if (profileOrphans.size > 0) {
      orphansByProfile.set(profile.id, profileOrphans);
    }
  }

  if (orphans.length === 0) {
    logger.info('No orphan site_sponsor references found', {
      profilesScanned: profiles.length,
      validSponsorIds: validIds.size,
    });
    await pool.end();
    return;
  }

  // Group for human-readable report
  const bySite = new Map<string, OrphanRef[]>();
  for (const o of orphans) {
    const k = `${o.siteName} (${o.siteId})`;
    if (!bySite.has(k)) bySite.set(k, []);
    bySite.get(k)!.push(o);
  }

  logger.warn('Orphan site_sponsor references found', {
    totalOrphanRefs: orphans.length,
    distinctOrphanIds: new Set(orphans.map(o => o.siteSponsorId)).size,
    affectedProfiles: orphansByProfile.size,
    affectedSites: bySite.size,
  });

  for (const [siteKey, list] of bySite) {
    logger.warn(`Site: ${siteKey}`, {
      profileNames: [...new Set(list.map(o => o.profileName))],
      orphanIds: [...new Set(list.map(o => o.siteSponsorId))],
      filenames: [...new Set(list.map(o => o.filename))].slice(0, 10),
    });
  }

  if (!apply) {
    logger.info('Dry-run complete. Re-run with --apply to nullify orphan refs.');
    await pool.end();
    return;
  }

  // Apply : nullify orphan refs in the JSONB. Idempotent — running twice is a no-op.
  let updatedProfiles = 0;
  let totalCleared = 0;

  for (const profile of profiles) {
    const orphanIds = orphansByProfile.get(profile.id);
    if (!orphanIds || orphanIds.size === 0) continue;

    const { fixed, cleared } = nullifyOrphans(profile.configuration, orphanIds);
    if (cleared === 0) continue;

    await query(
      'UPDATE config_profiles SET configuration = $1, updated_at = NOW() WHERE id = $2',
      [fixed, profile.id]
    );
    updatedProfiles++;
    totalCleared += cleared;
    logger.info('Profile cleaned', {
      profileId: profile.id,
      siteId: profile.site_id,
      siteName: profile.site_name,
      profileName: profile.name,
      refsCleared: cleared,
    });
  }

  logger.info('Audit apply complete', {
    profilesUpdated: updatedProfiles,
    refsCleared: totalCleared,
    note: 'Push update_config to affected sites for the Pi to pick up the cleaned config (or wait for next deploy).',
  });

  await pool.end();
}

main().catch(err => {
  logger.error('Audit failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
