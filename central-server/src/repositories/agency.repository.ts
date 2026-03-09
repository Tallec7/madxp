import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface AgencyRow extends QueryResultRow {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: Record<string, unknown> | null;
  status: 'active' | 'inactive' | 'suspended';
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface AgencyWithSiteCount extends AgencyRow {
  site_count: number;
}

export interface AgencySiteRow extends QueryResultRow {
  site_id: string;
  site_name: string;
  club_name: string;
  location: Record<string, unknown>;
  status: string;
  last_seen_at: Date | null;
  software_version: string | null;
  videos_played_30d: number;
  screen_time_30d: number;
}

export interface AgencyDashboardStatsRow extends QueryResultRow {
  total_sites: number;
  online_sites: number;
  offline_sites: number;
  total_videos_played_30d: number;
  total_screen_time_30d: number;
}

export interface AgencyAlertRow extends QueryResultRow {
  id: string;
  site_id: string;
  site_name: string;
  alert_type: string;
  severity: string;
  message: string;
  created_at: Date;
}

export interface SiteStatsRow extends QueryResultRow {
  total_videos: number;
  total_screen_time: number;
  avg_uptime: number;
  active_days: number;
}

export interface SiteTrendRow extends QueryResultRow {
  date: string;
  videos_played: number;
  screen_time_seconds: number;
}

export interface AgencySummaryRow extends QueryResultRow {
  total_sites: number;
  total_videos: number;
  total_screen_time: number;
  avg_uptime: number;
}

export interface AgencyBySiteRow extends QueryResultRow {
  site_id: string;
  site_name: string;
  club_name: string;
  videos_played: number;
  screen_time: number;
  avg_uptime: number;
}

export interface AgencyTrendRow extends QueryResultRow {
  date: string;
  videos_played: number;
  screen_time: number;
}

export interface AdminAgencySiteRow extends QueryResultRow {
  id: string;
  site_name: string;
  club_name: string;
  status: string;
  location: Record<string, unknown>;
}

export interface AgencyIdNameRow extends QueryResultRow {
  id: string;
  name: string;
}

export interface SiteIdRow extends QueryResultRow {
  site_id: string;
}

export interface SiteDetailRow extends QueryResultRow {
  id: string;
  site_name: string;
  club_name: string;
  status: string;
  active_alerts: unknown;
  [key: string]: unknown;
}

export interface CreateAgencyInput {
  name: string;
  description?: string | null;
  logo_url?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateAgencyInput {
  name?: string;
  description?: string;
  logo_url?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: Record<string, unknown>;
  status?: string;
  metadata?: Record<string, unknown>;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class AgencyRepositoryImpl extends BaseRepository<AgencyRow> {
  constructor() {
    super('agencies');
  }

  // ==========================================================================
  // CRUD
  // ==========================================================================

  /**
   * Liste toutes les agences avec compteur de sites (admin).
   */
  async findAllWithSiteCount(): Promise<AgencyWithSiteCount[]> {
    const result = await query<AgencyWithSiteCount>(
      `SELECT a.id, a.name, a.description, a.logo_url, a.contact_name, a.contact_email, a.contact_phone, a.status, a.created_at,
              (SELECT COUNT(*) FROM agency_sites WHERE agency_id = a.id) as site_count
       FROM agencies a
       ORDER BY a.name ASC`
    );
    return result.rows;
  }

  /**
   * Recupere une agence par ID (champs limites pour un utilisateur agence).
   */
  async findByIdLimited(agencyId: string): Promise<AgencyRow[]> {
    const result = await query<AgencyRow>(
      `SELECT id, name, description, logo_url, contact_name, contact_email, contact_phone, status, created_at
       FROM agencies
       WHERE id = $1`,
      [agencyId]
    );
    return result.rows;
  }

  /**
   * Recupere une agence par ID (tous les champs).
   */
  async findAgencyById(id: string): Promise<AgencyRow | null> {
    const result = await query<AgencyRow>(
      `SELECT * FROM agencies WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Cree une nouvelle agence.
   */
  async createAgency(input: CreateAgencyInput): Promise<AgencyRow> {
    const result = await query<AgencyRow>(
      `INSERT INTO agencies (name, description, logo_url, contact_name, contact_email, contact_phone, address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.name,
        input.description || null,
        input.logo_url || null,
        input.contact_name || null,
        input.contact_email || null,
        input.contact_phone || null,
        input.address || null,
        input.metadata || {},
      ]
    );
    return result.rows[0];
  }

  /**
   * Met a jour une agence avec COALESCE pour ne modifier que les champs fournis.
   */
  async updateAgency(id: string, input: UpdateAgencyInput): Promise<AgencyRow | null> {
    const result = await query<AgencyRow>(
      `UPDATE agencies
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           logo_url = COALESCE($3, logo_url),
           contact_name = COALESCE($4, contact_name),
           contact_email = COALESCE($5, contact_email),
           contact_phone = COALESCE($6, contact_phone),
           address = COALESCE($7, address),
           status = COALESCE($8, status),
           metadata = COALESCE($9, metadata),
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        input.name,
        input.description,
        input.logo_url,
        input.contact_name,
        input.contact_email,
        input.contact_phone,
        input.address,
        input.status,
        input.metadata,
        id,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Supprime une agence par ID. Retourne true si supprimee.
   */
  async deleteAgency(id: string): Promise<boolean> {
    const result = await query(`DELETE FROM agencies WHERE id = $1`, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ==========================================================================
  // AGENCY-SITE ASSOCIATION
  // ==========================================================================

  /**
   * Verifie qu'une agence existe (retourne id).
   */
  async agencyExists(id: string): Promise<boolean> {
    const result = await query(`SELECT id FROM agencies WHERE id = $1`, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Insere des associations agency_sites (ON CONFLICT DO NOTHING).
   */
  async addSites(agencyId: string, siteIds: string[], addedBy: string | undefined): Promise<void> {
    const values = siteIds
      .map((_, idx) => `($1, $${idx + 2}, $${siteIds.length + 2})`)
      .join(', ');

    const params: unknown[] = [agencyId, ...siteIds, addedBy];

    await query(
      `INSERT INTO agency_sites (agency_id, site_id, added_by)
       VALUES ${values}
       ON CONFLICT (agency_id, site_id) DO NOTHING`,
      params
    );
  }

  /**
   * Recupere l'agence (id, name) et ses sites associes (admin endpoint).
   */
  async findAgencyIdName(id: string): Promise<AgencyIdNameRow | null> {
    const result = await query<AgencyIdNameRow>(
      `SELECT id, name FROM agencies WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere les sites associes a une agence (admin endpoint).
   */
  async findAdminAgencySites(agencyId: string): Promise<AdminAgencySiteRow[]> {
    const result = await query<AdminAgencySiteRow>(
      `SELECT s.id, s.site_name, s.club_name, s.status, s.location
       FROM agency_sites as2
       JOIN sites s ON s.id = as2.site_id
       WHERE as2.agency_id = $1
       ORDER BY s.club_name ASC`,
      [agencyId]
    );
    return result.rows;
  }

  /**
   * Retire un site d'une agence. Retourne true si l'association existait.
   */
  async removeSite(agencyId: string, siteId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM agency_sites WHERE agency_id = $1 AND site_id = $2`,
      [agencyId, siteId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ==========================================================================
  // AGENCY PORTAL
  // ==========================================================================

  /**
   * Recupere les infos de base d'une agence pour le dashboard portal.
   */
  async findDashboardAgency(agencyId: string): Promise<AgencyRow | null> {
    const result = await query<AgencyRow>(
      `SELECT id, name, logo_url, status, created_at
       FROM agencies WHERE id = $1`,
      [agencyId]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere les stats globales (30j) d'une agence.
   */
  async findDashboardStats(agencyId: string): Promise<AgencyDashboardStatsRow> {
    const result = await query<AgencyDashboardStatsRow>(
      `SELECT
        COUNT(DISTINCT s.id) as total_sites,
        COUNT(DISTINCT CASE WHEN s.status = 'online' THEN s.id END) as online_sites,
        COUNT(DISTINCT CASE WHEN s.status = 'offline' THEN s.id END) as offline_sites,
        COALESCE(SUM(cds.videos_played), 0) as total_videos_played_30d,
        COALESCE(SUM(cds.screen_time_seconds), 0) as total_screen_time_30d
       FROM agency_sites as2
       JOIN sites s ON s.id = as2.site_id
       LEFT JOIN club_daily_stats_live cds ON cds.site_id = s.id
         AND cds.date >= CURRENT_DATE - INTERVAL '30 days'
       WHERE as2.agency_id = $1`,
      [agencyId]
    );
    return result.rows[0] || {
      total_sites: 0,
      online_sites: 0,
      offline_sites: 0,
      total_videos_played_30d: 0,
      total_screen_time_30d: 0,
    };
  }

  /**
   * Recupere les alertes actives recentes sur les sites d'une agence.
   */
  async findDashboardAlerts(agencyId: string, limit = 10): Promise<AgencyAlertRow[]> {
    const result = await query<AgencyAlertRow>(
      `SELECT a.id, a.site_id, s.site_name, a.alert_type, a.severity, a.message, a.created_at
       FROM alerts a
       JOIN sites s ON s.id = a.site_id
       JOIN agency_sites as2 ON as2.site_id = s.id
       WHERE as2.agency_id = $1
         AND a.status = 'active'
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [agencyId, limit]
    );
    return result.rows;
  }

  /**
   * Recupere les sites d'une agence avec stats 30j (portal).
   */
  async findPortalSites(agencyId: string): Promise<AgencySiteRow[]> {
    const result = await query<AgencySiteRow>(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        s.location,
        s.status,
        s.last_seen_at,
        s.software_version,
        COALESCE(stats.videos_played, 0) as videos_played_30d,
        COALESCE(stats.screen_time, 0) as screen_time_30d
       FROM agency_sites as2
       JOIN sites s ON s.id = as2.site_id
       LEFT JOIN (
         SELECT
           site_id,
           SUM(videos_played) as videos_played,
           SUM(screen_time_seconds) as screen_time
         FROM club_daily_stats_live
         WHERE date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY site_id
       ) stats ON stats.site_id = s.id
       WHERE as2.agency_id = $1
       ORDER BY s.club_name ASC`,
      [agencyId]
    );
    return result.rows;
  }

  /**
   * Verifie qu'un site appartient a une agence.
   */
  async sitebelongsToAgency(agencyId: string, siteId: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM agency_sites WHERE agency_id = $1 AND site_id = $2`,
      [agencyId, siteId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Recupere les details d'un site avec ses alertes actives.
   */
  async findSiteWithAlerts(siteId: string): Promise<SiteDetailRow | null> {
    const result = await query<SiteDetailRow>(
      `SELECT s.*,
              (SELECT json_agg(json_build_object('id', a.id, 'type', a.alert_type, 'severity', a.severity, 'message', a.message, 'created_at', a.created_at))
               FROM alerts a WHERE a.site_id = s.id AND a.status = 'active') as active_alerts
       FROM sites s
       WHERE s.id = $1`,
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere les stats 30j d'un site.
   */
  async findSiteStats30d(siteId: string): Promise<SiteStatsRow> {
    const result = await query<SiteStatsRow>(
      `SELECT
        SUM(videos_played) as total_videos,
        SUM(screen_time_seconds) as total_screen_time,
        AVG(uptime_percent) as avg_uptime,
        COUNT(*) as active_days
       FROM club_daily_stats_live
       WHERE site_id = $1
         AND date >= CURRENT_DATE - INTERVAL '30 days'`,
      [siteId]
    );
    return result.rows[0] || { total_videos: 0, total_screen_time: 0, avg_uptime: 0, active_days: 0 };
  }

  /**
   * Recupere les tendances 7j d'un site.
   */
  async findSiteTrends7d(siteId: string): Promise<SiteTrendRow[]> {
    const result = await query<SiteTrendRow>(
      `SELECT
        date,
        videos_played,
        screen_time_seconds
       FROM club_daily_stats_live
       WHERE site_id = $1
         AND date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY date ASC`,
      [siteId]
    );
    return result.rows;
  }

  // ==========================================================================
  // AGENCY STATS
  // ==========================================================================

  /**
   * Recupere les site_ids d'une agence.
   */
  async findAgencySiteIds(agencyId: string): Promise<string[]> {
    const result = await query<SiteIdRow>(
      `SELECT site_id FROM agency_sites WHERE agency_id = $1`,
      [agencyId]
    );
    return result.rows.map(r => r.site_id);
  }

  /**
   * Recupere le resume des stats sur une periode pour des sites donnes.
   */
  async findStatsSummary(siteIds: string[], fromDate: string, toDate: string): Promise<AgencySummaryRow> {
    const result = await query<AgencySummaryRow>(
      `SELECT
        COUNT(DISTINCT site_id) as total_sites,
        SUM(videos_played) as total_videos,
        SUM(screen_time_seconds) as total_screen_time,
        ROUND(AVG(uptime_percent)::numeric, 1) as avg_uptime
       FROM club_daily_stats_live
       WHERE site_id = ANY($1::uuid[])
         AND date >= $2::date
         AND date <= $3::date`,
      [siteIds, fromDate, toDate]
    );
    return result.rows[0] || { total_sites: 0, total_videos: 0, total_screen_time: 0, avg_uptime: 0 };
  }

  /**
   * Recupere les stats par site sur une periode.
   */
  async findStatsBySite(siteIds: string[], fromDate: string, toDate: string): Promise<AgencyBySiteRow[]> {
    const result = await query<AgencyBySiteRow>(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        SUM(cds.videos_played) as videos_played,
        SUM(cds.screen_time_seconds) as screen_time,
        ROUND(AVG(cds.uptime_percent)::numeric, 1) as avg_uptime
       FROM sites s
       JOIN club_daily_stats_live cds ON cds.site_id = s.id
       WHERE s.id = ANY($1::uuid[])
         AND cds.date >= $2::date
         AND cds.date <= $3::date
       GROUP BY s.id, s.site_name, s.club_name
       ORDER BY videos_played DESC`,
      [siteIds, fromDate, toDate]
    );
    return result.rows;
  }

  /**
   * Recupere les tendances journalieres sur une periode.
   */
  async findStatsTrends(siteIds: string[], fromDate: string, toDate: string): Promise<AgencyTrendRow[]> {
    const result = await query<AgencyTrendRow>(
      `SELECT
        DATE(date) as date,
        SUM(videos_played) as videos_played,
        SUM(screen_time_seconds) as screen_time
       FROM club_daily_stats_live
       WHERE site_id = ANY($1::uuid[])
         AND date >= $2::date
         AND date <= $3::date
       GROUP BY DATE(date)
       ORDER BY date ASC`,
      [siteIds, fromDate, toDate]
    );
    return result.rows;
  }
}

export const agencyRepository = new AgencyRepositoryImpl();
