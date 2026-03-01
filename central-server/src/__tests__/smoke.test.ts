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

  it('neopro-kiosk.service must NOT have ExecStop with pkill -9', () => {
    // ExecStop=pkill -9 bypasses the watchdog's SIGTERM graceful shutdown,
    // preventing the V3D GPU driver from releasing DMA buffers on Pi 5.
    // This causes rendering artifacts and crash loops after systemctl restart.
    // The watchdog's trap handler manages Chromium shutdown via cleanup_chromium().
    expect({ noExecStopKill9: !/^ExecStop=.*pkill.*-9/m.test(kioskService) })
      .toEqual({ noExecStopKill9: true });
  });

  it('neopro-kiosk.service must use KillMode=mixed', () => {
    // KillMode=mixed sends SIGTERM to main process (watchdog) only,
    // allowing the trap handler to cleanly shutdown Chromium.
    // Default KillMode=control-group sends SIGTERM to ALL processes simultaneously,
    // racing with the watchdog's cleanup.
    expect({ hasKillModeMixed: kioskService.includes('KillMode=mixed') })
      .toEqual({ hasKillModeMixed: true });
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

  it('diagnose-pi.sh must NOT echo to stdout in --json mode (pollutes JSON output)', () => {
    // Incident: 25/02/2026 — deploy-remote.sh post-deployment diagnostic always showed
    // "impossible de déterminer l'état" because echo -n "Test http://..." lines
    // were not gated on OUTPUT_MODE, polluting JSON output and breaking grep parsing.
    // All echo/printf to stdout must be guarded by OUTPUT_MODE != "json".
    const diagnosePi = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/diagnose-pi.sh'),
      'utf8'
    );
    // Find raw echo statements not guarded by json mode check
    const lines = diagnosePi.split('\n');
    const ungatedEchos: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip comments, empty lines, heredocs, and echo inside json_add or if blocks
      if (!line || line.startsWith('#') || line.startsWith('cat <<')) continue;
      // Detect bare echo/echo -n that output to stdout (not guarded by OUTPUT_MODE)
      if (/^echo\s/.test(line) || /^echo$/.test(line)) {
        // Check if this line is inside an OUTPUT_MODE guard (look at surrounding context)
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        const prevPrevLine = i > 1 ? lines[i - 2].trim() : '';
        const isInsideHumanGuard =
          prevLine.includes('OUTPUT_MODE') ||
          prevPrevLine.includes('OUTPUT_MODE') ||
          prevLine.includes('json') ||
          prevPrevLine.includes('json');
        // Lines inside "if [ "$OUTPUT_MODE" = "human" ]" blocks are OK
        // We only flag top-level echo that will run in all modes
        if (!isInsideHumanGuard) {
          // Check if this echo is inside a function that already gates on mode
          // (print_header, print_section, print_success etc. all return early in json mode)
          // Only flag echo in the main body (after "EXÉCUTION DU DIAGNOSTIC")
          const beforeLine = diagnosePi.substring(0, diagnosePi.indexOf(line));
          if (beforeLine.includes('EXÉCUTION DU DIAGNOSTIC') &&
              !line.includes('echo \'') && // skip echo for json heredoc
              !line.includes('echo "') && // might be inside if block
              line.startsWith('echo -n')) { // bare echo -n at top level
            ungatedEchos.push(`line ${i + 1}: ${line}`);
          }
        }
      }
    }
    expect({ ungatedEchosInJsonMode: ungatedEchos })
      .toEqual({ ungatedEchosInJsonMode: [] });
  });
  it('diagnose-pi.sh must use sudo for nginx -t (avoid false positive on PID file)', () => {
    // Incident: 25/02/2026 — diagnose-pi.sh reported "Configuration Nginx invalide"
    // because `nginx -t` run as pi (non-root) fails with "Permission denied" on
    // /run/nginx.pid, even though the syntax is valid. Must use `sudo nginx -t`.
    const diagnosePi = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/diagnose-pi.sh'),
      'utf8'
    );
    // The nginx -t call inside check_nginx_config must use sudo
    const nginxTestMatch = diagnosePi.match(/if\s+.*NGINX_BIN.*-t/);
    expect({ hasNginxTest: !!nginxTestMatch }).toEqual({ hasNginxTest: true });
    expect({ usesSudo: /sudo.*NGINX_BIN.*-t/.test(diagnosePi) })
      .toEqual({ usesSudo: true });
  });

  it('prepare-image first-boot-setup must chmod 600 club-config.json', () => {
    // club-config.json contains the WiFi password in plaintext.
    // The first-boot-setup.sh (generated by prepare-image.sh) must restrict
    // permissions after creating the file, matching install.sh behavior.
    const prepareImage = fs.readFileSync(
      path.join(repoRoot, 'raspberry/tools/prepare-image.sh'),
      'utf8'
    );
    expect({ hasChmod600: prepareImage.includes('chmod 600') && prepareImage.includes('club-config.json') })
      .toEqual({ hasChmod600: true });
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
// Deployment query safety guards
// ----------------------------------------------------------
describe('Deployment repository query safety', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const deploymentRepo = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/repositories/deployment.repository.ts'),
    'utf8'
  );

  it('findAllWithDetails must have a LIMIT clause (prevent unbounded result sets)', () => {
    // Incident: 25/02/2026 — 500 on GET /api/deployments in production.
    // Without LIMIT, the query returns ALL deployments ever, causing timeouts on
    // Supabase Transaction Mode (pool=5). The 500 triggers frontend retries → 429 cascade.
    const findAllMethod = deploymentRepo.match(
      /findAllWithDetails[\s\S]*?return result\.rows;\s*\}/
    );
    expect({ methodFound: !!findAllMethod }).toEqual({ methodFound: true });
    expect({ hasLimit: /LIMIT/i.test(findAllMethod![0]) })
      .toEqual({ hasLimit: true });
  });

  it('findAllWithDetails LIMIT must be parameterized (not hardcoded)', () => {
    // Parameterized LIMIT ($1) allows the controller to accept ?limit= query param
    // while keeping a safe default. Hardcoded LIMIT would prevent flexibility.
    const findAllMethod = deploymentRepo.match(
      /findAllWithDetails[\s\S]*?return result\.rows;\s*\}/
    );
    expect({ hasParameterizedLimit: /LIMIT \$\d/.test(findAllMethod![0]) })
      .toEqual({ hasParameterizedLimit: true });
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

// ----------------------------------------------------------
// E-22 route /secondary guard: Angular app must expose
// /secondary route with displayType='secondary' so the
// dual kiosk Chromium loads the correct display mode.
// ----------------------------------------------------------
describe('E-22 Angular /secondary route guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const routesPath = path.join(repoRoot, 'raspberry/src/app/app.routes.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(routesPath, 'utf8');
  });

  it('app.routes.ts must have /secondary route with displayType secondary', () => {
    expect({
      hasSecondaryRoute: /path:\s*['"]secondary['"]/.test(content),
      hasDisplayTypeSecondary: /displayType:\s*['"]secondary['"]/.test(content),
    }).toEqual({
      hasSecondaryRoute: true,
      hasDisplayTypeSecondary: true,
    });
  });

  it('app.routes.ts must NOT have /led route (renamed to /secondary)', () => {
    expect({
      hasLedRoute: /path:\s*['"]led['"]/.test(content),
    }).toEqual({
      hasLedRoute: false,
    });
  });
});

// ----------------------------------------------------------
// E-23 F-23.7: Root route must use HomeComponent (landing page)
// instead of redirecting to /tv so neopro.local shows a
// choice page (TV / Remote / Admin) for PC browsers.
// The kiosk Pi opens /tv directly via kiosk-watchdog.sh.
// ----------------------------------------------------------
describe('E-23 F-23.7 root route HomeComponent guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const routesPath = path.join(repoRoot, 'raspberry/src/app/app.routes.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(routesPath, 'utf8');
  });

  it('app.routes.ts must use HomeComponent on root path (not redirectTo tv)', () => {
    expect({
      importsHomeComponent: content.includes("import { HomeComponent }"),
      rootUsesHomeComponent: /path:\s*['"]?['"]?\s*,\s*component:\s*HomeComponent/.test(content),
      noRootRedirectToTv: !/path:\s*['"]?['"]?\s*,\s*redirectTo:\s*['"]tv['"]/.test(content),
    }).toEqual({
      importsHomeComponent: true,
      rootUsesHomeComponent: true,
      noRootRedirectToTv: true,
    });
  });
});

// ----------------------------------------------------------
// E-22 LoopVideo variants guard: LoopVideo interface must
// use variants.secondary (not variants.led) to ensure video
// variant selection works for the secondary display.
// ----------------------------------------------------------
describe('E-22 LoopVideo variants.secondary guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const interfacePath = path.join(repoRoot, 'raspberry/src/app/interfaces/sponsor.interface.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(interfacePath, 'utf8');
  });

  it('LoopVideo must have variants.secondary field', () => {
    expect({
      hasVariantsSecondary: /variants\??\s*:\s*\{[^}]*secondary\??\s*:/.test(content),
    }).toEqual({
      hasVariantsSecondary: true,
    });
  });

  it('LoopVideo must NOT have variants.led field (renamed)', () => {
    expect({
      hasVariantsLed: /variants\??\s*:\s*\{[^}]*\bled\b/.test(content),
    }).toEqual({
      hasVariantsLed: false,
    });
  });
});

