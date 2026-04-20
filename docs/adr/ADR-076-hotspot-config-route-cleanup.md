# ADR-076: Hotspot config — route cleanup post-ADR-074

**Date** : 2026-04-20
**Statut** : Accepté
**Format** : Léger

---

## Contexte

ADR-074 a introduit la route Pi `GET /api/sites/:id/hotspot-config` authentifiée via `authenticateSiteApiKey` (Bearer api_key du site). Une route héritée du même chemin existait déjà dans `sites.routes.ts`, protégée par JWT + `requireRole('admin', 'operator')` et servant à interroger le Pi en direct via `dispatchCommand('get_hotspot_config')`. Comme `sitesRoutes` est monté avant `hotspotConfigRoutes` dans `server.ts`, Express résout la collision en faveur de la route legacy, ce qui renvoyait les sync-agents Pi en 401 lors de leur bootstrap auto.

## Décision

Supprimer la route legacy et son controller `getHotspotConfig` de `site-debug.controller.ts`, puis libérer le chemin `/hotspot-config` pour le Pi. Le dashboard admin passe désormais par un endpoint dédié `GET /api/sites/:id/hotspot-config/admin-view` qui lit le PSK canonique directement depuis la DB cloud (`hotspotConfigRepository`), sous `authenticate` + `requireRole('admin', 'operator')`. Cela aligne l'architecture avec ADR-074 (cloud = source unique) et supprime la dépendance à une connexion Pi active pour afficher la config hotspot.

## Alternatives rejetées

- **Renommer la route Pi** (`/hotspot-psk`) : rejeté car le sync-agent déjà déployé en flotte utilise `/hotspot-config` ; casser ce contrat nécessiterait une coordination OTA complexe.
- **Inverser l'ordre des mounts dans `server.ts`** : rejeté car fragile (dépendance implicite à l'ordre de déclaration, piège à régression) et laisse un controller legacy inutile.

## Conséquences

- Le dashboard admin voit la config hotspot même quand le Pi est offline (cloud canonique).
- Les colonnes Pi live `isActive` et `channel` ne sont plus exposées par cette route — elles n'étaient pas fiables via la chaîne Socket.IO de toute façon. Si un diagnostic Pi live est requis à l'avenir, créer une route explicite `/hotspot-live-status`.
- Smoke test ajouté pour bloquer toute réintroduction d'un middleware JWT sur la route Pi `/:id/hotspot-config`.

## Fichiers impactés

- `central-server/src/routes/sites.routes.ts` — suppression de la route legacy.
- `central-server/src/routes/hotspot-config.routes.ts` — ajout de `/admin-view`.
- `central-server/src/controllers/site-debug.controller.ts` — suppression de `getHotspotConfig`.
- `central-server/src/controllers/sites.controller.ts` — retrait du re-export.
- `central-server/src/controllers/hotspot-config.controller.ts` — ajout de `getHotspotConfigAdminView`.
- `central-dashboard/src/app/core/services/site-metrics.service.ts` — nouveau path + shape `{ ssid, psk, rotatedAt }`.
- `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-data.service.ts` — interface `HotspotConfigResponse` simplifiée.
- `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts` — lecture `response.psk` au lieu de `response.password`.
- `central-server/src/__tests__/smoke/smoke-hotspot-psk.test.ts` — smoke test de régression route auth.
- `.claude/rules/api-routes.md` — mise à jour de la doc.
