# Architecture Neopro

## Diagrammes de Sequence

> Diagrammes Mermaid detailles des flux critiques (prerequis pour le refactoring)

- [01 - Authentification](diagrams/01-auth-sequence.md) : Login -> JWT -> MFA -> Cookie -> Requetes authentifiees
- [02 - Sync Pi <-> Cloud](diagrams/02-sync-pi-cloud-sequence.md) : Connexion -> Heartbeat -> Etat -> Commandes
- [03 - Deploiement Video](diagrams/03-video-deployment-sequence.md) : Upload -> FTP -> Deploy -> Pi -> Checksum

## Vue d'ensemble

Neopro est une plateforme distribuée Edge + Cloud pour la diffusion de contenu vidéo dans les clubs sportifs.

```
┌─────────────────────────────────────────────────────────────┐
│                         CLOUD LAYER                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ Central Dashboard│  │  Central Server  │  │  Socket.IO │ │
│  │   (Angular 20)   │  │ (Node.js/Express)│  │   Server   │ │
│  │   Port: 443      │  │   Port: 443      │  │  Port: 443 │ │
│  │                  │  │                  │  │            │ │
│  │  - Gestion sites │  │  - API REST      │  │  - WebRTC  │ │
│  │  - Analytics     │  │  - Auth (JWT)    │  │  - Events  │ │
│  │  - Rapports PDF  │  │  - PostgreSQL    │  │            │ │
│  │  - Sponsors      │  │  - Redis cache   │  │            │ │
│  └──────┬───────────┘  └──────┬───────────┘  └──────┬─────┘ │
│         │                     │                     │       │
│         └─────────────────────┴─────────────────────┘       │
│                               │                             │
└───────────────────────────────┼─────────────────────────────┘
                                │
                      ┌─────────▼─────────┐
                      │   Internet HTTPS  │
                      └─────────┬─────────┘
                                │
┌───────────────────────────────┼─────────────────────────────┐
│                         EDGE LAYER                           │
│                     (Raspberry Pi 4)                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │  Sync Agent      │  │   Local Server   │  │  Admin UI  │ │
│  │   (Node.js)      │  │   (Socket.IO)    │  │  (Express) │ │
│  │                  │  │                  │  │            │ │
│  │  - Heartbeat     │  │  - Port: 3000    │  │  Port: 8080│ │
│  │  - Config sync   │  │  - TV control    │  │            │ │
│  │  - Video sync    │  │  - Remote events │  │  - Config  │ │
│  │  - Analytics push│  │  - State mgmt    │  │  - Logs    │ │
│  └──────┬───────────┘  └──────┬───────────┘  └──────┬─────┘ │
│         │                     │                     │       │
│         └─────────────────────┴─────────────────────┘       │
│                               │                             │
│                   ┌───────────▼───────────┐                 │
│                   │   Angular Frontend    │                 │
│                   │    (Port: 4200)       │                 │
│                   │                       │                 │
│                   │  /login   - Auth      │                 │
│                   │  /tv      - Player    │                 │
│                   │  /remote  - Control   │                 │
│                   └───────────────────────┘                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture multi-packages

### Packages principaux

```
neopro/ (monorepo)
│
├── raspberry/                      # Edge application
│   ├── src/                        # Angular frontend (TV/Remote/Login)
│   ├── server/                     # Socket.IO local server (Express modulaire)
│   │   ├── server.js               #   Orchestrateur (~110 lignes)
│   │   ├── helpers.js              #   Constantes partagées
│   │   ├── services/               #   5 services (state, buffer, license, hdmi, auth)
│   │   ├── routes/                 #   6 contrôleurs HTTP minces
│   │   ├── socket/                 #   Handlers Socket.IO (18 events)
│   │   ├── __tests__/              #   Tests Jest (71 tests)
│   │   └── package.json
│   ├── admin/                      # Admin interface (Express modulaire)
│   │   ├── admin-server.js         #   Orchestrateur (~260 lignes)
│   │   ├── helpers.js              #   Utilitaires partagés (exec, paths)
│   │   ├── services/               #   7 services métier
│   │   ├── routes/                 #   9 contrôleurs HTTP minces
│   │   ├── __tests__/              #   Tests Jest (60%+ couverture)
│   │   └── package.json
│   └── sync-agent/                 # Sync service with cloud
│       └── package.json
│
├── central-server/                 # Cloud API backend
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── services/
│   └── package.json
│
├── central-dashboard/              # Cloud admin dashboard
│   ├── src/app/
│   │   ├── features/
│   │   ├── core/
│   │   └── shared/
│   └── package.json
│
├── e2e/                           # End-to-end tests
│   └── package.json
│
└── package.json                    # Root workspace
```

### Dépendances entre packages

```
┌─────────────────────────────────────────────────────────┐
│                    ROOT WORKSPACE                        │
│                   (Angular 20 CLI)                       │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  raspberry   │  │central-dash  │  │central-server│
│  (Angular 20)│  │ (Angular 20) │  │ (Express TS) │
└──────────────┘  └──────────────┘  └──────────────┘
        │                 │                 │
        │                 └────────┬────────┘
        │                          │
        ▼                          ▼
