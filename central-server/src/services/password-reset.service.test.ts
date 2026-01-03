import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Mock dependencies before importing the service
const mockQuery = jest.fn();
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../config/database', () => ({
  query: mockQuery,
}));

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: mockLogger,
}));

// Import after mocking
import { passwordResetService } from './password-reset.service';

describe('PasswordResetService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestReset', () => {
    const testEmail = 'test@example.com';
    const userId = 'user-123';

    it('should return null for non-existent email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await passwordResetService.requestReset(testEmail);

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Password reset requested for non-existent or inactive email',
        expect.any(Object)
      );
    });

    it('should generate token for existing active user', async () => {
      // User lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: userId, email: testEmail }],
      });
      // Delete existing tokens
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      // Insert new token
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await passwordResetService.requestReset(testEmail);

      expect(result).not.toBeNull();
      expect(result?.token).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(result?.expiresAt).toBeInstanceOf(Date);
      expect(result?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should invalidate existing tokens before creating new one', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, email: testEmail }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // Delete
        .mockResolvedValueOnce({ rowCount: 1 }); // Insert

      await passwordResetService.requestReset(testEmail);

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM password_reset_tokens WHERE user_id = $1',
        [userId]
      );
    });

    it('should store hashed token, not plain token', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, email: testEmail }] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await passwordResetService.requestReset(testEmail);

      // Verify the INSERT call uses a hashed token (different from plain token)
      const insertCall = mockQuery.mock.calls[2];
      const storedTokenHash = insertCall[1][1]; // Second param is token_hash

      // Hash the returned token and verify it matches what was stored
      const expectedHash = crypto.createHash('sha256').update(result!.token).digest('hex');
      expect(storedTokenHash).toBe(expectedHash);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockQuery.mockRejectedValueOnce(dbError);

      await expect(passwordResetService.requestReset(testEmail)).rejects.toThrow(
        'Database connection failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error creating password reset token:',
        dbError
      );
    });

    it('should lowercase email before lookup', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await passwordResetService.requestReset('TEST@EXAMPLE.COM');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, email FROM users'),
        ['test@example.com', 'active']
      );
    });
  });

  describe('verifyToken', () => {
    const validToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(validToken).digest('hex');

    it('should return user info for valid token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: 'user-123', email: 'test@example.com' }],
      });

      const result = await passwordResetService.verifyToken(validToken);

      expect(result).toEqual({
        userId: 'user-123',
        email: 'test@example.com',
      });
    });

    it('should return null for invalid token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await passwordResetService.verifyToken('invalid-token');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid or expired password reset token attempt'
      );
    });

    it('should query with hashed token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await passwordResetService.verifyToken(validToken);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE prt.token_hash = $1'),
        [tokenHash]
      );
    });

    it('should check token is not expired and not used', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await passwordResetService.verifyToken(validToken);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('expires_at > NOW()'),
        expect.any(Array)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('used_at IS NULL'),
        expect.any(Array)
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query timeout');
      mockQuery.mockRejectedValueOnce(dbError);

      await expect(passwordResetService.verifyToken(validToken)).rejects.toThrow('Query timeout');
      expect(mockLogger.error).toHaveBeenCalledWith('Error verifying reset token:', dbError);
    });
  });

  describe('resetPassword', () => {
    const validToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(validToken).digest('hex');
    const newPassword = 'NewSecurePassword123!';

    it('should return false for invalid token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await passwordResetService.resetPassword('invalid-token', newPassword);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid password reset attempt - token not found or expired'
      );
    });

    it('should update password and mark token as used', async () => {
      // Token lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'token-123', user_id: 'user-123' }],
      });
      // BEGIN transaction
      mockQuery.mockResolvedValueOnce({});
      // UPDATE users password
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      // UPDATE token used_at
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      // COMMIT
      mockQuery.mockResolvedValueOnce({});

      const result = await passwordResetService.resetPassword(validToken, newPassword);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('should hash the new password with bcrypt', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'token-123', user_id: 'user-123' }] })
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE users
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE token
        .mockResolvedValueOnce({}); // COMMIT

      await passwordResetService.resetPassword(validToken, newPassword);

      // Get the UPDATE users call
      const updateUserCall = mockQuery.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('UPDATE users SET password_hash')
      );

      expect(updateUserCall).toBeDefined();
      const hashedPassword = updateUserCall![1][0];

      // Verify the hash is valid bcrypt
      const isValid = await bcrypt.compare(newPassword, hashedPassword);
      expect(isValid).toBe(true);
    });

    it('should rollback on error', async () => {
      const dbError = new Error('Update failed');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'token-123', user_id: 'user-123' }] })
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(dbError); // UPDATE fails

      // ROLLBACK mock
      mockQuery.mockResolvedValueOnce({});

      await expect(passwordResetService.resetPassword(validToken, newPassword)).rejects.toThrow(
        'Update failed'
      );
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should log success on password reset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'token-123', user_id: 'user-123' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({});

      await passwordResetService.resetPassword(validToken, newPassword);

      expect(mockLogger.info).toHaveBeenCalledWith('Password reset successfully', {
        userId: 'user-123',
      });
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens older than 7 days', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });

      const result = await passwordResetService.cleanupExpiredTokens();

      expect(result).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("expires_at < NOW() - INTERVAL '7 days'")
      );
    });

    it('should log when tokens are cleaned up', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });

      await passwordResetService.cleanupExpiredTokens();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaned up expired password reset tokens',
        { count: 3 }
      );
    });

    it('should not log when no tokens to clean', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await passwordResetService.cleanupExpiredTokens();

      expect(result).toBe(0);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should return 0 on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await passwordResetService.cleanupExpiredTokens();

      expect(result).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error cleaning up expired tokens:',
        expect.any(Error)
      );
    });
  });
});
