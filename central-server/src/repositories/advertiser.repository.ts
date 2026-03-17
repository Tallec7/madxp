import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';
import { ALL_SPONSOR_CATEGORIES } from '../utils/sponsor-categories';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface AdvertiserRow extends QueryResultRow {
  id: string;
  name: string;
  logo_url: string | null;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAdvertiserInput {
  name: string;
  logoUrl: string | null;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  metadata: Record<string, unknown> | null;
}

export interface UpdateAdvertiserInput {
  name?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactName?: string;
  contactPhone?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface AdvertiserVideoRow extends QueryResultRow {
  video_id: string;
  is_primary: boolean;
  added_at: Date;
  filename: string;
  original_name: string | null;
  duration: number | null;
  thumbnail_url: string | null;
  file_size: number | null;
}

export interface AdvertiserStatsSummary extends QueryResultRow {
  total_impressions: string;
  total_screen_time_seconds: string;
  completion_rate: string;
  estimated_reach: string;
  active_sites: string;
  active_days: string;
}

export interface AdvertiserVideoStatsRow extends QueryResultRow {
  video_id: string;
  video_name: string;
  impressions: string;
  screen_time_seconds: string;
  completion_rate: string;
}

export interface AdvertiserSiteStatsRow extends QueryResultRow {
  site_id: string;
  site_name: string;
  club_name: string;
  impressions: string;
  screen_time_seconds: string;
}

export interface AdvertiserPeriodRow extends QueryResultRow {
  period: string;
  count: string;
}

export interface AdvertiserEventTypeRow extends QueryResultRow {
  event_type: string;
  count: string;
}

export interface AdvertiserDailyTrendRow extends QueryResultRow {
  date: string;
  impressions: string;
  screen_time: string;
}

// KPI types (from consolidated video_plays pipeline)
export interface AdvertiserKpisSummary extends QueryResultRow {
  total_impressions: string;
  verified_impressions: string;
  tv_on_rate: string;
  match_day_impressions: string;
  completion_rate: string;
  sites_coverage: string;
  total_screen_time_seconds: string;
}

export interface AdvertiserPeakHourRow extends QueryResultRow {
  hour: string;
  impressions: string;
  screen_time: string;
}

export interface AdvertiserRotationFairnessRow extends QueryResultRow {
  video_filename: string;
  play_count: string;
}

export interface AdvertiserImpressionExportRow extends QueryResultRow {
  id: string;
  video_id: string;
  video_name: string;
  site_id: string;
  site_name: string;
  club_name: string;
  played_at: string;
  duration_played: number;
  video_duration: number;
  completed: boolean;
  event_type: string | null;
  period: string | null;
  trigger_type: string | null;
  audience_estimate: number | null;
}

export interface ImpressionBatchItem {
  eventId: string | null;
  siteSponsorId: string | null;
  siteId: string;
  videoId: string | null;
  playedAt: string;
  durationPlayed: number;
  videoDuration: number;
  completed: boolean;
  interruptedAt: string | null;
  eventType: string | null;
  period: string | null;
  triggerType: string;
  positionInLoop: number | null;
  audienceEstimate: number | null;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class AdvertiserRepositoryImpl extends BaseRepository<AdvertiserRow> {
  constructor() {
    super('advertisers');
  }

  // ========================================================================
  // CRUD
  // ========================================================================

  /**
   * Liste tous les annonceurs tries par nom.
   */
  async listAll(): Promise<AdvertiserRow[]> {
    const result = await query<AdvertiserRow>(
      `SELECT id, name, logo_url, contact_email, contact_name, contact_phone, status, created_at
       FROM advertisers
       ORDER BY name ASC`
    );
    return result.rows;
  }

  /**
   * Recupere un annonceur par ID avec metadata.
   */
  async findByIdFull(id: string): Promise<AdvertiserRow | null> {
    const result = await query<AdvertiserRow>(
      `SELECT id, name, logo_url, contact_email, contact_name, contact_phone, status, metadata, created_at, updated_at
       FROM advertisers
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Retourne le sous-ensemble d'IDs qui existent dans la table advertisers.
   */
  async findExistingIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query<{ id: string }>(
      `SELECT id FROM advertisers WHERE id IN (${placeholders})`,
      ids
    );
    return new Set(result.rows.map(r => r.id));
  }

  /**
   * Recupere le nom d'un annonceur.
   */
  async findName(id: string): Promise<string | null> {
    const result = await query<{ name: string }>(
      'SELECT name FROM advertisers WHERE id = $1',
      [id]
    );
    return result.rows[0]?.name || null;
  }

  /**
   * Cree un nouvel annonceur.
   */
  async create(input: CreateAdvertiserInput): Promise<AdvertiserRow> {
    const result = await query<AdvertiserRow>(
      `INSERT INTO advertisers (name, logo_url, contact_email, contact_name, contact_phone, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.name, input.logoUrl, input.contactEmail, input.contactName, input.contactPhone, input.metadata || {}]
    );
    return result.rows[0];
  }

  /**
   * Met a jour un annonceur avec COALESCE.
   */
  async update(id: string, data: UpdateAdvertiserInput): Promise<AdvertiserRow | null> {
    const result = await query<AdvertiserRow>(
      `UPDATE advertisers
       SET name = COALESCE($1, name),
           logo_url = COALESCE($2, logo_url),
           contact_email = COALESCE($3, contact_email),
           contact_name = COALESCE($4, contact_name),
           contact_phone = COALESCE($5, contact_phone),
           status = COALESCE($6, status),
           metadata = COALESCE($7, metadata),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [data.name, data.logoUrl, data.contactEmail, data.contactName, data.contactPhone, data.status, data.metadata, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Supprime un annonceur.
   */
  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM advertisers WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ========================================================================
  // Video Associations
  // ========================================================================

  /**
   * Associe des videos a un annonceur (upsert).
   */
  async addVideos(advertiserId: string, videoIds: string[], isPrimary = true): Promise<void> {
    const values = videoIds
      .map((_, idx) => `($1, $${idx + 2}, $${videoIds.length + 2})`)
      .join(', ');
    const params: unknown[] = [advertiserId, ...videoIds, isPrimary];

    await query(
      `INSERT INTO advertiser_videos (advertiser_id, video_id, is_primary)
       VALUES ${values}
       ON CONFLICT (advertiser_id, video_id) DO UPDATE
       SET is_primary = EXCLUDED.is_primary`,
      params
    );
  }

  /**
   * Dissocie une video d'un annonceur.
   */
  async removeVideo(advertiserId: string, videoId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM advertiser_videos WHERE advertiser_id = $1 AND video_id = $2',
      [advertiserId, videoId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Recupere les videos associees a un annonceur avec metadata.
   */
  async getVideos(advertiserId: string): Promise<AdvertiserVideoRow[]> {
    const result = await query<AdvertiserVideoRow>(
      `SELECT
        av.video_id,
        av.is_primary,
        av.added_at,
        v.filename,
        v.original_name,
        v.duration,
        v.thumbnail_url,
        v.file_size
       FROM advertiser_videos av
       JOIN videos v ON v.id = av.video_id
       WHERE av.advertiser_id = $1
       ORDER BY av.added_at DESC`,
      [advertiserId]
    );
    return result.rows;
  }

  /**
   * Recupere les IDs des videos d'un annonceur.
   */
  async getVideoIds(advertiserId: string): Promise<string[]> {
    const result = await query<{ video_id: string }>(
      'SELECT video_id FROM advertiser_videos WHERE advertiser_id = $1',
      [advertiserId]
    );
    return result.rows.map(r => r.video_id);
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  /**
   * Resume global des impressions pour une periode.
   */
  async getStatsSummary(videoIds: string[], from: string, to: string): Promise<AdvertiserStatsSummary> {
    const result = await query<AdvertiserStatsSummary>(
      `SELECT
        COUNT(*) as total_impressions,
        SUM(duration_played) as total_screen_time_seconds,
        ROUND(AVG(CASE WHEN completed THEN 100 ELSE (duration_played::float / NULLIF(video_duration, 0) * 100) END)::numeric, 1) as completion_rate,
        SUM(audience_estimate) as estimated_reach,
        COUNT(DISTINCT site_id) as active_sites,
        COUNT(DISTINCT DATE(played_at)) as active_days
       FROM video_plays
       WHERE video_id = ANY($1::uuid[])
         AND category IN ${ALL_SPONSOR_CATEGORIES}
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')`,
      [videoIds, from, to]
    );
    return result.rows[0];
  }

  /**
   * Stats par video.
   */
  async getStatsByVideo(videoIds: string[], from: string, to: string): Promise<AdvertiserVideoStatsRow[]> {
    const result = await query<AdvertiserVideoStatsRow>(
      `SELECT
        v.id as video_id,
        v.filename as video_name,
        COUNT(*) as impressions,
        SUM(vp.duration_played) as screen_time_seconds,
        ROUND(AVG(CASE WHEN vp.completed THEN 100 ELSE (vp.duration_played::float / NULLIF(vp.video_duration, 0) * 100) END)::numeric, 1) as completion_rate
       FROM videos v
       JOIN video_plays vp ON vp.video_id = v.id AND vp.category IN ${ALL_SPONSOR_CATEGORIES}
       WHERE v.id = ANY($1::uuid[])
         AND vp.played_at >= $2::date
         AND vp.played_at < ($3::date + INTERVAL '1 day')
       GROUP BY v.id, v.filename
       ORDER BY impressions DESC`,
      [videoIds, from, to]
    );
    return result.rows;
  }

  /**
   * Stats par site (top 20).
   */
  async getStatsBySite(videoIds: string[], from: string, to: string): Promise<AdvertiserSiteStatsRow[]> {
    const result = await query<AdvertiserSiteStatsRow>(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        COUNT(*) as impressions,
        SUM(vp.duration_played) as screen_time_seconds
       FROM sites s
       JOIN video_plays vp ON vp.site_id = s.id AND vp.category IN ${ALL_SPONSOR_CATEGORIES}
       WHERE vp.video_id = ANY($1::uuid[])
         AND vp.played_at >= $2::date
         AND vp.played_at < ($3::date + INTERVAL '1 day')
       GROUP BY s.id, s.site_name, s.club_name
       ORDER BY impressions DESC
       LIMIT 20`,
      [videoIds, from, to]
    );
    return result.rows;
  }

  /**
   * Stats par periode de diffusion.
   */
  async getStatsByPeriod(videoIds: string[], from: string, to: string): Promise<AdvertiserPeriodRow[]> {
    const result = await query<AdvertiserPeriodRow>(
      `SELECT
        COALESCE(period, 'loop') as period,
        COUNT(*) as count
       FROM video_plays
       WHERE video_id = ANY($1::uuid[])
         AND category IN ${ALL_SPONSOR_CATEGORIES}
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY period`,
      [videoIds, from, to]
    );
    return result.rows;
  }

  /**
   * Stats par type d'evenement.
   */
  async getStatsByEventType(videoIds: string[], from: string, to: string): Promise<AdvertiserEventTypeRow[]> {
    const result = await query<AdvertiserEventTypeRow>(
      `SELECT
        COALESCE(event_type, 'other') as event_type,
        COUNT(*) as count
       FROM video_plays
       WHERE video_id = ANY($1::uuid[])
         AND category IN ${ALL_SPONSOR_CATEGORIES}
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY event_type`,
      [videoIds, from, to]
    );
    return result.rows;
  }

  /**
   * Tendances quotidiennes.
   */
  async getDailyTrends(videoIds: string[], from: string, to: string): Promise<AdvertiserDailyTrendRow[]> {
    const result = await query<AdvertiserDailyTrendRow>(
      `SELECT
        DATE(played_at) as date,
        COUNT(*) as impressions,
        SUM(duration_played) as screen_time
       FROM video_plays
       WHERE video_id = ANY($1::uuid[])
         AND category IN ${ALL_SPONSOR_CATEGORIES}
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY DATE(played_at)
       ORDER BY date ASC`,
      [videoIds, from, to]
    );
    return result.rows;
  }

  // ========================================================================
  // KPIs (from consolidated video_plays pipeline)
  // ========================================================================

  /**
   * KPIs enrichis depuis video_plays (Pipeline A consolidé).
   * Utilise tv_status, event_type, period pour des métriques business actionnables.
   */
  async getKpisSummary(advertiserId: string, from: string, to: string): Promise<AdvertiserKpisSummary> {
    const result = await query<AdvertiserKpisSummary>(
      `SELECT
        COUNT(*) as total_impressions,
        COUNT(*) FILTER (WHERE tv_status = 'on') as verified_impressions,
        ROUND(
          (COUNT(*) FILTER (WHERE tv_status = 'on'))::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as tv_on_rate,
        COUNT(*) FILTER (WHERE event_type = 'match') as match_day_impressions,
        ROUND(AVG(CASE WHEN completed THEN 100 ELSE 0 END)::numeric, 1) as completion_rate,
        COUNT(DISTINCT site_id) as sites_coverage,
        COALESCE(SUM(duration_played), 0) as total_screen_time_seconds
       FROM video_plays
       WHERE sponsor_id = $1
         AND category IN ${ALL_SPONSOR_CATEGORIES}
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
         AND (tv_status IN ('on', 'unknown') OR tv_status IS NULL)`,
      [advertiserId, from, to]
    );
    return result.rows[0];
  }

  /**
   * Heures de forte visibilité (heatmap data).
   */
  async getKpisPeakHours(advertiserId: string, from: string, to: string): Promise<AdvertiserPeakHourRow[]> {
    const result = await query<AdvertiserPeakHourRow>(
      `SELECT
        EXTRACT(hour FROM played_at)::int as hour,
        COUNT(*) as impressions,
        COALESCE(SUM(duration_played), 0) as screen_time
       FROM video_plays
       WHERE sponsor_id = $1
         AND category IN ${ALL_SPONSOR_CATEGORIES}
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
         AND (tv_status IN ('on', 'unknown') OR tv_status IS NULL)
       GROUP BY EXTRACT(hour FROM played_at)
       ORDER BY hour`,
      [advertiserId, from, to]
    );
    return result.rows;
  }

  /**
   * Données pour le calcul du rotation fairness score.
   * Retourne le nombre de passages par vidéo.
   */
  async getKpisRotationData(advertiserId: string, from: string, to: string): Promise<AdvertiserRotationFairnessRow[]> {
    const result = await query<AdvertiserRotationFairnessRow>(
      `SELECT
        video_filename,
        COUNT(*) as play_count
       FROM video_plays
       WHERE sponsor_id = $1
         AND category IN ${ALL_SPONSOR_CATEGORIES}
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
         AND (tv_status IN ('on', 'unknown') OR tv_status IS NULL)
       GROUP BY video_filename
       ORDER BY play_count DESC`,
      [advertiserId, from, to]
    );
    return result.rows;
  }

  // ========================================================================
  // Impressions (Batch)
  // ========================================================================

  /**
   * Insert en batch des impressions advertiser.
   */
  async recordImpressions(items: ImpressionBatchItem[]): Promise<number> {
    if (items.length === 0) return 0;

    const values: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const imp of items) {
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11}, $${paramIndex + 12}, 'sponsor')`
      );
      params.push(
        imp.eventId, imp.siteSponsorId, imp.siteId, imp.videoId, imp.playedAt,
        imp.durationPlayed, imp.videoDuration, imp.completed,
        imp.eventType, imp.period, imp.triggerType, imp.positionInLoop, imp.audienceEstimate
      );
      paramIndex += 13;
    }

    await query(
      `INSERT INTO video_plays
       (event_id, site_sponsor_id, site_id, video_id, played_at, duration_played, video_duration, completed, event_type, period, trigger_type, position_in_loop, audience_estimate, category)
       VALUES ${values.join(', ')}
       ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
      params
    );

    return items.length;
  }

  // ========================================================================
  // Data Export
  // ========================================================================

  /**
   * Export des impressions avec jointures pour CSV.
   */
  async exportImpressions(videoIds: string[], from: string, to: string): Promise<AdvertiserImpressionExportRow[]> {
    const result = await query<AdvertiserImpressionExportRow>(
      `SELECT
        vp.id,
        vp.video_id,
        v.filename as video_name,
        vp.site_id,
        s.site_name,
        s.club_name,
        vp.played_at,
        vp.duration_played,
        vp.video_duration,
        vp.completed,
        vp.event_type,
        vp.period,
        vp.trigger_type,
        vp.audience_estimate
       FROM video_plays vp
       JOIN videos v ON v.id = vp.video_id
       JOIN sites s ON s.id = vp.site_id
       WHERE vp.video_id = ANY($1::uuid[])
         AND vp.category IN ${ALL_SPONSOR_CATEGORIES}
         AND vp.played_at >= $2::date
         AND vp.played_at < ($3::date + INTERVAL '1 day')
       ORDER BY vp.played_at DESC`,
      [videoIds, from, to]
    );
    return result.rows;
  }

  /**
   * Calcule les stats quotidiennes via fonction PG.
   */
  async calculateDailyStats(date: string): Promise<number> {
    const result = await query<{ calculate_all_advertiser_daily_stats: number }>(
      'SELECT calculate_all_advertiser_daily_stats($1::date) as count',
      [date]
    );
    return result.rows[0]?.calculate_all_advertiser_daily_stats ?? 0;
  }
}

export const advertiserRepository = new AdvertiserRepositoryImpl();
