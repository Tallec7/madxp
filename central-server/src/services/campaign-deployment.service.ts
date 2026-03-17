/**
 * Campaign Deployment Service — ADR-035 Phase 3b.
 *
 * Orchestrates the deployment of campaign videos to target sites:
 * 1. Validates campaign has videos and target sites
 * 2. Sets campaign status to 'active'
 * 3. Resolves sites from target_criteria if needed
 * 4. For each target site: triggers a config resync (the enrichment pipeline
 *    in config-sync.handler.ts will inject active campaign videos automatically)
 * 5. Tracks deployment_status per site in campaign_sites
 *
 * The actual video injection happens in enrichConfigWithCampaignVideos() called
 * during sendPendingConfigCommand(). This service only triggers the resync.
 */

import { v4 as uuidv4 } from 'uuid';
import { campaignRepository } from '../repositories/campaign.repository';
import { configHistoryRepository } from '../repositories/config-history.repository';
import logger from '../config/logger';

interface DeployResult {
  campaignId: string;
  status: 'deployed' | 'partial' | 'failed';
  sitesTriggered: number;
  sitesFailed: number;
  errors: string[];
}

/**
 * Deploy a campaign: activate it, resolve sites, and trigger config resync
 * on all target sites so they receive the campaign videos.
 */
export async function deployCampaign(campaignId: string): Promise<DeployResult> {
  const campaign = await campaignRepository.findByIdWithDetails(campaignId);
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  // Validate campaign has videos
  const videos = await campaignRepository.listVideos(campaignId);
  if (videos.length === 0) {
    throw new Error('Campaign has no videos — add at least one video before deploying');
  }

  // Resolve sites from target_criteria if campaign has no manually added sites
  let sites = await campaignRepository.listSites(campaignId);
  if (sites.length === 0 && campaign.target_criteria) {
    sites = await campaignRepository.resolveAndPopulateSites(campaignId, campaign.target_criteria);
  }
  if (sites.length === 0) {
    throw new Error('Campaign has no target sites — add sites or configure target_criteria');
  }

  // Activate the campaign
  if (campaign.status !== 'active') {
    await campaignRepository.update(campaignId, { status: 'active' });
  }

  // Trigger config resync for each target site.
  // The enrichment pipeline (enrichConfigWithCampaignVideos) will inject campaign videos
  // into the config during sendPendingConfigCommand().
  const errors: string[] = [];
  let sitesTriggered = 0;
  let sitesFailed = 0;

  // Lazy import to avoid circular dependency with socket.service
  const socketService = (await import('./socket.service')).default;

  for (const site of sites) {
    try {
      // Get the site's latest config version to base the resync on
      const lastVersion = await configHistoryRepository.findLastVersion(site.site_id);

      if (lastVersion) {
        // Re-save config to trigger a new pending sync (which will include campaign videos)
        const versionId = uuidv4();
        await configHistoryRepository.insertVersion({
          id: versionId,
          site_id: site.site_id,
          configuration: JSON.stringify(lastVersion.configuration),
          deployed_by: undefined,
          comment: `Campaign deployment: ${campaign.name}`,
          previous_version_id: lastVersion.id,
          changes_summary: JSON.stringify([{
            field: 'campaigns',
            path: 'campaigns',
            type: 'added',
            newValue: { campaign_id: campaignId, campaign_name: campaign.name, videos: videos.length },
          }]),
        });

        await configHistoryRepository.updateSitePendingConfigVersion(site.site_id, versionId);
      }

      // Trigger the sync — if the Pi is connected, it gets the config immediately;
      // otherwise it will receive it on next connection
      await socketService.triggerPendingConfigSync(site.site_id);

      await campaignRepository.updateSiteDeploymentStatus(campaignId, site.site_id, 'deployed');
      sitesTriggered++;
    } catch (error) {
      const message = `Site ${site.site_id} (${site.site_name}): ${(error as Error).message}`;
      errors.push(message);
      sitesFailed++;

      try {
        await campaignRepository.updateSiteDeploymentStatus(campaignId, site.site_id, 'failed');
      } catch {
        // non-fatal
      }

      logger.error('Campaign deployment failed for site', {
        campaignId,
        siteId: site.site_id,
        error: (error as Error).message,
      });
    }
  }

  const status = sitesFailed === 0 ? 'deployed' : sitesTriggered === 0 ? 'failed' : 'partial';

  logger.info('Campaign deployment completed', {
    campaignId,
    campaignName: campaign.name,
    status,
    sitesTriggered,
    sitesFailed,
    totalSites: sites.length,
  });

  return { campaignId, status, sitesTriggered, sitesFailed, errors };
}

/**
 * Undeploy a campaign: pause it, and trigger config resync on all deployed sites
 * so that campaign videos are removed from their configs.
 */
export async function undeployCampaign(campaignId: string): Promise<DeployResult> {
  const campaign = await campaignRepository.findById(campaignId);
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  // Pause the campaign — the enrichment pipeline won't inject videos for non-active campaigns
  await campaignRepository.update(campaignId, { status: 'paused' });

  const sites = await campaignRepository.listSites(campaignId);
  const errors: string[] = [];
  let sitesTriggered = 0;
  let sitesFailed = 0;

  const socketService = (await import('./socket.service')).default;

  for (const site of sites) {
    if (site.deployment_status === 'removed') continue;

    try {
      const lastVersion = await configHistoryRepository.findLastVersion(site.site_id);
      if (lastVersion) {
        const versionId = uuidv4();
        await configHistoryRepository.insertVersion({
          id: versionId,
          site_id: site.site_id,
          configuration: JSON.stringify(lastVersion.configuration),
          deployed_by: undefined,
          comment: `Campaign undeployment: ${campaign.name}`,
          previous_version_id: lastVersion.id,
          changes_summary: JSON.stringify([{
            field: 'campaigns',
            path: 'campaigns',
            type: 'removed',
            oldValue: { campaign_id: campaignId },
          }]),
        });

        await configHistoryRepository.updateSitePendingConfigVersion(site.site_id, versionId);
      }

      await socketService.triggerPendingConfigSync(site.site_id);
      await campaignRepository.updateSiteDeploymentStatus(campaignId, site.site_id, 'pending');
      sitesTriggered++;
    } catch (error) {
      const message = `Site ${site.site_id} (${site.site_name}): ${(error as Error).message}`;
      errors.push(message);
      sitesFailed++;

      logger.error('Campaign undeployment failed for site', {
        campaignId,
        siteId: site.site_id,
        error: (error as Error).message,
      });
    }
  }

  const status = sitesFailed === 0 ? 'deployed' : sitesTriggered === 0 ? 'failed' : 'partial';
  return { campaignId, status, sitesTriggered, sitesFailed, errors };
}
