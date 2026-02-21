import express from 'express';
import { authenticate, authenticateSiteApiKeyOptional } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { apiRateLimit, piAnalyticsRateLimit } from '../middleware/user-rate-limit';
import { analyticsValidation } from '../middleware/analytics-validation';
import {
  listAdvertisers,
  getAdvertiser,
  createAdvertiser,
  updateAdvertiser,
  deleteAdvertiser,
  addVideosToAdvertiser,
  removeVideoFromAdvertiser,
  getAdvertiserVideos,
  getAdvertiserStats,
  getAdvertiserKpis,
  recordImpressions,
  exportAdvertiserData,
  calculateDailyStats,
  generateAdvertiserPdfReport,
  generateClubPdfReport,
} from '../controllers/advertiser-analytics.controller';

const router = express.Router();

// ============================================================================
// ADVERTISER CRUD
// ============================================================================

// Liste tous les annonceurs
router.get(
  '/advertisers',
  authenticate,
  apiRateLimit,
  listAdvertisers
);

// Récupérer un annonceur par ID
router.get(
  '/advertisers/:id',
  authenticate,
  apiRateLimit,
  analyticsValidation.getAdvertiser,
  getAdvertiser
);

// Créer un nouvel annonceur (admin/operator only)
router.post(
  '/advertisers',
  authenticate,
  requireRole('admin', 'operator'),
  apiRateLimit,
  analyticsValidation.createAdvertiser,
  createAdvertiser
);

// Mettre à jour un annonceur (admin/operator only)
router.put(
  '/advertisers/:id',
  authenticate,
  requireRole('admin', 'operator'),
  apiRateLimit,
  ...analyticsValidation.updateAdvertiser,
  updateAdvertiser
);

// Supprimer un annonceur (admin only)
router.delete(
  '/advertisers/:id',
  authenticate,
  requireRole('admin'),
  apiRateLimit,
  analyticsValidation.deleteAdvertiser,
  deleteAdvertiser
);

// ============================================================================
// ADVERTISER-VIDEO ASSOCIATION
// ============================================================================

// Récupérer les vidéos d'un annonceur
router.get(
  '/advertisers/:id/videos',
  authenticate,
  apiRateLimit,
  analyticsValidation.getAdvertiserVideos,
  getAdvertiserVideos
);

// Associer des vidéos à un annonceur (admin/operator only)
router.post(
  '/advertisers/:id/videos',
  authenticate,
  requireRole('admin', 'operator'),
  apiRateLimit,
  ...analyticsValidation.addVideosToAdvertiser,
  addVideosToAdvertiser
);

// Dissocier une vidéo d'un annonceur (admin/operator only)
router.delete(
  '/advertisers/:id/videos/:videoId',
  authenticate,
  requireRole('admin', 'operator'),
  apiRateLimit,
  analyticsValidation.removeVideoFromAdvertiser,
  removeVideoFromAdvertiser
);

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

// Récupérer les analytics d'un annonceur
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/advertisers/:id/stats',
  authenticate,
  apiRateLimit,
  ...analyticsValidation.getAdvertiserStats,
  getAdvertiserStats
);

// KPIs enrichis d'un annonceur (depuis video_plays consolidé)
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/advertisers/:id/kpis',
  authenticate,
  apiRateLimit,
  ...analyticsValidation.getAdvertiserKpis,
  getAdvertiserKpis
);

// Export CSV des données annonceur
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
router.get(
  '/advertisers/:id/export',
  authenticate,
  apiRateLimit,
  ...analyticsValidation.exportAdvertiserData,
  exportAdvertiserData
);

// Générer un rapport PDF pour un annonceur
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/advertisers/:id/report/pdf',
  authenticate,
  apiRateLimit,
  ...analyticsValidation.generateAdvertiserPdfReport,
  generateAdvertiserPdfReport
);

