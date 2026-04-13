/**
 * Smoke tests — saas domain
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
  process.env.PORT = '3108';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('club portal SaaS actions placement guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const dashPath = path.join(repoRoot, 'central-dashboard/src/app/features/club-portal/club-dashboard.component.ts');
  const loopPath = path.join(repoRoot, 'central-dashboard/src/app/features/club-portal/club-loop.component.ts');

  let dash: string;
  let loop: string;
  beforeAll(() => {
    dash = fs.readFileSync(dashPath, 'utf8');
    loop = fs.readFileSync(loopPath, 'utf8');
  });

  it('club-dashboard renders <app-club-saas-actions>', () => {
    expect(dash.includes('<app-club-saas-actions')).toBe(true);
  });

  it('club-dashboard renders the help modal + button', () => {
    expect(dash.includes('<app-club-help-modal')).toBe(true);
    expect(dash.includes("'clubPortal.help'")).toBe(true);
  });

  it('club-loop must NOT render <app-club-saas-actions>', () => {
    expect(loop.includes('<app-club-saas-actions')).toBe(false);
  });

  it('club-loop must NOT render the help modal', () => {
    expect(loop.includes('<app-club-help-modal')).toBe(false);
  });
});

describe('Club Portal video ownership guards', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');

  const videoRepoPath = path.join(repoRoot, 'central-server/src/repositories/video.repository.ts');
  const contentControllerPath = path.join(repoRoot, 'central-server/src/controllers/content.controller.ts');

  let videoRepoContent: string;
  let contentControllerContent: string;

  beforeAll(() => {
    videoRepoContent = fs.readFileSync(videoRepoPath, 'utf8');
    contentControllerContent = fs.readFileSync(contentControllerPath, 'utf8');
  });

  // --- findVideoById must SELECT uploaded_for_site_id ---
  it('findVideoById must SELECT uploaded_for_site_id (ownership guard depends on it)', () => {
    const findFn = videoRepoContent.match(
      /async findVideoById[\s\S]*?(?=\n  async \w|$)/
    );
    expect(findFn).not.toBeNull();
    expect({
      selectsUploadedForSiteId: findFn![0].includes('uploaded_for_site_id'),
    }).toEqual({
      selectsUploadedForSiteId: true,
    });
  });

  // --- deleteVideo must have ownership guard ---
  it('deleteVideo must check uploaded_for_site_id for club users', () => {
    const deleteFn = contentControllerContent.match(
      /export const deleteVideo[\s\S]*?(?=export const \w|$)/
    );
    expect(deleteFn).not.toBeNull();
    expect({
      checksOwnership: deleteFn![0].includes('uploaded_for_site_id'),
    }).toEqual({
      checksOwnership: true,
    });
  });

  // --- deleteVideo must block NEOPRO category ---
  it('deleteVideo must block NEOPRO category for club users', () => {
    const deleteFn = contentControllerContent.match(
      /export const deleteVideo[\s\S]*?(?=export const \w|$)/
    );
    expect(deleteFn).not.toBeNull();
    expect({
      blocksNeopro: /category.*NEOPRO|NEOPRO.*category/i.test(deleteFn![0]),
    }).toEqual({
      blocksNeopro: true,
    });
  });

  // --- updateVideo must have ownership guard ---
  it('updateVideo must check uploaded_for_site_id for club users', () => {
    const updateFn = contentControllerContent.match(
      /export const updateVideo[\s\S]*?(?=export const \w|$)/
    );
    expect(updateFn).not.toBeNull();
    expect({
      checksOwnership: updateFn![0].includes('uploaded_for_site_id'),
    }).toEqual({
      checksOwnership: true,
    });
  });

  // --- updateVideo must block NEOPRO category ---
  it('updateVideo must block NEOPRO category for club users', () => {
    const updateFn = contentControllerContent.match(
      /export const updateVideo[\s\S]*?(?=export const \w|$)/
    );
    expect(updateFn).not.toBeNull();
    expect({
      blocksNeopro: /category.*NEOPRO|NEOPRO.*category/i.test(updateFn![0]),
    }).toEqual({
      blocksNeopro: true,
    });
  });

  // --- createVideo must auto-tag uploaded_for_site_id for club users ---
  it('createVideo must auto-tag uploaded_for_site_id for club users', () => {
    const createFn = contentControllerContent.match(
      /export const createVideo[\s\S]*?(?=export const \w|$)/
    );
    expect(createFn).not.toBeNull();
    expect({
      autoTags: createFn![0].includes('uploaded_for_site_id'),
    }).toEqual({
      autoTags: true,
    });
  });
});

describe('SaaS mode guards (ADR-037)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // --- saas.controller.ts must verify site_type === 'saas' ---
  it('saas.controller.ts must check site_type before serving config', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'saas.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      checksSiteType: content.includes("site_type !== 'saas'"),
    }).toEqual({
      checksSiteType: true,
    });
  });

  // --- saas.routes.ts must have rate limiting on all routes ---
  it('saas.routes.ts must apply rate limiting on all routes', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'routes', 'saas.routes.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const routeLines = content.split('\n').filter(l => /router\.(get|post|put|delete)\(/.test(l));
    const allHaveRateLimit = routeLines.every(l => l.includes('RateLimit') || l.includes('rateLimit'));
    expect({
      routeCount: routeLines.length,
      allHaveRateLimit,
    }).toEqual({
      routeCount: 3,
      allHaveRateLimit: true,
    });
  });

  // --- saas.routes.ts must have validateParams on all routes ---
  it('saas.routes.ts must have validateParams on all routes', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'routes', 'saas.routes.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const routeLines = content.split('\n').filter(l => /router\.(get|post|put|delete)\(/.test(l));
    const allHaveValidation = routeLines.every(l => l.includes('validateParams'));
    expect({
      allHaveValidation,
    }).toEqual({
      allHaveValidation: true,
    });
  });

  // --- site.repository.ts must support siteType in create ---
  it('site.repository.ts create() must accept siteType parameter', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'site.repository.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSiteTypeInCreate: content.includes('siteType') && content.includes('site_type'),
    }).toEqual({
      hasSiteTypeInCreate: true,
    });
  });

  // --- sites.controller.ts must pass site_type to repository ---
  it('sites.controller.ts createSite must forward site_type to repository', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'sites.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const createFn = content.match(/export const createSite[\s\S]*?(?=export const \w|$)/);
    expect(createFn).not.toBeNull();
    expect({
      extractsSiteType: createFn![0].includes('site_type'),
      passesSiteType: createFn![0].includes('siteType'),
    }).toEqual({
      extractsSiteType: true,
      passesSiteType: true,
    });
  });

  // --- Site type in types/index.ts ---
  it('Site interface must include site_type field', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'types', 'index.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSiteType: content.includes('site_type'),
    }).toEqual({
      hasSiteType: true,
    });
  });

  // --- saas.controller.ts must resolve video URLs via getVideoUrl ---
  it('saas.controller.ts must resolve video paths to public URLs', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'saas.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      importsGetVideoUrl: content.includes('getVideoUrl'),
      hasResolveFunction: content.includes('resolveVideoUrl'),
    }).toEqual({
      importsGetVideoUrl: true,
      hasResolveFunction: true,
    });
  });

  // --- resolveVideoUrl must use storagePathMap for DB lookup ---
  // After FTP sharding (ADR-048), filename ≠ storage_path. resolveVideoUrl must
  // lookup the real storage_path via storagePathMap before building the FTP URL.
  it('resolveVideoUrl must accept storagePathMap and use it for URL resolution', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'saas.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const resolveFunction = content.match(/function resolveVideoUrl\([\s\S]*?\n\}/);
    expect(resolveFunction).not.toBeNull();
    expect({
      acceptsStoragePathMap: /storagePathMap/.test(resolveFunction![0]),
      usesMapGet: /storagePathMap\.get/.test(resolveFunction![0]),
      stripsPathPrefix: /\.split\(['"]\/['"]\)\.pop\(\)/.test(resolveFunction![0]),
    }).toEqual({
      acceptsStoragePathMap: true,
      usesMapGet: true,
      stripsPathPrefix: true,
    });
  });

  // --- Thumbnails must be applied BEFORE URL resolution in getSaasConfig ---
  // After storage_path resolution, paths contain UUID-based storage paths that
  // don't match filenames in thumbnailMap → thumbnails are lost.
  it('getSaasConfig must apply thumbnails before resolveVideoUrls', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'saas.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const thumbsBeforeResolve = content.indexOf('applyThumbnails(sponsors') < content.indexOf('resolveVideoUrls(sponsors');
    const thumbsBeforeResolveProfile = content.indexOf('applyThumbnails(sponsors', content.indexOf('getSaasProfileConfig')) < content.indexOf('resolveVideoUrls(sponsors', content.indexOf('getSaasProfileConfig'));
    expect({
      thumbsBeforeResolveInGetConfig: thumbsBeforeResolve,
      thumbsBeforeResolveInProfileConfig: thumbsBeforeResolveProfile,
    }).toEqual({
      thumbsBeforeResolveInGetConfig: true,
      thumbsBeforeResolveInProfileConfig: true,
    });
  });

  // --- config-profiles.controller must emit saas-config-updated ---
  it('config-profiles.controller must emit saas-config-updated after updateProfileConfiguration', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'config-profiles.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      emitsSaasConfigUpdated: content.includes('emitSaasConfigUpdated'),
      checksSiteType: /site_type\s*===\s*'saas'/.test(content),
    }).toEqual({
      emitsSaasConfigUpdated: true,
      checksSiteType: true,
    });
  });

  // --- previewConfigDiff must fallback to config_profiles for SaaS ---
  it('previewConfigDiff must read baseline from config_profiles for SaaS sites', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'config-history.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      importsConfigProfileRepo: content.includes('configProfileRepository'),
      checksForSaas: /site_type\s*===\s*'saas'/.test(content),
      findDefaultForSite: content.includes('findDefaultForSite'),
    }).toEqual({
      importsConfigProfileRepo: true,
      checksForSaas: true,
      findDefaultForSite: true,
    });
  });

  // --- local-broadcast.service must use ReplaySubject for commands ---
  it('local-broadcast.service must use ReplaySubject for command$ to buffer during SaaS display init', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'services', 'local-broadcast.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      importsReplaySubject: content.includes('ReplaySubject'),
      commandUsesReplay: /command\$\s*=\s*new ReplaySubject/.test(content),
    }).toEqual({
      importsReplaySubject: true,
      commandUsesReplay: true,
    });
  });

  // --- videoRepository must have findStoragePathsByFilenames ---
  it('videoRepository must expose findStoragePathsByFilenames for SaaS URL resolution', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'video.repository.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content.includes('findStoragePathsByFilenames')).toBe(true);
  });

  // --- environment.saas.ts must exist ---
  it('environment.saas.ts must exist for Angular SaaS build', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'environments', 'environment.saas.ts');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  // --- angular.json must have saas build configuration ---
  it('angular.json must include saas build configuration', () => {
    const angularJsonPath = path.join(repoRoot, 'angular.json');
    const content = fs.readFileSync(angularJsonPath, 'utf8');
    const angularJson = JSON.parse(content);
    const raspberryBuildConfigs = angularJson?.projects?.raspberry?.architect?.build?.configurations;
    expect({
      hasSaasConfig: !!raspberryBuildConfigs?.saas,
    }).toEqual({
      hasSaasConfig: true,
    });
  });

  // --- Dashboard Site model must include site_type ---
  it('Dashboard Site model must include site_type', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'core', 'models', 'index.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSiteType: content.includes('site_type'),
    }).toEqual({
      hasSiteType: true,
    });
  });
});

describe('SaaS deployment pipeline guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // --- Joi createSite schema accepts site_type ---
  it('Joi createSite schema must accept site_type with valid pi/saas/demo', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'middleware', 'validation.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    // Extract the portion of the file from createSite up to the next top-level schema key
    const createSiteStart = content.indexOf('createSite:');
    const updateSiteStart = content.indexOf('updateSite:');
    expect(createSiteStart).toBeGreaterThan(-1);
    expect(updateSiteStart).toBeGreaterThan(createSiteStart);
    const createSiteBlock = content.slice(createSiteStart, updateSiteStart);
    expect({
      hasSiteType: createSiteBlock.includes('site_type'),
      hasValidValues: createSiteBlock.includes("valid('pi', 'saas', 'demo')"),
    }).toEqual({
      hasSiteType: true,
      hasValidValues: true,
    });
  });

  // --- Joi createSite allows empty hardware_model ---
  it('Joi createSite hardware_model must allow empty string', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'middleware', 'validation.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const createSiteStart = content.indexOf('createSite:');
    const updateSiteStart = content.indexOf('updateSite:');
    expect(createSiteStart).toBeGreaterThan(-1);
    const createSiteBlock = content.slice(createSiteStart, updateSiteStart);
    expect({
      hardwareModelAllowsEmpty:
        createSiteBlock.includes('hardware_model') && createSiteBlock.includes(".allow('')"),
    }).toEqual({
      hardwareModelAllowsEmpty: true,
    });
  });

  // --- Joi updateSite schema accepts site_type ---
  it('Joi updateSite schema must accept site_type', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'middleware', 'validation.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    // Extract from updateSite to the next top-level schema key (createGroup)
    const updateSiteStart = content.indexOf('updateSite:');
    const createGroupStart = content.indexOf('createGroup:');
    expect(updateSiteStart).toBeGreaterThan(-1);
    expect(createGroupStart).toBeGreaterThan(updateSiteStart);
    const updateSiteBlock = content.slice(updateSiteStart, createGroupStart);
    expect({
      hasSiteType: updateSiteBlock.includes('site_type'),
    }).toEqual({
      hasSiteType: true,
    });
  });

  // --- Dashboard .htaccess excludes /saas/ from SPA catch-all ---
  it('Dashboard .htaccess must exclude /saas/ from SPA catch-all', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', '.htaccess');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSaasExclusion: content.includes('^saas(/.*)?$'),
    }).toEqual({
      hasSaasExclusion: true,
    });
  });

  // --- SaaS .htaccess rewrites to /saas/index.html ---
  it('SaaS .htaccess must rewrite all requests to /saas/index.html', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'saas-htaccess');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      rewritesToSaasIndex: content.includes('/saas/index.html'),
    }).toEqual({
      rewritesToSaasIndex: true,
    });
  });

  // --- angular.json SaaS config excludes admin assets ---
  it('angular.json SaaS build config must not include raspberry/admin/public assets', () => {
    const filePath = path.join(repoRoot, 'angular.json');
    const content = fs.readFileSync(filePath, 'utf8');
    const angularJson = JSON.parse(content);
    const saasConfig = angularJson?.projects?.raspberry?.architect?.build?.configurations?.saas;
    expect(saasConfig).toBeDefined();
    const assetsStr = JSON.stringify(saasConfig.assets ?? []);
    expect({
      excludesAdminPublic: !assetsStr.includes('raspberry/admin/public'),
    }).toEqual({
      excludesAdminPublic: true,
    });
  });

  // --- angular.json SaaS config excludes demo-configs glob ---
  it('angular.json SaaS build config must not glob all assets (would include demo-configs)', () => {
    const filePath = path.join(repoRoot, 'angular.json');
    const content = fs.readFileSync(filePath, 'utf8');
    const angularJson = JSON.parse(content);
    const saasConfig = angularJson?.projects?.raspberry?.architect?.build?.configurations?.saas;
    expect(saasConfig).toBeDefined();
    const assetsStr = JSON.stringify(saasConfig.assets ?? []);
    // The SaaS build should NOT have a wildcard glob from raspberry/src/assets (which contains demo-configs)
    const hasWildcardSrcAssets =
      saasConfig.assets?.some(
        (a: { glob?: string; input?: string }) =>
          typeof a === 'object' &&
          a.glob === '**/*' &&
          typeof a.input === 'string' &&
          a.input.includes('raspberry/src/assets') &&
          !a.input.includes('i18n'),
      ) ?? false;
    expect({
      excludesDemoConfigsGlob: !hasWildcardSrcAssets,
    }).toEqual({
      excludesDemoConfigsGlob: true,
    });
  });

  // --- angular.json SaaS config must include raspberry/public assets (logo, favicon, manifest) ---
  it('angular.json SaaS build config must include raspberry/public assets glob', () => {
    const filePath = path.join(repoRoot, 'angular.json');
    const content = fs.readFileSync(filePath, 'utf8');
    const angularJson = JSON.parse(content);
    const saasConfig = angularJson?.projects?.raspberry?.architect?.build?.configurations?.saas;
    expect(saasConfig).toBeDefined();
    // The SaaS build MUST include raspberry/public (contains neopro-logo-white.png, favicon.ico, manifest.json)
    // Without it, the splash screen logo request hits the SPA catch-all and returns index.html (422 + wrong MIME)
    const hasPublicAssets =
      saasConfig.assets?.some(
        (a: { glob?: string; input?: string }) =>
          typeof a === 'object' && a.glob === '**/*' && a.input === 'raspberry/public',
      ) ?? false;
    expect({
      includesPublicAssets: hasPublicAssets,
    }).toEqual({
      includesPublicAssets: true,
    });
  });

  // --- release.yml deploy-saas depends on deploy-dashboard ---
  it('release.yml deploy-saas job must declare deploy-dashboard as a dependency', () => {
    const filePath = path.join(repoRoot, '.github', 'workflows', 'release.yml');
    const content = fs.readFileSync(filePath, 'utf8');
    // Extract deploy-saas block and verify it needs deploy-dashboard
    const deploySaasBlock = content.match(/deploy-saas:[\s\S]*?(?=\n  \w|$)/);
    expect(deploySaasBlock).not.toBeNull();
    expect({
      needsDeployDashboard: deploySaasBlock![0].includes('deploy-dashboard'),
    }).toEqual({
      needsDeployDashboard: true,
    });
  });

  // --- Home component uses routerLink not href for navigation ---
  it('home.component.html must use routerLink="/remote" not href="/remote"', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'components', 'home', 'home.component.html');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasRouterLinkRemote: content.includes('routerLink="/remote"'),
      hasHrefRemote: content.includes('href="/remote"'),
    }).toEqual({
      hasRouterLinkRemote: true,
      hasHrefRemote: false,
    });
  });

  // --- All environment files declare saasMode ---
  it('all environment files must declare saasMode property', () => {
    const envDir = path.join(repoRoot, 'raspberry', 'src', 'environments');
    const envFiles = fs.readdirSync(envDir).filter(f => f.startsWith('environment') && f.endsWith('.ts'));
    expect(envFiles.length).toBeGreaterThan(0);
    const missing = envFiles.filter(f => {
      const content = fs.readFileSync(path.join(envDir, f), 'utf8');
      return !content.includes('saasMode');
    });
    expect({
      filesWithoutSaasMode: missing,
    }).toEqual({
      filesWithoutSaasMode: [],
    });
  });

  // --- Home component hides admin link in SaaS mode ---
  it('home.component.html must hide admin link with *ngIf="!isSaasMode"', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'components', 'home', 'home.component.html');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSaasModeGuardOnAdmin: content.includes('*ngIf="!isSaasMode"'),
    }).toEqual({
      hasSaasModeGuardOnAdmin: true,
    });
  });

  // --- version.ts exists and exports APP_VERSION ---
  it('version.ts must exist and export APP_VERSION', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'version.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      exportsAppVersion: content.includes('export const APP_VERSION'),
    }).toEqual({
      exportsAppVersion: true,
    });
  });

  // --- build-raspberry.sh injects version into version.ts ---
  it('build-raspberry.sh must inject RELEASE_VERSION into version.ts before Angular build', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'scripts', 'build-raspberry.sh');
    const content = fs.readFileSync(filePath, 'utf8');
    const versionInjectionIndex = content.indexOf('version.ts');
    const angularBuildIndex = content.indexOf('ng build raspberry');
    expect({
      hasVersionInjection: versionInjectionIndex > -1,
      injectionBeforeBuild: versionInjectionIndex < angularBuildIndex,
    }).toEqual({
      hasVersionInjection: true,
      injectionBeforeBuild: true,
    });
  });

  // --- release.yml injects version for SaaS build ---
  it('release.yml must inject version into version.ts before SaaS build', () => {
    const filePath = path.join(repoRoot, '.github', 'workflows', 'release.yml');
    const content = fs.readFileSync(filePath, 'utf8');
    const versionInjectionIndex = content.indexOf('Inject version into SaaS app');
    const saasBuildIndex = content.indexOf('Build SaaS app');
    expect({
      hasVersionInjection: versionInjectionIndex > -1,
      injectionBeforeBuild: versionInjectionIndex < saasBuildIndex,
    }).toEqual({
      hasVersionInjection: true,
      injectionBeforeBuild: true,
    });
  });

  // --- Home component displays APP_VERSION ---
  it('home.component.ts must import and expose APP_VERSION', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'components', 'home', 'home.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      importsAppVersion: content.includes("import { APP_VERSION }"),
      exposesVersion: content.includes('appVersion'),
    }).toEqual({
      importsAppVersion: true,
      exposesVersion: true,
    });
  });

  // --- Home component must propagate siteId in SaaS navigation links ---
  it('home.component must propagate ?site= queryParam on remote and tv links in SaaS mode', () => {
    const tsPath = path.join(repoRoot, 'raspberry', 'src', 'app', 'components', 'home', 'home.component.ts');
    const htmlPath = path.join(repoRoot, 'raspberry', 'src', 'app', 'components', 'home', 'home.component.html');
    const tsContent = fs.readFileSync(tsPath, 'utf8');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    expect({
      importsSaasConfigService: tsContent.includes('SaasConfigService'),
      hasSiteQueryParams: tsContent.includes('siteQueryParams'),
      callsGetSiteId: tsContent.includes('getSiteId()'),
      remoteUsesQueryParams: htmlContent.includes('routerLink="/remote"') && htmlContent.includes('siteQueryParams'),
      tvUsesQueryParams: htmlContent.includes('routerLink="/tv"') && htmlContent.includes('siteQueryParams'),
    }).toEqual({
      importsSaasConfigService: true,
      hasSiteQueryParams: true,
      callsGetSiteId: true,
      remoteUsesQueryParams: true,
      tvUsesQueryParams: true,
    });
  });

  // --- auth.service.ts isAuthenticated() must bypass token check in SaaS mode ---
  it('auth.service.ts isAuthenticated() must return true in SaaS mode without token', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'services', 'auth.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    // Extract the isAuthenticated method body
    const methodMatch = content.match(/isAuthenticated\(\)[\s\S]*?return this\.checkAuth/);
    expect({
      methodExists: !!methodMatch,
      checksSaasModeBeforeCheckAuth: !!methodMatch && methodMatch[0].includes('saasMode'),
    }).toEqual({
      methodExists: true,
      checksSaasModeBeforeCheckAuth: true,
    });
  });

  // --- Socket service emits saas-register with version ---
  it('socket.service.ts must emit saas-register with APP_VERSION in SaaS mode', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'services', 'socket.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      importVersion: content.includes("import { APP_VERSION }"),
      emitsSaasRegister: content.includes("'saas-register'"),
      includesVersion: content.includes('version: APP_VERSION'),
    }).toEqual({
      importVersion: true,
      emitsSaasRegister: true,
      includesVersion: true,
    });
  });

  // --- Central server handles saas-register and updates software_version ---
  it('central socket.service.ts must handle saas-register and update software_version', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'services', 'socket.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      handlesSaasRegister: content.includes("'saas-register'"),
      updatesSoftwareVersion: content.includes('software_version') && content.includes('saas'),
    }).toEqual({
      handlesSaasRegister: true,
      updatesSoftwareVersion: true,
    });
  });

  // --- deployment.service.ts must handle SaaS sites without sending deploy_video to Pi ---
  it('deployment.service.ts must skip sendOrQueue for SaaS sites and complete immediately', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'services', 'deployment.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSiteTypeInTarget: content.includes('siteType'),
      hasSaasCheck: content.includes("siteType === 'saas'"),
      hasImmediateComplete: content.includes("status = 'completed'") && content.includes('allSaas'),
    }).toEqual({
      hasSiteTypeInTarget: true,
      hasSaasCheck: true,
      hasImmediateComplete: true,
    });
  });

  // --- alerting.service.ts must exclude SaaS sites from stuck deployment detection ---
  it('alerting checkStuckDeployments must join sites table to exclude SaaS', () => {
    const checksPath = path.join(repoRoot, 'central-server', 'src', 'services', 'alerting-checks.service.ts');
    const content = fs.readFileSync(checksPath, 'utf8');
    // The stuck deployment query must filter out SaaS sites
    expect({
      joinsOrFiltersSiteType: content.includes("site_type != 'saas'") || content.includes("site_type <> 'saas'"),
    }).toEqual({
      joinsOrFiltersSiteType: true,
    });
  });

  // --- alerting must auto-complete SaaS deployments as defense-in-depth ---
  it('alerting must auto-complete SaaS deployments stuck in_progress/pending', () => {
    const checksPath = path.join(repoRoot, 'central-server', 'src', 'services', 'alerting-checks.service.ts');
    const content = fs.readFileSync(checksPath, 'utf8');
    expect({
      hasSaasAutoComplete: content.includes("site_type = 'saas'") && content.includes('saasAutoCompleted'),
    }).toEqual({
      hasSaasAutoComplete: true,
    });
  });
});

