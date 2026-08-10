# SPEC : SaaS & Club Portal

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-06-12
> **last_verified** : 2026-08-10
> **verified_against_commit** : 64b8f2487
> **ADR liés** : ADR-005 (RLS multi-tenant), ADR-037 (archi SaaS), ADR-038 (temps réel + observabilité), ADR-039 (tiers), ADR-040 (dashboard insights + tendances), ADR-059 (state-sync SaaS), ADR-069 (delivery strategy), ADR-088 (scoreboard SaaS-first), ADR-096 (extraction SaaS relay), ADR-102 (persistance DB des préférences UX télécommande par site/profil — amend ADR-062), ADR-105 (preview TV via iframe local-first, mode `?preview=1`), ADR-116 (baseline diff `previewConfigDiff` = profil édité pas mirror Pi + fix accumulation catégories lors du switch de profil), ADR-133 (rebrand NEOPRO → MadXP — impact branding portail SaaS, futur domaine `madxp.kalonpartners.bzh`)
> **Smoke tests** : `smoke-saas.test.ts`, `smoke-socket-realtime.test.ts`, `smoke-scoreboard-saas.test.ts`, `smoke-remote-preferences-db.test.ts`
> **`.claude/rules/` lié** : `saas.md` (73 règles ADR-037)

## En une phrase

Le mode SaaS permet à un club d'utiliser MadXP **sans hardware Raspberry Pi** — la TV affiche une page web cloud, la télécommande pilote tout via Socket.IO, et le portail club offre insights d'activité, diagnostic, gestion de la boucle et des sponsors.

## Acteurs impliqués

- **Club** (staff / président / resp partenaires) : pilote la TV SaaS via télécommande + consulte son portail
- **Super admin / Operator** : provisonne le site et définit le tier d'abonnement
- **Annonceur / Agence** : pousse des vidéos sur N sites SaaS cochés
- **TV browser** : consomme la config et les vidéos (anonyme, RLS ADR-005 : un club ne voit que ses propres données)

## Périmètre (ce que ce domaine couvre)

- **Services backend** :
  - `central-server/src/handlers/saas-relay.handler.ts` (relai Remote ↔ TV via Socket.IO)
  - `central-server/src/services/delivery/saas-direct.strategy.ts` (déploiement direct FTP → URL)
  - `central-server/src/controllers/saas-config.controller.ts` (config GET)
  - `central-server/src/controllers/site-fleet.controller.ts` → `getSiteDashboardData` (insights club)
- **Composants UI (Club Portal)** :
  - `central-dashboard/src/app/features/club-portal/club-dashboard.component.ts` (KPI + tendances ADR-040)
  - `central-dashboard/src/app/features/club-portal/club-diagnostic.component.ts` (santé Pi/SaaS distance)
  - `central-dashboard/src/app/features/club-portal/club-loop.component.ts` (gestion boucle club)
  - `central-dashboard/src/app/features/club-portal/club-sponsors.component.ts` (sponsors actifs club)
  - `central-dashboard/src/app/features/saas/` (TV browser + Remote SaaS)
- **Routes API** :
  - `GET /api/saas/:siteId/config` (config TV read-only)
  - `GET /api/sites/:siteId/dashboard` (insights ADR-040)
- **Tables DB** : `sites.site_type`, `site_sponsors`, `video_plays`, `club_sessions`
- **ADR** : ADR-005, ADR-037, ADR-038, ADR-039, ADR-040, ADR-059, ADR-069, ADR-088, ADR-096
- **Smoke tests** : `smoke-saas.test.ts`, `smoke-socket-realtime.test.ts`
- **`.claude/rules/`** : `saas.md`

## Règles métier (ce qui DOIT marcher)

### Architecture SaaS

