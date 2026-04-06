/**
 * Service d'alerting avancé avec seuils configurables et escalade
 */

import { query } from '../config/database';
import logger from '../config/logger';
import metricsService from './metrics.service';
import emailService from './email.service';
import { dbCircuitBreaker } from './db-circuit-breaker.service';
import { canaryMonitorService } from './canary-monitor.service';

// Configuration des notifications externes (via variables d'environnement)
const WEBHOOK_URL = process.env.ALERTING_WEBHOOK_URL;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const DASHBOARD_URL = process.env.DASHBOARD_URL;

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'escalated';

export interface AlertThreshold {
  id: string;
  name: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  warningValue: number;
  criticalValue: number;
  duration: number; // Durée en secondes avant déclenchement
  enabled: boolean;
  cooldownMinutes: number; // Temps avant nouvelle alerte sur même métrique
  escalateAfterMinutes: number; // Temps avant escalade
  notifyChannels: string[]; // email, webhook, slack, etc.
}

export interface Alert {
  id: string;
  siteId?: string;
  type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  metadata: Record<string, unknown>;
  thresholdId?: string;
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  escalatedAt?: Date;
}

interface MetricSnapshot {
  siteId?: string;
  metric: string;
  value: number;
  timestamp: Date;
}

// Seuils par défaut (incluant alertes prédictives)
const DEFAULT_THRESHOLDS: Omit<AlertThreshold, 'id'>[] = [
  // === Alertes Réactives (existantes) ===
  {
    name: 'CPU élevé',
    metric: 'cpu_usage',
    condition: 'gt',
    warningValue: 70,
    criticalValue: 90,
    duration: 300, // 5 minutes
    enabled: true,
    cooldownMinutes: 15,
    escalateAfterMinutes: 30,
    notifyChannels: ['email'],
  },
  {
    name: 'Mémoire élevée',
    metric: 'memory_usage',
    condition: 'gt',
    warningValue: 80,
    criticalValue: 95,
    duration: 300,
    enabled: true,
    cooldownMinutes: 15,
    escalateAfterMinutes: 30,
    notifyChannels: ['email'],
  },
  {
    name: 'Température élevée',
    metric: 'temperature',
    condition: 'gt',
    warningValue: 65,
    criticalValue: 80,
    duration: 60, // 1 minute
    enabled: true,
    cooldownMinutes: 10,
    escalateAfterMinutes: 15,
    notifyChannels: ['email'],
  },
  {
    name: 'Disque presque plein',
    metric: 'disk_usage',
    condition: 'gt',
    warningValue: 80,
    criticalValue: 95,
    duration: 0, // Immédiat
    enabled: true,
    cooldownMinutes: 60,
    escalateAfterMinutes: 120,
    notifyChannels: ['email'],
  },
  {
    name: 'Site hors ligne',
    metric: 'site_offline',
    condition: 'eq',
    warningValue: 1,
    criticalValue: 1,
    duration: 300, // 5 minutes de déconnexion
    enabled: true,
    cooldownMinutes: 30,
    escalateAfterMinutes: 60,
    notifyChannels: ['email'],
  },
  {
    name: 'Échec de déploiement',
    metric: 'deployment_failed',
    condition: 'eq',
    warningValue: 1,
    criticalValue: 1,
    duration: 0,
    enabled: true,
    cooldownMinutes: 5,
    escalateAfterMinutes: 30,
    notifyChannels: ['email'],
  },

  // === Alertes Prédictives (nouvelles) ===
  {
    name: '[PRÉD] Inactivité prolongée',
    metric: 'days_since_last_video',
    condition: 'gt',
    warningValue: 7,   // Warning après 7 jours sans vidéo jouée
    criticalValue: 14, // Critical après 14 jours
    duration: 0,
    enabled: true,
    cooldownMinutes: 1440, // 1 jour
    escalateAfterMinutes: 4320, // 3 jours
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Espace disque en baisse',
    metric: 'disk_growth_rate',
    condition: 'gt',
    warningValue: 5,  // +5% par jour = plein dans ~20 jours
    criticalValue: 10, // +10% par jour = plein dans ~10 jours
    duration: 0,
    enabled: true,
    cooldownMinutes: 1440,
    escalateAfterMinutes: 2880,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Déconnexions fréquentes',
    metric: 'disconnections_24h',
    condition: 'gt',
    warningValue: 5,   // >5 déconnexions/jour
    criticalValue: 10, // >10 déconnexions/jour
    duration: 0,
    enabled: true,
    cooldownMinutes: 360, // 6 heures
    escalateAfterMinutes: 720,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Signal WiFi dégradé',
    metric: 'wifi_signal_quality',
    condition: 'lt',
    warningValue: 50,  // <50% de qualité
    criticalValue: 25, // <25% de qualité
    duration: 3600, // 1 heure continue
    enabled: true,
    cooldownMinutes: 720, // 12 heures
    escalateAfterMinutes: 1440,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Erreurs vidéo récurrentes',
    metric: 'video_errors_24h',
    condition: 'gt',
    warningValue: 5,   // >5 erreurs vidéo/jour
    criticalValue: 15, // >15 erreurs vidéo/jour
    duration: 0,
    enabled: true,
    cooldownMinutes: 360,
    escalateAfterMinutes: 720,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Température en hausse',
    metric: 'temperature_trend',
    condition: 'gt',
    warningValue: 5,  // +5°C sur la dernière heure
    criticalValue: 10, // +10°C sur la dernière heure
    duration: 0,
    enabled: true,
    cooldownMinutes: 60,
    escalateAfterMinutes: 120,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Hotspot instable',
    metric: 'hotspot_restarts_24h',
    condition: 'gt',
    warningValue: 2,  // >2 redémarrages hostapd/jour
    criticalValue: 5, // >5 redémarrages/jour
    duration: 0,
    enabled: true,
    cooldownMinutes: 720,
    escalateAfterMinutes: 1440,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Abonnement expire bientôt',
    metric: 'days_until_subscription_end',
    condition: 'lt',
    warningValue: 30, // <30 jours avant expiration
    criticalValue: 7,  // <7 jours avant expiration
    duration: 0,
    enabled: true,
    cooldownMinutes: 1440, // 1 jour
    escalateAfterMinutes: 4320,
    notifyChannels: ['email'],
  },
  {
    name: 'Déploiement bloqué',
    metric: 'deployment_stuck_minutes',
    condition: 'gt',
    warningValue: 30,  // Warning après 30 minutes sans progression
    criticalValue: 60, // Critical après 60 minutes
    duration: 0,       // Immédiat (le check SQL calcule déjà la durée)
    enabled: true,
    cooldownMinutes: 30,
    escalateAfterMinutes: 120,
    notifyChannels: ['email'],
  },
  {
    name: 'Déconnexions WebSocket fréquentes',
    metric: 'websocket_disconnects_1h',
    condition: 'gt',
    warningValue: 10,  // >10 déconnexions en 1 heure
    criticalValue: 30, // >30 déconnexions en 1 heure
    duration: 0,
    enabled: true,
    cooldownMinutes: 60,
    escalateAfterMinutes: 180,
    notifyChannels: ['email'],
  },
  {
    name: 'Trous noirs vidéo (safety timeouts)',
    metric: 'video_safety_timeouts_1h',
    condition: 'gt',
    warningValue: 3,  // >3 safety timeouts en 1 heure
    criticalValue: 10, // >10 safety timeouts en 1 heure
    duration: 0,
    enabled: true,
    cooldownMinutes: 60,
    escalateAfterMinutes: 180,
    notifyChannels: ['email'],
  },
  {
    name: 'Crash kiosk Chromium',
    metric: 'kiosk_crashes_1h',
    condition: 'gt',
    warningValue: 1,  // >1 crash en 1 heure
    criticalValue: 3, // >3 crashes en 1 heure
    duration: 0,
    enabled: true,
    cooldownMinutes: 30,
    escalateAfterMinutes: 60,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Références vidéo orphelines',
    metric: 'orphaned_video_references',
    condition: 'gt',
    warningValue: 1,   // Warning dès 1 vidéo orpheline
    criticalValue: 5,  // Critical si 5+ vidéos orphelines
    duration: 0,
    enabled: true,
    cooldownMinutes: 1440, // 1 jour
    escalateAfterMinutes: 4320, // 3 jours
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Site mesh sans Ethernet',
    metric: 'mesh_without_ethernet',
    condition: 'eq',
    warningValue: 1,
    criticalValue: 1,
    duration: 0,
    enabled: true,
    cooldownMinutes: 1440, // 1 jour — ne spammer pas
    escalateAfterMinutes: 4320, // 3 jours
    notifyChannels: ['email'],
  },
];

