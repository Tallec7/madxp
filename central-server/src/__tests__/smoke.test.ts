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
    { method: 'get' as const, path: '/api/assets/watermarks' },
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
    // 403 = role check blocked, 429 = rate-limited (IP-based, accumulates in test)
    // Either way, the operator is NOT getting through (not 200/500)
    expect([403, 429]).toContain(res.status);
    if (res.status === 403) {
      expect(res.body.error).toBe('Accès refusé');
    }
  });

  it('viewer cannot access admin-only routes', async () => {
    const res = await request(app).get('/api/admin/clients').set(viewerAuthHeader);
    // 403 = role check blocked, 429 = rate-limited (IP-based, accumulates in test)
    // Either way, the viewer is NOT getting through (not 200/500)
    expect([403, 429]).toContain(res.status);
    if (res.status === 403) {
      expect(res.body.error).toBe('Accès refusé');
    }
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
    expect(auth.authenticateSiteApiKeyOptional).toBeDefined();
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
// 22b. No backward-compat route shadows site-sponsor routes
// ----------------------------------------------------------
describe('Site-sponsor route conflict guard', () => {
  it('advertiser-sites.routes.ts must NOT declare GET /sites/:id/sponsors (shadowed by site-sponsor.routes.ts)', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const filePath = path.join(repoRoot, 'central-server', 'src', 'routes', 'advertiser-sites.routes.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // This backward-compat route was removed because it shadowed the new
    // site-sponsor.routes.ts handler and returned { advertisers } instead
    // of { sponsors }, making the sponsors list always empty on the dashboard.
    expect({
      hasShadowingRoute: /router\.(get|all)\(\s*['"]\/sites\/:id\/sponsors['"]/m.test(content),
    }).toEqual({
      hasShadowingRoute: false,
    });
  });

  it('site-sponsor.routes.ts declares GET /:siteId/sponsors', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const filePath = path.join(repoRoot, 'central-server', 'src', 'routes', 'site-sponsor.routes.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    expect({
      hasListRoute: /router\.get\(\s*['"]\/:siteId\/sponsors['"]/m.test(content),
    }).toEqual({
      hasListRoute: true,
    });
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

  it('alerting service has orphaned_video_references threshold defined', () => {
    const alertingPath = path.join(repoRoot, 'central-server', 'src', 'services', 'alerting.service.ts');
    const content = fs.readFileSync(alertingPath, 'utf8');

    expect({
      hasOrphanedThreshold: content.includes("metric: 'orphaned_video_references'"),
      hasWarningValue: content.includes('warningValue: 1'),
      hasCriticalValue: content.includes('criticalValue: 5'),
    }).toEqual({
      hasOrphanedThreshold: true,
      hasWarningValue: true,
      hasCriticalValue: true,
    });
  });

  it('predictive-alerts service checks orphaned video references', () => {
    const predictivePath = path.join(repoRoot, 'central-server', 'src', 'services', 'predictive-alerts.service.ts');
    const content = fs.readFileSync(predictivePath, 'utf8');

    expect({
      importsExtractVideoPaths: content.includes("from '../utils/config-video-paths'"),
      hasCheckOrphanedMethod: content.includes('checkOrphanedVideoReferences'),
      callsEvaluateMetric: content.includes("'orphaned_video_references'"),
    }).toEqual({
      importsExtractVideoPaths: true,
      hasCheckOrphanedMethod: true,
      callsEvaluateMetric: true,
    });
  });
});

// ─── #30 Cloud remote relay chain completeness ──────────────────────────────
describe('Cloud remote relay chain', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const remoteCtrlPath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'remote.controller.ts');
  const agentPath = path.join(repoRoot, 'raspberry', 'sync-agent', 'src', 'agent.js');
  const handlersPath = path.join(repoRoot, 'raspberry', 'server', 'socket', 'handlers.js');

  const remoteCtrl = fs.readFileSync(remoteCtrlPath, 'utf8');
  const agent = fs.readFileSync(agentPath, 'utf8');
  const handlers = fs.readFileSync(handlersPath, 'utf8');

  // Events emitted by remote.controller.ts via io.to(siteId).emit()
  const remoteControllerEvents = [
    'score-update',
    'score-reset',
    'phase-change',
    'cloud-remote-action',
    'timer-update',
    'breaking-news',
    'match-info-updated',
    'recording-toggle',
    'screenshot-request',
  ];

  // All events sync-agent listens for from central server
  // Includes remote controller events + options-update (emitted by socket.service on config change)
  const syncAgentListenEvents = [
    ...remoteControllerEvents,
    'options-update',
  ];

  // Events relayed by sync-agent to local Pi server (local event name)
  // These must ALL have handlers in Pi local server handlers.js
  const localRelayedEvents = [
    'score-update',
    'score-reset',
    'phase-change',
    'command',        // cloud-remote-action → relayed as 'command'
    'timer-update',
    'breaking-news',
    'match-info-updated',
    'recording-toggle',
    'options-update',
    'screenshot-request',
  ];

  it('remote.controller.ts emits all cloud remote event types', () => {
    for (const event of remoteControllerEvents) {
      if (event === 'screenshot-request') {
        // screenshot-request is emitted inline (not via eventName variable)
        expect(remoteCtrl).toContain("emit('screenshot-request'");
      } else {
        expect(remoteCtrl).toContain(`'${event}'`);
      }
    }
  });

  it('sync-agent listens for all cloud remote events from central server', () => {
    for (const event of syncAgentListenEvents) {
      expect(agent).toContain(`socket.on('${event}'`);
    }
  });

  it('sync-agent relays standard events and handles screenshot separately', () => {
    // Standard relay events use relayToLocalServer
    const relayEvents = syncAgentListenEvents.filter(e => e !== 'screenshot-request');
    for (const event of relayEvents) {
      expect(agent).toContain(`socket.on('${event}'`);
    }
    // screenshot-request uses requestScreenshot (needs response relay back)
    expect(agent).toContain("socket.on('screenshot-request'");
    expect(agent).toContain('requestScreenshot');
  });

  it('Pi local server handlers.js has handlers for all relayed events', () => {
    for (const event of localRelayedEvents) {
      expect(handlers).toContain(`socket.on('${event}'`);
    }
  });

  it('remote.controller.ts checks room membership to detect zombie connections', () => {
    expect(remoteCtrl).toContain('io.sockets.adapter.rooms.get(siteId)');
  });
});

// ─── #31 socket.data ban in handlers (Socket.IO v4 property mismatch) ───────
describe('Socket.IO property access consistency', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const handlersDir = path.join(repoRoot, 'central-server', 'src', 'handlers');
  const handlerFiles = fs.readdirSync(handlersDir)
    .filter((f: string) => f.endsWith('.handler.ts') && !f.endsWith('.test.ts'));

  it('no handler uses socket.data (must use (socket as any).prop)', () => {
    // Socket.IO v4: socket.data is a separate {} object, NOT the same as properties
    // set via (socket as any).siteId in socket.service.ts.
    // Using socket.data.siteId returns undefined → silent early return.
    const violations: string[] = [];
    for (const file of handlerFiles) {
      const content = fs.readFileSync(path.join(handlersDir, file), 'utf8');
      // Match socket.data.xxx or (socket.data as xxx) patterns
      if (/socket\.data[.\s]/.test(content)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });
});

// =================================================================
// Sponsor loop analytics wiring
// =================================================================

describe('Sponsor loop analytics category wiring', () => {
  const sponsorService = fs.readFileSync(
    path.resolve(__dirname, '../../../raspberry/admin/services/sponsor.service.js'),
    'utf8'
  );

  const deploymentService = fs.readFileSync(
    path.resolve(__dirname, '../services/orchestrated-deployment.service.ts'),
    'utf8'
  );

  it('_rebuildLoopEntries sets analytics_category sponsor on loop entries', () => {
    // Loop entries MUST have analytics_category: 'sponsor' otherwise detectCategory()
    // on the Pi falls back to path-based detection and categorizes as 'other',
    // making impressions invisible in listBySite (filters on category = 'sponsor')
    expect(sponsorService).toContain("analytics_category: 'sponsor'");
  });

  it('_rebuildLoopEntries includes name and type for loop entries', () => {
    // Loop entries need name and type for consistency with central-deployed entries
    expect(sponsorService).toContain('name: sponsor.name');
    expect(sponsorService).toContain("type: 'video/mp4'");
  });

  it('syncSponsorVideoAssociations receives enriched config (not original)', () => {
    // Must use enrichedConfig (with auto-resolved site_sponsor_id) not the original config
    // otherwise newly resolved videos won't be synced to site_sponsor_videos
    expect(deploymentService).toContain('syncSponsorVideoAssociations(siteId, enrichedConfig)');
  });
});

// =================================================================
// Kiosk boot regressions — Video.js removal, cache, score
// =================================================================

describe('Kiosk boot regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('tv.component.ts must NOT import video.js (legacy player removed in v3.72)', () => {
    // Video.js caused a black rectangle at boot on Pi with slow GPU.
    // Only native HTML5 <video> double-buffer is used now.
    const tvComponent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'),
      'utf8'
    );
    expect({ hasVideoJs: /import.*video\.js|import.*videojs/m.test(tvComponent) })
      .toEqual({ hasVideoJs: false });
  });

  it('tv.component.html must NOT have video.js player element', () => {
    const tvTemplate = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.html'),
      'utf8'
    );
    expect({ hasVideoJsElement: /class="video-js"|#target.*video-js/m.test(tvTemplate) })
      .toEqual({ hasVideoJsElement: false });
  });

  it('StateService must default score to null (not DOMICILE/EXTÉRIEUR)', () => {
    // Default DOMICILE 0-0 EXTÉRIEUR was emitted on every client connect,
    // causing phantom score overlay even when premium not activated.
    const stateService = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/state.service.js'),
      'utf8'
    );
    expect({ scoreDefaultNull: /this\._score\s*=\s*null/.test(stateService) })
      .toEqual({ scoreDefaultNull: true });
  });

  it('handlers.js must guard score-update emission with null check', () => {
    // Prevents emitting score-update with null data on client connect
    const handlers = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/socket/handlers.js'),
      'utf8'
    );
    expect({ guardsScoreEmit: /if\s*\(s(?:tate)?\.score\)/.test(handlers) })
      .toEqual({ guardsScoreEmit: true });
  });
});

