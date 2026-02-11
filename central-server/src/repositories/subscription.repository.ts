import { query } from '../config/database';

import {
  SiteSubscriptionInfo,
  SiteWithSubscription,
  SubscriptionAction,
  SubscriptionHistoryEntry,
  SubscriptionPlan,
  SubscriptionStats,
  SuspensionReason,
  SuspensionReasonInfo,
} from '../types';


// --------------------------------------------------------------------------
// Types specifiques
// --------------------------------------------------------------------------

export interface SubscriptionUpdate {
  subscription_end?: string;
  subscription_plan?: SubscriptionPlan;
  suspended?: boolean;
  suspension_reason?: SuspensionReason | null;
  suspension_date?: string | null;
  suspension_note?: string | null;
}

export interface HistoryInput {
  site_id: string;
  action: SubscriptionAction;
  reason?: SuspensionReason;
  previous_end_date?: string | null;
  new_end_date?: string | null;
  previous_plan?: SubscriptionPlan;
  new_plan?: SubscriptionPlan;
  note?: string;
  performed_by?: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class SubscriptionRepositoryImpl {
  /**
   * Recupere les infos d'abonnement d'un site (pour calcul de licence).
   */
  async getSiteSubscriptionInfo(siteId: string): Promise<SiteSubscriptionInfo | null> {
    const result = await query<SiteSubscriptionInfo>(
      `SELECT id, site_name, last_seen_at,
              subscription_start, subscription_end, subscription_plan,
              suspended, suspension_reason, suspension_date, suspension_note
       FROM sites WHERE id = $1`,
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere tous les sites avec leurs infos d'abonnement (pour dashboard).
   */
  async getAllSitesWithSubscription(): Promise<SiteWithSubscription[]> {
    const result = await query<SiteWithSubscription>(
      `SELECT * FROM sites ORDER BY site_name ASC`
    );
    return result.rows;
  }

  /**
   * Sites en danger (expirent bientot ou en grace period).
   */
  async getAtRiskSites(limitDays = 30): Promise<SiteSubscriptionInfo[]> {
    const result = await query<SiteSubscriptionInfo>(
      `SELECT id, site_name, last_seen_at,
              subscription_start, subscription_end, subscription_plan,
              suspended, suspension_reason, suspension_date, suspension_note
       FROM sites
       WHERE subscription_end IS NOT NULL
         AND subscription_end < NOW() + $1::interval
         AND suspended = false
       ORDER BY subscription_end ASC`,
      [`${limitDays} days`]
    );
    return result.rows;
  }

  /**
   * Sites candidats au deblocage automatique.
   */
  async getAutoUnblockCandidates(): Promise<SiteSubscriptionInfo[]> {
    const result = await query<SiteSubscriptionInfo>(
      `SELECT s.id, s.site_name, s.last_seen_at,
              s.subscription_start, s.subscription_end, s.subscription_plan,
              s.suspended, s.suspension_reason, s.suspension_date, s.suspension_note
       FROM sites s
       JOIN subscription_suspension_reasons ssr ON ssr.code = s.suspension_reason
       WHERE s.suspended = true
         AND ssr.auto_unblock = true
         AND s.subscription_end > NOW()
       ORDER BY s.site_name ASC`
    );
    return result.rows;
  }

  /**
   * Met a jour l'abonnement d'un site.
   */
  async updateSubscription(siteId: string, data: SubscriptionUpdate): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return;

    setClauses.push('updated_at = NOW()');
    params.push(siteId);

    await query(
      `UPDATE sites SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
  }

  /**
   * Enregistre une entree dans l'historique des abonnements.
   */
  async recordHistory(input: HistoryInput): Promise<void> {
    await query(
      `INSERT INTO subscription_history
        (site_id, action, reason, previous_end_date, new_end_date,
         previous_plan, new_plan, note, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.site_id,
        input.action,
        input.reason || null,
        input.previous_end_date || null,
        input.new_end_date || null,
        input.previous_plan || null,
        input.new_plan || null,
        input.note || null,
        input.performed_by || null,
      ]
    );
  }

  /**
   * Historique d'un site.
   */
  async getHistory(siteId: string, limit = 50): Promise<SubscriptionHistoryEntry[]> {
    const result = await query<SubscriptionHistoryEntry>(
      `SELECT sh.*, u.full_name AS performed_by_name
       FROM subscription_history sh
       LEFT JOIN users u ON u.id = sh.performed_by
       WHERE sh.site_id = $1
       ORDER BY sh.created_at DESC
       LIMIT $2`,
      [siteId, limit]
    );
    return result.rows;
  }

  /**
   * Statistiques globales.
   */
  async getStats(): Promise<SubscriptionStats> {
    const result = await query<SubscriptionStats>(
      `SELECT
        COUNT(*) FILTER (WHERE subscription_end > NOW() AND suspended = false)::int AS active_count,
        COUNT(*) FILTER (WHERE subscription_end > NOW() AND subscription_end < NOW() + INTERVAL '30 days' AND suspended = false)::int AS expiring_soon_count,
        COUNT(*) FILTER (WHERE subscription_end < NOW() AND subscription_end > NOW() - INTERVAL '7 days' AND suspended = false)::int AS grace_period_count,
        COUNT(*) FILTER (WHERE (subscription_end < NOW() - INTERVAL '7 days') OR suspended = true)::int AS blocked_count,
        COUNT(*) FILTER (WHERE suspended = true)::int AS suspended_count,
        COUNT(*) FILTER (WHERE subscription_plan = 'trial')::int AS trial_count,
        COUNT(*) FILTER (WHERE subscription_plan = 'standard')::int AS standard_count,
        COUNT(*) FILTER (WHERE subscription_plan = 'premium')::int AS premium_count,
        COUNT(*)::int AS total_count
       FROM sites`
    );
    return result.rows[0];
  }

  /**
   * Recupere un motif de suspension par code.
   */
  async getSuspensionReason(code: SuspensionReason): Promise<SuspensionReasonInfo | null> {
    const result = await query<SuspensionReasonInfo>(
      'SELECT * FROM subscription_suspension_reasons WHERE code = $1',
      [code]
    );
    return result.rows[0] || null;
  }

  /**
   * Tous les motifs de suspension.
   */
  async getAllSuspensionReasons(): Promise<SuspensionReasonInfo[]> {
    const result = await query<SuspensionReasonInfo>(
      'SELECT * FROM subscription_suspension_reasons ORDER BY code ASC'
    );
    return result.rows;
  }
}

export const subscriptionRepository = new SubscriptionRepositoryImpl();
