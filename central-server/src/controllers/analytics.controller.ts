import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import {
  analyticsRepository,
  siteRepository,
  advertiserRepository,
  videoRepository,
  type ClubAlertRow,
  type VideoPlaysBatchItem,
} from '../repositories';
import { metricsService } from '../services/metrics.service';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
};

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
 * POST /api/analytics/video-plays
 * Enregistrer des lectures vidéo (batch depuis sync-agent)
 */
export const recordVideoPlays = async (req: AuthRequest, res: Response) => {
  try {
    const { site_id, plays } = req.body;

    if (!site_id || !Array.isArray(plays) || plays.length === 0) {
      return res.status(400).json({ error: 'site_id et plays[] requis' });
    }

    // Vérifier que le site existe
    const siteExists = await siteRepository.exists(site_id);
    if (!siteExists) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    let invalidSessions = 0;

    // Valider et préparer toutes les entrées avant l'insertion batch
    const validTriggerTypes = ['auto', 'manual'];
    const validTvStatuses = ['on', 'standby', 'disconnected', 'unknown'];
    const validEventTypes = ['match', 'training', 'tournament', 'other'];
    const validPeriods = ['pre_match', 'halftime', 'post_match', 'loop'];
    const validPlays: VideoPlaysBatchItem[] = [];

    for (const play of plays) {
      const sessionId =
        typeof play.session_id === 'string' && validateUuid(play.session_id)
          ? play.session_id
          : null;

      if (play.session_id && !sessionId) {
        invalidSessions++;
      }

      const videoId =
        typeof play.video_id === 'string' && validateUuid(play.video_id)
          ? play.video_id
          : null;

      const sponsorId =
        typeof play.sponsor_id === 'string' && validateUuid(play.sponsor_id)
          ? play.sponsor_id
          : null;

      const tvStatus = validTvStatuses.includes(play.tv_status) ? play.tv_status : 'unknown';

      // Sponsor context fields (consolidated pipeline)
      const eventType = validEventTypes.includes(play.event_type) ? play.event_type : null;
      const period = validPeriods.includes(play.period) ? play.period : null;
      const audienceEstimate = typeof play.audience_estimate === 'number' && play.audience_estimate >= 0
        ? play.audience_estimate : null;
      const positionInLoop = typeof play.position_in_loop === 'number' && play.position_in_loop >= 0
        ? play.position_in_loop : null;
      const siteSponsorId =
        typeof play.site_sponsor_id === 'string' && validateUuid(play.site_sponsor_id)
          ? play.site_sponsor_id
          : null;
      const campaignId =
        typeof play.campaign_id === 'string' && validateUuid(play.campaign_id)
          ? play.campaign_id
          : null;
      // E-23 US-23.7.4: kiosk (Pi) vs pc (browser) source
      const validSources = ['kiosk', 'pc'];
      const source = typeof play.source === 'string' && validSources.includes(play.source)
        ? play.source
        : null;

      validPlays.push({
        siteId: site_id,
        sessionId,
        videoFilename: play.video_filename,
        category: play.category || 'other',
        playedAt: play.played_at || new Date().toISOString(),
        durationPlayed: play.duration_played || 0,
        videoDuration: play.video_duration || 0,
        completed: play.completed || false,
        triggerType: validTriggerTypes.includes(play.trigger_type) ? play.trigger_type : 'auto',
        videoId,
        sponsorId,
        tvStatus,
        eventType,
        period,
        audienceEstimate,
        positionInLoop,
        siteSponsorId,
        campaignId,
        source,
      });
    }

    if (invalidSessions > 0) {
      logger.warn('Received video plays with invalid session_id, falling back to null', {
        siteId: site_id,
        invalidSessions,
      });
    }

    // Validate FK references exist to avoid FK constraint violations on batch insert.
    // A single missing reference would reject the entire batch (up to 100 plays lost).
    // Pattern: collect unique IDs → bulk check existence → nullify missing → log + metric.
    const uniqueSponsorIds = [...new Set(validPlays.map(p => p.sponsorId).filter((id): id is string => id !== null))];
    const uniqueVideoIds = [...new Set(validPlays.map(p => p.videoId).filter((id): id is string => id !== null))];
    const uniqueSessionIds = [...new Set(validPlays.map(p => p.sessionId).filter((id): id is string => id !== null))];
    const uniqueCampaignIds = [...new Set(validPlays.map(p => p.campaignId).filter((id): id is string => id !== null))];

    const [existingSponsorIds, existingVideoIds, existingSessionIds, existingCampaignIds] = await Promise.all([
      uniqueSponsorIds.length > 0 ? advertiserRepository.findExistingIds(uniqueSponsorIds) : Promise.resolve(new Set<string>()),
      uniqueVideoIds.length > 0 ? videoRepository.findExistingIds(uniqueVideoIds) : Promise.resolve(new Set<string>()),
      uniqueSessionIds.length > 0 ? analyticsRepository.findExistingSessionIds(uniqueSessionIds) : Promise.resolve(new Set<string>()),
      uniqueCampaignIds.length > 0 ? analyticsRepository.findExistingCampaignIds(uniqueCampaignIds) : Promise.resolve(new Set<string>()),
    ]);

    const missingSponsorIds = uniqueSponsorIds.filter(id => !existingSponsorIds.has(id));
    const missingVideoIds = uniqueVideoIds.filter(id => !existingVideoIds.has(id));
    const missingSessionIds = uniqueSessionIds.filter(id => !existingSessionIds.has(id));
    const missingCampaignIds = uniqueCampaignIds.filter(id => !existingCampaignIds.has(id));

    if (missingSponsorIds.length > 0 || missingVideoIds.length > 0 || missingSessionIds.length > 0 || missingCampaignIds.length > 0) {
      const missingFks: Record<string, string[]> = {};
      if (missingSponsorIds.length > 0) missingFks.sponsor_id = missingSponsorIds;
      if (missingVideoIds.length > 0) missingFks.video_id = missingVideoIds;
      if (missingSessionIds.length > 0) missingFks.session_id = missingSessionIds;
      if (missingCampaignIds.length > 0) missingFks.campaign_id = missingCampaignIds;

      logger.warn('Video plays reference non-existent FK targets, falling back to null', {
        siteId: site_id,
        missingFks,
      });

      let sponsorNulled = 0;
      let videoNulled = 0;
      let sessionNulled = 0;
      let campaignNulled = 0;

      for (const play of validPlays) {
        if (play.sponsorId !== null && !existingSponsorIds.has(play.sponsorId)) {
          play.sponsorId = null;
          sponsorNulled++;
        }
        if (play.videoId !== null && !existingVideoIds.has(play.videoId)) {
          play.videoId = null;
          videoNulled++;
        }
        if (play.sessionId !== null && !existingSessionIds.has(play.sessionId)) {
          play.sessionId = null;
          sessionNulled++;
        }
        if (play.campaignId !== null && !existingCampaignIds.has(play.campaignId)) {
          play.campaignId = null;
          campaignNulled++;
        }
      }

      if (sponsorNulled > 0) metricsService.recordVideoPlaysFkFallback('sponsor_id', sponsorNulled);
      if (videoNulled > 0) metricsService.recordVideoPlaysFkFallback('video_id', videoNulled);
      if (sessionNulled > 0) metricsService.recordVideoPlaysFkFallback('session_id', sessionNulled);
      if (campaignNulled > 0) metricsService.recordVideoPlaysFkFallback('campaign_id', campaignNulled);
    }

    // Batch insert via repository (handles batching internally)
    await analyticsRepository.recordVideoPlays(validPlays);

    logger.info('Video plays recorded', { siteId: site_id, count: validPlays.length, totalPlays: validPlays.length });

    res.json({ success: true, recorded: validPlays.length });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    logger.error('Record video plays error:', { error: errorMessage, siteId: req.body?.site_id, playsCount: req.body?.plays?.length });
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement des lectures', details: errorMessage });
  }
};

