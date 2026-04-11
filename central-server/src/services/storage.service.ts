/**
 * Storage Service — Single source of truth for all file storage operations.
 *
 * Neopro uses FTP (Hostinger) as the sole storage backend.
 * This service wraps `ftp-storage.ts` and provides a clean API for all
 * controllers and services that need to upload, download, or delete files.
 *
 * @see docs/technical/VIDEO_STORAGE.md
 */

import {
  isFtpConfigured,
  isFtpUpdateConfigured,
  getFtpPublicUrl,
  getFtpUpdatePublicUrl,
  uploadFileToFtp,
  uploadFileToFtpWithVerification,
  uploadFileToFtpFromDiskWithVerification,
  deleteFileFromFtp,
  uploadUpdateToFtpWithVerification,
  deleteUpdateFromFtp,
  verifyFtpFileExists,
  listFtpDirectory,
} from '../config/ftp-storage';
export type { FtpFileInfo } from '../config/ftp-storage';
import logger from '../config/logger';

// =============================================================================
// CONFIGURATION GUARD
// =============================================================================

/** Return type for verified uploads (videos and updates). */
export interface VerifiedUploadResult {
  path: string;
  url: string;
  verified: boolean;
  actualSize: number | null;
}

/** Return type for simple uploads (assets, reports). */
export interface SimpleUploadResult {
  path: string;
  url: string;
}

/**
 * Throws a descriptive error if FTP is not configured.
 * Called internally by every public function — FTP is mandatory in production.
 */
const ensureVideoStorageConfigured = (): void => {
  if (!isFtpConfigured()) {
    throw new Error(
      'FTP storage not configured. Set FTP_HOST, FTP_USER, FTP_PASSWORD, and FTP_PUBLIC_URL environment variables.'
    );
  }
};

/**
 * Throws a descriptive error if FTP update storage is not configured.
 */
const ensureUpdateStorageConfigured = (): void => {
  if (!isFtpUpdateConfigured()) {
    throw new Error(
      'FTP update storage not configured. Set FTP_UPDATE_HOST, FTP_UPDATE_USER, FTP_UPDATE_PASSWORD, and FTP_UPDATE_PUBLIC_URL environment variables.'
    );
  }
};

// =============================================================================
// SHARDED PATH HELPERS (ADR-048)
// =============================================================================

/**
 * Build a sharded FTP path for a video file.
 * Uses the first 2 chars of the UUID as shard prefix to limit files per directory.
 * Example: buildShardedVideoPath('ab3f7c2e-1234-...', '.mp4') → 'videos/ab/ab3f7c2e-1234-....mp4'
 */
export const buildShardedVideoPath = (videoUuid: string, ext: string): string => {
  const prefix = videoUuid.substring(0, 2);
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `videos/${prefix}/${videoUuid}${normalizedExt}`;
};

/**
 * Build the FTP path for a video's thumbnail.
 * Stored alongside the video in the same shard directory.
 * Example: buildThumbnailPath('ab3f7c2e-1234-...') → 'videos/ab/ab3f7c2e-1234-....thumb.jpg'
 */
export const buildThumbnailPath = (videoUuid: string): string => {
  const prefix = videoUuid.substring(0, 2);
  return `videos/${prefix}/${videoUuid}.thumb.jpg`;
};

/**
 * Get the public URL for a thumbnail.
 * Returns null if the video has no thumbnail_url in DB.
 */
export const getThumbnailUrl = (thumbnailStoragePath: string): string => {
  ensureVideoStorageConfigured();
  return getFtpPublicUrl(thumbnailStoragePath);
};

// =============================================================================
// VIDEO STORAGE
// =============================================================================

/**
 * Upload a video from a Buffer with post-upload verification.
 * @returns Upload result with path, URL, verification status, and actual size.
 */
export const uploadVideo = async (
  fileBuffer: Buffer,
  filename: string,
  contentType: string
): Promise<VerifiedUploadResult | null> => {
  ensureVideoStorageConfigured();
  return uploadFileToFtpWithVerification(fileBuffer, filename, contentType);
};

/**
 * Upload a video from disk (streaming) with post-upload verification.
 * Preferred for large files — avoids loading the entire file into memory.
 */
export const uploadVideoFromDisk = async (
  filePath: string,
  fileSize: number,
  filename: string,
  contentType: string
): Promise<VerifiedUploadResult | null> => {
  ensureVideoStorageConfigured();
  return uploadFileToFtpFromDiskWithVerification(filePath, fileSize, filename, contentType);
};

/**
 * Delete a video file from FTP storage.
 * @param storagePath The filename or path as stored in the `storage_path` DB column.
 */
