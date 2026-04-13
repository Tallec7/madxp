/**
 * Smoke tests — kiosk-pi domain
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
  process.env.PORT = '3102';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('Kiosk boot regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('tv.component.ts must NOT import video.js (legacy player removed in v3.72)', () => {
    // Video.js caused a black rectangle at boot on Pi with slow GPU.
    // Only native HTML5 <video> double-buffer is used now.
    const tvComponent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts'),
      'utf8'
    );
    expect({ hasVideoJs: /import.*video\.js|import.*videojs/m.test(tvComponent) })
      .toEqual({ hasVideoJs: false });
  });

  it('tv.component.html must NOT have video.js player element', () => {
    const tvTemplate = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.html'),
      'utf8'
    );
    expect({ hasVideoJsElement: /class="video-js"|#target.*video-js/m.test(tvTemplate) })
      .toEqual({ hasVideoJsElement: false });
  });

  it('StateService must default score to null (not DOMICILE/EXTÉRIEUR)', () => {
    // Default DOMICILE 0-0 EXTÉRIEUR was emitted on every client connect,
    // causing phantom score overlay even when premium not activated.
    const stateService = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/state.service.js'),
      'utf8'
    );
    expect({ scoreDefaultNull: /this\._score\s*=\s*null/.test(stateService) })
      .toEqual({ scoreDefaultNull: true });
  });

  it('handlers.js must guard score-update emission with null check', () => {
    // Prevents emitting score-update with null data on client connect
    const handlers = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/socket/handlers.js'),
      'utf8'
    );
    expect({ guardsScoreEmit: /if\s*\(s(?:tate)?\.score\)/.test(handlers) })
      .toEqual({ guardsScoreEmit: true });
  });
});

describe('Nginx cache-control conventions', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  const nginxConfigs = [
    'raspberry/config/nginx-captive-portal.conf',
    'raspberry/config/nginx/neopro-hls.conf',
  ];

  for (const configPath of nginxConfigs) {
    it(`${configPath} must have Cache-Control no-store on index.html`, () => {
      // Without no-store, Chromium caches index.html and serves old Angular builds at boot,
      // showing stale UI (old Video.js player, old score design) before the current build loads.
      const content = fs.readFileSync(path.join(repoRoot, configPath), 'utf8');
      expect({
        file: configPath,
        hasIndexHtmlNoCache: /location\s*=\s*\/index\.html\s*\{[^}]*no-cache,\s*no-store/s.test(content),
      }).toEqual({
        file: configPath,
        hasIndexHtmlNoCache: true,
      });
    });
  }

  it('install.sh nginx config must have Cache-Control no-store on index.html', () => {
    const content = fs.readFileSync(path.join(repoRoot, 'raspberry/install.sh'), 'utf8');
    expect({
      hasIndexHtmlNoCache: /location\s*=\s*\/index\.html\s*\{[^}]*no-cache,\s*no-store/s.test(content),
    }).toEqual({
      hasIndexHtmlNoCache: true,
    });
  });
});

describe('Kiosk watchdog cache management', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('kiosk-watchdog.sh must purge entire Chromium profile (not just subdirectories)', () => {
    // Purging only specific subdirectories left stale data in Session Storage,
    // IndexedDB, Local Storage etc., causing old Angular builds to persist at boot.
    // Full profile purge is safe because kiosk mode needs no persistent state.
    const requiredPurges = [
      '.cache/chromium',   // All Chromium cache (HTTP, Code, etc.)
      '.config/chromium',  // All Chromium profile (Session, IndexedDB, Local Storage, etc.)
    ];
    const missing = requiredPurges.filter(p => !watchdog.includes(`rm -rf /home/pi/${p}`));
    expect({ missingProfilePurges: missing }).toEqual({ missingProfilePurges: [] });
  });

  it('kiosk-watchdog.sh must have --disk-cache-size flag on main Chromium', () => {
    // Without this flag, Chromium accumulates stale cached builds
    expect({ hasDiskCacheSize: /--disk-cache-size=\d+/.test(watchdog) })
      .toEqual({ hasDiskCacheSize: true });
  });

  it('kiosk-watchdog.sh must launch D-Bus session before Chromium', () => {
    // Without a D-Bus session, Chromium spams journalctl with
    // "Failed to connect to the bus" errors every ~6 seconds
    expect({ hasDbusLaunch: watchdog.includes('dbus-launch') })
      .toEqual({ hasDbusLaunch: true });
  });

  it('kiosk-watchdog.sh must use --password-store=basic on all Chromium instances', () => {
    // Without this flag, dbus-launch enables GNOME Keyring access and Chromium
    // shows a blocking "Choose password for new keyring" popup in kiosk mode.
    // Incident: 24/02/2026 — popup bloquante sur Pi après ajout dbus-launch.
    const matches = watchdog.match(/--password-store=basic/g) || [];
    // Must appear at least twice: once for TV Chromium, once for LED Chromium
    expect({ passwordStoreBasicCount: matches.length >= 2 })
      .toEqual({ passwordStoreBasicCount: true });
  });
});

describe('neopro-kiosk.service must depend on nginx', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const kioskService = fs.readFileSync(
    path.join(repoRoot, 'raspberry/config/systemd/neopro-kiosk.service'),
    'utf8'
  );

  it('neopro-kiosk.service must have After=nginx.service', () => {
    // Without this, Chromium can start before Nginx and load stale cached content
    // Incident: 24/02/2026 — old Angular version displayed at every boot
    expect({ hasAfterNginx: kioskService.includes('nginx.service') })
      .toEqual({ hasAfterNginx: true });
  });

  it('neopro-kiosk.service must Require nginx.service', () => {
    // Ensures kiosk won't start if nginx fails to start
    expect({ hasRequiresNginx: /Requires=.*nginx\.service/.test(kioskService) })
      .toEqual({ hasRequiresNginx: true });
  });

  it('neopro-kiosk.service must NOT have ExecStop with pkill -9', () => {
    // ExecStop=pkill -9 bypasses the watchdog's SIGTERM graceful shutdown,
    // preventing the V3D GPU driver from releasing DMA buffers on Pi 5.
    // This causes rendering artifacts and crash loops after systemctl restart.
    // The watchdog's trap handler manages Chromium shutdown via cleanup_chromium().
    expect({ noExecStopKill9: !/^ExecStop=.*pkill.*-9/m.test(kioskService) })
      .toEqual({ noExecStopKill9: true });
  });

  it('neopro-kiosk.service must use KillMode=mixed', () => {
    // KillMode=mixed sends SIGTERM to main process (watchdog) only,
    // allowing the trap handler to cleanly shutdown Chromium.
    // Default KillMode=control-group sends SIGTERM to ALL processes simultaneously,
    // racing with the watchdog's cleanup.
    expect({ hasKillModeMixed: kioskService.includes('KillMode=mixed') })
      .toEqual({ hasKillModeMixed: true });
  });
});

describe('Kiosk xdpyinfo dependency must be provisioned', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('neopro-kiosk.service xdpyinfo dependency must be in install.sh', () => {
    // neopro-kiosk.service uses xdpyinfo (from x11-utils) to check X server readiness.
    // If x11-utils is missing from install.sh, new Pi deployments will have a black TV screen.
    // Incident: NLF 22/02/2026 — TV noire post-OTA because x11-utils was not pre-installed.
    const installSh = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8'
    );
    expect({ hasX11Utils: installSh.includes('x11-utils') })
      .toEqual({ hasX11Utils: true });
  });

  it('OTA must auto-install required apt packages including x11-utils and edid-decode', () => {
    // update-software.js (or its sub-module ota-install.js) must have a requiredAptPackages list
    // that includes x11-utils and edid-decode.
    const otaFiles = [
      'raspberry/sync-agent/src/commands/update-software.js',
      'raspberry/sync-agent/src/commands/ota-install.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({ hasRequiredAptPackages: otaFiles.includes('requiredAptPackages') })
      .toEqual({ hasRequiredAptPackages: true });
    expect({ hasX11Utils: otaFiles.includes("'x11-utils'") })
      .toEqual({ hasX11Utils: true });
    expect({ hasEdidDecode: otaFiles.includes("'edid-decode'") })
      .toEqual({ hasEdidDecode: true });
  });

  it('_findEdidPath must use readFileSync (not stat.size) for sysfs virtual files', () => {
    // sysfs files /sys/class/drm/*/edid report stat.size=0 even with 128-256 bytes of data.
    // Using stat.size caused edidPath=null → edid_detailed=null → enriched EDID invisible.
    // Incident: 24/02/2026 — all Pis had stat.size=0 for EDID files, enriched display never shown.
    // metrics.js delegates EDID to display-metrics.js (ADR-044)
    const metricsFiles = [
      'raspberry/sync-agent/src/metrics.js',
      'raspberry/sync-agent/src/metrics/display-metrics.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    const hdmiServiceJs = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/services/hdmi.service.js'),
      'utf8'
    );
    // metrics must NOT use stat.size for EDID detection
    expect({ metricsUsesStatSize: /statSync.*edid[\s\S]{0,50}stat\.size/.test(metricsFiles) })
      .toEqual({ metricsUsesStatSize: false });
    // hdmi.service.js must NOT use stat.size for EDID detection
    expect({ hdmiUsesStatSize: /statSync.*edid[\s\S]{0,50}stat\.size/.test(hdmiServiceJs) })
      .toEqual({ hdmiUsesStatSize: false });
    // Both must use readFileSync + buf.length in _findEdidPath
    expect({ metricsUsesReadFile: metricsFiles.includes('readFileSync(edidPath)') })
      .toEqual({ metricsUsesReadFile: true });
    expect({ hdmiUsesReadFile: hdmiServiceJs.includes('readFileSync(edidPath)') })
      .toEqual({ hdmiUsesReadFile: true });
  });

  it('diagnose-pi.sh must check for x11-utils in recommended packages', () => {
    // diagnose-pi.sh warns when recommended packages are missing.
    // x11-utils must be in the list to alert operators before kiosk fails.
    const diagnosePi = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/diagnose-pi.sh'),
      'utf8'
    );
    expect({ hasX11Utils: diagnosePi.includes('x11-utils') })
      .toEqual({ hasX11Utils: true });
  });

  it('diagnose-pi.sh must NOT echo to stdout in --json mode (pollutes JSON output)', () => {
    // Incident: 25/02/2026 — deploy-remote.sh post-deployment diagnostic always showed
    // "impossible de déterminer l'état" because echo -n "Test http://..." lines
    // were not gated on OUTPUT_MODE, polluting JSON output and breaking grep parsing.
    // All echo/printf to stdout must be guarded by OUTPUT_MODE != "json".
    const diagnosePi = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/diagnose-pi.sh'),
      'utf8'
    );
    // Find raw echo statements not guarded by json mode check
    const lines = diagnosePi.split('\n');
    const ungatedEchos: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip comments, empty lines, heredocs, and echo inside json_add or if blocks
      if (!line || line.startsWith('#') || line.startsWith('cat <<')) continue;
      // Detect bare echo/echo -n that output to stdout (not guarded by OUTPUT_MODE)
      if (/^echo\s/.test(line) || /^echo$/.test(line)) {
        // Check if this line is inside an OUTPUT_MODE guard (look at surrounding context)
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        const prevPrevLine = i > 1 ? lines[i - 2].trim() : '';
        const isInsideHumanGuard =
          prevLine.includes('OUTPUT_MODE') ||
          prevPrevLine.includes('OUTPUT_MODE') ||
          prevLine.includes('json') ||
          prevPrevLine.includes('json');
        // Lines inside "if [ "$OUTPUT_MODE" = "human" ]" blocks are OK
        // We only flag top-level echo that will run in all modes
        if (!isInsideHumanGuard) {
          // Check if this echo is inside a function that already gates on mode
          // (print_header, print_section, print_success etc. all return early in json mode)
          // Only flag echo in the main body (after "EXÉCUTION DU DIAGNOSTIC")
          const beforeLine = diagnosePi.substring(0, diagnosePi.indexOf(line));
          if (beforeLine.includes('EXÉCUTION DU DIAGNOSTIC') &&
              !line.includes('echo \'') && // skip echo for json heredoc
              !line.includes('echo "') && // might be inside if block
              line.startsWith('echo -n')) { // bare echo -n at top level
            ungatedEchos.push(`line ${i + 1}: ${line}`);
          }
        }
      }
    }
    expect({ ungatedEchosInJsonMode: ungatedEchos })
      .toEqual({ ungatedEchosInJsonMode: [] });
  });
  it('diagnose-pi.sh must use sudo for nginx -t (avoid false positive on PID file)', () => {
    // Incident: 25/02/2026 — diagnose-pi.sh reported "Configuration Nginx invalide"
    // because `nginx -t` run as pi (non-root) fails with "Permission denied" on
    // /run/nginx.pid, even though the syntax is valid. Must use `sudo nginx -t`.
    const diagnosePi = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/diagnose-pi.sh'),
      'utf8'
    );
    // The nginx -t call inside check_nginx_config must use sudo
    const nginxTestMatch = diagnosePi.match(/if\s+.*NGINX_BIN.*-t/);
    expect({ hasNginxTest: !!nginxTestMatch }).toEqual({ hasNginxTest: true });
    expect({ usesSudo: /sudo.*NGINX_BIN.*-t/.test(diagnosePi) })
      .toEqual({ usesSudo: true });
  });

  it('prepare-image first-boot-setup must chmod 600 club-config.json', () => {
    // club-config.json contains the WiFi password in plaintext.
    // The first-boot-setup.sh (generated by prepare-image.sh) must restrict
    // permissions after creating the file, matching install.sh behavior.
    const prepareImage = fs.readFileSync(
      path.join(repoRoot, 'raspberry/tools/prepare-image.sh'),
      'utf8'
    );
    expect({ hasChmod600: prepareImage.includes('chmod 600') && prepareImage.includes('club-config.json') })
      .toEqual({ hasChmod600: true });
  });
});

