import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types specifiques
// --------------------------------------------------------------------------

export interface ConfigProfileRow extends QueryResultRow {
  id: string;
  site_id: string;
  name: string;
  display_name: string | null;
  city: string | null;
  sport: string | null;
  sort_order: number;
  is_default: boolean;
  configuration: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  remote_pin_required?: boolean;
}

export interface ProfilePinRow extends QueryResultRow {
  remote_pin_required: boolean;
  remote_pin_hash: string | null;
  remote_pin_updated_at: Date | null;
}

export interface ProfileDeviceTokenRow extends QueryResultRow {
  id: string;
  profile_id: string;
  site_id: string;
  device_id: string;
  label: string | null;
  token_hash: string;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
}

export interface ConfigProfileMetadataRow extends QueryResultRow {
  id: string;
  name: string;
  display_name: string | null;
  city: string | null;
  sport: string | null;
  is_default: boolean;
  sort_order: number;
}

export interface CreateProfileInput {
  siteId: string;
  name: string;
  displayName?: string;
  city?: string;
  sport?: string;
  sortOrder?: number;
  isDefault?: boolean;
  configuration: Record<string, unknown>;
  createdBy?: string;
}

export interface UpdateProfileInput {
  name?: string;
  displayName?: string;
  city?: string;
  sport?: string;
  sortOrder?: number;
  isDefault?: boolean;
  configuration?: Record<string, unknown>;
  updatedBy?: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class ConfigProfileRepositoryImpl extends BaseRepository<ConfigProfileRow> {
  constructor() {
    super('config_profiles');
  }

  /**
   * Recupere tous les profils d'un site, tries par sort_order.
   */
  async findBySite(siteId: string): Promise<ConfigProfileRow[]> {
    const result = await query<ConfigProfileRow>(
      `SELECT id, site_id, name, display_name, city, sport, sort_order,
              is_default, configuration, created_by, updated_by, created_at, updated_at,
              remote_pin_required
       FROM config_profiles
       WHERE site_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [siteId]
    );
    return result.rows;
  }

  /**
   * ADR-058: PIN metadata for a profile.
   * Returns { remote_pin_required: false, ... } if PIN columns don't exist (pre-migration).
   */
  async findPin(profileId: string): Promise<ProfilePinRow | null> {
    try {
      const result = await query<ProfilePinRow>(
        `SELECT remote_pin_required, remote_pin_hash, remote_pin_updated_at
         FROM config_profiles WHERE id = $1`,
        [profileId]
      );
      return result.rows[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * ADR-058: set / clear the PIN hash on a profile.
   */
  async setPin(
    profileId: string,
    input: { hash: string | null; required: boolean }
  ): Promise<void> {
    await query(
      `UPDATE config_profiles
       SET remote_pin_required = $1,
           remote_pin_hash = $2,
           remote_pin_updated_at = CASE WHEN $2 IS NULL THEN NULL ELSE NOW() END
       WHERE id = $3`,
      [input.required, input.hash, profileId]
    );
  }

  /**
   * Recupere le profil par defaut d'un site.
   */
  async findDefaultForSite(siteId: string): Promise<ConfigProfileRow | null> {
    const result = await query<ConfigProfileRow>(
      `SELECT id, site_id, name, display_name, city, sport, sort_order,
              is_default, configuration, created_by, updated_by, created_at, updated_at
       FROM config_profiles
       WHERE site_id = $1 AND is_default = true
       LIMIT 1`,
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Compte le nombre de profils d'un site.
   */
  async countBySite(siteId: string): Promise<number> {
    const result = await query(
      'SELECT COUNT(*) as total FROM config_profiles WHERE site_id = $1',
      [siteId]
    );
    const row = result.rows[0] as { total: string };
    return parseInt(row.total);
  }

  /**
   * Cree un nouveau profil.
   */
  async create(input: CreateProfileInput): Promise<ConfigProfileRow> {
    const result = await query<ConfigProfileRow>(
      `INSERT INTO config_profiles
        (site_id, name, display_name, city, sport, sort_order, is_default, configuration, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING *`,
      [
        input.siteId,
        input.name,
        input.displayName || null,
        input.city || null,
        input.sport || null,
        input.sortOrder ?? 0,
        input.isDefault ?? false,
        JSON.stringify(input.configuration),
        input.createdBy || null,
      ]
    );
    return result.rows[0];
  }

  /**
   * Met a jour un profil existant.
   */
  async update(profileId: string, input: UpdateProfileInput): Promise<ConfigProfileRow | null> {
    const fields: Record<string, unknown> = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.displayName !== undefined) fields.display_name = input.displayName;
    if (input.city !== undefined) fields.city = input.city;
    if (input.sport !== undefined) fields.sport = input.sport;
    if (input.sortOrder !== undefined) fields.sort_order = input.sortOrder;
    if (input.isDefault !== undefined) fields.is_default = input.isDefault;
    if (input.configuration !== undefined) fields.configuration = JSON.stringify(input.configuration);
    if (input.updatedBy !== undefined) fields.updated_by = input.updatedBy;

    if (Object.keys(fields).length === 0) {
      return this.findById(profileId);
    }

    const { setClauses, values } = this.buildUpdateSet(fields);
    const paramIndex = values.length + 1;

    const result = await query<ConfigProfileRow>(
      `UPDATE config_profiles SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      [...values, profileId]
    );
    return result.rows[0] || null;
  }

  async mergeConfiguration(profileId: string, partialConfig: Record<string, unknown>, updatedBy?: string): Promise<ConfigProfileRow | null> {
    const setClauses = ['configuration = COALESCE(configuration, \'{}\'::jsonb) || $1::jsonb'];
    const values: unknown[] = [JSON.stringify(partialConfig)];

    if (updatedBy) {
      setClauses.push(`updated_by = $${values.length + 1}`);
      values.push(updatedBy);
    }

    const paramIndex = values.length + 1;
    const result = await query<ConfigProfileRow>(
      `UPDATE config_profiles SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      [...values, profileId]
    );
    return result.rows[0] || null;
  }

  /**
   * Definit un profil comme profil par defaut (et unset l'ancien).
   * Utilise une transaction pour garantir la coherence.
   */
  async setDefault(siteId: string, profileId: string): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query(
        'UPDATE config_profiles SET is_default = false WHERE site_id = $1 AND is_default = true',
        [siteId]
      );
      await client.query(
        'UPDATE config_profiles SET is_default = true WHERE id = $1 AND site_id = $2',
        [profileId, siteId]
      );
    });
  }

  /**
   * Recupere les metadonnees des profils pour generer clubs.json (leger).
   */
  async findProfilesMetadata(siteId: string): Promise<ConfigProfileMetadataRow[]> {
    const result = await query<ConfigProfileMetadataRow>(
      `SELECT id, name, display_name, city, sport, is_default, sort_order
       FROM config_profiles
       WHERE site_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [siteId]
    );
    return result.rows;
  }
}

export const configProfileRepository = new ConfigProfileRepositoryImpl();

// --------------------------------------------------------------------------
// Device Token Repository (ADR-058)
// --------------------------------------------------------------------------

class ProfileDeviceTokenRepositoryImpl {
  async create(input: {
    id?: string;
    profileId: string;
    siteId: string;
    deviceId: string;
    label: string | null;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<ProfileDeviceTokenRow> {
    if (input.id) {
      const result = await query<ProfileDeviceTokenRow>(
        `INSERT INTO profile_device_tokens
          (id, profile_id, site_id, device_id, label, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [input.id, input.profileId, input.siteId, input.deviceId, input.label, input.tokenHash, input.expiresAt]
      );
      return result.rows[0];
    }
    const result = await query<ProfileDeviceTokenRow>(
      `INSERT INTO profile_device_tokens
        (profile_id, site_id, device_id, label, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.profileId, input.siteId, input.deviceId, input.label, input.tokenHash, input.expiresAt]
    );
    return result.rows[0];
  }

  async findActiveByProfile(profileId: string): Promise<ProfileDeviceTokenRow[]> {
    const result = await query<ProfileDeviceTokenRow>(
      `SELECT * FROM profile_device_tokens
       WHERE profile_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [profileId]
    );
    return result.rows;
  }

  async findByHash(tokenHash: string): Promise<ProfileDeviceTokenRow | null> {
    const result = await query<ProfileDeviceTokenRow>(
      `SELECT * FROM profile_device_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    return result.rows[0] || null;
  }

  async touchLastUsed(id: string): Promise<void> {
    await query(`UPDATE profile_device_tokens SET last_used_at = NOW() WHERE id = $1`, [id]);
  }

  async revoke(id: string, reason?: string): Promise<void> {
    await query(
      `UPDATE profile_device_tokens SET revoked_at = NOW(), revoked_reason = $2 WHERE id = $1`,
      [id, reason || 'manual']
    );
  }

  async revokeAllForProfile(profileId: string, reason?: string): Promise<number> {
    const result = await query(
      `UPDATE profile_device_tokens SET revoked_at = NOW(), revoked_reason = $2
       WHERE profile_id = $1 AND revoked_at IS NULL`,
      [profileId, reason || 'manual']
    );
    return result.rowCount || 0;
  }

  /**
   * ADR-058: supprime les rows définitivement (révoqués OU expirés) plus anciens
   * que `days` jours. Purge de sécurité pour éviter une croissance illimitée de
   * la table (30j de TTL JWT → on garde 30j après expiration pour l'audit, puis
   * purge). Retourne le nombre de lignes supprimées.
   */
  async cleanupExpired(days: number): Promise<number> {
    const result = await query(
      `DELETE FROM profile_device_tokens
       WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - ($1 || ' days')::interval)
          OR (expires_at < NOW() - ($1 || ' days')::interval)`,
      [days]
    );
    return result.rowCount || 0;
  }

  /** ADR-058: compte les tokens actifs (non-révoqués, non-expirés) toutes profils confondus. */
  async countActive(): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM profile_device_tokens
       WHERE revoked_at IS NULL AND expires_at > NOW()`
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }
}

export const profileDeviceTokenRepository = new ProfileDeviceTokenRepositoryImpl();
