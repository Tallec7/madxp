# CLAUDE.md - Guide Complet Neopro

> Ce fichier est lu automatiquement par Claude Code pour comprendre le projet.

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
├── central-dashboard/        # Dashboard Admin (Angular 17)
│   └── src/app/
│       ├── features/         # Composants par feature (sites, content, analytics)
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
| Frontend Dashboard | Angular 17, Chart.js, Leaflet                             |
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
GET    /api/sites/:id/dashboard → endpoint agrégé (connection + metrics) ⚡ NEW
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
Monitoring: 300 req/min     (status, metrics polling) ⚡ NEW
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

### Protocole Socket.IO

```javascript
// Site → Cloud
'register'          : { siteId, apiKey }
'heartbeat'         : { siteId, metrics: { cpu, memory, temp } }
'command:result'    : { commandId, status, result }
'deployment:progress': { deploymentId, progress, status }

// Cloud → Site
'deploy_video'      : { deploymentId, videoUrl, ... }
'update_config'     : { configVersionId, configuration }
'execute_command'   : { commandId, type, data }
```

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

| Fichier                                         | Description                      |
| ----------------------------------------------- | -------------------------------- |
| `central-server/src/server.ts`                  | Point d'entrée, middleware order |
| `central-server/src/routes/*.ts`                | Tous les endpoints               |
| `central-server/src/types/index.ts`             | Interfaces TypeScript            |
| `central-server/src/middleware/auth.ts`         | JWT + cookie auth                |
| `central-server/src/services/socket.service.ts` | Protocole WebSocket              |
| `central-server/src/scripts/full-schema.sql`    | Schéma DB complet                |

### Frontend Dashboard

| Fichier                                                   | Description       |
| --------------------------------------------------------- | ----------------- |
| `central-dashboard/src/app/app.routes.ts`                 | Routes Angular    |
| `central-dashboard/src/app/core/services/auth.service.ts` | Auth client       |
| `central-dashboard/src/app/features/sites/`               | Gestion des clubs |

### Raspberry Pi

| Fichier                                                     | Description           |
| ----------------------------------------------------------- | --------------------- |
| `raspberry/frontend/src/app/components/tv.component.ts`     | Affichage TV          |
| `raspberry/frontend/src/app/components/remote.component.ts` | Télécommande          |
| `raspberry/sync-agent/`                                     | Synchronisation cloud |
| `raspberry/scripts/setup-new-club.sh`                       | Setup nouveau club    |

### Documentation

| Fichier                         | Description            |
| ------------------------------- | ---------------------- |
| `docs/REFERENCE.md`             | Doc technique complète |
| `docs/TROUBLESHOOTING.md`       | Dépannage              |
| `docs/INSTALLATION_COMPLETE.md` | Setup Pi de A à Z      |

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

### Sites avec métriques récentes

```sql
-- Sites avec leur dernière métrique (< 5 min = online)
SELECT
  s.id,
  s.site_name,
  s.club_name,
  s.status,
  s.last_seen_at,
  m.cpu_usage,
  m.memory_usage,
  m.temperature,
  CASE
    WHEN s.last_seen_at > NOW() - INTERVAL '5 minutes' THEN 'online'
    ELSE 'offline'
  END AS real_status
FROM sites s
LEFT JOIN LATERAL (
  SELECT * FROM metrics
  WHERE site_id = s.id
  ORDER BY recorded_at DESC
  LIMIT 1
) m ON true
ORDER BY s.last_seen_at DESC NULLS LAST;
```

### Analytics : Top vidéos par club

```sql
-- Top 10 vidéos les plus jouées par site sur 30 jours
SELECT
  s.club_name,
  vp.video_filename,
  COUNT(*) as play_count,
  SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END) as completed_count,
  ROUND(AVG(vp.duration_played)::numeric, 1) as avg_watch_seconds
FROM video_plays vp
JOIN sites s ON s.id = vp.site_id
WHERE vp.played_at > NOW() - INTERVAL '30 days'
GROUP BY s.club_name, vp.video_filename
ORDER BY s.club_name, play_count DESC;
```

### Déploiements en échec à retry

