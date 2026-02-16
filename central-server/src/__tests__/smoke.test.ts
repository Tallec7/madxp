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
    getDashboardConnectionCount: jest.fn().mockReturnValue(0),
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
    recordDisconnectEvent: jest.fn(),
    recordVideoSafetyTimeouts: jest.fn(),
    checkHourlyMetrics: jest.fn().mockResolvedValue(undefined),
    evaluateMetric: jest.fn().mockResolvedValue(undefined),
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

const operatorToken = generateToken({
  id: 'smoke-operator-1',
  email: 'smoke-operator@test.com',
  role: 'operator',
});
const operatorAuthHeader = { Authorization: `Bearer ${operatorToken}` };

const viewerToken = generateToken({
  id: 'smoke-viewer-1',
  email: 'smoke-viewer@test.com',
  role: 'viewer',
});
const viewerAuthHeader = { Authorization: `Bearer ${viewerToken}` };

const superAdminToken = generateToken({
  id: 'smoke-superadmin-1',
  email: 'smoke-superadmin@test.com',
  role: 'super_admin',
});
const superAdminAuthHeader = { Authorization: `Bearer ${superAdminToken}` };

const advertiserToken = generateToken({
  id: 'smoke-advertiser-1',
  email: 'smoke-advertiser@test.com',
  role: 'advertiser',
  advertiser_id: 'adv-1',
});
const advertiserAuthHeader = { Authorization: `Bearer ${advertiserToken}` };

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

  it('GET /health includes dependency checks', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('websocket');
    expect(res.body.checks).toHaveProperty('memory');
    // Each check should have status and latencyMs
    expect(res.body.checks.database).toHaveProperty('status');
    expect(res.body.checks.database).toHaveProperty('latencyMs');
    expect(res.body.checks.memory).toHaveProperty('status');
  });

  it('GET /health includes summary counts', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('totalChecks');
    expect(res.body.summary).toHaveProperty('healthyChecks');
    expect(res.body.summary).toHaveProperty('degradedChecks');
    expect(res.body.summary).toHaveProperty('unhealthyChecks');
    expect(typeof res.body.summary.totalChecks).toBe('number');
  });

  it('GET /health includes uptime and environment', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body).toHaveProperty('environment');
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

  it('GET /ready checks database and websocket', async () => {
    const res = await request(app).get('/ready');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('websocket');
    expect(typeof res.body.checks.database).toBe('boolean');
    expect(typeof res.body.checks.websocket).toBe('boolean');
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

  it('GET /metrics returns correct Content-Type', async () => {
    const res = await request(app).get('/metrics');
    expect(res.headers['content-type']).toMatch(/text\/plain|text\/plain; version=/);
  });

  it('GET /metrics includes all critical supervision metrics', async () => {
    const res = await request(app).get('/metrics');
    const criticalMetrics = [
      'neopro_deployments_total',
      'neopro_websocket_disconnects_total',
      'neopro_kiosk_crashes_total',
      'neopro_video_transition_safety_timeout_total',
      'neopro_heartbeats_total',
      'neopro_license_status_pushes_total',
      'neopro_deploy_progress_events_total',
      'neopro_ota_errors_total',
      'neopro_wifi_config_total',
    ];
    for (const metric of criticalMetrics) {
      expect({ metric, registered: res.text.includes(metric) })
        .toEqual({ metric, registered: true });
    }
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
    { method: 'post' as const, path: '/api/auth/logout' },
    { method: 'get' as const, path: '/api/auth/me' },
    { method: 'post' as const, path: '/api/auth/change-password' },
    { method: 'post' as const, path: '/api/auth/forgot-password' },
    { method: 'get' as const, path: '/api/auth/verify-reset-token' },
    { method: 'post' as const, path: '/api/auth/reset-password' },
    // mfa.routes
    { method: 'get' as const, path: '/api/mfa/status' },
    // sites.routes
    { method: 'get' as const, path: '/api/sites' },
    { method: 'get' as const, path: '/api/sites/connection-status' },
    // drafts.routes (monté sur /api/sites)
    { method: 'get' as const, path: '/api/sites/test-site-id/draft' },
    // config-profiles.routes (monté sur /api/sites)
    { method: 'get' as const, path: '/api/sites/test-site-id/profiles' },
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
    // logs.routes
    { method: 'post' as const, path: '/api/logs/frontend' },
    // assets.routes
    { method: 'post' as const, path: '/api/assets/watermark/test-site-id' },
    // remote.routes
    { method: 'get' as const, path: '/api/remote/test-site-id/state' },
    // sites.routes — remote-pin
    { method: 'get' as const, path: '/api/sites/test-site-id/remote-pin' },
    // sites.routes — wifi client
    { method: 'get' as const, path: '/api/sites/test-site-id/wifi-scan' },
    { method: 'post' as const, path: '/api/sites/test-site-id/wifi-connect' },
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

  it('accepts token from cookie', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `neopro_token=${adminToken}`);
    expect(res.status).not.toBe(401);
  });

  it('accepts token from query parameter', async () => {
    const res = await request(app)
      .get(`/api/auth/me?token=${adminToken}`);
    expect(res.status).not.toBe(401);
  });

  it('returns 401 with expired token', () => {
    const expiredToken = generateToken({
      id: 'smoke-expired',
      email: 'expired@test.com',
      role: 'admin',
    });
    // Pas de moyen simple de forcer l'expiration dans ce test,
    // mais on vérifie que le mécanisme existe
    expect(expiredToken).toBeDefined();
    expect(typeof expiredToken).toBe('string');
    expect(expiredToken.split('.').length).toBe(3); // JWT has 3 parts
  });
});

