#!/usr/bin/env node

/**
 * Serveur Web Admin pour Neopro Raspberry Pi
 * Interface d'administration accessible sur http://neopro.local:8080
 *
 * Fonctionnalités:
 * - Dashboard système (CPU, mémoire, température, stockage)
 * - Upload de vidéos
 * - Configuration WiFi client
 * - Visualisation des logs
 * - Gestion des mises à jour
 * - Redémarrage des services
 */

const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const { promisify } = require('util');
const fsCore = require('fs');
const fs = fsCore.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const execAsync = promisify(exec);

// =============================================================================
// AUTHENTICATION SYSTEM
// =============================================================================

// Simple in-memory session store (persisted to file for restarts)
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours
const SESSION_FILE = path.join(process.env.NEOPRO_DIR || path.resolve(__dirname, '..'), 'data', 'admin-sessions.json');
const sessions = new Map();

// Load sessions from file on startup
async function loadSessions() {
  try {
    const data = await fs.readFile(SESSION_FILE, 'utf8');
    const savedSessions = JSON.parse(data);
    const now = Date.now();
    for (const [token, session] of Object.entries(savedSessions)) {
      if (session.expiresAt > now) {
        sessions.set(token, session);
      }
    }
    console.log(`[auth] Loaded ${sessions.size} valid sessions from file`);
  } catch (error) {
    // File doesn't exist or is invalid, start with empty sessions
    console.log('[auth] No existing sessions file, starting fresh');
  }
}

// Save sessions to file
async function saveSessions() {
  try {
    const dir = path.dirname(SESSION_FILE);
    await fs.mkdir(dir, { recursive: true });
    const sessionObj = Object.fromEntries(sessions);
    await fs.writeFile(SESSION_FILE, JSON.stringify(sessionObj, null, 2));
  } catch (error) {
    console.error('[auth] Failed to save sessions:', error.message);
  }
}

// Generate secure session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Create a new session
function createSession() {
  const token = generateSessionToken();
  const session = {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION,
    lastActivity: Date.now()
  };
  sessions.set(token, session);
  saveSessions(); // Async, don't wait
  return token;
}

// Validate session
function validateSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    saveSessions();
    return false;
  }
  // Update last activity
  session.lastActivity = Date.now();
  return true;
}

// Destroy session
function destroySession(token) {
  sessions.delete(token);
  saveSessions();
}

// Get admin password from configuration
async function getAdminPassword() {
  const configPath = path.join(
    process.env.NEOPRO_DIR || path.resolve(__dirname, '..'),
    'webapp',
    'configuration.json'
  );

  try {
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);
    return config.auth?.password || null;
  } catch (error) {
    console.warn('[auth] Failed to read admin password from config:', error.message);
    return null;
  }
}

// Authentication middleware
const requireAuth = async (req, res, next) => {
  // Skip auth for login routes and static assets
  if (req.path === '/login' || req.path === '/api/auth/login' || req.path === '/api/auth/status') {
    return next();
  }

  // Skip auth for static files (served before this middleware)
  if (req.path.match(/\.(css|js|png|jpg|ico|svg|woff|woff2)$/)) {
    return next();
  }

  const token = req.cookies?.admin_session;

  if (!validateSession(token)) {
    // For API requests, return 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Non authentifié', code: 'AUTH_REQUIRED' });
    }
    // For page requests, redirect to login
    return res.redirect('/login');
  }

  next();
};

// Load sessions on startup
loadSessions();

// Email notifications
const emailNotifier = require('./email-notifier');

// Cache manager
const { getInstance: getCacheManager, NAMESPACES } = require('./cache-manager');
const cache = getCacheManager({
  maxSize: 200,
  defaultTTL: 60000 // 60 secondes
});

// Configuration
const app = express();
const PORT = process.env.ADMIN_PORT || 8080;
const DEFAULT_NEOPRO_DIR = path.resolve(__dirname, '..');
const NEOPRO_DIR = process.env.NEOPRO_DIR || DEFAULT_NEOPRO_DIR;
const VIDEOS_DIR = path.join(NEOPRO_DIR, 'videos');
const TEMP_UPLOAD_DIR = path.join(NEOPRO_DIR, 'uploads-temp');
const PROCESSING_DIR = path.join(NEOPRO_DIR, 'videos-processing');
const THUMBNAILS_DIR = path.join(NEOPRO_DIR, 'thumbnails');
const LOGS_DIR = path.join(NEOPRO_DIR, 'logs');
const VIDEO_COMPRESSION_ENABLED = process.env.VIDEO_COMPRESSION !== 'false';
const VIDEO_THUMBNAILS_ENABLED = process.env.VIDEO_THUMBNAILS !== 'false';
const VERSION_FILE = path.join(NEOPRO_DIR, 'VERSION');
const RELEASE_METADATA_FILE = path.join(NEOPRO_DIR, 'release.json');
// Single source of truth: webapp/configuration.json
const CONFIG_FILE_CANDIDATES = [
  process.env.CONFIG_PATH,
  path.join(NEOPRO_DIR, 'webapp', 'configuration.json'),
].filter((value, index, self) => value && self.indexOf(value) === index);
const CONFIG_JSON_INDENT = 4;
let versionCache = null;
let versionCacheTimestamp = 0;
const VERSION_CACHE_TTL = 60000;

console.log(`[admin] NEOPRO_DIR resolved to ${NEOPRO_DIR}`);
console.log(`[admin] Videos directory: ${VIDEOS_DIR}`);

