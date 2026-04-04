/**
 * Config Profiles Routes
 *
 * Routes pour la gestion des profils de configuration multi-config.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validateParams, paramSchemas, schemas } from '../middleware/validation';
import { adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';
import {
  getProfiles,
  getProfile,
  createProfile,
  updateProfile,
  updateProfileConfiguration,
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
  validateParams(paramSchemas.siteId),
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
  validateParams(paramSchemas.siteIdAndProfileId),
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
  validateParams(paramSchemas.siteId),
  validate(schemas.createProfile),
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
  validateParams(paramSchemas.siteIdAndProfileId),
  validate(schemas.updateProfile),
  updateProfile
);

/**
 * PUT /api/sites/:siteId/profiles/:profileId/configuration
 * Met a jour uniquement la configuration d'un profil (boucles, categories, phases)
 */
router.put(
  '/:siteId/profiles/:profileId/configuration',
  authenticate,
  requireRole('super_admin', 'admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.siteIdAndProfileId),
  validate(schemas.updateProfileConfiguration),
  updateProfileConfiguration
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
  validateParams(paramSchemas.siteIdAndProfileId),
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
  validateParams(paramSchemas.siteIdAndProfileId),
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
  validateParams(paramSchemas.siteId),
  syncProfiles
);

export default router;
