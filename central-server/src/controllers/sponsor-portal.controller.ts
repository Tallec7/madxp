import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest, Sponsor } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';

// ============================================================================
// SPONSOR PORTAL CONTROLLER
// Endpoints accessibles par les utilisateurs avec rôle 'sponsor'
// Limités à leurs propres données
// ============================================================================

interface SponsorDashboardStats {
  [key: string]: unknown;
  total_videos: number;
  total_sites: number;
  total_impressions_30d: number;
  total_screen_time_30d: number;
  avg_completion_rate: number;
}

interface SponsorSiteRow {
  [key: string]: unknown;
  site_id: string;
  site_name: string;
  club_name: string;
  location: Record<string, unknown>;
  status: string;
  impressions_30d: number;
  screen_time_30d: number;
  contract_start: Date | null;
  contract_end: Date | null;
}

interface SponsorVideoRow {
  [key: string]: unknown;
  video_id: string;
  filename: string;
  duration: number;
  thumbnail_url: string | null;
  impressions_30d: number;
  completion_rate: number;
}

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * GET /api/sponsor/dashboard
 * Dashboard du sponsor connecté avec ses stats
 */
export const getSponsorDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sponsorId = req.user?.sponsor_id;

    if (!sponsorId) {
      res.status(403).json({
        success: false,
        error: 'Accès réservé aux sponsors',
      });
      return;
    }

    // Récupérer les infos du sponsor
    const sponsorResult = await query<Sponsor>(
      `SELECT id, name, logo_url, contact_email, status, created_at
       FROM sponsors WHERE id = $1`,
      [sponsorId]
    );

    if (sponsorResult.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Sponsor non trouvé',
      });
      return;
    }

    const sponsor = sponsorResult.rows[0];

    // Stats globales 30 jours
    const statsResult = await query<SponsorDashboardStats>(
      `SELECT
        COUNT(DISTINCT sv.video_id) as total_videos,
        COUNT(DISTINCT ss.site_id) as total_sites,
        COALESCE(SUM(sds.total_impressions), 0) as total_impressions_30d,
        COALESCE(SUM(sds.total_duration_seconds), 0) as total_screen_time_30d,
        ROUND(AVG(sds.completion_rate)::numeric, 1) as avg_completion_rate
       FROM sponsors sp
       LEFT JOIN sponsor_videos sv ON sv.sponsor_id = sp.id
       LEFT JOIN sponsor_sites ss ON ss.sponsor_id = sp.id AND ss.is_active = true
       LEFT JOIN sponsor_daily_stats sds ON sds.video_id = sv.video_id
         AND sds.date >= CURRENT_DATE - INTERVAL '30 days'
       WHERE sp.id = $1
       GROUP BY sp.id`,
      [sponsorId]
    );

    const stats = statsResult.rows[0] || {
      total_videos: 0,
      total_sites: 0,
      total_impressions_30d: 0,
      total_screen_time_30d: 0,
      avg_completion_rate: 0,
    };

    // Tendance des 7 derniers jours
    const trendsResult = await query(
      `SELECT
        DATE(sds.date) as date,
        SUM(sds.total_impressions) as impressions,
        SUM(sds.total_duration_seconds) as screen_time
       FROM sponsor_daily_stats sds
       JOIN sponsor_videos sv ON sv.video_id = sds.video_id
       WHERE sv.sponsor_id = $1
         AND sds.date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE(sds.date)
       ORDER BY date ASC`,
      [sponsorId]
    );

    res.json({
      success: true,
      data: {
        sponsor: {
          id: sponsor.id,
          name: sponsor.name,
          logo_url: sponsor.logo_url,
          status: sponsor.status,
        },
        stats: {
          total_videos: parseInt(String(stats.total_videos)) || 0,
          total_sites: parseInt(String(stats.total_sites)) || 0,
          total_impressions_30d: parseInt(String(stats.total_impressions_30d)) || 0,
          total_screen_time_30d: parseInt(String(stats.total_screen_time_30d)) || 0,
          avg_completion_rate: parseFloat(String(stats.avg_completion_rate)) || 0,
        },
        trends: trendsResult.rows.map(r => ({
          date: r.date,
          impressions: parseInt(String(r.impressions)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching sponsor dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du dashboard',
    });
  }
};

// ============================================================================
// SITES
// ============================================================================

/**
 * GET /api/sponsor/sites
 * Liste des sites où le sponsor est diffusé
 */
export const getSponsorSites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sponsorId = req.user?.sponsor_id;

    if (!sponsorId) {
      res.status(403).json({
        success: false,
        error: 'Accès réservé aux sponsors',
      });
      return;
    }

    const result = await query<SponsorSiteRow>(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        s.location,
        s.status,
        ss.contract_start,
        ss.contract_end,
        COALESCE(stats.impressions, 0) as impressions_30d,
        COALESCE(stats.screen_time, 0) as screen_time_30d
       FROM sponsor_sites ss
       JOIN sites s ON s.id = ss.site_id
       LEFT JOIN (
         SELECT
           sds.site_id,
           SUM(sds.total_impressions) as impressions,
           SUM(sds.total_duration_seconds) as screen_time
         FROM sponsor_daily_stats sds
         JOIN sponsor_videos sv ON sv.video_id = sds.video_id
         WHERE sv.sponsor_id = $1
           AND sds.date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY sds.site_id
       ) stats ON stats.site_id = s.id
       WHERE ss.sponsor_id = $1 AND ss.is_active = true
       ORDER BY stats.impressions DESC NULLS LAST`,
      [sponsorId]
    );

    res.json({
      success: true,
      data: {
        sites: result.rows.map(r => ({
          site_id: r.site_id,
          site_name: r.site_name,
          club_name: r.club_name,
          location: r.location,
          status: r.status,
          contract_start: r.contract_start,
          contract_end: r.contract_end,
          impressions_30d: parseInt(String(r.impressions_30d)) || 0,
          screen_time_30d: parseInt(String(r.screen_time_30d)) || 0,
        })),
        total: result.rowCount || 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching sponsor sites:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des sites',
    });
  }
};

// ============================================================================
// VIDEOS
// ============================================================================

/**
 * GET /api/sponsor/videos
 * Liste des vidéos du sponsor avec leurs stats
 */
export const getSponsorVideos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sponsorId = req.user?.sponsor_id;

    if (!sponsorId) {
      res.status(403).json({
        success: false,
        error: 'Accès réservé aux sponsors',
      });
      return;
    }

    const result = await query<SponsorVideoRow>(
      `SELECT
        v.id as video_id,
        v.filename,
        v.duration,
        v.thumbnail_url,
        COALESCE(stats.impressions, 0) as impressions_30d,
        COALESCE(stats.completion_rate, 0) as completion_rate
       FROM sponsor_videos sv
       JOIN videos v ON v.id = sv.video_id
       LEFT JOIN (
         SELECT
           video_id,
           SUM(total_impressions) as impressions,
           ROUND(AVG(completion_rate)::numeric, 1) as completion_rate
         FROM sponsor_daily_stats
         WHERE date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY video_id
       ) stats ON stats.video_id = v.id
       WHERE sv.sponsor_id = $1
       ORDER BY stats.impressions DESC NULLS LAST`,
      [sponsorId]
    );

    res.json({
      success: true,
      data: {
        videos: result.rows.map(r => ({
          video_id: r.video_id,
          filename: r.filename,
          duration: r.duration,
          thumbnail_url: r.thumbnail_url,
          impressions_30d: parseInt(String(r.impressions_30d)) || 0,
          completion_rate: parseFloat(String(r.completion_rate)) || 0,
        })),
        total: result.rowCount || 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching sponsor videos:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des vidéos',
    });
  }
};

// ============================================================================
// STATS DÉTAILLÉES
// ============================================================================

/**
 * GET /api/sponsor/stats
 * Stats détaillées pour la période donnée
 */
export const getSponsorDetailedStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sponsorId = req.user?.sponsor_id;
    const { from, to } = req.query;

    if (!sponsorId) {
      res.status(403).json({
        success: false,
        error: 'Accès réservé aux sponsors',
      });
      return;
    }

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Récupérer les vidéos du sponsor
    const videosResult = await query(
      `SELECT video_id FROM sponsor_videos WHERE sponsor_id = $1`,
      [sponsorId]
    );

    if (videosResult.rowCount === 0) {
      res.json({
        success: true,
        data: {
          period: { from: fromDate, to: toDate },
          summary: {
            total_impressions: 0,
            total_screen_time_seconds: 0,
            avg_daily_impressions: 0,
            completion_rate: 0,
            active_sites: 0,
          },
          by_video: [],
          by_site: [],
          trends: [],
        },
      });
      return;
    }

    const videoIds = videosResult.rows.map(r => r.video_id);

    // Summary
    const summaryResult = await query(
      `SELECT
        SUM(total_impressions) as total_impressions,
        SUM(total_duration_seconds) as total_screen_time,
        ROUND(AVG(completion_rate)::numeric, 1) as completion_rate,
        COUNT(DISTINCT site_id) as active_sites
       FROM sponsor_daily_stats
       WHERE video_id = ANY($1::uuid[])
         AND date >= $2::date
         AND date <= $3::date`,
      [videoIds, fromDate, toDate]
    );

    const summary = summaryResult.rows[0];
    const days = Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (24 * 60 * 60 * 1000)));

    // Par vidéo
    const byVideoResult = await query(
      `SELECT
        v.id as video_id,
        v.filename,
        SUM(sds.total_impressions) as impressions,
        SUM(sds.total_duration_seconds) as screen_time,
        ROUND(AVG(sds.completion_rate)::numeric, 1) as completion_rate
       FROM videos v
       JOIN sponsor_daily_stats sds ON sds.video_id = v.id
       WHERE v.id = ANY($1::uuid[])
         AND sds.date >= $2::date
         AND sds.date <= $3::date
       GROUP BY v.id, v.filename
       ORDER BY impressions DESC`,
      [videoIds, fromDate, toDate]
    );

    // Par site
    const bySiteResult = await query(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        SUM(sds.total_impressions) as impressions,
        SUM(sds.total_duration_seconds) as screen_time
       FROM sites s
       JOIN sponsor_daily_stats sds ON sds.site_id = s.id
       WHERE sds.video_id = ANY($1::uuid[])
         AND sds.date >= $2::date
         AND sds.date <= $3::date
       GROUP BY s.id, s.site_name, s.club_name
       ORDER BY impressions DESC
       LIMIT 20`,
      [videoIds, fromDate, toDate]
    );

    // Tendances quotidiennes
    const trendsResult = await query(
      `SELECT
        DATE(date) as date,
        SUM(total_impressions) as impressions,
        SUM(total_duration_seconds) as screen_time
       FROM sponsor_daily_stats
       WHERE video_id = ANY($1::uuid[])
         AND date >= $2::date
         AND date <= $3::date
       GROUP BY DATE(date)
       ORDER BY date ASC`,
      [videoIds, fromDate, toDate]
    );

    res.json({
      success: true,
      data: {
        period: { from: fromDate, to: toDate },
        summary: {
          total_impressions: parseInt(String(summary.total_impressions)) || 0,
          total_screen_time_seconds: parseInt(String(summary.total_screen_time)) || 0,
          avg_daily_impressions: Math.round((parseInt(String(summary.total_impressions)) || 0) / days),
          completion_rate: parseFloat(String(summary.completion_rate)) || 0,
          active_sites: parseInt(String(summary.active_sites)) || 0,
        },
        by_video: byVideoResult.rows.map(r => ({
          video_id: r.video_id,
          filename: r.filename,
          impressions: parseInt(String(r.impressions)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
          completion_rate: parseFloat(String(r.completion_rate)) || 0,
        })),
        by_site: bySiteResult.rows.map(r => ({
          site_id: r.site_id,
          site_name: r.site_name,
          club_name: r.club_name,
          impressions: parseInt(String(r.impressions)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
        })),
        trends: trendsResult.rows.map(r => ({
          date: r.date,
          impressions: parseInt(String(r.impressions)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching sponsor detailed stats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des statistiques',
    });
  }
};
