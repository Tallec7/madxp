/**
 * Service d'alerting avancé avec seuils configurables et escalade
 */

import { query } from '../config/database';
import logger from '../config/logger';
import metricsService from './metrics.service';

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

// Seuils par défaut
const DEFAULT_THRESHOLDS: Omit<AlertThreshold, 'id'>[] = [
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
];

class AlertingService {
  private tableName = 'alerts';
  private thresholdTable = 'alert_thresholds';
  private tableChecked = false;
  private metricHistory: Map<string, MetricSnapshot[]> = new Map();
  private lastAlertTime: Map<string, Date> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

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
   * Évalue une métrique contre les seuils configurés
   */
  async evaluateMetric(siteId: string, metric: string, value: number): Promise<void> {
    const key = `${siteId}:${metric}`;

    // Stocker dans l'historique
    if (!this.metricHistory.has(key)) {
      this.metricHistory.set(key, []);
    }

    const history = this.metricHistory.get(key)!;
    history.push({ siteId, metric, value, timestamp: new Date() });

    // Garder seulement les 10 dernières minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const filtered = history.filter(h => h.timestamp > tenMinutesAgo);
    this.metricHistory.set(key, filtered);

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

    const result = await query<{ id: string; [key: string]: unknown }>(
      `INSERT INTO ${this.tableName}
       (site_id, type, severity, status, message, metadata, threshold_id)
       VALUES ($1, $2, $3, 'active', $4, $5, $6)
       RETURNING id`,
      [
        alert.siteId || null,
        alert.type,
        alert.severity,
        alert.message,
        JSON.stringify(alert.metadata),
        alert.thresholdId || null,
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
       WHERE site_id = $1 AND type = $2 AND status IN ('active', 'acknowledged')
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
      sql += ` AND type = $${paramIndex++}`;
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
    const allowedFields = [
      'name', 'warning_value', 'critical_value', 'duration',
      'enabled', 'cooldown_minutes', 'escalate_after_minutes', 'notify_channels'
    ];

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
      notifyChannels: JSON.parse(row.notify_channels as string || '[]'),
    };
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
    // TODO: Implémenter les différents canaux de notification
    for (const channel of threshold.notifyChannels) {
      switch (channel) {
        case 'email':
          // TODO: Envoyer email
          logger.info('Would send email notification', { threshold: threshold.name, siteId, severity });
          break;
        case 'webhook':
          // TODO: Appeler webhook
          break;
        case 'slack':
          // TODO: Envoyer sur Slack
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

  private startPeriodicCheck(): void {
    // Vérifier l'escalade toutes les minutes
    this.checkInterval = setInterval(async () => {
      await this.checkEscalations();
    }, 60 * 1000);
  }

  private async checkEscalations(): Promise<void> {
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
        await query(
          `UPDATE ${this.tableName} SET status = 'escalated', escalated_at = NOW() WHERE id = $1`,
          [row.id]
        );

        logger.warn('Alert escalated', { alertId: row.id, type: row.type });

        // TODO: Notifier les superviseurs
      }
    } catch (error) {
      logger.error('Error checking escalations:', error);
    }
  }

  private async ensureTables(): Promise<void> {
    if (this.tableChecked) return;

    try {
      // Table des alertes
      await query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
          type VARCHAR(100) NOT NULL,
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
}

export const alertingService = new AlertingService();
export default alertingService;
