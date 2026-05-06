/**
 * Asset poster service — Template Studio v3 / ADR-110.
 *
 * Generates a JPEG poster (first frame, scaled 320:-1, q=2) from a freshly
 * uploaded WebM and ships it to the same FTP folder under the convention
 * `<basename>.poster.jpg`. The poster URL is then served via the asset
 * library payload so the dashboard modal can render `<img>` instead of N
 * concurrent `<video>` elements (browsers freeze the UI thread when ≥6
 * VP8/VP9 software decoders run in parallel — cf. memory
 * `pi5_gpu_sharedimage_saturation`, applies to dev macOS too).
 *
 * Best-effort by design : if poster generation fails (missing ffmpeg, FTP
 * blip), the underlying WebM upload still succeeds. Callers receive
 * `posterUrl: null` and the frontend falls back to `<video preload="none">`.
 */

import path from 'path';
import logger from '../config/logger';
import { thumbnailService } from './thumbnail.service';
import { uploadAsset, getAssetUrl } from './storage.service';

/**
 * Convention : <storagePath>.webm → <storagePath>.poster.jpg in the same
 * FTP folder. Both the upload path AND the list endpoint derive the poster
 * location from this single function so they cannot drift.
 */
export const posterPathFromWebmPath = (webmStoragePath: string): string => {
  const dir = path.posix.dirname(webmStoragePath);
  const ext = path.posix.extname(webmStoragePath);
  const base = path.posix.basename(webmStoragePath, ext);
  const folder = dir === '.' ? '' : `${dir}/`;
  return `${folder}${base}.poster.jpg`;
};

/**
 * Same convention applied to the public URL form (used by the list endpoint
 * to derive a poster URL when the cache is cold but we still want to point
 * the frontend at a probable poster — caller MUST validate it actually
 * exists if it cares about 404s).
 */
export const posterUrlFromWebmUrl = (webmUrl: string): string => {
  const lastSlash = webmUrl.lastIndexOf('/');
  const dir = lastSlash >= 0 ? webmUrl.slice(0, lastSlash + 1) : '';
  const filename = lastSlash >= 0 ? webmUrl.slice(lastSlash + 1) : webmUrl;
  const lastDot = filename.lastIndexOf('.');
  const base = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  return `${dir}${base}.poster.jpg`;
};

/**
 * Generate a JPEG poster (first frame) from the local WebM and upload it
 * to FTP at <storagePath>.poster.jpg. Returns the public URL on success or
 * null on any failure (logged at error level — never throws).
 */
export const generateAndUploadPoster = async (
  localWebmPath: string,
  webmStoragePath: string,
): Promise<string | null> => {
  try {
    const buffer = await thumbnailService.generateThumbnailBuffer(localWebmPath, 0);
    if (!buffer) {
      logger.warn('Asset poster generation returned null buffer', {
        webmStoragePath,
      });
      return null;
    }
    const posterPath = posterPathFromWebmPath(webmStoragePath);
    const result = await uploadAsset(buffer, posterPath, 'image/jpeg');
    if (!result) {
      logger.error('Asset poster upload to FTP failed', { posterPath });
      return null;
    }
    const url = getAssetUrl(posterPath);
    logger.info('Asset poster generated', {
      webmStoragePath,
      posterUrl: url,
      sizeBytes: buffer.length,
    });
    return url;
  } catch (error) {
    logger.error('Asset poster generation failed', {
      webmStoragePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};
