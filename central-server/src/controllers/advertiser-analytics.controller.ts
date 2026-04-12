import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import {
  advertiserRepository,
} from '../repositories';
import { getAdvertiserStats as _getAdvertiserStats } from './advertiser-analytics-stats.controller';
import { exportAdvertiserData as _exportAdvertiserData, generateAdvertiserPdfReport as _generateAdvertiserPdfReport } from './advertiser-analytics-export.controller';

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
// RE-EXPORTS from split files
// ============================================================================

export { getAdvertiserStats, getAdvertiserKpis } from './advertiser-analytics-stats.controller';
export { recordImpressions } from './advertiser-analytics-impressions.controller';
export { exportAdvertiserData, calculateDailyStats, generateAdvertiserPdfReport, generateClubPdfReport } from './advertiser-analytics-export.controller';

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
export const getSponsorStats = _getAdvertiserStats;
export const exportSponsorData = _exportAdvertiserData;
export const generateSponsorPdfReport = _generateAdvertiserPdfReport;
