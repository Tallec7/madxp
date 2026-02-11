# Diagramme de Sequence : Sync Raspberry Pi <-> Cloud

> Flux complet : Connexion -> Heartbeat -> Sync Etat -> Commandes -> Resilience

## Connexion et Authentification

```mermaid
sequenceDiagram
    autonumber
    participant Pi as Sync-Agent (Pi)
    participant WS as Socket.IO Server
    participant DB as PostgreSQL
    participant Dash as Dashboard Angular

    Note over Pi,Dash: === PHASE 1 : CONNEXION WEBSOCKET ===

    Pi->>WS: io.connect(central_url, {transports: ['websocket', 'polling']})
    WS-->>Pi: connected

    Pi->>WS: emit('authenticate', {siteId, apiKey})
    WS->>DB: SELECT api_key FROM sites WHERE id = $1
    DB-->>WS: site {api_key_hash, site_name}
    WS->>WS: SHA256(apiKey) === stored_hash ?

    alt Authentification echouee
        WS-->>Pi: emit('auth_error', {message})
        Note over Pi: Retry avec backoff exponentiel
    end

    WS->>WS: socket.join(siteId) — rejoint la room du site
    WS->>DB: UPDATE sites SET status='online', last_seen_at=NOW(), last_ip=$2
    WS->>WS: lastPongReceived.set(siteId, Date.now())
    WS-->>Pi: emit('authenticated', {message, siteId})

    Note over Pi,Dash: === PHASE 2 : TRAITEMENT FILE D'ATTENTE ===

    WS->>WS: processPendingCommands(siteId)
    WS->>WS: processPendingDeploymentsForSite(siteId) — contenu
    WS->>WS: processPendingDeploymentsForSite(siteId) — updates

    Note over Pi: connected = true<br/>Demarre watchers (config + videos)<br/>Declenche syncLocalState()
```

## Echange Initial d'Etat

```mermaid
sequenceDiagram
    autonumber
    participant Pi as Sync-Agent (Pi)
    participant WS as Socket.IO Server
    participant DB as PostgreSQL
    participant Dash as Dashboard

    Note over Pi,Dash: === SYNC ETAT LOCAL ===

    Pi->>Pi: Collecte configuration.json
    Pi->>Pi: SHA256(config) -> configHash
    Pi->>Pi: Scan /home/pi/neopro/videos/ (recursif)
    Pi->>Pi: Collecte storage {total, used, free}
    Pi->>Pi: Collecte hotspot info + network profile

    Pi->>WS: emit('sync_local_state', {siteId, configHash, config,<br/>videos[], storage, hotspotInfo, networkProfile, timestamp})

    WS->>DB: Check config_update_pending_until
    alt Config update en cours (lock actif)
        WS->>DB: UPDATE sites SET local_config_mirror = metadata only<br/>(_localVideos, _localStorage, _hotspotInfo, _networkProfile)
        Note right of WS: Protection race condition :<br/>ne pas ecraser la config<br/>en cours de deploiement
    else Pas de lock
        WS->>DB: UPDATE sites SET local_config_mirror = full config,<br/>local_config_hash = $2, last_config_sync = NOW(),<br/>network_profile = $3
    end

    WS->>Dash: io.to('dashboard').emit('site_config_updated', {...})

    Note over WS,Pi: === ENVOI STATUT LICENCE ===

    WS->>DB: subscriptionService.computeLicenseStatus(siteId)
    DB-->>WS: {status, reason, days_left, can_auto_unblock, message_tv}
    WS-->>Pi: emit('license_status', licenseData)
    Pi->>Pi: licenseCache.save(status)
    Pi->>Pi: notifyLocalApp('license_update', status)
```

## Heartbeat (toutes les 30 secondes)

