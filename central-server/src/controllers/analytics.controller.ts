import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// Base interface for QueryResultRow compatibility
interface QueryRow {
  [column: string]: unknown;
}

interface MetricsRow extends QueryRow {
  cpu_usage: number;
  memory_usage: number;
  temperature: number;
  disk_usage: number;
  uptime: number;
  recorded_at: string;
}

interface SiteRow extends QueryRow {
  id: string;
  site_name: string;
  club_name: string;
  status: string;
  last_seen_at: string;
}

interface AlertStatsRow extends QueryRow {
  active_alerts: string;
  alerts_last_30d: string;
  active: string;
  acknowledged: string;
  resolved: string;
  critical: string;
  warning: string;
  info: string;
}

interface AvgMetricsRow extends QueryRow {
  avg_cpu: number | null;
  avg_memory: number | null;
  avg_temperature: number | null;
  max_temperature: number | null;
}

interface HeartbeatRow extends QueryRow {
  heartbeat_count: string;
  first_heartbeat: string;
  last_heartbeat: string;
}

interface DailyHeartbeatRow extends QueryRow {
  date: string;
  heartbeat_count: string;
  avg_cpu: number | null;
  avg_temp: number | null;
}

interface UsageStatsRow extends QueryRow {
  screen_time_seconds: string;
  videos_played: string;
  sessions_count: string;
  active_days: string;
  manual_triggers: string;
  auto_plays: string;
}

interface DailyStatsRow extends QueryRow {
  date: string;
  screen_time: string;
  videos: string;
}

interface CategoryStatsRow extends QueryRow {
  category: string;
  plays: string;
  total_duration: string;
}

interface TopVideoRow extends QueryRow {
  video_filename: string;
  category: string;
  plays: string;
  total_duration: string;
  completed_count: string;
}

interface HealthDataRow extends QueryRow {
  status: string;
  last_seen_at: string;
  cpu_usage: number | null;
  memory_usage: number | null;
  temperature: number | null;
  disk_usage: number | null;
}

interface GlobalStatsRow extends QueryRow {
  active_sites: string;
  total_videos_this_month: string;
  total_screen_time_this_month: string;
}

interface TopSiteRow extends QueryRow {
  id: string;
  site_name: string;
  club_name: string;
  videos_this_month: string;
  screen_time_this_month: string;
}

interface DailyCalcRow extends QueryRow {
  count: string;
}

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

