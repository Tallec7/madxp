import logger from '../config/logger';

interface SlackMessage {
  text?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: { type: string; text: string }[];
  fields?: { type: string; text: string }[];
}

interface SlackAttachment {
  color: string;
  blocks?: SlackBlock[];
}

type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

interface AlertPayload {
  title: string;
  message: string;
  severity: AlertSeverity;
  siteId?: string;
  siteName?: string;
  metadata?: Record<string, unknown>;
}

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  info: '#2563eb',
  warning: '#f59e0b',
  error: '#ef4444',
  critical: '#dc2626'
};

const SEVERITY_EMOJIS: Record<AlertSeverity, string> = {
  info: ':information_source:',
  warning: ':warning:',
  error: ':x:',
  critical: ':rotating_light:'
};

// Cooldown to avoid spamming Slack when sites flap (disconnect/reconnect rapidly)
const SITE_STATUS_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_COOLDOWN_ENTRIES = 200;
// Grace period after server boot: suppress online/offline alerts while Pi reconnect post-deploy
const BOOT_GRACE_PERIOD_MS = 90 * 1000; // 90 seconds (covers Socket.IO reconnection cycle)
// WiFi alert cooldown: avoid repeating the same low-signal alert every hour
const WIFI_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
// WiFi signal recovery threshold (must be clearly above -75 trigger to avoid flapping)
const WIFI_RECOVERY_THRESHOLD_DBM = -70;

