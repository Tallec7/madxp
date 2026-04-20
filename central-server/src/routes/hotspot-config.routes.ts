import { Router } from 'express';
import * as hotspotConfigController from '../controllers/hotspot-config.controller';
import { authenticate, requireRole, authenticateSiteApiKey } from '../middleware/auth';
import { validate, validateParams, paramSchemas, schemas } from '../middleware/validation';
import { adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';

/**
 * ADR-074 — Hotspot config routes, mounted at /api/sites.
 *
 * Pi endpoints use authenticateSiteApiKey (Bearer <site api_key>) and must
 * match the path :id — enforced both by middleware (sets req.siteId) and by
 * the controller (req.siteId !== id → 403).
 *
 * ADR-076 — Admin dashboard reads the canonical cloud PSK via /admin-view
 * (JWT + admin/operator role), replacing the legacy Pi-live diagnostic route.
 */
const router = Router();

router.get(
  '/:id/hotspot-config',
  authenticateSiteApiKey,
  validateParams(paramSchemas.id),
  hotspotConfigController.getHotspotConfig
);

router.get(
  '/:id/hotspot-config/admin-view',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  hotspotConfigController.getHotspotConfigAdminView
);

router.post(
  '/:id/hotspot-config/bootstrap',
  authenticateSiteApiKey,
  validateParams(paramSchemas.id),
  validate(schemas.hotspotConfigBootstrap),
  hotspotConfigController.bootstrapHotspotConfig
);

router.post(
  '/:id/hotspot-config/rotate',
  authenticate,
  requireRole('admin', 'super_admin'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  validate(schemas.hotspotConfigRotate),
  hotspotConfigController.rotateHotspotConfig
);

export default router;