┌──────────────┐          ┌──────────────┐
│ sync-agent   │───API───▶│  Supabase    │
│ (Node.js)    │          │ (PostgreSQL) │
└──────────────┘          └──────────────┘
        │
        ▼
┌──────────────┐
│local-server  │
│ (Socket.IO)  │
└──────────────┘
```

---

## Flux de données

### 1. Configuration synchronization

```
Central Dashboard (Admin édite config)
         │
         ▼
Central Server API (/api/sites/:id/config)
         │
         ▼
PostgreSQL (pending_config column)
         │
         ▼
Sync Agent (polling /api/sites/status)
         │
         ▼
Merge local + remote config
         │
         ▼
/home/pi/neopro/public/configuration.json
         │
         ▼
Angular frontend (reload config)
```

### 2. Analytics tracking

```
TV Frontend (impression sponsor)
         │
         ▼
Local Server (WebSocket event)
         │
         ▼
Sync Agent (buffer + batch)
         │
         ▼
Central Server API (/api/sponsor-analytics/impressions)
         │
         ▼
PostgreSQL (sponsor_impressions table)
         │
         ▼
Dashboard Analytics (Chart.js graphs)
```

### 3. Remote control

```
Remote UI (mobile)
         │
         ▼
Local Server (Socket.IO :3000)
         │
         ▼
TV Frontend (player commands)
         │
         ▼