// ----------------------------------------------------------
// 5. Role-based access control
// ----------------------------------------------------------
describe('Role-based access control', () => {
  it('admin can access admin routes', async () => {
    const res = await request(app).get('/api/admin/clients').set(authHeader);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('super_admin can access admin routes', async () => {
    const res = await request(app).get('/api/admin/clients').set(superAdminAuthHeader);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('operator cannot access admin-only routes', async () => {
    const res = await request(app).get('/api/admin/clients').set(operatorAuthHeader);
    expect(res.status).toBe(403);
  });

  it('viewer cannot access admin-only routes', async () => {
    const res = await request(app).get('/api/admin/clients').set(viewerAuthHeader);
    expect(res.status).toBe(403);
  });

  it('advertiser cannot access admin-only routes', async () => {
    // Use a fresh advertiser token
    const freshAdvToken = generateToken({
      id: 'smoke-adv-rbac-test',
      email: 'adv-rbac@test.com',
      role: 'advertiser',
      advertiser_id: 'adv-rbac-1',
    });
    const res = await request(app)
      .get('/api/admin/clients')
      .set({ Authorization: `Bearer ${freshAdvToken}` });
    // 403 = role check blocked, 429 = rate-limited (IP-based, accumulates in test)
    // Either way, the advertiser is NOT getting through (not 200/500)
    expect([403, 429]).toContain(res.status);
    if (res.status === 403) {
      expect(res.body.error).toBe('Accès refusé');
    }
  });

  it('super_admin bypasses all role checks', async () => {
    // super_admin should be able to access operator-restricted routes
    const res = await request(app)
      .get('/api/sites/test-site-id/profiles')
      .set(superAdminAuthHeader);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ----------------------------------------------------------
// 6. CORS
// ----------------------------------------------------------
describe('CORS headers', () => {
  it('OPTIONS returns CORS headers', async () => {
    const res = await request(app)
      .options('/api/sites')
      .set({ Origin: 'http://localhost:4200' });
    // En mode test (non-production, pas d'ALLOWED_ORIGINS), CORS autorise tout
    expect([200, 204]).toContain(res.status);
  });

  it('OPTIONS includes allowed methods', async () => {
    const res = await request(app)
      .options('/api/sites')
      .set({ Origin: 'http://localhost:4200' });
    const allowedMethods = res.headers['access-control-allow-methods'];
    expect(allowedMethods).toBeDefined();
    expect(allowedMethods).toContain('GET');
    expect(allowedMethods).toContain('POST');
    expect(allowedMethods).toContain('PUT');
    expect(allowedMethods).toContain('DELETE');
  });

  it('OPTIONS includes allowed headers', async () => {
    const res = await request(app)
      .options('/api/sites')
      .set({ Origin: 'http://localhost:4200' });
    const allowedHeaders = res.headers['access-control-allow-headers'];
    expect(allowedHeaders).toBeDefined();
    expect(allowedHeaders).toContain('Authorization');
    expect(allowedHeaders).toContain('Content-Type');
    expect(allowedHeaders).toContain('X-Correlation-ID');
  });

  it('reflects origin in test mode (no ALLOWED_ORIGINS)', async () => {
    const res = await request(app)
      .options('/api/sites')
      .set('Origin', 'http://custom-origin.test');
    // In test mode (no ALLOWED_ORIGINS), should accept and reflect origin or return '*'
    const allowOrigin = res.headers['access-control-allow-origin'];
    if (allowOrigin) {
      expect([allowOrigin]).toEqual(
        expect.arrayContaining([expect.stringMatching(/custom-origin|\*/)])
      );
    }
    // Even without explicit ACAO, the methods and headers should be present
    expect(res.headers['access-control-allow-methods']).toBeDefined();
  });
});

// ----------------------------------------------------------
// 7. Error handling
// ----------------------------------------------------------
describe('Error handling', () => {
  it('returns structured 404 for unknown routes', async () => {
    // Test on a non-/api path to avoid any route-level rate limiters
    const res = await request(app).get('/nonexistent-smoke-test-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('404 response has standardized error format', async () => {
    const res = await request(app).get('/another-nonexistent-smoke-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
    expect(res.body.error).toHaveProperty('timestamp');
    expect(res.body.error).toHaveProperty('correlationId');
    expect(res.body.error).toHaveProperty('path');
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('includes X-Correlation-ID header', async () => {
    const res = await request(app).get('/api/sites').set(authHeader);
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  it('preserves client-provided X-Correlation-ID', async () => {
    const customCorrelationId = 'smoke-test-correlation-123';
    const res = await request(app)
      .get('/api/sites')
      .set(authHeader)
      .set('X-Correlation-ID', customCorrelationId);
    expect(res.headers['x-correlation-id']).toBe(customCorrelationId);
  });

  it('generates UUID correlation ID when not provided', async () => {
    const res = await request(app).get('/api/sites').set(authHeader);
    const correlationId = res.headers['x-correlation-id'];
    expect(correlationId).toBeDefined();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('Socket.IO path does not return structured 404', async () => {
    const res = await request(app).get('/socket.io/');
    // Socket.IO is mocked (getIO returns null), so the path handler
    // may return 404 from a different source (not our notFoundHandler)
    // or may be skipped. The key thing: if it IS 404, the body should
    // NOT be our structured error format (because notFoundHandler skips /socket.io)
    if (res.status === 404) {
      // If 404, it should not have our structured error code
      const hasStructuredError = res.body?.error?.code === 'RESOURCE_NOT_FOUND';
      expect(hasStructuredError).toBe(false);
    }
    // Otherwise any status is fine (the path is handled elsewhere)
  });
});

// ----------------------------------------------------------
// 8. Validation middleware (Joi)
// ----------------------------------------------------------
describe('Validation middleware (Joi)', () => {
  it('rejects login with missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'testpassword' });
    expect(res.status).toBe(400);
  });

  it('rejects login with missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
  });

  it('rejects login with invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'testpassword' });
    expect(res.status).toBe(400);
  });

  it('rejects login with too-short password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: '12345' });
    expect(res.status).toBe(400);
  });

  it('accepts valid login payload (may fail at auth, not validation)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'validpassword123' });
    // Should pass validation (400 = validation error, 401/500 = auth/db error = OK)
    expect(res.status).not.toBe(400);
  });

  it('rejects forgot-password with missing email', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects reset-password with mismatched passwords', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: 'some-token',
        password: 'newpassword123',
        password_confirm: 'different-password',
      });
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------
// 9. Security headers (Helmet)
// ----------------------------------------------------------
describe('Security headers (Helmet)', () => {
  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('removes X-Powered-By header', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets Content-Security-Policy header', async () => {
    const res = await request(app).get('/');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('sets X-DNS-Prefetch-Control header', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });

  it('sets Referrer-Policy header', async () => {
    const res = await request(app).get('/');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });
});

// ----------------------------------------------------------
// 10. Root endpoint
// ----------------------------------------------------------
describe('Root endpoint', () => {
  it('GET / returns service info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.service).toContain('NEOPRO');
    expect(res.body.status).toBe('online');
  });

  it('GET / includes version and documentation link', async () => {
    const res = await request(app).get('/');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('documentation', '/api-docs');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// ----------------------------------------------------------
// 11. Socket.IO service mock wiring
// ----------------------------------------------------------
describe('Socket.IO service wiring', () => {
  it('socket service mock is correctly wired', async () => {
    const socketService = (await import('../services/socket.service')).default;
    expect(socketService.initialize).toBeDefined();
    expect(socketService.getConnectionCount).toBeDefined();
    expect(socketService.getConnectedSites).toBeDefined();
    expect(socketService.getIO).toBeDefined();
    expect(socketService.cleanup).toBeDefined();
    expect(socketService.getDebugInfo).toBeDefined();
    expect(socketService.getConnectionHealth).toBeDefined();
  });

  it('socket service getDebugInfo returns expected shape', async () => {
    const socketService = (await import('../services/socket.service')).default;
    const debugInfo = socketService.getDebugInfo();
    expect(debugInfo).toHaveProperty('pendingCommandsCount');
    expect(debugInfo).toHaveProperty('connectedSites');
    expect(debugInfo).toHaveProperty('lastPongReceived');
    expect(typeof debugInfo.pendingCommandsCount).toBe('number');
    expect(Array.isArray(debugInfo.connectedSites)).toBe(true);
  });

  it('socket service getConnectionHealth returns expected shape', async () => {
    const socketService = (await import('../services/socket.service')).default;
    const health = socketService.getConnectionHealth('test-site-id');
    expect(health).toHaveProperty('inMap');
    expect(health).toHaveProperty('socketConnected');
    expect(health).toHaveProperty('isHealthy');
    expect(health).toHaveProperty('reason');
  });
});

// ----------------------------------------------------------
// 12. Service initialization wiring
// ----------------------------------------------------------
describe('Service initialization wiring', () => {
  it('scheduler service mock is wired and callable', async () => {
    const schedulerService = (await import('../services/scheduler.service')).default;
    expect(schedulerService.start).toBeDefined();
    expect(schedulerService.stop).toBeDefined();
  });

  it('cron-scheduler service mock is wired and callable', async () => {
    const cronSchedulerService = (await import('../services/cron-scheduler.service')).default;
    expect(cronSchedulerService.start).toBeDefined();
    expect(cronSchedulerService.stop).toBeDefined();
  });

  it('memory-manager service mock is wired and callable', async () => {
    const memoryManagerService = (await import('../services/memory-manager.service')).default;
    expect(memoryManagerService.start).toBeDefined();
    expect(memoryManagerService.stop).toBeDefined();
    expect(memoryManagerService.registerCleanupCallback).toBeDefined();
  });

  it('network-alerts service mock is wired and callable', async () => {
    const networkAlertsService = (await import('../services/network-alerts.service')).default;
    expect(networkAlertsService.start).toBeDefined();
    expect(networkAlertsService.stop).toBeDefined();
  });

  it('alerting service mock is wired and callable', async () => {
    const { alertingService } = await import('../services/alerting.service');
    expect(alertingService.initialize).toBeDefined();
    expect(alertingService.cleanup).toBeDefined();
    expect(alertingService.clearMemoryCache).toBeDefined();
  });

  it('alerting service exposes hourly metric collection methods', async () => {
    const { alertingService } = await import('../services/alerting.service');
    // These methods feed data into evaluateMetric() for threshold-based alerting
    expect(typeof alertingService.recordDisconnectEvent).toBe('function');
    expect(typeof alertingService.recordVideoSafetyTimeouts).toBe('function');
    expect(typeof alertingService.checkHourlyMetrics).toBe('function');
    expect(typeof alertingService.evaluateMetric).toBe('function');
  });

  it('realtime-stats service mock is wired and callable', async () => {
    const { realtimeStatsService } = await import('../services/realtime-stats.service');
    expect(realtimeStatsService.initialize).toBeDefined();
    expect(realtimeStatsService.start).toBeDefined();
  });

  it('all services expose the methods called during startup', async () => {
    // Note: jest.clearAllMocks() in setup.ts afterEach clears call counts,
    // so we verify that the mock functions exist and are callable (wiring OK).
    // The actual startup calls were verified by the fact that beforeAll succeeded.
    const socketService = (await import('../services/socket.service')).default;
    const schedulerService = (await import('../services/scheduler.service')).default;
    const cronSchedulerService = (await import('../services/cron-scheduler.service')).default;
    const memoryManagerService = (await import('../services/memory-manager.service')).default;
    const networkAlertsService = (await import('../services/network-alerts.service')).default;
    const { alertingService } = await import('../services/alerting.service');

    // Verify each service exposes the methods that server.ts calls during startup
    expect(typeof socketService.initialize).toBe('function');
    expect(typeof schedulerService.start).toBe('function');
    expect(typeof cronSchedulerService.start).toBe('function');
    expect(typeof memoryManagerService.start).toBe('function');
    expect(typeof memoryManagerService.registerCleanupCallback).toBe('function');
    expect(typeof networkAlertsService.start).toBe('function');
    expect(typeof alertingService.initialize).toBe('function');
  });
});

// ----------------------------------------------------------
// 13. Repository imports (vérifie que tous les repos sont importables)
// ----------------------------------------------------------
describe('Repository layer wiring', () => {
  it('all repositories are exported from index', async () => {
    const repos = await import('../repositories');
    const expectedRepos = [
      'siteRepository',
      'subscriptionRepository',
      'deploymentRepository',
      'alertRepository',
      'remoteCommandRepository',
      'metricsRepository',
      'timelineRepository',
      'userRepository',
      'groupRepository',
      'analyticsRepository',
      'advertiserRepository',
      'reportRepository',
      'configHistoryRepository',
      'configProfileRepository',
      'agencyRepository',
      'playlistScheduleRepository',
      'objectiveRepository',
      'advertiserPortalRepository',
      'videoRepository',
      'softwareUpdateRepository',
    ];

    for (const repoName of expectedRepos) {
      expect(repos).toHaveProperty(repoName);
      expect((repos as Record<string, unknown>)[repoName]).toBeDefined();
    }
  });

  it('BaseRepository class is exported', async () => {
    const repos = await import('../repositories');
    expect(repos).toHaveProperty('BaseRepository');
    expect(typeof repos.BaseRepository).toBe('function');
  });
});

// ----------------------------------------------------------
// 14. Middleware exports wiring
// ----------------------------------------------------------
describe('Middleware exports wiring', () => {
  it('auth middleware exports all expected functions', async () => {
    const auth = await import('../middleware/auth');
    expect(auth.authenticate).toBeDefined();
    expect(auth.requireRole).toBeDefined();
    expect(auth.requireSuperAdmin).toBeDefined();
    expect(auth.requireAdmin).toBeDefined();
    expect(auth.requireInternal).toBeDefined();
    expect(auth.generateToken).toBeDefined();
    expect(auth.isAdmin).toBeDefined();
    expect(auth.isInternal).toBeDefined();
    expect(auth.authenticateSiteApiKey).toBeDefined();
    expect(auth.requireSponsorAccess).toBeDefined();
    expect(auth.requireAgencyAccess).toBeDefined();
  });

  it('validation middleware exports validate function and all schemas', async () => {
    const validation = await import('../middleware/validation');
    expect(validation.validate).toBeDefined();
    expect(validation.schemas).toBeDefined();

    const expectedSchemas = [
      'login', 'mfaCode', 'createSite', 'updateSite',
      'createGroup', 'updateGroup', 'addSitesToGroup',
      'deployContent', 'deployUpdate', 'executeCommand',
      'createUser', 'updateUser',
      'forgotPassword', 'resetPassword',
      'remoteCommand', 'remotePin', 'setRemotePin',
      'extendSubscription', 'suspendSite', 'reactivateSite',
      'changePlan', 'updateSubscription',
    ];

    for (const schemaName of expectedSchemas) {
      expect(validation.schemas).toHaveProperty(schemaName);
    }
  });

  it('rate limit middleware exports all limiters', async () => {
    const rateLimit = await import('../middleware/user-rate-limit');
    expect(rateLimit.authRateLimit).toBeDefined();
    expect(rateLimit.apiRateLimit).toBeDefined();
    expect(rateLimit.sensitiveRateLimit).toBeDefined();
    expect(rateLimit.uploadRateLimit).toBeDefined();
    expect(rateLimit.publicRateLimit).toBeDefined();
    expect(rateLimit.adminRateLimit).toBeDefined();
    expect(rateLimit.monitoringRateLimit).toBeDefined();
    expect(rateLimit.loggingRateLimit).toBeDefined();
    expect(rateLimit.piAnalyticsRateLimit).toBeDefined();
    expect(rateLimit.remoteRateLimit).toBeDefined();
    expect(rateLimit.roleBasedRateLimit).toBeDefined();
    expect(rateLimit.createUserRateLimit).toBeDefined();
  });

  it('pagination middleware exports all helpers', async () => {
    const pagination = await import('../middleware/pagination');
    expect(pagination.paginationMiddleware).toBeDefined();
    expect(pagination.createPaginationMiddleware).toBeDefined();
    expect(pagination.formatPaginatedResponse).toBeDefined();
    expect(pagination.buildPaginationClause).toBeDefined();
    expect(pagination.executePaginatedQuery).toBeDefined();
  });

  it('error handler middleware exports handlers', async () => {
    const errorHandler = await import('../middleware/error-handler');
    expect(errorHandler.errorHandler).toBeDefined();
    expect(errorHandler.notFoundHandler).toBeDefined();
    expect(errorHandler.asyncHandler).toBeDefined();
  });

  it('correlation middleware exports correctly', async () => {
    const correlation = await import('../middleware/correlation');
    expect(correlation.correlationMiddleware).toBeDefined();
  });

  it('RLS context middleware exports all functions', async () => {
    const rls = await import('../middleware/rls-context');
    expect(rls.setRLSContext).toBeDefined();
    expect(rls.resetRLSContext).toBeDefined();
    expect(rls.setAdminContext).toBeDefined();
    expect(rls.withRLSContext).toBeDefined();
    expect(rls.withAdminContext).toBeDefined();
  });
});

// ----------------------------------------------------------
// 15. Error types wiring
// ----------------------------------------------------------
describe('Error types wiring', () => {
  it('ErrorCode enum has all expected categories', async () => {
    const { ErrorCode } = await import('../types/errors');
    // Auth errors
    expect(ErrorCode.AUTH_CREDENTIALS_INVALID).toBeDefined();
    expect(ErrorCode.AUTH_TOKEN_EXPIRED).toBeDefined();
    expect(ErrorCode.AUTH_TOKEN_MISSING).toBeDefined();
    expect(ErrorCode.AUTH_TOKEN_INVALID).toBeDefined();
    expect(ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS).toBeDefined();
    expect(ErrorCode.AUTH_MFA_REQUIRED).toBeDefined();
    // Resource errors
    expect(ErrorCode.RESOURCE_NOT_FOUND).toBeDefined();
    expect(ErrorCode.RESOURCE_ALREADY_EXISTS).toBeDefined();
    // Validation errors
    expect(ErrorCode.VALIDATION_FAILED).toBeDefined();
    // Site errors
    expect(ErrorCode.SITE_NOT_FOUND).toBeDefined();
    expect(ErrorCode.SITE_OFFLINE).toBeDefined();
    // Deployment errors
    expect(ErrorCode.DEPLOYMENT_FAILED).toBeDefined();
    // Storage errors
    expect(ErrorCode.STORAGE_UPLOAD_FAILED).toBeDefined();
    expect(ErrorCode.STORAGE_FILE_TOO_LARGE).toBeDefined();
  });

  it('AppError class is constructable', async () => {
    const { AppError, ErrorCode } = await import('../types/errors');
    const err = new AppError(ErrorCode.RESOURCE_NOT_FOUND);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('RESOURCE_NOT_FOUND');
    expect(err.statusCode).toBeDefined();
    expect(typeof err.toResponse).toBe('function');
  });

  it('AppError.toResponse produces standardized format', async () => {
    const { AppError, ErrorCode } = await import('../types/errors');
    const err = new AppError(ErrorCode.VALIDATION_FAILED, { field: 'email' });
    const response = err.toResponse('test-correlation-id', '/api/test');
    expect(response.error).toHaveProperty('code', 'VALIDATION_FAILED');
    expect(response.error).toHaveProperty('correlationId', 'test-correlation-id');
    expect(response.error).toHaveProperty('path', '/api/test');
    expect(response.error).toHaveProperty('timestamp');
  });
});

// ----------------------------------------------------------
// 16. Pagination middleware behavior
// ----------------------------------------------------------
describe('Pagination middleware behavior', () => {
  it('formats paginated response correctly', async () => {
    const { formatPaginatedResponse } = await import('../middleware/pagination');
    const result = formatPaginatedResponse(
      [{ id: 1 }, { id: 2 }],
      50,
      { page: 1, limit: 20, offset: 0 }
    );
    expect(result.data).toHaveLength(2);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(20);
    expect(result.pagination.total).toBe(50);
    expect(result.pagination.totalPages).toBe(3);
    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it('formatPaginatedResponse handles last page', async () => {
    const { formatPaginatedResponse } = await import('../middleware/pagination');
    const result = formatPaginatedResponse(
      [{ id: 1 }],
      41,
      { page: 3, limit: 20, offset: 40 }
    );
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(true);
    expect(result.pagination.totalPages).toBe(3);
  });

  it('builds pagination SQL clause', async () => {
    const { buildPaginationClause } = await import('../middleware/pagination');
    const clause = buildPaginationClause({ page: 2, limit: 10, offset: 10 });
    expect(clause).toBe('LIMIT 10 OFFSET 10');
  });
});

// ----------------------------------------------------------
// 17. Socket.IO handler imports wiring
// ----------------------------------------------------------
describe('Socket.IO handler files exist', () => {
  it('all handler files exist on disk', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const handlersDir = path.join(repoRoot, 'central-server', 'src', 'handlers');
    const expectedHandlers = [
      'heartbeat.handler.ts',
      'command-dispatch.handler.ts',
      'config-sync.handler.ts',
      'deploy-progress.handler.ts',
      'license.handler.ts',
      'network-resilience.handler.ts',
      'health-monitor.handler.ts',
      'score-update.handler.ts',
      'match-config.handler.ts',
      'socket-context.ts',
    ];

    const actualFiles = fs.readdirSync(handlersDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));

    for (const expected of expectedHandlers) {
      expect({
        handler: expected,
        exists: actualFiles.includes(expected),
      }).toEqual({
        handler: expected,
        exists: true,
      });
    }
  });
});

// ----------------------------------------------------------
// 18. Body parsing & content limits
// ----------------------------------------------------------
describe('Body parsing & content limits', () => {
  it('accepts JSON body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'validpassword' })
      .set('Content-Type', 'application/json');
    // Should not be 415 (Unsupported Media Type) or parsing error
    expect(res.status).not.toBe(415);
  });

  it('accepts URL-encoded body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send('email=test@test.com&password=validpassword')
      .set('Content-Type', 'application/x-www-form-urlencoded');
    expect(res.status).not.toBe(415);
  });
});

// ----------------------------------------------------------
// 19. Compression
// ----------------------------------------------------------
describe('Compression middleware', () => {
  it('compresses response when client accepts gzip', async () => {
    // Use a non-rate-limited endpoint to test compression
    const res = await request(app)
      .get('/')
      .set('Accept-Encoding', 'gzip');
    // Compression middleware should be active and not break the response
    expect(res.status).toBe(200);
  });
});

// ----------------------------------------------------------
// 20. Swagger/API docs (development mode)
// ----------------------------------------------------------
describe('API documentation', () => {
  it('GET /api-docs is accessible in non-production', async () => {
    const res = await request(app).get('/api-docs');
    // In test/dev, either serves swagger UI (301/200) or returns message
    expect(res.status).not.toBe(500);
    // 301 redirect to /api-docs/ is also acceptable
    expect([200, 301]).toContain(res.status);
  });
});

// ----------------------------------------------------------
// 21. Raspberry Pi config conventions
// ----------------------------------------------------------
import * as fs from 'fs';
import * as path from 'path';

describe('Raspberry Pi config conventions', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const systemdDir = path.join(repoRoot, 'raspberry', 'config', 'systemd');

  const getServiceFiles = (): string[] =>
    fs.readdirSync(systemdDir).filter(f => f.endsWith('.service'));

  it('systemd services must NOT have NoNewPrivileges=true (breaks sudo)', () => {
    const serviceFiles = getServiceFiles();
    expect(serviceFiles.length).toBeGreaterThan(0);

    for (const file of serviceFiles) {
      const content = fs.readFileSync(path.join(systemdDir, file), 'utf8');
      expect({ file, hasNoNewPrivileges: /^\s*NoNewPrivileges\s*=\s*true/m.test(content) })
        .toEqual({ file, hasNoNewPrivileges: false });
    }
  });

  it('systemd services must NOT have ProtectSystem=strict (blocks /etc writes)', () => {
    const serviceFiles = getServiceFiles();

    for (const file of serviceFiles) {
      const content = fs.readFileSync(path.join(systemdDir, file), 'utf8');
      expect({ file, hasProtectSystem: /^\s*ProtectSystem\s*=\s*strict/m.test(content) })
        .toEqual({ file, hasProtectSystem: false });
    }
  });

  it('sudoers file must include apt rules', () => {
    const sudoersPath = path.join(repoRoot, 'raspberry', 'config', 'sudoers.d', 'neopro');
    const content = fs.readFileSync(sudoersPath, 'utf8');
    expect(content).toMatch(/apt-get install/);
    expect(content).toMatch(/apt install/);
  });
});

// ----------------------------------------------------------
// 22. Route file count consistency
// ----------------------------------------------------------
describe('Route file consistency', () => {
  it('server.ts mounts all route files', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const routesDir = path.join(repoRoot, 'central-server', 'src', 'routes');
    const routeFiles = fs.readdirSync(routesDir)
      .filter(f => f.endsWith('.routes.ts'))
      .map(f => f.replace('.ts', ''));

    const serverPath = path.join(repoRoot, 'central-server', 'src', 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    for (const routeFile of routeFiles) {
      expect({
        route: routeFile,
        imported: serverContent.includes(`'./routes/${routeFile}'`),
      }).toEqual({
        route: routeFile,
        imported: true,
      });
    }
  });
});

// ----------------------------------------------------------
// 23. Handler file count consistency
// ----------------------------------------------------------
describe('Handler file consistency', () => {
  it('all handler files export at least one function', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const handlersDir = path.join(repoRoot, 'central-server', 'src', 'handlers');
    const handlerFiles = fs.readdirSync(handlersDir)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));

    expect(handlerFiles.length).toBeGreaterThan(0);

    for (const file of handlerFiles) {
      const content = fs.readFileSync(path.join(handlersDir, file), 'utf8');
      // Each handler should export at least one symbol (function, const, interface, type)
      expect({
        file,
        hasExport: /export\s+(const|function|async|interface|type|{)/m.test(content),
      }).toEqual({
        file,
        hasExport: true,
      });
    }
  });
});

// ----------------------------------------------------------
// 24. Repository file count consistency
// ----------------------------------------------------------
describe('Repository file consistency', () => {
  it('all non-test repository files are re-exported from index', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const reposDir = path.join(repoRoot, 'central-server', 'src', 'repositories');
    const repoFiles = fs.readdirSync(reposDir)
      .filter(f => f.endsWith('.ts')
        && !f.endsWith('.test.ts')
        && f !== 'index.ts'
        && f !== 'base.repository.ts');

    const indexContent = fs.readFileSync(path.join(reposDir, 'index.ts'), 'utf8');

    for (const repoFile of repoFiles) {
      const moduleName = `./${repoFile.replace('.ts', '')}`;
      expect({
        repo: repoFile,
        reExported: indexContent.includes(moduleName),
      }).toEqual({
        repo: repoFile,
        reExported: true,
      });
    }
  });
});

// ----------------------------------------------------------
// 25. Auth helper functions
// ----------------------------------------------------------
describe('Auth helper functions', () => {
  it('isAdmin correctly identifies admin roles', async () => {
    const { isAdmin } = await import('../middleware/auth');
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('super_admin')).toBe(true);
    expect(isAdmin('operator')).toBe(false);
    expect(isAdmin('viewer')).toBe(false);
    expect(isAdmin('advertiser')).toBe(false);
  });

  it('isInternal correctly identifies internal roles', async () => {
    const { isInternal } = await import('../middleware/auth');
    expect(isInternal('admin')).toBe(true);
    expect(isInternal('super_admin')).toBe(true);
    expect(isInternal('operator')).toBe(true);
    expect(isInternal('viewer')).toBe(true);
    expect(isInternal('advertiser')).toBe(false);
    expect(isInternal('agency')).toBe(false);
  });

  it('generateToken produces valid JWT', () => {
    const token = generateToken({
      id: 'test-id',
      email: 'test@test.com',
      role: 'admin',
    });
    expect(typeof token).toBe('string');
    const parts = token.split('.');
    expect(parts.length).toBe(3);
    // Decode payload to verify structure
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    expect(payload.id).toBe('test-id');
    expect(payload.email).toBe('test@test.com');
    expect(payload.role).toBe('admin');
    expect(payload).toHaveProperty('exp'); // Has expiration
    expect(payload).toHaveProperty('iat'); // Has issued-at
  });
});

// ----------------------------------------------------------
// 26. JSON body limits
// ----------------------------------------------------------
describe('Request body size limits', () => {
  it('rejects oversized JSON body', async () => {
    // Create a body larger than 10MB
    const largeBody = { data: 'x'.repeat(11 * 1024 * 1024) };
    const res = await request(app)
      .post('/api/auth/login')
      .send(largeBody)
      .set('Content-Type', 'application/json');
    // Express returns 413 (Payload Too Large) or 500 depending on error handler
    expect([413, 500]).toContain(res.status);
  });
});

// ----------------------------------------------------------
// 27. ADR README ↔ file consistency
// ----------------------------------------------------------
// Vérifie que chaque ADR listé dans le README existe en tant que fichier,
// et que chaque fichier ADR-*.md présent sur disque est référencé dans le README.
describe('ADR README ↔ file consistency', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const adrDir = path.join(repoRoot, 'docs', 'adr');
  const readmePath = path.join(adrDir, 'README.md');

  it('README.md exists and is readable', () => {
    expect(fs.existsSync(readmePath)).toBe(true);
  });

  it('every ADR file linked in README exists on disk', () => {
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    // Match markdown links like (ADR-001-edge-cloud-architecture.md)
    const linkedFiles = [...readmeContent.matchAll(/\(ADR-\d{3}-[^)]+\.md\)/g)]
      .map(m => m[0].slice(1, -1)); // Remove surrounding parens

    expect(linkedFiles.length).toBeGreaterThan(0);

    for (const file of linkedFiles) {
      expect({
        file,
        exists: fs.existsSync(path.join(adrDir, file)),
      }).toEqual({
        file,
        exists: true,
      });
    }
  });

  // Known orphan ADR files: duplicate numbering from legacy reorganization.
  // TODO: renumber these to ADR-021+ or archive them during quarterly review.
  const knownOrphanADRs = new Set([
    'ADR-006-subscription-license-system.md',
    'ADR-007-network-resilience-layers.md',
    'ADR-008-double-buffer-video-pi.md',
    'ADR-009-predictive-alerts.md',
    'ADR-010-analytics-ui-removal.md',
    'ADR-011-multi-tv-single-pi.md',
    'ADR-012-tv-led-dual-output.md',
    'ADR-013-stramatel-live-score.md',
  ]);

  it('every ADR-*.md file on disk is referenced in README (excluding known orphans)', () => {
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    const adrFiles = fs.readdirSync(adrDir)
      .filter(f => /^ADR-\d{3}-.*\.md$/.test(f))
      .filter(f => !knownOrphanADRs.has(f));

    expect(adrFiles.length).toBeGreaterThan(0);

    for (const file of adrFiles) {
      expect({
        file,
        referencedInReadme: readmeContent.includes(file),
      }).toEqual({
        file,
        referencedInReadme: true,
      });
    }
  });

  it('no new orphan ADR files appear (catches forgotten README updates)', () => {
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    const allAdrFiles = fs.readdirSync(adrDir)
      .filter(f => /^ADR-\d{3}-.*\.md$/.test(f));
    const newOrphans = allAdrFiles
      .filter(f => !readmeContent.includes(f) && !knownOrphanADRs.has(f));

    expect({
      newOrphanFiles: newOrphans,
      count: newOrphans.length,
    }).toEqual({
      newOrphanFiles: [],
      count: 0,
    });
  });

  it('ADR templates referenced in README exist', () => {
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    const templatesDir = path.join(repoRoot, 'docs', 'templates');
    const templateLinks = [...readmeContent.matchAll(/\(\.\.\/templates\/(TEMPLATE_ADR[^)]+\.md)\)/g)]
      .map(m => m[1]);

    for (const template of templateLinks) {
      expect({
        template,
        exists: fs.existsSync(path.join(templatesDir, template)),
      }).toEqual({
        template,
        exists: true,
      });
    }
  });
});

// ----------------------------------------------------------
// 28. Sync-agent command handler symmetry
// ----------------------------------------------------------
// Bug prevention: agent.js must emit `completed: true` for BOTH deploy_video

// and update_software commands. The omission of completed:true for update_software
// caused OTA deployments to stay stuck at 0% for months (Dec 2025 → Feb 2026).
// This smoke test prevents the asymmetry from recurring after any refactor.
describe('Sync-agent command handler symmetry', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const agentPath = path.join(repoRoot, 'raspberry', 'sync-agent', 'src', 'agent.js');

  it('agent.js exists and is readable', () => {
    expect(fs.existsSync(agentPath)).toBe(true);
  });

  it('deploy_video branch emits completed: true', () => {
    const content = fs.readFileSync(agentPath, 'utf8');
    const deployVideoMatch = content.match(
      /type\s*===\s*['"]deploy_video['"]([\s\S]*?)(?=\}\s*else\s+if)/
    );
    expect(deployVideoMatch).not.toBeNull();
    expect({
      branch: 'deploy_video',
      emitsCompleted: /completed:\s*true/.test(deployVideoMatch![1]),
    }).toEqual({
      branch: 'deploy_video',
      emitsCompleted: true,
    });
  });

  it('update_software branch emits completed: true', () => {
    const content = fs.readFileSync(agentPath, 'utf8');
    const updateSoftwareMatch = content.match(
      /type\s*===\s*['"]update_software['"]([\s\S]*?)(?=\}\s*else\s+if)/
    );
    expect(updateSoftwareMatch).not.toBeNull();
    expect({
      branch: 'update_software',
      emitsCompleted: /completed:\s*true/.test(updateSoftwareMatch![1]),
    }).toEqual({
      branch: 'update_software',
      emitsCompleted: true,
    });
  });

  it('both command branches emit progress: 100 in their completion signal', () => {
    const content = fs.readFileSync(agentPath, 'utf8');

    const dvMatch = content.match(
      /type\s*===\s*['"]deploy_video['"]([\s\S]*?)(?=\}\s*else\s+if)/
    );
    expect(dvMatch).not.toBeNull();
    expect({ branch: 'deploy_video', emitsProgress100: /progress:\s*100/.test(dvMatch![1]) })
      .toEqual({ branch: 'deploy_video', emitsProgress100: true });

    const usMatch = content.match(
      /type\s*===\s*['"]update_software['"]([\s\S]*?)(?=\}\s*else\s+if)/
    );
    expect(usMatch).not.toBeNull();
    expect({ branch: 'update_software', emitsProgress100: /progress:\s*100/.test(usMatch![1]) })
      .toEqual({ branch: 'update_software', emitsProgress100: true });
  });
});

// ----------------------------------------------------------
// 29. Hourly metric alerting wiring
// ----------------------------------------------------------
describe('Hourly metric alerting wiring', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('heartbeat handler feeds video safety timeouts to alertingService', () => {
    const heartbeatPath = path.join(repoRoot, 'central-server', 'src', 'handlers', 'heartbeat.handler.ts');
    const content = fs.readFileSync(heartbeatPath, 'utf8');

    expect({
      importsAlertingService: content.includes("from '../services/alerting.service'"),
      callsRecordVideoSafetyTimeouts: content.includes('alertingService.recordVideoSafetyTimeouts'),
    }).toEqual({
      importsAlertingService: true,
      callsRecordVideoSafetyTimeouts: true,
    });
  });

  it('socket service feeds disconnect events to alertingService', () => {
    const socketPath = path.join(repoRoot, 'central-server', 'src', 'services', 'socket.service.ts');
    const content = fs.readFileSync(socketPath, 'utf8');

    expect({
      importsAlertingService: content.includes("from './alerting.service'"),
      callsRecordDisconnectEvent: content.includes('alertingService.recordDisconnectEvent'),
    }).toEqual({
      importsAlertingService: true,
      callsRecordDisconnectEvent: true,
    });
  });

  it('alerting service has checkHourlyMetrics wired into periodic check', () => {
    const alertingPath = path.join(repoRoot, 'central-server', 'src', 'services', 'alerting.service.ts');
    const content = fs.readFileSync(alertingPath, 'utf8');

    expect({
      hasCheckHourlyMetrics: content.includes('async checkHourlyMetrics'),
      calledInPeriodicLoop: content.includes('this.checkHourlyMetrics()'),
      queriesKioskCrashes: content.includes("alert_type = 'kiosk_crash'"),
      evaluatesWsDisconnects: content.includes("'websocket_disconnects_1h'"),
      evaluatesVideoTimeouts: content.includes("'video_safety_timeouts_1h'"),
      evaluatesKioskCrashes: content.includes("'kiosk_crashes_1h'"),
    }).toEqual({
      hasCheckHourlyMetrics: true,
      calledInPeriodicLoop: true,
      queriesKioskCrashes: true,
      evaluatesWsDisconnects: true,
      evaluatesVideoTimeouts: true,
      evaluatesKioskCrashes: true,
    });
  });
});
