import { Router } from 'express';
import * as sitesController from '../controllers/sites.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

router.get('/', authenticate, sitesController.getSites);

router.get('/stats', authenticate, sitesController.getSiteStats);

router.get('/:id', authenticate, sitesController.getSite);

router.get('/:id/metrics', authenticate, sitesController.getSiteMetrics);

router.post(
  '/',
  authenticate,
  requireRole('admin', 'operator'),
  validate(schemas.createSite),
  sitesController.createSite
);

router.put(
  '/:id',
  authenticate,
  requireRole('admin', 'operator'),
  validate(schemas.updateSite),
  sitesController.updateSite
);

router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  sitesController.deleteSite
);

router.post(
  '/:id/regenerate-key',
  authenticate,
  requireRole('admin'),
  sitesController.regenerateApiKey
);

router.post(
  '/:id/command',
  authenticate,
  requireRole('admin', 'operator'),
  sitesController.sendCommand
);

router.get(
  '/:id/command/:commandId',
  authenticate,
  sitesController.getCommandStatus
);

export default router;
