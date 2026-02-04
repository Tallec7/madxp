import { query } from '../config/database';
import logger from '../config/logger';

export interface BillingSiteData {
  site_id: string;
  site_name: string;
  club_name: string;
  subscription_plan: string;
  days_with_activity: number;
  total_videos_played: number;
  total_screen_time_seconds: number;
  is_billable: boolean;
  subscription_status: string;
  suspended: boolean;
}

export interface BillingMonthSummary {
  month: string;
  total_sites: number;
  billable_sites: number;
  non_billable_sites: number;
  total_videos_played: number;
  total_screen_time_seconds: number;
  sites: BillingSiteData[];
}

class BillingService {
  /**
   * Get billing data for a specific month
   * A site is billable if it has at least 1 day of activity AND is not suspended
   */
  async getBillingDataForMonth(month: string): Promise<BillingMonthSummary> {
    // Parse month (format: YYYY-MM)
    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      throw new Error('Invalid month format. Use YYYY-MM');
    }

    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 1);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    logger.info('Fetching billing data', { month, startDate: startDateStr, endDate: endDateStr });

    const result = await query(`
      SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        COALESCE(s.subscription_plan, 'standard') as subscription_plan,
        s.suspended,
        s.status,
        s.subscription_start,
        s.subscription_end,
        COUNT(DISTINCT cds.date) as days_with_activity,
        COALESCE(SUM(cds.videos_played), 0)::integer as total_videos_played,
        COALESCE(SUM(cds.screen_time_seconds), 0)::integer as total_screen_time_seconds
      FROM sites s
      LEFT JOIN club_daily_stats cds ON cds.site_id = s.id
        AND cds.date >= $1
        AND cds.date < $2
      GROUP BY s.id
      ORDER BY s.club_name
    `, [startDateStr, endDateStr]);

    const sites: BillingSiteData[] = result.rows.map(row => {
      const daysActive = parseInt(String(row.days_with_activity), 10) || 0;
      const isSuspended = row.suspended === true;
      const isBillable = daysActive > 0 && !isSuspended;

      // Determine subscription status
      let subscriptionStatus = 'active';
      if (isSuspended) {
        subscriptionStatus = 'suspended';
      } else if (row.subscription_end) {
        const endDate = new Date(String(row.subscription_end));
        const now = new Date();
        if (endDate < now) {
          subscriptionStatus = 'expired';
        } else {
          const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysRemaining <= 30) {
            subscriptionStatus = 'expiring_soon';
          }
        }
      }

      return {
        site_id: String(row.site_id),
        site_name: String(row.site_name || ''),
        club_name: String(row.club_name || ''),
        subscription_plan: String(row.subscription_plan || 'standard'),
        days_with_activity: daysActive,
        total_videos_played: parseInt(String(row.total_videos_played), 10) || 0,
        total_screen_time_seconds: parseInt(String(row.total_screen_time_seconds), 10) || 0,
        is_billable: isBillable,
        subscription_status: subscriptionStatus,
        suspended: isSuspended
      };
    });

    const billableSites = sites.filter(s => s.is_billable);
    const nonBillableSites = sites.filter(s => !s.is_billable);

    const summary: BillingMonthSummary = {
      month,
      total_sites: sites.length,
      billable_sites: billableSites.length,
      non_billable_sites: nonBillableSites.length,
      total_videos_played: sites.reduce((sum, s) => sum + s.total_videos_played, 0),
      total_screen_time_seconds: sites.reduce((sum, s) => sum + s.total_screen_time_seconds, 0),
      sites
    };

    logger.info('Billing data fetched', {
      month,
      totalSites: summary.total_sites,
      billable: summary.billable_sites,
      nonBillable: summary.non_billable_sites
    });

    return summary;
  }

  /**
   * Generate CSV content from billing data
   */
  generateCSV(data: BillingMonthSummary): string {
    const headers = [
      'Site ID',
      'Nom du site',
      'Nom du club',
      'Plan',
      'Jours d\'activite',
      'Videos jouees',
      'Temps ecran (min)',
      'Facturable',
      'Statut abonnement',
      'Suspendu'
    ];

    const rows = data.sites.map(site => [
      site.site_id,
      `"${site.site_name.replace(/"/g, '""')}"`,
      `"${site.club_name.replace(/"/g, '""')}"`,
      site.subscription_plan,
      site.days_with_activity.toString(),
      site.total_videos_played.toString(),
      Math.round(site.total_screen_time_seconds / 60).toString(),
      site.is_billable ? 'Oui' : 'Non',
      site.subscription_status,
      site.suspended ? 'Oui' : 'Non'
    ]);

    // Add summary row
    rows.push([]);
    rows.push(['RESUME']);
    rows.push(['Total sites', data.total_sites.toString()]);
    rows.push(['Sites facturables', data.billable_sites.toString()]);
    rows.push(['Sites non facturables', data.non_billable_sites.toString()]);
    rows.push(['Total videos jouees', data.total_videos_played.toString()]);
    rows.push(['Temps ecran total (min)', Math.round(data.total_screen_time_seconds / 60).toString()]);

    return [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  }
}

export const billingService = new BillingService();
export default billingService;
