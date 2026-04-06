import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';


// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface SiteSponsorRow extends QueryResultRow {
  id: string;
  site_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  contract_amount: number | null;
  contract_start: string | null;
  contract_end: string | null;
  status: 'active' | 'expired' | 'paused';
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface SiteSponsorListRow extends QueryResultRow {
  id: string;
  site_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  logo_url: string | null;
  contract_amount: number | null;
  contract_start: string | null;
  contract_end: string | null;
  status: string;
  created_at: Date;
  video_count: string;
  total_impressions: string;
  video_filenames: string[];
}

export interface CreateSiteSponsorInput {
  siteId: string;
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  logoUrl?: string | null;
  contractAmount?: number | null;
  contractStart?: string | null;
  contractEnd?: string | null;
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

export interface SiteSponsorDeploymentRow extends QueryResultRow {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  video_filenames: string[];
}

export interface SiteSponsorStatsSummary extends QueryResultRow {
  total_impressions: string;
  total_screen_time_seconds: string;
  completion_rate: string;
  estimated_reach: string;
  active_days: string;
  manual_triggers: string;
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

export interface VideoStatsRow extends QueryResultRow {
  video_filename: string;
  impressions: string;
  screen_time_seconds: string;
  completion_rate: string;
  avg_duration_played: string;
  manual_triggers: string;
}

export interface PeriodBreakdownRow extends QueryResultRow {
  period: string;
  impressions: string;
  screen_time_seconds: string;
  completion_rate: string;
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
        ss.name,
        ss.contact_name,
        ss.contact_email,
        ss.logo_url,
        ss.contract_amount,
        ss.contract_start,
        ss.contract_end,
        ss.status,
        ss.created_at,
        COUNT(DISTINCT ssv.id)::text as video_count,
        COALESCE(imp.cnt, 0)::text as total_impressions,
        COALESCE(
          array_agg(ssv.video_filename) FILTER (WHERE ssv.video_filename IS NOT NULL),
          '{}'
        ) as video_filenames
       FROM site_sponsors ss
       LEFT JOIN site_sponsor_videos ssv ON ssv.site_sponsor_id = ss.id
       LEFT JOIN (
         SELECT site_sponsor_id AS ss_id, SUM(total_impressions) as cnt
         FROM site_sponsor_daily_stats
         GROUP BY site_sponsor_id
       ) imp ON imp.ss_id = ss.id
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
   * Trouve un sponsor local par nom (case-insensitive, trimmed) et site_id.
   * Utilisé pour la résolution idempotente des sponsors créés sur le Pi.
   */
  async findByNameAndSite(name: string, siteId: string): Promise<SiteSponsorRow | null> {
    const result = await query<SiteSponsorRow>(
      `SELECT *
       FROM site_sponsors
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
         AND site_id = $2
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
        (site_id, name, contact_name, contact_email, contact_phone,
         logo_url, contract_amount, contract_start, contract_end, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.siteId,
        input.name,
        input.contactName || null,
        input.contactEmail || null,
        input.contactPhone || null,
        input.logoUrl || null,
        input.contractAmount ?? null,
        input.contractStart || null,
        input.contractEnd || null,
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
       WHERE (ssv.video_filename = $1 OR ssv.video_filename LIKE '%/' || $1)
         AND ss.site_id = $2
       LIMIT 1`,
      [videoFilename, siteId]
    );
    return result.rows[0]?.id || null;
  }

  /**
   * Bulk-resolve site_sponsor_ids for multiple (video_id, site_id) pairs in ONE query.
   * Returns a Map keyed by "videoId::siteId" → site_sponsor_id.
   */
  async resolveSiteSponsorIdsBulk(
    pairs: ReadonlyArray<{ videoId: string; siteId: string }>
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (pairs.length === 0) return result;

    // Build parameterised VALUES list: ($1,$2), ($3,$4), ...
    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const p of pairs) {
      values.push(`($${idx}::uuid, $${idx + 1}::uuid)`);
      params.push(p.videoId, p.siteId);
      idx += 2;
    }

