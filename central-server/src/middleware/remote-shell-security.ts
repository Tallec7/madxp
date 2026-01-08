/**
 * Remote Shell Security Middleware
 * Validates shell commands based on user role
 */

import { UserRole } from '../types';
import logger from '../config/logger';

export interface ShellValidationResult {
  valid: boolean;
  reason?: string;
  sanitizedCommand?: string;
}

// Whitelist for operator role - safe diagnostic commands only
export const OPERATOR_WHITELIST: string[] = [
  // File system (read-only)
  'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'file', 'stat',
  // System info
  'df', 'du', 'free', 'uptime', 'hostname', 'uname', 'date', 'whoami', 'pwd', 'id',
  // Process info
  'ps', 'top', 'htop', 'pgrep',
  // Network diagnostics
  'ping', 'ip', 'ss', 'netstat', 'ifconfig', 'traceroute', 'nslookup', 'dig', 'host',
  // Service status (read-only)
  'systemctl status', 'systemctl is-active', 'systemctl is-enabled',
  // Logs
  'journalctl', 'dmesg',
  // Neopro specific
  'pm2 status', 'pm2 list', 'pm2 logs',
];

// Extended whitelist for admin - includes service management
export const ADMIN_EXTENDED_WHITELIST: string[] = [
  ...OPERATOR_WHITELIST,
  // Service management
  'systemctl restart', 'systemctl start', 'systemctl stop',
  // Process management
  'kill', 'pkill',
  // File operations (careful)
  'cp', 'mv', 'mkdir', 'touch',
  // Package info
  'apt list', 'dpkg -l', 'apt-cache',
  // PM2 management
  'pm2 restart', 'pm2 reload', 'pm2 stop', 'pm2 start',
  // Network
  'curl', 'wget',
];

// Blacklist patterns - NEVER allowed, even for super_admin
export const BLACKLIST_PATTERNS: RegExp[] = [
  // Destructive file operations
  /\brm\s+(-[rf]+|--recursive|--force)/i,
  /\brm\s+-[a-z]*r[a-z]*/i,  // rm with r flag anywhere
  /\brmdir\s+--ignore-fail-on-non-empty/i,

  // Disk/filesystem operations
  /\b(mkfs|fdisk|parted|dd\s+if=)/i,
  />\s*\/dev\/(?!null\b)/,  // Write to devices (except /dev/null which is safe)

  // System shutdown (use dedicated commands)
  /\b(shutdown|poweroff|halt|init\s+0)\b/i,

  // User/permission management
  /\b(passwd|useradd|userdel|usermod|groupadd|groupdel)\b/i,
  /\bchmod\s+777\b/,
  /\bchown\s+-R\s+root/i,

  // Remote code execution
  /\bcurl\s+.*\|\s*(ba)?sh/i,
  /\bwget\s+.*\|\s*(ba)?sh/i,
  /\beval\s+/i,
  /`.*`/,  // Backtick execution (but allow single quotes)
  /\$\(.*\)/,  // Command substitution

  // Dangerous redirects
  />\s*\/etc\//,  // Write to /etc
  />\s*\/boot\//,  // Write to /boot
  />\s*\/usr\//,  // Write to /usr

  // Fork bombs and resource exhaustion
  /:\(\)\s*{\s*:\|:&\s*};:/,  // Classic fork bomb
  /\byes\s*\|/i,  // yes pipe

  // History manipulation
  /\bhistory\s+-c/i,
  /\bunset\s+HISTFILE/i,

  // Cron manipulation
  /\bcrontab\s+-[er]/i,

  // SSH keys manipulation
  />\s*~?\/?\.ssh\//i,
  /authorized_keys/i,

  // Environment manipulation with dangerous vars
  /\bexport\s+(PATH|LD_PRELOAD|LD_LIBRARY_PATH)=/i,

  // Sudo with password bypass attempts
  /\bsudo\s+-S/i,
  /\bsudo\s+su\b/i,
  /\bsu\s+-\s*$/i,
];

