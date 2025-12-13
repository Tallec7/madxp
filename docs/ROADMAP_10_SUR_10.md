# ROADMAP VERS 10/10 - NEOPRO

> Plan d'amelioration pour atteindre l'excellence sur chaque composant
> Date: 13 Decembre 2025

---

## RESUME DES AMELIORATIONS

| Composant | Note Actuelle | Manque pour 10/10 | Effort Total |
|-----------|---------------|-------------------|--------------|
| Fonctionnement Hors Connexion | 9/10 | 3-4 jours | Faible |
| Mises a Jour Distantes | 8.5/10 | 5-7 jours | Moyen |
| Deploiement Videos | 8/10 | 5-6 jours | Moyen |
| Architecture Serveur/Client | 8.5/10 | 7-10 jours | Moyen-Eleve |
| Synchronisation Donnees | 9/10 | 2-3 jours | Faible |
| Securite | 8/10 | 5-7 jours | Moyen |
| Qualite Code/Tests | 7.5/10 | 10-15 jours | Eleve |
| Documentation | 9/10 | 2-3 jours | Faible |

---

## 1. FONCTIONNEMENT HORS CONNEXION (9/10 -> 10/10)

### Ce qui manque:

#### 1.1 Queue de commandes offline
**Probleme**: Quand le Pi est offline, les actions admin locales ne sont pas queued pour sync ulterieure.

```javascript
// A ajouter dans raspberry/admin/admin-server.js
class OfflineCommandQueue {
  constructor() {
    this.queuePath = '/home/pi/neopro/data/offline-queue.json';
  }

  async enqueue(command) {
    const queue = await this.loadQueue();
    queue.push({
      id: uuidv4(),
      command,
      timestamp: new Date().toISOString(),
      retries: 0
    });
    await fs.writeJson(this.queuePath, queue);
  }

  async processOnReconnect() {
    const queue = await this.loadQueue();
    for (const item of queue) {
      try {
        await this.executeCommand(item.command);
        await this.removeFromQueue(item.id);
      } catch (error) {
        item.retries++;
        if (item.retries >= 3) {
          await this.moveToDeadLetter(item);
        }
      }
    }
  }
}
```

**Effort**: 1 jour

#### 1.2 Indicateur visuel de connectivite
**Probleme**: L'utilisateur ne sait pas si le Pi est connecte au central.

```typescript
// A ajouter dans raspberry/frontend/src/app/components/
@Component({
  selector: 'app-connection-status',
  template: `
    <div class="connection-indicator" [class.online]="isOnline" [class.offline]="!isOnline">
      <span class="dot"></span>
      <span class="text">{{ isOnline ? 'Connecte au central' : 'Mode hors ligne' }}</span>
      <span class="last-sync" *ngIf="lastSync">Derniere sync: {{ lastSync | timeAgo }}</span>
    </div>
  `
})
export class ConnectionStatusComponent {
  isOnline = false;
  lastSync: Date | null = null;
}
```

**Effort**: 0.5 jour

#### 1.3 Gestion expiration videos offline
**Probleme**: Les videos NEOPRO avec `expires_at` ne sont pas supprimees automatiquement en offline.

```javascript
// A ajouter dans raspberry/sync-agent/src/tasks/expiration-checker.js
class ExpirationChecker {
  async checkExpiredVideos() {
    const config = await fs.readJson(configPath);
    const now = new Date();

    for (const category of config.categories) {
      for (const video of category.videos || []) {
        if (video.expires_at && new Date(video.expires_at) < now) {
          await this.removeExpiredVideo(video, category);
          logger.info('Expired video removed', { video: video.name, expiredAt: video.expires_at });
        }
      }
    }
  }
}

// Executer toutes les heures
setInterval(() => expirationChecker.checkExpiredVideos(), 60 * 60 * 1000);
```

**Effort**: 0.5 jour

#### 1.4 Backup automatique local
**Probleme**: Pas de backup automatique de la configuration locale.

```javascript
// A ajouter dans raspberry/sync-agent/src/tasks/local-backup.js
class LocalBackupService {
  async createDailyBackup() {
    const timestamp = new Date().toISOString().split('T')[0];
    const backupDir = `/home/pi/neopro/backups/config-${timestamp}`;

    await fs.ensureDir(backupDir);
    await fs.copy(configPath, `${backupDir}/configuration.json`);

    // Garder 7 jours de backups
    await this.cleanOldBackups(7);
  }
}

// Executer tous les jours a 3h du matin
const cron = require('node-cron');
cron.schedule('0 3 * * *', () => backupService.createDailyBackup());
```

