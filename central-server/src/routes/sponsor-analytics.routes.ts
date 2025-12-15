import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
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
  recordImpressions,
  exportSponsorData,
  calculateDailyStats,
  generateSponsorPdfReport,
  generateClubPdfReport,
} from '../controllers/sponsor-analytics.controller';

const router = express.Router();

// ============================================================================
// SPONSOR CRUD
// ============================================================================

// Liste tous les sponsors
router.get(
  '/sponsors',
  authenticate,
  listSponsors
);

// Récupérer un sponsor par ID
router.get(
  '/sponsors/:id',
  authenticate,
  getSponsor
);

// Créer un nouveau sponsor (admin/operator only)
router.post(
  '/sponsors',
  authenticate,
  requireRole('admin', 'operator'),
  createSponsor
);

// Mettre à jour un sponsor (admin/operator only)
router.put(
  '/sponsors/:id',
  authenticate,
  requireRole('admin', 'operator'),
  updateSponsor
);

// Supprimer un sponsor (admin only)
router.delete(
  '/sponsors/:id',
  authenticate,
  requireRole('admin'),
  deleteSponsor
);

// ============================================================================
// SPONSOR-VIDEO ASSOCIATION
// ============================================================================

// Récupérer les vidéos d'un sponsor
router.get(
  '/sponsors/:id/videos',
  authenticate,
  getSponsorVideos
);

// Associer des vidéos à un sponsor (admin/operator only)
router.post(
  '/sponsors/:id/videos',
  authenticate,
  requireRole('admin', 'operator'),
  addVideosToSponsor
);

// Dissocier une vidéo d'un sponsor (admin/operator only)
router.delete(
  '/sponsors/:id/videos/:videoId',
  authenticate,
  requireRole('admin', 'operator'),
  removeVideoFromSponsor
);

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

// Récupérer les analytics d'un sponsor
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/sponsors/:id/stats',
  authenticate,
  getSponsorStats
);

// Export CSV des données sponsor
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
router.get(
  '/sponsors/:id/export',
  authenticate,
  exportSponsorData
);

// Générer un rapport PDF pour un sponsor
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/sponsors/:id/report/pdf',
  authenticate,
  generateSponsorPdfReport
);

// Générer un rapport PDF pour un club
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/clubs/:siteId/report/pdf',
  authenticate,
  generateClubPdfReport
);

// Recevoir un batch d'impressions (depuis sync-agent via API key auth)
// Body: { impressions: SponsorImpression[] }
router.post(
  '/impressions',
  authenticate,
  recordImpressions
);

// Calculer les stats quotidiennes (cron job - admin only)
// Body: { date: 'YYYY-MM-DD' }
router.post(
  '/sponsors/calculate-daily-stats',
  authenticate,
  requireRole('admin'),
  calculateDailyStats
);

export default router;
