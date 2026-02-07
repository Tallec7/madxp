# CLAUDE.md - Guide Complet Neopro

> Ce fichier est lu automatiquement par Claude Code pour comprendre le projet.

**Version**: 3.7.8 | **Dernière mise à jour**: 2026-02-07

---

## Instructions pour Claude

### Comportement Général

- **Toujours lire un fichier avant de le modifier** - Ne jamais proposer de changements sur du code non lu
- **Proposer des tests** pour tout nouveau code ou modification significative
- **Vérifier les fichiers existants** avant de créer de nouveaux fichiers
- **Utiliser les patterns existants** du projet (voir section Patterns de Code)

### Priorités de Développement

1. **Sécurité d'abord** : Vérifier les injections SQL, XSS, CSRF avant tout commit
2. **TypeScript strict** : Jamais de `any`, toujours typer explicitement
3. **Tests** : Couvrir les cas critiques (auth, paiement, déploiement)
4. **Rétrocompatibilité** : Ne pas casser les Pi déjà déployés

### Clients Critiques ⚠️

| Client  | Doc                                        | Particularité      | Attention                                      |
| ------- | ------------------------------------------ | ------------------ | ---------------------------------------------- |
| **NLF** | [docs/clients/NLF.md](docs/clients/NLF.md) | Mesh WiFi (3+ APs) | Ne JAMAIS lock BSSID, tester avant déploiement |

> **Avant toute intervention sur un client critique**, lire sa fiche dédiée dans `docs/clients/`.

### Ce que Claude doit faire

- Utiliser les requêtes SQL paramétrées (`$1`, `$2`...)
- Logger avec Winston (`logger.info/error/warn`)
- Suivre les Conventional Commits pour les messages
- Valider les inputs avec Joi avant traitement
- Gérer les erreurs avec try/catch et messages explicites

### Ce que Claude ne doit JAMAIS faire

- Modifier les migrations déjà en production
- Changer le format des `api_key` des sites
- Utiliser `console.log` (utiliser le logger)
- Commit des secrets ou fichiers `.env`
- Push directement sur `main` sans PR

### Style de Réponse

- Réponses concises et techniques
- Code commenté uniquement si la logique n'est pas évidente
- Proposer des alternatives quand pertinent
- Signaler les risques de sécurité ou de breaking change

---

## Contexte Métier

**Neopro** = Système de TV interactive pour clubs sportifs.

### Comment ça marche

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Dashboard     │ ──API── │  Central Server  │ ──WS──  │  Raspberry Pi   │
│   (Angular 17)  │         │  (Express/PG)    │         │  dans le club   │
└─────────────────┘         └──────────────────┘         └─────────────────┘
     Admin                       Cloud                        Edge
```

- **Un "site"** = Un club sportif avec un Raspberry Pi connecté à une TV
- **Les vidéos** sont uploadées dans le cloud, puis déployées vers les Pi
- **La flotte** = 50+ boîtiers Pi gérés depuis un dashboard central
- **Multi-tenant** : super_admin > admin > operator > viewer | advertiser | agency

### Utilisateurs types

| Rôle        | Actions                                   |
| ----------- | ----------------------------------------- |
| Super Admin | Tout (users, sites, content, abonnements) |
| Operator    | Gère ses clubs assignés, upload vidéos    |
| Advertiser  | Upload pubs, gère ses vidéos              |
| Agency      | Gère plusieurs advertisers                |
| Club Staff  | Utilise la télécommande locale            |

---

## Architecture

```
neopro/
├── central-server/           # API Backend (Cloud)
│   └── src/
│       ├── controllers/      # Logique métier par domaine
│       ├── routes/           # Définition des endpoints REST
│       ├── services/         # Services partagés (socket, email, pdf)
│       ├── middleware/       # auth, validation, rate-limit, RLS
│       ├── config/           # database, logger, supabase, ftp
│       ├── types/            # Interfaces TypeScript
│       ├── handlers/         # Socket.IO event handlers
│       └── scripts/          # Migrations, seeds, admin CLI
│
├── central-dashboard/        # Dashboard Admin (Angular 20)
│   └── src/app/
│       ├── features/         # Composants par feature (sites, content, analytics)
│       │   └── sites/        # Gestion des sites avec tabs (État/Contenu/Paramètres/Debug)
│       │       └── components/   # Composants modulaires (remote-preview, video-selector, etc.)
│       ├── shared/           # Composants partagés (video-selector, remote-preview)
│       └── core/             # Services, guards, interceptors partagés
│
├── raspberry/                # Application Raspberry Pi (Edge)
│   ├── frontend/             # Angular 20 (TV/Remote/Login)
│   ├── server/               # Socket.IO serveur local
│   ├── admin/                # Interface admin locale (port 8080)
│   ├── sync-agent/           # Synchronisation avec le cloud
│   └── scripts/              # setup-new-club.sh, diagnose-pi.sh, etc.
│
├── server-render/            # Socket.IO cloud (Render.com - démo uniquement)
├── e2e/                      # Tests Playwright
└── docs/                     # 180+ fichiers de documentation
```

### Chemins sur le Raspberry Pi

| Chemin                                      | Contenu                                             |
| ------------------------------------------- | --------------------------------------------------- |
| `/home/pi/neopro/videos/`                   | **Vidéos** (mp4, mkv, mov) organisées par catégorie |
| `/home/pi/neopro/webapp/`                   | Application Angular (frontend TV/Remote)            |
| `/home/pi/neopro/webapp/assets/watermarks/` | Images watermark déployées depuis le dashboard      |
| `/home/pi/neopro/webapp/configuration.json` | Configuration du site (sponsors, catégories, etc.)  |
| `/home/pi/neopro/sync-agent/`               | Agent de synchronisation avec le cloud              |
| `/home/pi/neopro/server/`                   | Serveur Socket.IO local                             |
| `/home/pi/neopro/scripts/`                  | Scripts de diagnostic et setup                      |

**⚠️ ATTENTION** : Les vidéos sont dans `/home/pi/neopro/videos/`, PAS dans `/home/pi/neopro/webapp/videos/`
**⚠️ ATTENTION** : Les assets (watermarks) doivent être dans `/home/pi/neopro/webapp/assets/` car nginx sert depuis `webapp/`

---

## Stack Technique

| Composant          | Technologies                                              |
| ------------------ | --------------------------------------------------------- |
| Frontend Raspberry | Angular 20, Socket.IO client, SCSS                        |
| Frontend Dashboard | Angular 20, Chart.js, Leaflet, Standalone Components      |
| Backend API        | Node.js 18+, Express 4.18, TypeScript strict              |
| Base de données    | PostgreSQL 15 (Supabase) - Pool: 5 connexions             |
| Cache              | Redis (Upstash) - optionnel, pour scaling horizontal      |
| Stockage           | FTP (Hostinger) + Supabase Storage (fallback)             |
| Auth               | JWT HttpOnly cookie + Bearer token + MFA (TOTP)           |
| Logs               | Winston + Logtail (Better Stack)                          |
| Hébergement        | Railway (API - Hobby plan), Hostinger (Dashboard)         |
| Tests              | Jest + Supertest (API), Karma (Angular), Playwright (E2E) |

---

## Base de Données

### Tables principales et relations

```sql
users ─────────────────────────────────────────────────────────────────
  id, email (UNIQUE), password_hash, role, advertiser_id?, agency_id?
  │
  └── Roles: super_admin | admin | operator | viewer | advertiser | agency

sites ─────────────────────────────────────────────────────────────────
  id, site_name, club_name, status (online/offline/maintenance/error)
  location (JSONB), sports (JSONB[]), api_key (UNIQUE)
  last_seen_at, software_version, local_config_mirror (JSONB)
  │
  ├── site_groups (M:N) ── groups (id, name, type, filters)
  └── metrics (1:N) ── cpu, memory, temperature, disk, uptime

videos ────────────────────────────────────────────────────────────────
  id, filename, category, subcategory, duration, storage_path
  checksum (SHA256), metadata (JSONB), uploaded_by → users
  uploaded_for_site_id → sites (upload contextuel)
  │
  └── content_deployments (1:N) ── video → site/group, status, progress

config_history ────────────────────────────────────────────────────────
  site_id, configuration (JSONB), changes_summary (JSONB)
  previous_version_id (self-ref pour diff)

CONFIG DRAFTS ─────────────────────────────────────────────────────────
  config_drafts           → site_id (UNIQUE), configuration (JSONB), referenced_video_ids
  orchestrated_deployments → site_id, draft_id, status, videos_completed/failed

ANALYTICS ─────────────────────────────────────────────────────────────
  club_sessions      → session start/end, videos_played count
  video_plays        → video_filename, played_at, trigger_type (auto/manual)
  club_daily_stats   → agrégation journalière (pré-calculée par cron)

ADVERTISERS & AGENCIES ────────────────────────────────────────────────
  advertisers        → name, status, contact info
  advertiser_videos  → advertiser ↔ video (M:N)
  advertiser_sites   → quels sites affichent quelles pubs
  advertiser_impressions → tracking des impressions pubs
  advertiser_daily_stats → agrégation journalière par annonceur

AGENCIES ──────────────────────────────────────────────────────────────
  agencies           → name, status, contact_email, company_name
  agency_sites       → agency ↔ site (M:N) - sites accessibles par l'agence

SUBSCRIPTIONS (v2.47+) ────────────────────────────────────────────────
  sites (colonnes ajoutées):
    subscription_start, subscription_end, subscription_plan
    suspended, suspension_reason, suspension_date, suspension_note
  subscription_suspension_reasons → code, label, auto_unblock, message_tv, message_remote
  subscription_history → site_id, action, reason, previous_end_date, new_end_date, note
  Vue subscription_status_summary → sites enrichis avec statut calculé
  Vue subscription_stats → compteurs globaux par statut/plan
```

### Row-Level Security (Multi-tenant)

```typescript
// Activé en production - filtre automatique par rôle
await query(`SELECT set_config('app.user_role', $1, false)`, [role]);
```

### Politique de Rétention des Données ⚡ NEW (2026-01)

Des jobs de cleanup automatiques tournent quotidiennement à 3h du matin pour gérer la croissance de la base de données.

| Table                           | Rétention            | Justification                                                            |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| `video_plays`                   | **90 jours**         | Données granulaires, `club_daily_stats` conserve l'historique long terme |
| `advertiser_impressions`        | **90 jours**         | Idem, `advertiser_daily_stats` conserve l'agrégation                     |
| `metrics`                       | **7 jours**          | Debug court terme uniquement (CPU, RAM, temp)                            |
| `config_history`                | **20 versions/site** | Rollback réaliste, pas besoin de 6 mois                                  |
| `remote_commands`               | **30 jours**         | Historique des commandes pour debug                                      |
| `alerts`                        | **90 jours**         | Patterns d'incidents                                                     |
| `audit_logs`                    | **90 jours**         | Conformité/audit                                                         |
| `recurring_schedule_executions` | **90 jours**         | Historique des crons                                                     |

**Tables préservées indéfiniment** (agrégations) :

- `club_daily_stats` - Stats journalières par site
- `advertiser_daily_stats` - Stats journalières par annonceur

**Buffers locaux Pi** (limite 50K événements) :

- `analytics_buffer.json` - Lectures vidéo en attente d'envoi
- `sponsor_impressions.json` - Impressions sponsors en attente

Si un buffer dépasse 50K événements (ex: club fermé > 3 mois), les plus anciens sont supprimés (FIFO).

**Fichiers** :

- `central-server/src/scripts/migrations/add-data-retention-cleanup.sql` - Configuration des jobs
- `central-server/src/services/cron-scheduler.service.ts` - Exécution des cleanups
- `raspberry/sync-agent/src/analytics.js` - Buffer avec limite 50K
- `raspberry/sync-agent/src/sponsor-impressions.js` - Buffer avec limite 50K

---

## API Routes

### Authentification

```
POST /api/auth/login          → { email, password } → cookie + user
POST /api/auth/logout         → clear cookie
GET  /api/auth/me             → current user
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

### Sites (clubs)

```
GET    /api/sites             → liste paginée, filtres: status, sport, region
GET    /api/sites/:id         → détails + config + metrics
GET    /api/sites/:id/dashboard → endpoint agrégé (connection + metrics)
GET    /api/sites/:id/local-content → vidéos locales + stockage
GET    /api/sites/:id/connection-status → statut connexion temps réel
GET    /api/sites/:id/metrics → métriques système (CPU, RAM, temp)
GET    /api/sites/:id/hotspot-config → Config hotspot complète (SSID, mot de passe, canal, statut)
GET    /api/sites/:id/timeline → événements récents (déploiements, commandes, configs, alertes)
POST   /api/sites             → créer site (génère api_key)
PUT    /api/sites/:id         → modifier
DELETE /api/sites/:id         → supprimer
POST   /api/sites/:id/api-key/regenerate
POST   /api/sites/:id/command → envoyer commande au Pi

# Debug endpoints (requièrent connexion Pi active)
GET    /api/sites/:id/health-status → santé système (GPU, services, throttling)
GET    /api/sites/:id/diagnostics → diagnostic complet (diagnose-pi.sh)
GET    /api/sites/:id/network-diagnostics → diagnostics réseau détaillés
GET    /api/sites/:id/logs?service=xxx&lines=100 → logs d'un service
GET    /api/sites/:id/debug-bundle → export JSON complet pour support technique
POST   /api/sites/:id/fix-hotspot → diagnostiquer/réparer le hotspot WiFi
```

### Contenu

```
POST   /api/content/upload    → multipart/form-data (vidéo)
GET    /api/content/videos    → liste vidéos
GET    /api/content/videos/for-site/:siteId → vidéos priorisées pour un site (uploaded_for_site_id en premier)
DELETE /api/content/videos/:id
POST   /api/content/deploy    → { videoId, targetType, targetId }
POST   /api/content/image-to-video → multipart/form-data (image) + { duration: 5-60, blurBackground?: boolean } → convertit image en vidéo MP4
```

### Config Drafts (Brouillons de Configuration)

```
GET    /api/sites/:siteId/draft         → Récupère le brouillon du site (ou null)
PUT    /api/sites/:siteId/draft         → Crée/met à jour le brouillon { name?, configuration }
DELETE /api/sites/:siteId/draft         → Supprime le brouillon
POST   /api/sites/:siteId/draft/validate → Valide le brouillon (liste vidéos manquantes)
POST   /api/sites/:siteId/draft/deploy  → Déploie (vidéos + config orchestré)
GET    /api/sites/:siteId/draft/deployment/:id → Progression du déploiement orchestré
```

### Analytics (Backend uniquement - UI supprimée v2.50)

> **Note** : Les pages analytics du dashboard ont été supprimées en v2.50 car les métriques étaient incohérentes.
> Les endpoints API restent disponibles pour usage programmatique si nécessaire.

```
GET /api/analytics/overview           → stats globales (backend only)
GET /api/analytics/sites/:id          → stats par site (backend only)
GET /api/analytics/daily-stats        → agrégation journalière (backend only)
POST /api/analytics/video-plays       → réception analytics depuis les Pi
```

### Subscriptions (v2.47+)

```
# Routes globales
GET    /api/subscriptions/stats       → Statistiques globales (actifs, à risque, etc.)
GET    /api/subscriptions/at-risk     → Sites à risque (expirent bientôt, suspendus)
GET    /api/subscriptions/reasons     → Liste des motifs de suspension

# Routes par site (montées sur /api/sites/:id/subscription)
GET    /api/sites/:id/subscription              → Détails abonnement d'un site
GET    /api/sites/:id/subscription/history      → Historique des changements
GET    /api/sites/:id/subscription/license-status → Statut de licence calculé (debug)
PUT    /api/sites/:id/subscription              → Configurer l'abonnement (date début, fin, plan)
PUT    /api/sites/:id/subscription/extend       → Prolonger l'abonnement (date fin uniquement)
POST   /api/sites/:id/subscription/suspend      → Suspendre le site
POST   /api/sites/:id/subscription/reactivate   → Réactiver le site
PUT    /api/sites/:id/subscription/plan         → Changer le plan (super_admin)
```

### Alerts (v3.0+) ⚡ NEW

```
GET    /api/alerts                      → Liste des alertes (filtres: type, active, severity, siteId)
GET    /api/alerts/stats                → Statistiques alertes (admin only)
POST   /api/alerts/:id/resolve          → Résoudre une alerte
POST   /api/alerts/sites/:siteId/resolve → Résoudre toutes les alertes d'un site
```

### Benchmark (v3.0+) ⚡ NEW

Permet aux clubs de se comparer anonymement à leurs pairs (même sport, région, taille).

```
GET    /api/benchmark/global            → Résumé global par sport/région (admin only)
GET    /api/benchmark/compare           → Comparer 2-10 sites (admin only)
GET    /api/benchmark/sites/:siteId     → Benchmark pour un site (operator+)
```

**Métriques comparées** :

- Sessions par mois
- Vidéos jouées par session
- Durée moyenne des sessions
- Taux de disponibilité (uptime)
- Total vidéos jouées

**Segmentation** : Par sport, région, catégorie de taille (petit/moyen/grand).

### Assets (Watermarks, Logos)

```
POST   /api/assets/watermark/:siteId    → Upload et déploie un watermark (multipart/form-data)
POST   /api/assets/watermark/validate   → Valide une configuration watermark
POST   /api/assets/deploy/:siteId       → Déploie un asset existant vers un site
```

### Remote Cloud (Télécommande via Internet) ⚡ UPDATED (v2.45)

Permet de contrôler un site à distance depuis n'importe quel réseau (utile pour les réseaux mesh avec isolation client).

