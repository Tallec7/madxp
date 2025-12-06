import { Pool, PoolConfig, QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

// For cloud providers with self-signed certificates, disable Node.js TLS verification
// This is a fallback in case pg's ssl.rejectUnauthorized doesn't work
if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_SSL_CA) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  logger.warn('NODE_TLS_REJECT_UNAUTHORIZED set to 0 for cloud provider compatibility');
}

const shouldUseSSL =
  process.env.NODE_ENV === 'production' ||
  (process.env.DATABASE_SSL || '').toLowerCase() === 'true';

// Build SSL configuration
const getSslConfig = () => {
  if (!shouldUseSSL) return false;

  const ca = process.env.DATABASE_SSL_CA;
  if (ca) {
    return { ca, rejectUnauthorized: true };
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
  sslConfig: typeof sslConfig === 'object' ? JSON.stringify(sslConfig) : sslConfig,
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
