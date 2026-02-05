/**
 * Service d'Alertes Prédictives
 *
 * Analyse les tendances et patterns pour détecter les problèmes AVANT qu'ils ne surviennent.
 * Fonctionne en conjonction avec alertingService qui gère les notifications.
 *
 * Métriques prédictives évaluées :
 * - days_since_last_video : Détecte l'inactivité des clubs
 * - disk_growth_rate : Prédit quand le disque sera plein
 * - disconnections_24h : Identifie les connexions instables
 * - wifi_signal_quality : Détecte la dégradation du signal
 * - video_errors_24h : Identifie les problèmes de lecture
 * - temperature_trend : Détecte les surchauffes progressives
 * - hotspot_restarts_24h : Identifie les problèmes de hotspot
 * - days_until_subscription_end : Alerte sur les abonnements expirant
 */

import { query } from '../config/database';
import { alertingService } from './alerting.service';
import logger from '../config/logger';

interface SiteMetrics {
  siteId: string;
  siteName: string;
  lastVideoPlay: Date | null;
  diskUsage: number | null;
  previousDiskUsage: number | null;
  disconnections24h: number;
  wifiSignalQuality: number | null;
  videoErrors24h: number;
  currentTemperature: number | null;
  previousTemperature: number | null;
  hotspotRestarts24h: number;
  subscriptionEnd: Date | null;
}

