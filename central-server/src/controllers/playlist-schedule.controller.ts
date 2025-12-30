/**
 * Controller pour la gestion des programmations de playlists
 */

import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';
import { AuthRequest } from '../types';

// Types
interface PlaylistSchedule {
  [key: string]: unknown;
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

// Constantes
const VALID_CATEGORIES = ['sponsor', 'jingle', 'ambiance', 'other', 'custom'];
const VALID_PHASES = ['before', 'during', 'after', 'all'];
const VALID_EVENT_TYPES = ['match', 'training', 'tournament', 'all'];

/**
 * Liste les programmations d'un site
 */
export const listSchedules = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { active_only } = req.query;

    let sql = `
      SELECT ps.*, s.name as site_name,
             cp.name as playlist_name
      FROM playlist_schedules ps
      JOIN sites s ON s.id = ps.site_id
      LEFT JOIN custom_playlists cp ON cp.id = ps.custom_playlist_id
      WHERE ps.site_id = $1
    `;
    const params: unknown[] = [siteId];

    if (active_only === 'true') {
      sql += ` AND ps.is_active = true`;
    }

    sql += ` ORDER BY ps.priority DESC, ps.start_time`;

    const result = await query(sql, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error listing playlist schedules:', error);
    res.status(500).json({ success: false, error: 'Failed to list playlist schedules' });
  }
};

/**
 * Récupère une programmation par ID
 */
export const getSchedule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT ps.*, s.name as site_name, cp.name as playlist_name
       FROM playlist_schedules ps
       JOIN sites s ON s.id = ps.site_id
       LEFT JOIN custom_playlists cp ON cp.id = ps.custom_playlist_id
       WHERE ps.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error getting playlist schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to get playlist schedule' });
  }
};

/**
 * Crée une nouvelle programmation
 */
export const createSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const {
      site_id,
      name,
      description,
      content_category,
      custom_playlist_id,
      start_time,
      end_time,
      days_of_week,
      match_phase,
      event_type,
      priority,
      is_active,
      valid_from,
      valid_until,
    } = req.body;

    // Validation
    if (!site_id || !name || !content_category || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: site_id, name, content_category, start_time, end_time',
      });
    }

    if (!VALID_CATEGORIES.includes(content_category)) {
      return res.status(400).json({
        success: false,
        error: `Invalid content_category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    if (match_phase && !VALID_PHASES.includes(match_phase)) {
      return res.status(400).json({
        success: false,
        error: `Invalid match_phase. Must be one of: ${VALID_PHASES.join(', ')}`,
      });
    }

    if (event_type && !VALID_EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid event_type. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
      });
    }

    // Vérifier le site
    const siteCheck = await query('SELECT id FROM sites WHERE id = $1', [site_id]);
    if (siteCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    // Vérifier la playlist custom si spécifiée
    if (content_category === 'custom' && custom_playlist_id) {
      const playlistCheck = await query('SELECT id FROM custom_playlists WHERE id = $1', [custom_playlist_id]);
      if (playlistCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Custom playlist not found' });
      }
    }

    const result = await query<PlaylistSchedule>(
      `INSERT INTO playlist_schedules
        (site_id, name, description, content_category, custom_playlist_id,
         start_time, end_time, days_of_week, match_phase, event_type,
         priority, is_active, valid_from, valid_until, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        site_id,
        name,
        description || null,
        content_category,
        custom_playlist_id || null,
        start_time,
        end_time,
        days_of_week || [0, 1, 2, 3, 4, 5, 6],
        match_phase || null,
        event_type || null,
        priority || 50,
        is_active !== false,
        valid_from || null,
        valid_until || null,
        req.user?.id || null,
      ]
    );

    logger.info('Playlist schedule created', {
      scheduleId: result.rows[0].id,
      siteId: site_id,
      createdBy: req.user?.email,
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating playlist schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to create playlist schedule' });
  }
};

/**
 * Met à jour une programmation
 */
export const updateSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      content_category,
      custom_playlist_id,
      start_time,
      end_time,
      days_of_week,
      match_phase,
      event_type,
      priority,
      is_active,
      valid_from,
      valid_until,
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
    if (content_category !== undefined) {
      if (!VALID_CATEGORIES.includes(content_category)) {
        return res.status(400).json({
          success: false,
          error: `Invalid content_category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        });
      }
      updates.push(`content_category = $${paramIndex++}`);
      params.push(content_category);
    }
    if (custom_playlist_id !== undefined) {
      updates.push(`custom_playlist_id = $${paramIndex++}`);
      params.push(custom_playlist_id);
    }
    if (start_time !== undefined) {
      updates.push(`start_time = $${paramIndex++}`);
      params.push(start_time);
    }
    if (end_time !== undefined) {
      updates.push(`end_time = $${paramIndex++}`);
      params.push(end_time);
    }
    if (days_of_week !== undefined) {
      updates.push(`days_of_week = $${paramIndex++}`);
      params.push(days_of_week);
    }
    if (match_phase !== undefined) {
      if (match_phase && !VALID_PHASES.includes(match_phase)) {
        return res.status(400).json({
          success: false,
          error: `Invalid match_phase. Must be one of: ${VALID_PHASES.join(', ')}`,
        });
      }
      updates.push(`match_phase = $${paramIndex++}`);
      params.push(match_phase);
    }
    if (event_type !== undefined) {
      updates.push(`event_type = $${paramIndex++}`);
      params.push(event_type);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }
    if (valid_from !== undefined) {
      updates.push(`valid_from = $${paramIndex++}`);
      params.push(valid_from);
    }
    if (valid_until !== undefined) {
      updates.push(`valid_until = $${paramIndex++}`);
      params.push(valid_until);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id);

    const result = await query(
      `UPDATE playlist_schedules SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    logger.info('Playlist schedule updated', { scheduleId: id, updatedBy: req.user?.email });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating playlist schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to update playlist schedule' });
  }
};

/**
 * Supprime une programmation
 */
export const deleteSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM playlist_schedules WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    logger.info('Playlist schedule deleted', { scheduleId: id, deletedBy: req.user?.email });

    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    logger.error('Error deleting playlist schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to delete playlist schedule' });
  }
};

/**
 * Récupère les règles actives pour un site à un moment donné
 */
export const getActiveRules = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { time, day, match_phase } = req.query;

    const result = await query(
      `SELECT * FROM get_active_playlist_rules($1, $2::TIME, $3::INTEGER, $4)`,
      [
        siteId,
        time || null,
        day !== undefined ? parseInt(day as string) : null,
        match_phase || null,
      ]
    );

    res.json({
      success: true,
      data: result.rows,
      context: {
        site_id: siteId,
        time: time || 'current',
        day: day !== undefined ? parseInt(day as string) : new Date().getDay(),
        match_phase: match_phase || null,
      },
    });
  } catch (error) {
    logger.error('Error getting active playlist rules:', error);
    res.status(500).json({ success: false, error: 'Failed to get active playlist rules' });
  }
};

