import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { requireSiteTier } from '../middleware/require-site-tier';
import { adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';
import { validateParams, paramSchemas } from '../middleware/validation';
import * as ctrl from '../controllers/remotion-templates.controller';

const router = Router();

// Lecture — admin voit tout, club voit uniquement les publiés (feature-gated)
router.get(
  '/',
  authenticate,
  requireRole('admin', 'super_admin', 'operator', 'club'),
  adminRateLimit,
  ctrl.listTemplates,
);

router.get(
  '/:id',
  authenticate,
  requireRole('admin', 'super_admin', 'operator', 'club'),
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.getTemplate,
);

// Création — admin uniquement
router.post(
  '/',
  authenticate,
  requireRole('admin', 'super_admin'),
  sensitiveRateLimit,
  ctrl.createTemplate,
);

// Publication / dépublication — admin uniquement
router.patch(
  '/:id/publish',
  authenticate,
  requireRole('admin', 'super_admin'),
  validateParams(paramSchemas.id),
  sensitiveRateLimit,
  ctrl.publishTemplate,
);

// Render — admin/operator libre, club doit avoir la feature video_templates
router.post(
  '/:id/render',
  authenticate,
  requireRole('admin', 'super_admin', 'operator', 'club'),
  validateParams(paramSchemas.id),
  sensitiveRateLimit,
  ctrl.renderTemplate,
);

export default router;
