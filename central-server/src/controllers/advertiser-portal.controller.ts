import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest, Advertiser } from '../types';
import logger from '../config/logger';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { uploadFileToFtp, deleteFileFromFtp, isFtpConfigured, getFtpPublicUrl } from '../config/ftp-storage';
import { uploadFile, deleteFile } from '../config/supabase';

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

interface ReachStatsRow {
  [key: string]: unknown;
  total_reach: string;
  matches_with_ads: string;
  avg_audience_per_match: string;
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

    // Calcul du reach (audience exposée aux vidéos de l'annonceur)
    // On croise les impressions avec les sessions de match qui ont un audience_estimate
    const reachResult = await query(
      `SELECT
        COALESCE(SUM(DISTINCT cs.audience_estimate), 0) as total_reach,
        COUNT(DISTINCT cs.id) as matches_with_ads,
        ROUND(AVG(cs.audience_estimate)::numeric, 0) as avg_audience_per_match
       FROM advertiser_impressions ai
       JOIN advertiser_videos av ON av.video_id = ai.video_id
       JOIN club_sessions cs ON cs.site_id = ai.site_id
         AND ai.played_at >= cs.started_at
         AND (cs.ended_at IS NULL OR ai.played_at <= cs.ended_at)
         AND cs.audience_estimate IS NOT NULL
       WHERE av.advertiser_id = $1
         AND ai.played_at >= CURRENT_DATE - INTERVAL '30 days'`,
      [advertiserId]
    );

    const reachStats = reachResult.rows[0] as unknown as ReachStatsRow;

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
          // Nouvelles métriques reach
          total_reach_30d: parseInt(String(reachStats?.total_reach)) || 0,
          matches_with_ads_30d: parseInt(String(reachStats?.matches_with_ads)) || 0,
          avg_audience_per_match: parseInt(String(reachStats?.avg_audience_per_match)) || 0,
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
// VIDEO UPLOAD - Annonceurs peuvent uploader leurs propres créas
// ============================================================================

/**
 * Helper: Upload vers le stockage (FTP prioritaire, Supabase fallback)
 */
async function uploadVideoToStorage(
  fileBuffer: Buffer,
  filename: string,
  contentType: string
): Promise<{ path: string; url: string } | null> {
  // Essayer FTP en priorité si configuré
  if (isFtpConfigured()) {
    return uploadFileToFtp(fileBuffer, filename, contentType);
  }

  // Fallback Supabase
  return uploadFile(fileBuffer, filename, contentType);
}

/**
 * POST /api/advertiser/videos
 * Upload d'une vidéo par l'annonceur
 */
export const uploadAdvertiserVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertiserId = req.user?.advertiser_id;
    const file = req.file;

    if (!advertiserId) {
      res.status(403).json({
        success: false,
        error: 'Aucun annonceur associé à votre compte',
      });
      return;
    }

    if (!file) {
      res.status(400).json({
        success: false,
        error: 'Aucun fichier fourni',
      });
      return;
    }

    // Vérifier que l'annonceur existe et est actif
    const advertiserCheck = await query(
      'SELECT id, status FROM advertisers WHERE id = $1',
      [advertiserId]
    );

    if (advertiserCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Annonceur non trouvé' });
      return;
    }

    if (advertiserCheck.rows[0].status !== 'active') {
      res.status(403).json({
        success: false,
        error: 'Votre compte annonceur n\'est pas actif. Contactez un administrateur.',
      });
      return;
    }

    // Générer un nom de fichier unique
    const ext = file.originalname.split('.').pop() || 'mp4';
    const filename = `${uuidv4()}.${ext}`;
    const original_name = file.originalname;
    const file_size = file.size;
    const mime_type = file.mimetype;

    // Calculer le checksum
    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Vérifier si une vidéo avec le même checksum existe déjà pour cet annonceur
    const existingVideo = await query(
      `SELECT v.id, v.filename FROM videos v
       JOIN advertiser_videos av ON av.video_id = v.id
       WHERE v.checksum = $1 AND av.advertiser_id = $2`,
      [checksum, advertiserId]
    );