/**
 * POST /api/analytics/sessions
 * Créer ou mettre à jour une session
 */
export const manageSession = async (req: AuthRequest, res: Response) => {
  try {
    const { site_id, action, session_id } = req.body;

    if (!site_id || !action) {
      return res.status(400).json({ error: 'site_id et action requis' });
    }

    if (action === 'start') {
      // Créer une nouvelle session
      const session = await analyticsRepository.startSession(site_id);

      logger.info('Session started', { siteId: site_id, sessionId: session.id });

      return res.json({
        success: true,
        session_id: session.id,
        started_at: session.started_at,
      });
    }

    if (action === 'end' && session_id) {
      // Terminer une session
      const session = await analyticsRepository.endSession(session_id);

      if (!session) {
        return res.status(404).json({ error: 'Session non trouvée' });
      }

      logger.info('Session ended', { sessionId: session_id, duration: session.duration_seconds });

      return res.json({ success: true, session });
    }

    res.status(400).json({ error: 'Action invalide' });
  } catch (error) {
    logger.error('Manage session error:', error);
    res.status(500).json({ error: 'Erreur lors de la gestion de la session' });
  }
};

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
// PHASE 3 - ADVANCED ANALYTICS
// ============================================================================

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
 * GET /api/analytics/clubs/:siteId/export
 * Export CSV des données d'un site
 */
