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

## Cleanup ultérieur (hors scope)

Une PR dédiée (post-stabilisation) devra :

1. `UPDATE sites SET subscription_plan='club' WHERE subscription_plan='standard'` + `trial` → `play`.
2. Retirer `trial` et `standard` du `CHECK` et des enums.
3. Renommer `pitch-deck-metrics.sql` : `standard_count` → `club_count`, ajouter `pro_count`.
4. Renommer classes CSS `.plan-standard` → `.plan-club` dans `plan-badge` + `subscriptions-management`.
5. Mettre à jour labels UI (`getPlanLabel`) avec la nouvelle terminologie.
6. Mettre à jour `metrics.service.ts` Prometheus gauge labels.
7. Mettre à jour les tests `subscription.service.test.ts` et `billing.service.ts` default.
