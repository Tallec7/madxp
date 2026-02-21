# Sync-Agent — Fiche d'architecture

## M\u00e9tadonn\u00e9es

- Statut: `active`
- Owner: \u00e9quipe NEOPRO
- Derni\u00e8re revue: 2026-02-21
- Version: 3.67.0
- D\u00e9pend de: Central Server (Socket.IO), Local Server (port 3000), Admin Server (port 8080)
- Impacte: \u00c9tat de synchronisation du Pi, d\u00e9ploiements vid\u00e9o, analytics cloud

## 1. R\u00f4le

Agent Node.js r\u00e9sident sur le Raspberry Pi qui maintient la connexion Socket.IO avec le Central Server cloud. Il g\u00e8re la synchronisation bidirectionnelle de la configuration, l'ex\u00e9cution des commandes distantes, le t\u00e9l\u00e9chargement des vid\u00e9os d\u00e9ploy\u00e9es, le push d'analytics et le relai des \u00e9v\u00e9nements cloud vers le serveur local.

## 2. Responsabilit\u00e9s

- **Connexion cloud** : maintient Socket.IO WSS avec reconnexion automatique
- **Heartbeat** : envoie m\u00e9triques syst\u00e8me (CPU, RAM, temp, disque) toutes les 30s
- **Sync config** : envoie `sync_local_state` \u00e0 la connexion et apr\u00e8s chaque changement local
- **Ex\u00e9cution commandes** : re\u00e7oit et ex\u00e9cute `deploy_video`, `update_config`, `delete_video`, etc.
- **T\u00e9l\u00e9chargement vid\u00e9os** : download vid\u00e9os depuis FTP avec checksum SHA256
- **Config merge** : fusionne le contenu NEOPRO (cloud) avec le contenu club (local)
- **Analytics push** : pousse sessions TV et plays vid\u00e9o (club + sponsor) vers le cloud via pipeline unifi\u00e9 `video_plays` (v3.66+)
- **Surveillance fichiers** : VideoWatcher + ConfigWatcher d\u00e9tectent les changements locaux
- **Gestion offline** : queue les commandes sortantes quand d\u00e9connect\u00e9
- **Connexion locale persistante** : maintient Socket.IO vers localhost:3000 (singleton `local-socket.js`)
- **Relai cloud remote** : transf\u00e8re les commandes t\u00e9l\u00e9commande cloud vers localhost:3000
- **Expiration vid\u00e9os** : v\u00e9rifie et supprime les vid\u00e9os NEOPRO expir\u00e9es
- **Backup local** : sauvegarde p\u00e9riodique de configuration.json

## 3. Interfaces / Services expos\u00e9s

### Socket.IO (vers Central Server)

| \u00c9v\u00e9nement \u00e9mis | Direction          | Payload                                      | D\u00e9clencheur                         |
| ----------------------------- | ------------------ | -------------------------------------------- | ---------------------------------------- |
| `register`                    | Agent \u2192 Cloud | `{ siteId, apiKey }`                         | Connexion initiale                       |
| `heartbeat`                   | Agent \u2192 Cloud | `{ siteId, metrics: { cpu, memory, temp } }` | Timer 30s                                |
| `sync_local_state`            | Agent \u2192 Cloud | `{ siteId, config, videos, storage }`        | Connexion + changement d\u00e9tect\u00e9 |
| `command_result`              | Agent \u2192 Cloud | `{ commandId, status, result }`              | Apr\u00e8s ex\u00e9cution commande       |
| `deploy_progress`             | Agent \u2192 Cloud | `{ deploymentId, progress, status }`         | Pendant download vid\u00e9o              |
| `license_status`              | Agent \u2192 Cloud | `{ siteId, license }`                        | V\u00e9rification licence                |
| `network_status`              | Agent \u2192 Cloud | `{ siteId, network }`                        | Changement r\u00e9seau                   |
| `score_update`                | Agent \u2192 Cloud | `{ siteId, scores }`                         | Relai depuis local                       |

### Socket.IO (\u00e9v\u00e9nements re\u00e7us du Cloud)

| \u00c9v\u00e9nement re\u00e7u | Payload                                          | Action                              |
| ----------------------------- | ------------------------------------------------ | ----------------------------------- |
| `deploy_video`                | `{ deploymentId, videoUrl, category, filename }` | Download + merge config             |
| `update_config`               | `{ configVersionId, configuration }`             | Merge config locale                 |
| `execute_command`             | `{ commandId, type, data }`                      | Dispatch vers command handler       |
| `delete_video`                | `{ videoPath }`                                  | Suppression fichier + update config |

