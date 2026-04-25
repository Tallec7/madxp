/**
 * CRON task — Rapports périodiques par email (ADR-097).
 *
 * Envoie un résumé hebdomadaire ou mensuel : sites/online, alertes 7j,
 * déploiements 7j, top vidéo + site le plus actif.
 * Destinataires : `recipients` du config OU emails admin/super_admin
 * si `recipients` contient `'admin'`.
 */

import { query } from '../config/database';
import emailService from '../services/email.service';
import { ExecutionResult, RecurringSchedule } from './types';

interface ReportData {
  totalSites: number;
  onlineSites: number;
  alertsCount: number;
  deploymentsCount: number;
  highlights: string[];
}

export async function executeReportTask(schedule: RecurringSchedule): Promise<ExecutionResult> {
  const config = schedule.task_config as {
    report_type?: string;
    recipients?: string[];
    sites?: string[];
    include_charts?: boolean;
    include_pdf?: boolean;
  };

  // Récupérer les destinataires
  let recipients: string[] = [];
  if (config.recipients?.includes('admin')) {
    const adminsResult = await query<{ email: string }>(
      `SELECT email FROM users WHERE role IN ('admin', 'super_admin') AND email IS NOT NULL`,
      []
    );
    recipients = adminsResult.rows.map((r) => r.email);
  } else if (config.recipients) {
    recipients = config.recipients;
  }

  if (recipients.length === 0) {
    return { success: false, message: 'No recipients configured for report' };
  }

  const period = config.report_type?.includes('weekly') ? 'hebdomadaire' : 'mensuel';
  const reportData = await gatherReportData(config.sites || ['all']);

  const sent = await emailService.sendSummaryReport(recipients, {
    period,
    totalSites: reportData.totalSites,
    onlineSites: reportData.onlineSites,
    alertsCount: reportData.alertsCount,
    deploymentsCount: reportData.deploymentsCount,
    highlights: reportData.highlights,
  });

  return {
    success: sent,
    message: sent ? `Report sent to ${recipients.length} recipients` : 'Failed to send report',
    details: {
      recipients,
      period,
      stats: reportData,
      scheduleId: schedule.id,
    },
  };
}

/**
 * Rassemble les données pour un rapport (sites + alerts + déploiements + highlights).
 */
async function gatherReportData(_sites: string[]): Promise<ReportData> {
  // Sites stats
  const sitesResult = await query<{ total: string; online: string }>(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'online') as online
     FROM sites`,
    []
  );

  // Alertes des 7 derniers jours
  const alertsResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM alerts
     WHERE created_at > NOW() - INTERVAL '7 days'`,
    []
  );

  // Déploiements des 7 derniers jours
  const deploymentsResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM content_deployments
     WHERE created_at > NOW() - INTERVAL '7 days'`,
    []
  );

  // Highlights
  const highlights: string[] = [];

  // Top vidéo jouée
  const topVideoResult = await query<{ filename: string; play_count: string }>(
    `SELECT v.filename, COUNT(*) as play_count
     FROM video_plays vp
     JOIN videos v ON v.id = vp.video_id
     WHERE vp.created_at > NOW() - INTERVAL '7 days'
     GROUP BY v.id, v.filename
     ORDER BY play_count DESC
     LIMIT 1`,
    []
  );

  if (topVideoResult.rows.length > 0) {
    highlights.push(
      `Vidéo la plus jouée: ${topVideoResult.rows[0].filename} (${topVideoResult.rows[0].play_count} lectures)`
    );
  }

  // Site le plus actif
  const topSiteResult = await query<{ name: string; screen_time: string }>(
    `SELECT s.site_name as name, SUM(cds.screen_time_seconds) as screen_time
     FROM club_daily_stats_live cds
     JOIN sites s ON s.id = cds.site_id
     WHERE cds.date > NOW() - INTERVAL '7 days'
     GROUP BY s.id, s.site_name
     ORDER BY screen_time DESC
     LIMIT 1`,
    []
  );

  if (topSiteResult.rows.length > 0) {
    const hours = Math.round(parseInt(topSiteResult.rows[0].screen_time) / 3600);
    highlights.push(`Site le plus actif: ${topSiteResult.rows[0].name} (${hours}h d'écran)`);
  }

  return {
    totalSites: parseInt(sitesResult.rows[0]?.total || '0'),
    onlineSites: parseInt(sitesResult.rows[0]?.online || '0'),
    alertsCount: parseInt(alertsResult.rows[0]?.count || '0'),
    deploymentsCount: parseInt(deploymentsResult.rows[0]?.count || '0'),
    highlights,
  };
}
