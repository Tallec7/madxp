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
              is_default, configuration, created_by, updated_by, created_at, updated_at
       FROM config_profiles
       WHERE site_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [siteId]
    );
    return result.rows;
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

  /**
   * Met a jour le active_profile_id d'un site.
   */
  async updateSiteActiveProfile(siteId: string, profileId: string | null): Promise<void> {
    await query(
      'UPDATE sites SET active_profile_id = $1 WHERE id = $2',
      [profileId, siteId]
    );
  }
}

export const configProfileRepository = new ConfigProfileRepositoryImpl();