describe('Debug page architecture guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const debugTabDir = path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-debug-tab');
  const debugTabPath = path.join(debugTabDir, 'site-debug-tab.component.ts');
  const debugTab = fs.readFileSync(debugTabPath, 'utf8');
  // Read all .ts files in the debug-tab directory tree for pattern checks across sub-components
  const readAllTsFiles = (dir: string): string => {
    let result = '';
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result += readAllTsFiles(fullPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        result += fs.readFileSync(fullPath, 'utf8') + '\n';
      }
    }
    return result;
  };
  const debugTabAll = readAllTsFiles(debugTabDir);

  it('site-debug-tab must import DebugSummaryBarComponent (extracted sub-component)', () => {
    // Phase B extracted the summary bar into a standalone sub-component.
    // Re-inlining it would bloat the monolith and lose reusability.
    expect({ importsDebugSummaryBar: debugTab.includes("import { DebugSummaryBarComponent }") })
      .toEqual({ importsDebugSummaryBar: true });
  });

  it('site-debug-tab must import pollCommand utility (no duplicated polling)', () => {
    // Phase B factorized ~80 lines of duplicated command-polling into pollCommand<T>().
    // Reverting to inline polling duplicates code and risks divergent behavior.
    expect({ importsPollCommand: debugTab.includes("import { pollCommand") })
      .toEqual({ importsPollCommand: true });
  });

  it('site-debug-tab must NOT use native confirm() dialogs', () => {
    // Phase C replaced native confirm() with custom modals for consistent UX.
    // Native confirm() blocks the JS thread and cannot be styled.
    // Match standalone confirm( calls but not confirmModal or showConfirmModal
    const hasNativeConfirm = /(?<!show)(?<!cancel)(?<!execute)\bconfirm\s*\(/.test(debugTab);
    expect({ usesNativeConfirm: hasNativeConfirm })
      .toEqual({ usesNativeConfirm: false });
  });

  it('command-poller.util must export pollCommand and CommandPollResult', () => {
    // The polling utility is the shared abstraction for command execution + status polling.
    // Changing its API would break buffer status loading and wizard diagnostics.
    const pollerUtil = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-debug-tab/command-poller.util.ts'),
      'utf8'
    );
    expect({ exportsPollCommand: pollerUtil.includes('export function pollCommand') })
      .toEqual({ exportsPollCommand: true });
    expect({ exportsCommandPollResult: pollerUtil.includes('export interface CommandPollResult') })
      .toEqual({ exportsCommandPollResult: true });
  });

  it('DebugSummaryBarComponent must be a standalone Angular component', () => {
    // The summary bar must remain standalone for independent testability and reuse.
    const summaryBar = fs.readFileSync(
      path.join(repoRoot, 'central-dashboard/src/app/features/sites/components/site-debug-tab/debug-summary-bar/debug-summary-bar.component.ts'),
      'utf8'
    );
    expect({ isStandalone: summaryBar.includes('standalone: true') })
      .toEqual({ isStandalone: true });
    expect({ hasSelector: summaryBar.includes("selector: 'app-debug-summary-bar'") })
      .toEqual({ hasSelector: true });
  });

  it('i18n fr/en/es must contain debug section keys', () => {
    // Phase C added 90+ i18n keys. Missing translations cause raw key display.
    const frJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/fr.json'), 'utf8');
    const enJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/en.json'), 'utf8');
    const esJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/es.json'), 'utf8');

    // Check critical keys exist in all 3 languages
    const criticalKeys = ['debug.summaryFiles', 'debug.healthTitle', 'debug.logsTitle', 'debug.networkTitle',
      'debug.bufferPending', 'debug.bufferVideoPlays', 'debug.bufferEvents', 'debug.bufferRefresh',
      'debug.wizardCheckingConnectivity', 'debug.wizardDeviceOnline', 'debug.wizardNoVideos',
      'debug.wizardLoopEmpty', 'debug.wizardAllOk', 'debug.timelineAll', 'debug.timelineDeployments',
      'debug.healthFanTitle', 'debug.healthHdmiConnection', 'debug.healthSystemdServices',
      'debug.exportOffline', 'debug.rebootRequiredTitle', 'debug.hotspotWaiting'];
    for (const key of criticalKeys) {
      const parts = key.split('.');
      expect({ [`fr_has_${key}`]: frJson.includes(`"${parts[1]}"`) })
        .toEqual({ [`fr_has_${key}`]: true });
      expect({ [`en_has_${key}`]: enJson.includes(`"${parts[1]}"`) })
        .toEqual({ [`en_has_${key}`]: true });
      expect({ [`es_has_${key}`]: esJson.includes(`"${parts[1]}"`) })
        .toEqual({ [`es_has_${key}`]: true });
    }
  });

  it('wizardEvaluateImpressions must treat empty buffer as ok (not warning)', () => {
    // An empty analytics buffer is the normal state when sync works correctly.
    // Marking it as 'warning' contradicts the health score (100/100 healthy)
    // and confuses operators. This test prevents regression to the old behavior.
    // See: fix(debug) commit "make empty buffer status consistent with health score"
    // Extract the private wizardEvaluateImpressions method body, then check its else branch.
    // After i18n refactoring, the branch uses translate.instant('debug.wizardNoEvents').
    const fnMatch = /private wizardEvaluateImpressions\([\s\S]*?\n  \}/m.exec(debugTab);
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch![0];
    // The top-level else branch (empty buffer) must set status='ok', not 'warning'.
    const elseBranch = /\} else \{([\s\S]*?)\n    \}\n  \}/.exec(fnBody);
    expect(elseBranch).toBeTruthy();
    const hasOkStatus = elseBranch![1].includes("step.status = 'ok'");
    const hasWarningStatus = elseBranch![1].includes("step.status = 'warning'");
    expect({ emptyBufferIsOk: hasOkStatus })
      .toEqual({ emptyBufferIsOk: true });
    expect({ emptyBufferIsNotWarning: !hasWarningStatus })
      .toEqual({ emptyBufferIsNotWarning: true });
  });

  it('site-debug-tab must use confirmModal for dangerous actions (reboot, restore)', () => {
    // The custom modal pattern replaces native confirm() for reboot and config restore.
    // Both actions need explicit confirmation to prevent accidental triggers.
    // After refactoring, these patterns live in sub-components (command-panel, system-info).
    expect({ hasShowConfirmModal: debugTabAll.includes('showConfirmModal(') })
      .toEqual({ hasShowConfirmModal: true });
    expect({ hasDoExecuteCommand: debugTabAll.includes('doExecuteCommand(') })
      .toEqual({ hasDoExecuteCommand: true });
    expect({ hasDoRestoreVersion: debugTabAll.includes('doRestoreVersion(') })
      .toEqual({ hasDoRestoreVersion: true });
  });

  it('i18n key count must be identical across fr/en/es', () => {
    // All 3 translation files must have the exact same debug keys.
    // A mismatch means a key was added to one language but not the others.
    const repoRoot2 = path.resolve(__dirname, '..', '..', '..', '..');
    const frObj = JSON.parse(fs.readFileSync(path.join(repoRoot2, 'central-dashboard/src/assets/i18n/fr.json'), 'utf8'));
    const enObj = JSON.parse(fs.readFileSync(path.join(repoRoot2, 'central-dashboard/src/assets/i18n/en.json'), 'utf8'));
    const esObj = JSON.parse(fs.readFileSync(path.join(repoRoot2, 'central-dashboard/src/assets/i18n/es.json'), 'utf8'));
    const frKeys = Object.keys(frObj['debug'] || {}).sort();
    const enKeys = Object.keys(enObj['debug'] || {}).sort();
    const esKeys = Object.keys(esObj['debug'] || {}).sort();
    expect({ fr_en_count_match: frKeys.length === enKeys.length })
      .toEqual({ fr_en_count_match: true });
    expect({ fr_es_count_match: frKeys.length === esKeys.length })
      .toEqual({ fr_es_count_match: true });
    // Check that the key sets are identical (not just counts)
    const frMissing = frKeys.filter(k => !enKeys.includes(k));
    const enMissing = enKeys.filter(k => !frKeys.includes(k));
    expect({ fr_keys_missing_in_en: frMissing }).toEqual({ fr_keys_missing_in_en: [] });
    expect({ en_keys_missing_in_fr: enMissing }).toEqual({ en_keys_missing_in_fr: [] });
  });

  it('site-debug-tab template must not contain hardcoded French UI words', () => {
    // Phase D eliminated all hardcoded French from the debug page template.
    // This guard prevents regression: any new UI text must use translate pipe.
    const templateMatch = debugTab.match(/template\s*:\s*`([\s\S]*?)`/);
    expect(templateMatch).toBeTruthy();
    const template = templateMatch![1];

    // Strip HTML comments and Angular attribute bindings to isolate visible text
    const cleaned = template
      .replace(/<!--[\s\S]*?-->/g, '')        // HTML comments
      .replace(/\[[\w.]+\]\s*=\s*"[^"]*"/g, '') // Angular attribute bindings
      .replace(/class\s*=\s*"[^"]*"/g, '')    // CSS class attributes
      .replace(/\*ngIf\s*=\s*"[^"]*"/g, '')   // *ngIf directives
      .replace(/\*ngFor\s*=\s*"[^"]*"/g, '')  // *ngFor directives
      .replace(/\([\w.]+\)\s*=\s*"[^"]*"/g, ''); // Event bindings

    // French UI words that must never appear as visible text in the template.
    // Words with accents are safe markers — they cannot be CSS/JS identifiers.
    const forbiddenInTemplate = [
      'Chargement',     // → debug.healthLoading | translate
      'Récupération',   // → debug.logsRetrieving | translate
      'Rafraîchir',     // → debug.networkRefresh | translate
      'Annuler',        // → debug.confirmCancel | translate
      'Redémarrage',    // → debug.rebootRequiredTitle | translate
      'Ventilateur',    // → debug.healthFanTitle | translate
      'Alimentation',   // → debug.healthPower | translate
      'événement',      // → debug.timelineEvents | translate
      'Déploiements',   // → debug.timelineDeployments | translate
      'Collecte',       // → debug.exportCollecting | translate
      'Sous-voltage',   // → debug.healthUnderVoltage | translate
      'Mémoire GPU',    // → debug.healthGpuMem | translate
      'Température',    // → debug.healthTemperature | translate
    ];

    for (const word of forbiddenInTemplate) {
      const found = cleaned.includes(word);
      expect({ [`template_has_hardcoded_${word}`]: found })
        .toEqual({ [`template_has_hardcoded_${word}`]: false });
    }
  });

  it('site-debug-tab quick-commands must include restart_kiosk and restart_app', () => {
    // Quick-command buttons for Kiosk and App restart are essential for remote debug.
    // Missing buttons would force operators to use the terminal for common operations.
    // After refactoring, command execution lives in command-panel sub-component.
    expect({ hasRestartKiosk: debugTabAll.includes("case 'restart_kiosk':") })
      .toEqual({ hasRestartKiosk: true });
    expect({ hasRestartApp: debugTabAll.includes("case 'restart_app':") })
      .toEqual({ hasRestartApp: true });
    expect({ kioskMapsToService: debugTabAll.includes("service: 'neopro-kiosk'") })
      .toEqual({ kioskMapsToService: true });
    expect({ appMapsToService: debugTabAll.includes("service: 'neopro-app'") })
      .toEqual({ appMapsToService: true });
  });

  it('i18n must contain quick-command keys for kiosk and app restart', () => {
    // Missing i18n keys would display raw keys like "debug.commandsKiosk" in the UI.
    const frJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/fr.json'), 'utf8');
    const enJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/en.json'), 'utf8');
    const esJson = fs.readFileSync(path.join(repoRoot, 'central-dashboard/src/assets/i18n/es.json'), 'utf8');

    const newKeys = ['commandsRestartKiosk', 'commandsKiosk', 'commandsRestartApp', 'commandsApp'];
    for (const key of newKeys) {
      expect({ [`fr_has_${key}`]: frJson.includes(`"${key}"`) }).toEqual({ [`fr_has_${key}`]: true });
      expect({ [`en_has_${key}`]: enJson.includes(`"${key}"`) }).toEqual({ [`en_has_${key}`]: true });
      expect({ [`es_has_${key}`]: esJson.includes(`"${key}"`) }).toEqual({ [`es_has_${key}`]: true });
    }
  });

  it('site-debug-tab wizard methods must use translate.instant()', () => {
    // Phase D migrated all wizard step messages to translate.instant().
    // Hardcoded French in wizard methods would show untranslated text to en/es users.
    // Each wizard method must call translate.instant() at least once.
    const wizardMethods = [
      'wizardCheckConnectivity',
      'wizardCheckVideos',
      'wizardCheckLoop',
      'wizardCheckImpressions',
      'wizardEvaluateImpressions',
      'wizardBuildSummary',
    ];
    for (const method of wizardMethods) {
      // Find the method body and check it uses translate.instant
      const methodRegex = new RegExp(`private ${method}\\b[\\s\\S]*?(?=private \\w|^\\}$)`, 'm');
      const methodMatch = debugTab.match(methodRegex);
      const usesTranslate = methodMatch ? methodMatch[0].includes('translate.instant') : false;
      expect({ [`${method}_uses_translate`]: usesTranslate })
        .toEqual({ [`${method}_uses_translate`]: true });
    }
  });
});

describe('Admin :8080 service control UI', () => {
  const adminRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const adminHtml = fs.readFileSync(path.join(adminRoot, 'raspberry/admin/public/index.html'), 'utf8');
  // Read source modules directly — app.js is a gitignored build artifact (generated by build-admin.sh)
  const modulesDir = path.join(adminRoot, 'raspberry/admin/public/modules');
  const moduleFiles = fs.readdirSync(modulesDir, { recursive: true }) as string[];
  const adminJs = moduleFiles
    .filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(modulesDir, f), 'utf8'))
    .join('\n');

  it('admin HTML must have restart buttons for neopro-app, nginx, and neopro-kiosk', () => {
    // Service restart buttons are the primary way to recover services locally.
    // Removing any would force SSH access for basic recovery operations.
    expect({ hasNeoProApp: adminHtml.includes("restartService('neopro-app')") })
      .toEqual({ hasNeoProApp: true });
    expect({ hasNginx: adminHtml.includes("restartService('nginx')") })
      .toEqual({ hasNginx: true });
    expect({ hasKiosk: adminHtml.includes("restartService('neopro-kiosk')") })
      .toEqual({ hasKiosk: true });
  });

  it('admin HTML must have apply-services button for daemon-reload', () => {
    // After OTA, .service files may be stale in /etc/systemd/system/.
    // The apply-services button triggers daemon-reload + copy without SSH.
    expect({ hasApplyServices: adminHtml.includes("applyServices()") })
      .toEqual({ hasApplyServices: true });
  });

  it('admin JS must export restartService and applyServices to window', () => {
    // Functions called from onclick must be on window scope.
    // Missing exports would cause silent failures on button click.
    expect({ exportsRestartService: adminJs.includes('window.restartService = restartService') })
      .toEqual({ exportsRestartService: true });
    expect({ exportsApplyServices: adminJs.includes('window.applyServices = applyServices') })
      .toEqual({ exportsApplyServices: true });
  });

  it('admin applyServices function must call /api/system/apply-services', () => {
    // The function must hit the correct endpoint. A typo would silently 404.
    expect({ callsCorrectEndpoint: adminJs.includes("fetch('/api/system/apply-services'") })
      .toEqual({ callsCorrectEndpoint: true });
  });

  it('admin JS must use showNotification (not alert) for user feedback', () => {
    // Native alert() blocks the UI and is inconsistent with the rest of the admin panel.
    // All user-facing messages must use the showNotification() utility.
    const applyFnMatch = adminJs.match(/async function applyServices\(\)[\s\S]*?^}/m);
    expect(applyFnMatch).toBeTruthy();
    expect({ usesNotification: applyFnMatch![0].includes('showNotification') })
      .toEqual({ usesNotification: true });
    expect({ noAlert: !applyFnMatch![0].includes('alert(') })
      .toEqual({ noAlert: true });
  });
});

describe('Admin build artifacts gitignore guard', () => {
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const gitignore = fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf8');

  it('app.js must be gitignored (build artifact generated by build-admin.sh)', () => {
    // app.js is a 228KB concatenation of modules/ — tracking it in git wastes AI tool context
    // and causes noisy diffs. Source of truth is modules/*.js, not the concatenated output.
    expect({ appJsIgnored: gitignore.includes('raspberry/admin/public/app.js') })
      .toEqual({ appJsIgnored: true });
  });

  it('styles.css must be gitignored (build artifact generated by build-admin.sh)', () => {
    expect({ stylesCssIgnored: gitignore.includes('raspberry/admin/public/styles.css') })
      .toEqual({ stylesCssIgnored: true });
  });
});

describe('Sync-agent debug bundle regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // Issue: BSSID connected ≠ BSSID locked for hours with no detection.
  // Fix: checkBssidMismatch() in network-watchdog auto-clears stale locks.
  it('network-watchdog must have BSSID mismatch detection', () => {
    const watchdog = [
      'raspberry/sync-agent/src/services/network-watchdog.js',
      'raspberry/sync-agent/src/services/internet-watchdog.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({ hasBssidCheck: watchdog.includes('checkBssidMismatch') })
      .toEqual({ hasBssidCheck: true });
    expect({ hasThreshold: watchdog.includes('BSSID_MISMATCH_THRESHOLD') })
      .toEqual({ hasThreshold: true });
  });

  // Issue: 11x duplicate config sync events during OTA extract.
  // Fix: ConfigWatcher.pause()/resume() mechanism.
  it('config-watcher must have pause/resume mechanism for OTA', () => {
    const watcher = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/watchers/config-watcher.js'),
      'utf8'
    );
    expect({ hasPause: watcher.includes('pause(') }).toEqual({ hasPause: true });
    expect({ hasResume: watcher.includes('resume()') }).toEqual({ hasResume: true });
    expect({ hasPausedFlag: watcher.includes('this.paused') }).toEqual({ hasPausedFlag: true });
  });

  // Issue: OTA must pause config-watcher before extracting.
  it('agent.js must pause config-watcher before OTA update', () => {
    const agentFiles = [
      'raspberry/sync-agent/src/agent.js',
      'raspberry/sync-agent/src/services/command-dispatch.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({ pausesBeforeOta: agentFiles.includes('configWatcher.pause') })
      .toEqual({ pausesBeforeOta: true });
  });

  // Issue: EACCES on unlink VERSION because fixFileOwnership only checked uid===0.
  // Fix: Check fs.constants.W_OK (actual write access).
  it('fixFileOwnership must check W_OK write access (not just uid)', () => {
    const otaFiles = [
      'raspberry/sync-agent/src/commands/update-software.js',
      'raspberry/sync-agent/src/commands/ota-install.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({ checksWriteAccess: otaFiles.includes('W_OK') })
      .toEqual({ checksWriteAccess: true });
  });

  // Issue: Stale sponsor_impressions.json from pre-v3.66.
  // Fix: Auto-cleanup on startup (must be CALLED in start(), not just defined).
  it('agent.js must cleanup legacy sponsor_impressions.json on startup', () => {
    const agent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
    expect({ hasCleanup: agent.includes('cleanupLegacyFiles') })
      .toEqual({ hasCleanup: true });
    expect({ hasSponsorPath: agent.includes('sponsor_impressions.json') })
      .toEqual({ hasSponsorPath: true });

    // Must be called in start() — defining the method without calling it
    // leaves sponsor_impressions.json (2448+ orphan entries) on the Pi forever.
    const startMethod = agent.slice(
      agent.indexOf('async start()'),
      agent.indexOf('async start()') + 2000
    );
    expect({ calledInStart: startMethod.includes('cleanupLegacyFiles') })
      .toEqual({ calledInStart: true });
  });

  // Issue: rsync without --delete leaves orphan sponsor-impressions.js on Pi.
  // Fix: build-raspberry.sh must use --delete for sync-agent rsync.
  it('build-raspberry.sh must use --delete for sync-agent rsync', () => {
    const buildScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/build-raspberry.sh'),
      'utf8'
    );
    // Find the sync-agent rsync line and verify --delete is present
    const syncAgentLines = buildScript.split('\n').filter(
      (line: string) => line.includes('rsync') && line.includes('sync-agent')
    );
    expect(syncAgentLines.length).toBeGreaterThan(0);
    expect({ hasDelete: syncAgentLines.some((line: string) => line.includes('--delete')) })
      .toEqual({ hasDelete: true });
  });

  // Issue: Channel flapping — threshold 3 was too sensitive, causing 4 channel changes
  // in 35 minutes on NLF mesh (transient phone hotspots triggered switches).
  // Fix: CONGESTION_THRESHOLD=5 (real congestion, not noise), MIN_IMPROVEMENT=3.
  // Combined with once-per-boot guard, this prevents channel oscillation.
  it('hotspot channel congestion threshold must be 5 (not 3) to prevent flapping', () => {
    const safeOps = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/safe-network-operations.js'),
      'utf8'
    );
    const thresholdMatch = safeOps.match(/CONGESTION_THRESHOLD\s*=\s*(\d+)/);
    const improvementMatch = safeOps.match(/MIN_IMPROVEMENT\s*=\s*(\d+)/);
    expect(thresholdMatch).not.toBeNull();
    expect(improvementMatch).not.toBeNull();
    expect({ congestionThreshold: Number(thresholdMatch![1]) })
      .toEqual({ congestionThreshold: 5 });
    expect({ minImprovement: Number(improvementMatch![1]) })
      .toEqual({ minImprovement: 3 });
  });

  // Guard: channel optimization must only run once per boot cycle
  it('hotspot channel optimization must have once-per-boot guard', () => {
    const safeOps = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/safe-network-operations.js'),
      'utf8'
    );
    expect({ hasBootGuard: safeOps.includes('_hotspotChannelOptimizedThisBoot') })
      .toEqual({ hasBootGuard: true });
  });

  // Guard: wlan0 scan must not run while clients are connected (micro-dropouts)
  it('wlan0 channel scan must skip when clients are connected', () => {
    const safeOps = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/safe-network-operations.js'),
      'utf8'
    );
    expect({ checksClients: safeOps.includes('station dump') || safeOps.includes('connectedClients') })
      .toEqual({ checksClients: true });
  });

  // Guard: hotspot recovery must try adding IP before restarting hostapd
  it('hotspot recovery must have fast-path IP fix without hostapd restart', () => {
    const watchdog = [
      'raspberry/sync-agent/src/services/network-watchdog.js',
      'raspberry/sync-agent/src/services/hotspot-watchdog.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({ hasFastPath: watchdog.includes('clients préservés') || watchdog.includes('sans restart hostapd') })
      .toEqual({ hasFastPath: true });
  });

  // Issue: network_alert handler only used issues[] for message, missing message field.
  // Fix: Fallback to message string from alert payload.
  it('network-resilience handler must support message field in alerts', () => {
    const handler = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/network-resilience.handler.ts'),
      'utf8'
    );
    expect({ extractsMessage: /const\s*\{[^}]*message[^}]*\}\s*=\s*alert/.test(handler) })
      .toEqual({ extractsMessage: true });
  });
});