describe('SaaS site-detail dashboard guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // --- site-detail.component.ts must have isSaas getter ---
  it('site-detail.component.ts must have isSaas getter for conditional rendering', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'site-detail.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasIsSaasGetter: content.includes('get isSaas'),
      checksSiteType: content.includes("site_type === 'saas'"),
    }).toEqual({
      hasIsSaasGetter: true,
      checksSiteType: true,
    });
  });

  // --- site-detail.component.html must use isSaas conditional ---
  it('site-detail.component.html must conditionally render SaaS vs Pi view', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'site-detail.component.html');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasIsSaasConditional: content.includes('isSaas'),
      hasSaasMetricsGrid: content.includes('saas-metrics-grid'),
      hasSaasAccessBlock: content.includes('saas-access-block') || content.includes('saas-url-row'),
    }).toEqual({
      hasIsSaasConditional: true,
      hasSaasMetricsGrid: true,
      hasSaasAccessBlock: true,
    });
  });

  // --- site-detail.component.html must hide debug tab for SaaS ---
  it('site-detail.component.html must hide debug tab for SaaS sites', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'site-detail.component.html');
    const content = fs.readFileSync(filePath, 'utf8');
    // The debug tab button must be wrapped in a @if (!isSaas) or *ngIf="!isSaas" guard
    // Look for the pattern: isSaas guard followed by debug tab within ~200 chars
    const hasIsSaasBeforeDebugTab = /!isSaas[\s\S]{0,200}debug/.test(content);
    expect({
      debugTabGuarded: hasIsSaasBeforeDebugTab,
    }).toEqual({
      debugTabGuarded: true,
    });
  });

  // --- socket.service.ts must expose getSaasClientCount ---
  it('central socket.service.ts must expose getSaasClientCount method', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'services', 'socket.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasGetSaasClientCount: content.includes('getSaasClientCount'),
    }).toEqual({
      hasGetSaasClientCount: true,
    });
  });

  // --- site-fleet-dashboard.controller.ts must return saasMetrics for SaaS sites ---
  it('site-fleet-dashboard.controller.ts must return saasMetrics in dashboard data', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'site-fleet-dashboard.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSaasMetrics: content.includes('saasMetrics'),
      checksSiteType: content.includes("site_type") && content.includes("saas"),
    }).toEqual({
      hasSaasMetrics: true,
      checksSiteType: true,
    });
  });

  // --- site-fleet-dashboard.controller.ts must include lastOtaDeployment + activeAlertsCount in saasMetrics ---
  it('site-fleet-dashboard.controller.ts must return lastOtaDeployment and activeAlertsCount', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'site-fleet-dashboard.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasLastOtaDeployment: content.includes('lastOtaDeployment'),
      hasActiveAlertsCount: content.includes('activeAlertsCount'),
      callsFindLastForSite: content.includes('findLastForSite'),
      callsCountActiveForSite: content.includes('countActiveForSite'),
    }).toEqual({
      hasLastOtaDeployment: true,
      hasActiveAlertsCount: true,
      callsFindLastForSite: true,
      callsCountActiveForSite: true,
    });
  });

  // --- alert.repository.ts must have countActiveForSite method ---
  it('alert.repository.ts must have countActiveForSite', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'alert.repository.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasCountActiveForSite: content.includes('countActiveForSite'),
      queriesActiveStatus: content.includes("status = 'active'"),
    }).toEqual({
      hasCountActiveForSite: true,
      queriesActiveStatus: true,
    });
  });

  // --- software-update.repository.ts must have findLastForSite method ---
  it('software-update.repository.ts must have findLastForSite', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'software-update.repository.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasFindLastForSite: content.includes('findLastForSite'),
      joinsUpdateDeployments: content.includes('update_deployments'),
      handlesGroupTarget: content.includes('site_groups'),
    }).toEqual({
      hasFindLastForSite: true,
      joinsUpdateDeployments: true,
      handlesGroupTarget: true,
    });
  });

  // --- club-dashboard.component.ts must render OTA badge and active alerts ---
  it('club-dashboard must render OTA badge and active alerts card', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'club-portal', 'club-dashboard.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasOtaBadge: content.includes('ota-badge'),
      hasLastOtaDeployment: content.includes('lastOtaDeployment'),
      hasActiveAlertsCount: content.includes('activeAlertsCount'),
      hasAlertCount: content.includes('alert-count'),
    }).toEqual({
      hasOtaBadge: true,
      hasLastOtaDeployment: true,
      hasActiveAlertsCount: true,
      hasAlertCount: true,
    });
  });

  // --- analytics.repository.ts must have SaaS metric methods ---
  it('analytics.repository.ts must have countSessions, countSponsorsDisplayed, getCompletionRate', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'analytics.repository.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasCountSessions: content.includes('countSessions'),
      hasCountSponsorsDisplayed: content.includes('countSponsorsDisplayed'),
      hasGetCompletionRate: content.includes('getCompletionRate'),
    }).toEqual({
      hasCountSessions: true,
      hasCountSponsorsDisplayed: true,
      hasGetCompletionRate: true,
    });
  });

  // --- site.repository.ts findConnectionInfo must return site_type ---
  it('site.repository.ts findConnectionInfo must include site_type in query', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'site.repository.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const findConnInfoFn = content.match(/findConnectionInfo[\s\S]*?(?=async \w|$)/);
    expect(findConnInfoFn).not.toBeNull();
    expect({
      hasSiteType: findConnInfoFn![0].includes('site_type'),
    }).toEqual({
      hasSiteType: true,
    });
  });

  // --- site-detail.component.html must hide connection indicator for SaaS ---
  it('site-detail.component.html must guard app-connection-indicator with !isSaas', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'site-detail.component.html');
    const content = fs.readFileSync(filePath, 'utf8');
    // The connection indicator in the header must be wrapped in @if (!isSaas)
    const hasGuardBeforeIndicator = /!isSaas[\s\S]{0,200}app-connection-indicator/.test(content);
    expect({
      connectionIndicatorGuarded: hasGuardBeforeIndicator,
    }).toEqual({
      connectionIndicatorGuarded: true,
    });
  });
});

