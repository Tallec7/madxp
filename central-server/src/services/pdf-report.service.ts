/**
 * PDF Report Generation Service
 *
 * Génère des rapports PDF professionnels pour:
 * - Analytics Club (rapports mensuels clubs)
 * - Analytics Sponsors (rapports mensuels sponsors)
 *
 * Référence: BUSINESS_PLAN_COMPLET.md §13.4
 *
 * Structure d'un rapport sponsor (BP §13.4):
 * 1. Page de garde (logo club + logo sponsor, période, date génération)
 * 2. Résumé exécutif (KPIs clés, comparaison période précédente)
 * 3. Détail des diffusions (graphiques impressions/jour, répartition par période)
 * 4. Couverture géographique (carte sites si multi-sites, top 10 sites)
 * 5. Certificat de diffusion (attestation officielle, signature numérique)
 */

import { query } from '../config/database';
import logger from '../config/logger';
import PDFDocument from 'pdfkit';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { PassThrough } from 'stream';
import * as crypto from 'crypto';

// Types
interface ReportData {
  sponsor?: {
    id: string;
    name: string;
    logo_url?: string;
  };
  club?: {
    id: string;
    name: string;
  };
  period: {
    from: string;
    to: string;
  };
  summary: {
    total_impressions: number;
    total_screen_time_seconds: number;
    completion_rate: number;
    estimated_reach: number;
    active_sites: number;
    active_days: number;
  };
  by_video?: unknown[];
  by_site?: unknown[];
  by_period?: Record<string, number>;
  by_event_type?: Record<string, number>;
  trends: {
    daily: Array<{ date: string; impressions: number; screen_time: number }>;
  };
}

interface PdfReportOptions {
  type: 'sponsor' | 'club';
  format?: 'a4' | 'letter';
  language?: 'fr' | 'en';
  includeSignature?: boolean;
}

/**
 * Génère un rapport PDF pour un sponsor
 *
 * @param sponsorId - ID du sponsor
 * @param from - Date de début (YYYY-MM-DD)
 * @param to - Date de fin (YYYY-MM-DD)
 * @param options - Options de génération
 * @returns Buffer du PDF généré
 *
 * TODO: Implémenter la génération réelle avec PDFKit
 * Exemple d'implémentation:
 *
 * ```typescript
 * import PDFDocument from 'pdfkit';
 * import { PassThrough } from 'stream';
 *
 * const doc = new PDFDocument({ size: 'A4', margin: 50 });
 * const stream = new PassThrough();
 *
 * doc.pipe(stream);
 *
 * // Page de garde
 * doc.fontSize(25).text('Rapport Sponsor NEOPRO', { align: 'center' });
 * doc.fontSize(12).text(`Période: ${from} - ${to}`, { align: 'center' });
 *
 * // KPIs
 * doc.fontSize(16).text('Résumé', { underline: true });
 * doc.fontSize(12).text(`Impressions: ${data.summary.total_impressions}`);
 *
 * // ... etc
 *
 * doc.end();
 * return streamToBuffer(stream);
 * ```
 */
