import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest, Advertiser } from '../types';
import logger from '../config/logger';

// ============================================================================
// ADVERTISER PORTAL CONTROLLER
// Endpoints accessibles par les utilisateurs avec rôle 'advertiser'
// Limités à leurs propres données
// ============================================================================

interface AdvertiserDashboardStats {
  [key: string]: unknown;
  total_videos: number;
  total_sites: number;
  total_impressions_30d: number;
  total_screen_time_30d: number;
  avg_completion_rate: number;
}

interface AdvertiserSiteRow {
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

interface AdvertiserVideoRow {
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
 * GET /api/advertiser/dashboard
 * Dashboard de l'annonceur connecté avec ses stats
 */
export const getAdvertiserDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertiserId = req.user?.advertiser_id;

    // Si pas de advertiser_id, retourner données vides au lieu de 403
    if (!advertiserId) {
      res.json({
        success: true,
        data: {
          advertiser: null,
          stats: {
            total_videos: 0,
            total_sites: 0,
            total_impressions_30d: 0,
            total_screen_time_30d: 0,
            avg_completion_rate: 0,
          },
          trends: [],
          message: 'Aucun annonceur associé à votre compte. Contactez un administrateur.',
        },
      });
      return;
    }

    // Récupérer les infos de l'annonceur
    const advertiserResult = await query<Advertiser>(
      `SELECT id, name, logo_url, contact_email, status, created_at
       FROM advertisers WHERE id = $1`,
      [advertiserId]
    );

    if (advertiserResult.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Annonceur non trouvé',
      });
      return;
    }

    const advertiser = advertiserResult.rows[0];

    // Stats globales 30 jours
    const statsResult = await query<AdvertiserDashboardStats>(
      `SELECT
        COUNT(DISTINCT av.video_id) as total_videos,
        COUNT(DISTINCT ads.site_id) as total_sites,
        COALESCE(SUM(adst.total_impressions), 0) as total_impressions_30d,
        COALESCE(SUM(adst.total_duration_seconds), 0) as total_screen_time_30d,
        ROUND(AVG(adst.completion_rate)::numeric, 1) as avg_completion_rate
       FROM advertisers a
       LEFT JOIN advertiser_videos av ON av.advertiser_id = a.id
       LEFT JOIN advertiser_sites ads ON ads.advertiser_id = a.id AND ads.is_active = true
       LEFT JOIN advertiser_daily_stats adst ON adst.video_id = av.video_id
         AND adst.date >= CURRENT_DATE - INTERVAL '30 days'
       WHERE a.id = $1
       GROUP BY a.id`,
      [advertiserId]
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
        DATE(adst.date) as date,
        SUM(adst.total_impressions) as impressions,
        SUM(adst.total_duration_seconds) as screen_time
       FROM advertiser_daily_stats adst
       JOIN advertiser_videos av ON av.video_id = adst.video_id
       WHERE av.advertiser_id = $1
         AND adst.date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE(adst.date)
       ORDER BY date ASC`,
      [advertiserId]
    );

    res.json({
      success: true,
      data: {
        advertiser: {
          id: advertiser.id,
          name: advertiser.name,
          logo_url: advertiser.logo_url,
          status: advertiser.status,
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
    logger.error('Error fetching advertiser dashboard:', error);
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
 * GET /api/advertiser/sites
 * Liste des sites où l'annonceur est diffusé.
 *
 * Filtrage par contrat:
 * - Par défaut: uniquement les contrats actifs (is_active=true, dates valides)
 * - Query param ?include_expired=true: inclut aussi les contrats expirés
 * - Query param ?include_pending=true: inclut aussi les contrats futurs
 */
export const getAdvertiserSites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertiserId = req.user?.advertiser_id;
    const includeExpired = req.query.include_expired === 'true';
    const includePending = req.query.include_pending === 'true';

    // Si pas de advertiser_id, retourner données vides
    if (!advertiserId) {
      res.json({
        success: true,
        data: {
          sites: [],
          total: 0,
          message: 'Aucun annonceur associé à votre compte. Contactez un administrateur.',
        },
      });
      return;
    }

    // Construire la clause WHERE pour le filtrage des contrats
    let contractFilter = 'ads.is_active = true';

    if (!includeExpired && !includePending) {
      // Par défaut: uniquement les contrats actuellement valides
      contractFilter += `
        AND (ads.contract_start IS NULL OR ads.contract_start <= CURRENT_DATE)
        AND (ads.contract_end IS NULL OR ads.contract_end >= CURRENT_DATE)`;
    } else if (!includeExpired) {
      // Inclure pending mais pas expired
      contractFilter += `
        AND (ads.contract_end IS NULL OR ads.contract_end >= CURRENT_DATE)`;
    } else if (!includePending) {
      // Inclure expired mais pas pending
      contractFilter += `
        AND (ads.contract_start IS NULL OR ads.contract_start <= CURRENT_DATE)`;
    }
    // Si les deux sont true, on montre tout (is_active = true seulement)

    const result = await query<AdvertiserSiteRow & { contract_status: string; days_remaining: number | null }>(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        s.location,
        s.status,
        ads.contract_start,
        ads.contract_end,
        ads.is_active,
        -- Calcul du statut du contrat
        CASE
          WHEN NOT ads.is_active THEN 'inactive'
          WHEN ads.contract_start IS NOT NULL AND ads.contract_start > CURRENT_DATE THEN 'pending'
          WHEN ads.contract_end IS NOT NULL AND ads.contract_end < CURRENT_DATE THEN 'expired'
          ELSE 'active'
        END as contract_status,
        -- Jours restants avant expiration
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
         FROM advertiser_daily_stats adst
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

    // Compter les différents statuts
    const statusCounts = {
      active: 0,
      pending: 0,
      expired: 0,
      inactive: 0
    };
    result.rows.forEach(r => {
      const status = r.contract_status as keyof typeof statusCounts;
      if (status in statusCounts) {
        statusCounts[status]++;
      }
    });

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
          contract_status: r.contract_status,
          days_remaining: r.days_remaining,
          impressions_30d: parseInt(String(r.impressions_30d)) || 0,
          screen_time_30d: parseInt(String(r.screen_time_30d)) || 0,
        })),
        total: result.rowCount || 0,
        status_counts: statusCounts,
      },
    });
  } catch (error) {
    logger.error('Error fetching advertiser sites:', error);
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
 * GET /api/advertiser/videos
 * Liste des vidéos de l'annonceur avec leurs stats
 */
export const getAdvertiserVideos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertiserId = req.user?.advertiser_id;

    // Si pas de advertiser_id, retourner données vides
    if (!advertiserId) {
      res.json({
        success: true,
        data: {
          videos: [],
          total: 0,
          message: 'Aucun annonceur associé à votre compte. Contactez un administrateur.',
        },
      });
      return;
    }

    const result = await query<AdvertiserVideoRow>(
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
         FROM advertiser_daily_stats
         WHERE date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY video_id
       ) stats ON stats.video_id = v.id
       WHERE av.advertiser_id = $1
       ORDER BY stats.impressions DESC NULLS LAST`,
      [advertiserId]
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
    logger.error('Error fetching advertiser videos:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des vidéos',
    });
  }
};

