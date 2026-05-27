import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import dns from 'node:dns';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
// swagger-ui-express and yamljs loaded only in development (saves ~5-8MB memory in production)
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
import { alertService } from './services/alert.service';
import { realtimeStatsService } from './services/realtime-stats.service';
import { subscriptionService } from './services/subscription.service';
import { cleanupStaleTempFiles } from './middleware/upload';

import authRoutes from './routes/auth.routes';
import mfaRoutes from './routes/mfa.routes';
import sitesRoutes from './routes/sites.routes';
import hotspotConfigRoutes from './routes/hotspot-config.routes';
import featureFlagsPiRoutes from './routes/feature-flags-pi.routes';
import webContentPiRoutes from './routes/web-content-pi.routes';
import groupsRoutes from './routes/groups.routes';
import contentRoutes from './routes/content.routes';
import updatesRoutes from './routes/updates.routes';
import analyticsRoutes from './routes/analytics.routes';
import advertiserAnalyticsRoutes from './routes/advertiser-analytics.routes';
import advertiserSitesRoutes from './routes/advertiser-sites.routes';
import siteSponsorRoutes from './routes/site-sponsor.routes';
import clubPermissionsRoutes from './routes/club-permissions.routes';
import sponsorPortalRoutes from './routes/sponsor-portal.routes';
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
import configProfilesRoutes from './routes/config-profiles.routes';
import assetsRoutes from './routes/assets.routes';
import remoteRoutes from './routes/remote.routes';
import subscriptionRoutes from './routes/subscription.routes';
import billingRoutes from './routes/billing.routes';
import reportsRoutes from './routes/reports.routes';
import alertsRoutes from './routes/alerts.routes';
import benchmarkRoutes from './routes/benchmark.routes';
import networkSponsorRoutes from './routes/network-sponsor.routes';
import sponsorAlertsRoutes from './routes/sponsor-alerts.routes';
import safeRoutes from './routes/safe.routes';
import campaignRoutes from './routes/campaign.routes';
import saasRoutes from './routes/saas.routes';
import scoreboardRoutes from './routes/scoreboard.routes';
import videoStreamRoutes from './routes/video-stream.routes';
import clientErrorsRoutes from './routes/client-errors.routes';
// Templates Studio V1 (code-driven, in-process — cf STUDIO_V1.md).
// Le système V2 data-driven legacy (remotion-templates / template-studio / club-templates /
// template-backgrounds) a été supprimé — voir ADR-129 "Drop Templates Studio V2 legacy".
import templatesStudioV1Routes from './routes/templates-studio.routes';
import videoCategoriesRoutes from './routes/video-categories.routes';
import { piPasswordFleetRouter, piPasswordSitesRouter } from './routes/pi-password.routes'; // ADR-132
import { authRateLimit, apiRateLimit, sensitiveRateLimit, adminRateLimit, loggingRateLimit } from './middleware/user-rate-limit';
import { setRLSContext } from './middleware/rls-context';
import { correlationMiddleware } from './middleware/correlation';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

dotenv.config();

// Force la résolution IPv4 des hôtes externes (legacy : Render ne supportait pas IPv6
// en sortie ; conservé sur Railway pour compat héritée des Pi en réseaux IPv4-only).
dns.setDefaultResultOrder('ipv4first');

// Normalize origins by removing trailing slashes for consistent matching
const normalizeOrigin = (origin: string): string => origin.replace(/\/+$/, '');

const allowedOrigins =
  process.env.ALLOWED_ORIGINS?.split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean) || [];

// Compile wildcard origins (ex: https://*.neopro-exg.pages.dev) to regex
// Limité à un wildcard de sous-domaine — pas de wildcard sur le scheme/TLD
const allowedOriginPatterns: RegExp[] = allowedOrigins
  .filter((origin) => origin.includes('*'))
  .map((origin) => {
    const escaped = origin
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[a-z0-9-]+');
    return new RegExp(`^${escaped}$`);
  });

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

