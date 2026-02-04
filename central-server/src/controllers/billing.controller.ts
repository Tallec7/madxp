import { Response } from 'express';
import { AuthRequest } from '../types';
import billingService from '../services/billing.service';
import logger from '../config/logger';

/**
 * Export billing data for a specific month
 * GET /api/billing/monthly?month=2026-01&format=csv|json
 */
export const exportBillingMonth = async (req: AuthRequest, res: Response) => {
  try {
    const { month, format = 'json' } = req.query;

    if (!month || typeof month !== 'string') {
      return res.status(400).json({ error: 'Le paramètre month est requis (format: YYYY-MM)' });
    }

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Format de mois invalide. Utilisez YYYY-MM (ex: 2026-01)' });
    }

    const data = await billingService.getBillingDataForMonth(month);

    if (format === 'csv') {
      const csv = billingService.generateCSV(data);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="facturation-${month}.csv"`);

      // Add BOM for Excel UTF-8 compatibility
      const bom = '\uFEFF';
      return res.send(bom + csv);
    }

    res.json(data);
  } catch (error) {
    logger.error('Error exporting billing data', { error, month: req.query.month });
    res.status(500).json({ error: 'Erreur lors de l\'export des données de facturation' });
  }
};

/**
 * Get billing summary for multiple months
 * GET /api/billing/summary?start=2026-01&end=2026-06
 */
export const getBillingSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { start, end } = req.query;

    if (!start || typeof start !== 'string') {
      return res.status(400).json({ error: 'Le paramètre start est requis (format: YYYY-MM)' });
    }

    const endMonth = (end as string) || start;

    // Generate list of months between start and end
    const months: string[] = [];
    const [startYear, startMonthNum] = start.split('-').map(Number);
    const [endYear, endMonthNum] = endMonth.split('-').map(Number);

    let currentYear = startYear;
    let currentMonth = startMonthNum;

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonthNum)) {
      months.push(`${currentYear}-${currentMonth.toString().padStart(2, '0')}`);
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    const summaries = await Promise.all(
      months.map(month => billingService.getBillingDataForMonth(month))
    );

    res.json({
      start,
      end: endMonth,
      months: summaries.map(s => ({
        month: s.month,
        total_sites: s.total_sites,
        billable_sites: s.billable_sites,
        non_billable_sites: s.non_billable_sites,
        total_videos_played: s.total_videos_played,
        total_screen_time_seconds: s.total_screen_time_seconds
      }))
    });
  } catch (error) {
    logger.error('Error getting billing summary', { error, start: req.query.start, end: req.query.end });
    res.status(500).json({ error: 'Erreur lors de la récupération du résumé de facturation' });
  }
};
