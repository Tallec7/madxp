import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import { campaignRepository } from '../repositories';

// ============================================================================
// CAMPAIGN CRUD
// ============================================================================

/**
 * GET /api/campaigns
 * List all campaigns (optionally filtered by status or advertiser)
 */
export const listCampaigns = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, advertiser_id } = req.query;
    const campaigns = await campaignRepository.listAll({
      status: typeof status === 'string' ? status : undefined,
      advertiserId: typeof advertiser_id === 'string' ? advertiser_id : undefined,
    });

    res.json({ success: true, data: { campaigns, total: campaigns.length } });
  } catch (error) {
    logger.error('Error listing campaigns:', error);
    res.status(500).json({ success: false, error: 'Failed to list campaigns' });
  }
};

/**
 * GET /api/campaigns/:id
 */
export const getCampaign = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid campaign ID' });
      return;
    }

    const campaign = await campaignRepository.findByIdWithDetails(id);
    if (!campaign) {
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }

    res.json({ success: true, data: { campaign } });
  } catch (error) {
    logger.error('Error getting campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to get campaign' });
  }
};

/**
 * POST /api/campaigns
 */
export const createCampaign = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      advertiser_id, name, campaign_type,
      target_impressions, target_criteria,
      budget_cents, target_cpm_cents,
      start_date, end_date,
    } = req.body;

    if (!advertiser_id || !name) {
      res.status(400).json({ success: false, error: 'advertiser_id and name are required' });
      return;
    }

    if (!validateUuid(advertiser_id)) {
      res.status(400).json({ success: false, error: 'Invalid advertiser_id' });
      return;
    }

    const campaign = await campaignRepository.create({
      advertiserId: advertiser_id,
      name,
      campaignType: campaign_type,
      targetImpressions: target_impressions,
      targetCriteria: target_criteria,
      budgetCents: budget_cents,
      targetCpmCents: target_cpm_cents,
      startDate: start_date,
      endDate: end_date,
    });

    res.status(201).json({ success: true, data: { campaign } });
  } catch (error) {
    logger.error('Error creating campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to create campaign' });
  }
};

/**
 * PUT /api/campaigns/:id
 */
export const updateCampaign = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid campaign ID' });
      return;
    }

    const {
      name, campaign_type, target_impressions,
      target_criteria, budget_cents, target_cpm_cents,
      status, start_date, end_date,
    } = req.body;

    const campaign = await campaignRepository.update(id, {
      name,
      campaignType: campaign_type,
      targetImpressions: target_impressions,
      targetCriteria: target_criteria,
      budgetCents: budget_cents,
      targetCpmCents: target_cpm_cents,
      status,
      startDate: start_date,
      endDate: end_date,
    });

    if (!campaign) {
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }

    res.json({ success: true, data: { campaign } });
  } catch (error) {
    logger.error('Error updating campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to update campaign' });
  }
};

/**
 * DELETE /api/campaigns/:id
 */
export const deleteCampaign = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid campaign ID' });
      return;
    }

    const deleted = await campaignRepository.deleteById(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    logger.error('Error deleting campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to delete campaign' });
  }
};

// ============================================================================
// CAMPAIGN VIDEOS
// ============================================================================

/**
 * GET /api/campaigns/:id/videos
 */
export const listCampaignVideos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid campaign ID' });
      return;
    }

    const videos = await campaignRepository.listVideos(id);
    res.json({ success: true, data: { videos, total: videos.length } });
  } catch (error) {
    logger.error('Error listing campaign videos:', error);
    res.status(500).json({ success: false, error: 'Failed to list campaign videos' });
  }
};

/**
 * POST /api/campaigns/:id/videos
 * Body: { video_id: string, weight?: number }
 */
export const addCampaignVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { video_id, weight } = req.body;

    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid campaign ID' });
      return;
    }
    if (!video_id || !validateUuid(video_id)) {
      res.status(400).json({ success: false, error: 'Invalid video_id' });
      return;
    }

    const video = await campaignRepository.addVideo(id, video_id, weight);
    res.status(201).json({ success: true, data: { video } });
  } catch (error) {
    logger.error('Error adding video to campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to add video to campaign' });
  }
};

/**
 * DELETE /api/campaigns/:id/videos/:videoId
 */