    const queryResult = await query<{ site_sponsor_id: string; video_id: string; site_id: string }>(
      `SELECT DISTINCT ON (v.video_id, v.site_id)
         ss.id AS site_sponsor_id,
         ssv.video_id,
         ss.site_id
       FROM (VALUES ${values.join(', ')}) AS v(video_id, site_id)
       JOIN site_sponsor_videos ssv ON ssv.video_id = v.video_id
       JOIN site_sponsors ss ON ss.id = ssv.site_sponsor_id AND ss.site_id = v.site_id`,
      params
    );

    for (const row of queryResult.rows) {
      result.set(`${row.video_id}::${row.site_id}`, row.site_sponsor_id);
    }
    return result;
  }

  /**
   * Bulk-resolve site_sponsor_ids for multiple (video_filename, site_id) pairs in ONE query.
   * Returns a Map keyed by "filename::siteId" → site_sponsor_id.
   */
  async resolveSiteSponsorIdsByFilenameBulk(
    pairs: ReadonlyArray<{ videoFilename: string; siteId: string }>
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (pairs.length === 0) return result;

    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const p of pairs) {
      values.push(`($${idx}::text, $${idx + 1}::uuid)`);
      params.push(p.videoFilename, p.siteId);
      idx += 2;
    }

    const queryResult = await query<{ site_sponsor_id: string; video_filename: string; site_id: string }>(
      `SELECT DISTINCT ON (v.video_filename, v.site_id)
         ss.id AS site_sponsor_id,
         v.video_filename,
         v.site_id::text AS site_id
       FROM (VALUES ${values.join(', ')}) AS v(video_filename, site_id)
       JOIN site_sponsor_videos ssv ON (ssv.video_filename = v.video_filename OR ssv.video_filename LIKE '%/' || v.video_filename)
       JOIN site_sponsors ss ON ss.id = ssv.site_sponsor_id AND ss.site_id = v.site_id`,
      params
    );

