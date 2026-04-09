/**
 * Fonctions utilitaires pour la gestion de la configuration vidéo :
 * extraction de chemins, noms d'affichage, MIME types, verrouillage NEOPRO.
 */

const path = require('path');

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

module.exports = {
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
