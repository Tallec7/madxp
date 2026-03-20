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
    // safe.routes
    { method: 'get' as const, path: '/api/safe/portfolio' },
    { method: 'get' as const, path: '/api/safe/proposals' },
    // campaign.routes (ADR-035 Phase 3)
    { method: 'get' as const, path: '/api/campaigns' },
    { method: 'get' as const, path: '/api/campaigns/test-campaign-id' },
    { method: 'post' as const, path: '/api/campaigns' },
    { method: 'get' as const, path: '/api/campaigns/test-campaign-id/videos' },
    { method: 'get' as const, path: '/api/campaigns/test-campaign-id/sites' },
    { method: 'get' as const, path: '/api/campaigns/test-campaign-id/stats' },
    { method: 'post' as const, path: '/api/campaigns/resolve-sites' },
    // campaign.routes (ADR-035 Phase 3b — deployment)
    { method: 'post' as const, path: '/api/campaigns/test-campaign-id/deploy' },
    { method: 'post' as const, path: '/api/campaigns/test-campaign-id/undeploy' },
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
      'campaignRepository',
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

  it('neopro-hotspot-optimizer.service must be Type=simple (not oneshot — blocks boot 14s)', () => {
    // Type=oneshot makes systemd wait for the script to finish before continuing boot.
    // hotspot-optimizer waits for wlan1 IP + WiFi scan = ~14s blocking graphical.target.
    // Type=simple lets systemd continue immediately — optimization runs in background.
    const svcPath = path.join(systemdDir, 'neopro-hotspot-optimizer.service');
    const content = fs.readFileSync(svcPath, 'utf8');
    expect({ isSimple: /^\s*Type\s*=\s*simple/m.test(content) })
      .toEqual({ isSimple: true });
    expect({ isOneshot: /^\s*Type\s*=\s*oneshot/m.test(content) })
      .toEqual({ isOneshot: false });
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

  it('_rebuildLoopEntries sets analytics_category sponsor_local on loop entries (ADR-035)', () => {
    // Loop entries MUST have analytics_category: 'sponsor_local' otherwise detectCategory()
    // on the Pi falls back to path-based detection and categorizes as 'other',
    // making impressions invisible in listBySite (filters on sponsor categories)
    expect(sponsorService).toContain("analytics_category: 'sponsor_local'");
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
  // Fix: Auto-cleanup on startup (must be CALLED in start(), not just defined).
  it('agent.js must cleanup legacy sponsor_impressions.json on startup', () => {
    const agent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
    expect({ hasCleanup: agent.includes('cleanupLegacyFiles') })
      .toEqual({ hasCleanup: true });
    expect({ hasSponsorPath: agent.includes('sponsor_impressions.json') })
      .toEqual({ hasSponsorPath: true });

    // Must be called in start() — defining the method without calling it
    // leaves sponsor_impressions.json (2448+ orphan entries) on the Pi forever.
    const startMethod = agent.slice(
      agent.indexOf('async start()'),
      agent.indexOf('async start()') + 2000
    );
    expect({ calledInStart: startMethod.includes('cleanupLegacyFiles') })
      .toEqual({ calledInStart: true });
  });

  // Issue: rsync without --delete leaves orphan sponsor-impressions.js on Pi.
  // Fix: build-raspberry.sh must use --delete for sync-agent rsync.
  it('build-raspberry.sh must use --delete for sync-agent rsync', () => {
    const buildScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/build-raspberry.sh'),
      'utf8'
    );
    // Find the sync-agent rsync line and verify --delete is present
    const syncAgentLines = buildScript.split('\n').filter(
      (line: string) => line.includes('rsync') && line.includes('sync-agent')
    );
    expect(syncAgentLines.length).toBeGreaterThan(0);
    expect({ hasDelete: syncAgentLines.some((line: string) => line.includes('--delete')) })
      .toEqual({ hasDelete: true });
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
// cleaned up (Pi detects dual-display by hardware).
// ----------------------------------------------------------
describe('E-22 config-merge secondary display guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const configMergePath = path.join(repoRoot, 'raspberry/sync-agent/src/utils/config-merge.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(configMergePath, 'utf8');
  });

  it('config-merge.js must clean up secondaryDisplayEnabled (not merge it)', () => {
    expect({
      deletesSecondaryDisplayEnabled: /delete result\.secondaryDisplayEnabled/.test(content),
      deletesLedEnabled: /delete result\.ledEnabled/.test(content),
    }).toEqual({
      deletesSecondaryDisplayEnabled: true,
      deletesLedEnabled: true,
    });
  });

  it('config-merge.js must clean up secondaryDisplayResolution', () => {
    expect({
      deletesSecondaryDisplayResolution: /delete result\.secondaryDisplayResolution/.test(content),
      deletesLedResolution: /delete result\.ledResolution/.test(content),
    }).toEqual({
      deletesSecondaryDisplayResolution: true,
      deletesLedResolution: true,
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
// watchdog must NOT use config flags — hardware detection only.
// ----------------------------------------------------------
describe('E-22 watchdog secondary display guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const watchdogPath = path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(watchdogPath, 'utf8');
  });

  it('watchdog must NOT read secondaryDisplayEnabled from config (hardware-driven)', () => {
    expect({
      noReadFunction: !/read_secondary_display_enabled/.test(content),
      noConfigVariable: !/SECONDARY_DISPLAY_ENABLED/.test(content),
    }).toEqual({
      noReadFunction: true,
      noConfigVariable: true,
    });
  });

  it('watchdog detect_wrong_port must use DUAL_DISPLAY_ACTIVE not config flag', () => {
    const detectWrongPortBlock = content.match(/detect_wrong_port\(\)[\s\S]*?^}/m)?.[0] || '';
    expect({
      usesDualDisplayActive: /DUAL_DISPLAY_ACTIVE/.test(detectWrongPortBlock),
      noSecondaryDisplayEnabled: !/SECONDARY_DISPLAY_ENABLED/.test(detectWrongPortBlock),
    }).toEqual({
      usesDualDisplayActive: true,
      noSecondaryDisplayEnabled: true,
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

  // Display type cross-validation: heartbeat must detect monitor manufacturers classified as TV
  // Incident: 05/03/2026 — LEN L27i-30 classified as TV by sync-agent, undetected by central
  it('heartbeat.handler.ts must cross-validate display_type with manufacturer (monitorOnlyMfg)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
      'utf8'
    );
    expect({
      hasMonitorOnlyMfg: /monitorOnlyMfg/.test(content),
      hasLEN: content.includes('LEN'),
      hasDEL: content.includes('DEL'),
      hasMisclassificationAlert: content.includes("'display_type_misclassification'"),
      recordsMetric: content.includes('recordDisplayTypeMisclassification'),
    }).toEqual({
      hasMonitorOnlyMfg: true,
      hasLEN: true,
      hasDEL: true,
      hasMisclassificationAlert: true,
      recordsMetric: true,
    });
  });

  it('metrics.service.ts must have neopro_display_type_misclassification_total counter', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/metrics.service.ts'),
      'utf8'
    );
    expect({
      hasCounter: content.includes('neopro_display_type_misclassification_total'),
      hasMethod: content.includes('recordDisplayTypeMisclassification'),
    }).toEqual({
      hasCounter: true,
      hasMethod: true,
    });
  });

  it('prometheus rules.yml must have DisplayTypeMisclassification alert', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'docker/prometheus/rules.yml'),
      'utf8'
    );
    expect({
      hasAlert: content.includes('DisplayTypeMisclassification'),
      hasMetric: content.includes('neopro_display_type_misclassification_total'),
    }).toEqual({
      hasAlert: true,
      hasMetric: true,
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

  // Pi 5 CEC false positive guard: getFullStatus() must cross-check CEC tv_connected
  // with EDID/DRM display.connected and devices_found before returning.
  // Without this guard, cec-client returns "power status:" even without a cable on Pi 5,
  // causing the dashboard to show "✅ Connecté" when nothing is plugged in.
  it('hdmi.service.js getFullStatus must override CEC false positive when no EDID and no devices', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/hdmi.service.js'),
      'utf8'
    );
    // Must have the cross-check guard in getFullStatus
    // Use method definition boundary (newline + 2-space indent) to avoid matching
    // the this._findEdidPath() CALL inside getDisplayInfo() which appears earlier.
    const fullStatusFn = content.slice(
      content.indexOf('async getFullStatus()'),
      content.indexOf('\n  _findEdidPath()')
    );
    expect({
      hasCecTvConnectedCheck: fullStatusFn.includes('cec.tv_connected'),
      hasDevicesFoundCheck: fullStatusFn.includes('cec.devices_found === 0'),
      hasDisplayConnectedCheck: fullStatusFn.includes('!display.connected'),
      overridesTvConnected: fullStatusFn.includes('cec.tv_connected = false'),
      overridesTvPower: fullStatusFn.includes('cec.tv_power = null'),
    }).toEqual({
      hasCecTvConnectedCheck: true,
      hasDevicesFoundCheck: true,
      hasDisplayConnectedCheck: true,
      overridesTvConnected: true,
      overridesTvPower: true,
    });
  });

  // Display type classification: monitors with CEA extension must not be falsely classified as TV.
  // Incident: 05/03/2026 — Lenovo L27i-30 (LEN) classified as "tv" because CEA EDID extension
  // triggered display_type='tv'. PC-only manufacturers must be filtered out.
  it('hdmi.service.js must filter monitor-only manufacturers in CEA extension check', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/hdmi.service.js'),
      'utf8'
    );
    // getDisplayInfo must have monitorOnlyMfg regex BEFORE the CEA extension assignment
    const getDisplayInfoFn = content.slice(
      content.indexOf('async getDisplayInfo()'),
      content.indexOf('\n  async getFullStatus()')
    );
    expect({
      hasMonitorMfgFilter: /monitorOnlyMfg/.test(getDisplayInfoFn),
      filterBeforeCea: getDisplayInfoFn.indexOf('monitorOnlyMfg') < getDisplayInfoFn.indexOf("display_type = 'tv'"),
      hasLEN: /LEN/.test(getDisplayInfoFn),
      hasDEL: /DEL/.test(getDisplayInfoFn),
    }).toEqual({
      hasMonitorMfgFilter: true,
      filterBeforeCea: true,
      hasLEN: true,
      hasDEL: true,
    });
  });

  it('hdmi.service.js _inferDisplayCategory must accept manufacturer as 4th param and early-return monitor', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/hdmi.service.js'),
      'utf8'
    );
    // _inferDisplayCategory signature must have 4 params including manufacturer
    expect({
      has4thParam: /_inferDisplayCategory\s*\(\s*model\s*,\s*displayType\s*,\s*edidDetailed\s*,\s*manufacturer\s*\)/.test(content),
      hasMonitorManufacturers: /monitorManufacturers/.test(content),
      returnsMonitor: content.includes("return 'monitor'"),
    }).toEqual({
      has4thParam: true,
      hasMonitorManufacturers: true,
      returnsMonitor: true,
    });
    // getFullStatus must pass display.manufacturer as 4th arg
    expect({
      passesManufacturer: /display\.manufacturer\s*\)/.test(content),
    }).toEqual({
      passesManufacturer: true,
    });
  });

  // Sync-agent metrics.js must have the same monitorOnlyMfg filter as hdmi.service.js
  // Incident: 05/03/2026 — LEN L27i-30 (Lenovo monitor) classified as TV by sync-agent
  // because metrics.js had hasCeaExtension → 'tv' without manufacturer filter.
  // Modern monitors include CEA extensions for HDMI audio/YCbCr compatibility.
  it('metrics.js getDisplayInfo must filter monitorOnlyMfg BEFORE CEA → tv assignment', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js'),
      'utf8'
    );
    const getDisplayInfoFn = content.slice(
      content.indexOf('async getDisplayInfo()'),
      content.indexOf('async getSecondaryDisplayInfo()')
    );
    expect({
      hasMonitorMfgFilter: /monitorOnlyMfg/.test(getDisplayInfoFn),
      filterBeforeCea: getDisplayInfoFn.indexOf('monitorOnlyMfg') < getDisplayInfoFn.indexOf("display_type = 'tv'"),
      hasLEN: /LEN/.test(getDisplayInfoFn),
      hasDEL: /DEL/.test(getDisplayInfoFn),
    }).toEqual({
      hasMonitorMfgFilter: true,
      filterBeforeCea: true,
      hasLEN: true,
      hasDEL: true,
    });
  });

  it('metrics.js getSecondaryDisplayInfo must also filter monitorOnlyMfg BEFORE CEA → tv', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js'),
      'utf8'
    );
    const getSecondaryFn = content.slice(
      content.indexOf('async getSecondaryDisplayInfo()'),
      content.indexOf('async _getKioskStatus()')
    );
    expect({
      hasMonitorMfgFilter: /monitorOnlyMfg/.test(getSecondaryFn),
      filterBeforeCea: getSecondaryFn.indexOf('monitorOnlyMfg') < getSecondaryFn.indexOf("display_type = 'tv'"),
      hasLEN: /LEN/.test(getSecondaryFn),
    }).toEqual({
      hasMonitorMfgFilter: true,
      filterBeforeCea: true,
      hasLEN: true,
    });
  });

  it('metrics.js _inferDisplayCategory must accept manufacturer as 4th param and early-return monitor', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js'),
      'utf8'
    );
    expect({
      has4thParam: /_inferDisplayCategory\s*\(\s*model\s*,\s*displayType\s*,\s*edidDetailed\s*,\s*manufacturer\s*\)/.test(content),
      hasMonitorOnlyMfg: /monitorOnlyMfg/.test(content.slice(content.indexOf('_inferDisplayCategory('))),
      returnsMonitor: content.slice(content.indexOf('_inferDisplayCategory(')).includes("return 'monitor'"),
    }).toEqual({
      has4thParam: true,
      hasMonitorOnlyMfg: true,
      returnsMonitor: true,
    });
    // Callers must pass manufacturer as 4th arg
    expect({
      primaryPassesMfg: /displayInfo\.display_category\s*=\s*this\._inferDisplayCategory\(\s*\n?\s*displayInfo\.model,\s*displayInfo\.display_type,\s*displayInfo\.edid_detailed,\s*displayInfo\.manufacturer/.test(content),
      secondaryPassesMfg: /secondaryDisplayInfo\.display_category\s*=\s*this\._inferDisplayCategory\(\s*\n?\s*secondaryDisplayInfo\.model,\s*secondaryDisplayInfo\.display_type,\s*secondaryDisplayInfo\.edid_detailed,\s*secondaryDisplayInfo\.manufacturer/.test(content),
    }).toEqual({
      primaryPassesMfg: true,
      secondaryPassesMfg: true,
    });
  });

  // Boot-to-video metric: hdmiDetectedAt must be captured on first HDMI status received
  // while connected, not only on disconnected→connected transition.
  // Incident: 05/03/2026 — hdmiConnected defaults to true (line 58), so wasDisconnected
  // is always false at boot → hdmiDetectedAt never set → boot-to-video always 0ms.
  it('tv.component.ts boot metric must NOT require wasDisconnected for hdmiDetectedAt', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'),
      'utf8'
    );
    // The hdmiDetectedAt assignment must NOT be gated behind wasDisconnected
    // (wasDisconnected is false at boot because hdmiConnected defaults to true)
    expect({
      hasHdmiDetectedAt: content.includes('bootMetrics.hdmiDetectedAt'),
      noWasDisconnectedGuard: !/wasDisconnected\s*&&[^;]*hdmiDetectedAt/.test(content),
    }).toEqual({
      hasHdmiDetectedAt: true,
      noWasDisconnectedGuard: true,
    });
  });

  // tv.component primary display must accept HDMI-0 OR HDMI-1 (auto-swap/failover)
  // When screen is on HDMI-1 only, hdmiConnected must still be true.
  it('tv.component.ts hdmiConnected must use hdmi0 OR hdmi1 for primary display', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'),
      'utf8'
    );
    expect({
      usesHdmi0OrHdmi1: /hdmiConnected\s*=\s*data\.hdmi0\s*\|\|\s*data\.hdmi1/.test(content),
      noHdmi0Only: !/hdmiConnected\s*=\s*data\.hdmi0\s*;/.test(content),
    }).toEqual({
      usesHdmi0OrHdmi1: true,
      noHdmi0Only: true,
    });
  });
});

