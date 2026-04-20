/**
 * ADR-075 — Template Studio v2 routes.
 * CRUD granulaire super_admin pour la composition du template.
 * Monté sous `/api/remotion-templates` dans server.ts — dépend donc de
 * l'ordre de mount (ce router DOIT venir AVANT le router remotion-templates
 * legacy pour que les sous-ressources `/:id/variants` etc. ne matchent pas
 * `/:id` du legacy).
 *
 * En pratique on préfère monter sous `/api/remotion-templates-studio` pour
 * éviter toute ambiguïté avec les routes legacy existantes.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';
import { validate, validateParams, paramSchemas, schemas } from '../middleware/validation';
import * as ctrl from '../controllers/template-studio.controller';

const router = Router();

const adminOnly = [authenticate, requireRole('super_admin')] as const;

// ── Vue consolidée (V2) ────────────────────────────────────────────────────
router.get(
  '/:id/studio',
  ...adminOnly,
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.getStudioView,
);

// ── Variants ────────────────────────────────────────────────────────────────
router.get(
  '/:id/variants',
  ...adminOnly,
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.listVariants,
);
router.post(
  '/:id/variants',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templateStudioVariantCreate),
  sensitiveRateLimit,
  ctrl.createVariant,
);
router.patch(
  '/:id/variants/:variantId',
  ...adminOnly,
  validateParams(paramSchemas.idAndVariantId),
  validate(schemas.templateStudioVariantUpdate),
  sensitiveRateLimit,
  ctrl.updateVariant,
);
router.delete(
  '/:id/variants/:variantId',
  ...adminOnly,
  validateParams(paramSchemas.idAndVariantId),
  sensitiveRateLimit,
  ctrl.deleteVariant,
);

// ── Layers ──────────────────────────────────────────────────────────────────
router.get(
  '/:id/layers',
  ...adminOnly,
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.listLayers,
);
router.post(
  '/:id/layers',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templateStudioLayerCreate),
  sensitiveRateLimit,
  ctrl.createLayer,
);
router.patch(
  '/:id/layers/:layerId',
  ...adminOnly,
  validateParams(paramSchemas.idAndLayerId),
  validate(schemas.templateStudioLayerUpdate),
  sensitiveRateLimit,
  ctrl.updateLayer,
);
router.delete(
  '/:id/layers/:layerId',
  ...adminOnly,
  validateParams(paramSchemas.idAndLayerId),
  sensitiveRateLimit,
  ctrl.deleteLayer,
);

// ── Text fields ─────────────────────────────────────────────────────────────
router.get(
  '/:id/text-fields',
  ...adminOnly,
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.listTextFields,
);
router.post(
  '/:id/text-fields',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templateStudioTextFieldCreate),
  sensitiveRateLimit,
  ctrl.createTextField,
);
router.patch(
  '/:id/text-fields/:fieldId',
  ...adminOnly,
  validateParams(paramSchemas.idAndFieldId),
  validate(schemas.templateStudioTextFieldUpdate),
  sensitiveRateLimit,
  ctrl.updateTextField,
);
router.delete(
  '/:id/text-fields/:fieldId',
  ...adminOnly,
  validateParams(paramSchemas.idAndFieldId),
  sensitiveRateLimit,
  ctrl.deleteTextField,
);

// ── Image slots ─────────────────────────────────────────────────────────────
router.get(
  '/:id/image-slots',
  ...adminOnly,
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.listImageSlots,
);
router.post(
  '/:id/image-slots',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templateStudioImageSlotCreate),
  sensitiveRateLimit,
  ctrl.createImageSlot,
);
router.patch(
  '/:id/image-slots/:slotId',
  ...adminOnly,
  validateParams(paramSchemas.idAndSlotId),
  validate(schemas.templateStudioImageSlotUpdate),
  sensitiveRateLimit,
  ctrl.updateImageSlot,
);
router.delete(
  '/:id/image-slots/:slotId',
  ...adminOnly,
  validateParams(paramSchemas.idAndSlotId),
  sensitiveRateLimit,
  ctrl.deleteImageSlot,
);

export default router;