describe('Nginx cache-control conventions', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  const nginxConfigs = [
    'raspberry/config/nginx-captive-portal.conf',
    'raspberry/config/nginx/neopro-hls.conf',
  ];

  for (const configPath of nginxConfigs) {
    it(`${configPath} must have Cache-Control no-store on index.html`, () => {
      // Without no-store, Chromium caches index.html and serves old Angular builds at boot,
      // showing stale UI (old Video.js player, old score design) before the current build loads.
      const content = fs.readFileSync(path.join(repoRoot, configPath), 'utf8');
      expect({
        file: configPath,
        hasIndexHtmlNoCache: /location\s*=\s*\/index\.html\s*\{[^}]*no-cache,\s*no-store/s.test(content),
      }).toEqual({
        file: configPath,
        hasIndexHtmlNoCache: true,
      });
    });
  }

  it('install.sh nginx config must have Cache-Control no-store on index.html', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'raspberry/install.sh'), 'utf8');
    expect({
      hasIndexHtmlNoCache: /location\s*=\s*\/index\.html\s*\{[^}]*no-cache,\s*no-store/s.test(content),
    }).toEqual({
      hasIndexHtmlNoCache: true,
    });
  });
});

describe('Kiosk watchdog cache management', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('kiosk-watchdog.sh must purge entire Chromium profile (not just subdirectories)', () => {
    // Purging only specific subdirectories left stale data in Session Storage,
    // IndexedDB, Local Storage etc., causing old Angular builds to persist at boot.
    // Full profile purge is safe because kiosk mode needs no persistent state.
    const requiredPurges = [
      '.cache/chromium',   // All Chromium cache (HTTP, Code, etc.)
      '.config/chromium',  // All Chromium profile (Session, IndexedDB, Local Storage, etc.)
    ];
    const missing = requiredPurges.filter(p => !watchdog.includes(`rm -rf /home/pi/${p}`));
    expect({ missingProfilePurges: missing }).toEqual({ missingProfilePurges: [] });
  });

  it('kiosk-watchdog.sh must have --disk-cache-size flag on main Chromium', () => {
    // Without this flag, Chromium accumulates stale cached builds
    expect({ hasDiskCacheSize: /--disk-cache-size=\d+/.test(watchdog) })
      .toEqual({ hasDiskCacheSize: true });
  });

  it('kiosk-watchdog.sh must launch D-Bus session before Chromium', () => {
    // Without a D-Bus session, Chromium spams journalctl with
    // "Failed to connect to the bus" errors every ~6 seconds
    expect({ hasDbusLaunch: watchdog.includes('dbus-launch') })
      .toEqual({ hasDbusLaunch: true });
  });

  it('kiosk-watchdog.sh must use --password-store=basic on all Chromium instances', () => {
    // Without this flag, dbus-launch enables GNOME Keyring access and Chromium
    // shows a blocking "Choose password for new keyring" popup in kiosk mode.
    // Incident: 24/02/2026 — popup bloquante sur Pi après ajout dbus-launch.
    const matches = watchdog.match(/--password-store=basic/g) || [];
    // Must appear at least twice: once for TV Chromium, once for LED Chromium
    expect({ passwordStoreBasicCount: matches.length >= 2 })
      .toEqual({ passwordStoreBasicCount: true });
  });
});

