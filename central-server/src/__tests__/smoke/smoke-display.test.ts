/**
 * Smoke tests — display domain
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
  process.env.PORT = '3103';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('E-22 config-merge secondary display guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const configMergePath = path.join(repoRoot, 'raspberry/sync-agent/src/utils/config-merge.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(configMergePath, 'utf8');
  });

  it('config-merge.js must clean up secondaryDisplayEnabled (not merge it)', () => {
    expect({
      deletesSecondaryDisplayEnabled: /delete result\.secondaryDisplayEnabled/.test(content),
      deletesLedEnabled: /delete result\.ledEnabled/.test(content),
    }).toEqual({
      deletesSecondaryDisplayEnabled: true,
      deletesLedEnabled: true,
    });
  });

  it('config-merge.js must clean up secondaryDisplayResolution', () => {
    expect({
      deletesSecondaryDisplayResolution: /delete result\.secondaryDisplayResolution/.test(content),
      deletesLedResolution: /delete result\.ledResolution/.test(content),
    }).toEqual({
      deletesSecondaryDisplayResolution: true,
      deletesLedResolution: true,
    });
  });
});

describe('E-22 Angular /secondary route guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const routesPath = path.join(repoRoot, 'raspberry/src/app/app.routes.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(routesPath, 'utf8');
  });

  it('app.routes.ts must have /secondary redirect and /display/:n route', () => {
    expect({
      hasSecondaryRedirect: /path:\s*['"]secondary['"]/.test(content),
      hasDisplayRoute: /path:\s*['"]display\/:n['"]/.test(content),
    }).toEqual({
      hasSecondaryRedirect: true,
      hasDisplayRoute: true,
    });
  });

  it('app.routes.ts must NOT have /led route (renamed to /secondary)', () => {
    expect({
      hasLedRoute: /path:\s*['"]led['"]/.test(content),
    }).toEqual({
      hasLedRoute: false,
    });
  });
});

describe('E-23 F-23.7 root route HomeComponent guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const routesPath = path.join(repoRoot, 'raspberry/src/app/app.routes.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(routesPath, 'utf8');
  });

  it('app.routes.ts must use HomeComponent on root path (not redirectTo tv)', () => {
    expect({
      importsHomeComponent: content.includes("import { HomeComponent }"),
      rootUsesHomeComponent: /path:\s*['"]?['"]?\s*,\s*component:\s*HomeComponent/.test(content),
      noRootRedirectToTv: !/path:\s*['"]?['"]?\s*,\s*redirectTo:\s*['"]tv['"]/.test(content),
    }).toEqual({
      importsHomeComponent: true,
      rootUsesHomeComponent: true,
      noRootRedirectToTv: true,
    });
  });
});

describe('E-22 LoopVideo variants.secondary guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const interfacePath = path.join(repoRoot, 'raspberry/src/app/interfaces/sponsor.interface.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(interfacePath, 'utf8');
  });

  it('LoopVideo must have variants.secondary field', () => {
    expect({
      hasVariantsSecondary: /variants\??\s*:\s*\{[^}]*secondary\??\s*:/.test(content),
    }).toEqual({
      hasVariantsSecondary: true,
    });
  });

  it('LoopVideo must NOT have variants.led field (renamed)', () => {
    expect({
      hasVariantsLed: /variants\??\s*:\s*\{[^}]*\bled\b/.test(content),
    }).toEqual({
      hasVariantsLed: false,
    });
  });
});

describe('E-22 video variant API routes guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const routesPath = path.join(repoRoot, 'central-server/src/routes/content.routes.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(routesPath, 'utf8');
  });

  it('content.routes.ts must have GET /videos/:id/variants', () => {
    expect({
      hasGetVariants: /router\.get\(.*variants.*getVideoVariants/.test(content),
    }).toEqual({
      hasGetVariants: true,
    });
  });

  it('content.routes.ts must have POST /videos/:id/variants', () => {
    expect({
      hasPostVariants: /router\.post\(.*variants.*createVideoVariant/.test(content),
    }).toEqual({
      hasPostVariants: true,
    });
  });

  it('content.routes.ts must have DELETE /videos/:videoId/variants/:displayType', () => {
    expect({
      hasDeleteVariants: /router\.delete\(.*variants.*deleteVideoVariant/.test(content),
    }).toEqual({
      hasDeleteVariants: true,
    });
  });
});

describe('E-22 watchdog secondary display guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const watchdogPath = path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(watchdogPath, 'utf8');
  });

  it('watchdog must NOT read secondaryDisplayEnabled from config (hardware-driven)', () => {
    expect({
      noReadFunction: !/read_secondary_display_enabled/.test(content),
      noConfigVariable: !/SECONDARY_DISPLAY_ENABLED/.test(content),
    }).toEqual({
      noReadFunction: true,
      noConfigVariable: true,
    });
  });

  it('watchdog detect_wrong_port must use DUAL_DISPLAY_ACTIVE not config flag', () => {
    const detectWrongPortBlock = content.match(/detect_wrong_port\(\)[\s\S]*?^}/m)?.[0] || '';
    expect({
      usesDualDisplayActive: /DUAL_DISPLAY_ACTIVE/.test(detectWrongPortBlock),
      noSecondaryDisplayEnabled: !/SECONDARY_DISPLAY_ENABLED/.test(detectWrongPortBlock),
    }).toEqual({
      usesDualDisplayActive: true,
      noSecondaryDisplayEnabled: true,
    });
  });

  it('watchdog must detect HDMI 1 via DRM sysfs', () => {
    expect({
      detectsHdmi1: /\/sys\/class\/drm/.test(content),
    }).toEqual({
      detectsHdmi1: true,
    });
  });

  it('watchdog must launch /secondary URL (not /led)', () => {
    expect({
      launchesSecondary: /\/secondary/.test(content),
      doesNotLaunchLed: !/--app=.*\/led/.test(content),
    }).toEqual({
      launchesSecondary: true,
      doesNotLaunchLed: true,
    });
  });

  // Bug fix v3.82.3: grep -E '\d' doesn't work (Perl regex only).
  // Must use [0-9] in grep -E for HDMI xrandr detection.
  it('watchdog xrandr grep must use [0-9] not \\d for digit matching', () => {
    // Extract all grep -E lines that filter HDMI connected outputs
    const hdmiGrepLines = content.match(/grep -E '.*HDMI.*connected.*/g) || [];
    expect({
      hasHdmiGrep: hdmiGrepLines.length > 0,
      // None of the HDMI grep -E lines should use \d (Perl-only regex)
      noBackslashD: hdmiGrepLines.every((line: string) => !line.includes('\\d')),
      // At least one line must use [0-9] for digit matching
      usesBracketDigit: hdmiGrepLines.some((line: string) => line.includes('[0-9]')),
    }).toEqual({
      hasHdmiGrep: true,
      noBackslashD: true,
      usesBracketDigit: true,
    });
  });

  // Bug fix v3.82.6: --kiosk forces fullscreen on primary monitor, ignoring --window-position.
  // Secondary Chromium must use --app=URL mode, NOT --kiosk.
  it('watchdog secondary Chromium must use --app= mode (not --kiosk)', () => {
    // Extract the start_chromium_secondary function
    const secondaryFn = content.match(
      /start_chromium_secondary\(\)[\s\S]*?^}/m
    );
    expect(secondaryFn).not.toBeNull();
    const fnContent = secondaryFn![0];
    expect({
      usesAppMode: /--app=.*secondary/.test(fnContent) || /--app="\$\{?CHROMIUM_SECONDARY_URL/.test(fnContent),
      // Must NOT use --kiosk in the secondary function (forces fullscreen on primary)
      noKioskFlag: !/^\s*--kiosk\b/m.test(fnContent),
    }).toEqual({
      usesAppMode: true,
      noKioskFlag: true,
    });
  });

  // E-23 US-23.4.2: Primary Chromium must ALWAYS use --app= mode (never --kiosk).
  // --kiosk takes the entire X11 virtual desktop (both monitors) and prevents
  // zero-blackout transitions when switching between single and dual display.
  // With --app=, we can resize via xdotool without restarting Chromium.
  it('watchdog primary Chromium must use --app= mode (not --kiosk)', () => {
    const primaryFn = content.match(
      /start_chromium\(\) \{[\s\S]*?^}/m
    );
    expect(primaryFn).not.toBeNull();
    const fnContent = primaryFn![0];
    expect({
      usesAppMode: /--app="\$\{?CHROMIUM_URL/.test(fnContent),
      // Must NOT use --kiosk anywhere in common_flags or launch command
      noKioskInFlags: !/^\s*--kiosk\s*$/m.test(fnContent),
      // Must always apply xprop + xdotool for fullscreen (not conditional on DUAL_DISPLAY_ACTIVE)
      alwaysXprop: /_MOTIF_WM_HINTS/.test(fnContent),
      alwaysXdotoolSize: /xdotool.*windowsize/.test(fnContent),
    }).toEqual({
      usesAppMode: true,
      noKioskInFlags: true,
      alwaysXprop: true,
      alwaysXdotoolSize: true,
    });
  });

  // Bug fix v3.82.8: F11 fullscreen spans ENTIRE X11 virtual desktop (both monitors),
  // NOT per-monitor. Must use xprop _MOTIF_WM_HINTS (remove decorations) + xdotool
  // windowmove/windowsize for per-monitor fullscreen. F11 must NOT be used.
  it('watchdog secondary must use xprop _MOTIF_WM_HINTS + xdotool windowsize (NOT F11)', () => {
    const secondaryFn = content.match(
      /start_chromium_secondary\(\)[\s\S]*?^}/m
    );
    expect(secondaryFn).not.toBeNull();
    const fnContent = secondaryFn![0];
    expect({
      hasMotifWmHints: /_MOTIF_WM_HINTS/.test(fnContent),
      hasXdotoolWindowsize: /xdotool.*windowsize/.test(fnContent),
      hasXdotoolWindowmove: /xdotool.*windowmove/.test(fnContent),
      hasWindowSearch: /xdotool.*search.*pid/.test(fnContent),
      // F11 must NOT be used — it spans the entire X11 virtual desktop
      noF11: !/xdotool.*key.*F11/.test(fnContent),
    }).toEqual({
      hasMotifWmHints: true,
      hasXdotoolWindowsize: true,
      hasXdotoolWindowmove: true,
      hasWindowSearch: true,
      noF11: true,
    });
  });

  // Guard: primary Chromium in dual-display mode must also use xprop + xdotool (not F11)
  it('watchdog primary in dual-display must use xprop _MOTIF_WM_HINTS + xdotool windowsize (NOT F11)', () => {
    const primaryFn = content.match(
      /start_chromium\(\) \{[\s\S]*?^}/m
    );
    expect(primaryFn).not.toBeNull();
    const fnContent = primaryFn![0];
    expect({
      hasMotifWmHints: /_MOTIF_WM_HINTS/.test(fnContent),
      hasXdotoolWindowsize: /xdotool.*windowsize/.test(fnContent),
      hasXdotoolWindowmove: /xdotool.*windowmove/.test(fnContent),
      // F11 must NOT be used anywhere in start_chromium
      noF11: !/xdotool.*key.*F11/.test(fnContent),
    }).toEqual({
      hasMotifWmHints: true,
      hasXdotoolWindowsize: true,
      hasXdotoolWindowmove: true,
      noF11: true,
    });
  });

  // Bug fix v3.82.2: xrandr detection must use position offset, not "primary" keyword.
  // Pi 5 doesn't show "primary" in xrandr output.
  it('watchdog xrandr detection must use position offset (not "primary" keyword)', () => {
    // The setup_secondary_xrandr function must check for offset +0+0, not grep "primary"
    const xrandrFn = content.match(
      /setup_secondary_xrandr\(\)[\s\S]*?^}/m
    );
    expect(xrandrFn).not.toBeNull();
    const fnContent = xrandrFn![0];
    expect({
      // Must check x_offset for primary detection (offset-based, not keyword-based)
      checksOffset: /x_offset.*==.*"0"/.test(fnContent) || /x_offset.*-eq.*0/.test(fnContent),
      // Must NOT rely on "primary" keyword for initial detection
      // (it's OK in fallback/stop functions, but not in main detection logic)
      usesOffsetDetection: /offset.*non-nul|offset.*0/.test(fnContent),
    }).toEqual({
      checksOffset: true,
      usesOffsetDetection: true,
    });
  });

  // Guard: secondary Chromium must have separate --user-data-dir to avoid
  // sharing session/cookies with primary (causes tab conflicts).
  it('watchdog secondary must use separate --user-data-dir', () => {
    const secondaryFn = content.match(
      /start_chromium_secondary\(\)[\s\S]*?^}/m
    );
    expect(secondaryFn).not.toBeNull();
    expect({
      hasSeparateUserDataDir: /--user-data-dir=.*secondary/.test(secondaryFn![0]),
    }).toEqual({
      hasSeparateUserDataDir: true,
    });
  });

  // Guard: secondary Chromium must have --window-position and --window-size
  // to place the window on the correct monitor.
  it('watchdog secondary must set --window-position and --window-size', () => {
    const secondaryFn = content.match(
      /start_chromium_secondary\(\)[\s\S]*?^}/m
    );
    expect(secondaryFn).not.toBeNull();
    const fnContent = secondaryFn![0];
    expect({
      hasWindowPosition: /--window-position=/.test(fnContent),
      hasWindowSize: /--window-size=/.test(fnContent),
    }).toEqual({
      hasWindowPosition: true,
      hasWindowSize: true,
    });
  });
});

