/**
 * Tests unitaires pour le module debug-bundle
 *
 * Vérifie que le bundle de debug contient toutes les sections attendues,
 * que les données sensibles sont masquées, et que les erreurs individuelles
 * n'empêchent pas la collecte des autres sections.
 *
 * @module debug-bundle.test
 */

jest.mock('fs-extra');
jest.mock('child_process', () => {
  const mockExec = jest.fn();
  return { exec: mockExec };
});
jest.mock('../services/local-socket', () => ({
  emit: jest.fn(() => true),
  request: jest.fn(() => Promise.resolve({ avgMs: 42 })),
  isConnected: jest.fn(() => true),
  connect: jest.fn(),
  disconnect: jest.fn(),
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../config', () => ({
  config: {
    paths: {
      root: '/home/pi/neopro',
      config: '/home/pi/neopro/webapp/configuration.json',
    },
  },
}));

jest.mock('../metrics', () => ({
  getHealthStatus: jest.fn(),
  getSystemInfo: jest.fn(),
  getServicesStatus: jest.fn(),
}));

jest.mock('../commands/network-diagnostics', () => jest.fn());

jest.mock('../commands/analytics-buffer', () => ({
  getAnalyticsBufferStatus: jest.fn(),
}));

jest.mock('../commands/wifi-bssid', () => ({
  getWifiBssidStatus: jest.fn(),
}));

const fs = require('fs-extra');
const { exec } = require('child_process');
const metrics = require('../metrics');
const networkDiagnostics = require('../commands/network-diagnostics');
const { getAnalyticsBufferStatus } = require('../commands/analytics-buffer');
const { getWifiBssidStatus } = require('../commands/wifi-bssid');
const localSocket = require('../services/local-socket');

const exportDebugBundle = require('../commands/debug-bundle');

/**
 * Liste exhaustive des 16 sections attendues dans le bundle.
 * Si une section est ajoutée ou supprimée, ce test doit être mis à jour.
 * Cela sert de garde-fou contre les régressions de complétude.
 */
const EXPECTED_SECTIONS = [
  'configuration',
  'version',
  'release',
  'health',
  'systemInfo',
  'services',
  'logs',
  'network',
  'diskUsage',
  'buffers',
  'hotspotConfig',
  'hotspotDiagnostics',
  'bootConfig',
  'transitionMetrics',
  'dmesg',
  'usbDevices',
  'wifiClient',
  'videoFiles',
];

/** Setup all mocks with default happy-path values */
function setupDefaultMocks() {
  // exec mock (used by promisify → execAsync)
  exec.mockImplementation((cmd, optionsOrCallback, callback) => {
    const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
    if (typeof cb === 'function') {
      cb(null, { stdout: 'mock output', stderr: '' });
    }
  });

  // fs mocks
  fs.pathExists.mockImplementation((path) => {
    if (path.includes('configuration.json')) return Promise.resolve(true);
    if (path.includes('VERSION')) return Promise.resolve(true);
    if (path.includes('release.json')) return Promise.resolve(true);
    if (path.includes('/videos')) return Promise.resolve(true);
    return Promise.resolve(false);
  });

  fs.readFile.mockImplementation((path) => {
    if (path.includes('configuration.json')) {
      return Promise.resolve(JSON.stringify({
        siteId: 'site-123',
        apiKey: 'sk_live_abcdefgh12345678',
        auth: { password: 'supersecret' },
        siteName: 'Club Test',
      }));
    }
    if (path.includes('VERSION')) return Promise.resolve('3.72.1\n');
    if (path.includes('release.json')) {
      return Promise.resolve(JSON.stringify({ version: '3.72.1', date: '2026-02-23' }));
    }
    return Promise.resolve('');
  });

  // metrics mocks
  metrics.getHealthStatus.mockResolvedValue({ score: 85, issues: [] });
  metrics.getSystemInfo.mockResolvedValue({ hostname: 'neopro-test', uptime: 3600 });
  metrics.getServicesStatus.mockResolvedValue([
    { name: 'neopro-app', status: 'active', active: true },
  ]);

  // command mocks
  networkDiagnostics.mockResolvedValue({ internet: { reachable: true }, dns: { working: true } });
  getAnalyticsBufferStatus.mockResolvedValue({ pending: 0, lastPush: null });
  getWifiBssidStatus.mockResolvedValue({
    connected: true,
    ssid: 'ClubWiFi',
    bssid: 'AA:BB:CC:DD:EE:FF',
    signal: -55,
    ipAddress: '192.168.1.42',
    bssidLocked: null,
    isMeshEnvironment: false,
    meshApCount: 1,
  });

  // local-socket mock
  localSocket.request.mockResolvedValue({ avgMs: 42 });
}