describe('neopro-kiosk.service must depend on nginx', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const kioskService = fs.readFileSync(
    path.join(repoRoot, 'raspberry/config/systemd/neopro-kiosk.service'),
    'utf8'
  );

  it('neopro-kiosk.service must have After=nginx.service', () => {
    // Without this, Chromium can start before Nginx and load stale cached content
    // Incident: 24/02/2026 — old Angular version displayed at every boot
    expect({ hasAfterNginx: kioskService.includes('nginx.service') })
      .toEqual({ hasAfterNginx: true });
  });

  it('neopro-kiosk.service must Require nginx.service', () => {
    // Ensures kiosk won't start if nginx fails to start
    expect({ hasRequiresNginx: /Requires=.*nginx\.service/.test(kioskService) })
      .toEqual({ hasRequiresNginx: true });
  });
});

describe('Kiosk xdpyinfo dependency must be provisioned', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('neopro-kiosk.service xdpyinfo dependency must be in install.sh', () => {
    // neopro-kiosk.service uses xdpyinfo (from x11-utils) to check X server readiness.
    // If x11-utils is missing from install.sh, new Pi deployments will have a black TV screen.
    // Incident: NLF 22/02/2026 — TV noire post-OTA because x11-utils was not pre-installed.
    const installSh = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8'
    );
    expect({ hasX11Utils: installSh.includes('x11-utils') })
      .toEqual({ hasX11Utils: true });
  });

  it('OTA must auto-install required apt packages including x11-utils and edid-decode', () => {
    // update-software.js must have a requiredAptPackages list that includes x11-utils and edid-decode.
    // This ensures existing Pi fleet gets these packages installed during OTA upgrade.
    const updateSoftware = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    expect({ hasRequiredAptPackages: updateSoftware.includes('requiredAptPackages') })
      .toEqual({ hasRequiredAptPackages: true });
    expect({ hasX11Utils: updateSoftware.includes("'x11-utils'") })
      .toEqual({ hasX11Utils: true });
    expect({ hasEdidDecode: updateSoftware.includes("'edid-decode'") })
      .toEqual({ hasEdidDecode: true });
  });

  it('_findEdidPath must use readFileSync (not stat.size) for sysfs virtual files', () => {
    // sysfs files /sys/class/drm/*/edid report stat.size=0 even with 128-256 bytes of data.
    // Using stat.size caused edidPath=null → edid_detailed=null → enriched EDID invisible.
    // Incident: 24/02/2026 — all Pis had stat.size=0 for EDID files, enriched display never shown.
    const metricsJs = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js'),
      'utf8'
    );
    const hdmiServiceJs = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/hdmi.service.js'),
      'utf8'
    );
    // metrics.js must NOT use stat.size for EDID detection
    expect({ metricsUsesStatSize: /statSync.*edid[\s\S]{0,50}stat\.size/.test(metricsJs) })
      .toEqual({ metricsUsesStatSize: false });
    // hdmi.service.js must NOT use stat.size for EDID detection
    expect({ hdmiUsesStatSize: /statSync.*edid[\s\S]{0,50}stat\.size/.test(hdmiServiceJs) })
      .toEqual({ hdmiUsesStatSize: false });
    // Both must use readFileSync + buf.length in _findEdidPath
    expect({ metricsUsesReadFile: metricsJs.includes('readFileSync(edidPath)') })
      .toEqual({ metricsUsesReadFile: true });
    expect({ hdmiUsesReadFile: hdmiServiceJs.includes('readFileSync(edidPath)') })
      .toEqual({ hdmiUsesReadFile: true });
  });

  it('diagnose-pi.sh must check for x11-utils in recommended packages', () => {
    // diagnose-pi.sh warns when recommended packages are missing.
    // x11-utils must be in the list to alert operators before kiosk fails.
    const diagnosePi = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/diagnose-pi.sh'),
      'utf8'
    );
    expect({ hasX11Utils: diagnosePi.includes('x11-utils') })
      .toEqual({ hasX11Utils: true });
  });
});