describe('OTA reboot race condition guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // Guard: reboot command must use 'shutdown -r', not setTimeout+exec('sudo reboot')
  it('reboot command must use shutdown -r (not setTimeout+reboot)', () => {
    const indexJs = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/index.js'),
      'utf8'
    );
    const rebootFn = indexJs.match(/async reboot\(\)[\s\S]*?return \{[^}]*\};/);
    expect(rebootFn).not.toBeNull();
    expect({ usesShutdown: rebootFn![0].includes("'shutdown'") })
      .toEqual({ usesShutdown: true });
    // Strip comments before checking for setTimeout — the comment mentions the old approach
    const codeOnly = rebootFn![0].replace(/\/\/.*$/gm, '');
    expect({ noSetTimeoutReboot: !/setTimeout[\s\S]*?reboot/.test(codeOnly) })
      .toEqual({ noSetTimeoutReboot: true });
  });

  // Guard: OTA scheduleReboot must use 'shutdown -r', not setTimeout
  it('OTA scheduleReboot must use shutdown -r (not setTimeout+reboot)', () => {
    const updateSw = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    // Match the full if(scheduleReboot){...} block up to the closing brace at same indent
    const rebootBlock = updateSw.match(/if\s*\(scheduleReboot\)\s*\{[\s\S]*?\.unref\(\);[\s\S]*?\}/);
    expect(rebootBlock).not.toBeNull();
    expect({ usesShutdown: rebootBlock![0].includes("'shutdown'") })
      .toEqual({ usesShutdown: true });
    // Strip comments before checking for setTimeout
    const codeOnly = rebootBlock![0].replace(/\/\/.*$/gm, '');
    expect({ noSetTimeoutReboot: !/setTimeout[\s\S]*?reboot/i.test(codeOnly) })
      .toEqual({ noSetTimeoutReboot: true });
  });

  // Guard: startServices() must skip sync-agent restart when reboot is scheduled
  it('startServices must skip sync-agent restart when scheduleReboot is true', () => {
    const updateSw = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    // Check the full file for the _scheduleReboot guard pattern — regex-matching
    // the exact function boundaries is fragile due to nested braces
    expect({ checksScheduleReboot: /this\._scheduleReboot/.test(updateSw) })
      .toEqual({ checksScheduleReboot: true });
    expect({ skipsRestartOnReboot: /Skipping sync-agent restart/.test(updateSw) })
      .toEqual({ skipsRestartOnReboot: true });
  });
});

describe('Kiosk GPU crash loop regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('cleanup_chromium must use SIGTERM before SIGKILL (graceful GPU shutdown)', () => {
    // SIGKILL without prior SIGTERM leaves V3D GPU in dirty state on Pi 5.
    // cleanup_chromium must send SIGTERM first and only SIGKILL as fallback.
    const termIndex = watchdog.indexOf('pkill -TERM -f "chromium"');
    const killIndex = watchdog.indexOf('pkill -9 -f "chromium"');
    expect({ hasSigterm: termIndex > -1 }).toEqual({ hasSigterm: true });
    expect({ hasSigkillFallback: killIndex > -1 }).toEqual({ hasSigkillFallback: true });
    expect({ sigtermBeforeSigkill: termIndex < killIndex })
      .toEqual({ sigtermBeforeSigkill: true });
  });

  it('cleanup_chromium must clean /dev/shm shared memory segments', () => {
    // Orphaned Chromium shared memory segments pollute the next instance's
    // GPU/IPC initialization, contributing to the crash loop.
    expect({ cleansChromiumShm: watchdog.includes('rm -rf /dev/shm/.org.chromium.') })
      .toEqual({ cleansChromiumShm: true });
  });

  it('kiosk-watchdog.sh must check nginx readiness before launching Chromium', () => {
    // Without this, Chromium may load before nginx is ready after a deploy,
    // resulting in a blank screen or loading a stale SW-cached version.
    expect({ hasNginxReadinessCheck: watchdog.includes('curl') && watchdog.includes('localhost') })
      .toEqual({ hasNginxReadinessCheck: true });
  });

  it('kiosk-watchdog.sh CHROMIUM_URL must use localhost (never neopro.local)', () => {
    // When multiple Pi are on the same LAN, mDNS resolves neopro.local to
    // whichever Pi responds first — causing one Pi to display the other's loop.
    // The kiosk Chromium always talks to its own nginx, so localhost is correct.
    // neopro.local remains valid for external access (SSH, phone remote, admin).
    const chromiumUrlLine = watchdog.split('\n').find(l => /^CHROMIUM_URL=/.test(l)) || '';
    const chromiumSecondaryLine = watchdog.split('\n').find(l => /^CHROMIUM_SECONDARY_URL=/.test(l)) || '';
    expect({ usesLocalhost: chromiumUrlLine.includes('localhost') && !chromiumUrlLine.includes('neopro.local') })
      .toEqual({ usesLocalhost: true });
    expect({ secondaryUsesLocalhost: chromiumSecondaryLine.includes('localhost') && !chromiumSecondaryLine.includes('neopro.local') })
      .toEqual({ secondaryUsesLocalhost: true });
  });

  it('common_flags must include --disable-gpu-shader-disk-cache', () => {
    // Stale GPU shader cache between versions causes Chromium rendering issues.
    expect({ hasShaderCacheDisable: watchdog.includes('--disable-gpu-shader-disk-cache') })
      .toEqual({ hasShaderCacheDisable: true });
  });

  it('stop_chromium_secondary must use SIGTERM before SIGKILL', () => {
    // stop_chromium_secondary shares the V3D GPU with the main Chromium.
    // A direct SIGKILL corrupts GPU state for BOTH instances.
    // SIGTERM must come first; SIGKILL only as fallback after timeout.
    const stopFn = watchdog.match(/stop_chromium_secondary\(\)\s*\{[\s\S]*?\n\}/);
    expect(stopFn).not.toBeNull();
    const fn = stopFn![0];
    const termIdx = fn.indexOf('kill -TERM');
    const killIdx = fn.indexOf('kill -9');
    expect({ hasSigterm: termIdx > -1 }).toEqual({ hasSigterm: true });
    expect({ sigtermBeforeSigkill: termIdx < killIdx })
      .toEqual({ sigtermBeforeSigkill: true });
  });

  it('stop_chromium_secondary must guard xrandr --off behind detect_hdmi1_status (DRM race)', () => {
    // When HDMI-1 cable is physically unplugged, the kernel DRM already marks it disconnected.
    // Running xrandr --off on a disconnected output triggers a DRM reconfiguration that can
    // briefly destabilize HDMI-0 status in sysfs (race condition → hdmi0=false transient →
    // primary screen shows "En attente d'écran" for a few seconds).
    // The xrandr --off must only run when the cable is still connected (disabled by config).
    const stopFn = watchdog.match(/stop_chromium_secondary\(\)\s*\{[\s\S]*?\n\}/);
    expect(stopFn).not.toBeNull();
    const fn = stopFn![0];
    expect({
      hasHdmi1Guard: fn.includes('detect_hdmi1_status'),
      hasXrandrOff: fn.includes('xrandr --output') && fn.includes('--off'),
    }).toEqual({
      hasHdmi1Guard: true,
      hasXrandrOff: true,
    });
  });

  it('check_for_crash_page must NOT match generic "Error" window titles', () => {
    // xdg-desktop-portal and other X11 windows can have "Error" in their title.
    // Matching generic "Error" causes false-positive crash detection → restart loop.
    const crashFn = watchdog.match(/check_for_crash_page\(\)\s*\{[\s\S]*?\n\}/);
    expect(crashFn).not.toBeNull();
    // Must NOT have a pattern like *"Error"* (too broad)
    expect({ noGenericErrorPattern: !crashFn![0].includes('"*"Error"*"') && !crashFn![0].includes("*\"Error\"*") })
      .toEqual({ noGenericErrorPattern: true });
  });

  it('--disable-features must include XdgDesktopPortal', () => {
    // xdg-desktop-portal spawns unnecessary portal windows in kiosk mode,
    // causing log spam and potential overlay issues on the main display.
    expect({ hasXdgDisable: watchdog.includes('XdgDesktopPortal') })
      .toEqual({ hasXdgDisable: true });
  });

  it('--disable-features must NOT appear inside array definitions (common_flags/gpu_flags)', () => {
    // CRITICAL: Chromium only honours the LAST --disable-features flag.
    // Having --disable-features in BOTH common_flags and gpu_flags means the
    // gpu_flags value silently overrides common_flags, so XdgDesktopPortal
    // ends up NOT disabled on Pi 5. All features must be combined into a
    // single --disable-features="$disable_features" at launch time.
    const arrayDisableFeatures = watchdog.match(/^\s+--disable-features=/gm) || [];
    expect({ noDisableFeaturesInArrays: arrayDisableFeatures.length })
      .toEqual({ noDisableFeaturesInArrays: 0 });
  });

  it('Chromium launch commands must use combined --disable-features variable', () => {
    // start_chromium() has 1 launch path (always --app= mode) and
    // start_chromium_secondary() has 1, both must pass combined --disable-features.
    const launchLines = watchdog.match(/"\$CHROMIUM_BIN".*--disable-features="\$disable_features"/g) || [];
    expect({ combinedDisableFeaturesCount: launchLines.length })
      .toEqual({ combinedDisableFeaturesCount: 2 }); // primary + secondary
  });

  it('--disable-features must include GCMDriver to suppress MCS endpoint spam', () => {
    // Without GCMDriver disabled, Chromium tries to connect to mtalk.google.com
    // every ~30s for push notifications. When WiFi drops (common with USB dongles),
    // this floods journalctl with "Failed to connect to MCS endpoint with error -105".
    // Neopro doesn't use Chromium push notifications.
    expect({ hasGcmDisable: watchdog.includes('GCMDriver') })
      .toEqual({ hasGcmDisable: true });
  });

  it('Pi 5 gpu_flags must include --disable-gpu-vsync', () => {
    // V3D Mesa driver on Pi 5 fails GetVSyncParametersIfAvailable() repeatedly.
    // --disable-gpu-vsync was already present for Pi 4 but missing from Pi 5 flags,
    // causing noisy "GetVSyncParametersIfAvailable() failed for 3 times!" in logs.
    // Both Pi 4 AND Pi 5 gpu_flags blocks must have this flag.
    const pi5Block = watchdog.match(/if \[\[ "\$PI_MODEL" == "pi5" \]\]; then[\s\S]*?gpu_flags=\([\s\S]*?\)/g) || [];
    const pi5HasVsync = pi5Block.some(block => block.includes('--disable-gpu-vsync'));
    expect({ pi5HasDisableGpuVsync: pi5HasVsync })
      .toEqual({ pi5HasDisableGpuVsync: true });
  });

  it('primary Chromium must have --user-data-dir for profile isolation', () => {
    // Without --user-data-dir, the primary Chromium uses the default profile
    // at /home/pi/.config/chromium/ which can accumulate stale state between
    // deploys. A dedicated temp dir ensures a clean profile on every restart.
    const startFn = watchdog.match(/start_chromium\(\)\s*\{[\s\S]*?\n\}/);
    expect(startFn).not.toBeNull();
    expect({ hasUserDataDir: startFn![0].includes('--user-data-dir=/tmp/kiosk-primary') })
      .toEqual({ hasUserDataDir: true });
  });

  it('cleanup_chromium must clean /tmp/kiosk-primary', () => {
    // Since primary Chromium now uses --user-data-dir=/tmp/kiosk-primary,
    // cleanup_chromium must purge this directory to avoid stale profile data.
    const cleanupFn = watchdog.match(/cleanup_chromium\(\)\s*\{[\s\S]*?\n\}/);
    expect(cleanupFn).not.toBeNull();
    expect({ cleansPrimary: cleanupFn![0].includes('rm -rf /tmp/kiosk-primary') })
      .toEqual({ cleansPrimary: true });
  });
});

describe('GPU decode mode (Pi 5 V4L2 hardware decode)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('--enable-features must NOT appear inside array definitions (common_flags/gpu_flags)', () => {
    // CRITICAL: Same rule as --disable-features — Chromium only honours the LAST
    // --enable-features flag. Having it in array AND as a variable means the variable
    // silently overrides the array value. All features must be combined into the
    // $enable_features variable and passed as a single flag at launch time.
    const arrayEnableFeatures = watchdog.match(/^\s+--enable-features=/gm) || [];
    // Filter out comment lines (starting with #) — only flag real array entries
    const nonCommentEntries = (watchdog.match(/^\s+--enable-features=/gm) || []).filter(match => {
      const lineIndex = watchdog.indexOf(match);
      const lineStart = watchdog.lastIndexOf('\n', lineIndex) + 1;
      const line = watchdog.substring(lineStart, watchdog.indexOf('\n', lineIndex));
      return !line.trim().startsWith('#');
    });
    expect({ noEnableFeaturesInArrays: nonCommentEntries.length })
      .toEqual({ noEnableFeaturesInArrays: 0 });
  });

  it('Chromium launch commands must use combined --enable-features variable', () => {
    // Both start_chromium() and start_chromium_secondary() must pass the combined
    // --enable-features="$enable_features" variable, not hardcoded values.
    const launchLines = watchdog.match(/"\$CHROMIUM_BIN".*--enable-features="\$enable_features"/g) || [];
    expect({ combinedEnableFeaturesCount: launchLines.length })
      .toEqual({ combinedEnableFeaturesCount: 2 }); // primary + secondary
  });

  it('Pi 5 hardware decode mode must enable V4L2FlatVideoDecoder', () => {
    // V4L2FlatVideoDecoder is the Chromium feature flag that enables
    // V4L2 stateless hardware decode on Pi 5 (BCM2712).
    // It must be added to enable_features in the "hardware" mode branch.
    const hardwareBlock = watchdog.match(/GPU_DECODE_MODE.*==.*"hardware"[\s\S]*?(?=else)/);
    expect(hardwareBlock).not.toBeNull();
    expect({ hasV4L2: hardwareBlock![0].includes('V4L2FlatVideoDecoder') })
      .toEqual({ hasV4L2: true });
  });

  it('Pi 5 hardware decode must NOT have --disable-gpu-memory-buffer-video-frames', () => {
    // --disable-gpu-memory-buffer-video-frames forces full software video path.
    // Hardware decode mode must NOT have this flag, otherwise V4L2 can't work.
    const hardwareBlock = watchdog.match(/GPU_DECODE_MODE.*==.*"hardware"[\s\S]*?gpu_flags=\([\s\S]*?\)/);
    expect(hardwareBlock).not.toBeNull();
    expect({ noMemBufDisable: !hardwareBlock![0].includes('--disable-gpu-memory-buffer-video-frames') })
      .toEqual({ noMemBufDisable: true });
  });

  it('Pi 5 software decode fallback must have --disable-gpu-memory-buffer-video-frames', () => {
    // Software decode fallback (after hardware crashes) must keep the original
    // --disable-gpu-memory-buffer-video-frames to prevent SharedImageBackingFactory crashes.
    const softwareBlock = watchdog.match(/else\s*\n\s*log.*software decode[\s\S]*?gpu_flags=\([\s\S]*?\)/);
    expect(softwareBlock).not.toBeNull();
    expect({ hasMemBufDisable: softwareBlock![0].includes('--disable-gpu-memory-buffer-video-frames') })
      .toEqual({ hasMemBufDisable: true });
  });

  it('GPU_DECODE_FALLBACK_FILE must use /tmp/ (tmpfs, cleared on reboot)', () => {
    // The fallback file MUST be on tmpfs (/tmp/) so it's cleared on reboot.
    // This ensures every boot re-attempts hardware decode, even if it failed before.
    // Using a persistent path (e.g., /home/pi/) would permanently lock into software mode.
    expect({ fallbackOnTmpfs: watchdog.includes('GPU_DECODE_FALLBACK_FILE="/tmp/') })
      .toEqual({ fallbackOnTmpfs: true });
  });

  it('record_crash must call record_gpu_decode_crash for auto-fallback', () => {
    // When Chromium crashes, record_crash() must call record_gpu_decode_crash()
    // to track hardware decode crashes. Without this, the fallback mechanism
    // never triggers and Chromium keeps crash-looping with hardware decode.
    const recordCrashFn = watchdog.match(/record_crash\(\)\s*\{[\s\S]*?\n\}/);
    expect(recordCrashFn).not.toBeNull();
    expect({ callsGpuCrash: recordCrashFn![0].includes('record_gpu_decode_crash') })
      .toEqual({ callsGpuCrash: true });
  });

  it('record_crash must call detect_gpu_decode_mode after recording crash', () => {
    // After recording the crash, record_crash() must re-detect the GPU decode mode.
    // This is what triggers the switch from hardware → software after enough crashes.
    const recordCrashFn = watchdog.match(/record_crash\(\)\s*\{[\s\S]*?\n\}/);
    expect(recordCrashFn).not.toBeNull();
    expect({ callsDetect: recordCrashFn![0].includes('detect_gpu_decode_mode') })
      .toEqual({ callsDetect: true });
  });

  it('kiosk-status.json must include gpuDecodeMode', () => {
    // The kiosk status JSON must report the current GPU decode mode
    // so the central dashboard can monitor which Pi's are using hardware vs software decode.
    expect({ hasGpuDecodeMode: watchdog.includes('gpuDecodeMode') })
      .toEqual({ hasGpuDecodeMode: true });
  });

  it('detect_gpu_decode_mode must be called after PI_MODEL detection', () => {
    // GPU decode mode depends on PI_MODEL being set first.
    // detect_gpu_decode_mode must be called AFTER detect_pi_model.
    const initBlock = watchdog.match(/PI_MODEL=\$\(detect_pi_model\)[\s\S]{0,200}detect_gpu_decode_mode/);
    expect({ calledAfterPiModel: initBlock !== null })
      .toEqual({ calledAfterPiModel: true });
  });

  it('both start_chromium functions must initialize enable_features variable', () => {
    // Both start_chromium() and start_chromium_secondary() must declare
    // local enable_features with OverlayScrollbar as the base value.
    // Without this, the Pi 5 hardware mode can't append V4L2FlatVideoDecoder.
    const startPrimary = watchdog.match(/start_chromium\(\)\s*\{[\s\S]*?\n\}/);
    const startSecondary = watchdog.match(/start_chromium_secondary\(\)\s*\{[\s\S]*?\n\}/);
    expect(startPrimary).not.toBeNull();
    expect(startSecondary).not.toBeNull();
    expect({ primaryHasEnableFeatures: startPrimary![0].includes('local enable_features="OverlayScrollbar"') })
      .toEqual({ primaryHasEnableFeatures: true });
    expect({ secondaryHasEnableFeatures: startSecondary![0].includes('local enable_features="OverlayScrollbar"') })
      .toEqual({ secondaryHasEnableFeatures: true });
  });
});