- **`site_type` est la source de vérité** : `'pi'` (matériel), `'saas'` (navigateur), `'demo'` (vitrine). Un site est exclusivement de UN type — pas de migration runtime.
- **Delivery strategy centrale** : `deliveryStrategyRegistry.resolve(site)` → `SaasDirectStrategy` pour SaaS, `PiSocketStrategy` pour Pi. Jamais de `if site_type === 'saas'` dispersé.
- **Relai temps réel** : Remote envoie `command` → `saas-relay.handler` → broadcast `action` à la room `siteId`. Sans ce relai, les TVs SaaS sont muettes.
- **Config read-only** : TV browser fait `GET /api/saas/:siteId/config` → receoit `saas-config-updated` → re-pull. Pas d'écriture locale côté client.
- **État in-memory** : `saasStates` Map par `siteId` (score, phase, timer, master-slave). Perdu au reboot — acceptable, client re-pull via `request-state`.

### Club Portal (ADR-040)

- **Insights dashboard** : 4 KPI + tendances vs hier/semaine précédente (±3% num, ±2pts completion), sparkline SVG 7j, top 3 vidéos semaine, profil actif, sponsors actifs.
- **Empty state hint** : si aucune activité (`todayVideosPlayed === 0`), afficher CTA → `club/loop` pour onboarder le club.
- **Diagnostic distance** : `club-diagnostic.component.ts` expose l'état de santé du site (Pi ou SaaS) depuis le cloud — connexion, version, alertes actives, dernière OTA.
- **Gestion boucle** : le club peut réordonner, activer/désactiver ses vidéos via `club-loop.component.ts` sans passer par l'admin MadXP.
- **Sponsors actifs** : `club-sponsors.component.ts` affiche les sponsors `status='active'` avec logos, impressions semaine et lien vers le portail sponsor.
- **Gestion des variantes LED/secondaires** : un compte `club` peut créer/éditer/supprimer les variantes (LED périmétrique, écran secondaire) de **ses propres vidéos** depuis le portail, sans passer par un opérateur MadXP. Les 6 routes `/videos/:id/variants*` acceptent le rôle `club` avec un **garde-fou d'ownership côté API** (`content-variant.controller.ts`) : `uploaded_for_site_id === user.site_id` (vidéo parente), vidéo source ownée OU NEOPRO OU grantée (ADR-082), export LED restreint au propre site du club. Les vidéos NEOPRO corporate restent read-only. Avant ce garde-fou, le `requireRole('admin','operator')` rejetait tout club en 403 « Rôle requis: admin ou operator » (incident Piraths Strasbourg 2026-06-12).
- **Permissions granulaires « Accès club » (enforced)** : le panneau `club-access-tab` (table `club_permissions`, 6 clés `view_status` / `view_content` / `upload_video` / `edit_loop` / `manage_sponsors` / `view_analytics`) est **effectif** côté API via le middleware `requireClubPermission(key)` ([auth.ts](../../central-server/src/middleware/auth.ts)). Invariants : (1) le middleware ne gate **que** le rôle `club` (pass-through pour tous les autres rôles, sinon advertiser/agency/viewer casseraient sur les routes partagées) ; (2) `createSite` **doit** appeler `clubPermissionRepository.seedDefaults()` (les 6 permissions activées) — un site sans ligne `club_permissions` bloquerait son club sur toutes les routes gardées ; (3) décocher une case retire la ligne (`setPermissions` = replace) → 403 « Permission manquante » sur les routes correspondantes. Mapping : `upload_video` → POST/PUT/DELETE vidéos + image-to-video + web-content + upload de variantes ; `edit_loop` → déploiements + PUT config + variantes from-video/layout/export/sides ; `view_*` → lectures contenu/statut/analytics du portail ; `manage_sponsors` → CRUD sponsors du site (routes `/:siteId/sponsors*` ouvertes au club, ownership garanti par le check `sponsor.site_id !== siteId` dans le controller). Avant ce câblage, le panneau était **décoratif** (middleware défini mais branché sur 0 route).
  - **Bypass `requireRole` GET-only + écritures club explicites (sécurité 2026-06-12)** : le bypass club de [`requireRole`](../../central-server/src/middleware/auth.ts) (`role==='club'` + param `:siteId`/`:id` === `user.site_id`) est restreint aux **GET**. Sans cette restriction (bug d'origine : le code ne testait pas `req.method` malgré le commentaire « GET only »), un club pouvait faire des **écritures admin sur son propre site** : `PUT /:siteId/club-permissions` (self-grant des 6 permissions → défait l'enforcement ci-dessus), `POST /:id/regenerate-key` (rotation api_key → casse son Pi), `POST /:id/command`, `DELETE /:id`. Invariants : (1) le bypass ne couvre QUE les GET ; (2) toute écriture club légitime passe par une route qui liste explicitement `'club'` dans `requireRole` **ET** un scope guard `requireClubScope((req) => req.params.siteId)` (le club ne peut écrire que sur SON site — `requireRole` ne scope PAS quand `'club'` est dans `allowedRoles`) **ET** le toggle `requireClubPermission` ; (3) la sauvegarde/le déploiement de boucle (`PUT /:siteId/profiles/:profileId/configuration`, `POST .../deploy`) et les routes draft (`PUT/DELETE /:siteId/draft`, `/draft/validate`, `/draft/deploy`) sont ouverts au club sous ce triptyque (clé `edit_loop`) ; (4) les routes sponsors (`/:siteId/sponsors*`) portent `requireClubScope` (anti cross-tenant — le `manage_sponsors` du club ne valide que SON site, jamais un `:siteId` arbitraire). Garde-fou : `smoke-saas-incident-2026-06-12`.
  - **Threading des `displays` côté portail** : `club-loop.component.ts` (Ma boucle) DOIT lire `site.displays` depuis `GET /sites/:id` et le passer en `[siteDisplays]` à `<app-site-content-tab>` (qui le propage jusqu'à `video-variant-panel`). Sans ça, `video-variant-panel.effectiveSiteDisplays` retombe sur un display virtuel `'secondary'`, et la création de variante échoue en **400 « display_type 'secondary' non déclaré pour ce site »** sur tout club configuré en LED (`led-banner`/`led-perimeter`) — incident Piraths 2026-06-12 (post-fix 403). Le `display_type` envoyé au back doit toujours provenir des écrans réellement déclarés du site.
  - **Tag `owner` des vidéos de boucle** : les entrées `timeCategories[].loopVideos[]` (et `categories[].videos[]`) DOIVENT porter un `owner`. `loop-manager.isNeoproVideo()` traite `owner !== 'club'` (ou absent) comme **NEOPRO read-only** → un club ne peut pas gérer la pondération/suppression d'une vidéo de boucle sans `owner: 'club'`. `applyVideoSelection` tague `owner = opt.isForThisSite ? 'club' : 'neopro'` à la sélection (une vidéo `uploaded_for_site_id === site` est au club ; les NEOPRO restent verrouillées — invariant `isNeoproVideo` préservé). L'existant (loopVideos sans owner) est corrigé par `npm run backfill:loop-video-owner` qui ne tague `'club'` que les filenames matchant un upload du site. Ce verrou est **indépendant** du feature gate `weighted_rotation` (ADR-039) et des permissions `club_permissions` — incident Piraths 2026-06-12 (cadenas pondération malgré tier premium + override).

### Tiers d'abonnement (ADR-039)

- **Play** (790€/an) : SaaS web, 25 vidéos max, 1 profil, télécommande cloud
- **Club** (1500€/an) : Pi + tout Play + illimité + hors-ligne + multi-profils
- **Pro** (2100€/an) : tout Club + sponsors monétisés + rotation pondérée + rapports
- **Premium** (3000€/an) : tout Pro + templates vidéo + double écran + analytics complètes

### Présence d'un site (« diffuse-t-il, maintenant ? »)

La présence se lit sur **deux sources différentes selon `site_type`**, et les confondre
inverse le signal :

- **Pi** : la Map `connectedSites` du socket service, alimentée uniquement par
  `authenticateAgent` (auth par clé API de l'agent).
- **SaaS** : les navigateurs `saas-tv` de la room du site (`getSaasClientCount`).
  Un site SaaS n'a pas d'agent — il **n'entre jamais** dans `connectedSites`.

Le repli sur les seuils `last_seen_at` (online < 90 s, warning < 180 s) **ne vaut que
pour les Pi** : côté SaaS, `last_seen_at` n'est posé qu'au `saas-register` et n'est
jamais rafraîchi (aucun heartbeat SaaS n'existe côté central — la TV émet
`player-state` toutes les 5 s, mais c'est un event LAN sans listener central).
S'en tenir aux seuils affichait « hors ligne » un club en pleine diffusion, trois
minutes après l'allumage de son écran.

Tout consommateur de présence passe par `resolveSitePresence()`
(`central-server/src/utils/site-presence.ts`) — jamais par `connectedSiteIds.has()`
directement. Les requêtes flotte doivent exposer `site_type`, sans quoi tout site
retombe silencieusement en logique Pi.

## Comportements observables

| Règle                | Comment on vérifie                                                                                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site_type` respecté | Smoke `noLegacySaasShortCircuit` : résolution via strategy registry                                                                                                                                                                                                         |
| Relai SaaS actif     | Smoke `saas-relay.handler` : 14 patterns de rebroadcast                                                                                                                                                                                                                     |
| Config rechargée     | Browser TV reçoit `saas-config-updated` → `GET /api/saas/:siteId/config`                                                                                                                                                                                                    |
| Master-slave         | Logs `SaaS TV registered` + `SaaS TV promoted to master` au disconnect                                                                                                                                                                                                      |
| Insights trends      | Dashboard club : badges ↑/→/↓ sur 3 KPI vs hier/semaine                                                                                                                                                                                                                     |
| Empty state hint     | Club sans activité voit le CTA `club/loop`                                                                                                                                                                                                                                  |
| Diagnostic           | Composant `club-diagnostic` affiche connexion + alertes actives                                                                                                                                                                                                             |
| Variantes club       | Smoke `smoke-saas` describe « video variant management » : routes `/variants*` ouvrent le rôle `club` + handlers gardent l'ownership (parente + source)                                                                                                                     |
| Présence SaaS        | Un club SaaS dont un écran navigateur est ouvert est `online` dans la santé flotte, quelle que soit l'ancienneté de `last_seen_at` ; il repasse `offline` à la fermeture du dernier onglet TV. Smoke `smoke-saas` describe « présence des sites SaaS dans la santé flotte » |
| Permissions enforced | Smoke `smoke-saas` describe « Club permissions enforcement » : `requireClubPermission` pass-through non-club, `createSite` seed defaults, routes contenu/sponsors/analytics portent la bonne clé                                                                            |

## Cas d'edge connus

- **TV browser en arrière-plan** : Chrome throttle les timers — scoreboard émet régulièrement pour forcer le réveil.
- **Bascule Pi → SaaS** : non supporté en runtime. Migration manuelle DB + suppression Pi de la flotte. Irréversible.
- **Connexion Internet club intermittente** : Socket.IO retry automatique. Pendant le downtime, dernier frame affiché (pas de mode dégradé prévu).
- **Saisie score depuis 2 onglets Remote parallèles** : `saasStates` Map, dernière écriture gagne (lock pas nécessaire — usage réel = 1 bénévole/onglet).
- **14 queries parallèles dans `getSiteDashboardData`** : acceptable, toutes indexées sur `site_id`.
- **Config > 100 vidéos** : payload GET config peut atteindre ~100 Ko — acceptable, pas de pagination prévue.

## Contraintes / NE PAS FAIRE

Voir `.claude/rules/saas.md` (73 règles). Règles métier spécifiques :

- Ne jamais écrire en `local_config_mirror` côté SaaS (client read-only).
- Ne jamais déployer via Socket.IO push pour un site SaaS (utiliser `SaasDirectStrategy`).
- Ne jamais retirer `registerSaasRelay` (sans lui, Remote SaaS → TVs muettes).

## Ce qui n'est PAS dans ce domaine

- **Mode hors-ligne SaaS** : antinomique avec "no hardware" → tier Club (Pi)
- **Streaming live RTMP** → roadmap LATER #10
- **Portail annonceur réseau** (multi-sites) → SPEC [Sponsors & Pubs](sponsors.spec.md)
- **Auth + session spectateur** sur la TV → roadmap (QR jeu, LATER #1)

## Évolutions possibles

- [ ] Service Worker côté browser TV pour cache offline minimal
- [ ] Métrique Prometheus `neopro_saas_tv_connected{site_id}`
- [ ] Migration `site_type` dans les 2 sens via UI admin (pour POC → conversion)
- [ ] Persistance `saasStates` en Redis pour survivre aux reboots