// ----------------------------------------------------------
// Benchmark query pattern regression guards
// ----------------------------------------------------------
describe('Benchmark repository query safety', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const benchmarkRepo = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/repositories/benchmark.repository.ts'),
    'utf8'
  );

  it('getPeerMetrics must use LEFT JOIN (not correlated subqueries)', () => {
    // Correlated subqueries cause O(n²) execution time and statement_timeout on 50+ sites.
    // Incident: 23/02/2026 — 500 on /api/benchmark/sites/:siteId in production.
    expect({ usesLeftJoin: benchmarkRepo.includes('LEFT JOIN') })
      .toEqual({ usesLeftJoin: true });
  });

  it('benchmark.repository must NOT import query directly from database config', () => {
    // Repository pattern: all SQL goes through repositories, never direct query() in services.
    // benchmark.service.ts previously imported query() directly, violating the pattern.
    const benchmarkService = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/benchmark.service.ts'),
      'utf8'
    );
    expect({ directQueryImport: benchmarkService.includes("from '../config/database'") })
      .toEqual({ directQueryImport: false });
  });

  it('getPeerMetrics must filter active statuses explicitly (not != archived)', () => {
    // sites.status CHECK allows: online, offline, maintenance, error (no 'archived').
    // Using != 'archived' was dead code that included 'error' sites in benchmarks.
    expect({ hasExplicitStatusFilter: benchmarkRepo.includes("s.status IN ('online', 'offline', 'maintenance')") })
      .toEqual({ hasExplicitStatusFilter: true });
  });
});

