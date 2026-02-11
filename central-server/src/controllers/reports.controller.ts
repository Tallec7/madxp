/**
 * Reports Controller
 *
 * Gère les endpoints pour les rapports PDF générés
 */

import { Response } from 'express';
import { AuthRequest } from '../types';
import { getClubReports, getAdvertiserReports, getReportById, generateReportOnDemand } from '../services/monthly-reports.service';
import { siteRepository, advertiserRepository } from '../repositories';
import { reportRepository } from '../repositories/report.repository';
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
      const siteExists = await siteRepository.exists(entityId);
      if (!siteExists) {
        res.status(404).json({ error: 'Site non trouvé' });
        return;
      }
    } else {
      const advertiserExists = await advertiserRepository.exists(entityId);
      if (!advertiserExists) {
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
    const type = req.query.type as string | undefined;

    const validType = type && ['club', 'advertiser'].includes(type) ? type : undefined;

    const { rows, total } = await reportRepository.findAllWithEntityName({
      type: validType,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
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
    const byTypeAndStatus = await reportRepository.getStatsByTypeAndStatus();
    const monthly = await reportRepository.getMonthlyStats();

    res.json({
      success: true,
      data: {
        byTypeAndStatus,
        monthly,
      },
    });
  } catch (error) {
    logger.error('[ReportsController] Error getting report stats', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
};
