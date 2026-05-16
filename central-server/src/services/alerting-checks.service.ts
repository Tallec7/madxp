/**
 * Vérifications périodiques pour le service d'alerting :
 * - Métriques horaires (WebSocket disconnects, video safety timeouts, kiosk crashes)
 * - Déploiements bloqués (content + OTA)
 * - Sponsors fantômes
 * - Staleness des agrégations CRON
 * - Profils SaaS vides
 *
 * Extrait de alerting.service.ts (ADR-051 Phase 1).
 */

import { query } from '../config/database';
import logger from '../config/logger';
import type { AlertSeverity } from './alerting.types';
import { MAX_LAST_ALERT_TIME_ENTRIES } from './alerting.types';

/** Interface for the core alerting service methods needed by checks */
export interface AlertCreator {
  evaluateMetric(siteId: string, metric: string, value: number): Promise<void>;
  createAlert(alert: { siteId?: string; type: string; severity: AlertSeverity; message: string; metadata: Record<string, unknown> }): Promise<string>;
}

export class AlertingChecks {
  constructor(
    private readonly alertCreator: AlertCreator,
    private readonly lastAlertTime: Map<string, Date>,
    private readonly wsDisconnectEvents: Map<string, number[]>,
    private readonly videoSafetyTimeoutEvents: Map<string, number[]>,
  ) {}

  /**
   * Aggregate hourly metrics and feed them into evaluateMetric().
   * Runs every 5 minutes to balance responsiveness vs DB load.
   */
  async checkHourlyMetrics(): Promise<void> {
    try {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      // 1. WebSocket disconnects (in-memory)
      for (const [siteId, events] of this.wsDisconnectEvents.entries()) {
        const recentEvents = events.filter(ts => ts > oneHourAgo);
        this.wsDisconnectEvents.set(siteId, recentEvents);
        if (recentEvents.length > 0) {
          await this.alertCreator.evaluateMetric(siteId, 'websocket_disconnects_1h', recentEvents.length);
        }
      }

      // 2. Video safety timeouts (in-memory)
      for (const [siteId, events] of this.videoSafetyTimeoutEvents.entries()) {
        const recentEvents = events.filter(ts => ts > oneHourAgo);
        this.videoSafetyTimeoutEvents.set(siteId, recentEvents);
        if (recentEvents.length > 0) {
          await this.alertCreator.evaluateMetric(siteId, 'video_safety_timeouts_1h', recentEvents.length);
        }
      }

      // 3. Kiosk crashes (from alerts table)
      const kioskCrashes = await query<{ site_id: string; crash_count: number }>(
        `SELECT site_id, COUNT(*) AS crash_count
         FROM alerts
         WHERE alert_type = 'kiosk_crash'
           AND created_at > NOW() - INTERVAL '1 hour'
         GROUP BY site_id`
      );

      for (const row of kioskCrashes.rows) {
        await this.alertCreator.evaluateMetric(row.site_id, 'kiosk_crashes_1h', Number(row.crash_count));
      }

      // 4. Video playback errors 24h (PR3) — alimente l'alerte
      // `video_errors_24h` déclarée dans alerting.types (warning ≥5, critical ≥15).
      // La fenêtre 24h est calculée dans la requête ; le tick 5min reste léger
      // grâce à l'index sur `video_plays(site_id, played_at)`.
      const videoErrors = await query<{ site_id: string; error_count: number }>(
        `SELECT site_id, COUNT(*)::int AS error_count
         FROM video_plays
         WHERE interruption_reason = 'video_error'
           AND played_at > NOW() - INTERVAL '24 hours'
           AND site_id IS NOT NULL
         GROUP BY site_id`
      );

      for (const row of videoErrors.rows) {
        await this.alertCreator.evaluateMetric(row.site_id, 'video_errors_24h', Number(row.error_count));
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('alerts')) {
        return;
      }
      logger.error('Error checking hourly metrics:', error);
    }
  }

