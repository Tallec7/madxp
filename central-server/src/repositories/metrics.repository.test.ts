/**
 * Tests unitaires pour metricsRepository
 *
 * Teste les methodes du repository de metriques :
 * - findBySiteId, getLatestForSite, get24hStatsForSite
 * - getFleetAverages, getForPeriod
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

import { metricsRepository } from './metrics.repository';

describe('MetricsRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // findBySiteId
  // --------------------------------------------------------------------------

  describe('findBySiteId', () => {
    it('should return metrics for a site within the given hours', async () => {
      const mockMetrics = [
        { id: 'm1', site_id: 'site-1', cpu_usage: 45, recorded_at: new Date() },
        { id: 'm2', site_id: 'site-1', cpu_usage: 50, recorded_at: new Date() },
      ];
      mockQuery.mockResolvedValue({ rows: mockMetrics, rowCount: 2 });

      const result = await metricsRepository.findBySiteId('site-1', 24);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE site_id = $1'),
        ['site-1', 24]
      );
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY recorded_at DESC');
    });

    it('should return empty array when no metrics exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await metricsRepository.findBySiteId('site-1', 1);

      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getLatestForSite
  // --------------------------------------------------------------------------

  describe('getLatestForSite', () => {
    it('should return the most recent metric', async () => {
      const mockMetric = { id: 'm1', site_id: 'site-1', cpu_usage: 45, recorded_at: new Date() };
      mockQuery.mockResolvedValue({ rows: [mockMetric], rowCount: 1 });

      const result = await metricsRepository.getLatestForSite('site-1');

      expect(result).toEqual(mockMetric);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY recorded_at DESC');
      expect(sql).toContain('LIMIT 1');
    });

    it('should return null when no metrics exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await metricsRepository.getLatestForSite('site-1');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // get24hStatsForSite
  // --------------------------------------------------------------------------

  describe('get24hStatsForSite', () => {
    it('should return heartbeat stats for last 24 hours', async () => {
      const mockStats = {
        heartbeat_count: '48',
        first_heartbeat: new Date('2026-02-09T00:00:00Z'),
        last_heartbeat: new Date('2026-02-10T00:00:00Z'),
      };
      mockQuery.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      const result = await metricsRepository.get24hStatsForSite('site-1');

      expect(result.heartbeat_count).toBe('48');
      expect(result.first_heartbeat).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '24 hours'"),
        ['site-1']
      );
    });
  });

  // --------------------------------------------------------------------------
  // getFleetAverages
  // --------------------------------------------------------------------------

  describe('getFleetAverages', () => {
    it('should return fleet-wide average metrics', async () => {
      const mockAverages = {
        avg_cpu: '35.5',
        avg_memory: '52.3',
        avg_temperature: '42.1',
        avg_disk: '65.0',
        sites_with_metrics: '10',
      };
      mockQuery.mockResolvedValue({ rows: [mockAverages], rowCount: 1 });

      const result = await metricsRepository.getFleetAverages();

      expect(result.avg_cpu).toBe('35.5');
      expect(result.sites_with_metrics).toBe('10');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("INTERVAL '1 hour'");
      expect(sql).toContain('COUNT(DISTINCT m.site_id)');
    });
  });

  // --------------------------------------------------------------------------
  // getForPeriod
  // --------------------------------------------------------------------------

  describe('getForPeriod', () => {
    it('should return metrics for a date range', async () => {
      const mockMetrics = [
        { id: 'm1', recorded_at: new Date('2026-02-08') },
        { id: 'm2', recorded_at: new Date('2026-02-09') },
      ];
      mockQuery.mockResolvedValue({ rows: mockMetrics, rowCount: 2 });

      const start = new Date('2026-02-08');
      const end = new Date('2026-02-10');
      const result = await metricsRepository.getForPeriod('site-1', start, end);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('recorded_at >= $2'),
        ['site-1', start.toISOString(), end.toISOString()]
      );
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY recorded_at ASC');
    });

    it('should return empty array for period with no data', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await metricsRepository.getForPeriod(
        'site-1',
        new Date('2020-01-01'),
        new Date('2020-01-02')
      );

      expect(result).toEqual([]);
    });
  });
});