export const deleteVideo = async (storagePath: string): Promise<boolean> => {
  ensureVideoStorageConfigured();
  return deleteFileFromFtp(storagePath);
};

/**
 * Generate the public download URL for a video.
 * @param storagePath The filename or path as stored in the `storage_path` DB column.
 */
export const getVideoUrl = (storagePath: string): string => {
  ensureVideoStorageConfigured();
  return getFtpPublicUrl(storagePath);
};

// =============================================================================
// THUMBNAIL STORAGE (ADR-048)
// =============================================================================

/**
 * Upload a thumbnail image to FTP storage.
 * Uses simple upload (no verification) since thumbnails are small files.
 */
export const uploadThumbnail = async (
  fileBuffer: Buffer,
  storagePath: string
): Promise<SimpleUploadResult | null> => {
  ensureVideoStorageConfigured();
  return uploadFileToFtp(fileBuffer, storagePath, 'image/jpeg');
};

/**
 * Delete a thumbnail from FTP storage.
 */
export const deleteThumbnail = async (storagePath: string): Promise<boolean> => {
  ensureVideoStorageConfigured();
  return deleteFileFromFtp(storagePath);
};

// =============================================================================
// SOFTWARE UPDATE STORAGE
// =============================================================================

/**
 * Upload a software update package with post-upload verification.
 */
export const uploadUpdate = async (
  fileBuffer: Buffer,
  filename: string,
  contentType: string
): Promise<VerifiedUploadResult | null> => {
  ensureUpdateStorageConfigured();
  return uploadUpdateToFtpWithVerification(fileBuffer, filename, contentType);
};

/**
 * Delete a software update package from FTP storage.
 */
export const deleteUpdate = async (filename: string): Promise<boolean> => {
  ensureUpdateStorageConfigured();
  return deleteUpdateFromFtp(filename);
};

/**
 * Generate the public download URL for a software update.
 */
export const getUpdateUrl = (filename: string): string => {
  ensureUpdateStorageConfigured();
  return getFtpUpdatePublicUrl(filename);
};

// =============================================================================
// ASSET STORAGE (watermarks, logos, reports)
// =============================================================================

/**
 * Upload an asset (watermark, logo, PDF report) to FTP storage.
 * Uses simple upload (no verification) since assets are small files.
 */
export const uploadAsset = async (
  fileBuffer: Buffer,
  filename: string,
  contentType: string
): Promise<SimpleUploadResult | null> => {
  ensureVideoStorageConfigured();
  return uploadFileToFtp(fileBuffer, filename, contentType);
};

/**
 * Generate the public URL for an asset.
 */
export const getAssetUrl = (storagePath: string): string => {
  ensureVideoStorageConfigured();
  return getFtpPublicUrl(storagePath);
};

// =============================================================================
// DIRECTORY LISTING
// =============================================================================

/**
 * List files in a storage directory (e.g., 'watermarks').
 * Returns file info objects with name, size, and modification date.
 */
export const listAssets = async (directory: string): Promise<import('../config/ftp-storage').FtpFileInfo[]> => {
  ensureVideoStorageConfigured();
  return listFtpDirectory(directory);
};

// =============================================================================
// VERIFICATION
// =============================================================================

/**
 * Verify that a file exists on FTP storage and check its size.
 * @param filename The filename on the FTP server.
 * @param type The FTP server to check ('video' or 'update').
 */
export const verifyFileExists = async (
  filename: string,
  type: 'video' | 'update' = 'video'
): Promise<{ exists: boolean; size: number | null }> => {
  if (type === 'video') {
    ensureVideoStorageConfigured();
  } else {
    ensureUpdateStorageConfigured();
  }
  return verifyFtpFileExists(filename, type);
};

// =============================================================================
// STATUS CHECK
// =============================================================================

/**
 * Check whether FTP video storage is configured.
 * Useful for startup checks and health endpoints.
 */
export const isStorageConfigured = (): boolean => isFtpConfigured();

/**
 * Check whether FTP update storage is configured.
 */
export const isUpdateStorageConfigured = (): boolean => isFtpUpdateConfigured();

/**
 * Log the storage configuration status at startup.
 */
export const logStorageStatus = (): void => {
  if (isFtpConfigured()) {
    logger.info('Storage: FTP video storage configured');
  } else {
    logger.warn('Storage: FTP video storage NOT configured — uploads will fail');
  }

  if (isFtpUpdateConfigured()) {
    logger.info('Storage: FTP update storage configured');
  } else {
    logger.warn('Storage: FTP update storage NOT configured — software updates will fail');
  }
};
