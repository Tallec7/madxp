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
│  │  - SAFe Dashboard│  │  - SAFe Parser   │  │            │ │
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
│  │                  │  │                  │  │  - Sync ◄──┤─── reads sync-agent state files
│  │                  │  │                  │  │  - Modes   │ │
│  └──────┬───────────┘  └──────┬───────────┘  └──────┬─────┘ │
│         │                     │                     │       │
│         └─────────────────────┴─────────────────────┘       │
│                               │                             │
│                   ┌───────────▼───────────┐                 │
│                   │     Angular Frontend      │                 │
│                   │      (Port: 4200)         │                 │
│                   │                           │                 │
│                   │  /login      - Auth       │                 │
│                   │  /tv         - Player TV  │                 │
│                   │  /secondary  - Player 2nd │                 │
│                   │  /remote     - Control    │                 │
│                   └───────────────────────────┘                 │
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
│   │   ├── services/               #   6 services (state, buffer, license, hdmi+edid, auth)
│   │   ├── routes/                 #   6 contrôleurs HTTP minces
│   │   ├── socket/                 #   Handlers Socket.IO (18 events)
│   │   ├── __tests__/              #   Tests Jest (71 tests)
│   │   └── package.json
│   ├── admin/                      # Admin interface (Express modulaire)
│   │   ├── admin-server.js         #   Orchestrateur (~260 lignes)
│   │   ├── helpers.js              #   Utilitaires partagés (exec, paths)
│   │   ├── services/               #   8 services métier
│   │   ├── routes/                 #   11 contrôleurs HTTP (dont sync-status, sponsors)
│   │   ├── __tests__/              #   Tests Jest (60%+ couverture)
│   │   └── package.json
│   └── sync-agent/                 # Sync service with cloud
│       └── package.json
│
├── central-server/                 # Cloud API backend
│   ├── src/
│   │   ├── controllers/            # HTTP route handlers (split par domaine)
│   │   │   ├── sites.controller.ts          # CRUD sites + re-exports sub-controllers
│   │   │   ├── site-commands.controller.ts  # Commandes remote + queue
│   │   │   ├── site-debug.controller.ts     # Debug/diagnostic endpoints
│   │   │   ├── site-fleet.controller.ts     # Fleet overview, dashboard, metrics, timeline
│   │   │   └── ...                          # auth, content, analytics, advertisers...
│   │   ├── routes/                 # Express route definitions
│   │   ├── middleware/             # Auth, RLS, rate-limit, error-handler
│   │   ├── services/              # Business logic (socket, deployment, alerting…)
│   │   ├── handlers/              # 9 Socket.IO event handlers (extraits de socket.service)
│   │   └── repositories/          # 22 repos (BaseRepository<T> + implémentations)
│   └── package.json
│
├── central-dashboard/              # Cloud admin dashboard
│   ├── src/app/
│   │   ├── features/
│   │   │   ├── admin/users/                     # Gestion utilisateurs
│   │   │   │   ├── users-management.component.ts         # Orchestrateur : état, routing, coordination
│   │   │   │   ├── users-filters.component.ts            # UI : search input, filtres role/status
│   │   │   │   ├── users-table.component.ts              # UI : table utilisateurs, badges, actions
│   │   │   │   ├── user-form-modal.component.ts          # UI : modal create/edit utilisateur
│   │   │   │   ├── user-delete-modal.component.ts        # UI : modal confirmation suppression
│   │   │   │   ├── users-management-data.service.ts      # Data : CRUD users, agencies, advertisers
│   │   │   │   ├── user-filters.service.ts               # Filtres : search, role, status
│   │   │   │   └── user-validation.service.ts            # Validation : create/update forms
│   │   │   ├── sites/
│   │   │   │   ├── site-detail.component.ts     # Page détail (6 onglets) — coordinateur onglets + état
│   │   │   │   ├── site-detail.component.html   # Template externe (618 lignes)
│   │   │   │   ├── site-detail.component.scss   # Styles externes (823 lignes)
│   │   │   │   ├── config-editor/               # Éditeur de configuration site
│   │   │   │   │   ├── config-editor.component.ts      # Logique : formulaire, JSON, historique, diff (744 lignes)
│   │   │   │   │   ├── config-editor.component.html    # Template externe (784 lignes)
│   │   │   │   │   ├── config-editor.component.scss    # Styles externes (1433 lignes)
│   │   │   │   │   └── config-editor-data.service.ts   # Data : loading/polling, validation, deploy, analytics
│   │   │   │   └── components/
│   │   │   │       ├── site-content-tab/        # Pipeline contenu (coordinateur)
│   │   │   │       │   ├── video-manager/       #   Upload, bibliothèque, suppression vidéos
│   │   │   │       │   ├── config-editor/       #   Catégories, boucles, télécommande, analytics
│   │   │   │       │   ├── deployment-status/   #   Déploiement, diff preview, validation
│   │   │   │       │   └── config-draft/        #   Brouillons, historique modifications
│   │   │   │       ├── loop-manager/            # Gestion unifiée boucles (défaut + 3 phases)
│   │   │   │       ├── site-sponsors-tab/       # Sponsors locaux : CRUD, KPIs, association vidéos, benchmark, magic link
│   │   │   │       ├── site-settings-tab/       # Config réseau, hotspot, branding club
│   │   │   │       │   ├── site-settings-tab.component.ts   # Logique : formulaires, toggles, aperçu (817 lignes)
│   │   │   │       │   ├── site-settings-tab.component.html # Template externe (628 lignes)
│   │   │   │       │   ├── site-settings-tab.component.scss # Styles externes (967 lignes)
│   │   │   │       │   └── site-settings-data.service.ts    # Data : auth, hotspot, watermark, reports, PIN
│   │   │   │       ├── site-profiles-tab/       # Multi-config CRUD + deploy
│   │   │   │       └── site-debug-tab/          # Diagnostic site (coordinateur)
│   │   │   │           ├── health-monitor/      #   Santé GPU, fan, display/HDMI, services, diagnostics
│   │   │   │           ├── command-panel/       #   Terminal, logs, export bundle, connexion zombie
│   │   │   │           ├── service-status/      #   Réseau, buffer analytics, hotspot, WiFi
│   │   │   │           └── system-info/         #   Fichiers Pi, config historique, timeline
│   │   │   ├── advertisers/                     # Gestion sponsors/annonceurs
│   │   │   │   ├── advertiser-detail.component.ts        # Orchestrateur : onglets, état, routing
│   │   │   │   ├── sponsor-info-tab.component.ts         # UI : contact, contrat, notes, métadonnées
│   │   │   │   ├── sponsor-quick-stats.component.ts      # UI : aperçu analytics rapide (KPIs)
│   │   │   │   ├── sponsor-edit-modal.component.ts       # UI : modal édition sponsor
│   │   │   │   ├── sponsor-delete-modal.component.ts     # UI : modal confirmation suppression
│   │   │   │   ├── advertiser-detail-data.service.ts     # Data : CRUD sponsor, forkJoin loading
│   │   │   │   ├── advertiser-modal.service.ts           # Modals : edit/delete visibility state
│   │   │   │   ├── advertiser-form.service.ts            # Form : edit state, validation, saving/deleting
│   │   │   │   ├── sponsor-videos-tab.component.ts       # Onglet vidéos sponsor
│   │   │   │   ├── sponsor-sites-tab.component.ts        # Onglet sites assignés
│   │   │   │   ├── sponsor-campaigns-tab.component.ts    # Onglet campagnes
│   │   │   │   ├── advertiser-videos.component.ts        # Gestion vidéos sponsor (drag-and-drop, priorités)
│   │   │   │   ├── sponsor-video-data.service.ts         # Data : CRUD vidéos sponsor (ApiService, Observable)
│   │   │   │   └── drag-drop.service.ts                  # Générique : réordonnancement drag-and-drop
│   │   │   ├── content/                         # Gestion contenu cloud
│   │   │   │   ├── content-management.component.ts       # UI : onglets, modals, drag-over (orchestrateur)
│   │   │   │   ├── content-management-data.service.ts    # Data : CRUD vidéos, déploiements, image-to-video
│   │   │   │   ├── video-upload.service.ts               # Upload : fichiers, bulk, image-to-video, état
│   │   │   │   └── content-deployment.service.ts         # Deploy : wizard form, exécution séquentielle, progress
│   │   │   ├── analytics/                       # Analytics & vue d'ensemble
│   │   │   │   ├── analytics.component.ts                # Orchestrateur : état, data loading, refresh
│   │   │   │   ├── analytics-traction.component.ts       # Page traction (décomposé en 9 sous-composants)
│   │   │   │   ├── analytics-comparison.component.ts     # Comparaison inter-sites
│   │   │   │   ├── analytics-nav.component.ts            # Navigation onglets analytics
│   │   │   │   ├── club-analytics.component.ts           # Analytics club (orchestrateur KPIs + chart)
│   │   │   │   ├── club-analytics-chart.service.ts       # Chart.js : config, rendu, cleanup daily chart
│   │   │   │   ├── club-export.service.ts                # Export : CSV blob + PDF blob download
│   │   │   │   ├── club-analytics.utils.ts               # Fonctions pures : formatage, couleurs, tendances
│   │   │   │   └── components/                           # Sous-composants analytics
│   │   │   │       ├── analytics-kpi-grid.component.ts   #   KPIs : vidéos, écran, impressions, flotte
│   │   │   │       ├── engagement-chart.component.ts     #   Graphique Chart.js engagement mensuel
│   │   │   │       ├── top-clubs-card.component.ts       #   Top clubs actifs (ranked list)
│   │   │   │       ├── dormant-clubs-card.component.ts   #   Clubs à relancer (alert list)
│   │   │   │       ├── sponsor-summary-card.component.ts #   Résumé sponsors (KPIs)
│   │   │   │       ├── fleet-health-card.component.ts    #   Santé flotte (CPU/RAM/Temp)
│   │   │   │       ├── traction-kpi-summary.component.ts #   KPIs traction
│   │   │   │       ├── traction-fleet-growth.component.ts#   Croissance flotte
│   │   │   │       ├── traction-engagement.component.ts  #   Engagement mensuel
│   │   │   │       ├── traction-subscriptions.component.ts #  Abonnements
│   │   │   │       ├── traction-advertisers.component.ts #   Métriques annonceurs
│   │   │   │       ├── traction-deployments.component.ts #   Métriques déploiements
│   │   │   │       ├── traction-product-velocity.component.ts # Vélocité produit
│   │   │   │       ├── traction-retention.component.ts   #   Rétention
│   │   │   │       ├── traction-distribution.component.ts#   Distribution
│   │   │   │       └── traction-shared.styles.ts         #   Styles partagés traction
│   │   │   └── sponsor-portal/                  # Page publique portail sponsor (token-based)
│   │   ├── core/                                # Models, services, guards
│   │   └── shared/components/                   # Composants réutilisables cross-features
│   │       ├── video-upload-zone/               # Upload drag-and-drop vidéo (générique)
│   │       ├── remote-preview/                  # Mockup télécommande (OnPush, cachés)
│   │       ├── video-selector/                  # Sélecteur vidéo
│   │       ├── confirm-dialog/                  # Dialog de confirmation
│   │       ├── language-selector/               # Sélecteur de langue
│   │       ├── subscription-badge/              # Badge abonnement
│   │       └── qr-code-generator/               # Générateur QR code
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
         │
         ▼
