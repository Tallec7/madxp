import { QueryResultRow } from 'pg';
import { query } from '../config/database';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface ClubHealthMetrics extends QueryResultRow {
  cpu_usage: number | null;
  memory_usage: number | null;
  temperature: number | null;
  disk_usage: number | null;
  uptime: number | null;
  recorded_at: Date;
}

export interface HeartbeatStats extends QueryResultRow {
  heartbeat_count: string;
  first_heartbeat: Date | null;
  last_heartbeat: Date | null;
}

export interface AlertStats extends QueryResultRow {
  active_alerts: string;
  alerts_last_30d: string;
}

export interface AvgMetrics extends QueryResultRow {
  avg_cpu: number | null;
  avg_memory: number | null;
  avg_temperature: number | null;
  max_temperature: number | null;
}

export interface DailyHeartbeatRow extends QueryResultRow {
  date: Date;
  heartbeat_count: string;
  avg_cpu: number | null;
  avg_temp: number | null;
}

export interface ClubAlertRow extends QueryResultRow {
  id: string;
  type: string;
  severity: string;
  message: string;
  status: string;
  created_at: Date;
  resolved_at: Date | null;
}

export interface UsageStatsRow extends QueryResultRow {
  screen_time_seconds: string;
  videos_played: string;
  unique_videos: string;
  sessions_count: string;
  active_days: string;
  manual_triggers: string;
  auto_plays: string;
  avg_completion: number | null;
}

export interface DailyStatsRow extends QueryResultRow {
  date: Date;
  screen_time: string;
  videos: string;
}

export interface CategoryStatsRow extends QueryResultRow {
  category: string;
  plays: string;
  total_duration: string;
}

export interface TopVideoRow extends QueryResultRow {
  video_filename: string;
  category: string;
  plays: string;
  total_duration: string;
  avg_completion: number | null;
}

export interface SessionRow extends QueryResultRow {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  videos_played: number | null;
  manual_triggers: number | null;
  auto_plays: number | null;
}

export interface AnalyticsCategoryRow extends QueryResultRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_default: boolean;
  created_at: Date;
}

export interface OverviewSiteCountRow extends QueryResultRow {
  total_sites: string;
  online_sites: string;
}

export interface OverviewPlaysRow extends QueryResultRow {
  plays_today: string;
  plays_week: string;
}

export interface OverviewAvailabilityRow extends QueryResultRow {
  avg_availability: number | null;
}

export interface OverviewSiteSummaryRow extends QueryResultRow {
  site_id: string;
  club_name: string;
  status: string;
  plays_today: string;
  heartbeat_count: string;
}

export interface ComparisonSiteRow extends QueryResultRow {
  id: string;
  site_name: string;
  club_name: string;
  days_active: number;
  total_videos: number;
  total_screen_time: number;
  avg_completion: number;
}

export interface DashboardHealthRow extends QueryResultRow {
  status: string;
  last_seen_at: Date | null;
  cpu_usage: number | null;
  memory_usage: number | null;
  temperature: number | null;
  disk_usage: number | null;
}

export interface DashboardUsageRow extends QueryResultRow {
  screen_time_seconds: string;
  videos_played: string;
  active_days: string;
  manual_triggers: string;
  auto_plays: string;
}

export interface DashboardCategoryRow extends QueryResultRow {
  category: string;
  plays: string;
}

export interface CreateCategoryInput {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
}

