/**
 * Service MFA (Multi-Factor Authentication) avec TOTP
 * Implémente l'authentification à deux facteurs pour les admins
 */

import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { query } from '../config/database';
import logger from '../config/logger';

// Configuration TOTP
authenticator.options = {
  digits: 6,
  step: 30, // 30 secondes par défaut
  window: 1, // Accepte les codes +/- 1 période (pour la dérive de temps)
};

interface MfaUserRow {
  id: string;
  email: string;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  [key: string]: unknown;
}

interface MfaSetupResult {
  secret: string;
  qrCodeDataUrl: string;
  manualEntryKey: string;
  backupCodes: string[];
}

interface MfaVerifyResult {
  valid: boolean;
  reason?: string;
}

class MfaService {
  private readonly issuer = 'Neopro';

  /**
   * Génère un secret TOTP pour un utilisateur
   */
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * Génère les données de setup MFA (secret, QR code, backup codes)
   */
  async setupMfa(userId: string, email: string): Promise<MfaSetupResult> {
    // Vérifier si l'utilisateur existe et n'a pas déjà MFA activé
    const userResult = await query<MfaUserRow>(
      'SELECT id, mfa_enabled FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Utilisateur non trouvé');
    }

    if (userResult.rows[0].mfa_enabled) {
      throw new Error('MFA déjà activé pour cet utilisateur');
    }

    // Générer le secret
    const secret = this.generateSecret();

    // Générer l'URI TOTP pour les apps authenticator
    const otpAuthUrl = authenticator.keyuri(email, this.issuer, secret);

    // Générer le QR code
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // Générer des codes de backup (pour récupération)
    const backupCodes = this.generateBackupCodes(8);

    // Sauvegarder le secret temporaire (non activé)
    // Il sera activé après vérification du premier code
    await query(
      `UPDATE users SET
        mfa_secret = $1,
        mfa_backup_codes = $2,
        updated_at = NOW()
      WHERE id = $3`,
      [secret, JSON.stringify(backupCodes), userId]
    );

    logger.info('MFA setup initiated', { userId, email });

    return {
      secret,
      qrCodeDataUrl,
      manualEntryKey: this.formatSecretForManualEntry(secret),
      backupCodes,
    };
  }

  /**
   * Active le MFA après vérification du premier code
   */
  async enableMfa(userId: string, code: string): Promise<boolean> {
    const userResult = await query<MfaUserRow>(
      'SELECT id, email, mfa_enabled, mfa_secret FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Utilisateur non trouvé');
    }

    const user = userResult.rows[0];

    if (user.mfa_enabled) {
      throw new Error('MFA déjà activé');
    }

    if (!user.mfa_secret) {
      throw new Error('Aucun setup MFA en cours - veuillez d\'abord lancer le setup');
    }

    // Vérifier le code
    const isValid = authenticator.verify({
      token: code,
      secret: user.mfa_secret,
    });

    if (!isValid) {
      logger.warn('MFA enable failed - invalid code', { userId });
      return false;
    }

    // Activer le MFA
    await query(
      'UPDATE users SET mfa_enabled = true, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    logger.info('MFA enabled successfully', { userId, email: user.email });

    return true;
  }

  /**
   * Désactive le MFA pour un utilisateur
   */
  async disableMfa(userId: string, code: string): Promise<boolean> {
    const userResult = await query<MfaUserRow>(
      'SELECT id, email, mfa_enabled, mfa_secret FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Utilisateur non trouvé');
    }

    const user = userResult.rows[0];

    if (!user.mfa_enabled) {
      throw new Error('MFA non activé');
    }

    // Vérifier le code avant de désactiver
    const isValid = this.verifyCode(code, user.mfa_secret!);

    if (!isValid) {
      logger.warn('MFA disable failed - invalid code', { userId });
      return false;
    }

    // Désactiver et supprimer les secrets
    await query(
      `UPDATE users SET
        mfa_enabled = false,
        mfa_secret = NULL,
        mfa_backup_codes = NULL,
        updated_at = NOW()
      WHERE id = $1`,
      [userId]
    );

    logger.info('MFA disabled', { userId, email: user.email });

    return true;
  }

  /**
   * Vérifie un code TOTP
   */
  verifyCode(code: string, secret: string): boolean {
    return authenticator.verify({
      token: code,
      secret: secret,
    });
  }

  /**
   * Vérifie le MFA lors du login
   */
  async verifyMfaLogin(userId: string, code: string): Promise<MfaVerifyResult> {
    const userResult = await query<{ mfa_secret: string | null; mfa_backup_codes: string | null; [key: string]: unknown }>(
      'SELECT mfa_secret, mfa_backup_codes FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return { valid: false, reason: 'Utilisateur non trouvé' };
    }

    const user = userResult.rows[0];

    if (!user.mfa_secret) {
      return { valid: false, reason: 'MFA non configuré' };
    }

    // Essayer d'abord le code TOTP
    if (this.verifyCode(code, user.mfa_secret)) {
      return { valid: true };
    }

    // Si échec, essayer les codes de backup
    if (user.mfa_backup_codes) {
      const backupCodes: string[] = JSON.parse(user.mfa_backup_codes);
      const codeIndex = backupCodes.indexOf(code.toUpperCase());

      if (codeIndex !== -1) {
        // Supprimer le code de backup utilisé
        backupCodes.splice(codeIndex, 1);
        await query(
          'UPDATE users SET mfa_backup_codes = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(backupCodes), userId]
        );

        logger.info('MFA verified with backup code', { userId, remainingBackupCodes: backupCodes.length });
        return { valid: true };
      }
    }

    logger.warn('MFA verification failed', { userId });
    return { valid: false, reason: 'Code invalide' };
  }

  /**
   * Vérifie si un utilisateur a MFA activé
   */
  async isMfaEnabled(userId: string): Promise<boolean> {
    const result = await query<{ mfa_enabled: boolean; [key: string]: unknown }>(
      'SELECT mfa_enabled FROM users WHERE id = $1',
      [userId]
    );

    return result.rows.length > 0 && result.rows[0].mfa_enabled;
  }

  /**
   * Régénère les codes de backup
   */
  async regenerateBackupCodes(userId: string, code: string): Promise<string[]> {
    const userResult = await query<MfaUserRow>(
      'SELECT id, mfa_enabled, mfa_secret FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('Utilisateur non trouvé');
    }

    const user = userResult.rows[0];

    if (!user.mfa_enabled || !user.mfa_secret) {
      throw new Error('MFA non activé');
    }

    // Vérifier le code TOTP avant de régénérer
    if (!this.verifyCode(code, user.mfa_secret)) {
      throw new Error('Code TOTP invalide');
    }

    const newBackupCodes = this.generateBackupCodes(8);

    await query(
      'UPDATE users SET mfa_backup_codes = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(newBackupCodes), userId]
    );

    logger.info('Backup codes regenerated', { userId });

    return newBackupCodes;
  }

  /**
   * Génère des codes de backup aléatoires
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 8; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      // Format: XXXX-XXXX
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }

    return codes;
  }

  /**
   * Formate le secret pour entrée manuelle (groupes de 4 caractères)
   */
  private formatSecretForManualEntry(secret: string): string {
    return secret.match(/.{1,4}/g)?.join(' ') || secret;
  }
}

export const mfaService = new MfaService();
export default mfaService;
