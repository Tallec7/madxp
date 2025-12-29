import * as ftp from 'basic-ftp';
import { Readable } from 'stream';
import logger from './logger';

// Configuration FTP Hostinger
const ftpConfig = {
  host: process.env.FTP_HOST || '',
  port: parseInt(process.env.FTP_PORT || '21', 10),
  user: process.env.FTP_USER || '',
  password: process.env.FTP_PASSWORD || '',
  secure: process.env.FTP_SECURE === 'true',
};

// URL de base pour les fichiers publics
const publicBaseUrl = process.env.FTP_PUBLIC_URL || '';

export const isFtpConfigured = (): boolean => {
  return !!(ftpConfig.host && ftpConfig.user && ftpConfig.password && publicBaseUrl);
};

export const getFtpPublicUrl = (filename: string): string => {
  const baseUrl = publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl;
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
