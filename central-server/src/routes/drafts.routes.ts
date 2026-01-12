/**
 * Drafts Routes
 *
 * Routes pour la gestion des brouillons de configuration.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { adminRateLimit, sensitiveRateLimit, monitoringRateLimit } from '../middleware/rate-limit';
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
  getDraft
);

/**
 * PUT /api/sites/:siteId/draft
 * Crée ou met à jour le brouillon
 */
router.put(
  '/:siteId/draft',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  sensitiveRateLimit,
  saveDraft
);

/**
 * DELETE /api/sites/:siteId/draft
 * Supprime le brouillon
 */
router.delete(
  '/:siteId/draft',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  sensitiveRateLimit,
  deleteDraft
);

/**
 * POST /api/sites/:siteId/draft/validate
 * Valide le brouillon (liste les vidéos manquantes)
 */
router.post(
  '/:siteId/draft/validate',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  adminRateLimit,
  validateDraft
);

/**
 * POST /api/sites/:siteId/draft/deploy
 * Déploie le brouillon (vidéos + config)
 */
router.post(
  '/:siteId/draft/deploy',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  sensitiveRateLimit,
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
  getDeploymentProgress
);

export default router;