export const exportClubData = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { from, to, type = 'video_plays' } = req.query;

    const fromDate = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to as string) : new Date();

    const fromStr = fromDate.toISOString();
    const toStr = toDate.toISOString();

    let data: Record<string, unknown>[] = [];
    let filename = '';

    if (type === 'video_plays') {
      data = await analyticsRepository.exportVideoPlays(siteId, fromStr, toStr);
      filename = `video_plays_${siteId}_${fromDate.toISOString().split('T')[0]}.csv`;
    } else if (type === 'daily_stats') {
      data = await analyticsRepository.exportDailyStats(siteId, fromStr, toStr);
      filename = `daily_stats_${siteId}_${fromDate.toISOString().split('T')[0]}.csv`;
    } else if (type === 'metrics') {
      data = await analyticsRepository.exportMetrics(siteId, fromStr, toStr);
      filename = `metrics_${siteId}_${fromDate.toISOString().split('T')[0]}.csv`;
    } else {
      return res.status(400).json({ error: 'Type d\'export invalide' });
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'Aucune donnée à exporter' });
    }

    // Générer le CSV
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map((row) =>
        headers
          .map((header) => {
            const val = row[header];
            if (val === null || val === undefined) return '';
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
            return val;
          })
          .join(',')
      ),
    ];

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    logger.error('Export club data error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'export des données' });
  }
};

/**
 * POST /api/analytics/calculate-daily-stats
 * Déclencher le calcul des stats quotidiennes (pour cron)
 */
