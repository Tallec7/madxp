/**
 * Remote PIN Middleware — ADR-058 (profile-scoped)
 *
 * Protège les endpoints Remote Cloud avec un PIN optionnel par profil (ADR-058)
 * avec backward compatibility sur le PIN legacy par site.
 *
 * - Si aucun profil du site n'a `remote_pin_required = true` ET le site n'a pas
 *   de `remote_pin_hash` legacy → next() (accès libre)
 * - Si un PIN est requis → un token valide est attendu (header `x-remote-token`
 *   ou body `token`). Tokens profil : 30j, scope { profileId, siteId, deviceId }.
 *   Tokens legacy site : 24h, scope { siteId, type: 'remote-pin' }.
 *
 * La vérification tient compte de la révocation via `profile_device_tokens`.
 */

import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import jwt, { Secret } from 'jsonwebtoken';
import { siteRepository } from '../repositories';
import {
  configProfileRepository,
  profileDeviceTokenRepository,
} from '../repositories/config-profile.repository';
import logger from '../config/logger';

const JWT_SECRET: Secret = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
})();

export interface RemotePinLegacyPayload {
  siteId: string;
  type: 'remote-pin';
}

export interface RemoteProfilePinPayload {
  siteId: string;
  profileId: string;
  deviceId: string;
  tokenId: string;
  type: 'remote-profile-pin';
}

/**
 * Génère un JWT token legacy (site-scope, 24h).
 * Conservé pour compat — préférer `generateRemoteProfilePinToken`.
 */
export const generateRemotePinToken = (siteId: string): string => {
  const payload: RemotePinLegacyPayload = { siteId, type: 'remote-pin' };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};

/**
 * Génère un JWT token de device pour un profil (30j).
 * Le token inclut le `tokenId` (ligne `profile_device_tokens`) pour permettre
 * la révocation par le super_admin sans changer la secret.
 */
export const generateRemoteProfilePinToken = (params: {
  siteId: string;
  profileId: string;
  deviceId: string;
  tokenId: string;
}): string => {
  const payload: RemoteProfilePinPayload = {
    siteId: params.siteId,
    profileId: params.profileId,
    deviceId: params.deviceId,
    tokenId: params.tokenId,
    type: 'remote-profile-pin',
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
};

/**
 * Hash stable du token pour stockage en DB (SHA-256 hex).
 * Utilisé pour retrouver la ligne `profile_device_tokens` et valider la révocation.
 */
export const hashDeviceToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

function extractToken(req: Request): string | null {
  const header = req.headers['x-remote-token'];
  if (typeof header === 'string' && header.length > 0) return header;
  const body = (req.body as Record<string, unknown> | undefined)?.token;
  if (typeof body === 'string' && body.length > 0) return body;
  return null;
}

/**
 * Vérifie si un token profil est encore actif en DB (non révoqué, non expiré).
 */
async function isProfileTokenActive(tokenId: string, token: string): Promise<boolean> {
  try {
    const row = await profileDeviceTokenRepository.findByHash(hashDeviceToken(token));
    if (!row) return false;
    if (row.id !== tokenId) return false;
    // touchLastUsed is best-effort (non-blocking telemetry)
    profileDeviceTokenRepository.touchLastUsed(tokenId).catch(() => undefined);
    return true;
  } catch (err) {
    logger.warn('profile_device_tokens lookup failed (non-fatal)', {
      tokenId,
      error: (err as Error).message,
    });
    // Fallback permissif pré-migration : si la table n'existe pas encore, on
    // accepte le JWT signé (la protection principale reste la signature).
    return true;
  }
}

/**
 * Middleware principal : vérifie le PIN token pour les endpoints protégés.
 * Si AUCUN PIN (profil ou site legacy) n'est configuré → accès libre.
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

    // PIN profils ? PIN legacy site ?
    let anyProfilePinRequired = false;
    try {
      const profiles = await configProfileRepository.findBySite(siteId);
      anyProfilePinRequired = profiles.some((p) => p.remote_pin_required);
    } catch (err) {
      logger.warn('findBySite failed in verifyRemotePin (non-fatal)', {
        siteId,
        error: (err as Error).message,
      });
    }

    const sitePinHash = await siteRepository.getRemotePinHash(siteId).catch(() => null);

    if (!anyProfilePinRequired && !sitePinHash) {
      return next();
    }

    const token = extractToken(req);
    if (!token) {
      res.status(401).json({
        error: 'PIN requis',
        pinRequired: true,
        message: 'Ce site nécessite un PIN pour la télécommande cloud.',
      });
      return;
    }

    let decoded: jwt.JwtPayload | string;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'TokenExpiredError') {
        res.status(401).json({
          error: 'Token expiré',
          pinRequired: true,
          message: 'Votre session a expiré. Veuillez re-saisir le PIN.',
        });
        return;
      }
      res.status(401).json({
        error: 'Token invalide',
        pinRequired: true,
        message: 'Le token PIN est invalide.',
      });
      return;
    }

    if (typeof decoded !== 'object' || decoded === null) {
      res.status(401).json({ error: 'Token invalide', pinRequired: true });
      return;
    }

    // Token profil (ADR-058)
    if ((decoded as RemoteProfilePinPayload).type === 'remote-profile-pin') {
      const p = decoded as RemoteProfilePinPayload;
      if (p.siteId !== siteId) {
        res.status(401).json({ error: 'Token invalide', pinRequired: true });
        return;
      }
      const active = await isProfileTokenActive(p.tokenId, token);
      if (!active) {
        res.status(401).json({
          error: 'Token révoqué',
          pinRequired: true,
          message: 'Votre appareil a été révoqué. Veuillez re-saisir le PIN.',
        });
        return;
      }
      (req as Request & { remoteProfile?: RemoteProfilePinPayload }).remoteProfile = p;
      return next();
    }

    // Token legacy site
    if ((decoded as RemotePinLegacyPayload).type === 'remote-pin') {
      const p = decoded as RemotePinLegacyPayload;
      if (p.siteId !== siteId) {
        res.status(401).json({ error: 'Token invalide', pinRequired: true });
        return;
      }
      return next();
    }

    res.status(401).json({ error: 'Token invalide', pinRequired: true });
  } catch (error) {
    logger.error('Error in remote PIN middleware:', { error });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