describe('E-23 HDMI hotplug udev and notify', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('udev rules file must exist for HDMI hotplug', () => {
    const rulesPath = path.join(repoRoot, 'raspberry/config/udev/99-neopro-hdmi-hotplug.rules');
    expect({ rulesFileExists: fs.existsSync(rulesPath) })
      .toEqual({ rulesFileExists: true });

    const content = fs.readFileSync(rulesPath, 'utf8');
    expect({
      hasDrmSubsystem: content.includes('SUBSYSTEM=="drm"'),
      hasChangeAction: content.includes('ACTION=="change"'),
      hasNotifyScript: content.includes('neopro-hdmi-notify.sh'),
    }).toEqual({
      hasDrmSubsystem: true,
      hasChangeAction: true,
      hasNotifyScript: true,
    });
  });

  it('neopro-hdmi-notify.sh must write flag file atomically', () => {
    const scriptPath = path.join(repoRoot, 'raspberry/scripts/neopro-hdmi-notify.sh');
    expect({ scriptExists: fs.existsSync(scriptPath) })
      .toEqual({ scriptExists: true });

    const content = fs.readFileSync(scriptPath, 'utf8');
    expect({
      hasFlagFile: content.includes('/tmp/hdmi-changed'),
      hasMktemp: content.includes('mktemp'),
      hasMv: content.includes('mv '),
    }).toEqual({
      hasFlagFile: true,
      hasMktemp: true,
      hasMv: true,
    });
  });

  it('kiosk-watchdog.sh must check HDMI flag file for fast hotplug reaction', () => {
    const watchdogContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    expect({
      hasFlagFile: watchdogContent.includes('HDMI_FLAG_FILE'),
      hasHdmiTriggered: watchdogContent.includes('hdmi_triggered'),
      hasUdevLog: watchdogContent.includes('HDMI hotplug détecté (udev)'),
    }).toEqual({
      hasFlagFile: true,
      hasHdmiTriggered: true,
      hasUdevLog: true,
    });
  });

  it('build-raspberry.sh must include neopro-hdmi-notify.sh in runtime scripts', () => {
    const buildScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/build-raspberry.sh'),
      'utf8'
    );
    expect({ hasHdmiNotify: buildScript.includes('neopro-hdmi-notify.sh') })
      .toEqual({ hasHdmiNotify: true });
  });
});

describe('E-23 HDMI monitoring and alerts wiring', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('state.service.js must have HDMI state methods', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/state.service.js'),
      'utf8'
    );
    expect({
      hasHdmiState: content.includes('_hdmiState'),
      hasGetHdmiState: content.includes('getHdmiState'),
      hasUpdateHdmiState: content.includes('updateHdmiState'),
      hasGetConnectedClients: content.includes('getConnectedClients'),
    }).toEqual({
      hasHdmiState: true,
      hasGetHdmiState: true,
      hasUpdateHdmiState: true,
      hasGetConnectedClients: true,
    });
  });

  it('handlers.js must wire hdmi-status-update and get-connected-clients events', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/socket/handlers.js'),
      'utf8'
    );
    expect({
      hasHdmiStatusUpdate: content.includes("'hdmi-status-update'"),
      hasGetHdmiState: content.includes("'get-hdmi-state'"),
      hasGetConnectedClients: content.includes("'get-connected-clients'"),
      hasHdmiAlert: content.includes("'hdmi-alert'"),
      hasHdmiService: content.includes('hdmiService'),
    }).toEqual({
      hasHdmiStatusUpdate: true,
      hasGetHdmiState: true,
      hasGetConnectedClients: true,
      hasHdmiAlert: true,
      hasHdmiService: true,
    });
  });

  it('tv-register handler must capture userAgent and ip from socket handshake', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/socket/handlers.js'),
      'utf8'
    );
    expect({
      hasUserAgent: content.includes("socket.handshake?.headers?.['user-agent']"),
      hasIp: content.includes('socket.handshake?.address'),
    }).toEqual({
      hasUserAgent: true,
      hasIp: true,
    });
  });

  it('sync-agent must fetch HDMI state and connected clients for heartbeat', () => {
    const content = [
      'raspberry/sync-agent/src/agent.js',
      'raspberry/sync-agent/src/services/heartbeat.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({
      hasFetchHdmi: content.includes('fetchLocalHdmiState'),
      hasFetchClients: content.includes('fetchLocalConnectedClients'),
      hasHeartbeatHdmi: content.includes('hdmiStatus'),
      hasHeartbeatClients: content.includes('connectedClients'),
    }).toEqual({
      hasFetchHdmi: true,
      hasFetchClients: true,
      hasHeartbeatHdmi: true,
      hasHeartbeatClients: true,
    });
  });

  it('heartbeat.handler.ts must process hdmiStatus and create HDMI alerts', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
      'utf8'
    );
    expect({
      hasHdmiStatus: content.includes('hdmiStatus'),
      hasNoDisplayAlert: content.includes("'no_display'"),
      hasWrongPortAlert: content.includes("'hdmi_wrong_port'"),
      hasDashboardEmit: content.includes("'hdmi_status_updated'"),
    }).toEqual({
      hasHdmiStatus: true,
      hasNoDisplayAlert: true,
      hasWrongPortAlert: true,
      hasDashboardEmit: true,
    });
  });

  // Display type cross-validation: heartbeat must detect monitor manufacturers classified as TV
  // Incident: 05/03/2026 — LEN L27i-30 classified as TV by sync-agent, undetected by central
  it('heartbeat.handler.ts must cross-validate display_type with manufacturer (monitorOnlyMfg)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
      'utf8'
    );
    expect({
      hasMonitorOnlyMfg: /monitorOnlyMfg/.test(content),
      hasLEN: content.includes('LEN'),
      hasDEL: content.includes('DEL'),
      hasMisclassificationAlert: content.includes("'display_type_misclassification'"),
      recordsMetric: content.includes('recordDisplayTypeMisclassification'),
    }).toEqual({
      hasMonitorOnlyMfg: true,
      hasLEN: true,
      hasDEL: true,
      hasMisclassificationAlert: true,
      recordsMetric: true,
    });
  });

  it('metrics.service.ts must have neopro_display_type_misclassification_total counter', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/metrics.service.ts'),
      'utf8'
    );
    expect({
      hasCounter: content.includes('neopro_display_type_misclassification_total'),
      hasMethod: content.includes('recordDisplayTypeMisclassification'),
    }).toEqual({
      hasCounter: true,
      hasMethod: true,
    });
  });

  it('prometheus rules.yml must have DisplayTypeMisclassification alert', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'docker/prometheus/rules.yml'),
      'utf8'
    );
    expect({
      hasAlert: content.includes('DisplayTypeMisclassification'),
      hasMetric: content.includes('neopro_display_type_misclassification_total'),
    }).toEqual({
      hasAlert: true,
      hasMetric: true,
    });
  });

  it('HeartbeatMessage type must include hdmiStatus and connectedClients', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/types/index.ts'),
      'utf8'
    );
    expect({
      hasHdmiStatus: content.includes('hdmiStatus'),
      hasConnectedClients: content.includes('connectedClients'),
    }).toEqual({
      hasHdmiStatus: true,
      hasConnectedClients: true,
    });
  });

  // Pi 5 CEC false positive guard: getFullStatus() must cross-check CEC tv_connected
  // with EDID/DRM display.connected and devices_found before returning.
  // Without this guard, cec-client returns "power status:" even without a cable on Pi 5,
  // causing the dashboard to show "✅ Connecté" when nothing is plugged in.
  it('hdmi.service.js getFullStatus must override CEC false positive when no EDID and no devices', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/hdmi.service.js'),
      'utf8'
    );
    // Must have the cross-check guard in getFullStatus
    // Use method definition boundary (newline + 2-space indent) to avoid matching
    // the this._findEdidPath() CALL inside getDisplayInfo() which appears earlier.
    const fullStatusFn = content.slice(
      content.indexOf('async getFullStatus()'),
      content.indexOf('\n  _findEdidPath()')
    );
    expect({
      hasCecTvConnectedCheck: fullStatusFn.includes('cec.tv_connected'),
      hasDevicesFoundCheck: fullStatusFn.includes('cec.devices_found === 0'),
      hasDisplayConnectedCheck: fullStatusFn.includes('!display.connected'),
      overridesTvConnected: fullStatusFn.includes('cec.tv_connected = false'),
      overridesTvPower: fullStatusFn.includes('cec.tv_power = null'),
    }).toEqual({
      hasCecTvConnectedCheck: true,
      hasDevicesFoundCheck: true,
      hasDisplayConnectedCheck: true,
      overridesTvConnected: true,
      overridesTvPower: true,
    });
  });

  // Display type classification: monitors with CEA extension must not be falsely classified as TV.
  // Incident: 05/03/2026 — Lenovo L27i-30 (LEN) classified as "tv" because CEA EDID extension
  // triggered display_type='tv'. PC-only manufacturers must be filtered out.
  it('hdmi.service.js must filter monitor-only manufacturers in CEA extension check', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/hdmi.service.js'),
      'utf8'
    );
    // getDisplayInfo must have monitorOnlyMfg regex BEFORE the CEA extension assignment
    const getDisplayInfoFn = content.slice(
      content.indexOf('async getDisplayInfo()'),
      content.indexOf('\n  async getFullStatus()')
    );
    expect({
      hasMonitorMfgFilter: /monitorOnlyMfg/.test(getDisplayInfoFn),
      filterBeforeCea: getDisplayInfoFn.indexOf('monitorOnlyMfg') < getDisplayInfoFn.indexOf("display_type = 'tv'"),
      hasLEN: /LEN/.test(getDisplayInfoFn),
      hasDEL: /DEL/.test(getDisplayInfoFn),
    }).toEqual({
      hasMonitorMfgFilter: true,
      filterBeforeCea: true,
      hasLEN: true,
      hasDEL: true,
    });
  });

  it('hdmi.service.js _inferDisplayCategory must accept manufacturer as 4th param and early-return monitor', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/hdmi.service.js'),
      'utf8'
    );
    // _inferDisplayCategory signature must have 4 params including manufacturer
    expect({
      has4thParam: /_inferDisplayCategory\s*\(\s*model\s*,\s*displayType\s*,\s*edidDetailed\s*,\s*manufacturer\s*\)/.test(content),
      hasMonitorManufacturers: /monitorManufacturers/.test(content),
      returnsMonitor: content.includes("return 'monitor'"),
    }).toEqual({
      has4thParam: true,
      hasMonitorManufacturers: true,
      returnsMonitor: true,
    });
    // getFullStatus must pass display.manufacturer as 4th arg
    expect({
      passesManufacturer: /display\.manufacturer\s*\)/.test(content),
    }).toEqual({
      passesManufacturer: true,
    });
  });

  // Sync-agent metrics.js must have the same monitorOnlyMfg filter as hdmi.service.js
  // Incident: 05/03/2026 — LEN L27i-30 (Lenovo monitor) classified as TV by sync-agent
  // because metrics.js had hasCeaExtension → 'tv' without manufacturer filter.
  // Modern monitors include CEA extensions for HDMI audio/YCbCr compatibility.
  it('metrics.js getDisplayInfo must filter monitorOnlyMfg BEFORE CEA → tv assignment', () => {
    // Display logic extracted to display-metrics.js (ADR-044)
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/metrics/display-metrics.js'),
      'utf8'
    );
    const getDisplayInfoFn = content.slice(
      content.indexOf('async function getDisplayInfo()'),
      content.indexOf('async function getSecondaryDisplayInfo()')
    );
    expect({
      hasMonitorMfgFilter: /monitorOnlyMfg/.test(getDisplayInfoFn),
      filterBeforeCea: getDisplayInfoFn.indexOf('monitorOnlyMfg') < getDisplayInfoFn.indexOf("display_type = 'tv'"),
      hasLEN: /LEN/.test(getDisplayInfoFn),
      hasDEL: /DEL/.test(getDisplayInfoFn),
    }).toEqual({
      hasMonitorMfgFilter: true,
      filterBeforeCea: true,
      hasLEN: true,
      hasDEL: true,
    });
  });

  it('metrics.js getSecondaryDisplayInfo must also filter monitorOnlyMfg BEFORE CEA → tv', () => {
    // Display logic extracted to display-metrics.js (ADR-044)
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/metrics/display-metrics.js'),
      'utf8'
    );
    const getSecondaryFn = content.slice(
      content.indexOf('async function getSecondaryDisplayInfo()'),
      content.indexOf('async function getHdmiCecStatus()')
    );
    expect({
      hasMonitorMfgFilter: /monitorOnlyMfg/.test(getSecondaryFn),
      filterBeforeCea: getSecondaryFn.indexOf('monitorOnlyMfg') < getSecondaryFn.indexOf("display_type = 'tv'"),
      hasLEN: /LEN/.test(getSecondaryFn),
    }).toEqual({
      hasMonitorMfgFilter: true,
      filterBeforeCea: true,
      hasLEN: true,
    });
  });

  it('metrics.js _inferDisplayCategory must accept manufacturer as 4th param and early-return monitor', () => {
    // Display logic extracted to display-metrics.js (ADR-044)
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/metrics/display-metrics.js'),
      'utf8'
    );
    expect({
      has4thParam: /inferDisplayCategory\s*\(\s*model\s*,\s*displayType\s*,\s*edidDetailed\s*,\s*manufacturer\s*\)/.test(content),
      hasMonitorOnlyMfg: /monitorOnlyMfg/.test(content.slice(content.indexOf('inferDisplayCategory('))),
      returnsMonitor: content.slice(content.indexOf('inferDisplayCategory(')).includes("return 'monitor'"),
    }).toEqual({
      has4thParam: true,
      hasMonitorOnlyMfg: true,
      returnsMonitor: true,
    });
    // Callers must pass manufacturer as 4th arg (callers in metrics.js orchestrator, ADR-044)
    const orchestrator = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js'),
      'utf8'
    );
    expect({
      primaryPassesMfg: /displayInfo\.display_category\s*=\s*this\._inferDisplayCategory\(\s*\n?\s*displayInfo\.model,\s*displayInfo\.display_type,\s*displayInfo\.edid_detailed,\s*displayInfo\.manufacturer/.test(orchestrator),
      secondaryPassesMfg: /secondaryDisplayInfo\.display_category\s*=\s*this\._inferDisplayCategory\(\s*\n?\s*secondaryDisplayInfo\.model,\s*secondaryDisplayInfo\.display_type,\s*secondaryDisplayInfo\.edid_detailed,\s*secondaryDisplayInfo\.manufacturer/.test(orchestrator),
    }).toEqual({
      primaryPassesMfg: true,
      secondaryPassesMfg: true,
    });
  });

  // Boot-to-video metric: hdmiDetectedAt must be captured on first HDMI status received
  // while connected, not only on disconnected→connected transition.
  // Incident: 05/03/2026 — hdmiConnected defaults to true (line 58), so wasDisconnected
  // is always false at boot → hdmiDetectedAt never set → boot-to-video always 0ms.
  it('tv.component.ts boot metric must NOT require wasDisconnected for hdmiDetectedAt', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'),
      'utf8'
    );
    // The hdmiDetectedAt assignment must NOT be gated behind wasDisconnected
    // (wasDisconnected is false at boot because hdmiConnected defaults to true)
    expect({
      hasHdmiDetectedAt: content.includes('bootMetrics.hdmiDetectedAt'),
      noWasDisconnectedGuard: !/wasDisconnected\s*&&[^;]*hdmiDetectedAt/.test(content),
    }).toEqual({
      hasHdmiDetectedAt: true,
      noWasDisconnectedGuard: true,
    });
  });

  // tv.component primary display must accept HDMI-0 OR HDMI-1 (auto-swap/failover)
  // When screen is on HDMI-1 only, hdmiConnected must still be true.
  it('tv.component.ts hdmiConnected must use hdmi0 OR hdmi1 for primary display', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'),
      'utf8'
    );
    expect({
      usesHdmi0OrHdmi1: /hdmiConnected\s*=\s*data\.hdmi0\s*\|\|\s*data\.hdmi1/.test(content),
      noHdmi0Only: !/hdmiConnected\s*=\s*data\.hdmi0\s*;/.test(content),
    }).toEqual({
      usesHdmi0OrHdmi1: true,
      noHdmi0Only: true,
    });
  });
});