**Effort**: 0.5 jour

### Checklist 10/10 Hors Connexion:
- [ ] Queue de commandes offline avec retry
- [ ] Indicateur visuel de connectivite temps reel
- [ ] Suppression automatique videos expirees
- [ ] Backup quotidien automatique configuration
- [ ] Tests E2E mode offline prolonge (72h)

---

## 2. MISES A JOUR DISTANTES (8.5/10 -> 10/10)

### Ce qui manque:

#### 2.1 Verification pre-mise a jour
**Probleme**: Pas de verification de l'espace disque et de l'etat du systeme avant MAJ.

```javascript
// A ajouter dans raspberry/sync-agent/src/commands/update-software.js
async preUpdateChecks(packageSize) {
  const checks = {
    diskSpace: false,
    servicesHealthy: false,
    batteryOk: true, // Si UPS connecte
    noActiveSession: false
  };

  // Verifier espace disque (besoin 3x la taille du package)
  const { stdout } = await execAsync('df -B1 /home/pi | tail -1 | awk \'{print $4}\'');
  const availableBytes = parseInt(stdout.trim());
  checks.diskSpace = availableBytes > packageSize * 3;

  // Verifier sante des services
  const services = ['neopro-app', 'neopro-admin', 'nginx'];
  for (const service of services) {
    const { stdout } = await execAsync(`systemctl is-active ${service}`);
    if (stdout.trim() !== 'active') {
      checks.servicesHealthy = false;
      break;
    }
    checks.servicesHealthy = true;
  }

  // Verifier pas de session TV active
  try {
    const response = await axios.get('http://localhost:3000/api/status');
    checks.noActiveSession = !response.data.isPlaying;
  } catch {
    checks.noActiveSession = true;
  }

  if (!checks.diskSpace) throw new Error('Espace disque insuffisant');
  if (!checks.servicesHealthy) throw new Error('Services non sains');

  return checks;
}
```

**Effort**: 1 jour

#### 2.2 Deploiement progressif (Canary)
**Probleme**: Pas de deploiement progressif pour limiter les risques.

```typescript
// A ajouter dans central-server/src/services/canary-deployment.service.ts
class CanaryDeploymentService {
  async deployWithCanary(updateId: string, groupId: string) {
    const sites = await this.getSitesInGroup(groupId);

    // Phase 1: 10% des sites (canary)
    const canarySites = sites.slice(0, Math.ceil(sites.length * 0.1));
    await this.deployToSites(updateId, canarySites);

    // Attendre 24h et verifier sante
    await this.waitAndVerifyHealth(canarySites, 24 * 60 * 60 * 1000);

    // Phase 2: 50% des sites
    const phase2Sites = sites.slice(canarySites.length, Math.ceil(sites.length * 0.5));
    await this.deployToSites(updateId, phase2Sites);

    // Attendre 24h
    await this.waitAndVerifyHealth([...canarySites, ...phase2Sites], 24 * 60 * 60 * 1000);

    // Phase 3: 100%
    const remainingSites = sites.slice(Math.ceil(sites.length * 0.5));
    await this.deployToSites(updateId, remainingSites);
  }

  async waitAndVerifyHealth(sites: string[], duration: number) {
    // Verifier que tous les sites sont online et sains
    const startTime = Date.now();
    while (Date.now() - startTime < duration) {
      const healthyCount = await this.countHealthySites(sites);
      if (healthyCount < sites.length * 0.95) {
        throw new Error('Canary failed: too many unhealthy sites');
      }
      await sleep(5 * 60 * 1000); // Verifier toutes les 5 min
    }
  }
}
```

**Effort**: 2 jours

#### 2.3 Changelog et notes de version dans l'UI
**Probleme**: Les utilisateurs ne voient pas les changements apres une MAJ.