### Socket.IO (vers Local Server — connexion persistante)

Depuis v3.36.1, le sync-agent maintient une **connexion Socket.IO persistante** vers `localhost:3000` via le singleton `local-socket.js` (au lieu de connexions \u00e9ph\u00e9m\u00e8res cr\u00e9\u00e9es/d\u00e9truites \u00e0 chaque op\u00e9ration). Cette connexion est \u00e9tablie au d\u00e9marrage et r\u00e9utilis\u00e9e pour tous les \u00e9changes locaux.

| M\u00e9thode                    | Description                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `emit(eventName, data)`         | Fire-and-forget : relai cloud remote, config_updated, etc.                                                                             |
| `request(eventName, timeoutMs)` | Callback-based : get-player-state, get-transition-metrics                                                                              |
| `requestScreenshot(data)`       | Capture \u00e9cran TV via \u00e9v\u00e9nement s\u00e9par\u00e9 screenshot-data (relay\u00e9 au central via HTTP response depuis v3.58) |
| `getRecordingState()`           | Cache + fallback explicite get-recording-state                                                                                         |

### HTTP (relai vers Admin Server)

| Cible        | Port | M\u00e9thode | Description                 |
| ------------ | ---- | ------------ | --------------------------- |
| Admin Server | 8080 | HTTP POST    | Notifications config change |

## 4. D\u00e9pendances entrantes

| Source         | Protocole         | Donn\u00e9es re\u00e7ues                     | Hypoth\u00e8ses     |
| -------------- | ----------------- | -------------------------------------------- | ------------------- |
| Central Server | WSS (Socket.IO)   | Commandes, d\u00e9ploiements, config updates | Internet requis     |
| VideoWatcher   | Filesystem events | Changements dans /videos/                    | fs.watch recursive  |
| ConfigWatcher  | Filesystem events | Changements configuration.json               | Debounce 2s         |
| Local Server   | Socket.IO (3000)  | Score updates, recording state               | Toujours disponible |

## 5. D\u00e9pendances sortantes

| Cible               | Protocole | Donn\u00e9es \u00e9mises                             | Tol\u00e9rance panne                                |
| ------------------- | --------- | ---------------------------------------------------- | --------------------------------------------------- |
| Central Server      | WSS       | Heartbeat, config, analytics                         | Offline queue, reconnexion exp backoff              |
| FTP Hostinger       | HTTPS     | Download vid\u00e9os d\u00e9ploy\u00e9es             | Retry backoff, checksum validation                  |
| Local Server (3000) | Socket.IO | Relai commandes cloud remote (connexion persistante) | Reconnexion auto (1-5s backoff)                     |
| Filesystem          | I/O       | Vid\u00e9os, configuration.json, backups             | V\u00e9rification espace disque avant \u00e9criture |

## 6. Donn\u00e9es manipul\u00e9es

| Entit\u00e9        | CRUD | Source de v\u00e9rit\u00e9      | R\u00e8gles d'acc\u00e8s                        |
| ------------------ | ---- | ------------------------------- | ----------------------------------------------- |
| configuration.json | CRUD | Locale (merge cloud+local)      | Lock cat\u00e9gories NEOPRO (c\u00f4t\u00e9 Pi) |
| /videos/           | CRD  | Locale                          | Download cloud, upload local admin              |
| offline-queue      | CR   | Locale (m\u00e9moire + fichier) | Replay \u00e0 la reconnexion                    |
| sync-history       | CR   | Locale                          | Historique des syncs                            |
| analytics buffer   | CR   | Locale                          | Push vers cloud p\u00e9riodique                 |
| licence cache      | RU   | Cloud (TTL 24h)                 | V\u00e9rifi\u00e9e \u00e0 la connexion          |

## 7. Modes de panne et d\u00e9gradation

