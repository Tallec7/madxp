/**
 * Routes MFA (Multi-Factor Authentication)
 * Gestion de l'authentification à deux facteurs
 */

import { Router, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { AuthRequest } from '../types';
import { mfaService } from '../services/mfa.service';
import logger from '../config/logger';

const router = Router();

/**
 * GET /api/mfa/status
 * Retourne le statut MFA de l'utilisateur connecté
 */
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const enabled = await mfaService.isMfaEnabled(req.user.id);

    return res.json({
      enabled,
      required: req.user.role === 'admin', // MFA requis pour les admins
    });
  } catch (error) {
    logger.error('Get MFA status error:', error);
    return res.status(500).json({ error: 'Erreur lors de la récupération du statut MFA' });
  }
});

/**
 * POST /api/mfa/setup
 * Initialise le setup MFA (génère secret et QR code)
 * Réservé aux admins et operators
 */
router.post(
  '/setup',
  authenticate,
  requireRole('admin', 'operator'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Non authentifié' });
      }

      const result = await mfaService.setupMfa(req.user.id, req.user.email);

      return res.json({
        qrCodeDataUrl: result.qrCodeDataUrl,
        manualEntryKey: result.manualEntryKey,
        backupCodes: result.backupCodes,
        message: 'Scannez le QR code avec votre application authenticator, puis validez avec un code',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur lors du setup MFA';
      logger.error('MFA setup error:', error);
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/mfa/enable
 * Active le MFA après vérification du premier code
 */
router.post(
  '/enable',
  authenticate,
  requireRole('admin', 'operator'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Non authentifié' });
      }

      const { code } = req.body as { code: string };

      if (!code || typeof code !== 'string' || code.length !== 6) {
        return res.status(400).json({ error: 'Code TOTP invalide (6 chiffres requis)' });
      }

      const success = await mfaService.enableMfa(req.user.id, code);

      if (!success) {
        return res.status(400).json({ error: 'Code TOTP incorrect' });
      }

      return res.json({
        success: true,
        message: 'MFA activé avec succès',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l\'activation MFA';
      logger.error('MFA enable error:', error);
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/mfa/disable
 * Désactive le MFA (requiert le code actuel)
 */
router.post(
  '/disable',
  authenticate,
  requireRole('admin', 'operator'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Non authentifié' });
      }

      const { code } = req.body as { code: string };

      if (!code) {
        return res.status(400).json({ error: 'Code TOTP requis' });
      }

      const success = await mfaService.disableMfa(req.user.id, code);

      if (!success) {
        return res.status(400).json({ error: 'Code TOTP incorrect' });
      }

      return res.json({
        success: true,
        message: 'MFA désactivé',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la désactivation MFA';
      logger.error('MFA disable error:', error);
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/mfa/verify
 * Vérifie un code MFA (utilisé lors du login)
 */
router.post('/verify', async (req: AuthRequest, res: Response) => {
  try {
    const { userId, code } = req.body as { userId: string; code: string };

    if (!userId || !code) {
      return res.status(400).json({ error: 'userId et code requis' });
    }

    const result = await mfaService.verifyMfaLogin(userId, code);

    if (!result.valid) {
      return res.status(401).json({ error: result.reason || 'Code invalide' });
    }

    return res.json({
      valid: true,
      message: 'Code vérifié',
    });
  } catch (error) {
    logger.error('MFA verify error:', error);
    return res.status(500).json({ error: 'Erreur lors de la vérification MFA' });
  }
});

/**
 * POST /api/mfa/backup-codes/regenerate
 * Régénère les codes de backup (requiert code TOTP actuel)
 */
router.post(
  '/backup-codes/regenerate',
  authenticate,
  requireRole('admin', 'operator'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Non authentifié' });
      }

      const { code } = req.body as { code: string };

      if (!code) {
        return res.status(400).json({ error: 'Code TOTP requis' });
      }

      const backupCodes = await mfaService.regenerateBackupCodes(req.user.id, code);

      return res.json({
        backupCodes,
        message: 'Nouveaux codes de backup générés. Conservez-les en lieu sûr.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la régénération';
      logger.error('Backup codes regenerate error:', error);
      return res.status(400).json({ error: message });
    }
  }
);

export default router;
