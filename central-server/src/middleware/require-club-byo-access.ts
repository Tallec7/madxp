/**
 * ADR-075 V3 Phase B — Middleware d'accès club aux templates self-service.
 *
 * Valide :
 *   - L'utilisateur est authentifié et possède un `site_id`
 *   - Le site a le tier `premium` OU l'override `template_studio_byo=true`
 *
 * Attache `req.clubSiteId` pour les handlers downstream.
 * Les routes mount ce middleware APRÈS `authenticate` + `requireRole('club','admin','super_admin')`.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { siteRepository } from '../repositories/site.repository';
import {
  TIER_LEVEL,
  resolveTierLevel,
  resolveCanonicalTier,
  hasFeatureOverride,
} from './require-site-tier';
import logger from '../config/logger';

const FEATURE_KEY = 'template_studio_byo';

declare module 'express-serve-static-core' {
  interface Request {
    clubSiteId?: string;
  }
}

export const requireClubByoAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    // super_admin bypass : accès total (utile pour support/QA)
    if (user.role === 'super_admin') {
      const siteId = (req.query?.site_id as string | undefined) || user.site_id;
      if (!siteId) {
        res.status(400).json({ error: 'site_id requis pour super_admin' });
        return;
      }
      req.clubSiteId = siteId;
      return next();
    }

    const siteId = user.site_id;
    if (!siteId) {
      res.status(403).json({ error: 'Utilisateur sans site assigné' });
      return;
    }

    const site = await siteRepository.findById(siteId);
    if (!site) {
      res.status(404).json({ error: 'Site non trouvé' });
      return;
    }

    const siteCast = site as {
      feature_overrides?: Record<string, boolean> | null;
      subscription_plan?: string | null;
    };

    if (hasFeatureOverride(siteCast, FEATURE_KEY)) {
      req.clubSiteId = siteId;
      return next();
    }

    const siteLevel = resolveTierLevel(siteCast.subscription_plan);
    if (siteLevel < TIER_LEVEL.premium) {
      logger.info('Club BYO access denied — tier insufficient', {
        siteId,
        tier: resolveCanonicalTier(siteCast.subscription_plan),
        userId: user.id,
      });
      res.status(403).json({
        error: 'Fonctionnalité réservée aux abonnements Premium',
        current_tier: resolveCanonicalTier(siteCast.subscription_plan),
        required_tier: 'premium',
        feature: FEATURE_KEY,
      });
      return;
    }

    req.clubSiteId = siteId;
    return next();
  } catch (error) {
    logger.error('requireClubByoAccess error', { error });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};