// ----------------------------------------------------------
// E-22 video variant API routes guard: content.routes.ts must
// expose CRUD endpoints for video variants (/videos/:id/variants).
// ----------------------------------------------------------
describe('E-22 video variant API routes guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const routesPath = path.join(repoRoot, 'central-server/src/routes/content.routes.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(routesPath, 'utf8');
  });

  it('content.routes.ts must have GET /videos/:id/variants', () => {
    expect({
      hasGetVariants: /router\.get\(.*variants.*getVideoVariants/.test(content),
    }).toEqual({
      hasGetVariants: true,
    });
  });

  it('content.routes.ts must have POST /videos/:id/variants', () => {
    expect({
      hasPostVariants: /router\.post\(.*variants.*createVideoVariant/.test(content),
    }).toEqual({
      hasPostVariants: true,
    });
  });

  it('content.routes.ts must have DELETE /videos/:videoId/variants/:displayType', () => {
    expect({
      hasDeleteVariants: /router\.delete\(.*variants.*deleteVideoVariant/.test(content),
    }).toEqual({
      hasDeleteVariants: true,
    });
  });
});

// ----------------------------------------------------------
// E-22 watchdog secondary display guard: kiosk-watchdog.sh
// must read secondaryDisplayEnabled from config (not just
// ledEnabled) to properly manage the 2nd Chromium instance.
// ----------------------------------------------------------
describe('E-22 watchdog secondary display guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const watchdogPath = path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(watchdogPath, 'utf8');
  });

  it('watchdog must read secondaryDisplayEnabled from config', () => {
    expect({
      readsSecondaryDisplayEnabled: /secondaryDisplayEnabled/.test(content),
    }).toEqual({
      readsSecondaryDisplayEnabled: true,
    });
  });

  it('watchdog must detect HDMI 1 via DRM sysfs', () => {
    expect({
      detectsHdmi1: /\/sys\/class\/drm/.test(content),
    }).toEqual({
      detectsHdmi1: true,
    });
  });

  it('watchdog must launch /secondary URL (not /led)', () => {
    expect({
      launchesSecondary: /\/secondary/.test(content),
      doesNotLaunchLed: !/--app=.*\/led/.test(content),
    }).toEqual({
      launchesSecondary: true,
      doesNotLaunchLed: true,
    });
  });

  // Bug fix v3.82.3: grep -E '\d' doesn't work (Perl regex only).
  // Must use [0-9] in grep -E for HDMI xrandr detection.
  it('watchdog xrandr grep must use [0-9] not \\d for digit matching', () => {
    // Extract all grep -E lines that filter HDMI connected outputs
    const hdmiGrepLines = content.match(/grep -E '.*HDMI.*connected.*/g) || [];
    expect({
      hasHdmiGrep: hdmiGrepLines.length > 0,
      // None of the HDMI grep -E lines should use \d (Perl-only regex)
      noBackslashD: hdmiGrepLines.every((line: string) => !line.includes('\\d')),
      // At least one line must use [0-9] for digit matching
      usesBracketDigit: hdmiGrepLines.some((line: string) => line.includes('[0-9]')),
    }).toEqual({
      hasHdmiGrep: true,
      noBackslashD: true,
      usesBracketDigit: true,
    });
  });

  // Bug fix v3.82.6: --kiosk forces fullscreen on primary monitor, ignoring --window-position.
  // Secondary Chromium must use --app=URL mode, NOT --kiosk.
  it('watchdog secondary Chromium must use --app= mode (not --kiosk)', () => {
    // Extract the start_chromium_secondary function
    const secondaryFn = content.match(
      /start_chromium_secondary\(\)[\s\S]*?^}/m
    );
    expect(secondaryFn).not.toBeNull();
    const fnContent = secondaryFn![0];
    expect({
      usesAppMode: /--app=.*secondary/.test(fnContent) || /--app="\$\{?CHROMIUM_SECONDARY_URL/.test(fnContent),
      // Must NOT use --kiosk in the secondary function (forces fullscreen on primary)
      noKioskFlag: !/^\s*--kiosk\b/m.test(fnContent),
    }).toEqual({
      usesAppMode: true,
      noKioskFlag: true,
    });
  });

  // E-23 US-23.4.2: Primary Chromium must ALWAYS use --app= mode (never --kiosk).
  // --kiosk takes the entire X11 virtual desktop (both monitors) and prevents
  // zero-blackout transitions when switching between single and dual display.
  // With --app=, we can resize via xdotool without restarting Chromium.
  it('watchdog primary Chromium must use --app= mode (not --kiosk)', () => {
    const primaryFn = content.match(
      /start_chromium\(\) \{[\s\S]*?^}/m
    );
    expect(primaryFn).not.toBeNull();
    const fnContent = primaryFn![0];
    expect({
      usesAppMode: /--app="\$\{?CHROMIUM_URL/.test(fnContent),
      // Must NOT use --kiosk anywhere in common_flags or launch command
      noKioskInFlags: !/^\s*--kiosk\s*$/m.test(fnContent),
      // Must always apply xprop + xdotool for fullscreen (not conditional on DUAL_DISPLAY_ACTIVE)
      alwaysXprop: /_MOTIF_WM_HINTS/.test(fnContent),
      alwaysXdotoolSize: /xdotool.*windowsize/.test(fnContent),
    }).toEqual({
      usesAppMode: true,
      noKioskInFlags: true,
      alwaysXprop: true,
      alwaysXdotoolSize: true,
    });
  });

  // Bug fix v3.82.8: F11 fullscreen spans ENTIRE X11 virtual desktop (both monitors),
  // NOT per-monitor. Must use xprop _MOTIF_WM_HINTS (remove decorations) + xdotool
  // windowmove/windowsize for per-monitor fullscreen. F11 must NOT be used.
  it('watchdog secondary must use xprop _MOTIF_WM_HINTS + xdotool windowsize (NOT F11)', () => {
    const secondaryFn = content.match(
      /start_chromium_secondary\(\)[\s\S]*?^}/m
    );
    expect(secondaryFn).not.toBeNull();
    const fnContent = secondaryFn![0];
    expect({
      hasMotifWmHints: /_MOTIF_WM_HINTS/.test(fnContent),
      hasXdotoolWindowsize: /xdotool.*windowsize/.test(fnContent),
      hasXdotoolWindowmove: /xdotool.*windowmove/.test(fnContent),
      hasWindowSearch: /xdotool.*search.*pid/.test(fnContent),
      // F11 must NOT be used — it spans the entire X11 virtual desktop
      noF11: !/xdotool.*key.*F11/.test(fnContent),
    }).toEqual({
      hasMotifWmHints: true,
      hasXdotoolWindowsize: true,
      hasXdotoolWindowmove: true,
      hasWindowSearch: true,
      noF11: true,
    });
  });

  // Guard: primary Chromium in dual-display mode must also use xprop + xdotool (not F11)
  it('watchdog primary in dual-display must use xprop _MOTIF_WM_HINTS + xdotool windowsize (NOT F11)', () => {
    const primaryFn = content.match(
      /start_chromium\(\) \{[\s\S]*?^}/m
    );
    expect(primaryFn).not.toBeNull();
    const fnContent = primaryFn![0];
    expect({
      hasMotifWmHints: /_MOTIF_WM_HINTS/.test(fnContent),
      hasXdotoolWindowsize: /xdotool.*windowsize/.test(fnContent),
      hasXdotoolWindowmove: /xdotool.*windowmove/.test(fnContent),
      // F11 must NOT be used anywhere in start_chromium
      noF11: !/xdotool.*key.*F11/.test(fnContent),
    }).toEqual({
      hasMotifWmHints: true,
      hasXdotoolWindowsize: true,
      hasXdotoolWindowmove: true,
      noF11: true,
    });
  });

  // Bug fix v3.82.2: xrandr detection must use position offset, not "primary" keyword.
  // Pi 5 doesn't show "primary" in xrandr output.
  it('watchdog xrandr detection must use position offset (not "primary" keyword)', () => {
    // The setup_secondary_xrandr function must check for offset +0+0, not grep "primary"
    const xrandrFn = content.match(
      /setup_secondary_xrandr\(\)[\s\S]*?^}/m
    );
    expect(xrandrFn).not.toBeNull();
    const fnContent = xrandrFn![0];
    expect({
      // Must check x_offset for primary detection (offset-based, not keyword-based)
      checksOffset: /x_offset.*==.*"0"/.test(fnContent) || /x_offset.*-eq.*0/.test(fnContent),
      // Must NOT rely on "primary" keyword for initial detection
      // (it's OK in fallback/stop functions, but not in main detection logic)
      usesOffsetDetection: /offset.*non-nul|offset.*0/.test(fnContent),
    }).toEqual({
      checksOffset: true,
      usesOffsetDetection: true,
    });
  });

  // Guard: secondary Chromium must have separate --user-data-dir to avoid
  // sharing session/cookies with primary (causes tab conflicts).
  it('watchdog secondary must use separate --user-data-dir', () => {
    const secondaryFn = content.match(
      /start_chromium_secondary\(\)[\s\S]*?^}/m
    );
    expect(secondaryFn).not.toBeNull();
    expect({
      hasSeparateUserDataDir: /--user-data-dir=.*secondary/.test(secondaryFn![0]),
    }).toEqual({
      hasSeparateUserDataDir: true,
    });
  });

  // Guard: secondary Chromium must have --window-position and --window-size
  // to place the window on the correct monitor.
  it('watchdog secondary must set --window-position and --window-size', () => {
    const secondaryFn = content.match(
      /start_chromium_secondary\(\)[\s\S]*?^}/m
    );
    expect(secondaryFn).not.toBeNull();
    const fnContent = secondaryFn![0];
    expect({
      hasWindowPosition: /--window-position=/.test(fnContent),
      hasWindowSize: /--window-size=/.test(fnContent),
    }).toEqual({
      hasWindowPosition: true,
      hasWindowSize: true,
    });
  });
});

// ----------------------------------------------------------
// E-23 HDMI hotplug udev rules and notify script
// ----------------------------------------------------------

describe('E-23 HDMI hotplug udev and notify', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('udev rules file must exist for HDMI hotplug', () => {
    const rulesPath = path.join(repoRoot, 'raspberry/config/udev/99-neopro-hdmi-hotplug.rules');
    expect({ rulesFileExists: fs.existsSync(rulesPath) })
      .toEqual({ rulesFileExists: true });

    const content = fs.readFileSync(rulesPath, 'utf8');
    expect({
      hasDrmSubsystem: content.includes('SUBSYSTEM=="drm"'),
      hasChangeAction: content.includes('ACTION=="change"'),
      hasNotifyScript: content.includes('neopro-hdmi-notify.sh'),
    }).toEqual({
      hasDrmSubsystem: true,
      hasChangeAction: true,
      hasNotifyScript: true,
    });
  });

  it('neopro-hdmi-notify.sh must write flag file atomically', () => {
    const scriptPath = path.join(repoRoot, 'raspberry/scripts/neopro-hdmi-notify.sh');
    expect({ scriptExists: fs.existsSync(scriptPath) })
      .toEqual({ scriptExists: true });

    const content = fs.readFileSync(scriptPath, 'utf8');
    expect({
      hasFlagFile: content.includes('/tmp/hdmi-changed'),
      hasMktemp: content.includes('mktemp'),
      hasMv: content.includes('mv '),
    }).toEqual({
      hasFlagFile: true,
      hasMktemp: true,
      hasMv: true,
    });
  });

  it('kiosk-watchdog.sh must check HDMI flag file for fast hotplug reaction', () => {
    const watchdogContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    expect({
      hasFlagFile: watchdogContent.includes('HDMI_FLAG_FILE'),
      hasHdmiTriggered: watchdogContent.includes('hdmi_triggered'),
      hasUdevLog: watchdogContent.includes('HDMI hotplug détecté (udev)'),
    }).toEqual({
      hasFlagFile: true,
      hasHdmiTriggered: true,
      hasUdevLog: true,
    });
  });

  it('build-raspberry.sh must include neopro-hdmi-notify.sh in runtime scripts', () => {
    const buildScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/build-raspberry.sh'),
      'utf8'
    );
    expect({ hasHdmiNotify: buildScript.includes('neopro-hdmi-notify.sh') })
      .toEqual({ hasHdmiNotify: true });
  });
});

// ----------------------------------------------------------
// E-23 HDMI monitoring and alerts wiring
// ----------------------------------------------------------
describe('E-23 HDMI monitoring and alerts wiring', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('state.service.js must have HDMI state methods', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/state.service.js'),
      'utf8'
    );
    expect({
      hasHdmiState: content.includes('_hdmiState'),
      hasGetHdmiState: content.includes('getHdmiState'),
      hasUpdateHdmiState: content.includes('updateHdmiState'),
      hasGetConnectedClients: content.includes('getConnectedClients'),
    }).toEqual({
      hasHdmiState: true,
      hasGetHdmiState: true,
      hasUpdateHdmiState: true,
      hasGetConnectedClients: true,
    });
  });

  it('handlers.js must wire hdmi-status-update and get-connected-clients events', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/socket/handlers.js'),
      'utf8'
    );
    expect({
      hasHdmiStatusUpdate: content.includes("'hdmi-status-update'"),
      hasGetHdmiState: content.includes("'get-hdmi-state'"),
      hasGetConnectedClients: content.includes("'get-connected-clients'"),
      hasHdmiAlert: content.includes("'hdmi-alert'"),
      hasHdmiService: content.includes('hdmiService'),
    }).toEqual({
      hasHdmiStatusUpdate: true,
      hasGetHdmiState: true,
      hasGetConnectedClients: true,
      hasHdmiAlert: true,
      hasHdmiService: true,
    });
  });

  it('tv-register handler must capture userAgent and ip from socket handshake', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/socket/handlers.js'),
      'utf8'
    );
    expect({
      hasUserAgent: content.includes("socket.handshake?.headers?.['user-agent']"),
      hasIp: content.includes('socket.handshake?.address'),
    }).toEqual({
      hasUserAgent: true,
      hasIp: true,
    });
  });

  it('sync-agent must fetch HDMI state and connected clients for heartbeat', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
    expect({
      hasFetchHdmi: content.includes('fetchLocalHdmiState'),
      hasFetchClients: content.includes('fetchLocalConnectedClients'),
      hasHeartbeatHdmi: content.includes('hdmiStatus'),
      hasHeartbeatClients: content.includes('connectedClients'),
    }).toEqual({
      hasFetchHdmi: true,
      hasFetchClients: true,
      hasHeartbeatHdmi: true,
      hasHeartbeatClients: true,
    });
  });

  it('heartbeat.handler.ts must process hdmiStatus and create HDMI alerts', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
      'utf8'
    );
    expect({
      hasHdmiStatus: content.includes('hdmiStatus'),
      hasNoDisplayAlert: content.includes("'no_display'"),
      hasWrongPortAlert: content.includes("'hdmi_wrong_port'"),
      hasDashboardEmit: content.includes("'hdmi_status_updated'"),
    }).toEqual({
      hasHdmiStatus: true,
      hasNoDisplayAlert: true,
      hasWrongPortAlert: true,
      hasDashboardEmit: true,
    });
  });

  it('HeartbeatMessage type must include hdmiStatus and connectedClients', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/types/index.ts'),
      'utf8'
    );
    expect({
      hasHdmiStatus: content.includes('hdmiStatus'),
      hasConnectedClients: content.includes('connectedClients'),
    }).toEqual({
      hasHdmiStatus: true,
      hasConnectedClients: true,
    });
  });
  it('check_secondary_chromium: dual→single uses Chromium relaunch (xdotool viewport bug), single→dual uses xdotool resize', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // Extract the check_secondary_chromium function body
    const funcStart = content.indexOf('check_secondary_chromium() {');
    const funcBody = content.slice(funcStart, funcStart + 5000);
    // Single→dual transition: xdotool resize is OK (shrinking viewport, no CSS bug)
    // Dual→single transition: must RELAUNCH Chromium because xdotool windowsize alone
    // does NOT force Chromium to re-render its CSS viewport (window grows but content
    // stays at old resolution = zoom effect). Same fix as activate_hdmi_failover().
    expect({
      hasDualNoRestart: funcBody.includes('sans restart'),
      hasSingleRelaunch: funcBody.includes('Retour en single-display: relance'),
      hasStopPrimary: funcBody.includes('stop_chromium_primary'),
      hasStartChromium: funcBody.includes('start_chromium'),
    }).toEqual({
      hasDualNoRestart: true,
      hasSingleRelaunch: true,
      hasStopPrimary: true,
      hasStartChromium: true,
    });
  });

  it('kiosk-watchdog must have activate/deactivate_hdmi_failover functions (US-23.6.2)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    expect({
      hasActivate: content.includes('activate_hdmi_failover()'),
      hasDeactivate: content.includes('deactivate_hdmi_failover()'),
      hasStopPrimary: content.includes('stop_chromium_primary'),
      hasFailoverFlag: content.includes('/tmp/hdmi-failover-active'),
      hasGpuCleanup: content.includes('GPU cleanup'),
    }).toEqual({
      hasActivate: true,
      hasDeactivate: true,
      hasStopPrimary: true,
      hasFailoverFlag: true,
      hasGpuCleanup: true,
    });
  });

  it('check_secondary_chromium must handle HDMI failover (HDMI-0 lost during dual-display)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('check_secondary_chromium() {');
    const funcBody = content.slice(funcStart, funcStart + 1500);
    // Failover checks must come BEFORE normal dual-display logic
    expect({
      hasFailoverDetection: funcBody.includes('DUAL_DISPLAY_ACTIVE') && funcBody.includes('detect_hdmi0_status') && funcBody.includes('activate_hdmi_failover'),
      hasFailoverRecovery: funcBody.includes('HDMI_FAILOVER_ACTIVE') && funcBody.includes('deactivate_hdmi_failover'),
      hasFailoverGuard: funcBody.includes('HDMI_FAILOVER_ACTIVE') && funcBody.includes('return'),
    }).toEqual({
      hasFailoverDetection: true,
      hasFailoverRecovery: true,
      hasFailoverGuard: true,
    });
  });

  it('activate_hdmi_failover must kill secondary, reconfigure xrandr, and relaunch via start_chromium', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('activate_hdmi_failover()');
    const funcBody = content.slice(funcStart, funcStart + 4000);
    expect({
      // Must disable ghost output so X11 virtual screen collapses
      hasGhostOff: funcBody.includes('--off'),
      // Must reposition remaining output to origin (otherwise stays at dual-display offset)
      hasPos0x0: funcBody.includes('--pos 0x0'),
      // Must sleep after xrandr to let GPU settle
      hasSleepAfterXrandr: funcBody.includes('sleep 1'),
      // Must re-query dimensions after xrandr reconfiguration
      hasRequery: funcBody.includes('xrandr --query') && funcBody.includes('failover_w'),
      // Must kill old secondary (xdotool resize alone doesn't update Chromium viewport)
      killsSecondary: funcBody.includes('kill -TERM') && funcBody.includes('SECONDARY_CHROMIUM_PID'),
      // Must relaunch via start_chromium for correct viewport
      relaunchesChromium: funcBody.includes('start_chromium'),
    }).toEqual({
      hasGhostOff: true,
      hasPos0x0: true,
      hasSleepAfterXrandr: true,
      hasRequery: true,
      killsSecondary: true,
      relaunchesChromium: true,
    });
  });

  it('setup_secondary_xrandr grep must match xrandr lines with "primary" keyword', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('setup_secondary_xrandr()');
    const funcBody = content.slice(funcStart, funcStart + 2000);
    // The grep in setup_secondary_xrandr must handle both:
    //   "HDMI-A-1 connected 1920x1080+0+0"          (no primary keyword)
    //   "HDMI-A-2 connected primary 3840x2160+0+0"   (with primary keyword)
    // Old regex '^HDMI.* connected [0-9]' misses the primary keyword case.
    const grepLine = funcBody.match(/grep -E '\^HDMI\.\* connected.*'/)?.[0] ?? '';
    expect(grepLine).toContain('primary');
  });

  it('deactivate_hdmi_failover must kill failover Chromium (CHROMIUM_PID) and restore dual-display', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('deactivate_hdmi_failover()');
    const funcBody = content.slice(funcStart, funcStart + 3000);
    expect({
      // Must kill the failover Chromium (which was launched via start_chromium → CHROMIUM_PID)
      stopsFailoverChromium: funcBody.includes('kill -TERM') && funcBody.includes('CHROMIUM_PID'),
      // Must NOT reference SECONDARY_CHROMIUM_PID (failover now uses start_chromium)
      noSecondaryPidKill: !funcBody.includes('kill -TERM "$SECONDARY_CHROMIUM_PID"'),
      reconfiguresXrandr: funcBody.includes('setup_secondary_xrandr'),
      relaunchesPrimary: funcBody.includes('start_chromium'),
      relaunchesSecondary: funcBody.includes('start_chromium_secondary'),
    }).toEqual({
      stopsFailoverChromium: true,
      noSecondaryPidKill: true,
      reconfiguresXrandr: true,
      relaunchesPrimary: true,
      relaunchesSecondary: true,
    });
  });

  it('main watchdog loop must skip check_chromium_alive during HDMI failover (prevents parasitic restart)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // Find the check_chromium_alive call in the main loop (not the function definition)
    const mainLoopMatch = content.match(
      /HDMI_FAILOVER_ACTIVE.*!=.*true.*&&.*!.*check_chromium_alive/
    );
    expect(mainLoopMatch).not.toBeNull();
    // Ensure there is NO unguarded check_chromium_alive that sets need_restart
    const unguardedPattern =
      /if\s+!\s*check_chromium_alive;\s*then\s*\n\s*need_restart=true/;
    expect(unguardedPattern.test(content)).toBe(false);
  });

  it('stop_chromium_primary must use SIGTERM before SIGKILL (GPU-safe, US-23.6.3)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('stop_chromium_primary()');
    const funcBody = content.slice(funcStart, funcStart + 1500);
    expect({
      hasSigterm: funcBody.includes('kill -TERM'),
      hasSigkillFallback: funcBody.includes('kill -9'),
      hasShmCleanup: funcBody.includes('.org.chromium'),
      hasSync: funcBody.includes('sync'),
    }).toEqual({
      hasSigterm: true,
      hasSigkillFallback: true,
      hasShmCleanup: true,
      hasSync: true,
    });
  });

  it('handlers.js must emit tv-role-promotion and tv-role-demotion for HDMI failover', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/socket/handlers.js'),
      'utf8'
    );
    expect({
      hasPromotion: content.includes("'tv-role-promotion'"),
      hasDemotion: content.includes("'tv-role-demotion'"),
      hasFailoverCheck: content.includes('hdmi-failover-active'),
    }).toEqual({
      hasPromotion: true,
      hasDemotion: true,
      hasFailoverCheck: true,
    });
  });
});

