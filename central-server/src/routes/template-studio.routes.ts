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
import * as versioningCtrl from '../controllers/template-versioning.controller';
import * as autoCropCtrl from '../controllers/template-photo-autocrop.controller';
import * as optionsCtrl from '../controllers/template-options.controller';
import { uploadPngBuffer } from '../middleware/upload';

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

// ── Gate de publication (ADR-110 / Plan 03-02 / TEST-03)
// Runs the 8-rule validation registry server-side. Source of truth for the
// publish-gate checklist consumed by the wizard step 5 in Plan 03-04.
router.get(
  '/:id/validation',
  ...adminOnly,
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.getValidation,
);

// ── Scaffold placeholders (débloque flip v1→v2)
router.post(
  '/:id/studio/scaffold',
  ...adminOnly,
  validateParams(paramSchemas.id),
  sensitiveRateLimit,
  ctrl.scaffoldStudio,
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
// ADR-110 / Plan 04 / WIZARD-04 — single transactional reorder.
// POST (not PATCH) because the body holds the full target order, and the
// op replaces every z_index in one go (no partial state). Distinct verb +
// distinct sub-path from /:id/layers/:layerId so no Express matcher conflict.
router.post(
  '/:id/layers/reorder',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templateStudioLayersReorder),
  sensitiveRateLimit,
  ctrl.reorderLayers,
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

// ── Versioning v2 (ADR-108) ────────────────────────────────────────────────
router.post(
  '/:id/publish',
  ...adminOnly,
  validateParams(paramSchemas.id),
  sensitiveRateLimit,
  versioningCtrl.publishTemplateVersion,
);
router.post(
  '/:id/fork',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templateFork),
  sensitiveRateLimit,
  versioningCtrl.forkTemplateVersion,
);
router.get(
  '/:id/versions',
  ...adminOnly,
  validateParams(paramSchemas.id),
  adminRateLimit,
  versioningCtrl.listTemplateV2Versions,
);
router.patch(
  '/:id/default-version',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templateSetDefaultVersion),
  sensitiveRateLimit,
  versioningCtrl.setTemplateDefaultVersion,
);

// ── Auto-crop photo joueur (SPEC JOUEUR Q15) ───────────────────────────────
// Pas de :id : endpoint global, l'UI uploadera la photo + bbox sera calculée
// indépendamment du template (l'admin colle ensuite la position dans son slot).
router.post(
  '/photo/auto-crop',
  ...adminOnly,
  sensitiveRateLimit,
  uploadPngBuffer.single('photo'),
  autoCropCtrl.autoCropPhoto,
);

// ── Options template-level (PDF JOUEUR §démarrage) ─────────────────────────
// Lecture publique pour tous les rôles authentifiés (l'option fait partie du
// payload de saisie user). Écriture/suppression super_admin uniquement.
router.get(
  '/:id/options',
  authenticate,
  validateParams(paramSchemas.id),
  adminRateLimit,
  versioningCtrl.listTemplateOptions,
);
router.post(
  '/:id/options',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templateOptionCreate),
  sensitiveRateLimit,
  optionsCtrl.createOption,
);
router.patch(
  '/:id/options/:optionId',
  ...adminOnly,
  validateParams(paramSchemas.idAndOptionId),
  validate(schemas.templateOptionUpdate),
  sensitiveRateLimit,
  optionsCtrl.updateOption,
);
router.delete(
  '/:id/options/:optionId',
  ...adminOnly,
  validateParams(paramSchemas.idAndOptionId),
  sensitiveRateLimit,
  optionsCtrl.deleteOption,
);
// ADR-110 / Plan 02-04 / UX-03 — atomic rename of an option key.
// Repo wraps 4 UPDATEs in BEGIN/COMMIT/ROLLBACK across template_options,
// template_packshot_refs, template_text_fields.visible_if, template_image_slots.visible_if.
// super_admin guard is mandatory (template composition is fleet-wide).
router.post(
  '/:id/options/:optionId/rename',
  authenticate,
  requireRole('super_admin'),
  validateParams(paramSchemas.idAndOptionId),
  validate(schemas.templateStudioOptionRename),
  sensitiveRateLimit,
  ctrl.renameOptionKey,
);

// ── Packshot pluggable refs (PDF JOUEUR §démarrage) ────────────────────────
// Map (option_key, option_value) → packshot_template_id à empiler en surcouche.
router.get(
  '/:id/packshot-refs',
  ...adminOnly,
  validateParams(paramSchemas.id),
  adminRateLimit,
  optionsCtrl.listPackshotRefs,
);
router.post(
  '/:id/packshot-refs',
  ...adminOnly,
  validateParams(paramSchemas.id),
  validate(schemas.templatePackshotRefCreate),
  sensitiveRateLimit,
  optionsCtrl.createPackshotRef,
);
router.delete(
  '/:id/packshot-refs/:packshotRefId',
  ...adminOnly,
  validateParams(paramSchemas.idAndPackshotRefId),
  sensitiveRateLimit,
  optionsCtrl.deletePackshotRef,
);

export default router;
