/**
 * Routes API pour la gestion des objectifs clubs
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validateParams, validateQuery, paramSchemas, querySchemas, schemas } from '../middleware/validation';
import * as objectivesController from '../controllers/objectives.controller';

const router = Router();

// Routes globales (admin)
router.get('/', authenticate, requireRole('admin', 'super_admin', 'operator'), validateQuery(querySchemas.listObjectives), objectivesController.listObjectives);
router.post('/', authenticate, requireRole('admin', 'super_admin'), validate(schemas.createObjective), objectivesController.createObjective);
router.post('/update-all-progress', authenticate, requireRole('admin', 'super_admin'), objectivesController.updateAllProgress);

// Routes par objectif
router.get('/:id', authenticate, requireRole('admin', 'super_admin', 'operator'), validateParams(paramSchemas.id), objectivesController.getObjective);
router.put('/:id', authenticate, requireRole('admin', 'super_admin'), validateParams(paramSchemas.id), validate(schemas.updateObjective), objectivesController.updateObjective);
router.patch('/:id/status', authenticate, requireRole('admin', 'super_admin'), validateParams(paramSchemas.id), validate(schemas.updateObjectiveStatus), objectivesController.updateObjectiveStatus);
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), validateParams(paramSchemas.id), objectivesController.deleteObjective);

// Routes de progression
router.get('/:id/progress', authenticate, requireRole('admin', 'super_admin', 'operator'), validateParams(paramSchemas.id), objectivesController.getObjectiveProgress);
router.post('/:id/calculate', authenticate, requireRole('admin', 'super_admin'), validateParams(paramSchemas.id), objectivesController.calculateProgress);

// Routes d'alertes
router.get('/:id/alerts', authenticate, requireRole('admin', 'super_admin', 'operator'), validateParams(paramSchemas.id), objectivesController.getObjectiveAlerts);

// Routes par site
router.get('/sites/:siteId', authenticate, requireRole('admin', 'super_admin', 'operator'), validateParams(paramSchemas.siteId), objectivesController.getSiteObjectives);
router.get('/sites/:siteId/dashboard', authenticate, requireRole('admin', 'super_admin', 'operator'), validateParams(paramSchemas.siteId), objectivesController.getSiteObjectivesDashboard);

export default router;
