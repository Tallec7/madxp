/**
 * Controller pour la gestion des programmations de playlists
 */

import { Request, Response } from 'express';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { playlistScheduleRepository } from '../repositories';

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

    const data = await playlistScheduleRepository.findBySite(siteId, active_only === 'true');

    res.json({ success: true, data });
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

    const schedule = await playlistScheduleRepository.findByIdWithJoins(id);

    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    res.json({ success: true, data: schedule });
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
    const siteFound = await playlistScheduleRepository.siteExists(site_id);
    if (!siteFound) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    // Vérifier la playlist custom si spécifiée
    if (content_category === 'custom' && custom_playlist_id) {
      const playlistFound = await playlistScheduleRepository.customPlaylistExists(custom_playlist_id);
      if (!playlistFound) {
        return res.status(404).json({ success: false, error: 'Custom playlist not found' });
      }
    }

    const created = await playlistScheduleRepository.createSchedule({
      site_id,
      name,
      description: description || null,
      content_category,
      custom_playlist_id: custom_playlist_id || null,
      start_time,
      end_time,
      days_of_week: days_of_week || [0, 1, 2, 3, 4, 5, 6],
      match_phase: match_phase || null,
      event_type: event_type || null,
      priority: priority || 50,
      is_active: is_active !== false,
      valid_from: valid_from || null,
      valid_until: valid_until || null,
      created_by: req.user?.id || null,
    });

    logger.info('Playlist schedule created', {
      scheduleId: created.id,
      siteId: site_id,
      createdBy: req.user?.email,
    });

    res.status(201).json({ success: true, data: created });
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

    // Validation des champs enum avant de passer au repository
    if (content_category !== undefined && !VALID_CATEGORIES.includes(content_category)) {
      return res.status(400).json({
        success: false,
        error: `Invalid content_category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    if (match_phase !== undefined && match_phase && !VALID_PHASES.includes(match_phase)) {
      return res.status(400).json({
        success: false,
        error: `Invalid match_phase. Must be one of: ${VALID_PHASES.join(', ')}`,
      });
    }

    if (event_type !== undefined && !VALID_EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid event_type. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
      });
    }

    // Construire l'objet de mise à jour avec seulement les champs définis
    const fields: Record<string, unknown> = {};
    if (name !== undefined) fields.name = name;
    if (description !== undefined) fields.description = description;
    if (content_category !== undefined) fields.content_category = content_category;
    if (custom_playlist_id !== undefined) fields.custom_playlist_id = custom_playlist_id;
    if (start_time !== undefined) fields.start_time = start_time;
    if (end_time !== undefined) fields.end_time = end_time;
    if (days_of_week !== undefined) fields.days_of_week = days_of_week;
    if (match_phase !== undefined) fields.match_phase = match_phase;
    if (event_type !== undefined) fields.event_type = event_type;
    if (priority !== undefined) fields.priority = priority;
    if (is_active !== undefined) fields.is_active = is_active;
    if (valid_from !== undefined) fields.valid_from = valid_from;
    if (valid_until !== undefined) fields.valid_until = valid_until;

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    const updated = await playlistScheduleRepository.updateSchedule(id, fields);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    logger.info('Playlist schedule updated', { scheduleId: id, updatedBy: req.user?.email });

    res.json({ success: true, data: updated });
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

    const deleted = await playlistScheduleRepository.deleteSchedule(id);

    if (!deleted) {
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

    const data = await playlistScheduleRepository.getActiveRules(
      siteId,
      (time as string) || null,
      day !== undefined ? parseInt(day as string) : null,
      (match_phase as string) || null
    );

    res.json({
      success: true,
      data,
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

    const data = await playlistScheduleRepository.findCustomPlaylistsBySite(siteId);

    res.json({ success: true, data });
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

    const created = await playlistScheduleRepository.createCustomPlaylist({
      site_id: site_id || null,
      name,
      description: description || null,
      video_ids: video_ids || [],
      loop_mode: loop_mode || 'sequential',
      transition_duration: transition_duration || 0,
      is_public: is_public || false,
      created_by: req.user?.id || null,
    });

    logger.info('Custom playlist created', {
      playlistId: created.id,
      siteId: site_id,
      createdBy: req.user?.email,
    });

    res.status(201).json({ success: true, data: created });
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

    const fields: Record<string, unknown> = {};
    if (name !== undefined) fields.name = name;
    if (description !== undefined) fields.description = description;
    if (video_ids !== undefined) fields.video_ids = video_ids;
    if (loop_mode !== undefined) fields.loop_mode = loop_mode;
    if (transition_duration !== undefined) fields.transition_duration = transition_duration;
    if (is_public !== undefined) fields.is_public = is_public;

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    const updated = await playlistScheduleRepository.updateCustomPlaylist(id, fields);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    res.json({ success: true, data: updated });
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

    const deleted = await playlistScheduleRepository.deleteCustomPlaylist(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    res.json({ success: true, message: 'Playlist deleted' });
  } catch (error) {
    logger.error('Error deleting custom playlist:', error);
    res.status(500).json({ success: false, error: 'Failed to delete custom playlist' });
  }
};
