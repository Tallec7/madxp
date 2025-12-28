import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getSponsorSites,
  addSitesToSponsor,
  updateSponsorSite,
  removeSiteFromSponsor,
  getSiteSponsors,
} from '../controllers/sponsor-sites.controller';

const router = express.Router();

// =============================================================================
// SPONSOR-SITES ROUTES
// Gestion des associations sponsors <-> sites avec contrats
// =============================================================================

// -----------------------------------------------------------------------------
// Routes Sponsor → Sites
// -----------------------------------------------------------------------------

/**
 * GET /api/sponsors/:id/sites
 * Liste des sites associés à un sponsor avec statut de contrat.
 *
 * Query params:
 *   - include_inactive: boolean (défaut: false) - inclure les associations désactivées
 *
 * Auth: admin, operator (lecture pour tout sponsor)
 */
router.get(
  '/sponsors/:id/sites',
  authenticate,
  requireRole('admin', 'operator'),
  getSponsorSites
);

/**
 * POST /api/sponsors/:id/sites
 * Associer un ou plusieurs sites à un sponsor.
 *
 * Body:
 *   - site_ids: string[] (required) - UUIDs des sites à associer
 *   - contract_start: string (optional) - Date de début de contrat ISO
 *   - contract_end: string (optional) - Date de fin de contrat ISO
 *
 * Auth: admin, operator
 */
router.post(
  '/sponsors/:id/sites',
  authenticate,
  requireRole('admin', 'operator'),
  addSitesToSponsor
);

/**
 * PUT /api/sponsors/:sponsorId/sites/:siteId
 * Modifier le contrat d'une association sponsor-site.
 *
 * Body:
 *   - contract_start: string | null (optional) - Date de début, null pour supprimer
 *   - contract_end: string | null (optional) - Date de fin, null pour supprimer
 *   - is_active: boolean (optional) - Activer/désactiver l'association
 *
 * Auth: admin, operator
 */
router.put(
  '/sponsors/:sponsorId/sites/:siteId',
  authenticate,
  requireRole('admin', 'operator'),
  updateSponsorSite
);

/**
 * DELETE /api/sponsors/:sponsorId/sites/:siteId
 * Supprimer une association sponsor-site.
 *
 * Query params:
 *   - soft: boolean (défaut: true) - soft delete (is_active=false) vs hard delete
 *
 * Auth: admin only pour hard delete, admin/operator pour soft delete
 */
router.delete(
  '/sponsors/:sponsorId/sites/:siteId',
  authenticate,
  requireRole('admin', 'operator'),
  removeSiteFromSponsor
);

// -----------------------------------------------------------------------------
// Routes Site → Sponsors
// -----------------------------------------------------------------------------

/**
 * GET /api/sites/:id/sponsors
 * Liste des sponsors associés à un site.
 *
 * Query params:
 *   - active_only: boolean (défaut: true) - uniquement les contrats actifs
 *
 * Auth: admin, operator
 */
router.get(
  '/sites/:id/sponsors',
  authenticate,
  requireRole('admin', 'operator'),
  getSiteSponsors
);

export default router;
