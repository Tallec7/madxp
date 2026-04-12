# CLAUDE.md - Neopro

> Système de TV interactive pour clubs sportifs. Architecture 3-tiers : Dashboard Angular 20 → Central Server Express/PG → Raspberry Pi Edge.

## Commandes

```bash
# Développement
npm start                          # Frontend Raspberry (port 4200)
npm run start:central              # Dashboard central (port 4300)
cd central-server && npm run dev   # API Backend (port 3001)

# Simulation locale complète (dev-seed)
npm run dev:seed                   # Installe config + vidéos + data pour les 3 serveurs
npm run dev:seed:clean             # Nettoie les fichiers dev-seed

# Build
npm run build:raspberry            # Build Angular Pi
npm run build:central              # Build dashboard
cd central-server && npm run build # Compile TypeScript

# Tests
npm run test:server                # Jest (API central-server — 2728 tests)
npm run test:smoke                 # Jest (Smoke tests — 1221 tests, 12 domain files, détecte régressions de wiring)
npm run test:smoke:smart           # Smart smoke — lance uniquement les suites liées aux fichiers modifiés (git diff)
npm run test:central               # Karma (Angular Dashboard — 520 tests)
cd raspberry/server && npm test    # Jest (Socket.IO server — 71 tests)
cd raspberry/admin && npm test     # Jest (Admin server — 194 tests)
cd e2e && npx playwright test      # E2E
npm run lint                       # ESLint

# Monitoring
docker compose up prometheus alertmanager grafana  # Grafana (3000) + Prometheus (9090) + Alertmanager (9093)

# Base de données
cd central-server && npm run db:migrate

# Pitch deck / métriques de traction
source central-server/.env && psql "$DATABASE_URL" -f central-server/src/scripts/pitch-deck-metrics.sql
```

## Règles de code

- **TypeScript strict** : jamais de `any`, toujours typer explicitement
- **Repository pattern** : utiliser les repositories (`siteRepository`, `alertRepository`, etc.) — 0 `query()` direct (ESLint enforced)
- **Logger Winston** : `logger.info('Action', { context })` — pas de `console.log` dans central-server
- **Validation Joi** avant traitement des inputs
- **Async/await** avec try/catch, jamais de callbacks
- **Conventional Commits** : `feat(scope):`, `fix(scope):`, `docs(scope):`
- **Architecture modulaire Pi** : `raspberry/server/` et `raspberry/admin/` suivent le pattern orchestrateur + services + routes

## NE JAMAIS FAIRE (règles universelles)

- Modifier les migrations déjà en production
- Changer le format des `api_key` des sites (casserait tous les Pi)
- Utiliser `console.log` dans central-server (utiliser Winston)
- Revenir à Nixpacks pour Railway (Nixpacks auto-détecte le root package.json et lance `ng build` qui OOM — utiliser le Dockerfile builder `central-server/Dockerfile` avec `COPY central-server/` pour isoler le build)
- Tracker `raspberry/admin/public/app.js` ou `styles.css` dans git (ce sont des build artifacts générés par `build-admin.sh` — les sources sont dans `modules/` et `styles/`)
- Importer `../config/database` dans les controllers (ESLint bloque tout import, utiliser les repositories)
- Commit des secrets ou fichiers `.env`
- Push directement sur `main` sans PR
- Requêtes SQL non paramétrées (`'${email}'` → injection SQL)
- Utiliser `admin-neopro.kalonpartners.bzh` dans les URLs (le sous-domaine correct est `neopro-admin.kalonpartners.bzh` — `admin-neopro` est NXDOMAIN)

> **~250 règles domaine-spécifiques** sont dans `.claude/rules/` et se chargent automatiquement selon les fichiers édités. Ne pas les dupliquer ici.

## Architecture détaillée

- Vue système : `docs/technical/ARCHITECTURE.md`
- Référence complète : `docs/technical/REFERENCE.md`
- Sync-agent : `docs/technical/SYNC_ARCHITECTURE.md`
- Schéma DB : `central-server/src/scripts/full-schema.sql`
- Troubleshooting : `docs/guides/TROUBLESHOOTING.md`
- WiFi USB (clé) : `docs/guides/WIFI_USB_GUIDE.md`
- Onboarding : `docs/01-START-HERE.md`
- Client critique NLF : `docs/clients/NLF.md`
- Changelog : `docs/changelog/CHANGELOG.md`
- Métriques pitch deck : `central-server/src/scripts/pitch-deck-metrics.sql`
- **SAFe Pilotage Produit** : `docs/safe/README.md` (Epics, Features, US, Sprint Tracker, Value Streams)
- **SAFe Auto-update** : `.claude/rules/safe-update.md` (mise à jour auto des .md SAFe à chaque feat/fix)
- **SAFe Excel Generator** : `docs/safe/scripts/export-to-excel.py` (régénéré auto par pre-commit hook)
- **SAFe Notion (visualisation)** : https://www.notion.so/30bc27de363881d49d06e50eabbdd6b5

Les règles détaillées par domaine sont dans `.claude/rules/` et se chargent automatiquement selon les fichiers édités.
