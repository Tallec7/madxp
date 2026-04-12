import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import {
  advertiserRepository,
} from '../repositories';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}min`;
}

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/advertisers/:id/stats
 * Récupérer les analytics d'un annonceur pour une période donnée
 */
export const getAdvertiserStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

    const advertiserName = await advertiserRepository.findName(id);

    if (!advertiserName) {
      res.status(404).json({
        success: false,
        error: 'Advertiser not found',
      });
      return;
    }

    // Dates par défaut : 30 derniers jours
    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Récupérer les vidéos de l'annonceur
    const videoIds = await advertiserRepository.getVideoIds(id);

    if (videoIds.length === 0) {
      res.json({
        success: true,
        data: {
          advertiser_name: advertiserName,
          period: `${fromDate}/${toDate}`,
          summary: {
            total_impressions: 0,
            total_screen_time_seconds: 0,
            avg_daily_impressions: 0,
            completion_rate: 0,
            estimated_reach: 0,
            active_sites: 0,
            active_days: 0,
          },
          by_video: [],
          by_site: [],
          by_period: {},
          by_event_type: {},
          trends: { daily: [], weekly: [] },
        },
      });
      return;
    }

    // Récupérer toutes les stats en parallèle
    const [summary, byVideoRows, bySiteRows, byPeriodRows, byEventRows, dailyTrendRows] = await Promise.all([
      advertiserRepository.getStatsSummary(videoIds, fromDate, toDate),
      advertiserRepository.getStatsByVideo(videoIds, fromDate, toDate),
      advertiserRepository.getStatsBySite(videoIds, fromDate, toDate),
      advertiserRepository.getStatsByPeriod(videoIds, fromDate, toDate),
      advertiserRepository.getStatsByEventType(videoIds, fromDate, toDate),
      advertiserRepository.getDailyTrends(videoIds, fromDate, toDate),
    ]);

    const totalImpressions = parseInt(summary.total_impressions) || 0;
    const totalScreenTime = parseInt(summary.total_screen_time_seconds) || 0;
    const avgDailyImpressions = totalImpressions / Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (24 * 60 * 60 * 1000)));

    const byPeriod = byPeriodRows.reduce((acc, row) => {
      acc[row.period] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    const byEventType = byEventRows.reduce((acc, row) => {
      acc[row.event_type] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: {
        advertiser_name: advertiserName,
        period: `${fromDate}/${toDate}`,
        summary: {
          total_impressions: totalImpressions,
          total_screen_time_seconds: totalScreenTime,
          total_screen_time: formatDuration(totalScreenTime),
          avg_daily_impressions: Math.round(avgDailyImpressions * 10) / 10,
          completion_rate: parseFloat(summary.completion_rate) || 0,
          estimated_reach: parseInt(summary.estimated_reach) || 0,
          active_sites: parseInt(summary.active_sites) || 0,
          active_days: parseInt(summary.active_days) || 0,
        },
        by_video: byVideoRows.map(v => ({
          video_id: v.video_id,
          name: v.video_name,
          impressions: parseInt(v.impressions),
          screen_time_seconds: parseInt(v.screen_time_seconds),
          completion_rate: parseFloat(v.completion_rate) || 0,
        })),
        by_site: bySiteRows.map(s => ({
          site_id: s.site_id,
          site_name: s.site_name,
          club_name: s.club_name,
          impressions: parseInt(s.impressions),
          screen_time_seconds: parseInt(s.screen_time_seconds),
        })),
        by_period: byPeriod,
        by_event_type: byEventType,
        trends: {
          daily: dailyTrendRows.map(d => ({
            date: d.date,
            impressions: parseInt(d.impressions),
            screen_time: parseInt(d.screen_time),
          })),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching advertiser stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch advertiser stats',
    });
  }
};

/**
 * GET /api/analytics/advertisers/:id/kpis
 * KPIs enrichis depuis video_plays (Pipeline consolidé).
 * Utilise tv_status, event_type, period pour des métriques business actionnables.
 */
export const getAdvertiserKpis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid advertiser ID' });
      return;
    }

    const advertiserName = await advertiserRepository.findName(id);
    if (!advertiserName) {
      res.status(404).json({ success: false, error: 'Advertiser not found' });
      return;
    }

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Requêtes KPI en parallèle (depuis video_plays consolidé)
    const [summary, peakHours, rotationData] = await Promise.all([
      advertiserRepository.getKpisSummary(id, fromDate, toDate),
      advertiserRepository.getKpisPeakHours(id, fromDate, toDate),
      advertiserRepository.getKpisRotationData(id, fromDate, toDate),
    ]);

    const totalImpressions = parseInt(summary.total_impressions) || 0;
    const verifiedImpressions = parseInt(summary.verified_impressions) || 0;
    const matchDayImpressions = parseInt(summary.match_day_impressions) || 0;

    // Calcul du rotation fairness (0 = inégal, 1 = parfaitement équitable)
    let rotationFairness = 1;
    if (rotationData.length > 1) {
      const counts = rotationData.map(r => parseInt(r.play_count));
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // Coefficient de variation
      rotationFairness = Math.round(Math.max(0, 1 - cv) * 100) / 100;
    }

    // Heatmap 24h
    const hourlyMap: Record<number, { impressions: number; screen_time: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { impressions: 0, screen_time: 0 };
    }
    for (const row of peakHours) {
      const h = parseInt(row.hour);
      hourlyMap[h] = {
        impressions: parseInt(row.impressions),
        screen_time: parseInt(row.screen_time),
      };
    }

    // Score de renouvellement (0-100)
    // Pondération : verified_impressions (30%), completion_rate (25%), match_day (20%), sites_coverage (15%), fairness (10%)
    const completionRate = parseFloat(summary.completion_rate) || 0;
    const sitesCoverage = parseInt(summary.sites_coverage) || 0;
    const renewalScore = Math.round(
      Math.min(verifiedImpressions / Math.max(totalImpressions * 0.5, 1), 1) * 30 +
      Math.min(completionRate / 80, 1) * 25 +
      Math.min(matchDayImpressions / Math.max(totalImpressions * 0.3, 1), 1) * 20 +
      Math.min(sitesCoverage / 5, 1) * 15 +
      rotationFairness * 10
    );

    res.json({
      success: true,
      data: {
        advertiser_name: advertiserName,
        period: `${fromDate}/${toDate}`,
        kpis: {
          total_impressions: totalImpressions,
          verified_impressions: verifiedImpressions,
          tv_on_rate: parseFloat(summary.tv_on_rate) || 0,
          match_day_impressions: matchDayImpressions,
          completion_rate: completionRate,
          sites_coverage: sitesCoverage,
          total_screen_time_seconds: parseInt(summary.total_screen_time_seconds) || 0,
          total_screen_time: formatDuration(parseInt(summary.total_screen_time_seconds) || 0),
          rotation_fairness: rotationFairness,
          renewal_score: renewalScore,
        },
        peak_hours: hourlyMap,
        rotation: rotationData.map(r => ({
          video: r.video_filename,
          plays: parseInt(r.play_count),
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching advertiser KPIs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch advertiser KPIs' });
  }
};
