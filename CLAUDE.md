# CLAUDE.md - Guide du projet Neopro

## Description du projet

Neopro est une plateforme de télévision interactive pour clubs sportifs. Elle combine :
- **Edge Layer** : Raspberry Pi déployés dans les clubs (Angular 20 + Socket.IO)
- **Cloud Layer** : Serveur central pour la gestion de flotte (Express + PostgreSQL)

## Architecture

```
neopro/
├── raspberry/              # Application Raspberry Pi (Edge)
│   ├── frontend/           # Angular 20 - TV/Remote/Login
│   ├── server/             # Socket.IO local
│   ├── admin/              # Interface admin (port 8080)
│   ├── sync-agent/         # Synchronisation avec le cloud
│   └── scripts/            # Déploiement (setup-new-club.sh, etc.)
│
├── central-server/         # API Backend (Cloud)
│   └── src/
│       ├── controllers/    # Logique métier
│       ├── routes/         # Routes REST
│       ├── services/       # Services (socket, email, pdf)
│       └── middleware/     # Auth JWT, validation
│
├── central-dashboard/      # Dashboard admin Angular 17
│   └── src/app/
│       ├── features/       # Sites, Dashboard, Admin
│       └── core/           # Services partagés
│
├── server-render/          # Socket.IO cloud (Render.com)
├── e2e/                    # Tests Playwright
└── docs/                   # Documentation (180+ fichiers)
```

## Stack technique

| Composant | Technologies |
|-----------|--------------|
| Frontend Raspberry | Angular 20, Socket.IO, SCSS |
| Frontend Dashboard | Angular 17, Chart.js, Leaflet |
| Backend | Node.js 18+, Express, TypeScript |
| Base de données | PostgreSQL (Supabase) |
| Cache | Redis (Upstash) |
| Tests | Jest, Karma, Playwright |

## Commandes courantes

```bash
# Développement
npm start                    # Frontend Raspberry (port 4200)
npm run start:central        # Dashboard central (port 4300)
npm run server               # Socket.IO local

# Build
npm run build:raspberry      # Build pour Raspberry Pi
npm run build:central        # Build dashboard

# Déploiement
npm run deploy:raspberry <host>   # Déployer sur un Pi

# Tests
npm test                     # Tous les tests
npm run test:server          # Tests API (Jest)
npm run lint                 # Linting
```

## Base de données

Tables principales :
- `sites` : Clubs/boîtiers Pi (site_name, club_name, location, sports, status)
- `videos` : Vidéos avec métadonnées (filename, category, duration, storage_path)
- `content_deployments` : Déploiements de vidéos vers sites
- `users` : Utilisateurs avec rôles (super_admin, admin, operator, viewer, advertiser, agency)
- `config_history` : Historique des configurations (JSONB)
- `metrics` : Métriques des Pi (cpu, memory, temperature)

## Conventions de code

- **TypeScript** partout (strict mode)
- **Services singleton** : `export const myService = new MyService()`
- **Contrôleurs Express** : Fonctions async avec try/catch
- **Angular** : Standalone components, lazy loading
- **Logs** : Winston avec niveaux (debug, info, warn, error)

## Variables d'environnement

```bash
# Base de données
DATABASE_URL=postgresql://...
DATABASE_SSL=true

# Auth
JWT_SECRET=...
JWT_EXPIRES_IN=7d

# Stockage
FTP_HOST, FTP_USER, FTP_PASSWORD   # Stockage vidéos
SUPABASE_URL, SUPABASE_ANON_KEY    # Fallback

# Redis
REDIS_URL=redis://...
```

## Patterns importants

### Authentification
- JWT stocké en HttpOnly cookie (dashboard)
- Middleware `authenticate` pour protéger les routes
- Rôles : super_admin > admin > operator > viewer / advertiser / agency

### Socket.IO
- Sites Pi se connectent avec API key
- Events : `register`, `heartbeat`, `command`, `sync`
- Rooms par site_id

### Déploiement vidéos
- Upload vers FTP (Hostinger) ou Supabase Storage
- Déploiement async vers sites/groupes
- Statuts : pending → in_progress → completed/failed

## Tests

```bash
# API (Jest)
cd central-server && npm test

# Frontend (Karma)
npm run test:raspberry
npm run test:central

# E2E (Playwright)
cd e2e && npx playwright test
```

## Fichiers clés à connaître

- `central-server/src/server.ts` : Point d'entrée API
- `central-server/src/routes/index.ts` : Toutes les routes
- `central-server/src/types/index.ts` : Types TypeScript
- `central-dashboard/src/app/app.routes.ts` : Routes Angular
- `raspberry/frontend/src/app/` : App Angular Raspberry
- `docs/REFERENCE.md` : Documentation technique complète
