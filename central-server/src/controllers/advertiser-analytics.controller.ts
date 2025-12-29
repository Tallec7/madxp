import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../types';
import { SiteAuthRequest } from '../middleware/auth';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import { generateAdvertiserReport, generateClubReport } from '../services/pdf-report.service';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type QueryRow = Record<string, unknown>;

interface AdvertiserRow extends QueryRow {
  id: string;
  name: string;
  logo_url: string | null;
  contact_email: string | null;
  status: string;
}

interface AdvertiserVideoRow extends QueryRow {
  video_id: string;
  video_name: string;
  impressions: string;
  screen_time_seconds: string;
  completion_rate: string;
}

interface AdvertiserSiteRow extends QueryRow {
  site_id: string;
  site_name: string;
  club_name: string;
  impressions: string;
  screen_time_seconds: string;
}

interface ImpressionRow extends QueryRow {
  id: string;
  video_id: string;
  site_id: string;
  played_at: string;
  duration_played: number;
  completed: boolean;
  event_type: string | null;
  period: string | null;
}

interface DailyTrendRow extends QueryRow {
  date: string;
  impressions: string;
  screen_time: string;
}

// ============================================================================
// ADVERTISER CRUD
// ============================================================================

/**
 * GET /api/analytics/advertisers
 * Liste tous les annonceurs
 */
export const listAdvertisers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query<AdvertiserRow>(
      `SELECT id, name, logo_url, contact_email, contact_name, contact_phone, status, created_at
       FROM advertisers
       ORDER BY name ASC`
    );

    res.json({
      success: true,
      data: {
        advertisers: result.rows,
        total: result.rowCount || 0,
      },
    });
  } catch (error) {
    logger.error('Error listing advertisers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list advertisers',
    });
  }
};

/**
 * GET /api/analytics/advertisers/:id
 * Récupérer les détails d'un annonceur
 */
export const getAdvertiser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

    const result = await query<AdvertiserRow>(
      `SELECT id, name, logo_url, contact_email, contact_name, contact_phone, status, metadata, created_at, updated_at
       FROM advertisers
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Advertiser not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { advertiser: result.rows[0] },
    });
  } catch (error) {
    logger.error('Error getting advertiser:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get advertiser',
    });
  }
};

/**
 * POST /api/analytics/advertisers
 * Créer un nouvel annonceur
 */
export const createAdvertiser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, logo_url, contact_email, contact_name, contact_phone, metadata } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: 'Advertiser name is required',
      });
      return;
    }

    const result = await query<AdvertiserRow>(
      `INSERT INTO advertisers (name, logo_url, contact_email, contact_name, contact_phone, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, logo_url || null, contact_email || null, contact_name || null, contact_phone || null, metadata || {}]
    );

    res.status(201).json({
      success: true,
      data: { advertiser: result.rows[0] },
    });
  } catch (error) {
    logger.error('Error creating advertiser:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create advertiser',
    });
  }
};

/**
 * PUT /api/analytics/advertisers/:id
 * Mettre à jour un annonceur
 */
export const updateAdvertiser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, logo_url, contact_email, contact_name, contact_phone, status, metadata } = req.body;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

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
      [name, logo_url, contact_email, contact_name, contact_phone, status, metadata, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Advertiser not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { advertiser: result.rows[0] },
    });
  } catch (error) {
    logger.error('Error updating advertiser:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update advertiser',
    });
  }
};

/**
 * DELETE /api/analytics/advertisers/:id
 * Supprimer un annonceur
 */
export const deleteAdvertiser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

    const result = await query(`DELETE FROM advertisers WHERE id = $1`, [id]);

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Advertiser not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Advertiser deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting advertiser:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete advertiser',
    });
  }
};

// ============================================================================
// ADVERTISER-VIDEO ASSOCIATION
// ============================================================================

/**
 * POST /api/analytics/advertisers/:id/videos
 * Associer des vidéos à un annonceur
 */