describe('Parasitic window detection guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('watchdog loop must detect non-Chromium active windows (parasitic process)', () => {
    // A non-Chromium window (VLC, xdg-desktop-portal, etc.) taking focus
    // hides the Angular kiosk entirely. The watchdog must detect this by
    // checking the active window name and killing the parasite.
    expect({ hasParasiteDetection: watchdog.includes('FENÊTRE PARASITE') })
      .toEqual({ hasParasiteDetection: true });
    expect({ checksActiveWindow: watchdog.includes('xdotool getactivewindow getwindowname') })
      .toEqual({ checksActiveWindow: true });
  });

  it('watchdog must restore Chromium focus after killing a parasitic window', () => {
    // After killing the parasite, Chromium must be brought back to the front
    // using xdotool windowactivate to ensure the TV displays the kiosk.
    expect({ restoresChromium: watchdog.includes('xdotool windowactivate') })
      .toEqual({ restoresChromium: true });
  });

  it('kiosk-watchdog.sh must NOT reference VLC or ffmpeg-stream', () => {
    // The HLS pipeline (VLC + FFmpeg) was an abandoned experiment.
    // The watchdog must never launch or depend on these tools.
    expect({ noVlc: !watchdog.includes('/usr/bin/vlc') && !watchdog.includes('vlc-kiosk') })
      .toEqual({ noVlc: true });
    expect({ noFfmpegStream: !watchdog.includes('ffmpeg-stream.sh') && !watchdog.includes('score-bridge') })
      .toEqual({ noFfmpegStream: true });
  });

  it('no systemd .service files must reference VLC or HLS pipeline in codebase', () => {
    // Prevent accidentally re-introducing the parasitic services.
    const systemdDir = path.join(repoRoot, 'raspberry/config/systemd');
    const serviceFiles = fs.readdirSync(systemdDir).filter(f => f.endsWith('.service'));
    for (const file of serviceFiles) {
      const content = fs.readFileSync(path.join(systemdDir, file), 'utf8');
      expect({ file, hasVlc: content.includes('vlc') }).toEqual({ file, hasVlc: false });
      expect({ file, hasHlsPipeline: content.includes('ffmpeg-stream') || content.includes('score-bridge') || content.includes('playlist-manager') })
        .toEqual({ file, hasHlsPipeline: false });
    }
  });
});

describe('Obsolete service cleanup guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const fixFleet = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
    'utf8'
  );

  it('fix-fleet-pi.sh must disable neopro-vlc-kiosk (abandoned POC, crash-loop)', () => {
    // neopro-vlc-kiosk is an old HLS/VLC POC that was never removed.
    // It's enabled + Restart=always + RestartSec=5 = infinite crash-loop
    // consuming CPU, filling logs, and blocking systemd-analyze.
    expect({ disablesVlcKiosk: fixFleet.includes('neopro-vlc-kiosk') })
      .toEqual({ disablesVlcKiosk: true });
  });

  it('fix-fleet-pi.sh must disable neopro-ffmpeg-stream (dependency of vlc-kiosk)', () => {
    expect({ disablesFfmpeg: fixFleet.includes('neopro-ffmpeg-stream') })
      .toEqual({ disablesFfmpeg: true });
  });

  it('fix-fleet-pi.sh must disable neopro-playlist-manager (MODULE_NOT_FOUND crash-loop)', () => {
    expect({ disablesPlaylistManager: fixFleet.includes('neopro-playlist-manager') })
      .toEqual({ disablesPlaylistManager: true });
  });

  it('fix-fleet-pi.sh must disable neopro-score-bridge (MODULE_NOT_FOUND crash-loop)', () => {
    expect({ disablesScoreBridge: fixFleet.includes('neopro-score-bridge') })
      .toEqual({ disablesScoreBridge: true });
  });

  it('fix-fleet-pi.sh must disable cups (printing — never used on kiosk Pi)', () => {
    expect({ disablesCups: fixFleet.includes('"cups"') })
      .toEqual({ disablesCups: true });
  });

  it('fix-fleet-pi.sh must disable ModemManager (no 3G/4G modem on Pi)', () => {
    expect({ disablesModemManager: fixFleet.includes('"ModemManager"') })
      .toEqual({ disablesModemManager: true });
  });

  it('fix-fleet-pi.sh must use systemctl disable (not mask) for useless services', () => {
    // mask prevents manual start — too aggressive for services that might be
    // needed temporarily for debugging. disable is the right level.
    expect({ usesDisable: fixFleet.includes('systemctl disable "$svc"') })
      .toEqual({ usesDisable: true });
    expect({ noMask: !fixFleet.includes('systemctl mask') })
      .toEqual({ noMask: true });
  });

  it('fix-fleet-pi.sh must check is-active (not just is-enabled) for obsolete services', () => {
    // Incident: 05/03/2026 — manually installed .service files (copied to
    // /etc/systemd/system/ without `systemctl enable`) return odd states from
    // is-enabled but still run via Restart=always. The cleanup silently skipped
    // them, leaving 225+ restart crash-loops per service.
    // Fix: check is-active as fallback to catch running-but-not-enabled services.
    expect({ checksIsActive: fixFleet.includes('systemctl is-active "$svc"') })
      .toEqual({ checksIsActive: true });
  });

  it('fix-fleet-pi.sh must remove .service unit files for obsolete services', () => {
    // Without removing the unit file, systemd can reload it after daemon-reload
    // and the crash-loop resumes. rm -f the .service file is the definitive fix.
    expect({ removesUnitFile: fixFleet.includes('rm -f "/etc/systemd/system/${svc}.service"') })
      .toEqual({ removesUnitFile: true });
  });

  it('fix-fleet-pi.sh must daemon-reload after removing obsolete unit files', () => {
    // daemon-reload tells systemd to forget removed unit files.
    // reset-failed clears the "failed" status from systemctl list-units.
    expect({ daemonReload: fixFleet.includes('systemctl daemon-reload') })
      .toEqual({ daemonReload: true });
    expect({ resetFailed: fixFleet.includes('systemctl reset-failed') })
      .toEqual({ resetFailed: true });
  });
});

describe('Deploy auto-cleanup of obsolete neopro services', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const deployRemote = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
    'utf8'
  );

  it('deploy-remote.sh must auto-disable neopro-*.service files absent from config/systemd/', () => {
    // When a service is removed from the repo, the next deploy must disable it
    // on the Pi — not rely on manually updating a hardcoded list
    expect({ scansInstalled: deployRemote.includes('neopro-*.service') })
      .toEqual({ scansInstalled: true });
    expect({ checksRepo: deployRemote.includes('config/systemd/\\$svc_name') })
      .toEqual({ checksRepo: true });
    expect({ disablesObsolete: deployRemote.includes('systemctl disable --now') })
      .toEqual({ disablesObsolete: true });
  });
});

describe('Deploy script kiosk restart ordering', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const deploy = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
    'utf8'
  );

  it('deploy-remote.sh must restart kiosk AFTER nginx (not in parallel)', () => {
    // Restarting kiosk in parallel with nginx causes a race: Chromium starts
    // before nginx is ready, loading stale content or a blank screen.
    // The 'wait' command must appear BEFORE the kiosk restart line.
    const waitIndex = deploy.lastIndexOf('\n    wait\n');
    const kioskRestartIndex = deploy.indexOf('sudo systemctl restart neopro-kiosk');
    expect({ hasWaitBeforeKiosk: waitIndex > -1 && kioskRestartIndex > -1 })
      .toEqual({ hasWaitBeforeKiosk: true });
    expect({ kioskAfterWait: kioskRestartIndex > waitIndex })
      .toEqual({ kioskAfterWait: true });
  });

  it('deploy-remote.sh diagnostic must capture SSH exit code (not swallow errors)', () => {
    // Incident: 25/02/2026 — diagnostic always showed "impossible de déterminer l'état"
    // because SSH errors were swallowed by 2>/dev/null. The diagnostic must capture
    // the SSH exit code and report connection failures explicitly.
    expect({ capturesSshExitCode: deploy.includes('DIAG_SSH_RC=$?') })
      .toEqual({ capturesSshExitCode: true });
    expect({ checksSshFailure: deploy.includes('DIAG_SSH_RC') && deploy.includes('connexion SSH échouée') })
      .toEqual({ checksSshFailure: true });
  });

  it('deploy-remote.sh must verify /etc/hosts before restarting services', () => {
    // Incident: 26/02/2026 — /etc/hosts was corrupted (binary data), causing
    // nginx to fail with "host not found in upstream localhost". The deploy script
    // must check /etc/hosts integrity and repair it before restarting nginx.
    expect({ checksEtcHosts: deploy.includes('/etc/hosts') })
      .toEqual({ checksEtcHosts: true });
    expect({ checks127001: deploy.includes('127.0.0.1') })
      .toEqual({ checks127001: true });
  });

  it('deploy-remote.sh must install nginx config from deployed config files', () => {
    // Incident: 01/03/2026 — deploy-remote.sh deployed admin files but did NOT update
    // the nginx config. Pi's running nginx config was missing /admin/ proxy block
    // (generated by an older install.sh), causing all /admin/api/* to return HTML
    // instead of being proxied to admin-server on port 8080.
    expect({ installsNginxConfig: deploy.includes('nginx-captive-portal.conf') })
      .toEqual({ installsNginxConfig: true });
    expect({ copiesToSitesAvailable: deploy.includes('/etc/nginx/sites-available/neopro') })
      .toEqual({ copiesToSitesAvailable: true });
    // Must test nginx config before applying (nginx -t)
    expect({ testsNginxConfig: deploy.includes('nginx -t') })
      .toEqual({ testsNginxConfig: true });
    // Must backup before overwriting (rollback safety)
    expect({ backupsConfig: deploy.includes('neopro.pre-deploy') })
      .toEqual({ backupsConfig: true });
  });
});

describe('Grafana kiosk health alerts', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const alertsYml = fs.readFileSync(
    path.join(repoRoot, 'docker/grafana/provisioning/alerting/neopro-alerts-cloud.yml'),
    'utf8'
  );

  it('must have kiosk crash alert rule', () => {
    expect({ hasKioskCrashAlert: alertsYml.includes('neopro-kiosk-crash') })
      .toEqual({ hasKioskCrashAlert: true });
  });

  it('must have kiosk down alert rule', () => {
    expect({ hasKioskDownAlert: alertsYml.includes('neopro-kiosk-down') })
      .toEqual({ hasKioskDownAlert: true });
  });

  it('must query neopro_kiosk_crashes_total metric', () => {
    expect({ queriesCrashMetric: alertsYml.includes('neopro_kiosk_crashes_total') })
      .toEqual({ queriesCrashMetric: true });
  });

  it('must query neopro_kiosk_status metric', () => {
    expect({ queriesStatusMetric: alertsYml.includes('neopro_kiosk_status') })
      .toEqual({ queriesStatusMetric: true });
  });
});

describe('Build script node_modules cleanup guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const buildScript = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/build-raspberry.sh'),
    'utf8'
  );

  it('build-raspberry.sh must exclude __tests__ from all rsync copies', () => {
    // All three rsync commands (server, sync-agent, admin) must exclude __tests__
    // to prevent shipping test code to production Pi.
    const rsyncLines = buildScript
      .split('\n')
      .filter((l) => l.includes('rsync') && l.includes('DEPLOY_DIR'));
    expect(rsyncLines.length).toBeGreaterThanOrEqual(3);
    for (const line of rsyncLines) {
      expect({ line, excludesTests: line.includes("--exclude='__tests__'") }).toEqual({
        line,
        excludesTests: true,
      });
    }
  });

  it('build-raspberry.sh must exclude coverage/ from sync-agent rsync', () => {
    // Coverage reports (Jest HTML output) must not ship to Pi.
    const syncAgentRsync = buildScript
      .split('\n')
      .find((l) => l.includes('rsync') && l.includes('sync-agent/'));
    expect(syncAgentRsync).toBeDefined();
    expect(syncAgentRsync).toContain("--exclude='coverage'");
  });

  it('build-raspberry.sh must have post-install cleanup block', () => {
    // The cleanup block removes docs, tests, @types, .map files etc.
    // from node_modules after npm install --production.
    expect(buildScript).toContain('Nettoyage des fichiers inutiles au runtime');
    expect(buildScript).toContain("@types");
    expect(buildScript).toContain("'*.map'");
    expect(buildScript).toContain("'test'");
    expect(buildScript).toContain("'*.md'");
  });

  it('build-raspberry.sh must report cleanup metrics (before/after)', () => {
    // The build must log how many files were removed so operators can
    // spot anomalies (e.g. cleanup accidentally deleting runtime files).
    expect(buildScript).toContain('BEFORE_FILES=');
    expect(buildScript).toContain('AFTER_FILES=');
    expect(buildScript).toContain('REMOVED=');
  });
});

describe('CI workflow reliability guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const ciWorkflow = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/ci.yml'),
    'utf8'
  );

  it('ci.yml must have concurrency with cancel-in-progress to prevent stale runs', () => {
    // Without this, pushing multiple commits triggers parallel CI runs on
    // intermediate commits that may fail because tests reference code not
    // yet present at that point in the history.
    expect(ciWorkflow).toContain('cancel-in-progress: true');
  });

  it('ci.yml must define concurrency group per workflow and ref', () => {
    // The group must include both workflow name and branch ref so that
    // runs on different branches don't cancel each other.
    expect(ciWorkflow).toContain('github.workflow');
    expect(ciWorkflow).toContain('github.ref');
  });
});

describe('FTP upload ensureDir guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const ftpStoragePath = path.join(repoRoot, 'central-server/src/config/ftp-storage.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(ftpStoragePath, 'utf8');
  });

  it('uploadFileToFtp (buffer) must call ensureDir before upload', () => {
    // Extract the uploadFileToFtp function body (buffer-based upload)
    const fnMatch = content.match(
      /export const uploadFileToFtp\b[\s\S]*?^};/m
    );
    expect(fnMatch).not.toBeNull();
    expect({
      hasEnsureDir: /ensureDir/.test(fnMatch![0]),
    }).toEqual({
      hasEnsureDir: true,
    });
  });

  it('uploadFileToFtpFromDisk (streaming) must call ensureDir before upload', () => {
    // Extract the uploadFileToFtpFromDisk function body (disk streaming upload)
    const fnMatch = content.match(
      /export const uploadFileToFtpFromDisk\b[\s\S]*?^};/m
    );
    expect(fnMatch).not.toBeNull();
    expect({
      hasEnsureDir: /ensureDir/.test(fnMatch![0]),
    }).toEqual({
      hasEnsureDir: true,
    });
  });
});

