/**
 * Rate limiting par utilisateur
 * Utilise l'ID utilisateur si authentifié, sinon l'IP
 */

import rateLimit, { RateLimitRequestHandler, Options } from 'express-rate-limit';
import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';

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
const limitHandler = (req: Request, res: Response): void => {
  const authReq = req as AuthRequest;
  logger.warn('Rate limit exceeded', {
    userId: authReq.user?.id,
    ip: req.ip,
    path: req.path,
    method: req.method,
  });

  res.status(429).json({
    error: 'Trop de requêtes',
    message: 'Vous avez dépassé la limite de requêtes. Veuillez réessayer plus tard.',
    retryAfter: res.getHeader('Retry-After'),
  });
};

/**
 * Crée un rate limiter avec configuration personnalisée
 */
export const createUserRateLimit = (
  windowMs: number,
  max: number,
  options: Partial<Options> = {}
): RateLimitRequestHandler => {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: userKeyGenerator,
    handler: limitHandler,
    standardHeaders: true, // Retourne les headers RateLimit-* standards
    legacyHeaders: false, // Désactive les headers X-RateLimit-*
    skipFailedRequests: false, // Compte aussi les requêtes échouées
    skipSuccessfulRequests: false,
    ...options,
  });
};

/**
 * Rate limiters préconfigurés pour différents endpoints
 */

// Auth endpoints - restrictif en prod, plus permissif en dev
const isDev = process.env.NODE_ENV !== 'production';
export const authRateLimit = createUserRateLimit(
  isDev ? 60 * 1000 : 15 * 60 * 1000, // 1 minute en dev, 15 minutes en prod
  isDev ? 100 : 30, // 100 en dev, 30 en prod
  {
    message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  }
);

// API générale - modéré (100 requêtes / minute)
export const apiRateLimit = createUserRateLimit(
  60 * 1000, // 1 minute
  100
);

// Endpoints sensibles (commandes, déploiements) - restrictif (30 requêtes / minute)
export const sensitiveRateLimit = createUserRateLimit(
  60 * 1000, // 1 minute
  30
);

// Upload de vidéos - très restrictif (10 uploads / heure)
export const uploadRateLimit = createUserRateLimit(
  60 * 60 * 1000, // 1 heure
  10,
  {
    message: { error: 'Limite d\'uploads atteinte. Réessayez dans 1 heure.' },
  }
);

// Webhooks et endpoints publics - par IP uniquement (60 requêtes / minute)
export const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

// Admin read operations - modéré (200 requêtes / minute)
// Higher limit for admin dashboards loading data on initialization
export const adminRateLimit = createUserRateLimit(
  60 * 1000, // 1 minute
  200
);

// Monitoring endpoints - permissif (300 requêtes / minute)
// Used for real-time status updates and metrics polling
export const monitoringRateLimit = createUserRateLimit(
  60 * 1000, // 1 minute
  300,
  {
    message: { error: 'Trop de requêtes de monitoring. Réduisez la fréquence de polling.' },
  }
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
  }
);

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
  handler: limitHandler,
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
  adminMultiplier = 3
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
    handler: limitHandler,
    standardHeaders: true,
    legacyHeaders: false,
  });
};

export default {
  createUserRateLimit,
  authRateLimit,
  apiRateLimit,
  sensitiveRateLimit,
  uploadRateLimit,
  publicRateLimit,
  adminRateLimit,
  monitoringRateLimit,
  loggingRateLimit,
  piAnalyticsRateLimit,
  roleBasedRateLimit,
};