| Incident                 | D\u00e9tection                               | Effet                             | Mitigation                                                                                                    | Runbook           |
| ------------------------ | -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------- |
| Internet coup\u00e9      | network-watchdog.js (actif d\u00e8s le boot) | Pas de sync cloud                 | Watchdog 6 phases recovery (reconfigure \u2192 modprobe \u2192 USB), cooldown 30s+retry (pas de process.exit) | \u00c0 cr\u00e9er |
| Central Server down      | Socket.IO disconnect                         | Pas de commandes cloud            | Reconnexion auto avec cooldown 30s apr\u00e8s 10 \u00e9checs, fonctionnement local pr\u00e9serv\u00e9         | \u00c0 cr\u00e9er |
| FTP download \u00e9choue | Erreur basic-ftp                             | Vid\u00e9o non d\u00e9ploy\u00e9e | Retry 3x avec backoff, report progress "failed"                                                               | \u00c0 cr\u00e9er |
| Checksum mismatch        | SHA256 v\u00e9rification                     | Vid\u00e9o corrompue              | Re-download, alerte cloud                                                                                     | \u00c0 cr\u00e9er |
| Disque plein             | V\u00e9rification avant \u00e9criture        | Impossible de sauver vid\u00e9o   | Rejet avec erreur, alerte cloud                                                                               | \u00c0 cr\u00e9er |
| Config corrompue         | config-validator.js                          | Merge impossible                  | Restauration depuis backup (local-backup.js)                                                                  | \u00c0 cr\u00e9er |
| Agent crash              | systemd watchdog                             | Plus de sync                      | Restart auto systemd, alerte zombie c\u00f4t\u00e9 cloud                                                      | \u00c0 cr\u00e9er |

## 8. Observabilit\u00e9

- **Logs** : Console (stdout) + logger.js (structured), captur\u00e9s par systemd/journalctl
- **M\u00e9triques** : CPU, m\u00e9moire, temp\u00e9rature, espace disque \u2192 heartbeat 30s
- **\u00c9tat connexion** : connection-status.js track online/offline/reconnecting
- **Alertes** : D\u00e9tect\u00e9es c\u00f4t\u00e9 cloud (zombie detection si pas de heartbeat >3min)
- **Network** : network-detector.js + network-watchdog.js surveillent la connectivit\u00e9

## 9. Tests et validation

- **Unitaires** : 172 tests Jest
  - config-merge.test.js (merge intelligent)
  - deploy-video.test.js (download + checksum)
  - commands.test.js (dispatch commandes)
  - offline-queue.test.js (queue offline)
  - connection-status.test.js (gestion connexion)
  - expiration-checker.test.js (vid\u00e9os expir\u00e9es)
  - sync-history.test.js (historique)
  - config.test.js (configuration)
- **Int\u00e9gration** : Tests manuels avec Central Server de dev
- **E2E** : Playwright (parcours d\u00e9ploiement complet)

## 10. Architecture interne

