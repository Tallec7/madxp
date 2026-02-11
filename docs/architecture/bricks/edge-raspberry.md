# Edge Raspberry Pi — Fiche d'architecture

## M\u00e9tadonn\u00e9es

- Statut: `active`
- Owner: \u00e9quipe NEOPRO
- Derni\u00e8re revue: 2026-02-10
- Version: 3.9.0
- D\u00e9pend de: Central Server (Socket.IO), stockage local
- Impacte: TV (HDMI), t\u00e9l\u00e9commande locale, Admin UI locale

## 1. R\u00f4le

Bo\u00eetier Raspberry Pi 4 install\u00e9 dans chaque club sportif. Diffuse du contenu vid\u00e9o sur une TV via HDMI, offre une t\u00e9l\u00e9commande locale pour le r\u00e9gisseur, et se synchronise avec le cloud quand la connexion internet est disponible. Fonctionne en **autonomie compl\u00e8te** m\u00eame sans internet.

## 2. Responsabilit\u00e9s

- **Diffusion vid\u00e9o** : lecture en boucle de vid\u00e9os sur TV (Angular app port 4200)
- **T\u00e9l\u00e9commande** : contr\u00f4le en temps r\u00e9el via smartphone/tablette (Socket.IO)
- **Admin locale** : interface web (port 8080) pour gestion des vid\u00e9os et cat\u00e9gories
- **Synchronisation cloud** : sync-agent envoie m\u00e9triques, re\u00e7oit d\u00e9ploiements
- **Analytics locales** : collecte des sessions TV, impressions sponsors, plays vid\u00e9o
- **Gestion multi-TV** : architecture master/slave pour sites avec plusieurs \u00e9crans

## 3. Interfaces / Services expos\u00e9s

### Local Server (port 3000) — Socket.IO

| \u00c9v\u00e9nement | Direction            | Payload                             | Description                 |
| ------------------- | -------------------- | ----------------------------------- | --------------------------- |
| `tv-register`       | TV \u2192 Server     | `{}`                                | Enregistrement instance TV  |
| `tv-role-assigned`  | Server \u2192 TV     | `{ role: 'master'\|'slave' }`       | R\u00f4le assign\u00e9      |
| `tv-loop-update`    | Master \u2192 Server | `LoopState`                         | \u00c9tat boucle vid\u00e9o |
| `tv-loop-state`     | Server \u2192 Slaves | `LoopState`                         | Relai \u00e9tat boucle      |
| `recording-state`   | Remote \u2192 Server | `{ isRecording, isManualOverride }` | Contr\u00f4le analytics     |
| `navigate`          | Remote \u2192 TV     | `{ category, subcategory }`         | Navigation cat\u00e9gories  |
| `play-video`        | Remote \u2192 TV     | `{ videoPath }`                     | Lecture vid\u00e9o          |
| `stop-video`        | Remote \u2192 TV     | `{}`                                | Arr\u00eat vid\u00e9o       |

### Local Server (port 3000) — HTTP Routes

| M\u00e9thode | Route              | Description              | Auth         |
| ------------ | ------------------ | ------------------------ | ------------ |
| GET          | `/api/config`      | Configuration locale     | Aucune (LAN) |
| GET          | `/api/videos`      | Liste vid\u00e9os        | Aucune       |
| GET          | `/api/status`      | \u00c9tat syst\u00e8me   | Aucune       |
| POST         | `/api/score`       | Mise \u00e0 jour score   | Aucune       |
| GET          | `/api/license`     | \u00c9tat licence        | Aucune       |
| POST         | `/api/analytics/*` | Enregistrement analytics | Aucune       |

### Admin UI (port 8080) — HTTP Routes

| M\u00e9thode | Route                   | Description                       | Auth                   |
| ------------ | ----------------------- | --------------------------------- | ---------------------- |
| GET/POST     | `/api/config`           | CRUD configuration                | Aucune (LAN)           |
| POST         | `/api/videos/upload`    | Upload vid\u00e9o locale          | Aucune                 |
| DELETE       | `/api/videos/:id`       | Suppression vid\u00e9o            | V\u00e9rification lock |
| GET/POST     | `/api/categories`       | CRUD cat\u00e9gories              | V\u00e9rification lock |
| POST         | `/api/services/restart` | Red\u00e9marrage services         | Aucune                 |
| GET          | `/api/logs`             | Logs syst\u00e8me                 | Aucune                 |
| GET          | `/api/system/status`    | \u00c9tat CPU/m\u00e9moire/disque | Aucune                 |

