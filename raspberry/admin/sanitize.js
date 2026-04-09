/**
 * Fonctions d'assainissement de noms de fichiers et segments de chemin.
 */

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

module.exports = {
  sanitizeSegment,
  sanitizeFilename,
};