export const removeCampaignVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, videoId } = req.params;
    if (!validateUuid(id) || !validateUuid(videoId)) {
      res.status(400).json({ success: false, error: 'Invalid ID' });
      return;
    }

    const removed = await campaignRepository.removeVideo(id, videoId);
    if (!removed) {
      res.status(404).json({ success: false, error: 'Video not found in campaign' });
      return;
    }

    res.json({ success: true, data: { removed: true } });
  } catch (error) {
    logger.error('Error removing video from campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to remove video from campaign' });
  }
};

// ============================================================================
// CAMPAIGN SITES
// ============================================================================

/**
 * GET /api/campaigns/:id/sites
 */
export const listCampaignSites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid campaign ID' });
      return;
    }

    const sites = await campaignRepository.listSites(id);
    res.json({ success: true, data: { sites, total: sites.length } });
  } catch (error) {
    logger.error('Error listing campaign sites:', error);
    res.status(500).json({ success: false, error: 'Failed to list campaign sites' });
  }
};

/**
 * POST /api/campaigns/:id/sites
 * Body: { site_id: string } OR { resolve: true } (auto-resolve from target_criteria)
 */
export const addCampaignSite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid campaign ID' });
      return;
    }

    const { site_id, resolve } = req.body;

    if (resolve) {
      // Auto-resolve from target_criteria
      const campaign = await campaignRepository.findById(id);
      if (!campaign) {
        res.status(404).json({ success: false, error: 'Campaign not found' });
        return;
      }
      if (!campaign.target_criteria) {
        res.status(400).json({ success: false, error: 'Campaign has no target_criteria' });
        return;
      }

      const sites = await campaignRepository.resolveAndPopulateSites(id, campaign.target_criteria);
      res.json({ success: true, data: { sites, total: sites.length, resolved: true } });
      return;
    }

    if (!site_id || !validateUuid(site_id)) {
      res.status(400).json({ success: false, error: 'Invalid site_id' });
      return;
    }

    const site = await campaignRepository.addSite(id, site_id);
    res.status(201).json({ success: true, data: { site } });
  } catch (error) {
    logger.error('Error adding site to campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to add site to campaign' });
  }
};

/**
 * DELETE /api/campaigns/:id/sites/:siteId
 */
export const removeCampaignSite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, siteId } = req.params;
    if (!validateUuid(id) || !validateUuid(siteId)) {
      res.status(400).json({ success: false, error: 'Invalid ID' });
      return;
    }

    const removed = await campaignRepository.removeSite(id, siteId);
    if (!removed) {
      res.status(404).json({ success: false, error: 'Site not found in campaign' });
      return;
    }

    res.json({ success: true, data: { removed: true } });
  } catch (error) {
    logger.error('Error removing site from campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to remove site from campaign' });
  }
};

// ============================================================================
// CAMPAIGN TARGETING (Preview)
// ============================================================================

/**
 * POST /api/campaigns/resolve-sites
 * Body: { target_criteria: TargetCriteria }
 * Preview which sites would be targeted — no mutation.
 */
export const resolveSites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { target_criteria } = req.body;
    if (!target_criteria) {
      res.status(400).json({ success: false, error: 'target_criteria is required' });
      return;
    }

    const sites = await campaignRepository.resolveSitesByCriteria(target_criteria);
    res.json({ success: true, data: { sites, total: sites.length } });
  } catch (error) {
    logger.error('Error resolving sites:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve sites' });
  }
};

// ============================================================================
// CAMPAIGN STATS
// ============================================================================

/**
 * GET /api/campaigns/:id/stats
 */
export const getCampaignStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid campaign ID' });
      return;
    }

    const [stats, dailyImpressions] = await Promise.all([
      campaignRepository.getStats(id),
      campaignRepository.getImpressionsByDay(
        id,
        typeof req.query.from === 'string' ? req.query.from : undefined,
        typeof req.query.to === 'string' ? req.query.to : undefined,
      ),
    ]);

    if (!stats) {
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }

    res.json({ success: true, data: { stats, daily_impressions: dailyImpressions } });
  } catch (error) {
    logger.error('Error getting campaign stats:', error);
    res.status(500).json({ success: false, error: 'Failed to get campaign stats' });
  }
};
