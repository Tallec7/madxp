/**
 * Repository pour la gestion des programmations de playlists et playlists personnalisees.
 *
 * Tables: playlist_schedules, custom_playlists
 * Fonctions: get_active_playlist_rules()
 */

import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types — playlist_schedules
// --------------------------------------------------------------------------

export interface PlaylistScheduleRow extends QueryResultRow {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  content_category: string;
  custom_playlist_id: string | null;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  match_phase: string | null;
  event_type: string | null;
  priority: number;
  is_active: boolean;
  valid_from: Date | null;
  valid_until: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PlaylistScheduleWithJoins extends PlaylistScheduleRow {
  site_name: string;
  playlist_name: string | null;
}

export interface CreateScheduleInput {
  site_id: string;
  name: string;
  description: string | null;
  content_category: string;
  custom_playlist_id: string | null;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  match_phase: string | null;
  event_type: string | null;
  priority: number;
  is_active: boolean;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  created_by: string | null;
}

export interface UpdateScheduleFields {
  name?: string;
  description?: string | null;
  content_category?: string;
  custom_playlist_id?: string | null;
  start_time?: string;
  end_time?: string;
  days_of_week?: number[];
  match_phase?: string | null;
  event_type?: string | null;
  priority?: number;
  is_active?: boolean;
  valid_from?: Date | string | null;
  valid_until?: Date | string | null;
}

// --------------------------------------------------------------------------
// Types — custom_playlists
// --------------------------------------------------------------------------

export interface CustomPlaylistRow extends QueryResultRow {
  id: string;
  site_id: string | null;
  name: string;
  description: string | null;
  video_ids: string[];
  loop_mode: string;
  transition_duration: number;
  is_public: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CustomPlaylistWithJoins extends CustomPlaylistRow {
  site_name: string | null;
  video_count: number | null;
}

export interface CreateCustomPlaylistInput {
  site_id: string | null;
  name: string;
  description: string | null;
  video_ids: string[];
  loop_mode: string;
  transition_duration: number;
  is_public: boolean;
  created_by: string | null;
}

export interface UpdateCustomPlaylistFields {
  name?: string;
  description?: string | null;
  video_ids?: string[];
  loop_mode?: string;
  transition_duration?: number;
  is_public?: boolean;
}

// --------------------------------------------------------------------------
// Types — active rules
// --------------------------------------------------------------------------

export interface ActivePlaylistRuleRow extends QueryResultRow {
  [key: string]: unknown;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class PlaylistScheduleRepositoryImpl extends BaseRepository<PlaylistScheduleRow> {
  constructor() {
    super('playlist_schedules');
  }

  // ========================================================================
  // Playlist Schedules
  // ========================================================================

  /**
   * Liste les programmations d'un site avec JOINs sites et custom_playlists.
   */
  async findBySite(siteId: string, activeOnly: boolean): Promise<PlaylistScheduleWithJoins[]> {
    let sql = `
      SELECT ps.*, s.name as site_name,
             cp.name as playlist_name
      FROM playlist_schedules ps
      JOIN sites s ON s.id = ps.site_id
      LEFT JOIN custom_playlists cp ON cp.id = ps.custom_playlist_id
      WHERE ps.site_id = $1
    `;
    const params: unknown[] = [siteId];

    if (activeOnly) {
      sql += ` AND ps.is_active = true`;
    }

    sql += ` ORDER BY ps.priority DESC, ps.start_time`;

    const result = await query<PlaylistScheduleWithJoins>(sql, params);
    return result.rows;
  }

  /**
   * Recupere une programmation par ID avec JOINs.
   */
  async findByIdWithJoins(id: string): Promise<PlaylistScheduleWithJoins | null> {
    const result = await query<PlaylistScheduleWithJoins>(
      `SELECT ps.*, s.name as site_name, cp.name as playlist_name
       FROM playlist_schedules ps
       JOIN sites s ON s.id = ps.site_id
       LEFT JOIN custom_playlists cp ON cp.id = ps.custom_playlist_id
       WHERE ps.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Verifie si un site existe.
   */
  async siteExists(siteId: string): Promise<boolean> {
    const result = await query('SELECT id FROM sites WHERE id = $1', [siteId]);
    return result.rows.length > 0;
  }

  /**
   * Verifie si une playlist personnalisee existe.
   */
  async customPlaylistExists(playlistId: string): Promise<boolean> {
    const result = await query('SELECT id FROM custom_playlists WHERE id = $1', [playlistId]);
    return result.rows.length > 0;
  }

  /**
   * Cree une nouvelle programmation.
   */
  async createSchedule(input: CreateScheduleInput): Promise<PlaylistScheduleRow> {
    const result = await query<PlaylistScheduleRow>(
      `INSERT INTO playlist_schedules
        (site_id, name, description, content_category, custom_playlist_id,
         start_time, end_time, days_of_week, match_phase, event_type,
         priority, is_active, valid_from, valid_until, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        input.site_id,
        input.name,
        input.description,
        input.content_category,
        input.custom_playlist_id,
        input.start_time,
        input.end_time,
        input.days_of_week,
        input.match_phase,
        input.event_type,
        input.priority,
        input.is_active,
        input.valid_from,
        input.valid_until,
        input.created_by,
      ]
    );
    return result.rows[0];
  }

  /**
   * Met a jour une programmation dynamiquement.
   * Retourne la ligne mise a jour ou null si non trouvee.
   */
  async updateSchedule(
    id: string,
    fields: UpdateScheduleFields
  ): Promise<PlaylistScheduleRow | null> {
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
    if (fields.content_category !== undefined) {
      updates.push(`content_category = $${paramIndex++}`);
      params.push(fields.content_category);
    }
    if (fields.custom_playlist_id !== undefined) {
      updates.push(`custom_playlist_id = $${paramIndex++}`);
      params.push(fields.custom_playlist_id);
    }
    if (fields.start_time !== undefined) {
      updates.push(`start_time = $${paramIndex++}`);
      params.push(fields.start_time);
    }
    if (fields.end_time !== undefined) {
      updates.push(`end_time = $${paramIndex++}`);
      params.push(fields.end_time);
    }
    if (fields.days_of_week !== undefined) {
      updates.push(`days_of_week = $${paramIndex++}`);
      params.push(fields.days_of_week);
    }
    if (fields.match_phase !== undefined) {
      updates.push(`match_phase = $${paramIndex++}`);
      params.push(fields.match_phase);
    }
    if (fields.event_type !== undefined) {
      updates.push(`event_type = $${paramIndex++}`);
      params.push(fields.event_type);
    }
    if (fields.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(fields.priority);
    }
    if (fields.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(fields.is_active);
    }
    if (fields.valid_from !== undefined) {
      updates.push(`valid_from = $${paramIndex++}`);
      params.push(fields.valid_from);
    }
    if (fields.valid_until !== undefined) {
      updates.push(`valid_until = $${paramIndex++}`);
      params.push(fields.valid_until);
    }

    if (updates.length === 0) {
      return null;
    }

    params.push(id);

    const result = await query<PlaylistScheduleRow>(
      `UPDATE playlist_schedules SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  /**
   * Supprime une programmation. Retourne true si trouvee et supprimee.
   */
  async deleteSchedule(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM playlist_schedules WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows.length > 0;
  }

  /**
   * Recupere les regles actives pour un site a un moment donne
   * via la fonction PostgreSQL get_active_playlist_rules().
   */
  async getActiveRules(
    siteId: string,
    time: string | null,
    day: number | null,
    matchPhase: string | null
  ): Promise<ActivePlaylistRuleRow[]> {
    const result = await query<ActivePlaylistRuleRow>(
      `SELECT * FROM get_active_playlist_rules($1, $2::TIME, $3::INTEGER, $4)`,
      [siteId, time, day, matchPhase]
    );
    return result.rows;
  }

  // ========================================================================
  // Custom Playlists
  // ========================================================================

  /**
   * Liste les playlists personnalisees d'un site (+ publiques).
   */
  async findCustomPlaylistsBySite(siteId: string): Promise<CustomPlaylistWithJoins[]> {
    const result = await query<CustomPlaylistWithJoins>(
      `SELECT cp.*, s.name as site_name,
              array_length(cp.video_ids, 1) as video_count
       FROM custom_playlists cp
       LEFT JOIN sites s ON s.id = cp.site_id
       WHERE cp.site_id = $1 OR (cp.is_public = true AND cp.site_id IS NULL)
       ORDER BY cp.name`,
      [siteId]
    );
    return result.rows;
  }

  /**
   * Cree une playlist personnalisee.
   */
  async createCustomPlaylist(input: CreateCustomPlaylistInput): Promise<CustomPlaylistRow> {
    const result = await query<CustomPlaylistRow>(
      `INSERT INTO custom_playlists
        (site_id, name, description, video_ids, loop_mode, transition_duration, is_public, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.site_id,
        input.name,
        input.description,
        input.video_ids,
        input.loop_mode,
        input.transition_duration,
        input.is_public,
        input.created_by,
      ]
    );
    return result.rows[0];
  }

  /**
   * Met a jour une playlist personnalisee dynamiquement.
   * Retourne la ligne mise a jour ou null si non trouvee.
   */
  async updateCustomPlaylist(
    id: string,
    fields: UpdateCustomPlaylistFields
  ): Promise<CustomPlaylistRow | null> {
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
    if (fields.video_ids !== undefined) {
      updates.push(`video_ids = $${paramIndex++}`);
      params.push(fields.video_ids);
    }
    if (fields.loop_mode !== undefined) {
      updates.push(`loop_mode = $${paramIndex++}`);
      params.push(fields.loop_mode);
    }
    if (fields.transition_duration !== undefined) {
      updates.push(`transition_duration = $${paramIndex++}`);
      params.push(fields.transition_duration);
    }
    if (fields.is_public !== undefined) {
      updates.push(`is_public = $${paramIndex++}`);
      params.push(fields.is_public);
    }

    if (updates.length === 0) {
      return null;
    }

    params.push(id);

    const result = await query<CustomPlaylistRow>(
      `UPDATE custom_playlists SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  /**
   * Supprime une playlist personnalisee. Retourne true si trouvee et supprimee.
   */
  async deleteCustomPlaylist(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM custom_playlists WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows.length > 0;
  }
}

export const playlistScheduleRepository = new PlaylistScheduleRepositoryImpl();
