/**
 * Realtime Stats Service
 *
 * Collecte et broadcast les statistiques en temps réel via Socket.IO
 * pour le dashboard live.
 */

import { Server as SocketIOServer } from 'socket.io';
import { query } from '../config/database';
import logger from '../config/logger';

export interface RealtimeStats {
  timestamp: string;
  sites: {
    total: number;
    online: number;
    offline: number;
    warning: number;
  };
  activity: {
    videos_last_hour: number;
    videos_last_minute: number;
    impressions_last_hour: number;
    active_sessions: number;
  };
  top_content: {
    video_name: string;
    category: string;
    plays_last_hour: number;
  } | null;
  health: {
    avg_cpu: number;
    avg_memory: number;
    avg_temperature: number;
    sites_with_alerts: number;
  };
  trends: {
    videos_trend: 'up' | 'down' | 'stable';
    videos_change_percent: number;
  };
}

class RealtimeStatsService {
  private io: SocketIOServer | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private lastStats: RealtimeStats | null = null;
  private previousHourVideos: number = 0;

  /**
   * Initialise le service avec l'instance Socket.IO
   */
  initialize(io: SocketIOServer): void {
    this.io = io;
    logger.info('RealtimeStatsService initialized');
  }

  /**
   * Démarre le broadcast des stats toutes les 10 secondes
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('RealtimeStatsService already running');
      return;
    }

    // Premier broadcast immédiat
    this.broadcastStats();

    // Puis toutes les 30 secondes (reduced from 10s to save DB connections and memory)
    this.intervalId = setInterval(() => {
      this.broadcastStats();
    }, 30000);

    logger.info('RealtimeStatsService started - broadcasting every 30s');
  }

  /**
   * Arrête le broadcast
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('RealtimeStatsService stopped');
    }
  }

  /**
   * Collecte et broadcast les statistiques
   */
  async broadcastStats(): Promise<void> {
    if (!this.io) {
      return;
    }

    try {
      const stats = await this.collectStats();
      this.lastStats = stats;

      // Broadcast à tous les clients connectés au namespace admin
      this.io.to('admin-dashboard').emit('realtime-stats', stats);

    } catch (error) {
      logger.error('Error broadcasting realtime stats:', error);
    }
  }

  /**
   * Collecte toutes les statistiques
   */
  async collectStats(): Promise<RealtimeStats> {
    const [
      sitesStats,
      activityStats,
      topContent,
      healthStats,
    ] = await Promise.all([
      this.getSitesStats(),
      this.getActivityStats(),
      this.getTopContent(),
      this.getHealthStats(),
    ]);

    // Calcul de la tendance
    const videosTrend = this.calculateTrend(activityStats.videos_last_hour);

    return {
      timestamp: new Date().toISOString(),
      sites: sitesStats,
      activity: activityStats,
      top_content: topContent,
      health: healthStats,
      trends: videosTrend,
    };
  }

