import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller';
import * as pitchDeckController from '../controllers/pitch-deck.controller';
import { authenticate, authenticateSiteApiKeyOptional, requireRole } from '../middleware/auth';
import { validate, validateParams, validateQuery, paramSchemas, querySchemas, schemas } from '../middleware/validation';
import { piAnalyticsRateLimit } from '../middleware/user-rate-limit';

const router = Router();

// ============================================================================
// MVP - Health Analytics (données existantes)
// ============================================================================

// GET /api/analytics/clubs/:siteId/health - Dashboard santé technique
router.get('/clubs/:siteId/health', authenticate, validateParams(paramSchemas.siteId), analyticsController.getClubHealth);

// GET /api/analytics/clubs/:siteId/availability - Historique disponibilité
router.get('/clubs/:siteId/availability', authenticate, validateParams(paramSchemas.siteId), validateQuery(querySchemas.analyticsClub), analyticsController.getClubAvailability);

// GET /api/analytics/clubs/:siteId/alerts - Historique alertes
router.get('/clubs/:siteId/alerts', authenticate, validateParams(paramSchemas.siteId), validateQuery(querySchemas.analyticsAlerts), analyticsController.getClubAlerts);

// ============================================================================
// Phase 2 - Usage Analytics (tracking vidéos)
// ============================================================================

// POST /api/analytics/video-plays - Enregistrer lectures vidéo (depuis sync-agent)
// Auth: Bearer <site_api_key> (optionnel — fallback sur site_id dans le body)
router.post('/video-plays', piAnalyticsRateLimit, authenticateSiteApiKeyOptional, validate(schemas.recordVideoPlays), analyticsController.recordVideoPlays);

// POST /api/analytics/sessions - Gérer sessions (start/end)
// Auth: Bearer <site_api_key> (optionnel — fallback sur site_id dans le body)
router.post('/sessions', piAnalyticsRateLimit, authenticateSiteApiKeyOptional, validate(schemas.manageSession), analyticsController.manageSession);

// GET /api/analytics/clubs/:siteId/usage - Stats d'utilisation
router.get('/clubs/:siteId/usage', authenticate, validateParams(paramSchemas.siteId), validateQuery(querySchemas.analyticsClub), analyticsController.getClubUsage);

// GET /api/analytics/clubs/:siteId/content - Analytics contenu
router.get('/clubs/:siteId/content', authenticate, validateParams(paramSchemas.siteId), validateQuery(querySchemas.analyticsClub), analyticsController.getClubContent);

// GET /api/analytics/clubs/:siteId/sources - Répartition kiosk (Pi) vs PC (E-23 US-23.7.4)
router.get('/clubs/:siteId/sources', authenticate, validateParams(paramSchemas.siteId), validateQuery(querySchemas.analyticsClub), analyticsController.getClubSourceBreakdown);

// ============================================================================
// Phase 3 - Advanced Analytics
// ============================================================================

// GET /api/analytics/clubs/:siteId/dashboard - Dashboard complet
router.get('/clubs/:siteId/dashboard', authenticate, validateParams(paramSchemas.siteId), validateQuery(querySchemas.dateRange), analyticsController.getClubDashboard);

// GET /api/analytics/clubs/:siteId/export - Export CSV
router.get('/clubs/:siteId/export', authenticate, validateParams(paramSchemas.siteId), validateQuery(querySchemas.analyticsExport), analyticsController.exportClubData);

// GET /api/analytics/clubs/:siteId/report/pdf - Générer rapport PDF
router.get('/clubs/:siteId/report/pdf', authenticate, validateParams(paramSchemas.siteId), validateQuery(querySchemas.dateRange), analyticsController.generateClubPdfReport);

// GET /api/analytics/clubs/:siteId/export/excel - Export Excel avancé club
router.get('/clubs/:siteId/export/excel', authenticate, validateParams(paramSchemas.siteId), validateQuery(querySchemas.dateRange), analyticsController.exportClubExcel);

// POST /api/analytics/calculate-daily-stats - Calcul stats quotidiennes (cron/admin)
router.post(
  '/calculate-daily-stats',
  authenticate,
  requireRole('admin'),
  validate(schemas.calculateDailyStats),
  analyticsController.calculateDailyStats
);

// GET /api/analytics/overview - Vue d'ensemble tous sites (admin)
router.get('/overview', authenticate, requireRole('admin', 'operator'), validateQuery(querySchemas.dateRange), analyticsController.getAnalyticsOverview);

// GET /api/analytics/overview/export/excel - Export Excel global multi-sites
router.get('/overview/export/excel', authenticate, requireRole('admin', 'operator'), validateQuery(querySchemas.dateRange), analyticsController.exportOverviewExcel);

// GET /api/analytics/comparison - Comparaison multi-sites (admin/operator)
router.get('/comparison', authenticate, requireRole('admin', 'operator'), validateQuery(querySchemas.multiSiteComparison), analyticsController.getMultiSiteComparison);

// GET /api/analytics/realtime - Stats temps réel pour dashboard live
router.get('/realtime', authenticate, requireRole('admin', 'operator'), analyticsController.getRealtimeStats);

// GET /api/analytics/traction - Métriques de traction (croissance, engagement, revenue)
router.get('/traction', authenticate, requireRole('admin'), pitchDeckController.getTractionMetrics);

// ============================================================================
// Analytics Categories Management
// ============================================================================

// GET /api/analytics/categories - Liste des catégories analytics
router.get('/categories', authenticate, analyticsController.getAnalyticsCategories);

// POST /api/analytics/categories - Créer une catégorie (admin only)
router.post('/categories', authenticate, requireRole('admin'), validate(schemas.createAnalyticsCategory), analyticsController.createAnalyticsCategory);

// PUT /api/analytics/categories/:id - Mettre à jour une catégorie (admin only)
router.put('/categories/:id', authenticate, requireRole('admin'), validateParams(paramSchemas.id), validate(schemas.updateAnalyticsCategory), analyticsController.updateAnalyticsCategory);

// DELETE /api/analytics/categories/:id - Supprimer une catégorie (admin only)
router.delete('/categories/:id', authenticate, requireRole('admin'), validateParams(paramSchemas.id), analyticsController.deleteAnalyticsCategory);

export default router;
