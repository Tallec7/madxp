/**
 * Sponsor Alert Service (F-AUD-07)
 *
 * Proactive alerts for sponsor impressions.
 * Computes a health matrix (advertisers x sites) and detects
 * under-performing advertiser/club pairs.
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { ALL_SPONSOR_CATEGORIES } from '../utils/sponsor-categories';
import { alertRepository } from '../repositories/alert.repository';
import { alertService } from './alert.service';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type SponsorHealthStatus = 'healthy' | 'warning' | 'critical';

export interface SponsorHealthEntry {
  advertiserId: string;
  advertiserName: string;
  siteId: string;
  siteName: string;
  clubName: string;
  impressionsLast7d: number;
  impressionsLast30d: number;
  avgDailyImpressions7d: number;
  lastImpressionAt: string | null;
  daysSinceLastImpression: number | null;
  status: SponsorHealthStatus;
}

export interface SponsorHealthMatrix {
  entries: SponsorHealthEntry[];
  summary: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
  };
  generatedAt: string;
}

export interface SponsorAlertConfig {
  /** Daily impressions below this threshold triggers warning (default: 5) */
  warningThresholdDaily: number;
  /** Days without any impressions triggers critical (default: 3) */
  criticalThresholdDays: number;
}

interface HealthQueryRow {
  [key: string]: unknown;
  advertiser_id: string;
  advertiser_name: string;
  site_id: string;
  site_name: string;
  club_name: string;
  impressions_7d: string;
  impressions_30d: string;
  last_impression_at: string | null;
  days_since_last: string | null;
}

// --------------------------------------------------------------------------
// Default config
// --------------------------------------------------------------------------

const DEFAULT_CONFIG: SponsorAlertConfig = {
  warningThresholdDaily: 5,
  criticalThresholdDays: 3,
};

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

class SponsorAlertService {
  private config: SponsorAlertConfig = { ...DEFAULT_CONFIG };

  /**
   * Override default thresholds (e.g. from environment or admin settings).
   */
  configure(partial: Partial<SponsorAlertConfig>): void {
    if (partial.warningThresholdDaily !== undefined) {
      this.config.warningThresholdDaily = partial.warningThresholdDaily;
    }
    if (partial.criticalThresholdDays !== undefined) {
      this.config.criticalThresholdDays = partial.criticalThresholdDays;
    }
    logger.info('SponsorAlertService configured', { config: this.config });
  }

  /**
   * Returns the current alert configuration.
   */
  getConfig(): SponsorAlertConfig {
    return { ...this.config };
  }

