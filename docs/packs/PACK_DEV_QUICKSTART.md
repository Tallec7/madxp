# NEOPRO - Developer Quickstart Pack

**Version:** 1.0 | **Last Updated:** December 17, 2025

---

## Usage

Use this pack when:

- You're a new developer joining the NEOPRO team
- You need to set up a local development environment quickly
- You want to understand the codebase architecture for coding
- You're ready to start contributing to the project

**Copy & paste into Claude/ChatGPT:** This document is self-contained and optimized for AI pair programming sessions.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Architecture](#3-project-architecture)
4. [Local Development Setup](#4-local-development-setup)
5. [npm Scripts Reference](#5-npm-scripts-reference)
6. [Project Structure](#6-project-structure)
7. [Key Concepts](#7-key-concepts)
8. [Common Development Tasks](#8-common-development-tasks)

---

## 1. Project Overview

**NEOPRO** is a complete interactive TV system for sports clubs combining:

- **Hardware:** Raspberry Pi 4 with pre-configured setup (€80)
- **Local Software:** Angular app + Socket.IO server for real-time TV control
- **Cloud Dashboard:** Central management for multi-site fleet control
- **Analytics:** Club usage analytics + Sponsor impression tracking

**Current Status:** Production-ready with 27 active deployments

**Core Team:** Edge computing platform (Node.js + Angular + PostgreSQL)

---

## 2. Technology Stack

### Frontend

| Component         | Technology       | Version |
| ----------------- | ---------------- | ------- |
| Raspberry Pi App  | Angular          | 20.3.0  |
| Central Dashboard | Angular          | 17.0.0  |
| Video Player      | Video.js         | 8.23.4  |
| Real-time Client  | Socket.IO Client | 4.8.1   |
| Charts            | Chart.js         | 4.5.1   |
| UI Framework      | SCSS/CSS3        | Latest  |

### Backend

| Component  | Technology | Version |
| ---------- | ---------- | ------- |
| API Server | Express.js | 4.18.2  |
| Runtime    | Node.js    | 18+ LTS |
| Real-time  | Socket.IO  | 4.7     |
| Database   | PostgreSQL | 15      |
| Auth       | JWT        | 9.0.2   |
| Validation | Joi        | 17.11.0 |
| ORM        | Direct SQL | -       |

### Infrastructure

| Component       | Solution                          |
| --------------- | --------------------------------- |
| Cloud Hosting   | Render.com                        |
| Database        | Supabase (PostgreSQL)             |
| Cache           | Redis (Upstash)                   |
| Local Hardware  | Raspberry Pi 4 (4GB RAM)          |
| Web Server      | Nginx                             |
| Process Manager | Systemd                           |
| Testing         | Jest (Backend) + Karma (Frontend) |

---

## 3. Project Architecture

### High-Level System

```
┌─────────────────────────────────────────────────────────┐
│                    CLOUD LAYER (Render)                 │
│                                                         │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Central Server │  │   Dashboard  │  │  Socket.IO │ │
│  │ (Node/Express)  │  │   (Angular)  │  │   Server   │ │
│  │                 │  │              │  │            │ │
│  │  • REST API     │  │ • Fleet view │  │ • Real-time│ │
│  │  • Auth (JWT)   │  │ • Analytics  │  │ • WebRTC   │ │
│  │  • PostgreSQL   │  │ • Reports    │  │            │ │
│  └────────┬────────┘  └──────────────┘  └────────┬───┘ │
└───────────┼──────────────────────────────────────┼──────┘
            │                                       │
            │         Internet (HTTPS)              │
            │                                       │
┌───────────┼──────────────────────────────────────┼──────┐
│           ▼                                       ▼      │
│ ┌─────────────────────────────────────────────────────┐ │
│ │     EDGE LAYER (Multiple Raspberry Pi 4)            │ │
│ │                                                     │ │
│ │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │ │
│ │  │  Sync Agent  │  │ Local Server │  │  Admin   │  │ │
│ │  │  (Node.js)   │  │ (Socket.IO)  │  │   UI     │  │ │
│ │  │              │  │              │  │ (Express)│  │ │
│ │  │ • Heartbeat  │  │ • Port: 3000 │  │ Port: 8080  │
│ │  │ • Config sync│  │ • TV control │  │          │  │
│ │  │ • Analytics  │  │ • Real-time  │  │          │  │
│ │  └──────────────┘  └──────────────┘  └──────────┘  │ │
│ │                       ▼                             │ │
│ │  ┌─────────────────────────────────────────────┐   │ │
│ │  │       Angular Frontend (Port 80)             │   │ │
│ │  │  /login  /tv (video player)  /remote (ctrl)  │   │ │
│ │  └─────────────────────────────────────────────┘   │ │
│ │                                                     │ │
└─┴─────────────────────────────────────────────────────┴─┘
```

### Monorepo Structure

```
neopro/ (root workspace)
│
├── raspberry/                    # Edge application
│   ├── frontend/                # Angular 20 (TV/Remote/Login)
│   ├── server/                  # Socket.IO local server
│   ├── admin/                   # Admin interface (port 8080)
│   ├── sync-agent/              # Sync with cloud
│   └── config/                  # Templates & systemd
│
├── central-server/              # Cloud API (Node/Express)
│   └── src/
│       ├── controllers/         # Business logic
│       ├── routes/              # REST API endpoints
│       ├── services/            # Analytics, PDF, etc.
│       ├── middleware/          # Auth, validation, rate-limit
│       └── scripts/             # Migrations, seed data
│
├── central-dashboard/           # Cloud admin (Angular 20)
│   └── src/app/
│       ├── features/            # Sites, Analytics, Admin
│       └── core/                # Services, guards, models
│
├── e2e/                         # End-to-end tests
│
├── docker/                      # Monitoring (Prometheus/Grafana)
└── docs/                        # Documentation (180+ files)
```

### Key Dependencies Between Packages

```
┌─────────────────────────────────┐
│     ROOT WORKSPACE              │
│    (Angular 20 CLI)             │
└────────────┬────────────────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
raspberry  central-  central-
(Angular)  dashboard  server
           (Angular)  (Express)
    │         │         │
    │         └────┬────┘
    │              ▼
    │         Supabase
    │       (PostgreSQL)
    │
    ▼
sync-agent → REST API ──► PostgreSQL
(Node.js)     (Express)   (Metrics)
```

### Data Flow Examples

**Configuration Synchronization:**

```
Central Dashboard (Admin edits config)
         ↓
Central Server API (/api/sites/:id/config)
         ↓
PostgreSQL (pending_config column)
         ↓
Sync Agent (polling /api/sites/status)
         ↓
Merge local + remote config
         ↓
/home/pi/neopro/public/configuration.json
         ↓
Angular frontend (reload config)
```

**Analytics Tracking:**

```
TV Frontend (video play event)
         ↓
Local Server (WebSocket event)
         ↓
Sync Agent (buffer + batch)
         ↓
Central Server API (/api/analytics/video-plays)
         ↓
PostgreSQL (video_plays table)
         ↓
Dashboard Analytics (Chart.js graphs)
```

---

## 4. Local Development Setup

### Prerequisites

- **Node.js:** 20+ (LTS recommended)
- **Angular CLI:** 20.3.3
- **npm:** 10+
- **Docker (optional):** For full stack with PostgreSQL/Redis
- **Git:** Standard version control

### Installation Steps

#### Step 1: Clone and Install

```bash
# Clone the repository
git clone <repo-url>
cd neopro

# Install root dependencies
npm install

# Note: Dependencies for each package (raspberry, central-server, etc.)
# are managed by npm workspaces automatically
```

#### Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your local values
nano .env
```

**Key environment variables:**

```
NEOPRO_API_URL=http://localhost:3001
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-anon-key>
JWT_SECRET=<your-jwt-secret>
```

#### Step 3: Start Development Services

**Option 1: Using automation script (Recommended)**

```bash
./dev-local.sh
```

This starts:

- Frontend Raspberry (port 4200)
- Central Dashboard (port 4300)
- Socket.IO server (port 3000)
- Admin interface (port 8080)

**Option 2: Manual setup (3 terminals)**

Terminal 1 - Raspberry Frontend:

```bash
npm start
# Opens http://localhost:4200
```

Terminal 2 - Central Dashboard:

```bash
npm run start:central
# Opens http://localhost:4300
```

Terminal 3 - Local servers:

```bash
cd raspberry/server && node server.js
# Socket.IO at port 3000

# In another terminal:
cd raspberry/admin && node admin-server.js
# Admin UI at port 8080
```

**Option 3: Docker Compose (Complete stack)**

```bash
docker-compose up -d

# Includes:
# - PostgreSQL (5432)
# - Redis (6379)
# - API (3001)
# - Prometheus (9090)
# - Grafana (3000)
```

### Verify Setup

```bash
# Test API
curl http://localhost:3001/api/health

# Test WebSocket
curl http://localhost:3000

# Test frontend
open http://localhost:4200
```

---

## 5. npm Scripts Reference

### Root Level Commands

```bash
# Frontend development
npm start                    # Raspberry frontend (dev server)
npm run start:central        # Central dashboard (dev server)
npm run build               # Build both Angular projects
npm run build:raspberry     # Build for Raspberry deployment
npm run build:central       # Build central dashboard
npm run deploy:raspberry <host>  # Build + deploy to Pi

# Testing
npm test                    # All tests (both projects)
npm run test:raspberry      # Raspberry frontend tests
npm run test:central        # Central dashboard tests
npm run test:server         # API backend tests (Jest)
npm run test:sync-agent     # Sync agent tests

# Code Quality
npm run lint                # Lint both projects
npm run lint:raspberry      # Lint Raspberry frontend
npm run lint:central        # Lint Central dashboard
npm run lint:server         # Lint API backend

# Servers
npm run server              # Start Socket.IO local server
```

### Package-Specific Commands

**Central Server:**

```bash
cd central-server
npm run dev                 # Development with nodemon
npm run build              # TypeScript compilation
npm test                   # Run Jest tests
npm run migrate            # Database migrations
```

**Raspberry Sync Agent:**

```bash
cd raspberry/sync-agent
npm test                   # Run tests
npm run start              # Start agent
```

---

## 6. Project Structure Deep Dive

### Raspberry Frontend (`raspberry/src`)

```
src/
├── app/
│   ├── components/
│   │   ├── tv/
│   │   │   ├── tv.component.ts          # Main video player (Video.js)
│   │   │   ├── tv.component.html
│   │   │   └── tv.component.scss
│   │   ├── remote/
│   │   │   ├── remote.component.ts      # Mobile remote control
│   │   │   ├── remote.component.html    # Categories + video list
│   │   │   └── remote.component.scss
│   │   ├── login/
│   │   │   └── login.component.ts       # Password authentication
│   │   └── shared/
│   │       └── ...                      # Reusable components
│   │
│   ├── services/
│   │   ├── socket.service.ts            # WebSocket communication
│   │   ├── auth.service.ts              # Authentication logic
│   │   ├── config.service.ts            # Load & manage configuration
│   │   ├── analytics.service.ts         # Track video plays
│   │   └── ...
│   │
│   ├── guards/
│   │   └── auth.guard.ts                # Protect /tv and /remote routes
│   │
│   ├── models/
│   │   ├── configuration.interface.ts   # Config schema
│   │   ├── socket-events.interface.ts   # Socket.IO events
│   │   └── ...
│   │
│   └── app.routes.ts                    # Main routing config
│
├── main.ts                              # Bootstrap
└── styles.scss                          # Global styles
```

### Central Server (`central-server/src`)

```
src/
├── controllers/
│   ├── sites.controller.ts              # CRUD sites
│   ├── videos.controller.ts             # CRUD videos
│   ├── analytics.controller.ts          # 1300+ lines analytics logic
│   ├── sponsors.controller.ts           # Sponsor management
│   └── auth.controller.ts               # JWT authentication
│
├── routes/
│   ├── sites.routes.ts                  # /api/sites
│   ├── videos.routes.ts                 # /api/videos
│   ├── analytics.routes.ts              # /api/analytics
│   ├── sponsors.routes.ts               # /api/sponsors
│   └── index.ts                         # Main routing
│
├── services/
│   ├── pdf-report.service.ts            # Generate PDF reports
│   ├── analytics.service.ts             # Data aggregation
│   ├── email.service.ts                 # Email notifications
│   ├── sync.service.ts                  # Configuration sync logic
│   └── ...
│
├── middleware/
│   ├── auth.middleware.ts               # JWT verification
│   ├── validation.middleware.ts         # Joi schema validation
│   ├── error.middleware.ts              # Error handling
│   └── rate-limit.middleware.ts         # Request rate limiting
│
├── scripts/
│   ├── migrations/
│   │   └── add-audience-and-score-fields.sql
│   └── analytics-tables.sql             # Table definitions
│
├── server.ts                            # Express app setup
└── index.ts                             # Entry point
```

### Central Dashboard (`central-dashboard/src/app`)

```
features/
├── sites/
│   ├── sites-list/
│   ├── site-edit/
│   ├── site-detail/
│   └── sites.service.ts
│
├── analytics/
│   ├── club-analytics/               # Multi-tab dashboard
│   ├── sponsor-analytics/            # Sponsor tracking
│   ├── analytics-overview/           # Admin multi-site view
│   └── analytics.service.ts
│
├── dashboard/
│   ├── main-dashboard/               # Fleet overview
│   └── dashboard.service.ts
│
└── admin/
    ├── user-management/
    ├── system-settings/
    └── admin.service.ts

core/
├── services/
│   ├── auth.service.ts               # JWT & user state
│   ├── api.service.ts                # HTTP client wrapper
│   └── notification.service.ts       # Toast messages
│
├── guards/
│   ├── auth.guard.ts                 # Require login
│   └── role.guard.ts                 # RBAC (admin/operator/viewer)
│
└── models/
    ├── site.model.ts
    ├── video.model.ts
    ├── user.model.ts
    └── ...
```

### Configuration Files

**`raspberry/config/templates/TEMPLATE-configuration.json`:**

```json
{
  "auth": {
    "password": "SecurePassword123!",
    "clubName": "CLUB_ID",
    "sessionDuration": 28800000
  },
  "sync": {
    "enabled": true,
    "serverUrl": "https://neopro-central-production.up.railway.app",
    "siteName": "Club Name",
    "clubName": "Full Club Name",
    "location": {
      "city": "City",
      "region": "Region",
      "country": "France"
    }
  },
  "categories": [
    {
      "id": "sponsors",
      "name": "Sponsors",
      "subcategories": [
        {
          "id": "sponsors_loop",
          "name": "Sponsor Loop",
          "videos": []
        }
      ]
    }
  ],
  "sponsors": [],
  "version": "1.0"
}
```

---

## 7. Key Concepts

### Socket.IO Real-Time Communication

**TV ↔ Remote Control:**

Events emitted by Remote → TV listens:

```typescript
// In remote.component.ts
socket.emit('play-video', { id: videoId });

// In tv.component.ts
socket.on('play-video', (data) => {
  this.videoPlayer.play(data.id);
});
```

### Configuration Management

**Local Configuration Flow:**

1. Admin loads `/admin` (port 8080)
2. Displays `configuration.json`
3. User edits JSON
4. Clicks "Save and Restart"
5. Configuration written to disk
6. Services restart with new config
7. Frontend reloads configuration

### Synchronization Architecture

**Central Content → Local:**

```
1. NEOPRO admin deploys video to "ANNONCES_NEOPRO" category
2. Sync Agent polls /api/sites/status every 30s
3. Downloads new video + config merge
4. Merges: NEOPRO content (PUSH) + Club content (PULL)
5. Writes merged config to configuration.json
6. Frontend reloads
```

**Club Content → Central (Mirroring):**

```
1. Opérateur adds hommage video locally
2. Admin UI saves to configuration.json
3. Sync Agent periodically pushes state to central
4. Central stores in database (read-only mirror)
5. NEOPRO can see what clubs have locally
```

### Authentication & Authorization

**Local Authentication:**

- Password stored in `configuration.json` (auth.password)
- Login page (/login) validates password
- JWT token generated on success
- Stored in localStorage
- Guard protects /tv and /remote routes
- Default password: `GG_NEO_25k!` (MUST change in production)

**Cloud Authentication:**

- Email + password → Supabase Auth
- JWT token returned
- Used for all API requests (Bearer token)
- Roles: admin, operator, viewer

### Database Schema (Key Tables)

```sql
-- Sites (clubs)
sites (id, name, api_key, status, last_seen, version, metadata)

-- Videos
videos (id, name, description, storage_path, duration, created_at)

-- Analytics
club_sessions (id, site_id, session_start, session_end, match_date, ...)
video_plays (id, session_id, video_id, started_at, duration_watched, ...)
club_daily_stats (site_id, date, total_plays, avg_duration, ...)

-- Sponsors
sponsors (id, name, logo_url, created_at)
sponsor_impressions (id, video_id, site_id, impressions, duration, ...)
sponsor_daily_stats (sponsor_id, date, total_impressions, ...)

-- System
alerts (id, site_id, type, severity, message, created_at)
metrics (id, site_id, cpu_usage, memory, temperature, disk_usage, recorded_at)
```

---

## 8. Common Development Tasks

### Task: Add a New Field to Configuration

1. **Update schema** (`raspberry/src/app/models/configuration.interface.ts`):

```typescript
export interface Configuration {
  // ... existing fields
  newFeature: {
    enabled: boolean;
    value: string;
  };
}
```

2. **Update template** (`raspberry/config/templates/TEMPLATE-configuration.json`):

```json
{
  "newFeature": {
    "enabled": false,
    "value": "default"
  }
}
```

3. **Load in component** (`raspberry/src/app/components/tv/tv.component.ts`):

```typescript
constructor(private configService: ConfigService) {
  this.config = this.configService.getConfiguration();
  console.log(this.config.newFeature);
}
```

4. **Test locally** by running `npm start` and checking browser console

### Task: Add a New Analytics Metric

1. **Create database migration** (`central-server/src/scripts/migrations/`):

```sql
ALTER TABLE club_daily_stats ADD COLUMN new_metric INTEGER DEFAULT 0;
```

2. **Update analytics service** (`central-server/src/services/analytics.service.ts`):

```typescript
async recordMetric(siteId: string, metric: any) {
  const query = `
    INSERT INTO metrics (site_id, new_metric, recorded_at)
    VALUES ($1, $2, NOW())
  `;
  await db.query(query, [siteId, metric.value]);
}
```

3. **Add API endpoint** (`central-server/src/routes/analytics.routes.ts`):

```typescript
router.post('/analytics/new-metric', async (req, res) => {
  const { siteId, value } = req.body;
  await analyticsService.recordMetric(siteId, { value });
  res.json({ success: true });
});
```

4. **Call from client** (`raspberry/src/app/services/analytics.service.ts`):

```typescript
trackMetric(metric: any) {
  this.http.post('/api/analytics/new-metric', {
    siteId: this.config.sync.siteId,
    value: metric
  }).subscribe();
}
```

### Task: Add a New Remote Control Button

1. **Update remote template** (`raspberry/src/app/components/remote/remote.component.html`):

```html
<button (click)="onNewAction()" class="action-btn">New Action</button>
```

2. **Add handler** (`raspberry/src/app/components/remote/remote.component.ts`):

```typescript
onNewAction() {
  this.socketService.emit('new-action', { data: 'value' });
}
```

3. **Listen on TV** (`raspberry/src/app/components/tv/tv.component.ts`):

```typescript
this.socketService.on('new-action', (data) => {
  // Handle new action
  this.performAction(data);
});
```

4. **Update styles** (`raspberry/src/app/components/remote/remote.component.scss`):

```scss
.action-btn {
  // Styling
}
```

### Task: Deploy to Raspberry Pi

```bash
# 1. Build
npm run build:raspberry

# 2. Deploy to specific Pi
npm run deploy:raspberry neopro.local

# Or with custom host
npm run deploy:raspberry 192.168.1.100

# The script handles:
# - Compilation
# - Asset copying
# - SSH transfer
# - Systemd restart
```

### Task: Run Tests Locally

```bash
# All tests
npm test

# Specific package
npm run test:server        # Backend (Jest)
npm run test:raspberry     # Frontend (Karma)

# With coverage
cd central-server && npm test -- --coverage

# Watch mode
npm run test:server -- --watch
```

### Task: Debug Socket.IO Communication

```typescript
// In any component
constructor(private socketService: SocketService) {
  // Enable Socket.IO logging
  this.socketService.socket.onAny((event, ...args) => {
    console.log(`Socket event: ${event}`, args);
  });
}
```

---

## Additional Resources

- **Full Architecture Details:** See `docs/technical/ARCHITECTURE.md`
- **Synchronization Deep Dive:** See `docs/technical/SYNC_ARCHITECTURE.md`
- **Installation Guide:** See `docs/INSTALLATION_COMPLETE.md`
- **API Reference:** See `docs/technical/REFERENCE.md`
- **Testing Guide:** See `docs/TESTING_GUIDE.md`
- **Troubleshooting:** See `docs/TROUBLESHOOTING.md`

---

## Quick Troubleshooting

| Problem                      | Solution                                                 |
| ---------------------------- | -------------------------------------------------------- |
| Port 4200 already in use     | `lsof -i :4200` then `kill -9 <pid>`                     |
| npm install fails            | Delete `node_modules` and `package-lock.json`, try again |
| WebSocket connection refused | Ensure Socket.IO server is running on port 3000          |
| Build fails                  | Check TypeScript version: `npm run build -- --version`   |
| Database connection error    | Verify Supabase credentials in `.env`                    |
| Remote doesn't control TV    | Check WebSocket events in browser dev tools Console tab  |

---

**Happy coding!** 🚀

For detailed code walkthroughs or architecture deep dives, pair with Claude using this pack as context.
