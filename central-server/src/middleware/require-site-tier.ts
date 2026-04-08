import { Response, NextFunction } from 'express';
import { AuthRequest, SubscriptionPlan } from '../types';
import { siteRepository } from '../repositories/site.repository';
import logger from '../config/logger';

/**
 * Hierarchie des tiers d'abonnement commerciaux.
 *
 * Mapping legacy -> nouveau (voir ADR-039):
 *   - 'trial'    ≡ 'play'  (niveau 0)
 *   - 'standard' ≡ 'club'  (niveau 1)
 *   - 'pro'                (niveau 2)
 *   - 'premium'            (niveau 3)
 *
 * Valeurs non reconnues / NULL: traitees comme 'club' (niveau 1, default sûr).
 */
export const TIER_LEVEL: Record<string, number> = {
  trial: 0,
  play: 0,
  standard: 1,
  club: 1,
  pro: 2,
  premium: 3,
};

export type SiteTier = 'play' | 'club' | 'pro' | 'premium';

/**
 * Resout un plan (legacy ou nouveau) vers son niveau numerique.
 * Default 'club' (niveau 1) si valeur inconnue ou null.
 */
export function resolveTierLevel(plan: SubscriptionPlan | string | null | undefined): number {
  if (!plan) return TIER_LEVEL.club;
  return TIER_LEVEL[plan] ?? TIER_LEVEL.club;
}

/**
 * Resout un plan vers son tier canonique (nouvelle terminologie).
 * Utile pour l'affichage et la logique metier cote serveur.
 */
export function resolveCanonicalTier(
  plan: SubscriptionPlan | string | null | undefined
): SiteTier {
  const level = resolveTierLevel(plan);
  if (level >= TIER_LEVEL.premium) return 'premium';
  if (level >= TIER_LEVEL.pro) return 'pro';
  if (level >= TIER_LEVEL.club) return 'club';
  return 'play';
}

/**
 * Middleware qui bloque l'acces a une route si le tier du site est insuffisant.
 *
 * Usage:
 *   router.post(
 *     '/sites/:id/secondary-variant',
 *     authenticate,
 *     validateParams(paramSchemas.id),
 *     requireSiteTier('premium'),
 *     controller.deploySecondaryVariant
 *   );
 *
 * Lit le siteId depuis req.params.id, req.params.siteId, ou req.body.site_id
 * (dans cet ordre). Retourne 403 si le tier est insuffisant, 404 si le site
 * n'existe pas, 500 en cas d'erreur DB.
 */
export const requireSiteTier = (minTier: SiteTier) => {
  const requiredLevel = TIER_LEVEL[minTier];

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const siteId =
        (req.params.id as string | undefined) ||
        (req.params.siteId as string | undefined) ||
        (req.body?.site_id as string | undefined);

      if (!siteId) {
        return res.status(400).json({ error: 'Site ID manquant' });
      }

      const site = await siteRepository.findById(siteId);
      if (!site) {
        return res.status(404).json({ error: 'Site non trouve' });
      }

      const sitePlan = (site as { subscription_plan?: string | null }).subscription_plan;
      const siteLevel = resolveTierLevel(sitePlan);

      if (siteLevel < requiredLevel) {
        logger.info('Site tier insufficient for feature', {
          siteId,
          siteTier: resolveCanonicalTier(sitePlan),
          requiredTier: minTier,
        });
        return res.status(403).json({
          error: 'Fonctionnalite reservee aux abonnements superieurs',
          current_tier: resolveCanonicalTier(sitePlan),
          required_tier: minTier,
        });
      }

      return next();
    } catch (error) {
      logger.error('requireSiteTier middleware error', { error });
      return res.status(500).json({ error: 'Erreur serveur interne' });
    }
  };
};
