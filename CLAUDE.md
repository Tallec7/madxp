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
npm run test:server                # Jest (API)
npm run test:central               # Karma (Angular Dashboard)
cd e2e && npx playwright test      # E2E
npm run lint                       # ESLint

# Base de données
cd central-server && npm run db:migrate
```

## Règles de code

- **TypeScript strict** : jamais de `any`, toujours typer explicitement
- **SQL paramétré uniquement** : `query('...WHERE id = $1', [id])`
- **Logger Winston** : `logger.info('Action', { context })` — pas de `console.log`
- **Validation Joi** avant traitement des inputs
- **Async/await** avec try/catch, jamais de callbacks
- **Conventional Commits** : `feat(scope):`, `fix(scope):`, `docs(scope):`
- **Repository pattern** : utiliser les repositories (`siteRepository`, `alertRepository`) au lieu de `query()` direct dans les controllers

## NE JAMAIS FAIRE

- Modifier les migrations déjà en production
- Changer le format des `api_key` des sites (casserait tous les Pi)
- Utiliser `console.log` (utiliser le logger)
- Commit des secrets ou fichiers `.env`
- Push directement sur `main` sans PR
- Requêtes SQL non paramétrées (`'${email}'` → injection SQL)

## Architecture détaillée

- Vue système : `docs/technical/ARCHITECTURE.md`
- Référence complète : `docs/REFERENCE.md`
- Sync-agent : `docs/technical/SYNC_ARCHITECTURE.md`
- Schéma DB : `central-server/src/scripts/full-schema.sql`
- Troubleshooting : `docs/TROUBLESHOOTING.md`
- Onboarding : `docs/01-START-HERE.md`
- Client critique NLF : `docs/clients/NLF.md`
- Changelog : `docs/changelog/CHANGELOG.md`

Les règles détaillées par domaine sont dans `.claude/rules/` et se chargent automatiquement selon les fichiers édités.