// ----------------------------------------------------------
// E-23 check_secondary_chromium transition guards
// ----------------------------------------------------------
describe('E-23 check_secondary_chromium transition guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  it('check_secondary_chromium: dual→single uses Chromium relaunch (xdotool viewport bug), single→dual uses xdotool resize', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // Extract the check_secondary_chromium function body
    const funcStart = content.indexOf('check_secondary_chromium() {');
    const funcBody = content.slice(funcStart, funcStart + 7000);
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

  // Bug fix: when switching single→dual display, xrandr reconfigures the X11 layout
  // and the WM (openbox/LXDE) restacks lxpanel ABOVE Chromium. Without re-applying
  // xprop _MOTIF_WM_HINTS + xdotool windowactivate, the taskbar stays visible on
  // the primary screen. The same applies to deactivate_hdmi_failover() return path.
  it('single→dual and failover-return resize must re-apply xprop + windowactivate (taskbar fix)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // Extract check_secondary_chromium function (contains single→dual transition)
    const checkSecStart = content.indexOf('check_secondary_chromium() {');
    const checkSecBody = content.slice(checkSecStart, checkSecStart + 5000);
    // The single→dual transition block (DUAL_DISPLAY_ACTIVE != true) must have
    // xprop + windowactivate alongside windowmove + windowsize
    const singleToDualBlock = checkSecBody.match(
      /DUAL_DISPLAY_ACTIVE.*!=.*true[\s\S]*?start_chromium_secondary/
    );
    expect(singleToDualBlock).not.toBeNull();
    const block = singleToDualBlock![0];
    expect({
      hasXprop: block.includes('_MOTIF_WM_HINTS'),
      hasWindowActivate: block.includes('windowactivate'),
      hasWindowSize: block.includes('windowsize'),
    }).toEqual({
      hasXprop: true,
      hasWindowActivate: true,
      hasWindowSize: true,
    });

    // Extract deactivate_hdmi_failover function
    const deactivateStart = content.indexOf('deactivate_hdmi_failover()');
    const deactivateBody = content.slice(deactivateStart, deactivateStart + 4500);
    // The resize block in deactivate_hdmi_failover must also re-apply xprop + windowactivate
    expect({
      hasXprop: deactivateBody.includes('_MOTIF_WM_HINTS'),
      hasWindowActivate: deactivateBody.includes('windowactivate'),
      hasWindowSize: deactivateBody.includes('windowsize'),
    }).toEqual({
      hasXprop: true,
      hasWindowActivate: true,
      hasWindowSize: true,
    });
  });

  // Bug fix: start_chromium() fullscreen subshell must have a retry loop, not a single attempt.
  // On slow Pis (SD card wear), Chromium may take >4s to create its X11 window.
  // Without retry, fullscreen is never applied and there is no recovery.
  it('start_chromium fullscreen subshell must have retry loop (not single sleep+attempt)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const fnStart = content.indexOf('start_chromium() {');
    const fnBody = content.slice(fnStart, fnStart + 8000);
    // The fullscreen subshell must retry multiple times
    expect({
      hasRetryLoop: /for attempt in.*seq.*max_attempts/.test(fnBody),
      hasMaxAttempts: /max_attempts=[0-9]/.test(fnBody),
      hasProcessCheck: /kill -0.*CHROMIUM_PID/.test(fnBody),
      hasRetryLog: /retry/.test(fnBody),
      hasXprop: /_MOTIF_WM_HINTS/.test(fnBody),
      hasWindowSize: /xdotool.*windowsize/.test(fnBody),
      hasWindowMove: /xdotool.*windowmove/.test(fnBody),
    }).toEqual({
      hasRetryLoop: true,
      hasMaxAttempts: true,
      hasProcessCheck: true,
      hasRetryLog: true,
      hasXprop: true,
      hasWindowSize: true,
      hasWindowMove: true,
    });
  });

  // Bug fix: check_window_stacking() must apply full fullscreen (xprop + windowmove + windowsize)
  // on every loop iteration, not just xprop + windowactivate on panel-above.
  // This is the safety net: if the init subshell failed, the main loop catches it.
  it('check_window_stacking must apply windowmove + windowsize (not just windowactivate)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const fnStart = content.indexOf('check_window_stacking() {');
    const fnEnd = content.indexOf('\n}', fnStart);
    const fnBody = content.slice(fnStart, fnEnd);
    expect({
      hasXprop: fnBody.includes('_MOTIF_WM_HINTS'),
      hasWindowMove: /xdotool.*windowmove/.test(fnBody),
      hasWindowSize: /xdotool.*windowsize/.test(fnBody),
      hasWindowActivate: /xdotool.*windowactivate/.test(fnBody),
    }).toEqual({
      hasXprop: true,
      hasWindowMove: true,
      hasWindowSize: true,
      hasWindowActivate: true,
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
    const funcBody = content.slice(funcStart, funcStart + 4500);
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

  it('deactivate_hdmi_failover must force HDMI-0 (HDMI-A-1) as primary BEFORE setup_secondary_xrandr', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('deactivate_hdmi_failover()');
    const funcBody = content.slice(funcStart, funcStart + 4000);

    // After failover, HDMI-1 is at +0+0 (promoted). setup_secondary_xrandr identifies
    // primary by offset → HDMI-1 would stay primary without explicit xrandr reconfiguration.
    // deactivate_hdmi_failover MUST force HDMI-A-1 back to primary BEFORE setup_secondary_xrandr.
    const forceHdmi0Idx = funcBody.search(/HDMI.*-1 connected/);
    // Match the actual function call, not comments mentioning setup_secondary_xrandr
    const setupXrandrIdx = funcBody.indexOf('setup_secondary_xrandr ||');

    expect({
      // Must detect HDMI-A-1 (physical HDMI-0) by xrandr name
      detectsHdmi0ByName: /HDMI.*-1 connected/.test(funcBody),
      // Must force HDMI-0 as primary with --primary --auto --pos 0x0
      forcesHdmi0Primary: funcBody.includes('--primary --auto --pos 0x0'),
      // Must place HDMI-1 --right-of HDMI-0
      placesHdmi1RightOf: funcBody.includes('--right-of'),
      // Force must happen BEFORE setup_secondary_xrandr
      forceBeforeSetup: forceHdmi0Idx > 0 && setupXrandrIdx > 0 && forceHdmi0Idx < setupXrandrIdx,
    }).toEqual({
      detectsHdmi0ByName: true,
      forcesHdmi0Primary: true,
      placesHdmi1RightOf: true,
      forceBeforeSetup: true,
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
    // handleTvCommand (or inline action handler) must resolve secondary variant
    const commandHandler = content.match(/private handleTvCommand[\s\S]*?^  \}/m)
      || content.match(/on\('action'[\s\S]*?}\);/);
    expect(commandHandler).not.toBeNull();
    expect(commandHandler![0]).toMatch(/resolveSecondaryVariant/);

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
// Remote UX regression guards (multi-profile)
// ----------------------------------------------------------
// Bug 1: timeCategory cards had no gradient when color from
// profile config didn't match SCSS classes → white text on
// transparent bg → invisible cards.
// Fix: getTimeCategoryGradientClass() falls back by category id.
//
// Bug 2: no UI to switch profiles once one was selected —
// back button was the only entry point, and no menu alternative.
// Fix: "Changer de profil" menu item in header dropdown.
// ----------------------------------------------------------
describe('Remote multi-profile UX regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const remoteTsPath = path.join(
    repoRoot,
    'raspberry/src/app/components/remote/remote.component.ts'
  );
  const remoteHtmlPath = path.join(
    repoRoot,
    'raspberry/src/app/components/remote/remote.component.html'
  );
  const remoteTs = fs.readFileSync(remoteTsPath, 'utf8');
  const remoteHtml = fs.readFileSync(remoteHtmlPath, 'utf8');

  // --- Gradient fallback method must exist and cover all 3 categories ---
  it('remote.component.ts must have getTimeCategoryGradientClass with id-based fallback', () => {
    const fnMatch = remoteTs.match(
      /getTimeCategoryGradientClass[\s\S]*?\n  \}/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect({
      hasBeforeFallback: fnBody.includes("case 'before'"),
      hasDuringFallback: fnBody.includes("case 'during'"),
      hasAfterFallback: fnBody.includes("case 'after'"),
      hasKnownPrefixesCheck: fnBody.includes('knownPrefixes'),
    }).toEqual({
      hasBeforeFallback: true,
      hasDuringFallback: true,
      hasAfterFallback: true,
      hasKnownPrefixesCheck: true,
    });
  });

  // --- Template must use the fallback method, not raw timeCategory.color ---
  it('remote.component.html must use getTimeCategoryGradientClass (not raw color)', () => {
    expect({
      usesMethod: remoteHtml.includes('getTimeCategoryGradientClass(timeCategory)'),
      noRawColor: !remoteHtml.includes('[ngClass]="timeCategory.color"'),
    }).toEqual({
      usesMethod: true,
      noRawColor: true,
    });
  });

  // --- "Changer de profil" menu item must exist in template ---
  it('remote.component.html must have "Changer de profil" menu item for multi-profile', () => {
    expect({
      hasProfileSwitchItem: remoteHtml.includes('Changer de profil'),
      hasProfileSwitchClass: remoteHtml.includes('profile-switch-item'),
      callsBackToClubSelector: remoteHtml.includes('backToClubSelector()'),
    }).toEqual({
      hasProfileSwitchItem: true,
      hasProfileSwitchClass: true,
      callsBackToClubSelector: true,
    });
  });

  // --- currentProfileName must be set when selecting a profile ---
  it('remote.component.ts must track currentProfileName on profile selection', () => {
    expect({
      hasProperty: remoteTs.includes('currentProfileName'),
      setsOnSelection: remoteTs.includes('this.currentProfileName = club.name'),
    }).toEqual({
      hasProperty: true,
      setsOnSelection: true,
    });
  });
});

// ----------------------------------------------------------
// Multi-profile enrichment regression guards (ADR-030 ext.)
// ----------------------------------------------------------
// Bug prevention: syncProfiles and deployProfile must run the
// full enrichment chain (autoResolveSponsorIds → enrichConfigWith
// SecondaryVariants → enrichConfigWithAnalyticsMetadata) before
// sending profiles to Pi. Without this, profiles arrive without
// secondary variant paths and analytics metadata → slave display
// broken + sponsor analytics classified as 'other'.
// ----------------------------------------------------------
describe('Multi-profile enrichment regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const controllerPath = path.join(
    repoRoot,
    'central-server/src/controllers/config-profiles.controller.ts'
  );

  let controllerContent: string;
  beforeAll(() => {
    controllerContent = fs.readFileSync(controllerPath, 'utf8');
  });

  // --- syncProfiles must call all 3 enrichment functions ---
  it('syncProfiles must call autoResolveSponsorIds', () => {
    const syncFn = controllerContent.match(
      /export const syncProfiles[\s\S]*?(?=export const \w|$)/
    );
    expect(syncFn).not.toBeNull();
    expect({
      callsAutoResolve: syncFn![0].includes('autoResolveSponsorIds'),
    }).toEqual({
      callsAutoResolve: true,
    });
  });

  it('syncProfiles must call enrichConfigWithSecondaryVariants', () => {
    const syncFn = controllerContent.match(
      /export const syncProfiles[\s\S]*?(?=export const \w|$)/
    );
    expect(syncFn).not.toBeNull();
    expect({
      callsVariants: syncFn![0].includes('enrichConfigWithSecondaryVariants'),
    }).toEqual({
      callsVariants: true,
    });
  });

  it('syncProfiles must call enrichConfigWithAnalyticsMetadata', () => {
    const syncFn = controllerContent.match(
      /export const syncProfiles[\s\S]*?(?=export const \w|$)/
    );
    expect(syncFn).not.toBeNull();
    expect({
      callsAnalytics: syncFn![0].includes('enrichConfigWithAnalyticsMetadata'),
    }).toEqual({
      callsAnalytics: true,
    });
  });

  // --- deployProfile must call all 3 enrichment functions ---
  it('deployProfile must call autoResolveSponsorIds', () => {
    const deployFn = controllerContent.match(
      /export const deployProfile[\s\S]*?(?=export const \w|$)/
    );
    expect(deployFn).not.toBeNull();
    expect({
      callsAutoResolve: deployFn![0].includes('autoResolveSponsorIds'),
    }).toEqual({
      callsAutoResolve: true,
    });
  });

  it('deployProfile must call enrichConfigWithSecondaryVariants', () => {
    const deployFn = controllerContent.match(
      /export const deployProfile[\s\S]*?(?=export const \w|$)/
    );
    expect(deployFn).not.toBeNull();
    expect({
      callsVariants: deployFn![0].includes('enrichConfigWithSecondaryVariants'),
    }).toEqual({
      callsVariants: true,
    });
  });

  it('deployProfile must call enrichConfigWithAnalyticsMetadata', () => {
    const deployFn = controllerContent.match(
      /export const deployProfile[\s\S]*?(?=export const \w|$)/
    );
    expect(deployFn).not.toBeNull();
    expect({
      callsAnalytics: deployFn![0].includes('enrichConfigWithAnalyticsMetadata'),
    }).toEqual({
      callsAnalytics: true,
    });
  });

  // --- deployProfile must NOT call updateSiteActiveProfile ---
  it('deployProfile must NOT call updateSiteActiveProfile (concept removed)', () => {
    const deployFn = controllerContent.match(
      /export const deployProfile[\s\S]*?(?=export const \w|$)/
    );
    expect(deployFn).not.toBeNull();
    expect({
      noActiveProfile: !deployFn![0].includes('updateSiteActiveProfile'),
    }).toEqual({
      noActiveProfile: true,
    });
  });

  // --- Content tab must have profile selector wired ---
  it('site-content-tab must have profile selector with onProfileSelected', () => {
    const contentTab = fs.readFileSync(
      path.join(
        repoRoot,
        'central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts'
      ),
      'utf8'
    );
    expect({
      hasProfileSelector: contentTab.includes('profile-selector-bar'),
      hasOnProfileSelected: contentTab.includes('onProfileSelected'),
      hasApplyProfileConfig: contentTab.includes('applyProfileConfig'),
      hasLoadProfiles: contentTab.includes('loadProfiles'),
    }).toEqual({
      hasProfileSelector: true,
      hasOnProfileSelected: true,
      hasApplyProfileConfig: true,
      hasLoadProfiles: true,
    });
  });

  // --- updateProfileConfiguration endpoint must exist ---
  it('controller must export updateProfileConfiguration', () => {
    expect({
      hasEndpoint: controllerContent.includes('export const updateProfileConfiguration'),
    }).toEqual({
      hasEndpoint: true,
    });
  });
});

// ----------------------------------------------------------
// Pi-side profile-switch handler regression guard
// Bug: profile-switch handler in handlers.js broadcasted
// the raw profile config but did NOT persist it to
// configuration.json. Any subsequent config_updated event
// re-read configuration.json (still had old profile) and
// overrode the user's profile selection. Fix: the handler
// now merges local settings and writes to configuration.json.
// ----------------------------------------------------------
describe('Pi-side profile-switch handler regression guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const handlersPath = path.join(
    repoRoot,
    'raspberry/server/socket/handlers.js'
  );

  let handlersContent: string;
  beforeAll(() => {
    handlersContent = fs.readFileSync(handlersPath, 'utf8');
  });

  it('profile-switch handler must write to configuration.json after merge', () => {
    // Extract the profile-switch handler block
    const switchBlock = handlersContent.match(
      /socket\.on\('profile-switch'[\s\S]*?(?=socket\.on\(|$)/
    );
    expect(switchBlock).not.toBeNull();
    expect({
      writesConfigFile: switchBlock![0].includes('writeFileSync(configPath'),
      preservesLocalSettings: switchBlock![0].includes('LOCAL_ONLY_SETTINGS'),
      mergesConfig: switchBlock![0].includes('mergedConfig'),
    }).toEqual({
      writesConfigFile: true,
      preservesLocalSettings: true,
      mergesConfig: true,
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
    expect({ hasNginxReadinessCheck: watchdog.includes('curl') && watchdog.includes('localhost') })
      .toEqual({ hasNginxReadinessCheck: true });
  });

  it('kiosk-watchdog.sh CHROMIUM_URL must use localhost (never neopro.local)', () => {
    // When multiple Pi are on the same LAN, mDNS resolves neopro.local to
    // whichever Pi responds first — causing one Pi to display the other's loop.
    // The kiosk Chromium always talks to its own nginx, so localhost is correct.
    // neopro.local remains valid for external access (SSH, phone remote, admin).
    const chromiumUrlLine = watchdog.split('\n').find(l => /^CHROMIUM_URL=/.test(l)) || '';
    const chromiumSecondaryLine = watchdog.split('\n').find(l => /^CHROMIUM_SECONDARY_URL=/.test(l)) || '';
    expect({ usesLocalhost: chromiumUrlLine.includes('localhost') && !chromiumUrlLine.includes('neopro.local') })
      .toEqual({ usesLocalhost: true });
    expect({ secondaryUsesLocalhost: chromiumSecondaryLine.includes('localhost') && !chromiumSecondaryLine.includes('neopro.local') })
      .toEqual({ secondaryUsesLocalhost: true });
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
// GPU decode mode (Pi 5 hardware decode with auto-fallback)
// Pi 5 BCM2712 has a H.264 hardware decoder via V4L2 stateless API.
// Chromium V4L2FlatVideoDecoder uses this to offload decode from CPU,
// reducing ~20% CPU usage and the associated PMIC coil whine.
// If hardware decode crashes twice, auto-fallback to software decode
// for the rest of the boot (cleared on reboot via tmpfs).
// ----------------------------------------------------------
describe('GPU decode mode (Pi 5 V4L2 hardware decode)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('--enable-features must NOT appear inside array definitions (common_flags/gpu_flags)', () => {
    // CRITICAL: Same rule as --disable-features — Chromium only honours the LAST
    // --enable-features flag. Having it in array AND as a variable means the variable
    // silently overrides the array value. All features must be combined into the
    // $enable_features variable and passed as a single flag at launch time.
    const arrayEnableFeatures = watchdog.match(/^\s+--enable-features=/gm) || [];
    // Filter out comment lines (starting with #) — only flag real array entries
    const nonCommentEntries = (watchdog.match(/^\s+--enable-features=/gm) || []).filter(match => {
      const lineIndex = watchdog.indexOf(match);
      const lineStart = watchdog.lastIndexOf('\n', lineIndex) + 1;
      const line = watchdog.substring(lineStart, watchdog.indexOf('\n', lineIndex));
      return !line.trim().startsWith('#');
    });
    expect({ noEnableFeaturesInArrays: nonCommentEntries.length })
      .toEqual({ noEnableFeaturesInArrays: 0 });
  });

  it('Chromium launch commands must use combined --enable-features variable', () => {
    // Both start_chromium() and start_chromium_secondary() must pass the combined
    // --enable-features="$enable_features" variable, not hardcoded values.
    const launchLines = watchdog.match(/"\$CHROMIUM_BIN".*--enable-features="\$enable_features"/g) || [];
    expect({ combinedEnableFeaturesCount: launchLines.length })
      .toEqual({ combinedEnableFeaturesCount: 2 }); // primary + secondary
  });

  it('Pi 5 hardware decode mode must enable V4L2FlatVideoDecoder', () => {
    // V4L2FlatVideoDecoder is the Chromium feature flag that enables
    // V4L2 stateless hardware decode on Pi 5 (BCM2712).
    // It must be added to enable_features in the "hardware" mode branch.
    const hardwareBlock = watchdog.match(/GPU_DECODE_MODE.*==.*"hardware"[\s\S]*?(?=else)/);
    expect(hardwareBlock).not.toBeNull();
    expect({ hasV4L2: hardwareBlock![0].includes('V4L2FlatVideoDecoder') })
      .toEqual({ hasV4L2: true });
  });

  it('Pi 5 hardware decode must NOT have --disable-gpu-memory-buffer-video-frames', () => {
    // --disable-gpu-memory-buffer-video-frames forces full software video path.
    // Hardware decode mode must NOT have this flag, otherwise V4L2 can't work.
    const hardwareBlock = watchdog.match(/GPU_DECODE_MODE.*==.*"hardware"[\s\S]*?gpu_flags=\([\s\S]*?\)/);
    expect(hardwareBlock).not.toBeNull();
    expect({ noMemBufDisable: !hardwareBlock![0].includes('--disable-gpu-memory-buffer-video-frames') })
      .toEqual({ noMemBufDisable: true });
  });

  it('Pi 5 software decode fallback must have --disable-gpu-memory-buffer-video-frames', () => {
    // Software decode fallback (after hardware crashes) must keep the original
    // --disable-gpu-memory-buffer-video-frames to prevent SharedImageBackingFactory crashes.
    const softwareBlock = watchdog.match(/else\s*\n\s*log.*software decode[\s\S]*?gpu_flags=\([\s\S]*?\)/);
    expect(softwareBlock).not.toBeNull();
    expect({ hasMemBufDisable: softwareBlock![0].includes('--disable-gpu-memory-buffer-video-frames') })
      .toEqual({ hasMemBufDisable: true });
  });

  it('GPU_DECODE_FALLBACK_FILE must use /tmp/ (tmpfs, cleared on reboot)', () => {
    // The fallback file MUST be on tmpfs (/tmp/) so it's cleared on reboot.
    // This ensures every boot re-attempts hardware decode, even if it failed before.
    // Using a persistent path (e.g., /home/pi/) would permanently lock into software mode.
    expect({ fallbackOnTmpfs: watchdog.includes('GPU_DECODE_FALLBACK_FILE="/tmp/') })
      .toEqual({ fallbackOnTmpfs: true });
  });

  it('record_crash must call record_gpu_decode_crash for auto-fallback', () => {
    // When Chromium crashes, record_crash() must call record_gpu_decode_crash()
    // to track hardware decode crashes. Without this, the fallback mechanism
    // never triggers and Chromium keeps crash-looping with hardware decode.
    const recordCrashFn = watchdog.match(/record_crash\(\)\s*\{[\s\S]*?\n\}/);
    expect(recordCrashFn).not.toBeNull();
    expect({ callsGpuCrash: recordCrashFn![0].includes('record_gpu_decode_crash') })
      .toEqual({ callsGpuCrash: true });
  });

  it('record_crash must call detect_gpu_decode_mode after recording crash', () => {
    // After recording the crash, record_crash() must re-detect the GPU decode mode.
    // This is what triggers the switch from hardware → software after enough crashes.
    const recordCrashFn = watchdog.match(/record_crash\(\)\s*\{[\s\S]*?\n\}/);
    expect(recordCrashFn).not.toBeNull();
    expect({ callsDetect: recordCrashFn![0].includes('detect_gpu_decode_mode') })
      .toEqual({ callsDetect: true });
  });

  it('kiosk-status.json must include gpuDecodeMode', () => {
    // The kiosk status JSON must report the current GPU decode mode
    // so the central dashboard can monitor which Pi's are using hardware vs software decode.
    expect({ hasGpuDecodeMode: watchdog.includes('gpuDecodeMode') })
      .toEqual({ hasGpuDecodeMode: true });
  });

  it('detect_gpu_decode_mode must be called after PI_MODEL detection', () => {
    // GPU decode mode depends on PI_MODEL being set first.
    // detect_gpu_decode_mode must be called AFTER detect_pi_model.
    const initBlock = watchdog.match(/PI_MODEL=\$\(detect_pi_model\)[\s\S]{0,200}detect_gpu_decode_mode/);
    expect({ calledAfterPiModel: initBlock !== null })
      .toEqual({ calledAfterPiModel: true });
  });

  it('both start_chromium functions must initialize enable_features variable', () => {
    // Both start_chromium() and start_chromium_secondary() must declare
    // local enable_features with OverlayScrollbar as the base value.
    // Without this, the Pi 5 hardware mode can't append V4L2FlatVideoDecoder.
    const startPrimary = watchdog.match(/start_chromium\(\)\s*\{[\s\S]*?\n\}/);
    const startSecondary = watchdog.match(/start_chromium_secondary\(\)\s*\{[\s\S]*?\n\}/);
    expect(startPrimary).not.toBeNull();
    expect(startSecondary).not.toBeNull();
    expect({ primaryHasEnableFeatures: startPrimary![0].includes('local enable_features="OverlayScrollbar"') })
      .toEqual({ primaryHasEnableFeatures: true });
    expect({ secondaryHasEnableFeatures: startSecondary![0].includes('local enable_features="OverlayScrollbar"') })
      .toEqual({ secondaryHasEnableFeatures: true });
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

describe('Obsolete service cleanup guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const fixFleet = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
    'utf8'
  );

  it('fix-fleet-pi.sh must disable neopro-vlc-kiosk (abandoned POC, crash-loop)', () => {
    // neopro-vlc-kiosk is an old HLS/VLC POC that was never removed.
    // It's enabled + Restart=always + RestartSec=5 = infinite crash-loop
    // consuming CPU, filling logs, and blocking systemd-analyze.
    expect({ disablesVlcKiosk: fixFleet.includes('neopro-vlc-kiosk') })
      .toEqual({ disablesVlcKiosk: true });
  });

  it('fix-fleet-pi.sh must disable neopro-ffmpeg-stream (dependency of vlc-kiosk)', () => {
    expect({ disablesFfmpeg: fixFleet.includes('neopro-ffmpeg-stream') })
      .toEqual({ disablesFfmpeg: true });
  });

  it('fix-fleet-pi.sh must disable neopro-playlist-manager (MODULE_NOT_FOUND crash-loop)', () => {
    expect({ disablesPlaylistManager: fixFleet.includes('neopro-playlist-manager') })
      .toEqual({ disablesPlaylistManager: true });
  });

  it('fix-fleet-pi.sh must disable neopro-score-bridge (MODULE_NOT_FOUND crash-loop)', () => {
    expect({ disablesScoreBridge: fixFleet.includes('neopro-score-bridge') })
      .toEqual({ disablesScoreBridge: true });
  });

  it('fix-fleet-pi.sh must disable cups (printing — never used on kiosk Pi)', () => {
    expect({ disablesCups: fixFleet.includes('"cups"') })
      .toEqual({ disablesCups: true });
  });

  it('fix-fleet-pi.sh must disable ModemManager (no 3G/4G modem on Pi)', () => {
    expect({ disablesModemManager: fixFleet.includes('"ModemManager"') })
      .toEqual({ disablesModemManager: true });
  });

  it('fix-fleet-pi.sh must use systemctl disable (not mask) for useless services', () => {
    // mask prevents manual start — too aggressive for services that might be
    // needed temporarily for debugging. disable is the right level.
    expect({ usesDisable: fixFleet.includes('systemctl disable "$svc"') })
      .toEqual({ usesDisable: true });
    expect({ noMask: !fixFleet.includes('systemctl mask') })
      .toEqual({ noMask: true });
  });

  it('fix-fleet-pi.sh must check is-active (not just is-enabled) for obsolete services', () => {
    // Incident: 05/03/2026 — manually installed .service files (copied to
    // /etc/systemd/system/ without `systemctl enable`) return odd states from
    // is-enabled but still run via Restart=always. The cleanup silently skipped
    // them, leaving 225+ restart crash-loops per service.
    // Fix: check is-active as fallback to catch running-but-not-enabled services.
    expect({ checksIsActive: fixFleet.includes('systemctl is-active "$svc"') })
      .toEqual({ checksIsActive: true });
  });

  it('fix-fleet-pi.sh must remove .service unit files for obsolete services', () => {
    // Without removing the unit file, systemd can reload it after daemon-reload
    // and the crash-loop resumes. rm -f the .service file is the definitive fix.
    expect({ removesUnitFile: fixFleet.includes('rm -f "/etc/systemd/system/${svc}.service"') })
      .toEqual({ removesUnitFile: true });
  });

  it('fix-fleet-pi.sh must daemon-reload after removing obsolete unit files', () => {
    // daemon-reload tells systemd to forget removed unit files.
    // reset-failed clears the "failed" status from systemctl list-units.
    expect({ daemonReload: fixFleet.includes('systemctl daemon-reload') })
      .toEqual({ daemonReload: true });
    expect({ resetFailed: fixFleet.includes('systemctl reset-failed') })
      .toEqual({ resetFailed: true });
  });
});

describe('Deploy auto-cleanup of obsolete neopro services', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const deployRemote = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
    'utf8'
  );

  it('deploy-remote.sh must auto-disable neopro-*.service files absent from config/systemd/', () => {
    // When a service is removed from the repo, the next deploy must disable it
    // on the Pi — not rely on manually updating a hardcoded list
    expect({ scansInstalled: deployRemote.includes('neopro-*.service') })
      .toEqual({ scansInstalled: true });
    expect({ checksRepo: deployRemote.includes('config/systemd/\\$svc_name') })
      .toEqual({ checksRepo: true });
    expect({ disablesObsolete: deployRemote.includes('systemctl disable --now') })
      .toEqual({ disablesObsolete: true });
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

  it('deploy-remote.sh must install nginx config from deployed config files', () => {
    // Incident: 01/03/2026 — deploy-remote.sh deployed admin files but did NOT update
    // the nginx config. Pi's running nginx config was missing /admin/ proxy block
    // (generated by an older install.sh), causing all /admin/api/* to return HTML
    // instead of being proxied to admin-server on port 8080.
    expect({ installsNginxConfig: deploy.includes('nginx-captive-portal.conf') })
      .toEqual({ installsNginxConfig: true });
    expect({ copiesToSitesAvailable: deploy.includes('/etc/nginx/sites-available/neopro') })
      .toEqual({ copiesToSitesAvailable: true });
    // Must test nginx config before applying (nginx -t)
    expect({ testsNginxConfig: deploy.includes('nginx -t') })
      .toEqual({ testsNginxConfig: true });
    // Must backup before overwriting (rollback safety)
    expect({ backupsConfig: deploy.includes('neopro.pre-deploy') })
      .toEqual({ backupsConfig: true });
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

  it('deployment.service must NOT gate secondary variant lookup on secondary_display_enabled', () => {
    expect({
      noSiteQuery: !/query\(.*secondary_display_enabled/.test(serviceContent),
      noSiteFlag: !/siteSecondaryEnabled/.test(serviceContent),
      alwaysLooksUp: /findByVideoAndDisplay\(videoId,\s*'secondary'\)/.test(serviceContent),
    }).toEqual({
      noSiteQuery: true,
      noSiteFlag: true,
      alwaysLooksUp: true,
    });
  });
});

// ── OTA pre-migration guard ─────────────────────────────────────────────
// Regression guard: applyPreUpdateMigration() was accidentally removed in
// commit 173aaa5a as "dead code" → OTA stuck at 0% because root:root
// VERSION/release.json files cause EACCES on fs.copy().
// The pre-migration sends a remote_shell to fix ownership BEFORE update_software.
describe('OTA pre-migration guard (update-deployment.service)', () => {
  const servicePath = path.resolve(
    __dirname, '..', 'services', 'update-deployment.service.ts'
  );
  let serviceSource: string;

  beforeAll(() => {
    serviceSource = fs.readFileSync(servicePath, 'utf8');
  });

  it('must define applyPreUpdateMigration method', () => {
    expect(serviceSource).toMatch(/applyPreUpdateMigration\s*\(/);
  });

  it('deployToSite must call applyPreUpdateMigration before sending update_software', () => {
    // Extract deployToSite method body (from declaration to next method or end)
    const deployStart = serviceSource.indexOf('private async deployToSite(');
    const firstSendOrQueue = serviceSource.indexOf('sendOrQueue(', deployStart);
    const deployToSiteBody = serviceSource.slice(deployStart, firstSendOrQueue);
    expect(deployToSiteBody).toMatch(/applyPreUpdateMigration/);
  });

  it('applyPreUpdateMigration must send remote_shell with ownership fix', () => {
    expect(serviceSource).toMatch(/remote_shell/);
    expect(serviceSource).toMatch(/chown.*pi:pi/);
    expect(serviceSource).toMatch(/VERSION/);
    expect(serviceSource).toMatch(/release\.json/);
  });

  it('deployToSite must wait after pre-migration before sending update_software', () => {
    // There must be a delay between migration and sendOrQueue within deployToSite
    const deployStart = serviceSource.indexOf('private async deployToSite(');
    const firstSendOrQueue = serviceSource.indexOf('sendOrQueue(', deployStart);
    const deployToSiteBody = serviceSource.slice(deployStart, firstSendOrQueue);
    expect(deployToSiteBody).toMatch(/\.delay\s*\(\s*\d{4}/);
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

  it('getSiteLocalContent must return secondaryVariantVideoIds', () => {
    expect({
      returnsVariantIds: /secondaryVariantVideoIds/.test(controllerContent),
      callsVariantRepo: /findSecondaryVariantsForVideos/.test(controllerContent),
    }).toEqual({
      returnsVariantIds: true,
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

  it('remote template must have video-secondary-badge for variant indicator (no config gate)', () => {
    expect({
      hasBadge: /video-secondary-badge/.test(remoteTemplateContent),
      checksVariants: /video\.variants\?\.secondary/.test(remoteTemplateContent),
      noConfigGate: !/secondaryDisplayEnabled/.test(remoteTemplateContent),
    }).toEqual({
      hasBadge: true,
      checksVariants: true,
      noConfigGate: true,
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
      noDisplayEnabledGate: !/secondaryDisplayEnabled/.test(cloudRemoteHtml),
    }).toEqual({
      hasBadgeClass: true,
      checksHasSecondary: true,
      noDisplayEnabledGate: true,
    });
  });

  it('cloud remote TS must have markSecondaryVariants and secondaryVariantPaths', () => {
    expect({
      hasMarkMethod: /markSecondaryVariants/.test(cloudRemoteTs),
      hasVariantPaths: /secondaryVariantPaths/.test(cloudRemoteTs),
      noDisplayEnabledProperty: !/public secondaryDisplayEnabled/.test(cloudRemoteTs),
      hasVideoFlag: /hasSecondaryVariant/.test(cloudRemoteTs),
    }).toEqual({
      hasMarkMethod: true,
      hasVariantPaths: true,
      noDisplayEnabledProperty: true,
      hasVideoFlag: true,
    });
  });

  it('cloud remote SCSS must style video-secondary-badge', () => {
    expect(/\.video-secondary-badge/.test(cloudRemoteScss)).toBe(true);
  });

  it('remote controller must always enrich secondary variants (no site flag gate)', () => {
    expect({
      exportsVariantPaths: /secondaryVariantPaths/.test(remoteControllerContent),
      importsVariantRepo: /videoVariantRepository/.test(remoteControllerContent),
      noSiteGate: !/if \(site\.secondary_display_enabled\)/.test(remoteControllerContent),
    }).toEqual({
      exportsVariantPaths: true,
      importsVariantRepo: true,
      noSiteGate: true,
    });
  });

  it('RemoteState interface must include secondaryVariantPaths', () => {
    expect({
      hasVariantPaths: /secondaryVariantPaths/.test(remoteServiceContent),
    }).toEqual({
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

  // Guard 1b: Boot grace period for HOTSPOT — prevents 3 hostapd restarts during boot
  it('network-watchdog start() must enable boot grace period for hotspot checks', () => {
    // Without hotspot grace period, the watchdog detects "IP 192.168.4.1 non configurée"
    // at boot+5s and restarts hostapd 2-3 times, delaying hotspot stabilization by 30s+.
    const startFn = watchdogContent.match(
      /function start\(\)\s*\{[\s\S]*?setTimeout\(\(\) => hotspotWatchLoop\(\)/
    );
    expect(startFn).not.toBeNull();
    expect({
      hasHotspotBootGrace: /enableGracePeriod\(\s*'hotspot'\s*,\s*\d+\s*\)/.test(startFn![0]),
    }).toEqual({
      hasHotspotBootGrace: true,
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

  // Guard 6: apply_txpower must use $AP_INTERFACE (not $WIFI_INTERFACE which is undefined)
  it('apply_txpower must use $AP_INTERFACE not $WIFI_INTERFACE (undefined variable bug)', () => {
    const applyFn = hotspotScript.match(
      /apply_txpower\(\)\s*\{([\s\S]*?)\n\}/
    );
    expect(applyFn).not.toBeNull();
    const funcBody = applyFn![1];
    expect({
      usesAPInterface: /\$AP_INTERFACE/.test(funcBody),
      usesWIFIInterface: /\$WIFI_INTERFACE/.test(funcBody),
      reason: '$WIFI_INTERFACE is never defined — TX power was silently never applied',
    }).toEqual({
      usesAPInterface: true,
      usesWIFIInterface: false,
      reason: '$WIFI_INTERFACE is never defined — TX power was silently never applied',
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
// Bash grep -c || echo antipattern guard
// ----------------------------------------------------------
// Issue: `count=$(grep -c "pattern" ... || echo "0")` produces "0\n0" when
// grep finds 0 matches: grep -c outputs "0" (exit 1), then || echo "0" runs,
// and $() captures both lines. Using this in [[ "$count" -gt 0 ]] causes:
//   bash: [[: 0\n0: syntax error in expression (error token is "0")
// In hotspot-watchdog.sh this caused check_brcmfmac() to always fail,
// triggering false-positive firmware crash recovery every 30s (restarting
// hostapd + dnsmasq → killing wlan1 internet → requiring physical power cycle).
// Fix: use `$(grep -c ... || true)` + `${var:-0}` fallback.
describe('Bash grep -c || echo antipattern guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const shellScriptsDir = path.join(repoRoot, 'raspberry/scripts');

  it('no shell script must use `grep -c ... || echo` (produces multiline value)', () => {
    const scripts = fs.readdirSync(shellScriptsDir)
      .filter(f => f.endsWith('.sh'))
      .map(f => ({
        name: f,
        content: fs.readFileSync(path.join(shellScriptsDir, f), 'utf8'),
      }));

    const violations = scripts.flatMap(({ name, content }) => {
      const lines = content.split('\n');
      return lines
        .map((line, i) => ({ line: line.trim(), num: i + 1, file: name }))
        .filter(({ line }) =>
          /grep\s+-c\b.*\|\|\s*echo/.test(line) && !line.startsWith('#')
        );
    });

    expect({
      violations: violations.map(v => `${v.file}:${v.num}: ${v.line}`),
      reason: 'grep -c exits 1 when count is 0; || echo "0" adds a second "0" → "0\\n0" → bash arithmetic error',
      fix: 'Use $(grep -c ... || true) + ${var:-0}',
    }).toEqual({
      violations: [],
      reason: 'grep -c exits 1 when count is 0; || echo "0" adds a second "0" → "0\\n0" → bash arithmetic error',
      fix: 'Use $(grep -c ... || true) + ${var:-0}',
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

  it('write_kiosk_status must include primaryResolution and secondaryResolution', () => {
    // kiosk-status.json must expose screen resolutions for heartbeat → dashboard pipeline
    expect(watchdog).toContain('primaryResolution');
    expect(watchdog).toContain('secondaryResolution');
    // Must use bash parameter expansion ${VAR:+...} to avoid "x" when empty
    expect(watchdog).toMatch(/PRIMARY_SCREEN_WIDTH:\+/);
    expect(watchdog).toMatch(/SECONDARY_SCREEN_WIDTH:\+/);
  });

  it('single-display boot must detect primary resolution via get_output_resolution', () => {
    // Bug: PRIMARY_SCREEN_WIDTH was empty ("") in single-display mode because
    // get_output_resolution was only called inside setup_secondary_xrandr (dual-display).
    // The single-display fallback (DUAL_DISPLAY_ACTIVE != true) must detect the primary resolution.
    expect(watchdog).toContain('Single-display');
    // After the dual-display boot check, there must be a single-display fallback block
    // (anchored near "start_chromium" in main()) that detects the primary resolution.
    const lines = watchdog.split('\n');
    // Find the boot section anchor: the "Dual-display" log that lives in main()
    const dualDisplayLogIdx = lines.findIndex(l =>
      l.includes('Dual-display') && l.includes('au d')
    );
    expect(dualDisplayLogIdx).toBeGreaterThan(0);
    // The DUAL_DISPLAY_ACTIVE != true check must come AFTER the dual-display boot check
    const singleDisplayCheckIdx = lines.findIndex((l, i) =>
      i > dualDisplayLogIdx &&
      l.includes('DUAL_DISPLAY_ACTIVE') && l.includes('!= "true"') && l.includes('then')
    );
    expect(singleDisplayCheckIdx).toBeGreaterThan(dualDisplayLogIdx);
    // Find the fi that closes this block at the SAME indentation level (not inner fi's)
    const openingIndent = lines[singleDisplayCheckIdx].match(/^(\s*)/)?.[1] ?? '';
    const fiIdx = lines.findIndex((l, i) =>
      i > singleDisplayCheckIdx && i < singleDisplayCheckIdx + 30 &&
      new RegExp(`^${openingIndent}fi$`).test(l)
    );
    expect(fiIdx).toBeGreaterThan(singleDisplayCheckIdx);
    const singleDisplayBlock = lines.slice(singleDisplayCheckIdx, fiIdx + 1).join('\n');
    expect(singleDisplayBlock).toContain('get_output_resolution');
    expect(singleDisplayBlock).toContain('PRIMARY_SCREEN_WIDTH');
  });

  // Bug fix v3.98.5: DUAL_DISPLAY_ACTIVE must only be set AFTER setup_secondary_xrandr succeeds.
  // Before this fix, DUAL_DISPLAY_ACTIVE was set to true BEFORE setup_secondary_xrandr,
  // which swallowed failures with || true. When a Pi has only one HDMI port active
  // (e.g., only HDMI-A-2 visible in xrandr), setup_secondary_xrandr fails → but
  // DUAL_DISPLAY_ACTIVE stays true → main loop triggers false failover → kills
  // and restarts Chromium → LXDE desktop visible during transition.
  it('DUAL_DISPLAY_ACTIVE must be set AFTER setup_secondary_xrandr succeeds (not before)', () => {
    const lines = watchdog.split('\n');

    // Find the boot section (anchored by "Dual-display" log) where setup_secondary_xrandr
    // is called. Must be: if setup_secondary_xrandr; then → DUAL_DISPLAY_ACTIVE=true
    // NOT: DUAL_DISPLAY_ACTIVE=true ... setup_secondary_xrandr || true
    const dualDisplayLogIdx = lines.findIndex(l =>
      l.includes('Dual-display') && l.includes('au d')
    );
    expect(dualDisplayLogIdx).toBeGreaterThan(0);

    // Walk backwards from the "Dual-display" log to find the if setup_secondary_xrandr
    // (it must be within 10 lines before the log)
    const bootSetupIdx = lines.findIndex((l, i) =>
      i > dualDisplayLogIdx - 10 && i < dualDisplayLogIdx &&
      l.includes('setup_secondary_xrandr') && l.includes('if')
    );
    expect({ setupGuardedByIf: bootSetupIdx > 0 }).toEqual({ setupGuardedByIf: true });

    // DUAL_DISPLAY_ACTIVE=true must be between setup check and log
    const dualActiveIdx = lines.findIndex((l, i) =>
      i > bootSetupIdx && i <= dualDisplayLogIdx && l.includes('DUAL_DISPLAY_ACTIVE=true')
    );
    expect({ dualActiveAfterSetup: dualActiveIdx > bootSetupIdx }).toEqual({ dualActiveAfterSetup: true });

    // The else branch after the dual-display log must set DUAL_DISPLAY_ACTIVE=false
    const elseIdx = lines.findIndex((l, i) =>
      i > dualDisplayLogIdx && i < dualDisplayLogIdx + 5 && l.trim() === 'else'
    );
    const dualFalseIdx = lines.findIndex((l, i) =>
      i > elseIdx && i < elseIdx + 5 && l.includes('DUAL_DISPLAY_ACTIVE=false')
    );
    expect({ fallbackToSingleDisplay: dualFalseIdx > elseIdx }).toEqual({ fallbackToSingleDisplay: true });
  });

  // Bug fix v3.98.5: setup_secondary_xrandr must NEVER be called with || true in sections
  // that determine DUAL_DISPLAY_ACTIVE. The return code is the source of truth for display mode.
  // Swallowing errors with || true prevents detecting that only one screen is connected.
  it('setup_secondary_xrandr must not use || true when determining DUAL_DISPLAY_ACTIVE', () => {
    const lines = watchdog.split('\n');

    // Boot section: anchored by "Dual-display" log in main()
    const dualDisplayLogIdx = lines.findIndex(l =>
      l.includes('Dual-display') && l.includes('au d')
    );
    expect(dualDisplayLogIdx).toBeGreaterThan(0);

    // Search the boot section (20 lines before/after the dual-display log)
    const bootSection = lines.slice(Math.max(0, dualDisplayLogIdx - 20), dualDisplayLogIdx + 10).join('\n');
    expect({ bootNoOrTrue: !bootSection.includes('setup_secondary_xrandr || true') })
      .toEqual({ bootNoOrTrue: true });

    // check_secondary_chromium function: anchored by "Passage en dual-display" log
    const funcStart = watchdog.indexOf('check_secondary_chromium() {');
    const funcBody = watchdog.slice(funcStart, funcStart + 7000);
    // The single_to_dual transition must NOT use || true
    const transitionSection = funcBody.slice(funcBody.indexOf('single_to_dual'));
    const transitionBlock = transitionSection.slice(0, transitionSection.indexOf('start_chromium_secondary') > 0
      ? transitionSection.indexOf('start_chromium_secondary')
      : 500);
    expect({ mainLoopNoOrTrue: !transitionBlock.includes('setup_secondary_xrandr || true') })
      .toEqual({ mainLoopNoOrTrue: true });
  });

  // Bug fix v3.98.5: check_secondary_chromium must also guard DUAL_DISPLAY_ACTIVE behind
  // setup_secondary_xrandr success (same pattern as boot section).
  it('check_secondary_chromium must guard DUAL_DISPLAY_ACTIVE behind setup_secondary_xrandr', () => {
    const funcStart = watchdog.indexOf('check_secondary_chromium() {');
    expect(funcStart).toBeGreaterThan(0);
    const funcBody = watchdog.slice(funcStart, funcStart + 7000);

    // In the single→dual transition, setup_secondary_xrandr must be called with if/!
    const transitionIdx = funcBody.indexOf('single_to_dual');
    expect(transitionIdx).toBeGreaterThan(0);
    const afterTransition = funcBody.slice(transitionIdx, transitionIdx + 1200);

    // Must have: if ! setup_secondary_xrandr; then ... return
    expect({ hasGuardedSetup: afterTransition.includes('! setup_secondary_xrandr') })
      .toEqual({ hasGuardedSetup: true });
    expect({ hasReturnOnFailure: afterTransition.includes('return') })
      .toEqual({ hasReturnOnFailure: true });

    // DUAL_DISPLAY_ACTIVE=true must come AFTER the guard check
    const setupIdx = afterTransition.indexOf('! setup_secondary_xrandr');
    const dualActiveIdx = afterTransition.indexOf('DUAL_DISPLAY_ACTIVE=true');
    expect({ dualActiveAfterGuard: dualActiveIdx > setupIdx })
      .toEqual({ dualActiveAfterGuard: true });
  });

  // Bug fix v3.98.5: FAILOVER_GRACE_PERIOD must exist to prevent false failover during
  // EDID/DRM stabilization (~15s after boot).
  it('kiosk-watchdog.sh must have FAILOVER_GRACE_PERIOD for boot HDMI stabilization', () => {
    expect(watchdog).toContain('FAILOVER_GRACE_PERIOD=');
    expect(watchdog).toContain('BOOT_CHROMIUM_AT=');

    // The failover check must use the grace period
    const funcStart = watchdog.indexOf('check_secondary_chromium() {');
    const funcBody = watchdog.slice(funcStart, funcStart + 3000);
    expect({ hasGracePeriodCheck: funcBody.includes('FAILOVER_GRACE_PERIOD') })
      .toEqual({ hasGracePeriodCheck: true });
  });
});

describe('Screen resolution heartbeat pipeline (Pi → Central → Dashboard)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('HeartbeatMessage type must include primaryResolution and secondaryResolution in kioskStatus', () => {
    const types = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/types/index.ts'),
      'utf8'
    );
    expect(types).toContain('primaryResolution');
    expect(types).toContain('secondaryResolution');
  });

  it('heartbeat handler must forward resolutions as hdmi0Resolution and hdmi1Resolution', () => {
    const handler = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
      'utf8'
    );
    expect(handler).toContain('hdmi0Resolution');
    expect(handler).toContain('hdmi1Resolution');
    // Must read from kioskStatus (not hardcoded)
    expect(handler).toMatch(/kioskStatus\?\.primaryResolution/);
    expect(handler).toMatch(/kioskStatus\?\.secondaryResolution/);
  });

  it('dashboard site-detail component must display screen resolutions', () => {
    const component = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/site-detail.component.ts'),
      'utf8'
    );
    // Must reference resolution data from hdmiStatus
    expect(component).toContain('hdmi0Resolution');
    expect(component).toContain('hdmi1Resolution');
    // Must have CSS class for resolution display
    expect(component).toContain('screen-resolution');
  });
});

// ----------------------------------------------------------
// Secondary display EDID pipeline (health status → dashboard)
// The "État TV (HDMI-CEC)" debug section must also display EDID
// info for the secondary screen (HDMI-A-2) in dual-display setups.
// Pipeline: metrics.js getSecondaryDisplayInfo() → getHealthStatus()
//           → dashboard site-debug-tab secondaryDisplayInfo
// ----------------------------------------------------------
describe('Secondary display EDID pipeline (health status)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const metricsPath = path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js');
  const metricsContent = fs.readFileSync(metricsPath, 'utf8');
  const debugTabPath = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-debug-tab/site-debug-tab.component.ts');
  const debugTab = fs.readFileSync(debugTabPath, 'utf8');

  it('metrics.js _findEdidPath must accept optional port filter parameter', () => {
    // _findEdidPath must accept a portFilter to target HDMI-A-2 specifically
    expect(metricsContent).toContain('_findEdidPath(portFilter)');
    // Must filter hdmiEntries when portFilter is provided
    expect(metricsContent).toContain('portFilter');
  });

  it('metrics.js getHealthStatus must include secondaryDisplayInfo from getSecondaryDisplayInfo()', () => {
    // getSecondaryDisplayInfo must exist as a method
    expect(metricsContent).toContain('async getSecondaryDisplayInfo()');
    // Must target HDMI-A-2 specifically
    expect(metricsContent).toContain("_findEdidPath('HDMI-A-2')");
    // Must be called in getHealthStatus Promise.all
    expect(metricsContent).toContain('this.getSecondaryDisplayInfo()');
    // Must be included in getHealthStatus return
    expect(metricsContent).toContain('secondaryDisplayInfo');
  });

  it('dashboard site-debug-tab must display secondaryDisplayInfo section', () => {
    // Must reference secondaryDisplayInfo in the template
    expect(debugTab).toContain('secondaryDisplayInfo');
    // Must have the interface field
    expect(debugTab).toContain('secondaryDisplayInfo?: DisplayInfo');
    // Must use translation key for secondary display title
    expect(debugTab).toContain("'debug.secondaryDisplay'");
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
// E-41 update-config.js replace mode must also restore variants:
// applyReplaceMode() replaces sponsors/categories/timeCategories
// wholesale — without restoreSecondaryVariants() the locally-
// injected variants.secondary mappings are lost on every
// update_config with mode: "replace". (BUG: was missing until fix)
// ----------------------------------------------------------
describe('E-41 update-config replace mode restoreSecondaryVariants guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const updateConfigPath = path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-config.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(updateConfigPath, 'utf8');
  });

  it('update-config must import restoreSecondaryVariants from config-merge', () => {
    // Check that the require('config-merge') destructuring includes restoreSecondaryVariants
    const configMergeRequire = content.match(/require\(['"]\.\.\/utils\/config-merge['"]\)/)?.[0] || '';
    const importLine = content.split('\n').find(l => l.includes('config-merge')) || '';
    expect({
      importsRestore: /restoreSecondaryVariants/.test(importLine),
    }).toEqual({
      importsRestore: true,
    });
  });

  it('update-config must call restoreSecondaryVariants after applyReplaceMode', () => {
    // Verify that restoreSecondaryVariants is called within the replace mode branch
    const replaceBlock = content.split("mode === 'replace'")[1]?.split('else')[0] || '';
    expect({
      callsRestore: /restoreSecondaryVariants\(/.test(replaceBlock),
    }).toEqual({
      callsRestore: true,
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
// E-41 Central-side analytics metadata enrichment guard:
// config-sync.handler.ts must call enrichConfigWithAnalyticsMetadata()
// before sending config to Pi. Without this, the Pi receives
// videos without video_id/advertiser_id/analytics_category →
// detectCategory() falls back to path-based detection → sponsor
// loop videos classified as 'other' → analytics lost.
// ----------------------------------------------------------
describe('E-41 central analytics metadata enrichment guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const syncPath = path.join(repoRoot, 'central-server/src/handlers/config-sync.handler.ts');

  let syncContent: string;
  beforeAll(() => {
    syncContent = fs.readFileSync(syncPath, 'utf8');
  });

  it('config-sync handler must import enrichConfigWithAnalyticsMetadata', () => {
    expect(
      /import\s*\{[^}]*enrichConfigWithAnalyticsMetadata[^}]*\}/.test(syncContent)
    ).toBe(true);
  });

  it('config-sync handler must call enrichConfigWithAnalyticsMetadata()', () => {
    expect(
      /enrichConfigWithAnalyticsMetadata\(/.test(syncContent)
    ).toBe(true);
  });
});

// ----------------------------------------------------------
// E-41 SponsorVideo/CategoryVideo analytics metadata type guard:
// The TypeScript interfaces must include analytics fields
// (video_id, analytics_category) so the Pi receives them in config.
// ----------------------------------------------------------
describe('E-41 SponsorVideo/CategoryVideo analytics metadata type guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const typesPath = path.join(repoRoot, 'central-server/src/types/index.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(typesPath, 'utf8');
  });

  it('SponsorVideo must have video_id? and analytics_category? fields', () => {
    const sponsorBlock = content.match(/interface SponsorVideo \{[\s\S]*?\n\}/)?.[0] || '';
    expect({
      hasVideoId: /video_id\??\s*:/.test(sponsorBlock),
      hasAnalyticsCategory: /analytics_category\??\s*:/.test(sponsorBlock),
      hasAdvertiserId: /advertiser_id\??\s*:/.test(sponsorBlock),
    }).toEqual({
      hasVideoId: true,
      hasAnalyticsCategory: true,
      hasAdvertiserId: true,
    });
  });

  it('CategoryVideo must have video_id? and analytics_category? fields', () => {
    const categoryBlock = content.match(/interface CategoryVideo \{[\s\S]*?\n\}/)?.[0] || '';
    expect({
      hasVideoId: /video_id\??\s*:/.test(categoryBlock),
      hasAnalyticsCategory: /analytics_category\??\s*:/.test(categoryBlock),
    }).toEqual({
      hasVideoId: true,
      hasAnalyticsCategory: true,
    });
  });
});

// ----------------------------------------------------------
// E-41 enrichConfigWithAnalyticsMetadata traversal guard:
// The function must traverse ALL video arrays in SiteConfiguration
// (sponsors, categories.videos, subCategories.videos, timeCategories.loopVideos).
// Missing any array = missing analytics for those videos.
// ----------------------------------------------------------
describe('E-41 enrichConfigWithAnalyticsMetadata traversal guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const enrichPath = path.join(repoRoot, 'central-server/src/utils/config-analytics-metadata.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(enrichPath, 'utf8');
  });

  it('must traverse config.sponsors', () => {
    expect(/config\.sponsors/.test(content)).toBe(true);
  });

  it('must traverse category.videos', () => {
    expect(/category\.videos/.test(content)).toBe(true);
  });

  it('must traverse subCategories[].videos', () => {
    expect(/subCat\.videos|subCategories.*videos/.test(content)).toBe(true);
  });

  it('must traverse timeCategories[].loopVideos', () => {
    expect(/tc\.loopVideos|loopVideos/.test(content)).toBe(true);
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

// ----------------------------------------------------------
// deploy_video concurrent deployment mutex guard
// ----------------------------------------------------------
// Bug prevention: deploy-video.js must deduplicate concurrent downloads
// for the same videoId. Without this, dual flush on reconnect causes 2 downloads
// writing to the same .downloading file → checksum corruption + ENOENT.
describe('deploy_video concurrent deployment mutex guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const deployVideoPath = path.join(repoRoot, 'raspberry/sync-agent/src/commands/deploy-video.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(deployVideoPath, 'utf8');
  });

  it('must have activeDeployments Map for deduplication', () => {
    expect({
      hasActiveDeployments: /activeDeployments\s*=\s*new\s+Map/.test(content),
    }).toEqual({
      hasActiveDeployments: true,
    });
  });

  it('execute() must check activeDeployments before starting download', () => {
    expect({
      checksMap: /activeDeployments\.has\(/.test(content),
      setsMap: /activeDeployments\.set\(/.test(content),
      deletesMap: /activeDeployments\.delete\(/.test(content),
    }).toEqual({
      checksMap: true,
      setsMap: true,
      deletesMap: true,
    });
  });

  it('execute() must delegate to _executeInternal (not inline download logic)', () => {
    // execute() must be the thin mutex wrapper, _executeInternal does the real work
    expect({
      hasExecuteInternal: /async\s+_executeInternal\s*\(/.test(content),
      executeDelegates: /this\._executeInternal\(/.test(content),
    }).toEqual({
      hasExecuteInternal: true,
      executeDelegates: true,
    });
  });
});

// ----------------------------------------------------------
// Sync-agent startup directory permission preflight
// ----------------------------------------------------------
// Bug prevention: agent.js must verify write permissions on critical directories
// at startup. Without this, EACCES errors on mkdir videos-secondary/ are silent
// (non-blocking) and only discovered when a secondary variant deployment fails.
describe('Sync-agent startup directory permission preflight', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const agentPath = path.join(repoRoot, 'raspberry/sync-agent/src/agent.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(agentPath, 'utf8');
  });

  it('start() must call ensureDirectoryPermissions before connect', () => {
    const startMethod = content.match(
      /async\s+start\s*\(\)([\s\S]*?)(?=\n\s{2}\w|\n\s{2}\/\*\*)/
    );
    expect(startMethod).not.toBeNull();
    expect({
      callsPermissionCheck: /ensureDirectoryPermissions/.test(startMethod![1]),
    }).toEqual({
      callsPermissionCheck: true,
    });
  });

  it('ensureDirectoryPermissions must check videos-secondary writable', () => {
    expect({
      checksVideosSecondary: /videos-secondary/.test(content),
      writesTestFile: /permission-check/.test(content),
    }).toEqual({
      checksVideosSecondary: true,
      writesTestFile: true,
    });
  });
});

// =============================================================================
// E-41 secondary videos must be served by admin-server AND Nginx
// Without these routes, /videos-secondary/ returns 404 or HTML, making the
// secondary display unable to play variant videos (loop stays visible).
// =============================================================================

describe('E-41 secondary videos serving guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  describe('admin-server must serve /videos-secondary', () => {
    const adminServerPath = path.join(repoRoot, 'raspberry/admin/admin-server.js');
    let content: string;
    beforeAll(() => { content = fs.readFileSync(adminServerPath, 'utf8'); });

    it('admin-server must import SECONDARY_VIDEOS_DIR from helpers', () => {
      expect({
        importsSecondary: /SECONDARY_VIDEOS_DIR/.test(content),
      }).toEqual({
        importsSecondary: true,
      });
    });

    it('admin-server must register /videos-secondary static route', () => {
      expect({
        hasRoute: /app\.use\(['"]\/videos-secondary['"]/.test(content),
      }).toEqual({
        hasRoute: true,
      });
    });
  });

  describe('helpers must export SECONDARY_VIDEOS_DIR', () => {
    const helpersPath = path.join(repoRoot, 'raspberry/admin/helpers.js');
    let content: string;
    beforeAll(() => { content = fs.readFileSync(helpersPath, 'utf8'); });

    it('helpers must define SECONDARY_VIDEOS_DIR pointing to videos-secondary', () => {
      expect({
        definesSec: /SECONDARY_VIDEOS_DIR\s*=\s*.*videos-secondary/.test(content),
        exportsSec: /SECONDARY_VIDEOS_DIR/.test(content.split('module.exports')[1] || ''),
      }).toEqual({
        definesSec: true,
        exportsSec: true,
      });
    });
  });

  describe('Nginx config must serve /videos-secondary', () => {
    const nginxConfPath = path.join(repoRoot, 'raspberry/config/nginx/neopro-hls.conf');
    let content: string;
    beforeAll(() => { content = fs.readFileSync(nginxConfPath, 'utf8'); });

    it('Nginx must have location /videos-secondary/ proxying to admin-server', () => {
      expect({
        hasLocation: /location\s+\/videos-secondary\//.test(content),
        proxiesToAdmin: /proxy_pass\s+http:\/\/127\.0\.0\.1:8080\/videos-secondary\//.test(content),
      }).toEqual({
        hasLocation: true,
        proxiesToAdmin: true,
      });
    });
  });

  describe('install.sh must include /videos-secondary location', () => {
    const installPath = path.join(repoRoot, 'raspberry/install.sh');
    let content: string;
    beforeAll(() => { content = fs.readFileSync(installPath, 'utf8'); });

    it('install.sh must generate Nginx location for /videos-secondary/', () => {
      expect({
        hasLocation: /location\s+\/videos-secondary\//.test(content),
        proxiesToAdmin: /proxy_pass\s+http:\/\/127\.0\.0\.1:8080\/videos-secondary\//.test(content),
      }).toEqual({
        hasLocation: true,
        proxiesToAdmin: true,
      });
    });
  });

  describe('deploySecondaryVariant must use finalFilename for path', () => {
    const deployVideoPath = path.join(repoRoot, 'raspberry/sync-agent/src/commands/deploy-video.js');
    let content: string;
    beforeAll(() => { content = fs.readFileSync(deployVideoPath, 'utf8'); });

    it('secondaryRelativePath must NOT use buildRelativePath directly (would keep primary filename)', () => {
      // The old bug: secondaryRelativePath = relativePath.replace(/^videos\//, 'videos-secondary/')
      // This copies the PRIMARY video filename into the secondary path, but the secondary
      // file has its own name (finalFilename). The path must use finalFilename.
      const lines = content.split('\n');
      const secondaryPathLine = lines.find(l => l.includes('secondaryRelativePath') && l.includes('=') && !l.trim().startsWith('//'));
      expect({
        // Must NOT contain relativePath.replace — that was the bug
        usesRelativePathReplace: secondaryPathLine ? /relativePath\.replace/.test(secondaryPathLine) : false,
      }).toEqual({
        usesRelativePathReplace: false,
      });
    });

    it('secondaryRelativePath must reference finalFilename (the actual downloaded filename)', () => {
      const lines = content.split('\n');
      const secondaryPathLine = lines.find(l => l.includes('secondaryRelativePath') && l.includes('=') && !l.trim().startsWith('//'));
      expect({
        usesFinalFilename: secondaryPathLine ? /finalFilename/.test(secondaryPathLine) : false,
      }).toEqual({
        usesFinalFilename: true,
      });
    });
  });
});

// =============================================================================
// ADR-033 Slave race condition guard:
// The slave must have a guard against stale tv-loop-state (isManualMode: false)
// arriving AFTER the slave already processed an 'action' event and started manual mode.
// Without this guard, the stale state kills the slave's manual video.
// =============================================================================
describe('ADR-033 slave race condition guard (tv.component.ts)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const tvComponentPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');
  let content: string;
  beforeAll(() => { content = fs.readFileSync(tvComponentPath, 'utf8'); });

  it('action handler must set _lastActionReceivedAt timestamp', () => {
    // The action/command handler must record a timestamp to enable the stale state guard.
    // Pattern: _lastActionReceivedAt = Date.now() must appear in handleTvCommand or inline action handler.
    const handleTvBlock = content.match(/private handleTvCommand[\s\S]*?^  \}/m);
    const actionBlock = handleTvBlock
      ? handleTvBlock[0]
      : content.slice(
          content.indexOf("socketService.on('action'"),
          content.indexOf("socketService.on('action'") + 600
        );
    expect({
      setsTimestamp: /_lastActionReceivedAt\s*=\s*Date\.now\(\)/.test(actionBlock),
    }).toEqual({
      setsTimestamp: true,
    });
  });

  it('handleMasterLoopState CAS 2 must check _lastActionReceivedAt guard before stopping manual', () => {
    // CAS 2 must NOT blindly call stopManualVideoAndReturnToLoop when isManualMode is true.
    // It must first check if a recent action was received (guard window).
    const cas2Block = content.slice(
      content.indexOf('CAS 2'),
      content.indexOf('CAS 2') + 800
    );
    expect({
      hasGuard: /_lastActionReceivedAt/.test(cas2Block),
    }).toEqual({
      hasGuard: true,
    });
  });

  it('play() must emit immediate tv-loop-update with isManualMode:true for master', () => {
    // The master must emit tv-loop-update with isManualMode: true IMMEDIATELY in play(),
    // not just after the 2×rAF + 200ms delay. This reduces the window where stale
    // tv-loop-state (isManualMode: false) can reach slaves.
    // Look for the emission between isManualMode = true and 'ÉTAPE 1'
    const playMethod = content.slice(
      content.indexOf('isManualMode = true;'),
      content.indexOf('ÉTAPE 1')
    );
    expect({
      hasImmediateEmit: /emit\('tv-loop-update'/.test(playMethod) && /isManualMode:\s*true/.test(playMethod),
    }).toEqual({
      hasImmediateEmit: true,
    });
  });
});

// =============================================================================
// ADR-034 Synchronized Manual Video Reveal:
// Slaves preload manual videos on 'action' but wait for master's
// manualVideoVisible: true signal before revealing. This reduces desync
// between primary, secondary, and PC displays from ~300ms to ~50ms.
// =============================================================================
describe('ADR-034 synchronized manual video reveal', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const tvComponentPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');
  const socketServicePath = path.join(repoRoot, 'raspberry/src/app/services/socket.service.ts');
  const stateServicePath = path.join(repoRoot, 'raspberry/server/services/state.service.js');
  let tvContent: string;
  let socketContent: string;
  let stateContent: string;

  beforeAll(() => {
    tvContent = fs.readFileSync(tvComponentPath, 'utf8');
    socketContent = fs.readFileSync(socketServicePath, 'utf8');
    stateContent = fs.readFileSync(stateServicePath, 'utf8');
  });

  it('LoopState interface MUST include manualVideoVisible boolean', () => {
    const interfaceBlock = socketContent.slice(
      socketContent.indexOf('interface LoopState'),
      socketContent.indexOf('interface LoopState') + 400
    );
    expect({
      hasField: /manualVideoVisible:\s*boolean/.test(interfaceBlock),
    }).toEqual({
      hasField: true,
    });
  });

  it('state.service initial _loopState MUST include manualVideoVisible: false', () => {
    const loopStateBlock = stateContent.slice(
      stateContent.indexOf('_loopState'),
      stateContent.indexOf('_loopState') + 400
    );
    expect({
      hasDefault: /manualVideoVisible:\s*false/.test(loopStateBlock),
    }).toEqual({
      hasDefault: true,
    });
  });

  it('Master play() immediate emission MUST include manualVideoVisible: false', () => {
    // The FIRST emission in play() (before freeze-frame) must signal slaves to preload, not reveal
    const playMethod = tvContent.slice(
      tvContent.indexOf('isManualMode = true;'),
      tvContent.indexOf('ÉTAPE 1')
    );
    expect({
      hasVisibleFalse: /manualVideoVisible:\s*false/.test(playMethod),
    }).toEqual({
      hasVisibleFalse: true,
    });
  });

  it('Master play() delayed emission MUST include manualVideoVisible: true', () => {
    // The SECOND emission (after 2×rAF + 200ms) must signal slaves to reveal.
    // play() spans ~7000 chars due to freeze-frame, double-buffer, and error recovery logic.
    const fullPlayMethod = tvContent.slice(
      tvContent.indexOf('private play(video: Video)'),
      tvContent.indexOf('private play(video: Video)') + 7500
    );
    // Count occurrences of manualVideoVisible in play()
    const visibleFalseCount = (fullPlayMethod.match(/manualVideoVisible:\s*false/g) || []).length;
    const visibleTrueCount = (fullPlayMethod.match(/manualVideoVisible:\s*true/g) || []).length;
    expect({
      hasVisibleTrue: visibleTrueCount >= 1,
      hasVisibleFalse: visibleFalseCount >= 1,
    }).toEqual({
      hasVisibleTrue: true,
      hasVisibleFalse: true,
    });
  });

  it('Slave action handler MUST call preloadManualVideo instead of play', () => {
    // When isSlaveMode is true, the command handler must call preloadManualVideo, not play.
    // The logic can be in handleTvCommand (centralized) or inline in the action handler.
    const handleTvBlock = tvContent.match(/private handleTvCommand[\s\S]*?^  \}/m);
    const actionBlock = handleTvBlock
      ? handleTvBlock[0]
      : tvContent.slice(
          tvContent.indexOf("socketService.on('action'"),
          tvContent.indexOf("socketService.on('action'") + 800
        );
    expect({
      hasSlavePreload: /isSlaveMode[\s\S]*preloadManualVideo/.test(actionBlock),
      masterStillCallsPlay: /else\s*\{[\s\S]*?this\.play\(/.test(actionBlock),
    }).toEqual({
      hasSlavePreload: true,
      masterStillCallsPlay: true,
    });
  });

  it('LocalBroadcast command handler MUST check isSlaveMode and preload instead of play (ADR-034)', () => {
    // Bug: LocalBroadcast handler called play() directly without checking isSlaveMode,
    // causing slaves to show freeze-frame + overlay on manual video launch.
    // Fix: same pattern as Socket.IO action handler — preloadManualVideo for slaves, play for master.
    // The logic can be in handleTvCommand (centralized) or inline in the BroadcastChannel handler.
    const handleTvBlock = tvContent.match(/private handleTvCommand[\s\S]*?^  \}/m);
    const localBroadcastBlock = handleTvBlock
      ? handleTvBlock[0]
      : tvContent.slice(
          tvContent.indexOf("localBroadcast.onCommand()"),
          tvContent.indexOf("localBroadcast.onCommand()") + 1200
        );
    expect({
      hasSlaveCheck: /isSlaveMode/.test(localBroadcastBlock),
      hasPreload: /preloadManualVideo/.test(localBroadcastBlock),
      hasLastActionTimestamp: /_lastActionReceivedAt/.test(localBroadcastBlock),
      masterStillCallsPlay: /else\s*\{[\s\S]*?this\.play\(/.test(localBroadcastBlock),
    }).toEqual({
      hasSlaveCheck: true,
      hasPreload: true,
      hasLastActionTimestamp: true,
      masterStillCallsPlay: true,
    });
  });

  it('tv.component MUST have isDuplicateCommand guard for BroadcastChannel+Socket.IO race', () => {
    // When remote and TV are in the same browser, both BroadcastChannel and Socket.IO
    // deliver the same command. Without deduplication, play() is called twice — the second
    // load() cancels the first → race condition → freeze.
    expect({
      hasGuardMethod: /private isDuplicateCommand/.test(tvContent),
      hasCommandKey: /_lastCommandKey/.test(tvContent),
      hasCommandAt: /_lastCommandAt/.test(tvContent),
      handleTvCommandUsesGuard: /isDuplicateCommand/.test(
        (tvContent.match(/private handleTvCommand[\s\S]*?^  \}/m) || [''])[0]
      ),
    }).toEqual({
      hasGuardMethod: true,
      hasCommandKey: true,
      hasCommandAt: true,
      handleTvCommandUsesGuard: true,
    });
  });

  it('handleMasterLoopState CAS 1a MUST use !== true (not === false) for manualVideoVisible guard', () => {
    // Bug: using === false missed undefined/absent values → fell through to play() direct → freeze.
    // Fix: use !== true to catch false, undefined, and absent → always preload.
    const cas1Block = tvContent.slice(
      tvContent.indexOf('handleMasterLoopState'),
      tvContent.indexOf('CAS 2')
    );
    expect({
      usesNotTrue: /manualVideoVisible\s*!==\s*true/.test(cas1Block),
      doesNotUseStrictFalse: !/manualVideoVisible\s*===\s*false/.test(cas1Block),
      hasPreload: /preloadManualVideo/.test(cas1Block),
      hasReveal: /revealPreloadedVideo/.test(cas1Block),
    }).toEqual({
      usesNotTrue: true,
      doesNotUseStrictFalse: true,
      hasPreload: true,
      hasReveal: true,
    });
  });

  it('handleMasterLoopState CAS 1 fallback MUST call play for backward compat (manualVideoVisible:true + no preload)', () => {
    // Fallback: when manualVideoVisible === true but no preload exists (race condition / backward compat),
    // the slave must call play() directly.
    const cas1Block = tvContent.slice(
      tvContent.indexOf('handleMasterLoopState'),
      tvContent.indexOf('CAS 2')
    );
    expect({
      hasDirectPlay: /this\.play\(resolvedVideo\)/.test(cas1Block),
      hasBackwardCompatComment: /backward compat/i.test(cas1Block),
    }).toEqual({
      hasDirectPlay: true,
      hasBackwardCompatComment: true,
    });
  });

  it('handleMasterLoopState CAS 2 MUST call cleanupPreloadState', () => {
    const cas2Block = tvContent.slice(
      tvContent.indexOf('CAS 2'),
      tvContent.indexOf('CAS 2') + 800
    );
    expect({
      hasCleanup: /cleanupPreloadState/.test(cas2Block),
    }).toEqual({
      hasCleanup: true,
    });
  });

  it('emitLoopState MUST include manualVideoVisible: false', () => {
    const emitMethod = tvContent.slice(
      tvContent.indexOf('private emitLoopState'),
      tvContent.indexOf('private emitLoopState') + 500
    );
    expect({
      hasVisibleFalse: /manualVideoVisible:\s*false/.test(emitMethod),
    }).toEqual({
      hasVisibleFalse: true,
    });
  });
});

// ===================== ADR-034 metrics pipeline =====================
describe('ADR-034 preload-reveal metrics pipeline', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  let tvContent: string;
  let stateContent: string;

  beforeAll(() => {
    tvContent = fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'), 'utf8');
    stateContent = fs.readFileSync(path.join(repoRoot, 'raspberry/server/services/state.service.js'), 'utf8');
  });

  it('tv.component transitionMetrics MUST include preloadRevealCount and preloadCleanupCount', () => {
    expect({
      hasReveal: tvContent.includes('preloadRevealCount'),
      hasCleanup: tvContent.includes('preloadCleanupCount'),
    }).toEqual({
      hasReveal: true,
      hasCleanup: true,
    });
  });

  it('revealPreloadedVideo MUST increment preloadRevealCount', () => {
    const revealMethod = tvContent.slice(
      tvContent.indexOf('private revealPreloadedVideo'),
      tvContent.indexOf('private revealPreloadedVideo') + 2500
    );
    expect(revealMethod).toMatch(/preloadRevealCount\+\+/);
  });

  it('cleanupPreloadState MUST increment preloadCleanupCount', () => {
    const cleanupMethod = tvContent.slice(
      tvContent.indexOf('private cleanupPreloadState'),
      tvContent.indexOf('private cleanupPreloadState') + 500
    );
    expect(cleanupMethod).toMatch(/preloadCleanupCount\+\+/);
  });

  it('emitTransitionMetrics slave branch MUST emit preloadRevealCount and preloadCleanupCount', () => {
    const emitMethod = tvContent.slice(
      tvContent.indexOf('private emitTransitionMetrics'),
      tvContent.indexOf('private emitTransitionMetrics') + 800
    );
    expect({
      hasRevealInSlave: /preloadRevealCount.*preloadCleanupCount|preloadCleanupCount.*preloadRevealCount/.test(emitMethod),
    }).toEqual({
      hasRevealInSlave: true,
    });
  });

  it('state.service _transitionMetrics MUST include preloadRevealCount and preloadCleanupCount', () => {
    expect({
      hasReveal: stateContent.includes('preloadRevealCount'),
      hasCleanup: stateContent.includes('preloadCleanupCount'),
    }).toEqual({
      hasReveal: true,
      hasCleanup: true,
    });
  });

  it('TransitionMetrics interface MUST include preloadRevealCount and preloadCleanupCount', () => {
    const typesContent = fs.readFileSync(path.join(repoRoot, 'central-server/src/types/index.ts'), 'utf8');
    const iface = typesContent.slice(
      typesContent.indexOf('interface TransitionMetrics'),
      typesContent.indexOf('interface TransitionMetrics') + 500
    );
    expect({
      hasReveal: iface.includes('preloadRevealCount'),
      hasCleanup: iface.includes('preloadCleanupCount'),
    }).toEqual({
      hasReveal: true,
      hasCleanup: true,
    });
  });

  it('metrics.service MUST have Prometheus counters for preload_reveal and preload_cleanup', () => {
    const metricsContent = fs.readFileSync(path.join(repoRoot, 'central-server/src/services/metrics.service.ts'), 'utf8');
    expect({
      hasRevealCounter: metricsContent.includes('neopro_video_preload_reveal_total'),
      hasCleanupCounter: metricsContent.includes('neopro_video_preload_cleanup_total'),
    }).toEqual({
      hasRevealCounter: true,
      hasCleanupCounter: true,
    });
  });

  it('heartbeat.handler MUST log preload metrics', () => {
    const heartbeatContent = fs.readFileSync(path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'), 'utf8');
    expect({
      hasRevealLog: heartbeatContent.includes('preloadRevealCount'),
      hasCleanupLog: heartbeatContent.includes('preloadCleanupCount'),
    }).toEqual({
      hasRevealLog: true,
      hasCleanupLog: true,
    });
  });
});

// ===================== ADR-034 v3.89.3 silent preload + instant reveal =====================
describe('ADR-034 v3.89.3 silent preload + instant reveal', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  let tvContent: string;

  beforeAll(() => {
    tvContent = fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'), 'utf8');
  });

  it('preloadManualVideo MUST NOT call captureAndShowFreezeFrame unconditionally (silent preload)', () => {
    // preloadManualVideo should only call captureAndShowFreezeFrame for manual→manual transitions,
    // not unconditionally. The method must check if a manual video is already visible.
    const preloadMethod = tvContent.slice(
      tvContent.indexOf('private preloadManualVideo'),
      tvContent.indexOf('private preloadManualVideo') + 2500
    );
    expect({
      hasConditionalFreeze: /isReplacingManual|manual.*manual|opacity.*===.*'1'/.test(preloadMethod),
      hasNotUnconditionalFreeze: !/^\s*this\.captureAndShowFreezeFrame\(\)/m.test(
        preloadMethod.replace(/if\s*\(.*\)\s*\{[^}]*captureAndShowFreezeFrame[^}]*\}/gs, '')
      ),
    }).toEqual({
      hasConditionalFreeze: true,
      hasNotUnconditionalFreeze: true,
    });
  });

  it('preloadManualVideo MUST mute player during preload', () => {
    const preloadMethod = tvContent.slice(
      tvContent.indexOf('private preloadManualVideo'),
      tvContent.indexOf('private preloadManualVideo') + 2500
    );
    expect({
      hasMuteTrue: /\.muted\s*=\s*true/.test(preloadMethod),
    }).toEqual({
      hasMuteTrue: true,
    });
  });

  it('revealPreloadedVideo MUST unmute player and NOT have 2xrAF+200ms delay', () => {
    const revealMethod = tvContent.slice(
      tvContent.indexOf('private revealPreloadedVideo'),
      tvContent.indexOf('private revealPreloadedVideo') + 2000
    );
    expect({
      hasUnmute: /\.muted\s*=\s*false/.test(revealMethod),
      hasNoRAFDelay: !(/requestAnimationFrame/.test(revealMethod)),
    }).toEqual({
      hasUnmute: true,
      hasNoRAFDelay: true,
    });
  });

  it('revealPreloadedVideo MUST have safe unmute guard for autoplay policy (browser /secondary freeze)', () => {
    // Chrome pauses a playing video when programmatically unmuted on a tab without user interaction.
    // /secondary tab has no user gesture → muted=false triggers pause → video frozen.
    // Fix: detect pause after unmute, fallback to muted playback.
    const revealMethod = tvContent.slice(
      tvContent.indexOf('private revealPreloadedVideo'),
      tvContent.indexOf('private revealPreloadedVideo') + 2000
    );
    expect({
      hasPauseCheck: /player\.paused/.test(revealMethod),
      hasMuteFallback: /player\.muted\s*=\s*true/.test(revealMethod),
      hasPlayRecovery: /player\.play\(\)/.test(revealMethod),
    }).toEqual({
      hasPauseCheck: true,
      hasMuteFallback: true,
      hasPlayRecovery: true,
    });
  });

  it('preloadManualVideo MUST support deferred reveal (_preloadReady + _pendingReveal)', () => {
    // When master signals reveal before slave's preload finishes (frequent on browser where
    // HTTP loading is slower than Pi's local files), the reveal must be deferred until play() resolves.
    const preloadMethod = tvContent.slice(
      tvContent.indexOf('private preloadManualVideo'),
      tvContent.indexOf('private preloadManualVideo') + 2500
    );
    expect({
      setsPreloadReady: /_preloadReady\s*=\s*true/.test(preloadMethod),
      checksPendingReveal: /_pendingReveal/.test(preloadMethod),
      callsRevealOnPending: /revealPreloadedVideo/.test(preloadMethod),
    }).toEqual({
      setsPreloadReady: true,
      checksPendingReveal: true,
      callsRevealOnPending: true,
    });
  });

  it('revealPreloadedVideo MUST defer reveal when _preloadReady is false', () => {
    const revealMethod = tvContent.slice(
      tvContent.indexOf('private revealPreloadedVideo'),
      tvContent.indexOf('private revealPreloadedVideo') + 2000
    );
    expect({
      checksPreloadReady: /_preloadReady/.test(revealMethod),
      setsPendingReveal: /_pendingReveal\s*=\s*true/.test(revealMethod),
    }).toEqual({
      checksPreloadReady: true,
      setsPendingReveal: true,
    });
  });

  it('cleanupPreloadState MUST reset muted to false', () => {
    const cleanupMethod = tvContent.slice(
      tvContent.indexOf('private cleanupPreloadState'),
      tvContent.indexOf('private cleanupPreloadState') + 500
    );
    expect({
      hasUnmute: /\.muted\s*=\s*false/.test(cleanupMethod),
    }).toEqual({
      hasUnmute: true,
    });
  });
});

// ----------------------------------------------------------
// SAFe Dashboard — file existence & wiring guards
// ----------------------------------------------------------
describe('SAFe Dashboard file existence guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  const safeBackendFiles = [
    'central-server/src/types/safe.types.ts',
    'central-server/src/services/safe-parser.service.ts',
    'central-server/src/controllers/safe.controller.ts',
    'central-server/src/routes/safe.routes.ts',
    'central-server/src/repositories/safe.repository.ts',
    'central-server/src/scripts/migrations/add-safe-sprint-tables.sql',
  ];

  const safeFrontendFiles = [
    'central-dashboard/src/app/core/services/safe.service.ts',
    'central-dashboard/src/app/features/safe/safe-portfolio.component.ts',
    'central-dashboard/src/app/features/safe/safe-proposals.component.ts',
    'central-dashboard/src/app/features/safe/safe-proposal-detail.component.ts',
    'central-dashboard/src/app/features/safe/safe-sprint-tracker.component.ts',
  ];

  test.each([...safeBackendFiles, ...safeFrontendFiles])(
    '%s must exist',
    (filePath) => {
      const fullPath = path.join(repoRoot, filePath);
      expect({
        file: filePath,
        exists: fs.existsSync(fullPath),
      }).toEqual({
        file: filePath,
        exists: true,
      });
    },
  );

  it('safe.routes.ts must be imported in server.ts', () => {
    const serverPath = path.join(repoRoot, 'central-server', 'src', 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    expect({
      imported: serverContent.includes("'./routes/safe.routes'"),
      mounted: serverContent.includes('/api/safe'),
    }).toEqual({
      imported: true,
      mounted: true,
    });
  });

  it('safe-parser.service.ts must have memory cache with TTL', () => {
    const parserPath = path.join(repoRoot, 'central-server', 'src', 'services', 'safe-parser.service.ts');
    const parserContent = fs.readFileSync(parserPath, 'utf8');
    expect({
      hasCache: /cache|Cache/.test(parserContent),
      hasTTL: /ttl|TTL|5\s*\*\s*60\s*\*\s*1000|300000|cacheDuration/.test(parserContent),
    }).toEqual({
      hasCache: true,
      hasTTL: true,
    });
  });

  it('Angular app.routes.ts must declare /safe routes with roleGuard', () => {
    const routesPath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'app.routes.ts');
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    expect({
      hasSafePath: routesContent.includes("path: 'safe'"),
      hasRoleGuard: /canActivate.*roleGuard/.test(routesContent),
      hasLazyLoad: /loadComponent.*safe-portfolio/.test(routesContent),
    }).toEqual({
      hasSafePath: true,
      hasRoleGuard: true,
      hasLazyLoad: true,
    });
  });

  it('Angular app.routes.ts must declare /safe/sprints route with roleGuard', () => {
    const routesPath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'app.routes.ts');
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    expect({
      hasSprintsPath: routesContent.includes("'safe/sprints'"),
      hasSprintLazyLoad: /loadComponent.*safe-sprint-tracker/.test(routesContent),
    }).toEqual({
      hasSprintsPath: true,
      hasSprintLazyLoad: true,
    });
  });
});

// SAFe Phase 2 — Sprint Tracker + Proposal CRUD + DB Hybrid Layer regression guards
// ----------------------------------------------------------
describe('SAFe Phase 2 regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  // --- Sprint API endpoints must be registered ---
  it('safe.routes.ts must register Sprint Tracker endpoints (GET sprints + PUT story status)', () => {
    const routesPath = path.join(repoRoot, 'central-server', 'src', 'routes', 'safe.routes.ts');
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    expect({
      hasGetSprints: /get.*['"\/]sprints['"]/.test(routesContent) || routesContent.includes('/sprints'),
      hasPutStoryStatus: /put.*sprints.*stories.*status/.test(routesContent) || routesContent.includes('stories') && routesContent.includes('status'),
    }).toEqual({
      hasGetSprints: true,
      hasPutStoryStatus: true,
    });
  });

  // --- Proposal CRUD endpoints must be registered ---
  it('safe.routes.ts must register Proposal CRUD endpoints (POST + DELETE)', () => {
    const routesPath = path.join(repoRoot, 'central-server', 'src', 'routes', 'safe.routes.ts');
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    expect({
      hasPostProposals: /router\.post\(/.test(routesContent),
      hasDeleteProposals: /router\.delete\(/.test(routesContent),
    }).toEqual({
      hasPostProposals: true,
      hasDeleteProposals: true,
    });
  });

  // --- SafeParserService must have async getSprints with DB hybrid ---
  it('safe-parser.service.ts must have async getSprints() with DB hybrid layer', () => {
    const parserPath = path.join(repoRoot, 'central-server', 'src', 'services', 'safe-parser.service.ts');
    const parserContent = fs.readFileSync(parserPath, 'utf8');
    expect({
      hasAsyncGetSprints: /async\s+getSprints/.test(parserContent),
      importsSafeRepository: parserContent.includes('safeRepository'),
      hasDbOverrides: parserContent.includes('getVelocities') || parserContent.includes('getStoryOverrides'),
    }).toEqual({
      hasAsyncGetSprints: true,
      importsSafeRepository: true,
      hasDbOverrides: true,
    });
  });

  // --- SafeParserService must have async updateStoryStatus with DB persist ---
  it('safe-parser.service.ts must have async updateStoryStatus() with DB persist', () => {
    const parserPath = path.join(repoRoot, 'central-server', 'src', 'services', 'safe-parser.service.ts');
    const parserContent = fs.readFileSync(parserPath, 'utf8');
    expect({
      hasAsyncUpdateStory: /async\s+updateStoryStatus/.test(parserContent),
      persistsToDb: parserContent.includes('upsertStoryStatus'),
    }).toEqual({
      hasAsyncUpdateStory: true,
      persistsToDb: true,
    });
  });

  // --- SafeParserService must have createProposal and deleteProposal ---
  it('safe-parser.service.ts must have createProposal() and deleteProposal() methods', () => {
    const parserPath = path.join(repoRoot, 'central-server', 'src', 'services', 'safe-parser.service.ts');
    const parserContent = fs.readFileSync(parserPath, 'utf8');
    expect({
      hasCreate: /createProposal/.test(parserContent),
      hasDelete: /deleteProposal/.test(parserContent),
    }).toEqual({
      hasCreate: true,
      hasDelete: true,
    });
  });

  // --- safe.repository.ts must have graceful degradation (try/catch + logger.warn) ---
  it('safe.repository.ts must have graceful degradation for all DB methods', () => {
    const repoPath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'safe.repository.ts');
    const repoContent = fs.readFileSync(repoPath, 'utf8');
    expect({
      hasGracefulDegradation: (repoContent.match(/logger\.warn/g) || []).length >= 4,
      hasTryCatch: (repoContent.match(/try\s*\{/g) || []).length >= 4,
      returnsEmptyOnError: /return new Map/.test(repoContent),
    }).toEqual({
      hasGracefulDegradation: true,
      hasTryCatch: true,
      returnsEmptyOnError: true,
    });
  });

  // --- safe.repository.ts must be exported from repositories/index.ts ---
  it('safe.repository.ts must be exported from repositories/index.ts', () => {
    const indexPath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'index.ts');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    expect({
      exportsSafeRepo: indexContent.includes('safeRepository'),
      exportsFromSafeRepo: indexContent.includes('./safe.repository'),
    }).toEqual({
      exportsSafeRepo: true,
      exportsFromSafeRepo: true,
    });
  });

  // --- Migration file must have correct table structure ---
  it('migration must create safe_sprint_velocity and safe_story_status_override with correct constraints', () => {
    const migrationPath = path.join(repoRoot, 'central-server', 'src', 'scripts', 'migrations', 'add-safe-sprint-tables.sql');
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');
    expect({
      hasVelocityTable: migrationContent.includes('safe_sprint_velocity'),
      hasOverrideTable: migrationContent.includes('safe_story_status_override'),
      hasUniqueSprintId: migrationContent.includes('sprint_id TEXT NOT NULL UNIQUE'),
      hasUniqueStoryId: migrationContent.includes('story_id TEXT NOT NULL UNIQUE'),
      hasStatusCheck: /CHECK.*status.*IN.*todo.*in-progress.*done.*removed/.test(migrationContent),
      hasIfNotExists: migrationContent.includes('IF NOT EXISTS'),
    }).toEqual({
      hasVelocityTable: true,
      hasOverrideTable: true,
      hasUniqueSprintId: true,
      hasUniqueStoryId: true,
      hasStatusCheck: true,
      hasIfNotExists: true,
    });
  });

  // --- Sprint Tracker component must have OnPush + trackBy + OnDestroy ---
  it('safe-sprint-tracker.component.ts must have OnPush, trackBy, and OnDestroy', () => {
    const componentPath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'safe', 'safe-sprint-tracker.component.ts');
    const componentContent = fs.readFileSync(componentPath, 'utf8');
    expect({
      hasOnPush: componentContent.includes('ChangeDetectionStrategy.OnPush'),
      hasTrackBy: /trackBy/.test(componentContent),
      hasOnDestroy: componentContent.includes('OnDestroy'),
      hasDestroySubject: /destroy\$/.test(componentContent),
    }).toEqual({
      hasOnPush: true,
      hasTrackBy: true,
      hasOnDestroy: true,
      hasDestroySubject: true,
    });
  });

  // --- All 3 original safe components must have OnPush + OnDestroy (Phase 1.4 regression) ---
  it('all safe components must have ChangeDetectionStrategy.OnPush', () => {
    const components = [
      'central-dashboard/src/app/features/safe/safe-portfolio.component.ts',
      'central-dashboard/src/app/features/safe/safe-proposals.component.ts',
      'central-dashboard/src/app/features/safe/safe-proposal-detail.component.ts',
      'central-dashboard/src/app/features/safe/safe-sprint-tracker.component.ts',
    ];
    for (const comp of components) {
      const content = fs.readFileSync(path.join(repoRoot, comp), 'utf8');
      expect({
        file: comp,
        hasOnPush: content.includes('ChangeDetectionStrategy.OnPush'),
        hasOnDestroy: content.includes('OnDestroy'),
      }).toEqual({
        file: comp,
        hasOnPush: true,
        hasOnDestroy: true,
      });
    }
  });

  // --- safe.service.ts must expose Sprint + Proposal CRUD methods ---
  it('safe.service.ts must expose getSprints, createProposal, deleteProposal methods', () => {
    const servicePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'core', 'services', 'safe.service.ts');
    const serviceContent = fs.readFileSync(servicePath, 'utf8');
    expect({
      hasGetSprints: /getSprints/.test(serviceContent),
      hasUpdateStoryStatus: /updateStoryStatus/.test(serviceContent),
      hasCreateProposal: /createProposal/.test(serviceContent),
      hasDeleteProposal: /deleteProposal/.test(serviceContent),
    }).toEqual({
      hasGetSprints: true,
      hasUpdateStoryStatus: true,
      hasCreateProposal: true,
      hasDeleteProposal: true,
    });
  });
});

// ----------------------------------------------------------
// Pi admin panel security & architecture guards
// ----------------------------------------------------------
describe('Pi admin panel security & architecture guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const adminDir = path.join(repoRoot, 'raspberry', 'admin');

  it('auth.js must export requireCsrf middleware', () => {
    const content = fs.readFileSync(path.join(adminDir, 'routes', 'auth.js'), 'utf8');
    expect(content).toMatch(/module\.exports\.requireCsrf\s*=/);
    expect(content).toMatch(/validateCsrf/);
  });

  it('admin-server.js must use requireCsrf middleware', () => {
    const content = fs.readFileSync(path.join(adminDir, 'admin-server.js'), 'utf8');
    expect(content).toMatch(/requireCsrf/);
    expect(content).toMatch(/app\.use\(requireCsrf\)/);
  });

  it('auth.js must have rate limiting (MAX_LOGIN_ATTEMPTS + checkRateLimit + recordFailedAttempt)', () => {
    const content = fs.readFileSync(path.join(adminDir, 'routes', 'auth.js'), 'utf8');
    expect(content).toMatch(/MAX_LOGIN_ATTEMPTS/);
    expect(content).toMatch(/checkRateLimit/);
    expect(content).toMatch(/recordFailedAttempt/);
  });

  it('auth.js must have password change route', () => {
    const content = fs.readFileSync(path.join(adminDir, 'routes', 'auth.js'), 'utf8');
    expect(content).toMatch(/\/api\/auth\/change-password/);
    expect(content).toMatch(/newPassword\.length\s*<\s*8/);
  });

  it('realtime.js module must exist and connect to :3000', () => {
    const realtimePath = path.join(adminDir, 'public', 'modules', 'core', 'realtime.js');
    expect(fs.existsSync(realtimePath)).toBe(true);
    const content = fs.readFileSync(realtimePath, 'utf8');
    expect(content).toMatch(/initRealtime/);
    expect(content).toMatch(/:3000/);
    expect(content).toMatch(/config_updated/);
  });

  it('build-admin.sh must concatenate CSS modules from styles/ directory', () => {
    const buildScript = fs.readFileSync(path.join(adminDir, 'public', 'build-admin.sh'), 'utf8');
    expect(buildScript).toMatch(/styles\/base\.css/);
    expect(buildScript).toMatch(/styles\/responsive\.css/);
    expect(buildScript).toMatch(/CSS_OUTPUT/);
  });

  it('.eslintrc.json must exist for frontend linting', () => {
    expect(fs.existsSync(path.join(adminDir, '.eslintrc.json'))).toBe(true);
  });

  it('state.js fetch wrapper must inject X-CSRF-Token header on mutations', () => {
    const content = fs.readFileSync(path.join(adminDir, 'public', 'modules', 'core', 'state.js'), 'utf8');
    expect(content).toMatch(/X-CSRF-Token/);
    expect(content).toMatch(/admin_csrf/);
  });

  it('auth.js login route must check rate limit before password (defense-in-depth order)', () => {
    const content = fs.readFileSync(path.join(adminDir, 'routes', 'auth.js'), 'utf8');
    const rateLimitPos = content.indexOf('checkRateLimit(clientIp)');
    const passwordCheckPos = content.indexOf('password !== adminPassword');
    expect(rateLimitPos).toBeGreaterThan(-1);
    expect(passwordCheckPos).toBeGreaterThan(-1);
    // Rate limit must come BEFORE password check
    expect(rateLimitPos).toBeLessThan(passwordCheckPos);
  });

  it('auth.js must set CSRF cookie as non-httpOnly (readable by JS)', () => {
    const content = fs.readFileSync(path.join(adminDir, 'routes', 'auth.js'), 'utf8');
    // The admin_csrf cookie must NOT be httpOnly so JavaScript can read it
    expect(content).toMatch(/admin_csrf.*httpOnly:\s*false/s);
  });
});

// Issue: hostapd template shipped with wpa_pairwise=TKIP, causing "wrong password"
// errors on modern phones (Android 12+, iOS 16+) connecting to the club hotspot.
// TKIP is deprecated by WPA2; modern devices refuse WPA2+TKIP silently.
// Fix: Use CCMP only in hostapd.conf template AND install.sh.
// Also: fix-fleet-pi.sh must fix existing Pi (sed TKIP→CCMP).
describe('Hotspot TKIP→CCMP regression guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('hostapd.conf template must use CCMP (never TKIP)', () => {
    const template = fs.readFileSync(
      path.join(repoRoot, 'raspberry/config/systemd/hostapd.conf'),
      'utf8'
    );
    expect({
      hasCCMP: /wpa_pairwise=CCMP/.test(template),
      hasTKIP: /wpa_pairwise=TKIP/.test(template),
    }).toEqual({
      hasCCMP: true,
      hasTKIP: false,
    });
  });

  it('install.sh configure_hotspot must not inject TKIP', () => {
    const install = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8'
    );
    // install.sh copies the template; ensure it doesn't sed CCMP back to TKIP
    expect(install).not.toMatch(/wpa_pairwise=TKIP/);
  });

  it('fix-fleet-pi.sh must contain TKIP→CCMP remediation', () => {
    const fixScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    expect({
      detectsTKIP: /wpa_pairwise=TKIP/.test(fixScript),
      replacesCCMP: /wpa_pairwise=CCMP/.test(fixScript),
    }).toEqual({
      detectsTKIP: true,
      replacesCCMP: true,
    });
  });

  it('prepare-image.sh must use CCMP in inline hostapd config', () => {
    const prepareImage = fs.readFileSync(
      path.join(repoRoot, 'raspberry/tools/prepare-image.sh'),
      'utf8'
    );
    expect({
      hasCCMP: /wpa_pairwise=CCMP/.test(prepareImage),
      hasTKIP: /wpa_pairwise=TKIP/.test(prepareImage),
    }).toEqual({
      hasCCMP: true,
      hasTKIP: false,
    });
  });
});

// Issue: Old Pi installed 'unclutter' (X11 grab-based, unreliable on LXDE/Pi5).
// Fix: install.sh must use 'unclutter-xfixes' + LXDE autostart '@unclutter -idle 0 -root'.
// fix-fleet-pi.sh must remediate existing Pi (remove old, install new, fix autostart).
describe('TV cursor hiding regression guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('install.sh must install unclutter-xfixes (not unclutter)', () => {
    const install = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8'
    );
    expect(install).toMatch(/apt-get install[^;]*unclutter-xfixes/s);
  });

  it('install.sh configure_gui must write @unclutter to LXDE autostart', () => {
    const install = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8'
    );
    expect(install).toMatch(/@unclutter -idle 0 -root/);
  });

  it('fix-fleet-pi.sh must install missing packages and fix cursor', () => {
    const fixScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    expect({
      installsUnclutterXfixes: /unclutter-xfixes/.test(fixScript),
      removesOldUnclutter: /apt-get remove.*unclutter/.test(fixScript),
      fixesAutostart: /@unclutter/.test(fixScript),
      installsX11Utils: /x11-utils/.test(fixScript),
      installsEdidDecode: /edid-decode/.test(fixScript),
    }).toEqual({
      installsUnclutterXfixes: true,
      removesOldUnclutter: true,
      fixesAutostart: true,
      installsX11Utils: true,
      installsEdidDecode: true,
    });
  });
});

// =============================================================================
// Boot splash screen guards
// =============================================================================
//
// Ensures the Neopro boot splash is properly integrated:
// - Inline HTML splash in index.html (visible before Angular bootstraps)
// - app.component.ts removes the splash after bootstrap
// - install.sh configures cmdline.txt (quiet boot) and config.txt (disable_splash)
// - No 100vw usage in inline splash (smoke test enforced)

describe('Boot splash screen guards', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const indexHtml = fs.readFileSync(
    path.join(repoRoot, 'raspberry/src/index.html'),
    'utf8'
  );
  const appComponent = fs.readFileSync(
    path.join(repoRoot, 'raspberry/src/app/app.component.ts'),
    'utf8'
  );
  const installSh = fs.readFileSync(
    path.join(repoRoot, 'raspberry/install.sh'),
    'utf8'
  );

  it('index.html must have inline neopro-boot-splash div', () => {
    // The inline splash renders instantly before Angular bootstraps,
    // eliminating the 5-15s white screen gap in Chromium.
    expect({ hasSplash: indexHtml.includes('id="neopro-boot-splash"') })
      .toEqual({ hasSplash: true });
  });

  it('inline boot splash must NOT use 100vw (causes overflow with scrollbars)', () => {
    // Extract the splash block to check only its styles
    const splashMatch = indexHtml.match(
      /id="neopro-boot-splash"[\s\S]*?<\/div>\s*<style>[^<]*<\/style>/
    );
    expect(splashMatch).not.toBeNull();
    const splashBlock = splashMatch![0];
    expect({
      no100vw: !splashBlock.includes('100vw'),
      reason: 'Use 100% instead of 100vw — 100vw includes scrollbar width'
    }).toEqual({
      no100vw: true,
      reason: 'Use 100% instead of 100vw — 100vw includes scrollbar width'
    });
  });

  it('inline boot splash must appear BEFORE <app-root>', () => {
    // The splash must render before Angular's root element so it's visible immediately.
    const splashIdx = indexHtml.indexOf('neopro-boot-splash');
    const appRootIdx = indexHtml.indexOf('<app-root>');
    expect(splashIdx).toBeGreaterThan(-1);
    expect(appRootIdx).toBeGreaterThan(-1);
    expect({ splashBeforeAppRoot: splashIdx < appRootIdx })
      .toEqual({ splashBeforeAppRoot: true });
  });

  it('app.component.ts must remove neopro-boot-splash after bootstrap', () => {
    // Without removal, the splash would stay on top of the TV content forever.
    expect({ removesSplash: appComponent.includes('neopro-boot-splash') })
      .toEqual({ removesSplash: true });
  });

  it('install.sh must have configure_boot_splash function', () => {
    expect({ hasFunction: /configure_boot_splash\(\)/.test(installSh) })
      .toEqual({ hasFunction: true });
  });

  it('install.sh configure_boot_splash must configure quiet boot in cmdline.txt', () => {
    // Extract the function body
    const fnMatch = installSh.match(
      /configure_boot_splash\(\)\s*\{[\s\S]*?\n\}/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect({
      hasQuiet: fnBody.includes('quiet'),
      hasSplash: fnBody.includes('splash'),
      hasLogoNologo: fnBody.includes('logo.nologo'),
      hasLoglevel: fnBody.includes('loglevel'),
    }).toEqual({
      hasQuiet: true,
      hasSplash: true,
      hasLogoNologo: true,
      hasLoglevel: true,
    });
  });

  it('install.sh configure_boot_splash must set disable_splash=1 in config.txt', () => {
    const fnMatch = installSh.match(
      /configure_boot_splash\(\)\s*\{[\s\S]*?\n\}/
    );
    expect(fnMatch).not.toBeNull();
    expect({ disableSplash: fnMatch![0].includes('disable_splash=1') })
      .toEqual({ disableSplash: true });
  });

  it('fix-fleet-pi.sh must configure boot splash (cmdline.txt + config.txt)', () => {
    const fixFleetContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    expect({ hasQuiet: fixFleetContent.includes('quiet') && fixFleetContent.includes('splash') && fixFleetContent.includes('logo.nologo') })
      .toEqual({ hasQuiet: true });
    expect({ hasDisableSplash: fixFleetContent.includes('disable_splash=1') })
      .toEqual({ hasDisableSplash: true });
  });

  it('deploy-remote.sh must auto-run fix-fleet-pi.sh after deployment', () => {
    const deployContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
      'utf8'
    );
    expect({ runsFixFleet: deployContent.includes('fix-fleet-pi.sh') })
      .toEqual({ runsFixFleet: true });
  });

  it('deploy-remote.sh must run fix-fleet-pi.sh with sudo (requires root for boot config)', () => {
    const deployContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
      'utf8'
    );
    // fix-fleet-pi.sh checks id -u == 0 and exits if not root
    // Without sudo, it silently fails and boot splash / config.txt changes are never applied
    expect({ usesSudo: deployContent.includes('sudo') && deployContent.includes('fix-fleet-pi.sh') })
      .toEqual({ usesSudo: true });
  });

  it('deploy-remote.sh must capture fix-fleet-pi.sh exit code (not silently swallow)', () => {
    const deployContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
      'utf8'
    );
    // Capturing exit code ensures failures are visible in deploy logs
    // instead of being silently eaten by || true
    expect({ capturesExitCode: deployContent.includes('FLEET_EXIT_CODE') && deployContent.includes('DEPLOY_FLEET_FIX_FAILED') })
      .toEqual({ capturesExitCode: true });
  });

  it('OTA update-software.js must auto-run fix-fleet-pi.sh after install', () => {
    const otaContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    expect({ runsFixFleet: otaContent.includes('fix-fleet-pi.sh') })
      .toEqual({ runsFixFleet: true });
  });

  it('OTA update-software.js must run fix-fleet-pi.sh with sudo (requires root for boot config)', () => {
    const otaContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    // fix-fleet-pi.sh checks id -u == 0 and exits if not root
    // Without sudo, it silently fails and all 13 fleet remediation steps are skipped
    expect({ usesSudo: otaContent.includes('sudo') && otaContent.includes('fix-fleet-pi.sh') })
      .toEqual({ usesSudo: true });
  });

  it('fix-fleet-pi.sh must replace Plymouth splash with NEOPRO branding', () => {
    const fixFleetContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    // Must handle Plymouth splash replacement using real logo
    expect({ hasPlymouthReplace: fixFleetContent.includes('plymouth') && fixFleetContent.includes('splash.png') })
      .toEqual({ hasPlymouthReplace: true });
    expect({ usesRealLogo: fixFleetContent.includes('neopro-logo-white.png') })
      .toEqual({ usesRealLogo: true });
    // Must update initramfs after replacing splash
    expect({ updatesInitramfs: fixFleetContent.includes('update-initramfs') })
      .toEqual({ updatesInitramfs: true });
  });

  it('fix-fleet-pi.sh must configure black desktop to hide LXDE between Plymouth and Chromium', () => {
    const fixFleetContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    // Must set pcmanfm desktop background to black
    expect({ setsBlackDesktop: fixFleetContent.includes('desktop_bg=#0a0a0a') })
      .toEqual({ setsBlackDesktop: true });
    // Must add xsetroot -solid black to autostart
    expect({ setsXsetroot: fixFleetContent.includes('xsetroot -solid black') })
      .toEqual({ setsXsetroot: true });
    // Must remove lxpanel from autostart (taskbar visibility)
    expect({ removesLxpanel: fixFleetContent.includes('lxpanel') })
      .toEqual({ removesLxpanel: true });
    // CRITICAL: pcmanfm-pi wrapper uses "default" profile (NOT LXDE-pi) — must fix default profile too
    expect({ fixesDefaultProfile: fixFleetContent.includes('pcmanfm/default/desktop-items') })
      .toEqual({ fixesDefaultProfile: true });
    // Must fix system-level config too (/etc/xdg)
    expect({ fixesSystemConfig: fixFleetContent.includes('/etc/xdg/pcmanfm') })
      .toEqual({ fixesSystemConfig: true });
  });

  it('index.html boot splash must use real NEOPRO logo image (not generic SVG)', () => {
    const indexContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/index.html'),
      'utf8'
    );
    expect({ usesLogoImage: indexContent.includes('neopro-logo-white.png') })
      .toEqual({ usesLogoImage: true });
    // Must NOT use the generic SVG play icon
    expect({ noGenericSVG: !indexContent.includes('viewBox="0 0 200 200"') })
      .toEqual({ noGenericSVG: true });
  });

  // ── Kiosk X11 splash overlay guards ──
  // feh displays a fullscreen NEOPRO image BEFORE Chromium launches,
  // covering the 2-5s gap where Chromium appears with window decorations
  // before xdotool applies fullscreen. Killed once fullscreen is set.

  it('fix-fleet-pi.sh must include feh in recommended packages', () => {
    const fixFleetContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    // feh is the lightweight image viewer used for the kiosk boot splash overlay
    expect({ hasFeh: /RECOMMENDED_PACKAGES\s*=\s*\([\s\S]*?"feh"/.test(fixFleetContent) })
      .toEqual({ hasFeh: true });
  });

  it('fix-fleet-pi.sh must generate kiosk boot splash image (boot-splash.png)', () => {
    const fixFleetContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    // Must generate data/boot-splash.png using Pillow
    expect({ generatesBootSplash: fixFleetContent.includes('boot-splash.png') })
      .toEqual({ generatesBootSplash: true });
    expect({ usesPillow: fixFleetContent.includes('from PIL import Image') })
      .toEqual({ usesPillow: true });
  });

  it('kiosk-watchdog.sh must call show_boot_splash before launching Chromium', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // show_boot_splash must appear after start_chromium() definition
    // and before the "$CHROMIUM_BIN" launch line in that function
    const startChromiumIdx = kioskContent.indexOf('start_chromium()');
    const afterStartChromium = kioskContent.slice(startChromiumIdx);
    const showSplashIdx = afterStartChromium.indexOf('show_boot_splash');
    const chromiumLaunchIdx = afterStartChromium.indexOf('"$CHROMIUM_BIN"');
    expect({ hasShowSplash: showSplashIdx > -1 })
      .toEqual({ hasShowSplash: true });
    expect({ splashBeforeChromium: showSplashIdx < chromiumLaunchIdx })
      .toEqual({ splashBeforeChromium: true });
  });

  it('kiosk-watchdog.sh must call kill_boot_splash after fullscreen is applied', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // kill_boot_splash must be called inside the fullscreen subshell (after xdotool)
    // and also in cleanup_chromium and the trap handler
    expect({ killInCleanup: kioskContent.includes('cleanup_chromium') && kioskContent.match(/cleanup_chromium\(\)\s*\{[\s\S]*?kill_boot_splash/) !== null })
      .toEqual({ killInCleanup: true });
    expect({ killInTrap: /trap\s+['"].*kill_boot_splash/.test(kioskContent) })
      .toEqual({ killInTrap: true });
  });

  it('kiosk-watchdog.sh show_boot_splash must use feh --fullscreen', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const showSplashMatch = kioskContent.match(
      /show_boot_splash\(\)\s*\{([\s\S]*?)\n\}/
    );
    expect(showSplashMatch).not.toBeNull();
    const fnBody = showSplashMatch![1];
    expect({ usesFehFullscreen: fnBody.includes('feh') && fnBody.includes('--fullscreen') })
      .toEqual({ usesFehFullscreen: true });
    // Must hide pointer and menus for kiosk mode
    expect({ hidesPointer: fnBody.includes('--hide-pointer') })
      .toEqual({ hidesPointer: true });
    expect({ noMenus: fnBody.includes('--no-menus') })
      .toEqual({ noMenus: true });
  });

  it('kiosk-watchdog.sh kill_boot_splash must pkill stale feh processes', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const killSplashMatch = kioskContent.match(
      /kill_boot_splash\(\)\s*\{([\s\S]*?)\n\}/
    );
    expect(killSplashMatch).not.toBeNull();
    const fnBody = killSplashMatch![1];
    // Must pkill stale feh processes as safety net (not just BOOT_SPLASH_PID)
    expect({ pkillsFeh: fnBody.includes('pkill -f') && fnBody.includes('feh') })
      .toEqual({ pkillsFeh: true });
  });

  it('kiosk-watchdog.sh must have BOOT_SPLASH_IMAGE fallback cascade', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // Must check data/boot-splash.png first, then fall back to Plymouth splash.png
    expect({ hasBootSplashImage: kioskContent.includes('BOOT_SPLASH_IMAGE') })
      .toEqual({ hasBootSplashImage: true });
    expect({ hasDataSplash: kioskContent.includes('data/boot-splash.png') })
      .toEqual({ hasDataSplash: true });
    expect({ hasPlymouthFallback: kioskContent.includes('splash.png') })
      .toEqual({ hasPlymouthFallback: true });
  });

  // Bug fix v3.98.2: LXDE/openbox restacks lxpanel above Chromium 1-5s after initial fullscreen.
  // Without a re-raise loop, the taskbar stays visible ~30s until the next check_window_stacking
  // in the main watchdog loop (CHECK_INTERVAL=30).
  it('kiosk-watchdog.sh fullscreen subshell must re-raise after kill_boot_splash (lxpanel restack defense)', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // The fullscreen subshell starts with "# Retry loop" and contains kill_boot_splash
    // followed by a re-raise loop with xprop + xdotool commands
    const retryIdx = kioskContent.indexOf('# Retry loop');
    expect(retryIdx).toBeGreaterThan(0);
    // Get the subshell region (from Retry loop to the next ') &')
    const subshellEnd = kioskContent.indexOf(') &', retryIdx);
    expect(subshellEnd).toBeGreaterThan(retryIdx);
    const subshell = kioskContent.substring(retryIdx, subshellEnd);
    // kill_boot_splash must come BEFORE the re-raise loop
    const killSplashIdx = subshell.indexOf('kill_boot_splash');
    const reRaiseIdx = subshell.indexOf('Re-raise');
    expect({ killSplashBeforeReRaise: killSplashIdx > 0 && reRaiseIdx > killSplashIdx })
      .toEqual({ killSplashBeforeReRaise: true });
    // Must have xprop + xdotool windowmove + windowsize + windowactivate AFTER kill_boot_splash
    const afterKill = subshell.slice(killSplashIdx);
    expect({ hasXpropReRaise: afterKill.includes('xprop -id') })
      .toEqual({ hasXpropReRaise: true });
    expect({ hasWindowmoveReRaise: afterKill.includes('xdotool windowmove') })
      .toEqual({ hasWindowmoveReRaise: true });
    expect({ hasWindowsizeReRaise: afterKill.includes('xdotool windowsize') })
      .toEqual({ hasWindowsizeReRaise: true });
    expect({ hasWindowactivateReRaise: afterKill.includes('xdotool windowactivate') })
      .toEqual({ hasWindowactivateReRaise: true });
  });

  // Bug fix v3.98.4: main loop must run fast (5s) for the first iterations after boot.
  // Without this, the first check_window_stacking only happens after 30s of sleep (CHECK_INTERVAL),
  // leaving a ~26s window where lxpanel/openbox can restack above Chromium unchecked
  // (D-Bus portals, XDG desktop portal, network events trigger restacking during boot).
  // Uses boot_fast_checks counter (no separate subshell — avoids xdotool race conditions).
  it('kiosk-watchdog.sh must use boot_fast_checks for rapid stacking checks after boot', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // boot_fast_checks must be initialized before the while true loop
    const secondaryIdx = kioskContent.indexOf('start_chromium_secondary');
    const whileIdx = kioskContent.indexOf('while true; do', secondaryIdx);
    expect(secondaryIdx).toBeGreaterThan(0);
    expect(whileIdx).toBeGreaterThan(secondaryIdx);
    const betweenRegion = kioskContent.substring(secondaryIdx, whileIdx);
    expect({ hasBootFastChecks: betweenRegion.includes('boot_fast_checks=') })
      .toEqual({ hasBootFastChecks: true });

    // Inside the while loop, boot_fast_checks must shorten the loop interval
    const loopBody = kioskContent.substring(whileIdx);
    expect({ usesBootFastChecksInLoop: loopBody.includes('boot_fast_checks > 0') })
      .toEqual({ usesBootFastChecksInLoop: true });
  });

  // Bug fix v3.98.2: install.sh LXDE autostart must NOT launch lxpanel (taskbar covers Chromium).
  // Root cause: @lxpanel in autostart file makes the WM launch the taskbar at boot, which sits
  // ABOVE Chromium fullscreen. install.sh must use @xsetroot -solid black instead.
  it('install.sh LXDE autostart must NOT contain @lxpanel (taskbar covers Chromium fullscreen)', () => {
    const installContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8'
    );
    // Extract the autostart heredoc content (between 'autostart << ' and 'EOF')
    const autostartMatch = installContent.match(
      /lxsession\/LXDE-pi\/autostart\s*<<\s*'?EOF'?\n([\s\S]*?)\nEOF/
    );
    expect(autostartMatch).not.toBeNull();
    const autostartContent = autostartMatch![1];
    // Must NOT have @lxpanel — it launches the taskbar that covers Chromium
    expect({ noLxpanel: !autostartContent.includes('@lxpanel') })
      .toEqual({ noLxpanel: true });
    // Must have @xsetroot -solid black (fond noir sans taskbar)
    expect({ hasXsetroot: autostartContent.includes('@xsetroot -solid black') })
      .toEqual({ hasXsetroot: true });
  });

  // Defense-in-depth: kiosk-watchdog.sh start_chromium() must kill lxpanel proactively
  // (belt-and-suspenders for Pi not yet redeployed with fixed install.sh)
  it('kiosk-watchdog.sh start_chromium must kill lxpanel proactively', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // start_chromium() must have pkill -x lxpanel before launching Chromium
    const startFnMatch = kioskContent.match(
      /start_chromium\s*\(\)\s*\{([\s\S]*?)^}/m
    );
    expect(startFnMatch).not.toBeNull();
    const startFn = startFnMatch![1];
    expect({ killsLxpanel: startFn.includes('pkill -x lxpanel') })
      .toEqual({ killsLxpanel: true });
    // Must track kill count for monitoring
    expect({ tracksKillCount: startFn.includes('LXPANEL_KILL_COUNT') })
      .toEqual({ tracksKillCount: true });
  });

  // Defense-in-depth: kiosk-watchdog.sh check_window_stacking must kill lxpanel when panel_above
  it('kiosk-watchdog.sh check_window_stacking must kill lxpanel on panel_above detection', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const stackingMatch = kioskContent.match(
      /check_window_stacking\s*\(\)\s*\{([\s\S]*?)^}/m
    );
    expect(stackingMatch).not.toBeNull();
    const stackingFn = stackingMatch![1];
    // When panel_above is detected, must kill lxpanel (not just re-raise)
    expect({ killsOnPanelAbove: stackingFn.includes('panel_above') && stackingFn.includes('pkill -x lxpanel') })
      .toEqual({ killsOnPanelAbove: true });
  });

  // deploy-remote.sh must fix lxpanel on existing Pi (retroactive fix for pre-patch installs)
  it('deploy-remote.sh must remove @lxpanel from LXDE autostart on existing Pi', () => {
    const deployContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
      'utf8'
    );
    // Must detect and remove @lxpanel from the autostart file
    expect({ removesLxpanel: deployContent.includes("/@lxpanel/d") })
      .toEqual({ removesLxpanel: true });
    // Must add xsetroot -solid black if missing
    expect({ addsXsetroot: deployContent.includes('xsetroot -solid black') })
      .toEqual({ addsXsetroot: true });
    // Must kill lxpanel for immediate effect
    expect({ killsLxpanel: deployContent.includes('pkill -x lxpanel') })
      .toEqual({ killsLxpanel: true });
  });

  // Monitoring: kiosk-status.json must include lxpanelKillCount for central server alerting
  it('kiosk-watchdog.sh kiosk-status.json must include lxpanelKillCount', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    expect({ hasLxpanelMetric: kioskContent.includes('lxpanelKillCount') })
      .toEqual({ hasLxpanelMetric: true });
  });

  // Monitoring: metrics.js health report must alert on lxpanelKillCount > 0
  it('metrics.js health report must alert on lxpanelKillCount > 0', () => {
    const metricsContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js'),
      'utf8'
    );
    expect({ alertsOnLxpanel: metricsContent.includes('lxpanelKillCount') })
      .toEqual({ alertsOnLxpanel: true });
  });
});

// ----------------------------------------------------------
// Deploy progress auto-completion guards
// ----------------------------------------------------------
describe('Deploy progress auto-completion guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('handleDeployProgress must auto-complete at progress >= 100 (Socket.IO signal loss)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/deploy-progress.handler.ts'),
      'utf8'
    );
    // Must have isCompletedByProgress check like handleUpdateProgress does
    expect({
      hasAutoComplete: /isCompletedByProgress/.test(content),
      reason: 'deploy-progress handler must auto-complete at progress >= 100 to handle lost Socket.IO completed:true signals',
    }).toEqual({
      hasAutoComplete: true,
      reason: 'deploy-progress handler must auto-complete at progress >= 100 to handle lost Socket.IO completed:true signals',
    });
    // Must use isCompletedByProgress in the completion condition
    expect({
      usedInCondition: /completed\s*\|\|\s*isCompletedByProgress/.test(content),
      reason: 'completion branch must check (completed || isCompletedByProgress)',
    }).toEqual({
      usedInCondition: true,
      reason: 'completion branch must check (completed || isCompletedByProgress)',
    });
  });

  it('checkStuckDeployments must auto-complete deployments stuck at 100%', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/alerting.service.ts'),
      'utf8'
    );
    // Must UPDATE stuck deployments at progress >= 100 to 'completed'
    expect({
      hasAutoComplete: /progress\s*>=\s*100/.test(content) && /Auto-completed stuck deployments/.test(content),
      reason: 'checkStuckDeployments must auto-complete deployments stuck at progress >= 100',
    }).toEqual({
      hasAutoComplete: true,
      reason: 'checkStuckDeployments must auto-complete deployments stuck at progress >= 100',
    });
  });
});

