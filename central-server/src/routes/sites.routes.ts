import { Router } from 'express';
import * as sitesController from '../controllers/sites.controller';
import * as configHistoryController from '../controllers/config-history.controller';
import { siteSubscriptionRouter } from './subscription.routes';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';
import { paginationMiddleware } from '../middleware/pagination';
import { monitoringRateLimit, adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';

const router = Router();

router.get('/', authenticate, adminRateLimit, paginationMiddleware, sitesController.getSites);

router.get('/stats', authenticate, adminRateLimit, sitesController.getSiteStats);

router.get('/connection-status', authenticate, monitoringRateLimit, sitesController.getAllSitesConnectionStatus);

// Fleet health data (aggregated view for admin dashboard)
router.get('/fleet-health', authenticate, requireRole('admin'), adminRateLimit, sitesController.getFleetHealthData);

// Route de debug pour voir l'état des connexions WebSocket (admin only)
router.get('/debug/connections', authenticate, requireRole('admin'), adminRateLimit, sitesController.getConnectionsDebug);

// Route globale pour le résumé de la queue (doit être avant /:id)
router.get('/queue/summary', authenticate, adminRateLimit, sitesController.getQueueSummary);

router.get('/:id', authenticate, adminRateLimit, sitesController.getSite);

router.get('/:id/metrics', authenticate, monitoringRateLimit, sitesController.getSiteMetrics);

router.get('/:id/connection-status', authenticate, monitoringRateLimit, sitesController.getSiteConnectionStatus);

// Endpoint agrégé pour dashboard (réduit de 3 requêtes à 1)
router.get('/:id/dashboard', authenticate, monitoringRateLimit, sitesController.getSiteDashboardData);

// Timeline des événements récents (P3.4 - déploiements, commandes, alertes, configs)
router.get('/:id/timeline', authenticate, adminRateLimit, sitesController.getSiteTimeline);

// Match history for clubs (Phase 1.2 - audience, videos played per match)
router.get('/:id/match-history', authenticate, monitoringRateLimit, sitesController.getSiteMatchHistory);

router.get(
  '/:id/logs',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  sitesController.getSiteLogs
);

router.get(
  '/:id/system-info',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  sitesController.getSystemInfo
);

router.get(
  '/:id/hotspot-config',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  sitesController.getHotspotConfig
);

router.get(
  '/:id/health-status',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  sitesController.getHealthStatus
);

router.get(
  '/:id/diagnostics',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  sitesController.runDiagnostics
);

router.get(
  '/:id/network-diagnostics',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  sitesController.getNetworkDiagnostics
);

router.post(
  '/:id/fix-hotspot',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  sitesController.fixHotspot
);

// WiFi BSSID Management (for mesh environments)
router.get(
  '/:id/wifi-bssid-status',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  sitesController.getWifiBssidStatus
);

router.delete(
  '/:id/bssid-lock',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  sitesController.removeBssidLock
);

router.post(
  '/:id/optimize-mesh',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  sitesController.optimizeForMesh
);

router.get(
  '/:id/debug-bundle',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  sitesController.exportDebugBundle
);

router.post(
  '/',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validate(schemas.createSite),
  sitesController.createSite
);

router.put(
  '/:id',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validate(schemas.updateSite),
  sitesController.updateSite
);

router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  sensitiveRateLimit,
  sitesController.deleteSite
);

router.post(
  '/:id/regenerate-key',
  authenticate,
  requireRole('admin'),
  sensitiveRateLimit,
  sitesController.regenerateApiKey
);

router.post(
  '/:id/command',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  sitesController.sendCommand
);

router.get(
  '/:id/command/:commandId',
  authenticate,
  adminRateLimit,
  sitesController.getCommandStatus
);

// Route pour le contenu local (miroir de la configuration)
router.get(
  '/:id/local-content',
  authenticate,
  monitoringRateLimit,
  sitesController.getSiteLocalContent
);

// Routes pour l'historique des configurations
router.get(
  '/:id/config-history',
  authenticate,
  adminRateLimit,
  configHistoryController.getConfigHistory
);

router.get(
  '/:id/config-history/:versionId',
  authenticate,
  adminRateLimit,
  configHistoryController.getConfigVersion
);

router.post(
  '/:id/config-history',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  configHistoryController.saveConfigVersion
);

router.get(
  '/:id/config-history-compare',
  authenticate,
  adminRateLimit,
  configHistoryController.compareConfigVersions
);

router.post(
  '/:id/config-preview-diff',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  configHistoryController.previewConfigDiff
);

// Routes pour la file d'attente de commandes (Command Queue)
router.get(
  '/:id/pending-commands',
  authenticate,
  adminRateLimit,
  sitesController.getPendingCommands
);

router.delete(
  '/:id/pending-commands/:commandId',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  sitesController.cancelPendingCommand
);

router.delete(
  '/:id/pending-commands',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  sitesController.clearPendingCommands
);

// Subscription management routes for specific site
// Routes: GET /, GET /history, GET /license-status, PUT /extend, POST /suspend, POST /reactivate, PUT /plan
router.use('/:id/subscription', siteSubscriptionRouter);

export default router;
