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
   * Resout une alerte.
   */
  async resolve(id: string): Promise<void> {
    await query(
      `UPDATE alerts SET status = 'resolved', resolved_at = NOW() WHERE id = $1`,
      [id]
    );
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
