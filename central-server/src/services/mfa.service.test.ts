/**
 * Tests unitaires pour le service MFA (Multi-Factor Authentication)
 *
 * Ce service est CRITIQUE pour la sécurité car il gère:
 * - La génération de secrets TOTP
 * - La vérification des codes TOTP
 * - Les codes de backup
 * - L'activation/désactivation du MFA
 *
 * @module mfa.service.test
 */

// Mock dependencies before importing the service
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

// Mock otplib
const mockGenerateSecret = jest.fn();
const mockVerify = jest.fn();
const mockKeyuri = jest.fn();
jest.mock('otplib', () => ({
  authenticator: {
    options: {},
    generateSecret: () => mockGenerateSecret(),
    verify: (opts: { token: string; secret: string }) => mockVerify(opts),
    keyuri: (email: string, issuer: string, secret: string) => mockKeyuri(email, issuer, secret),
  },
}));

// Mock QRCode
const mockToDataURL = jest.fn();
jest.mock('qrcode', () => ({
  toDataURL: (url: string) => mockToDataURL(url),
}));

// Import after mocks
import { mfaService } from './mfa.service';

describe('MfaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateSecret.mockReturnValue('JBSWY3DPEHPK3PXP');
    mockKeyuri.mockReturnValue('otpauth://totp/Neopro:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Neopro');
    mockToDataURL.mockResolvedValue('data:image/png;base64,mockQRCode');
  });

  describe('generateSecret', () => {
    it('should generate a TOTP secret', () => {
      const secret = mfaService.generateSecret();

      expect(mockGenerateSecret).toHaveBeenCalled();
      expect(secret).toBe('JBSWY3DPEHPK3PXP');
    });
  });

  describe('setupMfa', () => {
    const userId = 'user-uuid-123';
    const email = 'test@example.com';

    it('should setup MFA for a user without MFA enabled', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, mfa_enabled: false }] }) // Check user
        .mockResolvedValueOnce({ rows: [] }); // Update user with secret

      const result = await mfaService.setupMfa(userId, email);

      expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(result.qrCodeDataUrl).toBe('data:image/png;base64,mockQRCode');
      expect(result.manualEntryKey).toBeDefined();
      expect(result.backupCodes).toHaveLength(8);
      expect(result.backupCodes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.arrayContaining([expect.any(String), expect.any(String), userId])
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MFA setup initiated',
        expect.objectContaining({ userId, email })
      );
    });

    it('should throw error if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(mfaService.setupMfa(userId, email)).rejects.toThrow('Utilisateur non trouvé');
    });

    it('should throw error if MFA already enabled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, mfa_enabled: true }] });

      await expect(mfaService.setupMfa(userId, email)).rejects.toThrow('MFA déjà activé pour cet utilisateur');
    });

    it('should generate QR code with correct URI', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, mfa_enabled: false }] })
        .mockResolvedValueOnce({ rows: [] });

      await mfaService.setupMfa(userId, email);

      expect(mockKeyuri).toHaveBeenCalledWith(email, 'Neopro', 'JBSWY3DPEHPK3PXP');
      expect(mockToDataURL).toHaveBeenCalledWith(
        'otpauth://totp/Neopro:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Neopro'
      );
    });
  });

  describe('enableMfa', () => {
    const userId = 'user-uuid-123';
    const validCode = '123456';
    const secret = 'JBSWY3DPEHPK3PXP';

    it('should enable MFA with valid code', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: userId, email: 'test@example.com', mfa_enabled: false, mfa_secret: secret }],
        })
        .mockResolvedValueOnce({ rows: [] });

      mockVerify.mockReturnValue(true);

      const result = await mfaService.enableMfa(userId, validCode);

      expect(result).toBe(true);
      expect(mockVerify).toHaveBeenCalledWith({ token: validCode, secret });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('mfa_enabled = true'),
        [userId]
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MFA enabled successfully',
        expect.objectContaining({ userId })
      );
    });

    it('should return false with invalid code', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: userId, email: 'test@example.com', mfa_enabled: false, mfa_secret: secret }],
      });

      mockVerify.mockReturnValue(false);

      const result = await mfaService.enableMfa(userId, 'invalid');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MFA enable failed - invalid code',
        expect.objectContaining({ userId })
      );
    });

    it('should throw error if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(mfaService.enableMfa(userId, validCode)).rejects.toThrow('Utilisateur non trouvé');
    });

    it('should throw error if MFA already enabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: userId, email: 'test@example.com', mfa_enabled: true, mfa_secret: secret }],
      });

      await expect(mfaService.enableMfa(userId, validCode)).rejects.toThrow('MFA déjà activé');
    });

    it('should throw error if no MFA setup in progress', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: userId, email: 'test@example.com', mfa_enabled: false, mfa_secret: null }],
      });

      await expect(mfaService.enableMfa(userId, validCode)).rejects.toThrow(
        "Aucun setup MFA en cours - veuillez d'abord lancer le setup"
      );
    });
  });

  describe('disableMfa', () => {
    const userId = 'user-uuid-123';
    const validCode = '123456';
    const secret = 'JBSWY3DPEHPK3PXP';

    it('should disable MFA with valid code', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: userId, email: 'test@example.com', mfa_enabled: true, mfa_secret: secret }],
        })
        .mockResolvedValueOnce({ rows: [] });

      mockVerify.mockReturnValue(true);

      const result = await mfaService.disableMfa(userId, validCode);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('mfa_enabled = false'),
        [userId]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('mfa_secret = NULL'),
        [userId]
      );
      expect(mockLogger.info).toHaveBeenCalledWith('MFA disabled', expect.objectContaining({ userId }));
    });

    it('should return false with invalid code', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: userId, email: 'test@example.com', mfa_enabled: true, mfa_secret: secret }],
      });

      mockVerify.mockReturnValue(false);

      const result = await mfaService.disableMfa(userId, 'invalid');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MFA disable failed - invalid code',
        expect.objectContaining({ userId })
      );
    });

    it('should throw error if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(mfaService.disableMfa(userId, validCode)).rejects.toThrow('Utilisateur non trouvé');
    });

    it('should throw error if MFA not enabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: userId, email: 'test@example.com', mfa_enabled: false, mfa_secret: null }],
      });

      await expect(mfaService.disableMfa(userId, validCode)).rejects.toThrow('MFA non activé');
    });
  });

  describe('verifyCode', () => {
    it('should return true for valid code', () => {
      mockVerify.mockReturnValue(true);

      const result = mfaService.verifyCode('123456', 'SECRET');

      expect(result).toBe(true);
      expect(mockVerify).toHaveBeenCalledWith({ token: '123456', secret: 'SECRET' });
    });

    it('should return false for invalid code', () => {
      mockVerify.mockReturnValue(false);

      const result = mfaService.verifyCode('000000', 'SECRET');

      expect(result).toBe(false);
    });
  });

  describe('verifyMfaLogin', () => {
    const userId = 'user-uuid-123';
    const secret = 'JBSWY3DPEHPK3PXP';
    const backupCodes = ['ABCD-1234', 'EFGH-5678'];

    it('should verify valid TOTP code', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ mfa_secret: secret, mfa_backup_codes: JSON.stringify(backupCodes) }],
      });

      mockVerify.mockReturnValue(true);

      const result = await mfaService.verifyMfaLogin(userId, '123456');

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should verify valid backup code', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ mfa_secret: secret, mfa_backup_codes: JSON.stringify(backupCodes) }],
        })
        .mockResolvedValueOnce({ rows: [] }); // Update backup codes

      mockVerify.mockReturnValue(false); // TOTP fails

      const result = await mfaService.verifyMfaLogin(userId, 'ABCD-1234');

      expect(result.valid).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET mfa_backup_codes'),
        expect.arrayContaining([expect.any(String), userId])
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MFA verified with backup code',
        expect.objectContaining({ userId, remainingBackupCodes: 1 })
      );
    });

    it('should verify backup code case-insensitively', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ mfa_secret: secret, mfa_backup_codes: JSON.stringify(backupCodes) }],
        })
        .mockResolvedValueOnce({ rows: [] });

      mockVerify.mockReturnValue(false);

      const result = await mfaService.verifyMfaLogin(userId, 'abcd-1234'); // lowercase

      expect(result.valid).toBe(true);
    });

    it('should return invalid for wrong code', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ mfa_secret: secret, mfa_backup_codes: JSON.stringify(backupCodes) }],
      });

      mockVerify.mockReturnValue(false);

      const result = await mfaService.verifyMfaLogin(userId, 'WRONG-CODE');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Code invalide');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MFA verification failed',
        expect.objectContaining({ userId })
      );
    });

    it('should return invalid if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await mfaService.verifyMfaLogin(userId, '123456');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Utilisateur non trouvé');
    });

    it('should return invalid if MFA not configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ mfa_secret: null, mfa_backup_codes: null }],
      });

      const result = await mfaService.verifyMfaLogin(userId, '123456');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('MFA non configuré');
    });
  });

  describe('isMfaEnabled', () => {
    const userId = 'user-uuid-123';

    it('should return true if MFA is enabled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ mfa_enabled: true }] });

      const result = await mfaService.isMfaEnabled(userId);

      expect(result).toBe(true);
    });

    it('should return false if MFA is not enabled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ mfa_enabled: false }] });

      const result = await mfaService.isMfaEnabled(userId);

      expect(result).toBe(false);
    });

    it('should return false if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await mfaService.isMfaEnabled(userId);

      expect(result).toBe(false);
    });
  });

  describe('regenerateBackupCodes', () => {
    const userId = 'user-uuid-123';
    const secret = 'JBSWY3DPEHPK3PXP';
    const validCode = '123456';

    it('should regenerate backup codes with valid TOTP', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: userId, mfa_enabled: true, mfa_secret: secret }],
        })
        .mockResolvedValueOnce({ rows: [] });

      mockVerify.mockReturnValue(true);

      const result = await mfaService.regenerateBackupCodes(userId, validCode);

      expect(result).toHaveLength(8);
      expect(result[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET mfa_backup_codes'),
        expect.arrayContaining([expect.any(String), userId])
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Backup codes regenerated', expect.objectContaining({ userId }));
    });

    it('should throw error if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(mfaService.regenerateBackupCodes(userId, validCode)).rejects.toThrow('Utilisateur non trouvé');
    });

    it('should throw error if MFA not enabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: userId, mfa_enabled: false, mfa_secret: null }],
      });

      await expect(mfaService.regenerateBackupCodes(userId, validCode)).rejects.toThrow('MFA non activé');
    });

    it('should throw error if TOTP code is invalid', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: userId, mfa_enabled: true, mfa_secret: secret }],
      });

      mockVerify.mockReturnValue(false);

      await expect(mfaService.regenerateBackupCodes(userId, 'invalid')).rejects.toThrow('Code TOTP invalide');
    });
  });

  describe('Private methods', () => {
    describe('formatSecretForManualEntry', () => {
      it('should format secret in groups of 4', () => {
        // Access private method through any
        const formatted = (mfaService as any).formatSecretForManualEntry('JBSWY3DPEHPK3PXP');

        expect(formatted).toBe('JBSW Y3DP EHPK 3PXP');
      });

      it('should handle short secrets', () => {
        const formatted = (mfaService as any).formatSecretForManualEntry('ABC');

        expect(formatted).toBe('ABC');
      });
    });

    describe('generateBackupCodes', () => {
      it('should generate specified number of codes', () => {
        const codes = (mfaService as any).generateBackupCodes(5);

        expect(codes).toHaveLength(5);
        codes.forEach((code: string) => {
          expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
        });
      });

      it('should generate unique codes', () => {
        const codes = (mfaService as any).generateBackupCodes(100);
        const uniqueCodes = new Set(codes);

        expect(uniqueCodes.size).toBe(100);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty backup codes array', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ mfa_secret: 'SECRET', mfa_backup_codes: '[]' }],
      });

      mockVerify.mockReturnValue(false);

      const result = await mfaService.verifyMfaLogin('user-123', 'BACKUP');

      expect(result.valid).toBe(false);
    });

    it('should handle null backup codes', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ mfa_secret: 'SECRET', mfa_backup_codes: null }],
      });

      mockVerify.mockReturnValue(false);

      const result = await mfaService.verifyMfaLogin('user-123', 'BACKUP');

      expect(result.valid).toBe(false);
    });

    it('should handle database errors gracefully in setupMfa', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(mfaService.setupMfa('user-123', 'test@example.com')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });
});
