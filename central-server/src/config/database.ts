import fs from 'fs';
import path from 'path';
import { Pool, PoolConfig, QueryResultRow } from 'pg';
import { setTypeParser } from 'pg-types';
import dotenv from 'dotenv';
import logger from './logger';

// PostgreSQL BIGINT (OID 20) is returned as string by default because JS Number
// cannot represent the full int8 range. Our BIGINT columns (file_size, duration)
// are well within safe integer range, so parse them as numbers for the frontend.
setTypeParser(20, (val: string) => {
  const n = parseInt(val, 10);
  return Number.isSafeInteger(n) ? n : val; // Keep string if exceeds safe range
});

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
  logger.warn('For better security, provide the database CA certificate via:');
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

  // For cloud providers (Railway, Neon, etc.) without explicit CA,
  // rejectUnauthorized: false is required as their certificates are not in the system CA store.
  logger.warn('DATABASE_SSL_CA not set - using rejectUnauthorized: false for cloud provider compatibility');
  return { rejectUnauthorized: false };
};

const sslConfig = getSslConfig();

// Pool size configurable via env : DB_POOL_MAX (défaut: 10)
// Railway PgBouncer Transaction Mode (port 6543) : les connexions sont partagées par
// transaction, pas par session. 10 connexions Node.js assurent une marge suffisante
// pour absorber les pics (background services + user requests simultanées).
// En Session Mode (port 5432) un restart Railway causait MaxClientsInSessionMode car
// ancien + nouveau process réservaient chacun N connexions permanentes.
// Voir ADR-003, ADR-015 et ADR-070 pour l'historique (migration Supabase → Railway).
const dbPoolMax = parseInt(process.env.DB_POOL_MAX || '10', 10);

// Statement timeout kills queries that hang too long (e.g. when PgBouncer is overloaded).
// Must be shorter than connectionTimeoutMillis to release pool slots before new connections timeout.
const statementTimeoutMs = parseInt(process.env.DB_STATEMENT_TIMEOUT || '8000', 10);

// Detect PgBouncer pooler mode from DATABASE_URL port (Railway / managed PG)
const dbUrl = process.env.DATABASE_URL || '';
const poolerMode = dbUrl.includes(':6543') ? 'transaction' : dbUrl.includes(':5432') ? 'session' : 'direct';

// Guard ADR-070 : refuser de démarrer si DATABASE_URL pointe encore sur l'ancienne
// instance Supabase orpheline. Sans ça, le serveur boot silencieusement contre des
// données gelées (ou timeout) et provoque des faux diagnostics (cf. issue #863).
if (dbUrl.includes('supabase.co')) {
  const message =
    'DATABASE_URL pointe sur l\'ancienne instance Supabase (ADR-070). ' +
    'Bascule via `./scripts/use-prod-db.sh` ou met à jour central-server/.env ' +
    'avec l\'URL Railway. Voir issue #863.';
  logger.error(message, { dbUrlHost: dbUrl.replace(/:[^@]*@/, ':***@') });
  throw new Error(message);
}

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
  statementTimeout: statementTimeoutMs,
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

// Track consecutive idle-client errors to distinguish transient PgBouncer
// disconnects (normal with PgBouncer Transaction Mode) from permanent failures.
let poolErrorCount = 0;
let poolErrorResetTimer: ReturnType<typeof setTimeout> | null = null;
const POOL_ERROR_THRESHOLD = 5;     // exit after 5 errors …
const POOL_ERROR_WINDOW_MS = 30000; // … within 30 seconds

pool.on('error', (err: Error) => {
  poolErrorCount++;
  logger.error('Database pool idle-client error', {
    message: err.message,
    consecutiveErrors: poolErrorCount,
    threshold: POOL_ERROR_THRESHOLD,
  });

  // Record Prometheus metric (lazy import to avoid circular dep)
  getMetricsService()?.recordDbPoolError();

  // Reset counter after the window — transient errors are expected
  if (poolErrorResetTimer) clearTimeout(poolErrorResetTimer);
  poolErrorResetTimer = setTimeout(() => {
    poolErrorCount = 0;
  }, POOL_ERROR_WINDOW_MS);

  // Only crash if errors keep coming — indicates a permanent issue
  if (poolErrorCount >= POOL_ERROR_THRESHOLD) {
    logger.error('Too many consecutive database pool errors — exiting', {
      count: poolErrorCount,
      windowMs: POOL_ERROR_WINDOW_MS,
    });
    process.exit(-1);
  }
});