describe('Debug Bundle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // ============================================
  // Completeness guard — prevents regressions
  // ============================================

  it('exports all expected sections (completeness guard)', async () => {
    const result = await exportDebugBundle();

    expect(result.success).toBe(true);
    expect(result.bundle).toBeDefined();
    expect(result.bundle.timestamp).toBeDefined();
    expect(result.bundle.hostname).toBeDefined();

    const sections = Object.keys(result.bundle.sections);
    for (const expected of EXPECTED_SECTIONS) {
      expect(sections).toContain(expected);
    }
  });

  it('has exactly the expected number of sections (no undocumented sections)', async () => {
    const result = await exportDebugBundle();
    const sections = Object.keys(result.bundle.sections);

    // If this fails, a section was added without updating EXPECTED_SECTIONS
    expect(sections.length).toBe(EXPECTED_SECTIONS.length);
    expect(sections.sort()).toEqual(EXPECTED_SECTIONS.sort());
  });

  // ============================================
  // Security — sensitive data masking
  // ============================================

  it('truncates apiKey in configuration', async () => {
    const result = await exportDebugBundle();
    const cfg = result.bundle.sections.configuration;

    expect(cfg.apiKey).toBe('sk_live_...');
    expect(cfg.apiKey).not.toContain('12345678');
  });

  it('masks password in configuration', async () => {
    const result = await exportDebugBundle();
    const cfg = result.bundle.sections.configuration;

    expect(cfg.auth.password).toBe('***');
    expect(cfg.auth.password).not.toBe('supersecret');
  });

  // ============================================
  // WiFi client section (new — v3.73)
  // ============================================

  it('includes WiFi client status with all expected fields', async () => {
    const result = await exportDebugBundle();
    const wifi = result.bundle.sections.wifiClient;

    expect(wifi).toBeDefined();
    expect(wifi.connected).toBe(true);
    expect(wifi.ssid).toBe('ClubWiFi');
    expect(wifi.bssid).toBe('AA:BB:CC:DD:EE:FF');
    expect(wifi.signal).toBe(-55);
    expect(wifi.ipAddress).toBe('192.168.1.42');
    expect(wifi).toHaveProperty('bssidLocked');
    expect(wifi).toHaveProperty('isMeshEnvironment');
    expect(wifi).toHaveProperty('meshApCount');
  });

  it('handles WiFi client failure gracefully', async () => {
    getWifiBssidStatus.mockRejectedValueOnce(new Error('wlan1 not found'));

    const result = await exportDebugBundle();

    expect(result.success).toBe(true);
    expect(result.bundle.sections.wifiClient).toEqual({ error: 'wlan1 not found' });
    // Other sections should still be present
    expect(result.bundle.sections.health).toBeDefined();
    expect(result.bundle.sections.network).toBeDefined();
  });

  // ============================================
  // Resilience — individual section failures
  // ============================================

  it('continues collecting when a section fails', async () => {
    metrics.getHealthStatus.mockRejectedValueOnce(new Error('GPU read failed'));

    const result = await exportDebugBundle();

    expect(result.success).toBe(true);
    expect(result.bundle.sections.health).toEqual({ error: 'GPU read failed' });
    // Other sections unaffected
    expect(result.bundle.sections.systemInfo).toBeDefined();
    expect(result.bundle.sections.services).toBeDefined();
    expect(result.bundle.sections.wifiClient).toBeDefined();
  });

  it('handles all sections failing without crashing', async () => {
    metrics.getHealthStatus.mockRejectedValue(new Error('fail'));
    metrics.getSystemInfo.mockRejectedValue(new Error('fail'));
    metrics.getServicesStatus.mockRejectedValue(new Error('fail'));
    networkDiagnostics.mockRejectedValue(new Error('fail'));
    getAnalyticsBufferStatus.mockRejectedValue(new Error('fail'));
    getWifiBssidStatus.mockRejectedValue(new Error('fail'));
    localSocket.request.mockRejectedValue(new Error('fail'));

    fs.pathExists.mockResolvedValue(false);
    exec.mockImplementation((cmd, optionsOrCallback, callback) => {
      const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
      if (typeof cb === 'function') {
        cb(new Error('command failed'), { stdout: '', stderr: '' });
      }
    });

    const result = await exportDebugBundle();
    expect(result.success).toBe(true);
    expect(result.bundle.timestamp).toBeDefined();
  });
});