Video.js API (play/pause/seek)
```

---

## Technologies par composant

| Composant              | Stack                                                                  | Base de données                               | Déploiement            |
| ---------------------- | ---------------------------------------------------------------------- | --------------------------------------------- | ---------------------- |
| `raspberry/src`        | Angular 20, Video.js 8.x, Socket.IO client                             | -                                             | Raspberry Pi (systemd) |
| `raspberry/server`     | Node.js, Socket.IO 4.8                                                 | -                                             | Raspberry Pi (systemd) |
| `raspberry/admin`      | Express, vanilla JS                                                    | -                                             | Raspberry Pi (systemd) |
| `raspberry/sync-agent` | Node.js 20, Axios, SHA256 checksum                                     | -                                             | Raspberry Pi (systemd) |
| `central-server`       | Node.js 20+, Express 4.18, TypeScript 5.9, Winston, Repository Pattern | Supabase (PostgreSQL), FTP Hostinger (vidéos) | Railway                |
| `central-dashboard`    | Angular 20.3, Chart.js 4.5, Leaflet                                    | -                                             | Hostinger (static)     |
| `e2e`                  | Playwright                                                             | -                                             | CI/CD                  |

---

## Stratégies de déploiement

### Edge (Raspberry Pi)

**Méthode 1 : Golden Image (recommandé)**

- Image SD pré-configurée
- Flash + boot = 10 minutes
- Script : `raspberry/tools/prepare-golden-image.sh`

**Méthode 2 : Installation manuelle**

- `install.sh` (30 min) + `setup-new-club.sh` (10 min)
- Configuration via CLI interactive
- Documentation : `docs/INSTALLATION_COMPLETE.md`

**Méthode 3 : Mise à jour OTA (Over-The-Air)**

- Via Dashboard Central : déploiement planifié ou immédiat
- `updateDeploymentService.startDeployment()` déclenche la mise à jour
- Le Raspberry Pi : backup, téléchargement, installation, redémarrage
- ~10 minutes (backup + download + restart)

### Cloud

**Infrastructure as Code**

- `render.yaml` : Central Server, Dashboard
- `docker-compose.yml` : Stack locale (dev)

**CI/CD**

- GitHub Actions (via `.github/workflows/`)
- Auto-deploy sur push main
- Tests E2E avant deploy

---

## Patterns architecturaux

### 1. Edge Computing

- Processing local (lecture vidéo, UI)
- Sync asynchrone avec cloud
- Offline-first design

### 2. Event-Driven

- WebSocket pour temps réel
- Event sourcing (analytics)
- Command Queue pour offline sites

### 3. Multi-tenancy

- Row-Level Security (Supabase)
- Isolation par `site_id`
- RLS Context middleware

### 4. Configuration as Code

- Templates JSON versionnés
- Merge intelligent (central overrides)
- Schema validation

### 5. Repository Pattern (central-server)

- Accès base de données exclusivement via repositories (`siteRepository`, `alertRepository`, etc.)
- 13 repositories couvrant 100% des accès PostgreSQL
- Règle ESLint interdisant `import { query }` dans les controllers
- Requêtes SQL paramétrées uniquement (`$1`, `$2`, etc.)

### 6. Structured Logging (Winston)

- Winston remplace console.log dans central-server
- Correlation ID pour traçabilité distribuée
- Niveaux : error, warn, info, debug
- Format JSON structuré en production

### 7. Monitoring & Observability

- Prometheus metrics (Port 9090)
- Grafana dashboards (Port 3000)
- Systemd journald logs
- Winston structured logging with Correlation ID
- Memory Manager Service (heap monitoring, pressure cleanup)
- Health checks (/health, /live, /ready)

### 8. Alerting Multi-Canal

- Email (SMTP via emailService)
- Webhook (POST JSON vers URL configurable)
- Slack (Incoming Webhooks avec Block Kit)
- Escalade automatique vers superviseurs

---

## Sécurité

### Authentification

- **Admin** : JWT (Supabase Auth)
- **Raspberry Pi** : Mot de passe local (bcrypt)
- **API** : Bearer tokens

### Réseau

- HTTPS everywhere (Let's Encrypt)
- WiFi AP isolé (hostapd)
- Firewall ufw (ports 80, 443, 8080, 3000)

---

## Modes réseau Raspberry Pi

Le Raspberry Pi peut fonctionner dans différents modes réseau :

### Mode 1 : Hotspot seul (100% autonome)

```
┌──────────────────────────────────────────────────────────────────┐
│                    RASPBERRY PI (192.168.4.1)                     │
│                                                                   │
│  wlan0: Hotspot "NEOPRO_xxx"     wlan1: Non utilisé              │
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Nginx     │    │ Socket.IO   │    │      Chromium       │  │
│  │  Port 80    │    │  Port 3000  │    │    /tv (kiosk)      │  │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘  │
│         │                  │                      │              │
│         └──────────────────┼──────────────────────┘              │
│                            │ Communication locale                │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                   WiFi (192.168.4.x)
                             │
                    ┌────────▼────────┐
                    │   TÉLÉPHONE     │
                    │   /remote       │
                    └─────────────────┘
```

**Fonctionnalités disponibles :**

- Lecture vidéos locales
- Télécommande /remote
- Score live, Timer, Breaking news
- **Pas de sync cloud**

### Mode 2 : Hotspot + WiFi externe (hybride)

```
┌──────────────────────────────────────────────────────────────────┐
│                    RASPBERRY PI                                   │
│                                                                   │
│  wlan0: Hotspot "NEOPRO_xxx"     wlan1: WiFi externe (internet)  │
│  (pour télécommande locale)       (pour sync cloud)              │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Sync-Agent                           │   │
│  │  - Heartbeat cloud (30s)                                  │   │
│  │  - Push analytics                                         │   │
│  │  - Pull config                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**Fonctionnalités disponibles :**

