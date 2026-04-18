/**
 * RemoteAuthEventsRepository — ADR-061
 * Trace les accès télécommande avec client_version (v1/v2) pour piloter le sunset legacy.
 * Ratio d'usage visible dans le dashboard super_admin.
 */
import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

export interface RemoteAuthEvent extends QueryResultRow {
  id: string;
  site_id: string;
  event_type: 'pin_verify' | 'token_use' | 'state_load';
  client_version: 'v1' | 'v2';
  profile_id: string | null;
  ip_address: string | null;
  created_at: Date;
}

export interface CreateRemoteAuthEventInput {
  siteId: string;
  eventType: RemoteAuthEvent['event_type'];
  clientVersion: 'v1' | 'v2';
  profileId?: string | null;
  ipAddress?: string | null;
}

export interface MigrationStats {
  v1Count: number;
  v2Count: number;
  v2Ratio: number;
}

class RemoteAuthEventsRepositoryImpl extends BaseRepository<RemoteAuthEvent> {
  constructor() {
    super('remote_auth_events');
  }

  async record(input: CreateRemoteAuthEventInput): Promise<void> {
    await query(
      `INSERT INTO remote_auth_events (site_id, event_type, client_version, profile_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.siteId, input.eventType, input.clientVersion, input.profileId ?? null, input.ipAddress ?? null]
    );
  }

  /** Returns v1/v2 usage ratio over the last N days (for sunset dashboard). */
  async getMigrationStats(days = 30): Promise<MigrationStats> {
    const result = await query<{ client_version: string; count: string }>(
      `SELECT client_version, COUNT(*)::text AS count
       FROM remote_auth_events
       WHERE created_at >= NOW() - ($1 || ' days')::interval
       GROUP BY client_version`,
      [days]
    );
    let v1Count = 0;
    let v2Count = 0;
    for (const row of result.rows) {
      if (row.client_version === 'v1') v1Count = parseInt(row.count, 10);
      else if (row.client_version === 'v2') v2Count = parseInt(row.count, 10);
    }
    const total = v1Count + v2Count;
    return { v1Count, v2Count, v2Ratio: total > 0 ? v2Count / total : 0 };
  }

  /** Purge events older than retentionDays (called from server bootstrap). */
  async purgeOld(retentionDays = 90): Promise<number> {
    const result = await query(
      `DELETE FROM remote_auth_events WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [retentionDays]
    );
    return result.rowCount ?? 0;
  }
}

export const remoteAuthEventsRepository = new RemoteAuthEventsRepositoryImpl();
