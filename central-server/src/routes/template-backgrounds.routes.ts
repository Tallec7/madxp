/**
 * ADR-109 — Template Backgrounds routes.
 * Monté sous `/api/templates/backgrounds` dans server.ts.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';
import { validate, validateParams, paramSchemas, schemas } from '../middleware/validation';
import { uploadTemplateAsset } from '../middleware/upload';
import * as ctrl from '../controllers/template-backgrounds.controller';

const router = Router();

const adminOnly = [authenticate, requireRole('super_admin')] as const;
const allUsers = [authenticate] as const;

// ── Lecture (tous users authentifiés) ──────────────────────────────────────
router.get(
  '/',
  ...allUsers,
  adminRateLimit,
  ctrl.listBackgroundsForUser,
);
router.get(
  '/:id',
  ...allUsers,
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.getBackground,
);

// ── Écriture catalogue (super_admin) ───────────────────────────────────────
router.post(
  '/',
  ...adminOnly,
  uploadTemplateAsset.single('background'),
  validate(schemas.templateBackgroundCreate),
  sensitiveRateLimit,
  ctrl.createBackground,
);
router.patch(
  '/:id',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templateBackgroundUpdate),
  sensitiveRateLimit,
  ctrl.updateBackground,
);

// ── Grants (super_admin) ───────────────────────────────────────────────────
router.post(
  '/:id/grants',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templateBackgroundBulkGrant),
  sensitiveRateLimit,
  ctrl.grantBackgroundBulk,
);
router.get(
  '/:id/grants',
  ...adminOnly,
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.listBackgroundGrants,
);
router.delete(
  '/:backgroundId/grants/:userId',
  ...adminOnly,
  validateParams(paramSchemas.backgroundIdAndUserId),
  sensitiveRateLimit,
  ctrl.revokeBackgroundGrant,
);

export default router;