const calculatePercentChange = (current: number, previous: number): string => {
  if (previous === 0) {
    return current > 0 ? '+100%' : '0%';
  }
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${Math.round(change)}%`;
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
    const siteResult = await query<SiteRow>('SELECT id, site_name, club_name, status, last_seen_at FROM sites WHERE id = $1', [siteId]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const site = siteResult.rows[0];

    // Récupérer les dernières métriques
    const latestMetrics = await query<MetricsRow>(
      `SELECT cpu_usage, memory_usage, temperature, disk_usage, uptime, recorded_at
       FROM metrics
       WHERE site_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [siteId]
    );

    // Calculer l'uptime sur 30 jours (basé sur les heartbeats)
    const uptimeResult = await query<HeartbeatRow>(
      `SELECT
         COUNT(*) as heartbeat_count,
         MIN(recorded_at) as first_heartbeat,
         MAX(recorded_at) as last_heartbeat
       FROM metrics
       WHERE site_id = $1
         AND recorded_at > NOW() - INTERVAL '30 days'`,
      [siteId]
    );

    // Calculer le pourcentage d'uptime (heartbeat toutes les 30s = 2880/jour)
    const expectedHeartbeats = 30 * 2880; // 30 jours
    const actualHeartbeats = parseInt(uptimeResult.rows[0]?.heartbeat_count || '0');
    const uptimePercent = Math.min(100, (actualHeartbeats / expectedHeartbeats) * 100);

    // Compter les alertes actives et récentes
    const alertsResult = await query<AlertStatsRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active') as active_alerts,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as alerts_last_30d
       FROM alerts
       WHERE site_id = $1`,
      [siteId]
    );

    // Moyennes sur 24h
    const avgResult = await query<AvgMetricsRow>(
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

    const currentMetrics = latestMetrics.rows[0];
    const avgMetrics = avgResult.rows[0];
    const alerts = alertsResult.rows[0];

    // Déterminer le statut de santé
    let healthStatus = 'healthy';
    const issues: string[] = [];

    if (currentMetrics) {
      if (currentMetrics.temperature > 80) {
        healthStatus = 'critical';
        issues.push('Température critique');
      } else if (currentMetrics.temperature > 70) {
        healthStatus = 'warning';
        issues.push('Température élevée');
      }

      if (currentMetrics.disk_usage > 90) {
        healthStatus = 'critical';
        issues.push('Espace disque critique');
      } else if (currentMetrics.disk_usage > 80) {
        healthStatus = healthStatus === 'healthy' ? 'warning' : healthStatus;
        issues.push('Espace disque faible');
      }

      if (currentMetrics.memory_usage > 90) {
        healthStatus = healthStatus === 'healthy' ? 'warning' : healthStatus;
        issues.push('Mémoire élevée');
      }
    }

    if (site.status === 'offline') {
      healthStatus = 'offline';
      issues.push('Site hors ligne');
    }

    // Calculer la disponibilité 24h
    const avail24hResult = await query<HeartbeatRow>(
      `SELECT COUNT(*) as heartbeat_count
       FROM metrics
       WHERE site_id = $1
         AND recorded_at > NOW() - INTERVAL '24 hours'`,
      [siteId]
    );
    const heartbeats24h = parseInt(avail24hResult.rows[0]?.heartbeat_count || '0');
    const availability24h = Math.min(100, (heartbeats24h / 2880) * 100);

    // Compter les alertes des 24 dernières heures
    interface AlertCount24hRow extends QueryRow {
      alerts_24h: string;
    }
    const alerts24hResult = await query<AlertCount24hRow>(
      `SELECT COUNT(*) as alerts_24h
       FROM alerts
       WHERE site_id = $1
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [siteId]
    );

    // Format attendu par le frontend (ClubHealthData)
    res.json({
      site_id: siteId,
      club_name: site.club_name || site.site_name,
      status: healthStatus,
      current_metrics: currentMetrics
        ? {
            cpu_usage: Math.round(currentMetrics.cpu_usage * 10) / 10,
            memory_usage: Math.round(currentMetrics.memory_usage * 10) / 10,
            temperature: Math.round(currentMetrics.temperature),
            disk_usage: Math.round(currentMetrics.disk_usage * 10) / 10,
            uptime: currentMetrics.uptime,
            recorded_at: currentMetrics.recorded_at,
          }
        : null,
      availability_24h: Math.round(availability24h * 10) / 10,
      alerts_24h: parseInt(alerts24hResult.rows[0]?.alerts_24h || '0'),
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

    // Récupérer les heartbeats groupés par jour
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
      [siteId, daysNum]
    );

    // Calculer l'uptime par jour (2880 heartbeats max par jour = 48/heure * 24h)
    // Format attendu par le frontend: { date, total_minutes, online_minutes, availability_percent }
    const availability = result.rows.map((row: DailyHeartbeatRow) => {
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

    let sqlQuery = `SELECT id, alert_type as type, severity, message, status, created_at, resolved_at
                    FROM alerts WHERE site_id = $1 AND created_at > NOW() - INTERVAL '1 day' * $2`;
    const params: (string | number)[] = [siteId, daysNum];
    let paramIndex = 3;

    if (status) {
      sqlQuery += ` AND status = $${paramIndex}`;
      params.push(status as string);
      paramIndex++;
    }

    if (severity) {
      sqlQuery += ` AND severity = $${paramIndex}`;
      params.push(severity as string);
      paramIndex++;
    }

    sqlQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(Math.min(parseInt(limit as string) || 50, 200));

    // Format attendu par le frontend: { alerts: AlertData[] }
    // AlertData: { id, type, severity, message, resolved: boolean, created_at, resolved_at }
    interface AlertRow extends QueryRow {
      id: string;
      type: string;
      severity: string;
      message: string;
      status: string;
      created_at: string;
      resolved_at: string | null;
    }

    const result = await query<AlertRow>(sqlQuery, params);

    res.json({
      alerts: result.rows.map((row) => ({
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
    const siteResult = await query('SELECT id FROM sites WHERE id = $1', [site_id]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    let insertedCount = 0;
    let invalidSessions = 0;

    for (const play of plays) {
      try {
        const sessionId =
          typeof play.session_id === 'string' && validateUuid(play.session_id)
            ? play.session_id
            : null;

        if (play.session_id && !sessionId) {
          invalidSessions++;
        }

        await query(
          `INSERT INTO video_plays (site_id, session_id, video_filename, category, played_at, duration_played, video_duration, completed, trigger_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            site_id,
            sessionId,
            play.video_filename,
            play.category || 'other',
            play.played_at || new Date(),
            play.duration_played || 0,
            play.video_duration || 0,
            play.completed || false,
            play.trigger_type || 'auto',
          ]
        );
        insertedCount++;
      } catch (err) {
        logger.warn('Failed to insert video play:', { play, error: err });
      }
    }

    if (invalidSessions > 0) {
      logger.warn('Received video plays with invalid session_id, falling back to null', {
        siteId: site_id,
        invalidSessions,
      });
    }

    logger.info('Video plays recorded', { siteId: site_id, count: insertedCount });

    res.json({ success: true, recorded: insertedCount });
  } catch (error) {
    logger.error('Record video plays error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement des lectures' });
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
      const result = await query(
        `INSERT INTO club_sessions (site_id, started_at)
         VALUES ($1, NOW())
         RETURNING id, started_at`,
        [site_id]
      );

      logger.info('Session started', { siteId: site_id, sessionId: result.rows[0].id });

      return res.json({
        success: true,
        session_id: result.rows[0].id,
        started_at: result.rows[0].started_at,
      });
    }

    if (action === 'end' && session_id) {
      // Terminer une session
      const result = await query(
        `UPDATE club_sessions
         SET ended_at = NOW(),
             duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
             videos_played = (SELECT COUNT(*) FROM video_plays WHERE session_id = $1),
             manual_triggers = (SELECT COUNT(*) FROM video_plays WHERE session_id = $1 AND trigger_type = 'manual'),
             auto_plays = (SELECT COUNT(*) FROM video_plays WHERE session_id = $1 AND trigger_type = 'auto')
         WHERE id = $1
         RETURNING *`,
        [session_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Session non trouvée' });
      }

      logger.info('Session ended', { sessionId: session_id, duration: result.rows[0].duration_seconds });

      return res.json({ success: true, session: result.rows[0] });
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

    // Stats période actuelle
    interface UsageExtendedRow extends QueryRow {
      screen_time_seconds: string;
      videos_played: string;
      unique_videos: string;
      sessions_count: string;
      active_days: string;
      manual_triggers: string;
      auto_plays: string;
      avg_completion: string | null;
    }
    const currentStats = await query<UsageExtendedRow>(
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
      [siteId, fromDate, toDate]
    );

    // Stats quotidiennes
    const dailyStats = await query<DailyStatsRow>(
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
      [siteId, fromDate, toDate]
    );

    const current = currentStats.rows[0];

    // Format attendu par le frontend
    res.json({
      period: `${daysNum} days`,
      total_plays: parseInt(current.videos_played),
      unique_videos: parseInt(current.unique_videos),
      total_duration: parseInt(current.screen_time_seconds),
      avg_completion_rate: current.avg_completion ? parseFloat(current.avg_completion) : 0,
      manual_triggers: parseInt(current.manual_triggers),
      auto_plays: parseInt(current.auto_plays),
      daily_breakdown: dailyStats.rows.map((row: DailyStatsRow) => ({
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

    // Stats par catégorie
    const categoryStats = await query<CategoryStatsRow>(
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
      [siteId, fromDate, toDate]
    );

    // Top vidéos avec taux de complétion
    interface TopVideoExtendedRow extends QueryRow {
      video_filename: string;
      category: string;
      plays: string;
      total_duration: string;
      avg_completion: string | null;
    }
    const topVideos = await query<TopVideoExtendedRow>(
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
       LIMIT 10`,
      [siteId, fromDate, toDate]
    );

    // Format attendu par le frontend (ContentStats)
    res.json({
      top_videos: topVideos.rows.map((row: TopVideoExtendedRow) => ({
        filename: row.video_filename,
        category: row.category || 'other',
        play_count: parseInt(row.plays),
        total_duration: parseInt(row.total_duration),
        avg_completion: row.avg_completion ? parseFloat(row.avg_completion) : 0,
      })),
      categories_breakdown: categoryStats.rows.map((row: CategoryStatsRow) => ({
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

    // Local types for this function
    interface DashboardUsageRow extends QueryRow {
      screen_time_seconds: string;
      videos_played: string;
      active_days: string;
      manual_triggers: string;
      auto_plays: string;
    }
    interface ContentCategoryRow extends QueryRow {
      category: string;
      plays: string;
    }
    interface TopVideoSimpleRow extends QueryRow {
      video_filename: string;
      plays: string;
    }

    // Récupérer toutes les données en parallèle
    const [healthData, usageData, contentData] = await Promise.all([
      // Health data
      query<HealthDataRow>(
        `SELECT
           s.status, s.last_seen_at,
           m.cpu_usage, m.memory_usage, m.temperature, m.disk_usage
         FROM sites s
         LEFT JOIN LATERAL (
           SELECT * FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1
         ) m ON true
         WHERE s.id = $1`,
        [siteId]
      ),
      // Usage summary
      query<DashboardUsageRow>(
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
        [siteId, fromDate, toDate]
      ),
      // Content summary
      query<ContentCategoryRow>(
        `SELECT
           category,
           COUNT(*) as plays
         FROM video_plays
         WHERE site_id = $1
           AND played_at >= $2
           AND played_at <= $3
         GROUP BY category`,
        [siteId, fromDate, toDate]
      ),
    ]);

    const health = healthData.rows[0];
    const usage = usageData.rows[0];
    const content = contentData.rows;

    // Top 5 vidéos
    const topVideos = await query<TopVideoSimpleRow>(
      `SELECT video_filename, COUNT(*) as plays
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3
       GROUP BY video_filename
       ORDER BY plays DESC
       LIMIT 5`,
      [siteId, fromDate, toDate]
    );

    // Alertes récentes
    const recentAlerts = await query(
      `SELECT alert_type, severity, message, created_at, resolved_at
       FROM alerts
       WHERE site_id = $1
         AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT 5`,
      [siteId, fromDate]
    );

    // Daily activity
    const dailyActivity = await query<DailyStatsRow>(
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
      [siteId, fromDate, toDate]
    );

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
        top_videos: topVideos.rows.map((row: TopVideoSimpleRow) => ({
          filename: row.video_filename,
          plays: parseInt(row.plays),
        })),
      },
      alerts: recentAlerts.rows,
      daily_activity: dailyActivity.rows.map((row: DailyStatsRow) => ({
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

    let data: any[] = [];
    let filename = '';

    if (type === 'video_plays') {
      const result = await query(
        `SELECT
           played_at, video_filename, category, duration_played,
           video_duration, completed, trigger_type
         FROM video_plays
         WHERE site_id = $1
           AND played_at >= $2
           AND played_at <= $3
         ORDER BY played_at DESC`,
        [siteId, fromDate, toDate]
      );
      data = result.rows;
      filename = `video_plays_${siteId}_${fromDate.toISOString().split('T')[0]}.csv`;
    } else if (type === 'daily_stats') {
      const result = await query(
        `SELECT *
         FROM club_daily_stats
         WHERE site_id = $1
           AND date >= $2
           AND date <= $3
         ORDER BY date DESC`,
        [siteId, fromDate, toDate]
      );
      data = result.rows;
      filename = `daily_stats_${siteId}_${fromDate.toISOString().split('T')[0]}.csv`;
    } else if (type === 'metrics') {
      const result = await query(
        `SELECT recorded_at, cpu_usage, memory_usage, temperature, disk_usage, uptime
         FROM metrics
         WHERE site_id = $1
           AND recorded_at >= $2
           AND recorded_at <= $3
         ORDER BY recorded_at DESC`,
        [siteId, fromDate, toDate]
      );
      data = result.rows;
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

    // Appeler la fonction PostgreSQL pour tous les sites
    const result = await query<DailyCalcRow>(`SELECT calculate_all_daily_stats($1::DATE) as count`, [dateStr]);

    logger.info('Daily stats calculated', { date: dateStr, sitesProcessed: result.rows[0].count });

    res.json({
      success: true,
      date: dateStr,
      sites_processed: parseInt(result.rows[0].count),
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
    // Compter tous les sites et ceux en ligne
    interface SiteCountRow extends QueryRow {
      total_sites: string;
      online_sites: string;
    }
    const siteCountResult = await query<SiteCountRow>(`
      SELECT
        COUNT(*) as total_sites,
        COUNT(*) FILTER (WHERE status = 'online') as online_sites
      FROM sites
    `);

    // Lectures aujourd'hui
    interface PlaysRow extends QueryRow {
      plays_today: string;
      plays_week: string;
    }
    const playsResult = await query<PlaysRow>(`
      SELECT
        COUNT(*) FILTER (WHERE played_at >= CURRENT_DATE) as plays_today,
        COUNT(*) FILTER (WHERE played_at >= CURRENT_DATE - INTERVAL '7 days') as plays_week
      FROM video_plays
    `);

    // Disponibilité moyenne (basée sur les heartbeats des dernières 24h)
    interface AvgAvailRow extends QueryRow {
      avg_availability: string | null;
    }
    const availResult = await query<AvgAvailRow>(`
      SELECT AVG(availability) as avg_availability
      FROM (
        SELECT
          site_id,
          LEAST(100, (COUNT(*) * 100.0 / 2880)) as availability
        FROM metrics
        WHERE recorded_at >= NOW() - INTERVAL '24 hours'
        GROUP BY site_id
      ) sub
    `);

    // Résumé par site avec lectures et disponibilité
    interface SiteSummaryRow extends QueryRow {
      site_id: string;
      club_name: string;
      status: string;
      plays_today: string;
      heartbeat_count: string;
    }
    const sitesSummary = await query<SiteSummaryRow>(`
      SELECT
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
      ORDER BY s.club_name
    `);

    const siteCount = siteCountResult.rows[0];
    const plays = playsResult.rows[0];
    const avgAvail = availResult.rows[0];

    res.json({
      total_sites: parseInt(siteCount?.total_sites || '0'),
      online_sites: parseInt(siteCount?.online_sites || '0'),
      total_plays_today: parseInt(plays?.plays_today || '0'),
      total_plays_week: parseInt(plays?.plays_week || '0'),
      avg_availability: avgAvail?.avg_availability ? parseFloat(avgAvail.avg_availability) : 0,
      sites_summary: sitesSummary.rows.map((row: SiteSummaryRow) => ({
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

interface AnalyticsCategoryRow extends QueryRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_default: boolean;
  created_at: string;
}

/**
 * GET /api/analytics/categories
 * Liste des catégories analytics disponibles
 */
export const getAnalyticsCategories = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query<AnalyticsCategoryRow>(
      `SELECT id, name, description, color, is_default, created_at
       FROM analytics_categories
       ORDER BY is_default DESC, name ASC`
    );

    res.json(result.rows);
  } catch (error) {
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

    const result = await query<AnalyticsCategoryRow>(
      `INSERT INTO analytics_categories (id, name, description, color, is_default)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, name, description, color, is_default, created_at`,
      [id, name, description || null, color || null]
    );

    logger.info('Analytics category created', { id, name, createdBy: req.user?.email });

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
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

    const result = await query<AnalyticsCategoryRow>(
      `UPDATE analytics_categories
       SET name = $2, description = $3, color = $4
       WHERE id = $1
       RETURNING id, name, description, color, is_default, created_at`,
      [id, name, description || null, color || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    logger.info('Analytics category updated', { id, updatedBy: req.user?.email });

    res.json(result.rows[0]);
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
    const checkResult = await query<AnalyticsCategoryRow>(
      'SELECT is_default FROM analytics_categories WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    if (checkResult.rows[0].is_default) {
      return res.status(400).json({ error: 'Impossible de supprimer une catégorie par défaut' });
    }

    await query('DELETE FROM analytics_categories WHERE id = $1', [id]);

    logger.info('Analytics category deleted', { id, deletedBy: req.user?.email });

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete analytics category error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la catégorie' });
  }
};
