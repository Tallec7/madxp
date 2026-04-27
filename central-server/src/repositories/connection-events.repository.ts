import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import logger from '../config/logger';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type ConnectionEventType = 'connected' | 'disconnected';

export interface ConnectionEventRow extends QueryResultRow {
  id: string;
  site_id: string;
  event_type: ConnectionEventType;
  occurred_at: Date;
  reason: string | null;
  socket_id: string | null;
  client_ip: string | null;
}

export interface UptimeStats {
  /**
   * Pourcentage du temps connecté sur la fenêtre demandée (0-100).
   * NULL si aucun événement enregistré (site jamais connecté ou pré-migration).
   */
  uptimePercent: number | null;
  /**
   * Nombre d'événements `disconnected` enregistrés sur la fenêtre.
   * Indicateur de flapping : >10/h sur 24h = vraie instabilité.
   */
  disconnectCount: number;
  /**
   * Durée (secondes) de la plus longue coupure sur la fenêtre.
   * 0 si aucune coupure.
   */
  longestGapSeconds: number;
  /**
   * État courant déduit du dernier événement.
   * 'unknown' si aucun événement.
   */
  currentState: 'connected' | 'disconnected' | 'unknown';
}

interface RecordEventInput {
  siteId: string;
  eventType: ConnectionEventType;
  reason?: string | null;
  socketId?: string | null;
  clientIp?: string | null;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class ConnectionEventsRepositoryImpl {
  /**
   * Enregistre un événement de connexion/déconnexion. Best-effort : les erreurs
   * sont loggées mais ne propagent pas (le tracking ne doit jamais bloquer un
   * connect/disconnect réel).
   */
  async record(input: RecordEventInput): Promise<void> {
    try {
      await query(
        `INSERT INTO connection_events (site_id, event_type, reason, socket_id, client_ip)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          input.siteId,
          input.eventType,
          input.reason ?? null,
          input.socketId ?? null,
          input.clientIp ?? null,
        ]
      );
    } catch (error) {
      logger.error('Failed to record connection event', {
        siteId: input.siteId,
        eventType: input.eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Calcule les statistiques d'uptime sur les N dernières heures pour un site.
   * Algorithme :
   *   1. Récupère tous les events sur la fenêtre + le dernier event antérieur
   *      (pour connaître l'état au début de la fenêtre).
   *   2. Itère en alternant connected/disconnected, somme les durées online.
   *   3. Si l'état courant est 'connected' à la fin, ajoute jusqu'à NOW.
   */
  async getUptimeStats(siteId: string, hours: number): Promise<UptimeStats> {
    const windowSeconds = hours * 3600;

    const result = await query<ConnectionEventRow>(
      `(
         SELECT id, site_id, event_type, occurred_at, reason, socket_id, client_ip
         FROM connection_events
         WHERE site_id = $1 AND occurred_at < NOW() - ($2 || ' hours')::INTERVAL
         ORDER BY occurred_at DESC
         LIMIT 1
       )
       UNION ALL
       (
         SELECT id, site_id, event_type, occurred_at, reason, socket_id, client_ip
         FROM connection_events
         WHERE site_id = $1 AND occurred_at >= NOW() - ($2 || ' hours')::INTERVAL
         ORDER BY occurred_at ASC
       )`,
      [siteId, hours]
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return {
        uptimePercent: null,
        disconnectCount: 0,
        longestGapSeconds: 0,
        currentState: 'unknown',
      };
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowSeconds * 1000);

    // État au début de la fenêtre : déduit du premier row si antérieur,
    // sinon de l'état initial supposé 'disconnected'.
    let cursorTime = windowStart;
    let cursorState: ConnectionEventType =
      rows[0].occurred_at < windowStart ? rows[0].event_type : 'disconnected';

    let onlineSeconds = 0;
    let longestGapSeconds = 0;
    let disconnectCount = 0;
    let currentGapStart: Date | null = cursorState === 'disconnected' ? windowStart : null;

    const eventsInWindow = rows.filter((r) => r.occurred_at >= windowStart);

    for (const event of eventsInWindow) {
      const eventTime = event.occurred_at;
      const segmentSeconds = Math.max(0, (eventTime.getTime() - cursorTime.getTime()) / 1000);

      if (cursorState === 'connected') {
        onlineSeconds += segmentSeconds;
      } else if (currentGapStart) {
        // Fin éventuelle d'une coupure
        if (event.event_type === 'connected') {
          longestGapSeconds = Math.max(longestGapSeconds, segmentSeconds);
          currentGapStart = null;
        }
      }

      if (event.event_type !== cursorState) {
        if (event.event_type === 'disconnected') {
          disconnectCount += 1;
          currentGapStart = eventTime;
        }
        cursorState = event.event_type;
      }

      cursorTime = eventTime;
    }

    // Segment final jusqu'à NOW
    const finalSeconds = Math.max(0, (now.getTime() - cursorTime.getTime()) / 1000);
    if (cursorState === 'connected') {
      onlineSeconds += finalSeconds;
    } else if (currentGapStart) {
      longestGapSeconds = Math.max(longestGapSeconds, finalSeconds);
    }

    const uptimePercent = Math.min(100, Math.max(0, (onlineSeconds / windowSeconds) * 100));

    return {
      uptimePercent: Math.round(uptimePercent * 10) / 10,
      disconnectCount,
      longestGapSeconds: Math.round(longestGapSeconds),
      currentState: cursorState,
    };
  }

  /**
   * Purge les événements plus vieux que `retentionDays`. Appelé par le CRON.
   * Retourne le nombre de rows supprimés.
   */
  async purgeOlderThan(retentionDays: number): Promise<number> {
    const result = await query(
      `DELETE FROM connection_events
       WHERE occurred_at < NOW() - ($1 || ' days')::INTERVAL`,
      [retentionDays]
    );
    return result.rowCount ?? 0;
  }
}

export const connectionEventsRepository = new ConnectionEventsRepositoryImpl();
