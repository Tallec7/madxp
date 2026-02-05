import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import dns from 'node:dns';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import dotenv from 'dotenv';

import logger from './config/logger';
import pool from './config/database';
import socketService from './services/socket.service';
import metricsService from './services/metrics.service';
import healthService from './services/health.service';
import schedulerService from './services/scheduler.service';
import cronSchedulerService from './services/cron-scheduler.service';
import memoryManagerService from './services/memory-manager.service';
import networkAlertsService from './services/network-alerts.service';
import { adminOpsService } from './services/admin-ops.service';
import { alertingService } from './services/alerting.service';
import { realtimeStatsService } from './services/realtime-stats.service';
import { predictiveAlertsService } from './services/predictive-alerts.service';

import authRoutes from './routes/auth.routes';
import mfaRoutes from './routes/mfa.routes';
import sitesRoutes from './routes/sites.routes';
import groupsRoutes from './routes/groups.routes';
import contentRoutes from './routes/content.routes';
import updatesRoutes from './routes/updates.routes';
import analyticsRoutes from './routes/analytics.routes';
import advertiserAnalyticsRoutes from './routes/advertiser-analytics.routes';
import advertiserSitesRoutes from './routes/advertiser-sites.routes';
import auditRoutes from './routes/audit.routes';
import canaryRoutes from './routes/canary.routes';
import adminRoutes from './routes/admin.routes';
import advertiserPortalRoutes from './routes/advertiser-portal.routes';
import agencyRoutes from './routes/agency.routes';
import usersRoutes from './routes/users.routes';
import schedulesRoutes from './routes/schedules.routes';
import objectivesRoutes from './routes/objectives.routes';
import playlistSchedulesRoutes from './routes/playlist-schedules.routes';
import logsRoutes from './routes/logs.routes';
import draftsRoutes from './routes/drafts.routes';
import assetsRoutes from './routes/assets.routes';
import remoteRoutes from './routes/remote.routes';
import subscriptionRoutes from './routes/subscription.routes';
import billingRoutes from './routes/billing.routes';
import proofRoutes from './routes/proof.routes';
import reportsRoutes from './routes/reports.routes';
import alertsRoutes from './routes/alerts.routes';
import benchmarkRoutes from './routes/benchmark.routes';
import { authRateLimit, apiRateLimit, sensitiveRateLimit, adminRateLimit, loggingRateLimit } from './middleware/user-rate-limit';
import { setRLSContext } from './middleware/rls-context';
import { correlationMiddleware } from './middleware/correlation';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

dotenv.config();

// Render ne supporte pas encore IPv6 en sortie, on force la résolution IPv4 des hôtes (Supabase)
dns.setDefaultResultOrder('ipv4first');

// Normalize origins by removing trailing slashes for consistent matching
const normalizeOrigin = (origin: string): string => origin.replace(/\/+$/, '');

const allowedOrigins =
  process.env.ALLOWED_ORIGINS?.split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean) || [];

// SECURITY: Fail-closed in production - reject all cross-origin requests if ALLOWED_ORIGINS not configured
const isProduction = process.env.NODE_ENV === 'production';
const corsFailClosed = isProduction && allowedOrigins.length === 0;

if (corsFailClosed) {
  logger.error('='.repeat(80));
  logger.error('SECURITY WARNING: ALLOWED_ORIGINS not configured in production!');
  logger.error('All cross-origin requests will be REJECTED.');
  logger.error('Please set ALLOWED_ORIGINS environment variable (comma-separated list).');
  logger.error('Example: ALLOWED_ORIGINS=https://dashboard.neopro.fr,https://admin.neopro.fr');
  logger.error('='.repeat(80));
}

// Log configured origins at startup for debugging
logger.info('CORS configuration', {
  allowedOrigins,
  isProduction,
  corsFailClosed,
  allowAllOrigins: !isProduction && allowedOrigins.length === 0,
});