```sql
-- Déploiements failed récents avec infos pour debug
SELECT
  cd.id,
  cd.status,
  cd.error_message,
  cd.progress,
  cd.created_at,
  v.filename as video,
  CASE cd.target_type
    WHEN 'site' THEN (SELECT site_name FROM sites WHERE id = cd.target_id)
    WHEN 'group' THEN (SELECT name FROM groups WHERE id = cd.target_id)
  END as target_name,
  u.email as deployed_by
FROM content_deployments cd
JOIN videos v ON v.id = cd.video_id
LEFT JOIN users u ON u.id = cd.deployed_by
WHERE cd.status = 'failed'
  AND cd.created_at > NOW() - INTERVAL '24 hours'
ORDER BY cd.created_at DESC;
```

### Santé de la flotte

```sql
-- Vue globale de la flotte avec alertes
SELECT
  COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '5 min') as online,
  COUNT(*) FILTER (WHERE last_seen_at <= NOW() - INTERVAL '5 min'
                      OR last_seen_at IS NULL) as offline,
  COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance,
  COUNT(*) FILTER (WHERE status = 'error') as error,
  (
    SELECT COUNT(DISTINCT site_id)
    FROM metrics
    WHERE recorded_at > NOW() - INTERVAL '1 hour'
      AND temperature > 70
  ) as overheating,
  (
    SELECT COUNT(DISTINCT site_id)
    FROM metrics
    WHERE recorded_at > NOW() - INTERVAL '1 hour'
      AND disk_usage > 90
  ) as disk_critical
FROM sites;
```

### Config diff entre deux versions

```sql
-- Comparer deux versions de config d'un site
WITH versions AS (
  SELECT
    id,
    configuration,
    deployed_at,
    ROW_NUMBER() OVER (ORDER BY deployed_at DESC) as rn
  FROM config_history
  WHERE site_id = 'UUID_DU_SITE'
)
SELECT
  v1.deployed_at as current_date,
  v2.deployed_at as previous_date,
  jsonb_diff(v2.configuration, v1.configuration) as changes
FROM versions v1
JOIN versions v2 ON v2.rn = v1.rn + 1
WHERE v1.rn = 1;
```

### Advertiser ROI

```sql
-- Stats impressions par annonceur sur 30 jours
SELECT
  a.name as advertiser,
  COUNT(DISTINCT av.video_id) as videos_count,
  COUNT(DISTINCT vp.site_id) as sites_reached,
  COUNT(vp.id) as total_impressions,
  SUM(vp.duration_played) / 3600.0 as hours_watched,
  ROUND(
    COUNT(vp.id)::numeric / NULLIF(COUNT(DISTINCT vp.site_id), 0),
    1
  ) as avg_impressions_per_site
FROM advertisers a
JOIN advertiser_videos av ON av.advertiser_id = a.id
JOIN videos v ON v.id = av.video_id
LEFT JOIN video_plays vp ON vp.video_filename = v.filename
  AND vp.played_at > NOW() - INTERVAL '30 days'
GROUP BY a.id, a.name
ORDER BY total_impressions DESC;
```

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

| Terme             | Définition                                         |
| ----------------- | -------------------------------------------------- |
| **Site**          | Un club sportif équipé d'un Raspberry Pi + TV      |
| **Boîtier**       | Le Raspberry Pi physique installé dans un club     |
| **Flotte**        | L'ensemble des boîtiers gérés (50+)                |
| **Déploiement**   | Envoi d'une vidéo du cloud vers un ou plusieurs Pi |
| **Heartbeat**     | Signal envoyé toutes les 30s par le Pi au cloud    |
| **Sync**          | Synchronisation bidirectionnelle Pi ↔ Cloud        |
| **Config mirror** | Copie de la config locale stockée dans le cloud    |
| **Advertiser**    | Annonceur qui diffuse des pubs sur les TV          |
| **Agency**        | Agence gérant plusieurs annonceurs                 |
| **Operator**      | Utilisateur gérant un sous-ensemble de clubs       |
| **Golden image**  | Image SD pré-configurée pour clonage rapide        |
| **Canary**        | Déploiement progressif (10% → 50% → 100%)          |

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