### Angular Frontend (port 4200)

| Route     | Composant         | Description                         |
| --------- | ----------------- | ----------------------------------- |
| `/login`  | LoginComponent    | Authentification locale             |
| `/tv`     | TvPlayerComponent | Lecteur vid\u00e9o plein \u00e9cran |
| `/remote` | RemoteComponent   | T\u00e9l\u00e9commande tactile      |

## 4. D\u00e9pendances entrantes

| Source              | Protocole               | Donn\u00e9es re\u00e7ues                        | Hypoth\u00e8ses      |
| ------------------- | ----------------------- | ----------------------------------------------- | -------------------- |
| Central Server      | WSS (Socket.IO)         | Commandes, d\u00e9ploiements vid\u00e9o, config | Internet disponible  |
| Cloud Remote        | Socket.IO (relay\u00e9) | Commandes t\u00e9l\u00e9commande cloud          | Via sync-agent relay |
| Op\u00e9rateur club | HTTP (LAN)              | Upload vid\u00e9os, config locale               | R\u00e9seau local    |
| TV (HDMI)           | Socket.IO local         | Connexion player                                | Navigateur Chromium  |

## 5. D\u00e9pendances sortantes

| Cible          | Protocole         | Donn\u00e9es \u00e9mises                                 | Tol\u00e9rance panne             |
| -------------- | ----------------- | -------------------------------------------------------- | -------------------------------- |
| Central Server | WSS               | Heartbeat (30s), config, analytics                       | Offline queue, reconnexion auto  |
| FTP Hostinger  | HTTPS             | T\u00e9l\u00e9chargement vid\u00e9os d\u00e9ploy\u00e9es | Retry backoff, reprise partielle |
| TV (HDMI)      | Signal vid\u00e9o | Flux vid\u00e9o Angular                                  | HDMI CEC control                 |
| Stockage local | Filesystem        | Vid\u00e9os, configuration.json                          | Surveillance VideoWatcher        |

## 6. Donn\u00e9es manipul\u00e9es

| Entit\u00e9        | CRUD | Source de v\u00e9rit\u00e9 | R\u00e8gles d'acc\u00e8s                       |
| ------------------ | ---- | -------------------------- | ---------------------------------------------- |
| configuration.json | CRUD | Locale (Pi)                | Merge NEOPRO content=cloud, Club content=local |
| /videos/           | CRD  | Locale                     | Lock sur vid\u00e9os NEOPRO (non supprimables) |
| analytics buffer   | CR   | Locale                     | Push vers cloud quand connect\u00e9            |
| licence            | R    | Cloud (cache local)        | V\u00e9rifi\u00e9e \u00e0 la connexion         |
| sync history       | CR   | Locale                     | Historique des syncs r\u00e9ussies             |

## 7. Modes de panne et d\u00e9gradation

| Incident                  | D\u00e9tection                        | Effet                                          | Mitigation                                              | Runbook           |
| ------------------------- | ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- | ----------------- |
| Internet coup\u00e9       | network-watchdog.js                   | Pas de sync cloud, fonctionnement local OK     | Offline queue, reconnexion auto                         | \u00c0 cr\u00e9er |
| Disque plein              | M\u00e9triques heartbeat (>90%)       | Impossible d'ajouter des vid\u00e9os           | Alerte cloud + nettoyage auto vid\u00e9os expir\u00e9es | \u00c0 cr\u00e9er |
| Surchauffe CPU            | M\u00e9triques heartbeat (>70\u00b0C) | Throttling, risque crash                       | Alerte PredictiveAlerts, reboot command\u00e9           | \u00c0 cr\u00e9er |
| HDMI d\u00e9connect\u00e9 | hdmi.service.js                       | Pas d'affichage TV                             | CEC auto-detect, alerte locale                          | \u00c0 cr\u00e9er |
| Corruption config         | config-validator.js                   | Config invalide                                | Backup auto (local-backup.js), restauration             | \u00c0 cr\u00e9er |
| Licence expir\u00e9e      | license-cache.js                      | Mode d\u00e9grad\u00e9 (pas de contenu NEOPRO) | Cache licence 24h, alerte cloud                         | \u00c0 cr\u00e9er |

## 8. Observabilit\u00e9

- **Logs** : Console (stdout) + fichiers rotatifs locaux
- **M\u00e9triques** : CPU, m\u00e9moire, temp\u00e9rature, espace disque \u2192 heartbeat toutes les 30s vers cloud
- **Alertes** : D\u00e9tect\u00e9es c\u00f4t\u00e9 cloud via PredictiveAlerts (seuils configurables)
- **Analytics** : Sessions TV, impressions sponsors, plays vid\u00e9o \u2192 buffer local + push cloud

