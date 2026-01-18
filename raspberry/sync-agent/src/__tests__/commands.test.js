/**
 * Tests unitaires pour le module de commandes NEOPRO
 *
 * Ce module gère toutes les commandes reçues du central:
 * - update_config: Mise à jour de la configuration avec merge intelligent
 * - reboot: Redémarrage du système
 * - restart_service: Redémarrage d'un service
 * - get_logs: Récupération des logs
 * - get_system_info: Information système
 * - get_config: Récupération de la configuration
 * - update_hotspot: Mise à jour du hotspot WiFi
 * - get_hotspot_config: Récupération de la config hotspot
 *
 * @module commands.test
 */

// Mock des dépendances externes - defined before jest.mock
jest.mock('fs-extra');
jest.mock('child_process', () => {
  const mockExec = jest.fn();
  const mockSpawn = jest.fn(() => ({ unref: jest.fn() }));
  return {
    exec: mockExec,
    spawn: mockSpawn,
  };
});
jest.mock('socket.io-client', () => {
  return jest.fn(() => ({
    emit: jest.fn(),
    close: jest.fn(),
  }));
});

const fs = require('fs-extra');
const { exec, spawn } = require('child_process');

// Mock du logger
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock de la config
jest.mock('../config', () => ({
  config: {
    paths: {
      root: '/home/pi/neopro',
      config: '/home/pi/neopro/webapp/configuration.json',
    },
    logging: {
      path: '/var/log/neopro/sync-agent.log',
    },
  },
}));

// Mock du metrics collector
jest.mock('../metrics', () => ({
  getSystemInfo: jest.fn().mockResolvedValue({
    hostname: 'neopro-test',
    os: 'Raspberry Pi OS',
    kernel: '5.10',
    architecture: 'arm64',
  }),
  getNetworkStatus: jest.fn().mockResolvedValue({
    interfaces: ['eth0', 'wlan0'],
    connected: true,
  }),
  collectAll: jest.fn().mockResolvedValue({
    cpu: 45.2,
    memory: 62.1,
    temperature: 52.3,
    disk: 78.5,
    uptime: 3600000,
  }),
}));

// Import après les mocks
const commands = require('../commands');
const logger = require('../logger');
const util = require('util');

// Helper pour promisifier exec mock
const mockExecAsync = (stdout = '', stderr = '') => {
  exec.mockImplementation((cmd, callback) => {
    if (callback) {
      callback(null, { stdout, stderr });
    }
    return { stdout, stderr };
  });
};

