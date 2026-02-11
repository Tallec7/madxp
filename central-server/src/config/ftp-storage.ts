import * as ftp from 'basic-ftp';
import { Readable } from 'stream';
import { stat } from 'fs/promises';
import logger from './logger';

// Lazy import to avoid circular dependency with metrics.service
let metricsServiceInstance: {
  recordFtpOperation: (operation: string, status: string, storageType: string, durationSeconds?: number) => void;
  recordFtpRetry: (operation: string, storageType: string) => void;
  recordFtpUploadBytes: (storageType: string, bytes: number) => void;
} | null = null;
const getMetricsService = () => {
  if (!metricsServiceInstance) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      metricsServiceInstance = require('../services/metrics.service').default;
    } catch {
      // Metrics service not available yet during startup
    }
  }
  return metricsServiceInstance;
};

// Configuration FTP Hostinger pour les vidéos
const ftpConfig = {
  host: process.env.FTP_HOST || '',
  port: parseInt(process.env.FTP_PORT || '21', 10),
  user: process.env.FTP_USER || '',
  password: process.env.FTP_PASSWORD || '',
  secure: process.env.FTP_SECURE === 'true',
};

// Configuration FTP Hostinger pour les mises à jour logicielles
const ftpUpdateConfig = {
  host: process.env.FTP_UPDATE_HOST || '',
  port: parseInt(process.env.FTP_UPDATE_PORT || '21', 10),
  user: process.env.FTP_UPDATE_USER || '',
  password: process.env.FTP_UPDATE_PASSWORD || '',
  secure: process.env.FTP_UPDATE_SECURE === 'true',
};

// URL de base pour les fichiers publics
const publicBaseUrl = process.env.FTP_PUBLIC_URL || '';
const publicUpdateBaseUrl = process.env.FTP_UPDATE_PUBLIC_URL || '';

export const isFtpConfigured = (): boolean => {
  return !!(ftpConfig.host && ftpConfig.user && ftpConfig.password && publicBaseUrl);
};

export const isFtpUpdateConfigured = (): boolean => {
  return !!(ftpUpdateConfig.host && ftpUpdateConfig.user && ftpUpdateConfig.password && publicUpdateBaseUrl);
};

export const getFtpPublicUrl = (filename: string): string => {
  const baseUrl = publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl;
  return `${baseUrl}/${filename}`;
};

export const getFtpUpdatePublicUrl = (filename: string): string => {
  const baseUrl = publicUpdateBaseUrl.endsWith('/') ? publicUpdateBaseUrl.slice(0, -1) : publicUpdateBaseUrl;
  return `${baseUrl}/${filename}`;
};

export const uploadFileToFtp = async (
  fileBuffer: Buffer,
  filename: string,
  _contentType: string
): Promise<{ path: string; url: string } | null> => {
  if (!isFtpConfigured()) {
    logger.error('FTP not configured - check FTP_HOST, FTP_USER, FTP_PASSWORD, and FTP_PUBLIC_URL');
    return null;
  }

  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  try {
    logger.info('Connecting to FTP server:', { host: ftpConfig.host, user: ftpConfig.user });

    await client.access({
      host: ftpConfig.host,
      port: ftpConfig.port,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: ftpConfig.secure,
    });

    logger.info('FTP connected, uploading file:', { filename, size: fileBuffer.length });

    // Convertir le buffer en stream lisible
    const stream = Readable.from(fileBuffer);

    const uploadStart = Date.now();
    // Upload du fichier à la racine (le compte FTP est déjà dans /neopro-video)
    await client.uploadFrom(stream, filename);
    const uploadDuration = (Date.now() - uploadStart) / 1000;

    const url = getFtpPublicUrl(filename);
    logger.info('File uploaded to FTP successfully:', { filename, url });

    getMetricsService()?.recordFtpOperation('upload', 'success', 'video', uploadDuration);
    getMetricsService()?.recordFtpUploadBytes('video', fileBuffer.length);

    return { path: filename, url };
  } catch (error) {
    logger.error('Error uploading file to FTP:', error);
    getMetricsService()?.recordFtpOperation('upload', 'failed', 'video');
    return null;
  } finally {
    client.close();
  }
};

/**
 * Upload un fichier vers FTP en streaming depuis le disque (pas de chargement en mémoire).
 * Utilisé par le disk storage multer pour les fichiers volumineux.
 */
