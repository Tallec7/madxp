/**
 * Controller pour la gestion des objectifs clubs
 */

import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';
import { AuthRequest } from '../types';

// Types
interface ClubObjective {
  [key: string]: unknown;  // Index signature for QueryResultRow compatibility
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  metric_type: string;
  target_value: number;
  target_period: 'daily' | 'weekly' | 'monthly';
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  start_date: Date;
  end_date: Date | null;
  alert_on_at_risk: boolean;
  alert_on_achieved: boolean;
  at_risk_threshold: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ObjectiveProgress {
  [key: string]: unknown;  // Index signature for QueryResultRow compatibility
  id: string;
  objective_id: string;
  period_start: Date;
  period_end: Date;
  current_value: number;
  target_value: number;
  progress_percent: number;
  status: 'in_progress' | 'on_track' | 'at_risk' | 'achieved' | 'missed';
  calculated_at: Date;
}

// Constantes
const VALID_METRIC_TYPES = [
  'screen_time_seconds',
  'videos_played',
  'sessions_count',
  'manual_triggers',
  'sponsor_plays',
  'uptime_percent',
  'avg_videos_per_session',
];

const VALID_PERIODS = ['daily', 'weekly', 'monthly'];
const VALID_STATUSES = ['active', 'paused', 'completed', 'cancelled'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

/**
 * Liste tous les objectifs (avec filtres optionnels)
 */
export const listObjectives = async (req: AuthRequest, res: Response) => {
  try {
    const { site_id, status, priority, metric_type } = req.query;

    let sql = `
      SELECT o.*, s.name as site_name,
             (SELECT row_to_json(p.*) FROM club_objectives_progress p
              WHERE p.objective_id = o.id
              ORDER BY p.period_start DESC LIMIT 1) as latest_progress
      FROM club_objectives o
      JOIN sites s ON s.id = o.site_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (site_id) {
      sql += ` AND o.site_id = $${paramIndex++}`;
      params.push(site_id);
    }

    if (status) {
      sql += ` AND o.status = $${paramIndex++}`;
      params.push(status);
    }

    if (priority) {
      sql += ` AND o.priority = $${paramIndex++}`;
      params.push(priority);
    }

    if (metric_type) {
      sql += ` AND o.metric_type = $${paramIndex++}`;
      params.push(metric_type);
    }

    sql += ` ORDER BY o.priority DESC, o.created_at DESC`;

    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    logger.error('Error listing objectives:', error);
    res.status(500).json({ success: false, error: 'Failed to list objectives' });
  }
};

/**
 * Récupère un objectif par ID
 */
export const getObjective = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT o.*, s.name as site_name
       FROM club_objectives o
       JOIN sites s ON s.id = o.site_id
       WHERE o.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Objective not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error getting objective:', error);
    res.status(500).json({ success: false, error: 'Failed to get objective' });
  }
};

/**
 * Crée un nouvel objectif
 */
export const createObjective = async (req: AuthRequest, res: Response) => {
  try {
    const {
      site_id,
      name,
      description,
      metric_type,
      target_value,
      target_period,
      priority,
      start_date,
      end_date,
      alert_on_at_risk,
      alert_on_achieved,
      at_risk_threshold,
    } = req.body;

    // Validation
    if (!site_id || !name || !metric_type || !target_value || !target_period) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: site_id, name, metric_type, target_value, target_period',
      });
    }

    if (!VALID_METRIC_TYPES.includes(metric_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid metric_type. Must be one of: ${VALID_METRIC_TYPES.join(', ')}`,
      });
    }

    if (!VALID_PERIODS.includes(target_period)) {
      return res.status(400).json({
        success: false,
        error: `Invalid target_period. Must be one of: ${VALID_PERIODS.join(', ')}`,
      });
    }

    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        success: false,
        error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
      });
    }

    // Vérifier que le site existe
    const siteCheck = await query('SELECT id FROM sites WHERE id = $1', [site_id]);
    if (siteCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    const result = await query<ClubObjective>(
      `INSERT INTO club_objectives
        (site_id, name, description, metric_type, target_value, target_period,
         priority, start_date, end_date, alert_on_at_risk, alert_on_achieved,
         at_risk_threshold, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        site_id,
        name,
        description || null,
        metric_type,
        target_value,
        target_period,
        priority || 'medium',
        start_date || new Date(),
        end_date || null,
        alert_on_at_risk !== false,
        alert_on_achieved !== false,
        at_risk_threshold || 50,
        req.user?.id || null,
      ]
    );

    logger.info('Objective created', {
      objectiveId: result.rows[0].id,
      siteId: site_id,
      createdBy: req.user?.email,
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating objective:', error);
    res.status(500).json({ success: false, error: 'Failed to create objective' });
  }
};

/**
 * Met à jour un objectif
 */
export const updateObjective = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      target_value,
      priority,
      end_date,
      alert_on_at_risk,
      alert_on_achieved,
      at_risk_threshold,
    } = req.body;

    // Construire la requête de mise à jour dynamiquement
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (target_value !== undefined) {
      updates.push(`target_value = $${paramIndex++}`);
      params.push(target_value);
    }
    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({
          success: false,
          error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
        });
      }
      updates.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }
    if (end_date !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      params.push(end_date);
    }
    if (alert_on_at_risk !== undefined) {
      updates.push(`alert_on_at_risk = $${paramIndex++}`);
      params.push(alert_on_at_risk);
    }
    if (alert_on_achieved !== undefined) {
      updates.push(`alert_on_achieved = $${paramIndex++}`);
      params.push(alert_on_achieved);
    }
    if (at_risk_threshold !== undefined) {
      updates.push(`at_risk_threshold = $${paramIndex++}`);
      params.push(at_risk_threshold);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id);

    const result = await query(
      `UPDATE club_objectives SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Objective not found' });
    }

    logger.info('Objective updated', { objectiveId: id, updatedBy: req.user?.email });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating objective:', error);
    res.status(500).json({ success: false, error: 'Failed to update objective' });
  }
};

