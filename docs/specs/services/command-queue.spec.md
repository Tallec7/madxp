# SPEC : Command Queue — Commandes cloud → Pi avec persistance offline

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-05-14
> **last_verified** : 2026-05-14
> **verified_against_commit** : abdd99ba
> **Code principal** :
>
> - `central-server/src/services/command-queue.service.ts` (`sendOrQueue()`, `processPendingCommands()`, `REALTIME_ONLY_COMMANDS`)
> - `central-server/src/services/pending-commands-drain.task.ts` (CRON 30s qui draine les queues des Pi connectés)
> - `central-server/src/scripts/migrations/add-command-queue.sql` (schéma `pending_commands`)
> - `central-server/src/repositories/pending-command.repository.ts`
> - `raspberry/sync-agent/src/command-dispatch.js` (côté Pi, exécute les commandes reçues)
>
> **ADR liés** : ADR-001 (autonomie locale + command queue), ADR-120 (matrice ownership — utilise la queue pour cloud → Pi)
> **Smoke tests** : `smoke-wiring.test.ts` (vérifie l'export), `smoke-receivers-discovery.test.ts` (vérifie queue pour `receiver_assignment_updated`)

## En une phrase

Quand le cloud doit envoyer une commande à un Pi (assigner un receiver, déployer une vidéo, déclencher un sync de profil, etc.) et que le Pi est offline, la commande est persistée dans `pending_commands` jusqu'à reconnexion, où un CRON la délivre via Socket.IO — sauf pour 12 commandes "temps réel" qui requièrent une connexion live.

## Périmètre

- **Inclus** : la table `pending_commands`, l'API `sendOrQueue()`, le CRON drain 30s, le retry avec `max_attempts`, l'expiration optionnelle, l'UI dashboard du badge `⏳ En attente`.
- **Couvre** : toute commande cloud → Pi qui passe par `commandQueueService.sendOrQueue()`. Ne couvre PAS la direction Pi → cloud (heartbeat, analytics, push-back config ADR-120 Phase 4 = REST, hors queue).
- **Hors périmètre** : la logique métier de chaque commande (handlers `command-dispatch.js` côté Pi), le pipeline d'auth Socket.IO Pi → cloud, le sens reverse Pi → cloud.

## Règles métier

### `REALTIME_ONLY_COMMANDS` — 12 commandes non-queueables

Définies dans `command-queue.service.ts:33-44`. Ces commandes requièrent une connexion Pi live et **ne peuvent pas être queuées** — si le Pi est offline, l'appel échoue immédiatement (code `PI_OFFLINE`, HTTP 503).

```
get_logs, get_system_info, get_config, network_diagnostics,
get_hotspot_config, get_health_status, run_diagnostics,
get_analytics_buffer_status, fix_hotspot, export_debug_bundle,
scan_wifi_networks, configure_wifi_client
```

**Pourquoi** : ces commandes attendent une **réponse synchrone** du Pi (logs, diagnostics, scan WiFi) qui n'aurait plus de sens si délivrée plusieurs minutes/heures après la requête utilisateur.

### Toutes les autres commandes sont queueables

Quelques exemples (liste non-exhaustive, déduite des callers de `sendOrQueue()`) :

- `receiver_assignment_updated` (ADR-114, assignation Fire Stick à un display)
- `sync_config` (push de la config globale d'un site)
- `sync_profiles` (push d'un profil multi-clubs au Pi)
- `update_hostname`
- `rotate_psk` (ADR-074, rotation PSK hotspot)
- `deploy_video` (ADR-117, déploiement vidéo individuel)
- `video_cycle_updated`
- `update_software` (OTA)

### Schéma `pending_commands`

Migration : `central-server/src/scripts/migrations/add-command-queue.sql`.

| Colonne | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `site_id` | UUID FK → `sites(id)` ON DELETE CASCADE | |
| `command_type` | VARCHAR(100) | Ex : `receiver_assignment_updated` |
| `command_data` | JSONB | Payload de la commande |
| `priority` | INT (1-10) | Default 5 |
| `created_by` | UUID nullable | User qui a déclenché |
| `created_at` | TIMESTAMP | NOW() |
| `expires_at` | TIMESTAMP nullable | NULL = pas d'expiration |
| `attempts` | INT | Default 0, incrémenté à chaque tentative |
| `last_attempt_at` | TIMESTAMP nullable | |
| `max_attempts` | INT | Default 3 |
| `description` | TEXT nullable | Pour audit/UI |

Index : `(site_id)`, `(site_id, priority, created_at)`, `(expires_at) WHERE expires_at IS NOT NULL`.

### Drain périodique — CRON 30s

`pending-commands-drain.task.ts:32-96` itère sur `socketService.getConnectedSites()` et appelle `commandQueueService.processPendingCommands(siteId)` toutes les 30 secondes. Pour chaque Pi connecté :

1. Récupère les `pending_commands` du site, triés par `(priority ASC, created_at ASC)`
2. Pour chaque commande : `socket.emit(command_type, command_data)` avec ack timeout
3. Si ack OK → `DELETE FROM pending_commands WHERE id = $1`
4. Si ack KO ou timeout → `attempts++, last_attempt_at = NOW()`
5. Si `attempts >= max_attempts` → mark failed (DELETE + log + alerte optionnelle)

### Expiration & cleanup

- Colonne `expires_at` nullable — défaut NULL (pas d'expiration).
- Function `cleanup_expired_pending_commands()` définie en SQL mais **pas câblée à un CRON** aujourd'hui (cleanup manuel sur incident).
- View `pending_commands_summary` (par site : `COUNT`, `MIN(priority)`, `oldest`/`newest command_at`) pour debugging dashboard.

## Comportements observables

| Situation | Comportement |
|---|---|
| Pi online, appel `sendOrQueue('sync_profiles', ...)` | Délivrée immédiatement via Socket.IO, retour `{ queued: false, commandId }` |
| Pi offline, appel `sendOrQueue('sync_profiles', ...)` | INSERT dans `pending_commands`, retour `{ queued: true, commandId }` |
| Pi offline, appel `sendOrQueue('get_logs', ...)` (REALTIME_ONLY) | Refus immédiat, erreur `PI_OFFLINE`, pas d'INSERT |
| Pi reconnecte après être resté offline 3 jours | Au prochain tick CRON drain (≤30s), toutes les commandes pending sont délivrées dans l'ordre priority+created |
| Commande échoue 3× (max_attempts default) | DELETE de la row + log warn. Pas de retry automatique au-delà. |
| Pi reste offline > expires_at d'une commande | Cleanup manuel via `cleanup_expired_pending_commands()` (pas de CRON aujourd'hui) |

## UI dashboard

Le statut "queued" est rendu dans le dashboard via :

- **`deployment-status.component.ts`** : bannière "⏳ En attente de confirmation du Pi..." quand `pendingDeployments > 0` (ADR-117 auto-deploy)
- **`command-executor.component.ts:489-622`** : tracking du `pendingCommandId` retourné par `sendOrQueue()`, observation du callback Socket.IO pour bascule en `success`/`failed`
- **Pas de colonne "queued" dédiée** en DB — distinction faite via `attempts > 0` ou `last_attempt_at IS NOT NULL` sur la view `pending_commands_summary`

## Risques et angles morts connus

- **Pas de CRON cleanup `expires_at`** : si une commande est queuée avec `expires_at = NOW() + 7 days` et que le Pi reste offline 30 jours, la row reste tant qu'un humain n'appelle pas la function. Mitigation : monitoring `pending_commands_summary` côté observability.
- **Race subscribe → register Socket.IO** : si le Pi reconnecte mais que `register` arrive APRÈS le drain CRON, les commandes lui échappent jusqu'au tick suivant (max 30s de latence). Pas critique en pratique mais explique pourquoi un retry manuel peut être perçu comme "lent".
- **REALTIME_ONLY** : la liste est en dur dans le code. Toute nouvelle commande synchrone doit y être ajoutée explicitement, sinon elle sera queuée silencieusement (= échec UX silencieux pour les commandes qui attendent une réponse live).
- **Pas de TTL par défaut** : `expires_at` à NULL signifie qu'une commande peut traîner indéfiniment dans la queue si elle échoue à `max_attempts` mais que le Pi n'est jamais reconnecté. (En pratique : DELETE après `max_attempts`, donc pas un vrai souci.)

## Cas d'edge

- **Pi reconnecte pendant un drain en cours** : le tick CRON 30s est en train d'itérer sur `getConnectedSites()`. Si un Pi reconnecte juste après l'itération mais avant la fin du tick, ses commandes seront drainées au tick suivant (latence max 30s supplémentaires).
- **Commande émise pendant que le Pi se connecte mais avant `register`** : race subscribe → register Socket.IO. La commande peut être émise dans une room vide. Mitigé par le retry CRON (la commande reste dans `pending_commands` jusqu'à ack OK), mais latence visible côté utilisateur.
- **`max_attempts` atteint** : la commande est DELETE de la queue + log warn. **Aucun retry au-delà**, aucune alerte automatique. Si la commande était critique (ex: rotation PSK), il faut la ré-émettre manuellement.
- **`expires_at` dépassé mais commande encore queueée** : `cleanup_expired_pending_commands()` n'est pas câblée à un CRON aujourd'hui. La commande reste en DB jusqu'à intervention humaine. Pas critique en pratique car les commandes échouent à `max_attempts` avant.
- **Pi connecté mais socket zombie** (room non-membre, cf. ADR-099) : `socketService.getConnectedSites()` peut inclure un siteId dont le socket est mort. Le drain emit dans le vide, ack timeout, `attempts++`. Au bout de `max_attempts`, la commande tombe sans que le vrai Pi (qui reconnecte plus tard) ne la voie jamais. Mitigation : vérification room membership avant emit (cf. `.claude/rules/services.md` anti-pattern #2).
- **Plusieurs commandes du même type queueées pour le même site** : la queue ne déduplique pas. Si le dashboard envoie 5× `sync_profiles` à un Pi offline, 5 rows sont créées et délivrées en séquence au reconnect. Pour idempotence applicative, c'est OK (chaque sync_profiles est idempotent), mais bruyant.

## Ce qui n'est PAS dans cette SPEC

- **Direction Pi → cloud** : analytics batch, heartbeat, push-back config (ADR-120 Phase 4) passent par REST, pas la queue. Hors scope.
- **Priorité business** : la colonne `priority` 1-10 existe mais aucune règle métier publiée n'attribue priority X à command Y. Les callers passent quasi-tous le default (5).
- **Notification kiosk Pi** après réception commande : c'est le rôle du handler `command-dispatch.js`, pas de la queue.

## Référence

- [ADR-001](../../adr/ADR-001-edge-cloud-architecture.md) — autonomie locale + command queue
- [ADR-114](../../adr/ADR-114-displays-write-through-configuration-json.md) — exemple de commande queueable (`receiver_assignment_updated`)
- [ADR-117](../../adr/ADR-117-auto-deploy-videos-on-profile-config-save.md) — auto-deploy vidéos (queue via `deploy_video`)
- [ADR-120](../../adr/ADR-120-pi-saas-ownership-model.md) — la queue reste cloud → Pi ; le sens Pi → cloud passe par REST `/pi-config-sync`
- Migration : `central-server/src/scripts/migrations/add-command-queue.sql`
- Service : `central-server/src/services/command-queue.service.ts`
- Drain CRON : `central-server/src/services/pending-commands-drain.task.ts`
