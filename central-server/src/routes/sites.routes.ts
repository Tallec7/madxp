import { Router } from 'express';
import * as sitesController from '../controllers/sites.controller';
import * as configHistoryController from '../controllers/config-history.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';
import { paginationMiddleware } from '../middleware/pagination';

const router = Router();

router.get('/', authenticate, paginationMiddleware, sitesController.getSites);

router.get('/stats', authenticate, sitesController.getSiteStats);

router.get('/connection-status', authenticate, sitesController.getAllSitesConnectionStatus);

router.get('/:id', authenticate, sitesController.getSite);

router.get('/:id/metrics', authenticate, sitesController.getSiteMetrics);

router.get('/:id/connection-status', authenticate, sitesController.getSiteConnectionStatus);

router.get(
  '/:id/logs',
  authenticate,
  requireRole('admin', 'operator'),
  sitesController.getSiteLogs
);

router.get(
  '/:id/system-info',
  authenticate,
  requireRole('admin', 'operator'),
  sitesController.getSystemInfo
);

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

// Route pour le contenu local (miroir de la configuration)
router.get(
  '/:id/local-content',
  authenticate,
  sitesController.getSiteLocalContent
);

// Routes pour l'historique des configurations
router.get(
  '/:id/config-history',
  authenticate,
  configHistoryController.getConfigHistory
);

router.get(
  '/:id/config-history/:versionId',
  authenticate,
  configHistoryController.getConfigVersion
);

router.post(
  '/:id/config-history',
  authenticate,
  requireRole('admin', 'operator'),
  configHistoryController.saveConfigVersion
);

router.get(
  '/:id/config-history-compare',
  authenticate,
  configHistoryController.compareConfigVersions
);

router.post(
  '/:id/config-preview-diff',
  authenticate,
  requireRole('admin', 'operator'),
  configHistoryController.previewConfigDiff
);

export default router;
