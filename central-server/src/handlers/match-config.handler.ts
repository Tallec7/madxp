/**
 * Handler Socket.IO - Match Configuration
 *
 * Gère les événements de configuration de match envoyés par la télécommande:
 * - Date du match
 * - Nom du match (ex: "CESSON vs RENNES")
 * - Estimation d'audience
 *
 * Stocke les infos dans club_sessions pour corrélation avec analytics.
 *
 * Date: 2025-12-16
 */

import { Socket } from 'socket.io';
import pool from '../config/database';
import logger from '../config/logger';

export interface MatchConfigPayload {
  sessionId: string;
  matchDate?: string;
  matchName?: string;
  audienceEstimate?: number;
}

/**
 * Handler pour l'événement 'match-config'
 *
 * @param socket - Socket du Raspberry Pi
 * @param payload - Configuration du match
 */
export async function handleMatchConfig(socket: Socket, payload: MatchConfigPayload) {
  try {
    const { sessionId, matchDate, matchName, audienceEstimate } = payload;

    // Validation
    if (!sessionId) {
      logger.warn('match-config: sessionId manquant', { socketId: socket.id });
      socket.emit('match-config-error', {
        error: 'sessionId requis'
      });
      return;
    }

    // Récupérer le site_id depuis les données du socket
    const siteId = (socket.data as any).siteId;
    if (!siteId) {
      logger.warn('match-config: site_id introuvable', { socketId: socket.id });
      socket.emit('match-config-error', {
        error: 'Site non identifié'
      });
      return;
    }

    logger.info('match-config received', {
      siteId,
      sessionId,
      matchDate,
      matchName,
      audienceEstimate
    });

    // Mettre à jour la session dans club_sessions
    const query = `
      UPDATE club_sessions
      SET
        match_date = COALESCE($3::DATE, match_date),
        match_name = COALESCE($4, match_name),
        audience_estimate = COALESCE($5, audience_estimate),
        updated_at = NOW()
      WHERE id = $1 AND site_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [
      sessionId,
      siteId,
      matchDate || null,
      matchName || null,
      audienceEstimate || null
    ]);

    if (result.rowCount === 0) {
      // Session n'existe pas encore, la créer
      const insertQuery = `
        INSERT INTO club_sessions (
          id,
          site_id,
          match_date,
          match_name,
          audience_estimate,
          started_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `;

      const insertResult = await pool.query(insertQuery, [
        sessionId,
        siteId,
        matchDate || null,
        matchName || null,
        audienceEstimate || null
      ]);

      logger.info('match-config: session créée', {
        sessionId,
        siteId,
        session: insertResult.rows[0]
      });
    } else {
      logger.info('match-config: session mise à jour', {
        sessionId,
        siteId,
        session: result.rows[0]
      });
    }

    // Confirmer à la télécommande
    socket.emit('match-config-saved', {
      success: true,
      sessionId,
      matchDate,
      matchName,
      audienceEstimate
    });

    // Optionnel: Notifier le TV client du même site
    // (utile si on veut afficher une notification)
    if (socket.data.io) {
      const io = socket.data.io;
      io.to(siteId).emit('match-info-updated', {
        sessionId,
        matchDate,
        matchName,
        audienceEstimate
      });
    }

  } catch (error) {
    logger.error('Erreur lors du traitement de match-config:', {
      error,
      payload,
      socketId: socket.id
    });

    socket.emit('match-config-error', {
      error: 'Erreur serveur lors de la sauvegarde'
    });
  }
}
