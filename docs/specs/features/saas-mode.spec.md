# SPEC : SaaS Mode (TV sans Raspberry Pi)

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-25
> **Code principal** :
> - `central-server/src/handlers/saas-relay.handler.ts` (relai temps réel — ADR-096)
> - `central-server/src/services/delivery/saas-direct.strategy.ts` (déploiement direct — ADR-069)
> - `central-server/src/controllers/saas-config.controller.ts` (API config GET pour clients)
> - `central-dashboard/src/app/features/saas/` (UI navigateur TV + Remote SaaS)
> **ADR liés** : ADR-037 (architecture mode SaaS), ADR-038 (temps réel + observabilité), ADR-039 (tiers Play/Club/Pro/Premium), ADR-059 (relais state-sync SaaS), ADR-069 (delivery strategy registry), ADR-088 (scoreboard live multi-vendor SaaS-first), ADR-096 (extraction SaaS relay)
> **Smoke tests** :
> - `central-server/src/__tests__/smoke/smoke-saas.test.ts` (73 règles SaaS)
> - `central-server/src/__tests__/smoke/smoke-socket-realtime.test.ts` (memory leak `saasStates`)
> - `central-server/src/__tests__/smoke/smoke-scoreboard-saas.test.ts` (scoreboard push SaaS)
> **`.claude/rules/` lié** : `saas.md` (73 règles ADR-037 — plus gros corpus du projet)

## En une phrase

Le mode SaaS permet à un club d'utiliser Neopro **sans hardware Raspberry Pi** — la TV existante du club affiche directement une page web servie par le central server, et la télécommande pilote tout via le cloud (l'angle mort total des fabricants LED Bodet/Stramatel).

## Règles métier (ce qui DOIT marcher)

### Architecture
- **`site_type` est la source de vérité** : `'pi'` (matériel), `'saas'` (navigateur uniquement), `'demo'` (vitrine commerciale). Un site est exclusivement de UN type — pas de migration runtime.
- **Le central server joue le rôle du serveur Socket.IO local du Pi** pour les sites SaaS (relay events Remote ↔ TV via `saas-relay.handler`).
- **Les vidéos sont servies via URLs FTP publiques** (`https://kalonpartners.bzh/neopro-video/{uuid}.mp4`) directement au navigateur TV, pas via le Pi.
- **L'état temps réel** (score, phase, timer, options, recording, master-slave TV) est stocké **in-memory** dans `saasStates` Map per `siteId`. Perdu au reboot serveur (acceptable, les clients re-pull via `request-state`).

### Délivrement contenus
- **Pas de déploiement Pi** pour les sites SaaS : `deliveryStrategyRegistry.resolve(site)` retourne `SaasDirectStrategy` (vs `PiSocketStrategy` pour les sites Pi). La sélection est centralisée, pas dispersée.
- **Config est servie via HTTP GET** (`/api/saas/:siteId/config`) au lieu d'être pushée. Le client navigateur reload la config à chaque évènement Socket.IO `saas-config-updated` (push ultra-léger, pas du contenu).
- **Aucune écriture côté client** (pas de `local_config_mirror` style Pi) — le client est un consommateur read-only de l'API.

### UX matchday
- **Master-Slave TV sync** réplique le comportement Pi : 1ère TV = master, suivantes = slaves, `tv-loop-update` master → broadcast `tv-loop-state` slaves. Si master disconnect, plus ancienne slave promue.
- **Priorité kiosk** : si une TV `displayType='tv'` (Pi simulé) arrive après un master `displayType='browser'`, elle prend le master. Symétrie kiosk-priority Pi.
- **Pas de mode hors-ligne** côté SaaS : si la connexion internet du club tombe, l'écran SaaS s'arrête. Trade-off accepté pour l'angle "no hardware".

### Tier d'abonnement (ADR-039 — additive strategy)
- **Play** (790€/an) : SaaS web, 25 vidéos max, 1 profil, télécommande cloud, support email
- **Club** (1500€/an) : Pi + tout Play + vidéos illimitées + mode hors-ligne + multi-profils
- **Pro** (2100€/an) : tout Club + sponsors monétisés + rotation pondérée + preuves diffusion + pack prospection
- **Premium** (3000€/an) : tout Pro + générateur vidéos + double écran + analytics complètes + diagnostic distance + support 24h
- Les 4 tiers utilisent le **même code** — la différenciation est purement par feature flags + quotas.

### Workflow agency / advertiser / club (multi-tenant)
- Une **agence** peut gérer N clubs via SSO unique (cf. persona 9 PERSONAE).
- Un **advertiser** national (cf. persona 7) peut pousser une vidéo simultanément sur N sites cochés.
- Une **régie** (cf. persona 8) cloisonne les rapports par contrat-annonceur.
- Un **club** ne voit que ses propres données + ses sponsors — RLS strict (cf. ADR-005).

## Comportements observables

