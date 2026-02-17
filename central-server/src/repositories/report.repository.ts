import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface GeneratedReportRow extends QueryResultRow {
  id: string;
  report_type: string;
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
  status: string;
  error_message: string | null;
  generated_by: string | null;
  created_at: Date;
  completed_at: Date | null;
}

export interface ReportWithEntityName extends GeneratedReportRow {
  entity_name: string | null;
}

export interface ReportTypeStatusStats extends QueryResultRow {
  report_type: string;
  status: string;
  count: string;
  total_size: string | null;
}

export interface ReportMonthlyStats extends QueryResultRow {
  month: string;
  count: string;
  completed: string;
  failed: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class ReportRepositoryImpl extends BaseRepository<GeneratedReportRow> {
  constructor() {
    super('generated_reports');
  }

  /**
   * Liste tous les rapports avec nom d'entite, filtre optionnel par type, avec pagination.
   */
  async findAllWithEntityName(
    options: { type?: string; limit: number; offset: number }
  ): Promise<{ rows: ReportWithEntityName[]; total: number }> {
    const { type, limit, offset } = options;
    const params: (string | number)[] = [];
    let whereClause = '';

    if (type && ['club', 'advertiser', 'site_sponsor'].includes(type)) {
      whereClause = 'WHERE report_type = $1';
      params.push(type);
    }

    const result = await query<ReportWithEntityName>(`
      SELECT
        gr.*,
        CASE
          WHEN gr.report_type = 'club' THEN s.site_name
          WHEN gr.report_type = 'advertiser' THEN a.name
          WHEN gr.report_type = 'site_sponsor' THEN ss.name
        END as entity_name
      FROM generated_reports gr
      LEFT JOIN sites s ON gr.site_id = s.id
      LEFT JOIN advertisers a ON gr.advertiser_id = a.id
      LEFT JOIN site_sponsors ss ON gr.site_sponsor_id = ss.id
      ${whereClause}
      ORDER BY gr.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM generated_reports
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total as string);

    return { rows: result.rows, total };
  }

  /**
   * Statistiques par type et statut.
   */
  async getStatsByTypeAndStatus(): Promise<ReportTypeStatusStats[]> {
    const result = await query<ReportTypeStatusStats>(`
      SELECT
        report_type,
        status,
        COUNT(*) as count,
        SUM(file_size_bytes) as total_size
      FROM generated_reports
      GROUP BY report_type, status
      ORDER BY report_type, status
    `);
    return result.rows;
  }

  /**
   * Statistiques mensuelles sur les 12 derniers mois.
   */
  async getMonthlyStats(): Promise<ReportMonthlyStats[]> {
    const result = await query<ReportMonthlyStats>(`
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
    return result.rows;
  }
}

export const reportRepository = new ReportRepositoryImpl();
