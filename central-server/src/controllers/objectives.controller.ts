/**
 * Controller pour la gestion des objectifs clubs
 */

import { Request, Response } from 'express';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { objectiveRepository } from '../repositories';
import { ObjectiveWithProgressRow } from '../repositories/objective.repository';

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

    const rows = await objectiveRepository.findWithFilters({
      site_id: site_id as string | undefined,
      status: status as string | undefined,
      priority: priority as string | undefined,
      metric_type: metric_type as string | undefined,
    });

    res.json({
      success: true,
      data: rows,
      total: rows.length,
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

    const objective = await objectiveRepository.findByIdWithSite(id);

    if (!objective) {
      return res.status(404).json({ success: false, error: 'Objective not found' });
    }

    res.json({ success: true, data: objective });
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
    const siteFound = await objectiveRepository.siteExists(site_id);
    if (!siteFound) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    const created = await objectiveRepository.create({
      site_id,
      name,
      description: description || null,
      metric_type,
      target_value,
      target_period,
      priority: priority || 'medium',
      start_date: start_date || new Date(),
      end_date: end_date || null,
      alert_on_at_risk: alert_on_at_risk !== false,
      alert_on_achieved: alert_on_achieved !== false,
      at_risk_threshold: at_risk_threshold || 50,
      created_by: req.user?.id || null,
    });

    logger.info('Objective created', {
      objectiveId: created.id,
      siteId: site_id,
      createdBy: req.user?.email,
    });

    res.status(201).json({ success: true, data: created });
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

    // Validation de la priorité si fournie
    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({
          success: false,
          error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
        });
      }
    }

    // Vérifier s'il y a des champs à mettre à jour
    const fields = { name, description, target_value, priority, end_date, alert_on_at_risk, alert_on_achieved, at_risk_threshold };
    const hasFields = Object.values(fields).some(v => v !== undefined);

    if (!hasFields) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    const updated = await objectiveRepository.updateFields(id, fields);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Objective not found' });
    }

    logger.info('Objective updated', { objectiveId: id, updatedBy: req.user?.email });

    res.json({ success: true, data: updated });
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

    const updated = await objectiveRepository.updateStatus(id, status);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Objective not found' });
    }

    logger.info('Objective status updated', { objectiveId: id, status, updatedBy: req.user?.email });

    res.json({ success: true, data: updated });
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

    const deleted = await objectiveRepository.deleteObjective(id);

    if (!deleted) {
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

    const rows = await objectiveRepository.getProgress(
      id,
      Math.min(parseInt(limit as string) || 30, 100)
    );

    res.json({ success: true, data: rows });
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

    const progress = await objectiveRepository.calculateProgress(id);

    if (!progress) {
      return res.status(404).json({ success: false, error: 'Objective not found or no data' });
    }

    res.json({ success: true, data: progress });
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

    const rows = await objectiveRepository.findBySiteWithProgress(
      siteId,
      status as string | undefined
    );

    res.json({ success: true, data: rows });
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
    const stats = await objectiveRepository.getSiteStats(siteId);

    // Objectifs actifs avec progression
    const objectives = await objectiveRepository.findActiveBySiteWithProgress(siteId);

    // Calculer les stats de progression
    const atRisk = objectives.filter((o: ObjectiveWithProgressRow) => o.latest_progress?.status === 'at_risk').length;
    const onTrack = objectives.filter((o: ObjectiveWithProgressRow) => o.latest_progress?.status === 'on_track').length;
    const achieved = objectives.filter((o: ObjectiveWithProgressRow) => o.latest_progress?.status === 'achieved').length;

    res.json({
      success: true,
      data: {
        stats: {
          ...stats,
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
    const count = await objectiveRepository.updateAllProgress();

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

    const rows = await objectiveRepository.getAlerts(
      id,
      Math.min(parseInt(limit as string) || 20, 100)
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error getting objective alerts:', error);
    res.status(500).json({ success: false, error: 'Failed to get objective alerts' });
  }
};
