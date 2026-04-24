import { Router } from 'express';
import * as featureFlagsController from '../controllers/feature-flags.controller';
import { authenticateSiteApiKey } from '../middleware/auth';
import { validateParams, paramSchemas } from '../middleware/validation';

/**
 * ADR-092 Phase Pi — Feature flags route mounted at /api/sites.
 *
 * Pi endpoint uses `authenticateSiteApiKey` (Bearer <site api_key>) and must
 * match the path :id — enforced both by middleware (sets req.siteId) and by
 * the controller (req.siteId !== id → 403).
 */
const router = Router();

router.get(
  '/:id/feature-flags',
  authenticateSiteApiKey,
  validateParams(paramSchemas.id),
  featureFlagsController.getFeatureFlags,
);

export default router;