export async function generateSponsorReport(
  sponsorId: string,
  from: string,
  to: string,
  options: PdfReportOptions = { type: 'sponsor' }
): Promise<Buffer> {
  try {
    logger.info('Generating sponsor PDF report', { sponsorId, from, to });

    // 1. Récupérer les données du sponsor
    const sponsorResult = await query(
      `SELECT id, name, logo_url FROM sponsors WHERE id = $1`,
      [sponsorId]
    );

    if (sponsorResult.rowCount === 0) {
      throw new Error('Sponsor not found');
    }

    const sponsor = sponsorResult.rows[0];

    // 2. Récupérer les analytics (réutiliser la logique du controller)
    const videoIds = await query(
      `SELECT video_id FROM sponsor_videos WHERE sponsor_id = $1`,
      [sponsorId]
    );

    if (videoIds.rowCount === 0) {
      throw new Error('No videos found for sponsor');
    }

    const vids = videoIds.rows.map(r => r.video_id);

    // Métriques globales
    const summary = await query(
      `SELECT
        COUNT(*) as total_impressions,
        SUM(duration_played) as total_screen_time_seconds,
        ROUND(AVG(CASE WHEN completed THEN 100 ELSE (duration_played::float / NULLIF(video_duration, 0) * 100) END)::numeric, 1) as completion_rate,
        SUM(audience_estimate) as estimated_reach,
        COUNT(DISTINCT site_id) as active_sites,
        COUNT(DISTINCT DATE(played_at)) as active_days
       FROM sponsor_impressions
       WHERE video_id = ANY($1::uuid[])
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')`,
      [vids, from, to]
    );

    // Tendances quotidiennes
    const dailyTrends = await query(
      `SELECT
        DATE(played_at) as date,
        COUNT(*) as impressions,
        SUM(duration_played) as screen_time
       FROM sponsor_impressions
       WHERE video_id = ANY($1::uuid[])
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY DATE(played_at)
       ORDER BY date ASC`,
      [vids, from, to]
    );

    const reportData: ReportData = {
      sponsor: {
        id: String(sponsor.id),
        name: String(sponsor.name),
        logo_url: sponsor.logo_url ? String(sponsor.logo_url) : undefined,
      },
      period: { from, to },
      summary: {
        total_impressions: parseInt(summary.rows[0]?.total_impressions as string) || 0,
        total_screen_time_seconds: parseInt(summary.rows[0]?.total_screen_time_seconds as string) || 0,
        completion_rate: parseFloat(summary.rows[0]?.completion_rate as string) || 0,
        estimated_reach: parseInt(summary.rows[0]?.estimated_reach as string) || 0,
        active_sites: parseInt(summary.rows[0]?.active_sites as string) || 0,
        active_days: parseInt(summary.rows[0]?.active_days as string) || 0,
      },
      trends: {
        daily: dailyTrends.rows.map(d => ({
          date: String(d.date),
          impressions: parseInt(d.impressions as string),
          screen_time: parseInt(d.screen_time as string),
        })),
      },
    };

    // 3. Générer le PDF
    logger.info('Generating PDF report with charts and professional layout');

    return await generatePlaceholderPdf(reportData, options);
  } catch (error) {
    logger.error('Error generating sponsor report:', error);
    throw error;
  }
}

/**
 * Génère un rapport PDF pour un club
 *
 * @param siteId - ID du site/club
 * @param from - Date de début
 * @param to - Date de fin
 * @param options - Options de génération
 * @returns Buffer du PDF généré
 */