```typescript
// A ajouter dans central-dashboard/src/app/features/updates/
@Component({
  selector: 'app-update-changelog',
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Version {{ update.version }}</mat-card-title>
        <mat-card-subtitle>{{ update.created_at | date }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="changelog" [innerHTML]="update.changelog | markdown"></div>
        <div class="deployment-status">
          <h4>Statut de deploiement</h4>
          <div class="progress-bar">
            <span>{{ deploymentProgress }}% des sites</span>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `
})
```

**Effort**: 0.5 jour

#### 2.4 Notification avant reboot
**Probleme**: Le Pi reboot sans prevenir l'utilisateur.

```javascript
// A ajouter dans raspberry/sync-agent/src/commands/update-software.js
async notifyUpcomingReboot() {
  // Envoyer notification a l'interface TV
  const socket = io('http://localhost:3000');
  socket.emit('system_notification', {
    type: 'warning',
    title: 'Mise a jour en cours',
    message: 'Le systeme va redemarrer dans 30 secondes...',
    duration: 30000
  });

  // Attendre que l'utilisateur voie le message
  await sleep(30000);
}
```

**Effort**: 0.5 jour

#### 2.5 Rapport post-mise a jour
**Probleme**: Pas de verification automatique apres MAJ.

```javascript
// A ajouter dans raspberry/sync-agent/src/commands/update-software.js
async generatePostUpdateReport() {
  const report = {
    timestamp: new Date().toISOString(),
    previousVersion: this.previousVersion,
    newVersion: await this.getCurrentVersion(),
    servicesStatus: {},
    diskUsage: null,
    errors: []
  };

  // Verifier chaque service
  const services = ['neopro-app', 'neopro-admin', 'neopro-sync-agent', 'nginx'];
  for (const service of services) {
    try {
      const { stdout } = await execAsync(`systemctl is-active ${service}`);
      report.servicesStatus[service] = stdout.trim();
    } catch (error) {
      report.servicesStatus[service] = 'failed';
      report.errors.push(`Service ${service} not running`);
    }
  }

  // Envoyer au central
  this.socket.emit('update_report', report);

  return report;
}
```

**Effort**: 0.5 jour

### Checklist 10/10 Mises a Jour:
- [ ] Verification pre-MAJ (espace, sante, session)
- [ ] Deploiement progressif canary (10% -> 50% -> 100%)
- [ ] Changelog visible dans dashboard
- [ ] Notification utilisateur avant reboot
- [ ] Rapport post-MAJ automatique
- [ ] Tests automatises du processus complet

---

## 3. DEPLOIEMENT VIDEOS (8/10 -> 10/10)

### Ce qui manque:

#### 3.1 Checksum obligatoire
**Probleme**: Le checksum est optionnel, risque de fichiers corrompus.

```typescript
// Modifier central-server/src/controllers/content.controller.ts
export const createVideo = async (req: AuthRequest, res: Response) => {
  // ...
  const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

  // Toujours inclure le checksum
  const result = await pool.query(
    `INSERT INTO videos (filename, original_name, checksum, ...)
     VALUES ($1, $2, $3, ...)`,
    [filename, originalName, checksum, ...]
  );
};

// Modifier raspberry/sync-agent/src/commands/deploy-video.js
async execute(data, progressCallback) {
  // Rendre checksum obligatoire
  if (!data.checksum) {
    throw new Error('Checksum is required for video deployment');
  }
  // ...
}
```

**Effort**: 0.5 jour

#### 3.2 Reprise de telechargement (Resume)
**Probleme**: Si le telechargement echoue a 90%, il recommence a 0%.

```javascript
// Modifier raspberry/sync-agent/src/commands/deploy-video.js
async downloadFileWithResume(url, targetPath, progressCallback) {
  const tempPath = `${targetPath}.downloading`;
  let startByte = 0;

  // Verifier si fichier partiel existe
  if (await fs.pathExists(tempPath)) {
    const stats = await fs.stat(tempPath);
    startByte = stats.size;
    logger.info('Resuming download', { startByte });
  }

  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    headers: startByte > 0 ? { Range: `bytes=${startByte}-` } : {},
    timeout: 600000,
  });

  const totalSize = parseInt(response.headers['content-length'] || '0') + startByte;
  let downloadedSize = startByte;

  const writer = fs.createWriteStream(tempPath, { flags: startByte > 0 ? 'a' : 'w' });

  response.data.on('data', (chunk) => {
    downloadedSize += chunk.length;
    const progress = Math.round((downloadedSize / totalSize) * 100);
    if (progressCallback) progressCallback(progress);
  });

  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  // Renommer une fois complet
  await fs.rename(tempPath, targetPath);
}
```

**Effort**: 1 jour

#### 3.3 Preview/Thumbnail automatique
**Probleme**: Pas de preview des videos dans le dashboard.

```typescript
// A ajouter dans central-server/src/services/thumbnail.service.ts
import ffmpeg from 'fluent-ffmpeg';