export const uploadFileToFtpFromDisk = async (
  filePath: string,
  filename: string,
  _contentType: string
): Promise<{ path: string; url: string } | null> => {
  if (!isFtpConfigured()) {
    logger.error('FTP not configured - check FTP_HOST, FTP_USER, FTP_PASSWORD, and FTP_PUBLIC_URL');
    return null;
  }

  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  try {
    const fileStats = await stat(filePath);
    logger.info('Connecting to FTP server (streaming):', { host: ftpConfig.host, user: ftpConfig.user });

    await client.access({
      host: ftpConfig.host,
      port: ftpConfig.port,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: ftpConfig.secure,
    });

    logger.info('FTP connected, streaming file from disk:', { filename, size: fileStats.size });

    const uploadStart = Date.now();
    // Stream directement depuis le disque — pas de buffer en mémoire
    await client.uploadFrom(filePath, filename);
    const uploadDuration = (Date.now() - uploadStart) / 1000;

    const url = getFtpPublicUrl(filename);
    logger.info('File streamed to FTP successfully:', { filename, url });

    getMetricsService()?.recordFtpOperation('upload', 'success', 'video', uploadDuration);
    getMetricsService()?.recordFtpUploadBytes('video', fileStats.size);

    return { path: filename, url };
  } catch (error) {
    logger.error('Error streaming file to FTP:', error);
    getMetricsService()?.recordFtpOperation('upload', 'failed', 'video');
    return null;
  } finally {
    client.close();
  }
};

/**
 * Upload un fichier vers FTP depuis le disque avec vérification post-upload.
 * Version streaming de uploadFileToFtpWithVerification.
 */
