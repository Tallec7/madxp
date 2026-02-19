/**
 * Service d'envoi d'emails avec nodemailer
 *
 * Configuration via variables d'environnement:
 * - SMTP_HOST: Serveur SMTP (ex: smtp.gmail.com)
 * - SMTP_PORT: Port SMTP (par defaut 587)
 * - SMTP_USER: Utilisateur SMTP
 * - SMTP_PASSWORD: Mot de passe ou App Password
 * - SMTP_FROM: Adresse expediteur (par defaut noreply@neopro.fr)
 * - SMTP_SECURE: Utiliser TLS (true/false, par defaut false)
 */

import nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import logger from '../config/logger';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface AlertEmailData {
  siteName: string;
  siteId: string;
  alertType: string;
  severity: 'warning' | 'critical' | 'info';
  message: string;
  timestamp: Date;
  dashboardUrl?: string;
}

export interface DeploymentEmailData {
  siteName: string;
  videoName: string;
  status: 'started' | 'completed' | 'failed';
  error?: string;
  timestamp: Date;
  dashboardUrl?: string;
}

export interface PasswordResetEmailData {
  resetLink: string;
  expiresAt: Date;
  userEmail: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private initialized = false;
  private enabled = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialise le transporteur nodemailer
   */
  private initialize(): void {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    if (!host || !user || !pass) {
      logger.warn('Email service disabled: SMTP configuration missing');
      logger.warn('Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD to enable email notifications');
      this.enabled = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user,
          pass,
        },
        // Options de resilience
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5, // 5 emails par seconde max
      });

      this.enabled = true;
      this.initialized = true;
      logger.info('Email service initialized', { host, user });
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      this.enabled = false;
    }
  }

  /**
   * Verifie si le service email est disponible
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Teste la connexion SMTP
   */
  async testConnection(): Promise<boolean> {
    if (!this.transporter) return false;

    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified');
      return true;
    } catch (error) {
      logger.error('SMTP connection failed:', error);
      return false;
    }
  }

  /**
   * Envoie un email
   */
  async send(options: EmailOptions): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      logger.debug('Email not sent (service disabled)', { to: options.to, subject: options.subject });
      return false;
    }

    const from = process.env.SMTP_FROM || 'noreply@neopro.fr';

    try {
      const info = await this.transporter.sendMail({
        from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType || 'application/pdf',
        })),
      });

      logger.info('Email sent', {
        messageId: info.messageId,
        to: options.to,
        subject: options.subject,
      });

      return true;
    } catch (error) {
      logger.error('Failed to send email:', {
        error,
        to: options.to,
        subject: options.subject,
      });
      return false;
    }
  }

  /**
   * Envoie une notification d'alerte
   */
  async sendAlertNotification(to: string | string[], data: AlertEmailData): Promise<boolean> {
    const severityEmoji = data.severity === 'critical' ? '🔴' : data.severity === 'warning' ? '🟠' : 'ℹ️';
    const severityLabel = data.severity === 'critical' ? 'CRITIQUE' : data.severity === 'warning' ? 'Avertissement' : 'Information';

    const subject = `${severityEmoji} [NeoPro] ${severityLabel}: ${data.alertType} - ${data.siteName}`;

    const html = this.getAlertEmailTemplate(data, severityLabel, severityEmoji);
    const text = `${severityLabel}: ${data.alertType}\n\nSite: ${data.siteName}\nMessage: ${data.message}\nDate: ${data.timestamp.toLocaleString('fr-FR')}`;

    return this.send({ to, subject, html, text });
  }

  /**
   * Envoie une notification de deploiement
   */
  async sendDeploymentNotification(to: string | string[], data: DeploymentEmailData): Promise<boolean> {
    let statusEmoji: string;
    let statusLabel: string;

    switch (data.status) {
      case 'started':
        statusEmoji = '🚀';
        statusLabel = 'Deploiement demarre';
        break;
      case 'completed':
        statusEmoji = '✅';
        statusLabel = 'Deploiement termine';
        break;
      case 'failed':
        statusEmoji = '❌';
        statusLabel = 'Deploiement echoue';
        break;
    }

    const subject = `${statusEmoji} [NeoPro] ${statusLabel} - ${data.videoName}`;

    const html = this.getDeploymentEmailTemplate(data, statusLabel, statusEmoji);
    const text = `${statusLabel}\n\nSite: ${data.siteName}\nVideo: ${data.videoName}\nDate: ${data.timestamp.toLocaleString('fr-FR')}${data.error ? `\nErreur: ${data.error}` : ''}`;

    return this.send({ to, subject, html, text });
  }

  /**
   * Envoie un email de reinitialisation de mot de passe
   */
  async sendPasswordResetEmail(to: string, data: PasswordResetEmailData): Promise<boolean> {
    const subject = '🔐 [NeoPro] Reinitialisation de votre mot de passe';

    const html = this.getPasswordResetEmailTemplate(data);
    const text = `Reinitialisation de mot de passe NeoPro\n\nVous avez demande la reinitialisation de votre mot de passe.\n\nCliquez sur le lien suivant pour reinitialiser votre mot de passe:\n${data.resetLink}\n\nCe lien expire le ${data.expiresAt.toLocaleString('fr-FR')}.\n\nSi vous n'avez pas demande cette reinitialisation, ignorez cet email.`;

    return this.send({ to, subject, html, text });
  }

  /**
   * Envoie un rapport quotidien/hebdomadaire
   */
  async sendSummaryReport(
    to: string | string[],
    data: {
      period: string;
      totalSites: number;
      onlineSites: number;
      alertsCount: number;
      deploymentsCount: number;
      highlights: string[];
    }
  ): Promise<boolean> {
    const subject = `📊 [NeoPro] Rapport ${data.period}`;

    const html = this.getSummaryEmailTemplate(data);
    const text = `Rapport ${data.period}\n\nSites: ${data.onlineSites}/${data.totalSites} en ligne\nAlertes: ${data.alertsCount}\nDeploiements: ${data.deploymentsCount}`;

    return this.send({ to, subject, html, text });
  }

  /**
   * Envoie un rapport de visibilite sponsor avec PDF en piece jointe
   */
  async sendSponsorReport(
    to: string | string[],
    data: {
      sponsorName: string;
      clubName: string;
      period: string;
      pdfBuffer: Buffer;
      pdfFilename: string;
    }
  ): Promise<boolean> {
    const subject = `[NeoPro] Rapport de visibilite ${data.sponsorName} - ${data.period}`;

    const html = this.getSponsorReportEmailTemplate(data);
    const text = `Rapport de visibilite ${data.sponsorName} pour ${data.clubName} - ${data.period}. Veuillez trouver le rapport PDF en piece jointe.`;

    return this.send({
      to,
      subject,
      html,
      text,
      attachments: [{
        filename: data.pdfFilename,
        content: data.pdfBuffer,
        contentType: 'application/pdf',
      }],
    });
  }

  /**
   * Envoie un magic link d'acces au portail sponsor
   * P5: Permet au sponsor de consulter ses stats sans compte
   */
  async sendSponsorAccessLink(
    to: string,
    data: {
      sponsorName: string;
      clubName: string;
      accessUrl: string;
      expiresAt: Date;
    }
  ): Promise<boolean> {
    const subject = `[NeoPro] Acces a vos statistiques de visibilite - ${data.clubName}`;

    const expiresFormatted = data.expiresAt.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const content = `
      <div class="header">
        <h1>📊 Vos statistiques de visibilite</h1>
      </div>
      <div class="content">
        <p>Bonjour,</p>
        <p>Vous avez ete invite a consulter les statistiques de visibilite de <strong>${data.sponsorName}</strong> au <strong>${data.clubName}</strong>.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${data.accessUrl}" class="btn">Voir mes statistiques</a>
        </p>
        <p class="meta">Ce lien est valable jusqu'au ${expiresFormatted}.</p>
        <p class="meta">Vous pourrez consulter vos impressions, votre audience estimee et telecharger vos rapports PDF.</p>
      </div>
    `;

    const html = this.getBaseTemplate(content);
    const text = `Consultez vos statistiques de visibilite pour ${data.sponsorName} au ${data.clubName}. Lien: ${data.accessUrl} (valable jusqu'au ${expiresFormatted}).`;

    return this.send({ to, subject, html, text });
  }

  // ============= Email Templates =============

  private getBaseTemplate(content: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #2022E9 0%, #3A0686 100%); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 24px; }
    .footer { padding: 16px 24px; background: #f9f9f9; text-align: center; font-size: 12px; color: #666; }
    .btn { display: inline-block; background: #2022E9; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
    .alert-critical { background: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 4px; margin: 16px 0; }
    .alert-warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 16px 0; }
    .alert-info { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; margin: 16px 0; }
    .success { background: #dcfce7; border-left: 4px solid #22c55e; padding: 16px; border-radius: 4px; margin: 16px 0; }
    .error { background: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 4px; margin: 16px 0; }
    .meta { color: #666; font-size: 14px; }
    .stat { display: inline-block; text-align: center; padding: 16px 24px; }
    .stat-value { font-size: 32px; font-weight: bold; color: #2022E9; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      ${content}
      <div class="footer">
        <p>NeoPro - Systeme de gestion d'affichage sportif</p>
        <p>Cet email a ete envoye automatiquement, merci de ne pas repondre.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private getAlertEmailTemplate(data: AlertEmailData, severityLabel: string, severityEmoji: string): string {
    const alertClass = data.severity === 'critical' ? 'alert-critical' : data.severity === 'warning' ? 'alert-warning' : 'alert-info';

    const content = `
      <div class="header">
        <h1>${severityEmoji} Alerte NeoPro</h1>
      </div>
      <div class="content">
        <div class="${alertClass}">
          <strong>${severityLabel}: ${data.alertType}</strong>
        </div>
        <p><strong>Site:</strong> ${data.siteName}</p>
        <p><strong>Message:</strong> ${data.message}</p>
        <p class="meta">Date: ${data.timestamp.toLocaleString('fr-FR')}</p>
        ${data.dashboardUrl ? `<p style="margin-top: 24px;"><a href="${data.dashboardUrl}" class="btn">Voir le dashboard</a></p>` : ''}
      </div>
    `;

    return this.getBaseTemplate(content);
  }

  private getDeploymentEmailTemplate(data: DeploymentEmailData, statusLabel: string, statusEmoji: string): string {
    const statusClass = data.status === 'completed' ? 'success' : data.status === 'failed' ? 'error' : 'alert-info';

    const content = `
      <div class="header">
        <h1>${statusEmoji} Deploiement NeoPro</h1>
      </div>
      <div class="content">
        <div class="${statusClass}">
          <strong>${statusLabel}</strong>
        </div>
        <p><strong>Video:</strong> ${data.videoName}</p>
        <p><strong>Site:</strong> ${data.siteName}</p>
        ${data.error ? `<p><strong>Erreur:</strong> ${data.error}</p>` : ''}
        <p class="meta">Date: ${data.timestamp.toLocaleString('fr-FR')}</p>
        ${data.dashboardUrl ? `<p style="margin-top: 24px;"><a href="${data.dashboardUrl}" class="btn">Voir les details</a></p>` : ''}
      </div>
    `;

    return this.getBaseTemplate(content);
  }

  private getSummaryEmailTemplate(data: {
    period: string;
    totalSites: number;
    onlineSites: number;
    alertsCount: number;
    deploymentsCount: number;
    highlights: string[];
  }): string {
    const highlightsHtml = data.highlights.length > 0
      ? `<ul>${data.highlights.map(h => `<li>${h}</li>`).join('')}</ul>`
      : '<p>Aucun evenement notable.</p>';

    const content = `
      <div class="header">
        <h1>📊 Rapport ${data.period}</h1>
      </div>
      <div class="content">
        <div style="text-align: center; padding: 16px 0;">
          <div class="stat">
            <div class="stat-value">${data.onlineSites}/${data.totalSites}</div>
            <div class="stat-label">Sites en ligne</div>
          </div>
          <div class="stat">
            <div class="stat-value">${data.alertsCount}</div>
            <div class="stat-label">Alertes</div>
          </div>
          <div class="stat">
            <div class="stat-value">${data.deploymentsCount}</div>
            <div class="stat-label">Deploiements</div>
          </div>
        </div>
        <h3>Points cles</h3>
        ${highlightsHtml}
      </div>
    `;

    return this.getBaseTemplate(content);
  }

  private getPasswordResetEmailTemplate(data: PasswordResetEmailData): string {
    const content = `
      <div class="header">
        <h1>🔐 Reinitialisation de mot de passe</h1>
      </div>
      <div class="content">
        <p>Bonjour,</p>
        <p>Vous avez demande la reinitialisation de votre mot de passe pour le compte <strong>${data.userEmail}</strong>.</p>
        <p style="margin: 32px 0; text-align: center;">
          <a href="${data.resetLink}" class="btn">Reinitialiser mon mot de passe</a>
        </p>
        <div class="alert-warning">
          <p style="margin: 0;"><strong>Ce lien expire le ${data.expiresAt.toLocaleString('fr-FR')}</strong></p>
        </div>
        <p style="margin-top: 24px; color: #666; font-size: 14px;">
          Si vous n'avez pas demande cette reinitialisation, vous pouvez ignorer cet email en toute securite.
          Votre mot de passe restera inchange.
        </p>
        <p style="margin-top: 16px; color: #999; font-size: 12px;">
          Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur:<br>
          <a href="${data.resetLink}" style="color: #2022E9; word-break: break-all;">${data.resetLink}</a>
        </p>
      </div>
    `;

    return this.getBaseTemplate(content);
  }

  private getSponsorReportEmailTemplate(data: {
    sponsorName: string;
    clubName: string;
    period: string;
  }): string {
    const content = `
      <div class="header">
        <h1>Rapport de Visibilite</h1>
      </div>
      <div class="content">
        <p>Bonjour,</p>
        <p>Veuillez trouver ci-joint le rapport de visibilite pour <strong>${data.sponsorName}</strong>
        au sein du club <strong>${data.clubName}</strong> pour la periode <strong>${data.period}</strong>.</p>
        <div class="success">
          <p style="margin: 0;">Le rapport PDF est joint a cet email.</p>
        </div>
        <p>Ce rapport presente :</p>
        <ul>
          <li>Le nombre total de passages de votre annonce</li>
          <li>L'audience estimee touchee</li>
          <li>La repartition par type d'evenement (matchs, entrainements, etc.)</li>
        </ul>
        <p class="meta" style="margin-top: 24px;">
          Ce rapport est genere automatiquement par la plateforme NeoPro.<br>
          Pour toute question, contactez votre interlocuteur au club.
        </p>
      </div>
    `;

    return this.getBaseTemplate(content);
  }
}

export const emailService = new EmailService();
export default emailService;
