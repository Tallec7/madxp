import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { encryptPsk, decryptPsk } from '../services/hotspot-psk-crypto.service';

/**
 * ADR-074 — Repository for the cloud-canonical hotspot config.
 *
 * Stores the hotspot PSK encrypted (AES-256-GCM) in sites.wifi_psk_encrypted.
 * The SSID is stored alongside in sites.wifi_ssid.
 */

export interface HotspotConfig {
  siteId: string;
  ssid: string;
  psk: string;
  rotatedAt: Date | null;
}

interface HotspotRow extends QueryResultRow {
  id: string;
  wifi_ssid: string | null;
  wifi_psk_encrypted: Buffer | null;
  wifi_psk_iv: Buffer | null;
  wifi_psk_auth_tag: Buffer | null;
  psk_rotated_at: Date | null;
}

class HotspotConfigRepositoryImpl {
  async findBySiteId(siteId: string): Promise<HotspotConfig | null> {
    const result = await query<HotspotRow>(
      `SELECT id, wifi_ssid, wifi_psk_encrypted, wifi_psk_iv, wifi_psk_auth_tag, psk_rotated_at
       FROM sites WHERE id = $1`,
      [siteId]
    );
    const row = result.rows[0];
    if (!row || !row.wifi_psk_encrypted || !row.wifi_psk_iv || !row.wifi_psk_auth_tag || !row.wifi_ssid) {
      return null;
    }
    const psk = decryptPsk({
      ciphertext: row.wifi_psk_encrypted,
      iv: row.wifi_psk_iv,
      authTag: row.wifi_psk_auth_tag,
    });
    return {
      siteId: row.id,
      ssid: row.wifi_ssid,
      psk,
      rotatedAt: row.psk_rotated_at,
    };
  }

  /**
   * Bootstrap : set initial PSK+SSID only if still NULL.
   * Used by sync-agent on first boot post-ADR-074 OTA to upload the Pi's local PSK.
   * Returns true if stored, false if already bootstrapped (conflict, caller should fetch).
   */
  async bootstrap(siteId: string, ssid: string, psk: string): Promise<boolean> {
    const { ciphertext, iv, authTag } = encryptPsk(psk);
    const result = await query(
      `UPDATE sites
         SET wifi_psk_encrypted = $2,
             wifi_psk_iv = $3,
             wifi_psk_auth_tag = $4,
             wifi_ssid = $5,
             psk_rotated_at = COALESCE(psk_rotated_at, NOW())
       WHERE id = $1 AND wifi_psk_encrypted IS NULL
       RETURNING id`,
      [siteId, ciphertext, iv, authTag, ssid]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Rotation : overwrite existing PSK (and optionally SSID).
   * Used by the admin dashboard rotate endpoint.
   */
  async rotate(siteId: string, psk: string, ssid?: string): Promise<void> {
    const { ciphertext, iv, authTag } = encryptPsk(psk);
    if (ssid) {
      await query(
        `UPDATE sites
           SET wifi_psk_encrypted = $2,
               wifi_psk_iv = $3,
               wifi_psk_auth_tag = $4,
               wifi_ssid = $5,
               psk_rotated_at = NOW()
         WHERE id = $1`,
        [siteId, ciphertext, iv, authTag, ssid]
      );
    } else {
      await query(
        `UPDATE sites
           SET wifi_psk_encrypted = $2,
               wifi_psk_iv = $3,
               wifi_psk_auth_tag = $4,
               psk_rotated_at = NOW()
         WHERE id = $1`,
        [siteId, ciphertext, iv, authTag]
      );
    }
  }
}

export const hotspotConfigRepository = new HotspotConfigRepositoryImpl();
