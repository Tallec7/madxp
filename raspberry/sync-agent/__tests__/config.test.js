/**
 * Tests for sync-agent config — DEFAULT_ALLOWED_COMMANDS whitelist.
 *
 * v4.0 Phase 5 (DETECT-02/03) — Fire Stick auto-discovery events must be
 * whitelisted Pi → cloud so Phase 7 can push them without rejection.
 */

describe('config — DEFAULT_ALLOWED_COMMANDS', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    delete process.env.ALLOWED_COMMANDS;
    delete process.env.SITE_ID;
    delete process.env.SITE_API_KEY;
    delete process.env.CONFIG_FILE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('v4.0 Phase 5 — receiver events whitelist', () => {
    it('contains receiver-detected by default', () => {
      const { config } = require('../src/config');
      expect(config.security.allowedCommands).toContain('receiver-detected');
    });

    it('contains receiver-disconnected by default', () => {
      const { config } = require('../src/config');
      expect(config.security.allowedCommands).toContain('receiver-disconnected');
    });

    it('re-injects receiver events when ALLOWED_COMMANDS env is partial', () => {
      // Only a subset is provided via env — the missingCommands logic should
      // still re-inject the v4.0 Phase 5 receiver events (and the rest).
      process.env.ALLOWED_COMMANDS = 'reboot,deploy_video';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { config } = require('../src/config');
      warnSpy.mockRestore();
      expect(config.security.allowedCommands).toContain('receiver-detected');
      expect(config.security.allowedCommands).toContain('receiver-disconnected');
      // And the explicitly provided ones are preserved
      expect(config.security.allowedCommands).toContain('reboot');
      expect(config.security.allowedCommands).toContain('deploy_video');
    });
  });
});
