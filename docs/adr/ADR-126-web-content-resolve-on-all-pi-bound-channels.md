# ADR-126 : Résolution web-content (ADR-103) sur TOUS les canaux Pi-bound

**Date** : 2026-05-14
**Statut** : Accepté
**Format** : Léger

---

## Contexte

ADR-103 introduit les entrées `web_page` / `livestream` stockées en DB avec
un `filename` synthétique (`web_page-<ts>`). Tout serveur qui sert une config
à un consommateur (TV Pi, navigateur SaaS, Remote V2) doit réécrire ces
entrées en `{ path: external_url, contentType, type: text/html, ... }` AVANT
envoi, sinon le filtre défensif TV-side (Phase 0.5) drop les entrées
synthétiques et la page ne s'affiche jamais.

Cette résolution était câblée dans `saas.controller.ts` et
`remote.controller.ts` mais **PAS** dans les builders Pi-bound
`buildEnrichedNeoProContent` et `sendSyncProfilesToSite` de
`profile-sync.service.ts`. Conséquence : pour un site **Pi**, ajouter une
page web (Scorenco) dans une catégorie depuis le dashboard → invisible TV

- 404 dashboard preview. Découvert sur Gymnase Mangin-Beaulieu 2026-05-14.

## Décision

Centraliser la chaîne `collectSyntheticWebContentFilenames →
findWebContentByFilenames → resolveSyntheticWebContent →
stripSyntheticWebContent` dans un helper unique
`resolveAndStripWebContent(config, logContext)` exposé depuis
`profile-sync.service.ts`, appelé par les deux builders Pi-bound. Le helper
suit le même ordre que `saas.controller.ts:303-319`. Ordre critique côté Pi :
appelé AVANT `normalizeConfigVideoPaths` (sinon un synthétique nu tombe dans
le pattern legacy `videos/default/` et casse la résolution).

Côté dashboard, propager `contentType` / `externalUrl` jusqu'aux entrées
config (via helper `applyVideoSelection`) et utiliser un placeholder (🌐 ou
iframe sandbox) au lieu d'un `<video src=FTP>` pour les rows web_page —
sinon le rendering preview tape une URL FTP qui n'existe pas.

## Alternatives rejetées

- **Câbler `resolveSyntheticWebContent` à l'intérieur de
  `enrichConfigWithAnalyticsMetadata`** : rejeté car ces deux étapes ont des
  responsabilités distinctes (métadonnées vs réécriture path/type) et
  fusionner les rend illisibles ; coût zéro à les garder séparées.
- **Stocker la forme résolue dès l'insert en DB** (path = external_url,
  type = text/html) : rejeté car ADR-103 a délibérément choisi le format
  synthétique pour permettre une mise à jour centralisée de l'URL externe
  sans toucher à toutes les configs des sites. Préserver l'invariant.
- **Reposer sur le strip Pi-side comme seul garde-fou** : rejeté car ça
  garantit silencieusement l'invisibilité (la page n'apparaît jamais sur la
  TV), au lieu de la corriger.

## Conséquences

- ✅ Toute future feature qui pousse une config au Pi (nouveau builder,
  CRON, command) hérite automatiquement de la résolution via le helper
  partagé — pas de divergence entre canaux.
- ✅ SPEC `docs/specs/features/web-live-content.spec.md` documente la
  matrice des 4 canaux (SaaS, Cloud Remote, Pi `update_config`, Pi
  `sync_profiles`).
- ⚠️ Pas de smoke test dédié dans cette PR — la couverture vient
  indirectement via les smokes existants `smoke-web-content-adr103-phase*`.
  Un smoke `smoke-pi-bound-web-content-resolve.test.ts` ciblé serait utile
  pour figer l'invariant ; à ajouter en follow-up si une régression revient.

## Fichiers impactés

- `central-server/src/services/profile-sync.service.ts` — ajout helper
  `resolveAndStripWebContent` + 2 call sites
- `central-dashboard/src/app/.../site-content-tab.component.ts` —
  `rebuildUnifiedVideoOptions` utilise `externalUrl` pour les paths
  web_page/livestream
- `central-dashboard/src/app/.../config-editor.component.ts` +
  `loop-manager.component.ts` — helper `applyVideoSelection` écrit la
  bonne forme à la sélection
- `central-dashboard/src/app/.../video-detail-panel.component.html` +
  `video-preview-modal.component.html` — placeholder / iframe pour
  `contentType: web_page`
- `docs/specs/features/web-live-content.spec.md` — section « Résolution
  synthétique → forme runtime »
