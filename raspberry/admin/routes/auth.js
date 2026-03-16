/**
 * Routes d'authentification pour le serveur admin Neopro
 *
 * - GET  /login              → Page de connexion HTML
 * - POST /api/auth/login     → Authentification par mot de passe
 * - POST /api/auth/logout    → Déconnexion
 * - GET  /api/auth/status    → Statut d'authentification
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const { NEOPRO_DIR } = require('../helpers');

const router = express.Router();

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours
const SESSION_FILE = path.join(NEOPRO_DIR, 'data', 'admin-sessions.json');
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map();
const sessions = new Map();

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
    console.log('[auth] No existing sessions file, starting fresh');
  }
}

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

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession() {
  const token = generateSessionToken();
  const csrfToken = crypto.randomBytes(16).toString('hex');
  const session = {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION,
    lastActivity: Date.now(),
    csrfToken,
  };
  sessions.set(token, session);
  saveSessions(); // Async, don't wait
  return { token, csrfToken };
}

function validateSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    saveSessions();
    return false;
  }
  session.lastActivity = Date.now();
  return true;
}

function destroySession(token) {
  sessions.delete(token);
  saveSessions();
}

// =============================================================================
// RATE LIMITING
// =============================================================================

function checkRateLimit(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const remainingMs = entry.lockedUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { allowed: false, remainingMin };
  }
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedAttempt(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, firstAttempt: Date.now() };
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    console.log('[auth] IP ' + ip + ' locked out for 15 minutes after ' + entry.count + ' failed attempts');
  }
  loginAttempts.set(ip, entry);
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

// =============================================================================
// ADMIN PASSWORD
// =============================================================================

async function getAdminPassword() {
  const configPath = path.join(NEOPRO_DIR, 'webapp', 'configuration.json');
  try {
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);
    return config.auth?.password || null;
  } catch (error) {
    console.warn('[auth] Failed to read admin password from config:', error.message);
    return null;
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

const requireAuth = async (req, res, next) => {
  if (
    req.path === '/login' ||
    req.path === '/api/auth/login' ||
    req.path === '/api/auth/status'
  ) {
    return next();
  }

  // Allow localhost-only system routes (called by sync-agent on the same Pi)
  const localhostRoutes = ['/api/system/apply-services', '/api/system/fix-ownership'];
  if (localhostRoutes.includes(req.path) && req.method === 'POST') {
    const clientIp = req.ip || req.socket?.remoteAddress || '';
    const socketAddr = req.socket?.remoteAddress || 'n/a';
    const isLocal = clientIp === '127.0.0.1' || clientIp === '::1'
      || clientIp.includes('127.0.0.1') || clientIp === '::ffff:7f00:1';
    console.log(`[auth] ${req.path} request: req.ip=${req.ip} socket=${socketAddr} isLocal=${isLocal}`);
    if (isLocal) {
      return next();
    }
  }

  if (req.path.match(/\.(css|js|png|jpg|ico|svg|woff|woff2)$/)) {
    return next();
  }

  const token = req.cookies?.admin_session;

  if (!validateSession(token)) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Non authentifié', code: 'AUTH_REQUIRED' });
    }
    return res.redirect('/login');
  }

  next();
};

// =============================================================================
// CSRF PROTECTION
// =============================================================================

function validateCsrf(req) {
  const sessionToken = req.cookies?.admin_session;
  const session = sessions.get(sessionToken);
  if (!session) return false;
  const csrfFromHeader = req.headers['x-csrf-token'];
  return csrfFromHeader && csrfFromHeader === session.csrfToken;
}

const requireCsrf = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') return next();
  // Skip CSRF for localhost (sync-agent)
  const clientIp = req.ip || req.socket?.remoteAddress || '';
  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('127.0.0.1') || clientIp === '::ffff:7f00:1';
  if (isLocal) return next();
  // Skip CSRF for auth routes (login doesn't have a token yet)
  if (req.path === '/api/auth/login' || req.path === '/api/auth/logout') return next();
  if (!validateCsrf(req)) {
    return res.status(403).json({ error: 'CSRF token invalide', code: 'CSRF_INVALID' });
  }
  next();
};

// =============================================================================
// ROUTES
// =============================================================================

// Login page
router.get('/login', async (req, res) => {
  if (validateSession(req.cookies?.admin_session)) {
    return res.redirect('/');
  }

  const password = await getAdminPassword();
  const needsSetup = !password;

  // Load site info from configuration.json
  let siteInfo = { clubName: '', sports: [], location: {}, contact: {} };
  try {
    const configPath = path.join(NEOPRO_DIR, 'webapp', 'configuration.json');
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);

    siteInfo = {
      clubName: config.club?.fullName || config.club?.name || config.auth?.clubName || config.sync?.clubName || '',
      sports: config.club?.sports || config.sync?.sports || [],
      location: config.club?.location || config.sync?.location || {},
      contact: config.club?.contact || config.sync?.contact || {},
      siteName: config.club?.siteName || '',
    };
  } catch (error) {
    // Ignore errors, site info is optional
  }

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const getSportIcon = (sports) => {
    if (!sports || sports.length === 0) return '🏃';
    const sport = sports[0].toLowerCase();
    const iconMap = {
      handball: '🤾', football: '⚽', basketball: '🏀',
      volleyball: '🏐', rugby: '🏉', hockey: '🏒', tennis: '🎾',
    };
    return iconMap[sport] || '🏃';
  };

  const formatSports = (sports) => {
    if (!sports || sports.length === 0) return '';
    return sports.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
  };

  const formatLocation = (location) => {
    const parts = [];
    if (location.city) parts.push(location.city);
    if (location.region) parts.push(location.region);
    if (location.country) parts.push(location.country);
    return parts.join(', ');
  };

  const formatContact = (contact) => {
    const parts = [];
    if (contact.email) parts.push(contact.email);
    if (contact.phone) parts.push(contact.phone);
    return parts.join(' • ');
  };

  const clubName = escapeHtml(siteInfo.clubName);
  const sportLabel = escapeHtml(formatSports(siteInfo.sports));
  const sportIcon = getSportIcon(siteInfo.sports);
  const location = escapeHtml(formatLocation(siteInfo.location));
  const contact = escapeHtml(formatContact(siteInfo.contact));
  const siteName = escapeHtml(siteInfo.siteName);
  const hasClubInfo = clubName || sportLabel || location || contact || siteName;

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
    .club-info { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; }
    .club-info-text { font-size: 11px; color: #9ca3af; line-height: 1.6; }
    .club-info-text span { display: inline; white-space: nowrap; }
    .club-info-text .separator { margin: 0 6px; color: #d1d5db; }
    @media (max-width: 480px) {
      .club-info-text { font-size: 10px; line-height: 1.5; }
      .club-info-text .separator { margin: 0 4px; }
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
    ${hasClubInfo ? `
    <div class="club-info">
      <div class="club-info-text">
        ${clubName ? `<span>${clubName}</span>` : ''}
        ${clubName && (siteName || sportLabel || location) ? `<span class="separator">•</span>` : ''}
        ${siteName ? `<span>${siteName}</span>` : ''}
        ${siteName && (sportLabel || location) ? `<span class="separator">•</span>` : ''}
        ${sportLabel ? `<span>${sportLabel}</span>` : ''}
        ${sportLabel && location ? `<span class="separator">•</span>` : ''}
        ${location ? `<span>${location}</span>` : ''}
      </div>
    </div>
    ` : ''}
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
router.post('/api/auth/login', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ success: false, error: 'Mot de passe requis' });
  }

  // Rate limiting
  const clientIp = req.ip || req.socket?.remoteAddress || '0.0.0.0';
  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Trop de tentatives. Réessayez dans ' + rateCheck.remainingMin + ' minute(s).',
    });
  }

  const adminPassword = await getAdminPassword();

  if (!adminPassword) {
    return res.status(403).json({
      success: false,
      error: "Aucun mot de passe configuré. Veuillez configurer un mot de passe via l'application principale.",
    });
  }

  if (password !== adminPassword) {
    recordFailedAttempt(clientIp);
    console.log('[auth] Failed login attempt');
    return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
  }

  clearLoginAttempts(clientIp);
  const { token, csrfToken } = createSession();

  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('admin_session', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  });
  res.cookie('admin_csrf', csrfToken, {
    httpOnly: false,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  });

  console.log('[auth] Successful login');
  res.json({ success: true });
});

// Logout API
router.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.admin_session;
  if (token) {
    destroySession(token);
  }
  res.clearCookie('admin_session', { path: '/' });
  res.json({ success: true });
});

// Auth status API
router.get('/api/auth/status', (req, res) => {
  const token = req.cookies?.admin_session;
  const authenticated = validateSession(token);
  const session = sessions.get(token);
  res.json({ authenticated, csrfToken: session?.csrfToken || null });
});

// Password change API
router.post('/api/auth/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Mot de passe actuel et nouveau requis' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
  }

  const adminPassword = await getAdminPassword();
  if (currentPassword !== adminPassword) {
    return res.status(401).json({ success: false, error: 'Mot de passe actuel incorrect' });
  }

  try {
    const configPath = path.join(NEOPRO_DIR, 'webapp', 'configuration.json');
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);
    if (!config.auth) config.auth = {};
    config.auth.password = newPassword;
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log('[auth] Password changed successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('[auth] Failed to change password:', error.message);
    res.status(500).json({ success: false, error: 'Erreur lors du changement de mot de passe' });
  }
});

// =============================================================================
// SESSION HELPERS
// =============================================================================

function getSessionCount() {
  return sessions.size;
}

// =============================================================================
// INIT & EXPORTS
// =============================================================================

// Load sessions on module load
loadSessions();

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireCsrf = requireCsrf;
module.exports.validateSession = validateSession;
module.exports.getSessionCount = getSessionCount;
