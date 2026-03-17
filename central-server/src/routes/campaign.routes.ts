import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { apiRateLimit } from '../middleware/user-rate-limit';
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listCampaignVideos,
  addCampaignVideo,
  removeCampaignVideo,
  listCampaignSites,
  addCampaignSite,
  removeCampaignSite,
  resolveSites,
  getCampaignStats,
  deployCampaign,
  undeployCampaign,
} from '../controllers/campaign.controller';

const router = express.Router();

// ============================================================================
// CAMPAIGN CRUD (admin/operator only)
// ============================================================================

router.get('/', authenticate, apiRateLimit, listCampaigns);
router.get('/:id', authenticate, apiRateLimit, getCampaign);
router.post('/', authenticate, requireRole('admin', 'operator'), apiRateLimit, createCampaign);
router.put('/:id', authenticate, requireRole('admin', 'operator'), apiRateLimit, updateCampaign);
router.delete('/:id', authenticate, requireRole('admin'), apiRateLimit, deleteCampaign);

// ============================================================================
// CAMPAIGN VIDEOS
// ============================================================================

router.get('/:id/videos', authenticate, apiRateLimit, listCampaignVideos);
router.post('/:id/videos', authenticate, requireRole('admin', 'operator'), apiRateLimit, addCampaignVideo);
router.delete('/:id/videos/:videoId', authenticate, requireRole('admin', 'operator'), apiRateLimit, removeCampaignVideo);

// ============================================================================
// CAMPAIGN SITES
// ============================================================================

router.get('/:id/sites', authenticate, apiRateLimit, listCampaignSites);
router.post('/:id/sites', authenticate, requireRole('admin', 'operator'), apiRateLimit, addCampaignSite);
router.delete('/:id/sites/:siteId', authenticate, requireRole('admin', 'operator'), apiRateLimit, removeCampaignSite);

// ============================================================================
// TARGETING PREVIEW (no mutation)
// ============================================================================

router.post('/resolve-sites', authenticate, requireRole('admin', 'operator'), apiRateLimit, resolveSites);

// ============================================================================
// CAMPAIGN DEPLOYMENT (ADR-035 Phase 3b)
// ============================================================================

router.post('/:id/deploy', authenticate, requireRole('admin', 'operator'), apiRateLimit, deployCampaign);
router.post('/:id/undeploy', authenticate, requireRole('admin', 'operator'), apiRateLimit, undeployCampaign);

// ============================================================================
// CAMPAIGN STATS
// ============================================================================

router.get('/:id/stats', authenticate, apiRateLimit, getCampaignStats);

export default router;