- Toutes les fonctions du Mode 1
- Synchronisation cloud
- Analytics et impressions sponsors
- Mise à jour OTA

### Communication Socket.IO locale

```
Remote (téléphone)                    TV (Chromium kiosk)
      │                                      ▲
      │ emit('command', data)               │
      ▼                                      │
┌─────────────────────────────────────────────┐
│           Socket.IO Server (:3000)          │
│                                             │
│  socket.on('command') → io.emit('action')  │
└─────────────────────────────────────────────┘

Événements :
- command/action : vidéos, sponsors
- score-update/score-reset : score live
- phase-change : avant/pendant/après match
- options-update : overlay config
- breaking-news : flash info
- timer-update : chronomètre
```

### Dépendances critiques en mode offline

Pour fonctionner sans internet, le build Angular doit inclure :

| Ressource        | Emplacement  | Raison                  |
| ---------------- | ------------ | ----------------------- |
| socket.io.min.js | assets/      | Communication WebSocket |
| video.js         | bundled      | Lecture vidéo           |
| polices          | media/       | Material Icons          |
| i18n/\*.json     | assets/i18n/ | Traductions             |

### Secrets

- `.env` (gitignored)
- Supabase anon key (RLS protected)
- Service role key (backend only)
- FTP credentials (Hostinger)

### Stockage vidéo

- **Production** : FTP Hostinger (`kalonpartners.bzh/neopro-video/`)
- **Fallback** : Supabase Storage
- **URLs publiques** : `https://kalonpartners.bzh/neopro-video/{uuid}.mp4`

---

## Performance

### Optimisations frontend

- Lazy loading routes
- Video.js streaming
- SCSS compilation
- Service Worker (PWA ready)

### Optimisations backend

- Redis cache (sessions, config)
- PostgreSQL indexes
- Connection pooling configurable (`DB_POOL_MAX`, defaut 10, clamp 1-50)
- Rate limiting (per-user based)
- Memory Manager with automatic cleanup at 93% heap usage
- Bounded Maps/Arrays to prevent memory leaks (pendingCommands: 100, jobs: 100)
- Node.js heap limit: 256MB (Railway Hobby plan optimization)
- Video upload en disk storage + streaming FTP (pas de buffer memoire)
- Batch insert analytics (`video_plays`) par lots de 100

### Optimisations edge

- Local video storage
- Zero latency control
- Offline playback

---

## Scalabilité

### Horizontal

- Central Server : Multi-instance (Render)
- Socket Server : Sticky sessions (Redis adapter)
- Database : Supabase managed scaling

### Vertical

- Raspberry Pi 4 (4GB RAM)
- 32GB SD card minimum
- H.264 hardware decode

---

## Roadmap technique

### Phase 1 : MVP (✅ Complété)

- Lecteur vidéo
- Télécommande
- Configuration locale

### Phase 2 : Cloud (✅ Complété)

- Dashboard central
- API REST
- Synchronisation

### Phase 3 : Analytics (✅ Complété)

- Tracking sponsors
- Rapports PDF
- Graphiques temps réel

### Phase 4 : Intelligence (🚧 En cours)

- Estimation audience (caméra RPi)
- Score live (websocket)
- Prédictions ML

### Phase 5 : Scale (📋 Backlog)

- Multi-tenant SaaS
- White-label
- App mobile iOS/Android

---

## Documentation associée

- **[SYNC_ARCHITECTURE.md](SYNC_ARCHITECTURE.md)** : Détails synchronisation
- **[COMMAND_QUEUE.md](COMMAND_QUEUE.md)** : Gestion sites offline
- **[REFERENCE.md](REFERENCE.md)** : Documentation technique complète
- **[STATUS.md](STATUS.md)** : État du projet (9.2/10)

---

**Dernière mise à jour** : 10 février 2026
**Version** : 3.8.1
