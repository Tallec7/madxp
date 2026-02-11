/**
 * Smoke tests — Vérifie que le serveur démarre, que toutes les routes critiques
 * sont enregistrées, et que les middlewares (auth, CORS, error handling) fonctionnent.
 *
 * Ces tests utilisent des dépendances mockées (pas de DB/Redis/FTP réels).
 * Objectif : détecter les régressions de wiring après refactors.
 *
 * Usage : npm run test:smoke
 */

// ============================================================
// Mocks — AVANT tout import dynamique de ../server
// setup.ts mock déjà ../config/database et ../config/logger
// ============================================================

jest.mock('../services/socket.service', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn().mockResolvedValue(undefined),
    isRedisConnected: jest.fn().mockReturnValue(false),
    getConnectionCount: jest.fn().mockReturnValue(0),
    getConnectedSites: jest.fn().mockReturnValue([]),
    isConnected: jest.fn().mockReturnValue(false),
    getIO: jest.fn().mockReturnValue(null),
    cleanup: jest.fn().mockResolvedValue(undefined),
    getDebugInfo: jest.fn().mockReturnValue({
      pendingCommandsCount: 0,
      connectedSites: [],
      lastPongReceived: {},
    }),
    getConnectionHealth: jest.fn().mockReturnValue({
      inMap: false,
      socketConnected: false,
      lastPongAgeMs: null,
      isHealthy: false,
      reason: 'not_in_map',
    }),
  },
}));

jest.mock('../services/scheduler.service', () => ({
  __esModule: true,
  default: { start: jest.fn(), stop: jest.fn() },
}));

jest.mock('../services/cron-scheduler.service', () => ({
  __esModule: true,
  default: { start: jest.fn().mockResolvedValue(undefined), stop: jest.fn() },
}));

jest.mock('../services/memory-manager.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    registerCleanupCallback: jest.fn(),
  },
}));

jest.mock('../services/network-alerts.service', () => ({
  __esModule: true,
  default: { start: jest.fn(), stop: jest.fn() },
}));

jest.mock('../services/alerting.service', () => ({
  __esModule: true,
  alertingService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn(),
    clearMemoryCache: jest.fn(),
  },
}));

jest.mock('../services/realtime-stats.service', () => ({
  __esModule: true,
  realtimeStatsService: {
    initialize: jest.fn(),
    start: jest.fn(),
  },
}));

