/**
 * Tests unitaires pour objectiveRepository
 *
 * Teste les methodes du repository d'objectifs:
 * - findWithFilters (filtres dynamiques)
 * - findByIdWithSite
 * - siteExists
 * - create
 * - updateFields (mise a jour dynamique)
 * - updateStatus
 * - deleteObjective
 * - getProgress
 * - calculateProgress
 * - findBySiteWithProgress
 * - getSiteStats
 * - findActiveBySiteWithProgress
 * - updateAllProgress
 * - getAlerts
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

import { objectiveRepository } from './objective.repository';

describe('ObjectiveRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // findWithFilters
  // --------------------------------------------------------------------------

  describe('findWithFilters', () => {
    it('should return all objectives when no filters applied', async () => {
      const mockRows = [
        { id: 'obj-1', name: 'Objectif 1', site_name: 'Club A', latest_progress: null },
        { id: 'obj-2', name: 'Objectif 2', site_name: 'Club B', latest_progress: null },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await objectiveRepository.findWithFilters({});

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('JOIN sites s ON s.id = o.site_id');
      expect(sql).toContain('ORDER BY o.priority DESC');
      expect(mockQuery.mock.calls[0][1]).toEqual([]);
    });

    it('should filter by site_id and status', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await objectiveRepository.findWithFilters({ site_id: 'site-1', status: 'active' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('o.site_id = $1');
      expect(sql).toContain('o.status = $2');
      expect(mockQuery.mock.calls[0][1]).toEqual(['site-1', 'active']);
    });

    it('should filter by priority and metric_type', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await objectiveRepository.findWithFilters({ priority: 'high', metric_type: 'screen_time_seconds' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('o.priority = $1');
      expect(sql).toContain('o.metric_type = $2');
      expect(mockQuery.mock.calls[0][1]).toEqual(['high', 'screen_time_seconds']);
    });
  });

  // --------------------------------------------------------------------------
  // findByIdWithSite
  // --------------------------------------------------------------------------

  describe('findByIdWithSite', () => {
    it('should return objective with site name', async () => {
      const mockObj = { id: 'obj-1', name: 'Test', site_name: 'Club A' };
      mockQuery.mockResolvedValue({ rows: [mockObj] });

      const result = await objectiveRepository.findByIdWithSite('obj-1');

      expect(result).toEqual(mockObj);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN sites s ON s.id = o.site_id'),
        ['obj-1']
      );
    });

    it('should return null if objective not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await objectiveRepository.findByIdWithSite('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // siteExists
  // --------------------------------------------------------------------------

  describe('siteExists', () => {
    it('should return true when site exists', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'site-1' }] });

      const exists = await objectiveRepository.siteExists('site-1');

      expect(exists).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id FROM sites WHERE id = $1',
        ['site-1']
      );
    });

    it('should return false when site does not exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const exists = await objectiveRepository.siteExists('nonexistent');

      expect(exists).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // create
  // --------------------------------------------------------------------------

  describe('create', () => {
    it('should insert a new objective and return it', async () => {
      const input = {
        site_id: 'site-1',
        name: 'Screen time goal',
        description: null,
        metric_type: 'screen_time_seconds',
        target_value: 3600,
        target_period: 'daily',
        priority: 'medium',
        start_date: new Date('2026-01-01'),
        end_date: null,
        alert_on_at_risk: true,
        alert_on_achieved: true,
        at_risk_threshold: 50,
        created_by: 'user-1',
      };
      const mockCreated = { id: 'obj-new', ...input };
      mockQuery.mockResolvedValue({ rows: [mockCreated] });

      const result = await objectiveRepository.create(input);

      expect(result).toEqual(mockCreated);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO club_objectives');
      expect(sql).toContain('RETURNING *');
      expect(mockQuery.mock.calls[0][1]).toHaveLength(13);
    });
  });

  // --------------------------------------------------------------------------
  // updateFields
  // --------------------------------------------------------------------------

  describe('updateFields', () => {
    it('should update specified fields and return updated objective', async () => {
      const mockUpdated = { id: 'obj-1', name: 'New name', priority: 'high' };
      mockQuery.mockResolvedValue({ rows: [mockUpdated] });

      const result = await objectiveRepository.updateFields('obj-1', { name: 'New name', priority: 'high' });

      expect(result).toEqual(mockUpdated);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE club_objectives SET');
      expect(sql).toContain('name = $1');
      expect(sql).toContain('priority = $2');
      expect(sql).toContain('WHERE id = $3');
      expect(mockQuery.mock.calls[0][1]).toEqual(['New name', 'high', 'obj-1']);
    });

    it('should return null when no fields to update', async () => {
      const result = await objectiveRepository.updateFields('obj-1', {});

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return null when objective not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await objectiveRepository.updateFields('nonexistent', { name: 'test' });

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // updateStatus
  // --------------------------------------------------------------------------

  describe('updateStatus', () => {
    it('should update status and return objective', async () => {
      const mockUpdated = { id: 'obj-1', status: 'completed' };
      mockQuery.mockResolvedValue({ rows: [mockUpdated] });

      const result = await objectiveRepository.updateStatus('obj-1', 'completed');

      expect(result).toEqual(mockUpdated);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE club_objectives SET status = $1 WHERE id = $2'),
        ['completed', 'obj-1']
      );
    });

    it('should return null if objective not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await objectiveRepository.updateStatus('nonexistent', 'active');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // deleteObjective
  // --------------------------------------------------------------------------

  describe('deleteObjective', () => {
    it('should delete objective and return true', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'obj-1' }] });

      const result = await objectiveRepository.deleteObjective('obj-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM club_objectives WHERE id = $1 RETURNING id',
        ['obj-1']
      );
    });

    it('should return false when objective not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await objectiveRepository.deleteObjective('nonexistent');

      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getProgress
  // --------------------------------------------------------------------------

  describe('getProgress', () => {
    it('should return progress rows with limit', async () => {
      const mockProgress = [
        { id: 'p1', objective_id: 'obj-1', progress_percent: 75 },
        { id: 'p2', objective_id: 'obj-1', progress_percent: 50 },
      ];
      mockQuery.mockResolvedValue({ rows: mockProgress });

      const result = await objectiveRepository.getProgress('obj-1', 30);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM club_objectives_progress'),
        ['obj-1', 30]
      );
    });
  });

  // --------------------------------------------------------------------------
  // calculateProgress
  // --------------------------------------------------------------------------

  describe('calculateProgress', () => {
    it('should call the SQL function and return result', async () => {
      const mockResult = { current_value: 2400, target_value: 3600, progress_percent: 66.7 };
      mockQuery.mockResolvedValue({ rows: [mockResult] });

      const result = await objectiveRepository.calculateProgress('obj-1');

      expect(result).toEqual(mockResult);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM calculate_objective_progress($1)',
        ['obj-1']
      );
    });

    it('should return null if no data', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await objectiveRepository.calculateProgress('obj-1');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // findBySiteWithProgress
  // --------------------------------------------------------------------------

  describe('findBySiteWithProgress', () => {
    it('should return objectives for a site', async () => {
      const mockRows = [{ id: 'obj-1', site_id: 'site-1', latest_progress: null }];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await objectiveRepository.findBySiteWithProgress('site-1');

      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('o.site_id = $1');
      expect(mockQuery.mock.calls[0][1]).toEqual(['site-1']);
    });

    it('should filter by status when provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await objectiveRepository.findBySiteWithProgress('site-1', 'active');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('o.status = $2');
      expect(mockQuery.mock.calls[0][1]).toEqual(['site-1', 'active']);
    });
  });

  // --------------------------------------------------------------------------
  // getSiteStats
  // --------------------------------------------------------------------------

  describe('getSiteStats', () => {
    it('should return aggregated stats for a site', async () => {
      const mockStats = { total: '5', active: '3', completed: '1', paused: '1' };
      mockQuery.mockResolvedValue({ rows: [mockStats] });

      const result = await objectiveRepository.getSiteStats('site-1');

      expect(result).toEqual(mockStats);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("COUNT(*) FILTER (WHERE status = 'active')");
      expect(sql).toContain('WHERE site_id = $1');
    });
  });

  // --------------------------------------------------------------------------
  // updateAllProgress
  // --------------------------------------------------------------------------

  describe('updateAllProgress', () => {
    it('should call update function and return count', async () => {
      mockQuery.mockResolvedValue({ rows: [{ update_all_objectives_progress: 12 }] });

      const count = await objectiveRepository.updateAllProgress();

      expect(count).toBe(12);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT update_all_objectives_progress()',
        []
      );
    });

    it('should return 0 when no objectives updated', async () => {
      mockQuery.mockResolvedValue({ rows: [{ update_all_objectives_progress: 0 }] });

      const count = await objectiveRepository.updateAllProgress();

      expect(count).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // getAlerts
  // --------------------------------------------------------------------------

  describe('getAlerts', () => {
    it('should return alerts for an objective', async () => {
      const mockAlerts = [
        { id: 'alert-1', objective_id: 'obj-1', created_at: new Date() },
      ];
      mockQuery.mockResolvedValue({ rows: mockAlerts });

      const result = await objectiveRepository.getAlerts('obj-1', 20);

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM club_objective_alerts'),
        ['obj-1', 20]
      );
    });
  });
});
