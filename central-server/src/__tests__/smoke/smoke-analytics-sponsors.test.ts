/**
 * Smoke tests — analytics-sponsors domain
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
  process.env.PORT = '3105';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('Analytics pages business-first architecture', () => {
  const analyticsRoot = path.resolve(__dirname, '..', '..', '..', '..');

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
    // Since v3.127.0, Chart.js logic is in engagement-chart sub-component.
    const engagementChart = fs.readFileSync(
      path.join(analyticsRoot, 'central-dashboard/src/app/features/analytics/components/engagement-chart.component.ts'),
      'utf8'
    );
    expect({ usesChartJs: engagementChart.includes("from 'chart.js'") })
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

describe('Rate-limit assignment guards', () => {
  const serverTs = fs.readFileSync(
    path.join(path.resolve(__dirname, '..', '..', '..', '..'), 'central-server/src/server.ts'),
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

describe('Live stats VIEWs guards (prevent table regression)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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

describe('Video Library UX regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const videoLibraryPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/components/video-library/video-library.component.ts',
  );
  const siteContentTabDir = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/components/site-content-tab',
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

  const readAllTsFiles = (dir: string): string => {
    let result = '';
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) result += readAllTsFiles(fullPath);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) result += fs.readFileSync(fullPath, 'utf8') + '\n';
      else if (entry.name.endsWith('.html')) result += fs.readFileSync(fullPath, 'utf8') + '\n';
    }
    return result;
  };

  let videoLibContent: string;
  let siteContentTabContent: string;
  let modelsContent: string;
  let controllerContent: string;
  let timelineRepoContent: string;

  beforeAll(() => {
    const videoLibHtmlPath = videoLibraryPath.replace('.component.ts', '.component.html');
    videoLibContent = fs.readFileSync(videoLibraryPath, 'utf8')
      + '\n' + (fs.existsSync(videoLibHtmlPath) ? fs.readFileSync(videoLibHtmlPath, 'utf8') : '');
    siteContentTabContent = readAllTsFiles(siteContentTabDir);
    modelsContent = fs.readFileSync(modelsPath, 'utf8');
    // Read main controller + sub-controllers (split from monolithic sites.controller.ts)
    const controllerDir = path.dirname(sitesControllerPath);
    controllerContent = fs.readFileSync(sitesControllerPath, 'utf8')
      + '\n' + fs.readFileSync(path.join(controllerDir, 'site-fleet.controller.ts'), 'utf8')
      + '\n' + fs.readFileSync(path.join(controllerDir, 'site-commands.controller.ts'), 'utf8')
      + '\n' + fs.readFileSync(path.join(controllerDir, 'site-debug.controller.ts'), 'utf8');
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

describe('Sponsor frequency removal guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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
    // owner === 'club' alone is NOT a sponsor marker — clubs can have non-sponsor videos
    // in the loop (presentations, ambiance, etc.).
    // Without this check, every video name becomes a spurious sponsor.
    const reconcileMethod = sponsorService.match(
      /_reconcileOrphanedLoopVideos[\s\S]*?(?=\n  _extract|\n  \/\*\*\s*\n\s*\*\s*Extrait)/
    );
    expect(reconcileMethod).toBeTruthy();
    const body = reconcileMethod![0];
    // Must filter on sponsor markers (site_sponsor_id, analytics_category)
    expect({ checksSponsorMarkers: /site_sponsor_id|analytics_category.*sponsor|_isSponsorEntry/.test(body) })
      .toEqual({ checksSponsorMarkers: true });
    // _isSponsorEntry must NOT use owner === 'club' alone as a sponsor marker
    // (clubs have non-sponsor videos in loops — presentation, ambiance, etc.)
    const isSponsorFn = body.match(/_isSponsorEntry[\s\S]*?;/);
    expect(isSponsorFn).toBeTruthy();
    expect({ noOwnerClubAlone: !/owner\s*===?\s*['"]club['"]/.test(isSponsorFn![0]) })
      .toEqual({ noOwnerClubAlone: true });
  });

  it('_reconcileOrphanedLoopVideos must skip single-char names (auto-generated artifacts)', () => {
    // Bug: single-char video names like "B", "J", "P" were auto-reconciled as sponsors.
    // These are artifacts from incomplete form entries, not real sponsor names.
    // The reconciliation must skip names shorter than 2 characters.
    const reconcileMethod = sponsorService.match(
      /_reconcileOrphanedLoopVideos[\s\S]*?(?=\n  _extract|\n  \/\*\*\s*\n\s*\*\s*Extrait)/
    );
    expect(reconcileMethod).toBeTruthy();
    const body = reconcileMethod![0];
    // Must have length check on name (name.length < 2)
    expect({ hasMinLengthCheck: /name\.length\s*<\s*2/.test(body) })
      .toEqual({ hasMinLengthCheck: true });
  });

  it('resolveLocalSponsors must skip sponsors with single-char names', () => {
    // Defense-in-depth: even if Pi sends single-char sponsor names,
    // the central must not create site_sponsors entries for them.
    const configSyncHandler = fs.readFileSync(
      path.join(repoRoot, 'central-server', 'src', 'handlers', 'config-sync.handler.ts'),
      'utf8'
    );
    const resolveLocalFn = configSyncHandler.match(
      /async function resolveLocalSponsors[\s\S]*?^}/m
    );
    expect(resolveLocalFn).toBeTruthy();
    const body = resolveLocalFn![0];
    expect({ hasMinLengthCheck: /\.length\s*<\s*2/.test(body) })
      .toEqual({ hasMinLengthCheck: true });
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

describe('Sponsor Portal magic link URL guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Sponsor Portal endpoints registration guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Sponsor Portal stats completeness guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('video_plays interruption_reason guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Sponsor Portal chart container guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Analytics video_duration real duration guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Sponsor stats completion_rate consistency guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

  it('getStatsSummary must use SUM(CASE completed)/COUNT(*) or SUM(completed_plays) for completion_rate', () => {
    // Accepts both patterns: direct formula on video_plays OR pre-aggregated from site_sponsor_daily_stats
    const hasDirectFormula = /SUM\s*\(\s*CASE\s+WHEN\s+completed\s+THEN\s+1\s+ELSE\s+0\s+END\s*\)/.test(content);
    const hasPreAggregated = /SUM\s*\(\s*completed_plays\s*\)/.test(content);
    expect({
      hasCorrectFormula: hasDirectFormula || hasPreAggregated,
    }).toEqual({
      hasCorrectFormula: true,
    });
  });
});

describe('Sponsor stats migration to site_sponsor_daily_stats guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const repoPath = path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts');
  let content: string;
  beforeAll(() => { content = fs.readFileSync(repoPath, 'utf8'); });

  it('getStatsSummary must query site_sponsor_daily_stats, not video_plays', () => {
    const fnMatch = content.match(/async getStatsSummary[\s\S]*?return result\.rows/);
    expect(fnMatch).toBeTruthy();
    const fn = fnMatch![0];
    expect({ usesPreAgg: fn.includes('site_sponsor_daily_stats'), usesVideoPlays: fn.includes('FROM video_plays') })
      .toEqual({ usesPreAgg: true, usesVideoPlays: false });
  });

  it('getDailyTrends must query site_sponsor_daily_stats, not video_plays', () => {
    const fnMatch = content.match(/async getDailyTrends[\s\S]*?return result\.rows/);
    expect(fnMatch).toBeTruthy();
    const fn = fnMatch![0];
    expect({ usesPreAgg: fn.includes('site_sponsor_daily_stats'), usesVideoPlays: fn.includes('FROM video_plays') })
      .toEqual({ usesPreAgg: true, usesVideoPlays: false });
  });

  it('getBenchmark must query site_sponsor_daily_stats, not video_plays', () => {
    // getBenchmark returns query() directly, extract until closing brace of the method
    const fnMatch = content.match(/async getBenchmark\([^)]*\)[^{]*\{[\s\S]*?^\s{2}\}/m);
    expect(fnMatch).toBeTruthy();
    const fn = fnMatch![0];
    expect({ usesPreAgg: fn.includes('site_sponsor_daily_stats'), usesVideoPlays: fn.includes('FROM video_plays') })
      .toEqual({ usesPreAgg: true, usesVideoPlays: false });
  });

  it('calculate_site_sponsor_daily_stats function must exist in full-schema.sql', () => {
    const schemaPath = path.join(repoRoot, 'central-server/src/scripts/full-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    expect(schema).toContain('calculate_site_sponsor_daily_stats');
  });

  it('cron-scheduler must call calculate_site_sponsor_daily_stats', () => {
    const cronPath = path.join(repoRoot, 'central-server/src/services/cron-scheduler.service.ts');
    const cron = fs.readFileSync(cronPath, 'utf8');
    expect(cron).toContain('calculate_site_sponsor_daily_stats');
  });

  it('alerting must monitor site_sponsor_daily_stats staleness', () => {
    const alertPath = path.join(repoRoot, 'central-server/src/services/alerting.service.ts');
    const alerting = fs.readFileSync(alertPath, 'utf8');
    expect(alerting).toContain('site_sponsor_daily_stats');
  });
});

describe('Sponsor queries tv_status filter guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const repoPath = path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(repoPath, 'utf8');
  });

  it('must filter tv_status in sponsor queries (defense-in-depth)', () => {
    // All site_sponsor_daily_stats queries are pre-aggregated from video_plays
    // with tv_status filter applied at aggregation time in calculate_site_sponsor_daily_stats().
    // The repository no longer queries video_plays directly, so tv_status filters
    // are 0 in the repository — the defense is in the PG function.
    // Verify the PG function in full-schema.sql applies the filter.
    const schemaPath = path.resolve(__dirname, '../../../src/scripts/full-schema.sql');
    const schemaSrc = fs.readFileSync(schemaPath, 'utf8');
    const schemaMatches = schemaSrc.match(/tv_status\s+IN\s*\(\s*'on'\s*,\s*'unknown'\s*\)/g);
    expect((schemaMatches?.length || 0) >= 1).toBe(true);
  });
});

describe('HdmiStatusService getTvStatusForAnalytics null tv_power guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Analytics service tv_status guard must not block unknown', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Sponsor video_filename path normalization guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  let repoContent: string;
  let dashboardContent: string;

  beforeAll(() => {
    repoContent = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts'),
      'utf8'
    );
    // Methods may be in the component or in the extracted data service
    const componentContent = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-sponsors-tab/site-sponsors-tab.component.ts'),
      'utf8'
    );
    const dataServicePath = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-sponsors-tab/site-sponsors-tab.data.service.ts');
    const dataServiceContent = fs.existsSync(dataServicePath)
      ? fs.readFileSync(dataServicePath, 'utf8')
      : '';
    dashboardContent = componentContent + '\n' + dataServiceContent;
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

describe('Sponsor period breakdown GROUP BY alignment guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const repoPath = path.join(repoRoot, 'central-server/src/repositories/site-sponsor.repository.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(repoPath, 'utf8');
  });

  it('getStatsByPeriod must use COALESCE unpivot or COALESCE GROUP BY, not raw vp.period', () => {
    // After migration to site_sponsor_daily_stats, getStatsByPeriod uses UNION ALL unpivot
    // of pre-aggregated period columns. The COALESCE is applied at aggregation time in the PG function.
    // Accept either: COALESCE GROUP BY (old pattern) or UNION ALL with named period constants (new pattern)
    const hasCoalesceGroupBy = /GROUP BY\s+COALESCE\(NULLIF\(TRIM\(vp\.period\)/.test(content);
    const hasUnionAllUnpivot = /SELECT\s+'pre_match'\s+AS\s+period/.test(content) &&
      /SELECT\s+'halftime'/.test(content) &&
      /SELECT\s+'loop'/.test(content);
    expect({
      hasValidPattern: hasCoalesceGroupBy || hasUnionAllUnpivot,
      reason: 'Period breakdown must avoid duplicate rows from null/empty/whitespace period values',
    }).toEqual({
      hasValidPattern: true,
      reason: 'Period breakdown must avoid duplicate rows from null/empty/whitespace period values',
    });
  });
});

describe('Sponsor portal manual_triggers guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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
    // getStatsSummary uses SUM(manual_triggers) from pre-aggregated site_sponsor_daily_stats,
    // getStatsByVideo uses FILTER (WHERE trigger_type = 'manual') on video_plays.
    // Both patterns count manual triggers.
    const filterPattern = (repoContent.match(/FILTER\s*\(\s*WHERE\s+.*trigger_type\s*=\s*'manual'\s*\)/g) || []).length;
    const preAggPattern = (repoContent.match(/SUM\s*\(\s*\w*\.?manual_triggers\s*\)/g) || []).length;
    const manualFilterCount = filterPattern + preAggPattern;
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

describe('sponsor_impressions_bridge VIEW completeness guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
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

describe('Weighted sponsor rotation guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // After ADR-042 extraction, startSeamlessLoop lives in video-playback.service.ts
  it('TV component must use generateWeightedPlaylist in startSeamlessLoop', () => {
    const playbackPath = path.join(repoRoot, 'raspberry/src/app/services/video-playback.service.ts');
    const playbackContent = fs.readFileSync(playbackPath, 'utf8');
    const startLoop = playbackContent.match(/startSeamlessLoop[\s\S]*?(?=\n  \w|\n  \/\*\*)/);
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
    const loopMgrHtmlPath = loopMgrPath.replace('.component.ts', '.component.html');
    const content = fs.readFileSync(loopMgrPath, 'utf8') + '\n' + (fs.existsSync(loopMgrHtmlPath) ? fs.readFileSync(loopMgrHtmlPath, 'utf8') : '');
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
    const loopMgrHtmlPath = loopMgrPath.replace('.component.ts', '.component.html');
    const content = fs.readFileSync(loopMgrPath, 'utf8') + '\n' + (fs.existsSync(loopMgrHtmlPath) ? fs.readFileSync(loopMgrHtmlPath, 'utf8') : '');
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

describe('Third-party SDK safety: @bworlds/launchkit access gate prevention', () => {
  const mainTsPath = path.join(__dirname, '../../../../central-dashboard/src/main.ts');

  it('main.ts must NOT contain launchkit.check() access gate', () => {
    const content = fs.readFileSync(mainTsPath, 'utf-8');
    expect(content).not.toMatch(/launchkit\s*\.\s*check\s*\(/);
  });

  it('main.ts must NOT contain getGateUrl() redirect', () => {
    const content = fs.readFileSync(mainTsPath, 'utf-8');
    expect(content).not.toMatch(/getGateUrl\s*\(/);
  });

  it('main.ts must NOT contain session.valid guard pattern', () => {
    const content = fs.readFileSync(mainTsPath, 'utf-8');
    expect(content).not.toMatch(/session\s*\.\s*valid/);
  });

  it('no dashboard source file should import launchkit.check or getGateUrl', () => {
    const dashboardAppDir = path.join(__dirname, '../../../../central-dashboard/src/app');
    const readAllTs = (dir: string): { file: string; content: string }[] => {
      const results: { file: string; content: string }[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...readAllTs(fullPath));
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          results.push({ file: fullPath, content: fs.readFileSync(fullPath, 'utf-8') });
        }
      }
      return results;
    };
    const tsFiles = readAllTs(dashboardAppDir);
    for (const { file, content } of tsFiles) {
      expect({ file, hasCheck: /launchkit\s*\.\s*check\s*\(/.test(content) }).toEqual({ file, hasCheck: false });
      expect({ file, hasGateUrl: /getGateUrl\s*\(/.test(content) }).toEqual({ file, hasGateUrl: false });
    }
  });
});
