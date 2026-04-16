import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';
import { validate, validateParams, paramSchemas, schemas } from '../middleware/validation';
import { uploadTemplateAsset } from '../middleware/upload';
import * as ctrl from '../controllers/remotion-templates.controller';

const router = Router();

// Proxy same-origin pour les assets FTP (CORS bypass pour @remotion/player)
// Route sans auth — assets déjà publics sur kalonpartners.bzh
router.get('/asset-proxy', adminRateLimit, ctrl.proxyTemplateAsset);

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