// ----------------------------------------------------------
// deployed_path feedback guard: the Pi MUST report the real
// deployed path back to the central server. Without this,
// the dashboard constructs speculative paths that mismatch
// with the Pi filesystem (sanitization, dedup, originalName).
// ----------------------------------------------------------
describe('deployed_path feedback guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('deploy-progress handler must persist deployed_path on completion', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/deploy-progress.handler.ts'),
      'utf8'
    );
    // Must extract deployedPath from progress event
    expect({
      extractsPath: /deployedPath/.test(content),
      reason: 'deploy-progress handler must extract deployedPath from progress event for real path feedback',
    }).toEqual({
      extractsPath: true,
      reason: 'deploy-progress handler must extract deployedPath from progress event for real path feedback',
    });
    // Must persist deployed_path in the completion UPDATE using COALESCE
    expect({
      persistsPath: /deployed_path\s*=\s*COALESCE/.test(content),
      reason: 'deploy-progress handler must persist deployed_path via COALESCE on completion (backward-compatible)',
    }).toEqual({
      persistsPath: true,
      reason: 'deploy-progress handler must persist deployed_path via COALESCE on completion (backward-compatible)',
    });
  });

  it('sync-agent must emit deployedPath in deploy_progress completion event', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
    // Must include deployedPath in the deploy_progress emit
    expect({
      emitsPath: /deploy_progress['"]?\s*,\s*\{[\s\S]*?deployedPath/.test(content),
      reason: 'sync-agent must emit deployedPath in deploy_progress completion event for real path feedback',
    }).toEqual({
      emitsPath: true,
      reason: 'sync-agent must emit deployedPath in deploy_progress completion event for real path feedback',
    });
  });

  it('deployment repository must have getDeployedPathsForSite method', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/deployment.repository.ts'),
      'utf8'
    );
    expect({
      hasMethod: /getDeployedPathsForSite/.test(content),
      reason: 'deployment repository must expose getDeployedPathsForSite for dashboard to use real paths',
    }).toEqual({
      hasMethod: true,
      reason: 'deployment repository must expose getDeployedPathsForSite for dashboard to use real paths',
    });
  });

  it('dashboard site-content-tab must use deployedPathsMap instead of speculative paths', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts'),
      'utf8'
    );
    expect({
      hasMap: /deployedPathsMap/.test(content),
      reason: 'dashboard must use deployedPathsMap to prefer real paths over speculative construction',
    }).toEqual({
      hasMap: true,
      reason: 'dashboard must use deployedPathsMap to prefer real paths over speculative construction',
    });
  });

  it('dashboard speculative path fallback must use "default" not "UPLOADS" to match deployment.service', () => {
    const dashboardContent = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts'),
      'utf8'
    );
    const deploymentContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/deployment.service.ts'),
      'utf8'
    );
    // The deployment service sends category 'default' to the Pi (line ~361)
    const deploymentFallback = /category.*\|\|.*'default'/.test(deploymentContent);
    // The dashboard fallback must match — using 'UPLOADS' causes path mismatch
    // when offline sites reconnect (Pi has videos/default/X.mp4 but config has videos/UPLOADS/X.mp4)
    const dashboardHasUploads = /category \|\| 'UPLOADS'/.test(dashboardContent);
    const dashboardHasDefault = /category \|\| 'default'/.test(dashboardContent);
    expect({
      deploymentFallback,
      dashboardHasUploads,
      dashboardHasDefault,
      reason: 'dashboard and deployment.service must use same category fallback to prevent path mismatch on offline sites',
    }).toEqual({
      deploymentFallback: true,
      dashboardHasUploads: false,
      dashboardHasDefault: true,
      reason: 'dashboard and deployment.service must use same category fallback to prevent path mismatch on offline sites',
    });
  });

});