describe('E-23 check_secondary_chromium transition guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  it('check_secondary_chromium: dual→single uses Chromium relaunch (xdotool viewport bug), single→dual uses xdotool resize', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // Extract the check_secondary_chromium function body
    const funcStart = content.indexOf('check_secondary_chromium() {');
    const funcBody = content.slice(funcStart, funcStart + 7000);
    // Single→dual transition: xdotool resize is OK (shrinking viewport, no CSS bug)
    // Dual→single transition: must RELAUNCH Chromium because xdotool windowsize alone
    // does NOT force Chromium to re-render its CSS viewport (window grows but content
    // stays at old resolution = zoom effect). Same fix as activate_hdmi_failover().
    expect({
      hasDualNoRestart: funcBody.includes('sans restart'),
      hasSingleRelaunch: funcBody.includes('Retour en single-display: relance'),
      hasStopPrimary: funcBody.includes('stop_chromium_primary'),
      hasStartChromium: funcBody.includes('start_chromium'),
    }).toEqual({
      hasDualNoRestart: true,
      hasSingleRelaunch: true,
      hasStopPrimary: true,
      hasStartChromium: true,
    });
  });

  // Bug fix: when switching single→dual display, xrandr reconfigures the X11 layout
  // and the WM (openbox/LXDE) restacks lxpanel ABOVE Chromium. Without re-applying
  // xprop _MOTIF_WM_HINTS + xdotool windowactivate, the taskbar stays visible on
  // the primary screen. The same applies to deactivate_hdmi_failover() return path.
  it('single→dual and failover-return resize must re-apply xprop + windowactivate (taskbar fix)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // Extract check_secondary_chromium function (contains single→dual transition)
    const checkSecStart = content.indexOf('check_secondary_chromium() {');
    const checkSecBody = content.slice(checkSecStart, checkSecStart + 5000);
    // The single→dual transition block (DUAL_DISPLAY_ACTIVE != true) must have
    // xprop + windowactivate alongside windowmove + windowsize
    const singleToDualBlock = checkSecBody.match(
      /DUAL_DISPLAY_ACTIVE.*!=.*true[\s\S]*?start_chromium_secondary/
    );
    expect(singleToDualBlock).not.toBeNull();
    const block = singleToDualBlock![0];
    expect({
      hasXprop: block.includes('_MOTIF_WM_HINTS'),
      hasWindowActivate: block.includes('windowactivate'),
      hasWindowSize: block.includes('windowsize'),
    }).toEqual({
      hasXprop: true,
      hasWindowActivate: true,
      hasWindowSize: true,
    });

    // Extract deactivate_hdmi_failover function
    const deactivateStart = content.indexOf('deactivate_hdmi_failover()');
    const deactivateBody = content.slice(deactivateStart, deactivateStart + 4500);
    // The resize block in deactivate_hdmi_failover must also re-apply xprop + windowactivate
    expect({
      hasXprop: deactivateBody.includes('_MOTIF_WM_HINTS'),
      hasWindowActivate: deactivateBody.includes('windowactivate'),
      hasWindowSize: deactivateBody.includes('windowsize'),
    }).toEqual({
      hasXprop: true,
      hasWindowActivate: true,
      hasWindowSize: true,
    });
  });

  // Bug fix: start_chromium() fullscreen subshell must have a retry loop, not a single attempt.
  // On slow Pis (SD card wear), Chromium may take >4s to create its X11 window.
  // Without retry, fullscreen is never applied and there is no recovery.
  it('start_chromium fullscreen subshell must have retry loop (not single sleep+attempt)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const fnStart = content.indexOf('start_chromium() {');
    const fnBody = content.slice(fnStart, fnStart + 8000);
    // The fullscreen subshell must retry multiple times
    expect({
      hasRetryLoop: /for attempt in.*seq.*max_attempts/.test(fnBody),
      hasMaxAttempts: /max_attempts=[0-9]/.test(fnBody),
      hasProcessCheck: /kill -0.*CHROMIUM_PID/.test(fnBody),
      hasRetryLog: /retry/.test(fnBody),
      hasXprop: /_MOTIF_WM_HINTS/.test(fnBody),
      hasWindowSize: /xdotool.*windowsize/.test(fnBody),
      hasWindowMove: /xdotool.*windowmove/.test(fnBody),
    }).toEqual({
      hasRetryLoop: true,
      hasMaxAttempts: true,
      hasProcessCheck: true,
      hasRetryLog: true,
      hasXprop: true,
      hasWindowSize: true,
      hasWindowMove: true,
    });
  });

  // Bug fix: check_window_stacking() must apply full fullscreen (xprop + windowmove + windowsize)
  // on every loop iteration, not just xprop + windowactivate on panel-above.
  // This is the safety net: if the init subshell failed, the main loop catches it.
  it('check_window_stacking must apply windowmove + windowsize (not just windowactivate)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const fnStart = content.indexOf('check_window_stacking() {');
    const fnEnd = content.indexOf('\n}', fnStart);
    const fnBody = content.slice(fnStart, fnEnd);
    expect({
      hasXprop: fnBody.includes('_MOTIF_WM_HINTS'),
      hasWindowMove: /xdotool.*windowmove/.test(fnBody),
      hasWindowSize: /xdotool.*windowsize/.test(fnBody),
      hasWindowActivate: /xdotool.*windowactivate/.test(fnBody),
    }).toEqual({
      hasXprop: true,
      hasWindowMove: true,
      hasWindowSize: true,
      hasWindowActivate: true,
    });
  });

  it('kiosk-watchdog must have activate/deactivate_hdmi_failover functions (US-23.6.2)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    expect({
      hasActivate: content.includes('activate_hdmi_failover()'),
      hasDeactivate: content.includes('deactivate_hdmi_failover()'),
      hasStopPrimary: content.includes('stop_chromium_primary'),
      hasFailoverFlag: content.includes('/tmp/hdmi-failover-active'),
      hasGpuCleanup: content.includes('GPU cleanup'),
    }).toEqual({
      hasActivate: true,
      hasDeactivate: true,
      hasStopPrimary: true,
      hasFailoverFlag: true,
      hasGpuCleanup: true,
    });
  });

  it('check_secondary_chromium must handle HDMI failover (HDMI-0 lost during dual-display)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('check_secondary_chromium() {');
    const funcBody = content.slice(funcStart, funcStart + 1500);
    // Failover checks must come BEFORE normal dual-display logic
    expect({
      hasFailoverDetection: funcBody.includes('DUAL_DISPLAY_ACTIVE') && funcBody.includes('detect_hdmi0_status') && funcBody.includes('activate_hdmi_failover'),
      hasFailoverRecovery: funcBody.includes('HDMI_FAILOVER_ACTIVE') && funcBody.includes('deactivate_hdmi_failover'),
      hasFailoverGuard: funcBody.includes('HDMI_FAILOVER_ACTIVE') && funcBody.includes('return'),
    }).toEqual({
      hasFailoverDetection: true,
      hasFailoverRecovery: true,
      hasFailoverGuard: true,
    });
  });

  it('activate_hdmi_failover must kill secondary, reconfigure xrandr, and relaunch via start_chromium', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('activate_hdmi_failover()');
    const funcBody = content.slice(funcStart, funcStart + 4000);
    expect({
      // Must disable ghost output so X11 virtual screen collapses
      hasGhostOff: funcBody.includes('--off'),
      // Must reposition remaining output to origin (otherwise stays at dual-display offset)
      hasPos0x0: funcBody.includes('--pos 0x0'),
      // Must sleep after xrandr to let GPU settle
      hasSleepAfterXrandr: funcBody.includes('sleep 1'),
      // Must re-query dimensions after xrandr reconfiguration
      hasRequery: funcBody.includes('xrandr --query') && funcBody.includes('failover_w'),
      // Must kill old secondary (xdotool resize alone doesn't update Chromium viewport)
      killsSecondary: funcBody.includes('kill -TERM') && funcBody.includes('SECONDARY_CHROMIUM_PID'),
      // Must relaunch via start_chromium for correct viewport
      relaunchesChromium: funcBody.includes('start_chromium'),
    }).toEqual({
      hasGhostOff: true,
      hasPos0x0: true,
      hasSleepAfterXrandr: true,
      hasRequery: true,
      killsSecondary: true,
      relaunchesChromium: true,
    });
  });

  it('setup_secondary_xrandr grep must match xrandr lines with "primary" keyword', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('setup_secondary_xrandr()');
    const funcBody = content.slice(funcStart, funcStart + 2000);
    // The grep in setup_secondary_xrandr must handle both:
    //   "HDMI-A-1 connected 1920x1080+0+0"          (no primary keyword)
    //   "HDMI-A-2 connected primary 3840x2160+0+0"   (with primary keyword)
    // Old regex '^HDMI.* connected [0-9]' misses the primary keyword case.
    const grepLine = funcBody.match(/grep -E '\^HDMI\.\* connected.*'/)?.[0] ?? '';
    expect(grepLine).toContain('primary');
  });

  it('deactivate_hdmi_failover must kill failover Chromium (CHROMIUM_PID) and restore dual-display', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('deactivate_hdmi_failover()');
    const funcBody = content.slice(funcStart, funcStart + 4500);
    expect({
      // Must kill the failover Chromium (which was launched via start_chromium → CHROMIUM_PID)
      stopsFailoverChromium: funcBody.includes('kill -TERM') && funcBody.includes('CHROMIUM_PID'),
      // Must NOT reference SECONDARY_CHROMIUM_PID (failover now uses start_chromium)
      noSecondaryPidKill: !funcBody.includes('kill -TERM "$SECONDARY_CHROMIUM_PID"'),
      reconfiguresXrandr: funcBody.includes('setup_secondary_xrandr'),
      relaunchesPrimary: funcBody.includes('start_chromium'),
      relaunchesSecondary: funcBody.includes('start_chromium_secondary'),
    }).toEqual({
      stopsFailoverChromium: true,
      noSecondaryPidKill: true,
      reconfiguresXrandr: true,
      relaunchesPrimary: true,
      relaunchesSecondary: true,
    });
  });

  it('deactivate_hdmi_failover must force HDMI-0 (HDMI-A-1) as primary BEFORE setup_secondary_xrandr', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('deactivate_hdmi_failover()');
    const funcBody = content.slice(funcStart, funcStart + 4000);

    // After failover, HDMI-1 is at +0+0 (promoted). setup_secondary_xrandr identifies
    // primary by offset → HDMI-1 would stay primary without explicit xrandr reconfiguration.
    // deactivate_hdmi_failover MUST force HDMI-A-1 back to primary BEFORE setup_secondary_xrandr.
    const forceHdmi0Idx = funcBody.search(/HDMI.*-1 connected/);
    // Match the actual function call, not comments mentioning setup_secondary_xrandr
    const setupXrandrIdx = funcBody.indexOf('setup_secondary_xrandr ||');

    expect({
      // Must detect HDMI-A-1 (physical HDMI-0) by xrandr name
      detectsHdmi0ByName: /HDMI.*-1 connected/.test(funcBody),
      // Must force HDMI-0 as primary with --primary --auto --pos 0x0
      forcesHdmi0Primary: funcBody.includes('--primary --auto --pos 0x0'),
      // Must place HDMI-1 --right-of HDMI-0
      placesHdmi1RightOf: funcBody.includes('--right-of'),
      // Force must happen BEFORE setup_secondary_xrandr
      forceBeforeSetup: forceHdmi0Idx > 0 && setupXrandrIdx > 0 && forceHdmi0Idx < setupXrandrIdx,
    }).toEqual({
      detectsHdmi0ByName: true,
      forcesHdmi0Primary: true,
      placesHdmi1RightOf: true,
      forceBeforeSetup: true,
    });
  });

  it('main watchdog loop must skip check_chromium_alive during HDMI failover (prevents parasitic restart)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // Find the check_chromium_alive call in the main loop (not the function definition)
    const mainLoopMatch = content.match(
      /HDMI_FAILOVER_ACTIVE.*!=.*true.*&&.*!.*check_chromium_alive/
    );
    expect(mainLoopMatch).not.toBeNull();
    // Ensure there is NO unguarded check_chromium_alive that sets need_restart
    const unguardedPattern =
      /if\s+!\s*check_chromium_alive;\s*then\s*\n\s*need_restart=true/;
    expect(unguardedPattern.test(content)).toBe(false);
  });

  it('stop_chromium_primary must use SIGTERM before SIGKILL (GPU-safe, US-23.6.3)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const funcStart = content.indexOf('stop_chromium_primary()');
    const funcBody = content.slice(funcStart, funcStart + 1500);
    expect({
      hasSigterm: funcBody.includes('kill -TERM'),
      hasSigkillFallback: funcBody.includes('kill -9'),
      hasShmCleanup: funcBody.includes('.org.chromium'),
      hasSync: funcBody.includes('sync'),
    }).toEqual({
      hasSigterm: true,
      hasSigkillFallback: true,
      hasShmCleanup: true,
      hasSync: true,
    });
  });

  it('handlers.js must emit tv-role-promotion and tv-role-demotion for HDMI failover', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/socket/handlers.js'),
      'utf8'
    );
    expect({
      hasPromotion: content.includes("'tv-role-promotion'"),
      hasDemotion: content.includes("'tv-role-demotion'"),
      hasFailoverCheck: content.includes('hdmi-failover-active'),
    }).toEqual({
      hasPromotion: true,
      hasDemotion: true,
      hasFailoverCheck: true,
    });
  });
});

