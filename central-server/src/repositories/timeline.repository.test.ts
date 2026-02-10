/**
 * Tests unitaires pour timelineRepository
 *
 * Teste les methodes du repository de timeline :
 * - getForSite (4 requetes en parallele)
 * - getCloudVideos
 * - findPendingCommand, findCommandBySiteAndId
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

import { timelineRepository } from './timeline.repository';

describe('TimelineRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // getForSite
  // --------------------------------------------------------------------------

  describe('getForSite', () => {
    it('should execute 4 queries in parallel and return timeline data', async () => {
      const mockDeployments = [{ id: 'd1', event_type: 'deployment', timestamp: new Date() }];
      const mockCommands = [{ id: 'c1', event_type: 'command', timestamp: new Date() }];
      const mockConfigs = [{ id: 'cfg1', event_type: 'config', timestamp: new Date() }];
      const mockAlerts = [{ id: 'a1', event_type: 'alert', timestamp: new Date() }];

      mockQuery
        .mockResolvedValueOnce({ rows: mockDeployments, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockCommands, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockConfigs, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockAlerts, rowCount: 1 });

      const result = await timelineRepository.getForSite('site-1', 20);

      expect(result.deployments).toHaveLength(1);
      expect(result.commands).toHaveLength(1);
      expect(result.configs).toHaveLength(1);
      expect(result.alerts).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledTimes(4);

      // Verify each query targets the correct table
      const calls = mockQuery.mock.calls;
      expect((calls[0][0] as string)).toContain('content_deployments');
      expect((calls[1][0] as string)).toContain('remote_commands');
      expect((calls[2][0] as string)).toContain('config_history');
      expect((calls[3][0] as string)).toContain('alerts');

      // Each query should receive siteId and limit
      for (const call of calls) {
        expect(call[1]).toEqual(['site-1', 20]);
      }
    });

    it('should return empty arrays when no events exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await timelineRepository.getForSite('site-1', 10);

      expect(result.deployments).toEqual([]);
      expect(result.commands).toEqual([]);
      expect(result.configs).toEqual([]);
      expect(result.alerts).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getCloudVideos
  // --------------------------------------------------------------------------

  describe('getCloudVideos', () => {
    it('should return cloud videos ordered by created_at DESC', async () => {
      const mockVideos = [
        { id: 'v1', filename: 'video1.mp4', created_at: new Date() },
        { id: 'v2', filename: 'video2.mp4', created_at: new Date() },
      ];
      mockQuery.mockResolvedValue({ rows: mockVideos, rowCount: 2 });

      const result = await timelineRepository.getCloudVideos(100);

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('FROM videos v');
      expect(sql).toContain('ORDER BY v.created_at DESC');
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [100]);
    });

    it('should default limit to 500', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await timelineRepository.getCloudVideos();

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [500]);
    });
  });

  // --------------------------------------------------------------------------
  // findPendingCommand
  // --------------------------------------------------------------------------

  describe('findPendingCommand', () => {
    it('should return command when it exists', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'cmd-1' }], rowCount: 1 });

      const result = await timelineRepository.findPendingCommand('cmd-1', 'site-1');

      expect(result).toEqual({ id: 'cmd-1' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('pending_commands'),
        ['cmd-1', 'site-1']
      );
    });

    it('should return null when command not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await timelineRepository.findPendingCommand('cmd-x', 'site-1');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // findCommandBySiteAndId
  // --------------------------------------------------------------------------

  describe('findCommandBySiteAndId', () => {
    it('should return command details when found', async () => {
      const mockCmd = { id: 'cmd-1', site_id: 'site-1', status: 'completed' };
      mockQuery.mockResolvedValue({ rows: [mockCmd], rowCount: 1 });

      const result = await timelineRepository.findCommandBySiteAndId('cmd-1', 'site-1');

      expect(result).toEqual(mockCmd);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('remote_commands'),
        ['cmd-1', 'site-1']
      );
    });

    it('should return null when command not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await timelineRepository.findCommandBySiteAndId('cmd-x', 'site-1');

      expect(result).toBeNull();
    });
  });
});
