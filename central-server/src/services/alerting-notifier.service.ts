/**
 * Service de notification pour les alertes (email, webhook, Slack, superviseurs).
 * Extrait de alerting.service.ts (ADR-051 Phase 1).
 */

import { query } from '../config/database';
import logger from '../config/logger';
import emailService from './email.service';
import type { AlertSeverity, AlertThreshold } from './alerting.types';

const WEBHOOK_URL = process.env.ALERTING_WEBHOOK_URL;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const DASHBOARD_URL = process.env.DASHBOARD_URL;

export class AlertNotifier {
  formatAlertMessage(threshold: AlertThreshold, value: number, severity: AlertSeverity): string {
    const severityLabel = severity === 'critical' ? 'CRITIQUE' : 'Avertissement';
    return `${severityLabel}: ${threshold.name} - Valeur actuelle: ${value.toFixed(1)} (seuil: ${severity === 'critical' ? threshold.criticalValue : threshold.warningValue})`;
  }

  async notify(
    threshold: AlertThreshold,
    siteId: string,
    severity: AlertSeverity,
    value: number
  ): Promise<void> {
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

  async sendWebhookNotification(data: {
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

  async sendSlackNotification(data: {
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
      const colorMap: Record<AlertSeverity, string> = {
        info: '#36a64f',
        warning: '#ff9800',
        critical: '#f44336',
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

  async notifySupervisors(alertData: {
    alertId: string;
    siteId: string;
    type: string;
    severity: string;
    message: string;
    createdAt: Date;
    escalatedAt: Date;
  }): Promise<void> {
    try {
      let siteName = 'Site inconnu';
      try {
        const siteResult = await query('SELECT site_name FROM sites WHERE id = $1', [alertData.siteId]);
        if (siteResult.rows.length > 0) {
          siteName = siteResult.rows[0].site_name as string;
        }
      } catch {
        // Ignorer
      }

      const supervisorResult = await query(
        "SELECT email FROM users WHERE role IN ('admin', 'supervisor') AND email IS NOT NULL"
      );
      const supervisorEmails = supervisorResult.rows.map(r => r.email as string);

      if (supervisorEmails.length === 0) {
        logger.warn('No supervisors to notify for escalation', { alertId: alertData.alertId });
        return;
      }

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

      if (SLACK_WEBHOOK_URL) {
        await this.sendSlackNotification({
          siteName,
          siteId: alertData.siteId,
          alertType: `🔺 ESCALADE: ${alertData.type}`,
          severity: 'critical',
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
}

export const alertNotifier = new AlertNotifier();
