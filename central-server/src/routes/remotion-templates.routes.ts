import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  adminRateLimit,
  sensitiveRateLimit,
  templateUserUploadRateLimit,
} from '../middleware/user-rate-limit';
import { validate, validateParams, paramSchemas, schemas } from '../middleware/validation';
import { uploadTemplateAsset, uploadUserTemplateImage } from '../middleware/upload';
import * as ctrl from '../controllers/remotion-templates.controller';

const router = Router();

// Note : /asset-proxy est monté directement sur `app` dans server.ts AVANT le
// wrapper `sensitiveRateLimit` de ce router (30/min) — sinon les range requests
// de <video> Remotion saturent le quota et cascade en NotSameOrigin.

// ── ADR-110 / Plan 02 — Library-level Asset Manager (super_admin) ───────────
// IMPORTANT : ces routes sont déclarées AVANT les routes /:id pour éviter que
// /assets, /library/upload se fassent capturer par le matcher /:id.
router.get(
  '/assets',
  authenticate,
  requireRole('super_admin'),
  adminRateLimit,
  ctrl.listLibraryAssets,
);
router.post(
  '/library/upload',
  authenticate,
  requireRole('super_admin'),
  sensitiveRateLimit,
  uploadTemplateAsset.single('file'),
  ctrl.uploadLibraryAsset,
);
router.delete(
  '/assets/:assetId',
  authenticate,
  requireRole('super_admin'),
  sensitiveRateLimit,
  ctrl.deleteLibraryAsset,
);

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

// Création — admin uniquement (super_admin requis pour scope club via site_id)
router.post(
  '/',
  authenticate,
  requireRole('admin', 'super_admin'),
  validate(schemas.templateCreateSchema),
  sensitiveRateLimit,
  ctrl.createTemplate,
);

// Mise à jour (name/description/props_schema/default_props) — admin uniquement
// Le trigger `trg_neopro_templates_snapshot` (ADR-055) crée automatiquement
// une version pre-update quand props_schema ou default_props change.
router.patch(
  '/:id',
  authenticate,
  requireRole('admin', 'super_admin'),
  validateParams(paramSchemas.id),
  validate(schemas.templateUpdateSchema),
  sensitiveRateLimit,
  ctrl.updateTemplate,
);

// Duplication d'un template — admin uniquement
router.post(
  '/:id/duplicate',
  authenticate,
  requireRole('admin', 'super_admin'),
  validateParams(paramSchemas.id),
  validate(schemas.templateDuplicate),
  sensitiveRateLimit,
  ctrl.duplicateTemplate,
);

// Historique des versions (props_schema + default_props) — admin uniquement
router.get(
  '/:id/versions',
  authenticate,
  requireRole('admin', 'super_admin'),
  validateParams(paramSchemas.id),
  adminRateLimit,
  ctrl.listTemplateVersions,
);

// Restauration d'une version — admin uniquement
router.post(
  '/:id/versions/:versionId/restore',
  authenticate,
  requireRole('admin', 'super_admin'),
  validateParams(paramSchemas.siteIdAndVersionId),
  sensitiveRateLimit,
  ctrl.restoreTemplateVersion,
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

// ADR-075 — toggle schema_version 1 ↔ 2 (super_admin uniquement)
// Remplace le flip manuel SQL documenté dans ADR-075 par un toggle UI.
// Guard repo-side : v2 exige shadow data présentes (variants/text_fields/image_slots).
router.patch(
  '/:id/schema-version',
  authenticate,
  requireRole('super_admin'),
  validateParams(paramSchemas.id),
  validate(schemas.templateSchemaVersionUpdate),
  sensitiveRateLimit,
  ctrl.setTemplateSchemaVersion,
);

// Upload asset vidéo (WebM) — admin uniquement
router.post(
  '/:id/assets',
  authenticate,
  requireRole('admin', 'super_admin'),
  validateParams(paramSchemas.id),
  sensitiveRateLimit,
  uploadTemplateAsset.single('file'),
  ctrl.uploadTemplateAssetController,
);

// ADR-077 — Upload image utilisateur (JPEG/PNG/WebP ≤ 10Mo) pour image_slots v2
// ou image props v1. Ouvert à tout utilisateur authentifié (admin/super_admin,
// operator, club). L'URL retournée est consommée côté dashboard dans le payload
// render (`imageUploads[slotKey]`), pas persistée dans default_props.
router.post(
  '/:id/user-uploads',
  authenticate,
  requireRole('admin', 'super_admin', 'operator', 'club'),
  validateParams(paramSchemas.id),
  templateUserUploadRateLimit,
  uploadUserTemplateImage.single('file'),
  validate(schemas.templateUserUploadBody),
  ctrl.uploadUserImageAsset,
);

// Render — admin/operator libre, club doit avoir la feature video_templates
// Async (ADR-054): returns 202 { job_id } immediately, worker processes in background.
router.post(
  '/:id/render',
  authenticate,
  requireRole('admin', 'super_admin', 'operator', 'club'),
  validateParams(paramSchemas.id),
  sensitiveRateLimit,
  ctrl.renderTemplate,
);

// Poll async render job status (ADR-054)
router.get(
  '/render-jobs/:jobId',
  authenticate,
  requireRole('admin', 'super_admin', 'operator', 'club'),
  validateParams(paramSchemas.jobId),
  adminRateLimit,
  ctrl.getRenderJob,
);

export default router;