```mermaid
sequenceDiagram
    autonumber
    participant Pi as Sync-Agent (Pi)
    participant WS as Socket.IO Server
    participant DB as PostgreSQL
    participant Alert as Alerting Service
    participant Dash as Dashboard

    Note over Pi,Dash: === BOUCLE HEARTBEAT (30s) ===

    loop Toutes les 30 secondes
        Pi->>Pi: metricsCollector.collectAll()
        Note right of Pi: CPU %, RAM %, Temp C,<br/>Disk %, Uptime, IP, Version

        Pi->>WS: emit('heartbeat', {siteId, timestamp, metrics, softwareVersion})

        WS->>DB: INSERT INTO metrics (site_id, cpu_usage, memory_usage,<br/>temperature, disk_usage, uptime, recorded_at)
        WS->>DB: UPDATE sites SET last_seen_at=NOW(), status='online',<br/>local_ip=$2, software_version=$3

        WS->>Alert: checkAlerts(siteId, metrics)
        alt Temperature > 75C ou Disk > 90% ou RAM > 90%
            Alert->>DB: INSERT INTO alerts (site_id, type, severity, message)
            Alert->>Alert: Slack notification (si critique)
        end

        WS->>WS: lastPongReceived.set(siteId, Date.now())
    end

    Note over Pi,Dash: === PING/PONG HEALTH CHECK ===

    loop Toutes les 30 secondes (serveur)
        WS->>Pi: emit('ping_check', {timestamp})
        Pi-->>WS: emit('pong_check')
        WS->>WS: lastPongReceived.set(siteId, Date.now())
    end

    Note over WS: Socket.IO natif: pingInterval=25s, pingTimeout=60s

    loop Toutes les 30 secondes (health check)
        WS->>WS: Pour chaque site connecte :<br/>now - lastPong > 60s ?
        alt Connexion zombie detectee
            WS->>WS: socket.disconnect(true)
            WS->>DB: UPDATE sites SET status='offline'
            WS->>Dash: emit('site_disconnected', {siteId})
        end
    end

    loop Toutes les 60 secondes (DB sync)
        WS->>DB: SELECT id FROM sites WHERE status='online'<br/>AND last_seen_at < NOW() - 90s
        WS->>DB: UPDATE sites SET status='offline'<br/>WHERE id IN (stale sites not in connectedSites map)
    end
```

## Commandes Distantes (Central -> Pi)

```mermaid
sequenceDiagram
    autonumber
    participant Dash as Dashboard Admin
    participant API as Central API
    participant Q as Command Queue
    participant WS as Socket.IO Server
    participant Pi as Sync-Agent (Pi)
    participant DB as PostgreSQL

    Note over Dash,DB: === ENVOI DE COMMANDE ===

    Dash->>API: POST /api/sites/:id/commands {type, data}
    API->>DB: INSERT INTO remote_commands (site_id, type, data, status='pending')
    API->>Q: processPendingCommands(siteId)

    alt Site connecte (online)
        Q->>WS: sendCommand(siteId, command)
        WS->>WS: pendingCommands.set(commandId, {timeout, siteId})
        WS-->>Pi: emit('command', {id, type, data})

        Note over Pi: === EXECUTION SUR LE PI ===
        Pi->>Pi: handler = commands[type]
        Pi->>Pi: result = await handler.execute(data)

        alt Commande longue (deploy_video, update_software)
            loop Progression
                Pi-->>WS: emit('deploy_progress', {deploymentId, progress: 0-100})
                WS->>DB: UPDATE content_deployments SET progress = $2
                WS->>Dash: io.to('dashboard').emit('deploy_progress', {...})
            end
        end

        Pi-->>WS: emit('command_result', {commandId, status: 'success', result})
        WS->>WS: pendingCommands.delete(commandId)
        WS->>DB: UPDATE remote_commands SET status='completed'
        WS->>Dash: emit('command_completed', {commandId, siteId})

    else Site hors ligne
        Q->>DB: Commande reste en status='pending'
        Note over DB: Stockee max 7 jours,<br/>traitee au prochain reconnect
    end

    Note over WS: === TIMEOUT HANDLING (check toutes les 10s) ===
    loop Toutes les 10 secondes
        WS->>WS: Pour chaque pendingCommand :<br/>now - created > timeout ?
        alt Timeout depasse
            WS->>WS: pendingCommands.delete(commandId)
            WS->>DB: UPDATE remote_commands SET status='failed',<br/>error_message='Command timeout after XXs'
            WS->>Dash: emit('command_timeout', {commandId})
        end
    end
```

