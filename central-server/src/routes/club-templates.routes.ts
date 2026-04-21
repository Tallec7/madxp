/**
 * ADR-075 V3 Phase B — Routes self-service club pour templates vidéo.
 *
 * Monté sous `/api/club/remotion-templates` (server.ts).
 * Toutes les routes : `authenticate` + `requireRole('club','admin','super_admin')`
 *   + `requireClubByoAccess` (tier premium OU feature_override template_studio_byo).
 *
 * Pas de création de template ni de layers/variants en Phase B — les clubs
 * consomment un template scaffolded par super_admin et éditent les champs
 * texte / slots image (nom, drag-to-position, font, couleur).
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { requireClubByoAccess } from '../middleware/require-club-byo-access';
import { adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';
import { uploadTemplateAsset } from '../middleware/upload';
import {
  validate,
  validateParams,
  paramSchemas,
  schemas,
} from '../middleware/validation';
import * as ctrl from '../controllers/club-templates.controller';

const router = Router();

const clubAccess = [
  authenticate,
  requireRole('club', 'admin', 'super_admin'),
  requireClubByoAccess,
] as const;

// ── List own templates
router.get('/', ...clubAccess, adminRateLimit, ctrl.listMyTemplates);

// ── Quota snapshot (ADR-075 V3 Phase D)
router.get('/quota', ...clubAccess, adminRateLimit, ctrl.getMyQuota);

// ── Studio view (V2)
router.get(
  '/:id/studio',
  ...clubAccess,
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.getMyStudioView,
);

// ── Template rename / canvas size
router.patch(
  '/:id',
  ...clubAccess,
  validateParams(paramSchemas.id),
  validate(schemas.templateUpdateSchema),
  sensitiveRateLimit,
  ctrl.updateMyTemplate,
);

// ── Text field patch (drag, font, color, text)
router.patch(
  '/:id/text-fields/:fieldId',
  ...clubAccess,
  validateParams(paramSchemas.idAndFieldId),
  validate(schemas.templateStudioTextFieldUpdate),
  sensitiveRateLimit,
  ctrl.updateMyTextField,
);

// ── Image slot patch (drag, resize, bg)
router.patch(
  '/:id/image-slots/:slotId',
  ...clubAccess,
  validateParams(paramSchemas.idAndSlotId),
  validate(schemas.templateStudioImageSlotUpdate),
  sensitiveRateLimit,
  ctrl.updateMyImageSlot,
);

// ── Upload vidéo de fond (ADR-075 V3 Phase C)
router.post(
  '/:id/background',
  ...clubAccess,
  validateParams(paramSchemas.id),
  sensitiveRateLimit,
  uploadTemplateAsset.single('file'),
  ctrl.uploadMyVariantBackground,
);

export default router;