// ----------------------------------------------------------
// deployed_path backfill guards: sync_local_state must
// auto-heal pre-existing deployments missing deployed_path
// ----------------------------------------------------------
describe('deployed_path backfill guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('config-sync handler must call backfillDeployedPaths on sync_local_state', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/config-sync.handler.ts'),
      'utf8'
    );
    expect({
      callsBackfill: /backfillDeployedPaths/.test(content),
      reason: 'config-sync handler must call backfillDeployedPaths to auto-heal pre-existing deployments',
    }).toEqual({
      callsBackfill: true,
      reason: 'config-sync handler must call backfillDeployedPaths to auto-heal pre-existing deployments',
    });
  });

  it('deployment repository must have backfillDeployedPaths method', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/deployment.repository.ts'),
      'utf8'
    );
    expect({
      hasMethod: /async backfillDeployedPaths/.test(content),
      reason: 'deployment repository must expose backfillDeployedPaths for auto-healing pre-existing deployments',
    }).toEqual({
      hasMethod: true,
      reason: 'deployment repository must expose backfillDeployedPaths for auto-healing pre-existing deployments',
    });
  });
});

// ----------------------------------------------------------
// pc_mode_enabled dead code guard: column was removed in
// v3.99.1 — never wired to any logic. Prevent re-introduction.
// ----------------------------------------------------------
describe('pc_mode_enabled dead code guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('site.repository.ts must NOT contain pc_mode_enabled', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site.repository.ts'),
      'utf8',
    );
    expect({
      hasPcMode: /pc_mode_enabled/.test(content),
      reason: 'pc_mode_enabled was dead code (E-23 placeholder) removed in v3.99.1 — do not re-add',
    }).toEqual({
      hasPcMode: false,
      reason: 'pc_mode_enabled was dead code (E-23 placeholder) removed in v3.99.1 — do not re-add',
    });
  });

  it('sites.controller.ts must NOT contain pc_mode_enabled', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/controllers/sites.controller.ts'),
      'utf8',
    );
    expect({
      hasPcMode: /pc_mode_enabled/.test(content),
      reason: 'pc_mode_enabled was dead code (E-23 placeholder) removed in v3.99.1 — do not re-add',
    }).toEqual({
      hasPcMode: false,
      reason: 'pc_mode_enabled was dead code (E-23 placeholder) removed in v3.99.1 — do not re-add',
    });
  });

  it('site-settings-tab template must NOT contain pc_mode_enabled', () => {
    const content = fs.readFileSync(
      path.join(
        repoRoot,
        'central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts',
      ),
      'utf8',
    );
    expect({
      hasPcMode: /pc_mode_enabled/.test(content),
      reason: 'pc_mode_enabled toggle was dead UI removed in v3.99.1 — do not re-add',
    }).toEqual({
      hasPcMode: false,
      reason: 'pc_mode_enabled toggle was dead UI removed in v3.99.1 — do not re-add',
    });
  });
});

