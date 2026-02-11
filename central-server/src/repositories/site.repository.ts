import { QueryResultRow } from 'pg';
import { query } from '../config/database';

import { Site, UserRole } from '../types';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types specifiques au repository
// --------------------------------------------------------------------------

export interface SiteFilters {
  status?: Site['status'] | Site['status'][];
  search?: string;
  sport?: string;
  region?: string;
  assignedTo?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SiteDashboardRow {
  [key: string]: unknown;
  id: string;
  site_name: string;
  club_name: string;
  status: string;
  last_seen_at: string | null;
  software_version: string | null;
  subscription_end: string | null;
  subscription_plan: string | null;
  suspended: boolean;
}

export interface UserContext {
  role: UserRole;
  agencyId?: string | null;
  advertiserId?: string | null;
}

export type SubscriptionFilter =
  | 'active'
  | 'expiring_soon'
  | 'grace_period'
  | 'suspended'
  | 'blocked'
  | 'trial';

export interface ExtendedSiteFilters extends SiteFilters {
  subscription?: SubscriptionFilter;
  userContext?: UserContext;
}

export interface CreateSiteInput {
  id: string;
  siteName: string;
  clubName: string;
  location: unknown;
  sports: unknown;
  hardwareModel: string;
  apiKeyHash: string;
}

export interface UpdateSiteInput {
  site_name?: string;
  club_name?: string;
  location?: string;
  sports?: string;
  status?: string;
  live_score_enabled?: boolean;
  remote_pin_hash?: string | null;
}

export interface SiteConnectionRow extends QueryResultRow {
  id: string;
  site_name: string;
  club_name: string;
  status: string;
  last_seen_at: Date | null;
  local_ip: string | null;
  last_metric_at: Date | null;
}

export interface SiteStatsRow extends QueryResultRow {
  id: string;
  status: string;
  last_seen_at: Date | null;
  last_metric_at: Date | null;
}

export interface FleetHealthRow extends QueryResultRow {
  id: string;
  site_name: string;
  club_name: string;
  status: string;
  last_seen_at: Date | null;
  local_ip: string | null;
  software_version: string | null;
  location: { city?: string; region?: string; lat?: number; lng?: number } | null;
  last_metric_at: Date | null;
  cpu_percent: number | null;
  memory_percent: number | null;
  temperature: number | null;
  disk_percent: number | null;
}

export interface SiteLocalContentRow extends QueryResultRow {
  id: string;
  site_name: string;
  club_name: string;
  local_config_mirror: Record<string, unknown> | null;
  local_config_hash: string | null;
  last_config_sync: Date | null;
}

export interface MatchRow extends QueryResultRow {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  videos_played: number;
  manual_triggers: number;
  auto_plays: number;
  match_date: Date | null;
  match_name: string | null;
  audience_estimate: number | null;
}

export interface MatchStatsRow extends QueryResultRow {
  total_matches: string;
  total_audience: string;
  avg_audience: string;
  total_videos: string;
  total_duration: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class SiteRepositoryImpl extends BaseRepository<Site> {
  constructor() {
    super('sites');
  }

  async findByApiKey(apiKey: string): Promise<Site | null> {
    const result = await query<Site>(
      'SELECT * FROM sites WHERE api_key = $1',
      [apiKey]
    );
    return result.rows[0] || null;
  }

  async findWithPagination(
    filters: SiteFilters = {},
    pagination: PaginationParams = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<Site>> {
    const { whereClauses, params } = this.buildWhereClause(filters);
    const whereSQL = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(' AND ')}`
      : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS count FROM sites ${whereSQL}`,
      params
    );
    const total = (countResult.rows[0]?.count as number) ?? 0;

    const offset = (pagination.page - 1) * pagination.limit;
    const dataParams = [...params, pagination.limit, offset];
    const dataResult = await query<Site>(
      `SELECT * FROM sites ${whereSQL} ORDER BY site_name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    return {
      data: dataResult.rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async findOnline(): Promise<Site[]> {
    const result = await query<Site>(
      "SELECT * FROM sites WHERE status = 'online' ORDER BY site_name ASC"
    );
    return result.rows;
  }

  async findOfflineSince(since: Date): Promise<Site[]> {
    const result = await query<Site>(
      "SELECT * FROM sites WHERE status = 'offline' AND last_seen_at < $1 ORDER BY last_seen_at ASC",
      [since.toISOString()]
    );
    return result.rows;
  }

  async updateStatus(id: string, status: Site['status']): Promise<void> {
    await query(
      'UPDATE sites SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
  }

  async updateLastSeen(id: string, timestamp: Date): Promise<void> {
    await query(
      'UPDATE sites SET last_seen_at = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [timestamp.toISOString(), 'online', id]
    );
  }

  async updateSoftwareVersion(id: string, version: string): Promise<void> {
    await query(
      'UPDATE sites SET software_version = $1, updated_at = NOW() WHERE id = $2',
      [version, id]
    );
  }

  async getDashboardRows(
    filters: SiteFilters = {},
    pagination: PaginationParams = { page: 1, limit: 50 }
  ): Promise<PaginatedResult<SiteDashboardRow>> {
    const { whereClauses, params } = this.buildWhereClause(filters);
    const whereSQL = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(' AND ')}`
      : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS count FROM sites ${whereSQL}`,
      params
    );
    const total = (countResult.rows[0]?.count as number) ?? 0;

    const offset = (pagination.page - 1) * pagination.limit;
    const dataParams = [...params, pagination.limit, offset];
    const dataResult = await query<SiteDashboardRow>(
      `SELECT id, site_name, club_name, status, last_seen_at, software_version,
              subscription_end, subscription_plan, suspended
       FROM sites ${whereSQL}
       ORDER BY site_name ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    return {
      data: dataResult.rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getSitesWithExpiringSoon(days: number): Promise<SiteDashboardRow[]> {
    const result = await query<SiteDashboardRow>(
      `SELECT id, site_name, club_name, status, last_seen_at, software_version,
              subscription_end, subscription_plan, suspended
       FROM sites
       WHERE subscription_end IS NOT NULL
         AND subscription_end > NOW()
         AND subscription_end < NOW() + $1::interval
         AND suspended = false
       ORDER BY subscription_end ASC`,
      [`${days} days`]
    );
    return result.rows;
  }

  async getSuspendedSites(): Promise<SiteDashboardRow[]> {
    const result = await query<SiteDashboardRow>(
      `SELECT id, site_name, club_name, status, last_seen_at, software_version,
              subscription_end, subscription_plan, suspended
       FROM sites
       WHERE suspended = true
       ORDER BY site_name ASC`
    );
    return result.rows;
  }

  // --------------------------------------------------------------------------
  // Extended queries (Phase 5.1)
  // --------------------------------------------------------------------------

  /**
   * Recherche paginee avec filtres multi-tenant et abonnement.
   * Utilisee par getSites (le endpoint principal).
   */
  async findAllWithFilters(
    filters: ExtendedSiteFilters,
    pagination: { limit: number; offset: number }
  ): Promise<{ rows: Site[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    // Multi-tenant filtering
    if (filters.userContext) {
      const { role, agencyId, advertiserId } = filters.userContext;
      if (role === 'agency') {
        if (agencyId) {
          whereClause += ` AND s.id IN (SELECT site_id FROM agency_sites WHERE agency_id = $${paramIndex})`;
          params.push(agencyId);
          paramIndex++;
        } else {
          whereClause += ` AND 1=0`;
        }
      } else if (role === 'advertiser' || role === 'sponsor') {
        if (advertiserId) {
          whereClause += ` AND s.id IN (
            SELECT DISTINCT cd.target_id FROM content_deployments cd
            JOIN advertiser_videos av ON av.video_id = cd.video_id
            WHERE av.advertiser_id = $${paramIndex} AND cd.target_type = 'site'
            UNION
            SELECT DISTINCT sg.site_id FROM site_groups sg
            JOIN content_deployments cd ON cd.target_id = sg.group_id AND cd.target_type = 'group'
            JOIN advertiser_videos av ON av.video_id = cd.video_id
            WHERE av.advertiser_id = $${paramIndex + 1}
          )`;
          params.push(advertiserId, advertiserId);
          paramIndex += 2;
        } else {
          whereClause += ` AND 1=0`;
        }
      }
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        whereClause += ` AND s.status = ANY($${paramIndex})`;
        params.push(filters.status);
      } else {
        whereClause += ` AND s.status = $${paramIndex}`;
        params.push(filters.status);
      }
      paramIndex++;
    }

    if (filters.sport) {
      whereClause += ` AND s.sports @> $${paramIndex}::jsonb`;
      params.push(JSON.stringify([filters.sport]));
      paramIndex++;
    }

    if (filters.region) {
      whereClause += ` AND s.location->>'region' = $${paramIndex}`;
      params.push(filters.region);
      paramIndex++;
    }

    if (filters.search) {
      whereClause += ` AND (s.site_name ILIKE $${paramIndex} OR s.club_name ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.subscription) {
      whereClause += this.buildSubscriptionClause(filters.subscription);
    }

    const dataQuery = `SELECT s.* FROM sites s ${whereClause} ORDER BY s.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const countQuery = `SELECT COUNT(*) as count FROM sites s ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      query<Site>(dataQuery, [...params, pagination.limit, pagination.offset]),
      query(countQuery, params),
    ]);

    const total = parseInt((countResult.rows[0]?.count as string) || '0', 10);
    return { rows: dataResult.rows, total };
  }

  /**
   * Insere un nouveau site.
   */
  async create(input: CreateSiteInput): Promise<Site> {
    const result = await query<Site>(
      `INSERT INTO sites (id, site_name, club_name, location, sports, hardware_model, api_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, site_name, club_name, location, sports, hardware_model, status, created_at`,
      [
        input.id,
        input.siteName,
        input.clubName,
        input.location ? JSON.stringify(input.location) : null,
        input.sports ? JSON.stringify(input.sports) : null,
        input.hardwareModel || 'Unknown',
        input.apiKeyHash,
      ]
    );
    return result.rows[0];
  }

  /**
   * Mise a jour dynamique d'un site.
   */
  async update(id: string, data: UpdateSiteInput): Promise<Site | null> {
    const { setClauses, values } = this.buildUpdateSet(data as Record<string, unknown>);
    if (setClauses.length === 0) return null;

    values.push(id);
    const sql = `UPDATE sites SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    const result = await query<Site>(sql, values);
    return result.rows[0] || null;
  }

  /**
   * Supprime un site et retourne son nom.
   */
  async delete(id: string): Promise<string | null> {
    const result = await query<{ site_name: string }>(
      'DELETE FROM sites WHERE id = $1 RETURNING site_name',
      [id]
    );
    return result.rows[0]?.site_name || null;
  }

  /**
   * Met a jour le hash de la cle API.
   */
  async updateApiKey(id: string, hashedKey: string): Promise<Site | null> {
    const result = await query<Site>(
      'UPDATE sites SET api_key = $1, updated_at = NOW() WHERE id = $2 RETURNING id, site_name, club_name, status, updated_at',
      [hashedKey, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Active le verrou de mise a jour config (bloque sync_local_state temporairement).
   */
  async setConfigUpdatePending(id: string, seconds: number): Promise<void> {
    await query(
      `UPDATE sites SET config_update_pending_until = NOW() + INTERVAL '1 second' * $1 WHERE id = $2`,
      [seconds, id]
    );
  }

  /**
   * Desactive le verrou de mise a jour config.
   */
  async clearConfigUpdatePending(id: string): Promise<void> {
    await query(
      `UPDATE sites SET config_update_pending_until = NULL WHERE id = $1`,
      [id]
    );
  }

  /**
   * Recherche les sites avec un nom identique ou similaire (pour deduplication).
   */
  async findNameDuplicates(name: string): Promise<{ site_name: string }[]> {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = await query<{ site_name: string }>(
      `SELECT site_name FROM sites WHERE site_name = $1 OR site_name ~ $2`,
      [name, `^${escapedName}-\\d+$`]
    );
    return result.rows;
  }

  /**
   * Recupere tous les sites avec leur dernier heartbeat (pour connection status).
   */
  async findWithConnectionStatus(): Promise<SiteConnectionRow[]> {
    const result = await query<SiteConnectionRow>(`
      SELECT
        s.id,
        s.site_name,
        s.club_name,
        s.status,
        s.last_seen_at,
        s.local_ip,
        (SELECT recorded_at FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as last_metric_at
      FROM sites s
      ORDER BY s.site_name
    `);
    return result.rows;
  }

  /**
   * Recupere les sites recents pour le debug des connexions.
   */
  async findForDebug(): Promise<Array<{ id: string; site_name: string; status: string; last_seen_at: Date | null }>> {
    const result = await query<{ id: string; site_name: string; status: string; last_seen_at: Date | null }>(`
      SELECT id, site_name, status, last_seen_at
      FROM sites
      WHERE status = 'online' OR last_seen_at > NOW() - INTERVAL '5 minutes'
      ORDER BY last_seen_at DESC
    `);
    return result.rows;
  }

  /**
   * Recupere tous les sites avec le dernier heartbeat (pour stats).
   */
  async getStats(): Promise<SiteStatsRow[]> {
    const result = await query<SiteStatsRow>(`
      SELECT
        s.id,
        s.status,
        s.last_seen_at,
        (SELECT recorded_at FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as last_metric_at
      FROM sites s
    `);
    return result.rows;
  }

  /**
   * Recupere tous les sites avec metriques pour la sante de la flotte.
   */
  async getFleetHealth(): Promise<FleetHealthRow[]> {
    const result = await query<FleetHealthRow>(`
      SELECT
        s.id,
        s.site_name,
        s.club_name,
        s.status,
        s.last_seen_at,
        s.local_ip,
        s.software_version,
        s.location,
        (SELECT recorded_at FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as last_metric_at,
        (SELECT cpu_usage FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as cpu_percent,
        (SELECT memory_usage FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as memory_percent,
        (SELECT temperature FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as temperature,
        (SELECT disk_usage FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as disk_percent
      FROM sites s
      ORDER BY s.site_name
    `);
    return result.rows;
  }

  /**
   * Recupere un site avec sa config locale (pour getSiteLocalContent).
   */
  async findWithLocalContent(id: string): Promise<SiteLocalContentRow | null> {
    const result = await query<SiteLocalContentRow>(
      `SELECT id, site_name, club_name, local_config_mirror, local_config_hash, last_config_sync
       FROM sites WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere un site avec les champs de connexion (pour dashboard et connection status).
   */
  async findConnectionInfo(id: string): Promise<{
    id: string;
    site_name: string;
    club_name: string;
    status: string;
    last_seen_at: Date | null;
    local_ip: string | null;
    last_config_sync: Date | null;
  } | null> {
    const result = await query<{
      id: string;
      site_name: string;
      club_name: string;
      status: string;
      last_seen_at: Date | null;
      local_ip: string | null;
      last_config_sync: Date | null;
    }>(
      `SELECT id, site_name, club_name, status, last_seen_at, local_ip, last_config_sync
       FROM sites WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere un site minimal (id, site_name) pour les verifications d'existence.
   */
  async findBasicInfo(id: string): Promise<{ id: string; site_name: string; club_name?: string; status?: string } | null> {
    const result = await query<{ id: string; site_name: string; club_name: string; status: string }>(
      'SELECT id, site_name, club_name, status FROM sites WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere l'historique des matchs pour un site.
   */
  async getMatchHistory(siteId: string, limit: number): Promise<MatchRow[]> {
    const result = await query<MatchRow>(
      `SELECT
        id, started_at, ended_at, duration_seconds,
        videos_played, manual_triggers, auto_plays,
        match_date, match_name, audience_estimate
      FROM club_sessions
      WHERE site_id = $1
        AND (match_name IS NOT NULL OR audience_estimate IS NOT NULL)
      ORDER BY COALESCE(match_date, started_at::date) DESC, started_at DESC
      LIMIT $2`,
      [siteId, limit]
    );
    return result.rows;
  }

  /**
   * Recupere les stats agreges des matchs pour un site.
   */
  async getMatchStats(siteId: string): Promise<MatchStatsRow> {
    const result = await query<MatchStatsRow>(
      `SELECT
        COUNT(*) as total_matches,
        COALESCE(SUM(audience_estimate), 0) as total_audience,
        COALESCE(AVG(audience_estimate) FILTER (WHERE audience_estimate IS NOT NULL), 0) as avg_audience,
        COALESCE(SUM(videos_played), 0) as total_videos,
        COALESCE(SUM(duration_seconds), 0) as total_duration
      FROM club_sessions
      WHERE site_id = $1
        AND (match_name IS NOT NULL OR audience_estimate IS NOT NULL)`,
      [siteId]
    );
    return result.rows[0];
  }

  // --------------------------------------------------------------------------
  // Remote PIN management
  // --------------------------------------------------------------------------

  async setRemotePin(id: string, pinHash: string): Promise<void> {
    await query(
      'UPDATE sites SET remote_pin_hash = $1, updated_at = NOW() WHERE id = $2',
      [pinHash, id]
    );
  }

  async clearRemotePin(id: string): Promise<void> {
    await query(
      'UPDATE sites SET remote_pin_hash = NULL, updated_at = NOW() WHERE id = $1',
      [id]
    );
  }

  async getRemotePinHash(id: string): Promise<string | null> {
    const result = await query<{ remote_pin_hash: string | null }>(
      'SELECT remote_pin_hash FROM sites WHERE id = $1',
      [id]
    );
    return result.rows[0]?.remote_pin_hash || null;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Construit la clause SQL pour le filtre d'abonnement.
   */
  private buildSubscriptionClause(subscription: SubscriptionFilter): string {
    switch (subscription) {
      case 'active':
        return ` AND s.suspended = false AND (s.subscription_end IS NULL OR s.subscription_end > NOW() + INTERVAL '30 days')`;
      case 'expiring_soon':
        return ` AND s.suspended = false AND s.subscription_end IS NOT NULL AND s.subscription_end <= NOW() + INTERVAL '30 days' AND s.subscription_end > NOW()`;
      case 'grace_period':
        return ` AND s.suspended = false AND s.subscription_end IS NOT NULL AND s.subscription_end <= NOW() AND s.subscription_end > NOW() - INTERVAL '7 days'`;
      case 'suspended':
        return ` AND s.suspended = true`;
      case 'blocked':
        return ` AND s.suspended = false AND s.subscription_end IS NOT NULL AND s.subscription_end <= NOW() - INTERVAL '7 days'`;
      case 'trial':
        return ` AND s.subscription_plan = 'trial' AND (s.subscription_end IS NULL OR s.subscription_end > NOW())`;
      default:
        return '';
    }
  }

  private buildWhereClause(filters: SiteFilters): {
    whereClauses: string[];
    params: unknown[];
  } {
    const whereClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        whereClauses.push(`status = ANY($${paramIndex})`);
        params.push(filters.status);
      } else {
        whereClauses.push(`status = $${paramIndex}`);
        params.push(filters.status);
      }
      paramIndex++;
    }

    if (filters.search) {
      whereClauses.push(`(site_name ILIKE $${paramIndex} OR club_name ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.sport) {
      whereClauses.push(`$${paramIndex} = ANY(sports)`);
      params.push(filters.sport);
      paramIndex++;
    }

    if (filters.region) {
      whereClauses.push(`location->>'region' = $${paramIndex}`);
      params.push(filters.region);
      paramIndex++;
    }

    return { whereClauses, params };
  }
}

export const siteRepository = new SiteRepositoryImpl();