const app = express();
const httpServer = http.createServer(app);

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust proxy pour fonctionner derrière un reverse proxy (Render, etc.)
// Nécessaire pour express-rate-limit et pour obtenir la vraie IP client
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security headers with Helmet
// Comprehensive configuration for XSS, clickjacking, and other protections
app.use(helmet({
  // Content Security Policy - restrict resource loading
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline for Swagger UI
      styleSrc: ["'self'", "'unsafe-inline'"],  // Allow inline styles
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],    // Allow WebSocket connections
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // X-XSS-Protection header (legacy but still useful for older browsers)
  xssFilter: true,
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Prevent MIME type sniffing
  noSniff: true,
  // HSTS - force HTTPS (only in production)
  hsts: NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  } : false,
  // Referrer policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Disable X-Powered-By header
  hidePoweredBy: true,
  // DNS prefetch control
  dnsPrefetchControl: { allow: false },
  // IE no open
  ieNoOpen: true,
  // Permitted cross-domain policies
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

const resolveOrigin = (origin?: string | undefined): string | null => {
  if (!origin) return null;

  const normalizedOrigin = normalizeOrigin(origin);

  // SECURITY: In production, if no allowed origins configured, reject ALL origins
  if (corsFailClosed) {
    logger.warn('CORS request rejected (fail-closed mode)', { origin: normalizedOrigin });
    return null;
  }

  // In development, if no allowed origins configured, allow all
  if (allowedOrigins.length === 0) {
    return normalizedOrigin;
  }

  // Check if origin matches any allowed origin
  if (allowedOrigins.includes(normalizedOrigin)) {
    return normalizedOrigin;
  }

  // Log rejected origins for debugging (only in development or first few times)
  logger.debug('CORS origin rejected', { origin: normalizedOrigin, allowedOrigins });
  return null;
};

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Déterminer l'origine à autoriser
  let allowedOrigin: string | null = null;

  if (origin) {
    const matchedOrigin = resolveOrigin(origin);
    if (matchedOrigin) {
      allowedOrigin = matchedOrigin;
    }
  } else if (!corsFailClosed && allowedOrigins.length === 0) {
    // No origin header and no restrictions (development only) → allow all
    allowedOrigin = '*';
  }
  // Note: In production with corsFailClosed, requests without origin header are still allowed
  // (same-origin requests, server-to-server requests, etc.)

  // Toujours définir les headers CORS si une origine est autorisée
  if (allowedOrigin) {
    res.header('Access-Control-Allow-Origin', allowedOrigin);
    if (allowedOrigin !== '*') {
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Credentials', 'true');
    }
  }

  // Toujours définir ces headers pour les requêtes OPTIONS
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Correlation-ID');

  // Gérer les requêtes preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(compression());
app.use(cookieParser());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Correlation ID middleware - must be early to capture all requests
// Adds X-Correlation-ID header for request tracing across frontend/backend
app.use(correlationMiddleware);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === 'production' ? 100 : 1000,
  message: 'Trop de requêtes, veuillez réessayer plus tard',
});
app.use('/api/', limiter);

app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug('Request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Métriques Prometheus (avant les autres routes pour capturer toutes les requêtes)
app.use(metricsService.httpMetricsMiddleware());

// Endpoint métriques Prometheus (non rate-limited pour le scraping)
app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    // Mettre à jour les métriques snapshot
    metricsService.recordConnectedSites(socketService.getConnectionCount());

    res.set('Content-Type', metricsService.getContentType());
    res.send(await metricsService.getMetrics());
  } catch (error) {
    logger.error('Error generating metrics:', error);
    res.status(500).send('Error generating metrics');
  }
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'NEOPRO Central Server',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    documentation: '/api-docs',
  });
});

// Documentation API Swagger/OpenAPI
try {
  const swaggerDocument = YAML.load(path.join(__dirname, 'docs', 'openapi.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'NEOPRO API Documentation',
  }));
  logger.info('Swagger documentation available at /api-docs');
} catch (error) {
  logger.warn('Could not load OpenAPI documentation:', error);
}

// Health check pour Render - toujours retourne 200 pour éviter les timeouts de déploiement
// Le contenu indique l'état réel des dépendances
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await healthService.getHealth();
    // Toujours retourner 200 pour que Render considère le service comme opérationnel
    // L'état réel est dans le body JSON (status: healthy/degraded/unhealthy)
    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    // Même en cas d'erreur, retourner 200 pour Render avec le détail dans le body
    res.status(200).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

// Liveness probe (Kubernetes) - simple check que le process est vivant
app.get('/live', (_req: Request, res: Response) => {
  res.json(healthService.getLiveness());
});

// Readiness probe (Kubernetes) - vérifie que l'app est prête pour le trafic
app.get('/ready', async (_req: Request, res: Response) => {
  const readiness = await healthService.getReadiness();
  const httpStatus = readiness.status === 'ready' ? 200 : 503;
  res.status(httpStatus).json(readiness);
});

// Apply Row-Level Security context to all API routes
// This middleware sets PostgreSQL session variables for multi-tenant isolation
// It must run after authentication (which is handled in individual routes)
app.use('/api', setRLSContext(pool));

