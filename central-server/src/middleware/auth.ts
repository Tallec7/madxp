import { Response, NextFunction } from 'express';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { AuthRequest, UserRole } from '../types';
import logger from '../config/logger';

const JWT_SECRET: Secret = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
})();

// Nom du cookie (doit correspondre à auth.controller.ts)
const COOKIE_NAME = 'neopro_token';

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  sponsor_id?: string | null;
  agency_id?: string | null;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    let token: string | undefined;

    // 1. Essayer de lire le token depuis le cookie HttpOnly (prioritaire pour le web)
    if (req.cookies && req.cookies[COOKIE_NAME]) {
      token = req.cookies[COOKIE_NAME];
    }

    // 2. Fallback sur le header Authorization (pour API clients, mobile, agents Raspberry)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    // 3. Fallback sur un paramètre de requête (SSE/EventSource ne permet pas d'envoyer des headers custom)
    if (!token && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;

    return next();
  } catch (error) {
    logger.error('Erreur d\'authentification:', error);
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

// Hiérarchie des rôles (du plus puissant au moins puissant)
const ROLE_HIERARCHY: Record<UserRole, number> = {
  'super_admin': 100,
  'admin': 80,
  'operator': 60,
  'viewer': 40,
  'sponsor': 30,
  'agency': 30,
};

// Rôles considérés comme "admin" (accès complet NeoPro)
const ADMIN_ROLES: UserRole[] = ['super_admin', 'admin'];

// Rôles internes NeoPro (pas des partenaires externes)
const INTERNAL_ROLES: UserRole[] = ['super_admin', 'admin', 'operator', 'viewer'];

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Super admin a accès à tout
    if (req.user.role === 'super_admin') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Accès refusé',
        message: `Rôle requis: ${allowedRoles.join(' ou ')}`
      });
    }

    return next();
  };
};

// Middleware pour vérifier qu'un utilisateur est un admin interne
export const requireAdmin = () => requireRole('super_admin', 'admin');

// Middleware pour vérifier qu'un utilisateur est interne à NeoPro
export const requireInternal = () => requireRole(...INTERNAL_ROLES);

// Middleware pour les sponsors: vérifie qu'ils accèdent à leurs propres données
export const requireSponsorAccess = (getSponsorIdFromRequest: (req: AuthRequest) => string | undefined) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Admins ont accès à tout
    if (ADMIN_ROLES.includes(req.user.role)) {
      return next();
    }

    // Sponsors ne peuvent accéder qu'à leurs propres données
    if (req.user.role === 'sponsor') {
      const requestedSponsorId = getSponsorIdFromRequest(req);
      if (!requestedSponsorId || requestedSponsorId !== req.user.sponsor_id) {
        return res.status(403).json({
          error: 'Accès refusé',
          message: 'Vous ne pouvez accéder qu\'à vos propres données sponsor'
        });
      }
      return next();
    }

    return res.status(403).json({ error: 'Accès refusé' });
  };
};

// Middleware pour les agences: vérifie qu'ils accèdent à leurs propres données
export const requireAgencyAccess = (getAgencyIdFromRequest: (req: AuthRequest) => string | undefined) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Admins ont accès à tout
    if (ADMIN_ROLES.includes(req.user.role)) {
      return next();
    }

    // Agences ne peuvent accéder qu'à leurs propres données
    if (req.user.role === 'agency') {
      const requestedAgencyId = getAgencyIdFromRequest(req);
      if (!requestedAgencyId || requestedAgencyId !== req.user.agency_id) {
        return res.status(403).json({
          error: 'Accès refusé',
          message: 'Vous ne pouvez accéder qu\'à vos propres données agence'
        });
      }
      return next();
    }

    return res.status(403).json({ error: 'Accès refusé' });
  };
};

// Helper pour vérifier si un utilisateur est admin
export const isAdmin = (role: UserRole): boolean => ADMIN_ROLES.includes(role);

// Helper pour vérifier si un utilisateur est interne
export const isInternal = (role: UserRole): boolean => INTERNAL_ROLES.includes(role);

export const generateToken = (user: JwtPayload): string => {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as SignOptions['expiresIn'];
  const options: SignOptions = { expiresIn };
  return jwt.sign(user, JWT_SECRET, options);
};
