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

    // TODO: Implémenter avec les analytics club existantes
    // Réutiliser les endpoints GET /api/analytics/clubs/:siteId/dashboard

    logger.info('Generating club PDF report with professional layout');
    return await generatePlaceholderPdf({ period: { from, to } } as ReportData, options);
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
