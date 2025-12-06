import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../types';
import logger from '../config/logger';

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
    const siteResult = await query<SiteRow>('SELECT id, site_name, status, last_seen_at FROM sites WHERE id = $1', [siteId]);
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

    res.json({
      site_id: siteId,
      site_name: site.site_name,
      status: healthStatus,
      issues,
      current: currentMetrics
        ? {
            cpu: Math.round(currentMetrics.cpu_usage * 10) / 10,
            memory: Math.round(currentMetrics.memory_usage * 10) / 10,
            temperature: Math.round(currentMetrics.temperature),
            disk_used_percent: Math.round(currentMetrics.disk_usage * 10) / 10,
            uptime_seconds: currentMetrics.uptime,
            last_update: currentMetrics.recorded_at,
          }
        : null,
      averages_24h: {
        cpu: avgMetrics?.avg_cpu ? Math.round(avgMetrics.avg_cpu * 10) / 10 : null,
        memory: avgMetrics?.avg_memory ? Math.round(avgMetrics.avg_memory * 10) / 10 : null,
        temperature: avgMetrics?.avg_temperature ? Math.round(avgMetrics.avg_temperature) : null,
        max_temperature: avgMetrics?.max_temperature ? Math.round(avgMetrics.max_temperature) : null,
      },
      uptime_30d: Math.round(uptimePercent * 10) / 10,
      last_seen: site.last_seen_at,
      alerts_active: parseInt(alerts?.active_alerts || '0'),
      alerts_last_30d: parseInt(alerts?.alerts_last_30d || '0'),
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
         AND recorded_at > NOW() - INTERVAL '${daysNum} days'
       GROUP BY DATE(recorded_at)
       ORDER BY date DESC`,
      [siteId]
    );

    // Calculer l'uptime par jour (2880 heartbeats max par jour)
    const dailyStats = result.rows.map((row: DailyHeartbeatRow) => ({
      date: row.date,
      uptime_percent: Math.min(100, Math.round((parseInt(row.heartbeat_count) / 2880) * 100 * 10) / 10),
      avg_cpu: row.avg_cpu ? Math.round(row.avg_cpu * 10) / 10 : null,
      avg_temperature: row.avg_temp ? Math.round(row.avg_temp) : null,
    }));

    // Calculer les stats globales
    const totalHeartbeats = result.rows.reduce((sum: number, row: DailyHeartbeatRow) => sum + parseInt(row.heartbeat_count), 0);
    const expectedTotal = daysNum * 2880;
    const overallUptime = Math.min(100, Math.round((totalHeartbeats / expectedTotal) * 100 * 10) / 10);

    res.json({
      site_id: siteId,
      period_days: daysNum,
      overall_uptime_percent: overallUptime,
      daily: dailyStats,
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
    const { status, severity, limit = 50 } = req.query;

    let sqlQuery = `SELECT * FROM alerts WHERE site_id = $1`;
    const params: any[] = [siteId];
    let paramIndex = 2;

    if (status) {
      sqlQuery += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (severity) {
      sqlQuery += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    sqlQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(Math.min(parseInt(limit as string) || 50, 200));

    const result = await query(sqlQuery, params);

    // Calculer les stats
    const statsResult = await query<AlertStatsRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active') as active,
         COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
         COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
         COUNT(*) FILTER (WHERE severity = 'critical') as critical,
         COUNT(*) FILTER (WHERE severity = 'warning') as warning,
         COUNT(*) FILTER (WHERE severity = 'info') as info
       FROM alerts
       WHERE site_id = $1`,
      [siteId]
    );

    const alertStats = statsResult.rows[0];

    res.json({
      site_id: siteId,
      stats: {
        by_status: {
          active: parseInt(alertStats?.active || '0'),
          acknowledged: parseInt(alertStats?.acknowledged || '0'),
          resolved: parseInt(alertStats?.resolved || '0'),
        },
        by_severity: {
          critical: parseInt(alertStats?.critical || '0'),
          warning: parseInt(alertStats?.warning || '0'),
          info: parseInt(alertStats?.info || '0'),
        },
      },
      alerts: result.rows,
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

    for (const play of plays) {
      try {
        await query(
          `INSERT INTO video_plays (site_id, session_id, video_filename, category, played_at, duration_played, video_duration, completed, trigger_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            site_id,
            play.session_id || null,
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
    const { from, to } = req.query;

    // Dates par défaut: mois en cours
    const fromDate = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to as string) : new Date();

    // Période précédente pour comparaison
    const periodLength = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevFromDate = new Date(fromDate.getTime() - periodLength * 24 * 60 * 60 * 1000);
    const prevToDate = new Date(fromDate.getTime() - 1);

    // Stats période actuelle
    const currentStats = await query<UsageStatsRow>(
      `SELECT
         COALESCE(SUM(duration_played), 0) as screen_time_seconds,
         COUNT(*) as videos_played,
         COUNT(DISTINCT session_id) as sessions_count,
         COUNT(DISTINCT DATE(played_at)) as active_days,
         COUNT(*) FILTER (WHERE trigger_type = 'manual') as manual_triggers,
         COUNT(*) FILTER (WHERE trigger_type = 'auto') as auto_plays
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3`,
      [siteId, fromDate, toDate]
    );

    // Stats période précédente
    const prevStats = await query<UsageStatsRow>(
      `SELECT
         COALESCE(SUM(duration_played), 0) as screen_time_seconds,
         COUNT(*) as videos_played,
         COUNT(DISTINCT session_id) as sessions_count
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3`,
      [siteId, prevFromDate, prevToDate]
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
    const prev = prevStats.rows[0];

    res.json({
      site_id: siteId,
      period: `${fromDate.toISOString().split('T')[0]}/${toDate.toISOString().split('T')[0]}`,
      summary: {
        screen_time_seconds: parseInt(current.screen_time_seconds),
        screen_time_formatted: formatDuration(parseInt(current.screen_time_seconds)),
        videos_played: parseInt(current.videos_played),
        sessions_count: parseInt(current.sessions_count),
        active_days: parseInt(current.active_days),
        manual_triggers: parseInt(current.manual_triggers),
        auto_plays: parseInt(current.auto_plays),
      },
      comparison_previous: {
        screen_time: calculatePercentChange(parseInt(current.screen_time_seconds), parseInt(prev.screen_time_seconds)),
        videos_played: calculatePercentChange(parseInt(current.videos_played), parseInt(prev.videos_played)),
        sessions: calculatePercentChange(parseInt(current.sessions_count), parseInt(prev.sessions_count)),
      },
      daily: dailyStats.rows.map((row: DailyStatsRow) => ({
        date: row.date,
        screen_time: parseInt(row.screen_time),
        videos: parseInt(row.videos),
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
    const { from, to } = req.query;

    const fromDate = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to as string) : new Date();

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
       GROUP BY category`,
      [siteId, fromDate, toDate]
    );

    // Top vidéos
    const topVideos = await query<TopVideoRow>(
      `SELECT
         video_filename,
         category,
         COUNT(*) as plays,
         COALESCE(SUM(duration_played), 0) as total_duration,
         COUNT(*) FILTER (WHERE completed = true) as completed_count
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3
       GROUP BY video_filename, category
       ORDER BY plays DESC
       LIMIT 10`,
      [siteId, fromDate, toDate]
    );

    // Vidéos jamais jouées (depuis la liste des vidéos connues)
    interface NeverPlayedRow extends QueryRow {
      video_filename: string;
      category: string;
    }
    const neverPlayed = await query<NeverPlayedRow>(
      `SELECT DISTINCT vp.video_filename, vp.category
       FROM video_plays vp
       WHERE vp.site_id = $1
         AND vp.played_at < $2
         AND NOT EXISTS (
           SELECT 1 FROM video_plays vp2
           WHERE vp2.site_id = $1
             AND vp2.video_filename = vp.video_filename
             AND vp2.played_at >= $2
             AND vp2.played_at <= $3
         )
       LIMIT 20`,
      [siteId, fromDate, fromDate, toDate]
    );

    // Taux de complétion moyen
    interface CompletionRow extends QueryRow {
      avg_completion: string | null;
    }
    const completionRate = await query<CompletionRow>(
      `SELECT
         AVG(CASE WHEN completed THEN 100
             WHEN video_duration > 0 THEN (duration_played::float / video_duration * 100)
             ELSE 100 END) as avg_completion
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2
         AND played_at <= $3`,
      [siteId, fromDate, toDate]
    );

    // Calculer les totaux et pourcentages par catégorie
    const totalPlays = categoryStats.rows.reduce((sum: number, row: CategoryStatsRow) => sum + parseInt(row.plays), 0);
    const byCategory: Record<string, { plays: number; percent: number; duration: number }> = {};

    for (const row of categoryStats.rows) {
      const cat = row.category || 'other';
      byCategory[cat] = {
        plays: parseInt(row.plays),
        percent: totalPlays > 0 ? Math.round((parseInt(row.plays) / totalPlays) * 100 * 10) / 10 : 0,
        duration: parseInt(row.total_duration),
      };
    }

    res.json({
      site_id: siteId,
      period: `${fromDate.toISOString().split('T')[0]}/${toDate.toISOString().split('T')[0]}`,
      by_category: byCategory,
      top_videos: topVideos.rows.map((row: TopVideoRow) => ({
        filename: row.video_filename,
        category: row.category,
        plays: parseInt(row.plays),
        total_duration: parseInt(row.total_duration),
        completed_count: parseInt(row.completed_count),
      })),
      never_played: neverPlayed.rows.map((row: NeverPlayedRow) => ({
        filename: row.video_filename,
        category: row.category,
      })),
      completion_rate: completionRate.rows[0]?.avg_completion
        ? Math.round(parseFloat(completionRate.rows[0].avg_completion) * 10) / 10
        : null,
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
    // Stats globales
    const globalStats = await query<GlobalStatsRow>(`
      SELECT
        COUNT(DISTINCT site_id) as active_sites,
        COALESCE(SUM(videos_played), 0) as total_videos_this_month,
        COALESCE(SUM(screen_time_seconds), 0) as total_screen_time_this_month
      FROM club_daily_stats
      WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    // Sites les plus actifs
    const topSites = await query<TopSiteRow>(`
      SELECT
        s.id, s.site_name, s.club_name,
        COALESCE(SUM(cds.videos_played), 0) as videos_this_month,
        COALESCE(SUM(cds.screen_time_seconds), 0) as screen_time_this_month
      FROM sites s
      LEFT JOIN club_daily_stats cds ON cds.site_id = s.id
        AND cds.date >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY s.id, s.site_name, s.club_name
      ORDER BY videos_this_month DESC
      LIMIT 10
    `);

    // Sites inactifs (aucune vidéo ce mois)
    interface InactiveSiteRow extends QueryRow {
      id: string;
      site_name: string;
      club_name: string;
      last_seen_at: string | null;
    }
    const inactiveSites = await query<InactiveSiteRow>(`
      SELECT s.id, s.site_name, s.club_name, s.last_seen_at
      FROM sites s
      WHERE NOT EXISTS (
        SELECT 1 FROM video_plays vp
        WHERE vp.site_id = s.id
          AND vp.played_at >= DATE_TRUNC('month', CURRENT_DATE)
      )
      ORDER BY s.last_seen_at DESC NULLS LAST
      LIMIT 10
    `);

    res.json({
      global: {
        active_sites: parseInt(globalStats.rows[0]?.active_sites || '0'),
        total_videos_this_month: parseInt(globalStats.rows[0]?.total_videos_this_month || '0'),
        total_screen_time_this_month: parseInt(globalStats.rows[0]?.total_screen_time_this_month || '0'),
        total_screen_time_formatted: formatDuration(
          parseInt(globalStats.rows[0]?.total_screen_time_this_month || '0')
        ),
      },
      top_sites: topSites.rows.map((row: TopSiteRow) => ({
        id: row.id,
        site_name: row.site_name,
        club_name: row.club_name,
        videos_this_month: parseInt(row.videos_this_month),
        screen_time_this_month: parseInt(row.screen_time_this_month),
        screen_time_formatted: formatDuration(parseInt(row.screen_time_this_month)),
      })),
      inactive_sites: inactiveSites.rows,
    });
  } catch (error) {
    logger.error('Get analytics overview error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la vue d\'ensemble' });
  }
};