export const addVideosToAdvertiser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { video_ids, is_primary = true } = req.body;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

    if (!Array.isArray(video_ids) || video_ids.length === 0) {
      res.status(400).json({
        success: false,
        error: 'video_ids must be a non-empty array',
      });
      return;
    }

    // Vérifier que l'annonceur existe
    const advertiserCheck = await query<AdvertiserRow>(`SELECT id FROM advertisers WHERE id = $1`, [id]);
    if (advertiserCheck.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Advertiser not found',
      });
      return;
    }

    // Insérer les associations
    const values = video_ids
      .map((vid, idx) => `($1, $${idx + 2}, $${video_ids.length + 2})`)
      .join(', ');
    const params = [id, ...video_ids, is_primary];

    await query(
      `INSERT INTO advertiser_videos (advertiser_id, video_id, is_primary)
       VALUES ${values}
       ON CONFLICT (advertiser_id, video_id) DO UPDATE
       SET is_primary = EXCLUDED.is_primary`,
      params
    );

    res.status(201).json({
      success: true,
      message: `${video_ids.length} video(s) associated with advertiser`,
    });
  } catch (error) {
    logger.error('Error adding videos to advertiser:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add videos to advertiser',
    });
  }
};

/**
 * DELETE /api/analytics/advertisers/:id/videos/:videoId
 * Dissocier une vidéo d'un annonceur
 */
export const removeVideoFromAdvertiser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, videoId } = req.params;

    if (!validateUuid(id) || !validateUuid(videoId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser or video ID',
      });
      return;
    }

    const result = await query(
      `DELETE FROM advertiser_videos WHERE advertiser_id = $1 AND video_id = $2`,
      [id, videoId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Association not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Video removed from advertiser',
    });
  } catch (error) {
    logger.error('Error removing video from advertiser:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove video from advertiser',
    });
  }
};

/**
 * GET /api/analytics/advertisers/:id/videos
 * Récupérer les vidéos associées à un annonceur
 */
