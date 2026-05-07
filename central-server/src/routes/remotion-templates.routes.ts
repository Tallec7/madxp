import { Router } from 'express';
import { authenticate, requireRole, requireSuperAdmin } from '../middleware/auth';
import {
  adminRateLimit,
  sensitiveRateLimit,
  templateUserUploadRateLimit,
} from '../middleware/user-rate-limit';
import {
  validate,
  validateParams,
  validateQuery,
  paramSchemas,
  schemas,
  testRenderSchemas,
  remotionTemplateIdParam,
  remotionTemplateDeleteQuery,
} from '../middleware/validation';
import { uploadTemplateAsset, uploadUserTemplateImage } from '../middleware/upload';
import { requestTimeout } from '../middleware/request-timeout';
import * as ctrl from '../controllers/remotion-templates.controller';

// Audit P1 #8 — 5 min cap on Template Studio uploads. Multer accepts up to
// 200 MB per file ; behind a flaky uplink the FTP relay can stall indefinitely
// and exhaust Railway HTTP slots. requestTimeout(300_000) converts the hang
// into a clean 408 the dashboard can surface as "upload trop long".
const UPLOAD_TIMEOUT_MS = 300_000;

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
  requestTimeout(UPLOAD_TIMEOUT_MS),
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

// Quick task 260507-ong — Export SPEC.md from current DB state (audit P1 #5).
// super_admin only, declared BEFORE /:id so the more specific path matches.
router.get(
  '/:id/spec',
  authenticate,
  requireRole('super_admin'),
  validateParams(remotionTemplateIdParam),
  adminRateLimit,
  ctrl.exportTemplateSpec,
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

// Publication — ADR-110 / Phase 03 / Plan 05 / PUB-01.
// POST + super_admin only + validation gate enforced server-side via the
// validation registry (Plan 03-02). 409 if any rule severity=error fails.
router.post(
  '/:id/publish',
  authenticate,
  requireSuperAdmin(),
  validateParams(paramSchemas.id),
  sensitiveRateLimit,
  ctrl.publishTemplate,
);

// Dépublication — ADR-110 / Phase 03 / Plan 05 / PUB-01.
// No validation gate, super_admin can always retract. Audit via Winston.
router.post(
  '/:id/unpublish',
  authenticate,
  requireSuperAdmin(),
  validateParams(paramSchemas.id),
  sensitiveRateLimit,
  ctrl.unpublishTemplate,
);

// Quick task 260507-gxd — DELETE template end-to-end (P0 #1 + #2).
// super_admin only, sensitiveRateLimit (30/min), ?force=true bypasses 409
// guard for published / in-use templates (audited via metric reason label).
router.delete(
  '/:id',
  authenticate,
  requireRole('super_admin'),
  sensitiveRateLimit,
  validateParams(remotionTemplateIdParam),
  validateQuery(remotionTemplateDeleteQuery),
  ctrl.deleteTemplate,
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
  requestTimeout(UPLOAD_TIMEOUT_MS),
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
  requestTimeout(UPLOAD_TIMEOUT_MS),
  authenticate,
  requireRole('admin', 'super_admin', 'operator', 'club'),
  validateParams(paramSchemas.id),
  templateUserUploadRateLimit,
  uploadUserTemplateImage.single('file'),
  validate(schemas.templateUserUploadBody),
  ctrl.uploadUserImageAsset,
);

// ADR-110 / Phase 03 / Plan 03 / PUB-02 — Async test render (super_admin only)
// Body is sealed (no user input), fixtures injected server-side.
// The job reuses `remotion_render_jobs` and is discriminated by the title
// prefix `test-render:`. See controllers/remotion-templates.controller.ts and
// services/remotion-render-worker.service.ts for the matching hooks.
router.post(
  '/:id/test-render',
  authenticate,
  requireRole('super_admin'),
  validateParams(testRenderSchemas.params),
  validate(testRenderSchemas.body),
  sensitiveRateLimit,
  ctrl.createTestRender,
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
