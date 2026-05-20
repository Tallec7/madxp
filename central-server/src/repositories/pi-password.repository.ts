import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { encryptPiPassword, decryptPiPassword } from '../services/pi-password-crypto.service';

/**
 * ADR-132 — Repository pour la rotation OTA du mot de passe système `pi`.
 *
 * Stocke le hash SHA-512-crypt chiffré (AES-256-GCM) dans les colonnes
 * pi_password_* de la table sites, + le flag pi_system_password_pending
 * pour le mécanisme one-shot avec acquittement.
 *
 * Pattern identique à hotspot-config.repository.ts (ADR-074).
 */

interface PiPasswordRow extends QueryResultRow {
  pi_password_ciphertext: Buffer | null;
  pi_password_iv: Buffer | null;
  pi_password_auth_tag: Buffer | null;
  pi_system_password_pending: boolean;
  pi_password_rotated_at: Date | null;
}

class PiPasswordRepositoryImpl {
  /**
   * Récupère le hash SHA-512-crypt déchiffré pour un site si une rotation est
   * en attente (pi_system_password_pending = true). Retourne null sinon.
   *
   * Appelé par GET /api/sites/:id/pi-system-password (sync-agent).
   */
  async getPendingHashForSite(siteId: string): Promise<string | null> {
    const result = await query<PiPasswordRow>(
      `SELECT pi_password_ciphertext, pi_password_iv, pi_password_auth_tag,
              pi_system_password_pending
       FROM sites WHERE id = $1`,
      [siteId]
    );
    const row = result.rows[0];
    if (
      !row ||
      !row.pi_system_password_pending ||
      !row.pi_password_ciphertext ||
      !row.pi_password_iv ||
      !row.pi_password_auth_tag
    ) {
      return null;
    }
    return decryptPiPassword({
      ciphertext: row.pi_password_ciphertext,
      iv: row.pi_password_iv,
      authTag: row.pi_password_auth_tag,
    });
  }

  /**
   * Chiffre le hash et le stocke sur tous les sites `pi`.
   * Set pi_system_password_pending = true.
   * Retourne le nombre de sites mis à jour.
   *
   * Appelé par POST /api/fleet/rotate-pi-password (super_admin).
   */
  async setFleetPendingAndStore(hash: string): Promise<number> {
    const { ciphertext, iv, authTag } = encryptPiPassword(hash);
    const result = await query(
      `UPDATE sites
         SET pi_password_ciphertext      = $1,
             pi_password_iv              = $2,
             pi_password_auth_tag        = $3,
             pi_system_password_pending  = TRUE,
             pi_password_rotated_at      = NOW()
       WHERE site_type = 'pi'`,
      [ciphertext, iv, authTag]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Acquittement : set pi_system_password_pending = false pour un site donné.
   * Le hash reste en DB (historique + audit).
   *
   * Appelé par POST /api/sites/:id/pi-password-applied (sync-agent).
   */
  async markApplied(siteId: string): Promise<void> {
    await query(
      `UPDATE sites SET pi_system_password_pending = FALSE WHERE id = $1`,
      [siteId]
    );
  }

  /**
   * Compte les sites Pi ayant une rotation en attente.
   * Utilisé pour le monitoring dashboard.
   */
  async countPending(): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM sites WHERE site_type = 'pi' AND pi_system_password_pending = TRUE`
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }
}

export const piPasswordRepository = new PiPasswordRepositoryImpl();
