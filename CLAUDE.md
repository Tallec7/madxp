# CLAUDE.md - Guide Complet Neopro

> Ce fichier est lu automatiquement par Claude Code pour comprendre le projet.

**Version**: 2.27.0 | **Dernière mise à jour**: 2026-01-12

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
| Super Admin | Tout (users, sites, content, analytics)   |
| Operator    | Gère ses clubs assignés, upload vidéos    |
| Advertiser  | Upload pubs, voit ses stats d'impressions |
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
| `/home/pi/neopro/webapp/configuration.json` | Configuration du site (sponsors, catégories, etc.)  |
| `/home/pi/neopro/sync-agent/`               | Agent de synchronisation avec le cloud              |
| `/home/pi/neopro/server/`                   | Serveur Socket.IO local                             |
| `/home/pi/neopro/scripts/`                  | Scripts de diagnostic et setup                      |

**⚠️ ATTENTION** : Les vidéos sont dans `/home/pi/neopro/videos/`, PAS dans `/home/pi/neopro/webapp/videos/`

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
  │
  └── content_deployments (1:N) ── video → site/group, status, progress

config_history ────────────────────────────────────────────────────────
  site_id, configuration (JSONB), changes_summary (JSONB)
  previous_version_id (self-ref pour diff)

ANALYTICS ─────────────────────────────────────────────────────────────
  club_sessions      → session start/end, videos_played count
  video_plays        → video_filename, played_at, trigger_type (auto/manual)
  club_daily_stats   → agrégation journalière (pré-calculée par cron)

ADVERTISERS ───────────────────────────────────────────────────────────
  advertisers        → name, status, contact info
  advertiser_videos  → advertiser ↔ video (M:N)
  advertiser_sites   → quels sites affichent quelles pubs
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
| `sponsor_impressions`           | **90 jours**         | Idem, `sponsor_daily_stats` conserve l'agrégation                        |
| `metrics`                       | **7 jours**          | Debug court terme uniquement (CPU, RAM, temp)                            |
| `config_history`                | **20 versions/site** | Rollback réaliste, pas besoin de 6 mois                                  |
| `remote_commands`               | **30 jours**         | Historique des commandes pour debug                                      |
| `alerts`                        | **90 jours**         | Patterns d'incidents                                                     |
| `audit_logs`                    | **90 jours**         | Conformité/audit                                                         |
| `recurring_schedule_executions` | **90 jours**         | Historique des crons                                                     |

**Tables préservées indéfiniment** (agrégations) :