describe('SaaS Pi-local API guards (no /api/site-info or /api/hdmi-status on SaaS)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // --- HdmiStatusService must skip polling in SaaS mode ---
  it('hdmi-status.service.ts must have saasMode guard in constructor to skip polling', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'services', 'hdmi-status.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSaasModeCheck: content.includes('saasMode'),
      constructorReturnsEarlyForSaas: /constructor[\s\S]*?saasMode[\s\S]*?return[\s\S]*?startPolling/.test(content),
    }).toEqual({
      hasSaasModeCheck: true,
      constructorReturnsEarlyForSaas: true,
    });
  });

  // --- tv.component.ts loadSiteId must use SaasConfigService in SaaS mode ---
  it('tv.component.ts loadSiteId must guard with isSaasMode and use SaasConfigService', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'components', 'tv', 'tv.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract loadSiteId method
    const methodStart = content.indexOf('private loadSiteId()');
    expect(methodStart).toBeGreaterThan(-1);
    const methodBlock = content.slice(methodStart, methodStart + 600);

    expect({
      checksSaasMode: methodBlock.includes('isSaasMode()'),
      usesSaasConfigServiceGetSiteId: methodBlock.includes('getSiteId()'),
      setsAnalyticsSiteIdForSaas: methodBlock.includes('setSiteId'),
      returnsEarlyForSaas: /isSaasMode[\s\S]*?return;/.test(methodBlock),
    }).toEqual({
      checksSaasMode: true,
      usesSaasConfigServiceGetSiteId: true,
      setsAnalyticsSiteIdForSaas: true,
      returnsEarlyForSaas: true,
    });
  });

  // --- tv.component.ts must import and inject SaasConfigService ---
  it('tv.component.ts must inject SaasConfigService', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'components', 'tv', 'tv.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      importsSaasConfigService: content.includes("import { SaasConfigService }"),
      injectsSaasConfigService: content.includes('inject(SaasConfigService)'),
    }).toEqual({
      importsSaasConfigService: true,
      injectsSaasConfigService: true,
    });
  });
});

