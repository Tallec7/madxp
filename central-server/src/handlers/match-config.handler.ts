/**
 * Handler Socket.IO - Match Configuration
 *
 * Gère les événements de configuration de match envoyés par la télécommande:
 * - Date du match
 * - Nom du match (legacy, concaténé) + home_team / away_team (ADR-092)
 * - Estimation d'audience
 * - Scores finaux (home_score / away_score) — mis à jour incrémentalement
 * - profile_id (ADR-058)
 * - event_type (match, training, tournament, other)
 *
 * Stocke les infos dans club_sessions pour corrélation avec analytics et
 * rapports historique / sponsors (avg_audience période).
 *
 * Date: 2025-12-16 (étendu 2026-04-24 ADR-092)
 */

import { Socket } from 'socket.io';
import pool from '../config/database';
import logger from '../config/logger';
import { auditService } from '../services/audit.service';

export interface MatchConfigPayload {
  sessionId: string;
  matchDate?: string;
  matchName?: string;
  audienceEstimate?: number;
  // ADR-092 — structured match fields
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  profileId?: string;
  eventType?: 'match' | 'training' | 'tournament' | 'other';
}

export async function handleMatchConfig(socket: Socket, payload: MatchConfigPayload) {
  try {
    const {
      sessionId,
      matchDate,
      matchName,
      audienceEstimate,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      profileId,
      eventType,
    } = payload;

    if (!sessionId) {
      logger.warn('match-config: sessionId manquant', { socketId: socket.id });
      socket.emit('match-config-error', { error: 'sessionId requis' });
      return;
    }

    const siteId = (socket as unknown as { siteId?: string }).siteId;
    if (!siteId) {
      logger.warn('match-config: site_id introuvable', { socketId: socket.id });
      socket.emit('match-config-error', { error: 'Site non identifié' });
      return;
    }

    logger.info('match-config received', {
      siteId,
      sessionId,
      matchDate,
      matchName,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      audienceEstimate,
      profileId,
      eventType,
    });

    const updateQuery = `
      UPDATE club_sessions
      SET
        match_date         = COALESCE($3::DATE, match_date),
        match_name         = COALESCE($4, match_name),
        audience_estimate  = COALESCE($5, audience_estimate),
        home_team          = COALESCE($6, home_team),
        away_team          = COALESCE($7, away_team),
        home_score         = COALESCE($8, home_score),
        away_score         = COALESCE($9, away_score),
        profile_id         = COALESCE($10, profile_id),
        event_type         = COALESCE($11, event_type)
      WHERE id = $1 AND site_id = $2
      RETURNING *
    `;

    const params = [
      sessionId,
      siteId,
      matchDate || null,
      matchName || null,
      audienceEstimate ?? null,
      homeTeam || null,
      awayTeam || null,
      homeScore ?? null,
      awayScore ?? null,
      profileId || null,
      eventType || null,
    ];

    const result = await pool.query(updateQuery, params);

    if (result.rowCount === 0) {
      const insertQuery = `
        INSERT INTO club_sessions (
          id, site_id, match_date, match_name, audience_estimate,
          home_team, away_team, home_score, away_score, profile_id, event_type,
          started_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, 'match'), NOW())
        RETURNING *
      `;
      const insertResult = await pool.query(insertQuery, params);

      logger.info('match-config: session créée', {
        sessionId,
        siteId,
        session: insertResult.rows[0],
      });

      await auditService.logMatchStarted(siteId, sessionId, {
        matchName,
        matchDate,
        audienceEstimate,
        homeTeam,
        awayTeam,
        profileId,
        eventType,
      });
    } else {
      logger.info('match-config: session mise à jour', {
        sessionId,
        siteId,
        session: result.rows[0],
      });

      await auditService.logMatchConfigUpdated(siteId, sessionId, {
        matchName,
        matchDate,
        audienceEstimate,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        profileId,
        eventType,
      });
    }

    socket.emit('match-config-saved', {
      success: true,
      sessionId,
      matchDate,
      matchName,
      audienceEstimate,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      profileId,
      eventType,
    });

    const io = (socket as unknown as { io?: { to: (room: string) => { emit: (event: string, payload: unknown) => void } } }).io;
    if (io) {
      io.to(siteId).emit('match-info-updated', {
        sessionId,
        matchDate,
        matchName,
        audienceEstimate,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        profileId,
        eventType,
      });
    }
  } catch (error) {
    logger.error('Erreur lors du traitement de match-config:', {
      error,
      payload,
      socketId: socket.id,
    });
    socket.emit('match-config-error', {
      error: 'Erreur serveur lors de la sauvegarde',
    });
  }
}
