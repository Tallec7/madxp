import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface SiteSponsorRow extends QueryResultRow {
  id: string;
  site_id: string;
  advertiser_id: string | null;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  contract_amount: number | null;
  contract_start: string | null;
  contract_end: string | null;
  source: 'local' | 'neopro';
  status: 'active' | 'expired' | 'paused';
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface SiteSponsorListRow extends QueryResultRow {
  id: string;
  site_id: string;
  advertiser_id: string | null;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  logo_url: string | null;
  contract_amount: number | null;
  contract_start: string | null;
  contract_end: string | null;
  source: string;
  status: string;
  created_at: Date;
  video_count: string;
  total_impressions: string;
}

export interface CreateSiteSponsorInput {
  siteId: string;
  advertiserId?: string | null;
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  logoUrl?: string | null;
  contractAmount?: number | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  source?: 'local' | 'neopro';
  metadata?: Record<string, unknown>;
}

export interface UpdateSiteSponsorInput {
  name?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoUrl?: string;
  contractAmount?: number | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  status?: 'active' | 'expired' | 'paused';
  metadata?: Record<string, unknown>;
}

export interface SiteSponsorVideoRow extends QueryResultRow {
  id: string;
  site_sponsor_id: string;
  video_id: string | null;
  video_filename: string;
  is_primary: boolean;
  added_at: Date;
  original_name: string | null;
  duration: number | null;
  thumbnail_url: string | null;
}

export interface SiteSponsorStatsSummary extends QueryResultRow {
  total_impressions: string;
  total_screen_time_seconds: string;
  completion_rate: string;
  estimated_reach: string;
  active_days: string;
}

export interface SiteSponsorDailyTrendRow extends QueryResultRow {
  date: string;
  impressions: string;
  screen_time: string;
}

export interface SiteSponsorEventTypeRow extends QueryResultRow {
  event_type: string;
  count: string;
  total_screen_time: string;
}

// P6 — Network stats, Benchmark, Match breakdown
export interface NetworkStatsSummary extends QueryResultRow {
  total_impressions: string;
  total_screen_time_seconds: string;
  completion_rate: string;
  estimated_reach: string;
  active_sites: string;
  active_days: string;
}

export interface NetworkSiteBreakdownRow extends QueryResultRow {
  site_id: string;
  site_name: string;
  club_name: string;
  impressions: string;
  screen_time_seconds: string;
  completion_rate: string;
}

export interface NetworkDailyTrendRow extends QueryResultRow {
  date: string;
  impressions: string;
  screen_time: string;
}

export interface NetworkEventTypeRow extends QueryResultRow {
  event_type: string;
  count: string;
  total_screen_time: string;
}

export interface SiteBenchmarkRow extends QueryResultRow {
  site_sponsor_id: string;
  sponsor_name: string;
  impressions: string;
  screen_time_seconds: string;
  completion_rate: string;
  active_days: string;
  contract_amount: string | null;
}

export interface MatchDayBreakdownRow extends QueryResultRow {
  match_date: string;
  impressions: string;
  screen_time_seconds: string;
  audience_estimate: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class SiteSponsorRepositoryImpl extends BaseRepository<SiteSponsorRow> {
  constructor() {
    super('site_sponsors');
  }

  // ========================================================================
  // CRUD
  // ========================================================================

  /**
   * Liste les sponsors d'un site avec nombre de vidéos et impressions.
   */
  async listBySite(siteId: string, includeInactive = false): Promise<SiteSponsorListRow[]> {
    let statusFilter = '';
    if (!includeInactive) {
      statusFilter = "AND ss.status = 'active'";
    }

    const result = await query<SiteSponsorListRow>(
      `SELECT
        ss.id,
        ss.site_id,
        ss.advertiser_id,
        ss.name,
        ss.contact_name,
        ss.contact_email,
        ss.logo_url,
        ss.contract_amount,
        ss.contract_start,
        ss.contract_end,
        ss.source,
        ss.status,
        ss.created_at,
        COUNT(DISTINCT ssv.id)::text as video_count,
        COALESCE(imp.cnt, 0)::text as total_impressions
       FROM site_sponsors ss
       LEFT JOIN site_sponsor_videos ssv ON ssv.site_sponsor_id = ss.id
       LEFT JOIN (
         SELECT site_sponsor_id, COUNT(*) as cnt
         FROM advertiser_impressions
         WHERE site_sponsor_id IS NOT NULL
         GROUP BY site_sponsor_id
       ) imp ON imp.site_sponsor_id = ss.id
       WHERE ss.site_id = $1 ${statusFilter}
       GROUP BY ss.id, imp.cnt
       ORDER BY ss.name ASC`,
      [siteId]
    );
    return result.rows;
  }

  /**
   * Récupère un sponsor de site par ID avec toutes ses infos.
   */
  async findByIdFull(id: string): Promise<SiteSponsorRow | null> {
    const result = await query<SiteSponsorRow>(
      `SELECT *
       FROM site_sponsors
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Trouve un site_sponsor par couple (advertiser_id, site_id).
   * Utilisé pour l'auto-création / résolution.
   */
  async findByAdvertiserAndSite(advertiserId: string, siteId: string): Promise<SiteSponsorRow | null> {
    const result = await query<SiteSponsorRow>(
      `SELECT *
       FROM site_sponsors
       WHERE advertiser_id = $1 AND site_id = $2`,
      [advertiserId, siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Trouve un sponsor local par nom (case-insensitive, trimmed) et site_id.
   * Utilisé pour la résolution idempotente des sponsors créés sur le Pi.
   */
  async findByNameAndSite(name: string, siteId: string): Promise<SiteSponsorRow | null> {
    const result = await query<SiteSponsorRow>(
      `SELECT *
       FROM site_sponsors
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
         AND site_id = $2
         AND source = 'local'
       LIMIT 1`,
      [name, siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Crée un nouveau sponsor de site.
   */
  async create(input: CreateSiteSponsorInput): Promise<SiteSponsorRow> {
    const result = await query<SiteSponsorRow>(
      `INSERT INTO site_sponsors
        (site_id, advertiser_id, name, contact_name, contact_email, contact_phone,
         logo_url, contract_amount, contract_start, contract_end, source, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        input.siteId,
        input.advertiserId || null,
        input.name,
        input.contactName || null,
        input.contactEmail || null,
        input.contactPhone || null,
        input.logoUrl || null,
        input.contractAmount ?? null,
        input.contractStart || null,
        input.contractEnd || null,
        input.source || 'local',
        input.metadata || {},
      ]
    );
    return result.rows[0];
  }

  /**
   * Met à jour un sponsor de site.
   */
  async update(id: string, data: UpdateSiteSponsorInput): Promise<SiteSponsorRow | null> {
    const result = await query<SiteSponsorRow>(
      `UPDATE site_sponsors
       SET name = COALESCE($1, name),
           contact_name = COALESCE($2, contact_name),
           contact_email = COALESCE($3, contact_email),
           contact_phone = COALESCE($4, contact_phone),
           logo_url = COALESCE($5, logo_url),
           contract_amount = COALESCE($6, contract_amount),
           contract_start = COALESCE($7, contract_start),
           contract_end = COALESCE($8, contract_end),
           status = COALESCE($9, status),
           metadata = COALESCE($10, metadata),
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        data.name, data.contactName, data.contactEmail, data.contactPhone,
        data.logoUrl, data.contractAmount, data.contractStart, data.contractEnd,
        data.status, data.metadata, id,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Supprime un sponsor de site.
   */
  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM site_sponsors WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Auto-crée (upsert) un site_sponsor quand un advertiser est assigné à un site.
   * Retourne l'ID du site_sponsor créé ou existant.
   */
  async upsertForAdvertiserSite(
    advertiserId: string,
    siteId: string,
    advertiserName: string,
    contactName: string | null,
    contactEmail: string | null,
    contractStart: Date | null,
    contractEnd: Date | null
  ): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO site_sponsors
        (site_id, advertiser_id, name, contact_name, contact_email,
         contract_start, contract_end, source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'neopro', 'active')
       ON CONFLICT (advertiser_id, site_id) WHERE advertiser_id IS NOT NULL
       DO UPDATE SET
         name = EXCLUDED.name,
         contact_name = COALESCE(EXCLUDED.contact_name, site_sponsors.contact_name),
         contact_email = COALESCE(EXCLUDED.contact_email, site_sponsors.contact_email),
         contract_start = COALESCE(EXCLUDED.contract_start, site_sponsors.contract_start),
         contract_end = COALESCE(EXCLUDED.contract_end, site_sponsors.contract_end),
         status = 'active',
         updated_at = NOW()
       RETURNING id`,
      [siteId, advertiserId, advertiserName, contactName, contactEmail, contractStart, contractEnd]
    );
    return result.rows[0].id;
  }

  // ========================================================================
  // Video Associations
  // ========================================================================

  /**
   * Récupère les vidéos associées à un sponsor de site.
   */
  async getVideos(siteSponsorId: string): Promise<SiteSponsorVideoRow[]> {
    const result = await query<SiteSponsorVideoRow>(
      `SELECT
        ssv.id,
        ssv.site_sponsor_id,
        ssv.video_id,
        ssv.video_filename,
        ssv.is_primary,
        ssv.added_at,
        v.original_name,
        v.duration,
        v.thumbnail_url
       FROM site_sponsor_videos ssv
       LEFT JOIN videos v ON v.id = ssv.video_id
       WHERE ssv.site_sponsor_id = $1
       ORDER BY ssv.added_at DESC`,
      [siteSponsorId]
    );
    return result.rows;
  }

  /**
   * Ajoute une vidéo à un sponsor de site (upsert par filename).
   */
  async addVideo(
    siteSponsorId: string,
    videoId: string | null,
    videoFilename: string,
    isPrimary = false
  ): Promise<void> {
    await query(
      `INSERT INTO site_sponsor_videos (site_sponsor_id, video_id, video_filename, is_primary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (site_sponsor_id, video_filename) DO UPDATE SET
         video_id = COALESCE(EXCLUDED.video_id, site_sponsor_videos.video_id),
         is_primary = EXCLUDED.is_primary`,
      [siteSponsorId, videoId, videoFilename, isPrimary]
    );
  }

  /**
   * Retire une vidéo d'un sponsor de site.
   */
  async removeVideo(siteSponsorId: string, videoFilename: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM site_sponsor_videos WHERE site_sponsor_id = $1 AND video_filename = $2',
      [siteSponsorId, videoFilename]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ========================================================================
  // Résolution site_sponsor_id
  // ========================================================================

  /**
   * Résout le site_sponsor_id pour une impression donnée (video_id + site_id).
   * Cherche dans site_sponsor_videos la vidéo, puis le site_sponsor du bon site.
   */
  async resolveSiteSponsorId(videoId: string, siteId: string): Promise<string | null> {
    const result = await query<{ id: string }>(
      `SELECT ss.id
       FROM site_sponsors ss
       JOIN site_sponsor_videos ssv ON ssv.site_sponsor_id = ss.id
       WHERE ssv.video_id = $1 AND ss.site_id = $2
       LIMIT 1`,
      [videoId, siteId]
    );
    return result.rows[0]?.id || null;
  }

  /**
   * Résout le site_sponsor_id via le filename de la vidéo + site_id.
   * Fallback quand video_id n'est pas disponible.
   */
  async resolveSiteSponsorIdByFilename(videoFilename: string, siteId: string): Promise<string | null> {
    const result = await query<{ id: string }>(
      `SELECT ss.id
       FROM site_sponsors ss
       JOIN site_sponsor_videos ssv ON ssv.site_sponsor_id = ss.id
       WHERE ssv.video_filename = $1 AND ss.site_id = $2
       LIMIT 1`,
      [videoFilename, siteId]
    );
    return result.rows[0]?.id || null;
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  /**
   * Résumé des stats pour un sponsor de site sur une période.
   */
  async getStatsSummary(siteSponsorId: string, from: string, to: string): Promise<SiteSponsorStatsSummary> {
    const result = await query<SiteSponsorStatsSummary>(
      `SELECT
        COUNT(*) as total_impressions,
        COALESCE(SUM(duration_played), 0) as total_screen_time_seconds,
        ROUND(AVG(CASE WHEN completed THEN 100 ELSE (duration_played::float / NULLIF(video_duration, 0) * 100) END)::numeric, 1) as completion_rate,
        COALESCE(SUM(audience_estimate), 0) as estimated_reach,
        COUNT(DISTINCT DATE(played_at)) as active_days
       FROM advertiser_impressions
       WHERE site_sponsor_id = $1
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')`,
      [siteSponsorId, from, to]
    );
    return result.rows[0];
  }

  /**
   * Tendances quotidiennes pour un sponsor de site.
   */
  async getDailyTrends(siteSponsorId: string, from: string, to: string): Promise<SiteSponsorDailyTrendRow[]> {
    const result = await query<SiteSponsorDailyTrendRow>(
      `SELECT
        DATE(played_at) as date,
        COUNT(*) as impressions,
        SUM(duration_played) as screen_time
       FROM advertiser_impressions
       WHERE site_sponsor_id = $1
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY DATE(played_at)
       ORDER BY date ASC`,
      [siteSponsorId, from, to]
    );
    return result.rows;
  }

  /**
   * Liste tous les site_sponsors pour un advertiser (tous sites confondus).
   * Utile pour le portail annonceur.
   */
  async listByAdvertiser(advertiserId: string): Promise<SiteSponsorListRow[]> {
    const result = await query<SiteSponsorListRow>(
      `SELECT
        ss.id,
        ss.site_id,
        ss.advertiser_id,
        ss.name,
        ss.contact_name,
        ss.contact_email,
        ss.logo_url,
        ss.contract_amount,
        ss.contract_start,
        ss.contract_end,
        ss.source,
        ss.status,
        ss.created_at,
        COUNT(DISTINCT ssv.id)::text as video_count,
        COALESCE(imp.cnt, 0)::text as total_impressions
       FROM site_sponsors ss
       LEFT JOIN site_sponsor_videos ssv ON ssv.site_sponsor_id = ss.id
       LEFT JOIN (
         SELECT site_sponsor_id, COUNT(*) as cnt
         FROM advertiser_impressions
         WHERE site_sponsor_id IS NOT NULL
         GROUP BY site_sponsor_id
       ) imp ON imp.site_sponsor_id = ss.id
       WHERE ss.advertiser_id = $1
       GROUP BY ss.id, imp.cnt
       ORDER BY ss.name ASC`,
      [advertiserId]
    );
    return result.rows;
  }

  // ========================================================================
  // Stats by Event Type (P2 — Rapports PDF)
  // ========================================================================

  /**
   * Répartition des impressions par type d'événement pour un site_sponsor.
   */
  async getStatsByEventType(
    siteSponsorId: string,
    from: string,
    to: string
  ): Promise<SiteSponsorEventTypeRow[]> {
    const result = await query<SiteSponsorEventTypeRow>(
      `SELECT
        COALESCE(event_type, 'other') as event_type,
        COUNT(*)::text as count,
        COALESCE(SUM(duration_played), 0)::text as total_screen_time
       FROM advertiser_impressions
       WHERE site_sponsor_id = $1
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY event_type
       ORDER BY count DESC`,
      [siteSponsorId, from, to]
    );
    return result.rows;
  }

  /**
   * Nombre de jours de match uniques couverts (pour formule reach).
   */
  async getMatchSessionCount(
    siteSponsorId: string,
    from: string,
    to: string
  ): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT DATE(played_at))::text as count
       FROM advertiser_impressions
       WHERE site_sponsor_id = $1
         AND event_type = 'match'
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')`,
      [siteSponsorId, from, to]
    );
    return parseInt(result.rows[0]?.count || '0');
  }

  // =========================================================================
  // P6.1 — Network stats (cross-club pour annonceurs NEOPRO)
  // =========================================================================

  async getNetworkStatsSummary(
    advertiserId: string, from: string, to: string
  ): Promise<{ rows: NetworkStatsSummary[] }> {
    return query<NetworkStatsSummary>(
      `SELECT
         COUNT(*)::text AS total_impressions,
         COALESCE(SUM(ai.duration_played), 0)::text AS total_screen_time_seconds,
         CASE WHEN COUNT(*) > 0
           THEN ROUND(SUM(CASE WHEN ai.completed THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 1)::text
           ELSE '0' END AS completion_rate,
         COALESCE(SUM(ai.audience_estimate), 0)::text AS estimated_reach,
         COUNT(DISTINCT ss.site_id)::text AS active_sites,
         COUNT(DISTINCT DATE(ai.played_at))::text AS active_days
       FROM advertiser_impressions ai
       JOIN site_sponsors ss ON ss.id = ai.site_sponsor_id
       WHERE ss.advertiser_id = $1
         AND ai.played_at >= $2::date
         AND ai.played_at < ($3::date + INTERVAL '1 day')`,
      [advertiserId, from, to]
    );
  }

  async getNetworkStatsBySite(
    advertiserId: string, from: string, to: string
  ): Promise<{ rows: NetworkSiteBreakdownRow[] }> {
    return query<NetworkSiteBreakdownRow>(
      `SELECT
         ss.site_id,
         s.site_name,
         s.club_name,
         COUNT(*)::text AS impressions,
         COALESCE(SUM(ai.duration_played), 0)::text AS screen_time_seconds,
         CASE WHEN COUNT(*) > 0
           THEN ROUND(SUM(CASE WHEN ai.completed THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 1)::text
           ELSE '0' END AS completion_rate
       FROM advertiser_impressions ai
       JOIN site_sponsors ss ON ss.id = ai.site_sponsor_id
       JOIN sites s ON s.id = ss.site_id
       WHERE ss.advertiser_id = $1
         AND ai.played_at >= $2::date
         AND ai.played_at < ($3::date + INTERVAL '1 day')
       GROUP BY ss.site_id, s.site_name, s.club_name
       ORDER BY impressions DESC`,
      [advertiserId, from, to]
    );
  }

  async getNetworkDailyTrends(
    advertiserId: string, from: string, to: string
  ): Promise<{ rows: NetworkDailyTrendRow[] }> {
    return query<NetworkDailyTrendRow>(
      `SELECT
         DATE(ai.played_at)::text AS date,
         COUNT(*)::text AS impressions,
         COALESCE(SUM(ai.duration_played), 0)::text AS screen_time
       FROM advertiser_impressions ai
       JOIN site_sponsors ss ON ss.id = ai.site_sponsor_id
       WHERE ss.advertiser_id = $1
         AND ai.played_at >= $2::date
         AND ai.played_at < ($3::date + INTERVAL '1 day')
       GROUP BY DATE(ai.played_at)
       ORDER BY date ASC`,
      [advertiserId, from, to]
    );
  }

  async getNetworkStatsByEventType(
    advertiserId: string, from: string, to: string
  ): Promise<{ rows: NetworkEventTypeRow[] }> {
    return query<NetworkEventTypeRow>(
      `SELECT
         ai.event_type,
         COUNT(*)::text AS count,
         COALESCE(SUM(ai.duration_played), 0)::text AS total_screen_time
       FROM advertiser_impressions ai
       JOIN site_sponsors ss ON ss.id = ai.site_sponsor_id
       WHERE ss.advertiser_id = $1
         AND ai.played_at >= $2::date
         AND ai.played_at < ($3::date + INTERVAL '1 day')
       GROUP BY ai.event_type
       ORDER BY count DESC`,
      [advertiserId, from, to]
    );
  }

  // =========================================================================
  // P6.2 — Benchmark intra-club
  // =========================================================================

  async getBenchmark(
    siteId: string, from: string, to: string
  ): Promise<{ rows: SiteBenchmarkRow[] }> {
    return query<SiteBenchmarkRow>(
      `SELECT
         ss.id AS site_sponsor_id,
         ss.name AS sponsor_name,
         COUNT(ai.id)::text AS impressions,
         COALESCE(SUM(ai.duration_played), 0)::text AS screen_time_seconds,
         CASE WHEN COUNT(ai.id) > 0
           THEN ROUND(SUM(CASE WHEN ai.completed THEN 1 ELSE 0 END)::numeric / COUNT(ai.id) * 100, 1)::text
           ELSE '0' END AS completion_rate,
         COUNT(DISTINCT DATE(ai.played_at))::text AS active_days,
         ss.contract_amount::text AS contract_amount
       FROM site_sponsors ss
       LEFT JOIN advertiser_impressions ai
         ON ai.site_sponsor_id = ss.id
         AND ai.played_at >= $2::date
         AND ai.played_at < ($3::date + INTERVAL '1 day')
       WHERE ss.site_id = $1
         AND ss.status = 'active'
       GROUP BY ss.id
       ORDER BY impressions DESC`,
      [siteId, from, to]
    );
  }

  // =========================================================================
  // P6.4 — Match-by-match breakdown
  // =========================================================================

  async getMatchDayBreakdown(
    siteSponsorId: string, from: string, to: string
  ): Promise<{ rows: MatchDayBreakdownRow[] }> {
    return query<MatchDayBreakdownRow>(
      `SELECT
         DATE(played_at)::text AS match_date,
         COUNT(*)::text AS impressions,
         COALESCE(SUM(duration_played), 0)::text AS screen_time_seconds,
         COALESCE(SUM(audience_estimate), 0)::text AS audience_estimate
       FROM advertiser_impressions
       WHERE site_sponsor_id = $1
         AND event_type = 'match'
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY DATE(played_at)
       ORDER BY match_date ASC`,
      [siteSponsorId, from, to]
    );
  }
}

export const siteSponsorRepository = new SiteSponsorRepositoryImpl();
