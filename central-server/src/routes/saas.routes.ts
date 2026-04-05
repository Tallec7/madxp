/**
 * SaaS Routes
 *
 * Endpoints publics pour les sites SaaS (sans Raspberry Pi).
 * Sécurisés par UUID du site (128 bits d'entropie) + rate limiting.
 */

import { Router } from 'express';
import { remoteRateLimit } from '../middleware/user-rate-limit';
import { validateParams, paramSchemas } from '../middleware/validation';
import {
  getSaasConfig,
  getSaasProfiles,
  getSaasProfileConfig,
} from '../controllers/saas.controller';

const router = Router();

// Config du profil par défaut
router.get('/:siteId/config', remoteRateLimit, validateParams(paramSchemas.siteId), getSaasConfig);

// Liste des profils disponibles (multi-profil)
router.get('/:siteId/profiles', remoteRateLimit, validateParams(paramSchemas.siteId), getSaasProfiles);

// Config d'un profil spécifique
router.get('/:siteId/profiles/:profileId/config', remoteRateLimit, validateParams(paramSchemas.siteIdAndProfileId), getSaasProfileConfig);

export default router;