describe('FTP verifyFtpFileExists must use client.size()', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const ftpStoragePath = path.join(repoRoot, 'central-server/src/config/ftp-storage.ts');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(ftpStoragePath, 'utf8');
  });

  it('verifyFtpFileExists must call client.size() for path-safe verification', () => {
    const fnMatch = content.match(
      /export const verifyFtpFileExists\b[\s\S]*?^};/m
    );
    expect(fnMatch).not.toBeNull();
    expect({
      usesSize: /client\.size\(/.test(fnMatch![0]),
    }).toEqual({
      usesSize: true,
    });
  });

  it('verifyFtpFileExists must NOT use client.list() without directory (root-only bug)', () => {
    const fnMatch = content.match(
      /export const verifyFtpFileExists\b[\s\S]*?^};/m
    );
    expect(fnMatch).not.toBeNull();
    // client.list() without argument only lists root — breaks for nested paths
    expect({
      usesBarelist: /client\.list\(\)/.test(fnMatch![0]),
    }).toEqual({
      usesBarelist: false,
    });
  });
});

describe('Kiosk screen dimension initialization guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const watchdog = fs.readFileSync(
    path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
    'utf8'
  );

  it('PRIMARY_SCREEN_WIDTH must NOT be initialized to a numeric value', () => {
    // Initializing to 0 (or any number) breaks ${VAR:-1920} fallback
    // because bash treats 0 as a non-empty value. Must use ="" or leave unset.
    const match = watchdog.match(/^PRIMARY_SCREEN_WIDTH=(.*)$/m);
    expect(match).not.toBeNull();
    const initValue = match![1].trim().replace(/^["']|["']$/g, '');
    expect({ initValue, isNumeric: /^[0-9]+$/.test(initValue) })
      .toEqual({ initValue, isNumeric: false });
  });

  it('PRIMARY_SCREEN_HEIGHT must NOT be initialized to a numeric value', () => {
    const match = watchdog.match(/^PRIMARY_SCREEN_HEIGHT=(.*)$/m);
    expect(match).not.toBeNull();
    const initValue = match![1].trim().replace(/^["']|["']$/g, '');
    expect({ initValue, isNumeric: /^[0-9]+$/.test(initValue) })
      .toEqual({ initValue, isNumeric: false });
  });

  it('launch_chromium must have runtime guard against dimensions ≤ 0', () => {
    // Defense-in-depth: even if init is wrong, runtime must catch it
    // before constructing --window-size flag
    expect(watchdog).toContain('-le 0');
  });
});

describe('Systemd service files must reference existing scripts', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const systemdDir = path.join(repoRoot, 'raspberry/config/systemd');
  const serviceFiles = fs.readdirSync(systemdDir).filter(f => f.endsWith('.service'));

  it('every .service ExecStart must reference a script that exists in the repo', () => {
    const missing: string[] = [];
    for (const file of serviceFiles) {
      const content = fs.readFileSync(path.join(systemdDir, file), 'utf8');
      // Extract ExecStart paths (skip systemd builtins like /bin/sleep)
      const execMatches = content.match(/^ExecStart(?:Pre|Post)?=.*?(\/(home|opt)\/pi\/neopro\/\S+)/gm);
      if (!execMatches) continue;
      for (const line of execMatches) {
        const scriptMatch = line.match(/(\/(home|opt)\/pi\/neopro\/\S+)/);
        if (!scriptMatch) continue;
        // Convert absolute Pi path to repo-relative path
        const piPath = scriptMatch[1];
        const repoPath = piPath.replace(/^\/(home|opt)\/pi\/neopro\//, 'raspberry/');
        const fullPath = path.join(repoRoot, repoPath);
        if (!fs.existsSync(fullPath)) {
          missing.push(`${file}: ${piPath} → ${repoPath} (not found)`);
        }
      }
    }
    expect({ missing }).toEqual({ missing: [] });
  });
});

describe('Nginx captive-portal proxy blocks (config drift prevention)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const nginxConf = fs.readFileSync(
    path.join(repoRoot, 'raspberry/config/nginx-captive-portal.conf'),
    'utf8'
  );
  const installSh = fs.readFileSync(
    path.join(repoRoot, 'raspberry/install.sh'),
    'utf8'
  );

  it('nginx-captive-portal.conf must have /admin/ proxy to port 8080', () => {
    // Without this block, the SPA catch-all (try_files $uri $uri/ /index.html)
    // returns webapp index.html for ALL /admin/api/* calls → HTML instead of JSON
    expect({
      hasAdminProxy: /location\s+\/admin\/\s*\{[^}]*proxy_pass\s+http:\/\/localhost:8080/s.test(nginxConf),
    }).toEqual({
      hasAdminProxy: true,
    });
  });

  it('nginx-captive-portal.conf must have /socket.io/ proxy with WebSocket upgrade', () => {
    // Without upgrade headers, Socket.IO falls back to long-polling → latency + broken real-time
    expect({
      hasSocketIoProxy: /location\s+\/socket\.io\/\s*\{[^}]*proxy_pass\s+http:\/\/localhost:3000/s.test(nginxConf),
      hasUpgradeHeader: /location\s+\/socket\.io\/\s*\{[^}]*Upgrade\s+\$http_upgrade/s.test(nginxConf),
    }).toEqual({
      hasSocketIoProxy: true,
      hasUpgradeHeader: true,
    });
  });

  it('nginx-captive-portal.conf must proxy /videos/ to admin-server (not alias)', () => {
    // proxy_pass normalizes Unicode filenames; alias does not → broken video paths
    expect({
      hasVideoProxy: /location\s+\/videos\/\s*\{[^}]*proxy_pass\s+http:\/\/127\.0\.0\.1:8080\/videos\//s.test(nginxConf),
    }).toEqual({
      hasVideoProxy: true,
    });
  });

  it('nginx-captive-portal.conf must proxy /thumbnails/ to admin-server (not alias)', () => {
    expect({
      hasThumbnailProxy: /location\s+\/thumbnails\/\s*\{[^}]*proxy_pass\s+http:\/\/127\.0\.0\.1:8080\/thumbnails\//s.test(nginxConf),
    }).toEqual({
      hasThumbnailProxy: true,
    });
  });

  it('install.sh must also have /admin/ proxy — both sources must stay in sync', () => {
    expect({
      installHasAdminProxy: /location\s+\/admin\/\s*\{[^}]*proxy_pass\s+http:\/\/localhost:8080/s.test(installSh),
    }).toEqual({
      installHasAdminProxy: true,
    });
  });

  it('install.sh must also have /socket.io/ proxy — both sources must stay in sync', () => {
    expect({
      installHasSocketIo: /location\s+\/socket\.io\/\s*\{[^}]*proxy_pass\s+http:\/\/localhost:3000/s.test(installSh),
    }).toEqual({
      installHasSocketIo: true,
    });
  });
});

describe('Admin demo mode safety', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const demoModule = fs.readFileSync(
    path.join(repoRoot, 'raspberry/admin/public/modules/demo/index.js'),
    'utf8'
  );

  it('demo/index.js must have a catch-all for unhandled /api/ routes', () => {
    // Without a catch-all, any new API route added to admin will crash in demo mode
    // because the fetch interceptor returns undefined for unhandled paths
    expect({
      hasCatchAll: /catch.all|unhandled.*\/api\/|\/api\//.test(demoModule) &&
        demoModule.includes('Catch-all'),
    }).toEqual({
      hasCatchAll: true,
    });
  });
});

describe('Admin HTML-as-JSON fetch protection', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const stateModule = fs.readFileSync(
    path.join(repoRoot, 'raspberry/admin/public/modules/core/state.js'),
    'utf8'
  );

  it('state.js must detect text/html on API responses and return JSON error', () => {
    expect({
      checksContentType: /text\/html/.test(stateModule),
      returnsJsonError: /HTML_RESPONSE/.test(stateModule),
    }).toEqual({
      checksContentType: true,
      returnsJsonError: true,
    });
  });
});

describe('deploy_video concurrent deployment mutex guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const deployVideoPath = path.join(repoRoot, 'raspberry/sync-agent/src/commands/deploy-video.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(deployVideoPath, 'utf8');
  });

  it('must have activeDeployments Map for deduplication', () => {
    expect({
      hasActiveDeployments: /activeDeployments\s*=\s*new\s+Map/.test(content),
    }).toEqual({
      hasActiveDeployments: true,
    });
  });

  it('execute() must check activeDeployments before starting download', () => {
    expect({
      checksMap: /activeDeployments\.has\(/.test(content),
      setsMap: /activeDeployments\.set\(/.test(content),
      deletesMap: /activeDeployments\.delete\(/.test(content),
    }).toEqual({
      checksMap: true,
      setsMap: true,
      deletesMap: true,
    });
  });

  it('execute() must delegate to _executeInternal (not inline download logic)', () => {
    // execute() must be the thin mutex wrapper, _executeInternal does the real work
    expect({
      hasExecuteInternal: /async\s+_executeInternal\s*\(/.test(content),
      executeDelegates: /this\._executeInternal\(/.test(content),
    }).toEqual({
      hasExecuteInternal: true,
      executeDelegates: true,
    });
  });
});

describe('site-content-tab deploy_video must include checksum', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const siteContentTabPath = path.join(
    repoRoot,
    'central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts'
  );

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(siteContentTabPath, 'utf8');
  });

  it('sendCommand deploy_video payload must include checksum field', () => {
    // Find the deploy_video sendCommand call and verify it includes checksum
    const deployMatch = content.match(
      /sendCommand\([^,]+,\s*'deploy_video'\s*,\s*\{([\s\S]*?)\}\s*\)\s*\.subscribe/
    );
    expect({ hasDeployCall: !!deployMatch }).toEqual({ hasDeployCall: true });
    expect({
      includesChecksum: /checksum\s*:/.test(deployMatch![1]),
    }).toEqual({
      includesChecksum: true,
    });
  });

  it('onVideoDeploy must guard against missing checksum before sending', () => {
    // The method must check video.checksum and show error if absent
    const methodMatch = content.match(
      /onVideoDeploy\(video[\s\S]*?(?=\n\s{2}\w|\n\s{2}\/\/\s*={3,})/
    );
    expect({ hasMethod: !!methodMatch }).toEqual({ hasMethod: true });
    expect({
      guardsChecksum: /!video\.checksum/.test(methodMatch![0]),
    }).toEqual({
      guardsChecksum: true,
    });
  });
});

describe('Sync-agent startup directory permission preflight', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const agentPath = path.join(repoRoot, 'raspberry/sync-agent/src/agent.js');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(agentPath, 'utf8');
  });

  it('start() must call ensureDirectoryPermissions before connect', () => {
    const startMethod = content.match(
      /async\s+start\s*\(\)([\s\S]*?)(?=\n\s{2}\w|\n\s{2}\/\*\*)/
    );
    expect(startMethod).not.toBeNull();
    expect({
      callsPermissionCheck: /ensureDirectoryPermissions/.test(startMethod![1]),
    }).toEqual({
      callsPermissionCheck: true,
    });
  });

  it('ensureDirectoryPermissions must check videos-secondary writable', () => {
    expect({
      checksVideosSecondary: /videos-secondary/.test(content),
      writesTestFile: /permission-check/.test(content),
    }).toEqual({
      checksVideosSecondary: true,
      writesTestFile: true,
    });
  });
});

describe('Pi admin panel security & architecture guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const adminDir = path.join(repoRoot, 'raspberry', 'admin');

  it('auth.js must export requireCsrf middleware', () => {
    const content = fs.readFileSync(path.join(adminDir, 'routes', 'auth.js'), 'utf8');
    expect(content).toMatch(/module\.exports\.requireCsrf\s*=/);
    expect(content).toMatch(/validateCsrf/);
  });

  it('admin-server.js must use requireCsrf middleware', () => {
    const content = fs.readFileSync(path.join(adminDir, 'admin-server.js'), 'utf8');
    expect(content).toMatch(/requireCsrf/);
    expect(content).toMatch(/app\.use\(requireCsrf\)/);
  });

  it('auth.js must have rate limiting (MAX_LOGIN_ATTEMPTS + checkRateLimit + recordFailedAttempt)', () => {
    const content = fs.readFileSync(path.join(adminDir, 'routes', 'auth.js'), 'utf8');
    expect(content).toMatch(/MAX_LOGIN_ATTEMPTS/);
    expect(content).toMatch(/checkRateLimit/);
    expect(content).toMatch(/recordFailedAttempt/);
  });

  it('auth.js must have password change route', () => {
    const content = fs.readFileSync(path.join(adminDir, 'routes', 'auth.js'), 'utf8');
    expect(content).toMatch(/\/api\/auth\/change-password/);
    expect(content).toMatch(/newPassword\.length\s*<\s*8/);
  });

  it('realtime.js module must exist and connect to :3000', () => {
    const realtimePath = path.join(adminDir, 'public', 'modules', 'core', 'realtime.js');
    expect(fs.existsSync(realtimePath)).toBe(true);
    const content = fs.readFileSync(realtimePath, 'utf8');
    expect(content).toMatch(/initRealtime/);
    expect(content).toMatch(/:3000/);
    expect(content).toMatch(/config_updated/);
  });

  it('build-admin.sh must concatenate CSS modules from styles/ directory', () => {
    const buildScript = fs.readFileSync(path.join(adminDir, 'public', 'build-admin.sh'), 'utf8');
    expect(buildScript).toMatch(/styles\/base\.css/);
    expect(buildScript).toMatch(/styles\/responsive\.css/);
    expect(buildScript).toMatch(/CSS_OUTPUT/);
  });

  it('.eslintrc.json must exist for frontend linting', () => {
    expect(fs.existsSync(path.join(adminDir, '.eslintrc.json'))).toBe(true);
  });

  it('state.js fetch wrapper must inject X-CSRF-Token header on mutations', () => {
    const content = fs.readFileSync(path.join(adminDir, 'public', 'modules', 'core', 'state.js'), 'utf8');
    expect(content).toMatch(/X-CSRF-Token/);
    expect(content).toMatch(/admin_csrf/);
  });

  it('auth.js login route must check rate limit before password (defense-in-depth order)', () => {
    const content = fs.readFileSync(path.join(adminDir, 'routes', 'auth.js'), 'utf8');
    const rateLimitPos = content.indexOf('checkRateLimit(clientIp)');
    const passwordCheckPos = content.indexOf('password !== adminPassword');
    expect(rateLimitPos).toBeGreaterThan(-1);
    expect(passwordCheckPos).toBeGreaterThan(-1);
    // Rate limit must come BEFORE password check
    expect(rateLimitPos).toBeLessThan(passwordCheckPos);
  });

  it('auth.js must set CSRF cookie as non-httpOnly (readable by JS)', () => {
    const content = fs.readFileSync(path.join(adminDir, 'routes', 'auth.js'), 'utf8');
    // The admin_csrf cookie must NOT be httpOnly so JavaScript can read it
    expect(content).toMatch(/admin_csrf.*httpOnly:\s*false/s);
  });
});

describe('Hotspot TKIP→CCMP regression guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('hostapd.conf template must use CCMP (never TKIP)', () => {
    const template = fs.readFileSync(
      path.join(repoRoot, 'raspberry/config/systemd/hostapd.conf'),
      'utf8'
    );
    expect({
      hasCCMP: /wpa_pairwise=CCMP/.test(template),
      hasTKIP: /wpa_pairwise=TKIP/.test(template),
    }).toEqual({
      hasCCMP: true,
      hasTKIP: false,
    });
  });

  it('install.sh configure_hotspot must not inject TKIP', () => {
    const install = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8'
    );
    // install.sh copies the template; ensure it doesn't sed CCMP back to TKIP
    expect(install).not.toMatch(/wpa_pairwise=TKIP/);
  });

  it('fix-fleet-pi.sh must contain TKIP→CCMP remediation', () => {
    const fixScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    expect({
      detectsTKIP: /wpa_pairwise=TKIP/.test(fixScript),
      replacesCCMP: /wpa_pairwise=CCMP/.test(fixScript),
    }).toEqual({
      detectsTKIP: true,
      replacesCCMP: true,
    });
  });

  it('prepare-image.sh must use CCMP in inline hostapd config', () => {
    const prepareImage = fs.readFileSync(
      path.join(repoRoot, 'raspberry/tools/prepare-image.sh'),
      'utf8'
    );
    expect({
      hasCCMP: /wpa_pairwise=CCMP/.test(prepareImage),
      hasTKIP: /wpa_pairwise=TKIP/.test(prepareImage),
    }).toEqual({
      hasCCMP: true,
      hasTKIP: false,
    });
  });
});

describe('TV cursor hiding regression guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('install.sh must install unclutter-xfixes (not unclutter)', () => {
    const install = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8'
    );
    expect(install).toMatch(/apt-get install[^;]*unclutter-xfixes/s);
  });

  it('install.sh configure_gui must write @unclutter to LXDE autostart', () => {
    const install = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8'
    );
    expect(install).toMatch(/@unclutter -idle 0 -root/);
  });

  it('fix-fleet-pi.sh must install missing packages and fix cursor', () => {
    const fixScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    expect({
      installsUnclutterXfixes: /unclutter-xfixes/.test(fixScript),
      removesOldUnclutter: /apt-get remove.*unclutter/.test(fixScript),
      fixesAutostart: /@unclutter/.test(fixScript),
      installsX11Utils: /x11-utils/.test(fixScript),
      installsEdidDecode: /edid-decode/.test(fixScript),
    }).toEqual({
      installsUnclutterXfixes: true,
      removesOldUnclutter: true,
      fixesAutostart: true,
      installsX11Utils: true,
      installsEdidDecode: true,
    });
  });
});

