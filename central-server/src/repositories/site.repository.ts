import { query } from '../config/database';
import logger from '../config/logger';
import { Site } from '../types';
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
    const total = countResult.rows[0]?.count ?? 0;

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
    const total = countResult.rows[0]?.count ?? 0;

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
  // Private helpers
  // --------------------------------------------------------------------------

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
