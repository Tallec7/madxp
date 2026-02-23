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

import { benchmarkRepository } from './benchmark.repository';

describe('BenchmarkRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // findSiteForBenchmark
  // ========================================================================

  describe('findSiteForBenchmark', () => {
    it('should return site info for benchmark', async () => {
      const mockSite = {
        id: 'site-1',
        site_name: 'Club A',
        sports: ['football', 'basketball'],
        location: { region: 'Occitanie' },
      };
      mockQuery.mockResolvedValue({ rows: [mockSite], rowCount: 1 });

      const result = await benchmarkRepository.findSiteForBenchmark('site-1');

      expect(result).toEqual(mockSite);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM sites'),
        ['site-1']
      );
    });

    it('should return null when site not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await benchmarkRepository.findSiteForBenchmark('unknown');

      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // getSiteMetrics
  // ========================================================================

  describe('getSiteMetrics', () => {
    it('should return aggregated metrics for a site', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          session_count: '10',
          video_count: '50',
          avg_duration: '25.5',
          online_days: '28',
        }],
        rowCount: 1,
      });

      const result = await benchmarkRepository.getSiteMetrics('site-1', '2026-01-01', '2026-01-31');

      expect(result.sessionCount).toBe(10);
      expect(result.videoCount).toBe(50);
      expect(result.avgDuration).toBe(25.5);
      expect(result.onlineDays).toBe(28);
      expect(result.totalDays).toBe(31);
    });

    it('should handle zero/null values gracefully', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          session_count: '0',
          video_count: '0',
          avg_duration: '0',
          online_days: '0',
        }],
        rowCount: 1,
      });

      const result = await benchmarkRepository.getSiteMetrics('site-1', '2026-02-01', '2026-02-28');

      expect(result.sessionCount).toBe(0);
      expect(result.videoCount).toBe(0);
      expect(result.avgDuration).toBe(0);
      expect(result.onlineDays).toBe(0);
      expect(result.totalDays).toBe(28);
    });

    it('should use a single query with subqueries (not multiple round-trips)', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ session_count: '5', video_count: '20', avg_duration: '10', online_days: '15' }],
        rowCount: 1,
      });

      await benchmarkRepository.getSiteMetrics('site-1', '2026-01-01', '2026-01-31');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('club_sessions');
      expect(sql).toContain('video_plays');
      expect(sql).toContain('metrics');
    });

    it('should use exclusive upper bound for date range', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ session_count: '5', video_count: '20', avg_duration: '10', online_days: '15' }],
        rowCount: 1,
      });

      await benchmarkRepository.getSiteMetrics('site-1', '2026-01-01', '2026-01-31');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("< ($3::date + INTERVAL '1 day')");
    });
  });

  // ========================================================================
  // getPeerMetrics
  // ========================================================================

  describe('getPeerMetrics', () => {
    it('should return peer metrics using JOINs (not correlated subqueries)', async () => {
      const mockPeers = [
        { sessions_per_month: '8', videos_per_session: '5.0', avg_session_duration: '20', total_videos: '40' },
        { sessions_per_month: '12', videos_per_session: '3.5', avg_session_duration: '30', total_videos: '42' },
      ];
      mockQuery.mockResolvedValue({ rows: mockPeers, rowCount: 2 });

      const result = await benchmarkRepository.getPeerMetrics(
        'site-1', '2026-01-01', '2026-01-31', {}
      );

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('LEFT JOIN');
      expect(sql).toContain('GROUP BY site_id');
    });

    it('should exclude the target site from peers', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await benchmarkRepository.getPeerMetrics('site-1', '2026-01-01', '2026-01-31', {});

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('s.id != $1');
      expect(mockQuery.mock.calls[0][1]).toContain('site-1');
    });

    it('should filter by sport using @> operator when provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await benchmarkRepository.getPeerMetrics(
        'site-1', '2026-01-01', '2026-01-31', { sport: 'football' }
      );

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('@>');
      expect(sql).toContain('::jsonb');
      expect(mockQuery.mock.calls[0][1]).toContain(JSON.stringify(['football']));
    });

    it('should filter by region when provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await benchmarkRepository.getPeerMetrics(
        'site-1', '2026-01-01', '2026-01-31', { region: 'Occitanie' }
      );

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("location->>'region'");
      expect(mockQuery.mock.calls[0][1]).toContain('Occitanie');
    });

    it('should filter active sites only (no archived/error)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await benchmarkRepository.getPeerMetrics('site-1', '2026-01-01', '2026-01-31', {});

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("s.status IN ('online', 'offline', 'maintenance')");
    });
  });

  // ========================================================================
  // Global benchmark
  // ========================================================================

  describe('getGlobalBySport', () => {
    it('should return sport breakdown with LEFT JOINs', async () => {
      const mockRows = [
        { sport: 'football', site_count: '20', avg_sessions: '8', avg_videos: '40' },
        { sport: 'basketball', site_count: '10', avg_sessions: '5', avg_videos: '25' },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows, rowCount: 2 });

      const result = await benchmarkRepository.getGlobalBySport('2026-01-01', '2026-01-31');

      expect(result).toHaveLength(2);
      expect(result[0].sport).toBe('football');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('LEFT JOIN');
      expect(sql).toContain('jsonb_array_elements_text');
    });
  });

  describe('getGlobalByRegion', () => {
    it('should return region breakdown', async () => {
      const mockRows = [
        { region: 'Occitanie', site_count: '15', avg_sessions: '7', avg_videos: '35' },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows, rowCount: 1 });

      const result = await benchmarkRepository.getGlobalByRegion('2026-01-01', '2026-01-31');

      expect(result).toHaveLength(1);
      expect(result[0].region).toBe('Occitanie');
    });
  });

  describe('countActiveSites', () => {
    it('should count sites with valid statuses', async () => {
      mockQuery.mockResolvedValue({ rows: [{ total: '42' }], rowCount: 1 });

      const result = await benchmarkRepository.countActiveSites();

      expect(result).toBe(42);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("status IN ('online', 'offline', 'maintenance')");
    });
  });
});
