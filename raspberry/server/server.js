const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const {
  CENTRAL_SERVER_URL,
  SITE_ID,
  IS_CLOUD_ENV,
  CONFIG_PATH,
  LICENSE_CACHE_PATH,
  ANALYTICS_FILE_PATH,
  SPONSOR_IMPRESSIONS_FILE_PATH,
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

const sponsorBuffer = new BufferService({
  filePath: SPONSOR_IMPRESSIONS_FILE_PATH,
  label: 'SponsorImpressions',
  centralUrl: CENTRAL_SERVER_URL,
  centralEndpoint: '/api/analytics/impressions',
  payloadKey: 'impressions',
  siteId: SITE_ID,
  isCloudEnv: IS_CLOUD_ENV,
});

const hdmiService = new HdmiService();

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
});

// Auth service needs io reference for broadcasting config reload
const authService = new AuthService({ configPath: CONFIG_PATH, io });

// ---------------------------------------------------------------------------
// Routes (factory pattern)
// ---------------------------------------------------------------------------
const createHealthRouter = require('./routes/health');
const createLicenseRouter = require('./routes/license');
const createAnalyticsRouter = require('./routes/analytics');
const createSponsorRouter = require('./routes/sponsor-impressions');
const createHdmiRouter = require('./routes/hdmi');
const createAuthRouter = require('./routes/auth');

app.use(createHealthRouter({ io }));
app.use(createLicenseRouter({ licenseService }));
app.use(createAnalyticsRouter({ analyticsBuffer }));
app.use(createSponsorRouter({ sponsorBuffer }));
app.use(createHdmiRouter({ hdmiService }));
app.use(createAuthRouter({ authService }));

// ---------------------------------------------------------------------------
// Socket.IO handlers
// ---------------------------------------------------------------------------
const registerSocketHandlers = require('./socket/handlers');
registerSocketHandlers({ io, stateService, configPath: CONFIG_PATH });

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`\u2713 Serveur Socket.IO lanc\u00e9 sur le port ${PORT}`);
});