jest.mock('../services/predictive-alerts.service', () => ({
  __esModule: true,
  predictiveAlertsService: {
    start: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('../middleware/upload', () => ({
  ...(jest.requireActual('../middleware/upload') as Record<string, unknown>),
  cleanupStaleTempFiles: jest.fn(),
}));

// ============================================================
// Tests
// ============================================================

import request from 'supertest';
import { generateToken } from '../middleware/auth';

let app: import('express').Express;
let httpServer: import('http').Server;

const adminToken = generateToken({
  id: 'smoke-admin-1',
  email: 'smoke-admin@test.com',
  role: 'admin',
});
const authHeader = { Authorization: `Bearer ${adminToken}` };

beforeAll(async () => {
  process.env.PORT = '3098';
  const server = await import('../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

// ----------------------------------------------------------
// 1. Health endpoints
// ----------------------------------------------------------
describe('Health endpoints', () => {
  it('GET /health returns 200 with status field', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /live returns 200 with ok status', async () => {
    const res = await request(app).get('/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /ready returns a status', async () => {
    const res = await request(app).get('/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('checks');
  });
});

// ----------------------------------------------------------
// 2. Metrics endpoint
// ----------------------------------------------------------
describe('Metrics endpoint', () => {
  it('GET /metrics returns Prometheus format', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('process_cpu_');
  });

  it('GET /metrics includes custom neopro metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('neopro_');
  });
});

// ----------------------------------------------------------
// 3. Routes critiques enregistrées (pas de 404)
// ----------------------------------------------------------
describe('Critical API routes are registered (not 404)', () => {
  // Chaque groupe de routes de server.ts doit avoir au moins 1 entrée ici.
  // Si un refactor casse un import, le test correspondant échoue avec 404.
  const criticalRoutes = [
    // auth.routes
    { method: 'post' as const, path: '/api/auth/login' },
    // mfa.routes
    { method: 'get' as const, path: '/api/mfa/status' },
    // sites.routes
    { method: 'get' as const, path: '/api/sites' },
    { method: 'get' as const, path: '/api/sites/connection-status' },
    // drafts.routes (monté sur /api/sites)
    { method: 'get' as const, path: '/api/sites/test-site-id/draft' },
    // groups.routes
    { method: 'get' as const, path: '/api/groups' },
    // content.routes (monté sur /api)
    { method: 'get' as const, path: '/api/videos' },
    // updates.routes (monté sur /api)
    { method: 'get' as const, path: '/api/updates' },
    // analytics.routes
    { method: 'post' as const, path: '/api/analytics/video-plays' },
    // advertiser-analytics.routes
    { method: 'get' as const, path: '/api/analytics/advertisers' },
    // advertiser-sites.routes (monté sur /api)
    { method: 'get' as const, path: '/api/advertisers/test-id/sites' },
    // audit.routes
    { method: 'get' as const, path: '/api/audit' },
    // canary.routes
    { method: 'get' as const, path: '/api/canary/deployments' },
    // admin.routes
    { method: 'get' as const, path: '/api/admin/clients' },
    // advertiser-portal.routes
    { method: 'get' as const, path: '/api/advertiser/dashboard' },
    // agency.routes
    { method: 'get' as const, path: '/api/agencies' },
    // users.routes
    { method: 'get' as const, path: '/api/users' },
    // schedules.routes
    { method: 'get' as const, path: '/api/schedules' },
    // objectives.routes
    { method: 'get' as const, path: '/api/objectives' },
    // playlist-schedules.routes
    { method: 'get' as const, path: '/api/playlist-schedules/sites/test-site-id' },
    // assets.routes
    { method: 'post' as const, path: '/api/assets/watermark/test-site-id' },
    // remote.routes
    { method: 'get' as const, path: '/api/remote/test-site-id/state' },
    // subscription.routes
    { method: 'get' as const, path: '/api/subscriptions' },
    // billing.routes
    { method: 'get' as const, path: '/api/billing/monthly' },
    // reports.routes
    { method: 'get' as const, path: '/api/reports/clubs/test-site-id' },
    // alerts.routes
    { method: 'get' as const, path: '/api/alerts' },
    // benchmark.routes
    { method: 'get' as const, path: '/api/benchmark/global' },
  ];

  test.each(criticalRoutes)(
    '$method $path should not return 404',
    async ({ method, path }) => {
      const res = await (request(app) as unknown as Record<string, Function>)[method](path);
      // 401 (pas de token) ou 400 (validation) = OK, la route existe.
      // 404 = régression, la route n'est plus enregistrée !
      expect(res.status).not.toBe(404);
    },
  );
});

// ----------------------------------------------------------
// 4. Auth middleware wiring
// ----------------------------------------------------------
describe('Auth middleware', () => {
  it('returns 401 for protected route without token', async () => {
    const res = await request(app).get('/api/sites');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/sites')
      .set({ Authorization: 'Bearer invalid-token-here' });
    expect(res.status).toBe(401);
  });

  it('does not return 401 with valid admin token', async () => {
    const res = await request(app).get('/api/sites').set(authHeader);
    expect(res.status).not.toBe(401);
  });
});

// ----------------------------------------------------------
// 5. CORS
// ----------------------------------------------------------
describe('CORS headers', () => {
  it('OPTIONS returns CORS headers', async () => {
    const res = await request(app)
      .options('/api/sites')
      .set({ Origin: 'http://localhost:4200' });
    // En mode test (non-production, pas d'ALLOWED_ORIGINS), CORS autorise tout
    expect([200, 204]).toContain(res.status);
  });
});

// ----------------------------------------------------------
// 6. Error handling
// ----------------------------------------------------------
describe('Error handling', () => {
  it('returns structured 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent-smoke-test-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('includes X-Correlation-ID header', async () => {
    const res = await request(app).get('/api/sites').set(authHeader);
    expect(res.headers['x-correlation-id']).toBeDefined();
  });
});

// ----------------------------------------------------------
// 7. Root endpoint
// ----------------------------------------------------------
describe('Root endpoint', () => {
  it('GET / returns service info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.service).toContain('NEOPRO');
    expect(res.body.status).toBe('online');
  });
});
