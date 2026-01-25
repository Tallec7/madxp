/**
 * Subscription Service
 *
 * Gère les abonnements des sites Neopro :
 * - Calcul du statut de licence
 * - Prolongation / suspension / réactivation
 * - Auto-déblocage selon les conditions
 * - Historique des changements
 * - Statistiques globales
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { auditService } from './audit.service';
import {
  LicenseStatus,
  LicenseStatusResponse,
  SubscriptionPlan,
  SuspensionReason,
  SuspensionReasonInfo,
  SubscriptionHistoryEntry,
  SubscriptionStats,
  SiteWithSubscription,
  SiteSubscriptionInfo,
  SubscriptionAction,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

/** Durée de validité du cache licence côté Pi (en jours) */
const LICENSE_CACHE_TTL_DAYS = 7;

/** Période de grâce après expiration de l'abonnement (en jours) */
const SUBSCRIPTION_GRACE_PERIOD_DAYS = 7;

/** Seuil pour le premier avertissement d'expiration (en jours) */
const WARNING_THRESHOLD_DAYS = 30;

/** Seuil pour l'avertissement urgent (en jours) */
const URGENT_WARNING_THRESHOLD_DAYS = 7;

/** Période de grâce après expiration du cache (en jours) - Pi offline */
const CONNECTION_GRACE_PERIOD_DAYS = 7;

/** Total maximum de jours offline avant blocage */
const MAX_OFFLINE_DAYS = LICENSE_CACHE_TTL_DAYS + CONNECTION_GRACE_PERIOD_DAYS; // 14 jours

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calcule la différence en jours entre deux dates
 */