export const uploadFileToFtpFromDiskWithVerification = async (
  filePath: string,
  fileSize: number,
  filename: string,
  contentType: string,
  maxRetries: number = 3
): Promise<{
  path: string;
  url: string;
  verified: boolean;
  actualSize: number | null;
} | null> => {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    const uploadResult = await uploadFileToFtpFromDisk(filePath, filename, contentType);

    if (!uploadResult) {
      logger.warn('FTP streaming upload failed, retrying...', { filename, attempt, maxRetries });
      if (attempt < maxRetries) {
        getMetricsService()?.recordFtpRetry('upload', 'video');
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return null;
    }

    // Vérifier que le fichier est bien présent et a la bonne taille
    const verification = await verifyFtpFileExists(filename, 'video');

    if (!verification.exists) {
      logger.warn('FTP verification failed: file not found after streaming upload', {
        filename,
        attempt,
        maxRetries,
      });
      getMetricsService()?.recordFtpOperation('verify', 'failed', 'video');
      if (attempt < maxRetries) {
        getMetricsService()?.recordFtpRetry('verify', 'video');
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return {
        ...uploadResult,
        verified: false,
        actualSize: null,
      };
    }

    // Vérifier la taille
    if (verification.size !== null && verification.size !== fileSize) {
      logger.warn('FTP verification failed: size mismatch after streaming upload', {
        filename,
        expected: fileSize,
        actual: verification.size,
        attempt,
        maxRetries,
      });
      getMetricsService()?.recordFtpOperation('verify', 'size_mismatch', 'video');
      if (attempt < maxRetries) {
        getMetricsService()?.recordFtpRetry('verify', 'video');
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return {
        ...uploadResult,
        verified: false,
        actualSize: verification.size,
      };
    }

    getMetricsService()?.recordFtpOperation('verify', 'success', 'video');
    logger.info('FTP streaming upload with verification successful', {
      filename,
      size: verification.size,
      attempts: attempt,
    });

    return {
      ...uploadResult,
      verified: true,
      actualSize: verification.size,
    };
  }

  return null;
};

export const deleteFileFromFtp = async (filename: string): Promise<boolean> => {
  if (!isFtpConfigured()) {
    logger.error('FTP not configured');
    return false;
  }

  const client = new ftp.Client();

  try {
    await client.access({
      host: ftpConfig.host,
      port: ftpConfig.port,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: ftpConfig.secure,
    });

    const deleteStart = Date.now();
    await client.remove(filename);
    const deleteDuration = (Date.now() - deleteStart) / 1000;
    logger.info('File deleted from FTP:', { filename });
    getMetricsService()?.recordFtpOperation('delete', 'success', 'video', deleteDuration);
    return true;
  } catch (error) {
    logger.error('Error deleting file from FTP:', error);
    getMetricsService()?.recordFtpOperation('delete', 'failed', 'video');
    return false;
  } finally {
    client.close();
  }
};

// Upload de mise à jour logicielle vers FTP dédié
export const uploadUpdateToFtp = async (
  fileBuffer: Buffer,
  filename: string,
  _contentType: string
): Promise<{ path: string; url: string } | null> => {
  if (!isFtpUpdateConfigured()) {
    logger.error('FTP Update not configured - check FTP_UPDATE_HOST, FTP_UPDATE_USER, FTP_UPDATE_PASSWORD, and FTP_UPDATE_PUBLIC_URL');
    return null;
  }

  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  try {
    logger.info('Connecting to FTP Update server:', { host: ftpUpdateConfig.host, user: ftpUpdateConfig.user });

    await client.access({
      host: ftpUpdateConfig.host,
      port: ftpUpdateConfig.port,
      user: ftpUpdateConfig.user,
      password: ftpUpdateConfig.password,
      secure: ftpUpdateConfig.secure,
    });

    logger.info('FTP Update connected, uploading file:', { filename, size: fileBuffer.length });

    const stream = Readable.from(fileBuffer);
    const uploadStart = Date.now();
    await client.uploadFrom(stream, filename);
    const uploadDuration = (Date.now() - uploadStart) / 1000;

    const url = getFtpUpdatePublicUrl(filename);
    logger.info('Update file uploaded to FTP successfully:', { filename, url });

    getMetricsService()?.recordFtpOperation('upload', 'success', 'update', uploadDuration);
    getMetricsService()?.recordFtpUploadBytes('update', fileBuffer.length);

    return { path: filename, url };
  } catch (error) {
    logger.error('Error uploading update file to FTP:', error);
    getMetricsService()?.recordFtpOperation('upload', 'failed', 'update');
    return null;
  } finally {
    client.close();
  }
};

// Suppression de mise à jour depuis FTP
export const deleteUpdateFromFtp = async (filename: string): Promise<boolean> => {
  if (!isFtpUpdateConfigured()) {
    logger.error('FTP Update not configured');
    return false;
  }

  const client = new ftp.Client();

  try {
    await client.access({
      host: ftpUpdateConfig.host,
      port: ftpUpdateConfig.port,
      user: ftpUpdateConfig.user,
      password: ftpUpdateConfig.password,
      secure: ftpUpdateConfig.secure,
    });

    const deleteStart = Date.now();
    await client.remove(filename);
    const deleteDuration = (Date.now() - deleteStart) / 1000;
    logger.info('Update file deleted from FTP:', { filename });
    getMetricsService()?.recordFtpOperation('delete', 'success', 'update', deleteDuration);
    return true;
  } catch (error) {
    logger.error('Error deleting update file from FTP:', error);
    getMetricsService()?.recordFtpOperation('delete', 'failed', 'update');
    return false;
  } finally {
    client.close();
  }
};

export const testFtpConnection = async (): Promise<boolean> => {
  if (!isFtpConfigured()) {
    logger.warn('FTP not configured - skipping connection test');
    return false;
  }

  const client = new ftp.Client();

  try {
    await client.access({
      host: ftpConfig.host,
      port: ftpConfig.port,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: ftpConfig.secure,
    });

    const list = await client.list();
    logger.info('FTP connection test successful:', {
      host: ftpConfig.host,
      filesInDirectory: list.length
    });
    return true;
  } catch (error) {
    logger.error('FTP connection test failed:', error);
    return false;
  } finally {
    client.close();
  }
};

/**
 * Vérifie qu'un fichier existe sur le FTP et retourne sa taille
 * Utilisé pour vérifier que l'upload est terminé avant déploiement
 */
export const verifyFtpFileExists = async (
  filename: string,
  config: 'video' | 'update' = 'video'
): Promise<{ exists: boolean; size: number | null; error?: string }> => {
  const ftpCfg = config === 'update' ? ftpUpdateConfig : ftpConfig;
  const isConfigured = config === 'update' ? isFtpUpdateConfigured() : isFtpConfigured();

  if (!isConfigured) {
    return { exists: false, size: null, error: 'FTP not configured' };
  }

  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  try {
    await client.access({
      host: ftpCfg.host,
      port: ftpCfg.port,
      user: ftpCfg.user,
      password: ftpCfg.password,
      secure: ftpCfg.secure,
    });

    // Lister les fichiers pour trouver celui qu'on cherche
    const verifyStart = Date.now();
    const list = await client.list();
    const file = list.find(f => f.name === filename);
    const verifyDuration = (Date.now() - verifyStart) / 1000;

    if (!file) {
      getMetricsService()?.recordFtpOperation('verify', 'not_found', config, verifyDuration);
      return { exists: false, size: null, error: 'File not found on FTP' };
    }

    logger.info('FTP file verification successful:', {
      filename,
      size: file.size,
      modifiedAt: file.modifiedAt,
    });

    getMetricsService()?.recordFtpOperation('verify', 'success', config, verifyDuration);
    return { exists: true, size: file.size };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown FTP error';
    logger.error('FTP file verification failed:', { filename, error: errorMessage });
    getMetricsService()?.recordFtpOperation('verify', 'failed', config);
    return { exists: false, size: null, error: errorMessage };
  } finally {
    client.close();
  }
};

/**
 * Upload un fichier vers FTP avec vérification post-upload
 * Retry automatique si la vérification échoue
 */
export const uploadFileToFtpWithVerification = async (
  fileBuffer: Buffer,
  filename: string,
  contentType: string,
  maxRetries: number = 3
): Promise<{
  path: string;
  url: string;
  verified: boolean;
  actualSize: number | null;
} | null> => {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    // Upload le fichier
    const uploadResult = await uploadFileToFtp(fileBuffer, filename, contentType);

    if (!uploadResult) {
      logger.warn('FTP upload failed, retrying...', { filename, attempt, maxRetries });
      if (attempt < maxRetries) {
        getMetricsService()?.recordFtpRetry('upload', 'video');
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return null;
    }

    // Vérifier que le fichier est bien présent et a la bonne taille
    const verification = await verifyFtpFileExists(filename, 'video');

    if (!verification.exists) {
      logger.warn('FTP verification failed: file not found after upload', {
        filename,
        attempt,
        maxRetries,
      });
      getMetricsService()?.recordFtpOperation('verify', 'failed', 'video');
      if (attempt < maxRetries) {
        getMetricsService()?.recordFtpRetry('verify', 'video');
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return {
        ...uploadResult,
        verified: false,
        actualSize: null,
      };
    }

    // Vérifier la taille
    if (verification.size !== null && verification.size !== fileBuffer.length) {
      logger.warn('FTP verification failed: size mismatch', {
        filename,
        expected: fileBuffer.length,
        actual: verification.size,
        attempt,
        maxRetries,
      });
      getMetricsService()?.recordFtpOperation('verify', 'size_mismatch', 'video');
      if (attempt < maxRetries) {
        getMetricsService()?.recordFtpRetry('verify', 'video');
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return {
        ...uploadResult,
        verified: false,
        actualSize: verification.size,
      };
    }

    getMetricsService()?.recordFtpOperation('verify', 'success', 'video');
    logger.info('FTP upload with verification successful', {
      filename,
      size: verification.size,
      attempts: attempt,
    });

    return {
      ...uploadResult,
      verified: true,
      actualSize: verification.size,
    };
  }

  return null;
};

/**
 * Upload une mise à jour vers FTP avec vérification post-upload
 */
export const uploadUpdateToFtpWithVerification = async (
  fileBuffer: Buffer,
  filename: string,
  contentType: string,
  maxRetries: number = 3
): Promise<{
  path: string;
  url: string;
  verified: boolean;
  actualSize: number | null;
} | null> => {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    // Upload le fichier
    const uploadResult = await uploadUpdateToFtp(fileBuffer, filename, contentType);

    if (!uploadResult) {
      logger.warn('FTP update upload failed, retrying...', { filename, attempt, maxRetries });
      if (attempt < maxRetries) {
        getMetricsService()?.recordFtpRetry('upload', 'update');
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return null;
    }

    // Vérifier que le fichier est bien présent et a la bonne taille
    const verification = await verifyFtpFileExists(filename, 'update');

    if (!verification.exists) {
      logger.warn('FTP update verification failed: file not found after upload', {
        filename,
        attempt,
        maxRetries,
      });
      getMetricsService()?.recordFtpOperation('verify', 'failed', 'update');
      if (attempt < maxRetries) {
        getMetricsService()?.recordFtpRetry('verify', 'update');
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return {
        ...uploadResult,
        verified: false,
        actualSize: null,
      };
    }

    // Vérifier la taille
    if (verification.size !== null && verification.size !== fileBuffer.length) {
      logger.warn('FTP update verification failed: size mismatch', {
        filename,
        expected: fileBuffer.length,
        actual: verification.size,
        attempt,
        maxRetries,
      });
      getMetricsService()?.recordFtpOperation('verify', 'size_mismatch', 'update');
      if (attempt < maxRetries) {
        getMetricsService()?.recordFtpRetry('verify', 'update');
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      return {
        ...uploadResult,
        verified: false,
        actualSize: verification.size,
      };
    }

    getMetricsService()?.recordFtpOperation('verify', 'success', 'update');
    logger.info('FTP update upload with verification successful', {
      filename,
      size: verification.size,
      attempts: attempt,
    });

    return {
      ...uploadResult,
      verified: true,
      actualSize: verification.size,
    };
  }

  return null;
};
