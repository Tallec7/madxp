/**
 * Advertiser/Sponsor PDF Report Generator
 *
 * Generates professional PDF reports for advertisers with:
 * - Cover page (NEOPRO logo, advertiser name, period)
 * - Executive summary (KPIs: impressions, screen time, audience)
 * - Charts (daily evolution, event type distribution)
 * - Optional broadcast certificate with digital signature
 */

import { query } from '../../config/database';
import logger from '../../config/logger';
import { ALL_SPONSOR_CATEGORIES } from '../../utils/sponsor-categories';
import PDFDocument from 'pdfkit';
import {
  ReportData,
  PdfReportOptions,
  COLORS,
  formatDate,
  formatNumber,
  formatDuration,
  generateDailyImpressionsChart,
  generateEventTypePieChart,
  generateDigitalSignature,
} from './pdf-report.utils';

/**
 * Genere un rapport PDF pour un annonceur
 *
 * @param advertiserId - ID de l'annonceur
 * @param from - Date de debut (YYYY-MM-DD)
 * @param to - Date de fin (YYYY-MM-DD)
 * @param options - Options de generation (format, langue, signature)
 * @returns Buffer du PDF genere
 */
export async function generateAdvertiserReport(
  advertiserId: string,
  from: string,
  to: string,
  options: PdfReportOptions = { type: 'sponsor' }
): Promise<Buffer> {
  try {
    logger.info('Generating advertiser PDF report', { advertiserId, from, to });

    // 1. Recuperer les donnees de l'annonceur
    const advertiserResult = await query(
      `SELECT id, name, logo_url FROM advertisers WHERE id = $1`,
      [advertiserId]
    );

    if (advertiserResult.rowCount === 0) {
      throw new Error('Advertiser not found');
    }

    const advertiser = advertiserResult.rows[0];

    // 2. Recuperer les analytics
    const videoIds = await query(
      `SELECT video_id FROM advertiser_videos WHERE advertiser_id = $1`,
      [advertiserId]
    );

    if (videoIds.rowCount === 0) {
      throw new Error('No videos found for advertiser');
    }

    const vids = videoIds.rows.map(r => r.video_id);

    // Metriques globales
    const summary = await query(
      `SELECT
        COUNT(*) as total_impressions,
        COALESCE(SUM(duration_played), 0) as total_screen_time_seconds,
        ROUND(AVG(CASE WHEN completed THEN 100 ELSE (duration_played::float / NULLIF(video_duration, 0) * 100) END)::numeric, 1) as completion_rate,
        COALESCE(SUM(audience_estimate), 0) as estimated_reach,
        COUNT(DISTINCT site_id) as active_sites,
        COUNT(DISTINCT DATE(played_at)) as active_days
       FROM video_plays
       WHERE video_id = ANY($1::uuid[])
         AND category IN ${ALL_SPONSOR_CATEGORIES}
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
       FROM video_plays
       WHERE video_id = ANY($1::uuid[])
         AND category IN ${ALL_SPONSOR_CATEGORIES}
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY DATE(played_at)
       ORDER BY date ASC`,
      [vids, from, to]
    );

    // KPIs verifies
    const verifiedResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE tv_status = 'on') as verified_count,
        ROUND(
          (COUNT(*) FILTER (WHERE tv_status = 'on')::numeric /
           NULLIF(COUNT(*), 0) * 100), 1
        ) as tv_on_rate,
        COUNT(*) FILTER (WHERE event_type = 'match') as match_day_impressions,
        ROUND(
          (COUNT(*) FILTER (WHERE completed = true)::numeric /
           NULLIF(COUNT(*), 0) * 100), 1
        ) as completion_rate_verified
       FROM video_plays
       WHERE sponsor_id = $1
         AND category IN ${ALL_SPONSOR_CATEGORIES}
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')`,
      [advertiserId, from, to]
    );

    const verified = verifiedResult.rows[0];

    const reportData: ReportData = {
      sponsor: {
        id: String(advertiser.id),
        name: String(advertiser.name),
        logo_url: advertiser.logo_url ? String(advertiser.logo_url) : undefined,
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
      verified_impressions: {
        verified_count: parseInt(verified?.verified_count as string) || 0,
        tv_on_rate: parseFloat(verified?.tv_on_rate as string) || 0,
        match_day_impressions: parseInt(verified?.match_day_impressions as string) || 0,
        completion_rate: parseFloat(verified?.completion_rate_verified as string) || 0,
      },
      trends: {
        daily: dailyTrends.rows.map(d => ({
          date: String(d.date),
          impressions: parseInt(d.impressions as string),
          screen_time: parseInt(d.screen_time as string),
        })),
      },
    };

    // 3. Generer le PDF
    logger.info('Generating PDF report with charts and professional layout');

    return await generatePlaceholderPdf(reportData, options);
  } catch (error) {
    logger.error('Error generating advertiser report:', error);
    throw error;
  }
}

