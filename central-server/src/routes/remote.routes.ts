/**
 * Remote Cloud Routes
 *
 * Endpoints pour contrôler un site Neopro à distance via le cloud.
 *
 * Sécurité:
 * - UUID du site (128 bits d'entropie)
 * - Rate limiting (60 req/min par IP)
 * - PIN optionnel par site (4-6 chiffres)
 * - JWT token pour les sessions PIN (24h)
 */

import { Router } from 'express';
import { remoteRateLimit } from '../middleware/user-rate-limit';
import { validate, schemas } from '../middleware/validation';
import { verifyRemotePin } from '../middleware/remote-pin.middleware';
import {
  getRemoteState,
  sendRemoteCommand,
  getRemoteVideos,
  verifyPin,
} from '../controllers/remote.controller';

const router = Router();

// GET state: toujours accessible (retourne pinRequired si PIN configuré)
router.get('/:siteId/state', remoteRateLimit, getRemoteState);

// POST verify-pin: vérifie le PIN et retourne un JWT token
router.post('/:siteId/verify-pin', remoteRateLimit, validate(schemas.remotePin), verifyPin);

// POST command: protégé par middleware PIN si configuré
router.post('/:siteId/command', remoteRateLimit, verifyRemotePin, validate(schemas.remoteCommand), sendRemoteCommand);

// GET videos: protégé par middleware PIN si configuré
router.get('/:siteId/videos', remoteRateLimit, verifyRemotePin, getRemoteVideos);

export default router;