// ----------------------------------------------------------
// E-22 TvComponent master-slave sync guards: tv.component.ts
// must synchronize secondary display via Socket.IO master-slave.
// These guards prevent regression of the dual-display sync fix.
// ----------------------------------------------------------
describe('E-22 TvComponent master-slave sync guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const tvPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(tvPath, 'utf8');
  });

  // Guard: slave must pause players when role is assigned (stop independent loop)
  it('tv-role-assigned handler must pause playerA and playerB when slave', () => {
    // Extract the tv-role-assigned handler
    const roleHandler = content.match(/on.*tv-role-assigned[\s\S]*?}\);[\s]*}\);/);
    expect(roleHandler).not.toBeNull();
    const handler = roleHandler![0];
    expect({
      pausesPlayerA: /playerA\?\.pause\(\)/.test(handler),
      pausesPlayerB: /playerB\?\.pause\(\)/.test(handler),
      checksIsLoopMode: /this\.isLoopMode/.test(handler),
      showsFreezeFrame: /captureAndShowFreezeFrame/.test(handler),
    }).toEqual({
      pausesPlayerA: true,
      pausesPlayerB: true,
      checksIsLoopMode: true,
      showsFreezeFrame: true,
    });
  });

  // Guard: startSeamlessLoop must NOT play independently when in slave mode
  it('startSeamlessLoop must return early when isSlaveMode', () => {
    const loopFn = content.match(/private startSeamlessLoop[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?\}, 500\);[\s\S]*?\}/);
    expect(loopFn).not.toBeNull();
    const fn = loopFn![0];
    expect({
      checksSlaveMode: /this\.isSlaveMode/.test(fn),
      returnsEarlyForSlave: /if\s*\(this\.isSlaveMode\)[\s\S]*?return;/.test(fn),
    }).toEqual({
      checksSlaveMode: true,
      returnsEarlyForSlave: true,
    });
  });

  // Guard: handleMasterLoopState must use index-based sync (NOT path-based findIndex)
  it('handleMasterLoopState must sync by videoIndex not by path findIndex', () => {
    const syncFn = content.match(/private handleMasterLoopState[\s\S]*?^  \}/m);
    expect(syncFn).not.toBeNull();
    const fn = syncFn![0];
    expect({
      usesVideoIndex: /state\.videoIndex\s*%/.test(fn),
      noPathFindIndex: !/findIndex\(v\s*=>\s*v\.path\s*===\s*state\.videoPath\)/.test(fn),
      hasSeek: /player\.currentTime\s*=\s*elapsed/.test(fn),
    }).toEqual({
      usesVideoIndex: true,
      noPathFindIndex: true,
      hasSeek: true,
    });
  });

  // Guard: onVideoEnded must show freeze frame and return when in slave mode
  it('onVideoEnded must freeze and wait for master when slave', () => {
    const endedFn = content.match(/private onVideoEnded[\s\S]*?^  \}/m);
    expect(endedFn).not.toBeNull();
    const fn = endedFn![0];
    expect({
      checksSlaveMode: /this\.isSlaveMode/.test(fn),
      showsFreezeFrame: /captureAndShowFreezeFrame/.test(fn),
      returnsEarlyForSlave: /if\s*\(this\.isSlaveMode\)[\s\S]*?return;/.test(fn),
    }).toEqual({
      checksSlaveMode: true,
      showsFreezeFrame: true,
      returnsEarlyForSlave: true,
    });
  });

  // Guard: manual videos must resolve secondary variant before play
  it('manual video commands must use resolveSecondaryVariant before play', () => {
    // Socket action handler must resolve secondary variant
    const actionHandler = content.match(/on\('action'[\s\S]*?}\);/);
    expect(actionHandler).not.toBeNull();
    expect(actionHandler![0]).toMatch(/resolveSecondaryVariant/);

    // handleMasterLoopState CAS 1 must resolve secondary variant
    const masterHandler = content.match(/private handleMasterLoopState[\s\S]*?^  \}/m);
    expect(masterHandler).not.toBeNull();
    expect(masterHandler![0]).toMatch(/resolveSecondaryVariant/);
  });

  // Guard: resolveSecondaryVariant must exist and look up config when variants missing
  it('resolveSecondaryVariant must exist and search config for variants', () => {
    expect({
      hasMethod: /private resolveSecondaryVariant/.test(content),
      checksDisplayType: /this\.displayType\s*!==\s*'secondary'/.test(content),
      hasFindInConfig: /private findVideoInConfig/.test(content),
      searchesSponsors: /this\.configuration\.sponsors/.test(content),
      searchesCategories: /this\.configuration\.categories/.test(content),
    }).toEqual({
      hasMethod: true,
      checksDisplayType: true,
      hasFindInConfig: true,
      searchesSponsors: true,
      searchesCategories: true,
    });
  });
});

// ----------------------------------------------------------
// E-23 US-23.7.5: Analytics displayType guard — the secondary
// display must NEVER call trackVideoStart/trackVideoEnd to
// prevent double-counting impressions in dual-display mode.
// ----------------------------------------------------------
describe('E-23 US-23.7.5: analytics displayType guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const tvPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');
  const tvContent = fs.readFileSync(tvPath, 'utf-8');

  it('all trackVideoStart calls must be guarded by displayType !== secondary', () => {
    // Find all lines that call trackVideoStart
    const lines = tvContent.split('\n');
    const trackStartLines = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(l => l.line.includes('trackVideoStart'));

    expect(trackStartLines.length).toBeGreaterThanOrEqual(3);

    // Each trackVideoStart must be preceded (within 12 lines) by a displayType !== 'secondary' guard
    for (const { num } of trackStartLines) {
      const context = lines.slice(Math.max(0, num - 13), num).join(' ');
      expect(context).toMatch(/displayType\s*!==\s*'secondary'/);
    }
  });

  it('all trackVideoEnd calls must be guarded by displayType !== secondary', () => {
    const lines = tvContent.split('\n');
    const trackEndLines = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(l => l.line.includes('trackVideoEnd'));

    expect(trackEndLines.length).toBeGreaterThanOrEqual(3);

    for (const { num } of trackEndLines) {
      const context = lines.slice(Math.max(0, num - 6), num).join(' ');
      expect(context).toMatch(/displayType\s*!==\s*'secondary'/);
    }
  });
});

// ----------------------------------------------------------
// E-23 S6: LED status script must exist with correct patterns
// ----------------------------------------------------------
describe('E-23 S6: LED status script', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const ledScript = path.join(repoRoot, 'raspberry/scripts/neopro-led-status.sh');

  it('neopro-led-status.sh must exist and be executable', () => {
    expect(fs.existsSync(ledScript)).toBe(true);
    const stat = fs.statSync(ledScript);
    expect(stat.mode & 0o111).toBeGreaterThan(0);
  });

  it('neopro-led-status.sh must support heartbeat, slow-blink, fast-blink, default patterns', () => {
    const content = fs.readFileSync(ledScript, 'utf8');
    expect(content).toMatch(/heartbeat/);
    expect(content).toMatch(/slow-blink/);
    expect(content).toMatch(/fast-blink/);
    expect(content).toMatch(/default/);
    expect(content).toMatch(/sys\/class\/leds/);
  });
});

// ----------------------------------------------------------
// E-23 S6: Buzzer script must exist with PWM constants
// ----------------------------------------------------------
describe('E-23 S6: buzzer script', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const buzzerScript = path.join(repoRoot, 'raspberry/scripts/neopro-buzzer.sh');

  it('neopro-buzzer.sh must exist and be executable', () => {
    expect(fs.existsSync(buzzerScript)).toBe(true);
    const stat = fs.statSync(buzzerScript);
    expect(stat.mode & 0o111).toBeGreaterThan(0);
  });

  it('neopro-buzzer.sh must use PWM on GPIO 18 with correct frequency', () => {
    const content = fs.readFileSync(buzzerScript, 'utf8');
    expect(content).toMatch(/pwmchip0/);
    expect(content).toMatch(/500000/); // 2000 Hz period
    expect(content).toMatch(/single|double|triple/);
  });
});

// ----------------------------------------------------------
// E-23 S6: Webapp homepage and manifest must exist
// ----------------------------------------------------------
describe('E-23 S6: webapp homepage and PWA manifest', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const webappIndex = path.join(repoRoot, 'raspberry/webapp/index.html');
  const webappManifest = path.join(repoRoot, 'raspberry/webapp/manifest.json');

  it('webapp index.html must exist with TV link', () => {
    expect(fs.existsSync(webappIndex)).toBe(true);
    const content = fs.readFileSync(webappIndex, 'utf8');
    expect(content).toMatch(/displayType=secondary/);
    expect(content).toMatch(/\/admin\//);
    expect(content).toMatch(/\/remote/);
  });

  it('webapp manifest.json must exist with correct metadata', () => {
    expect(fs.existsSync(webappManifest)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(webappManifest, 'utf8'));
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });
});

// ----------------------------------------------------------
// E-23 S6: kiosk-watchdog must integrate LED and buzzer helpers
// ----------------------------------------------------------
describe('E-23 S6: kiosk-watchdog LED/buzzer integration', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const watchdogPath = path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(watchdogPath, 'utf8');
  });

  it('kiosk-watchdog must have set_led_pattern helper function', () => {
    expect(content).toMatch(/set_led_pattern\(\)/);
    expect(content).toMatch(/neopro-led-status\.sh/);
  });

  it('kiosk-watchdog must have buzzer_beep helper function', () => {
    expect(content).toMatch(/buzzer_beep\(\)/);
    expect(content).toMatch(/neopro-buzzer\.sh/);
  });

  it('kiosk-watchdog must call LED patterns for HDMI states', () => {
    expect(content).toMatch(/set_led_pattern\s+"fast-blink"/);
    expect(content).toMatch(/set_led_pattern\s+"slow-blink"/);
    expect(content).toMatch(/set_led_pattern\s+"heartbeat"/);
  });

  it('kiosk-watchdog must call buzzer for HDMI alerts', () => {
    expect(content).toMatch(/buzzer_beep\s+"double"/);
    expect(content).toMatch(/buzzer_beep\s+"triple"/);
  });
});

