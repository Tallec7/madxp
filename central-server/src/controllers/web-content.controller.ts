import { Response } from 'express';
import { AuthRequest } from '../types';
import { SiteAuthRequest } from '../middleware/auth';
import logger from '../config/logger';
import { videoRepository } from '../repositories/video.repository';
import type { WebContentType } from '../repositories/video.repository';
import { metricsService } from '../services/metrics.service';

/**
 * ADR-088 Phase 1 — POST /api/videos/web-content
 * Cree une entree videos de type web_page ou livestream (pas de fichier FTP).
 * Reutilisable via les memes flows que les videos (bibliotheque, catégories, remote).
 */
export const createWebContent = async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as {
      contentType?: WebContentType;
      name?: string;
      url?: string;
      category?: string | null;
      subcategory?: string | null;
      durationSeconds?: number | null;
      thumbnailUrl?: string | null;
      uploadedForSiteId?: string | null;
    };

    const contentType = body.contentType;
    const name = (body.name || '').trim();
    const url = (body.url || '').trim();

    if (contentType !== 'web_page' && contentType !== 'livestream') {
      return res.status(400).json({ error: 'contentType doit etre web_page ou livestream' });
    }
    if (!name) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'URL invalide (http/https requis)' });
    }
    if (contentType === 'livestream' && (!body.durationSeconds || body.durationSeconds <= 0)) {
      return res.status(400).json({ error: 'Duree (secondes) requise pour un livestream' });
    }

    const row = await videoRepository.createWebContent({
      content_type: contentType,
      name,
      external_url: url,
      category: body.category ?? null,
      subcategory: body.subcategory ?? null,
      duration: body.durationSeconds ?? null,
      thumbnail_url: body.thumbnailUrl ?? null,
      uploaded_by: req.user?.id || null,
      uploaded_for_site_id: body.uploadedForSiteId ?? null,
    });

    logger.info('Web content created', {
      videoId: row.id,
      contentType,
      uploadedBy: req.user?.id,
      siteId: body.uploadedForSiteId,
    });

    return res.status(201).json(row);
  } catch (error) {
    logger.error('createWebContent error', { error });
    return res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

/**
 * ADR-088 Phase 2 — GET /api/sites/:id/web-content (Pi sync-agent, authenticateSiteApiKey)
 * Retourne la liste des web_page / livestream accessibles pour le site (globales + taguees).
 * Le sync-agent merge le resultat dans configuration.json sous une pseudo-categorie `web-content`.
 */
export const listWebContentForPi = async (req: SiteAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.siteId || req.siteId !== id) {
      logger.warn('listWebContentForPi forbidden: siteId mismatch', {
        authSiteId: req.siteId,
        paramId: id,
      });
      metricsService.recordWebContentFetch('forbidden');
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rows = await videoRepository.findWebContentForSite(id);

    const entries = rows.map(r => ({
      id: r.id,
      name: r.name,
      contentType: r.content_type,
      externalUrl: r.external_url,
      durationSeconds: r.duration,
      thumbnailUrl: r.thumbnail_url,
      category: r.category,
      subcategory: r.subcategory,
    }));

    metricsService.recordWebContentFetch('success');
    return res.json({ siteId: id, entries });
  } catch (error) {
    logger.error('listWebContentForPi error', { error, siteId: req.params.id });
    metricsService.recordWebContentFetch('error');
    return res.status(500).json({ error: 'Erreur serveur interne' });
  }
};
