import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import { siteSponsorRepository } from '../repositories/site-sponsor.repository';
import { siteRepository } from '../repositories';
import { sponsorAccessService } from '../services/sponsor-access.service';
import { emailService } from '../services/email.service';

// =============================================================================
// SITE-SPONSOR CONTROLLER
// CRUD sponsors de site + stats par sponsor
// Routes: /api/sites/:siteId/sponsors/...
// =============================================================================

// =============================================================================
// GET /api/sites/:siteId/sponsors
// Liste les sponsors d'un site
// =============================================================================

export const listSiteSponsors = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId } = req.params;
    const includeInactive = req.query.include_inactive === 'true';

    if (!validateUuid(siteId)) {
      res.status(400).json({ success: false, error: 'Invalid site ID' });
      return;
    }

    // Vérifier que le site existe
    const site = await siteRepository.findById(siteId);
    if (!site) {
      res.status(404).json({ success: false, error: 'Site not found' });
      return;
    }

    const sponsors = await siteSponsorRepository.listBySite(siteId, includeInactive);

    res.json({
      success: true,
      data: {
        site: {
          id: siteId,
          site_name: site.site_name,
          club_name: site.club_name,
        },
        sponsors,
        total: sponsors.length,
      },
    });
  } catch (error: unknown) {
    logger.error('Error listing site sponsors:', error);
    res.status(500).json({ success: false, error: 'Failed to list site sponsors' });
  }
};

// =============================================================================
// GET /api/sites/:siteId/sponsors/:sponsorId
// Détail d'un sponsor de site
// =============================================================================

export const getSiteSponsor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId, sponsorId } = req.params;

    if (!validateUuid(siteId) || !validateUuid(sponsorId)) {
      res.status(400).json({ success: false, error: 'Invalid ID' });
      return;
    }

    const sponsor = await siteSponsorRepository.findByIdFull(sponsorId);
    if (!sponsor || sponsor.site_id !== siteId) {
      res.status(404).json({ success: false, error: 'Site sponsor not found' });
      return;
    }

    const videos = await siteSponsorRepository.getVideos(sponsorId);

    res.json({
      success: true,
      data: {
        ...sponsor,
        videos,
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching site sponsor:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch site sponsor' });
  }
};

// =============================================================================
// POST /api/sites/:siteId/sponsors
// Créer un sponsor de site (local)
// =============================================================================

export const createSiteSponsor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId } = req.params;
    const {
      name, contact_name, contact_email, contact_phone,
      logo_url, contract_amount, contract_start, contract_end,
      metadata,
    } = req.body;

    if (!validateUuid(siteId)) {
      res.status(400).json({ success: false, error: 'Invalid site ID' });
      return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Name is required' });
      return;
    }

    // Vérifier que le site existe
    const site = await siteRepository.findById(siteId);
    if (!site) {
      res.status(404).json({ success: false, error: 'Site not found' });
      return;
    }

    const sponsor = await siteSponsorRepository.create({
      siteId,
      name: name.trim(),
      contactName: contact_name || null,
      contactEmail: contact_email || null,
      contactPhone: contact_phone || null,
      logoUrl: logo_url || null,
      contractAmount: contract_amount ?? null,
      contractStart: contract_start || null,
      contractEnd: contract_end || null,
      source: 'local',
      metadata: metadata || {},
    });

    logger.info('Site sponsor created', {
      siteSponsorId: sponsor.id,
      siteId,
      name: sponsor.name,
      source: 'local',
      userId: req.user?.id,
    });

    res.status(201).json({
      success: true,
      data: sponsor,
    });
  } catch (error: unknown) {
    logger.error('Error creating site sponsor:', error);
    res.status(500).json({ success: false, error: 'Failed to create site sponsor' });
  }
};

// =============================================================================
// PUT /api/sites/:siteId/sponsors/:sponsorId
// Modifier un sponsor de site
// =============================================================================

