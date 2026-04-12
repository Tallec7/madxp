/**
 * Smoke tests — network-wifi domain
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
  process.env.PORT = '3104';
  const server = await import('../../server');
  app = server.app;
  httpServer = server.httpServer;
});

afterAll((done) => {
  httpServer.close(done);
});

describe('WiFi boot race condition regression guards (v3.84.3)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  let watchdogContent: string;
  let safeOpsContent: string;
  let agentContent: string;

  beforeAll(() => {
    watchdogContent = [
      'raspberry/sync-agent/src/services/network-watchdog.js',
      'raspberry/sync-agent/src/services/hotspot-watchdog.js',
      'raspberry/sync-agent/src/services/internet-watchdog.js',
      'raspberry/sync-agent/src/services/config-rollback.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    safeOpsContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/safe-network-operations.js'),
      'utf8'
    );
    agentContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
  });

  // Guard 1: Boot grace period — watchdog must not trigger false recovery before WiFi stabilizes
  it('network-watchdog start() must enable boot grace period for internet checks', () => {
    // The start() function must call enableGracePeriod before the first internetWatchLoop
    const startFn = watchdogContent.match(
      /function start\(\)\s*\{[\s\S]*?setTimeout\(\(\) =>.*internetWatchLoop/
    );
    expect(startFn).not.toBeNull();
    expect({
      hasBootGrace: /enableGracePeriod\(\s*'internet'\s*,\s*\d+\s*\)/.test(startFn![0]),
    }).toEqual({
      hasBootGrace: true,
    });
  });

  // Guard 1b: Boot grace period for HOTSPOT — prevents 3 hostapd restarts during boot
  it('network-watchdog start() must enable boot grace period for hotspot checks', () => {
    // Without hotspot grace period, the watchdog detects "IP 192.168.4.1 non configurée"
    // at boot+5s and restarts hostapd 2-3 times, delaying hotspot stabilization by 30s+.
    const startFn = watchdogContent.match(
      /function start\(\)\s*\{[\s\S]*?setTimeout\(\(\) =>.*hotspotWatchLoop/
    );
    expect(startFn).not.toBeNull();
    expect({
      hasHotspotBootGrace: /enableGracePeriod\(\s*'hotspot'\s*,\s*\d+\s*\)/.test(startFn![0]),
    }).toEqual({
      hasHotspotBootGrace: true,
    });
  });

  it('network-watchdog boot grace period must be >= 30s', () => {
    // Match the enableGracePeriod call in start() that precedes the setTimeout internetWatchLoop
    const startFn = watchdogContent.match(
      /function start\(\)\s*\{[\s\S]*?setTimeout\(\(\) =>.*internetWatchLoop/
    );
    expect(startFn).not.toBeNull();
    const graceMatch = startFn![0].match(
      /enableGracePeriod\(\s*'internet'\s*,\s*(\d+)\s*\)/
    );
    expect(graceMatch).not.toBeNull();
    expect({
      graceMs: Number(graceMatch![1]) >= 30000,
    }).toEqual({
      graceMs: true,
    });
  });

  // Guard 2: Circular dependency — safe-network-operations must NOT require network-watchdog at module scope
  it('safe-network-operations must NOT require network-watchdog at module scope (circular dependency)', () => {
    // Extract top-level requires (before any class/function definition)
    const topLevel = safeOpsContent.split(/^class /m)[0];
    expect({
      hasModuleScopeRequire: /^const\s+\w+\s*=\s*require\(['"]\.\/network-watchdog['"]\)/m.test(topLevel),
    }).toEqual({
      hasModuleScopeRequire: false,
    });
  });

  it('safe-network-operations autoOptimize must use lazy require for network-watchdog', () => {
    const autoOptFn = safeOpsContent.match(
      /async autoOptimize\(\)\s*\{[\s\S]*?return \{ success: true/
    );
    expect(autoOptFn).not.toBeNull();
    expect({
      hasLazyRequire: /require\(['"]\.\/network-watchdog['"]\)/.test(autoOptFn![0]),
    }).toEqual({
      hasLazyRequire: true,
    });
  });

  // Guard 3: autoOptimize delay — must wait long enough for WiFi to stabilize before scanning
  it('agent.js autoOptimize timeout must be >= 60s (not 30s)', () => {
    // Find the setTimeout block that contains autoOptimize and extract the delay value
    const optimizeBlock = agentContent.match(
      /autoOptimize\(\)[\s\S]{0,800}}\s*,\s*(\d+)\s*\)/
    );
    expect(optimizeBlock).not.toBeNull();
    expect({
      delayMs: Number(optimizeBlock![1]) >= 60000,
    }).toEqual({
      delayMs: true,
    });
  });
});

describe('Bgscan reconfigure deauth prevention', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  let safeOps: string;

  beforeAll(() => {
    safeOps = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/safe-network-operations.js'),
      'utf8'
    );
  });

  // Guard: configureBgscan must skip reconfigure if config already matches
  it('configureBgscan must check current config before calling wpa_cli reconfigure', () => {
    // Must grep current bgscan value and compare before writing
    expect({ checksCurrentConfig: safeOps.includes('already configured, skipping reconfigure') })
      .toEqual({ checksCurrentConfig: true });
  });

  // Guard: _computeOptimalBgscan must use hysteresis to prevent threshold oscillation
  it('_computeOptimalBgscan must use hysteresis band (not sharp threshold)', () => {
    // Must have hysteresis band where current config is preserved
    expect({ hasHysteresisBand: safeOps.includes('hysteresis band') })
      .toEqual({ hasHysteresisBand: true });
    // Must NOT use -72 as sharp boundary (oscillation zone for NLF signal)
    const computeFn = safeOps.match(/_computeOptimalBgscan[\s\S]*?return 'simple:30:-70:300';\s*\}/);
    expect(computeFn).not.toBeNull();
    // The decision boundaries must have >5 dBm gap (hysteresis)
    const upperBound = computeFn![0].match(/signal > (-\d+)/);
    const lowerBound = computeFn![0].match(/signal <= (-\d+)/);
    if (upperBound && lowerBound) {
      const gap = Number(upperBound[1]) - Number(lowerBound[1]);
      expect({ hysteresisGap: Math.abs(gap) >= 5 }).toEqual({ hysteresisGap: true });
    }
  });
});

describe('Network profile detection deduplication', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('startNetworkProfileDetection must have a guard against duplicate starts', () => {
    const agentContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
    // Must check _networkProfileStarted before creating intervals
    expect({ hasGuard: agentContent.includes('_networkProfileStarted') })
      .toEqual({ hasGuard: true });
  });
});

describe('Hotspot IP Debian 13 compatibility', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('fix-fleet-pi.sh must create systemd-networkd config for wlan0 hotspot IP', () => {
    const fixFleet = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/fix-fleet-pi.sh'),
      'utf8'
    );
    expect({ hasNetworkdConfig: fixFleet.includes('10-wlan0-hotspot.network') })
      .toEqual({ hasNetworkdConfig: true });
    expect({ configuresIp: fixFleet.includes('192.168.4.1/24') })
      .toEqual({ configuresIp: true });
  });
});

describe('Hotspot optimizer wlan1 scan regression guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  let hotspotScript: string;

  beforeAll(() => {
    hotspotScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/scripts/hotspot-optimizer.sh'),
      'utf8'
    );
  });

  // Guard 1: count_networks_on_channel must NOT call iwlist scan
  it('count_networks_on_channel must NOT call iwlist scan (must use cached results)', () => {
    const funcMatch = hotspotScript.match(
      /count_networks_on_channel\(\)\s*\{([\s\S]*?)\n\}/
    );
    expect(funcMatch).not.toBeNull();
    const funcBody = funcMatch![1];
    expect({
      usesIwlistScan: /iwlist\b.*\bscan\b/.test(funcBody),
      reason: 'Each iwlist scan disconnects RTL8192EU from WiFi for ~6s — use CACHED_SCAN',
    }).toEqual({
      usesIwlistScan: false,
      reason: 'Each iwlist scan disconnects RTL8192EU from WiFi for ~6s — use CACHED_SCAN',
    });
  });

  // Guard 2: script must use a cached scan variable
  it('must define and use CACHED_SCAN variable for single-scan pattern', () => {
    expect({
      definesCachedScan: /^CACHED_SCAN=/m.test(hotspotScript),
      performSingleScan: /perform_single_scan/.test(hotspotScript),
      countUsesCachedScan: /\$CACHED_SCAN/.test(hotspotScript),
    }).toEqual({
      definesCachedScan: true,
      performSingleScan: true,
      countUsesCachedScan: true,
    });
  });

  // Guard 3: must wait for wlan1 IP before scanning
  it('must wait for wlan1 readiness before scanning (wait_for_wlan1_ready)', () => {
    expect({
      hasWaitFunction: /wait_for_wlan1_ready\(\)/.test(hotspotScript),
      callsWaitBeforeScan: hotspotScript.indexOf('wait_for_wlan1_ready') <
        hotspotScript.indexOf('perform_single_scan'),
    }).toEqual({
      hasWaitFunction: true,
      callsWaitBeforeScan: true,
    });
  });

  // Guard 4: deploy copy must be in sync
  it('deploy copy must match source (raspberry/deploy/scripts/hotspot-optimizer.sh)', () => {
    const deployScript = fs.readFileSync(
      path.join(repoRoot, 'raspberry/deploy/scripts/hotspot-optimizer.sh'),
      'utf8'
    );
    expect(deployScript).toEqual(hotspotScript);
  });

  // Guard 5: hotspot-optimizer must write inter-process scan cache
  // networkDetector (Node.js) reuses this cache to avoid a SECOND iwlist wlan1 scan.
  it('must write scan cache to /tmp/neopro-wlan1-scan-cache for inter-process coordination', () => {
    expect({
      writesScanCache: /neopro-wlan1-scan-cache/.test(hotspotScript),
      writesScanTs: /neopro-wlan1-scan-ts/.test(hotspotScript),
      reason: 'networkDetector must reuse cached scan — 2 iwlist scans within 120s kills RTL8192EU carrier',
    }).toEqual({
      writesScanCache: true,
      writesScanTs: true,
      reason: 'networkDetector must reuse cached scan — 2 iwlist scans within 120s kills RTL8192EU carrier',
    });
  });

  // Guard 6: apply_txpower must use $AP_INTERFACE (not $WIFI_INTERFACE which is undefined)
  it('apply_txpower must use $AP_INTERFACE not $WIFI_INTERFACE (undefined variable bug)', () => {
    const applyFn = hotspotScript.match(
      /apply_txpower\(\)\s*\{([\s\S]*?)\n\}/
    );
    expect(applyFn).not.toBeNull();
    const funcBody = applyFn![1];
    expect({
      usesAPInterface: /\$AP_INTERFACE/.test(funcBody),
      usesWIFIInterface: /\$WIFI_INTERFACE/.test(funcBody),
      reason: '$WIFI_INTERFACE is never defined — TX power was silently never applied',
    }).toEqual({
      usesAPInterface: true,
      usesWIFIInterface: false,
      reason: '$WIFI_INTERFACE is never defined — TX power was silently never applied',
    });
  });
});

describe('Inter-process wlan1 scan coordination guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  let networkDetectorSrc: string;

  beforeAll(() => {
    networkDetectorSrc = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/network-detector.js'),
      'utf8'
    );
  });

  // Guard 1: networkDetector must check scan cache before scanning
  it('scanWifiNetworks must read inter-process scan cache before iwlist scan', () => {
    expect({
      readsScanCache: /neopro-wlan1-scan-cache/.test(networkDetectorSrc),
      readsScanTs: /neopro-wlan1-scan-ts/.test(networkDetectorSrc),
      hasCacheMaxAge: /SCAN_CACHE_MAX_AGE_S/.test(networkDetectorSrc),
    }).toEqual({
      readsScanCache: true,
      readsScanTs: true,
      hasCacheMaxAge: true,
    });
  });

  // Guard 2: cache check must happen BEFORE the live scan
  it('cache check must precede live iwlist wlan1 scan', () => {
    const cacheCheckPos = networkDetectorSrc.indexOf('_readScanCache');
    const liveScanPos = networkDetectorSrc.indexOf('_performLiveScan');
    expect({
      cacheCheckExists: cacheCheckPos > -1,
      liveScanExists: liveScanPos > -1,
      cacheBeforeScan: cacheCheckPos < liveScanPos,
    }).toEqual({
      cacheCheckExists: true,
      liveScanExists: true,
      cacheBeforeScan: true,
    });
  });

  // Guard 3: live scan must write cache for next consumer
  it('live scan must write cache after scanning for future consumers', () => {
    // _performLiveScan method must call _writeScanCache
    const funcMatch = networkDetectorSrc.match(
      /_performLiveScan\(\)\s*\{([\s\S]*?)\n  \}/
    );
    expect(funcMatch).not.toBeNull();
    expect(funcMatch![1]).toMatch(/_writeScanCache/);
  });

  // Guard 4: scan cache hit/miss must be tracked and exposed in heartbeat
  it('must track scan cache hits/misses and expose in getSimplifiedProfile', () => {
    const profileSection = networkDetectorSrc.slice(
      networkDetectorSrc.indexOf('getSimplifiedProfile')
    );
    expect({
      hasHitCounter: /scanCacheHits/.test(networkDetectorSrc),
      hasMissCounter: /scanCacheMisses/.test(networkDetectorSrc),
      hitsInProfile: /scanCacheHits/.test(profileSection),
      missesInProfile: /scanCacheMisses/.test(profileSection),
    }).toEqual({
      hasHitCounter: true,
      hasMissCounter: true,
      hitsInProfile: true,
      missesInProfile: true,
    });
  });
});

describe('wifi-bssid.js must use scan cache for mesh detection', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('getWifiBssidStatus must check scan cache before iwlist wlan1 scan', () => {
    const wifiBssid = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/wifi-bssid.js'),
      'utf8'
    );
    expect({
      readsScanCache: /neopro-wlan1-scan-cache/.test(wifiBssid),
      readsScanTs: /neopro-wlan1-scan-ts/.test(wifiBssid),
      hasCacheMaxAge: /SCAN_CACHE_MAX_AGE_S/.test(wifiBssid),
    }).toEqual({
      readsScanCache: true,
      readsScanTs: true,
      hasCacheMaxAge: true,
    });
  });
});

describe('Bash grep -c || echo antipattern guard', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const shellScriptsDir = path.join(repoRoot, 'raspberry/scripts');

  it('no shell script must use `grep -c ... || echo` (produces multiline value)', () => {
    const scripts = fs.readdirSync(shellScriptsDir)
      .filter(f => f.endsWith('.sh'))
      .map(f => ({
        name: f,
        content: fs.readFileSync(path.join(shellScriptsDir, f), 'utf8'),
      }));

    const violations = scripts.flatMap(({ name, content }) => {
      const lines = content.split('\n');
      return lines
        .map((line, i) => ({ line: line.trim(), num: i + 1, file: name }))
        .filter(({ line }) =>
          /grep\s+-c\b.*\|\|\s*echo/.test(line) && !line.startsWith('#')
        );
    });

    expect({
      violations: violations.map(v => `${v.file}:${v.num}: ${v.line}`),
      reason: 'grep -c exits 1 when count is 0; || echo "0" adds a second "0" → "0\\n0" → bash arithmetic error',
      fix: 'Use $(grep -c ... || true) + ${var:-0}',
    }).toEqual({
      violations: [],
      reason: 'grep -c exits 1 when count is 0; || echo "0" adds a second "0" → "0\\n0" → bash arithmetic error',
      fix: 'Use $(grep -c ... || true) + ${var:-0}',
    });
  });
});

describe('WiFi recovery progressive back-off & mesh guards (v3.99.4)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  let watchdogContent: string;
  let safeOpsContent: string;

  beforeAll(() => {
    watchdogContent = [
      'raspberry/sync-agent/src/services/network-watchdog.js',
      'raspberry/sync-agent/src/services/hotspot-watchdog.js',
      'raspberry/sync-agent/src/services/internet-watchdog.js',
      'raspberry/sync-agent/src/services/config-rollback.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    safeOpsContent = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/safe-network-operations.js'),
      'utf8'
    );
  });

  // Guard 1: Progressive back-off must exist — fixed FAST_RETRY_DELAY must NOT exist
  it('network-watchdog must use PHASE_BACKOFF_DELAYS, not fixed FAST_RETRY_DELAY', () => {
    expect({
      hasBackoffArray: /PHASE_BACKOFF_DELAYS\s*=\s*\[/.test(watchdogContent),
    }).toEqual({ hasBackoffArray: true });
    // FAST_RETRY_DELAY as a constant definition must be gone
    expect({
      hasFixedRetry: /const\s+FAST_RETRY_DELAY\s*=/.test(watchdogContent),
    }).toEqual({ hasFixedRetry: false });
  });

  // Guard 2: Back-off array must have 6 entries (one per recovery phase)
  it('PHASE_BACKOFF_DELAYS must have at least 6 entries covering all recovery phases', () => {
    const arrayMatch = watchdogContent.match(
      /PHASE_BACKOFF_DELAYS\s*=\s*\[([\s\S]*?)\]/
    );
    expect(arrayMatch).not.toBeNull();
    const entries = arrayMatch![1].split(',').filter((e: string) => e.trim().length > 0);
    expect({ entryCount: entries.length >= 6 }).toEqual({ entryCount: true });
  });

  // Guard 3: Back-off must be progressive (each delay >= previous)
  it('PHASE_BACKOFF_DELAYS must be non-decreasing (progressive)', () => {
    const arrayMatch = watchdogContent.match(
      /PHASE_BACKOFF_DELAYS\s*=\s*\[([\s\S]*?)\]/
    );
    expect(arrayMatch).not.toBeNull();
    // Extract numeric values (in ms)
    const delays = arrayMatch![1].match(/(\d+)\s*\*\s*1000/g)?.map((m: string) => {
      const num = m.match(/(\d+)/);
      return num ? Number(num[1]) * 1000 : 0;
    }) || [];
    let isProgressive = true;
    for (let i = 1; i < delays.length; i++) {
      if (delays[i] < delays[i - 1]) {
        isProgressive = false;
        break;
      }
    }
    expect({ isProgressive }).toEqual({ isProgressive: true });
  });

  // Guard 4: internetWatchLoop must use _getBackoffDelay, not fixed delay
  it('internetWatchLoop must use _getBackoffDelay for progressive retry timing', () => {
    // Match the full internetWatchLoop function body (greedy enough to include the backoff setTimeout)
    const loopFn = watchdogContent.match(
      /async function internetWatchLoop\([\s\S]*?getBackoffDelay[\s\S]*?internetWatchLoop/
    );
    expect(loopFn).not.toBeNull();
    expect({
      usesBackoff: /getBackoffDelay\(/.test(loopFn![0]),
    }).toEqual({ usesBackoff: true });
  });

  // Guard 5: Mesh-aware modprobe guard must exist and be >= 10 min
  it('network-watchdog must have mesh-specific modprobe guard >= 10 min', () => {
    const meshGuardMatch = watchdogContent.match(
      /MIN_OUTAGE_FOR_MODPROBE_MESH\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/
    );
    expect(meshGuardMatch).not.toBeNull();
    const meshGuardMs = Number(meshGuardMatch![1]) * Number(meshGuardMatch![2]) * Number(meshGuardMatch![3]);
    expect({
      meshGuardAtLeast10min: meshGuardMs >= 10 * 60 * 1000,
    }).toEqual({ meshGuardAtLeast10min: true });
  });

  // Guard 6: Phase 4 (modprobe) must call _getModprobeGuard(), not use hardcoded value
  it('Phase 4 modprobe must use _getModprobeGuard() for mesh-aware threshold', () => {
    // The attemptInternetRecovery function must call getModprobeGuard
    const recoveryFn = watchdogContent.match(
      /async function attemptInternetRecovery\([\s\S]*?Phase 5/
    );
    expect(recoveryFn).not.toBeNull();
    expect({
      usesGuardFn: /getModprobeGuard\(\)/.test(recoveryFn![0]),
    }).toEqual({ usesGuardFn: true });
  });

  // Guard 7: Phase 5 (USB) must call _getUsbCycleGuard(), not use hardcoded value
  it('Phase 5 USB power-cycle must use _getUsbCycleGuard() for mesh-aware threshold', () => {
    const recoveryFn = watchdogContent.match(
      /async function attemptInternetRecovery\([\s\S]*$/
    );
    expect(recoveryFn).not.toBeNull();
    expect({
      usesGuardFn: /getUsbCycleGuard\(\)/.test(recoveryFn![0]),
    }).toEqual({ usesGuardFn: true });
  });

  // Guard 8: _isMeshEnvironment helper must exist for mesh detection
  it('network-watchdog must have _isMeshEnvironment() using networkDetector profile', () => {
    expect({
      hasMeshDetection: /function _isMeshEnvironment\(\)/.test(watchdogContent),
    }).toEqual({ hasMeshDetection: true });
    expect({
      checksProfileType: /profile\?\.type\s*===\s*'mesh'/.test(watchdogContent),
    }).toEqual({ checksProfileType: true });
  });

  // Guard 9: Dynamic bgscan — safe-network-operations must compute optimal threshold
  it('safe-network-operations must have _computeOptimalBgscan() with signal-based threshold', () => {
    expect({
      hasCompute: /_computeOptimalBgscan\(\)/.test(safeOpsContent),
    }).toEqual({ hasCompute: true });
    // Must check signal level (not just use a fixed threshold)
    const computeFn = safeOpsContent.match(
      /_computeOptimalBgscan\(\)\s*\{[\s\S]*?return\s+'simple:/
    );
    expect(computeFn).not.toBeNull();
    // Must check signal level with hysteresis (not a sharp -72 boundary)
    expect({
      checksSignal: /signal\s*>\s*-6[5-9]/.test(computeFn![0]),
    }).toEqual({ checksSignal: true });
  });

  // Guard 10: autoOptimize must use _computeOptimalBgscan, not hardcoded bgscan
  it('autoOptimize must use _computeOptimalBgscan() for adaptive bgscan threshold', () => {
    const autoOptFn = safeOpsContent.match(
      /async autoOptimize\(\)\s*\{[\s\S]*?return \{ success: true/
    );
    expect(autoOptFn).not.toBeNull();
    expect({
      usesComputed: /_computeOptimalBgscan\(\)/.test(autoOptFn![0]),
    }).toEqual({ usesComputed: true });
  });

  // Guard 11: Monitoring — getStatus must expose recovery back-off info
  it('network-watchdog getStatus() must expose recoveryAttempts for monitoring', () => {
    const statusFn = watchdogContent.match(
      /function getStatus\(\)\s*\{[\s\S]*?^}/m
    );
    expect(statusFn).not.toBeNull();
    expect({
      hasRecoveryAttempts: /recoveryAttempts/.test(statusFn![0]),
    }).toEqual({ hasRecoveryAttempts: true });
  });

  // Guard 12: Background wlan1 reconnect when Ethernet is active
  // When Pi falls back to Ethernet, wlan1 stays disassociated indefinitely.
  // Without background reconnect, unplugging Ethernet = total loss of connectivity.
  it('network-watchdog must have background wlan1 reconnect when on Ethernet', () => {
    expect({
      hasWlan1Reconnect: /wlan1ReconnectLoop/.test(watchdogContent),
      hasStartWlan1Reconnect: /startWlan1Reconnect/.test(watchdogContent),
      hasStopWlan1Reconnect: /stopWlan1Reconnect/.test(watchdogContent),
      triggeredOnEthernet: /connectionType.*===.*'ethernet'[\s\S]*?startWlan1Reconnect/.test(watchdogContent),
    }).toEqual({
      hasWlan1Reconnect: true,
      hasStartWlan1Reconnect: true,
      hasStopWlan1Reconnect: true,
      triggeredOnEthernet: true,
    });
  });

  // Guard 13: wlan1 reconnect must NOT use iwlist scan (kills RTL8192EU carrier)
  it('wlan1ReconnectLoop must not use iwlist scan', () => {
    const reconnectFn = watchdogContent.match(
      /async function wlan1ReconnectLoop\(\)\s*\{[\s\S]*?^\}/m
    ) || watchdogContent.match(
      /async function wlan1ReconnectLoop\(\)\s*\{[\s\S]*?stopWlan1Reconnect/
    );
    expect(reconnectFn).not.toBeNull();
    expect({
      usesIwlistScan: /iwlist.*scan/.test(reconnectFn![0]),
    }).toEqual({ usesIwlistScan: false });
  });
});

describe('Admin :8080 WiFi connectWifi() regression guards', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const networkServicePath = path.join(repoRoot, 'raspberry/admin/services/network.service.js');
  const networkService = fs.readFileSync(networkServicePath, 'utf8');

  it('must hash WiFi password via wpa_passphrase — never store plaintext PSK', () => {
    expect({
      usesWpaPassphrase: networkService.includes('wpa_passphrase'),
      noPlaintextPsk: !networkService.includes('psk="${password}"'),
      reason: 'connectWifi must hash password via wpa_passphrase, never store plaintext in wpa_supplicant.conf',
    }).toEqual({
      usesWpaPassphrase: true,
      noPlaintextPsk: true,
      reason: 'connectWifi must hash password via wpa_passphrase, never store plaintext in wpa_supplicant.conf',
    });
  });

  it('must restart wpa_supplicant@wlan1 service — wpa_cli reconfigure alone is unreliable', () => {
    expect({
      restartsService: networkService.includes('systemctl restart wpa_supplicant@wlan1'),
      enablesService: networkService.includes('systemctl enable wpa_supplicant@wlan1'),
      reason: 'wpa_cli reconfigure alone does not reliably bring up wlan1 — must restart systemd service',
    }).toEqual({
      restartsService: true,
      enablesService: true,
      reason: 'wpa_cli reconfigure alone does not reliably bring up wlan1 — must restart systemd service',
    });
  });

  it('must trigger DHCP after WiFi connection — without it, no IP address is obtained', () => {
    expect({
      triggersDhcp: networkService.includes('dhcpcd wlan1'),
      reason: 'without dhcpcd trigger, wlan1 connects to WiFi but never gets an IP address',
    }).toEqual({
      triggersDhcp: true,
      reason: 'without dhcpcd trigger, wlan1 connects to WiFi but never gets an IP address',
    });
  });

  it('must unblock WiFi radio before connecting — dongle may be rfkill-blocked', () => {
    expect({
      unblocksWifi: networkService.includes('rfkill unblock wifi'),
      reason: 'USB WiFi dongle may be rfkill-blocked — must unblock before any WiFi operation',
    }).toEqual({
      unblocksWifi: true,
      reason: 'USB WiFi dongle may be rfkill-blocked — must unblock before any WiFi operation',
    });
  });

  it('must poll connection multiple times — RTL8192EU needs 10-30s for WPA+DHCP', () => {
    // Ensure there's a retry loop (for loop with sleep) not a single check
    const hasRetryLoop = /for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*5/.test(networkService);
    expect({
      hasRetryLoop,
      reason: 'single 3s wait is too short for RTL8192EU — must poll 5×2s minimum',
    }).toEqual({
      hasRetryLoop: true,
      reason: 'single 3s wait is too short for RTL8192EU — must poll 5×2s minimum',
    });
  });

  it('must NOT expose deprecated /api/wifi/client route', () => {
    const routesPath = path.join(repoRoot, 'raspberry/admin/routes/network.js');
    const routes = fs.readFileSync(routesPath, 'utf8');
    expect({
      noClientRoute: !routes.includes('/api/wifi/client'),
      reason: '/api/wifi/client delegated to interactive script — use /api/wifi/connect instead',
    }).toEqual({
      noClientRoute: true,
      reason: '/api/wifi/client delegated to interactive script — use /api/wifi/connect instead',
    });
  });

  it('must create wlan1-specific symlink for wpa_supplicant config', () => {
    expect({
      createsSymlink: networkService.includes('wpa_supplicant-wlan1.conf'),
      reason: 'wpa_supplicant@wlan1.service reads wpa_supplicant-wlan1.conf — symlink is required',
    }).toEqual({
      createsSymlink: true,
      reason: 'wpa_supplicant@wlan1.service reads wpa_supplicant-wlan1.conf — symlink is required',
    });
  });
});

describe('Pi Socket.IO resilience guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const serverPath = path.join(repoRoot, 'raspberry/server/server.js');
  const socketServicePath = path.join(repoRoot, 'raspberry/src/app/services/socket.service.ts');
  const doubleBufferPath = path.join(repoRoot, 'raspberry/src/app/services/double-buffer-video.service.ts');
  const tvComponentPath = path.join(repoRoot, 'raspberry/src/app/components/tv/tv.component.ts');

  let serverContent: string;
  let socketServiceContent: string;
  let doubleBufferContent: string;
  let tvComponentContent: string;

  beforeAll(() => {
    serverContent = fs.readFileSync(serverPath, 'utf8');
    socketServiceContent = fs.readFileSync(socketServicePath, 'utf8');
    doubleBufferContent = fs.readFileSync(doubleBufferPath, 'utf8');
    tvComponentContent = fs.readFileSync(tvComponentPath, 'utf8') +
      fs.readFileSync(path.join(repoRoot, 'raspberry/src/app/services/tv-sync.service.ts'), 'utf8');
  });

  it('server.js must configure pingInterval and pingTimeout for Socket.IO', () => {
    // Without explicit ping config, zombie sockets go undetected for 45s (default 25s+20s)
    // causing slaves to never receive tv-loop-state → video freezes
    expect({
      hasPingInterval: /pingInterval\s*:\s*\d+/.test(serverContent),
      hasPingTimeout: /pingTimeout\s*:\s*\d+/.test(serverContent),
      reason: 'zombie socket detection requires explicit ping config — default 45s is too slow for local TV sync',
    }).toEqual({
      hasPingInterval: true,
      hasPingTimeout: true,
      reason: 'zombie socket detection requires explicit ping config — default 45s is too slow for local TV sync',
    });
  });

  it('server.js must configure transports for Socket.IO', () => {
    // Without explicit transports, Socket.IO may start with long-polling
    // adding 200-500ms latency per message on local network
    expect({
      hasTransports: /transports\s*:\s*\[/.test(serverContent),
      reason: 'explicit transports config prevents slow HTTP long-polling fallback on local network',
    }).toEqual({
      hasTransports: true,
      reason: 'explicit transports config prevents slow HTTP long-polling fallback on local network',
    });
  });

  it('socket.service.ts must configure reconnection options', () => {
    // Without reconnection config, a dropped socket leaves the TV frozen
    // with no automatic recovery — user must refresh the page
    expect({
      hasReconnection: /reconnection\s*:\s*true/.test(socketServiceContent),
      hasReconnectionDelay: /reconnectionDelay\s*:\s*\d+/.test(socketServiceContent),
      hasReconnectionAttempts: /reconnectionAttempts\s*:/.test(socketServiceContent),
      reason: 'dropped sockets must auto-reconnect — without this, TV freezes until page refresh',
    }).toEqual({
      hasReconnection: true,
      hasReconnectionDelay: true,
      hasReconnectionAttempts: true,
      reason: 'dropped sockets must auto-reconnect — without this, TV freezes until page refresh',
    });
  });

  it('socket.service.ts must have disconnect and reconnect lifecycle handlers', () => {
    // Without lifecycle handlers, the app has no way to detect connection loss
    // or re-register after reconnection
    expect({
      hasDisconnectHandler: socketServiceContent.includes("'disconnect'"),
      hasReconnectHandler: socketServiceContent.includes("'reconnect'"),
      hasConnectErrorHandler: socketServiceContent.includes("'connect_error'"),
      reason: 'lifecycle handlers detect connection loss and trigger re-registration',
    }).toEqual({
      hasDisconnectHandler: true,
      hasReconnectHandler: true,
      hasConnectErrorHandler: true,
      reason: 'lifecycle handlers detect connection loss and trigger re-registration',
    });
  });

  it('socket.service.ts must expose onReconnect callback mechanism', () => {
    // Components (tv.component) must re-emit tv-register after reconnection
    // to restore master/slave roles — without this, the TV stays frozen
    expect({
      hasOnReconnect: /onReconnect\s*\(/.test(socketServiceContent),
      reason: 'tv-register must be re-emitted on reconnect to restore master/slave sync',
    }).toEqual({
      hasOnReconnect: true,
      reason: 'tv-register must be re-emitted on reconnect to restore master/slave sync',
    });
  });

  it('tv.component.ts must re-emit tv-register on socket reconnection', () => {
    // After a socket reconnect, the server has lost the client's registration.
    // Without re-emitting tv-register, the slave never receives tv-loop-state
    // and the video stays frozen until a manual page refresh.
    expect({
      hasReconnectRegister: /onReconnect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*tv-register/.test(tvComponentContent),
      reason: 'socket reconnect without tv-register re-emit → slave frozen until refresh',
    }).toEqual({
      hasReconnectRegister: true,
      reason: 'socket reconnect without tv-register re-emit → slave frozen until refresh',
    });
  });

  it('double-buffer preload timeout must be >= 5000ms for remote network access', () => {
    // When accessing the Pi from a PC browser over WiFi, videos load via HTTP
    // instead of local disk. A 2s timeout causes premature forced switch → freeze frame.
    const timeoutMatch = doubleBufferContent.match(/Preload timeout.*?}\s*,\s*(\d+)\s*\)/s);
    const timeoutMs = timeoutMatch ? parseInt(timeoutMatch[1], 10) : 0;
    expect({
      timeoutMs,
      isAtLeast5s: timeoutMs >= 5000,
      reason: 'remote WiFi access needs >= 5s preload timeout — 2s causes freeze-frame on slow connections',
    }).toEqual({
      timeoutMs,
      isAtLeast5s: true,
      reason: 'remote WiFi access needs >= 5s preload timeout — 2s causes freeze-frame on slow connections',
    });
  });
});

describe('IPv6 localhost resolution guard (sync-agent)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('validate-post-update.js must use 127.0.0.1 instead of localhost for health checks', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/validate-post-update.js'),
      'utf8'
    );
    // Must NOT use http://localhost for local connections (IPv6 ECONNREFUSED on Debian 12+)
    expect({ noLocalhost: !content.includes("http://localhost:") })
      .toEqual({ noLocalhost: true });
    // Must use IPv4 explicit addresses
    expect({ usesIPv4: content.includes("http://127.0.0.1:") })
      .toEqual({ usesIPv4: true });
  });

  it('local-socket.js must use 127.0.0.1 for Socket.IO connection', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/services/local-socket.js'),
      'utf8'
    );
    expect({ noLocalhost: !content.includes("http://localhost:") })
      .toEqual({ noLocalhost: true });
    expect({ usesIPv4: content.includes("http://127.0.0.1:") })
      .toEqual({ usesIPv4: true });
  });

  it('update-software.js must use 127.0.0.1 for local health checks', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/commands/update-software.js'),
      'utf8'
    );
    expect({ noLocalhost: !content.includes("http://localhost:3000") })
      .toEqual({ noLocalhost: true });
    expect({ usesIPv4: content.includes("http://127.0.0.1:3000") })
      .toEqual({ usesIPv4: true });
  });
});

describe('Dual-stack server binding (IPv4 + IPv6)', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  it('admin-server.js must listen on dual-stack (::) not IPv4-only (0.0.0.0)', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/admin/admin-server.js'),
      'utf8'
    );
    // Must bind to '::' for dual-stack (accepts both IPv4 and IPv6)
    const listenMatch = content.match(/\.listen\(PORT,\s*['"]([^'"]+)['"]/);
    expect({ hasDualStack: listenMatch && listenMatch[1] === '::' })
      .toEqual({ hasDualStack: true });
  });

  it('server.js (Socket.IO) must listen on dual-stack (::) not IPv4-only', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/server/server.js'),
      'utf8'
    );
    const listenMatch = content.match(/\.listen\(PORT,\s*['"]([^'"]+)['"]/);
    expect({ hasDualStack: listenMatch && listenMatch[1] === '::' })
      .toEqual({ hasDualStack: true });
  });
});

describe('Socket reconnection stability guards', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

  // Guard: Server must check socket.id before marking site offline on disconnect.
  // Without this, during rapid reconnection the OLD socket's disconnect handler
  // deletes the NEW socket from connectedSites and marks the site offline
  // → false Slack alerts despite Pi being connected.
  it('socket.service.ts handleDisconnection must check socket.id before marking offline', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'central-server/src/services/socket.service.ts'),
      'utf8'
    );
    // Must compare socket IDs to detect stale disconnects
    expect({
      checksSocketId: /currentSocket\.id\s*!==\s*socket\.id/.test(content)
        || /socket\.id\s*!==\s*currentSocket\.id/.test(content),
      getsCurrentSocket: /connectedSites\.get\(siteId\)/.test(content),
      skipsOfflineForStale: /skipping offline|stale.*socket/i.test(content),
    }).toEqual({
      checksSocketId: true,
      getsCurrentSocket: true,
      skipsOfflineForStale: true,
    });
  });

  // Guard: agent.js must stop old watchers before creating new ones in onAuthenticated.
  // Without stopWatchers(), each reconnection leaks ConfigWatcher + VideoWatcher
  // (inotify descriptors + polling intervals). After N reconnects = N watchers.
  it('agent.js must stop watchers before creating new ones on reconnection', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
    expect({
      hasStopWatchers: /stopWatchers\(\)/.test(content),
      calledBeforeStart: /stopWatchers\(\)[\s\S]*?startConfigWatcher\(\)/.test(content),
      calledOnDisconnect: /handleDisconnect[\s\S]*?stopWatchers\(\)/.test(content),
    }).toEqual({
      hasStopWatchers: true,
      calledBeforeStart: true,
      calledOnDisconnect: true,
    });
  });

  // Guard: agent.js must remove pong listeners before adding new ones in onAuthenticated.
  // Socket.IO reuses the same socket object — without removeAllListeners, each reconnect
  // adds another pong handler → N× updateLastPong() calls after N reconnections
  // → Node.js MaxListenersExceededWarning.
  it('agent.js must remove pong listeners before adding new ones on reconnection', () => {
    const content = fs.readFileSync(
      path.join(repoRoot, 'raspberry/sync-agent/src/agent.js'),
      'utf8'
    );
    expect({
      removesPong: /removeAllListeners\(['"]pong['"]\)/.test(content),
      removesPongResponse: /removeAllListeners\(['"]pong_response['"]\)/.test(content),
      removesBeforeAdds: /removeAllListeners\(['"]pong['"]\)[\s\S]*?\.on\(['"]pong['"]/.test(content),
    }).toEqual({
      removesPong: true,
      removesPongResponse: true,
      removesBeforeAdds: true,
    });
  });

  // Guard: wlan1 reconnect loop must check wlan1 IP before starting.
  // Without this check, the loop stops itself (wlan1 already has IP),
  // then internetWatchLoop restarts it 30s later → infinite start/stop cycle
  // logging every 30s, potential wpa_cli reconfigure on edge cases.
  it('network-watchdog must check wlan1 IP before starting reconnect loop', () => {
    const content = [
      'raspberry/sync-agent/src/services/network-watchdog.js',
      'raspberry/sync-agent/src/services/internet-watchdog.js',
    ].map(f => fs.readFileSync(path.join(repoRoot, f), 'utf8')).join('\n');
    // The ethernet block must call getInternetIp() to check wlan1 before startWlan1Reconnect
    const ethernetBlock = content.match(
      /connectionType.*===.*'ethernet'\)\s*\{[\s\S]*?startWlan1Reconnect/
    );
    expect({
      hasEthernetBlock: ethernetBlock !== null,
      checksWlan1Ip: ethernetBlock ? /getInternetIp/.test(ethernetBlock[0]) : false,
      conditionalStart: ethernetBlock ? /if\s*\(!wlan1Ip\)/.test(ethernetBlock[0]) : false,
    }).toEqual({
      hasEthernetBlock: true,
      checksWlan1Ip: true,
      conditionalStart: true,
    });
  });
});
