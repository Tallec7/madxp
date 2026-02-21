/**
 * Tests unitaires pour advertiserRepository
 *
 * Teste les methodes CRUD, associations video,
 * statistiques, impressions batch et export.
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

import { advertiserRepository } from './advertiser.repository';

describe('AdvertiserRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // CRUD
  // ========================================================================

  describe('listAll', () => {
    it('should return all advertisers ordered by name', async () => {
      const mockAdvs = [
        { id: 'a1', name: 'Alpha Corp' },
        { id: 'a2', name: 'Beta Inc' },
      ];
      mockQuery.mockResolvedValue({ rows: mockAdvs, rowCount: 2 });

      const result = await advertiserRepository.listAll();

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('FROM advertisers');
      expect(sql).toContain('ORDER BY name ASC');
    });
  });

  describe('findByIdFull', () => {
    it('should return advertiser with metadata', async () => {
      const mockAdv = { id: 'a1', name: 'Test', metadata: { key: 'value' } };
      mockQuery.mockResolvedValue({ rows: [mockAdv], rowCount: 1 });

      const result = await advertiserRepository.findByIdFull('a1');

      expect(result).toEqual(mockAdv);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), ['a1']);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await advertiserRepository.findByIdFull('a-x');

      expect(result).toBeNull();
    });
  });

  describe('findName', () => {
    it('should return advertiser name', async () => {
      mockQuery.mockResolvedValue({ rows: [{ name: 'Test Corp' }], rowCount: 1 });

      const result = await advertiserRepository.findName('a1');

      expect(result).toBe('Test Corp');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await advertiserRepository.findName('a-x');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should insert new advertiser', async () => {
      const mockAdv = { id: 'a1', name: 'New Corp' };
      mockQuery.mockResolvedValue({ rows: [mockAdv], rowCount: 1 });

      const result = await advertiserRepository.create({
        name: 'New Corp',
        logoUrl: null,
        contactEmail: 'test@corp.com',
        contactName: 'John',
        contactPhone: null,
        metadata: null,
      });

      expect(result).toEqual(mockAdv);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO advertisers');
      expect(sql).toContain('RETURNING *');
    });
  });

  describe('update', () => {
    it('should update advertiser with COALESCE', async () => {
      const mockAdv = { id: 'a1', name: 'Updated Corp' };
      mockQuery.mockResolvedValue({ rows: [mockAdv], rowCount: 1 });

      const result = await advertiserRepository.update('a1', { name: 'Updated Corp' });

      expect(result).toEqual(mockAdv);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('COALESCE($1, name)');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await advertiserRepository.update('a-x', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete advertiser and return true', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await advertiserRepository.delete('a1');

      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await advertiserRepository.delete('a-x');

      expect(result).toBe(false);
    });
  });

  // ========================================================================
  // Video Associations
  // ========================================================================

  describe('addVideos', () => {
    it('should upsert video associations', async () => {
      mockQuery.mockResolvedValue({ rowCount: 2 });

      await advertiserRepository.addVideos('a1', ['v1', 'v2'], true);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO advertiser_videos');
      expect(sql).toContain('ON CONFLICT');
      expect(mockQuery.mock.calls[0][1]).toEqual(['a1', 'v1', 'v2', true]);
    });
  });

  describe('removeVideo', () => {
    it('should remove video association', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await advertiserRepository.removeVideo('a1', 'v1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM advertiser_videos'),
        ['a1', 'v1']
      );
    });

    it('should return false when not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await advertiserRepository.removeVideo('a1', 'v-x');

      expect(result).toBe(false);
    });
  });

  describe('getVideos', () => {
    it('should return videos with metadata', async () => {
      const mockVideos = [
        { video_id: 'v1', filename: 'video1.mp4', is_primary: true },
      ];
      mockQuery.mockResolvedValue({ rows: mockVideos, rowCount: 1 });

      const result = await advertiserRepository.getVideos('a1');

      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('advertiser_videos av');
      expect(sql).toContain('JOIN videos v');
    });
  });

  describe('getVideoIds', () => {
    it('should return array of video IDs', async () => {
      mockQuery.mockResolvedValue({ rows: [{ video_id: 'v1' }, { video_id: 'v2' }], rowCount: 2 });

      const result = await advertiserRepository.getVideoIds('a1');

      expect(result).toEqual(['v1', 'v2']);
    });
  });

  // ========================================================================
  // Statistics
  // ========================================================================

  describe('getStatsSummary', () => {
    it('should return global stats for video IDs', async () => {
      const mockSummary = { total_impressions: '100', active_sites: '5' };
      mockQuery.mockResolvedValue({ rows: [mockSummary], rowCount: 1 });

      const result = await advertiserRepository.getStatsSummary(['v1', 'v2'], '2024-01-01', '2024-01-31');

      expect(result.total_impressions).toBe('100');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ANY($1::uuid[])'),
        [['v1', 'v2'], '2024-01-01', '2024-01-31']
      );
    });
  });

  describe('getStatsByVideo', () => {
    it('should return per-video breakdown', async () => {
      const mockData = [{ video_id: 'v1', video_name: 'test.mp4', impressions: '50' }];
      mockQuery.mockResolvedValue({ rows: mockData, rowCount: 1 });

      const result = await advertiserRepository.getStatsByVideo(['v1'], '2024-01-01', '2024-01-31');

      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('GROUP BY v.id, v.filename');
    });
  });

  describe('getStatsBySite', () => {
    it('should return per-site breakdown with limit 20', async () => {
      const mockData = [{ site_id: 's1', site_name: 'Club A', impressions: '30' }];
      mockQuery.mockResolvedValue({ rows: mockData, rowCount: 1 });

      const result = await advertiserRepository.getStatsBySite(['v1'], '2024-01-01', '2024-01-31');

      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('LIMIT 20');
    });
  });

  describe('getDailyTrends', () => {
    it('should return daily trend data', async () => {
      const mockTrends = [
        { date: '2024-01-01', impressions: '10', screen_time: '300' },
        { date: '2024-01-02', impressions: '15', screen_time: '450' },
      ];
      mockQuery.mockResolvedValue({ rows: mockTrends, rowCount: 2 });

      const result = await advertiserRepository.getDailyTrends(['v1'], '2024-01-01', '2024-01-31');

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY date ASC');
    });
  });

  // ========================================================================
  // Impressions Batch
  // ========================================================================

  describe('recordImpressions', () => {
    it('should batch insert impressions', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const count = await advertiserRepository.recordImpressions([{
        eventId: 'e1', siteSponsorId: 'ss1', siteId: 's1', videoId: 'v1',
        playedAt: '2024-01-15T10:00:00Z',
        durationPlayed: 30, videoDuration: 60, completed: false,
        interruptedAt: null, eventType: null, period: 'loop',
        triggerType: 'auto', positionInLoop: 1, audienceEstimate: 50,
      }]);

      expect(count).toBe(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO video_plays');
      expect(sql).toContain('event_id');
      expect(sql).toContain('site_sponsor_id');
      expect(sql).toContain('ON CONFLICT (event_id)');
      expect(mockQuery.mock.calls[0][1]).toHaveLength(13);
    });

    it('should return 0 for empty array', async () => {
      const count = await advertiserRepository.recordImpressions([]);

      expect(count).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Data Export
  // ========================================================================

  describe('exportImpressions', () => {
    it('should return impressions with joined metadata', async () => {
      const mockData = [{ id: 'i1', video_name: 'test.mp4', site_name: 'Club A' }];
      mockQuery.mockResolvedValue({ rows: mockData, rowCount: 1 });

      const result = await advertiserRepository.exportImpressions(['v1'], '2024-01-01', '2024-01-31');

      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('JOIN videos v');
      expect(sql).toContain('JOIN sites s');
    });
  });

  describe('calculateDailyStats', () => {
    it('should call PG function and return count', async () => {
      mockQuery.mockResolvedValue({ rows: [{ calculate_all_advertiser_daily_stats: 15 }], rowCount: 1 });

      const result = await advertiserRepository.calculateDailyStats('2024-01-15');

      expect(result).toBe(15);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('calculate_all_advertiser_daily_stats'),
        ['2024-01-15']
      );
    });
  });
});