export const updateSiteSponsor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId, sponsorId } = req.params;
    const {
      name, contact_name, contact_email, contact_phone,
      logo_url, contract_amount, contract_start, contract_end,
      status, metadata,
    } = req.body;

    if (!validateUuid(siteId) || !validateUuid(sponsorId)) {
      res.status(400).json({ success: false, error: 'Invalid ID' });
      return;
    }

    // Vérifier que le sponsor existe et appartient au site
    const existing = await siteSponsorRepository.findByIdFull(sponsorId);
    if (!existing || existing.site_id !== siteId) {
      res.status(404).json({ success: false, error: 'Site sponsor not found' });
      return;
    }

    const updated = await siteSponsorRepository.update(sponsorId, {
      name,
      contactName: contact_name,
      contactEmail: contact_email,
      contactPhone: contact_phone,
      logoUrl: logo_url,
      contractAmount: contract_amount,
      contractStart: contract_start,
      contractEnd: contract_end,
      status,
      metadata,
    });

    logger.info('Site sponsor updated', {
      siteSponsorId: sponsorId,
      siteId,
      userId: req.user?.id,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error: unknown) {
    logger.error('Error updating site sponsor:', error);
    res.status(500).json({ success: false, error: 'Failed to update site sponsor' });
  }
};

// =============================================================================
// DELETE /api/sites/:siteId/sponsors/:sponsorId
// Supprimer un sponsor de site
// =============================================================================

export const deleteSiteSponsor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId, sponsorId } = req.params;

    if (!validateUuid(siteId) || !validateUuid(sponsorId)) {
      res.status(400).json({ success: false, error: 'Invalid ID' });
      return;
    }

    const existing = await siteSponsorRepository.findByIdFull(sponsorId);
    if (!existing || existing.site_id !== siteId) {
      res.status(404).json({ success: false, error: 'Site sponsor not found' });
      return;
    }

    await siteSponsorRepository.delete(sponsorId);

    logger.info('Site sponsor deleted', {
      siteSponsorId: sponsorId,
      siteId,
      name: existing.name,
      userId: req.user?.id,
    });

    res.json({ success: true, message: 'Site sponsor deleted' });
  } catch (error: unknown) {
    logger.error('Error deleting site sponsor:', error);
    res.status(500).json({ success: false, error: 'Failed to delete site sponsor' });
  }
};

// =============================================================================
// GET /api/sites/:siteId/sponsors/:sponsorId/stats
// Stats d'un sponsor de site sur une période
// =============================================================================

export const getSiteSponsorStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId, sponsorId } = req.params;
    const from = (req.query.from as string) || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const to = (req.query.to as string) || new Date().toISOString().split('T')[0];

    if (!validateUuid(siteId) || !validateUuid(sponsorId)) {
      res.status(400).json({ success: false, error: 'Invalid ID' });
      return;
    }

    const sponsor = await siteSponsorRepository.findByIdFull(sponsorId);
    if (!sponsor || sponsor.site_id !== siteId) {
      res.status(404).json({ success: false, error: 'Site sponsor not found' });
      return;
    }

    const [summary, dailyTrends, videos] = await Promise.all([
      siteSponsorRepository.getStatsSummary(sponsorId, from, to),
      siteSponsorRepository.getDailyTrends(sponsorId, from, to),
      siteSponsorRepository.getVideos(sponsorId),
    ]);

    res.json({
      success: true,
      data: {
        sponsor: {
          id: sponsor.id,
          name: sponsor.name,
          source: sponsor.source,
          status: sponsor.status,
        },
        period: { from, to },
        summary,
        daily_trends: dailyTrends,
        videos,
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching site sponsor stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch site sponsor stats' });
  }
};

// =============================================================================
// POST /api/sites/:siteId/sponsors/:sponsorId/videos
// Ajouter une vidéo à un sponsor de site
// =============================================================================

export const addVideoToSiteSponsor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId, sponsorId } = req.params;
    const { video_id, video_filename, is_primary } = req.body;

    if (!validateUuid(siteId) || !validateUuid(sponsorId)) {
      res.status(400).json({ success: false, error: 'Invalid ID' });
      return;
    }

    if (!video_filename || typeof video_filename !== 'string') {
      res.status(400).json({ success: false, error: 'video_filename is required' });
      return;
    }

    const sponsor = await siteSponsorRepository.findByIdFull(sponsorId);
    if (!sponsor || sponsor.site_id !== siteId) {
      res.status(404).json({ success: false, error: 'Site sponsor not found' });
      return;
    }

    await siteSponsorRepository.addVideo(
      sponsorId,
      video_id && validateUuid(video_id) ? video_id : null,
      video_filename,
      is_primary === true
    );

    logger.info('Video added to site sponsor', {
      siteSponsorId: sponsorId,
      videoFilename: video_filename,
      videoId: video_id,
      userId: req.user?.id,
    });

    res.status(201).json({ success: true, message: 'Video added to sponsor' });
  } catch (error: unknown) {
    logger.error('Error adding video to site sponsor:', error);
    res.status(500).json({ success: false, error: 'Failed to add video to site sponsor' });
  }
};