describe('E-22 TvComponent master-slave sync guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const tvPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(tvPath, 'utf8');
  });

  // Guard: slave must pause players when role is assigned (stop independent loop)
  // After ADR-042 extraction, the handler delegates to doubleBufferService.pauseLoopPlayers()
  it('tv-role-assigned handler must pause playerA and playerB when slave', () => {
    // Extract the tv-role-assigned handler
    const roleHandler = content.match(/on.*tv-role-assigned[\s\S]*?}\);[\s]*}\);/);
    expect(roleHandler).not.toBeNull();
    const handler = roleHandler![0];
    expect({
      pausesPlayers: /pauseLoopPlayers/.test(handler),
      checksIsLoopMode: /isLoopMode/.test(handler),
      showsFreezeFrame: /captureAndShowFreezeFrame/.test(handler),
    }).toEqual({
      pausesPlayers: true,
      checksIsLoopMode: true,
      showsFreezeFrame: true,
    });
  });

  // Guard: startSeamlessLoop must NOT play independently when in slave mode
  // After ADR-042 extraction, startSeamlessLoop lives in video-playback.service.ts
  it('startSeamlessLoop must return early when isSlaveMode', () => {
    const playbackPath = path.join(repoRoot, 'raspberry/src/app/services/video-playback.service.ts');
    const playbackContent = fs.readFileSync(playbackPath, 'utf8');
    const loopFn = playbackContent.match(/startSeamlessLoop[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?\}, 500\);[\s\S]*?\}/);
    expect(loopFn).not.toBeNull();
    const fn = loopFn![0];
    expect({
      checksSlaveMode: /getIsSlaveMode|isSlaveMode/.test(fn),
      returnsEarlyForSlave: /if\s*\(.*(?:isSlaveMode|getIsSlaveMode).*\)[\s\S]*?return;/.test(fn),
    }).toEqual({
      checksSlaveMode: true,
      returnsEarlyForSlave: true,
    });
  });

  // Guard: handleMasterLoopState must use index-based sync (NOT path-based findIndex)
  it('handleMasterLoopState must sync by videoIndex not by path findIndex', () => {
    const syncFn = content.match(/private handleMasterLoopState[\s\S]*?^  \}/m);
    expect(syncFn).not.toBeNull();
    const fn = syncFn![0];
    expect({
      usesVideoIndex: /state\.videoIndex\s*%/.test(fn),
      noPathFindIndex: !/findIndex\(v\s*=>\s*v\.path\s*===\s*state\.videoPath\)/.test(fn),
      hasSeek: /player\.currentTime\s*=\s*elapsed/.test(fn),
    }).toEqual({
      usesVideoIndex: true,
      noPathFindIndex: true,
      hasSeek: true,
    });
  });

  // Guard: onVideoEnded must show freeze frame and return when in slave mode
  // After ADR-042 extraction, onVideoEnded lives in video-playback.service.ts
  it('onVideoEnded must freeze and wait for master when slave', () => {
    const playbackPath = path.join(repoRoot, 'raspberry/src/app/services/video-playback.service.ts');
    const playbackContent = fs.readFileSync(playbackPath, 'utf8');
    // Extract method body between onVideoEnded and the next top-level method
    const startIdx = playbackContent.indexOf('onVideoEnded(');
    const nextMethodIdx = playbackContent.indexOf('\n  /**', startIdx + 1);
    const fn = nextMethodIdx > 0
      ? playbackContent.slice(startIdx, nextMethodIdx)
      : playbackContent.slice(startIdx, startIdx + 1500);
    expect(fn.length).toBeGreaterThan(50);
    expect({
      checksSlaveMode: /getIsSlaveMode|isSlaveMode/.test(fn),
      showsFreezeFrame: /captureAndShowFreezeFrame/.test(fn),
      returnsEarlyForSlave: /(?:isSlaveMode|getIsSlaveMode)[\s\S]*?return;/.test(fn),
    }).toEqual({
      checksSlaveMode: true,
      showsFreezeFrame: true,
      returnsEarlyForSlave: true,
    });
  });

  // Guard: manual videos must resolve display variant before play
  it('manual video commands must use resolveDisplayVariant before play', () => {
    // handleTvCommand must resolve display variant
    const commandHandler = content.match(/private handleTvCommand[\s\S]*?^  \}/m)
      || content.match(/on\('action'[\s\S]*?}\);/);
    expect(commandHandler).not.toBeNull();
    expect(commandHandler![0]).toMatch(/resolveDisplayVariant/);

    // handleMasterLoopState CAS 1 must resolve display variant
    const masterHandler = content.match(/private handleMasterLoopState[\s\S]*?^  \}/m);
    expect(masterHandler).not.toBeNull();
    expect(masterHandler![0]).toMatch(/resolveDisplayVariant/);
  });

  // Guard: resolveDisplayVariant must exist and look up config when variants missing
  it('resolveDisplayVariant must exist and search config for variants', () => {
    expect({
      hasMethod: /private resolveDisplayVariant/.test(content),
      checksDisplayType: /this\.displayType\s*===\s*'tv'/.test(content),
      hasFindInConfig: /private findVideoInConfig/.test(content),
      searchesSponsors: /this\.configuration\.sponsors/.test(content),
      searchesCategories: /this\.configuration\.categories/.test(content),
    }).toEqual({
      hasMethod: true,
      checksDisplayType: true,
      hasFindInConfig: true,
      searchesSponsors: true,
      searchesCategories: true,
    });
  });
});

describe('E-23 US-23.7.5: analytics displayType guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const tvPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');
  const tvContent = fs.readFileSync(tvPath, 'utf-8');

  it('all trackVideoStart calls must be guarded by displayType === tv', () => {
    // Find all lines that call trackVideoStart
    const lines = tvContent.split('\n');
    const trackStartLines = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(l => l.line.includes('trackVideoStart'));

    expect(trackStartLines.length).toBeGreaterThanOrEqual(3);

    // Each trackVideoStart must be preceded (within 12 lines) by a displayType === 'tv' guard
    for (const { num } of trackStartLines) {
      const context = lines.slice(Math.max(0, num - 13), num).join(' ');
      expect(context).toMatch(/displayType\s*===\s*'tv'/);
    }
  });

  it('all trackVideoEnd calls must be guarded by displayType === tv', () => {
    const lines = tvContent.split('\n');
    const trackEndLines = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(l => l.line.includes('trackVideoEnd'));

    expect(trackEndLines.length).toBeGreaterThanOrEqual(3);

    for (const { num } of trackEndLines) {
      const context = lines.slice(Math.max(0, num - 6), num).join(' ');
      expect(context).toMatch(/displayType\s*===\s*'tv'/);
    }
  });
});

describe('E-23 S6: LED status script', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const ledScript = path.join(repoRoot, 'raspberry/scripts/neopro-led-status.sh');

  it('neopro-led-status.sh must exist and be executable', () => {
    expect(fs.existsSync(ledScript)).toBe(true);
    const stat = fs.statSync(ledScript);
    expect(stat.mode & 0o111).toBeGreaterThan(0);
  });

  it('neopro-led-status.sh must support heartbeat, slow-blink, fast-blink, default patterns', () => {
    const content = fs.readFileSync(ledScript, 'utf8');
    expect(content).toMatch(/heartbeat/);
    expect(content).toMatch(/slow-blink/);
    expect(content).toMatch(/fast-blink/);
    expect(content).toMatch(/default/);
    expect(content).toMatch(/sys\/class\/leds/);
  });
});

describe('E-23 S6: buzzer script', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const buzzerScript = path.join(repoRoot, 'raspberry/scripts/neopro-buzzer.sh');

  it('neopro-buzzer.sh must exist and be executable', () => {
    expect(fs.existsSync(buzzerScript)).toBe(true);
    const stat = fs.statSync(buzzerScript);
    expect(stat.mode & 0o111).toBeGreaterThan(0);
  });

  it('neopro-buzzer.sh must use PWM on GPIO 18 with correct frequency', () => {
    const content = fs.readFileSync(buzzerScript, 'utf8');
    expect(content).toMatch(/pwmchip0/);
    expect(content).toMatch(/500000/); // 2000 Hz period
    expect(content).toMatch(/single|double|triple/);
  });
});

describe('E-23 S6: webapp homepage and PWA manifest', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const webappIndex = path.join(repoRoot, 'raspberry/webapp/index.html');
  const webappManifest = path.join(repoRoot, 'raspberry/webapp/manifest.json');

  it('webapp index.html must exist with TV link', () => {
    expect(fs.existsSync(webappIndex)).toBe(true);
    const content = fs.readFileSync(webappIndex, 'utf8');
    expect(content).toMatch(/displayType=secondary/);
    expect(content).toMatch(/\/admin\//);
    expect(content).toMatch(/\/remote/);
  });

  it('webapp manifest.json must exist with correct metadata', () => {
    expect(fs.existsSync(webappManifest)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(webappManifest, 'utf8'));
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });
});

describe('E-23 S6: kiosk-watchdog LED/buzzer integration', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const watchdogPath = path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(watchdogPath, 'utf8');
  });

  it('kiosk-watchdog must have set_led_pattern helper function', () => {
    expect(content).toMatch(/set_led_pattern\(\)/);
    expect(content).toMatch(/neopro-led-status\.sh/);
  });

  it('kiosk-watchdog must have buzzer_beep helper function', () => {
    expect(content).toMatch(/buzzer_beep\(\)/);
    expect(content).toMatch(/neopro-buzzer\.sh/);
  });

  it('kiosk-watchdog must call LED patterns for HDMI states', () => {
    expect(content).toMatch(/set_led_pattern\s+"fast-blink"/);
    expect(content).toMatch(/set_led_pattern\s+"slow-blink"/);
    expect(content).toMatch(/set_led_pattern\s+"heartbeat"/);
  });

  it('kiosk-watchdog must call buzzer for HDMI alerts', () => {
    expect(content).toMatch(/buzzer_beep\s+"double"/);
    expect(content).toMatch(/buzzer_beep\s+"triple"/);
  });
});

describe('E-22 server-side TV sync guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const handlersPath = path.join(repoRoot, 'raspberry/server/socket/handlers.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(handlersPath, 'utf8');
  });

  it('tv-register must assign role and send loopState to slaves', () => {
    expect({
      emitsRoleAssigned: /socket\.emit\('tv-role-assigned'/.test(content),
      sendsLoopStateToSlave: /socket\.emit\('tv-loop-state'.*getLoopState/.test(content),
      checksRoleSlave: /role\s*===\s*'slave'/.test(content),
    }).toEqual({
      emitsRoleAssigned: true,
      sendsLoopStateToSlave: true,
      checksRoleSlave: true,
    });
  });

  it('tv-loop-update must broadcast only from master', () => {
    expect({
      checksMaster: /isTvMaster\(socket\.id\)/.test(content),
      broadcastsToSlaves: /socket\.broadcast\.emit\('tv-loop-state'/.test(content),
    }).toEqual({
      checksMaster: true,
      broadcastsToSlaves: true,
    });
  });
});

describe('E-22 TvComponent variant selection guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const tvPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(tvPath, 'utf8');
  });

  it('TvComponent must check display variants for video selection', () => {
    expect({
      checksVariants: /variants\?\.\[this\.displayType\]/.test(content),
    }).toEqual({
      checksVariants: true,
    });
  });
});

describe('Video variant display_type alignment guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const repoPath = path.join(repoRoot, 'central-server/src/repositories/video-variant.repository.ts');
  const controllerPath = path.join(repoRoot, 'central-server/src/controllers/content.controller.ts');

  let repoContent: string;
  let controllerContent: string;
  beforeAll(() => {
    repoContent = fs.readFileSync(repoPath, 'utf8');
    controllerContent = fs.readFileSync(controllerPath, 'utf8');
  });

  it('DisplayType must be open string type (N-display Phase 5)', () => {
    expect({
      isStringType: /DisplayType\s*=\s*string/.test(repoContent),
      noLed: !/DisplayType\s*=.*'led'/.test(repoContent),
    }).toEqual({
      isStringType: true,
      noLed: true,
    });
  });

  it('createVideoVariant controller must validate "secondary" (not "led")', () => {
    // The controller validates display_type with an includes check
    expect({
      validatesSecondary: /\['tv',\s*'secondary'\]/.test(controllerContent),
      noLedValidation: !/\['tv',\s*'led'\]/.test(controllerContent),
    }).toEqual({
      validatesSecondary: true,
      noLedValidation: true,
    });
  });
});

describe('Deployment secondary variant persistence guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const servicePath = path.join(repoRoot, 'central-server/src/services/deployment.service.ts');
  const repoPath = path.join(repoRoot, 'central-server/src/repositories/deployment.repository.ts');
  const schemaPath = path.join(repoRoot, 'central-server/src/scripts/full-schema.sql');

  let serviceContent: string;
  let repoContent: string;
  let schemaContent: string;

  beforeAll(() => {
    serviceContent = fs.readFileSync(servicePath, 'utf8');
    repoContent = fs.readFileSync(repoPath, 'utf8');
    schemaContent = fs.readFileSync(schemaPath, 'utf8');
  });

  it('deployToSite must persist has_secondary_variant flag', () => {
    expect({
      updatesFlag: /has_secondary_variant\s*=\s*true/.test(serviceContent),
    }).toEqual({
      updatesFlag: true,
    });
  });

  it('deployment repository queries must SELECT has_secondary_variant', () => {
    expect({
      inVideoDeployments: /findDeploymentsForVideo[\s\S]*?has_secondary_variant/.test(repoContent),
      inAllDetails: /findAllWithDetails[\s\S]*?has_secondary_variant/.test(repoContent),
      inDetails: /findWithDetails[\s\S]*?has_secondary_variant/.test(repoContent),
    }).toEqual({
      inVideoDeployments: true,
      inAllDetails: true,
      inDetails: true,
    });
  });

  it('full-schema.sql must include has_secondary_variant column', () => {
    expect({
      hasColumn: /has_secondary_variant\s+BOOLEAN/.test(schemaContent),
    }).toEqual({
      hasColumn: true,
    });
  });

  it('deployment.service must NOT gate secondary variant lookup on secondary_display_enabled', () => {
    expect({
      noSiteQuery: !/query\(.*secondary_display_enabled/.test(serviceContent),
      noSiteFlag: !/siteSecondaryEnabled/.test(serviceContent),
      alwaysLooksUp: /findByVideoAndDisplay\(videoId,\s*'secondary'\)/.test(serviceContent),
    }).toEqual({
      noSiteQuery: true,
      noSiteFlag: true,
      alwaysLooksUp: true,
    });
  });
});

