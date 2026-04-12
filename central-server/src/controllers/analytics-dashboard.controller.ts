import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import { analyticsRepository } from '../repositories';

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
};

/**
 * GET /api/analytics/clubs/:siteId/dashboard
 * Dashboard complet d'un site
 */
export const getClubDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { from, to } = req.query;

    const fromDate = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to as string) : new Date();

    const fromStr = fromDate.toISOString();
    const toStr = toDate.toISOString();

    // Récupérer toutes les données en parallèle via le repository
    const [health, usage, content, topVideos, recentAlerts, dailyRows] = await Promise.all([
      analyticsRepository.getDashboardHealth(siteId),
      analyticsRepository.getDashboardUsage(siteId, fromStr, toStr),
      analyticsRepository.getDashboardCategories(siteId, fromStr, toStr),
      analyticsRepository.getDashboardTopVideos(siteId, fromStr, toStr),
      analyticsRepository.getDashboardAlerts(siteId, fromStr),
      analyticsRepository.getDailyStats(siteId, fromStr, toStr),
    ]);

    // Construire la réponse
    const byCategory: Record<string, number> = {};
    for (const row of content) {
      byCategory[row.category || 'other'] = parseInt(row.plays);
    }

    res.json({
      site_id: siteId,
      period: `${fromDate.toISOString().split('T')[0]}/${toDate.toISOString().split('T')[0]}`,
      health: {
        status: health?.status || 'unknown',
        last_seen: health?.last_seen_at,
        current: health?.cpu_usage != null
          ? {
              cpu: Math.round(health.cpu_usage * 10) / 10,
              memory: Math.round((health.memory_usage ?? 0) * 10) / 10,
              temperature: Math.round((health.temperature ?? 0) as number),
              disk: Math.round((health.disk_usage ?? 0) * 10) / 10,
            }
          : null,
      },
      usage: {
        screen_time_seconds: parseInt(usage.screen_time_seconds),
        screen_time_formatted: formatDuration(parseInt(usage.screen_time_seconds)),
        videos_played: parseInt(usage.videos_played),
        active_days: parseInt(usage.active_days),
        manual_triggers: parseInt(usage.manual_triggers),
        auto_plays: parseInt(usage.auto_plays),
      },
      content: {
        by_category: byCategory,
        top_videos: topVideos.map((row) => ({
          filename: row.video_filename,
          plays: parseInt(row.plays),
        })),
      },
      alerts: recentAlerts,
      daily_activity: dailyRows.map((row) => ({
        date: row.date,
        screen_time: parseInt(row.screen_time),
        videos: parseInt(row.videos),
      })),
    });
  } catch (error) {
    logger.error('Get club dashboard error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du dashboard' });
  }
};

/**
 * GET /api/analytics/overview
 * Vue d'ensemble de tous les sites (pour admin)
 */
export const getAnalyticsOverview = async (req: AuthRequest, res: Response) => {
  try {
    // Récupérer toutes les données en parallèle via le repository
    const [siteCount, plays, avgAvail, sitesSummaryRows] = await Promise.all([
      analyticsRepository.getSiteCounts(),
      analyticsRepository.getPlayCounts(),
      analyticsRepository.getFleetAvailability(),
      analyticsRepository.getSitesSummary(),
    ]);

    res.json({
      total_sites: parseInt(siteCount?.total_sites || '0'),
      online_sites: parseInt(siteCount?.online_sites || '0'),
      total_plays_today: parseInt(plays?.plays_today || '0'),
      total_plays_week: parseInt(plays?.plays_week || '0'),
      avg_availability: avgAvail ? Number(avgAvail) : 0,
      sites_summary: sitesSummaryRows.map((row) => ({
        site_id: row.site_id,
        club_name: row.club_name,
        status: row.status,
        plays_today: parseInt(row.plays_today),
        availability_24h: Math.min(100, (parseInt(row.heartbeat_count) / 2880) * 100),
      })),
    });
  } catch (error) {
    logger.error('Get analytics overview error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la vue d\'ensemble' });
  }
};

/**
 * GET /api/analytics/comparison?site_ids=uuid1,uuid2&days=30
 * Compare l'activité de plusieurs sites sur une période
 */
export const getMultiSiteComparison = async (req: AuthRequest, res: Response) => {
  try {
    const { site_ids, days = '30' } = req.query;

    if (!site_ids || typeof site_ids !== 'string') {
      return res.status(400).json({ error: 'site_ids parameter is required' });
    }

    const siteIds = site_ids.split(',').filter(id => id.trim());

    if (siteIds.length === 0) {
      return res.status(400).json({ error: 'At least one site_id is required' });
    }

    if (siteIds.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 sites can be compared at once' });
    }

    // Validate UUIDs
    for (const id of siteIds) {
      if (!validateUuid(id.trim())) {
        return res.status(400).json({ error: `Invalid site_id format: ${id}` });
      }
    }

    const daysNum = parseInt(days as string) || 30;

    // Query comparison data via repository
    const rows = await analyticsRepository.getMultiSiteComparison(siteIds, daysNum);

    // Calculate totals
    const totals = {
      total_sites: rows.length,
      total_videos: rows.reduce((sum, r) => sum + Number(r.total_videos), 0),
      total_screen_time: rows.reduce((sum, r) => sum + Number(r.total_screen_time), 0),
      avg_days_active: rows.length > 0
        ? Math.round(rows.reduce((sum, r) => sum + Number(r.days_active), 0) / rows.length)
        : 0,
    };

    res.json({
      success: true,
      data: {
        period_days: daysNum,
        totals,
        sites: rows.map(site => ({
          id: site.id,
          site_name: site.site_name,
          club_name: site.club_name,
          days_active: Number(site.days_active),
          total_videos: Number(site.total_videos),
          total_screen_time: Number(site.total_screen_time),
          total_screen_time_formatted: formatDuration(Number(site.total_screen_time)),
          avg_completion: Number(site.avg_completion) || 0,
        })),
      },
    });

  } catch (error) {
    logger.error('Multi-site comparison error:', error);
    res.status(500).json({ error: 'Erreur lors de la comparaison des sites' });
  }
};

/**
 * GET /api/analytics/realtime
 * Retourne les statistiques en temps réel pour le dashboard live
 */
export const getRealtimeStats = async (req: AuthRequest, res: Response) => {
  try {
    const { realtimeStatsService } = await import('../services/realtime-stats.service');
    const stats = await realtimeStatsService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Realtime stats error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stats temps réel' });
  }
};
