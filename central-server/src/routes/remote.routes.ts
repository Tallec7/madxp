/**
 * Remote Cloud Routes
 *
 * Endpoints pour contrôler un site Neopro à distance via le cloud.
 * Permet d'utiliser la télécommande depuis n'importe quel réseau,
 * même avec l'isolation client activée (mesh WiFi, réseaux entreprise).
 *
 * Date: 2026-01-18
 */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { sensitiveRateLimit } from '../middleware/user-rate-limit';
import {
  getRemoteState,
  sendRemoteCommand,
  getRemoteVideos,
} from '../controllers/remote.controller';

const router = Router();

// Tous les endpoints nécessitent une authentification JWT
// Rate limit: sensitiveRateLimit (30/min) car ce sont des actions qui affectent le Pi

/**
 * GET /api/remote/:siteId/state
 * Récupère l'état actuel du site (connexion, config, vidéos)
 */
router.get('/:siteId/state', authenticateJWT, sensitiveRateLimit, getRemoteState);

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
router.post('/:siteId/command', authenticateJWT, sensitiveRateLimit, sendRemoteCommand);

/**
 * GET /api/remote/:siteId/videos
 * Liste les vidéos disponibles sur le site pour la télécommande
 */
router.get('/:siteId/videos', authenticateJWT, sensitiveRateLimit, getRemoteVideos);

export default router;