describe('Commands Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.pathExists.mockResolvedValue(false);
    fs.readFile.mockResolvedValue('{}');
    fs.writeFile.mockResolvedValue(undefined);
    fs.ensureDir.mockResolvedValue(undefined);
    mockExecAsync();
  });

  describe('update_config', () => {
    describe('merge mode (default)', () => {
      it('should merge NEOPRO content with local config', async () => {
        const localConfig = {
          categories: [
            { id: 'club', name: 'Club', locked: false, owner: 'club', videos: [] }
          ]
        };
        const neoProContent = {
          categories: [
            { id: 'neopro', name: 'NEOPRO', locked: true, owner: 'neopro', videos: [] }
          ]
        };

        fs.pathExists.mockResolvedValue(true);
        fs.readFile.mockResolvedValue(JSON.stringify(localConfig));

        let writtenConfig = null;
        fs.writeFile.mockImplementation((path, content) => {
          if (path.includes('configuration.json') && !path.includes('backup')) {
            writtenConfig = JSON.parse(content);
          }
          return Promise.resolve();
        });

        const result = await commands.update_config({ neoProContent });

        expect(result.success).toBe(true);
        expect(result.mode).toBe('merge');
        expect(writtenConfig.categories).toHaveLength(2);
      });

      it('should throw error if no content provided', async () => {
        await expect(commands.update_config({})).rejects.toThrow(
          'Missing neoProContent or configuration in update_config command'
        );
      });
    });

  });

  describe('reboot', () => {
    it('should return success and schedule reboot', async () => {
      jest.useFakeTimers();
      mockExecAsync();

      const result = await commands.reboot();

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 seconds');

      jest.advanceTimersByTime(2500);

      expect(exec).toHaveBeenCalledWith(
        'sudo reboot',
        expect.any(Function)
      );

      jest.useRealTimers();
    });
  });

  describe('restart_service', () => {
    it('should restart service and check status', async () => {
      exec.mockImplementation((cmd, callback) => {
        if (cmd.includes('is-active')) {
          callback(null, { stdout: 'active\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      });

      const result = await commands.restart_service({ service: 'neopro-app' });

      expect(result.success).toBe(true);
      expect(result.status).toBe('active');
    });

    it('should do git pull for sync-agent service', async () => {
      const execCalls = [];
      exec.mockImplementation((cmd, callback) => {
        execCalls.push(cmd);
        if (cmd.includes('is-active')) {
          callback(null, { stdout: 'active\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      });

      await commands.restart_service({ service: 'neopro-sync-agent' });

      const gitPullCall = execCalls.find(c => c.includes('git pull'));
      expect(gitPullCall).toBeDefined();
    });

    it('should throw if service fails to start', async () => {
      exec.mockImplementation((cmd, callback) => {
        if (cmd.includes('is-active')) {
          callback(null, { stdout: 'inactive\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      });

      await expect(
        commands.restart_service({ service: 'test-service' })
      ).rejects.toThrow('not active after restart');
    });
  });

  describe('get_logs', () => {
    it('should get sync-agent logs from file', async () => {
      exec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'log line 1\nlog line 2', stderr: '' });
      });

      const result = await commands.get_logs({ service: 'sync-agent', lines: 50 });

      expect(result.success).toBe(true);
      expect(result.logs).toContain('log line 1');
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('tail -n 50'),
        expect.any(Function)
      );
    });

    it('should get systemd service logs via journalctl', async () => {
      exec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'journalctl output', stderr: '' });
      });

      const result = await commands.get_logs({ service: 'neopro-app', lines: 100 });

      expect(result.success).toBe(true);
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('journalctl -u neopro-app'),
        expect.any(Function)
      );
    });
  });

  describe('get_system_info', () => {
    it('should return system info, network status and metrics', async () => {
      const result = await commands.get_system_info();

      expect(result.success).toBe(true);
      expect(result.systemInfo.hostname).toBe('neopro-test');
      expect(result.networkStatus.connected).toBe(true);
      expect(result.metrics.cpu).toBe(45.2);
    });
  });

  describe('get_config', () => {
    it('should return configuration from file', async () => {
      const config = {
        categories: [{ id: 'test', name: 'Test' }]
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify(config));

      const result = await commands.get_config();

      expect(result.success).toBe(true);
      expect(result.configuration).toEqual(config);
    });

    it('should return null if config file not found', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await commands.get_config();

      expect(result.success).toBe(true);
      expect(result.configuration).toBeNull();
    });
  });

  describe('update_hotspot', () => {
    const mockHostapdContent = `
interface=wlan0
ssid=NEOPRO-OLD
channel=6
wpa_passphrase=oldpassword123
`;

    it('should update SSID', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(mockHostapdContent);

      exec.mockImplementation((cmd, callback) => {
        if (cmd.includes('is-active')) {
          callback(null, { stdout: 'active\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      });

      let writtenContent = '';
      fs.writeFile.mockImplementation((path, content) => {
        writtenContent = content;
        return Promise.resolve();
      });

      const result = await commands.update_hotspot({ ssid: 'NEOPRO-NEW' });

      expect(result.success).toBe(true);
      expect(result.ssidUpdated).toBe(true);
      expect(writtenContent).toContain('ssid=NEOPRO-NEW');
    });

    it('should update password', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(mockHostapdContent);

      exec.mockImplementation((cmd, callback) => {
        if (cmd.includes('is-active')) {
          callback(null, { stdout: 'active\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      });

      let writtenContent = '';
      fs.writeFile.mockImplementation((path, content) => {
        writtenContent = content;
        return Promise.resolve();
      });

      const result = await commands.update_hotspot({ password: 'newpassword456' });

      expect(result.success).toBe(true);
      expect(result.passwordUpdated).toBe(true);
      expect(writtenContent).toContain('wpa_passphrase=newpassword456');
    });

    it('should reject invalid password length', async () => {
      await expect(
        commands.update_hotspot({ password: 'short' })
      ).rejects.toThrow('between 8 and 63 characters');
    });

    it('should reject SSID longer than 32 characters', async () => {
      await expect(
        commands.update_hotspot({ ssid: 'A'.repeat(33) })
      ).rejects.toThrow('32 characters or less');
    });

    it('should reject if no ssid or password provided', async () => {
      await expect(
        commands.update_hotspot({})
      ).rejects.toThrow('At least one of ssid or password must be provided');
    });

    it('should restore backup if hostapd fails to start', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(mockHostapdContent);

      const execCalls = [];
      exec.mockImplementation((cmd, callback) => {
        execCalls.push(cmd);
        if (cmd.includes('is-active')) {
          callback(null, { stdout: 'inactive\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      });

      await expect(
        commands.update_hotspot({ ssid: 'NEOPRO-NEW' })
      ).rejects.toThrow('backup restored');

      const restoreCall = execCalls.find(c => c.includes('cp') && c.includes('backup'));
      expect(restoreCall).toBeDefined();
    });
  });

  describe('get_hotspot_config', () => {
    it('should return hotspot configuration', async () => {
      const mockContent = `
interface=wlan0
ssid=NEOPRO-TEST
channel=6
wpa_passphrase=testpassword
`;
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(mockContent);

      exec.mockImplementation((cmd, callback) => {
        if (cmd.includes('is-active')) {
          callback(null, { stdout: 'active\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      });

      const result = await commands.get_hotspot_config();

      expect(result.success).toBe(true);
      expect(result.configured).toBe(true);
      expect(result.ssid).toBe('NEOPRO-TEST');
      expect(result.channel).toBe(6);
      expect(result.isActive).toBe(true);
      // Password should NOT be returned
      expect(result.password).toBeUndefined();
    });

    it('should return not configured if hostapd.conf missing', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await commands.get_hotspot_config();

      expect(result.success).toBe(true);
      expect(result.configured).toBe(false);
    });
  });

  describe('fix_hotspot', () => {
    it('should run diagnostic without autoFix', async () => {
      // Script exists
      fs.pathExists.mockResolvedValue(true);

      // Mock exec to return JSON output
      const jsonOutput = JSON.stringify({
        success: true,
        diagnostic: {
          currentChannel: 6,
          recommendedChannel: 6,
          ssid: 'NEOPRO-TEST',
          hostapdActive: true,
          dnsmasqActive: true,
          powerOk: true,
          throttledValue: '0x0'
        },
        fix: {
          channelChanged: false,
          needsReboot: false,
          oldChannel: '',
          newChannel: ''
        },
        message: 'Diagnostic terminé.'
      });

      exec.mockImplementation((cmd, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
        }
        if (callback) {
          callback(null, { stdout: jsonOutput, stderr: '' });
        }
        return { stdout: jsonOutput, stderr: '' };
      });

      const result = await commands.fix_hotspot({ autoFix: false });

      expect(result.success).toBe(true);
      expect(result.diagnostic).toBeDefined();
      expect(result.diagnostic.currentChannel).toBe(6);
      expect(result.fix.channelChanged).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it('should run auto-fix and report channel change', async () => {
      fs.pathExists.mockResolvedValue(true);

      const jsonOutput = JSON.stringify({
        success: true,
        diagnostic: {
          currentChannel: 1,
          recommendedChannel: 1,
          ssid: 'NEOPRO-TEST',
          hostapdActive: true,
          dnsmasqActive: true,
          powerOk: true,
          throttledValue: '0x0'
        },
        fix: {
          channelChanged: true,
          needsReboot: true,
          oldChannel: '6',
          newChannel: '1'
        },
        message: 'Canal changé de 6 à 1. Redémarrage requis pour appliquer.'
      });

      exec.mockImplementation((cmd, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
        }
        // Verify --auto-fix is passed
        expect(cmd).toContain('--auto-fix');
        expect(cmd).toContain('--json');
        if (callback) {
          callback(null, { stdout: jsonOutput, stderr: '' });
        }
        return { stdout: jsonOutput, stderr: '' };
      });

      const result = await commands.fix_hotspot({ autoFix: true });

      expect(result.success).toBe(true);
      expect(result.fix.channelChanged).toBe(true);
      expect(result.fix.needsReboot).toBe(true);
      expect(result.fix.oldChannel).toBe('6');
      expect(result.fix.newChannel).toBe('1');
      expect(result.autoFix).toBe(true);
    });

    it('should fallback to manual diagnostics if script not found', async () => {
      fs.pathExists.mockResolvedValue(false);

      // Mock exec for manual diagnostic commands
      exec.mockImplementation((cmd, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
        }
        let stdout = '';
        if (cmd.includes('is-active hostapd')) {
          stdout = 'active';
        } else if (cmd.includes('is-active dnsmasq')) {
          stdout = 'active';
        } else if (cmd.includes('ip addr show wlan0')) {
          stdout = 'inet 192.168.4.1/24';
        } else if (cmd.includes('grep') && cmd.includes('ssid=')) {
          stdout = 'ssid=NEOPRO-MANUAL';
        } else if (cmd.includes('grep') && cmd.includes('channel=')) {
          stdout = 'channel=6';
        } else if (cmd.includes('rfkill')) {
          stdout = '';
        }
        if (callback) {
          callback(null, { stdout, stderr: '' });
        }
        return { stdout, stderr: '' };
      });

      const result = await commands.fix_hotspot({ autoFix: false });

      expect(result.success).toBe(true);
      expect(result.manual).toBe(true);
      expect(result.checks).toBeDefined();
      expect(Array.isArray(result.checks)).toBe(true);
    });

    it('should handle script execution errors gracefully', async () => {
      fs.pathExists.mockResolvedValue(true);

      // First call (script) fails, fallback to manual
      let callCount = 0;
      exec.mockImplementation((cmd, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
        }
        callCount++;
        if (callCount === 1) {
          // Script fails
          const error = new Error('Script failed');
          if (callback) {
            callback(error, { stdout: '', stderr: 'Error' });
          }
          throw error;
        }
        // Manual diagnostics
        if (callback) {
          callback(null, { stdout: 'active', stderr: '' });
        }
        return { stdout: 'active', stderr: '' };
      });

      const result = await commands.fix_hotspot({ autoFix: false });

      // Should fallback to manual diagnostics
      expect(result.success).toBe(true);
      expect(result.manual).toBe(true);
    });

    it('should pass --reboot-now flag when rebootNow is true', async () => {
      fs.pathExists.mockResolvedValue(true);

      const jsonOutput = JSON.stringify({
        success: true,
        diagnostic: { currentChannel: 1 },
        fix: { channelChanged: true, needsReboot: true }
      });

      exec.mockImplementation((cmd, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
        }
        // Verify both flags are passed
        expect(cmd).toContain('--auto-fix');
        expect(cmd).toContain('--reboot-now');
        if (callback) {
          callback(null, { stdout: jsonOutput, stderr: '' });
        }
        return { stdout: jsonOutput, stderr: '' };
      });

      const result = await commands.fix_hotspot({ autoFix: true, rebootNow: true });

      expect(result.rebootRequested).toBe(true);
    });
  });

  describe('reboot command', () => {
    it('should initiate system reboot', async () => {
      exec.mockImplementation((cmd, callback) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return { stdout: '', stderr: '' };
      });

      const result = await commands.reboot();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Rebooting');
    });
  });

  describe('Module exports', () => {
    it('should export all required commands', () => {
      expect(commands.deploy_video).toBeDefined();
      expect(commands.delete_video).toBeDefined();
      expect(commands.update_software).toBeDefined();
      expect(commands.update_config).toBeDefined();
      expect(commands.reboot).toBeDefined();
      expect(commands.restart_service).toBeDefined();
      expect(commands.get_logs).toBeDefined();
      expect(commands.get_system_info).toBeDefined();
      expect(commands.get_config).toBeDefined();
      expect(commands.update_hotspot).toBeDefined();
      expect(commands.get_hotspot_config).toBeDefined();
      expect(commands.fix_hotspot).toBeDefined();
      expect(commands.runManualHotspotDiagnostics).toBeDefined();
    });
  });
});
