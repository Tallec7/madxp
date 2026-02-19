/**
 * Monthly Reports Service
 *
 * Génère automatiquement des rapports PDF mensuels pour:
 * - Tous les clubs actifs
 * - Tous les annonceurs avec des vidéos
 *
 * Les rapports sont stockés sur FTP et enregistrés en base
 */

import { query } from '../config/database';
import { uploadAsset, getAssetUrl } from './storage.service';
import { generateClubReport, generateAdvertiserReport, generateSiteSponsorReport } from './pdf-report.service';
import emailService from './email.service';
import { metricsService } from './metrics.service';
import logger from '../config/logger';
import * as crypto from 'crypto';

// Types
interface GeneratedReport {
  id: string;
  report_type: 'club' | 'advertiser' | 'fleet' | 'site_sponsor';
  site_id: string | null;
  advertiser_id: string | null;
  site_sponsor_id: string | null;
  period_start: string;
  period_end: string;
  period_label: string;
  storage_path: string;
  storage_url: string | null;
  file_size_bytes: number | null;
  checksum: string | null;
  summary_data: Record<string, unknown>;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ReportGenerationResult {
  success: boolean;
  reportId?: string;
  url?: string;
  error?: string;
}

/**
 * Génère les rapports mensuels pour le mois précédent
 * Appelé automatiquement le 1er de chaque mois à 2h du matin
 */
export async function generateMonthlyReports(): Promise<{
  total: number;
  success: number;
  failed: number;
  reports: ReportGenerationResult[];
}> {
  const results: ReportGenerationResult[] = [];

  // Calculer la période du mois précédent
  const now = new Date();
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const periodStart = firstDayLastMonth.toISOString().split('T')[0];
  const periodEnd = lastDayLastMonth.toISOString().split('T')[0];
  const periodLabel = firstDayLastMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  logger.info('[MonthlyReports] Starting monthly report generation', {
    periodStart,
    periodEnd,
    periodLabel,
  });

  // 1. Générer les rapports clubs
  const clubResults = await generateClubReports(periodStart, periodEnd, periodLabel);
  results.push(...clubResults);

  // 2. Générer les rapports annonceurs
  const advertiserResults = await generateAdvertiserReports(periodStart, periodEnd, periodLabel);
  results.push(...advertiserResults);

  // 3. Générer les rapports sponsors locaux (site_sponsors)
  const siteSponsorResults = await generateSiteSponsorReports(periodStart, periodEnd, periodLabel);
  results.push(...siteSponsorResults);

  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  logger.info('[MonthlyReports] Monthly report generation completed', {
    total: results.length,
    success,
    failed,
  });

  return {
    total: results.length,
    success,
    failed,
    reports: results,
  };
}

/**
 * Génère les rapports pour tous les clubs actifs
 */
async function generateClubReports(
  periodStart: string,
  periodEnd: string,
  periodLabel: string
): Promise<ReportGenerationResult[]> {
  const results: ReportGenerationResult[] = [];

  // Récupérer tous les sites actifs (online dans les 30 derniers jours ou avec activité)
  const sitesResult = await query(`
    SELECT DISTINCT s.id, s.site_name, s.club_name
    FROM sites s
    LEFT JOIN club_sessions cs ON cs.site_id = s.id
      AND cs.started_at >= $1::date
      AND cs.started_at <= $2::date
    WHERE s.status != 'archived'
      AND (
        s.last_seen_at > NOW() - INTERVAL '30 days'
        OR cs.id IS NOT NULL
      )
    ORDER BY s.site_name
  `, [periodStart, periodEnd]);

  logger.info(`[MonthlyReports] Found ${sitesResult.rowCount} clubs to generate reports for`);

  for (const site of sitesResult.rows) {
    const result = await generateSingleClubReport(
      site.id as string,
      periodStart,
      periodEnd,
      periodLabel
    );
    results.push(result);

    // Petite pause pour ne pas surcharger le système
    await sleep(500);
  }

  return results;
}

/**
 * Génère un rapport pour un club spécifique
 */
async function generateSingleClubReport(
  siteId: string,
  periodStart: string,
  periodEnd: string,
  periodLabel: string
): Promise<ReportGenerationResult> {
  const startTime = Date.now();
  try {
    // Vérifier si le rapport existe déjà
    const existingResult = await query(`
      SELECT id, storage_url, status
      FROM generated_reports
      WHERE report_type = 'club'
        AND site_id = $1
        AND period_start = $2
        AND period_end = $3
        AND status = 'completed'
    `, [siteId, periodStart, periodEnd]);

    if (existingResult.rowCount && existingResult.rowCount > 0) {
      logger.info(`[MonthlyReports] Club report already exists for ${siteId}`);
      return {
        success: true,
        reportId: existingResult.rows[0].id as string,
        url: existingResult.rows[0].storage_url as string,
      };
    }

    // Créer l'entrée en DB avec statut 'generating'
    // storage_path est NOT NULL en DB, on met un placeholder qui sera écrasé après upload
    const storagePlaceholder = `reports/clubs/${siteId}/${periodStart.substring(0, 7)}.pdf`;
    const insertResult = await query(`
      INSERT INTO generated_reports (report_type, site_id, period_start, period_end, period_label, storage_path, status)
      VALUES ('club', $1, $2, $3, $4, $5, 'generating')
      ON CONFLICT (report_type, site_id, advertiser_id, period_start, period_end)
      DO UPDATE SET status = 'generating', error_message = NULL
      RETURNING id
    `, [siteId, periodStart, periodEnd, periodLabel, storagePlaceholder]);

    const reportId = insertResult.rows[0].id as string;

    // Générer le PDF
    logger.info(`[MonthlyReports] Generating club report for ${siteId}`);
    const pdfBuffer = await generateClubReport(siteId, periodStart, periodEnd, {
      type: 'club',
      includeSignature: true,
    });

    // Calculer checksum
    const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Upload vers le storage via storage service
    const filename = `reports/clubs/${siteId}/${periodStart.substring(0, 7)}.pdf`;
    await uploadAsset(pdfBuffer, filename, 'application/pdf');
    const storageUrl = getAssetUrl(filename);

    // Mettre à jour l'entrée en DB
    await query(`
      UPDATE generated_reports
      SET status = 'completed',
          storage_path = $2,
          storage_url = $3,
          file_size_bytes = $4,
          checksum = $5,
          completed_at = NOW()
      WHERE id = $1
    `, [reportId, filename, storageUrl, pdfBuffer.length, checksum]);

    const durationSeconds = (Date.now() - startTime) / 1000;
    metricsService.recordReportGeneration('club', 'success', durationSeconds);

    logger.info(`[MonthlyReports] Club report completed for ${siteId}`, {
      reportId,
      size: pdfBuffer.length,
      durationSeconds,
    });

    return {
      success: true,
      reportId,
      url: storageUrl,
    };
  } catch (error) {
    const durationSeconds = (Date.now() - startTime) / 1000;
    metricsService.recordReportGeneration('club', 'failed', durationSeconds);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[MonthlyReports] Failed to generate club report for ${siteId}`, { error: errorMessage, durationSeconds });

    // Mettre à jour le statut en échec
    await query(`
      UPDATE generated_reports
      SET status = 'failed', error_message = $2
      WHERE site_id = $1 AND period_start = $3 AND period_end = $4
    `, [siteId, errorMessage, periodStart, periodEnd]).catch(() => {});

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Génère les rapports pour tous les annonceurs actifs
 */
async function generateAdvertiserReports(
  periodStart: string,
  periodEnd: string,
  periodLabel: string
): Promise<ReportGenerationResult[]> {
  const results: ReportGenerationResult[] = [];

  // Récupérer tous les annonceurs avec des impressions sur la période
  const advertisersResult = await query(`
    SELECT DISTINCT a.id, a.name
    FROM advertisers a
    JOIN advertiser_videos av ON av.advertiser_id = a.id
    JOIN advertiser_impressions ai ON ai.video_id = av.video_id
    WHERE ai.played_at >= $1::date
      AND ai.played_at <= $2::date
      AND a.status = 'active'
    ORDER BY a.name
  `, [periodStart, periodEnd]);

  logger.info(`[MonthlyReports] Found ${advertisersResult.rowCount} advertisers to generate reports for`);

  for (const advertiser of advertisersResult.rows) {
    const result = await generateSingleAdvertiserReport(
      advertiser.id as string,
      periodStart,
      periodEnd,
      periodLabel
    );
    results.push(result);

    await sleep(500);
  }

  return results;
}

/**
 * Génère un rapport pour un annonceur spécifique
 */
async function generateSingleAdvertiserReport(
  advertiserId: string,
  periodStart: string,
  periodEnd: string,
  periodLabel: string
): Promise<ReportGenerationResult> {
  const startTime = Date.now();
  try {
    // Vérifier si le rapport existe déjà
    const existingResult = await query(`
      SELECT id, storage_url, status
      FROM generated_reports
      WHERE report_type = 'advertiser'
        AND advertiser_id = $1
        AND period_start = $2
        AND period_end = $3
        AND status = 'completed'
    `, [advertiserId, periodStart, periodEnd]);

    if (existingResult.rowCount && existingResult.rowCount > 0) {
      logger.info(`[MonthlyReports] Advertiser report already exists for ${advertiserId}`);
      return {
        success: true,
        reportId: existingResult.rows[0].id as string,
        url: existingResult.rows[0].storage_url as string,
      };
    }

    // Créer l'entrée en DB
    // storage_path est NOT NULL en DB, on met un placeholder qui sera écrasé après upload
    const storagePlaceholder = `reports/advertisers/${advertiserId}/${periodStart.substring(0, 7)}.pdf`;
    const insertResult = await query(`
      INSERT INTO generated_reports (report_type, advertiser_id, period_start, period_end, period_label, storage_path, status)
      VALUES ('advertiser', $1, $2, $3, $4, $5, 'generating')
      ON CONFLICT (report_type, site_id, advertiser_id, period_start, period_end)
      DO UPDATE SET status = 'generating', error_message = NULL
      RETURNING id
    `, [advertiserId, periodStart, periodEnd, periodLabel, storagePlaceholder]);

    const reportId = insertResult.rows[0].id as string;

    // Générer le PDF
    logger.info(`[MonthlyReports] Generating advertiser report for ${advertiserId}`);
    const pdfBuffer = await generateAdvertiserReport(advertiserId, periodStart, periodEnd, {
      type: 'advertiser',
      includeSignature: true,
    });

    // Calculer checksum
    const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Upload via storage service
    const filename = `reports/advertisers/${advertiserId}/${periodStart.substring(0, 7)}.pdf`;
    await uploadAsset(pdfBuffer, filename, 'application/pdf');
    const storageUrl = getAssetUrl(filename);

    // Mettre à jour l'entrée
    await query(`
      UPDATE generated_reports
      SET status = 'completed',
          storage_path = $2,
          storage_url = $3,
          file_size_bytes = $4,
          checksum = $5,
          completed_at = NOW()
      WHERE id = $1
    `, [reportId, filename, storageUrl, pdfBuffer.length, checksum]);

    const durationSeconds = (Date.now() - startTime) / 1000;
    metricsService.recordReportGeneration('advertiser', 'success', durationSeconds);

    logger.info(`[MonthlyReports] Advertiser report completed for ${advertiserId}`, {
      reportId,
      size: pdfBuffer.length,
      durationSeconds,
    });

    return {
      success: true,
      reportId,
      url: storageUrl,
    };
  } catch (error) {
    const durationSeconds = (Date.now() - startTime) / 1000;
    metricsService.recordReportGeneration('advertiser', 'failed', durationSeconds);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[MonthlyReports] Failed to generate advertiser report for ${advertiserId}`, { error: errorMessage, durationSeconds });

    await query(`
      UPDATE generated_reports
      SET status = 'failed', error_message = $2
      WHERE advertiser_id = $1 AND period_start = $3 AND period_end = $4
    `, [advertiserId, errorMessage, periodStart, periodEnd]).catch(() => {});

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Génère les rapports pour tous les sponsors locaux actifs (site_sponsors)
 */
async function generateSiteSponsorReports(
  periodStart: string,
  periodEnd: string,
  periodLabel: string
): Promise<ReportGenerationResult[]> {
  const results: ReportGenerationResult[] = [];

  // Récupérer tous les site_sponsors avec des impressions sur la période
  const sponsorsResult = await query(`
    SELECT DISTINCT ss.id, ss.name, ss.contact_email, ss.site_id,
           s.club_name
    FROM site_sponsors ss
    JOIN sites s ON s.id = ss.site_id
    JOIN advertiser_impressions ai ON ai.site_sponsor_id = ss.id
    WHERE ai.played_at >= $1::date
      AND ai.played_at <= $2::date
      AND ss.status = 'active'
    ORDER BY ss.name
  `, [periodStart, periodEnd]);

  logger.info(`[MonthlyReports] Found ${sponsorsResult.rowCount} site_sponsors to generate reports for`);

  for (const sponsor of sponsorsResult.rows) {
    const result = await generateSingleSiteSponsorReport(
      sponsor.id as string,
      sponsor.site_id as string,
      sponsor.contact_email as string | null,
      sponsor.name as string,
      sponsor.club_name as string,
      periodStart,
      periodEnd,
      periodLabel
    );
    results.push(result);

    await sleep(500);
  }

  return results;
}

/**
 * Génère un rapport pour un sponsor local (site_sponsor) spécifique
 */
async function generateSingleSiteSponsorReport(
  siteSponsorId: string,
  siteId: string,
  contactEmail: string | null,
  sponsorName: string,
  clubName: string,
  periodStart: string,
  periodEnd: string,
  periodLabel: string
): Promise<ReportGenerationResult> {
  const startTime = Date.now();
  try {
    // Vérifier si le rapport existe déjà
    const existingResult = await query(`
      SELECT id, storage_url, status
      FROM generated_reports
      WHERE report_type = 'site_sponsor'
        AND site_sponsor_id = $1
        AND period_start = $2
        AND period_end = $3
        AND status = 'completed'
    `, [siteSponsorId, periodStart, periodEnd]);

    if (existingResult.rowCount && existingResult.rowCount > 0) {
      logger.info(`[MonthlyReports] Site sponsor report already exists for ${siteSponsorId}`);
      return {
        success: true,
        reportId: existingResult.rows[0].id as string,
        url: existingResult.rows[0].storage_url as string,
      };
    }

    // Créer l'entrée en DB avec statut 'generating'
    const storagePlaceholder = `reports/site-sponsors/${siteSponsorId}/${periodStart.substring(0, 7)}.pdf`;
    const insertResult = await query(`
      INSERT INTO generated_reports (report_type, site_id, site_sponsor_id, period_start, period_end, period_label, storage_path, status)
      VALUES ('site_sponsor', $1, $2, $3, $4, $5, $6, 'generating')
      ON CONFLICT (report_type, site_id, advertiser_id, site_sponsor_id, period_start, period_end)
      DO UPDATE SET status = 'generating', error_message = NULL
      RETURNING id
    `, [siteId, siteSponsorId, periodStart, periodEnd, periodLabel, storagePlaceholder]);

    const reportId = insertResult.rows[0].id as string;

    // Générer le PDF
    logger.info(`[MonthlyReports] Generating site sponsor report for ${siteSponsorId} (${sponsorName})`);
    const pdfBuffer = await generateSiteSponsorReport(siteSponsorId, periodStart, periodEnd);

    // Calculer checksum
    const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Upload via storage service
    const filename = `reports/site-sponsors/${siteSponsorId}/${periodStart.substring(0, 7)}.pdf`;
    await uploadAsset(pdfBuffer, filename, 'application/pdf');
    const storageUrl = getAssetUrl(filename);

    // Mettre à jour l'entrée en DB
    await query(`
      UPDATE generated_reports
      SET status = 'completed',
          storage_path = $2,
          storage_url = $3,
          file_size_bytes = $4,
          checksum = $5,
          completed_at = NOW()
      WHERE id = $1
    `, [reportId, filename, storageUrl, pdfBuffer.length, checksum]);

    // Envoyer par email si contact_email est défini
    if (contactEmail) {
      try {
        const pdfFilename = `rapport-${sponsorName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${periodStart.substring(0, 7)}.pdf`;
        await emailService.sendSponsorReport(contactEmail, {
          sponsorName,
          clubName,
          period: periodLabel,
          pdfBuffer,
          pdfFilename,
        });
        logger.info(`[MonthlyReports] Sponsor report emailed to ${contactEmail}`, { siteSponsorId });
      } catch (emailError) {
        // L'email n'est pas bloquant — le rapport est quand même généré
        const emailMsg = emailError instanceof Error ? emailError.message : 'Unknown email error';
        logger.warn(`[MonthlyReports] Failed to email sponsor report for ${siteSponsorId}`, { error: emailMsg, contactEmail });
      }
    }

    const durationSeconds = (Date.now() - startTime) / 1000;
    metricsService.recordReportGeneration('site_sponsor', 'success', durationSeconds);

    logger.info(`[MonthlyReports] Site sponsor report completed for ${siteSponsorId}`, {
      reportId,
      size: pdfBuffer.length,
      durationSeconds,
      emailed: !!contactEmail,
    });

    return {
      success: true,
      reportId,
      url: storageUrl,
    };
  } catch (error) {
    const durationSeconds = (Date.now() - startTime) / 1000;
    metricsService.recordReportGeneration('site_sponsor', 'failed', durationSeconds);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[MonthlyReports] Failed to generate site sponsor report for ${siteSponsorId}`, { error: errorMessage, durationSeconds });

    // Mettre à jour le statut en échec
    await query(`
      UPDATE generated_reports
      SET status = 'failed', error_message = $2
      WHERE site_sponsor_id = $1 AND period_start = $3 AND period_end = $4
    `, [siteSponsorId, errorMessage, periodStart, periodEnd]).catch(() => {});

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Récupère la liste des rapports pour un club
 */
export async function getClubReports(
  siteId: string,
  limit: number = 12
): Promise<GeneratedReport[]> {
  const result = await query(`
    SELECT *
    FROM generated_reports
    WHERE report_type = 'club'
      AND site_id = $1
      AND status = 'completed'
    ORDER BY period_start DESC
    LIMIT $2
  `, [siteId, limit]);

  return result.rows as unknown as GeneratedReport[];
}

/**
 * Récupère la liste des rapports pour un annonceur
 */
export async function getAdvertiserReports(
  advertiserId: string,
  limit: number = 12
): Promise<GeneratedReport[]> {
  const result = await query(`
    SELECT *
    FROM generated_reports
    WHERE report_type = 'advertiser'
      AND advertiser_id = $1
      AND status = 'completed'
    ORDER BY period_start DESC
    LIMIT $2
  `, [advertiserId, limit]);

  return result.rows as unknown as GeneratedReport[];
}

/**
 * Récupère la liste des rapports pour un sponsor local (site_sponsor)
 */
export async function getSiteSponsorReports(
  siteSponsorId: string,
  limit: number = 12
): Promise<GeneratedReport[]> {
  const result = await query(`
    SELECT *
    FROM generated_reports
    WHERE report_type = 'site_sponsor'
      AND site_sponsor_id = $1
      AND status = 'completed'
    ORDER BY period_start DESC
    LIMIT $2
  `, [siteSponsorId, limit]);

  return result.rows as unknown as GeneratedReport[];
}

/**
 * Récupère un rapport par son ID
 */
export async function getReportById(reportId: string): Promise<GeneratedReport | null> {
  const result = await query(`
    SELECT *
    FROM generated_reports
    WHERE id = $1
  `, [reportId]);

  return result.rows[0] as unknown as GeneratedReport | null;
}

/**
 * Génère un rapport à la demande (non planifié)
 */
export async function generateReportOnDemand(
  type: 'club' | 'advertiser' | 'site_sponsor',
  entityId: string,
  periodStart: string,
  periodEnd: string,
  _userId?: string
): Promise<ReportGenerationResult> {
  const periodLabel = formatPeriodLabel(periodStart, periodEnd);

  if (type === 'club') {
    return generateSingleClubReport(entityId, periodStart, periodEnd, periodLabel);
  } else if (type === 'site_sponsor') {
    // Pour site_sponsor, on a besoin du site_id et des infos pour l'email
    // On les récupère depuis la DB
    const sponsorResult = await query(`
      SELECT ss.id, ss.site_id, ss.contact_email, ss.name,
             s.club_name
      FROM site_sponsors ss
      JOIN sites s ON s.id = ss.site_id
      WHERE ss.id = $1
    `, [entityId]);

    if (!sponsorResult.rowCount || sponsorResult.rowCount === 0) {
      return { success: false, error: `Site sponsor ${entityId} not found` };
    }

    const sponsor = sponsorResult.rows[0];
    return generateSingleSiteSponsorReport(
      sponsor.id as string,
      sponsor.site_id as string,
      sponsor.contact_email as string | null,
      sponsor.name as string,
      sponsor.club_name as string,
      periodStart,
      periodEnd,
      periodLabel
    );
  } else {
    return generateSingleAdvertiserReport(entityId, periodStart, periodEnd, periodLabel);
  }
}

/**
 * Formate le label de période
 */
function formatPeriodLabel(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Si c'est le même mois
  if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
    return startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  // Sinon, afficher la plage
  return `${startDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  generateMonthlyReports,
  getClubReports,
  getAdvertiserReports,
  getSiteSponsorReports,
  getReportById,
  generateReportOnDemand,
};
