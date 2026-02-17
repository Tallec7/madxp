import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  listSiteSponsors,
  getSiteSponsor,
  createSiteSponsor,
  updateSiteSponsor,
  deleteSiteSponsor,
  getSiteSponsorStats,
  getSiteSponsorBenchmark,
  addVideoToSiteSponsor,
  removeVideoFromSiteSponsor,
  createAccessLink,
} from '../controllers/site-sponsor.controller';

const router = express.Router();

// =============================================================================
// SITE-SPONSOR ROUTES
// Gestion des sponsors par site (modèle unifié local + neopro)
// Montées sur /api/sites
// =============================================================================

/**
 * GET /api/sites/:siteId/sponsors
 * Liste les sponsors d'un site avec nombre de vidéos et impressions.
 *
 * Query params:
 *   - include_inactive: boolean (défaut: false)
 *
 * Auth: admin, operator
 */
router.get(
  '/:siteId/sponsors',
  authenticate,
  requireRole('admin', 'operator'),
  listSiteSponsors
);

/**
 * GET /api/sites/:siteId/sponsors/benchmark
 * Benchmark intra-club : classement des sponsors actifs d'un site.
 * AVANT /:sponsorId pour eviter capture de "benchmark" comme UUID.
 *
 * Auth: admin, operator
 */
router.get(
  '/:siteId/sponsors/benchmark',
  authenticate,
  requireRole('admin', 'operator'),
  getSiteSponsorBenchmark
);

/**
 * GET /api/sites/:siteId/sponsors/:sponsorId
 * Détail d'un sponsor de site avec ses vidéos.
 *
 * Auth: admin, operator
 */
router.get(
  '/:siteId/sponsors/:sponsorId',
  authenticate,
  requireRole('admin', 'operator'),
  getSiteSponsor
);

/**
 * POST /api/sites/:siteId/sponsors
 * Créer un sponsor local pour un site.
 *
 * Body:
 *   - name: string (required)
 *   - contact_name, contact_email, contact_phone: string (optional)
 *   - logo_url: string (optional)
 *   - contract_amount: number (optional)
 *   - contract_start, contract_end: string ISO date (optional)
 *   - metadata: object (optional)
 *
 * Auth: admin, operator
 */
router.post(
  '/:siteId/sponsors',
  authenticate,
  requireRole('admin', 'operator'),
  createSiteSponsor
);

/**
 * PUT /api/sites/:siteId/sponsors/:sponsorId
 * Modifier un sponsor de site.
 *
 * Auth: admin, operator
 */
router.put(
  '/:siteId/sponsors/:sponsorId',
  authenticate,
  requireRole('admin', 'operator'),
  updateSiteSponsor
);

/**
 * DELETE /api/sites/:siteId/sponsors/:sponsorId
 * Supprimer un sponsor de site.
 *
 * Auth: admin
 */
router.delete(
  '/:siteId/sponsors/:sponsorId',
  authenticate,
  requireRole('admin'),
  deleteSiteSponsor
);

/**
 * GET /api/sites/:siteId/sponsors/:sponsorId/stats
 * Stats d'un sponsor de site sur une période.
 *
 * Query params:
 *   - from: string ISO date (défaut: 30 jours)
 *   - to: string ISO date (défaut: aujourd'hui)
 *
 * Auth: admin, operator
 */
router.get(
  '/:siteId/sponsors/:sponsorId/stats',
  authenticate,
  requireRole('admin', 'operator'),
  getSiteSponsorStats
);

/**
 * POST /api/sites/:siteId/sponsors/:sponsorId/videos
 * Associer une vidéo à un sponsor de site.
 *
 * Body:
 *   - video_id: string UUID (optional)
 *   - video_filename: string (required)
 *   - is_primary: boolean (optional, défaut: false)
 *
 * Auth: admin, operator
 */
router.post(
  '/:siteId/sponsors/:sponsorId/videos',
  authenticate,
  requireRole('admin', 'operator'),
  addVideoToSiteSponsor
);

/**
 * DELETE /api/sites/:siteId/sponsors/:sponsorId/videos/:filename
 * Retirer une vidéo d'un sponsor de site.
 *
 * Auth: admin, operator
 */
router.delete(
  '/:siteId/sponsors/:sponsorId/videos/:filename',
  authenticate,
  requireRole('admin', 'operator'),
  removeVideoFromSiteSponsor
);

/**
 * POST /api/sites/:siteId/sponsors/:sponsorId/access-link
 * Generer un magic link d'acces pour le sponsor.
 * Envoie un email si contact_email existe.
 *
 * Auth: admin, operator
 */
router.post(
  '/:siteId/sponsors/:sponsorId/access-link',
  authenticate,
  requireRole('admin', 'operator'),
  createAccessLink
);

export default router;
