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

// Pool size configurable via env : DB_POOL_MAX (défaut: 5)
// Supabase Transaction Mode (port 6543) : les connexions PgBouncer sont partagées par
// transaction, pas par session. 5 connexions Node.js suffisent pour des centaines de req/s.
// En Session Mode (port 5432) un restart Railway causait MaxClientsInSessionMode car
// ancien + nouveau process réservaient chacun N connexions permanentes.
// Voir ADR-003 et ADR-015 pour l'historique.
const dbPoolMax = parseInt(process.env.DB_POOL_MAX || '5', 10);

// Detect Supabase pooler mode from DATABASE_URL port
const dbUrl = process.env.DATABASE_URL || '';
const poolerMode = dbUrl.includes(':6543') ? 'transaction' : dbUrl.includes(':5432') ? 'session' : 'direct';

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: Math.min(Math.max(dbPoolMax, 1), 50), // Clamp entre 1 et 50
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

logger.info('Database pool configuration', {
  max: poolConfig.max,
  idleTimeout: poolConfig.idleTimeoutMillis,
  poolerMode,
});

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
  recordDbSize: (totalBytes: number) => void;
  recordDbTableSize: (table: string, totalBytes: number) => void;
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

// Periodic pool health logging (every 5 min) — detects saturation early
const POOL_HEALTH_INTERVAL = 5 * 60 * 1000;
let poolSaturationCount = 0;

setInterval(() => {
  if (typeof poolAny.totalCount !== 'number') return;
  const active = poolAny.totalCount - poolAny.idleCount;
  const total = poolAny.totalCount;
  const max = poolConfig.max ?? 5;
  const utilization = total > 0 ? Math.round((active / max) * 100) : 0;

  if (active >= max) {
    poolSaturationCount++;
    logger.warn('Database pool saturated', {
      active,
      idle: poolAny.idleCount,
      total,
      max,
      utilization: `${utilization}%`,
      saturationCount: poolSaturationCount,
      poolerMode,
    });
  } else if (utilization > 80) {
    logger.warn('Database pool high utilization', {
      active,
      idle: poolAny.idleCount,
      total,
      max,
      utilization: `${utilization}%`,
      poolerMode,
    });
  } else {
    logger.debug('Database pool health', {
      active,
      idle: poolAny.idleCount,
      total,
      max,
      utilization: `${utilization}%`,
      poolerMode,
    });
  }
}, POOL_HEALTH_INTERVAL);

// Periodic DB size monitoring (every 5 min) — detects Supabase quota overruns early
const DB_SIZE_INTERVAL = 5 * 60 * 1000;
const DB_SIZE_TABLES = ['video_plays', 'advertiser_impressions', 'metrics', 'audit_logs', 'remote_commands'];
const DB_SIZE_WARN_BYTES = 400 * 1024 * 1024; // 400 MB — Supabase free tier limit is 500 MB

setInterval(async () => {
  const ms = getMetricsService();
  if (!ms) return;

  try {
    const sizeResult = await pool.query<{ size: string }>(
      `SELECT pg_database_size(current_database())::text AS size`
    );
    const totalBytes = parseInt(sizeResult.rows[0]?.size || '0', 10);
    ms.recordDbSize(totalBytes);

    if (totalBytes > DB_SIZE_WARN_BYTES) {
      logger.warn('Database size approaching Supabase quota', {
        sizeBytes: totalBytes,
        sizeMB: Math.round(totalBytes / (1024 * 1024)),
        quotaMB: 500,
        usagePercent: Math.round((totalBytes / (500 * 1024 * 1024)) * 100),
      });
    }

    // Collect per-table sizes for the top tables
    const tableResult = await pool.query<{ tablename: string; total_bytes: string }>(
      `SELECT tablename, pg_total_relation_size('public.' || tablename)::text AS total_bytes
       FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [DB_SIZE_TABLES]
    );
    for (const row of tableResult.rows) {
      ms.recordDbTableSize(row.tablename, parseInt(row.total_bytes, 10));
    }
  } catch (error) {
    logger.debug('DB size metrics collection failed', { error });
  }
}, DB_SIZE_INTERVAL);

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
