import { Router } from 'express';
import * as updatesController from '../controllers/updates.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Update routes
router.get('/updates', authenticate, updatesController.getUpdates);
router.get('/updates/:id', authenticate, updatesController.getUpdate);
router.post('/updates', authenticate, requireRole('admin'), updatesController.createUpdate);
router.put('/updates/:id', authenticate, requireRole('admin'), updatesController.updateUpdate);
router.delete('/updates/:id', authenticate, requireRole('admin'), updatesController.deleteUpdate);

// Update deployment routes
router.get('/update-deployments', authenticate, updatesController.getUpdateDeployments);
router.get('/update-deployments/:id', authenticate, updatesController.getUpdateDeployment);
router.post('/update-deployments', authenticate, requireRole('admin', 'operator'), updatesController.createUpdateDeployment);
router.put('/update-deployments/:id', authenticate, requireRole('admin', 'operator'), updatesController.updateUpdateDeployment);
router.delete('/update-deployments/:id', authenticate, requireRole('admin'), updatesController.deleteUpdateDeployment);

export default router;
