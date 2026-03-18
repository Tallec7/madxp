import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { uploadAsset, deleteVideo } from '../services/storage.service';
import { cleanupTempFile } from '../middleware/upload';
import { advertiserRepository, campaignRepository } from '../repositories';
import { advertiserPortalRepository } from '../repositories/advertiser-portal.repository';

// ============================================================================
// ADVERTISER PORTAL CONTROLLER
// Endpoints accessibles par les utilisateurs avec rôle 'advertiser'
// Limités à leurs propres données
// ============================================================================

/**
 * Calcule le checksum SHA256 d'un fichier en streaming (sans le charger en mémoire)
 */
function calculateChecksumFromDisk(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
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
    const advertiser = await advertiserRepository.findByIdFull(advertiserId);

    if (!advertiser) {
      res.status(404).json({
        success: false,
        error: 'Annonceur non trouvé',
      });
      return;
    }

    // Stats globales 30 jours
    const stats = await advertiserPortalRepository.getDashboardStats(advertiserId);

    const statsData = stats || {
      total_videos: '0',
      total_sites: '0',
      total_impressions_30d: '0',
      total_screen_time_30d: '0',
      avg_completion_rate: '0',
    };

    // Tendance des 7 derniers jours
    const trends = await advertiserPortalRepository.getDashboardTrends(advertiserId);

    // Calcul du reach (audience exposée aux vidéos de l'annonceur)
    // On croise les impressions avec les sessions de match qui ont un audience_estimate
    const reachStats = await advertiserPortalRepository.getDashboardReach(advertiserId);

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
          total_videos: parseInt(String(statsData.total_videos)) || 0,
          total_sites: parseInt(String(statsData.total_sites)) || 0,
          total_impressions_30d: parseInt(String(statsData.total_impressions_30d)) || 0,
          total_screen_time_30d: parseInt(String(statsData.total_screen_time_30d)) || 0,
          avg_completion_rate: parseFloat(String(statsData.avg_completion_rate)) || 0,
          // Nouvelles métriques reach
          total_reach_30d: parseInt(String(reachStats?.total_reach)) || 0,
          matches_with_ads_30d: parseInt(String(reachStats?.matches_with_ads)) || 0,
          avg_audience_per_match: parseInt(String(reachStats?.avg_audience_per_match)) || 0,
        },
        trends: trends.map(r => ({
          date: r.date,
          impressions: parseInt(String(r.impressions)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
        })),
      },
    });
  } catch (error: unknown) {
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

    const result = await advertiserPortalRepository.getPortalSites(advertiserId, contractFilter);

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
  } catch (error: unknown) {
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

    const result = await advertiserPortalRepository.getPortalVideos(advertiserId);

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
  } catch (error: unknown) {
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
    const videoIds = await advertiserRepository.getVideoIds(advertiserId);

    if (videoIds.length === 0) {
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

    // Summary
    const summary = await advertiserPortalRepository.getDailyStatsSummary(videoIds, fromDate, toDate);

    const days = Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (24 * 60 * 60 * 1000)));

    // Par vidéo
    const byVideoRows = await advertiserPortalRepository.getDailyStatsByVideo(videoIds, fromDate, toDate);

    // Par site
    const bySiteRows = await advertiserPortalRepository.getDailyStatsBySite(videoIds, fromDate, toDate);

    // Tendances quotidiennes
    const trendRows = await advertiserPortalRepository.getDailyStatsTrends(videoIds, fromDate, toDate);

    res.json({
      success: true,
      data: {
        period: { from: fromDate, to: toDate },
        summary: {
          total_impressions: parseInt(String(summary?.total_impressions)) || 0,
          total_screen_time_seconds: parseInt(String(summary?.total_screen_time)) || 0,
          avg_daily_impressions: Math.round((parseInt(String(summary?.total_impressions)) || 0) / days),
          completion_rate: parseFloat(String(summary?.completion_rate)) || 0,
          active_sites: parseInt(String(summary?.active_sites)) || 0,
        },
        by_video: byVideoRows.map(r => ({
          video_id: r.video_id,
          filename: r.filename,
          impressions: parseInt(String(r.impressions)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
          completion_rate: parseFloat(String(r.completion_rate)) || 0,
        })),
        by_site: bySiteRows.map(r => ({
          site_id: r.site_id,
          site_name: r.site_name,
          club_name: r.club_name,
          impressions: parseInt(String(r.impressions)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
        })),
        trends: trendRows.map(r => ({
          date: r.date,
          impressions: parseInt(String(r.impressions)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
        })),
      },
    });
  } catch (error: unknown) {
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

// Upload/delete are provided by storage.service.ts (uploadAsset, deleteVideo)

/**
 * POST /api/advertiser/videos
 * Upload d'une vidéo par l'annonceur
 */
export const uploadAdvertiserVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = req.file;
  const tempFilePath = file?.path;

  try {
    const advertiserId = req.user?.advertiser_id;

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
    const advertiser = await advertiserRepository.findByIdFull(advertiserId);

    if (!advertiser) {
      res.status(404).json({ success: false, error: 'Annonceur non trouvé' });
      return;
    }

    if (advertiser.status !== 'active') {
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

    // Calculer le checksum en streaming depuis le disque
    const checksum = tempFilePath
      ? await calculateChecksumFromDisk(tempFilePath)
      : crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Vérifier si une vidéo avec le même checksum existe déjà pour cet annonceur
    const existingVideo = await advertiserPortalRepository.findDuplicateVideo(checksum, advertiserId);

    if (existingVideo) {
      res.status(409).json({
        success: false,
        error: 'Cette vidéo existe déjà dans votre bibliothèque',
        existing_video: existingVideo,
      });
      return;
    }

    // Upload vers le stockage en streaming depuis le disque
    const uploadResult = tempFilePath
      ? await uploadAsset(await readFile(tempFilePath), filename, mime_type)
      : await uploadAsset(file.buffer, filename, mime_type);

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
    const video = await advertiserPortalRepository.insertVideo(
      filename,
      original_name,
      category || 'sponsor',
      file_size,
      mime_type,
      uploadResult.path,
      checksum,
      JSON.stringify({ title: videoTitle, uploaded_by_advertiser: advertiserId }),
      req.user?.id || null,
    );

    // Associer la vidéo à l'annonceur
    await advertiserPortalRepository.linkVideoToAdvertiser(advertiserId, video.id);

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
  } catch (error: unknown) {
    logger.error('Error uploading advertiser video:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'upload de la vidéo',
    });
  } finally {
    // Nettoyer le fichier temporaire
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
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
    const video = await advertiserPortalRepository.findVideoByOwner(videoId, advertiserId);

    if (!video) {
      res.status(404).json({
        success: false,
        error: 'Vidéo non trouvée ou vous n\'êtes pas autorisé à la supprimer',
      });
      return;
    }

    // Vérifier si la vidéo est déployée quelque part
    const activeDeployments = await advertiserPortalRepository.countActiveDeployments(videoId);

    if (activeDeployments > 0) {
      res.status(409).json({
        success: false,
        error: 'Cette vidéo est en cours de déploiement. Annulez d\'abord les déploiements.',
      });
      return;
    }

    // Supprimer du stockage FTP
    try {
      const storagePath = String(video.storage_path || video.filename);
      await deleteVideo(storagePath);
    } catch (storageError: unknown) {
      logger.warn('Error deleting video from storage (continuing with DB deletion):', storageError);
    }

    // Supprimer de la base (cascade supprimera advertiser_videos)
    await advertiserPortalRepository.deleteVideo(videoId);

    logger.info('Advertiser video deleted', {
      videoId,
      advertiserId,
      deletedBy: req.user?.email,
    });

    res.json({
      success: true,
      message: 'Vidéo supprimée avec succès',
    });
  } catch (error: unknown) {
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
    const videoCheck = await advertiserPortalRepository.findVideoByOwner(videoId, advertiserId);

    if (!videoCheck) {
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
      const currentMetadata = videoCheck.metadata || {};
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

    const result = await advertiserPortalRepository.updateVideo(videoId, updates, params);

    logger.info('Advertiser video updated', {
      videoId,
      advertiserId,
      updatedBy: req.user?.email,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
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
    const video = await advertiserPortalRepository.findVideoByOwner(videoId, advertiserId);

    if (!video) {
      res.status(404).json({
        success: false,
        error: 'Vidéo non trouvée',
      });
      return;
    }

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Stats globales
    const stats = await advertiserPortalRepository.getVideoStatsGlobal(videoId, fromDate, toDate);

    // Par site
    const bySiteRows = await advertiserPortalRepository.getVideoStatsBySite(videoId, fromDate, toDate);

    // Tendances
    const trendRows = await advertiserPortalRepository.getVideoStatsTrends(videoId, fromDate, toDate);

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
        by_site: bySiteRows,
        trends: trendRows,
      },
    });
  } catch (error: unknown) {
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

// ============================================================================
// CAMPAIGNS (ADR-035 Phase 3d)
// ============================================================================

/**
 * GET /api/advertiser/campaigns
 * List campaigns belonging to the authenticated advertiser, with stats
 */
export const getAdvertiserCampaigns = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertiserId = req.user?.advertiser_id;
    if (!advertiserId) {
      res.json({ success: true, data: { campaigns: [], total: 0 } });
      return;
    }

    const { status } = req.query;

    const [campaigns, allStats] = await Promise.all([
      campaignRepository.listByAdvertiser(advertiserId),
      campaignRepository.getStatsByAdvertiser(advertiserId),
    ]);

    // Merge stats into campaigns
    const statsMap = new Map(allStats.map(s => [s.campaign_id, s]));

    const filteredCampaigns = status && typeof status === 'string'
      ? campaigns.filter(c => c.status === status)
      : campaigns;

    const enriched = filteredCampaigns.map(campaign => {
      const stats = statsMap.get(campaign.id);
      return {
        ...campaign,
        total_impressions: parseInt(stats?.total_impressions || '0', 10),
        total_screen_time_seconds: parseInt(stats?.total_screen_time_seconds || '0', 10),
        avg_completion_rate: parseFloat(stats?.avg_completion_rate || '0'),
        active_sites: parseInt(stats?.active_sites || '0', 10),
        effective_cpm_cents: stats?.effective_cpm_cents ? parseFloat(stats.effective_cpm_cents) : null,
      };
    });

    res.json({ success: true, data: { campaigns: enriched, total: enriched.length } });
  } catch (error: unknown) {
    logger.error('Error listing advertiser campaigns:', error);
    res.status(500).json({ success: false, error: 'Failed to list campaigns' });
  }
};

/**
 * GET /api/advertiser/campaigns/:campaignId
 * Get a single campaign detail with stats, only if it belongs to the advertiser
 */
export const getAdvertiserCampaignDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertiserId = req.user?.advertiser_id;
    if (!advertiserId) {
      res.status(403).json({ success: false, error: 'No advertiser associated' });
      return;
    }

    const { campaignId } = req.params;
    const campaign = await campaignRepository.findByIdWithDetails(campaignId);

    if (!campaign || campaign.advertiser_id !== advertiserId) {
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }

    const [stats, dailyImpressions, videos, sites] = await Promise.all([
      campaignRepository.getStats(campaignId),
      campaignRepository.getImpressionsByDay(
        campaignId,
        typeof req.query.from === 'string' ? req.query.from : undefined,
        typeof req.query.to === 'string' ? req.query.to : undefined,
      ),
      campaignRepository.listVideos(campaignId),
      campaignRepository.listSites(campaignId),
    ]);

    res.json({
      success: true,
      data: {
        campaign,
        stats: stats ? {
          total_impressions: parseInt(stats.total_impressions || '0', 10),
          total_screen_time_seconds: parseInt(stats.total_screen_time_seconds || '0', 10),
          avg_completion_rate: parseFloat(stats.avg_completion_rate || '0'),
          active_sites: parseInt(stats.active_sites || '0', 10),
          unique_videos: parseInt(stats.unique_videos || '0', 10),
          effective_cpm_cents: stats.effective_cpm_cents ? parseFloat(stats.effective_cpm_cents) : null,
          progress_percent: stats.progress_percent ? parseFloat(stats.progress_percent) : null,
        } : null,
        daily_impressions: dailyImpressions,
        videos,
        sites,
      },
    });
  } catch (error: unknown) {
    logger.error('Error getting advertiser campaign detail:', error);
    res.status(500).json({ success: false, error: 'Failed to get campaign detail' });
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
