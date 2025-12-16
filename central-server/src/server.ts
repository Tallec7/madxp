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

import authRoutes from './routes/auth.routes';
import mfaRoutes from './routes/mfa.routes';
import sitesRoutes from './routes/sites.routes';
import groupsRoutes from './routes/groups.routes';
import contentRoutes from './routes/content.routes';
import updatesRoutes from './routes/updates.routes';
import analyticsRoutes from './routes/analytics.routes';
import sponsorAnalyticsRoutes from './routes/sponsor-analytics.routes';
import auditRoutes from './routes/audit.routes';
import canaryRoutes from './routes/canary.routes';
import adminRoutes from './routes/admin.routes';
import { authRateLimit, apiRateLimit, sensitiveRateLimit } from './middleware/user-rate-limit';
import { setRLSContext } from './middleware/rls-context';

dotenv.config();

// Render ne supporte pas encore IPv6 en sortie, on force la résolution IPv4 des hôtes (Supabase)
dns.setDefaultResultOrder('ipv4first');

// Normalize origins by removing trailing slashes for consistent matching
const normalizeOrigin = (origin: string): string => origin.replace(/\/+$/, '');

const allowedOrigins =
  process.env.ALLOWED_ORIGINS?.split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean) || [];

// Log configured origins at startup for debugging
logger.info('CORS configuration', {
  allowedOrigins,
  allowAllOrigins: allowedOrigins.length === 0,
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

app.use(helmet());

const resolveOrigin = (origin?: string | undefined): string | null => {
  if (!origin) return null;

  const normalizedOrigin = normalizeOrigin(origin);

  // If no allowed origins configured, allow all
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
  } else if (allowedOrigins.length === 0) {
    // No origin header and no restrictions → allow all
    allowedOrigin = '*';
  }

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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

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
app.use('/api/auth', authRateLimit, authRoutes); // Restrictif pour auth
app.use('/api/mfa', authRateLimit, mfaRoutes);   // MFA - même restrictions que auth
app.use('/api/sites', apiRateLimit, sitesRoutes);
app.use('/api/groups', apiRateLimit, groupsRoutes);
app.use('/api/videos', sensitiveRateLimit); // Upload de vidéos - plus restrictif
app.use('/api', apiRateLimit, contentRoutes);
app.use('/api', sensitiveRateLimit, updatesRoutes); // Mises à jour - sensible
app.use('/api/analytics', apiRateLimit, analyticsRoutes);
app.use('/api/analytics', apiRateLimit, sponsorAnalyticsRoutes); // Analytics sponsors
app.use('/api/audit', apiRateLimit, auditRoutes);
app.use('/api/canary', sensitiveRateLimit, canaryRoutes); // Déploiements canary - sensible
app.use('/api/admin', sensitiveRateLimit, adminRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route non trouvée',
    path: req.path,
  });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'Erreur serveur interne',
    message: NODE_ENV === 'development' ? err.message : undefined,
  });
});

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
  } catch (error) {
    logger.error('Failed to initialize dependencies:', error);
    // Ne pas quitter - le serveur reste en mode dégradé et le health check rapportera l'état
  }
};

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
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
