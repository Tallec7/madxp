/**
 * Tests for AlertService — covers:
 * - Shutdown mode (SIGTERM suppresses site online/offline alerts)
 * - Boot grace period (suppresses both online AND offline alerts)
 * - WiFi alert cooldown (6h dedup) and recovery pattern
 * - Existing cooldown behavior
 */

// Mock logger before importing
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

// Mock fetch for Slack webhook
const mockFetch = jest.fn().mockResolvedValue({ ok: true });
global.fetch = mockFetch as unknown as typeof fetch;

describe('AlertService', () => {
  // We need a fresh instance for each test to reset serverStartTime and internal state
  let alertService: InstanceType<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Set env so alerts are enabled
    process.env.SLACK_ALERTS_ENABLED = 'true';
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

    // Re-import to get a fresh module with new serverStartTime
    const module = require('./alert.service');
    alertService = module.alertService;

    // Re-assign fetch mock after module reload
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete process.env.SLACK_ALERTS_ENABLED;
    delete process.env.SLACK_WEBHOOK_URL;
  });

  // ===========================================================================
  // Fix 1: Shutdown mode — SIGTERM suppresses site status alerts
  // ===========================================================================

  describe('shutdown mode', () => {
    it('should suppress siteOffline alerts after enterShutdownMode()', async () => {
      // Wait for boot grace period to pass
      (alertService as any).serverStartTime = Date.now() - 120_000;

      const result1 = await alertService.siteOffline('site-1', 'Club A');
      expect(result1).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      mockFetch.mockClear();
      alertService.enterShutdownMode();

      const result2 = await alertService.siteOffline('site-2', 'Club B');
      expect(result2).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should suppress siteOnline alerts after enterShutdownMode()', async () => {
      (alertService as any).serverStartTime = Date.now() - 120_000;

      alertService.enterShutdownMode();

      const result = await alertService.siteOnline('site-1', 'Club A');
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not suppress non-status alerts in shutdown mode', async () => {
      alertService.enterShutdownMode();

      const result = await alertService.highTemperature('site-1', 'Club A', 82);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Fix 1b: Boot grace period now covers BOTH online and offline
  // ===========================================================================

  describe('boot grace period', () => {
    it('should suppress siteOnline during boot grace period', async () => {
      // serverStartTime is "just now" by default in fresh module
      const result = await alertService.siteOnline('site-1', 'Club A');
      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Skipping siteOnline alert (boot grace period)',
        expect.any(Object)
      );
    });

    it('should suppress siteOffline during boot grace period', async () => {
      const result = await alertService.siteOffline('site-1', 'Club A');
      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Skipping siteOffline alert (boot grace period)',
        expect.any(Object)
      );
    });

    it('should allow siteOnline after boot grace period', async () => {
      // Simulate boot happened 2 minutes ago
      (alertService as any).serverStartTime = Date.now() - 120_000;

      const result = await alertService.siteOnline('site-1', 'Club A');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should allow siteOffline after boot grace period', async () => {
      (alertService as any).serverStartTime = Date.now() - 120_000;

      const result = await alertService.siteOffline('site-1', 'Club A');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Fix 2: WiFi alert cooldown (6h) and recovery
  // ===========================================================================

  describe('WiFi alert cooldown', () => {
    beforeEach(() => {
      (alertService as any).serverStartTime = Date.now() - 120_000;
    });

    it('should send first lowWifiSignal alert', async () => {
      const result = await alertService.lowWifiSignal('site-1', 'Club A', -80);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should suppress repeated lowWifiSignal within 6h cooldown', async () => {
      await alertService.lowWifiSignal('site-1', 'Club A', -80);
      mockFetch.mockClear();

      const result = await alertService.lowWifiSignal('site-1', 'Club A', -82);
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should allow lowWifiSignal for different sites', async () => {
      await alertService.lowWifiSignal('site-1', 'Club A', -80);
      mockFetch.mockClear();

      const result = await alertService.lowWifiSignal('site-2', 'Club B', -76);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should allow lowWifiSignal after cooldown expires', async () => {
      await alertService.lowWifiSignal('site-1', 'Club A', -80);
      mockFetch.mockClear();

      // Simulate 6h+ passed
      const wifiAlerts = (alertService as any).activeWifiAlerts as Map<string, number>;
      wifiAlerts.set('site-1', Date.now() - 7 * 60 * 60 * 1000);

      const result = await alertService.lowWifiSignal('site-1', 'Club A', -80);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('WiFi signal recovery', () => {
    beforeEach(() => {
      (alertService as any).serverStartTime = Date.now() - 120_000;
    });

    it('should send recovery alert when active WiFi alert exists', async () => {
      // First trigger a WiFi alert
      await alertService.lowWifiSignal('site-1', 'Club A', -80);
      mockFetch.mockClear();

      // Then signal recovers
      const result = await alertService.wifiSignalRecovered('site-1', 'Club A', -65);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify the Slack payload contains "rétabli"
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const headerText = body.attachments[0].blocks[0].text.text;
      expect(headerText).toContain('rétabli');
    });

    it('should not send recovery alert when no active WiFi alert', async () => {
      const result = await alertService.wifiSignalRecovered('site-1', 'Club A', -65);
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should clear active alert on recovery, allowing new alert later', async () => {
      await alertService.lowWifiSignal('site-1', 'Club A', -80);
      await alertService.wifiSignalRecovered('site-1', 'Club A', -65);
      mockFetch.mockClear();

      // Signal degrades again — should be allowed (not in cooldown anymore)
      const result = await alertService.lowWifiSignal('site-1', 'Club A', -78);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Existing cooldown behavior
  // ===========================================================================

  describe('site status cooldown', () => {
    beforeEach(() => {
      (alertService as any).serverStartTime = Date.now() - 120_000;
    });

    it('should suppress duplicate siteOffline within 5min cooldown', async () => {
      await alertService.siteOffline('site-1', 'Club A');
      mockFetch.mockClear();

      const result = await alertService.siteOffline('site-1', 'Club A');
      expect(result).toBe(false);
    });

    it('should suppress duplicate siteOnline within 5min cooldown', async () => {
      await alertService.siteOnline('site-1', 'Club A');
      mockFetch.mockClear();

      const result = await alertService.siteOnline('site-1', 'Club A');
      expect(result).toBe(false);
    });

    it('should allow offline and online for same site (different keys)', async () => {
      await alertService.siteOffline('site-1', 'Club A');
      mockFetch.mockClear();

      const result = await alertService.siteOnline('site-1', 'Club A');
      expect(result).toBe(true);
    });
  });
});
