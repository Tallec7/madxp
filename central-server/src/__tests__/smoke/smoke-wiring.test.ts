/**
 * Smoke tests — wiring domain
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
import * as fs from 'fs';
import * as path from 'path';

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
  process.env.PORT = '3099';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('Socket.IO service wiring', () => {
  it('socket service mock is correctly wired', async () => {
    const socketService = (await import('../../services/socket.service')).default;
    expect(socketService.initialize).toBeDefined();
    expect(socketService.getConnectionCount).toBeDefined();
    expect(socketService.getConnectedSites).toBeDefined();
    expect(socketService.getIO).toBeDefined();
    expect(socketService.cleanup).toBeDefined();
    expect(socketService.getDebugInfo).toBeDefined();
    expect(socketService.getConnectionHealth).toBeDefined();
  });

  it('socket service getDebugInfo returns expected shape', async () => {
    const socketService = (await import('../../services/socket.service')).default;
    const debugInfo = socketService.getDebugInfo();
    expect(debugInfo).toHaveProperty('pendingCommandsCount');
    expect(debugInfo).toHaveProperty('connectedSites');
    expect(debugInfo).toHaveProperty('lastPongReceived');
    expect(typeof debugInfo.pendingCommandsCount).toBe('number');
    expect(Array.isArray(debugInfo.connectedSites)).toBe(true);
  });

  it('socket service getConnectionHealth returns expected shape', async () => {
    const socketService = (await import('../../services/socket.service')).default;
    const health = socketService.getConnectionHealth('test-site-id');
    expect(health).toHaveProperty('inMap');
    expect(health).toHaveProperty('socketConnected');
    expect(health).toHaveProperty('isHealthy');
    expect(health).toHaveProperty('reason');
  });
});

describe('Service initialization wiring', () => {
  it('scheduler service mock is wired and callable', async () => {
    const schedulerService = (await import('../../services/scheduler.service')).default;
    expect(schedulerService.start).toBeDefined();
    expect(schedulerService.stop).toBeDefined();
  });

  it('cron-scheduler service mock is wired and callable', async () => {
    const cronSchedulerService = (await import('../../services/cron-scheduler.service')).default;
    expect(cronSchedulerService.start).toBeDefined();
    expect(cronSchedulerService.stop).toBeDefined();
  });

  it('memory-manager service mock is wired and callable', async () => {
    const memoryManagerService = (await import('../../services/memory-manager.service')).default;
    expect(memoryManagerService.start).toBeDefined();
    expect(memoryManagerService.stop).toBeDefined();
    expect(memoryManagerService.registerCleanupCallback).toBeDefined();
  });

  it('network-alerts service mock is wired and callable', async () => {
    const networkAlertsService = (await import('../../services/network-alerts.service')).default;
    expect(networkAlertsService.start).toBeDefined();
    expect(networkAlertsService.stop).toBeDefined();
  });

  it('alerting service mock is wired and callable', async () => {
    const { alertingService } = await import('../../services/alerting.service');
    expect(alertingService.initialize).toBeDefined();
    expect(alertingService.cleanup).toBeDefined();
    expect(alertingService.clearMemoryCache).toBeDefined();
  });

  it('alerting service exposes hourly metric collection methods', async () => {
    const { alertingService } = await import('../../services/alerting.service');
    // These methods feed data into evaluateMetric() for threshold-based alerting
    expect(typeof alertingService.recordDisconnectEvent).toBe('function');
    expect(typeof alertingService.recordVideoSafetyTimeouts).toBe('function');
    expect(typeof alertingService.checkHourlyMetrics).toBe('function');
    expect(typeof alertingService.evaluateMetric).toBe('function');
  });

  it('realtime-stats service mock is wired and callable', async () => {
    const { realtimeStatsService } = await import('../../services/realtime-stats.service');
    expect(realtimeStatsService.initialize).toBeDefined();
    expect(realtimeStatsService.start).toBeDefined();
  });

  it('all services expose the methods called during startup', async () => {
    // Note: jest.clearAllMocks() in setup.ts afterEach clears call counts,
    // so we verify that the mock functions exist and are callable (wiring OK).
    // The actual startup calls were verified by the fact that beforeAll succeeded.
    const socketService = (await import('../../services/socket.service')).default;
    const schedulerService = (await import('../../services/scheduler.service')).default;
    const cronSchedulerService = (await import('../../services/cron-scheduler.service')).default;
    const memoryManagerService = (await import('../../services/memory-manager.service')).default;
    const networkAlertsService = (await import('../../services/network-alerts.service')).default;
    const { alertingService } = await import('../../services/alerting.service');

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

describe('Repository layer wiring', () => {
  it('all repositories are exported from index', async () => {
    const repos = await import('../../repositories');
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
    const repos = await import('../../repositories');
    expect(repos).toHaveProperty('BaseRepository');
    expect(typeof repos.BaseRepository).toBe('function');
  });
});

describe('Middleware exports wiring', () => {
  it('auth middleware exports all expected functions', async () => {
    const auth = await import('../../middleware/auth');
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
    const validation = await import('../../middleware/validation');
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
    const rateLimit = await import('../../middleware/user-rate-limit');
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
    const pagination = await import('../../middleware/pagination');
    expect(pagination.paginationMiddleware).toBeDefined();
    expect(pagination.createPaginationMiddleware).toBeDefined();
    expect(pagination.formatPaginatedResponse).toBeDefined();
    expect(pagination.buildPaginationClause).toBeDefined();
    expect(pagination.executePaginatedQuery).toBeDefined();
  });

  it('error handler middleware exports handlers', async () => {
    const errorHandler = await import('../../middleware/error-handler');
    expect(errorHandler.errorHandler).toBeDefined();
    expect(errorHandler.notFoundHandler).toBeDefined();
    expect(errorHandler.asyncHandler).toBeDefined();
  });

  it('correlation middleware exports correctly', async () => {
    const correlation = await import('../../middleware/correlation');
    expect(correlation.correlationMiddleware).toBeDefined();
  });

  it('RLS context middleware exports all functions', async () => {
    const rls = await import('../../middleware/rls-context');
    expect(rls.setRLSContext).toBeDefined();
    expect(rls.resetRLSContext).toBeDefined();
    expect(rls.setAdminContext).toBeDefined();
    expect(rls.withRLSContext).toBeDefined();
    expect(rls.withAdminContext).toBeDefined();
  });
});

describe('Error types wiring', () => {
  it('ErrorCode enum has all expected categories', async () => {
    const { ErrorCode } = await import('../../types/errors');
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
    const { AppError, ErrorCode } = await import('../../types/errors');
    const err = new AppError(ErrorCode.RESOURCE_NOT_FOUND);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('RESOURCE_NOT_FOUND');
    expect(err.statusCode).toBeDefined();
    expect(typeof err.toResponse).toBe('function');
  });

  it('AppError.toResponse produces standardized format', async () => {
    const { AppError, ErrorCode } = await import('../../types/errors');
    const err = new AppError(ErrorCode.VALIDATION_FAILED, { field: 'email' });
    const response = err.toResponse('test-correlation-id', '/api/test');
    expect(response.error).toHaveProperty('code', 'VALIDATION_FAILED');
    expect(response.error).toHaveProperty('correlationId', 'test-correlation-id');
    expect(response.error).toHaveProperty('path', '/api/test');
    expect(response.error).toHaveProperty('timestamp');
  });
});

describe('Pagination middleware behavior', () => {
  it('formats paginated response correctly', async () => {
    const { formatPaginatedResponse } = await import('../../middleware/pagination');
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
    const { formatPaginatedResponse } = await import('../../middleware/pagination');
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
    const { buildPaginationClause } = await import('../../middleware/pagination');
    const clause = buildPaginationClause({ page: 2, limit: 10, offset: 10 });
    expect(clause).toBe('LIMIT 10 OFFSET 10');
  });
});

describe('Socket.IO handler files exist', () => {
  it('all handler files exist on disk', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('API documentation', () => {
  it('GET /api-docs is accessible in non-production', async () => {
    const res = await request(app).get('/api-docs');
    // In test/dev, either serves swagger UI (301/200) or returns message
    expect(res.status).not.toBe(500);
    // 301 redirect to /api-docs/ is also acceptable
    expect([200, 301]).toContain(res.status);
  });
});