class AlertService {
  private webhookUrl: string | null;
  private enabled: boolean;
  private siteStatusCooldown: Map<string, number> = new Map();
  private readonly serverStartTime = Date.now();
  /** Set to true during graceful shutdown to suppress false offline alerts */
  private shuttingDown = false;
  /** Track active low-WiFi alerts per site for resolve-on-recovery pattern */
  private activeWifiAlerts: Map<string, number> = new Map(); // siteId → timestamp of last Slack alert

  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL || null;
    this.enabled = process.env.SLACK_ALERTS_ENABLED === 'true';
  }

  /**
   * Call from SIGTERM handler to suppress all site online/offline alerts
   * during server shutdown. Prevents false "Site Offline" floods on redeploy.
   */
  enterShutdownMode(): void {
    this.shuttingDown = true;
    logger.info('AlertService entering shutdown mode — site status alerts suppressed');
  }

  /** Check if a site status alert is in cooldown. Returns true if alert should be skipped. */
  private isInCooldown(key: string): boolean {
    const lastSent = this.siteStatusCooldown.get(key);
    if (lastSent && Date.now() - lastSent < SITE_STATUS_COOLDOWN_MS) {
      return true;
    }

    // Prune old entries if map grows too large
    if (this.siteStatusCooldown.size >= MAX_COOLDOWN_ENTRIES) {
      const now = Date.now();
      for (const [k, ts] of this.siteStatusCooldown) {
        if (now - ts > SITE_STATUS_COOLDOWN_MS) {
          this.siteStatusCooldown.delete(k);
        }
      }
    }

    this.siteStatusCooldown.set(key, Date.now());
    return false;
  }

  private async sendSlackMessage(message: SlackMessage): Promise<boolean> {
    if (!this.enabled || !this.webhookUrl) {
      logger.debug('Slack alerts disabled or webhook not configured');
      return false;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        logger.error('Failed to send Slack alert', { status: response.status });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error sending Slack alert', { error });
      return false;
    }
  }

  async sendAlert(payload: AlertPayload): Promise<boolean> {
    const { title, message, severity, siteId, siteName, metadata } = payload;

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${SEVERITY_EMOJIS[severity]} ${title}`,
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    if (siteId || siteName) {
      blocks.push({
        type: 'section',
        fields: [
          ...(siteName ? [{ type: 'mrkdwn', text: `*Club:*\n${siteName}` }] : []),
          ...(siteId ? [{ type: 'mrkdwn', text: `*Site ID:*\n\`${siteId}\`` }] : [])
        ]
      });
    }

    if (metadata && Object.keys(metadata).length > 0) {
      const metadataFields = Object.entries(metadata)
        .slice(0, 10) // Limit to 10 fields
        .map(([key, value]) => ({
          type: 'mrkdwn',
          text: `*${key}:*\n${String(value)}`
        }));

      blocks.push({
        type: 'section',
        fields: metadataFields
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `NEOPRO Central | ${new Date().toISOString()}`
        }
      ]
    });

    return this.sendSlackMessage({
      attachments: [
        {
          color: SEVERITY_COLORS[severity],
          blocks
        }
      ]
    });
  }

  // Convenience methods
  async info(title: string, message: string, options?: Partial<AlertPayload>): Promise<boolean> {
    return this.sendAlert({ title, message, severity: 'info', ...options });
  }

  async warning(title: string, message: string, options?: Partial<AlertPayload>): Promise<boolean> {
    return this.sendAlert({ title, message, severity: 'warning', ...options });
  }

  async error(title: string, message: string, options?: Partial<AlertPayload>): Promise<boolean> {
    return this.sendAlert({ title, message, severity: 'error', ...options });
  }

  async critical(title: string, message: string, options?: Partial<AlertPayload>): Promise<boolean> {
    return this.sendAlert({ title, message, severity: 'critical', ...options });
  }

  // Pre-built alert types (with cooldown to prevent flapping spam)
  async siteOffline(siteId: string, siteName: string): Promise<boolean> {
    // Suppress during server shutdown (SIGTERM) — all sites disconnect, not a real outage
    if (this.shuttingDown) {
      logger.debug('Skipping siteOffline alert (server shutting down)', { siteId, siteName });
      return false;
    }
    // Suppress during boot grace period — sites reconnecting after deploy
    if (Date.now() - this.serverStartTime < BOOT_GRACE_PERIOD_MS) {
      logger.debug('Skipping siteOffline alert (boot grace period)', { siteId, siteName });
      return false;
    }
    if (this.isInCooldown(`offline:${siteId}`)) {
      logger.debug('Skipping siteOffline alert (cooldown)', { siteId, siteName });
      return false;
    }
    return this.sendAlert({
      title: 'Site Offline',
      message: `Le site *${siteName}* est passé hors ligne.`,
      severity: 'error',
      siteId,
      siteName
    });
  }

  async siteOnline(siteId: string, siteName: string): Promise<boolean> {
    if (this.shuttingDown) {
      logger.debug('Skipping siteOnline alert (server shutting down)', { siteId, siteName });
      return false;
    }
    if (Date.now() - this.serverStartTime < BOOT_GRACE_PERIOD_MS) {
      logger.debug('Skipping siteOnline alert (boot grace period)', { siteId, siteName });
      return false;
    }
    if (this.isInCooldown(`online:${siteId}`)) {
      logger.debug('Skipping siteOnline alert (cooldown)', { siteId, siteName });
      return false;
    }
    return this.sendAlert({
      title: 'Site Online',
      message: `Le site *${siteName}* est de nouveau en ligne.`,
      severity: 'info',
      siteId,
      siteName
    });
  }

  async highTemperature(siteId: string, siteName: string, temperature: number): Promise<boolean> {
    return this.sendAlert({
      title: 'Température élevée',
      message: `La température du site *${siteName}* est de *${temperature.toFixed(1)}°C*.`,
      severity: temperature > 80 ? 'critical' : 'warning',
      siteId,
      siteName,
      metadata: { temperature: `${temperature.toFixed(1)}°C` }
    });
  }

  async lowDiskSpace(siteId: string, siteName: string, usagePercent: number): Promise<boolean> {
    return this.sendAlert({
      title: 'Espace disque faible',
      message: `Le site *${siteName}* a *${usagePercent.toFixed(1)}%* d'espace disque utilisé.`,
      severity: usagePercent > 95 ? 'critical' : 'warning',
      siteId,
      siteName,
      metadata: { diskUsage: `${usagePercent.toFixed(1)}%` }
    });
  }

  async deploymentSuccess(siteId: string, siteName: string, videoName: string): Promise<boolean> {
    return this.sendAlert({
      title: 'Déploiement réussi',
      message: `La vidéo *${videoName}* a été déployée sur *${siteName}*.`,
      severity: 'info',
      siteId,
      siteName,
      metadata: { video: videoName }
    });
  }

  async deploymentFailed(siteId: string, siteName: string, videoName: string, error: string): Promise<boolean> {
    return this.sendAlert({
      title: 'Échec du déploiement',
      message: `Erreur lors du déploiement de *${videoName}* sur *${siteName}*: ${error}`,
      severity: 'error',
      siteId,
      siteName,
      metadata: { video: videoName, error }
    });
  }

  async lowWifiSignal(siteId: string, siteName: string, signal: number): Promise<boolean> {
    const lastAlertTime = this.activeWifiAlerts.get(siteId);
    if (lastAlertTime && Date.now() - lastAlertTime < WIFI_ALERT_COOLDOWN_MS) {
      logger.debug('Skipping lowWifiSignal alert (cooldown)', { siteId, siteName, signal });
      return false;
    }
    this.activeWifiAlerts.set(siteId, Date.now());
    return this.sendAlert({
      title: 'Signal WiFi faible',
      message: `Le signal WiFi du site *${siteName}* est de *${signal} dBm*.`,
      severity: signal < -85 ? 'critical' : 'warning',
      siteId,
      siteName,
      metadata: { signal: `${signal} dBm` }
    });
  }

  /**
   * Call when a site's WiFi signal recovers above threshold.
   * Sends a "resolved" notification and clears the active alert.
   */
  async wifiSignalRecovered(siteId: string, siteName: string, signal: number): Promise<boolean> {
    if (!this.activeWifiAlerts.has(siteId)) {
      return false; // No active alert to resolve
    }
    this.activeWifiAlerts.delete(siteId);
    return this.sendAlert({
      title: 'Signal WiFi rétabli',
      message: `Le signal WiFi du site *${siteName}* est revenu à *${signal} dBm*.`,
      severity: 'info',
      siteId,
      siteName,
      metadata: { signal: `${signal} dBm` }
    });
  }

  async wlan1Missing(siteId: string, siteName: string): Promise<boolean> {
    return this.sendAlert({
      title: 'Clé WiFi USB non détectée',
      message: `La clé WiFi USB (wlan1) n'est pas détectée sur le site *${siteName}*. Le Pi n'a pas de connexion Internet.`,
      severity: 'critical',
      siteId,
      siteName,
    });
  }

  async usbPowerIssue(siteId: string, siteName: string, throttled: string): Promise<boolean> {
    return this.sendAlert({
      title: 'Sous-tension USB détectée',
      message: `Le site *${siteName}* a une alimentation insuffisante (throttled: ${throttled}). Cela peut causer des déconnexions de la clé WiFi USB.`,
      severity: 'critical',
      siteId,
      siteName,
      metadata: { throttled }
    });
  }

  async networkFailure(siteId: string, siteName: string, issues: string[], recoveryAttempts: number): Promise<boolean> {
    return this.sendAlert({
      title: 'Échec recovery réseau',
      message: `Le site *${siteName}* a échoué ${recoveryAttempts} tentatives de recovery réseau.\nProblèmes : ${issues.join(', ')}`,
      severity: 'critical',
      siteId,
      siteName,
      metadata: {
        recoveryAttempts: String(recoveryAttempts),
        issues: issues.join(', ')
      },
    });
  }

  async kioskCrash(siteId: string, siteName: string, reason: string, restartCount: number): Promise<boolean> {
    return this.sendAlert({
      title: 'Kiosk Crash — TV hors service',
      message: `Le kiosk du site *${siteName}* a crashé: ${reason}. ${restartCount} redémarrages récents.`,
      severity: 'critical',
      siteId,
      siteName,
      metadata: { reason, restartCount: String(restartCount) }
    });
  }

  async serverError(error: Error, context?: string): Promise<boolean> {
    return this.sendAlert({
      title: 'Erreur serveur',
      message: `Une erreur s'est produite${context ? ` dans ${context}` : ''}: ${error.message}`,
      severity: 'error',
      metadata: {
        error: error.message,
        stack: error.stack?.split('\n')[0] || 'N/A'
      }
    });
  }
}

export const alertService = new AlertService();
export default alertService;
