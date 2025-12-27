import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import logger from '../config/logger';

// ============================================================================
// PASSWORD RESET SERVICE
// Handles password reset token generation, validation, and password update
// ============================================================================

interface ResetTokenResult {
  token: string;
  expiresAt: Date;
}

interface TokenValidation {
  userId: string;
  email: string;
}

class PasswordResetService {
  private readonly TOKEN_EXPIRY_HOURS = 24;
  private readonly TOKEN_LENGTH = 32; // 32 bytes = 64 hex chars

  /**
   * Generates a cryptographically secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(this.TOKEN_LENGTH).toString('hex');
  }

  /**
   * Hashes a token using SHA256 for secure storage
   * We never store the plain token in the database
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Requests a password reset for the given email
   * Returns the token and expiration date if the email exists
   * Returns null if email doesn't exist (but we don't reveal this to the client)
   */
  async requestReset(email: string): Promise<ResetTokenResult | null> {
    try {
      // Check if user exists
      const userResult = await query<{ id: string; email: string }>(
        'SELECT id, email FROM users WHERE email = $1 AND status = $2',
        [email.toLowerCase(), 'active']
      );

      if (userResult.rows.length === 0) {
        // Don't reveal if email exists - just log and return null
        logger.info('Password reset requested for non-existent or inactive email', {
          email: email.substring(0, 3) + '***'
        });
        return null;
      }

      const userId = userResult.rows[0].id;

      // Invalidate any existing tokens for this user
      await query(
        'DELETE FROM password_reset_tokens WHERE user_id = $1',
        [userId]
      );

      // Generate new token
      const token = this.generateToken();
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      // Store the token hash (never the plain token)
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt]
      );

      logger.info('Password reset token created', {
        userId,
        expiresAt: expiresAt.toISOString()
      });

      return { token, expiresAt };
    } catch (error) {
      logger.error('Error creating password reset token:', error);
      throw error;
    }
  }

  /**
   * Verifies if a reset token is valid (exists and not expired)
   * Returns user info if valid, null otherwise
   */
  async verifyToken(token: string): Promise<TokenValidation | null> {
    try {
      const tokenHash = this.hashToken(token);

      const result = await query<{ user_id: string; email: string }>(
        `SELECT prt.user_id, u.email
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         WHERE prt.token_hash = $1
           AND prt.expires_at > NOW()
           AND prt.used_at IS NULL`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        logger.warn('Invalid or expired password reset token attempt');
        return null;
      }

      return {
        userId: result.rows[0].user_id,
        email: result.rows[0].email,
      };
    } catch (error) {
      logger.error('Error verifying reset token:', error);
      throw error;
    }
  }

  /**
   * Resets the password using a valid token
   * Marks the token as used and updates the user's password
   */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      const tokenHash = this.hashToken(token);

      // Verify token and get user ID
      const tokenResult = await query<{ id: string; user_id: string }>(
        `SELECT id, user_id
         FROM password_reset_tokens
         WHERE token_hash = $1
           AND expires_at > NOW()
           AND used_at IS NULL`,
        [tokenHash]
      );

      if (tokenResult.rows.length === 0) {
        logger.warn('Invalid password reset attempt - token not found or expired');
        return false;
      }

      const { id: tokenId, user_id: userId } = tokenResult.rows[0];

      // Hash the new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Use transaction to update password and mark token as used
      await query('BEGIN');

      try {
        // Update user password
        await query(
          'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
          [passwordHash, userId]
        );

        // Mark token as used
        await query(
          'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
          [tokenId]
        );

        await query('COMMIT');

        logger.info('Password reset successfully', { userId });
        return true;
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error resetting password:', error);
      throw error;
    }
  }

  /**
   * Cleans up expired tokens (can be called periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await query(
        'DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL \'7 days\''
      );

      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        logger.info('Cleaned up expired password reset tokens', { count: deletedCount });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up expired tokens:', error);
      return 0;
    }
  }
}

export const passwordResetService = new PasswordResetService();