export async function generateClubReport(
  siteId: string,
  from: string,
  to: string,
  options: PdfReportOptions = { type: 'club' }
): Promise<Buffer> {
  try {
    logger.info('Generating club PDF report', { siteId, from, to });

    // 1. Récupérer les informations du site
    const siteResult = await query(
      `SELECT id, name, location FROM sites WHERE id = $1`,
      [siteId]
    );

    if (siteResult.rowCount === 0) {
      throw new Error('Site not found');
    }

    const site = siteResult.rows[0];

    // 2. Récupérer les métriques de santé actuelles
    const healthResult = await query(
      `SELECT
        cpu_percent,
        memory_percent,
        temperature,
        disk_used_percent,
        uptime_seconds
       FROM metrics
       WHERE site_id = $1
       ORDER BY created_at DESC
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

    // 3. Récupérer les statistiques d'utilisation
    const usageResult = await query(
      `SELECT
        COUNT(DISTINCT id) as sessions_count,
        COALESCE(SUM(videos_played), 0) as total_videos,
        COALESCE(SUM(manual_triggers), 0) as total_manual_triggers,
        COALESCE(SUM(auto_plays), 0) as total_auto_plays,
        COALESCE(SUM(duration_seconds), 0) as total_screen_time_seconds,
        COUNT(DISTINCT DATE(started_at)) as active_days
       FROM club_sessions
       WHERE site_id = $1
         AND started_at >= $2::date
         AND started_at < ($3::date + INTERVAL '1 day')`,
      [siteId, from, to]
    );

    const usage = usageResult.rows[0];

    // 4. Récupérer les statistiques par catégorie
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

    // 5. Récupérer top 10 vidéos
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

    // 6. Calculer uptime sur la période
    const availabilityResult = await query(
      `SELECT
        COUNT(*) as total_checks,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_checks
       FROM (
         SELECT site_id, status, created_at,
           RANK() OVER (PARTITION BY DATE_TRUNC('hour', created_at) ORDER BY created_at DESC) as rn
         FROM metrics
         WHERE site_id = $1
           AND created_at >= $2::date
           AND created_at < ($3::date + INTERVAL '1 day')
       ) hourly_status
       WHERE rn = 1`,
      [siteId, from, to]
    );

    const availability = availabilityResult.rows[0];
    const uptimePercent = availability.total_checks > 0
      ? (parseFloat(availability.online_checks as string) / parseFloat(availability.total_checks as string)) * 100
      : 0;

    // 7. Récupérer les alertes de la période
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

    // 8. Récupérer activité quotidienne
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

    // 9. Construire les données du rapport
    const reportData = {
      club: {
        id: String(site.id),
        name: String(site.name),
        location: site.location ? String(site.location) : undefined,
      },
      period: { from, to },
      summary: {
        total_impressions: parseInt(usage.total_videos as string) || 0,
        total_screen_time_seconds: parseInt(usage.total_screen_time_seconds as string) || 0,
        completion_rate: 0, // Calculé si disponible
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
 * Génère un PDF professionnel avec graphiques et mise en page
 */
async function generatePlaceholderPdf(data: ReportData, options: PdfReportOptions): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      // Configuration du document PDF
      const doc = new PDFDocument({
        size: options.format === 'letter' ? 'LETTER' : 'A4',
        margin: 50,
        info: {
          Title: `Rapport ${options.type === 'sponsor' ? 'Sponsor' : 'Club'} NEOPRO`,
          Author: 'NEOPRO Analytics',
          Subject: `Période ${data.period.from} - ${data.period.to}`,
          Keywords: 'analytics, sponsor, impressions, video',
          CreationDate: new Date(),
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Couleurs de la marque NEOPRO
      const COLORS = {
        primary: '#1e3a8a', // Bleu foncé
        secondary: '#3b82f6', // Bleu clair
        accent: '#10b981', // Vert
        text: '#1f2937', // Gris foncé
        lightGray: '#f3f4f6',
        border: '#d1d5db',
      };

      let yPosition = 50;

      // ============================================================================
      // PAGE 1: PAGE DE GARDE
      // ============================================================================

      // En-tête avec logo NEOPRO (simulé avec texte stylisé)
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

      // Titre du rapport
      doc
        .fontSize(24)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text(
          options.type === 'sponsor' ? 'RAPPORT SPONSOR' : 'RAPPORT CLUB',
          50,
          yPosition,
          { align: 'center' }
        );

      yPosition += 60;

      // Nom du sponsor/club
      if (data.sponsor) {
        doc
          .fontSize(18)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(data.sponsor.name, { align: 'center' });
        yPosition += 40;
      }

      if (data.club) {
        doc
          .fontSize(18)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(data.club.name, { align: 'center' });
        yPosition += 40;
      }

      // Période
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text(`Période d'analyse`, { align: 'center' });

      yPosition += 25;
      doc
        .fontSize(16)
        .fillColor(COLORS.secondary)
        .font('Helvetica-Bold')
        .text(`${formatDate(data.period.from)} - ${formatDate(data.period.to)}`, { align: 'center' });

      yPosition += 100;

      // Ligne de séparation
      doc
        .strokeColor(COLORS.border)
        .lineWidth(1)
        .moveTo(100, yPosition)
        .lineTo(500, yPosition)
        .stroke();

      yPosition += 60;

      // Date de génération
      doc
        .fontSize(10)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text(`Rapport généré le ${formatDate(new Date().toISOString())}`, { align: 'center' });

      // ============================================================================
      // PAGE 2: RÉSUMÉ EXÉCUTIF
      // ============================================================================

      doc.addPage();
      yPosition = 50;

      // Titre de section
      doc
        .fontSize(20)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('RÉSUMÉ EXÉCUTIF', 50, yPosition);

      yPosition += 40;

      // Grille de KPIs (2 colonnes x 3 lignes)
      const kpis = [
        { label: 'Impressions totales', value: formatNumber(data.summary?.total_impressions || 0), icon: '📊' },
        { label: 'Temps d\'écran total', value: formatDuration(data.summary?.total_screen_time_seconds || 0), icon: '⏱️' },
        { label: 'Taux de complétion', value: `${data.summary?.completion_rate || 0}%`, icon: '✅' },
        { label: 'Audience estimée', value: formatNumber(data.summary?.estimated_reach || 0), icon: '👥' },
        { label: 'Sites actifs', value: `${data.summary?.active_sites || 0}`, icon: '📍' },
        { label: 'Jours actifs', value: `${data.summary?.active_days || 0}`, icon: '📅' },
      ];

      const cardWidth = 240;
      const cardHeight = 80;
      const cardGap = 20;

      for (let i = 0; i < kpis.length; i++) {
        const kpi = kpis[i];
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 50 + col * (cardWidth + cardGap);
        const y = yPosition + row * (cardHeight + cardGap);

        // Fond de la carte
        doc
          .rect(x, y, cardWidth, cardHeight)
          .fillAndStroke(COLORS.lightGray, COLORS.border);

        // Icône
        doc
          .fontSize(24)
          .fillColor(COLORS.text)
          .text(kpi.icon, x + 15, y + 15);

        // Label
        doc
          .fontSize(10)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(kpi.label, x + 60, y + 20, { width: cardWidth - 70 });

        // Valeur
        doc
          .fontSize(18)
          .fillColor(COLORS.primary)
          .font('Helvetica-Bold')
          .text(kpi.value, x + 60, y + 40, { width: cardWidth - 70 });
      }

      yPosition += 3 * (cardHeight + cardGap) + 40;

      // ============================================================================
      // PAGE 3: GRAPHIQUES
      // ============================================================================

      doc.addPage();
      yPosition = 50;

      doc
        .fontSize(20)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('TENDANCES ET ANALYSES', 50, yPosition);

      yPosition += 40;

      // Générer graphique des impressions quotidiennes avec Chart.js
      if (data.trends.daily.length > 0) {
        try {
          const chartBuffer = await generateDailyImpressionsChart(data.trends.daily, COLORS);
          doc.image(chartBuffer, 50, yPosition, { width: 500 });
          yPosition += 300;
        } catch (chartError) {
          logger.warn('Failed to generate chart, using fallback', chartError);
          doc
            .fontSize(12)
            .fillColor(COLORS.text)
            .font('Helvetica')
            .text('Graphique des impressions quotidiennes', 50, yPosition);
          yPosition += 30;
        }
      }

      // Répartition par type d'événement (si disponible)
      if (data.by_event_type && Object.keys(data.by_event_type).length > 0) {
        yPosition += 20;
        doc
          .fontSize(14)
          .fillColor(COLORS.primary)
          .font('Helvetica-Bold')
          .text('Répartition par type d\'événement', 50, yPosition);

        yPosition += 30;

        try {
          const pieChartBuffer = await generateEventTypePieChart(data.by_event_type, COLORS);
          doc.image(pieChartBuffer, 50, yPosition, { width: 400 });
          yPosition += 250;
        } catch (chartError) {
          logger.warn('Failed to generate pie chart', chartError);
        }
      }

      // ============================================================================
      // PAGE 4: CERTIFICAT DE DIFFUSION
      // ============================================================================

      if (options.includeSignature) {
        doc.addPage();
        yPosition = 50;

        // Bordure décorative
        doc
          .rect(40, 40, doc.page.width - 80, doc.page.height - 80)
          .lineWidth(2)
          .strokeColor(COLORS.primary)
          .stroke();

        doc
          .rect(45, 45, doc.page.width - 90, doc.page.height - 90)
          .lineWidth(1)
          .strokeColor(COLORS.secondary)
          .stroke();

        yPosition = 100;

        // Titre du certificat
        doc
          .fontSize(24)
          .fillColor(COLORS.primary)
          .font('Helvetica-Bold')
          .text('CERTIFICAT DE DIFFUSION', 50, yPosition, { align: 'center' });

        yPosition += 60;

        // Texte du certificat
        const certificateText = options.language === 'en'
          ? `This certifies that ${data.sponsor?.name || 'the sponsor'} content was displayed on NEOPRO platform during the period from ${formatDate(data.period.from)} to ${formatDate(data.period.to)}.`
          : `Nous certifions que les contenus du sponsor ${data.sponsor?.name || ''} ont été diffusés sur la plateforme NEOPRO durant la période du ${formatDate(data.period.from)} au ${formatDate(data.period.to)}.`;

        doc
          .fontSize(12)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(certificateText, 100, yPosition, { width: 400, align: 'justify', lineGap: 5 });

        yPosition += 100;

        // Métriques certifiées
        doc
          .fontSize(14)
          .fillColor(COLORS.primary)
          .font('Helvetica-Bold')
          .text('Métriques certifiées:', 100, yPosition);

        yPosition += 30;

        const certifiedMetrics = [
          `• Impressions totales: ${formatNumber(data.summary?.total_impressions || 0)}`,
          `• Temps d'écran cumulé: ${formatDuration(data.summary?.total_screen_time_seconds || 0)}`,
          `• Audience estimée: ${formatNumber(data.summary?.estimated_reach || 0)} spectateurs`,
          `• Sites de diffusion: ${data.summary?.active_sites || 0}`,
        ];

        certifiedMetrics.forEach(metric => {
          doc
            .fontSize(11)
            .fillColor(COLORS.text)
            .font('Helvetica')
            .text(metric, 120, yPosition);
          yPosition += 25;
        });

        yPosition += 60;

        // Signature numérique
        doc
          .fontSize(10)
          .fillColor(COLORS.text)
          .font('Helvetica-Oblique')
          .text('Signature numérique NEOPRO', 100, yPosition);

        yPosition += 20;

        const signature = generateDigitalSignature(data, options);
        doc
          .fontSize(8)
          .fillColor(COLORS.secondary)
          .font('Courier')
          .text(signature, 100, yPosition, { width: 400 });

        yPosition += 40;

        doc
          .fontSize(9)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(`Émis le ${formatDate(new Date().toISOString())} par NEOPRO Analytics Platform`, 100, yPosition);
      }

      // Pied de page sur toutes les pages
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(8)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(
            `NEOPRO Analytics • Confidentiel • Page ${i + 1}/${pages.count}`,
            50,
            doc.page.height - 50,
            { align: 'center' }
          );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Génère un graphique Chart.js des impressions quotidiennes
 */
async function generateDailyImpressionsChart(
  dailyData: Array<{ date: string; impressions: number; screen_time: number }>,
  colors: any
): Promise<Buffer> {
  const width = 800;
  const height = 400;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: 'white',
  });

  const configuration = {
    type: 'line' as const,
    data: {
      labels: dailyData.map(d => formatDate(d.date)),
      datasets: [
        {
          label: 'Impressions',
          data: dailyData.map(d => d.impressions),
          borderColor: colors.secondary,
          backgroundColor: `${colors.secondary}33`,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Évolution des impressions quotidiennes',
          font: {
            size: 16,
            weight: 'bold' as const,
          },
          color: colors.primary,
        },
        legend: {
          display: true,
          position: 'top' as const,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Nombre d\'impressions',
          },
        },
        x: {
          title: {
            display: true,
            text: 'Date',
          },
        },
      },
    },
  };

  return chartJSNodeCanvas.renderToBuffer(configuration as any);
}

