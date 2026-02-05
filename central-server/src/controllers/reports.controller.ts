/**
 * Reports Controller
 *
 * Gère les endpoints pour les rapports PDF générés
 */

import { Response } from 'express';
import { AuthRequest } from '../types';
import { getClubReports, getAdvertiserReports, getReportById, generateReportOnDemand } from '../services/monthly-reports.service';
import { query } from '../config/database';
import logger from '../config/logger';

/**
 * Liste les rapports d'un club
 */
export const listClubReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId } = req.params;
    const limit = parseInt(req.query.limit as string) || 12;

    const reports = await getClubReports(siteId, limit);

    res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    logger.error('[ReportsController] Error listing club reports', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des rapports' });
  }
};

/**
 * Liste les rapports d'un annonceur
 */
export const listAdvertiserReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { advertiserId } = req.params;
    const limit = parseInt(req.query.limit as string) || 12;

    const reports = await getAdvertiserReports(advertiserId, limit);

    res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    logger.error('[ReportsController] Error listing advertiser reports', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des rapports' });
  }
};

/**
 * Récupère un rapport par son ID
 */
export const getReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reportId } = req.params;

    const report = await getReportById(reportId);

    if (!report) {
      res.status(404).json({ error: 'Rapport non trouvé' });
      return;
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('[ReportsController] Error getting report', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération du rapport' });
  }
};

/**
 * Génère un rapport à la demande
 */
export const generateReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, entityId, periodStart, periodEnd } = req.body;

    if (!type || !entityId || !periodStart || !periodEnd) {
      res.status(400).json({ error: 'Paramètres manquants: type, entityId, periodStart, periodEnd' });
      return;
    }

    if (!['club', 'advertiser'].includes(type)) {
      res.status(400).json({ error: 'Type de rapport invalide. Utilisez "club" ou "advertiser"' });
      return;
    }

    // Vérifier que l'entité existe
    if (type === 'club') {
      const siteResult = await query('SELECT id FROM sites WHERE id = $1', [entityId]);
      if (siteResult.rowCount === 0) {
        res.status(404).json({ error: 'Site non trouvé' });
        return;
      }
    } else {
      const advertiserResult = await query('SELECT id FROM advertisers WHERE id = $1', [entityId]);
      if (advertiserResult.rowCount === 0) {
        res.status(404).json({ error: 'Annonceur non trouvé' });
        return;
      }
    }

    logger.info('[ReportsController] Generating report on demand', {
      type,
      entityId,
      periodStart,
      periodEnd,
      userId: req.user?.id,
    });

    const result = await generateReportOnDemand(
      type,
      entityId,
      periodStart,
      periodEnd,
      req.user?.id
    );

    if (result.success) {
      res.json({
        success: true,
        data: {
          reportId: result.reportId,
          url: result.url,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Erreur lors de la génération du rapport',
      });
    }
  } catch (error) {
    logger.error('[ReportsController] Error generating report', { error });
    res.status(500).json({ error: 'Erreur lors de la génération du rapport' });
  }
};

/**
 * Liste tous les rapports récents (admin)
 */
export const listAllReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const type = req.query.type as string;

    let whereClause = '';
    const params: (string | number)[] = [];

    if (type && ['club', 'advertiser'].includes(type)) {
      whereClause = 'WHERE report_type = $1';
      params.push(type);
    }

    const result = await query(`
      SELECT
        gr.*,
        CASE
          WHEN gr.report_type = 'club' THEN s.site_name
          WHEN gr.report_type = 'advertiser' THEN a.name
        END as entity_name
      FROM generated_reports gr
      LEFT JOIN sites s ON gr.site_id = s.id
      LEFT JOIN advertisers a ON gr.advertiser_id = a.id
      ${whereClause}
      ORDER BY gr.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM generated_reports
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total as string),
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error('[ReportsController] Error listing all reports', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des rapports' });
  }
};

/**
 * Statistiques des rapports générés
 */
export const getReportStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await query(`
      SELECT
        report_type,
        status,
        COUNT(*) as count,
        SUM(file_size_bytes) as total_size
      FROM generated_reports
      GROUP BY report_type, status
      ORDER BY report_type, status
    `);

    const monthlyStats = await query(`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM generated_reports
      WHERE created_at > NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
    `);

    res.json({
      success: true,
      data: {
        byTypeAndStatus: stats.rows,
        monthly: monthlyStats.rows,
      },
    });
  } catch (error) {
    logger.error('[ReportsController] Error getting report stats', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
};