export const calculateDailyStats = async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.body;
    const targetDate = date ? new Date(date) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Hier par défaut

    const dateStr = targetDate.toISOString().split('T')[0];

    // Appeler la fonction PostgreSQL pour tous les sites via le repository
    const sitesProcessed = await analyticsRepository.calculateDailyStats(dateStr);

    logger.info('Daily stats calculated', { date: dateStr, sitesProcessed });

    res.json({
      success: true,
      date: dateStr,
      sites_processed: sitesProcessed,
    });
  } catch (error) {
    logger.error('Calculate daily stats error:', error);
    res.status(500).json({ error: 'Erreur lors du calcul des statistiques quotidiennes' });
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

// ============================================================================
// ANALYTICS CATEGORIES MANAGEMENT
// ============================================================================

/**
 * GET /api/analytics/categories
 * Liste des catégories analytics disponibles
 */
export const getAnalyticsCategories = async (req: AuthRequest, res: Response) => {
  try {
    const categories = await analyticsRepository.getCategories();
    res.json(categories);
  } catch (error: unknown) {
    // Si la table n'existe pas encore, retourner les catégories par défaut
    const pgError = error as { code?: string };
    if (pgError.code === '42P01') {
      logger.warn('analytics_categories table does not exist, returning defaults');
      res.json([
        { id: 'sponsor', name: 'Sponsor', description: 'Vidéos partenaires et sponsors', color: '#3B82F6', is_default: true },
        { id: 'jingle', name: 'Jingle', description: 'Buts, temps morts, animations de match', color: '#10B981', is_default: true },
        { id: 'ambiance', name: 'Ambiance', description: 'Entrées joueurs, intros, outros', color: '#8B5CF6', is_default: true },
        { id: 'other', name: 'Autre', description: 'Vidéos non catégorisées', color: '#6B7280', is_default: true },
      ]);
      return;
    }
    logger.error('Get analytics categories error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des catégories analytics' });
  }
};

/**
 * POST /api/analytics/categories
 * Créer une nouvelle catégorie analytics (admin only)
 */
export const createAnalyticsCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id, name, description, color } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'id et name sont requis' });
    }

    // Validation: id doit être en snake_case (lettres minuscules, chiffres, underscores)
    if (!/^[a-z][a-z0-9_]*$/.test(id)) {
      return res.status(400).json({
        error: 'id doit commencer par une lettre minuscule et ne contenir que des lettres minuscules, chiffres et underscores',
      });
    }

    // Validation: couleur hex si fournie
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ error: 'color doit être au format hex (#RRGGBB)' });
    }

    const category = await analyticsRepository.createCategory({
      id,
      name,
      description: description || null,
      color: color || null,
    });

    logger.info('Analytics category created', { id, name, createdBy: req.user?.email });

    res.status(201).json(category);
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === '23505') {
      // Unique violation
      return res.status(409).json({ error: 'Une catégorie avec cet id existe déjà' });
    }
    logger.error('Create analytics category error:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la catégorie' });
  }
};

/**
 * PUT /api/analytics/categories/:id
 * Mettre à jour une catégorie analytics (admin only)
 */
export const updateAnalyticsCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name est requis' });
    }

    // Validation: couleur hex si fournie
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ error: 'color doit être au format hex (#RRGGBB)' });
    }

    const updated = await analyticsRepository.updateCategory(id, name, description || null, color || null);

    if (!updated) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    logger.info('Analytics category updated', { id, updatedBy: req.user?.email });

    res.json(updated);
  } catch (error) {
    logger.error('Update analytics category error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la catégorie' });
  }
};

/**
 * DELETE /api/analytics/categories/:id
 * Supprimer une catégorie analytics (admin only, si non-default)
 */
export const deleteAnalyticsCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Vérifier si c'est une catégorie par défaut
    const isDefault = await analyticsRepository.isCategoryDefault(id);

    if (isDefault === null) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    if (isDefault) {
      return res.status(400).json({ error: 'Impossible de supprimer une catégorie par défaut' });
    }

    await analyticsRepository.deleteCategory(id);

    logger.info('Analytics category deleted', { id, deletedBy: req.user?.email });

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete analytics category error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la catégorie' });
  }
};

