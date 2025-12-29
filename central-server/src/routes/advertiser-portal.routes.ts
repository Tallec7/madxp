import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getAdvertiserDashboard,
  getAdvertiserSites,
  getAdvertiserVideos,
  getAdvertiserDetailedStats,
} from '../controllers/advertiser-portal.controller';

const router = express.Router();

// ============================================================================
// ADVERTISER PORTAL ROUTES
// Toutes les routes sont accessibles aux utilisateurs avec rôle 'advertiser'
// Chaque endpoint vérifie en interne que l'utilisateur accède à ses propres données
// ============================================================================

// Dashboard de l'annonceur
router.get(
  '/dashboard',
  authenticate,
  requireRole('advertiser', 'admin', 'superadmin', 'super_admin'),
  getAdvertiserDashboard
);

// Liste des sites où l'annonceur est diffusé
router.get(
  '/sites',
  authenticate,
  requireRole('advertiser', 'admin', 'superadmin', 'super_admin'),
  getAdvertiserSites
);

// Liste des vidéos de l'annonceur
router.get(
  '/videos',
  authenticate,
  requireRole('advertiser', 'admin', 'superadmin', 'super_admin'),
  getAdvertiserVideos
);

// Statistiques détaillées
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  '/stats',
  authenticate,
  requireRole('advertiser', 'admin', 'superadmin', 'super_admin'),
  getAdvertiserDetailedStats
);

export default router;
