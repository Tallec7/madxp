/**
 * Smoke tests — adr-refactoring domain
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
  process.env.PORT = '3109';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('Multi-profile sync & cache regression guards (ADR-030)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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

describe('Remote multi-profile UX regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Multi-profile enrichment regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

  it('syncProfiles must call enrichConfigWithDisplayVariants', () => {
    const syncFn = controllerContent.match(
      /export const syncProfiles[\s\S]*?(?=export const \w|$)/
    );
    expect(syncFn).not.toBeNull();
    expect({
      callsVariants: syncFn![0].includes('enrichConfigWithDisplayVariants'),
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

  it('deployProfile must call enrichConfigWithDisplayVariants', () => {
    const deployFn = controllerContent.match(
      /export const deployProfile[\s\S]*?(?=export const \w|$)/
    );
    expect(deployFn).not.toBeNull();
    expect({
      callsVariants: deployFn![0].includes('enrichConfigWithDisplayVariants'),
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
    const readAllTs = (dir: string): string => {
      let result = '';
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) result += readAllTs(fullPath);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) result += fs.readFileSync(fullPath, 'utf8') + '\n';
        else if (entry.name.endsWith('.html')) result += fs.readFileSync(fullPath, 'utf8') + '\n';
      }
      return result;
    };
    const contentTab = readAllTs(
      path.join(
        repoRoot,
        'central-dashboard/src/app/features/sites/components/site-content-tab'
      )
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

describe('Pi-side profile-switch handler regression guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('SAFe Dashboard file existence guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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

describe('SAFe Phase 2 regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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

describe('ADR-035 Phase 3: Campaign operational wiring', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('campaign.controller exports all required handlers', async () => {
    const controller = await import('../../controllers/campaign.controller');
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
    const { campaignRepository } = await import('../../repositories');
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

describe('ADR-035 Phase 3b: Campaign auto-deployment wiring', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('campaign.controller exports deploy and undeploy handlers', async () => {
    const controller = await import('../../controllers/campaign.controller');
    expect(controller).toHaveProperty('deployCampaign');
    expect(typeof controller.deployCampaign).toBe('function');
    expect(controller).toHaveProperty('undeployCampaign');
    expect(typeof controller.undeployCampaign).toBe('function');
  });

  it('campaign.repository exports deployment methods (getActiveCampaignsForSite, listPendingSites, batchUpdateDeploymentStatus)', async () => {
    const { campaignRepository } = await import('../../repositories');
    const repo = campaignRepository as unknown as Record<string, unknown>;
    expect(typeof repo.getActiveCampaignsForSite).toBe('function');
    expect(typeof repo.listPendingSites).toBe('function');
    expect(typeof repo.batchUpdateDeploymentStatus).toBe('function');
  });

  it('campaign-deployment.service exports deployCampaign and undeployCampaign', async () => {
    const service = await import('../../services/campaign-deployment.service');
    expect(typeof service.deployCampaign).toBe('function');
    expect(typeof service.undeployCampaign).toBe('function');
  });

  it('enrichConfigWithCampaignVideos exists and is a function', async () => {
    const { enrichConfigWithCampaignVideos } = await import('../../utils/config-campaign-videos');
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

describe('ADR-035 Phase 3c: Campaign dashboard components', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('advertiser-detail orchestrator references campaigns tab and sub-component', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.component.ts'), 'utf-8'
    );
    expect(content).toContain("activeTab === 'campaigns'");
    expect(content).toContain('app-sponsor-campaigns-tab');
  });

  it('sponsor-campaigns-tab.component.ts has campaign CRUD methods', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/sponsor-campaigns-tab.component.ts'), 'utf-8'
    );
    expect(content).toContain('openCampaignModal');
    expect(content).toContain('saveCampaign');
    expect(content).toContain('deleteCampaign');
    expect(content).toContain('editCampaign');
    expect(content).toContain('closeCampaignModal');
  });

  it('campaign-data.service.ts calls /campaigns API endpoints', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/services/campaign-data.service.ts'), 'utf-8'
    );
    expect(content).toContain("'/campaigns'");
    expect(content).toContain('/campaigns/${campaignId}/deploy');
    expect(content).toContain('/campaigns/${campaignId}/undeploy');
    // API calls for videos
    expect(content).toContain('/campaigns/${campaignId}/videos');
    // API calls for sites
    expect(content).toContain('/campaigns/${campaignId}/sites');
    expect(content).toContain('/campaigns/resolve-sites');
  });

  it('sponsor-campaigns-tab.component.ts delegates to CampaignDataService and has modal with videos and targeting tabs', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/sponsor-campaigns-tab.component.ts'), 'utf-8'
    );
    // Uses CampaignDataService
    expect(content).toContain('CampaignDataService');
    // Modal tabs
    expect(content).toContain("campaignModalTab");
    // Video management methods
    expect(content).toContain('loadCampaignVideos');
    expect(content).toContain('addCampaignVideo');
    expect(content).toContain('removeCampaignVideo');
    // Site targeting methods
    expect(content).toContain('previewTargetSites');
    expect(content).toContain('applyCriteriaToSites');
    expect(content).toContain('loadCampaignSites');
  });

  it('sponsor-campaigns-tab.component.html has campaign modal with videos and targeting tabs', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/sponsor-campaigns-tab.component.html'), 'utf-8'
    );
    expect(content).toContain("switchCampaignTab('videos')");
    expect(content).toContain("switchCampaignTab('targeting')");
  });

  it('shared campaign interfaces are in advertiser-detail.models.ts', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.models.ts'), 'utf-8'
    );
    expect(content).toContain('interface CampaignVideo');
    expect(content).toContain('interface ResolvedSite');
  });
});

describe('ADR-035 Phase 3d: Advertiser portal campaign views', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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

describe('ADR-035 Phase 4: Cleanup — neopro bridge removed', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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

  test('site-sponsor.repository.ts network stats query by sponsor_id directly', () => {
    const repoSrc = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts'),
      'utf-8'
    );
    // After migration to site_sponsor_daily_stats, network stats query ssds.sponsor_id
    // instead of vp.sponsor_id (pre-aggregated table instead of video_plays)
    expect(repoSrc).toContain('sponsor_id = $1');
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

describe('ScoreOverlayComponent extraction guard (ADR-041)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const overlayDir = path.join(repoRoot, 'raspberry/src/app/components/score-overlay');
  const tvDir = path.join(repoRoot, 'raspberry/src/app/components/tv');

  it('ScoreOverlayComponent exists as standalone component', () => {
    const content = fs.readFileSync(path.join(overlayDir, 'score-overlay.component.ts'), 'utf-8');
    expect(content).toContain('class ScoreOverlayComponent');
    // Angular 20+ defaults to standalone, so standalone: true may be implicit
    expect(content).toContain('ViewEncapsulation.None');
  });

  it('ScoreOverlayComponent has required @Input properties', () => {
    const content = fs.readFileSync(path.join(overlayDir, 'score-overlay.component.ts'), 'utf-8');
    expect(content).toMatch(/@Input\(\)\s+configuration/);
    expect(content).toMatch(/@Input\(\)\s+displayType/);
  });

  it('ScoreOverlayComponent owns score/timer/goal/breaking-news handlers', () => {
    const content = fs.readFileSync(path.join(overlayDir, 'score-overlay.component.ts'), 'utf-8');
    expect(content).toContain('handleScoreUpdate');
    expect(content).toContain('handleTimerUpdate');
    expect(content).toContain('triggerGoalAnimation');
    expect(content).toContain('displayBreakingNews');
    expect(content).toContain('formatTimerDisplay');
  });

  it('tv.component.ts imports ScoreOverlayComponent (not inline overlay logic)', () => {
    const content = fs.readFileSync(path.join(tvDir, 'tv.component.ts'), 'utf-8');
    expect(content).toContain('ScoreOverlayComponent');
    expect(content).toContain('@ViewChild(ScoreOverlayComponent)');
  });

  it('tv.component.ts must NOT contain overlay methods (delegated to ScoreOverlayComponent)', () => {
    const content = fs.readFileSync(path.join(tvDir, 'tv.component.ts'), 'utf-8');
    // These methods must live in ScoreOverlayComponent, not TvComponent
    expect(content).not.toMatch(/\bhandleScoreUpdate\s*\(/);
    expect(content).not.toMatch(/\bdisplayBreakingNews\s*\(/);
    expect(content).not.toMatch(/\btriggerGoalAnimation\s*\(/);
    expect(content).not.toMatch(/\bformatTimerDisplay\s*\(/);
    expect(content).not.toMatch(/\bstartLocalTimer\s*\(/);
    expect(content).not.toMatch(/\bstopLocalTimer\s*\(/);
  });

  it('tv.component.html uses <app-score-overlay> tag', () => {
    const content = fs.readFileSync(path.join(tvDir, 'tv.component.html'), 'utf-8');
    expect(content).toContain('<app-score-overlay');
    expect(content).toContain('[configuration]="configuration"');
    expect(content).toContain('[displayType]="displayType"');
  });

  it('score-overlay has its own template and styles files', () => {
    expect(fs.existsSync(path.join(overlayDir, 'score-overlay.component.html'))).toBe(true);
    expect(fs.existsSync(path.join(overlayDir, 'score-overlay.component.scss'))).toBe(true);
  });
});

describe('ADR-042 service extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const servicesDir = path.join(repoRoot, 'raspberry/src/app/services');
  const tvPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');

  let tvContent: string;
  beforeAll(() => {
    tvContent = fs.readFileSync(tvPath, 'utf8');
  });

  it('VideoPlaybackService must exist', () => {
    expect(fs.existsSync(path.join(servicesDir, 'video-playback.service.ts'))).toBe(true);
  });

  it('tv.component.ts must NOT contain extracted double-buffer methods (delegated to DoubleBufferVideoService)', () => {
    // These methods were extracted in ADR-042 — they must live in the service, not the component
    expect(tvContent).not.toMatch(/\bprivate\s+initDoubleBuffer\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+setPlayerVisible\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+switchPlayers\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+captureLastFrame\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+showBlackOverlay\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+hideBlackOverlay\s*\(/);
  });

  it('tv.component.ts must NOT contain extracted playback orchestration methods (delegated to VideoPlaybackService)', () => {
    expect(tvContent).not.toMatch(/\bprivate\s+startSeamlessLoop\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+onVideoEnded\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+onTimeUpdate\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+triggerSwitch\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+warmDiskCache\s*\(/);
  });

  it('tv.component.ts must NOT contain extracted error recovery methods (delegated to VideoErrorRecoveryService)', () => {
    expect(tvContent).not.toMatch(/\bprivate\s+handleVideoError\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+startWatchdog\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+stopWatchdog\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+checkPlaybackHealth\s*\(/);
    expect(tvContent).not.toMatch(/\bprivate\s+startMemoryCleanupInterval\s*\(/);
  });

  it('tv.component.ts must wire services via initServices (not initDoubleBuffer)', () => {
    expect(tvContent).toMatch(/private\s+initServices\s*\(/);
    expect(tvContent).toMatch(/doubleBufferService\.init\(/);
    expect(tvContent).toMatch(/playbackService\.init\(/);
    expect(tvContent).toMatch(/errorRecoveryService\.init\(/);
  });

  it('VideoPlaybackService must contain generateWeightedPlaylist and slave guard', () => {
    const playbackContent = fs.readFileSync(path.join(servicesDir, 'video-playback.service.ts'), 'utf8');
    expect(playbackContent).toContain('generateWeightedPlaylist');
    expect(playbackContent).toMatch(/getIsSlaveMode/);
  });

  it('DoubleBufferVideoService must have preload timeout >= 5000ms', () => {
    const dbContent = fs.readFileSync(path.join(servicesDir, 'double-buffer-video.service.ts'), 'utf8');
    const timeoutMatch = dbContent.match(/Preload timeout.*?}\s*,\s*(\d+)\s*\)/s);
    const timeoutMs = timeoutMatch ? parseInt(timeoutMatch[1], 10) : 0;
    expect({
      timeoutMs,
      isAtLeast5s: timeoutMs >= 5000,
      reason: 'remote WiFi access needs >= 5s preload timeout',
    }).toEqual({
      timeoutMs,
      isAtLeast5s: true,
      reason: 'remote WiFi access needs >= 5s preload timeout',
    });
  });
});

describe('ADR-043 dashboard component extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const remoteDir = path.join(repoRoot, 'central-dashboard/src/app/features/remote');
  const sitesDir = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components');

  it('RemoteScoreService must exist and own score state', () => {
    const svc = path.join(remoteDir, 'services/remote-score.service.ts');
    expect(fs.existsSync(svc)).toBe(true);
    const content = fs.readFileSync(svc, 'utf8');
    expect(content).toContain('incrementHomeScore');
    expect(content).toContain('scoreUpdate$');
    expect(content).toContain('currentScore');
  });

  it('RemoteTimerService must exist and own timer state', () => {
    const svc = path.join(remoteDir, 'services/remote-timer.service.ts');
    expect(fs.existsSync(svc)).toBe(true);
    const content = fs.readFileSync(svc, 'utf8');
    expect(content).toContain('currentTime');
    expect(content).toContain('isRunning');
    expect(content).toContain('onPeriodEnd');
  });

  it('RemoteOptionsService must exist and own localStorage persistence', () => {
    const svc = path.join(remoteDir, 'services/remote-options.service.ts');
    expect(fs.existsSync(svc)).toBe(true);
    const content = fs.readFileSync(svc, 'utf8');
    expect(content).toContain('deepMerge');
    expect(content).toContain('localStorage');
    expect(content).toContain('SPORT_PERIODS');
  });

  it('cloud-remote.component.ts must NOT contain extracted localStorage logic (delegated to RemoteOptionsService)', () => {
    const content = fs.readFileSync(path.join(remoteDir, 'cloud-remote.component.ts'), 'utf8');
    expect(content).not.toMatch(/\bprivate\s+loadLocalOptions\s*\(/);
    expect(content).not.toMatch(/\bprivate\s+saveLocalOptions\s*\(/);
    expect(content).not.toMatch(/\bprivate\s+deepMerge\s*[<(]/);
    expect(content).not.toMatch(/\bprivate\s+broadcastOptions\s*\(/);
  });

  it('cloud-remote.component.ts must NOT contain extracted timer interval logic (delegated to RemoteTimerService)', () => {
    const content = fs.readFileSync(path.join(remoteDir, 'cloud-remote.component.ts'), 'utf8');
    expect(content).not.toMatch(/\bprivate\s+syncTimer\s*\(/);
    expect(content).not.toMatch(/\bprivate\s+initializeTimer\s*\(/);
    expect(content).not.toMatch(/\btimerInterval\b.*setInterval/);
  });

  it('cloud-remote.component.ts must NOT contain extracted score HTTP logic (delegated to RemoteScoreService)', () => {
    const content = fs.readFileSync(path.join(remoteDir, 'cloud-remote.component.ts'), 'utf8');
    expect(content).not.toMatch(/\bprivate\s+sendScoreUpdate\s*\(/);
  });

  it('video-library must have external template and styles', () => {
    const dir = path.join(sitesDir, 'video-library');
    expect(fs.existsSync(path.join(dir, 'video-library.component.html'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'video-library.component.scss'))).toBe(true);
    const ts = fs.readFileSync(path.join(dir, 'video-library.component.ts'), 'utf8');
    expect(ts).toContain('templateUrl');
    expect(ts).toContain('styleUrls');
    expect(ts).not.toMatch(/\btemplate\s*:\s*`/);
  });

  it('loop-manager must have external template and styles', () => {
    const dir = path.join(sitesDir, 'loop-manager');
    expect(fs.existsSync(path.join(dir, 'loop-manager.component.html'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'loop-manager.component.scss'))).toBe(true);
    const ts = fs.readFileSync(path.join(dir, 'loop-manager.component.ts'), 'utf8');
    expect(ts).toContain('templateUrl');
    expect(ts).toContain('styleUrls');
    expect(ts).not.toMatch(/\btemplate\s*:\s*`/);
  });

  it('site-content-tab must have external template and styles', () => {
    const dir = path.join(sitesDir, 'site-content-tab');
    expect(fs.existsSync(path.join(dir, 'site-content-tab.component.html'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'site-content-tab.component.scss'))).toBe(true);
    const ts = fs.readFileSync(path.join(dir, 'site-content-tab.component.ts'), 'utf8');
    expect(ts).toContain('templateUrl');
    expect(ts).toContain('styleUrls');
    expect(ts).not.toMatch(/\btemplate\s*:\s*`/);
  });
});

describe('PROP-002 Phase 5: N-display model guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('TvComponent must read displayIndex from route param :n', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'), 'utf8');
    expect(content).toMatch(/route\.snapshot\.params\[['"]n['"]\]/);
  });

  it('TvComponent must send displayIndex in tv-register', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'), 'utf8') +
      fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/services/tv-sync.service.ts'), 'utf8');
    expect(content).toMatch(/displayIndex/);
  });

  it('Command interface must have target field for N-display targeting', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/interfaces/command.interface.ts'), 'utf8');
    expect(content).toMatch(/target\?:\s*number\[\]/);
  });

  it('Pi server state.service must track displayIndex in tvInstances', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'raspberry/server/services/state.service.js'), 'utf8');
    expect(content).toMatch(/getConnectedDisplays/);
    expect(content).toMatch(/displayIndex/);
  });

  it('Pi server handlers must emit displays-changed with displays array', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'raspberry/server/socket/handlers.js'), 'utf8');
    expect(content).toMatch(/displays-changed/);
    expect(content).toMatch(/getConnectedDisplays\(\)/);
  });

  it('Remote must use dynamic connectedDisplays (not hardcoded types)', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/components/remote/remote.component.ts'), 'utf8');
    expect(content).toMatch(/connectedDisplays:\s*Array/);
    expect(content).not.toMatch(/connectedDisplayTypes:\s*string\[\]/);
  });

  it('enrichConfigWithDisplayVariants must exist and accept displayTypes param', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'central-server/src/utils/config-secondary-variants.ts'), 'utf8');
    expect(content).toMatch(/export async function enrichConfigWithDisplayVariants/);
    expect(content).toMatch(/displayTypes:\s*string\[\]/);
  });

  it('VideoVariants must have index signature for arbitrary display types', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'central-server/src/types/index.ts'), 'utf8');
    expect(content).toMatch(/\[displayType:\s*string\]:\s*VideoVariantInfo\s*\|\s*undefined/);
  });

  it('DB migration must open display_type CHECK constraint', () => {
    const migrationPath = path.join(repoRoot, 'central-server/src/scripts/migrations/n-display-model.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, 'utf8');
    expect(content).toMatch(/a-z0-9/);
    expect(content).toMatch(/displays\s+JSONB/);
  });

  it('central socket.service must track SaaS displayIndex', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'central-server/src/services/socket.service.ts'), 'utf8');
    expect(content).toMatch(/getSaasConnectedDisplays/);
    expect(content).toMatch(/displayIndex/);
  });

  it('central socket.service must have SaaS event relay (registerSaasRelay)', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'central-server/src/services/socket.service.ts'), 'utf8');
    expect(content).toMatch(/registerSaasRelay/);
    // Relay must handle all Pi-equivalent events
    expect(content).toMatch(/socket\.on\('command'/);
    expect(content).toMatch(/socket\.to\(siteId\)\.emit\('action'/);
    expect(content).toMatch(/socket\.on\('score-update'/);
    expect(content).toMatch(/socket\.on\('phase-change'/);
    expect(content).toMatch(/socket\.on\('timer-update'/);
    expect(content).toMatch(/socket\.on\('breaking-news'/);
    expect(content).toMatch(/socket\.on\('request-state'/);
    // Master-slave sync (same as Pi)
    expect(content).toMatch(/socket\.on\('tv-register'/);
    expect(content).toMatch(/socket\.on\('tv-loop-update'/);
    expect(content).toMatch(/tv-loop-state/);
    expect(content).toMatch(/tv-role-assigned/);
    // State must track tvInstances and loopState
    expect(content).toMatch(/tvInstances/);
    expect(content).toMatch(/loopState/);
  });

  it('no caller must import enrichConfigWithSecondaryVariants (migrated to Display)', () => {
    const files = [
      'central-server/src/controllers/config-profiles.controller.ts',
      'central-server/src/services/orchestrated-deployment.service.ts',
      'central-server/src/handlers/config-sync.handler.ts',
    ];
    for (const file of files) {
      const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      expect(content).not.toMatch(/import.*enrichConfigWithSecondaryVariants/);
      expect(content).toMatch(/import.*enrichConfigWithDisplayVariants/);
    }
  });

  it('TvComponent must not have resolveSecondaryVariant (migrated to resolveDisplayVariant)', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'), 'utf8');
    expect(content).not.toMatch(/private resolveSecondaryVariant/);
    expect(content).toMatch(/private resolveDisplayVariant/);
  });

  // --- video-search-select must use fixed positioning and display:block ---
  it('video-search-select must use position:fixed dropdown and :host display:block', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/shared/components/video-search-select/video-search-select.component.ts'),
      'utf8'
    );
    expect({
      hasHostDisplayBlock: /:\s*host\s*\{[^}]*display\s*:\s*block/.test(content),
      hasFixedDropdown: /\.vss__dropdown\s*\{[^}]*position\s*:\s*fixed/.test(content),
      hasDropUpSupport: content.includes('vss--dropup'),
      hasCompactInput: /@Input\(\)\s*compact/.test(content),
    }).toEqual({
      hasHostDisplayBlock: true,
      hasFixedDropdown: true,
      hasDropUpSupport: true,
      hasCompactInput: true,
    });
  });

  // --- config-editors must NOT use native <select> for video selection ---
  it('embedded config-editor must use video-search-select (not native select) for videos', () => {
    const tsPath = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-content-tab/config-editor/config-editor.component.ts');
    const htmlPath = tsPath.replace('.component.ts', '.component.html');
    const content = fs.readFileSync(tsPath, 'utf8') + '\n' + (fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '');
    expect({
      importsVideoSearchSelect: content.includes('VideoSearchSelectComponent'),
      usesAppVideoSearchSelect: content.includes('app-video-search-select'),
      noNativeSelectForVideos: !/<select[\s\S]*?class="video-select/.test(content),
      usesCompact: content.includes('[compact]="true"'),
    }).toEqual({
      importsVideoSearchSelect: true,
      usesAppVideoSearchSelect: true,
      noNativeSelectForVideos: true,
      usesCompact: true,
    });
  });

  it('standalone config-editor must use video-selector with compact mode for all video selectors', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/config-editor/config-editor.component.html'),
      'utf8'
    );
    const selectorCount = (content.match(/app-video-selector/g) || []).length;
    const compactCount = (content.match(/\[compact\]="true"/g) || []).length;
    expect({
      hasVideoSelectors: selectorCount > 0,
      allSelectorsCompact: compactCount >= selectorCount / 2,  // each selector has open+close tag
    }).toEqual({
      hasVideoSelectors: true,
      allSelectorsCompact: true,
    });
  });

  it('loop-manager must use video-search-select with compact mode', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/loop-manager/loop-manager.component.html'),
      'utf8'
    );
    expect({
      usesSearchSelect: content.includes('app-video-search-select'),
      usesCompact: content.includes('[compact]="true"'),
      noNativeSelect: !/<select[\s\S]*?video/.test(content),
    }).toEqual({
      usesSearchSelect: true,
      usesCompact: true,
      noNativeSelect: true,
    });
  });

  it('video-selector wrapper must propagate compact input', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/shared/components/video-selector/video-selector.component.ts'),
      'utf8'
    );
    expect({
      hasCompactInput: /@Input\(\)\s*compact/.test(content),
      propagatesCompact: content.includes('[compact]="compact"'),
    }).toEqual({
      hasCompactInput: true,
      propagatesCompact: true,
    });
  });
});