describe('Angular build config guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const angularJsonPath = path.join(repoRoot, 'angular.json');

  let angularConfig: {
    projects: Record<
      string,
      {
        architect: {
          build: {
            options: { allowedCommonJsDependencies?: string[] };
            configurations: Record<
              string,
              { budgets?: { type: string; maximumWarning: string; maximumError: string }[] }
            >;
          };
        };
      }
    >;
  };

  beforeAll(() => {
    angularConfig = JSON.parse(fs.readFileSync(angularJsonPath, 'utf8'));
  });

  it('central-dashboard must allow leaflet as CommonJS dependency', () => {
    const allowed =
      angularConfig.projects['central-dashboard']?.architect?.build?.options
        ?.allowedCommonJsDependencies ?? [];
    expect(allowed).toContain('leaflet');
  });

  it('central-dashboard production budget for anyComponentStyle must be >= 48kb warning', () => {
    const budgets =
      angularConfig.projects['central-dashboard']?.architect?.build?.configurations?.production
        ?.budgets ?? [];
    const componentBudget = budgets.find((b) => b.type === 'anyComponentStyle');
    expect(componentBudget).toBeDefined();
    const warningKb = parseInt(componentBudget!.maximumWarning, 10);
    expect(warningKb).toBeGreaterThanOrEqual(48);
  });
});

describe('Secondary variant badge wiring guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // Central Server
  const sitesControllerPath = path.join(
    repoRoot,
    'central-server/src/controllers/sites.controller.ts',
  );
  // Dashboard — read all .ts files in content-tab dir (includes sub-components)
  const contentTabDir = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/components/site-content-tab',
  );
  // Pi Remote
  const remoteTemplatePath = path.join(
    repoRoot,
    'raspberry/src/app/components/remote/remote.component.html',
  );
  const videoInterfacePath = path.join(
    repoRoot,
    'raspberry/src/app/interfaces/video.interface.ts',
  );

  const readAllTsInDir = (dir: string): string => {
    let result = '';
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) result += readAllTsInDir(fullPath);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) result += fs.readFileSync(fullPath, 'utf8') + '\n';
      else if (entry.name.endsWith('.html')) result += fs.readFileSync(fullPath, 'utf8') + '\n';
    }
    return result;
  };

  let controllerContent: string;
  let siteContentTabContent: string;
  let remoteTemplateContent: string;
  let videoInterfaceContent: string;

  beforeAll(() => {
    // Read main controller + sub-controllers (split from monolithic sites.controller.ts)
    const controllerDir = path.dirname(sitesControllerPath);
    controllerContent = fs.readFileSync(sitesControllerPath, 'utf8')
      + '\n' + fs.readFileSync(path.join(controllerDir, 'site-fleet.controller.ts'), 'utf8')
      + '\n' + fs.readFileSync(path.join(controllerDir, 'site-commands.controller.ts'), 'utf8')
      + '\n' + fs.readFileSync(path.join(controllerDir, 'site-debug.controller.ts'), 'utf8');
    siteContentTabContent = readAllTsInDir(contentTabDir);
    remoteTemplateContent = fs.readFileSync(remoteTemplatePath, 'utf8');
    videoInterfaceContent = fs.readFileSync(videoInterfacePath, 'utf8');
  });

  it('getSiteLocalContent must return secondaryVariantVideoIds', () => {
    expect({
      returnsVariantIds: /secondaryVariantVideoIds/.test(controllerContent),
      callsVariantRepo: /findSecondaryVariantsForVideos/.test(controllerContent),
    }).toEqual({
      returnsVariantIds: true,
      callsVariantRepo: true,
    });
  });

  it('site-content-tab must wire secondary variant badge', () => {
    expect({
      hasBadgeClass: /secondary-variant-badge/.test(siteContentTabContent),
      hasHelperMethod: /hasSecondaryVariantForPath/.test(siteContentTabContent),
      hasVariantSet: /secondaryVariantVideoIds/.test(siteContentTabContent),
    }).toEqual({
      hasBadgeClass: true,
      hasHelperMethod: true,
      hasVariantSet: true,
    });
  });

  it('remote template must have video-secondary-badge for variant indicator (no config gate)', () => {
    expect({
      hasBadge: /video-secondary-badge/.test(remoteTemplateContent),
      checksVariants: /video\.variants\?\.secondary/.test(remoteTemplateContent),
      noConfigGate: !/secondaryDisplayEnabled/.test(remoteTemplateContent),
    }).toEqual({
      hasBadge: true,
      checksVariants: true,
      noConfigGate: true,
    });
  });

  it('Video interface must type variants.secondary', () => {
    expect({
      hasVariantsField: /variants\?[\s\S]*?secondary/.test(videoInterfaceContent),
    }).toEqual({
      hasVariantsField: true,
    });
  });
});

describe('Secondary video deployment UI guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  const cloudRemoteHtmlPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/remote/cloud-remote.component.html',
  );
  const cloudRemoteTsPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/remote/cloud-remote.component.ts',
  );
  const cloudRemoteScssPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/remote/cloud-remote.component.scss',
  );
  const siteDetailPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/site-detail.component.ts',
  );
  const remoteControllerPath = path.join(
    repoRoot,
    'central-server/src/controllers/remote.controller.ts',
  );
  const contentTabDir2 = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/components/site-content-tab',
  );
  const remoteServicePath = path.join(
    repoRoot,
    'central-dashboard/src/app/core/services/remote.service.ts',
  );
  const sitesServicePath = path.join(
    repoRoot,
    'central-dashboard/src/app/core/services/sites.service.ts',
  );

  const readAllTsInDir2 = (dir: string): string => {
    let result = '';
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) result += readAllTsInDir2(fullPath);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) result += fs.readFileSync(fullPath, 'utf8') + '\n';
    }
    return result;
  };

  let cloudRemoteHtml: string;
  let cloudRemoteTs: string;
  let cloudRemoteScss: string;
  let siteDetailContent: string;
  let remoteControllerContent: string;
  let siteContentTabContent: string;
  let remoteServiceContent: string;
  let sitesServiceContent: string;

  beforeAll(() => {
    cloudRemoteHtml = fs.readFileSync(cloudRemoteHtmlPath, 'utf8');
    cloudRemoteTs = fs.readFileSync(cloudRemoteTsPath, 'utf8');
    cloudRemoteScss = fs.readFileSync(cloudRemoteScssPath, 'utf8');
    siteDetailContent = fs.readFileSync(siteDetailPath, 'utf8') +
      fs.readFileSync(siteDetailPath.replace('.component.ts', '.component.html'), 'utf8');
    remoteControllerContent = fs.readFileSync(remoteControllerPath, 'utf8');
    siteContentTabContent = readAllTsInDir2(contentTabDir2);
    remoteServiceContent = fs.readFileSync(remoteServicePath, 'utf8');
    sitesServiceContent = fs.readFileSync(sitesServicePath, 'utf8');
  });

  it('cloud remote HTML must show video-secondary-badge for videos with secondary variants', () => {
    expect({
      hasBadgeClass: /video-secondary-badge/.test(cloudRemoteHtml),
      checksHasSecondary: /hasSecondaryVariant/.test(cloudRemoteHtml),
      noDisplayEnabledGate: !/secondaryDisplayEnabled/.test(cloudRemoteHtml),
    }).toEqual({
      hasBadgeClass: true,
      checksHasSecondary: true,
      noDisplayEnabledGate: true,
    });
  });

  it('cloud remote TS must have markSecondaryVariants and secondaryVariantPaths', () => {
    expect({
      hasMarkMethod: /markSecondaryVariants/.test(cloudRemoteTs),
      hasVariantPaths: /secondaryVariantPaths/.test(cloudRemoteTs),
      noDisplayEnabledProperty: !/public secondaryDisplayEnabled/.test(cloudRemoteTs),
      hasVideoFlag: /hasSecondaryVariant/.test(cloudRemoteTs),
    }).toEqual({
      hasMarkMethod: true,
      hasVariantPaths: true,
      noDisplayEnabledProperty: true,
      hasVideoFlag: true,
    });
  });

  it('cloud remote SCSS must style video-secondary-badge', () => {
    expect(/\.video-secondary-badge/.test(cloudRemoteScss)).toBe(true);
  });

  it('remote controller must always enrich secondary variants (no site flag gate)', () => {
    expect({
      exportsVariantPaths: /secondaryVariantPaths/.test(remoteControllerContent),
      importsVariantRepo: /videoVariantRepository/.test(remoteControllerContent),
      noSiteGate: !/if \(site\.secondary_display_enabled\)/.test(remoteControllerContent),
    }).toEqual({
      exportsVariantPaths: true,
      importsVariantRepo: true,
      noSiteGate: true,
    });
  });

  it('RemoteState interface must include secondaryVariantPaths', () => {
    expect({
      hasVariantPaths: /secondaryVariantPaths/.test(remoteServiceContent),
    }).toEqual({
      hasVariantPaths: true,
    });
  });

  it('site-detail must show badge-secondary-display when secondary_display_enabled', () => {
    expect({
      hasBadge: /badge-secondary-display/.test(siteDetailContent),
      checksEnabled: /secondary_display_enabled/.test(siteDetailContent),
      hasResolution: /secondary_display_resolution/.test(siteDetailContent),
    }).toEqual({
      hasBadge: true,
      checksEnabled: true,
      hasResolution: true,
    });
  });

  it('pending deployments must show secondary variant badge when has_secondary_variant', () => {
    expect({
      hasDeployBadge: /deployment\.has_secondary_variant/.test(siteContentTabContent),
    }).toEqual({
      hasDeployBadge: true,
    });
  });

  it('PendingDeployment interface must include has_secondary_variant field', () => {
    expect(/has_secondary_variant/.test(sitesServiceContent)).toBe(true);
  });
});

