/**
 * Tests unitaires pour remoteCommandRepository
 *
 * Teste les methodes du repository de commandes a distance :
 * - create, updateStatus, updateResult
 * - findStatusById, findRecentBySite
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

import { remoteCommandRepository } from './remote-command.repository';

describe('RemoteCommandRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // create
  // --------------------------------------------------------------------------

  describe('create', () => {
    it('should insert a new command and return it', async () => {
      const mockCommand = {
        id: 'cmd-1',
        site_id: 'site-1',
        command_type: 'reboot',
        command_data: null,
        status: 'pending',
        executed_by: 'user-1',
        created_at: new Date(),
      };
      mockQuery.mockResolvedValue({ rows: [mockCommand], rowCount: 1 });

      const result = await remoteCommandRepository.create({
        id: 'cmd-1',
        siteId: 'site-1',
        commandType: 'reboot',
        commandData: null,
        executedBy: 'user-1',
      });

      expect(result).toEqual(mockCommand);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO remote_commands'),
        ['cmd-1', 'site-1', 'reboot', null, 'user-1']
      );
    });

    it('should default executedBy to null', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'cmd-2' }], rowCount: 1 });

      await remoteCommandRepository.create({
        id: 'cmd-2',
        siteId: 'site-1',
        commandType: 'update',
        commandData: '{"version":"2.0"}',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO remote_commands'),
        ['cmd-2', 'site-1', 'update', '{"version":"2.0"}', null]
      );
    });
  });

  // --------------------------------------------------------------------------
  // updateStatus
  // --------------------------------------------------------------------------

  describe('updateStatus', () => {
    it('should update status without error message', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await remoteCommandRepository.updateStatus('cmd-1', 'sent');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE remote_commands SET status = $1'),
        ['sent', 'cmd-1']
      );
      // Should NOT include error_message in the query
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('error_message');
    });

    it('should update status with error message', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await remoteCommandRepository.updateStatus('cmd-1', 'error', 'Connection timeout');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('error_message'),
        ['error', 'Connection timeout', 'cmd-1']
      );
    });
  });

  // --------------------------------------------------------------------------
  // updateResult
  // --------------------------------------------------------------------------

  describe('updateResult', () => {
    it('should update status and result as JSON', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await remoteCommandRepository.updateResult('cmd-1', 'completed', { output: 'OK' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE remote_commands SET status = $1, result = $2'),
        ['completed', '{"output":"OK"}', 'cmd-1']
      );
    });
  });

  // --------------------------------------------------------------------------
  // findStatusById
  // --------------------------------------------------------------------------

  describe('findStatusById', () => {
    it('should return status row when command exists', async () => {
      const mockStatus = { status: 'completed', result: { ok: true }, error_message: null };
      mockQuery.mockResolvedValue({ rows: [mockStatus], rowCount: 1 });

      const result = await remoteCommandRepository.findStatusById('cmd-1');

      expect(result).toEqual(mockStatus);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT status, result, error_message FROM remote_commands'),
        ['cmd-1']
      );
    });

    it('should return null when command not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await remoteCommandRepository.findStatusById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // findRecentBySite
  // --------------------------------------------------------------------------

  describe('findRecentBySite', () => {
    it('should return recent commands ordered by date desc', async () => {
      const mockCommands = [
        { id: 'cmd-2', created_at: new Date('2026-02-10') },
        { id: 'cmd-1', created_at: new Date('2026-02-09') },
      ];
      mockQuery.mockResolvedValue({ rows: mockCommands, rowCount: 2 });

      const result = await remoteCommandRepository.findRecentBySite('site-1', 10);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        ['site-1', 10]
      );
    });

    it('should default limit to 20', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await remoteCommandRepository.findRecentBySite('site-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['site-1', 20]
      );
    });
  });
});
