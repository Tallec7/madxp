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

// Pool size configurable via env : DB_POOL_MAX (défaut: 10 en prod, 5 en hobby)
// Railway Hobby : 5 | Railway Pro / Render Standard : 15-20
const dbPoolMax = parseInt(process.env.DB_POOL_MAX || '10', 10);

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: Math.min(Math.max(dbPoolMax, 1), 50), // Clamp entre 1 et 50
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

logger.info('Database pool configuration', { max: poolConfig.max, idleTimeout: poolConfig.idleTimeoutMillis });

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

// Lazy import to avoid circular dependency with metrics.service
let metricsServiceInstance: {
  recordDbQuery: (operation: string, durationSeconds: number) => void;
  recordDbConnections: (active: number, idle: number) => void;
} | null = null;
const getMetricsService = () => {
  if (!metricsServiceInstance) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      metricsServiceInstance = require('../services/metrics.service').default;
    } catch {
      // Metrics service not available yet during startup
    }
  }
  return metricsServiceInstance;
};

// Track DB connection pool metrics on pool events
// pg Pool exposes totalCount/idleCount at runtime but @types/pg doesn't declare them
const poolAny = pool as unknown as { totalCount: number; idleCount: number; on: (event: string, cb: () => void) => void };
const updatePoolMetrics = () => {
  const ms = getMetricsService();
  if (ms && typeof poolAny.totalCount === 'number') {
    ms.recordDbConnections(poolAny.totalCount - poolAny.idleCount, poolAny.idleCount);
  }
};

poolAny.on('acquire', updatePoolMetrics);
poolAny.on('release', updatePoolMetrics);

export const query = async <T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: result.rowCount });

    // Record DB query metrics
    const operation = text.trim().split(/\s+/)[0]?.toUpperCase() || 'UNKNOWN';
    getMetricsService()?.recordDbQuery(operation, duration / 1000);

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