/**
 * Génère un graphique en camembert de la répartition par type d'événement
 */
async function generateEventTypePieChart(
  eventTypeData: Record<string, number>,
  colors: any
): Promise<Buffer> {
  const width = 600;
  const height = 400;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: 'white',
  });

  const eventTypes = Object.keys(eventTypeData);
  const values = Object.values(eventTypeData);

  const chartColors = [
    '#3b82f6', // Bleu
    '#10b981', // Vert
    '#f59e0b', // Orange
    '#ef4444', // Rouge
    '#8b5cf6', // Violet
    '#ec4899', // Rose
  ];

  const configuration = {
    type: 'doughnut' as const,
    data: {
      labels: eventTypes.map(t => {
        const labels: Record<string, string> = {
          match: 'Match',
          training: 'Entraînement',
          tournament: 'Tournoi',
          other: 'Autre',
        };
        return labels[t] || t;
      }),
      datasets: [
        {
          data: values,
          backgroundColor: chartColors.slice(0, eventTypes.length),
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Répartition par type d\'événement',
          font: {
            size: 16,
            weight: 'bold' as const,
          },
          color: colors.primary,
        },
        legend: {
          display: true,
          position: 'right' as const,
        },
      },
    },
  };

  return chartJSNodeCanvas.renderToBuffer(configuration as any);
}

