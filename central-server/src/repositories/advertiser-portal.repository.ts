import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface PortalDashboardStatsRow extends QueryResultRow {
  total_videos: string;
  total_sites: string;
  total_impressions_30d: string;
  total_screen_time_30d: string;
  avg_completion_rate: string;
}

export interface PortalReachStatsRow extends QueryResultRow {
  total_reach: string;
  matches_with_ads: string;
  avg_audience_per_match: string;
}

export interface PortalTrendRow extends QueryResultRow {
  date: string;
  impressions: string;
  screen_time: string;
}

export interface PortalSiteRow extends QueryResultRow {
  site_id: string;
  site_name: string;
  club_name: string;
  location: Record<string, unknown>;
  status: string;
  contract_start: string | null;
  contract_end: string | null;
  is_active: boolean;
  contract_status: string;
  days_remaining: number | null;
  impressions_30d: string;
  screen_time_30d: string;
}

export interface PortalVideoRow extends QueryResultRow {
  video_id: string;
  filename: string;
  duration: number;
  thumbnail_url: string | null;
  impressions_30d: string;
  completion_rate: string;
}

export interface DailyStatsSummaryRow extends QueryResultRow {
  total_impressions: string;
  total_screen_time: string;
  completion_rate: string;
  active_sites: string;
}

export interface DailyStatsByVideoRow extends QueryResultRow {
  video_id: string;
  filename: string;
  impressions: string;
  screen_time: string;
  completion_rate: string;
}

export interface DailyStatsBySiteRow extends QueryResultRow {
  site_id: string;
  site_name: string;
  club_name: string;
  impressions: string;
  screen_time: string;
}

export interface VideoStatsGlobalRow extends QueryResultRow {
  total_impressions: string;
  total_screen_time: string;
  avg_completion_rate: string;
  sites_count: string;
}

export interface VideoStatsBySiteRow extends QueryResultRow {
  site_id: string;
  site_name: string;
  club_name: string;
  impressions: string;
  screen_time: string;
  completion_rate: string;
}

export interface AdvertiserVideoOwnershipRow extends QueryResultRow {
  id: string;
  filename: string;
  storage_path: string | null;
  original_name: string | null;
  duration: number | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown> | null;
}

export interface DuplicateVideoRow extends QueryResultRow {
  id: string;
  filename: string;
}

export interface DeploymentCountRow extends QueryResultRow {
  count: string;
}

export interface InsertedVideoRow extends QueryResultRow {
  id: string;
  filename: string;
  original_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string | null;
  checksum: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  category: string | null;
}

// --- Advertiser-Sites (admin CRUD) types ---

export interface AdminAdvertiserSiteRow extends QueryResultRow {
  advertiser_id: string;
  site_id: string;
  site_name: string;
  club_name: string;
  added_at: string;
  contract_start: string | null;
  contract_end: string | null;
  is_active: boolean;
  contract_status: string;
  days_remaining: number | null;
}

export interface SiteAdvertiserRow extends QueryResultRow {
  advertiser_id: string;
  advertiser_name: string;
  logo_url: string | null;
  site_id: string;
  added_at: string;
  contract_start: string | null;
  contract_end: string | null;
  is_active: boolean;
  contract_status: string;
}

export interface SiteIdRow extends QueryResultRow {
  id: string;
}

