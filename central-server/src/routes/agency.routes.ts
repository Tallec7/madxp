import express from 'express';
import { authenticate, requireRole, requireAdmin } from '../middleware/auth';
import {
  // CRUD Agences (admin)
  listAgencies,
  getAgency,
  createAgency,
  updateAgency,
  deleteAgency,
  addSitesToAgency,
  removeSiteFromAgency,
  // Portail Agence
  getAgencyDashboard,
  getAgencySites,
  getAgencySiteDetails,
  getAgencyStats,
} from '../controllers/agency.controller';

const router = express.Router();

// ============================================================================
// AGENCY CRUD (Admin only)
// ============================================================================

// Liste toutes les agences
router.get(
  '/',
  authenticate,
  requireRole('admin', 'super_admin', 'agency'),
  listAgencies
);

// Récupérer une agence
router.get(
  '/:id',
  authenticate,
  requireRole('admin', 'super_admin', 'agency'),
  getAgency
);

// Créer une agence (admin only)
router.post(
  '/',
  authenticate,
  requireAdmin(),
  createAgency
);

// Mettre à jour une agence (admin only)
router.put(
  '/:id',
  authenticate,
  requireAdmin(),
  updateAgency
);

// Supprimer une agence (admin only)
router.delete(
  '/:id',
  authenticate,
  requireAdmin(),
  deleteAgency
);

// ============================================================================
// AGENCY-SITE ASSOCIATION (Admin only)
// ============================================================================

// Associer des sites à une agence
router.post(
  '/:id/sites',
  authenticate,
  requireAdmin(),
  addSitesToAgency
);

// Retirer un site d'une agence
router.delete(
  '/:id/sites/:siteId',
  authenticate,
  requireAdmin(),
  removeSiteFromAgency
);

// ============================================================================
// AGENCY PORTAL ROUTES
// ============================================================================

// Dashboard de l'agence connectée
router.get(
  '/portal/dashboard',
  authenticate,
  requireRole('agency', 'admin', 'super_admin'),
  getAgencyDashboard
);

// Sites de l'agence
router.get(
  '/portal/sites',
  authenticate,
  requireRole('agency', 'admin', 'super_admin'),
  getAgencySites
);

// Détails d'un site
router.get(
  '/portal/sites/:siteId',
  authenticate,
  requireRole('agency', 'admin', 'super_admin'),
  getAgencySiteDetails
);

// Statistiques de l'agence
router.get(
  '/portal/stats',
  authenticate,
  requireRole('agency', 'admin', 'super_admin'),
  getAgencyStats
);

export default router;
