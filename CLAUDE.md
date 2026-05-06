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
npm run test:smoke                 # Jest (Smoke tests — 1235 tests, 13 domain files, détecte régressions de wiring)
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

# Template Studio v3 — backfill posters JPEG des assets WebM legacy (post-merge feature poster)
cd central-server && npm run backfill:asset-posters

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
- **SAFe Pilotage Produit** : `docs/safe/README.md` (Epics, Features, US, Sprint Tracker, Value Streams) — maintenu manuellement, dashboard `/safe/sprints` actif
- **Specs métier par composant** : `docs/specs/` (1 page par feature/composant — règles métier vivantes, format léger)
- **Cas d'usage / Scénarios** : `docs/product/USE-CASES.md` (JTBD + parcours multi-acteurs, complément `docs/PERSONAE.md`)
- **Business changelog** : `docs/BUSINESS-CHANGELOG.md` (récap hebdo des PRs en langage métier)

Les règles détaillées par domaine sont dans `.claude/rules/` et se chargent automatiquement selon les fichiers édités.

---

# Conventions de session Claude

> Daisy lance plusieurs sessions Claude Code en parallèle. Ces conventions garantissent que toutes les sessions sont alignées et ne se marchent pas dessus.

## Démarrage de session

1. **Worktree dédiée obligatoire** — toute session qui modifie du code crée d'abord sa propre worktree :

   ```bash
   git worktree add ../neopro-<slug> -b <type>/<scope>
   cd ../neopro-<slug>
   ```

   Ne JAMAIS travailler sur `/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro` directement (collisions multi-session).

2. **Vérifier les sessions parallèles** : `git worktree list` + `git branch -a`. Si la tâche partage des fichiers avec une worktree active → STOP, signaler à Daisy.

3. **Confirmer la worktree** dans la première réponse de session.

## Avant tout edit majeur (>1 fichier)

- `grep -rn "<filename>" central-server/src/__tests__` pour identifier les smoke tests pinnés au fichier (couplage caché).
- Lire le fichier cible avant d'éditer (jamais d'édit aveugle, surtout sur les fichiers critiques cités plus haut).
- Si refactor cross-fichier → ADR léger inclus dans la PR (cf. `.claude/rules/adr.md`).

## Commit policy

- **Atomique** : 1 commit = 1 step exécutable indépendamment.
- **Immédiat** : commit dès qu'une étape compile, ne pas attendre la fin du flux. En multi-session, c'est non-négociable — toute modif non-commitée peut être détruite par un `git restore` d'une autre session.
- **Conventional Commits stricts** : `<type>(<scope>): <impératif>`.
- **Vérification post-commit** : `git log --oneline -1` pour confirmer le hash et la branche.

## Format de réponse

### Avant un edit de code

1. État courant : 1 phrase sur ce que je vais faire.
2. Contraintes vérifiées : grep des smoke tests pinnés au fichier (si applicable).
3. Plan : étapes numérotées, max 5 lignes.

### Pendant l'exécution

- 1 ligne par changement majeur, jamais de narration de pensée.
- Si je découvre un blocker → STOP + question, pas de workaround silencieux.

### À la fin d'une tâche

1. Diff stats : fichiers / +X / -Y.
2. Tests verts : nombre / total.
3. Reste ouvert : bullet list, ou "rien".
4. Next : 1 ligne d'option, ou "ta main".

### Niveaux de confiance explicites

- ✅ "Vérifié" = j'ai lu le fichier ou run la commande.
- ⚠️ "Estimé" = je m'appuie sur mémoire/audit, à valider.
- ❌ "Inconnu" = je ne sais pas, je le dis.

### Length budgets

- Réponse à "ok" / "go" : <5 lignes (sauf erreur ou décision majeure).
- Récap de fin de tâche : <15 lignes structurées.
- Audit / décision : libre mais structuré (tableaux, sections claires).

## Préfixes d'impact dans les messages

Quand je ping Daisy en cours de session, préfixer avec :

- **🎯 IMPACT CLIENT** : visible utilisateur final (TV, dashboard, remote)
- **🛡️ IMPACT INFRA** : production, monitoring, sécurité, perf
- **🧹 IMPACT DEV** : refactor, dette, outillage, tests
- **❓ DÉCISION** : besoin de Daisy pour trancher, j'attends sa réponse

## Communication métier

Daisy a un profil mixte (tech + business). Quand une réponse longue (>50 lignes) utilise du jargon non évident, le traduire en passant :

- "memory leak" → "fuite mémoire (le serveur consomme de plus en plus sans raison, finit par planter)"
- "smoke test" → "test rapide qui détecte si un truc évident est cassé"
- "race condition" → "deux actions qui se marchent dessus selon l'ordre"
- "circuit breaker" → "coupe-circuit qui désactive un service en panne pour éviter la cascade"

