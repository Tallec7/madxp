import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getAdvertiserSites,
  addSitesToAdvertiser,
  updateAdvertiserSite,
  removeSiteFromAdvertiser,
  getSiteAdvertisers,
} from '../controllers/advertiser-sites.controller';

const router = express.Router();

// =============================================================================
// ADVERTISER-SITES ROUTES
// Gestion des associations annonceurs <-> sites avec contrats
// =============================================================================

// -----------------------------------------------------------------------------
// Routes Advertiser → Sites
// -----------------------------------------------------------------------------

/**
 * GET /api/advertisers/:id/sites
 * Liste des sites associés à un annonceur avec statut de contrat.
 *
 * Query params:
 *   - include_inactive: boolean (défaut: false) - inclure les associations désactivées
 *
 * Auth: admin, operator (lecture pour tout annonceur)
 */
router.get(
  '/advertisers/:id/sites',
  authenticate,
  requireRole('admin', 'operator'),
  getAdvertiserSites
);

/**
 * POST /api/advertisers/:id/sites
 * Associer un ou plusieurs sites à un annonceur.
 *
 * Body:
 *   - site_ids: string[] (required) - UUIDs des sites à associer
 *   - contract_start: string (optional) - Date de début de contrat ISO
 *   - contract_end: string (optional) - Date de fin de contrat ISO
 *
 * Auth: admin, operator
 */
router.post(
  '/advertisers/:id/sites',
  authenticate,
  requireRole('admin', 'operator'),
  addSitesToAdvertiser
);

/**
 * PUT /api/advertisers/:advertiserId/sites/:siteId
 * Modifier le contrat d'une association annonceur-site.
 *
 * Body:
 *   - contract_start: string | null (optional) - Date de début, null pour supprimer
 *   - contract_end: string | null (optional) - Date de fin, null pour supprimer
 *   - is_active: boolean (optional) - Activer/désactiver l'association
 *
 * Auth: admin, operator
 */
router.put(
  '/advertisers/:advertiserId/sites/:siteId',
  authenticate,
  requireRole('admin', 'operator'),
  updateAdvertiserSite
);

/**
 * DELETE /api/advertisers/:advertiserId/sites/:siteId
 * Supprimer une association annonceur-site.
 *
 * Query params:
 *   - soft: boolean (défaut: true) - soft delete (is_active=false) vs hard delete
 *
 * Auth: admin only pour hard delete, admin/operator pour soft delete
 */
router.delete(
  '/advertisers/:advertiserId/sites/:siteId',
  authenticate,
  requireRole('admin', 'operator'),
  removeSiteFromAdvertiser
);

// -----------------------------------------------------------------------------
// Routes Site → Advertisers
// -----------------------------------------------------------------------------

/**
 * GET /api/sites/:id/advertisers
 * Liste des annonceurs associés à un site.
 *
 * Query params:
 *   - active_only: boolean (défaut: true) - uniquement les contrats actifs
 *
 * Auth: admin, operator
 */
router.get(
  '/sites/:id/advertisers',
  authenticate,
  requireRole('admin', 'operator'),
  getSiteAdvertisers
);

// =============================================================================
// BACKWARD COMPATIBILITY ROUTES (will be removed after migration)
// =============================================================================

import {
  getSponsorSites,
  addSitesToSponsor,
  updateSponsorSite,
  removeSiteFromSponsor,
  getSiteSponsors,
} from '../controllers/advertiser-sites.controller';

router.get('/sponsors/:id/sites', authenticate, requireRole('admin', 'operator'), getSponsorSites);
router.post('/sponsors/:id/sites', authenticate, requireRole('admin', 'operator'), addSitesToSponsor);
router.put('/sponsors/:sponsorId/sites/:siteId', authenticate, requireRole('admin', 'operator'), updateSponsorSite);
router.delete('/sponsors/:sponsorId/sites/:siteId', authenticate, requireRole('admin', 'operator'), removeSiteFromSponsor);
router.get('/sites/:id/sponsors', authenticate, requireRole('admin', 'operator'), getSiteSponsors);

export default router;