    if (existingVideo.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: 'Cette vidéo existe déjà dans votre bibliothèque',
        existing_video: existingVideo.rows[0],
      });
      return;
    }

    // Upload vers le stockage
    const uploadResult = await uploadVideoToStorage(file.buffer, filename, mime_type);

    if (!uploadResult) {
      logger.error('Failed to upload advertiser video to storage');
      res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'upload vers le stockage',
      });
      return;
    }

    // Extraire le titre depuis le body ou le nom de fichier
    const { title, category } = req.body;
    const videoTitle = title || original_name.replace(/\.[^/.]+$/, '');

    // Insérer la vidéo dans la base
    const videoResult = await query(
      `INSERT INTO videos
        (filename, original_name, category, subcategory, file_size, mime_type, storage_path, checksum, metadata, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        filename,
        original_name,
        category || 'sponsor',
        null,
        file_size,
        mime_type,
        uploadResult.path,
        checksum,
        JSON.stringify({ title: videoTitle, uploaded_by_advertiser: advertiserId }),
        req.user?.id || null,
      ]
    );

    const video = videoResult.rows[0];

    // Associer la vidéo à l'annonceur
    await query(
      `INSERT INTO advertiser_videos (advertiser_id, video_id, is_primary, added_at)
       VALUES ($1, $2, true, NOW())`,
      [advertiserId, video.id]
    );

    logger.info('Advertiser video uploaded', {
      videoId: video.id,
      advertiserId,
      filename,
      uploadedBy: req.user?.email,
    });

    res.status(201).json({
      success: true,
      data: {
        video_id: video.id,
        filename: video.filename,
        original_name: video.original_name,
        title: videoTitle,
        file_size: video.file_size,
        mime_type: video.mime_type,
        url: uploadResult.url,
        checksum: video.checksum,
        created_at: video.created_at,
      },
    });
  } catch (error) {
    logger.error('Error uploading advertiser video:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'upload de la vidéo',
    });
  }
};

/**
 * DELETE /api/advertiser/videos/:videoId
 * Suppression d'une vidéo par l'annonceur (uniquement ses propres vidéos)
 */
export const deleteAdvertiserVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertiserId = req.user?.advertiser_id;
    const { videoId } = req.params;

    if (!advertiserId) {
      res.status(403).json({
        success: false,
        error: 'Aucun annonceur associé à votre compte',
      });
      return;
    }

    // Vérifier que la vidéo appartient à l'annonceur
    const videoCheck = await query(
      `SELECT v.id, v.filename, v.storage_path
       FROM videos v
       JOIN advertiser_videos av ON av.video_id = v.id
       WHERE v.id = $1 AND av.advertiser_id = $2`,
      [videoId, advertiserId]
    );

    if (videoCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Vidéo non trouvée ou vous n\'êtes pas autorisé à la supprimer',
      });
      return;
    }

    const video = videoCheck.rows[0];

    // Vérifier si la vidéo est déployée quelque part
    const deploymentCheck = await query(
      `SELECT COUNT(*) as count FROM content_deployments
       WHERE video_id = $1 AND status IN ('pending', 'scheduled', 'in_progress')`,
      [videoId]
    );

    if (parseInt(String(deploymentCheck.rows[0].count)) > 0) {
      res.status(409).json({
        success: false,
        error: 'Cette vidéo est en cours de déploiement. Annulez d\'abord les déploiements.',
      });
      return;
    }

    // Supprimer du stockage
    try {
      const storagePath = String(video.storage_path || video.filename);
      if (isFtpConfigured()) {
        await deleteFileFromFtp(storagePath);
      } else {
        await deleteFile(storagePath);
      }
    } catch (storageError) {
      logger.warn('Error deleting video from storage (continuing with DB deletion):', storageError);
    }

    // Supprimer de la base (cascade supprimera advertiser_videos)
    await query('DELETE FROM videos WHERE id = $1', [videoId]);

    logger.info('Advertiser video deleted', {
      videoId,
      advertiserId,
      deletedBy: req.user?.email,
    });

    res.json({
      success: true,
      message: 'Vidéo supprimée avec succès',
    });
  } catch (error) {
    logger.error('Error deleting advertiser video:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression de la vidéo',
    });
  }
};

/**
 * PUT /api/advertiser/videos/:videoId
 * Mise à jour des métadonnées d'une vidéo
 */
export const updateAdvertiserVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertiserId = req.user?.advertiser_id;
    const { videoId } = req.params;
    const { title, category } = req.body;

    if (!advertiserId) {
      res.status(403).json({
        success: false,
        error: 'Aucun annonceur associé à votre compte',
      });
      return;
    }

    // Vérifier que la vidéo appartient à l'annonceur
    const videoCheck = await query(
      `SELECT v.id, v.metadata FROM videos v
       JOIN advertiser_videos av ON av.video_id = v.id
       WHERE v.id = $1 AND av.advertiser_id = $2`,
      [videoId, advertiserId]
    );

    if (videoCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Vidéo non trouvée ou vous n\'êtes pas autorisé à la modifier',
      });
      return;
    }

    // Construire la mise à jour
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      const currentMetadata = videoCheck.rows[0].metadata || {};
      const newMetadata = { ...currentMetadata, title };
      updates.push(`metadata = $${paramIndex++}`);
      params.push(JSON.stringify(newMetadata));
    }

    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      params.push(category);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'Aucun champ à mettre à jour' });
      return;
    }

    params.push(videoId);

    const result = await query(
      `UPDATE videos SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    logger.info('Advertiser video updated', {
      videoId,
      advertiserId,
      updatedBy: req.user?.email,
    });

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error updating advertiser video:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour de la vidéo',
    });
  }
};