describe('OTA deployment must exclude SaaS sites', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('dashboard OTA selector must use deployableSites (not raw sites)', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'updates', 'updates-management.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      usesDeployableSites: content.includes('deployableSites'),
      filtersSaas: content.includes("site_type !== 'saas'"),
      doesNotUseRawSitesInSelector: !/ \*ngFor="let site of sites"/.test(content),
    }).toEqual({
      usesDeployableSites: true,
      filtersSaas: true,
      doesNotUseRawSitesInSelector: true,
    });
  });

  it('server getTargetSites must exclude SaaS sites from OTA targets', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'services', 'update-deployment.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      siteQueryExcludesSaas: content.includes("site_type != 'saas'"),
      groupQueryExcludesSaas: content.includes("s.site_type != 'saas'") || content.includes("site_type != 'saas'"),
    }).toEqual({
      siteQueryExcludesSaas: true,
      groupQueryExcludesSaas: true,
    });
  });
});

describe('Video library duplicate detection scope', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('isDuplicate must be computed in applyFilters() not processVideos()', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'video-library', 'video-library.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract processVideos method body
    const processStart = content.indexOf('private processVideos()');
    const applyStart = content.indexOf('applyFilters(): void');
    expect(processStart).toBeGreaterThan(-1);
    expect(applyStart).toBeGreaterThan(processStart);

    const processBody = content.slice(processStart, applyStart);
    const applyBody = content.slice(applyStart);

    expect({
      processVideosHasNoChecksumCounts: !processBody.includes('checksumCounts'),
      processVideosHasNoIsDuplicate: !processBody.includes('isDuplicate'),
      applyFiltersHasChecksumCounts: applyBody.includes('checksumCounts'),
      applyFiltersHasIsDuplicate: applyBody.includes('isDuplicate'),
    }).toEqual({
      processVideosHasNoChecksumCounts: true,
      processVideosHasNoIsDuplicate: true,
      applyFiltersHasChecksumCounts: true,
      applyFiltersHasIsDuplicate: true,
    });
  });
});

describe('SaaS video deploy guard in site-content-tab', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('site-content-tab must have siteType @Input', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'site-content-tab', 'site-content-tab.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content.includes("@Input() siteType")).toBe(true);
  });

  it('onVideoDeploy must guard against SaaS sites', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'site-content-tab', 'site-content-tab.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract onVideoDeploy method definition (not template binding)
    const methodStart = content.indexOf('onVideoDeploy(video:');
    expect(methodStart).toBeGreaterThan(-1);
    const methodBlock = content.slice(methodStart, methodStart + 400);

    expect({
      checksSaasType: methodBlock.includes("siteType === 'saas'"),
      returnsEarly: methodBlock.includes('return'),
    }).toEqual({
      checksSaasType: true,
      returnsEarly: true,
    });
  });

  it('site-detail must pass siteType to site-content-tab', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'site-detail.component.html');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content.includes('[siteType]=')).toBe(true);
  });
});

describe('Upload empty file guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('createVideo must reject file.size === 0', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'content.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // Find the createVideo function body (between export const createVideo and export const createVideos)
    const createVideoStart = content.indexOf('export const createVideo = ');
    const createVideosStart = content.indexOf('export const createVideos = ');
    expect(createVideoStart).toBeGreaterThan(-1);
    expect(createVideosStart).toBeGreaterThan(createVideoStart);

    const createVideoBody = content.slice(createVideoStart, createVideosStart);

    expect({
      checksFileSize: createVideoBody.includes('file.size === 0') || createVideoBody.includes('!file.size'),
      returns400: createVideoBody.includes('0 octets'),
    }).toEqual({
      checksFileSize: true,
      returns400: true,
    });
  });

  it('createVideos (bulk) must skip file.size === 0', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'content.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // Find the createVideos function body
    const createVideosStart = content.indexOf('export const createVideos = ');
    const getVideosStart = content.indexOf('export const getVideos = ') || content.indexOf('export const getVideo = ');
    expect(createVideosStart).toBeGreaterThan(-1);

    const createVideosBody = content.slice(createVideosStart, getVideosStart > createVideosStart ? getVideosStart : createVideosStart + 3000);

    expect({
      checksFileSize: createVideosBody.includes('file.size === 0') || createVideosBody.includes('!file.size'),
      reportsError: createVideosBody.includes('0 octets'),
    }).toEqual({
      checksFileSize: true,
      reportsError: true,
    });
  });
});

describe('Video library formatBytes null handling', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('formatBytes must return dash for null/undefined, not 0 B', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'video-library', 'video-library.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract formatBytes method
    const methodStart = content.indexOf('formatBytes(bytes:');
    expect(methodStart).toBeGreaterThan(-1);
    const methodBlock = content.slice(methodStart, methodStart + 300);

    expect({
      returnsHyphenForNull: methodBlock.includes("return '-'"),
      separatesNullFromZero: methodBlock.includes("bytes <= 0") && methodBlock.includes("return '0 B'"),
    }).toEqual({
      returnsHyphenForNull: true,
      separatesNullFromZero: true,
    });
  });
});

describe('PostgreSQL BIGINT type parser', () => {
  it('database.ts must import setTypeParser from pg-types', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'config', 'database.ts'),
      'utf8',
    );
    expect(content).toContain("import { setTypeParser } from 'pg-types'");
  });

  it('database.ts must parse BIGINT (OID 20) as number', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'config', 'database.ts'),
      'utf8',
    );
    expect(content).toContain('setTypeParser(20,');
    expect(content).toContain('parseInt(val, 10)');
    expect(content).toContain('Number.isSafeInteger');
  });
});

