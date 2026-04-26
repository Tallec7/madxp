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

// PR2.2 — Audit FTP des vidéos orphelines (super_admin uniquement : opération
// diagnostique sur tout le catalogue vidéo de la flotte).
router.get('/video-ftp-orphans', authenticate, requireRole('super_admin'), adminController.listVideoFtpOrphans);
router.post('/video-ftp-orphans/run', authenticate, requireRole('super_admin'), adminController.runVideoFtpAudit);

// Vue agrégée "Santé vidéos flotte" : combine FTP orphans + erreurs de
// lecture 24h. Source de la page super_admin /admin/video-health.
router.get('/video-health', authenticate, requireRole('super_admin'), adminController.getFleetVideoHealth);

export default router;