describe('Boot splash screen guards', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const indexHtml = fs.readFileSync(
    path.join(repoRoot, 'raspberry/src/index.html'),
    'utf8'
  );
  const appComponent = fs.readFileSync(
    path.join(repoRoot, 'raspberry/src/app/app.component.ts'),
    'utf8'
  );
  const installSh = fs.readFileSync(
    path.join(repoRoot, 'raspberry/install.sh'),
    'utf8'
  );

  it('index.html must have inline neopro-boot-splash div', () => {
    // The inline splash renders instantly before Angular bootstraps,
    // eliminating the 5-15s white screen gap in Chromium.
    expect({ hasSplash: indexHtml.includes('id="neopro-boot-splash"') })
      .toEqual({ hasSplash: true });
  });

  it('inline boot splash must NOT use 100vw (causes overflow with scrollbars)', () => {
    // Extract the splash block to check only its styles
    const splashMatch = indexHtml.match(
      /id="neopro-boot-splash"[\s\S]*?<\/div>\s*<style>[^<]*<\/style>/
    );
    expect(splashMatch).not.toBeNull();
    const splashBlock = splashMatch![0];
    expect({
      no100vw: !splashBlock.includes('100vw'),
      reason: 'Use 100% instead of 100vw — 100vw includes scrollbar width'
    }).toEqual({
      no100vw: true,
      reason: 'Use 100% instead of 100vw — 100vw includes scrollbar width'
    });
  });

  it('inline boot splash must appear BEFORE <app-root>', () => {
    // The splash must render before Angular's root element so it's visible immediately.
    const splashIdx = indexHtml.indexOf('neopro-boot-splash');
    const appRootIdx = indexHtml.indexOf('<app-root>');
    expect(splashIdx).toBeGreaterThan(-1);
    expect(appRootIdx).toBeGreaterThan(-1);
    expect({ splashBeforeAppRoot: splashIdx < appRootIdx })
      .toEqual({ splashBeforeAppRoot: true });
  });

  it('app.component.ts must remove neopro-boot-splash after bootstrap', () => {
    // Without removal, the splash would stay on top of the TV content forever.
    expect({ removesSplash: appComponent.includes('neopro-boot-splash') })
      .toEqual({ removesSplash: true });
  });

  it('install.sh must have configure_boot_splash function', () => {
    expect({ hasFunction: /configure_boot_splash\(\)/.test(installSh) })
      .toEqual({ hasFunction: true });
  });

  it('install.sh configure_boot_splash must configure quiet boot in cmdline.txt', () => {
    // Extract the function body
    const fnMatch = installSh.match(
      /configure_boot_splash\(\)\s*\{[\s\S]*?\n\}/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect({
      hasQuiet: fnBody.includes('quiet'),
      hasSplash: fnBody.includes('splash'),
      hasLogoNologo: fnBody.includes('logo.nologo'),
      hasLoglevel: fnBody.includes('loglevel'),
    }).toEqual({
      hasQuiet: true,
      hasSplash: true,
      hasLogoNologo: true,
      hasLoglevel: true,
    });
  });

  it('install.sh configure_boot_splash must set disable_splash=1 in config.txt', () => {
    const fnMatch = installSh.match(
      /configure_boot_splash\(\)\s*\{[\s\S]*?\n\}/
    );
    expect(fnMatch).not.toBeNull();
    expect({ disableSplash: fnMatch![0].includes('disable_splash=1') })
      .toEqual({ disableSplash: true });
  });

  it('fix-fleet-pi.sh must configure boot splash (cmdline.txt + config.txt)', () => {
    const fixFleetContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    expect({ hasQuiet: fixFleetContent.includes('quiet') && fixFleetContent.includes('splash') && fixFleetContent.includes('logo.nologo') })
      .toEqual({ hasQuiet: true });
    expect({ hasDisableSplash: fixFleetContent.includes('disable_splash=1') })
      .toEqual({ hasDisableSplash: true });
  });

  it('deploy-remote.sh must auto-run fix-fleet-pi.sh after deployment', () => {
    const deployContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
      'utf8'
    );
    expect({ runsFixFleet: deployContent.includes('fix-fleet-pi.sh') })
      .toEqual({ runsFixFleet: true });
  });

  it('deploy-remote.sh must run fix-fleet-pi.sh with sudo (requires root for boot config)', () => {
    const deployContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
      'utf8'
    );
    // fix-fleet-pi.sh checks id -u == 0 and exits if not root
    // Without sudo, it silently fails and boot splash / config.txt changes are never applied
    expect({ usesSudo: deployContent.includes('sudo') && deployContent.includes('fix-fleet-pi.sh') })
      .toEqual({ usesSudo: true });
  });

  it('deploy-remote.sh must capture fix-fleet-pi.sh exit code (not silently swallow)', () => {
    const deployContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
      'utf8'
    );
    // Capturing exit code ensures failures are visible in deploy logs
    // instead of being silently eaten by || true
    expect({ capturesExitCode: deployContent.includes('FLEET_EXIT_CODE') && deployContent.includes('DEPLOY_FLEET_FIX_FAILED') })
      .toEqual({ capturesExitCode: true });
  });

  it('OTA update-software.js must auto-run fix-fleet-pi.sh after install', () => {
    const otaFiles = [
      'raspberry/sync-agent/src/commands/update-software.js',
      'raspberry/sync-agent/src/commands/ota-install.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    expect({ runsFixFleet: otaFiles.includes('fix-fleet-pi.sh') })
      .toEqual({ runsFixFleet: true });
  });

  it('OTA update-software.js must run fix-fleet-pi.sh with sudo (requires root for boot config)', () => {
    const otaFiles = [
      'raspberry/sync-agent/src/commands/update-software.js',
      'raspberry/sync-agent/src/commands/ota-install.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    // fix-fleet-pi.sh checks id -u == 0 and exits if not root
    // Without sudo, it silently fails and all 13 fleet remediation steps are skipped
    expect({ usesSudo: otaFiles.includes('sudo') && otaFiles.includes('fix-fleet-pi.sh') })
      .toEqual({ usesSudo: true });
  });

  it('fix-fleet-pi.sh must replace Plymouth splash with NEOPRO branding', () => {
    const fixFleetContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    // Must handle Plymouth splash replacement using real logo
    expect({ hasPlymouthReplace: fixFleetContent.includes('plymouth') && fixFleetContent.includes('splash.png') })
      .toEqual({ hasPlymouthReplace: true });
    expect({ usesRealLogo: fixFleetContent.includes('neopro-logo-white.png') })
      .toEqual({ usesRealLogo: true });
    // Must update initramfs after replacing splash
    expect({ updatesInitramfs: fixFleetContent.includes('update-initramfs') })
      .toEqual({ updatesInitramfs: true });
  });

  it('fix-fleet-pi.sh must configure black desktop to hide LXDE between Plymouth and Chromium', () => {
    const fixFleetContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    // Must set pcmanfm desktop background to black
    expect({ setsBlackDesktop: fixFleetContent.includes('desktop_bg=#0a0a0a') })
      .toEqual({ setsBlackDesktop: true });
    // Must add xsetroot -solid black to autostart
    expect({ setsXsetroot: fixFleetContent.includes('xsetroot -solid black') })
      .toEqual({ setsXsetroot: true });
    // Must remove lxpanel from autostart (taskbar visibility)
    expect({ removesLxpanel: fixFleetContent.includes('lxpanel') })
      .toEqual({ removesLxpanel: true });
    // CRITICAL: pcmanfm-pi wrapper uses "default" profile (NOT LXDE-pi) — must fix default profile too
    expect({ fixesDefaultProfile: fixFleetContent.includes('pcmanfm/default/desktop-items') })
      .toEqual({ fixesDefaultProfile: true });
    // Must fix system-level config too (/etc/xdg)
    expect({ fixesSystemConfig: fixFleetContent.includes('/etc/xdg/pcmanfm') })
      .toEqual({ fixesSystemConfig: true });
  });

  it('index.html boot splash must use real NEOPRO logo image (not generic SVG)', () => {
    const indexContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/index.html'),
      'utf8'
    );
    expect({ usesLogoImage: indexContent.includes('neopro-logo-white.png') })
      .toEqual({ usesLogoImage: true });
    // Must NOT use the generic SVG play icon
    expect({ noGenericSVG: !indexContent.includes('viewBox="0 0 200 200"') })
      .toEqual({ noGenericSVG: true });
  });

  // ── Kiosk X11 splash overlay guards ──
  // feh displays a fullscreen NEOPRO image BEFORE Chromium launches,
  // covering the 2-5s gap where Chromium appears with window decorations
  // before xdotool applies fullscreen. Killed once fullscreen is set.

  it('fix-fleet-pi.sh must include feh in recommended packages', () => {
    const fixFleetContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    // feh is the lightweight image viewer used for the kiosk boot splash overlay
    expect({ hasFeh: /RECOMMENDED_PACKAGES\s*=\s*\([\s\S]*?"feh"/.test(fixFleetContent) })
      .toEqual({ hasFeh: true });
  });

  it('fix-fleet-pi.sh must generate kiosk boot splash image (boot-splash.png)', () => {
    const fixFleetContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    // Must generate data/boot-splash.png using Pillow
    expect({ generatesBootSplash: fixFleetContent.includes('boot-splash.png') })
      .toEqual({ generatesBootSplash: true });
    expect({ usesPillow: fixFleetContent.includes('from PIL import Image') })
      .toEqual({ usesPillow: true });
  });

  it('kiosk-watchdog.sh must call show_boot_splash before launching Chromium', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // show_boot_splash must appear after start_chromium() definition
    // and before the "$CHROMIUM_BIN" launch line in that function
    const startChromiumIdx = kioskContent.indexOf('start_chromium()');
    const afterStartChromium = kioskContent.slice(startChromiumIdx);
    const showSplashIdx = afterStartChromium.indexOf('show_boot_splash');
    const chromiumLaunchIdx = afterStartChromium.indexOf('"$CHROMIUM_BIN"');
    expect({ hasShowSplash: showSplashIdx > -1 })
      .toEqual({ hasShowSplash: true });
    expect({ splashBeforeChromium: showSplashIdx < chromiumLaunchIdx })
      .toEqual({ splashBeforeChromium: true });
  });

  it('kiosk-watchdog.sh must call kill_boot_splash after fullscreen is applied', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // kill_boot_splash must be called inside the fullscreen subshell (after xdotool)
    // and also in cleanup_chromium and the trap handler
    expect({ killInCleanup: kioskContent.includes('cleanup_chromium') && kioskContent.match(/cleanup_chromium\(\)\s*\{[\s\S]*?kill_boot_splash/) !== null })
      .toEqual({ killInCleanup: true });
    expect({ killInTrap: /trap\s+['"].*kill_boot_splash/.test(kioskContent) })
      .toEqual({ killInTrap: true });
  });

  it('kiosk-watchdog.sh show_boot_splash must use feh --fullscreen', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const showSplashMatch = kioskContent.match(
      /show_boot_splash\(\)\s*\{([\s\S]*?)\n\}/
    );
    expect(showSplashMatch).not.toBeNull();
    const fnBody = showSplashMatch![1];
    expect({ usesFehFullscreen: fnBody.includes('feh') && fnBody.includes('--fullscreen') })
      .toEqual({ usesFehFullscreen: true });
    // Must hide pointer and menus for kiosk mode
    expect({ hidesPointer: fnBody.includes('--hide-pointer') })
      .toEqual({ hidesPointer: true });
    expect({ noMenus: fnBody.includes('--no-menus') })
      .toEqual({ noMenus: true });
  });

  it('kiosk-watchdog.sh kill_boot_splash must pkill stale feh processes', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const killSplashMatch = kioskContent.match(
      /kill_boot_splash\(\)\s*\{([\s\S]*?)\n\}/
    );
    expect(killSplashMatch).not.toBeNull();
    const fnBody = killSplashMatch![1];
    // Must pkill stale feh processes as safety net (not just BOOT_SPLASH_PID)
    expect({ pkillsFeh: fnBody.includes('pkill -f') && fnBody.includes('feh') })
      .toEqual({ pkillsFeh: true });
  });

  it('kiosk-watchdog.sh must have BOOT_SPLASH_IMAGE fallback cascade', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // Must check data/boot-splash.png first, then fall back to Plymouth splash.png
    expect({ hasBootSplashImage: kioskContent.includes('BOOT_SPLASH_IMAGE') })
      .toEqual({ hasBootSplashImage: true });
    expect({ hasDataSplash: kioskContent.includes('data/boot-splash.png') })
      .toEqual({ hasDataSplash: true });
    expect({ hasPlymouthFallback: kioskContent.includes('splash.png') })
      .toEqual({ hasPlymouthFallback: true });
  });

  // Bug fix v3.98.2: LXDE/openbox restacks lxpanel above Chromium 1-5s after initial fullscreen.
  // Without a re-raise loop, the taskbar stays visible ~30s until the next check_window_stacking
  // in the main watchdog loop (CHECK_INTERVAL=30).
  it('kiosk-watchdog.sh fullscreen subshell must re-raise after kill_boot_splash (lxpanel restack defense)', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // The fullscreen subshell starts with "# Retry loop" and contains kill_boot_splash
    // followed by a re-raise loop with xprop + xdotool commands
    const retryIdx = kioskContent.indexOf('# Retry loop');
    expect(retryIdx).toBeGreaterThan(0);
    // Get the subshell region (from Retry loop to the next ') &')
    const subshellEnd = kioskContent.indexOf(') &', retryIdx);
    expect(subshellEnd).toBeGreaterThan(retryIdx);
    const subshell = kioskContent.substring(retryIdx, subshellEnd);
    // kill_boot_splash must come BEFORE the re-raise loop
    const killSplashIdx = subshell.indexOf('kill_boot_splash');
    const reRaiseIdx = subshell.indexOf('Re-raise');
    expect({ killSplashBeforeReRaise: killSplashIdx > 0 && reRaiseIdx > killSplashIdx })
      .toEqual({ killSplashBeforeReRaise: true });
    // Must have xprop + xdotool windowmove + windowsize + windowactivate AFTER kill_boot_splash
    const afterKill = subshell.slice(killSplashIdx);
    expect({ hasXpropReRaise: afterKill.includes('xprop -id') })
      .toEqual({ hasXpropReRaise: true });
    expect({ hasWindowmoveReRaise: afterKill.includes('xdotool windowmove') })
      .toEqual({ hasWindowmoveReRaise: true });
    expect({ hasWindowsizeReRaise: afterKill.includes('xdotool windowsize') })
      .toEqual({ hasWindowsizeReRaise: true });
    expect({ hasWindowactivateReRaise: afterKill.includes('xdotool windowactivate') })
      .toEqual({ hasWindowactivateReRaise: true });
  });

  // Bug fix v3.98.4: main loop must run fast (5s) for the first iterations after boot.
  // Without this, the first check_window_stacking only happens after 30s of sleep (CHECK_INTERVAL),
  // leaving a ~26s window where lxpanel/openbox can restack above Chromium unchecked
  // (D-Bus portals, XDG desktop portal, network events trigger restacking during boot).
  // Uses boot_fast_checks counter (no separate subshell — avoids xdotool race conditions).
  it('kiosk-watchdog.sh must use boot_fast_checks for rapid stacking checks after boot', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // boot_fast_checks must be initialized before the while true loop
    const secondaryIdx = kioskContent.indexOf('start_chromium_secondary');
    const whileIdx = kioskContent.indexOf('while true; do', secondaryIdx);
    expect(secondaryIdx).toBeGreaterThan(0);
    expect(whileIdx).toBeGreaterThan(secondaryIdx);
    const betweenRegion = kioskContent.substring(secondaryIdx, whileIdx);
    expect({ hasBootFastChecks: betweenRegion.includes('boot_fast_checks=') })
      .toEqual({ hasBootFastChecks: true });

    // Inside the while loop, boot_fast_checks must shorten the loop interval
    const loopBody = kioskContent.substring(whileIdx);
    expect({ usesBootFastChecksInLoop: loopBody.includes('boot_fast_checks > 0') })
      .toEqual({ usesBootFastChecksInLoop: true });
  });

  // Bug fix v3.98.2: install.sh LXDE autostart must NOT launch lxpanel (taskbar covers Chromium).
  // Root cause: @lxpanel in autostart file makes the WM launch the taskbar at boot, which sits
  // ABOVE Chromium fullscreen. install.sh must use @xsetroot -solid black instead.
  it('install.sh LXDE autostart must NOT contain @lxpanel (taskbar covers Chromium fullscreen)', () => {
    const installContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8'
    );
    // Extract the autostart heredoc content (between 'autostart << ' and 'EOF')
    const autostartMatch = installContent.match(
      /lxsession\/LXDE-pi\/autostart\s*<<\s*'?EOF'?\n([\s\S]*?)\nEOF/
    );
    expect(autostartMatch).not.toBeNull();
    const autostartContent = autostartMatch![1];
    // Must NOT have @lxpanel — it launches the taskbar that covers Chromium
    expect({ noLxpanel: !autostartContent.includes('@lxpanel') })
      .toEqual({ noLxpanel: true });
    // Must have @xsetroot -solid black (fond noir sans taskbar)
    expect({ hasXsetroot: autostartContent.includes('@xsetroot -solid black') })
      .toEqual({ hasXsetroot: true });
  });

  // Defense-in-depth: kiosk-watchdog.sh start_chromium() must kill lxpanel proactively
  // (belt-and-suspenders for Pi not yet redeployed with fixed install.sh)
  it('kiosk-watchdog.sh start_chromium must kill lxpanel proactively', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    // start_chromium() must have pkill -x lxpanel before launching Chromium
    const startFnMatch = kioskContent.match(
      /start_chromium\s*\(\)\s*\{([\s\S]*?)^}/m
    );
    expect(startFnMatch).not.toBeNull();
    const startFn = startFnMatch![1];
    expect({ killsLxpanel: startFn.includes('pkill -x lxpanel') })
      .toEqual({ killsLxpanel: true });
    // Must track kill count for monitoring
    expect({ tracksKillCount: startFn.includes('LXPANEL_KILL_COUNT') })
      .toEqual({ tracksKillCount: true });
  });

  // Defense-in-depth: kiosk-watchdog.sh check_window_stacking must kill lxpanel when panel_above
  it('kiosk-watchdog.sh check_window_stacking must kill lxpanel on panel_above detection', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    const stackingMatch = kioskContent.match(
      /check_window_stacking\s*\(\)\s*\{([\s\S]*?)^}/m
    );
    expect(stackingMatch).not.toBeNull();
    const stackingFn = stackingMatch![1];
    // When panel_above is detected, must kill lxpanel (not just re-raise)
    expect({ killsOnPanelAbove: stackingFn.includes('panel_above') && stackingFn.includes('pkill -x lxpanel') })
      .toEqual({ killsOnPanelAbove: true });
  });

  // deploy-remote.sh must fix lxpanel on existing Pi (retroactive fix for pre-patch installs)
  it('deploy-remote.sh must remove @lxpanel from LXDE autostart on existing Pi', () => {
    const deployContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/deploy-remote.sh'),
      'utf8'
    );
    // Must detect and remove @lxpanel from the autostart file
    expect({ removesLxpanel: deployContent.includes("/@lxpanel/d") })
      .toEqual({ removesLxpanel: true });
    // Must add xsetroot -solid black if missing
    expect({ addsXsetroot: deployContent.includes('xsetroot -solid black') })
      .toEqual({ addsXsetroot: true });
    // Must kill lxpanel for immediate effect
    expect({ killsLxpanel: deployContent.includes('pkill -x lxpanel') })
      .toEqual({ killsLxpanel: true });
  });

  // Monitoring: kiosk-status.json must include lxpanelKillCount for central server alerting
  it('kiosk-watchdog.sh kiosk-status.json must include lxpanelKillCount', () => {
    const kioskContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/kiosk-watchdog.sh'),
      'utf8'
    );
    expect({ hasLxpanelMetric: kioskContent.includes('lxpanelKillCount') })
      .toEqual({ hasLxpanelMetric: true });
  });

  // Monitoring: metrics.js health report must alert on lxpanelKillCount > 0
  it('metrics.js health report must alert on lxpanelKillCount > 0', () => {
    const metricsContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js'),
      'utf8'
    );
    expect({ alertsOnLxpanel: metricsContent.includes('lxpanelKillCount') })
      .toEqual({ alertsOnLxpanel: true });
  });
});