  /**
   * Stats des sites (online/offline)
   */
  private async getSitesStats(): Promise<RealtimeStats['sites']> {
    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'online' AND NOT COALESCE(suspended, false)) as online,
        COUNT(*) FILTER (WHERE status = 'offline' OR COALESCE(suspended, false)) as offline,
        COUNT(*) FILTER (WHERE status = 'warning' OR (status = 'online' AND last_seen_at < NOW() - INTERVAL '2 minutes')) as warning
      FROM sites
    `);

    const row = result.rows[0];
    return {
      total: parseInt(String(row.total)) || 0,
      online: parseInt(String(row.online)) || 0,
      offline: parseInt(String(row.offline)) || 0,
      warning: parseInt(String(row.warning)) || 0,
    };
  }

  /**
   * Stats d'activité (vidéos jouées)
   */
  private async getActivityStats(): Promise<RealtimeStats['activity']> {
    // Vidéos jouées dans la dernière heure
    const videosLastHourResult = await query(`
      SELECT COUNT(*) as count
      FROM video_plays
      WHERE played_at >= NOW() - INTERVAL '1 hour'
    `);

    // Vidéos jouées dans la dernière minute
    const videosLastMinuteResult = await query(`
      SELECT COUNT(*) as count
      FROM video_plays
      WHERE played_at >= NOW() - INTERVAL '1 minute'
    `);

    // Impressions sponsors dans la dernière heure
    const impressionsResult = await query(`
      SELECT COUNT(*) as count
      FROM advertiser_impressions
      WHERE played_at >= NOW() - INTERVAL '1 hour'
    `);

    // Sessions actives (sites avec activité dans les 5 dernières minutes)
    const activeSessionsResult = await query(`
      SELECT COUNT(DISTINCT site_id) as count
      FROM video_plays
      WHERE played_at >= NOW() - INTERVAL '5 minutes'
    `);

    return {
      videos_last_hour: parseInt(String(videosLastHourResult.rows[0]?.count)) || 0,
      videos_last_minute: parseInt(String(videosLastMinuteResult.rows[0]?.count)) || 0,
      impressions_last_hour: parseInt(String(impressionsResult.rows[0]?.count)) || 0,
      active_sessions: parseInt(String(activeSessionsResult.rows[0]?.count)) || 0,
    };
  }

  /**
   * Contenu le plus joué dans la dernière heure
   */
  private async getTopContent(): Promise<RealtimeStats['top_content']> {
    const result = await query(`
      SELECT
        video_filename as video_name,
        category,
        COUNT(*) as plays
      FROM video_plays
      WHERE played_at >= NOW() - INTERVAL '1 hour'
      GROUP BY video_filename, category
      ORDER BY plays DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      video_name: String(row.video_name || 'Inconnu'),
      category: String(row.category || 'Autre'),
      plays_last_hour: parseInt(String(row.plays)) || 0,
    };
  }

  /**
   * Stats de santé moyenne de la flotte
   */
  private async getHealthStats(): Promise<RealtimeStats['health']> {
    // Moyennes des métriques récentes (dernières 5 minutes)
    // Note: Les colonnes sont cpu_usage, memory_usage (pas cpu_percent, memory_percent)
    const metricsResult = await query(`
      SELECT
        AVG(cpu_usage) as avg_cpu,
        AVG(memory_usage) as avg_memory,
        AVG(temperature) as avg_temperature
      FROM metrics
      WHERE recorded_at >= NOW() - INTERVAL '5 minutes'
    `);

    // Sites avec alertes non résolues
    const alertsResult = await query(`
      SELECT COUNT(DISTINCT site_id) as count
      FROM alerts
      WHERE resolved_at IS NULL
        AND severity IN ('critical', 'warning')
    `);

    const metrics = metricsResult.rows[0];
    return {
      avg_cpu: parseFloat(String(metrics?.avg_cpu)) || 0,
      avg_memory: parseFloat(String(metrics?.avg_memory)) || 0,
      avg_temperature: parseFloat(String(metrics?.avg_temperature)) || 0,
      sites_with_alerts: parseInt(String(alertsResult.rows[0]?.count)) || 0,
    };
  }

  /**
   * Calcule la tendance par rapport à l'heure précédente
   */
  private calculateTrend(currentVideos: number): RealtimeStats['trends'] {
    const previous = this.previousHourVideos;
    this.previousHourVideos = currentVideos;

    if (previous === 0) {
      return { videos_trend: 'stable', videos_change_percent: 0 };
    }

    const changePercent = ((currentVideos - previous) / previous) * 100;

    let trend: 'up' | 'down' | 'stable';
    if (changePercent > 5) {
      trend = 'up';
    } else if (changePercent < -5) {
      trend = 'down';
    } else {
      trend = 'stable';
    }

    return {
      videos_trend: trend,
      videos_change_percent: Math.round(changePercent * 10) / 10,
    };
  }

  /**
   * Retourne les dernières stats collectées (pour API REST)
   */
  getLastStats(): RealtimeStats | null {
    return this.lastStats;
  }

  /**
   * Force une collecte et retourne les stats (pour API REST)
   */
  async getStats(): Promise<RealtimeStats> {
    return await this.collectStats();
  }
}

export const realtimeStatsService = new RealtimeStatsService();
export default realtimeStatsService;