describe('SaaS child component guards (Pi-specific UI hidden for SaaS)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const dashboardRoot = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites');

  // --- video-library must have siteType @Input and hide Pi elements ---
  it('video-library must have siteType @Input and hide Pi-specific UI', () => {
    const filePath = path.join(dashboardRoot, 'components', 'video-library', 'video-library.component.ts');
    const htmlPath = filePath.replace('.component.ts', '.component.html');
    const content = fs.readFileSync(filePath, 'utf8') + '\n' + (fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '');
    expect({
      hasSiteTypeInput: content.includes("@Input() siteType"),
      hidesStorageBar: content.includes("siteType !== 'saas'") && content.includes('storage'),
      hidesDeployButton: /siteType !== 'saas'[\s\S]{0,200}deploy/.test(content),
      hidesStatusColumn: /siteType !== 'saas'[\s\S]{0,60}Statut/.test(content),
      hidesPiLegend: /siteType !== 'saas'[\s\S]{0,100}Sur le Pi/.test(content),
    }).toEqual({
      hasSiteTypeInput: true,
      hidesStorageBar: true,
      hidesDeployButton: true,
      hidesStatusColumn: true,
      hidesPiLegend: true,
    });
  });

  // --- video-manager must propagate siteType to video-library ---
  it('video-manager must have siteType @Input and pass it to video-library', () => {
    const filePath = path.join(dashboardRoot, 'components', 'site-content-tab', 'video-manager', 'video-manager.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSiteTypeInput: content.includes("@Input() siteType"),
      passesSiteTypeToLibrary: content.includes('[siteType]="siteType"'),
      guardsDeletePi: /siteType !== 'saas'[\s\S]{0,100}deleteCanPi/.test(content),
    }).toEqual({
      hasSiteTypeInput: true,
      passesSiteTypeToLibrary: true,
      guardsDeletePi: true,
    });
  });

  // --- deployment-status must hide Pi-specific sections for SaaS ---
  it('deployment-status must have siteType @Input and hide pending deployments for SaaS', () => {
    const filePath = path.join(dashboardRoot, 'components', 'site-content-tab', 'deployment-status', 'deployment-status.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSiteTypeInput: content.includes("@Input() siteType"),
      guardsPendingDeployments: /siteType !== 'saas'[\s\S]{0,100}pendingDeployments/.test(content),
    }).toEqual({
      hasSiteTypeInput: true,
      guardsPendingDeployments: true,
    });
  });

  // --- site-profiles-tab must hide Pi offline warning for SaaS ---
  it('site-profiles-tab must hide Pi offline warning and sync banner for SaaS', () => {
    const filePath = path.join(dashboardRoot, 'components', 'site-profiles-tab', 'site-profiles-tab.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      guardsPiOfflineWarning: /site_type !== 'saas'[\s\S]{0,200}Pi hors-ligne/.test(content),
      guardsSyncBanner: /site_type !== 'saas'[\s\S]{0,200}profils au Pi/.test(content),
    }).toEqual({
      guardsPiOfflineWarning: true,
      guardsSyncBanner: true,
    });
  });

  // --- loop-manager must not show ⏳ suffix or cloud badges for SaaS ---
  it('loop-manager must have siteType @Input and hide deploy status suffix and cloud badges for SaaS', () => {
    const filePath = path.join(dashboardRoot, 'components', 'loop-manager', 'loop-manager.component.ts');
    const htmlPath = filePath.replace('.component.ts', '.component.html');
    const content = fs.readFileSync(filePath, 'utf8') + '\n' + (fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '');
    expect({
      hasSiteTypeInput: content.includes("@Input() siteType"),
      guardsSuffix: content.includes("siteType !== 'saas'") && content.includes('isOnPi'),
      guardsCloudHint: /siteType !== 'saas'[\s\S]{0,30}isCloudVideo[\s\S]{0,50}Sera déployée/.test(content),
      guardsCloudBadge: /siteType !== 'saas'[\s\S]{0,30}isCloudVideo[\s\S]{0,50}cloud-badge/.test(content) || /siteType !== 'saas'[\s\S]{0,30}isCloudVideo/.test(content),
    }).toEqual({
      hasSiteTypeInput: true,
      guardsSuffix: true,
      guardsCloudHint: true,
      guardsCloudBadge: true,
    });
  });

  // --- site-settings-tab must hide hotspot config for SaaS ---
  it('site-settings-tab must have isSaas getter and hide hotspot for SaaS', () => {
    const tsPath = path.join(dashboardRoot, 'components', 'site-settings-tab', 'site-settings-tab.component.ts');
    const htmlPath = path.join(dashboardRoot, 'components', 'site-settings-tab', 'site-settings-tab.component.html');
    const tsContent = fs.readFileSync(tsPath, 'utf8');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    expect({
      hasIsSaasGetter: tsContent.includes('get isSaas'),
      hidesHotspot: /\*ngIf="!isSaas"[\s\S]{0,50}/.test(htmlContent) && htmlContent.includes('Hotspot WiFi'),
      hidesLocalQrMode: /\*ngIf="!isSaas"[\s\S]{0,50}/.test(htmlContent) && htmlContent.includes('Mode Local'),
    }).toEqual({
      hasIsSaasGetter: true,
      hidesHotspot: true,
      hidesLocalQrMode: true,
    });
  });

  // --- site-content-tab must hide "Rafraîchir depuis le Pi" for SaaS ---
  it('site-content-tab must hide Pi-specific refresh button for SaaS', () => {
    const filePath = path.join(dashboardRoot, 'components', 'site-content-tab', 'site-content-tab.component.ts');
    const htmlPath = filePath.replace('.component.ts', '.component.html');
    const content = fs.readFileSync(filePath, 'utf8') + '\n' + (fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '');
    expect({
      guardsRefreshButton: /siteType !== 'saas'[\s\S]{0,500}Rafra/.test(content),
      passesSiteTypeToVideoManager: content.includes('[siteType]="siteType"'),
      passesSiteTypeToDeploymentStatus: /app-deployment-status[\s\S]{0,200}\[siteType\]/.test(content),
      passesSiteTypeToConfigEditor: /app-config-editor[\s\S]{0,200}\[siteType\]/.test(content),
    }).toEqual({
      guardsRefreshButton: true,
      passesSiteTypeToVideoManager: true,
      passesSiteTypeToDeploymentStatus: true,
      passesSiteTypeToConfigEditor: true,
    });
  });

  // --- config-editor must propagate siteType to loop-manager ---
  it('config-editor must have siteType @Input and pass it to loop-manager', () => {
    const filePath = path.join(dashboardRoot, 'components', 'site-content-tab', 'config-editor', 'config-editor.component.ts');
    const htmlPath = filePath.replace('.component.ts', '.component.html');
    const content = fs.readFileSync(filePath, 'utf8') + '\n' + (fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '');
    expect({
      hasSiteTypeInput: content.includes("@Input() siteType"),
      passesSiteTypeToLoopManager: /app-loop-manager[\s\S]{0,200}\[siteType\]/.test(content),
    }).toEqual({
      hasSiteTypeInput: true,
      passesSiteTypeToLoopManager: true,
    });
  });

  // --- site-detail debug tab panel must be guarded (not just button) ---
  it('site-detail debug tab panel must have !isSaas guard', () => {
    const filePath = path.join(dashboardRoot, 'site-detail.component.html');
    const content = fs.readFileSync(filePath, 'utf8');
    // The debug tab panel (not just the button) must have the guard
    const debugPanelGuarded = /!isSaas[\s\S]{0,20}class="tab-panel"[\s\S]{0,50}app-site-debug-tab/.test(content);
    expect({
      debugPanelGuarded,
    }).toEqual({
      debugPanelGuarded: true,
    });
  });

  // --- site-detail SaaS État must NOT show "En attente de connexion" ---
  it('site-detail SaaS État must not show "En attente de connexion" for version field', () => {
    const filePath = path.join(dashboardRoot, 'site-detail.component.html');
    const content = fs.readFileSync(filePath, 'utf8');
    // Extract the SaaS section (between "SaaS État view" and "Pi État view")
    const saasSection = content.match(/SaaS État view[\s\S]*?Pi État view/)?.[0] || '';
    expect({
      noAttenteConnexion: !saasSection.includes('En attente de connexion'),
      hasDerniereSession: saasSection.includes('Dernière session'),
      noDerniereConnexion: !saasSection.includes('Dernière connexion'),
    }).toEqual({
      noAttenteConnexion: true,
      hasDerniereSession: true,
      noDerniereConnexion: true,
    });
  });

  // --- standalone config-editor must have siteType and SaaS label guards ---
  it('standalone config-editor must have siteType @Input and SaaS-aware labels', () => {
    const tsPath = path.join(dashboardRoot, 'config-editor', 'config-editor.component.ts');
    const htmlPath = path.join(dashboardRoot, 'config-editor', 'config-editor.component.html');
    const tsContent = fs.readFileSync(tsPath, 'utf8');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    expect({
      hasSiteTypeInput: tsContent.includes("@Input() siteType"),
      hasIsSaasGetter: tsContent.includes('get isSaas'),
      hidesMergeReplace: htmlContent.includes('*ngIf="!isSaas"') && htmlContent.includes('Mode de déploiement'),
      hasSaasFooterLabels: htmlContent.includes('Modifications non enregistrées') && htmlContent.includes('Configuration à jour'),
      hasSaasSaveButton: /isSaas[\s\S]{0,30}common\.save/.test(htmlContent),
    }).toEqual({
      hasSiteTypeInput: true,
      hasIsSaasGetter: true,
      hidesMergeReplace: true,
      hasSaasFooterLabels: true,
      hasSaasSaveButton: true,
    });
  });

  // --- site-settings-tab must use SaaS-appropriate notification messages ---
  it('site-settings-tab must use "enregistrée" notifications for SaaS instead of "déployée"', () => {
    const tsPath = path.join(dashboardRoot, 'components', 'site-settings-tab', 'site-settings-tab.component.ts');
    const htmlPath = path.join(dashboardRoot, 'components', 'site-settings-tab', 'site-settings-tab.component.html');
    const tsContent = fs.readFileSync(tsPath, 'utf8');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    expect({
      clubAuthSaasNotif: tsContent.includes('isSaas') && tsContent.includes('Configuration enregistrée avec succès'),
      overlaySaasNotif: /isSaas[\s\S]{0,5}\?[\s\S]{0,50}overlay enregistrée/.test(tsContent),
      watermarkSkipsDeployAsset: /!this\.isSaas[\s\S]{0,30}watermarkConfig\.cloudUrl/.test(tsContent),
      watermarkSaasNotif: tsContent.includes('watermark enregistrée'),
      overlaySaveLabel: /isSaas[\s\S]{0,80}common\.save[\s\S]{0,80}common\.deploy/.test(htmlContent),
    }).toEqual({
      clubAuthSaasNotif: true,
      overlaySaasNotif: true,
      watermarkSkipsDeployAsset: true,
      watermarkSaasNotif: true,
      overlaySaveLabel: true,
    });
  });
});