// Memory safety limits for in-memory Maps (Railway Hobby plan: 256MB heap)
const MAX_METRIC_HISTORY_KEYS = 200; // Max unique siteId:metric combinations
const MAX_METRIC_HISTORY_PER_KEY = 60; // Max snapshots per key (~10min at 10s intervals)
const MAX_LAST_ALERT_TIME_ENTRIES = 500; // Max cooldown entries
const MAX_EVENT_ENTRIES_PER_SITE = 200; // Max timestamps per site for disconnect/timeout events
const MAX_EVENT_SITES = 100; // Max sites tracked for disconnect/timeout events

class AlertingService {
  private tableName = 'alerts';
  private thresholdTable = 'alert_thresholds';
  private tableChecked = false;
  private metricHistory: Map<string, MetricSnapshot[]> = new Map();
  private lastAlertTime: Map<string, Date> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  // In-memory hourly counters for metrics not stored per-site in DB
  // Key: siteId, Value: array of timestamps for each event
  private wsDisconnectEvents: Map<string, number[]> = new Map();
  private videoSafetyTimeoutEvents: Map<string, number[]> = new Map();

  /**
   * Initialise le service d'alerting
   */
  async initialize(): Promise<void> {
    await this.ensureTables();
    await this.loadDefaultThresholds();
    this.startPeriodicCheck();
    logger.info('Alerting service initialized');
  }

  /**
   * Record a WebSocket disconnect event for a site (in-memory, for hourly aggregation).
   */
  recordDisconnectEvent(siteId: string): void {
    if (!this.wsDisconnectEvents.has(siteId)) {
      // Evict oldest site if map is full
      if (this.wsDisconnectEvents.size >= MAX_EVENT_SITES) {
        const oldestKey = this.wsDisconnectEvents.keys().next().value;
        if (oldestKey) this.wsDisconnectEvents.delete(oldestKey);
      }
      this.wsDisconnectEvents.set(siteId, []);
    }
    const events = this.wsDisconnectEvents.get(siteId)!;
    events.push(Date.now());
    // Hard cap per site to prevent unbounded growth
    if (events.length > MAX_EVENT_ENTRIES_PER_SITE) {
      this.wsDisconnectEvents.set(siteId, events.slice(-MAX_EVENT_ENTRIES_PER_SITE));
    }
  }

