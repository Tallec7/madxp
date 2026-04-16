/**
 * Tests unitaires pour remotionRenderJobRepository (ADR-054).
 * Couvre le cycle complet d'un render job asynchrone :
 * claim atomique SKIP LOCKED → updateProgress → markCompleted / markFailed
 * + recovery (failStaleRunningJobs) et cleanup.
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

import { remotionRenderJobRepository } from './remotion-render-job.repository';

describe('RemotionRenderJobRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('inserts a new job with pending defaults and returns the row', async () => {
      const row = { id: 'job-1', status: 'pending', progress: 0 };
      mockQuery.mockResolvedValue({ rows: [row] });

      const result = await remotionRenderJobRepository.create({
        template_id: 'tpl-1',
        props: { foo: 'bar' },
        title: 'My video',
        requested_by: 'user-1',
        requested_for_site_id: 'site-1',
      });

      expect(result).toEqual(row);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO remotion_render_jobs'),
        ['tpl-1', JSON.stringify({ foo: 'bar' }), 'My video', 'user-1', 'site-1']
      );
    });
  });

  describe('findById', () => {
    it('returns the row when found', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'job-1' }] });
      const result = await remotionRenderJobRepository.findById('job-1');
      expect(result).toEqual({ id: 'job-1' });
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await remotionRenderJobRepository.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('claimNextPending', () => {
    it('atomically claims the oldest pending job using FOR UPDATE SKIP LOCKED', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'job-1', status: 'running' }] });

      const result = await remotionRenderJobRepository.claimNextPending('worker-A');

      expect(result).toEqual({ id: 'job-1', status: 'running' });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
      expect(sql).toMatch(/status = 'running'/);
      expect(mockQuery.mock.calls[0][1]).toEqual(['worker-A']);
    });

    it('returns null when no job is pending', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await remotionRenderJobRepository.claimNextPending('worker-A');
      expect(result).toBeNull();
    });
  });

  describe('updateProgress', () => {
    it('clamps progress to 0-100 and rounds when phase provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await remotionRenderJobRepository.updateProgress('job-1', 42.6, 'rendering');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('progress = $1, phase = $2'),
        [43, 'rendering', 'job-1']
      );
    });

    it('clamps overflow to 100', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await remotionRenderJobRepository.updateProgress('job-1', 150);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('progress = $1'),
        [100, 'job-1']
      );
    });

    it('clamps negative to 0', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await remotionRenderJobRepository.updateProgress('job-1', -5);
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [0, 'job-1']);
    });
  });

  describe('markCompleted', () => {
    it('sets status completed with output metadata and returns the row', async () => {
      const row = { id: 'job-1', status: 'completed', video_id: 'vid-1' };
      mockQuery.mockResolvedValue({ rows: [row] });

      const result = await remotionRenderJobRepository.markCompleted('job-1', {
        video_id: 'vid-1',
        video_url: 'https://ftp/vid.mp4',
        file_size: 12345,
      });

      expect(result).toEqual(row);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'completed'"),
        ['vid-1', 'https://ftp/vid.mp4', 12345, 'job-1']
      );
    });

    it('returns null when no row was updated', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await remotionRenderJobRepository.markCompleted('missing', {
        video_id: 'v',
        video_url: 'u',
        file_size: 0,
      });
      expect(result).toBeNull();
    });
  });

  describe('markFailed', () => {
    it('truncates error message to 2000 chars', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'job-1' }] });
      const longError = 'x'.repeat(5000);

      await remotionRenderJobRepository.markFailed('job-1', longError);

      const params = mockQuery.mock.calls[0][1];
      expect(params[0].length).toBe(2000);
      expect(params[1]).toBe('job-1');
    });

    it('returns null when no row was updated', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await remotionRenderJobRepository.markFailed('missing', 'err');
      expect(result).toBeNull();
    });
  });

  describe('cleanupOlderThan', () => {
    it('deletes finished jobs older than N days and returns rowCount', async () => {
      mockQuery.mockResolvedValue({ rowCount: 3 });
      const count = await remotionRenderJobRepository.cleanupOlderThan(7);
      expect(count).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('completed', 'failed')"),
        [7]
      );
    });

    it('returns 0 when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });
      const count = await remotionRenderJobRepository.cleanupOlderThan(30);
      expect(count).toBe(0);
    });
  });

  describe('failStaleRunningJobs', () => {
    it('marks stale running jobs as failed (boot recovery)', async () => {
      mockQuery.mockResolvedValue({ rowCount: 2 });
      const count = await remotionRenderJobRepository.failStaleRunningJobs(10);
      expect(count).toBe(2);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/status = 'failed'/);
      expect(sql).toMatch(/Render interrompu/);
      expect(params).toEqual([10]);
    });

    it('uses default staleMinutes=10 when not provided', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      await remotionRenderJobRepository.failStaleRunningJobs();
      expect(mockQuery.mock.calls[0][1]).toEqual([10]);
    });
  });
});
