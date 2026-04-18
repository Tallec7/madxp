/**
 * Remote Auth Controller — ADR-058 Phase 1
 *
 * Endpoints super_admin pour gérer les PIN par profil et les device tokens:
 *
 *   PUT    /api/sites/:siteId/profiles/:profileId/remote-pin
 *   GET    /api/sites/:siteId/profiles/:profileId/remote-devices
 *   POST   /api/sites/:siteId/profiles/:profileId/remote-devices/:tokenId/revoke
 *   POST   /api/sites/:siteId/profiles/:profileId/remote-devices/revoke-all
 *
 * Endpoint public (scoped profil) :
 *
 *   POST   /api/remote/:siteId/profiles/:profileId/verify-pin
 *
 * Après vérification du PIN, un JWT device token (30j) est émis et une ligne
 * `profile_device_tokens` est créée (révocable individuellement).
 */

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../types';
import {
  configProfileRepository,
  profileDeviceTokenRepository,
} from '../repositories/config-profile.repository';
import { sendSyncProfilesToSite } from '../services/profile-sync.service';
import {
  generateRemoteProfilePinToken,
  hashDeviceToken,
} from '../middleware/remote-pin.middleware';
import logger from '../config/logger';
import metricsService from '../services/metrics.service';

const BCRYPT_ROUNDS = 12;
const DEVICE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

// Lockout brute-force : 5 tentatives / 10 min, clé = `${ip}:${profileId}`.
const pinAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_WINDOW_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pinAttempts.entries()) {
    if (now - value.lastAttempt > PIN_LOCKOUT_WINDOW_MS) {
      pinAttempts.delete(key);
    }
  }
}, 60 * 1000).unref?.();

/**
 * ADR-058 Phase 2B — un club peut gérer le PIN de son propre site.
 * Autorise `super_admin` (global) ou `club` uniquement si `user.site_id`
 * matche `req.params.siteId` (defense-in-depth au niveau controller,
 * au-delà du bypass middleware `requireRole`).
 */
function requireSuperAdminOrOwnClub(req: AuthRequest, res: Response): boolean {
  if (req.user?.role === 'super_admin') return true;
  if (
    req.user?.role === 'club' &&
    req.user.site_id &&
    req.params.siteId === req.user.site_id
  ) {
    return true;
  }
  res.status(403).json({ error: 'super_admin ou club propriétaire uniquement' });
  return false;
}

async function ensureProfileBelongsToSite(
  siteId: string,
  profileId: string
): Promise<boolean> {
  const profile = await configProfileRepository.findById(profileId);
  return !!profile && profile.site_id === siteId;
}

/**
 * PUT /api/sites/:siteId/profiles/:profileId/remote-pin
 * Body: { pin: string | null }
 *
 * - `pin: "1234"` → hash bcrypt (rounds=12), set `remote_pin_required=true`
 * - `pin: null` → clear hash, set `remote_pin_required=false`
 *
 * Dans les deux cas, révoque TOUS les device tokens actifs du profil et
 * trigger un `sync_profiles` vers le Pi pour propager l'état offline.
 */