```
raspberry/sync-agent/
\u251c\u2500\u2500 src/
\u2502   \u251c\u2500\u2500 agent.js                     # Point d'entr\u00e9e (Socket.IO client)
\u2502   \u251c\u2500\u2500 config.js                    # Configuration (siteId, apiKey, URLs)
\u2502   \u251c\u2500\u2500 types.js                     # Types/constantes
\u2502   \u251c\u2500\u2500 logger.js                    # Logger structur\u00e9
\u2502   \u251c\u2500\u2500 metrics.js                   # Collecte m\u00e9triques syst\u00e8me
\u2502   \u251c\u2500\u2500 analytics.js                 # Buffer + push analytics (pipeline unifi\u00e9 v3.66+)
\u2502   \u251c\u2500\u2500 license-cache.js             # Cache licence (TTL 24h)
\u2502   \u2502
\u2502   \u251c\u2500\u2500 commands/                    # 14 modules de commandes
\u2502   \u2502   \u251c\u2500\u2500 index.js                 # Dispatch table
\u2502   \u2502   \u251c\u2500\u2500 deploy-video.js          # Download vid\u00e9o + merge config
\u2502   \u2502   \u251c\u2500\u2500 delete-video.js          # Suppression vid\u00e9o + update config
\u2502   \u2502   \u251c\u2500\u2500 update-config.js         # Merge configuration cloud
\u2502   \u2502   \u251c\u2500\u2500 update-software.js       # Mise \u00e0 jour logicielle OTA
\u2502   \u2502   \u251c\u2500\u2500 deploy-asset.js          # D\u00e9ploiement watermarks/logos
\u2502   \u2502   \u251c\u2500\u2500 diagnostics.js           # Diagnostic syst\u00e8me complet
\u2502   \u2502   \u251c\u2500\u2500 network-diagnostics.js   # Diagnostic r\u00e9seau
\u2502   \u2502   \u251c\u2500\u2500 remote-shell.js          # Shell distant s\u00e9curis\u00e9
\u2502   \u2502   \u251c\u2500\u2500 debug-bundle.js          # Bundle debug pour support (15 sections)
\u2502   \u2502   \u251c\u2500\u2500 wifi-bssid.js            # Config WiFi BSSID
\u2502   \u2502   \u251c\u2500\u2500 wifi-client.js           # Scan & connect WiFi client (wlan1)
\u2502   \u2502   \u251c\u2500\u2500 hotspot.js               # Activation hotspot
\u2502   \u2502   \u251c\u2500\u2500 analytics-buffer.js      # Flush buffer analytics
\u2502   \u2502   \u2514\u2500\u2500 sync-profiles.js         # Sync & switch profils multi-config
\u2502   \u2502
\u2502   \u251c\u2500\u2500 services/                    # 7 services
\u2502   \u2502   \u251c\u2500\u2500 local-socket.js          # Connexion Socket.IO persistante vers localhost:3000
\u2502   \u2502   \u251c\u2500\u2500 connection-status.js     # Track \u00e9tat connexion cloud
\u2502   \u2502   \u251c\u2500\u2500 offline-queue.js         # Queue commandes offline
\u2502   \u2502   \u251c\u2500\u2500 network-detector.js      # D\u00e9tection type r\u00e9seau
\u2502   \u2502   \u251c\u2500\u2500 network-watchdog.js      # Surveillance connectivit\u00e9
\u2502   \u2502   \u251c\u2500\u2500 safe-network-operations.js # Op\u00e9rations r\u00e9seau s\u00e9curis\u00e9es
\u2502   \u2502   \u2514\u2500\u2500 sync-history.js          # Historique synchronisations
\u2502   \u2502
\u2502   \u251c\u2500\u2500 watchers/                    # 2 watchers filesystem
\u2502   \u2502   \u251c\u2500\u2500 video-watcher.js         # Surveillance /videos/ (debounce 2s)
\u2502   \u2502   \u2514\u2500\u2500 config-watcher.js        # Surveillance configuration.json
\u2502   \u2502
\u2502   \u251c\u2500\u2500 tasks/                       # 2 t\u00e2ches planifi\u00e9es
\u2502   \u2502   \u251c\u2500\u2500 expiration-checker.js    # V\u00e9rification expiration vid\u00e9os
\u2502   \u2502   \u2514\u2500\u2500 local-backup.js          # Backup p\u00e9riodique config
\u2502   \u2502
\u2502   \u251c\u2500\u2500 utils/                       # Utilitaires
\u2502   \u2502   \u251c\u2500\u2500 config-merge.js          # Algorithme merge NEOPRO/Club
\u2502   \u2502   \u251c\u2500\u2500 config-validator.js      # Validation configuration
\u2502   \u2502   \u2514\u2500\u2500 version-info.js          # Info version logicielle
\u2502   \u2502
\u2502   \u2514\u2500\u2500 __tests__/                   # 172 tests Jest
\u2514\u2500\u2500 package.json
```

### Debug bundle (`export_debug_bundle`)

Collecte 15 sections de diagnostic en une seule commande (timeout 60s) :

| #   | Section               | Source                      | Contenu                                                                                                    |
| --- | --------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | `configuration`       | `configuration.json`        | Config Pi sanitisée (API key tronquée, password masqué)                                                    |
| 2   | `version` / `release` | `VERSION`, `release.json`   | Version logicielle et métadonnées build                                                                    |
| 3   | `health`              | `metrics.js`                | CPU, RAM, température, throttling, health score                                                            |
| 4   | `systemInfo`          | `metrics.js`                | Uptime, hostname, OS, modèle Pi                                                                            |
| 5   | `services`            | `metrics.js`                | Statut systemd de tous les services neopro-\*                                                              |
| 6   | `logs`                | `journalctl`                | 24h × 6 services (sync-agent, app cap 500 lignes, kiosk, admin, nginx, hostapd)                            |
| 7   | `network`             | `network-diagnostics.js`    | Internet (ping + perte paquets), DNS, gateway, serveur central (HTTP/SSL/port 443), WiFi signal, stabilité |
| 8   | `diskUsage`           | `df -h`                     | Espace disque par partition                                                                                |
| 9   | `buffers`             | `analytics-buffer.js`       | Statut buffers analytics et sponsors                                                                       |
| 10a | `hotspotConfig`       | `hostapd.conf`              | Configuration hotspot (sans passphrase)                                                                    |
| 10b | `hotspotDiagnostics`  | Commandes système           | Clients connectés, scan canaux WiFi, hostapd/dnsmasq status, rfkill, mode AP wlan0                         |
| 11  | `bootConfig`          | `/boot/config.txt`          | Configuration boot (gpu_mem, etc.)                                                                         |
| 12  | `transitionMetrics`   | Socket.IO local (read-only) | Métriques de transition vidéo (sans reset des compteurs)                                                   |
| 13  | `dmesg`               | `dmesg` (kernel)            | 200 dernières lignes kernel — erreurs USB, filesystem, OOM                                                 |
| 14  | `usbDevices`          | `lsusb`                     | Inventaire périphériques USB (clés WiFi, etc.)                                                             |
| 15  | `videoFiles`          | Filesystem                  | Liste des fichiers vidéo déployés (max 50)                                                                 |

