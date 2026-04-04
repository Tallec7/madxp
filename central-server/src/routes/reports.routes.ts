/**
 * Reports Routes
 *
 * Routes pour la gestion des rapports PDF générés
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validateParams, validateQuery, paramSchemas, querySchemas, schemas } from '../middleware/validation';
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
router.get('/clubs/:siteId', validateParams(paramSchemas.siteId), listClubReports);

// Routes annonceur (accessibles aux advertisers, agencies et admins)
router.get('/advertisers/:advertiserId', validateParams(paramSchemas.advertiserId), listAdvertiserReports);

// Routes sponsor local (accessibles aux operators et admins)
router.get('/site-sponsors/:siteSponsorId', validateParams(paramSchemas.siteSponsorId), listSiteSponsorReports);

// Récupérer un rapport spécifique
router.get('/:reportId', validateParams(paramSchemas.reportId), getReport);

// Générer un rapport à la demande (admin uniquement)
router.post('/generate', requireRole('admin', 'super_admin'), validate(schemas.generateReport), generateReport);

// Liste tous les rapports (admin uniquement)
router.get('/', requireRole('admin', 'super_admin'), validateQuery(querySchemas.listReports), listAllReports);

// Statistiques des rapports (admin uniquement)
router.get('/stats', requireRole('admin', 'super_admin'), getReportStats);

export default router;