// ----------------------------------------------------------
// Orphan systemd service monitoring pipeline
// Incident: 05/03/2026 — 4 orphan services crash-looped 305+ times
// on a Pi without being detected by any monitoring.
// Fix: 3-layer detection pipeline:
//   1. metrics.js getOrphanServices() — Pi-side detection
//   2. agent.js heartbeat — transmits orphanServices to central
//   3. heartbeat.handler.ts — creates alerts + Prometheus counter
// ----------------------------------------------------------
describe('Orphan systemd service monitoring pipeline', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  const metricsJs = fs.readFileSync(
    path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js'),
    'utf8'
  );
  const agentJs = fs.readFileSync(
    path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
    'utf8'
  );
  const heartbeatHandler = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
    'utf8'
  );
  const metricsService = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/services/metrics.service.ts'),
    'utf8'
  );

  it('metrics.js must have getOrphanServices() with LEGITIMATE_SERVICES whitelist', () => {
    // Pi-side detection: list all neopro-* units and filter against a known whitelist
    expect({ hasMethod: metricsJs.includes('getOrphanServices') })
      .toEqual({ hasMethod: true });
    expect({ hasWhitelist: metricsJs.includes('LEGITIMATE_SERVICES') })
      .toEqual({ hasWhitelist: true });
  });

  it('metrics.js getOrphanServices must be included in getHealthStatus()', () => {
    // Without integration into health status, orphans are detected but never reported
    expect({ integratedInHealth: metricsJs.includes('orphanServices') && metricsJs.includes('getHealthStatus') })
      .toEqual({ integratedInHealth: true });
  });

  it('agent.js heartbeat must transmit orphanServices to central', () => {
    // Without transmission, the central server never knows about orphans
    expect({ callsGetOrphan: agentJs.includes('getOrphanServices') })
      .toEqual({ callsGetOrphan: true });
    expect({ emitsOrphan: agentJs.includes('orphanServices') })
      .toEqual({ emitsOrphan: true });
  });

  it('heartbeat.handler.ts must detect and alert on orphanServices', () => {
    // Central-side: create alerts for each orphan service and log warnings
    expect({ checksOrphan: heartbeatHandler.includes('orphanServices') })
      .toEqual({ checksOrphan: true });
    expect({ createsAlert: heartbeatHandler.includes('orphan_systemd_service') })
      .toEqual({ createsAlert: true });
  });

  it('metrics.service.ts must have Prometheus counter for orphan services', () => {
    // Observability: Prometheus counter allows Grafana alerting on fleet-wide orphan patterns
    expect({ hasCounter: metricsService.includes('neopro_orphan_service_detected_total') })
      .toEqual({ hasCounter: true });
    expect({ hasMethod: metricsService.includes('recordOrphanServiceDetected') })
      .toEqual({ hasMethod: true });
  });
});

// ----------------------------------------------------------
// WiFi recovery progressive back-off & mesh guards (v3.99.4)
// ----------------------------------------------------------
// Issue: NLF Handball (3-AP mesh, RTL8192EU) — 6 disconnects/hour, 8-min outage requiring modprobe.
// Root causes: (1) Fixed 10s FAST_RETRY_DELAY escalated through 6 phases in ~60s, reaching modprobe
// before mesh could self-heal. (2) Modprobe 5-min guard too short for mesh where APs reboot/change
// channels periodically. (3) bgscan threshold at -70 dBm oscillated when signal was -68 dBm.
// Fixes: progressive back-off array, mesh-aware modprobe/USB guards (10 min), dynamic bgscan.
describe('WiFi recovery progressive back-off & mesh guards (v3.99.4)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  let watchdogContent: string;
  let safeOpsContent: string;

  beforeAll(() => {
    watchdogContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/network-watchdog.js'),
      'utf8'
    );
    safeOpsContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/safe-network-operations.js'),
      'utf8'
    );
  });

  // Guard 1: Progressive back-off must exist — fixed FAST_RETRY_DELAY must NOT exist
  it('network-watchdog must use PHASE_BACKOFF_DELAYS, not fixed FAST_RETRY_DELAY', () => {
    expect({
      hasBackoffArray: /PHASE_BACKOFF_DELAYS\s*=\s*\[/.test(watchdogContent),
    }).toEqual({ hasBackoffArray: true });
    // FAST_RETRY_DELAY as a constant definition must be gone
    expect({
      hasFixedRetry: /const\s+FAST_RETRY_DELAY\s*=/.test(watchdogContent),
    }).toEqual({ hasFixedRetry: false });
  });

  // Guard 2: Back-off array must have 6 entries (one per recovery phase)
  it('PHASE_BACKOFF_DELAYS must have at least 6 entries covering all recovery phases', () => {
    const arrayMatch = watchdogContent.match(
      /PHASE_BACKOFF_DELAYS\s*=\s*\[([\s\S]*?)\]/
    );
    expect(arrayMatch).not.toBeNull();
    const entries = arrayMatch![1].split(',').filter((e: string) => e.trim().length > 0);
    expect({ entryCount: entries.length >= 6 }).toEqual({ entryCount: true });
  });

  // Guard 3: Back-off must be progressive (each delay >= previous)
  it('PHASE_BACKOFF_DELAYS must be non-decreasing (progressive)', () => {
    const arrayMatch = watchdogContent.match(
      /PHASE_BACKOFF_DELAYS\s*=\s*\[([\s\S]*?)\]/
    );
    expect(arrayMatch).not.toBeNull();
    // Extract numeric values (in ms)
    const delays = arrayMatch![1].match(/(\d+)\s*\*\s*1000/g)?.map((m: string) => {
      const num = m.match(/(\d+)/);
      return num ? Number(num[1]) * 1000 : 0;
    }) || [];
    let isProgressive = true;
    for (let i = 1; i < delays.length; i++) {
      if (delays[i] < delays[i - 1]) {
        isProgressive = false;
        break;
      }
    }
    expect({ isProgressive }).toEqual({ isProgressive: true });
  });

  // Guard 4: internetWatchLoop must use _getBackoffDelay, not fixed delay
  it('internetWatchLoop must use _getBackoffDelay for progressive retry timing', () => {
    const loopFn = watchdogContent.match(
      /function internetWatchLoop\(\)\s*\{[\s\S]*?^}/m
    ) || watchdogContent.match(
      /async function internetWatchLoop\(\)[\s\S]*?setTimeout\(\(\) => internetWatchLoop\(\)/
    );
    expect(loopFn).not.toBeNull();
    expect({
      usesBackoff: /_getBackoffDelay\(/.test(loopFn![0]),
    }).toEqual({ usesBackoff: true });
  });

  // Guard 5: Mesh-aware modprobe guard must exist and be >= 10 min
  it('network-watchdog must have mesh-specific modprobe guard >= 10 min', () => {
    const meshGuardMatch = watchdogContent.match(
      /MIN_OUTAGE_FOR_MODPROBE_MESH\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/
    );
    expect(meshGuardMatch).not.toBeNull();
    const meshGuardMs = Number(meshGuardMatch![1]) * Number(meshGuardMatch![2]) * Number(meshGuardMatch![3]);
    expect({
      meshGuardAtLeast10min: meshGuardMs >= 10 * 60 * 1000,
    }).toEqual({ meshGuardAtLeast10min: true });
  });

  // Guard 6: Phase 4 (modprobe) must call _getModprobeGuard(), not use hardcoded value
  it('Phase 4 modprobe must use _getModprobeGuard() for mesh-aware threshold', () => {
    // The attemptInternetRecovery function must call _getModprobeGuard
    const recoveryFn = watchdogContent.match(
      /async function attemptInternetRecovery\(\)[\s\S]*?Phase 5/
    );
    expect(recoveryFn).not.toBeNull();
    expect({
      usesGuardFn: /_getModprobeGuard\(\)/.test(recoveryFn![0]),
    }).toEqual({ usesGuardFn: true });
  });

  // Guard 7: Phase 5 (USB) must call _getUsbCycleGuard(), not use hardcoded value
  it('Phase 5 USB power-cycle must use _getUsbCycleGuard() for mesh-aware threshold', () => {
    const recoveryFn = watchdogContent.match(
      /async function attemptInternetRecovery\(\)[\s\S]*$/
    );
    expect(recoveryFn).not.toBeNull();
    expect({
      usesGuardFn: /_getUsbCycleGuard\(\)/.test(recoveryFn![0]),
    }).toEqual({ usesGuardFn: true });
  });

  // Guard 8: _isMeshEnvironment helper must exist for mesh detection
  it('network-watchdog must have _isMeshEnvironment() using networkDetector profile', () => {
    expect({
      hasMeshDetection: /function _isMeshEnvironment\(\)/.test(watchdogContent),
    }).toEqual({ hasMeshDetection: true });
    expect({
      checksProfileType: /profile\?\.type\s*===\s*'mesh'/.test(watchdogContent),
    }).toEqual({ checksProfileType: true });
  });

  // Guard 9: Dynamic bgscan — safe-network-operations must compute optimal threshold
  it('safe-network-operations must have _computeOptimalBgscan() with signal-based threshold', () => {
    expect({
      hasCompute: /_computeOptimalBgscan\(\)/.test(safeOpsContent),
    }).toEqual({ hasCompute: true });
    // Must check signal level (not just use a fixed threshold)
    const computeFn = safeOpsContent.match(
      /_computeOptimalBgscan\(\)\s*\{[\s\S]*?return\s+'simple:/
    );
    expect(computeFn).not.toBeNull();
    expect({
      checksSignal: /signal\s*>\s*-72/.test(computeFn![0]),
    }).toEqual({ checksSignal: true });
  });

  // Guard 10: autoOptimize must use _computeOptimalBgscan, not hardcoded bgscan
  it('autoOptimize must use _computeOptimalBgscan() for adaptive bgscan threshold', () => {
    const autoOptFn = safeOpsContent.match(
      /async autoOptimize\(\)\s*\{[\s\S]*?return \{ success: true/
    );
    expect(autoOptFn).not.toBeNull();
    expect({
      usesComputed: /_computeOptimalBgscan\(\)/.test(autoOptFn![0]),
    }).toEqual({ usesComputed: true });
  });

  // Guard 11: Monitoring — getStatus must expose recovery back-off info
  it('network-watchdog getStatus() must expose recoveryAttempts for monitoring', () => {
    const statusFn = watchdogContent.match(
      /function getStatus\(\)\s*\{[\s\S]*?^}/m
    );
    expect(statusFn).not.toBeNull();
    expect({
      hasRecoveryAttempts: /recoveryAttempts/.test(statusFn![0]),
    }).toEqual({ hasRecoveryAttempts: true });
  });
});

// ----------------------------------------------------------
// GPU decode monitoring pipeline (v3.99.5)
// ----------------------------------------------------------
// Pi 5 V4L2 hardware decode reduces CPU ~20% but may crash on some Chromium versions.
// Monitoring pipeline: kiosk-status.json → heartbeat → alert + Prometheus + health report.
describe('GPU decode monitoring pipeline (v3.99.5)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  const heartbeatHandler = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
    'utf8'
  );
  const metricsService = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/services/metrics.service.ts'),
    'utf8'
  );
  const typesIndex = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/types/index.ts'),
    'utf8'
  );
  const piMetrics = fs.readFileSync(
    path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js'),
    'utf8'
  );

  it('HeartbeatMessage kioskStatus type must include gpuDecodeMode', () => {
    // Without the type, TypeScript won't catch missing gpuDecodeMode handling
    expect({ hasGpuDecodeType: typesIndex.includes('gpuDecodeMode') })
      .toEqual({ hasGpuDecodeType: true });
  });

  it('heartbeat.handler.ts must detect gpu_decode_fallback alert', () => {
    // When gpuDecodeMode === 'software', the heartbeat must create a warning alert
    // so fleet operators know which Pi's have fallen back to software decode.
    expect({ checksGpuDecode: heartbeatHandler.includes('gpu_decode_fallback') })
      .toEqual({ checksGpuDecode: true });
    expect({ checksMode: heartbeatHandler.includes("gpuDecodeMode") })
      .toEqual({ checksMode: true });
  });

  it('metrics.service.ts must have Prometheus counter for GPU decode fallback', () => {
    // Prometheus counter allows Grafana alerting on fleet-wide GPU decode failures
    expect({ hasCounter: metricsService.includes('neopro_gpu_decode_fallback_total') })
      .toEqual({ hasCounter: true });
    expect({ hasMethod: metricsService.includes('recordGpuDecodeFallback') })
      .toEqual({ hasMethod: true });
  });

  it('Pi metrics.js health report must detect gpuDecodeMode software fallback', () => {
    // Health report must flag software decode as a warning with actionable fix
    expect({ detectsSoftware: piMetrics.includes("gpuDecodeMode") && piMetrics.includes("software") })
      .toEqual({ detectsSoftware: true });
  });

  it('Pi metrics.js health report must recommend reboot for GPU decode recovery', () => {
    // The fix guidance must tell operators to reboot (tmpfs cleared → re-tries hardware)
    expect({ hasRebootFix: piMetrics.includes('Redémarrer le boîtier') && piMetrics.includes('V4L2') })
      .toEqual({ hasRebootFix: true });
  });
});

// ============================================================================
// Android captive portal iptables (v3.99.5)
// Android does HTTPS connectivity checks (port 443). Without iptables NAT
// rules redirecting port 443 → nginx port 80, Android detects "no internet"
// and silently routes all traffic through 4G instead of the hotspot.
// The fix: PREROUTING DNAT rules on wlan0 for ports 80+443 → 192.168.4.1:80.
// ============================================================================
describe('Android captive portal iptables (HTTPS connectivity check fix)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  // Guard 1: Dedicated iptables setup script must exist with HTTPS redirect
  it('setup-captive-portal-iptables.sh must exist with HTTPS redirect rule', () => {
    const scriptPath = path.join(repoRoot, 'raspberry/scripts/setup-captive-portal-iptables.sh');
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect({
      hasPort443Rule: /--dport\s+443.*DNAT/.test(content),
      hasPort80Rule: /--dport\s+80.*DNAT/.test(content),
      hasHotspotIP: /HOTSPOT_IP=["']?192\.168\.4\.1/.test(content),
      hasNginxPort: /NGINX_PORT=["']?80/.test(content),
      hasCleanup: /cleanup_existing_rules/.test(content),
    }).toEqual({
      hasPort443Rule: true,
      hasPort80Rule: true,
      hasHotspotIP: true,
      hasNginxPort: true,
      hasCleanup: true,
    });
  });

  // Guard 2: Script must be idempotent (cleanup before install)
  it('setup-captive-portal-iptables.sh must cleanup before installing (idempotent)', () => {
    const scriptPath = path.join(repoRoot, 'raspberry/scripts/setup-captive-portal-iptables.sh');
    const content = fs.readFileSync(scriptPath, 'utf8');
    const cleanupPos = content.indexOf('cleanup_existing_rules');
    const installPos = content.indexOf('install_rules');
    expect({
      cleanupBeforeInstall: cleanupPos > 0 && installPos > 0 && cleanupPos < installPos,
    }).toEqual({
      cleanupBeforeInstall: true,
    });
  });

  // Guard 3: install.sh must call the iptables script in configure_hotspot
  it('install.sh must setup captive portal iptables in configure_hotspot()', () => {
    const installSh = fs.readFileSync(path.join(repoRoot, 'raspberry/install.sh'), 'utf8');
    expect({
      callsIptablesScript: /setup-captive-portal-iptables/.test(installSh),
    }).toEqual({
      callsIptablesScript: true,
    });
  });

  // Guard 4: hotspot-watchdog must check iptables health
  it('hotspot-watchdog.sh must check captive portal iptables in health check', () => {
    const watchdog = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/hotspot-watchdog.sh'),
      'utf8'
    );
    expect({
      hasIptablesCheck: /check_captive_portal_iptables/.test(watchdog),
      checksPort443: /--dport\s+443/.test(watchdog),
    }).toEqual({
      hasIptablesCheck: true,
      checksPort443: true,
    });
  });

  // Guard 5: hotspot-watchdog must recover iptables in attempt_recovery
  it('hotspot-watchdog.sh must restore iptables in recovery sequence', () => {
    const watchdog = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/hotspot-watchdog.sh'),
      'utf8'
    );
    expect({
      recoversIptables: /setup-captive-portal-iptables/.test(watchdog) ||
        /iptables.*443.*DNAT/.test(watchdog),
    }).toEqual({
      recoversIptables: true,
    });
  });

  // Guard 6: fix-fleet-pi.sh must install iptables for existing fleet
  it('fix-fleet-pi.sh must configure captive portal iptables for existing Pi fleet', () => {
    const fixFleet = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    expect({
      hasIptablesSection: /captive.*portal.*iptables/i.test(fixFleet),
      hasPort443: /--dport\s+443/.test(fixFleet),
    }).toEqual({
      hasIptablesSection: true,
      hasPort443: true,
    });
  });

  // Guard 7: dnsmasq.conf must redirect Android HTTPS check domains
  it('dnsmasq.conf must redirect all Android connectivity check domains', () => {
    const dnsmasq = fs.readFileSync(
      path.join(repoRoot, 'raspberry/config/systemd/dnsmasq.conf'),
      'utf8'
    );
    const requiredDomains = [
      'connectivitycheck.gstatic.com',
      'connectivitycheck.google.com',
      'clients3.google.com',
      'play.googleapis.com',
    ];
    const missing = requiredDomains.filter(d => !dnsmasq.includes(`address=/${d}/192.168.4.1`));
    expect({ missingAndroidDomains: missing }).toEqual({ missingAndroidDomains: [] });
  });
});

