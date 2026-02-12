# CI/CD Pipeline Neopro

## Vue d'ensemble

```
Commit → Pre-commit Hooks → PR → CI Workflow → Merge main → Semantic Release → Build Archives → Deploy
```

## GitHub Workflows

### 1. CI (`ci.yml`)

- **Trigger** : Push sur `main`/`develop` ou PR vers ces branches
- **Jobs** :
  - Central Server : Lint, Type Check, Tests, Build
  - Central Dashboard : Lint, Tests, Build production
  - Webapp Raspberry : Lint, Build validation
- **Node** : v20

### 2. Release (`release.yml`)

- **Trigger** : Push sur `main`
- **Fonctionnement** :
  1. `semantic-release` analyse les commits (Conventional Commits)
  2. Détermine la version (feat → MINOR, fix → PATCH, breaking → MAJOR)
  3. Crée un tag git `v{version}`
  4. Build les archives Raspberry Pi
  5. Upload sur GitHub Releases :
     - `neopro-raspberry-deploy.tar.gz` — Package complet
     - `neopro-webapp.tar.gz` — Webapp seule (mise à jour rapide)

### 3. Webapp Release (`release-webapp.yml`)

- **Trigger** : Tag `v*` ou dispatch manuel
- Build et release de la webapp indépendamment

### 4. Install Scripts (`publish-install-scripts.yml`)

- **Trigger** : Changements dans `raspberry/scripts/` ou `install.sh`
- Publie les scripts d'installation sur GitHub Pages
- URL : `https://tallec7.github.io/neopro/install/`

### 5. Railway Restart (`railway-restart.yml`)

- **Trigger** : Cron dimanche 4h UTC
- Redémarre le serveur Railway pour libérer la mémoire

## Pre-commit Hooks (`.husky/`)

### `pre-commit`

1. Vérifie la synchronisation des clés i18n (traductions FR)
2. Détecte le texte français hardcodé dans les fichiers staged
3. ESLint via `lint-staged`

### `commit-msg`

- Valide le format Conventional Commits
- Types : `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- Max 100 caractères pour la description

## Docker

### `docker-compose.yml` (dev local)

- PostgreSQL 15 (port 5432)
- Redis 7 (port 6379)
- Central Server (port 3001)
- Prometheus (port 9090)
- Grafana (port 3000)

### `central-server/Dockerfile` (production)

- Multi-stage build (4 étapes : deps → builder → prod-deps → runner)
- Base : `node:20-alpine`
- Inclut ffmpeg (conversion image→vidéo)
- User non-root (uid 1001)
- Health check : `GET /health` port 3001
- Memory : `--max-old-space-size=256`

## Hébergement production actuel

| Service         | Hébergeur       | Notes                    |
| --------------- | --------------- | ------------------------ |
| API Backend     | Railway (Hobby) | 40MB heap, restart hebdo |
| Dashboard       | Hostinger       | Static Angular           |
| Base de données | Supabase        | PostgreSQL 15, pool 5    |
| Stockage vidéos | FTP Hostinger   | + Supabase fallback      |
| Cache           | Upstash Redis   | Optionnel                |
| Logs            | Logtail         | Optionnel                |

## Scripts de déploiement

```bash
# Build package Raspberry
./raspberry/scripts/build-raspberry.sh

# Déployer sur un Pi via SSH
./raspberry/scripts/deploy-remote.sh pi@neopro.local

# Setup nouveau Pi
./raspberry/scripts/setup-new-club.sh
```

## Secrets CI/CD (GitHub)

| Secret               | Usage                                              |
| -------------------- | -------------------------------------------------- |
| `RELEASE_TOKEN`      | PAT pour semantic-release (push tags/commits main) |
| `RAILWAY_TOKEN`      | Authentification Railway CLI                       |
| `RAILWAY_PROJECT_ID` | ID du projet Railway                               |
| `GITHUB_TOKEN`       | Automatique (GitHub Actions, lecture seule)        |

### RELEASE_TOKEN

Le workflow `release.yml` utilise un **Personal Access Token (Classic)** avec le scope `repo` pour permettre à semantic-release de :

- Pusher le commit `chore(release)` sur `main`
- Créer le tag `v{version}`
- Créer la GitHub Release

> **Important** : Le `GITHUB_TOKEN` par défaut ne suffit pas car il ne peut pas déclencher d'autres workflows ni pusher sur des branches protégées. Si le release échoue avec `EGITNOPERMISSION`, régénérer le PAT et mettre à jour le secret.
