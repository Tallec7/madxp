/**
 * Health Monitor Handler — Connection health checks and DB/WebSocket sync.
 *
 * Periodically verifies that connected sites are responsive (via pong tracking),
 * detects and cleans up zombie connections, and reconciles DB status with
 * actual WebSocket state.
 *
 * @see socket-context.ts for SocketContext interface
 */

import { Socket } from 'socket.io';
import { query } from '../config/database';
import logger from '../config/logger';
import metricsService from '../services/metrics.service';
import { SocketContext } from './socket-context';

// Memory safety limit for pong tracking entries
export const MAX_PONG_ENTRIES = 50;

// DB/WebSocket sync constants
export const DB_SYNC_INTERVAL_MS = 60000;
export const STALE_ONLINE_THRESHOLD_MS = 90000;

/**
 * Check connection health for all connected sites.
 * Sends pings to healthy sites, detects and cleans up zombie connections.
 */
export function checkConnectionHealth(ctx: SocketContext): void {
  const now = Date.now();
  const staleThresholdMs = 45000; // 45s sans pong = connexion zombie (3x pingInterval de 15s)

  for (const [siteId, socket] of ctx.connectedSites.entries()) {
    const lastPong = ctx.lastPongReceived.get(siteId);

    if (!lastPong) {
      // Jamais reçu de pong, initialiser
      ctx.lastPongReceived.set(siteId, now);
    } else if (now - lastPong > staleThresholdMs) {
      // Connexion zombie détectée
      logger.warn('Zombie connection detected, forcing disconnect', {
        siteId,
        lastPongAgo: Math.round((now - lastPong) / 1000),
        staleThresholdMs,
      });

      // Forcer la déconnexion pour nettoyer l'état
      metricsService.recordSocketDisconnect('zombie_timeout', 'agent');
      socket.disconnect(true);
      ctx.connectedSites.delete(siteId);
      ctx.lastPongReceived.delete(siteId);

      // Mettre à jour le statut en base
      query(
        'UPDATE sites SET status = $1, last_seen_at = NOW() WHERE id = $2',
        ['offline', siteId]
      ).catch((error) => {
        logger.error('Error updating site status on zombie disconnect:', error);
      });
    } else {
      // Envoyer un ping au site pour maintenir la connexion
      socket.emit('ping_check', { timestamp: now });
    }
  }
}

/**
 * Synchronize DB status with actual WebSocket connection state.
 * Marks 'offline' sites that are 'online' in DB but not connected via WebSocket.
 */
export async function syncDbWithWebSocketState(ctx: SocketContext): Promise<void> {
  try {
    const now = Date.now();

    const result = await query<{ id: string; site_name: string; last_seen_at: Date }>(
      `SELECT id, site_name, last_seen_at
       FROM sites
       WHERE status = 'online'
         AND last_seen_at < NOW() - INTERVAL '${Math.floor(STALE_ONLINE_THRESHOLD_MS / 1000)} seconds'`
    );

    let correctedCount = 0;

    for (const site of result.rows) {
      if (!ctx.connectedSites.has(site.id)) {
        const ageMs = now - new Date(site.last_seen_at).getTime();

        logger.warn('DB/WebSocket desync detected - marking site offline', {
          siteId: site.id,
          siteName: site.site_name,
          lastSeenAgoMs: ageMs,
          thresholdMs: STALE_ONLINE_THRESHOLD_MS,
        });

        await query(
          'UPDATE sites SET status = $1 WHERE id = $2',
          ['offline', site.id]
        );

        correctedCount++;
      }
    }

    if (correctedCount > 0) {
      logger.info('DB/WebSocket sync completed', {
        correctedSites: correctedCount,
        connectedSitesCount: ctx.connectedSites.size,
      });
    }
  } catch (error) {
    logger.error('Error syncing DB with WebSocket state:', error);
  }
}

/**
 * Clean up a zombie connection (socket present but non-functional).
 */
export function cleanupZombieConnection(
  ctx: SocketContext,
  siteId: string,
  socket: Socket
): void {
  logger.info('Cleaning up zombie connection', { siteId, socketId: socket.id });
  metricsService.recordSocketDisconnect('zombie_cleanup', 'agent');

  try {
    socket.disconnect(true);
  } catch (e) {
    logger.error('Error disconnecting zombie socket:', e);
  }

  ctx.connectedSites.delete(siteId);
  ctx.lastPongReceived.delete(siteId);

  query('UPDATE sites SET status = $1, last_seen_at = NOW() WHERE id = $2', ['offline', siteId])
    .catch((error) => {
      logger.error('Error updating site status on zombie cleanup:', error);
    });
}

/**
 * Get detailed health status for a specific site connection.
 * Used by the dashboard to display a reliable health indicator.
 */
export function getConnectionHealth(
  ctx: SocketContext,
  siteId: string
): {
  inMap: boolean;
  socketConnected: boolean;
  lastPongAgeMs: number | null;
  isHealthy: boolean;
  reason: string;
} {
  const socket = ctx.connectedSites.get(siteId);
  const lastPong = ctx.lastPongReceived.get(siteId);
  const now = Date.now();
  const lastPongAgeMs = lastPong ? now - lastPong : null;

  const inMap = !!socket;
  const socketConnected = socket?.connected ?? false;
  const pongFresh = lastPongAgeMs !== null && lastPongAgeMs < 90000;

  let isHealthy = false;
  let reason = 'unknown';

  if (!inMap) {
    reason = 'not_in_map';
  } else if (!socketConnected) {
    reason = 'socket_disconnected';
  } else if (!pongFresh) {
    reason = lastPongAgeMs === null ? 'no_pong_received' : 'pong_stale';
  } else {
    isHealthy = true;
    reason = 'healthy';
  }

  return {
    inMap,
    socketConnected,
    lastPongAgeMs,
    isHealthy,
    reason,
  };
}