class ThumbnailService {
  async generateThumbnail(videoPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          count: 1,
          folder: path.dirname(outputPath),
          filename: path.basename(outputPath),
          size: '320x180',
          timemarks: ['10%'] // A 10% de la video
        })
        .on('end', () => resolve(outputPath))
        .on('error', reject);
    });
  }

  async extractDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });
  }
}
```

**Effort**: 1 jour

#### 3.4 Compression automatique
**Probleme**: Videos trop lourdes = telechargement long.

```typescript
// A ajouter dans central-server/src/services/video-processing.service.ts
class VideoProcessingService {
  async compressForDeployment(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-crf 23',           // Qualite (18-28, plus bas = meilleur)
          '-preset medium',    // Vitesse compression
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart' // Optimise pour streaming
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  async shouldCompress(filePath: string): Promise<boolean> {
    const stats = await fs.stat(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    return sizeMB > 100; // Compresser si > 100MB
  }
}
```

**Effort**: 1.5 jours

#### 3.5 Historique des deploiements par video
**Probleme**: Difficile de savoir ou une video a ete deployee.

```sql
-- A ajouter dans central-server/src/scripts/
CREATE VIEW video_deployment_history AS
SELECT
  v.id as video_id,
  v.original_name,
  cd.id as deployment_id,
  cd.status,
  cd.target_type,
  CASE
    WHEN cd.target_type = 'site' THEN s.club_name
    WHEN cd.target_type = 'group' THEN g.name
  END as target_name,
  cd.created_at,
  cd.completed_at
FROM videos v
LEFT JOIN content_deployments cd ON v.id = cd.video_id
LEFT JOIN sites s ON cd.target_type = 'site' AND cd.target_id = s.id
LEFT JOIN groups g ON cd.target_type = 'group' AND cd.target_id = g.id
ORDER BY cd.created_at DESC;
```

**Effort**: 0.5 jour

### Checklist 10/10 Deploiement Videos:
- [ ] Checksum SHA256 obligatoire
- [ ] Reprise telechargement (Range headers)
- [ ] Generation automatique thumbnails
- [ ] Compression automatique si > 100MB
- [ ] Historique deploiements par video
- [ ] Tests avec fichiers >1GB

---

## 4. ARCHITECTURE SERVEUR/CLIENT (8.5/10 -> 10/10)

### Ce qui manque:

#### 4.1 Redis adapter pour Socket.IO
**Probleme**: Ne scale pas horizontalement (1 seule instance).

```typescript
// Modifier central-server/src/services/socket.service.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

class SocketService {
  async initialize(httpServer: HTTPServer) {
    // Connexion Redis
    if (process.env.REDIS_URL) {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.io = new SocketIOServer(httpServer, { /* ... */ });
      this.io.adapter(createAdapter(pubClient, subClient));

      logger.info('Socket.IO using Redis adapter for horizontal scaling');
    } else {
      this.io = new SocketIOServer(httpServer, { /* ... */ });
      logger.warn('Socket.IO running without Redis - single instance only');
    }
  }
}
```

**Effort**: 1 jour

#### 4.2 Pagination sur toutes les API
**Probleme**: Performance degradee avec beaucoup de donnees.

```typescript
// A ajouter dans central-server/src/middleware/pagination.ts
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export const paginationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  req.pagination = { page, limit, offset };
  next();
};

// Utilisation dans un controller
export const getSites = async (req: AuthRequest, res: Response) => {
  const { limit, offset } = req.pagination;

  const [sites, countResult] = await Promise.all([
    pool.query('SELECT * FROM sites ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
    pool.query('SELECT COUNT(*) FROM sites')
  ]);

  res.json({
    data: sites.rows,
    pagination: {
      page: req.pagination.page,
      limit,
      total: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    }
  });
};
```

**Effort**: 2 jours

#### 4.3 Rate limiting par utilisateur
**Probleme**: Rate limiting global, pas par utilisateur.

```typescript
// Modifier central-server/src/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

export const createUserRateLimit = (windowMs: number, max: number) => {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req: AuthRequest) => {
      // Par utilisateur si authentifie, sinon par IP
      return req.user?.id || req.ip;
    },
    store: process.env.REDIS_URL
      ? new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) })
      : undefined,
    message: { error: 'Trop de requetes, reessayez plus tard' }
  });
};

