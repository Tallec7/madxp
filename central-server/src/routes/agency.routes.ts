import express from 'express';
import { authenticate, requireRole, requireAdmin } from '../middleware/auth';
import { validate, validateParams, validateQuery, paramSchemas, querySchemas, schemas } from '../middleware/validation';
import {
  // CRUD Agences (admin)
  listAgencies,
  getAgency,
  createAgency,
  updateAgency,
  deleteAgency,
  addSitesToAgency,
  removeSiteFromAgency,
  getAgencySitesAdmin,
  // Portail Agence
  getAgencyDashboard,
  getAgencySites,
  getAgencySiteDetails,
  getAgencyStats,
} from '../controllers/agency.controller';

const router = express.Router();

// ============================================================================
// AGENCY PORTAL ROUTES (must be before /:id routes to avoid conflict)
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
  validateParams(paramSchemas.siteId),
  getAgencySiteDetails
);

// Statistiques de l'agence
router.get(
  '/portal/stats',
  authenticate,
  requireRole('agency', 'admin', 'super_admin'),
  validateQuery(querySchemas.dateRange),
  getAgencyStats
);

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
  validateParams(paramSchemas.id),
  getAgency
);

// Créer une agence (admin only)
router.post(
  '/',
  authenticate,
  requireAdmin(),
  validate(schemas.createAgency),
  createAgency
);

// Mettre à jour une agence (admin only)
router.put(
  '/:id',
  authenticate,
  requireAdmin(),
  validateParams(paramSchemas.id),
  validate(schemas.updateAgency),
  updateAgency
);

// Supprimer une agence (admin only)
router.delete(
  '/:id',
  authenticate,
  requireAdmin(),
  validateParams(paramSchemas.id),
  deleteAgency
);

// ============================================================================
// AGENCY-SITE ASSOCIATION (Admin only)
// ============================================================================

// Récupérer les sites d'une agence
router.get(
  '/:id/sites',
  authenticate,
  requireAdmin(),
  validateParams(paramSchemas.id),
  getAgencySitesAdmin
);

// Associer des sites à une agence
router.post(
  '/:id/sites',
  authenticate,
  requireAdmin(),
  validateParams(paramSchemas.id),
  validate(schemas.addSitesToAgency),
  addSitesToAgency
);

// Retirer un site d'une agence
router.delete(
  '/:id/sites/:siteId',
  authenticate,
  requireAdmin(),
  validateParams(paramSchemas.idAndSiteId),
  removeSiteFromAgency
);

export default router;
