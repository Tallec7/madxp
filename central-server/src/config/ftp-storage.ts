import * as ftp from 'basic-ftp';
import { Readable } from 'stream';
import logger from './logger';

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

const createFtpClient = async (): Promise<ftp.Client> => {
  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  await client.access({
    host: ftpConfig.host,
    port: ftpConfig.port,
    user: ftpConfig.user,
    password: ftpConfig.password,
    secure: ftpConfig.secure,
  });

  return client;
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

    // Upload du fichier à la racine (le compte FTP est déjà dans /neopro-video)
    await client.uploadFrom(stream, filename);

    const url = getFtpPublicUrl(filename);
    logger.info('File uploaded to FTP successfully:', { filename, url });

    return { path: filename, url };
  } catch (error) {
    logger.error('Error uploading file to FTP:', error);
    return null;
  } finally {
    client.close();
  }
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

    await client.remove(filename);
    logger.info('File deleted from FTP:', { filename });
    return true;
  } catch (error) {
    logger.error('Error deleting file from FTP:', error);
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
    await client.uploadFrom(stream, filename);

    const url = getFtpUpdatePublicUrl(filename);
    logger.info('Update file uploaded to FTP successfully:', { filename, url });

    return { path: filename, url };
  } catch (error) {
    logger.error('Error uploading update file to FTP:', error);
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

    await client.remove(filename);
    logger.info('Update file deleted from FTP:', { filename });
    return true;
  } catch (error) {
    logger.error('Error deleting update file from FTP:', error);
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