// Commands that require the full path check (reserved for future use)
// const PATH_SENSITIVE_COMMANDS = ['cat', 'head', 'tail', 'rm', 'cp', 'mv'];

// Allowed paths for file operations
const ALLOWED_PATHS = [
  '/home/pi/neopro/',
  '/var/log/',
  '/tmp/',
];

/**
 * Check if a command starts with any whitelisted command
 */
function matchesWhitelist(command: string, whitelist: string[]): boolean {
  const trimmed = command.trim().toLowerCase();
  return whitelist.some(allowed => {
    const allowedLower = allowed.toLowerCase();
    // Exact match or starts with command + space
    return trimmed === allowedLower || trimmed.startsWith(allowedLower + ' ');
  });
}

// Safe paths where rm -rf is allowed for super_admin
const SAFE_RM_PATHS = ['/tmp/', '/var/tmp/', '/home/pi/neopro/videos/'];

/**
 * Check if rm -rf command only targets safe paths
 */
function isRmOnSafePath(command: string): boolean {
  // Check if this is an rm command with -rf flags
  if (!/\brm\s+(-[rf]+|--recursive|--force)/i.test(command)) {
    return false;
  }

  // Extract all paths from the command
  const pathMatches = command.match(/(?:^|\s)(\/[^\s;|&*]+)/g);
  if (!pathMatches || pathMatches.length === 0) {
    return false; // No explicit path = not safe
  }

  // Check if ALL paths are within safe directories
  return pathMatches.every(match => {
    const path = match.trim();
    return SAFE_RM_PATHS.some(safePath => path.startsWith(safePath));
  });
}

/**
 * Check if a command matches any blacklist pattern
 */
function matchesBlacklist(command: string, role: string): { matched: boolean; pattern?: string } {
  for (const pattern of BLACKLIST_PATTERNS) {
    if (pattern.test(command)) {
      // Exception: allow rm -rf on safe paths for super_admin
      const normalizedRole = role === 'superadmin' ? 'super_admin' : role;
      if (normalizedRole === 'super_admin' && isRmOnSafePath(command)) {
        continue; // Skip this blacklist pattern
      }
      return { matched: true, pattern: pattern.toString() };
    }
  }
  return { matched: false };
}

/**
 * Sanitize command input
 */
function sanitizeCommand(command: string): string {
  // Remove null bytes
  // eslint-disable-next-line no-control-regex
  let sanitized = command.replace(/\x00/g, '');

  // Trim and collapse whitespace
  sanitized = sanitized.trim().replace(/\s+/g, ' ');

  // Limit length
  if (sanitized.length > 2048) {
    sanitized = sanitized.substring(0, 2048);
  }

  return sanitized;
}

/**
 * Check if file paths in command are within allowed directories
 */
function validatePaths(command: string): { valid: boolean; reason?: string } {
  // Extract potential file paths (simplified)
  const pathMatches = command.match(/(?:^|\s)(\/[^\s;|&]+)/g);

  if (!pathMatches) {
    return { valid: true };
  }

  for (const match of pathMatches) {
    const path = match.trim();

    // Skip if it's an option like /dev/null for redirection
    if (path === '/dev/null') continue;

    // Check if path is within allowed directories
    const isAllowed = ALLOWED_PATHS.some(allowed => path.startsWith(allowed));

    // Also allow relative paths and current directory
    const isRelative = !path.startsWith('/') || path.startsWith('./');

    if (!isAllowed && !isRelative && path.startsWith('/')) {
      // Allow read-only access to more paths for certain commands
      const readOnlyPaths = ['/proc/', '/sys/', '/etc/'];
      const cmdStart = command.trim().split(' ')[0];
      const isReadOnlyCmd = ['cat', 'head', 'tail', 'less', 'grep', 'ls', 'stat', 'file'].includes(cmdStart);

      if (isReadOnlyCmd && readOnlyPaths.some(p => path.startsWith(p))) {
        continue;
      }

      return {
        valid: false,
        reason: `Accès au chemin non autorisé: ${path}`
      };
    }
  }

  return { valid: true };
}

/**
 * Main validation function
 */
