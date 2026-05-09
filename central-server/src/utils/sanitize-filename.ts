import path from 'path';

/**
 * Sanitize un nom de fichier pour le stockage et la config.
 *
 * Règles (alignées sur le sanitize du Pi à l'upload) :
 *  - Décompose les caractères Unicode (NFD) → supprime les diacritiques (accents)
 *  - Espaces (1+) → '_'
 *  - Tout caractère hors `[a-zA-Z0-9_-]` est supprimé (apostrophes, &, etc.)
 *  - Underscores multiples consécutifs collapsés en un seul
 *  - Longueur max 100 (extension non comptée)
 *  - Extension forcée en lowercase
 *
 * Source de vérité partagée entre :
 *  - `controllers/content.helpers.ts` (upload pipeline — sanitize au stockage FTP)
 *  - `utils/config-video-paths.ts` (defense-in-depth — sanitize avant émission au Pi)
 *
 * Garde les deux alignés : un filename uploadé ET le path écrit dans
 * `config_profiles.configuration` doivent produire le MÊME résultat.
 */
export function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  const sanitized = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .substring(0, 100);

  return sanitized + ext.toLowerCase();
}