export const getAdvertiserVideos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

    const result = await query(
      `SELECT
        av.video_id,
        av.is_primary,
        av.added_at,
        v.filename,
        v.duration,
        v.thumbnail_url,
        v.status
       FROM advertiser_videos av
       JOIN videos v ON v.id = av.video_id
       WHERE av.advertiser_id = $1
       ORDER BY av.added_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: { videos: result.rows },
    });
  } catch (error) {
    logger.error('Error getting advertiser videos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get advertiser videos',
    });
  }
};

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/advertisers/:id/stats
 * Récupérer les analytics d'un annonceur pour une période donnée
 */
export const getAdvertiserStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

    const advertiserResult = await query<{ name: string }>(
      'SELECT name FROM advertisers WHERE id = $1',
      [id]
    );
    const advertiserName = advertiserResult.rows[0]?.name || null;

    if (!advertiserName) {
      res.status(404).json({
        success: false,
        error: 'Advertiser not found',
      });
      return;
    }

    // Dates par défaut : 30 derniers jours
    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Récupérer les vidéos de l'annonceur
    const videosResult = await query(
      `SELECT video_id FROM advertiser_videos WHERE advertiser_id = $1`,
      [id]
    );

    if (videosResult.rowCount === 0) {
      res.json({
        success: true,
        data: {
          advertiser_name: advertiserName,
          period: `${fromDate}/${toDate}`,
          summary: {
            total_impressions: 0,
            total_screen_time_seconds: 0,
            avg_daily_impressions: 0,
            completion_rate: 0,
            estimated_reach: 0,
            active_sites: 0,
            active_days: 0,
          },
          by_video: [],
          by_site: [],
          by_period: {},
          by_event_type: {},
          trends: { daily: [], weekly: [] },
        },
      });
      return;
    }

    const videoIds = videosResult.rows.map(r => r.video_id);

    // Métriques globales
    const summaryResult = await query(
      `SELECT
        COUNT(*) as total_impressions,
        SUM(duration_played) as total_screen_time_seconds,
        ROUND(AVG(CASE WHEN completed THEN 100 ELSE (duration_played::float / NULLIF(video_duration, 0) * 100) END)::numeric, 1) as completion_rate,
        SUM(audience_estimate) as estimated_reach,
        COUNT(DISTINCT site_id) as active_sites,
        COUNT(DISTINCT DATE(played_at)) as active_days
       FROM advertiser_impressions
       WHERE video_id = ANY($1::uuid[])
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')`,
      [videoIds, fromDate, toDate]
    );

    const summary = summaryResult.rows[0];
    const totalImpressions = parseInt(summary.total_impressions as string) || 0;
    const totalScreenTime = parseInt(summary.total_screen_time_seconds as string) || 0;
    const avgDailyImpressions = totalImpressions / Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (24 * 60 * 60 * 1000)));

    // Par vidéo
    const byVideoResult = await query<AdvertiserVideoRow>(
      `SELECT
        v.id as video_id,
        v.filename as video_name,
        COUNT(*) as impressions,
        SUM(ai.duration_played) as screen_time_seconds,
        ROUND(AVG(CASE WHEN ai.completed THEN 100 ELSE (ai.duration_played::float / NULLIF(ai.video_duration, 0) * 100) END)::numeric, 1) as completion_rate
       FROM videos v
       JOIN advertiser_impressions ai ON ai.video_id = v.id
       WHERE v.id = ANY($1::uuid[])
         AND ai.played_at >= $2::date
         AND ai.played_at < ($3::date + INTERVAL '1 day')
       GROUP BY v.id, v.filename
       ORDER BY impressions DESC`,
      [videoIds, fromDate, toDate]
    );

    // Par site
    const bySiteResult = await query<AdvertiserSiteRow>(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        COUNT(*) as impressions,
        SUM(ai.duration_played) as screen_time_seconds
       FROM sites s
       JOIN advertiser_impressions ai ON ai.site_id = s.id
       WHERE ai.video_id = ANY($1::uuid[])
         AND ai.played_at >= $2::date
         AND ai.played_at < ($3::date + INTERVAL '1 day')
       GROUP BY s.id, s.site_name, s.club_name
       ORDER BY impressions DESC
       LIMIT 20`,
      [videoIds, fromDate, toDate]
    );

    // Par période
    const byPeriodResult = await query(
      `SELECT
        COALESCE(period, 'loop') as period,
        COUNT(*) as count
       FROM advertiser_impressions
       WHERE video_id = ANY($1::uuid[])
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY period`,
      [videoIds, fromDate, toDate]
    );

    const byPeriod = byPeriodResult.rows.reduce((acc, row) => {
      acc[row.period as string] = parseInt(row.count as string);
      return acc;
    }, {} as Record<string, number>);

    // Par type d'événement
    const byEventResult = await query(
      `SELECT
        COALESCE(event_type, 'other') as event_type,
        COUNT(*) as count
       FROM advertiser_impressions
       WHERE video_id = ANY($1::uuid[])
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY event_type`,
      [videoIds, fromDate, toDate]
    );

    const byEventType = byEventResult.rows.reduce((acc, row) => {
      acc[row.event_type as string] = parseInt(row.count as string);
      return acc;
    }, {} as Record<string, number>);

    // Tendances quotidiennes
    const dailyTrendsResult = await query<DailyTrendRow>(
      `SELECT
        DATE(played_at) as date,
        COUNT(*) as impressions,
        SUM(duration_played) as screen_time
       FROM advertiser_impressions
       WHERE video_id = ANY($1::uuid[])
         AND played_at >= $2::date
         AND played_at < ($3::date + INTERVAL '1 day')
       GROUP BY DATE(played_at)
       ORDER BY date ASC`,
      [videoIds, fromDate, toDate]
    );

    res.json({
      success: true,
      data: {
        advertiser_name: advertiserName,
        period: `${fromDate}/${toDate}`,
        summary: {
          total_impressions: totalImpressions,
          total_screen_time_seconds: totalScreenTime,
          total_screen_time: formatDuration(totalScreenTime),
          avg_daily_impressions: Math.round(avgDailyImpressions * 10) / 10,
          completion_rate: parseFloat(summary.completion_rate as string) || 0,
          estimated_reach: parseInt(summary.estimated_reach as string) || 0,
          active_sites: parseInt(summary.active_sites as string) || 0,
          active_days: parseInt(summary.active_days as string) || 0,
        },
        by_video: byVideoResult.rows.map(v => ({
          video_id: v.video_id,
          name: v.video_name,
          impressions: parseInt(v.impressions),
          screen_time_seconds: parseInt(v.screen_time_seconds),
          completion_rate: parseFloat(v.completion_rate) || 0,
        })),
        by_site: bySiteResult.rows.map(s => ({
          site_id: s.site_id,
          site_name: s.site_name,
          club_name: s.club_name,
          impressions: parseInt(s.impressions),
          screen_time_seconds: parseInt(s.screen_time_seconds),
        })),
        by_period: byPeriod,
        by_event_type: byEventType,
        trends: {
          daily: dailyTrendsResult.rows.map(d => ({
            date: d.date,
            impressions: parseInt(d.impressions),
            screen_time: parseInt(d.screen_time),
          })),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching advertiser stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch advertiser stats',
    });
  }
};

/**
 * POST /api/analytics/impressions
 * Recevoir un batch d'impressions depuis les boîtiers Raspberry (via sync-agent).
 *
 * Authentification: API key du site (Authorization: Bearer <site_api_key>)
 * Le siteId est extrait de l'authentification et utilisé pour toutes les impressions.
 *
 * Body: { impressions: AdvertiserImpression[] }
 */
export const recordImpressions = async (req: SiteAuthRequest, res: Response): Promise<void> => {
  try {
    const { impressions } = req.body;

    // Le siteId provient de l'authentification par API key
    const authenticatedSiteId = req.siteId;

    if (!authenticatedSiteId) {
      res.status(401).json({
        success: false,
        error: 'Site authentication required',
        message: 'Le site doit être authentifié par API key'
      });
      return;
    }

    if (!Array.isArray(impressions) || impressions.length === 0) {
      res.status(400).json({
        success: false,
        error: 'impressions must be a non-empty array',
      });
      return;
    }

    // Limite de batch pour éviter les abus
    const MAX_BATCH_SIZE = 500;
    if (impressions.length > MAX_BATCH_SIZE) {
      res.status(400).json({
        success: false,
        error: `Batch size exceeds limit of ${MAX_BATCH_SIZE} impressions`,
      });
      return;
    }

    // Valider et insérer en batch
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;
    let skippedCount = 0;

    for (const imp of impressions) {
      const {
        video_id,
        played_at,
        duration_played,
        video_duration,
        completed,
        interrupted_at,
        event_type,
        period,
        trigger_type,
        position_in_loop,
        audience_estimate,
      } = imp;

      // Validation basique - le site_id vient de l'auth, pas du body
      // video_id peut être absent si le Raspberry n'a pas le mapping (on utilise video_filename pour le résoudre plus tard)
      if (!played_at || duration_played == null || video_duration == null) {
        skippedCount++;
        continue; // Skip invalid records
      }

      // Si video_id est fourni, le valider
      if (video_id && !validateUuid(video_id)) {
        skippedCount++;
        continue;
      }

      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11})`
      );

      params.push(
        authenticatedSiteId,  // Utiliser le siteId authentifié, pas celui du body
        video_id || null,
        played_at,
        duration_played,
        video_duration,
        completed || false,
        interrupted_at || null,
        event_type || null,
        period || null,
        trigger_type || 'auto',
        position_in_loop || null,
        audience_estimate || null
      );

      paramIndex += 12;
    }

    if (values.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid impressions to insert',
        skipped: skippedCount
      });
      return;
    }

    await query(
      `INSERT INTO advertiser_impressions
       (site_id, video_id, played_at, duration_played, video_duration, completed, interrupted_at, event_type, period, trigger_type, position_in_loop, audience_estimate)
       VALUES ${values.join(', ')}`,
      params
    );

    logger.info('Advertiser impressions recorded', {
      siteId: authenticatedSiteId,
      siteName: req.siteName,
      recorded: values.length,
      skipped: skippedCount
    });

    res.status(201).json({
      success: true,
      message: `${values.length} impression(s) recorded`,
      recorded: values.length,
      skipped: skippedCount
    });
  } catch (error) {
    logger.error('Error recording impressions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record impressions',
    });
  }
};