/**
 * Génère un rapport PDF pour un club
 * GET /api/analytics/clubs/:siteId/report/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export const generateClubPdfReport = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { from, to } = req.query;

    // Validation des paramètres
    if (!from || !to) {
      return res.status(400).json({ error: 'Paramètres from et to requis (format YYYY-MM-DD)' });
    }

    // Vérifier que l'utilisateur a accès à ce site
    if (req.user?.role !== 'admin' && req.user?.role !== 'operator') {
      // Pour les utilisateurs non-admin, vérifier qu'ils ont accès à ce site
      const siteExists = await siteRepository.exists(siteId);

      if (!siteExists) {
        return res.status(404).json({ error: 'Site non trouvé' });
      }
    }

    // Import dynamique du service PDF
    const pdfService = await import('../services/pdf-report.service');

    logger.info('Generating club PDF report', { siteId, from, to, requestedBy: req.user?.email });

    // Générer le PDF
    const pdfBuffer = await pdfService.generateClubReport(
      siteId,
      String(from),
      String(to),
      { type: 'club', language: 'fr' }
    );

    // Nom du fichier
    const filename = `rapport-club-${siteId}-${from}-${to}.pdf`;

    // Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);

    logger.info('Club PDF report generated successfully', { siteId, from, to, size: pdfBuffer.length });

  } catch (error) {
    logger.error('Generate club PDF report error:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du rapport PDF' });
  }
};

// ============================================================================
// MULTI-SITE COMPARISON
// ============================================================================

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

// ============================================================================
// EXCEL EXPORT
// ============================================================================

/**
 * GET /api/analytics/clubs/:siteId/export/excel
 * Export Excel avancé pour un club
 */
export const exportClubExcel = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'Paramètres from et to requis (format YYYY-MM-DD)' });
    }

    // Vérifier que le site existe
    const site = await siteRepository.findById(siteId);
    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Import dynamique du service Excel
    const { excelExportService } = await import('../services/excel-export.service');

    logger.info('Generating club Excel export', { siteId, from, to, requestedBy: req.user?.email });

    const buffer = await excelExportService.generateClubExport({
      siteId,
      startDate: String(from),
      endDate: String(to),
      type: 'club',
    });

    const filename = `analytics-${site.club_name || site.site_name}-${from}-${to}.xlsx`
      .replace(/[^a-zA-Z0-9\-_.]/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

    logger.info('Club Excel export generated', { siteId, from, to, size: buffer.length });
  } catch (error) {
    logger.error('Export club Excel error:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de l\'export Excel' });
  }
};

/**
 * GET /api/analytics/advertisers/:advertiserId/export/excel
 * Export Excel avancé pour un annonceur
 */
export const exportAdvertiserExcel = async (req: AuthRequest, res: Response) => {
  try {
    const { advertiserId } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'Paramètres from et to requis (format YYYY-MM-DD)' });
    }

    // Vérifier que l'annonceur existe
    const advertiserName = await advertiserRepository.findName(advertiserId);
    if (!advertiserName) {
      return res.status(404).json({ error: 'Annonceur non trouvé' });
    }

    const { excelExportService } = await import('../services/excel-export.service');

    logger.info('Generating advertiser Excel export', { advertiserId, from, to, requestedBy: req.user?.email });

    const buffer = await excelExportService.generateAdvertiserExport({
      advertiserId,
      startDate: String(from),
      endDate: String(to),
      type: 'advertiser',
    });

    const filename = `analytics-${advertiserName}-${from}-${to}.xlsx`
      .replace(/[^a-zA-Z0-9\-_.]/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

    logger.info('Advertiser Excel export generated', { advertiserId, from, to, size: buffer.length });
  } catch (error) {
    logger.error('Export advertiser Excel error:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de l\'export Excel' });
  }
};

/**
 * GET /api/analytics/overview/export/excel
 * Export Excel overview multi-sites
 */
export const exportOverviewExcel = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'Paramètres from et to requis (format YYYY-MM-DD)' });
    }

    const { excelExportService } = await import('../services/excel-export.service');

    logger.info('Generating overview Excel export', { from, to, requestedBy: req.user?.email });

    const buffer = await excelExportService.generateOverviewExport({
      startDate: String(from),
      endDate: String(to),
      type: 'overview',
    });

    const filename = `analytics-global-${from}-${to}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

    logger.info('Overview Excel export generated', { from, to, size: buffer.length });
  } catch (error) {
    logger.error('Export overview Excel error:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de l\'export Excel global' });
  }
};
