import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import {
  analyticsRepository,
  siteRepository,
  advertiserRepository,
} from '../repositories';

/**
 * GET /api/analytics/clubs/:siteId/export
 * Export CSV des données d'un site
 */
export const exportClubData = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { from, to, type = 'video_plays' } = req.query;

    const fromDate = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to as string) : new Date();

    const fromStr = fromDate.toISOString();
    const toStr = toDate.toISOString();

    let data: Record<string, unknown>[] = [];
    let filename = '';

    if (type === 'video_plays') {
      data = await analyticsRepository.exportVideoPlays(siteId, fromStr, toStr);
      filename = `video_plays_${siteId}_${fromDate.toISOString().split('T')[0]}.csv`;
    } else if (type === 'daily_stats') {
      data = await analyticsRepository.exportDailyStats(siteId, fromStr, toStr);
      filename = `daily_stats_${siteId}_${fromDate.toISOString().split('T')[0]}.csv`;
    } else if (type === 'metrics') {
      data = await analyticsRepository.exportMetrics(siteId, fromStr, toStr);
      filename = `metrics_${siteId}_${fromDate.toISOString().split('T')[0]}.csv`;
    } else {
      return res.status(400).json({ error: 'Type d\'export invalide' });
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'Aucune donnée à exporter' });
    }

    // Générer le CSV
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map((row) =>
        headers
          .map((header) => {
            const val = row[header];
            if (val === null || val === undefined) return '';
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
            return val;
          })
          .join(',')
      ),
    ];

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    logger.error('Export club data error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'export des données' });
  }
};

/**
 * POST /api/analytics/calculate-daily-stats
 * Déclencher le calcul des stats quotidiennes (pour cron)
 */
export const calculateDailyStats = async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.body;
    const targetDate = date ? new Date(date) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Hier par défaut

    const dateStr = targetDate.toISOString().split('T')[0];

    // Appeler la fonction PostgreSQL pour tous les sites via le repository
    const sitesProcessed = await analyticsRepository.calculateDailyStats(dateStr);

    logger.info('Daily stats calculated', { date: dateStr, sitesProcessed });

    res.json({
      success: true,
      date: dateStr,
      sites_processed: sitesProcessed,
    });
  } catch (error) {
    logger.error('Calculate daily stats error:', error);
    res.status(500).json({ error: 'Erreur lors du calcul des statistiques quotidiennes' });
  }
};

/**
 * Génère un rapport PDF pour un club
 * GET /api/analytics/clubs/:siteId/report/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export const generateClubPdfReport = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { from, to } = req.query;

    // Validation des paramètres
    if (!from || !to) {
      return res.status(400).json({ error: 'Paramètres from et to requis (format YYYY-MM-DD)' });
    }

    // Vérifier que l'utilisateur a accès à ce site
    if (req.user?.role !== 'admin' && req.user?.role !== 'operator') {
      // Pour les utilisateurs non-admin, vérifier qu'ils ont accès à ce site
      const siteExists = await siteRepository.exists(siteId);

      if (!siteExists) {
        return res.status(404).json({ error: 'Site non trouvé' });
      }
    }

    // Import dynamique du service PDF
    const pdfService = await import('../services/pdf-report.service');

    logger.info('Generating club PDF report', { siteId, from, to, requestedBy: req.user?.email });

    // Générer le PDF
    const pdfBuffer = await pdfService.generateClubReport(
      siteId,
      String(from),
      String(to),
      { type: 'club', language: 'fr' }
    );

    // Nom du fichier
    const filename = `rapport-club-${siteId}-${from}-${to}.pdf`;

    // Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);

    logger.info('Club PDF report generated successfully', { siteId, from, to, size: pdfBuffer.length });

  } catch (error) {
    logger.error('Generate club PDF report error:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du rapport PDF' });
  }
};

// ============================================================================
// EXCEL EXPORT
// ============================================================================

/**
 * GET /api/analytics/clubs/:siteId/export/excel
 * Export Excel avancé pour un club
 */
export const exportClubExcel = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'Paramètres from et to requis (format YYYY-MM-DD)' });
    }

    // Vérifier que le site existe
    const site = await siteRepository.findById(siteId);
    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Import dynamique du service Excel
    const { excelExportService } = await import('../services/excel-export.service');

    logger.info('Generating club Excel export', { siteId, from, to, requestedBy: req.user?.email });

    const buffer = await excelExportService.generateClubExport({
      siteId,
      startDate: String(from),
      endDate: String(to),
      type: 'club',
    });

    const filename = `analytics-${site.club_name || site.site_name}-${from}-${to}.xlsx`
      .replace(/[^a-zA-Z0-9\-_.]/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

    logger.info('Club Excel export generated', { siteId, from, to, size: buffer.length });
  } catch (error) {
    logger.error('Export club Excel error:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de l\'export Excel' });
  }
};

/**
 * GET /api/analytics/advertisers/:advertiserId/export/excel
 * Export Excel avancé pour un annonceur
 */
export const exportAdvertiserExcel = async (req: AuthRequest, res: Response) => {
  try {
    const { advertiserId } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'Paramètres from et to requis (format YYYY-MM-DD)' });
    }

    // Vérifier que l'annonceur existe
    const advertiserName = await advertiserRepository.findName(advertiserId);
    if (!advertiserName) {
      return res.status(404).json({ error: 'Annonceur non trouvé' });
    }

    const { excelExportService } = await import('../services/excel-export.service');

    logger.info('Generating advertiser Excel export', { advertiserId, from, to, requestedBy: req.user?.email });

    const buffer = await excelExportService.generateAdvertiserExport({
      advertiserId,
      startDate: String(from),
      endDate: String(to),
      type: 'advertiser',
    });

    const filename = `analytics-${advertiserName}-${from}-${to}.xlsx`
      .replace(/[^a-zA-Z0-9\-_.]/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

    logger.info('Advertiser Excel export generated', { advertiserId, from, to, size: buffer.length });
  } catch (error) {
    logger.error('Export advertiser Excel error:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de l\'export Excel' });
  }
};

/**
 * GET /api/analytics/overview/export/excel
 * Export Excel overview multi-sites
 */
export const exportOverviewExcel = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'Paramètres from et to requis (format YYYY-MM-DD)' });
    }

    const { excelExportService } = await import('../services/excel-export.service');

    logger.info('Generating overview Excel export', { from, to, requestedBy: req.user?.email });

    const buffer = await excelExportService.generateOverviewExport({
      startDate: String(from),
      endDate: String(to),
      type: 'overview',
    });

    const filename = `analytics-global-${from}-${to}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

    logger.info('Overview Excel export generated', { from, to, size: buffer.length });
  } catch (error) {
    logger.error('Export overview Excel error:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de l\'export Excel global' });
  }
};