## 9. Tests et validation

- **Local Server** : 71 tests Jest (services, routes, socket handlers)
- **Admin Server** : 124 tests Jest (services, routes, config management)
- **Sync-Agent** : 173 tests Jest (commands, watchers, config-merge, offline-queue)
- **Angular Frontend** : Via `npm start` (port 4200), tests Karma
- **E2E** : Playwright (parcours TV + t\u00e9l\u00e9commande)

## 10. Architecture interne

```
raspberry/
\u251c\u2500\u2500 src/                           # Angular 20 frontend
\u2502   \u251c\u2500\u2500 app/
\u2502   \u2502   \u251c\u2500\u2500 tv/                    # Lecteur vid\u00e9o (master/slave)
\u2502   \u2502   \u251c\u2500\u2500 remote/                # T\u00e9l\u00e9commande tactile
\u2502   \u2502   \u251c\u2500\u2500 login/                 # Authentification locale
\u2502   \u2502   \u2514\u2500\u2500 shared/                # Services partag\u00e9s
\u2502   \u2514\u2500\u2500 assets/
\u251c\u2500\u2500 server/                        # Local Socket.IO server (port 3000)
\u2502   \u251c\u2500\u2500 server.js                  # Orchestrateur (~110 lignes)
\u2502   \u251c\u2500\u2500 services/                  # 5 services
\u2502   \u2502   \u251c\u2500\u2500 state.service.js       # \u00c9tat global (config, videos)
\u2502   \u2502   \u251c\u2500\u2500 buffer.service.js      # Buffer analytics
\u2502   \u2502   \u251c\u2500\u2500 license.service.js     # V\u00e9rification licence
\u2502   \u2502   \u251c\u2500\u2500 hdmi.service.js        # Contr\u00f4le HDMI CEC
\u2502   \u2502   \u2514\u2500\u2500 auth.service.js        # Auth locale
\u2502   \u251c\u2500\u2500 routes/                    # 6 contr\u00f4leurs HTTP
\u2502   \u251c\u2500\u2500 socket/                    # 18 \u00e9v\u00e9nements Socket.IO
\u2502   \u2514\u2500\u2500 __tests__/                 # 71 tests
\u251c\u2500\u2500 admin/                         # Admin UI (port 8080)
\u2502   \u251c\u2500\u2500 admin-server.js            # Orchestrateur (~260 lignes)
\u2502   \u251c\u2500\u2500 services/                  # 7 services m\u00e9tier
\u2502   \u2502   \u251c\u2500\u2500 config.service.js      # Configuration CRUD
\u2502   \u2502   \u251c\u2500\u2500 video.service.js       # Upload/suppression vid\u00e9os
\u2502   \u2502   \u251c\u2500\u2500 category.service.js    # Gestion cat\u00e9gories + lock
\u2502   \u2502   \u251c\u2500\u2500 system.service.js      # \u00c9tat syst\u00e8me (CPU, RAM, temp)
\u2502   \u2502   \u2514\u2500\u2500 ...                    # (3 autres)
\u2502   \u251c\u2500\u2500 routes/                    # 9 contr\u00f4leurs HTTP
\u2502   \u2514\u2500\u2500 __tests__/                 # 124 tests
\u2514\u2500\u2500 sync-agent/                    # Agent de synchronisation cloud
    \u2514\u2500\u2500 (voir brique d\u00e9di\u00e9e sync-agent.md)
```

## 11. Contraintes mat\u00e9rielles

| Ressource   | Limite                                             |
| ----------- | -------------------------------------------------- |
| CPU         | Raspberry Pi 4 (4 cores ARM Cortex-A72)            |
| RAM         | 2-4 GB                                             |
| Stockage    | 32-64 GB microSD                                   |
| R\u00e9seau | WiFi ou Ethernet (souvent instable dans les clubs) |
| Affichage   | HDMI (CEC support)                                 |
| OS          | Raspberry Pi OS (Debian-based)                     |

## 12. Open points

- Admin UI en Express/vanilla JS (pas Angular) \u2014 migration envisag\u00e9e
- Pas de chiffrement du stockage local
- Pas de m\u00e9canisme de rollback automatique des mises \u00e0 jour logicielles
- Feature flags pas encore impl\u00e9ment\u00e9s c\u00f4t\u00e9 Pi