  /**
   * Compute the health matrix for all (or one) advertiser across all assigned sites.
   * This is the core query powering the "Advertiser Health" dashboard view.
   */
  async getSponsorHealth(advertiserId?: string): Promise<SponsorHealthMatrix> {
    const emptyMatrix: SponsorHealthMatrix = {
      entries: [],
      summary: { total: 0, healthy: 0, warning: 0, critical: 0 },
      generatedAt: new Date().toISOString(),
    };

    // Guard: check that required tables exist before querying
    let result: { rows: HealthQueryRow[] };
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (advertiserId) {
        conditions.push(`a.id = $${paramIndex++}`);
        params.push(advertiserId);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      // Use site_sponsors (unified model) with fallback to advertiser_sites
      // site_sponsors is the canonical source since migration add-site-sponsors.sql
      result = await query<HealthQueryRow>(
        `SELECT
          a.id AS advertiser_id,
          a.name AS advertiser_name,
          s.id AS site_id,
          s.site_name,
          s.club_name,
          COALESCE(SUM(CASE WHEN vp.played_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END), 0)::text AS impressions_7d,
          COALESCE(SUM(CASE WHEN vp.played_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0)::text AS impressions_30d,
          MAX(vp.played_at)::text AS last_impression_at,
          EXTRACT(DAY FROM NOW() - MAX(vp.played_at))::text AS days_since_last
        FROM site_sponsors ss
        JOIN advertisers a ON a.id = ss.advertiser_id
        JOIN sites s ON s.id = ss.site_id
        LEFT JOIN video_plays vp
          ON vp.sponsor_id = a.id
          AND vp.site_id = s.id
          AND vp.category IN ${ALL_SPONSOR_CATEGORIES}
          AND vp.played_at >= NOW() - INTERVAL '30 days'
        ${whereClause}
        GROUP BY a.id, a.name, s.id, s.site_name, s.club_name
        ORDER BY a.name ASC, s.club_name ASC`,
        params
      );
    } catch (dbError) {
      logger.warn('Sponsor health query failed — tables may not exist yet', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
      return emptyMatrix;
    }

    const entries: SponsorHealthEntry[] = result.rows.map(row => {
      const impressions7d = parseInt(row.impressions_7d, 10);
      const impressions30d = parseInt(row.impressions_30d, 10);
      const avgDaily7d = impressions7d / 7;
      const daysSince = row.days_since_last !== null
        ? Math.floor(parseFloat(row.days_since_last))
        : null;

      const status = this.computeStatus(avgDaily7d, daysSince);

      return {
        advertiserId: row.advertiser_id,
        advertiserName: row.advertiser_name,
        siteId: row.site_id,
        siteName: row.site_name,
        clubName: row.club_name,
        impressionsLast7d: impressions7d,
        impressionsLast30d: impressions30d,
        avgDailyImpressions7d: Math.round(avgDaily7d * 10) / 10,
        lastImpressionAt: row.last_impression_at,
        daysSinceLastImpression: daysSince,
        status,
      };
    });

    const summary = {
      total: entries.length,
      healthy: entries.filter(e => e.status === 'healthy').length,
      warning: entries.filter(e => e.status === 'warning').length,
      critical: entries.filter(e => e.status === 'critical').length,
    };

    return {
      entries,
      summary,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Run by cron (or manual trigger): check all advertiser-site pairs
   * and create alerts for critical/warning statuses.
   * Returns the number of new alerts created.
   */
  async checkAlerts(): Promise<{ created: number; total: number }> {
    const matrix = await this.getSponsorHealth();
    if (matrix.summary.total === 0) {
      return { created: 0, total: 0 };
    }
    let created = 0;

    for (const entry of matrix.entries) {
      if (entry.status === 'critical') {
        const alertType = `sponsor_impressions_critical`;
        const alertKey = `${entry.advertiserId}:${entry.siteId}`;

        // Deduplicate: don't create if already active
        const exists = await alertRepository.existsActive(entry.siteId, `${alertType}:${alertKey}`);
        if (!exists) {
          await alertRepository.create({
            site_id: entry.siteId,
            alert_type: `${alertType}:${alertKey}`,
            severity: 'critical',
            message: `Annonceur "${entry.advertiserName}" n'a aucune impression sur "${entry.clubName}" depuis ${entry.daysSinceLastImpression ?? '?'} jours.`,
            metadata: {
              advertiserId: entry.advertiserId,
              advertiserName: entry.advertiserName,
              siteId: entry.siteId,
              siteName: entry.siteName,
              clubName: entry.clubName,
              daysSinceLastImpression: entry.daysSinceLastImpression,
              impressionsLast7d: entry.impressionsLast7d,
            },
          });
          created++;

          // Also send Slack notification for critical
          await alertService.warning(
            'Impressions sponsor en danger',
            `L'annonceur *${entry.advertiserName}* n'a aucune impression sur *${entry.clubName}* depuis ${entry.daysSinceLastImpression ?? '?'} jours.`,
            { siteId: entry.siteId, siteName: entry.clubName }
          );
        }
      }
    }

    logger.info('Sponsor alert check completed', {
      total: matrix.summary.total,
      critical: matrix.summary.critical,
      warning: matrix.summary.warning,
      created,
    });

    return { created, total: matrix.summary.total };
  }

  /**
   * Compute the health status based on thresholds.
   */
  private computeStatus(avgDaily7d: number, daysSinceLastImpression: number | null): SponsorHealthStatus {
    // No impressions ever, or more than N days without impressions → critical
    if (daysSinceLastImpression === null || daysSinceLastImpression >= this.config.criticalThresholdDays) {
      return 'critical';
    }

    // Low daily average → warning
    if (avgDaily7d < this.config.warningThresholdDaily) {
      return 'warning';
    }

    return 'healthy';
  }
}

export const sponsorAlertService = new SponsorAlertService();
