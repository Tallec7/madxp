import { query } from '../config/database';
import { Alert } from '../types';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types specifiques
// --------------------------------------------------------------------------

export interface CreateAlertInput {
  site_id: string;
  alert_type: string;
  severity: Alert['severity'];
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AlertThreshold {
  [key: string]: unknown;
  id: string;
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==';
  value: number;
  severity: Alert['severity'];
  cooldown_minutes: number;
  enabled: boolean;
  created_at: Date;
}

export interface AlertWithSite extends Alert {
  site_name: string;
  club_name: string;
}

export interface AlertListFilters {
  type?: string;
  active?: boolean;
  severity?: 'warning' | 'critical';
  siteId?: string;
}

export interface AlertStatsData {
  bySeverity: Record<string, number>;
  byType: Array<{ type: string; count: number }>;
  topSites: Array<{ siteId: string; siteName: string; alertCount: number }>;
  trend: Array<{ date: string; count: number; criticalCount: number }>;
  totalActive: number;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class AlertRepositoryImpl extends BaseRepository<Alert> {
  constructor() {
    super('alerts');
  }

  /**
   * Cree une nouvelle alerte.
   */
  async create(input: CreateAlertInput): Promise<Alert> {
    const result = await query<Alert>(
      `INSERT INTO alerts (site_id, alert_type, severity, message, metadata, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING *`,
      [
        input.site_id,
        input.alert_type,
        input.severity,
        input.message,
        JSON.stringify(input.metadata || {}),
      ]
    );
    return result.rows[0];
  }

  /**
   * Verifie si une alerte du meme type existe deja pour un site (deduplication).
   */
  async existsActive(siteId: string, alertType: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM alerts
       WHERE site_id = $1
         AND alert_type = $2
         AND status = 'active'
       LIMIT 1`,
      [siteId, alertType]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Resout une alerte et retourne l'alerte mise a jour.
   */
  async resolve(id: string): Promise<Alert | null> {
    const result = await query<Alert>(
      `UPDATE alerts SET status = 'resolved', resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Resout toutes les alertes actives d'un type pour un site.
   */
  async resolveAllByType(siteId: string, alertType: string): Promise<number> {
    const result = await query(
      `UPDATE alerts SET status = 'resolved', resolved_at = NOW()
       WHERE site_id = $1 AND alert_type = $2 AND status = 'active'`,
      [siteId, alertType]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Alertes actives avec infos site.
   */
  async getActiveWithSite(limit = 100): Promise<AlertWithSite[]> {
    const result = await query<AlertWithSite>(
      `SELECT a.*, s.site_name, s.club_name
       FROM alerts a
       JOIN sites s ON a.site_id = s.id
       WHERE a.status = 'active'
       ORDER BY
         CASE a.severity
           WHEN 'critical' THEN 0
           WHEN 'warning' THEN 1
           WHEN 'info' THEN 2
         END ASC,
         a.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Alertes recentes pour un site.
   */
  async getForSite(
    siteId: string,
    options: { status?: Alert['status']; limit?: number } = {}
  ): Promise<Alert[]> {
    const { status, limit = 50 } = options;
    const whereClauses = ['site_id = $1'];
    const params: unknown[] = [siteId];

    if (status) {
      whereClauses.push('status = $2');
      params.push(status);
    }

    params.push(limit);
    const result = await query<Alert>(
      `SELECT * FROM alerts
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return result.rows;
  }

  /**
   * Resout toutes les alertes actives d'un site (tous types confondus).
   */
  async resolveAllForSite(siteId: string): Promise<number> {
    const result = await query(
      `UPDATE alerts SET status = 'resolved', resolved_at = NOW()
       WHERE site_id = $1 AND status = 'active'`,
      [siteId]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Liste les alertes avec filtres et pagination, JOIN avec sites.
   */
  async findWithFilters(
    filters: AlertListFilters,
    pagination: { limit: number; offset: number }
  ): Promise<{ rows: AlertWithSite[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.type === 'predictive') {
      conditions.push(`(
        a.alert_type LIKE '%[PRÉD]%'
        OR a.alert_type IN (
          'days_since_last_video', 'disk_growth_rate', 'disconnections_24h',
          'wifi_signal_quality', 'video_errors_24h', 'temperature_trend',
          'hotspot_restarts_24h', 'days_until_subscription_end'
        )
      )`);
    } else if (filters.type) {
      conditions.push(`a.alert_type = $${paramIndex++}`);
      params.push(filters.type);
    }

    if (filters.active === true) {
      conditions.push(`a.status = 'active'`);
    } else if (filters.active === false) {
      conditions.push(`a.status IN ('acknowledged', 'resolved')`);
    }

    if (filters.severity) {
      conditions.push(`a.severity = $${paramIndex++}`);
      params.push(filters.severity);
    }

    if (filters.siteId) {
      conditions.push(`a.site_id = $${paramIndex++}`);
      params.push(filters.siteId);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const [dataResult, countResult] = await Promise.all([
      query<AlertWithSite>(
        `SELECT a.id, a.site_id, s.site_name, s.club_name,
                a.alert_type, a.severity, a.message, a.metadata,
                a.created_at, a.resolved_at, a.status
         FROM alerts a
         LEFT JOIN sites s ON s.id = a.site_id
         ${whereClause}
         ORDER BY
           CASE WHEN a.severity = 'critical' THEN 0 ELSE 1 END,
           a.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, pagination.limit, pagination.offset]
      ),
      query(
        `SELECT COUNT(*) as total FROM alerts a ${whereClause}`,
        params
      ),
    ]);

    return {
      rows: dataResult.rows,
      total: parseInt(countResult.rows[0].total as string, 10),
    };
  }

  /**
   * Statistiques agregees des alertes actives.
   */
  async getStats(): Promise<AlertStatsData> {
    const [severityResult, typeResult, sitesResult, trendResult] = await Promise.all([
      query(
        `SELECT severity, COUNT(*) as count
         FROM alerts WHERE status = 'active'
         GROUP BY severity`
      ),
      query(
        `SELECT alert_type as type, COUNT(*) as count
         FROM alerts WHERE status = 'active'
         GROUP BY alert_type ORDER BY count DESC LIMIT 10`
      ),
      query(
        `SELECT a.site_id, s.site_name, s.club_name, COUNT(*) as alert_count
         FROM alerts a
         LEFT JOIN sites s ON s.id = a.site_id
         WHERE a.status = 'active'
         GROUP BY a.site_id, s.site_name, s.club_name
         ORDER BY alert_count DESC LIMIT 10`
      ),
      query(
        `SELECT DATE(created_at) as date, COUNT(*) as count,
                COUNT(*) FILTER (WHERE severity = 'critical') as critical_count
         FROM alerts
         WHERE created_at > NOW() - INTERVAL '7 days'
         GROUP BY DATE(created_at) ORDER BY date`
      ),
    ]);

    const bySeverity: Record<string, number> = {};
    for (const row of severityResult.rows) {
      bySeverity[row.severity as string] = parseInt(row.count as string, 10);
    }

    return {
      bySeverity,
      byType: typeResult.rows.map(row => ({
        type: row.type as string,
        count: parseInt(row.count as string, 10),
      })),
      topSites: sitesResult.rows.map(row => ({
        siteId: row.site_id as string,
        siteName: (row.site_name || row.club_name) as string,
        alertCount: parseInt(row.alert_count as string, 10),
      })),
      trend: trendResult.rows.map(row => ({
        date: row.date as string,
        count: parseInt(row.count as string, 10),
        criticalCount: parseInt(row.critical_count as string, 10),
      })),
      totalActive: Object.values(bySeverity).reduce((a, b) => a + b, 0),
    };
  }

  // --------------------------------------------------------------------------
  // Alert Thresholds
  // --------------------------------------------------------------------------

  async getThresholds(enabledOnly = true): Promise<AlertThreshold[]> {
    const where = enabledOnly ? 'WHERE enabled = true' : '';
    const result = await query<AlertThreshold>(
      `SELECT * FROM alert_thresholds ${where} ORDER BY metric ASC`
    );
    return result.rows;
  }

  async getThresholdById(id: string): Promise<AlertThreshold | null> {
    const result = await query<AlertThreshold>(
      'SELECT * FROM alert_thresholds WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async createThreshold(data: Omit<AlertThreshold, 'id' | 'created_at'>): Promise<AlertThreshold> {
    const result = await query<AlertThreshold>(
      `INSERT INTO alert_thresholds (metric, operator, value, severity, cooldown_minutes, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.metric, data.operator, data.value, data.severity, data.cooldown_minutes, data.enabled]
    );
    return result.rows[0];
  }

  async updateThreshold(
    id: string,
    data: Partial<Omit<AlertThreshold, 'id' | 'created_at'>>
  ): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return;

    params.push(id);
    await query(
      `UPDATE alert_thresholds SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
  }
}

export const alertRepository = new AlertRepositoryImpl();