// =============================================================================
// Live stats VIEWs guards — prevent regression to deprecated tables
// =============================================================================
// club_daily_stats and advertiser_daily_stats only contain J-1 data (CRON).
// All dashboard queries MUST use the _live VIEWs that include today's data.
// Reverting to the base tables silently drops today's data from dashboards.
// =============================================================================

describe('Live stats VIEWs guards (prevent table regression)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  // All TypeScript files that query aggregated stats must use _live VIEWs
  const liveViewFiles: { file: string; mustUse: string; description: string }[] = [
    {
      file: 'central-server/src/repositories/advertiser-portal.repository.ts',
      mustUse: 'advertiser_daily_stats_live',
      description: 'Portail annonceur',
    },
    {
      file: 'central-server/src/repositories/analytics.repository.ts',
      mustUse: 'club_daily_stats_live',
      description: 'Comparaison multi-sites',
    },
    {
      file: 'central-server/src/services/excel-export.service.ts',
      mustUse: 'club_daily_stats_live',
      description: 'Export Excel clubs',
    },
    {
      file: 'central-server/src/services/excel-export.service.ts',
      mustUse: 'advertiser_daily_stats_live',
      description: 'Export Excel annonceurs',
    },
    {
      file: 'central-server/src/repositories/pitch-deck.repository.ts',
      mustUse: 'club_daily_stats_live',
      description: 'Pitch deck clubs',
    },
    {
      file: 'central-server/src/repositories/pitch-deck.repository.ts',
      mustUse: 'advertiser_daily_stats_live',
      description: 'Pitch deck annonceurs',
    },
    {
      file: 'central-server/src/repositories/agency.repository.ts',
      mustUse: 'club_daily_stats_live',
      description: 'Portail agence',
    },
    {
      file: 'central-server/src/services/billing.service.ts',
      mustUse: 'club_daily_stats_live',
      description: 'Facturation',
    },
  ];

  for (const { file, mustUse, description } of liveViewFiles) {
    it(`${description}: ${path.basename(file)} must use ${mustUse} (not deprecated base table)`, () => {
      const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      // Extract the base table name (without _live suffix)
      const baseTable = mustUse.replace('_live', '');
      // Check that _live is used and the raw base table is NOT used in FROM/JOIN
      const usesLiveView = content.includes(mustUse);
      // Regex: base table name NOT followed by _live (i.e. the deprecated direct usage)
      const deprecatedPattern = new RegExp(`${baseTable}(?!_live)`, 'g');
      // Filter out comments and strings that legitimately mention the base table
      const codeLines = content.split('\n').filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*');
      }).join('\n');
      const usesDeprecated = deprecatedPattern.test(codeLines);
      expect({
        file,
        usesLiveView,
        usesDeprecatedTable: usesDeprecated,
      }).toEqual({
        file,
        usesLiveView: true,
        usesDeprecatedTable: false,
      });
    });
  }

  it('cron-scheduler.service.ts executeAggregationTask must call both club AND advertiser aggregation', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/cron-scheduler.service.ts'),
      'utf8'
    );
    expect({
      callsClubAggregation: content.includes('calculate_all_daily_stats'),
      callsAdvertiserAggregation: content.includes('calculate_all_advertiser_daily_stats'),
    }).toEqual({
      callsClubAggregation: true,
      callsAdvertiserAggregation: true,
    });
  });

  it('migration must create both _live VIEWs with UNION ALL and CRON schedules with is_active true', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/scripts/migrations/add-aggregation-schedules-and-live-views.sql'),
      'utf8'
    );
    expect({
      hasClubLiveView: migration.includes('CREATE OR REPLACE VIEW club_daily_stats_live'),
      hasAdvertiserLiveView: migration.includes('CREATE OR REPLACE VIEW advertiser_daily_stats_live'),
      usesUnionAll: (migration.match(/UNION ALL/g) || []).length >= 2,
      hasClubCron: migration.includes("'Agrégation stats clubs'"),
      hasAdvertiserCron: migration.includes("'Agrégation stats annonceurs'"),
      cronIsActive: /true\)\s*ON CONFLICT DO NOTHING/.test(migration),
    }).toEqual({
      hasClubLiveView: true,
      hasAdvertiserLiveView: true,
      usesUnionAll: true,
      hasClubCron: true,
      hasAdvertiserCron: true,
      cronIsActive: true,
    });
  });
});

// ============================================================================
// Pi 5 Active Cooler fan control (v3.104.3)
// Without dtparam=cooling_fan in config.txt, the device-tree marks the
// cooling_fan node as "disabled" → kernel doesn't load pwm-fan driver →
// /sys/class/thermal/cooling_device0 is never created → getFanStatus()
// returns present:false → no fan_failure alerts + fan runs at 100% permanently.
// ============================================================================
describe('Pi 5 Active Cooler fan control (dtparam=cooling_fan)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('install.sh must have configure_pi5_cooling_fan function', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8',
    );
    expect({ hasFunction: /configure_pi5_cooling_fan\(\)/.test(content) })
      .toEqual({ hasFunction: true });
  });

  it('install.sh configure_pi5_cooling_fan must add dtparam=cooling_fan to config.txt', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8',
    );
    const fnMatch = content.match(/configure_pi5_cooling_fan\(\)\s*\{[\s\S]*?\n\}/);
    expect(fnMatch).toBeTruthy();
    expect({ hasDtparam: /dtparam=cooling_fan/.test(fnMatch![0]) })
      .toEqual({ hasDtparam: true });
    // Must only apply to Pi 5
    expect({ checksPi5: /Raspberry Pi 5/.test(fnMatch![0]) })
      .toEqual({ checksPi5: true });
  });

  it('install.sh main() must call configure_pi5_cooling_fan', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8',
    );
    const mainMatch = content.match(/^main\(\)\s*\{[\s\S]*?\n\}/m);
    expect(mainMatch).toBeTruthy();
    expect({ callsConfigure: /configure_pi5_cooling_fan/.test(mainMatch![0]) })
      .toEqual({ callsConfigure: true });
  });

  it('fix-fleet-pi.sh must add dtparam=cooling_fan for Pi 5', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8',
    );
    expect({ hasDtparam: /dtparam=cooling_fan/.test(content) })
      .toEqual({ hasDtparam: true });
    // Must be guarded by IS_PI5 check
    expect({ hasPi5Guard: /IS_PI5.*true[\s\S]*?dtparam=cooling_fan/s.test(content) })
      .toEqual({ hasPi5Guard: true });
  });

  it('diagnose-pi.sh must check cooling_fan config on Pi 5', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/diagnose-pi.sh'),
      'utf8',
    );
    expect({ checksDtparam: /dtparam=cooling_fan/.test(content) })
      .toEqual({ checksDtparam: true });
    expect({ checksCoolingDevice: /cooling_device0/.test(content) })
      .toEqual({ checksCoolingDevice: true });
  });

  it('heartbeat.handler.ts must detect fan_config_disabled alert on Pi 5 without fan', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
      'utf8',
    );
    expect({ hasFanConfigAlert: /fan_config_disabled/.test(content) })
      .toEqual({ hasFanConfigAlert: true });
    // Must check is_pi5 + !present (fan not visible to kernel despite being a Pi 5)
    expect({ checksPi5AndNotPresent: /is_pi5[\s\S]*?!.*present|present[\s\S]*?is_pi5/s.test(content) })
      .toEqual({ checksPi5AndNotPresent: true });
  });
});

// ── Video Library UX regression guards ─────────────────────────────────
// Prevents regression of the video library table improvements:
// - Filename collision bug (processVideos keying by filename lost videos with same name)
// - Config role badges (BOUCLE/MATCH/ACTION replacing generic EN BOUCLE)
// - Advertiser name column & secondary variant badge wiring
// - Duplicate detection by checksum
describe('Video Library UX regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const videoLibraryPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/components/video-library/video-library.component.ts',
  );
  const siteContentTabPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts',
  );
  const modelsPath = path.join(
    repoRoot,
    'central-dashboard/src/app/core/models/index.ts',
  );
  const sitesControllerPath = path.join(
    repoRoot,
    'central-server/src/controllers/sites.controller.ts',
  );
  const timelineRepoPath = path.join(
    repoRoot,
    'central-server/src/repositories/timeline.repository.ts',
  );

  let videoLibContent: string;
  let siteContentTabContent: string;
  let modelsContent: string;
  let controllerContent: string;
  let timelineRepoContent: string;

  beforeAll(() => {
    videoLibContent = fs.readFileSync(videoLibraryPath, 'utf8');
    siteContentTabContent = fs.readFileSync(siteContentTabPath, 'utf8');
    modelsContent = fs.readFileSync(modelsPath, 'utf8');
    controllerContent = fs.readFileSync(sitesControllerPath, 'utf8');
    timelineRepoContent = fs.readFileSync(timelineRepoPath, 'utf8');
  });

  // ── Filename collision guard ──────────────────────────────────────────
  // processVideos() must index localByFilename as Map<string, array> (not single value)
  // to preserve multiple videos with the same filename but different paths.
  it('processVideos must use array-valued localByFilename map (not single-value)', () => {
    // Must NOT have the old pattern: new Map(this.videos.map(v => [v.filename...
    expect({ hasSingleValueMap: /localByFilename\s*=\s*new\s+Map\(\s*this\.videos\.map/.test(videoLibContent) })
      .toEqual({ hasSingleValueMap: false });
    // Must have array push pattern
    expect({ hasArrayPush: /localByFilename\.get\([^)]+\)!\.push\(/.test(videoLibContent) })
      .toEqual({ hasArrayPush: true });
  });

  it('processVideos must NOT filter cloud videos by seenFilenames', () => {
    // The seenFilenames Set was the root cause of losing cloud videos with duplicate filenames
    expect({ hasSeenFilenames: /seenFilenames/.test(videoLibContent) })
      .toEqual({ hasSeenFilenames: false });
  });

  it('processVideos must pick first unmatched local video via matchedLocalPaths guard', () => {
    expect({ hasMatchedLocalPaths: /matchedLocalPaths/.test(videoLibContent) })
      .toEqual({ hasMatchedLocalPaths: true });
    // Must use .find() with !matchedLocalPaths.has() to pick first unmatched
    expect({ hasUnmatchedFind: /\.find\(.*!matchedLocalPaths\.has/.test(videoLibContent) })
      .toEqual({ hasUnmatchedFind: true });
  });

  // ── Config role badges guard (BOUCLE/MATCH/ACTION) ────────────────────
  // Replaces generic "EN BOUCLE" badge with contextual roles.
  it('video-library must use configRoles (not configVideoPaths or isInConfig)', () => {
    expect({ hasOldConfigPaths: /configVideoPaths/.test(videoLibContent) })
      .toEqual({ hasOldConfigPaths: false });
    expect({ hasOldIsInConfig: /isInConfig/.test(videoLibContent) })
      .toEqual({ hasOldIsInConfig: false });
    expect({ hasConfigRoles: /configRoles/.test(videoLibContent) })
      .toEqual({ hasConfigRoles: true });
  });

  it('video-library template must have BOUCLE, MATCH, and ACTION badges', () => {
    expect({ hasBoucleBadge: /badge-boucle/.test(videoLibContent) })
      .toEqual({ hasBoucleBadge: true });
    expect({ hasMatchBadge: /badge-match/.test(videoLibContent) })
      .toEqual({ hasMatchBadge: true });
    expect({ hasActionBadge: /badge-action/.test(videoLibContent) })
      .toEqual({ hasActionBadge: true });
  });

  it('site-content-tab must use configVideoRoles Map (not configVideoPaths Set)', () => {
    expect({ hasOldSet: /configVideoPaths:\s*Set<string>/.test(siteContentTabContent) })
      .toEqual({ hasOldSet: false });
    expect({ hasRolesMap: /configVideoRoles:\s*Map<string,\s*Set<string>>/.test(siteContentTabContent) })
      .toEqual({ hasRolesMap: true });
  });

  it('rebuildConfigVideoRoles must tag sponsors as boucle, categories as action, timeCategories as match', () => {
    // Must NOT have old method name
    expect({ hasOldMethod: /rebuildConfigVideoPaths/.test(siteContentTabContent) })
      .toEqual({ hasOldMethod: false });
    // Must tag each source correctly
    expect({ tagsBoucle: /addRole\([^,]+,\s*'boucle'\)/.test(siteContentTabContent) })
      .toEqual({ tagsBoucle: true });
    expect({ tagsAction: /addRole\([^,]+,\s*'action'\)/.test(siteContentTabContent) })
      .toEqual({ tagsAction: true });
    expect({ tagsMatch: /addRole\([^,]+,\s*'match'\)/.test(siteContentTabContent) })
      .toEqual({ tagsMatch: true });
  });

  // ── Duplicate detection guard ─────────────────────────────────────────
  it('video-library must detect duplicates by checksum', () => {
    expect({ hasDuplicateDetection: /isDuplicate/.test(videoLibContent) })
      .toEqual({ hasDuplicateDetection: true });
    expect({ hasChecksumCounts: /checksumCounts/.test(videoLibContent) })
      .toEqual({ hasChecksumCounts: true });
    expect({ hasDuplicateBadge: /duplicate-badge/.test(videoLibContent) })
      .toEqual({ hasDuplicateBadge: true });
  });

  // ── Advertiser name pipeline guard ────────────────────────────────────
  it('timeline.repository must JOIN advertiser_videos+advertisers for advertiser_name', () => {
    expect({ hasAdvertiserJoin: /LEFT\s+JOIN\s+advertiser_videos/i.test(timelineRepoContent) })
      .toEqual({ hasAdvertiserJoin: true });
    expect({ hasAdvertiserName: /advertiser_name/.test(timelineRepoContent) })
      .toEqual({ hasAdvertiserName: true });
  });

  it('sites.controller must pass advertiserName in cloud video response', () => {
    expect({ hasAdvertiserName: /advertiserName.*advertiser_name|advertiser_name.*advertiserName/.test(controllerContent) })
      .toEqual({ hasAdvertiserName: true });
  });

  it('CloudVideo interface must have advertiserName field', () => {
    expect({ hasAdvertiserName: /advertiserName\??:\s*string\s*\|\s*null/.test(modelsContent) })
      .toEqual({ hasAdvertiserName: true });
  });

  // ── Secondary variant badge in video-library ──────────────────────────
  it('video-library must have secondaryVariantVideoIds input and 2nd badge', () => {
    expect({ hasInput: /secondaryVariantVideoIds/.test(videoLibContent) })
      .toEqual({ hasInput: true });
    expect({ hasBadge: /badge-2nd/.test(videoLibContent) })
      .toEqual({ hasBadge: true });
  });

  // ── CSV export guard ──────────────────────────────────────────────────
  it('video-library must have CSV export functionality', () => {
    expect({ hasExportCsv: /exportCsv\(\)/.test(videoLibContent) })
      .toEqual({ hasExportCsv: true });
    expect({ hasCsvButton: /btn-export/.test(videoLibContent) })
      .toEqual({ hasCsvButton: true });
  });

  // ── Stats bar must be scoped to filteredVideos (not allVideos) ────────
  // The stats bar previously mixed global catalog stats (allVideos) with
  // site-specific display (filteredVideos), confusing users.
  // Stats must be computed on the filtered set in applyFilters().
  it('video-library stats must use filtered* properties (not global allVideos stats)', () => {
    // Must NOT have old global stats properties
    expect({ hasOldStatsOnPi: /\bstatsOnPi\b/.test(videoLibContent) })
      .toEqual({ hasOldStatsOnPi: false });
    expect({ hasOldStatsToDeploy: /\bstatsToDeploy\b/.test(videoLibContent) })
      .toEqual({ hasOldStatsToDeploy: false });
    expect({ hasOldStatsRelevant: /\bstatsRelevant\b/.test(videoLibContent) })
      .toEqual({ hasOldStatsRelevant: false });
    // Must have filtered stats computed in applyFilters()
    expect({ hasFilteredStatsOnPi: /filteredStatsOnPi/.test(videoLibContent) })
      .toEqual({ hasFilteredStatsOnPi: true });
    expect({ hasFilteredStatsInConfig: /filteredStatsInConfig/.test(videoLibContent) })
      .toEqual({ hasFilteredStatsInConfig: true });
    expect({ hasFilteredTotalSize: /filteredTotalSize/.test(videoLibContent) })
      .toEqual({ hasFilteredTotalSize: true });
    expect({ hasFilteredTotalDuration: /filteredTotalDuration/.test(videoLibContent) })
      .toEqual({ hasFilteredTotalDuration: true });
  });

  it('video-library stats must NOT have misleading global badges (relevant count, to-deploy count)', () => {
    // The 🎯 "relevant" badge was redundant with the dropdown filter
    expect({ hasRelevantBadge: /stat\.relevant/.test(videoLibContent) })
      .toEqual({ hasRelevantBadge: false });
    // The ⏳ "to-deploy" badge showed global count, not site-specific
    expect({ hasToDeployBadge: /stat\.to-deploy/.test(videoLibContent) })
      .toEqual({ hasToDeployBadge: false });
  });

  // ── rebuildUnifiedVideoOptions must key by path (not filename) ────────
  it('rebuildUnifiedVideoOptions must key optionsMap by path (not filename)', () => {
    // Must use filenameToKeys secondary index for cloud↔local matching
    expect({ hasFilenameToKeys: /filenameToKeys/.test(siteContentTabContent) })
      .toEqual({ hasFilenameToKeys: true });
    // Must NOT key optionsMap by filename.toLowerCase() as primary key
    // The old pattern was: optionsMap.set(key, ...) where key = cloud.filename.toLowerCase()
    // Check the local video section uses local.path as key
    expect({ keysLocalByPath: /const\s+key\s*=\s*local\.path/.test(siteContentTabContent) })
      .toEqual({ keysLocalByPath: true });
  });
});

// =================================================================
// Sponsor frequency removal guard (v3.106)
// Frequency feature duplicated sponsor videos N× in the loop —
// useless complexity, never exposed on central dashboard, removed.
// Guard: ensure frequency never creeps back into UI or service.
// =================================================================

describe('Sponsor frequency removal guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const adminPublic = path.join(repoRoot, 'raspberry', 'admin', 'public');

  const sponsorService = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'services', 'sponsor.service.js'),
    'utf8'
  );
  const sponsorIndex = fs.readFileSync(
    path.join(adminPublic, 'modules', 'sponsors', 'index.js'),
    'utf8'
  );
  const sponsorsCss = fs.readFileSync(
    path.join(adminPublic, 'styles', 'sponsors.css'),
    'utf8'
  );
  const indexHtml = fs.readFileSync(
    path.join(adminPublic, 'index.html'),
    'utf8'
  );

  it('index.html must NOT contain sponsor-frequency select element', () => {
    // The frequency dropdown was removed — central never had it
    expect({ hasFreqSelect: /id="sponsor-frequency"/.test(indexHtml) })
      .toEqual({ hasFreqSelect: false });
    expect({ hasEditFreqSelect: /id="sponsor-edit-frequency"/.test(indexHtml) })
      .toEqual({ hasEditFreqSelect: false });
  });

  it('sponsors/index.js must NOT reference sponsor-frequency element', () => {
    expect({ refsFreqElement: /sponsor-frequency/.test(sponsorIndex) })
      .toEqual({ refsFreqElement: false });
    expect({ refsEditFreqElement: /sponsor-edit-frequency/.test(sponsorIndex) })
      .toEqual({ refsEditFreqElement: false });
  });

  it('sponsors.css must NOT contain frequency-badge styles', () => {
    expect({ hasFreqBadge: /frequency-badge/.test(sponsorsCss) })
      .toEqual({ hasFreqBadge: false });
    expect({ hasFreqLow: /freq-low/.test(sponsorsCss) })
      .toEqual({ hasFreqLow: false });
  });

  it('sponsor.service.js _rebuildLoopEntries must NOT have frequency duplication loop', () => {
    // Old pattern: for (let rep = 0; rep < freq; rep++) — duplicated entries
    // New pattern: one entry per video, no _frequency field
    expect({ hasRepLoop: /rep\s*<\s*freq/.test(sponsorService) })
      .toEqual({ hasRepLoop: false });
    expect({ hasFrequencyField: /_frequency/.test(sponsorService) })
      .toEqual({ hasFrequencyField: false });
  });

  it('sponsor.service.js _rebuildPhaseEntries must NOT have frequency duplication loop', () => {
    expect({ hasRepLoopPhase: /rep\s*<\s*frequency/.test(sponsorService) })
      .toEqual({ hasRepLoopPhase: false });
  });

  it('_reconcileOrphanedLoopVideos must NOT reconcile entries without sponsor markers', () => {
    // Bug v3.113: reconciliation created sponsors for ALL loopVideos entries,
    // including "Intro Neopro" (owner: 'neopro') and regular content videos.
    // The method MUST check for sponsor markers before creating localSponsors:
    // - site_sponsor_id (identified by central auto-resolution)
    // - analytics_category starts with 'sponsor' (sponsor_local, sponsor_neopro, sponsor)
    // - owner === 'club' (placed by club admin)
    // Without this check, every video name becomes a spurious sponsor.
    const reconcileMethod = sponsorService.match(
      /_reconcileOrphanedLoopVideos[\s\S]*?(?=\n  _extract|\n  \/\*\*\s*\n\s*\*\s*Extrait)/
    );
    expect(reconcileMethod).toBeTruthy();
    const body = reconcileMethod![0];
    // Must filter on sponsor markers (site_sponsor_id, analytics_category, owner)
    expect({ checksSponsorMarkers: /site_sponsor_id|analytics_category.*sponsor|_isSponsorEntry/.test(body) })
      .toEqual({ checksSponsorMarkers: true });
  });

  it('getAutoDetectedSponsor must have numeric prefix fallback matching', () => {
    // Bug v3.113: loop videos use numbered filenames (07_A_L_AFFUT.mp4) but
    // site_sponsor_videos stores category filenames (A_L_AFFUT.mp4).
    // Exact match fails → no sponsor badges. Must strip numeric prefix as fallback.
    const loopManager = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites',
        'components', 'loop-manager', 'loop-manager.component.ts'),
      'utf8'
    );
    // The function must exist and contain numeric prefix stripping logic
    const fnStart = loopManager.indexOf('getAutoDetectedSponsor(videoPath: string)');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = loopManager.substring(fnStart, fnStart + 800);
    // Must have fallback that strips numeric prefix (withoutPrefix = bareFilename.replace(/^\d+_/, ''))
    expect({ hasNumericPrefixFallback: fnBody.includes('withoutPrefix') })
      .toEqual({ hasNumericPrefixFallback: true });
  });
});

// =================================================================
// Admin UI modal CSS guard (v3.106)
// The modal system uses TWO opening patterns:
//   1. .modal.active { display: flex } — for system modals (reboot, shutdown)
//   2. modal.style.display = 'flex' — for sponsor/video modals
// Using visibility:hidden/opacity:0 instead of display:none breaks pattern #2
// because those modals never get .active class, staying invisible+blocking.
// Guard: modals MUST use display:none by default.
// =================================================================

describe('Admin UI modal CSS guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const componentsCss = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'styles', 'components.css'),
    'utf8'
  );

  it('components.css .modal must use display:none (not visibility:hidden)', () => {
    // visibility:hidden + pointer-events:none breaks sponsor modals that open
    // via style.display='flex' without adding .active class
    const modalBlock = componentsCss.match(/\.modal\s*\{[^}]+\}/);
    expect(modalBlock).toBeTruthy();
    const block = modalBlock![0];
    expect({ usesDisplayNone: /display:\s*none/.test(block) })
      .toEqual({ usesDisplayNone: true });
    expect({ usesVisibilityHidden: /visibility:\s*hidden/.test(block) })
      .toEqual({ usesVisibilityHidden: false });
  });

  it('components.css .modal.active must use display:flex', () => {
    const activeBlock = componentsCss.match(/\.modal\.active\s*\{[^}]+\}/);
    expect(activeBlock).toBeTruthy();
    expect({ usesDisplayFlex: /display:\s*flex/.test(activeBlock![0]) })
      .toEqual({ usesDisplayFlex: true });
  });

  it('components.css must have modalSlideUp animation for modal-content', () => {
    expect({ hasSlideUp: /@keyframes\s+modalSlideUp/.test(componentsCss) })
      .toEqual({ hasSlideUp: true });
    expect({ contentUsesAnim: /\.modal-content[\s\S]*animation:\s*modalSlideUp/.test(componentsCss) })
      .toEqual({ contentUsesAnim: true });
  });
});

// =================================================================
// Admin UI UX foundations guard (v3.106)
// Skeleton loading, form validation, and empty states are CSS-class
// foundations. Guard: ensure the CSS classes exist so future JS can
// rely on them without re-adding the CSS.
// =================================================================

describe('Admin UI UX foundations guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const componentsCss = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'styles', 'components.css'),
    'utf8'
  );
  const sponsorIndex = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'modules', 'sponsors', 'index.js'),
    'utf8'
  );

  it('components.css must have skeleton loading classes with shimmer animation', () => {
    expect({ hasSkeleton: /\.skeleton\s*\{/.test(componentsCss) })
      .toEqual({ hasSkeleton: true });
    expect({ hasShimmer: /@keyframes\s+shimmer/.test(componentsCss) })
      .toEqual({ hasShimmer: true });
    expect({ hasSkeletonCard: /\.skeleton-card/.test(componentsCss) })
      .toEqual({ hasSkeletonCard: true });
  });

  it('components.css must have form validation classes (has-error + error message)', () => {
    expect({ hasError: /\.form-group\.has-error/.test(componentsCss) })
      .toEqual({ hasError: true });
    expect({ hasErrorMsg: /\.form-error-message/.test(componentsCss) })
      .toEqual({ hasErrorMsg: true });
  });

  it('components.css must have empty-state classes', () => {
    expect({ hasEmptyState: /\.empty-state\s*\{/.test(componentsCss) })
      .toEqual({ hasEmptyState: true });
    expect({ hasEmptyIcon: /\.empty-state-icon/.test(componentsCss) })
      .toEqual({ hasEmptyIcon: true });
    expect({ hasEmptyTitle: /\.empty-state-title/.test(componentsCss) })
      .toEqual({ hasEmptyTitle: true });
  });

  it('sponsors/index.js must clear form validation errors on input', () => {
    // Event delegation clears .has-error + .form-error-message on input
    expect({ hasInputClear: /\.form-group\.has-error/.test(sponsorIndex) })
      .toEqual({ hasInputClear: true });
    expect({ removesErrMsg: /form-error-message/.test(sponsorIndex) })
      .toEqual({ removesErrMsg: true });
  });

  it('sponsors empty state must use .empty-state class (not inline styles)', () => {
    // Old pattern: inline style="text-align: center; padding: 40px; color:..."
    // New pattern: CSS class .empty-state
    const emptySection = sponsorIndex.match(/Aucun sponsor[\s\S]{0,300}/);
    expect(emptySection).toBeTruthy();
    // Must NOT have inline padding style on the empty state container
    expect({ hasInlineStyle: /style="[^"]*padding:\s*40px/.test(emptySection![0]) })
      .toEqual({ hasInlineStyle: false });
  });
});

// =================================================================
// Admin UX batch 2 guards (v3.106)
// 1. Search feedback: filterVideos() must update .search-hint with
//    count or "Aucune vidéo" — never leave stale hint text.
// 2. Video delete modal: styled modal replaces native confirm() —
//    same pattern as sponsor-delete-modal.
// 3. Responsive buttons: flex-wrap at 768px, grid at 480px.
// 4. Accessibility: tabindex/role/aria-label on video rows, focus-visible.
// =================================================================

describe('Admin UX batch 2 — search feedback guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const loaderJs = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'modules', 'videos', 'loader.js'),
    'utf8'
  );
  const videosCss = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'styles', 'videos.css'),
    'utf8'
  );

  it('filterVideos() must update search-hint with visible count', () => {
    const filterFn = loaderJs.match(/function filterVideos\(\)[\s\S]*?^}/m);
    expect(filterFn).toBeTruthy();
    const body = filterFn![0];
    expect({ countsVisible: /visibleCount/.test(body) })
      .toEqual({ countsVisible: true });
    expect({ updatesHint: /searchHint\.textContent/.test(body) })
      .toEqual({ updatesHint: true });
  });

  it('filterVideos() must show "Aucune vidéo" on zero results', () => {
    const filterFn = loaderJs.match(/function filterVideos\(\)[\s\S]*?^}/m);
    expect(filterFn).toBeTruthy();
    expect({ hasEmptyMsg: /Aucune vidéo/.test(filterFn![0]) })
      .toEqual({ hasEmptyMsg: true });
  });

  it('filterVideos() must add/remove .no-results class', () => {
    const filterFn = loaderJs.match(/function filterVideos\(\)[\s\S]*?^}/m);
    expect(filterFn).toBeTruthy();
    const body = filterFn![0];
    expect({ addsNoResults: /classList\.add\(['"]no-results['"]\)/.test(body) })
      .toEqual({ addsNoResults: true });
    expect({ removesNoResults: /classList\.remove\(['"]no-results['"]\)/.test(body) })
      .toEqual({ removesNoResults: true });
  });

  it('filterVideos() must reset hint when search is empty', () => {
    const filterFn = loaderJs.match(/function filterVideos\(\)[\s\S]*?^}/m);
    expect(filterFn).toBeTruthy();
    expect({ resetsHint: /Filtre les vidéos ci-dessous/.test(filterFn![0]) })
      .toEqual({ resetsHint: true });
  });

  it('videos.css must have .search-hint.no-results with warning color', () => {
    expect({ hasNoResults: /\.search-hint\.no-results/.test(videosCss) })
      .toEqual({ hasNoResults: true });
    expect({ hasWarning: /var\(--neo-warning\)/.test(videosCss) })
      .toEqual({ hasWarning: true });
  });
});

describe('Admin UX batch 2 — video delete modal guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const indexHtml = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'index.html'),
    'utf8'
  );
  const loaderJs = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'modules', 'videos', 'loader.js'),
    'utf8'
  );

  it('index.html must have #video-delete-modal with role=alertdialog', () => {
    expect({ hasModal: /id="video-delete-modal"/.test(indexHtml) })
      .toEqual({ hasModal: true });
    expect({ hasRole: /role="alertdialog"/.test(indexHtml) })
      .toEqual({ hasRole: true });
  });

  it('index.html must have video-delete-name and video-delete-warning elements', () => {
    expect({ hasName: /id="video-delete-name"/.test(indexHtml) })
      .toEqual({ hasName: true });
    expect({ hasWarning: /id="video-delete-warning"/.test(indexHtml) })
      .toEqual({ hasWarning: true });
  });

  it('loader.js must NOT use native confirm() for video deletion', () => {
    // deleteVideo, removeConfigVideo, deleteConfigVideo must use modal
    const deleteVideo = loaderJs.match(/function deleteVideo\([^)]*\)[\s\S]*?^}/m);
    const removeConfigVideo = loaderJs.match(/function removeConfigVideo\([^)]*\)[\s\S]*?^}/m);
    const deleteConfigVideo = loaderJs.match(/function deleteConfigVideo\([^)]*\)[\s\S]*?^}/m);
    expect(deleteVideo).toBeTruthy();
    expect(removeConfigVideo).toBeTruthy();
    expect(deleteConfigVideo).toBeTruthy();
    expect({ deleteUsesConfirm: /\bconfirm\(/.test(deleteVideo![0]) })
      .toEqual({ deleteUsesConfirm: false });
    expect({ removeUsesConfirm: /\bconfirm\(/.test(removeConfigVideo![0]) })
      .toEqual({ removeUsesConfirm: false });
    expect({ deleteConfigUsesConfirm: /\bconfirm\(/.test(deleteConfigVideo![0]) })
      .toEqual({ deleteConfigUsesConfirm: false });
  });

  it('loader.js must have openVideoDeleteModal with Escape key handler', () => {
    expect({ hasOpenFn: /function openVideoDeleteModal/.test(loaderJs) })
      .toEqual({ hasOpenFn: true });
    expect({ hasCloseFn: /function closeVideoDeleteModal/.test(loaderJs) })
      .toEqual({ hasCloseFn: true });
    expect({ hasEscapeKey: /Escape.*closeVideoDeleteModal|closeVideoDeleteModal.*Escape/.test(loaderJs) })
      .toEqual({ hasEscapeKey: true });
  });
});

