const express = require('express');
const http = require('http');
const fs = require('fs');
const socketIO = require('socket.io');

const {
  CENTRAL_SERVER_URL,
  SITE_ID,
  IS_CLOUD_ENV,
  CONFIG_PATH,
  PROFILES_DIR,
  LICENSE_CACHE_PATH,
  ANALYTICS_FILE_PATH,
  PORT,
} = require('./helpers');

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
const StateService = require('./services/state.service');
const LicenseService = require('./services/license.service');
const BufferService = require('./services/buffer.service');
const HdmiService = require('./services/hdmi.service');
const AuthService = require('./services/auth.service');
const ProfilePinService = require('./services/profile-pin.service');
const HotspotService = require('./services/hotspot.service');
const ReceiversService = require('./services/receivers.service');

const stateService = new StateService();
const licenseService = new LicenseService({ licenseCachePath: LICENSE_CACHE_PATH });

const analyticsBuffer = new BufferService({
  filePath: ANALYTICS_FILE_PATH,
  label: 'Analytics',
  centralUrl: CENTRAL_SERVER_URL,
  centralEndpoint: '/api/analytics/video-plays',
  payloadKey: 'plays',
  siteId: SITE_ID,
  isCloudEnv: IS_CLOUD_ENV,
});

const hdmiService = new HdmiService();
const profilePinService = new ProfilePinService({ profilesDir: PROFILES_DIR });
const hotspotService = new HotspotService({ configPath: CONFIG_PATH });
const receiversService = new ReceiversService();

// ---------------------------------------------------------------------------
// Express + HTTP + Socket.IO
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// CORS middleware — accept any origin (Pi on local network with dynamic IPs)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Credentials', 'true');
    // Chrome Private Network Access (PNA)
    res.header('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const server = http.createServer(app);

const io = socketIO(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling'],
});

// ---------------------------------------------------------------------------
// ADR-073 S2 — Socket.IO handshake auth (opt-in, backward-compat)
// ---------------------------------------------------------------------------
// Si `security.socketAuthToken` est défini dans configuration.json, tous les clients
// doivent passer ce token via `auth: { token }` (Socket.IO v4) ou query `?token=`.
// Sinon (champ absent/null), pas d'auth (legacy, compat avec les remotes existantes).
// Cache 5s pour éviter de relire le fichier à chaque connexion (rotation OK via config reload).
let _socketAuthTokenCache = { value: null, loadedAt: 0 };
function getSocketAuthToken() {
  const now = Date.now();
  if (now - _socketAuthTokenCache.loadedAt < 5000) return _socketAuthTokenCache.value;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    const token = cfg.security?.socketAuthToken || null;
    _socketAuthTokenCache = { value: token, loadedAt: now };
    return token;
  } catch {
    _socketAuthTokenCache = { value: null, loadedAt: now };
    return null;
  }
}

io.use((socket, next) => {
  const required = getSocketAuthToken();
  if (!required) return next();
  const provided = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (provided && typeof provided === 'string' && provided === required) {
    return next();
  }
  const addr = socket.handshake.address;
  console.warn(`[socket-auth] Rejected connection from ${addr} (missing/invalid token)`);
  return next(new Error('auth required'));
});

// Auth service needs io reference for broadcasting config reload
const authService = new AuthService({ configPath: CONFIG_PATH, io });

// ---------------------------------------------------------------------------
// Routes (factory pattern)
// ---------------------------------------------------------------------------
const createHealthRouter = require('./routes/health');
const createLicenseRouter = require('./routes/license');
const createAnalyticsRouter = require('./routes/analytics');
const createHdmiRouter = require('./routes/hdmi');
const createAuthRouter = require('./routes/auth');
const createProfilePinRouter = require('./routes/profile-pin');
const createHotspotRouter = require('./routes/hotspot');
const createCaptiveRouter = require('./routes/captive');

app.use(createHealthRouter({ io }));
app.use(createLicenseRouter({ licenseService }));
app.use(createAnalyticsRouter({ analyticsBuffer }));
app.use(createHdmiRouter({ hdmiService }));
app.use(createAuthRouter({ authService }));
app.use(createProfilePinRouter({ profilePinService }));
app.use(createHotspotRouter({ hotspotService }));
app.use('/api/captive', createCaptiveRouter({ receiversService, configPath: CONFIG_PATH }));

// ---------------------------------------------------------------------------
// Socket.IO handlers
// ---------------------------------------------------------------------------
const registerSocketHandlers = require('./socket/handlers');
registerSocketHandlers({ io, stateService, configPath: CONFIG_PATH, hdmiService });

// ---------------------------------------------------------------------------
// v4.0 Phase 5 — Fire Stick receivers auto-discovery (DETECT-01/02/03)
// ---------------------------------------------------------------------------
// Wrapper around io.emit so each `connected-receivers-changed` event also
// updates the stateService snapshot. This keeps getFullState() (initial
// sync on TV/remote connect) coherent with the live socket emissions.
const ioForReceivers = {
  emit: (event, data) => {
    if (event === 'connected-receivers-changed' && data && Array.isArray(data.receivers)) {
      stateService.setReceivers(data.receivers);
    }
    io.emit(event, data);
  },
};
receiversService.start(ioForReceivers);

process.on('SIGTERM', () => { try { receiversService.stop(); } catch (_e) { /* noop */ } });
process.on('SIGINT', () => { try { receiversService.stop(); } catch (_e) { /* noop */ } });

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
// Listen on '::' (dual-stack: IPv4 + IPv6) so both 127.0.0.1 and ::1 work.
// Required because Debian 12+ resolves 'localhost' to ::1 (IPv6) first,
// and old sync-agent versions use localhost for post-OTA health checks.
server.listen(PORT, '::', () => {
  console.log(`\u2713 Serveur Socket.IO lanc\u00e9 sur le port ${PORT}`);
});
