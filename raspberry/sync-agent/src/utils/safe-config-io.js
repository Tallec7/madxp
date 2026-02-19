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
const logger = require('../logger');

/**
 * Atomically write JSON to a file.
 * Writes to a temp file in the same directory, then renames (atomic on Linux).
 * This prevents corruption if the Pi loses power mid-write.
 *
 * @param {string} filePath - Target file path
 * @param {object} data - JSON-serializable data
 */
async function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp`);

  const json = JSON.stringify(data, null, 2);

  // Validate JSON is serializable before writing
  JSON.parse(json);

  await fs.writeFile(tmpPath, json, 'utf-8');
  await fs.rename(tmpPath, filePath);
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

module.exports = { atomicWriteJson, safeReadConfig, tryTruncateJson };