// Rate limiters spécifiques par type d'endpoint
app.use('/api/auth', authRoutes); // Rate limits are now per-route in auth.routes.ts
app.use('/api/mfa', authRateLimit, mfaRoutes);   // MFA - même restrictions que auth
// Sites API: rate limits are applied per-route in sites.routes.ts
// Monitoring endpoints (connection-status, dashboard, metrics, local-content) use monitoringRateLimit (300/min)
// Other endpoints use the default rate or sensitiveRateLimit where appropriate
app.use('/api/sites', sitesRoutes);
app.use('/api/sites', draftsRoutes);  // Config drafts - sous /api/sites/:siteId/draft
app.use('/api/groups', apiRateLimit, groupsRoutes);
app.use('/api', sensitiveRateLimit, contentRoutes); // Upload de vidéos - plus restrictif
app.use('/api', sensitiveRateLimit, updatesRoutes); // Mises à jour - sensible
app.use('/api/analytics', apiRateLimit, analyticsRoutes);
app.use('/api/analytics', apiRateLimit, advertiserAnalyticsRoutes); // Analytics annonceurs (+ backward compat sponsors)
app.use('/api', apiRateLimit, advertiserSitesRoutes); // Gestion associations annonceurs <-> sites (+ backward compat)
app.use('/api/audit', apiRateLimit, auditRoutes);
app.use('/api/canary', sensitiveRateLimit, canaryRoutes); // Déploiements canary - sensible
app.use('/api/admin', adminRateLimit, adminRoutes);
app.use('/api/advertiser', apiRateLimit, advertiserPortalRoutes); // Portail annonceurs
app.use('/api/agencies', apiRateLimit, agencyRoutes); // Gestion agences
app.use('/api/users', sensitiveRateLimit, usersRoutes); // Gestion utilisateurs (sensible)
app.use('/api/schedules', sensitiveRateLimit, schedulesRoutes); // Tâches planifiées (admin only)
app.use('/api/objectives', apiRateLimit, objectivesRoutes); // Objectifs clubs
app.use('/api/playlist-schedules', apiRateLimit, playlistSchedulesRoutes); // Programmation playlists
app.use('/api/logs', loggingRateLimit, logsRoutes); // Frontend log ingestion - permissive rate limit
app.use('/api/assets', sensitiveRateLimit, assetsRoutes); // Assets (watermarks, logos) - sensible
app.use('/api/remote', remoteRoutes); // Remote cloud - rate limits per-route
app.use('/api/subscriptions', subscriptionRoutes); // Subscription management - rate limits per-route
app.use('/api/billing', billingRoutes); // Billing export - admin only
app.use('/api/proofs', proofRoutes); // Proof of broadcast (screenshots) - rate limits per-route
app.use('/api/reports', apiRateLimit, reportsRoutes); // Generated PDF reports
app.use('/api/alerts', apiRateLimit, alertsRoutes); // System and predictive alerts
app.use('/api/benchmark', apiRateLimit, benchmarkRoutes); // Anonymous benchmarks

// 404 handler - Must be AFTER all routes, BEFORE error handler
// Uses standardized error format with correlation ID
app.use(notFoundHandler);

// Global error handler - Must be LAST middleware
// Catches all errors and formats them with correlation ID and error codes
app.use(errorHandler);

const startServer = async () => {
  // Démarrer le serveur HTTP immédiatement pour répondre aux health checks de Render
  // Cela évite les timeouts si la base de données met du temps à se connecter
  httpServer.listen(PORT, () => {
    logger.info(`🚀 NEOPRO Central Server démarré`, {
      port: PORT,
      environment: NODE_ENV,
      processId: process.pid,
    });
    logger.info(`API disponible sur http://localhost:${PORT}`);
    logger.info(`WebSocket disponible sur ws://localhost:${PORT}`);
  });

  // Initialiser les dépendances en arrière-plan
  try {
    // Tester la connexion à la base de données
    await pool.query('SELECT NOW()');
    logger.info('Database connection established');

    // Initialiser Socket.IO (avec Redis si configuré)
    await socketService.initialize(httpServer);
    logger.info('Socket.IO initialized', { redisEnabled: socketService.isRedisConnected() });

    // Demarrer le scheduler pour les deploiements planifies
    schedulerService.start();
    logger.info('Deployment scheduler started');

    // Demarrer le cron scheduler pour les taches recurrentes (rapports, cleanup)
    await cronSchedulerService.start();
    logger.info('Cron scheduler started');

    // Initialiser le service d'alerting (crée les tables et charge les seuils par défaut)
    await alertingService.initialize();
    logger.info('Alerting service initialized');

    // Demarrer le service d'alertes reseau (Phase 4 - Network Resilience)
    networkAlertsService.start();
    logger.info('Network alerts service started');

    // Demarrer le service d'alertes predictives (Phase 3.1 - Analytics Enhancement)
    predictiveAlertsService.start();
    logger.info('Predictive alerts service started');

    // Initialiser et démarrer le service de stats temps réel
    const io = socketService.getIO();
    if (io) {
      realtimeStatsService.initialize(io);
      realtimeStatsService.start();
      logger.info('Realtime stats service started');
    }

    // Start memory manager with cleanup callbacks
    memoryManagerService.registerCleanupCallback(() => {
      // Force cleanup of socket service pending commands
      const debugInfo = socketService.getDebugInfo();
      logger.info('Memory pressure cleanup - socket service stats', {
        pendingCommands: debugInfo.pendingCommandsCount,
        connectedSites: debugInfo.connectedSites.length,
      });

      // Clear alerting service memory cache
      alertingService.clearMemoryCache();
    });
    memoryManagerService.start();
    logger.info('Memory manager started');
  } catch (error) {
    logger.error('Failed to initialize dependencies:', error);
    // Ne pas quitter - le serveur reste en mode dégradé et le health check rapportera l'état
  }
};

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  schedulerService.stop();
  cronSchedulerService.stop();
  memoryManagerService.stop();
  predictiveAlertsService.stop();
  alertingService.cleanup();
  adminOpsService.stopCleanup();
  httpServer.close(async () => {
    logger.info('HTTP server closed');
    await socketService.cleanup();
    await pool.end();
    logger.info('Database pool closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();

export { app, httpServer };
