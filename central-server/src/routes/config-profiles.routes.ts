/**
 * Config Profiles Routes
 *
 * Routes pour la gestion des profils de configuration multi-config.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';
import {
  getProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  deployProfile,
  syncProfiles,
} from '../controllers/config-profiles.controller';

const router = Router();

/**
 * GET /api/sites/:siteId/profiles
 * Liste tous les profils d'un site
 */
router.get(
  '/:siteId/profiles',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  adminRateLimit,
  getProfiles
);

/**
 * GET /api/sites/:siteId/profiles/:profileId
 * Recupere un profil specifique
 */
router.get(
  '/:siteId/profiles/:profileId',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  adminRateLimit,
  getProfile
);

/**
 * POST /api/sites/:siteId/profiles
 * Cree un nouveau profil
 */
router.post(
  '/:siteId/profiles',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  sensitiveRateLimit,
  createProfile
);

/**
 * PUT /api/sites/:siteId/profiles/:profileId
 * Met a jour un profil existant
 */
router.put(
  '/:siteId/profiles/:profileId',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  sensitiveRateLimit,
  updateProfile
);

/**
 * DELETE /api/sites/:siteId/profiles/:profileId
 * Supprime un profil (refuse si c'est le dernier)
 */
router.delete(
  '/:siteId/profiles/:profileId',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  sensitiveRateLimit,
  deleteProfile
);

/**
 * POST /api/sites/:siteId/profiles/:profileId/deploy
 * Deploie un profil specifique sur le Pi
 */
router.post(
  '/:siteId/profiles/:profileId/deploy',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  sensitiveRateLimit,
  deployProfile
);

/**
 * POST /api/sites/:siteId/profiles/sync
 * Synchronise tous les profils vers le Pi
 */
router.post(
  '/:siteId/profiles/sync',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  sensitiveRateLimit,
  syncProfiles
);

export default router;