/**
 * GET /api/advertiser/videos/:videoId/stats
 * Stats détaillées d'une vidéo spécifique
 */
export const getAdvertiserVideoStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertiserId = req.user?.advertiser_id;
    const { videoId } = req.params;
    const { from, to } = req.query;

    if (!advertiserId) {
      res.status(403).json({
        success: false,
        error: 'Aucun annonceur associé à votre compte',
      });
      return;
    }

    // Vérifier que la vidéo appartient à l'annonceur
    const videoCheck = await query(
      `SELECT v.id, v.filename, v.original_name, v.duration, v.thumbnail_url
       FROM videos v
       JOIN advertiser_videos av ON av.video_id = v.id
       WHERE v.id = $1 AND av.advertiser_id = $2`,
      [videoId, advertiserId]
    );

    if (videoCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Vidéo non trouvée',
      });
      return;
    }

    const video = videoCheck.rows[0];

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Stats globales
    const statsResult = await query(
      `SELECT
        SUM(total_impressions) as total_impressions,
        SUM(total_duration_seconds) as total_screen_time,
        ROUND(AVG(completion_rate)::numeric, 1) as avg_completion_rate,
        COUNT(DISTINCT site_id) as sites_count
       FROM advertiser_daily_stats
       WHERE video_id = $1
         AND date >= $2::date
         AND date <= $3::date`,
      [videoId, fromDate, toDate]
    );

    // Par site
    const bySiteResult = await query(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        SUM(adst.total_impressions) as impressions,
        SUM(adst.total_duration_seconds) as screen_time,
        ROUND(AVG(adst.completion_rate)::numeric, 1) as completion_rate
       FROM sites s
       JOIN advertiser_daily_stats adst ON adst.site_id = s.id
       WHERE adst.video_id = $1
         AND adst.date >= $2::date
         AND adst.date <= $3::date
       GROUP BY s.id, s.site_name, s.club_name
       ORDER BY impressions DESC`,
      [videoId, fromDate, toDate]
    );

    // Tendances
    const trendsResult = await query(
      `SELECT
        DATE(date) as date,
        SUM(total_impressions) as impressions,
        SUM(total_duration_seconds) as screen_time
       FROM advertiser_daily_stats
       WHERE video_id = $1
         AND date >= $2::date
         AND date <= $3::date
       GROUP BY DATE(date)
       ORDER BY date ASC`,
      [videoId, fromDate, toDate]
    );

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      data: {
        video: {
          id: video.id,
          filename: video.filename,
          original_name: video.original_name,
          duration: video.duration,
          thumbnail_url: video.thumbnail_url,
        },
        period: { from: fromDate, to: toDate },
        summary: {
          total_impressions: parseInt(String(stats?.total_impressions)) || 0,
          total_screen_time_seconds: parseInt(String(stats?.total_screen_time)) || 0,
          avg_completion_rate: parseFloat(String(stats?.avg_completion_rate)) || 0,
          sites_count: parseInt(String(stats?.sites_count)) || 0,
        },
        by_site: bySiteResult.rows,
        trends: trendsResult.rows,
      },
    });
  } catch (error) {
    logger.error('Error fetching advertiser video stats:', error);
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
