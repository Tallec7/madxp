import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import {
  analyticsRepository,
  siteRepository,
  advertiserRepository,
  videoRepository,
  type VideoPlaysBatchItem,
} from '../repositories';
import { metricsService } from '../services/metrics.service';

/**
 * POST /api/analytics/video-plays
 * Enregistrer des lectures vidéo (batch depuis sync-agent)
 */
export const recordVideoPlays = async (req: AuthRequest, res: Response) => {
  try {
    const { site_id, plays } = req.body;

    if (!site_id || !Array.isArray(plays) || plays.length === 0) {
      return res.status(400).json({ error: 'site_id et plays[] requis' });
    }

    // Vérifier que le site existe
    const siteExists = await siteRepository.exists(site_id);
    if (!siteExists) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    let invalidSessions = 0;

    // Valider et préparer toutes les entrées avant l'insertion batch
    const validTriggerTypes = ['auto', 'manual'];
    const validTvStatuses = ['on', 'standby', 'disconnected', 'unknown'];
    const validEventTypes = ['match', 'training', 'tournament', 'other'];
    const validPeriods = ['pre_match', 'halftime', 'post_match', 'loop'];
    const validPlays: VideoPlaysBatchItem[] = [];

    for (const play of plays) {
      const sessionId =
        typeof play.session_id === 'string' && validateUuid(play.session_id)
          ? play.session_id
          : null;

      if (play.session_id && !sessionId) {
        invalidSessions++;
      }

      const videoId =
        typeof play.video_id === 'string' && validateUuid(play.video_id)
          ? play.video_id
          : null;

      const sponsorId =
        typeof play.sponsor_id === 'string' && validateUuid(play.sponsor_id)
          ? play.sponsor_id
          : null;

      const tvStatus = validTvStatuses.includes(play.tv_status) ? play.tv_status : 'unknown';

      // Sponsor context fields (consolidated pipeline)
      const eventType = validEventTypes.includes(play.event_type) ? play.event_type : null;
      const period = validPeriods.includes(play.period) ? play.period : null;
      const audienceEstimate = typeof play.audience_estimate === 'number' && play.audience_estimate >= 0
        ? play.audience_estimate : null;
      const positionInLoop = typeof play.position_in_loop === 'number' && play.position_in_loop >= 0
        ? play.position_in_loop : null;
      const siteSponsorId =
        typeof play.site_sponsor_id === 'string' && validateUuid(play.site_sponsor_id)
          ? play.site_sponsor_id
          : null;
      const campaignId =
        typeof play.campaign_id === 'string' && validateUuid(play.campaign_id)
          ? play.campaign_id
          : null;
      // E-23 US-23.7.4: kiosk (Pi) vs pc (browser) source
      const validSources = ['kiosk', 'pc'];
      const source = typeof play.source === 'string' && validSources.includes(play.source)
        ? play.source
        : null;

      // PoC Proof of Play: interruption reason
      const validInterruptionReasons = ['manual_action', 'profile_switch', 'video_error', 'hdmi_lost', 'loop_advance', 'browser_close'];
      const interruptionReason = typeof play.interruption_reason === 'string' && validInterruptionReasons.includes(play.interruption_reason)
        ? play.interruption_reason
        : null;

      validPlays.push({
        siteId: site_id,
        sessionId,
        videoFilename: play.video_filename,
        category: play.category || 'other',
        playedAt: play.played_at || new Date().toISOString(),
        durationPlayed: play.duration_played || 0,
        videoDuration: play.video_duration || 0,
        completed: play.completed || false,
        triggerType: validTriggerTypes.includes(play.trigger_type) ? play.trigger_type : 'auto',
        videoId,
        sponsorId,
        tvStatus,
        eventType,
        period,
        audienceEstimate,
        positionInLoop,
        siteSponsorId,
        campaignId,
        source,
        interruptionReason,
      });
    }

    if (invalidSessions > 0) {
      logger.warn('Received video plays with invalid session_id, falling back to null', {
        siteId: site_id,
        invalidSessions,
      });
    }

    // Validate FK references exist to avoid FK constraint violations on batch insert.
    // A single missing reference would reject the entire batch (up to 100 plays lost).
    // Pattern: collect unique IDs → bulk check existence → nullify missing → log + metric.
    const uniqueSponsorIds = [...new Set(validPlays.map(p => p.sponsorId).filter((id): id is string => id !== null))];
    const uniqueVideoIds = [...new Set(validPlays.map(p => p.videoId).filter((id): id is string => id !== null))];
    const uniqueSessionIds = [...new Set(validPlays.map(p => p.sessionId).filter((id): id is string => id !== null))];
    const uniqueCampaignIds = [...new Set(validPlays.map(p => p.campaignId).filter((id): id is string => id !== null))];

    const [existingSponsorIds, existingVideoIds, existingSessionIds, existingCampaignIds] = await Promise.all([
      uniqueSponsorIds.length > 0 ? advertiserRepository.findExistingIds(uniqueSponsorIds) : Promise.resolve(new Set<string>()),
      uniqueVideoIds.length > 0 ? videoRepository.findExistingIds(uniqueVideoIds) : Promise.resolve(new Set<string>()),
      uniqueSessionIds.length > 0 ? analyticsRepository.findExistingSessionIds(uniqueSessionIds) : Promise.resolve(new Set<string>()),
      uniqueCampaignIds.length > 0 ? analyticsRepository.findExistingCampaignIds(uniqueCampaignIds) : Promise.resolve(new Set<string>()),
    ]);

    const missingSponsorIds = uniqueSponsorIds.filter(id => !existingSponsorIds.has(id));
    const missingVideoIds = uniqueVideoIds.filter(id => !existingVideoIds.has(id));
    const missingSessionIds = uniqueSessionIds.filter(id => !existingSessionIds.has(id));
    const missingCampaignIds = uniqueCampaignIds.filter(id => !existingCampaignIds.has(id));

    if (missingSponsorIds.length > 0 || missingVideoIds.length > 0 || missingSessionIds.length > 0 || missingCampaignIds.length > 0) {
      const missingFks: Record<string, string[]> = {};
      if (missingSponsorIds.length > 0) missingFks.sponsor_id = missingSponsorIds;
      if (missingVideoIds.length > 0) missingFks.video_id = missingVideoIds;
      if (missingSessionIds.length > 0) missingFks.session_id = missingSessionIds;
      if (missingCampaignIds.length > 0) missingFks.campaign_id = missingCampaignIds;

      logger.warn('Video plays reference non-existent FK targets, falling back to null', {
        siteId: site_id,
        missingFks,
      });

      let sponsorNulled = 0;
      let videoNulled = 0;
      let sessionNulled = 0;
      let campaignNulled = 0;

      for (const play of validPlays) {
        if (play.sponsorId !== null && !existingSponsorIds.has(play.sponsorId)) {
          play.sponsorId = null;
          sponsorNulled++;
        }
        if (play.videoId !== null && !existingVideoIds.has(play.videoId)) {
          play.videoId = null;
          videoNulled++;
        }
        if (play.sessionId !== null && !existingSessionIds.has(play.sessionId)) {
          play.sessionId = null;
          sessionNulled++;
        }
        if (play.campaignId !== null && !existingCampaignIds.has(play.campaignId)) {
          play.campaignId = null;
          campaignNulled++;
        }
      }

      if (sponsorNulled > 0) metricsService.recordVideoPlaysFkFallback('sponsor_id', sponsorNulled);
      if (videoNulled > 0) metricsService.recordVideoPlaysFkFallback('video_id', videoNulled);
      if (sessionNulled > 0) metricsService.recordVideoPlaysFkFallback('session_id', sessionNulled);
      if (campaignNulled > 0) metricsService.recordVideoPlaysFkFallback('campaign_id', campaignNulled);
    }

    // Batch insert via repository (handles batching internally)
    await analyticsRepository.recordVideoPlays(validPlays);

    logger.info('Video plays recorded', { siteId: site_id, count: validPlays.length, totalPlays: validPlays.length });

    res.json({ success: true, recorded: validPlays.length });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    logger.error('Record video plays error:', { error: errorMessage, siteId: req.body?.site_id, playsCount: req.body?.plays?.length });
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement des lectures', details: errorMessage });
  }
};

/**
 * POST /api/analytics/sessions
 * Créer ou mettre à jour une session
 */
export const manageSession = async (req: AuthRequest, res: Response) => {
  try {
    const { site_id, action, session_id } = req.body;

    if (!site_id || !action) {
      return res.status(400).json({ error: 'site_id et action requis' });
    }

    if (action === 'start') {
      // Créer une nouvelle session
      const session = await analyticsRepository.startSession(site_id);

      logger.info('Session started', { siteId: site_id, sessionId: session.id });

      return res.json({
        success: true,
        session_id: session.id,
        started_at: session.started_at,
      });
    }

    if (action === 'end' && session_id) {
      // Terminer une session
      const session = await analyticsRepository.endSession(session_id);

      if (!session) {
        return res.status(404).json({ error: 'Session non trouvée' });
      }

      logger.info('Session ended', { sessionId: session_id, duration: session.duration_seconds });

      return res.json({ success: true, session });
    }

    res.status(400).json({ error: 'Action invalide' });
  } catch (error) {
    logger.error('Manage session error:', error);
    res.status(500).json({ error: 'Erreur lors de la gestion de la session' });
  }
};