sync-history.json (event: content_received)
         │
         ▼
Admin UI /api/sync-status → content sync banner
```

### 2. Analytics tracking (pipeline unifié video_plays)

> **v3.66+** : Pipeline consolidé — toutes les impressions sponsors passent par `video_plays` avec `category = 'sponsor'`. L'ancienne table `advertiser_impressions` a été supprimée.

```
TV Frontend (impression sponsor + vidéo club)
         │
         ▼
AnalyticsService (Angular — pipeline unique)
         │  trackVideoStart/End avec event_type, period, audience_estimate
         ▼
Local Server (/api/analytics — buffer JSON)
         │
         ▼
Sync Agent (video-plays batch, flush 5min)
         │
         ▼
Central Server API (POST /api/analytics/video-plays)
         │
         ▼
PostgreSQL (video_plays table, category = 'sponsor' pour sponsors)
         │
         ├── KPIs avancés (GET /api/analytics/advertisers/:id/kpis)
         │         → verified_impressions (tv_status='on'), match_day, rotation_fairness,
         │           renewal_score, peak_hours heatmap
         ▼
Dashboard Analytics (Chart.js graphs + KPI cards)

Site Sponsor flow (local sponsors) :
  site_sponsors → site_sponsor_videos → video_plays (site_sponsor_id, category='sponsor')
         │
         ├── Site detail > Sponsors tab (KPIs, Chart.js trends, CPI)
         │         │
         │         └── Benchmark panel (P6.2 — sponsor vs site average)
         │
         ├── Network Stats (P6.1 — cross-club via site_sponsors.advertiser_id)
         │         GET /api/network/advertisers/:id/stats
         │         → trends, by_site, by_event_type, CPI réseau
         │
         ├── PDF Report enrichi (impressions vérifiées + breakdown match day)
         │         └── Page 2 conditionnelle (P6.4 — match-by-match breakdown)
         │
         └── Sponsor Portal (/sponsor-access?token=xxx) — public, token-based
```

### 2b. Sponsor auto-resolution at deployment

```
Dashboard saves config (boucles + catégories)
         │
         ▼
