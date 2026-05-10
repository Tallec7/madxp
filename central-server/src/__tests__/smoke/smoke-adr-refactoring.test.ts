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
    // ADR-028 — l'écriture peut passer par atomicWriteJsonSync(configPath, …)
    // (tmp + rename) ou directement fs.writeFileSync(configPath, …). Le
    // contrat observable est "le handler persiste la config dans configPath",
    // peu importe l'API. Garde-fou couplé : smoke-pi-config-atomic-writes
    // exige spécifiquement atomicWriteJsonSync depuis l'audit 2026-05-10.
    expect({
      writesConfigFile:
        switchBlock![0].includes('writeFileSync(configPath') ||
        switchBlock![0].includes('atomicWriteJsonSync(configPath'),
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
    expect(schemaContent).toMatch(/CREATE TABLE (IF NOT EXISTS |public\.)campaign_videos/);
    expect(schemaContent).toMatch(/CREATE TABLE (IF NOT EXISTS |public\.)campaign_sites/);
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

  it('central socket.service must track SaaS displayIndex (ADR-096 — délégué au handler)', () => {
    // ADR-096 : la logique SaaS a été extraite dans handlers/saas-relay.handler.ts.
    // socket.service.ts conserve un wrapper public `getSaasConnectedDisplays` pour
    // préserver la surface API consommée par d'autres handlers Pi + tests.
    const serviceContent = fs.readFileSync(path.join(repoRoot, 'central-server/src/services/socket.service.ts'), 'utf8');
    expect(serviceContent).toMatch(/getSaasConnectedDisplays/);
    const handlerContent = fs.readFileSync(path.join(repoRoot, 'central-server/src/handlers/saas-relay.handler.ts'), 'utf8');
    expect(handlerContent).toMatch(/displayIndex/);
  });

  it('central socket.service must have SaaS event relay (ADR-096 — délégué au handler)', () => {
    // ADR-096 : la logique relay vit désormais dans handlers/saas-relay.handler.ts.
    // socket.service.ts conserve un wrapper privé `registerSaasRelay` qui délègue.
    // Smoke test #X enforce que :
    //   1. socket.service.ts garde l'entry point `registerSaasRelay`
    //   2. Le handler isolé contient TOUS les listeners socket.on attendus
    const serviceContent = fs.readFileSync(path.join(repoRoot, 'central-server/src/services/socket.service.ts'), 'utf8');
    expect(serviceContent).toMatch(/registerSaasRelay/);
    expect(serviceContent).toMatch(/saasRelayRegister|saas-relay\.handler/);

    const content = fs.readFileSync(path.join(repoRoot, 'central-server/src/handlers/saas-relay.handler.ts'), 'utf8');
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

describe('ADR-058 Phase 1: Pi offline PIN validation wiring', () => {
  const fs = require('fs');
  const path = require('path');
  const repoRoot = path.resolve(__dirname, '../../../..');

  it('sync-agent writes profiles/{id}.pin.json with chmod 600 and cleans stale entries', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'raspberry/sync-agent/src/commands/sync-profiles.js'),
      'utf8'
    );
    expect({
      writesPinMeta: /\.pin\.json/.test(content),
      chmod600: /mode:\s*0o600/.test(content),
      cleansStale: /pin\\?\.\)\?json/.test(content),
    }).toEqual({ writesPinMeta: true, chmod600: true, cleansStale: true });
  });

  it('Pi server exposes ProfilePinService + profile-pin route', () => {
    const svc = path.resolve(repoRoot, 'raspberry/server/services/profile-pin.service.js');
    const route = path.resolve(repoRoot, 'raspberry/server/routes/profile-pin.js');
    expect(fs.existsSync(svc)).toBe(true);
    expect(fs.existsSync(route)).toBe(true);
    const serverJs = fs.readFileSync(
      path.resolve(repoRoot, 'raspberry/server/server.js'),
      'utf8'
    );
    expect(/createProfilePinRouter/.test(serverJs)).toBe(true);
    expect(/ProfilePinService/.test(serverJs)).toBe(true);
  });

  it('Pi env-config exports PROFILES_DIR', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'raspberry/server/env-config.js'),
      'utf8'
    );
    expect(/PROFILES_DIR/.test(content)).toBe(true);
  });

  it('Pi profile-pin service uses bcrypt.compare and in-memory lockout', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'raspberry/server/services/profile-pin.service.js'),
      'utf8'
    );
    expect({
      usesBcrypt: /bcrypt\.compare\(/.test(content),
      hasLockout: /MAX_ATTEMPTS/.test(content) && /LOCKOUT_MS/.test(content),
    }).toEqual({ usesBcrypt: true, hasLockout: true });
  });

  it('Pi server depends on bcryptjs', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(repoRoot, 'raspberry/server/package.json'), 'utf8')
    );
    expect(pkg.dependencies?.bcryptjs).toBeDefined();
  });

  it('migration SQL adds PIN columns + profile_device_tokens table', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/scripts/add-profile-remote-auth.sql'),
      'utf8'
    );
    expect({
      pinColumns: /remote_pin_required/.test(content) && /remote_pin_hash/.test(content),
      deviceTokens: /CREATE TABLE IF NOT EXISTS profile_device_tokens/.test(content),
      cascadeOnProfile: /REFERENCES config_profiles\(id\) ON DELETE CASCADE/.test(content),
    }).toEqual({ pinColumns: true, deviceTokens: true, cascadeOnProfile: true });
  });

  it('config-profile repository exposes findPin, setPin, and profileDeviceTokenRepository', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/repositories/config-profile.repository.ts'),
      'utf8'
    );
    expect({
      findPin: /async findPin\(/.test(content),
      setPin: /async setPin\(/.test(content),
      deviceRepo: /export const profileDeviceTokenRepository/.test(content),
      revoke: /async revoke\(/.test(content),
      findByHash: /async findByHash\(/.test(content),
    }).toEqual({ findPin: true, setPin: true, deviceRepo: true, revoke: true, findByHash: true });
  });

  it('profile-sync.service propagates PIN metadata in sync_profiles payload', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/services/profile-sync.service.ts'),
      'utf8'
    );
    expect({
      fetchesPin: /configProfileRepository\.findPin\(/.test(content),
      emitsPinRequired: /remote_pin_required/.test(content),
      emitsPinHash: /remote_pin_hash/.test(content),
    }).toEqual({ fetchesPin: true, emitsPinRequired: true, emitsPinHash: true });
  });

  it('config-profiles.controller includes PIN metadata at both emitter sites', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/controllers/config-profiles.controller.ts'),
      'utf8'
    );
    const matches = content.match(/remote_pin_required/g) || [];
    // deploy + sync emitters = at least 2 occurrences
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('remote-auth.controller exposes super_admin PIN management endpoints', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/controllers/remote-auth.controller.ts'),
      'utf8'
    );
    expect({
      setProfilePin: /export async function setProfilePin/.test(content),
      listDevices: /export async function listProfileDevices/.test(content),
      revokeDevice: /export async function revokeProfileDevice/.test(content),
      revokeAll: /export async function revokeAllProfileDevices/.test(content),
      verifyPin: /export async function verifyProfilePin/.test(content),
      usesBcrypt: /bcrypt\.(hash|compare)/.test(content),
      hasLockout: /MAX_PIN_ATTEMPTS/.test(content),
      requireAuthz: /requireSuperAdminOrOwnClub/.test(content),
    }).toEqual({
      setProfilePin: true,
      listDevices: true,
      revokeDevice: true,
      revokeAll: true,
      verifyPin: true,
      usesBcrypt: true,
      hasLockout: true,
      requireAuthz: true,
    });
  });

  it('remote-pin middleware supports profile-scoped + legacy site tokens', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/middleware/remote-pin.middleware.ts'),
      'utf8'
    );
    expect({
      profileToken: /remote-profile-pin/.test(content),
      legacyCompat: /remote-pin/.test(content),
      checksRevocation: /profileDeviceTokenRepository/.test(content),
      generatesProfileToken: /generateRemoteProfilePinToken/.test(content),
    }).toEqual({
      profileToken: true,
      legacyCompat: true,
      checksRevocation: true,
      generatesProfileToken: true,
    });
  });

  it('config-profiles routes wire remote-auth endpoints (super_admin + club in Phase 2B)', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/routes/config-profiles.routes.ts'),
      'utf8'
    );
    expect({
      setPin: /\/remote-pin/.test(content) && /setProfilePin/.test(content),
      listDevices: /\/remote-devices/.test(content) && /listProfileDevices/.test(content),
      revokeOne: /\/remote-devices\/:tokenId\/revoke/.test(content),
      revokeAll: /\/remote-devices\/revoke-all/.test(content),
      roleGuard: /requireRole\('super_admin',\s*'club'\)/.test(content),
    }).toEqual({
      setPin: true,
      listDevices: true,
      revokeOne: true,
      revokeAll: true,
      roleGuard: true,
    });
  });

  it('remote routes wire profile-scoped verify-pin', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/routes/remote.routes.ts'),
      'utf8'
    );
    expect({
      profileVerifyPin: /\/:siteId\/profiles\/:profileId\/verify-pin/.test(content),
      controller: /verifyProfilePin/.test(content),
      validation: /schemas\.verifyProfilePin/.test(content),
    }).toEqual({ profileVerifyPin: true, controller: true, validation: true });
  });

  it('dashboard exposes RemoteAuthService with setPin / listDevices / revoke endpoints', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-dashboard/src/app/core/services/remote-auth.service.ts'),
      'utf8'
    );
    expect({
      setPin: /setPin\(/.test(content),
      listDevices: /listDevices\(/.test(content),
      revokeDevice: /revokeDevice\(/.test(content),
      revokeAllDevices: /revokeAllDevices\(/.test(content),
      hitsCorrectRoute: /\/remote-pin/.test(content) && /\/remote-devices/.test(content),
    }).toEqual({
      setPin: true,
      listDevices: true,
      revokeDevice: true,
      revokeAllDevices: true,
      hitsCorrectRoute: true,
    });
  });

  it('dashboard RemoteService supports profile-scoped verifyProfilePin and deviceId persistence', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-dashboard/src/app/core/services/remote.service.ts'),
      'utf8'
    );
    expect({
      verifyProfilePin: /verifyProfilePin\(/.test(content),
      deviceId: /getOrCreateDeviceId\(/.test(content),
      profileTokenStorage: /PROFILE_TOKEN_STORAGE_PREFIX/.test(content),
      commandAcceptsProfileId: /sendCommand\([\s\S]{0,200}profileId/.test(content),
    }).toEqual({
      verifyProfilePin: true,
      deviceId: true,
      profileTokenStorage: true,
      commandAcceptsProfileId: true,
    });
  });

  it('dashboard RemoteAuthSectionComponent exists and is wired into site-settings-tab (super_admin gated)', () => {
    const comp = path.resolve(
      repoRoot,
      'central-dashboard/src/app/features/sites/components/site-settings-tab/remote-auth-section/remote-auth-section.component.ts'
    );
    const html = path.resolve(
      repoRoot,
      'central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.html'
    );
    const ts = path.resolve(
      repoRoot,
      'central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts'
    );
    expect(fs.existsSync(comp)).toBe(true);
    const htmlContent = fs.readFileSync(html, 'utf8');
    const tsContent = fs.readFileSync(ts, 'utf8');
    expect(/<app-remote-auth-section[^>]*\*ngIf="isSuperAdmin"/.test(htmlContent)).toBe(true);
    expect(/RemoteAuthSectionComponent/.test(tsContent)).toBe(true);
  });

  it('metrics.service exposes profile PIN + device tokens metrics (supervision)', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/services/metrics.service.ts'),
      'utf8'
    );
    expect({
      pinCounter: /neopro_profile_pin_verifications_total/.test(content),
      tokensGauge: /neopro_profile_device_tokens_active/.test(content),
      recordPinMethod: /recordProfilePinVerification\(/.test(content),
      recordTokensMethod: /recordProfileDeviceTokensActive\(/.test(content),
    }).toEqual({
      pinCounter: true,
      tokensGauge: true,
      recordPinMethod: true,
      recordTokensMethod: true,
    });
  });

  it('remote-auth controller records all PIN verification outcomes to metrics', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/controllers/remote-auth.controller.ts'),
      'utf8'
    );
    expect({
      success: /recordProfilePinVerification\('success'\)/.test(content),
      failure: /recordProfilePinVerification\('failure'\)/.test(content),
      lockout: /recordProfilePinVerification\('lockout'\)/.test(content),
      misconfigured: /recordProfilePinVerification\('misconfigured'\)/.test(content),
    }).toEqual({ success: true, failure: true, lockout: true, misconfigured: true });
  });

  it('profile device token repository exposes cleanupExpired + countActive for daily purge', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/repositories/config-profile.repository.ts'),
      'utf8'
    );
    expect({
      cleanupExpired: /async cleanupExpired\(days: number\)/.test(content),
      countActive: /async countActive\(\)/.test(content),
      deleteClause: /DELETE FROM profile_device_tokens/.test(content),
    }).toEqual({ cleanupExpired: true, countActive: true, deleteClause: true });
  });

  it('server.ts wires daily cleanup + gauge refresh for profile_device_tokens', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/server.ts'),
      'utf8'
    );
    expect({
      importsRepo: /profileDeviceTokenRepository/.test(content),
      callsCleanup: /cleanupExpired\(30\)/.test(content),
      refreshesGauge: /recordProfileDeviceTokensActive\(/.test(content),
      unrefInterval: /profileTokensInterval\.unref\(\)/.test(content),
    }).toEqual({
      importsRepo: true,
      callsCleanup: true,
      refreshesGauge: true,
      unrefInterval: true,
    });
  });

  // --- Phase 1.1 : Cloud Remote UI — profile selector + getRemoteState exposure ---

  it('getRemoteState exposes profiles[] + activeProfileId + authenticatedProfileId (ADR-058 Phase 1.1)', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/controllers/remote.controller.ts'),
      'utf8'
    );
    expect({
      exposesProfiles: /profiles:\s*profilesMeta/.test(content),
      exposesActiveProfileId: /activeProfileId/.test(content),
      exposesAuthenticatedProfileId: /authenticatedProfileId/.test(content),
      decodesProfileToken: /remote-profile-pin/.test(content),
      pinRequiredAggregate: /anyProfilePinRequired|p\.pinRequired/.test(content),
    }).toEqual({
      exposesProfiles: true,
      exposesActiveProfileId: true,
      exposesAuthenticatedProfileId: true,
      decodesProfileToken: true,
      pinRequiredAggregate: true,
    });
  });

  it('findProfilesMetadata includes remote_pin_required flag for remote UI', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/repositories/config-profile.repository.ts'),
      'utf8'
    );
    expect(/remote_pin_required/.test(content)).toBe(true);
    expect(/COALESCE\(remote_pin_required,\s*false\)/.test(content)).toBe(true);
  });

  it('cloud-remote.component dispatches to verifyProfilePin when profile.pinRequired', () => {
    const ts = fs.readFileSync(
      path.resolve(
        repoRoot,
        'central-dashboard/src/app/features/remote/cloud-remote.component.ts'
      ),
      'utf8'
    );
    expect({
      declaresAvailableProfiles: /availableProfiles/.test(ts),
      declaresSelectedProfileId: /selectedProfileId/.test(ts),
      syncsFromState: /syncProfilesFromState\(/.test(ts),
      dispatchesToProfileVerify: /verifyProfilePin\(/.test(ts),
      setsCurrentProfileContext: /setCurrentProfileContext\(/.test(ts),
    }).toEqual({
      declaresAvailableProfiles: true,
      declaresSelectedProfileId: true,
      syncsFromState: true,
      dispatchesToProfileVerify: true,
      setsCurrentProfileContext: true,
    });
  });

  it('cloud-remote.component.html renders profile selector when >1 profile available', () => {
    const html = fs.readFileSync(
      path.resolve(
        repoRoot,
        'central-dashboard/src/app/features/remote/cloud-remote.component.html'
      ),
      'utf8'
    );
    expect({
      selectorPresent: /pin-profile-selector/.test(html),
      guardedByLength: /availableProfiles\.length\s*>\s*1/.test(html),
      callsOnProfileSelect: /onProfileSelect\(/.test(html),
    }).toEqual({
      selectorPresent: true,
      guardedByLength: true,
      callsOnProfileSelect: true,
    });
  });

  it('RemoteService exposes currentProfileBySite fallback so commands carry profile token', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-dashboard/src/app/core/services/remote.service.ts'),
      'utf8'
    );
    expect({
      contextMap: /currentProfileBySite/.test(content),
      setContext: /setCurrentProfileContext\(/.test(content),
      clearContext: /clearCurrentProfileContext\(/.test(content),
      getContext: /getCurrentProfileContext\(/.test(content),
      stateExtended: /authenticatedProfileId/.test(content),
    }).toEqual({
      contextMap: true,
      setContext: true,
      clearContext: true,
      getContext: true,
      stateExtended: true,
    });
  });

  // --- Phase 2B : Club user can manage PIN on its own site ---

  it('remote-auth.controller uses requireSuperAdminOrOwnClub (ADR-058 Phase 2B)', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/controllers/remote-auth.controller.ts'),
      'utf8'
    );
    expect({
      helperDefined: /function requireSuperAdminOrOwnClub\(/.test(content),
      checksClubRole: /req\.user\?\.role === 'club'/.test(content),
      checksOwnSite: /req\.params\.siteId === req\.user\.site_id/.test(content),
      usedInSetPin: /setProfilePin[\s\S]{0,400}requireSuperAdminOrOwnClub/.test(content),
      usedInListDevices: /listProfileDevices[\s\S]{0,400}requireSuperAdminOrOwnClub/.test(content),
      usedInRevoke: /revokeProfileDevice[\s\S]{0,400}requireSuperAdminOrOwnClub/.test(content),
      usedInRevokeAll: /revokeAllProfileDevices[\s\S]{0,400}requireSuperAdminOrOwnClub/.test(content),
      noStaleSuperAdminGate: !/function requireSuperAdmin\(/.test(content),
    }).toEqual({
      helperDefined: true,
      checksClubRole: true,
      checksOwnSite: true,
      usedInSetPin: true,
      usedInListDevices: true,
      usedInRevoke: true,
      usedInRevokeAll: true,
      noStaleSuperAdminGate: true,
    });
  });

  it('config-profiles routes accept role club on remote-pin/remote-devices (ADR-058 Phase 2B)', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/routes/config-profiles.routes.ts'),
      'utf8'
    );
    const routeMatches = content.match(/remote-(pin|devices)[\s\S]*?requireRole\([^)]+\)/g) || [];
    expect(routeMatches.length).toBeGreaterThanOrEqual(4);
    for (const block of routeMatches) {
      expect(block).toMatch(/'super_admin'\s*,\s*'club'/);
    }
  });

  // --- Phase 2A : Opportunistic legacy → default profile PIN migration ---

  it('pin-migration.service migrates legacy site PIN to default profile (ADR-058 Phase 2A)', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/services/pin-migration.service.ts'),
      'utf8'
    );
    expect({
      exportsMigrator: /export async function migrateLegacyPinToDefaultProfile/.test(content),
      usesBcrypt: /bcrypt\.hash\(plainPin,\s*BCRYPT_ROUNDS\)/.test(content),
      setsProfilePin: /configProfileRepository\.setPin\(/.test(content),
      clearsLegacySiteHash: /siteRepository\.clearRemotePin\(/.test(content),
      recordsMetric: /recordLegacyPinMigration\(/.test(content),
      nonFatal: /catch \(err\)/.test(content),
    }).toEqual({
      exportsMigrator: true,
      usesBcrypt: true,
      setsProfilePin: true,
      clearsLegacySiteHash: true,
      recordsMetric: true,
      nonFatal: true,
    });
  });

  it('remote.controller.verifyPin fire-and-forgets migration after legacy success (ADR-058 Phase 2A)', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/controllers/remote.controller.ts'),
      'utf8'
    );
    expect({
      imports: /migrateLegacyPinToDefaultProfile/.test(content),
      fireAndForget: /void\s+migrateLegacyPinToDefaultProfile\(siteId,\s*pin\)/.test(content),
    }).toEqual({
      imports: true,
      fireAndForget: true,
    });
  });

  it('metrics.service exposes neopro_legacy_pin_migrations_total counter (ADR-058 Phase 2A)', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'central-server/src/services/metrics.service.ts'),
      'utf8'
    );
    expect({
      counter: /neopro_legacy_pin_migrations_total/.test(content),
      recordMethod: /recordLegacyPinMigration\(/.test(content),
      allStatuses: /success[\s\S]{0,120}skipped_no_default[\s\S]{0,120}skipped_already_set[\s\S]{0,120}failed/.test(content),
    }).toEqual({
      counter: true,
      recordMethod: true,
      allStatuses: true,
    });
  });

  // --- Phase 2C : Email alerts on PIN burst failures ---

  it('prometheus rules.yml declares PIN brute-force alerts (ADR-058 Phase 2C)', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'docker/prometheus/rules.yml'),
      'utf8'
    );
    expect({
      group: /name:\s*remote_auth_security/.test(content),
      burstAlert: /alert:\s*ProfilePinBurstFailures/.test(content),
      bruteForceAlert: /alert:\s*ProfilePinBruteForce/.test(content),
      lockoutAlert: /alert:\s*ProfilePinHighLockoutRate/.test(content),
      usesMetric: /neopro_profile_pin_verifications_total/.test(content),
      taggedSecurity: /category:\s*security/.test(content),
    }).toEqual({
      group: true,
      burstAlert: true,
      bruteForceAlert: true,
      lockoutAlert: true,
      usesMetric: true,
      taggedSecurity: true,
    });
  });

  it('alertmanager.yml routes category=security to email + slack (ADR-058 Phase 2C)', () => {
    const content = fs.readFileSync(
      path.resolve(repoRoot, 'docker/alertmanager/alertmanager.yml'),
      'utf8'
    );
    expect({
      smtpConfigured: /smtp_smarthost:/.test(content),
      securityRoute: /category:\s*security/.test(content),
      securityReceiver: /name:\s*security-email-slack/.test(content),
      emailConfig: /email_configs:/.test(content),
      envEmailTo: /ALERT_EMAIL_TO/.test(content),
    }).toEqual({
      smtpConfigured: true,
      securityRoute: true,
      securityReceiver: true,
      emailConfig: true,
      envEmailTo: true,
    });
  });

  it('club-dashboard renders <app-remote-auth-section> for its own site (ADR-058 Phase 2B)', () => {
    const tsPath = path.resolve(repoRoot, 'central-dashboard/src/app/features/club-portal/club-dashboard.component.ts');
    const htmlPath = path.resolve(repoRoot, 'central-dashboard/src/app/features/club-portal/club-dashboard.component.html');
    const tsContent = fs.readFileSync(tsPath, 'utf8');
    const htmlContent = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
    const content = tsContent + '\n' + htmlContent;
    expect({
      imports: /RemoteAuthSectionComponent/.test(content),
      usedInTemplate: /<app-remote-auth-section/.test(content),
      boundToSiteId: /\[siteId\]="siteDashboard!?\.?\??\.site\.id"/.test(content),
    }).toEqual({
      imports: true,
      usedInTemplate: true,
      boundToSiteId: true,
    });
  });

  // =========================================================================
  // ADR-059 — Pub/sub état match, Pi autoritaire
  // =========================================================================

  describe('ADR-059 — Pi autoritaire state-sync', () => {
    it('state-broadcaster.js exists and emits state-sync', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'raspberry/server/socket/state-broadcaster.js'),
        'utf8'
      );
      expect({
        exports: /module\.exports\s*=\s*function createStateBroadcaster/.test(content),
        emitsStateSync: /io\.emit\(['"]state-sync['"]/.test(content),
        hasSeq: /seq/.test(content),
        hasServerTs: /serverTs/.test(content),
      }).toEqual({ exports: true, emitsStateSync: true, hasSeq: true, hasServerTs: true });
    });

    it('handlers.js registers command/* handlers and calls broadcaster.broadcast()', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'raspberry/server/socket/handlers.js'),
        'utf8'
      );
      expect({
        requiresBroadcaster: /require.*state-broadcaster/.test(content),
        incrementHome: /command\/increment_home/.test(content),
        decrementAway: /command\/decrement_away/.test(content),
        setPhase: /command\/set_phase/.test(content),
        timerStart: /command\/timer_start/.test(content),
        scoreReset: /command\/score_reset/.test(content),
        callsBroadcast: /broadcaster\.broadcast\(\)/.test(content),
      }).toEqual({
        requiresBroadcaster: true,
        incrementHome: true,
        decrementAway: true,
        setPhase: true,
        timerStart: true,
        scoreReset: true,
        callsBroadcast: true,
      });
    });

    it('state.service.js exposes incrementScore and decrementScore', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'raspberry/server/services/state.service.js'),
        'utf8'
      );
      expect({
        increment: /incrementScore\s*\(side\)/.test(content),
        decrement: /decrementScore\s*\(side\)/.test(content),
      }).toEqual({ increment: true, decrement: true });
    });

    it('sync-agent relays command/* DOWN and state-sync UP', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'raspberry/sync-agent/src/agent.js'),
        'utf8'
      );
      expect({
        relaysIncrementHome: /command\/increment_home/.test(content),
        relaysSetPhase: /command\/set_phase/.test(content),
        relaysStateSyncUp: /this\.socket\.emit\(['"]state-sync['"]/.test(content),
      }).toEqual({ relaysIncrementHome: true, relaysSetPhase: true, relaysStateSyncUp: true });
    });

    it('remote.controller.ts accepts command/* types', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-server/src/controllers/remote.controller.ts'),
        'utf8'
      );
      expect({
        incrementHome: /command\/increment_home/.test(content),
        setPhase: /command\/set_phase/.test(content),
        timerReset: /command\/timer_reset/.test(content),
      }).toEqual({ incrementHome: true, setPhase: true, timerReset: true });
    });

    it('central socket.service.ts relays state-sync from Pi to room', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-server/src/services/socket.service.ts'),
        'utf8'
      );
      expect({
        listensPiStateSync: /socket\.on\(['"]state-sync['"]/.test(content),
        relaysToRoom: /this\.io\.to\(siteId\)\.emit\(['"]state-sync['"]/.test(content),
      }).toEqual({ listensPiStateSync: true, relaysToRoom: true });
    });

    it('dashboard remote.service.ts exposes MatchCommandType + MatchStateSync + sendMatchCommand', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/core/services/remote.service.ts'),
        'utf8'
      );
      expect({
        matchCommandType: /MatchCommandType/.test(content),
        matchStateSync: /MatchStateSync/.test(content),
        sendMatchCommand: /sendMatchCommand/.test(content),
      }).toEqual({ matchCommandType: true, matchStateSync: true, sendMatchCommand: true });
    });

    it('dashboard socket.service.ts listens for state-sync', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/core/services/socket.service.ts'),
        'utf8'
      );
      expect(/state-sync/.test(content)).toBe(true);
    });

    it('remote-score.service.ts uses sendMatchCommand + syncFromState + optimistic rollback', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/remote/services/remote-score.service.ts'),
        'utf8'
      );
      expect({
        sendMatchCommand: /sendMatchCommand/.test(content),
        syncFromState: /syncFromState\s*\(state/.test(content),
        optimisticRollback: /homeScore--/.test(content),
      }).toEqual({ sendMatchCommand: true, syncFromState: true, optimisticRollback: true });
    });

    it('remote-timer.service.ts uses sendMatchCommand + syncFromState', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/remote/services/remote-timer.service.ts'),
        'utf8'
      );
      expect({
        sendMatchCommand: /sendMatchCommand/.test(content),
        syncFromState: /syncFromState\s*\(state/.test(content),
      }).toEqual({ sendMatchCommand: true, syncFromState: true });
    });
  });

  // ADR-078 — SaaS match state autoritatif + dashboard room subscription
  // Contexte: ADR-059 pub/sub ne couvrait pas les sites SaaS (pas de Pi owner) et
  // la remote dashboard ne joignait jamais la room siteId. Résultat: divergence
  // entre deux remotes SaaS du même site + state-sync silencieusement droppé.
  describe('ADR-078 — SaaS state-sync authoritative + dashboard subscribe', () => {
    it('saas-match-state.service.ts exists and exports singleton', () => {
      const p = path.resolve(repoRoot, 'central-server/src/services/saas-match-state.service.ts');
      expect(fs.existsSync(p)).toBe(true);
      const content = fs.readFileSync(p, 'utf8');
      expect({
        exportsSingleton: /export const saasMatchStateService/.test(content),
        snapshotMethod: /snapshot\s*\(siteId/.test(content),
        peekMethod: /peek\s*\(siteId/.test(content),
        hasSeq: /seq:/.test(content),
      }).toEqual({ exportsSingleton: true, snapshotMethod: true, peekMethod: true, hasSeq: true });
    });

    it('remote.controller.ts broadcasts state-sync for SaaS + exposes matchState on /state', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-server/src/controllers/remote.controller.ts'),
        'utf8'
      );
      expect({
        importsSaasState: /saasMatchStateService/.test(content),
        appliesMutation: /applySaasMatchMutation/.test(content),
        broadcastsStateSync: /emit\(['"]state-sync['"]/.test(content),
        exposesMatchState: /matchState:/.test(content),
      }).toEqual({
        importsSaasState: true,
        appliesMutation: true,
        broadcastsStateSync: true,
        exposesMatchState: true,
      });
    });

    it('central socket.service.ts handles dashboard-subscribe-site / unsubscribe', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-server/src/services/socket.service.ts'),
        'utf8'
      );
      expect({
        subscribe: /dashboard-subscribe-site/.test(content),
        unsubscribe: /dashboard-unsubscribe-site/.test(content),
      }).toEqual({ subscribe: true, unsubscribe: true });
    });

    it('cloud-remote.component.ts subscribes to siteId room + applies matchState on late-join', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/remote/cloud-remote.component.ts'),
        'utf8'
      );
      expect({
        subscribeEmit: /dashboard-subscribe-site/.test(content),
        unsubscribeEmit: /dashboard-unsubscribe-site/.test(content),
        appliesMatchState: /state\.matchState/.test(content),
      }).toEqual({ subscribeEmit: true, unsubscribeEmit: true, appliesMatchState: true });
    });

    it('RemoteState interface includes optional matchState', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/core/services/remote.service.ts'),
        'utf8'
      );
      expect(/matchState\??\s*:/.test(content)).toBe(true);
    });
  });

  // =========================================================================
  // ADR-060 — Fallback 3 couches (cloud → LAN → offline)
  // =========================================================================

  describe('ADR-060 — Transport resilience + offline queue', () => {
    it('transport-resilience.service.ts exists with TransportMode + probeLan + getApiBaseUrl', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/remote/services/transport-resilience.service.ts'),
        'utf8'
      );
      expect({
        transportMode: /TransportMode/.test(content),
        probeLan: /probeLan\(\)/.test(content),
        getApiBaseUrl: /getApiBaseUrl\(\)/.test(content),
        lanBaseUrl: /neopro\.local/.test(content),
        modeSubject: /BehaviorSubject/.test(content),
      }).toEqual({ transportMode: true, probeLan: true, getApiBaseUrl: true, lanBaseUrl: true, modeSubject: true });
    });

    it('offline-queue.service.ts exists with enqueue + drain + getPendingCount', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/remote/services/offline-queue.service.ts'),
        'utf8'
      );
      expect({
        enqueue: /enqueue\(/.test(content),
        drain: /drain\(/.test(content),
        getPendingCount: /getPendingCount\(/.test(content),
        localStorage: /localStorage/.test(content),
        drained$: /drained\$/.test(content),
      }).toEqual({ enqueue: true, drain: true, getPendingCount: true, localStorage: true, drained$: true });
    });

    it('cloud-remote.component.ts wires TransportResilienceService + OfflineQueueService', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/remote/cloud-remote.component.ts'),
        'utf8'
      );
      expect({
        importTransport: /TransportResilienceService/.test(content),
        importOffline: /OfflineQueueService/.test(content),
        modeSubscription: /transport\.mode\$/.test(content),
        drainOnRestore: /offlineQueue\.drain/.test(content),
      }).toEqual({ importTransport: true, importOffline: true, modeSubscription: true, drainOnRestore: true });
    });
  });

  // =========================================================================
  // ADR-061 — Coexistence legacy/new + sunset 6 mois
  // =========================================================================

  describe('ADR-061 — Version toggle + remote auth events', () => {
    it('remote-version-toggle.service.ts exists with toggle + sunset date + v1/v2 persistence', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/remote/services/remote-version-toggle.service.ts'),
        'utf8'
      );
      expect({
        sunsetDate: /LEGACY_SUNSET_DATE/.test(content),
        toggleVersion: /toggleVersion\(/.test(content),
        loadForSite: /loadForSite\(/.test(content),
        localStorage: /localStorage/.test(content),
        version$: /version\$/.test(content),
        legacyAvailable: /legacyAvailable/.test(content),
      }).toEqual({ sunsetDate: true, toggleVersion: true, loadForSite: true, localStorage: true, version$: true, legacyAvailable: true });
    });

    it('remote-auth-events.repository.ts exists with record + getMigrationStats + client_version', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-server/src/repositories/remote-auth-events.repository.ts'),
        'utf8'
      );
      expect({
        record: /async record\(/.test(content),
        migrationStats: /getMigrationStats/.test(content),
        clientVersion: /client_version/.test(content),
        purgeOld: /purgeOld/.test(content),
        v2Ratio: /v2Ratio/.test(content),
      }).toEqual({ record: true, migrationStats: true, clientVersion: true, purgeOld: true, v2Ratio: true });
    });

    it('remote-auth-events migration SQL exists with correct schema', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-server/src/scripts/migrations/add-remote-auth-events.sql'),
        'utf8'
      );
      expect({
        tableCreate: /CREATE TABLE IF NOT EXISTS remote_auth_events/.test(content),
        clientVersionCol: /client_version/.test(content),
        eventTypeCheck: /pin_verify.*token_use.*state_load/.test(content),
        indexSiteId: /idx_remote_auth_events_site_id/.test(content),
      }).toEqual({ tableCreate: true, clientVersionCol: true, eventTypeCheck: true, indexSiteId: true });
    });

    it('repositories/index.ts exports remoteAuthEventsRepository', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-server/src/repositories/index.ts'),
        'utf8'
      );
      expect(/remoteAuthEventsRepository/.test(content)).toBe(true);
    });
  });

  // =========================================================================
  // ADR-062 — Gouvernance options remote — 3 familles distinctes
  // =========================================================================

  describe('ADR-062 — Options governance (Security / Features / UX)', () => {
    it('remote-preferences.service.ts exists — UX family, localStorage only, no server calls', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/remote/services/remote-preferences.service.ts'),
        'utf8'
      );
      expect({
        haptics: /haptics/.test(content),
        highContrast: /highContrast/.test(content),
        localStorage: /localStorage/.test(content),
        noHttpClient: !/HttpClient/.test(content),
        prefs$: /prefs\$/.test(content),
        update: /update[\s<(]/.test(content),
      }).toEqual({ haptics: true, highContrast: true, localStorage: true, noHttpClient: true, prefs$: true, update: true });
    });

    it('preferences-menu.component.ts exists — UX prefs panel, no security options', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/remote/preferences-menu.component.ts'),
        'utf8'
      );
      expect({
        selector: /app-preferences-menu/.test(content),
        usesPrefsService: /RemotePreferencesService/.test(content),
        noPin: !/pin/i.test(content),
        noToken: !/token/i.test(content),
        dismissedOutput: /dismissed\s*=\s*new EventEmitter/.test(content),
      }).toEqual({ selector: true, usesPrefsService: true, noPin: true, noToken: true, dismissedOutput: true });
    });

    it('remote-features-section component exists — Features family, gated admin, no security', () => {
      const content = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/sites/components/site-settings-tab/remote-features-section/remote-features-section.component.ts'),
        'utf8'
      );
      expect({
        selector: /app-remote-features-section/.test(content),
        featureFlags: /RemoteFeatureFlags/.test(content),
        profilesEnabled: /profilesEnabled/.test(content),
        matchMode: /matchModeEnabled/.test(content),
        noLocalStorage: !/localStorage/.test(content),
      }).toEqual({ selector: true, featureFlags: true, profilesEnabled: true, matchMode: true, noLocalStorage: true });
    });

    it('remote-auth-section exists — Security family, super_admin gated (ADR-058)', () => {
      const exists = fs.existsSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/sites/components/site-settings-tab/remote-auth-section/remote-auth-section.component.ts')
      );
      expect(exists).toBe(true);

      const template = fs.readFileSync(
        path.resolve(repoRoot, 'central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.html'),
        'utf8'
      );
      expect(/app-remote-auth-section.*isSuperAdmin|isSuperAdmin.*app-remote-auth-section/s.test(template)).toBe(true);
    });
  });
});
