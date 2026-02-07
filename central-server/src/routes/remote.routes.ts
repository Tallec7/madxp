/**
 * Remote Cloud Routes
 *
 * Endpoints pour contrôler un site Neopro à distance via le cloud.
 * Permet d'utiliser la télécommande depuis n'importe quel réseau,
 * même avec l'isolation client activée (mesh WiFi, réseaux entreprise).
 *
 * IMPORTANT: Ces routes sont PUBLIQUES (pas d'authentification JWT requise)
 * car elles sont utilisées par les utilisateurs qui scannent le QR code
 * depuis leur téléphone (staff du club, bénévoles, etc.)
 *
 * La sécurité repose sur:
 * - L'UUID du site (difficile à deviner)
 * - Le rate limiting (60 req/min par IP)
 * - Le fait que le site doit être online pour recevoir les commandes
 *
 * Date: 2026-01-18
 */

import { Router } from 'express';
import { remoteRateLimit } from '../middleware/user-rate-limit';
import {
  getRemoteState,
  sendRemoteCommand,
  getRemoteVideos,
} from '../controllers/remote.controller';

const router = Router();

// Routes PUBLIQUES (pas d'authentification JWT)
// Rate limit: remoteRateLimit (60/min par IP) pour éviter les abus

/**
 * GET /api/remote/:siteId/state
 * Récupère l'état actuel du site (connexion, config, vidéos)
 */
router.get('/:siteId/state', remoteRateLimit, getRemoteState);

/**
 * POST /api/remote/:siteId/command
 * Envoie une commande au site (score, phase, vidéo, etc.)
 *
 * Body: { type: string, data: object }
 *
 * Types supportés:
 * - score-update: { homeTeam, awayTeam, homeScore, awayScore, period?, matchTime? }
 * - score-reset: {}
 * - phase-change: { phase: 'neutral' | 'before' | 'during' | 'after' }
 * - play-video: { video: { name, path, categoryId } }
 * - play-sponsors: {}
 * - timer-update: { action: 'start' | 'pause' | 'reset' | 'sync', time? }
 * - breaking-news: { message, duration?, position? }
 * - match-config: { sessionId, matchDate, matchName, audienceEstimate }
 */
router.post('/:siteId/command', remoteRateLimit, sendRemoteCommand);

/**
 * GET /api/remote/:siteId/videos
 * Liste les vidéos disponibles sur le site pour la télécommande
 */
router.get('/:siteId/videos', remoteRateLimit, getRemoteVideos);

export default router;
