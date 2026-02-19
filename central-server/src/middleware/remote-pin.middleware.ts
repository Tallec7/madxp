/**
 * Remote PIN Middleware
 *
 * Protège les endpoints Remote Cloud avec un PIN optionnel par site.
 * Si un site a un remote_pin_hash configuré, un JWT token valide est requis.
 * Le token est obtenu via POST /api/remote/:siteId/verify-pin.
 */

import { Request, Response, NextFunction } from 'express';
import jwt, { Secret } from 'jsonwebtoken';
import { siteRepository } from '../repositories';
import logger from '../config/logger';

const JWT_SECRET: Secret = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
})();

export interface RemotePinPayload {
  siteId: string;
  type: 'remote-pin';
}

/**
 * Middleware: vérifie le PIN token pour les endpoints protégés.
 * - Si le site n'a pas de PIN → next() (accès libre)
 * - Si le site a un PIN et le token est valide → next()
 * - Si le site a un PIN et pas de token/token invalide → 401
 */
export const verifyRemotePin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { siteId } = req.params;

    if (!siteId) {
      res.status(400).json({ error: 'Site ID manquant' });
      return;
    }

    // Vérifier si le site a un PIN configuré
    const pinHash = await siteRepository.getRemotePinHash(siteId);

    if (!pinHash) {
      // Pas de PIN configuré → accès libre (comportement actuel)
      return next();
    }

    // PIN configuré → vérifier le token
    const token = req.headers['x-remote-token'] as string;

    if (!token) {
      res.status(401).json({
        error: 'PIN requis',
        pinRequired: true,
        message: 'Ce site nécessite un PIN pour la télécommande cloud.',
      });
      return;
    }

    // Vérifier le JWT
    const decoded = jwt.verify(token, JWT_SECRET) as RemotePinPayload;

    if (decoded.type !== 'remote-pin' || decoded.siteId !== siteId) {
      res.status(401).json({
        error: 'Token invalide',
        pinRequired: true,
        message: 'Le token PIN est invalide pour ce site.',
      });
      return;
    }

    // Token valide → continuer
    return next();
  } catch (error) {
    if ((error as { name?: string }).name === 'TokenExpiredError') {
      res.status(401).json({
        error: 'Token expiré',
        pinRequired: true,
        message: 'Votre session a expiré. Veuillez re-saisir le PIN.',
      });
      return;
    }

    if ((error as { name?: string }).name === 'JsonWebTokenError') {
      res.status(401).json({
        error: 'Token invalide',
        pinRequired: true,
        message: 'Le token PIN est invalide.',
      });
      return;
    }

    logger.error('Error in remote PIN middleware:', { error });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Génère un JWT token pour l'accès remote avec PIN.
 * Expire après 24 heures.
 */
export const generateRemotePinToken = (siteId: string): string => {
  const payload: RemotePinPayload = {
    siteId,
    type: 'remote-pin',
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};
