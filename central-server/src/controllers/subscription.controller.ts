/**
 * Subscription Controller
 *
 * Endpoints pour la gestion des abonnements :
 * - Statistiques globales
 * - Sites à risque
 * - CRUD abonnement par site
 * - Historique des changements
 */

import { Response } from 'express';
import { subscriptionService } from '../services/subscription.service';
import { auditService } from '../services/audit.service';
import logger from '../config/logger';
import {
  AuthRequest,
  SuspensionReason,
  SubscriptionPlan,
  ExtendSubscriptionRequest,
  SuspendSiteRequest,
  ReactivateSiteRequest,
} from '../types';

// ============================================================================
// Statistics & Overview
// ============================================================================

/**
 * GET /api/subscriptions/stats
 * Récupère les statistiques globales des abonnements
 */
export const getSubscriptionStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = await subscriptionService.getSubscriptionStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching subscription stats', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
};

/**
 * GET /api/subscriptions/at-risk
 * Récupère les sites à risque (expirent bientôt, suspendus, etc.)
 */
export const getSitesAtRisk = async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const sites = await subscriptionService.getSitesAtRisk(limit);
    res.json({ data: sites, total: sites.length });
  } catch (error) {
    logger.error('Error fetching at-risk sites', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des sites à risque' });
  }
};

/**
 * GET /api/subscriptions/reasons
 * Récupère la liste des motifs de suspension
 */
export const getSuspensionReasons = async (req: AuthRequest, res: Response) => {
  try {
    const reasons = await subscriptionService.getAllSuspensionReasons();
    res.json(reasons);
  } catch (error) {
    logger.error('Error fetching suspension reasons', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des motifs' });
  }
};

// ============================================================================
// Site-specific Subscription Management
// ============================================================================

/**
 * GET /api/sites/:id/subscription
 * Récupère les détails d'abonnement d'un site
 */
export const getSiteSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const subscription = await subscriptionService.getSiteSubscription(id);

    if (!subscription) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    res.json(subscription);
  } catch (error) {
    logger.error('Error fetching site subscription', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'abonnement' });
  }
};

/**
 * GET /api/sites/:id/subscription/history
 * Récupère l'historique des changements d'abonnement
 */
export const getSubscriptionHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string, 10) || 50;

    const history = await subscriptionService.getHistory(id, limit);
    res.json({ data: history, total: history.length });
  } catch (error) {
    logger.error('Error fetching subscription history', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
  }
};

/**
 * PUT /api/sites/:id/subscription/extend
 * Prolonge l'abonnement d'un site
 */
export const extendSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { new_end_date, note } = req.body as ExtendSubscriptionRequest;

    if (!new_end_date) {
      return res.status(400).json({ error: 'La nouvelle date de fin est requise' });
    }

    const newEndDate = new Date(new_end_date);
    if (isNaN(newEndDate.getTime())) {
      return res.status(400).json({ error: 'Format de date invalide' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    await subscriptionService.extendSubscription(id, newEndDate, note || null, userId);

    // Audit
    auditService.log({
      action: 'SUBSCRIPTION_EXTENDED',
      userId,
      targetType: 'site',
      targetId: id,
      details: { newEndDate: new_end_date, note },
    });

    res.json({ success: true, message: 'Abonnement prolongé avec succès' });
  } catch (error) {
    logger.error('Error extending subscription', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur lors de la prolongation de l\'abonnement' });
  }
};

/**
 * POST /api/sites/:id/subscription/suspend
 * Suspend un site
 */
export const suspendSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, note } = req.body as SuspendSiteRequest;

    if (!reason) {
      return res.status(400).json({ error: 'Le motif de suspension est requis' });
    }

    // Valider le motif
    const validReasons: SuspensionReason[] = [
      'unpaid', 'expired', 'abuse', 'maintenance', 'request', 'hardware', 'trial_ended', 'connection'
    ];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ error: 'Motif de suspension invalide' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    await subscriptionService.suspendSite(id, reason, note || null, userId);

    // Audit
    auditService.log({
      action: 'SITE_SUSPENDED',
      userId,
      targetType: 'site',
      targetId: id,
      details: { reason, note },
    });

    res.json({ success: true, message: 'Site suspendu avec succès' });
  } catch (error) {
    logger.error('Error suspending site', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur lors de la suspension du site' });
  }
};

/**
 * POST /api/sites/:id/subscription/reactivate
 * Réactive un site suspendu
 */
