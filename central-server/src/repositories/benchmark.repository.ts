import { QueryResultRow } from 'pg';
import { query } from '../config/database';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface SiteBenchmarkInfoRow extends QueryResultRow {
  id: string;
  site_name: string;
  sports: string[] | null;
  location: { region?: string } | null;
}

export interface SiteMetricsRow extends QueryResultRow {
  session_count: string;
  video_count: string;
  avg_duration: string;
  online_days: string;
}

export interface PeerMetricsRow extends QueryResultRow {
  sessions_per_month: string;
  videos_per_session: string;
  avg_session_duration: string;
  total_videos: string;
}

export interface SportBenchmarkRow extends QueryResultRow {
  sport: string;
  site_count: string;
  avg_sessions: string;
  avg_videos: string;
}

export interface RegionBenchmarkRow extends QueryResultRow {
  region: string | null;
  site_count: string;
  avg_sessions: string;
  avg_videos: string;
}

export interface TotalSitesRow extends QueryResultRow {
  total: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class BenchmarkRepository {
  /**
   * Fetch site info for benchmark segmentation
   */
  async findSiteForBenchmark(siteId: string): Promise<SiteBenchmarkInfoRow | null> {
    const result = await query<SiteBenchmarkInfoRow>(
      `SELECT id, site_name, sports, location
       FROM sites
       WHERE id = $1`,
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Fetch session count, video count, avg duration, and online days for a single site.
   * Uses a single query with subqueries to reduce round-trips.
   */
  async getSiteMetrics(
    siteId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    sessionCount: number;
    videoCount: number;
    avgDuration: number;
    onlineDays: number;
    totalDays: number;
  }> {
    const result = await query<SiteMetricsRow>(
      `SELECT
        (SELECT COUNT(*)
         FROM club_sessions
         WHERE site_id = $1
           AND started_at >= $2::date
           AND started_at < ($3::date + INTERVAL '1 day')
        ) AS session_count,
        (SELECT COUNT(*)
         FROM video_plays
         WHERE site_id = $1
           AND played_at >= $2::date
           AND played_at < ($3::date + INTERVAL '1 day')
        ) AS video_count,
        (SELECT COALESCE(
           AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0)
         FROM club_sessions
         WHERE site_id = $1
           AND started_at >= $2::date
           AND started_at < ($3::date + INTERVAL '1 day')
           AND ended_at IS NOT NULL
        ) AS avg_duration,
        (SELECT COUNT(DISTINCT DATE(recorded_at))
         FROM metrics
         WHERE site_id = $1
           AND recorded_at >= $2::date
           AND recorded_at < ($3::date + INTERVAL '1 day')
        ) AS online_days`,
      [siteId, startDate, endDate]
    );

    const row = result.rows[0];
    const sessionCount = parseInt(row?.session_count ?? '0', 10);
    const videoCount = parseInt(row?.video_count ?? '0', 10);
    const avgDuration = parseFloat(row?.avg_duration ?? '0');
    const onlineDays = parseInt(row?.online_days ?? '0', 10);

    // Total calendar days in period
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
    );

    return { sessionCount, videoCount, avgDuration, onlineDays, totalDays };
  }

  /**
   * Fetch aggregated metrics for all comparable peer sites in a single query.
   * Uses pre-aggregated LEFT JOINs instead of correlated subqueries per site.
   */
  async getPeerMetrics(
    excludeSiteId: string,
    startDate: string,
    endDate: string,
    filters: { sport?: string; region?: string }
  ): Promise<PeerMetricsRow[]> {
    const conditions: string[] = [
      's.id != $1',
      // Only include sites with a 'real' status (excludes 'error')
      `s.status IN ('online', 'offline', 'maintenance')`,
    ];
    const params: (string | number)[] = [excludeSiteId, startDate, endDate];
    let paramIndex = 4;

    if (filters.sport) {
      conditions.push(`s.sports @> $${paramIndex}::jsonb`);
      params.push(JSON.stringify([filters.sport]));
      paramIndex++;
    }

    if (filters.region) {
      conditions.push(`(s.location->>'region') = $${paramIndex}`);
      params.push(filters.region);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const result = await query<PeerMetricsRow>(
      `SELECT
        COALESCE(cs_agg.session_count, 0)::text AS sessions_per_month,
        CASE WHEN COALESCE(cs_agg.session_count, 0) > 0
          THEN (COALESCE(vp_agg.video_count, 0)::float / cs_agg.session_count)::text
          ELSE '0'
        END AS videos_per_session,
        COALESCE(cs_agg.avg_duration, 0)::text AS avg_session_duration,
        COALESCE(vp_agg.video_count, 0)::text AS total_videos
      FROM sites s
      LEFT JOIN (
        SELECT site_id,
               COUNT(*) AS session_count,
               AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)
                 FILTER (WHERE ended_at IS NOT NULL) AS avg_duration
        FROM club_sessions
        WHERE started_at >= $2::date
          AND started_at < ($3::date + INTERVAL '1 day')
        GROUP BY site_id
      ) cs_agg ON cs_agg.site_id = s.id
      LEFT JOIN (
        SELECT site_id, COUNT(*) AS video_count
        FROM video_plays
        WHERE played_at >= $2::date
          AND played_at < ($3::date + INTERVAL '1 day')
        GROUP BY site_id
      ) vp_agg ON vp_agg.site_id = s.id
      WHERE ${whereClause}`,
      params
    );

    return result.rows;
  }

  /**
   * Global benchmark summary by sport
   */
  async getGlobalBySport(
    startDate: string,
    endDate: string
  ): Promise<SportBenchmarkRow[]> {
    const result = await query<SportBenchmarkRow>(
      `SELECT
        sport,
        COUNT(DISTINCT s.id)::text AS site_count,
        COALESCE(AVG(cs_agg.session_count), 0)::text AS avg_sessions,
        COALESCE(AVG(vp_agg.video_count), 0)::text AS avg_videos
      FROM sites s
      CROSS JOIN LATERAL jsonb_array_elements_text(s.sports) AS sport
      LEFT JOIN (
        SELECT site_id, COUNT(*) AS session_count
        FROM club_sessions
        WHERE started_at >= $1::date AND started_at < ($2::date + INTERVAL '1 day')
        GROUP BY site_id
      ) cs_agg ON cs_agg.site_id = s.id
      LEFT JOIN (
        SELECT site_id, COUNT(*) AS video_count
        FROM video_plays
        WHERE played_at >= $1::date AND played_at < ($2::date + INTERVAL '1 day')
        GROUP BY site_id
      ) vp_agg ON vp_agg.site_id = s.id
      WHERE s.status IN ('online', 'offline', 'maintenance')
        AND s.sports IS NOT NULL
        AND jsonb_array_length(s.sports) > 0
      GROUP BY sport
      ORDER BY COUNT(DISTINCT s.id) DESC`,
      [startDate, endDate]
    );
    return result.rows;
  }

  /**
   * Global benchmark summary by region
   */
  async getGlobalByRegion(
    startDate: string,
    endDate: string
  ): Promise<RegionBenchmarkRow[]> {
    const result = await query<RegionBenchmarkRow>(
      `SELECT
        s.location->>'region' AS region,
        COUNT(DISTINCT s.id)::text AS site_count,
        COALESCE(AVG(cs_agg.session_count), 0)::text AS avg_sessions,
        COALESCE(AVG(vp_agg.video_count), 0)::text AS avg_videos
      FROM sites s
      LEFT JOIN (
        SELECT site_id, COUNT(*) AS session_count
        FROM club_sessions
        WHERE started_at >= $1::date AND started_at < ($2::date + INTERVAL '1 day')
        GROUP BY site_id
      ) cs_agg ON cs_agg.site_id = s.id
      LEFT JOIN (
        SELECT site_id, COUNT(*) AS video_count
        FROM video_plays
        WHERE played_at >= $1::date AND played_at < ($2::date + INTERVAL '1 day')
        GROUP BY site_id
      ) vp_agg ON vp_agg.site_id = s.id
      WHERE s.status IN ('online', 'offline', 'maintenance')
        AND s.location->>'region' IS NOT NULL
      GROUP BY s.location->>'region'
      ORDER BY COUNT(DISTINCT s.id) DESC`,
      [startDate, endDate]
    );
    return result.rows;
  }

  /**
   * Count total active sites
   */
  async countActiveSites(): Promise<number> {
    const result = await query<TotalSitesRow>(
      `SELECT COUNT(*)::text AS total
       FROM sites
       WHERE status IN ('online', 'offline', 'maintenance')`
    );
    return parseInt(result.rows[0]?.total ?? '0', 10);
  }
}

export const benchmarkRepository = new BenchmarkRepository();
