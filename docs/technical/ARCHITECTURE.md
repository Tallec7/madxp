# Architecture Neopro

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
│   ├── server/                     # Socket.IO local server
│   │   └── package.json
│   ├── admin/                      # Admin interface (Express)
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
├── server-render/                  # Cloud WebSocket server
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
│  (Angular)   │  │ (Angular 17) │  │ (Express)    │
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
┌──────────────┐          ┌──────────────┐
│local-server  │◀─Socket─▶│server-render │
│ (Socket.IO)  │          │ (Socket.IO)  │
└──────────────┘          └──────────────┘
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

| Composant | Stack | Base de données | Déploiement |
|-----------|-------|-----------------|-------------|
| `raspberry/src` | Angular 20, Video.js, Socket.IO client | - | Raspberry Pi (systemd) |
| `raspberry/server` | Node.js, Socket.IO 4.7 | - | Raspberry Pi (systemd) |
| `raspberry/admin` | Express, vanilla JS | - | Raspberry Pi (systemd) |
| `raspberry/sync-agent` | Node.js, Axios | - | Raspberry Pi (systemd) |
| `central-server` | Node.js 18, Express, JWT | Supabase (PostgreSQL) | Render.com |
| `central-dashboard` | Angular 17, Chart.js, Leaflet | - | Hostinger (static) |
| `server-render` | Node.js, Socket.IO 4.7 | Redis (Upstash) | Render.com |
| `e2e` | Playwright | - | CI/CD |

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

**Méthode 3 : Mise à jour OTA**
- `npm run deploy:raspberry <host>`
- Build Angular + rsync + restart services
- ~5 minutes

### Cloud

**Infrastructure as Code**
- `render.yaml` : Central Server, Socket Server, Dashboard
- `docker-compose.yml` : Stack locale (dev)
- `k8s/` : Kubernetes manifests (base + overlays)

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

### 5. Monitoring & Observability
- Prometheus metrics (Port 9090)
- Grafana dashboards (Port 3000)
- Systemd journald logs

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

### Secrets
- `.env` (gitignored)
- Supabase anon key (RLS protected)
- Service role key (backend only)

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
- Connection pooling
- Rate limiting

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

**Dernière mise à jour** : 17 décembre 2025
**Version** : 2.0
