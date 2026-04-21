import { QueryResultRow } from 'pg';
import { query } from '../config/database';

/**
 * ADR-081 Phase 0 — Audit des commandes télécommande relayées.
 *
 * Trace chaque commande (video, back, volume, etc.) relayée par le central
 * server vers la TV (SaaS ou Pi). Utilisé pour mesurer le taux de drop
 * apparent (roomSize === 0) et préparer l'ACK/retry des phases suivantes.
 *
 * TTL: 7 jours (cleanup via cron-scheduler).
 */

export type RemoteCommandAuditStatus =
  | 'emitted'
  | 'acked'
  | 'dropped'
  | 'debounced'
  | 'unreachable';

export interface CreateRemoteCommandAuditInput {
  commandId: string;
  siteId: string;
  commandType: string;
  roomSize: number;
  status?: RemoteCommandAuditStatus;
  metadata?: Record<string, unknown>;
}

export interface RemoteCommandAuditRow extends QueryResultRow {
  command_id: string;
  site_id: string;
  command_type: string;
  emitted_at: Date;
  acked_at: Date | null;
  status: RemoteCommandAuditStatus;
  latency_ms: number | null;
  room_size: number;
  metadata: Record<string, unknown>;
}

class RemoteCommandAuditRepositoryImpl {
  /**
   * Insert un audit row. Fire-and-forget : ne jamais faire échouer le relay
   * si l'INSERT échoue (log seulement).
   */
  async insert(input: CreateRemoteCommandAuditInput): Promise<void> {
    const status: RemoteCommandAuditStatus =
      input.status ?? (input.roomSize === 0 ? 'dropped' : 'emitted');

    await query(
      `INSERT INTO remote_command_audit
         (command_id, site_id, command_type, room_size, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (command_id) DO NOTHING`,
      [
        input.commandId,
        input.siteId,
        input.commandType,
        input.roomSize,
        status,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
  }

  /**
   * Marque une commande comme acked (Phase 1+). Calcule latency_ms.
   */
  async markAcked(commandId: string): Promise<void> {
    await query(
      `UPDATE remote_command_audit
          SET acked_at = NOW(),
              status = 'acked',
              latency_ms = EXTRACT(EPOCH FROM (NOW() - emitted_at)) * 1000
        WHERE command_id = $1 AND acked_at IS NULL`,
      [commandId]
    );
  }

  /**
   * Cleanup TTL 7j (appelé par cron-scheduler).
   * Retourne le nombre de lignes supprimées.
   */
  async cleanupExpired(): Promise<number> {
    const result = await query<{ cleanup_expired_remote_command_audit: number }>(
      `SELECT cleanup_expired_remote_command_audit() AS cleanup_expired_remote_command_audit`
    );
    return result.rows[0]?.cleanup_expired_remote_command_audit ?? 0;
  }
}

export const remoteCommandAuditRepository = new RemoteCommandAuditRepositoryImpl();
