import crypto from 'crypto';
import { query } from '../config/database';
import logger from '../config/logger';

// ============================================================================
// SPONSOR ACCESS SERVICE
// Handles magic link token generation, validation for site_sponsors portal
// Pattern: calqué sur password-reset.service.ts
// ============================================================================

interface AccessTokenResult {
  token: string;
  expiresAt: Date;
}

interface TokenValidation {
  siteSponsorId: string;
  siteId: string;
  sponsorName: string;
  clubName: string;
  contactEmail: string | null;
}

class SponsorAccessService {
  private readonly TOKEN_EXPIRY_DAYS = 30;
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
   * Creates an access link for a site sponsor
   * Invalidates any existing tokens for this sponsor first
   */
  async createAccessLink(siteSponsorId: string): Promise<AccessTokenResult | null> {
    try {
      // Verify sponsor exists
      const sponsorResult = await query<{ id: string; name: string }>(
        'SELECT id, name FROM site_sponsors WHERE id = $1',
        [siteSponsorId]
      );

      if (sponsorResult.rows.length === 0) {
        logger.warn('Access link requested for non-existent site sponsor', { siteSponsorId });
        return null;
      }

      // Invalidate existing tokens for this sponsor
      await query(
        'DELETE FROM sponsor_access_tokens WHERE site_sponsor_id = $1',
        [siteSponsorId]
      );

      // Generate new token
      const token = this.generateToken();
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      // Store the token hash (never the plain token)
      await query(
        `INSERT INTO sponsor_access_tokens (site_sponsor_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [siteSponsorId, tokenHash, expiresAt]
      );

      logger.info('Sponsor access token created', {
        siteSponsorId,
        sponsorName: sponsorResult.rows[0].name,
        expiresAt: expiresAt.toISOString(),
      });

      return { token, expiresAt };
    } catch (error) {
      logger.error('Error creating sponsor access token:', error);
      throw error;
    }
  }

  /**
   * Verifies if an access token is valid (exists and not expired)
   * Returns sponsor info if valid, null otherwise
   */
  async verifyToken(token: string): Promise<TokenValidation | null> {
    try {
      const tokenHash = this.hashToken(token);

      const result = await query<{
        site_sponsor_id: string;
        site_id: string;
        sponsor_name: string;
        club_name: string;
        contact_email: string | null;
      }>(
        `SELECT sat.site_sponsor_id,
                ss.site_id,
                ss.name as sponsor_name,
                s.club_name,
                ss.contact_email
         FROM sponsor_access_tokens sat
         JOIN site_sponsors ss ON ss.id = sat.site_sponsor_id
         JOIN sites s ON s.id = ss.site_id
         WHERE sat.token_hash = $1
           AND sat.expires_at > NOW()
           AND sat.used_at IS NULL`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        logger.warn('Invalid or expired sponsor access token attempt');
        return null;
      }

      const row = result.rows[0];
      return {
        siteSponsorId: row.site_sponsor_id,
        siteId: row.site_id,
        sponsorName: row.sponsor_name,
        clubName: row.club_name,
        contactEmail: row.contact_email,
      };
    } catch (error) {
      logger.error('Error verifying sponsor access token:', error);
      throw error;
    }
  }

  /**
   * Cleans up expired tokens (can be called periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await query(
        'DELETE FROM sponsor_access_tokens WHERE expires_at < NOW() - INTERVAL \'7 days\''
      );

      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        logger.info('Cleaned up expired sponsor access tokens', { count: deletedCount });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up expired sponsor access tokens:', error);
      return 0;
    }
  }
}

export const sponsorAccessService = new SponsorAccessService();
