/**
 * Handler Socket.IO - Score Update
 *
 * Gère les événements de mise à jour du score en direct:
 * - Reçoit le score depuis la télécommande
 * - Relay vers le TV client du même site
 * - Optionnel: Stocke dans sponsor_impressions pour corrélation
 *
 * Date: 2025-12-16
 */

import { Socket } from 'socket.io';
import logger from '../config/logger';
import { auditService } from '../services/audit.service';

// Throttle score audit to avoid flooding audit_logs (one entry per minute max per site)
const lastScoreAudit: Map<string, { timestamp: number; score: { home: number; away: number } }> =
  new Map();
const SCORE_AUDIT_THROTTLE_MS = 60000; // 1 minute

export interface ScoreUpdatePayload {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period?: string;
  matchTime?: string;
}

/**
 * Handler pour l'événement 'score-update'
 *
 * @param socket - Socket du Raspberry Pi (télécommande)
 * @param payload - Score mis à jour
 */
export function handleScoreUpdate(socket: Socket, payload: ScoreUpdatePayload) {
  try {
    const { homeTeam, awayTeam, homeScore, awayScore, period, matchTime } = payload;

    // Validation
    if (
      typeof homeScore !== 'number' ||
      typeof awayScore !== 'number' ||
      homeScore < 0 ||
      awayScore < 0
    ) {
      logger.warn('score-update: payload invalide', {
        socketId: socket.id,
        payload
      });
      socket.emit('score-update-error', {
        error: 'Scores invalides'
      });
      return;
    }

    // Récupérer le site_id depuis les données du socket
    const siteId = (socket.data as any).siteId;
    if (!siteId) {
      logger.warn('score-update: site_id introuvable', { socketId: socket.id });
      socket.emit('score-update-error', {
        error: 'Site non identifié'
      });
      return;
    }

    logger.info('score-update received', {
      siteId,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      period,
      matchTime
    });

    // Relay vers le TV client du même site
    // socket.data.io est l'instance Socket.IO principale
    if (socket.data.io) {
      const io = socket.data.io;

      // Broadcast vers tous les clients du site (TV)
      io.to(siteId).emit('score-update', {
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        period,
        matchTime,
        timestamp: new Date().toISOString()
      });

      logger.debug('score-update broadcasted', {
        siteId,
        score: `${homeScore}-${awayScore}`
      });
    } else {
      logger.warn('score-update: instance io introuvable', { socketId: socket.id });
    }

    // Confirmer à la télécommande
    socket.emit('score-update-ack', {
      success: true,
      timestamp: new Date().toISOString()
    });

    // Audit score update (throttled to 1/min per site to avoid log flooding)
    const now = Date.now();
    const lastAudit = lastScoreAudit.get(siteId);
    const currentScore = { home: homeScore, away: awayScore };

    if (
      !lastAudit ||
      now - lastAudit.timestamp > SCORE_AUDIT_THROTTLE_MS ||
      lastAudit.score.home !== homeScore ||
      lastAudit.score.away !== awayScore
    ) {
      // Only audit if score changed or throttle period passed
      const previousScore = lastAudit?.score;
      lastScoreAudit.set(siteId, { timestamp: now, score: currentScore });

      // Fire and forget - don't block on audit
      auditService.logScoreUpdated(siteId, currentScore, previousScore).catch(() => {
        // Ignore audit errors
      });
    }

    // Note: Le stockage du score dans sponsor_impressions se fait
    // automatiquement côté Raspberry Pi dans le service sponsor-analytics
    // qui capture le score actuel lors de l'enregistrement d'une impression

  } catch (error) {
    logger.error('Erreur lors du traitement de score-update:', {
      error,
      payload,
      socketId: socket.id
    });

    socket.emit('score-update-error', {
      error: 'Erreur serveur lors du relay'
    });
  }
}

/**
 * Handler pour l'événement 'score-reset'
 *
 * Réinitialise le score à 0-0
 *
 * @param socket - Socket du Raspberry Pi
 */
export function handleScoreReset(socket: Socket) {
  try {
    const siteId = (socket.data as any).siteId;
    if (!siteId) {
      return;
    }

    logger.info('score-reset received', { siteId });

    // Broadcast reset vers le TV
    if (socket.data.io) {
      const io = socket.data.io;
      io.to(siteId).emit('score-reset', {
        timestamp: new Date().toISOString()
      });
    }

    socket.emit('score-reset-ack', {
      success: true
    });

  } catch (error) {
    logger.error('Erreur lors du traitement de score-reset:', {
      error,
      socketId: socket.id
    });
  }
}
