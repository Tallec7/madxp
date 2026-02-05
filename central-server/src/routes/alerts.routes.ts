/**
 * Alerts Routes
 *
 * Routes pour la gestion des alertes système et prédictives
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import * as alertsController from '../controllers/alerts.controller';

const router = Router();

// List alerts with filters
router.get('/', authenticate, requireRole('operator'), alertsController.listAlerts);

// Get alert statistics
router.get('/stats', authenticate, requireRole('admin'), alertsController.getAlertStats);

// Resolve single alert
router.post('/:id/resolve', authenticate, requireRole('operator'), alertsController.resolveAlert);

// Resolve all alerts for a site
router.post('/sites/:siteId/resolve', authenticate, requireRole('operator'), alertsController.resolveSiteAlerts);

export default router;