export async function setProfilePin(req: AuthRequest, res: Response) {
  try {
    if (!requireSuperAdminOrOwnClub(req, res)) return;
    const { siteId, profileId } = req.params;
    const { pin } = req.body as { pin: string | null };

    if (!(await ensureProfileBelongsToSite(siteId, profileId))) {
      return res.status(404).json({ error: 'Profil non trouvé pour ce site' });
    }

    if (pin === null) {
      await configProfileRepository.setPin(profileId, { hash: null, required: false });
    } else {
      const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
      await configProfileRepository.setPin(profileId, { hash, required: true });
    }

    const revoked = await profileDeviceTokenRepository.revokeAllForProfile(
      profileId,
      pin === null ? 'pin_cleared' : 'pin_changed'
    );

    // Propager au Pi (non-bloquant)
    try {
      await sendSyncProfilesToSite(siteId);
    } catch (err) {
      logger.warn('sync_profiles failed after setProfilePin (non-fatal)', {
        siteId,
        profileId,
        error: (err as Error).message,
      });
    }

    logger.info('Profile remote PIN updated', {
      siteId,
      profileId,
      cleared: pin === null,
      revokedTokens: revoked,
      actor: req.user?.email,
    });

    res.json({
      success: true,
      pin_required: pin !== null,
      revoked_tokens: revoked,
    });
  } catch (error) {
    logger.error('setProfilePin error:', { error });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/sites/:siteId/profiles/:profileId/remote-devices
 * Liste les device tokens actifs (super_admin).
 */
export async function listProfileDevices(req: AuthRequest, res: Response) {
  try {
    if (!requireSuperAdminOrOwnClub(req, res)) return;
    const { siteId, profileId } = req.params;

    if (!(await ensureProfileBelongsToSite(siteId, profileId))) {
      return res.status(404).json({ error: 'Profil non trouvé pour ce site' });
    }

    const rows = await profileDeviceTokenRepository.findActiveByProfile(profileId);
    res.json({
      devices: rows.map((r) => ({
        id: r.id,
        device_id: r.device_id,
        label: r.label,
        created_at: r.created_at,
        last_used_at: r.last_used_at,
        expires_at: r.expires_at,
      })),
    });
  } catch (error) {
    logger.error('listProfileDevices error:', { error });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/sites/:siteId/profiles/:profileId/remote-devices/:tokenId/revoke
 */
export async function revokeProfileDevice(req: AuthRequest, res: Response) {
  try {
    if (!requireSuperAdminOrOwnClub(req, res)) return;
    const { siteId, profileId, tokenId } = req.params;

    if (!(await ensureProfileBelongsToSite(siteId, profileId))) {
      return res.status(404).json({ error: 'Profil non trouvé pour ce site' });
    }

    await profileDeviceTokenRepository.revoke(tokenId, 'manual');
    logger.info('Profile device token revoked', {
      siteId,
      profileId,
      tokenId,
      actor: req.user?.email,
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('revokeProfileDevice error:', { error });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/sites/:siteId/profiles/:profileId/remote-devices/revoke-all
 */
export async function revokeAllProfileDevices(req: AuthRequest, res: Response) {
  try {
    if (!requireSuperAdminOrOwnClub(req, res)) return;
    const { siteId, profileId } = req.params;
    const { reason } = (req.body as { reason?: string | null }) || {};

    if (!(await ensureProfileBelongsToSite(siteId, profileId))) {
      return res.status(404).json({ error: 'Profil non trouvé pour ce site' });
    }

    const count = await profileDeviceTokenRepository.revokeAllForProfile(
      profileId,
      reason || 'manual'
    );
    logger.info('All profile device tokens revoked', {
      siteId,
      profileId,
      count,
      actor: req.user?.email,
    });
    res.json({ success: true, revoked: count });
  } catch (error) {
    logger.error('revokeAllProfileDevices error:', { error });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/remote/:siteId/profiles/:profileId/verify-pin
 * Body: { pin: string, deviceId: string, label?: string }
 *
 * - Vérifie le PIN via bcrypt
 * - Lockout brute-force 5 tentatives / 10 min par (ip, profileId)
 * - Crée une ligne `profile_device_tokens` et émet un JWT 30j
 */
export async function verifyProfilePin(req: Request, res: Response) {
  try {
    const { siteId, profileId } = req.params;
    const { pin, deviceId, label } = req.body as {
      pin: string;
      deviceId: string;
      label?: string | null;
    };

    const attemptKey = `${req.ip}:${profileId}`;
    const current = pinAttempts.get(attemptKey);
    if (current && current.count >= MAX_PIN_ATTEMPTS) {
      const elapsed = Date.now() - current.lastAttempt;
      if (elapsed < PIN_LOCKOUT_WINDOW_MS) {
        const retryAfter = Math.ceil((PIN_LOCKOUT_WINDOW_MS - elapsed) / 1000);
        metricsService.recordProfilePinVerification('lockout');
        res.status(429).json({
          error: 'Trop de tentatives',
          message: `Trop de tentatives échouées. Réessayez dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          retryAfter,
        });
        return;
      }
      pinAttempts.delete(attemptKey);
    }

    const profile = await configProfileRepository.findById(profileId);
    if (!profile || profile.site_id !== siteId) {
      res.status(404).json({ error: 'Profil non trouvé' });
      return;
    }

    const pinRow = await configProfileRepository.findPin(profileId);
    if (!pinRow || !pinRow.remote_pin_required || !pinRow.remote_pin_hash) {
      metricsService.recordProfilePinVerification('misconfigured');
      res.status(400).json({ error: 'Aucun PIN configuré pour ce profil' });
      return;
    }

    const ok = await bcrypt.compare(pin, pinRow.remote_pin_hash);
    if (!ok) {
      const c = pinAttempts.get(attemptKey) || { count: 0, lastAttempt: 0 };
      c.count += 1;
      c.lastAttempt = Date.now();
      pinAttempts.set(attemptKey, c);

      metricsService.recordProfilePinVerification('failure');
      logger.warn('Profile PIN verification failed', {
        siteId,
        profileId,
        ip: req.ip,
        attempts: c.count,
      });

      res.status(401).json({
        error: 'PIN incorrect',
        attemptsRemaining: Math.max(0, MAX_PIN_ATTEMPTS - c.count),
      });
      return;
    }

    pinAttempts.delete(attemptKey);

    // Créer la ligne device_token (on hash le JWT final après sa création).
    // Pour cela on insère d'abord avec un placeholder puis on MAJ le hash —
    // mais ici on peut générer l'ID côté repo avec `gen_random_uuid()` et on
    // signe le JWT avec cet ID. On utilise une approche en deux étapes : insert
    // avec token_hash calculé sur une pré-signature incluant un uuid généré.
    // Plus simple : on génère d'abord l'uuid du token, on signe, on insère avec
    // le hash. Mais l'uuid vient de la DB. Contournement : on insère avec un
    // hash placeholder, on récupère l'id, on signe avec cet id, puis on UPDATE
    // le hash. Ici on fait simple : générer l'uuid côté JS.
    const { v4: uuidv4 } = await import('uuid');
    const tokenId = uuidv4();
    const token = generateRemoteProfilePinToken({
      siteId,
      profileId,
      deviceId,
      tokenId,
    });
    const tokenHash = hashDeviceToken(token);
    const expiresAt = new Date(Date.now() + DEVICE_TOKEN_TTL_MS);

    // Insérer avec l'id pré-généré. On doit faire un INSERT avec id explicite.
    try {
      await profileDeviceTokenRepository.create({
        id: tokenId,
        profileId,
        siteId,
        deviceId,
        label: label || null,
        tokenHash,
        expiresAt,
      });
    } catch (err) {
      logger.warn('profile_device_tokens insert failed — PIN still issued (pre-migration?)', {
        siteId,
        profileId,
        error: (err as Error).message,
      });
    }

    metricsService.recordProfilePinVerification('success');
    logger.info('Profile PIN verified successfully', {
      siteId,
      profileId,
      deviceId,
      ip: req.ip,
    });

    res.json({
      success: true,
      token,
      tokenId,
      expiresIn: DEVICE_TOKEN_TTL_MS / 1000,
    });
  } catch (error) {
    logger.error('verifyProfilePin error:', { error });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}