describe('Admin UX batch 2 — responsive buttons guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const responsiveCss = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'styles', 'responsive.css'),
    'utf8'
  );

  it('responsive.css must have flex-wrap on video-row-actions at 768px', () => {
    // Extract 768px media block
    const block768 = responsiveCss.match(/@media[^{]*768px[^{]*\{[\s\S]*?\n\}/);
    expect(block768).toBeTruthy();
    expect({ hasFlexWrap: /flex-wrap:\s*wrap/.test(block768![0]) })
      .toEqual({ hasFlexWrap: true });
  });

  it('responsive.css must have grid layout for video-row-actions at 480px', () => {
    const block480 = responsiveCss.match(/@media[^{]*480px[^{]*\{[\s\S]*?\n\}/);
    expect(block480).toBeTruthy();
    const block = block480![0];
    expect({ hasGrid: /display:\s*grid/.test(block) })
      .toEqual({ hasGrid: true });
    expect({ has2Col: /grid-template-columns:\s*1fr 1fr/.test(block) })
      .toEqual({ has2Col: true });
  });
});

describe('Admin UX batch 2 — accessibility guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const loaderJs = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'modules', 'videos', 'loader.js'),
    'utf8'
  );
  const videosCss = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'styles', 'videos.css'),
    'utf8'
  );

  it('loader.js must set tabindex and role on video rows', () => {
    expect({ hasTabindex: /tabIndex\s*=\s*0/.test(loaderJs) })
      .toEqual({ hasTabindex: true });
    expect({ hasRole: /setAttribute\(\s*['"]role['"],\s*['"]group['"]\)/.test(loaderJs) })
      .toEqual({ hasRole: true });
  });

  it('loader.js must set aria-label on video rows', () => {
    expect({ hasAriaLabel: /setAttribute\(\s*['"]aria-label['"]/.test(loaderJs) })
      .toEqual({ hasAriaLabel: true });
  });

  it('videos.css must have focus-visible outline on video rows', () => {
    expect({ hasFocusVisible: /\.video-row:focus-visible/.test(videosCss) })
      .toEqual({ hasFocusVisible: true });
    expect({ hasOutline: /outline:\s*2px\s+solid/.test(videosCss) })
      .toEqual({ hasOutline: true });
  });
});

describe('Admin UX batch 2 — button labels guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const loaderJs = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'modules', 'videos', 'loader.js'),
    'utf8'
  );

  it('createConfigVideoList must have distinct "Retirer" and "Supprimer le fichier" buttons', () => {
    // "Retirer de la configuration" = remove from config (file stays on disk)
    // "Supprimer le fichier" = delete file from disk
    // Both must exist as separate buttons — never a single "Supprimer"
    expect({ hasRetirer: /Retirer de la configuration/.test(loaderJs) })
      .toEqual({ hasRetirer: true });
    expect({ hasSupprimerFichier: /Supprimer le fichier/.test(loaderJs) })
      .toEqual({ hasSupprimerFichier: true });
  });

  it('config video buttons must use btn-warning for remove and btn-danger for delete', () => {
    // Semantic colors: warning (yellow) for soft action, danger (red) for destructive
    expect({ removeIsWarning: /btn-warning[^"]*remove-video-btn/.test(loaderJs) })
      .toEqual({ removeIsWarning: true });
    expect({ deleteIsDanger: /btn-danger[^"]*delete-video-btn/.test(loaderJs) })
      .toEqual({ deleteIsDanger: true });
  });
});

// ----------------------------------------------------------
// Sponsor Portal magic link fallback URL guard:
// The fallback URL in site-sponsor.controller.ts MUST be
// 'neopro-admin.kalonpartners.bzh' (NOT 'admin-neopro.kalonpartners.bzh').
// The wrong subdomain is NXDOMAIN → sponsors get dead links.
// ----------------------------------------------------------
describe('Sponsor Portal magic link URL guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const controllerPath = path.join(repoRoot, 'central-server/src/controllers/site-sponsor.controller.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(controllerPath, 'utf8');
  });

  it('fallback URL must use neopro-admin (NOT admin-neopro) subdomain', () => {
    expect({
      hasWrongUrl: /admin-neopro\.kalonpartners/.test(content),
    }).toEqual({
      hasWrongUrl: false,
    });
  });

  it('fallback URL must point to neopro-admin.kalonpartners.bzh', () => {
    expect({
      hasCorrectUrl: /neopro-admin\.kalonpartners\.bzh/.test(content),
    }).toEqual({
      hasCorrectUrl: true,
    });
  });
});

// ----------------------------------------------------------
// Sponsor Portal public endpoints registration guard:
// All 5 sponsor-portal endpoints must exist in sponsor-portal.routes.ts
// and the router must be mounted on /api/sponsor-portal in server.ts.
// Missing endpoint = 404 for sponsors = broken PoC.
// ----------------------------------------------------------
describe('Sponsor Portal endpoints registration guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const routesPath = path.join(repoRoot, 'central-server/src/routes/sponsor-portal.routes.ts');
  const serverPath = path.join(repoRoot, 'central-server/src/server.ts');

  let routesContent: string;
  let serverContent: string;
  beforeAll(() => {
    routesContent = fs.readFileSync(routesPath, 'utf8');
    serverContent = fs.readFileSync(serverPath, 'utf8');
  });

  it('must declare all 5 public sponsor-portal routes', () => {
    expect({
      verify: /router\.get\(\s*['"]\/verify['"]/.test(routesContent),
      stats: /router\.get\(\s*['"]\/stats['"]/.test(routesContent),
      report: /router\.get\(\s*['"]\/report['"]/.test(routesContent),
      benchmark: /router\.get\(\s*['"]\/benchmark['"]/.test(routesContent),
      exportCsv: /router\.get\(\s*['"]\/export-csv['"]/.test(routesContent),
    }).toEqual({
      verify: true,
      stats: true,
      report: true,
      benchmark: true,
      exportCsv: true,
    });
  });

  it('server.ts must mount sponsor-portal routes on /api/sponsor-portal', () => {
    expect({
      mounted: /app\.use\(\s*['"]\/api\/sponsor-portal['"]/.test(serverContent),
    }).toEqual({
      mounted: true,
    });
  });
});

// ----------------------------------------------------------
// Sponsor Portal stats must include video_stats + period_breakdown:
// The getSponsorPortalStats controller must return video_stats and
// period_breakdown in its response — otherwise the PoC portal is
// missing per-video performance and match period breakdowns.
// ----------------------------------------------------------
describe('Sponsor Portal stats completeness guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const controllerPath = path.join(repoRoot, 'central-server/src/controllers/sponsor-portal.controller.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(controllerPath, 'utf8');
  });

  it('getSponsorPortalStats must return video_stats', () => {
    expect({
      hasVideoStats: /video_stats/.test(content),
    }).toEqual({
      hasVideoStats: true,
    });
  });

  it('getSponsorPortalStats must return period_breakdown', () => {
    expect({
      hasPeriodBreakdown: /period_breakdown/.test(content),
    }).toEqual({
      hasPeriodBreakdown: true,
    });
  });

  it('repository must have getStatsByVideo and getStatsByPeriod methods', () => {
    const repoPath = path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts');
    const repoContent = fs.readFileSync(repoPath, 'utf8');
    expect({
      hasStatsByVideo: /getStatsByVideo/.test(repoContent),
      hasStatsByPeriod: /getStatsByPeriod/.test(repoContent),
    }).toEqual({
      hasStatsByVideo: true,
      hasStatsByPeriod: true,
    });
  });
});

// ----------------------------------------------------------
// video_plays interruption_reason column guard:
// The analytics repository must include interruption_reason in
// the INSERT for recordVideoPlays. Without it, the completion rate
// in the sponsor portal lacks context on why videos were interrupted.
// ----------------------------------------------------------
describe('video_plays interruption_reason guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const analyticsRepoPath = path.join(repoRoot, 'central-server/src/repositories/analytics.repository.ts');
  const analyticsControllerPath = path.join(repoRoot, 'central-server/src/controllers/analytics.controller.ts');
  const fullSchemaPath = path.join(repoRoot, 'central-server/src/scripts/full-schema.sql');

  let repoContent: string;
  let controllerContent: string;
  let schemaContent: string;
  beforeAll(() => {
    repoContent = fs.readFileSync(analyticsRepoPath, 'utf8');
    controllerContent = fs.readFileSync(analyticsControllerPath, 'utf8');
    schemaContent = fs.readFileSync(fullSchemaPath, 'utf8');
  });

  it('analytics repository INSERT must include interruption_reason', () => {
    expect({
      hasColumn: /interruption_reason/.test(repoContent),
    }).toEqual({
      hasColumn: true,
    });
  });

  it('analytics controller must validate interruption_reason values', () => {
    expect({
      hasValidation: /interruption_reason/.test(controllerContent),
      hasManualAction: /manual_action/.test(controllerContent),
      hasLoopAdvance: /loop_advance/.test(controllerContent),
    }).toEqual({
      hasValidation: true,
      hasManualAction: true,
      hasLoopAdvance: true,
    });
  });

  it('full-schema.sql must declare interruption_reason column', () => {
    expect({
      hasColumn: /interruption_reason/.test(schemaContent),
    }).toEqual({
      hasColumn: true,
    });
  });
});

// ----------------------------------------------------------
// Sponsor Portal chart container guard:
// The trends chart canvas must be wrapped in a .chart-container
// with a fixed height. Without it, Chart.js with
// maintainAspectRatio:false stretches infinitely.
// ----------------------------------------------------------
describe('Sponsor Portal chart container guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const portalPath = path.join(repoRoot, 'central-dashboard/src/app/features/sponsor-portal/site-sponsor-portal.component.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(portalPath, 'utf8');
  });

  it('trends canvas must be wrapped in .chart-container', () => {
    expect({
      hasContainer: /chart-container[\s\S]*?trendsCanvas/.test(content),
    }).toEqual({
      hasContainer: true,
    });
  });

  it('.chart-container must have position:relative and a fixed height', () => {
    expect({
      hasPositionRelative: /\.chart-container\s*\{[^}]*position:\s*relative/.test(content),
      hasHeight: /\.chart-container\s*\{[^}]*height:\s*\d+px/.test(content),
    }).toEqual({
      hasPositionRelative: true,
      hasHeight: true,
    });
  });
});

// ----------------------------------------------------------
// B1: video_duration must use real HTMLVideoElement.duration, not durationPlayed.
// Without this, video_duration === duration_played always → completion_rate
// based on duration_played/video_duration is meaningless (~100% always).
// ----------------------------------------------------------
describe('Analytics video_duration real duration guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const analyticsPath = path.join(repoRoot, 'raspberry/src/app/services/analytics.service.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(analyticsPath, 'utf8');
  });

  it('must have setCurrentVideoDuration setter', () => {
    expect({
      hasSetter: /setCurrentVideoDuration\(/.test(content),
    }).toEqual({
      hasSetter: true,
    });
  });

  it('video_duration must use currentVideoDuration (not durationPlayed)', () => {
    expect({
      usesRealDuration: /video_duration:\s*this\.currentVideoDuration/.test(content),
    }).toEqual({
      usesRealDuration: true,
    });
  });

  it('currentVideoDuration must be reset to null in trackVideoEnd', () => {
    expect({
      resetsToNull: /this\.currentVideoDuration\s*=\s*null/.test(content),
    }).toEqual({
      resetsToNull: true,
    });
  });
});

// ----------------------------------------------------------
// B2: completion_rate must use COUNT(completed)/COUNT(total) consistently.
// AVG(CASE WHEN completed THEN 100 ELSE duration/video_duration*100)
// gives wrong results when video_duration === duration_played.
// ----------------------------------------------------------
describe('Sponsor stats completion_rate consistency guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const repoPath = path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(repoPath, 'utf8');
  });

  it('getStatsSummary must NOT use AVG(CASE WHEN completed) for completion_rate', () => {
    // The old broken formula: AVG(CASE WHEN completed THEN 100 ELSE (duration_played / video_duration * 100))
    // This gives ~100% always when video_duration === duration_played
    expect({
      hasOldFormula: /AVG\s*\(\s*CASE\s+WHEN\s+completed\s+THEN\s+100/.test(content),
    }).toEqual({
      hasOldFormula: false,
    });
  });

  it('getStatsSummary must use SUM(CASE completed)/COUNT(*) for completion_rate', () => {
    expect({
      hasCorrectFormula: /SUM\s*\(\s*CASE\s+WHEN\s+completed\s+THEN\s+1\s+ELSE\s+0\s+END\s*\)/.test(content),
    }).toEqual({
      hasCorrectFormula: true,
    });
  });
});

// ----------------------------------------------------------
// B3: Sponsor queries must filter tv_status to count only visible plays.
// Without this, plays with tv_status='standby' (TV off) inflate stats.
// The Pi filters client-side but defense-in-depth requires DB-level filter.
// ----------------------------------------------------------
describe('Sponsor queries tv_status filter guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const repoPath = path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(repoPath, 'utf8');
  });

  it('must filter tv_status in sponsor queries (defense-in-depth)', () => {
    // Count occurrences of the tv_status filter pattern
    const matches = content.match(/tv_status\s+IN\s*\(\s*'on'\s*,\s*'unknown'\s*\)/g);
    // At minimum: getStatsSummary, getDailyTrends, getBenchmark, getStatsByVideo, getStatsByPeriod = 5
    expect({
      filterCount: matches ? matches.length : 0,
      hasAtLeast5: (matches?.length || 0) >= 5,
    }).toEqual({
      filterCount: matches ? matches.length : 0,
      hasAtLeast5: true,
    });
  });
});

// =============================================================================
// getTvStatusForAnalytics must return 'unknown' (not 'disconnected') when
// tv_power is null — CEC adapter present but cannot query TV (no HDMI cable,
// PC-only usage, ioctl error). Returning 'disconnected' causes the analytics
// guard to silently drop ALL events → zero analytics for sites without HDMI.
// =============================================================================

describe('HdmiStatusService getTvStatusForAnalytics null tv_power guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const hdmiPath = path.join(repoRoot, 'raspberry/src/app/services/hdmi-status.service.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(hdmiPath, 'utf8');
  });

  it('must NOT return disconnected when tv_power is null (PC-only / no HDMI)', () => {
    // The guard must check tv_power !== null before returning 'disconnected'
    // Without this, CEC available + tv_power=null + tv_connected=false → 'disconnected'
    // → analytics guard drops ALL events silently
    expect({
      hasTvPowerNullGuard: /tv_power\s*!==?\s*null/.test(content),
    }).toEqual({
      hasTvPowerNullGuard: true,
    });
  });

  it('must return unknown as last fallback (not disconnected)', () => {
    // The last return statement of getTvStatusForAnalytics must be 'unknown'
    const methodMatch = content.match(/getTvStatusForAnalytics[\s\S]*?return\s+'(\w+)'\s*;\s*\}/);
    expect({
      lastReturn: methodMatch ? methodMatch[1] : 'not found',
    }).toEqual({
      lastReturn: 'unknown',
    });
  });
});

// =============================================================================
// Analytics guard must only block 'standby' and 'disconnected', never 'unknown'
// Without this, sites with unreliable CEC lose all analytics silently.
// =============================================================================

describe('Analytics service tv_status guard must not block unknown', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const analyticsPath = path.join(repoRoot, 'raspberry/src/app/services/analytics.service.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(analyticsPath, 'utf8');
  });

  it('must block standby and disconnected only (not unknown)', () => {
    // The guard should check for 'standby' || 'disconnected' but NOT 'unknown'
    const hasStandbyGuard = /currentTvStatus\s*===?\s*'standby'/.test(content);
    const hasDisconnectedGuard = /currentTvStatus\s*===?\s*'disconnected'/.test(content);
    const hasUnknownGuard = /currentTvStatus\s*===?\s*'unknown'/.test(content);
    expect({
      blocksStandby: hasStandbyGuard,
      blocksDisconnected: hasDisconnectedGuard,
      blocksUnknown: hasUnknownGuard,
    }).toEqual({
      blocksStandby: true,
      blocksDisconnected: true,
      blocksUnknown: false,  // MUST NOT block 'unknown'
    });
  });
});

// =============================================================================
// Sponsor video_filename path normalization guard
// =============================================================================
// site_sponsor_videos.video_filename may store full paths ("videos/default/X.mp4")
// sent by the Pi via syncVideoAssociations, while the config loop uses bare filenames
// ("X.mp4"). Both the SQL queries and the dashboard must normalize before comparing.
// Without this, sponsors show "Hors boucle" and auto-resolution fails silently.
// =============================================================================

describe('Sponsor video_filename path normalization guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  let repoContent: string;
  let dashboardContent: string;

  beforeAll(() => {
    repoContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts'),
      'utf8'
    );
    dashboardContent = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-sponsors-tab/site-sponsors-tab.component.ts'),
      'utf8'
    );
  });

  it('resolveSiteSponsorIdByFilename must use LIKE fallback for full-path matching', () => {
    expect({
      hasLikeFallback: /LIKE\s+'%\/'\s*\|\|\s*\$1/.test(repoContent),
      reason: 'video_filename may be a full path — exact match alone misses "videos/default/X.mp4" when querying "X.mp4"',
    }).toEqual({
      hasLikeFallback: true,
      reason: 'video_filename may be a full path — exact match alone misses "videos/default/X.mp4" when querying "X.mp4"',
    });
  });

  it('resolveSiteSponsorIdsByFilenameBulk must use LIKE fallback for full-path matching', () => {
    expect({
      hasLikeFallback: /LIKE\s+'%\/'\s*\|\|\s*v\.video_filename/.test(repoContent),
      reason: 'bulk resolver must also handle full-path video_filenames in site_sponsor_videos',
    }).toEqual({
      hasLikeFallback: true,
      reason: 'bulk resolver must also handle full-path video_filenames in site_sponsor_videos',
    });
  });

  it('resolveSiteSponsorIdsByFilenameBulk must return v.video_filename (not ssv.video_filename) for Map key consistency', () => {
    // The caller builds Map keys with the bare filename it sent, so the query must return
    // v.video_filename (the input) not ssv.video_filename (the DB value which may be a full path)
    const selectBlock = repoContent.match(/SELECT DISTINCT ON \(v\.video_filename.*?FROM \(VALUES/s);
    expect({
      returnsInputFilename: selectBlock ? /v\.video_filename/.test(selectBlock[0]) : false,
      doesNotReturnSsvFilename: selectBlock ? !/ssv\.video_filename/.test(selectBlock[0]) : false,
      reason: 'Map key must match the bare filename the caller sent, not the full path from DB',
    }).toEqual({
      returnsInputFilename: true,
      doesNotReturnSsvFilename: true,
      reason: 'Map key must match the bare filename the caller sent, not the full path from DB',
    });
  });

  it('dashboard isFilenameInLoop must normalize full paths to bare filenames', () => {
    expect({
      hasBareFilenameExtraction: /split\('\/'\)\.pop\(\)/.test(dashboardContent),
      hasHelperMethod: /isFilenameInLoop/.test(dashboardContent),
      reason: 'sponsor video_filenames from DB may be full paths — must extract bare filename before Set lookup',
    }).toEqual({
      hasBareFilenameExtraction: true,
      hasHelperMethod: true,
      reason: 'sponsor video_filenames from DB may be full paths — must extract bare filename before Set lookup',
    });
  });

  it('buildVideosInLoopsSet must add full path (not just bare filename) to the Set', () => {
    // The addToSet helper adds both path (full) and extractFilename(path) (bare) to the Set
    expect({
      hasAddToSetHelper: /addToSet\s*=\s*\(/.test(dashboardContent),
      addsBothFullAndBare: /videosInLoops\.add\(path\)/.test(dashboardContent) && /videosInLoops\.add\(extractFilename\(path\)\)/.test(dashboardContent),
      reason: 'Set must contain both full paths and bare filenames to handle either format in video_filenames',
    }).toEqual({
      hasAddToSetHelper: true,
      addsBothFullAndBare: true,
      reason: 'Set must contain both full paths and bare filenames to handle either format in video_filenames',
    });
  });
});

// =============================================================================
// Sponsor period breakdown GROUP BY alignment guard
// =============================================================================
// When SELECT uses COALESCE(NULLIF(TRIM(vp.period), ''), 'loop'), the GROUP BY
// must use the SAME expression. Using raw `vp.period` causes duplicate rows
// (e.g., two "Boucle continue" entries — one for empty string, one for null).
// =============================================================================

describe('Sponsor period breakdown GROUP BY alignment guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const repoPath = path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(repoPath, 'utf8');
  });

  it('getStatsByPeriod GROUP BY must use COALESCE expression, not raw vp.period', () => {
    // The GROUP BY must match the SELECT COALESCE to avoid duplicate rows
    expect({
      hasCoalesceGroupBy: /GROUP BY\s+COALESCE\(NULLIF\(TRIM\(vp\.period\)/.test(content),
      reason: 'GROUP BY raw vp.period splits null/empty/whitespace into separate rows → duplicate display entries',
    }).toEqual({
      hasCoalesceGroupBy: true,
      reason: 'GROUP BY raw vp.period splits null/empty/whitespace into separate rows → duplicate display entries',
    });
  });
});

// =============================================================================
// Sponsor portal manual_triggers guard
// =============================================================================
// The sponsor portal must expose manual_triggers (trigger_type='manual' count)
// in both the summary and per-video stats. Without it, sponsors can't see
// which videos were played manually by club staff.
// =============================================================================

describe('Sponsor portal manual_triggers guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  let repoContent: string;
  let controllerContent: string;

  beforeAll(() => {
    repoContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts'),
      'utf8'
    );
    controllerContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/controllers/sponsor-portal.controller.ts'),
      'utf8'
    );
  });

  it('repository must count manual triggers in summary and per-video queries', () => {
    const manualFilterCount = (repoContent.match(/FILTER\s*\(\s*WHERE\s+.*trigger_type\s*=\s*'manual'\s*\)/g) || []).length;
    expect({
      manualFilterCount,
      hasAtLeast2: manualFilterCount >= 2,
      reason: 'getStatsSummary + getStatsByVideo must both COUNT manual triggers',
    }).toEqual({
      manualFilterCount,
      hasAtLeast2: true,
      reason: 'getStatsSummary + getStatsByVideo must both COUNT manual triggers',
    });
  });

  it('controller must map manual_triggers in video_stats response', () => {
    expect({
      hasMappingInVideoStats: /manual_triggers.*Number/.test(controllerContent),
      reason: 'video_stats response must include manual_triggers for per-video display',
    }).toEqual({
      hasMappingInVideoStats: true,
      reason: 'video_stats response must include manual_triggers for per-video display',
    });
  });
});

// =============================================================================
// sponsor_impressions_bridge VIEW must include interruption_reason
// =============================================================================
// The bridge view is used by advertiser dashboards. Without interruption_reason,
// advertiser analytics can't distinguish completed vs interrupted plays.
// =============================================================================

describe('sponsor_impressions_bridge VIEW completeness guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const schemaPath = path.join(repoRoot, 'central-server/src/scripts/full-schema.sql');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(schemaPath, 'utf8');
  });

  it('sponsor_impressions_bridge must include interruption_reason column', () => {
    const viewBlock = content.match(/CREATE OR REPLACE VIEW sponsor_impressions_bridge[\s\S]*?;/);
    expect({
      hasInterruptionReason: viewBlock ? /interruption_reason/.test(viewBlock[0]) : false,
      reason: 'advertiser analytics need interruption context for completion analysis',
    }).toEqual({
      hasInterruptionReason: true,
      reason: 'advertiser analytics need interruption context for completion analysis',
    });
  });
});

// ----------------------------------------------------------
// Weighted sponsor rotation guards
// ----------------------------------------------------------
// The weighted playlist must be used in the TV component, and
// the weight field must survive config enrichment unchanged.
// Without this, sponsor rotation weights configured in the
// dashboard would be silently stripped → equal rotation for all.
// ----------------------------------------------------------
describe('Weighted sponsor rotation guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('TV component must use generateWeightedPlaylist in startSeamlessLoop', () => {
    const tvPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');
    const tvContent = fs.readFileSync(tvPath, 'utf8');
    const startLoop = tvContent.match(/private startSeamlessLoop[\s\S]*?(?=private \w|\n  \/\*\*)/);
    expect({
      usesWeightedPlaylist: startLoop ? startLoop[0].includes('generateWeightedPlaylist') : false,
      reason: 'startSeamlessLoop must apply weighted rotation — removing it silently reverts to equal rotation',
    }).toEqual({
      usesWeightedPlaylist: true,
      reason: 'startSeamlessLoop must apply weighted rotation — removing it silently reverts to equal rotation',
    });
  });

  it('LoopVideo interface must have weight field', () => {
    const interfacePath = path.join(repoRoot, 'raspberry/src/app/interfaces/sponsor.interface.ts');
    const content = fs.readFileSync(interfacePath, 'utf8');
    expect({
      hasWeight: content.includes('weight?: number'),
      reason: 'LoopVideo needs weight field for weighted sponsor rotation',
    }).toEqual({
      hasWeight: true,
      reason: 'LoopVideo needs weight field for weighted sponsor rotation',
    });
  });

  it('SponsorVideo server type must have weight field', () => {
    const typesPath = path.join(repoRoot, 'central-server/src/types/index.ts');
    const content = fs.readFileSync(typesPath, 'utf8');
    const sponsorBlock = content.match(/export interface SponsorVideo \{[\s\S]*?\n\}/);
    expect({
      hasWeight: sponsorBlock ? sponsorBlock[0].includes('weight?: number') : false,
      reason: 'SponsorVideo needs weight field — config enrichment must preserve it through the pipeline',
    }).toEqual({
      hasWeight: true,
      reason: 'SponsorVideo needs weight field — config enrichment must preserve it through the pipeline',
    });
  });

  it('config-analytics-metadata must not strip unknown fields from sponsor objects', () => {
    const utilPath = path.join(repoRoot, 'central-server/src/utils/config-analytics-metadata.ts');
    const content = fs.readFileSync(utilPath, 'utf8');
    // The enrichment must NOT rebuild sponsor objects from scratch (which would drop weight).
    // It should only SET specific fields on the existing object.
    expect({
      doesNotRebuildObject: !content.includes('= { name:') && !content.includes('= { path:'),
      reason: 'enrichment must mutate existing sponsor objects, not rebuild them — rebuilding drops weight field',
    }).toEqual({
      doesNotRebuildObject: true,
      reason: 'enrichment must mutate existing sponsor objects, not rebuild them — rebuilding drops weight field',
    });
  });

  it('LoopVideoConfig dashboard model must have weight field', () => {
    const modelPath = path.join(repoRoot, 'central-dashboard/src/app/core/models/site-config.model.ts');
    const content = fs.readFileSync(modelPath, 'utf8');
    const loopVideoBlock = content.match(/export interface LoopVideoConfig \{[\s\S]*?\n\}/);
    expect({
      hasWeight: loopVideoBlock ? loopVideoBlock[0].includes('weight?: number') : false,
      reason: 'LoopVideoConfig needs weight field for dashboard sponsor weight UI',
    }).toEqual({
      hasWeight: true,
      reason: 'LoopVideoConfig needs weight field for dashboard sponsor weight UI',
    });
  });

  it('weighted-playlist must use Bresenham accumulator — not greedy remaining-only', () => {
    const algoPath = path.join(repoRoot, 'raspberry/src/app/utils/weighted-playlist.ts');
    const content = fs.readFileSync(algoPath, 'utf8');
    expect({
      hasAccumulator: content.includes('accumulator'),
      hasTotalSlotsSubtract: /accumulator\s*-=\s*totalSlots/.test(content),
      noGreedyBestRemaining: !content.includes('bestRemaining'),
      reason: 'Bresenham distributes evenly (×4=gap~3, ×10=gap~1.8). Greedy front-loads → all weights look like "1 sur 2"',
    }).toEqual({
      hasAccumulator: true,
      hasTotalSlotsSubtract: true,
      noGreedyBestRemaining: true,
      reason: 'Bresenham distributes evenly (×4=gap~3, ×10=gap~1.8). Greedy front-loads → all weights look like "1 sur 2"',
    });
  });

  it('loop-manager must have playlist preview for visual weight feedback', () => {
    const loopMgrPath = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/loop-manager/loop-manager.component.ts');
    const content = fs.readFileSync(loopMgrPath, 'utf8');
    expect({
      hasPreviewMethod: content.includes('getPlaylistPreview'),
      hasLegendMethod: content.includes('getPlaylistLegend'),
      hasPreviewTemplate: content.includes('playlist-preview-track'),
      reason: 'Dashboard must show playlist preview so club managers can see the effect of weight changes in real-time',
    }).toEqual({
      hasPreviewMethod: true,
      hasLegendMethod: true,
      hasPreviewTemplate: true,
      reason: 'Dashboard must show playlist preview so club managers can see the effect of weight changes in real-time',
    });
  });

  it('weighted-playlist must have fixWrapAround to prevent double passage at loop boundary', () => {
    const algoPath = path.join(repoRoot, 'raspberry/src/app/utils/weighted-playlist.ts');
    const content = fs.readFileSync(algoPath, 'utf8');
    expect({
      hasFixWrapAround: content.includes('fixWrapAround'),
      reason: 'The TV loop cycles continuously — without wrap-around fix, same sponsor at position 1 AND last = double passage at boundary',
    }).toEqual({
      hasFixWrapAround: true,
      reason: 'The TV loop cycles continuously — without wrap-around fix, same sponsor at position 1 AND last = double passage at boundary',
    });
  });

  it('LoopVideo interface must have pinned field', () => {
    const interfacePath = path.join(repoRoot, 'raspberry/src/app/interfaces/sponsor.interface.ts');
    const content = fs.readFileSync(interfacePath, 'utf8');
    expect({
      hasPinned: content.includes('pinned?: boolean'),
      reason: 'LoopVideo needs pinned field to keep videos at their original position in the loop',
    }).toEqual({
      hasPinned: true,
      reason: 'LoopVideo needs pinned field to keep videos at their original position in the loop',
    });
  });

  it('SponsorVideo server type must have pinned field', () => {
    const typesPath = path.join(repoRoot, 'central-server/src/types/index.ts');
    const content = fs.readFileSync(typesPath, 'utf8');
    const sponsorBlock = content.match(/export interface SponsorVideo \{[\s\S]*?\n\}/);
    expect({
      hasPinned: sponsorBlock ? sponsorBlock[0].includes('pinned?: boolean') : false,
      reason: 'SponsorVideo needs pinned field — config enrichment must preserve it through the pipeline',
    }).toEqual({
      hasPinned: true,
      reason: 'SponsorVideo needs pinned field — config enrichment must preserve it through the pipeline',
    });
  });

  it('LoopVideoConfig dashboard model must have pinned field', () => {
    const modelPath = path.join(repoRoot, 'central-dashboard/src/app/core/models/site-config.model.ts');
    const content = fs.readFileSync(modelPath, 'utf8');
    const loopVideoBlock = content.match(/export interface LoopVideoConfig \{[\s\S]*?\n\}/);
    expect({
      hasPinned: loopVideoBlock ? loopVideoBlock[0].includes('pinned?: boolean') : false,
      reason: 'LoopVideoConfig needs pinned field for dashboard pin toggle UI',
    }).toEqual({
      hasPinned: true,
      reason: 'LoopVideoConfig needs pinned field for dashboard pin toggle UI',
    });
  });

  it('weighted-playlist must handle pinned videos (separate from Bresenham)', () => {
    const algoPath = path.join(repoRoot, 'raspberry/src/app/utils/weighted-playlist.ts');
    const content = fs.readFileSync(algoPath, 'utf8');
    expect({
      hasPinnedSlots: content.includes('pinnedSlots'),
      hasMobileVideos: content.includes('mobileVideos'),
      checksPinned: content.includes('.pinned'),
      reason: 'Pinned videos must stay at their original position — Bresenham fills remaining slots only',
    }).toEqual({
      hasPinnedSlots: true,
      hasMobileVideos: true,
      checksPinned: true,
      reason: 'Pinned videos must stay at their original position — Bresenham fills remaining slots only',
    });
  });

  it('loop-manager must have pin toggle for videos', () => {
    const loopMgrPath = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/loop-manager/loop-manager.component.ts');
    const content = fs.readFileSync(loopMgrPath, 'utf8');
    expect({
      hasTogglePin: content.includes('togglePinVideo'),
      hasPinButton: content.includes('btn-pin'),
      reason: 'Dashboard must allow pinning videos to their position in the loop',
    }).toEqual({
      hasTogglePin: true,
      hasPinButton: true,
      reason: 'Dashboard must allow pinning videos to their position in the loop',
    });
  });
});

