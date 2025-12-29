import express from 'express';
import { authenticate, authenticateSiteApiKey } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
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
  listAdvertisers
);

// Récupérer un annonceur par ID
router.get(
  '/advertisers/:id',
  authenticate,
  getAdvertiser
);

// Créer un nouvel annonceur (admin/operator only)
router.post(
  '/advertisers',
  authenticate,
  requireRole('superadmin', 'admin', 'operator'),
  createAdvertiser
);

// Mettre à jour un annonceur (admin/operator only)
router.put(
  '/advertisers/:id',
  authenticate,
  requireRole('superadmin', 'admin', 'operator'),
  updateAdvertiser
);

// Supprimer un annonceur (admin only)
router.delete(
  '/advertisers/:id',
  authenticate,
  requireRole('superadmin', 'admin'),
  deleteAdvertiser
);

// ============================================================================
// ADVERTISER-VIDEO ASSOCIATION
// ============================================================================

// Récupérer les vidéos d'un annonceur
router.get(
  '/advertisers/:id/videos',
  authenticate,
  getAdvertiserVideos
);

// Associer des vidéos à un annonceur (admin/operator only)
router.post(
  '/advertisers/:id/videos',
  authenticate,
  requireRole('superadmin', 'admin', 'operator'),
  addVideosToAdvertiser
);

// Dissocier une vidéo d'un annonceur (admin/operator only)
router.delete(
  '/advertisers/:id/videos/:videoId',
  authenticate,
  requireRole('superadmin', 'admin', 'operator'),
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
  getAdvertiserStats
);

// Export CSV des données annonceur
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
router.get(
  '/advertisers/:id/export',
  authenticate,
  exportAdvertiserData
);

// Générer un rapport PDF pour un annonceur
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/advertisers/:id/report/pdf',
  authenticate,
  generateAdvertiserPdfReport
);

// Générer un rapport PDF pour un club
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/clubs/:siteId/report/pdf',
  authenticate,
  generateClubPdfReport
);

// Recevoir un batch d'impressions (depuis sync-agent Raspberry via API key)
// Header requis: Authorization: Bearer <site_api_key>
// Body: { impressions: AdvertiserImpression[] }
// Note: Les impressions sont envoyées par le sync-agent du Raspberry,
// authentifié par l'API key du site (pas un token utilisateur JWT)
router.post(
  '/impressions',
  authenticateSiteApiKey,
  recordImpressions
);

// Calculer les stats quotidiennes (cron job - admin only)
// Body: { date: 'YYYY-MM-DD' }
router.post(
  '/advertisers/calculate-daily-stats',
  authenticate,
  requireRole('superadmin', 'admin'),
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

router.get('/sponsors', authenticate, listSponsors);
router.get('/sponsors/:id', authenticate, getSponsor);
router.post('/sponsors', authenticate, requireRole('superadmin', 'admin', 'operator'), createSponsor);
router.put('/sponsors/:id', authenticate, requireRole('superadmin', 'admin', 'operator'), updateSponsor);
router.delete('/sponsors/:id', authenticate, requireRole('superadmin', 'admin'), deleteSponsor);
router.get('/sponsors/:id/videos', authenticate, getSponsorVideos);
router.post('/sponsors/:id/videos', authenticate, requireRole('superadmin', 'admin', 'operator'), addVideosToSponsor);
router.delete('/sponsors/:id/videos/:videoId', authenticate, requireRole('superadmin', 'admin', 'operator'), removeVideoFromSponsor);
router.get('/sponsors/:id/stats', authenticate, getSponsorStats);
router.get('/sponsors/:id/export', authenticate, exportSponsorData);
router.get('/sponsors/:id/report/pdf', authenticate, generateSponsorPdfReport);
router.post('/sponsors/calculate-daily-stats', authenticate, requireRole('superadmin', 'admin'), calculateDailyStats);

export default router;
