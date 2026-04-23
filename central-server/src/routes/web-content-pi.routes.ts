import { Router } from 'express';
import * as webContentController from '../controllers/web-content.controller';
import { authenticateSiteApiKey } from '../middleware/auth';
import { validateParams, paramSchemas } from '../middleware/validation';

/**
 * ADR-088 Phase 2 — Pi fetch web_page / livestream content, mounted at /api/sites.
 * Le sync-agent consomme cet endpoint et merge les entrees dans configuration.json.
 */
const router = Router();

router.get(
  '/:id/web-content',
  authenticateSiteApiKey,
  validateParams(paramSchemas.id),
  webContentController.listWebContentForPi,
);

export default router;