// Limites differentes par endpoint
app.use('/api/auth', createUserRateLimit(15 * 60 * 1000, 10));  // 10 req/15min pour auth
app.use('/api/videos', createUserRateLimit(60 * 1000, 30));     // 30 req/min pour videos
app.use('/api', createUserRateLimit(60 * 1000, 100));           // 100 req/min general
```

**Effort**: 1 jour

#### 4.4 Health check enrichi
**Probleme**: Endpoint /health basique.

```typescript
// Modifier central-server/src/routes/health.ts
export const healthCheck = async (req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version,
    checks: {
      database: { status: 'unknown', latency: 0 },
      redis: { status: 'unknown', latency: 0 },
      supabase: { status: 'unknown' },
      sockets: { connected: 0 }
    }
  };

  // Check database
  const dbStart = Date.now();
  try {
    await pool.query('SELECT 1');
    health.checks.database = { status: 'ok', latency: Date.now() - dbStart };
  } catch (error) {
    health.checks.database = { status: 'error', latency: 0 };
    health.status = 'degraded';
  }

  // Check Redis
  if (redisClient) {
    const redisStart = Date.now();
    try {
      await redisClient.ping();
      health.checks.redis = { status: 'ok', latency: Date.now() - redisStart };
    } catch {
      health.checks.redis = { status: 'error', latency: 0 };
    }
  }

  // Connected sockets
  health.checks.sockets.connected = socketService.getConnectionCount();

  res.status(health.status === 'ok' ? 200 : 503).json(health);
};
```

**Effort**: 0.5 jour

#### 4.5 WebSocket reconnection avec backoff exponentiel
**Probleme**: Le backoff n'est pas exponentiel cote client dashboard.

```typescript
// Modifier central-dashboard/src/app/core/services/socket.service.ts
@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket;
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 10;

  connect() {
    this.socket = io(environment.socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: this.maxReconnectAttempts,
      // Backoff exponentiel
      randomizationFactor: 0.5
    });

    this.socket.on('connect', () => {
      this.reconnectAttempt = 0;
      console.log('Socket connected');
    });

    this.socket.on('reconnect_attempt', (attempt) => {
      this.reconnectAttempt = attempt;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.log(`Reconnecting in ${delay}ms (attempt ${attempt})`);
    });
  }
}
```

**Effort**: 0.5 jour

### Checklist 10/10 Architecture:
- [ ] Redis adapter Socket.IO
- [ ] Pagination sur toutes les API
- [ ] Rate limiting par utilisateur
- [ ] Health check enrichi (DB, Redis, Sockets)
- [ ] Backoff exponentiel WebSocket
- [ ] Load testing avec 100+ connexions simultanees

---

## 5. SYNCHRONISATION DONNEES (9/10 -> 10/10)

### Ce qui manque:

#### 5.1 Resolution de conflits avancee
**Probleme**: Conflit si meme categorie creee en local et central simultanement.

```javascript
// A ajouter dans raspberry/sync-agent/src/utils/config-merge.js
function resolveConflict(localItem, remoteItem) {
  // Si les deux ont le meme ID mais des contenus differents
  if (localItem.id === remoteItem.id) {
    // Le contenu verrouille (NEOPRO) gagne toujours
    if (remoteItem.locked) return remoteItem;
    if (localItem.locked) return localItem;

    // Sinon, prendre le plus recent
    const localDate = new Date(localItem.updated_at || localItem.added_at || 0);
    const remoteDate = new Date(remoteItem.updated_at || remoteItem.deployed_at || 0);

    if (localDate > remoteDate) {
      // Renommer le remote pour eviter perte
      remoteItem.id = `${remoteItem.id}_central_${Date.now()}`;
      return [localItem, remoteItem]; // Garder les deux
    } else {
      localItem.id = `${localItem.id}_local_${Date.now()}`;
      return [remoteItem, localItem];
    }
  }
}
```

**Effort**: 1 jour

#### 5.2 Historique des synchronisations
**Probleme**: Pas de trace des syncs pour debug.

```javascript
// A ajouter dans raspberry/sync-agent/src/services/sync-history.js
class SyncHistoryService {
  constructor() {
    this.historyPath = '/home/pi/neopro/data/sync-history.json';
    this.maxEntries = 100;
  }