// Security Headers Middleware
app.use((req, res, next) => {
  // Content Security Policy
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

  // X-Frame-Options
  res.setHeader('X-Frame-Options', 'DENY');

  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-XSS-Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer-Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=()'
  );

  // HSTS (only in production with HTTPS)
  if (process.env.NODE_ENV === 'production' && req.protocol === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Cache Control (production vs development)
  if (process.env.NODE_ENV === 'production') {
    // Cache static assets for 1 year
    if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (req.url.match(/\.(mp4|mkv|mov|avi)$/)) {
      // Cache videos for 1 week
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else {
      // No cache for HTML/API responses
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  } else {
    // Development: no cache
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }

  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files (before auth middleware)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(VIDEOS_DIR));

// =============================================================================
// AUTHENTICATION ROUTES (before requireAuth middleware)
// =============================================================================

// Login page
app.get('/login', async (req, res) => {
  // Check if already authenticated
  if (validateSession(req.cookies?.admin_session)) {
    return res.redirect('/');
  }

  // Check if password is configured
  const password = await getAdminPassword();
  const needsSetup = !password;

  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connexion - NeoPro Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #2022E9 0%, #3A0686 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .login-card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 400px;
      padding: 48px 40px;
    }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo h1 { font-size: 28px; color: #2022E9; }
    .logo p { color: #6b7280; font-size: 14px; margin-top: 8px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; font-weight: 600; color: #374151; margin-bottom: 8px; font-size: 14px; }
    input[type="password"] {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 16px;
      transition: all 0.2s;
    }
    input[type="password"]:focus {
      outline: none;
      border-color: #2022E9;
      box-shadow: 0 0 0 3px rgba(32,34,233,0.1);
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #2022E9 0%, #3A0686 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(32,34,233,0.4); }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .setup-notice {
      background: linear-gradient(135deg, rgba(32,34,233,0.1) 0%, rgba(58,6,134,0.1) 100%);
      border: 1px solid rgba(32,34,233,0.2);
      padding: 16px;
      border-radius: 12px;
      margin-bottom: 24px;
      font-size: 14px;
      color: #374151;
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="logo">
      <h1>NeoPro Admin</h1>
      <p>Panneau d'administration</p>
    </div>
    ${needsSetup ? '<div class="setup-notice">Veuillez d\'abord configurer un mot de passe via l\'application principale (TV/Remote).</div>' : ''}
    <div id="error" class="error" style="display: none;"></div>
    <form id="loginForm">
      <div class="form-group">
        <label for="password">Mot de passe</label>
        <input type="password" id="password" name="password" placeholder="Entrez le mot de passe" required ${needsSetup ? 'disabled' : ''}>
      </div>
      <button type="submit" ${needsSetup ? 'disabled' : ''}>Se connecter</button>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('password').value;
      const errorDiv = document.getElementById('error');

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
          credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
          window.location.href = '/';
        } else {
          errorDiv.textContent = data.error || 'Mot de passe incorrect';
          errorDiv.style.display = 'block';
        }
      } catch (error) {
        errorDiv.textContent = 'Erreur de connexion au serveur';
        errorDiv.style.display = 'block';
      }
    });
  </script>
</body>
</html>
  `);
});

// Login API
app.post('/api/auth/login', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, error: 'Mot de passe requis' });
  }

  const adminPassword = await getAdminPassword();

  if (!adminPassword) {
    return res.status(403).json({
      success: false,
      error: 'Aucun mot de passe configuré. Veuillez configurer un mot de passe via l\'application principale.'
    });
  }

  if (password !== adminPassword) {
    console.log('[auth] Failed login attempt');
    return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
  }

  // Create session
  const token = createSession();

  // Set cookie
  // Note: secure should only be true for HTTPS connections
  // On local network (neopro.local, 192.168.x.x), we use HTTP so secure must be false
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('admin_session', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/'
  });

  console.log('[auth] Successful login');
  res.json({ success: true });
});

// Logout API
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.admin_session;
  if (token) {
    destroySession(token);
  }
  res.clearCookie('admin_session', { path: '/' });
  res.json({ success: true });
});

// Auth status API
app.get('/api/auth/status', (req, res) => {
  const token = req.cookies?.admin_session;
  const authenticated = validateSession(token);
  res.json({ authenticated });
});

// =============================================================================
// APPLY AUTHENTICATION MIDDLEWARE TO ALL ROUTES BELOW
// =============================================================================
app.use(requireAuth);

app.get('/api/version', async (req, res) => {
  try {
    const info = await loadVersionInfo();
    res.json(info);
  } catch (error) {
    console.error('[admin] Failed to load version info:', error);
    res.status(500).json({ error: 'Impossible de charger la version' });
  }
});

async function resolveConfigurationPath() {
  return cache.getOrSet(NAMESPACES.CONFIG, 'path', async () => {
    for (const candidate of CONFIG_FILE_CANDIDATES) {
      try {
        const stats = await fs.stat(candidate);
        if (stats.isFile()) {
          console.log('[admin] configuration.json detected at', candidate);
          return candidate;
        }
      } catch (error) {
        // Ignorer et tester la suivante
      }
    }
    console.warn('[admin] Aucun configuration.json trouvé parmi', CONFIG_FILE_CANDIDATES);
    return null;
  }, 300000); // 5 minutes TTL
}

async function loadVersionInfo() {
  const now = Date.now();
  if (versionCache && now - versionCacheTimestamp < VERSION_CACHE_TTL) {
    return versionCache;
  }

  const info = {
    version: 'unknown',
    commit: null,
    buildDate: null,
    source: 'local',
  };

  try {
  const releaseRaw = await fs.readFile(RELEASE_METADATA_FILE, 'utf8');
    const releaseData = JSON.parse(releaseRaw);
    if (releaseData.version) {
      info.version = releaseData.version;
    }
    info.commit = releaseData.commit || null;
    info.buildDate = releaseData.buildDate || null;
    info.source = releaseData.source || info.source;
  } catch (error) {
    // release.json absent -> fallback
  }

  if (!info.version || info.version === 'unknown') {
    try {
      const webappVersion = await fs.readJson(path.join(NEOPRO_DIR, 'webapp', 'version.json'));
      if (webappVersion?.version) {
        info.version = webappVersion.version;
        info.source = 'webapp/version.json';
        info.commit = info.commit || webappVersion.commit || null;
        info.buildDate = info.buildDate || webappVersion.buildDate || null;
      }
    } catch (error) {
      // ignore
    }
  }

  if (!info.version || info.version === 'unknown') {
    try {
      const versionRaw = await fs.readFile(VERSION_FILE, 'utf8');
      const trimmed = versionRaw.trim();
      if (trimmed) {
        info.version = trimmed;
        info.source = 'version-file';
      }
    } catch (error) {
      // ignored
    }
  }

  if (!info.version || info.version === 'unknown') {
    try {
      const pkgRaw = await fs.readFile(path.join(__dirname, 'package.json'), 'utf8');
      const pkgJson = JSON.parse(pkgRaw);
      if (pkgJson.version) {
        info.version = pkgJson.version;
        info.source = 'package.json';
      }
    } catch (error) {
      // ignored
    }
  }

  versionCache = info;
  versionCacheTimestamp = now;
  return info;
}

function sanitizeSegment(value, fallback) {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase();
}

function sanitizeFilename(value, fallback) {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const cleaned = trimmed
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
  return cleaned || fallback;
}

function extractPathSegments(videoPath) {
  if (!videoPath) {
    return null;
  }
  const normalized = videoPath.replace(/\\/g, '/');
  const withoutPrefix = normalized.startsWith('videos/')
    ? normalized.slice('videos/'.length)
    : normalized;

  const segments = withoutPrefix.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  return {
    category: segments[0],
    subcategory: segments.length > 1 ? segments[1] : null
  };
}

async function loadVideoPathMapping() {
  return cache.getOrSet(NAMESPACES.CONFIG, 'videoMapping', async () => {
    const mapping = { categories: {}, subcategories: {} };

    try {
      const configPath = await resolveConfigurationPath();
      if (!configPath) {
        console.warn('[admin] Impossible de localiser configuration.json pour déterminer les dossiers vidéo');
      } else {
        const configRaw = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configRaw);
        const categories = config.categories || [];

        for (const category of categories) {
          if (!category || !category.id) continue;
          const categoryKey = category.id.trim().toLowerCase();
          let categoryDir = null;

          const directVideos = category.videos || [];
          for (const video of directVideos) {
            const parsed = extractPathSegments(video.path);
            if (parsed?.category) {
              categoryDir = parsed.category;
              break;
            }
          }

          const subcategories = category.subCategories || [];
          for (const sub of subcategories) {
            if (!sub || !sub.id) continue;
            const subKey = `${categoryKey}::${sub.id.trim().toLowerCase()}`;
            let subDir = null;

            const subVideos = sub.videos || [];
            for (const video of subVideos) {
              const parsed = extractPathSegments(video.path);
              if (parsed?.subcategory) {
                subDir = parsed.subcategory;
              }
              if (parsed?.category && !categoryDir) {
                categoryDir = parsed.category;
              }
              if (subDir && categoryDir) {
                break;
              }
            }

            if (subDir) {
              mapping.subcategories[subKey] = subDir;
            }
          }

          if (categoryDir) {
            mapping.categories[categoryKey] = categoryDir;
          }
        }
      }
    } catch (error) {
      console.warn('[admin] Erreur lors du chargement de configuration.json:', error.message);
    }

    return mapping;
  }, 60000); // 60 seconds TTL
}

function invalidateVideoCaches() {
  cache.clearNamespace(NAMESPACES.CONFIG);
  cache.clearNamespace(NAMESPACES.VIDEOS);
  console.log('[admin] Video and config caches invalidated');
}

/**
 * Vérifie si un élément est verrouillé (contenu NEOPRO)
 * @param {Object} item - Catégorie, sous-catégorie ou vidéo
 * @returns {boolean} true si verrouillé
 */
function isLocked(item) {
  return item && (item.locked === true || item.owner === 'neopro');
}

/**
 * Vérifie si une catégorie peut être modifiée
 * @param {Object} category - Catégorie à vérifier
 * @returns {Object} { allowed: boolean, reason?: string }
 */
function canModifyCategory(category) {
  if (isLocked(category)) {
    return {
      allowed: false,
      reason: 'Cette catégorie est gérée par NEOPRO et ne peut pas être modifiée.',
    };
  }
  return { allowed: true };
}

/**
 * Vérifie si une vidéo peut être modifiée/supprimée
 * @param {Object} video - Vidéo à vérifier
 * @param {Object} category - Catégorie parente
 * @param {Object} subcategory - Sous-catégorie parente (optionnelle)
 * @returns {Object} { allowed: boolean, reason?: string }
 */
function canModifyVideo(video, category, subcategory = null) {
  if (isLocked(video)) {
    return {
      allowed: false,
      reason: 'Cette vidéo est gérée par NEOPRO et ne peut pas être modifiée.',
    };
  }
  if (isLocked(category)) {
    return {
      allowed: false,
      reason: 'Cette vidéo appartient à une catégorie NEOPRO et ne peut pas être modifiée.',
    };
  }
  if (subcategory && isLocked(subcategory)) {
    return {
      allowed: false,
      reason: 'Cette vidéo appartient à une sous-catégorie NEOPRO et ne peut pas être modifiée.',
    };
  }
  return { allowed: true };
}

/**
 * Trouve une catégorie et optionnellement une vidéo/sous-catégorie dans la config
 * @param {Object} config - Configuration complète
 * @param {string} categoryId - ID de la catégorie
 * @param {string} subcategoryId - ID de la sous-catégorie (optionnel)
 * @param {string} videoPath - Chemin de la vidéo (optionnel)
 * @returns {Object} { category, subcategory?, video? }
 */
function findInConfig(config, categoryId, subcategoryId = null, videoPath = null) {
  const category = (config.categories || []).find(
    (c) => c.id === categoryId || c.name === categoryId
  );
  if (!category) {
    return { category: null };
  }

  let subcategory = null;
  if (subcategoryId) {
    subcategory = (category.subCategories || []).find(
      (s) => s.id === subcategoryId || s.name === subcategoryId
    );
  }

  let video = null;
  if (videoPath) {
    const normalizedPath = videoPath.replace(/\\/g, '/');
    if (subcategory) {
      video = (subcategory.videos || []).find(
        (v) => v.path && v.path.replace(/\\/g, '/') === normalizedPath
      );
    } else {
      video = (category.videos || []).find(
        (v) => v.path && v.path.replace(/\\/g, '/') === normalizedPath
      );
    }
  }

  return { category, subcategory, video };
}

async function getVideoMetadataFromConfig() {
  return cache.getOrSet(NAMESPACES.CONFIG, 'videoMetadata', async () => {
    const metadata = {};
    try {
      const configPath = await resolveConfigurationPath();
      if (!configPath) {
        return metadata;
      }

      const configRaw = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configRaw);

      for (const category of config.categories || []) {
        if (!category) continue;
        const categoryId = (category.id || category.name || '').trim();

        (category.videos || []).forEach(video => {
          if (!video?.path) {
            return;
          }
          metadata[video.path.replace(/\\/g, '/')] = {
            displayName: video.name,
            categoryId: categoryId,
            subcategoryId: null
          };
        });

        for (const sub of category.subCategories || []) {
          if (!sub) {
            continue;
          }
          const subId = (sub.id || sub.name || '').trim();
          (sub.videos || []).forEach(video => {
            if (!video?.path) {
              return;
            }
            metadata[video.path.replace(/\\/g, '/')] = {
              displayName: video.name,
              categoryId: categoryId,
              subcategoryId: subId || null
            };
          });
        }
      }

      // Sponsors (boucle partenaires) - considérer leurs vidéos comme référencées
      for (const sponsor of config.sponsors || []) {
        if (!sponsor?.path) {
          continue;
        }
        const normalizedPath = sponsor.path.replace(/\\/g, '/');
        metadata[normalizedPath] = {
          displayName: sponsor.name || buildDisplayNameFromFilename(path.basename(normalizedPath)),
          categoryId: 'sponsor',
          subcategoryId: null
        };
      }
    } catch (error) {
      console.warn('[admin] Unable to build configuration video metadata map:', error.message);
    }

    return metadata;
  }, 60000); // 60 seconds TTL
}

async function resolveUploadDirectories(categoryId, subcategoryId) {
  const mapping = await loadVideoPathMapping();
  const normalizedCategoryKey = (categoryId || '').trim().toLowerCase();
  const fallbackCategory = sanitizeSegment(categoryId, 'AUTRES');
  const resolvedCategory = mapping.categories[normalizedCategoryKey] || fallbackCategory;

  let resolvedSubcategory = null;
  if (subcategoryId) {
    const normalizedSubKey = `${normalizedCategoryKey}::${subcategoryId.trim().toLowerCase()}`;
    resolvedSubcategory = mapping.subcategories[normalizedSubKey]
      || sanitizeSegment(subcategoryId, null);
  }

  return {
    category: resolvedCategory || 'AUTRES',
    subcategory: resolvedSubcategory
  };
}

function buildDisplayNameFromFilename(filename) {
  const baseName = path.basename(filename, path.extname(filename));
  return baseName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveDisplayName(filename, providedName) {
  const fallback = buildDisplayNameFromFilename(filename);
  const cleaned = (providedName || '').trim();
  return cleaned || fallback || filename;
}

function guessMimeFromExtension(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  switch (ext) {
    case '.mkv':
      return 'video/x-matroska';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    default:
      return 'video/mp4';
  }
}

function createVideoEntry(filename, relativePath, mimeType, displayName) {
  const resolvedName = resolveDisplayName(filename, displayName);

  return {
    name: resolvedName,
    path: relativePath,
    type: mimeType || 'video/mp4'
  };
}

async function ensureCategoryStructure(
  config,
  categoryId,
  subcategoryId,
  resolvedCategoryDir,
  resolvedSubcategoryDir
) {
  config.categories = config.categories || [];
  const normalizedCategoryId = (categoryId || resolvedCategoryDir || 'Autres').trim();
  const normalizedCategoryKey = normalizedCategoryId.toLowerCase();

  let category = config.categories.find(
    cat => (cat.id || '').trim().toLowerCase() === normalizedCategoryKey
  );

  if (!category) {
    category = {
      id: normalizedCategoryId,
      name: normalizedCategoryId,
      videos: []
    };
    config.categories.push(category);
  }

  if (subcategoryId || resolvedSubcategoryDir) {
    category.subCategories = category.subCategories || [];
    const normalizedSubId = (subcategoryId || resolvedSubcategoryDir).trim();
    const normalizedSubKey = normalizedSubId.toLowerCase();

    let subCategory = category.subCategories.find(
      sub => (sub.id || '').trim().toLowerCase() === normalizedSubKey
    );

    if (!subCategory) {
      subCategory = {
        id: normalizedSubId,
        name: normalizedSubId,
        videos: []
      };
      category.subCategories.push(subCategory);
    }

    subCategory.videos = subCategory.videos || [];
    return subCategory.videos;
  }

  category.videos = category.videos || [];
  return category.videos;
}

async function updateConfigurationWithVideo(
  categoryId,
  subcategoryId,
  resolvedCategory,
  resolvedSubcategory,
  filename,
  mimeType,
  displayName
) {
  const configPath = await resolveConfigurationPath();
  if (!configPath) {
    throw new Error('Impossible de localiser configuration.json pour mettre à jour la télécommande');
  }

  const configRaw = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(configRaw);

  const targetVideos = await ensureCategoryStructure(
    config,
    categoryId,
    subcategoryId,
    resolvedCategory,
    resolvedSubcategory
  );
  const relativePath = ['videos', resolvedCategory || sanitizeSegment(categoryId, 'AUTRES')];
  if (resolvedSubcategory) {
    relativePath.push(resolvedSubcategory);
  }
  relativePath.push(filename);
  const finalPath = relativePath.filter(Boolean).join('/');

  const alreadyExists = targetVideos.some(video => video.path === finalPath);

  if (!alreadyExists) {
    const newEntry = createVideoEntry(filename, finalPath, mimeType, displayName);
    targetVideos.push(newEntry);
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();
    console.log('[admin] configuration.json updated with new video entry', newEntry);
  } else {
    console.log('[admin] configuration.json already references video path', finalPath);
  }
}

async function removeVideoFromConfig(relativePath) {
  const configPath = await resolveConfigurationPath();
  if (!configPath) {
    console.warn('[admin] Impossible de localiser configuration.json pour supprimer la vidéo', relativePath);
    return;
  }

  const configRaw = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(configRaw);
  let updated = false;

  const removeFromList = (videos = []) => {
    const index = videos.findIndex(video => video.path === relativePath);
    if (index !== -1) {
      videos.splice(index, 1);
      updated = true;
    }
  };

  for (const category of config.categories || []) {
    removeFromList(category.videos);
    for (const sub of category.subCategories || []) {
      removeFromList(sub.videos);
    }
  }

  if (updated) {
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();
    console.log('[admin] configuration.json cleaned from video path', relativePath);
  }
}

async function cleanupEmptyDirs(dirPath, stopAt) {
  const resolvedStop = path.resolve(stopAt);
  let current = path.resolve(dirPath);

  while (current.startsWith(resolvedStop) && current !== resolvedStop) {
    const entries = await fs.readdir(current);
    if (entries.length === 0) {
      await fs.rmdir(current);
      current = path.dirname(current);
    } else {
      break;
    }
  }
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
      cb(null, TEMP_UPLOAD_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const cleanName = sanitizeFilename(file.originalname, file.originalname);
    cb(null, cleanName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    // Accepter seulement les vidéos
    const allowedMimes = ['video/mp4', 'video/x-matroska', 'video/quicktime'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format vidéo non supporté. Utilisez MP4, MKV ou MOV.'));
    }
  }
});

// Uploader pour les packages de mise à jour (.tar.gz)
const uploadPackage = multer({
  storage: multer.diskStorage({
    destination: '/tmp',
    filename: (req, file, cb) => {
      cb(null, `neopro-update-${Date.now()}.tar.gz`);
    }
  }),
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    // Accepter les archives tar.gz
    const allowedMimes = ['application/gzip', 'application/x-gzip', 'application/x-tar', 'application/x-compressed-tar'];
    const isTarGz = file.originalname.endsWith('.tar.gz') || file.originalname.endsWith('.tgz');
    if (allowedMimes.includes(file.mimetype) || isTarGz) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Utilisez un fichier .tar.gz'));
    }
  }
});

/**
 * Gestion de la file de traitement vidéo
 */

async function addToProcessingQueue(jobData) {
  try {
    // Créer le dossier de traitement
    await fs.mkdir(PROCESSING_DIR, { recursive: true });

    // Générer un ID unique pour le job
    const jobId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const job = {
      id: jobId,
      ...jobData,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    // Lire la file actuelle
    let queue = [];
    const queueFile = path.join(PROCESSING_DIR, 'queue.json');
    try {
      const data = await fs.readFile(queueFile, 'utf8');
      queue = JSON.parse(data).jobs || [];
    } catch {
      // File vide ou inexistante
    }

    // Ajouter le job
    queue.push(job);

    // Sauvegarder
    await fs.writeFile(queueFile, JSON.stringify({ jobs: queue, updated: new Date().toISOString() }, null, 2));

    console.log('[admin] Job ajouté à la file de traitement', { jobId, inputPath: jobData.inputPath });

    return jobId;
  } catch (error) {
    console.error('[admin] Échec de l\'ajout à la file', error);
    throw error;
  }
}

async function getJobStatus(jobId) {
  try {
    const statusFile = path.join(PROCESSING_DIR, `job-${jobId}.json`);
    const data = await fs.readFile(statusFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function getProcessingQueue() {
  try {
    const queueFile = path.join(PROCESSING_DIR, 'queue.json');
    const data = await fs.readFile(queueFile, 'utf8');
    return JSON.parse(data).jobs || [];
  } catch {
    return [];
  }
}

/**
 * Utilitaires
 */

// Exécuter une commande shell de manière sécurisée
async function execCommand(command) {
  const run = async cmd => {
    try {
      const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer
      return { success: true, output: stdout, error: stderr };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const result = await run(command);
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const hasSudo = command.trim().startsWith('sudo ');

  const sudoLikelyBlocked =
    result.success === false &&
    hasSudo &&
    isRoot &&
    result.error &&
    (
      result.error.includes('no new privileges') ||
      result.error.toLowerCase().includes('sudo: command not found') ||
      result.error.toLowerCase().includes('sudo: permission denied')
    );

  if (sudoLikelyBlocked) {
    const commandWithoutSudo = command.replace(/^sudo\s+/, '');
    const fallbackResult = await run(commandWithoutSudo);

    if (!fallbackResult.success && fallbackResult.error) {
      fallbackResult.error = `${result.error} | fallback without sudo: ${fallbackResult.error}`;
    }

    return fallbackResult;
  }

  return result;
}

// S'assurer qu'un dossier existe (utile en dev local)
async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

// Obtenir les informations système
async function getSystemInfo() {
  try {
    // CPU
    const cpuUsage = await getCpuUsage();

    // Mémoire
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Température (Raspberry Pi)
    const tempResult = await execCommand('cat /sys/class/thermal/thermal_zone0/temp');
    const temperature = tempResult.success
      ? (parseInt(tempResult.output) / 1000).toFixed(1)
      : 'N/A';

    // Stockage
    const diskResult = await execCommand(`df -h ${NEOPRO_DIR} | tail -1`);
    const diskInfo = diskResult.success ? parseDiskInfo(diskResult.output) : null;

    // Uptime
    const uptimeSeconds = os.uptime();
    const uptime = formatUptime(uptimeSeconds);

    // Status des services
    const services = await getServicesStatus();

    return {
      cpu: cpuUsage,
      memory: {
        total: (totalMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        used: (usedMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        free: (freeMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        percent: ((usedMem / totalMem) * 100).toFixed(1) + '%'
      },
      temperature: temperature + '°C',
      disk: diskInfo,
      uptime: uptime,
      services: services,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch()
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    return { error: error.message };
  }
}

// Calculer l'usage CPU
async function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - (100 * idle / total);

  return {
    usage: usage.toFixed(1) + '%',
    cores: cpus.length
  };
}

// Parser les informations de disque
function parseDiskInfo(output) {
  const parts = output.split(/\s+/);
  return {
    total: parts[1],
    used: parts[2],
    available: parts[3],
    percent: parts[4]
  };
}

// Formater l'uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}j`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(' ');
}

// Vérifier le status des services
async function getServicesStatus() {
  const services = ['neopro-app', 'nginx', 'hostapd', 'dnsmasq', 'avahi-daemon'];
  const statuses = {};

  if (os.platform() !== 'linux') {
    services.forEach(service => {
      statuses[service] = 'unavailable';
    });
    return statuses;
  }

  for (const service of services) {
    const result = await execCommand(`systemctl is-active ${service}`);
    if (!result.success || !result.output) {
      statuses[service] = 'unknown';
    } else {
      statuses[service] = result.output.trim() === 'active' ? 'running' : 'stopped';
    }
  }

  return statuses;
}

/**
 * Routes API
 */

// Page d'accueil (dashboard)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Informations système
app.get('/api/system', async (req, res) => {
  const info = await getSystemInfo();
  res.json(info);
});

// API: Configuration du club
app.get('/api/config', async (req, res) => {
  try {
    const configPath = path.join(NEOPRO_DIR, 'club-config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    res.json(JSON.parse(configData));
  } catch (error) {
    res.status(500).json({ error: 'Configuration non trouvée' });
  }
});

// API: Liste des vidéos
app.get('/api/videos', async (req, res) => {
  try {
    await ensureDirectory(VIDEOS_DIR);
    console.log('[admin] GET /api/videos - listing directory:', VIDEOS_DIR);
    const metadata = await getVideoMetadataFromConfig();
    const videos = await listVideosRecursive(VIDEOS_DIR, VIDEOS_DIR, metadata);
    res.json({ videos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function listVideosRecursive(dir, baseDir = dir, metadata = {}) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  const videos = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      const subVideos = await listVideosRecursive(fullPath, baseDir, metadata);
      videos.push(...subVideos);
    } else if (file.name.match(/\.(mp4|mkv|mov|avi)$/i)) {
      const stats = await fs.stat(fullPath);
      const relativePath = path.relative(baseDir, fullPath);
      const normalizedRelative = relativePath.replace(/\\/g, '/');
      const relativeDir = path.dirname(normalizedRelative);
      const configurationPath = ['videos', normalizedRelative].filter(Boolean).join('/');
      const configEntry = metadata[configurationPath];

      videos.push({
        name: file.name,
        path: normalizedRelative,
        category: relativeDir,
        displayName: configEntry?.displayName || buildDisplayNameFromFilename(file.name),
        configCategory: configEntry?.categoryId || null,
        configSubcategory: configEntry?.subcategoryId || null,
        size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
        modified: stats.mtime
      });
    }
  }

  return videos;
}

// API: Upload de vidéo (single)
app.post('/api/videos/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const compress = req.body.compress !== 'false' && VIDEO_COMPRESSION_ENABLED;
    const generateThumbnail = req.body.thumbnail !== 'false' && VIDEO_THUMBNAILS_ENABLED;

    const { category, subcategory } = await resolveUploadDirectories(
      req.body.category,
      req.body.subcategory
    );
    const targetDir = subcategory
      ? path.join(VIDEOS_DIR, category, subcategory)
      : path.join(VIDEOS_DIR, category);
    await fs.mkdir(targetDir, { recursive: true });

    const targetPath = path.join(targetDir, req.file.filename);

    // Si compression ou miniature demandée, ajouter à la file de traitement
    if (compress || generateThumbnail) {
      // Déplacer vers le dossier de traitement
      const processingPath = path.join(PROCESSING_DIR, req.file.filename);
      await fs.mkdir(PROCESSING_DIR, { recursive: true });
      await fs.rename(req.file.path, processingPath);

      // Ajouter le job à la file
      const jobId = await addToProcessingQueue({
        inputPath: processingPath,
        outputPath: targetPath,
        category: category,
        subcategory: subcategory,
        compress: compress,
        thumbnail: generateThumbnail,
        displayName: req.body.displayName,
        categoryId: req.body.category,
        subcategoryId: req.body.subcategory,
        mimetype: req.file.mimetype
      });

      console.log('[admin] POST /api/videos/upload - ajouté à la file de traitement', {
        filename: req.file.filename,
        jobId: jobId,
        compress: compress,
        thumbnail: generateThumbnail,
        size: req.file.size,
        category: req.body.category,
        subcategory: req.body.subcategory
      });

      res.json({
        success: true,
        message: 'Vidéo uploadée avec succès - traitement en cours',
        file: {
          name: req.file.filename,
          size: (req.file.size / 1024 / 1024).toFixed(2) + ' MB',
          path: targetPath
        },
        processing: {
          jobId: jobId,
          compress: compress,
          thumbnail: generateThumbnail,
          status: 'pending'
        }
      });
    } else {
      // Pas de traitement, déplacer directement
      await fs.rename(req.file.path, targetPath);
      await updateConfigurationWithVideo(
        req.body.category,
        req.body.subcategory,
        category,
        subcategory,
        req.file.filename,
        req.file.mimetype,
        req.body.displayName
      );

      console.log('[admin] POST /api/videos/upload - upload direct', {
        filename: req.file.filename,
        finalPath: targetPath,
        size: req.file.size,
        category: req.body.category,
        subcategory: req.body.subcategory
      });

      res.json({
        success: true,
        message: 'Vidéo uploadée avec succès',
        file: {
          name: req.file.filename,
          size: (req.file.size / 1024 / 1024).toFixed(2) + ' MB',
          path: targetPath
        }
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Upload multiple de vidéos
app.post('/api/videos/upload-multiple', upload.array('videos', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { category, subcategory } = await resolveUploadDirectories(
      req.body.category,
      req.body.subcategory
    );
    const targetDir = subcategory
      ? path.join(VIDEOS_DIR, category, subcategory)
      : path.join(VIDEOS_DIR, category);
    await fs.mkdir(targetDir, { recursive: true });

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const targetPath = path.join(targetDir, file.filename);
        await fs.rename(file.path, targetPath);
        await updateConfigurationWithVideo(
          req.body.category,
          req.body.subcategory,
          category,
          subcategory,
          file.filename,
          file.mimetype,
          null // pas de displayName pour upload multiple
        );

        results.push({
          name: file.filename,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          path: targetPath,
          success: true
        });

        console.log('[admin] POST /api/videos/upload-multiple - file uploaded', {
          filename: file.filename,
          size: file.size,
          category,
          subcategory
        });
      } catch (fileError) {
        errors.push({
          name: file.filename,
          error: fileError.message
        });
        console.error('[admin] Error uploading file:', file.filename, fileError);
      }
    }

    console.log('[admin] POST /api/videos/upload-multiple complete', {
      total: req.files.length,
      success: results.length,
      failed: errors.length
    });

    res.json({
      success: errors.length === 0,
      message: `${results.length}/${req.files.length} vidéo(s) uploadée(s) avec succès`,
      files: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('[admin] Error in upload-multiple:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Supprimer une vidéo
app.delete('/api/videos/:category/:filename', async (req, res) => {
  try {
    const { category, filename } = req.params;
    const normalizedCategory = (category || '').replace(/\\/g, '/');
    const filePath = path.join(VIDEOS_DIR, normalizedCategory, filename);
    const relativePath = ['videos', normalizedCategory, filename]
      .filter(Boolean)
      .join('/')
      .replace(/\\/g, '/');

    // Vérifier si la vidéo est verrouillée (NEOPRO)
    const configPath = await resolveConfigurationPath();
    if (configPath) {
      const configRaw = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configRaw);
      for (const cat of config.categories || []) {
        // Chercher la vidéo dans les vidéos directes
        const video = (cat.videos || []).find(v => v.path === relativePath);
        if (video) {
          const canModify = canModifyVideo(video, cat);
          if (!canModify.allowed) {
            return res.status(403).json({ error: canModify.reason, locked: true });
          }
          break;
        }
        // Chercher dans les sous-catégories
        for (const sub of cat.subCategories || []) {
          const subVideo = (sub.videos || []).find(v => v.path === relativePath);
          if (subVideo) {
            const canModify = canModifyVideo(subVideo, cat, sub);
            if (!canModify.allowed) {
              return res.status(403).json({ error: canModify.reason, locked: true });
            }
            break;
          }
        }
      }
    }

    await fs.access(filePath);
    await fs.unlink(filePath);
    await cleanupEmptyDirs(path.dirname(filePath), VIDEOS_DIR);
    await removeVideoFromConfig(relativePath);

    res.json({ success: true, message: 'Vidéo supprimée', path: relativePath });
  } catch (error) {
    console.error('[admin] Error deleting video:', error);
    res.status(500).json({ error: 'Impossible de supprimer la vidéo' });
  }
});

app.put('/api/videos/edit', async (req, res) => {
  try {
    const {
      originalPath,
      categoryId,
      subcategoryId,
      displayName,
      newFilename
    } = req.body || {};

    const normalizedOriginal = (originalPath || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^videos\//i, '');
    const cleanCategoryId = (categoryId || '').trim();
    const cleanSubcategoryId = (subcategoryId || '').trim();
    const requestedFilename = sanitizeFilename(newFilename, null);

    if (!normalizedOriginal || normalizedOriginal.includes('..')) {
      return res.status(400).json({ error: 'Chemin de fichier invalide' });
    }

    if (!cleanCategoryId) {
      return res.status(400).json({ error: 'Catégorie requise' });
    }

    const sourcePath = path.join(VIDEOS_DIR, normalizedOriginal);
    await fs.access(sourcePath);

    const currentFilename = path.basename(normalizedOriginal);
    const currentExt = path.extname(currentFilename);
    let finalFilename = requestedFilename || currentFilename;
    if (!path.extname(finalFilename) && currentExt) {
      finalFilename = `${finalFilename}${currentExt}`;
    }

    const { category: resolvedCategory, subcategory: resolvedSubcategory } =
      await resolveUploadDirectories(cleanCategoryId, cleanSubcategoryId || null);

    const destinationDir = resolvedSubcategory
      ? path.join(VIDEOS_DIR, resolvedCategory, resolvedSubcategory)
      : path.join(VIDEOS_DIR, resolvedCategory);
    await fs.mkdir(destinationDir, { recursive: true });

    const destinationPath = path.join(destinationDir, finalFilename);
    const shouldMove = path.resolve(destinationPath) !== path.resolve(sourcePath);

    if (shouldMove) {
      await fs.rename(sourcePath, destinationPath);
      await cleanupEmptyDirs(path.dirname(sourcePath), VIDEOS_DIR);
    }

    const originalConfigPath = ['videos', normalizedOriginal]
      .filter(Boolean)
      .join('/')
      .replace(/\\/g, '/');
    const relativeDestinationPath = path
      .relative(VIDEOS_DIR, destinationPath)
      .replace(/\\/g, '/');

    await removeVideoFromConfig(originalConfigPath);
    await updateConfigurationWithVideo(
      cleanCategoryId,
      cleanSubcategoryId || null,
      resolvedCategory,
      resolvedSubcategory,
      finalFilename,
      guessMimeFromExtension(finalFilename),
      displayName
    );

    res.json({
      success: true,
      message: 'Vidéo mise à jour',
      video: {
        path: relativeDestinationPath,
        displayName: resolveDisplayName(finalFilename, displayName),
        category: path.dirname(relativeDestinationPath),
        configCategory: cleanCategoryId,
        configSubcategory: cleanSubcategoryId || null
      }
    });
  } catch (error) {
    console.error('[admin] Error editing video:', error);
    res.status(500).json({ error: 'Impossible de modifier la vidéo' });
  }
});

// API: Configuration complète (configuration.json)
app.get('/api/configuration', async (req, res) => {
  try {
    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }
    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get settings (language, timezone)
app.get('/api/configuration/settings', async (req, res) => {
  try {
    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }
    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);
    res.json({
      settings: config.settings || { language: 'fr', timezone: 'Europe/Paris' }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Update settings (language, timezone)
app.put('/api/configuration/settings', async (req, res) => {
  try {
    const { language, timezone } = req.body;

    // Validate language
    const validLanguages = ['fr', 'en', 'es'];
    if (language && !validLanguages.includes(language)) {
      return res.status(400).json({ error: `Langue invalide. Valeurs acceptées: ${validLanguages.join(', ')}` });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    // Initialize settings if not exists
    config.settings = config.settings || { language: 'fr', timezone: 'Europe/Paris' };

    // Update only provided fields
    if (language) {
      config.settings.language = language;
    }
    if (timezone) {
      config.settings.timezone = timezone;
    }

    // Save config
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));

    // Invalidate config cache
    cache.delete(NAMESPACES.CONFIG, 'path');

    console.log(`[admin] Settings updated: language=${config.settings.language}, timezone=${config.settings.timezone}`);

    res.json({
      success: true,
      settings: config.settings
    });
  } catch (error) {
    console.error('[admin] Failed to update settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Vidéos orphelines (sur disque mais pas dans config)
app.get('/api/videos/orphans', async (req, res) => {
  try {
    await ensureDirectory(VIDEOS_DIR);
    const metadata = await getVideoMetadataFromConfig();
    const allVideos = await listVideosRecursive(VIDEOS_DIR, VIDEOS_DIR, metadata);

    // Filtrer les vidéos non référencées dans la config
    const orphans = allVideos.filter(video => !video.configCategory);

    res.json({ orphans });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Ajouter une vidéo orpheline à la configuration
app.post('/api/videos/add-to-config', async (req, res) => {
  try {
    const { videoPath, categoryId, subcategoryId, displayName } = req.body;

    if (!videoPath || !categoryId) {
      return res.status(400).json({ error: 'videoPath et categoryId requis' });
    }

    // Vérifier que le fichier existe
    const fullPath = path.join(VIDEOS_DIR, videoPath);
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'Fichier vidéo non trouvé' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    // Trouver ou créer la catégorie
    config.categories = config.categories || [];
    let category = config.categories.find(
      cat => (cat.id || '').toLowerCase() === categoryId.toLowerCase()
    );

    if (!category) {
      category = {
        id: categoryId,
        name: categoryId,
        videos: [],
        subCategories: []
      };
      config.categories.push(category);
    }

    // Préparer l'entrée vidéo
    const filename = path.basename(videoPath);
    const fullVideoPath = `videos/${videoPath}`;
    const mimeType = guessMimeFromExtension(filename);
    const newEntry = createVideoEntry(
      filename,
      fullVideoPath,
      mimeType,
      displayName || buildDisplayNameFromFilename(filename)
    );

    // Ajouter à la bonne sous-catégorie ou directement à la catégorie
    if (subcategoryId) {
      category.subCategories = category.subCategories || [];
      let subCategory = category.subCategories.find(
        sub => (sub.id || '').toLowerCase() === subcategoryId.toLowerCase()
      );

      if (!subCategory) {
        subCategory = {
          id: subcategoryId,
          name: subcategoryId,
          videos: []
        };
        category.subCategories.push(subCategory);
      }

      subCategory.videos = subCategory.videos || [];
      const alreadyExists = subCategory.videos.some(v => v.path === fullVideoPath);
      if (!alreadyExists) {
        subCategory.videos.push(newEntry);
      }
    } else {
      category.videos = category.videos || [];
      const alreadyExists = category.videos.some(v => v.path === fullVideoPath);
      if (!alreadyExists) {
        category.videos.push(newEntry);
      }
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    res.json({
      success: true,
      message: 'Vidéo ajoutée à la configuration',
      entry: newEntry
    });
  } catch (error) {
    console.error('[admin] Error adding video to config:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Supprimer une vidéo de la configuration et du disque
app.delete('/api/videos/delete-from-config', async (req, res) => {
  try {
    const { videoPath, categoryId, subcategoryId } = req.body;

    if (!videoPath) {
      return res.status(400).json({ error: 'videoPath requis' });
    }

    // Normaliser le chemin
    const normalizedPath = videoPath.replace(/\\/g, '/').replace(/^videos\//, '');
    const fullPath = path.join(VIDEOS_DIR, normalizedPath);

    // Supprimer le fichier du disque
    try {
      await fs.access(fullPath);
      await fs.unlink(fullPath);
      console.log('[admin] File deleted:', fullPath);

      // Nettoyer les dossiers vides
      await cleanupEmptyDirs(path.dirname(fullPath), VIDEOS_DIR);
    } catch (err) {
      console.warn('[admin] File not found or already deleted:', fullPath);
    }

    // Supprimer de la configuration
    const configVideoPath = videoPath.startsWith('videos/')
      ? videoPath
      : `videos/${normalizedPath}`;
    await removeVideoFromConfig(configVideoPath);

    res.json({
      success: true,
      message: 'Vidéo supprimée',
      path: videoPath
    });
  } catch (error) {
    console.error('[admin] Error deleting video from config:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Récupérer les timeCategories
app.get('/api/configuration/time-categories', async (req, res) => {
  try {
    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }
    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);
    res.json({
      timeCategories: config.timeCategories || [],
      categories: (config.categories || []).map(cat => ({
        id: cat.id,
        name: cat.name
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Mettre à jour les timeCategories
app.put('/api/configuration/time-categories', async (req, res) => {
  try {
    const { timeCategories } = req.body;

    if (!Array.isArray(timeCategories)) {
      return res.status(400).json({ error: 'timeCategories doit être un tableau' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    // Valider chaque timeCategory
    for (const tc of timeCategories) {
      if (!tc.id || !tc.name) {
        return res.status(400).json({ error: 'Chaque timeCategory doit avoir un id et un name' });
      }
      if (!Array.isArray(tc.categoryIds)) {
        tc.categoryIds = [];
      }
    }

    config.timeCategories = timeCategories;
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] timeCategories updated:', timeCategories.length, 'entries');

    res.json({
      success: true,
      message: 'TimeCategories mis à jour',
      timeCategories: config.timeCategories
    });
  } catch (error) {
    console.error('[admin] Error updating timeCategories:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Récupérer toutes les catégories
app.get('/api/configuration/categories', async (req, res) => {
  try {
    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }
    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);
    res.json({
      categories: config.categories || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Créer une nouvelle catégorie
app.post('/api/configuration/categories', async (req, res) => {
  try {
    const { id, name, videos, subCategories } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'id et name sont requis' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    config.categories = config.categories || [];

    // Vérifier si l'ID existe déjà
    if (config.categories.some(c => c.id === id)) {
      return res.status(400).json({ error: 'Une catégorie avec cet ID existe déjà' });
    }

    const newCategory = {
      id,
      name,
      videos: videos || [],
      subCategories: subCategories || []
    };

    config.categories.push(newCategory);
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] Category created:', id);

    res.json({
      success: true,
      message: 'Catégorie créée',
      category: newCategory
    });
  } catch (error) {
    console.error('[admin] Error creating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Mettre à jour une catégorie
app.put('/api/configuration/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const updates = req.body;

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    config.categories = config.categories || [];
    const categoryIndex = config.categories.findIndex(c => c.id === categoryId);

    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    // Vérifier si la catégorie est verrouillée (NEOPRO)
    const canModify = canModifyCategory(config.categories[categoryIndex]);
    if (!canModify.allowed) {
      return res.status(403).json({ error: canModify.reason, locked: true });
    }

    // Mettre à jour les champs autorisés
    if (updates.name) config.categories[categoryIndex].name = updates.name;

    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] Category updated:', categoryId);

    res.json({
      success: true,
      message: 'Catégorie mise à jour',
      category: config.categories[categoryIndex]
    });
  } catch (error) {
    console.error('[admin] Error updating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Supprimer une catégorie
app.delete('/api/configuration/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    config.categories = config.categories || [];
    const categoryIndex = config.categories.findIndex(c => c.id === categoryId);

    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    // Vérifier si la catégorie est verrouillée (NEOPRO)
    const category = config.categories[categoryIndex];
    const canModify = canModifyCategory(category);
    if (!canModify.allowed) {
      return res.status(403).json({ error: canModify.reason, locked: true });
    }

    // Supprimer la catégorie
    config.categories.splice(categoryIndex, 1);

    // Supprimer également des timeCategories
    if (config.timeCategories) {
      config.timeCategories.forEach(tc => {
        tc.categoryIds = (tc.categoryIds || []).filter(id => id !== categoryId);
      });
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] Category deleted:', categoryId);

    res.json({
      success: true,
      message: 'Catégorie supprimée'
    });
  } catch (error) {
    console.error('[admin] Error deleting category:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Ajouter une sous-catégorie
app.post('/api/configuration/categories/:categoryId/subcategories', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { id, name, videos } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'id et name sont requis' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    config.categories = config.categories || [];
    const category = config.categories.find(c => c.id === categoryId);

    if (!category) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    category.subCategories = category.subCategories || [];

    // Vérifier si l'ID existe déjà
    if (category.subCategories.some(s => s.id === id)) {
      return res.status(400).json({ error: 'Une sous-catégorie avec cet ID existe déjà' });
    }

    const newSubCategory = {
      id,
      name,
      videos: videos || []
    };

    category.subCategories.push(newSubCategory);
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] SubCategory created:', categoryId, '/', id);

    res.json({
      success: true,
      message: 'Sous-catégorie créée',
      subCategory: newSubCategory
    });
  } catch (error) {
    console.error('[admin] Error creating subcategory:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Réorganiser une vidéo dans la même liste
app.put('/api/videos/reorder', async (req, res) => {
  try {
    const { videoPath, categoryId, subcategoryId, newIndex } = req.body;

    if (!videoPath || !categoryId || newIndex === undefined) {
      return res.status(400).json({ error: 'videoPath, categoryId et newIndex sont requis' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    // Find the category
    const category = (config.categories || []).find(
      c => (c.id || '').toLowerCase() === categoryId.toLowerCase()
    );

    if (!category) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    // Get the target video list
    let videoList;
    if (subcategoryId) {
      const subCategory = (category.subCategories || []).find(
        s => (s.id || '').toLowerCase() === subcategoryId.toLowerCase()
      );
      if (!subCategory) {
        return res.status(404).json({ error: 'Sous-catégorie non trouvée' });
      }
      videoList = subCategory.videos || [];
      subCategory.videos = videoList;
    } else {
      videoList = category.videos || [];
      category.videos = videoList;
    }

    // Find video index
    const currentIndex = videoList.findIndex(v => v.path === videoPath);
    if (currentIndex === -1) {
      return res.status(404).json({ error: 'Vidéo non trouvée dans la liste' });
    }

    // Remove from current position and insert at new position
    const [video] = videoList.splice(currentIndex, 1);
    const adjustedIndex = newIndex > currentIndex ? newIndex - 1 : newIndex;
    videoList.splice(Math.min(adjustedIndex, videoList.length), 0, video);

    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] Video reordered:', videoPath, 'to index', newIndex);

    res.json({
      success: true,
      message: 'Vidéo réorganisée',
      newIndex: adjustedIndex
    });
  } catch (error) {
    console.error('[admin] Error reordering video:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Déplacer une vidéo vers une autre catégorie/sous-catégorie
app.put('/api/videos/move', async (req, res) => {
  try {
    const {
      videoPath,
      fromCategoryId,
      fromSubcategoryId,
      toCategoryId,
      toSubcategoryId,
      newIndex
    } = req.body;

    if (!videoPath || !fromCategoryId || !toCategoryId) {
      return res.status(400).json({ error: 'videoPath, fromCategoryId et toCategoryId sont requis' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    // Find source category
    const fromCategory = (config.categories || []).find(
      c => (c.id || '').toLowerCase() === fromCategoryId.toLowerCase()
    );
    if (!fromCategory) {
      return res.status(404).json({ error: 'Catégorie source non trouvée' });
    }

    // Get source video list
    let sourceList;
    if (fromSubcategoryId) {
      const fromSubCategory = (fromCategory.subCategories || []).find(
        s => (s.id || '').toLowerCase() === fromSubcategoryId.toLowerCase()
      );
      if (!fromSubCategory) {
        return res.status(404).json({ error: 'Sous-catégorie source non trouvée' });
      }
      sourceList = fromSubCategory.videos || [];
    } else {
      sourceList = fromCategory.videos || [];
    }

    // Find and remove video from source
    const videoIndex = sourceList.findIndex(v => v.path === videoPath);
    if (videoIndex === -1) {
      return res.status(404).json({ error: 'Vidéo non trouvée dans la source' });
    }
    const [video] = sourceList.splice(videoIndex, 1);

    // Find target category
    const toCategory = (config.categories || []).find(
      c => (c.id || '').toLowerCase() === toCategoryId.toLowerCase()
    );
    if (!toCategory) {
      return res.status(404).json({ error: 'Catégorie cible non trouvée' });
    }

    // Get target video list
    let targetList;
    if (toSubcategoryId) {
      const toSubCategory = (toCategory.subCategories || []).find(
        s => (s.id || '').toLowerCase() === toSubcategoryId.toLowerCase()
      );
      if (!toSubCategory) {
        return res.status(404).json({ error: 'Sous-catégorie cible non trouvée' });
      }
      targetList = toSubCategory.videos || [];
      toSubCategory.videos = targetList;
    } else {
      targetList = toCategory.videos || [];
      toCategory.videos = targetList;
    }

    // Insert at new position
    const insertIndex = newIndex !== undefined ? Math.min(newIndex, targetList.length) : targetList.length;
    targetList.splice(insertIndex, 0, video);

    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] Video moved:', videoPath, 'from', fromCategoryId, '/', fromSubcategoryId, 'to', toCategoryId, '/', toSubcategoryId);

    res.json({
      success: true,
      message: 'Vidéo déplacée',
      newIndex: insertIndex
    });
  } catch (error) {
    console.error('[admin] Error moving video:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Supprimer une sous-catégorie
app.delete('/api/configuration/categories/:categoryId/subcategories/:subCategoryId', async (req, res) => {
  try {
    const { categoryId, subCategoryId } = req.params;

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    config.categories = config.categories || [];
    const category = config.categories.find(c => c.id === categoryId);

    if (!category) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    // Vérifier si la catégorie parente est verrouillée
    const canModifyCat = canModifyCategory(category);
    if (!canModifyCat.allowed) {
      return res.status(403).json({ error: canModifyCat.reason, locked: true });
    }

    category.subCategories = category.subCategories || [];
    const subIndex = category.subCategories.findIndex(s => s.id === subCategoryId);

    if (subIndex === -1) {
      return res.status(404).json({ error: 'Sous-catégorie non trouvée' });
    }

    // Vérifier si la sous-catégorie est verrouillée
    const subcategory = category.subCategories[subIndex];
    if (isLocked(subcategory)) {
      return res.status(403).json({
        error: 'Cette sous-catégorie est gérée par NEOPRO et ne peut pas être supprimée.',
        locked: true
      });
    }

    category.subCategories.splice(subIndex, 1);
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] SubCategory deleted:', categoryId, '/', subCategoryId);

    res.json({
      success: true,
      message: 'Sous-catégorie supprimée'
    });
  } catch (error) {
    console.error('[admin] Error deleting subcategory:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Logs
app.get('/api/logs/:service', async (req, res) => {
  const { service } = req.params;
  const lines = req.query.lines || 100;

  const serviceMap = {
    'app': 'neopro-app',
    'nginx': 'nginx',
    'system': ''
  };

  const serviceName = serviceMap[service];
  if (serviceName === undefined) {
    return res.status(400).json({ error: 'Service invalide' });
  }

  const command = serviceName
    ? `journalctl -u ${serviceName} -n ${lines} --no-pager`
    : `journalctl -n ${lines} --no-pager`;

  const result = await execCommand(command);

  if (result.success) {
    res.json({ logs: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// API: Configuration WiFi client
app.post('/api/wifi/client', async (req, res) => {
  const { ssid, password } = req.body;

  if (!ssid || !password) {
    return res.status(400).json({ error: 'SSID et mot de passe requis' });
  }

  try {
    // Exécuter le script de configuration WiFi
    const scriptPath = path.join(NEOPRO_DIR, 'scripts', 'setup-wifi-client.sh');

    try {
      await fs.access(scriptPath, fsCore.constants.X_OK);
    } catch (accessError) {
      console.error('[admin] WiFi client script missing or not executable:', accessError);
      return res.status(500).json({
        error: 'Script WiFi introuvable. Re-déployez les scripts (npm run deploy:raspberry) ou vérifiez /home/pi/neopro/scripts.'
      });
    }

    const result = await execCommand(`sudo ${scriptPath} "${ssid}" "${password}"`);

    if (result.success) {
      res.json({ success: true, message: 'WiFi client configuré', output: result.output });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Redémarrer un service
app.post('/api/services/:service/restart', async (req, res) => {
  const { service } = req.params;
  const allowedServices = ['neopro-app', 'nginx', 'neopro-kiosk'];

  if (!allowedServices.includes(service)) {
    return res.status(400).json({ error: 'Service non autorisé' });
  }

  const result = await execCommand(`sudo systemctl restart ${service}`);

  if (result.success) {
    res.json({ success: true, message: `Service ${service} redémarré` });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// API: Redémarrer le système
app.post('/api/system/reboot', async (req, res) => {
  res.json({ success: true, message: 'Redémarrage du système dans 5 secondes...' });

  // Redémarrage différé pour avoir le temps de répondre
  setTimeout(() => {
    exec('sudo reboot');
  }, 5000);
});

// API: Arrêter le système
app.post('/api/system/shutdown', async (req, res) => {
  res.json({ success: true, message: 'Arrêt du système dans 5 secondes...' });

  setTimeout(() => {
    exec('sudo shutdown -h now');
  }, 5000);
});

// API: Mise à jour de l'application
app.post('/api/update', uploadPackage.single('package'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Helper pour exécuter une commande et vérifier le résultat
    const runCommand = async (cmd, description) => {
      const result = await execCommand(cmd);
      if (!result.success) {
        throw new Error(`${description}: ${result.error}`);
      }
      return result;
    };

    // S'assurer que le dossier backups existe
    await ensureDirectory(`${NEOPRO_DIR}/backups`);

    // Créer un backup
    const backupName = `backup-${Date.now()}.tar.gz`;
    await runCommand(
      `tar -czf ${NEOPRO_DIR}/backups/${backupName} -C ${NEOPRO_DIR} webapp server`,
      'Échec de la création du backup'
    );

    // Extraire le nouveau package
    const extractDir = '/tmp/neopro-update';
    await runCommand(`rm -rf ${extractDir} && mkdir -p ${extractDir}`, 'Échec de la préparation du dossier temporaire');
    await runCommand(`tar -xzf ${req.file.path} -C ${extractDir}`, 'Échec de l\'extraction du package');

    // Vérifier que la structure du package est correcte
    // Support des deux formats: nouveau (webapp/, server/) et ancien (deploy/webapp/, deploy/server/)
    const checkWebappNew = await execCommand(`test -d ${extractDir}/webapp`);
    const checkServerNew = await execCommand(`test -d ${extractDir}/server`);
    const checkWebappOld = await execCommand(`test -d ${extractDir}/deploy/webapp`);
    const checkServerOld = await execCommand(`test -d ${extractDir}/deploy/server`);

    const useNewFormat = checkWebappNew.success && checkServerNew.success;
    const useOldFormat = checkWebappOld.success && checkServerOld.success;

    if (!useNewFormat && !useOldFormat) {
      throw new Error('Structure du package invalide: les dossiers webapp et server sont requis');
    }

    const sourcePrefix = useNewFormat ? '' : 'deploy/';

    // S'assurer que les dossiers cibles existent
    await ensureDirectory(`${NEOPRO_DIR}/webapp`);
    await ensureDirectory(`${NEOPRO_DIR}/server`);

    // Sauvegarder configuration.json et videos/ avant nettoyage
    await execCommand(`test -f ${NEOPRO_DIR}/webapp/configuration.json && cp ${NEOPRO_DIR}/webapp/configuration.json /tmp/configuration.json.backup`);
    await execCommand(`test -d ${NEOPRO_DIR}/webapp/videos && mv ${NEOPRO_DIR}/webapp/videos /tmp/videos.backup`);

    // Nettoyer webapp/ pour éviter les anciens fichiers (main-*.js)
    await runCommand(`rm -rf ${NEOPRO_DIR}/webapp/*`, 'Échec du nettoyage de webapp');

    // Copier les nouveaux fichiers
    await runCommand(`cp -r ${extractDir}/${sourcePrefix}webapp/* ${NEOPRO_DIR}/webapp/`, 'Échec de la copie des fichiers webapp');
    await runCommand(`cp -r ${extractDir}/${sourcePrefix}server/* ${NEOPRO_DIR}/server/`, 'Échec de la copie des fichiers server');

    // Restaurer configuration.json et videos/
    await execCommand(`test -f /tmp/configuration.json.backup && cp /tmp/configuration.json.backup ${NEOPRO_DIR}/webapp/configuration.json && rm /tmp/configuration.json.backup`);
    await execCommand(`test -d /tmp/videos.backup && mv /tmp/videos.backup ${NEOPRO_DIR}/webapp/videos`);

    // Copier les fichiers de version si présents (nouveau format)
    if (useNewFormat) {
      await execCommand(`test -f ${extractDir}/VERSION && cp ${extractDir}/VERSION ${NEOPRO_DIR}/VERSION`);
      await execCommand(`test -f ${extractDir}/release.json && cp ${extractDir}/release.json ${NEOPRO_DIR}/release.json`);
    } else {
      await execCommand(`test -f ${extractDir}/deploy/VERSION && cp ${extractDir}/deploy/VERSION ${NEOPRO_DIR}/VERSION`);
      await execCommand(`test -f ${extractDir}/deploy/release.json && cp ${extractDir}/deploy/release.json ${NEOPRO_DIR}/release.json`);
    }

    // Installer les dépendances
    await runCommand(`cd ${NEOPRO_DIR}/server && npm install --production`, 'Échec de l\'installation des dépendances');

    // Redémarrer les services
    await runCommand('sudo systemctl restart neopro-app', 'Échec du redémarrage de neopro-app');
    await runCommand('sudo systemctl restart nginx', 'Échec du redémarrage de nginx');

    // Nettoyage
    await fs.unlink(req.file.path);
    await execCommand(`rm -rf ${extractDir}`);

    res.json({
      success: true,
      message: 'Mise à jour appliquée avec succès',
      backup: backupName
    });
  } catch (error) {
    console.error('[UPDATE] Erreur:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API: Informations réseau
app.get('/api/network', async (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    const networkInfo = {};

    for (const [name, addrs] of Object.entries(interfaces)) {
      networkInfo[name] = addrs
        .filter(addr => addr.family === 'IPv4')
        .map(addr => ({
          address: addr.address,
          netmask: addr.netmask,
          mac: addr.mac
        }));
    }

    // WiFi info
    const wifiResult = await execCommand('iwconfig wlan0 2>/dev/null');
    const ssidMatch = wifiResult.output.match(/ESSID:"([^"]+)"/);
    const currentSSID = ssidMatch ? ssidMatch[1] : null;

    res.json({
      interfaces: networkInfo,
      wifi: {
        currentSSID: currentSSID
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Liste des backups disponibles
app.get('/api/backups', async (req, res) => {
  try {
    const backupDir = '/home/pi/neopro-backups';

    // Vérifier si le dossier existe
    try {
      await fs.access(backupDir);
    } catch {
      return res.json({ backups: [], status: null });
    }

    // Lire les fichiers de backup
    const files = await fs.readdir(backupDir);
    const backupFiles = files.filter(f => f.match(/^backup-\d{8}-\d{6}\.tar\.gz$/));

    const backups = await Promise.all(
      backupFiles.map(async (filename) => {
        const filePath = path.join(backupDir, filename);
        const stats = await fs.stat(filePath);
        const timestampMatch = filename.match(/backup-(\d{8})-(\d{6})\.tar\.gz/);

        let date = null;
        if (timestampMatch) {
          const dateStr = timestampMatch[1];
          const timeStr = timestampMatch[2];
          date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)} ${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
        }

        return {
          name: filename,
          size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
          sizeBytes: stats.size,
          date: date,
          created: stats.mtime,
          age: Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24)) + ' jours'
        };
      })
    );

    // Trier par date (plus récent en premier)
    backups.sort((a, b) => b.created.getTime() - a.created.getTime());

    // Lire le statut du dernier backup
    let lastBackupStatus = null;
    try {
      const statusFile = path.join(backupDir, 'last-backup-status.json');
      const statusData = await fs.readFile(statusFile, 'utf8');
      lastBackupStatus = JSON.parse(statusData);
    } catch {
      // Pas de statut disponible
    }

    res.json({
      backups,
      status: lastBackupStatus,
      total: backups.length,
      totalSize: backups.reduce((sum, b) => sum + b.sizeBytes, 0)
    });
  } catch (error) {
    console.error('[admin] Error listing backups:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Créer un backup manuel
app.post('/api/backups/create', async (req, res) => {
  try {
    const scriptPath = path.join(NEOPRO_DIR, 'scripts', 'auto-backup.sh');

    // Vérifier que le script existe
    try {
      await fs.access(scriptPath);
    } catch {
      return res.status(500).json({ error: 'Script de backup non trouvé' });
    }

    // Exécuter le script de backup
    const result = await execCommand(`sudo bash ${scriptPath}`);

    if (result.success) {
      res.json({
        success: true,
        message: 'Backup créé avec succès',
        output: result.output
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Échec de la création du backup',
        details: result.error
      });
    }
  } catch (error) {
    console.error('[admin] Error creating backup:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Télécharger un backup
app.get('/api/backups/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Valider le nom du fichier (sécurité)
    if (!filename.match(/^backup-\d{8}-\d{6}\.tar\.gz$/)) {
      return res.status(400).json({ error: 'Nom de fichier invalide' });
    }

    const backupPath = path.join('/home/pi/neopro-backups', filename);

    // Vérifier que le fichier existe
    try {
      await fs.access(backupPath);
    } catch {
      return res.status(404).json({ error: 'Backup non trouvé' });
    }

    res.download(backupPath, filename);
  } catch (error) {
    console.error('[admin] Error downloading backup:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Supprimer un backup
app.delete('/api/backups/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Valider le nom du fichier (sécurité)
    if (!filename.match(/^backup-\d{8}-\d{6}\.tar\.gz$/)) {
      return res.status(400).json({ error: 'Nom de fichier invalide' });
    }

    const backupPath = path.join('/home/pi/neopro-backups', filename);

    // Vérifier que le fichier existe
    try {
      await fs.access(backupPath);
    } catch {
      return res.status(404).json({ error: 'Backup non trouvé' });
    }

    // Supprimer le fichier
    await fs.unlink(backupPath);

    res.json({
      success: true,
      message: 'Backup supprimé'
    });
  } catch (error) {
    console.error('[admin] Error deleting backup:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Statut du service de backup automatique
app.get('/api/backups/auto-status', async (req, res) => {
  try {
    // Vérifier si le timer est actif
    const timerResult = await execCommand('systemctl is-enabled neopro-backup.timer 2>/dev/null');
    const isEnabled = timerResult.success && timerResult.output.trim() === 'enabled';

    // Vérifier si le timer est en cours d'exécution
    const activeResult = await execCommand('systemctl is-active neopro-backup.timer 2>/dev/null');
    const isActive = activeResult.success && activeResult.output.trim() === 'active';

    // Obtenir la prochaine exécution
    let nextRun = null;
    if (isActive) {
      const nextRunResult = await execCommand('systemctl status neopro-backup.timer 2>/dev/null | grep "Trigger:"');
      if (nextRunResult.success) {
        const match = nextRunResult.output.match(/Trigger:\s*(.+)/);
        if (match) {
          nextRun = match[1].trim();
        }
      }
    }

    // Obtenir les logs récents
    const logsResult = await execCommand('journalctl -u neopro-backup.service -n 20 --no-pager 2>/dev/null');
    const logs = logsResult.success ? logsResult.output : null;

    res.json({
      enabled: isEnabled,
      active: isActive,
      nextRun: nextRun,
      logs: logs
    });
  } catch (error) {
    console.error('[admin] Error getting backup status:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Activer/Désactiver le backup automatique
app.post('/api/backups/auto-toggle', async (req, res) => {
  try {
    const { enable } = req.body;

    if (enable === undefined) {
      return res.status(400).json({ error: 'Paramètre "enable" requis' });
    }

    const command = enable
      ? 'sudo systemctl enable --now neopro-backup.timer'
      : 'sudo systemctl disable --now neopro-backup.timer';

    const result = await execCommand(command);

    if (result.success) {
      res.json({
        success: true,
        message: enable ? 'Backup automatique activé' : 'Backup automatique désactivé',
        enabled: enable
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[admin] Error toggling auto-backup:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Statut d'un job de traitement vidéo
app.get('/api/videos/processing/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = await getJobStatus(jobId);

    if (!status) {
      return res.status(404).json({ error: 'Job non trouvé' });
    }

    res.json(status);
  } catch (error) {
    console.error('[admin] Error getting job status:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: File d'attente de traitement
app.get('/api/videos/processing', async (req, res) => {
  try {
    const queue = await getProcessingQueue();
    res.json({ queue, total: queue.length });
  } catch (error) {
    console.error('[admin] Error getting processing queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Configuration du traitement vidéo
app.get('/api/videos/processing-config', async (req, res) => {
  try {
    res.json({
      compressionEnabled: VIDEO_COMPRESSION_ENABLED,
      thumbnailsEnabled: VIDEO_THUMBNAILS_ENABLED,
      quality: process.env.VIDEO_QUALITY || 'medium'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Configuration des notifications email
app.get('/api/email/config', async (req, res) => {
  try {
    const config = emailNotifier.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Envoyer un email de test
app.post('/api/email/test', async (req, res) => {
  try {
    const success = await emailNotifier.sendTestEmail();
    if (success) {
      res.json({
        success: true,
        message: 'Email de test envoyé avec succès'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Échec de l\'envoi de l\'email de test'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Envoyer une notification personnalisée
app.post('/api/email/send', async (req, res) => {
  try {
    const { subject, text, html, priority } = req.body;

    if (!subject || !text) {
      return res.status(400).json({ error: 'subject et text sont requis' });
    }

    const success = await emailNotifier.sendEmail({ subject, text, html, priority });

    if (success) {
      res.json({
        success: true,
        message: 'Email envoyé avec succès'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Échec de l\'envoi de l\'email'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// Cache Management API
// =====================================================

/**
 * GET /api/cache/stats
 * Obtenir les statistiques du cache
 */
app.get('/api/cache/stats', (req, res) => {
  try {
    const stats = cache.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/cache/clear
 * Vider tout le cache ou un namespace spécifique
 * Query params: ?namespace=config (optionnel)
 */
app.delete('/api/cache/clear', (req, res) => {
  try {
    const namespace = req.query.namespace;

    if (namespace) {
      if (!Object.values(NAMESPACES).includes(namespace)) {
        return res.status(400).json({
          error: 'Namespace invalide',
          validNamespaces: Object.values(NAMESPACES)
        });
      }
      cache.clearNamespace(namespace);
      res.json({
        success: true,
        message: `Cache du namespace '${namespace}' vidé avec succès`
      });
    } else {
      cache.clear();
      res.json({
        success: true,
        message: 'Tous les caches vidés avec succès'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cache/info
 * Obtenir des informations détaillées sur le cache
 */
app.get('/api/cache/info', (req, res) => {
  try {
    const stats = cache.getStats();
    const info = {
      stats,
      namespaces: NAMESPACES,
      maxSize: 200,
      defaultTTL: 60000,
      hitRate: stats.total > 0
        ? ((stats.hits / stats.total) * 100).toFixed(2) + '%'
        : '0%'
    };
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Lancement du serveur
 */

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`✓ Serveur Web Admin Neopro lancé sur le port ${PORT}`);
  console.log(`  Accessible sur:`);
  console.log(`  - http://neopro.local:${PORT}`);
  console.log(`  - http://192.168.4.1:${PORT}`);
  console.log(`  - http://localhost:${PORT}`);

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

// Gestion des erreurs
process.on('uncaughtException', (error) => {
  console.error('Erreur non gérée:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Promesse rejetée:', error);
});