// ADR-074 — fail-fast sur env vars critiques en production.
// Sans HOTSPOT_PSK_ENCRYPTION_KEY toutes les routes /hotspot-config* retournent 500
// au runtime (bootstrap Pi impossible). On préfère un crash boot explicite au
// découvrir le manque lors du premier bootstrap en prod (incident 2026-04-20).
if (NODE_ENV === 'production') {
  const key = process.env.HOTSPOT_PSK_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    logger.error(
      'HOTSPOT_PSK_ENCRYPTION_KEY missing or invalid in production — must be 64 hex chars (32 bytes). Generate via `openssl rand -hex 32`. See docs/modops/RUNBOOK_HOTSPOT_PSK_INCIDENT.md.'
    );
    process.exit(1);
  }
  // ADR-132 — PI_PASSWORD_ENCRYPTION_KEY est optionnelle (feature active seulement si définie).
  // On avertit si définie mais invalide pour détecter les erreurs de config Railway.
  const piKey = process.env.PI_PASSWORD_ENCRYPTION_KEY;
  if (piKey && !/^[0-9a-fA-F]{64}$/.test(piKey)) {
    logger.error(
      'PI_PASSWORD_ENCRYPTION_KEY is defined but invalid — must be 64 hex chars (32 bytes). Generate via `openssl rand -hex 32`. (ADR-132)'
    );
    process.exit(1);
  }
  if (!piKey) {
    logger.warn(
      'PI_PASSWORD_ENCRYPTION_KEY not set — Pi system password rotation (ADR-132) is disabled. Set it in Railway to enable.'
    );
  }
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
      mediaSrc: ["'self'", 'blob:', 'https://kalonpartners.bzh'],  // blob: for @remotion/player prefetch, kalonpartners.bzh for FTP assets
      frameSrc: ["'none'"],
      // ADR-133 Phase 7 prep : on accepte les futurs domaines MadXP en plus
      // des anciens (NEOPRO) pour que le serveur soit prêt avant la bascule DNS.
      // Les anciens domaines pourront être retirés une fois la migration validée.
      frameAncestors: [
        "'self'",
        'https://neopro-admin.kalonpartners.bzh',
        'https://madxp-admin.kalonpartners.bzh',
        'https://madxp.kalonpartners.bzh',
      ],
    },
  },
  // X-XSS-Protection header (legacy but still useful for older browsers)
  xssFilter: true,
  // Clickjacking prevention via CSP frame-ancestors (not X-Frame-Options)
  // Disabled frameguard to allow iframe embedding for template preview from dashboard
  frameguard: false,
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

  // Check if origin matches any allowed origin (exact match)
  if (allowedOrigins.includes(normalizedOrigin)) {
    return normalizedOrigin;
  }

  // Check wildcard patterns (ex: https://*.neopro-exg.pages.dev → previews Cloudflare Pages)
  if (allowedOriginPatterns.some((pattern) => pattern.test(normalizedOrigin))) {
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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Correlation-ID, X-Remote-Token');

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

// Rate limiting is handled per-route (see routes below)
// No global rate limiter - the per-route limiters are sufficient
// and a global limiter of 100/15min was causing 429 errors with normal dashboard usage

app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationReq = req as import('./middleware/correlation').CorrelationRequest;
  const correlationId = correlationReq.correlationId;

  logger.debug('Request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    correlationId,
  });

  // Log completed requests with correlation ID for traceability
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (res.statusCode >= 400) {
      logger.warn('Request completed with error', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        correlationId,
        userId: (req as import('./types').AuthRequest).user?.id,
      });
    }
  });

  next();
});

// Métriques Prometheus (avant les autres routes pour capturer toutes les requêtes)
app.use(metricsService.httpMetricsMiddleware());

