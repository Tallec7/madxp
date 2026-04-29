/**
 * SaaS Routes
 *
 * Endpoints publics pour les sites SaaS (sans Raspberry Pi).
 * Sécurisés par UUID du site (128 bits d'entropie) + rate limiting.
 */

import { Router } from 'express';
import { remoteRateLimit } from '../middleware/user-rate-limit';
import { validateParams, validate, paramSchemas, schemas } from '../middleware/validation';
import { verifyRemotePin } from '../middleware/remote-pin.middleware';
import {
  getSaasConfig,
  getSaasProfiles,
  getSaasProfileConfig,
  getRemotePreferences,
  upsertRemotePreferences,
  pushTvSnapshot,
  getTvSnapshot,
} from '../controllers/saas.controller';

const router = Router();

// Config du profil par défaut (ADR-058 — PIN enforced when configured)
router.get('/:siteId/config', remoteRateLimit, validateParams(paramSchemas.siteId), verifyRemotePin, getSaasConfig);

// Liste des profils disponibles (multi-profil) — PAS de PIN ici (le client doit
// pouvoir lister les profils et leur flag pinRequired avant de saisir un PIN).
router.get('/:siteId/profiles', remoteRateLimit, validateParams(paramSchemas.siteId), getSaasProfiles);

// Config d'un profil spécifique (ADR-058 — PIN enforced when configured)
router.get('/:siteId/profiles/:profileId/config', remoteRateLimit, validateParams(paramSchemas.siteIdAndProfileId), verifyRemotePin, getSaasProfileConfig);

// ADR-102 — Préférences UX télécommande (lecture + upsert) par (site, profil).
// PIN enforcé côté écriture comme côté lecture (verifyRemotePin agit sur les
// deux : si le profil a un PIN, le token de device est exigé ; sinon ouvert).
router.get('/:siteId/profiles/:profileId/preferences', remoteRateLimit, validateParams(paramSchemas.siteIdAndProfileId), verifyRemotePin, getRemotePreferences);
router.put('/:siteId/profiles/:profileId/preferences', remoteRateLimit, validateParams(paramSchemas.siteIdAndProfileId), verifyRemotePin, validate(schemas.remotePreferencesUpsert), upsertRemotePreferences);

// ADR-104 — TV snapshot HTTP pull (mini-thumb "À l'antenne" sur la régie).
// POST = TV pousse sa frame courante (~250ms cadence).
// GET  = Admin pull la frame courante (~250ms cadence).
// Pas de PIN : flux jpeg basse-rés, siteId UUID 128 bits + rate limit suffisent.
router.post('/:siteId/tv-snapshot', remoteRateLimit, validateParams(paramSchemas.siteId), validate(schemas.tvSnapshotPush), pushTvSnapshot);
router.get('/:siteId/tv-snapshot', remoteRateLimit, validateParams(paramSchemas.siteId), getTvSnapshot);

export default router;