orchestrated-deployment.service.ts → queueConfigUpdate()
         │
         ▼
sponsor-auto-resolution.service.ts → autoResolveSponsorIds(siteId, config)
         │
         ├── collectAllVideos() : sponsors[] + timeCategories[].loopVideos[]
         │                        + categories[].videos[] + subCategories[].videos[]
         │
         ├── extractFilename() : "videos/BOUCLE/07_A_L_AFFUT.mp4" → "07_A_L_AFFUT.mp4"
         │
         ├── siteSponsorRepository.resolveSiteSponsorIdsByFilenameBulk()
         │   → 1 seul appel SQL bulk (filename × siteId → site_sponsor_id)
         │
         └── Injection site_sponsor_id dans la config clonée
                  │
                  ▼
         Config enrichie envoyée au Pi → impressions trackées avec site_sponsor_id

Metrics: neopro_sponsor_auto_resolution_total{outcome="resolved|skipped|unresolved"}

⚠️ **Préservation weight/pinned** : toute la chaîne d'enrichissement (`autoResolveSponsorIds` → `enrichConfigWithSecondaryVariants` → `enrichConfigWithAnalyticsMetadata`) **mute les champs** des objets sponsor existants au lieu de reconstruire les objets. Reconstruire = perdre `weight`, `pinned` et tout champ futur. Smoke test enforced.
```

### 2c. Sponsor health monitoring (F-AUD-07)

```
Advertiser Health Dashboard
         │
         ▼
GET /api/sponsor-alerts/health
         │
         ▼
sponsor-alert.service.ts
         │
         ├── advertiser_sites × video_plays (category='sponsor') JOIN
         │   → impressions 7d/30d, daily avg, days since last
         ▼
Health Matrix (healthy/warning/critical per pair)
         │
         ├── Dashboard Angular (advertiser-health.component.ts)
         └── POST /check → alerts table + Slack notification
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
Native HTML5 <video> (double-buffer A/B)
```

### 4. Multi-config profiles

```
Dashboard Content Tab (sélecteur de profil)
         │ PUT /profiles/:id/configuration
         ▼
Central Server API (sauvegarde config profil)
         │ POST /profiles/sync
         ▼
Enrichment chain:
  autoResolveSponsorIds()
  enrichConfigWithSecondaryVariants()
  enrichConfigWithAnalyticsMetadata()
         │
         ▼
Socket.IO → sync_profiles command (TOUS les profils enrichis)
         │
         ▼
