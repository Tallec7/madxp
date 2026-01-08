/**
 * Remote Shell Command Handler
 * Executes shell commands sent from the central dashboard
 *
 * Security: This handler trusts that commands have been validated
 * by the central server's remote-shell-security middleware.
 * It only adds execution-level protections (timeout, output limits).
 */

const { exec, spawn } = require('child_process');
const util = require('util');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

// Execution limits
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1 MB max output
const DEFAULT_TIMEOUT = 60000; // 60 seconds default
const MAX_TIMEOUT = 300000; // 5 minutes max

/**
 * Execute a shell command with timeout and output limits
 *
 * @param {Object} data - Command data
 * @param {string} data.command - The shell command to execute
 * @param {number} [data.timeout=60000] - Timeout in milliseconds
 * @param {string} [data.cwd] - Working directory (defaults to /home/pi/neopro)
 * @returns {Promise<Object>} - { success, stdout, stderr, exitCode, duration, truncated }
 */
async function execute(data) {
  const { command, timeout = DEFAULT_TIMEOUT, cwd } = data;

  if (!command || typeof command !== 'string') {
    throw new Error('Command is required and must be a string');
  }

  const sanitizedCommand = command.trim();
  if (!sanitizedCommand) {
    throw new Error('Command cannot be empty');
  }

  // Enforce timeout limits
  const effectiveTimeout = Math.min(Math.max(timeout, 1000), MAX_TIMEOUT);

  // Default working directory
  const workingDir = cwd || config.paths.root || '/home/pi/neopro';

  logger.info('Executing remote shell command', {
    command: sanitizedCommand.substring(0, 100),
    timeout: effectiveTimeout,
    cwd: workingDir,
  });

  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let exitCode = null;
  let truncated = false;
  let timedOut = false;

  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', sanitizedCommand], {
      cwd: workingDir,
      env: {
        ...process.env,
        // Ensure consistent environment
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOME: '/home/pi',
        USER: 'pi',
        TERM: 'xterm-256color',
        // Disable interactive prompts
        DEBIAN_FRONTEND: 'noninteractive',
      },
      // Run as pi user if we're running as root
      uid: process.getuid() === 0 ? 1000 : undefined,
      gid: process.getgid() === 0 ? 1000 : undefined,
    });

    // Timeout handler
    const timeoutId = setTimeout(() => {
      timedOut = true;
      logger.warn('Command timed out, killing process', {
        command: sanitizedCommand.substring(0, 50),
        timeout: effectiveTimeout,
      });

      // Try graceful termination first
      proc.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 5000);
    }, effectiveTimeout);

    // Collect stdout
    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      if (stdout.length + chunk.length <= MAX_OUTPUT_SIZE) {
        stdout += chunk;
      } else if (!truncated) {
        truncated = true;
        stdout += '\n... [output truncated, exceeded 1MB limit] ...';
      }
    });

    // Collect stderr
    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      if (stderr.length + chunk.length <= MAX_OUTPUT_SIZE) {
        stderr += chunk;
      } else if (!truncated) {
        truncated = true;
        stderr += '\n... [output truncated, exceeded 1MB limit] ...';
      }
    });

    // Handle process completion
    proc.on('close', (code, signal) => {
      clearTimeout(timeoutId);
      exitCode = code;

      const duration = Date.now() - startTime;

      // Log result
      if (timedOut) {
        logger.warn('Remote shell command timed out', {
          command: sanitizedCommand.substring(0, 50),
          duration,
          signal,
        });
      } else if (code !== 0) {
        logger.warn('Remote shell command failed', {
          command: sanitizedCommand.substring(0, 50),
          exitCode: code,
          duration,
          stderr: stderr.substring(0, 200),
        });
      } else {
        logger.info('Remote shell command completed', {
          command: sanitizedCommand.substring(0, 50),
          exitCode: code,
          duration,
          outputLength: stdout.length,
        });
      }

      resolve({
        success: !timedOut && code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: timedOut ? null : code,
        duration,
        truncated,
        timedOut,
        signal: timedOut ? 'SIGTERM' : signal,
      });
    });

    // Handle spawn errors
    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      logger.error('Remote shell command spawn error', {
        command: sanitizedCommand.substring(0, 50),
        error: error.message,
      });

      resolve({
        success: false,
        stdout: '',
        stderr: error.message,
        exitCode: -1,
        duration,
        truncated: false,
        timedOut: false,
        error: error.message,
      });
    });
  });
}

module.exports = {
  execute,
};
