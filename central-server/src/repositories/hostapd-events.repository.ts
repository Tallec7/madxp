import { query } from '../config/database';

/**
 * hostapd_events repository — ADR-072 OTA-2.
 *
 * Stocke les events Socket.IO envoyés par le Pi (hostapd_cli attach).
 * Permet de diagnostiquer à distance les problèmes d'association client.
 */

export interface HostapdEventInput {
  siteId: string;
  eventType: string;
  clientMac: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface HostapdEventRow {
  [key: string]: unknown;
  id: string;
  site_id: string;
  event_type: string;
  client_mac: string;
  occurred_at: Date;
  metadata: Record<string, unknown>;
  created_at: Date;
}

class HostapdEventsRepository {
  async insert(input: HostapdEventInput): Promise<void> {
    await query(
      `INSERT INTO hostapd_events (site_id, event_type, client_mac, occurred_at, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.siteId,
        input.eventType,
        input.clientMac.toLowerCase(),
        input.occurredAt ?? new Date(),
        JSON.stringify(input.metadata ?? {}),
      ]
    );
  }

  async listBySite(siteId: string, limit = 100): Promise<HostapdEventRow[]> {
    const result = await query<HostapdEventRow>(
      `SELECT * FROM hostapd_events
       WHERE site_id = $1
       ORDER BY occurred_at DESC
       LIMIT $2`,
      [siteId, limit]
    );
    return result.rows;
  }

  async pruneOlderThan(days: number): Promise<number> {
    const result = await query(
      `DELETE FROM hostapd_events WHERE occurred_at < NOW() - ($1 || ' days')::interval`,
      [days]
    );
    return result.rowCount ?? 0;
  }
}

export const hostapdEventsRepository = new HostapdEventsRepository();
export default hostapdEventsRepository;
