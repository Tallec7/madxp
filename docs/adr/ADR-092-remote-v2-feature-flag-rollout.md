# ADR-092: Télécommande V2 — rollout par feature flag per-site avec rollback instantané

**Date** : 2026-04-24
**Statut** : Accepté
**Format** : Léger

---

## Contexte

La télécommande V1 (`RemoteComponent`, ~1800 lignes HTML + orchestrateur TS) est mûre
mais l'UX 2026 pivote vers un design hero-centric (V7 POC dans `.claude/preview/v7/`).
Un rewrite complet in-place serait risqué : la V1 est utilisée par la flotte prod (Pi)
et par les sites SaaS. Il faut pouvoir déployer la V2 à un sous-ensemble de clubs,
mesurer, et revenir à la V1 en < 10 secondes si un bug bloque un match.

## Décision

Introduire un **composant dispatcher `RemoteHostComponent`** monté sur la route
`/remote`, qui choisit V1 ou V2 selon cette chaîne de priorité :

1. **Query param** `?v2=1` / `?v2=0` — override local persisté en localStorage
   (kill switch utilisateur final sans redéploiement).
2. **localStorage** `neopro_remote_v2_override` — persistance de l'override entre
   sessions pour faciliter les tests sur le terrain.
3. **Feature flag cloud** `remote_v2` dans `sites.feature_overrides` (JSONB) —
   source de vérité pilotée depuis le dashboard super_admin.
4. **Fallback V1** sinon.

Le flag `remote_v2` réutilise l'infrastructure `feature_overrides` existante
(ADR-039 Phase 3) : expose via `GET /saas/:siteId/config` → `featureOverrides`,
consommé par `SaasConfigService.isFeatureEnabled('remote_v2')` côté Angular.

La V2 (`RemoteV2Component`) vit dans un répertoire isolé
`raspberry/src/app/components/remote-v2/` et réutilise les services scoped V1
(`RemoteScoreService`, `RemoteTimerService`, `RemotePreferencesService`,
`LocalOptionsService`). **Aucune modification** du `RemoteComponent` V1 : rollback
= un toggle dashboard + reload navigateur.

## Alternatives rejetées

- **A/B in-place via `*ngIf` dans RemoteComponent** : rejeté car pollue la V1 avec
  des branches V2, double la complexité d'un composant déjà de 942 lignes, et
  rend le rollback non atomique.
- **Canary par subscription_plan** : rejeté car la V2 est beta cross-tier — le
  target n'est pas un segment commercial mais un set de clubs volontaires.
- **Feature flag global via env var** : rejeté car empêche un pilotage per-site
  (un club peut vouloir V2 pendant qu'un autre reste V1).
- **Nouveau endpoint `/remote-v2`** : rejeté car casserait les liens/bookmarks
  existants et les intégrations externes qui pointent sur `/remote`.

## Conséquences

- **Rollback < 10s** : décocher `Télécommande V2 (beta)` dans Settings site +
  demander au club de rafraîchir la page. Ou `?v2=0` en URL si besoin immédiat.
- **Coût opérationnel** : maintenir temporairement 2 composants remote. Acceptable
  car la V1 est figée (pas de nouvelles features), seul le bugfix critique
  s'applique aux deux.
- **Coût cognitif** : un nouveau dispatcher à comprendre. Mitigé par le fait que
  `RemoteHostComponent` fait 60 lignes et a une seule responsabilité.
- **Observabilité** : le dashboard super_admin voit en un clic quels sites sont
  en V2 via le toggle. Pour le suivi télémétrique fin, prévoir un compteur
  Prometheus `neopro_remote_variant_selected_total{variant=v1|v2}` si le rollout
  s'étale.

## Fichiers impactés

- `central-server/src/controllers/saas.controller.ts` — expose `featureOverrides`
  dans `getSaasConfig` et `getSaasProfileConfig`.
- `raspberry/src/app/services/saas-config.service.ts` — stocke
  `featureOverrides`, expose `isFeatureEnabled(key)` et `getFeatureOverrides()`.
- `central-dashboard/src/app/core/services/feature-gate.service.ts` — ajoute
  `'remote_v2'` à `FeatureKey` (tier `club`, activation par override).
- `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts`
  — ajoute la ligne de toggle dans `availableFeatures`.
- `raspberry/src/app/components/remote/remote-host.component.ts` (nouveau) —
  dispatcher V1/V2 avec résolution en 4 étapes.
- `raspberry/src/app/components/remote-v2/remote-v2.component.{ts,html,scss}`
  (nouveaux) — scaffold V7 UI réutilisant les services scoped V1.
- `raspberry/src/app/app.routes.ts` — route `/remote` → `RemoteHostComponent`.
- `central-server/__tests__/smoke/smoke-remote-v2-feature-flag.test.ts` (nouveau)
  — smoke enforçant le contrat cross-composant (feature flag exposé, toggle
  dashboard présent, dispatcher non retiré).

## Rollback runbook

1. **Rollback per-site** : Dashboard → Site → Settings → Feature Overrides →
   décocher **Télécommande V2 (beta)** → Sauvegarder. Le club doit rafraîchir.
2. **Rollback utilisateur immédiat** : ajouter `?v2=0` à l'URL `/remote`. Persiste
   en localStorage pour les visites suivantes.
3. **Rollback global** : retirer `remote_v2` de `FEATURE_TIERS` côté dashboard
   (masque le toggle) + `UPDATE sites SET feature_overrides = feature_overrides - 'remote_v2';`
   côté DB. Les clubs en V2 tombent automatiquement sur V1 au prochain reload.
