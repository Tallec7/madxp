/**
 * Formats image acceptés par POST /api/image-to-video.
 *
 * Doit rester aligné avec `ALLOWED_IMAGE_MIMES` de
 * `central-server/src/middleware/upload.ts` — garde-fou :
 * `smoke-content-incident-2026-08-04.test.ts`.
 *
 * Pourquoi une validation côté client : un fichier rejeté par le `fileFilter`
 * multer l'est APRÈS l'envoi des octets ; la réponse 400 est alors perdue dans
 * un reset de stream HTTP/2 (incident 2026-08-04). Filtrer avant l'envoi donne
 * un message immédiat et exact à l'utilisateur.
 */
export const ALLOWED_IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

/** Valeur de l'attribut `accept` des `<input type="file">` images. */
export const IMAGE_UPLOAD_ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(',');

/** Libellé utilisateur des formats acceptés. */
export const ALLOWED_IMAGE_LABEL = 'JPG, PNG, WEBP ou GIF';

/** Taille max acceptée par multer pour une image (50 Mo). */
export const MAX_IMAGE_UPLOAD_BYTES = 50 * 1024 * 1024;

export function isAllowedImageType(file: File): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.includes(file.type);
}