// Endpoint métriques Prometheus (non rate-limited pour le scraping)
// Protégé par Bearer token si METRICS_BEARER_TOKEN est défini
app.get('/metrics', async (req: Request, res: Response) => {
  const metricsToken = process.env.METRICS_BEARER_TOKEN;
  if (metricsToken) {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${metricsToken}`) {
      res.status(401).json({ error: 'Unauthorized - Invalid metrics token' });
      return;
    }
  }

  try {
    // Mettre à jour les métriques snapshot
    metricsService.recordConnectedSites(socketService.getConnectionCount());
    metricsService.recordWebsocketConnection('agent', socketService.getConnectionCount());
    metricsService.recordWebsocketConnection('dashboard', socketService.getDashboardConnectionCount());

    // Subscription stats snapshot (lightweight PostgreSQL view)
    try {
      const subStats = await subscriptionService.getSubscriptionStats();
      metricsService.recordSubscriptionStats({
        active: subStats.active_count,
        expiring_soon: subStats.expiring_soon_count,
        grace_period: subStats.grace_period_count,
        blocked: subStats.blocked_count,
        suspended: subStats.suspended_count,
      });
      metricsService.recordSubscriptionPlans({
        trial: subStats.trial_count,
        standard: subStats.standard_count,
        premium: subStats.premium_count,
      });
    } catch (subError) {
      logger.debug('Could not collect subscription metrics', { error: subError });
    }

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

// Documentation API Swagger/OpenAPI (development only to save memory)
if (NODE_ENV !== 'production') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const YAML = require('yamljs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const swaggerUi = require('swagger-ui-express');
    const swaggerDocument = YAML.load(path.join(__dirname, 'docs', 'openapi.yaml'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'NEOPRO API Documentation',
    }));
    logger.info('Swagger documentation available at /api-docs');
  } catch (error) {
    logger.warn('Could not load OpenAPI documentation:', error);
  }
} else {
  app.get('/api-docs', (_req: Request, res: Response) => {
    res.json({ message: 'API docs disabled in production to save memory. Run in dev mode.' });
  });
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
app.use('/api/sites', hotspotConfigRoutes); // ADR-074 — hotspot PSK cloud source of truth (Pi + admin endpoints, auth + rate limits per-route)
app.use('/api/sites', piPasswordSitesRouter); // ADR-132 — Pi system password rotation (Pi pull + ack endpoints, authenticateSiteApiKey)
app.use('/api/fleet', piPasswordFleetRouter); // ADR-132 — Fleet-wide Pi password rotation trigger (super_admin)
app.use('/api/sites', featureFlagsPiRoutes); // ADR-092 — feature flags fetched by Pi sync-agent (authenticateSiteApiKey, :id/feature-flags)
app.use('/api/sites', webContentPiRoutes); // ADR-088 — Pi fetch web_page/livestream entries (authenticateSiteApiKey)
app.use('/api/sites', draftsRoutes);  // Config drafts - sous /api/sites/:siteId/draft
app.use('/api/sites', configProfilesRoutes);  // Config profiles - sous /api/sites/:siteId/profiles
app.use('/api/groups', apiRateLimit, groupsRoutes);
app.use('/api/videos', videoStreamRoutes); // Signed URL video streaming proxy (ADR-068) — MUST be before contentRoutes (/stream would match GET /videos/:id)
app.use('/api', contentRoutes); // Vidéos & déploiements - rate limits per-route dans content.routes.ts
app.use('/api', updatesRoutes); // Mises à jour - rate limits per-route dans updates.routes.ts
app.use('/api/analytics', apiRateLimit, analyticsRoutes);
app.use('/api/analytics', advertiserAnalyticsRoutes); // Analytics annonceurs - rate limits per-route (piAnalyticsRateLimit for /impressions, apiRateLimit for the rest)
app.use('/api', advertiserSitesRoutes); // Gestion associations annonceurs <-> sites (+ backward compat) — rate limits per-route
app.use('/api/sites', adminRateLimit, siteSponsorRoutes); // Sponsors par site - adminRateLimit (400/min) car le dashboard charge liste + stats + benchmark + rapports en parallèle
app.use('/api/sites', clubPermissionsRoutes); // Club permissions per site - rate limits per-route
app.use('/api/sponsor-portal', apiRateLimit, sponsorPortalRoutes); // Portail sponsor (public, token-based)
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
app.use('/api/reports', apiRateLimit, reportsRoutes); // Generated PDF reports
app.use('/api/alerts', apiRateLimit, alertsRoutes); // System alerts
app.use('/api/benchmark', benchmarkRoutes); // Anonymous benchmarks - rate limits per-route in benchmark.routes.ts
app.use('/api/network', apiRateLimit, networkSponsorRoutes); // Network sponsor stats (P6.1 cross-club)
app.use('/api/sponsor-alerts', apiRateLimit, sponsorAlertsRoutes); // Proactive sponsor impression alerts (F-AUD-07)
app.use('/api/safe', apiRateLimit, safeRoutes); // SAFe dashboard (portfolio, proposals, epics)
app.use('/api/campaigns', campaignRoutes); // Campaign management (ADR-035 Phase 3) — rate limits per-route
app.use('/api/saas', saasRoutes); // SaaS mode (ADR-037) — public, rate limits per-route
app.use('/api/scoreboard', scoreboardRoutes); // Scoreboard live push (ADR-088 / F-15.2) — rate limits per-route
app.use('/api/sites', videoCategoriesRoutes); // Catégories vidéo par site — rate limits per-route
app.use('/api/client-errors', clientErrorsRoutes); // Frontend error capture — public, rate-limited
// Templates Studio V1 — système code-driven in-process (cf STUDIO_V1.md, ADR-124).
app.use('/api/templates-studio', templatesStudioV1Routes);

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

    // ADR-132 — Auto-rotation au boot si PI_SYSTEM_PASSWORD est défini et qu'aucun
    // hash n'est encore stocké en DB (first-deploy uniquement, idempotent).
    const piSystemPassword = process.env.PI_SYSTEM_PASSWORD;
    const piEncryptionKey = process.env.PI_PASSWORD_ENCRYPTION_KEY;
    if (piSystemPassword && piEncryptionKey) {
      try {
        const { piPasswordRepository } = await import('./repositories/pi-password.repository');
        const { piPasswordService } = await import('./services/pi-password.service');
        const sitesWithoutHash = await piPasswordRepository.countWithoutHash();
        if (sitesWithoutHash > 0) {
          const hash = piPasswordService.generateHash(piSystemPassword);
          const updated = await piPasswordRepository.setFleetPendingAndStore(hash);
          logger.info('pi-password: auto-rotation at boot (PI_SYSTEM_PASSWORD set)', {
            sitesUpdated: updated,
          });
        } else {
          logger.info(
            'pi-password: PI_SYSTEM_PASSWORD set but all Pi sites already have a hash — skipping'
          );
        }
      } catch (err) {
        logger.warn('pi-password: auto-rotation at boot failed (non-fatal)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Initialiser Socket.IO (single-instance — Redis adapter retiré 2026-05-13
    // post-incident NLF, cf. docs/runbooks/OPS-06-redis-quota-exhausted.md).
    await socketService.initialize(httpServer);
    logger.info('Socket.IO initialized');

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

    // Nettoyage périodique des fichiers temporaires d'upload abandonnés (toutes les 30 min)
    const tempCleanupInterval = setInterval(cleanupStaleTempFiles, 30 * 60 * 1000);
    tempCleanupInterval.unref(); // Ne pas empêcher le shutdown

    // Templates Studio V1 — seed des manifests vendored au boot (cf STUDIO_V1.md §5).
    // Tolère l'absence de migration (table template_definitions pas encore créée
    // en dev) : on log + skip plutôt que crasher le boot.
    try {
      const { seedTemplatesStudioManifests } = await import(
        './scripts/seed-templates-studio-manifests'
      );
      await seedTemplatesStudioManifests();
    } catch (err) {
      logger.warn('templates-studio: manifest seed skipped at boot', { err });
    }

    // Templates Studio — worker render in-process (ADR-124).
    // Poll studio_render_requests toutes les 2s, bundle Remotion + renderMedia
    // direct, upload FTP, mark ready. Fini la HTTP delegation vers un service
    // Railway séparé : Chromium + @remotion/* tournent dans ce process.
    try {
      const { startStudioRenderWorker } = await import(
        './services/studio-render-worker.service'
      );
      await startStudioRenderWorker();
    } catch (err) {
      logger.warn('templates-studio: render worker skipped at boot', { err });
    }

    // Templates Studio — worker photo cutout in-process (ADR-124).
    // Poll players WHERE cutout_status='pending' toutes les 5s, applique
    // BiRefNet via @imgly/background-removal-node (ONNX), upload FTP, mark
    // ready. Remplace l'ex-python-rembg-worker container Railway.
    try {
      const { startPhotoCutoutWorker } = await import(
        './services/photo-cutout.service'
      );
      await startPhotoCutoutWorker();
    } catch (err) {
      logger.warn('templates-studio: photo cutout worker skipped at boot', { err });
    }

    // ADR-058: purge quotidienne des profile_device_tokens expirés/révoqués > 30j
    // + refresh gauge Prometheus. Tolère l'absence de table (pré-migration).
    const { profileDeviceTokenRepository } = await import(
      './repositories/config-profile.repository'
    );
    const { default: metricsService } = await import('./services/metrics.service');
    const refreshProfileTokensMonitoring = async () => {
      try {
        const deleted = await profileDeviceTokenRepository.cleanupExpired(30);
        const active = await profileDeviceTokenRepository.countActive();
        metricsService.recordProfileDeviceTokensActive(active);
        if (deleted > 0) {
          logger.info('profile_device_tokens purged', { deleted, active });
        }
      } catch (err) {
        logger.warn('profile_device_tokens monitoring failed (pre-migration?)', {
          error: (err as Error).message,
        });
      }
    };
    // Premier tick au boot (délai 30s pour laisser la DB s'initialiser) puis 24h.
    setTimeout(refreshProfileTokensMonitoring, 30 * 1000).unref();
    const profileTokensInterval = setInterval(
      refreshProfileTokensMonitoring,
      24 * 60 * 60 * 1000
    );
    profileTokensInterval.unref();

    // ADR-081 Phase 0 — cleanup quotidien remote_command_audit (TTL 7j)
    const { remoteCommandAuditRepository } = await import(
      './repositories/remote-command-audit.repository'
    );
    const runRemoteCommandAuditCleanup = async () => {
      try {
        const deleted = await remoteCommandAuditRepository.cleanupExpired();
        if (deleted > 0) {
          logger.info('remote_command_audit purged', { deleted, retentionDays: 7 });
        }
      } catch (err) {
        logger.warn('remote_command_audit cleanup failed (pre-migration?)', {
          error: (err as Error).message,
        });
      }
    };
    setTimeout(runRemoteCommandAuditCleanup, 60 * 1000).unref();
    const remoteCommandAuditInterval = setInterval(
      runRemoteCommandAuditCleanup,
      24 * 60 * 60 * 1000
    );
    remoteCommandAuditInterval.unref();
  } catch (error) {
    logger.error('Failed to initialize dependencies:', error);
    // Ne pas quitter - le serveur reste en mode dégradé et le health check rapportera l'état
  }
};

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: graceful shutdown starting');

  // Suppress site online/offline alerts BEFORE disconnecting sockets
  // to prevent false "Site Offline" flood on redeploy
  alertService.enterShutdownMode();

  schedulerService.stop();
  cronSchedulerService.stop();
  memoryManagerService.stop();
  alertingService.cleanup();
  adminOpsService.stopCleanup();

  // Stop Templates Studio V1 render worker — running renders will be reclaimed at next boot.
  try {
    const { stopStudioRenderWorker } = await import('./services/studio-render-worker.service');
    stopStudioRenderWorker();
  } catch (err) {
    logger.warn('Failed to stop Templates Studio render worker', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Flush Logtail before shutdown to avoid losing buffered log lines on Railway redeploy
  try {
    const { logtail } = await import('./config/logger');
    if (logtail) await logtail.flush();
  } catch {
    // non-blocking — shutdown must proceed regardless
  }

  // Cleanup sockets BEFORE closing HTTP server — Socket.IO needs the HTTP
  // server alive to send the shutdown notification to connected Pi devices.
  await socketService.cleanup();

  httpServer.close(async () => {
    logger.info('HTTP server closed');
    await pool.end();
    logger.info('Database pool closed');
    process.exit(0);
  });

  // Safety net: force exit if httpServer.close() hangs on lingering connections
  setTimeout(() => {
    logger.warn('Graceful shutdown timeout — forcing exit');
    process.exit(0);
  }, 10000).unref();
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
