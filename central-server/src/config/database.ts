import fs from 'fs';
import path from 'path';
import { Pool, PoolConfig, QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

const loadSslCertificate = () => {
  const inlineCertificate = process.env.DATABASE_SSL_CA?.trim();
  if (inlineCertificate) {
    return inlineCertificate;
  }

  const certificatePath = process.env.DATABASE_SSL_CA_FILE || process.env.DATABASE_SSL_CA_PATH;
  if (!certificatePath) return undefined;

  const resolvedPath = path.resolve(certificatePath);
  try {
    const certificate = fs.readFileSync(resolvedPath, 'utf8');
    logger.debug('Loaded DATABASE_SSL_CA from file', { path: resolvedPath });
    return certificate;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    logger.error('Failed to read DATABASE_SSL_CA file', {
      path: resolvedPath,
      error: err.message,
    });
    throw err;
  }
};

const shouldUseSSL =
  process.env.NODE_ENV === 'production' ||
  (process.env.DATABASE_SSL || '').toLowerCase() === 'true';

const sslCertificate = shouldUseSSL ? loadSslCertificate() : undefined;

// SECURITY: We intentionally do NOT set NODE_TLS_REJECT_UNAUTHORIZED=0 as it would
// disable TLS verification globally for ALL connections (HTTP clients, etc.)
// Instead, we configure rejectUnauthorized: false only for the pg connection pool.
// This is scoped to PostgreSQL connections only and doesn't affect other TLS connections.
if (process.env.NODE_ENV === 'production' && shouldUseSSL && !sslCertificate) {
  logger.warn('='.repeat(80));
  logger.warn('SECURITY NOTE: DATABASE_SSL_CA not configured.');
  logger.warn('Using rejectUnauthorized: false for PostgreSQL connection ONLY.');
  logger.warn('For better security, provide the Supabase/database CA certificate via:');
  logger.warn('  - DATABASE_SSL_CA (inline certificate)');
  logger.warn('  - DATABASE_SSL_CA_FILE (path to certificate file)');
  logger.warn('='.repeat(80));
}

// Build SSL configuration
const getSslConfig = () => {
  if (!shouldUseSSL) return false;

  if (sslCertificate) {
    return { ca: sslCertificate, rejectUnauthorized: true };
  }

  // For cloud providers (Render, Supabase, Neon, etc.) without explicit CA,
  // rejectUnauthorized: false is required as their certificates are not in the system CA store.
  logger.warn('DATABASE_SSL_CA not set - using rejectUnauthorized: false for cloud provider compatibility');
  return { rejectUnauthorized: false };
};

const sslConfig = getSslConfig();

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

logger.info('Database SSL configuration', {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_SSL: process.env.DATABASE_SSL,
  shouldUseSSL,
  hasCertificate: Boolean(sslCertificate),
  rejectUnauthorized: typeof sslConfig === 'object' ? sslConfig.rejectUnauthorized : false,
});

const pool = new Pool(poolConfig);

pool.on('error', (err: Error) => {
  logger.error('Unexpected database error:', err);
  process.exit(-1);
});

pool.on('connect', () => {
  logger.info('Database connection established');
});

export const query = async <T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Database query error:', { text, error });
    throw error;
  }
};

export const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  const timeout = setTimeout(() => {
    logger.error('Client has been checked out for more than 5 seconds');
  }, 5000);

  client.query = (...args: any[]) => {
    return originalQuery(...args);
  };

  client.release = () => {
    clearTimeout(timeout);
    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease();
  };

  return client;
};

export default pool;