describe('pc_mode_enabled dead code guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('site.repository.ts must NOT contain pc_mode_enabled', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/repositories/site.repository.ts'),
      'utf8',
    );
    expect({
      hasPcMode: /pc_mode_enabled/.test(content),
      reason: 'pc_mode_enabled was dead code (E-23 placeholder) removed in v3.99.1 — do not re-add',
    }).toEqual({
      hasPcMode: false,
      reason: 'pc_mode_enabled was dead code (E-23 placeholder) removed in v3.99.1 — do not re-add',
    });
  });

  it('sites.controller.ts must NOT contain pc_mode_enabled', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/controllers/sites.controller.ts'),
      'utf8',
    );
    expect({
      hasPcMode: /pc_mode_enabled/.test(content),
      reason: 'pc_mode_enabled was dead code (E-23 placeholder) removed in v3.99.1 — do not re-add',
    }).toEqual({
      hasPcMode: false,
      reason: 'pc_mode_enabled was dead code (E-23 placeholder) removed in v3.99.1 — do not re-add',
    });
  });

  it('site-settings-tab template must NOT contain pc_mode_enabled', () => {
    const content = fs.readFileSync(
      path.join(
        repoRoot,
        'central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts',
      ),
      'utf8',
    );
    expect({
      hasPcMode: /pc_mode_enabled/.test(content),
      reason: 'pc_mode_enabled toggle was dead UI removed in v3.99.1 — do not re-add',
    }).toEqual({
      hasPcMode: false,
      reason: 'pc_mode_enabled toggle was dead UI removed in v3.99.1 — do not re-add',
    });
  });
});

describe('Orphan systemd service monitoring pipeline', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // metrics.js delegates services to service-metrics.js (ADR-044)
  const metricsAllFiles = [
    'raspberry/sync-agent/src/metrics.js',
    'raspberry/sync-agent/src/metrics/service-metrics.js',
  ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
  const agentJs = [
    'raspberry/sync-agent/src/agent.js',
    'raspberry/sync-agent/src/services/heartbeat.js',
  ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
  const heartbeatHandler = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
    'utf8'
  );
  const metricsService = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/services/metrics.service.ts'),
    'utf8'
  );

  it('metrics.js must have getOrphanServices() with LEGITIMATE_SERVICES whitelist', () => {
    // Pi-side detection: list all neopro-* units and filter against a known whitelist
    expect({ hasMethod: metricsAllFiles.includes('getOrphanServices') })
      .toEqual({ hasMethod: true });
    expect({ hasWhitelist: metricsAllFiles.includes('LEGITIMATE_SERVICES') })
      .toEqual({ hasWhitelist: true });
  });

  it('metrics.js getOrphanServices must be included in getHealthStatus()', () => {
    // Without integration into health status, orphans are detected but never reported
    expect({ integratedInHealth: metricsAllFiles.includes('orphanServices') && metricsAllFiles.includes('getHealthStatus') })
      .toEqual({ integratedInHealth: true });
  });

  it('agent.js heartbeat must transmit orphanServices to central', () => {
    // Without transmission, the central server never knows about orphans
    expect({ callsGetOrphan: agentJs.includes('getOrphanServices') })
      .toEqual({ callsGetOrphan: true });
    expect({ emitsOrphan: agentJs.includes('orphanServices') })
      .toEqual({ emitsOrphan: true });
  });

  it('heartbeat.handler.ts must detect and alert on orphanServices', () => {
    // Central-side: create alerts for each orphan service and log warnings
    expect({ checksOrphan: heartbeatHandler.includes('orphanServices') })
      .toEqual({ checksOrphan: true });
    expect({ createsAlert: heartbeatHandler.includes('orphan_systemd_service') })
      .toEqual({ createsAlert: true });
  });

  it('metrics.service.ts must have Prometheus counter for orphan services', () => {
    // Observability: Prometheus counter allows Grafana alerting on fleet-wide orphan patterns
    expect({ hasCounter: metricsService.includes('neopro_orphan_service_detected_total') })
      .toEqual({ hasCounter: true });
    expect({ hasMethod: metricsService.includes('recordOrphanServiceDetected') })
      .toEqual({ hasMethod: true });
  });
});

describe('GPU decode monitoring pipeline (v3.99.5)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  const heartbeatHandler = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
    'utf8'
  );
  const metricsService = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/services/metrics.service.ts'),
    'utf8'
  );
  const typesIndex = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/types/index.ts'),
    'utf8'
  );
  const piMetrics = fs.readFileSync(
    path.join(repoRoot, 'raspberry/sync-agent/src/metrics.js'),
    'utf8'
  );

  it('HeartbeatMessage kioskStatus type must include gpuDecodeMode', () => {
    // Without the type, TypeScript won't catch missing gpuDecodeMode handling
    expect({ hasGpuDecodeType: typesIndex.includes('gpuDecodeMode') })
      .toEqual({ hasGpuDecodeType: true });
  });

  it('heartbeat.handler.ts must detect gpu_decode_fallback alert', () => {
    // When gpuDecodeMode === 'software', the heartbeat must create a warning alert
    // so fleet operators know which Pi's have fallen back to software decode.
    expect({ checksGpuDecode: heartbeatHandler.includes('gpu_decode_fallback') })
      .toEqual({ checksGpuDecode: true });
    expect({ checksMode: heartbeatHandler.includes("gpuDecodeMode") })
      .toEqual({ checksMode: true });
  });

  it('metrics.service.ts must have Prometheus counter for GPU decode fallback', () => {
    // Prometheus counter allows Grafana alerting on fleet-wide GPU decode failures
    expect({ hasCounter: metricsService.includes('neopro_gpu_decode_fallback_total') })
      .toEqual({ hasCounter: true });
    expect({ hasMethod: metricsService.includes('recordGpuDecodeFallback') })
      .toEqual({ hasMethod: true });
  });

  it('Pi metrics.js health report must detect gpuDecodeMode software fallback', () => {
    // Health report must flag software decode as a warning with actionable fix
    expect({ detectsSoftware: piMetrics.includes("gpuDecodeMode") && piMetrics.includes("software") })
      .toEqual({ detectsSoftware: true });
  });

  it('Pi metrics.js health report must recommend reboot for GPU decode recovery', () => {
    // The fix guidance must tell operators to reboot (tmpfs cleared → re-tries hardware)
    expect({ hasRebootFix: piMetrics.includes('Redémarrer le boîtier') && piMetrics.includes('V4L2') })
      .toEqual({ hasRebootFix: true });
  });
});

describe('Android captive portal iptables (HTTPS connectivity check fix)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // Guard 1: Dedicated iptables/nftables setup script must exist with HTTPS redirect
  it('setup-captive-portal-iptables.sh must exist with HTTPS redirect rule', () => {
    const scriptPath = path.join(repoRoot, 'raspberry/scripts/setup-captive-portal-iptables.sh');
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect({
      hasPort443Rule: /dport\s+443/.test(content),
      hasPort80Rule: /dport\s+80/.test(content),
      hasHotspotIP: /HOTSPOT_IP=["']?192\.168\.4\.1/.test(content),
      hasNginxPort: /NGINX_PORT=["']?80/.test(content),
      hasIptablesCleanup: /iptables_cleanup/.test(content),
      hasNftablesCleanup: /nftables_cleanup/.test(content),
      hasBackendDetection: /FIREWALL_BACKEND/.test(content),
    }).toEqual({
      hasPort443Rule: true,
      hasPort80Rule: true,
      hasHotspotIP: true,
      hasNginxPort: true,
      hasIptablesCleanup: true,
      hasNftablesCleanup: true,
      hasBackendDetection: true,
    });
  });

  // Guard 2: Script must be idempotent (cleanup before install for both backends)
  it('setup-captive-portal-iptables.sh must cleanup before installing (idempotent)', () => {
    const scriptPath = path.join(repoRoot, 'raspberry/scripts/setup-captive-portal-iptables.sh');
    const content = fs.readFileSync(scriptPath, 'utf8');
    // iptables backend: cleanup before install
    const iptCleanupPos = content.indexOf('iptables_cleanup');
    const iptInstallPos = content.indexOf('iptables_install');
    // nftables backend: cleanup before install
    const nftCleanupPos = content.indexOf('nftables_cleanup');
    const nftInstallPos = content.indexOf('nftables_install');
    expect({
      iptablesCleanupBeforeInstall: iptCleanupPos > 0 && iptInstallPos > 0 && iptCleanupPos < iptInstallPos,
      nftablesCleanupBeforeInstall: nftCleanupPos > 0 && nftInstallPos > 0 && nftCleanupPos < nftInstallPos,
    }).toEqual({
      iptablesCleanupBeforeInstall: true,
      nftablesCleanupBeforeInstall: true,
    });
  });

  // Guard 3: install.sh must call the iptables script in configure_hotspot
  it('install.sh must setup captive portal iptables in configure_hotspot()', () => {
    const installSh = fs.readFileSync(path.join(repoRoot, 'raspberry/install.sh'), 'utf8');
    expect({
      callsIptablesScript: /setup-captive-portal-iptables/.test(installSh),
    }).toEqual({
      callsIptablesScript: true,
    });
  });

  // Guard 4: hotspot-watchdog must check iptables/nftables health with command detection
  it('hotspot-watchdog.sh must check captive portal with iptables/nftables support', () => {
    const watchdog = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/hotspot-watchdog.sh'),
      'utf8'
    );
    expect({
      hasIptablesCheck: /check_captive_portal_iptables/.test(watchdog),
      checksPort443: /dport\s+443/.test(watchdog),
      detectsIptablesAvailability: /command -v iptables/.test(watchdog),
      detectsNftAvailability: /command -v nft/.test(watchdog),
    }).toEqual({
      hasIptablesCheck: true,
      checksPort443: true,
      detectsIptablesAvailability: true,
      detectsNftAvailability: true,
    });
  });

  // Guard 4b: CRITICAL — captive portal must NOT be in critical issues that trigger recovery
  // On Debian 13 Trixie, iptables is removed → check always fails → if treated as critical,
  // hostapd+dnsmasq restart every 30s in an infinite loop (8h+ outage observed 2026-03-23).
  // Captive portal must be a WARNING only, stored in CAPTIVE_PORTAL_WARNING, not in HEALTH_ISSUES.
  it('hotspot-watchdog.sh must NOT include captive portal in critical health issues', () => {
    const watchdog = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/hotspot-watchdog.sh'),
      'utf8'
    );
    // The captive portal result must go to CAPTIVE_PORTAL_WARNING, not issues[]
    expect({
      hasCaptivePortalWarningVar: /CAPTIVE_PORTAL_WARNING/.test(watchdog),
      hasHealthIssuesVar: /HEALTH_ISSUES/.test(watchdog),
      captivePortalNotInIssuesArray: !/issues\+=\(.*iptables.*captive/.test(watchdog),
    }).toEqual({
      hasCaptivePortalWarningVar: true,
      hasHealthIssuesVar: true,
      captivePortalNotInIssuesArray: true,
    });
  });

  // Guard 5: hotspot-watchdog must recover iptables/nftables in attempt_recovery
  it('hotspot-watchdog.sh must restore captive portal in recovery sequence (iptables or nftables)', () => {
    const watchdog = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/hotspot-watchdog.sh'),
      'utf8'
    );
    expect({
      recoversIptables: /setup-captive-portal-iptables/.test(watchdog) ||
        /iptables.*443.*DNAT/.test(watchdog),
      recoversNftables: /nft add/.test(watchdog),
    }).toEqual({
      recoversIptables: true,
      recoversNftables: true,
    });
  });

  // Guard 6: hotspot recovery must restart hostapd BEFORE adding IP
  // (hostapd restart flushes manually-added IPs on wlan0 — adding IP before
  // restart means the IP is always lost → recovery always fails)
  it('hotspot recovery must restart hostapd BEFORE adding static IP', () => {
    // Check network-watchdog.js + hotspot-watchdog.js (ADR-044 extraction)
    const watchdogJs = [
      'raspberry/sync-agent/src/services/network-watchdog.js',
      'raspberry/sync-agent/src/services/hotspot-watchdog.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    const jsHostapdIdx = watchdogJs.indexOf('systemctl restart hostapd');
    const jsIpAddIdx = watchdogJs.indexOf('ip addr add 192.168.4.1', jsHostapdIdx);
    expect({
      hostapdBeforeIpAdd_js: jsHostapdIdx > 0 && jsIpAddIdx > jsHostapdIdx,
    }).toEqual({
      hostapdBeforeIpAdd_js: true,
    });

    // Check hotspot-watchdog.sh
    const watchdogSh = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/hotspot-watchdog.sh'),
      'utf8'
    );
    const shHostapdIdx = watchdogSh.indexOf('systemctl restart hostapd');
    const shIpAddIdx = watchdogSh.indexOf('ip addr add 192.168.4.1', shHostapdIdx);
    expect({
      hostapdBeforeIpAdd_sh: shHostapdIdx > 0 && shIpAddIdx > shHostapdIdx,
    }).toEqual({
      hostapdBeforeIpAdd_sh: true,
    });
  });

  // Guard 7: fix-fleet-pi.sh must install iptables for existing fleet
  it('fix-fleet-pi.sh must configure captive portal iptables for existing Pi fleet', () => {
    const fixFleet = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    expect({
      hasIptablesSection: /captive.*portal.*iptables/i.test(fixFleet),
      hasPort443: /--dport\s+443/.test(fixFleet),
    }).toEqual({
      hasIptablesSection: true,
      hasPort443: true,
    });
  });

  // Guard 7: dnsmasq.conf must redirect Android HTTPS check domains
  it('dnsmasq.conf must redirect all Android connectivity check domains', () => {
    const dnsmasq = fs.readFileSync(
      path.join(repoRoot, 'raspberry/config/systemd/dnsmasq.conf'),
      'utf8'
    );
    const requiredDomains = [
      'connectivitycheck.gstatic.com',
      'connectivitycheck.google.com',
      'clients3.google.com',
      'play.googleapis.com',
    ];
    const missing = requiredDomains.filter(d => !dnsmasq.includes(`address=/${d}/192.168.4.1`));
    expect({ missingAndroidDomains: missing }).toEqual({ missingAndroidDomains: [] });
  });
});

