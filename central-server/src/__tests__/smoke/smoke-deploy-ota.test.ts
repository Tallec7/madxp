/**
 * Smoke tests — deploy-ota domain
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
  process.env.PORT = '3106';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('content.routes rate-limit guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const routesPath = path.join(repoRoot, 'central-server/src/routes/content.routes.ts');
  const serverPath = path.join(repoRoot, 'central-server/src/server.ts');

  let routes: string;
  let server: string;
  beforeAll(() => {
    routes = fs.readFileSync(routesPath, 'utf8');
    server = fs.readFileSync(serverPath, 'utf8');
  });

  it("content.routes.ts GET /videos must use adminRateLimit", () => {
    expect(/router\.get\(\s*['"]\/videos['"][^)]*adminRateLimit/.test(routes)).toBe(true);
  });

  it("content.routes.ts GET /deployments must use adminRateLimit", () => {
    expect(/router\.get\(\s*['"]\/deployments['"][^)]*adminRateLimit/.test(routes)).toBe(true);
  });

  it("server.ts must NOT wrap contentRoutes with sensitiveRateLimit", () => {
    expect(/app\.use\(\s*['"]\/api['"]\s*,\s*sensitiveRateLimit\s*,\s*contentRoutes/.test(server)).toBe(false);
  });
});

describe('OTA pre-migration guard (update-deployment.service)', () => {
  const servicePath = path.resolve(
    __dirname, '..', '..', 'services', 'update-deployment.service.ts'
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

describe('Deploy progress auto-completion guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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

describe('deployed_path feedback guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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
    const content = [
      'raspberry/sync-agent/src/agent.js',
      'raspberry/sync-agent/src/services/command-dispatch.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
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
    const readAllTs = (dir: string): string => {
      let r = '';
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) r += readAllTs(p);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) r += fs.readFileSync(p, 'utf8') + '\n';
      }
      return r;
    };
    const content = readAllTs(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-content-tab')
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
    const readAllTs2 = (dir: string): string => {
      let r = '';
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) r += readAllTs2(p);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) r += fs.readFileSync(p, 'utf8') + '\n';
      }
      return r;
    };
    const dashboardContent = readAllTs2(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-content-tab')
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

describe('deployed_path backfill guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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

describe('Post-OTA validation integration', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('update-software.js must import and call validate-post-update before reporting success', () => {
    const otaContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    // Must require the validation module (direct or via require.resolve for cache-busting)
    expect({ importsValidator: otaContent.includes("validate-post-update") })
      .toEqual({ importsValidator: true });
    // Must call validate() with throwOnCritical: true (so failures trigger rollback)
    // freshValidator: cache-busted require to pick up fixes from newly installed code
    expect({ callsValidate: otaContent.includes('freshValidator.validate') || otaContent.includes('postUpdateValidator.validate') })
      .toEqual({ callsValidate: true });
    expect({ throwsOnCritical: otaContent.includes('throwOnCritical: true') })
      .toEqual({ throwsOnCritical: true });
  });

  it('validate-post-update.js must check critical services (neopro-app, neopro-admin)', () => {
    const validatorContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/validate-post-update.js'),
      'utf8'
    );
    expect({ checksNeoproApp: validatorContent.includes('neopro-app') })
      .toEqual({ checksNeoproApp: true });
    expect({ checksNeoproAdmin: validatorContent.includes('neopro-admin') })
      .toEqual({ checksNeoproAdmin: true });
  });

  it('validate-post-update.js must check HTTP health of app (port 3000) and admin (port 8080)', () => {
    const validatorContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/validate-post-update.js'),
      'utf8'
    );
    // Must use 127.0.0.1 (not localhost) to avoid IPv6 ECONNREFUSED on Debian 12+
    expect({ checksPort3000: validatorContent.includes('127.0.0.1:3000') })
      .toEqual({ checksPort3000: true });
    expect({ checksPort8080: validatorContent.includes('127.0.0.1:8080') })
      .toEqual({ checksPort8080: true });
  });

  it('update-software.js must cache-bust validate-post-update.js after extraction (bootstrapping fix)', () => {
    const otaContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    // After extractAndInstall copies new sync-agent files, the old module is stale in require.cache.
    // Without cache-busting, a Pi upgrading from pre-3.116.29 would run the OLD validator
    // (with localhost instead of 127.0.0.1) → ECONNREFUSED ::1 → false rollback.
    expect({ clearsCache: otaContent.includes('delete require.cache') })
      .toEqual({ clearsCache: true });
    expect({ reloadsValidator: otaContent.includes("validate-post-update") })
      .toEqual({ reloadsValidator: true });
  });

  it('validate-post-update.js must check configuration.json integrity', () => {
    const validatorContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/validate-post-update.js'),
      'utf8'
    );
    expect({ checksConfig: validatorContent.includes('configuration.json') || validatorContent.includes('config.paths.config') })
      .toEqual({ checksConfig: true });
    expect({ parsesJson: validatorContent.includes('JSON.parse') })
      .toEqual({ parsesJson: true });
  });

  it('validate-post-update.js must check webapp/index.html exists', () => {
    const validatorContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/validate-post-update.js'),
      'utf8'
    );
    expect({ checksIndexHtml: validatorContent.includes('index.html') })
      .toEqual({ checksIndexHtml: true });
  });

  it('validate-post-update.js must check HDMI display status via DRM sysfs', () => {
    const validatorContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/validate-post-update.js'),
      'utf8'
    );
    // Must use /sys/class/drm/ (not cec-client alone — smoke test enforced)
    expect({ checksDrmSysfs: validatorContent.includes('/sys/class/drm/') })
      .toEqual({ checksDrmSysfs: true });
  });

  // Guard: heartbeat handler must detect silent OTA rollback
  // (if socket was down during OTA failure, the completed signal is lost and the
  // dashboard shows "Terminé" while the Pi rolled back to the old version)
  it('heartbeat handler must detect silent OTA rollback via version mismatch', () => {
    const heartbeatHandler = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
      'utf8'
    );
    expect({
      checksUpdateDeployments: heartbeatHandler.includes('update_deployments'),
      detectsRollback: /rollback.*detect|silent.*rollback/i.test(heartbeatHandler),
      marksAsFailed: heartbeatHandler.includes("status = 'failed'"),
    }).toEqual({
      checksUpdateDeployments: true,
      detectsRollback: true,
      marksAsFailed: true,
    });
  });

  it('validate-pi.sh must exist and be executable', () => {
    const scriptPath = path.join(repoRoot, 'raspberry/scripts/validate-pi.sh');
    expect({ exists: fs.existsSync(scriptPath) }).toEqual({ exists: true });
    const stat = fs.statSync(scriptPath);
    // Check owner-executable bit
    // eslint-disable-next-line no-bitwise
    expect({ executable: (stat.mode & 0o100) !== 0 }).toEqual({ executable: true });
  });

  it('validate-pi.sh must support --json output mode', () => {
    const scriptContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/validate-pi.sh'),
      'utf8'
    );
    expect({ supportsJson: scriptContent.includes('--json') })
      .toEqual({ supportsJson: true });
    expect({ outputsJsonFormat: scriptContent.includes('"healthy"') })
      .toEqual({ outputsJsonFormat: true });
  });

  it('admin routes must expose POST /api/system/validate endpoint', () => {
    const systemRoutes = fs.readFileSync(
      path.join(repoRoot, 'raspberry/admin/routes/system.js'),
      'utf8'
    );
    expect({ hasValidateRoute: systemRoutes.includes('/api/system/validate') })
      .toEqual({ hasValidateRoute: true });
    expect({ callsValidatePiSh: systemRoutes.includes('validate-pi.sh') })
      .toEqual({ callsValidatePiSh: true });
  });
});

describe('OTA download resilience', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // Guard: OTA download must have stall detection for silent WiFi drops
  // On RTL8192EU mesh, WiFi drops silently without triggering stream errors —
  // without stall detection, the download hangs indefinitely at 5%.
  it('downloadPackage must have stall detection timer (no infinite hang on WiFi drop)', () => {
    const otaFiles = [
      'raspberry/sync-agent/src/commands/update-software.js',
      'raspberry/sync-agent/src/commands/ota-download.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({ hasStallTimer: otaFiles.includes('stallTimer') })
      .toEqual({ hasStallTimer: true });
    expect({ hasStallTimeout: otaFiles.includes('STALL_TIMEOUT') })
      .toEqual({ hasStallTimeout: true });
    // Must destroy the stream on stall (not just log)
    expect({ destroysStream: otaFiles.includes('.destroy(') })
      .toEqual({ destroysStream: true });
  });

  // Guard: OTA download must have retry logic with progressive backoff
  it('OTA download must retry on failure (not fail on first stall)', () => {
    const otaFiles = [
      'raspberry/sync-agent/src/commands/update-software.js',
      'raspberry/sync-agent/src/commands/ota-download.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({ hasDownloadRetry: otaFiles.includes('MAX_DOWNLOAD_RETRIES') })
      .toEqual({ hasDownloadRetry: true });
    expect({ hasRetryDelay: otaFiles.includes('retryDelay') })
      .toEqual({ hasRetryDelay: true });
  });

  // Guard: stall timer must listen to 'data' events on response stream (not just writer)
  it('stall timer must reset on response data events', () => {
    const otaFiles = [
      'raspberry/sync-agent/src/commands/update-software.js',
      'raspberry/sync-agent/src/commands/ota-download.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({ listensToData: otaFiles.includes("response.data.on('data'") })
      .toEqual({ listensToData: true });
  });

  // Guard: stall timer must be cleared on finish/error (prevent memory leak)
  it('stall timer must be cleared on stream finish and error', () => {
    const otaFiles = [
      'raspberry/sync-agent/src/commands/update-software.js',
      'raspberry/sync-agent/src/commands/ota-download.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({ clearsOnFinish: otaFiles.includes('clearTimeout(stallTimer)') })
      .toEqual({ clearsOnFinish: true });
  });
});

describe('Build includes OTA validation files', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('build-raspberry.sh must include validate-pi.sh in RUNTIME_SCRIPTS', () => {
    const buildScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/build-raspberry.sh'),
      'utf8'
    );
    expect({ includesValidatePi: buildScript.includes('validate-pi.sh') })
      .toEqual({ includesValidatePi: true });
  });

  it('build-raspberry.sh must include validate-post-update.js in SYNC_AGENT_CRITICAL', () => {
    const buildScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/build-raspberry.sh'),
      'utf8'
    );
    expect({ includesValidatePostUpdate: buildScript.includes('validate-post-update.js') })
      .toEqual({ includesValidatePostUpdate: true });
  });
});

describe('Hardware matrix E2E tests existence', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('hardware-matrix.spec.ts must exist and cover HDMI scenarios', () => {
    const specContent = fs.readFileSync(
      path.join(repoRoot, 'e2e/tests/hardware-matrix.spec.ts'),
      'utf8'
    );
    // Must test all 4 HDMI configurations
    expect({ hasHdmi0Only: specContent.includes('HDMI-0 Only') })
      .toEqual({ hasHdmi0Only: true });
    expect({ hasHdmi1Only: specContent.includes('HDMI-1 Only') })
      .toEqual({ hasHdmi1Only: true });
    expect({ hasDualHdmi: specContent.includes('Dual HDMI') })
      .toEqual({ hasDualHdmi: true });
    expect({ hasNoHdmi: specContent.includes('No HDMI') })
      .toEqual({ hasNoHdmi: true });
  });

  it('hardware-matrix.spec.ts must test hot-plug transitions', () => {
    const specContent = fs.readFileSync(
      path.join(repoRoot, 'e2e/tests/hardware-matrix.spec.ts'),
      'utf8'
    );
    expect({ hasHotPlug: specContent.includes('Hot-Plug') })
      .toEqual({ hasHotPlug: true });
    expect({ hasSingleToDual: specContent.includes('single to dual') || specContent.includes('single→dual') })
      .toEqual({ hasSingleToDual: true });
    expect({ hasDualToSingle: specContent.includes('dual to single') || specContent.includes('dual→single') })
      .toEqual({ hasDualToSingle: true });
  });

  it('hardware-matrix.spec.ts must test socket reconnection', () => {
    const specContent = fs.readFileSync(
      path.join(repoRoot, 'e2e/tests/hardware-matrix.spec.ts'),
      'utf8'
    );
    expect({ hasReconnect: specContent.includes('Reconnection') || specContent.includes('reconnect') })
      .toEqual({ hasReconnect: true });
  });

  it('hardware-matrix.spec.ts must use hdmi-status-update events (not mock hdmiConnected directly)', () => {
    const specContent = fs.readFileSync(
      path.join(repoRoot, 'e2e/tests/hardware-matrix.spec.ts'),
      'utf8'
    );
    // Must inject events via BroadcastChannel, simulating real Pi behavior
    expect({ usesHdmiEvent: specContent.includes('hdmi-status-update') })
      .toEqual({ usesHdmiEvent: true });
    expect({ usesBroadcastChannel: specContent.includes('BroadcastChannel') })
      .toEqual({ usesBroadcastChannel: true });
  });
});

describe('Canary monitoring post-OTA', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('canary-monitor.service.ts must exist and check site health', () => {
    const canaryContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/canary-monitor.service.ts'),
      'utf8'
    );
    // Must check site online status
    expect({ checksOnline: canaryContent.includes('last_seen_at') })
      .toEqual({ checksOnline: true });
    // Must check version match
    expect({ checksVersion: canaryContent.includes('software_version') })
      .toEqual({ checksVersion: true });
    // Must create canary alerts via alertRepository
    expect({ createsAlerts: canaryContent.includes('alertRepository.create') })
      .toEqual({ createsAlerts: true });
    // Must deduplicate alerts
    expect({ deduplicates: canaryContent.includes('existsActive') })
      .toEqual({ deduplicates: true });
  });

  it('deploy-progress.handler.ts must start canary watch on OTA completion', () => {
    const handlerContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/deploy-progress.handler.ts'),
      'utf8'
    );
    expect({ importsCanary: handlerContent.includes('canaryMonitorService') })
      .toEqual({ importsCanary: true });
    expect({ startsWatch: handlerContent.includes('canaryMonitorService.startWatch') })
      .toEqual({ startsWatch: true });
  });

  it('alerting.service.ts must run canary checks in its periodic loop', () => {
    const alertingContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/alerting.service.ts'),
      'utf8'
    );
    expect({ runsCanaryChecks: alertingContent.includes('canaryMonitorService.runChecks') })
      .toEqual({ runsCanaryChecks: true });
  });

  it('canary-monitor.service.ts must have configurable window and not auto-rollback', () => {
    const canaryContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/canary-monitor.service.ts'),
      'utf8'
    );
    // Must use env var for window duration
    expect({ configurableWindow: canaryContent.includes('CANARY_WINDOW_MS') })
      .toEqual({ configurableWindow: true });
    // Must NOT contain automatic rollback (manual decision)
    expect({ noAutoRollback: !canaryContent.includes('rollback()') })
      .toEqual({ noAutoRollback: true });
  });
});

describe('OTA deployment observability guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('dashboard subscribeToDeploymentProgress must propagate error from update_progress events', () => {
    const component = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/updates/updates-management.component.ts'),
      'utf8'
    );
    const dataService = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/updates/updates-management.data.service.ts'),
      'utf8'
    );
    // The real-time event type cast must include error field (may be in component or data service)
    const hasErrorInType = component.includes("error?: string") || component.includes("error: string")
      || dataService.includes("error?: string") || dataService.includes("error: string");
    expect({ hasErrorInType }).toEqual({ hasErrorInType: true });
    // Must assign error to deployment.error_message
    expect({ propagatesError: component.includes("deployment.error_message = data.error") })
      .toEqual({ propagatesError: true });
  });

  it('dashboard must show fallback message when deployment failed without error_message', () => {
    const component = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/updates/updates-management.component.ts'),
      'utf8'
    );
    // The error block must NOT require error_message to be truthy
    // (it used to have *ngIf="deployment.status === 'failed' && deployment.error_message")
    expect({ noErrorMessageGate: !component.includes("status === 'failed' && deployment.error_message") })
      .toEqual({ noErrorMessageGate: true });
    // Must have a fallback text for null error_message
    expect({ hasFallback: component.includes("deployment.error_message || '") })
      .toEqual({ hasFallback: true });
  });

  it('dashboard must show deployment duration/elapsed for completed and in_progress deployments', () => {
    const component = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/updates/updates-management.component.ts'),
      'utf8'
    );
    // Must have duration calculation methods
    expect({ hasDuration: component.includes('getDeploymentDuration(') })
      .toEqual({ hasDuration: true });
    expect({ hasElapsed: component.includes('getDeploymentElapsed(') })
      .toEqual({ hasElapsed: true });
    // Must display summary for completed deployments
    expect({ hasCompletedSummary: component.includes("deployment.status === 'completed'") && component.includes('Déployé avec succès') })
      .toEqual({ hasCompletedSummary: true });
  });

  it('update-software.js must read systemd services from sourcePath (archive), not rootDir', () => {
    // Issue: using rootDir (/home/pi/neopro) reads stale .service files from previous OTAs
    // (e.g. neopro-vlc-kiosk, neopro-ffmpeg-stream) that fix-fleet-pi.sh deletes but the OTA
    // re-installs before fix-fleet runs → orphan services crash-loop + restart hostapd ~22x/hour.
    // Fix: use sourcePath (the extracted archive in /tmp/) to only install services from the package.
    const otaFiles = [
      'raspberry/sync-agent/src/commands/update-software.js',
      'raspberry/sync-agent/src/commands/ota-install.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    // Must use sourcePath for the systemd config directory
    expect({ usesSourcePath: otaFiles.includes("path.join(sourcePath, 'config', 'systemd')") })
      .toEqual({ usesSourcePath: true });
    // Must NOT use rootDir for systemd config (the old broken pattern)
    expect({ noRootDir: !otaFiles.includes("path.join(rootDir, 'config', 'systemd')") })
      .toEqual({ noRootDir: true });
  });

  it('update-software.js must report OTA steps via OtaStepTracker for dashboard visibility', () => {
    const updateSoftware = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    // Must have the step tracker class
    expect({ hasTracker: updateSoftware.includes('class OtaStepTracker') })
      .toEqual({ hasTracker: true });
    // Must return steps in the result
    expect({ returnsSteps: updateSoftware.includes('steps: this.stepTracker.toJSON()') })
      .toEqual({ returnsSteps: true });
    // Must attach partial steps on error for failed deployment visibility
    expect({ stepsOnError: updateSoftware.includes('error.steps = this.stepTracker.toJSON()') })
      .toEqual({ stepsOnError: true });
  });

  it('agent.js must include steps in update_progress emission', () => {
    const agent = [
      'raspberry/sync-agent/src/agent.js',
      'raspberry/sync-agent/src/services/command-dispatch.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    // Must include steps in the completion event
    expect({ stepsInCompletion: agent.includes("steps: result?.steps") })
      .toEqual({ stepsInCompletion: true });
    // Must include partial steps in the error event
    expect({ stepsInError: agent.includes("steps: error.steps") })
      .toEqual({ stepsInError: true });
  });

  it('deploy-progress.handler.ts must store deployment_details on completion', () => {
    const handler = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/deploy-progress.handler.ts'),
      'utf8'
    );
    expect({ storesDetails: handler.includes('deployment_details') })
      .toEqual({ storesDetails: true });
  });

  it('dashboard must have Voir detail button and step checklist for OTA deployments', () => {
    const component = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/updates/updates-management.component.ts'),
      'utf8'
    );
    expect({ hasVoirDetail: component.includes('Voir détail') })
      .toEqual({ hasVoirDetail: true });
    expect({ hasStepChecklist: component.includes('deployment-steps') && component.includes('step-row') })
      .toEqual({ hasStepChecklist: true });
    expect({ hasStepIcon: component.includes('getStepIcon(') })
      .toEqual({ hasStepIcon: true });
  });

  it('orphan .service files must NOT exist in raspberry/config/systemd/', () => {
    // These old POC services were removed from the codebase but survived on Pi
    // because rsync didn't use --delete for config/. Guard against re-addition.
    const orphans = ['neopro-vlc-kiosk', 'neopro-ffmpeg-stream', 'neopro-playlist-manager', 'neopro-score-bridge'];
    const systemdDir = path.join(repoRoot, 'raspberry/config/systemd');
    const files = fs.readdirSync(systemdDir);
    for (const orphan of orphans) {
      expect({ [`noOrphan_${orphan}`]: !files.includes(`${orphan}.service`) })
        .toEqual({ [`noOrphan_${orphan}`]: true });
    }
  });

  it('checkPhantomSponsors must auto-deactivate single-char sponsor names', () => {
    const alerting = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/alerting.service.ts'),
      'utf8'
    );
    // Must have the method
    expect({ hasMethod: alerting.includes('checkPhantomSponsors') })
      .toEqual({ hasMethod: true });
    // Must check for single-char names
    expect({ checksLength: /LENGTH.*TRIM.*name.*<=\s*1/.test(alerting) })
      .toEqual({ checksLength: true });
    // Must deactivate (not delete) for audit trail
    expect({ deactivates: alerting.includes("status = 'inactive'") && alerting.includes('phantom_single_char_name') })
      .toEqual({ deactivates: true });
    // Must be called in the periodic loop
    expect({ calledPeriodically: /checkPhantomSponsors\(\)/.test(alerting) })
      .toEqual({ calledPeriodically: true });
  });

  it('checkAggregationStaleness must alert when CRON aggregation is late (>36h)', () => {
    const alerting = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/alerting.service.ts'),
      'utf8'
    );
    // Must have the method
    expect({ hasMethod: alerting.includes('checkAggregationStaleness') })
      .toEqual({ hasMethod: true });
    // Must check both tables
    expect({ checksClubStats: alerting.includes('club_daily_stats') })
      .toEqual({ checksClubStats: true });
    expect({ checksSponsorStats: alerting.includes('site_sponsor_daily_stats') })
      .toEqual({ checksSponsorStats: true });
    // Must use 36h threshold
    expect({ has36hThreshold: /hours_ago\s*>\s*36/.test(alerting) })
      .toEqual({ has36hThreshold: true });
    // Must create critical alert
    expect({ createsCriticalAlert: alerting.includes("type: 'aggregation_stale'") && alerting.includes("severity: 'critical'") })
      .toEqual({ createsCriticalAlert: true });
    // Must be called in the periodic loop
    expect({ calledPeriodically: /checkAggregationStaleness\(\)/.test(alerting) })
      .toEqual({ calledPeriodically: true });
  });

  it('checkEmptySaasProfiles must detect SaaS sites with empty default profile config', () => {
    const alerting = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/alerting.service.ts'),
      'utf8'
    );
    // Must have the method
    expect({ hasMethod: alerting.includes('checkEmptySaasProfiles') })
      .toEqual({ hasMethod: true });
    // Must filter by site_type = 'saas'
    expect({ filtersSaas: alerting.includes("site_type = 'saas'") })
      .toEqual({ filtersSaas: true });
    // Must check for empty configuration (null, {}, or missing key fields)
    expect({ checksEmpty: alerting.includes("= '{}'::jsonb") })
      .toEqual({ checksEmpty: true });
    // Must check for missing sponsors/categories/timeCategories
    expect({ checksMissingKeys: alerting.includes('sponsors') && alerting.includes('categories') && alerting.includes('timeCategories') })
      .toEqual({ checksMissingKeys: true });
    // Must create warning alert with type saas_empty_profile
    expect({ createsAlert: alerting.includes("type: 'saas_empty_profile'") && alerting.includes("severity: 'warning'") })
      .toEqual({ createsAlert: true });
    // Must be called in the periodic loop
    expect({ calledPeriodically: /checkEmptySaasProfiles\(\)/.test(alerting) })
      .toEqual({ calledPeriodically: true });
  });

  it('checkStuckDeployments must auto-fail update deployments stuck >2h', () => {
    const alerting = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/alerting.service.ts'),
      'utf8'
    );
    // Must mark stuck update deployments as failed (not just create alert)
    expect({ autoFailsStuck: alerting.includes("SET status = 'failed'") && alerting.includes('minutesStuck >= 120') })
      .toEqual({ autoFailsStuck: true });
    // Must include descriptive error_message with timeout info
    expect({ hasTimeoutMessage: alerting.includes('Timeout') && alerting.includes('aucune réponse') })
      .toEqual({ hasTimeoutMessage: true });
  });
});