export interface AdvertiserSiteAssocRow extends QueryResultRow {
  advertiser_id: string;
  site_id: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class AdvertiserPortalRepositoryImpl extends BaseRepository<QueryResultRow> {
  constructor() {
    super('advertiser_sites');
  }

  // ========================================================================
  // Portal Dashboard
  // ========================================================================

  /**
   * Stats globales 30 jours pour le dashboard portal.
   */
  async getDashboardStats(advertiserId: string): Promise<PortalDashboardStatsRow | null> {
    const result = await query<PortalDashboardStatsRow>(
      `SELECT
        COUNT(DISTINCT av.video_id) as total_videos,
        COUNT(DISTINCT ads.site_id) as total_sites,
        COALESCE(SUM(adst.total_impressions), 0) as total_impressions_30d,
        COALESCE(SUM(adst.total_duration_seconds), 0) as total_screen_time_30d,
        ROUND(AVG(adst.completion_rate)::numeric, 1) as avg_completion_rate
       FROM advertisers a
       LEFT JOIN advertiser_videos av ON av.advertiser_id = a.id
       LEFT JOIN advertiser_sites ads ON ads.advertiser_id = a.id AND ads.is_active = true
       LEFT JOIN advertiser_daily_stats_live adst ON adst.video_id = av.video_id
         AND adst.date >= CURRENT_DATE - INTERVAL '30 days'
       WHERE a.id = $1
       GROUP BY a.id`,
      [advertiserId]
    );
    return result.rows[0] || null;
  }

  /**
   * Tendance des 7 derniers jours pour le dashboard portal.
   */
  async getDashboardTrends(advertiserId: string): Promise<PortalTrendRow[]> {
    const result = await query<PortalTrendRow>(
      `SELECT
        DATE(adst.date) as date,
        SUM(adst.total_impressions) as impressions,
        SUM(adst.total_duration_seconds) as screen_time
       FROM advertiser_daily_stats_live adst
       JOIN advertiser_videos av ON av.video_id = adst.video_id
       WHERE av.advertiser_id = $1
         AND adst.date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE(adst.date)
       ORDER BY date ASC`,
      [advertiserId]
    );
    return result.rows;
  }

  /**
   * Calcul du reach (audience exposee) sur 30 jours.
   */
  async getDashboardReach(advertiserId: string): Promise<PortalReachStatsRow | null> {
    const result = await query<PortalReachStatsRow>(
      `SELECT
        COALESCE(SUM(unique_sessions.audience_estimate), 0) as total_reach,
        COUNT(*) as matches_with_ads,
        ROUND(AVG(unique_sessions.audience_estimate)::numeric, 0) as avg_audience_per_match
       FROM (
         SELECT DISTINCT cs.id, cs.audience_estimate
         FROM video_plays vp
         JOIN advertiser_videos av ON av.video_id = vp.video_id
         JOIN club_sessions cs ON cs.site_id = vp.site_id
           AND vp.played_at >= cs.started_at
           AND (cs.ended_at IS NULL OR vp.played_at <= cs.ended_at)
           AND cs.audience_estimate IS NOT NULL
         WHERE av.advertiser_id = $1
           AND vp.played_at >= CURRENT_DATE - INTERVAL '30 days'
           AND vp.category = 'sponsor'
       ) unique_sessions`,
      [advertiserId]
    );
    return result.rows[0] || null;
  }

  // ========================================================================
  // Portal Sites
  // ========================================================================

  /**
   * Liste des sites d'un annonceur pour le portail (avec stats et contrat).
   */
  async getPortalSites(advertiserId: string, contractFilter: string): Promise<{ rows: PortalSiteRow[]; rowCount: number }> {
    const result = await query<PortalSiteRow>(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        s.location,
        s.status,
        ads.contract_start,
        ads.contract_end,
        ads.is_active,
        CASE
          WHEN NOT ads.is_active THEN 'inactive'
          WHEN ads.contract_start IS NOT NULL AND ads.contract_start > CURRENT_DATE THEN 'pending'
          WHEN ads.contract_end IS NOT NULL AND ads.contract_end < CURRENT_DATE THEN 'expired'
          ELSE 'active'
        END as contract_status,
        CASE
          WHEN ads.contract_end IS NOT NULL AND ads.contract_end >= CURRENT_DATE
          THEN ads.contract_end - CURRENT_DATE
          ELSE NULL
        END as days_remaining,
        COALESCE(stats.impressions, 0) as impressions_30d,
        COALESCE(stats.screen_time, 0) as screen_time_30d
       FROM advertiser_sites ads
       JOIN sites s ON s.id = ads.site_id
       LEFT JOIN (
         SELECT
           adst.site_id,
           SUM(adst.total_impressions) as impressions,
           SUM(adst.total_duration_seconds) as screen_time
         FROM advertiser_daily_stats_live adst
         JOIN advertiser_videos av ON av.video_id = adst.video_id
         WHERE av.advertiser_id = $1
           AND adst.date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY adst.site_id
       ) stats ON stats.site_id = s.id
       WHERE ads.advertiser_id = $1 AND ${contractFilter}
       ORDER BY
         CASE contract_status WHEN 'active' THEN 1 WHEN 'pending' THEN 2 WHEN 'expired' THEN 3 ELSE 4 END,
         stats.impressions DESC NULLS LAST`,
      [advertiserId]
    );
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }

  // ========================================================================
  // Portal Videos
  // ========================================================================

  /**
   * Liste des videos d'un annonceur avec stats 30 jours.
   */
  async getPortalVideos(advertiserId: string): Promise<{ rows: PortalVideoRow[]; rowCount: number }> {
    const result = await query<PortalVideoRow>(
      `SELECT
        v.id as video_id,
        v.filename,
        v.duration,
        v.thumbnail_url,
        COALESCE(stats.impressions, 0) as impressions_30d,
        COALESCE(stats.completion_rate, 0) as completion_rate
       FROM advertiser_videos av
       JOIN videos v ON v.id = av.video_id
       LEFT JOIN (
         SELECT
           video_id,
           SUM(total_impressions) as impressions,
           ROUND(AVG(completion_rate)::numeric, 1) as completion_rate
         FROM advertiser_daily_stats_live
         WHERE date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY video_id
       ) stats ON stats.video_id = v.id
       WHERE av.advertiser_id = $1
       ORDER BY stats.impressions DESC NULLS LAST`,
      [advertiserId]
    );
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }

  // ========================================================================
  // Portal Detailed Stats (advertiser_daily_stats_live based)
  // ========================================================================

  /**
   * Resume des stats pour une liste de videos sur une periode.
   */
  async getDailyStatsSummary(videoIds: string[], fromDate: string, toDate: string): Promise<DailyStatsSummaryRow | null> {
    const result = await query<DailyStatsSummaryRow>(
      `SELECT
        SUM(total_impressions) as total_impressions,
        SUM(total_duration_seconds) as total_screen_time,
        ROUND(AVG(completion_rate)::numeric, 1) as completion_rate,
        COUNT(DISTINCT site_id) as active_sites
       FROM advertiser_daily_stats_live
       WHERE video_id = ANY($1::uuid[])
         AND date >= $2::date
         AND date <= $3::date`,
      [videoIds, fromDate, toDate]
    );
    return result.rows[0] || null;
  }

  /**
   * Stats par video sur une periode (advertiser_daily_stats_live).
   */
  async getDailyStatsByVideo(videoIds: string[], fromDate: string, toDate: string): Promise<DailyStatsByVideoRow[]> {
    const result = await query<DailyStatsByVideoRow>(
      `SELECT
        v.id as video_id,
        v.filename,
        SUM(adst.total_impressions) as impressions,
        SUM(adst.total_duration_seconds) as screen_time,
        ROUND(AVG(adst.completion_rate)::numeric, 1) as completion_rate
       FROM videos v
       JOIN advertiser_daily_stats_live adst ON adst.video_id = v.id
       WHERE v.id = ANY($1::uuid[])
         AND adst.date >= $2::date
         AND adst.date <= $3::date
       GROUP BY v.id, v.filename
       ORDER BY impressions DESC`,
      [videoIds, fromDate, toDate]
    );
    return result.rows;
  }

  /**
   * Stats par site sur une periode (advertiser_daily_stats_live, top 20).
   */
  async getDailyStatsBySite(videoIds: string[], fromDate: string, toDate: string): Promise<DailyStatsBySiteRow[]> {
    const result = await query<DailyStatsBySiteRow>(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        SUM(adst.total_impressions) as impressions,
        SUM(adst.total_duration_seconds) as screen_time
       FROM sites s
       JOIN advertiser_daily_stats_live adst ON adst.site_id = s.id
       WHERE adst.video_id = ANY($1::uuid[])
         AND adst.date >= $2::date
         AND adst.date <= $3::date
       GROUP BY s.id, s.site_name, s.club_name
       ORDER BY impressions DESC
       LIMIT 20`,
      [videoIds, fromDate, toDate]
    );
    return result.rows;
  }

  /**
   * Tendances quotidiennes sur une periode (advertiser_daily_stats_live).
   */
  async getDailyStatsTrends(videoIds: string[], fromDate: string, toDate: string): Promise<PortalTrendRow[]> {
    const result = await query<PortalTrendRow>(
      `SELECT
        DATE(date) as date,
        SUM(total_impressions) as impressions,
        SUM(total_duration_seconds) as screen_time
       FROM advertiser_daily_stats_live
       WHERE video_id = ANY($1::uuid[])
         AND date >= $2::date
         AND date <= $3::date
       GROUP BY DATE(date)
       ORDER BY date ASC`,
      [videoIds, fromDate, toDate]
    );
    return result.rows;
  }

  // ========================================================================
  // Video Stats (single video)
  // ========================================================================

  /**
   * Stats globales d'une video sur une periode.
   */
  async getVideoStatsGlobal(videoId: string, fromDate: string, toDate: string): Promise<VideoStatsGlobalRow | null> {
    const result = await query<VideoStatsGlobalRow>(
      `SELECT
        SUM(total_impressions) as total_impressions,
        SUM(total_duration_seconds) as total_screen_time,
        ROUND(AVG(completion_rate)::numeric, 1) as avg_completion_rate,
        COUNT(DISTINCT site_id) as sites_count
       FROM advertiser_daily_stats_live
       WHERE video_id = $1
         AND date >= $2::date
         AND date <= $3::date`,
      [videoId, fromDate, toDate]
    );
    return result.rows[0] || null;
  }

  /**
   * Stats d'une video par site.
   */
  async getVideoStatsBySite(videoId: string, fromDate: string, toDate: string): Promise<VideoStatsBySiteRow[]> {
    const result = await query<VideoStatsBySiteRow>(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        SUM(adst.total_impressions) as impressions,
        SUM(adst.total_duration_seconds) as screen_time,
        ROUND(AVG(adst.completion_rate)::numeric, 1) as completion_rate
       FROM sites s
       JOIN advertiser_daily_stats_live adst ON adst.site_id = s.id
       WHERE adst.video_id = $1
         AND adst.date >= $2::date
         AND adst.date <= $3::date
       GROUP BY s.id, s.site_name, s.club_name
       ORDER BY impressions DESC`,
      [videoId, fromDate, toDate]
    );
    return result.rows;
  }

  /**
   * Tendances d'une video sur une periode.
   */
  async getVideoStatsTrends(videoId: string, fromDate: string, toDate: string): Promise<PortalTrendRow[]> {
    const result = await query<PortalTrendRow>(
      `SELECT
        DATE(date) as date,
        SUM(total_impressions) as impressions,
        SUM(total_duration_seconds) as screen_time
       FROM advertiser_daily_stats_live
       WHERE video_id = $1
         AND date >= $2::date
         AND date <= $3::date
       GROUP BY DATE(date)
       ORDER BY date ASC`,
      [videoId, fromDate, toDate]
    );
    return result.rows;
  }

  // ========================================================================
  // Video Ownership & Management (portal-specific)
  // ========================================================================

  /**
   * Verifie qu'une video appartient a un annonceur.
   * Retourne les infos de base de la video.
   */
  async findVideoByOwner(videoId: string, advertiserId: string): Promise<AdvertiserVideoOwnershipRow | null> {
    const result = await query<AdvertiserVideoOwnershipRow>(
      `SELECT v.id, v.filename, v.storage_path, v.original_name, v.duration, v.thumbnail_url, v.metadata
       FROM videos v
       JOIN advertiser_videos av ON av.video_id = v.id
       WHERE v.id = $1 AND av.advertiser_id = $2`,
      [videoId, advertiserId]
    );
    return result.rows[0] || null;
  }

  /**
   * Cherche un doublon video par checksum pour un annonceur.
   */
  async findDuplicateVideo(checksum: string, advertiserId: string): Promise<DuplicateVideoRow | null> {
    const result = await query<DuplicateVideoRow>(
      `SELECT v.id, v.filename FROM videos v
       JOIN advertiser_videos av ON av.video_id = v.id
       WHERE v.checksum = $1 AND av.advertiser_id = $2`,
      [checksum, advertiserId]
    );
    return result.rows[0] || null;
  }

  /**
   * Compte les deployments actifs pour une video.
   */
  async countActiveDeployments(videoId: string): Promise<number> {
    const result = await query<DeploymentCountRow>(
      `SELECT COUNT(*) as count FROM content_deployments
       WHERE video_id = $1 AND status IN ('pending', 'scheduled', 'in_progress')`,
      [videoId]
    );
    return parseInt(String(result.rows[0].count)) || 0;
  }

  /**
   * Insere une video dans la table videos.
   */
  async insertVideo(
    filename: string,
    originalName: string,
    category: string,
    fileSize: number,
    mimeType: string,
    storagePath: string,
    checksum: string,
    metadata: string,
    uploadedBy: string | null
  ): Promise<InsertedVideoRow> {
    const result = await query<InsertedVideoRow>(
      `INSERT INTO videos
        (filename, original_name, category, subcategory, file_size, mime_type, storage_path, checksum, metadata, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [filename, originalName, category, null, fileSize, mimeType, storagePath, checksum, metadata, uploadedBy]
    );
    return result.rows[0];
  }

  /**
   * Associe une video a un annonceur.
   */
  async linkVideoToAdvertiser(advertiserId: string, videoId: string): Promise<void> {
    await query(
      `INSERT INTO advertiser_videos (advertiser_id, video_id, is_primary, added_at)
       VALUES ($1, $2, true, NOW())`,
      [advertiserId, videoId]
    );
  }

  /**
   * Supprime une video de la table videos.
   */
  async deleteVideo(videoId: string): Promise<void> {
    await query('DELETE FROM videos WHERE id = $1', [videoId]);
  }

  /**
   * Met a jour une video (champs dynamiques).
   */
  async updateVideo(videoId: string, updates: string[], params: unknown[]): Promise<InsertedVideoRow> {
    const result = await query<InsertedVideoRow>(
      `UPDATE videos SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );
    return result.rows[0];
  }

  // ========================================================================
  // Advertiser-Sites CRUD (admin endpoints)
  // ========================================================================

  /**
   * Liste des sites associes a un annonceur (admin view).
   */
  async getAdvertiserSites(advertiserId: string, includeInactive: boolean): Promise<{ rows: AdminAdvertiserSiteRow[]; rowCount: number }> {
    let whereClause = 'ads.advertiser_id = $1';
    if (!includeInactive) {
      whereClause += ' AND ads.is_active = true';
    }

    const result = await query<AdminAdvertiserSiteRow>(
      `SELECT
        ads.advertiser_id,
        ads.site_id,
        s.site_name,
        s.club_name,
        ads.added_at,
        ads.contract_start,
        ads.contract_end,
        ads.is_active,
        CASE
          WHEN NOT ads.is_active THEN 'inactive'
          WHEN ads.contract_start IS NOT NULL AND ads.contract_start > CURRENT_DATE THEN 'pending'
          WHEN ads.contract_end IS NOT NULL AND ads.contract_end < CURRENT_DATE THEN 'expired'
          ELSE 'active'
        END as contract_status,
        CASE
          WHEN ads.contract_end IS NOT NULL AND ads.contract_end >= CURRENT_DATE
          THEN ads.contract_end - CURRENT_DATE
          ELSE NULL
        END as days_remaining
       FROM advertiser_sites ads
       JOIN sites s ON s.id = ads.site_id
       WHERE ${whereClause}
       ORDER BY ads.is_active DESC, ads.contract_start DESC NULLS LAST`,
      [advertiserId]
    );
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }

  /**
   * Verifie que des sites existent (retourne les IDs trouves).
   */
  async findSitesByIds(siteIds: string[]): Promise<SiteIdRow[]> {
    const result = await query<SiteIdRow>(
      'SELECT id FROM sites WHERE id = ANY($1::uuid[])',
      [siteIds]
    );
    return result.rows;
  }

  /**
   * Associe des sites a un annonceur (upsert).
   */
  async addSites(
    advertiserId: string,
    siteIds: string[],
    contractStart: Date | null,
    contractEnd: Date | null
  ): Promise<void> {
    const values = siteIds.map((_, idx) =>
      `($1, $${idx + 2}, $${siteIds.length + 2}, $${siteIds.length + 3}, true)`
    ).join(', ');

    await query(
      `INSERT INTO advertiser_sites (advertiser_id, site_id, contract_start, contract_end, is_active)
       VALUES ${values}
       ON CONFLICT (advertiser_id, site_id) DO UPDATE SET
         contract_start = COALESCE(EXCLUDED.contract_start, advertiser_sites.contract_start),
         contract_end = COALESCE(EXCLUDED.contract_end, advertiser_sites.contract_end),
         is_active = true`,
      [advertiserId, ...siteIds, contractStart, contractEnd]
    );
  }

  /**
   * Verifie qu'une association advertiser-site existe.
   */
  async findAssociation(advertiserId: string, siteId: string): Promise<AdvertiserSiteAssocRow | null> {
    const result = await query<AdvertiserSiteAssocRow>(
      'SELECT advertiser_id, site_id FROM advertiser_sites WHERE advertiser_id = $1 AND site_id = $2',
      [advertiserId, siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Met a jour une association advertiser-site (champs dynamiques).
   */
  async updateAssociation(advertiserId: string, siteId: string, updates: string[], params: unknown[]): Promise<void> {
    const paramIndex = params.length + 1;
    await query(
      `UPDATE advertiser_sites
       SET ${updates.join(', ')}
       WHERE advertiser_id = $${paramIndex} AND site_id = $${paramIndex + 1}`,
      [...params, advertiserId, siteId]
    );
  }

  /**
   * Soft-delete: desactive une association.
   * Retourne true si une association active existait.
   */
  async deactivateAssociation(advertiserId: string, siteId: string): Promise<boolean> {
    const result = await query(
      `UPDATE advertiser_sites SET is_active = false
       WHERE advertiser_id = $1 AND site_id = $2 AND is_active = true`,
      [advertiserId, siteId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Hard-delete: supprime une association.
   * Retourne true si l'association existait.
   */
  async deleteAssociation(advertiserId: string, siteId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM advertiser_sites WHERE advertiser_id = $1 AND site_id = $2',
      [advertiserId, siteId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Liste des annonceurs associes a un site.
   */
  async getSiteAdvertisers(siteId: string, activeOnly: boolean): Promise<{ rows: SiteAdvertiserRow[]; rowCount: number }> {
    let whereClause = 'ads.site_id = $1';
    if (activeOnly) {
      whereClause += `
        AND ads.is_active = true
        AND (ads.contract_start IS NULL OR ads.contract_start <= CURRENT_DATE)
        AND (ads.contract_end IS NULL OR ads.contract_end >= CURRENT_DATE)`;
    }

    const result = await query<SiteAdvertiserRow>(
      `SELECT
        ads.advertiser_id,
        a.name as advertiser_name,
        a.logo_url,
        ads.site_id,
        ads.added_at,
        ads.contract_start,
        ads.contract_end,
        ads.is_active,
        CASE
          WHEN NOT ads.is_active THEN 'inactive'
          WHEN ads.contract_start IS NOT NULL AND ads.contract_start > CURRENT_DATE THEN 'pending'
          WHEN ads.contract_end IS NOT NULL AND ads.contract_end < CURRENT_DATE THEN 'expired'
          ELSE 'active'
        END as contract_status
       FROM advertiser_sites ads
       JOIN advertisers a ON a.id = ads.advertiser_id
       WHERE ${whereClause}
       ORDER BY a.name ASC`,
      [siteId]
    );
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }
}

export const advertiserPortalRepository = new AdvertiserPortalRepositoryImpl();
