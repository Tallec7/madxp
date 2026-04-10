# ADR-039: Extension additive des tiers d'abonnement (play / club / pro)

**Date** : 2026-04-08
**Statut** : Accepté
**Format** : Léger

---

## Contexte

La grille tarifaire commerciale Neopro est passée à 4 offres : **Play**, **Club**, **Pro**, **Premium**. La base de données utilisait jusqu'ici une colonne `sites.subscription_plan` avec les valeurs legacy `trial | standard | premium`, consommée par pitch-deck metrics, pipelines billing, Prometheus gauges, badges CSS `.plan-standard`, filtres dashboard, tests unitaires et exports d'abonnements.

Un rename brutal (`standard` → `club`, `trial` → `play`) impliquait ~25 fichiers modifiés à travers `central-server` + `central-dashboard`, dont plusieurs assets sensibles (métriques investisseurs, billing, services de monitoring). Un champ parallèle `subscription_tier` créait une double source de vérité sur le concept d'offre commerciale.

## Décision

**Stratégie additive, non destructive** :

1. La contrainte `CHECK` sur `sites.subscription_plan` est étendue pour accepter les 6 valeurs : `trial | standard | premium | play | club | pro`.
2. **Aucune migration de données** : les sites existants restent sur leurs valeurs legacy. Les nouveaux sites peuvent être créés directement sur `play`, `club`, `pro`.
3. Un service central `FeatureGateService` (dashboard) et un middleware `requireSiteTier` (server) traitent les alias comme équivalents :
   - `'trial'` ≡ `'play'` (niveau 0)
   - `'standard'` ≡ `'club'` (niveau 1)
   - `'pro'` (niveau 2)
   - `'premium'` (niveau 3)
4. Le gating de features se fait exclusivement via `FeatureGateService.canAccess(feature, site)` — aucune comparaison en dur `=== 'premium'` dans les composants.
5. Le rename terminologique complet (pitch-deck, billing, CSS, tests, labels UI) est reporté à une PR de cleanup ultérieure, hors critical path.

## Alternatives rejetées

- **Rename destructif immédiat (`standard` → `club`, `trial` → `play`)** : rejeté car casse pitch-deck metrics (métriques investisseurs), billing service, Prometheus gauges, classes CSS, tests unitaires, et nécessite ~25 fichiers modifiés simultanément avec risque de régression silencieuse.
- **Champ parallèle `subscription_tier`** : rejeté car crée une double source de vérité sur le concept d'offre commerciale (bug garanti à 6 mois entre billing et gating).
- **Enum séparé par contexte (plan billing vs tier produit)** : rejeté car même problème de duplication, sans gain fonctionnel par rapport à la stratégie additive.

## Conséquences