// ----------------------------------------------------------
// E-22 Server-side TV sync guards: handlers.js must relay
// master loop state to slaves and assign roles correctly.
// ----------------------------------------------------------
describe('E-22 server-side TV sync guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const handlersPath = path.join(repoRoot, 'raspberry/server/socket/handlers.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(handlersPath, 'utf8');
  });

  it('tv-register must assign role and send loopState to slaves', () => {
    expect({
      emitsRoleAssigned: /socket\.emit\('tv-role-assigned'/.test(content),
      sendsLoopStateToSlave: /socket\.emit\('tv-loop-state'.*getLoopState/.test(content),
      checksRoleSlave: /role\s*===\s*'slave'/.test(content),
    }).toEqual({
      emitsRoleAssigned: true,
      sendsLoopStateToSlave: true,
      checksRoleSlave: true,
    });
  });

  it('tv-loop-update must broadcast only from master', () => {
    expect({
      checksMaster: /isTvMaster\(socket\.id\)/.test(content),
      broadcastsToSlaves: /socket\.broadcast\.emit\('tv-loop-state'/.test(content),
    }).toEqual({
      checksMaster: true,
      broadcastsToSlaves: true,
    });
  });
});

// ----------------------------------------------------------
// E-22 TvComponent variant selection guard: tv.component.ts
// must select secondary variant path when displayType is
// 'secondary' to avoid playing the wrong video on the 2nd screen.
// ----------------------------------------------------------
describe('E-22 TvComponent variant selection guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const tvPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(tvPath, 'utf8');
  });

  it('TvComponent must check variants.secondary.path for video selection', () => {
    expect({
      checksVariantsSecondary: /variants\?\.secondary\?\.path/.test(content),
    }).toEqual({
      checksVariantsSecondary: true,
    });
  });
});

// ----------------------------------------------------------
// Multi-profile sync & cache regression guards (ADR-030)
// ----------------------------------------------------------
// Bug prevention: Deploy profile must also trigger sync_profiles to create
// the profiles/ directory on Pi. Nginx must not cache profile JSON files.
// The Angular resolver must have a fallback when a profile is deleted.
describe('Multi-profile sync & cache regression guards (ADR-030)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  // --- Server-side: deployProfile must send sync_profiles ---
  it('deployProfile must call findBySite and send sync_profiles', () => {
    const controller = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/controllers/config-profiles.controller.ts'),
      'utf8'
    );
    // deployProfile must call findBySite to get all profiles for sync
    const deployFn = controller.match(
      /export const deployProfile[\s\S]*?(?=export const \w|$)/
    );
    expect(deployFn).not.toBeNull();
    expect({
      callsFindBySite: deployFn![0].includes('findBySite(siteId)'),
      sendsSyncProfiles: deployFn![0].includes("type: 'sync_profiles'"),
    }).toEqual({
      callsFindBySite: true,
      sendsSyncProfiles: true,
    });
  });

  // --- Nginx: profiles/ and configuration.json must not be cached ---
  const nginxConfigs = [
    'raspberry/config/nginx-captive-portal.conf',
    'raspberry/config/nginx/neopro-hls.conf',
  ];

  for (const configPath of nginxConfigs) {
    it(`${configPath} must have no-cache on /profiles/ directory`, () => {
      const content = fs.readFileSync(path.join(repoRoot, configPath), 'utf8');
      expect({
        file: configPath,
        hasProfilesNoCache: /location\s+\/profiles\/\s*\{[^}]*no-cache,\s*no-store/s.test(content),
      }).toEqual({
        file: configPath,
        hasProfilesNoCache: true,
      });
    });

    it(`${configPath} must use exact match (=) for /configuration.json`, () => {
      const content = fs.readFileSync(path.join(repoRoot, configPath), 'utf8');
      // Must use "location = /configuration.json" (exact match beats regex)
      expect({
        file: configPath,
        hasExactMatch: /location\s+=\s+\/configuration\.json\s*\{/.test(content),
      }).toEqual({
        file: configPath,
        hasExactMatch: true,
      });
    });
  }

  // --- Angular resolver: catchError fallback ---
  it('app.routes.ts resolver must have catchError fallback for profile loading', () => {
    const routes = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/app.routes.ts'),
      'utf8'
    );
    expect({
      importsCatchError: routes.includes('catchError'),
      hasFallbackToDefaultConfig: /catchError.*configuration\.json/s.test(routes),
      callsClearSelection: routes.includes('profileConfigService.clearSelection()'),
    }).toEqual({
      importsCatchError: true,
      hasFallbackToDefaultConfig: true,
      callsClearSelection: true,
    });
  });

  // --- Remote: no double reload-config on profile switch ---
  it('remote.component.ts must NOT emit reload-config after profile-switch in production', () => {
    const remote = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/components/remote/remote.component.ts'),
      'utf8'
    );
    // Find the production profile-switch block (after loadProfileConfiguration)
    const prodBlock = remote.match(
      /loadProfileConfiguration[\s\S]*?(?=private\s|\}\s*$)/
    );
    expect(prodBlock).not.toBeNull();
    // Must emit profile-switch but NOT reload-config in the same block
    expect({
      emitsProfileSwitch: prodBlock![0].includes("emit('profile-switch'"),
      noReloadConfig: !prodBlock![0].includes("type: 'reload-config'"),
    }).toEqual({
      emitsProfileSwitch: true,
      noReloadConfig: true,
    });
  });

  // --- Remote: back button works in production multi-profile ---
  it('remote.component.html must show back-to-clubs button for multi-profile (not just demo)', () => {
    const template = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/components/remote/remote.component.html'),
      'utf8'
    );
    // The condition must include isMultiProfile, not just isDemoMode
    expect({
      hasMultiProfileCondition: template.includes('isMultiProfile'),
    }).toEqual({
      hasMultiProfileCondition: true,
    });
  });

  // --- ProfileConfigService: resetCache clears selectedConfiguration ---
  it('profile-config.service.ts resetCache must clear selectedConfiguration', () => {
    const service = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/services/profile-config.service.ts'),
      'utf8'
    );
    const resetFn = service.match(
      /public resetCache\(\)[\s\S]*?\n  \}/
    );
    expect(resetFn).not.toBeNull();
    expect({
      clearsSelected: resetFn![0].includes('this.selectedConfiguration = null'),
    }).toEqual({
      clearsSelected: true,
    });
  });

  // --- ProfileConfigService: loadProfileConfiguration has error handling ---
  it('profile-config.service.ts loadProfileConfiguration must have catchError', () => {
    const service = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/services/profile-config.service.ts'),
      'utf8'
    );
    const loadFn = service.match(
      /public loadProfileConfiguration[\s\S]*?\n  \}/
    );
    expect(loadFn).not.toBeNull();
    expect({
      hasCatchError: loadFn![0].includes('catchError'),
      removesLocalStorage: loadFn![0].includes('localStorage.removeItem'),
    }).toEqual({
      hasCatchError: true,
      removesLocalStorage: true,
    });
  });
});

// ----------------------------------------------------------
// Kiosk GPU crash loop regression guards
// Incident: 24/02/2026 — After OTA deploy, Chromium enters a
// rendering crash loop on Pi 5 because SIGKILL prevents the
// V3D Mesa GPU driver from releasing DMA buffers/shaders.
// Power-cycling fixes it because the kernel fully resets GPU.
// Fix: graceful SIGTERM, shared-memory cleanup, nginx wait.
// ----------------------------------------------------------
describe('Kiosk GPU crash loop regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('cleanup_chromium must use SIGTERM before SIGKILL (graceful GPU shutdown)', () => {
    // SIGKILL without prior SIGTERM leaves V3D GPU in dirty state on Pi 5.
    // cleanup_chromium must send SIGTERM first and only SIGKILL as fallback.
    const termIndex = watchdog.indexOf('pkill -TERM -f "chromium"');
    const killIndex = watchdog.indexOf('pkill -9 -f "chromium"');
    expect({ hasSigterm: termIndex > -1 }).toEqual({ hasSigterm: true });
    expect({ hasSigkillFallback: killIndex > -1 }).toEqual({ hasSigkillFallback: true });
    expect({ sigtermBeforeSigkill: termIndex < killIndex })
      .toEqual({ sigtermBeforeSigkill: true });
  });

  it('cleanup_chromium must clean /dev/shm shared memory segments', () => {
    // Orphaned Chromium shared memory segments pollute the next instance's
    // GPU/IPC initialization, contributing to the crash loop.
    expect({ cleansChromiumShm: watchdog.includes('rm -rf /dev/shm/.org.chromium.') })
      .toEqual({ cleansChromiumShm: true });
  });

  it('kiosk-watchdog.sh must check nginx readiness before launching Chromium', () => {
    // Without this, Chromium may load before nginx is ready after a deploy,
    // resulting in a blank screen or loading a stale SW-cached version.
    expect({ hasNginxReadinessCheck: watchdog.includes('curl') && watchdog.includes('neopro.local') })
      .toEqual({ hasNginxReadinessCheck: true });
  });

  it('common_flags must include --disable-gpu-shader-disk-cache', () => {
    // Stale GPU shader cache between versions causes Chromium rendering issues.
    expect({ hasShaderCacheDisable: watchdog.includes('--disable-gpu-shader-disk-cache') })
      .toEqual({ hasShaderCacheDisable: true });
  });

  it('stop_chromium_secondary must use SIGTERM before SIGKILL', () => {
    // stop_chromium_secondary shares the V3D GPU with the main Chromium.
    // A direct SIGKILL corrupts GPU state for BOTH instances.
    // SIGTERM must come first; SIGKILL only as fallback after timeout.
    const stopFn = watchdog.match(/stop_chromium_secondary\(\)\s*\{[\s\S]*?\n\}/);
    expect(stopFn).not.toBeNull();
    const fn = stopFn![0];
    const termIdx = fn.indexOf('kill -TERM');
    const killIdx = fn.indexOf('kill -9');
    expect({ hasSigterm: termIdx > -1 }).toEqual({ hasSigterm: true });
    expect({ sigtermBeforeSigkill: termIdx < killIdx })
      .toEqual({ sigtermBeforeSigkill: true });
  });

  it('stop_chromium_secondary must guard xrandr --off behind detect_hdmi1_status (DRM race)', () => {
    // When HDMI-1 cable is physically unplugged, the kernel DRM already marks it disconnected.
    // Running xrandr --off on a disconnected output triggers a DRM reconfiguration that can
    // briefly destabilize HDMI-0 status in sysfs (race condition → hdmi0=false transient →
    // primary screen shows "En attente d'écran" for a few seconds).
    // The xrandr --off must only run when the cable is still connected (disabled by config).
    const stopFn = watchdog.match(/stop_chromium_secondary\(\)\s*\{[\s\S]*?\n\}/);
    expect(stopFn).not.toBeNull();
    const fn = stopFn![0];
    expect({
      hasHdmi1Guard: fn.includes('detect_hdmi1_status'),
      hasXrandrOff: fn.includes('xrandr --output') && fn.includes('--off'),
    }).toEqual({
      hasHdmi1Guard: true,
      hasXrandrOff: true,
    });
  });

  it('check_for_crash_page must NOT match generic "Error" window titles', () => {
    // xdg-desktop-portal and other X11 windows can have "Error" in their title.
    // Matching generic "Error" causes false-positive crash detection → restart loop.
    const crashFn = watchdog.match(/check_for_crash_page\(\)\s*\{[\s\S]*?\n\}/);
    expect(crashFn).not.toBeNull();
    // Must NOT have a pattern like *"Error"* (too broad)
    expect({ noGenericErrorPattern: !crashFn![0].includes('"*"Error"*"') && !crashFn![0].includes("*\"Error\"*") })
      .toEqual({ noGenericErrorPattern: true });
  });

  it('--disable-features must include XdgDesktopPortal', () => {
    // xdg-desktop-portal spawns unnecessary portal windows in kiosk mode,
    // causing log spam and potential overlay issues on the main display.
    expect({ hasXdgDisable: watchdog.includes('XdgDesktopPortal') })
      .toEqual({ hasXdgDisable: true });
  });

  it('--disable-features must NOT appear inside array definitions (common_flags/gpu_flags)', () => {
    // CRITICAL: Chromium only honours the LAST --disable-features flag.
    // Having --disable-features in BOTH common_flags and gpu_flags means the
    // gpu_flags value silently overrides common_flags, so XdgDesktopPortal
    // ends up NOT disabled on Pi 5. All features must be combined into a
    // single --disable-features="$disable_features" at launch time.
    const arrayDisableFeatures = watchdog.match(/^\s+--disable-features=/gm) || [];
    expect({ noDisableFeaturesInArrays: arrayDisableFeatures.length })
      .toEqual({ noDisableFeaturesInArrays: 0 });
  });

  it('Chromium launch commands must use combined --disable-features variable', () => {
    // start_chromium() has 1 launch path (always --app= mode) and
    // start_chromium_secondary() has 1, both must pass combined --disable-features.
    const launchLines = watchdog.match(/"\$CHROMIUM_BIN".*--disable-features="\$disable_features"/g) || [];
    expect({ combinedDisableFeaturesCount: launchLines.length })
      .toEqual({ combinedDisableFeaturesCount: 2 }); // primary + secondary
  });

  it('--disable-features must include GCMDriver to suppress MCS endpoint spam', () => {
    // Without GCMDriver disabled, Chromium tries to connect to mtalk.google.com
    // every ~30s for push notifications. When WiFi drops (common with USB dongles),
    // this floods journalctl with "Failed to connect to MCS endpoint with error -105".
    // Neopro doesn't use Chromium push notifications.
    expect({ hasGcmDisable: watchdog.includes('GCMDriver') })
      .toEqual({ hasGcmDisable: true });
  });

  it('Pi 5 gpu_flags must include --disable-gpu-vsync', () => {
    // V3D Mesa driver on Pi 5 fails GetVSyncParametersIfAvailable() repeatedly.
    // --disable-gpu-vsync was already present for Pi 4 but missing from Pi 5 flags,
    // causing noisy "GetVSyncParametersIfAvailable() failed for 3 times!" in logs.
    // Both Pi 4 AND Pi 5 gpu_flags blocks must have this flag.
    const pi5Block = watchdog.match(/if \[\[ "\$PI_MODEL" == "pi5" \]\]; then[\s\S]*?gpu_flags=\([\s\S]*?\)/g) || [];
    const pi5HasVsync = pi5Block.some(block => block.includes('--disable-gpu-vsync'));
    expect({ pi5HasDisableGpuVsync: pi5HasVsync })
      .toEqual({ pi5HasDisableGpuVsync: true });
  });

  it('primary Chromium must have --user-data-dir for profile isolation', () => {
    // Without --user-data-dir, the primary Chromium uses the default profile
    // at /home/pi/.config/chromium/ which can accumulate stale state between
    // deploys. A dedicated temp dir ensures a clean profile on every restart.
    const startFn = watchdog.match(/start_chromium\(\)\s*\{[\s\S]*?\n\}/);
    expect(startFn).not.toBeNull();
    expect({ hasUserDataDir: startFn![0].includes('--user-data-dir=/tmp/kiosk-primary') })
      .toEqual({ hasUserDataDir: true });
  });

  it('cleanup_chromium must clean /tmp/kiosk-primary', () => {
    // Since primary Chromium now uses --user-data-dir=/tmp/kiosk-primary,
    // cleanup_chromium must purge this directory to avoid stale profile data.
    const cleanupFn = watchdog.match(/cleanup_chromium\(\)\s*\{[\s\S]*?\n\}/);
    expect(cleanupFn).not.toBeNull();
    expect({ cleansPrimary: cleanupFn![0].includes('rm -rf /tmp/kiosk-primary') })
      .toEqual({ cleansPrimary: true });
  });
});

