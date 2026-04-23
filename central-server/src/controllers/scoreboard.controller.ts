/**
 * ADR-088 — Scoreboard live push controller (F-15.2 SaaS).
 *
 * Endpoint:
 *   POST /api/scoreboard/:siteId/state  (authenticateSiteApiKey)
 *
 * Accepts a decoded match state from a sim or Pi connector, caches it
 * (TTL 60s in-memory), then broadcasts to all Socket.IO clients in the
 * siteId room as `scoreboard-state`.
 *
 * Dashboard hydration: GET /api/scoreboard/:siteId/state (JWT) returns the
 * last cached state on overlay load, before the socket stream takes over.
 */

import { Response } from 'express';
import { AuthRequest } from '../types';
import { SiteAuthRequest } from '../middleware/auth';
import {
  scoreboardStateRepository,
  type ScoreboardMatchState,
} from '../repositories/scoreboard-state.repository';
import socketService from '../services/socket.service';
import logger from '../config/logger';

export const postScoreboardState = async (
  req: SiteAuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { siteId } = req.params;
    if (req.siteId !== siteId) {
      res.status(403).json({ error: 'API key does not match site' });
      return;
    }

    const state: ScoreboardMatchState = {
      siteId,
      ...(req.body as Omit<ScoreboardMatchState, 'siteId' | 'updatedAt'>),
      updatedAt: Date.now(),
    };

    scoreboardStateRepository.upsert(state);
    socketService.emitScoreboardState(siteId, state);

    res.status(202).json({ accepted: true });
  } catch (error) {
    logger.error('postScoreboardState error', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Manual push (F-15.2 Phase 2 — simulateur Table de marque dans le dashboard).
 *
 * Même payload/broadcast que `postScoreboardState`, mais auth JWT au lieu de
 * l'API key site. Réservé aux rôles internes + club (scopé à son site via
 * `requireRole`).
 */
export const postScoreboardStateManual = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { siteId } = req.params;

    if (req.user?.role === 'club' && req.user.site_id !== siteId) {
      res.status(403).json({ error: 'Club user can only push to its own site' });
      return;
    }

    const state: ScoreboardMatchState = {
      siteId,
      ...(req.body as Omit<ScoreboardMatchState, 'siteId' | 'updatedAt'>),
      updatedAt: Date.now(),
    };

    scoreboardStateRepository.upsert(state);
    socketService.emitScoreboardState(siteId, state);

    res.status(202).json({ accepted: true });
  } catch (error) {
    logger.error('postScoreboardStateManual error', {
      error,
      siteId: req.params.siteId,
      userId: req.user?.id,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getScoreboardState = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { siteId } = req.params;
    const state = scoreboardStateRepository.findBySiteId(siteId);
    if (!state) {
      res.status(404).json({ error: 'No live scoreboard state' });
      return;
    }
    res.json(state);
  } catch (error) {
    logger.error('getScoreboardState error', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Internal server error' });
  }
};
