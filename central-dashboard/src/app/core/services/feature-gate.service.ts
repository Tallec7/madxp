import { Injectable } from '@angular/core';
import { SubscriptionPlan } from '../models';

/**
 * Tier commercial canonique (nouvelle terminologie).
 *
 * Correspondance avec les valeurs DB legacy :
 *   - 'trial'    ≡ 'play'
 *   - 'standard' ≡ 'club'
 */
export type SiteTier = 'play' | 'club' | 'pro' | 'premium';

/**
 * Niveaux numeriques pour comparaison de tiers.
 * Voir ADR-039.
 */
const TIER_LEVEL: Record<string, number> = {
  trial: 0,
  play: 0,
  standard: 1,
  club: 1,
  pro: 2,
  premium: 3,
};

/**
 * Catalogue des features gatees par tier minimum.
 *
 * Source de verite unique pour tout le dashboard + portail club.
 * Chaque feature indique le tier minimum requis pour l'utiliser.
 *
 * Convention :
 *   - Les features GRATUITES pour tous les tiers ne sont PAS listees ici.
 *   - Ajouter une feature = une seule ligne + un seul guard UI.
 *   - Ne jamais dupliquer une verification en dur `=== 'premium'` dans
 *     un composant : utiliser FeatureGateService.canAccess().
 */
export type FeatureKey =
  // Diffusion
  | 'multi_profiles'          // Pro/Premium : gerer plusieurs profils (ambiances)
  | 'weighted_rotation'       // Pro/Premium : pondération weight sur la boucle
  | 'hourly_schedule'         // Pro/Premium : programmation horaire (starts_at/ends_at)
  // Contenu
  | 'image_to_video'          // Club+ : conversion image -> video
  | 'secondary_display'       // Premium : multi-ecrans avec vidéos secondaires
  // Sponsors & Analytics
  | 'sponsor_portal'          // Pro/Premium : acces portail sponsor (existant)
  | 'analytics_advanced'      // Premium : analytics 90j + export CSV/PDF
  | 'remote_diagnostic'       // Premium : diagnostic a distance (lecture seule)
  // Marque & Personnalisation
  | 'white_label'             // Premium : marque blanche complete
  | 'watermark';              // Pro/Premium : watermark / logo permanent

const FEATURE_TIERS: Record<FeatureKey, SiteTier> = {
  multi_profiles: 'pro',
  weighted_rotation: 'pro',
  hourly_schedule: 'pro',
  image_to_video: 'club',
  secondary_display: 'premium',
  sponsor_portal: 'pro',
  analytics_advanced: 'premium',
  remote_diagnostic: 'premium',
  white_label: 'premium',
  watermark: 'pro',
};

/**
 * Service central de gating des fonctionnalites par tier d'abonnement.
 *
 * Usage dans un composant :
 *   constructor(private gate: FeatureGateService) {}
 *   canUseMultiProfiles = this.gate.canAccess('multi_profiles', this.site);
 *
 * Usage dans un template :
 *   <div *ngIf="gate.canAccess('secondary_display', site)">...</div>
 *   <app-premium-lock *ngIf="!gate.canAccess('secondary_display', site)"
 *                     feature="secondary_display" />
 */
@Injectable({ providedIn: 'root' })
export class FeatureGateService {
  /**
   * Resout un plan (legacy ou nouveau) vers son niveau numerique.
   * Default 'club' si valeur inconnue/null.
   */
  resolveLevel(plan: SubscriptionPlan | string | null | undefined): number {
    if (!plan) return TIER_LEVEL['club'];
    return TIER_LEVEL[plan] ?? TIER_LEVEL['club'];
  }

  /**
   * Tier canonique (nouvelle terminologie) d'un site.
   */
  resolveTier(plan: SubscriptionPlan | string | null | undefined): SiteTier {
    const level = this.resolveLevel(plan);
    if (level >= TIER_LEVEL['premium']) return 'premium';
    if (level >= TIER_LEVEL['pro']) return 'pro';
    if (level >= TIER_LEVEL['club']) return 'club';
    return 'play';
  }

  /**
   * Indique si un site peut acceder a une feature donnee.
   *
   * @param feature Cle de la feature (voir FeatureKey)
   * @param siteOrPlan Site (objet) ou directement le subscription_plan
   */
  canAccess(
    feature: FeatureKey,
    siteOrPlan: { subscription_plan?: SubscriptionPlan | string | null; feature_overrides?: Record<string, boolean> | null } | SubscriptionPlan | string | null | undefined
  ): boolean {
    // Check per-site override first (set by super_admin)
    if (typeof siteOrPlan === 'object' && siteOrPlan !== null && !Array.isArray(siteOrPlan)) {
      const overrides = (siteOrPlan as { feature_overrides?: Record<string, boolean> | null }).feature_overrides;
      if (overrides && overrides[feature] === true) return true;
    }

    const plan =
      typeof siteOrPlan === 'string'
        ? siteOrPlan
        : siteOrPlan?.subscription_plan ?? null;

    const siteLevel = this.resolveLevel(plan);
    const requiredLevel = TIER_LEVEL[FEATURE_TIERS[feature]];
    return siteLevel >= requiredLevel;
  }

  /**
   * Tier minimum requis pour une feature — utile pour afficher
   * "Reserve aux abonnements Pro" dans un lock component.
   */
  requiredTier(feature: FeatureKey): SiteTier {
    return FEATURE_TIERS[feature];
  }
}