  async recordSync(type, details) {
    const history = await this.loadHistory();
    history.unshift({
      id: uuidv4(),
      type, // 'local_to_central', 'central_to_local', 'merge'
      timestamp: new Date().toISOString(),
      details,
      success: true
    });

    // Garder seulement les 100 derniers
    if (history.length > this.maxEntries) {
      history.length = this.maxEntries;
    }

    await fs.writeJson(this.historyPath, history);
  }

  async getHistory(limit = 20) {
    const history = await this.loadHistory();
    return history.slice(0, limit);
  }
}
```

**Effort**: 0.5 jour

#### 5.3 Validation schema configuration
**Probleme**: Pas de validation du format de configuration.json.

```javascript
// A ajouter dans raspberry/sync-agent/src/utils/config-validator.js
const Joi = require('joi');

const videoSchema = Joi.object({
  name: Joi.string().required(),
  filename: Joi.string().required(),
  path: Joi.string().required(),
  type: Joi.string().default('video/mp4'),
  locked: Joi.boolean().default(false),
  deployed_at: Joi.string().isoDate(),
  expires_at: Joi.string().isoDate().allow(null)
});

const categorySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  locked: Joi.boolean().default(false),
  owner: Joi.string().valid('neopro', 'club').default('club'),
  videos: Joi.array().items(videoSchema).default([]),
  subCategories: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    videos: Joi.array().items(videoSchema).default([])
  })).default([])
});

const configurationSchema = Joi.object({
  version: Joi.string().default('2.0'),
  site_id: Joi.string(),
  categories: Joi.array().items(categorySchema).default([]),
  settings: Joi.object().default({})
});

function validateConfiguration(config) {
  const { error, value } = configurationSchema.validate(config, { abortEarly: false });
  if (error) {
    throw new Error(`Configuration invalide: ${error.details.map(d => d.message).join(', ')}`);
  }
  return value;
}
```

**Effort**: 0.5 jour

### Checklist 10/10 Synchronisation:
- [ ] Resolution de conflits avec timestamps
- [ ] Historique des syncs (100 derniers)
- [ ] Validation schema Joi
- [ ] Tests de sync avec donnees corrompues

---

## 6. SECURITE (8/10 -> 10/10)

### Ce qui manque:

#### 6.1 API keys hashees en base
**Probleme**: API keys stockees en clair dans la table sites.

```typescript
// Modifier central-server/src/controllers/sites.controller.ts
import bcrypt from 'bcryptjs';

export const createSite = async (req: AuthRequest, res: Response) => {
  const apiKey = crypto.randomBytes(32).toString('hex');
  const apiKeyHash = await bcrypt.hash(apiKey, 10);

  const result = await pool.query(
    `INSERT INTO sites (site_name, api_key_hash, ...)
     VALUES ($1, $2, ...)
     RETURNING id, site_name, created_at`,
    [siteName, apiKeyHash, ...]
  );

  // Retourner l'API key UNE SEULE FOIS (non stockee en clair)
  res.status(201).json({
    ...result.rows[0],
    api_key: apiKey, // A sauvegarder par le client
    warning: 'Sauvegardez cette cle API, elle ne sera plus affichee'
  });
};