export interface VideoPlaysBatchItem {
  siteId: string;
  sessionId: string;
  videoFilename: string;
  category: string;
  playedAt: string;
  durationPlayed: number;
  videoDuration: number;
  completed: boolean;
  triggerType: string;
  videoId: string | null;
  sponsorId: string | null;
  tvStatus: string | null;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class AnalyticsRepositoryImpl {
  // ========================================================================
  // Club Health
  // ========================================================================

  /**
   * Recupere les dernieres metriques materielles d'un site.
   */
  async getLatestMetrics(siteId: string): Promise<ClubHealthMetrics | null> {
    const result = await query<ClubHealthMetrics>(
      `SELECT cpu_usage, memory_usage, temperature, disk_usage, uptime, recorded_at
       FROM metrics
       WHERE site_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Compte les heartbeats sur 30 jours pour le calcul de l'uptime.
   */
  async getHeartbeatStats30d(siteId: string): Promise<HeartbeatStats> {
    const result = await query<HeartbeatStats>(
      `SELECT
        COUNT(*) as heartbeat_count,
        MIN(recorded_at) as first_heartbeat,
        MAX(recorded_at) as last_heartbeat
       FROM metrics
       WHERE site_id = $1
         AND recorded_at > NOW() - INTERVAL '30 days'`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Recupere les statistiques d'alertes pour un site.
   */
  async getAlertStats(siteId: string): Promise<AlertStats> {
    const result = await query<AlertStats>(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_alerts,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as alerts_last_30d
       FROM alerts
       WHERE site_id = $1`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Moyennes CPU/memory/temperature sur 24h.
   */
  async get24hAverages(siteId: string): Promise<AvgMetrics> {
    const result = await query<AvgMetrics>(
      `SELECT
        AVG(cpu_usage) as avg_cpu,
        AVG(memory_usage) as avg_memory,
        AVG(temperature) as avg_temperature,
        MAX(temperature) as max_temperature
       FROM metrics
       WHERE site_id = $1
         AND recorded_at > NOW() - INTERVAL '24 hours'`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Nombre de heartbeats sur 24h.
   */
  async getHeartbeatCount24h(siteId: string): Promise<number> {
    const result = await query<{ heartbeat_count: string }>(
      `SELECT COUNT(*) as heartbeat_count
       FROM metrics
       WHERE site_id = $1
         AND recorded_at > NOW() - INTERVAL '24 hours'`,
      [siteId]
    );
    return parseInt(result.rows[0].heartbeat_count, 10);
  }

  /**
   * Nombre d'alertes sur 24h.
   */
  async getAlertCount24h(siteId: string): Promise<number> {
    const result = await query<{ alerts_24h: string }>(
      `SELECT COUNT(*) as alerts_24h
       FROM alerts
       WHERE site_id = $1
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [siteId]
    );
    return parseInt(result.rows[0].alerts_24h, 10);
  }

  // ========================================================================
  // Club Availability
  // ========================================================================

  /**
   * Historique quotidien des heartbeats pour le graphe de disponibilite.
   */
  async getDailyHeartbeats(siteId: string, days: number): Promise<DailyHeartbeatRow[]> {
    const result = await query<DailyHeartbeatRow>(
      `SELECT
        DATE(recorded_at) as date,
        COUNT(*) as heartbeat_count,
        AVG(cpu_usage) as avg_cpu,
        AVG(temperature) as avg_temp
       FROM metrics
       WHERE site_id = $1
         AND recorded_at > NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(recorded_at)
       ORDER BY date DESC`,
      [siteId, days]
    );
    return result.rows;
  }

  // ========================================================================
  // Club Alerts
  // ========================================================================

  /**
   * Recupere les alertes d'un site avec filtres.
   */
  async getClubAlerts(
    siteId: string,
    days: number,
    options: { status?: string; severity?: string; limit?: number } = {}
  ): Promise<ClubAlertRow[]> {
    let paramIndex = 3;
    const params: unknown[] = [siteId, days];
    let filterClause = '';

    if (options.status) {
      filterClause += ` AND status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    }

    if (options.severity) {
      filterClause += ` AND severity = $${paramIndex}`;
      params.push(options.severity);
      paramIndex++;
    }

    const limit = options.limit || 50;
    params.push(limit);

    const result = await query<ClubAlertRow>(
      `SELECT id, alert_type as type, severity, message, status, created_at, resolved_at
       FROM alerts
       WHERE site_id = $1
         AND created_at > NOW() - INTERVAL '1 day' * $2
         ${filterClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex}`,
      params
    );
    return result.rows;
  }

  // ========================================================================
  // Club Usage & Content
  // ========================================================================

  /**
   * Statistiques d'utilisation agreges pour une periode.
   */
  async getUsageStats(siteId: string, from: string, to: string): Promise<UsageStatsRow> {
    const result = await query<UsageStatsRow>(
      `SELECT
        COALESCE(SUM(duration_played), 0) as screen_time_seconds,
        COUNT(*) as videos_played,
        COUNT(DISTINCT video_filename) as unique_videos,
        COUNT(DISTINCT session_id) as sessions_count,
        COUNT(DISTINCT DATE(played_at)) as active_days,
        COUNT(*) FILTER (WHERE trigger_type = 'manual') as manual_triggers,
        COUNT(*) FILTER (WHERE trigger_type = 'auto') as auto_plays,
        AVG(CASE WHEN completed THEN 100
            WHEN video_duration > 0 THEN (duration_played::float / video_duration * 100)
            ELSE 100 END) as avg_completion
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3`,
      [siteId, from, to]
    );
    return result.rows[0];
  }

  /**
   * Statistiques journalieres (pour graphe).
   */
  async getDailyStats(siteId: string, from: string, to: string): Promise<DailyStatsRow[]> {
    const result = await query<DailyStatsRow>(
      `SELECT
        DATE(played_at) as date,
        COALESCE(SUM(duration_played), 0) as screen_time,
        COUNT(*) as videos
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3
       GROUP BY DATE(played_at)
       ORDER BY date`,
      [siteId, from, to]
    );
    return result.rows;
  }

  /**
   * Statistiques par categorie de contenu.
   */
  async getCategoryStats(siteId: string, from: string, to: string): Promise<CategoryStatsRow[]> {
    const result = await query<CategoryStatsRow>(
      `SELECT
        category,
        COUNT(*) as plays,
        COALESCE(SUM(duration_played), 0) as total_duration
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3
       GROUP BY category
       ORDER BY plays DESC`,
      [siteId, from, to]
    );
    return result.rows;
  }

  /**
   * Top 10 videos avec taux de completion.
   */
  async getTopVideos(siteId: string, from: string, to: string, limit = 10): Promise<TopVideoRow[]> {
    const result = await query<TopVideoRow>(
      `SELECT
        video_filename,
        category,
        COUNT(*) as plays,
        COALESCE(SUM(duration_played), 0) as total_duration,
        AVG(CASE WHEN completed THEN 100
            WHEN video_duration > 0 THEN (duration_played::float / video_duration * 100)
            ELSE 100 END) as avg_completion
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3
       GROUP BY video_filename, category
       ORDER BY plays DESC
       LIMIT $4`,
      [siteId, from, to, limit]
    );
    return result.rows;
  }

  // ========================================================================
  // Sessions
  // ========================================================================

  /**
   * Demarre une session club.
   */
  async startSession(siteId: string): Promise<{ id: string; started_at: Date }> {
    const result = await query<{ id: string; started_at: Date }>(
      `INSERT INTO club_sessions (site_id, started_at)
       VALUES ($1, NOW())
       RETURNING id, started_at`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Termine une session club.
   */
  async endSession(sessionId: string): Promise<SessionRow | null> {
    const result = await query<SessionRow>(
      `UPDATE club_sessions
       SET ended_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
           videos_played = (SELECT COUNT(*) FROM video_plays WHERE session_id = $1),
           manual_triggers = (SELECT COUNT(*) FROM video_plays WHERE session_id = $1 AND trigger_type = 'manual'),
           auto_plays = (SELECT COUNT(*) FROM video_plays WHERE session_id = $1 AND trigger_type = 'auto')
       WHERE id = $1
       RETURNING *`,
      [sessionId]
    );
    return result.rows[0] || null;
  }

  // ========================================================================
  // Video Plays (Batch Insert)
  // ========================================================================

  /**
   * Insert en batch des lectures video (jusqu'a 100 par appel).
   */
  async recordVideoPlays(plays: VideoPlaysBatchItem[]): Promise<void> {
    if (plays.length === 0) return;

    const batchSize = 100;
    for (let i = 0; i < plays.length; i += batchSize) {
      const batch = plays.slice(i, i + batchSize);
      const values: unknown[] = [];
      const placeholders: string[] = [];

      batch.forEach((play, idx) => {
        const offset = idx * 12;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`
        );
        values.push(
          play.siteId, play.sessionId, play.videoFilename, play.category,
          play.playedAt, play.durationPlayed, play.videoDuration, play.completed,
          play.triggerType, play.videoId, play.sponsorId, play.tvStatus
        );
      });

      await query(
        `INSERT INTO video_plays (site_id, session_id, video_filename, category, played_at, duration_played, video_duration, completed, trigger_type, video_id, sponsor_id, tv_status)
         VALUES ${placeholders.join(', ')}`,
        values
      );
    }
  }

  // ========================================================================
  // Analytics Categories
  // ========================================================================

  /**
   * Liste toutes les categories analytics.
   */
  async getCategories(): Promise<AnalyticsCategoryRow[]> {
    const result = await query<AnalyticsCategoryRow>(
      `SELECT id, name, description, color, is_default, created_at
       FROM analytics_categories
       ORDER BY is_default DESC, name ASC`
    );
    return result.rows;
  }

  /**
   * Cree une nouvelle categorie.
   */
  async createCategory(input: CreateCategoryInput): Promise<AnalyticsCategoryRow> {
    const result = await query<AnalyticsCategoryRow>(
      `INSERT INTO analytics_categories (id, name, description, color, is_default)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, name, description, color, is_default, created_at`,
      [input.id, input.name, input.description, input.color]
    );
    return result.rows[0];
  }

  /**
   * Met a jour une categorie.
   */
  async updateCategory(id: string, name: string, description: string | null, color: string | null): Promise<AnalyticsCategoryRow | null> {
    const result = await query<AnalyticsCategoryRow>(
      `UPDATE analytics_categories
       SET name = $2, description = $3, color = $4
       WHERE id = $1
       RETURNING id, name, description, color, is_default, created_at`,
      [id, name, description, color]
    );
    return result.rows[0] || null;
  }

  /**
   * Verifie si une categorie est par defaut.
   */
  async isCategoryDefault(id: string): Promise<boolean | null> {
    const result = await query<{ is_default: boolean }>(
      'SELECT is_default FROM analytics_categories WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].is_default;
  }

  /**
   * Supprime une categorie (non-default uniquement).
   */
  async deleteCategory(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM analytics_categories WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ========================================================================
  // Analytics Overview
  // ========================================================================

  /**
   * Nombre total et en ligne de sites.
   */
  async getSiteCounts(): Promise<OverviewSiteCountRow> {
    const result = await query<OverviewSiteCountRow>(
      `SELECT
        COUNT(*) as total_sites,
        COUNT(*) FILTER (WHERE status = 'online') as online_sites
       FROM sites`
    );
    return result.rows[0];
  }

  /**
   * Lectures video aujourd'hui et cette semaine.
   */
  async getPlayCounts(): Promise<OverviewPlaysRow> {
    const result = await query<OverviewPlaysRow>(
      `SELECT
        COUNT(*) FILTER (WHERE played_at >= CURRENT_DATE) as plays_today,
        COUNT(*) FILTER (WHERE played_at >= CURRENT_DATE - INTERVAL '7 days') as plays_week
       FROM video_plays`
    );
    return result.rows[0];
  }

  /**
   * Disponibilite moyenne de la flotte sur 24h.
   */
  async getFleetAvailability(): Promise<number | null> {
    const result = await query<OverviewAvailabilityRow>(
      `SELECT AVG(availability) as avg_availability
       FROM (
        SELECT
          site_id,
          LEAST(100, (COUNT(*) * 100.0 / 2880)) as availability
        FROM metrics
        WHERE recorded_at >= NOW() - INTERVAL '24 hours'
        GROUP BY site_id
       ) sub`
    );
    return result.rows[0]?.avg_availability || null;
  }

  /**
   * Resume par site (plays today, heartbeats 24h).
   */
  async getSitesSummary(): Promise<OverviewSiteSummaryRow[]> {
    const result = await query<OverviewSiteSummaryRow>(
      `SELECT
        s.id as site_id,
        s.club_name,
        s.status,
        COALESCE(vp.plays_today, 0) as plays_today,
        COALESCE(m.heartbeat_count, 0) as heartbeat_count
       FROM sites s
       LEFT JOIN (
        SELECT site_id, COUNT(*) as plays_today
        FROM video_plays
        WHERE played_at >= CURRENT_DATE
        GROUP BY site_id
       ) vp ON vp.site_id = s.id
       LEFT JOIN (
        SELECT site_id, COUNT(*) as heartbeat_count
        FROM metrics
        WHERE recorded_at >= NOW() - INTERVAL '24 hours'
        GROUP BY site_id
       ) m ON m.site_id = s.id
       ORDER BY s.club_name`
    );
    return result.rows;
  }

  // ========================================================================
  // Multi-Site Comparison
  // ========================================================================

  /**
   * Comparaison multi-sites.
   */
  async getMultiSiteComparison(siteIds: string[], days: number): Promise<ComparisonSiteRow[]> {
    const result = await query<ComparisonSiteRow>(
      `SELECT
        s.id,
        s.site_name,
        s.club_name,
        COUNT(DISTINCT cds.date)::integer as days_active,
        COALESCE(SUM(cds.videos_played), 0)::integer as total_videos,
        COALESCE(SUM(cds.screen_time_seconds), 0)::integer as total_screen_time,
        COALESCE(AVG(cds.completion_rate), 0)::numeric(5,1) as avg_completion
       FROM sites s
       LEFT JOIN club_daily_stats cds ON cds.site_id = s.id
         AND cds.date > CURRENT_DATE - $2::interval
       WHERE s.id = ANY($1::uuid[])
       GROUP BY s.id, s.site_name, s.club_name
       ORDER BY total_videos DESC`,
      [siteIds, `${days} days`]
    );
    return result.rows;
  }

  // ========================================================================
  // Club Dashboard (parallel queries)
  // ========================================================================

  /**
   * Donnees sante pour le dashboard club.
   */
  async getDashboardHealth(siteId: string): Promise<DashboardHealthRow | null> {
    const result = await query<DashboardHealthRow>(
      `SELECT
        s.status, s.last_seen_at,
        m.cpu_usage, m.memory_usage, m.temperature, m.disk_usage
       FROM sites s
       LEFT JOIN LATERAL (
        SELECT * FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1
       ) m ON true
       WHERE s.id = $1`,
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Resume d'utilisation pour le dashboard.
   */
  async getDashboardUsage(siteId: string, from: string, to: string): Promise<DashboardUsageRow> {
    const result = await query<DashboardUsageRow>(
      `SELECT
        COALESCE(SUM(duration_played), 0) as screen_time_seconds,
        COUNT(*) as videos_played,
        COUNT(DISTINCT DATE(played_at)) as active_days,
        COUNT(*) FILTER (WHERE trigger_type = 'manual') as manual_triggers,
        COUNT(*) FILTER (WHERE trigger_type = 'auto') as auto_plays
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3`,
      [siteId, from, to]
    );
    return result.rows[0];
  }

  /**
   * Categories pour le dashboard.
   */
  async getDashboardCategories(siteId: string, from: string, to: string): Promise<DashboardCategoryRow[]> {
    const result = await query<DashboardCategoryRow>(
      `SELECT
        category,
        COUNT(*) as plays
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3
       GROUP BY category`,
      [siteId, from, to]
    );
    return result.rows;
  }

  /**
   * Top 5 videos pour le dashboard.
   */
  async getDashboardTopVideos(siteId: string, from: string, to: string): Promise<{ video_filename: string; plays: string }[]> {
    const result = await query<{ video_filename: string; plays: string }>(
      `SELECT video_filename, COUNT(*) as plays
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3
       GROUP BY video_filename
       ORDER BY plays DESC
       LIMIT 5`,
      [siteId, from, to]
    );
    return result.rows;
  }

  /**
   * Alertes recentes pour le dashboard.
   */
  async getDashboardAlerts(siteId: string, from: string): Promise<QueryResultRow[]> {
    const result = await query(
      `SELECT alert_type, severity, message, created_at, resolved_at
       FROM alerts
       WHERE site_id = $1
         AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT 5`,
      [siteId, from]
    );
    return result.rows;
  }

  // ========================================================================
  // Data Export
  // ========================================================================

  /**
   * Export video_plays pour CSV.
   */
  async exportVideoPlays(siteId: string, from: string, to: string): Promise<QueryResultRow[]> {
    const result = await query(
      `SELECT
        played_at, video_filename, category, duration_played,
        video_duration, completed, trigger_type
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3
       ORDER BY played_at DESC`,
      [siteId, from, to]
    );
    return result.rows;
  }

  /**
   * Export club_daily_stats.
   */
  async exportDailyStats(siteId: string, from: string, to: string): Promise<QueryResultRow[]> {
    const result = await query(
      `SELECT *
       FROM club_daily_stats
       WHERE site_id = $1
         AND date >= $2
         AND date <= $3
       ORDER BY date DESC`,
      [siteId, from, to]
    );
    return result.rows;
  }

  /**
   * Export metriques.
   */
  async exportMetrics(siteId: string, from: string, to: string): Promise<QueryResultRow[]> {
    const result = await query(
      `SELECT recorded_at, cpu_usage, memory_usage, temperature, disk_usage, uptime
       FROM metrics
       WHERE site_id = $1
         AND recorded_at >= $2
         AND recorded_at <= $3
       ORDER BY recorded_at DESC`,
      [siteId, from, to]
    );
    return result.rows;
  }

  /**
   * Calcule les stats journalieres via fonction PG.
   */
  async calculateDailyStats(date: string): Promise<number> {
    const result = await query<{ count: number }>(
      'SELECT calculate_all_daily_stats($1::DATE) as count',
      [date]
    );
    return result.rows[0]?.count ?? 0;
  }
}

export const analyticsRepository = new AnalyticsRepositoryImpl();
