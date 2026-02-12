#!/usr/bin/env node

/**
 * Serveur Web Admin pour Neopro Raspberry Pi
 * Interface d'administration accessible sur http://neopro.local:8080
 *
 * Architecture:
 * - services/         -> Logique métier (configuration, video, system, network, backup)
 * - routes/           -> Contrôleurs HTTP minces (délèguent aux services)
 * - helpers.js        -> Utilitaires partagés (exec, sanitize, paths)
 *
 * Services:
 * - ConfigurationService -> CRUD sur configuration.json (catégories, settings, timeCategories)
 * - VideoService          -> Vidéos (upload, list, edit, delete, orphans, config updates)
 * - VideoProcessingService -> File de traitement vidéo (compression, thumbnails)
 * - SystemService         -> Système (CPU, disk, services, version, reboot)
 * - NetworkService        -> WiFi (scan, connect, BSSID lock, hotspot)
 * - BackupService         -> Backups (list, create, download, auto-backup)
 *
 * Routes:
 * - routes/auth.js    -> Authentification (login, sessions)
 * - routes/system.js  -> Système (délègue au SystemService)
 * - routes/videos.js  -> Vidéos (délègue au VideoService)
 * - routes/config.js  -> Configuration (délègue au ConfigurationService)
 * - routes/network.js -> Réseau (délègue au NetworkService)
 * - routes/backup.js  -> Backups (délègue au BackupService)
 * - routes/update.js  -> Mise à jour (upload .tar.gz, deploy)
 * - routes/email.js   -> Email (config, test, send)
 * - routes/cache.js   -> Cache (stats, clear, info)
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const fsCore = require('fs');
const fs = fsCore.promises;
const path = require('path');

const {
  NEOPRO_DIR,
  VIDEOS_DIR,
  TEMP_UPLOAD_DIR,
  PROCESSING_DIR,
  THUMBNAILS_DIR,
  LOGS_DIR,
} = require('./helpers');

// =============================================================================
// SERVICES
// =============================================================================

const { getInstance: getCacheManager, NAMESPACES } = require('./cache-manager');
const cache = getCacheManager({
  maxSize: 200,
  defaultTTL: 60000, // 60 secondes
});

const ConfigurationService = require('./services/configuration.service');
const VideoService = require('./services/video.service');
const VideoProcessingService = require('./services/video-processing.service');
const SystemService = require('./services/system.service');
const NetworkService = require('./services/network.service');
const BackupService = require('./services/backup.service');

// Instantiate services (ordered by dependency)
const configService = new ConfigurationService({ cache, NAMESPACES });
const videoProcessingService = new VideoProcessingService();
const videoService = new VideoService({ configService, cache, NAMESPACES });
const systemService = new SystemService();
const networkService = new NetworkService();
const backupService = new BackupService();

// =============================================================================
// ROUTES
// =============================================================================

const authRouter = require('./routes/auth');
const { requireAuth } = require('./routes/auth');
const updateRouter = require('./routes/update');

// Email notifications
const emailNotifier = require('./email-notifier');

// Factory-created routers (receive services)
const createSystemRouter = require('./routes/system');
const createVideosRouter = require('./routes/videos');
const createConfigRouter = require('./routes/config');
const createNetworkRouter = require('./routes/network');
const createBackupRouter = require('./routes/backup');
const createEmailRouter = require('./routes/email');
const createCacheRouter = require('./routes/cache');

const systemRouter = createSystemRouter({ systemService });
const videosRouter = createVideosRouter({ videoService, videoProcessingService });
const configRouter = createConfigRouter({ configService });
const networkRouter = createNetworkRouter({ networkService });
const backupRouter = createBackupRouter({ backupService });
const emailRouter = createEmailRouter(emailNotifier);
const cacheRouter = createCacheRouter(cache, NAMESPACES);

// =============================================================================
// EXPRESS APP
// =============================================================================

const app = express();
const PORT = process.env.ADMIN_PORT || 8080;

console.log('[admin] NEOPRO_DIR resolved to ' + NEOPRO_DIR);
console.log('[admin] Videos directory: ' + VIDEOS_DIR);

// =============================================================================
// SECURITY HEADERS MIDDLEWARE
// =============================================================================

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "media-src 'self' blob:; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );

  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=()'
  );

  if (process.env.NODE_ENV === 'production' && req.protocol === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  if (process.env.NODE_ENV === 'production') {
    if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (req.url.match(/\.(mp4|mkv|mov|avi)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  } else {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }

  next();
});

// =============================================================================
// BODY PARSERS & COOKIES
// =============================================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// =============================================================================
// UNICODE PATH NORMALIZATION (for static files)
// =============================================================================

const normalizeUnicodePath = (baseDir) => {
  return (req, res, next) => {
    const decodedPath = decodeURIComponent(req.path);
    const nfcPath = decodedPath.normalize('NFC');
    const nfdPath = decodedPath.normalize('NFD');

    const fullNfcPath = path.join(baseDir, nfcPath);
    const fullNfdPath = path.join(baseDir, nfdPath);

    if (fsCore.existsSync(fullNfcPath)) {
      req.url = '/' + nfcPath.split('/').map(encodeURIComponent).join('/');
    } else if (fsCore.existsSync(fullNfdPath)) {
      req.url = '/' + nfdPath.split('/').map(encodeURIComponent).join('/');
    }

    next();
  };
};

// CORS for static assets (thumbnails, videos)
const staticAssetsCors = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
};

// =============================================================================
// STATIC FILES (before auth middleware)
// =============================================================================

app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', staticAssetsCors, normalizeUnicodePath(VIDEOS_DIR), express.static(VIDEOS_DIR));
app.use('/thumbnails', staticAssetsCors, normalizeUnicodePath(THUMBNAILS_DIR), express.static(THUMBNAILS_DIR));

// =============================================================================
// AUTH ROUTES (before requireAuth middleware)
// =============================================================================

app.use(authRouter);

// =============================================================================
// LOCALHOST-ONLY ROUTES (before auth — called by sync-agent on the same Pi)
// =============================================================================

app.post('/api/system/apply-services', (req, res, next) => {
  const clientIp = req.ip || req.socket?.remoteAddress || '';
  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1'
    || clientIp.includes('127.0.0.1') || clientIp === '::ffff:7f00:1';
  if (!isLocal) {
    return next(); // Fall through to requireAuth → normal auth flow
  }
  console.log(`[auth] Localhost bypass apply-services (ip=${clientIp})`);
  systemService.applySystemdServices()
    .then(result => res.json({ success: true, ...result }))
    .catch(error => res.status(500).json({ error: error.message }));
});

// =============================================================================
// APPLY AUTHENTICATION TO ALL ROUTES BELOW
// =============================================================================

app.use(requireAuth);

// =============================================================================
// HOMEPAGE
// =============================================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =============================================================================
// MOUNT ROUTE MODULES
// =============================================================================

app.use(systemRouter);
app.use(videosRouter);
app.use(configRouter);
app.use(networkRouter);
app.use(backupRouter);
app.use(updateRouter);
app.use(emailRouter);
app.use(cacheRouter);

// =============================================================================
// SERVER START
// =============================================================================

app.listen(PORT, '0.0.0.0', async () => {
  console.log('✓ Serveur Web Admin Neopro lancé sur le port ' + PORT);
  console.log('  Accessible sur:');
  console.log('  - http://neopro.local:' + PORT);
  console.log('  - http://192.168.4.1:' + PORT);
  console.log('  - http://localhost:' + PORT);

  // Créer les répertoires nécessaires au démarrage
  try {
    await fs.mkdir(VIDEOS_DIR, { recursive: true });
    await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
    await fs.mkdir(PROCESSING_DIR, { recursive: true });
    await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
    await fs.mkdir(LOGS_DIR, { recursive: true });
    console.log('✓ Répertoires système initialisés');
  } catch (error) {
    console.error('⚠ Erreur lors de la création des répertoires:', error.message);
  }

  // Initialiser les notifications email
  await emailNotifier.init();
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

process.on('uncaughtException', (error) => {
  console.error('Erreur non gérée:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Promesse rejetée:', error);
});
