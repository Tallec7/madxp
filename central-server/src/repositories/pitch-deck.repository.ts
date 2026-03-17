import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { ALL_SPONSOR_CATEGORIES } from '../utils/sponsor-categories';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface TractionOverviewRow extends QueryResultRow {
  total_sites: string;
  online_sites: string;
  pct_online: string;
  active_subscriptions: string;
  trial_count: string;
  standard_count: string;
  premium_count: string;
  first_site: Date | null;
  last_site: Date | null;
}

export interface UserStatsRow extends QueryResultRow {
  total_users: string;
  super_admins: string;
  admins: string;
  operators: string;
  advertisers: string;
  agencies: string;
  active_30d: string;
}

export interface FleetGrowthRow extends QueryResultRow {
  month: Date;
  new_sites: string;
}

export interface EngagementTotalsRow extends QueryResultRow {
  total_plays: string;
  screen_time_hours: string;
  avg_completion: string;
  sites_with_plays: string;
}

export interface EngagementMonthlyRow extends QueryResultRow {
  month: Date;
  plays: string;
  active_sites: string;
  screen_time_hours: string;
}

export interface SubscriptionStatusRow extends QueryResultRow {
  active: string;
  expiring_soon: string;
  grace_period: string;
  suspended: string;
  trial_active: string;
  standard_active: string;
  premium_active: string;
}

export interface SubscriptionHistoryRow extends QueryResultRow {
  month: Date;
  activations: string;
  renewals: string;
  plan_changes: string;
  suspensions: string;
  reactivations: string;
  expirations: string;
}

export interface AdvertiserMetricsRow extends QueryResultRow {
  total_advertisers: string;
  active_advertisers: string;
  total_agencies: string;
  active_agencies: string;
  total_impressions: string;
  sites_reached: string;
  videos_diffused: string;
  screen_time_hours: string;
  completion_rate: string;
}

export interface AdvertiserMonthlyRow extends QueryResultRow {
  month: Date;
  impressions: string;
  sites: string;
  videos: string;
  screen_time_hours: string;
}

export interface ContentLibraryRow extends QueryResultRow {
  total_videos: string;
  sponsor_videos: string;
  storage_gb: string;
  avg_duration_min: string;
  distinct_uploaders: string;
}

export interface ContentGrowthRow extends QueryResultRow {
  month: Date;
  videos_added: string;
}

export interface DeploymentStatsRow extends QueryResultRow {
  total_deployments: string;
  completed: string;
  failed: string;
  success_rate: string;
  avg_duration_min: string;
}

export interface ReliabilityRow extends QueryResultRow {
  avg_uptime: string;
  sites_monitored: string;
  data_days: string;
  avg_cpu: string;
  avg_memory: string;
  avg_temperature: string;
}

export interface AlertStatsRow extends QueryResultRow {
  total_alerts: string;
  resolved: string;
  resolution_rate: string;
  avg_ttr_hours: string;
}

export interface ProductVelocityRow extends QueryResultRow {
  total_releases: string;
  critical_releases: string;
  first_release: Date | null;
  last_release: Date | null;
}

export interface ReleaseAdoptionRow extends QueryResultRow {
  version: string;
  release_date: Date;
  deployed_ok: string;
  deploy_failed: string;
  adoption_pct: string;
}

export interface RetentionCohortRow extends QueryResultRow {
  cohort: Date;
  total_sites: string;
  still_active: string;
  retention_pct: string;
  avg_age_months: string;
}

export interface SportDistributionRow extends QueryResultRow {
  sport: string;
  site_count: string;
  pct: string;
}

