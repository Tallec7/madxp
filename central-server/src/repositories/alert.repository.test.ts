/**
 * Tests unitaires pour alertRepository
 *
 * Teste les méthodes du repository d'alertes:
 * - create, resolve, resolveAllForSite, resolveAllByType
 * - findWithFilters (filtres dynamiques + pagination)
 * - getStats (agrégations)
 * - getActiveWithSite, existsActive
 * - Threshold CRUD
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

import { alertRepository } from './alert.repository';

describe('AlertRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // resolve
  // --------------------------------------------------------------------------

  describe('resolve', () => {
    it('should resolve an alert and return it', async () => {
      const mockAlert = { id: 'alert-1', status: 'resolved', resolved_at: new Date() };
      mockQuery.mockResolvedValue({ rows: [mockAlert], rowCount: 1 });

      const result = await alertRepository.resolve('alert-1');

      expect(result).toEqual(mockAlert);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts SET status'),
        ['alert-1']
      );
    });

    it('should return null if alert not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await alertRepository.resolve('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // resolveAllForSite
  // --------------------------------------------------------------------------

  describe('resolveAllForSite', () => {
    it('should resolve all active alerts for a site', async () => {
      mockQuery.mockResolvedValue({ rowCount: 3 });

      const count = await alertRepository.resolveAllForSite('site-1');

      expect(count).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE site_id = $1 AND status = 'active'"),
        ['site-1']
      );
    });

    it('should return 0 when no active alerts', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const count = await alertRepository.resolveAllForSite('site-1');

      expect(count).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // resolveAllByType
  // --------------------------------------------------------------------------

  describe('resolveAllByType', () => {
    it('should resolve alerts by type for a site', async () => {
      mockQuery.mockResolvedValue({ rowCount: 2 });

      const count = await alertRepository.resolveAllByType('site-1', 'temperature_trend');

      expect(count).toBe(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('site_id = $1 AND alert_type = $2'),
        ['site-1', 'temperature_trend']
      );
    });
  });

  // --------------------------------------------------------------------------
  // existsActive
  // --------------------------------------------------------------------------

  describe('existsActive', () => {
    it('should return true when active alert exists', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const exists = await alertRepository.existsActive('site-1', 'cpu_high');

      expect(exists).toBe(true);
    });

    it('should return false when no active alert', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const exists = await alertRepository.existsActive('site-1', 'cpu_high');

      expect(exists).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // findWithFilters
  // --------------------------------------------------------------------------

  describe('findWithFilters', () => {
    it('should return alerts with pagination', async () => {
      const mockAlerts = [
        { id: 'a1', site_id: 's1', site_name: 'Club A', club_name: 'Club A', alert_type: 'cpu', severity: 'warning', status: 'active' },
        { id: 'a2', site_id: 's2', site_name: 'Club B', club_name: 'Club B', alert_type: 'disk', severity: 'critical', status: 'active' },
      ];
      mockQuery
        .mockResolvedValueOnce({ rows: mockAlerts })    // data query
        .mockResolvedValueOnce({ rows: [{ total: '5' }] });  // count query

      const result = await alertRepository.findWithFilters({}, { limit: 10, offset: 0 });

      expect(result.rows).toHaveLength(2);
      expect(result.total).toBe(5);
    });

    it('should filter by active status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await alertRepository.findWithFilters({ active: true }, { limit: 10, offset: 0 });

      const dataCall = mockQuery.mock.calls[0][0] as string;
      expect(dataCall).toContain("a.status = 'active'");
    });

    it('should filter by severity', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await alertRepository.findWithFilters({ severity: 'critical' }, { limit: 10, offset: 0 });

      const dataCall = mockQuery.mock.calls[0][0] as string;
      expect(dataCall).toContain('a.severity = $');
      expect(mockQuery.mock.calls[0][1]).toContain('critical');
    });

    it('should filter by siteId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await alertRepository.findWithFilters({ siteId: 'site-123' }, { limit: 10, offset: 0 });

      expect(mockQuery.mock.calls[0][1]).toContain('site-123');
    });

    it('should filter by specific alert type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await alertRepository.findWithFilters({ type: 'cpu_high' }, { limit: 10, offset: 0 });

      const dataCall = mockQuery.mock.calls[0][0] as string;
      expect(dataCall).toContain('a.alert_type = $');
      expect(mockQuery.mock.calls[0][1]).toContain('cpu_high');
    });
  });

  // --------------------------------------------------------------------------
  // getStats
  // --------------------------------------------------------------------------

  describe('getStats', () => {
    it('should return aggregated alert statistics', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ severity: 'critical', count: '3' }, { severity: 'warning', count: '7' }] })
        .mockResolvedValueOnce({ rows: [{ type: 'cpu_high', count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ site_id: 's1', site_name: 'Club A', club_name: 'Club A', alert_count: '4' }] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-02-08', count: '2', critical_count: '1' }] });

      const stats = await alertRepository.getStats();

      expect(stats.bySeverity).toEqual({ critical: 3, warning: 7 });
      expect(stats.totalActive).toBe(10);
      expect(stats.byType).toHaveLength(1);
      expect(stats.byType[0]).toEqual({ type: 'cpu_high', count: 5 });
      expect(stats.topSites).toHaveLength(1);
      expect(stats.topSites[0].alertCount).toBe(4);
      expect(stats.trend).toHaveLength(1);
      expect(stats.trend[0].criticalCount).toBe(1);
    });

    it('should handle empty stats', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const stats = await alertRepository.getStats();

      expect(stats.bySeverity).toEqual({});
      expect(stats.totalActive).toBe(0);
      expect(stats.byType).toEqual([]);
      expect(stats.topSites).toEqual([]);
      expect(stats.trend).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Thresholds
  // --------------------------------------------------------------------------

  describe('getThresholds', () => {
    it('should return enabled thresholds by default', async () => {
      const mockThresholds = [{ id: 't1', metric: 'cpu', enabled: true }];
      mockQuery.mockResolvedValue({ rows: mockThresholds });

      const thresholds = await alertRepository.getThresholds();

      expect(thresholds).toEqual(mockThresholds);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE enabled = true');
    });

    it('should return all thresholds when enabledOnly is false', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await alertRepository.getThresholds(false);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('WHERE enabled = true');
    });
  });
});
