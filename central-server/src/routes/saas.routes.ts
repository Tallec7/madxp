/**
 * SaaS Routes
 *
 * Endpoints publics pour les sites SaaS (sans Raspberry Pi).
 * Sécurisés par UUID du site (128 bits d'entropie) + rate limiting.
 */

import { Router } from 'express';
import { remoteRateLimit } from '../middleware/user-rate-limit';
import { validateParams, paramSchemas } from '../middleware/validation';
import { verifyRemotePin } from '../middleware/remote-pin.middleware';
import {
  getSaasConfig,
  getSaasProfiles,
  getSaasProfileConfig,
} from '../controllers/saas.controller';

const router = Router();

// Config du profil par défaut (ADR-058 — PIN enforced when configured)
router.get('/:siteId/config', remoteRateLimit, validateParams(paramSchemas.siteId), verifyRemotePin, getSaasConfig);

// Liste des profils disponibles (multi-profil) — PAS de PIN ici (le client doit
// pouvoir lister les profils et leur flag pinRequired avant de saisir un PIN).
router.get('/:siteId/profiles', remoteRateLimit, validateParams(paramSchemas.siteId), getSaasProfiles);

// Config d'un profil spécifique (ADR-058 — PIN enforced when configured)
router.get('/:siteId/profiles/:profileId/config', remoteRateLimit, validateParams(paramSchemas.siteIdAndProfileId), verifyRemotePin, getSaasProfileConfig);

export default router;
