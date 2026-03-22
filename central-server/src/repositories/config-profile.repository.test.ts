/**
 * Tests unitaires pour configProfileRepository
 *
 * Teste les methodes du repository de profils de configuration :
 * - findBySite
 * - findDefaultForSite
 * - countBySite
 * - create
 * - update
 * - setDefault
 * - findProfilesMetadata
 * - findById (inherited)
 * - deleteById (inherited)
 */

const mockQuery = jest.fn();
const mockGetClient = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  getClient: () => mockGetClient(),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { configProfileRepository } from './config-profile.repository';

describe('ConfigProfileRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // findBySite
  // --------------------------------------------------------------------------

  describe('findBySite', () => {
    it('should return all profiles for a site sorted by sort_order', async () => {
      const mockProfiles = [
        { id: 'p1', site_id: 'site-1', name: 'Default', sort_order: 0, is_default: true },
        { id: 'p2', site_id: 'site-1', name: 'Tournoi', sort_order: 1, is_default: false },
      ];
      mockQuery.mockResolvedValue({ rows: mockProfiles, rowCount: 2 });

      const result = await configProfileRepository.findBySite('site-1');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Default');
      expect(result[1].name).toBe('Tournoi');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE site_id = $1');
      expect(sql).toContain('ORDER BY sort_order ASC');
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['site-1']);
    });

    it('should return empty array when site has no profiles', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configProfileRepository.findBySite('site-1');

      expect(result).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // findDefaultForSite
  // --------------------------------------------------------------------------

  describe('findDefaultForSite', () => {
    it('should return the default profile for a site', async () => {
      const mockProfile = { id: 'p1', site_id: 'site-1', name: 'Default', is_default: true };
      mockQuery.mockResolvedValue({ rows: [mockProfile], rowCount: 1 });

      const result = await configProfileRepository.findDefaultForSite('site-1');

      expect(result).toEqual(mockProfile);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE site_id = $1 AND is_default = true');
      expect(sql).toContain('LIMIT 1');
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['site-1']);
    });

    it('should return null when no default profile exists', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configProfileRepository.findDefaultForSite('site-1');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // countBySite
  // --------------------------------------------------------------------------

  describe('countBySite', () => {
    it('should return the count of profiles for a site', async () => {
      mockQuery.mockResolvedValue({ rows: [{ total: '3' }], rowCount: 1 });

      const count = await configProfileRepository.countBySite('site-1');

      expect(count).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT COUNT(*) as total FROM config_profiles WHERE site_id = $1',
        ['site-1']
      );
    });

    it('should return 0 when no profiles exist', async () => {
      mockQuery.mockResolvedValue({ rows: [{ total: '0' }], rowCount: 1 });

      const count = await configProfileRepository.countBySite('site-1');

      expect(count).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // create
  // --------------------------------------------------------------------------

  describe('create', () => {
    it('should create a profile with all fields', async () => {
      const mockCreated = {
        id: 'p-new',
        site_id: 'site-1',
        name: 'Tournoi U15',
        display_name: 'Tournoi U15',
        city: 'Lyon',
        sport: 'Football',
        sort_order: 1,
        is_default: false,
        configuration: { sponsors: [] },
        created_by: 'user-1',
      };
      mockQuery.mockResolvedValue({ rows: [mockCreated], rowCount: 1 });

      const result = await configProfileRepository.create({
        siteId: 'site-1',
        name: 'Tournoi U15',
        displayName: 'Tournoi U15',
        city: 'Lyon',
        sport: 'Football',
        sortOrder: 1,
        isDefault: false,
        configuration: { sponsors: [] },
        createdBy: 'user-1',
      });

      expect(result).toEqual(mockCreated);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO config_profiles');
      expect(sql).toContain('RETURNING *');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['site-1', 'Tournoi U15', 'Tournoi U15', 'Lyon', 'Football', 1, false, '{"sponsors":[]}', 'user-1']
      );
    });

    it('should use defaults for optional fields', async () => {
      const mockCreated = { id: 'p-new', site_id: 'site-1', name: 'Basic' };
      mockQuery.mockResolvedValue({ rows: [mockCreated], rowCount: 1 });

      await configProfileRepository.create({
        siteId: 'site-1',
        name: 'Basic',
        configuration: {},
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['site-1', 'Basic', null, null, null, 0, false, '{}', null]
      );
    });
  });

  // --------------------------------------------------------------------------
  // update
  // --------------------------------------------------------------------------

  describe('update', () => {
    it('should update specified fields only', async () => {
      const mockUpdated = { id: 'p1', name: 'Renamed', display_name: 'New Display' };
      mockQuery.mockResolvedValue({ rows: [mockUpdated], rowCount: 1 });

      const result = await configProfileRepository.update('p1', {
        name: 'Renamed',
        displayName: 'New Display',
      });

      expect(result).toEqual(mockUpdated);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE config_profiles SET');
      expect(sql).toContain('WHERE id =');
      expect(sql).toContain('RETURNING *');
    });

    it('should return current profile when no fields to update', async () => {
      const mockExisting = { id: 'p1', name: 'Default' };
      mockQuery.mockResolvedValue({ rows: [mockExisting], rowCount: 1 });

      const result = await configProfileRepository.update('p1', {});

      expect(result).toEqual(mockExisting);
      // Should call findById (SELECT * FROM config_profiles WHERE id = $1)
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('SELECT * FROM config_profiles WHERE id = $1');
    });

    it('should return null when profile not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configProfileRepository.update('nonexistent', { name: 'X' });

      expect(result).toBeNull();
    });

    it('should stringify configuration when updating', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'p1' }], rowCount: 1 });

      await configProfileRepository.update('p1', {
        configuration: { sponsors: [{ id: 's1' }] },
      });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('{"sponsors":[{"id":"s1"}]}');
    });
  });

  // --------------------------------------------------------------------------
  // setDefault
  // --------------------------------------------------------------------------

  describe('setDefault', () => {
    it('should unset old default and set new default in a transaction', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
        release: jest.fn(),
      };
      mockGetClient.mockResolvedValue(mockClient);

      await configProfileRepository.setDefault('site-1', 'p2');

      // BEGIN, unset old, set new, COMMIT
      expect(mockClient.query).toHaveBeenCalledTimes(4);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE config_profiles SET is_default = false WHERE site_id = $1 AND is_default = true',
        ['site-1']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE config_profiles SET is_default = true WHERE id = $1 AND site_id = $2',
        ['p2', 'site-1']
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockRejectedValueOnce(new Error('DB error')), // unset fails
        release: jest.fn(),
      };
      mockGetClient.mockResolvedValue(mockClient);

      await expect(configProfileRepository.setDefault('site-1', 'p2')).rejects.toThrow('DB error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // findProfilesMetadata
  // --------------------------------------------------------------------------

  describe('findProfilesMetadata', () => {
    it('should return lightweight metadata for all profiles of a site', async () => {
      const mockMetadata = [
        { id: 'p1', name: 'Default', display_name: 'Club Alpha', city: 'Paris', sport: 'Football', is_default: true, sort_order: 0 },
        { id: 'p2', name: 'Tournoi', display_name: 'Tournoi U18', city: 'Lyon', sport: 'Football', is_default: false, sort_order: 1 },
      ];
      mockQuery.mockResolvedValue({ rows: mockMetadata, rowCount: 2 });

      const result = await configProfileRepository.findProfilesMetadata('site-1');

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('SELECT id, name, display_name, city, sport, is_default, sort_order');
      expect(sql).toContain('WHERE site_id = $1');
      expect(sql).toContain('ORDER BY sort_order ASC');
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['site-1']);
    });

    it('should return empty array when no profiles exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configProfileRepository.findProfilesMetadata('site-1');

      expect(result).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // findById (inherited from BaseRepository)
  // --------------------------------------------------------------------------

  describe('findById', () => {
    it('should return a profile by id', async () => {
      const mockProfile = { id: 'p1', site_id: 'site-1', name: 'Default' };
      mockQuery.mockResolvedValue({ rows: [mockProfile], rowCount: 1 });

      const result = await configProfileRepository.findById('p1');

      expect(result).toEqual(mockProfile);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM config_profiles WHERE id = $1',
        ['p1']
      );
    });

    it('should return null when profile not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await configProfileRepository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // deleteById (inherited from BaseRepository)
  // --------------------------------------------------------------------------

  describe('deleteById', () => {
    it('should delete a profile and return true', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await configProfileRepository.deleteById('p1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM config_profiles WHERE id = $1',
        ['p1']
      );
    });

    it('should return false when profile not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await configProfileRepository.deleteById('nonexistent');

      expect(result).toBe(false);
    });
  });
});
