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

import logger from '../config/logger';
import { benchmarkRepository } from '../repositories/benchmark.repository';

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
    const site = await benchmarkRepository.findSiteForBenchmark(siteId);
    if (!site) {
      throw new Error('Site not found');
    }

    const sports: string[] = Array.isArray(site.sports) ? site.sports : [];
    const region = site.location?.region;

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
    const m = await benchmarkRepository.getSiteMetrics(siteId, period.start, period.end);

    return {
      sessions_per_month: m.sessionCount,
      videos_per_session: m.sessionCount > 0 ? m.videoCount / m.sessionCount : 0,
      avg_session_duration: m.avgDuration,
      uptime_percent: (m.onlineDays / m.totalDays) * 100,
      total_videos: m.videoCount,
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
    const rows = await benchmarkRepository.getPeerMetrics(
      excludeSiteId,
      period.start,
      period.end,
      { sport: segments.sport, region: segments.region }
    );

    return rows.map(row => ({
      sessions_per_month: parseInt(row.sessions_per_month, 10) || 0,
      videos_per_session: parseFloat(row.videos_per_session) || 0,
      avg_session_duration: parseFloat(row.avg_session_duration) || 0,
      total_videos: parseInt(row.total_videos, 10) || 0,
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
    const [sportRows, regionRows, totalSites] = await Promise.all([
      benchmarkRepository.getGlobalBySport(period.start, period.end),
      benchmarkRepository.getGlobalByRegion(period.start, period.end),
      benchmarkRepository.countActiveSites(),
    ]);

    const bySport: Record<string, { count: number; avgSessions: number; avgVideos: number }> = {};
    for (const row of sportRows) {
      bySport[row.sport] = {
        count: parseInt(row.site_count, 10),
        avgSessions: parseFloat(row.avg_sessions) || 0,
        avgVideos: parseFloat(row.avg_videos) || 0,
      };
    }

    const byRegion: Record<string, { count: number; avgSessions: number; avgVideos: number }> = {};
    for (const row of regionRows) {
      if (row.region) {
        byRegion[row.region] = {
          count: parseInt(row.site_count, 10),
          avgSessions: parseFloat(row.avg_sessions) || 0,
          avgVideos: parseFloat(row.avg_videos) || 0,
        };
      }
    }

    return { totalSites, bySport, byRegion };
  }
}

export const benchmarkService = new BenchmarkService();
export default benchmarkService;
