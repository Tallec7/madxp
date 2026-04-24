import type { Response } from 'express';
import type { SiteAuthRequest } from '../middleware/auth';
import logger from '../config/logger';
import { siteRepository } from '../repositories';

/**
 * ADR-092 Phase Pi — Pi-facing endpoint to fetch `feature_overrides`.
 *
 * Pi sync-agent hits this on reconnect + periodically and persists the result
 * into `configuration.json` (see `feature-flags-sync.js`). The Angular Pi app
 * then reads `configuration.featureOverrides` at boot and RemoteHostComponent
 * picks V1/V2 accordingly.
 *
 * Auth: `authenticateSiteApiKey` enforces `req.siteId === params.id`, so a Pi
 * can only read its own flags.
 */
export const getFeatureFlags = async (
  req: SiteAuthRequest,
  res: Response,
): Promise<Response> => {
  try {
    const { id } = req.params;

    if (req.siteId !== id) {
      return res.status(403).json({ error: 'Accès refusé : site mismatch' });
    }

    const site = await siteRepository.findById(id);
    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const raw = site.feature_overrides;
    const featureOverrides: Record<string, boolean> = raw
      ? typeof raw === 'string'
        ? JSON.parse(raw)
        : (raw as Record<string, boolean>)
      : {};

    return res.json({ siteId: id, featureOverrides });
  } catch (error) {
    logger.error('getFeatureFlags error', { error, siteId: req.params.id });
    return res.status(500).json({ error: 'Erreur serveur interne' });
  }
};
