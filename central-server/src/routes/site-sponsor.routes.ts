import express from 'express';
import { authenticate, requireRole, requireClubScope, requireClubPermission } from '../middleware/auth';
import { siteSponsorValidation } from '../middleware/analytics-validation';
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

// Scope guard club : un club ne gère QUE les sponsors de son propre site.
// #1103 a ouvert ces routes à 'club' + requireClubPermission, mais sans scope :
// requireRole laisse passer un club listé dans allowedRoles SANS vérifier que
// :siteId === user.site_id (le scope ne venait que du bypass, désormais GET-only).
// Sans ce guard, un club pourrait lire/écrire les sponsors d'un AUTRE site en
// passant son :siteId. Les rôles internes (admin/operator) bypassent. (2026-06-12)
const clubScopeBySiteId = requireClubScope((req) => req.params.siteId);

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
  requireRole('admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('manage_sponsors'),
  ...siteSponsorValidation.listSiteSponsors,
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
  requireRole('admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('manage_sponsors'),
  ...siteSponsorValidation.getSiteSponsorBenchmark,
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
  requireRole('admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('manage_sponsors'),
  siteSponsorValidation.getSiteSponsor,
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
  requireRole('admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('manage_sponsors'),
  ...siteSponsorValidation.createSiteSponsor,
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
  requireRole('admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('manage_sponsors'),
  ...siteSponsorValidation.updateSiteSponsor,
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
  requireRole('admin', 'club'),
  clubScopeBySiteId,
  requireClubPermission('manage_sponsors'),
  siteSponsorValidation.deleteSiteSponsor,
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
  requireRole('admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('manage_sponsors'),
  ...siteSponsorValidation.getSiteSponsorStats,
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
  requireRole('admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('manage_sponsors'),
  ...siteSponsorValidation.addVideoToSiteSponsor,
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
  requireRole('admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('manage_sponsors'),
  siteSponsorValidation.removeVideoFromSiteSponsor,
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
  requireRole('admin', 'operator', 'club'),
  clubScopeBySiteId,
  requireClubPermission('manage_sponsors'),
  siteSponsorValidation.createAccessLink,
  createAccessLink
);

export default router;
