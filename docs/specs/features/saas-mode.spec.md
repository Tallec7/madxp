# SPEC : SaaS & Club Portal

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-27
> **ADR liés** : ADR-005 (RLS multi-tenant), ADR-037 (archi SaaS), ADR-038 (temps réel + observabilité), ADR-039 (tiers), ADR-040 (dashboard insights + tendances), ADR-059 (state-sync SaaS), ADR-069 (delivery strategy), ADR-088 (scoreboard SaaS-first), ADR-096 (extraction SaaS relay), ADR-102 (persistance DB des préférences UX télécommande par site/profil — amend ADR-062)
> **Smoke tests** : `smoke-saas.test.ts`, `smoke-socket-realtime.test.ts`, `smoke-scoreboard-saas.test.ts`, `smoke-remote-preferences-db.test.ts`
> **`.claude/rules/` lié** : `saas.md` (73 règles ADR-037)

## En une phrase

Le mode SaaS permet à un club d'utiliser Neopro **sans hardware Raspberry Pi** — la TV affiche une page web cloud, la télécommande pilote tout via Socket.IO, et le portail club offre insights d'activité, diagnostic, gestion de la boucle et des sponsors.

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
- **Gestion boucle** : le club peut réordonner, activer/désactiver ses vidéos via `club-loop.component.ts` sans passer par l'admin Neopro.
- **Sponsors actifs** : `club-sponsors.component.ts` affiche les sponsors `status='active'` avec logos, impressions semaine et lien vers le portail sponsor.

### Tiers d'abonnement (ADR-039)

- **Play** (790€/an) : SaaS web, 25 vidéos max, 1 profil, télécommande cloud
- **Club** (1500€/an) : Pi + tout Play + illimité + hors-ligne + multi-profils
- **Pro** (2100€/an) : tout Club + sponsors monétisés + rotation pondérée + rapports
- **Premium** (3000€/an) : tout Pro + templates vidéo + double écran + analytics complètes

## Comportements observables

| Règle                | Comment on vérifie                                                       |
| -------------------- | ------------------------------------------------------------------------ |
| `site_type` respecté | Smoke `noLegacySaasShortCircuit` : résolution via strategy registry      |
| Relai SaaS actif     | Smoke `saas-relay.handler` : 14 patterns de rebroadcast                  |
| Config rechargée     | Browser TV reçoit `saas-config-updated` → `GET /api/saas/:siteId/config` |
| Master-slave         | Logs `SaaS TV registered` + `SaaS TV promoted to master` au disconnect   |
| Insights trends      | Dashboard club : badges ↑/→/↓ sur 3 KPI vs hier/semaine                  |
| Empty state hint     | Club sans activité voit le CTA `club/loop`                               |
| Diagnostic           | Composant `club-diagnostic` affiche connexion + alertes actives          |

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
