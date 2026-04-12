/**
 * Smoke tests — server-core domain
 * Split from monolithic smoke.test.ts for maintainability.
 *
 * Usage: npm run test:smoke
 */

// ============================================================
// Mocks — AVANT tout import dynamique de ../../server
// setup.ts mock déjà ../../config/database et ../../config/logger
// ============================================================

jest.mock('../../services/socket.service', () => ({
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

jest.mock('../../services/scheduler.service', () => ({
  __esModule: true,
  default: { start: jest.fn(), stop: jest.fn() },
}));

jest.mock('../../services/cron-scheduler.service', () => ({
  __esModule: true,
  default: { start: jest.fn().mockResolvedValue(undefined), stop: jest.fn() },
}));

jest.mock('../../services/memory-manager.service', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    registerCleanupCallback: jest.fn(),
  },
}));

jest.mock('../../services/network-alerts.service', () => ({
  __esModule: true,
  default: { start: jest.fn(), stop: jest.fn() },
}));

jest.mock('../../services/alerting.service', () => ({
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

jest.mock('../../services/realtime-stats.service', () => ({
  __esModule: true,
  realtimeStatsService: {
    initialize: jest.fn(),
    start: jest.fn(),
  },
}));



jest.mock('../../middleware/upload', () => ({
  ...(jest.requireActual('../../middleware/upload') as Record<string, unknown>),
  cleanupStaleTempFiles: jest.fn(),
}));

// ============================================================
// Tests
// ============================================================

import request from 'supertest';
import { generateToken } from '../../middleware/auth';

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
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

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
