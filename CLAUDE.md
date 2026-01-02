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
| Rôle | Actions |
|------|---------|
| Super Admin | Tout (users, sites, content, analytics) |
| Operator | Gère ses clubs assignés, upload vidéos |
| Advertiser | Upload pubs, voit ses stats d'impressions |
| Agency | Gère plusieurs advertisers |
| Club Staff | Utilise la télécommande locale |

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

| Composant | Technologies |
|-----------|--------------|
| Frontend Raspberry | Angular 20, Socket.IO client, SCSS |
| Frontend Dashboard | Angular 17, Chart.js, Leaflet |
| Backend API | Node.js 18+, Express 4.18, TypeScript strict |
| Base de données | PostgreSQL 15 (Supabase) |
| Cache | Redis (Upstash) - optionnel |
| Stockage | FTP (Hostinger) + Supabase Storage (fallback) |
| Auth | JWT HttpOnly cookie + Bearer token |
| Logs | Winston + Logtail (Better Stack) |
| Tests | Jest + Supertest (API), Karma (Angular), Playwright (E2E) |

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
POST   /api/sites             → créer site (génère api_key)
PUT    /api/sites/:id         → modifier
DELETE /api/sites/:id         → supprimer
POST   /api/sites/:id/api-key/regenerate
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
Auth:      5 req/15min   (anti-bruteforce)
API:       100 req/15min (standard)
Sensitive: 20 req/15min  (uploads, admin ops)
```

---

## Services Critiques

| Service | Fichier | Rôle |
|---------|---------|------|
| **Socket** | `socket.service.ts` | Communication temps réel Pi ↔ Cloud |
| **Deployment** | `deployment.service.ts` | Orchestration déploiement vidéos |
| **Metrics** | `metrics.service.ts` | Export Prometheus |
| **Audit** | `audit.service.ts` | Log toutes les actions admin |
| **MFA** | `mfa.service.ts` | 2FA avec backup codes |
| **Email** | `email.service.ts` | Password reset, alertes |
| **Cron** | `cron-scheduler.service.ts` | Stats quotidiennes, cleanup |

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
  password: Joi.string().min(8).required()
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
  template: `...`
})
export class SitesListComponent implements OnInit { }
```

### Pagination Standard
```typescript
const { page = 1, limit = 20 } = req.query;
const offset = (page - 1) * limit;

res.json({
  data: rows,
  pagination: { page, limit, total }
});
```

---

## Conventions de Code

### Nommage
| Type | Convention | Exemple |
|------|------------|---------|
| Fichiers | kebab-case + suffixe | `sites.controller.ts`, `auth.service.ts` |
| Classes | PascalCase | `DeploymentService` |
| Fonctions | camelCase + verbe | `getSites`, `createUser`, `deployVideo` |
| Interfaces | PascalCase, pas de I | `interface User`, `interface SiteInput` |
| Types union | PascalCase | `type UserRole = 'admin' | 'viewer'` |

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

---

## Workflow Git

```bash
# Nouvelle feature
git checkout -b feature/ma-feature
# ... développement ...
npm run lint && npm run test:server
git commit -m "feat(scope): description"
git push -u origin feature/ma-feature
# Créer PR sur GitHub

# Hotfix
git checkout -b hotfix/description
# ... fix ...
git commit -m "fix(scope): description"
```

### Format des commits
```
feat(sites): add bulk delete endpoint
fix(auth): handle expired tokens correctly
docs(readme): update deployment instructions
refactor(socket): simplify heartbeat handling
test(analytics): add coverage for daily stats
```

---

## Fichiers Clés

### Backend
| Fichier | Description |
|---------|-------------|
| `central-server/src/server.ts` | Point d'entrée, middleware order |
| `central-server/src/routes/*.ts` | Tous les endpoints |
| `central-server/src/types/index.ts` | Interfaces TypeScript |
| `central-server/src/middleware/auth.ts` | JWT + cookie auth |
| `central-server/src/services/socket.service.ts` | Protocole WebSocket |
| `central-server/src/scripts/full-schema.sql` | Schéma DB complet |

### Frontend Dashboard
| Fichier | Description |
|---------|-------------|
| `central-dashboard/src/app/app.routes.ts` | Routes Angular |
| `central-dashboard/src/app/core/services/auth.service.ts` | Auth client |
| `central-dashboard/src/app/features/sites/` | Gestion des clubs |

### Raspberry Pi
| Fichier | Description |
|---------|-------------|
| `raspberry/frontend/src/app/components/tv.component.ts` | Affichage TV |
| `raspberry/frontend/src/app/components/remote.component.ts` | Télécommande |
| `raspberry/sync-agent/` | Synchronisation cloud |
| `raspberry/scripts/setup-new-club.sh` | Setup nouveau club |

### Documentation
| Fichier | Description |
|---------|-------------|
| `docs/REFERENCE.md` | Doc technique complète |
| `docs/TROUBLESHOOTING.md` | Dépannage |
| `docs/INSTALLATION_COMPLETE.md` | Setup Pi de A à Z |

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
      const response = await request(app)
        .get('/api/sites')
        .set('Authorization', `Bearer ${token}`);

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
  query: jest.fn()
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
