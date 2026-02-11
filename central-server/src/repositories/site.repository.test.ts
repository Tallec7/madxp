/**
 * Tests unitaires pour siteRepository
 *
 * Teste les méthodes du repository de sites:
 * - findByApiKey, findById (hérité)
 * - findWithPagination (filtres + pagination)
 * - findOnline, findOfflineSince
 * - updateStatus, updateLastSeen, updateSoftwareVersion
 * - getDashboardRows (projection + pagination)
 * - getSitesWithExpiringSoon, getSuspendedSites
 */

const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  getClient: jest.fn(),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { siteRepository } from './site.repository';

describe('SiteRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // findByApiKey
  // --------------------------------------------------------------------------

  describe('findByApiKey', () => {
    it('should return site when API key matches', async () => {
      const mockSite = { id: 'site-1', site_name: 'Test Club', api_key: 'key-123' };
      mockQuery.mockResolvedValue({ rows: [mockSite] });

      const result = await siteRepository.findByApiKey('key-123');

      expect(result).toEqual(mockSite);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM sites WHERE api_key = $1',
        ['key-123']
      );
    });

    it('should return null when API key not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await siteRepository.findByApiKey('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // findById (inherited from BaseRepository)
  // --------------------------------------------------------------------------

  describe('findById', () => {
    it('should return site by ID', async () => {
      const mockSite = { id: 'site-1', site_name: 'Test Club' };
      mockQuery.mockResolvedValue({ rows: [mockSite] });

      const result = await siteRepository.findById('site-1');

      expect(result).toEqual(mockSite);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM sites WHERE id = $1',
        ['site-1']
      );
    });

    it('should return null when site not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await siteRepository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // findWithPagination
  // --------------------------------------------------------------------------

  describe('findWithPagination', () => {
    it('should return paginated results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: 15 }] })   // count query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }, { id: 's2' }] }); // data query

      const result = await siteRepository.findWithPagination({}, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(15);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.totalPages).toBe(2);
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })
        .mockResolvedValueOnce({ rows: [] });

      await siteRepository.findWithPagination({ status: 'online' }, { page: 1, limit: 10 });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('status = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('online');
    });

    it('should filter by status array', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      await siteRepository.findWithPagination(
        { status: ['online', 'maintenance'] },
        { page: 1, limit: 10 }
      );

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('status = ANY($1)');
    });

    it('should filter by search term', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      await siteRepository.findWithPagination({ search: 'tennis' }, { page: 1, limit: 10 });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('ILIKE');
      expect(mockQuery.mock.calls[0][1]).toContain('%tennis%');
    });

    it('should filter by sport', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: 2 }] })
        .mockResolvedValueOnce({ rows: [] });

      await siteRepository.findWithPagination({ sport: 'football' }, { page: 1, limit: 10 });

      expect(mockQuery.mock.calls[0][1]).toContain('football');
    });

    it('should calculate correct offset for page 2', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: 25 }] })
        .mockResolvedValueOnce({ rows: [] });

      await siteRepository.findWithPagination({}, { page: 2, limit: 10 });

      // Offset should be 10 for page 2
      const dataParams = mockQuery.mock.calls[1][1] as unknown[];
      expect(dataParams).toContain(10); // offset
    });
  });

  // --------------------------------------------------------------------------
  // findOnline
  // --------------------------------------------------------------------------

  describe('findOnline', () => {
    it('should return online sites', async () => {
      const mockSites = [{ id: 's1', status: 'online' }];
      mockQuery.mockResolvedValue({ rows: mockSites });

      const result = await siteRepository.findOnline();

      expect(result).toEqual(mockSites);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("status = 'online'");
    });
  });

  // --------------------------------------------------------------------------
  // updateStatus
  // --------------------------------------------------------------------------

  describe('updateStatus', () => {
    it('should update site status', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await siteRepository.updateStatus('site-1', 'maintenance');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sites SET status = $1'),
        ['maintenance', 'site-1']
      );
    });
  });

  // --------------------------------------------------------------------------
  // updateLastSeen
  // --------------------------------------------------------------------------

  describe('updateLastSeen', () => {
    it('should update last_seen_at and set status to online', async () => {
      const now = new Date();
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await siteRepository.updateLastSeen('site-1', now);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('last_seen_at = $1'),
        [now.toISOString(), 'online', 'site-1']
      );
    });
  });

  // --------------------------------------------------------------------------
  // updateSoftwareVersion
  // --------------------------------------------------------------------------

  describe('updateSoftwareVersion', () => {
    it('should update software version', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await siteRepository.updateSoftwareVersion('site-1', '2.5.0');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('software_version = $1'),
        ['2.5.0', 'site-1']
      );
    });
  });

  // --------------------------------------------------------------------------
  // getDashboardRows
  // --------------------------------------------------------------------------

  describe('getDashboardRows', () => {
    it('should return dashboard rows with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: 50 }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 's1',
            site_name: 'Club A',
            club_name: 'Club A FC',
            status: 'online',
            suspended: false,
          }],
        });

      const result = await siteRepository.getDashboardRows({}, { page: 1, limit: 50 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(50);
      // Should SELECT only dashboard columns (not *)
      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain('site_name');
      expect(dataSql).toContain('subscription_end');
      expect(dataSql).not.toContain('SELECT *');
    });
  });

  // --------------------------------------------------------------------------
  // getSuspendedSites
  // --------------------------------------------------------------------------

  describe('getSuspendedSites', () => {
    it('should return suspended sites', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 's1', suspended: true }] });

      const result = await siteRepository.getSuspendedSites();

      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('suspended = true');
    });
  });

  // --------------------------------------------------------------------------
  // getSitesWithExpiringSoon
  // --------------------------------------------------------------------------

  describe('getSitesWithExpiringSoon', () => {
    it('should query sites expiring within N days', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await siteRepository.getSitesWithExpiringSoon(30);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('subscription_end'),
        ['30 days']
      );
    });
  });
});
