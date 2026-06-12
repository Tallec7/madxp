/**
 * Drafts Routes
 *
 * Routes pour la gestion des brouillons de configuration.
 */

import { Router } from 'express';
import { authenticate, requireRole, requireClubScope, requireClubPermission } from '../middleware/auth';
import { validate, validateParams, paramSchemas, schemas } from '../middleware/validation';
import { adminRateLimit, sensitiveRateLimit, monitoringRateLimit } from '../middleware/user-rate-limit';

// Scope guard club (cf. config-profiles.routes.ts) : depuis le passage du
// bypass requireRole en GET-only (2026-06-12), toute écriture club doit être
// scopée à son propre site. Les rôles internes bypassent.
const clubScopeBySiteId = requireClubScope((req) => req.params.siteId);
import {
  getDraft,
  saveDraft,
  deleteDraft,
  validateDraft,
  deployDraft,
  getDeploymentProgress,
} from '../controllers/drafts.controller';

const router = Router();

/**
 * GET /api/sites/:siteId/draft
 * Récupère le brouillon d'un site
 */
router.get(
  '/:siteId/draft',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.siteId),
  getDraft
);

/**
 * PUT /api/sites/:siteId/draft
 * Crée ou met à jour le brouillon
 */
router.put(
  '/:siteId/draft',
  authenticate,
  requireRole('super_admin', 'admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('edit_loop'),
  sensitiveRateLimit,
  validateParams(paramSchemas.siteId),
  validate(schemas.saveDraft),
  saveDraft
);

/**
 * DELETE /api/sites/:siteId/draft
 * Supprime le brouillon
 */
router.delete(
  '/:siteId/draft',
  authenticate,
  requireRole('super_admin', 'admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('edit_loop'),
  sensitiveRateLimit,
  validateParams(paramSchemas.siteId),
  deleteDraft
);

/**
 * POST /api/sites/:siteId/draft/validate
 * Valide le brouillon (liste les vidéos manquantes)
 */
router.post(
  '/:siteId/draft/validate',
  authenticate,
  requireRole('super_admin', 'admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('edit_loop'),
  adminRateLimit,
  validateParams(paramSchemas.siteId),
  validateDraft
);

/**
 * POST /api/sites/:siteId/draft/deploy
 * Déploie le brouillon (vidéos + config)
 */
router.post(
  '/:siteId/draft/deploy',
  authenticate,
  requireRole('super_admin', 'admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('edit_loop'),
  sensitiveRateLimit,
  validateParams(paramSchemas.siteId),
  deployDraft
);

/**
 * GET /api/sites/:siteId/draft/deployment/:deploymentId
 * Récupère la progression du déploiement
 */
router.get(
  '/:siteId/draft/deployment/:deploymentId',
  authenticate,
  monitoringRateLimit,
  validateParams(paramSchemas.siteIdAndDeploymentId),
  getDeploymentProgress
);

export default router;
