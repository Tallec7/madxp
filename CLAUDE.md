# CLAUDE.md - Neopro

> Système de TV interactive pour clubs sportifs. Architecture 3-tiers : Dashboard Angular 20 → Central Server Express/PG → Raspberry Pi Edge.

## Commandes

```bash
# Développement
npm start                          # Frontend Raspberry (port 4200)
npm run start:central              # Dashboard central (port 4300)
cd central-server && npm run dev   # API Backend (port 3001)

# Build
npm run build:raspberry            # Build Angular Pi
npm run build:central              # Build dashboard
cd central-server && npm run build # Compile TypeScript

# Tests
npm run test:server                # Jest (API central-server — 1487 tests)
npm run test:smoke                 # Jest (Smoke tests — 142 tests, détecte régressions de wiring)
npm run test:central               # Karma (Angular Dashboard — 541 tests)
cd raspberry/server && npm test    # Jest (Socket.IO server — 71 tests)
cd raspberry/admin && npm test     # Jest (Admin server — 124 tests)
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

## NE JAMAIS FAIRE

- Modifier les migrations déjà en production
- Changer le format des `api_key` des sites (casserait tous les Pi)
- Utiliser `console.log` dans central-server (utiliser Winston)
- Importer `../config/database` dans les controllers (ESLint bloque tout import, utiliser les repositories)
- Commit des secrets ou fichiers `.env`
- Push directement sur `main` sans PR
- Requêtes SQL non paramétrées (`'${email}'` → injection SQL)
- Ajouter `NoNewPrivileges=true` dans les fichiers `.service` systemd (bloque sudo, deadlock OTA — smoke test enforced)

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

Les règles détaillées par domaine sont dans `.claude/rules/` et se chargent automatiquement selon les fichiers édités.