export const reactivateSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { new_end_date, note } = req.body as ReactivateSiteRequest;

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    let newEndDate: Date | null = null;
    if (new_end_date) {
      newEndDate = new Date(new_end_date);
      if (isNaN(newEndDate.getTime())) {
        return res.status(400).json({ error: 'Format de date invalide' });
      }
    }

    await subscriptionService.reactivateSite(id, newEndDate, note || null, userId);

    // Audit
    auditService.log({
      action: 'SITE_REACTIVATED',
      userId,
      targetType: 'site',
      targetId: id,
      details: { newEndDate: new_end_date, note },
    });

    res.json({ success: true, message: 'Site réactivé avec succès' });
  } catch (error) {
    logger.error('Error reactivating site', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur lors de la réactivation du site' });
  }
};

/**
 * PUT /api/sites/:id/subscription/plan
 * Change le plan d'abonnement d'un site
 */
export const changePlan = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { plan, note } = req.body as { plan: SubscriptionPlan; note?: string };

    if (!plan) {
      return res.status(400).json({ error: 'Le nouveau plan est requis' });
    }

    // Valider le plan
    const validPlans: SubscriptionPlan[] = ['trial', 'standard', 'premium'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Plan invalide' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    await subscriptionService.changePlan(id, plan, note || null, userId);

    // Audit
    auditService.log({
      action: 'SUBSCRIPTION_PLAN_CHANGED',
      userId,
      targetType: 'site',
      targetId: id,
      details: { newPlan: plan, note },
    });

    res.json({ success: true, message: 'Plan modifié avec succès' });
  } catch (error) {
    logger.error('Error changing plan', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur lors du changement de plan' });
  }
};

/**
 * GET /api/sites/:id/subscription/license-status
 * Calcule et retourne le statut de licence d'un site
 * (Utilisé pour debug/preview, le Pi reçoit le statut via Socket.IO)
 */
export const getLicenseStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const site = await subscriptionService.getSiteSubscription(id);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const licenseStatus = await subscriptionService.computeLicenseStatus(site);
    res.json(licenseStatus);
  } catch (error) {
    logger.error('Error computing license status', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur lors du calcul du statut de licence' });
  }
};

/**
 * PUT /api/sites/:id/subscription
 * Configure l'abonnement d'un site (date début, date fin, plan)
 * Permet de tout mettre à jour en une seule opération
 */
export const updateSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { subscription_start, subscription_end, subscription_plan, note } = req.body as {
      subscription_start?: string;
      subscription_end?: string;
      subscription_plan?: SubscriptionPlan;
      note?: string;
    };

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    // Valider les dates si fournies
    let startDate: Date | null | undefined;
    let endDate: Date | null | undefined;

    if (subscription_start !== undefined) {
      if (subscription_start === null || subscription_start === '') {
        startDate = null;
      } else {
        startDate = new Date(subscription_start);
        if (isNaN(startDate.getTime())) {
          return res.status(400).json({ error: 'Format de date de début invalide' });
        }
      }
    }

    if (subscription_end !== undefined) {
      if (subscription_end === null || subscription_end === '') {
        endDate = null;
      } else {
        endDate = new Date(subscription_end);
        if (isNaN(endDate.getTime())) {
          return res.status(400).json({ error: 'Format de date de fin invalide' });
        }
      }
    }

    // Valider le plan si fourni
    if (subscription_plan !== undefined && subscription_plan !== null) {
      const validPlans: SubscriptionPlan[] = ['trial', 'standard', 'premium'];
      if (!validPlans.includes(subscription_plan)) {
        return res.status(400).json({ error: 'Plan invalide' });
      }
    }

    // Vérifier qu'au moins un champ est fourni
    if (startDate === undefined && endDate === undefined && subscription_plan === undefined) {
      return res.status(400).json({ error: 'Au moins un champ à mettre à jour est requis' });
    }

    await subscriptionService.updateSubscription(
      id,
      {
        subscriptionStart: startDate,
        subscriptionEnd: endDate,
        subscriptionPlan: subscription_plan,
      },
      note || null,
      userId
    );

    // Audit
    auditService.log({
      action: 'SUBSCRIPTION_UPDATED',
      userId,
      targetType: 'site',
      targetId: id,
      details: { subscription_start, subscription_end, subscription_plan, note },
    });

    res.json({ success: true, message: 'Abonnement mis à jour avec succès' });
  } catch (error) {
    logger.error('Error updating subscription', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'abonnement' });
  }
};
