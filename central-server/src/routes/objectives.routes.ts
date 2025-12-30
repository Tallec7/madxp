/**
 * Routes API pour la gestion des objectifs clubs
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import * as objectivesController from '../controllers/objectives.controller';

const router = Router();

// Routes globales (admin)
router.get('/', authenticate, requireRole('admin', 'super_admin', 'operator'), objectivesController.listObjectives);
router.post('/', authenticate, requireRole('admin', 'super_admin'), objectivesController.createObjective);
router.post('/update-all-progress', authenticate, requireRole('admin', 'super_admin'), objectivesController.updateAllProgress);

// Routes par objectif
router.get('/:id', authenticate, requireRole('admin', 'super_admin', 'operator'), objectivesController.getObjective);
router.put('/:id', authenticate, requireRole('admin', 'super_admin'), objectivesController.updateObjective);
router.patch('/:id/status', authenticate, requireRole('admin', 'super_admin'), objectivesController.updateObjectiveStatus);
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), objectivesController.deleteObjective);

// Routes de progression
router.get('/:id/progress', authenticate, requireRole('admin', 'super_admin', 'operator'), objectivesController.getObjectiveProgress);
router.post('/:id/calculate', authenticate, requireRole('admin', 'super_admin'), objectivesController.calculateProgress);

// Routes d'alertes
router.get('/:id/alerts', authenticate, requireRole('admin', 'super_admin', 'operator'), objectivesController.getObjectiveAlerts);

// Routes par site
router.get('/sites/:siteId', authenticate, requireRole('admin', 'super_admin', 'operator'), objectivesController.getSiteObjectives);
router.get('/sites/:siteId/dashboard', authenticate, requireRole('admin', 'super_admin', 'operator'), objectivesController.getSiteObjectivesDashboard);

export default router;
