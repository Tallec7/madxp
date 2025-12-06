import { Pool, PoolConfig, QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

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

  // Render PostgreSQL uses self-signed certificates
  // Allow self-signed certs when DATABASE_SSL_REJECT_UNAUTHORIZED is explicitly set to 'false'
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';

  if (process.env.NODE_ENV === 'production' && rejectUnauthorized) {
    logger.warn('DATABASE_SSL_CA not set in production - set DATABASE_SSL_REJECT_UNAUTHORIZED=false for Render PostgreSQL');
  }

  return { rejectUnauthorized };
};

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: getSslConfig(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

logger.info('Database SSL configuration', {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_SSL: process.env.DATABASE_SSL,
  shouldUseSSL,
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