/**
 * GET /api/analytics/advertisers/:id/export
 * Export CSV des données brutes
 */
export const exportAdvertiserData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { from, to, format = 'csv' } = req.query;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Récupérer les vidéos de l'annonceur
    const videosResult = await query(
      `SELECT video_id FROM advertiser_videos WHERE advertiser_id = $1`,
      [id]
    );

    if (videosResult.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'No videos found for this advertiser',
      });
      return;
    }

    const videoIds = videosResult.rows.map(r => r.video_id);

    // Récupérer les impressions
    const impressionsResult = await query<ImpressionRow>(
      `SELECT
        ai.id,
        ai.video_id,
        v.filename as video_name,
        ai.site_id,
        s.site_name,
        s.club_name,
        ai.played_at,
        ai.duration_played,
        ai.video_duration,
        ai.completed,
        ai.event_type,
        ai.period,
        ai.trigger_type,
        ai.audience_estimate
       FROM advertiser_impressions ai
       JOIN videos v ON v.id = ai.video_id
       JOIN sites s ON s.id = ai.site_id
       WHERE ai.video_id = ANY($1::uuid[])
         AND ai.played_at >= $2::date
         AND ai.played_at < ($3::date + INTERVAL '1 day')
       ORDER BY ai.played_at DESC`,
      [videoIds, fromDate, toDate]
    );

    if (format === 'csv') {
      // Générer CSV
      const headers = [
        'Date',
        'Video',
        'Site',
        'Club',
        'Duration (s)',
        'Completed',
        'Event Type',
        'Period',
        'Trigger',
        'Audience',
      ];

      const rows = impressionsResult.rows.map(row => [
        new Date(row.played_at).toISOString(),
        row.video_name,
        row.site_name,
        row.club_name,
        row.duration_played,
        row.completed ? 'Yes' : 'No',
        row.event_type || '',
        row.period || '',
        row.trigger_type || '',
        row.audience_estimate || '',
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=advertiser-${id}-${fromDate}-${toDate}.csv`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: impressionsResult.rows,
      });
    }
  } catch (error) {
    logger.error('Error exporting advertiser data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export advertiser data',
    });
  }
};

/**
 * POST /api/analytics/advertisers/calculate-daily-stats
 * Calculer les stats quotidiennes (cron job)
 */
export const calculateDailyStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date } = req.body;
    const targetDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await query<{ calculate_all_advertiser_daily_stats: number }>(
      `SELECT calculate_all_advertiser_daily_stats($1::date) as count`,
      [targetDate]
    );

    const count = result.rows[0]?.calculate_all_advertiser_daily_stats || 0;

    res.json({
      success: true,
      message: `Calculated stats for ${count} video/site combinations`,
      date: targetDate,
    });
  } catch (error) {
    logger.error('Error calculating daily stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate daily stats',
    });
  }
};

/**
 * GET /api/analytics/advertisers/:id/report/pdf
 * Générer un rapport PDF pour un annonceur
 */
export const generateAdvertiserPdfReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid advertiser ID',
      });
      return;
    }

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Générer le PDF
    const pdfBuffer = await generateAdvertiserReport(id, fromDate, toDate, { type: 'advertiser' });

    // Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=advertiser-report-${id}-${fromDate}-${toDate}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating advertiser PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF report',
    });
  }
};

/**
 * GET /api/analytics/clubs/:siteId/report/pdf
 * Générer un rapport PDF pour un club
 */
export const generateClubPdfReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId } = req.params;
    const { from, to } = req.query;

    if (!validateUuid(siteId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid site ID',
      });
      return;
    }

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Générer le PDF
    const pdfBuffer = await generateClubReport(siteId, fromDate, toDate, { type: 'club' });

    // Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=club-report-${siteId}-${fromDate}-${toDate}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating club PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF report',
    });
  }
};

// ============================================================================
// BACKWARD COMPATIBILITY - Alias for old 'sponsor' endpoints
// These will be removed after migration period
// ============================================================================

export const listSponsors = listAdvertisers;
export const getSponsor = getAdvertiser;
export const createSponsor = createAdvertiser;
export const updateSponsor = updateAdvertiser;
export const deleteSponsor = deleteAdvertiser;
export const addVideosToSponsor = addVideosToAdvertiser;
export const removeVideoFromSponsor = removeVideoFromAdvertiser;
export const getSponsorVideos = getAdvertiserVideos;
export const getSponsorStats = getAdvertiserStats;
export const exportSponsorData = exportAdvertiserData;
export const generateSponsorPdfReport = generateAdvertiserPdfReport;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}min`;
}
