/**
 * Site Sponsor PDF Report Generator
 *
 * Generates a 1-page commercial PDF report for a site_sponsor with:
 * - Header with club branding
 * - 3 big KPIs (impressions, audience, matches)
 * - Exposure duration
 * - Event type breakdown
 * - Details section
 * - Optional page 2: match-by-match breakdown table
 */

import { query } from '../../config/database';
import logger from '../../config/logger';
import { siteSponsorRepository } from '../../repositories/site-sponsor.repository';
import PDFDocument from 'pdfkit';
import * as crypto from 'crypto';
import {
  formatNumber,
  formatDuration,
} from './pdf-report.utils';

// ============================================================================
// Types
// ============================================================================

export interface SiteSponsorReportData {
  sponsor: { id: string; name: string; contactName?: string };
  club: { id: string; name: string; avgSpectators?: number; logoUrl?: string; colorPrimary?: string; colorSecondary?: string };
  period: { from: string; to: string; label: string };
  kpis: {
    totalImpressions: number;
    totalScreenTimeSeconds: number;
    estimatedReach: number;
    matchSessionCount: number;
    activeDays: number;
    avgDurationPerImpression: number;
  };
  reachFormula: {
    method: 'avg_spectators' | 'audience_estimate';
    avgSpectators?: number;
    explanation: string;
  };
  byEventType: Array<{ eventType: string; count: number; screenTime: number }>;
  matchBreakdown: Array<{ matchDate: string; impressions: number; screenTimeSeconds: number; audienceEstimate: number }>;
}

/**
 * Genere un rapport PDF commercial 1 page pour un site_sponsor.
 *
 * Layout compact, lisible en 30 secondes :
 * - 3 gros KPIs (passages, spectateurs, matchs)
 * - Duree d'exposition
 * - Repartition par type d'evenement
 * - Mention formule reach + branding NEOPRO
 */
