import { Router } from 'express';
import * as sitesController from '../controllers/sites.controller';
import * as configHistoryController from '../controllers/config-history.controller';
import { siteSubscriptionRouter } from './subscription.routes';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validateParams, validateQuery, paramSchemas, querySchemas, schemas } from '../middleware/validation';
import { paginationMiddleware } from '../middleware/pagination';
import { monitoringRateLimit, adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';

const router = Router();

router.get('/', authenticate, adminRateLimit, paginationMiddleware, sitesController.getSites);

router.get('/stats', authenticate, adminRateLimit, sitesController.getSiteStats);

router.get('/connection-status', authenticate, monitoringRateLimit, sitesController.getAllSitesConnectionStatus);

// Fleet health data (aggregated view for admin dashboard)
router.get('/fleet-health', authenticate, requireRole('admin'), adminRateLimit, sitesController.getFleetHealthData);

// Fleet metrics (aggregated metrics for analytics dashboard)
router.get('/fleet-metrics', authenticate, monitoringRateLimit, sitesController.getFleetMetrics);

// Route de debug pour voir l'état des connexions WebSocket (admin only)
router.get('/debug/connections', authenticate, requireRole('admin'), adminRateLimit, sitesController.getConnectionsDebug);

// Route globale pour le résumé de la queue (doit être avant /:id)
router.get('/queue/summary', authenticate, adminRateLimit, sitesController.getQueueSummary);

router.get('/:id', authenticate, adminRateLimit, validateParams(paramSchemas.id), sitesController.getSite);

router.get('/:id/metrics', authenticate, monitoringRateLimit, validateParams(paramSchemas.id), sitesController.getSiteMetrics);

router.get('/:id/connection-status', authenticate, monitoringRateLimit, validateParams(paramSchemas.id), sitesController.getSiteConnectionStatus);

// Endpoint agrégé pour dashboard (réduit de 3 requêtes à 1)
router.get('/:id/dashboard', authenticate, monitoringRateLimit, validateParams(paramSchemas.id), sitesController.getSiteDashboardData);

// Timeline des événements récents (P3.4 - déploiements, commandes, alertes, configs)
router.get('/:id/timeline', authenticate, adminRateLimit, validateParams(paramSchemas.id), sitesController.getSiteTimeline);

// Match history for clubs (Phase 1.2 - audience, videos played per match)
router.get('/:id/match-history', authenticate, monitoringRateLimit, validateParams(paramSchemas.id), sitesController.getSiteMatchHistory);

router.get(
  '/:id/logs',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  sitesController.getSiteLogs
);

router.get(
  '/:id/system-info',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  sitesController.getSystemInfo
);

router.get(
  '/:id/hotspot-config',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  sitesController.getHotspotConfig
);

router.get(
  '/:id/health-status',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  sitesController.getHealthStatus
);

router.get(
  '/:id/diagnostics',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  sitesController.runDiagnostics
);

router.get(
  '/:id/network-diagnostics',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  sitesController.getNetworkDiagnostics
);

router.post(
  '/:id/fix-hotspot',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  sitesController.fixHotspot
);

// WiFi BSSID Management (for mesh environments)
router.get(
  '/:id/wifi-bssid-status',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  sitesController.getWifiBssidStatus
);

router.delete(
  '/:id/bssid-lock',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  sitesController.removeBssidLock
);

router.post(
  '/:id/optimize-mesh',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  sitesController.optimizeForMesh
);

// WiFi Client Configuration (scan & connect wlan1)
router.get(
  '/:id/wifi-scan',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  sitesController.scanWifiNetworks
);

router.post(
  '/:id/wifi-connect',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  sitesController.connectWifiClient
);

router.get(
  '/:id/debug-bundle',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
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
  validateParams(paramSchemas.id),
  validate(schemas.updateSite),
  sitesController.updateSite
);

router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  sitesController.deleteSite
);

router.post(
  '/:id/regenerate-key',
  authenticate,
  requireRole('admin'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  sitesController.regenerateApiKey
);

// Copy configuration profiles from source site to target site
router.post(
  '/:id/copy-config',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  validate(schemas.copyConfig),
  sitesController.copyConfig
);

router.post(
  '/:id/command',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  sitesController.sendCommand
);

router.get(
  '/:id/command/:commandId',
  authenticate,
  adminRateLimit,
  validateParams(paramSchemas.idAndCommandId),
  sitesController.getCommandStatus
);

// Route pour le contenu local (miroir de la configuration)
router.get(
  '/:id/local-content',
  authenticate,
  monitoringRateLimit,
  validateParams(paramSchemas.id),
  sitesController.getSiteLocalContent
);

// Sauvegarde directe de la config (SaaS uniquement, pas de Pi)
router.put(
  '/:id/config',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  validate(schemas.saveConfigDirect),
  configHistoryController.saveConfigDirect
);

// Routes pour l'historique des configurations
router.get(
  '/:id/config-history',
  authenticate,
  adminRateLimit,
  validateParams(paramSchemas.id),
  validateQuery(querySchemas.configHistory),
  configHistoryController.getConfigHistory
);

router.get(
  '/:id/config-history/:versionId',
  authenticate,
  adminRateLimit,
  validateParams(paramSchemas.siteIdAndVersionId),
  configHistoryController.getConfigVersion
);

router.post(
  '/:id/config-history',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  validate(schemas.saveConfigVersion),
  configHistoryController.saveConfigVersion
);

router.get(
  '/:id/config-history-compare',
  authenticate,
  adminRateLimit,
  validateParams(paramSchemas.id),
  validateQuery(querySchemas.configDiff),
  configHistoryController.compareConfigVersions
);

router.post(
  '/:id/config-preview-diff',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  validate(schemas.previewConfigRestore),
  configHistoryController.previewConfigDiff
);

// Routes pour la file d'attente de commandes (Command Queue)
router.get(
  '/:id/pending-commands',
  authenticate,
  adminRateLimit,
  validateParams(paramSchemas.id),
  sitesController.getPendingCommands
);

router.delete(
  '/:id/pending-commands/:commandId',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.idAndCommandId),
  sitesController.cancelPendingCommand
);

router.delete(
  '/:id/pending-commands',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  sitesController.clearPendingCommands
);

// Remote PIN management
router.get(
  '/:id/remote-pin',
  authenticate,
  requireRole('admin', 'operator'),
  adminRateLimit,
  validateParams(paramSchemas.id),
  sitesController.getRemotePinStatus
);

router.post(
  '/:id/remote-pin',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  validate(schemas.setRemotePin),
  sitesController.setRemotePin
);

router.delete(
  '/:id/remote-pin',
  authenticate,
  requireRole('admin', 'operator'),
  sensitiveRateLimit,
  validateParams(paramSchemas.id),
  sitesController.clearRemotePin
);

// Subscription management routes for specific site
// Routes: GET /, GET /history, GET /license-status, PUT /extend, POST /suspend, POST /reactivate, PUT /plan
router.use('/:id/subscription', siteSubscriptionRouter);

export default router;
