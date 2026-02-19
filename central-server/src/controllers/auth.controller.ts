import { Request, Response, CookieOptions } from 'express';
import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories';
import { generateToken } from '../middleware/auth';
import { AuthRequest, UserRole } from '../types';
import logger from '../config/logger';
import { mfaService } from '../services/mfa.service';
import { passwordResetService } from '../services/password-reset.service';
import { emailService } from '../services/email.service';
import metricsService from '../services/metrics.service';

// Configuration des cookies sécurisés
// Note: sameSite: 'none' est requis pour les cookies cross-origin (frontend et backend sur domaines différents)
// secure: true est obligatoire avec sameSite: 'none'
const COOKIE_NAME = 'neopro_token';

// Durée de session plus longue : 7 jours (au lieu de 8h)
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 jours

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: COOKIE_MAX_AGE,
  path: '/',
  // Safari iOS/iPadOS : partitioned cookies pour contourner ITP
  // Note: Safari 16.4+ supporte les Partitioned cookies
  ...(process.env.NODE_ENV === 'production' && { partitioned: true }),
};

export { COOKIE_NAME };

export const login = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password, mfaCode } = req.body as {
      email: string;
      password: string;
      mfaCode?: string;
    };

    const user = await userRepository.findByEmail(email);

    if (!user) {
      metricsService.recordAuthAttempt('failure', false);
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const advertiserId = user.advertiser_id ?? user.sponsor_id ?? null;
    const sponsorId = user.sponsor_id ?? user.advertiser_id ?? null;

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      metricsService.recordAuthAttempt('failure', false);
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Si MFA est activé, vérifier le code
    if (user.mfa_enabled) {
      // Si pas de code MFA fourni, demander le code
      if (!mfaCode) {
        return res.status(200).json({
          requireMfa: true,
          userId: user.id,
          message: 'Code MFA requis',
        });
      }

      // Vérifier le code MFA
      const mfaResult = await mfaService.verifyMfaLogin(user.id, mfaCode);
      if (!mfaResult.valid) {
        metricsService.recordAuthAttempt('failure', true);
        logger.warn('MFA verification failed during login', { email: user.email });
        return res.status(401).json({ error: 'Code MFA invalide' });
      }
    }

    metricsService.recordAuthAttempt('success', user.mfa_enabled);
    await userRepository.updateLastLogin(user.id);

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      advertiser_id: advertiserId,
      sponsor_id: sponsorId,
      agency_id: user.agency_id,
    });

    logger.info('User logged in', {
      email: user.email,
      role: user.role,
      mfaUsed: user.mfa_enabled,
      sponsor_id: user.sponsor_id,
      agency_id: user.agency_id,
    });

    // Définir le cookie HttpOnly sécurisé
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    return res.json({
      token, // Toujours retourné pour compatibilité API (mobile, etc.)
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        mfa_enabled: user.mfa_enabled,
        advertiser_id: advertiserId,
        sponsor_id: sponsorId,
        agency_id: user.agency_id,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  logger.info('User logged out', { email: req.user?.email });
  // Supprimer le cookie
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.json({ message: 'Déconnexion réussie' });
};

export const me = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const user = await userRepository.findForAuth(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const advertiserId = user.advertiser_id ?? user.sponsor_id ?? null;
    const sponsorId = user.sponsor_id ?? user.advertiser_id ?? null;

    // Générer un nouveau token pour la connexion Socket.IO après refresh
    // Le cookie HttpOnly ne peut pas être lu par le JS, donc on renvoie le token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      advertiser_id: advertiserId,
      sponsor_id: sponsorId,
      agency_id: user.agency_id,
    });

    return res.json({
      ...user,
      advertiser_id: advertiserId,
      sponsor_id: sponsorId,
      token, // Token pour Socket.IO après refresh de page
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    return res.status(500).json({ error: 'Erreur lors de la récupération des informations' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const { current_password, new_password } = req.body as { current_password: string; new_password: string };

    const passwordHash = await userRepository.getPasswordHash(req.user.id);

    if (!passwordHash) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const isValidPassword = await bcrypt.compare(current_password, passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await userRepository.updatePassword(req.user.id, hashedPassword);

    logger.info('Password changed', { userId: req.user.id });

    return res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    logger.error('Change password error:', error);
    return res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
  }
};

// ============================================================================
// PASSWORD RESET (Forgot Password Flow)
// ============================================================================

/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 */
export const forgotPassword = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email } = req.body as { email: string };

    // Request reset token
    const result = await passwordResetService.requestReset(email.toLowerCase());

    if (result) {
      // Build reset link
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      const resetLink = `${frontendUrl}/reset-password?token=${result.token}`;

      // Send email
      await emailService.sendPasswordResetEmail(email, {
        resetLink,
        expiresAt: result.expiresAt,
        userEmail: email,
      });

      logger.info('Password reset email sent', { email: email.substring(0, 3) + '***' });
    }

    // Always return success to prevent email enumeration
    return res.json({
      success: true,
      message: 'Si cet email existe dans notre systeme, vous recevrez un lien de reinitialisation.',
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Erreur lors de la demande de reinitialisation' });
  }
};

/**
 * GET /api/auth/verify-reset-token
 * Verify if a reset token is valid
 */
export const verifyResetToken = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token } = req.query as { token?: string };

    if (!token) {
      return res.status(400).json({ error: 'Token manquant' });
    }

    const result = await passwordResetService.verifyToken(token);

    if (!result) {
      return res.status(401).json({
        valid: false,
        error: 'Token invalide ou expire',
      });
    }

    return res.json({
      valid: true,
      email: result.email,
    });
  } catch (error) {
    logger.error('Verify reset token error:', error);
    return res.status(500).json({ error: 'Erreur lors de la verification du token' });
  }
};

/**
 * POST /api/auth/reset-password
 * Reset password using a valid token
 */
export const resetPassword = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token, password } = req.body as { token: string; password: string };

    if (!token) {
      return res.status(400).json({ error: 'Token manquant' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caracteres' });
    }

    const success = await passwordResetService.resetPassword(token, password);

    if (!success) {
      return res.status(401).json({ error: 'Token invalide ou expire' });
    }

    return res.json({
      success: true,
      message: 'Mot de passe reinitialise avec succes',
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    return res.status(500).json({ error: 'Erreur lors de la reinitialisation du mot de passe' });
  }
};
