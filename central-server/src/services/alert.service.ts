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

class AlertService {
  private webhookUrl: string | null;
  private enabled: boolean;

  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL || null;
    this.enabled = process.env.SLACK_ALERTS_ENABLED === 'true';
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

  // Pre-built alert types
  async siteOffline(siteId: string, siteName: string): Promise<boolean> {
    return this.sendAlert({
      title: 'Site Offline',
      message: `Le site *${siteName}* est passé hors ligne.`,
      severity: 'error',
      siteId,
      siteName
    });
  }

  async siteOnline(siteId: string, siteName: string): Promise<boolean> {
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
