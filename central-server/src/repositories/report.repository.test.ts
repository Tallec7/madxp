/**
 * Tests unitaires pour reportRepository
 *
 * Teste les méthodes du repository de rapports:
 * - findById (hérité de BaseRepository)
 * - exists (hérité de BaseRepository)
 * - findAllWithEntityName (liste avec jointures et pagination)
 * - getStatsByTypeAndStatus (agrégations par type/statut)
 * - getMonthlyStats (agrégations mensuelles)
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

import { reportRepository } from './report.repository';

describe('ReportRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // findById (inherited from BaseRepository)
  // --------------------------------------------------------------------------

  describe('findById', () => {
    it('should return a report when found', async () => {
      const mockReport = {
        id: 'report-1',
        report_type: 'club',
        site_id: 'site-1',
        status: 'completed',
        created_at: new Date(),
      };
      mockQuery.mockResolvedValue({ rows: [mockReport], rowCount: 1 });

      const result = await reportRepository.findById('report-1');

      expect(result).toEqual(mockReport);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM generated_reports WHERE id = $1'),
        ['report-1']
      );
    });

    it('should return null when report not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await reportRepository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // exists (inherited from BaseRepository)
  // --------------------------------------------------------------------------

  describe('exists', () => {
    it('should return true when report exists', async () => {
      mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });

      const result = await reportRepository.exists('report-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT 1 FROM generated_reports WHERE id = $1'),
        ['report-1']
      );
    });

    it('should return false when report does not exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await reportRepository.exists('nonexistent');

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // findAllWithEntityName
  // --------------------------------------------------------------------------

  describe('findAllWithEntityName', () => {
    it('should list all reports with entity names and pagination', async () => {
      const mockRows = [
        { id: 'r1', report_type: 'club', entity_name: 'Club A', created_at: new Date() },
        { id: 'r2', report_type: 'advertiser', entity_name: 'Adv B', created_at: new Date() },
      ];
      mockQuery
        .mockResolvedValueOnce({ rows: mockRows, rowCount: 2 })
        .mockResolvedValueOnce({ rows: [{ total: '10' }], rowCount: 1 });

      const result = await reportRepository.findAllWithEntityName({
        limit: 50,
        offset: 0,
      });

      expect(result.rows).toEqual(mockRows);
      expect(result.total).toBe(10);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      // First call: main query
      expect(mockQuery.mock.calls[0][0]).toContain('FROM generated_reports gr');
      expect(mockQuery.mock.calls[0][0]).toContain('LEFT JOIN sites s ON gr.site_id = s.id');
      expect(mockQuery.mock.calls[0][1]).toEqual([50, 0]);
      // Second call: count query
      expect(mockQuery.mock.calls[1][0]).toContain('COUNT(*)');
    });

    it('should filter by type when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 });

      await reportRepository.findAllWithEntityName({
        type: 'club',
        limit: 20,
        offset: 0,
      });

      expect(mockQuery).toHaveBeenCalledTimes(2);
      // Main query should include WHERE clause with type and pagination params
      expect(mockQuery.mock.calls[0][0]).toContain('WHERE report_type = $1');
      expect(mockQuery.mock.calls[0][1]).toEqual(['club', 20, 0]);
      // Count query should also filter by type
      expect(mockQuery.mock.calls[1][0]).toContain('WHERE report_type = $1');
      expect(mockQuery.mock.calls[1][1]).toEqual(['club']);
    });

    it('should ignore invalid type filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 });

      await reportRepository.findAllWithEntityName({
        type: undefined,
        limit: 50,
        offset: 10,
      });

      expect(mockQuery.mock.calls[0][0]).not.toContain('WHERE report_type');
      expect(mockQuery.mock.calls[0][1]).toEqual([50, 10]);
    });
  });

  // --------------------------------------------------------------------------
  // getStatsByTypeAndStatus
  // --------------------------------------------------------------------------

  describe('getStatsByTypeAndStatus', () => {
    it('should return aggregated stats by type and status', async () => {
      const mockStats = [
        { report_type: 'club', status: 'completed', count: '25', total_size: '1048576' },
        { report_type: 'club', status: 'failed', count: '2', total_size: null },
        { report_type: 'advertiser', status: 'completed', count: '10', total_size: '524288' },
      ];
      mockQuery.mockResolvedValue({ rows: mockStats, rowCount: 3 });

      const result = await reportRepository.getStatsByTypeAndStatus();

      expect(result).toEqual(mockStats);
      expect(result).toHaveLength(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY report_type, status')
      );
    });

    it('should return empty array when no reports exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await reportRepository.getStatsByTypeAndStatus();

      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getMonthlyStats
  // --------------------------------------------------------------------------

  describe('getMonthlyStats', () => {
    it('should return monthly stats for the last 12 months', async () => {
      const mockMonthly = [
        { month: '2026-02', count: '15', completed: '14', failed: '1' },
        { month: '2026-01', count: '20', completed: '18', failed: '2' },
      ];
      mockQuery.mockResolvedValue({ rows: mockMonthly, rowCount: 2 });

      const result = await reportRepository.getMonthlyStats();

      expect(result).toEqual(mockMonthly);
      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '12 months'")
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY')
      );
    });

    it('should return empty array when no recent reports', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await reportRepository.getMonthlyStats();

      expect(result).toEqual([]);
    });
  });
});