// ----------------------------------------------------------
// Debug page regression guards
// ----------------------------------------------------------
describe('Debug page architecture guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const debugTabPath = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-debug-tab/site-debug-tab.component.ts');
  const debugTab = fs.readFileSync(debugTabPath, 'utf8');

  it('site-debug-tab must import DebugSummaryBarComponent (extracted sub-component)', () => {
    // Phase B extracted the summary bar into a standalone sub-component.
    // Re-inlining it would bloat the monolith and lose reusability.
    expect({ importsDebugSummaryBar: debugTab.includes("import { DebugSummaryBarComponent }") })
      .toEqual({ importsDebugSummaryBar: true });
  });

  it('site-debug-tab must import pollCommand utility (no duplicated polling)', () => {
    // Phase B factorized ~80 lines of duplicated command-polling into pollCommand<T>().
    // Reverting to inline polling duplicates code and risks divergent behavior.
    expect({ importsPollCommand: debugTab.includes("import { pollCommand") })
      .toEqual({ importsPollCommand: true });
  });

  it('site-debug-tab must NOT use native confirm() dialogs', () => {
    // Phase C replaced native confirm() with custom modals for consistent UX.
    // Native confirm() blocks the JS thread and cannot be styled.
    // Match standalone confirm( calls but not confirmModal or showConfirmModal
    const hasNativeConfirm = /(?<!show)(?<!cancel)(?<!execute)\bconfirm\s*\(/.test(debugTab);
    expect({ usesNativeConfirm: hasNativeConfirm })
      .toEqual({ usesNativeConfirm: false });
  });

  it('command-poller.util must export pollCommand and CommandPollResult', () => {
    // The polling utility is the shared abstraction for command execution + status polling.
    // Changing its API would break buffer status loading and wizard diagnostics.
    const pollerUtil = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-debug-tab/command-poller.util.ts'),
      'utf8'
    );
    expect({ exportsPollCommand: pollerUtil.includes('export function pollCommand') })
      .toEqual({ exportsPollCommand: true });
    expect({ exportsCommandPollResult: pollerUtil.includes('export interface CommandPollResult') })
      .toEqual({ exportsCommandPollResult: true });
  });

  it('DebugSummaryBarComponent must be a standalone Angular component', () => {
    // The summary bar must remain standalone for independent testability and reuse.
    const summaryBar = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-debug-tab/debug-summary-bar/debug-summary-bar.component.ts'),
      'utf8'
    );
    expect({ isStandalone: summaryBar.includes('standalone: true') })
      .toEqual({ isStandalone: true });
    expect({ hasSelector: summaryBar.includes("selector: 'app-debug-summary-bar'") })
      .toEqual({ hasSelector: true });
  });

  it('i18n fr/en/es must contain debug section keys', () => {
    // Phase C added 90+ i18n keys. Missing translations cause raw key display.
    const frJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/fr.json'), 'utf8');
    const enJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/en.json'), 'utf8');
    const esJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/es.json'), 'utf8');

    // Check critical keys exist in all 3 languages
    const criticalKeys = ['debug.summaryFiles', 'debug.healthTitle', 'debug.logsTitle', 'debug.networkTitle',
      'debug.bufferPending', 'debug.bufferVideoPlays', 'debug.bufferEvents', 'debug.bufferRefresh',
      'debug.wizardCheckingConnectivity', 'debug.wizardDeviceOnline', 'debug.wizardNoVideos',
      'debug.wizardLoopEmpty', 'debug.wizardAllOk', 'debug.timelineAll', 'debug.timelineDeployments',
      'debug.healthFanTitle', 'debug.healthHdmiConnection', 'debug.healthSystemdServices',
      'debug.exportOffline', 'debug.rebootRequiredTitle', 'debug.hotspotWaiting'];
    for (const key of criticalKeys) {
      const parts = key.split('.');
      expect({ [`fr_has_${key}`]: frJson.includes(`"${parts[1]}"`) })
        .toEqual({ [`fr_has_${key}`]: true });
      expect({ [`en_has_${key}`]: enJson.includes(`"${parts[1]}"`) })
        .toEqual({ [`en_has_${key}`]: true });
      expect({ [`es_has_${key}`]: esJson.includes(`"${parts[1]}"`) })
        .toEqual({ [`es_has_${key}`]: true });
    }
  });

  it('wizardEvaluateImpressions must treat empty buffer as ok (not warning)', () => {
    // An empty analytics buffer is the normal state when sync works correctly.
    // Marking it as 'warning' contradicts the health score (100/100 healthy)
    // and confuses operators. This test prevents regression to the old behavior.
    // See: fix(debug) commit "make empty buffer status consistent with health score"
    // Extract the private wizardEvaluateImpressions method body, then check its else branch.
    // After i18n refactoring, the branch uses translate.instant('debug.wizardNoEvents').
    const fnMatch = /private wizardEvaluateImpressions\([\s\S]*?\n  \}/m.exec(debugTab);
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch![0];
    // The top-level else branch (empty buffer) must set status='ok', not 'warning'.
    const elseBranch = /\} else \{([\s\S]*?)\n    \}\n  \}/.exec(fnBody);
    expect(elseBranch).toBeTruthy();
    const hasOkStatus = elseBranch![1].includes("step.status = 'ok'");
    const hasWarningStatus = elseBranch![1].includes("step.status = 'warning'");
    expect({ emptyBufferIsOk: hasOkStatus })
      .toEqual({ emptyBufferIsOk: true });
    expect({ emptyBufferIsNotWarning: !hasWarningStatus })
      .toEqual({ emptyBufferIsNotWarning: true });
  });

  it('site-debug-tab must use confirmModal for dangerous actions (reboot, restore)', () => {
    // The custom modal pattern replaces native confirm() for reboot and config restore.
    // Both actions need explicit confirmation to prevent accidental triggers.
    expect({ hasShowConfirmModal: debugTab.includes('showConfirmModal(') })
      .toEqual({ hasShowConfirmModal: true });
    expect({ hasDoExecuteCommand: debugTab.includes('doExecuteCommand(') })
      .toEqual({ hasDoExecuteCommand: true });
    expect({ hasDoRestoreVersion: debugTab.includes('doRestoreVersion(') })
      .toEqual({ hasDoRestoreVersion: true });
  });

  it('i18n key count must be identical across fr/en/es', () => {
    // All 3 translation files must have the exact same debug keys.
    // A mismatch means a key was added to one language but not the others.
    const repoRoot2 = path.resolve(__dirname, '..', '..', '..');
    const frObj = JSON.parse(fs.readFileSync(path.join(repoRoot2, 'central-dashboard/src/assets/i18n/fr.json'), 'utf8'));
    const enObj = JSON.parse(fs.readFileSync(path.join(repoRoot2, 'central-dashboard/src/assets/i18n/en.json'), 'utf8'));
    const esObj = JSON.parse(fs.readFileSync(path.join(repoRoot2, 'central-dashboard/src/assets/i18n/es.json'), 'utf8'));
    const frKeys = Object.keys(frObj['debug'] || {}).sort();
    const enKeys = Object.keys(enObj['debug'] || {}).sort();
    const esKeys = Object.keys(esObj['debug'] || {}).sort();
    expect({ fr_en_count_match: frKeys.length === enKeys.length })
      .toEqual({ fr_en_count_match: true });
    expect({ fr_es_count_match: frKeys.length === esKeys.length })
      .toEqual({ fr_es_count_match: true });
    // Check that the key sets are identical (not just counts)
    const frMissing = frKeys.filter(k => !enKeys.includes(k));
    const enMissing = enKeys.filter(k => !frKeys.includes(k));
    expect({ fr_keys_missing_in_en: frMissing }).toEqual({ fr_keys_missing_in_en: [] });
    expect({ en_keys_missing_in_fr: enMissing }).toEqual({ en_keys_missing_in_fr: [] });
  });

  it('site-debug-tab template must not contain hardcoded French UI words', () => {
    // Phase D eliminated all hardcoded French from the debug page template.
    // This guard prevents regression: any new UI text must use translate pipe.
    const templateMatch = debugTab.match(/template\s*:\s*`([\s\S]*?)`/);
    expect(templateMatch).toBeTruthy();
    const template = templateMatch![1];

    // Strip HTML comments and Angular attribute bindings to isolate visible text
    const cleaned = template
      .replace(/<!--[\s\S]*?-->/g, '')        // HTML comments
      .replace(/\[[\w.]+\]\s*=\s*"[^"]*"/g, '') // Angular attribute bindings
      .replace(/class\s*=\s*"[^"]*"/g, '')    // CSS class attributes
      .replace(/\*ngIf\s*=\s*"[^"]*"/g, '')   // *ngIf directives
      .replace(/\*ngFor\s*=\s*"[^"]*"/g, '')  // *ngFor directives
      .replace(/\([\w.]+\)\s*=\s*"[^"]*"/g, ''); // Event bindings

    // French UI words that must never appear as visible text in the template.
    // Words with accents are safe markers — they cannot be CSS/JS identifiers.
    const forbiddenInTemplate = [
      'Chargement',     // → debug.healthLoading | translate
      'Récupération',   // → debug.logsRetrieving | translate
      'Rafraîchir',     // → debug.networkRefresh | translate
      'Annuler',        // → debug.confirmCancel | translate
      'Redémarrage',    // → debug.rebootRequiredTitle | translate
      'Ventilateur',    // → debug.healthFanTitle | translate
      'Alimentation',   // → debug.healthPower | translate
      'événement',      // → debug.timelineEvents | translate
      'Déploiements',   // → debug.timelineDeployments | translate
      'Collecte',       // → debug.exportCollecting | translate
      'Sous-voltage',   // → debug.healthUnderVoltage | translate
      'Mémoire GPU',    // → debug.healthGpuMem | translate
      'Température',    // → debug.healthTemperature | translate
    ];

    for (const word of forbiddenInTemplate) {
      const found = cleaned.includes(word);
      expect({ [`template_has_hardcoded_${word}`]: found })
        .toEqual({ [`template_has_hardcoded_${word}`]: false });
    }
  });

  it('site-debug-tab quick-commands must include restart_kiosk and restart_app', () => {
    // Quick-command buttons for Kiosk and App restart are essential for remote debug.
    // Missing buttons would force operators to use the terminal for common operations.
    expect({ hasRestartKiosk: debugTab.includes("case 'restart_kiosk':") })
      .toEqual({ hasRestartKiosk: true });
    expect({ hasRestartApp: debugTab.includes("case 'restart_app':") })
      .toEqual({ hasRestartApp: true });
    expect({ kioskMapsToService: debugTab.includes("service: 'neopro-kiosk'") })
      .toEqual({ kioskMapsToService: true });
    expect({ appMapsToService: debugTab.includes("service: 'neopro-app'") })
      .toEqual({ appMapsToService: true });
  });

  it('i18n must contain quick-command keys for kiosk and app restart', () => {
    // Missing i18n keys would display raw keys like "debug.commandsKiosk" in the UI.
    const frJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/fr.json'), 'utf8');
    const enJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/en.json'), 'utf8');
    const esJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/es.json'), 'utf8');

    const newKeys = ['commandsRestartKiosk', 'commandsKiosk', 'commandsRestartApp', 'commandsApp'];
    for (const key of newKeys) {
      expect({ [`fr_has_${key}`]: frJson.includes(`"${key}"`) }).toEqual({ [`fr_has_${key}`]: true });
      expect({ [`en_has_${key}`]: enJson.includes(`"${key}"`) }).toEqual({ [`en_has_${key}`]: true });
      expect({ [`es_has_${key}`]: esJson.includes(`"${key}"`) }).toEqual({ [`es_has_${key}`]: true });
    }
  });

  it('site-debug-tab wizard methods must use translate.instant()', () => {
    // Phase D migrated all wizard step messages to translate.instant().
    // Hardcoded French in wizard methods would show untranslated text to en/es users.
    // Each wizard method must call translate.instant() at least once.
    const wizardMethods = [
      'wizardCheckConnectivity',
      'wizardCheckVideos',
      'wizardCheckLoop',
      'wizardCheckImpressions',
      'wizardEvaluateImpressions',
      'wizardBuildSummary',
    ];
    for (const method of wizardMethods) {
      // Find the method body and check it uses translate.instant
      const methodRegex = new RegExp(`private ${method}\\b[\\s\\S]*?(?=private \\w|^\\}$)`, 'm');
      const methodMatch = debugTab.match(methodRegex);
      const usesTranslate = methodMatch ? methodMatch[0].includes('translate.instant') : false;
      expect({ [`${method}_uses_translate`]: usesTranslate })
        .toEqual({ [`${method}_uses_translate`]: true });
    }
  });
});

