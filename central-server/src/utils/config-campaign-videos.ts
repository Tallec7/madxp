/**
 * ADR-035 Phase 3b — Enrich a SiteConfiguration with active campaign videos.
 *
 * Queries all active campaigns targeting this site and injects their videos
 * into the config's `sponsors[]` array with proper analytics metadata
 * (advertiser_id, campaign_id, analytics_category = 'sponsor_neopro').
 *
 * Campaign videos are appended AFTER existing sponsor entries so that
 * the Bresenham weighted playlist merges them naturally.
 *
 * This function must be called BEFORE enrichConfigWithAnalyticsMetadata()
 * so that video_id resolution can augment the entries.
 */

import { SiteConfiguration, SponsorVideo } from '../types';
import { campaignRepository } from '../repositories/campaign.repository';
import logger from '../config/logger';

/**
 * Inject active campaign videos into the site configuration.
 * Mutates config.sponsors in place and returns the count of injected videos.
 */
export async function enrichConfigWithCampaignVideos(
  siteId: string,
  config: SiteConfiguration
): Promise<{ config: SiteConfiguration; injectedCount: number }> {
  const rows = await campaignRepository.getActiveCampaignsForSite(siteId);

  if (rows.length === 0) {
    return { config, injectedCount: 0 };
  }

  if (!config.sponsors) {
    config.sponsors = [];
  }

  // Deduplicate: don't inject a video that already exists in the sponsors list
  const existingFilenames = new Set(
    config.sponsors
      .map(s => s.path?.split('/').pop())
      .filter(Boolean)
  );

  let injectedCount = 0;

  for (const row of rows) {
    // Skip if this video filename is already in the config
    if (existingFilenames.has(row.filename)) {
      continue;
    }

    const entry: SponsorVideo = {
      name: row.original_name || row.filename,
      path: `videos/default/${row.filename}`,
      owner: 'neopro',
      locked: true,
      advertiser_id: row.advertiser_id,
      campaign_id: row.campaign_id,
      analytics_category: 'sponsor_neopro',
      weight: row.weight,
    };

    config.sponsors.push(entry);
    existingFilenames.add(row.filename);
    injectedCount++;
  }

  if (injectedCount > 0) {
    logger.info('Campaign videos injected into site config', {
      siteId,
      injectedCount,
      campaignCount: new Set(rows.map(r => r.campaign_id)).size,
    });
  }

  return { config, injectedCount };
}