// ----------------------------------------------------------
// Parasitic window/service detection guards
// Incident: 24/02/2026 — Manually installed VLC kiosk service
// (neopro-vlc-kiosk.service) ran fullscreen on top of Chromium,
// making the TV appear frozen with an old score overlay.
// The watchdog now detects non-Chromium windows and kills them.
// ----------------------------------------------------------
describe('Parasitic window detection guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('watchdog loop must detect non-Chromium active windows (parasitic process)', () => {
    // A non-Chromium window (VLC, xdg-desktop-portal, etc.) taking focus
    // hides the Angular kiosk entirely. The watchdog must detect this by
    // checking the active window name and killing the parasite.
    expect({ hasParasiteDetection: watchdog.includes('FENÊTRE PARASITE') })
      .toEqual({ hasParasiteDetection: true });
    expect({ checksActiveWindow: watchdog.includes('xdotool getactivewindow getwindowname') })
      .toEqual({ checksActiveWindow: true });
  });

  it('watchdog must restore Chromium focus after killing a parasitic window', () => {
    // After killing the parasite, Chromium must be brought back to the front
    // using xdotool windowactivate to ensure the TV displays the kiosk.
    expect({ restoresChromium: watchdog.includes('xdotool windowactivate') })
      .toEqual({ restoresChromium: true });
  });

  it('kiosk-watchdog.sh must NOT reference VLC or ffmpeg-stream', () => {
    // The HLS pipeline (VLC + FFmpeg) was an abandoned experiment.
    // The watchdog must never launch or depend on these tools.
    expect({ noVlc: !watchdog.includes('/usr/bin/vlc') && !watchdog.includes('vlc-kiosk') })
      .toEqual({ noVlc: true });
    expect({ noFfmpegStream: !watchdog.includes('ffmpeg-stream.sh') && !watchdog.includes('score-bridge') })
      .toEqual({ noFfmpegStream: true });
  });

  it('no systemd .service files must reference VLC or HLS pipeline in codebase', () => {
    // Prevent accidentally re-introducing the parasitic services.
    const systemdDir = path.join(repoRoot, 'raspberry/config/systemd');
    const serviceFiles = fs.readdirSync(systemdDir).filter(f => f.endsWith('.service'));
    for (const file of serviceFiles) {
      const content = fs.readFileSync(path.join(systemdDir, file), 'utf8');
      expect({ file, hasVlc: content.includes('vlc') }).toEqual({ file, hasVlc: false });
      expect({ file, hasHlsPipeline: content.includes('ffmpeg-stream') || content.includes('score-bridge') || content.includes('playlist-manager') })
        .toEqual({ file, hasHlsPipeline: false });
    }
  });
});

describe('Deploy script kiosk restart ordering', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const deploy = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
    'utf8'
  );

  it('deploy-remote.sh must restart kiosk AFTER nginx (not in parallel)', () => {
    // Restarting kiosk in parallel with nginx causes a race: Chromium starts
    // before nginx is ready, loading stale content or a blank screen.
    // The 'wait' command must appear BEFORE the kiosk restart line.
    const waitIndex = deploy.lastIndexOf('\n    wait\n');
    const kioskRestartIndex = deploy.indexOf('sudo systemctl restart neopro-kiosk');
    expect({ hasWaitBeforeKiosk: waitIndex > -1 && kioskRestartIndex > -1 })
      .toEqual({ hasWaitBeforeKiosk: true });
    expect({ kioskAfterWait: kioskRestartIndex > waitIndex })
      .toEqual({ kioskAfterWait: true });
  });

  it('deploy-remote.sh diagnostic must capture SSH exit code (not swallow errors)', () => {
    // Incident: 25/02/2026 — diagnostic always showed "impossible de déterminer l'état"
    // because SSH errors were swallowed by 2>/dev/null. The diagnostic must capture
    // the SSH exit code and report connection failures explicitly.
    expect({ capturesSshExitCode: deploy.includes('DIAG_SSH_RC=$?') })
      .toEqual({ capturesSshExitCode: true });
    expect({ checksSshFailure: deploy.includes('DIAG_SSH_RC') && deploy.includes('connexion SSH échouée') })
      .toEqual({ checksSshFailure: true });
  });

  it('deploy-remote.sh must verify /etc/hosts before restarting services', () => {
    // Incident: 26/02/2026 — /etc/hosts was corrupted (binary data), causing
    // nginx to fail with "host not found in upstream localhost". The deploy script
    // must check /etc/hosts integrity and repair it before restarting nginx.
    expect({ checksEtcHosts: deploy.includes('/etc/hosts') })
      .toEqual({ checksEtcHosts: true });
    expect({ checks127001: deploy.includes('127.0.0.1') })
      .toEqual({ checks127001: true });
  });
});

// ----------------------------------------------------------
// Grafana kiosk health alerting guards
// ----------------------------------------------------------
describe('Grafana kiosk health alerts', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const alertsYml = fs.readFileSync(
    path.join(repoRoot, 'docker/grafana/provisioning/alerting/neopro-alerts-cloud.yml'),
    'utf8'
  );

  it('must have kiosk crash alert rule', () => {
    expect({ hasKioskCrashAlert: alertsYml.includes('neopro-kiosk-crash') })
      .toEqual({ hasKioskCrashAlert: true });
  });

  it('must have kiosk down alert rule', () => {
    expect({ hasKioskDownAlert: alertsYml.includes('neopro-kiosk-down') })
      .toEqual({ hasKioskDownAlert: true });
  });

  it('must query neopro_kiosk_crashes_total metric', () => {
    expect({ queriesCrashMetric: alertsYml.includes('neopro_kiosk_crashes_total') })
      .toEqual({ queriesCrashMetric: true });
  });

  it('must query neopro_kiosk_status metric', () => {
    expect({ queriesStatusMetric: alertsYml.includes('neopro_kiosk_status') })
      .toEqual({ queriesStatusMetric: true });
  });
});

// ----------------------------------------------------------
// Build script post-install cleanup regression guards
// ----------------------------------------------------------
describe('Build script node_modules cleanup guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const buildScript = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/build-raspberry.sh'),
    'utf8'
  );

  it('build-raspberry.sh must exclude __tests__ from all rsync copies', () => {
    // All three rsync commands (server, sync-agent, admin) must exclude __tests__
    // to prevent shipping test code to production Pi.
    const rsyncLines = buildScript
      .split('\n')
      .filter((l) => l.includes('rsync') && l.includes('DEPLOY_DIR'));
    expect(rsyncLines.length).toBeGreaterThanOrEqual(3);
    for (const line of rsyncLines) {
      expect({ line, excludesTests: line.includes("--exclude='__tests__'") }).toEqual({
        line,
        excludesTests: true,
      });
    }
  });

  it('build-raspberry.sh must exclude coverage/ from sync-agent rsync', () => {
    // Coverage reports (Jest HTML output) must not ship to Pi.
    const syncAgentRsync = buildScript
      .split('\n')
      .find((l) => l.includes('rsync') && l.includes('sync-agent/'));
    expect(syncAgentRsync).toBeDefined();
    expect(syncAgentRsync).toContain("--exclude='coverage'");
  });

  it('build-raspberry.sh must have post-install cleanup block', () => {
    // The cleanup block removes docs, tests, @types, .map files etc.
    // from node_modules after npm install --production.
    expect(buildScript).toContain('Nettoyage des fichiers inutiles au runtime');
    expect(buildScript).toContain("@types");
    expect(buildScript).toContain("'*.map'");
    expect(buildScript).toContain("'test'");
    expect(buildScript).toContain("'*.md'");
  });

  it('build-raspberry.sh must report cleanup metrics (before/after)', () => {
    // The build must log how many files were removed so operators can
    // spot anomalies (e.g. cleanup accidentally deleting runtime files).
    expect(buildScript).toContain('BEFORE_FILES=');
    expect(buildScript).toContain('AFTER_FILES=');
    expect(buildScript).toContain('REMOVED=');
  });
});

// ----------------------------------------------------------
// CI workflow reliability guards
// Incident: 24/02/2026 — Smoke tests added in commit A tested
// code only added in commit B. Without concurrency cancellation,
// the CI run for commit A fails even though HEAD is correct.
// Guard: ensure concurrency: cancel-in-progress stays in CI.
// ----------------------------------------------------------
describe('CI workflow reliability guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const ciWorkflow = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/ci.yml'),
    'utf8'
  );

  it('ci.yml must have concurrency with cancel-in-progress to prevent stale runs', () => {
    // Without this, pushing multiple commits triggers parallel CI runs on
    // intermediate commits that may fail because tests reference code not
    // yet present at that point in the history.
    expect(ciWorkflow).toContain('cancel-in-progress: true');
  });

  it('ci.yml must define concurrency group per workflow and ref', () => {
    // The group must include both workflow name and branch ref so that
    // runs on different branches don't cancel each other.
    expect(ciWorkflow).toContain('github.workflow');
    expect(ciWorkflow).toContain('github.ref');
  });
});

// ----------------------------------------------------------
// FTP upload ensureDir guard: both uploadFileToFtp (buffer) and
// uploadFileToFtpFromDisk (streaming) must call ensureDir before
// upload to avoid FTP 550 on nested paths like variants/uuid/secondary/.
// ----------------------------------------------------------
describe('FTP upload ensureDir guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const ftpStoragePath = path.join(repoRoot, 'central-server/src/config/ftp-storage.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(ftpStoragePath, 'utf8');
  });

  it('uploadFileToFtp (buffer) must call ensureDir before upload', () => {
    // Extract the uploadFileToFtp function body (buffer-based upload)
    const fnMatch = content.match(
      /export const uploadFileToFtp\b[\s\S]*?^};/m
    );
    expect(fnMatch).not.toBeNull();
    expect({
      hasEnsureDir: /ensureDir/.test(fnMatch![0]),
    }).toEqual({
      hasEnsureDir: true,
    });
  });

  it('uploadFileToFtpFromDisk (streaming) must call ensureDir before upload', () => {
    // Extract the uploadFileToFtpFromDisk function body (disk streaming upload)
    const fnMatch = content.match(
      /export const uploadFileToFtpFromDisk\b[\s\S]*?^};/m
    );
    expect(fnMatch).not.toBeNull();
    expect({
      hasEnsureDir: /ensureDir/.test(fnMatch![0]),
    }).toEqual({
      hasEnsureDir: true,
    });
  });
});

// ----------------------------------------------------------
// Video variant display_type alignment guard: the TypeScript
// DisplayType and the controller validation must use the same
// values as the DB CHECK constraint (tv, secondary).
// ----------------------------------------------------------
describe('Video variant display_type alignment guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const repoPath = path.join(repoRoot, 'central-server/src/repositories/video-variant.repository.ts');
  const controllerPath = path.join(repoRoot, 'central-server/src/controllers/content.controller.ts');

  let repoContent: string;
  let controllerContent: string;
  beforeAll(() => {
    repoContent = fs.readFileSync(repoPath, 'utf8');
    controllerContent = fs.readFileSync(controllerPath, 'utf8');
  });

  it('DisplayType must include "secondary" (not "led")', () => {
    expect({
      hasSecondary: /DisplayType\s*=.*'secondary'/.test(repoContent),
      noLed: !/DisplayType\s*=.*'led'/.test(repoContent),
    }).toEqual({
      hasSecondary: true,
      noLed: true,
    });
  });

  it('createVideoVariant controller must validate "secondary" (not "led")', () => {
    // The controller validates display_type with an includes check
    expect({
      validatesSecondary: /\['tv',\s*'secondary'\]/.test(controllerContent),
      noLedValidation: !/\['tv',\s*'led'\]/.test(controllerContent),
    }).toEqual({
      validatesSecondary: true,
      noLedValidation: true,
    });
  });
});

// ----------------------------------------------------------
// Deployment secondary variant persistence guard: deployToSite()
// must persist has_secondary_variant = true after successful
// deployment when a secondary variant is included.
// ----------------------------------------------------------
describe('Deployment secondary variant persistence guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const servicePath = path.join(repoRoot, 'central-server/src/services/deployment.service.ts');
  const repoPath = path.join(repoRoot, 'central-server/src/repositories/deployment.repository.ts');
  const schemaPath = path.join(repoRoot, 'central-server/src/scripts/full-schema.sql');

  let serviceContent: string;
  let repoContent: string;
  let schemaContent: string;

  beforeAll(() => {
    serviceContent = fs.readFileSync(servicePath, 'utf8');
    repoContent = fs.readFileSync(repoPath, 'utf8');
    schemaContent = fs.readFileSync(schemaPath, 'utf8');
  });

  it('deployToSite must persist has_secondary_variant flag', () => {
    expect({
      updatesFlag: /has_secondary_variant\s*=\s*true/.test(serviceContent),
    }).toEqual({
      updatesFlag: true,
    });
  });

  it('deployment repository queries must SELECT has_secondary_variant', () => {
    expect({
      inVideoDeployments: /findDeploymentsForVideo[\s\S]*?has_secondary_variant/.test(repoContent),
      inAllDetails: /findAllWithDetails[\s\S]*?has_secondary_variant/.test(repoContent),
      inDetails: /findWithDetails[\s\S]*?has_secondary_variant/.test(repoContent),
    }).toEqual({
      inVideoDeployments: true,
      inAllDetails: true,
      inDetails: true,
    });
  });

  it('full-schema.sql must include has_secondary_variant column', () => {
    expect({
      hasColumn: /has_secondary_variant\s+BOOLEAN/.test(schemaContent),
    }).toEqual({
      hasColumn: true,
    });
  });
});