// @deprecated - Utiliser generateAdvertiserReport
export const generateSponsorReport = generateAdvertiserReport;

/**
 * Genere un PDF professionnel avec graphiques et mise en page
 */
async function generatePlaceholderPdf(data: ReportData, options: PdfReportOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    (async () => {
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

      let yPosition = 50;

      // ============================================================================
      // PAGE 1: PAGE DE GARDE
      // ============================================================================

      // En-tete avec logo NEOPRO (simule avec texte stylise)
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

      // Periode
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

      // Ligne de separation
      doc
        .strokeColor(COLORS.border)
        .lineWidth(1)
        .moveTo(100, yPosition)
        .lineTo(500, yPosition)
        .stroke();

      yPosition += 60;

      // Date de generation
      doc
        .fontSize(10)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text(`Rapport généré le ${formatDate(new Date().toISOString())}`, { align: 'center' });

      // ============================================================================
      // PAGE 2: RESUME EXECUTIF
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

        // Icone
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

      // Section Impressions Verifiees (si donnees disponibles)
      if (data.verified_impressions && data.verified_impressions.verified_count > 0) {
        doc
          .fontSize(16)
          .fillColor(COLORS.primary)
          .font('Helvetica-Bold')
          .text('IMPRESSIONS VÉRIFIÉES', 50, yPosition);

        yPosition += 30;

        doc
          .fontSize(11)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(
            'Les impressions vérifiées comptabilisent uniquement les diffusions avec TV confirmée allumée (HDMI-CEC).',
            50, yPosition, { width: 500 }
          );

        yPosition += 30;

        const verifiedKpis = [
          {
            label: 'Impressions vérifiées',
            value: formatNumber(data.verified_impressions.verified_count),
            sub: `${data.verified_impressions.tv_on_rate}% du total`
          },
          {
            label: 'Impressions match day',
            value: formatNumber(data.verified_impressions.match_day_impressions),
            sub: 'Pendant les matchs'
          },
          {
            label: 'Taux de complétion',
            value: `${data.verified_impressions.completion_rate}%`,
            sub: 'Vidéos vues en entier'
          },
        ];

        const verifiedCardWidth = 155;
        const verifiedCardHeight = 70;

        verifiedKpis.forEach((vk, idx) => {
          const x = 50 + idx * (verifiedCardWidth + 15);

          // Fond vert clair
          doc
            .rect(x, yPosition, verifiedCardWidth, verifiedCardHeight)
            .fillAndStroke('#ecfdf5', '#6ee7b7');

          doc
            .fontSize(9)
            .fillColor('#065f46')
            .font('Helvetica')
            .text(vk.label, x + 10, yPosition + 10, { width: verifiedCardWidth - 20 });

          doc
            .fontSize(16)
            .fillColor('#065f46')
            .font('Helvetica-Bold')
            .text(vk.value, x + 10, yPosition + 28, { width: verifiedCardWidth - 20 });

          doc
            .fontSize(8)
            .fillColor('#6b7280')
            .font('Helvetica')
            .text(vk.sub, x + 10, yPosition + 52, { width: verifiedCardWidth - 20 });
        });

        yPosition += verifiedCardHeight + 20;
      }

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

      // Generer graphique des impressions quotidiennes avec Chart.js
      if (data.trends.daily.length > 0) {
        try {
          const chartBuffer = await generateDailyImpressionsChart(data.trends.daily, COLORS);
          if (!chartBuffer) throw new Error('canvas not available');
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

      // Repartition par type d'evenement (si disponible)
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
          if (!pieChartBuffer) throw new Error('canvas not available');
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

        // Bordure decorative
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

        // Metriques certifiees
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

        // Signature numerique
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
    })().catch(reject);
  });
}
