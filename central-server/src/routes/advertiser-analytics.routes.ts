import express from 'express';
import { authenticate, authenticateSiteApiKey } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { apiRateLimit, piAnalyticsRateLimit } from '../middleware/user-rate-limit';
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
  getAdvertiser
);

// Créer un nouvel annonceur (admin/operator only)
router.post(
  '/advertisers',
  authenticate,
  requireRole('super_admin', 'superadmin', 'admin', 'operator'),
  apiRateLimit,
  createAdvertiser
);

// Mettre à jour un annonceur (admin/operator only)
router.put(
  '/advertisers/:id',
  authenticate,
  requireRole('super_admin', 'superadmin', 'admin', 'operator'),
  apiRateLimit,
  updateAdvertiser
);

// Supprimer un annonceur (admin only)
router.delete(
  '/advertisers/:id',
  authenticate,
  requireRole('super_admin', 'superadmin', 'admin'),
  apiRateLimit,
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
  getAdvertiserVideos
);

// Associer des vidéos à un annonceur (admin/operator only)
router.post(
  '/advertisers/:id/videos',
  authenticate,
  requireRole('super_admin', 'superadmin', 'admin', 'operator'),
  apiRateLimit,
  addVideosToAdvertiser
);

// Dissocier une vidéo d'un annonceur (admin/operator only)
router.delete(
  '/advertisers/:id/videos/:videoId',
  authenticate,
  requireRole('super_admin', 'superadmin', 'admin', 'operator'),
  apiRateLimit,
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
  getAdvertiserStats
);

// Export CSV des données annonceur
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
router.get(
  '/advertisers/:id/export',
  authenticate,
  apiRateLimit,
  exportAdvertiserData
);

// Générer un rapport PDF pour un annonceur
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/advertisers/:id/report/pdf',
  authenticate,
  apiRateLimit,
  generateAdvertiserPdfReport
);

// Export Excel avancé pour un annonceur
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
import * as analyticsController from '../controllers/analytics.controller';
router.get(
  '/advertisers/:advertiserId/export/excel',
  authenticate,
  apiRateLimit,
  analyticsController.exportAdvertiserExcel
);

// Générer un rapport PDF pour un club
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/clubs/:siteId/report/pdf',
  authenticate,
  apiRateLimit,
  generateClubPdfReport
);

// Recevoir un batch d'impressions (depuis sync-agent Raspberry via API key)
// Header requis: Authorization: Bearer <site_api_key>
// Body: { impressions: AdvertiserImpression[] }
// Note: Les impressions sont envoyées par le sync-agent du Raspberry,
// authentifié par l'API key du site (pas un token utilisateur JWT)
// Rate limit dédié: 500 req/min (plus permissif car Pi de confiance)
router.post(
  '/impressions',
  piAnalyticsRateLimit,
  authenticateSiteApiKey,
  recordImpressions
);

// Calculer les stats quotidiennes (cron job - admin only)
// Body: { date: 'YYYY-MM-DD' }
router.post(
  '/advertisers/calculate-daily-stats',
  authenticate,
  requireRole('super_admin', 'superadmin', 'admin'),
  apiRateLimit,
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
router.get('/sponsors/:id', authenticate, apiRateLimit, getSponsor);
router.post('/sponsors', authenticate, requireRole('super_admin', 'superadmin', 'admin', 'operator'), apiRateLimit, createSponsor);
router.put('/sponsors/:id', authenticate, requireRole('super_admin', 'superadmin', 'admin', 'operator'), apiRateLimit, updateSponsor);
router.delete('/sponsors/:id', authenticate, requireRole('super_admin', 'superadmin', 'admin'), apiRateLimit, deleteSponsor);
router.get('/sponsors/:id/videos', authenticate, apiRateLimit, getSponsorVideos);
router.post('/sponsors/:id/videos', authenticate, requireRole('super_admin', 'superadmin', 'admin', 'operator'), apiRateLimit, addVideosToSponsor);
router.delete('/sponsors/:id/videos/:videoId', authenticate, requireRole('super_admin', 'superadmin', 'admin', 'operator'), apiRateLimit, removeVideoFromSponsor);
router.get('/sponsors/:id/stats', authenticate, apiRateLimit, getSponsorStats);
router.get('/sponsors/:id/export', authenticate, apiRateLimit, exportSponsorData);
router.get('/sponsors/:id/report/pdf', authenticate, apiRateLimit, generateSponsorPdfReport);
router.post('/sponsors/calculate-daily-stats', authenticate, requireRole('super_admin', 'superadmin', 'admin'), apiRateLimit, calculateDailyStats);

export default router;
