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

import { agencyRepository } from './agency.repository';

describe('AgencyRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // CRUD
  // ==========================================================================

  describe('findAllWithSiteCount', () => {
    it('should return all agencies with site counts', async () => {
      const mockAgencies = [
        { id: 'a1', name: 'Agency A', site_count: 5 },
        { id: 'a2', name: 'Agency B', site_count: 3 },
      ];
      mockQuery.mockResolvedValue({ rows: mockAgencies, rowCount: 2 });

      const result = await agencyRepository.findAllWithSiteCount();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Agency A');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('FROM agencies a');
      expect(sql).toContain('site_count');
      expect(sql).toContain('ORDER BY a.name ASC');
    });
  });

  describe('findAgencyById', () => {
    it('should return agency when found', async () => {
      const mockAgency = { id: 'a1', name: 'Test Agency', status: 'active' };
      mockQuery.mockResolvedValue({ rows: [mockAgency], rowCount: 1 });

      const result = await agencyRepository.findAgencyById('a1');

      expect(result).toEqual(mockAgency);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['a1']
      );
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await agencyRepository.findAgencyById('a-x');

      expect(result).toBeNull();
    });
  });

  describe('createAgency', () => {
    it('should insert a new agency and return it', async () => {
      const mockAgency = { id: 'a1', name: 'New Agency', status: 'active' };
      mockQuery.mockResolvedValue({ rows: [mockAgency], rowCount: 1 });

      const result = await agencyRepository.createAgency({
        name: 'New Agency',
        contact_email: 'test@agency.com',
      });

      expect(result).toEqual(mockAgency);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO agencies');
      expect(sql).toContain('RETURNING *');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('New Agency');
      expect(params[4]).toBe('test@agency.com');
    });
  });

  describe('updateAgency', () => {
    it('should update agency and return updated record', async () => {
      const mockAgency = { id: 'a1', name: 'Updated Agency', status: 'active' };
      mockQuery.mockResolvedValue({ rows: [mockAgency], rowCount: 1 });

      const result = await agencyRepository.updateAgency('a1', { name: 'Updated Agency' });

      expect(result).toEqual(mockAgency);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE agencies');
      expect(sql).toContain('COALESCE');
      expect(sql).toContain('RETURNING *');
    });

    it('should return null when agency not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await agencyRepository.updateAgency('a-x', { name: 'X' });

      expect(result).toBeNull();
    });
  });

  describe('deleteAgency', () => {
    it('should delete agency and return true', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await agencyRepository.deleteAgency('a1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM agencies WHERE id = $1'),
        ['a1']
      );
    });

    it('should return false when agency not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await agencyRepository.deleteAgency('a-x');

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // AGENCY-SITE ASSOCIATION
  // ==========================================================================

  describe('addSites', () => {
    it('should insert agency-site associations', async () => {
      mockQuery.mockResolvedValue({ rowCount: 2 });

      await agencyRepository.addSites('a1', ['s1', 's2'], 'user-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO agency_sites');
      expect(sql).toContain('ON CONFLICT (agency_id, site_id) DO NOTHING');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('a1');
      expect(params[1]).toBe('s1');
      expect(params[2]).toBe('s2');
      expect(params[3]).toBe('user-1');
    });
  });

  describe('removeSite', () => {
    it('should remove site from agency and return true', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await agencyRepository.removeSite('a1', 's1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM agency_sites'),
        ['a1', 's1']
      );
    });

    it('should return false when association not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await agencyRepository.removeSite('a1', 's-x');

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // AGENCY PORTAL
  // ==========================================================================

  describe('findDashboardStats', () => {
    it('should return dashboard stats for agency', async () => {
      const mockStats = {
        total_sites: 5,
        online_sites: 3,
        offline_sites: 2,
        total_videos_played_30d: 1000,
        total_screen_time_30d: 50000,
      };
      mockQuery.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      const result = await agencyRepository.findDashboardStats('a1');

      expect(result).toEqual(mockStats);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('agency_sites');
      expect(sql).toContain('club_daily_stats');
      expect(sql).toContain("INTERVAL '30 days'");
    });
  });

  describe('findPortalSites', () => {
    it('should return portal sites with 30d stats', async () => {
      const mockSites = [
        { site_id: 's1', site_name: 'Site A', videos_played_30d: 100, screen_time_30d: 5000 },
        { site_id: 's2', site_name: 'Site B', videos_played_30d: 200, screen_time_30d: 8000 },
      ];
      mockQuery.mockResolvedValue({ rows: mockSites, rowCount: 2 });

      const result = await agencyRepository.findPortalSites('a1');

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('agency_sites');
      expect(sql).toContain('club_daily_stats');
      expect(sql).toContain('ORDER BY s.club_name ASC');
    });
  });

  describe('siteBelongsToAgency', () => {
    it('should return true when site belongs to agency', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await agencyRepository.sitebelongsToAgency('a1', 's1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('agency_sites WHERE agency_id = $1 AND site_id = $2'),
        ['a1', 's1']
      );
    });

    it('should return false when site does not belong', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await agencyRepository.sitebelongsToAgency('a1', 's-x');

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // AGENCY STATS
  // ==========================================================================

  describe('findAgencySiteIds', () => {
    it('should return array of site IDs', async () => {
      mockQuery.mockResolvedValue({ rows: [{ site_id: 's1' }, { site_id: 's2' }], rowCount: 2 });

      const result = await agencyRepository.findAgencySiteIds('a1');

      expect(result).toEqual(['s1', 's2']);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT site_id FROM agency_sites'),
        ['a1']
      );
    });

    it('should return empty array when no sites', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await agencyRepository.findAgencySiteIds('a-x');

      expect(result).toEqual([]);
    });
  });

  describe('findStatsSummary', () => {
    it('should return summary stats for given sites and period', async () => {
      const mockSummary = {
        total_sites: 3,
        total_videos: 500,
        total_screen_time: 25000,
        avg_uptime: 98.5,
      };
      mockQuery.mockResolvedValue({ rows: [mockSummary], rowCount: 1 });

      const result = await agencyRepository.findStatsSummary(['s1', 's2'], '2025-01-01', '2025-01-31');

      expect(result).toEqual(mockSummary);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('club_daily_stats');
      expect(sql).toContain('ANY($1::uuid[])');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toEqual(['s1', 's2']);
      expect(params[1]).toBe('2025-01-01');
      expect(params[2]).toBe('2025-01-31');
    });
  });

  describe('findStatsBySite', () => {
    it('should return per-site stats', async () => {
      const mockBySite = [
        { site_id: 's1', site_name: 'Site A', club_name: 'Club A', videos_played: 300, screen_time: 15000, avg_uptime: 99.0 },
        { site_id: 's2', site_name: 'Site B', club_name: 'Club B', videos_played: 200, screen_time: 10000, avg_uptime: 97.5 },
      ];
      mockQuery.mockResolvedValue({ rows: mockBySite, rowCount: 2 });

      const result = await agencyRepository.findStatsBySite(['s1', 's2'], '2025-01-01', '2025-01-31');

      expect(result).toHaveLength(2);
      expect(result[0].site_id).toBe('s1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('GROUP BY s.id');
      expect(sql).toContain('ORDER BY videos_played DESC');
    });
  });

  describe('findStatsTrends', () => {
    it('should return daily trend data', async () => {
      const mockTrends = [
        { date: '2025-01-01', videos_played: 50, screen_time: 2500 },
        { date: '2025-01-02', videos_played: 60, screen_time: 3000 },
      ];
      mockQuery.mockResolvedValue({ rows: mockTrends, rowCount: 2 });

      const result = await agencyRepository.findStatsTrends(['s1'], '2025-01-01', '2025-01-02');

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('GROUP BY DATE(date)');
      expect(sql).toContain('ORDER BY date ASC');
    });
  });
});
