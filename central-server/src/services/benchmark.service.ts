/**
 * Benchmark Service
 *
 * Génère des benchmarks anonymisés permettant aux clubs de se comparer
 * sans révéler l'identité des autres clubs.
 *
 * Métriques comparées :
 * - Nombre de sessions par mois
 * - Vidéos jouées par session
 * - Durée moyenne des sessions
 * - Taux d'utilisation du live score
 * - Uptime moyen
 *
 * Segmentation :
 * - Par sport (football, basketball, handball, etc.)
 * - Par région (département, région)
 * - Par taille de club (petit < 5 sessions/mois, moyen 5-15, grand > 15)
 */

import { query } from '../config/database';
import logger from '../config/logger';

interface BenchmarkStats {
  metric: string;
  yourValue: number;
  percentile: number;
  average: number;
  median: number;
  min: number;
  max: number;
  sampleSize: number;
}

interface BenchmarkResult {
  siteId: string;
  period: string;
  segments: {
    sport?: string;
    region?: string;
    sizeCategory?: string;
  };
  metrics: BenchmarkStats[];
  generatedAt: string;
}

interface SegmentFilter {
  sport?: string;
  region?: string;
  sizeCategory?: 'small' | 'medium' | 'large';
}

class BenchmarkService {
  /**
   * Calcule le benchmark pour un site donné
   */
  async calculateBenchmark(
    siteId: string,
    period: { start: string; end: string },
    filters?: SegmentFilter
  ): Promise<BenchmarkResult> {
    logger.info('[Benchmark] Calculating benchmark', { siteId, period, filters });

    // 1. Récupérer les infos du site pour la segmentation
    const siteResult = await query(`
      SELECT
        id,
        site_name,
        sports,
        location
      FROM sites
      WHERE id = $1
    `, [siteId]);

    if (siteResult.rowCount === 0) {
      throw new Error('Site not found');
    }

    const site = siteResult.rows[0];
    const sports = site.sports as string[] || [];
    const region = (site.location as { region?: string })?.region;

    // 2. Déterminer les segments de comparaison
    const segments: SegmentFilter = {
      sport: filters?.sport || (sports.length > 0 ? sports[0] : undefined),
      region: filters?.region || region,
      sizeCategory: filters?.sizeCategory,
    };

    // 3. Calculer les métriques du site
    const siteMetrics = await this.getSiteMetrics(siteId, period);

    // 4. Calculer les métriques de tous les sites comparables
    const peerMetrics = await this.getPeerMetrics(siteId, period, segments);

    // 5. Calculer les statistiques de benchmark pour chaque métrique
    const benchmarkMetrics: BenchmarkStats[] = [];

    for (const [metricName, yourValue] of Object.entries(siteMetrics)) {
      const peerValues = peerMetrics.map(p => p[metricName] as number).filter(v => typeof v === 'number');

      if (peerValues.length >= 3) { // Minimum 3 pairs pour un benchmark significatif
        benchmarkMetrics.push({
          metric: metricName,
          yourValue: yourValue as number,
          percentile: this.calculatePercentile(yourValue as number, peerValues),
          average: this.calculateAverage(peerValues),
          median: this.calculateMedian(peerValues),
          min: Math.min(...peerValues),
          max: Math.max(...peerValues),
          sampleSize: peerValues.length,
        });
      }
    }

    return {
      siteId,
      period: `${period.start} - ${period.end}`,
      segments: {
        sport: segments.sport,
        region: segments.region,
        sizeCategory: segments.sizeCategory,
      },
      metrics: benchmarkMetrics,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Récupère les métriques d'un site pour la période donnée
   */
  private async getSiteMetrics(
    siteId: string,
    period: { start: string; end: string }
  ): Promise<Record<string, number>> {
    // Sessions par mois
    const sessionsResult = await query(`
      SELECT COUNT(*) as session_count
      FROM club_sessions
      WHERE site_id = $1
        AND started_at >= $2::date
        AND started_at <= $3::date
    `, [siteId, period.start, period.end]);

    // Vidéos jouées
    const videosResult = await query(`
      SELECT COUNT(*) as video_count
      FROM video_plays
      WHERE site_id = $1
        AND played_at >= $2::date
        AND played_at <= $3::date
    `, [siteId, period.start, period.end]);

    // Durée moyenne des sessions (en minutes)
    const durationResult = await query(`
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0) as avg_duration
      FROM club_sessions
      WHERE site_id = $1
        AND started_at >= $2::date
        AND started_at <= $3::date
        AND ended_at IS NOT NULL
    `, [siteId, period.start, period.end]);

    // Uptime (basé sur les heartbeats)
    const uptimeResult = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'online') as online_days,
        COUNT(*) as total_days
      FROM (
        SELECT
          DATE(recorded_at) as day,
          MAX(CASE WHEN recorded_at = (
            SELECT MAX(m2.recorded_at)
            FROM metrics m2
            WHERE m2.site_id = $1 AND DATE(m2.recorded_at) = DATE(m.recorded_at)
          ) THEN 'online' END) as status
        FROM metrics m
        WHERE site_id = $1
          AND recorded_at >= $2::date
          AND recorded_at <= $3::date
        GROUP BY DATE(recorded_at)
      ) daily_status
    `, [siteId, period.start, period.end]);

    const sessionCount = parseInt(sessionsResult.rows[0]?.session_count as string, 10) || 0;
    const videoCount = parseInt(videosResult.rows[0]?.video_count as string, 10) || 0;
    const avgDuration = parseFloat(durationResult.rows[0]?.avg_duration as string) || 0;
    const onlineDays = parseInt(uptimeResult.rows[0]?.online_days as string, 10) || 0;
    const totalDays = parseInt(uptimeResult.rows[0]?.total_days as string, 10) || 1;

    return {
      sessions_per_month: sessionCount,
      videos_per_session: sessionCount > 0 ? videoCount / sessionCount : 0,
      avg_session_duration: avgDuration,
      uptime_percent: (onlineDays / totalDays) * 100,
      total_videos: videoCount,
    };
  }

  /**
   * Récupère les métriques de tous les sites comparables
   */
  private async getPeerMetrics(
    excludeSiteId: string,
    period: { start: string; end: string },
    segments: SegmentFilter
  ): Promise<Record<string, number>[]> {
    // Build the WHERE clause based on segments
    const conditions: string[] = [
      `s.id != $1`,
      `s.status != 'archived'`,
    ];
    const params: (string | number)[] = [excludeSiteId, period.start, period.end];
    let paramIndex = 4;

    if (segments.sport) {
      conditions.push(`$${paramIndex}::text = ANY(s.sports)`);
      params.push(segments.sport);
      paramIndex++;
    }

    if (segments.region) {
      conditions.push(`(s.location->>'region') = $${paramIndex}`);
      params.push(segments.region);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get all comparable sites with their metrics
    const result = await query(`
      WITH site_metrics AS (
        SELECT
          s.id as site_id,
          (
            SELECT COUNT(*)
            FROM club_sessions cs
            WHERE cs.site_id = s.id
              AND cs.started_at >= $2::date
              AND cs.started_at <= $3::date
          ) as session_count,
          (
            SELECT COUNT(*)
            FROM video_plays vp
            WHERE vp.site_id = s.id
              AND vp.played_at >= $2::date
              AND vp.played_at <= $3::date
          ) as video_count,
          (
            SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at)) / 60), 0)
            FROM club_sessions cs
            WHERE cs.site_id = s.id
              AND cs.started_at >= $2::date
              AND cs.started_at <= $3::date
              AND cs.ended_at IS NOT NULL
          ) as avg_duration
        FROM sites s
        WHERE ${whereClause}
      )
      SELECT
        session_count as sessions_per_month,
        CASE WHEN session_count > 0 THEN video_count::float / session_count ELSE 0 END as videos_per_session,
        avg_duration as avg_session_duration,
        video_count as total_videos
      FROM site_metrics
    `, params);

    return result.rows.map(row => ({
      sessions_per_month: parseInt(row.sessions_per_month as string, 10) || 0,
      videos_per_session: parseFloat(row.videos_per_session as string) || 0,
      avg_session_duration: parseFloat(row.avg_session_duration as string) || 0,
      total_videos: parseInt(row.total_videos as string, 10) || 0,
    }));
  }

  /**
   * Calcule le percentile d'une valeur dans une distribution
   */
  private calculatePercentile(value: number, distribution: number[]): number {
    const sorted = [...distribution].sort((a, b) => a - b);
    const belowCount = sorted.filter(v => v < value).length;
    return Math.round((belowCount / sorted.length) * 100);
  }

  /**
   * Calcule la moyenne
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calcule la médiane
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Génère un résumé global des benchmarks (pour admin)
   */
  async getGlobalBenchmarkSummary(period: { start: string; end: string }): Promise<{
    totalSites: number;
    bySport: Record<string, { count: number; avgSessions: number; avgVideos: number }>;
    byRegion: Record<string, { count: number; avgSessions: number; avgVideos: number }>;
  }> {
    // Par sport
    const sportResult = await query(`
      SELECT
        unnest(s.sports) as sport,
        COUNT(DISTINCT s.id) as site_count,
        COALESCE(AVG((
          SELECT COUNT(*)
          FROM club_sessions cs
          WHERE cs.site_id = s.id
            AND cs.started_at >= $1::date
            AND cs.started_at <= $2::date
        )), 0) as avg_sessions,
        COALESCE(AVG((
          SELECT COUNT(*)
          FROM video_plays vp
          WHERE vp.site_id = s.id
            AND vp.played_at >= $1::date
            AND vp.played_at <= $2::date
        )), 0) as avg_videos
      FROM sites s
      WHERE s.status != 'archived'
        AND s.sports IS NOT NULL
        AND array_length(s.sports, 1) > 0
      GROUP BY unnest(s.sports)
      ORDER BY site_count DESC
    `, [period.start, period.end]);

    // Par région
    const regionResult = await query(`
      SELECT
        s.location->>'region' as region,
        COUNT(DISTINCT s.id) as site_count,
        COALESCE(AVG((
          SELECT COUNT(*)
          FROM club_sessions cs
          WHERE cs.site_id = s.id
            AND cs.started_at >= $1::date
            AND cs.started_at <= $2::date
        )), 0) as avg_sessions,
        COALESCE(AVG((
          SELECT COUNT(*)
          FROM video_plays vp
          WHERE vp.site_id = s.id
            AND vp.played_at >= $1::date
            AND vp.played_at <= $2::date
        )), 0) as avg_videos
      FROM sites s
      WHERE s.status != 'archived'
        AND s.location->>'region' IS NOT NULL
      GROUP BY s.location->>'region'
      ORDER BY site_count DESC
    `, [period.start, period.end]);

    const bySport: Record<string, { count: number; avgSessions: number; avgVideos: number }> = {};
    for (const row of sportResult.rows) {
      bySport[row.sport as string] = {
        count: parseInt(row.site_count as string, 10),
        avgSessions: parseFloat(row.avg_sessions as string) || 0,
        avgVideos: parseFloat(row.avg_videos as string) || 0,
      };
    }

    const byRegion: Record<string, { count: number; avgSessions: number; avgVideos: number }> = {};
    for (const row of regionResult.rows) {
      if (row.region) {
        byRegion[row.region as string] = {
          count: parseInt(row.site_count as string, 10),
          avgSessions: parseFloat(row.avg_sessions as string) || 0,
          avgVideos: parseFloat(row.avg_videos as string) || 0,
        };
      }
    }

    // Total sites
    const totalResult = await query(`
      SELECT COUNT(*) as total
      FROM sites
      WHERE status != 'archived'
    `);

    return {
      totalSites: parseInt(totalResult.rows[0].total as string, 10),
      bySport,
      byRegion,
    };
  }
}

export const benchmarkService = new BenchmarkService();
export default benchmarkService;