- `club_daily_stats` - Stats journalières par site
- `sponsor_daily_stats` - Stats journalières par sponsor

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
GET    /api/sites/:id/hotspot-config → SSID WiFi réel du boîtier (pour QR code)
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
DELETE /api/content/videos/:id
POST   /api/content/deploy    → { videoId, targetType, targetId }
```

### Analytics

```
GET /api/analytics/overview           → stats globales
GET /api/analytics/sites/:id          → stats par site
GET /api/analytics/daily-stats        → agrégation journalière
GET /api/advertiser-analytics/...     → stats annonceurs
```

### Rate Limiting

Les rate limits sont appliqués **par route** pour éviter les conflits :

```
Auth:       10 req/15min    (anti-bruteforce) - 1 min dev
Monitoring: 300 req/min     (status, metrics, dashboard, local-content)
Admin:      200 req/min     (lecture sites, logs, config-history)
Sensitive:  30 req/min      (commands, deployments, créations, suppressions)
Logging:    200 req/min     (frontend logs - throttled client-side)
Upload:     10 req/hour     (video uploads)
```

**Architecture rate limiting** :

- `/api/sites` : Rate limits **par route** (pas de limite globale pour éviter les doubles comptages)
- `/api/sites/:id/dashboard`, `/api/sites/:id/connection-status`, `/api/sites/:id/metrics`, `/api/sites/:id/local-content` → `monitoringRateLimit` (300/min)
- `/api/sites/:id`, `/api/sites/:id/logs`, `/api/sites/:id/config-history/*` → `adminRateLimit` (200/min)
- POST/PUT/DELETE, `/api/sites/:id/command` → `sensitiveRateLimit` (30/min)

**Frontend Log Throttling** (v2.25+) :

Le `LoggerService` Angular implémente un throttling côté client pour éviter les erreurs 429 :

- **Batching** : Logs accumulés et envoyés toutes les 2 secondes (ou après 20 logs max)
- **Rate limit silencieux** : Les erreurs 429 sont ignorées sans polluer la console
- **Console en prod** : Seuls `error` et `warn` affichés, `info`/`debug` → Logtail uniquement

**Note**: Les rate limits sont par utilisateur (user_id) et non par IP en production.

---

## Services Critiques

| Service          | Fichier                     | Rôle                                      |
| ---------------- | --------------------------- | ----------------------------------------- |
| **Socket**       | `socket.service.ts`         | Communication temps réel Pi ↔ Cloud       |
| **CommandQueue** | `command-queue.service.ts`  | File d'attente commandes (offline/online) |
| **Deployment**   | `deployment.service.ts`     | Orchestration déploiement vidéos          |
| **FTP Storage**  | `ftp-storage.ts`            | Upload/download vidéos sur FTP Hostinger  |
| **Supabase**     | `supabase.ts`               | Stockage fallback si FTP non configuré    |
| **Metrics**      | `metrics.service.ts`        | Export Prometheus                         |
| **Audit**        | `audit.service.ts`          | Log toutes les actions admin              |
| **MFA**          | `mfa.service.ts`            | 2FA avec backup codes                     |
| **Email**        | `email.service.ts`          | Password reset, alertes                   |
| **Cron**         | `cron-scheduler.service.ts` | Stats quotidiennes, cleanup               |
| **Logger**       | `logger.service.ts`         | Logs structurés avec correlation ID       |
| **Errors**       | `error-extractor.ts`        | Extraction messages d'erreur              |

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

### Double-Buffer Vidéo (Transitions Sans Flash) ⚡ UPDATED (2026-01-10)

Le composant TV utilise un système **double-buffer + freeze-frame + black overlay** pour éliminer les flash entre vidéos.

**⚠️ IMPORTANT - Optimisation Pi** :

Le préchargement anticipé et l'événement `timeupdate` causent des **saccades** sur Raspberry Pi car le décodeur matériel ne supporte pas bien le décodage de 2 vidéos en parallèle. Solution adoptée :

- **Pas de préchargement pendant la lecture** - une seule vidéo décode à la fois
- **`timeupdate` désactivé** - l'événement lui-même causait des micro-freezes
- **Préchargement au `ended`** - on charge la suivante uniquement quand la vidéo se termine
- Légère pause entre vidéos acceptable (< 1s) en échange d'une lecture fluide

**Architecture des couches (z-index)** :

```
┌─────────────────────────────────────────────────────────────────┐
│                        TV Component                              │
│                                                                  │
│  z-index 20: Canvas freeze-frame (capture image actuelle)       │
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

**Stratégie pour les vidéos manuelles** :

1. Capturer le freeze-frame (z-index 20, image de la vidéo en cours)
2. Afficher le black overlay (z-index 5, bloque physiquement la boucle)
3. Charger la vidéo manuelle sur le player manuel (z-index 10)
4. Attendre `canplaythrough` puis jouer
5. Après 200ms, cacher le freeze-frame (vidéo manuelle visible)
6. À la fin : cacher player manuel + black overlay → boucle visible

**Stratégie pour les changements de phase** :

1. Capturer le freeze-frame AVANT de changer quoi que ce soit
2. Changer la phase et recharger la boucle
3. Une fois la nouvelle vidéo en lecture, cacher le freeze-frame (150ms délai)

**Méthodes clés** :

| Méthode                       | Rôle                                         |
| ----------------------------- | -------------------------------------------- |
| `initDoubleBuffer()`          | Initialise les 4 players + canvas + overlay  |
| `setPlayerVisible()`          | Contrôle opacité/z-index via styles inline   |
| `playOnActivePlayer()`        | Joue une vidéo sur le player visible         |
| `preloadOnInactivePlayer()`   | Charge la vidéo suivante (appelé au `ended`) |
| `switchPlayers()`             | Bascule entre les 2 players                  |
| `onVideoEnded()`              | Déclenche le switch à la fin d'une vidéo     |
| `captureAndShowFreezeFrame()` | Capture l'image actuelle sur le canvas       |
| `hideFreezeFrame()`           | Cache le canvas + clearRect (libère mémoire) |
| `showBlackOverlay()`          | Affiche l'overlay noir (bloque la boucle)    |
| `hideBlackOverlay()`          | Cache l'overlay noir                         |

**Optimisation mémoire (usage intensif)** :

- Canvas réduit à 720p (1280x720) au lieu de 1080p → économise ~4.5MB
- `clearRect()` appelé après chaque transition pour libérer la mémoire bitmap
- Important pour les sessions longues (5h+) avec 3-4 déclenchements manuels/minute

**Ce qui a été désactivé** (causait des saccades sur Pi) :

- `timeupdate` listener - même throttlé, causait des micro-freezes
- Préchargement anticipé - décodage parallèle surchargeait le GPU
- Transition CSS opacity - repaints causaient des saccades

**Fichiers impliqués** :

- `raspberry/src/app/components/tv/tv.component.ts` - Logique double-buffer + freeze-frame
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

**Script de diagnostic et réparation** :

```bash
# Sur le Pi (via Ethernet ou écran+clavier)
cd /home/pi/neopro/scripts
./fix-hotspot.sh           # Mode diagnostic (affiche les problèmes)
./fix-hotspot.sh --auto-fix # Mode auto-fix (corrige automatiquement)
```

**Ce que fait le script** :

- Vérifie l'alimentation (voltage)
- Scanne les canaux WiFi et trouve le moins encombré (1, 6 ou 11)
- Vérifie hostapd, dnsmasq, rfkill
- Change automatiquement de canal si nécessaire
- Redémarre les services hotspot

**Changer manuellement le channel** :

```bash
# Passer en channel 1 (moins encombré que 6)
sudo sed -i 's/channel=6/channel=1/' /etc/hostapd/hostapd.conf
sudo systemctl restart hostapd
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

| Fichier                                          | Description                      |
| ------------------------------------------------ | -------------------------------- |
| `central-server/src/server.ts`                   | Point d'entrée, middleware order |
| `central-server/src/routes/*.ts`                 | Tous les endpoints               |
| `central-server/src/types/index.ts`              | Interfaces TypeScript            |
| `central-server/src/middleware/auth.ts`          | JWT + cookie auth                |
| `central-server/src/middleware/correlation.ts`   | Correlation ID middleware        |
| `central-server/src/middleware/errors.ts`        | Classes d'erreurs standardisées  |
| `central-server/src/middleware/error-handler.ts` | Gestionnaire d'erreurs global    |
| `central-server/src/services/socket.service.ts`  | Protocole WebSocket              |
| `central-server/src/scripts/full-schema.sql`     | Schéma DB complet                |

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

| Composant                    | Fichier                                | Description                                            |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------ |
| **SiteContentTabComponent**  | `components/site-content-tab/`         | Onglet Contenu : boucles par phase, catégories, vidéos |
| **SiteSettingsTabComponent** | `components/site-settings-tab/`        | Onglet Paramètres : config réseau, hotspot, QR code    |
| **SiteDebugTabComponent**    | `components/site-debug-tab/`           | Onglet Debug : logs, commandes, diagnostics            |
| **RemotePreviewComponent**   | `components/remote-preview/`           | Simulation visuelle de la télécommande Pi              |
| **VideoSelectorComponent**   | `shared/components/video-selector/`    | Sélecteur de vidéos avec filtres catégorie             |
| **QrCodeGeneratorComponent** | `shared/components/qr-code-generator/` | Génération QR code télécommande (PNG/print)            |
| **ConfigEditorComponent**    | `config-editor/`                       | Éditeur complet de configuration JSON                  |

### Raspberry Pi

| Fichier                                                     | Description                  |
| ----------------------------------------------------------- | ---------------------------- |
| `raspberry/src/app/components/tv/tv.component.ts`           | Affichage TV (double-buffer) |
| `raspberry/frontend/src/app/components/remote.component.ts` | Télécommande                 |
| `raspberry/sync-agent/src/agent.js`                         | Agent de synchronisation     |
| `raspberry/sync-agent/src/watchers/video-watcher.js`        | Surveillance vidéos ⚡       |
| `raspberry/scripts/setup-new-club.sh`                       | Setup nouveau club           |

### Documentation

| Fichier                            | Description              |
| ---------------------------------- | ------------------------ |
| `docs/REFERENCE.md`                | Doc technique complète   |
| `docs/TROUBLESHOOTING.md`          | Dépannage                |
| `docs/INSTALLATION_COMPLETE.md`    | Setup Pi de A à Z        |
| `docs/technical/ERROR_HANDLING.md` | Système d'error handling |
| `docs/guides/QR_CODE_REMOTE.md`    | QR code télécommande     |

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

| Symptôme                      | Cause probable              | Solution                                         |
| ----------------------------- | --------------------------- | ------------------------------------------------ |
| "Aw, Snap! Error code: 5"     | **gpu_mem trop faible**     | Vérifier `vcgencmd get_mem gpu`, configurer 256M |
| Crash après 2h de boucle      | Mémoire GPU saturée         | Augmenter gpu_mem, watchdog kiosk actif          |
| Écran blanc après crash       | Chromium bloqué sur erreur  | Le watchdog devrait récupérer automatiquement    |
| Crash fréquents (>3 en 5 min) | Vidéo corrompue ou GPU mort | Vérifier les vidéos, température Pi              |
| "gpu=4M" au lieu de 128M+     | Config `/boot/config.txt`   | Ajouter `gpu_mem=256` et reboot                  |

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

### v2.27.x (Janvier 2026)

- **Support Raspberry Pi 5 (SwiftShader)** : Fix des crashs Chromium "Aw, Snap!" sur Pi 5
  - **Problème** : Le Pi 5 utilise VideoCore VII qui a des problèmes d'incompatibilité avec le décodage vidéo hardware de Chromium
  - **Symptôme** : Erreurs `SharedImageStub: Unable to create shared image` toutes les 5 secondes dans les logs
  - **Note** : Sur Pi 5, `vcgencmd get_mem gpu` retourne toujours `gpu=4M` (valeur legacy) - ce n'est pas un problème
  - **Solution** : Utiliser SwiftShader (rendu logiciel) au lieu de l'accélération GPU hardware
  - **Flags Chromium Pi 5** : `--disable-gpu-compositing --use-gl=angle --use-angle=swiftshader`
  - **Détection automatique** : Le script `kiosk-watchdog.sh` détecte le modèle de Pi et applique les bons flags
  - **Fichiers modifiés** :
    - `raspberry/scripts/kiosk-watchdog.sh` - Détection Pi 4 vs Pi 5, flags GPU adaptés
    - `docs/guides/TROUBLESHOOTING.md` - Section 5 réécrite avec solutions distinctes Pi 4/Pi 5
  - **Migration Pi 5 existants** : Éditer `/etc/systemd/system/neopro-kiosk.service` et ajouter les flags SwiftShader, ou déployer le nouveau `kiosk-watchdog.sh`

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

| Terme               | Définition                                                  |
| ------------------- | ----------------------------------------------------------- |
| **Site**            | Un club sportif équipé d'un Raspberry Pi + TV               |
| **Boîtier**         | Le Raspberry Pi physique installé dans un club              |
| **Flotte**          | L'ensemble des boîtiers gérés (50+)                         |
| **Déploiement**     | Envoi d'une vidéo du cloud vers un ou plusieurs Pi          |
| **Heartbeat**       | Signal envoyé toutes les 30s par le Pi au cloud             |
| **Sync**            | Synchronisation bidirectionnelle Pi ↔ Cloud                 |
| **Config mirror**   | Copie de la config locale stockée dans le cloud             |
| **VideoWatcher**    | Surveillance du dossier vidéos sur le Pi                    |
| **LocalVideo**      | Métadonnées d'une vidéo présente sur le boîtier             |
| **Advertiser**      | Annonceur qui diffuse des pubs sur les TV                   |
| **Agency**          | Agence gérant plusieurs annonceurs                          |
| **Operator**        | Utilisateur gérant un sous-ensemble de clubs                |
| **Golden image**    | Image SD pré-configurée pour clonage rapide                 |
| **Canary**          | Déploiement progressif (10% → 50% → 100%)                   |
| **Phase de match**  | Moment du match (neutral/before/during/after)               |
| **TimeCategory**    | Configuration d'une phase avec ses vidéos et catégories     |
| **LoopVideo**       | Vidéo dans une boucle de phase                              |
| **CategoryMapping** | Association catégorie locale → type analytics               |
| **RemotePreview**   | Simulation visuelle de la télécommande Pi dans le dashboard |

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