**⚠️ IMPORTANT** : Ces routes sont **PUBLIQUES** (pas d'authentification requise) car elles sont utilisées par les utilisateurs qui scannent le QR code depuis leur téléphone (staff du club, bénévoles, etc.)

```
GET  /api/remote/:siteId/state    → État du site (config, vidéos locales, connexion)
POST /api/remote/:siteId/command  → Envoyer une commande (score, phase, vidéo...)
GET  /api/remote/:siteId/videos   → Liste des vidéos organisées par catégorie
```

**Sécurité** (sans JWT) :

- L'UUID du site est difficile à deviner
- Rate limiting : 30 req/min par IP
- Le site doit être online pour recevoir les commandes

**Commandes supportées** (POST `/command` avec `{ type, data }`) :

| Type            | Data                                              | Description            |
| --------------- | ------------------------------------------------- | ---------------------- |
| `score-update`  | `{homeTeam, awayTeam, homeScore, awayScore}`      | Mise à jour du score   |
| `score-reset`   | `{}`                                              | Reset du score à 0-0   |
| `phase-change`  | `{phase: 'neutral'\|'before'\|'during'\|'after'}` | Changement de phase    |
| `play-video`    | `{video: {name, path, categoryId}}`               | Lecture d'une vidéo    |
| `play-sponsors` | `{}`                                              | Retour à la boucle     |
| `timer-update`  | `{action: 'start'\|'pause'\|'reset'\|'sync'}`     | Contrôle du timer      |
| `breaking-news` | `{message, duration?, position?}`                 | Message défilant       |
| `match-config`  | `{sessionId, matchDate, matchName}`               | Configuration du match |

**Accès** : `https://neopro-admin.kalonpartners.bzh/remote/{siteId}` (accès public via QR code)

**Architecture du relay (v2.39+)** :

```
Dashboard Cloud Remote → HTTP API → Central Server
→ Socket.IO emit vers room siteId (événements: score-update, phase-change, cloud-remote-action, etc.)
→ Sync-Agent (sur le Pi) reçoit l'événement
→ Sync-Agent.relayToLocalServer() se connecte à localhost:3000
→ Serveur local broadcast vers TV/Remote
→ TV reçoit l'action et exécute (joue vidéo, met à jour score, etc.)
```

**Événements Socket.IO relayés** :

| Événement central     | Événement local relayé | Description                      |
| --------------------- | ---------------------- | -------------------------------- |
| `score-update`        | `score-update`         | Mise à jour score                |
| `score-reset`         | `score-reset`          | Reset score                      |
| `phase-change`        | `phase-change`         | Changement phase match           |
| `timer-update`        | `timer-update`         | Contrôle chronomètre             |
| `breaking-news`       | `breaking-news`        | Message défilant                 |
| `match-info-updated`  | `match-info-updated`   | Config match                     |
| `options-update`      | `options-update`       | Options overlay                  |
| `cloud-remote-action` | `command`              | Lecture vidéo/sponsors (→action) |

**Fichiers** :

- `central-server/src/controllers/remote.controller.ts` - API HTTP et émission Socket.IO
- `central-server/src/routes/remote.routes.ts`
- `raspberry/sync-agent/src/agent.js` - Méthode `relayToLocalServer()` pour le relay
- `raspberry/server/server.js` - Serveur local qui broadcast aux clients TV/Remote
- `central-dashboard/src/app/features/remote/cloud-remote.component.ts`
- `central-dashboard/src/app/core/services/remote.service.ts`

### Rate Limiting

Les rate limits sont appliqués **par route** pour éviter les conflits :

```
Auth:         10 req/15min    (anti-bruteforce) - 1 min dev
Monitoring:   300 req/min     (status, metrics, dashboard, local-content)
Admin:        200 req/min     (lecture sites, logs, config-history)
Sensitive:    30 req/min      (commands, deployments, créations, suppressions)
Logging:      200 req/min     (frontend logs - throttled client-side)
Upload:       10 req/hour     (video uploads)
Pi Analytics: 500 req/min     (impressions sponsors depuis les Pi - par IP)
```

**Architecture rate limiting** :

- `/api/sites` : Rate limits **par route** (pas de limite globale pour éviter les doubles comptages)
- `/api/sites/:id/dashboard`, `/api/sites/:id/connection-status`, `/api/sites/:id/metrics`, `/api/sites/:id/local-content` → `monitoringRateLimit` (300/min)
- `/api/sites/:id`, `/api/sites/:id/logs`, `/api/sites/:id/config-history/*` → `adminRateLimit` (200/min)
- POST/PUT/DELETE, `/api/sites/:id/command` → `sensitiveRateLimit` (30/min)
- `/api/remote/*` → `sensitiveRateLimit` (30/min) - **PUBLIC (pas d'auth JWT)** - par IP
- `/api/analytics/impressions` → `piAnalyticsRateLimit` (500/min) - **Par IP** - permet backlog de ~5 Pi simultanément

**Frontend Log Throttling** (v2.25+) :

Le `LoggerService` Angular implémente un throttling côté client pour éviter les erreurs 429 :

- **Batching** : Logs accumulés et envoyés toutes les 2 secondes (ou après 20 logs max)
- **Rate limit silencieux** : Les erreurs 429 sont ignorées sans polluer la console
- **Console en prod** : Seuls `error` et `warn` affichés, `info`/`debug` → Logtail uniquement

**Note**: Les rate limits sont par utilisateur (user_id) et non par IP en production.

---

## Services Critiques

| Service              | Fichier                              | Rôle                                                                        |
| -------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| **Socket**           | `socket.service.ts`                  | Communication temps réel Pi ↔ Cloud                                         |
| **CommandQueue**     | `command-queue.service.ts`           | File d'attente commandes (offline/online)                                   |
| **Deployment**       | `deployment.service.ts`              | Orchestration déploiement vidéos                                            |
| **UploadVerify**     | `upload-verification.service.ts`     | Vérification upload avant déploiement                                       |
| **Draft**            | `draft.service.ts`                   | Gestion brouillons de configuration                                         |
| **Orchestrated**     | `orchestrated-deployment.service.ts` | Déploiement vidéos + config orchestré                                       |
| **Asset**            | `asset.service.ts`                   | Gestion watermarks et logos (upload/deploy)                                 |
| **FTP Storage**      | `ftp-storage.ts`                     | Upload/download vidéos sur FTP Hostinger                                    |
| **Supabase**         | `supabase.ts`                        | Stockage fallback si FTP non configuré                                      |
| **Metrics**          | `metrics.service.ts`                 | Export Prometheus                                                           |
| **Audit**            | `audit.service.ts`                   | Log toutes les actions admin                                                |
| **MFA**              | `mfa.service.ts`                     | 2FA avec backup codes                                                       |
| **Email**            | `email.service.ts`                   | Password reset, alertes                                                     |
| **Cron**             | `cron-scheduler.service.ts`          | Stats quotidiennes, cleanup                                                 |
| **Logger**           | `logger.service.ts`                  | Logs structurés avec correlation ID                                         |
| **Errors**           | `error-extractor.ts`                 | Extraction messages d'erreur                                                |
| **ImageToVideo**     | `image-to-video.service.ts`          | Conversion image → vidéo MP4 via ffmpeg (720p, ultrafast, option fond flou) |
| **PredictiveAlerts** | `predictive-alerts.service.ts`       | Détection proactive de problèmes (8 métriques) ⚡ v3.0                      |
| **Benchmark**        | `benchmark.service.ts`               | Benchmarks anonymisés entre clubs similaires ⚡ v3.0                        |

### Services Angular Raspberry Pi (Extraits v2.33+) ⚡ NEW

Ces services ont été extraits de `tv.component.ts` pour réduire sa complexité :

| Service           | Fichier                           | Rôle                                               |
| ----------------- | --------------------------------- | -------------------------------------------------- |
| **DoubleBuffer**  | `double-buffer-video.service.ts`  | Transitions vidéo sans flash (2 players alternés)  |
| **ErrorRecovery** | `video-error-recovery.service.ts` | Récupération crashs GPU, watchdog, cleanup mémoire |
| **Watermark**     | `watermark.service.ts`            | Affichage et scheduling du watermark TV            |

**Fichiers** :

- `raspberry/src/app/services/double-buffer-video.service.ts`
- `raspberry/src/app/services/video-error-recovery.service.ts`
- `raspberry/src/app/services/watermark.service.ts`

### Service NetworkDetector (v2.35+) ⚡ NEW

Service de détection automatique du profil réseau sur le Pi :

| Méthode                      | Rôle                                            |
| ---------------------------- | ----------------------------------------------- |
| `detect()`                   | Détection complète (mesh, isolation, stabilité) |
| `getSimplifiedProfile`       | Profil minimal pour sync_local_state            |
| `getFullProfile()`           | Profil complet pour debug bundle                |
| `shouldBlockBssidLock`       | True si BSSID lock dangereux (mesh, enterprise) |
| `shouldRecommendRemoteCloud` | True si isolation détectée                      |
| `shouldDeferHostapdRestart`  | True si restart risqué (mesh, enterprise)       |

**Profils détectés** :

| Type            | Conditions                       | Comportement                |
| --------------- | -------------------------------- | --------------------------- |
| `simple`        | 1 AP, pas d'isolation            | BSSID lock autorisé         |
| `mesh`          | >1 AP même SSID, pas d'isolation | BSSID lock bloqué, bgscan   |
| `mesh_isolated` | >1 AP, isolation client détectée | Remote Cloud recommandé     |
| `enterprise`    | 802.1X détecté                   | Configuration IT requise    |
| `ethernet`      | eth0 UP avec IP et route défaut  | Connexion stable, score 100 |

**Fichier** : `raspberry/sync-agent/src/services/network-detector.js`

### Service SafeNetworkOperations (v2.36+) ⚡ NEW

Service d'encapsulation des opérations réseau risquées avec comportement adaptatif :

| Méthode              | Rôle                                                  |
| -------------------- | ----------------------------------------------------- |
| `checkOperation()`   | Vérifie si une opération est autorisée pour le profil |
| `executeOperation()` | Exécute une opération avec la méthode appropriée      |
| `autoOptimize()`     | Optimise automatiquement la config (bgscan, BSSID)    |
| `getPendingStatus()` | Retourne les opérations en attente de reboot          |
| `executeReboot()`    | Déclenche un reboot (pour appliquer les changements)  |

**Matrice de sécurité** :

| Opération         | Simple  | Mesh   | Mesh Isolé | Enterprise |
| ----------------- | ------- | ------ | ---------- | ---------- |
| set_bssid_lock    | ✅      | ❌     | ❌         | ❌         |
| remove_bssid_lock | ✅      | ✅     | ✅         | ✅         |
| update*hotspot*\* | restart | reboot | reboot     | reboot     |
| fix_hotspot       | direct  | reboot | reboot     | reboot     |
| restart_hostapd   | ✅      | ❌     | ❌         | ❌         |
| configure_bgscan  | ✅      | ✅     | ✅         | ✅         |

**Fichier** : `raspberry/sync-agent/src/services/safe-network-operations.js`

### Service NetworkWatchdog (v2.37+) ⚡ NEW

Service de surveillance et auto-recovery réseau complet :

| Méthode                     | Rôle                                                |
| --------------------------- | --------------------------------------------------- |
| `start()`                   | Démarre les 3 boucles de surveillance               |
| `stop()`                    | Arrête toutes les surveillances                     |
| `getStatus()`               | Retourne l'état actuel (hotspot, internet, cloud)   |
| `checkHotspotHealth()`      | Vérifie hostapd, dnsmasq, AP mode, rfkill, IP       |
| `checkInternetHealth()`     | Vérifie IP wlan1, gateway, ping 8.8.8.8             |
| `attemptHotspotRecovery()`  | Tente la récupération du hotspot (max 3 tentatives) |
| `attemptInternetRecovery()` | Tente la récupération internet (wpa_cli + dhclient) |
| `saveRollbackPoint()`       | Sauvegarde la config avant une opération risquée    |
| `executeRollback()`         | Restaure la config et notifie le central            |
| `confirmOperation()`        | Annule le rollback si l'opération a réussi          |

**Intervalles de surveillance** :

| Type     | Intervalle | Actions si problème               |
| -------- | ---------- | --------------------------------- |
| Hotspot  | 30s        | rfkill unblock, restart hostapd   |
| Internet | 60s        | wpa_cli reconfigure, dhclient     |
| Cloud    | 30s        | Détection zombie, force reconnect |

**Fichier** : `raspberry/sync-agent/src/services/network-watchdog.js`

### Service NetworkAlerts (v2.37+) ⚡ NEW

Service d'alertes proactives côté serveur :

| Méthode                 | Rôle                                             |
| ----------------------- | ------------------------------------------------ |
| `start()`               | Démarre le cron (toutes les 4 heures)            |
| `stop()`                | Arrête le cron                                   |
| `checkNetworkRisks()`   | Évalue tous les sites et génère un rapport       |
| `getCurrentRisks()`     | Retourne le rapport des risques actuels          |
| `getNetworkRiskStats()` | Statistiques agrégées (profils, isolation, etc.) |

**Critères d'alerte** :

| Risque                  | Sévérité         | Condition                        |
| ----------------------- | ---------------- | -------------------------------- |
| `bssid_lock_in_mesh`    | critical         | BSSID lock en environnement mesh |
| `client_isolation`      | warning          | Isolation client détectée        |
| `low_stability`         | warning/critical | Score stabilité < 50 (ou < 25)   |
| `mesh_offline_extended` | critical         | Offline > 24h en mesh            |
| `multiple_warnings`     | warning          | 3+ warnings réseau               |

**Fichier** : `central-server/src/services/network-alerts.service.ts`

### Service Sync-Agent Guardian (v2.40+) ⚡ NEW

Watchdog système **indépendant** qui maintient la connexion cloud même si le sync-agent crashe :

| Commande        | Rôle                                                 |
| --------------- | ---------------------------------------------------- |
| `start`         | Démarre la boucle de surveillance (toutes les 30s)   |
| `create-golden` | Crée un snapshot "golden" depuis la version actuelle |
| `restore`       | Restaure manuellement depuis la version golden       |
| `status`        | Affiche l'état actuel (sync-agent, crashs, golden)   |

**Fonctionnement** :

```
┌─────────────────────────────────────────────────────┐
│                    Raspberry Pi                      │
│                                                      │
│  ┌──────────────────┐    ┌──────────────────────┐  │
│  │  sync-agent      │    │  sync-agent-guardian │  │
│  │  (peut crasher)  │    │  (script bash ultra  │  │
│  │                  │◄───│   minimal ~200 lignes)│  │
│  │  - Socket.IO     │    │                      │  │
│  │  - Commandes     │    │  - Vérifie /30s      │  │
│  └──────────────────┘    │  - 3 crashs/5min →   │  │
│                          │    restore golden    │  │
│                          └──────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Protection contre les fichiers corrompus** :

- Détecte si `agent.js` contient du HTML au lieu de JS (curl foireux)
- Restaure automatiquement depuis `sync-agent-golden/`
- Garde les 5 derniers backups des versions crashées pour debug

**Fichiers** :

- `raspberry/scripts/sync-agent-guardian.sh` - Script de surveillance
- `raspberry/config/systemd/neopro-sync-guardian.service` - Service systemd
- `/home/pi/neopro/sync-agent-golden/` - Copie de sauvegarde "golden"
- `/var/log/neopro-sync-guardian.log` - Logs du guardian

**Usage manuel** (sur le Pi) :

```bash
# Voir le statut
/home/pi/neopro/scripts/sync-agent-guardian.sh status

# Forcer la création d'un golden
/home/pi/neopro/scripts/sync-agent-guardian.sh create-golden

# Restaurer manuellement
/home/pi/neopro/scripts/sync-agent-guardian.sh restore
```

### Modules Sync-Agent Extraits (v2.33+) ⚡ NEW

Le fichier `commands/index.js` (1440 → ~650 lignes) a été refactoré en modules :

| Module            | Fichier                  | Rôle                                             |
| ----------------- | ------------------------ | ------------------------------------------------ |
| **update-config** | `update-config.js`       | Mise à jour configuration avec merge intelligent |
| **diagnostics**   | `diagnostics.js`         | Diagnostics système (CPU, GPU, services)         |
| **hotspot**       | `hotspot.js`             | Gestion et réparation du hotspot WiFi            |
| **network-diag**  | `network-diagnostics.js` | Diagnostics réseau (ping, DNS, traceroute)       |
| **debug-bundle**  | `debug-bundle.js`        | Export bundle de debug pour support technique    |
| **analytics-buf** | `analytics-buffer.js`    | Gestion du buffer analytics                      |

**Fichiers** : `raspberry/sync-agent/src/commands/`

### Stockage Vidéo (Double backend) ⚡ IMPORTANT

Le système utilise **deux backends de stockage** avec fallback automatique :

```
Upload vidéo → FTP configuré ?
                ├── OUI → FTP Hostinger (storage_path = "filename.mp4")
                └── NON → Supabase Storage (storage_path = "uploads/filename.mp4")
```

**Détection automatique lors du déploiement** :

```typescript
// deployment.service.ts - getVideoDownloadUrl()
function getVideoDownloadUrl(storagePath: string): string {
  const isFtpPath = !storagePath.includes('/'); // FTP = pas de slash
  if (isFtpPath && isFtpConfigured()) {
    return getFtpPublicUrl(storagePath); // https://cdn.neopro.tv/file.mp4
  }
  return getPublicUrl(storagePath); // Supabase URL
}
```

**Variables d'environnement FTP** :

```bash
FTP_HOST=ftp.hostinger.com
FTP_USER=xxx
FTP_PASSWORD=xxx
FTP_PUBLIC_URL=https://cdn.neopro.tv  # URL publique du CDN
```

**Documentation complète** : [docs/technical/VIDEO_STORAGE.md](docs/technical/VIDEO_STORAGE.md)

### Protocole Socket.IO

```javascript
// Site → Cloud
'register'          : { siteId, apiKey }
'heartbeat'         : { siteId, metrics: { cpu, memory, temp } }
'sync_local_state'  : { siteId, config, videos, storage, timestamp } // ⚡ Vidéos locales
'command:result'    : { commandId, status, result }
'deployment:progress': { deploymentId, progress, status }

// Cloud → Site
'deploy_video'      : { deploymentId, videoUrl, ... }
'update_config'     : { configVersionId, configuration }
'execute_command'   : { commandId, type, data }
```

### Synchronisation des Vidéos Locales ⚡ NEW

Le sync-agent remonte automatiquement la liste des vidéos présentes sur le Pi :

```javascript
// Structure envoyée via sync_local_state
{
  videos: [
    {
      filename: 'video.mp4',
      path: 'videos/INFOS_CLUB/video.mp4',
      category: 'INFOS_CLUB',
      subcategory: null,
      size: 12345678,
      lastModified: '2024-12-09T14:30:00Z'
    }
  ],
  storage: {
    total: 32000000000,  // 32 GB
    used: 8000000000,
    free: 24000000000
  }
}
```

**Fichiers impliqués** :

- `raspberry/sync-agent/src/watchers/video-watcher.js` - Surveillance du dossier vidéos
- `central-server/src/services/socket.service.ts` - Stockage dans `local_config_mirror`
- `central-dashboard/src/app/features/sites/site-detail.component.ts` - Affichage dropdown

### Mise à jour de Configuration (Merge Intelligent)

La commande `update_config` utilise un **merge intelligent** qui préserve les paramètres locaux :

```javascript
// Modes disponibles
'merge'   : Fusionne le contenu NEOPRO avec la config locale (défaut, recommandé)
'replace' : Remplace les champs de contenu tout en préservant les paramètres locaux
```

**Payload de la commande** :

```javascript
{
  neoProContent: { sponsors, categories, timeCategories, categoryMappings, ... },
  mode: 'merge' | 'replace'  // défaut: 'merge'
}
```

**Champs gérés** (envoyés dans `neoProContent`) :

| Champ              | Mode merge                                                 | Mode replace         |
| ------------------ | ---------------------------------------------------------- | -------------------- |
| `sponsors`         | Fusion intelligente (locaux préservés si non dans central) | Remplacement complet |
| `categories`       | Fusion NEOPRO/Club                                         | Remplacement complet |
| `timeCategories`   | Remplacement complet                                       | Remplacement complet |
| `categoryMappings` | Remplacement complet                                       | Remplacement complet |
| `liveScoreEnabled` | Mise à jour                                                | Mise à jour          |
| `scoreOverlay`     | Mise à jour                                                | Mise à jour          |

**Règles de merge pour les sponsors** :

1. Tous les sponsors envoyés par le central sont appliqués (mise à jour ou ajout)
2. Les sponsors Club créés localement (non présents dans la liste du central) sont préservés
3. Le central est la **source de vérité** : si un sponsor est modifié dans le dashboard, la modification s'applique

**Paramètres locaux protégés** (jamais écrasés par le central) :

| Paramètre      | Description                                       |
| -------------- | ------------------------------------------------- |
| `settings`     | language, timezone - configurés localement        |
| `siteId`       | Identifiant unique du site                        |
| `siteName`     | Nom du site (peut être personnalisé)              |
| `clubName`     | Nom du club                                       |
| `apiKey`       | Clé API du boîtier                                |
| `hotspot`      | Configuration WiFi (SSID) - si stocké dans config |
| `localNetwork` | Configuration réseau locale                       |

**Note** : Le SSID WiFi est stocké dans `/etc/hostapd/hostapd.conf` (fichier système), pas dans `configuration.json`. Pour le modifier, utiliser la commande `update_hotspot`.

**Fichiers impliqués** :

- `raspberry/sync-agent/src/commands/index.js` - Exécution de la commande `update_config`
- `raspberry/sync-agent/src/utils/config-merge.js` - Logique de fusion (mode merge)
- `raspberry/server/server.js` - Réception de `config_updated` et broadcast aux clients
- `central-server/src/controllers/sites.controller.ts` - Normalisation des commandes
- `central-dashboard/.../site-content-tab.component.ts` - UI de déploiement avec choix du mode

**Flux de notification après déploiement** :

```
sync-agent (update_config) → socket.emit('config_updated') → server.js → io.emit('reload-config') → TV/Remote
```

### Boucles Vidéo par Phase ⚡ NEW (2026-01)

Les clubs peuvent définir des playlists différentes selon la **phase du match** :

| Phase             | ID        | Description           | Déclenchement   |
| ----------------- | --------- | --------------------- | --------------- |
| Boucle par défaut | `neutral` | Hors match            | Par défaut      |
| Avant-match       | `before`  | Accueil spectateurs   | Télécommande 🏁 |
| Pendant le match  | `during`  | Mi-temps, temps morts | Télécommande ▶️ |
| Après-match       | `after`   | Célébrations          | Télécommande 🏆 |

**Structure de configuration** :

```typescript
// configuration.json du Pi
{
  "sponsors": [...],           // Boucle par défaut (N vidéos)
  "timeCategories": [
    {
      "id": "before",
      "name": "Avant-match",
      "icon": "🏁",
      "loopVideos": [          // N vidéos pour cette phase
        { "name": "Sponsor A", "path": "videos/sponsor_a.mp4", "type": "video/mp4" },
        { "name": "Sponsor B", "path": "videos/sponsor_b.mp4", "type": "video/mp4" }
      ]
    }
  ]
}
```

**Fallback** : Si une phase n'a pas de `loopVideos`, utilise `sponsors[]` (boucle par défaut).

**Fichiers impliqués** :

- `raspberry/src/app/components/tv/tv.component.ts` - `getLoopVideosForPhase()`
- `raspberry/src/app/components/remote/remote.component.ts` - `switchPhase()`
- `central-dashboard/.../site-content-tab.component.ts` - UI de configuration
- `central-dashboard/.../remote-preview.component.ts` - Prévisualisation

### Double-Buffer Vidéo (Transitions Sans Flash) ⚡ UPDATED (2026-02-07)

Le composant TV utilise un système **double-buffer + freeze-frame pré-capturé + black overlay** pour éliminer les flash entre vidéos.

**⚠️ IMPORTANT - Optimisation Pi** :

Le préchargement anticipé et l'événement `timeupdate` causent des **saccades** sur Raspberry Pi car le décodeur matériel ne supporte pas bien le décodage de 2 vidéos en parallèle. Solution adoptée :

- **Pas de préchargement pendant la lecture** - une seule vidéo décode à la fois
- **`timeupdate` désactivé** - l'événement lui-même causait des micro-freezes
- **Préchargement au `ended`** - on charge la suivante uniquement quand la vidéo se termine
- Légère pause entre vidéos acceptable (< 1s) en échange d'une lecture fluide

**⚠️ IMPORTANT - Pré-capture freeze-frame (v3.7.8+)** :

Sur Chromium/Pi avec décodeur vidéo matériel (VideoCore), le frame buffer est **libéré immédiatement** quand l'événement `ended` se déclenche. Un `drawImage()` dans le handler `ended` capture donc un écran noir au lieu de la dernière image. Solution adoptée :

- **Pré-capture périodique** toutes les 500ms pendant la lecture (`startLastFrameCapture`)
- Le canvas contient toujours la dernière image valide **avant** que `ended` ne se déclenche
- **Fallback black overlay** si aucun frame pré-capturé n'est disponible (premier chargement)
- Fonctionne à la fois sur navigateur desktop (live capture suffisait) et Chromium kiosk Pi

**Architecture des couches (z-index)** :

```
┌─────────────────────────────────────────────────────────────────┐
│                        TV Component                              │
│                                                                  │
│  z-index 20: Canvas freeze-frame (pré-capturé toutes les 500ms)│
│  z-index 10: Player manuel (vidéos déclenchées manuellement)    │
│  z-index 5:  Black overlay (bloque la boucle pendant transitions)│
│  z-index 1-2: Players boucle A/B (alternent pour la boucle)     │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐                           │
│  │   Player A   │    │   Player B   │                           │
│  │  opacity: 1  │    │  opacity: 0  │  ← vide pendant lecture   │
│  │  z-index: 1  │    │  z-index: 0  │                           │
│  │  [PLAYING]   │    │  [IDLE]      │                           │
│  └──────────────┘    └──────────────┘                           │
│         │                    │                                   │
│      ended ─────── load+play ┘                                   │
│                   │                                              │
│         playerA ←→ playerB alternent                            │
└─────────────────────────────────────────────────────────────────┘
```

**Stratégie de transition entre vidéos de boucle (v3.7.8+)** :

```
Pendant la lecture:
  setInterval(500ms) → captureLastFrame() → canvas (invisible, hasValidLastFrame=true)
  hasValidLastFrame reste true entre les transitions (pas de reset dans hideFreezeFrame)

À la fin de la vidéo (ended):
  1. captureAndShowFreezeFrame()
     ├── hasValidLastFrame=true → affiche le canvas pré-capturé (z-index 20)
     └── hasValidLastFrame=false → showBlackOverlay() (z-index 5, fallback)
  2. preloadOnInactivePlayer() → charge la vidéo suivante
  3. switchPlayers() :
     a. Rend le nouveau player visible (opacity 1, z-index 2 — AU-DESSUS de l'ancien à z-index 1)
     b. Lance play()
     c. Attend 2×rAF + 150ms (GPU a le temps de rendre la première frame)
     d. Cache l'ancien player (z-index 0) + freeze-frame + black overlay
     e. Ramène le nouveau player à z-index 1 (état normal)
```

**Stratégie pour les vidéos manuelles (v3.7.8+)** :

1. Capturer le freeze-frame (z-index 20, image de la vidéo en cours)
2. Afficher le black overlay (z-index 5, bloque physiquement la boucle)
3. Charger la vidéo manuelle sur le player manuel (z-index 10, **opacity 0**)
4. Attendre `canplaythrough` puis jouer
5. Après play() + 2×rAF + 200ms : rendre le player visible (opacity 1) PUIS cacher freeze-frame
6. À la fin : cacher player manuel + black overlay → boucle visible

**Stratégie pour les changements de phase** :

1. Si une vidéo manuelle est en cours → la couper immédiatement (`stopManualVideoAndReturnToLoop`)
2. Capturer le freeze-frame AVANT de changer quoi que ce soit
3. Changer la phase et recharger la boucle
4. Une fois la nouvelle vidéo en lecture, cacher le freeze-frame (150ms délai)

**Note importante** : Cliquer sur une boucle (même la phase actuelle) coupe toujours une vidéo manuelle en cours. Cela permet à l'utilisateur de revenir à la boucle de sponsors à tout moment.

**Méthodes clés** :

| Méthode                            | Rôle                                                          |
| ---------------------------------- | ------------------------------------------------------------- |
| `initDoubleBuffer()`               | Initialise les 4 players + canvas + overlay + pré-capture     |
| `setPlayerVisible()`               | Contrôle opacité/z-index via styles inline                    |
| `playOnActivePlayer()`             | Joue une vidéo sur le player visible                          |
| `preloadOnInactivePlayer()`        | Charge la vidéo suivante (appelé au `ended`)                  |
| `switchPlayers()`                  | Bascule entre les 2 players (2×rAF + 100ms sécurité)          |
| `onVideoEnded()`                   | Freeze-frame + preload + switch à la fin d'une vidéo          |
| `startLastFrameCapture()`          | Démarre la pré-capture toutes les 500ms ⚡ v3.7.8             |
| `stopLastFrameCapture()`           | Arrête l'intervalle de pré-capture ⚡ v3.7.8                  |
| `captureLastFrame()`               | Capture silencieuse du frame actuel sur le canvas ⚡ v3.7.8   |
| `captureAndShowFreezeFrame()`      | Affiche le frame pré-capturé ou tente capture live (fallback) |
| `hideFreezeFrame()`                | Cache le canvas, reset `hasValidLastFrame`                    |
| `showBlackOverlay()`               | Affiche l'overlay noir (fallback si pas de frame)             |
| `hideBlackOverlay()`               | Cache l'overlay noir                                          |
| `stopManualVideoAndReturnToLoop()` | Coupe la vidéo manuelle pour revenir à la boucle              |

**Propriétés de pré-capture** ⚡ v3.7.8 :

```typescript
private lastFrameCaptureInterval: ReturnType<typeof setInterval> | null = null;
private hasValidLastFrame = false; // true si le canvas contient un frame valide pré-capturé
```

**Optimisation mémoire (usage intensif)** :

- Canvas réduit à 720p (1280x720) au lieu de 1080p → économise ~4.5MB
- `hideFreezeFrame()` ne fait plus `clearRect()` car le canvas est continuellement rafraîchi par la pré-capture
- Le flag `hasValidLastFrame` est reset à `false` dans `hideFreezeFrame()` puis remis à `true` par la prochaine pré-capture réussie
- Important pour les sessions longues (5h+) avec 3-4 déclenchements manuels/minute

**Ce qui a été désactivé** (causait des saccades sur Pi) :

- `timeupdate` listener - même throttlé, causait des micro-freezes
- Préchargement anticipé - décodage parallèle surchargeait le GPU
- Transition CSS opacity - repaints causaient des saccades
- Capture live dans `onVideoEnded()` - frame buffer déjà libéré sur Chromium/Pi (v3.7.8)

**Fichiers impliqués** :

- `raspberry/src/app/components/tv/tv.component.ts` - Logique double-buffer + freeze-frame + pré-capture
- `raspberry/src/app/components/tv/tv.component.html` - 4 vidéos + canvas + overlay
- `raspberry/src/app/components/tv/tv.component.scss` - CSS (z-index, positions)

### Système de Récupération d'Erreurs Vidéo ⚡ NEW (2026-01-11)

Le composant TV inclut un système robuste de récupération automatique pour éviter les crashs et écrans blancs après de longues sessions.

**Problème résolu** : Après 2h+ de boucle vidéo, le GPU Pi peut surchauffer et déclencher une erreur `MEDIA_ERR_DECODE` (code 5), causant un écran blanc nécessitant un redémarrage manuel.

**Codes d'erreur HTML5 gérés** :

| Code | Nom                         | Cause probable                   | Action                 |
| ---- | --------------------------- | -------------------------------- | ---------------------- |
| 1    | MEDIA_ERR_ABORTED           | Lecture interrompue              | Skip vidéo             |
| 2    | MEDIA_ERR_NETWORK           | Erreur réseau                    | Skip vidéo             |
| 3    | MEDIA_ERR_DECODE            | Surchauffe GPU, fichier corrompu | Skip + reset si répété |
| 4    | MEDIA_ERR_SRC_NOT_SUPPORTED | Codec incompatible               | Skip vidéo             |
| 5    | MEDIA_ERR_ENCRYPTED         | DRM (rare)                       | Skip vidéo             |

**Architecture de récupération** :

```
Error Handler → consecutiveErrors++ → Recovery Strategy
                      │
                      ├── < 3 erreurs : Skip vidéo (1s delay)
                      └── >= 3 erreurs : Full Reset (3s GPU cooldown)

Watchdog (10s) → checkPlaybackHealth()
                      │
                      ├── Vidéo pausée → player.play()
                      └── Vidéo bloquée → Skip to next

Memory Cleanup (30min OU 50 vidéos)
  → Clear freeze-frame canvas (~4.5MB)
  → Clear inactive player buffers
  → Force GC if available
```

**Méthodes clés** :

| Méthode                            | Rôle                                            |
| ---------------------------------- | ----------------------------------------------- |
| `handleVideoError()`               | Gère les erreurs des 4 players HTML5            |
| `recoverFromLoopError()`           | Skip vidéo corrompue, passe à la suivante       |
| `performFullReset()`               | Reset complet après 3 erreurs (pause GPU 3s)    |
| `startWatchdog()`                  | Démarre la surveillance (toutes les 10s)        |
| `checkPlaybackHealth()`            | Vérifie que la vidéo progresse                  |
| `performPreventiveMemoryCleanup()` | Libère mémoire (canvas, buffers) périodiquement |

**Configuration** :

```typescript
MAX_CONSECUTIVE_ERRORS = 3; // Reset complet après 3 erreurs
MEMORY_CLEANUP_INTERVAL = 30 * 60 * 1000; // Cleanup toutes les 30 min
VIDEO_COUNT_BEFORE_CLEANUP = 50; // Cleanup après 50 vidéos
```

**Diagnostic dans les logs** :

```
[TV] ⚠️ Player loop-A error: { code: 3, message: "MEDIA_ERR_DECODE", ... }
[TV] Recovering from loop error on loop-A
[TV] 🐕 Watchdog: video paused unexpectedly, attempting recovery
[TV] 🧹 Performing preventive memory cleanup
[TV] 🔄 Performing full video system reset
```

### Mapping Analytics des Catégories ⚡ NEW (2026-01)

Le mapping permet de normaliser les catégories locales vers des **types analytics standardisés** pour le reporting :

| Type Analytics | Couleur   | Exemples de catégories locales    |
| -------------- | --------- | --------------------------------- |
| `sponsor`      | 🔵 Bleu   | SPONSORS, PUBS, PARTENAIRES       |
| `jingle`       | 🟢 Vert   | JINGLES, BUTS, ANIMATIONS         |
| `ambiance`     | 🟣 Violet | AMBIANCE, MUSIQUE, ENTREE_JOUEURS |
| `other`        | ⚪ Gris   | Tout le reste                     |

**Règle de mapping** :

- Si catégorie **sans** sous-catégories → mapping sur la catégorie
- Si catégorie **avec** sous-catégories → mapping sur chaque sous-catégorie (pas sur le parent)

**Structure** :

```typescript
// configuration.json
{
  "categoryMappings": {
    "ENTREE": "ambiance",           // Catégorie sans sous-cat
    "MATCH_BUTS": "jingle",         // Sous-catégorie de MATCH
    "MATCH_SPONSORS": "sponsor"     // Autre sous-catégorie de MATCH
  }
}
```

**Fichiers impliqués** :

- `central-dashboard/.../site-content-tab.component.ts` - UI de mapping
- `central-dashboard/.../config-editor.component.ts` - Éditeur complet
- `central-server/src/controllers/analytics.controller.ts` - Agrégation par type

---

## Patterns de Code

### Contrôleur Express

```typescript
// central-server/src/controllers/sites.controller.ts
export const getSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM sites WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get site error:', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};
```

### Service Singleton

```typescript
// central-server/src/services/example.service.ts
class ExampleService {
  async doSomething() { ... }
}
export const exampleService = new ExampleService();
export default exampleService;
```

### Validation Joi

```typescript
// central-server/src/middleware/validation.ts
const schema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});
router.post('/login', validate(schemas.login), controller.login);
```

### Angular Standalone Component

```typescript
// central-dashboard/src/app/features/sites/sites-list.component.ts
@Component({
  selector: 'app-sites-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `...`,
})
export class SitesListComponent implements OnInit {}
```

### Pagination Standard

```typescript
const { page = 1, limit = 20 } = req.query;
const offset = (page - 1) * limit;

res.json({
  data: rows,
  pagination: { page, limit, total },
});
```

---

## Conventions de Code

### Nommage

| Type        | Convention           | Exemple                                  |
| ----------- | -------------------- | ---------------------------------------- | --------- |
| Fichiers    | kebab-case + suffixe | `sites.controller.ts`, `auth.service.ts` |
| Classes     | PascalCase           | `DeploymentService`                      |
| Fonctions   | camelCase + verbe    | `getSites`, `createUser`, `deployVideo`  |
| Interfaces  | PascalCase, pas de I | `interface User`, `interface SiteInput`  |
| Types union | PascalCase           | `type UserRole = 'admin'                 | 'viewer'` |

### Structure des dossiers

```
src/
├── controllers/   # Logique métier (1 fichier = 1 domaine)
├── routes/        # Définition des routes Express
├── services/      # Services partagés (exportés en singleton)
├── middleware/    # auth, validation, rate-limit
├── types/         # Interfaces et types TypeScript
├── config/        # Configuration (database, logger)
└── scripts/       # Migrations, CLI tools
```

### Règles strictes

- **TypeScript strict** : pas de `any` sauf exception justifiée
- **Async/await** : jamais de callbacks, toujours try/catch
- **Logs structurés** : `logger.info('Action', { context })` pas de string concat
- **Pas de console.log** : utiliser Winston logger

---

## NE JAMAIS FAIRE

```typescript
// ❌ INTERDIT - Query sans paramètres (SQL injection)
query(`SELECT * FROM users WHERE email = '${email}'`);

// ✅ CORRECT - Query paramétrée
query('SELECT * FROM users WHERE email = $1', [email]);
```

```typescript
// ❌ INTERDIT - Modifier les migrations existantes en production
// Les migrations sont immutables une fois déployées

// ❌ INTERDIT - Changer le format des api_key des sites
// Ça casserait tous les Pi connectés

// ❌ INTERDIT - Supprimer des colonnes sans migration
// Toujours utiliser npm run db:migrate

// ❌ INTERDIT - Commit des secrets
// .env est dans .gitignore, utiliser .env.example

// ❌ INTERDIT - Push sur main sans PR
// Toujours créer une branche feature/xxx
```

### Fichiers critiques à ne pas toucher sans review

- `central-server/src/middleware/auth.ts` - Auth JWT
- `central-server/src/config/database.ts` - Connexion DB
- `central-server/src/services/socket.service.ts` - Protocole Pi ↔ Cloud
- `raspberry/scripts/setup-new-club.sh` - Setup production

---

## Commandes

### Développement

```bash
npm start                    # Frontend Raspberry (port 4200)
npm run start:central        # Dashboard central (port 4300)
npm run server               # Socket.IO local (port 3000)

# API Backend
cd central-server
npm run dev                  # nodemon + ts-node
```

### Build

```bash
npm run build:raspberry      # Build Angular pour Pi
npm run build:central        # Build dashboard
cd central-server && npm run build  # Compile TypeScript
```

### Tests

```bash
npm run test:server          # Jest (API)
npm run test:raspberry       # Karma (Angular Pi)
npm run test:central         # Karma (Angular Dashboard)
cd e2e && npx playwright test  # E2E
npm run lint                 # ESLint
```

### Base de données

```bash
cd central-server
npm run db:migrate           # Exécuter les migrations
npm run create-admin         # Créer un super_admin
```

### Déploiement Pi

```bash
npm run deploy:raspberry neopro.local    # Déployer sur un Pi
./raspberry/scripts/setup-new-club.sh    # Configurer nouveau club
./raspberry/scripts/diagnose-pi.sh       # Diagnostic complet
./raspberry/scripts/fix-hotspot.sh       # Réparer hotspot WiFi (interférences, channel)
```

---

## Variables d'Environnement

```bash
# === OBLIGATOIRES ===
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=minimum-32-caracteres-random
ALLOWED_ORIGINS=https://dashboard.example.com

# === BASE DE DONNÉES ===
DATABASE_SSL=true
DATABASE_SSL_CA=/path/to/cert.pem  # ou inline

# === STOCKAGE VIDÉOS ===
FTP_HOST=ftp.example.com
FTP_USER=xxx
FTP_PASSWORD=xxx
FTP_PUBLIC_URL=https://cdn.example.com/videos
# Fallback Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx

# === EMAIL (password reset, alertes) ===
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=xxx
SMTP_PASSWORD=xxx

# === OPTIONNEL ===
LOG_LEVEL=info              # debug, info, warn, error
LOGTAIL_TOKEN=xxx           # Logs centralisés
SLACK_WEBHOOK_URL=xxx       # Alertes Slack
REDIS_URL=redis://xxx       # Pour Socket.IO multi-instance
```

---

## Debugging

### Site offline ?

```bash
# Vérifier la connexion
ping neopro.local

# Voir les logs
ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 100'

# Diagnostic complet
ssh pi@neopro.local 'cd /home/pi/neopro && ./scripts/diagnose-pi.sh'

# Redémarrer les services
ssh pi@neopro.local 'sudo systemctl restart neopro-app neopro-sync'
```

### API qui ne répond pas ?

```bash
# Health check
curl http://localhost:3001/health

# Logs serveur
cd central-server && npm run dev  # Watch mode avec logs

# Test direct DB
psql $DATABASE_URL -c "SELECT COUNT(*) FROM sites"
```

### Déploiement vidéo bloqué ?

```sql
-- Vérifier les déploiements en cours
SELECT id, status, progress, error_message
FROM content_deployments
WHERE status = 'in_progress';

-- Reset si bloqué
UPDATE content_deployments SET status = 'failed'
WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '1 hour';
```

### Android et le hotspot (résolu depuis v2.5.0)

**Historique** : Android affichait "Pas d'accès Internet" et bloquait la résolution DNS de `neopro.local`.

**Résolu** : Le captive portal est configuré automatiquement depuis la version 2.5.0. Android reçoit une réponse `204 No Content` sur `/generate_204` et accepte le réseau.

**Résultat** : `http://neopro.local/remote` fonctionne sur **tous les appareils** (iOS, Android, Windows, macOS).

**Vérification** (si problème sur un ancien Pi) :

```bash
# Sur le Pi
curl -I http://localhost/generate_204
# Doit retourner : HTTP/1.1 204 No Content
```

**Fallback** : Si un Pi n'a pas le captive portal, utiliser `http://192.168.4.1/remote`

**Documentation complète** : [docs/guides/ANDROID_HOTSPOT_FIX.md](docs/guides/ANDROID_HOTSPOT_FIX.md)

### Hotspot WiFi invisible ou instable ?

**Causes fréquentes** lors d'un déplacement du boîtier :

1. **Interférences sur le channel 6** - Trop de réseaux WiFi sur le même canal
2. **Alimentation insuffisante** - Port USB de TV au lieu d'un chargeur 5V/3A
3. **Distance/obstacles** - WiFi 2.4GHz a une portée limitée (~10-15m)

**Diagnostic et réparation depuis le dashboard central** :

1. Aller dans l'onglet **Debug** du site
2. Section **Hotspot WiFi** → Cliquer **Réparer automatiquement**
3. Si un changement de canal est nécessaire, un modal de confirmation apparaît
4. Choisir **Redémarrer maintenant** (applique immédiatement) ou **Plus tard** (appliqué au prochain reboot)

**Diagnostic et réparation depuis l'admin panel (:8080)** :

1. Accéder à `http://neopro.local:8080` ou `http://192.168.4.1:8080`
2. Onglet **Réseau** → Section **Diagnostic Hotspot WiFi**
3. Cliquer **🔍 Diagnostiquer** pour voir l'état actuel
4. Cliquer **🔧 Réparer automatiquement** pour corriger

**Script de diagnostic et réparation (via SSH)** :

```bash
# Mode diagnostic (affiche les problèmes)
./fix-hotspot.sh

# Mode auto-fix (prépare le changement de canal)
./fix-hotspot.sh --auto-fix

# Mode JSON (pour intégration dashboard/admin)
./fix-hotspot.sh --json --auto-fix

# Redémarrer immédiatement après correction
./fix-hotspot.sh --auto-fix --reboot-now
```

**Ce que fait le script** :

- Vérifie l'alimentation (voltage)
- Scanne les canaux WiFi et trouve le moins encombré (1, 6 ou 11)
- Vérifie hostapd, dnsmasq, rfkill
- Change le canal dans la config **sans redémarrer hostapd** (préserve wlan1)
- Le changement sera effectif au prochain reboot

**⚠️ IMPORTANT** : Le script ne redémarre plus automatiquement hostapd car cela coupe la connexion WiFi cliente (wlan1). Un reboot est requis pour appliquer le changement de canal.

**Changer manuellement le channel** :

```bash
# Passer en channel 1 (moins encombré que 6)
sudo sed -i 's/channel=6/channel=1/' /etc/hostapd/hostapd.conf
# Le changement sera appliqué au prochain reboot
sudo reboot
```

---

## Workflow Git & Versioning

### Versioning Automatique (semantic-release)

Neopro utilise **semantic-release** pour gérer automatiquement les versions :

```bash
# Vérifier l'état du versioning
./scripts/check-version.sh

# Les versions sont incrémentées automatiquement selon les commits :
feat:             → MINOR (2.0.1 → 2.1.0)
fix:              → PATCH (2.0.1 → 2.0.2)
BREAKING CHANGE:  → MAJOR (2.0.1 → 3.0.0)
```

**Documentation complète** : [docs/VERSIONING.md](docs/VERSIONING.md)

### Workflow Standard

```bash
# Nouvelle feature
git checkout -b feature/ma-feature
# ... développement ...
npm run lint && npm run test:server
git commit -m "feat(scope): description"
git push -u origin feature/ma-feature
# Créer PR sur GitHub → Merge → Version auto-incrémentée

# Hotfix
git checkout -b hotfix/description
# ... fix ...
git commit -m "fix(scope): description"
```

### Format des commits (Conventional Commits)

```
feat(sites): add bulk delete endpoint        # → v2.1.0
fix(auth): handle expired tokens correctly   # → v2.0.2
docs(readme): update deployment instructions # → pas de version
refactor(socket): simplify heartbeat         # → pas de version
test(analytics): add coverage                # → pas de version

# Breaking change
feat(api): redesign auth flow

BREAKING CHANGE: JWT format changed          # → v3.0.0
```

**IMPORTANT** :

- ✅ Utiliser les types conventionnels (`feat:`, `fix:`, etc.)
- ❌ Ne **jamais** modifier `package.json` version manuellement
- ❌ Ne **jamais** créer de tags manuels (géré par semantic-release)
- 📖 Voir [docs/VERSIONING.md](docs/VERSIONING.md) pour la liste complète

---

## Fichiers Clés

### Backend

| Fichier                                                               | Description                        |
| --------------------------------------------------------------------- | ---------------------------------- |
| `central-server/src/server.ts`                                        | Point d'entrée, middleware order   |
| `central-server/src/routes/*.ts`                                      | Tous les endpoints                 |
| `central-server/src/types/index.ts`                                   | Interfaces TypeScript              |
| `central-server/src/middleware/auth.ts`                               | JWT + cookie auth                  |
| `central-server/src/middleware/correlation.ts`                        | Correlation ID middleware          |
| `central-server/src/middleware/errors.ts`                             | Classes d'erreurs standardisées    |
| `central-server/src/middleware/error-handler.ts`                      | Gestionnaire d'erreurs global      |
| `central-server/src/services/socket.service.ts`                       | Protocole WebSocket                |
| `central-server/src/services/socket.service.test.ts`                  | Tests Socket.IO (980 lignes)       |
| `central-server/src/services/draft.service.test.ts`                   | Tests brouillons ⚡ NEW            |
| `central-server/src/services/command-queue.service.test.ts`           | Tests file de commandes ⚡ NEW     |
| `central-server/src/services/asset.service.test.ts`                   | Tests watermarks ⚡ NEW            |
| `central-server/src/services/orchestrated-deployment.service.test.ts` | Tests déploiement orchestré ⚡ NEW |
| `central-server/src/controllers/remote.controller.ts`                 | Télécommande cloud ⚡ NEW          |
| `central-server/src/routes/remote.routes.ts`                          | Routes remote cloud ⚡ NEW         |
| `central-server/src/services/subscription.service.ts`                 | Gestion abonnements ⚡ v2.47       |
| `central-server/src/controllers/subscription.controller.ts`           | API abonnements ⚡ v2.47           |
| `central-server/src/routes/subscription.routes.ts`                    | Routes abonnements ⚡ v2.47        |
| `central-server/src/scripts/full-schema.sql`                          | Schéma DB complet                  |

### Frontend Dashboard

| Fichier                                                             | Description                   |
| ------------------------------------------------------------------- | ----------------------------- |
| `central-dashboard/src/app/app.routes.ts`                           | Routes Angular                |
| `central-dashboard/src/app/core/services/auth.service.ts`           | Auth client                   |
| `central-dashboard/src/app/core/services/logger.service.ts`         | Logs structurés + correlation |
| `central-dashboard/src/app/core/utils/error-extractor.ts`           | Extraction messages d'erreur  |
| `central-dashboard/src/app/core/interceptors/error.interceptor.ts`  | HTTP retry + correlation      |
| `central-dashboard/src/app/core/handlers/global-error.handler.ts`   | Error handler Angular         |
| `central-dashboard/src/app/features/sites/`                         | Gestion des clubs             |
| `central-dashboard/src/app/features/sites/site-detail.component.ts` | Page détail site avec 4 tabs  |
| `central-dashboard/src/app/features/sites/components/`              | Composants modulaires par tab |

### Composants Site Detail (Refactoring 2026)

| Composant                    | Fichier                                     | Description                                                   |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| **SiteContentTabComponent**  | `components/site-content-tab/`              | Onglet Contenu : boucles, catégories, déploiements en attente |
| **SiteSettingsTabComponent** | `components/site-settings-tab/`             | Onglet Paramètres : config réseau, hotspot, QR code           |
| **SiteDebugTabComponent**    | `components/site-debug-tab/`                | Onglet Debug : logs, commandes, diagnostics                   |
| **RemotePreviewComponent**   | `components/remote-preview/`                | Simulation visuelle de la télécommande Pi                     |
| **VideoUploadZoneComponent** | `components/video-upload-zone/`             | Upload contextuel de vidéos pour un site                      |
| **VideoLibraryComponent**    | `components/video-library/`                 | Bibliothèque vidéos avec filtre "Pertinentes" et badge ⭐     |
| **VideoSelectorComponent**   | `shared/components/video-selector/`         | Sélecteur de vidéos avec filtres catégorie                    |
| **QrCodeGeneratorComponent** | `shared/components/qr-code-generator/`      | Génération QR code télécommande (local/cloud) + accès direct  |
| **ConfigEditorComponent**    | `config-editor/`                            | Éditeur complet de configuration JSON                         |
| **CloudRemoteComponent**     | `features/remote/cloud-remote.component.ts` | Télécommande cloud ⚡ NEW                                     |
| **SubscriptionsManagement**  | `features/subscriptions/`                   | Page gestion abonnements (design cohérent dashboard) ⚡ v2.47 |
| **SitesMapComponent**        | `components/sites-map/`                     | Carte géographique des sites avec Leaflet ⚡ v3.0             |

### Synchronisation Remote Pi ↔ Cloud Remote ⚠️ IMPORTANT

Le `CloudRemoteComponent` (dashboard) est une copie quasi-identique du `RemoteComponent` (Pi) pour assurer une expérience utilisateur cohérente. **La synchronisation n'est PAS automatique.**

**Fichiers concernés** :

| Composant  | Pi (source)                                                 | Dashboard (copie)                                                       |
| ---------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| TypeScript | `raspberry/src/app/components/remote/remote.component.ts`   | `central-dashboard/src/app/features/remote/cloud-remote.component.ts`   |
| HTML       | `raspberry/src/app/components/remote/remote.component.html` | `central-dashboard/src/app/features/remote/cloud-remote.component.html` |
| SCSS       | `raspberry/src/app/components/remote/remote.component.scss` | `central-dashboard/src/app/features/remote/cloud-remote.component.scss` |

**Lors de modifications sur le Remote Pi** :

1. **Évaluer l'impact** : Le changement affecte-t-il l'UI (HTML/SCSS) ou la logique métier (TS) ?
2. **Reporter manuellement** sur les fichiers `cloud-remote.*` correspondants
3. **Adapter les appels service** :
   - Pi : `LocalBroadcastService` (Socket.IO local)
   - Cloud : `RemoteService` (HTTP API vers le central-server)
4. **Tester le build** : `cd central-dashboard && npm run build`

**Différences structurelles** :

| Aspect        | Remote Pi                     | Cloud Remote                        |
| ------------- | ----------------------------- | ----------------------------------- |
| Communication | `LocalBroadcastService` (WS)  | `RemoteService` (HTTP)              |
| Auth          | `auth.password` local         | JWT dashboard (via route guard)     |
| Config        | `configuration.json` lu local | `/api/sites/:id/local-content` HTTP |
| États         | Toujours connecté             | Loading/Error/Offline states        |
| Route         | `/remote`                     | `/remote/:siteId`                   |

**Quand synchroniser** :

- ✅ Nouveaux boutons/actions dans la télécommande
- ✅ Changements de layout ou styles
- ✅ Nouvelles phases de match
- ❌ Changements spécifiques au Pi (login local, hotspot)

### Raspberry Pi

| Fichier                                                     | Description                  |
| ----------------------------------------------------------- | ---------------------------- |
| `raspberry/src/app/components/tv/tv.component.ts`           | Affichage TV (double-buffer) |
| `raspberry/frontend/src/app/components/remote.component.ts` | Télécommande                 |
| `raspberry/sync-agent/src/agent.js`                         | Agent de synchronisation     |
| `raspberry/sync-agent/src/watchers/video-watcher.js`        | Surveillance vidéos ⚡       |
| `raspberry/sync-agent/src/license-cache.js`                 | Cache licence local ⚡ v2.47 |
| `raspberry/src/app/services/license.service.ts`             | Service licence ⚡ v2.47     |
| `raspberry/src/app/components/license-block/`               | Écran blocage TV ⚡ v2.47    |
| `raspberry/src/app/components/license-banner/`              | Bannière remote ⚡ v2.47     |
| `raspberry/scripts/setup-new-club.sh`                       | Setup nouveau club           |

### Documentation

| Fichier                                 | Description                      |
| --------------------------------------- | -------------------------------- |
| `docs/REFERENCE.md`                     | Doc technique complète           |
| `docs/TROUBLESHOOTING.md`               | Dépannage                        |
| `docs/INSTALLATION_COMPLETE.md`         | Setup Pi de A à Z                |
| `docs/technical/ERROR_HANDLING.md`      | Système d'error handling         |
| `docs/guides/QR_CODE_REMOTE.md`         | QR code télécommande             |
| `docs/guides/MESH_WIFI_ENVIRONMENTS.md` | Guide WiFi mesh (cas NLF) ⚡ NEW |

---

## Tests

### Couverture cible

- Branches: 60%
- Functions: 75%
- Lines: 80%

### Structure des tests

```typescript
// central-server/src/controllers/sites.controller.test.ts
describe('SitesController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /sites', () => {
    test('should return paginated sites', async () => {
      const response = await request(app).get('/api/sites').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('pagination');
    });
  });
});
```

### Mocks

```typescript
// Mocker la DB
jest.mock('../config/database', () => ({
  query: jest.fn(),
}));

// Mocker un service
jest.spyOn(deploymentService, 'startDeployment').mockResolvedValue({});
```

---

## Performance

### Requêtes lentes ?

- Pagination obligatoire sur tous les list endpoints
- Index sur `(site_id, date)` pour analytics
- Agrégation quotidienne via cron (pas de calcul temps réel)

### Mémoire ?

- PDF streaming avec PDFKit (pas de buffer complet)
- Upload vidéo avec multer (stream vers FTP)
- Pas de `SELECT *` sur grosses tables

### Socket.IO ?

- Ping toutes les 25s, timeout 60s
- Redis adapter en production pour scaling horizontal
- Rooms par site_id pour broadcast ciblé

---

## Déploiement Production

### Central Server (Railway)

Railway déploie automatiquement depuis le repo GitHub. Configuration via variables d'environnement dans le dashboard Railway.

```bash
# Build & Start (configuré dans Railway)
cd central-server && npm install && npm run build
cd central-server && npm start

# Health check endpoint
GET /health
```

### Checklist avant deploy

- [ ] `npm run lint` passe
- [ ] `npm run test:server` passe
- [ ] Variables d'environnement configurées
- [ ] Migration DB exécutée si nécessaire
- [ ] Backup DB si migration destructive

---

## Diagrammes de Séquence

### Authentification (Login)

```
┌────────┐     ┌─────────┐     ┌──────────┐     ┌────────┐
│ Client │     │ Express │     │   Auth   │     │   DB   │
└───┬────┘     └────┬────┘     └────┬─────┘     └───┬────┘
    │               │               │               │
    │ POST /login   │               │               │
    │──────────────>│               │               │
    │               │ validate()    │               │
    │               │──────────────>│               │
    │               │               │ SELECT user   │
    │               │               │──────────────>│
    │               │               │<──────────────│
    │               │               │ bcrypt.compare│
    │               │               │───────┐       │
    │               │               │<──────┘       │
    │               │               │ jwt.sign()    │
    │               │<──────────────│               │
    │ Set-Cookie    │               │               │
    │<──────────────│               │               │
    │ { user }      │               │               │
    │<──────────────│               │               │
```

### Déploiement Vidéo

```
┌──────────┐   ┌─────────┐   ┌────────────┐   ┌──────────┐   ┌─────┐
│ Dashboard│   │   API   │   │ Deployment │   │ Socket.IO│   │ Pi  │
└────┬─────┘   └────┬────┘   └─────┬──────┘   └────┬─────┘   └──┬──┘
     │              │              │               │            │
     │ POST /deploy │              │               │            │
     │─────────────>│              │               │            │
     │              │ create record│               │            │
     │              │─────────────>│               │            │
     │ 202 Accepted │              │               │            │
     │<─────────────│              │               │            │
     │              │              │ getTargets()  │            │
     │              │              │───────┐       │            │
     │              │              │<──────┘       │            │
     │              │              │               │            │
     │              │              │ emit('deploy')│            │
     │              │              │──────────────>│            │
     │              │              │               │ deploy_video
     │              │              │               │───────────>│
     │              │              │               │            │
     │              │              │               │  download  │
     │              │              │               │<───────────│
     │              │              │               │            │
     │              │              │               │  progress  │
     │              │              │<──────────────│────────────│
     │              │              │ updateProgress│            │
     │              │              │───────┐       │            │
     │ SSE progress │              │<──────┘       │            │
     │<─────────────│──────────────│               │            │
     │              │              │               │  complete  │
     │              │              │<──────────────│────────────│
     │ SSE complete │              │               │            │
     │<─────────────│──────────────│               │            │
```

### Heartbeat & Sync Pi

```
┌─────┐          ┌──────────┐          ┌─────────┐          ┌────────┐
│ Pi  │          │ Socket.IO│          │ Metrics │          │   DB   │
└──┬──┘          └────┬─────┘          └────┬────┘          └───┬────┘
   │                  │                     │                   │
   │ 'register'       │                     │                   │
   │ {siteId, apiKey} │                     │                   │
   │─────────────────>│                     │                   │
   │                  │ validate apiKey     │                   │
   │                  │────────────────────────────────────────>│
   │                  │<────────────────────────────────────────│
   │                  │ join room(siteId)   │                   │
   │ 'registered' ✓   │                     │                   │
   │<─────────────────│                     │                   │
   │                  │                     │                   │
   │ ┌────────────────────────────────────────────────────────┐ │
   │ │                    EVERY 30 SECONDS                    │ │
   │ └────────────────────────────────────────────────────────┘ │
   │ 'heartbeat'      │                     │                   │
   │ {metrics}        │                     │                   │
   │─────────────────>│                     │                   │
   │                  │ recordMetrics()     │                   │
   │                  │────────────────────>│                   │
   │                  │                     │ INSERT metrics    │
   │                  │                     │──────────────────>│
   │                  │ UPDATE last_seen    │                   │
   │                  │────────────────────────────────────────>│
   │                  │                     │                   │
   │                  │ checkPendingConfig  │                   │
   │                  │────────────────────────────────────────>│
   │                  │<────────────────────────────────────────│
   │ 'update_config'  │ (if pending)        │                   │
   │<─────────────────│                     │                   │
```

---

## Requêtes SQL Utiles

Voir **[docs/technical/SQL_QUERIES.md](docs/technical/SQL_QUERIES.md)** pour les requêtes courantes :

- Sites avec métriques récentes
- Santé de la flotte
- Analytics et top vidéos
- Déploiements en échec
- Reset MFA utilisateur

---

## Sécurité

### Principes OWASP appliqués

| Risque             | Protection              | Implémentation                                 |
| ------------------ | ----------------------- | ---------------------------------------------- |
| **SQL Injection**  | Requêtes paramétrées    | `query('SELECT * FROM x WHERE id = $1', [id])` |
| **XSS**            | Sanitization Angular    | `DomSanitizer` + échappement auto              |
| **CSRF**           | Cookie SameSite + token | `sameSite: 'strict'` sur JWT cookie            |
| **Broken Auth**    | JWT HttpOnly + MFA      | Cookie non-accessible JS, 2FA optionnel        |
| **Sensitive Data** | Chiffrement + hashing   | bcrypt pour passwords, TLS en transit          |
| **Broken Access**  | RLS + middleware        | Row-Level Security PostgreSQL                  |

### Fichiers sensibles (ne jamais commit)

```
.env                    # Variables d'environnement
*.pem, *.key           # Certificats SSL
credentials.json       # Service accounts
```

### Fichiers critiques (review obligatoire)

| Fichier              | Risque si modifié          |
| -------------------- | -------------------------- |
| `middleware/auth.ts` | Bypass authentification    |
| `config/database.ts` | Fuite de connexion DB      |
| `socket.service.ts`  | Compromission protocole Pi |
| `setup-new-club.sh`  | Backdoor sur Pi            |

### Validation des inputs

```typescript
// TOUJOURS valider avec Joi AVANT traitement
const schema = Joi.object({
  email: Joi.string().email().required(),
  siteId: Joi.string().uuid().required(),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
```

### Audit et logs

- Toutes les actions admin sont loggées dans `audit_logs`
- Correlation ID sur chaque requête pour traçabilité
- Logs sensibles (passwords, tokens) jamais loggés

---

## Troubleshooting Avancé

### Par Service

#### Socket.IO (socket.service.ts)

| Symptôme                | Cause probable      | Solution                        |
| ----------------------- | ------------------- | ------------------------------- |
| Pi ne se connecte pas   | API key invalide    | Vérifier `sites.api_key` en DB  |
| Déconnexions fréquentes | Timeout trop court  | Augmenter `pingTimeout` (60s)   |
| Messages perdus         | Redis non configuré | Ajouter `REDIS_URL` en prod     |
| "Transport close"       | Proxy/firewall      | Vérifier WebSocket pass-through |

```bash
# Debug connexions Socket.IO
DEBUG=socket.io* npm run dev

# Lister les rooms actives
curl http://localhost:3001/api/admin/socket-rooms
```

#### Deployment (deployment.service.ts)

**Architecture** : Utilise `commandQueueService.sendOrQueue()` pour gérer les sites offline/online (même pattern que `update_config` et `update_software`).

| État site   | Comportement                                          | Feedback dashboard                  |
| ----------- | ----------------------------------------------------- | ----------------------------------- |
| **Online**  | Commande envoyée immédiatement                        | "Envoyé: Site A"                    |
| **Offline** | Commande mise en queue, envoyée auto à la reconnexion | "En attente de reconnexion: Site B" |

| Symptôme            | Cause probable        | Solution                         |
| ------------------- | --------------------- | -------------------------------- |
| Stuck "in_progress" | Pi déconnecté pendant | Reset manuel (voir SQL)          |
| 0% progress         | FTP inaccessible      | Vérifier `FTP_HOST` connectivity |
| Échec checksum      | Fichier corrompu      | Re-upload la vidéo               |
| Timeout             | Fichier trop gros     | Augmenter timeout, compresser    |

```bash
# Forcer retry d'un déploiement
curl -X POST http://localhost:3001/api/admin/deployments/UUID/retry

# Voir les déploiements actifs
curl http://localhost:3001/api/content/deployments?status=in_progress
```

#### Auth (auth.ts middleware)

| Symptôme         | Cause probable       | Solution                   |
| ---------------- | -------------------- | -------------------------- |
| 401 constant     | Cookie expiré        | Logout/login               |
| CORS cookie fail | sameSite config      | Vérifier `ALLOWED_ORIGINS` |
| Token invalid    | JWT_SECRET changé    | Tous re-login              |
| MFA loop         | Backup codes épuisés | Reset MFA en DB            |

```sql
-- Reset MFA pour un user
UPDATE users SET
  mfa_enabled = false,
  mfa_secret = NULL,
  mfa_backup_codes = NULL
WHERE email = 'user@example.com';
```

#### Cron (cron-scheduler.service.ts)

| Symptôme            | Cause probable   | Solution                    |
| ------------------- | ---------------- | --------------------------- |
| Stats pas calculées | Cron pas démarré | Vérifier logs au boot       |
| Données manquantes  | Timezone issue   | Forcer UTC en DB            |
| Lenteur             | Trop de données  | Ajouter index, partitionner |

```bash
# Forcer calcul stats manuellement
curl -X POST http://localhost:3001/api/admin/cron/daily-stats

# Voir dernier run
curl http://localhost:3001/api/admin/cron/status
```

#### FTP/Storage

| Symptôme            | Cause probable     | Solution                    |
| ------------------- | ------------------ | --------------------------- |
| Upload timeout      | Connexion lente    | Réduire taille fichier      |
| Permission denied   | User FTP incorrect | Vérifier credentials        |
| Fichier introuvable | Path incorrect     | Vérifier `FTP_PUBLIC_URL`   |
| Fallback Supabase   | FTP down           | Check `SUPABASE_URL` config |

```bash
# Test connexion FTP
curl -v ftp://FTP_HOST --user FTP_USER:FTP_PASSWORD

# Lister fichiers
curl ftp://FTP_HOST/videos/ --user FTP_USER:FTP_PASSWORD
```

#### Sync-Agent (Raspberry Pi)

| Symptôme                 | Cause probable           | Solution                                             |
| ------------------------ | ------------------------ | ---------------------------------------------------- |
| EACCES permission denied | Mauvais ownership webapp | `sudo chown -R pi:pi /home/pi/neopro/webapp`         |
| Config update failed     | Backup impossible        | Vérifier permissions sur `configuration.backup.json` |
| Command not executed     | Sync-agent déconnecté    | `sudo systemctl restart neopro-sync-agent`           |
| No entries in logs       | Mauvais nom de service   | Utiliser `neopro-sync-agent` (pas `neopro-sync`)     |
| "Connexion instable"     | Connexion zombie         | Mettre à jour vers v2.15+ ou restart sync-agent      |
| Analytics send timeout   | Buffer trop gros (>1000) | Mettre à jour vers v2.15+ (envoi par batches)        |
| Erreur log vide après :  | Bug format Winston       | Mettre à jour vers v2.15+ (logging corrigé)          |

**Connexions zombies (v2.15+)** :

Le sync-agent peut avoir une connexion "zombie" : le flag `this.connected = true` mais la socket WebSocket est morte (`this.socket.connected = false`). Les heartbeats sont alors envoyés dans le vide.

**Symptômes** :

- Dashboard affiche "Connexion instable" (orange) malgré un `secondsSinceLastSeen` faible
- API `/dashboard` retourne `health.socketInMap = false` et `health.reason = "not_in_map"`
- Logs Pi : pas d'événement `Disconnected` après le dernier `Connected`

**Diagnostic** :

```bash
# Vérifier si le fix est actif (v2.15+)
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 20 | grep "health check"'
# Doit afficher : "Starting connection health check"
```

**Solution immédiate** :

```bash
sudo systemctl restart neopro-sync-agent
```

**Solution permanente** (v2.15+) :
Le fichier `sync-agent/src/agent.js` inclut maintenant :

1. Vérification `socket.connected` dans `sendHeartbeat()` avant envoi
2. Détection zombie dans `handlePingCheck()` si ping reçu mais socket morte
3. Health check périodique (60s) qui vérifie la cohérence flag/socket

**Voir aussi** : [TROUBLESHOOTING.md - Connexion instable](docs/guides/TROUBLESHOOTING.md#le-site-affiche-connexion-instable-alors-quil-est-connecté)

**Timeout analytics (v2.15+)** :

Si le buffer analytics n'a pas été vidé pendant longtemps (Pi hors ligne, bug), il peut accumuler des milliers d'événements. L'envoi de tout le buffer d'un coup dépasse alors le timeout de 10s.

**Symptômes** :

- Logs : `Failed to send analytics to server: timeout of 10000ms exceeded`
- Buffer qui ne se vide jamais (vérifier avec `cat /home/pi/neopro/data/analytics_buffer.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"`)

**Solution (v2.15+)** :

Le sync-agent envoie maintenant les analytics par batches de 100 événements avec :

- Timeout de 15s par batch
- Pause de 500ms entre batches
- Sauvegarde progressive après chaque batch réussi

```bash
# Vérifier la taille du buffer
ssh pi@neopro.local 'cat /home/pi/neopro/data/analytics_buffer.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"'

# Mettre à jour le fichier analytics.js
scp raspberry/sync-agent/src/analytics.js pi@neopro.local:/home/pi/neopro/sync-agent/src/

# Redémarrer pour envoyer
ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
```

```bash
# Voir les logs du sync-agent
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 100 --no-pager'

# Suivre en temps réel
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -f'

# Corriger les permissions webapp
ssh pi@neopro.local 'sudo chown -R pi:pi /home/pi/neopro/webapp && sudo usermod -a -G pi www-data'

# Vérifier la configuration
ssh pi@neopro.local 'cat /home/pi/neopro/webapp/configuration.json | head -50'

# Lister les services neopro
ssh pi@neopro.local 'systemctl list-units --type=service | grep neopro'
```

#### Kiosk/TV (Chromium)

| Symptôme                      | Cause probable                                   | Solution                                                              |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| "Aw, Snap! Error code: 5"     | **gpu_mem trop faible**                          | Vérifier `vcgencmd get_mem gpu`, configurer 256M                      |
| Crash après 2h de boucle      | Mémoire GPU saturée                              | Augmenter gpu_mem, watchdog kiosk actif                               |
| Écran blanc après crash       | Chromium bloqué sur erreur                       | Le watchdog devrait récupérer automatiquement                         |
| Crash fréquents (>3 en 5 min) | Vidéo corrompue ou GPU mort                      | Vérifier les vidéos, température Pi                                   |
| "gpu=4M" au lieu de 128M+     | Config `/boot/config.txt`                        | Ajouter `gpu_mem=256` et reboot                                       |
| Vidéos lentes/dégradées Pi 5  | Flags GPU custom désactivent le driver V3D natif | Supprimer les flags GPU, laisser Chromium utiliser V3D Mesa (v3.7.3+) |

**Diagnostic GPU** :

```bash
# Vérifier mémoire GPU allouée (CRITIQUE - doit être 128M minimum, 256M recommandé)
vcgencmd get_mem gpu
# Si affiche "gpu=4M" → PROBLÈME, doit être au moins 128M

# Vérifier température
vcgencmd measure_temp
# Normal: < 70°C, Alerte: > 80°C

# Vérifier état GPU
vcgencmd get_throttled
# 0x0 = OK, autre valeur = throttling actif
```

**Fix gpu_mem (cause racine la plus fréquente)** :

```bash
# Sur le Pi, éditer la config boot
sudo nano /boot/config.txt
# OU sur Pi 5:
sudo nano /boot/firmware/config.txt

# Ajouter ou modifier :
gpu_mem=256

# Sauvegarder et redémarrer
sudo reboot

# Vérifier après reboot
vcgencmd get_mem gpu
# Doit afficher : gpu=256M
```

**Note** : Le script `install.sh` configure maintenant automatiquement `gpu_mem=256` pour les nouvelles installations.

---

## Historique Breaking Changes

### v3.7.8 (Février 2026)

- **Fix flash noir/blanc entre vidéos sur Chromium/Pi** : Élimination des flashs noirs (boucle) et blancs (vidéo manuelle) lors des transitions
  - **Problème** : Un écran noir apparaissait brièvement (~200-500ms) entre chaque vidéo de la boucle, et un flash blanc apparaissait au lancement d'une vidéo manuelle sur la TV (Chromium kiosk sur Raspberry Pi).
  - **Cause racine flash noir (boucle)** :
    - (commit 1) Aucun mécanisme de freeze-frame n'était utilisé lors des transitions de boucle
    - (commit 2) Sur Chromium/Pi, le frame buffer est **libéré à `ended`** → capture noir
    - (commit 3) `setPlayerVisible()` mettait les deux players au même z-index (`1`) pendant la transition, et `hideFreezeFrame()` invalidait le flag `hasValidLastFrame` créant un gap sans frame valide
  - **Cause racine flash blanc (vidéo manuelle)** :
    - Le player manuel était rendu visible (opacity 1) **avant** que la vidéo soit chargée et prête à jouer. Le `<video>` sans source affiche un fond blanc/transparent sur Chromium/Pi.
  - **Solution flash noir** :
    - `setPlayerVisible()` : z-index `2` pour le nouveau player (au-dessus de l'ancien à `1`) pendant la transition, ramené à `1` après
    - `hideFreezeFrame()` : ne reset plus `hasValidLastFrame` — la capture périodique continue de fournir des frames valides sans interruption
    - `switchPlayers()` : délai augmenté de 100ms à 150ms pour le décodeur V3D
  - **Solution flash blanc** :
    - `play()` (vidéo manuelle) : le player reste à opacity `0` pendant le chargement
    - Après `play()` + 2×`requestAnimationFrame` + 200ms, le player est rendu visible puis le freeze-frame est caché
    - Le freeze-frame + black overlay masquent tout pendant le chargement
  - **Pré-capture périodique** (inchangé depuis v3.7.7) :
    - `startLastFrameCapture()` : Capture le frame courant toutes les 500ms
    - `captureAndShowFreezeFrame()` : Utilise le frame pré-capturé, fallback sur capture live ou black overlay
  - **Résultat** : Transitions sans flash noir NI blanc sur Chromium/Pi ET navigateur desktop
  - **Fichier modifié** : `raspberry/src/app/components/tv/tv.component.ts`
  - **Migration Pi existants** :
    ```bash
    # Rebuild le frontend Angular puis déployer
    npm run build:raspberry
    scp -r dist/raspberry/* pi@neopro.local:/home/pi/neopro/webapp/
    ssh pi@neopro.local 'sudo systemctl restart neopro-kiosk'
    ```

### v3.7.3 (Février 2026)

- **Pi 5 : Suppression des flags GPU custom, utilisation du driver V3D natif** : Les vidéos sont maintenant fluides en mode kiosk
  - **Problème** : Les vidéos étaient saccadées en mode kiosk alors qu'elles étaient fluides dans le navigateur normal sur `neopro.local/tv`
  - **Cause racine** : Les flags GPU ajoutés au mode kiosk (SwiftShader, `--disable-gpu-compositing`) **désactivaient le driver V3D natif (Mesa)** que Chromium utilise par défaut. Le flag `--kiosk` ne change PAS le pipeline de rendu, seulement l'UI (fullscreen). C'étaient nos flags custom qui causaient les saccades.
  - **Historique des tentatives échouées** :
    - SwiftShader (`--use-gl=angle --use-angle=swiftshader --disable-gpu-compositing`) : Rendu CPU via ANGLE, trop lent pour vidéo 1080p
    - EGL natif (`--use-gl=egl --enable-features=Vulkan`) : Erreurs SharedImageStub toutes les 5 secondes
  - **Solution** : Supprimer TOUS les flags GPU custom sur Pi 5. Garder uniquement `--ignore-gpu-blocklist` et `--enable-gpu-rasterization` pour s'assurer que le GPU V3D est bien utilisé. Chromium utilise alors le driver Mesa V3D 7.1 pour le compositing GPU, exactement comme le navigateur normal.
  - **Flags Pi 5 (v3.7.3)** : `--ignore-gpu-blocklist --enable-gpu-rasterization` (plus aucun flag ANGLE/SwiftShader/EGL)
  - **Flags communs** (Pi 4 et Pi 5) : `--disable-dev-shm-usage --disable-checker-imaging`
  - **Note** : Le Pi 5 n'a pas de décodeur H.264 hardware (supprimé), seul H.265/HEVC est accéléré. Le décodage vidéo reste en CPU (FFmpeg) mais le compositing GPU via V3D est suffisamment rapide.
  - **Fichier modifié** : `raspberry/scripts/kiosk-watchdog.sh`
  - **Migration Pi 5 existants** :
    ```bash
    scp raspberry/scripts/kiosk-watchdog.sh pi@<IP>:/home/pi/neopro/scripts/
    ssh pi@<IP> 'sudo systemctl restart neopro-kiosk'
    ```

### v3.7.2 (Février 2026)

- **Pi 5 : Retour a SwiftShader apres echec EGL (SharedImageStub)** : EGL natif cause des erreurs toutes les 5 secondes sur Pi 5
  - **Tentative** : Remplacement de SwiftShader par EGL natif + V4L2 pour ameliorer les performances video
  - **Resultat** : EGL cause des erreurs "SharedImageStub" dans les logs toutes les ~5 secondes sur Pi 5 (VideoCore VII). Ces erreurs polluent les logs et peuvent degrader la stabilite sur de longues sessions
  - **Decision** : Retour a SwiftShader qui est stable, avec ajout de `--disable-gpu-vsync` et `--disable-frame-rate-limit` pour ameliorer la fluidite
  - **Note** : SwiftShader s'est avéré trop lent pour la vidéo 1080p → corrigé en v3.7.3
  - **Fichier modifie** : `raspberry/scripts/kiosk-watchdog.sh`

### v3.7.1 (Février 2026)

- **Fix perte totale des analytics après reboot Pi** : Les données analytics ne sont plus perdues quand le Pi redémarre ou est offline
  - **Problème résolu** : Si le Pi était utilisé offline pendant des jours/semaines puis redémarré, toutes les données analytics de la période étaient perdues
  - **Cause racine** : Chromium lancé avec `--incognito` dans `kiosk-watchdog.sh` rendait le localStorage éphémère. Combiné au flush de 5 minutes, les données en mémoire étaient perdues au moindre redémarrage (reboot, crash, kill -9 du watchdog)
  - **Solution** (3 couches de protection) :
    1. **`--incognito` supprimé** de `kiosk-watchdog.sh` → localStorage persistant entre les redémarrages
    2. **Persistance immédiate** : chaque événement est sauvé dans localStorage ET envoyé au serveur local dès la fin de la vidéo (plus d'attente de 5 minutes)
    3. **Retry 30s** : si le serveur local n'est pas prêt au boot, retry automatique après 30 secondes
  - **Timestamps préservés** : `played_at` est capturé au moment exact de `trackVideoStart()` et traverse toute la chaîne sans modification
  - **Fichiers modifiés** :
    - `raspberry/scripts/kiosk-watchdog.sh` - Suppression du flag `--incognito`
    - `raspberry/src/app/services/analytics.service.ts` - `sendSingleEvent()` + `saveToStorage()` immédiat
    - `raspberry/src/app/services/sponsor-analytics.service.ts` - `sendSingleImpression()` + persistance immédiate
  - **Migration Pi existants** :
    ```bash
    # Copier kiosk-watchdog.sh (supprime --incognito)
    scp raspberry/scripts/kiosk-watchdog.sh pi@neopro.local:/home/pi/neopro/scripts/
    # Rebuild et déployer le frontend Angular, puis :
    ssh pi@neopro.local 'sudo systemctl restart neopro-kiosk'
    ```

- **Fix affichage uptime "0m" dans l'onglet État** : L'uptime s'affiche maintenant correctement
  - **Problème** : L'uptime affichait "0m" dans la section "Métriques actuelles" de l'onglet État, alors que l'onglet Debug affichait la bonne valeur
  - **Cause** : `formatUptime()` traitait la valeur comme des millisecondes (division par 1000) alors que `os.uptime()` retourne des secondes
  - **Fichier modifié** : `central-dashboard/src/app/features/sites/site-detail.component.ts`
  - **Migration** : Rebuild et redéployer le dashboard

### v3.0.0 (Février 2026)

- **Détection HDMI-CEC pour analytics fiables** : Les lectures vidéo ne sont trackées que si la TV est réellement allumée
  - **Problème résolu** : Avant, le Pi enregistrait toutes les lectures même si la TV était éteinte/en veille, gonflant artificiellement les stats (ex: 1200h/jour, 3000 vidéos alors que la TV était débranchée)
  - **Solution** : Utilisation de HDMI-CEC pour détecter l'état de la TV (`on`, `standby`, `disconnected`, `unknown`)
  - **Comportement** :
    - `tv_status = 'on'` : Vidéo trackée (comptée dans les stats)
    - `tv_status = 'standby'` : Vidéo ignorée (TV en veille)
    - `tv_status = 'disconnected'` : Vidéo ignorée (HDMI débranché)
    - `tv_status = 'unknown'` : Vidéo trackée (CEC non disponible, on ne peut pas savoir)
  - **Nouveaux fichiers** :
    - `raspberry/src/app/services/hdmi-status.service.ts` - Service Angular pour surveiller l'état HDMI
    - `central-server/src/scripts/migrations/add-tv-status-analytics.sql` - Migration DB
  - **Fichiers modifiés** :
    - `raspberry/server/server.js` - Nouvel endpoint `/api/hdmi-status` utilisant `cec-client`
    - `raspberry/src/app/services/analytics.service.ts` - Capture `tv_status` et filtre les lectures
    - `central-server/src/controllers/analytics.controller.ts` - Accepte le champ `tv_status`
    - `central-server/src/scripts/full-schema.sql` - Colonne `tv_status` sur `video_plays`
  - **Prérequis Pi** : `cec-client` doit être installé (`sudo apt install cec-utils`)
  - **Migration** :

    ```bash
    # Exécuter la migration SQL sur Supabase
    # Copier le contenu de add-tv-status-analytics.sql

    # Redéployer le central-server, le dashboard, et le sync-agent sur les Pi
    ```

- **Option fond flou automatique pour conversion image → vidéo** : Les images portrait s'affichent maintenant avec un fond esthétique
  - **Fonctionnalité** : Nouvelle option "✨ Fond flou automatique" dans le modal de conversion image
  - **Prévisualisation live** : L'aperçu montre en temps réel l'effet du fond flou avant conversion
  - **Rendu** : L'image est superposée sur une version floue d'elle-même (effet blur 25px)
  - **Paramètre API** : `blurBackground: boolean` ajouté à `POST /api/content/image-to-video`
  - **Fichiers modifiés** :
    - `central-server/src/services/image-to-video.service.ts` - Option `blurBackground` + filtre ffmpeg `filter_complex`
    - `central-server/src/controllers/content.controller.ts` - Récupération paramètre `blurBackground`
    - `central-dashboard/.../content-management.component.ts` - Checkbox + prévisualisation CSS avec effet blur
  - **Migration** : Rebuild et redéployer le dashboard et le central-server

- **Suppression des pages Analytics Dashboard** : Simplification majeure de l'interface (BREAKING CHANGE)
  - **Raison** : Les métriques affichées étaient incohérentes et potentiellement trompeuses
    - "Temps de diffusion" = somme des durées vidéo × lectures (pas le temps écran réel)
    - "Taux de complétion" = toujours 100% (bug : `video_duration = duration_played`)
    - "Disponibilité" = mesure la connexion cloud, pas l'usage TV
    - Spikes de données lors du vidage de buffers accumulés (Pi offline)
  - **Pages supprimées** :
    - `/analytics` (vue d'ensemble)
    - `/analytics/comparison` (comparaison multi-sites)
    - `/analytics/realtime` (dashboard temps réel)
    - `/sites/:id/analytics` (analytics par club)
    - `/admin/analytics-categories` (catégories analytics)
    - `/advertisers/:id/analytics` (analytics annonceur)
  - **Fichiers supprimés** :
    - `central-dashboard/src/app/features/analytics/` (tout le dossier)
    - `central-dashboard/src/app/features/admin/analytics-categories/`
  - **Fichiers modifiés** :
    - `app.routes.ts` - Routes supprimées
    - `layout.component.ts` - Liens navigation supprimés
    - `site-detail.component.ts` - Bouton Analytics supprimé
    - `sites-list.component.ts` - Badge usage renommé "En veille" (gris) au lieu de "Inactif" (rouge)
  - **Ce qui reste** (essentiel) :
    - Statut connexion (online/offline/warning) dans site-detail
    - Métriques système (CPU, RAM, température, disque) dans l'onglet État
    - Alertes système
    - **Services backend conservés** (pour billing et futurs besoins) :
      - `realtime-stats.service.ts` - Stats temps réel via Socket.IO
      - `excel-export.service.ts` - Export Excel multi-feuilles
      - `billing.service.ts` - Données de facturation par mois
  - **Migration** : Rebuild et redéployer le dashboard

- **Amélioration UX badges liste sites** : Labels plus clairs pour l'activité
  - **Changements** :
    - "Inactif" → "En veille" (couleur gris neutre `#f1f5f9` au lieu de rouge `#fee2e2`)
    - "Faible" → "Peu actif"
    - "Moyen" → "Actif"
    - "Actif" → "Très actif"
  - **Tooltip amélioré** : "Aucune lecture sur les 30 derniers jours (pas de match ?)"
  - **Impact** : Évite la confusion entre connexion (Connecté) et usage (En veille)

- **Fix rafraîchissement après suspension/réactivation** : L'interface se met maintenant à jour correctement
  - **Problème** : L'en-tête affichait "Abonnement Actif" même après suspension car le parent ne rechargait pas les données
  - **Cause** : Le composant `site-subscription-tab` utilisait `window.dispatchEvent()` au lieu d'un `@Output()` Angular
  - **Solution** : Ajout de `@Output() subscriptionChanged = new EventEmitter<void>()` et remplacement des 4 `window.dispatchEvent()` par `this.subscriptionChanged.emit()`
  - **Fichier modifié** : `central-dashboard/.../site-subscription-tab.component.ts`
  - **Migration** : Rebuild et redéployer le dashboard

- **Correction valeurs auto_unblock des motifs de suspension** : Les motifs "maintenance", "abuse", etc. ne débloquent plus automatiquement
  - **Problème** : Un site suspendu pour "Maintenance" était automatiquement réactivé au prochain heartbeat car `auto_unblock = true`
  - **Solution** : Correction en base de données des valeurs `auto_unblock`
  - **Motifs avec auto_unblock = true** (déblocage automatique si abonnement renouvelé) :
    - `unpaid`, `expired`, `trial_ended`
  - **Motifs avec auto_unblock = false** (réactivation manuelle requise) :
    - `maintenance`, `abuse`, `request`, `hardware`, `connection`
  - **Migration SQL** :
    ```sql
    UPDATE subscription_suspension_reasons SET auto_unblock = false
    WHERE code IN ('maintenance', 'abuse', 'request', 'hardware', 'connection');
    ```

- **Alertes Prédictives (Phase 3.1)** : Système d'alertes proactives détectant les problèmes AVANT qu'ils surviennent
  - **Métriques prédictives évaluées** (8 au total) :
    - `days_since_last_video` : Détecte l'inactivité prolongée des clubs (warning > 7j, critical > 14j)
    - `disk_growth_rate` : Prédit quand le disque sera plein (warning > 5%/h, critical > 10%/h)
    - `disconnections_24h` : Identifie les connexions instables (warning > 5, critical > 10)
    - `wifi_signal_quality` : Détecte la dégradation du signal (warning < 50%, critical < 25%)
    - `video_errors_24h` : Identifie les problèmes de lecture (warning > 5, critical > 15)
    - `temperature_trend` : Détecte les surchauffes progressives (warning > 5°C/h, critical > 10°C/h)
    - `hotspot_restarts_24h` : Identifie les problèmes de hotspot (warning > 2, critical > 5)
    - `days_until_subscription_end` : Alerte sur les abonnements expirant (warning < 30j, critical < 7j)
  - **Architecture** :
    - Service `predictive-alerts.service.ts` exécute des vérifications toutes les heures
    - Requête SQL complexe agrège les données depuis `metrics`, `video_plays`, `remote_commands`, `alerts`
    - Utilise `alertingService.evaluateMetric()` pour générer les alertes
  - **Endpoints API** :
    - `GET /api/alerts?type=predictive&active=true` : Liste les alertes prédictives actives
    - `GET /api/alerts/stats` : Statistiques des alertes (par sévérité, type, site)
    - `POST /api/alerts/:id/resolve` : Résout une alerte
    - `GET /api/admin/predictive-alerts/status` : Statut du service
    - `POST /api/admin/predictive-alerts/run` : Déclenche une vérification immédiate
  - **UI Dashboard** :
    - Section "🔮 Alertes prédictives" sur le dashboard principal avec liste des alertes actives
    - Badges colorés (🟡 warning, 🔴 critical) avec temps relatif
  - **Nouveaux fichiers** :
    - `central-server/src/services/predictive-alerts.service.ts`
    - `central-server/src/controllers/alerts.controller.ts`
    - `central-server/src/routes/alerts.routes.ts`
  - **Migration** : Redéployer le central-server et le dashboard

- **Benchmark Anonymisé (Phase 3.2)** : Comparaison des performances entre clubs similaires
  - **Principe** : Permet aux clubs de se comparer sans révéler l'identité des autres
  - **Métriques comparées** :
    - Sessions par mois
    - Vidéos jouées par session
    - Durée moyenne des sessions
    - Disponibilité (uptime)
    - Total vidéos jouées
  - **Segmentation** :
    - Par sport (football, basketball, handball, etc.)
    - Par région
    - Par taille de club (small < 5 sessions/mois, medium 5-15, large > 15)
  - **Statistiques fournies** :
    - Valeur du club
    - Percentile (position relative)
    - Moyenne, médiane, min, max de la distribution
    - Taille de l'échantillon (minimum 3 clubs pour un benchmark significatif)
  - **Endpoints API** :
    - `GET /api/benchmark/sites/:siteId` : Benchmark pour un site
    - `GET /api/benchmark/global` : Résumé global (admin)
    - `GET /api/benchmark/compare?siteIds=...` : Comparaison multi-sites (admin)
  - **UI Dashboard** :
    - Composant `SiteBenchmarkComponent` dans l'onglet État du site-detail
    - Visualisation avec barres de progression colorées et percentiles
  - **Nouveaux fichiers** :
    - `central-server/src/services/benchmark.service.ts`
    - `central-server/src/controllers/benchmark.controller.ts`
    - `central-server/src/routes/benchmark.routes.ts`
    - `central-dashboard/.../site-benchmark/site-benchmark.component.ts`
  - **Migration** : Redéployer le central-server et le dashboard

- **Fix alertes prédictives non créées** : Le service d'alerting n'était pas initialisé au démarrage
  - **Problème** : Aucune alerte prédictive n'apparaissait dans le dashboard malgré le code en place
  - **Cause racine** : `alertingService.initialize()` n'était jamais appelé dans `server.ts`
    - La table `alert_thresholds` restait vide (seuils par défaut non chargés)
    - `predictiveAlertsService` appelait `alertingService.evaluateMetric()` qui ne trouvait aucun seuil → aucune alerte créée
  - **Solution** : Ajout de `await alertingService.initialize()` au démarrage du serveur
    - Crée la table `alert_thresholds` si inexistante
    - Charge les 14 seuils par défaut (6 réactifs + 8 prédictifs)
    - Démarre le check périodique d'escalade
  - **Fichier modifié** : `central-server/src/server.ts`
  - **Migration** : Redéployer le central-server sur Railway

- **Carte géographique des sites** : Visualisation des sites sur une carte interactive Leaflet
  - **Fonctionnalité** : Vue carte alternative à la liste des sites avec toggle grille/carte
  - **Marqueurs colorés** : Vert (online), Rouge (offline), Orange (warning/connexion instable)
  - **Popups** : Affichent nom du club, sport, dernière vue, lien vers le détail
  - **Légende** : Aide à comprendre les différents statuts de connexion
  - **Liste des sites sans coordonnées** : Affichés en bas avec suggestion de compléter les informations
  - **Nouveaux fichiers** :
    - `central-dashboard/src/app/features/sites/components/sites-map/sites-map.component.ts`
  - **Fichiers modifiés** :
    - `central-dashboard/src/styles.css` - Import CSS Leaflet
    - `central-dashboard/.../sites-list.component.ts` - Toggle grille/carte, intégration SitesMapComponent
  - **Migration** : Rebuild et redéployer le dashboard

- **Estimation audience dans les rapports PDF** : L'audience estimée des matchs est maintenant incluse dans les rapports de club
  - **Données affichées** :
    - Audience totale (somme des estimations de tous les matchs)
    - Audience moyenne par session
  - **Source** : Colonne `audience_estimate` de la table `club_sessions`, saisie via la télécommande
  - **Intégration** :
    - Nouvelle KPI "👥 Audience estimée" dans la section KPI du rapport PDF
    - Mention dans la section "Points forts" si l'audience est significative
  - **Fichiers modifiés** :
    - `central-server/src/services/pdf-report.service.ts` - Query SQL étendue, KPI et highlights
  - **Migration** : Redéployer le central-server

- **Suppression des captures d'écran automatiques (Proof of Broadcast)** : Fonctionnalité retirée car inutile
  - **Raison** : La fonctionnalité n'apportait pas de valeur ajoutée aux utilisateurs
  - **Fichiers supprimés** :
    - `central-server/src/services/proof.service.ts`
    - `central-server/src/routes/proof.routes.ts`
    - `central-server/src/controllers/proof.controller.ts`
    - `central-dashboard/src/app/core/services/proof.service.ts`
    - `raspberry/sync-agent/src/commands/capture-proof.js`
  - **Fichiers modifiés** :
    - `central-server/src/server.ts` - Suppression route `/api/proofs`
    - `central-dashboard/.../site-detail.component.ts` - Suppression section "Preuves de Diffusion", modal, méthodes et styles associés
    - `raspberry/sync-agent/src/commands/index.js` - Suppression commande `capture_proof`
    - `raspberry/sync-agent/src/config.js` - Suppression de la liste des commandes autorisées
  - **Migration** : Rebuild dashboard et server, redéployer sync-agent sur les Pi
  - **Note** : La table `proof_of_broadcasts` en DB reste mais n'est plus utilisée

### v2.48.x (Février 2026)

- **Fix envoi massif impressions sponsors** : Correction du bug qui empêchait les analytics de remonter
  - **Problème** : Le Pi NLF avait 50K impressions bloquées, l'envoi en une fois causait HTTP 500 puis rate limit 429
  - **Cause racine** : Pas de batching côté Pi + rate limit trop restrictif côté serveur (100 req/min partagé)
  - **Solution** :
    - Ajout du batching dans `sponsor-impressions.js` : `BATCH_SIZE=200`, `BATCH_DELAY=2500ms`
    - Nouveau rate limit dédié `piAnalyticsRateLimit` (500 req/min) pour `/api/analytics/impressions`
  - **Scalabilité 100 Pi** : Avec ces paramètres, ~20 Pi peuvent vider un backlog simultanément
  - **Fichiers modifiés** :
    - `raspberry/sync-agent/src/sponsor-impressions.js` - Batching avec délai entre envois
    - `central-server/src/middleware/user-rate-limit.ts` - Nouveau `piAnalyticsRateLimit`
    - `central-server/src/routes/advertiser-analytics.routes.ts` - Application du rate limit dédié
  - **Migration** : Redéployer le central-server sur Railway, copier `sponsor-impressions.js` sur les Pi avec backlog

### v2.47.x (Janvier 2026)

- **Système d'Abonnement Complet** : Gestion des licences, expiration et blocage des sites
  - **Fonctionnalités** :
    - Date d'expiration par site avec statuts (active, expiring_soon, grace_period, blocked, suspended)
    - Suspension manuelle avec motifs (impayé, abus, maintenance, demande client, etc.)
    - Cache licence sur le Pi (validité 7 jours) avec grace period de 7 jours
    - Blocage `/tv` et `/remote` après expiration ou suspension
    - Auto-déblocage quand l'abonnement est renouvelé
    - Interface de gestion complète dans le dashboard
  - **Nouvelles tables DB** :
    - `subscription_suspension_reasons` : Motifs de suspension avec messages TV/Remote
    - `subscription_history` : Historique des changements d'abonnement
    - Vue `subscription_status_summary` pour les requêtes agrégées
    - Vue `subscription_stats` pour les statistiques globales
  - **Nouvelles colonnes sur `sites`** :
    - `subscription_start`, `subscription_end`, `subscription_plan`
    - `suspended`, `suspension_reason`, `suspension_date`, `suspension_note`
  - **Nouveaux fichiers** :
    - `central-server/src/services/subscription.service.ts` - Calcul licence, prolongation, suspension
    - `central-server/src/controllers/subscription.controller.ts` - API REST
    - `central-server/src/routes/subscription.routes.ts` - Routes `/api/subscriptions/*`
    - `central-dashboard/.../subscriptions-management.component.ts` - Page `/subscriptions`
    - `raspberry/sync-agent/src/license-cache.js` - Cache licence local
    - `raspberry/src/app/services/license.service.ts` - Service Angular licence
    - `raspberry/src/app/components/license-block/` - Écran de blocage TV
    - `raspberry/src/app/components/license-banner/` - Bannière d'avertissement Remote
  - **Nouveaux types TypeScript** :
    - `SubscriptionPlan` : 'trial' | 'standard' | 'premium'
    - `SuspensionReason` : 'unpaid' | 'expired' | 'abuse' | etc.
    - `LicenseStatus` : 'VALID' | 'WARNING' | 'GRACE_PERIOD' | 'CONNECTION_WARNING' | 'BLOCKED'
    - `SiteSubscriptionInfo` : Type minimal pour le calcul de licence
    - `SiteWithSubscription` : Site avec toutes les infos d'abonnement
  - **Événements Socket.IO** :
    - `license_status` : Envoyé au Pi après chaque `sync_local_state`
  - **Migration** :

    ```bash
    # Exécuter la migration SQL
    psql $DATABASE_URL -f central-server/src/scripts/migrations/add-subscription-system.sql

    # Redéployer central-server, dashboard, et sync-agent sur les Pi
    ```

  - **Documentation** : Voir le plan complet dans `.claude/plans/linked-spinning-narwhal.md`

- **Design cohérent page Abonnements** : Refonte du design de la page `/subscriptions` pour être cohérent avec le dashboard
  - **Problème résolu** : Le design gradient/glassmorphism (violet #667eea → #764ba2) n'était pas cohérent avec le style flat du dashboard
  - **Changements appliqués** :
    - Couleur primaire : bleu `#2563eb` (aligné sur `site-detail.component.ts`)
    - Tabs : style underline avec `border-bottom` au lieu de pills
    - Cards : fond blanc, `border-radius: 12px`, ombre subtile `0 1px 3px rgba(0,0,0,0.1)`
    - Boutons : flat, sans gradients ni effets glow
    - Modals : standards, sans glassmorphism ni backdrop-filter
  - **Design system respecté** : Mêmes patterns que `site-detail`, `sites-list`, `content-management`
  - **Fichier modifié** : `central-dashboard/.../subscriptions-management.component.ts` - CSS inline refactorisé
  - **Migration** : Rebuild et redéployer le dashboard

- **Modal "Configurer l'abonnement"** : Permet de définir date début, date fin et plan en une seule opération
  - **Problème résolu** : Le modal "Prolonger" ne permettait que de modifier la date de fin
  - **Nouvel endpoint** : `PUT /api/sites/:id/subscription` avec `subscription_start`, `subscription_end`, `subscription_plan`, `note`
  - **Interface** : Bouton ⚙️ remplace 📅, formulaire avec plan (dropdown), dates (pickers), raccourcis (+1/3/6/12 mois)
  - **Fichiers modifiés** :
    - `central-server/src/services/subscription.service.ts` - Méthode `updateSubscription()`
    - `central-server/src/controllers/subscription.controller.ts` - Contrôleur `updateSubscription`
    - `central-server/src/routes/subscription.routes.ts` - Route `PUT /`
    - `central-server/src/services/audit.service.ts` - Action `SUBSCRIPTION_UPDATED`
    - `central-server/src/types/index.ts` - Action `created` dans `SubscriptionAction`
    - `central-dashboard/.../subscription.service.ts` - Méthode `updateSubscription()`
    - `central-dashboard/.../subscriptions-management.component.ts` - Modal et formulaire
    - `central-dashboard/src/app/core/models/index.ts` - Interface `UpdateSubscriptionRequest`
  - **Migration** : Aucune (ajout de fonctionnalité)

### v2.46.x (Janvier 2026)

- **Fix conversion image-to-video sur Railway** : La fonctionnalité de conversion image→vidéo fonctionne maintenant sur Railway
  - **Problème** : La conversion échouait avec "ffmpeg exited with code null" (OOM kill)
  - **Causes identifiées** :
    1. ffmpeg n'était pas installé dans le Dockerfile (uniquement dans nixpacks.toml)
    2. Le package `ffmpeg` d'Alpine n'inclut pas libx264 par défaut (licence GPL)
    3. Les paramètres d'encodage consommaient trop de mémoire pour Railway Hobby plan
  - **Solutions appliquées** :
    - Ajout de ffmpeg dans le Dockerfile avec le repo `edge/community` pour libx264
    - Réduction résolution : 1080p → 720p
    - Preset `ultrafast` au lieu de `medium` (plus rapide, moins de mémoire)
    - Framerate d'entrée 1fps au lieu de 25fps (réduit le buffer)
    - CRF 28 au lieu de 23 (fichier plus petit)
  - **Fichiers modifiés** :
    - `central-server/Dockerfile` - Installation ffmpeg avec libx264
    - `central-server/src/services/image-to-video.service.ts` - Paramètres optimisés pour mémoire limitée
  - **Migration** : Redéployer le central-server sur Railway (rebuild automatique)

### v2.43.x (Janvier 2026)

- **Fix boucle infinie ffprobe (CPU 88% / Température 84°C)** : Le VideoWatcher lançait des dizaines de processus ffprobe en parallèle
  - **Problème** : Le Pi surchauffait (84°C) avec CPU à 88%, causant du throttling. `top` montrait 8+ instances ffprobe simultanées.
  - **Cause racine** : `processDurationQueue()` appelait `onChange()` après chaque extraction, ce qui déclenchait `scanVideos()` → `getDurationForFile()` pour toutes les vidéos, remettant les fichiers sans cache dans la queue. `setImmediate()` lançait des processus parallèles avant que `isExtractingDurations` soit remis à `false`.
  - **Solution** :
    - Suppression de l'appel `onChange()` dans `processDurationQueue()` (les durées sont envoyées au prochain sync régulier, toutes les 30s)
    - Remplacement de `setImmediate()` par `setTimeout(1000)` avec flag `_durationProcessScheduled` anti-doublon
    - Ajout `MAX_QUEUE_SIZE = 50` pour limiter la taille de la queue
    - Ajout `MAX_BATCH_SIZE = 10` pour limiter les extractions par cycle
    - Augmentation des pauses : 500ms entre fichiers, 5s entre batches
  - **Fichier modifié** : `raspberry/sync-agent/src/watchers/video-watcher.js`
  - **Migration Pi existants** :
    ```bash
    # Tuer les ffprobe en cours
    ssh pi@<IP> 'sudo pkill -9 ffprobe'
    # Copier le fix
    scp raspberry/sync-agent/src/watchers/video-watcher.js pi@<IP>:/home/pi/neopro/sync-agent/src/watchers/
    # Redémarrer
    ssh pi@<IP> 'sudo systemctl restart neopro-sync-agent'
    ```

- **Fix conversion image-to-video** : Correction d'un bug CSP empêchant l'aperçu des images
  - **Problème** : L'image sélectionnée ne s'affichait pas dans la prévisualisation avant conversion
  - **Cause** : La directive `img-src` de la CSP n'incluait pas `blob:`, protocole utilisé par `URL.createObjectURL()`
  - **Solution** : Ajout de `blob:` dans `img-src` de `index.html`
  - **Fichier modifié** : `central-dashboard/src/index.html` - CSP img-src avec blob:
  - **Migration** : Rebuild et redéployer le dashboard

- **Bouton accès direct Cloud Remote dans QR Code Generator** : Ajout d'un bouton "Ouvrir" pour accéder directement à la télécommande cloud
  - **Amélioration UX** : Les administrateurs peuvent accéder à la télécommande cloud sans scanner le QR code
  - **Fonctionnalité** : Bouton "↗️ Ouvrir" visible uniquement en mode Cloud, ouvre la remote dans un nouvel onglet
  - **Style** : Dégradé violet/bleu assorti au badge "Mode Cloud"
  - **URL relative** : Utilise `/remote/:siteId` au lieu de l'URL absolue pour préserver les cookies de session
  - **Fichier modifié** : `central-dashboard/src/app/shared/components/qr-code-generator/qr-code-generator.component.ts`
  - **Migration** : Rebuild et redéployer le dashboard

- **Fix Cloud Remote vraiment public (sans authentification)** : Les endpoints `/api/remote/*` ne requièrent plus d'authentification JWT
  - **Problème** : Le scan du QR code Cloud Remote redigeait vers la page de login
  - **Cause racine** : Le contrôleur `remote.controller.ts` vérifiait `req.user` et retournait 401 si non authentifié, malgré la documentation indiquant des routes publiques
  - **Solution** :
    - Suppression des vérifications d'authentification dans les 3 endpoints (`getRemoteState`, `sendRemoteCommand`, `getRemoteVideos`)
    - Suppression de la fonction `verifyUserAccessToSite`
    - Type `Request` au lieu de `AuthRequest`
    - Log de l'IP au lieu du userId pour le tracking des commandes
  - **Sécurité maintenue** :
    - UUID du site (128 bits d'entropie, difficile à deviner)
    - Rate limiting (30 req/min par IP via `sensitiveRateLimit`)
    - Le site doit être online pour recevoir les commandes
  - **Intercepteur Angular** : Exclusion de `/api/remote/` de la redirection vers login en cas de 401
  - **Fichiers modifiés** :
    - `central-server/src/controllers/remote.controller.ts` - Endpoints publics
    - `central-dashboard/src/app/core/interceptors/auth.interceptor.ts` - Exclusion remote
  - **Migration** : Redéployer le central-server (Railway) et le dashboard

- **Prévisualisation vidéo dans Gestion du contenu** : Ajout du bouton 👁️ pour lire les vidéos cloud directement depuis `/content`
  - **Problème** : La page "Gestion du contenu" ne permettait pas de prévisualiser les vidéos avant déploiement
  - **Solution** : Ajout d'un bouton preview et d'un modal avec player vidéo HTML5
  - **Fonctionnalités** :
    - Bouton 👁️ visible si la vidéo a une URL cloud (`video.url`)
    - Modal avec player vidéo (`controls`, `autoplay`)
    - Affichage du titre, taille et durée
    - Bouton "Déployer cette vidéo" directement depuis le modal
  - **Interface Video étendue** : Ajout du champ optionnel `url?: string`
  - **Fichier modifié** : `central-dashboard/src/app/features/content/content-management.component.ts`
  - **Migration** : Rebuild et redéployer le dashboard

- **Nettoyage console logs dashboard** : Suppression de 65+ console.log/warn/error inutiles pour une console production propre
  - **Problème** : La console du navigateur était polluée par des logs de debug, actions utilisateur, et erreurs redondantes
  - **Solution** : Audit complet et suppression des logs non nécessaires, conservation des logs critiques uniquement
  - **Fichiers modifiés** (18 fichiers) :
    - `site-debug-tab.component.ts` - 4 DEBUG logs supprimés
    - `auth.guard.ts` - 5 logs de debug auth supprimés
    - `cache.service.ts` - 6 logs cache HIT/MISS/invalidate supprimés
    - `cloud-remote.component.ts` - 15 logs actions/erreurs supprimés
    - `command-executor.component.ts` - 5 logs WebSocket supprimés
    - `auth.interceptor.ts` - 2 logs 401 debug supprimés
    - `connection-indicator.component.ts` - 1 log réseau verbeux supprimé
    - `agency-dashboard.component.ts`, `sponsor-dashboard.component.ts`, `analytics-categories.component.ts`, `updates-management.component.ts`, `dashboard.component.ts`, `config-editor.component.ts`, `sponsor-videos.component.ts`, `sponsor-analytics.component.ts`, `sponsors-list.component.ts`, `sponsor-detail.component.ts` - console.error redondants supprimés (NotificationService gère déjà le feedback utilisateur)
  - **Fichier supprimé** : `config-editor.component.ts.backup` - fichier backup avec nombreux logs de debug
  - **Logs conservés** (15 logs justifiés dans 6 fichiers) :
    - `main.ts` : 1 (erreur bootstrap critique)
    - `qr-code-generator.component.ts` : 2 (erreurs QR code)
    - `global-error.handler.ts` : 1 (gestionnaire d'erreurs global)
    - `logger.service.ts` : 9 (le service de logging lui-même)
    - `command-executor.component.ts` : 1 (erreur clipboard)
    - `socket.service.spec.ts` : 1 (test)
  - **Pattern appliqué** : `catch(error) { console.error(...) }` → `catch() { ... }` quand l'erreur n'était utilisée que pour le log
  - **Migration** : Rebuild et redéployer le dashboard

- **Fix faux positif alimentation dans diagnostic hotspot** : Le script `fix-hotspot.sh` n'alerte plus sur les événements thermiques passés
  - **Problème** : Le diagnostic hotspot affichait "❌ Problème" d'alimentation alors que la santé système affichait "✅ OK" pour le même Pi
  - **Cause racine** : `fix-hotspot.sh` considérait **tout flag de throttling** (y compris les flags historiques de température) comme un problème d'alimentation
  - **Exemple** : `0x80000` (limite température soft passée) était signalé comme problème d'alimentation alors que ce n'en est pas un
  - **Solution** : Ne vérifier que les bits de sous-voltage réels (bit 0 et bit 16) pour déterminer s'il y a un problème d'alimentation
    - `powerOk = !(throttled & 0x10001)` (aligné avec `metrics.js`)
    - Les autres flags (température, fréquence) sont affichés à titre informatif mais ne déclenchent pas d'erreur d'alimentation
  - **Fichier modifié** : `raspberry/scripts/fix-hotspot.sh` - Fonctions `check_power()`, `output_json()`, `print_summary()`
  - **Migration Pi existants** :
    ```bash
    scp raspberry/scripts/fix-hotspot.sh pi@neopro.local:/home/pi/neopro/scripts/
    ```

- **Fix erreur 422 aperçu watermark dans le dashboard** : L'aperçu du watermark utilise maintenant une méthode robuste au lieu de fallback sur le chemin local
  - **Problème** : Erreur HTTP 422 dans la console lors de l'affichage de l'aperçu du watermark dans l'onglet Paramètres
  - **Cause racine** : Le template utilisait `imagePath` (chemin local du Pi comme `assets/watermarks/logo.png`) comme fallback, qui n'existe pas sur le serveur dashboard
  - **Solution** : Nouvelle méthode `getWatermarkPreviewUrl()` avec priorité stricte :
    1. `watermarkPreviewUrl` - Preview Base64 lors de l'upload
    2. `watermarkConfig.cloudUrl` - URL cloud (FTP ou Supabase)
    3. Placeholder SVG si aucune URL cloud disponible (anciens watermarks)
  - **Ajouts** :
    - Méthode `getWatermarkPreviewUrl()` - Retourne l'URL correcte ou un placeholder
    - Méthode `onWatermarkImageError()` - Gère les erreurs de chargement (URL expirée)
    - Placeholder SVG inline avec message "Aperçu non disponible" ou "Erreur de chargement"
  - **Note** : Le watermark fonctionne toujours sur la TV du Pi, seul l'aperçu dans le dashboard était affecté
  - **Fichier modifié** : `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts`
  - **Migration** : Rebuild et redéployer le dashboard. Pour avoir un aperçu des anciens watermarks, ré-uploader l'image.

### v2.42.x (Janvier 2026)

- **Alignement statut connexion liste/détail** : Les deux vues affichent maintenant le même statut de connexion
  - **Problème** : La liste des sites affichait "Connecté" (vert) alors que la page de détail affichait "Connexion instable" (orange) pour le même site
  - **Cause racine** : L'endpoint `/api/sites/connection-status` (liste) ne vérifiait pas la santé de la connexion (`isHealthy`), contrairement à `/api/sites/:id/dashboard` (détail)
  - **Solution** : Ajout de la vérification `getConnectionHealth()` dans `getAllSitesConnectionStatus`
    - Si `isConnectedNow && isHealthy` → `displayStatus = 'online'`
    - Si `isConnectedNow && !isHealthy` → `displayStatus = 'warning'` (connexion instable)
  - **Définition "Connexion instable"** : Le Pi semble connecté mais présente des signes de problème :
    - `pong_stale` : Dernier pong reçu > 60 secondes
    - `socket_disconnected` : Socket dans la map mais `socket.connected = false`
    - `no_pong_received` : Jamais reçu de pong depuis la connexion
    - `not_in_map` : Socket non enregistré
  - **Fichiers modifiés** :
    - `central-server/src/controllers/sites.controller.ts` - Vérification health dans `getAllSitesConnectionStatus`
    - `central-dashboard/src/app/core/models/index.ts` - Ajout champ `health` à `SiteConnectionSummary`
  - **Migration** : Redéployer le central-server et le dashboard

- **Fix vidéos réapparaissant après suppression et déploiement** : Correction de la race condition sync_local_state
  - **Problème** : Quand on supprimait des vidéos d'une boucle et déployait, les vidéos réapparaissaient après refresh
  - **Cause racine** : Le Pi envoyait son `sync_local_state` (avec l'ancienne config) avant que la commande `update_config` soit traitée. Le cloud stockait cette ancienne config dans `local_config_mirror`, écrasant la nouvelle.
  - **Solution** : Nouveau mécanisme de blocage temporaire (60s) après envoi d'une commande `update_config`
    - Colonne `config_update_pending_until` sur la table `sites`
    - Pendant le blocage, `handleSyncLocalState` met à jour uniquement les métadonnées (`_localVideos`, `_localStorage`, etc.) sans écraser la config principale
    - Le blocage est levé quand la commande est terminée (succès ou échec)
  - **Fichiers modifiés** :
    - `central-server/src/services/socket.service.ts` - Vérification du blocage dans `handleSyncLocalState`, levée du blocage dans `handleCommandResult`
    - `central-server/src/controllers/sites.controller.ts` - Activation du blocage dans `dispatchCommand`
    - `central-server/src/services/command-queue.service.ts` - Activation du blocage dans `sendOrQueue` et `processPendingCommands`
    - `central-server/src/scripts/full-schema.sql` - Nouvelle colonne
    - `central-server/src/scripts/migrations/fix-config-sync-race-condition.sql` - Migration
  - **Migration** :

    ```bash
    # Exécuter la migration SQL sur Supabase (dashboard SQL Editor)
    # Copier le contenu de fix-config-sync-race-condition.sql

    # Redéployer le central-server (Railway)
    ```

### v2.41.x (Janvier 2026)

- **Amélioration UX Bibliothèque Vidéo** : Meilleur filtrage et gestion des déploiements
  - **Dropdowns enrichis** : Fusion Cloud + Local avec icônes de priorité
    - ⭐ Vidéos uploadées spécifiquement pour ce site (`uploadedForSiteId`)
    - ✅ Vidéos présentes sur le Pi
    - ☁️ Vidéos cloud uniquement
  - **Filtre "Pertinentes" par défaut** : Affiche uniquement les vidéos pertinentes pour le site
    - Déjà sur le Pi (local)
    - Utilisées dans la configuration actuelle (boucles, catégories)
    - Uploadées spécifiquement pour ce site
    - Avec un déploiement en cours vers ce site
  - **Section déploiements en attente** : Liste des déploiements `pending`/`in_progress` avec bouton Annuler
  - **Fichiers modifiés** :
    - `central-dashboard/.../video-library.component.ts` - Filtre `relevant`, méthode `isVideoRelevant()`, nouveaux inputs
    - `central-dashboard/.../site-content-tab.component.ts` - Section pending deployments, `rebuildConfigVideoPaths()`, styles CSS
    - `central-dashboard/src/app/core/services/sites.service.ts` - Interface `PendingDeployment`, méthodes API
  - **Migration** : Rebuild et redéployer le dashboard

- **Cloud Remote accessible publiquement** : L'accès à `/remote/:siteId` ne requiert plus d'authentification
  - **Problème résolu** : Le QR Code Cloud Remote redirigeait vers la page de login au lieu de la télécommande
  - **Solution** :
    - Suppression du `authGuard` sur la route Angular `/remote/:siteId`
    - Suppression du middleware `authenticate` sur les routes API `/api/remote/*`
    - Conservation du `sensitiveRateLimit` (30 req/min par IP) pour la sécurité
  - **Sécurité** (sans JWT) :
    - L'UUID du site est difficile à deviner (128 bits d'entropie)
    - Rate limiting : 30 req/min par IP
    - Le site doit être online pour recevoir les commandes
  - **Fichiers modifiés** :
    - `central-dashboard/src/app/app.routes.ts` - Route `/remote/:siteId` sans authGuard
    - `central-server/src/routes/remote.routes.ts` - Routes sans middleware authenticate
  - **Migration** : Redéployer le dashboard et le central-server

- **Fix configuration Hotspot pour Pi en Ethernet** : Les modifications hotspot s'appliquent immédiatement sur les Pi connectés en Ethernet
  - **Problème** : La modification du SSID/password du hotspot via le dashboard ne prenait pas effet sur les Pi en Ethernet
  - **Cause racine** : Le profil `ETHERNET` manquait dans la `SAFETY_MATRIX` de `SafeNetworkOperations`
  - **Symptôme** : Le Pi tombait en fallback `UNKNOWN` → méthode `defer_reboot` au lieu de `restart`
  - **Solution** : Ajout du profil `ETHERNET` avec `method: 'restart'` pour toutes les opérations hotspot
  - **Fichier modifié** :
    - `raspberry/sync-agent/src/services/safe-network-operations.js` - Ajout `ETHERNET` dans `SAFETY_MATRIX`
  - **Migration Pi existants** :
    ```bash
    scp raspberry/sync-agent/src/services/safe-network-operations.js pi@neopro.local:/home/pi/neopro/sync-agent/src/services/
    ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
    ```

- **Fix affichage SSID dans QR Code** : Le générateur QR Code affiche maintenant le bon SSID
  - **Problème** : Le QR Code affichait un ancien SSID (ex: `NEOPRO-NLF`) différent de celui affiché dans la section Hotspot (ex: `NEOPRO-NARH`)
  - **Cause racine** : `getWifiSsid()` lisait `_hotspotSsid` (ancien format) au lieu de `_hotspotInfo.ssid` (nouveau format)
  - **Solution** :
    - Priorité de lecture : `currentHotspotSsid` (API) → `_hotspotInfo.ssid` → `_hotspotSsid` → génération depuis clubName
    - Reset du cache `realSsid` dans `ngOnChanges` lors du changement de site
  - **Fichier modifié** :
    - `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts`
  - **Migration** : Rebuild et redéployer le dashboard

- **Fix déduplication requêtes auth (rate limit 429)** : Les guards Angular ne déclenchent plus de requêtes `/api/auth/me` multiples
  - **Problème** : Au chargement de page, plusieurs guards (`authGuard` + `roleGuard`) appelaient `checkAuthentication()` simultanément, générant 2+ requêtes HTTP identiques
  - **Symptôme** : Erreur 429 "Too Many Requests" déconnectant l'utilisateur alors qu'il était authentifié
  - **Cause racine** : Le flag `authCheckInProgress` était vérifié/mis à jour de manière asynchrone, permettant aux appels concurrents de passer
  - **Solution** :
    - Utilisation de `shareReplay(1)` pour partager l'Observable de la requête en cours entre tous les souscripteurs
    - Nouvelle propriété `authCheckRequest$` qui stocke la requête partagée
    - `finalize()` pour nettoyer la référence quand tous les souscripteurs sont terminés
    - Gestion spéciale du rate limit 429 : ne pas déconnecter l'utilisateur, permettre un retry
  - **Fichier modifié** :
    - `central-dashboard/src/app/core/services/auth.service.ts` - Refactoring de `checkAuthentication()` avec `shareReplay`
  - **Résultat** : 1 seule requête `/api/auth/me` au lieu de 2+ par chargement de page
  - **Migration** : Rebuild et redéployer le dashboard

- **Système de vérification d'upload avant déploiement** : Prévention des race conditions entre upload FTP et déploiement Pi
  - **Problème résolu** : Lors de déploiements simultanés vers plusieurs sites, les Pi tentaient de télécharger les fichiers avant la fin de l'upload FTP, causant des erreurs `tar: unexpected EOF` ou `Checksum mismatch`
  - **Solution** : Machine d'état `upload_status` avec vérification obligatoire avant tout déploiement
  - **Architecture** :
    ```
    Upload FTP → Vérifier (LIST + taille) → UPDATE status='ready' → Déploiement autorisé
                                                   ↓
                             Si status != 'ready' → HTTP 409 "Video not ready for deployment"
    ```
  - **Nouvelles colonnes DB** (videos + software_updates) :
    - `upload_status` : 'uploading' | 'verifying' | 'ready' | 'failed'
    - `upload_verified_at` : Timestamp de vérification
    - `upload_verified_size` : Taille réelle du fichier sur FTP
    - `upload_error_message` : Message d'erreur si échec
  - **Pattern GATE** : Vérification au niveau contrôleur, retourne HTTP 409 si pas prêt
  - **Pattern DOUBLE-CHECK** : Vérification supplémentaire au niveau service (backup)
  - **Nouveaux fichiers** :
    - `central-server/src/services/upload-verification.service.ts` - Service de vérification
    - `central-server/src/scripts/migrations/add-upload-verification.sql` - Migration DB
  - **Fichiers modifiés** :
    - `central-server/src/config/ftp-storage.ts` - `verifyFtpFileExists()`, `uploadFileToFtpWithVerification()`
    - `central-server/src/controllers/content.controller.ts` - GATE sur createDeployment
    - `central-server/src/controllers/updates.controller.ts` - GATE sur createUpdateDeployment
    - `central-server/src/services/deployment.service.ts` - DOUBLE-CHECK dans startDeployment
    - `central-server/src/services/update-deployment.service.ts` - DOUBLE-CHECK dans startDeployment
    - `central-server/src/services/asset.service.ts` - Vérification dans uploadAsset
    - `raspberry/sync-agent/src/commands/update-software.js` - Messages d'erreur améliorés pour archives corrompues
    - `raspberry/sync-agent/src/commands/deploy-video.js` - Messages d'erreur améliorés pour téléchargements incomplets
  - **Messages d'erreur améliorés côté Pi** :
    - Archive corrompue : "Archive corrompue ou téléchargement incomplet. Cela peut se produire si le déploiement a été lancé avant la fin de l'upload sur le serveur."
    - Checksum mismatch : "Checksum incorrect. Cela peut se produire si le fichier source était encore en cours d'upload."
  - **Migration** :

    ```bash
    # 1. Exécuter la migration SQL sur Supabase (dashboard SQL Editor)
    # Copier le contenu de add-upload-verification.sql

    # 2. Redéployer le central-server (Railway)

    # 3. Mettre à jour sync-agent sur les Pi
    scp raspberry/sync-agent/src/commands/update-software.js pi@neopro.local:/home/pi/neopro/sync-agent/src/commands/
    scp raspberry/sync-agent/src/commands/deploy-video.js pi@neopro.local:/home/pi/neopro/sync-agent/src/commands/
    ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
    ```

- **Fix erreur 500 sur historique déploiements vidéo** : L'icône 📋 (historique) dans la bibliothèque vidéo retournait une erreur 500
  - **Problème** : Erreur SQL `column u.first_name does not exist` sur l'endpoint `/api/videos/:id/deployments`
  - **Cause racine** : La requête SQL utilisait `u.first_name || ' ' || u.last_name` mais la table `users` n'a qu'une colonne `full_name`
  - **Solution** : Remplacé par `COALESCE(u.full_name, 'Système') as deployed_by_name`
  - **Fichier modifié** :
    - `central-server/src/controllers/content.controller.ts` - Fonction `getVideoDeployments()`
  - **Migration** : Redéployer le central-server

- **Prévisualisation vidéo dans le dashboard** : Les vidéos peuvent maintenant être lues directement depuis la bibliothèque vidéo
  - **Problème** : Le modal de prévisualisation existait mais les URLs étaient incorrectes (chemins de stockage au lieu d'URLs publiques)
  - **Cause racine** : L'API retournait `storage_path` (ex: `video.mp4`) au lieu de l'URL complète FTP/Supabase
  - **Solution** :
    - Ajout de la fonction `getVideoDownloadUrl()` qui détecte le backend de stockage (FTP vs Supabase)
    - Transformation automatique des URLs dans `getVideos()`, `getVideo()` et `getVideosForSite()`
  - **Détection du backend** :
    - Si `storage_path` ne contient pas `/` → FTP (Hostinger)
    - Si `storage_path` contient `/` → Supabase
  - **Fichier modifié** :
    - `central-server/src/controllers/content.controller.ts` - Ajout `getVideoDownloadUrl()` et transformation URLs
  - **Migration** : Redéployer le central-server

### v2.40.x (Janvier 2026)

- **Sync-Agent Guardian** : Watchdog système indépendant pour maintenir la connexion cloud
  - **Problème résolu** : Un fichier JS corrompu (curl foireux, update partielle) crashait le sync-agent en boucle, rendant le Pi inaccessible à distance
  - **Solution** : Script bash ultra minimal (~200 lignes) qui surveille le sync-agent et le restaure automatiquement
  - **Fonctionnement** :
    - Vérifie toutes les 30s si le sync-agent tourne
    - Si 3+ crashs en 5 minutes → restaure depuis la version "golden"
    - Détecte les fichiers corrompus (HTML au lieu de JS)
    - Crée automatiquement un snapshot "golden" quand le sync-agent est stable
  - **Nouveaux fichiers** :
    - `raspberry/scripts/sync-agent-guardian.sh` - Script de surveillance
    - `raspberry/config/systemd/neopro-sync-guardian.service` - Service systemd
  - **Fichiers modifiés** :
    - `raspberry/install.sh` - Installation automatique du guardian
  - **Migration Pi existants** :

    ```bash
    # Copier les fichiers
    scp raspberry/scripts/sync-agent-guardian.sh pi@neopro.local:/home/pi/neopro/scripts/
    scp raspberry/config/systemd/neopro-sync-guardian.service pi@neopro.local:/tmp/

    # Installer le service
    ssh pi@neopro.local 'chmod +x /home/pi/neopro/scripts/sync-agent-guardian.sh && sudo mv /tmp/neopro-sync-guardian.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now neopro-sync-guardian'

    # Créer le snapshot golden initial
    ssh pi@neopro.local '/home/pi/neopro/scripts/sync-agent-guardian.sh create-golden'
    ```

### v2.39.x (Janvier 2026)

- **Fix Cloud Remote play-video non fonctionnel** : La lecture de vidéo depuis le Cloud Remote ne fonctionnait pas
  - **Problème** : Les commandes `play-video` et `play-sponsors` envoyées depuis le Cloud Remote n'arrivaient jamais à la TV
  - **Cause racine** : Le central-server envoyait les événements vers la room Socket.IO du site, mais le sync-agent ne les relayait pas vers le serveur local (port 3000)
  - **Solution** :
    - Ajout de listeners dans le sync-agent pour tous les événements cloud remote (`score-update`, `phase-change`, `cloud-remote-action`, etc.)
    - Nouvelle méthode `relayToLocalServer()` qui se connecte au serveur local et relaie l'événement
    - Nouvel événement `cloud-remote-action` (au lieu de `command`) pour différencier les commandes télécommande des commandes système (deploy_video, update_config)
  - **Fichiers modifiés** :
    - `central-server/src/controllers/remote.controller.ts` - Utilise `cloud-remote-action` pour play-video/play-sponsors
    - `raspberry/sync-agent/src/agent.js` - Listeners cloud remote + méthode `relayToLocalServer()`
  - **Migration Pi existants** :
    ```bash
    scp raspberry/sync-agent/src/agent.js pi@neopro.local:/home/pi/neopro/sync-agent/src/
    ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
    ```
  - **Migration serveur** : Redéployer le central-server sur Railway

### v2.38.x (Janvier 2026)

- **Fix CSS Cloud Remote** : Le composant Cloud Remote n'affichait aucun style (UI cassée)
  - **Problème** : Deux bugs combinés empêchaient le chargement des styles
    1. Typo dans le décorateur : `styleUrl` au lieu de `styleUrls` (Angular 17+ requiert un tableau)
    2. Le fichier SCSS avait des noms de classes différents du HTML (ex: `.back-btn` vs `.back-button`)
  - **Cause racine** : Le HTML avait été copié depuis le Remote Pi mais le SCSS avait été réécrit avec des noms différents
  - **Solution** :
    - Fix du décorateur : `styleUrls: ['./cloud-remote.component.scss']`
    - Remplacement complet du SCSS avec les styles du Remote Pi + styles cloud-specific
  - **Fichiers modifiés** :
    - `central-dashboard/src/app/features/remote/cloud-remote.component.ts` - Fix styleUrls
    - `central-dashboard/src/app/features/remote/cloud-remote.component.scss` - Styles complets (~2500 lignes)
  - **Migration** : Rebuild du dashboard (`npm run build`)

- **Support connexion Ethernet** : NetworkDetector et NetworkWatchdog gèrent maintenant les connexions câblées
  - **Problème résolu** : Pi connecté en Ethernet (eth0) affichait "Inconnu" et le watchdog spammait des erreurs wlan1
  - **NetworkDetector** :
    - Nouveau profil `ethernet` ajouté aux types détectés
    - Détection automatique si `eth0` UP avec IP valide et route par défaut
    - Profil ethernet = score stabilité 100, pas de warnings
  - **NetworkWatchdog** :
    - Vérifie d'abord si Ethernet fonctionne avant de surveiller wlan1
    - Si Ethernet OK, pas de tentative de recovery WiFi (évite le spam de logs)
    - Nouveau champ `connectionType` ('ethernet' | 'wifi') dans l'état
  - **Dashboard** :
    - Badge "🔌 Ethernet" avec style bleu clair
    - Tooltip : "Connexion Ethernet (câble) - ✅ Connexion stable et fiable"
  - **Fichiers modifiés** :
    - `raspberry/sync-agent/src/services/network-detector.js` - Support eth0
    - `raspberry/sync-agent/src/services/network-watchdog.js` - Priorité Ethernet
    - `central-dashboard/.../site-detail.component.ts` - Badge Ethernet
  - **Migration** : Déployer le nouveau sync-agent
    ```bash
    scp raspberry/sync-agent/src/services/network-detector.js pi@neopro.local:/home/pi/neopro/sync-agent/src/services/
    scp raspberry/sync-agent/src/services/network-watchdog.js pi@neopro.local:/home/pi/neopro/sync-agent/src/services/
    ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
    ```

### v2.37.x (Janvier 2026)

- **NetworkWatchdog Service** : Surveillance et auto-recovery réseau complet (Phase 4 - Network Resilience)
  - **Surveillance hotspot (wlan0)** toutes les 30s :
    - Vérification hostapd, dnsmasq, mode AP, rfkill, IP 192.168.4.1
    - Auto-recovery si problème détecté (max 3 tentatives)
  - **Surveillance internet (wlan1)** toutes les 60s :
    - Vérification IP valide (pas APIPA 169.254.x.x)
    - Ping gateway et 8.8.8.8
    - Auto-recovery via wpa_cli reconfigure + dhclient
  - **Surveillance cloud (Socket.IO)** toutes les 30s :
    - Détection connexions zombies (flag connected mais socket morte)
    - Force reconnexion si zombie détecté
  - **Rollback automatique** :
    - Sauvegarde la config avant opérations risquées
    - Si perte connexion après 30s → rollback et notification centrale
  - **Alertes envoyées au central** si recovery échoue après 3 tentatives
  - **Nouveaux fichiers** :
    - `raspberry/sync-agent/src/services/network-watchdog.js`
  - **Fichiers modifiés** :
    - `raspberry/sync-agent/src/agent.js` - Intégration watchdog
    - `central-server/src/services/socket.service.ts` - Handlers network_alert, network_rollback
  - **Migration** : Déployer le nouveau sync-agent

- **Network Alerts Service** : Alertes proactives pour sites à risque
  - Check automatique toutes les 4 heures
  - Critères d'alerte :
    - Sites mesh avec BSSID lock (bloquant le roaming)
    - Sites mesh_isolated (isolation client)
    - Sites avec score de stabilité < 50
    - Sites enterprise sans config IT
    - Sites offline > 24h en environnement mesh
  - Création d'alertes en DB (évite les doublons sur 24h)
  - Statistiques agrégées disponibles via `getNetworkRiskStats()`
  - **Nouveaux fichiers** :
    - `central-server/src/services/network-alerts.service.ts`
  - **Fichiers modifiés** :
    - `central-server/src/server.ts` - Démarrage du service
  - **Migration** : Redéployer le serveur central

- **Fix commandes WiFi BSSID non autorisées** : Les commandes `get_wifi_bssid_status`, `remove_bssid_lock`, `optimize_for_mesh` retournaient une erreur 500
  - **Problème** : L'endpoint `/api/sites/:id/wifi-bssid-status` échouait avec `"Command type 'get_wifi_bssid_status' is not allowed"`
  - **Cause** : Les commandes n'étaient pas dans la liste `DEFAULT_ALLOWED_COMMANDS` du sync-agent
  - **Solution** : Ajout des 4 commandes manquantes à `raspberry/sync-agent/src/config.js` :
    - `get_wifi_bssid_status`
    - `remove_bssid_lock`
    - `optimize_for_mesh`
    - `deploy_asset`
  - **Fichier modifié** : `raspberry/sync-agent/src/config.js`
  - **Migration** : Déployer le nouveau sync-agent ou copier `config.js` via SCP + restart service

### v2.36.x (Janvier 2026)

- **SafeNetworkOperations Service** : Encapsulation des opérations réseau risquées avec sécurité basée sur le profil
  - **Matrice de sécurité** : Chaque opération a un comportement différent selon le profil réseau
  - **Opérations gérées** :
    - `set_bssid_lock` : ✅ Simple, ❌ Mesh/Isolated/Enterprise
    - `remove_bssid_lock` : ✅ Tous les profils
    - `update_hotspot_*` : ✅ Simple (restart), ⚠️ Mesh (defer reboot)
    - `fix_hotspot` : ✅ Simple (direct), ⚠️ Mesh (defer reboot)
    - `restart_hostapd` : ✅ Simple, ❌ Mesh/Isolated/Enterprise
    - `configure_bgscan` : ✅ Tous les profils
  - **Méthodes d'exécution** :
    - `direct` : Exécute immédiatement sans restart de service
    - `restart` : Exécute et redémarre hostapd (simple networks only)
    - `defer_reboot` : Sauvegarde la config, reboot requis pour appliquer
  - **Auto-optimization** : Au boot, le service applique automatiquement :
    - Suppression du BSSID lock si détecté en mesh
    - Configuration bgscan si mesh et pas encore configuré
  - **Fichiers** :
    - `raspberry/sync-agent/src/services/safe-network-operations.js` - Service complet
    - `raspberry/sync-agent/src/commands/hotspot.js` - Utilise SafeNetworkOperations
  - **Migration** : Déployer le nouveau sync-agent

- **QR Code Cloud par défaut pour sites mesh_isolated** : Amélioration UX pour réseaux avec isolation client
  - Le générateur QR Code s'ouvre en mode "Cloud" par défaut si le site est `mesh_isolated`
  - Mode local toujours accessible pour les autres profils
  - Ajout de la méthode `getQrCodeDefaultMode()` dans site-settings-tab
  - **Fichiers modifiés** :
    - `central-dashboard/.../site-settings-tab.component.ts`
  - **Migration** : Rebuild dashboard

- **Bannière d'alerte contextuelle réseau** : Avertissement visuel pour les sites à risque
  - S'affiche automatiquement pour :
    - Sites mesh avec BSSID verrouillé (warning jaune)
    - Sites mesh_isolated (danger rouge)
    - Sites enterprise (info bleu)
  - Contient un message explicatif et un bouton d'action contextuel
  - Peut être fermée par l'utilisateur (dismiss)
  - Actions :
    - Mesh + BSSID lock → "Supprimer le verrou" (switch to debug tab)
    - Mesh isolated → "Ouvrir Remote Cloud" (new window)
  - **Fichiers modifiés** :
    - `central-dashboard/.../site-detail.component.ts` - Template, styles, méthodes
  - **Migration** : Rebuild dashboard

- **Auto-configuration bgscan au boot** : Optimisation automatique du roaming en mesh
  - Au démarrage, si profil mesh détecté et bgscan non configuré → configure automatiquement
  - Valeur par défaut : `simple:30:-70:300` (scan rapide si signal < -70dBm)
  - Intégré dans `safeNetworkOperations.autoOptimize()`
  - **Fichiers modifiés** :
    - `raspberry/sync-agent/src/agent.js` - Appel autoOptimize après détection profil
  - **Migration** : Déployer le nouveau sync-agent

### v2.35.x (Janvier 2026)

- **NetworkDetector Service** : Détection automatique et classification du profil réseau
  - **Profils détectés** : `simple`, `mesh`, `mesh_isolated`, `enterprise`, `ethernet`, `unknown`
  - **Données collectées** :
    - Nombre d'APs avec même SSID (mesh detection)
    - Test isolation client (ARP, ping broadcast)
    - Score de stabilité (déconnexions/heure)
    - État du BSSID lock
    - Warnings contextuels
  - **Fréquence** : Au boot (après 30s) + toutes les heures
  - **Fichiers** :
    - `raspberry/sync-agent/src/services/network-detector.js` - Service complet
    - `raspberry/sync-agent/src/agent.js` - Intégration et scheduling
  - **Migration** : Déployer le nouveau sync-agent

- **Migration DB network_profile** : Nouvelle colonne pour stocker le profil réseau
  - Colonne `network_profile` (JSONB) sur la table `sites`
  - Colonne `network_profile_updated_at` (TIMESTAMP)
  - Vue `network_profile_summary` pour analytics
  - Index pour requêtes par type de profil
  - **Fichiers** :
    - `central-server/src/scripts/migrations/add-network-profile.sql`
  - **Migration** : Exécuter la migration SQL

- **Badge profil réseau dans le dashboard** : Affichage visuel du type de réseau
  - Badge coloré dans l'en-tête du site-detail
  - Couleurs : Simple (vert), Mesh (jaune), Mesh Isolé (rouge), Enterprise (bleu)
  - Tooltip avec détails et recommandations
  - Animation pulsante si warning (ex: BSSID lock en mesh)
  - **Fichiers** :
    - `central-dashboard/.../site-detail.component.ts` - Badge + méthodes
    - `central-dashboard/src/app/core/models/index.ts` - Interface `NetworkProfile`
  - **Migration** : Rebuild dashboard

- **Profil réseau dans sync_local_state** : Remontée automatique vers le cloud
  - Le profil simplifié est envoyé avec chaque `sync_local_state`
  - Stocké dans `local_config_mirror._networkProfile` ET `sites.network_profile`
  - Warning logger si BSSID lock détecté en mesh
  - **Fichiers modifiés** :
    - `central-server/src/services/socket.service.ts` - Stockage dans DB

### v2.34.x (Janvier 2026)

- **Hotspot Watchdog** : Service de surveillance et récupération automatique du hotspot WiFi
  - **Problème résolu** : Hotspot qui disparaît de la liste WiFi, délais longs, mot de passe redemandé
  - **Solution** : Service systemd `neopro-hotspot-watchdog` qui vérifie toutes les 30s :
    - hostapd actif
    - wlan0 en mode AP
    - dnsmasq actif
    - WiFi non bloqué par rfkill
    - IP 192.168.4.1 configurée
  - **Récupération automatique** : Max 3 tentatives avec cooldown 5 min
  - **Logs** : `/var/log/neopro-hotspot-watchdog.log`
  - **Nouveaux fichiers** :
    - `raspberry/scripts/hotspot-watchdog.sh` - Script de surveillance
    - `raspberry/config/systemd/neopro-hotspot-watchdog.service` - Service systemd
  - **Migration Pi existants** :
    ```bash
    scp raspberry/scripts/hotspot-watchdog.sh pi@neopro.local:/home/pi/neopro/scripts/
    scp raspberry/config/systemd/neopro-hotspot-watchdog.service pi@neopro.local:/tmp/
    ssh pi@neopro.local 'sudo mv /tmp/neopro-hotspot-watchdog.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now neopro-hotspot-watchdog'
    ```

- **Blocage BSSID lock en environnement mesh** : Protection complète contre le verrouillage BSSID en mesh
  - **Problème résolu** : BSSID lock causait des déconnexions quand l'AP verrouillé devenait inaccessible en mesh
  - **Solution multi-couches** :
    - Admin panel : Checkbox désactivé + message explicite si mesh détecté
    - Backend : Validation côté serveur qui refuse la requête même si frontend contourné
    - Détection : Scan des APs avec même SSID pour détecter le mesh
  - **Fichiers modifiés** :
    - `raspberry/admin/public/app.js` - UI bloquée + validation
    - `raspberry/admin/admin-server.js` - Validation côté serveur
  - **Migration** : Déployer admin-server.js et app.js sur les Pi

- **Documentation Résilience Réseau** : Analyse industrie et vision produit
  - `docs/research/NETWORK_CHALLENGES_INDUSTRY_ANALYSIS.md` - Étude des problèmes réseau chez les concurrents
  - `docs/research/NEOPRO_NETWORK_RESILIENCE_VISION.md` - Vision produit "Network-Resilient Digital Signage"
  - **Conclusion** : Neopro n'est pas seul avec ces problèmes (tous les concurrents Pi ont des soucis similaires), mais peut se différencier par une meilleure gestion automatique

### v2.33.x (Janvier 2026)

- **Remote Cloud (Télécommande via Internet)** : Nouvelle fonctionnalité permettant de contrôler un site depuis n'importe quel réseau
  - **Problème résolu** : Les réseaux mesh WiFi avec isolation client empêchaient l'accès à `/remote`
  - **Solution** : Télécommande accessible via `https://dashboard.neopro.tv/remote/{siteId}`
  - **Architecture** : Téléphone → Internet → Central Server → Socket.IO → Pi
  - **Latence** : 100-300ms (acceptable pour une télécommande)
  - **Nouveaux fichiers** :
    - `central-server/src/controllers/remote.controller.ts` - Backend controller
    - `central-server/src/routes/remote.routes.ts` - Routes API
    - `central-dashboard/src/app/features/remote/cloud-remote.component.ts` - UI complète
    - `central-dashboard/src/app/core/services/remote.service.ts` - Service Angular
  - **QR Code mis à jour** : Le générateur offre maintenant un choix Local (Hotspot) / Cloud
  - **Documentation** : `docs/clients/NLF.md` mis à jour avec les détails techniques
  - **Migration** : Aucune (nouvelle fonctionnalité)

- **Fix mDNS Avahi (neopro.local)** : Le fichier de service Avahi contenait des commentaires `#` invalides en XML
  - **Problème** : `neopro.local` ne se résolvait pas correctement lors du changement de réseau/lieu
  - **Cause** : `/etc/avahi/services/neopro.service` commençait par `# commentaire` au lieu de `<!-- commentaire -->`
  - **Symptôme** : Erreur dans les logs avahi : `XML_ParseBuffer() failed at line 1: not well-formed (invalid token)`
  - **Solution** : Remplacement des commentaires `#` par des commentaires XML `<!-- -->`
  - **Fichier corrigé** : `raspberry/config/systemd/neopro.service`
  - **Migration Pi existants** :
    ```bash
    sudo tee /etc/avahi/services/neopro.service > /dev/null << 'EOF'
    <?xml version="1.0" standalone='no'?>
    <!DOCTYPE service-group SYSTEM "avahi-service.dtd">
    <service-group>
      <name replace-wildcards="yes">Neopro %h</name>
      <service>
        <type>_http._tcp</type>
        <port>80</port>
        <txt-record>path=/</txt-record>
      </service>
      <service>
        <type>_neopro._tcp</type>
        <port>3000</port>
        <txt-record>version=1.0</txt-record>
      </service>
    </service-group>
    EOF
    sudo systemctl restart avahi-daemon
    ```

- **Fix mode démo admin panel** : Le mode démo s'activait sur toutes les IPs privées sauf `192.168.4.1`
  - **Problème** : En accédant à l'admin panel via `192.168.1.x` (Ethernet), le mode démo s'activait
  - **Cause** : La détection ne reconnaissait que `neopro.local`, `192.168.4.1` et `localhost`
  - **Solution** : Ajout de la fonction `isPrivateIP()` qui accepte toutes les plages privées (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  - **Fichier modifié** : `raspberry/admin/public/app.js`
  - **Migration** : `scp raspberry/admin/public/app.js pi@neopro.local:/home/pi/neopro/admin/public/`

- **Fix configuration ESLint monorepo** : Résolution du conflit entre ESLint 8 (central-server) et ESLint 9 (root)
  - **Problème** : `npm run lint` dans central-server échouait avec "Cannot read properties of undefined (reading 'allowShortCircuit')"
  - **Cause** : Le root utilise ESLint 9 flat config (`eslint.config.js`) qui s'appliquait aussi à central-server (ESLint 8 legacy)
  - **Solution** :
    - Ajout `ignores: ["central-server/**", "node_modules/**"]` dans `/eslint.config.js` (root)
    - Modification du script lint dans `central-server/package.json` : `ESLINT_USE_FLAT_CONFIG=false eslint src/**/*.ts`
    - Ajout `ignorePatterns: ["**/*.test.ts", "**/__tests__/**"]` et `"jest": true` dans `central-server/.eslintrc.json`
  - **État actuel** : ESLint fonctionne avec 40 erreurs (unused vars) et 114 warnings (any types) - à nettoyer progressivement
  - **Migration** : Aucune (fix configuration interne)

- **Synchronisation full-schema.sql avec Supabase** : Alignement du schéma de référence avec la DB de production
  - Tables renommées : `sponsor_impressions` → `advertiser_impressions`, `sponsor_daily_stats` → `advertiser_daily_stats`
  - Tables ajoutées : `agencies`, `advertiser_sites`, `agency_sites`
  - Vues analytics ajoutées (12) : `club_analytics_summary`, `top_videos_by_site`, `advertiser_analytics_summary`, `advertiser_performance_by_site`, `advertiser_stats_summary`, `top_advertiser_videos`, `advertiser_accessible_sites`, `agency_accessible_sites`, `agency_stats_summary`, etc.
  - **Migration** : Aucune (schéma de référence uniquement, DB de prod déjà à jour)

- **Correction tests unitaires** : 912 tests passent maintenant (37 suites)
  - **socket.service.test.ts** : Fix des mocks Socket.IO (ajout `connected: true`, `lastPongReceived`)
  - **integration.test.ts** : Fix des tests d'intégration API (checksum vidéo, SHA256 api_key)
  - **config-history.controller.test.ts**, **content.controller.test.ts** : Corrections mineures
  - **audit.routes.test.ts**, **admin-ops.service.test.ts** : Mocks corrigés
  - **Migration** : Aucune (amélioration tests)

- **Refactoring P2/P3 - Extraction services et tests** : Amélioration de la maintenabilité et couverture de tests
  - **tv.component.ts** : Extraction de 3 services Angular (~114 lignes déplacées)
    - `double-buffer-video.service.ts` - Gestion des transitions vidéo sans flash
    - `video-error-recovery.service.ts` - Watchdog, récupération crashs GPU, cleanup mémoire
    - `watermark.service.ts` - Affichage et scheduling du watermark
  - **sync-agent/commands/index.js** : Refactoring de 1440 → ~650 lignes
    - Extraction en 6 modules : `update-config.js`, `diagnostics.js`, `hotspot.js`, `network-diagnostics.js`, `debug-bundle.js`, `analytics-buffer.js`
  - **Nouveaux fichiers de tests** (central-server) :
    - `draft.service.test.ts` - Tests brouillons configuration
    - `command-queue.service.test.ts` - Tests file de commandes
    - `asset.service.test.ts` - Tests watermarks (upload, deploy, validation)
    - `orchestrated-deployment.service.test.ts` - Tests déploiement orchestré
  - **Pre-commit hook** : `.husky/commit-msg` pour validation Conventional Commits
  - **Migration** : Aucune (amélioration interne, rétrocompatible)

- **Fix hotspot repair sans perte de connexion wlan1** : Correction du bug de perte de connexion Internet lors de la réparation automatique du hotspot
  - **Problème** : Lancer "Réparer automatiquement" depuis le dashboard central ou l'admin panel causait une perte de la connexion WiFi cliente (wlan1), rendant le Pi inaccessible à distance
  - **Cause** : Le script `fix-hotspot.sh` redémarrait immédiatement `hostapd` après un changement de canal, ce qui perturbait le driver `wlan1` (dongle USB WiFi)
  - **Solution** :
    - `fix-hotspot.sh` : Le canal est modifié dans `/etc/hostapd/hostapd.conf` SANS redémarrer hostapd
    - Le changement sera effectif au prochain reboot du Pi
    - Nouvelle option `--reboot-now` pour redémarrer immédiatement si souhaité
    - Output JSON amélioré avec `channelChanged`, `needsReboot`, `oldChannel`, `newChannel`
  - **UX Dashboard/Admin** :
    - Si un changement de canal est détecté, un modal de confirmation apparaît
    - L'utilisateur peut choisir "Redémarrer maintenant" ou "Plus tard"
    - Message explicatif que le changement sera appliqué au prochain reboot
  - **Fichiers modifiés** :
    - `raspberry/scripts/fix-hotspot.sh` - Ne redémarre plus hostapd, output JSON amélioré
    - `raspberry/sync-agent/src/commands/hotspot.js` - Parsing JSON, fonction `rebootPi()`
    - `central-dashboard/.../site-debug-tab.component.ts` - Modal de confirmation reboot
    - `raspberry/admin/public/index.html` - Section diagnostic hotspot et modal
    - `raspberry/admin/public/app.js` - Fonctions diagnostic et reboot
    - `raspberry/admin/admin-server.js` - Endpoint `/api/hotspot/fix`
  - **Tests** : 5 nouveaux tests unitaires pour `fix_hotspot` dans `commands.test.js`
  - **Migration** : Déployer sync-agent et scripts sur les Pi existants

### v2.28.x (Janvier 2026)

- **Système de Watermark** : Ajout d'une image de watermark configurable sur l'overlay TV
  - **Fonctionnalités** :
    - Upload d'image (PNG/JPG/WEBP/GIF/SVG) vers le cloud (FTP ou Supabase)
    - Déploiement automatique vers le Pi via commande `deploy_asset`
    - **Mode fullscreen** (par défaut) : l'image couvre tout l'écran avec `object-fit: cover`
    - **Mode positionné** : 9 positions possibles (top-left, top-center, etc.) avec taille personnalisée
    - 6 animations : none, fade, slide-left, slide-right, slide-top, slide-bottom, zoom
    - Configuration complète : opacité (0-100%), taille, offset X/Y, border-radius, durée animation
    - Scheduling : activation par plages horaires et jours de la semaine, phases de match
  - **Architecture z-index TV** : watermark (1100) > score overlay (1000) < goal animations (2000)
  - **Nouveaux fichiers** :
    - `central-server/src/services/asset.service.ts` - Upload et déploiement assets
    - `central-server/src/controllers/assets.controller.ts` - Endpoints API
    - `central-server/src/routes/assets.routes.ts` - Routes `/api/assets/*`
    - `central-dashboard/src/app/core/services/asset.service.ts` - Service Angular
    - `raspberry/sync-agent/src/commands/deploy-asset.js` - Commande de déploiement
  - **Fichiers modifiés** :
    - `raspberry/src/app/interfaces/configuration.interface.ts` - Types WatermarkConfig
    - `raspberry/src/app/components/tv/tv.component.ts` - Logique affichage watermark
    - `raspberry/src/app/components/tv/tv.component.html` - Overlay watermark
    - `raspberry/src/app/components/tv/tv.component.scss` - Styles et animations
    - `raspberry/sync-agent/src/commands/index.js` - Commande `deploy_asset`
    - `raspberry/sync-agent/src/utils/config-merge.js` - Support merge watermark
    - `central-server/src/types/index.ts` - Types WatermarkConfig
    - `central-server/src/server.ts` - Route assets
    - `central-dashboard/.../site-settings-tab.component.ts` - UI configuration watermark
  - **Migration** : Déployer sync-agent et webapp sur les Pi existants

- **Fix chemin déploiement watermark** : Les assets sont maintenant déployés dans `webapp/assets/` au lieu de `assets/`
  - **Problème** : Le watermark ne s'affichait pas car nginx sert depuis `/home/pi/neopro/webapp/`
  - **Cause** : `deploy-asset.js` écrivait dans `/home/pi/neopro/assets/` (hors du dossier servi par nginx)
  - **Solution** : Le chemin cible est maintenant `/home/pi/neopro/webapp/assets/...`
  - **Fichier modifié** : `raspberry/sync-agent/src/commands/deploy-asset.js`
  - **Migration Pi existants** : Déplacer manuellement les assets ou redéployer via le dashboard
    ```bash
    sudo mkdir -p /home/pi/neopro/webapp/assets/watermarks
    sudo cp /home/pi/neopro/assets/watermarks/* /home/pi/neopro/webapp/assets/watermarks/
    sudo chown -R pi:pi /home/pi/neopro/webapp/assets
    ```

- **Fix watermark non persisté dans le dashboard** : La config watermark reste maintenant visible après déploiement
  - **Problème** : Après déploiement du watermark, le dashboard n'affichait plus la configuration
  - **Cause** : Le composant `site-settings-tab` cherchait la config dans `site.neoProContent.watermark` (inexistant côté serveur) au lieu de `site.local_config_mirror.watermark` (synchronisé par le Pi)
  - **Solution** :
    - Lecture depuis `local_config_mirror.watermark` au lieu de `neoProContent.watermark`
    - Ajout de `OnChanges` pour recharger la config quand le site est mis à jour (après `sync_local_state`)
    - Même correction appliquée pour `scoreOverlay`
  - **Fichier modifié** : `central-dashboard/.../site-settings-tab.component.ts`
  - **Migration** : Rebuild et redéployer le dashboard

- **Fix URLs vidéos incorrectes (FTP vs Supabase)** : L'endpoint `/api/sites/:id/local-content` génère maintenant les URLs correctes selon le backend de stockage
  - **Problème** : Le dashboard affichait des erreurs 404 sur les vidéos car les URLs étaient générées pour FTP même quand les vidéos étaient sur Supabase
  - **Cause** : `getSiteLocalContent()` utilisait toujours `getFtpPublicUrl()` sans détecter le backend réel
  - **Solution** : Ajout de la fonction `getVideoDownloadUrl()` qui détecte automatiquement le backend :
    - Si `storage_path` ne contient pas `/` → FTP (ex: `video.mp4`)
    - Si `storage_path` contient `/` → Supabase (ex: `uploads/video.mp4`)
  - **Fichier modifié** : `central-server/src/controllers/sites.controller.ts`
  - **Migration** : Redéployer le serveur central. Les vidéos existantes sur Supabase fonctionneront à nouveau.

- **Fix table "groups" manquante en production** : Suppression de la dépendance à la table `groups` dans les requêtes de déploiement
  - **Problème** : Erreur 500 sur `/api/videos/:id/deployments` même après ajout des guillemets
  - **Cause** : La table `groups` n'existe pas en production (fonctionnalité non utilisée). Les LEFT JOIN échouaient silencieusement
  - **Solution** : Suppression complète des jointures sur `groups` - affiche "Groupe" comme fallback si `target_type != 'site'`
  - **Fichiers modifiés** :
    - `central-server/src/controllers/content.controller.ts` - 3 requêtes (`getVideoDeployments`, `getDeployments`, `getDeployment`)
    - `central-server/src/controllers/updates.controller.ts` - 2 requêtes (`getUpdateDeployments`, `getUpdateDeployment`)
  - **Note** : Les requêtes CRUD de `groups.controller.ts` gardent les guillemets pour quand la fonctionnalité sera activée
  - **Migration** : Redéployer le serveur central

- **Fix erreur 422 aperçu watermark dans le dashboard** : L'aperçu du watermark utilise maintenant l'URL cloud au lieu du chemin local
  - **Problème** : Erreur HTTP 422 dans la console lors de l'affichage de l'aperçu du watermark dans l'onglet Paramètres
  - **Cause** : Le dashboard essayait de charger l'image depuis `imagePath` (chemin local du Pi comme `assets/watermarks/logo.png`) qui n'existe pas sur Hostinger
  - **Solution** : Ajout d'un champ `cloudUrl` à l'interface `WatermarkConfig` pour stocker l'URL cloud (FTP ou Supabase) de l'image
  - **Priorité des URLs pour l'aperçu** :
    1. `watermarkPreviewUrl` - Preview Base64 lors de l'upload
    2. `watermarkConfig.cloudUrl` - URL cloud (FTP ou Supabase)
    3. `watermarkConfig.imagePath` - Chemin local (fallback)
  - **Fichiers modifiés** :
    - `central-server/src/types/index.ts` - Ajout `cloudUrl?: string` à `WatermarkConfig`
    - `central-server/src/services/asset.service.ts` - `createDefaultWatermarkConfig()` accepte `cloudUrl`
    - `central-server/src/controllers/assets.controller.ts` - Passe `cloudUrl` dans `suggestedConfig`
    - `central-dashboard/src/app/core/services/asset.service.ts` - Ajout `cloudUrl` à l'interface
    - `central-dashboard/.../site-settings-tab.component.ts` - Utilise `cloudUrl` pour l'aperçu
  - **Migration** : Redéployer le serveur central et le dashboard. Les Pi n'ont pas besoin de mise à jour.

- **WiFi Scanner avec BSSID Lock (anti-roaming)** : Nouvelle interface dans l'admin panel pour configurer le WiFi USB
  - **Problème** : En 2.4 GHz avec plusieurs APs du même SSID (répéteurs, mesh), le Pi fait du roaming instable
  - **Solution** : Scanner WiFi dans `:8080` qui permet de fixer le BSSID d'un point d'accès spécifique
  - **Fonctionnalités** :
    - Scan des réseaux WiFi avec `iwlist wlan1 scan`
    - Affichage groupé par SSID avec tous les APs (BSSID, channel, signal)
    - Connexion avec option "Fixer ce point d'accès" qui ajoute `bssid=XX:XX:XX:XX:XX:XX` dans wpa_supplicant
    - Affichage de l'état de connexion actuel (IP, signal, BSSID fixé ou non)
  - **Nouveaux endpoints API** :
    - `GET /api/wifi/scan` - Scanne les réseaux disponibles
    - `POST /api/wifi/connect` - Connecte avec option `lockBssid`
    - `GET /api/wifi/current` - État de connexion actuel
  - **Fichiers modifiés** :
    - `raspberry/admin/admin-server.js` - 3 nouveaux endpoints
    - `raspberry/admin/public/app.js` - Fonctions JS (scanWifiNetworks, connectToWifi, etc.)
    - `raspberry/admin/public/index.html` - UI scanner WiFi dans l'onglet Réseau
    - `raspberry/admin/public/styles.css` - Styles pour le scanner
  - **Migration** : Déployer le dossier `admin/` sur les Pi existants

- **CORS Private Network Access** : Fix des erreurs CORS sur les requêtes depuis le hotspot
  - **Problème** : Chrome bloque les requêtes vers IPs privées (192.168.x.x) depuis des origines publiques
  - **Solution** : Ajout du header `Access-Control-Allow-Private-Network: true`
  - **Fichier modifié** : `raspberry/server/server.js`
  - **Migration** : Déployer `server/server.js` sur les Pi existants

- **Hotspot Info dans le dashboard central** : Le sync-agent remonte maintenant les infos complètes du hotspot
  - **Données remontées** : SSID, mot de passe, channel, nombre de clients connectés, état actif/inactif
  - **Affichage** : Onglet Paramètres > section "Hotspot WiFi" avec données réelles du Pi
  - **Fichiers modifiés** :
    - `raspberry/sync-agent/src/agent.js` - Collecte hotspotInfo (incluant password) dans sync_local_state
    - `raspberry/sync-agent/src/commands/hotspot.js` - getHotspotConfig() retourne aussi le password
    - `central-server/src/services/socket.service.ts` - Stocke \_hotspotInfo dans local_config_mirror
    - `central-dashboard/.../site-settings-tab.component.ts` - Affichage avec bouton actualiser et show/hide password
    - `central-dashboard/src/app/core/services/sites.service.ts` - Interface getHotspotConfig avec password
    - `central-dashboard/src/app/core/models/index.ts` - Type \_hotspotInfo avec password
  - **Migration** : Déployer sync-agent sur les Pi, redéployer le dashboard

- **Hotspot Channel Optimizer (auto-fix au boot)** : Le Pi sélectionne automatiquement le meilleur canal WiFi au démarrage
  - **Problème résolu** : Hotspot invisible après déplacement du boîtier dans un environnement WiFi saturé (canal 6 encombré)
  - **Fonctionnement** :
    - Au boot, scanne les canaux 1, 6, 11 (non-overlapping 2.4GHz)
    - Si le canal actuel a >= 3 réseaux, switch vers le canal le moins encombré
    - Redémarre hostapd pour appliquer le nouveau canal
    - Log dans `/var/log/neopro-hotspot-optimizer.log`
  - **Nouveaux fichiers** :
    - `raspberry/scripts/hotspot-optimizer.sh` - Script de scan et optimisation
    - `raspberry/config/systemd/neopro-hotspot-optimizer.service` - Service oneshot au boot
  - **Fichiers modifiés** :
    - `raspberry/install.sh` - Installation du service
  - **Migration** :
    - Nouvelles installations : automatique via `install.sh`
    - Pi existants : copier le script et le service, puis `systemctl enable neopro-hotspot-optimizer`
  - **Vérification** : `cat /var/log/neopro-hotspot-optimizer.log`

### v2.27.x (Janvier 2026)

- **Système de Brouillons de Configuration + Upload Contextuel** : Permet de préparer des configurations à l'avance
  - **Problème résolu** : Impossible de configurer un site si le Pi est offline ou si les vidéos ne sont pas encore déployées
  - **Nouvelles fonctionnalités** :
    - **Config Drafts** : Un brouillon par site (remplace le précédent), stocké en DB
    - **Upload contextuel** : Zone d'upload dans l'onglet Contenu qui associe automatiquement les vidéos au site
    - **Déploiement orchestré** : Déploie d'abord les vidéos manquantes (priorité 3), puis la config (priorité 5)
    - **Badge site** : Les vidéos uploadées pour un site spécifique affichent ⭐ dans la bibliothèque
  - **Nouvelles tables DB** :
    - `config_drafts` : Stocke les brouillons (un par site via UNIQUE constraint)
    - `orchestrated_deployments` : Suivi des déploiements vidéos + config
    - `videos.uploaded_for_site_id` : Colonne pour le contexte d'upload
  - **Nouveaux fichiers** :
    - `central-server/src/services/draft.service.ts` - Service brouillon backend
    - `central-server/src/services/orchestrated-deployment.service.ts` - Service orchestration
    - `central-server/src/controllers/drafts.controller.ts` + routes
    - `central-dashboard/src/app/core/services/draft.service.ts` - Service Angular
    - `central-dashboard/.../video-upload-zone/` - Composant upload contextuel
    - `central-server/src/scripts/migrations/add-config-drafts.sql`
  - **Fichiers modifiés** :
    - `central-server/src/controllers/content.controller.ts` - Support `site_id` sur upload
    - `central-server/src/routes/content.routes.ts` - Route `/videos/for-site/:siteId`
    - `central-dashboard/.../site-content-tab.component.ts` - Intégration brouillon + upload
    - `central-dashboard/.../video-library.component.ts` - Badge ⭐ pour vidéos du site
    - `central-dashboard/.../site-detail.component.ts` - Passage siteName
    - `central-dashboard/src/app/core/models/index.ts` - `uploadedForSiteId` sur CloudVideo
  - **Migration** : Exécuter `add-config-drafts.sql` pour créer les tables
  - **Documentation** : [docs/guides/CONFIG_DRAFTS.md](docs/guides/CONFIG_DRAFTS.md)

- **Élimination des 404 sur endpoint /draft** : L'endpoint retourne maintenant `{ draft: null }` au lieu d'un 404
  - **Problème** : Le navigateur affichait une erreur 404 dans la console DevTools lors du chargement d'un site sans brouillon
  - **Cause** : L'endpoint `GET /sites/:id/draft` retournait un 404 si pas de brouillon
  - **Solution** : L'endpoint retourne maintenant `{ draft: null }` (HTTP 200), le service Angular extrait le champ `draft`
  - **Fichiers modifiés** :
    - `central-server/src/controllers/drafts.controller.ts` - Retourne `{ draft: null }` au lieu de 404
    - `central-dashboard/src/app/core/services/draft.service.ts` - `getDraft()` retourne `Observable<ConfigDraft | null>`
    - `central-dashboard/.../site-content-tab.component.ts` - Simplifié, plus de check `error.status !== 404`
    - `central-dashboard/src/app/core/interceptors/error.interceptor.ts` - Suppression du code `isDraft404` devenu inutile
  - **Migration** : Rebuild et redéployer le dashboard + API

- **Support Raspberry Pi 5 (driver V3D natif)** : Rendu GPU via le driver Mesa V3D pour le Pi 5
  - **Problème** : Le Pi 5 utilise VideoCore VII, nécessitant une configuration Chromium adaptée
  - **Solution finale (v3.7.3)** : Aucun flag GPU custom. Chromium utilise le driver V3D natif (Mesa) par défaut, identique au navigateur normal. Flags minimaux : `--ignore-gpu-blocklist --enable-gpu-rasterization`
  - **Historique des tentatives** :
    - SwiftShader (v2.27) : Rendu CPU, stable mais vidéos saccadées
    - EGL natif + Vulkan (v3.7.1) : Erreurs SharedImageStub toutes les 5 secondes
    - Retour SwiftShader + optimisations (v3.7.2) : Toujours trop lent
    - **Suppression flags GPU (v3.7.3)** : ✅ Solution finale, vidéos fluides
  - **Note** : Le Pi 5 n'a pas de décodeur H.264 hardware (supprimé), seul H.265/HEVC est accéléré. Le décodage vidéo reste en CPU (FFmpeg) mais le compositing V3D est rapide.
  - **Détection automatique** : Le script `kiosk-watchdog.sh` détecte le modèle de Pi et applique les bons flags
  - **Fichiers modifiés** :
    - `raspberry/scripts/kiosk-watchdog.sh` - Détection Pi 4 vs Pi 5, flags GPU adaptés
    - `docs/guides/TROUBLESHOOTING.md` - Section Pi 5
  - **Migration Pi 5 existants** : Copier le nouveau `kiosk-watchdog.sh` et `sudo systemctl restart neopro-kiosk`

- **Fix faux avertissement GPU sur Pi 5 dans le dashboard** : Le health check ignore maintenant la valeur legacy `gpu=4M` sur Pi 5
  - **Problème** : Le dashboard central affichait "Mémoire GPU insuffisante (4M)" sur Pi 5, alors que ce n'est pas un problème
  - **Cause** : `vcgencmd get_mem gpu` retourne toujours 4M sur Pi 5 (valeur legacy, pas la mémoire réelle)
  - **Solution** : Le sync-agent détecte le modèle Pi via `/proc/device-tree/model` et ignore la vérification gpu_mem sur Pi 5
  - **Affichage Pi 5** : Le dashboard affiche "🎮 GPU (Pi 5)" et "✅ Dynamique (CMA)" au lieu d'un avertissement
  - **Nouveaux champs** : `is_pi5: boolean`, `gpu_mem_note: string` dans l'objet `gpuInfo`
  - **Fichiers modifiés** :
    - `raspberry/sync-agent/src/metrics.js` - Ajout `detectPiModel()`, `is_pi5`, `gpu_mem_note`
    - `central-dashboard/.../site-debug-tab.component.ts` - Interface `GpuInfo` étendue, template adapté
  - **Migration** : Déployer la nouvelle version du sync-agent via l'admin panel ou SCP

- **Fix modals "Voir" et "Diff" non visibles dans l'historique des configurations** : Scroll automatique vers le modal
  - **Problème** : En cliquant sur "Voir" ou "Diff" dans l'historique des configurations, rien ne semblait se passer
  - **Cause** : Les modals s'affichaient en bas de la liste d'historique mais hors de la zone visible de l'écran
  - **Solution** : Ajout d'un scroll automatique (`scrollIntoView`) vers le modal après son ouverture
  - **Implémentation** :
    - Ajout de `ViewChild` pour référencer les éléments `#versionModal` et `#diffModal`
    - Ajout de `AfterViewChecked` pour détecter quand le DOM est mis à jour
    - Flags `shouldScrollToVersionModal` et `shouldScrollToDiffModal` pour déclencher le scroll
  - **Fichiers modifiés** :
    - `central-dashboard/.../site-debug-tab.component.ts` - Scroll automatique vers les modals
  - **Migration** : Aucune (amélioration UX)

- **Fix warnings de build Angular** : Correction des warnings NG8107 et ajustement du budget CSS
  - **NG8107 (optional chaining inutile)** : 9 occurrences corrigées
    - `site-content-tab.component.ts` : `config.sponsors?.length` → `config.sponsors.length`
    - `site-debug-tab.component.ts` : `bufferStatus.analytics?.event_count` → `bufferStatus.analytics.event_count` (et similaires pour sponsors)
  - **Budget CSS** : Augmenté de 15kb/20kb à 20kb/25kb dans `angular.json`
    - Les composants `site-content-tab`, `config-editor`, `site-debug-tab` dépassaient le budget
  - **Fichiers modifiés** :
    - `central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts`
    - `central-dashboard/src/app/features/sites/components/site-debug-tab/site-debug-tab.component.ts`
    - `central-dashboard/angular.json`
  - **Migration** : Aucune (fix interne)

### v2.27.x (Janvier 2026)

- **Fix Debug Tab endpoints** : Les fonctionnalités debug retournent maintenant les données réelles du Pi
  - **Problème racine** : `sendCommand()` ne retourne que `{success, commandId, message}`, pas les données
  - **Solution** : Endpoints dédiés utilisant `waitForCommandResult()` pour attendre les résultats
  - **Endpoints créés/corrigés** :
    - `GET /sites/:id/debug-bundle` - Export rapport complet pour support technique
    - `POST /sites/:id/fix-hotspot` - Diagnostics et réparation hotspot WiFi
    - `GET /sites/:id/health-status` - État de santé système (existait déjà)
    - `GET /sites/:id/diagnostics` - Diagnostics complets via diagnose-pi.sh
    - `GET /sites/:id/network-diagnostics` - Diagnostics réseau détaillés
    - `GET /sites/:id/logs` - Récupération des logs de services
  - **Pattern utilisé** : `dispatchCommand()` + `waitForCommandResult(commandId, timeout)`
  - **Fix Timeline 500** : Query `content_deployments` corrigée (`target_id` + `target_type` au lieu de `site_id`)
  - **Fichiers modifiés** :
    - `central-server/src/controllers/sites.controller.ts` - Ajout `exportDebugBundle`, `fixHotspot`
    - `central-server/src/routes/sites.routes.ts` - Routes `/debug-bundle`, `/fix-hotspot`
    - `central-dashboard/src/app/core/services/sites.service.ts` - Méthodes `exportDebugBundle()`, `fixHotspot()`
    - `central-dashboard/.../site-debug-tab.component.ts` - Utilise les nouveaux endpoints
  - **Migration** : Aucune (fix backend + rebuild dashboard requis)

### v2.26.x (Janvier 2026)

- **Améliorations Debug Tab (P3)** : Refactoring majeur de l'onglet Debug dans le dashboard
  - **P3.1 - Suppression section Sync Info** : Section redondante supprimée (info déjà dans l'onglet État)
  - **P3.2 - Fusion commandes/terminal** : Les boutons de commandes rapides intégrés dans la section Terminal
    - Boutons : Get Config, Get Logs, Network Diag, Update Software
    - Suppression du dropdown séparé
  - **P3.3 - Export debug bundle** : Export JSON pour le support technique
    - Nouvelle commande `export_debug_bundle` dans le sync-agent
    - Collecte : configuration (sanitisée), version, santé système, services, logs (100 lignes), réseau, disque, buffers, hotspot config, boot config, liste vidéos
    - Téléchargement d'un fichier `debug-bundle-{siteName}-{date}.json`
  - **P3.4 - Timeline d'activité** : Historique des événements récents par site
    - Nouvel endpoint `/api/sites/:id/timeline` qui agrège :
      - `content_deployments` (déploiements vidéo)
      - `remote_commands` (commandes exécutées)
      - `config_history` (changements de configuration)
      - `alerts` (alertes système)
    - UI avec timeline visuelle, icônes colorées par type, compteurs
  - **Fichiers modifiés** :
    - `central-dashboard/.../site-debug-tab/site-debug-tab.component.ts` - Refactoring complet
    - `central-server/src/controllers/sites.controller.ts` - Ajout `getSiteTimeline`
    - `central-server/src/routes/sites.routes.ts` - Route timeline
    - `central-dashboard/src/app/core/services/sites.service.ts` - Méthode `getTimeline()`
    - `raspberry/sync-agent/src/commands/index.js` - Commande `export_debug_bundle`
    - `raspberry/sync-agent/src/metrics.js` - Méthodes `getGpuInfo()`, `getServicesStatus()`, `getHealthStatus()`
    - `central-server/src/services/command-queue.service.ts` - `export_debug_bundle` dans REALTIME_ONLY_COMMANDS
  - **Migration** : Aucune (amélioration UI)

### v2.25.x (Janvier 2026)

- **Throttling des logs frontend** : Évite les erreurs 429 sur `/api/logs/frontend`
  - **Problème** : Lors de la connexion Socket.IO, plusieurs logs étaient envoyés simultanément, dépassant le rate limit de 200/min
  - **Symptôme** : Erreur `POST 429 (Too Many Requests)` visible dans la console du navigateur
  - **Solution** : `LoggerService` implémente maintenant un batching RxJS côté client
  - **Batching** : Logs accumulés pendant 2 secondes (ou 20 logs max) puis envoyés en batch
  - **Rate limit silencieux** : Les erreurs 429 sont ignorées sans polluer la console
  - **Console en prod** : Seuls `error` et `warn` affichés, `info`/`debug` → Logtail uniquement
  - **Fichiers modifiés** :
    - `central-dashboard/src/app/core/services/logger.service.ts` - Ajout batching + suppression logs console INFO/DEBUG en prod
  - **Migration** : Aucune (amélioration transparente)

- **Audit des événements live match** : Traçabilité complète des matchs et scores
  - **Nouvelles actions d'audit** : `MATCH_STARTED`, `MATCH_CONFIG_UPDATED`, `MATCH_ENDED`, `SCORE_UPDATED`
  - **match-config.handler.ts** : Audite création/mise à jour des sessions de match
  - **score-update.handler.ts** : Audite les changements de score (throttlé à 1 entrée/minute/site)
  - **Bug fix** : `/api/audit/actions` inclut maintenant `REMOTE_SHELL_EXECUTE`, `REMOTE_SHELL_BLOCKED`
  - **Fichiers modifiés** :
    - `central-server/src/services/audit.service.ts` - Nouveaux types + helpers
    - `central-server/src/handlers/match-config.handler.ts` - Appels audit
    - `central-server/src/handlers/score-update.handler.ts` - Appels audit (throttlés)
    - `central-server/src/routes/audit.routes.ts` - Liste complète des actions
  - **Migration** : Aucune (ajout de fonctionnalité)

### v2.24.x (Janvier 2026)

- **Configuration gpu_mem automatique** : Le script d'installation configure maintenant `gpu_mem=256` dans `/boot/config.txt`
  - **Problème** : Raspberry Pi OS Lite met gpu_mem à 4M par défaut, insuffisant pour Chromium avec 4 players vidéo
  - **Symptôme** : Crash "Aw, Snap! Error code: 5" après 1-2h de boucle vidéo
  - **Solution** : `install.sh` détecte et configure `gpu_mem=256` automatiquement
  - **Pi existants** : Exécuter manuellement `echo "gpu_mem=256" | sudo tee -a /boot/config.txt && sudo reboot`
  - **Fichiers modifiés** :
    - `raspberry/install.sh` - Ajout fonction `configure_gpu_memory()`
  - **Migration** : Pour les Pi déjà installés, ajouter `gpu_mem=256` dans `/boot/config.txt` et reboot

- **Watchdog Kiosk pour crashs Chromium "Aw, Snap!"** : Récupération automatique au niveau système
  - **Problème** : Chromium affiche "Aw, Snap! Error code: 5" mais ne quitte pas - le service systemd ne redémarre pas
  - **Solution** : Script `kiosk-watchdog.sh` qui surveille et relance Chromium
  - **Détection** : Titre fenêtre via xdotool, logs GPU, pression mémoire
  - **Actions** : Kill Chromium, vide cache, libère mémoire GPU, relance après délai
  - **Anti-boucle** : Après 3 crashs en 5 min, attend 60s pour laisser le GPU refroidir
  - **Fichiers modifiés** :
    - `raspberry/scripts/kiosk-watchdog.sh` - Script watchdog (nouveau)
    - `raspberry/config/systemd/neopro-kiosk.service` - Utilise le watchdog
  - **Migration** : Copier le script + service, puis `sudo systemctl daemon-reload && sudo systemctl restart neopro-kiosk`

- **Système de récupération d'erreurs vidéo** : Le composant TV récupère automatiquement des crashs
  - **Problème** : Après 2h+ de boucle, error code 5 (MEDIA_ERR_DECODE) causait un écran blanc
  - **Solution** : Error handlers sur les 4 players + watchdog + cleanup mémoire périodique
  - **Error handlers** : Chaque player HTML5 a maintenant un listener `error` qui skip la vidéo corrompue
  - **Watchdog** : Vérifie toutes les 10s que la vidéo progresse, tente recovery si bloquée
  - **Full reset** : Après 3 erreurs consécutives, reset complet avec pause GPU de 3s
  - **Memory cleanup** : Toutes les 30 min OU après 50 vidéos (canvas, buffers inactifs)
  - **Fichiers modifiés** :
    - `raspberry/src/app/components/tv/tv.component.ts` - Error recovery system complet
  - **Migration** : Déployer via OTA ou build + deploy

### v2.22.x (Janvier 2026)

- **Fix cache miniatures après régénération** : Le bouton "Miniatures" de l'admin panel rafraîchit maintenant correctement l'affichage
  - **Problème** : Après régénération des miniatures, le navigateur gardait les anciennes images en cache (ou les erreurs 404)
  - **Solution** : Ajout d'un cache-buster (`?t=<timestamp>`) aux URLs des miniatures
  - **Admin panel** : Utilise l'API synchrone `/api/thumbnails/regenerate-sync`, attend la fin, puis rafraîchit l'affichage
  - **Remote** : Le bouton "Actualiser" met à jour le cache-buster pour recharger les miniatures
  - **Fichiers modifiés** :
    - `raspberry/admin/public/app.js` - Variable `thumbnailCacheBuster`, fonction `regenerateThumbnails()` améliorée
    - `raspberry/src/app/components/remote/remote.component.ts` - Cache-buster dans `getVideoThumbnailUrl()`
  - **Migration** : Déployer via OTA ou build + deploy

- **Fix miniature perdue lors du renommage vidéo** : La miniature est maintenant déplacée/renommée avec la vidéo
  - **Problème** : Quand on renomme une vidéo via l'admin panel, la miniature restait avec l'ancien nom
  - **Solution** : L'API `/api/videos/edit` déplace maintenant aussi la miniature correspondante
  - **Fichiers modifiés** :
    - `raspberry/admin/admin-server.js` - Ajout de la logique de déplacement de miniature dans `/api/videos/edit`
  - **Migration** : Déployer via OTA ou build + deploy

- **Refactoring Bibliothèque Vidéo** : Amélioration majeure du composant VideoLibrary
  - **Fix doublons** : Déduplication robuste par ID + nom de fichier (case-insensitive)
    - Ajout de Sets `seenCloudIds` et `seenFilenames` pour tracker les vidéos traitées
    - Évite les vidéos en double quand le même fichier est dans le cloud et sur le Pi
  - **Fix "NaN undefined"** : Protections contre les valeurs invalides
    - Ajout de `!isNaN(totalSize)` dans le template
    - `formatDuration()` vérifie `Number.isFinite(seconds)`
    - Exposition de `isNaN` au template Angular
  - **Colonne catégorie** : Nouvelle colonne triable dans la liste
    - Style `.col-category` avec ellipsis
    - Tri par catégorie supporté
  - **Confirmation suppression** : Modal avant suppression
    - Propriété `deleteConfirmVideo` pour stocker la vidéo à supprimer
    - Méthodes `confirmDelete()` et `cancelDelete()`
    - Styles CSS `.confirm-overlay` et `.confirm-modal`
  - **Sélection multiple** : Actions groupées sur plusieurs vidéos
    - Bouton `☑️` pour activer le mode sélection
    - Checkboxes sur chaque ligne + header
    - Barre d'actions : "🚀 Déployer (N)" et "🗑️ Supprimer (N)"
    - Nouveaux outputs : `bulkDeploy` et `bulkDelete`
  - **Durée totale** : Affichage du total des durées dans le header
    - Format `Xh00` si > 1 heure
  - **Fichiers modifiés** :
    - `central-dashboard/src/app/features/sites/components/video-library/video-library.component.ts`
    - `central-dashboard/src/app/core/models/index.ts` (ajout `duration` à `LocalVideo`)
  - **Migration** : Aucune (amélioration UI)

- **Extraction durée vidéo via ffprobe** : Le Pi extrait maintenant la durée des vidéos
  - **Fonctionnement** : `ffprobe` extrait la durée en secondes, stockée dans un cache `.video-durations.json`
  - **Vérification ffprobe** : Au démarrage, le watcher vérifie si `ffprobe` est disponible
  - **Cache intelligent** : Même logique que les checksums (invalidé si taille/mtime change)
  - **Extraction asynchrone** : Queue de traitement avec pause 200ms entre fichiers
  - **Données remontées** : La durée est incluse dans `sync_local_state` → `local_config_mirror._localVideos`
  - **Fichiers modifiés** :
    - `raspberry/sync-agent/src/watchers/video-watcher.js`
  - **Prérequis** : `ffprobe` doit être installé sur le Pi (`sudo apt install ffmpeg`)
  - **Migration** : Déployer le nouveau sync-agent, les durées seront extraites progressivement

### v2.21.x (Janvier 2026)

- **Fix déploiement mot de passe télécommande /remote** : Le bouton "Déployer" dans l'onglet Paramètres ne mettait pas à jour le mot de passe sur le Pi
  - **Bug** : Le dashboard envoyait `{ remotePassword, clubName }` dans `neoProContent`, mais le sync-agent ne traitait pas ces champs
  - **Symptôme** : Le mot de passe /remote/login ne changeait jamais malgré le message "Configuration déployée"
  - **Cause** : Le frontend `/remote` lit `config.auth.password`, mais ni `update_config` (mode merge/replace) ni `config-merge.js` ne géraient `remotePassword`
  - **Fix** : Ajout du mapping `remotePassword` → `auth.password` et `clubName` → `auth.clubName` dans :
    - `sync-agent/src/commands/index.js` (mode replace)
    - `sync-agent/src/utils/config-merge.js` (mode merge)
  - **Migration** : Déployer le nouveau sync-agent sur les Pi (SCP ou update_software)
- **Suppression du bouton "Mise à jour Sync-Agent"** : Bouton non fonctionnel supprimé de l'onglet Paramètres
  - **Problème** : Le bouton envoyait `agentFiles: {}` (objet vide), donc ne mettait rien à jour
  - **Impact** : Le sync-agent redémarrait mais sans modification de fichiers
  - **Solution** : Utiliser le bouton "Mettre à jour le logiciel" dans l'onglet Debug (commande `update_software`)
  - **Fichiers supprimés** :
    - `site-settings-tab.component.ts` : bouton, propriété `updatingSyncAgent`, méthode `updateSyncAgent()`
    - `sites.service.ts` : méthode `updateSyncAgent()`
    - `commands/index.js` : mode `update_agent` (code mort)
  - **Migration** : Aucune (suppression de code mort)
- **Fix path concatenation dans update-software.js** : Les mises à jour OTA échouaient avec "No such file or directory"
  - **Bug** : `update-software.js` concaténait `${sourcePath}webapp/*` au lieu de `${sourcePath}/webapp/*`
  - **Symptôme** : Erreur `cp: cannot stat '/tmp/neopro-update-extractwebapp/*': No such file or directory`
  - **Cause** : `sourcePath` se terminait par `/` et on ajoutait directement `webapp/*` sans slash
  - **Fix** : Utilisation de `path.join(sourcePath, 'webapp')` pour tous les composants (webapp, server, sync-agent, admin, scripts)
  - **Fichier modifié** : `raspberry/sync-agent/src/commands/update-software.js`
  - **Migration** : Pour les Pi avec l'ancienne version, envoyer le fichier corrigé via SCP ou `cat | ssh` avant de relancer la mise à jour OTA
- **Fix permission denied sur VERSION/release.json** : Erreur `EACCES: permission denied, unlink '/home/pi/neopro/VERSION'`
  - **Bug** : `fs.copy()` et `fs.writeFile()` échouaient si le fichier VERSION appartenait à `root`
  - **Symptôme** : Mise à jour échoue à 60% avec erreur de permission sur `/home/pi/neopro/VERSION`
  - **Cause** : Le fichier VERSION pouvait avoir été créé par un script root lors de l'installation initiale
  - **Fix** : Utilisation de `sudo cp` et `sudo tee` avec `sudo chown pi:pi` pour écrire VERSION et release.json
  - **Fichier modifié** : `raspberry/sync-agent/src/commands/update-software.js`
  - **Migration** : Pour les Pi bloqués, corriger manuellement avec `sudo chown pi:pi /home/pi/neopro/VERSION /home/pi/neopro/release.json` puis relancer la mise à jour
- **Fix bulk upload sans checksum** : L'upload multi-fichiers ne calculait pas le checksum SHA256
  - **Bug** : `POST /videos/bulk` n'appelait pas `calculateChecksum()` et n'incluait pas le checksum dans l'INSERT
  - **Symptôme** : Déploiement échoue avec "Video checksum is required for deployment" (progress 0%)
  - **Cause** : Le code bulk upload (lignes 332-377) avait été copié de l'upload simple mais le calcul du checksum avait été oublié
  - **Fix** : Ajout de `const checksum = calculateChecksum(file.buffer)` et inclusion dans la requête INSERT
  - **Fichier modifié** : `central-server/src/controllers/content.controller.ts`
  - **Migration** : Les vidéos uploadées via bulk avant ce fix doivent être ré-uploadées (supprimer puis ré-uploader)

### v2.16.x (Janvier 2026)

- **Fix live-score affiché par défaut** : Le score/timer/animation s'affichait même quand l'admin l'avait désactivé
  - **Bug** : `tv.component.html` vérifiait uniquement `localOptions.overlay.scoreEnabled` (localStorage, défaut `true`) et ignorait `configuration.liveScoreEnabled` (du central)
  - **Symptôme** : Score visible sur la TV même avec `liveScoreEnabled: false` dans le dashboard central
  - **Fix** : Ajout de `configuration?.liveScoreEnabled &&` aux conditions d'affichage :
    - Score overlay (ligne 16)
    - Timer overlay (ligne 88)
    - Animation de but (ligne 105)
  - **Changement valeur par défaut** : `localOptions.overlay.scoreEnabled` passe de `true` à `false`
  - **Nouvelle logique** : L'affichage requiert les DEUX conditions :
    - `configuration.liveScoreEnabled` = true (contrôlé par l'admin central)
    - `localOptions.overlay.scoreEnabled` = true (contrôlé par le staff du club)
  - **Fichiers modifiés** :
    - `raspberry/src/app/components/tv/tv.component.html`
    - `raspberry/src/app/services/local-options.service.ts`
    - `raspberry/public/configuration.json`
  - **Migration** : Déployer la nouvelle version. Les Pi avec localStorage existant gardent leur valeur, le staff peut désactiver via les options de la télécommande.
- **Politique de rétention des données** : Nettoyage automatique de la DB et limites buffers Pi
  - Jobs cron quotidiens pour nettoyer les tables volumineuses
  - `video_plays`, `sponsor_impressions` : 90 jours
  - `metrics` : 7 jours
  - `config_history` : 20 versions par site
  - `remote_commands` : 30 jours
  - `alerts`, `audit_logs` : 90 jours
  - Buffers Pi (`analytics_buffer.json`, `sponsor_impressions.json`) : limite 50K événements (FIFO)
  - Migration : Exécuter `add-data-retention-cleanup.sql`, déployer `analytics.js` et `sponsor-impressions.js` sur les Pi

### v2.15.x (Janvier 2026)

- **Build raspberry robuste avec vérification d'intégrité (v2.15.4)** : Le script `build-raspberry.sh` vérifie maintenant tous les fichiers critiques avant de créer l'archive
  - Vérification de 15+ fichiers critiques sync-agent (agent.js, commands/, utils/, watchers/, services/)
  - Vérification des dépendances npm critiques (socket.io-client, axios, fs-extra, winston)
  - Vérification des fichiers admin (admin-server.js, package.json, node_modules/)
  - Vérification webapp (index.html) et server (server.js)
  - **Le build échoue** si un fichier critique manque → évite les déploiements corrompus
  - Affichage du résumé : nombre de fichiers, dossiers, taille totale
  - Migration : Aucune (amélioration du workflow de build)
- **Synchronisation automatique des versions sous-packages** : Les versions de `raspberry/admin/`, `raspberry/sync-agent/`, `raspberry/server/` sont maintenant synchronisées automatiquement avec la version principale lors du build
  - Fonction `sync_subpackage_versions()` dans `build-raspberry.sh`
  - Évite les problèmes de version incohérente entre packages
  - Migration : Aucune (amélioration du workflow de build)
- **node_modules inclus dans l'archive de déploiement** : Plus besoin de `npm install` sur le Pi après déploiement
  - `npm install --production` exécuté pendant le build pour sync-agent et admin
  - Les dépendances sont incluses dans l'archive tar.gz
  - Évite les erreurs `MODULE_NOT_FOUND` après déploiement
  - Migration : Aucune (amélioration transparente)
- **npm install dans update-software.js** : En cas de déploiement via le dashboard central, `npm install --production` est maintenant exécuté pour sync-agent
  - Fallback si les node_modules ne sont pas dans l'archive
  - Migration : Mettre à jour `update-software.js` sur les Pi existants
- **Fix update_software aligné sur deploy-remote.sh (v2.15.1)** : Correction critique du déploiement via central/admin
  - **Bug** : `update-software.js` utilisait `tar -xzf` direct dans `/home/pi/neopro/` au lieu d'extraire dans un dossier temporaire puis copier avec `cp -r`
  - **Symptôme** : Fichiers manquants dans `sync-agent/src/utils/` (ex: `version-info.js`) après mise à jour via dashboard central ou admin panel `:8080`
  - **Cause** : Le `tar` direct n'écrasait pas proprement les sous-dossiers, et les erreurs étaient masquées par `|| true`
  - **Fix** : Alignement sur la logique de `deploy-remote.sh` et `admin-server.js` :
    - Extraction dans `/tmp/neopro-update-extract/` (dossier temporaire)
    - Détection automatique du format d'archive (legacy `deploy/` ou nouveau)
    - Copie explicite de chaque composant avec `cp -r` (webapp, server, sync-agent, admin, scripts)
    - Sauvegarde/restauration des configs locales (`.env`, `configuration.json`)
    - Meilleure gestion d'erreur (plus de `|| true` masquant les erreurs)
  - **Ajouts** : `sync-agent` ajouté au backup et rollback
  - **Migration** : Mettre à jour `sync-agent/src/commands/update-software.js` sur les Pi existants via SCP ou redéploiement complet
- **Envoi analytics par batches** : Évite les timeouts avec de gros volumes
  - Envoi par lots de 100 événements au lieu de tout d'un coup
  - Timeout de 15s par batch, pause de 500ms entre batches
  - Sauvegarde progressive du buffer après chaque batch réussi
  - Si un batch échoue, les données restantes sont préservées pour réessai
  - Migration : `scp raspberry/sync-agent/src/analytics.js pi@neopro.local:/home/pi/neopro/sync-agent/src/`
- **Logging corrigé** : Messages d'erreur maintenant visibles dans les logs
  - Fix du format Winston : `logger.error('msg', { error })` au lieu de `logger.error('msg:', error)`
  - Fichiers corrigés : `analytics.js`, `sponsor-impressions.js`, `agent.js`, `deploy-video.js`, `update-software.js`
  - Migration : Déployer les fichiers corrigés via SCP
- **Détection connexions zombies sync-agent** : Le Pi détecte et récupère des connexions mortes
  - Ajout vérification `socket.connected` dans `sendHeartbeat()` avant envoi
  - Ajout détection zombie dans `handlePingCheck()` si ping reçu mais socket morte
  - Ajout health check périodique (60s) qui vérifie la cohérence flag/socket
  - Auto-reconnexion si zombie détecté via `this.socket.connect()`
  - Migration : Mettre à jour `sync-agent/src/agent.js` sur les Pi existants (SCP)
- **Tri alphabétique résultats de recherche (Remote)** : Les résultats de recherche sur `/remote` sont maintenant triés
  - Utilisation de `sortByName()` avec `localeCompare` et `numeric: true`
  - Migration : Aucune (mise à jour automatique via déploiement)

### v2.14.x (Janvier 2026)

- **Fix URL téléchargement vidéo (v2.14.4)** : Correction critique du déploiement vidéo
  - Bug : `deployment.service.ts` générait toujours des URLs Supabase même pour les fichiers FTP
  - Symptôme : Erreur 400 sur le Pi lors du téléchargement
  - Fix : Ajout `getVideoDownloadUrl()` qui détecte le type de stockage via le format du `storage_path`
  - FTP = pas de `/` dans le path → utilise `getFtpPublicUrl()`
  - Supabase = path contient `/` → utilise `getPublicUrl()`
  - Migration : Aucune (fix serveur uniquement)
- **Nommage fichiers lisible (v2.14.3)** : Les vidéos gardent leur nom original
  - Avant : UUID (`f07d625a-3e85-45a0-94d7-de8462a07bfd.mp4`)
  - Après : Nom sanitisé (`Decathlon_FOCUS_Partenaire.mp4`)
  - Sanitization : accents supprimés, espaces → `_`, caractères spéciaux supprimés
  - Doublons : suffixe numérique (`video_1.mp4`, `video_2.mp4`)
  - Migration : Les nouveaux uploads utilisent le nouveau format, anciens inchangés
- **Affichage nom vidéo dashboard** : `displayName` pour l'affichage utilisateur
  - Utilise `title || original_name || filename` pour l'affichage
  - Le `filename` technique (potentiellement UUID) reste en tooltip
  - Migration : Aucune (amélioration UI)
- **Video Deployment Queue** : Alignement sur le pattern `update_config`/`update_software`
  - `deployment.service.ts` utilise maintenant `commandQueueService.sendOrQueue()`
  - Sites offline : commandes mises en queue, envoyées automatiquement à la reconnexion
  - Feedback dashboard amélioré : "Envoyé" vs "En attente de reconnexion"
  - Migration : Aucune (amélioration transparente)

### v2.11.x (Janvier 2026)

- **Optimisations mémoire Railway Hobby plan** : Le serveur fonctionne avec ~40 MB de heap
  - Pool DB réduit de 20 à 5 connexions (`database.ts`)
  - Logs Winston réduits de 10MB×5 à 2MB×2 (`logger.ts`)
  - Pending commands Socket.IO réduit de 500 à 100 (`socket.service.ts`)
  - Pong entries réduit de 200 à 50
  - Seuils mémoire ajustés : warning 88%, critical 93%, emergency 97%
  - Debug logging coûteux supprimé dans `isConnected()`
  - Migration : Aucune (optimisation transparente)
- **Audit Actions** : Ajout `REMOTE_SHELL_EXECUTE` et `REMOTE_SHELL_BLOCKED`
  - Migration : Aucune (nouveaux types d'audit)

### v2.6.x (Janvier 2026)

- **Restauration Config Historique** : Le bouton "Restaurer" dans l'onglet Debug déploie directement
  - Mode `replace` pour restaurer exactement la configuration historique
  - Conversion automatique `configuration` → `neoProContent` côté serveur
  - Sync-agent : support du mode `replace` avec `neoProContent`
  - Migration : Mettre à jour le sync-agent sur les Pi existants
- **Permissions webapp** : Corrigé le groupe `pi:www-data` → `pi:pi`
  - Évite les erreurs `EACCES` lors de la création de `configuration.backup.json`
  - `www-data` est ajouté au groupe `pi` pour l'accès nginx
  - Migration : `sudo chown -R pi:pi /home/pi/neopro/webapp && sudo usermod -a -G pi www-data`
- **Dashboard Polling** : Optimisation pour éviter les erreurs 429 (rate limit)
  - `connection-indicator` : Nouvel input `[externalStatus]` pour recevoir les données du parent
  - `site-detail` : Polling réduit de 10s à 30s
  - Migration : Aucune (amélioration performance)
- **Error Handling** : Système de correlation ID et logs structurés
  - Migration : Aucune (amélioration debugging)
- **i18n** : Support ngx-translate pour le dashboard
  - Migration : Aucune (rétrocompatible)

### v2.2.0 (Janvier 2026)

- **Dashboard** : Refactoring complet de `site-detail.component.ts`
  - Nouvelle architecture avec 4 tabs : État / Contenu / Paramètres / Debug
  - Composants modulaires dans `features/sites/components/`
  - `RemotePreviewComponent` remplace `PhaseConfiguratorComponent`
- **Boucles par Phase** : Support N vidéos par phase (était limité à 1)
  - Migration : Aucune (rétrocompatible)
- **Mapping Analytics** : Support mapping au niveau sous-catégorie
  - Migration : Aucune (rétrocompatible, ancien mapping au niveau catégorie fonctionne)

### v2.0.0 (Décembre 2024)

- **Auth** : Cookie `neopro_token` remplace `session_token`
  - Migration : Les users doivent se reconnecter
- **API** : `/api/sponsors/*` renommé `/api/advertisers/*`
  - Migration : Mettre à jour les appels frontend
- **DB** : Table `sponsors` → `advertisers`
  - Migration : `npm run db:migrate` (auto-rename)

### v1.5.0 (Novembre 2024)

- **Socket.IO** : Protocol v4 obligatoire
  - Migration : Mettre à jour `socket.io-client` sur les Pi
- **Config** : Format JSON v2 pour `configuration.json`
  - Migration : Script `scripts/migrate-config-v2.sh`

### v1.0.0 (Octobre 2024)

- Release initiale

---

## FAQ Développeur

### Comment ajouter une nouvelle route API ?

1. Créer le contrôleur : `src/controllers/feature.controller.ts`
2. Créer les routes : `src/routes/feature.routes.ts`
3. Ajouter le schéma Joi : `src/middleware/validation.ts`
4. Importer dans `src/routes/index.ts`
5. Ajouter les tests : `src/controllers/feature.controller.test.ts`

### Comment ajouter une colonne en DB ?

1. Créer migration : `src/scripts/migrations/YYYYMMDD_add_column.sql`
2. Mettre à jour types : `src/types/index.ts`
3. Run : `npm run db:migrate`
4. **Ne jamais** modifier une migration existante

### Comment déployer sur un nouveau Pi ?

```bash
# Méthode remote (recommandée)
curl -O https://raw.githubusercontent.com/.../setup-remote-club.sh
chmod +x setup-remote-club.sh
./setup-remote-club.sh

# Méthode locale (dev)
./raspberry/scripts/setup-new-club.sh
```

### Comment debug un Pi à distance ?

```bash
# Connexion SSH
ssh pi@neopro.local  # ou IP directe

# Logs en temps réel
sudo journalctl -u neopro-app -f
sudo journalctl -u neopro-sync -f

# Diagnostic complet
cd /home/pi/neopro && ./scripts/diagnose-pi.sh

# Redémarrer
sudo systemctl restart neopro-app neopro-sync
```

### Comment tester les emails en local ?

```bash
# Utiliser Mailhog (docker)
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog

# Config .env
SMTP_HOST=localhost
SMTP_PORT=1025

# Voir emails : http://localhost:8025
```

---

## Glossaire Métier

| Terme                | Définition                                                         |
| -------------------- | ------------------------------------------------------------------ |
| **Site**             | Un club sportif équipé d'un Raspberry Pi + TV                      |
| **Boîtier**          | Le Raspberry Pi physique installé dans un club                     |
| **Flotte**           | L'ensemble des boîtiers gérés (50+)                                |
| **Déploiement**      | Envoi d'une vidéo du cloud vers un ou plusieurs Pi                 |
| **Heartbeat**        | Signal envoyé toutes les 30s par le Pi au cloud                    |
| **Sync**             | Synchronisation bidirectionnelle Pi ↔ Cloud                        |
| **Config mirror**    | Copie de la config locale stockée dans le cloud                    |
| **VideoWatcher**     | Surveillance du dossier vidéos sur le Pi                           |
| **LocalVideo**       | Métadonnées d'une vidéo présente sur le boîtier                    |
| **Advertiser**       | Annonceur qui diffuse des pubs sur les TV                          |
| **Agency**           | Agence gérant plusieurs annonceurs                                 |
| **Operator**         | Utilisateur gérant un sous-ensemble de clubs                       |
| **Golden image**     | Image SD pré-configurée pour clonage rapide                        |
| **Canary**           | Déploiement progressif (10% → 50% → 100%)                          |
| **Phase de match**   | Moment du match (neutral/before/during/after)                      |
| **TimeCategory**     | Configuration d'une phase avec ses vidéos et catégories            |
| **LoopVideo**        | Vidéo dans une boucle de phase                                     |
| **CategoryMapping**  | Association catégorie locale → type analytics                      |
| **RemotePreview**    | Simulation visuelle de la télécommande Pi dans le dashboard        |
| **wlan0**            | WiFi intégré du Pi → Hotspot pour /remote et admin :8080           |
| **wlan1**            | Dongle USB WiFi → Connexion Internet du lieu vers le cloud         |
| **Mesh WiFi**        | Réseau avec plusieurs APs partageant le même SSID                  |
| **BSSID lock**       | Verrouillage sur une borne spécifique (⛔ INTERDIT en mesh)        |
| **bgscan**           | Scan background pour roaming contrôlé en environnement mesh        |
| **Hotspot Watchdog** | Service surveillant la santé du hotspot (hostapd, dnsmasq)         |
| **Network Profile**  | Type de réseau : simple, mesh, mesh_isolated, enterprise, ethernet |
| **AP Isolation**     | Sécurité mesh empêchant les clients de communiquer                 |
| **brcmfmac**         | Driver WiFi Raspberry Pi (bugs documentés avec Virtual AP)         |
| **LicenseStatus**    | État licence : VALID, WARNING, GRACE_PERIOD, BLOCKED               |
| **LicenseCache**     | Cache local de la licence (7 jours de validité)                    |
| **GracePeriod**      | Délai de grâce après expiration (7 jours sans blocage)             |
| **SuspensionReason** | Motif de suspension (voir tableau ci-dessous)                      |
| **Auto-unblock**     | Déblocage automatique si abonnement renouvelé (certains motifs)    |

### Motifs de suspension et auto-déblocage

| Motif         | Label               | auto_unblock | Comportement                           |
| ------------- | ------------------- | ------------ | -------------------------------------- |
| `unpaid`      | Impayé              | ✅ true      | Déblocage auto si abonnement renouvelé |
| `expired`     | Abonnement expiré   | ✅ true      | Déblocage auto si abonnement renouvelé |
| `trial_ended` | Fin période d'essai | ✅ true      | Déblocage auto si plan payant souscrit |
| `maintenance` | Maintenance         | ❌ false     | Réactivation manuelle requise          |
| `abuse`       | Utilisation abusive | ❌ false     | Réactivation manuelle requise          |
| `request`     | Demande client      | ❌ false     | Réactivation manuelle requise          |
| `hardware`    | Problème matériel   | ❌ false     | Réactivation manuelle requise          |
| `connection`  | Connexion requise   | ❌ false     | Réactivation manuelle requise          |

---

## Index Rapide

| Je veux...           | Section                                                              |
| -------------------- | -------------------------------------------------------------------- |
| Comprendre le projet | [Contexte Métier](#contexte-métier)                                  |
| Voir l'architecture  | [Architecture](#architecture)                                        |
| Connaître la DB      | [Base de Données](#base-de-données)                                  |
| Appeler l'API        | [API Routes](#api-routes)                                            |
| Écrire du code       | [Patterns de Code](#patterns-de-code)                                |
| Éviter les erreurs   | [NE JAMAIS FAIRE](#ne-jamais-faire)                                  |
| Lancer le projet     | [Commandes](#commandes)                                              |
| Configurer l'env     | [Variables d'Environnement](#variables-denvironnement)               |
| Résoudre un bug      | [Debugging](#debugging) / [Troubleshooting](#troubleshooting-avancé) |
| Comprendre un flow   | [Diagrammes de Séquence](#diagrammes-de-séquence)                    |
| Requêter la DB       | [Requêtes SQL Utiles](#requêtes-sql-utiles)                          |
| Déployer             | [Déploiement Production](#déploiement-production)                    |
| Comprendre le jargon | [Glossaire Métier](#glossaire-métier)                                |