// Modifier l'authentification socket
const isValidApiKey = await bcrypt.compare(providedApiKey, site.api_key_hash);
```

**Effort**: 1 jour

#### 6.2 Audit log des actions admin
**Probleme**: Pas de trace des actions administratives.

```typescript
// A ajouter dans central-server/src/services/audit.service.ts
class AuditService {
  async log(action: string, userId: string, details: object) {
    await pool.query(
      `INSERT INTO audit_logs (action, user_id, details, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [action, userId, JSON.stringify(details), req.ip, req.headers['user-agent']]
    );
  }
}

// Utilisation
auditService.log('VIDEO_DEPLOYED', req.user.id, { videoId, targetSites });
auditService.log('USER_CREATED', req.user.id, { newUserId, role });
auditService.log('SITE_DELETED', req.user.id, { siteId, siteName });
```

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES users(id),
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_date ON audit_logs(created_at);
```

**Effort**: 1.5 jours

#### 6.3 MFA pour admins
**Probleme**: Pas d'authentification multi-facteurs.

```typescript
// A ajouter dans central-server/src/services/mfa.service.ts
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

class MFAService {
  generateSecret(email: string) {
    const secret = speakeasy.generateSecret({
      name: `NEOPRO (${email})`,
      length: 32
    });
    return secret;
  }

  async generateQRCode(secret: speakeasy.GeneratedSecret) {
    return QRCode.toDataURL(secret.otpauth_url!);
  }

  verifyToken(secret: string, token: string) {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1 // Tolere 30s de decalage
    });
  }
}

// Dans le login
if (user.mfa_enabled) {
  if (!req.body.mfa_token) {
    return res.status(200).json({ mfa_required: true });
  }
  if (!mfaService.verifyToken(user.mfa_secret, req.body.mfa_token)) {
    return res.status(401).json({ error: 'Code MFA invalide' });
  }
}
```

**Effort**: 2 jours

#### 6.4 Rotation automatique des tokens
**Probleme**: Les JWT n'expirent pas assez vite.

```typescript
// Modifier central-server/src/controllers/auth.controller.ts
export const refreshToken = async (req: AuthRequest, res: Response) => {
  const refreshToken = req.cookies.refreshToken;

  // Verifier le refresh token
  const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!);

  // Verifier qu'il n'est pas revoque
  const isRevoked = await pool.query(
    'SELECT 1 FROM revoked_tokens WHERE token_id = $1',
    [decoded.jti]
  );

  if (isRevoked.rows.length > 0) {
    return res.status(401).json({ error: 'Token revoque' });
  }

  // Generer nouveaux tokens
  const newAccessToken = jwt.sign(
    { userId: decoded.userId },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' } // Access token court
  );

  const newRefreshToken = jwt.sign(
    { userId: decoded.userId, jti: uuidv4() },
    process.env.REFRESH_TOKEN_SECRET!,
    { expiresIn: '7d' }
  );

  // Revoquer l'ancien refresh token
  await pool.query(
    'INSERT INTO revoked_tokens (token_id) VALUES ($1)',
    [decoded.jti]
  );

  res.cookie('refreshToken', newRefreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ accessToken: newAccessToken });
};
```

**Effort**: 1 jour

### Checklist 10/10 Securite:
- [ ] API keys hashees (bcrypt)
- [ ] Audit log toutes actions admin
- [ ] MFA pour admins (TOTP)
- [ ] Rotation tokens (access 15min, refresh 7j)
- [ ] Pentest externe
- [ ] npm audit clean

---

## 7. QUALITE CODE / TESTS (7.5/10 -> 10/10)

### Ce qui manque:

#### 7.1 Tests E2E
**Probleme**: 0 tests end-to-end.

```typescript
// A creer dans central-server/e2e/
import { test, expect } from '@playwright/test';

test.describe('Video Deployment Flow', () => {
  test('should deploy video to a site', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@neopro.fr');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');

    // Navigate to videos
    await page.click('text=Videos');

    // Upload video
    await page.setInputFiles('input[type="file"]', 'test-video.mp4');
    await page.fill('[name="title"]', 'Test Video');
    await page.click('text=Uploader');

    // Deploy
    await page.click('text=Deployer');
    await page.selectOption('[name="targetSite"]', 'site-1');
    await page.click('text=Confirmer');

    // Verify
    await expect(page.locator('text=Deploiement en cours')).toBeVisible();
  });
});
```

**Effort**: 5 jours

#### 7.2 Tests d'integration sync-agent
**Probleme**: Le sync-agent n'a pas de tests.

```javascript
// A creer dans raspberry/sync-agent/src/__tests__/
const { NeoproSyncAgent } = require('../agent');
const { mergeConfigurations } = require('../utils/config-merge');

describe('Config Merge', () => {
  test('should preserve local club content', () => {
    const local = {
      categories: [
        { id: 'club', name: 'Club Content', locked: false, videos: [{ name: 'local.mp4' }] }
      ]
    };

    const neopro = {
      categories: [
        { id: 'neopro', name: 'NEOPRO', locked: true, videos: [{ name: 'sponsor.mp4' }] }
      ]
    };

    const merged = mergeConfigurations(local, neopro);

    expect(merged.categories).toHaveLength(2);
    expect(merged.categories.find(c => c.id === 'club').videos).toHaveLength(1);
    expect(merged.categories.find(c => c.id === 'neopro').locked).toBe(true);
  });

  test('should not allow deletion of locked content', () => {
    // ...
  });
});