describe('Resolution detection cascade', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('DEFAULT_SCREEN_WIDTH constant must be defined as a positive integer', () => {
    const match = watchdog.match(/^DEFAULT_SCREEN_WIDTH=(\d+)$/m);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  it('DEFAULT_SCREEN_HEIGHT constant must be defined as a positive integer', () => {
    const match = watchdog.match(/^DEFAULT_SCREEN_HEIGHT=(\d+)$/m);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  it('get_output_resolution() cascade function must exist', () => {
    expect(watchdog).toMatch(/^get_output_resolution\s*\(\)/m);
  });

  it('no raw 1920 magic number outside constant definitions and comments', () => {
    // Split into lines, filter out constant defs and comment-only lines
    const codeLines = watchdog.split('\n').filter((line) => {
      const trimmed = line.trim();
      // Skip comment lines
      if (trimmed.startsWith('#')) return false;
      // Skip the constant definition itself
      if (/^DEFAULT_SCREEN_WIDTH=\d+$/.test(trimmed)) return false;
      return true;
    });
    const rawUsages = codeLines.filter((line) => /\b1920\b/.test(line));
    expect(rawUsages).toEqual([]);
  });

  it('no raw 1080 magic number outside constant definitions and comments', () => {
    const codeLines = watchdog.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) return false;
      if (/^DEFAULT_SCREEN_HEIGHT=\d+$/.test(trimmed)) return false;
      return true;
    });
    const rawUsages = codeLines.filter((line) => /\b1080\b/.test(line));
    expect(rawUsages).toEqual([]);
  });

  it('SECONDARY_X_OFFSET must derive from PRIMARY_SCREEN_WIDTH, not hardcoded', () => {
    // Must use $PRIMARY_SCREEN_WIDTH or $DEFAULT_SCREEN_WIDTH, not a raw number
    expect(watchdog).toMatch(/SECONDARY_X_OFFSET.*PRIMARY_SCREEN_WIDTH/);
  });

  it('DISPLAY_FALLBACK_REASON must be defined and included in kiosk status', () => {
    expect(watchdog).toMatch(/^DISPLAY_FALLBACK_REASON=/m);
    expect(watchdog).toContain('displayFallback');
  });

  it('xrandr preferred mode parsing (cascade level 2) must detect "+" marker', () => {
    // The cascade must parse xrandr mode list for the preferred mode (marked with +)
    expect(watchdog).toMatch(/preferred_res/);
    expect(watchdog).toMatch(/\+/);
  });

  it('write_kiosk_status must include primaryResolution and secondaryResolution', () => {
    // kiosk-status.json must expose screen resolutions for heartbeat → dashboard pipeline
    expect(watchdog).toContain('primaryResolution');
    expect(watchdog).toContain('secondaryResolution');
    // Must use bash parameter expansion ${VAR:+...} to avoid "x" when empty
    expect(watchdog).toMatch(/PRIMARY_SCREEN_WIDTH:\+/);
    expect(watchdog).toMatch(/SECONDARY_SCREEN_WIDTH:\+/);
  });

  it('single-display boot must detect primary resolution via get_output_resolution', () => {
    // Bug: PRIMARY_SCREEN_WIDTH was empty ("") in single-display mode because
    // get_output_resolution was only called inside setup_secondary_xrandr (dual-display).
    // The single-display fallback (DUAL_DISPLAY_ACTIVE != true) must detect the primary resolution.
    expect(watchdog).toContain('Single-display');
    // After the dual-display boot check, there must be a single-display fallback block
    // (anchored near "start_chromium" in main()) that detects the primary resolution.
    const lines = watchdog.split('\n');
    // Find the boot section anchor: the "Dual-display" log that lives in main()
    const dualDisplayLogIdx = lines.findIndex(l =>
      l.includes('Dual-display') && l.includes('au d')
    );
    expect(dualDisplayLogIdx).toBeGreaterThan(0);
    // The DUAL_DISPLAY_ACTIVE != true check must come AFTER the dual-display boot check
    const singleDisplayCheckIdx = lines.findIndex((l, i) =>
      i > dualDisplayLogIdx &&
      l.includes('DUAL_DISPLAY_ACTIVE') && l.includes('!= "true"') && l.includes('then')
    );
    expect(singleDisplayCheckIdx).toBeGreaterThan(dualDisplayLogIdx);
    // Find the fi that closes this block at the SAME indentation level (not inner fi's)
    const openingIndent = lines[singleDisplayCheckIdx].match(/^(\s*)/)?.[1] ?? '';
    const fiIdx = lines.findIndex((l, i) =>
      i > singleDisplayCheckIdx && i < singleDisplayCheckIdx + 30 &&
      new RegExp(`^${openingIndent}fi$`).test(l)
    );
    expect(fiIdx).toBeGreaterThan(singleDisplayCheckIdx);
    const singleDisplayBlock = lines.slice(singleDisplayCheckIdx, fiIdx + 1).join('\n');
    expect(singleDisplayBlock).toContain('get_output_resolution');
    expect(singleDisplayBlock).toContain('PRIMARY_SCREEN_WIDTH');
  });

  // Bug fix v3.98.5: DUAL_DISPLAY_ACTIVE must only be set AFTER setup_secondary_xrandr succeeds.
  // Before this fix, DUAL_DISPLAY_ACTIVE was set to true BEFORE setup_secondary_xrandr,
  // which swallowed failures with || true. When a Pi has only one HDMI port active
  // (e.g., only HDMI-A-2 visible in xrandr), setup_secondary_xrandr fails → but
  // DUAL_DISPLAY_ACTIVE stays true → main loop triggers false failover → kills
  // and restarts Chromium → LXDE desktop visible during transition.
  it('DUAL_DISPLAY_ACTIVE must be set AFTER setup_secondary_xrandr succeeds (not before)', () => {
    const lines = watchdog.split('\n');

    // Find the boot section (anchored by "Dual-display" log) where setup_secondary_xrandr
    // is called. Must be: if setup_secondary_xrandr; then → DUAL_DISPLAY_ACTIVE=true
    // NOT: DUAL_DISPLAY_ACTIVE=true ... setup_secondary_xrandr || true
    const dualDisplayLogIdx = lines.findIndex(l =>
      l.includes('Dual-display') && l.includes('au d')
    );
    expect(dualDisplayLogIdx).toBeGreaterThan(0);

    // Walk backwards from the "Dual-display" log to find the if setup_secondary_xrandr
    // (it must be within 10 lines before the log)
    const bootSetupIdx = lines.findIndex((l, i) =>
      i > dualDisplayLogIdx - 10 && i < dualDisplayLogIdx &&
      l.includes('setup_secondary_xrandr') && l.includes('if')
    );
    expect({ setupGuardedByIf: bootSetupIdx > 0 }).toEqual({ setupGuardedByIf: true });

    // DUAL_DISPLAY_ACTIVE=true must be between setup check and log
    const dualActiveIdx = lines.findIndex((l, i) =>
      i > bootSetupIdx && i <= dualDisplayLogIdx && l.includes('DUAL_DISPLAY_ACTIVE=true')
    );
    expect({ dualActiveAfterSetup: dualActiveIdx > bootSetupIdx }).toEqual({ dualActiveAfterSetup: true });

    // The else branch after the dual-display log must set DUAL_DISPLAY_ACTIVE=false
    const elseIdx = lines.findIndex((l, i) =>
      i > dualDisplayLogIdx && i < dualDisplayLogIdx + 5 && l.trim() === 'else'
    );
    const dualFalseIdx = lines.findIndex((l, i) =>
      i > elseIdx && i < elseIdx + 5 && l.includes('DUAL_DISPLAY_ACTIVE=false')
    );
    expect({ fallbackToSingleDisplay: dualFalseIdx > elseIdx }).toEqual({ fallbackToSingleDisplay: true });
  });

  // Bug fix v3.98.5: setup_secondary_xrandr must NEVER be called with || true in sections
  // that determine DUAL_DISPLAY_ACTIVE. The return code is the source of truth for display mode.
  // Swallowing errors with || true prevents detecting that only one screen is connected.
  it('setup_secondary_xrandr must not use || true when determining DUAL_DISPLAY_ACTIVE', () => {
    const lines = watchdog.split('\n');

    // Boot section: anchored by "Dual-display" log in main()
    const dualDisplayLogIdx = lines.findIndex(l =>
      l.includes('Dual-display') && l.includes('au d')
    );
    expect(dualDisplayLogIdx).toBeGreaterThan(0);

    // Search the boot section (20 lines before/after the dual-display log)
    const bootSection = lines.slice(Math.max(0, dualDisplayLogIdx - 20), dualDisplayLogIdx + 10).join('\n');
    expect({ bootNoOrTrue: !bootSection.includes('setup_secondary_xrandr || true') })
      .toEqual({ bootNoOrTrue: true });

    // check_secondary_chromium function: anchored by "Passage en dual-display" log
    const funcStart = watchdog.indexOf('check_secondary_chromium() {');
    const funcBody = watchdog.slice(funcStart, funcStart + 7000);
    // The single_to_dual transition must NOT use || true
    const transitionSection = funcBody.slice(funcBody.indexOf('single_to_dual'));
    const transitionBlock = transitionSection.slice(0, transitionSection.indexOf('start_chromium_secondary') > 0
      ? transitionSection.indexOf('start_chromium_secondary')
      : 500);
    expect({ mainLoopNoOrTrue: !transitionBlock.includes('setup_secondary_xrandr || true') })
      .toEqual({ mainLoopNoOrTrue: true });
  });

  // Bug fix v3.98.5: check_secondary_chromium must also guard DUAL_DISPLAY_ACTIVE behind
  // setup_secondary_xrandr success (same pattern as boot section).
  it('check_secondary_chromium must guard DUAL_DISPLAY_ACTIVE behind setup_secondary_xrandr', () => {
    const funcStart = watchdog.indexOf('check_secondary_chromium() {');
    expect(funcStart).toBeGreaterThan(0);
    const funcBody = watchdog.slice(funcStart, funcStart + 7000);

    // In the single→dual transition, setup_secondary_xrandr must be called with if/!
    const transitionIdx = funcBody.indexOf('single_to_dual');
    expect(transitionIdx).toBeGreaterThan(0);
    const afterTransition = funcBody.slice(transitionIdx, transitionIdx + 1200);

    // Must have: if ! setup_secondary_xrandr; then ... return
    expect({ hasGuardedSetup: afterTransition.includes('! setup_secondary_xrandr') })
      .toEqual({ hasGuardedSetup: true });
    expect({ hasReturnOnFailure: afterTransition.includes('return') })
      .toEqual({ hasReturnOnFailure: true });

    // DUAL_DISPLAY_ACTIVE=true must come AFTER the guard check
    const setupIdx = afterTransition.indexOf('! setup_secondary_xrandr');
    const dualActiveIdx = afterTransition.indexOf('DUAL_DISPLAY_ACTIVE=true');
    expect({ dualActiveAfterGuard: dualActiveIdx > setupIdx })
      .toEqual({ dualActiveAfterGuard: true });
  });

  // Bug fix v3.98.5: FAILOVER_GRACE_PERIOD must exist to prevent false failover during
  // EDID/DRM stabilization (~15s after boot).
  it('kiosk-watchdog.sh must have FAILOVER_GRACE_PERIOD for boot HDMI stabilization', () => {
    expect(watchdog).toContain('FAILOVER_GRACE_PERIOD=');
    expect(watchdog).toContain('BOOT_CHROMIUM_AT=');

    // The failover check must use the grace period
    const funcStart = watchdog.indexOf('check_secondary_chromium() {');
    const funcBody = watchdog.slice(funcStart, funcStart + 3000);
    expect({ hasGracePeriodCheck: funcBody.includes('FAILOVER_GRACE_PERIOD') })
      .toEqual({ hasGracePeriodCheck: true });
  });
});

describe('Screen resolution heartbeat pipeline (Pi → Central → Dashboard)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('HeartbeatMessage type must include primaryResolution and secondaryResolution in kioskStatus', () => {
    const types = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/types/index.ts'),
      'utf8'
    );
    expect(types).toContain('primaryResolution');
    expect(types).toContain('secondaryResolution');
  });

  it('heartbeat handler must forward resolutions as hdmi0Resolution and hdmi1Resolution', () => {
    const handler = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
      'utf8'
    );
    expect(handler).toContain('hdmi0Resolution');
    expect(handler).toContain('hdmi1Resolution');
    // Must read from kioskStatus (not hardcoded)
    expect(handler).toMatch(/kioskStatus\?\.primaryResolution/);
    expect(handler).toMatch(/kioskStatus\?\.secondaryResolution/);
  });

  it('dashboard site-detail component must display screen resolutions', () => {
    const tsFile = path.join(repoRoot, 'central-dashboard/src/app/features/sites/site-detail.component.ts');
    const htmlFile = tsFile.replace('.component.ts', '.component.html');
    const component = fs.readFileSync(tsFile, 'utf8') + fs.readFileSync(htmlFile, 'utf8');
    // Must reference resolution data from hdmiStatus
    expect(component).toContain('hdmi0Resolution');
    expect(component).toContain('hdmi1Resolution');
    // Must have CSS class for resolution display
    expect(component).toContain('screen-resolution');
  });
});

describe('Secondary display EDID pipeline (health status)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  // metrics.js delegates display to display-metrics.js (ADR-044)
  const metricsFiles = [
    'raspberry/sync-agent/src/metrics.js',
    'raspberry/sync-agent/src/metrics/display-metrics.js',
  ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
  const debugTabDir = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-debug-tab');
  // Read all .ts files in the debug-tab directory tree (sub-components included)
  const readAllTsInDir = (dir: string): string => {
    let result = '';
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) result += readAllTsInDir(fullPath);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) result += fs.readFileSync(fullPath, 'utf8') + '\n';
    }
    return result;
  };
  const debugTab = readAllTsInDir(debugTabDir);

  it('metrics.js _findEdidPath must accept optional port filter parameter', () => {
    // findEdidPath must accept a portFilter to target HDMI-A-2 specifically
    expect(metricsFiles).toMatch(/findEdidPath\s*\(\s*portFilter\s*\)/);
    // Must filter hdmiEntries when portFilter is provided
    expect(metricsFiles).toContain('portFilter');
  });

  it('metrics.js getHealthStatus must include secondaryDisplayInfo from getSecondaryDisplayInfo()', () => {
    // getSecondaryDisplayInfo must exist
    expect(metricsFiles).toMatch(/function getSecondaryDisplayInfo\(\)/);
    // Must target HDMI-A-2 specifically
    expect(metricsFiles).toMatch(/findEdidPath\s*\(\s*'HDMI-A-2'\s*\)/);
    // Must be called in getHealthStatus Promise.all
    expect(metricsFiles).toContain('getSecondaryDisplayInfo()');
    // Must be included in getHealthStatus return
    expect(metricsFiles).toContain('secondaryDisplayInfo');
  });

  it('dashboard site-debug-tab must display secondaryDisplayInfo section', () => {
    // Must reference secondaryDisplayInfo in the template
    expect(debugTab).toContain('secondaryDisplayInfo');
    // Must have the interface field
    expect(debugTab).toContain('secondaryDisplayInfo?: DisplayInfo');
    // Must use translation key for secondary display title
    expect(debugTab).toContain("'debug.secondaryDisplay'");
  });
});

describe('TV viewport overflow guard (no 100vw in TV components)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const tvScssFiles = [
    'raspberry/src/app/components/tv/tv.component.scss',
    'raspberry/src/app/components/waiting-screen/waiting-screen.component.scss',
    'raspberry/src/app/components/wrong-port-screen/wrong-port-screen.component.scss',
  ];

  for (const file of tvScssFiles) {
    it(`${file} must NOT use 100vw (causes overflow on PC browsers with scrollbars)`, () => {
      const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      // Match actual CSS property usage of 100vw, not comments
      const lines = content.split('\n');
      const violations = lines
        .map((line, i) => ({ line: line.trim(), num: i + 1 }))
        .filter(({ line }) => !line.startsWith('//') && /:\s*100vw/.test(line));
      expect({
        violations: violations.map(v => `line ${v.num}: ${v.line}`),
        reason: '100vw includes scrollbar width on PC browsers — use 100% instead',
      }).toEqual({
        violations: [],
        reason: '100vw includes scrollbar width on PC browsers — use 100% instead',
      });
    });
  }

  it('styles.scss must hide scrollbars on TV route via body:has(app-tv)', () => {
    const styles = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/styles.scss'),
      'utf8'
    );
    expect({
      hasBodyAppTvRule: /body:has\(app-tv\)/.test(styles),
      hasOverflowHidden: /body:has\(app-tv\)\s*\{[^}]*overflow:\s*hidden/.test(styles),
    }).toEqual({
      hasBodyAppTvRule: true,
      hasOverflowHidden: true,
    });
  });
});

describe('TV video cropping guard (no object-fit: cover on video players)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const tvScss = 'raspberry/src/app/components/tv/tv.component.scss';

  const videoPlayerSelectors = ['.freeze-canvas', '.double-buffer-player', '.manual-player'];

  it('tv.component.scss video players must use object-fit: contain (not cover)', () => {
    const content = fs.readFileSync(path.join(repoRoot, tvScss), 'utf8');
    const lines = content.split('\n');
    const violations = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(
        ({ line }) => !line.startsWith('//') && /object-fit:\s*cover/.test(line)
      );
    expect({
      violations: violations.map(v => `line ${v.num}: ${v.line}`),
      reason:
        'object-fit: cover crops video edges on monitors with different aspect ratio — use contain',
    }).toEqual({
      violations: [],
      reason:
        'object-fit: cover crops video edges on monitors with different aspect ratio — use contain',
    });
  });

  for (const selector of videoPlayerSelectors) {
    it(`${selector} must have object-fit: contain`, () => {
      const content = fs.readFileSync(path.join(repoRoot, tvScss), 'utf8');
      // Extract the block for this selector
      const selectorEscaped = selector.replace('.', '\\.');
      const blockRegex = new RegExp(
        `${selectorEscaped}\\s*\\{[^}]*object-fit:\\s*contain[^}]*\\}`,
        's'
      );
      expect({
        selector,
        hasContain: blockRegex.test(content),
      }).toEqual({
        selector,
        hasContain: true,
      });
    });
  }
});

describe('E-41 deploySecondaryVariant timeCategories guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const deployVideoPath = path.join(repoRoot, 'raspberry/sync-agent/src/commands/deploy-video.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(deployVideoPath, 'utf8');
  });

  it('deploySecondaryVariant must update timeCategories[].loopVideos[]', () => {
    expect({
      handlesTimeCategories: /configuration\.timeCategories/.test(content),
      iteratesLoopVideos: /tc\.loopVideos|loopVideos\s*\|\|/.test(content),
    }).toEqual({
      handlesTimeCategories: true,
      iteratesLoopVideos: true,
    });
  });
});

describe('E-41 config-merge restoreSecondaryVariants guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const configMergePath = path.join(repoRoot, 'raspberry/sync-agent/src/utils/config-merge.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(configMergePath, 'utf8');
  });

  it('config-merge must call restoreSecondaryVariants after merge', () => {
    expect({
      callsRestore: /restoreSecondaryVariants\(/.test(content),
    }).toEqual({
      callsRestore: true,
    });
  });

  it('config-merge must export restoreSecondaryVariants', () => {
    expect({
      exportsRestore: /restoreSecondaryVariants/.test(content.split('module.exports')[1] || ''),
    }).toEqual({
      exportsRestore: true,
    });
  });
});

