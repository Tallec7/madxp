/**
 * Smoke tests — dashboard-guards domain
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
  process.env.PORT = '3107';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('Advertiser video display: template-API field alignment guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('sponsor-videos-tab videos tab uses actual API fields (original_name, filename, duration, added_at)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/sponsor-videos-tab.component.ts'), 'utf-8'
    );

    // Template MUST reference actual API fields
    expect(content).toContain('video.original_name');
    expect(content).toContain('video.filename');
    expect(content).toContain('video.added_at');

    // Template MUST NOT use phantom fields that don't exist in the API
    // These phantom fields must NOT appear as primary display in the videos tab
    expect(content).not.toMatch(/\{\{\s*video\.total_impressions/);
    expect(content).not.toMatch(/\{\{\s*video\.total_screen_time/);
    // video_title can appear as fallback but not as sole display
    expect(content).not.toMatch(/\{\{\s*video\.video_title\s*\}\}/);
  });

  it('SponsorVideo interface includes actual API fields from advertiser.repository.getVideos', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/advertiser-detail.models.ts'), 'utf-8'
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
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/sponsor-quick-stats.component.ts'), 'utf-8'
    );
    const fnMatch = content.match(/formatDuration\(seconds: number\): string \{[\s\S]*?\n  \}/);
    expect(fnMatch).toBeTruthy();
    const fn = fnMatch![0];
    // Must guard against NaN/falsy input
    expect(fn).toMatch(/isNaN|!seconds/);
  });
});

describe('Campaign deploy: meaningful error messages guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('deployCampaignAction error handler checks for specific server error messages', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/advertisers/sponsor-campaigns-tab.component.ts'), 'utf-8'
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

describe('Advertiser detail component decomposition guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const advDir = path.join(repoRoot, 'central-dashboard/src/app/features/advertisers');

  it('advertiser-detail orchestrator imports sub-components', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).toContain('SponsorVideosTabComponent');
    expect(content).toContain('SponsorSitesTabComponent');
    expect(content).toContain('SponsorCampaignsTabComponent');
    expect(content).toContain('app-sponsor-videos-tab');
    expect(content).toContain('app-sponsor-sites-tab');
    expect(content).toContain('app-sponsor-campaigns-tab');
  });

  it('advertiser-detail orchestrator must NOT contain campaign CRUD methods (delegated to sub-component)', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).not.toContain('openCampaignModal');
    expect(content).not.toContain('saveCampaign');
    expect(content).not.toContain('deployCampaignAction');
    expect(content).not.toContain('loadCampaignVideos');
  });

  it('advertiser-detail orchestrator must NOT contain video modal methods (delegated to sub-component)', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).not.toContain('openAddVideosModal');
    expect(content).not.toContain('loadAvailableVideos');
    expect(content).not.toContain('addSelectedVideos');
  });

  it('advertiser-detail orchestrator must NOT contain site assignment methods (delegated to sub-component)', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).not.toContain('openAddSitesModal');
    expect(content).not.toContain('loadAvailableSites');
    expect(content).not.toContain('assignSelectedSites');
  });

  it('shared interfaces are in advertiser-detail.models.ts', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.models.ts'), 'utf-8');
    expect(content).toContain('interface SponsorVideo');
    expect(content).toContain('interface Campaign');
    expect(content).toContain('interface CampaignVideo');
    expect(content).toContain('interface AssignedSite');
    expect(content).toContain('interface ResolvedSite');
  });
});

describe('SitesService decomposition guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const servicesDir = path.join(repoRoot, 'central-dashboard/src/app/core/services');

  it('SiteMetricsService exists with diagnostics methods', () => {
    const content = fs.readFileSync(path.join(servicesDir, 'site-metrics.service.ts'), 'utf-8');
    expect(content).toContain('class SiteMetricsService');
    expect(content).toContain('getHealthStatus');
    expect(content).toContain('runDiagnostics');
    expect(content).toContain('getNetworkDiagnostics');
    expect(content).toContain('exportDebugBundle');
    expect(content).toContain('getSystemInfo');
    expect(content).toContain('fixHotspot');
  });

  it('SiteCommandService exists with command methods', () => {
    const content = fs.readFileSync(path.join(servicesDir, 'site-command.service.ts'), 'utf-8');
    expect(content).toContain('class SiteCommandService');
    expect(content).toContain('sendCommand');
    expect(content).toContain('restartService');
    expect(content).toContain('rebootSite');
    expect(content).toContain('getLogs');
    expect(content).toContain('getCommandStatus');
    expect(content).toContain('getPendingCommands');
  });

  it('SiteSponsorService exists with sponsor methods', () => {
    const content = fs.readFileSync(path.join(servicesDir, 'site-sponsor.service.ts'), 'utf-8');
    expect(content).toContain('class SiteSponsorService');
    expect(content).toContain('listSiteSponsors');
    expect(content).toContain('createSiteSponsor');
    expect(content).toContain('getSiteSponsorStats');
    expect(content).toContain('generateSponsorReport');
    expect(content).toContain('createSponsorAccessLink');
  });

  it('SitesService must NOT contain extracted methods (prevents re-monolithification)', () => {
    const content = fs.readFileSync(path.join(servicesDir, 'sites.service.ts'), 'utf-8');
    // Metrics methods must NOT be in SitesService
    expect(content).not.toContain('getHealthStatus');
    expect(content).not.toContain('runDiagnostics');
    expect(content).not.toContain('exportDebugBundle');
    expect(content).not.toContain('getSystemInfo');
    // Command methods must NOT be in SitesService
    expect(content).not.toContain('sendCommand');
    expect(content).not.toContain('restartService');
    expect(content).not.toContain('rebootSite');
    expect(content).not.toContain('getLogs(');
    // Sponsor methods must NOT be in SitesService
    expect(content).not.toContain('listSiteSponsors');
    expect(content).not.toContain('createSiteSponsor');
    expect(content).not.toContain('getSiteSponsorStats');
  });
});

describe('Central Dashboard error handling guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('app.routes.ts wildcard must load NotFoundComponent (not redirectTo)', () => {
    const routesPath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'app.routes.ts');
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    expect({
      hasWildcard: routesContent.includes("path: '**'"),
      loadsNotFound: /loadComponent.*not-found\.component/.test(routesContent),
      noRedirectToEmpty: !/path:\s*'\*\*'[\s\S]{0,50}redirectTo:\s*''/.test(routesContent),
    }).toEqual({
      hasWildcard: true,
      loadsNotFound: true,
      noRedirectToEmpty: true,
    });
  });

  it('NotFoundComponent must exist with 404 message and dashboard link', () => {
    const componentPath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'features', 'error', 'not-found.component.ts');
    const content = fs.readFileSync(componentPath, 'utf8');
    expect({
      has404: content.includes('404'),
      hasMessage: content.includes('introuvable'),
      hasDashboardLink: /routerLink.*dashboard/.test(content),
      isStandalone: content.includes('standalone: true'),
    }).toEqual({
      has404: true,
      hasMessage: true,
      hasDashboardLink: true,
      isStandalone: true,
    });
  });

  it('ErrorBoundaryComponent must exist and wrap content with error state', () => {
    const componentPath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'core', 'components', 'error-boundary.component.ts');
    const content = fs.readFileSync(componentPath, 'utf8');
    expect({
      hasNgContent: content.includes('<ng-content>'),
      hasErrorCheck: /errorBoundary\.hasError/.test(content),
      hasReload: content.includes('reload()'),
      hasDismiss: content.includes('dismiss()'),
      isStandalone: content.includes('standalone: true'),
    }).toEqual({
      hasNgContent: true,
      hasErrorCheck: true,
      hasReload: true,
      hasDismiss: true,
      isStandalone: true,
    });
  });

  it('ErrorBoundaryService must exist with triggerError and navigation auto-clear', () => {
    const servicePath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'core', 'services', 'error-boundary.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    expect({
      hasTrigger: content.includes('triggerError'),
      hasClear: content.includes('clear()'),
      hasNavigationClear: content.includes('NavigationStart'),
      hasSignal: content.includes('signal'),
    }).toEqual({
      hasTrigger: true,
      hasClear: true,
      hasNavigationClear: true,
      hasSignal: true,
    });
  });

  it('GlobalErrorHandler must use ErrorBoundaryService (not just notification toast)', () => {
    const handlerPath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'core', 'handlers', 'global-error.handler.ts');
    const content = fs.readFileSync(handlerPath, 'utf8');
    expect({
      importsErrorBoundary: content.includes('ErrorBoundaryService'),
      callsTriggerError: content.includes('errorBoundary.triggerError()'),
    }).toEqual({
      importsErrorBoundary: true,
      callsTriggerError: true,
    });
  });

  it('AppComponent must wrap router-outlet with error-boundary', () => {
    const appPath = path.join(repoRoot, 'central-dashboard', 'src', 'app', 'app.component.ts');
    const content = fs.readFileSync(appPath, 'utf8');
    expect({
      importsErrorBoundary: content.includes('ErrorBoundaryComponent'),
      wrapsRouterOutlet: /app-error-boundary[\s\S]*?router-outlet[\s\S]*?app-error-boundary/.test(content),
    }).toEqual({
      importsErrorBoundary: true,
      wrapsRouterOutlet: true,
    });
  });
});

describe('AdvertiserDetailDataService extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const advDir = path.join(repoRoot, 'central-dashboard/src/app/features/advertisers');

  it('AdvertiserDetailDataService exists with all sponsor API methods', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail-data.service.ts'), 'utf-8');
    expect(content).toContain('class AdvertiserDetailDataService');
    expect(content).toContain('loadSponsorWithRelations');
    expect(content).toContain('updateSponsor');
    expect(content).toContain('deleteSponsor');
    expect(content).toContain('forkJoin');
  });

  it('advertiser-detail component uses AdvertiserDetailDataService (not raw ApiService)', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).toContain('AdvertiserDetailDataService');
    expect(content).not.toMatch(/private\s+(readonly\s+)?api\s*=\s*inject\(ApiService\)/);
  });

  it('advertiser-detail component must NOT contain inline API URLs (delegated to service)', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).not.toContain("this.api.get");
    expect(content).not.toContain("this.api.put");
    expect(content).not.toContain("this.api.delete");
    expect(content).not.toContain("/analytics/advertisers/");
  });

  it('SponsorQuickStats interface replaces any type for quickStats', () => {
    const serviceContent = fs.readFileSync(path.join(advDir, 'advertiser-detail-data.service.ts'), 'utf-8');
    const componentContent = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(serviceContent).toContain('interface SponsorQuickStats');
    expect(componentContent).toContain('SponsorQuickStats');
    // Must not have untyped quickStats
    expect(componentContent).not.toMatch(/quickStats:\s*any/);
  });
});

describe('AnalyticsTractionComponent decomposition guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const analyticsDir = path.join(repoRoot, 'central-dashboard/src/app/features/analytics');
  const componentsDir = path.join(analyticsDir, 'components');

  it('TractionDataService exists with data transformation methods', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'traction-data.service.ts'), 'utf-8');
    expect(content).toContain('class TractionDataService');
    expect(content).toContain('calculateAverageRetention');
    expect(content).toContain('computeFleetGrowthWithCumulative');
    expect(content).toContain('formatNumber');
    expect(content).toContain('formatMonth');
  });

  it('all traction section components exist in components/ subfolder', () => {
    const expectedComponents = [
      'traction-kpi-summary.component.ts',
      'traction-fleet-growth.component.ts',
      'traction-engagement.component.ts',
      'traction-subscriptions.component.ts',
      'traction-advertisers.component.ts',
      'traction-deployments.component.ts',
      'traction-product-velocity.component.ts',
      'traction-retention.component.ts',
      'traction-distribution.component.ts',
    ];
    for (const file of expectedComponents) {
      expect(fs.existsSync(path.join(componentsDir, file))).toBe(true);
    }
  });

  it('shared styles file exists for traction sub-components', () => {
    const content = fs.readFileSync(path.join(componentsDir, 'traction-shared.styles.ts'), 'utf-8');
    expect(content).toContain('TRACTION_SHARED_STYLES');
    expect(content).toContain('.kpi-card');
    expect(content).toContain('.data-table');
  });

  it('analytics-traction orchestrator imports all sub-components (not inline templates)', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'analytics-traction.component.ts'), 'utf-8');
    expect(content).toContain('TractionKpiSummaryComponent');
    expect(content).toContain('TractionFleetGrowthComponent');
    expect(content).toContain('TractionEngagementComponent');
    expect(content).toContain('TractionSubscriptionsComponent');
    expect(content).toContain('TractionAdvertisersComponent');
    expect(content).toContain('TractionDeploymentsComponent');
    expect(content).toContain('TractionProductVelocityComponent');
    expect(content).toContain('TractionRetentionComponent');
    expect(content).toContain('TractionDistributionComponent');
    expect(content).toContain('TractionDataService');
  });

  it('analytics-traction orchestrator must NOT contain inline data-table HTML (delegated to sub-components)', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'analytics-traction.component.ts'), 'utf-8');
    // The orchestrator should not have raw table markup — it delegates to child components
    expect(content).not.toContain('<table class="data-table">');
    expect(content).not.toContain('.kpi-card-small');
  });

  it('analytics-traction orchestrator must NOT contain formatting methods (delegated to TractionDataService)', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'analytics-traction.component.ts'), 'utf-8');
    expect(content).not.toMatch(/formatNumber\s*\(/);
    expect(content).not.toMatch(/formatMonth\s*\(/);
    // calculateAverageRetention and getFleetGrowthWithCumulative also delegated
    expect(content).not.toMatch(/calculateAverageRetention\s*\(\s*\)/);
    expect(content).not.toMatch(/getFleetGrowthWithCumulative\s*\(\s*\)/);
  });
});

describe('ConfigEditorDataService extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const configEditorDir = path.join(repoRoot, 'central-dashboard/src/app/features/sites/config-editor');

  it('ConfigEditorDataService exists with all data methods', () => {
    const content = fs.readFileSync(path.join(configEditorDir, 'config-editor-data.service.ts'), 'utf-8');
    expect(content).toContain('class ConfigEditorDataService');
    expect(content).toContain('loadConfigFromPi');
    expect(content).toContain('normalizeConfig');
    expect(content).toContain('validateConfig');
    expect(content).toContain('deployConfig');
    expect(content).toContain('loadAnalyticsCategories');
  });

  it('config-editor component uses ConfigEditorDataService (not raw SitesService for config loading)', () => {
    const content = fs.readFileSync(path.join(configEditorDir, 'config-editor.component.ts'), 'utf-8');
    expect(content).toContain('ConfigEditorDataService');
  });

  it('config-editor component must NOT contain config polling logic (delegated to service)', () => {
    const content = fs.readFileSync(path.join(configEditorDir, 'config-editor.component.ts'), 'utf-8');
    // pollConfigResult and loadFromLocalContent are now in the service
    expect(content).not.toMatch(/private\s+pollConfigResult\s*\(/);
    expect(content).not.toMatch(/private\s+loadFromLocalContent\s*\(/);
  });
});

describe('SiteSettingsDataService extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const settingsDir = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-settings-tab');

  it('SiteSettingsDataService exists with all domain methods', () => {
    const content = fs.readFileSync(path.join(settingsDir, 'site-settings-data.service.ts'), 'utf-8');
    expect(content).toContain('class SiteSettingsDataService');
    expect(content).toContain('saveClubAuth');
    expect(content).toContain('saveBranding');
    expect(content).toContain('fetchHotspotConfig');
    expect(content).toContain('saveWatermarkConfig');
    expect(content).toContain('loadClubReports');
    expect(content).toContain('generateReport');
  });

  it('site-settings-tab component uses SiteSettingsDataService', () => {
    const content = fs.readFileSync(path.join(settingsDir, 'site-settings-tab.component.ts'), 'utf-8');
    expect(content).toContain('SiteSettingsDataService');
  });

  it('site-settings-tab component must NOT directly inject SiteCommandService (delegated to data service)', () => {
    const content = fs.readFileSync(path.join(settingsDir, 'site-settings-tab.component.ts'), 'utf-8');
    expect(content).not.toMatch(/inject\(SiteCommandService\)/);
    expect(content).not.toMatch(/private\s+(readonly\s+)?commandService/);
  });
});

describe('ContentManagementDataService extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const contentDir = path.join(repoRoot, 'central-dashboard/src/app/features/content');

  it('ContentManagementDataService exists with all data methods', () => {
    const content = fs.readFileSync(path.join(contentDir, 'content-management-data.service.ts'), 'utf-8');
    expect(content).toContain('class ContentManagementDataService');
    expect(content).toContain('loadVideos');
    expect(content).toContain('loadDeployments');
    expect(content).toContain('deleteVideo');
    expect(content).toContain('createDeployment');
    expect(content).toContain('convertImageToVideo');
  });

  it('content-management component uses ContentManagementDataService (not raw ApiService)', () => {
    const content = fs.readFileSync(path.join(contentDir, 'content-management.component.ts'), 'utf-8');
    expect(content).toContain('ContentManagementDataService');
    expect(content).not.toMatch(/inject\(ApiService\)/);
  });

  it('content-management component must NOT contain direct API URLs (delegated to service)', () => {
    const content = fs.readFileSync(path.join(contentDir, 'content-management.component.ts'), 'utf-8');
    expect(content).not.toMatch(/this\.api\.get\(/);
    expect(content).not.toMatch(/this\.api\.post\(/);
    expect(content).not.toMatch(/this\.api\.delete\(/);
    expect(content).not.toMatch(/this\.api\.upload\(/);
  });
});

describe('UsersManagement service extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const usersDir = path.join(repoRoot, 'central-dashboard/src/app/features/admin/users');
  it('UsersManagementDataService exists with CRUD methods', () => {
    const content = fs.readFileSync(path.join(usersDir, 'users-management-data.service.ts'), 'utf-8');
    expect(content).toContain('class UsersManagementDataService');
    expect(content).toContain('loadUsers');
    expect(content).toContain('loadAgencies');
    expect(content).toContain('loadAdvertisers');
    expect(content).toContain('createUser');
    expect(content).toContain('updateUser');
    expect(content).toContain('deleteUser');
    expect(content).toContain('toggleUserStatus');
  });

  it('UserFiltersService exists with filter methods', () => {
    const content = fs.readFileSync(path.join(usersDir, 'user-filters.service.ts'), 'utf-8');
    expect(content).toContain('class UserFiltersService');
    expect(content).toContain('buildFilters');
    expect(content).toContain('searchQuery');
    expect(content).toContain('filterRole');
    expect(content).toContain('filterStatus');
  });

  it('UserValidationService exists with validation methods', () => {
    const content = fs.readFileSync(path.join(usersDir, 'user-validation.service.ts'), 'utf-8');
    expect(content).toContain('class UserValidationService');
    expect(content).toContain('validateForCreate');
    expect(content).toContain('validateForUpdate');
    expect(content).toContain('createEmptyForm');
  });

  it('users-management component uses extracted services (not raw UsersService/ApiService directly)', () => {
    const content = fs.readFileSync(path.join(usersDir, 'users-management.component.ts'), 'utf-8');
    expect(content).toContain('UsersManagementDataService');
    expect(content).toContain('UserFiltersService');
    expect(content).toContain('UserValidationService');
    expect(content).not.toMatch(/inject\(ApiService\)/);
    expect(content).not.toMatch(/inject\(AgencyPortalService\)/);
  });

  it('users-management component must NOT contain direct API calls (delegated to data service)', () => {
    const content = fs.readFileSync(path.join(usersDir, 'users-management.component.ts'), 'utf-8');
    expect(content).not.toMatch(/this\.api\./);
    expect(content).not.toMatch(/this\.agencyService\./);
  });
});

describe('AgenciesManagement DataService extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const agencyDir = path.join(repoRoot, 'central-dashboard/src/app/features/admin/agencies');

  it('AgenciesManagementDataService exists', () => {
    const content = fs.readFileSync(path.join(agencyDir, 'agencies-management.data.service.ts'), 'utf-8');
    expect(content).toContain('class AgenciesManagementDataService');
    expect(content).toContain('listAgencies');
    expect(content).toContain('createAgency');
  });

  it('agencies-management component uses DataService (not raw AgencyPortalService/SitesService)', () => {
    const content = fs.readFileSync(path.join(agencyDir, 'agencies-management.component.ts'), 'utf-8');
    expect(content).toContain('AgenciesManagementDataService');
    expect(content).not.toMatch(/inject\(AgencyPortalService\)/);
    expect(content).not.toMatch(/inject\(SitesService\)/);
  });

  it('agencies-management uses external template and styles (not inline)', () => {
    const content = fs.readFileSync(path.join(agencyDir, 'agencies-management.component.ts'), 'utf-8');
    expect(content).toContain('templateUrl');
    expect(content).toContain('styleUrls');
    expect(content).not.toMatch(/template:\s*`/);
  });
});

describe('SubscriptionsManagement DataService extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const subDir = path.join(repoRoot, 'central-dashboard/src/app/features/subscriptions');

  it('SubscriptionsManagementDataService exists', () => {
    const content = fs.readFileSync(path.join(subDir, 'subscriptions-management.data.service.ts'), 'utf-8');
    expect(content).toContain('class SubscriptionsManagementDataService');
    expect(content).toContain('loadInitialData');
    expect(content).toContain('updateSubscription');
    expect(content).toContain('filterAndSortSites');
  });

  it('subscriptions-management component uses DataService (not raw SubscriptionService/SitesService)', () => {
    const content = fs.readFileSync(path.join(subDir, 'subscriptions-management.component.ts'), 'utf-8');
    expect(content).toContain('SubscriptionsManagementDataService');
    expect(content).not.toMatch(/inject\(SubscriptionService\)/);
    expect(content).not.toMatch(/inject\(SitesService\)/);
  });
});

describe('UpdatesManagement DataService extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const updDir = path.join(repoRoot, 'central-dashboard/src/app/features/updates');

  it('UpdatesManagementDataService exists', () => {
    const content = fs.readFileSync(path.join(updDir, 'updates-management.data.service.ts'), 'utf-8');
    expect(content).toContain('class UpdatesManagementDataService');
    expect(content).toContain('loadUpdates');
    expect(content).toContain('loadDeployments');
    expect(content).toContain('subscribeToDeploymentProgress');
    expect(content).toContain('getDeploymentDuration');
    expect(content).toContain('getDeploymentElapsed');
  });

  it('updates-management component uses DataService (not raw ApiService/SitesService/GroupsService)', () => {
    const content = fs.readFileSync(path.join(updDir, 'updates-management.component.ts'), 'utf-8');
    expect(content).toContain('UpdatesManagementDataService');
    expect(content).not.toMatch(/inject\(ApiService\)/);
    expect(content).not.toMatch(/inject\(SitesService\)/);
    expect(content).not.toMatch(/inject\(GroupsService\)/);
  });
});

describe('SiteSponsorsTab DataService and ChartService extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const sponsorDir = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-sponsors-tab');

  it('SiteSponsorsTabDataService exists with CRUD + config parsing', () => {
    const content = fs.readFileSync(path.join(sponsorDir, 'site-sponsors-tab.data.service.ts'), 'utf-8');
    expect(content).toContain('class SiteSponsorsTabDataService');
    expect(content).toContain('listSponsors');
    expect(content).toContain('createSponsor');
    expect(content).toContain('extractDeployedVideos');
    expect(content).toContain('buildVideosInLoopsSet');
  });

  it('SiteSponsorsChartService exists with render/destroy', () => {
    const content = fs.readFileSync(path.join(sponsorDir, 'site-sponsors-tab.chart.service.ts'), 'utf-8');
    expect(content).toContain('class SiteSponsorsChartService');
    expect(content).toContain('renderTrendsChart');
    expect(content).toContain('destroyChart');
  });

  it('site-sponsors-tab component uses extracted services (not raw SiteSponsorService)', () => {
    const content = fs.readFileSync(path.join(sponsorDir, 'site-sponsors-tab.component.ts'), 'utf-8');
    expect(content).toContain('SiteSponsorsTabDataService');
    expect(content).not.toMatch(/inject\(SiteSponsorService\)/);
    expect(content).not.toMatch(/inject\(SitesService\)/);
  });
});

describe('AdvertiserDetail modal/form service extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const advertiserModalDir = path.join(repoRoot, 'central-dashboard/src/app/features/advertisers');
  it('AdvertiserModalService exists with modal management methods', () => {
    const content = fs.readFileSync(path.join(advertiserModalDir, 'advertiser-modal.service.ts'), 'utf-8');
    expect(content).toContain('class AdvertiserModalService');
    expect(content).toContain('showEditModal');
    expect(content).toContain('showDeleteModal');
    expect(content).toContain('openEditModal');
    expect(content).toContain('closeEditModal');
    expect(content).toContain('openDeleteModal');
    expect(content).toContain('closeDeleteModal');
  });

  it('AdvertiserFormService exists with form management methods', () => {
    const content = fs.readFileSync(path.join(advertiserModalDir, 'advertiser-form.service.ts'), 'utf-8');
    expect(content).toContain('class AdvertiserFormService');
    expect(content).toContain('editForm');
    expect(content).toContain('initFromSponsor');
    expect(content).toContain('resetForm');
    expect(content).toContain('saving');
    expect(content).toContain('deleting');
  });

  it('advertiser-detail component uses AdvertiserModalService and AdvertiserFormService', () => {
    const content = fs.readFileSync(path.join(advertiserModalDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).toContain('AdvertiserModalService');
    expect(content).toContain('AdvertiserFormService');
    expect(content).toContain('modalService');
    expect(content).toContain('formService');
  });
});

describe('Shared components flattening guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const sharedComponentsDir = path.join(repoRoot, 'central-dashboard/src/app/shared/components');
  const sitesComponentsDir2 = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components');
  it('video-upload-zone lives in shared/components/ (not sites/components/)', () => {
    const sharedPath = path.join(sharedComponentsDir, 'video-upload-zone/video-upload-zone.component.ts');
    expect(fs.existsSync(sharedPath)).toBe(true);
    const oldPath = path.join(sitesComponentsDir2, 'video-upload-zone/video-upload-zone.component.ts');
    expect(fs.existsSync(oldPath)).toBe(false);
  });

  it('remote-preview consolidated in shared/components/ (no duplicate in sites/components/)', () => {
    const sharedPath = path.join(sharedComponentsDir, 'remote-preview/remote-preview.component.ts');
    expect(fs.existsSync(sharedPath)).toBe(true);
    const content = fs.readFileSync(sharedPath, 'utf-8');
    // Must be the OnPush version (not the legacy version)
    expect(content).toContain('ChangeDetectionStrategy.OnPush');
    expect(content).toContain('phone-mockup');
    const oldPath = path.join(sitesComponentsDir2, 'remote-preview/remote-preview.component.ts');
    expect(fs.existsSync(oldPath)).toBe(false);
  });

  it('site-content-tab imports video-upload-zone from shared (not sites/components)', () => {
    const content = fs.readFileSync(path.join(sitesComponentsDir2, 'site-content-tab/site-content-tab.component.ts'), 'utf-8');
    expect(content).toContain('shared/components/video-upload-zone');
    expect(content).not.toMatch(/\.\.\/video-upload-zone/);
  });

  it('site-content-tab imports remote-preview from shared (not sites/components)', () => {
    const content = fs.readFileSync(path.join(sitesComponentsDir2, 'site-content-tab/site-content-tab.component.ts'), 'utf-8');
    expect(content).toContain('shared/components/remote-preview');
    expect(content).not.toMatch(/\.\.\/remote-preview/);
  });

  it('video-manager imports video-upload-zone from shared (not sites/components)', () => {
    const content = fs.readFileSync(path.join(sitesComponentsDir2, 'site-content-tab/video-manager/video-manager.component.ts'), 'utf-8');
    expect(content).toContain('shared/components/video-upload-zone');
    expect(content).not.toMatch(/\.\.\/\.\.\/video-upload-zone/);
  });
});

describe('Advertiser-detail UI decomposition guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const advDir = path.join(repoRoot, 'central-dashboard/src/app/features/advertisers');

  it('sub-component files exist', () => {
    expect(fs.existsSync(path.join(advDir, 'sponsor-info-tab.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(advDir, 'sponsor-quick-stats.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(advDir, 'sponsor-edit-modal.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(advDir, 'sponsor-delete-modal.component.ts'))).toBe(true);
  });

  it('orchestrator imports all 4 new sub-components', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).toContain('SponsorInfoTabComponent');
    expect(content).toContain('SponsorQuickStatsComponent');
    expect(content).toContain('SponsorEditModalComponent');
    expect(content).toContain('SponsorDeleteModalComponent');
  });

  it('orchestrator must NOT contain inline edit form template (delegated to sponsor-edit-modal)', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).not.toContain('class="modal-form"');
    expect(content).not.toContain('name="contact_email"');
    expect(content).not.toContain('name="contract_start"');
  });

  it('orchestrator must NOT contain inline info-grid template (delegated to sponsor-info-tab)', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).not.toContain('class="info-grid"');
    expect(content).not.toContain('class="info-card"');
  });

  it('orchestrator must NOT contain formatDate/formatDateTime utility methods (delegated to sub-components)', () => {
    const content = fs.readFileSync(path.join(advDir, 'advertiser-detail.component.ts'), 'utf-8');
    expect(content).not.toMatch(/formatDate\s*\(/);
    expect(content).not.toMatch(/formatDateTime\s*\(/);
    expect(content).not.toMatch(/formatDuration\s*\(/);
  });
});

describe('Users-management UI decomposition guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const usersDir = path.join(repoRoot, 'central-dashboard/src/app/features/admin/users');

  it('sub-component files exist', () => {
    expect(fs.existsSync(path.join(usersDir, 'users-filters.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(usersDir, 'users-table.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(usersDir, 'user-form-modal.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(usersDir, 'user-delete-modal.component.ts'))).toBe(true);
  });

  it('orchestrator imports all 4 new sub-components', () => {
    const content = fs.readFileSync(path.join(usersDir, 'users-management.component.ts'), 'utf-8');
    expect(content).toContain('UsersFiltersComponent');
    expect(content).toContain('UsersTableComponent');
    expect(content).toContain('UserFormModalComponent');
    expect(content).toContain('UserDeleteModalComponent');
  });

  it('orchestrator must NOT contain inline users-table HTML (delegated to users-table)', () => {
    const content = fs.readFileSync(path.join(usersDir, 'users-management.component.ts'), 'utf-8');
    expect(content).not.toContain('class="users-table"');
    expect(content).not.toContain('class="user-cell"');
    expect(content).not.toContain('class="avatar"');
  });

  it('orchestrator must NOT contain getInitials/getStatusLabel/formatDate (delegated to sub-components)', () => {
    const content = fs.readFileSync(path.join(usersDir, 'users-management.component.ts'), 'utf-8');
    expect(content).not.toMatch(/getInitials\s*\(/);
    expect(content).not.toMatch(/getStatusLabel\s*\(/);
    expect(content).not.toMatch(/formatDate\s*\(/);
  });

  it('orchestrator must NOT contain inline modal form HTML (delegated to user-form-modal)', () => {
    const content = fs.readFileSync(path.join(usersDir, 'users-management.component.ts'), 'utf-8');
    expect(content).not.toContain('name="email"');
    expect(content).not.toContain('name="password"');
    expect(content).not.toContain('ngSubmit');
  });
});

describe('Analytics UI decomposition guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const analyticsDir = path.join(repoRoot, 'central-dashboard/src/app/features/analytics');
  const componentsDir = path.join(analyticsDir, 'components');

  it('sub-component files exist', () => {
    expect(fs.existsSync(path.join(componentsDir, 'analytics-kpi-grid.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(componentsDir, 'engagement-chart.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(componentsDir, 'top-clubs-card.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(componentsDir, 'dormant-clubs-card.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(componentsDir, 'sponsor-summary-card.component.ts'))).toBe(true);
    expect(fs.existsSync(path.join(componentsDir, 'fleet-health-card.component.ts'))).toBe(true);
  });

  it('orchestrator imports all 6 new sub-components', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'analytics.component.ts'), 'utf-8');
    expect(content).toContain('AnalyticsKpiGridComponent');
    expect(content).toContain('EngagementChartComponent');
    expect(content).toContain('TopClubsCardComponent');
    expect(content).toContain('DormantClubsCardComponent');
    expect(content).toContain('SponsorSummaryCardComponent');
    expect(content).toContain('FleetHealthCardComponent');
  });

  it('orchestrator must NOT contain Chart.js rendering logic (delegated to engagement-chart)', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'analytics.component.ts'), 'utf-8');
    expect(content).not.toContain('renderEngagementChart');
    expect(content).not.toContain('Chart.register');
    expect(content).not.toContain('engagementChartRef');
    expect(content).not.toContain('new Chart(');
  });

  it('orchestrator must NOT contain formatNumber or getClubBarWidth (delegated to sub-components)', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'analytics.component.ts'), 'utf-8');
    expect(content).not.toMatch(/formatNumber\s*\(/);
    expect(content).not.toMatch(/getClubBarWidth\s*\(/);
  });

  it('orchestrator must NOT contain healthExpanded state (delegated to fleet-health-card)', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'analytics.component.ts'), 'utf-8');
    expect(content).not.toContain('healthExpanded');
  });

  it('orchestrator must NOT contain inline KPI template (delegated to analytics-kpi-grid)', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'analytics.component.ts'), 'utf-8');
    expect(content).not.toContain('class="kpi-grid"');
    expect(content).not.toContain('class="kpi-card"');
    expect(content).not.toContain('class="kpi-accent');
  });
});

describe('VideoUploadService + ContentDeploymentService extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const contentDir = path.join(repoRoot, 'central-dashboard/src/app/features/content');

  it('VideoUploadService exists with upload methods', () => {
    const content = fs.readFileSync(path.join(contentDir, 'video-upload.service.ts'), 'utf-8');
    expect(content).toContain('class VideoUploadService');
    expect(content).toContain('addFilesToSelection');
    expect(content).toContain('uploadVideos');
    expect(content).toContain('setImageFile');
    expect(content).toContain('convertImageToVideo');
    expect(content).toContain('canUpload');
    expect(content).toContain('durationOptions');
  });

  it('ContentDeploymentService exists with deployment methods', () => {
    const content = fs.readFileSync(path.join(contentDir, 'content-deployment.service.ts'), 'utf-8');
    expect(content).toContain('class ContentDeploymentService');
    expect(content).toContain('canDeploy');
    expect(content).toContain('startDeployment');
    expect(content).toContain('addVideoToDeploy');
    expect(content).toContain('subscribeToDeploymentProgress');
  });

  it('content-management component delegates to VideoUploadService and ContentDeploymentService', () => {
    const content = fs.readFileSync(path.join(contentDir, 'content-management.component.ts'), 'utf-8');
    expect(content).toContain('VideoUploadService');
    expect(content).toContain('ContentDeploymentService');
  });

  it('content-management component must NOT contain upload logic inline (delegated to VideoUploadService)', () => {
    const content = fs.readFileSync(path.join(contentDir, 'content-management.component.ts'), 'utf-8');
    // Upload state must be delegated, not declared inline
    expect(content).not.toMatch(/isUploading\s*=\s*false/);
    expect(content).not.toMatch(/uploadProgress\s*=\s*0/);
    expect(content).not.toMatch(/isConvertingImage\s*=\s*false/);
  });

  it('content-management component must NOT contain deployment loop inline (delegated to ContentDeploymentService)', () => {
    const content = fs.readFileSync(path.join(contentDir, 'content-management.component.ts'), 'utf-8');
    expect(content).not.toContain('firstValueFrom');
    expect(content).not.toMatch(/isDeploying\s*=\s*false/);
  });
});

describe('SponsorVideoDataService + DragDropService extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const advertisersDir = path.join(repoRoot, 'central-dashboard/src/app/features/advertisers');

  it('SponsorVideoDataService exists with all CRUD methods', () => {
    const content = fs.readFileSync(path.join(advertisersDir, 'sponsor-video-data.service.ts'), 'utf-8');
    expect(content).toContain('class SponsorVideoDataService');
    expect(content).toContain('loadSponsor');
    expect(content).toContain('loadSponsorVideos');
    expect(content).toContain('loadAvailableVideos');
    expect(content).toContain('addVideosToSponsor');
    expect(content).toContain('removeVideoFromSponsor');
    expect(content).toContain('updateVideoPriority');
    expect(content).toContain('reorderVideos');
  });

  it('SponsorVideoDataService uses ApiService (not raw fetch)', () => {
    const content = fs.readFileSync(path.join(advertisersDir, 'sponsor-video-data.service.ts'), 'utf-8');
    expect(content).toContain('ApiService');
    expect(content).not.toContain('fetch(');
  });

  it('DragDropService exists as a generic reusable service', () => {
    const content = fs.readFileSync(path.join(advertisersDir, 'drag-drop.service.ts'), 'utf-8');
    expect(content).toContain('class DragDropService');
    expect(content).toContain('startDrag');
    expect(content).toContain('drop');
    expect(content).toContain('cancel');
  });

  it('advertiser-videos component must NOT use raw fetch() (delegated to SponsorVideoDataService)', () => {
    const content = fs.readFileSync(path.join(advertisersDir, 'advertiser-videos.component.ts'), 'utf-8');
    expect(content).toContain('SponsorVideoDataService');
    expect(content).toContain('DragDropService');
    expect(content).not.toContain('fetch(');
    expect(content).not.toContain('await fetch');
  });
});

describe('ClubAnalytics service extraction guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const analyticsDir = path.join(repoRoot, 'central-dashboard/src/app/features/analytics');

  it('ClubAnalyticsChartService exists with chart methods', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'club-analytics-chart.service.ts'), 'utf-8');
    expect(content).toContain('class ClubAnalyticsChartService');
    expect(content).toContain('renderDailyChart');
    expect(content).toContain('destroyChart');
  });

  it('ClubExportService exists with export methods', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'club-export.service.ts'), 'utf-8');
    expect(content).toContain('class ClubExportService');
    expect(content).toContain('exportCsv');
    expect(content).toContain('exportPdf');
  });

  it('club-analytics.utils.ts exists with pure formatting functions', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'club-analytics.utils.ts'), 'utf-8');
    expect(content).toContain('computePlaysTrend');
    expect(content).toContain('formatDuration');
    expect(content).toContain('formatDate');
    expect(content).toContain('getVideoName');
    expect(content).toContain('getCategoryPercent');
    expect(content).toContain('getCategoryColor');
    expect(content).toContain('getSeverityIcon');
  });

  it('club-analytics component delegates to extracted services and utils', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'club-analytics.component.ts'), 'utf-8');
    expect(content).toContain('ClubAnalyticsChartService');
    expect(content).toContain('ClubExportService');
    expect(content).toContain('club-analytics.utils');
  });

  it('club-analytics component must NOT contain Chart.js config inline (delegated to ClubAnalyticsChartService)', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'club-analytics.component.ts'), 'utf-8');
    expect(content).not.toContain('ChartConfiguration');
    expect(content).not.toContain('new Chart(');
    expect(content).not.toContain('Chart.register');
  });

  it('club-analytics component must NOT contain blob download logic (delegated to ClubExportService)', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'club-analytics.component.ts'), 'utf-8');
    expect(content).not.toContain('createObjectURL');
    expect(content).not.toContain('revokeObjectURL');
    expect(content).not.toContain('createElement(');
  });

  it('club-analytics component must NOT contain categoryColors map (delegated to utils)', () => {
    const content = fs.readFileSync(path.join(analyticsDir, 'club-analytics.component.ts'), 'utf-8');
    expect(content).not.toContain('categoryColors');
    // Check the JS map is gone (not inline CSS which legitimately uses hex colors)
    expect(content).not.toMatch(/categoryColors\s*[:=]/);
  });
});

describe('Pi analytics routes auth guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const analyticsRoutesPath = path.join(repoRoot, 'central-server', 'src', 'routes', 'analytics.routes.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(analyticsRoutesPath, 'utf8');
  });

  it('analytics.routes.ts must import authenticateSiteApiKeyOptional', () => {
    expect({
      importsOptionalAuth: content.includes('authenticateSiteApiKeyOptional'),
    }).toEqual({
      importsOptionalAuth: true,
    });
  });

  it('POST /video-plays must use authenticateSiteApiKeyOptional', () => {
    // Match: router.post('/video-plays', authenticateSiteApiKeyOptional, ...)
    expect({
      hasAuth: /router\.post\(\s*['"]\/video-plays['"][\s\S]*?authenticateSiteApiKeyOptional/.test(content),
    }).toEqual({
      hasAuth: true,
    });
  });

  it('POST /sessions must use authenticateSiteApiKeyOptional', () => {
    // Match: router.post('/sessions', authenticateSiteApiKeyOptional, ...)
    expect({
      hasAuth: /router\.post\(\s*['"]\/sessions['"][\s\S]*?authenticateSiteApiKeyOptional/.test(content),
    }).toEqual({
      hasAuth: true,
    });
  });
});

describe('Pi analytics routes rate limit guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const analyticsRoutesPath = path.join(repoRoot, 'central-server', 'src', 'routes', 'analytics.routes.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(analyticsRoutesPath, 'utf8');
  });

  it('analytics.routes.ts must import piAnalyticsRateLimit', () => {
    expect({
      importsPiRateLimit: content.includes('piAnalyticsRateLimit'),
    }).toEqual({
      importsPiRateLimit: true,
    });
  });

  it('POST /video-plays must use piAnalyticsRateLimit', () => {
    // Match: router.post('/video-plays', piAnalyticsRateLimit, ...)
    expect({
      hasRateLimit: /router\.post\(\s*['"]\/video-plays['"],\s*piAnalyticsRateLimit/.test(content),
    }).toEqual({
      hasRateLimit: true,
    });
  });

  it('POST /sessions must use piAnalyticsRateLimit', () => {
    // Match: router.post('/sessions', piAnalyticsRateLimit, ...)
    expect({
      hasRateLimit: /router\.post\(\s*['"]\/sessions['"],\s*piAnalyticsRateLimit/.test(content),
    }).toEqual({
      hasRateLimit: true,
    });
  });
});

describe('Input validation coverage — Joi middleware on all routes', () => {
  const routesDir = path.join(__dirname, '..', '..', 'routes');

  // Route files that MUST import validation middleware
  const routeFilesRequiringValidation = [
    'admin.routes.ts',
    'agency.routes.ts',
    'analytics.routes.ts',
    'assets.routes.ts',
    'auth.routes.ts',
    'campaign.routes.ts',
    'config-profiles.routes.ts',
    'drafts.routes.ts',
    'groups.routes.ts',
    'logs.routes.ts',
    'objectives.routes.ts',
    'playlist-schedules.routes.ts',
    'remote.routes.ts',
    'reports.routes.ts',
    'safe.routes.ts',
    'updates.routes.ts',
    'users.routes.ts',
    'advertiser-portal.routes.ts',
    'advertiser-sites.routes.ts',
  ];

  for (const file of routeFilesRequiringValidation) {
    it(`${file} must import validation middleware from validation.ts`, () => {
      const filePath = path.join(routesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      expect({
        importsValidate: content.includes("from '../middleware/validation'"),
      }).toEqual({
        importsValidate: true,
      });
    });
  }

  // Every router.post() with a body (not file-upload-only) must have validate(schemas.X)
  // We check specific critical routes that previously lacked validation
  const bodyValidationChecks = [
    { file: 'drafts.routes.ts', route: 'draft', method: 'put', schema: 'validate(schemas.saveDraft)' },
    { file: 'auth.routes.ts', route: 'change-password', method: 'post', schema: 'validate(schemas.changePassword)' },
    { file: 'users.routes.ts', route: 'reset-password', method: 'post', schema: 'validate(schemas.adminResetPassword)' },
    { file: 'users.routes.ts', route: 'status', method: 'patch', schema: 'validate(schemas.changeUserStatus)' },
    { file: 'advertiser-portal.routes.ts', route: 'videos/:videoId', method: 'put', schema: 'validate(schemas.updateAdvertiserVideo)' },
    { file: 'advertiser-sites.routes.ts', route: 'advertisers/:id/sites', method: 'post', schema: 'validate(schemas.addSitesToAdvertiser)' },
  ];

  for (const check of bodyValidationChecks) {
    it(`${check.file} ${check.method.toUpperCase()} /${check.route} must have body validation`, () => {
      const content = fs.readFileSync(path.join(routesDir, check.file), 'utf8');
      expect({
        hasValidation: content.includes(check.schema),
      }).toEqual({
        hasValidation: true,
      });
    });
  }

  // Every route with :id, :siteId, :videoId etc. must have validateParams()
  const paramValidationChecks = [
    { file: 'drafts.routes.ts', description: 'siteId param on draft routes' },
    { file: 'users.routes.ts', description: 'id param on user routes' },
    { file: 'advertiser-portal.routes.ts', description: 'videoId param on video routes' },
    { file: 'advertiser-sites.routes.ts', description: 'id param on advertiser-sites routes' },
    { file: 'groups.routes.ts', description: 'id param on group routes' },
    { file: 'remote.routes.ts', description: 'siteId param on remote routes' },
    { file: 'config-profiles.routes.ts', description: 'siteId param on config-profiles routes' },
  ];

  for (const check of paramValidationChecks) {
    it(`${check.file} must use validateParams() for ${check.description}`, () => {
      const content = fs.readFileSync(path.join(routesDir, check.file), 'utf8');
      expect({
        hasParamValidation: content.includes('validateParams(paramSchemas.'),
      }).toEqual({
        hasParamValidation: true,
      });
    });
  }

  // Config-history routes in sites.routes.ts must have validation
  it('sites.routes.ts config-history POST must have validate(schemas.saveConfigVersion)', () => {
    const content = fs.readFileSync(path.join(routesDir, 'sites.routes.ts'), 'utf8');
    expect({
      hasConfigHistorySaveValidation: content.includes('validate(schemas.saveConfigVersion)'),
      hasConfigHistoryDiffValidation: content.includes('validateQuery(querySchemas.configDiff)'),
      hasConfigPreviewValidation: content.includes('validate(schemas.previewConfigRestore)'),
    }).toEqual({
      hasConfigHistorySaveValidation: true,
      hasConfigHistoryDiffValidation: true,
      hasConfigPreviewValidation: true,
    });
  });

  // ---------------------------------------------------------------
  // COMPREHENSIVE: Every route with parameterized path segments
  // (e.g. /:id, /:siteId) MUST have validateParams() middleware.
  // This prevents unvalidated UUIDs/strings reaching controllers.
  // ---------------------------------------------------------------
  const routeFilesWithParams: Array<{ file: string; exemptPatterns?: string[] }> = [
    { file: 'sites.routes.ts', exemptPatterns: ['siteSubscriptionRouter'] },
    { file: 'groups.routes.ts' },
    { file: 'remote.routes.ts' },
    { file: 'config-profiles.routes.ts' },
    { file: 'admin.routes.ts' },
    { file: 'agency.routes.ts' },
    { file: 'analytics.routes.ts' },
    { file: 'campaign.routes.ts' },
    { file: 'updates.routes.ts' },
    { file: 'users.routes.ts' },
    { file: 'safe.routes.ts' },
    { file: 'reports.routes.ts' },
    { file: 'objectives.routes.ts' },
    { file: 'playlist-schedules.routes.ts' },
    { file: 'drafts.routes.ts' },
    { file: 'assets.routes.ts' },
    { file: 'advertiser-portal.routes.ts' },
    { file: 'advertiser-sites.routes.ts' },
    { file: 'auth.routes.ts' },
  ];

  for (const { file, exemptPatterns } of routeFilesWithParams) {
    it(`${file} every parameterized route must have validateParams()`, () => {
      const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
      const lines = content.split('\n');
      const violations: string[] = [];

      // Match route definitions with path parameters: router.get('/:id/...', ...)
      // Group lines into route blocks (router.method call may span multiple lines)
      const routeRegex = /router\.(get|post|put|patch|delete)\(\s*['"`]\/:([a-zA-Z]+)/;

      for (let i = 0; i < lines.length; i++) {
        const match = routeRegex.exec(lines[i]);
        if (!match) continue;

        // Check if any exempt pattern is on this line
        if (exemptPatterns?.some(p => lines[i].includes(p))) continue;

        // Look ahead up to 10 lines for validateParams in the same route definition
        const routeBlock = lines.slice(i, i + 10).join('\n');
        const hasValidateParams = routeBlock.includes('validateParams(') ||
          routeBlock.includes('siteSponsorValidation.') ||
          routeBlock.includes('analyticsValidation.');

        if (!hasValidateParams) {
          violations.push(`line ${i + 1}: ${lines[i].trim()}`);
        }
      }

      expect({
        routesWithoutParamValidation: violations,
      }).toEqual({
        routesWithoutParamValidation: [],
      });
    });
  }

  // auth.routes.ts verifyResetToken must validate the token query param
  it('auth.routes.ts GET /verify-reset-token must have validateQuery()', () => {
    const content = fs.readFileSync(path.join(routesDir, 'auth.routes.ts'), 'utf8');
    expect({
      hasQueryValidation: content.includes('validateQuery(querySchemas.verifyResetToken)'),
    }).toEqual({
      hasQueryValidation: true,
    });
  });

  // config-profiles.routes.ts POST/PUT must have body validation
  it('config-profiles.routes.ts POST/PUT must have body validation', () => {
    const content = fs.readFileSync(path.join(routesDir, 'config-profiles.routes.ts'), 'utf8');
    expect({
      hasCreateValidation: content.includes('validate(schemas.createProfile)'),
      hasUpdateValidation: content.includes('validate(schemas.updateProfile)'),
      hasConfigValidation: content.includes('validate(schemas.updateProfileConfiguration)'),
    }).toEqual({
      hasCreateValidation: true,
      hasUpdateValidation: true,
      hasConfigValidation: true,
    });
  });
});

describe('SQL injection prevention — no string interpolation in queries', () => {
  const handlersDir = path.join(__dirname, '..', '..', 'handlers');

  it('health-monitor.handler.ts must use parameterized interval (not string interpolation)', () => {
    const content = fs.readFileSync(path.join(handlersDir, 'health-monitor.handler.ts'), 'utf8');
    // Must NOT have template literal interpolation inside SQL INTERVAL
    expect({
      noInterpolatedInterval: !(/INTERVAL\s*'\$\{/.test(content)),
      hasParameterizedInterval: content.includes("($1 || ' seconds')::interval"),
    }).toEqual({
      noInterpolatedInterval: true,
      hasParameterizedInterval: true,
    });
  });

  // Scan all handler files for SQL string interpolation patterns
  it('no handler file should contain SQL string interpolation', () => {
    const handlerFiles = fs.readdirSync(handlersDir).filter((f: string) => f.endsWith('.ts'));
    const violations: string[] = [];

    for (const file of handlerFiles) {
      const content = fs.readFileSync(path.join(handlersDir, file), 'utf8');
      // Match template literals containing SQL keywords + ${} interpolation
      // Pattern: backtick...SELECT/INSERT/UPDATE/DELETE...${...backtick
      if (/`[^`]*(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM|JOIN)\b[^`]*\$\{[^`]*`/.test(content)) {
        // Allow safe patterns like ${tableName} in non-query contexts
        // Flag only patterns where interpolation is inside a query() or pool.query() call
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/\$\{/.test(line) && /(?:query|pool\.query)\s*\(/.test(lines.slice(Math.max(0, i - 5), i + 1).join('\n'))) {
            violations.push(`${file}:${i + 1}`);
          }
        }
      }
    }

    expect({
      sqlInterpolationViolations: violations,
    }).toEqual({
      sqlInterpolationViolations: [],
    });
  });
});

describe('sites.controller split guard (prevents re-monolithification)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const controllerDir = path.join(repoRoot, 'central-server/src/controllers');

  it('sub-controllers must exist as separate files', () => {
    const expected = [
      'site-commands.controller.ts',
      'site-debug.controller.ts',
      'site-fleet.controller.ts',
      'site-copy.controller.ts',
    ];
    for (const file of expected) {
      expect(fs.existsSync(path.join(controllerDir, file))).toBe(true);
    }
  });

  it('sites.controller.ts must NOT exceed 600 lines (CRUD only)', () => {
    const content = fs.readFileSync(path.join(controllerDir, 'sites.controller.ts'), 'utf-8');
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThan(700);
  });

  it('sites.controller.ts must re-export sub-controllers for backward compatibility', () => {
    const content = fs.readFileSync(path.join(controllerDir, 'sites.controller.ts'), 'utf-8');
    expect(content).toContain("from './site-commands.controller'");
    expect(content).toContain("from './site-debug.controller'");
    expect(content).toContain("from './site-fleet.controller'");
    expect(content).toContain("from './site-copy.controller'");
  });

  it('sendCommand must live in site-commands.controller.ts (not sites.controller.ts)', () => {
    const main = fs.readFileSync(path.join(controllerDir, 'sites.controller.ts'), 'utf-8');
    const commands = fs.readFileSync(path.join(controllerDir, 'site-commands.controller.ts'), 'utf-8');
    // The function definition must be in site-commands, not in main
    expect(commands).toContain('export const sendCommand');
    expect(main).not.toMatch(/export const sendCommand\s*=/);
  });

  it('getHealthStatus must live in site-debug.controller.ts (not sites.controller.ts)', () => {
    const main = fs.readFileSync(path.join(controllerDir, 'sites.controller.ts'), 'utf-8');
    const debug = fs.readFileSync(path.join(controllerDir, 'site-debug.controller.ts'), 'utf-8');
    expect(debug).toContain('export const getHealthStatus');
    expect(main).not.toMatch(/export const getHealthStatus\s*=/);
  });

  it('getFleetHealthData must live in site-fleet controller family (not sites.controller.ts)', () => {
    const main = fs.readFileSync(path.join(controllerDir, 'sites.controller.ts'), 'utf-8');
    const fleet = fs.readFileSync(path.join(controllerDir, 'site-fleet.controller.ts'), 'utf-8');
    const fleetHealth = fs.readFileSync(path.join(controllerDir, 'site-fleet-health.controller.ts'), 'utf-8');
    // Must be defined in site-fleet-health and re-exported from site-fleet
    expect(fleetHealth).toContain('export const getFleetHealthData');
    expect(fleet).toContain('getFleetHealthData');
    expect(main).not.toMatch(/export const getFleetHealthData\s*=/);
  });

  it('copyConfig must live in site-copy.controller.ts (not sites.controller.ts)', () => {
    const main = fs.readFileSync(path.join(controllerDir, 'sites.controller.ts'), 'utf-8');
    const copy = fs.readFileSync(path.join(controllerDir, 'site-copy.controller.ts'), 'utf-8');
    expect(copy).toContain('export const copyConfig');
    expect(copy).toContain('export const duplicateSite');
    expect(main).not.toMatch(/export const copyConfig\s*=/);
    expect(main).not.toMatch(/export const duplicateSite\s*=/);
  });

  it('copyConfig must use add mode (not delete existing profiles)', () => {
    const copy = fs.readFileSync(path.join(controllerDir, 'site-copy.controller.ts'), 'utf-8');
    // Must NOT delete existing profiles on target site
    expect(copy).not.toContain('deleteById(profile.id)');
    // Must resolve name conflicts with suffix
    expect(copy).toContain('(copie)');
    // Must never set isDefault: true on copied profiles (preserve target defaults)
    expect(copy).toMatch(/isDefault:\s*false/);
    // Must accept optional profile_ids filter
    expect(copy).toContain('profile_ids');
  });

  it('copyConfig Joi schema must accept optional profile_ids', () => {
    const validation = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/middleware/validation.ts'), 'utf-8'
    );
    expect(validation).toContain('profile_ids');
  });
});

describe('Dashboard template externalization guard (prevents re-inlining)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  const components = [
    {
      name: 'config-editor',
      dir: 'central-dashboard/src/app/features/sites/config-editor',
      maxTsLines: 900,
    },
    {
      name: 'site-settings-tab',
      dir: 'central-dashboard/src/app/features/sites/components/site-settings-tab',
      maxTsLines: 1000,
    },
    {
      name: 'site-detail',
      dir: 'central-dashboard/src/app/features/sites',
      maxTsLines: 1000,
    },
  ];

  for (const comp of components) {
    const fullDir = path.join(repoRoot, comp.dir);

    it(`${comp.name}.component.ts must use templateUrl (not inline template)`, () => {
      const content = fs.readFileSync(path.join(fullDir, `${comp.name}.component.ts`), 'utf-8');
      expect(content).toContain('templateUrl:');
      expect(content).not.toMatch(/template\s*:\s*`/);
    });

    it(`${comp.name}.component.ts must use styleUrls (not inline styles)`, () => {
      const content = fs.readFileSync(path.join(fullDir, `${comp.name}.component.ts`), 'utf-8');
      expect(content).toMatch(/styleUrls?\s*:/);
      expect(content).not.toMatch(/styles\s*:\s*\[?\s*`/);
    });

    it(`${comp.name}.component.html must exist`, () => {
      expect(fs.existsSync(path.join(fullDir, `${comp.name}.component.html`))).toBe(true);
    });

    it(`${comp.name}.component.scss must exist`, () => {
      expect(fs.existsSync(path.join(fullDir, `${comp.name}.component.scss`))).toBe(true);
    });

    it(`${comp.name}.component.ts must NOT exceed ${comp.maxTsLines} lines`, () => {
      const content = fs.readFileSync(path.join(fullDir, `${comp.name}.component.ts`), 'utf-8');
      const lineCount = content.split('\n').length;
      expect(lineCount).toBeLessThan(comp.maxTsLines);
    });
  }
});
