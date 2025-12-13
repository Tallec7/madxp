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

// Auth endpoints - très restrictif (10 requêtes / 15 minutes)
export const authRateLimit = createUserRateLimit(
  15 * 60 * 1000, // 15 minutes
  10,
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
  roleBasedRateLimit,
};