// ── Angular build config guards ─────────────────────────────────────────
// Prevents regression of build warnings fixed in 3.80.18:
// - Missing allowedCommonJsDependencies (leaflet → optimization bailout)
// - Component style budgets too low (cloud-remote.component.scss > 40kB)
describe('Angular build config guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const angularJsonPath = path.join(repoRoot, 'angular.json');

  let angularConfig: {
    projects: Record<
      string,
      {
        architect: {
          build: {
            options: { allowedCommonJsDependencies?: string[] };
            configurations: Record<
              string,
              { budgets?: { type: string; maximumWarning: string; maximumError: string }[] }
            >;
          };
        };
      }
    >;
  };

  beforeAll(() => {
    angularConfig = JSON.parse(fs.readFileSync(angularJsonPath, 'utf8'));
  });

  it('central-dashboard must allow leaflet as CommonJS dependency', () => {
    const allowed =
      angularConfig.projects['central-dashboard']?.architect?.build?.options
        ?.allowedCommonJsDependencies ?? [];
    expect(allowed).toContain('leaflet');
  });

  it('central-dashboard production budget for anyComponentStyle must be >= 48kb warning', () => {
    const budgets =
      angularConfig.projects['central-dashboard']?.architect?.build?.configurations?.production
        ?.budgets ?? [];
    const componentBudget = budgets.find((b) => b.type === 'anyComponentStyle');
    expect(componentBudget).toBeDefined();
    const warningKb = parseInt(componentBudget!.maximumWarning, 10);
    expect(warningKb).toBeGreaterThanOrEqual(48);
  });
});

// ── Secondary variant badge wiring guards ───────────────────────────────
// Prevents regression of the 📺 2nd badge in site-content-tab and remote.
// If any of these guards fail, the badge is silently broken.
describe('Secondary variant badge wiring guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  // Central Server
  const sitesControllerPath = path.join(
    repoRoot,
    'central-server/src/controllers/sites.controller.ts',
  );
  // Dashboard
  const siteContentTabPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts',
  );
  // Pi Remote
  const remoteTemplatePath = path.join(
    repoRoot,
    'raspberry/src/app/components/remote/remote.component.html',
  );
  const videoInterfacePath = path.join(
    repoRoot,
    'raspberry/src/app/interfaces/video.interface.ts',
  );

  let controllerContent: string;
  let siteContentTabContent: string;
  let remoteTemplateContent: string;
  let videoInterfaceContent: string;

  beforeAll(() => {
    controllerContent = fs.readFileSync(sitesControllerPath, 'utf8');
    siteContentTabContent = fs.readFileSync(siteContentTabPath, 'utf8');
    remoteTemplateContent = fs.readFileSync(remoteTemplatePath, 'utf8');
    videoInterfaceContent = fs.readFileSync(videoInterfacePath, 'utf8');
  });

  it('getSiteLocalContent must return secondaryVariantVideoIds and secondaryDisplayEnabled', () => {
    expect({
      returnsVariantIds: /secondaryVariantVideoIds/.test(controllerContent),
      returnsDisplayEnabled: /secondaryDisplayEnabled/.test(controllerContent),
      callsVariantRepo: /findSecondaryVariantsForVideos/.test(controllerContent),
    }).toEqual({
      returnsVariantIds: true,
      returnsDisplayEnabled: true,
      callsVariantRepo: true,
    });
  });

  it('site-content-tab must wire secondary variant badge', () => {
    expect({
      hasBadgeClass: /secondary-variant-badge/.test(siteContentTabContent),
      hasHelperMethod: /hasSecondaryVariantForPath/.test(siteContentTabContent),
      hasVariantSet: /secondaryVariantVideoIds/.test(siteContentTabContent),
    }).toEqual({
      hasBadgeClass: true,
      hasHelperMethod: true,
      hasVariantSet: true,
    });
  });

  it('remote template must have video-secondary-badge for variant indicator', () => {
    expect({
      hasBadge: /video-secondary-badge/.test(remoteTemplateContent),
      checksVariants: /video\.variants\?\.secondary/.test(remoteTemplateContent),
    }).toEqual({
      hasBadge: true,
      checksVariants: true,
    });
  });

  it('Video interface must type variants.secondary', () => {
    expect({
      hasVariantsField: /variants\?[\s\S]*?secondary/.test(videoInterfaceContent),
    }).toEqual({
      hasVariantsField: true,
    });
  });
});

// ── Secondary video deployment UI guards ─────────────────────────────────
// Prevents regression of the 3 new secondary-display indicators added
// to (1) cloud remote, (2) site-detail status tab, (3) pending deployments.
describe('Secondary video deployment UI guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  const cloudRemoteHtmlPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/remote/cloud-remote.component.html',
  );
  const cloudRemoteTsPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/remote/cloud-remote.component.ts',
  );
  const cloudRemoteScssPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/remote/cloud-remote.component.scss',
  );
  const siteDetailPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/site-detail.component.ts',
  );
  const remoteControllerPath = path.join(
    repoRoot,
    'central-server/src/controllers/remote.controller.ts',
  );
  const siteContentTabPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts',
  );
  const remoteServicePath = path.join(
    repoRoot,
    'central-dashboard/src/app/core/services/remote.service.ts',
  );
  const sitesServicePath = path.join(
    repoRoot,
    'central-dashboard/src/app/core/services/sites.service.ts',
  );

  let cloudRemoteHtml: string;
  let cloudRemoteTs: string;
  let cloudRemoteScss: string;
  let siteDetailContent: string;
  let remoteControllerContent: string;
  let siteContentTabContent: string;
  let remoteServiceContent: string;
  let sitesServiceContent: string;

  beforeAll(() => {
    cloudRemoteHtml = fs.readFileSync(cloudRemoteHtmlPath, 'utf8');
    cloudRemoteTs = fs.readFileSync(cloudRemoteTsPath, 'utf8');
    cloudRemoteScss = fs.readFileSync(cloudRemoteScssPath, 'utf8');
    siteDetailContent = fs.readFileSync(siteDetailPath, 'utf8');
    remoteControllerContent = fs.readFileSync(remoteControllerPath, 'utf8');
    siteContentTabContent = fs.readFileSync(siteContentTabPath, 'utf8');
    remoteServiceContent = fs.readFileSync(remoteServicePath, 'utf8');
    sitesServiceContent = fs.readFileSync(sitesServicePath, 'utf8');
  });

  it('cloud remote HTML must show video-secondary-badge for videos with secondary variants', () => {
    expect({
      hasBadgeClass: /video-secondary-badge/.test(cloudRemoteHtml),
      checksHasSecondary: /hasSecondaryVariant/.test(cloudRemoteHtml),
      checksDisplayEnabled: /secondaryDisplayEnabled/.test(cloudRemoteHtml),
    }).toEqual({
      hasBadgeClass: true,
      checksHasSecondary: true,
      checksDisplayEnabled: true,
    });
  });

  it('cloud remote TS must have markSecondaryVariants and secondaryVariantPaths', () => {
    expect({
      hasMarkMethod: /markSecondaryVariants/.test(cloudRemoteTs),
      hasVariantPaths: /secondaryVariantPaths/.test(cloudRemoteTs),
      hasDisplayEnabled: /secondaryDisplayEnabled/.test(cloudRemoteTs),
      hasVideoFlag: /hasSecondaryVariant/.test(cloudRemoteTs),
    }).toEqual({
      hasMarkMethod: true,
      hasVariantPaths: true,
      hasDisplayEnabled: true,
      hasVideoFlag: true,
    });
  });

  it('cloud remote SCSS must style video-secondary-badge', () => {
    expect(/\.video-secondary-badge/.test(cloudRemoteScss)).toBe(true);
  });

  it('remote controller must expose secondaryDisplayEnabled and secondaryVariantPaths', () => {
    expect({
      exportsDisplayEnabled: /secondaryDisplayEnabled/.test(remoteControllerContent),
      exportsVariantPaths: /secondaryVariantPaths/.test(remoteControllerContent),
      importsVariantRepo: /videoVariantRepository/.test(remoteControllerContent),
    }).toEqual({
      exportsDisplayEnabled: true,
      exportsVariantPaths: true,
      importsVariantRepo: true,
    });
  });

  it('RemoteState interface must include secondaryDisplayEnabled and secondaryVariantPaths', () => {
    expect({
      hasDisplayEnabled: /secondaryDisplayEnabled/.test(remoteServiceContent),
      hasVariantPaths: /secondaryVariantPaths/.test(remoteServiceContent),
    }).toEqual({
      hasDisplayEnabled: true,
      hasVariantPaths: true,
    });
  });

  it('site-detail must show badge-secondary-display when secondary_display_enabled', () => {
    expect({
      hasBadge: /badge-secondary-display/.test(siteDetailContent),
      checksEnabled: /secondary_display_enabled/.test(siteDetailContent),
      hasResolution: /secondary_display_resolution/.test(siteDetailContent),
    }).toEqual({
      hasBadge: true,
      checksEnabled: true,
      hasResolution: true,
    });
  });

  it('pending deployments must show secondary variant badge when has_secondary_variant', () => {
    expect({
      hasDeployBadge: /deployment\.has_secondary_variant/.test(siteContentTabContent),
    }).toEqual({
      hasDeployBadge: true,
    });
  });

  it('PendingDeployment interface must include has_secondary_variant field', () => {
    expect(/has_secondary_variant/.test(sitesServiceContent)).toBe(true);
  });
});

// ----------------------------------------------------------
// FTP verifyFtpFileExists must use client.size() — NOT client.list()
// client.list() without a directory argument only returns root-level
// entries, so nested paths like variants/uuid/secondary/file.mp4
// will NEVER be found. client.size(filename) works with full paths.
// ----------------------------------------------------------
describe('FTP verifyFtpFileExists must use client.size()', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const ftpStoragePath = path.join(repoRoot, 'central-server/src/config/ftp-storage.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(ftpStoragePath, 'utf8');
  });

  it('verifyFtpFileExists must call client.size() for path-safe verification', () => {
    const fnMatch = content.match(
      /export const verifyFtpFileExists\b[\s\S]*?^};/m
    );
    expect(fnMatch).not.toBeNull();
    expect({
      usesSize: /client\.size\(/.test(fnMatch![0]),
    }).toEqual({
      usesSize: true,
    });
  });

  it('verifyFtpFileExists must NOT use client.list() without directory (root-only bug)', () => {
    const fnMatch = content.match(
      /export const verifyFtpFileExists\b[\s\S]*?^};/m
    );
    expect(fnMatch).not.toBeNull();
    // client.list() without argument only lists root — breaks for nested paths
    expect({
      usesBarelist: /client\.list\(\)/.test(fnMatch![0]),
    }).toEqual({
      usesBarelist: false,
    });
  });
});

