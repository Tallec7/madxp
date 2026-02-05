/**
 * Alerts Controller
 *
 * Gère les endpoints pour les alertes système et prédictives
 */

import { Response } from 'express';
import { AuthRequest } from '../types';
import { query } from '../config/database';
import logger from '../config/logger';

interface AlertFilters {
  type?: string;
  active?: boolean;
  severity?: 'warning' | 'critical';
  siteId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Liste les alertes avec filtres
 */
export const listAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const {
      type,
      active,
      severity,
      siteId,
      limit = 50,
      offset = 0,
    } = req.query;

    // Build dynamic query
    const conditions: string[] = [];
    const params: (string | number | boolean)[] = [];
    let paramIndex = 1;

    // Filter by predictive type (metric starts with specific patterns)
    // Note: column is alert_type, not type
    if (type === 'predictive') {
      conditions.push(`(
        a.alert_type LIKE '%[PRÉD]%'
        OR a.alert_type IN (
          'days_since_last_video',
          'disk_growth_rate',
          'disconnections_24h',
          'wifi_signal_quality',
          'video_errors_24h',
          'temperature_trend',
          'hotspot_restarts_24h',
          'days_until_subscription_end'
        )
      )`);
    } else if (type) {
      conditions.push(`a.alert_type = $${paramIndex++}`);
      params.push(String(type));
    }

    // Note: column is status, not is_active
    if (active === 'true') {
      conditions.push(`a.status = 'active'`);
    } else if (active === 'false') {
      conditions.push(`a.status IN ('acknowledged', 'resolved')`);
    }

    if (severity) {
      conditions.push(`a.severity = $${paramIndex++}`);
      params.push(String(severity));
    }

    if (siteId) {
      conditions.push(`a.site_id = $${paramIndex++}`);
      params.push(String(siteId));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get alerts with site name
    // Note: column is alert_type not type, status not is_active, no updated_at column
    const result = await query(`
      SELECT
        a.id,
        a.site_id,
        s.site_name,
        s.club_name,
        a.alert_type as type,
        a.severity,
        a.message,
        a.metadata,
        a.created_at,
        a.resolved_at,
        a.status
      FROM alerts a
      LEFT JOIN sites s ON s.id = a.site_id
      ${whereClause}
      ORDER BY
        CASE WHEN a.severity = 'critical' THEN 0 ELSE 1 END,
        a.created_at DESC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}
    `, [...params, Number(limit), Number(offset)]);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM alerts a
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total as string, 10);

    return res.json({
      success: true,
      alerts: result.rows.map(row => ({
        id: row.id,
        site_id: row.site_id,
        site_name: row.site_name || row.club_name,
        type: row.type,
        severity: row.severity,
        message: row.message,
        metadata: row.metadata,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
        is_active: row.status === 'active',
      })),
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    logger.error('Error listing alerts:', error);
    return res.status(500).json({ error: 'Failed to list alerts' });
  }
};

/**
 * Récupère les statistiques des alertes
 */
export const getAlertStats = async (_req: AuthRequest, res: Response) => {
  try {
    // Count by severity (use status = 'active' instead of is_active)
    const severityResult = await query(`
      SELECT
        severity,
        COUNT(*) as count
      FROM alerts
      WHERE status = 'active'
      GROUP BY severity
    `);

    // Count by type (top 10) - use alert_type instead of type
    const typeResult = await query(`
      SELECT
        alert_type as type,
        COUNT(*) as count
      FROM alerts
      WHERE status = 'active'
      GROUP BY alert_type
      ORDER BY count DESC
      LIMIT 10
    `);

    // Sites with most alerts
    const sitesResult = await query(`
      SELECT
        a.site_id,
        s.site_name,
        s.club_name,
        COUNT(*) as alert_count
      FROM alerts a
      LEFT JOIN sites s ON s.id = a.site_id
      WHERE a.status = 'active'
      GROUP BY a.site_id, s.site_name, s.club_name
      ORDER BY alert_count DESC
      LIMIT 10
    `);

    // Recent trend (last 7 days)
    const trendResult = await query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_count
      FROM alerts
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    const severityStats: Record<string, number> = {};
    for (const row of severityResult.rows) {
      severityStats[row.severity as string] = parseInt(row.count as string, 10);
    }

    return res.json({
      success: true,
      data: {
        bySeverity: severityStats,
        byType: typeResult.rows.map(row => ({
          type: row.type,
          count: parseInt(row.count as string, 10),
        })),
        topSites: sitesResult.rows.map(row => ({
          siteId: row.site_id,
          siteName: row.site_name || row.club_name,
          alertCount: parseInt(row.alert_count as string, 10),
        })),
        trend: trendResult.rows.map(row => ({
          date: row.date,
          count: parseInt(row.count as string, 10),
          criticalCount: parseInt(row.critical_count as string, 10),
        })),
        totalActive: Object.values(severityStats).reduce((a, b) => a + b, 0),
      },
    });
  } catch (error) {
    logger.error('Error getting alert stats:', error);
    return res.status(500).json({ error: 'Failed to get alert stats' });
  }
};

/**
 * Résout une alerte
 */
export const resolveAlert = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Note: no resolved_by column in the table, using status instead of is_active

    const result = await query(`
      UPDATE alerts
      SET
        status = 'resolved',
        resolved_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    logger.info('[Alerts] Alert resolved', {
      alertId: id,
      resolvedBy: req.user?.email,
    });

    return res.json({
      success: true,
      alert: result.rows[0],
    });
  } catch (error) {
    logger.error('Error resolving alert:', error);
    return res.status(500).json({ error: 'Failed to resolve alert' });
  }
};

/**
 * Résout toutes les alertes d'un site
 */
export const resolveSiteAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    // Note: no resolved_by column, using status instead of is_active

    const result = await query(`
      UPDATE alerts
      SET
        status = 'resolved',
        resolved_at = NOW()
      WHERE site_id = $1 AND status = 'active'
    `, [siteId]);

    logger.info('[Alerts] Site alerts resolved', {
      siteId,
      count: result.rowCount,
      resolvedBy: req.user?.email,
    });

    return res.json({
      success: true,
      resolvedCount: result.rowCount,
    });
  } catch (error) {
    logger.error('Error resolving site alerts:', error);
    return res.status(500).json({ error: 'Failed to resolve site alerts' });
  }
};
