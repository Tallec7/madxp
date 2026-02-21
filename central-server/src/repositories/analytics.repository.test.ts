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

import { analyticsRepository } from './analytics.repository';

describe('AnalyticsRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // Club Health
  // ========================================================================

  describe('getLatestMetrics', () => {
    it('should return latest metrics for a site', async () => {
      const mockMetrics = { cpu_usage: 45, memory_usage: 60, temperature: 55 };
      mockQuery.mockResolvedValue({ rows: [mockMetrics], rowCount: 1 });

      const result = await analyticsRepository.getLatestMetrics('site-1');

      expect(result).toEqual(mockMetrics);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('FROM metrics');
      expect(sql).toContain('ORDER BY recorded_at DESC');
    });

    it('should return null when no metrics', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await analyticsRepository.getLatestMetrics('site-x');

      expect(result).toBeNull();
    });
  });

  describe('getHeartbeatStats30d', () => {
    it('should return 30d heartbeat stats', async () => {
      const mockStats = { heartbeat_count: '1440', first_heartbeat: new Date(), last_heartbeat: new Date() };
      mockQuery.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      const result = await analyticsRepository.getHeartbeatStats30d('site-1');

      expect(result.heartbeat_count).toBe('1440');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('30 days'), ['site-1']);
    });
  });

  describe('getAlertStats', () => {
    it('should return alert counts', async () => {
      const mockStats = { active_alerts: '2', alerts_last_30d: '5' };
      mockQuery.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      const result = await analyticsRepository.getAlertStats('site-1');

      expect(result.active_alerts).toBe('2');
    });
  });

  describe('get24hAverages', () => {
    it('should return 24h metric averages', async () => {
      const mockAvg = { avg_cpu: 50, avg_memory: 65, avg_temperature: 55, max_temperature: 70 };
      mockQuery.mockResolvedValue({ rows: [mockAvg], rowCount: 1 });

      const result = await analyticsRepository.get24hAverages('site-1');

      expect(result.avg_cpu).toBe(50);
    });
  });

  // ========================================================================
  // Club Usage
  // ========================================================================

  describe('getUsageStats', () => {
    it('should return aggregated usage stats', async () => {
      const mockUsage = { screen_time_seconds: '3600', videos_played: '10', unique_videos: '5' };
      mockQuery.mockResolvedValue({ rows: [mockUsage], rowCount: 1 });

      const result = await analyticsRepository.getUsageStats('site-1', '2024-01-01', '2024-01-31');

      expect(result.videos_played).toBe('10');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('video_plays'), ['site-1', '2024-01-01', '2024-01-31']);
    });
  });

  describe('getDailyStats', () => {
    it('should return daily breakdown', async () => {
      const mockDays = [
        { date: new Date('2024-01-01'), screen_time: '1800', videos: '5' },
        { date: new Date('2024-01-02'), screen_time: '2400', videos: '8' },
      ];
      mockQuery.mockResolvedValue({ rows: mockDays, rowCount: 2 });

      const result = await analyticsRepository.getDailyStats('site-1', '2024-01-01', '2024-01-31');

      expect(result).toHaveLength(2);
    });
  });

  describe('getTopVideos', () => {
    it('should return top videos with limit', async () => {
      const mockVideos = [{ video_filename: 'video1.mp4', plays: '15', avg_completion: 85 }];
      mockQuery.mockResolvedValue({ rows: mockVideos, rowCount: 1 });

      const result = await analyticsRepository.getTopVideos('site-1', '2024-01-01', '2024-01-31', 5);

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LIMIT $4'), ['site-1', '2024-01-01', '2024-01-31', 5]);
    });
  });

  // ========================================================================
  // Sessions
  // ========================================================================

  describe('startSession', () => {
    it('should create a new session', async () => {
      const mockSession = { id: 'sess-1', started_at: new Date() };
      mockQuery.mockResolvedValue({ rows: [mockSession], rowCount: 1 });

      const result = await analyticsRepository.startSession('site-1');

      expect(result.id).toBe('sess-1');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO club_sessions');
    });
  });

  describe('endSession', () => {
    it('should close session and return stats', async () => {
      const mockSession = { id: 'sess-1', duration_seconds: 3600, videos_played: 10 };
      mockQuery.mockResolvedValue({ rows: [mockSession], rowCount: 1 });

      const result = await analyticsRepository.endSession('sess-1');

      expect(result).toEqual(mockSession);
    });

    it('should return null when session not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await analyticsRepository.endSession('sess-x');

      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // Analytics Categories
  // ========================================================================

  describe('getCategories', () => {
    it('should return all categories ordered', async () => {
      const mockCats = [
        { id: 'c1', name: 'Sport', is_default: true },
        { id: 'c2', name: 'Custom', is_default: false },
      ];
      mockQuery.mockResolvedValue({ rows: mockCats, rowCount: 2 });

      const result = await analyticsRepository.getCategories();

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('analytics_categories');
    });
  });

  describe('createCategory', () => {
    it('should insert a new category', async () => {
      const mockCat = { id: 'c1', name: 'Test', is_default: false };
      mockQuery.mockResolvedValue({ rows: [mockCat], rowCount: 1 });

      const result = await analyticsRepository.createCategory({
        id: 'c1', name: 'Test', description: null, color: '#ff0000',
      });

      expect(result.name).toBe('Test');
    });
  });

  describe('isCategoryDefault', () => {
    it('should return true for default categories', async () => {
      mockQuery.mockResolvedValue({ rows: [{ is_default: true }], rowCount: 1 });

      const result = await analyticsRepository.isCategoryDefault('c1');

      expect(result).toBe(true);
    });

    it('should return null when category not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await analyticsRepository.isCategoryDefault('c-x');

      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // Analytics Overview
  // ========================================================================

  describe('getSiteCounts', () => {
    it('should return total and online counts', async () => {
      const mockCounts = { total_sites: '50', online_sites: '35' };
      mockQuery.mockResolvedValue({ rows: [mockCounts], rowCount: 1 });

      const result = await analyticsRepository.getSiteCounts();

      expect(result.total_sites).toBe('50');
    });
  });

  describe('getFleetAvailability', () => {
    it('should return fleet average availability', async () => {
      mockQuery.mockResolvedValue({ rows: [{ avg_availability: 95.5 }], rowCount: 1 });

      const result = await analyticsRepository.getFleetAvailability();

      expect(result).toBe(95.5);
    });
  });

  // ========================================================================
  // Multi-Site Comparison
  // ========================================================================

  describe('getMultiSiteComparison', () => {
    it('should compare multiple sites', async () => {
      const mockData = [
        { id: 's1', site_name: 'Site 1', total_videos: 100 },
        { id: 's2', site_name: 'Site 2', total_videos: 80 },
      ];
      mockQuery.mockResolvedValue({ rows: mockData, rowCount: 2 });

      const result = await analyticsRepository.getMultiSiteComparison(['s1', 's2'], 30);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ANY($1::uuid[])'),
        [['s1', 's2'], '30 days']
      );
    });
  });

  // ========================================================================
  // Data Export
  // ========================================================================

  describe('exportVideoPlays', () => {
    it('should return video plays for export', async () => {
      const mockPlays = [{ played_at: new Date(), video_filename: 'v.mp4' }];
      mockQuery.mockResolvedValue({ rows: mockPlays, rowCount: 1 });

      const result = await analyticsRepository.exportVideoPlays('site-1', '2024-01-01', '2024-01-31');

      expect(result).toHaveLength(1);
    });
  });

  describe('calculateDailyStats', () => {
    it('should call PG function and return count', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 42 }], rowCount: 1 });

      const result = await analyticsRepository.calculateDailyStats('2024-01-15');

      expect(result).toBe(42);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('calculate_all_daily_stats'),
        ['2024-01-15']
      );
    });
  });

  // ========================================================================
  // Video Plays Batch
  // ========================================================================

  describe('recordVideoPlays', () => {
    it('should batch insert video plays', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await analyticsRepository.recordVideoPlays([{
        siteId: 's1', sessionId: 'sess-1', videoFilename: 'v.mp4', category: 'sport',
        playedAt: '2024-01-15T10:00:00Z', durationPlayed: 30, videoDuration: 60,
        completed: false, triggerType: 'auto', videoId: null, sponsorId: null, tvStatus: null,
        eventType: 'match', period: 'halftime', audienceEstimate: 200, positionInLoop: 3, siteSponsorId: null,
        campaignId: null,
      }]);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO video_plays');
      expect(mockQuery.mock.calls[0][1]).toHaveLength(18);
    });

    it('should do nothing for empty array', async () => {
      await analyticsRepository.recordVideoPlays([]);

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Dashboard
  // ========================================================================

  describe('getDashboardHealth', () => {
    it('should return dashboard health data with LATERAL join', async () => {
      const mockHealth = { status: 'online', cpu_usage: 45 };
      mockQuery.mockResolvedValue({ rows: [mockHealth], rowCount: 1 });

      const result = await analyticsRepository.getDashboardHealth('site-1');

      expect(result).toEqual(mockHealth);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('LEFT JOIN LATERAL');
    });
  });
});
