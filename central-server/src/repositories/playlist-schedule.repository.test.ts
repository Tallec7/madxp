/**
 * Tests unitaires pour playlistScheduleRepository
 *
 * Teste les methodes du repository de programmations de playlists:
 * - findBySite (avec/sans filtre activeOnly)
 * - findByIdWithJoins
 * - siteExists / customPlaylistExists
 * - createSchedule
 * - updateSchedule (avec champs / sans champs)
 * - deleteSchedule
 * - getActiveRules
 * - findCustomPlaylistsBySite
 * - createCustomPlaylist
 * - updateCustomPlaylist
 * - deleteCustomPlaylist
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

import { playlistScheduleRepository } from './playlist-schedule.repository';

describe('PlaylistScheduleRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // findBySite
  // --------------------------------------------------------------------------

  describe('findBySite', () => {
    it('should return schedules for a site without active filter', async () => {
      const mockRows = [
        { id: 'ps-1', site_id: 'site-1', name: 'Morning', site_name: 'Club A', playlist_name: null },
        { id: 'ps-2', site_id: 'site-1', name: 'Evening', site_name: 'Club A', playlist_name: 'Custom 1' },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await playlistScheduleRepository.findBySite('site-1', false);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Morning');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ps.site_id = $1'),
        ['site-1']
      );
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('is_active = true');
    });

    it('should filter active-only schedules when requested', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await playlistScheduleRepository.findBySite('site-1', true);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('is_active = true');
    });
  });

  // --------------------------------------------------------------------------
  // findByIdWithJoins
  // --------------------------------------------------------------------------

  describe('findByIdWithJoins', () => {
    it('should return a schedule with site and playlist names', async () => {
      const mockRow = {
        id: 'ps-1', site_id: 'site-1', name: 'Morning',
        site_name: 'Club A', playlist_name: 'Custom 1',
      };
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await playlistScheduleRepository.findByIdWithJoins('ps-1');

      expect(result).toEqual(mockRow);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ps.id = $1'),
        ['ps-1']
      );
    });

    it('should return null if schedule not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await playlistScheduleRepository.findByIdWithJoins('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // siteExists / customPlaylistExists
  // --------------------------------------------------------------------------

  describe('siteExists', () => {
    it('should return true when site exists', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'site-1' }] });

      const result = await playlistScheduleRepository.siteExists('site-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id FROM sites WHERE id = $1',
        ['site-1']
      );
    });

    it('should return false when site does not exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await playlistScheduleRepository.siteExists('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('customPlaylistExists', () => {
    it('should return true when playlist exists', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'cp-1' }] });

      const result = await playlistScheduleRepository.customPlaylistExists('cp-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id FROM custom_playlists WHERE id = $1',
        ['cp-1']
      );
    });

    it('should return false when playlist does not exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await playlistScheduleRepository.customPlaylistExists('nonexistent');

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // createSchedule
  // --------------------------------------------------------------------------

  describe('createSchedule', () => {
    it('should insert a schedule and return the created row', async () => {
      const mockCreated = {
        id: 'ps-new',
        site_id: 'site-1',
        name: 'New Schedule',
        content_category: 'sponsor',
        is_active: true,
      };
      mockQuery.mockResolvedValue({ rows: [mockCreated] });

      const input = {
        site_id: 'site-1',
        name: 'New Schedule',
        description: null,
        content_category: 'sponsor',
        custom_playlist_id: null,
        start_time: '08:00',
        end_time: '12:00',
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        match_phase: null,
        event_type: null,
        priority: 50,
        is_active: true,
        valid_from: null,
        valid_until: null,
        created_by: 'user-1',
      };

      const result = await playlistScheduleRepository.createSchedule(input);

      expect(result).toEqual(mockCreated);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO playlist_schedules'),
        [
          'site-1', 'New Schedule', null, 'sponsor', null,
          '08:00', '12:00', [0, 1, 2, 3, 4, 5, 6], null, null,
          50, true, null, null, 'user-1',
        ]
      );
    });
  });

  // --------------------------------------------------------------------------
  // updateSchedule
  // --------------------------------------------------------------------------

  describe('updateSchedule', () => {
    it('should update specified fields and return updated row', async () => {
      const mockUpdated = { id: 'ps-1', name: 'Updated', priority: 80 };
      mockQuery.mockResolvedValue({ rows: [mockUpdated] });

      const result = await playlistScheduleRepository.updateSchedule('ps-1', {
        name: 'Updated',
        priority: 80,
      });

      expect(result).toEqual(mockUpdated);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('name = $1');
      expect(sql).toContain('priority = $2');
      expect(sql).toContain('WHERE id = $3');
      expect(mockQuery.mock.calls[0][1]).toEqual(['Updated', 80, 'ps-1']);
    });

    it('should return null when no fields to update', async () => {
      const result = await playlistScheduleRepository.updateSchedule('ps-1', {});

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return null when schedule not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await playlistScheduleRepository.updateSchedule('nonexistent', {
        name: 'Test',
      });

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // deleteSchedule
  // --------------------------------------------------------------------------

  describe('deleteSchedule', () => {
    it('should return true when schedule is deleted', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'ps-1' }] });

      const result = await playlistScheduleRepository.deleteSchedule('ps-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM playlist_schedules WHERE id = $1 RETURNING id',
        ['ps-1']
      );
    });

    it('should return false when schedule not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await playlistScheduleRepository.deleteSchedule('nonexistent');

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getActiveRules
  // --------------------------------------------------------------------------

  describe('getActiveRules', () => {
    it('should call the PostgreSQL function with correct parameters', async () => {
      const mockRules = [
        { content_category: 'sponsor', priority: 100 },
        { content_category: 'ambiance', priority: 50 },
      ];
      mockQuery.mockResolvedValue({ rows: mockRules });

      const result = await playlistScheduleRepository.getActiveRules(
        'site-1', '10:00', 3, 'before'
      );

      expect(result).toEqual(mockRules);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('get_active_playlist_rules($1, $2::TIME, $3::INTEGER, $4)'),
        ['site-1', '10:00', 3, 'before']
      );
    });

    it('should handle null parameters', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await playlistScheduleRepository.getActiveRules('site-1', null, null, null);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('get_active_playlist_rules'),
        ['site-1', null, null, null]
      );
    });
  });

  // --------------------------------------------------------------------------
  // findCustomPlaylistsBySite
  // --------------------------------------------------------------------------

  describe('findCustomPlaylistsBySite', () => {
    it('should return custom playlists for site and public ones', async () => {
      const mockRows = [
        { id: 'cp-1', site_id: 'site-1', name: 'My Playlist', site_name: 'Club A', video_count: 5 },
        { id: 'cp-2', site_id: null, name: 'Public Playlist', site_name: null, video_count: 3 },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await playlistScheduleRepository.findCustomPlaylistsBySite('site-1');

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE cp.site_id = $1 OR (cp.is_public = true AND cp.site_id IS NULL)'),
        ['site-1']
      );
    });
  });

  // --------------------------------------------------------------------------
  // createCustomPlaylist
  // --------------------------------------------------------------------------

  describe('createCustomPlaylist', () => {
    it('should insert a custom playlist and return the created row', async () => {
      const mockCreated = { id: 'cp-new', name: 'New Playlist', video_ids: ['v1', 'v2'] };
      mockQuery.mockResolvedValue({ rows: [mockCreated] });

      const input = {
        site_id: 'site-1',
        name: 'New Playlist',
        description: 'A description',
        video_ids: ['v1', 'v2'],
        loop_mode: 'sequential',
        transition_duration: 0,
        is_public: false,
        created_by: 'user-1',
      };

      const result = await playlistScheduleRepository.createCustomPlaylist(input);

      expect(result).toEqual(mockCreated);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO custom_playlists'),
        ['site-1', 'New Playlist', 'A description', ['v1', 'v2'], 'sequential', 0, false, 'user-1']
      );
    });
  });

  // --------------------------------------------------------------------------
  // updateCustomPlaylist
  // --------------------------------------------------------------------------

  describe('updateCustomPlaylist', () => {
    it('should update specified fields and return updated row', async () => {
      const mockUpdated = { id: 'cp-1', name: 'Updated Playlist' };
      mockQuery.mockResolvedValue({ rows: [mockUpdated] });

      const result = await playlistScheduleRepository.updateCustomPlaylist('cp-1', {
        name: 'Updated Playlist',
        is_public: true,
      });

      expect(result).toEqual(mockUpdated);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('name = $1');
      expect(sql).toContain('is_public = $2');
      expect(sql).toContain('WHERE id = $3');
    });

    it('should return null when no fields to update', async () => {
      const result = await playlistScheduleRepository.updateCustomPlaylist('cp-1', {});

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // deleteCustomPlaylist
  // --------------------------------------------------------------------------

  describe('deleteCustomPlaylist', () => {
    it('should return true when playlist is deleted', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'cp-1' }] });

      const result = await playlistScheduleRepository.deleteCustomPlaylist('cp-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM custom_playlists WHERE id = $1 RETURNING id',
        ['cp-1']
      );
    });

    it('should return false when playlist not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await playlistScheduleRepository.deleteCustomPlaylist('nonexistent');

      expect(result).toBe(false);
    });
  });
});
