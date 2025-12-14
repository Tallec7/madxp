import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import * as adminController from '../controllers/admin.controller';

const router = Router();

router.get('/jobs', authenticate, requireRole('admin'), adminController.listJobs);
router.post('/jobs', authenticate, requireRole('admin'), adminController.triggerJob);
router.get('/jobs/stream', authenticate, requireRole('admin'), adminController.streamJobs);

router.get('/clients', authenticate, requireRole('admin'), adminController.listClients);
router.post('/clients', authenticate, requireRole('admin'), adminController.createClient);
router.post('/clients/:id/sync', authenticate, requireRole('admin'), adminController.syncClient);

export default router;