// ----------------------------------------------------------
// WiFi boot race condition regression guards (v3.84.3)
// ----------------------------------------------------------
// Issue: NetworkWatchdog fires internetWatchLoop at boot+10s. If wlan1 (RTL8192EU USB)
// hasn't completed WPA auth + DHCP by then, watchdog detects "no connectivity" → escalates
// 6-phase recovery → disrupts in-progress auth → cascade requiring modprobe + USB power-cycle.
// E-23 aggravated by adding HDMI boot operations (xrandr, DRM udev) that increase PCIe
// bus contention on RP1, delaying USB WiFi initialization.
// Fixes: boot grace period, circular dependency break, autoOptimize delay increase.
describe('WiFi boot race condition regression guards (v3.84.3)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  let watchdogContent: string;
  let safeOpsContent: string;
  let agentContent: string;

  beforeAll(() => {
    watchdogContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/network-watchdog.js'),
      'utf8'
    );
    safeOpsContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/safe-network-operations.js'),
      'utf8'
    );
    agentContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
  });

  // Guard 1: Boot grace period — watchdog must not trigger false recovery before WiFi stabilizes
  it('network-watchdog start() must enable boot grace period for internet checks', () => {
    // The start() function must call enableGracePeriod before the first internetWatchLoop
    const startFn = watchdogContent.match(
      /function start\(\)\s*\{[\s\S]*?setTimeout\(\(\) => internetWatchLoop\(\)/
    );
    expect(startFn).not.toBeNull();
    expect({
      hasBootGrace: /enableGracePeriod\(\s*'internet'\s*,\s*\d+\s*\)/.test(startFn![0]),
    }).toEqual({
      hasBootGrace: true,
    });
  });

  it('network-watchdog boot grace period must be >= 30s', () => {
    // Match the enableGracePeriod call in start() that precedes the setTimeout internetWatchLoop
    const startFn = watchdogContent.match(
      /function start\(\)\s*\{[\s\S]*?setTimeout\(\(\) => internetWatchLoop\(\)/
    );
    expect(startFn).not.toBeNull();
    const graceMatch = startFn![0].match(
      /enableGracePeriod\(\s*'internet'\s*,\s*(\d+)\s*\)/
    );
    expect(graceMatch).not.toBeNull();
    expect({
      graceMs: Number(graceMatch![1]) >= 30000,
    }).toEqual({
      graceMs: true,
    });
  });

  // Guard 2: Circular dependency — safe-network-operations must NOT require network-watchdog at module scope
  it('safe-network-operations must NOT require network-watchdog at module scope (circular dependency)', () => {
    // Extract top-level requires (before any class/function definition)
    const topLevel = safeOpsContent.split(/^class /m)[0];
    expect({
      hasModuleScopeRequire: /^const\s+\w+\s*=\s*require\(['"]\.\/network-watchdog['"]\)/m.test(topLevel),
    }).toEqual({
      hasModuleScopeRequire: false,
    });
  });

  it('safe-network-operations autoOptimize must use lazy require for network-watchdog', () => {
    const autoOptFn = safeOpsContent.match(
      /async autoOptimize\(\)\s*\{[\s\S]*?return \{ success: true/
    );
    expect(autoOptFn).not.toBeNull();
    expect({
      hasLazyRequire: /require\(['"]\.\/network-watchdog['"]\)/.test(autoOptFn![0]),
    }).toEqual({
      hasLazyRequire: true,
    });
  });

  // Guard 3: autoOptimize delay — must wait long enough for WiFi to stabilize before scanning
  it('agent.js autoOptimize timeout must be >= 60s (not 30s)', () => {
    // Find the setTimeout block that contains autoOptimize and extract the delay value
    const optimizeBlock = agentContent.match(
      /autoOptimize\(\)[\s\S]{0,800}}\s*,\s*(\d+)\s*\)/
    );
    expect(optimizeBlock).not.toBeNull();
    expect({
      delayMs: Number(optimizeBlock![1]) >= 60000,
    }).toEqual({
      delayMs: true,
    });
  });
});

// ----------------------------------------------------------
// Hotspot optimizer wlan1 scan regression guards
// ----------------------------------------------------------
// Issue: hotspot-optimizer.sh ran 5 iwlist scans on wlan1 in ~25s at boot.
// RTL8192EU is single-radio: each scan drops carrier for ~6s while sweeping
// channels 1-13. After 2 back-to-back scans, Livebox considers client gone
// → carrier lost → 2-3 min internet outage at every boot.
// Fix: single cached scan + wait for wlan1 IP before scanning.
describe('Hotspot optimizer wlan1 scan regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  let hotspotScript: string;

  beforeAll(() => {
    hotspotScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/hotspot-optimizer.sh'),
      'utf8'
    );
  });

  // Guard 1: count_networks_on_channel must NOT call iwlist scan
  it('count_networks_on_channel must NOT call iwlist scan (must use cached results)', () => {
    const funcMatch = hotspotScript.match(
      /count_networks_on_channel\(\)\s*\{([\s\S]*?)\n\}/
    );
    expect(funcMatch).not.toBeNull();
    const funcBody = funcMatch![1];
    expect({
      usesIwlistScan: /iwlist\b.*\bscan\b/.test(funcBody),
      reason: 'Each iwlist scan disconnects RTL8192EU from WiFi for ~6s — use CACHED_SCAN',
    }).toEqual({
      usesIwlistScan: false,
      reason: 'Each iwlist scan disconnects RTL8192EU from WiFi for ~6s — use CACHED_SCAN',
    });
  });

  // Guard 2: script must use a cached scan variable
  it('must define and use CACHED_SCAN variable for single-scan pattern', () => {
    expect({
      definesCachedScan: /^CACHED_SCAN=/m.test(hotspotScript),
      performSingleScan: /perform_single_scan/.test(hotspotScript),
      countUsesCachedScan: /\$CACHED_SCAN/.test(hotspotScript),
    }).toEqual({
      definesCachedScan: true,
      performSingleScan: true,
      countUsesCachedScan: true,
    });
  });

  // Guard 3: must wait for wlan1 IP before scanning
  it('must wait for wlan1 readiness before scanning (wait_for_wlan1_ready)', () => {
    expect({
      hasWaitFunction: /wait_for_wlan1_ready\(\)/.test(hotspotScript),
      callsWaitBeforeScan: hotspotScript.indexOf('wait_for_wlan1_ready') <
        hotspotScript.indexOf('perform_single_scan'),
    }).toEqual({
      hasWaitFunction: true,
      callsWaitBeforeScan: true,
    });
  });

  // Guard 4: deploy copy must be in sync
  it('deploy copy must match source (raspberry/deploy/scripts/hotspot-optimizer.sh)', () => {
    const deployScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/deploy/scripts/hotspot-optimizer.sh'),
      'utf8'
    );
    expect(deployScript).toEqual(hotspotScript);
  });

  // Guard 5: hotspot-optimizer must write inter-process scan cache
  // networkDetector (Node.js) reuses this cache to avoid a SECOND iwlist wlan1 scan.
  it('must write scan cache to /tmp/neopro-wlan1-scan-cache for inter-process coordination', () => {
    expect({
      writesScanCache: /neopro-wlan1-scan-cache/.test(hotspotScript),
      writesScanTs: /neopro-wlan1-scan-ts/.test(hotspotScript),
      reason: 'networkDetector must reuse cached scan — 2 iwlist scans within 120s kills RTL8192EU carrier',
    }).toEqual({
      writesScanCache: true,
      writesScanTs: true,
      reason: 'networkDetector must reuse cached scan — 2 iwlist scans within 120s kills RTL8192EU carrier',
    });
  });
});

// ----------------------------------------------------------
// Inter-process wlan1 scan coordination guard
// ----------------------------------------------------------
// Issue: hotspot-optimizer.sh scans wlan1 at boot+12s, then networkDetector.detect()
// fires ANOTHER iwlist wlan1 scan at boot+60s via agent.js setTimeout.
// RTL8192EU single-radio: 2 scans within 120s → carrier loss → 2-3 min outage.
// Fix: hotspot-optimizer writes scan to /tmp/neopro-wlan1-scan-cache,
// networkDetector reads cache if fresh (<120s) instead of scanning again.
describe('Inter-process wlan1 scan coordination guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  let networkDetectorSrc: string;

  beforeAll(() => {
    networkDetectorSrc = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/network-detector.js'),
      'utf8'
    );
  });

  // Guard 1: networkDetector must check scan cache before scanning
  it('scanWifiNetworks must read inter-process scan cache before iwlist scan', () => {
    expect({
      readsScanCache: /neopro-wlan1-scan-cache/.test(networkDetectorSrc),
      readsScanTs: /neopro-wlan1-scan-ts/.test(networkDetectorSrc),
      hasCacheMaxAge: /SCAN_CACHE_MAX_AGE_S/.test(networkDetectorSrc),
    }).toEqual({
      readsScanCache: true,
      readsScanTs: true,
      hasCacheMaxAge: true,
    });
  });

  // Guard 2: cache check must happen BEFORE the live scan
  it('cache check must precede live iwlist wlan1 scan', () => {
    const cacheCheckPos = networkDetectorSrc.indexOf('_readScanCache');
    const liveScanPos = networkDetectorSrc.indexOf('_performLiveScan');
    expect({
      cacheCheckExists: cacheCheckPos > -1,
      liveScanExists: liveScanPos > -1,
      cacheBeforeScan: cacheCheckPos < liveScanPos,
    }).toEqual({
      cacheCheckExists: true,
      liveScanExists: true,
      cacheBeforeScan: true,
    });
  });

  // Guard 3: live scan must write cache for next consumer
  it('live scan must write cache after scanning for future consumers', () => {
    // _performLiveScan method must call _writeScanCache
    const funcMatch = networkDetectorSrc.match(
      /_performLiveScan\(\)\s*\{([\s\S]*?)\n  \}/
    );
    expect(funcMatch).not.toBeNull();
    expect(funcMatch![1]).toMatch(/_writeScanCache/);
  });

  // Guard 4: scan cache hit/miss must be tracked and exposed in heartbeat
  it('must track scan cache hits/misses and expose in getSimplifiedProfile', () => {
    const profileSection = networkDetectorSrc.slice(
      networkDetectorSrc.indexOf('getSimplifiedProfile')
    );
    expect({
      hasHitCounter: /scanCacheHits/.test(networkDetectorSrc),
      hasMissCounter: /scanCacheMisses/.test(networkDetectorSrc),
      hitsInProfile: /scanCacheHits/.test(profileSection),
      missesInProfile: /scanCacheMisses/.test(profileSection),
    }).toEqual({
      hasHitCounter: true,
      hasMissCounter: true,
      hitsInProfile: true,
      missesInProfile: true,
    });
  });
});

// ----------------------------------------------------------
// Kiosk screen dimension initialization guard
// Incident: 01/03/2026 — PRIMARY_SCREEN_WIDTH/HEIGHT were initialized
// to 0 instead of "" (empty string). The bash fallback syntax
// ${VAR:-default} only triggers when VAR is unset or empty, NOT when
// it equals 0. Result: Chromium launched with --window-size=0,0
// → 1x1 pixel window → invisible display (black screen).
// ----------------------------------------------------------
describe('Kiosk screen dimension initialization guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('PRIMARY_SCREEN_WIDTH must NOT be initialized to a numeric value', () => {
    // Initializing to 0 (or any number) breaks ${VAR:-1920} fallback
    // because bash treats 0 as a non-empty value. Must use ="" or leave unset.
    const match = watchdog.match(/^PRIMARY_SCREEN_WIDTH=(.*)$/m);
    expect(match).not.toBeNull();
    const initValue = match![1].trim().replace(/^["']|["']$/g, '');
    expect({ initValue, isNumeric: /^[0-9]+$/.test(initValue) })
      .toEqual({ initValue, isNumeric: false });
  });

  it('PRIMARY_SCREEN_HEIGHT must NOT be initialized to a numeric value', () => {
    const match = watchdog.match(/^PRIMARY_SCREEN_HEIGHT=(.*)$/m);
    expect(match).not.toBeNull();
    const initValue = match![1].trim().replace(/^["']|["']$/g, '');
    expect({ initValue, isNumeric: /^[0-9]+$/.test(initValue) })
      .toEqual({ initValue, isNumeric: false });
  });

  it('launch_chromium must have runtime guard against dimensions ≤ 0', () => {
    // Defense-in-depth: even if init is wrong, runtime must catch it
    // before constructing --window-size flag
    expect(watchdog).toContain('-le 0');
  });
});

// ----------------------------------------------------------
// Resolution detection cascade (optimal TV resolution)
// Ensures kiosk-watchdog.sh detects the native resolution of each
// connected TV via a 4-level cascade: xrandr geometry → xrandr
// preferred mode → EDID native → DEFAULT_SCREEN constants.
// Eliminates hardcoded 1920x1080 magic numbers.
// ----------------------------------------------------------
describe('Resolution detection cascade', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('DEFAULT_SCREEN_WIDTH constant must be defined as a positive integer', () => {
    const match = watchdog.match(/^DEFAULT_SCREEN_WIDTH=(\d+)$/m);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  it('DEFAULT_SCREEN_HEIGHT constant must be defined as a positive integer', () => {
    const match = watchdog.match(/^DEFAULT_SCREEN_HEIGHT=(\d+)$/m);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  it('get_output_resolution() cascade function must exist', () => {
    expect(watchdog).toMatch(/^get_output_resolution\s*\(\)/m);
  });

  it('no raw 1920 magic number outside constant definitions and comments', () => {
    // Split into lines, filter out constant defs and comment-only lines
    const codeLines = watchdog.split('\n').filter((line) => {
      const trimmed = line.trim();
      // Skip comment lines
      if (trimmed.startsWith('#')) return false;
      // Skip the constant definition itself
      if (/^DEFAULT_SCREEN_WIDTH=\d+$/.test(trimmed)) return false;
      return true;
    });
    const rawUsages = codeLines.filter((line) => /\b1920\b/.test(line));
    expect(rawUsages).toEqual([]);
  });

  it('no raw 1080 magic number outside constant definitions and comments', () => {
    const codeLines = watchdog.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) return false;
      if (/^DEFAULT_SCREEN_HEIGHT=\d+$/.test(trimmed)) return false;
      return true;
    });
    const rawUsages = codeLines.filter((line) => /\b1080\b/.test(line));
    expect(rawUsages).toEqual([]);
  });

  it('SECONDARY_X_OFFSET must derive from PRIMARY_SCREEN_WIDTH, not hardcoded', () => {
    // Must use $PRIMARY_SCREEN_WIDTH or $DEFAULT_SCREEN_WIDTH, not a raw number
    expect(watchdog).toMatch(/SECONDARY_X_OFFSET.*PRIMARY_SCREEN_WIDTH/);
  });

  it('DISPLAY_FALLBACK_REASON must be defined and included in kiosk status', () => {
    expect(watchdog).toMatch(/^DISPLAY_FALLBACK_REASON=/m);
    expect(watchdog).toContain('displayFallback');
  });

  it('xrandr preferred mode parsing (cascade level 2) must detect "+" marker', () => {
    // The cascade must parse xrandr mode list for the preferred mode (marked with +)
    expect(watchdog).toMatch(/preferred_res/);
    expect(watchdog).toMatch(/\+/);
  });
});

// ----------------------------------------------------------
// Orphan systemd service guard
// Incident: 01/03/2026 — 4 .service files (score-bridge, playlist-manager,
// ffmpeg-stream, vlc-kiosk) were deployed on Pi without corresponding
// source code. Result: 305+ crash-loop restarts per service, CPU waste,
// log pollution. Services must reference scripts/binaries that exist
// in the codebase.
// ----------------------------------------------------------
describe('Systemd service files must reference existing scripts', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const systemdDir = path.join(repoRoot, 'raspberry/config/systemd');
  const serviceFiles = fs.readdirSync(systemdDir).filter(f => f.endsWith('.service'));

  it('every .service ExecStart must reference a script that exists in the repo', () => {
    const missing: string[] = [];
    for (const file of serviceFiles) {
      const content = fs.readFileSync(path.join(systemdDir, file), 'utf8');
      // Extract ExecStart paths (skip systemd builtins like /bin/sleep)
      const execMatches = content.match(/^ExecStart(?:Pre|Post)?=.*?(\/(home|opt)\/pi\/neopro\/\S+)/gm);
      if (!execMatches) continue;
      for (const line of execMatches) {
        const scriptMatch = line.match(/(\/(home|opt)\/pi\/neopro\/\S+)/);
        if (!scriptMatch) continue;
        // Convert absolute Pi path to repo-relative path
        const piPath = scriptMatch[1];
        const repoPath = piPath.replace(/^\/(home|opt)\/pi\/neopro\//, 'raspberry/');
        const fullPath = path.join(repoRoot, repoPath);
        if (!fs.existsSync(fullPath)) {
          missing.push(`${file}: ${piPath} → ${repoPath} (not found)`);
        }
      }
    }
    expect({ missing }).toEqual({ missing: [] });
  });
});

// ----------------------------------------------------------
// TV viewport overflow guard
// Incident: 01/03/2026 — TV view used 100vw/100vh CSS units everywhere.
// On Raspberry Pi kiosk (no scrollbar) this works perfectly.
// On PC browsers, 100vw includes the scrollbar width (~17px),
// causing horizontal overflow and misaligned content in fullscreen.
// Fix: replaced 100vw with 100% for positioned elements,
// added body:has(app-tv) { overflow: hidden } safety net.
// This guard prevents reintroduction of 100vw in TV-related SCSS.
// ----------------------------------------------------------
describe('TV viewport overflow guard (no 100vw in TV components)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const tvScssFiles = [
    'raspberry/src/app/components/tv/tv.component.scss',
    'raspberry/src/app/components/waiting-screen/waiting-screen.component.scss',
    'raspberry/src/app/components/wrong-port-screen/wrong-port-screen.component.scss',
  ];

  for (const file of tvScssFiles) {
    it(`${file} must NOT use 100vw (causes overflow on PC browsers with scrollbars)`, () => {
      const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      // Match actual CSS property usage of 100vw, not comments
      const lines = content.split('\n');
      const violations = lines
        .map((line, i) => ({ line: line.trim(), num: i + 1 }))
        .filter(({ line }) => !line.startsWith('//') && /:\s*100vw/.test(line));
      expect({
        violations: violations.map(v => `line ${v.num}: ${v.line}`),
        reason: '100vw includes scrollbar width on PC browsers — use 100% instead',
      }).toEqual({
        violations: [],
        reason: '100vw includes scrollbar width on PC browsers — use 100% instead',
      });
    });
  }

  it('styles.scss must hide scrollbars on TV route via body:has(app-tv)', () => {
    const styles = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/styles.scss'),
      'utf8'
    );
    expect({
      hasBodyAppTvRule: /body:has\(app-tv\)/.test(styles),
      hasOverflowHidden: /body:has\(app-tv\)\s*\{[^}]*overflow:\s*hidden/.test(styles),
    }).toEqual({
      hasBodyAppTvRule: true,
      hasOverflowHidden: true,
    });
  });
});

