import { Response, NextFunction } from 'express';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { AuthRequest } from '../types';
import logger from '../config/logger';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'your-secret-key';

export interface JwtPayload {
  id: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;

    return next();
  } catch (error) {
    logger.error('Erreur d\'authentification:', error);
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

export const requireRole = (...allowedRoles: Array<'admin' | 'operator' | 'viewer'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
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

export const generateToken = (user: JwtPayload): string => {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as SignOptions['expiresIn'];
  const options: SignOptions = { expiresIn };
  return jwt.sign(user, JWT_SECRET, options);
};