describe('Pi 5 Active Cooler fan control (dtparam=cooling_fan)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('install.sh must have configure_pi5_cooling_fan function', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8',
    );
    expect({ hasFunction: /configure_pi5_cooling_fan\(\)/.test(content) })
      .toEqual({ hasFunction: true });
  });

  it('install.sh configure_pi5_cooling_fan must add dtparam=cooling_fan to config.txt', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8',
    );
    const fnMatch = content.match(/configure_pi5_cooling_fan\(\)\s*\{[\s\S]*?\n\}/);
    expect(fnMatch).toBeTruthy();
    expect({ hasDtparam: /dtparam=cooling_fan/.test(fnMatch![0]) })
      .toEqual({ hasDtparam: true });
    // Must only apply to Pi 5
    expect({ checksPi5: /Raspberry Pi 5/.test(fnMatch![0]) })
      .toEqual({ checksPi5: true });
  });

  it('install.sh main() must call configure_pi5_cooling_fan', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/install.sh'),
      'utf8',
    );
    const mainMatch = content.match(/^main\(\)\s*\{[\s\S]*?\n\}/m);
    expect(mainMatch).toBeTruthy();
    expect({ callsConfigure: /configure_pi5_cooling_fan/.test(mainMatch![0]) })
      .toEqual({ callsConfigure: true });
  });

  it('fix-fleet-pi.sh must add dtparam=cooling_fan for Pi 5', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8',
    );
    expect({ hasDtparam: /dtparam=cooling_fan/.test(content) })
      .toEqual({ hasDtparam: true });
    // Must be guarded by IS_PI5 check
    expect({ hasPi5Guard: /IS_PI5.*true[\s\S]*?dtparam=cooling_fan/s.test(content) })
      .toEqual({ hasPi5Guard: true });
  });

  it('diagnose-pi.sh must check cooling_fan config on Pi 5', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/diagnose-pi.sh'),
      'utf8',
    );
    expect({ checksDtparam: /dtparam=cooling_fan/.test(content) })
      .toEqual({ checksDtparam: true });
    expect({ checksCoolingDevice: /cooling_device0/.test(content) })
      .toEqual({ checksCoolingDevice: true });
  });

  it('heartbeat.handler.ts must detect fan_config_disabled alert on Pi 5 without fan', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/handlers/heartbeat.handler.ts'),
      'utf8',
    );
    expect({ hasFanConfigAlert: /fan_config_disabled/.test(content) })
      .toEqual({ hasFanConfigAlert: true });
    // Must check is_pi5 + !present (fan not visible to kernel despite being a Pi 5)
    expect({ checksPi5AndNotPresent: /is_pi5[\s\S]*?!.*present|present[\s\S]*?is_pi5/s.test(content) })
      .toEqual({ checksPi5AndNotPresent: true });
  });
});

describe('Admin UI modal CSS guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const componentsCss = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'styles', 'components.css'),
    'utf8'
  );

  it('components.css .modal must use display:none (not visibility:hidden)', () => {
    // visibility:hidden + pointer-events:none breaks sponsor modals that open
    // via style.display='flex' without adding .active class
    const modalBlock = componentsCss.match(/\.modal\s*\{[^}]+\}/);
    expect(modalBlock).toBeTruthy();
    const block = modalBlock![0];
    expect({ usesDisplayNone: /display:\s*none/.test(block) })
      .toEqual({ usesDisplayNone: true });
    expect({ usesVisibilityHidden: /visibility:\s*hidden/.test(block) })
      .toEqual({ usesVisibilityHidden: false });
  });

  it('components.css .modal.active must use display:flex', () => {
    const activeBlock = componentsCss.match(/\.modal\.active\s*\{[^}]+\}/);
    expect(activeBlock).toBeTruthy();
    expect({ usesDisplayFlex: /display:\s*flex/.test(activeBlock![0]) })
      .toEqual({ usesDisplayFlex: true });
  });

  it('components.css must have modalSlideUp animation for modal-content', () => {
    expect({ hasSlideUp: /@keyframes\s+modalSlideUp/.test(componentsCss) })
      .toEqual({ hasSlideUp: true });
    expect({ contentUsesAnim: /\.modal-content[\s\S]*animation:\s*modalSlideUp/.test(componentsCss) })
      .toEqual({ contentUsesAnim: true });
  });
});

describe('Admin UI UX foundations guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const componentsCss = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'styles', 'components.css'),
    'utf8'
  );
  const sponsorIndex = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'modules', 'sponsors', 'index.js'),
    'utf8'
  );

  it('components.css must have skeleton loading classes with shimmer animation', () => {
    expect({ hasSkeleton: /\.skeleton\s*\{/.test(componentsCss) })
      .toEqual({ hasSkeleton: true });
    expect({ hasShimmer: /@keyframes\s+shimmer/.test(componentsCss) })
      .toEqual({ hasShimmer: true });
    expect({ hasSkeletonCard: /\.skeleton-card/.test(componentsCss) })
      .toEqual({ hasSkeletonCard: true });
  });

  it('components.css must have form validation classes (has-error + error message)', () => {
    expect({ hasError: /\.form-group\.has-error/.test(componentsCss) })
      .toEqual({ hasError: true });
    expect({ hasErrorMsg: /\.form-error-message/.test(componentsCss) })
      .toEqual({ hasErrorMsg: true });
  });

  it('components.css must have empty-state classes', () => {
    expect({ hasEmptyState: /\.empty-state\s*\{/.test(componentsCss) })
      .toEqual({ hasEmptyState: true });
    expect({ hasEmptyIcon: /\.empty-state-icon/.test(componentsCss) })
      .toEqual({ hasEmptyIcon: true });
    expect({ hasEmptyTitle: /\.empty-state-title/.test(componentsCss) })
      .toEqual({ hasEmptyTitle: true });
  });

  it('sponsors/index.js must clear form validation errors on input', () => {
    // Event delegation clears .has-error + .form-error-message on input
    expect({ hasInputClear: /\.form-group\.has-error/.test(sponsorIndex) })
      .toEqual({ hasInputClear: true });
    expect({ removesErrMsg: /form-error-message/.test(sponsorIndex) })
      .toEqual({ removesErrMsg: true });
  });

  it('sponsors empty state must use .empty-state class (not inline styles)', () => {
    // Old pattern: inline style="text-align: center; padding: 40px; color:..."
    // New pattern: CSS class .empty-state
    const emptySection = sponsorIndex.match(/Aucun sponsor[\s\S]{0,300}/);
    expect(emptySection).toBeTruthy();
    // Must NOT have inline padding style on the empty state container
    expect({ hasInlineStyle: /style="[^"]*padding:\s*40px/.test(emptySection![0]) })
      .toEqual({ hasInlineStyle: false });
  });
});

describe('Admin UX batch 2 — search feedback guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const loaderJs = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'modules', 'videos', 'loader.js'),
    'utf8'
  );
  const videosCss = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'styles', 'videos.css'),
    'utf8'
  );

  it('filterVideos() must update search-hint with visible count', () => {
    const filterFn = loaderJs.match(/function filterVideos\(\)[\s\S]*?^}/m);
    expect(filterFn).toBeTruthy();
    const body = filterFn![0];
    expect({ countsVisible: /visibleCount/.test(body) })
      .toEqual({ countsVisible: true });
    expect({ updatesHint: /searchHint\.textContent/.test(body) })
      .toEqual({ updatesHint: true });
  });

  it('filterVideos() must show "Aucune vidéo" on zero results', () => {
    const filterFn = loaderJs.match(/function filterVideos\(\)[\s\S]*?^}/m);
    expect(filterFn).toBeTruthy();
    expect({ hasEmptyMsg: /Aucune vidéo/.test(filterFn![0]) })
      .toEqual({ hasEmptyMsg: true });
  });

  it('filterVideos() must add/remove .no-results class', () => {
    const filterFn = loaderJs.match(/function filterVideos\(\)[\s\S]*?^}/m);
    expect(filterFn).toBeTruthy();
    const body = filterFn![0];
    expect({ addsNoResults: /classList\.add\(['"]no-results['"]\)/.test(body) })
      .toEqual({ addsNoResults: true });
    expect({ removesNoResults: /classList\.remove\(['"]no-results['"]\)/.test(body) })
      .toEqual({ removesNoResults: true });
  });

  it('filterVideos() must reset hint when search is empty', () => {
    const filterFn = loaderJs.match(/function filterVideos\(\)[\s\S]*?^}/m);
    expect(filterFn).toBeTruthy();
    expect({ resetsHint: /Filtre les vidéos ci-dessous/.test(filterFn![0]) })
      .toEqual({ resetsHint: true });
  });

  it('videos.css must have .search-hint.no-results with warning color', () => {
    expect({ hasNoResults: /\.search-hint\.no-results/.test(videosCss) })
      .toEqual({ hasNoResults: true });
    expect({ hasWarning: /var\(--neo-warning\)/.test(videosCss) })
      .toEqual({ hasWarning: true });
  });
});

describe('Admin UX batch 2 — video delete modal guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const indexHtml = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'index.html'),
    'utf8'
  );
  const loaderJs = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'modules', 'videos', 'loader.js'),
    'utf8'
  );

  it('index.html must have #video-delete-modal with role=alertdialog', () => {
    expect({ hasModal: /id="video-delete-modal"/.test(indexHtml) })
      .toEqual({ hasModal: true });
    expect({ hasRole: /role="alertdialog"/.test(indexHtml) })
      .toEqual({ hasRole: true });
  });

  it('index.html must have video-delete-name and video-delete-warning elements', () => {
    expect({ hasName: /id="video-delete-name"/.test(indexHtml) })
      .toEqual({ hasName: true });
    expect({ hasWarning: /id="video-delete-warning"/.test(indexHtml) })
      .toEqual({ hasWarning: true });
  });

  it('loader.js must NOT use native confirm() for video deletion', () => {
    // deleteVideo, removeConfigVideo, deleteConfigVideo must use modal
    const deleteVideo = loaderJs.match(/function deleteVideo\([^)]*\)[\s\S]*?^}/m);
    const removeConfigVideo = loaderJs.match(/function removeConfigVideo\([^)]*\)[\s\S]*?^}/m);
    const deleteConfigVideo = loaderJs.match(/function deleteConfigVideo\([^)]*\)[\s\S]*?^}/m);
    expect(deleteVideo).toBeTruthy();
    expect(removeConfigVideo).toBeTruthy();
    expect(deleteConfigVideo).toBeTruthy();
    expect({ deleteUsesConfirm: /\bconfirm\(/.test(deleteVideo![0]) })
      .toEqual({ deleteUsesConfirm: false });
    expect({ removeUsesConfirm: /\bconfirm\(/.test(removeConfigVideo![0]) })
      .toEqual({ removeUsesConfirm: false });
    expect({ deleteConfigUsesConfirm: /\bconfirm\(/.test(deleteConfigVideo![0]) })
      .toEqual({ deleteConfigUsesConfirm: false });
  });

  it('loader.js must have openVideoDeleteModal with Escape key handler', () => {
    expect({ hasOpenFn: /function openVideoDeleteModal/.test(loaderJs) })
      .toEqual({ hasOpenFn: true });
    expect({ hasCloseFn: /function closeVideoDeleteModal/.test(loaderJs) })
      .toEqual({ hasCloseFn: true });
    expect({ hasEscapeKey: /Escape.*closeVideoDeleteModal|closeVideoDeleteModal.*Escape/.test(loaderJs) })
      .toEqual({ hasEscapeKey: true });
  });
});

describe('Admin UX batch 2 — responsive buttons guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const responsiveCss = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'styles', 'responsive.css'),
    'utf8'
  );

  it('responsive.css must have flex-wrap on video-row-actions at 768px', () => {
    // Extract 768px media block
    const block768 = responsiveCss.match(/@media[^{]*768px[^{]*\{[\s\S]*?\n\}/);
    expect(block768).toBeTruthy();
    expect({ hasFlexWrap: /flex-wrap:\s*wrap/.test(block768![0]) })
      .toEqual({ hasFlexWrap: true });
  });

  it('responsive.css must have grid layout for video-row-actions at 480px', () => {
    const block480 = responsiveCss.match(/@media[^{]*480px[^{]*\{[\s\S]*?\n\}/);
    expect(block480).toBeTruthy();
    const block = block480![0];
    expect({ hasGrid: /display:\s*grid/.test(block) })
      .toEqual({ hasGrid: true });
    expect({ has2Col: /grid-template-columns:\s*1fr 1fr/.test(block) })
      .toEqual({ has2Col: true });
  });
});

describe('Admin UX batch 2 — accessibility guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const loaderJs = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'modules', 'videos', 'loader.js'),
    'utf8'
  );
  const videosCss = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'styles', 'videos.css'),
    'utf8'
  );

  it('loader.js must set tabindex and role on video rows', () => {
    expect({ hasTabindex: /tabIndex\s*=\s*0/.test(loaderJs) })
      .toEqual({ hasTabindex: true });
    expect({ hasRole: /setAttribute\(\s*['"]role['"],\s*['"]group['"]\)/.test(loaderJs) })
      .toEqual({ hasRole: true });
  });

  it('loader.js must set aria-label on video rows', () => {
    expect({ hasAriaLabel: /setAttribute\(\s*['"]aria-label['"]/.test(loaderJs) })
      .toEqual({ hasAriaLabel: true });
  });

  it('videos.css must have focus-visible outline on video rows', () => {
    expect({ hasFocusVisible: /\.video-row:focus-visible/.test(videosCss) })
      .toEqual({ hasFocusVisible: true });
    expect({ hasOutline: /outline:\s*2px\s+solid/.test(videosCss) })
      .toEqual({ hasOutline: true });
  });
});

describe('Admin UX batch 2 — button labels guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const loaderJs = fs.readFileSync(
    path.join(repoRoot, 'raspberry', 'admin', 'public', 'modules', 'videos', 'loader.js'),
    'utf8'
  );

  it('createConfigVideoList must have distinct "Retirer" and "Supprimer le fichier" buttons', () => {
    // "Retirer de la configuration" = remove from config (file stays on disk)
    // "Supprimer le fichier" = delete file from disk
    // Both must exist as separate buttons — never a single "Supprimer"
    expect({ hasRetirer: /Retirer de la configuration/.test(loaderJs) })
      .toEqual({ hasRetirer: true });
    expect({ hasSupprimerFichier: /Supprimer le fichier/.test(loaderJs) })
      .toEqual({ hasSupprimerFichier: true });
  });

  it('config video buttons must use btn-warning for remove and btn-danger for delete', () => {
    // Semantic colors: warning (yellow) for soft action, danger (red) for destructive
    expect({ removeIsWarning: /btn-warning[^"]*remove-video-btn/.test(loaderJs) })
      .toEqual({ removeIsWarning: true });
    expect({ deleteIsDanger: /btn-danger[^"]*delete-video-btn/.test(loaderJs) })
      .toEqual({ deleteIsDanger: true });
  });
});

describe('Manual video transition flash prevention guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  let manualVideoContent: string;
  let videoPlaybackContent: string;
  let doubleBufferContent: string;

  beforeAll(() => {
    manualVideoContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/services/manual-video.service.ts'),
      'utf8'
    );
    videoPlaybackContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/services/video-playback.service.ts'),
      'utf8'
    );
    doubleBufferContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/src/app/services/double-buffer-video.service.ts'),
      'utf8'
    );
  });

  it('manual-video.service must use getInactiveManualPlayer for double-buffering', () => {
    // Manual→manual transitions must load the new video on the inactive manual player
    // to avoid a black flash when reusing the same player.
    expect({ hasInactiveManualPlayer: manualVideoContent.includes('getInactiveManualPlayer') })
      .toEqual({ hasInactiveManualPlayer: true });
  });

  it('manual-video.service must call swapActiveManualPlayer after transition', () => {
    // After a manual→manual transition, the active/inactive manual players must be swapped
    // so the next transition uses the correct player.
    expect({ hasSwap: manualVideoContent.includes('swapActiveManualPlayer') })
      .toEqual({ hasSwap: true });
  });

  it('manual-video.service must have debounce logic with _lastPlayTimestamp', () => {
    // 500ms debounce in play() prevents the software decoder from being spammed
    // with rapid successive commands, which causes black frames on Pi 5.
    expect({ hasDebounce: manualVideoContent.includes('_lastPlayTimestamp') })
      .toEqual({ hasDebounce: true });
  });

  it('video-playback.service must call captureAndShowFreezeFrame in triggerSwitch', () => {
    // The early switch path in triggerSwitch() had no freeze-frame coverage,
    // causing a black flash during loop transitions. captureAndShowFreezeFrame must be present.
    const triggerSwitchStart = videoPlaybackContent.indexOf('triggerSwitch');
    const triggerSwitchBlock = videoPlaybackContent.slice(triggerSwitchStart, triggerSwitchStart + 2000);
    expect({ hasFreezeInTriggerSwitch: triggerSwitchBlock.includes('captureAndShowFreezeFrame') })
      .toEqual({ hasFreezeInTriggerSwitch: true });
  });

  it('double-buffer-video.service must expose swapActiveManualPlayer method', () => {
    // The double-buffer service must provide swapActiveManualPlayer for manual→manual
    // double-buffering to work correctly.
    expect({ hasSwapMethod: doubleBufferContent.includes('swapActiveManualPlayer') })
      .toEqual({ hasSwapMethod: true });
  });

  it('captureAndShowFreezeFrame must skip pre-captured frame when isManualMode is true', () => {
    // When transitioning manual→manual, the pre-captured last frame comes from the loop player,
    // not the manual player. Using it would show a wrong frame. The guard must check
    // hasValidLastFrame && !isManualMode before using the pre-captured frame.
    expect({ skipsPreCapturedInManualMode: doubleBufferContent.includes('hasValidLastFrame && !isManualMode') })
      .toEqual({ skipsPreCapturedInManualMode: true });
  });
});
