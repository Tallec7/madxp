import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import {
  analyticsRepository,
  siteRepository,
  type ClubAlertRow,
} from '../repositories';

// ============================================================================
// MVP - HEALTH ANALYTICS (données existantes)
// ============================================================================

/**
 * GET /api/analytics/clubs/:siteId/health
 * Dashboard santé technique d'un site
 */
export const getClubHealth = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    // Vérifier que le site existe
    const site = await siteRepository.findById(siteId);
    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Récupérer les données en parallèle via le repository
    const [currentMetrics, , , , heartbeats24h, alerts24h] = await Promise.all([
      analyticsRepository.getLatestMetrics(siteId),
      analyticsRepository.getHeartbeatStats30d(siteId),
      analyticsRepository.getAlertStats(siteId),
      analyticsRepository.get24hAverages(siteId),
      analyticsRepository.getHeartbeatCount24h(siteId),
      analyticsRepository.getAlertCount24h(siteId),
    ]);

    // Déterminer le statut de santé
    let healthStatus = 'healthy';
    const issues: string[] = [];

    if (currentMetrics) {
      if ((currentMetrics.temperature ?? 0) > 80) {
        healthStatus = 'critical';
        issues.push('Température critique');
      } else if ((currentMetrics.temperature ?? 0) > 70) {
        healthStatus = 'warning';
        issues.push('Température élevée');
      }

      if ((currentMetrics.disk_usage ?? 0) > 90) {
        healthStatus = 'critical';
        issues.push('Espace disque critique');
      } else if ((currentMetrics.disk_usage ?? 0) > 80) {
        healthStatus = healthStatus === 'healthy' ? 'warning' : healthStatus;
        issues.push('Espace disque faible');
      }

      if ((currentMetrics.memory_usage ?? 0) > 90) {
        healthStatus = healthStatus === 'healthy' ? 'warning' : healthStatus;
        issues.push('Mémoire élevée');
      }
    }

    if (site.status === 'offline') {
      healthStatus = 'offline';
      issues.push('Site hors ligne');
    }

    // Calculer la disponibilité 24h
    const availability24h = Math.min(100, (heartbeats24h / 2880) * 100);

    // Format attendu par le frontend (ClubHealthData)
    res.json({
      site_id: siteId,
      club_name: site.club_name || site.site_name,
      status: healthStatus,
      current_metrics: currentMetrics
        ? {
            cpu_usage: Math.round((currentMetrics.cpu_usage ?? 0) * 10) / 10,
            memory_usage: Math.round((currentMetrics.memory_usage ?? 0) * 10) / 10,
            temperature: Math.round(currentMetrics.temperature ?? 0),
            disk_usage: Math.round((currentMetrics.disk_usage ?? 0) * 10) / 10,
            uptime: currentMetrics.uptime,
            recorded_at: currentMetrics.recorded_at,
          }
        : null,
      availability_24h: Math.round(availability24h * 10) / 10,
      alerts_24h: alerts24h,
      last_seen_at: site.last_seen_at,
    });
  } catch (error) {
    logger.error('Get club health error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la santé du site' });
  }
};

/**
 * GET /api/analytics/clubs/:siteId/availability
 * Historique de disponibilité d'un site
 */
export const getClubAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { days = 30 } = req.query;

    const daysNum = Math.min(parseInt(days as string) || 30, 90);

    // Récupérer les heartbeats groupés par jour via le repository
    const rows = await analyticsRepository.getDailyHeartbeats(siteId, daysNum);

    // Calculer l'uptime par jour (2880 heartbeats max par jour = 48/heure * 24h)
    // Format attendu par le frontend: { date, total_minutes, online_minutes, availability_percent }
    const availability = rows.map((row) => {
      const heartbeats = parseInt(row.heartbeat_count);
      // Chaque heartbeat = 30 secondes = 0.5 minute
      const onlineMinutes = Math.round(heartbeats * 0.5);
      const totalMinutes = 24 * 60; // 1440 minutes par jour
      const availabilityPercent = Math.min(100, (onlineMinutes / totalMinutes) * 100);

      return {
        date: row.date,
        total_minutes: totalMinutes,
        online_minutes: onlineMinutes,
        availability_percent: Math.round(availabilityPercent * 10) / 10,
      };
    });

    res.json({
      availability,
    });
  } catch (error) {
    logger.error('Get club availability error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la disponibilité' });
  }
};

/**
 * GET /api/analytics/clubs/:siteId/alerts
 * Historique des alertes d'un site
 */