describe('Video Deployment', () => {
  test('should verify checksum after download', async () => {
    // ...
  });

  test('should resume interrupted download', async () => {
    // ...
  });
});
```

**Effort**: 3 jours

#### 7.3 Couverture > 80%
**Probleme**: Couverture actuelle ~67%.

```bash
# Objectifs de couverture par module
central-server/src/controllers/  -> 95% (actuellement 94%)
central-server/src/services/     -> 80% (actuellement ~30%)
central-server/src/middleware/   -> 95% (actuellement 97%)
raspberry/sync-agent/src/        -> 80% (actuellement 0%)
```

**Effort**: 5 jours

#### 7.4 Linting strict
**Probleme**: Regles ESLint pas assez strictes.

```javascript
// Mettre a jour eslint.config.js
module.exports = {
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-console': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': 'error'
  }
};
```

**Effort**: 2 jours (fix des erreurs)

### Checklist 10/10 Qualite:
- [ ] Tests E2E Playwright (flux critiques)
- [ ] Tests integration sync-agent
- [ ] Couverture > 80%
- [ ] Linting strict sans erreurs
- [ ] Pre-commit hooks (husky)

---

## 8. DOCUMENTATION (9/10 -> 10/10)

### Ce qui manque:

#### 8.1 Documentation API OpenAPI/Swagger
**Probleme**: Pas de spec OpenAPI.

```yaml
# A creer dans central-server/openapi.yaml
openapi: 3.0.3
info:
  title: NEOPRO Central API
  version: 1.0.0
  description: API de gestion de flotte NEOPRO

paths:
  /api/auth/login:
    post:
      summary: Authentification utilisateur
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
      responses:
        200:
          description: Connexion reussie
          content:
            application/json:
              schema:
                type: object
                properties:
                  user:
                    $ref: '#/components/schemas/User'

  /api/sites:
    get:
      summary: Liste des sites
      security:
        - bearerAuth: []
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        200:
          description: Liste paginee des sites
```

**Effort**: 2 jours

#### 8.2 Guide utilisateur final (non technique)
**Probleme**: Doc orientee developpeur uniquement.

```markdown
# A creer dans docs/USER_GUIDE.md

# Guide Utilisateur NEOPRO

## Pour le Regisseur (jour de match)

### 1. Se connecter a la telecommande
1. Connectez votre smartphone au WiFi `NEOPRO-[VOTRE_CLUB]`
2. Ouvrez votre navigateur
3. Allez sur `http://neopro.local/remote`
4. Entrez le mot de passe du club

### 2. Lancer une video
1. Selectionnez la categorie (Avant-match, Match, Apres-match)
2. Cliquez sur la video souhaitee
3. La video demarre immediatement sur la TV

### 3. Gerer la boucle sponsors
...
```

**Effort**: 1 jour

### Checklist 10/10 Documentation:
- [ ] OpenAPI/Swagger complet
- [ ] Guide utilisateur non-technique
- [ ] Videos tutoriels (optionnel)
- [ ] FAQ enrichie

---

## RESUME - EFFORT TOTAL POUR 10/10

| Composant | Effort |
|-----------|--------|
| Hors Connexion | 3-4 jours |
| Mises a Jour | 5-7 jours |
| Deploiement Videos | 5-6 jours |
| Architecture | 7-10 jours |
| Synchronisation | 2-3 jours |
| Securite | 5-7 jours |
| Tests/Qualite | 10-15 jours |
| Documentation | 2-3 jours |
| **TOTAL** | **40-55 jours** |

### Priorisation Recommandee

**Sprint 1 (2 semaines) - Securite & Stabilite:**
- API keys hashees
- Audit logs
- Checksum obligatoire
- Tests E2E critiques

**Sprint 2 (2 semaines) - Performance & Scaling:**
- Redis adapter
- Pagination API
- Compression videos
- Resume download

**Sprint 3 (2 semaines) - UX & Documentation:**
- Indicateurs connectivite
- Notifications MAJ
- OpenAPI spec
- Guide utilisateur

**Sprint 4 (1-2 semaines) - Polish:**
- MFA admins
- Deploi canary
- Tests couverture 80%
- Thumbnails auto

---

*Document genere le 13 Decembre 2025*
