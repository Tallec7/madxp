import { Response } from 'express';
import { SiteAuthRequest } from '../middleware/auth';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import {
  advertiserRepository,
  siteRepository,
  type ImpressionBatchItem,
} from '../repositories';
import { siteSponsorRepository } from '../repositories/site-sponsor.repository';
import metricsService from '../services/metrics.service';

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

    // Le siteId provient de l'authentification par API key (prioritaire)
    // ou du body des impressions (fallback si API key absente/invalide)
    let authenticatedSiteId = req.siteId;

    if (!authenticatedSiteId) {
      // Fallback: extraire site_id depuis la première impression
      const bodySiteId = Array.isArray(impressions) && impressions.length > 0
        ? impressions[0].site_id
        : undefined;

      if (!bodySiteId || typeof bodySiteId !== 'string') {
        res.status(401).json({
          success: false,
          error: 'Site identification required',
          message: 'API key ou site_id dans les impressions requis'
        });
        return;
      }

      // Valider que le site existe
      const siteExists = await siteRepository.exists(bodySiteId);
      if (!siteExists) {
        res.status(404).json({
          success: false,
          error: 'Site not found',
          message: 'Le site_id fourni est inconnu'
        });
        return;
      }

      authenticatedSiteId = bodySiteId;
      logger.warn('Impressions received without API key auth, using body site_id fallback', {
        siteId: bodySiteId,
        impressionCount: impressions?.length
      });
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

    // ----------------------------------------------------------------
    // Phase 1: Validate impressions and collect resolution targets
    // ----------------------------------------------------------------
    interface ValidatedImpression {
      event_id: string | null;
      site_sponsor_id: string | null;
      video_id: string | null;
      video_filename: string | null;
      played_at: string;
      duration_played: number;
      video_duration: number;
      completed: boolean;
      interrupted_at: string | null;
      event_type: string | null;
      period: string | null;
      trigger_type: string;
      position_in_loop: number | null;
      audience_estimate: number | null;
      needsVideoIdResolution: boolean;
      needsFilenameResolution: boolean;
    }

    const validated: ValidatedImpression[] = [];
    let skippedCount = 0;

    // Sets to collect unique (video_id, site_id) and (filename, site_id) pairs
    const videoIdPairsSet = new Set<string>();
    const videoIdPairs: Array<{ videoId: string; siteId: string }> = [];
    const filenamePairsSet = new Set<string>();
    const filenamePairs: Array<{ videoFilename: string; siteId: string }> = [];

    for (const imp of impressions) {
      const {
        event_id,
        site_sponsor_id,
        video_id,
        video_filename,
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
      if (!played_at || duration_played == null || video_duration == null) {
        skippedCount++;
        continue;
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

      // Determine which resolution strategy this impression needs
      const hasSiteSponsorId = site_sponsor_id && typeof site_sponsor_id === 'string' && validateUuid(site_sponsor_id);
      const needsVideoIdResolution = !hasSiteSponsorId && !!video_id;
      const needsFilenameResolution = !hasSiteSponsorId && !video_id
        && !!video_filename && typeof video_filename === 'string';

      // Collect unique pairs for bulk resolution
      if (needsVideoIdResolution) {
        const key = `${video_id as string}::${authenticatedSiteId}`;
        if (!videoIdPairsSet.has(key)) {
          videoIdPairsSet.add(key);
          videoIdPairs.push({ videoId: video_id as string, siteId: authenticatedSiteId });
        }
      }
      if (needsFilenameResolution || (needsVideoIdResolution && video_filename && typeof video_filename === 'string')) {
        // Also collect filename pairs for impressions that have a video_id (fallback if video_id resolution fails)
        const fn = video_filename as string;
        const key = `${fn}::${authenticatedSiteId}`;
        if (!filenamePairsSet.has(key)) {
          filenamePairsSet.add(key);
          filenamePairs.push({ videoFilename: fn, siteId: authenticatedSiteId });
        }
      }

      validated.push({
        event_id: (event_id as string) || null,
        site_sponsor_id: hasSiteSponsorId ? (site_sponsor_id as string) : null,
        video_id: video_id || null,
        video_filename: (video_filename as string) || null,
        played_at: played_at as string,
        duration_played: duration_played as number,
        video_duration: video_duration as number,
        completed: (completed as boolean) || false,
        interrupted_at: (interrupted_at as string) || null,
        event_type: (event_type as string) || null,
        period: (period as string) || null,
        trigger_type: (trigger_type as string) || 'auto',
        position_in_loop: (position_in_loop as number) || null,
        audience_estimate: (audience_estimate as number) || null,
        needsVideoIdResolution,
        needsFilenameResolution,
      });
    }

    // ----------------------------------------------------------------
    // Phase 2: Bulk-resolve site_sponsor_ids (max 2 queries total)
    // ----------------------------------------------------------------
    let videoIdMap = new Map<string, string>();
    let filenameMap = new Map<string, string>();

    try {
      [videoIdMap, filenameMap] = await Promise.all([
        videoIdPairs.length > 0
          ? siteSponsorRepository.resolveSiteSponsorIdsBulk(videoIdPairs)
          : Promise.resolve(new Map<string, string>()),
        filenamePairs.length > 0
          ? siteSponsorRepository.resolveSiteSponsorIdsByFilenameBulk(filenamePairs)
          : Promise.resolve(new Map<string, string>()),
      ]);
    } catch (err) {
      logger.warn('Bulk sponsor resolution failed, impressions will have null site_sponsor_id', {
        siteId: authenticatedSiteId,
        videoIdPairsCount: videoIdPairs.length,
        filenamePairsCount: filenamePairs.length,
        error: (err as Error).message,
      });
      metricsService.recordSponsorResolutionFailure('resolve_impression');
    }

    // ----------------------------------------------------------------
    // Phase 3: Build batch items using in-memory Maps (O(1) lookups)
    // ----------------------------------------------------------------
    const validItems: ImpressionBatchItem[] = [];

    for (const v of validated) {
      let resolvedSiteSponsorId: string | null = v.site_sponsor_id;
      let resolutionMethod: 'site_sponsor_id' | 'video_id' | 'filename' | 'unresolved' = v.site_sponsor_id ? 'site_sponsor_id' : 'unresolved';

      if (!resolvedSiteSponsorId && v.needsVideoIdResolution && v.video_id) {
        const key = `${v.video_id}::${authenticatedSiteId}`;
        const found = videoIdMap.get(key);
        if (found) {
          resolvedSiteSponsorId = found;
          resolutionMethod = 'video_id';
        }
      }

      // Fallback par filename (sponsors locaux, ancien firmware)
      if (!resolvedSiteSponsorId && v.video_filename) {
        const key = `${v.video_filename}::${authenticatedSiteId}`;
        const found = filenameMap.get(key);
        if (found) {
          resolvedSiteSponsorId = found;
          resolutionMethod = 'filename';
        }
      }

      metricsService.recordImpressionResolution(resolutionMethod);

      validItems.push({
        eventId: v.event_id,
        siteSponsorId: resolvedSiteSponsorId,
        siteId: authenticatedSiteId,
        videoId: v.video_id,
        playedAt: v.played_at,
        durationPlayed: v.duration_played,
        videoDuration: v.video_duration,
        completed: v.completed,
        interruptedAt: v.interrupted_at,
        eventType: v.event_type,
        period: v.period,
        triggerType: v.trigger_type,
        positionInLoop: v.position_in_loop,
        audienceEstimate: v.audience_estimate,
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
