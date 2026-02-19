/**
 * Reports Routes
 *
 * Routes pour la gestion des rapports PDF générés
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  listClubReports,
  listAdvertiserReports,
  listSiteSponsorReports,
  getReport,
  generateReport,
  listAllReports,
  getReportStats,
} from '../controllers/reports.controller';

const router = Router();

// Toutes les routes nécessitent une authentification
router.use(authenticate);

// Routes club (accessibles aux operators et admins)
router.get('/clubs/:siteId', listClubReports);

// Routes annonceur (accessibles aux advertisers, agencies et admins)
router.get('/advertisers/:advertiserId', listAdvertiserReports);

// Routes sponsor local (accessibles aux operators et admins)
router.get('/site-sponsors/:siteSponsorId', listSiteSponsorReports);

// Récupérer un rapport spécifique
router.get('/:reportId', getReport);

// Générer un rapport à la demande (admin uniquement)
router.post('/generate', requireRole('admin', 'super_admin'), generateReport);

// Liste tous les rapports (admin uniquement)
router.get('/', requireRole('admin', 'super_admin'), listAllReports);

// Statistiques des rapports (admin uniquement)
router.get('/stats', requireRole('admin', 'super_admin'), getReportStats);

export default router;