/**
 * Change le statut d'un objectif
 */
export const updateObjectiveStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const result = await query(
      `UPDATE club_objectives SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Objective not found' });
    }

    logger.info('Objective status updated', { objectiveId: id, status, updatedBy: req.user?.email });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating objective status:', error);
    res.status(500).json({ success: false, error: 'Failed to update objective status' });
  }
};

/**
 * Supprime un objectif
 */
export const deleteObjective = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM club_objectives WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Objective not found' });
    }

    logger.info('Objective deleted', { objectiveId: id, deletedBy: req.user?.email });

    res.json({ success: true, message: 'Objective deleted' });
  } catch (error) {
    logger.error('Error deleting objective:', error);
    res.status(500).json({ success: false, error: 'Failed to delete objective' });
  }
};

/**
 * Récupère la progression d'un objectif
 */
export const getObjectiveProgress = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;

    const result = await query<ObjectiveProgress>(
      `SELECT * FROM club_objectives_progress
       WHERE objective_id = $1
       ORDER BY period_start DESC
       LIMIT $2`,
      [id, Math.min(parseInt(limit as string) || 30, 100)]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error getting objective progress:', error);
    res.status(500).json({ success: false, error: 'Failed to get objective progress' });
  }
};

/**
 * Calcule la progression actuelle d'un objectif
 */
export const calculateProgress = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM calculate_objective_progress($1)',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Objective not found or no data' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error calculating objective progress:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate objective progress' });
  }
};

/**
 * Récupère les objectifs d'un site spécifique avec leur progression
 */
export const getSiteObjectives = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { status } = req.query;

    let sql = `
      SELECT o.*,
             (SELECT row_to_json(p.*) FROM club_objectives_progress p
              WHERE p.objective_id = o.id
              ORDER BY p.period_start DESC LIMIT 1) as latest_progress
      FROM club_objectives o
      WHERE o.site_id = $1
    `;
    const params: unknown[] = [siteId];

    if (status) {
      sql += ` AND o.status = $2`;
      params.push(status);
    }

    sql += ` ORDER BY o.priority DESC, o.created_at DESC`;

    const result = await query(sql, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error getting site objectives:', error);
    res.status(500).json({ success: false, error: 'Failed to get site objectives' });
  }
};

/**
 * Dashboard des objectifs d'un site
 */
export const getSiteObjectivesDashboard = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;

    // Stats globales
    const statsResult = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'paused') as paused
       FROM club_objectives
       WHERE site_id = $1`,
      [siteId]
    );

    // Objectifs actifs avec progression
    const objectivesResult = await query(
      `SELECT o.*,
              (SELECT row_to_json(p.*) FROM club_objectives_progress p
               WHERE p.objective_id = o.id
               ORDER BY p.period_start DESC LIMIT 1) as latest_progress
       FROM club_objectives o
       WHERE o.site_id = $1 AND o.status = 'active'
       ORDER BY o.priority DESC, o.created_at DESC`,
      [siteId]
    );

    // Calculer les stats de progression
    const objectives = objectivesResult.rows;
    const atRisk = objectives.filter((o: any) => o.latest_progress?.status === 'at_risk').length;
    const onTrack = objectives.filter((o: any) => o.latest_progress?.status === 'on_track').length;
    const achieved = objectives.filter((o: any) => o.latest_progress?.status === 'achieved').length;

    res.json({
      success: true,
      data: {
        stats: {
          ...statsResult.rows[0],
          at_risk: atRisk,
          on_track: onTrack,
          achieved_current: achieved,
        },
        objectives,
      },
    });
  } catch (error) {
    logger.error('Error getting site objectives dashboard:', error);
    res.status(500).json({ success: false, error: 'Failed to get site objectives dashboard' });
  }
};

/**
 * Met à jour la progression de tous les objectifs actifs
 */
export const updateAllProgress = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query<{ update_all_objectives_progress: number }>(
      'SELECT update_all_objectives_progress()',
      []
    );

    const count = result.rows[0]?.update_all_objectives_progress || 0;

    logger.info('All objectives progress updated', { count, triggeredBy: req.user?.email });

    res.json({
      success: true,
      message: `Updated progress for ${count} objectives`,
      count,
    });
  } catch (error) {
    logger.error('Error updating all objectives progress:', error);
    res.status(500).json({ success: false, error: 'Failed to update objectives progress' });
  }
};

/**
 * Récupère les alertes d'un objectif
 */
export const getObjectiveAlerts = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;

    const result = await query(
      `SELECT * FROM club_objective_alerts
       WHERE objective_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, Math.min(parseInt(limit as string) || 20, 100)]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error getting objective alerts:', error);
    res.status(500).json({ success: false, error: 'Failed to get objective alerts' });
  }
};