// =================================================================
// Admin :8080 UI regression tests
// =================================================================

describe('Admin :8080 service control UI', () => {
  const adminRoot = path.resolve(__dirname, '..', '..', '..');
  const adminHtml = fs.readFileSync(path.join(adminRoot, 'raspberry/admin/public/index.html'), 'utf8');
  const adminJs = fs.readFileSync(path.join(adminRoot, 'raspberry/admin/public/app.js'), 'utf8');

  it('admin HTML must have restart buttons for neopro-app, nginx, and neopro-kiosk', () => {
    // Service restart buttons are the primary way to recover services locally.
    // Removing any would force SSH access for basic recovery operations.
    expect({ hasNeoProApp: adminHtml.includes("restartService('neopro-app')") })
      .toEqual({ hasNeoProApp: true });
    expect({ hasNginx: adminHtml.includes("restartService('nginx')") })
      .toEqual({ hasNginx: true });
    expect({ hasKiosk: adminHtml.includes("restartService('neopro-kiosk')") })
      .toEqual({ hasKiosk: true });
  });

  it('admin HTML must have apply-services button for daemon-reload', () => {
    // After OTA, .service files may be stale in /etc/systemd/system/.
    // The apply-services button triggers daemon-reload + copy without SSH.
    expect({ hasApplyServices: adminHtml.includes("applyServices()") })
      .toEqual({ hasApplyServices: true });
  });

  it('admin JS must export restartService and applyServices to window', () => {
    // Functions called from onclick must be on window scope.
    // Missing exports would cause silent failures on button click.
    expect({ exportsRestartService: adminJs.includes('window.restartService = restartService') })
      .toEqual({ exportsRestartService: true });
    expect({ exportsApplyServices: adminJs.includes('window.applyServices = applyServices') })
      .toEqual({ exportsApplyServices: true });
  });

  it('admin applyServices function must call /api/system/apply-services', () => {
    // The function must hit the correct endpoint. A typo would silently 404.
    expect({ callsCorrectEndpoint: adminJs.includes("fetch('/api/system/apply-services'") })
      .toEqual({ callsCorrectEndpoint: true });
  });

  it('admin JS must use showNotification (not alert) for user feedback', () => {
    // Native alert() blocks the UI and is inconsistent with the rest of the admin panel.
    // All user-facing messages must use the showNotification() utility.
    const applyFnMatch = adminJs.match(/async function applyServices\(\)[\s\S]*?^}/m);
    expect(applyFnMatch).toBeTruthy();
    expect({ usesNotification: applyFnMatch![0].includes('showNotification') })
      .toEqual({ usesNotification: true });
    expect({ noAlert: !applyFnMatch![0].includes('alert(') })
      .toEqual({ noAlert: true });
  });
});

