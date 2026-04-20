/**
 * ADR-074 — Fleet rollout monitoring.
 *
 * Reports bootstrap progress of the cloud-canonical hotspot PSK across the fleet.
 * Usage:
 *   source central-server/.env && npx ts-node src/scripts/hotspot-bootstrap-status.ts
 *
 * Output: table { site_name, has_cloud_psk, psk_rotated_at, online, last_heartbeat }
 */

import { QueryResultRow } from 'pg';
import pool, { query } from '../config/database';

interface Row extends QueryResultRow {
  id: string;
  name: string;
  has_cloud_psk: boolean;
  psk_rotated_at: Date | null;
  is_online: boolean;
  last_heartbeat: Date | null;
}

async function main(): Promise<void> {
  const result = await query<Row>(
    `SELECT
       id,
       name,
       (wifi_psk_encrypted IS NOT NULL) AS has_cloud_psk,
       psk_rotated_at,
       is_online,
       last_heartbeat
     FROM sites
     WHERE site_type = 'pi'
     ORDER BY has_cloud_psk ASC, name ASC`
  );

  const rows = result.rows;
  const total = rows.length;
  const bootstrapped = rows.filter((r) => r.has_cloud_psk).length;
  const online = rows.filter((r) => r.is_online).length;

  // eslint-disable-next-line no-console
  console.log(`\nADR-074 — Hotspot PSK Bootstrap Status`);
  // eslint-disable-next-line no-console
  console.log(`Fleet: ${bootstrapped}/${total} bootstrapped, ${online}/${total} online\n`);

  // eslint-disable-next-line no-console
  console.table(
    rows.map((r) => ({
      site: r.name,
      cloud_psk: r.has_cloud_psk ? 'YES' : '—',
      rotated_at: r.psk_rotated_at ? r.psk_rotated_at.toISOString().slice(0, 16) : '—',
      online: r.is_online ? 'YES' : '—',
      last_hb: r.last_heartbeat ? r.last_heartbeat.toISOString().slice(0, 16) : '—',
    }))
  );

  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('hotspot-bootstrap-status failed', err);
  process.exit(1);
});
