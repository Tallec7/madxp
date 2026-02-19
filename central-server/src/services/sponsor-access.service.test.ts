import { sponsorAccessService } from './sponsor-access.service';

// Mock dependencies
jest.mock('../config/database', () => ({
  query: jest.fn(),
}));
jest.mock('../config/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  __esModule: true,
}));

import { query } from '../config/database';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('SponsorAccessService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAccessLink', () => {
    it('should create access link for existing sponsor', async () => {
      // Mock sponsor exists
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sponsor-1', name: 'Sponsor A' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as never);

      // Mock delete existing tokens
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'DELETE',
        oid: 0,
        fields: [],
      } as never);

      // Mock insert new token
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      } as never);

      const result = await sponsorAccessService.createAccessLink('sponsor-1');

      expect(result).not.toBeNull();
      expect(result!.token).toBeDefined();
      expect(result!.token.length).toBe(64); // 32 bytes in hex
      expect(result!.expiresAt).toBeInstanceOf(Date);
      expect(result!.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should return null for non-existent sponsor', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as never);

      const result = await sponsorAccessService.createAccessLink('non-existent');

      expect(result).toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should delete existing tokens before creating new one', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sponsor-1', name: 'Sponsor A' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as never);

      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 2,
        command: 'DELETE',
        oid: 0,
        fields: [],
      } as never);

      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      } as never);

      await sponsorAccessService.createAccessLink('sponsor-1');

      // Second call should be DELETE
      expect(mockQuery).toHaveBeenNthCalledWith(2,
        'DELETE FROM sponsor_access_tokens WHERE site_sponsor_id = $1',
        ['sponsor-1']
      );
    });
  });

  describe('verifyToken', () => {
    it('should return sponsor info for valid token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          site_sponsor_id: 'sponsor-1',
          site_id: 'site-1',
          sponsor_name: 'Sponsor A',
          club_name: 'Club FC',
          contact_email: 'contact@sponsor.com',
        }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as never);

      const result = await sponsorAccessService.verifyToken('valid-token-hex');

      expect(result).not.toBeNull();
      expect(result!.siteSponsorId).toBe('sponsor-1');
      expect(result!.siteId).toBe('site-1');
      expect(result!.sponsorName).toBe('Sponsor A');
      expect(result!.clubName).toBe('Club FC');
      expect(result!.contactEmail).toBe('contact@sponsor.com');
    });

    it('should return null for invalid/expired token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as never);

      const result = await sponsorAccessService.verifyToken('invalid-token');

      expect(result).toBeNull();
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens and return count', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 5,
        command: 'DELETE',
        oid: 0,
        fields: [],
      } as never);

      const count = await sponsorAccessService.cleanupExpiredTokens();

      expect(count).toBe(5);
    });

    it('should return 0 when no expired tokens', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'DELETE',
        oid: 0,
        fields: [],
      } as never);

      const count = await sponsorAccessService.cleanupExpiredTokens();

      expect(count).toBe(0);
    });

    it('should return 0 on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const count = await sponsorAccessService.cleanupExpiredTokens();

      expect(count).toBe(0);
    });
  });
});
