/**
 * Profile Sync Service
 *
 * Builds enriched sync_profiles payloads and sends them to Pi agents.
 * Extracted to avoid circular dependency between socket.service and
 * config-profiles.controller.
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';
import { SiteConfiguration, SiteSponsorDeployment } from '../types';
import { configProfileRepository } from '../repositories/config-profile.repository';
import { siteSponsorRepository } from '../repositories/site-sponsor.repository';
import { videoRepository } from '../repositories/video.repository';
import { enrichConfigWithDisplayVariants, resolveDisplayTypesForSite } from '../utils/config-secondary-variants';
import { enrichConfigWithAnalyticsMetadata } from '../utils/config-analytics-metadata';
import { normalizeConfigVideoPaths } from '../utils/config-video-paths';
import {
  collectSyntheticWebContentFilenames,
  resolveSyntheticWebContent,
  stripSyntheticWebContent,
} from '../utils/strip-synthetic-web-content';
import { autoResolveSponsorIds } from './sponsor-auto-resolution.service';

/**
 * ADR-103 — Rewrite synthetic `web_page-<ts>` / `livestream-<ts>` entries to
 * their proper runtime shape (path = external_url, contentType, type = text/html
 * or application/vnd.apple.mpegurl) BEFORE the config reaches a Pi. Without
 * this step the TV-side defensive filter drops the entries as unresolved
 * placeholders and the page/stream never plays.
 *
 * Same pattern as saas.controller.ts:303-319 and remote.controller.ts:283-295.
 * Centralised here so all Pi-bound config builders (`buildEnrichedNeoProContent`,
 * `sendSyncProfilesToSite`) share the wiring.
 */
async function resolveAndStripWebContent(
  config: Record<string, unknown>,
  logContext: { siteId: string; profileId?: string },
): Promise<void> {
  const synthFilenames = collectSyntheticWebContentFilenames(config);
  if (synthFilenames.length > 0) {
    try {
      const lookup = await videoRepository.findWebContentByFilenames(synthFilenames);
      resolveSyntheticWebContent(config, lookup);
    } catch (err) {
      logger.warn('Web-content resolve failed in Pi config builder (non-fatal — strip will drop leftovers)', {
        ...logContext, error: (err as Error).message,
      });
    }
  }
  stripSyntheticWebContent(config);
}

/**
 * Build enriched profiles payload and send sync_profiles command to a site.
 * Returns the number of profiles sent, or 0 if the site has <= 1 profile.
 *
 * Uses a lazy import of socketService to avoid circular dependencies.
 */
export async function sendSyncProfilesToSite(siteId: string): Promise<number> {
  const profiles = await configProfileRepository.findBySite(siteId);

  if (profiles.length <= 1) {
    return 0;
  }

  const syncPayload = [];
  const reconnectDisplayTypes = await resolveDisplayTypesForSite(siteId).catch(() => ['secondary']);
  for (const p of profiles) {
    let enrichedConfig = p.configuration as SiteConfiguration;

    try {
      const { configuration: resolved, resolved: resolvedCount } =
        await autoResolveSponsorIds(siteId, enrichedConfig);
      if (resolvedCount > 0) enrichedConfig = resolved;
    } catch (err) {
      logger.warn('Sponsor auto-resolution failed in reconnect profile sync (non-fatal)', {
        siteId, profileId: p.id, error: (err as Error).message,
      });
    }

    try {
      await enrichConfigWithDisplayVariants(enrichedConfig, reconnectDisplayTypes, { siteId });
    } catch (err) {
      logger.warn('Display variant enrichment failed in reconnect profile sync (non-fatal)', {
        siteId, profileId: p.id, error: (err as Error).message,
      });
    }

    try {
      await enrichConfigWithAnalyticsMetadata(enrichedConfig);
    } catch (err) {
      logger.warn('Analytics metadata enrichment failed in reconnect profile sync (non-fatal)', {
        siteId, profileId: p.id, error: (err as Error).message,
      });
    }

    await resolveAndStripWebContent(enrichedConfig as unknown as Record<string, unknown>, {
      siteId, profileId: p.id,
    });

    // ADR-058 — propager l'etat PIN profil au Pi pour validation offline (bcrypt hash).
    let pinMeta: {
      remote_pin_required: boolean;
      remote_pin_hash: string | null;
      remote_pin_updated_at: string | null;
    } = { remote_pin_required: false, remote_pin_hash: null, remote_pin_updated_at: null };
    try {
      const pin = await configProfileRepository.findPin(p.id);
      if (pin) {
        pinMeta = {
          remote_pin_required: !!pin.remote_pin_required,
          remote_pin_hash: pin.remote_pin_hash,
          remote_pin_updated_at: pin.remote_pin_updated_at
            ? pin.remote_pin_updated_at.toISOString()
            : null,
        };
      }
    } catch (err) {
      logger.warn('PIN metadata fetch failed in sync profiles (non-fatal)', {
        siteId, profileId: p.id, error: (err as Error).message,
      });
    }

    syncPayload.push({
      id: p.id,
      name: p.name,
      display_name: p.display_name,
      city: p.city,
      sport: p.sport,
      is_default: p.is_default,
      configuration: enrichedConfig,
      ...pinMeta,
    });
  }

  // Lazy import to break circular dependency (socket.service → this → socket.service)
  const { default: socketService } = await import('./socket.service');

  await socketService.sendCommand(siteId, {
    id: uuidv4(),
    type: 'sync_profiles',
    data: { profiles: syncPayload },
  });

  logger.info('Profiles auto-synced on reconnect', {
    siteId,
    profileCount: profiles.length,
  });

  return profiles.length;
}