  /**
   * Record video safety timeout events for a site (in-memory, for hourly aggregation).
   * Called from heartbeat handler when transitionMetrics.safetyTimeoutCount > 0.
   */
  recordVideoSafetyTimeouts(siteId: string, count: number): void {
    if (count <= 0) return;
    if (!this.videoSafetyTimeoutEvents.has(siteId)) {
      // Evict oldest site if map is full
      if (this.videoSafetyTimeoutEvents.size >= MAX_EVENT_SITES) {
        const oldestKey = this.videoSafetyTimeoutEvents.keys().next().value;
        if (oldestKey) this.videoSafetyTimeoutEvents.delete(oldestKey);
      }
      this.videoSafetyTimeoutEvents.set(siteId, []);
    }
    const events = this.videoSafetyTimeoutEvents.get(siteId)!;
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      events.push(now);
    }
    // Hard cap per site to prevent unbounded growth
    if (events.length > MAX_EVENT_ENTRIES_PER_SITE) {
      this.videoSafetyTimeoutEvents.set(siteId, events.slice(-MAX_EVENT_ENTRIES_PER_SITE));
    }
  }

  /**
   * Évalue une métrique contre les seuils configurés
   */
  async evaluateMetric(siteId: string, metric: string, value: number): Promise<void> {
    const key = `${siteId}:${metric}`;

    // Stocker dans l'historique
    if (!this.metricHistory.has(key)) {
      // Evict oldest key if map is full
      if (this.metricHistory.size >= MAX_METRIC_HISTORY_KEYS) {
        const oldestKey = this.metricHistory.keys().next().value;
        if (oldestKey) this.metricHistory.delete(oldestKey);
      }
      this.metricHistory.set(key, []);
    }

    const history = this.metricHistory.get(key)!;
    history.push({ siteId, metric, value, timestamp: new Date() });

    // Garder seulement les 10 dernières minutes + hard cap
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const filtered = history.filter(h => h.timestamp > tenMinutesAgo);
    this.metricHistory.set(key, filtered.length > MAX_METRIC_HISTORY_PER_KEY
      ? filtered.slice(-MAX_METRIC_HISTORY_PER_KEY)
      : filtered);

    // Récupérer les seuils pour cette métrique
    const thresholds = await this.getThresholdsByMetric(metric);

    for (const threshold of thresholds) {
      if (!threshold.enabled) continue;

      // Vérifier le cooldown
      const cooldownKey = `${siteId}:${threshold.id}`;
      const lastAlert = this.lastAlertTime.get(cooldownKey);
      if (lastAlert) {
        const cooldownEnd = new Date(lastAlert.getTime() + threshold.cooldownMinutes * 60 * 1000);
        if (new Date() < cooldownEnd) continue;
      }

      // Vérifier si la condition est remplie sur la durée
      const violationStart = this.checkThresholdViolation(filtered, threshold);

      if (violationStart) {
        const durationMs = Date.now() - violationStart.getTime();
        const durationSeconds = durationMs / 1000;

        if (durationSeconds >= threshold.duration) {
          // Déterminer la sévérité
          const severity = this.determineSeverity(value, threshold);

          // Créer l'alerte
          await this.createAlert({
            siteId,
            type: threshold.name,
            severity,
            message: this.formatAlertMessage(threshold, value, severity),
            metadata: { metric, value, threshold: threshold.id },
            thresholdId: threshold.id,
          });

          // Marquer le temps de dernière alerte
          this.lastAlertTime.set(cooldownKey, new Date());

          // Notifier
          await this.notify(threshold, siteId, severity, value);
        }
      }
    }
  }

  /**
   * Crée une alerte
   */
  async createAlert(alert: Omit<Alert, 'id' | 'status' | 'createdAt'>): Promise<string> {
    await this.ensureTables();

    // NOTE: threshold_id n'existe pas dans la table alerts en production
    // On l'omet de l'INSERT pour éviter les erreurs
    const result = await query<{ id: string; [key: string]: unknown }>(
      `INSERT INTO ${this.tableName}
       (site_id, alert_type, severity, status, message, metadata)
       VALUES ($1, $2, $3, 'active', $4, $5)
       RETURNING id`,
      [
        alert.siteId || null,
        alert.type,
        alert.severity,
        alert.message,
        JSON.stringify(alert.metadata),
      ]
    );

    const alertId = result.rows[0].id;

    // Mettre à jour les métriques
    metricsService.recordAlert(alert.severity, alert.type);
    await this.updateActiveAlertsMetrics();

    logger.warn('Alert created', {
      id: alertId,
      type: alert.type,
      severity: alert.severity,
      siteId: alert.siteId,
    });

    return alertId;
  }

  /**
   * Acquitte une alerte
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    await query(
      `UPDATE ${this.tableName}
       SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $1
       WHERE id = $2 AND status = 'active'`,
      [userId, alertId]
    );

    await this.updateActiveAlertsMetrics();
    logger.info('Alert acknowledged', { alertId, userId });
  }

  /**
   * Résout une alerte
   */
  async resolveAlert(alertId: string): Promise<void> {
    await query(
      `UPDATE ${this.tableName}
       SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1 AND status IN ('active', 'acknowledged', 'escalated')`,
      [alertId]
    );

    await this.updateActiveAlertsMetrics();
    logger.info('Alert resolved', { alertId });
  }

  /**
   * Résout toutes les alertes actives d'un site pour un type donné
   */
  async resolveAlertsBySiteAndType(siteId: string, type: string): Promise<number> {
    const result = await query(
      `UPDATE ${this.tableName}
       SET status = 'resolved', resolved_at = NOW()
       WHERE site_id = $1 AND alert_type = $2 AND status IN ('active', 'acknowledged')
       RETURNING id`,
      [siteId, type]
    );

    if (result.rows.length > 0) {
      await this.updateActiveAlertsMetrics();
      logger.info('Alerts resolved', { siteId, type, count: result.rows.length });
    }

    return result.rows.length;
  }

  /**
   * Récupère les alertes actives
   */
  async getActiveAlerts(filters?: {
    siteId?: string;
    severity?: AlertSeverity;
    type?: string;
  }): Promise<Alert[]> {
    let sql = `
      SELECT * FROM ${this.tableName}
      WHERE status IN ('active', 'acknowledged', 'escalated')
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.siteId) {
      sql += ` AND site_id = $${paramIndex++}`;
      params.push(filters.siteId);
    }
    if (filters?.severity) {
      sql += ` AND severity = $${paramIndex++}`;
      params.push(filters.severity);
    }
    if (filters?.type) {
      sql += ` AND alert_type = $${paramIndex++}`;
      params.push(filters.type);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);
    return result.rows as unknown as Alert[];
  }

  /**
   * Récupère les seuils d'alerte configurés
   */
  async getThresholds(): Promise<AlertThreshold[]> {
    const result = await query(`SELECT * FROM ${this.thresholdTable} ORDER BY name`);
    return result.rows.map(row => this.mapThresholdRow(row));
  }

  /**
   * Met à jour un seuil d'alerte
   */
  async updateThreshold(id: string, updates: Partial<AlertThreshold>): Promise<void> {
    // Champs autorisés pour la mise à jour (validation implicite via les conditions if ci-dessous)
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.name) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }
    if (updates.warningValue !== undefined) {
      setClauses.push(`warning_value = $${paramIndex++}`);
      params.push(updates.warningValue);
    }
    if (updates.criticalValue !== undefined) {
      setClauses.push(`critical_value = $${paramIndex++}`);
      params.push(updates.criticalValue);
    }
    if (updates.duration !== undefined) {
      setClauses.push(`duration = $${paramIndex++}`);
      params.push(updates.duration);
    }
    if (updates.enabled !== undefined) {
      setClauses.push(`enabled = $${paramIndex++}`);
      params.push(updates.enabled);
    }
    if (updates.cooldownMinutes !== undefined) {
      setClauses.push(`cooldown_minutes = $${paramIndex++}`);
      params.push(updates.cooldownMinutes);
    }
    if (updates.escalateAfterMinutes !== undefined) {
      setClauses.push(`escalate_after_minutes = $${paramIndex++}`);
      params.push(updates.escalateAfterMinutes);
    }
    if (updates.notifyChannels) {
      setClauses.push(`notify_channels = $${paramIndex++}`);
      params.push(JSON.stringify(updates.notifyChannels));
    }

    if (setClauses.length === 0) return;

    params.push(id);
    await query(
      `UPDATE ${this.thresholdTable} SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      params
    );

    logger.info('Threshold updated', { id, updates });
  }

  // ============= Private methods =============

  private async getThresholdsByMetric(metric: string): Promise<AlertThreshold[]> {
    const result = await query(
      `SELECT * FROM ${this.thresholdTable} WHERE metric = $1 AND enabled = true`,
      [metric]
    );
    return result.rows.map(row => this.mapThresholdRow(row));
  }

  private mapThresholdRow(row: Record<string, unknown>): AlertThreshold {
    return {
      id: row.id as string,
      name: row.name as string,
      metric: row.metric as string,
      condition: row.condition as AlertThreshold['condition'],
      warningValue: row.warning_value as number,
      criticalValue: row.critical_value as number,
      duration: row.duration as number,
      enabled: row.enabled as boolean,
      cooldownMinutes: row.cooldown_minutes as number,
      escalateAfterMinutes: row.escalate_after_minutes as number,
      notifyChannels: this.parseNotifyChannels(row.notify_channels),
    };
  }

  private parseNotifyChannels(value: unknown): string[] {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [String(parsed)];
      } catch {
        return [value];
      }
    }
    return [];
  }

  private checkThresholdViolation(
    history: MetricSnapshot[],
    threshold: AlertThreshold
  ): Date | null {
    if (history.length === 0) return null;

    // Trouver le début de la violation
    let violationStart: Date | null = null;

    for (const snapshot of history) {
      const isViolating = this.evaluateCondition(snapshot.value, threshold);

      if (isViolating) {
        if (!violationStart) {
          violationStart = snapshot.timestamp;
        }
      } else {
        violationStart = null;
      }
    }

    return violationStart;
  }

  private evaluateCondition(value: number, threshold: AlertThreshold): boolean {
    const checkValue = Math.max(threshold.warningValue, threshold.criticalValue);

    switch (threshold.condition) {
      case 'gt': return value > checkValue;
      case 'lt': return value < checkValue;
      case 'eq': return value === checkValue;
      case 'gte': return value >= checkValue;
      case 'lte': return value <= checkValue;
      default: return false;
    }
  }

  private determineSeverity(value: number, threshold: AlertThreshold): AlertSeverity {
    const isCritical = threshold.condition === 'gt' || threshold.condition === 'gte'
      ? value >= threshold.criticalValue
      : value <= threshold.criticalValue;

    return isCritical ? 'critical' : 'warning';
  }

  private formatAlertMessage(threshold: AlertThreshold, value: number, severity: AlertSeverity): string {
    const severityLabel = severity === 'critical' ? 'CRITIQUE' : 'Avertissement';
    return `${severityLabel}: ${threshold.name} - Valeur actuelle: ${value.toFixed(1)} (seuil: ${severity === 'critical' ? threshold.criticalValue : threshold.warningValue})`;
  }

  private async notify(
    threshold: AlertThreshold,
    siteId: string,
    severity: AlertSeverity,
    value: number
  ): Promise<void> {
    // Recuperer les informations du site
    let siteName = 'Site inconnu';
    try {
      const siteResult = await query(
        'SELECT site_name FROM sites WHERE id = $1',
        [siteId]
      );
      if (siteResult.rows.length > 0) {
        siteName = siteResult.rows[0].site_name as string;
      }
    } catch {
      // Ignorer les erreurs de recuperation du nom du site
    }

    // Recuperer les emails des admins pour les notifications
    let adminEmails: string[] = [];
    try {
      const usersResult = await query(
        "SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL"
      );
      adminEmails = usersResult.rows.map(r => r.email as string);
    } catch {
      // Ignorer les erreurs
    }

    for (const channel of threshold.notifyChannels) {
      switch (channel) {
        case 'email':
          if (adminEmails.length > 0 && emailService.isEnabled()) {
            await emailService.sendAlertNotification(adminEmails, {
              siteName,
              siteId,
              alertType: threshold.name,
              severity,
              message: this.formatAlertMessage(threshold, value, severity),
              timestamp: new Date(),
              dashboardUrl: process.env.DASHBOARD_URL ? `${process.env.DASHBOARD_URL}/sites/${siteId}` : undefined,
            });
          } else {
            logger.debug('Email notification skipped (no recipients or service disabled)', {
              threshold: threshold.name,
              siteId,
              severity,
              emailEnabled: emailService.isEnabled(),
              adminCount: adminEmails.length,
            });
          }
          break;
        case 'webhook':
          await this.sendWebhookNotification({
            siteName,
            siteId,
            alertType: threshold.name,
            severity,
            message: this.formatAlertMessage(threshold, value, severity),
            metric: threshold.metric,
            value,
            timestamp: new Date(),
          });
          break;
        case 'slack':
          await this.sendSlackNotification({
            siteName,
            siteId,
            alertType: threshold.name,
            severity,
            message: this.formatAlertMessage(threshold, value, severity),
            timestamp: new Date(),
          });
          break;
      }
    }
  }

  private async updateActiveAlertsMetrics(): Promise<void> {
    const result = await query(`
      SELECT severity, COUNT(*) as count
      FROM ${this.tableName}
      WHERE status IN ('active', 'acknowledged', 'escalated')
      GROUP BY severity
    `);

    for (const row of result.rows) {
      metricsService.recordActiveAlerts(row.severity as string, parseInt(row.count as string, 10));
    }
  }

  /**
   * Envoie une notification via webhook HTTP POST
   */
  private async sendWebhookNotification(data: {
    siteName: string;
    siteId: string;
    alertType: string;
    severity: AlertSeverity;
    message: string;
    metric: string;
    value: number;
    timestamp: Date;
  }): Promise<void> {
    if (!WEBHOOK_URL) {
      logger.debug('Webhook notification skipped (ALERTING_WEBHOOK_URL not configured)');
      return;
    }

    try {
      const payload = {
        event: 'alert',
        site: {
          id: data.siteId,
          name: data.siteName,
        },
        alert: {
          type: data.alertType,
          severity: data.severity,
          message: data.message,
          metric: data.metric,
          value: data.value,
        },
        timestamp: data.timestamp.toISOString(),
        dashboardUrl: DASHBOARD_URL ? `${DASHBOARD_URL}/sites/${data.siteId}` : undefined,
      };

      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'NEOPRO-Alerting/1.0',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
      }

      logger.info('Webhook notification sent', {
        alertType: data.alertType,
        siteId: data.siteId,
        severity: data.severity,
      });
    } catch (error) {
      logger.error('Failed to send webhook notification', {
        error: error instanceof Error ? error.message : error,
        alertType: data.alertType,
        siteId: data.siteId,
      });
    }
  }

  /**
   * Envoie une notification sur Slack via Incoming Webhook
   */
  private async sendSlackNotification(data: {
    siteName: string;
    siteId: string;
    alertType: string;
    severity: AlertSeverity;
    message: string;
    timestamp: Date;
  }): Promise<void> {
    if (!SLACK_WEBHOOK_URL) {
      logger.debug('Slack notification skipped (SLACK_WEBHOOK_URL not configured)');
      return;
    }

    try {
      // Couleur selon sévérité (Slack Block Kit)
      const colorMap: Record<AlertSeverity, string> = {
        info: '#36a64f',      // vert
        warning: '#ff9800',   // orange
        critical: '#f44336',  // rouge
      };

      const emojiMap: Record<AlertSeverity, string> = {
        info: 'ℹ️',
        warning: '⚠️',
        critical: '🚨',
      };

      const payload = {
        attachments: [
          {
            color: colorMap[data.severity],
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: `${emojiMap[data.severity]} Alerte NEOPRO - ${data.alertType}`,
                  emoji: true,
                },
              },
              {
                type: 'section',
                fields: [
                  {
                    type: 'mrkdwn',
                    text: `*Site:*\n${data.siteName}`,
                  },
                  {
                    type: 'mrkdwn',
                    text: `*Sévérité:*\n${data.severity.toUpperCase()}`,
                  },
                ],
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Message:*\n${data.message}`,
                },
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `📅 ${data.timestamp.toLocaleString('fr-FR')}`,
                  },
                ],
              },
            ],
          },
        ],
      };

      // Ajouter le bouton dashboard si configuré
      if (DASHBOARD_URL) {
        payload.attachments[0].blocks.push({
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📊 Voir le dashboard',
                emoji: true,
              },
              url: `${DASHBOARD_URL}/sites/${data.siteId}`,
              style: 'primary',
            },
          ],
        } as any);
      }

      const response = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook returned ${response.status}: ${response.statusText}`);
      }

      logger.info('Slack notification sent', {
        alertType: data.alertType,
        siteId: data.siteId,
        severity: data.severity,
      });
    } catch (error) {
      logger.error('Failed to send Slack notification', {
        error: error instanceof Error ? error.message : error,
        alertType: data.alertType,
        siteId: data.siteId,
      });
    }
  }

  /**
   * Notifie les superviseurs lors d'une escalade d'alerte
   */
  private async notifySupervisors(alertData: {
    alertId: string;
    siteId: string;
    type: string;
    severity: string;
    message: string;
    createdAt: Date;
    escalatedAt: Date;
  }): Promise<void> {
    try {
      // Récupérer le nom du site
      let siteName = 'Site inconnu';
      try {
        const siteResult = await query('SELECT site_name FROM sites WHERE id = $1', [alertData.siteId]);
        if (siteResult.rows.length > 0) {
          siteName = siteResult.rows[0].site_name as string;
        }
      } catch {
        // Ignorer
      }

      // Récupérer les emails des superviseurs et admins
      const supervisorResult = await query(
        "SELECT email FROM users WHERE role IN ('admin', 'supervisor') AND email IS NOT NULL"
      );
      const supervisorEmails = supervisorResult.rows.map(r => r.email as string);

      if (supervisorEmails.length === 0) {
        logger.warn('No supervisors to notify for escalation', { alertId: alertData.alertId });
        return;
      }

      // Envoyer email aux superviseurs
      if (emailService.isEnabled()) {
        await emailService.sendAlertNotification(supervisorEmails, {
          siteName,
          siteId: alertData.siteId,
          alertType: `[ESCALADE] ${alertData.type}`,
          severity: alertData.severity as AlertSeverity,
          message: `Cette alerte a été escaladée car non traitée depuis ${Math.round((alertData.escalatedAt.getTime() - alertData.createdAt.getTime()) / 60000)} minutes.\n\n${alertData.message}`,
          timestamp: alertData.escalatedAt,
          dashboardUrl: DASHBOARD_URL ? `${DASHBOARD_URL}/sites/${alertData.siteId}` : undefined,
        });

        logger.info('Supervisor escalation notification sent', {
          alertId: alertData.alertId,
          recipientCount: supervisorEmails.length,
        });
      }

      // Également envoyer sur Slack si configuré (escalades importantes)
      if (SLACK_WEBHOOK_URL) {
        await this.sendSlackNotification({
          siteName,
          siteId: alertData.siteId,
          alertType: `🔺 ESCALADE: ${alertData.type}`,
          severity: 'critical', // Les escalades sont toujours critiques
          message: `Alerte non traitée depuis ${Math.round((alertData.escalatedAt.getTime() - alertData.createdAt.getTime()) / 60000)} minutes. Action requise immédiatement.`,
          timestamp: alertData.escalatedAt,
        });
      }
    } catch (error) {
      logger.error('Failed to notify supervisors for escalation', {
        alertId: alertData.alertId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Aggregate hourly metrics and feed them into evaluateMetric().
   * - websocket_disconnects_1h: from in-memory disconnect events
   * - video_safety_timeouts_1h: from in-memory safety timeout events
   * - kiosk_crashes_1h: from alerts table (alert_type = 'kiosk_crash')
   *
   * Runs every 5 minutes to balance responsiveness vs DB load.
   */
  async checkHourlyMetrics(): Promise<void> {
    try {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      // 1. WebSocket disconnects (in-memory) — prune old events and evaluate
      for (const [siteId, events] of this.wsDisconnectEvents.entries()) {
        const recentEvents = events.filter(ts => ts > oneHourAgo);
        this.wsDisconnectEvents.set(siteId, recentEvents);
        if (recentEvents.length > 0) {
          await this.evaluateMetric(siteId, 'websocket_disconnects_1h', recentEvents.length);
        }
      }

      // 2. Video safety timeouts (in-memory) — prune old events and evaluate
      for (const [siteId, events] of this.videoSafetyTimeoutEvents.entries()) {
        const recentEvents = events.filter(ts => ts > oneHourAgo);
        this.videoSafetyTimeoutEvents.set(siteId, recentEvents);
        if (recentEvents.length > 0) {
          await this.evaluateMetric(siteId, 'video_safety_timeouts_1h', recentEvents.length);
        }
      }

      // 3. Kiosk crashes (from alerts table) — already stored by heartbeat handler
      const kioskCrashes = await query<{ site_id: string; crash_count: number }>(
        `SELECT site_id, COUNT(*) AS crash_count
         FROM alerts
         WHERE alert_type = 'kiosk_crash'
           AND created_at > NOW() - INTERVAL '1 hour'
         GROUP BY site_id`
      );

      for (const row of kioskCrashes.rows) {
        await this.evaluateMetric(row.site_id, 'kiosk_crashes_1h', Number(row.crash_count));
      }
    } catch (error) {
      // Don't crash the periodic loop if tables don't exist yet
      if (error instanceof Error && error.message.includes('alerts')) {
        return;
      }
      logger.error('Error checking hourly metrics:', error);
    }
  }

  private startPeriodicCheck(): void {
    // Vérifier l'escalade et les déploiements bloqués toutes les minutes
    // Vérifier les métriques horaires toutes les 5 minutes
    let tickCount = 0;
    this.checkInterval = setInterval(async () => {
      // Skip all periodic checks if DB is unavailable — prevents pile-up
      if (!dbCircuitBreaker.isAvailable()) {
        return;
      }
      tickCount++;
      await this.checkEscalations();
      await this.checkStuckDeployments();
      await canaryMonitorService.runChecks();
      // Run hourly metrics check every 5 minutes (every 5th tick)
      if (tickCount % 5 === 0) {
        await this.checkHourlyMetrics();
        this.pruneLastAlertTime();
        await this.checkPhantomSponsors();
        await this.checkAggregationStaleness();
        await this.checkEmptySaasProfiles();
      }
    }, 60 * 1000);
  }

  /**
   * Détecte les déploiements bloqués en in_progress depuis plus de 30 minutes.
   * Vérifie à la fois content_deployments (vidéos) et update_deployments (OTA).
   * Crée une alerte via createAlert() pour chaque déploiement coincé.
   */
  async checkStuckDeployments(): Promise<void> {
    try {
      // Defense-in-depth: auto-complete SaaS content deployments stuck in_progress
      // (pre-v3.127.5 deployments or edge cases where a SaaS deployment slipped through)
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
      // (Socket.IO fire-and-forget can lose the completed:true signal)
      // Exclut les sites SaaS (déjà traités au-dessus)
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

      // Chercher les déploiements content bloqués (progress < 100)
      // Exclut les sites SaaS qui n'ont pas de Pi (leurs déploiements sont complétés immédiatement)
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

      // Chercher les déploiements OTA bloqués
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
        // Cooldown par deployment ID pour éviter le spam
        const cooldownKey = `deployment_stuck:${stuck.deploymentId}`;
        const lastAlert = this.lastAlertTime.get(cooldownKey);
        if (lastAlert) {
          const cooldownEnd = new Date(lastAlert.getTime() + 30 * 60 * 1000);
          if (new Date() < cooldownEnd) continue;
        }

        const severity: AlertSeverity = stuck.minutesStuck >= 60 ? 'critical' : 'warning';
        const typeLabel = stuck.type === 'update' ? 'mise à jour logicielle' : 'vidéo';
        const versionInfo = stuck.version ? ` v${stuck.version}` : '';

        await this.createAlert({
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

        // Auto-fail update deployments stuck for >2 hours (Pi never responded)
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
      // Ne pas faire planter le check périodique si les tables n'existent pas encore
      if (error instanceof Error && (
        error.message.includes('content_deployments') ||
        error.message.includes('update_deployments')
      )) {
        return;
      }
      logger.error('Error checking stuck deployments:', error);
    }

    // Détecter les deploy_video rejetés par le Pi pour "Checksum is required"
    // Cela signifie qu'un client envoie deploy_video sans checksum (bug dashboard pré-v3.124.13)
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
        if (count < 2) continue; // Ignore single failures

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

        await this.createAlert({
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

  private async checkEscalations(): Promise<void> {
    // DÉSACTIVÉ: La table alerts en production n'a pas de colonne threshold_id
    // Cette fonctionnalité d'escalade nécessite une migration DB pour être activée
    // Pour l'instant, on skip silencieusement pour éviter les erreurs toutes les minutes
    return;

    /*
    try {
      // Récupérer les alertes actives qui doivent être escaladées
      const result = await query(`
        SELECT a.*, t.escalate_after_minutes
        FROM ${this.tableName} a
        JOIN ${this.thresholdTable} t ON a.threshold_id = t.id
        WHERE a.status = 'active'
          AND a.created_at < NOW() - (t.escalate_after_minutes || ' minutes')::interval
      `);

      for (const row of result.rows) {
        const escalatedAt = new Date();
        await query(
          `UPDATE ${this.tableName} SET status = 'escalated', escalated_at = $2 WHERE id = $1`,
          [row.id, escalatedAt]
        );

        logger.warn('Alert escalated', { alertId: row.id, type: row.alert_type });

        // Notifier les superviseurs
        await this.notifySupervisors({
          alertId: row.id as string,
          siteId: row.site_id as string,
          type: row.alert_type as string,
          severity: row.severity as string,
          message: row.message as string,
          createdAt: new Date(row.created_at as string),
          escalatedAt,
        });
      }
    } catch (error) {
      logger.error('Error checking escalations:', error);
    }
    */
  }

  private async ensureTables(): Promise<void> {
    if (this.tableChecked) return;

    try {
      // Table des alertes - alignée sur full-schema.sql (alert_type au lieu de type)
      await query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
          alert_type VARCHAR(100) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          status VARCHAR(20) DEFAULT 'active',
          message TEXT,
          metadata JSONB,
          threshold_id UUID,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          acknowledged_at TIMESTAMPTZ,
          acknowledged_by UUID REFERENCES users(id),
          resolved_at TIMESTAMPTZ,
          escalated_at TIMESTAMPTZ
        )
      `);

      // Table des seuils
      await query(`
        CREATE TABLE IF NOT EXISTS ${this.thresholdTable} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          metric VARCHAR(50) NOT NULL,
          condition VARCHAR(10) NOT NULL,
          warning_value NUMERIC NOT NULL,
          critical_value NUMERIC NOT NULL,
          duration INTEGER DEFAULT 0,
          enabled BOOLEAN DEFAULT true,
          cooldown_minutes INTEGER DEFAULT 15,
          escalate_after_minutes INTEGER DEFAULT 60,
          notify_channels JSONB DEFAULT '["email"]',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Index
      await query(`CREATE INDEX IF NOT EXISTS idx_alerts_status ON ${this.tableName}(status)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_alerts_site ON ${this.tableName}(site_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_thresholds_metric ON ${this.thresholdTable}(metric)`);

      this.tableChecked = true;
    } catch (error) {
      logger.error('Failed to create alerting tables:', error);
    }
  }

  private async loadDefaultThresholds(): Promise<void> {
    const existing = await query(`SELECT metric FROM ${this.thresholdTable}`);
    const existingMetrics = new Set(existing.rows.map(r => r.metric));

    for (const threshold of DEFAULT_THRESHOLDS) {
      if (!existingMetrics.has(threshold.metric)) {
        await query(
          `INSERT INTO ${this.thresholdTable}
           (name, metric, condition, warning_value, critical_value, duration, enabled, cooldown_minutes, escalate_after_minutes, notify_channels)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            threshold.name,
            threshold.metric,
            threshold.condition,
            threshold.warningValue,
            threshold.criticalValue,
            threshold.duration,
            threshold.enabled,
            threshold.cooldownMinutes,
            threshold.escalateAfterMinutes,
            JSON.stringify(threshold.notifyChannels),
          ]
        );
      }
    }
  }

  /**
   * Nettoyage à l'arrêt
   */
  cleanup(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  /**
   * Nettoie le cache mémoire (appelé lors de pression mémoire)
   */
  clearMemoryCache(): void {
    const historySize = this.metricHistory.size;
    const alertTimeSize = this.lastAlertTime.size;
    const wsSize = this.wsDisconnectEvents.size;
    const videoSize = this.videoSafetyTimeoutEvents.size;
    this.metricHistory.clear();
    this.lastAlertTime.clear();
    this.wsDisconnectEvents.clear();
    this.videoSafetyTimeoutEvents.clear();
    logger.info('Alerting service memory cache cleared', {
      clearedHistoryEntries: historySize,
      clearedAlertTimeEntries: alertTimeSize,
      clearedWsDisconnectEntries: wsSize,
      clearedVideoTimeoutEntries: videoSize,
    });
  }

  /**
   * Détecte et auto-nettoie les sponsors fantômes (noms d'1 caractère).
   * Ces sponsors sont des artefacts du bug de réconciliation loopVideos
   * (owner='club' sans marqueur sponsor → auto-création parasite).
   * Exécuté toutes les 5 minutes dans le periodic loop.
   */
  private async checkPhantomSponsors(): Promise<void> {
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

      // Auto-deactivate phantom sponsors (don't delete — keep audit trail)
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
      // Non-fatal — don't crash the periodic loop
      if (error instanceof Error && !error.message.includes('does not exist')) {
        logger.error('Error checking phantom sponsors:', error);
      }
    }
  }

  /**
   * Détecte si les agrégations CRON (club_daily_stats, advertiser_daily_stats,
   * site_sponsor_daily_stats) n'ont pas tourné depuis >36h.
   * Sans agrégation, les données du jour sont perdues après le cleanup video_plays (15j).
   */
  private async checkAggregationStaleness(): Promise<void> {
    try {
      const staleResult = await query<{ table_name: string; last_calculated: string; hours_ago: number }>(
        `SELECT table_name, last_calculated::text, hours_ago FROM (
           SELECT 'club_daily_stats' AS table_name,
             MAX(calculated_at) AS last_calculated,
             EXTRACT(EPOCH FROM (NOW() - MAX(calculated_at))) / 3600 AS hours_ago
           FROM club_daily_stats
           UNION ALL
           SELECT 'site_sponsor_daily_stats',
             MAX(calculated_at),
             EXTRACT(EPOCH FROM (NOW() - MAX(calculated_at))) / 3600
           FROM site_sponsor_daily_stats
         ) sub
         WHERE hours_ago > 36 OR last_calculated IS NULL`,
        []
      );

      for (const row of staleResult.rows) {
        const hoursAgo = Math.round(row.hours_ago || 999);
        logger.error('Aggregation CRON stale — data loss risk', {
          table: row.table_name,
          lastCalculated: row.last_calculated,
          hoursAgo,
        });
        await this.createAlert({
          type: 'aggregation_stale',
          severity: 'critical',
          message: `Agrégation ${row.table_name} en retard (${hoursAgo}h). Risque de perte de données après cleanup video_plays.`,
          metadata: { table: row.table_name, hoursAgo, lastCalculated: row.last_calculated },
        });
      }
    } catch (error) {
      // Non-fatal — tables might not exist yet
      if (error instanceof Error && !error.message.includes('does not exist')) {
        logger.error('Error checking aggregation staleness:', error);
      }
    }
  }

  /**
   * Détecte les sites SaaS dont le profil par défaut a une configuration vide.
   * Symptôme : settings sauvegardés dans local_config_mirror au lieu de config_profiles,
   * ou profil créé mais jamais configuré.
   * Exécuté toutes les 5 minutes dans le periodic loop.
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
        await this.createAlert({
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
  private pruneLastAlertTime(): void {
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

export const alertingService = new AlertingService();
export default alertingService;
