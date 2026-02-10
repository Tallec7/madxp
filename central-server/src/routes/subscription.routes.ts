/**
 * Subscription Routes
 *
 * Routes pour la gestion des abonnements Neopro
 */

import { Router } from 'express';
import { authenticate, requireRole, requireSuperAdmin } from '../middleware/auth';
import { adminRateLimit, sensitiveRateLimit } from '../middleware/user-rate-limit';
import { validate, schemas } from '../middleware/validation';
import {
  getSubscriptionStats,
  getSitesAtRisk,
  getSuspensionReasons,
  getSiteSubscription,
  getSubscriptionHistory,
  extendSubscription,
  suspendSite,
  reactivateSite,
  changePlan,
  getLicenseStatus,
  updateSubscription,
} from '../controllers/subscription.controller';

const router = Router();

// Toutes les routes nécessitent une authentification
router.use(authenticate);

// ============================================================================
// Global Subscription Routes
// ============================================================================

/**
 * GET /api/subscriptions/stats
 * Statistiques globales des abonnements
 * Accessible par: super_admin, admin
 */
router.get(
  '/stats',
  requireRole('admin'),
  adminRateLimit,
  getSubscriptionStats
);

/**
 * GET /api/subscriptions/at-risk
 * Sites à risque (expirent bientôt, suspendus, etc.)
 * Accessible par: super_admin, admin
 */
router.get(
  '/at-risk',
  requireRole('admin'),
  adminRateLimit,
  getSitesAtRisk
);

/**
 * GET /api/subscriptions/reasons
 * Liste des motifs de suspension
 * Accessible par: super_admin, admin
 */
router.get(
  '/reasons',
  requireRole('admin'),
  adminRateLimit,
  getSuspensionReasons
);

export default router;

// ============================================================================
// Site-specific Subscription Routes (montées sur /api/sites/:id/subscription)
// Ces routes sont exportées séparément pour être montées dans sites.routes.ts
// ============================================================================

export const siteSubscriptionRouter = Router({ mergeParams: true });

// Lecture - accessible par admin et operator (pour leurs sites)
siteSubscriptionRouter.use(authenticate);

/**
 * GET /api/sites/:id/subscription
 * Détails d'abonnement d'un site
 */
siteSubscriptionRouter.get(
  '/',
  requireRole('admin', 'operator'),
  adminRateLimit,
  getSiteSubscription
);

/**
 * GET /api/sites/:id/subscription/history
 * Historique des changements d'abonnement
 */
siteSubscriptionRouter.get(
  '/history',
  requireRole('admin'),
  adminRateLimit,
  getSubscriptionHistory
);

/**
 * GET /api/sites/:id/subscription/license-status
 * Statut de licence calculé (pour debug/preview)
 */
siteSubscriptionRouter.get(
  '/license-status',
  requireRole('admin'),
  adminRateLimit,
  getLicenseStatus
);

// Écriture - accessible uniquement par super_admin et admin
/**
 * PUT /api/sites/:id/subscription/extend
 * Prolonger l'abonnement
 */
siteSubscriptionRouter.put(
  '/extend',
  requireRole('admin'),
  sensitiveRateLimit,
  validate(schemas.extendSubscription),
  extendSubscription
);

/**
 * POST /api/sites/:id/subscription/suspend
 * Suspendre le site
 */
siteSubscriptionRouter.post(
  '/suspend',
  requireRole('admin'),
  sensitiveRateLimit,
  validate(schemas.suspendSite),
  suspendSite
);

/**
 * POST /api/sites/:id/subscription/reactivate
 * Réactiver le site
 */
siteSubscriptionRouter.post(
  '/reactivate',
  requireRole('admin'),
  sensitiveRateLimit,
  validate(schemas.reactivateSite),
  reactivateSite
);

/**
 * PUT /api/sites/:id/subscription/plan
 * Changer le plan (super_admin uniquement)
 */
siteSubscriptionRouter.put(
  '/plan',
  requireSuperAdmin(),
  sensitiveRateLimit,
  validate(schemas.changePlan),
  changePlan
);

/**
 * PUT /api/sites/:id/subscription
 * Configurer l'abonnement (date début, date fin, plan)
 * Permet de tout mettre à jour en une seule opération
 */
siteSubscriptionRouter.put(
  '/',
  requireRole('admin'),
  sensitiveRateLimit,
  validate(schemas.updateSubscription),
  updateSubscription
);
