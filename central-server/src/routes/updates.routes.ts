import { Router } from 'express';
import * as updatesController from '../controllers/updates.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validateParams, paramSchemas, schemas } from '../middleware/validation';
import { uploadUpdatePackage } from '../middleware/upload';
import { adminRateLimit, sensitiveRateLimit, otaUploadRateLimit } from '../middleware/user-rate-limit';

const router = Router();

// Update routes - rate limits per-route pour éviter que les GET consomment le budget des POST
router.get('/updates', authenticate, adminRateLimit, updatesController.getUpdates);
// IMPORTANT: Routes spécifiques DOIVENT être avant :id pour éviter que Express interprète le path comme un ID
router.get('/updates/ftp-test', authenticate, requireRole('admin'), adminRateLimit, updatesController.testFtpUpdateConnection);
router.get('/updates/:id', authenticate, adminRateLimit, validateParams(paramSchemas.id), updatesController.getUpdate);
// Diagnostic: vérifier si l'URL du package est accessible
router.get('/updates/:id/check-url', authenticate, requireRole('admin'), adminRateLimit, validateParams(paramSchemas.id), updatesController.checkUpdatePackageUrl);
router.post(
  '/updates',
  authenticate,
  requireRole('admin'),
  otaUploadRateLimit,
  uploadUpdatePackage.single('package'),
  validate(schemas.createUpdate),
  updatesController.createUpdate
);
router.put('/updates/:id', authenticate, requireRole('admin'), sensitiveRateLimit, validateParams(paramSchemas.id), validate(schemas.updateUpdate), updatesController.updateUpdate);
router.delete('/updates/:id', authenticate, requireRole('admin'), sensitiveRateLimit, validateParams(paramSchemas.id), updatesController.deleteUpdate);

// Update deployment routes
router.get('/update-deployments', authenticate, adminRateLimit, updatesController.getUpdateDeployments);
router.get('/update-deployments/:id', authenticate, adminRateLimit, validateParams(paramSchemas.id), updatesController.getUpdateDeployment);
router.post('/update-deployments', authenticate, requireRole('admin', 'operator'), sensitiveRateLimit, validate(schemas.createUpdateDeployment), updatesController.createUpdateDeployment);
router.post('/update-deployments/:id/retry', authenticate, requireRole('admin', 'operator'), sensitiveRateLimit, validateParams(paramSchemas.id), updatesController.retryUpdateDeployment);
router.put('/update-deployments/:id', authenticate, requireRole('admin', 'operator'), sensitiveRateLimit, validateParams(paramSchemas.id), validate(schemas.updateUpdateDeployment), updatesController.updateUpdateDeployment);
router.delete('/update-deployments/:id', authenticate, requireRole('admin'), sensitiveRateLimit, validateParams(paramSchemas.id), updatesController.deleteUpdateDeployment);

export default router;