- ✅ Zéro régression sur l'existant (pitch-deck, billing, métriques, CSS).
- ✅ Les 4 nouveaux tiers commerciaux sont immédiatement utilisables pour gater des features.
- ✅ `FeatureGateService` est l'unique source de vérité pour le gating, centralisée et testable.
- ✅ Les smoke tests CLAUDE.md `NE JAMAIS modifier les migrations déjà en production` restent respectés (migration additive).
- ⚠️ **Dette technique assumée** : double vocabulaire `standard`/`club` et `trial`/`play` cohabite tant que la PR de cleanup n'a pas tourné. Les devs doivent lire les commentaires JSDoc de `SubscriptionPlan` et ne jamais dupliquer de test d'égalité brut sur ces valeurs.
- ⚠️ Le `PremiumLockComponent` affiche des labels en terminologie nouvelle (_« Disponible avec l'offre Pro »_) même pour les sites encore sur `standard` — c'est intentionnel, l'utilisateur voit le bon nom commercial.

## Fichiers impactés

### Server

- `central-server/src/scripts/migrations/extend-subscription-plan-tiers.sql` — migration additive (CHECK étendu)
- `central-server/src/types/index.ts` — enum `SubscriptionPlan` étendu
- `central-server/src/middleware/validation.ts` — Joi `.valid()` étendu (2 schemas)
- `central-server/src/controllers/subscription.controller.ts` — `validPlans` array étendu (2 places)
- `central-server/src/middleware/require-site-tier.ts` — **nouveau** middleware de gating

### Dashboard

- `central-dashboard/src/app/core/models/index.ts` — enum `SubscriptionPlan` étendu
- `central-dashboard/src/app/core/services/feature-gate.service.ts` — **nouveau** service central
- `central-dashboard/src/app/shared/components/premium-lock/premium-lock.component.ts` — **nouveau** composant d'upsell

### Documentation

- `docs/adr/README.md` — entrée ADR-039

## Phase 2 — Gating appliqué (Avr 2026)

Après la mise en place du socle (`FeatureGateService`, middleware serveur, `PremiumLockComponent`), les features suivantes ont été gatées dans le dashboard :

| Phase | Feature                                     | Tier requis | Fichiers clés                                                                               |
| ----- | ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| 2.6   | `image_to_video` (club)                     | Club+       | `video-upload-zone.component.ts`, `content.routes.ts` (+ `createVideo` endpoint)            |
| 2.7   | `multi_profiles` (profils)                  | Pro+        | `site-content-tab.component.ts` (sélecteur profils), `config-editor.component.ts`           |
| 2.8   | `weighted_rotation` (poids boucle)          | Pro+        | `loop-manager.component.ts` (champs weight gated)                                           |
| 2.9   | `analytics_advanced` (90j + export CSV/PDF) | Premium     | `club-analytics.component.ts`                                                               |
| 2.10  | `secondary_display` (variantes écran 2)     | Premium     | `video-library.component.ts`, `video-manager.component.ts`, `site-content-tab.component.ts` |
| 2.11  | `remote_diagnostic` (lecture seule)         | Premium     | `club-diagnostic.component.ts` (**nouveau**), `app.routes.ts`, `layout.component.ts`        |

### Invariants vérifiés par smoke tests

Les gates Phase 2 sont verrouillés par 8 nouveaux smoke tests (section _"ADR-039 Phase 2 gating regression guards"_ dans `central-server/src/__tests__/smoke.test.ts`) :

1. `feature-gate.service` — les 6 features sont mappées aux bons tiers.
2. `club-analytics` — 90j et export CSV/PDF gardés par `analytics_advanced` (template + guards TS).
3. `video-library` — bouton 📺 variante gardée par `secondary_display`, plus guard méthode.
4. `video-manager` — propagation `subscriptionPlan` + modal variante + event `secondaryVariantChanged`.
5. `club-diagnostic` — composant existe, gate `remote_diagnostic`, lock card, polling 30s, cleanup `ngOnDestroy`.
6. `app.routes` — route `/club/diagnostic` avec `roleGuard` + `roles: ['club']`.
7. `layout.component` — lien sidebar `/club/diagnostic` dans la section club nav (vérification via split sur `#defaultNav`).

Ces smoke tests échoueront au moindre retour en arrière (ex : suppression du guard TS, retrait du `*ngIf`, raccourci `=== 'premium'` direct), garantissant la non-régression sur l'ensemble de la Phase 2.

### Supervision / monitoring

La fréquence d'accès aux features gatées reste mesurable via les métriques existantes :

- **Serveur** : `metrics.service.ts` expose déjà un gauge `neopro_sites_subscription_plan` (labels par plan) qui sert de dénominateur pour les fonctionnalités Premium.
- **Dashboard** : `FeatureGateService.canAccess()` est l'unique point de contrôle — si besoin ultérieur de tracking "feature refusée au club X", il suffira d'ajouter un `console.warn` / analytics event centralisé dans cette méthode, sans toucher aux composants.

Aucune alerte Prometheus dédiée n'est ajoutée à ce stade : le gating est **opt-in côté UI** (masquage/désactivation, pas une erreur runtime), donc ne produit pas d'incident opérationnel à remonter.

## Phase 3 — Feature Overrides par site (Avr 2026)

Le gating par tier est complété par un mécanisme d'**override par site**, permettant au super_admin d'activer une feature individuellement sans changer le plan d'abonnement.

### Hiérarchie de décision

```
1. feature_overrides[feature] === true  →  accès autorisé (super_admin override)
2. subscription_plan >= tier requis      →  accès autorisé (plan d'abonnement)
3. sinon                                 →  accès refusé
```

Le super_admin est **au-dessus** du système de tiers : il peut débloquer n'importe quelle feature pour n'importe quel site, quel que soit son plan.

### Implémentation

| Couche            | Fichier                                                               | Changement                                                                                   |
| ----------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| DB                | `migrations/add-feature-overrides.sql`                                | Colonne `feature_overrides JSONB DEFAULT '{}'` sur `sites`                                   |
| Server types      | `types/index.ts`                                                      | `feature_overrides?: Record<string, boolean>` sur `Site`                                     |
| Server controller | `sites.controller.ts`                                                 | `updateSite` accepte `feature_overrides` **uniquement si `req.user.role === 'super_admin'`** |
| Server middleware | `require-site-tier.ts`                                                | `hasFeatureOverride()` + paramètre optionnel `featureKey` sur `requireSiteTier()`            |
| Dashboard model   | `models/index.ts`                                                     | `feature_overrides?: Record<string, boolean>` sur `Site`                                     |
| Dashboard gate    | `feature-gate.service.ts`                                             | `canAccess()` vérifie `feature_overrides` **avant** le tier                                  |
| Dashboard UI      | `site-settings-tab.component`                                         | Section "Overrides de features" avec toggles, `*ngIf="isSuperAdmin"`                         |
| Propagation       | `site-detail` → `site-content-tab` → `config-editor` → `loop-manager` | Nouvel `@Input() featureOverrides` à chaque niveau                                           |

### Invariants vérifiés par smoke tests

5 nouveaux smoke tests (section feature overrides dans `smoke.test.ts`) :

1. `FeatureGateService.canAccess` — vérifie overrides avant tier, retourne `true` si override actif.
2. `requireSiteTier` — exporte `hasFeatureOverride`, accepte `featureKey` optionnel.
3. `updateSite controller` — extrait `feature_overrides`, gardé par `super_admin`.
4. `loop-manager` — `@Input() featureOverrides` + passage à `canAccess`.
5. `site-settings-tab` — UI gardée par `isSuperAdmin`, `saveFeatureOverrides`, `AuthService`.

## Cleanup ultérieur (hors scope)

Une PR dédiée (post-stabilisation) devra :

1. `UPDATE sites SET subscription_plan='club' WHERE subscription_plan='standard'` + `trial` → `play`.
2. Retirer `trial` et `standard` du `CHECK` et des enums.
3. Renommer `pitch-deck-metrics.sql` : `standard_count` → `club_count`, ajouter `pro_count`.
4. Renommer classes CSS `.plan-standard` → `.plan-club` dans `plan-badge` + `subscriptions-management`.
5. Mettre à jour labels UI (`getPlanLabel`) avec la nouvelle terminologie.
6. Mettre à jour `metrics.service.ts` Prometheus gauge labels.
7. Mettre à jour les tests `subscription.service.test.ts` et `billing.service.ts` default.
