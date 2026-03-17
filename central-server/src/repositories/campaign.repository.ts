import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';
import { ALL_SPONSOR_CATEGORIES } from '../utils/sponsor-categories';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface CampaignRow extends QueryResultRow {
  id: string;
  advertiser_id: string;
  name: string;
  target_impressions: number | null;
  target_sites: string[] | null;
  campaign_type: string;
  variant_config: Record<string, unknown> | null;
  target_criteria: TargetCriteria | null;
  budget_cents: number | null;
  target_cpm_cents: number | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TargetCriteria {
  sports?: string[];
  regions?: string[];
  min_audience?: number;
  group_ids?: string[];
}

export interface CreateCampaignInput {
  advertiserId: string;
  name: string;
  campaignType?: string;
  targetImpressions?: number;
  targetCriteria?: TargetCriteria;
  budgetCents?: number;
  targetCpmCents?: number;
  startDate?: string;
  endDate?: string;
}

export interface UpdateCampaignInput {
  name?: string;
  campaignType?: string;
  targetImpressions?: number;
  targetCriteria?: TargetCriteria;
  budgetCents?: number;
  targetCpmCents?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface CampaignVideoRow extends QueryResultRow {
  id: string;
  campaign_id: string;
  video_id: string;
  weight: number;
  added_at: Date;
  filename: string;
  original_name: string | null;
  duration: number | null;
  file_size: number | null;
}

export interface CampaignSiteRow extends QueryResultRow {
  id: string;
  campaign_id: string;
  site_id: string;
  deployment_status: string;
  deployed_at: Date | null;
  created_at: Date;
  site_name: string;
  club_name: string;
  status: string;
}

export interface CampaignStatsRow extends QueryResultRow {
  campaign_id: string;
  advertiser_id: string;
  campaign_name: string;
  status: string;
  target_impressions: number | null;
  budget_cents: number | null;
  target_cpm_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  total_impressions: string;
  total_screen_time_seconds: string;
  avg_completion_rate: string;
  active_sites: string;
  unique_videos: string;
  progress_percent: string | null;
  effective_cpm_cents: string | null;
}

export interface CampaignWithDetails extends CampaignRow {
  advertiser_name: string;
  videos_count: number;
  sites_count: number;
  total_impressions: number;
  progress_percent: number | null;
}

export interface ResolvedSiteRow extends QueryResultRow {
  id: string;
  site_name: string;
  club_name: string;
  sports: unknown;
  location: unknown;
  status: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class CampaignRepository extends BaseRepository<CampaignRow> {
  constructor() {
    super('campaigns');
  }

  // ========================================================================
  // CRUD
  // ========================================================================

  async create(input: CreateCampaignInput): Promise<CampaignRow> {
    const result = await query<CampaignRow>(
      `INSERT INTO campaigns (
        advertiser_id, name, campaign_type, target_impressions,
        target_criteria, budget_cents, target_cpm_cents, start_date, end_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        input.advertiserId,
        input.name,
        input.campaignType || 'standard',
        input.targetImpressions || null,
        input.targetCriteria ? JSON.stringify(input.targetCriteria) : null,
        input.budgetCents || null,
        input.targetCpmCents || null,
        input.startDate || null,
        input.endDate || null,
      ]
    );
    return result.rows[0];
  }

  async update(id: string, input: UpdateCampaignInput): Promise<CampaignRow | null> {
    const fields: Record<string, unknown> = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.campaignType !== undefined) fields.campaign_type = input.campaignType;
    if (input.targetImpressions !== undefined) fields.target_impressions = input.targetImpressions;
    if (input.targetCriteria !== undefined) fields.target_criteria = JSON.stringify(input.targetCriteria);
    if (input.budgetCents !== undefined) fields.budget_cents = input.budgetCents;
    if (input.targetCpmCents !== undefined) fields.target_cpm_cents = input.targetCpmCents;
    if (input.status !== undefined) fields.status = input.status;
    if (input.startDate !== undefined) fields.start_date = input.startDate;
    if (input.endDate !== undefined) fields.end_date = input.endDate;

    if (Object.keys(fields).length === 0) return this.findById(id);

    const { setClauses, values } = this.buildUpdateSet(fields);
    values.push(id);

    const result = await query<CampaignRow>(
      `UPDATE campaigns SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async findByIdWithDetails(id: string): Promise<CampaignWithDetails | null> {
    const result = await query<CampaignWithDetails>(
      `SELECT c.*,
        a.name AS advertiser_name,
        (SELECT COUNT(*)::int FROM campaign_videos cv WHERE cv.campaign_id = c.id) AS videos_count,
        (SELECT COUNT(*)::int FROM campaign_sites cs WHERE cs.campaign_id = c.id AND cs.deployment_status != 'removed') AS sites_count,
        COALESCE((SELECT COUNT(*) FROM video_plays vp WHERE vp.campaign_id = c.id), 0)::int AS total_impressions,
        CASE
          WHEN c.target_impressions > 0
          THEN ROUND((COALESCE((SELECT COUNT(*) FROM video_plays vp WHERE vp.campaign_id = c.id), 0)::numeric / c.target_impressions) * 100, 1)
          ELSE NULL
        END AS progress_percent
      FROM campaigns c
      JOIN advertisers a ON a.id = c.advertiser_id
      WHERE c.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async listByAdvertiser(advertiserId: string): Promise<CampaignWithDetails[]> {
    const result = await query<CampaignWithDetails>(
      `SELECT c.*,
        a.name AS advertiser_name,
        (SELECT COUNT(*)::int FROM campaign_videos cv WHERE cv.campaign_id = c.id) AS videos_count,
        (SELECT COUNT(*)::int FROM campaign_sites cs WHERE cs.campaign_id = c.id AND cs.deployment_status != 'removed') AS sites_count,
        COALESCE((SELECT COUNT(*) FROM video_plays vp WHERE vp.campaign_id = c.id), 0)::int AS total_impressions,
        CASE
          WHEN c.target_impressions > 0
          THEN ROUND((COALESCE((SELECT COUNT(*) FROM video_plays vp WHERE vp.campaign_id = c.id), 0)::numeric / c.target_impressions) * 100, 1)
          ELSE NULL
        END AS progress_percent
      FROM campaigns c
      JOIN advertisers a ON a.id = c.advertiser_id
      WHERE c.advertiser_id = $1
      ORDER BY c.created_at DESC`,
      [advertiserId]
    );
    return result.rows;
  }

  async listAll(filters?: { status?: string; advertiserId?: string }): Promise<CampaignWithDetails[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      conditions.push(`c.status = $${paramIndex++}`);
      params.push(filters.status);
    }
    if (filters?.advertiserId) {
      conditions.push(`c.advertiser_id = $${paramIndex++}`);
      params.push(filters.advertiserId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query<CampaignWithDetails>(
      `SELECT c.*,
        a.name AS advertiser_name,
        (SELECT COUNT(*)::int FROM campaign_videos cv WHERE cv.campaign_id = c.id) AS videos_count,
        (SELECT COUNT(*)::int FROM campaign_sites cs WHERE cs.campaign_id = c.id AND cs.deployment_status != 'removed') AS sites_count,
        COALESCE((SELECT COUNT(*) FROM video_plays vp WHERE vp.campaign_id = c.id), 0)::int AS total_impressions,
        CASE
          WHEN c.target_impressions > 0
          THEN ROUND((COALESCE((SELECT COUNT(*) FROM video_plays vp WHERE vp.campaign_id = c.id), 0)::numeric / c.target_impressions) * 100, 1)
          ELSE NULL
        END AS progress_percent
      FROM campaigns c
      JOIN advertisers a ON a.id = c.advertiser_id
      ${whereClause}
      ORDER BY c.created_at DESC`,
      params
    );
    return result.rows;
  }

  // ========================================================================
  // Campaign Videos
  // ========================================================================

  async addVideo(campaignId: string, videoId: string, weight = 1): Promise<CampaignVideoRow> {
    await query(
      `INSERT INTO campaign_videos (campaign_id, video_id, weight)
      VALUES ($1, $2, $3)
      ON CONFLICT (campaign_id, video_id) DO UPDATE SET weight = EXCLUDED.weight`,
      [campaignId, videoId, weight]
    );
    return this.getVideo(campaignId, videoId) as Promise<CampaignVideoRow>;
  }

  private async getVideo(campaignId: string, videoId: string): Promise<CampaignVideoRow | null> {
    const result = await query<CampaignVideoRow>(
      `SELECT cv.*, v.filename, v.original_name, v.duration, v.file_size
      FROM campaign_videos cv
      JOIN videos v ON v.id = cv.video_id
      WHERE cv.campaign_id = $1 AND cv.video_id = $2`,
      [campaignId, videoId]
    );
    return result.rows[0] || null;
  }

  async removeVideo(campaignId: string, videoId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM campaign_videos WHERE campaign_id = $1 AND video_id = $2`,
      [campaignId, videoId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async listVideos(campaignId: string): Promise<CampaignVideoRow[]> {
    const result = await query<CampaignVideoRow>(
      `SELECT cv.*, v.filename, v.original_name, v.duration, v.file_size
      FROM campaign_videos cv
      JOIN videos v ON v.id = cv.video_id
      WHERE cv.campaign_id = $1
      ORDER BY cv.added_at ASC`,
      [campaignId]
    );
    return result.rows;
  }

  // ========================================================================
  // Campaign Sites
  // ========================================================================

  async addSite(campaignId: string, siteId: string): Promise<CampaignSiteRow> {
    await query(
      `INSERT INTO campaign_sites (campaign_id, site_id) VALUES ($1, $2)
      ON CONFLICT (campaign_id, site_id) DO UPDATE SET deployment_status = 'pending'`,
      [campaignId, siteId]
    );
    const result = await query<CampaignSiteRow>(
      `SELECT cs.*, s.site_name, s.club_name, s.status
      FROM campaign_sites cs
      JOIN sites s ON s.id = cs.site_id
      WHERE cs.campaign_id = $1 AND cs.site_id = $2`,
      [campaignId, siteId]
    );
    return result.rows[0];
  }

  async removeSite(campaignId: string, siteId: string): Promise<boolean> {
    const result = await query(
      `UPDATE campaign_sites SET deployment_status = 'removed'
      WHERE campaign_id = $1 AND site_id = $2`,
      [campaignId, siteId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async listSites(campaignId: string): Promise<CampaignSiteRow[]> {
    const result = await query<CampaignSiteRow>(
      `SELECT cs.*, s.site_name, s.club_name, s.status
      FROM campaign_sites cs
      JOIN sites s ON s.id = cs.site_id
      WHERE cs.campaign_id = $1 AND cs.deployment_status != 'removed'
      ORDER BY s.club_name ASC`,
      [campaignId]
    );
    return result.rows;
  }

  async updateSiteDeploymentStatus(
    campaignId: string,
    siteId: string,
    status: string
  ): Promise<void> {
    await query(
      `UPDATE campaign_sites
      SET deployment_status = $3, deployed_at = CASE WHEN $3 = 'deployed' THEN NOW() ELSE deployed_at END
      WHERE campaign_id = $1 AND site_id = $2`,
      [campaignId, siteId, status]
    );
  }

  // ========================================================================
  // Target Criteria Resolution
  // ========================================================================

  async resolveSitesByCriteria(criteria: TargetCriteria): Promise<ResolvedSiteRow[]> {
    const conditions: string[] = [`s.status != 'maintenance'`];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (criteria.sports && criteria.sports.length > 0) {
      // sites.sports is JSONB array — match any sport
      conditions.push(`s.sports ?| $${paramIndex++}`);
      params.push(criteria.sports);
    }

    if (criteria.regions && criteria.regions.length > 0) {
      conditions.push(`s.location->>'region' = ANY($${paramIndex++})`);
      params.push(criteria.regions);
    }

    if (criteria.group_ids && criteria.group_ids.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM site_groups sg WHERE sg.site_id = s.id AND sg.group_id = ANY($${paramIndex++})
      )`);
      params.push(criteria.group_ids);
    }

    const result = await query<ResolvedSiteRow>(
      `SELECT s.id, s.site_name, s.club_name, s.sports, s.location, s.status
      FROM sites s
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.club_name ASC`,
      params
    );
    return result.rows;
  }

  async resolveAndPopulateSites(campaignId: string, criteria: TargetCriteria): Promise<CampaignSiteRow[]> {
    const sites = await this.resolveSitesByCriteria(criteria);

    if (sites.length > 0) {
      const values = sites.map((_, i) => `($1, $${i + 2})`).join(', ');
      const params: unknown[] = [campaignId, ...sites.map(s => s.id)];

      await query(
        `INSERT INTO campaign_sites (campaign_id, site_id)
        VALUES ${values}
        ON CONFLICT (campaign_id, site_id) DO UPDATE SET deployment_status = 'pending'`,
        params
      );
    }

    return this.listSites(campaignId);
  }

  // ========================================================================
  // Stats
  // ========================================================================

  async getStats(campaignId: string): Promise<CampaignStatsRow | null> {
    const result = await query<CampaignStatsRow>(
      `SELECT * FROM campaign_stats_live WHERE campaign_id = $1`,
      [campaignId]
    );
    return result.rows[0] || null;
  }

  async getStatsByAdvertiser(advertiserId: string): Promise<CampaignStatsRow[]> {
    const result = await query<CampaignStatsRow>(
      `SELECT * FROM campaign_stats_live WHERE advertiser_id = $1 ORDER BY start_date DESC NULLS LAST`,
      [advertiserId]
    );
    return result.rows;
  }

  async getImpressionsByDay(campaignId: string, from?: string, to?: string): Promise<{ date: string; impressions: number }[]> {
    const conditions = ['vp.campaign_id = $1'];
    const params: unknown[] = [campaignId];
    let paramIndex = 2;

    if (from) {
      conditions.push(`vp.played_at >= $${paramIndex++}::date`);
      params.push(from);
    }
    if (to) {
      conditions.push(`vp.played_at < ($${paramIndex++}::date + INTERVAL '1 day')`);
      params.push(to);
    }

    const result = await query<{ date: string; impressions: string }>(
      `SELECT DATE(vp.played_at) AS date, COUNT(*)::text AS impressions
      FROM video_plays vp
      WHERE ${conditions.join(' AND ')}
        AND vp.category IN ${ALL_SPONSOR_CATEGORIES}
      GROUP BY DATE(vp.played_at)
      ORDER BY date ASC`,
      params
    );

    return result.rows.map(r => ({
      date: r.date,
      impressions: parseInt(r.impressions, 10),
    }));
  }
}

export const campaignRepository = new CampaignRepository();