describe('E-41 update-config replace mode restoreSecondaryVariants guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const updateConfigPath = path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-config.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(updateConfigPath, 'utf8');
  });

  it('update-config must import restoreSecondaryVariants from config-merge', () => {
    // Check that the require('config-merge') destructuring includes restoreSecondaryVariants
    const configMergeRequire = content.match(/require\(['"]\.\.\/utils\/config-merge['"]\)/)?.[0] || '';
    const importLine = content.split('\n').find(l => l.includes('config-merge')) || '';
    expect({
      importsRestore: /restoreSecondaryVariants/.test(importLine),
    }).toEqual({
      importsRestore: true,
    });
  });

  it('update-config must call restoreSecondaryVariants after applyReplaceMode', () => {
    // Verify that restoreSecondaryVariants is called within the replace mode branch
    const replaceBlock = content.split("mode === 'replace'")[1]?.split('else')[0] || '';
    expect({
      callsRestore: /restoreSecondaryVariants\(/.test(replaceBlock),
    }).toEqual({
      callsRestore: true,
    });
  });
});

describe('E-41 central secondary variant enrichment guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const orchPath = path.join(repoRoot, 'central-server/src/services/orchestrated-deployment.service.ts');
  const syncPath = path.join(repoRoot, 'central-server/src/handlers/config-sync.handler.ts');

  let orchContent: string;
  let syncContent: string;
  beforeAll(() => {
    orchContent = fs.readFileSync(orchPath, 'utf8');
    syncContent = fs.readFileSync(syncPath, 'utf8');
  });

  it('orchestrated-deployment must import and call enrichConfigWithDisplayVariants', () => {
    expect({
      imports: /import\s*\{[^}]*enrichConfigWithDisplayVariants[^}]*\}/.test(orchContent),
      calls: /enrichConfigWithDisplayVariants\(/.test(orchContent),
    }).toEqual({
      imports: true,
      calls: true,
    });
  });

  it('config-sync handler must import and call enrichConfigWithDisplayVariants', () => {
    expect({
      imports: /import\s*\{[^}]*enrichConfigWithDisplayVariants[^}]*\}/.test(syncContent),
      calls: /enrichConfigWithDisplayVariants\(/.test(syncContent),
    }).toEqual({
      imports: true,
      calls: true,
    });
  });
});

describe('E-41 central analytics metadata enrichment guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const syncPath = path.join(repoRoot, 'central-server/src/handlers/config-sync.handler.ts');

  let syncContent: string;
  beforeAll(() => {
    syncContent = fs.readFileSync(syncPath, 'utf8');
  });

  it('config-sync handler must import enrichConfigWithAnalyticsMetadata', () => {
    expect(
      /import\s*\{[^}]*enrichConfigWithAnalyticsMetadata[^}]*\}/.test(syncContent)
    ).toBe(true);
  });

  it('config-sync handler must call enrichConfigWithAnalyticsMetadata()', () => {
    expect(
      /enrichConfigWithAnalyticsMetadata\(/.test(syncContent)
    ).toBe(true);
  });
});

describe('E-41 SponsorVideo/CategoryVideo analytics metadata type guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const typesPath = path.join(repoRoot, 'central-server/src/types/index.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(typesPath, 'utf8');
  });

  it('SponsorVideo must have video_id? and analytics_category? fields', () => {
    const sponsorBlock = content.match(/interface SponsorVideo \{[\s\S]*?\n\}/)?.[0] || '';
    expect({
      hasVideoId: /video_id\??\s*:/.test(sponsorBlock),
      hasAnalyticsCategory: /analytics_category\??\s*:/.test(sponsorBlock),
      hasAdvertiserId: /advertiser_id\??\s*:/.test(sponsorBlock),
    }).toEqual({
      hasVideoId: true,
      hasAnalyticsCategory: true,
      hasAdvertiserId: true,
    });
  });

  it('CategoryVideo must have video_id? and analytics_category? fields', () => {
    const categoryBlock = content.match(/interface CategoryVideo \{[\s\S]*?\n\}/)?.[0] || '';
    expect({
      hasVideoId: /video_id\??\s*:/.test(categoryBlock),
      hasAnalyticsCategory: /analytics_category\??\s*:/.test(categoryBlock),
    }).toEqual({
      hasVideoId: true,
      hasAnalyticsCategory: true,
    });
  });
});

describe('E-41 enrichConfigWithAnalyticsMetadata traversal guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const enrichPath = path.join(repoRoot, 'central-server/src/utils/config-analytics-metadata.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(enrichPath, 'utf8');
  });

  it('must traverse config.sponsors', () => {
    expect(/config\.sponsors/.test(content)).toBe(true);
  });

  it('must traverse category.videos', () => {
    expect(/category\.videos/.test(content)).toBe(true);
  });

  it('must traverse subCategories[].videos', () => {
    expect(/subCat\.videos|subCategories.*videos/.test(content)).toBe(true);
  });

  it('must traverse timeCategories[].loopVideos', () => {
    expect(/tc\.loopVideos|loopVideos/.test(content)).toBe(true);
  });
});

describe('E-41 SponsorVideo/CategoryVideo variants type guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const typesPath = path.join(repoRoot, 'central-server/src/types/index.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(typesPath, 'utf8');
  });

  it('SponsorVideo must have variants? field', () => {
    // Find the SponsorVideo interface block and check for variants
    const sponsorBlock = content.match(/interface SponsorVideo \{[\s\S]*?\n\}/)?.[0] || '';
    expect({
      hasVariants: /variants\??\s*:\s*VideoVariants/.test(sponsorBlock),
    }).toEqual({
      hasVariants: true,
    });
  });

  it('CategoryVideo must have variants? field', () => {
    const categoryBlock = content.match(/interface CategoryVideo \{[\s\S]*?\n\}/)?.[0] || '';
    expect({
      hasVariants: /variants\??\s*:\s*VideoVariants/.test(categoryBlock),
    }).toEqual({
      hasVariants: true,
    });
  });

  it('VideoVariants interface must exist with secondary field', () => {
    expect({
      hasVideoVariants: /interface VideoVariants/.test(content),
      hasSecondary: /secondary\??\s*:\s*VideoVariantInfo/.test(content),
    }).toEqual({
      hasVideoVariants: true,
      hasSecondary: true,
    });
  });
});

describe('E-41 secondary videos serving guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  describe('admin-server must serve /videos-secondary', () => {
    const adminServerPath = path.join(repoRoot, 'raspberry/admin/admin-server.js');
    let content: string;
    beforeAll(() => { content = fs.readFileSync(adminServerPath, 'utf8'); });

    it('admin-server must import SECONDARY_VIDEOS_DIR from helpers', () => {
      expect({
        importsSecondary: /SECONDARY_VIDEOS_DIR/.test(content),
      }).toEqual({
        importsSecondary: true,
      });
    });

    it('admin-server must register /videos-secondary static route', () => {
      expect({
        hasRoute: /app\.use\(['"]\/videos-secondary['"]/.test(content),
      }).toEqual({
        hasRoute: true,
      });
    });
  });

  describe('helpers must export SECONDARY_VIDEOS_DIR', () => {
    const pathsFile = path.join(repoRoot, 'raspberry/admin/paths.js');
    let content: string;
    beforeAll(() => { content = fs.readFileSync(pathsFile, 'utf8'); });

    it('paths.js must define SECONDARY_VIDEOS_DIR pointing to videos-secondary', () => {
      expect({
        definesSec: /SECONDARY_VIDEOS_DIR\s*=\s*.*videos-secondary/.test(content),
        exportsSec: /SECONDARY_VIDEOS_DIR/.test(content.split('module.exports')[1] || ''),
      }).toEqual({
        definesSec: true,
        exportsSec: true,
      });
    });
  });

  describe('Nginx config must serve /videos-secondary', () => {
    const nginxConfPath = path.join(repoRoot, 'raspberry/config/nginx/neopro-hls.conf');
    let content: string;
    beforeAll(() => { content = fs.readFileSync(nginxConfPath, 'utf8'); });

    it('Nginx must have location /videos-secondary/ proxying to admin-server', () => {
      expect({
        hasLocation: /location\s+\/videos-secondary\//.test(content),
        proxiesToAdmin: /proxy_pass\s+http:\/\/127\.0\.0\.1:8080\/videos-secondary\//.test(content),
      }).toEqual({
        hasLocation: true,
        proxiesToAdmin: true,
      });
    });
  });

  describe('install.sh must include /videos-secondary location', () => {
    const installPath = path.join(repoRoot, 'raspberry/install.sh');
    let content: string;
    beforeAll(() => { content = fs.readFileSync(installPath, 'utf8'); });

    it('install.sh must generate Nginx location for /videos-secondary/', () => {
      expect({
        hasLocation: /location\s+\/videos-secondary\//.test(content),
        proxiesToAdmin: /proxy_pass\s+http:\/\/127\.0\.0\.1:8080\/videos-secondary\//.test(content),
      }).toEqual({
        hasLocation: true,
        proxiesToAdmin: true,
      });
    });
  });

  describe('deploySecondaryVariant must use finalFilename for path', () => {
    const deployVideoPath = path.join(repoRoot, 'raspberry/sync-agent/src/commands/deploy-video.js');
    let content: string;
    beforeAll(() => { content = fs.readFileSync(deployVideoPath, 'utf8'); });

    it('secondaryRelativePath must NOT use buildRelativePath directly (would keep primary filename)', () => {
      // The old bug: secondaryRelativePath = relativePath.replace(/^videos\//, 'videos-secondary/')
      // This copies the PRIMARY video filename into the secondary path, but the secondary
      // file has its own name (finalFilename). The path must use finalFilename.
      const lines = content.split('\n');
      const secondaryPathLine = lines.find(l => l.includes('secondaryRelativePath') && l.includes('=') && !l.trim().startsWith('//'));
      expect({
        // Must NOT contain relativePath.replace — that was the bug
        usesRelativePathReplace: secondaryPathLine ? /relativePath\.replace/.test(secondaryPathLine) : false,
      }).toEqual({
        usesRelativePathReplace: false,
      });
    });

    it('secondaryRelativePath must reference finalFilename (the actual downloaded filename)', () => {
      const lines = content.split('\n');
      const secondaryPathLine = lines.find(l => l.includes('secondaryRelativePath') && l.includes('=') && !l.trim().startsWith('//'));
      expect({
        usesFinalFilename: secondaryPathLine ? /finalFilename/.test(secondaryPathLine) : false,
      }).toEqual({
        usesFinalFilename: true,
      });
    });
  });
});

describe('ADR-033 slave race condition guard (tv.component.ts)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const tvComponentPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');
  let content: string;
  beforeAll(() => { content = fs.readFileSync(tvComponentPath, 'utf8'); });

  it('action handler must set _lastActionReceivedAt timestamp', () => {
    // The action/command handler must record a timestamp to enable the stale state guard.
    // Pattern: _lastActionReceivedAt = Date.now() must appear in handleTvCommand or inline action handler.
    const handleTvBlock = content.match(/private handleTvCommand[\s\S]*?^  \}/m);
    const actionBlock = handleTvBlock
      ? handleTvBlock[0]
      : content.slice(
          content.indexOf("socketService.on('action'"),
          content.indexOf("socketService.on('action'") + 600
        );
    expect({
      setsTimestamp: /_lastActionReceivedAt\s*=\s*Date\.now\(\)/.test(actionBlock),
    }).toEqual({
      setsTimestamp: true,
    });
  });

  it('handleMasterLoopState CAS 2 must check _lastActionReceivedAt guard before stopping manual', () => {
    // CAS 2 must NOT blindly call stopManualVideoAndReturnToLoop when isManualMode is true.
    // It must first check if a recent action was received (guard window).
    const cas2Block = content.slice(
      content.indexOf('CAS 2'),
      content.indexOf('CAS 2') + 800
    );
    expect({
      hasGuard: /_lastActionReceivedAt/.test(cas2Block),
    }).toEqual({
      hasGuard: true,
    });
  });

  it('play() must emit immediate tv-loop-update with isManualMode:true for master', () => {
    // The master must emit tv-loop-update with isManualMode: true IMMEDIATELY in play(),
    // not just after the 2×rAF + 200ms delay. This reduces the window where stale
    // tv-loop-state (isManualMode: false) can reach slaves.
    // Look for the emission between isManualMode = true and 'ÉTAPE 1'
    const playMethod = content.slice(
      content.indexOf('isManualMode = true;'),
      content.indexOf('ÉTAPE 1')
    );
    expect({
      hasImmediateEmit: /emit\('tv-loop-update'/.test(playMethod) && /isManualMode:\s*true/.test(playMethod),
    }).toEqual({
      hasImmediateEmit: true,
    });
  });
});