export interface ContentMixRow extends QueryResultRow {
  category: string;
  plays: string;
  pct: string;
  avg_completion: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class PitchDeckRepositoryImpl {
  async getOverview(): Promise<TractionOverviewRow | null> {
    const result = await query<TractionOverviewRow>(`
      SELECT
        COUNT(*)::text                                                          AS total_sites,
        COUNT(*) FILTER (WHERE status = 'online')::text                         AS online_sites,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'online')
          / NULLIF(COUNT(*), 0), 1)::text                                       AS pct_online,
        COUNT(*) FILTER (WHERE subscription_end > NOW() AND NOT suspended)::text AS active_subscriptions,
        COUNT(*) FILTER (WHERE subscription_plan = 'trial')::text               AS trial_count,
        COUNT(*) FILTER (WHERE subscription_plan = 'standard')::text            AS standard_count,
        COUNT(*) FILTER (WHERE subscription_plan = 'premium')::text             AS premium_count,
        MIN(created_at)                                                         AS first_site,
        MAX(created_at)                                                         AS last_site
      FROM sites
    `);
    return result.rows[0] ?? null;
  }

  async getUserStats(): Promise<UserStatsRow | null> {
    const result = await query<UserStatsRow>(`
      SELECT
        COUNT(*)::text                                                    AS total_users,
        COUNT(*) FILTER (WHERE role = 'super_admin')::text                AS super_admins,
        COUNT(*) FILTER (WHERE role = 'admin')::text                      AS admins,
        COUNT(*) FILTER (WHERE role = 'operator')::text                   AS operators,
        COUNT(*) FILTER (WHERE role = 'advertiser')::text                 AS advertisers,
        COUNT(*) FILTER (WHERE role = 'agency')::text                     AS agencies,
        COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days')::text AS active_30d
      FROM users
    `);
    return result.rows[0] ?? null;
  }

  async getFleetGrowth(): Promise<FleetGrowthRow[]> {
    const result = await query<FleetGrowthRow>(`
      SELECT
        DATE_TRUNC('month', created_at) AS month,
        COUNT(*)::text                  AS new_sites
      FROM sites
      GROUP BY 1
      ORDER BY 1
    `);
    return result.rows;
  }

  async getEngagementTotals(): Promise<EngagementTotalsRow | null> {
    const result = await query<EngagementTotalsRow>(`
      SELECT
        COUNT(*)::text                                                        AS total_plays,
        (COALESCE(SUM(duration_played), 0) / 3600)::text                      AS screen_time_hours,
        ROUND(AVG(CASE WHEN video_duration > 0
          THEN 100.0 * duration_played / video_duration ELSE NULL END), 1)::text AS avg_completion,
        COUNT(DISTINCT site_id)::text                                         AS sites_with_plays
      FROM video_plays
    `);
    return result.rows[0] ?? null;
  }

  async getEngagementMonthly(): Promise<EngagementMonthlyRow[]> {
    const result = await query<EngagementMonthlyRow>(`
      SELECT
        DATE_TRUNC('month', played_at)                AS month,
        COUNT(*)::text                                AS plays,
        COUNT(DISTINCT site_id)::text                 AS active_sites,
        (COALESCE(SUM(duration_played), 0) / 3600)::text AS screen_time_hours
      FROM video_plays
      GROUP BY 1
      ORDER BY 1
    `);
    return result.rows;
  }

  async getSubscriptionStatus(): Promise<SubscriptionStatusRow | null> {
    const result = await query<SubscriptionStatusRow>(`
      SELECT
        COUNT(*) FILTER (WHERE subscription_end > NOW() AND NOT suspended)::text    AS active,
        COUNT(*) FILTER (WHERE subscription_end > NOW()
                         AND subscription_end < NOW() + INTERVAL '30 days'
                         AND NOT suspended)::text                                   AS expiring_soon,
        COUNT(*) FILTER (WHERE subscription_end < NOW()
                         AND subscription_end > NOW() - INTERVAL '7 days'
                         AND NOT suspended)::text                                   AS grace_period,
        COUNT(*) FILTER (WHERE suspended = true)::text                              AS suspended,
        COUNT(*) FILTER (WHERE subscription_plan = 'trial'
                         AND subscription_end > NOW())::text                        AS trial_active,
        COUNT(*) FILTER (WHERE subscription_plan = 'standard'
                         AND subscription_end > NOW())::text                        AS standard_active,
        COUNT(*) FILTER (WHERE subscription_plan = 'premium'
                         AND subscription_end > NOW())::text                        AS premium_active
      FROM sites
    `);
    return result.rows[0] ?? null;
  }

  async getSubscriptionHistory(): Promise<SubscriptionHistoryRow[]> {
    const result = await query<SubscriptionHistoryRow>(`
      SELECT
        DATE_TRUNC('month', created_at)                              AS month,
        COUNT(*) FILTER (WHERE action = 'activated')::text           AS activations,
        COUNT(*) FILTER (WHERE action = 'renewed')::text             AS renewals,
        COUNT(*) FILTER (WHERE action = 'plan_changed')::text        AS plan_changes,
        COUNT(*) FILTER (WHERE action = 'suspended')::text           AS suspensions,
        COUNT(*) FILTER (WHERE action = 'reactivated')::text         AS reactivations,
        COUNT(*) FILTER (WHERE action = 'expired')::text             AS expirations
      FROM subscription_history
      GROUP BY 1
      ORDER BY 1
    `);
    return result.rows;
  }

  async getAdvertiserMetrics(): Promise<AdvertiserMetricsRow | null> {
    const result = await query<AdvertiserMetricsRow>(`
      SELECT
        (SELECT COUNT(*) FROM advertisers)::text                              AS total_advertisers,
        (SELECT COUNT(*) FROM advertisers WHERE status = 'active')::text      AS active_advertisers,
        (SELECT COUNT(*) FROM agencies)::text                                 AS total_agencies,
        (SELECT COUNT(*) FROM agencies WHERE status = 'active')::text         AS active_agencies,
        COUNT(*)::text                                                        AS total_impressions,
        COUNT(DISTINCT site_id)::text                                         AS sites_reached,
        COUNT(DISTINCT video_id)::text                                        AS videos_diffused,
        (COALESCE(SUM(duration_played), 0) / 3600)::text                      AS screen_time_hours,
        COALESCE((SELECT ROUND(AVG(completion_rate), 1) FROM advertiser_daily_stats_live), 0)::text AS completion_rate
      FROM video_plays
      WHERE category IN ${ALL_SPONSOR_CATEGORIES}
    `);
    return result.rows[0] ?? null;
  }

  async getAdvertiserMonthly(): Promise<AdvertiserMonthlyRow[]> {
    const result = await query<AdvertiserMonthlyRow>(`
      SELECT
        DATE_TRUNC('month', played_at)                    AS month,
        COUNT(*)::text                                    AS impressions,
        COUNT(DISTINCT site_id)::text                     AS sites,
        COUNT(DISTINCT video_id)::text                    AS videos,
        (COALESCE(SUM(duration_played), 0) / 3600)::text  AS screen_time_hours
      FROM video_plays
      WHERE category IN ${ALL_SPONSOR_CATEGORIES}
      GROUP BY 1
      ORDER BY 1
    `);
    return result.rows;
  }

  async getContentLibrary(): Promise<ContentLibraryRow | null> {
    const result = await query<ContentLibraryRow>(`
      SELECT
        COUNT(*)::text                                                 AS total_videos,
        COUNT(*) FILTER (WHERE category = 'sponsor')::text             AS sponsor_videos,
        ROUND(COALESCE(SUM(file_size), 0) / 1073741824.0, 1)::text     AS storage_gb,
        ROUND(AVG(duration) / 60.0, 1)::text                           AS avg_duration_min,
        COUNT(DISTINCT uploaded_by)::text                              AS distinct_uploaders
      FROM videos
      WHERE upload_status = 'ready'
    `);
    return result.rows[0] ?? null;
  }

  async getContentGrowth(): Promise<ContentGrowthRow[]> {
    const result = await query<ContentGrowthRow>(`
      SELECT
        DATE_TRUNC('month', created_at) AS month,
        COUNT(*)::text                  AS videos_added
      FROM videos
      WHERE upload_status = 'ready'
      GROUP BY 1
      ORDER BY 1
    `);
    return result.rows;
  }

  async getDeploymentStats(): Promise<DeploymentStatsRow | null> {
    const result = await query<DeploymentStatsRow>(`
      SELECT
        COUNT(*)::text                                                         AS total_deployments,
        COUNT(*) FILTER (WHERE status = 'completed')::text                     AS completed,
        COUNT(*) FILTER (WHERE status = 'failed')::text                        AS failed,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed')
          / NULLIF(COUNT(*), 0), 1)::text                                      AS success_rate,
        ROUND(AVG(EXTRACT(EPOCH FROM completed_at - created_at) / 60)
          FILTER (WHERE status = 'completed'), 1)::text                        AS avg_duration_min
      FROM content_deployments
    `);
    return result.rows[0] ?? null;
  }

  async getReliability(): Promise<ReliabilityRow | null> {
    const result = await query<ReliabilityRow>(`
      SELECT
        ROUND(AVG(uptime_percent), 2)::text   AS avg_uptime,
        COUNT(DISTINCT site_id)::text         AS sites_monitored,
        COUNT(DISTINCT date)::text            AS data_days,
        ROUND(AVG(avg_cpu), 1)::text          AS avg_cpu,
        ROUND(AVG(avg_memory), 1)::text       AS avg_memory,
        ROUND(AVG(avg_temperature), 1)::text  AS avg_temperature
      FROM club_daily_stats_live
    `);
    return result.rows[0] ?? null;
  }

  async getAlertStats(): Promise<AlertStatsRow | null> {
    const result = await query<AlertStatsRow>(`
      SELECT
        COUNT(*)::text                                                    AS total_alerts,
        COUNT(*) FILTER (WHERE status = 'resolved')::text                 AS resolved,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'resolved')
          / NULLIF(COUNT(*), 0), 1)::text                                 AS resolution_rate,
        ROUND(AVG(EXTRACT(EPOCH FROM resolved_at - created_at) / 3600)
          FILTER (WHERE status = 'resolved'), 1)::text                    AS avg_ttr_hours
      FROM alerts
    `);
    return result.rows[0] ?? null;
  }

  async getProductVelocity(): Promise<ProductVelocityRow | null> {
    const result = await query<ProductVelocityRow>(`
      SELECT
        COUNT(*)::text                 AS total_releases,
        COUNT(*) FILTER (WHERE is_critical)::text AS critical_releases,
        MIN(created_at)                AS first_release,
        MAX(created_at)                AS last_release
      FROM software_updates
    `);
    return result.rows[0] ?? null;
  }

  async getReleaseAdoption(limit: number = 10): Promise<ReleaseAdoptionRow[]> {
    const result = await query<ReleaseAdoptionRow>(
      `SELECT
        su.version,
        su.created_at                                                      AS release_date,
        COUNT(*) FILTER (WHERE ud.status = 'completed')::text              AS deployed_ok,
        COUNT(*) FILTER (WHERE ud.status = 'failed')::text                 AS deploy_failed,
        ROUND(100.0 * COUNT(*) FILTER (WHERE ud.status = 'completed')
          / NULLIF(COUNT(*), 0), 1)::text                                   AS adoption_pct
      FROM software_updates su
      LEFT JOIN update_deployments ud ON ud.update_id = su.id
      GROUP BY su.id, su.version, su.created_at
      ORDER BY su.created_at DESC
      LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async getRetentionCohorts(): Promise<RetentionCohortRow[]> {
    const result = await query<RetentionCohortRow>(`
      SELECT
        DATE_TRUNC('month', s.created_at)                                  AS cohort,
        COUNT(*)::text                                                     AS total_sites,
        COUNT(*) FILTER (WHERE s.last_seen_at > NOW() - INTERVAL '30 days'
                         AND NOT s.suspended)::text                        AS still_active,
        ROUND(100.0 * COUNT(*) FILTER (WHERE s.last_seen_at > NOW() - INTERVAL '30 days'
                         AND NOT s.suspended)
          / NULLIF(COUNT(*), 0), 1)::text                                  AS retention_pct,
        ROUND(AVG(EXTRACT(MONTH FROM AGE(NOW(), s.created_at))), 1)::text  AS avg_age_months
      FROM sites s
      GROUP BY 1
      ORDER BY 1
    `);
    return result.rows;
  }

  async getSportDistribution(): Promise<SportDistributionRow[]> {
    const result = await query<SportDistributionRow>(`
      SELECT
        sport_value                                                       AS sport,
        COUNT(*)::text                                                    AS site_count,
        ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)::text AS pct
      FROM sites, jsonb_array_elements_text(COALESCE(sports, '[]'::jsonb)) AS sport_value
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `);
    return result.rows;
  }

  async getContentMix(): Promise<ContentMixRow[]> {
    const result = await query<ContentMixRow>(`
      SELECT
        COALESCE(category, 'other')::text                                     AS category,
        COUNT(*)::text                                                        AS plays,
        ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)::text   AS pct,
        ROUND(AVG(CASE WHEN video_duration > 0
          THEN 100.0 * duration_played / video_duration ELSE NULL END), 1)::text AS avg_completion
      FROM video_plays
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `);
    return result.rows;
  }
}

export const pitchDeckRepository = new PitchDeckRepositoryImpl();
