/**
 * Club PDF Report Generator
 *
 * Generates professional PDF reports for clubs with:
 * - Cover page
 * - Executive summary (KPIs: screen time, videos, sessions, audience)
 * - Usage details (daily activity, trigger breakdown)
 * - Content analysis (category breakdown, top 10 videos)
 * - System health (CPU, memory, temperature, disk, uptime, alerts)
 * - Certification page with digital signature
 */

import { query } from '../../config/database';
import logger from '../../config/logger';
import PDFDocument from 'pdfkit';
import * as crypto from 'crypto';
import {
  PdfReportOptions,
  COLORS,
  formatDate,
  formatNumber,
  formatDuration,
  drawKPIBox,
} from './pdf-report.utils';

/**
 * Genere un rapport PDF pour un club
 *
 * @param siteId - ID du site/club
 * @param from - Date de debut
 * @param to - Date de fin
 * @param options - Options de generation
 * @returns Buffer du PDF genere
 */
export async function generateClubReport(
  siteId: string,
  from: string,
  to: string,
  options: PdfReportOptions = { type: 'club' }
): Promise<Buffer> {
  try {
    logger.info('Generating club PDF report', { siteId, from, to });

    // 1. Recuperer les informations du site
    const siteResult = await query(
      `SELECT id, site_name, club_name, location FROM sites WHERE id = $1`,
      [siteId]
    );

    if (siteResult.rowCount === 0) {
      throw new Error('Site not found');
    }

    const site = siteResult.rows[0];

    // 2. Recuperer les metriques de sante actuelles
    const healthResult = await query(
      `SELECT
        cpu_usage as cpu_percent,
        memory_usage as memory_percent,
        temperature,
        disk_usage as disk_used_percent,
        uptime as uptime_seconds
       FROM metrics
       WHERE site_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [siteId]
    );

    const currentHealth = healthResult.rows[0] || {
      cpu_percent: 0,
      memory_percent: 0,
      temperature: 0,
      disk_used_percent: 0,
      uptime_seconds: 0,
    };

    // 3. Recuperer les statistiques d'utilisation
    const usageResult = await query(
      `SELECT
        COUNT(DISTINCT id) as sessions_count,
        COALESCE(SUM(videos_played), 0) as total_videos,
        COALESCE(SUM(manual_triggers), 0) as total_manual_triggers,
        COALESCE(SUM(auto_plays), 0) as total_auto_plays,
        COALESCE(SUM(duration_seconds), 0) as total_screen_time_seconds,
        COUNT(DISTINCT DATE(started_at)) as active_days,
        COALESCE(SUM(audience_estimate), 0) as total_audience,
        COALESCE(AVG(audience_estimate), 0) as avg_audience_per_session
       FROM club_sessions
       WHERE site_id = $1
         AND started_at >= $2::date
         AND started_at < ($3::date + INTERVAL '1 day')`,
      [siteId, from, to]
    );

    const usage = usageResult.rows[0];

    // 4. Recuperer les statistiques par categorie
    const contentResult = await query(
      `SELECT
        category,
        COUNT(*) as plays,
        COALESCE(SUM(duration_played), 0) as total_duration
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY category
       ORDER BY plays DESC`,
      [siteId, from, to]
    );

    // 5. Recuperer top 10 videos
    const topVideosResult = await query(
      `SELECT
        video_filename,
        category,
        COUNT(*) as plays,
        COALESCE(SUM(duration_played), 0) as total_duration
       FROM video_plays
       WHERE site_id = $1
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY video_filename, category
       ORDER BY plays DESC
       LIMIT 10`,
      [siteId, from, to]
    );

    // 6. Calculer uptime sur la periode
    const availabilityResult = await query(
      `SELECT
        COUNT(*) as total_checks,
        COUNT(*) as online_checks
       FROM (
         SELECT site_id, recorded_at,
           RANK() OVER (PARTITION BY DATE_TRUNC('hour', recorded_at) ORDER BY recorded_at DESC) as rn
         FROM metrics
         WHERE site_id = $1
           AND recorded_at >= $2::date
           AND recorded_at < ($3::date + INTERVAL '1 day')
       ) hourly_status
       WHERE rn = 1`,
      [siteId, from, to]
    );

    const periodStart = new Date(from);
    const periodEnd = new Date(to);
    const hoursInPeriod = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60)) + 24;

    const availability = availabilityResult.rows[0] as { total_checks: string; online_checks: string };
    const uptimePercent = hoursInPeriod > 0
      ? Math.min(100, (parseInt(availability.total_checks) / hoursInPeriod) * 100)
      : 0;

    // 7. Recuperer les alertes de la periode
    const alertsResult = await query(
      `SELECT
        severity,
        COUNT(*) as count
       FROM alerts
       WHERE site_id = $1
         AND created_at >= $2::date
         AND created_at < ($3::date + INTERVAL '1 day')
       GROUP BY severity`,
      [siteId, from, to]
    );

    // 8. Recuperer activite quotidienne
    const dailyActivityResult = await query(
      `SELECT
        DATE(started_at) as date,
        COUNT(*) as sessions,
        COALESCE(SUM(videos_played), 0) as videos,
        COALESCE(SUM(duration_seconds), 0) as screen_time
       FROM club_sessions
       WHERE site_id = $1
         AND started_at >= $2::date
         AND started_at < ($3::date + INTERVAL '1 day')
       GROUP BY DATE(started_at)
       ORDER BY date ASC`,
      [siteId, from, to]
    );

    // 9. Construire les donnees du rapport
    const reportData = {
      club: {
        id: String(site.id),
        name: String(site.club_name || site.site_name),
        location: site.location ? String(site.location) : undefined,
      },
      period: { from, to },
      summary: {
        total_impressions: parseInt(usage.total_videos as string) || 0,
        total_screen_time_seconds: parseInt(usage.total_screen_time_seconds as string) || 0,
        completion_rate: 0,
        estimated_reach: 0,
        active_sites: 1,
        active_days: parseInt(usage.active_days as string) || 0,
      },
      usage: {
        sessions_count: parseInt(usage.sessions_count as string) || 0,
        total_videos: parseInt(usage.total_videos as string) || 0,
        total_manual_triggers: parseInt(usage.total_manual_triggers as string) || 0,
        total_auto_plays: parseInt(usage.total_auto_plays as string) || 0,
      },
      audience: {
        total: parseInt(usage.total_audience as string) || 0,
        average_per_session: Math.round(parseFloat(usage.avg_audience_per_session as string) || 0),
      },
      health: {
        current: currentHealth,
        uptime_percent: uptimePercent,
      },
      content: {
        by_category: contentResult.rows.map(r => ({
          category: String(r.category),
          plays: parseInt(r.plays as string),
          duration: parseInt(r.total_duration as string),
        })),
        top_videos: topVideosResult.rows.map(r => ({
          filename: String(r.video_filename),
          category: String(r.category),
          plays: parseInt(r.plays as string),
          duration: parseInt(r.total_duration as string),
        })),
      },
      alerts: alertsResult.rows.map(r => ({
        severity: String(r.severity),
        count: parseInt(r.count as string),
      })),
      trends: {
        daily: dailyActivityResult.rows.map(r => ({
          date: String(r.date),
          sessions: parseInt(r.sessions as string),
          videos: parseInt(r.videos as string),
          screen_time: parseInt(r.screen_time as string),
        })),
      },
    };

    logger.info('Generating club PDF report with professional layout');
    return await generateClubPdf(reportData, options);
  } catch (error) {
    logger.error('Error generating club report:', error);
    throw error;
  }
}

/**
 * Genere un PDF professionnel pour un club avec toutes les sections
 */
async function generateClubPdf(data: any, options: PdfReportOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
      // Configuration du document PDF
      const doc = new PDFDocument({
        size: options.format === 'letter' ? 'LETTER' : 'A4',
        margin: 50,
        info: {
          Title: `Rapport Club NEOPRO - ${data.club.name}`,
          Author: 'NEOPRO Analytics',
          Subject: `Période ${data.period.from} - ${data.period.to}`,
          Keywords: 'analytics, club, utilisation, santé système',
          CreationDate: new Date(),
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      let yPosition = 50;

      // ============================================================================
      // PAGE 1: PAGE DE GARDE
      // ============================================================================

      doc
        .fontSize(32)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('NEOPRO', 50, yPosition, { align: 'center' });

      yPosition += 40;
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text('ANALYTICS PLATFORM', { align: 'center' });

      yPosition += 80;

      doc
        .fontSize(24)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('RAPPORT CLUB', 50, yPosition, { align: 'center' });

      yPosition += 60;

      // Nom du club
      doc
        .fontSize(20)
        .fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .text(data.club.name.toUpperCase(), { align: 'center' });

      if (data.club.location) {
        yPosition += 30;
        doc
          .fontSize(14)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(data.club.location, { align: 'center' });
      }

      yPosition += 100;

      // Periode
      doc
        .fontSize(16)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text(`Période du ${formatDate(data.period.from)} au ${formatDate(data.period.to)}`, { align: 'center' });

      yPosition += 40;

      // Date de generation
      doc
        .fontSize(12)
        .fillColor('#6b7280')
        .text(`Généré le ${formatDate(new Date().toISOString())}`, { align: 'center' });

      // ============================================================================
      // PAGE 2: RESUME EXECUTIF
      // ============================================================================

      doc.addPage();
      yPosition = 50;

      doc
        .fontSize(20)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('RÉSUMÉ EXÉCUTIF', 50, yPosition);

      yPosition += 40;

      // KPIs principaux - 3 colonnes
      const kpiWidth = 160;
      const kpiHeight = 100;
      const gap = 10;

      // KPI 1: Temps d'ecran
      drawKPIBox(doc, 50, yPosition, kpiWidth, kpiHeight,
        'TEMPS D\'ÉCRAN',
        formatDuration(data.summary.total_screen_time_seconds),
        COLORS
      );

      // KPI 2: Videos jouees
      drawKPIBox(doc, 50 + kpiWidth + gap, yPosition, kpiWidth, kpiHeight,
        'VIDÉOS JOUÉES',
        formatNumber(data.summary.total_impressions),
        COLORS
      );

      // KPI 3: Jours actifs
      drawKPIBox(doc, 50 + (kpiWidth + gap) * 2, yPosition, kpiWidth, kpiHeight,
        'JOURS ACTIFS',
        `${data.summary.active_days}`,
        COLORS
      );

      yPosition += kpiHeight + 30;

      // KPI 4-6: Sessions, Audience, Ratio
      drawKPIBox(doc, 50, yPosition, kpiWidth, kpiHeight,
        'SESSIONS',
        formatNumber(data.usage.sessions_count),
        COLORS
      );

      // Audience estimee (jauge saisie par le club)
      const audienceTotal = data.audience?.total || 0;
      const audienceAvg = data.audience?.average_per_session || 0;
      drawKPIBox(doc, 50 + kpiWidth + gap, yPosition, kpiWidth, kpiHeight,
        'AUDIENCE ESTIMÉE',
        formatNumber(audienceTotal),
        COLORS,
        audienceAvg > 0 ? `~${audienceAvg}/session` : undefined
      );

      const totalTriggers = data.usage.total_manual_triggers + data.usage.total_auto_plays;
      const manualPercent = totalTriggers > 0
        ? ((data.usage.total_manual_triggers / totalTriggers) * 100).toFixed(0)
        : '0';

      drawKPIBox(doc, 50 + (kpiWidth + gap) * 2, yPosition, kpiWidth, kpiHeight,
        'RATIO MANUEL',
        `${manualPercent}%`,
        COLORS
      );

      yPosition += kpiHeight + 40;

      // Points saillants
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .text('📊 POINTS SAILLANTS', 50, yPosition);

      yPosition += 30;

      const highlights: string[] = [];

      // Audience estimee (donnee saisie par le club)
      if (data.audience?.total > 0) {
        highlights.push(`👥 Audience cumulée estimée : ${formatNumber(data.audience.total)} spectateurs (~${data.audience.average_per_session}/session)`);
      }

      if (data.summary.active_days > 20) {
        highlights.push(`✅ Excellent taux d'utilisation : ${data.summary.active_days} jours actifs sur la période`);
      }

      if (parseFloat(manualPercent) > 30) {
        highlights.push(`🎯 Fort engagement opérateur : ${manualPercent}% de triggers manuels`);
      }

      if (data.health.uptime_percent > 98) {
        highlights.push(`🏆 Fiabilité système excellente : ${data.health.uptime_percent.toFixed(1)}% uptime`);
      } else if (data.health.uptime_percent < 95) {
        highlights.push(`⚠️ Uptime système à surveiller : ${data.health.uptime_percent.toFixed(1)}%`);
      }

      if (data.content.top_videos.length > 0) {
        const topVideo = data.content.top_videos[0];
        highlights.push(`🌟 Vidéo la plus populaire : ${topVideo.filename} (${topVideo.plays} lectures)`);
      }

      doc.fontSize(12).fillColor(COLORS.text).font('Helvetica');

      highlights.forEach(highlight => {
        doc.text(highlight, 70, yPosition, { width: 480 });
        yPosition += 25;
      });

      // ============================================================================
      // PAGE 3: UTILISATION
      // ============================================================================

      doc.addPage();
      yPosition = 50;

      doc
        .fontSize(20)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('UTILISATION', 50, yPosition);

      yPosition += 40;

      // Graphique activite quotidienne (simplifie - barres textuelles)
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .text('Activité Quotidienne', 50, yPosition);

      yPosition += 30;

      if (data.trends.daily.length > 0) {
        const maxVideos = Math.max(...data.trends.daily.map((d: any) => d.videos));

        data.trends.daily.slice(0, 15).forEach((day: any) => {
          const barWidth = maxVideos > 0 ? (day.videos / maxVideos) * 400 : 0;
          const dateStr = formatDate(day.date);

          doc
            .fontSize(10)
            .fillColor(COLORS.text)
            .font('Helvetica')
            .text(dateStr, 50, yPosition, { width: 80 });

          doc
            .rect(140, yPosition, barWidth, 12)
            .fillColor(COLORS.secondary)
            .fill();

          doc
            .fontSize(10)
            .fillColor(COLORS.text)
            .text(`${day.videos} vidéos`, 550, yPosition, { align: 'right' });

          yPosition += 18;
        });
      } else {
        doc
          .fontSize(12)
          .fillColor('#6b7280')
          .font('Helvetica-Oblique')
          .text('Aucune donnée d\'activité disponible pour cette période', 50, yPosition);
        yPosition += 30;
      }

      yPosition += 30;

      // Repartition Auto vs Manuel
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .text('Répartition des Déclenchements', 50, yPosition);

      yPosition += 30;

      const autoPercent = totalTriggers > 0
        ? ((data.usage.total_auto_plays / totalTriggers) * 100).toFixed(0)
        : '0';

      doc.fontSize(12).fillColor(COLORS.text).font('Helvetica');
      doc.text(`Automatique : ${data.usage.total_auto_plays} (${autoPercent}%)`, 70, yPosition);
      yPosition += 20;
      doc.text(`Manuel : ${data.usage.total_manual_triggers} (${manualPercent}%)`, 70, yPosition);

      // ============================================================================
      // PAGE 4: CONTENU
      // ============================================================================

      doc.addPage();
      yPosition = 50;

      doc
        .fontSize(20)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('CONTENU', 50, yPosition);

      yPosition += 40;

      // Breakdown par categorie
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .text('Répartition par Catégorie', 50, yPosition);

      yPosition += 30;

      if (data.content.by_category.length > 0) {
        const totalPlays = data.content.by_category.reduce((sum: number, cat: any) => sum + cat.plays, 0);

        data.content.by_category.forEach((category: any) => {
          const percent = totalPlays > 0 ? ((category.plays / totalPlays) * 100).toFixed(0) : '0';
          const barWidth = totalPlays > 0 ? (category.plays / totalPlays) * 400 : 0;

          doc
            .fontSize(12)
            .fillColor(COLORS.text)
            .font('Helvetica')
            .text(category.category, 50, yPosition, { width: 120 });

          doc
            .rect(180, yPosition, barWidth, 16)
            .fillColor(COLORS.accent)
            .fill();

          doc
            .fontSize(12)
            .fillColor(COLORS.text)
            .text(`${category.plays} (${percent}%)`, 590, yPosition, { align: 'right', width: 100 });

          yPosition += 25;
        });
      } else {
        doc
          .fontSize(12)
          .fillColor('#6b7280')
          .font('Helvetica-Oblique')
          .text('Aucune donnée de contenu disponible', 50, yPosition);
        yPosition += 30;
      }

      yPosition += 30;

      // Top 10 videos
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .text('Top 10 Vidéos les Plus Jouées', 50, yPosition);

      yPosition += 30;

      if (data.content.top_videos.length > 0) {
        // En-tete tableau
        doc.fontSize(10).fillColor('#6b7280').font('Helvetica-Bold');
        doc.text('#', 50, yPosition, { width: 30 });
        doc.text('Vidéo', 80, yPosition, { width: 280 });
        doc.text('Catégorie', 370, yPosition, { width: 100 });
        doc.text('Lectures', 480, yPosition, { align: 'right', width: 80 });

        yPosition += 20;

        // Ligne separatrice
        doc
          .moveTo(50, yPosition)
          .lineTo(590, yPosition)
          .strokeColor(COLORS.border)
          .stroke();

        yPosition += 10;

        // Lignes du tableau
        data.content.top_videos.slice(0, 10).forEach((video: any, index: number) => {
          doc.fontSize(10).fillColor(COLORS.text).font('Helvetica');
          doc.text(`${index + 1}`, 50, yPosition, { width: 30 });
          doc.text(video.filename.substring(0, 40), 80, yPosition, { width: 280 });
          doc.text(video.category, 370, yPosition, { width: 100 });
          doc.text(String(video.plays), 480, yPosition, { align: 'right', width: 80 });

          yPosition += 20;
        });
      } else {
        doc
          .fontSize(12)
          .fillColor('#6b7280')
          .font('Helvetica-Oblique')
          .text('Aucune vidéo jouée pendant cette période', 50, yPosition);
      }

      // ============================================================================
      // PAGE 5: SANTE SYSTEME
      // ============================================================================

      doc.addPage();
      yPosition = 50;

      doc
        .fontSize(20)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('SANTÉ SYSTÈME', 50, yPosition);

      yPosition += 40;

      // Metriques actuelles - 2 lignes de 2 KPIs
      drawKPIBox(doc, 50, yPosition, 245, kpiHeight,
        'CPU',
        `${parseFloat(data.health.current.cpu_percent || 0).toFixed(1)}%`,
        COLORS
      );

      drawKPIBox(doc, 305, yPosition, 245, kpiHeight,
        'MÉMOIRE',
        `${parseFloat(data.health.current.memory_percent || 0).toFixed(1)}%`,
        COLORS
      );

      yPosition += kpiHeight + 10;

      drawKPIBox(doc, 50, yPosition, 245, kpiHeight,
        'TEMPÉRATURE',
        `${parseFloat(data.health.current.temperature || 0).toFixed(0)}°C`,
        COLORS
      );

      drawKPIBox(doc, 305, yPosition, 245, kpiHeight,
        'DISQUE',
        `${parseFloat(data.health.current.disk_used_percent || 0).toFixed(0)}%`,
        COLORS
      );

      yPosition += kpiHeight + 30;

      // Uptime
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .text(`Disponibilité sur la période : ${data.health.uptime_percent.toFixed(2)}%`, 50, yPosition);

      yPosition += 40;

      // Alertes
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .text('Alertes de la Période', 50, yPosition);

      yPosition += 30;

      if (data.alerts.length > 0) {
        data.alerts.forEach((alert: any) => {
          const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : 'ℹ️';
          doc
            .fontSize(12)
            .fillColor(COLORS.text)
            .font('Helvetica')
            .text(`${icon} ${alert.severity.toUpperCase()} : ${alert.count} alerte(s)`, 70, yPosition);
          yPosition += 25;
        });
      } else {
        doc
          .fontSize(12)
          .fillColor(COLORS.accent)
          .font('Helvetica')
          .text('✅ Aucune alerte durant cette période', 70, yPosition);
        yPosition += 30;
      }

      // ============================================================================
      // PAGE 6: CERTIFICATION
      // ============================================================================

      doc.addPage();
      yPosition = 50;

      doc
        .fontSize(20)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('CERTIFICATION', 50, yPosition, { align: 'center' });

      yPosition += 80;

      doc
        .fontSize(12)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text('Le présent rapport certifie que les données d\'utilisation du système NEOPRO', 50, yPosition, { align: 'center' });

      yPosition += 20;
      doc.text(`pour le club "${data.club.name}"`, { align: 'center' });

      yPosition += 20;
      doc.text(`durant la période du ${formatDate(data.period.from)} au ${formatDate(data.period.to)}`, { align: 'center' });

      yPosition += 20;
      doc.text('ont été collectées automatiquement et de manière authentifiée.', { align: 'center' });

      yPosition += 60;

      // Signature numerique
      const signature = crypto
        .createHash('sha256')
        .update(`${data.club.id}-${data.period.from}-${data.period.to}-${data.summary.total_impressions}`)
        .digest('hex')
        .substring(0, 16)
        .toUpperCase();

      doc
        .fontSize(10)
        .fillColor('#6b7280')
        .font('Helvetica')
        .text(`Signature numérique : ${signature}`, { align: 'center' });

      yPosition += 40;

      doc
        .fontSize(10)
        .fillColor('#6b7280')
        .text(`Généré par NEOPRO Analytics le ${formatDate(new Date().toISOString())}`, { align: 'center' });

      // Finaliser le PDF
      doc.end();

    } catch (error) {
      logger.error('Error generating club PDF:', error);
      reject(error);
    }
    })().catch(reject);
  });
}
