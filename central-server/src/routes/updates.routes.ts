import { Router } from 'express';
import * as updatesController from '../controllers/updates.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { uploadUpdatePackage } from '../middleware/upload';

const router = Router();

// Update routes
router.get('/updates', authenticate, updatesController.getUpdates);
// IMPORTANT: Routes spécifiques DOIVENT être avant :id pour éviter que Express interprète le path comme un ID
router.get('/updates/ftp-test', authenticate, requireRole('admin'), updatesController.testFtpUpdateConnection);
router.get('/updates/:id', authenticate, updatesController.getUpdate);
// Diagnostic: vérifier si l'URL du package est accessible
router.get('/updates/:id/check-url', authenticate, requireRole('admin'), updatesController.checkUpdatePackageUrl);
router.post(
  '/updates',
  authenticate,
  requireRole('admin'),
  uploadUpdatePackage.single('package'),
  updatesController.createUpdate
);
router.put('/updates/:id', authenticate, requireRole('admin'), updatesController.updateUpdate);
router.delete('/updates/:id', authenticate, requireRole('admin'), updatesController.deleteUpdate);

// Update deployment routes
router.get('/update-deployments', authenticate, updatesController.getUpdateDeployments);
router.get('/update-deployments/:id', authenticate, updatesController.getUpdateDeployment);
router.post('/update-deployments', authenticate, requireRole('admin', 'operator'), updatesController.createUpdateDeployment);
router.put('/update-deployments/:id', authenticate, requireRole('admin', 'operator'), updatesController.updateUpdateDeployment);
router.delete('/update-deployments/:id', authenticate, requireRole('admin'), updatesController.deleteUpdateDeployment);

export default router;