// ================== Custom Playlists ==================

/**
 * Liste les playlists personnalisées
 */
export const listCustomPlaylists = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    const result = await query(
      `SELECT cp.*, s.name as site_name,
              array_length(cp.video_ids, 1) as video_count
       FROM custom_playlists cp
       LEFT JOIN sites s ON s.id = cp.site_id
       WHERE cp.site_id = $1 OR (cp.is_public = true AND cp.site_id IS NULL)
       ORDER BY cp.name`,
      [siteId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error listing custom playlists:', error);
    res.status(500).json({ success: false, error: 'Failed to list custom playlists' });
  }
};

/**
 * Crée une playlist personnalisée
 */
export const createCustomPlaylist = async (req: AuthRequest, res: Response) => {
  try {
    const {
      site_id,
      name,
      description,
      video_ids,
      loop_mode,
      transition_duration,
      is_public,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const result = await query(
      `INSERT INTO custom_playlists
        (site_id, name, description, video_ids, loop_mode, transition_duration, is_public, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        site_id || null,
        name,
        description || null,
        video_ids || [],
        loop_mode || 'sequential',
        transition_duration || 0,
        is_public || false,
        req.user?.id || null,
      ]
    );

    logger.info('Custom playlist created', {
      playlistId: result.rows[0].id,
      siteId: site_id,
      createdBy: req.user?.email,
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating custom playlist:', error);
    res.status(500).json({ success: false, error: 'Failed to create custom playlist' });
  }
};

/**
 * Met à jour une playlist personnalisée
 */
export const updateCustomPlaylist = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, video_ids, loop_mode, transition_duration, is_public } = req.body;

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
    if (video_ids !== undefined) {
      updates.push(`video_ids = $${paramIndex++}`);
      params.push(video_ids);
    }
    if (loop_mode !== undefined) {
      updates.push(`loop_mode = $${paramIndex++}`);
      params.push(loop_mode);
    }
    if (transition_duration !== undefined) {
      updates.push(`transition_duration = $${paramIndex++}`);
      params.push(transition_duration);
    }
    if (is_public !== undefined) {
      updates.push(`is_public = $${paramIndex++}`);
      params.push(is_public);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id);

    const result = await query(
      `UPDATE custom_playlists SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating custom playlist:', error);
    res.status(500).json({ success: false, error: 'Failed to update custom playlist' });
  }
};

/**
 * Supprime une playlist personnalisée
 */
export const deleteCustomPlaylist = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM custom_playlists WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    res.json({ success: true, message: 'Playlist deleted' });
  } catch (error) {
    logger.error('Error deleting custom playlist:', error);
    res.status(500).json({ success: false, error: 'Failed to delete custom playlist' });
  }
};
