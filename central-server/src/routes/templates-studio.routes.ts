/**
 * Templates Studio V1 — routes Express.
 *
 * Spec : studio-template/templates-remotion/spec/STUDIO_V1.md
 *
 * Validation au niveau routes (smoke-dashboard-guards enforced).
 * Toutes les routes derrière `authenticate` + rate limit standard.
 * `site_id` est extrait du JWT côté controller (jamais du body).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  validate,
  validateParams,
  paramSchemas,
  templatesStudioSchemas,
} from '../middleware/validation';
import { apiRateLimit } from '../middleware/user-rate-limit';
import {
  listTemplates,
  createRenderRequest,
  getRenderRequest,
} from '../controllers/templates-studio.controller';

const router = Router();

// Catalogue : lecture seule, authenticated suffit (pas de tenant scope).
router.get('/templates', authenticate, apiRateLimit, listTemplates);

// Render requests — création (site_id pris du JWT, jamais du body).
router.post(
  '/render-requests',
  authenticate,
  apiRateLimit,
  validate(templatesStudioSchemas.createRenderRequest),
  createRenderRequest,
);

// Render requests — suivi statut (guard tenant dans le controller).
router.get(
  '/render-requests/:id',
  authenticate,
  apiRateLimit,
  validateParams(paramSchemas.id),
  getRenderRequest,
);

export default router;
