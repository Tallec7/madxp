/**
 * Normalisation tolérante de filenames vidéo (ADR-083).
 *
 * Permet de matcher un filename de config (potentiellement legacy : espaces,
 * accents, casse différente, séparateurs mixés) avec un filename DB canonique
 * (après upload FTP : snake_case ASCII). Idempotent.
 *
 * Exemples (tous → `03_groupama.mp4`) :
 *   - "03 GROUPAMA.mp4"
 *   - "03_Groupama.mp4"
 *   - "03-groupama.mp4"
 *   - "03.GROUPAMA.mp4"
 *   - "03__GROUPAMA.mp4"
 */
export function normalizeFilename(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[\s\-.]+/g, '_') // spaces, dots, hyphens → underscore
    .replace(/_+/g, '_'); // collapse multiple underscores
}
