import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types specifiques
// --------------------------------------------------------------------------

export interface ConfigHistoryRow extends QueryResultRow {
  id: string;
  site_id: string;
  configuration: Record<string, unknown>;
  deployed_by: string | null;
  deployed_at: Date;
  comment: string | null;
  changes_summary: unknown;
  previous_version_id: string | null;
}

export interface ConfigHistoryWithUserRow extends ConfigHistoryRow {
  deployed_by_email: string | null;
  deployed_by_name: string | null;
}

export interface ConfigVersionCompareRow extends QueryResultRow {
  id: string;
  configuration: Record<string, unknown>;
  deployed_at: Date;
}

export interface SiteBasicRow extends QueryResultRow {
  id: string;
  site_name: string;
}

export interface SiteLocalConfigRow extends QueryResultRow {
  local_config_mirror: Record<string, unknown> | null;
}

export interface ConfigHistoryLastVersionRow extends QueryResultRow {
  id: string;
  configuration: Record<string, unknown>;
}

export interface ConfigHistoryConfigOnlyRow extends QueryResultRow {
  configuration: Record<string, unknown>;
}

export interface InsertConfigVersionInput {
  id: string;
  site_id: string;
  configuration: string;
  deployed_by: string | undefined;
  comment: string | null;
  previous_version_id: string | null;
  changes_summary: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class ConfigHistoryRepositoryImpl extends BaseRepository<ConfigHistoryRow> {
  constructor() {
    super('config_history');
  }

  /**
   * Verifie qu'un site existe et retourne ses infos de base.
   */
  async findSiteBasic(siteId: string): Promise<SiteBasicRow | null> {
    const result = await query<SiteBasicRow>(
      'SELECT id, site_name FROM sites WHERE id = $1',
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere l'historique des configurations d'un site avec pagination.
   */
  async findBySitePaginated(
    siteId: string,
    limit: number,
    offset: number
  ): Promise<ConfigHistoryWithUserRow[]> {
    const result = await query<ConfigHistoryWithUserRow>(
      `SELECT
        ch.id,
        ch.site_id,
        ch.configuration,
        ch.deployed_by,
        ch.deployed_at,
        ch.comment,
        ch.changes_summary,
        u.email as deployed_by_email,
        u.full_name as deployed_by_name
      FROM config_history ch
      LEFT JOIN users u ON ch.deployed_by = u.id
      WHERE ch.site_id = $1
      ORDER BY ch.deployed_at DESC
      LIMIT $2 OFFSET $3`,
      [siteId, limit, offset]
    );
    return result.rows;
  }

  /**
   * Compte le nombre total d'entrees config_history pour un site.
   */
  async countBySite(siteId: string): Promise<number> {
    const result = await query(
      'SELECT COUNT(*) as total FROM config_history WHERE site_id = $1',
      [siteId]
    );
    const row = result.rows[0] as { total: string };
    return parseInt(row.total);
  }

  /**
   * Recupere une version specifique de configuration avec les infos du deploiement.
   */
  async findVersionWithUser(
    versionId: string,
    siteId: string
  ): Promise<ConfigHistoryWithUserRow | null> {
    const result = await query<ConfigHistoryWithUserRow>(
      `SELECT
        ch.id,
        ch.site_id,
        ch.configuration,
        ch.deployed_by,
        ch.deployed_at,
        ch.comment,
        ch.changes_summary,
        u.email as deployed_by_email,
        u.full_name as deployed_by_name
      FROM config_history ch
      LEFT JOIN users u ON ch.deployed_by = u.id
      WHERE ch.id = $1 AND ch.site_id = $2`,
      [versionId, siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere la derniere version de configuration pour un site.
   */
  async findLastVersion(siteId: string): Promise<ConfigHistoryLastVersionRow | null> {
    const result = await query<ConfigHistoryLastVersionRow>(
      `SELECT id, configuration FROM config_history
       WHERE site_id = $1
       ORDER BY deployed_at DESC
       LIMIT 1`,
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Insere une nouvelle version de configuration.
   */
  async insertVersion(input: InsertConfigVersionInput): Promise<ConfigHistoryRow> {
    const result = await query<ConfigHistoryRow>(
      `INSERT INTO config_history (id, site_id, configuration, deployed_by, comment, previous_version_id, changes_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, site_id, configuration, deployed_by, deployed_at, comment, changes_summary`,
      [
        input.id,
        input.site_id,
        input.configuration,
        input.deployed_by,
        input.comment,
        input.previous_version_id,
        input.changes_summary,
      ]
    );
    return result.rows[0];
  }

  /**
   * Met a jour le pending_config_version_id d'un site.
   */
  async updateSitePendingConfigVersion(siteId: string, versionId: string): Promise<void> {
    await query(
      'UPDATE sites SET pending_config_version_id = $1 WHERE id = $2',
      [versionId, siteId]
    );
  }

  /**
   * Recupere deux versions pour comparaison.
   */
  async findTwoVersionsForComparison(
    siteId: string,
    version1Id: string,
    version2Id: string
  ): Promise<ConfigVersionCompareRow[]> {
    const result = await query<ConfigVersionCompareRow>(
      `SELECT id, configuration, deployed_at FROM config_history
       WHERE site_id = $1 AND id IN ($2, $3)`,
      [siteId, version1Id, version2Id]
    );
    return result.rows;
  }

  /**
   * Recupere le local_config_mirror d'un site.
   */
  async findSiteLocalConfigMirror(siteId: string): Promise<SiteLocalConfigRow | null> {
    const result = await query<SiteLocalConfigRow>(
      'SELECT local_config_mirror FROM sites WHERE id = $1',
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere la derniere configuration uniquement (sans id) pour un site.
   */
  async findLastConfigurationOnly(siteId: string): Promise<ConfigHistoryConfigOnlyRow | null> {
    const result = await query<ConfigHistoryConfigOnlyRow>(
      `SELECT configuration FROM config_history
       WHERE site_id = $1
       ORDER BY deployed_at DESC
       LIMIT 1`,
      [siteId]
    );
    return result.rows[0] || null;
  }
}

export const configHistoryRepository = new ConfigHistoryRepositoryImpl();
