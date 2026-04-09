/**
 * Exécution sécurisée de commandes shell pour le serveur admin Neopro.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);

/**
 * Escape a string for safe inclusion in a shell command.
 * Wraps in single quotes and escapes embedded single quotes.
 */
function shellEscape(value) {
  if (!value) return "''";
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

/**
 * Execute a command with array-based arguments (no shell interpolation).
 * Uses child_process.execFile which does NOT spawn a shell, preventing injection.
 * Returns { success, output, error } like execCommand.
 *
 * @param {string} binary - The binary to execute (e.g. 'sudo', 'bash')
 * @param {string[]} args - Array of arguments (NOT interpolated through shell)
 * @param {Object} [options] - execFile options (maxBuffer, timeout, etc.)
 */
async function execFileCommand(binary, args, options = {}) {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  const opts = { maxBuffer: 50 * 1024 * 1024, ...options };

  try {
    const { stdout, stderr } = await execFileAsync(binary, args, opts);
    return { success: true, output: stdout, error: stderr };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Exécuter une commande shell de manière sécurisée.
 * Tente un fallback sans sudo si l'exécution échoue dans un contexte root.
 */
async function execCommand(command) {
  const run = async (cmd) => {
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        maxBuffer: 50 * 1024 * 1024,
      }); // 50MB buffer
      return { success: true, output: stdout, error: stderr };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const result = await run(command);
  const isRoot =
    typeof process.getuid === 'function' && process.getuid() === 0;
  const hasSudo = command.trim().startsWith('sudo ');

  const sudoLikelyBlocked =
    result.success === false &&
    hasSudo &&
    isRoot &&
    result.error &&
    (result.error.includes('no new privileges') ||
      result.error.toLowerCase().includes('sudo: command not found') ||
      result.error.toLowerCase().includes('sudo: permission denied'));

  if (sudoLikelyBlocked) {
    const commandWithoutSudo = command.replace(/^sudo\s+/, '');
    const fallbackResult = await run(commandWithoutSudo);

    if (!fallbackResult.success && fallbackResult.error) {
      fallbackResult.error = `${result.error} | fallback without sudo: ${fallbackResult.error}`;
    }

    return fallbackResult;
  }

  return result;
}

/** S'assurer qu'un dossier existe */
async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

module.exports = {
  shellEscape,
  execFileCommand,
  execCommand,
  ensureDirectory,
};
