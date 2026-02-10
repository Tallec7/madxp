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
import { generateClubReport, generateAdvertiserReport } from './pdf-report.service';
import logger from '../config/logger';
import * as crypto from 'crypto';

// Types
interface GeneratedReport {
  id: string;
  report_type: 'club' | 'advertiser' | 'fleet';
  site_id: string | null;
  advertiser_id: string | null;
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
    const insertResult = await query(`
      INSERT INTO generated_reports (report_type, site_id, period_start, period_end, period_label, status)
      VALUES ('club', $1, $2, $3, $4, 'generating')
      ON CONFLICT (report_type, site_id, advertiser_id, period_start, period_end)
      DO UPDATE SET status = 'generating', error_message = NULL
      RETURNING id
    `, [siteId, periodStart, periodEnd, periodLabel]);

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

    logger.info(`[MonthlyReports] Club report completed for ${siteId}`, {
      reportId,
      size: pdfBuffer.length,
    });

    return {
      success: true,
      reportId,
      url: storageUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[MonthlyReports] Failed to generate club report for ${siteId}`, { error: errorMessage });

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
    const insertResult = await query(`
      INSERT INTO generated_reports (report_type, advertiser_id, period_start, period_end, period_label, status)
      VALUES ('advertiser', $1, $2, $3, $4, 'generating')
      ON CONFLICT (report_type, site_id, advertiser_id, period_start, period_end)
      DO UPDATE SET status = 'generating', error_message = NULL
      RETURNING id
    `, [advertiserId, periodStart, periodEnd, periodLabel]);

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

    logger.info(`[MonthlyReports] Advertiser report completed for ${advertiserId}`, {
      reportId,
      size: pdfBuffer.length,
    });

    return {
      success: true,
      reportId,
      url: storageUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[MonthlyReports] Failed to generate advertiser report for ${advertiserId}`, { error: errorMessage });

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
  type: 'club' | 'advertiser',
  entityId: string,
  periodStart: string,
  periodEnd: string,
  userId?: string
): Promise<ReportGenerationResult> {
  const periodLabel = formatPeriodLabel(periodStart, periodEnd);

  if (type === 'club') {
    return generateSingleClubReport(entityId, periodStart, periodEnd, periodLabel);
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
  getReportById,
  generateReportOnDemand,
};
