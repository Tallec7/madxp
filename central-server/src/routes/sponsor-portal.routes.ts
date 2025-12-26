import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getSponsorDashboard,
  getSponsorSites,
  getSponsorVideos,
  getSponsorDetailedStats,
} from '../controllers/sponsor-portal.controller';

const router = express.Router();

// ============================================================================
// SPONSOR PORTAL ROUTES
// Toutes les routes sont accessibles aux utilisateurs avec rôle 'sponsor'
// Chaque endpoint vérifie en interne que l'utilisateur accède à ses propres données
// ============================================================================

// Dashboard du sponsor
router.get(
  '/dashboard',
  authenticate,
  requireRole('sponsor', 'admin', 'super_admin'),
  getSponsorDashboard
);

// Liste des sites où le sponsor est diffusé
router.get(
  '/sites',
  authenticate,
  requireRole('sponsor', 'admin', 'super_admin'),
  getSponsorSites
);

// Liste des vidéos du sponsor
router.get(
  '/videos',
  authenticate,
  requireRole('sponsor', 'admin', 'super_admin'),
  getSponsorVideos
);

// Statistiques détaillées
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/stats',
  authenticate,
  requireRole('sponsor', 'admin', 'super_admin'),
  getSponsorDetailedStats
);

export default router;