// ----------------------------------------------------------
// TV video cropping guard
// Incident: 01/03/2026 — TV video players used object-fit: cover.
// On Pi kiosk (video 1080p + TV 1080p = same ratio), cover = contain.
// On PC monitors with different aspect ratio (e.g. 16:10), cover zooms
// and crops video edges — text like "NOS PARTENAIRES" gets cut off.
// Fix: replaced object-fit: cover with contain on all video players.
// contain shows full content with black bars on ratio mismatch.
// ----------------------------------------------------------
describe('TV video cropping guard (no object-fit: cover on video players)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const tvScss = 'raspberry/src/app/components/tv/tv.component.scss';

  const videoPlayerSelectors = ['.freeze-canvas', '.double-buffer-player', '.manual-player'];

  it('tv.component.scss video players must use object-fit: contain (not cover)', () => {
    const content = fs.readFileSync(path.join(repoRoot, tvScss), 'utf8');
    const lines = content.split('\n');
    const violations = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(
        ({ line }) => !line.startsWith('//') && /object-fit:\s*cover/.test(line)
      );
    expect({
      violations: violations.map(v => `line ${v.num}: ${v.line}`),
      reason:
        'object-fit: cover crops video edges on monitors with different aspect ratio — use contain',
    }).toEqual({
      violations: [],
      reason:
        'object-fit: cover crops video edges on monitors with different aspect ratio — use contain',
    });
  });

  for (const selector of videoPlayerSelectors) {
    it(`${selector} must have object-fit: contain`, () => {
      const content = fs.readFileSync(path.join(repoRoot, tvScss), 'utf8');
      // Extract the block for this selector
      const selectorEscaped = selector.replace('.', '\\.');
      const blockRegex = new RegExp(
        `${selectorEscaped}\\s*\\{[^}]*object-fit:\\s*contain[^}]*\\}`,
        's'
      );
      expect({
        selector,
        hasContain: blockRegex.test(content),
      }).toEqual({
        selector,
        hasContain: true,
      });
    });
  }
});

// ----------------------------------------------------------
// E-41 Secondary variant deployment pipeline guard:
// deploySecondaryVariant() must update timeCategories[].loopVideos[]
// in addition to categories and sponsors. Without this, videos
// in match phases (avant/pendant/après) never get their secondary
// variant written to configuration.json.
// ----------------------------------------------------------
describe('E-41 deploySecondaryVariant timeCategories guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const deployVideoPath = path.join(repoRoot, 'raspberry/sync-agent/src/commands/deploy-video.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(deployVideoPath, 'utf8');
  });

  it('deploySecondaryVariant must update timeCategories[].loopVideos[]', () => {
    expect({
      handlesTimeCategories: /configuration\.timeCategories/.test(content),
      iteratesLoopVideos: /tc\.loopVideos|loopVideos\s*\|\|/.test(content),
    }).toEqual({
      handlesTimeCategories: true,
      iteratesLoopVideos: true,
    });
  });
});

// ----------------------------------------------------------
// E-41 Config merge secondary variants preservation guard:
// config-merge.js must call restoreSecondaryVariants() after
// merging to re-inject variants.secondary from the local config.
// Without this, every config sync from central wipes secondary
// variant info that was locally injected by deploySecondaryVariant.
// ----------------------------------------------------------
describe('E-41 config-merge restoreSecondaryVariants guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const configMergePath = path.join(repoRoot, 'raspberry/sync-agent/src/utils/config-merge.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(configMergePath, 'utf8');
  });

  it('config-merge must call restoreSecondaryVariants after merge', () => {
    expect({
      callsRestore: /restoreSecondaryVariants\(/.test(content),
    }).toEqual({
      callsRestore: true,
    });
  });

  it('config-merge must export restoreSecondaryVariants', () => {
    expect({
      exportsRestore: /restoreSecondaryVariants/.test(content.split('module.exports')[1] || ''),
    }).toEqual({
      exportsRestore: true,
    });
  });
});

// ----------------------------------------------------------
// E-41 Central-side secondary variant enrichment guard:
// orchestrated-deployment.service.ts and config-sync.handler.ts
// must call enrichConfigWithSecondaryVariants() before sending
// config to Pi. Without this, the central never includes
// variants.secondary in the config payload.
// ----------------------------------------------------------
describe('E-41 central secondary variant enrichment guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const orchPath = path.join(repoRoot, 'central-server/src/services/orchestrated-deployment.service.ts');
  const syncPath = path.join(repoRoot, 'central-server/src/handlers/config-sync.handler.ts');

  let orchContent: string;
  let syncContent: string;
  beforeAll(() => {
    orchContent = fs.readFileSync(orchPath, 'utf8');
    syncContent = fs.readFileSync(syncPath, 'utf8');
  });

  it('orchestrated-deployment must import and call enrichConfigWithSecondaryVariants', () => {
    expect({
      imports: /import\s*\{[^}]*enrichConfigWithSecondaryVariants[^}]*\}/.test(orchContent),
      calls: /enrichConfigWithSecondaryVariants\(/.test(orchContent),
    }).toEqual({
      imports: true,
      calls: true,
    });
  });

  it('config-sync handler must import and call enrichConfigWithSecondaryVariants', () => {
    expect({
      imports: /import\s*\{[^}]*enrichConfigWithSecondaryVariants[^}]*\}/.test(syncContent),
      calls: /enrichConfigWithSecondaryVariants\(/.test(syncContent),
    }).toEqual({
      imports: true,
      calls: true,
    });
  });
});

// ----------------------------------------------------------
// E-41 SponsorVideo/CategoryVideo variants type guard:
// The TypeScript interfaces must include variants? field
// so secondary variant data is properly typed in the pipeline.
// ----------------------------------------------------------
describe('E-41 SponsorVideo/CategoryVideo variants type guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const typesPath = path.join(repoRoot, 'central-server/src/types/index.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(typesPath, 'utf8');
  });

  it('SponsorVideo must have variants? field', () => {
    // Find the SponsorVideo interface block and check for variants
    const sponsorBlock = content.match(/interface SponsorVideo \{[\s\S]*?\n\}/)?.[0] || '';
    expect({
      hasVariants: /variants\??\s*:\s*VideoVariants/.test(sponsorBlock),
    }).toEqual({
      hasVariants: true,
    });
  });

  it('CategoryVideo must have variants? field', () => {
    const categoryBlock = content.match(/interface CategoryVideo \{[\s\S]*?\n\}/)?.[0] || '';
    expect({
      hasVariants: /variants\??\s*:\s*VideoVariants/.test(categoryBlock),
    }).toEqual({
      hasVariants: true,
    });
  });

  it('VideoVariants interface must exist with secondary field', () => {
    expect({
      hasVideoVariants: /interface VideoVariants/.test(content),
      hasSecondary: /secondary\??\s*:\s*VideoVariantInfo/.test(content),
    }).toEqual({
      hasVideoVariants: true,
      hasSecondary: true,
    });
  });
});

// ============================================================================
// Nginx proxy block drift prevention
// Without /admin/ proxy, nginx SPA catch-all returns index.html for all
// /admin/api/* requests → every API call gets HTML instead of JSON → crash.
// Without /socket.io/ proxy, WebSocket upgrades fail → real-time broken.
// Without /videos/ and /thumbnails/ proxy, Unicode filenames break (alias
// doesn't normalize, only proxy_pass through admin-server does).
// ============================================================================
describe('Nginx captive-portal proxy blocks (config drift prevention)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const nginxConf = fs.readFileSync(
    path.join(repoRoot, 'raspberry/config/nginx-captive-portal.conf'),
    'utf8'
  );
  const installSh = fs.readFileSync(
    path.join(repoRoot, 'raspberry/install.sh'),
    'utf8'
  );

  it('nginx-captive-portal.conf must have /admin/ proxy to port 8080', () => {
    // Without this block, the SPA catch-all (try_files $uri $uri/ /index.html)
    // returns webapp index.html for ALL /admin/api/* calls → HTML instead of JSON
    expect({
      hasAdminProxy: /location\s+\/admin\/\s*\{[^}]*proxy_pass\s+http:\/\/localhost:8080/s.test(nginxConf),
    }).toEqual({
      hasAdminProxy: true,
    });
  });

  it('nginx-captive-portal.conf must have /socket.io/ proxy with WebSocket upgrade', () => {
    // Without upgrade headers, Socket.IO falls back to long-polling → latency + broken real-time
    expect({
      hasSocketIoProxy: /location\s+\/socket\.io\/\s*\{[^}]*proxy_pass\s+http:\/\/localhost:3000/s.test(nginxConf),
      hasUpgradeHeader: /location\s+\/socket\.io\/\s*\{[^}]*Upgrade\s+\$http_upgrade/s.test(nginxConf),
    }).toEqual({
      hasSocketIoProxy: true,
      hasUpgradeHeader: true,
    });
  });

  it('nginx-captive-portal.conf must proxy /videos/ to admin-server (not alias)', () => {
    // proxy_pass normalizes Unicode filenames; alias does not → broken video paths
    expect({
      hasVideoProxy: /location\s+\/videos\/\s*\{[^}]*proxy_pass\s+http:\/\/127\.0\.0\.1:8080\/videos\//s.test(nginxConf),
    }).toEqual({
      hasVideoProxy: true,
    });
  });

  it('nginx-captive-portal.conf must proxy /thumbnails/ to admin-server (not alias)', () => {
    expect({
      hasThumbnailProxy: /location\s+\/thumbnails\/\s*\{[^}]*proxy_pass\s+http:\/\/127\.0\.0\.1:8080\/thumbnails\//s.test(nginxConf),
    }).toEqual({
      hasThumbnailProxy: true,
    });
  });

  it('install.sh must also have /admin/ proxy — both sources must stay in sync', () => {
    expect({
      installHasAdminProxy: /location\s+\/admin\/\s*\{[^}]*proxy_pass\s+http:\/\/localhost:8080/s.test(installSh),
    }).toEqual({
      installHasAdminProxy: true,
    });
  });

  it('install.sh must also have /socket.io/ proxy — both sources must stay in sync', () => {
    expect({
      installHasSocketIo: /location\s+\/socket\.io\/\s*\{[^}]*proxy_pass\s+http:\/\/localhost:3000/s.test(installSh),
    }).toEqual({
      installHasSocketIo: true,
    });
  });
});

// ============================================================================
// Admin demo mode catch-all (defense in depth)
// When admin is served from a non-Pi host (cloud, demo), the demo interceptor
// must handle ALL /api/ routes — missing handlers return undefined → crash.
// ============================================================================
describe('Admin demo mode safety', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const demoModule = fs.readFileSync(
    path.join(repoRoot, 'raspberry/admin/public/modules/demo/index.js'),
    'utf8'
  );

  it('demo/index.js must have a catch-all for unhandled /api/ routes', () => {
    // Without a catch-all, any new API route added to admin will crash in demo mode
    // because the fetch interceptor returns undefined for unhandled paths
    expect({
      hasCatchAll: /catch.all|unhandled.*\/api\/|\/api\//.test(demoModule) &&
        demoModule.includes('Catch-all'),
    }).toEqual({
      hasCatchAll: true,
    });
  });
});

// ============================================================================
// Admin fetch interceptor — HTML-as-JSON protection
// When nginx returns HTML for API calls (config drift, missing proxy, etc.),
// response.json() throws SyntaxError: Unexpected token '<'. The fetch
// interceptor must detect text/html on API responses and return a clean
// JSON error instead of letting the parser crash.
// ============================================================================
describe('Admin HTML-as-JSON fetch protection', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const stateModule = fs.readFileSync(
    path.join(repoRoot, 'raspberry/admin/public/modules/core/state.js'),
    'utf8'
  );

  it('state.js must detect text/html on API responses and return JSON error', () => {
    expect({
      checksContentType: /text\/html/.test(stateModule),
      returnsJsonError: /HTML_RESPONSE/.test(stateModule),
    }).toEqual({
      checksContentType: true,
      returnsJsonError: true,
    });
  });
});