| Règle | Comment on vérifie |
|---|---|
| `site_type` est respecté | `deliveryStrategyRegistry.resolve(site)` retourne `SaasDirectStrategy` pour `saas`, `PiSocketStrategy` pour `pi` (smoke test `noLegacySaasShortCircuit`) |
| Relai SaaS actif | `socket.on('command')` dans `saas-relay.handler` rebroadcast `socket.to(siteId).emit('action', data)` (smoke 14 patterns) |
| Vidéo servie via FTP | URL publique `https://kalonpartners.bzh/neopro-video/{uuid}.mp4` reachable depuis browser TV |
| Config rechargée sur push | Browser TV reçoit `saas-config-updated` → fait `GET /api/saas/:siteId/config` |
| Master-slave OK | Logs `SaaS TV registered` + `SaaS TV promoted to master` quand master disconnect |
| Pas de `local_config_mirror` | Smoke `smoke-saas` vérifie qu'aucun write côté client n'écrit en local mirror |
| Tier features actifs | Feature gates dans la DB (`features` table), checked côté API + côté UI Angular |

## Cas d'edge connus

- **TV browser dans un onglet en arrière-plan** : Chrome throttle les timers. Pour le scoreboard live, on émet régulièrement même si rien ne change pour forcer le browser à rester réveillé.
- **Bascule Pi → SaaS pour le même site** (changement `site_type`) : non supporté en runtime. Nécessite migration manuelle DB + suppression Pi de la flotte. C'est une décision irréversible côté commercial.
- **Plusieurs TVs SaaS sur le même site** (master + N slaves) : OK, master-slave géré. Mais limite pratique ~5 TVs (au-delà, la latence broadcast augmente).
- **Vidéo "manuelle" KO** (404 FTP) : depuis fix #613, retombe automatiquement sur la loop de boucle (pas d'écran noir). CORP également posé sur erreurs proxy pour préserver le rendu côté client.
- **Connexion Internet club intermittente** : l'écran SaaS reconnecte automatiquement (Socket.IO retry). Mais pendant le downtime, écran statique (dernier frame). Pas de mode dégradé.
- **Config monstre (1000+ vidéos en config)** : payload GET config peut atteindre quelques 100 Ko. Acceptable, pas de pagination prévue (les boucles sont rarement >50 vidéos).
- **Saisie manuelle score depuis 2 onglets Remote en parallèle** : ils écrivent tous deux dans `state.score` du `saasStates` Map. Dernière écriture gagne. Pas de lock applicatif (acceptable car l'usage réel est 1 bénévole = 1 onglet).

## Contraintes / NE PAS FAIRE

Voir `.claude/rules/saas.md` pour la liste complète (73 règles smoke-testées). Règles **métier** spécifiques :

- Ne **jamais** écrire de config dans un `local_config_mirror` côté SaaS (le client est read-only, source de vérité = central server).
- Ne **jamais** déployer une vidéo via Socket.IO push pour un site SaaS (utiliser `SaasDirectStrategy` qui passe par FTP + API GET).
- Ne **jamais** retirer le relais SaaS `registerSaasRelay` (sans lui, les commandes Remote ne touchent jamais les TVs SaaS — PROP-002 Phase 5 cassé, persona 4 totalement bloqué).
- Ne **jamais** confondre `socket.data` (objet vide Socket.IO v4) et `(socket as any).siteId` (propriété stockée par `socket.service`). Smoke test `socket.data` interdit côté handlers.
- Ne **jamais** émettre vers une room sans vérifier `room.size === 0` (zombie connection → fausses commandes envoyées dans le vide).

## Ce qui n'est PAS dans le scope

- **Mode hors-ligne SaaS** : antinomique avec l'angle "no hardware". Si un club veut hors-ligne, il prend le tier Club (Pi).
- **Streaming vidéo en direct** (live RTMP du match) : LATER #10 lacune benchmark Stramatel — pas dans SaaS V1.
- **Téléchargement local des vidéos pour cache offline** : non. Cohérent avec "no local mirror".
- **Authentification spectateur** sur la TV : la TV est anonyme, c'est l'écran de la salle. Le QR/jeu spectateur (LATER #1) authentifie le spectateur sur son mobile, pas sur la TV.
- **Multi-écran avec sources différentes par écran** sur le même site SaaS : pas l'usage. Si besoin, on bascule en tier Premium qui supporte le double écran (mais via Pi).

## Évolutions possibles (backlog léger)

- [ ] Service Worker côté browser TV pour cache offline minimal (logos sponsors, vidéos top 5)
- [ ] Métrique Prometheus `neopro_saas_tv_connected{site_id, display_type}` pour Grafana
- [ ] Streaming live + score auto intégré (LATER #10)
- [ ] QR code spectateur (LATER #1) wire dans la page TV SaaS — natural fit, pas besoin de Pi
- [ ] Migration `site_type` dans les 2 sens via UI admin (pour POC client → conversion)
- [ ] Persistance `saasStates` en Redis pour survivre aux reboots serveur (utile si scale horizontal)
