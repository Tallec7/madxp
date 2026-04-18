# ADR-064: Hiérarchie canonique Video / VideoView (composition)

**Date** : 2026-04-18
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le dashboard Angular hébergeait **5 interfaces `Video` parallèles** (core/models, content-management, sponsor-video-data, video-library, cloud-remote-navigation), chacune avec un sous-ensemble différent de champs en snake_case ou camelCase. Conséquences : conversions manuelles dispersées, casts implicites, drift entre vues, et risque de régression à chaque ajout de champ.

Phase 2 du chantier `video-deploy-unification` (frontend uniquement — le backend est déjà propre).

## Décision

Une seule hiérarchie rooted dans `central-dashboard/src/app/core/models/video.model.ts` :

- **`Video`** — DTO canonique snake_case, miroir 1:1 de la row DB (15 champs)
- **`VideoView`** — base UI camelCase (~10 champs essentiels) que les composants consomment
- **`mapVideoRowToView(row: Video): VideoView`** — point unique de conversion snake_case ↔ camelCase

Les types DTO dont la forme diverge réellement de `Video` (endpoints qui ne renvoient pas la row complète) sont **renommés explicitement** plutôt que de polluer `Video` avec des champs optionnels :

- `ContentVideoRow` (`/api/videos` admin)
- `SponsorVideoRow` (`/api/videos` sélecteur sponsor)
- `RemoteVideoEntry` (node de navigation télécommande, pas une row DB)

`VideoItem` (vue site) `extends VideoView` et n'ajoute que les champs Pi/owner/config-spécifiques.

## Alternatives rejetées

- **Interface `Video` monolithique avec 30+ champs optionnels** : rejeté car n'importe quel `video.field?` devient ambigu (absent vs vraiment null), et le compilateur ne protège plus contre les oublis.
- **Garder les 5 interfaces et juste documenter** : rejeté car le drift continuerait à chaque PR — pas d'enforcement.
- **Génération auto depuis le schéma Postgres** : rejeté pour cette phase (pas d'outillage Supabase types en place côté dashboard, à reconsidérer plus tard).

## Conséquences

- ✅ Un seul endroit où ajouter un champ DB (puis décider explicitement s'il remonte dans `VideoView`).
- ✅ Conversion snake_case ↔ camelCase localisée (`mapVideoRowToView`).
- ✅ DTOs nommés selon leur usage (`ContentVideoRow`, `SponsorVideoRow`, `RemoteVideoEntry`) — la lecture du code dit immédiatement "ce n'est pas la row canonique".
- ⚠️ Renommages = touch sur ~11 fichiers ; smoke test architectural ajouté pour empêcher le retour à l'état précédent (voir `smoke-dashboard-guards.test.ts > Canonical Video / VideoView hierarchy guard`).

## Fichiers impactés

- `central-dashboard/src/app/core/models/video.model.ts` — nouveau, point d'entrée
- `central-dashboard/src/app/core/models/index.ts` — re-export `Video`, `VideoView`, `mapVideoRowToView`
- `central-dashboard/src/app/features/sites/components/video-library/video-library.types.ts` — `VideoItem extends VideoView`
- `central-dashboard/src/app/features/content/content-management-data.service.ts` — `Video` → `ContentVideoRow`
- `central-dashboard/src/app/features/advertisers/sponsor-video-data.service.ts` — `Video` → `SponsorVideoRow`
- `central-dashboard/src/app/features/remote/services/cloud-remote-navigation.service.ts` — `Video` → `RemoteVideoEntry`
- `central-server/src/__tests__/smoke/smoke-dashboard-guards.test.ts` — guard architectural anti-régression