  /**
   * Détecte les déploiements bloqués en in_progress depuis plus de 30 minutes.
   * Vérifie content_deployments (vidéos) et update_deployments (OTA).
   */
  async checkStuckDeployments(): Promise<void> {
    try {
      // Auto-complete SaaS content deployments stuck in_progress
      const saasAutoCompleted = await query<{ id: string }>(`
        UPDATE content_deployments cd
        SET status = 'completed', completed_at = NOW(), progress = 100
        FROM sites s
        WHERE cd.target_id = s.id
          AND cd.target_type = 'site'
          AND s.site_type = 'saas'
          AND cd.status IN ('in_progress', 'pending')
        RETURNING cd.id
      `);
      if (saasAutoCompleted.rows.length > 0) {
        logger.info('Auto-completed SaaS deployments (no Pi needed)', {
          count: saasAutoCompleted.rows.length,
          ids: saasAutoCompleted.rows.map(r => r.id),
        });
      }

      // Auto-complete content deployments stuck at 100% for >5 minutes
      const autoCompleted = await query<{ id: string }>(`
        UPDATE content_deployments cd
        SET status = 'completed', completed_at = NOW()
        FROM sites s
        WHERE cd.target_id = s.id
          AND cd.target_type = 'site'
          AND s.site_type != 'saas'
          AND cd.status = 'in_progress'
          AND cd.progress >= 100
          AND COALESCE(cd.started_at, cd.created_at) < NOW() - INTERVAL '5 minutes'
        RETURNING cd.id
      `);
      if (autoCompleted.rows.length > 0) {
        logger.info('Auto-completed stuck deployments at 100%', {
          count: autoCompleted.rows.length,
          ids: autoCompleted.rows.map(r => r.id),
        });
      }

      // Content deployments stuck (progress < 100), excluding SaaS
      const contentStuck = await query<{
        id: string;
        target_id: string;
        minutes_stuck: number;
      }>(`
        SELECT cd.id, cd.target_id,
          EXTRACT(EPOCH FROM (NOW() - COALESCE(cd.started_at, cd.created_at))) / 60 AS minutes_stuck
        FROM content_deployments cd
        JOIN sites s ON cd.target_id = s.id AND cd.target_type = 'site'
        WHERE s.site_type != 'saas'
          AND cd.status = 'in_progress'
          AND cd.progress < 100
          AND COALESCE(cd.started_at, cd.created_at) < NOW() - INTERVAL '30 minutes'
      `);

      // OTA deployments stuck
      const updateStuck = await query<{
        id: string;
        target_id: string;
        minutes_stuck: number;
        version: string;
      }>(`
        SELECT ud.id, ud.target_id,
          EXTRACT(EPOCH FROM (NOW() - COALESCE(ud.started_at, ud.created_at))) / 60 AS minutes_stuck,
          su.version
        FROM update_deployments ud
        JOIN software_updates su ON ud.update_id = su.id
        WHERE ud.status = 'in_progress'
          AND COALESCE(ud.started_at, ud.created_at) < NOW() - INTERVAL '30 minutes'
      `);

      const allStuck = [
        ...contentStuck.rows.map(r => ({
          deploymentId: r.id,
          targetId: r.target_id,
          minutesStuck: Math.round(r.minutes_stuck),
          type: 'content' as const,
          version: undefined as string | undefined,
        })),
        ...updateStuck.rows.map(r => ({
          deploymentId: r.id,
          targetId: r.target_id,
          minutesStuck: Math.round(r.minutes_stuck),
          type: 'update' as const,
          version: r.version,
        })),
      ];

      if (allStuck.length === 0) return;

      logger.warn('Stuck deployments detected', { count: allStuck.length });

      for (const stuck of allStuck) {
        const cooldownKey = `deployment_stuck:${stuck.deploymentId}`;
        const lastAlert = this.lastAlertTime.get(cooldownKey);
        if (lastAlert) {
          const cooldownEnd = new Date(lastAlert.getTime() + 30 * 60 * 1000);
          if (new Date() < cooldownEnd) continue;
        }

        const severity: AlertSeverity = stuck.minutesStuck >= 60 ? 'critical' : 'warning';
        const typeLabel = stuck.type === 'update' ? 'mise à jour logicielle' : 'vidéo';
        const versionInfo = stuck.version ? ` v${stuck.version}` : '';

        await this.alertCreator.createAlert({
          siteId: stuck.targetId,
          type: 'Déploiement bloqué',
          severity,
          message: `Déploiement ${typeLabel}${versionInfo} bloqué en in_progress depuis ${stuck.minutesStuck} minutes (ID: ${stuck.deploymentId})`,
          metadata: {
            metric: 'deployment_stuck_minutes',
            value: stuck.minutesStuck,
            deploymentId: stuck.deploymentId,
            deploymentType: stuck.type,
          },
        });

        this.lastAlertTime.set(cooldownKey, new Date());

        logger.warn('Alert created for stuck deployment', {
          deploymentId: stuck.deploymentId,
          minutesStuck: stuck.minutesStuck,
          severity,
        });

        // Auto-fail update deployments stuck for >2 hours
        if (stuck.type === 'update' && stuck.minutesStuck >= 120) {
          const table = 'update_deployments';
          await query(
            `UPDATE ${table}
             SET status = 'failed',
                 error_message = 'Timeout : aucune réponse du Pi après ' || $2 || ' minutes — le site était probablement hors ligne',
                 completed_at = NOW()
             WHERE id = $1 AND status = 'in_progress'`,
            [stuck.deploymentId, stuck.minutesStuck]
          );
          logger.warn('Auto-failed stuck update deployment', {
            deploymentId: stuck.deploymentId,
            minutesStuck: stuck.minutesStuck,
          });
        }
      }
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('content_deployments') ||
        error.message.includes('update_deployments')
      )) {
        return;
      }
      logger.error('Error checking stuck deployments:', error);
    }

    // Détecter deploy_video rejetés pour "Checksum is required"
    try {
      const checksumRejected = await query<{
        site_id: string;
        count: string;
      }>(`
        SELECT site_id, COUNT(*) as count
        FROM remote_commands
        WHERE command_type = 'deploy_video'
          AND status = 'failed'
          AND error_message LIKE '%Checksum is required%'
          AND created_at > NOW() - INTERVAL '1 hour'
        GROUP BY site_id
      `);

      for (const row of checksumRejected.rows) {
        const count = parseInt(row.count, 10);
        if (count < 2) continue;

        const cooldownKey = `deploy_checksum_missing:${row.site_id}`;
        const lastAlert = this.lastAlertTime.get(cooldownKey);
        if (lastAlert) {
          const cooldownEnd = new Date(lastAlert.getTime() + 60 * 60 * 1000);
          if (new Date() < cooldownEnd) continue;
        }

        logger.warn('deploy_video rejected: checksum missing in payload', {
          siteId: row.site_id,
          failedCount: count,
        });

        await this.alertCreator.createAlert({
          siteId: row.site_id,
          type: 'Deploy vidéo sans checksum',
          severity: 'warning',
          message: `${count} deploy_video rejeté(s) en 1h pour checksum manquant — le dashboard utilise peut-être une version obsolète (pré-v3.124.13)`,
          metadata: {
            metric: 'deploy_video_checksum_missing',
            value: count,
          },
        });

        this.lastAlertTime.set(cooldownKey, new Date());
      }
    } catch {
      // Non-bloquant si remote_commands n'existe pas
    }
  }

  /**
   * Détecte et auto-nettoie les sponsors fantômes (noms d'1 caractère).
   */
  async checkPhantomSponsors(): Promise<void> {
    try {
      const phantoms = await query<{ id: string; name: string; site_id: string; site_name: string }>(
        `SELECT ss.id, ss.name, ss.site_id, s.site_name as site_name
         FROM site_sponsors ss
         JOIN sites s ON s.id = ss.site_id
         WHERE LENGTH(TRIM(ss.name)) <= 1
           AND ss.status = 'active'`,
        []
      );

      if (phantoms.rows.length === 0) return;

      for (const phantom of phantoms.rows) {
        await query(
          `UPDATE site_sponsors SET status = 'inactive', metadata = jsonb_set(
             COALESCE(metadata, '{}'), '{auto_deactivated_reason}',
             '"phantom_single_char_name"'
           ) WHERE id = $1`,
          [phantom.id]
        );
      }

      logger.warn('Phantom sponsors auto-deactivated (single-char names)', {
        count: phantoms.rows.length,
        phantoms: phantoms.rows.map(p => ({
          id: p.id,
          name: p.name,
          siteId: p.site_id,
          siteName: p.site_name,
        })),
      });
    } catch (error) {
      if (error instanceof Error && !error.message.includes('does not exist')) {
        logger.error('Error checking phantom sponsors:', error);
      }
    }
  }

  /**
   * Détecte si les CRON d'agrégation n'ont pas tourné depuis >36h, ou si leur
   * dernier run a échoué.
   *
   * Source de vérité = `recurring_schedules.last_run_at` (mis à jour à chaque
   * exécution, même quand 0 row est insérée). On NE regarde PAS l'heure du
   * dernier `calculated_at` des tables `club_daily_stats` / `site_sponsor_daily_stats` :
   * elles ne s'updatent que les jours d'activité, donc un club inactif >36h
   * déclenche un faux positif (incident 2026-05-07 : NLF gymnase, 0 video_plays
   * 03/05+05/05+06/05 → fausse alerte critique).
   */
  async checkAggregationStaleness(): Promise<void> {
    try {
      const staleResult = await query<{
        name: string;
        table_name: string;
        last_run_at: string | null;
        last_run_status: string | null;
        hours_ago: number;
        reason: 'never_run' | 'stale' | 'failed';
      }>(
        `SELECT * FROM (
           SELECT name,
             COALESCE(task_config->>'aggregation_type', name) AS table_name,
             last_run_at::text,
             last_run_status,
             EXTRACT(EPOCH FROM (NOW() - last_run_at)) / 3600 AS hours_ago,
             CASE
               WHEN last_run_at IS NULL THEN 'never_run'
               WHEN last_run_status = 'failed' THEN 'failed'
               ELSE 'stale'
             END AS reason
           FROM recurring_schedules
           WHERE task_type = 'aggregation' AND is_active = true
         ) sub
         WHERE last_run_at IS NULL
            OR last_run_status = 'failed'
            OR hours_ago > 36`,
        []
      );

      // Sentinel: ensure both expected aggregation types are still wired.
      // If the operator deletes/disables both schedules covering club_daily_stats
      // OR site_sponsor_daily_stats, surface it as a separate alert.
      const expectedTables = ['club_daily_stats', 'site_sponsor_daily_stats'];
      const activeTables = await query<{ table_name: string }>(
        `SELECT DISTINCT COALESCE(task_config->>'aggregation_type', name) AS table_name
         FROM recurring_schedules
         WHERE task_type = 'aggregation' AND is_active = true`,
        []
      );
      const activeSet = new Set(activeTables.rows.map(r => r.table_name));
      for (const expected of expectedTables) {
        if (!activeSet.has(expected)) {
          logger.error('Aggregation CRON stale — schedule missing or disabled', {
            table: expected,
          });
          await this.alertCreator.createAlert({
            type: 'aggregation_stale',
            severity: 'critical',
            message: `Aucun schedule actif pour ${expected}. Risque de perte de données après cleanup video_plays.`,
            metadata: { table: expected, reason: 'no_active_schedule' },
          });
        }
      }

      for (const row of staleResult.rows) {
        const hoursAgo = Math.round(row.hours_ago || 999);
        logger.error('Aggregation CRON stale — data loss risk', {
          schedule: row.name,
          table: row.table_name,
          lastRunAt: row.last_run_at,
          lastRunStatus: row.last_run_status,
          hoursAgo,
          reason: row.reason,
        });
        const message =
          row.reason === 'failed'
            ? `Dernier run du CRON "${row.name}" en échec. Risque de perte de données après cleanup video_plays.`
            : row.reason === 'never_run'
            ? `CRON "${row.name}" jamais exécuté. Risque de perte de données après cleanup video_plays.`
            : `CRON "${row.name}" en retard (${hoursAgo}h). Risque de perte de données après cleanup video_plays.`;
        await this.alertCreator.createAlert({
          type: 'aggregation_stale',
          severity: 'critical',
          message,
          metadata: {
            schedule: row.name,
            table: row.table_name,
            hoursAgo,
            lastRunAt: row.last_run_at,
            lastRunStatus: row.last_run_status,
            reason: row.reason,
          },
        });
      }
    } catch (error) {
      if (error instanceof Error && !error.message.includes('does not exist')) {
        logger.error('Error checking aggregation staleness:', error);
      }
    }
  }

  /**
   * Détecte les sites SaaS dont le profil par défaut a une configuration vide.
   */
  async checkEmptySaasProfiles(): Promise<void> {
    try {
      const emptyProfiles = await query<{ site_id: string; site_name: string; profile_id: string; profile_name: string }>(
        `SELECT s.id AS site_id, s.site_name, cp.id AS profile_id, cp.name AS profile_name
         FROM sites s
         JOIN config_profiles cp ON cp.site_id = s.id AND cp.is_default = true
         WHERE s.site_type = 'saas'
           AND (
             cp.configuration IS NULL
             OR cp.configuration = '{}'::jsonb
             OR (
               NOT cp.configuration ? 'sponsors'
               AND NOT cp.configuration ? 'categories'
               AND NOT cp.configuration ? 'timeCategories'
             )
           )`,
        []
      );

      for (const row of emptyProfiles.rows) {
        logger.warn('SaaS site has empty default profile configuration', {
          siteId: row.site_id,
          siteName: row.site_name,
          profileId: row.profile_id,
          profileName: row.profile_name,
        });
        await this.alertCreator.createAlert({
          siteId: row.site_id,
          type: 'saas_empty_profile',
          severity: 'warning',
          message: `Site SaaS "${row.site_name}" a un profil par défaut "${row.profile_name}" avec une configuration vide. Les settings ne seront pas visibles sur la TV.`,
          metadata: { profileId: row.profile_id, profileName: row.profile_name },
        });
      }
    } catch (error) {
      if (error instanceof Error && !error.message.includes('does not exist')) {
        logger.error('Error checking empty SaaS profiles:', error);
      }
    }
  }

  /**
   * Prune stale entries from lastAlertTime (entries older than 24h are useless for cooldowns)
   * Called periodically to prevent unbounded Map growth.
   */
  pruneLastAlertTime(): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let pruned = 0;
    for (const [key, date] of this.lastAlertTime.entries()) {
      if (date < oneDayAgo) {
        this.lastAlertTime.delete(key);
        pruned++;
      }
    }
    // Hard cap as safety net
    if (this.lastAlertTime.size > MAX_LAST_ALERT_TIME_ENTRIES) {
      const excess = this.lastAlertTime.size - MAX_LAST_ALERT_TIME_ENTRIES;
      const iterator = this.lastAlertTime.keys();
      for (let i = 0; i < excess; i++) {
        const key = iterator.next().value;
        if (key) this.lastAlertTime.delete(key);
      }
      pruned += excess;
    }
    if (pruned > 0) {
      logger.debug('Pruned stale lastAlertTime entries', { pruned, remaining: this.lastAlertTime.size });
    }
  }
}
