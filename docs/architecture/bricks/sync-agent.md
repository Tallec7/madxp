# Sync-Agent — Fiche d'architecture

## M\u00e9tadonn\u00e9es

- Statut: `active`
- Owner: \u00e9quipe NEOPRO
- Derni\u00e8re revue: 2026-02-15
- Version: 3.20.0
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
- **Analytics push** : pousse sessions TV, impressions sponsors, plays vid\u00e9o vers le cloud
- **Surveillance fichiers** : VideoWatcher + ConfigWatcher d\u00e9tectent les changements locaux
- **Gestion offline** : queue les commandes sortantes quand d\u00e9connect\u00e9
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

### HTTP (relai vers serveur local)

| Cible        | Port | M\u00e9thode   | Description                             |
| ------------ | ---- | -------------- | --------------------------------------- |
| Local Server | 3000 | Socket.IO emit | Relai \u00e9v\u00e9nements cloud remote |
| Admin Server | 8080 | HTTP POST      | Notifications config change             |

## 4. D\u00e9pendances entrantes

| Source         | Protocole         | Donn\u00e9es re\u00e7ues                     | Hypoth\u00e8ses     |
| -------------- | ----------------- | -------------------------------------------- | ------------------- |
| Central Server | WSS (Socket.IO)   | Commandes, d\u00e9ploiements, config updates | Internet requis     |
| VideoWatcher   | Filesystem events | Changements dans /videos/                    | fs.watch recursive  |
| ConfigWatcher  | Filesystem events | Changements configuration.json               | Debounce 2s         |
| Local Server   | Socket.IO (3000)  | Score updates, recording state               | Toujours disponible |

## 5. D\u00e9pendances sortantes

| Cible               | Protocole | Donn\u00e9es \u00e9mises                 | Tol\u00e9rance panne                                |
| ------------------- | --------- | ---------------------------------------- | --------------------------------------------------- |
| Central Server      | WSS       | Heartbeat, config, analytics             | Offline queue, reconnexion exp backoff              |
| FTP Hostinger       | HTTPS     | Download vid\u00e9os d\u00e9ploy\u00e9es | Retry backoff, checksum validation                  |
| Local Server (3000) | Socket.IO | Relai commandes cloud remote             | Doit \u00eatre up (localhost)                       |
| Filesystem          | I/O       | Vid\u00e9os, configuration.json, backups | V\u00e9rification espace disque avant \u00e9criture |

## 6. Donn\u00e9es manipul\u00e9es

| Entit\u00e9        | CRUD | Source de v\u00e9rit\u00e9      | R\u00e8gles d'acc\u00e8s               |
| ------------------ | ---- | ------------------------------- | -------------------------------------- |
| configuration.json | CRUD | Locale (merge cloud+local)      | Lock cat\u00e9gories NEOPRO            |
| /videos/           | CRD  | Locale                          | Download cloud, upload local admin     |
| offline-queue      | CR   | Locale (m\u00e9moire + fichier) | Replay \u00e0 la reconnexion           |
| sync-history       | CR   | Locale                          | Historique des syncs                   |
| analytics buffer   | CR   | Locale                          | Push vers cloud p\u00e9riodique        |
| licence cache      | RU   | Cloud (TTL 24h)                 | V\u00e9rifi\u00e9e \u00e0 la connexion |

## 7. Modes de panne et d\u00e9gradation

| Incident                 | D\u00e9tection                        | Effet                             | Mitigation                                                | Runbook           |
| ------------------------ | ------------------------------------- | --------------------------------- | --------------------------------------------------------- | ----------------- |
| Internet coup\u00e9      | network-watchdog.js                   | Pas de sync cloud                 | Offline queue, reconnexion auto avec backoff exponentiel  | \u00c0 cr\u00e9er |
| Central Server down      | Socket.IO disconnect                  | Pas de commandes cloud            | Reconnexion auto, fonctionnement local pr\u00e9serv\u00e9 | \u00c0 cr\u00e9er |
| FTP download \u00e9choue | Erreur basic-ftp                      | Vid\u00e9o non d\u00e9ploy\u00e9e | Retry 3x avec backoff, report progress "failed"           | \u00c0 cr\u00e9er |
| Checksum mismatch        | SHA256 v\u00e9rification              | Vid\u00e9o corrompue              | Re-download, alerte cloud                                 | \u00c0 cr\u00e9er |
| Disque plein             | V\u00e9rification avant \u00e9criture | Impossible de sauver vid\u00e9o   | Rejet avec erreur, alerte cloud                           | \u00c0 cr\u00e9er |
| Config corrompue         | config-validator.js                   | Merge impossible                  | Restauration depuis backup (local-backup.js)              | \u00c0 cr\u00e9er |
| Agent crash              | systemd watchdog                      | Plus de sync                      | Restart auto systemd, alerte zombie c\u00f4t\u00e9 cloud  | \u00c0 cr\u00e9er |

## 8. Observabilit\u00e9

- **Logs** : Console (stdout) + logger.js (structured), captur\u00e9s par systemd/journalctl
- **M\u00e9triques** : CPU, m\u00e9moire, temp\u00e9rature, espace disque \u2192 heartbeat 30s
- **\u00c9tat connexion** : connection-status.js track online/offline/reconnecting
- **Alertes** : D\u00e9tect\u00e9es c\u00f4t\u00e9 cloud (zombie detection si pas de heartbeat >3min)
- **Network** : network-detector.js + network-watchdog.js surveillent la connectivit\u00e9

## 9. Tests et validation

- **Unitaires** : 173 tests Jest
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
\u2502   \u251c\u2500\u2500 analytics.js                 # Buffer + push analytics
\u2502   \u251c\u2500\u2500 license-cache.js             # Cache licence (TTL 24h)
\u2502   \u251c\u2500\u2500 sponsor-impressions.js       # Compteur impressions sponsors
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
\u2502   \u251c\u2500\u2500 services/                    # 4 services
\u2502   \u2502   \u251c\u2500\u2500 connection-status.js     # Track \u00e9tat connexion
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
\u2502   \u2514\u2500\u2500 __tests__/                   # 173 tests Jest
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
| 6   | `logs`                | `journalctl`                | 100 dernières lignes × 6 services (sync-agent, app, kiosk, admin, nginx, hostapd)                          |
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

## 11. Flux critiques

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

## 12. Open points

- Code en JavaScript (pas TypeScript) \u2014 migration envisag\u00e9e
- Pas de tests d'int\u00e9gration automatis\u00e9s avec le Central Server
- Pas de m\u00e9canisme de rollback apr\u00e8s un deploy_video \u00e9chou\u00e9 partiellement
- Offline queue en m\u00e9moire (perdue au restart de l'agent)