export function validateShellCommand(
  command: string,
  role: UserRole
): ShellValidationResult {
  // Sanitize first
  const sanitizedCommand = sanitizeCommand(command);

  if (!sanitizedCommand) {
    return { valid: false, reason: 'Commande vide' };
  }

  // Always check blacklist first - applies to all roles
  const blacklistCheck = matchesBlacklist(sanitizedCommand, role);
  if (blacklistCheck.matched) {
    logger.warn('Blocked shell command (blacklist)', {
      command: sanitizedCommand.substring(0, 100),
      role,
      pattern: blacklistCheck.pattern,
    });
    return {
      valid: false,
      reason: 'Commande bloquée pour raisons de sécurité'
    };
  }

  // Check pipes and chaining for potential abuse
  if (sanitizedCommand.includes('|') || sanitizedCommand.includes('&&') || sanitizedCommand.includes(';')) {
    // Allow simple pipes for operator whitelist commands
    const parts = sanitizedCommand.split(/[|;&]+/).map(p => p.trim());

    // For operators, each part of the pipe must be whitelisted
    if (role === 'operator' || role === 'viewer') {
      for (const part of parts) {
        if (!matchesWhitelist(part, OPERATOR_WHITELIST)) {
          return {
            valid: false,
            reason: `Commande "${part.split(' ')[0]}" non autorisée pour votre rôle`,
          };
        }
      }
    }
  }

  // Role-based validation
  const normalizedRole = role === 'superadmin' ? 'super_admin' : role;

  switch (normalizedRole) {
    case 'viewer':
      // Viewers have no shell access
      return {
        valid: false,
        reason: 'Les viewers n\'ont pas accès au terminal distant'
      };

    case 'operator':
      // Strict whitelist
      if (!matchesWhitelist(sanitizedCommand, OPERATOR_WHITELIST)) {
        const cmdName = sanitizedCommand.split(' ')[0];
        return {
          valid: false,
          reason: `Commande "${cmdName}" non autorisée. Commandes disponibles: ls, cat, df, journalctl, ps, ping...`,
        };
      }
      break;

    case 'admin':
      // Extended whitelist
      if (!matchesWhitelist(sanitizedCommand, ADMIN_EXTENDED_WHITELIST)) {
        const cmdName = sanitizedCommand.split(' ')[0];
        return {
          valid: false,
          reason: `Commande "${cmdName}" non autorisée pour les admins`,
        };
      }
      break;

    case 'super_admin':
      // Blacklist only - already checked above
      // Super admins can access any path (no path validation)
      logger.info('Shell command validated', {
        command: sanitizedCommand.substring(0, 100),
        role,
      });
      return {
        valid: true,
        sanitizedCommand,
      };

    case 'advertiser':
    case 'sponsor':
    case 'agency':
      // No shell access for these roles
      return {
        valid: false,
        reason: 'Votre rôle n\'a pas accès au terminal distant',
      };

    default:
      return {
        valid: false,
        reason: 'Rôle non reconnu',
      };
  }

  // Validate paths for commands that access files
  const pathValidation = validatePaths(sanitizedCommand);
  if (!pathValidation.valid) {
    return pathValidation;
  }

  logger.info('Shell command validated', {
    command: sanitizedCommand.substring(0, 100),
    role,
  });

  return {
    valid: true,
    sanitizedCommand,
  };
}

/**
 * Get allowed commands for a role (for UI display)
 */
export function getAllowedCommandsForRole(role: UserRole): string[] {
  const normalizedRole = role === 'superadmin' ? 'super_admin' : role;

  switch (normalizedRole) {
    case 'operator':
      return OPERATOR_WHITELIST;
    case 'admin':
      return ADMIN_EXTENDED_WHITELIST;
    case 'super_admin':
      return ['Toutes les commandes sauf celles de la blacklist de sécurité'];
    default:
      return [];
  }
}

export default {
  validateShellCommand,
  getAllowedCommandsForRole,
  OPERATOR_WHITELIST,
  ADMIN_EXTENDED_WHITELIST,
  BLACKLIST_PATTERNS,
};
