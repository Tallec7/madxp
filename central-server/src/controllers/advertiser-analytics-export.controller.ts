import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import { generateAdvertiserReport, generateClubReport } from '../services/pdf-report.service';
import {
  advertiserRepository,
} from '../repositories';

/**
 * GET /api/analytics/advertisers/:id/export
 * Export CSV des données brutes
 */
export const exportAdvertiserData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { from, to, format = 'csv' } = req.query;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Récupérer les vidéos de l'annonceur
    const videoIds = await advertiserRepository.getVideoIds(id);

    if (videoIds.length === 0) {
      res.status(404).json({
        success: false,
        error: 'No videos found for this advertiser',
      });
      return;
    }

    // Récupérer les impressions
    const impressionRows = await advertiserRepository.exportImpressions(videoIds, fromDate, toDate);

    if (format === 'csv') {
      // Générer CSV
      const headers = [
        'Date',
        'Video',
        'Site',
        'Club',
        'Duration (s)',
        'Completed',
        'Event Type',
        'Period',
        'Trigger',
        'Audience',
      ];

      const rows = impressionRows.map(row => [
        new Date(row.played_at).toISOString(),
        row.video_name,
        row.site_name,
        row.club_name,
        row.duration_played,
        row.completed ? 'Yes' : 'No',
        row.event_type || '',
        row.period || '',
        row.trigger_type || '',
        row.audience_estimate || '',
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=advertiser-${id}-${fromDate}-${toDate}.csv`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: impressionRows,
      });
    }
  } catch (error) {
    logger.error('Error exporting advertiser data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export advertiser data',
    });
  }
};

/**
 * POST /api/analytics/advertisers/calculate-daily-stats
 * Calculer les stats quotidiennes (cron job)
 */
export const calculateDailyStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date } = req.body;
    const targetDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const count = await advertiserRepository.calculateDailyStats(targetDate);

    res.json({
      success: true,
      message: `Calculated stats for ${count} video/site combinations`,
      date: targetDate,
    });
  } catch (error) {
    logger.error('Error calculating daily stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate daily stats',
    });
  }
};

/**
 * GET /api/analytics/advertisers/:id/report/pdf
 * Générer un rapport PDF pour un annonceur
 */
export const generateAdvertiserPdfReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Générer le PDF
    const pdfBuffer = await generateAdvertiserReport(id, fromDate, toDate, { type: 'advertiser' });

    // Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=advertiser-report-${id}-${fromDate}-${toDate}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating advertiser PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF report',
    });
  }
};

/**
 * GET /api/analytics/clubs/:siteId/report/pdf
 * Générer un rapport PDF pour un club
 */
export const generateClubPdfReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId } = req.params;
    const { from, to } = req.query;

    if (!validateUuid(siteId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid site ID',
      });
      return;
    }

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Générer le PDF
    const pdfBuffer = await generateClubReport(siteId, fromDate, toDate, { type: 'club' });

    // Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=club-report-${siteId}-${fromDate}-${toDate}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating club PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF report',
    });
  }
};
