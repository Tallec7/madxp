import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { apiRateLimit } from '../middleware/user-rate-limit';
import { validate, validateParams, validateQuery, paramSchemas, querySchemas, schemas } from '../middleware/validation';
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

router.get('/', authenticate, apiRateLimit, validateQuery(querySchemas.listCampaigns), listCampaigns);
router.get('/:id', authenticate, apiRateLimit, validateParams(paramSchemas.id), getCampaign);
router.post('/', authenticate, requireRole('admin', 'operator'), apiRateLimit, validate(schemas.createCampaign), createCampaign);
router.put('/:id', authenticate, requireRole('admin', 'operator'), apiRateLimit, validateParams(paramSchemas.id), validate(schemas.updateCampaign), updateCampaign);
router.delete('/:id', authenticate, requireRole('admin'), apiRateLimit, validateParams(paramSchemas.id), deleteCampaign);

// ============================================================================
// CAMPAIGN VIDEOS
// ============================================================================

router.get('/:id/videos', authenticate, apiRateLimit, validateParams(paramSchemas.id), listCampaignVideos);
router.post('/:id/videos', authenticate, requireRole('admin', 'operator'), apiRateLimit, validateParams(paramSchemas.id), validate(schemas.addCampaignVideo), addCampaignVideo);
router.delete('/:id/videos/:videoId', authenticate, requireRole('admin', 'operator'), apiRateLimit, validateParams(paramSchemas.idAndVideoId), removeCampaignVideo);

// ============================================================================
// CAMPAIGN SITES
// ============================================================================

router.get('/:id/sites', authenticate, apiRateLimit, validateParams(paramSchemas.id), listCampaignSites);
router.post('/:id/sites', authenticate, requireRole('admin', 'operator'), apiRateLimit, validateParams(paramSchemas.id), validate(schemas.addCampaignSite), addCampaignSite);
router.delete('/:id/sites/:siteId', authenticate, requireRole('admin', 'operator'), apiRateLimit, validateParams(paramSchemas.idAndSiteId), removeCampaignSite);

// ============================================================================
// TARGETING PREVIEW (no mutation)
// ============================================================================

router.post('/resolve-sites', authenticate, requireRole('admin', 'operator'), apiRateLimit, validate(schemas.resolveSites), resolveSites);

// ============================================================================
// CAMPAIGN DEPLOYMENT (ADR-035 Phase 3b)
// ============================================================================

router.post('/:id/deploy', authenticate, requireRole('admin', 'operator'), apiRateLimit, validateParams(paramSchemas.id), deployCampaign);
router.post('/:id/undeploy', authenticate, requireRole('admin', 'operator'), apiRateLimit, validateParams(paramSchemas.id), undeployCampaign);

// ============================================================================
// CAMPAIGN STATS
// ============================================================================

router.get('/:id/stats', authenticate, apiRateLimit, validateParams(paramSchemas.id), validateQuery(querySchemas.dateRange), getCampaignStats);

export default router;