describe('ADR-034 synchronized manual video reveal', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const tvComponentPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');
  const socketServicePath = path.join(repoRoot, 'raspberry/src/app/services/socket.service.ts');
  const stateServicePath = path.join(repoRoot, 'raspberry/server/services/state.service.js');
  let tvContent: string;
  let socketContent: string;
  let stateContent: string;

  beforeAll(() => {
    tvContent = fs.readFileSync(tvComponentPath, 'utf8');
    socketContent = fs.readFileSync(socketServicePath, 'utf8');
    stateContent = fs.readFileSync(stateServicePath, 'utf8');
  });

  it('LoopState interface MUST include manualVideoVisible boolean', () => {
    const interfaceBlock = socketContent.slice(
      socketContent.indexOf('interface LoopState'),
      socketContent.indexOf('interface LoopState') + 400
    );
    expect({
      hasField: /manualVideoVisible:\s*boolean/.test(interfaceBlock),
    }).toEqual({
      hasField: true,
    });
  });

  it('state.service initial _loopState MUST include manualVideoVisible: false', () => {
    const loopStateBlock = stateContent.slice(
      stateContent.indexOf('_loopState'),
      stateContent.indexOf('_loopState') + 400
    );
    expect({
      hasDefault: /manualVideoVisible:\s*false/.test(loopStateBlock),
    }).toEqual({
      hasDefault: true,
    });
  });

  it('Master play() immediate emission MUST include manualVideoVisible: false', () => {
    // The FIRST emission in play() (before freeze-frame) must signal slaves to preload, not reveal
    const playMethod = tvContent.slice(
      tvContent.indexOf('isManualMode = true;'),
      tvContent.indexOf('ÉTAPE 1')
    );
    expect({
      hasVisibleFalse: /manualVideoVisible:\s*false/.test(playMethod),
    }).toEqual({
      hasVisibleFalse: true,
    });
  });

  it('Master play() delayed emission MUST include manualVideoVisible: true', () => {
    // The SECOND emission (after 2×rAF + 200ms) must signal slaves to reveal.
    // play() spans ~7000 chars due to freeze-frame, double-buffer, and error recovery logic.
    const fullPlayMethod = tvContent.slice(
      tvContent.indexOf('private play(video: Video)'),
      tvContent.indexOf('private play(video: Video)') + 7500
    );
    // Count occurrences of manualVideoVisible in play()
    const visibleFalseCount = (fullPlayMethod.match(/manualVideoVisible:\s*false/g) || []).length;
    const visibleTrueCount = (fullPlayMethod.match(/manualVideoVisible:\s*true/g) || []).length;
    expect({
      hasVisibleTrue: visibleTrueCount >= 1,
      hasVisibleFalse: visibleFalseCount >= 1,
    }).toEqual({
      hasVisibleTrue: true,
      hasVisibleFalse: true,
    });
  });

  it('Slave action handler MUST call preloadManualVideo instead of play', () => {
    // When isSlaveMode is true, the command handler must call preloadManualVideo, not play.
    // The logic can be in handleTvCommand (centralized) or inline in the action handler.
    const handleTvBlock = tvContent.match(/private handleTvCommand[\s\S]*?^  \}/m);
    const actionBlock = handleTvBlock
      ? handleTvBlock[0]
      : tvContent.slice(
          tvContent.indexOf("socketService.on('action'"),
          tvContent.indexOf("socketService.on('action'") + 800
        );
    expect({
      hasSlavePreload: /isSlaveMode[\s\S]*preloadManualVideo/.test(actionBlock),
      masterStillCallsPlay: /else\s*\{[\s\S]*?this\.play\(/.test(actionBlock),
    }).toEqual({
      hasSlavePreload: true,
      masterStillCallsPlay: true,
    });
  });

  it('LocalBroadcast command handler MUST check isSlaveMode and preload instead of play (ADR-034)', () => {
    // Bug: LocalBroadcast handler called play() directly without checking isSlaveMode,
    // causing slaves to show freeze-frame + overlay on manual video launch.
    // Fix: same pattern as Socket.IO action handler — preloadManualVideo for slaves, play for master.
    // The logic can be in handleTvCommand (centralized) or inline in the BroadcastChannel handler.
    const handleTvBlock = tvContent.match(/private handleTvCommand[\s\S]*?^  \}/m);
    const localBroadcastBlock = handleTvBlock
      ? handleTvBlock[0]
      : tvContent.slice(
          tvContent.indexOf("localBroadcast.onCommand()"),
          tvContent.indexOf("localBroadcast.onCommand()") + 1200
        );
    expect({
      hasSlaveCheck: /isSlaveMode/.test(localBroadcastBlock),
      hasPreload: /preloadManualVideo/.test(localBroadcastBlock),
      hasLastActionTimestamp: /_lastActionReceivedAt/.test(localBroadcastBlock),
      masterStillCallsPlay: /else\s*\{[\s\S]*?this\.play\(/.test(localBroadcastBlock),
    }).toEqual({
      hasSlaveCheck: true,
      hasPreload: true,
      hasLastActionTimestamp: true,
      masterStillCallsPlay: true,
    });
  });

  it('tv.component MUST have isDuplicateCommand guard for BroadcastChannel+Socket.IO race', () => {
    // When remote and TV are in the same browser, both BroadcastChannel and Socket.IO
    // deliver the same command. Without deduplication, play() is called twice — the second
    // load() cancels the first → race condition → freeze.
    expect({
      hasGuardMethod: /private isDuplicateCommand/.test(tvContent),
      hasCommandKey: /_lastCommandKey/.test(tvContent),
      hasCommandAt: /_lastCommandAt/.test(tvContent),
      handleTvCommandUsesGuard: /isDuplicateCommand/.test(
        (tvContent.match(/private handleTvCommand[\s\S]*?^  \}/m) || [''])[0]
      ),
    }).toEqual({
      hasGuardMethod: true,
      hasCommandKey: true,
      hasCommandAt: true,
      handleTvCommandUsesGuard: true,
    });
  });

  it('handleMasterLoopState CAS 1a MUST use !== true (not === false) for manualVideoVisible guard', () => {
    // Bug: using === false missed undefined/absent values → fell through to play() direct → freeze.
    // Fix: use !== true to catch false, undefined, and absent → always preload.
    const cas1Block = tvContent.slice(
      tvContent.indexOf('handleMasterLoopState'),
      tvContent.indexOf('CAS 2')
    );
    expect({
      usesNotTrue: /manualVideoVisible\s*!==\s*true/.test(cas1Block),
      doesNotUseStrictFalse: !/manualVideoVisible\s*===\s*false/.test(cas1Block),
      hasPreload: /preloadManualVideo/.test(cas1Block),
      hasReveal: /revealPreloadedVideo/.test(cas1Block),
    }).toEqual({
      usesNotTrue: true,
      doesNotUseStrictFalse: true,
      hasPreload: true,
      hasReveal: true,
    });
  });

  it('handleMasterLoopState CAS 1 fallback MUST call play for backward compat (manualVideoVisible:true + no preload)', () => {
    // Fallback: when manualVideoVisible === true but no preload exists (race condition / backward compat),
    // the slave must call play() directly.
    const cas1Block = tvContent.slice(
      tvContent.indexOf('handleMasterLoopState'),
      tvContent.indexOf('CAS 2')
    );
    expect({
      hasDirectPlay: /this\.play\(resolvedVideo\)/.test(cas1Block),
      hasBackwardCompatComment: /backward compat/i.test(cas1Block),
    }).toEqual({
      hasDirectPlay: true,
      hasBackwardCompatComment: true,
    });
  });

  it('handleMasterLoopState CAS 2 MUST call cleanupPreloadState', () => {
    const cas2Block = tvContent.slice(
      tvContent.indexOf('CAS 2'),
      tvContent.indexOf('CAS 2') + 800
    );
    expect({
      hasCleanup: /cleanupPreloadState/.test(cas2Block),
    }).toEqual({
      hasCleanup: true,
    });
  });

  it('emitLoopState MUST include manualVideoVisible: false', () => {
    const emitMethod = tvContent.slice(
      tvContent.indexOf('private emitLoopState'),
      tvContent.indexOf('private emitLoopState') + 500
    );
    expect({
      hasVisibleFalse: /manualVideoVisible:\s*false/.test(emitMethod),
    }).toEqual({
      hasVisibleFalse: true,
    });
  });
});

describe('ADR-034 preload-reveal metrics pipeline', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  let tvContent: string;
  let stateContent: string;

  beforeAll(() => {
    tvContent = fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'), 'utf8');
    stateContent = fs.readFileSync(path.join(repoRoot, 'raspberry/server/services/state.service.js'), 'utf8');
  });

  it('tv.component transitionMetrics MUST include preloadRevealCount and preloadCleanupCount', () => {
    expect({
      hasReveal: tvContent.includes('preloadRevealCount'),
      hasCleanup: tvContent.includes('preloadCleanupCount'),
    }).toEqual({
      hasReveal: true,
      hasCleanup: true,
    });
  });

  it('revealPreloadedVideo MUST increment preloadRevealCount', () => {
    const revealMethod = tvContent.slice(
      tvContent.indexOf('private revealPreloadedVideo'),
      tvContent.indexOf('private revealPreloadedVideo') + 2500
    );
    expect(revealMethod).toMatch(/preloadRevealCount\+\+/);
  });

  it('cleanupPreloadState MUST increment preloadCleanupCount', () => {
    const cleanupMethod = tvContent.slice(
      tvContent.indexOf('private cleanupPreloadState'),
      tvContent.indexOf('private cleanupPreloadState') + 500
    );
    expect(cleanupMethod).toMatch(/preloadCleanupCount\+\+/);
  });

  it('emitTransitionMetrics slave branch MUST emit preloadRevealCount and preloadCleanupCount', () => {
    // After ADR-042 extraction, method renamed to emitSlaveTransitionMetrics
    const emitMethod = tvContent.slice(
      tvContent.indexOf('private emitSlaveTransitionMetrics'),
      tvContent.indexOf('private emitSlaveTransitionMetrics') + 800
    );
    expect({
      hasRevealInSlave: /preloadRevealCount.*preloadCleanupCount|preloadCleanupCount.*preloadRevealCount/.test(emitMethod),
    }).toEqual({
      hasRevealInSlave: true,
    });
  });

  it('state.service _transitionMetrics MUST include preloadRevealCount and preloadCleanupCount', () => {
    expect({
      hasReveal: stateContent.includes('preloadRevealCount'),
      hasCleanup: stateContent.includes('preloadCleanupCount'),
    }).toEqual({
      hasReveal: true,
      hasCleanup: true,
    });
  });

  it('TransitionMetrics interface MUST include preloadRevealCount and preloadCleanupCount', () => {
    const typesContent = fs.readFileSync(path.join(repoRoot, 'central-server/src/types/index.ts'), 'utf8');
    const iface = typesContent.slice(
      typesContent.indexOf('interface TransitionMetrics'),
      typesContent.indexOf('interface TransitionMetrics') + 500
    );
    expect({
      hasReveal: iface.includes('preloadRevealCount'),
      hasCleanup: iface.includes('preloadCleanupCount'),
    }).toEqual({
      hasReveal: true,
      hasCleanup: true,
    });
  });

  it('metrics.service MUST have Prometheus counters for preload_reveal and preload_cleanup', () => {
    const metricsContent = fs.readFileSync(path.join(repoRoot, 'central-server/src/services/metrics.service.ts'), 'utf8');
    expect({
      hasRevealCounter: metricsContent.includes('neopro_video_preload_reveal_total'),
      hasCleanupCounter: metricsContent.includes('neopro_video_preload_cleanup_total'),
    }).toEqual({
      hasRevealCounter: true,
      hasCleanupCounter: true,
    });
  });

  it('heartbeat.handler MUST log preload metrics', () => {
    const heartbeatContent = fs.readFileSync(path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'), 'utf8');
    expect({
      hasRevealLog: heartbeatContent.includes('preloadRevealCount'),
      hasCleanupLog: heartbeatContent.includes('preloadCleanupCount'),
    }).toEqual({
      hasRevealLog: true,
      hasCleanupLog: true,
    });
  });
});

describe('ADR-034 v3.89.3 silent preload + instant reveal', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  let tvContent: string;

  beforeAll(() => {
    tvContent = fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'), 'utf8');
  });

  it('preloadManualVideo MUST NOT call captureAndShowFreezeFrame unconditionally (silent preload)', () => {
    // preloadManualVideo should only call captureAndShowFreezeFrame for manual→manual transitions,
    // not unconditionally. The method must check if a manual video is already visible.
    const preloadMethod = tvContent.slice(
      tvContent.indexOf('private preloadManualVideo'),
      tvContent.indexOf('private preloadManualVideo') + 2500
    );
    expect({
      hasConditionalFreeze: /isReplacingManual|manual.*manual|opacity.*===.*'1'/.test(preloadMethod),
      hasNotUnconditionalFreeze: !/^\s*this\.captureAndShowFreezeFrame\(\)/m.test(
        preloadMethod.replace(/if\s*\(.*\)\s*\{[^}]*captureAndShowFreezeFrame[^}]*\}/gs, '')
      ),
    }).toEqual({
      hasConditionalFreeze: true,
      hasNotUnconditionalFreeze: true,
    });
  });

  it('preloadManualVideo MUST mute player during preload', () => {
    const preloadMethod = tvContent.slice(
      tvContent.indexOf('private preloadManualVideo'),
      tvContent.indexOf('private preloadManualVideo') + 2500
    );
    expect({
      hasMuteTrue: /\.muted\s*=\s*true/.test(preloadMethod),
    }).toEqual({
      hasMuteTrue: true,
    });
  });

  it('revealPreloadedVideo MUST unmute player and NOT have 2xrAF+200ms delay', () => {
    const revealMethod = tvContent.slice(
      tvContent.indexOf('private revealPreloadedVideo'),
      tvContent.indexOf('private revealPreloadedVideo') + 2000
    );
    expect({
      hasUnmute: /\.muted\s*=\s*false/.test(revealMethod),
      hasNoRAFDelay: !(/requestAnimationFrame/.test(revealMethod)),
    }).toEqual({
      hasUnmute: true,
      hasNoRAFDelay: true,
    });
  });

  it('revealPreloadedVideo MUST have safe unmute guard for autoplay policy (browser /secondary freeze)', () => {
    // Chrome pauses a playing video when programmatically unmuted on a tab without user interaction.
    // /secondary tab has no user gesture → muted=false triggers pause → video frozen.
    // Fix: detect pause after unmute, fallback to muted playback.
    const revealMethod = tvContent.slice(
      tvContent.indexOf('private revealPreloadedVideo'),
      tvContent.indexOf('private revealPreloadedVideo') + 2000
    );
    expect({
      hasPauseCheck: /player\.paused/.test(revealMethod),
      hasMuteFallback: /player\.muted\s*=\s*true/.test(revealMethod),
      hasPlayRecovery: /player\.play\(\)/.test(revealMethod),
    }).toEqual({
      hasPauseCheck: true,
      hasMuteFallback: true,
      hasPlayRecovery: true,
    });
  });

  it('preloadManualVideo MUST support deferred reveal (_preloadReady + _pendingReveal)', () => {
    // When master signals reveal before slave's preload finishes (frequent on browser where
    // HTTP loading is slower than Pi's local files), the reveal must be deferred until play() resolves.
    const preloadMethod = tvContent.slice(
      tvContent.indexOf('private preloadManualVideo'),
      tvContent.indexOf('private preloadManualVideo') + 2500
    );
    expect({
      setsPreloadReady: /_preloadReady\s*=\s*true/.test(preloadMethod),
      checksPendingReveal: /_pendingReveal/.test(preloadMethod),
      callsRevealOnPending: /revealPreloadedVideo/.test(preloadMethod),
    }).toEqual({
      setsPreloadReady: true,
      checksPendingReveal: true,
      callsRevealOnPending: true,
    });
  });

  it('revealPreloadedVideo MUST defer reveal when _preloadReady is false', () => {
    const revealMethod = tvContent.slice(
      tvContent.indexOf('private revealPreloadedVideo'),
      tvContent.indexOf('private revealPreloadedVideo') + 2000
    );
    expect({
      checksPreloadReady: /_preloadReady/.test(revealMethod),
      setsPendingReveal: /_pendingReveal\s*=\s*true/.test(revealMethod),
    }).toEqual({
      checksPreloadReady: true,
      setsPendingReveal: true,
    });
  });

  it('cleanupPreloadState MUST reset muted to false', () => {
    const cleanupMethod = tvContent.slice(
      tvContent.indexOf('private cleanupPreloadState'),
      tvContent.indexOf('private cleanupPreloadState') + 500
    );
    expect({
      hasUnmute: /\.muted\s*=\s*false/.test(cleanupMethod),
    }).toEqual({
      hasUnmute: true,
    });
  });
});
