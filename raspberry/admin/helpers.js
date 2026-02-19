/**
 * Helpers partagés pour le serveur admin Neopro
 *
 * Fonctions utilitaires : exécution de commandes shell, assainissement de noms,
 * parsing disque, formatage, gestion de configuration vidéo.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fsCore = require('fs');
const fs = fsCore.promises;
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// =============================================================================
// PATHS & CONFIG
// =============================================================================

const DEFAULT_NEOPRO_DIR = path.resolve(__dirname, '..');
const NEOPRO_DIR = process.env.NEOPRO_DIR || DEFAULT_NEOPRO_DIR;
const VIDEOS_DIR = path.join(NEOPRO_DIR, 'videos');
const TEMP_UPLOAD_DIR = path.join(NEOPRO_DIR, 'uploads-temp');
const PROCESSING_DIR = path.join(NEOPRO_DIR, 'videos-processing');
const THUMBNAILS_DIR = path.join(NEOPRO_DIR, 'thumbnails');
const LOGS_DIR = path.join(NEOPRO_DIR, 'logs');
const VERSION_FILE = path.join(NEOPRO_DIR, 'VERSION');
const RELEASE_METADATA_FILE = path.join(NEOPRO_DIR, 'release.json');
const VIDEO_COMPRESSION_ENABLED = process.env.VIDEO_COMPRESSION !== 'false';
const VIDEO_THUMBNAILS_ENABLED = process.env.VIDEO_THUMBNAILS !== 'false';
const CONFIG_JSON_INDENT = 4;

// Single source of truth: webapp/configuration.json
const CONFIG_FILE_CANDIDATES = [
  process.env.CONFIG_PATH,
  path.join(NEOPRO_DIR, 'webapp', 'configuration.json'),
].filter((value, index, self) => value && self.indexOf(value) === index);

// =============================================================================
// SHELL EXECUTION
// =============================================================================

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

// =============================================================================
// FILESYSTEM
// =============================================================================

/** S'assurer qu'un dossier existe */
async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

// =============================================================================
// SANITISATION
// =============================================================================

function sanitizeSegment(value, fallback) {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase();
}

function sanitizeFilename(value, fallback) {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const cleaned = trimmed
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
  return cleaned || fallback;
}

// =============================================================================
// FORMATTING
// =============================================================================

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}j`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(' ');
}

function parseDiskInfo(output) {
  const parts = output.split(/\s+/);
  return {
    total: parts[1],
    used: parts[2],
    available: parts[3],
    percent: parts[4],
  };
}

// =============================================================================
// VIDEO CONFIG HELPERS
// =============================================================================

function extractPathSegments(videoPath) {
  if (!videoPath) return null;
  const normalized = videoPath.replace(/\\/g, '/');
  const withoutPrefix = normalized.startsWith('videos/')
    ? normalized.slice('videos/'.length)
    : normalized;

  const segments = withoutPrefix.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  return {
    category: segments[0],
    subcategory: segments.length > 1 ? segments[1] : null,
  };
}

function buildDisplayNameFromFilename(filename) {
  const baseName = path.basename(filename, path.extname(filename));
  return baseName.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveDisplayName(filename, providedName) {
  const fallback = buildDisplayNameFromFilename(filename);
  const cleaned = (providedName || '').trim();
  return cleaned || fallback || filename;
}

function guessMimeFromExtension(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  switch (ext) {
    case '.mkv':
      return 'video/x-matroska';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    default:
      return 'video/mp4';
  }
}

function createVideoEntry(filename, relativePath, mimeType, displayName) {
  const resolvedName = resolveDisplayName(filename, displayName);
  return {
    name: resolvedName,
    path: relativePath,
    type: mimeType || 'video/mp4',
  };
}

/**
 * Vérifie si un élément est verrouillé (contenu NEOPRO)
 */
function isLocked(item) {
  return item && (item.locked === true || item.owner === 'neopro');
}

/**
 * Vérifie si une catégorie peut être modifiée
 */
function canModifyCategory(category) {
  if (isLocked(category)) {
    return {
      allowed: false,
      reason:
        'Cette catégorie est gérée par NEOPRO et ne peut pas être modifiée.',
    };
  }
  return { allowed: true };
}

/**
 * Vérifie si une vidéo peut être modifiée/supprimée
 */
function canModifyVideo(video, category, subcategory = null) {
  if (isLocked(video)) {
    return {
      allowed: false,
      reason:
        'Cette vidéo est gérée par NEOPRO et ne peut pas être modifiée.',
    };
  }
  if (isLocked(category)) {
    return {
      allowed: false,
      reason:
        'Cette vidéo appartient à une catégorie NEOPRO et ne peut pas être modifiée.',
    };
  }
  if (subcategory && isLocked(subcategory)) {
    return {
      allowed: false,
      reason:
        'Cette vidéo appartient à une sous-catégorie NEOPRO et ne peut pas être modifiée.',
    };
  }
  return { allowed: true };
}

function findInConfig(config, categoryId, subcategoryId = null, videoPath = null) {
  const category = (config.categories || []).find(
    (c) => c.id === categoryId || c.name === categoryId
  );
  if (!category) return { category: null };

  let subcategory = null;
  if (subcategoryId) {
    subcategory = (category.subCategories || []).find(
      (s) => s.id === subcategoryId || s.name === subcategoryId
    );
  }

  let video = null;
  if (videoPath) {
    const normalizedPath = videoPath.replace(/\\/g, '/');
    if (subcategory) {
      video = (subcategory.videos || []).find(
        (v) => v.path && v.path.replace(/\\/g, '/') === normalizedPath
      );
    } else {
      video = (category.videos || []).find(
        (v) => v.path && v.path.replace(/\\/g, '/') === normalizedPath
      );
    }
  }

  return { category, subcategory, video };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Paths
  NEOPRO_DIR,
  VIDEOS_DIR,
  TEMP_UPLOAD_DIR,
  PROCESSING_DIR,
  THUMBNAILS_DIR,
  LOGS_DIR,
  VERSION_FILE,
  RELEASE_METADATA_FILE,
  VIDEO_COMPRESSION_ENABLED,
  VIDEO_THUMBNAILS_ENABLED,
  CONFIG_FILE_CANDIDATES,
  CONFIG_JSON_INDENT,
  // Functions
  shellEscape,
  execFileCommand,
  execCommand,
  ensureDirectory,
  sanitizeSegment,
  sanitizeFilename,
  formatUptime,
  parseDiskInfo,
  extractPathSegments,
  buildDisplayNameFromFilename,
  resolveDisplayName,
  guessMimeFromExtension,
  createVideoEntry,
  isLocked,
  canModifyCategory,
  canModifyVideo,
  findInConfig,
};
