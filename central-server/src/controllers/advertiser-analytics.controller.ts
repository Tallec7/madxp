import { Response } from 'express';
import { AuthRequest } from '../types';
import { SiteAuthRequest } from '../middleware/auth';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import { generateAdvertiserReport, generateClubReport } from '../services/pdf-report.service';
import {
  advertiserRepository,
  type ImpressionBatchItem,
} from '../repositories';
import { siteSponsorRepository } from '../repositories/site-sponsor.repository';

// ============================================================================
// ADVERTISER CRUD
// ============================================================================

/**
 * GET /api/analytics/advertisers
 * Liste tous les annonceurs
 */
export const listAdvertisers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const advertisers = await advertiserRepository.listAll();

    res.json({
      success: true,
      data: {
        advertisers,
        total: advertisers.length,
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

    const advertiser = await advertiserRepository.findByIdFull(id);

    if (!advertiser) {
      res.status(404).json({
        success: false,
        error: 'Advertiser not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { advertiser },
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

    const advertiser = await advertiserRepository.create({
      name,
      logoUrl: logo_url || null,
      contactEmail: contact_email || null,
      contactName: contact_name || null,
      contactPhone: contact_phone || null,
      metadata: metadata || null,
    });

    res.status(201).json({
      success: true,
      data: { advertiser },
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

    const advertiser = await advertiserRepository.update(id, {
      name,
      logoUrl: logo_url,
      contactEmail: contact_email,
      contactName: contact_name,
      contactPhone: contact_phone,
      status,
      metadata,
    });

    if (!advertiser) {
      res.status(404).json({
        success: false,
        error: 'Advertiser not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { advertiser },
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

    const deleted = await advertiserRepository.delete(id);

    if (!deleted) {
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
    const exists = await advertiserRepository.exists(id);
    if (!exists) {
      res.status(404).json({
        success: false,
        error: 'Advertiser not found',
      });
      return;
    }

    // Insérer les associations
    await advertiserRepository.addVideos(id, video_ids as string[], is_primary as boolean);

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

    const removed = await advertiserRepository.removeVideo(id, videoId);

    if (!removed) {
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

    const videos = await advertiserRepository.getVideos(id);

    res.json({
      success: true,
      data: { videos },
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

    const advertiserName = await advertiserRepository.findName(id);

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
    const videoIds = await advertiserRepository.getVideoIds(id);

    if (videoIds.length === 0) {
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

    // Récupérer toutes les stats en parallèle
    const [summary, byVideoRows, bySiteRows, byPeriodRows, byEventRows, dailyTrendRows] = await Promise.all([
      advertiserRepository.getStatsSummary(videoIds, fromDate, toDate),
      advertiserRepository.getStatsByVideo(videoIds, fromDate, toDate),
      advertiserRepository.getStatsBySite(videoIds, fromDate, toDate),
      advertiserRepository.getStatsByPeriod(videoIds, fromDate, toDate),
      advertiserRepository.getStatsByEventType(videoIds, fromDate, toDate),
      advertiserRepository.getDailyTrends(videoIds, fromDate, toDate),
    ]);

    const totalImpressions = parseInt(summary.total_impressions) || 0;
    const totalScreenTime = parseInt(summary.total_screen_time_seconds) || 0;
    const avgDailyImpressions = totalImpressions / Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (24 * 60 * 60 * 1000)));

    const byPeriod = byPeriodRows.reduce((acc, row) => {
      acc[row.period] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    const byEventType = byEventRows.reduce((acc, row) => {
      acc[row.event_type] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

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
          completion_rate: parseFloat(summary.completion_rate) || 0,
          estimated_reach: parseInt(summary.estimated_reach) || 0,
          active_sites: parseInt(summary.active_sites) || 0,
          active_days: parseInt(summary.active_days) || 0,
        },
        by_video: byVideoRows.map(v => ({
          video_id: v.video_id,
          name: v.video_name,
          impressions: parseInt(v.impressions),
          screen_time_seconds: parseInt(v.screen_time_seconds),
          completion_rate: parseFloat(v.completion_rate) || 0,
        })),
        by_site: bySiteRows.map(s => ({
          site_id: s.site_id,
          site_name: s.site_name,
          club_name: s.club_name,
          impressions: parseInt(s.impressions),
          screen_time_seconds: parseInt(s.screen_time_seconds),
        })),
        by_period: byPeriod,
        by_event_type: byEventType,
        trends: {
          daily: dailyTrendRows.map(d => ({
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

    // Valider et construire les items pour le repository
    const validItems: ImpressionBatchItem[] = [];
    let skippedCount = 0;

    for (const imp of impressions) {
      const {
        event_id,
        site_sponsor_id,
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

      // Si event_id est fourni, le valider
      if (event_id && !validateUuid(event_id)) {
        skippedCount++;
        continue;
      }

      // Valider site_sponsor_id si fourni, sinon résoudre via video_id+site_id
      let resolvedSiteSponsorId: string | null = null;
      if (site_sponsor_id && typeof site_sponsor_id === 'string' && validateUuid(site_sponsor_id)) {
        resolvedSiteSponsorId = site_sponsor_id;
      } else if (video_id) {
        try {
          resolvedSiteSponsorId = await siteSponsorRepository.resolveSiteSponsorId(video_id as string, authenticatedSiteId);
        } catch {
          // Non-bloquant : si la résolution échoue, on continue sans
        }
      }

      validItems.push({
        eventId: (event_id as string) || null,
        siteSponsorId: resolvedSiteSponsorId,
        siteId: authenticatedSiteId,
        videoId: video_id || null,
        playedAt: played_at as string,
        durationPlayed: duration_played as number,
        videoDuration: video_duration as number,
        completed: (completed as boolean) || false,
        interruptedAt: (interrupted_at as string) || null,
        eventType: (event_type as string) || null,
        period: (period as string) || null,
        triggerType: (trigger_type as string) || 'auto',
        positionInLoop: (position_in_loop as number) || null,
        audienceEstimate: (audience_estimate as number) || null,
      });
    }

    if (validItems.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid impressions to insert',
        skipped: skippedCount
      });
      return;
    }

    const recorded = await advertiserRepository.recordImpressions(validItems);

    logger.info('Advertiser impressions recorded', {
      siteId: authenticatedSiteId,
      siteName: req.siteName,
      recorded,
      skipped: skippedCount
    });

    res.status(201).json({
      success: true,
      message: `${recorded} impression(s) recorded`,
      recorded,
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
    const videoIds = await advertiserRepository.getVideoIds(id);

    if (videoIds.length === 0) {
      res.status(404).json({
        success: false,
        error: 'No videos found for this advertiser',
      });
      return;
    }

    // Récupérer les impressions
    const impressionRows = await advertiserRepository.exportImpressions(videoIds, fromDate, toDate);

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

      const rows = impressionRows.map(row => [
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
        data: impressionRows,
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

    const count = await advertiserRepository.calculateDailyStats(targetDate);

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
