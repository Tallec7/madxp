/**
 * Routes API pour la gestion des tâches planifiées récurrentes
 */

import { Router, Request, Response } from 'express';
import { cronSchedulerService } from '../services/cron-scheduler.service';
import { authenticate, requireRole } from '../middleware/auth';
import { AuthRequest } from '../types';
import logger from '../config/logger';

const router = Router();

/**
 * GET /api/schedules
 * Liste toutes les tâches planifiées
 */
router.get('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const schedules = await cronSchedulerService.listSchedules();
    res.json({ success: true, data: schedules });
  } catch (error) {
    logger.error('Error listing schedules:', error);
    res.status(500).json({ success: false, error: 'Failed to list schedules' });
  }
});

/**
 * GET /api/schedules/:id
 * Récupère une tâche planifiée par ID
 */
router.get('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const schedule = await cronSchedulerService.getSchedule(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    res.json({ success: true, data: schedule });
  } catch (error) {
    logger.error('Error getting schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to get schedule' });
  }
});

/**
 * POST /api/schedules
 * Crée une nouvelle tâche planifiée
 */
router.post('/', authenticate, requireRole('admin', 'super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, task_type, frequency, day_of_week, day_of_month, hour, minute, task_config, is_active } = req.body;

    // Validation
    if (!name || !task_type || !frequency) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, task_type, frequency',
      });
    }

    const validTaskTypes = ['report', 'cleanup', 'aggregation', 'backup', 'objective_check'];
    if (!validTaskTypes.includes(task_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid task_type. Must be one of: ${validTaskTypes.join(', ')}`,
      });
    }

    const validFrequencies = ['daily', 'weekly', 'monthly'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({
        success: false,
        error: `Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`,
      });
    }

    const schedule = await cronSchedulerService.createSchedule({
      name,
      description,
      task_type,
      frequency,
      day_of_week,
      day_of_month,
      hour: hour ?? 9,
      minute: minute ?? 0,
      task_config: task_config || {},
      is_active: is_active ?? false,
      created_by: req.user?.id,
    });

    logger.info('Schedule created', { scheduleId: schedule.id, name, createdBy: req.user?.email });

    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    logger.error('Error creating schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to create schedule' });
  }
});

/**
 * PUT /api/schedules/:id
 * Met à jour une tâche planifiée
 */
router.put('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, frequency, day_of_week, day_of_month, hour, minute, task_config, is_active } = req.body;

    const schedule = await cronSchedulerService.updateSchedule(req.params.id, {
      name,
      description,
      frequency,
      day_of_week,
      day_of_month,
      hour,
      minute,
      task_config,
      is_active,
    });

    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    logger.info('Schedule updated', { scheduleId: schedule.id, updatedBy: req.user?.email });

    res.json({ success: true, data: schedule });
  } catch (error) {
    logger.error('Error updating schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to update schedule' });
  }
});

/**
 * DELETE /api/schedules/:id
 * Supprime une tâche planifiée
 */
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await cronSchedulerService.deleteSchedule(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    logger.info('Schedule deleted', { scheduleId: req.params.id, deletedBy: req.user?.email });

    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    logger.error('Error deleting schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to delete schedule' });
  }
});

/**
 * PATCH /api/schedules/:id/toggle
 * Active ou désactive une tâche planifiée
 */
router.patch('/:id/toggle', authenticate, requireRole('admin', 'super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active must be a boolean' });
    }

    const toggled = await cronSchedulerService.toggleSchedule(req.params.id, is_active);

    if (!toggled) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    logger.info('Schedule toggled', {
      scheduleId: req.params.id,
      is_active,
      toggledBy: req.user?.email,
    });

    res.json({ success: true, message: `Schedule ${is_active ? 'activated' : 'deactivated'}` });
  } catch (error) {
    logger.error('Error toggling schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle schedule' });
  }
});

/**
 * POST /api/schedules/:id/run
 * Exécute immédiatement une tâche planifiée
 */
router.post('/:id/run', authenticate, requireRole('admin', 'super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    logger.info('Manual schedule execution requested', {
      scheduleId: req.params.id,
      requestedBy: req.user?.email,
    });

    const result = await cronSchedulerService.runNow(req.params.id);

    if (!result.success && result.message === 'Schedule not found') {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    res.json({ success: result.success, message: result.message, details: result.details });
  } catch (error) {
    logger.error('Error running schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to run schedule' });
  }
});

/**
 * GET /api/schedules/:id/history
 * Récupère l'historique des exécutions d'une tâche
 */
router.get('/:id/history', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const history = await cronSchedulerService.getExecutionHistory(req.params.id, limit);

    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('Error getting schedule history:', error);
    res.status(500).json({ success: false, error: 'Failed to get schedule history' });
  }
});

export default router;