// Export Excel avancé pour un annonceur
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
import * as analyticsController from '../controllers/analytics.controller';
router.get(
  '/advertisers/:advertiserId/export/excel',
  authenticate,
  apiRateLimit,
  ...analyticsValidation.exportAdvertiserExcel,
  analyticsController.exportAdvertiserExcel
);

// Générer un rapport PDF pour un club
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/clubs/:siteId/report/pdf',
  authenticate,
  apiRateLimit,
  ...analyticsValidation.generateClubPdfReport,
  generateClubPdfReport
);

// Recevoir un batch d'impressions (depuis sync-agent Raspberry)
// Auth: Bearer <site_api_key> (optionnel — fallback sur site_id dans le body)
// Body: { impressions: AdvertiserImpression[] }
// Note: Les impressions sont envoyées par le sync-agent du Raspberry.
// L'auth par API key est préférée mais optionnelle pour éviter de perdre
// des données si la clé est mal configurée sur un Pi.
// Rate limit dédié: 500 req/min (plus permissif car Pi de confiance)
router.post(
  '/impressions',
  piAnalyticsRateLimit,
  authenticateSiteApiKeyOptional,
  analyticsValidation.recordImpressions,
  recordImpressions
);

// Calculer les stats quotidiennes (cron job - admin only)
// Body: { date: 'YYYY-MM-DD' }
router.post(
  '/advertisers/calculate-daily-stats',
  authenticate,
  requireRole('admin'),
  apiRateLimit,
  analyticsValidation.calculateDailyStats,
  calculateDailyStats
);

// ============================================================================
// BACKWARD COMPATIBILITY ROUTES (will be removed after migration)
// ============================================================================

// Redirect old sponsor routes to new advertiser routes
import {
  listSponsors,
  getSponsor,
  createSponsor,
  updateSponsor,
  deleteSponsor,
  addVideosToSponsor,
  removeVideoFromSponsor,
  getSponsorVideos,
  getSponsorStats,
  exportSponsorData,
  generateSponsorPdfReport,
} from '../controllers/advertiser-analytics.controller';

router.get('/sponsors', authenticate, apiRateLimit, listSponsors);
router.get('/sponsors/:id', authenticate, apiRateLimit, analyticsValidation.getAdvertiser, getSponsor);
router.post('/sponsors', authenticate, requireRole('admin', 'operator'), apiRateLimit, analyticsValidation.createAdvertiser, createSponsor);
router.put('/sponsors/:id', authenticate, requireRole('admin', 'operator'), apiRateLimit, ...analyticsValidation.updateAdvertiser, updateSponsor);
router.delete('/sponsors/:id', authenticate, requireRole('admin'), apiRateLimit, analyticsValidation.deleteAdvertiser, deleteSponsor);
router.get('/sponsors/:id/videos', authenticate, apiRateLimit, analyticsValidation.getAdvertiserVideos, getSponsorVideos);
router.post('/sponsors/:id/videos', authenticate, requireRole('admin', 'operator'), apiRateLimit, ...analyticsValidation.addVideosToAdvertiser, addVideosToSponsor);
router.delete('/sponsors/:id/videos/:videoId', authenticate, requireRole('admin', 'operator'), apiRateLimit, analyticsValidation.removeVideoFromAdvertiser, removeVideoFromSponsor);
router.get('/sponsors/:id/stats', authenticate, apiRateLimit, ...analyticsValidation.getAdvertiserStats, getSponsorStats);
router.get('/sponsors/:id/export', authenticate, apiRateLimit, ...analyticsValidation.exportAdvertiserData, exportSponsorData);
router.get('/sponsors/:id/report/pdf', authenticate, apiRateLimit, ...analyticsValidation.generateAdvertiserPdfReport, generateSponsorPdfReport);
router.post('/sponsors/calculate-daily-stats', authenticate, requireRole('admin'), apiRateLimit, analyticsValidation.calculateDailyStats, calculateDailyStats);

export default router;