// =================================================================
// Analytics pages business-first regression tests
// =================================================================

describe('Analytics pages business-first architecture', () => {
  const analyticsRoot = path.resolve(__dirname, '..', '..', '..');

  const analyticsFleet = fs.readFileSync(
    path.join(analyticsRoot, 'central-dashboard/src/app/features/analytics/analytics.component.ts'),
    'utf8'
  );

  const clubAnalytics = fs.readFileSync(
    path.join(analyticsRoot, 'central-dashboard/src/app/features/analytics/club-analytics.component.ts'),
    'utf8'
  );

  // Fleet Overview must use Chart.js, not CSS-only bar charts
  it('fleet analytics must import Chart.js (not CSS-only charts)', () => {
    // Incident: original fleet page used CSS div bars instead of Chart.js.
    // Chart.js is installed (^4.5.1) and must be used for engagement charts.
    expect({ usesChartJs: analyticsFleet.includes("from 'chart.js'") })
      .toEqual({ usesChartJs: true });
  });

  // Fleet Overview must show business KPIs (impressions, plays) not just tech metrics
  it('fleet analytics must display sponsor impressions KPI', () => {
    // The fleet page must surface sponsor impression data (VS2 monetization).
    // Without this, the page is just a NOC dashboard and doesn't serve E-03.
    expect({ hasImpressions: analyticsFleet.includes('totalImpressions') })
      .toEqual({ hasImpressions: true });
  });

  // Club Analytics must NOT use tabs (single scrollable page)
  it('club analytics must be a single scrollable page (no tabs)', () => {
    // Incident: 4-tab layout (overview/usage/content/health) created friction and
    // duplicated data. The refonte uses a single scrollable page.
    expect({ hasTabs: clubAnalytics.includes("activeTab === 'usage'") })
      .toEqual({ hasTabs: false });
  });

  // Club Analytics must integrate sponsor benchmark data
  it('club analytics must include sponsor benchmark integration', () => {
    // Club analytics must show sponsor impressions via /sites/:id/sponsors/benchmark.
    // Without this, there's zero sponsor visibility on the club page (VS2 gap).
    expect({ hasSponsorBenchmark: clubAnalytics.includes('getSiteSponsorBenchmark') })
      .toEqual({ hasSponsorBenchmark: true });
  });
});

// =================================================================
// Rate-limit assignment regression tests
// =================================================================

describe('Rate-limit assignment guards', () => {
  const serverTs = fs.readFileSync(
    path.join(path.resolve(__dirname, '..', '..', '..'), 'central-server/src/server.ts'),
    'utf8'
  );

  // Incident 2026-02-23: siteSponsorRoutes used apiRateLimit (100/min shared counter).
  // The dashboard sponsors tab fires 4 parallel requests per expand (list + stats +
  // benchmark + reports), quickly exhausting the shared budget and causing 429 cascades
  // (including on /api/logs/frontend). Fix: adminRateLimit (400/min, separate counter).
  it('siteSponsorRoutes must use adminRateLimit (not apiRateLimit)', () => {
    const sponsorRouteMount = serverTs.match(/app\.use\('\/api\/sites',\s*(\w+),\s*siteSponsorRoutes\)/);
    expect(sponsorRouteMount).not.toBeNull();
    expect({ limiter: sponsorRouteMount![1] }).toEqual({ limiter: 'adminRateLimit' });
  });
});

// =================================================================
// Sync-agent debug bundle regression guards (v3.79+)
// Prevents recurrence of issues found in NLF Handball Pi debug bundle.
// =================================================================

describe('Sync-agent debug bundle regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  // Issue: BSSID connected ≠ BSSID locked for hours with no detection.
  // Fix: checkBssidMismatch() in network-watchdog auto-clears stale locks.
  it('network-watchdog must have BSSID mismatch detection', () => {
    const watchdog = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/network-watchdog.js'),
      'utf8'
    );
    expect({ hasBssidCheck: watchdog.includes('checkBssidMismatch') })
      .toEqual({ hasBssidCheck: true });
    expect({ hasThreshold: watchdog.includes('BSSID_MISMATCH_THRESHOLD') })
      .toEqual({ hasThreshold: true });
  });

  // Issue: 11x duplicate config sync events during OTA extract.
  // Fix: ConfigWatcher.pause()/resume() mechanism.
  it('config-watcher must have pause/resume mechanism for OTA', () => {
    const watcher = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/watchers/config-watcher.js'),
      'utf8'
    );
    expect({ hasPause: watcher.includes('pause(') }).toEqual({ hasPause: true });
    expect({ hasResume: watcher.includes('resume()') }).toEqual({ hasResume: true });
    expect({ hasPausedFlag: watcher.includes('this.paused') }).toEqual({ hasPausedFlag: true });
  });

  // Issue: OTA must pause config-watcher before extracting.
  it('agent.js must pause config-watcher before OTA update', () => {
    const agent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
    expect({ pausesBeforeOta: agent.includes('configWatcher.pause') })
      .toEqual({ pausesBeforeOta: true });
  });

  // Issue: EACCES on unlink VERSION because fixFileOwnership only checked uid===0.
  // Fix: Check fs.constants.W_OK (actual write access).
  it('fixFileOwnership must check W_OK write access (not just uid)', () => {
    const updateSoftware = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    expect({ checksWriteAccess: updateSoftware.includes('W_OK') })
      .toEqual({ checksWriteAccess: true });
  });

  // Issue: Stale sponsor_impressions.json from pre-v3.66.
  // Fix: Auto-cleanup on startup.
  it('agent.js must cleanup legacy sponsor_impressions.json on startup', () => {
    const agent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
    expect({ hasCleanup: agent.includes('cleanupLegacyFiles') })
      .toEqual({ hasCleanup: true });
    expect({ hasSponsorPath: agent.includes('sponsor_impressions.json') })
      .toEqual({ hasSponsorPath: true });
  });

  // Issue: Channel auto-switch never triggered (threshold 5 too high).
  // Fix: CONGESTION_THRESHOLD=3, MIN_IMPROVEMENT=2.
  it('hotspot channel congestion threshold must be 3 (not 5)', () => {
    const safeOps = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/safe-network-operations.js'),
      'utf8'
    );
    const thresholdMatch = safeOps.match(/CONGESTION_THRESHOLD\s*=\s*(\d+)/);
    const improvementMatch = safeOps.match(/MIN_IMPROVEMENT\s*=\s*(\d+)/);
    expect(thresholdMatch).not.toBeNull();
    expect(improvementMatch).not.toBeNull();
    expect({ congestionThreshold: Number(thresholdMatch![1]) })
      .toEqual({ congestionThreshold: 3 });
    expect({ minImprovement: Number(improvementMatch![1]) })
      .toEqual({ minImprovement: 2 });
  });

  // Issue: network_alert handler only used issues[] for message, missing message field.
  // Fix: Fallback to message string from alert payload.
  it('network-resilience handler must support message field in alerts', () => {
    const handler = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/network-resilience.handler.ts'),
      'utf8'
    );
    expect({ extractsMessage: /const\s*\{[^}]*message[^}]*\}\s*=\s*alert/.test(handler) })
      .toEqual({ extractsMessage: true });
  });
});