// =============================================================================
// DELETE /api/sites/:siteId/sponsors/:sponsorId/videos/:filename
// Retirer une vidéo d'un sponsor de site
// =============================================================================

export const removeVideoFromSiteSponsor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId, sponsorId, filename } = req.params;

    if (!validateUuid(siteId) || !validateUuid(sponsorId)) {
      res.status(400).json({ success: false, error: 'Invalid ID' });
      return;
    }

    const sponsor = await siteSponsorRepository.findByIdFull(sponsorId);
    if (!sponsor || sponsor.site_id !== siteId) {
      res.status(404).json({ success: false, error: 'Site sponsor not found' });
      return;
    }

    const removed = await siteSponsorRepository.removeVideo(sponsorId, decodeURIComponent(filename));
    if (!removed) {
      res.status(404).json({ success: false, error: 'Video not found for this sponsor' });
      return;
    }

    logger.info('Video removed from site sponsor', {
      siteSponsorId: sponsorId,
      filename,
      userId: req.user?.id,
    });

    res.json({ success: true, message: 'Video removed from sponsor' });
  } catch (error: unknown) {
    logger.error('Error removing video from site sponsor:', error);
    res.status(500).json({ success: false, error: 'Failed to remove video from site sponsor' });
  }
};

// =============================================================================
// POST /api/sites/:siteId/sponsors/:sponsorId/access-link
// Generer un magic link pour acces autonome du sponsor
// =============================================================================

export const createAccessLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { siteId, sponsorId } = req.params;

    if (!validateUuid(siteId) || !validateUuid(sponsorId)) {
      res.status(400).json({ success: false, error: 'Invalid ID' });
      return;
    }

    const sponsor = await siteSponsorRepository.findByIdFull(sponsorId);
    if (!sponsor || sponsor.site_id !== siteId) {
      res.status(404).json({ success: false, error: 'Site sponsor not found' });
      return;
    }

    const site = await siteRepository.findById(siteId);
    if (!site) {
      res.status(404).json({ success: false, error: 'Site not found' });
      return;
    }

    // Generate token
    const result = await sponsorAccessService.createAccessLink(sponsorId);
    if (!result) {
      res.status(500).json({ success: false, error: 'Failed to create access link' });
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || process.env.CENTRAL_DASHBOARD_URL || 'http://localhost:4300';
    const accessUrl = `${frontendUrl}/sponsor-access?token=${result.token}`;

    // Send email if contact_email exists
    let emailSent = false;
    if (sponsor.contact_email) {
      emailSent = await emailService.sendSponsorAccessLink(sponsor.contact_email, {
        sponsorName: sponsor.name,
        clubName: site.club_name,
        accessUrl,
        expiresAt: result.expiresAt,
      });
    }

    logger.info('Sponsor access link created', {
      siteSponsorId: sponsorId,
      siteId,
      emailSent,
      userId: req.user?.id,
    });

    res.json({
      success: true,
      data: {
        accessUrl,
        expiresAt: result.expiresAt.toISOString(),
        emailSent,
        sentTo: emailSent ? sponsor.contact_email : null,
      },
    });
  } catch (error: unknown) {
    logger.error('Error creating sponsor access link:', error);
    res.status(500).json({ success: false, error: 'Failed to create access link' });
  }
};
