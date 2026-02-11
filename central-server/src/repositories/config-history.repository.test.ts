/**
 * Tests unitaires pour configHistoryRepository
 *
 * Teste les methodes du repository d'historique de configuration :
 * - findSiteBasic
 * - findBySitePaginated, countBySite
 * - findVersionWithUser
 * - findLastVersion
 * - insertVersion
 * - updateSitePendingConfigVersion
 * - findTwoVersionsForComparison
 * - findSiteLocalConfigMirror
 * - findLastConfigurationOnly
 */

const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { configHistoryRepository } from './config-history.repository';

describe('ConfigHistoryRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // findSiteBasic
  // --------------------------------------------------------------------------

  describe('findSiteBasic', () => {
    it('should return site basic info when site exists', async () => {
      const mockSite = { id: 'site-1', site_name: 'Club Alpha' };
      mockQuery.mockResolvedValue({ rows: [mockSite], rowCount: 1 });

      const result = await configHistoryRepository.findSiteBasic('site-1');

      expect(result).toEqual(mockSite);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id, site_name FROM sites WHERE id = $1',
        ['site-1']
      );
    });

    it('should return null when site does not exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configHistoryRepository.findSiteBasic('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // findBySitePaginated
  // --------------------------------------------------------------------------

  describe('findBySitePaginated', () => {
    it('should return paginated config history with user info', async () => {
      const mockRows = [
        {
          id: 'v1',
          site_id: 'site-1',
          configuration: { sponsors: [] },
          deployed_by: 'user-1',
          deployed_at: new Date(),
          comment: 'Initial',
          changes_summary: [],
          deployed_by_email: 'admin@test.com',
          deployed_by_name: 'Admin',
        },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows, rowCount: 1 });

      const result = await configHistoryRepository.findBySitePaginated('site-1', 20, 0);

      expect(result).toHaveLength(1);
      expect(result[0].deployed_by_email).toBe('admin@test.com');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('LEFT JOIN users u ON ch.deployed_by = u.id');
      expect(sql).toContain('WHERE ch.site_id = $1');
      expect(sql).toContain('LIMIT $2 OFFSET $3');
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['site-1', 20, 0]);
    });
  });

  // --------------------------------------------------------------------------
  // countBySite
  // --------------------------------------------------------------------------

  describe('countBySite', () => {
    it('should return the count of config history entries for a site', async () => {
      mockQuery.mockResolvedValue({ rows: [{ total: '15' }], rowCount: 1 });

      const count = await configHistoryRepository.countBySite('site-1');

      expect(count).toBe(15);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT COUNT(*) as total FROM config_history WHERE site_id = $1',
        ['site-1']
      );
    });

    it('should return 0 when no entries exist', async () => {
      mockQuery.mockResolvedValue({ rows: [{ total: '0' }], rowCount: 1 });

      const count = await configHistoryRepository.countBySite('site-1');

      expect(count).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // findVersionWithUser
  // --------------------------------------------------------------------------

  describe('findVersionWithUser', () => {
    it('should return a specific version with user details', async () => {
      const mockVersion = {
        id: 'v1',
        site_id: 'site-1',
        configuration: { sponsors: [] },
        deployed_by: 'user-1',
        deployed_at: new Date(),
        comment: 'Deploy v1',
        changes_summary: [],
        deployed_by_email: 'admin@test.com',
        deployed_by_name: 'Admin',
      };
      mockQuery.mockResolvedValue({ rows: [mockVersion], rowCount: 1 });

      const result = await configHistoryRepository.findVersionWithUser('v1', 'site-1');

      expect(result).toEqual(mockVersion);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ch.id = $1 AND ch.site_id = $2'),
        ['v1', 'site-1']
      );
    });

    it('should return null when version not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configHistoryRepository.findVersionWithUser('nonexistent', 'site-1');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // findLastVersion
  // --------------------------------------------------------------------------

  describe('findLastVersion', () => {
    it('should return the last version for a site', async () => {
      const mockVersion = { id: 'v3', configuration: { sponsors: [{ id: 's1' }] } };
      mockQuery.mockResolvedValue({ rows: [mockVersion], rowCount: 1 });

      const result = await configHistoryRepository.findLastVersion('site-1');

      expect(result).toEqual(mockVersion);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY deployed_at DESC');
      expect(sql).toContain('LIMIT 1');
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['site-1']);
    });

    it('should return null when no versions exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configHistoryRepository.findLastVersion('site-1');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // insertVersion
  // --------------------------------------------------------------------------

  describe('insertVersion', () => {
    it('should insert a new config version and return it', async () => {
      const mockInserted = {
        id: 'v-new',
        site_id: 'site-1',
        configuration: { sponsors: [] },
        deployed_by: 'user-1',
        deployed_at: new Date(),
        comment: 'New version',
        changes_summary: '[]',
      };
      mockQuery.mockResolvedValue({ rows: [mockInserted], rowCount: 1 });

      const result = await configHistoryRepository.insertVersion({
        id: 'v-new',
        site_id: 'site-1',
        configuration: '{"sponsors":[]}',
        deployed_by: 'user-1',
        comment: 'New version',
        previous_version_id: 'v-old',
        changes_summary: '[]',
      });

      expect(result).toEqual(mockInserted);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO config_history');
      expect(sql).toContain('RETURNING');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['v-new', 'site-1', '{"sponsors":[]}', 'user-1', 'New version', 'v-old', '[]']
      );
    });
  });

  // --------------------------------------------------------------------------
  // updateSitePendingConfigVersion
  // --------------------------------------------------------------------------

  describe('updateSitePendingConfigVersion', () => {
    it('should update the pending config version id on the site', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await configHistoryRepository.updateSitePendingConfigVersion('site-1', 'v-new');

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE sites SET pending_config_version_id = $1 WHERE id = $2',
        ['v-new', 'site-1']
      );
    });
  });

  // --------------------------------------------------------------------------
  // findTwoVersionsForComparison
  // --------------------------------------------------------------------------

  describe('findTwoVersionsForComparison', () => {
    it('should return two versions for comparison', async () => {
      const mockVersions = [
        { id: 'v1', configuration: { sponsors: [] }, deployed_at: new Date() },
        { id: 'v2', configuration: { sponsors: [{ id: 's1' }] }, deployed_at: new Date() },
      ];
      mockQuery.mockResolvedValue({ rows: mockVersions, rowCount: 2 });

      const result = await configHistoryRepository.findTwoVersionsForComparison('site-1', 'v1', 'v2');

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE site_id = $1 AND id IN ($2, $3)');
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['site-1', 'v1', 'v2']);
    });

    it('should return empty array when versions not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configHistoryRepository.findTwoVersionsForComparison('site-1', 'v-x', 'v-y');

      expect(result).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // findSiteLocalConfigMirror
  // --------------------------------------------------------------------------

  describe('findSiteLocalConfigMirror', () => {
    it('should return local config mirror for a site', async () => {
      const mockRow = { local_config_mirror: { sponsors: [], categories: [] } };
      mockQuery.mockResolvedValue({ rows: [mockRow], rowCount: 1 });

      const result = await configHistoryRepository.findSiteLocalConfigMirror('site-1');

      expect(result).toEqual(mockRow);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT local_config_mirror FROM sites WHERE id = $1',
        ['site-1']
      );
    });

    it('should return null when site not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configHistoryRepository.findSiteLocalConfigMirror('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // findLastConfigurationOnly
  // --------------------------------------------------------------------------

  describe('findLastConfigurationOnly', () => {
    it('should return only the configuration of the last version', async () => {
      const mockRow = { configuration: { sponsors: [{ id: 's1' }] } };
      mockQuery.mockResolvedValue({ rows: [mockRow], rowCount: 1 });

      const result = await configHistoryRepository.findLastConfigurationOnly('site-1');

      expect(result).toEqual(mockRow);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('SELECT configuration FROM config_history');
      expect(sql).toContain('ORDER BY deployed_at DESC');
      expect(sql).toContain('LIMIT 1');
    });

    it('should return null when no versions exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configHistoryRepository.findLastConfigurationOnly('site-1');

      expect(result).toBeNull();
    });
  });
});
