/**
 * Rate limiting par utilisateur
 * Utilise l'ID utilisateur si authentifié, sinon l'IP
 */

import rateLimit, { RateLimitRequestHandler, Options } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';

interface RateLimitInfo {
  limit: number;
  used: number;
  remaining: number;
  resetTime: Date;
}

// Lazy import to avoid circular dependency with metrics.service
let metricsServiceInstance: {
  recordRateLimitHit: (limiter: string, keyType: string) => void;
  recordRateLimitNearExhaustion: (limiter: string) => void;
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

/**
 * Générateur de clé basé sur l'utilisateur ou l'IP
 */
const userKeyGenerator = (req: Request): string => {
  const authReq = req as AuthRequest;
  // Utiliser l'ID utilisateur si authentifié, sinon l'IP
  return authReq.user?.id || req.ip || 'unknown';
};

/**
 * Handler pour les dépassements de limite
 */
const createLimitHandler = (limiterName: string) => (req: Request, res: Response): void => {
  const authReq = req as AuthRequest;
  const keyType = authReq.user?.id ? 'user' : 'ip';

  logger.warn('Rate limit exceeded', {
    userId: authReq.user?.id,
    ip: req.ip,
    path: req.path,
    method: req.method,
    limiter: limiterName,
  });

  getMetricsService()?.recordRateLimitHit(limiterName, keyType);

  res.status(429).json({
    error: 'Trop de requêtes',
    message: 'Vous avez dépassé la limite de requêtes. Veuillez réessayer plus tard.',
    retryAfter: res.getHeader('Retry-After'),
  });
};


/**
 * Crée un rate limiter avec configuration personnalisée.
 * Inclut le tracking near-exhaustion (>80% consommé) pour les métriques Prometheus.
 */
export const createUserRateLimit = (
  windowMs: number,
  max: number,
  options: Partial<Options> = {},
  limiterName = 'unknown'
): RateLimitRequestHandler => {
  const limiter = rateLimit({
    windowMs,
    max,
    keyGenerator: userKeyGenerator,
    handler: createLimitHandler(limiterName),
    standardHeaders: true, // Retourne les headers RateLimit-* standards
    legacyHeaders: false, // Désactive les headers X-RateLimit-*
    skipFailedRequests: false, // Compte aussi les requêtes échouées
    skipSuccessfulRequests: false,
    ...options,
  });

  // Wrapper qui détecte la near-exhaustion (>80% consommé) après le rate limiter
  const wrapper = (req: Request, res: Response, next: NextFunction): void => {
    limiter(req, res, () => {
      const info = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit;
      if (info && info.remaining < info.limit * 0.2) {
        getMetricsService()?.recordRateLimitNearExhaustion(limiterName);
      }
      next();
    });
  };

  // Preserve express-rate-limit's resetKey method for tests
  if ('resetKey' in limiter) {
    (wrapper as RateLimitRequestHandler).resetKey = (limiter as RateLimitRequestHandler).resetKey;
  }

  return wrapper as RateLimitRequestHandler;
};

/**
 * Rate limiters préconfigurés pour différents endpoints
 */

// Auth endpoints - restrictif pour login (anti-bruteforce), mais permissif pour /me
const isDev = process.env.NODE_ENV !== 'production';
export const authRateLimit = createUserRateLimit(
  isDev ? 60 * 1000 : 60 * 1000, // 1 minute en dev et prod
  isDev ? 100 : 60, // 100 en dev, 60 en prod (augmenté de 30)
  {
    message: { error: 'Trop de tentatives de connexion. Réessayez dans 1 minute.' },
  },
  'auth'
);

// API générale - modéré (100 requêtes / minute)
export const apiRateLimit = createUserRateLimit(
  60 * 1000, // 1 minute
  100,
  {},
  'api'
);

// Endpoints sensibles (commandes, déploiements) - restrictif (30 requêtes / minute)
export const sensitiveRateLimit = createUserRateLimit(
  60 * 1000, // 1 minute
  30,
  {},
  'sensitive'
);

// Upload de vidéos - très restrictif (10 uploads / heure)
export const uploadRateLimit = createUserRateLimit(
  60 * 60 * 1000, // 1 heure
  10,
  {
    message: { error: 'Limite d\'uploads atteinte. Réessayez dans 1 heure.' },
  },
  'upload'
);

// Webhooks et endpoints publics - par IP uniquement (60 requêtes / minute)
export const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createLimitHandler('public'),
});

// Admin read operations - permissif (400 requêtes / minute)
// Higher limit for admin dashboards loading data on initialization
// Increased from 200 to 400 to handle multiple components loading simultaneously
export const adminRateLimit = createUserRateLimit(
  60 * 1000, // 1 minute
  400,
  {},
  'admin'
);

// Monitoring endpoints - permissif (300 requêtes / minute)
// Used for real-time status updates and metrics polling
export const monitoringRateLimit = createUserRateLimit(
  60 * 1000, // 1 minute
  300,
  {
    message: { error: 'Trop de requêtes de monitoring. Réduisez la fréquence de polling.' },
  },
  'monitoring'
);

// Frontend logging - permissif (200 requêtes / minute)
// Logs should not be rate-limited too aggressively to avoid losing telemetry
// But still protected against abuse
export const loggingRateLimit = createUserRateLimit(
  60 * 1000, // 1 minute
  200,
  {
    skipFailedRequests: true, // Don't count failed log submissions
    message: { error: 'Trop de logs. Certains logs peuvent être perdus.' },
  },
  'logging'
);

// Cloud Remote - permissif par IP (60 requêtes / minute)
// La télécommande cloud fait du polling (1/min) + des commandes utilisateur (score, timer sync, vidéo)
// Pendant un match actif: ~4 req/min (polling + timer sync) + actions utilisateur
// 60/min laisse assez de marge pour un usage intensif sans bloquer
export const remoteRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  handler: createLimitHandler('remote'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes télécommande. Réessayez dans quelques secondes.' },
});

// Pi Analytics - très permissif (500 requêtes / minute)
// Les Pi sont des appareils de confiance authentifiés par API key
// Avec 100 Pi et backlog, on peut avoir des pics de trafic importants
// 500 req/min permet ~5 Pi en mode backlog (24 req/min chacun) + trafic normal
export const piAnalyticsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500,
  keyGenerator: (req: Request): string => {
    // Clé basée sur l'IP car les Pi s'authentifient par API key, pas JWT
    return req.ip || 'unknown';
  },
  handler: createLimitHandler('pi_analytics'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes analytics. Réduisez la fréquence d\'envoi.' },
});

/**
 * Rate limiter dynamique basé sur le rôle utilisateur
 * Les admins ont des limites plus élevées
 */
export const roleBasedRateLimit = (
  windowMs: number,
  baseMax: number,
  adminMultiplier = 3,
  limiterName = 'role_based'
): RateLimitRequestHandler => {
  return rateLimit({
    windowMs,
    max: (req: Request): number => {
      const authReq = req as AuthRequest;
      if (authReq.user?.role === 'admin') {
        return baseMax * adminMultiplier;
      }
      return baseMax;
    },
    keyGenerator: userKeyGenerator,
    handler: createLimitHandler(limiterName),
    standardHeaders: true,
    legacyHeaders: false,
  });
};

export default {
  createUserRateLimit,
  authRateLimit,
  apiRateLimit,
  sensitiveRateLimit,
  remoteRateLimit,
  uploadRateLimit,
  publicRateLimit,
  adminRateLimit,
  monitoringRateLimit,
  loggingRateLimit,
  piAnalyticsRateLimit,
  roleBasedRateLimit,
};