## Mise a Jour de Configuration (avec merge)

```mermaid
sequenceDiagram
    autonumber
    participant Dash as Dashboard
    participant API as Central API
    participant DB as PostgreSQL
    participant WS as Socket.IO Server
    participant Pi as Sync-Agent (Pi)

    Dash->>API: PUT /api/sites/:id/config {configuration}
    API->>DB: UPDATE sites SET config_update_pending_until = NOW() + 60s
    Note right of DB: Lock anti-race condition :<br/>sync_local_state ne peut pas<br/>ecraser la config pendant 60s

    API->>WS: sendCommand(siteId, {type: 'update_config', data: {configuration}})
    WS-->>Pi: emit('command', {type: 'update_config', data})

    Pi->>Pi: Load configuration.json locale
    Pi->>Pi: mergeConfigurations(localConfig, newConfig)
    Note right of Pi: Regles de merge :<br/>- Champs proteges : siteId, apiKey, settings<br/>- Sponsors : Central = source de verite + local preserves<br/>- TimeCategories, CategoryMappings : remplaces<br/>- Categories : merge (NEOPRO locked, Club preserves)<br/>- Watermark, scoreOverlay : remplaces si fournis

    Pi->>Pi: Clean expired videos (check expires_at)
    Pi->>Pi: Write merged config to disk

    Pi-->>WS: emit('command_result', {commandId, status: 'success'})
    WS->>DB: UPDATE sites SET config_update_pending_until = NULL
    WS->>Dash: emit('command_completed', {...})

    Note over Pi: Prochain sync_local_state enverra<br/>le nouveau configHash
```

## Surveillance Locale (Watchers)

```mermaid
sequenceDiagram
    autonumber
    participant FS as Filesystem (Pi)
    participant CW as Config Watcher
    participant VW as Video Watcher
    participant SA as Sync-Agent
    participant WS as Socket.IO Server

    Note over FS,WS: === WATCHERS DEMARRES APRES AUTHENTIFICATION ===

    SA->>CW: startConfigWatcher()
    SA->>VW: startVideoWatcher()

    loop Surveillance continue
        FS-->>CW: Fichier configuration.json modifie
        CW->>SA: Trigger syncLocalState()
        SA->>WS: emit('sync_local_state', {config, configHash, ...})
    end

    loop Surveillance continue (debounce 2s)
        FS-->>VW: Fichier video ajoute/supprime/modifie
        VW->>VW: Debounce 2 secondes
        VW->>SA: Trigger syncLocalState()
        SA->>WS: emit('sync_local_state', {videos[], storage, ...})
    end
```

## Resume des Evenements WebSocket

| Evenement                     | Direction             | Frequence           | Donnees                          |
| ----------------------------- | --------------------- | ------------------- | -------------------------------- |
| `authenticate`                | Pi -> Central         | 1x (connexion)      | siteId, apiKey                   |
| `authenticated`               | Central -> Pi         | 1x (reponse)        | message, siteId                  |
| `auth_error`                  | Central -> Pi         | Si echec            | message                          |
| `sync_local_state`            | Pi -> Central         | Connexion + changes | config, videos, storage, network |
| `heartbeat`                   | Pi -> Central         | 30s                 | metrics, timestamp, version      |
| `license_status`              | Central -> Pi         | Apres sync          | status, reason, days_left        |
| `command`                     | Central -> Pi         | A la demande        | id, type, data                   |
| `command_result`              | Pi -> Central         | Apres execution     | commandId, status, result/error  |
| `deploy_progress`             | Pi -> Central         | Pendant deploy      | deploymentId, progress 0-100     |
| `ping_check` / `pong_check`   | Bidirectionnel        | 30s                 | timestamp                        |
| `score-update`, `score-reset` | Central -> Pi (relay) | Live events         | donnees specifiques              |
| `network_alert`               | Pi -> Central         | Sur probleme        | type, severity, issues           |