// @types/pg declares connect callback as () => void, but at runtime pg passes the Client.
// Use the untyped poolAny binding to set statement_timeout on every new connection.
// Kill hung queries before they block the pool — prevents death spiral when PgBouncer is slow.
(pool as unknown as { on: (event: string, cb: (client: { query: (text: string) => Promise<unknown> }) => void) => void })
  .on('connect', (client) => {
    client.query(`SET statement_timeout = ${statementTimeoutMs}`).catch((err: unknown) => {
      logger.warn('Failed to set statement_timeout on new connection', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    logger.info('Database connection established');
  });

// Lazy import to avoid circular dependency with metrics.service
let metricsServiceInstance: {
  recordDbQuery: (operation: string, durationSeconds: number) => void;
  recordDbConnections: (active: number, idle: number) => void;
  recordDbSize: (totalBytes: number) => void;
  recordDbTableSize: (table: string, totalBytes: number) => void;
  recordDbPoolError: () => void;
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

// Periodic DB size monitoring (every 5 min) — detects DB growth anomalies early
const DB_SIZE_INTERVAL = 5 * 60 * 1000;
const DB_SIZE_TABLES = ['video_plays', 'metrics', 'audit_logs', 'remote_commands'];
// 400 MB warn threshold — historiquement aligné sur Supabase Free (500 MB), conservé sur
// Railway comme alarme de croissance (la quota Railway est plus élevée mais l'objectif
// reste de détecter une hausse anormale qui annonce un bug d'agrégation).
const DB_SIZE_WARN_BYTES = 400 * 1024 * 1024;

setInterval(async () => {
  const ms = getMetricsService();
  if (!ms) return;

  // Skip DB size check if circuit breaker is open (lazy import to avoid circular dep)
  try {
    const { dbCircuitBreaker } = await import('../services/db-circuit-breaker.service');
    if (!dbCircuitBreaker.isAvailable()) return;
  } catch {
    // Circuit breaker not available yet during startup — proceed normally
  }

  try {
    const sizeResult = await pool.query<{ size: string }>(
      `SELECT pg_database_size(current_database())::text AS size`
    );
    const totalBytes = parseInt(sizeResult.rows[0]?.size || '0', 10);
    ms.recordDbSize(totalBytes);

    if (totalBytes > DB_SIZE_WARN_BYTES) {
      logger.warn('Database size growth alarm', {
        sizeBytes: totalBytes,
        sizeMB: Math.round(totalBytes / (1024 * 1024)),
        warnThresholdMB: Math.round(DB_SIZE_WARN_BYTES / (1024 * 1024)),
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

// Lazy reference to circuit breaker (avoids circular dep with services/)
let circuitBreakerInstance: { recordSuccess: () => void; recordFailure: (e?: Error) => void } | null = null;
const getCircuitBreaker = async () => {
  if (!circuitBreakerInstance) {
    try {
      const mod = await import('../services/db-circuit-breaker.service');
      circuitBreakerInstance = mod.dbCircuitBreaker;
    } catch {
      // Not available yet during startup
    }
  }
  return circuitBreakerInstance;
};

export const query = async <T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: result.rowCount });

    // Record DB query metrics
    const operation = text.trim().split(/\s+/)[0]?.toUpperCase() || 'UNKNOWN';
    getMetricsService()?.recordDbQuery(operation, duration / 1000);

    // Notify circuit breaker of success
    (await getCircuitBreaker())?.recordSuccess();

    return result;
  } catch (error) {
    // Notify circuit breaker of failure (connection timeouts, statement timeouts, etc.)
    (await getCircuitBreaker())?.recordFailure(error instanceof Error ? error : undefined);
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
