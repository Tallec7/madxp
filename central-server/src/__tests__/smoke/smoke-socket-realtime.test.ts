/**
 * Smoke tests — socket-realtime domain
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
  process.env.PORT = '3101';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('Hourly metric alerting wiring', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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
    const checksPath = path.join(repoRoot, 'central-server', 'src', 'services', 'alerting-checks.service.ts');
    const content = fs.readFileSync(alertingPath, 'utf8');
    const checksContent = fs.readFileSync(checksPath, 'utf8');

    expect({
      hasCheckHourlyMetrics: content.includes('async checkHourlyMetrics'),
      calledInPeriodicLoop: content.includes('checkHourlyMetrics()'),
      queriesKioskCrashes: checksContent.includes("alert_type = 'kiosk_crash'"),
      evaluatesWsDisconnects: checksContent.includes("'websocket_disconnects_1h'"),
      evaluatesVideoTimeouts: checksContent.includes("'video_safety_timeouts_1h'"),
      evaluatesKioskCrashes: checksContent.includes("'kiosk_crashes_1h'"),
    }).toEqual({
      hasCheckHourlyMetrics: true,
      calledInPeriodicLoop: true,
      queriesKioskCrashes: true,
      evaluatesWsDisconnects: true,
      evaluatesVideoTimeouts: true,
      evaluatesKioskCrashes: true,
    });
  });

  it('alerting types has orphaned_video_references threshold defined', () => {
    const typesPath = path.join(repoRoot, 'central-server', 'src', 'services', 'alerting.types.ts');
    const content = fs.readFileSync(typesPath, 'utf8');

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

});

describe('Cloud remote relay chain', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Socket.IO property access consistency', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Sponsor loop analytics category wiring', () => {
  const sponsorService = fs.readFileSync(
    path.resolve(__dirname, '../../../../raspberry/admin/services/sponsor.service.js'),
    'utf8'
  );

  const deploymentService = fs.readFileSync(
    path.resolve(__dirname, '../../services/orchestrated-deployment.service.ts'),
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

describe('Benchmark repository query safety', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Deployment repository query safety', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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