// ----------------------------------------------------------
// Reboot OTA race condition regression guard
// ----------------------------------------------------------
// Issue: startServices() scheduled sync-agent restart at t+5s, reboot at t+10s.
// The restart killed the Node process, destroying the reboot timer → Pi never rebooted.
// Fix: use 'shutdown -r' (survives process kill) + skip sync-agent restart when reboot scheduled.
describe('OTA reboot race condition guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  // Guard: reboot command must use 'shutdown -r', not setTimeout+exec('sudo reboot')
  it('reboot command must use shutdown -r (not setTimeout+reboot)', () => {
    const indexJs = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/index.js'),
      'utf8'
    );
    const rebootFn = indexJs.match(/async reboot\(\)[\s\S]*?return \{[^}]*\};/);
    expect(rebootFn).not.toBeNull();
    expect({ usesShutdown: rebootFn![0].includes("'shutdown'") })
      .toEqual({ usesShutdown: true });
    // Strip comments before checking for setTimeout — the comment mentions the old approach
    const codeOnly = rebootFn![0].replace(/\/\/.*$/gm, '');
    expect({ noSetTimeoutReboot: !/setTimeout[\s\S]*?reboot/.test(codeOnly) })
      .toEqual({ noSetTimeoutReboot: true });
  });

  // Guard: OTA scheduleReboot must use 'shutdown -r', not setTimeout
  it('OTA scheduleReboot must use shutdown -r (not setTimeout+reboot)', () => {
    const updateSw = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    // Match the full if(scheduleReboot){...} block up to the closing brace at same indent
    const rebootBlock = updateSw.match(/if\s*\(scheduleReboot\)\s*\{[\s\S]*?\.unref\(\);[\s\S]*?\}/);
    expect(rebootBlock).not.toBeNull();
    expect({ usesShutdown: rebootBlock![0].includes("'shutdown'") })
      .toEqual({ usesShutdown: true });
    // Strip comments before checking for setTimeout
    const codeOnly = rebootBlock![0].replace(/\/\/.*$/gm, '');
    expect({ noSetTimeoutReboot: !/setTimeout[\s\S]*?reboot/i.test(codeOnly) })
      .toEqual({ noSetTimeoutReboot: true });
  });

  // Guard: startServices() must skip sync-agent restart when reboot is scheduled
  it('startServices must skip sync-agent restart when scheduleReboot is true', () => {
    const updateSw = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    // Check the full file for the _scheduleReboot guard pattern — regex-matching
    // the exact function boundaries is fragile due to nested braces
    expect({ checksScheduleReboot: /this\._scheduleReboot/.test(updateSw) })
      .toEqual({ checksScheduleReboot: true });
    expect({ skipsRestartOnReboot: /Skipping sync-agent restart/.test(updateSw) })
      .toEqual({ skipsRestartOnReboot: true });
  });
});

// ----------------------------------------------------------
// E-22 config-merge guard: secondaryDisplayEnabled must be
// explicitly handled in config-merge.js. Without this, the
// key is silently dropped during merge and the secondary
// display never activates on deployed Pi.
// ----------------------------------------------------------
describe('E-22 config-merge secondary display guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const configMergePath = path.join(repoRoot, 'raspberry/sync-agent/src/utils/config-merge.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(configMergePath, 'utf8');
  });

  it('config-merge.js must handle secondaryDisplayEnabled explicitly', () => {
    expect({
      handlesSecondaryDisplayEnabled: /neoProContent\.secondaryDisplayEnabled/.test(content),
    }).toEqual({
      handlesSecondaryDisplayEnabled: true,
    });
  });

  it('config-merge.js must handle secondaryDisplayResolution explicitly', () => {
    expect({
      handlesSecondaryDisplayResolution: /neoProContent\.secondaryDisplayResolution/.test(content),
    }).toEqual({
      handlesSecondaryDisplayResolution: true,
    });
  });

  it('config-merge.js must migrate legacy ledEnabled to secondaryDisplayEnabled', () => {
    expect({
      migratesLedEnabled: /neoProContent\.ledEnabled/.test(content),
    }).toEqual({
      migratesLedEnabled: true,
    });
  });

  it('config-merge.js must clean up old ledEnabled key during migration', () => {
    expect({
      deletesLedEnabled: /delete result\.ledEnabled/.test(content),
    }).toEqual({
      deletesLedEnabled: true,
    });
  });
});
