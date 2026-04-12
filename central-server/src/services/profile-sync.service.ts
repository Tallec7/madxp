/**
 * Profile Sync Service
 *
 * Builds enriched sync_profiles payloads and sends them to Pi agents.
 * Extracted to avoid circular dependency between socket.service and
 * config-profiles.controller.
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';
import { SiteConfiguration } from '../types';
import { configProfileRepository } from '../repositories/config-profile.repository';
import { enrichConfigWithDisplayVariants } from '../utils/config-secondary-variants';
import { enrichConfigWithAnalyticsMetadata } from '../utils/config-analytics-metadata';
import { autoResolveSponsorIds } from './sponsor-auto-resolution.service';

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
      await enrichConfigWithDisplayVariants(enrichedConfig);
    } catch (err) {
      logger.warn('Secondary variant enrichment failed in reconnect profile sync (non-fatal)', {
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

    syncPayload.push({
      id: p.id,
      name: p.name,
      display_name: p.display_name,
      city: p.city,
      sport: p.sport,
      is_default: p.is_default,
      configuration: enrichedConfig,
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