/**
 * Build the enriched neoProContent payload for a site's default profile.
 *
 * Used by callers that need to push a fresh `update_config` to the Pi after
 * a server-side mutation that invalidates the deployed config (cascade delete,
 * video replace, FTP orphan unlink). Goes through the full enrichment chain
 * (sponsor auto-resolution → display variants → analytics metadata) per
 * `.claude/rules/services.md`.
 *
 * Returns null if the site has no default profile (SaaS provisioning hole or
 * caller mistakenly invoked on a non-Pi site).
 */
export async function buildEnrichedNeoProContent(
  siteId: string
): Promise<{
  neoProContent: {
    sponsors: SiteConfiguration['sponsors'];
    categories: SiteConfiguration['categories'];
    timeCategories: SiteConfiguration['timeCategories'];
    categoryMappings: SiteConfiguration['categoryMappings'];
    liveScoreEnabled: SiteConfiguration['liveScoreEnabled'];
    scoreOverlay: SiteConfiguration['scoreOverlay'];
    siteSponsors: SiteSponsorDeployment[];
  };
} | null> {
  const profile = await configProfileRepository.findDefaultForSite(siteId);
  if (!profile) {
    logger.warn('buildEnrichedNeoProContent: no default profile for site', { siteId });
    return null;
  }

  let enrichedConfig = profile.configuration as SiteConfiguration;

  try {
    const { configuration: resolved, resolved: resolvedCount } =
      await autoResolveSponsorIds(siteId, enrichedConfig);
    if (resolvedCount > 0) enrichedConfig = resolved;
  } catch (err) {
    logger.warn('Sponsor auto-resolution failed in buildEnrichedNeoProContent (non-fatal)', {
      siteId, error: (err as Error).message,
    });
  }

  try {
    const displayTypes = await resolveDisplayTypesForSite(siteId);
    await enrichConfigWithDisplayVariants(enrichedConfig, displayTypes, { siteId });
  } catch (err) {
    logger.warn('Display variant enrichment failed in buildEnrichedNeoProContent (non-fatal)', {
      siteId, error: (err as Error).message,
    });
  }

  try {
    await enrichConfigWithAnalyticsMetadata(enrichedConfig);
  } catch (err) {
    logger.warn('Analytics metadata enrichment failed in buildEnrichedNeoProContent (non-fatal)', {
      siteId, error: (err as Error).message,
    });
  }

  // ADR-103 — Résout les `web_page-<ts>` / `livestream-<ts>` AVANT
  // `normalizeConfigVideoPaths` : ce dernier ajoute `videos/default/` à
  // tout path sans `/`, ce qui ferait tomber un synthétique nu dans le
  // pattern legacy et casserait à la fois la résolution Pi-side et le
  // strip défensif TV.
  await resolveAndStripWebContent(
    enrichedConfig as unknown as Record<string, unknown>,
    { siteId, profileId: profile.id },
  );

  // Normalise les chemins plats (sans "/") en chemins complets videos/<cat>/<file>.
  // Les config_profiles en DB stockent parfois des noms de fichiers sans préfixe ;
  // le Pi nécessite le chemin complet pour que nginx route vers admin-server:8080.
  normalizeConfigVideoPaths(enrichedConfig);

  const sponsorRows = await siteSponsorRepository.getSponsorsForDeployment(siteId);
  const siteSponsors: SiteSponsorDeployment[] = sponsorRows.map(row => ({
    id: row.id,
    name: row.name,
    display_name: row.name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    logoUrl: row.logo_url,
    videoFilenames: row.video_filenames || [],
    isActive: true,
  }));

  return {
    neoProContent: {
      sponsors: enrichedConfig.sponsors,
      categories: enrichedConfig.categories,
      timeCategories: enrichedConfig.timeCategories,
      categoryMappings: enrichedConfig.categoryMappings,
      liveScoreEnabled: enrichedConfig.liveScoreEnabled,
      scoreOverlay: enrichedConfig.scoreOverlay,
      siteSponsors,
    },
  };
}