    for (const row of queryResult.rows) {
      result.set(`${row.video_filename}::${row.site_id}`, row.site_sponsor_id);
    }
    return result;
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
        COALESCE(SUM(total_impressions), 0) as total_impressions,
        COALESCE(SUM(total_screen_time_seconds), 0) as total_screen_time_seconds,
        CASE WHEN SUM(total_impressions) > 0
          THEN ROUND(SUM(completed_plays)::numeric / SUM(total_impressions) * 100, 1)
          ELSE 0 END as completion_rate,
        COALESCE(SUM(estimated_reach), 0) as estimated_reach,
        COUNT(*) FILTER (WHERE total_impressions > 0) as active_days,
        COALESCE(SUM(manual_triggers), 0) as manual_triggers
       FROM site_sponsor_daily_stats
       WHERE site_sponsor_id = $1
         AND date >= $2::date
         AND date <= $3::date`,
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
        date,
        total_impressions as impressions,
        total_screen_time_seconds as screen_time
       FROM site_sponsor_daily_stats
       WHERE site_sponsor_id = $1
         AND date >= $2::date
         AND date <= $3::date
       ORDER BY date ASC`,
      [siteSponsorId, from, to]
    );
    return result.rows;
  }

  // ADR-035 Phase 4: listByAdvertiser supprimé — site_sponsors n'a plus de lien advertiser.
  // Les stats réseau annonceur passent par video_plays.sponsor_id directement.

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
      `SELECT event_type, count::text, total_screen_time::text
       FROM (
         SELECT 'match' AS event_type,
           SUM(impressions_match) AS count, SUM(screen_time_match) AS total_screen_time
         FROM site_sponsor_daily_stats WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'training',
           SUM(impressions_training), SUM(screen_time_training)
         FROM site_sponsor_daily_stats WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'tournament',
           SUM(impressions_tournament), SUM(screen_time_tournament)
         FROM site_sponsor_daily_stats WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'other',
           SUM(impressions_other), SUM(screen_time_other)
         FROM site_sponsor_daily_stats WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
       ) sub
       WHERE count > 0
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
      `SELECT COUNT(*) FILTER (WHERE impressions_match > 0)::text as count
       FROM site_sponsor_daily_stats
       WHERE site_sponsor_id = $1
         AND date >= $2::date
         AND date <= $3::date`,
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
         COALESCE(SUM(total_impressions), 0)::text AS total_impressions,
         COALESCE(SUM(total_screen_time_seconds), 0)::text AS total_screen_time_seconds,
         CASE WHEN SUM(total_impressions) > 0
           THEN ROUND(SUM(completed_plays)::numeric / SUM(total_impressions) * 100, 1)::text
           ELSE '0' END AS completion_rate,
         COALESCE(SUM(estimated_reach), 0)::text AS estimated_reach,
         COUNT(DISTINCT site_id)::text AS active_sites,
         COUNT(DISTINCT date) FILTER (WHERE total_impressions > 0)::text AS active_days
       FROM site_sponsor_daily_stats
       WHERE sponsor_id = $1
         AND date >= $2::date
         AND date <= $3::date`,
      [advertiserId, from, to]
    );
  }

  async getNetworkStatsBySite(
    advertiserId: string, from: string, to: string
  ): Promise<{ rows: NetworkSiteBreakdownRow[] }> {
    return query<NetworkSiteBreakdownRow>(
      `SELECT
         ssds.site_id,
         s.site_name,
         s.club_name,
         SUM(ssds.total_impressions)::text AS impressions,
         SUM(ssds.total_screen_time_seconds)::text AS screen_time_seconds,
         CASE WHEN SUM(ssds.total_impressions) > 0
           THEN ROUND(SUM(ssds.completed_plays)::numeric / SUM(ssds.total_impressions) * 100, 1)::text
           ELSE '0' END AS completion_rate
       FROM site_sponsor_daily_stats ssds
       JOIN sites s ON s.id = ssds.site_id
       WHERE ssds.sponsor_id = $1
         AND ssds.date >= $2::date
         AND ssds.date <= $3::date
       GROUP BY ssds.site_id, s.site_name, s.club_name
       ORDER BY impressions DESC`,
      [advertiserId, from, to]
    );
  }

  async getNetworkDailyTrends(
    advertiserId: string, from: string, to: string
  ): Promise<{ rows: NetworkDailyTrendRow[] }> {
    return query<NetworkDailyTrendRow>(
      `SELECT
         date::text AS date,
         SUM(total_impressions)::text AS impressions,
         SUM(total_screen_time_seconds)::text AS screen_time
       FROM site_sponsor_daily_stats
       WHERE sponsor_id = $1
         AND date >= $2::date
         AND date <= $3::date
       GROUP BY date
       ORDER BY date ASC`,
      [advertiserId, from, to]
    );
  }

  async getNetworkStatsByEventType(
    advertiserId: string, from: string, to: string
  ): Promise<{ rows: NetworkEventTypeRow[] }> {
    return query<NetworkEventTypeRow>(
      `SELECT event_type, count::text, total_screen_time::text
       FROM (
         SELECT 'match' AS event_type,
           SUM(impressions_match) AS count, SUM(screen_time_match) AS total_screen_time
         FROM site_sponsor_daily_stats WHERE sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'training',
           SUM(impressions_training), SUM(screen_time_training)
         FROM site_sponsor_daily_stats WHERE sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'tournament',
           SUM(impressions_tournament), SUM(screen_time_tournament)
         FROM site_sponsor_daily_stats WHERE sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'other',
           SUM(impressions_other), SUM(screen_time_other)
         FROM site_sponsor_daily_stats WHERE sponsor_id = $1 AND date >= $2::date AND date <= $3::date
       ) sub
       WHERE count > 0
       ORDER BY count DESC`,
      [advertiserId, from, to]
    );
  }

  // =========================================================================
  // Deployment — Données sponsors pour le Pi
  // =========================================================================

  /**
   * Récupère les sponsors actifs d'un site avec leurs vidéos associées,
   * formatés pour le déploiement vers le Pi.
   */
  async getSponsorsForDeployment(siteId: string): Promise<SiteSponsorDeploymentRow[]> {
    const result = await query<SiteSponsorDeploymentRow>(
      `SELECT
        ss.id,
        ss.name,
        ss.contact_email,
        ss.contact_phone,
        ss.logo_url,
        COALESCE(
          array_agg(ssv.video_filename) FILTER (WHERE ssv.video_filename IS NOT NULL),
          '{}'
        ) as video_filenames
       FROM site_sponsors ss
       LEFT JOIN site_sponsor_videos ssv ON ssv.site_sponsor_id = ss.id
       WHERE ss.site_id = $1 AND ss.status = 'active'
       GROUP BY ss.id
       ORDER BY ss.name ASC`,
      [siteId]
    );
    return result.rows;
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
         COALESCE(SUM(ssds.total_impressions), 0)::text AS impressions,
         COALESCE(SUM(ssds.total_screen_time_seconds), 0)::text AS screen_time_seconds,
         CASE WHEN SUM(ssds.total_impressions) > 0
           THEN ROUND(SUM(ssds.completed_plays)::numeric / SUM(ssds.total_impressions) * 100, 1)::text
           ELSE '0' END AS completion_rate,
         COUNT(ssds.date) FILTER (WHERE ssds.total_impressions > 0)::text AS active_days,
         ss.contract_amount::text AS contract_amount
       FROM site_sponsors ss
       LEFT JOIN site_sponsor_daily_stats ssds
         ON ssds.site_sponsor_id = ss.id
         AND ssds.date >= $2::date
         AND ssds.date <= $3::date
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
         ssds.date::text AS match_date,
         ssds.impressions_match::text AS impressions,
         ssds.screen_time_match::text AS screen_time_seconds,
         ssds.audience_estimate_match::text AS audience_estimate
       FROM site_sponsor_daily_stats ssds
       WHERE ssds.site_sponsor_id = $1
         AND ssds.date >= $2::date
         AND ssds.date <= $3::date
         AND ssds.impressions_match > 0
       ORDER BY ssds.date ASC`,
      [siteSponsorId, from, to]
    );
  }
  // =========================================================================
  // P-PoC — Stats par vidéo pour un sponsor
  // =========================================================================

  async getStatsByVideo(
    siteSponsorId: string, from: string, to: string
  ): Promise<{ rows: VideoStatsRow[] }> {
    return query<VideoStatsRow>(
      `SELECT
         ssdvs.video_filename,
         SUM(ssdvs.impressions)::text AS impressions,
         SUM(ssdvs.screen_time_seconds)::text AS screen_time_seconds,
         CASE WHEN SUM(ssdvs.impressions) > 0
           THEN ROUND(SUM(ssdvs.completed_plays)::numeric / SUM(ssdvs.impressions) * 100, 1)::text
           ELSE '0' END AS completion_rate,
         CASE WHEN SUM(ssdvs.impressions) > 0
           THEN ROUND(SUM(ssdvs.total_duration_played)::numeric / SUM(ssdvs.impressions), 1)::text
           ELSE '0' END AS avg_duration_played,
         SUM(ssdvs.manual_triggers)::text AS manual_triggers
       FROM site_sponsor_daily_video_stats ssdvs
       WHERE ssdvs.site_sponsor_id = $1
         AND ssdvs.date >= $2::date
         AND ssdvs.date <= $3::date
       GROUP BY ssdvs.video_filename
       ORDER BY impressions DESC`,
      [siteSponsorId, from, to]
    );
  }

  // =========================================================================
  // P-PoC — Répartition par période de match
  // =========================================================================

  async getStatsByPeriod(
    siteSponsorId: string, from: string, to: string
  ): Promise<{ rows: PeriodBreakdownRow[] }> {
    return query<PeriodBreakdownRow>(
      `SELECT period, impressions::text, screen_time_seconds::text,
         CASE WHEN impressions > 0
           THEN ROUND(completed::numeric / impressions * 100, 1)::text
           ELSE '0' END AS completion_rate
       FROM (
         SELECT 'pre_match' AS period,
           SUM(impressions_pre_match) AS impressions,
           SUM(screen_time_pre_match) AS screen_time_seconds,
           SUM(completed_pre_match) AS completed
         FROM site_sponsor_daily_stats
         WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'halftime',
           SUM(impressions_halftime), SUM(screen_time_halftime), SUM(completed_halftime)
         FROM site_sponsor_daily_stats
         WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'post_match',
           SUM(impressions_post_match), SUM(screen_time_post_match), SUM(completed_post_match)
         FROM site_sponsor_daily_stats
         WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
         UNION ALL
         SELECT 'loop',
           SUM(impressions_loop), SUM(screen_time_loop), SUM(completed_loop)
         FROM site_sponsor_daily_stats
         WHERE site_sponsor_id = $1 AND date >= $2::date AND date <= $3::date
       ) sub
       WHERE impressions > 0
       ORDER BY impressions DESC`,
      [siteSponsorId, from, to]
    );
  }
}

export const siteSponsorRepository = new SiteSponsorRepositoryImpl();
