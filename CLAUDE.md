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
npm run test:server                # Jest (API central-server — 1592 tests)
npm run test:smoke                 # Jest (Smoke tests — 259 tests, détecte régressions de wiring)
npm run test:central               # Karma (Angular Dashboard — 506 tests)
cd raspberry/server && npm test    # Jest (Socket.IO server — 71 tests)
cd raspberry/admin && npm test     # Jest (Admin server — 148 tests)
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
- Ajouter `ExecStop=pkill -9` dans `neopro-kiosk.service` (bypasse le trap handler du watchdog, corrompt l'état GPU V3D sur Pi 5 — smoke test enforced)
- Dupliquer `--disable-features` dans kiosk-watchdog.sh (Chromium n'accepte qu'un seul flag, le dernier écrase les précédents — smoke test enforced)
- Utiliser `--kiosk` pour le Chromium secondaire (force le plein écran sur le moniteur principal, ignore `--window-position` — utiliser `--app=URL` + xprop/xdotool — smoke test enforced)
- Utiliser `xdotool key F11` pour le plein écran en dual-display (F11 prend TOUT le bureau X11 virtuel, pas un seul moniteur — utiliser `xprop _MOTIF_WM_HINTS` + `xdotool windowsize` — smoke test enforced)
- Synchroniser le slave dual-display par `videoPath` dans `handleMasterLoopState` (le secondary utilise des variants avec des chemins différents — toujours sync par `videoIndex` — smoke test enforced)
- Laisser le slave jouer sa boucle indépendamment du master (le slave doit pauser sa boucle dès `tv-role-assigned` et attendre les directives du master via `tv-loop-state` — smoke test enforced)
- Utiliser `\d` dans `grep -E` (syntaxe Perl uniquement — utiliser `[0-9]` avec grep -E — smoke test enforced)

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
