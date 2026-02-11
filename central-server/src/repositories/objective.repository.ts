import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types specifiques
// --------------------------------------------------------------------------

export interface ClubObjectiveRow extends QueryResultRow {
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

export interface ObjectiveWithSiteRow extends ClubObjectiveRow {
  site_name: string;
}

export interface ObjectiveWithProgressRow extends ClubObjectiveRow {
  site_name?: string;
  latest_progress: Record<string, unknown> | null;
}

export interface ObjectiveProgressRow extends QueryResultRow {
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

export interface ObjectiveAlertRow extends QueryResultRow {
  id: string;
  objective_id: string;
  created_at: Date;
}

export interface ObjectiveStatsRow extends QueryResultRow {
  total: string;
  active: string;
  completed: string;
  paused: string;
}

export interface ObjectiveListFilters {
  site_id?: string;
  status?: string;
  priority?: string;
  metric_type?: string;
}

export interface CreateObjectiveInput {
  site_id: string;
  name: string;
  description: string | null;
  metric_type: string;
  target_value: number;
  target_period: string;
  priority: string;
  start_date: Date;
  end_date: Date | null;
  alert_on_at_risk: boolean;
  alert_on_achieved: boolean;
  at_risk_threshold: number;
  created_by: string | null;
}

export interface UpdateObjectiveInput {
  name?: string;
  description?: string;
  target_value?: number;
  priority?: string;
  end_date?: string | null;
  alert_on_at_risk?: boolean;
  alert_on_achieved?: boolean;
  at_risk_threshold?: number;
}

export interface CalculateProgressRow extends QueryResultRow {
  [key: string]: unknown;
}

export interface UpdateAllProgressRow extends QueryResultRow {
  update_all_objectives_progress: number;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class ObjectiveRepositoryImpl extends BaseRepository<ClubObjectiveRow> {
  constructor() {
    super('club_objectives');
  }

  /**
   * Liste les objectifs avec filtres dynamiques, JOIN sites + dernier progres.
   */
  async findWithFilters(filters: ObjectiveListFilters): Promise<ObjectiveWithProgressRow[]> {
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

    if (filters.site_id) {
      sql += ` AND o.site_id = $${paramIndex++}`;
      params.push(filters.site_id);
    }

    if (filters.status) {
      sql += ` AND o.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters.priority) {
      sql += ` AND o.priority = $${paramIndex++}`;
      params.push(filters.priority);
    }

    if (filters.metric_type) {
      sql += ` AND o.metric_type = $${paramIndex++}`;
      params.push(filters.metric_type);
    }

    sql += ` ORDER BY o.priority DESC, o.created_at DESC`;

    const result = await query<ObjectiveWithProgressRow>(sql, params);
    return result.rows;
  }

  /**
   * Recupere un objectif par ID avec le nom du site.
   */
  async findByIdWithSite(id: string): Promise<ObjectiveWithSiteRow | null> {
    const result = await query<ObjectiveWithSiteRow>(
      `SELECT o.*, s.name as site_name
       FROM club_objectives o
       JOIN sites s ON s.id = o.site_id
       WHERE o.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Verifie qu'un site existe.
   */
  async siteExists(siteId: string): Promise<boolean> {
    const result = await query(
      'SELECT id FROM sites WHERE id = $1',
      [siteId]
    );
    return result.rows.length > 0;
  }

  /**
   * Cree un nouvel objectif.
   */
  async create(input: CreateObjectiveInput): Promise<ClubObjectiveRow> {
    const result = await query<ClubObjectiveRow>(
      `INSERT INTO club_objectives
        (site_id, name, description, metric_type, target_value, target_period,
         priority, start_date, end_date, alert_on_at_risk, alert_on_achieved,
         at_risk_threshold, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        input.site_id,
        input.name,
        input.description,
        input.metric_type,
        input.target_value,
        input.target_period,
        input.priority,
        input.start_date,
        input.end_date,
        input.alert_on_at_risk,
        input.alert_on_achieved,
        input.at_risk_threshold,
        input.created_by,
      ]
    );
    return result.rows[0];
  }

  /**
   * Met a jour un objectif avec des champs dynamiques.
   */
  async updateFields(id: string, fields: UpdateObjectiveInput): Promise<ClubObjectiveRow | null> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (fields.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(fields.name);
    }
    if (fields.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(fields.description);
    }
    if (fields.target_value !== undefined) {
      updates.push(`target_value = $${paramIndex++}`);
      params.push(fields.target_value);
    }
    if (fields.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(fields.priority);
    }
    if (fields.end_date !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      params.push(fields.end_date);
    }
    if (fields.alert_on_at_risk !== undefined) {
      updates.push(`alert_on_at_risk = $${paramIndex++}`);
      params.push(fields.alert_on_at_risk);
    }
    if (fields.alert_on_achieved !== undefined) {
      updates.push(`alert_on_achieved = $${paramIndex++}`);
      params.push(fields.alert_on_achieved);
    }
    if (fields.at_risk_threshold !== undefined) {
      updates.push(`at_risk_threshold = $${paramIndex++}`);
      params.push(fields.at_risk_threshold);
    }

    if (updates.length === 0) {
      return null;
    }

    params.push(id);

    const result = await query<ClubObjectiveRow>(
      `UPDATE club_objectives SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  /**
   * Change le statut d'un objectif.
   */
  async updateStatus(id: string, status: string): Promise<ClubObjectiveRow | null> {
    const result = await query<ClubObjectiveRow>(
      `UPDATE club_objectives SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Supprime un objectif et retourne l'id supprime.
   */
  async deleteObjective(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM club_objectives WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows.length > 0;
  }

  /**
   * Recupere la progression d'un objectif.
   */
  async getProgress(objectiveId: string, limit: number): Promise<ObjectiveProgressRow[]> {
    const result = await query<ObjectiveProgressRow>(
      `SELECT * FROM club_objectives_progress
       WHERE objective_id = $1
       ORDER BY period_start DESC
       LIMIT $2`,
      [objectiveId, limit]
    );
    return result.rows;
  }

  /**
   * Calcule la progression actuelle d'un objectif via la fonction SQL.
   */
  async calculateProgress(id: string): Promise<CalculateProgressRow | null> {
    const result = await query<CalculateProgressRow>(
      'SELECT * FROM calculate_objective_progress($1)',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere les objectifs d'un site avec la derniere progression.
   */
  async findBySiteWithProgress(siteId: string, status?: string): Promise<ObjectiveWithProgressRow[]> {
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

    const result = await query<ObjectiveWithProgressRow>(sql, params);
    return result.rows;
  }

  /**
   * Stats globales des objectifs d'un site.
   */
  async getSiteStats(siteId: string): Promise<ObjectiveStatsRow> {
    const result = await query<ObjectiveStatsRow>(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'paused') as paused
       FROM club_objectives
       WHERE site_id = $1`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Objectifs actifs d'un site avec progression (pour le dashboard).
   */
  async findActiveBySiteWithProgress(siteId: string): Promise<ObjectiveWithProgressRow[]> {
    const result = await query<ObjectiveWithProgressRow>(
      `SELECT o.*,
              (SELECT row_to_json(p.*) FROM club_objectives_progress p
               WHERE p.objective_id = o.id
               ORDER BY p.period_start DESC LIMIT 1) as latest_progress
       FROM club_objectives o
       WHERE o.site_id = $1 AND o.status = 'active'
       ORDER BY o.priority DESC, o.created_at DESC`,
      [siteId]
    );
    return result.rows;
  }

  /**
   * Met a jour la progression de tous les objectifs actifs via la fonction SQL.
   */
  async updateAllProgress(): Promise<number> {
    const result = await query<UpdateAllProgressRow>(
      'SELECT update_all_objectives_progress()',
      []
    );
    return result.rows[0]?.update_all_objectives_progress || 0;
  }

  /**
   * Recupere les alertes d'un objectif.
   */
  async getAlerts(objectiveId: string, limit: number): Promise<ObjectiveAlertRow[]> {
    const result = await query<ObjectiveAlertRow>(
      `SELECT * FROM club_objective_alerts
       WHERE objective_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [objectiveId, limit]
    );
    return result.rows;
  }
}

export const objectiveRepository = new ObjectiveRepositoryImpl();
