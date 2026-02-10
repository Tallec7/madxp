/**
 * Tests for SystemService
 */

const SystemService = require('../services/system.service');
const { ValidationError, CommandError } = require('../services/errors');

// ---------------------------------------------------------------------------
// Mock helpers (execCommand)
// ---------------------------------------------------------------------------

jest.mock('../helpers', () => {
  const actual = jest.requireActual('../helpers');
  return {
    ...actual,
    execCommand: jest.fn(),
  };
});

const { execCommand } = require('../helpers');

// ---------------------------------------------------------------------------
// Mock fs for version tests
// ---------------------------------------------------------------------------

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      readFile: jest.fn(),
      stat: jest.fn(),
    },
  };
});

const fs = require('fs').promises;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SystemService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SystemService();
    // Reset version cache between tests
    service._versionCache = null;
    service._versionCacheTimestamp = 0;
  });

  // =========================================================================
  // getVersionInfo
  // =========================================================================

  describe('getVersionInfo', () => {
    it('should read from release.json when available', async () => {
      fs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          version: '2.1.0',
          commit: 'abc123',
          buildDate: '2024-01-15',
          source: 'ci',
        }),
      );

      const info = await service.getVersionInfo();
      expect(info.version).toBe('2.1.0');
      expect(info.commit).toBe('abc123');
      expect(info.source).toBe('ci');
    });

    it('should fallback to VERSION file when release.json missing', async () => {
      // release.json fails
      fs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      // webapp/version.json fails
      fs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      // VERSION file succeeds
      fs.readFile.mockResolvedValueOnce('1.5.0\n');

      const info = await service.getVersionInfo();
      expect(info.version).toBe('1.5.0');
      expect(info.source).toBe('version-file');
    });

    it('should fallback to package.json as last resort', async () => {
      // release.json fails
      fs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      // webapp/version.json fails
      fs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      // VERSION file fails
      fs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      // package.json
      fs.readFile.mockResolvedValueOnce(JSON.stringify({ version: '0.9.0' }));

      const info = await service.getVersionInfo();
      expect(info.version).toBe('0.9.0');
      expect(info.source).toBe('package.json');
    });

    it('should return "unknown" when all sources fail', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'));

      const info = await service.getVersionInfo();
      expect(info.version).toBe('unknown');
    });

    it('should use cache within TTL', async () => {
      fs.readFile.mockResolvedValueOnce(
        JSON.stringify({ version: '2.0.0' }),
      );

      const first = await service.getVersionInfo();
      const second = await service.getVersionInfo();

      expect(first.version).toBe('2.0.0');
      expect(second.version).toBe('2.0.0');
      // readFile should only be called for the first call
      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // getServiceLogs
  // =========================================================================

  describe('getServiceLogs', () => {
    it('should return logs for valid service "app"', async () => {
      execCommand.mockResolvedValue({ success: true, output: 'log line 1\nlog line 2' });

      const logs = await service.getServiceLogs('app', 50);
      expect(logs).toContain('log line 1');
      expect(execCommand).toHaveBeenCalledWith(
        expect.stringContaining('neopro-app'),
      );
    });

    it('should return system logs for "system"', async () => {
      execCommand.mockResolvedValue({ success: true, output: 'system logs' });

      const logs = await service.getServiceLogs('system');
      expect(logs).toBe('system logs');
      expect(execCommand).toHaveBeenCalledWith(
        expect.stringContaining('journalctl -n 100'),
      );
    });

    it('should throw ValidationError for unknown service', async () => {
      await expect(service.getServiceLogs('unknown')).rejects.toThrow(ValidationError);
    });

    it('should throw CommandError when command fails', async () => {
      execCommand.mockResolvedValue({ success: false, error: 'failed' });

      await expect(service.getServiceLogs('app')).rejects.toThrow(CommandError);
    });
  });

  // =========================================================================
  // restartService
  // =========================================================================

  describe('restartService', () => {
    it('should restart an allowed service', async () => {
      execCommand.mockResolvedValue({ success: true, output: '' });

      await service.restartService('nginx');
      expect(execCommand).toHaveBeenCalledWith('sudo systemctl restart nginx');
    });

    it('should throw ValidationError for non-allowed service', async () => {
      await expect(service.restartService('cron')).rejects.toThrow(ValidationError);
    });

    it('should throw CommandError when restart fails', async () => {
      execCommand.mockResolvedValue({ success: false, error: 'restart failed' });

      await expect(service.restartService('nginx')).rejects.toThrow(CommandError);
    });
  });

  // =========================================================================
  // getSystemInfo (basic smoke test)
  // =========================================================================

  describe('getSystemInfo', () => {
    it('should return system info object', async () => {
      execCommand.mockResolvedValue({ success: true, output: '45000' });

      const info = await service.getSystemInfo();

      // Should always have these fields, even if some values come from os module
      expect(info).toHaveProperty('hostname');
      expect(info).toHaveProperty('platform');
      expect(info).toHaveProperty('arch');
    });
  });

  // =========================================================================
  // reboot / shutdown (just verify they don't throw synchronously)
  // =========================================================================

  describe('reboot', () => {
    it('should not throw', () => {
      // reboot() uses setTimeout + exec internally
      jest.useFakeTimers();
      expect(() => service.reboot()).not.toThrow();
      jest.useRealTimers();
    });
  });

  describe('shutdown', () => {
    it('should not throw', () => {
      jest.useFakeTimers();
      expect(() => service.shutdown()).not.toThrow();
      jest.useRealTimers();
    });
  });
});
