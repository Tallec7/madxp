/**
 * Service d'alerting avancé avec seuils configurables et escalade.
 *
 * Responsabilités extraites (ADR-051 Phase 1) :
 * - alerting.types.ts : types, interfaces, DEFAULT_THRESHOLDS
 * - alerting-notifier.service.ts : notifications (email, webhook, Slack)
 * - alerting-checks.service.ts : vérifications périodiques
 */

import { query } from '../config/database';
import logger from '../config/logger';
import metricsService from './metrics.service';
import { dbCircuitBreaker } from './db-circuit-breaker.service';
import { canaryMonitorService } from './canary-monitor.service';
import { alertNotifier } from './alerting-notifier.service';
import { AlertingChecks } from './alerting-checks.service';

// Re-export types for backward compatibility (consumers import from alerting.service)
export type { AlertSeverity, AlertStatus, AlertThreshold, Alert } from './alerting.types';
import type { AlertSeverity, AlertThreshold, Alert, MetricSnapshot } from './alerting.types';
import {
  DEFAULT_THRESHOLDS,
  MAX_METRIC_HISTORY_KEYS,
  MAX_METRIC_HISTORY_PER_KEY,
  MAX_EVENT_ENTRIES_PER_SITE,
  MAX_EVENT_SITES,
} from './alerting.types';

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

  // Delegated periodic checks
  private _checks = new AlertingChecks(
    this,
    this.lastAlertTime,
    this.wsDisconnectEvents,
    this.videoSafetyTimeoutEvents,
  );


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
            message: alertNotifier.formatAlertMessage(threshold, value, severity),
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
    return alertNotifier.notify(threshold, siteId, severity, value);
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
   * Aggregate hourly metrics and feed them into evaluateMetric().
   * Delegated to AlertingChecks.
   */
  async checkHourlyMetrics(): Promise<void> {
    return this._checks.checkHourlyMetrics();
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
      await this._checks.checkStuckDeployments();
      await canaryMonitorService.runChecks();
      // Run hourly metrics check every 5 minutes (every 5th tick)
      if (tickCount % 5 === 0) {
        await this._checks.checkHourlyMetrics();
        this._checks.pruneLastAlertTime();
        await this._checks.checkPhantomSponsors();
        await this._checks.checkAggregationStaleness();
        await this._checks.checkEmptySaasProfiles();
      }
    }, 60 * 1000);
  }

  /**
   * Détecte les déploiements bloqués. Delegated to AlertingChecks.
   */
  async checkStuckDeployments(): Promise<void> {
    return this._checks.checkStuckDeployments();
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
   * Détecte les sites SaaS dont le profil par défaut a une configuration vide.
   * Delegated to AlertingChecks.
   */
  async checkEmptySaasProfiles(): Promise<void> {
    return this._checks.checkEmptySaasProfiles();
  }

}

export const alertingService = new AlertingService();
export default alertingService;