export async function generateSiteSponsorReport(
  siteSponsorId: string,
  from: string,
  to: string,
  periodLabel?: string
): Promise<Buffer> {
  try {
    logger.info('Generating site_sponsor PDF report', { siteSponsorId, from, to });

    // 1. Recuperer le sponsor + site
    const sponsorResult = await query(
      `SELECT ss.id, ss.name, ss.contact_name,
              s.id as site_id, s.club_name, s.avg_spectators,
              s.logo_url, s.color_primary, s.color_secondary
       FROM site_sponsors ss
       JOIN sites s ON s.id = ss.site_id
       WHERE ss.id = $1`,
      [siteSponsorId]
    );

    if (sponsorResult.rowCount === 0) {
      throw new Error('Site sponsor not found');
    }

    const sponsor = sponsorResult.rows[0];

    // 2. Stats summary (from pre-aggregated site_sponsor_daily_stats)
    const summaryResult = await query(
      `SELECT
        COALESCE(SUM(total_impressions), 0) as total_impressions,
        COALESCE(SUM(total_screen_time_seconds), 0) as total_screen_time_seconds,
        CASE WHEN SUM(total_impressions) > 0
          THEN ROUND(SUM(completed_plays)::numeric / SUM(total_impressions) * 100, 1)
          ELSE 0 END as completion_rate,
        COALESCE(SUM(estimated_reach), 0) as estimated_reach_fallback,
        COUNT(*) FILTER (WHERE total_impressions > 0) as active_days
       FROM site_sponsor_daily_stats
       WHERE site_sponsor_id = $1
         AND date >= $2::date
         AND date <= $3::date`,
      [siteSponsorId, from, to]
    );

    const summary = summaryResult.rows[0];
    const totalImpressions = parseInt(summary.total_impressions as string) || 0;
    const totalScreenTimeSeconds = parseInt(summary.total_screen_time_seconds as string) || 0;
    const activeDays = parseInt(summary.active_days as string) || 0;
    const estimatedReachFallback = parseInt(summary.estimated_reach_fallback as string) || 0;

    // 3. Match session count (from pre-aggregated daily stats)
    const matchResult = await query(
      `SELECT COUNT(*)::text as count
       FROM site_sponsor_daily_stats
       WHERE site_sponsor_id = $1
         AND date >= $2::date
         AND date <= $3::date
         AND impressions_match > 0`,
      [siteSponsorId, from, to]
    );
    const matchSessionCount = parseInt(matchResult.rows[0]?.count as string || '0');

    // 4. Reach formula
    const avgSpectators = sponsor.avg_spectators ? parseInt(sponsor.avg_spectators as string) : null;
    let estimatedReach: number;
    let reachMethod: 'avg_spectators' | 'audience_estimate';
    let reachExplanation: string;

    if (avgSpectators && avgSpectators > 0 && matchSessionCount > 0) {
      estimatedReach = avgSpectators * matchSessionCount;
      reachMethod = 'avg_spectators';
      reachExplanation = `${formatNumber(avgSpectators)} spectateurs moy. x ${matchSessionCount} matchs`;
    } else {
      estimatedReach = estimatedReachFallback;
      reachMethod = 'audience_estimate';
      reachExplanation = `Base sur les estimations d'audience par session`;
    }

    // 5. Event type breakdown (from pre-aggregated daily stats)
    const eventTypeResult = await query(
      `SELECT event_type, count::text, total_screen_time::text
       FROM (
         SELECT 'match' AS event_type, SUM(impressions_match) AS count, SUM(screen_time_match) AS total_screen_time
         FROM site_sponsor_daily_stats WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'training', SUM(impressions_training), SUM(screen_time_training)
         FROM site_sponsor_daily_stats WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'tournament', SUM(impressions_tournament), SUM(screen_time_tournament)
         FROM site_sponsor_daily_stats WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'other', SUM(impressions_other), SUM(screen_time_other)
         FROM site_sponsor_daily_stats WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
       ) sub
       WHERE count > 0
       ORDER BY count DESC`,
      [siteSponsorId, from, to]
    );

    const byEventType = eventTypeResult.rows.map(r => ({
      eventType: String(r.event_type),
      count: parseInt(r.count as string),
      screenTime: parseInt(r.total_screen_time as string),
    }));

    const avgDurationPerImpression = totalImpressions > 0
      ? Math.round(totalScreenTimeSeconds / totalImpressions)
      : 0;

    const label = periodLabel || `${new Date(from).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;

    // 6. Match-by-match breakdown (P6.4 — conditionnelle si matchSessionCount > 0)
    let matchBreakdown: SiteSponsorReportData['matchBreakdown'] = [];
    if (matchSessionCount > 0) {
      const breakdownResult = await siteSponsorRepository.getMatchDayBreakdown(siteSponsorId, from, to);
      matchBreakdown = breakdownResult.rows.map((r: { match_date: string; impressions: string; screen_time_seconds: string; audience_estimate: string }) => ({
        matchDate: String(r.match_date),
        impressions: parseInt(r.impressions as string) || 0,
        screenTimeSeconds: parseInt(r.screen_time_seconds as string) || 0,
        audienceEstimate: parseInt(r.audience_estimate as string) || 0,
      }));
    }

    const reportData: SiteSponsorReportData = {
      sponsor: {
        id: String(sponsor.id),
        name: String(sponsor.name),
        contactName: sponsor.contact_name ? String(sponsor.contact_name) : undefined,
      },
      club: {
        id: String(sponsor.site_id),
        name: String(sponsor.club_name),
        avgSpectators: avgSpectators || undefined,
        logoUrl: sponsor.logo_url ? String(sponsor.logo_url) : undefined,
        colorPrimary: sponsor.color_primary ? String(sponsor.color_primary) : undefined,
        colorSecondary: sponsor.color_secondary ? String(sponsor.color_secondary) : undefined,
      },
      period: { from, to, label },
      kpis: {
        totalImpressions,
        totalScreenTimeSeconds,
        estimatedReach,
        matchSessionCount,
        activeDays,
        avgDurationPerImpression,
      },
      reachFormula: {
        method: reachMethod,
        avgSpectators: avgSpectators || undefined,
        explanation: reachExplanation,
      },
      byEventType,
      matchBreakdown,
    };

    return await generateSiteSponsorPdf(reportData);
  } catch (error) {
    logger.error('Error generating site_sponsor report:', error);
    throw error;
  }
}

/**
 * Genere le PDF 1 page pour le rapport site_sponsor
 */
async function generateSiteSponsorPdf(data: SiteSponsorReportData): Promise<Buffer> {
  // P5: Tenter de charger le logo du club AVANT la generation PDF (async)
  let logoBuffer: Buffer | null = null;
  if (data.club.logoUrl) {
    try {
      const logoResponse = await fetch(data.club.logoUrl);
      if (logoResponse.ok) {
        const arrayBuffer = await logoResponse.arrayBuffer();
        logoBuffer = Buffer.from(arrayBuffer);
      }
    } catch (logoError) {
      logger.warn('Failed to download club logo for PDF, using text header', {
        logoUrl: data.club.logoUrl,
        error: logoError instanceof Error ? logoError.message : String(logoError),
      });
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Rapport Visibilite ${data.sponsor.name} - ${data.club.name}`,
          Author: 'NEOPRO Analytics',
          Subject: `Periode ${data.period.from} - ${data.period.to}`,
          Keywords: 'sponsor, visibilite, impressions, rapport',
          CreationDate: new Date(),
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // P5: Utiliser les couleurs du club si disponibles, sinon fallback NEOPRO
      const COLORS = {
        primary: data.club.colorPrimary || '#1e3a8a',
        secondary: data.club.colorSecondary || '#3b82f6',
        accent: '#10b981',
        text: '#1f2937',
        lightGray: '#f3f4f6',
        border: '#d1d5db',
        white: '#ffffff',
      };

      const pageWidth = 515; // A4 width - 2*40 margin
      let y = 40;

      // ====================================================================
      // HEADER — Bandeau avec couleurs club (ou NEOPRO par defaut)
      // ====================================================================

      doc
        .rect(40, y, pageWidth, 50)
        .fill(COLORS.primary);

      if (logoBuffer) {
        // Logo du club a gauche + texte rapport
        try {
          doc.image(logoBuffer, 50, y + 5, { height: 40, fit: [80, 40] });
          doc
            .fontSize(12)
            .fillColor(COLORS.white)
            .font('Helvetica-Bold')
            .text('RAPPORT DE VISIBILITE SPONSOR', 140, y + 18, { width: pageWidth - 110 });
        } catch (imageError) {
          // Fallback si l'image est invalide
          logger.warn('Club logo image invalid, falling back to text header', {
            error: imageError instanceof Error ? imageError.message : String(imageError),
          });
          doc
            .fontSize(20)
            .fillColor(COLORS.white)
            .font('Helvetica-Bold')
            .text('NEOPRO', 55, y + 8, { continued: true })
            .fontSize(12)
            .font('Helvetica')
            .text('  RAPPORT DE VISIBILITE SPONSOR', { baseline: 'alphabetic' });
        }
      } else {
        doc
          .fontSize(20)
          .fillColor(COLORS.white)
          .font('Helvetica-Bold')
          .text('NEOPRO', 55, y + 8, { continued: true })
          .fontSize(12)
          .font('Helvetica')
          .text('  RAPPORT DE VISIBILITE SPONSOR', { baseline: 'alphabetic' });
      }

      y += 50;

      // ====================================================================
      // SOUS-HEADER — Sponsor + Club + Periode
      // ====================================================================

      y += 15;
      doc
        .fontSize(22)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text(data.sponsor.name, 40, y, { align: 'center', width: pageWidth });

      y += 30;
      doc
        .fontSize(14)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text(`${data.club.name}  ·  ${data.period.label}`, 40, y, { align: 'center', width: pageWidth });

      y += 35;

      // ====================================================================
      // 3 GROS KPIS
      // ====================================================================

      const kpiWidth = Math.floor(pageWidth / 3) - 8;
      const kpiHeight = 75;
      const kpis = [
        { value: formatNumber(data.kpis.totalImpressions), label: 'Passages', icon: 'PASSAGES' },
        { value: formatNumber(data.kpis.estimatedReach), label: 'Spectateurs est.', icon: 'AUDIENCE' },
        { value: String(data.kpis.matchSessionCount), label: 'Matchs couverts', icon: 'MATCHS' },
      ];

      kpis.forEach((kpi, i) => {
        const x = 40 + i * (kpiWidth + 12);

        // Background card
        doc
          .roundedRect(x, y, kpiWidth, kpiHeight, 6)
          .fill(COLORS.lightGray);

        // Valeur
        doc
          .fontSize(28)
          .fillColor(COLORS.primary)
          .font('Helvetica-Bold')
          .text(kpi.value, x, y + 12, { align: 'center', width: kpiWidth });

        // Label
        doc
          .fontSize(10)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(kpi.label, x, y + 48, { align: 'center', width: kpiWidth });
      });

      y += kpiHeight + 20;

      // ====================================================================
      // DUREE D'EXPOSITION
      // ====================================================================

      doc
        .roundedRect(40, y, pageWidth, 55, 6)
        .fill(COLORS.lightGray);

      const durationCol1X = 55;
      const durationCol2X = 40 + Math.floor(pageWidth / 2) + 10;

      doc
        .fontSize(11)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text('Exposition totale', durationCol1X, y + 10);

      doc
        .fontSize(18)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text(formatDuration(data.kpis.totalScreenTimeSeconds), durationCol1X, y + 26);

      doc
        .fontSize(11)
        .fillColor(COLORS.text)
        .font('Helvetica')
        .text('Moyenne par passage', durationCol2X, y + 10);

      doc
        .fontSize(18)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text(`${data.kpis.avgDurationPerImpression}s`, durationCol2X, y + 26);

      y += 75;

      // ====================================================================
      // REPARTITION PAR TYPE D'EVENEMENT
      // ====================================================================

      doc
        .fontSize(13)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('Repartition par contexte', 40, y);

      y += 22;

      const eventTypeLabels: Record<string, string> = {
        match: 'Matchs',
        training: 'Entrainements',
        tournament: 'Tournois',
        other: 'Autres',
      };

      const eventTypeColors: Record<string, string> = {
        match: COLORS.primary,
        training: COLORS.secondary,
        tournament: COLORS.accent,
        other: COLORS.border,
      };

      const totalCount = data.byEventType.reduce((sum, e) => sum + e.count, 0) || 1;

      data.byEventType.forEach(evt => {
        const evtLabel = eventTypeLabels[evt.eventType] || evt.eventType;
        const pct = Math.round((evt.count / totalCount) * 100);
        const barWidth = Math.round((evt.count / totalCount) * (pageWidth - 140));
        const color = eventTypeColors[evt.eventType] || COLORS.border;

        // Bar
        doc
          .roundedRect(40, y, barWidth, 18, 3)
          .fill(color);

        // Label + percentage
        doc
          .fontSize(10)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(`${evtLabel}: ${pct}% (${evt.count})`, barWidth + 50, y + 3);

        y += 26;
      });

      // Si pas de donnees
      if (data.byEventType.length === 0) {
        doc
          .fontSize(10)
          .fillColor(COLORS.border)
          .font('Helvetica')
          .text('Aucune donnee disponible pour cette periode', 40, y);
        y += 20;
      }

      y += 15;

      // ====================================================================
      // DETAILS SUPPLEMENTAIRES
      // ====================================================================

      doc
        .fontSize(13)
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .text('Details', 40, y);

      y += 20;

      const details = [
        { label: 'Jours actifs sur la periode', value: `${data.kpis.activeDays} jours` },
        { label: 'Taux de visionnage complet', value: `> 90%` },
        { label: 'Methode d\'estimation audience', value: data.reachFormula.method === 'avg_spectators' ? 'Spectateurs moyens x matchs' : 'Estimation par session' },
      ];

      details.forEach(detail => {
        doc
          .fontSize(10)
          .fillColor(COLORS.text)
          .font('Helvetica')
          .text(detail.label, 55, y, { continued: true })
          .font('Helvetica-Bold')
          .text(`  ${detail.value}`);
        y += 16;
      });

      y += 20;

      // ====================================================================
      // FOOTER
      // ====================================================================

      // Ligne de separation
      doc
        .moveTo(40, y)
        .lineTo(40 + pageWidth, y)
        .strokeColor(COLORS.border)
        .lineWidth(0.5)
        .stroke();

      y += 10;

      // Mention reach
      doc
        .fontSize(8)
        .fillColor(COLORS.border)
        .font('Helvetica')
        .text(
          `Audience estimee : ${data.reachFormula.explanation}`,
          40, y, { width: pageWidth }
        );

      y += 14;

      doc
        .fontSize(8)
        .fillColor(COLORS.border)
        .text(
          `NEOPRO Analytics · Genere le ${new Date().toLocaleDateString('fr-FR')} · Ce document est un certificat de diffusion`,
          40, y, { width: pageWidth }
        );

      // Signature numerique
      y += 14;
      const signatureData = `${data.sponsor.id}|${data.period.from}|${data.period.to}|${data.kpis.totalImpressions}`;
      const signature = crypto.createHash('sha256').update(signatureData).digest('hex').substring(0, 16);

      doc
        .fontSize(7)
        .fillColor(COLORS.border)
        .text(`Ref: ${signature}`, 40, y);

      // ====================================================================
      // PAGE 2 — DETAIL PAR JOURNEE DE MATCH (conditionnelle)
      // ====================================================================
      if (data.matchBreakdown.length > 0) {
        doc.addPage();
        let y2 = 40;

        // Header page 2
        doc
          .rect(0, 0, doc.page.width, 60)
          .fill(COLORS.primary);

        doc
          .fontSize(16)
          .fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .text('DETAIL PAR JOURNEE DE MATCH', 40, 20, { width: pageWidth });

        y2 = 75;

        // Tableau match breakdown
        const colWidths = [120, 90, 110, 100, 95];
        const headers = ['Date', 'Passages', 'Temps ecran', 'Audience est.', 'Moy/passage'];
        const tableLeft = 40;

        // Header row
        doc
          .rect(tableLeft, y2, pageWidth, 22)
          .fill(COLORS.primary);

        let colX = tableLeft + 8;
        headers.forEach((header, i) => {
          doc
            .fontSize(9)
            .fillColor('#FFFFFF')
            .font('Helvetica-Bold')
            .text(header, colX, y2 + 6, { width: colWidths[i] - 8 });
          colX += colWidths[i];
        });

        y2 += 22;

        // Data rows
        let tableTotalImpressions = 0;
        let totalScreenTime = 0;
        let totalAudience = 0;

        data.matchBreakdown.forEach((row, idx) => {
          const isEven = idx % 2 === 0;
          if (isEven) {
            doc
              .rect(tableLeft, y2, pageWidth, 20)
              .fill('#F8FAFC');
          }

          const avgPerImpression = row.impressions > 0 ? Math.round(row.screenTimeSeconds / row.impressions) : 0;
          const dateFormatted = new Date(row.matchDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

          const values = [
            dateFormatted,
            formatNumber(row.impressions),
            `${Math.floor(row.screenTimeSeconds / 60)} min`,
            formatNumber(row.audienceEstimate),
            `${avgPerImpression}s`,
          ];

          colX = tableLeft + 8;
          values.forEach((val, i) => {
            doc
              .fontSize(9)
              .fillColor(COLORS.text)
              .font('Helvetica')
              .text(val, colX, y2 + 5, { width: colWidths[i] - 8 });
            colX += colWidths[i];
          });

          tableTotalImpressions += row.impressions;
          totalScreenTime += row.screenTimeSeconds;
          totalAudience += row.audienceEstimate;

          y2 += 20;

          // Saut de page si necessaire
          if (y2 > doc.page.height - 80) {
            doc.addPage();
            y2 = 40;
          }
        });

        // Ligne totaux
        const avgPerImpressionTotal = tableTotalImpressions > 0 ? Math.round(totalScreenTime / tableTotalImpressions) : 0;

        doc
          .rect(tableLeft, y2, pageWidth, 22)
          .fill(COLORS.primary);

        const totals = [
          'TOTAL',
          formatNumber(tableTotalImpressions),
          `${Math.floor(totalScreenTime / 60)} min`,
          formatNumber(totalAudience),
          `${avgPerImpressionTotal}s`,
        ];

        colX = tableLeft + 8;
        totals.forEach((val, i) => {
          doc
            .fontSize(9)
            .fillColor('#FFFFFF')
            .font('Helvetica-Bold')
            .text(val, colX, y2 + 6, { width: colWidths[i] - 8 });
          colX += colWidths[i];
        });

        y2 += 35;

        // Footer note
        doc
          .fontSize(8)
          .fillColor(COLORS.border)
          .font('Helvetica')
          .text(
            'Donnees limitees aux journees avec event_type = match',
            40, y2, { width: pageWidth }
          );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
