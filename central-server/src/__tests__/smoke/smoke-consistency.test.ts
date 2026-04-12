/**
 * Smoke tests — consistency domain
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
  process.env.PORT = '3100';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('Raspberry Pi config conventions', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Route file consistency', () => {
  it('server.ts mounts all route files', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Site-sponsor route conflict guard', () => {
  it('advertiser-sites.routes.ts must NOT declare GET /sites/:id/sponsors (shadowed by site-sponsor.routes.ts)', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const filePath = path.join(repoRoot, 'central-server', 'src', 'routes', 'site-sponsor.routes.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    expect({
      hasListRoute: /router\.get\(\s*['"]\/:siteId\/sponsors['"]/m.test(content),
    }).toEqual({
      hasListRoute: true,
    });
  });
});

describe('Handler file consistency', () => {
  it('all handler files export at least one function', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Repository file consistency', () => {
  it('all non-test repository files are re-exported from index', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Auth helper functions', () => {
  it('isAdmin correctly identifies admin roles', async () => {
    const { isAdmin } = await import('../../middleware/auth');
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('super_admin')).toBe(true);
    expect(isAdmin('operator')).toBe(false);
    expect(isAdmin('viewer')).toBe(false);
    expect(isAdmin('advertiser')).toBe(false);
  });

  it('isInternal correctly identifies internal roles', async () => {
    const { isInternal } = await import('../../middleware/auth');
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

describe('ADR README ↔ file consistency', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Sync-agent command handler symmetry', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const agentPath = path.join(repoRoot, 'raspberry', 'sync-agent', 'src', 'services', 'command-dispatch.js');

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
