/**
 * Safe configuration.json I/O utilities
 *
 * Provides atomic write (tmp + rename) and resilient read (fallback on backup)
 * to prevent configuration corruption from power loss or SD card issues.
 *
 * @see ADR-028 for full rationale
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const logger = require('../logger');

// Per-path serialization queue to avoid concurrent writes racing on the
// same target file. Each entry is the tail Promise of the queue for that
// path; new writes chain onto it via .then(). Cleared once the queue is
// idle so the Map does not grow unbounded.
const writeQueues = new Map();

let tmpCounter = 0;

function buildTmpPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  // Keep `.${base}.tmp` as a stable substring (smoke tests + log greps),
  // but suffix with pid + monotonic counter + 4 random bytes so two
  // concurrent writers (in-process or cross-process) never collide on
  // the same temp file. ENOENT on rename was caused by the previous
  // fixed name being overwritten then renamed-away by a racing call.
  const unique = `${process.pid}.${tmpCounter++}.${crypto.randomBytes(4).toString('hex')}`;
  return path.join(dir, `.${base}.tmp.${unique}`);
}

async function runExclusive(filePath, fn) {
  const key = path.resolve(filePath);
  const prev = writeQueues.get(key) || Promise.resolve();
  // Swallow prior errors so one failed write does not poison the queue.
  const next = prev.catch(() => undefined).then(fn);
  writeQueues.set(key, next);
  try {
    return await next;
  } finally {
    // If we are still the tail (no later write enqueued), drop the entry.
    if (writeQueues.get(key) === next) {
      writeQueues.delete(key);
    }
  }
}

/**
 * Atomically write JSON to a file.
 * Writes to a unique temp file in the same directory, then renames
 * (atomic on Linux). Per-path mutex serializes concurrent callers so
 * no write is silently overwritten before its rename completes.
 *
 * @param {string} filePath - Target file path
 * @param {object} data - JSON-serializable data
 */
async function atomicWriteJson(filePath, data) {
  return runExclusive(filePath, async () => {
    const tmpPath = buildTmpPath(filePath);

    const json = JSON.stringify(data, null, 2);

    // Validate JSON is serializable before writing
    JSON.parse(json);

    try {
      await fs.writeFile(tmpPath, json, 'utf-8');
      await fs.rename(tmpPath, filePath);
    } catch (err) {
      // Best-effort cleanup of leftover tmp on failure (non-fatal).
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
      throw err;
    }
  });
}

/**
 * Sweep stale `.${basename}.tmp.*` files left over by a crashed write
 * (process killed between writeFile and rename). Safe to call at boot.
 *
 * @param {string} filePath - Same path that would be passed to atomicWriteJson
 */
async function cleanupOrphanTmpFiles(filePath) {
  try {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const prefix = `.${base}.tmp`;
    const entries = await fs.readdir(dir);
    await Promise.all(
      entries
        .filter(f => f.startsWith(prefix))
        .map(f => fs.unlink(path.join(dir, f)).catch(() => undefined))
    );
  } catch {
    // Directory missing or unreadable — nothing to clean.
  }
}

/**
 * Safely read and parse configuration.json.
 * If the file is corrupted, attempts auto-recovery from backup.
 * If no backup available, returns empty config.
 *
 * @param {string} configPath - Path to configuration.json
 * @returns {Promise<object>} Parsed configuration
 */
async function safeReadConfig(configPath) {
  if (!(await fs.pathExists(configPath))) {
    return {};
  }

  const content = await fs.readFile(configPath, 'utf-8');

  try {
    return JSON.parse(content);
  } catch (parseError) {
    logger.error('Configuration JSON corrupted, attempting auto-recovery', {
      configPath,
      error: parseError.message,
      fileSize: content.length,
    });

    // Try to recover by truncating at the end of the first valid JSON object
    const recovered = tryTruncateJson(content);
    if (recovered) {
      logger.warn('Configuration recovered by truncating orphan data', {
        originalSize: content.length,
        recoveredSize: JSON.stringify(recovered, null, 2).length,
      });
      // Write back the repaired config atomically
      await atomicWriteJson(configPath, recovered);
      return recovered;
    }

    // Try to restore from encrypted backup
    const backupConfig = await tryRestoreFromBackup(configPath);
    if (backupConfig) {
      logger.warn('Configuration restored from backup', { configPath });
      await atomicWriteJson(configPath, backupConfig);
      return backupConfig;
    }

    // Last resort: return empty config
    logger.error('No backup available, starting with empty configuration');
    return {};
  }
}

/**
 * Try to recover a corrupted JSON file by finding the first complete object.
 * Handles the common case where a partial write appends data after a valid JSON.
 *
 * @param {string} content - Raw file content
 * @returns {object|null} Parsed object or null if unrecoverable
 */
function tryTruncateJson(content) {
  try {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const truncated = content.substring(0, i + 1);
          return JSON.parse(truncated);
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Try to restore configuration from the most recent encrypted backup.
 *
 * @param {string} configPath - Path to configuration.json (used to find backup dir)
 * @returns {Promise<object|null>} Restored config or null
 */
async function tryRestoreFromBackup(configPath) {
  try {
    // Lazy require to avoid circular dependency
    const { config } = require('../config');
    const backupDir = path.join(config.paths.data || '/home/pi/neopro/data', 'backups');

    if (!(await fs.pathExists(backupDir))) {
      return null;
    }

    const files = await fs.readdir(backupDir);
    const backups = files
      .filter(f => f.startsWith('config-') && (f.endsWith('.json.enc') || f.endsWith('.json')))
      .sort()
      .reverse();

    if (backups.length === 0) {
      return null;
    }

    // Try the most recent backup
    const latestBackup = backups[0];
    const backupPath = path.join(backupDir, latestBackup);

    if (latestBackup.endsWith('.enc')) {
      // Need LocalBackupService to decrypt
      const LocalBackupService = require('../tasks/local-backup');
      const backupService = new LocalBackupService.constructor
        ? LocalBackupService
        : require('../tasks/local-backup');

      // If it's a singleton instance, use its decrypt method
      if (backupService._decrypt) {
        const encryptedData = await fs.readFile(backupPath);
        const decryptedData = backupService._decrypt(encryptedData);
        const parsed = JSON.parse(decryptedData.toString('utf8'));
        if (parsed.categories) {
          return parsed;
        }
      }
    } else {
      // Legacy unencrypted backup
      const parsed = await fs.readJson(backupPath);
      if (parsed.categories) {
        return parsed;
      }
    }

    return null;
  } catch (error) {
    logger.error('Failed to restore from backup', { error: error.message });
    return null;
  }
}

module.exports = {
  atomicWriteJson,
  safeReadConfig,
  tryTruncateJson,
  cleanupOrphanTmpFiles,
};