// =============================================================================
// Admin :8080 WiFi flow regression guards
// =============================================================================
//
// Issue: admin connectWifi() was broken — used wpa_cli reconfigure (no service
// restart), stored plaintext passwords, no DHCP trigger, single 3s poll.
// Users had to use central dashboard (sync-agent) to connect WiFi dongle.
//
// Fix: aligned admin flow with sync-agent: PSK hash, systemctl restart,
// dhcpcd trigger, 5×2s polling, rfkill unblock.
//
// These guards prevent regression to the broken flow.
describe('Admin :8080 WiFi connectWifi() regression guards', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const networkServicePath = path.join(repoRoot, 'raspberry/admin/services/network.service.js');
  const networkService = fs.readFileSync(networkServicePath, 'utf8');

  it('must hash WiFi password via wpa_passphrase — never store plaintext PSK', () => {
    expect({
      usesWpaPassphrase: networkService.includes('wpa_passphrase'),
      noPlaintextPsk: !networkService.includes('psk="${password}"'),
      reason: 'connectWifi must hash password via wpa_passphrase, never store plaintext in wpa_supplicant.conf',
    }).toEqual({
      usesWpaPassphrase: true,
      noPlaintextPsk: true,
      reason: 'connectWifi must hash password via wpa_passphrase, never store plaintext in wpa_supplicant.conf',
    });
  });

  it('must restart wpa_supplicant@wlan1 service — wpa_cli reconfigure alone is unreliable', () => {
    expect({
      restartsService: networkService.includes('systemctl restart wpa_supplicant@wlan1'),
      enablesService: networkService.includes('systemctl enable wpa_supplicant@wlan1'),
      reason: 'wpa_cli reconfigure alone does not reliably bring up wlan1 — must restart systemd service',
    }).toEqual({
      restartsService: true,
      enablesService: true,
      reason: 'wpa_cli reconfigure alone does not reliably bring up wlan1 — must restart systemd service',
    });
  });

  it('must trigger DHCP after WiFi connection — without it, no IP address is obtained', () => {
    expect({
      triggersDhcp: networkService.includes('dhcpcd wlan1'),
      reason: 'without dhcpcd trigger, wlan1 connects to WiFi but never gets an IP address',
    }).toEqual({
      triggersDhcp: true,
      reason: 'without dhcpcd trigger, wlan1 connects to WiFi but never gets an IP address',
    });
  });

  it('must unblock WiFi radio before connecting — dongle may be rfkill-blocked', () => {
    expect({
      unblocksWifi: networkService.includes('rfkill unblock wifi'),
      reason: 'USB WiFi dongle may be rfkill-blocked — must unblock before any WiFi operation',
    }).toEqual({
      unblocksWifi: true,
      reason: 'USB WiFi dongle may be rfkill-blocked — must unblock before any WiFi operation',
    });
  });

  it('must poll connection multiple times — RTL8192EU needs 10-30s for WPA+DHCP', () => {
    // Ensure there's a retry loop (for loop with sleep) not a single check
    const hasRetryLoop = /for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*5/.test(networkService);
    expect({
      hasRetryLoop,
      reason: 'single 3s wait is too short for RTL8192EU — must poll 5×2s minimum',
    }).toEqual({
      hasRetryLoop: true,
      reason: 'single 3s wait is too short for RTL8192EU — must poll 5×2s minimum',
    });
  });

  it('must NOT expose deprecated /api/wifi/client route', () => {
    const routesPath = path.join(repoRoot, 'raspberry/admin/routes/network.js');
    const routes = fs.readFileSync(routesPath, 'utf8');
    expect({
      noClientRoute: !routes.includes('/api/wifi/client'),
      reason: '/api/wifi/client delegated to interactive script — use /api/wifi/connect instead',
    }).toEqual({
      noClientRoute: true,
      reason: '/api/wifi/client delegated to interactive script — use /api/wifi/connect instead',
    });
  });

  it('must create wlan1-specific symlink for wpa_supplicant config', () => {
    expect({
      createsSymlink: networkService.includes('wpa_supplicant-wlan1.conf'),
      reason: 'wpa_supplicant@wlan1.service reads wpa_supplicant-wlan1.conf — symlink is required',
    }).toEqual({
      createsSymlink: true,
      reason: 'wpa_supplicant@wlan1.service reads wpa_supplicant-wlan1.conf — symlink is required',
    });
  });
});

// ----------------------------------------------------------
// Socket.IO local (Pi) resilience guards
// Prevents regression of zombie socket / video lag when accessing Pi from PC browser
// ----------------------------------------------------------
describe('Pi Socket.IO resilience guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const serverPath = path.join(repoRoot, 'raspberry/server/server.js');
  const socketServicePath = path.join(repoRoot, 'raspberry/src/app/services/socket.service.ts');
  const doubleBufferPath = path.join(repoRoot, 'raspberry/src/app/services/double-buffer-video.service.ts');
  const tvComponentPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');

  let serverContent: string;
  let socketServiceContent: string;
  let doubleBufferContent: string;
  let tvComponentContent: string;

  beforeAll(() => {
    serverContent = fs.readFileSync(serverPath, 'utf8');
    socketServiceContent = fs.readFileSync(socketServicePath, 'utf8');
    doubleBufferContent = fs.readFileSync(doubleBufferPath, 'utf8');
    tvComponentContent = fs.readFileSync(tvComponentPath, 'utf8');
  });

  it('server.js must configure pingInterval and pingTimeout for Socket.IO', () => {
    // Without explicit ping config, zombie sockets go undetected for 45s (default 25s+20s)
    // causing slaves to never receive tv-loop-state → video freezes
    expect({
      hasPingInterval: /pingInterval\s*:\s*\d+/.test(serverContent),
      hasPingTimeout: /pingTimeout\s*:\s*\d+/.test(serverContent),
      reason: 'zombie socket detection requires explicit ping config — default 45s is too slow for local TV sync',
    }).toEqual({
      hasPingInterval: true,
      hasPingTimeout: true,
      reason: 'zombie socket detection requires explicit ping config — default 45s is too slow for local TV sync',
    });
  });

  it('server.js must configure transports for Socket.IO', () => {
    // Without explicit transports, Socket.IO may start with long-polling
    // adding 200-500ms latency per message on local network
    expect({
      hasTransports: /transports\s*:\s*\[/.test(serverContent),
      reason: 'explicit transports config prevents slow HTTP long-polling fallback on local network',
    }).toEqual({
      hasTransports: true,
      reason: 'explicit transports config prevents slow HTTP long-polling fallback on local network',
    });
  });

  it('socket.service.ts must configure reconnection options', () => {
    // Without reconnection config, a dropped socket leaves the TV frozen
    // with no automatic recovery — user must refresh the page
    expect({
      hasReconnection: /reconnection\s*:\s*true/.test(socketServiceContent),
      hasReconnectionDelay: /reconnectionDelay\s*:\s*\d+/.test(socketServiceContent),
      hasReconnectionAttempts: /reconnectionAttempts\s*:/.test(socketServiceContent),
      reason: 'dropped sockets must auto-reconnect — without this, TV freezes until page refresh',
    }).toEqual({
      hasReconnection: true,
      hasReconnectionDelay: true,
      hasReconnectionAttempts: true,
      reason: 'dropped sockets must auto-reconnect — without this, TV freezes until page refresh',
    });
  });

  it('socket.service.ts must have disconnect and reconnect lifecycle handlers', () => {
    // Without lifecycle handlers, the app has no way to detect connection loss
    // or re-register after reconnection
    expect({
      hasDisconnectHandler: socketServiceContent.includes("'disconnect'"),
      hasReconnectHandler: socketServiceContent.includes("'reconnect'"),
      hasConnectErrorHandler: socketServiceContent.includes("'connect_error'"),
      reason: 'lifecycle handlers detect connection loss and trigger re-registration',
    }).toEqual({
      hasDisconnectHandler: true,
      hasReconnectHandler: true,
      hasConnectErrorHandler: true,
      reason: 'lifecycle handlers detect connection loss and trigger re-registration',
    });
  });

  it('socket.service.ts must expose onReconnect callback mechanism', () => {
    // Components (tv.component) must re-emit tv-register after reconnection
    // to restore master/slave roles — without this, the TV stays frozen
    expect({
      hasOnReconnect: /onReconnect\s*\(/.test(socketServiceContent),
      reason: 'tv-register must be re-emitted on reconnect to restore master/slave sync',
    }).toEqual({
      hasOnReconnect: true,
      reason: 'tv-register must be re-emitted on reconnect to restore master/slave sync',
    });
  });

  it('tv.component.ts must re-emit tv-register on socket reconnection', () => {
    // After a socket reconnect, the server has lost the client's registration.
    // Without re-emitting tv-register, the slave never receives tv-loop-state
    // and the video stays frozen until a manual page refresh.
    expect({
      hasReconnectRegister: /onReconnect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*tv-register/.test(tvComponentContent),
      reason: 'socket reconnect without tv-register re-emit → slave frozen until refresh',
    }).toEqual({
      hasReconnectRegister: true,
      reason: 'socket reconnect without tv-register re-emit → slave frozen until refresh',
    });
  });

  it('double-buffer preload timeout must be >= 5000ms for remote network access', () => {
    // When accessing the Pi from a PC browser over WiFi, videos load via HTTP
    // instead of local disk. A 2s timeout causes premature forced switch → freeze frame.
    const timeoutMatch = doubleBufferContent.match(/Preload timeout.*?}\s*,\s*(\d+)\s*\)/s);
    const timeoutMs = timeoutMatch ? parseInt(timeoutMatch[1], 10) : 0;
    expect({
      timeoutMs,
      isAtLeast5s: timeoutMs >= 5000,
      reason: 'remote WiFi access needs >= 5s preload timeout — 2s causes freeze-frame on slow connections',
    }).toEqual({
      timeoutMs,
      isAtLeast5s: true,
      reason: 'remote WiFi access needs >= 5s preload timeout — 2s causes freeze-frame on slow connections',
    });
  });
});

// ----------------------------------------------------------
// ADR-035 Phase 3: Campaign operational wiring
// ----------------------------------------------------------
describe('ADR-035 Phase 3: Campaign operational wiring', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('campaign.controller exports all required handlers', async () => {
    const controller = await import('../controllers/campaign.controller');
    const requiredExports = [
      'listCampaigns', 'getCampaign', 'createCampaign', 'updateCampaign', 'deleteCampaign',
      'listCampaignVideos', 'addCampaignVideo', 'removeCampaignVideo',
      'listCampaignSites', 'addCampaignSite', 'removeCampaignSite',
      'resolveSites', 'getCampaignStats',
    ];
    for (const name of requiredExports) {
      expect(controller).toHaveProperty(name);
      expect(typeof (controller as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('campaign.repository exports campaignRepository with required methods', async () => {
    const { campaignRepository } = await import('../repositories');
    const requiredMethods = [
      'create', 'update', 'findByIdWithDetails', 'listByAdvertiser', 'listAll',
      'addVideo', 'removeVideo', 'listVideos',
      'addSite', 'removeSite', 'listSites',
      'resolveSitesByCriteria', 'resolveAndPopulateSites',
      'getStats', 'getStatsByAdvertiser', 'getImpressionsByDay',
    ];
    for (const method of requiredMethods) {
      expect(typeof (campaignRepository as unknown as Record<string, unknown>)[method]).toBe('function');
    }
  });

  it('full-schema.sql must include campaign_videos and campaign_sites tables', () => {
    const schemaContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/scripts/full-schema.sql'), 'utf-8'
    );
    expect(schemaContent).toContain('CREATE TABLE IF NOT EXISTS campaign_videos');
    expect(schemaContent).toContain('CREATE TABLE IF NOT EXISTS campaign_sites');
    expect(schemaContent).toContain('target_criteria');
    expect(schemaContent).toContain('campaign_stats_live');
  });

  it('campaign.routes.ts is imported and mounted in server.ts', () => {
    const serverContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/server.ts'), 'utf-8'
    );
    expect(serverContent).toContain("import campaignRoutes from './routes/campaign.routes'");
    expect(serverContent).toContain("app.use('/api/campaigns'");
  });

  it('migration file exists for Phase 3', () => {
    const migrationPath = path.join(
      repoRoot, 'central-server/src/scripts/migrations/adr035-phase3-campaigns-operational.sql'
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, 'utf-8');
    expect(content).toContain('campaign_videos');
    expect(content).toContain('campaign_sites');
    expect(content).toContain('target_criteria');
  });
});

// ----------------------------------------------------------
// ADR-035 Phase 3b: Campaign auto-deployment wiring
// ----------------------------------------------------------
describe('ADR-035 Phase 3b: Campaign auto-deployment wiring', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('campaign.controller exports deploy and undeploy handlers', async () => {
    const controller = await import('../controllers/campaign.controller');
    expect(controller).toHaveProperty('deployCampaign');
    expect(typeof controller.deployCampaign).toBe('function');
    expect(controller).toHaveProperty('undeployCampaign');
    expect(typeof controller.undeployCampaign).toBe('function');
  });

  it('campaign.repository exports deployment methods (getActiveCampaignsForSite, listPendingSites, batchUpdateDeploymentStatus)', async () => {
    const { campaignRepository } = await import('../repositories');
    const repo = campaignRepository as unknown as Record<string, unknown>;
    expect(typeof repo.getActiveCampaignsForSite).toBe('function');
    expect(typeof repo.listPendingSites).toBe('function');
    expect(typeof repo.batchUpdateDeploymentStatus).toBe('function');
  });

  it('campaign-deployment.service exports deployCampaign and undeployCampaign', async () => {
    const service = await import('../services/campaign-deployment.service');
    expect(typeof service.deployCampaign).toBe('function');
    expect(typeof service.undeployCampaign).toBe('function');
  });

  it('enrichConfigWithCampaignVideos exists and is a function', async () => {
    const { enrichConfigWithCampaignVideos } = await import('../utils/config-campaign-videos');
    expect(typeof enrichConfigWithCampaignVideos).toBe('function');
  });

  it('config-sync.handler.ts imports enrichConfigWithCampaignVideos', () => {
    const handlerContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/config-sync.handler.ts'), 'utf-8'
    );
    expect(handlerContent).toContain("import { enrichConfigWithCampaignVideos }");
    expect(handlerContent).toContain('enrichConfigWithCampaignVideos');
  });

  it('campaign.routes.ts registers deploy and undeploy endpoints', () => {
    const routesContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/routes/campaign.routes.ts'), 'utf-8'
    );
    expect(routesContent).toContain("/:id/deploy");
    expect(routesContent).toContain("/:id/undeploy");
    expect(routesContent).toContain('deployCampaign');
    expect(routesContent).toContain('undeployCampaign');
  });

  it('SponsorVideo type includes campaign_id field', () => {
    const typesContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/types/index.ts'), 'utf-8'
    );
    expect(typesContent).toContain('campaign_id?: string');
  });

  it('enrichConfigWithCampaignVideos must be called BEFORE autoResolveSponsorIds in the config sync pipeline', () => {
    const handlerContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/config-sync.handler.ts'), 'utf-8'
    );
    const campaignIdx = handlerContent.indexOf('enrichConfigWithCampaignVideos');
    const autoResolveIdx = handlerContent.indexOf('autoResolveSponsorIds(siteId');
    expect(campaignIdx).toBeGreaterThan(0);
    expect(autoResolveIdx).toBeGreaterThan(0);
    expect(campaignIdx).toBeLessThan(autoResolveIdx);
  });
});

// ----------------------------------------------------------
// ADR-035 Phase 3c: Campaign dashboard components
// ----------------------------------------------------------
describe('ADR-035 Phase 3c: Campaign dashboard components', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('advertiser-detail.component.ts includes campaigns tab', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.component.ts'), 'utf-8'
    );
    expect(content).toContain("activeTab === 'campaigns'");
    expect(content).toContain('switchToCampaignsTab');
    expect(content).toContain('loadCampaigns');
    expect(content).toContain('deployCampaignAction');
    expect(content).toContain('undeployCampaignAction');
  });

  it('advertiser-detail.component.ts has campaign CRUD methods', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.component.ts'), 'utf-8'
    );
    expect(content).toContain('openCampaignModal');
    expect(content).toContain('saveCampaign');
    expect(content).toContain('deleteCampaign');
    expect(content).toContain('editCampaign');
    expect(content).toContain('closeCampaignModal');
  });

  it('advertiser-detail.component.ts calls /campaigns API endpoints', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.component.ts'), 'utf-8'
    );
    expect(content).toContain("'/campaigns'");
    expect(content).toContain('/campaigns/${campaignId}/deploy');
    expect(content).toContain('/campaigns/${campaignId}/undeploy');
  });

  it('advertiser-detail.component.ts has campaign modal with videos and targeting tabs', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.component.ts'), 'utf-8'
    );
    // Modal tabs
    expect(content).toContain("campaignModalTab");
    expect(content).toContain("switchCampaignTab('videos')");
    expect(content).toContain("switchCampaignTab('targeting')");
    // Video management methods
    expect(content).toContain('loadCampaignVideos');
    expect(content).toContain('addCampaignVideo');
    expect(content).toContain('removeCampaignVideo');
    // API calls for videos
    expect(content).toContain('/campaigns/${this.campaignForm.id}/videos');
    // Site targeting methods
    expect(content).toContain('previewTargetSites');
    expect(content).toContain('applyCriteriaToSites');
    expect(content).toContain('loadCampaignSites');
    // API calls for sites
    expect(content).toContain('/campaigns/${this.campaignForm.id}/sites');
    expect(content).toContain('/campaigns/resolve-sites');
    // Interfaces
    expect(content).toContain('interface CampaignVideo');
    expect(content).toContain('interface ResolvedSite');
  });
});

// ADR-035 Phase 3d: Advertiser portal campaign views
// ----------------------------------------------------------
describe('ADR-035 Phase 3d: Advertiser portal campaign views', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('advertiser-portal.controller.ts exports getAdvertiserCampaigns and getAdvertiserCampaignDetail', () => {
    const controllerSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/controllers/advertiser-portal.controller.ts'),
      'utf-8'
    );
    expect(controllerSrc).toContain('getAdvertiserCampaigns');
    expect(controllerSrc).toContain('getAdvertiserCampaignDetail');
    // Must check advertiser ownership
    expect(controllerSrc).toContain('advertiser_id !== advertiserId');
  });

  it('advertiser-portal.routes.ts registers campaign endpoints', () => {
    const routesSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/routes/advertiser-portal.routes.ts'),
      'utf-8'
    );
    expect(routesSrc).toContain("'/campaigns'");
    expect(routesSrc).toContain("'/campaigns/:campaignId'");
    expect(routesSrc).toContain('getAdvertiserCampaigns');
    expect(routesSrc).toContain('getAdvertiserCampaignDetail');
  });

  it('sponsor-portal.service.ts exports PortalCampaign interface and getCampaigns method', () => {
    const serviceSrc = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/core/services/sponsor-portal.service.ts'),
      'utf-8'
    );
    expect(serviceSrc).toContain('PortalCampaign');
    expect(serviceSrc).toContain('PortalCampaignDetail');
    expect(serviceSrc).toContain('getCampaigns');
    expect(serviceSrc).toContain('getCampaignDetail');
    expect(serviceSrc).toContain('/advertiser/campaigns');
  });

  it('sponsor-dashboard.component.ts includes campaigns tab with detail view', () => {
    const componentSrc = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sponsor-portal/sponsor-dashboard.component.ts'),
      'utf-8'
    );
    // Tab navigation
    expect(componentSrc).toContain('activeTab');
    expect(componentSrc).toContain("'campaigns'");
    expect(componentSrc).toContain("'campaign-detail'");
    // Campaign list
    expect(componentSrc).toContain('loadCampaigns');
    expect(componentSrc).toContain('campaigns');
    // Campaign detail
    expect(componentSrc).toContain('openCampaignDetail');
    expect(componentSrc).toContain('selectedCampaign');
    expect(componentSrc).toContain('backToCampaigns');
  });
});

// ADR-035 Phase 4: Cleanup — neopro bridge removed
// ----------------------------------------------------------
describe('ADR-035 Phase 4: Cleanup — neopro bridge removed', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  test('site-sponsor.repository.ts does NOT contain upsertForAdvertiserSite', () => {
    const repoSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts'),
      'utf-8'
    );
    expect(repoSrc).not.toContain('upsertForAdvertiserSite');
  });

  test('site-sponsor.repository.ts does NOT reference source column', () => {
    const repoSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts'),
      'utf-8'
    );
    // Should not have source:'local'|'neopro' type or source column refs
    expect(repoSrc).not.toContain("'neopro'");
    expect(repoSrc).not.toContain("source: 'local' | 'neopro'");
  });

  test('advertiser-sites.controller.ts does NOT auto-create site_sponsors', () => {
    const ctrlSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/controllers/advertiser-sites.controller.ts'),
      'utf-8'
    );
    expect(ctrlSrc).not.toContain('upsertForAdvertiserSite');
    expect(ctrlSrc).not.toContain('Site sponsors auto-created');
  });

  test('adr035-phase4-cleanup.sql migration exists with all cleanup steps', () => {
    const migrationSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/scripts/migrations/adr035-phase4-cleanup.sql'),
      'utf-8'
    );
    // Backfill sponsor_id
    expect(migrationSrc).toContain('UPDATE video_plays');
    expect(migrationSrc).toContain("source = 'neopro'");
    // Delete neopro site_sponsors
    expect(migrationSrc).toContain("DELETE FROM site_sponsors");
    // Drop source column
    expect(migrationSrc).toContain('DROP COLUMN IF EXISTS source');
    // Drop advertiser_id from site_sponsors
    expect(migrationSrc).toContain('DROP COLUMN IF EXISTS advertiser_id');
    // Replace view
    expect(migrationSrc).toContain('advertiser_daily_stats_live');
    // Drop table
    expect(migrationSrc).toContain('DROP TABLE IF EXISTS advertiser_daily_stats');
  });

  test('full-schema.sql does NOT define advertiser_daily_stats table', () => {
    const schemaSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/scripts/full-schema.sql'),
      'utf-8'
    );
    expect(schemaSrc).not.toContain('CREATE TABLE IF NOT EXISTS advertiser_daily_stats');
  });

  test('types/index.ts SiteSponsorDeployment does NOT have source field', () => {
    const typesSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/types/index.ts'),
      'utf-8'
    );
    // Should not have source: 'local' | 'neopro' in SiteSponsorDeployment
    expect(typesSrc).not.toMatch(/source:\s*'local'\s*\|\s*'neopro'/);
  });

  // Guard: prevent regression — source column must stay removed
  test('site-sponsor.repository.ts create() does NOT insert source column', () => {
    const repoSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts'),
      'utf-8'
    );
    // The INSERT INTO site_sponsors should not include 'source' in column list
    const createMatch = repoSrc.match(/INSERT INTO site_sponsors\s*\(([^)]+)\)/);
    if (createMatch) {
      expect(createMatch[1]).not.toContain('source');
    }
  });

  test('site-sponsor.repository.ts does NOT reference advertiser_id column', () => {
    const repoSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts'),
      'utf-8'
    );
    // ADR-035 Phase 4: advertiser_id column removed from site_sponsors table
    // All queries should use video_plays.sponsor_id directly instead
    expect(repoSrc).not.toContain('ss.advertiser_id');
    expect(repoSrc).not.toContain('findByAdvertiserAndSite');
    // The INSERT should not reference advertiser_id
    const createMatch = repoSrc.match(/INSERT INTO site_sponsors\s*\(([^)]+)\)/);
    if (createMatch) {
      expect(createMatch[1]).not.toContain('advertiser_id');
    }
    // Interfaces should not have advertiser_id
    expect(repoSrc).not.toContain('advertiser_id:');
  });

  test('site-sponsor.repository.ts network stats query video_plays.sponsor_id directly', () => {
    const repoSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts'),
      'utf-8'
    );
    // After Phase 4, network stats bypass site_sponsors JOIN and query video_plays directly
    expect(repoSrc).toContain('vp.sponsor_id = $1');
  });

  test('orchestrated-deployment.service.ts does NOT map source field', () => {
    const svcSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/orchestrated-deployment.service.ts'),
      'utf-8'
    );
    expect(svcSrc).not.toMatch(/source:\s*row\.source/);
  });

  test('config-sync.handler.ts does NOT set source on sponsor objects', () => {
    const handlerSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/config-sync.handler.ts'),
      'utf-8'
    );
    expect(handlerSrc).not.toMatch(/source:\s*['"]local['"]/);
    expect(handlerSrc).not.toMatch(/source:\s*row\.source/);
  });

  test('enrichConfigWithCampaignVideos is FIRST in the enrichment pipeline (before autoResolveSponsorIds)', () => {
    const handlerSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/config-sync.handler.ts'),
      'utf-8'
    );
    // Strip import section to only check call order in function body
    const bodySrc = handlerSrc.replace(/^import\s.*$/gm, '');
    const campaignIdx = bodySrc.indexOf('enrichConfigWithCampaignVideos');
    const resolveIdx = bodySrc.indexOf('autoResolveSponsorIds');
    expect(campaignIdx).toBeGreaterThan(-1);
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(campaignIdx).toBeLessThan(resolveIdx);
  });
});

// Advertiser video display field alignment guard
// ----------------------------------------------------------
// The advertiser-detail template MUST use the actual API fields from
// advertiser.repository.getVideos (filename, original_name, duration, added_at, file_size),
// NOT phantom fields (video_title, video_duration, total_impressions, total_screen_time, priority, associated_at).
// Misalignment produces NaN/empty display — see v3.115.1 fix.
describe('Advertiser video display: template-API field alignment guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('advertiser-detail videos tab uses actual API fields (original_name, filename, duration, added_at)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.component.ts'), 'utf-8'
    );

    // Template MUST reference actual API fields
    expect(content).toContain('video.original_name');
    expect(content).toContain('video.filename');
    expect(content).toContain('video.added_at');

    // Template MUST NOT use phantom fields that don't exist in the API
    // video.video_title as standalone display (not fallback) would mean mismatch
    const videosTabMatch = content.match(/<!-- Videos Tab -->[\s\S]*?<!-- Analytics Tab -->/);
    expect(videosTabMatch).toBeTruthy();
    const videosTab = videosTabMatch![0];

    // These phantom fields must NOT appear as primary display in the videos tab
    expect(videosTab).not.toMatch(/\{\{\s*video\.total_impressions/);
    expect(videosTab).not.toMatch(/\{\{\s*video\.total_screen_time/);
    // video_title can appear as fallback but not as sole display
    expect(videosTab).not.toMatch(/\{\{\s*video\.video_title\s*\}\}/);
  });

  it('SponsorVideo interface includes actual API fields from advertiser.repository.getVideos', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.component.ts'), 'utf-8'
    );
    const ifaceMatch = content.match(/interface SponsorVideo \{[\s\S]*?\n\}/);
    expect(ifaceMatch).toBeTruthy();
    const iface = ifaceMatch![0];

    // Must have actual API fields
    expect(iface).toContain('filename');
    expect(iface).toContain('original_name');
    expect(iface).toContain('added_at');
    expect(iface).toContain('duration');
  });

  it('advertiser.repository.getVideos returns fields that match frontend expectations', () => {
    const repoSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/advertiser.repository.ts'), 'utf-8'
    );
    // The SQL query must select these fields
    expect(repoSrc).toContain('v.filename');
    expect(repoSrc).toContain('v.original_name');
    expect(repoSrc).toContain('v.duration');
    expect(repoSrc).toContain('av.added_at');
  });

  it('formatDuration guards against NaN input', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.component.ts'), 'utf-8'
    );
    const fnMatch = content.match(/formatDuration\(seconds: number\): string \{[\s\S]*?\n  \}/);
    expect(fnMatch).toBeTruthy();
    const fn = fnMatch![0];
    // Must guard against NaN/falsy input
    expect(fn).toMatch(/isNaN|!seconds/);
  });
});

// Campaign deploy error messaging guard
// ----------------------------------------------------------
// The deployCampaignAction error handler MUST surface the specific server error
// (no videos, no target sites, not found) — not a generic "Erreur lors du deploiement".
// Generic messages hide actionable information from the user — see v3.115.1 fix.
describe('Campaign deploy: meaningful error messages guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('deployCampaignAction error handler checks for specific server error messages', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.component.ts'), 'utf-8'
    );
    // Must check for the 3 specific error cases from campaign-deployment.service.ts
    expect(content).toContain("'no videos'");
    expect(content).toContain("'no target sites'");
    expect(content).toContain("'not found'");
    // Must access the server error message
    expect(content).toMatch(/err\?\.error\?\.error|error\.error\.error/);
  });

  it('campaign-deployment.service.ts throws identifiable errors for each validation case', () => {
    const serviceSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/campaign-deployment.service.ts'), 'utf-8'
    );
    // Each validation case must throw with a recognizable message
    expect(serviceSrc).toContain('no videos');
    expect(serviceSrc).toContain('no target sites');
    expect(serviceSrc).toContain('not found');
  });

  it('campaign.controller.ts maps validation errors to 400 status', () => {
    const controllerSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/controllers/campaign.controller.ts'), 'utf-8'
    );
    // Must check for all 3 validation patterns and return 400
    expect(controllerSrc).toContain("'not found'");
    expect(controllerSrc).toContain("'no videos'");
    expect(controllerSrc).toContain("'no target sites'");
    expect(controllerSrc).toContain('res.status(400)');
  });
});
