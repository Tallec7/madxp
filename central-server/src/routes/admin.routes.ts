import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validateParams, paramSchemas, schemas } from '../middleware/validation';
import * as adminController from '../controllers/admin.controller';

const router = Router();

router.get('/jobs', authenticate, requireRole('admin'), adminController.listJobs);
router.post('/jobs', authenticate, requireRole('admin'), validate(schemas.triggerJob), adminController.triggerJob);
router.get('/jobs/stream', authenticate, requireRole('admin'), adminController.streamJobs);

router.get('/clients', authenticate, requireRole('admin'), adminController.listClients);
router.post('/clients', authenticate, requireRole('admin'), validate(schemas.createClient), adminController.createClient);
router.post('/clients/:id/sync', authenticate, requireRole('admin'), validateParams(paramSchemas.idString), adminController.syncClient);

// Debug endpoint pour l'état des connexions Socket.IO
router.get('/socket-debug', authenticate, requireRole('admin'), adminController.getSocketDebugInfo);

export default router;
