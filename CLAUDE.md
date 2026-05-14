# CLAUDE.md - Neopro

> Système de TV interactive pour clubs sportifs. Architecture 3-tiers : Dashboard Angular 20 → Central Server Express/PG → Raspberry Pi Edge.

## Commandes

```bash
# Développement
npm start                          # Frontend Raspberry (port 4200)
npm run start:central              # Dashboard central (port 4300)
cd central-server && npm run dev   # API Backend (port 3001)

# Simulation locale (utiliser AVANT tout fix sur saas/config/sync/displays)
npm run dev:seed                   # Installe config + vidéos + data pour les 3 serveurs
npm run dev:seed:clean             # Nettoie

# Tests
npm run test:server                # Jest API (~2728 tests)
npm run test:smoke:smart           # Smart smoke (suites liées au git diff) — préférer
npm run test:smoke                 # Smoke complet (~1235 tests, 13 domaines) — avant commit final
npm run test:central               # Karma dashboard (~520 tests)
cd raspberry/server && npm test    # Jest Pi (~71 tests)
cd raspberry/admin && npm test     # Jest admin Pi (~194 tests)
cd e2e && npx playwright test      # E2E
npm run lint                       # ESLint

# Build
npm run build:raspberry            # Pi
npm run build:central              # Dashboard
cd central-server && npm run build # API TypeScript

# Audit drift video_variants ↔ sites.displays (read-only)
cd central-server && npm run audit:variants-drift

# Backfill displays-resync (post-ADR-114)
cd central-server && npm run backfill:displays-resync           # all sites
cd central-server && npm run backfill:displays-resync -- --dry-run

# DB migrate
cd central-server && npm run db:migrate
```

## Règles de code

- **TypeScript strict** : jamais de `any`, toujours typer explicitement
- **Repository pattern** : utiliser les repositories — 0 `query()` direct (ESLint enforced)
- **Logger Winston** : `logger.info('Action', { context })` — pas de `console.log` dans central-server
- **Validation Joi** avant traitement des inputs
- **Async/await** + try/catch, jamais de callbacks
- **Conventional Commits** : `feat(scope):`, `fix(scope):`, `docs(scope):`

## NE JAMAIS FAIRE (universels)

- Modifier les migrations déjà en production
- Changer le format des `api_key` des sites (casserait tous les Pi)
- Utiliser `console.log` dans central-server (utiliser Winston)
- Revenir à Nixpacks pour Railway (utiliser le Dockerfile builder `central-server/Dockerfile`)
- Importer `../config/database` dans les controllers (ESLint bloque, utiliser repositories)
- Commit des secrets ou fichiers `.env`
- **Push directement sur `main` sans PR** (branche protégée + CONTRIBUTING.md)
- Requêtes SQL non paramétrées (`'${email}'` → injection)
- Utiliser `--no-verify` sauf urgence justifiée dans le commit body
- ~250 règles domaine-spécifiques sont dans `.claude/rules/` — ne pas dupliquer ici

## Routing SPECs (à lire AVANT toute modif sur le domaine)

| Si tu touches | Lis d'abord |
|---|---|
| Tout fix qui mentionne **NLF** ou client critique | `docs/clients/NLF.md` (CRITIQUE) |
| `fix(saas)`, `displays`, `variants`, `resolvedConfig` | `docs/specs/features/saas-mode.spec.md` |
| `fix(content)`, vidéos, FTP, upload, cycle | `docs/specs/features/video-cycle.spec.md` |
| `sponsor*`, advertiser, agency | `docs/specs/features/sponsors.spec.md` |
| `template*` (DB, runtime, studio) | `docs/specs/features/templates-studio.spec.md` + `template-studio-v3.spec.md` |
| `match-session`, `score*`, scoreboard | `docs/specs/features/match-sessions.spec.md` |
| `remote*` (télécommande) | `docs/specs/features/remote.spec.md` + `remote-v2-preview-sync.spec.md` |
| `web-content`, ADR-103 | `docs/specs/features/web-live-content.spec.md` |
| `hotspot`, PSK, ADR-074/076 | `docs/specs/features/hotspot-psk.spec.md` |
| `cron*` ou scheduler | `docs/specs/services/cron-scheduler.spec.md` |
| `alerting*`, dedup ADR-111 | `docs/specs/services/alert-repository.spec.md` |
| `sync-agent*`, write-through ADR-114 | `docs/specs/services/sync-agent-displays-write-through.spec.md` + `sync-agent-auth-preservation.spec.md` |
| Config Pi (`:8080`, profils CRUD, ownership Pi vs cloud, conflits, push-back) | `docs/adr/ADR-120-pi-saas-ownership-model.md` + `docs/specs/features/admin-pi-local.spec.md` |
| `command-queue*`, `sendOrQueue`, `pending_commands` | `docs/specs/services/command-queue.spec.md` |
| Garde-fou Pi offline, alertes connectivité Pi | `docs/specs/features/pi-connectivity-model.spec.md` |
| `socket*`, realtime | `docs/specs/services/socket-service.spec.md` |
| Routing CF Pages SaaS | `docs/specs/services/cloudflare-pages-saas-routing.spec.md` |

Si la SPEC manque sur le domaine touché → l'écrire AVANT le code (cf. `docs/specs/README.md`).

## Challenge mode (Claude DOIT pousser back, pas demander)

Quand Daisy donne un brief ou un diagnostic, Claude DOIT :

1. Reformuler ce qu'il comprend en 1 phrase.
2. Identifier les hypothèses non vérifiées dans le brief.
3. Lister ce qu'il faudrait vérifier pour valider l'hypothèse.
4. Si une hypothèse est falsifiable rapidement (lecture fichier, query DB, run smoke) → la vérifier AVANT de coder.
5. Si une hypothèse est en contradiction avec ce que Claude lit dans le code → STOP, exposer la contradiction, demander arbitrage.

Daisy ne sera jamais vexé d'être challengé. Il sera vexé d'avoir codé 4h sur une mauvaise piste.

**Niveaux de confiance obligatoires dans toute réponse non triviale** :

- ✅ Vérifié = j'ai lu le fichier ou run la commande
- ⚠️ Estimé = je m'appuie sur mémoire/audit, à valider
- ❌ Inconnu = je ne sais pas, je le dis

## Architecture détaillée

- Vue système : `docs/technical/ARCHITECTURE.md`
- Référence complète : `docs/technical/REFERENCE.md`
- Sync-agent : `docs/technical/SYNC_ARCHITECTURE.md`
- Schéma DB : `central-server/src/scripts/full-schema.sql`
- Troubleshooting : `docs/guides/TROUBLESHOOTING.md`
- Onboarding : `docs/01-START-HERE.md`
- Glossaire : `docs/GLOSSARY.md`
- Changelog : `docs/changelog/CHANGELOG.md`
- Index SPECs : `docs/specs/README.md`
- Cas d'usage métier : `docs/product/USE-CASES.md`
- Business changelog : `docs/BUSINESS-CHANGELOG.md`

## Workflow opérationnel étendu

Conventions de session (commit policy, format de réponse, story card, business changelog,
préfixes d'impact, communication métier, garde-fous) → `docs/internal/CLAUDE-WORKFLOW.md`.

Plan d'amélioration en cours (audit 2026-05-09) → `docs/internal/CLAUDE-IMPROVEMENT-PLAN.md`.
