# SPEC : Socket Service

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-25
> **last_verified** : 2026-05-10
> **verified_against_commit** : 1890d43
> **Code principal** :
> - `central-server/src/services/socket.service.ts` (orchestrateur 991 lignes)
> - `central-server/src/handlers/*.handler.ts` (10 handlers extraits)
> - `central-server/src/handlers/saas-relay.handler.ts` (relais SaaS isolé — ADR-096)
> **ADR liés** : ADR-002 (Socket.IO temps réel), ADR-037 (mode SaaS), ADR-061 (coexistence Remote v1/v2), ADR-081 (audit télécommande), ADR-090 (scoreboard-state push), ADR-093 (sessions match), ADR-096 (extraction SaaS relay)
> **Smoke tests** :
> - `central-server/src/__tests__/smoke/smoke-wiring.test.ts` (handlers + repos exports)
> - `central-server/src/__tests__/smoke/smoke-socket-realtime.test.ts` (memory leak guards SaaS — issue #594)
> - `central-server/src/__tests__/smoke/smoke-adr-refactoring.test.ts` (14 patterns relay SaaS)
> - `central-server/src/__tests__/smoke/smoke-scoreboard-saas.test.ts` (scoreboard push)
> **`.claude/rules/` lié** : `services.md` (anti-patterns Socket.IO + config enrichment)

## En une phrase

Le service qui orchestre toute la communication temps réel du système Neopro : Pi ↔ Cloud (auth, heartbeat, commandes, deploy progress) ET clients SaaS ↔ Cloud (relais sans Pi, master-slave TV, score live, pubs sponsors).

## Règles métier (ce qui DOIT marcher)

### Côté Pi (agents Raspberry connectés au cloud)
- **Un Pi s'authentifie** via `register` avec `siteId + apiKey`. Hash SHA-256 de l'API key vérifié contre `sites.api_key_hash`. Auth réussie → socket joint la room `siteId`.
- **Heartbeat toutes les 30s** : Pi envoie `heartbeat { siteId, metrics: { cpu, memory, temp } }`. Le cloud throttle l'INSERT en DB à 1× toutes les 5 minutes (sinon bloate `metrics`). Liveness reste à 30s.
- **Commande envoyée Cloud → Pi** est trackée (`pendingCommands`) avec `commandId`, `timeoutMs`. Si pas de `command_result` reçu dans le timeout, alerte logée et metric `command_timeout` incrémentée.
- **Reconnexion Pi** : à la `register` réussie, `processPendingDeploymentsForSite()` + `processPendingCommands()` sont déclenchés en parallèle pour rattraper le retard.
- **Disconnect Pi** : guard `socket.id` matche le socket courant (sinon fausse alerte sur reconnexion rapide). Si match → `connectedSites.delete(siteId)` + `alertService.siteOffline()` après 60s grace (anti flip-flop Railway 3-16s).

### Côté SaaS (clients sans Pi physique — ADR-037)
- **Un client SaaS s'authentifie** via JWT user et `saas-register { siteId }`. Vérifie l'accès au site (RLS), join la room.
- **Le central server fait le relai local** : reproduit le rôle du serveur Socket.IO local du Pi pour les sites SaaS. Toute commande émise par la Remote SaaS est rebroadcastée vers les TVs du même site (`socket.to(siteId).emit('action', data)`).
- **État partagé in-memory** (`saasStates` Map per `siteId`) stocke score, phase, options, timer, recording, master-slave TV, loop state. État perdu au reboot du serveur (acceptable car les Pi sont autoritatifs).
- **Master-Slave TV sync** : la 1ère TV qui se connecte devient master. Les suivantes deviennent slaves. Si une `tv` (Pi) arrive après un master `browser` (SaaS), la `tv` prend la priorité (kiosk priority). Si master disconnect, plus ancienne slave promue.
- **GC périodique des `saasStates`** : sweep toutes les 5 min purge les entries dont la room est vide ET `tvInstances.size === 0` (zombie sockets qui ne fire jamais `disconnect`).

### Cross-cutting (Pi ET SaaS)
- **Audit télécommande ADR-081** : chaque commande relayée (Pi ou SaaS) déclenche un INSERT dans `remote_command_audit` avec `commandId`, `siteId`, `commandType`, `roomSize`. Fire-and-forget non-bloquant.
- **scoreboard-state-push ADR-090** : valide via `validateScoreboardStatePush`, persist `scoreboard_state` repo, broadcast à la room. Pas de JWT requis (déjà auth par siteId room).
- **score-update gel** : si le `score-update` arrive sur une session match avec `ended_at IS NULL`, le score est UPDATE dans `club_sessions`. Si `ended_at` est déjà set, l'UPDATE est skip (score figé après auto-close ou fermeture manuelle).

## Comportements observables

| Règle | Comment on vérifie |
|---|---|
| Auth Pi réussie | Log `Pi agent authenticated` + métrique `recordPiAgentAuth('success')` + Pi join la room siteId |
| Auth Pi échouée | Log `Pi agent auth failed` + métrique `recordPiAgentAuth('failure', errorMessage)` + socket disconnect |
| Heartbeat throttle DB | `lastMetricsInsertAt` Map track le dernier INSERT par siteId (1× toutes les 5min max) |
| Reconnexion processing | Logs `Processing pending deployments` + `Processing pending commands` à chaque register |
| GC saasStates | Log `SaaS states GC sweep purged orphan entries` toutes les 5 min si purges effectives |
| Master-Slave promotion | Log `SaaS TV promoted to master` quand le master disconnect |
| Audit commande | INSERT dans `remote_command_audit` (Phase 0 ADR-081 — pas d'audit si pas de commandId) |
| Score figé | `UPDATE club_sessions WHERE ended_at IS NULL` filtre — sessions fermées sont immutables |

## Cas d'edge connus

- **Reconnexion rapide Pi** (<5s) : l'ancien socket disconnect APRÈS l'auth du nouveau. Sans le guard `socket.id`, l'ancien disconnect déclencherait une fausse alerte Slack. Cf. `services.md` "NE JAMAIS supprimer le guard `socket.id`".
- **Zombie socket** (Pi crashé sans envoyer disconnect) : le GC sweep saasStates le purge en 5 min max. Côté Pi, `connectionHealthCheckInterval` (15s) marque le site offline si pas de pong.
- **Concurrent saas-register depuis 2 onglets browser** : la 2e socket joint la même room, devient slave, reçoit `tv-loop-state` du master. Pas de conflit.
- **Pi Pro + browser TV en SaaS pour le même site** : ADR-037 ne le supporte pas formellement — un site est `pi` OU `saas` selon `site_type`. Le relais SaaS s'active uniquement pour `site_type IN ('saas', 'demo')`.
- **Redis adapter absent (REDIS_URL non set)** : le service tourne en single-instance mode. Les rooms ne sont pas partagées entre instances → ne PAS scaler horizontalement avant de wirer Redis.
- **`scoreboard-state-push` payload invalide** : `validateScoreboardStatePush` retourne `null`, log warn `scoreboard-state-push invalid payload`, pas de broadcast (fail-safe).

## Contraintes / NE PAS FAIRE

Voir `.claude/rules/services.md` pour la liste complète des invariants smoke-testés. Règles **métier** spécifiques :

- Ne **jamais** retirer le relai SaaS (`registerSaasRelay`) : sans lui, les displays SaaS ne reçoivent aucune commande Remote (PROP-002 Phase 5 cassé).
- Ne **jamais** envoyer `update_config` au Pi sans appeler `enrichConfigWithDisplayVariants()` ET `enrichConfigWithAnalyticsMetadata()` (sinon analytics perdues, vidéos sponsors mal classifiées).
- Ne **jamais** retourner à la branche `if (target.siteType === 'saas') ... continue` dans `deployment.service.ts` (ADR-069 a supprimé ça → utiliser `deliveryStrategyRegistry.resolve(site)`).
- Ne **jamais** envoyer une alerte "Site Offline" immédiatement (utiliser `OFFLINE_GRACE_PERIOD_MS = 60s` pour absorber les flip-flops Railway 3-16s).
- Ne **jamais** persister le score dans une session avec `ended_at IS NOT NULL` (le score est figé au moment de la fermeture, audits/rapports comptent dessus).

## Ce qui n'est PAS dans le scope

- **Streaming vidéo binaire** (live transcoding, RTMP, HLS) → pas l'usage. Les vidéos vont par FTP, le streaming live concerne LATER #10 (lacune benchmark Stramatel SL Stream Box).
- **Authentification dashboard users** → géré par `auth.middleware` + JWT classique, pas par le socket. Le socket auth utilise un sous-ensemble (siteId+apiKey OU JWT user pour SaaS).
- **Persistence durable de l'état SaaS** (saasStates) → in-memory volontaire, perdu au reboot. Si on veut persistance, c'est une décision archi à prendre (Redis, DB, fichier ?).
- **Coordination multi-instance Socket.IO** sans Redis adapter → on tourne single-instance par défaut, scale horizontal nécessite Redis (env `REDIS_URL`).
- **Push mobile (APNs/FCM)** → géré ailleurs (probablement futur sponsor portal ou app supporter, pas via Socket.IO).

## Évolutions possibles (backlog léger)

- [ ] Persistance `saasStates` en Redis pour survivre aux reboots (utile si on scale horizontal)
- [ ] Dashboard admin `/admin/sockets` pour visualiser connections actives par site (debug + monitoring)
- [ ] Métrique Prometheus `neopro_socket_connected_clients{site_type}` (pour dashboard Grafana)
- [ ] Compression Socket.IO activée explicitement (gain bande passante Pi/SaaS sur connexions lentes)
- [ ] Migration vers Socket.IO v5 quand stable (perf + sécurité)
- [ ] Streaming live + score auto intégré (LATER #10, lacune Stramatel SL Stream Box)