describe('SaaS config save flow', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const dashboardRoot = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites');

  it('deployment-status must use "save" labels for SaaS and have confirmSaveSaas method', () => {
    const filePath = path.join(dashboardRoot, 'components', 'site-content-tab', 'deployment-status', 'deployment-status.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSaveLabelButton: /siteType === 'saas'[\s\S]{0,50}common\.save/.test(content),
      hasSavingLabel: /siteType === 'saas'[\s\S]{0,50}common\.saving/.test(content),
      hasConfirmSaveLabel: /siteType === 'saas'[\s\S]{0,50}common\.confirmSave/.test(content),
      hasConfirmSaveSaas: content.includes('confirmSaveSaas'),
      hasModeHiddenForSaas: /class="mode-selector"[\s\S]{0,30}siteType !== 'saas'/.test(content),
      skipsSyncProfilesForSaas: /siteType === 'saas'[\s\S]{0,200}Configuration enregistree/.test(content),
    }).toEqual({
      hasSaveLabelButton: true,
      hasSavingLabel: true,
      hasConfirmSaveLabel: true,
      hasConfirmSaveSaas: true,
      hasModeHiddenForSaas: true,
      skipsSyncProfilesForSaas: true,
    });
  });

  it('sites.service must have saveConfigDirect method', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'core', 'services', 'sites.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('saveConfigDirect');
  });

  it('site.repository must have updateLocalConfigMirror method', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'site.repository.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('updateLocalConfigMirror');
  });

  it('sites.routes must have PUT /:id/config with saveConfigDirect and validation', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'routes', 'sites.routes.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasPutConfig: /router\.put[\s\S]{0,20}'\/:id\/config'/.test(content),
      hasSaveConfigDirect: content.includes('saveConfigDirect'),
      hasValidation: /validate\(schemas\.saveConfigDirect\)/.test(content),
      hasParamValidation: /validateParams\(paramSchemas\.id\)[\s\S]{0,200}saveConfigDirect/.test(content),
    }).toEqual({
      hasPutConfig: true,
      hasSaveConfigDirect: true,
      hasValidation: true,
      hasParamValidation: true,
    });
  });

  it('saveConfigDirect controller must verify site_type is saas', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'config-history.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSaveConfigDirect: content.includes('saveConfigDirect'),
      checksSiteType: /site_type !== 'saas'/.test(content),
      savesToLocalConfigMirror: content.includes('updateLocalConfigMirror'),
    }).toEqual({
      hasSaveConfigDirect: true,
      checksSiteType: true,
      savesToLocalConfigMirror: true,
    });
  });

  it('saveConfigDirect controller must support merge mode via mergeLocalConfigMirror', () => {
    const controllerPath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'config-history.controller.ts');
    const controllerContent = fs.readFileSync(controllerPath, 'utf8');
    const repoPath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'site.repository.ts');
    const repoContent = fs.readFileSync(repoPath, 'utf8');
    expect({
      controllerChecksMergeMode: controllerContent.includes("mode === 'merge'"),
      controllerCallsMerge: controllerContent.includes('mergeLocalConfigMirror'),
      repoHasMergeMethod: repoContent.includes('mergeLocalConfigMirror'),
      repoUsesCOALESCE: /mergeLocalConfigMirror[\s\S]{0,200}COALESCE/.test(repoContent),
    }).toEqual({
      controllerChecksMergeMode: true,
      controllerCallsMerge: true,
      repoHasMergeMethod: true,
      repoUsesCOALESCE: true,
    });
  });

  it('saveConfigDirect validation schema must accept optional mode field', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'middleware', 'validation.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasMode: /saveConfigDirect[\s\S]{0,200}mode[\s\S]{0,50}merge/.test(content),
    }).toEqual({
      hasMode: true,
    });
  });

  it('site-settings-data.service must use profile-based saves for SaaS (not local_config_mirror)', () => {
    const filePath = path.join(dashboardRoot, 'components', 'site-settings-tab', 'site-settings-data.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      saveClubAuthHasIsSaas: /saveClubAuth\([^)]*isSaas/.test(content),
      toggleLiveScoreHasIsSaas: /toggleLiveScore\([^)]*isSaas/.test(content),
      saveOverlayConfigHasIsSaas: /saveOverlayConfig\([^)]*isSaas/.test(content),
      saveWatermarkConfigHasIsSaas: /saveWatermarkConfig\([^)]*isSaas/.test(content),
      hasMergeDefaultProfile: content.includes('mergeDefaultProfileConfig'),
      usesGetProfiles: content.includes('getProfiles'),
      usesUpdateProfileConfig: content.includes('updateProfileConfiguration'),
      doesNotUseSaveConfigDirect: !content.includes('saveConfigDirect'),
    }).toEqual({
      saveClubAuthHasIsSaas: true,
      toggleLiveScoreHasIsSaas: true,
      saveOverlayConfigHasIsSaas: true,
      saveWatermarkConfigHasIsSaas: true,
      hasMergeDefaultProfile: true,
      usesGetProfiles: true,
      usesUpdateProfileConfig: true,
      doesNotUseSaveConfigDirect: true,
    });
  });

  it('deployment-status confirmSaveSaas must use profile-based save (not saveConfigDirect)', () => {
    const filePath = path.join(dashboardRoot, 'components', 'site-content-tab', 'deployment-status', 'deployment-status.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      usesGetProfiles: /confirmSaveSaas[\s\S]{0,500}getProfiles/.test(content),
      usesUpdateProfileConfig: /confirmSaveSaas[\s\S]{0,500}updateProfileConfiguration/.test(content),
      doesNotUseSaveConfigDirect: !/confirmSaveSaas[\s\S]{0,500}saveConfigDirect/.test(content),
    }).toEqual({
      usesGetProfiles: true,
      usesUpdateProfileConfig: true,
      doesNotUseSaveConfigDirect: true,
    });
  });

  it('config-profile.repository must have mergeConfiguration method with JSONB merge', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'config-profile.repository.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasMergeMethod: content.includes('mergeConfiguration'),
      usesJsonbConcat: /mergeConfiguration[\s\S]{0,300}COALESCE[\s\S]{0,100}\|\|/.test(content),
    }).toEqual({
      hasMergeMethod: true,
      usesJsonbConcat: true,
    });
  });

  it('updateProfileConfiguration controller must support merge mode', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'config-profiles.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      checksMergeMode: content.includes("mode === 'merge'"),
      callsMergeConfiguration: content.includes('mergeConfiguration'),
    }).toEqual({
      checksMergeMode: true,
      callsMergeConfiguration: true,
    });
  });

  it('config-editor must have JSON toggle view showing full config', () => {
    const filePath = path.join(dashboardRoot, 'components', 'site-content-tab', 'config-editor', 'config-editor.component.ts');
    const htmlPath = filePath.replace('.component.ts', '.component.html');
    const content = fs.readFileSync(filePath, 'utf8') + '\n' + (fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '');
    // syncJsonFromConfig must serialize this.config (full), not a subset
    const showsFullConfig = /JSON\.stringify\(this\.config,/.test(content);
    const showsSubset = /configSubset\s*=\s*\{/.test(content);
    expect({
      hasShowJson: content.includes('showJson'),
      hasToggleJsonView: content.includes('toggleJsonView'),
      hasJsonTextarea: content.includes('json-textarea'),
      hasSyncJsonFromConfig: content.includes('syncJsonFromConfig'),
      showsFullConfig,
      showsSubset,
    }).toEqual({
      hasShowJson: true,
      hasToggleJsonView: true,
      hasJsonTextarea: true,
      hasSyncJsonFromConfig: true,
      showsFullConfig: true,
      showsSubset: false,
    });
  });

  // --- SaaS config loading regression prevention (v3.127.10) ---

  // --- app.routes.ts must use SaasConfigService in SaaS mode, not /configuration.json ---
  it('app.routes.ts getConfiguration resolver must use SaasConfigService for SaaS mode', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'app.routes.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      importsSaasConfigService: content.includes("import { SaasConfigService }"),
      injectsSaasConfigService: content.includes('inject(SaasConfigService)'),
      checksSaasMode: content.includes('saasConfigService.isSaasMode()'),
      callsGetSelectedConfiguration: content.includes('saasConfigService.getSelectedConfiguration()'),
    }).toEqual({
      importsSaasConfigService: true,
      injectsSaasConfigService: true,
      checksSaasMode: true,
      callsGetSelectedConfiguration: true,
    });
  });

  // --- app.routes.ts must NOT fetch /configuration.json in SaaS mode ---
  it('app.routes.ts SaaS branch must not fall through to /configuration.json', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'app.routes.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    // The SaaS mode block must appear BEFORE the /configuration.json fallback
    const saasCheckIndex = content.indexOf('saasConfigService.isSaasMode()');
    const configJsonIndex = content.indexOf("'/configuration.json'");
    expect({
      saasCheckBeforeConfigJson: saasCheckIndex > -1 && configJsonIndex > -1 && saasCheckIndex < configJsonIndex,
    }).toEqual({
      saasCheckBeforeConfigJson: true,
    });
  });

  // --- auth.service.ts must skip local configuration.json in SaaS mode ---
  it('auth.service.ts must skip /configuration.json fetch in SaaS mode', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'services', 'auth.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      importsSaasEnvironment: content.includes("import { environment }"),
      checksSaasMode: content.includes('saasMode'),
      autoAuthenticatesSaas: content.includes('isAuthenticatedSubject.next(true)'),
    }).toEqual({
      importsSaasEnvironment: true,
      checksSaasMode: true,
      autoAuthenticatesSaas: true,
    });
  });

  // --- login.component.ts must skip local configuration.json fetch in SaaS mode ---
  it('login.component.ts loadSiteInfo must skip fetch in SaaS mode', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'components', 'login', 'login.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      checksSaasMode: content.includes('saasMode'),
    }).toEqual({
      checksSaasMode: true,
    });
  });

  // --- saas.controller.ts must NOT return 404 for empty config profiles ---
  it('saas.controller.ts getSaasConfig must not 404 on empty configuration object', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'saas.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    // The guard that returned 404 for empty config was removed — a fresh site should get valid defaults
    expect({
      noEmptyConfigGuard: !content.includes("Object.keys(configuration).length === 0"),
    }).toEqual({
      noEmptyConfigGuard: true,
    });
  });

  it('CLAUDE.md must have regression rule against writing SaaS config to local_config_mirror', () => {
    const claudeMd = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8')
      + fs.readdirSync(path.join(repoRoot, '.claude', 'rules')).map(f => fs.readFileSync(path.join(repoRoot, '.claude', 'rules', f), 'utf8')).join('\n');
    expect({
      hasLocalConfigMirrorRule: claudeMd.includes('local_config_mirror') && claudeMd.includes('config_profiles') && claudeMd.includes('mergeDefaultProfileConfig'),
      hasAdr037Ref: claudeMd.includes('ADR-037'),
    }).toEqual({
      hasLocalConfigMirrorRule: true,
      hasAdr037Ref: true,
    });
  });

  // --- Club portal security: cloud video filter ---
  it('site-fleet.controller.ts must filter cloud videos for club users', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'site-fleet.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasExtractHelper: /function\s+extractConfigVideoFilenames/.test(content),
      checksClubRole: /req\.user\?\.role\s*===\s*'club'/.test(content),
      filtersByOwnership: /uploaded_for_site_id\s*===\s*id/.test(content),
      filtersByNeoproCategory: /toUpperCase\(\)\s*===\s*'NEOPRO'/.test(content),
      filtersByConfigFilenames: /configFilenames\.has/.test(content),
      saasProfileFallback: /site\.site_type\s*===\s*'saas'/.test(content)
        && /configProfileRepository\.findDefaultForSite/.test(content),
    }).toEqual({
      hasExtractHelper: true,
      checksClubRole: true,
      filtersByOwnership: true,
      filtersByNeoproCategory: true,
      filtersByConfigFilenames: true,
      saasProfileFallback: true,
    });
  });

  it('site.repository.findWithLocalContent must return site_type', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'repositories', 'site.repository.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      typeHasField: /SiteLocalContentRow[\s\S]*?site_type:\s*string/.test(content),
      querySelectsField: /findWithLocalContent[\s\S]*?SELECT[^;]*site_type/.test(content),
    }).toEqual({
      typeHasField: true,
      querySelectsField: true,
    });
  });

  // --- Club portal security: dashboard guards ---
  it('site-content-tab must guard JSON editor and profile selector for club users', () => {
    const dir = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'site-content-tab');
    const collectTs = (d: string): string => {
      let acc = '';
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) acc += collectTs(full);
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.html')) acc += '\n' + fs.readFileSync(full, 'utf8');
      }
      return acc;
    };
    const tabContent = collectTs(dir);
    expect({
      hasIsClubGetter: /get\s+isClub\s*\(\)/.test(tabContent),
      passesIsClubUserToEditor: /\[isClubUser\]="isClub"/.test(tabContent),
      hidesProfileSelectorForClub: /contentProfiles\.length\s*>\s*0\s*&&\s*\(!isClub\s*\|\|\s*canUseMultiProfiles\)/.test(tabContent),
      jsonToggleHiddenForClub: /config\s*&&\s*!isClubUser/.test(tabContent),
      analyticsCategoriesHiddenForClub: /\*ngIf="!isClubUser"/.test(tabContent),
    }).toEqual({
      hasIsClubGetter: true,
      passesIsClubUserToEditor: true,
      hidesProfileSelectorForClub: true,
      jsonToggleHiddenForClub: true,
      analyticsCategoriesHiddenForClub: true,
    });
  });

  it('loop-manager must lock NEOPRO videos and hide owner radios for club users', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'loop-manager', 'loop-manager.component.ts');
    const htmlPath = filePath.replace('.component.ts', '.component.html');
    const content = fs.readFileSync(filePath, 'utf8') + '\n' + (fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '');
    expect({
      hasInput: /@Input\(\)\s+isClubUser/.test(content),
      // isNeoproVideo() treats undefined/absent owner as neopro (owner !== 'club')
      hasIsNeoproHelper: /isNeoproVideo\(/.test(content) && /owner\s*!==\s*'club'/.test(content),
      disablesVideoSelect: /\[disabled\]="isClubUser\s*&&\s*isNeoproVideo\(video\)"/.test(content),
      hidesRemoveForNeopro: /\*ngIf="!\(isClubUser\s*&&\s*isNeoproVideo\(video\)\)"/.test(content),
      showsLockBadge: /isClubUser\s*&&\s*isNeoproVideo\(video\)/.test(content),
    }).toEqual({
      hasInput: true,
      hasIsNeoproHelper: true,
      disablesVideoSelect: true,
      hidesRemoveForNeopro: true,
      showsLockBadge: true,
    });
  });

  // --- SaaS dropdown labels ---
  it('site-content-tab videoOptionGroups must use SaaS-friendly labels for SaaS sites', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'site-content-tab', 'site-content-tab.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      checksSiteType: /isSaas\s*=\s*this\.siteType\s*===\s*'saas'/.test(content),
      saasOnPiLabel: /isSaas\s*\?\s*'Disponibles'\s*:\s*'Sur le Pi'/.test(content),
      saasCloudLabel: /isSaas\s*\?\s*'Bibliothèque cloud'\s*:\s*'Cloud \(à déployer\)'/.test(content),
    }).toEqual({
      checksSiteType: true,
      saasOnPiLabel: true,
      saasCloudLabel: true,
    });
  });

  // --- club-loop must propagate siteType so SaaS/club guards work ---
  it('club-loop must read site_type from API and propagate to site-content-tab', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'club-portal', 'club-loop.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasSiteTypeProp: /siteType\s*=\s*''/.test(content) || /siteType:\s*string/.test(content),
      readsFromApi: /site\.site_type/.test(content),
      passesToTab: /\[siteType\]="siteType"/.test(content),
    }).toEqual({
      hasSiteTypeProp: true,
      readsFromApi: true,
      passesToTab: true,
    });
  });

  // --- CLAUDE.md must enforce club portal security rules ---
  it('CLAUDE.md must have club portal security regression rules', () => {
    const claudeMd = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8')
      + fs.readdirSync(path.join(repoRoot, '.claude', 'rules')).map(f => fs.readFileSync(path.join(repoRoot, '.claude', 'rules', f), 'utf8')).join('\n');
    expect({
      hasClubFilterRule: claudeMd.includes('extractConfigVideoFilenames')
        && claudeMd.includes('uploaded_for_site_id'),
      hasNeoproLockRule: claudeMd.includes('NEOPRO') && claudeMd.includes('isClubUser'),
      hasSaasProfileFallbackRule: claudeMd.includes('configProfileRepository.findDefaultForSite')
        && claudeMd.includes('site_type'),
    }).toEqual({
      hasClubFilterRule: true,
      hasNeoproLockRule: true,
      hasSaasProfileFallbackRule: true,
    });
  });

  // ---------------------------------------------------------------------------
  // SaaS analytics & screen count regressions (session 2026-04-08)
  // ---------------------------------------------------------------------------

  // Bug: remote tab was counted as a screen (sent clientType 'saas-tv')
  it('raspberry socket.service.ts must detect /remote route and send saas-remote clientType', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'services', 'socket.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      detectsRemotePath: content.includes('/remote'),
      sendsSaasRemote: content.includes("'saas-remote'"),
      sendsSaasTv: content.includes("'saas-tv'"),
    }).toEqual({
      detectsRemotePath: true,
      sendsSaasRemote: true,
      sendsSaasTv: true,
    });
  });

  // Bug: getSaasClientCount counted all room members including remote tabs
  it('central socket.service.ts getSaasClientCount must filter by clientType saas-tv', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'services', 'socket.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      filtersByclientType: content.includes("clientType") && content.includes("'saas-tv'"),
      iteratesRoom: content.includes('for (const socketId of room)'),
    }).toEqual({
      filtersByclientType: true,
      iteratesRoom: true,
    });
  });

  // Bug: SaaS TV never started recording → trackVideoStart returned early → 0 analytics
  it('tv.component.ts must auto-start recording and session in SaaS mode at boot', () => {
    const filePath = path.join(repoRoot, 'raspberry', 'src', 'app', 'components', 'tv', 'tv.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      startsRecordingInSaas: content.includes('saasMode') && content.includes('startRecording'),
      startsSessionInSaas: content.includes('saasMode') && content.includes('startSession'),
    }).toEqual({
      startsRecordingInSaas: true,
      startsSessionInSaas: true,
    });
  });

  // Bug: getSaasConfig ne appelait pas enrichConfigWithAnalyticsMetadata
  // → vidéos sans video_id/sponsor_id/analytics_category → sponsor analytics perdues
  it('saas.controller.ts must call enrichConfigWithAnalyticsMetadata in getSaasConfig and getSaasProfileConfig', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'saas.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const enrichCallCount = (content.match(/enrichConfigWithAnalyticsMetadata/g) || []).length;
    expect({
      importsEnrich: content.includes("import { enrichConfigWithAnalyticsMetadata }"),
      // Called in getSaasConfig + getSaasProfileConfig = minimum 3 occurrences (import + 2 calls)
      calledAtLeastTwice: enrichCallCount >= 3,
    }).toEqual({
      importsEnrich: true,
      calledAtLeastTwice: true,
    });
  });

  it('i18n files must have saving and confirmSave keys', () => {
    const frPath = path.join(repoRoot, 'central-dashboard', 'src', 'assets', 'i18n', 'fr.json');
    const enPath = path.join(repoRoot, 'central-dashboard', 'src', 'assets', 'i18n', 'en.json');
    const esPath = path.join(repoRoot, 'central-dashboard', 'src', 'assets', 'i18n', 'es.json');
    const fr = JSON.parse(fs.readFileSync(frPath, 'utf8'));
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const es = JSON.parse(fs.readFileSync(esPath, 'utf8'));
    expect({
      frSaving: fr.common.saving,
      frConfirmSave: fr.common.confirmSave,
      enSaving: en.common.saving,
      enConfirmSave: en.common.confirmSave,
      esSaving: es.common.saving,
      esConfirmSave: es.common.confirmSave,
    }).toEqual({
      frSaving: 'Enregistrement...',
      frConfirmSave: "Confirmer l'enregistrement",
      enSaving: 'Saving...',
      enConfirmSave: 'Confirm save',
      esSaving: 'Guardando...',
      esConfirmSave: 'Confirmar guardado',
    });
  });

  // --- ADR-039 Phase 2 gating regression guards ---
  // Lock in the feature gates added in Phase 2 so a future refactor cannot
  // silently reintroduce free access to premium/pro features.

  it('feature-gate.service must map Phase 2 features to their tiers (ADR-039)', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'core', 'services', 'feature-gate.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      imageToVideoClub: /image_to_video:\s*'club'/.test(content),
      multiProfilesPro: /multi_profiles:\s*'pro'/.test(content),
      weightedRotationPro: /weighted_rotation:\s*'pro'/.test(content),
      analyticsAdvancedPremium: /analytics_advanced:\s*'premium'/.test(content),
      secondaryDisplayPremium: /secondary_display:\s*'premium'/.test(content),
      remoteDiagnosticPremium: /remote_diagnostic:\s*'premium'/.test(content),
    }).toEqual({
      imageToVideoClub: true,
      multiProfilesPro: true,
      weightedRotationPro: true,
      analyticsAdvancedPremium: true,
      secondaryDisplayPremium: true,
      remoteDiagnosticPremium: true,
    });
  });

  it('FeatureGateService.canAccess must check feature_overrides before tier', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'core', 'services', 'feature-gate.service.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      checksOverrides: /feature_overrides/.test(content),
      checksBeforeTier: /Check per-site override first/.test(content),
      returnsTrueOnOverride: /overrides\[feature\]\s*===\s*true/.test(content),
    }).toEqual({
      checksOverrides: true,
      checksBeforeTier: true,
      returnsTrueOnOverride: true,
    });
  });

  it('requireSiteTier middleware must check feature_overrides via hasFeatureOverride', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'middleware', 'require-site-tier.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasFeatureOverrideExported: /export function hasFeatureOverride/.test(content),
      checksOverrideBeforeTier: content.indexOf('hasFeatureOverride') < content.indexOf('siteLevel < requiredLevel'),
      acceptsFeatureKey: /requireSiteTier\s*=\s*\(minTier:\s*SiteTier,\s*featureKey\?/.test(content),
    }).toEqual({
      hasFeatureOverrideExported: true,
      checksOverrideBeforeTier: true,
      acceptsFeatureKey: true,
    });
  });

  it('updateSite controller must only allow super_admin to set feature_overrides', () => {
    const filePath = path.join(repoRoot, 'central-server', 'src', 'controllers', 'sites.controller.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      extractsOverrides: /feature_overrides/.test(content),
      guardsSuperAdmin: /feature_overrides.*super_admin|super_admin.*feature_overrides/.test(content),
    }).toEqual({
      extractsOverrides: true,
      guardsSuperAdmin: true,
    });
  });

  it('loop-manager must pass feature_overrides to canAccess for weighted_rotation', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'loop-manager', 'loop-manager.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      hasFeatureOverridesInput: /@Input\(\)\s*featureOverrides/.test(content),
      passesOverridesToGate: /feature_overrides:\s*this\.featureOverrides/.test(content),
    }).toEqual({
      hasFeatureOverridesInput: true,
      passesOverridesToGate: true,
    });
  });

  it('site-settings-tab must show feature overrides UI only for super_admin', () => {
    const htmlPath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'site-settings-tab', 'site-settings-tab.component.html');
    const tsPath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'site-settings-tab', 'site-settings-tab.component.ts');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const ts = fs.readFileSync(tsPath, 'utf8');
    expect({
      guardedBySuperAdmin: /\*ngIf="isSuperAdmin"/.test(html),
      hasSuperAdminGetter: /get isSuperAdmin/.test(ts),
      hasSaveMethod: /saveFeatureOverrides/.test(ts),
      importsAuthService: /AuthService/.test(ts),
    }).toEqual({
      guardedBySuperAdmin: true,
      hasSuperAdminGetter: true,
      hasSaveMethod: true,
      importsAuthService: true,
    });
  });

  it('club-analytics must gate 90-day window and CSV/PDF export behind analytics_advanced (Phase 2.9)', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'analytics', 'club-analytics.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      injectsGate: /FeatureGateService/.test(content),
      hasGetter: /canUseAnalyticsAdvanced/.test(content)
        && /canAccess\('analytics_advanced'/.test(content),
      gates90Days: /value="90"\s*\[disabled\]="!canUseAnalyticsAdvanced"/.test(content),
      guardsExportData: /if\s*\(!this\.canUseAnalyticsAdvanced\)\s*return/.test(content),
    }).toEqual({
      injectsGate: true,
      hasGetter: true,
      gates90Days: true,
      guardsExportData: true,
    });
  });

  it('video-library must gate secondary variant button behind secondary_display (Phase 2.10)', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'video-library', 'video-library.component.ts');
    const htmlPath = filePath.replace('.component.ts', '.component.html');
    const content = fs.readFileSync(filePath, 'utf8') + '\n' + (fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '');
    expect({
      importsGate: /FeatureGateService/.test(content),
      hasSubscriptionPlanInput: /@Input\(\)\s*subscriptionPlan/.test(content),
      hasVariantEmitter: /@Output\(\)\s*videoVariant\s*=\s*new EventEmitter/.test(content),
      hasGetter: /canUseSecondaryDisplay/.test(content)
        && /canAccess\('secondary_display'/.test(content),
      buttonGuarded: /\*ngIf="[\s\S]*?canUseSecondaryDisplay/.test(content),
      methodGuarded: /if\s*\(!this\.canUseSecondaryDisplay\)\s*return/.test(content),
    }).toEqual({
      importsGate: true,
      hasSubscriptionPlanInput: true,
      hasVariantEmitter: true,
      hasGetter: true,
      buttonGuarded: true,
      methodGuarded: true,
    });
  });

  it('video-manager must expose secondary variant modal and propagate subscriptionPlan (Phase 2.10)', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'sites', 'components', 'site-content-tab', 'video-manager', 'video-manager.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      importsVariantPanel: /VideoVariantPanelComponent/.test(content),
      hasSubscriptionPlanInput: /@Input\(\)\s*subscriptionPlan/.test(content),
      passesToLibrary: /\[subscriptionPlan\]="subscriptionPlan"/.test(content),
      hasVariantTarget: /variantTarget/.test(content),
      hasVariantEmitter: /secondaryVariantChanged\s*=\s*new EventEmitter/.test(content),
      handlesEvent: /\(videoVariant\)="onVideoVariant/.test(content),
    }).toEqual({
      importsVariantPanel: true,
      hasSubscriptionPlanInput: true,
      passesToLibrary: true,
      hasVariantTarget: true,
      hasVariantEmitter: true,
      handlesEvent: true,
    });
  });

  it('club-diagnostic component must exist and gate view behind remote_diagnostic (Phase 2.11)', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'club-portal', 'club-diagnostic.component.ts');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect({
      injectsGate: /FeatureGateService/.test(content),
      injectsAnalytics: /AnalyticsService/.test(content),
      hasGetter: /canUseDiagnostic/.test(content)
        && /canAccess\('remote_diagnostic'/.test(content),
      hasLockCard: /!canUseDiagnostic/.test(content),
      pollsHealth: /getClubHealth/.test(content)
        && /interval\(30000\)/.test(content),
      cleansUp: /ngOnDestroy/.test(content)
        && /unsubscribe/.test(content),
    }).toEqual({
      injectsGate: true,
      injectsAnalytics: true,
      hasGetter: true,
      hasLockCard: true,
      pollsHealth: true,
      cleansUp: true,
    });
  });

  it('app.routes must register /club/diagnostic with club roleGuard (Phase 2.11)', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'app.routes.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const diagBlockMatch = content.match(/path:\s*'club\/diagnostic'[\s\S]*?ClubDiagnosticComponent[\s\S]*?\}/);
    expect({
      hasRoute: diagBlockMatch !== null,
      hasRoleGuard: diagBlockMatch !== null && /canActivate:\s*\[roleGuard\]/.test(diagBlockMatch![0]),
      hasClubRole: diagBlockMatch !== null && /roles:\s*\['club'\]/.test(diagBlockMatch![0]),
    }).toEqual({
      hasRoute: true,
      hasRoleGuard: true,
      hasClubRole: true,
    });
  });

  it('layout sidebar must expose /club/diagnostic link in the club nav section (Phase 2.11)', () => {
    const filePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'layout', 'layout.component.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    const clubSection = content.split('#defaultNav')[0];
    expect({
      hasDiagnosticLink: /routerLink="\/club\/diagnostic"/.test(clubSection),
      hasDiagnosticLabel: /Diagnostic/.test(clubSection),
    }).toEqual({
      hasDiagnosticLink: true,
      hasDiagnosticLabel: true,
    });
  });
});