function diffDays(date1: Date, date2: Date): number {
  const diffTime = date1.getTime() - date2.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Ajoute des jours à une date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ============================================================================
// Subscription Service Class
// ============================================================================

class SubscriptionService {
  // --------------------------------------------------------------------------
  // License Status Computation
  // --------------------------------------------------------------------------

  /**
   * Calcule le statut de licence d'un site
   *
   * Logique de priorité :
   * 1. Suspension manuelle (abuse, request, hardware) → BLOCKED
   * 2. Suspension pour impayé mais abonnement renouvelé → auto-déblocage
   * 3. Abonnement expiré > 7 jours → BLOCKED
   * 4. Abonnement expiré ≤ 7 jours → GRACE_PERIOD
   * 5. Abonnement expire dans < 7 jours → WARNING (urgent)
   * 6. Abonnement expire dans < 30 jours → WARNING
   * 7. Tout est OK → VALID
   */
  async computeLicenseStatus(site: SiteSubscriptionInfo): Promise<LicenseStatusResponse> {
    const now = new Date();
    const cacheValidUntil = addDays(now, LICENSE_CACHE_TTL_DAYS);

    // Récupérer les infos du motif de suspension si applicable
    let suspensionInfo: SuspensionReasonInfo | null = null;
    if (site.suspension_reason) {
      suspensionInfo = await this.getSuspensionReasonInfo(site.suspension_reason);
    }

    // 1. Vérifier suspension manuelle (non auto-déblocable)
    if (site.suspended && suspensionInfo && !suspensionInfo.auto_unblock) {
      return {
        status: 'BLOCKED',
        reason: site.suspension_reason as SuspensionReason,
        subscription_plan: site.subscription_plan as SubscriptionPlan,
        can_auto_unblock: false,
        message_tv: suspensionInfo.message_tv,
        message_remote: suspensionInfo.message_remote,
        cache_valid_until: cacheValidUntil.toISOString(),
        server_timestamp: now.toISOString(),
      };
    }

    // 2. Vérifier suspension pour impayé/expired avec abonnement renouvelé
    if (site.suspended && suspensionInfo?.auto_unblock) {
      if (site.subscription_end) {
        const endDate = new Date(site.subscription_end);
        if (endDate > now) {
          // Abonnement renouvelé ! Retourner VALID (auto-déblocage sera fait)
          const daysLeft = diffDays(endDate, now);
          return {
            status: daysLeft <= WARNING_THRESHOLD_DAYS ? 'WARNING' : 'VALID',
            reason: daysLeft <= WARNING_THRESHOLD_DAYS ? 'expiring_soon' : undefined,
            subscription_end: site.subscription_end,
            subscription_plan: site.subscription_plan as SubscriptionPlan,
            days_left: daysLeft,
            can_auto_unblock: true,
            cache_valid_until: cacheValidUntil.toISOString(),
            server_timestamp: now.toISOString(),
          };
        }
      }
      // Toujours suspendu (pas renouvelé)
      return {
        status: 'BLOCKED',
        reason: site.suspension_reason as SuspensionReason,
        subscription_plan: site.subscription_plan as SubscriptionPlan,
        can_auto_unblock: true,
        message_tv: suspensionInfo.message_tv,
        message_remote: suspensionInfo.message_remote,
        cache_valid_until: cacheValidUntil.toISOString(),
        server_timestamp: now.toISOString(),
      };
    }

    // 3. Pas d'abonnement défini
    if (!site.subscription_end) {
      return {
        status: 'VALID', // Pas de restriction si pas d'abonnement configuré
        subscription_plan: site.subscription_plan as SubscriptionPlan,
        cache_valid_until: cacheValidUntil.toISOString(),
        server_timestamp: now.toISOString(),
      };
    }

    // 4. Vérifier expiration de l'abonnement
    const endDate = new Date(site.subscription_end);
    const daysUntilExpiry = diffDays(endDate, now);

    // Expiré depuis plus de 7 jours → BLOCKED
    if (daysUntilExpiry < -SUBSCRIPTION_GRACE_PERIOD_DAYS) {
      const expiredInfo = await this.getSuspensionReasonInfo('expired');
      return {
        status: 'BLOCKED',
        reason: 'expired',
        subscription_end: site.subscription_end,
        subscription_plan: site.subscription_plan as SubscriptionPlan,
        days_expired: Math.abs(daysUntilExpiry),
        can_auto_unblock: true,
        message_tv: expiredInfo?.message_tv || 'Service temporairement indisponible',
        message_remote: expiredInfo?.message_remote || 'Votre abonnement a expiré.',
        cache_valid_until: cacheValidUntil.toISOString(),
        server_timestamp: now.toISOString(),
      };
    }

    // Expiré mais dans la période de grâce → GRACE_PERIOD
    if (daysUntilExpiry < 0) {
      return {
        status: 'GRACE_PERIOD',
        reason: 'expired',
        subscription_end: site.subscription_end,
        subscription_plan: site.subscription_plan as SubscriptionPlan,
        days_expired: Math.abs(daysUntilExpiry),
        days_left: SUBSCRIPTION_GRACE_PERIOD_DAYS + daysUntilExpiry, // Jours restants de grâce
        can_auto_unblock: true,
        message_remote: `Votre abonnement a expiré. ${SUBSCRIPTION_GRACE_PERIOD_DAYS + daysUntilExpiry} jours restants avant suspension.`,
        cache_valid_until: cacheValidUntil.toISOString(),
        server_timestamp: now.toISOString(),
      };
    }

    // Expire bientôt (< 7 jours) → WARNING urgent
    if (daysUntilExpiry <= URGENT_WARNING_THRESHOLD_DAYS) {
      return {
        status: 'WARNING',
        reason: 'expiring_soon',
        subscription_end: site.subscription_end,
        subscription_plan: site.subscription_plan as SubscriptionPlan,
        days_left: daysUntilExpiry,
        message_remote: `⚠️ Votre abonnement expire dans ${daysUntilExpiry} jour${daysUntilExpiry > 1 ? 's' : ''} !`,
        cache_valid_until: cacheValidUntil.toISOString(),
        server_timestamp: now.toISOString(),
      };
    }

    // Expire dans < 30 jours → WARNING
    if (daysUntilExpiry <= WARNING_THRESHOLD_DAYS) {
      return {
        status: 'WARNING',
        reason: 'expiring_soon',
        subscription_end: site.subscription_end,
        subscription_plan: site.subscription_plan as SubscriptionPlan,
        days_left: daysUntilExpiry,
        message_remote: `Votre abonnement expire dans ${daysUntilExpiry} jours.`,
        cache_valid_until: cacheValidUntil.toISOString(),
        server_timestamp: now.toISOString(),
      };
    }

    // Tout est OK → VALID
    return {
      status: 'VALID',
      subscription_end: site.subscription_end,
      subscription_plan: site.subscription_plan as SubscriptionPlan,
      days_left: daysUntilExpiry,
      cache_valid_until: cacheValidUntil.toISOString(),
      server_timestamp: now.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Auto-Unblock Logic
  // --------------------------------------------------------------------------

  /**
   * Vérifie et applique l'auto-déblocage si les conditions sont remplies
   *
   * Conditions d'auto-déblocage :
   * - Site suspendu avec motif auto_unblock = true
   * - Abonnement renouvelé (subscription_end > now)
   *
   * @returns true si le site a été débloqué
   */
  async checkAutoUnblock(site: SiteSubscriptionInfo): Promise<boolean> {
    if (!site.suspended || !site.suspension_reason) {
      return false;
    }

    // Vérifier si le motif permet l'auto-déblocage
    const suspensionInfo = await this.getSuspensionReasonInfo(site.suspension_reason);
    if (!suspensionInfo?.auto_unblock) {
      return false;
    }

    // Vérifier si l'abonnement a été renouvelé
    if (!site.subscription_end) {
      return false;
    }

    const endDate = new Date(site.subscription_end);
    const now = new Date();

    if (endDate <= now) {
      return false; // Toujours expiré
    }

    // Conditions remplies → débloquer
    logger.info('Auto-unblocking site', {
      siteId: site.id,
      siteName: site.site_name,
      previousReason: site.suspension_reason,
      newEndDate: site.subscription_end,
    });

    await query(
      `UPDATE sites
       SET suspended = false,
           suspension_reason = NULL,
           suspension_date = NULL,
           suspension_note = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [site.id]
    );

    // Enregistrer dans l'historique
    await this.recordHistory(site.id, 'reactivated', {
      reason: site.suspension_reason,
      note: 'Auto-déblocage suite au renouvellement de l\'abonnement',
    });

    // Audit log
    auditService.log({
      action: 'SUBSCRIPTION_AUTO_UNBLOCKED',
      userId: undefined, // Système
      targetType: 'site',
      targetId: site.id,
      details: {
        previousReason: site.suspension_reason,
        newEndDate: site.subscription_end,
      },
    });

    return true;
  }

  // --------------------------------------------------------------------------
  // Subscription Management
  // --------------------------------------------------------------------------

  /**
   * Prolonge l'abonnement d'un site
   */
  async extendSubscription(
    siteId: string,
    newEndDate: Date,
    note: string | null,
    performedBy: string
  ): Promise<void> {
    // Récupérer l'état actuel
    const result = await query(
      'SELECT subscription_end, subscription_plan FROM sites WHERE id = $1',
      [siteId]
    );

    if (result.rows.length === 0) {
      throw new Error('Site not found');
    }

    const previousEndDate = result.rows[0].subscription_end as string | null;

    // Mettre à jour
    await query(
      `UPDATE sites
       SET subscription_end = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [newEndDate.toISOString().split('T')[0], siteId]
    );

    // Enregistrer dans l'historique
    await this.recordHistory(siteId, 'renewed', {
      previousEndDate: previousEndDate ?? undefined,
      newEndDate: newEndDate.toISOString().split('T')[0],
      note: note ?? undefined,
      performedBy,
    });

    logger.info('Subscription extended', {
      siteId,
      previousEndDate,
      newEndDate: newEndDate.toISOString().split('T')[0],
      performedBy,
    });
  }

  /**
   * Suspend un site
   */
  async suspendSite(
    siteId: string,
    reason: SuspensionReason,
    note: string | null,
    performedBy: string
  ): Promise<void> {
    await query(
      `UPDATE sites
       SET suspended = true,
           suspension_reason = $1,
           suspension_date = NOW(),
           suspension_note = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [reason, note, siteId]
    );

    // Enregistrer dans l'historique
    await this.recordHistory(siteId, 'suspended', {
      reason,
      note: note ?? undefined,
      performedBy,
    });

    logger.info('Site suspended', {
      siteId,
      reason,
      performedBy,
    });
  }

  /**
   * Réactive un site suspendu
   */
  async reactivateSite(
    siteId: string,
    newEndDate: Date | null,
    note: string | null,
    performedBy: string
  ): Promise<void> {
    // Récupérer l'état actuel
    const result = await query(
      'SELECT suspension_reason, subscription_end FROM sites WHERE id = $1',
      [siteId]
    );

    if (result.rows.length === 0) {
      throw new Error('Site not found');
    }

    const previousReason = result.rows[0].suspension_reason as string | null;
    const previousEndDate = result.rows[0].subscription_end as string | null;

    // Construire la mise à jour
    const updates: string[] = [
      'suspended = false',
      'suspension_reason = NULL',
      'suspension_date = NULL',
      'suspension_note = NULL',
      'updated_at = NOW()',
    ];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    if (newEndDate) {
      updates.push(`subscription_end = $${paramIndex}`);
      values.push(newEndDate.toISOString().split('T')[0]);
      paramIndex++;
    }

    values.push(siteId);

    await query(
      `UPDATE sites SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Enregistrer dans l'historique
    await this.recordHistory(siteId, 'reactivated', {
      reason: previousReason ?? undefined,
      previousEndDate: previousEndDate ?? undefined,
      newEndDate: newEndDate?.toISOString().split('T')[0],
      note: note ?? undefined,
      performedBy,
    });

    logger.info('Site reactivated', {
      siteId,
      previousReason,
      newEndDate: newEndDate?.toISOString().split('T')[0],
      performedBy,
    });
  }

  /**
   * Change le plan d'abonnement d'un site
   */
  async changePlan(
    siteId: string,
    newPlan: SubscriptionPlan,
    note: string | null,
    performedBy: string
  ): Promise<void> {
    // Récupérer l'état actuel
    const result = await query(
      'SELECT subscription_plan FROM sites WHERE id = $1',
      [siteId]
    );

    if (result.rows.length === 0) {
      throw new Error('Site not found');
    }

    const previousPlan = result.rows[0].subscription_plan as string | null;

    await query(
      `UPDATE sites
       SET subscription_plan = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [newPlan, siteId]
    );

    // Enregistrer dans l'historique
    await this.recordHistory(siteId, 'plan_changed', {
      previousPlan: previousPlan ?? undefined,
      newPlan,
      note: note ?? undefined,
      performedBy,
    });

    logger.info('Subscription plan changed', {
      siteId,
      previousPlan,
      newPlan,
      performedBy,
    });
  }

  /**
   * Configure l'abonnement d'un site (date début, date fin, plan)
   * Permet de tout mettre à jour en une seule opération
   */
  async updateSubscription(
    siteId: string,
    updates: {
      subscriptionStart?: Date | null;
      subscriptionEnd?: Date | null;
      subscriptionPlan?: SubscriptionPlan | null;
    },
    note: string | null,
    performedBy: string
  ): Promise<void> {
    // Récupérer l'état actuel
    const result = await query(
      'SELECT subscription_start, subscription_end, subscription_plan FROM sites WHERE id = $1',
      [siteId]
    );

    if (result.rows.length === 0) {
      throw new Error('Site not found');
    }

    const current = result.rows[0];
    const previousStartDate = current.subscription_start as string | null;
    const previousEndDate = current.subscription_end as string | null;
    const previousPlan = current.subscription_plan as string | null;

    // Construire la requête de mise à jour dynamiquement
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    if (updates.subscriptionStart !== undefined) {
      setClauses.push(`subscription_start = $${paramIndex}`);
      values.push(updates.subscriptionStart ? updates.subscriptionStart.toISOString().split('T')[0] : null);
      paramIndex++;
    }

    if (updates.subscriptionEnd !== undefined) {
      setClauses.push(`subscription_end = $${paramIndex}`);
      values.push(updates.subscriptionEnd ? updates.subscriptionEnd.toISOString().split('T')[0] : null);
      paramIndex++;
    }

    if (updates.subscriptionPlan !== undefined) {
      setClauses.push(`subscription_plan = $${paramIndex}`);
      values.push(updates.subscriptionPlan);
      paramIndex++;
    }

    values.push(siteId);

    await query(
      `UPDATE sites SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Déterminer l'action pour l'historique
    let action: SubscriptionAction = 'renewed';
    if (updates.subscriptionPlan && updates.subscriptionPlan !== previousPlan) {
      action = 'plan_changed';
    }
    if (!previousEndDate && updates.subscriptionEnd) {
      action = 'created';
    }

    // Enregistrer dans l'historique
    await this.recordHistory(siteId, action, {
      previousEndDate: previousEndDate ?? undefined,
      newEndDate: updates.subscriptionEnd?.toISOString().split('T')[0] ?? undefined,
      previousPlan: previousPlan ?? undefined,
      newPlan: updates.subscriptionPlan ?? undefined,
      note: note ?? undefined,
      performedBy,
    });

    logger.info('Subscription updated', {
      siteId,
      changes: {
        startDate: updates.subscriptionStart !== undefined
          ? { from: previousStartDate, to: updates.subscriptionStart?.toISOString().split('T')[0] }
          : undefined,
        endDate: updates.subscriptionEnd !== undefined
          ? { from: previousEndDate, to: updates.subscriptionEnd?.toISOString().split('T')[0] }
          : undefined,
        plan: updates.subscriptionPlan !== undefined
          ? { from: previousPlan, to: updates.subscriptionPlan }
          : undefined,
      },
      performedBy,
    });
  }

  // --------------------------------------------------------------------------
  // History Management
  // --------------------------------------------------------------------------

  /**
   * Enregistre une entrée dans l'historique des abonnements
   */
  private async recordHistory(
    siteId: string,
    action: SubscriptionAction,
    details: {
      reason?: string | null;
      previousEndDate?: string | null;
      newEndDate?: string | null;
      previousPlan?: string | null;
      newPlan?: string | null;
      note?: string | null;
      performedBy?: string | null;
    }
  ): Promise<void> {
    await query(
      `INSERT INTO subscription_history
         (site_id, action, reason, previous_end_date, new_end_date, previous_plan, new_plan, note, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        siteId,
        action,
        details.reason || null,
        details.previousEndDate || null,
        details.newEndDate || null,
        details.previousPlan || null,
        details.newPlan || null,
        details.note || null,
        details.performedBy || null,
      ]
    );
  }

  /**
   * Récupère l'historique des changements d'abonnement d'un site
   */
  async getHistory(siteId: string, limit = 50): Promise<SubscriptionHistoryEntry[]> {
    const result = await query(
      `SELECT
         h.id,
         h.site_id,
         h.action,
         h.reason,
         h.previous_end_date,
         h.new_end_date,
         h.previous_plan,
         h.new_plan,
         h.note,
         h.performed_by,
         COALESCE(u.full_name, 'Système') as performed_by_name,
         h.created_at
       FROM subscription_history h
       LEFT JOIN users u ON h.performed_by = u.id
       WHERE h.site_id = $1
       ORDER BY h.created_at DESC
       LIMIT $2`,
      [siteId, limit]
    );

    return result.rows as unknown as SubscriptionHistoryEntry[];
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  /**
   * Récupère les informations d'un motif de suspension
   */
  async getSuspensionReasonInfo(code: string): Promise<SuspensionReasonInfo | null> {
    const result = await query(
      'SELECT * FROM subscription_suspension_reasons WHERE code = $1',
      [code]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as SuspensionReasonInfo;
  }

  /**
   * Récupère tous les motifs de suspension
   */
  async getAllSuspensionReasons(): Promise<SuspensionReasonInfo[]> {
    const result = await query(
      'SELECT * FROM subscription_suspension_reasons ORDER BY label'
    );
    return result.rows as unknown as SuspensionReasonInfo[];
  }

  /**
   * Récupère les statistiques globales des abonnements
   */
  async getSubscriptionStats(): Promise<SubscriptionStats> {
    const result = await query('SELECT * FROM subscription_stats');

    if (result.rows.length === 0) {
      return {
        active_count: 0,
        expiring_soon_count: 0,
        grace_period_count: 0,
        blocked_count: 0,
        suspended_count: 0,
        trial_count: 0,
        standard_count: 0,
        premium_count: 0,
        total_count: 0,
      };
    }

    // Convertir les chaînes en nombres
    const row = result.rows[0] as Record<string, string | number>;
    return {
      active_count: parseInt(String(row.active_count), 10) || 0,
      expiring_soon_count: parseInt(String(row.expiring_soon_count), 10) || 0,
      grace_period_count: parseInt(String(row.grace_period_count), 10) || 0,
      blocked_count: parseInt(String(row.blocked_count), 10) || 0,
      suspended_count: parseInt(String(row.suspended_count), 10) || 0,
      trial_count: parseInt(String(row.trial_count), 10) || 0,
      standard_count: parseInt(String(row.standard_count), 10) || 0,
      premium_count: parseInt(String(row.premium_count), 10) || 0,
      total_count: parseInt(String(row.total_count), 10) || 0,
    };
  }

  /**
   * Récupère les sites à risque (expirent bientôt, en grâce, suspendus)
   */
  async getSitesAtRisk(limit = 100): Promise<SiteWithSubscription[]> {
    const result = await query(
      `SELECT *
       FROM subscription_status_summary
       WHERE subscription_status IN ('expiring_urgent', 'expiring_soon', 'grace_period', 'blocked', 'suspended')
       ORDER BY
         CASE subscription_status
           WHEN 'blocked' THEN 1
           WHEN 'grace_period' THEN 2
           WHEN 'expiring_urgent' THEN 3
           WHEN 'suspended' THEN 4
           WHEN 'expiring_soon' THEN 5
         END,
         days_until_expiry ASC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    return result.rows as unknown as SiteWithSubscription[];
  }

  /**
   * Récupère les sites qui expirent dans X jours (pour les alertes email)
   */
  async getSitesExpiringIn(days: number): Promise<SiteWithSubscription[]> {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    const result = await query(
      `SELECT s.*,
              s.subscription_end::date - CURRENT_DATE as days_until_expiry
       FROM sites s
       WHERE s.subscription_end::date = $1
         AND s.suspended = false`,
      [targetDateStr]
    );

    return result.rows as unknown as SiteWithSubscription[];
  }

  /**
   * Récupère l'abonnement d'un site spécifique
   */
  async getSiteSubscription(siteId: string): Promise<SiteWithSubscription | null> {
    const result = await query(
      `SELECT *
       FROM subscription_status_summary
       WHERE id = $1`,
      [siteId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as SiteWithSubscription;
  }
}

// Export singleton
export const subscriptionService = new SubscriptionService();
export default subscriptionService;
