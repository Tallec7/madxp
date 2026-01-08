# CLAUDE.md - Guide Complet Neopro

> Ce fichier est lu automatiquement par Claude Code pour comprendre le projet.

**Version**: 2.7.2 | **Dernière mise à jour**: 2026-01-08

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
├── server-render/            # Socket.IO cloud (Render.com)
├── e2e/                      # Tests Playwright
└── docs/                     # 180+ fichiers de documentation
```

---

## Stack Technique

| Composant          | Technologies                                              |
| ------------------ | --------------------------------------------------------- |
| Frontend Raspberry | Angular 20, Socket.IO client, SCSS                        |
| Frontend Dashboard | Angular 20, Chart.js, Leaflet, Standalone Components      |
| Backend API        | Node.js 18+, Express 4.18, TypeScript strict              |
| Base de données    | PostgreSQL 15 (Supabase)                                  |
| Cache              | Redis (Upstash) - optionnel                               |
| Stockage           | FTP (Hostinger) + Supabase Storage (fallback)             |
| Auth               | JWT HttpOnly cookie + Bearer token                        |
| Logs               | Winston + Logtail (Better Stack)                          |
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
GET    /api/sites/:id/local-content → vidéos locales + stockage ⚡ NEW
GET    /api/sites/:id/connection-status → statut connexion temps réel
GET    /api/sites/:id/metrics → métriques système (CPU, RAM, temp)
POST   /api/sites             → créer site (génère api_key)
PUT    /api/sites/:id         → modifier
DELETE /api/sites/:id         → supprimer
POST   /api/sites/:id/api-key/regenerate
POST   /api/sites/:id/command → envoyer commande au Pi
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

```
Auth:       10 req/15min    (anti-bruteforce) - 1 min dev
API:        100 req/min     (standard)
Monitoring: 300 req/min     (status, metrics polling)
Logging:    200 req/min     (frontend logs - silently dropped if exceeded)
Sensitive:  30 req/min      (commands, deployments)
Upload:     10 req/hour     (video uploads)
Admin:      200 req/min     (dashboard ops)
```

**Note**: Les rate limits sont par utilisateur (user_id) et non par IP en production.

---

## Services Critiques

| Service        | Fichier                     | Rôle                                |
| -------------- | --------------------------- | ----------------------------------- |
| **Socket**     | `socket.service.ts`         | Communication temps réel Pi ↔ Cloud |
| **Deployment** | `deployment.service.ts`     | Orchestration déploiement vidéos    |
| **Metrics**    | `metrics.service.ts`        | Export Prometheus                   |
| **Audit**      | `audit.service.ts`          | Log toutes les actions admin        |
| **MFA**        | `mfa.service.ts`            | 2FA avec backup codes               |
| **Email**      | `email.service.ts`          | Password reset, alertes             |
| **Cron**       | `cron-scheduler.service.ts` | Stats quotidiennes, cleanup         |
| **Logger**     | `logger.service.ts`         | Logs structurés avec correlation ID |
| **Errors**     | `error-extractor.ts`        | Extraction messages d'erreur        |

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

### Double-Buffer Vidéo (Transitions Sans Flash) ⚡ NEW (2026-01-08)

Le composant TV utilise un système **double-buffer** pour éliminer les flash noirs entre les vidéos de la boucle :

**Principe** :

- Deux éléments `<video>` (playerA et playerB) en position absolue superposés
- Pendant qu'une vidéo joue sur un player, la suivante est préchargée sur l'autre
- À la fin d'une vidéo, on lance `play()` sur le player préchargé AVANT de changer l'opacité
- Transition CSS de 150ms pour un fondu doux

**Architecture** :

```
┌─────────────────────────────────────────────────────────────────┐
│                        TV Component                              │
│  ┌──────────────┐    ┌──────────────┐                           │
│  │   Player A   │    │   Player B   │                           │
│  │  opacity: 1  │    │  opacity: 0  │  ← précharge next video   │
│  │  z-index: 1  │    │  z-index: 0  │                           │
│  │  [PLAYING]   │    │  [READY]     │                           │
│  └──────────────┘    └──────────────┘                           │
│         │                    │                                   │
│         └────── SWITCH ──────┘                                   │
│                   │                                              │
│         playerA ←→ playerB alternent                            │
└─────────────────────────────────────────────────────────────────┘
```

**Méthodes clés** :

| Méthode                     | Rôle                                              |
| --------------------------- | ------------------------------------------------- |
| `initDoubleBuffer()`        | Initialise les 2 players et leurs event listeners |
| `setPlayerVisible()`        | Contrôle opacité/z-index via styles inline        |
| `playOnActivePlayer()`      | Joue une vidéo sur le player visible              |
| `preloadOnInactivePlayer()` | Précharge la prochaine vidéo sur le player caché  |
| `switchPlayers()`           | Bascule entre les 2 players sans flash            |
| `onVideoEnded()`            | Déclenche le switch à la fin d'une vidéo          |

**Fichiers impliqués** :

- `raspberry/src/app/components/tv/tv.component.ts` - Logique double-buffer
- `raspberry/src/app/components/tv/tv.component.html` - Deux éléments `<video>`
- `raspberry/src/app/components/tv/tv.component.scss` - CSS avec transition opacity

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

### Android refuse de se connecter au hotspot ?

**Problème** : Android affiche "Pas d'accès Internet" et bloque la résolution DNS de `neopro.local`.

**Solution immédiate** : Utiliser l'IP directe sur Android

```
http://192.168.4.1/login
```

**Solution permanente** : Le captive portal est configuré automatiquement depuis la version 2.5.0.

Vérifier que le captive portal fonctionne :

```bash
# Sur le Pi
curl -I http://localhost/generate_204
# Doit retourner : HTTP/1.1 204 No Content
```

**Documentation complète** : [docs/guides/ANDROID_HOTSPOT_FIX.md](docs/guides/ANDROID_HOTSPOT_FIX.md)

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

| Composant                    | Fichier                             | Description                                            |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------ |
| **SiteContentTabComponent**  | `components/site-content-tab/`      | Onglet Contenu : boucles par phase, catégories, vidéos |
| **SiteSettingsTabComponent** | `components/site-settings-tab/`     | Onglet Paramètres : config réseau, hotspot             |
| **SiteDebugTabComponent**    | `components/site-debug-tab/`        | Onglet Debug : logs, commandes, diagnostics            |
| **RemotePreviewComponent**   | `components/remote-preview/`        | Simulation visuelle de la télécommande Pi              |
| **VideoSelectorComponent**   | `shared/components/video-selector/` | Sélecteur de vidéos avec filtres catégorie             |
| **ConfigEditorComponent**    | `config-editor/`                    | Éditeur complet de configuration JSON                  |

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

### Central Server (Render.com)

```yaml
# render.yaml
services:
  - type: web
    name: neopro-central
    env: node
    buildCommand: cd central-server && npm install && npm run build
    startCommand: cd central-server && npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
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

---

## Historique Breaking Changes

### v2.6.x (Janvier 2026)

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