// ============================================================================
// STATS DETAILLEES
// ============================================================================

/**
 * GET /api/advertiser/stats
 * Stats détaillées pour la période donnée
 */
export const getAdvertiserDetailedStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertiserId = req.user?.advertiser_id;
    const { from, to } = req.query;

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Si pas de advertiser_id, retourner données vides
    if (!advertiserId) {
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
          message: 'Aucun annonceur associé à votre compte. Contactez un administrateur.',
        },
      });
      return;
    }

    // Récupérer les vidéos de l'annonceur
    const videosResult = await query(
      `SELECT video_id FROM advertiser_videos WHERE advertiser_id = $1`,
      [advertiserId]
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
       FROM advertiser_daily_stats
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
        SUM(adst.total_impressions) as impressions,
        SUM(adst.total_duration_seconds) as screen_time,
        ROUND(AVG(adst.completion_rate)::numeric, 1) as completion_rate
       FROM videos v
       JOIN advertiser_daily_stats adst ON adst.video_id = v.id
       WHERE v.id = ANY($1::uuid[])
         AND adst.date >= $2::date
         AND adst.date <= $3::date
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
        SUM(adst.total_impressions) as impressions,
        SUM(adst.total_duration_seconds) as screen_time
       FROM sites s
       JOIN advertiser_daily_stats adst ON adst.site_id = s.id
       WHERE adst.video_id = ANY($1::uuid[])
         AND adst.date >= $2::date
         AND adst.date <= $3::date
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
       FROM advertiser_daily_stats
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
    logger.error('Error fetching advertiser detailed stats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des statistiques',
    });
  }
};

// ============================================================================
// BACKWARD COMPATIBILITY - Alias for old 'sponsor' endpoints
// These will be removed after migration period
// ============================================================================

export const getSponsorDashboard = getAdvertiserDashboard;
export const getSponsorSites = getAdvertiserSites;
export const getSponsorVideos = getAdvertiserVideos;
export const getSponsorDetailedStats = getAdvertiserDetailedStats;