Si la réponse est >50 lignes : ajouter en haut un encadré **TL;DR métier** en 3 phrases sans jargon.

## Validation explicite quand "go" / "ok"

Quand Daisy dit "go" ou "ok" sur un changement non-trivial, vérifier mentalement :

- Ai-je expliqué la conséquence métier (pas juste technique) ?
- Sait-il ce qui peut casser et comment on le verrait en prod ?

Si non → reformuler 1 ligne en métier avant d'agir.
Si oui (manifeste : il a posé une question précédente sur le sujet) → go.

## Story Card de fin de tâche

À la fin de toute tâche qui ship du code (commit/PR), produire une **Story Card** au format suivant — pas de SAFe US, juste la traçabilité utile. La Story sert de PR description par défaut.

```markdown
## Story <YYYY-MM-DD>-<slug>

**En tant que** : <rôle> (ex: super_admin, NLF user, sync-agent, CI, Lead Dev)
**Je veux** : <capacité, infinitif>
**Pour** : <bénéfice mesurable, pas technique>

**Livré** :

- <change observable 1>
- <change observable 2>

**Vérifié par** : <test ou métrique qui prouve que ça marche>
**Risque résiduel** : <ce qui pourrait casser>
**Next** : <follow-up si applicable, sinon "—">
```

Pas besoin d'inventer un ID SAFe (`F-XX.Y`, `IMP-XXX-NN`). Le format `YYYY-MM-DD-<slug>` suffit.

## Business Changelog

À chaque session qui ship du code, ajouter une entrée à `docs/BUSINESS-CHANGELOG.md` sous la semaine en cours, avec 3 buckets :

- 🎯 **Pour le club** (NLF, prospects) : visible utilisateur final
- 🛡️ **Pour la robustesse** : production, monitoring, sécurité
- 🧹 **Pour l'équipe** : refactor, dette, outillage

Format : 1 bullet point par PR, ton non-technique, citer le n° de PR.
Si une session ne livre RIEN visible (juste exploration / debug), ne pas créer d'entrée.

## Specs métier par composant

Les composants/features qui ont des **règles métier non évidentes du code seul** ont une SPEC dans `docs/specs/`. Format léger (1 page max), vivant, mis à jour dans la même PR que le changement de comportement.

**Périmètre** :

- ✅ Feature transverse complexe (sponsors, match sessions, templates studio, SaaS, OTA, hotspot PSK)
- ✅ Composant client-visible (TV, Remote, dashboard sites, club portal)
- ✅ Service backend critique (cron-scheduler, socket, storage, deployment, auth)
- ❌ Sous-composant CRUD basique
- ❌ Util / helper (le code suffit)

**Localisation** : `docs/specs/{components,features,services}/<name>.spec.md`

**Cycle de vie** :

- Nouvelle feature majeure → créer la SPEC en même temps que le code
- PR qui change un comportement métier → MAJ SPEC dans la même PR
- PR refactor sans changement de comportement → SPEC inchangée
- Incident production → ajouter ligne "Cas d'edge connus" + lien post-mortem
- 3 mois sans modification → SPEC marquée "stale", revue à planifier

Voir `docs/specs/README.md` pour le gabarit complet et l'index des SPECs actives.

## Garde-fous obligatoires

- **Bug fixé** → un test regression guard (unitaire ou smoke) qui faillirait si le bug revenait. Citer le test dans le commit.
- **Nouvelle Map/Set instance-level** → cleanup explicite (sweep périodique OU disconnect handler) + métrique Prometheus pour observer la taille.
- **Nouveau task CRON** → log Winston `info`/`error` + métrique `neopro_*_total` + smoke test associé.
- **Nouveau handler/service** → au minimum log Winston `info` au start + log `error` au catch.
- **Commit `feat`/`fix` non-trivial** → au moins une doc MAJ (`docs/**`, `*.md` racine, ou `.claude/rules/**`). Le hook Husky `.husky/pre-push` warne si oubli (warn-only). Cf. `/end-session` étape 3 pour la grille de mapping diff → doc.

## Anti-patterns interdits

- Push direct sur `main` (la branche est protégée + CONTRIBUTING.md l'interdit)
- `--no-verify` sauf urgence (justifier dans le commit body)
- Modifier `CLAUDE.md` ou `.claude/rules/` sans le signaler explicitement à Daisy
- Faire "tuer X" / "archiver X" sans `grep -rn "X"` au préalable pour mesurer la dette
- Étiqueter une règle "legacy" sans avoir lu le fichier source (mes audits Explore peuvent se tromper)
- Inventer un statut SAFe / une feature non-livrée (cf. `.claude/rules/_archive/safe-update.md`)
- Sur-promettre des "quick wins" sans vérifier les blockers techniques d'abord