export const getClubAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { days = 30, status, severity, limit = 50 } = req.query;

    const daysNum = Math.min(parseInt(days as string) || 30, 90);
    const limitNum = Math.min(parseInt(limit as string) || 50, 200);

    // Format attendu par le frontend: { alerts: AlertData[] }
    // AlertData: { id, type, severity, message, resolved: boolean, created_at, resolved_at }
    const rows = await analyticsRepository.getClubAlerts(siteId, daysNum, {
      status: status as string | undefined,
      severity: severity as string | undefined,
      limit: limitNum,
    });

    res.json({
      alerts: rows.map((row: ClubAlertRow) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        message: row.message,
        resolved: row.status === 'resolved',
        created_at: row.created_at,
        resolved_at: row.resolved_at,
      })),
    });
  } catch (error) {
    logger.error('Get club alerts error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des alertes' });
  }
};

// ============================================================================
// PHASE 2 - USAGE ANALYTICS (tracking vidéos)
// ============================================================================

/**
 * GET /api/analytics/clubs/:siteId/usage
 * Statistiques d'utilisation d'un site
 */
export const getClubUsage = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { days = 30 } = req.query;

    const daysNum = Math.min(parseInt(days as string) || 30, 90);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysNum);
    const toDate = new Date();

    const fromStr = fromDate.toISOString();
    const toStr = toDate.toISOString();

    // Récupérer les stats en parallèle via le repository
    const [current, dailyRows] = await Promise.all([
      analyticsRepository.getUsageStats(siteId, fromStr, toStr),
      analyticsRepository.getDailyStats(siteId, fromStr, toStr),
    ]);

    // Format attendu par le frontend
    res.json({
      period: `${daysNum} days`,
      total_plays: parseInt(current.videos_played),
      unique_videos: parseInt(current.unique_videos),
      total_duration: parseInt(current.screen_time_seconds),
      avg_completion_rate: current.avg_completion ? Number(current.avg_completion) : 0,
      manual_triggers: parseInt(current.manual_triggers),
      auto_plays: parseInt(current.auto_plays),
      daily_breakdown: dailyRows.map((row) => ({
        date: row.date,
        plays: parseInt(row.videos),
        duration: parseInt(row.screen_time),
      })),
    });
  } catch (error) {
    logger.error('Get club usage error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques d\'utilisation' });
  }
};

/**
 * GET /api/analytics/clubs/:siteId/content
 * Analytics contenu d'un site
 */
export const getClubContent = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { days = 30 } = req.query;

    const daysNum = Math.min(parseInt(days as string) || 30, 90);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysNum);
    const toDate = new Date();

    const fromStr = fromDate.toISOString();
    const toStr = toDate.toISOString();

    // Récupérer les stats en parallèle via le repository
    const [categoryRows, topVideoRows] = await Promise.all([
      analyticsRepository.getCategoryStats(siteId, fromStr, toStr),
      analyticsRepository.getTopVideos(siteId, fromStr, toStr, 10),
    ]);

    // Format attendu par le frontend (ContentStats)
    res.json({
      top_videos: topVideoRows.map((row) => ({
        filename: row.video_filename,
        category: row.category || 'other',
        play_count: parseInt(row.plays),
        total_duration: parseInt(row.total_duration),
        avg_completion: row.avg_completion ? Number(row.avg_completion) : 0,
      })),
      categories_breakdown: categoryRows.map((row) => ({
        category: row.category || 'other',
        play_count: parseInt(row.plays),
        total_duration: parseInt(row.total_duration),
      })),
    });
  } catch (error) {
    logger.error('Get club content error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des analytics contenu' });
  }
};

/**
 * GET /api/analytics/clubs/:siteId/sources
 * Répartition kiosk (Pi) vs PC (navigateur) — E-23 US-23.7.4
 */
export const getClubSourceBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { days = 30 } = req.query;

    const daysNum = Math.min(parseInt(days as string) || 30, 90);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysNum);
    const toDate = new Date();

    const rows = await analyticsRepository.getSourceBreakdown(
      siteId,
      fromDate.toISOString(),
      toDate.toISOString()
    );

    res.json({
      period: `${daysNum} days`,
      sources: rows.map((row) => ({
        source: row.source,
        plays: parseInt(row.plays),
        screen_time_seconds: parseInt(row.screen_time_seconds),
        unique_videos: parseInt(row.unique_videos),
        sessions_count: parseInt(row.sessions_count),
        avg_completion_rate: row.avg_completion ? Number(row.avg_completion) : 0,
      })),
    });
  } catch (error) {
    logger.error('Get club source breakdown error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la répartition par source' });
  }
};

// ============================================================================
// BARREL RE-EXPORTS
// ============================================================================

export { recordVideoPlays, manageSession } from './analytics-ingestion.controller';
export { getClubDashboard, getAnalyticsOverview, getMultiSiteComparison, getRealtimeStats } from './analytics-dashboard.controller';
export { getAnalyticsCategories, createAnalyticsCategory, updateAnalyticsCategory, deleteAnalyticsCategory } from './analytics-categories.controller';
export { exportClubData, calculateDailyStats, generateClubPdfReport, exportClubExcel, exportAdvertiserExcel, exportOverviewExcel } from './analytics-export.controller';
