import { Response } from 'express';
import { AuthRequest } from '../types';
import { videoClubGrantRepository, videoRepository } from '../repositories';
import logger from '../config/logger';
import { metricsService } from '../services/metrics.service';

export const listGrants = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const grants = await videoClubGrantRepository.findGrantedSiteIdsForVideo(id);
    res.json({ grants });
  } catch (error) {
    logger.error('Error listing video club grants:', { error, videoId: req.params.id });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

export const addGrant = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { site_id } = req.body as { site_id: string };

    const video = await videoRepository.findVideoById(id);
    if (!video) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }
    if (video.category?.toUpperCase() === 'NEOPRO') {
      return res.status(403).json({ error: 'Les vidéos Neopro corporate ne peuvent pas être grantées' });
    }

    await videoClubGrantRepository.addGrant(id, site_id);
    metricsService.recordVideoClubGrant('add', 'success');
    logger.info('Video club grant added:', { videoId: id, siteId: site_id, by: req.user?.id });
    res.status(201).json({ success: true });
  } catch (error) {
    metricsService.recordVideoClubGrant('add', 'error');
    logger.error('Error adding video club grant:', { error, videoId: req.params.id });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

export const removeGrant = async (req: AuthRequest, res: Response) => {
  try {
    const { id, siteId } = req.params;
    await videoClubGrantRepository.removeGrant(id, siteId);
    metricsService.recordVideoClubGrant('remove', 'success');
    logger.info('Video club grant removed:', { videoId: id, siteId, by: req.user?.id });
    res.json({ success: true });
  } catch (error) {
    metricsService.recordVideoClubGrant('remove', 'error');
    logger.error('Error removing video club grant:', { error, videoId: req.params.id });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

export const getGrantedVideoIdsForSite = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const videoIds = await videoClubGrantRepository.findGrantedVideoIdsForSite(siteId);
    res.json({ videoIds: [...videoIds] });
  } catch (error) {
    logger.error('Error fetching granted video ids:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};
