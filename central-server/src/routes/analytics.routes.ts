import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// ============================================================================
// MVP - Health Analytics (données existantes)
// ============================================================================

// GET /api/analytics/clubs/:siteId/health - Dashboard santé technique
router.get('/clubs/:siteId/health', authenticate, analyticsController.getClubHealth);

// GET /api/analytics/clubs/:siteId/availability - Historique disponibilité
router.get('/clubs/:siteId/availability', authenticate, analyticsController.getClubAvailability);

// GET /api/analytics/clubs/:siteId/alerts - Historique alertes
router.get('/clubs/:siteId/alerts', authenticate, analyticsController.getClubAlerts);

// ============================================================================
// Phase 2 - Usage Analytics (tracking vidéos)
// ============================================================================

// POST /api/analytics/video-plays - Enregistrer lectures vidéo (depuis sync-agent)
router.post('/video-plays', analyticsController.recordVideoPlays);

// POST /api/analytics/sessions - Gérer sessions (start/end)
router.post('/sessions', analyticsController.manageSession);

// GET /api/analytics/clubs/:siteId/usage - Stats d'utilisation
router.get('/clubs/:siteId/usage', authenticate, analyticsController.getClubUsage);

// GET /api/analytics/clubs/:siteId/content - Analytics contenu
router.get('/clubs/:siteId/content', authenticate, analyticsController.getClubContent);

// ============================================================================
// Phase 3 - Advanced Analytics
// ============================================================================

// GET /api/analytics/clubs/:siteId/dashboard - Dashboard complet
router.get('/clubs/:siteId/dashboard', authenticate, analyticsController.getClubDashboard);

// GET /api/analytics/clubs/:siteId/export - Export CSV
router.get('/clubs/:siteId/export', authenticate, analyticsController.exportClubData);

// POST /api/analytics/calculate-daily-stats - Calcul stats quotidiennes (cron/admin)
router.post(
  '/calculate-daily-stats',
  authenticate,
  requireRole('admin'),
  analyticsController.calculateDailyStats
);

// GET /api/analytics/overview - Vue d'ensemble tous sites (admin)
router.get('/overview', authenticate, requireRole('admin', 'operator'), analyticsController.getAnalyticsOverview);

// ============================================================================
// Analytics Categories Management
// ============================================================================

// GET /api/analytics/categories - Liste des catégories analytics
router.get('/categories', authenticate, analyticsController.getAnalyticsCategories);

// POST /api/analytics/categories - Créer une catégorie (admin only)
router.post('/categories', authenticate, requireRole('admin'), analyticsController.createAnalyticsCategory);

// PUT /api/analytics/categories/:id - Mettre à jour une catégorie (admin only)
router.put('/categories/:id', authenticate, requireRole('admin'), analyticsController.updateAnalyticsCategory);

// DELETE /api/analytics/categories/:id - Supprimer une catégorie (admin only)
router.delete('/categories/:id', authenticate, requireRole('admin'), analyticsController.deleteAnalyticsCategory);

export default router;
