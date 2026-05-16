# ADR-123 : Templates Studio V1 — modèle de partage et distribution multi-sites

**Date** : 2026-05-14
**Statut** : Accepté
**Format** : Léger

---

## Contexte

V1 du Templates Studio (PR #984+) avait été câblé "1 site = 1 brand kit + 1 roster + renders privés", forçant `studio_players.site_id NOT NULL` et bloquant l'endpoint render-requests pour tout user sans `site_id` sur son JWT (= tous les internal roles : `super_admin`, `admin`, `operator`).

La réalité métier exposée pendant le testing :

1. Un **joueur** peut être réutilisable sur plusieurs sites (mutualisation, transfert, ou tests par un super_admin).
2. Un **render produit** (MP4/PNG) doit pouvoir être téléchargé localement OU poussé dans la bibliothèque vidéo de N sites (Pi ou SaaS).
3. Le **brand kit** reste 1-par-site (chaque club a son identité unique) — le render utilise le brand kit du site choisi pour le rendu.

Pattern existant à réutiliser : `video_club_grants` (ADR-082) qui découple un asset admin global de N clubs consommateurs via une table pivot.

## Décision

Aligner Templates Studio V1 sur le pattern **asset global + grants explicites multi-sites** déjà en place pour les vidéos admin (ADR-082).

**Players (PR #1002)** :

- `studio_players.site_id` devient **NULLABLE** : `NULL` = joueur global créé par super_admin/operator, non-NULL = joueur créé par un user club, scopé à son site.
- Nouvelle table pivot `studio_player_site_grants(player_id, site_id, granted_by, granted_at)` pour octroyer un joueur global à des sites spécifiques.
- `playerRepository.findVisibleForSite(siteId)` retourne `WHERE site_id = $1 OR id IN (SELECT player_id FROM studio_player_site_grants WHERE site_id = $1)`.
- API : `POST /api/templates-studio/players/:playerId/grants` (super_admin/admin/operator only) — pattern identique aux video grants.

**Distribution renders (PR #1003)** :

- Nouveau endpoint `POST /api/templates-studio/render-requests/:id/distribute` exposé après `status='ready'`.
- Body `{ mode: 'push' | 'grant', site_ids: string[], category? }`.
  - `'push'` : crée 1 row `videos` par site cible (`uploaded_for_site_id = site_id`), idempotent via `findByStoragePathForSite`.
  - `'grant'` : crée 1 row `videos` globale (`uploaded_for_site_id = NULL`) + N grants `video_club_grants` (réutilise `videoClubGrantRepository.addGrant`, idempotent par `ON CONFLICT DO NOTHING`).
- Modal Angular standalone `DistributeRenderModalComponent` couvre les 3 cas : téléchargement direct (URL FTP), push direct N sites, asset global + grants.

**Site picker (PR #998 — pré-requis)** :

- Composant partagé `SitePickerComponent` + service de contexte `TemplatesStudioContextService` exposent `activeSiteId` (JWT pour club user, picker dropdown pour internal roles, persisté localStorage).
- Variante de route `POST /api/templates-studio/sites/:siteId/render-requests` pour les internal roles, sécurisée par `requireClubScope` qui bypass les internal roles.

## Alternatives rejetées

- **Garder `site_id NOT NULL` + duplication des joueurs** : rejeté car explosion combinatoire (mêmes 5 joueurs × 50 clubs = 250 rows à maintenir manuellement) et casse la dédup pour les sponsor reports.
- **Renderer N variants automatiquement (1 par site cible)** : rejeté pour V1 car coût infrastructure (multiplie le nombre de jobs) et complexifie le UX. À reconsidérer en V2 si demande client.
- **Nouvelle table `studio_render_distribution`** : rejeté car redondant — `videos` + `video_club_grants` couvrent déjà le besoin et bénéficient de tout le pipeline existant (Pi sync-agent, ownership guards, déploiements).

## Conséquences

**Positives** :

- Réutilisation de l'infra grants existante (zéro nouvelle table côté distribution).
- Tenant guard `requireClubScope` reste la garde unique (defense-in-depth préservé).
- Un super_admin peut créer un roster de joueurs réutilisables à travers la flotte sans duplication.
- Distribution post-render rend chaque MP4/PNG immédiatement consommable par les sites cibles via le pipeline `videos` standard.

**Négatives / risques** :

- 4 fonctions append-only sur `templates-studio.controller.ts` ont créé un risque de conflits PR (résolus, mais traceur futur : fichier devenu plus gros, à surveiller pour décomposition si dépassement >1000 lignes).
- Pas de UI dédiée pour révoquer en masse les grants player (lookup individuel par player) — acceptable V1 vu le volume attendu.

## Fichiers impactés

**Migration + schéma** :

- `central-server/src/scripts/migrations/add-studio-player-global-grants.sql` — `ALTER` site_id NULLABLE + table pivot + index
- `central-server/src/scripts/full-schema.sql` — backport snapshot

**Backend** :

- `central-server/src/repositories/templates-studio.repository.ts` — `findVisibleForSite`, `findGlobal`, `addGrant`, `removeGrant`, `listGrants`, `listGrantedSites`
- `central-server/src/repositories/video.repository.ts` — `findByStoragePathForSite` (idempotence distribution)
- `central-server/src/controllers/templates-studio.controller.ts` — handlers `listGlobalPlayers`, `createGlobalPlayer`, `addPlayerGrant`, `removePlayerGrant`, `listPlayerGrants`, `distributeRender`
- `central-server/src/routes/templates-studio.routes.ts` — routes grants + distribute
- `central-server/src/middleware/validation.ts` — schémas Joi `addPlayerGrant`, `distributeRender`

**Frontend** :

- `central-dashboard/src/app/features/templates-studio/templates-studio.service.ts` — méthodes parallèles
- `central-dashboard/src/app/features/templates-studio/templates-studio.types.ts` — `is_global`, `RenderDistributionInput/Result`
- `central-dashboard/src/app/features/templates-studio/players/players.component.{ts,html,scss}` — toggle global + badge + modal grants
- `central-dashboard/src/app/features/templates-studio/shared/distribute-render-modal.component.ts` — nouveau composant standalone
- `central-dashboard/src/app/features/templates-studio/studio/studio.component.{ts,html}` — bouton "Distribuer" sous le player

**Smoke** :

- `central-server/src/__tests__/smoke/smoke-templates-studio-distribute.test.ts` — 20 nouveaux tests (file-based + comportement)
- `central-server/src/__tests__/smoke/smoke-templates-studio-dashboard.test.ts` — assertions UI mises à jour
- 143 tests verts au total dans la suite `smoke-templates-studio`.

## Référence

- [ADR-082](ADR-082-video-club-grants.md) — Pattern source des grants admin → clubs
- [ADR-118](ADR-118-studio-render-server-deployment.md) — Container Railway studio-render-server
- [STUDIO_V1.md](../../studio-template/templates-remotion/spec/STUDIO_V1.md) — Spec V1 (sibling repo)
- ~~docs/specs/features/templates-studio.spec.md~~ — SPEC V2 supprimée en ADR-129 (V1 spec : `STUDIO_V1.md` sibling repo)
- PRs : #998 (site picker), #1002 (players globaux + grants), #1003 (distribution renders)