class PredictiveAlertsService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Démarre le service d'alertes prédictives
   * Exécute une vérification toutes les heures
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[PredictiveAlerts] Service already running');
      return;
    }

    this.isRunning = true;
    logger.info('[PredictiveAlerts] Starting predictive alerts service');

    // Première exécution après 5 minutes (pour laisser le temps au système de démarrer)
    setTimeout(() => {
      this.runPredictiveChecks().catch(err => {
        logger.error('[PredictiveAlerts] Initial check failed', { error: err });
      });
    }, 5 * 60 * 1000);

    // Puis toutes les heures
    this.checkInterval = setInterval(() => {
      this.runPredictiveChecks().catch(err => {
        logger.error('[PredictiveAlerts] Periodic check failed', { error: err });
      });
    }, 60 * 60 * 1000);
  }

  /**
   * Arrête le service
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    logger.info('[PredictiveAlerts] Service stopped');
  }

  /**
   * Exécute les vérifications prédictives sur tous les sites
   */
  async runPredictiveChecks(): Promise<{
    sitesChecked: number;
    alertsGenerated: number;
    errors: number;
  }> {
    const startTime = Date.now();
    let alertsGenerated = 0;
    let errors = 0;

    try {
      // Récupérer tous les sites actifs
      const sites = await this.getActivesSitesMetrics();

      logger.info('[PredictiveAlerts] Running predictive checks', {
        sitesCount: sites.length,
      });

      for (const site of sites) {
        try {
          const alerts = await this.evaluateSiteMetrics(site);
          alertsGenerated += alerts;
        } catch (error) {
          errors++;
          logger.error('[PredictiveAlerts] Error evaluating site', {
            siteId: site.siteId,
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      const duration = Date.now() - startTime;
      logger.info('[PredictiveAlerts] Predictive checks completed', {
        sitesChecked: sites.length,
        alertsGenerated,
        errors,
        durationMs: duration,
      });

      return { sitesChecked: sites.length, alertsGenerated, errors };
    } catch (error) {
      logger.error('[PredictiveAlerts] Failed to run predictive checks', { error });
      return { sitesChecked: 0, alertsGenerated: 0, errors: 1 };
    }
  }

  /**
   * Récupère les métriques de tous les sites actifs
   */
  private async getActivesSitesMetrics(): Promise<SiteMetrics[]> {
    const result = await query(`
      WITH last_metrics AS (
        SELECT DISTINCT ON (site_id)
          site_id,
          disk_usage_percent,
          temperature,
          recorded_at
        FROM metrics
        ORDER BY site_id, recorded_at DESC
      ),
      previous_metrics AS (
        SELECT DISTINCT ON (site_id)
          site_id,
          disk_usage_percent,
          temperature,
          recorded_at
        FROM metrics
        WHERE recorded_at < NOW() - INTERVAL '1 hour'
        ORDER BY site_id, recorded_at DESC
      ),
      last_video_plays AS (
        SELECT
          site_id,
          MAX(played_at) as last_play
        FROM video_plays
        WHERE played_at > NOW() - INTERVAL '30 days'
        GROUP BY site_id
      ),
      disconnection_counts AS (
        SELECT
          site_id,
          COUNT(*) as count
        FROM (
          -- Compter les changements de status online→offline dans les 24h
          SELECT site_id FROM remote_commands
          WHERE type = 'heartbeat_missed'
            AND created_at > NOW() - INTERVAL '24 hours'
        ) sub
        GROUP BY site_id
      ),
      video_error_counts AS (
        SELECT
          site_id,
          COUNT(*) as count
        FROM alerts
        WHERE type LIKE '%video%error%'
          AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY site_id
      ),
      hotspot_restart_counts AS (
        SELECT
          site_id,
          COUNT(*) as count
        FROM remote_commands
        WHERE type = 'fix_hotspot'
          AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY site_id
      )
      SELECT
        s.id as site_id,
        s.site_name,
        lvp.last_play as last_video_play,
        lm.disk_usage_percent as disk_usage,
        pm.disk_usage_percent as previous_disk_usage,
        COALESCE(dc.count, 0)::int as disconnections_24h,
        CASE
          WHEN s.local_config_mirror->>'_networkProfile' IS NOT NULL
          THEN (s.local_config_mirror->'_networkProfile'->>'stabilityScore')::int
          ELSE NULL
        END as wifi_signal_quality,
        COALESCE(vec.count, 0)::int as video_errors_24h,
        lm.temperature as current_temperature,
        pm.temperature as previous_temperature,
        COALESCE(hrc.count, 0)::int as hotspot_restarts_24h,
        s.subscription_end
      FROM sites s
      LEFT JOIN last_metrics lm ON lm.site_id = s.id
      LEFT JOIN previous_metrics pm ON pm.site_id = s.id
      LEFT JOIN last_video_plays lvp ON lvp.site_id = s.id
      LEFT JOIN disconnection_counts dc ON dc.site_id = s.id
      LEFT JOIN video_error_counts vec ON vec.site_id = s.id
      LEFT JOIN hotspot_restart_counts hrc ON hrc.site_id = s.id
      WHERE s.status != 'archived'
        AND s.suspended = false
    `);

    return result.rows.map(row => ({
      siteId: row.site_id as string,
      siteName: row.site_name as string,
      lastVideoPlay: row.last_video_play ? new Date(row.last_video_play as string) : null,
      diskUsage: row.disk_usage as number | null,
      previousDiskUsage: row.previous_disk_usage as number | null,
      disconnections24h: row.disconnections_24h as number,
      wifiSignalQuality: row.wifi_signal_quality as number | null,
      videoErrors24h: row.video_errors_24h as number,
      currentTemperature: row.current_temperature as number | null,
      previousTemperature: row.previous_temperature as number | null,
      hotspotRestarts24h: row.hotspot_restarts_24h as number,
      subscriptionEnd: row.subscription_end ? new Date(row.subscription_end as string) : null,
    }));
  }

  /**
   * Évalue les métriques prédictives pour un site
   */
  private async evaluateSiteMetrics(site: SiteMetrics): Promise<number> {
    let alertCount = 0;

    // 1. Inactivité prolongée
    if (site.lastVideoPlay) {
      const daysSinceLastVideo = Math.floor(
        (Date.now() - site.lastVideoPlay.getTime()) / (1000 * 60 * 60 * 24)
      );
      await alertingService.evaluateMetric(site.siteId, 'days_since_last_video', daysSinceLastVideo);
      if (daysSinceLastVideo > 7) alertCount++;
    }

    // 2. Croissance disque
    if (site.diskUsage !== null && site.previousDiskUsage !== null) {
      const diskGrowthRate = site.diskUsage - site.previousDiskUsage;
      if (diskGrowthRate > 0) {
        await alertingService.evaluateMetric(site.siteId, 'disk_growth_rate', diskGrowthRate);
        if (diskGrowthRate > 5) alertCount++;
      }
    }

    // 3. Déconnexions fréquentes
    if (site.disconnections24h > 0) {
      await alertingService.evaluateMetric(site.siteId, 'disconnections_24h', site.disconnections24h);
      if (site.disconnections24h > 5) alertCount++;
    }

    // 4. Signal WiFi dégradé
    if (site.wifiSignalQuality !== null) {
      await alertingService.evaluateMetric(site.siteId, 'wifi_signal_quality', site.wifiSignalQuality);
      if (site.wifiSignalQuality < 50) alertCount++;
    }

    // 5. Erreurs vidéo
    if (site.videoErrors24h > 0) {
      await alertingService.evaluateMetric(site.siteId, 'video_errors_24h', site.videoErrors24h);
      if (site.videoErrors24h > 5) alertCount++;
    }

    // 6. Tendance température
    if (site.currentTemperature !== null && site.previousTemperature !== null) {
      const temperatureTrend = site.currentTemperature - site.previousTemperature;
      if (temperatureTrend > 0) {
        await alertingService.evaluateMetric(site.siteId, 'temperature_trend', temperatureTrend);
        if (temperatureTrend > 5) alertCount++;
      }
    }

    // 7. Redémarrages hotspot
    if (site.hotspotRestarts24h > 0) {
      await alertingService.evaluateMetric(site.siteId, 'hotspot_restarts_24h', site.hotspotRestarts24h);
      if (site.hotspotRestarts24h > 2) alertCount++;
    }

    // 8. Expiration abonnement
    if (site.subscriptionEnd) {
      const daysUntilEnd = Math.floor(
        (site.subscriptionEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilEnd > 0 && daysUntilEnd < 30) {
        await alertingService.evaluateMetric(site.siteId, 'days_until_subscription_end', daysUntilEnd);
        alertCount++;
      }
    }

    return alertCount;
  }

  /**
   * Force une vérification immédiate (pour les tests ou l'admin)
   */
  async runNow(): Promise<{ sitesChecked: number; alertsGenerated: number; errors: number }> {
    return this.runPredictiveChecks();
  }

  /**
   * Récupère le statut du service
   */
  getStatus(): { running: boolean; lastCheck: Date | null; nextCheck: Date | null } {
    return {
      running: this.isRunning,
      lastCheck: null, // TODO: Stocker la date de dernière exécution
      nextCheck: this.isRunning ? new Date(Date.now() + 60 * 60 * 1000) : null,
    };
  }
}

export const predictiveAlertsService = new PredictiveAlertsService();
export default predictiveAlertsService;