Sync Agent (écrit profiles/*.json + clubs.json)
         │
         ▼
Pi Frontend (ProfileConfigService — sélection locale via télécommande)
```

- Un site peut avoir **N profils** de configuration
- Chaque profil contient un `configuration` JSON complet et indépendant
- **TOUS les profils** sont présents simultanément sur le Pi
- Le Pi gère la sélection localement via `clubs.json` → télécommande club-selector
- **Pas de concept `active_profile_id`** côté central — le central synchronise, le Pi sélectionne
- L'enrichissement (variants secondaires + analytics metadata) est **obligatoire** avant envoi au Pi

---

## Technologies par composant

| Composant              | Stack                                                                  | Base de données                               | Déploiement            |
| ---------------------- | ---------------------------------------------------------------------- | --------------------------------------------- | ---------------------- |
| `raspberry/src`        | Angular 20, native HTML5 video (double-buffer), Socket.IO client       | -                                             | Raspberry Pi (systemd) |
| `raspberry/server`     | Node.js, Socket.IO 4.8                                                 | -                                             | Raspberry Pi (systemd) |
| `raspberry/admin`      | Express, vanilla JS (dual mode: club/tech)                             | -                                             | Raspberry Pi (systemd) |
| `raspberry/sync-agent` | Node.js 20, Axios, SHA256 checksum                                     | -                                             | Raspberry Pi (systemd) |
| `central-server`       | Node.js 20+, Express 4.18, TypeScript 5.9, Winston, Repository Pattern | Supabase (PostgreSQL), FTP Hostinger (vidéos) | Railway                |
| `central-dashboard`    | Angular 20.3, Chart.js 4.5, Leaflet, Angular CDK (DragDrop)            | -                                             | Hostinger (static)     |
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
- Le Raspberry Pi : backup, téléchargement, installation, **validation post-OTA**, redémarrage
- ~10 minutes (backup + download + restart)
- **Validation post-OTA (v3.116+)** : après `startServices()`, `validate-post-update.js` vérifie :
  - **Critiques** (échec → auto-rollback) : services actifs (neopro-app, neopro-admin), HTTP health (port 3000 + 8080), configuration.json valide, webapp/index.html existe
  - **Warnings** (informationnel) : HDMI display, nginx, espace disque, buffer analytics, Chromium, Socket.IO
- **Canary monitoring (v3.116+)** : après OTA réussi, le central surveille le Pi pendant 5 min (checks toutes les 30s) :
  - Site encore en ligne (heartbeat < 90s)
  - Version software = version cible
  - Pas de crash-loop (< 3 disconnects en 5 min)
  - Alerte `canary_post_ota` (critique) si échec — pas d'auto-rollback (décision manuelle)
- **Script standalone** : `raspberry/scripts/validate-pi.sh` (SSH, `--json`, `--quiet`)
- **Admin API** : `POST /api/system/validate` retourne le rapport structuré (200 = sain, 503 = critique)

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

### 4b. Input Validation (Joi — central-server)

Toutes les routes API sont protégées par validation Joi au niveau middleware :

- **`validate(schemas.X)`** — valide `req.body` (POST/PUT/PATCH), strip les champs inconnus
- **`validateParams(paramSchemas.X)`** — valide les paramètres d'URL (`:id`, `:siteId`, etc.), vérifie les UUIDs
- **`validateQuery(querySchemas.X)`** — valide les query strings (`?from=`, `?limit=`, etc.)

Fichier central : `src/middleware/validation.ts` (45+ schémas body, 17 schémas params, 13 schémas query).
Fichier analytics complémentaire : `src/middleware/analytics-validation.ts` (advertisers, site-sponsors).

21 fichiers routes couverts : admin, agency, analytics, assets, auth, campaign, config-profiles,
drafts, groups, logs, objectives, playlist-schedules, remote, reports, safe,
sites (CRUD + diagnostics + WiFi + PIN + commands + config-history), subscription,
updates, users, advertiser-portal, advertiser-sites.

Smoke tests enforced (`Input validation coverage` + `SQL injection prevention` + `validateParams on parameterized routes`).

### 5. Repository Pattern (central-server)

- Accès base de données exclusivement via repositories typés (`siteRepository`, `alertRepository`, etc.)
- `BaseRepository<T>` générique (CRUD, pagination, exists)
- 22 repositories couvrant 100% des accès PostgreSQL :
  `site`, `user`, `video`, `group`, `alert`, `analytics`, `sponsor`, `config-history`,
  `deployment`, `advertising`, `subscription`, `agency`, `metrics`, `objective`,
  `playlist-schedule`, `remote-command`, `report`, `timeline`, `advertiser-portal`,
  `software-update`, `email` (notification), `site-sponsor`
- Règle ESLint `no-restricted-imports` bloquant **tout** import de `../config/database` dans les controllers
- Requêtes SQL paramétrées uniquement (`$1`, `$2`, etc.)

### 5b. Socket Handler Extraction (central-server)

- `socket.service.ts` réduit de 1 717 → 676 lignes (orchestrateur uniquement)
- 9 handlers extraits dans `src/handlers/` :
  `heartbeat`, `config-sync`, `deploy-progress`, `command-dispatch`,
  `health-monitor`, `license`, `network-resilience`, `score-update`, `match-config`
- Chaque handler est une fonction pure recevant `(socket, data, dependencies)`

### 6. Structured Logging (Winston)

- Winston remplace console.log dans central-server
- Correlation ID pour traçabilité distribuée
- Niveaux : error, warn, info, debug
- Format JSON structuré en production

### 7. Monitoring & Observability

- **Prometheus metrics** (Port 9090) — 37+ métriques custom `neopro_*` (dont 3 kiosk, 3 fan : `neopro_fan_present`, `neopro_fan_state`, `neopro_fan_failures_total` + `neopro_license_status_pushes_total`, `neopro_deploy_progress_events_total`, `neopro_ota_errors_total{error_type}`, `neopro_wifi_config_total`) + métriques Node.js par défaut
- **Grafana dashboards** (Port 3000) — 3 dashboards (local) + 4 dashboards cloud :
  - _NeoPro Overview_ : API Health, sites connectés, alertes actives, taux 5xx, latence p95, mémoire RSS
  - _NeoPro Infrastructure_ : HTTP rate/latence par percentile, Node.js runtime (heap, event loop lag, memory pressure), auth & rate limiting, DB pool & latency, FTP storage
  - _NeoPro Business & Fleet_ : content pipeline (video uploads), fleet Pi (WebSocket par type, heartbeats, network stability, socket disconnects), video transitions, deployments (canary, sync, drift), subscriptions & predictive alerts, **kiosk Chromium** (status, crashes, restarts, **dual TV+Secondary**), **Fan Pi** (présence, état, failures)
  - _NeoPro Sponsor Analytics_ (cloud) : sync & deployment (rate, sponsors/deploy, auto-resolution), impression attribution (méthodes de résolution, FK fallback, Pi auth), **sponsor health F-AUD-07** (matrice santé, health checks, alertes proactives), reports & API quality (génération PDF, latence network stats/benchmark)
- **Scrape targets** : Docker local, `host.docker.internal:3001` (dev), Railway HTTPS (prod)
- **Canary monitoring post-OTA** (v3.116+) : `canary-monitor.service.ts` surveille les Pi après OTA — 5 min window, 30s interval, alertes `canary_post_ota` via `alertRepository`, intégré dans le periodic loop de `alerting.service.ts`
- **E2E hardware matrix** (v3.116+) : 20 tests Playwright (`e2e/tests/hardware-matrix.spec.ts`) couvrant tous les scénarios HDMI Pi via injection BroadcastChannel
- **Smoke tests** : `npm run test:smoke` — 819+ tests détectent les régressions de wiring API (routes, middlewares, repositories, services, handlers, error types, métriques Prometheus critiques, hourly metric alerting wiring) + conventions Pi (systemd, sudoers, kiosk Chromium GPU guards) + benchmark query patterns + third-party SDK safety guards
- **bworlds LaunchKit** (v3.129+, temporaire) : `@bworlds/launchkit` dans `central-dashboard/src/main.ts` — heartbeat uptime monitoring + error capture automatique. Access gate (`launchkit.check()`/`getGateUrl()`) interdit par smoke test. À évaluer juin 2026
- Systemd journald logs
- Winston structured logging with Correlation ID
- Memory Manager Service (heap monitoring, pressure cleanup at 93%/97%)
- **Memory safety bounds** (v3.37.2) — bornes dures sur les Maps in-memory du service d'alerting pour éviter l'épuisement du heap sur Railway Hobby (256 MB) :
  - `metricHistory` : max 200 clés × 60 snapshots/clé
  - `wsDisconnectEvents` / `videoSafetyTimeoutEvents` : max 100 sites × 200 events/site
  - `lastAlertTime` : pruning auto > 24h toutes les 5 min + hard cap 500 entrées
- Health checks (/health, /live, /ready)
- **Guide de lecture Grafana** : [Notion — Guide Grafana Support](https://www.notion.so/305c27de363881d1a95cc4891d6cd823) — seuils, arbres de diagnostic, matrice d'escalade

### 8. Alerting Multi-Canal

- Email (SMTP via emailService)
- Webhook (POST JSON vers URL configurable)
- Slack (Incoming Webhooks avec Block Kit) — `alert.service.ts` avec méthodes pré-construites et **cooldown anti-flapping** (5 min/site pour `siteOffline`/`siteOnline`) + **shutdown mode** (v3.50.3 : `enterShutdownMode()` sur SIGTERM supprime les faux offline)
- Escalade automatique vers superviseurs
- **Graceful shutdown** (v3.48+) : `server_shutdown` émis aux Pi avant fermeture, `io.disconnectSockets()` + `io.close()`, safety timeout 10s — **v3.50.3** : `alertService.enterShutdownMode()` appelé avant déconnexion des sockets + boot grace period 90s (online + offline)
- **21 seuils par défaut** : 7 réactifs (CPU, mémoire, température, disque, site offline, deployment failure, **fan failure**) + 11 prédictifs (inactivité, disk growth, déconnexions, WiFi signal, video errors, temperature trend, hotspot instability, subscription expiry, stuck deployments, **références vidéo orphelines**, **mesh sans Ethernet**) + 3 nouveaux (WebSocket disconnects fréquents, trous noirs vidéo/safety timeouts, crash kiosk Chromium)
- **Kiosk GPU health** : le heartbeat remonte `kioskStatus.chromiumAlive` et `restartCount` → alerte `kiosk_crash` (critique) si Chromium crashé + `kiosk_unstable` (warning) si >3 restarts/heure → Grafana alerte sur `neopro_kiosk_crashes_total` et `neopro_kiosk_restart_count`
- **Sponsor health matrix** (F-AUD-07) : matrice santé annonceurs (healthy/warning/critical), alertes proactives Slack pour sponsors sans impressions depuis N jours, dashboard Angular dédié
- **Alertes réseau WiFi** (v3.33+) : `networkFailure()` (échec recovery watchdog), `info('Réseau rétabli')` (recovery confirmée) — dédupliquées 1/heure/site ; **alertes signal WiFi** (v3.50.3) : `lowWifiSignal()` avec cooldown 6h/site + `wifiSignalRecovered()` auto quand signal > -70 dBm ; **portail captif** (v3.69+) : détection via HTTP 204 check, alerte `captive_portal_detected` au central, skip recovery automatique
- **Test Slack** : `POST /api/alerts/test-slack` (super_admin) — vérifie la configuration webhook
- **Variables d'environnement** : `SLACK_WEBHOOK_URL` + `SLACK_ALERTS_ENABLED=true`

### 9. Prometheus Alerting (Alertmanager + Grafana Cloud)

Alertes infrastructure côté serveur, complémentaires aux alertes métier Pi (section 8).

- **Alertmanager** (Port 9093) — routing Slack avec 2 niveaux :
  - `critical` → notification immédiate, repeat 1h
  - `warning` → groupé 30s, repeat 4h
  - Inhibition : si `CentralServerDown` actif, les warnings par-métrique sont supprimés
- **Prometheus rules** (`docker/prometheus/rules.yml`) — 33 alert rules locales :

| Groupe            | Alerte                         | Condition                     | Seuil (for) | Sévérité |
| ----------------- | ------------------------------ | ----------------------------- | ----------- | -------- |
| Server Health     | `CentralServerDown`            | `up == 0`                     | 2 min       | critical |
| Server Health     | `CentralServerUnhealthy`       | health check fail             | 3 min       | critical |
| Server Health     | `HighMemoryUsage`              | RSS > 88% of 256MB            | 5 min       | warning  |
| Server Health     | `HighCpuUsage`                 | CPU > 80%                     | 5 min       | warning  |
| Connectivity      | `ZeroHeartbeats`               | `rate(heartbeats) == 0`       | 5 min       | critical |
| Connectivity      | `NoAgentConnections`           | WS agents == 0                | 5 min       | critical |
| Connectivity      | `ConnectedSitesDrop`           | -50% en 10 min                | 5 min       | warning  |
| Connectivity      | `HighDisconnectRate`           | > 0.5/s                       | 3 min       | warning  |
| Database          | `DbPoolSaturation`             | active/total > 80%            | 3 min       | warning  |
| Database          | `DbPoolErrors`                 | pool errors > 3/min           | 5 min       | warning  |
| Database          | `SlowDbQueries`                | P95 > 2s                      | 5 min       | warning  |
| Database          | `DbSizeWarning`                | DB > 400 MB                   | 10 min      | warning  |
| Database          | `DbSizeCritical`               | DB > 475 MB                   | 5 min       | critical |
| Database          | `DbTableSizeHigh`              | Table > 200 MB                | 30 min      | warning  |
| HTTP              | `HighErrorRate`                | 5xx > 5%                      | 5 min       | warning  |
| HTTP              | `HighApiLatency`               | P95 > 3s                      | 5 min       | warning  |
| Video             | `HighUploadFailureRate`        | Upload fails > 3/min          | 5 min       | warning  |
| Video             | `FrequentEncodingCorrections`  | Encoding fixes > 0.1/s        | 30 min      | info     |
| Meta              | `TooManyActiveAlerts`          | > 10 alertes actives          | 10 min      | warning  |
| Meta              | `PredictiveChecksFailing`      | checks failed > 1 en 2h       | 10 min      | warning  |
| Meta              | `HighPredictiveAlertRate`      | > 20 alertes prédictives/2h   | 10 min      | warning  |
| Sponsor Analytics | `SlowNetworkSponsorStats`      | P95 network stats > 5s        | 5 min       | warning  |
| Sponsor Analytics | `SlowBenchmarkQuery`           | P95 benchmark > 3s            | 5 min       | warning  |
| Fleet Benchmark   | `SlowFleetBenchmarkQuery`      | P95 fleet benchmark > 5s      | 5 min       | warning  |
| Sponsor Analytics | `HighReportFailureRate`        | PDF sponsor fails > 1/min     | 10 min      | warning  |
| Sponsor Analytics | `SponsorSyncMissing`           | Deploy sans sync sponsor      | 30 min      | warning  |
| Sponsor Analytics | `SponsorResolutionFailures`    | Resolution fails > 0.05/s     | 10 min      | warning  |
| Sponsor Analytics | `ImpressionSponsorUnresolved`  | > 50% impressions sans attrib | 15 min      | warning  |
| Sponsor Analytics | `HighPiAuthFailureRate`        | Pi auth fails > 0.1/s         | 5 min       | warning  |
| Sponsor Analytics | `HighAnalytics500Rate`         | 500 sur video-plays > 0.02/s  | 10 min      | warning  |
| Sponsor Analytics | `HighVideoPlaysFkFallbackRate` | FK fallback > 0.1/s           | 15 min      | warning  |
| Sponsor Analytics | `ReportValidationErrors`       | 400 sur /reports > 0.01/s     | 5 min       | warning  |
| Sponsor Analytics | `AnalyticsKpisEndpointSlow`    | P95 KPIs endpoint > 5s        | 5 min       | warning  |
| Sponsor Analytics | `CampaignDataInconsistency`    | campaign_id FK orphelins      | 15 min      | warning  |
| Sponsor Analytics | `VerifiedImpressionsDropoff`   | TV-on rate < 10%              | 30 min      | warning  |

- **Grafana Cloud alerts** (`docker/grafana/provisioning/alerting/neopro-alerts-cloud.yml`) — 30 managed alert rules (parité complète avec local, format Grafana Cloud provisioning) pour la production sur `grafanacloud-tallec7-prom`
- **Stack local** : `docker compose up prometheus alertmanager grafana`
- **Stack prod** : Import YAML dans Grafana Cloud → Alerting → Alert rules + configurer Contact point Slack

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
│  ┌───────────┐  ┌───────────┐  ┌──────────────┐ ┌────────────────┐ │
│  │  Nginx    │  │ Socket.IO │  │  Chromium    │ │   Chromium     │ │
│  │  Port 80  │  │ Port 3000 │  │ /tv (HDMI 0) │ │/secondary (H1)*│ │
│  └─────┬─────┘  └─────┬─────┘  └──────┬───────┘ └──────┬─────────┘ │
│        │               │               │                │           │
│        └───────────────┼───────────────┴────────────────┘           │
│                        │ Communication locale                       │
│        * Secondary kiosk (--app=URL + xprop/xdotool windowsize) :    │
│          lancé si HDMI-0 ET HDMI-1 connectés (hardware-driven)      │
│          Détection: xrandr offset (Pi 5 n'a pas "primary")         │
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
- tv-register/tv-role-assigned : master-slave sync (dual-display)
- tv-loop-update/tv-loop-state : synchronisation boucle vidéo
```

### Synchronisation Master-Slave (dual-display)

Quand deux écrans sont connectés (HDMI-A-1 + HDMI-A-2), deux instances Chromium tournent :
le primaire (`/tv`) et le secondaire (`/secondary`). Elles se synchronisent via Socket.IO :

```
Chromium /tv (HDMI-A-1)              Chromium /secondary (HDMI-A-2)
   │                                        │
   │ tv-register {displayType:'tv'}         │ tv-register {displayType:'secondary'}
   ▼                                        ▼
┌─────────────────────────────────────────────────┐
│            Socket.IO Server (:3000)              │
│                                                  │
│  1er connecté → MASTER (émet l'état de boucle)  │
│  2ème connecté → SLAVE (reçoit et suit)          │
│                                                  │
│  tv-loop-update (master→server→broadcast)        │
│  tv-loop-state  (server→slaves)                  │
└─────────────────────────────────────────────────┘

Sync par index : le slave utilise videoIndex (pas videoPath)
car le secondary display peut avoir des variants de vidéos
avec des chemins différents.
```

**Invariants** (smoke tests enforced) :

- Le slave PAUSE sa boucle indépendante dès réception de `tv-role-assigned`
- `startSeamlessLoop()` retourne immédiatement en mode slave
- `onVideoEnded()` affiche un freeze-frame et attend le master
- `handleMasterLoopState()` synchronise par `videoIndex` (pas `videoPath`)
- ADR-034 : le slave ne `play()` jamais directement sur `action` — il `preloadManualVideo()` et attend `manualVideoVisible: true`
- ADR-034 : l'émission immédiate du master porte `manualVideoVisible: false`, seule l'émission delayed porte `true`
- ADR-034 v3.89.2 : le preload slave est silencieux (opacity 0, muted) — pas de freeze/overlay sauf manual→manual

**Vidéo manuelle synchronisée (ADR-034 v3.89.2+)** :

```
Dashboard/Télécommande: "jouer vidéo X"
     │
     ▼
  Server: io.emit('action', X)   ← broadcast à TOUS
     │
     ├──────────────────┬──────────────────┐
     ▼                  ▼                  ▼
  MASTER (HDMI-0)    SLAVE (HDMI-1)     SLAVE (PC)
  play(X)            preload(X)         preload(X)
  freeze+overlay     silent (opacity 0) silent (opacity 0)
  charge vidéo       charge vidéo       charge vidéo
  ✓ révèle !         (boucle visible)   (boucle visible)
  emit(visible:true)
     │
     ├──────────────────┬──────────────────┐
     ▼                  ▼                  ▼
  (déjà visible)     reveal instant     reveal instant
                     ≈10ms après master  ≈10ms après master
```

Monitoring : `preloadRevealCount` et `preloadCleanupCount` via Prometheus (pipeline identique à ADR-033).

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

- **FTP Hostinger uniquement** (`kalonpartners.bzh/neopro-video/`) — unifié via `storage.service.ts`
- Upload streaming depuis le disque (zéro buffer mémoire)
- Checksum SHA256 streaming pendant l'upload
- **URLs publiques** : `https://kalonpartners.bzh/neopro-video/{uuid}.mp4`
- Nettoyage périodique des fichiers temporaires abandonnés (> 1h)

---

## Résilience HDMI & Accès Navigateur (E-23)

> Epic E-23 — 7 Features, 33 US, 146 SP — implémenté v3.84+

### Détection HDMI temps réel (F-23.1)

```
                   udev (< 1s)                 polling (5s fallback)
                        │                              │
  /sys/class/drm/       ▼                              ▼
  card{0,1}-HDMI-A-{1,2}/status ─── kiosk-watchdog.sh ───┐
                                                          │
              ┌────── /tmp/kiosk-status.json ◄────────────┘
              │
              ▼
      hdmi.service.js ──► state.service.js ──► handlers.js
              │                                     │
              ▼                                     ▼
      /admin/api/system              hdmi-status-update (Socket.IO)
      (admin panel)                  heartbeat → central-server
```

- **udev rules** : `/etc/udev/rules.d/99-neopro-hdmi-hotplug.rules` → `neopro-hdmi-notify.sh` écrit `/tmp/hdmi-changed`
- **Sysfs** : Pi 5 `card1-HDMI-A-{1,2}`, Pi 4 `card0-HDMI-A-{1,2}` — valeurs `connected`/`disconnected`
- **Watchdog** : vérifie inotify flag + polling 5s fallback, écrit JSON `/tmp/kiosk-status.json`

### Mode headless & signalement physique (F-23.2)

| Signal               | Condition           | Pattern                          |
| -------------------- | ------------------- | -------------------------------- |
| LED activité Pi      | Aucun écran         | Clignotement lent (1s on/1s off) |
| LED activité Pi      | Mauvaise prise HDMI | Clignotement rapide (200ms)      |
| LED activité Pi      | Normal              | Heartbeat (mmc0 par défaut)      |
| Buzzer PWM (GPIO 18) | Mauvaise prise HDMI | 2 bips courts                    |
| Buzzer PWM (GPIO 18) | Aucun écran         | 3 bips courts (une seule fois)   |

Scripts : `neopro-led-status.sh` (sysfs `/sys/class/leds/ACT` ou `led0`) et `neopro-buzzer.sh` (PWM `/sys/class/pwm/pwmchip0`)

### Priorité Kiosk Pi (F-23.3)

Le Pi physique (kiosk) est **toujours master**. Si un navigateur PC s'est enregistré comme master, le Pi le rétrograde automatiquement en slave via `tv-role-assigned { role: 'slave' }`. Le PC reçoit un toast "Rétrogradé en mode esclave — le boîtier Pi a repris le contrôle".

### Transition dual-display zéro coupure (F-23.4)

Le passage mono→dual se fait **sans restart de Chromium**, mais le retour dual→mono **relance Chromium** :

1. Chromium est toujours lancé en `--app=URL` (jamais `--kiosk`) → redimensionnable via `xdotool`
2. Activation dual : `xrandr --output HDMI-X --auto --right-of` + séquence 4 étapes sur le primaire : `xprop _MOTIF_WM_HINTS` → `xdotool windowmove` → `xdotool windowsize` → `xdotool windowactivate`
3. Désactivation dual : **relance complète** du Chromium primaire avec `--window-size` re-détecté via `get_output_resolution()`, kill du secondaire
4. Plein écran par `xprop _MOTIF_WM_HINTS` (pas `F11` qui prend tout le bureau X11)
5. **Monitoring runtime** : `check_window_stacking()` vérifie toutes les 30s que lxpanel n'est pas au-dessus de Chromium, auto-recovery si détecté. Statut reporté dans `kiosk-status.json` (`windowStacking: ok|panel_above|recovered`)

> ⚠️ Après tout `xrandr` qui reconfigure le layout X11, il faut TOUJOURS ré-appliquer `xprop _MOTIF_WM_HINTS` + `xdotool windowactivate` sur le primaire. Le window manager (openbox/LXDE) restack `lxpanel` au-dessus de Chromium lors de la reconfiguration → barre de tâches visible sans ce re-raise.
>
> ⚠️ La désactivation dual ne peut PAS utiliser `xdotool windowsize` — Chromium ne re-render pas son viewport CSS interne après un resize X11 (le contenu reste zoomé à l'ancienne résolution). Le relaunch avec `--window-size` correct est obligatoire.
>
> ⚠️ `stop_chromium_secondary()` ne fait `xrandr --output $X --off` que si le câble HDMI-1 est encore physiquement connecté (vérifié via `detect_hdmi1_status`). Sinon, le `xrandr --off` sur un port déjà déconnecté provoque une race DRM kernel qui déstabilise le statut HDMI-0.

Le slave se synchronise par **videoIndex** (pas `videoPath`) car les variantes secondaires ont des chemins différents.

### Détection mauvaise prise & auto-swap (F-23.5)

```
HDMI-1 connecté && HDMI-0 déconnecté && !dual_display
        │
        ├── [AU BOOT] xrandr --output HDMI-A-2 --primary --auto IMMÉDIAT
        │   (avant start_chromium → fullscreen garanti dès le premier lancement)
        │   Flag /tmp/hdmi-swapped + HDMI_SWAPPED=1
        │
        ├── [RUNTIME] detect_wrong_port() = true
        │   ├── LED fast-blink + buzzer double
        │   ├── Message aide affiché sur HDMI-1 (countdown 10s)
        │   └── xrandr --output HDMI-1 --primary (après 10s)
        │       Flag /tmp/hdmi-swapped
        │
        ▼  (HDMI-0 rebranché)
  Reverse swap automatique → retour HDMI-0 primary
```

**Monitoring** : `kiosk-status.json` expose `hdmiSwapped` et `wrongPort` (bool), propagés via heartbeat au central.

### Failover dual-display (F-23.6)

Machine à états pour la perte de l'écran principal en mode dual-display :

```
  DUAL_ACTIVE ──── HDMI-0 perdu ────► FAILOVER_ACTIVE
       │                                     │
       │                                     ├── Chromium primaire tué (SIGTERM→SIGKILL)
       │                                     ├── xrandr HDMI-1 → primary +0+0
       │                                     ├── Secondary → plein écran TV complet
       │                                     ├── tv-role-promotion émis
       │                                     │
       │          HDMI-0 rebranché           │
       ◄──────────────────────────────────────┘
       │  deactivate_hdmi_failover() — 7 phases :
       │
       ├── 1. Kill ALL Chromium (SIGTERM→SIGKILL) — AVANT xrandr (GPU V3D)
       ├── 2. Forçage xrandr par port physique :
       │      HDMI-A-1 → --primary --auto --pos 0x0
       │      HDMI-A-2 → --auto --right-of HDMI-A-1
       │      (sans ça, HDMI-1 reste à +0+0 = détecté comme primaire)
       ├── 3. setup_secondary_xrandr (résolution native, offsets fins)
       ├── 4. Relance Chromium primaire sur HDMI-0 (xprop + windowactivate)
       ├── 5. Relance Chromium secondaire sur HDMI-1
       ├── 6. Vérification post-recovery (HDMI-0 offset == 0 ?)
       └── 7. tv-role-demotion émis + flag failover supprimé
```

> **Smoke test** : `deactivate_hdmi_failover must force HDMI-0 (HDMI-A-1) as primary BEFORE setup_secondary_xrandr` — empêche toute régression sur l'ordre des phases.

### Accès navigateur PC (F-23.7)

- **Homepage** : Angular `HomeComponent` (`raspberry/src/app/components/home/`) — route `path: ''` dans `app.routes.ts`. CTA "Ouvrir la télécommande" → `/remote`, lien secondaire "Afficher l'écran TV" → `/tv?displayType=secondary`, admin en footer. Le kiosk Pi ouvre `/tv` directement (`CHROMIUM_URL` dans `kiosk-watchdog.sh`), donc non impacté.
- **Fallback statique** : `raspberry/webapp/index.html` — même design simplifié, sert avant le build Angular ou si JS désactivé
- **Smoke test** : `E-23 F-23.7 root route HomeComponent guard` — vérifie que `app.routes.ts` utilise `HomeComponent` sur `path: ''` (pas de `redirectTo: 'tv'`)
- **PWA** : `manifest.json` pour installation sur l'écran d'accueil
- **Admin enrichi** : carte HDMI avec statut temps réel (HDMI-0, HDMI-1, mode dual/failover/wrong-port)
- **Analytics** : guard `displayType !== 'secondary'` sur tous les `trackVideoStart`/`trackVideoEnd` (évite double-comptage)

### Métriques HDMI (via heartbeat)

| Champ heartbeat          | Type    | Description                                                    |
| ------------------------ | ------- | -------------------------------------------------------------- |
| `hdmiStatus.hdmi0`       | string  | `connected` / `disconnected` / `unknown`                       |
| `hdmiStatus.hdmi1`       | string  | idem                                                           |
| `hdmiStatus.dualDisplay` | boolean | Mode dual-display actif                                        |
| `hdmiStatus.failover`    | boolean | Failover en cours                                              |
| `hdmiStatus.wrongPort`   | boolean | Écran sur mauvaise prise HDMI                                  |
| `connectedClients`       | array   | Liste des clients connectés (role, ip, userAgent, displayType) |

### Smoke tests de régression (29 guards)

Tous les invariants E-23 sont protégés par des smoke tests dans `central-server/src/__tests__/smoke.test.ts` — toute régression casse le CI.

---

## Détection résolution native (E-24)

> Epic E-24 — 3 Features, 8 US — implémenté v3.85.0

### Problème résolu

Avant v3.85.0, `kiosk-watchdog.sh` utilisait `1920×1080` en dur (~25 occurrences). Conséquences :

- TV 4K/720p/1440p forcée en 1080p → image étirée ou bordures noires
- `SECONDARY_X_OFFSET=1920` indépendant de la résolution réelle → fenêtre secondaire mal positionnée
- TV lente à négocier l'EDID → fallback silencieux sans alerte

### Cascade de détection `get_output_resolution()` (F-24.1)

```
    xrandr geometry         xrandr preferred mode      EDID native (DTD 1)       DEFAULT constants
  (résolution actuelle)     (marqueur "+" dans        (edid-decode sur           (dernier recours)
   configurée par --auto)    la liste des modes)     /sys/class/drm/card*-)
         │                         │                        │                         │
         ▼                         ▼                        ▼                         ▼
    ┌─────────┐    échec     ┌──────────┐    échec    ┌──────────┐    échec    ┌──────────────┐
    │ Niveau 1│ ──────────►  │ Niveau 2 │ ─────────►  │ Niveau 3 │ ─────────► │   Niveau 4   │
    │ xrandr  │              │ preferred│              │   EDID   │            │ 1920×1080    │
    │ geom    │              │ mode (+) │              │  native  │            │ (constants)  │
    └────┬────┘              └────┬─────┘              └────┬─────┘            └──────┬───────┘
         │                        │                         │                         │
         └────────────────────────┴─────────────────────────┴─────────────────────────┘
                                         │
                                    WIDTHxHEIGHT
                              return 0 (détecté) ou 1 (fallback)
```

- **Niveau 1** : `grep -oP` sur la ligne `connected` de xrandr (résolution actuelle)
- **Niveau 2** : Ligne avec marqueur `+` dans la liste des modes (mode préféré par l'écran)
- **Niveau 3** : `edid-decode` sur `/sys/class/drm/card*-{output}/edid` → DTD 1
- **Niveau 4** : `DEFAULT_SCREEN_WIDTH` × `DEFAULT_SCREEN_HEIGHT` (1920×1080)

### Élimination des magic numbers (F-24.2)

Toutes les références `${VAR:-1920}` / `${VAR:-1080}` remplacées par `${VAR:-$DEFAULT_SCREEN_WIDTH}` / `${VAR:-$DEFAULT_SCREEN_HEIGHT}`. Le offset secondaire dérive de la largeur réelle du primaire.

### Alerting fleet `displayFallback` (F-24.3)

```
kiosk-watchdog.sh                 sync-agent              central-server
       │                              │                        │
  get_output_resolution()              │                        │
  return 1 (fallback)                  │                        │
       │                              │                        │
  DISPLAY_FALLBACK_REASON=            │                        │
  "primary: xrandr+EDID unavailable"  │                        │
       │                              │                        │
  write_kiosk_status()                 │                        │
  → kiosk-status.json                  │                        │
  { displayFallback: "..." }           │                        │
       │                              │                        │
       └──── JSON.parse() ────────────► heartbeat ─────────────►│
                                       │                   checkAlerts()
                                       │                   │
                                       │              displayFallback !== ""
                                       │                   │
                                       │              alerts.push({
                                       │                type: 'display_fallback',
                                       │                severity: 'warning'
                                       │              })
                                       │                   │
                                       │              alertService.displayFallback()
                                       │                   │
                                       │              → Slack + DB
```

### Retry xrandr (3×2s)

TV lente à négocier l'EDID : 3 tentatives espacées de 2s avant de passer à la cascade. Même pattern que `wait_for_x_server()`.

### Métriques heartbeat (via kiosk-status.json)

| Champ heartbeat   | Type   | Description                                     |
| ----------------- | ------ | ----------------------------------------------- |
| `displayFallback` | string | Vide = résolution native détectée, sinon raison |

### Smoke tests de régression (8 guards)

| Test                                          | Vérifie                                        |
| --------------------------------------------- | ---------------------------------------------- |
| `DEFAULT_SCREEN_WIDTH` constant               | Constante définie comme entier positif         |
| `DEFAULT_SCREEN_HEIGHT` constant              | Constante définie comme entier positif         |
| `get_output_resolution()` existe              | Fonction de cascade présente                   |
| Aucun `1920` brut hors constante/commentaires | Magic number éliminé                           |
| Aucun `1080` brut hors constante/commentaires | Magic number éliminé                           |
| `SECONDARY_X_OFFSET` dérivé                   | Dérive de `PRIMARY_SCREEN_WIDTH`, pas hardcodé |
| `DISPLAY_FALLBACK_REASON` dans status         | Alerte fleet active dans kiosk-status.json     |
| xrandr preferred mode (`+` marker)            | Cascade niveau 2 présente                      |

---

## Performance

### Optimisations frontend

- Lazy loading routes
- Native HTML5 video double-buffer (seamless A/B switching)
- SCSS compilation
- Service Worker (PWA ready)

### Optimisations backend

- Redis adapter Socket.IO (sticky sessions multi-instance)
- PostgreSQL indexes
- Connection pooling configurable (`DB_POOL_MAX`, defaut 5, clamp 1-50)
- Pool error resilience : tolère les déconnexions idle PgBouncer, crash uniquement après 5 erreurs / 30s
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
- Double-buffer vidéo avec early switch (`timeupdate` → preload 1.5s, switch 0.5s avant la fin)
- Cleanup agressif des buffers décodeur GPU après chaque switch (~50MB mémoire stable)
- Disk cache warming via `fetch()` pour boucles 20-100+ vidéos (page cache kernel)
- Freeze-frame pré-capturé (500ms) pour transitions sans flash
- Rotation pondérée Bresenham : `generateWeightedPlaylist()` distribue les vidéos selon leur `weight` (1-10) avec contrainte anti-consécutif par sponsor. Les vidéos `pinned` restent à leur position d'origine. Algorithme déterministe → sync dual-display fiable.

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

### Phase 4 : Intelligence (📋 Backlog)

- Estimation audience (caméra RPi)
- Score live (websocket)
- Prédictions ML

### Phase 5 : Scale (📋 Backlog)

- Multi-tenant SaaS
- White-label
- App mobile iOS/Android

### Architecture Roadmap (✅ Complété)

Refactoring en 7 phases réalisé en février 2026 :

1. **Storage** — Unification FTP-only via `storage.service.ts`
2. **Dead Code** — Suppression dossiers obsolètes, références mortes
3. **Winston Logger** — Remplacement `console.log` → Winston structuré
4. **Modularisation Pi** — admin-server (3 970→260 lignes), socket-server (812→110 lignes)
5. **Error Handling** — Classes d'erreur typées (`ServiceError`, `ValidationError`)
6. **Repository Pattern** — 150 appels `query()` → 21 repositories typés
7. **Refactoring avancé** :
   - 7.1 — Migration services vers Repository pattern
   - 7.2 — Extraction socket handlers (1 717→676 lignes, 9 handlers)
   - 7.3 — Migration controllers vers Repository pattern (ESLint enforced)
   - 7.4 — Auth admin/super_admin boundary

Résultat : 2 369 tests / 85+ suites, 0 failures.

---

## Documentation associée

- **[SYNC_ARCHITECTURE.md](SYNC_ARCHITECTURE.md)** : Détails synchronisation
- **[COMMAND_QUEUE.md](COMMAND_QUEUE.md)** : Gestion sites offline
- **[REFERENCE.md](REFERENCE.md)** : Documentation technique complète
- **[STATUS.md](STATUS.md)** : État du projet (9.2/10)

---

**Dernière mise à jour** : 24 février 2026
**Version** : 3.80.7+