Sécurité : chaque section a son propre try/catch (un échec n'empêche pas les autres). Les données sensibles sont systématiquement masquées.

## 11. S\u00e9quence de d\u00e9marrage

```
start()
  \u2502 1. Validation configuration (exit si invalide)
  \u2502 2. Analytics sync (HTTP, ind\u00e9pendant du WS \u2014 pipeline unifi\u00e9 video_plays v3.66+)
  \u2502 3. Expiration checker
  \u2502 5. Local backup
  \u2502 6. Network watchdog (surveille wlan0/wlan1 d\u00e8s le boot)
  \u2502 7. localSocket.connect() \u2192 Socket.IO persistant vers localhost:3000
  \u2502 8. connect() \u2192 Socket.IO cloud (async, reconnexion auto)
  \u25bc
handleAuthenticated()
  \u2502 9. Config/Video watchers
  \u2502 10. Heartbeat (30s)
  \u2502 11. Connection health check (60s)
  \u2502 12. Network profile detection (1h)
  \u2502 13. Binding pong events pour watchdog cloud
  \u2502 14. Traitement offline queue
  \u25bc
```

**Important :** Le watchdog r\u00e9seau (6) d\u00e9marre **avant** les connexions Socket.IO (7-8). La connexion locale persistante (7) est \u00e9tablie avant la connexion cloud (8) pour que les relais soient imm\u00e9diatement op\u00e9rationnels d\u00e8s l'authentification. Si le r\u00e9seau est coup\u00e9 au boot, le watchdog tente la recovery pendant que le sync-agent boucle sur les tentatives de connexion. Apr\u00e8s 10 \u00e9checs Socket.IO, le sync-agent attend 30s puis retente (pas de `process.exit`), laissant le watchdog actif en continu.

## 12. Flux critiques

### D\u00e9ploiement vid\u00e9o (Cloud \u2192 Pi)

```
Central Server
  \u2502 emit('deploy_video', { deploymentId, videoUrl, category, filename })
  \u25bc
Sync-Agent (agent.js)
  \u2502 dispatch vers commands/deploy-video.js
  \u25bc
deploy-video.js
  \u2502 1. V\u00e9rifier espace disque
  \u2502 2. T\u00e9l\u00e9charger depuis FTP (streaming)
  \u2502 3. V\u00e9rifier checksum SHA256
  \u2502 4. Sauver dans /videos/{category}/{filename}
  \u2502 5. Merge configuration.json (contenu NEOPRO = locked)
  \u2502 6. Emit deploy_progress (100%)
  \u25bc
Local Server (3000) notifi\u00e9 via ConfigWatcher
```

### Synchronisation config (Pi \u2192 Cloud)

```
VideoWatcher d\u00e9tecte changement /videos/
  \u2502 ou ConfigWatcher d\u00e9tecte changement configuration.json
  \u25bc
Sync-Agent
  \u2502 emit('sync_local_state', { config, videos, storage })
  \u25bc
Central Server
  \u2502 config-sync.handler.ts
  \u2502 UPDATE sites SET local_config_mirror = enrichedConfig
  \u25bc
Dashboard voit l'\u00e9tat mis \u00e0 jour
```

## 13. Open points

- Code en JavaScript (pas TypeScript) \u2014 migration envisag\u00e9e
- Pas de tests d'int\u00e9gration automatis\u00e9s avec le Central Server
- Pas de m\u00e9canisme de rollback apr\u00e8s un deploy_video \u00e9chou\u00e9 partiellement
- Offline queue en m\u00e9moire (perdue au restart de l'agent)