/**
 * Génère une signature numérique pour le certificat
 */
function generateDigitalSignature(data: ReportData, options: PdfReportOptions): string {
  const signatureData = {
    sponsor: data.sponsor?.id,
    period: `${data.period.from}_${data.period.to}`,
    impressions: data.summary?.total_impressions,
    timestamp: new Date().toISOString(),
  };

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(signatureData))
    .digest('hex');

  // Format lisible (blocs de 8 caractères)
  const formatted = hash.match(/.{1,8}/g)?.join('-') || hash;

  return `NEOPRO-CERT-${formatted.substring(0, 47).toUpperCase()}`;
}

/**
 * Formate une date ISO en format français lisible
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Génère un PDF professionnel pour un club avec toutes les sections
 */
async function generateClubPdf(data: any, options: PdfReportOptions): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
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

      // Couleurs de la marque NEOPRO
      const COLORS = {
        primary: '#1e3a8a',
        secondary: '#3b82f6',
        accent: '#10b981',
        text: '#1f2937',
        lightGray: '#f3f4f6',
        border: '#d1d5db',
      };

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

      // Période
      doc
        .fontSize(16)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text(`Période du ${formatDate(data.period.from)} au ${formatDate(data.period.to)}`, { align: 'center' });

      yPosition += 40;

      // Date de génération
      doc
        .fontSize(12)
        .fillColor('#6b7280')
        .text(`Généré le ${formatDate(new Date().toISOString())}`, { align: 'center' });

      // ============================================================================
      // PAGE 2: RÉSUMÉ EXÉCUTIF
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

      // KPI 1: Temps d'écran
      drawKPIBox(doc, 50, yPosition, kpiWidth, kpiHeight,
        'TEMPS D\'ÉCRAN',
        formatDuration(data.summary.total_screen_time_seconds),
        COLORS
      );

      // KPI 2: Vidéos jouées
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

      // KPI 4-6
      drawKPIBox(doc, 50, yPosition, kpiWidth, kpiHeight,
        'SESSIONS',
        formatNumber(data.usage.sessions_count),
        COLORS
      );

      drawKPIBox(doc, 50 + kpiWidth + gap, yPosition, kpiWidth, kpiHeight,
        'TRIGGERS MANUELS',
        formatNumber(data.usage.total_manual_triggers),
        COLORS
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

      const highlights = [];

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

      // Graphique activité quotidienne (simplifié - barres textuelles)
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

      // Répartition Auto vs Manuel
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

      // Breakdown par catégorie
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

      // Top 10 vidéos
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .text('Top 10 Vidéos les Plus Jouées', 50, yPosition);

      yPosition += 30;

      if (data.content.top_videos.length > 0) {
        // En-tête tableau
        doc.fontSize(10).fillColor('#6b7280').font('Helvetica-Bold');
        doc.text('#', 50, yPosition, { width: 30 });
        doc.text('Vidéo', 80, yPosition, { width: 280 });
        doc.text('Catégorie', 370, yPosition, { width: 100 });
        doc.text('Lectures', 480, yPosition, { align: 'right', width: 80 });

        yPosition += 20;

        // Ligne séparatrice
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
      // PAGE 5: SANTÉ SYSTÈME
      // ============================================================================

      doc.addPage();
      yPosition = 50;

      doc
        .fontSize(20)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('SANTÉ SYSTÈME', 50, yPosition);

      yPosition += 40;

      // Métriques actuelles - 2 lignes de 2 KPIs
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

      // Signature numérique
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
  });
}

/**
 * Dessine une box KPI stylisée
 */
function drawKPIBox(
  doc: PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  colors: any
): void {
  // Fond
  doc
    .rect(x, y, width, height)
    .fillAndStroke(colors.lightGray, colors.border);

  // Label
  doc
    .fontSize(10)
    .fillColor('#6b7280')
    .font('Helvetica')
    .text(label, x + 10, y + 15, { width: width - 20, align: 'left' });

  // Valeur
  doc
    .fontSize(24)
    .fillColor(colors.primary)
    .font('Helvetica-Bold')
    .text(value, x + 10, y + 40, { width: width - 20, align: 'left' });
}

/**
 * Formate un nombre avec séparateurs de milliers
 */
function formatNumber(num: number): string {
  return new Intl.NumberFormat('fr-FR').format(num);
}

/**
 * Formate une durée en heures et minutes
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}min`;
}

// Export des fonctions principales
export default {
  generateSponsorReport,
  generateClubReport,
};
