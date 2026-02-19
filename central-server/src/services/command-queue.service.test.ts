/**
 * Tests unitaires pour le service de file d'attente de commandes
 *
 * Ce service gère:
 * - La mise en queue des commandes pour les sites offline
 * - L'envoi automatique à la reconnexion
 * - La gestion des priorités et expirations
 *
 * @module command-queue.service.test
 */

// Mock dependencies before importing the service
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

// Mock socket service
const mockIsConnected = jest.fn();
const mockSendCommand = jest.fn();
jest.mock('./socket.service', () => ({
  __esModule: true,
  default: {
    isConnected: (siteId: string) => mockIsConnected(siteId),
    sendCommand: (siteId: string, command: any) => mockSendCommand(siteId, command),
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-cmd-1234'),
}));

// Import after mocks
import { commandQueueService } from './command-queue.service';

describe('CommandQueueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected.mockReset();
    mockSendCommand.mockReset();
  });

  // ============================================
  // queueCommand
  // ============================================
  describe('queueCommand', () => {
    it('should queue a command for offline site', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await commandQueueService.queueCommand(
        'site-123',
        'update_config',
        { neoProContent: { sponsors: [] } }
      );

      expect(result.queued).toBe(true);
      expect(result.commandId).toBe('mock-uuid-cmd-1234');
      expect(result.message).toContain('mise en file d\'attente');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO pending_commands'),
        expect.arrayContaining([
          'mock-uuid-cmd-1234',
          'site-123',
          'update_config',
        ])
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Command queued for offline site',
        expect.objectContaining({
          commandId: 'mock-uuid-cmd-1234',
          siteId: 'site-123',
          commandType: 'update_config',
        })
      );
    });

    it('should reject realtime-only commands', async () => {
      const realtimeCommands = [
        'get_logs',
        'get_system_info',
        'get_config',
        'network_diagnostics',
        'get_health_status',
        'run_diagnostics',
        'fix_hotspot',
        'export_debug_bundle',
      ];

      for (const cmd of realtimeCommands) {
        const result = await commandQueueService.queueCommand('site-123', cmd, {});

        expect(result.queued).toBe(false);
        expect(result.commandId).toBe('');
        expect(result.message).toContain('connexion temps réel');
      }

      // Should not have called the database
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should accept queueable commands', async () => {
      const queueableCommands = [
        'update_config',
        'deploy_video',
        'delete_video',
        'update_software',
        'restart_service',
        'reboot',
        'update_hotspot',
      ];

      for (const cmd of queueableCommands) {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await commandQueueService.queueCommand('site-123', cmd, {});

        expect(result.queued).toBe(true);
      }
    });

    it('should apply custom priority', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await commandQueueService.queueCommand(
        'site-123',
        'update_config',
        {},
        { priority: 1 }
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([1]) // priority
      );
    });

    it('should calculate expiration date from expiresIn', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      await commandQueueService.queueCommand(
        'site-123',
        'update_config',
        {},
        { expiresIn: 3600000 } // 1 hour
      );

      const expectedExpiry = new Date(now + 3600000);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expectedExpiry])
      );

      jest.restoreAllMocks();
    });

    it('should propagate database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        commandQueueService.queueCommand('site-123', 'update_config', {})
      ).rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // ============================================
  // sendOrQueue
  // ============================================
  describe('sendOrQueue', () => {
    it('should send command if site is connected', async () => {
      mockIsConnected.mockReturnValue(true);
      mockSendCommand.mockReturnValue(true);
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // INSERT into remote_commands
        .mockResolvedValueOnce({ rows: [] }); // UPDATE status

      const result = await commandQueueService.sendOrQueue(
        'site-123',
        'update_config',
        { neoProContent: {} }
      );

      expect(result.sent).toBe(true);
      expect(result.queued).toBe(false);
      expect(result.message).toBe('Commande envoyée au site.');

      expect(mockSendCommand).toHaveBeenCalledWith('site-123', {
        id: 'mock-uuid-cmd-1234',
        type: 'update_config',
        data: { neoProContent: {} },
      });
    });

    it('should queue command if site is disconnected', async () => {
      mockIsConnected.mockReturnValue(false);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT into pending_commands

      const result = await commandQueueService.sendOrQueue(
        'site-123',
        'update_config',
        {}
      );

      expect(result.sent).toBe(false);
      expect(result.queued).toBe(true);
      expect(result.message).toContain('file d\'attente');
    });

    it('should handle zombie connection (send fails despite isConnected=true)', async () => {
      mockIsConnected.mockReturnValue(true);
      mockSendCommand.mockReturnValue(false); // Send fails
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // INSERT into remote_commands
        .mockResolvedValueOnce({ rows: [] }) // UPDATE status to failed
        .mockResolvedValueOnce({ rows: [] }); // INSERT into pending_commands (fallback)

      const result = await commandQueueService.sendOrQueue(
        'site-123',
        'update_config',
        {}
      );

      expect(result.sent).toBe(false);
      expect(result.queued).toBe(true);
      expect(result.message).toContain('Connexion instable');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Command send failed despite isConnected=true (zombie connection)',
        expect.any(Object)
      );
    });

    it('should not queue realtime commands on zombie connection', async () => {
      mockIsConnected.mockReturnValue(true);
      mockSendCommand.mockReturnValue(false);
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // INSERT into remote_commands
        .mockResolvedValueOnce({ rows: [] }); // UPDATE status to failed

      const result = await commandQueueService.sendOrQueue(
        'site-123',
        'get_logs',
        {}
      );

      expect(result.sent).toBe(false);
      expect(result.queued).toBe(false);
      expect(result.message).toContain('connexion stable');
    });

    it('should reject realtime commands when site is offline', async () => {
      mockIsConnected.mockReturnValue(false);

      const result = await commandQueueService.sendOrQueue(
        'site-123',
        'get_logs',
        {}
      );

      expect(result.sent).toBe(false);
      expect(result.queued).toBe(false);
      expect(result.message).toContain("n'est pas connecté");
    });
  });

  // ============================================
  // getPendingCommands
  // ============================================
  describe('getPendingCommands', () => {
    it('should return pending commands sorted by priority and date', async () => {
      const mockCommands = [
        {
          id: 'cmd-1',
          site_id: 'site-123',
          command_type: 'update_config',
          command_data: {},
          priority: 1,
          created_at: new Date('2024-01-01'),
          attempts: 0,
          max_attempts: 3,
        },
        {
          id: 'cmd-2',
          site_id: 'site-123',
          command_type: 'deploy_video',
          command_data: {},
          priority: 5,
          created_at: new Date('2024-01-02'),
          attempts: 0,
          max_attempts: 3,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockCommands });

      const result = await commandQueueService.getPendingCommands('site-123');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('cmd-1'); // Higher priority first

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY priority ASC'),
        ['site-123']
      );
    });

    it('should filter out expired and max-attempted commands', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await commandQueueService.getPendingCommands('site-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('expires_at IS NULL OR expires_at > NOW()'),
        expect.any(Array)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('attempts < max_attempts'),
        expect.any(Array)
      );
    });
  });

  // ============================================
  // processPendingCommands
  // ============================================
  describe('processPendingCommands', () => {
    it('should return early if no pending commands', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await commandQueueService.processPendingCommands('site-123');

      expect(result).toEqual({ processed: 0, failed: 0, remaining: 0 });
    });

    it('should process pending commands when site reconnects', async () => {
      const mockCommands = [
        {
          id: 'cmd-1',
          site_id: 'site-123',
          command_type: 'update_config',
          command_data: { neoProContent: {} },
          priority: 5,
          created_at: new Date(),
          attempts: 0,
          max_attempts: 3,
          created_by: 'user-123',
        },
      ];

      mockIsConnected.mockReturnValue(true);
      mockSendCommand.mockReturnValue(true);
      mockQuery
        .mockResolvedValueOnce({ rows: mockCommands }) // getPendingCommands
        .mockResolvedValueOnce({ rows: [] }) // UPDATE attempts
        .mockResolvedValueOnce({ rows: [] }) // INSERT remote_commands
        .mockResolvedValueOnce({ rows: [] }) // UPDATE sites SET config_update_pending_until (update_config lock)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE remote_commands status='executing'
        .mockResolvedValueOnce({ rows: [] }) // DELETE from pending_commands
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // COUNT remaining

      const result = await commandQueueService.processPendingCommands('site-123');

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);

      expect(mockSendCommand).toHaveBeenCalledWith('site-123', {
        id: 'mock-uuid-cmd-1234',
        type: 'update_config',
        data: { neoProContent: {} },
      });
    });

    it('should stop if site disconnects during processing', async () => {
      const mockCommands = [
        { id: 'cmd-1', command_type: 'update_config', command_data: {}, attempts: 0, max_attempts: 3 },
        { id: 'cmd-2', command_type: 'deploy_video', command_data: {}, attempts: 0, max_attempts: 3 },
      ];

      // First check: connected, second check: disconnected
      mockIsConnected
        .mockReturnValueOnce(true) // First command
        .mockReturnValueOnce(false); // Second command - site disconnected

      mockSendCommand.mockReturnValue(true);
      mockQuery
        .mockResolvedValueOnce({ rows: mockCommands }) // getPendingCommands
        .mockResolvedValueOnce({ rows: [] }) // UPDATE attempts (cmd-1)
        .mockResolvedValueOnce({ rows: [] }) // INSERT remote_commands (cmd-1)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE sites SET config_update_pending_until (update_config lock)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE remote_commands status='executing' (cmd-1)
        .mockResolvedValueOnce({ rows: [] }) // DELETE cmd-1
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // COUNT remaining

      const result = await commandQueueService.processPendingCommands('site-123');

      expect(result.processed).toBe(1);
      expect(result.remaining).toBe(1);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Site disconnected during pending commands processing',
        { siteId: 'site-123' }
      );
    });

    it('should increment attempts on each try', async () => {
      const mockCommands = [
        { id: 'cmd-1', command_type: 'update_config', command_data: {}, attempts: 0, max_attempts: 3 },
      ];

      mockIsConnected.mockReturnValue(true);
      mockSendCommand.mockReturnValue(false); // Fails

      mockQuery
        .mockResolvedValueOnce({ rows: mockCommands }) // getPendingCommands
        .mockResolvedValueOnce({ rows: [] }) // UPDATE attempts
        .mockResolvedValueOnce({ rows: [] }) // INSERT remote_commands
        .mockResolvedValueOnce({ rows: [] }) // UPDATE sites SET config_update_pending_until (update_config lock, before send)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE sites SET config_update_pending_until = NULL (send failed, clear lock)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // COUNT remaining

      await commandQueueService.processPendingCommands('site-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('attempts = attempts + 1'),
        ['cmd-1']
      );
    });
  });

  // ============================================
  // cancelPendingCommand
  // ============================================
  describe('cancelPendingCommand', () => {
    it('should delete the command and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await commandQueueService.cancelPendingCommand('cmd-123');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM pending_commands'),
        ['cmd-123']
      );
    });

    it('should return false if command not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await commandQueueService.cancelPendingCommand('nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // clearPendingCommands
  // ============================================
  describe('clearPendingCommands', () => {
    it('should delete all commands for a site', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });

      const result = await commandQueueService.clearPendingCommands('site-123');

      expect(result).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM pending_commands WHERE site_id'),
        ['site-123']
      );
    });
  });

  // ============================================
  // cleanupExpiredCommands
  // ============================================
  describe('cleanupExpiredCommands', () => {
    it('should delete expired commands', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });

      const result = await commandQueueService.cleanupExpiredCommands();

      expect(result).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('expires_at IS NOT NULL AND expires_at < NOW()')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaned up expired pending commands',
        { count: 3 }
      );
    });

    it('should not log if no commands expired', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await commandQueueService.cleanupExpiredCommands();

      expect(result).toBe(0);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // isQueueable
  // ============================================
  describe('isQueueable', () => {
    it('should return true for queueable commands', () => {
      expect(commandQueueService.isQueueable('update_config')).toBe(true);
      expect(commandQueueService.isQueueable('deploy_video')).toBe(true);
      expect(commandQueueService.isQueueable('update_software')).toBe(true);
    });

    it('should return false for realtime-only commands', () => {
      expect(commandQueueService.isQueueable('get_logs')).toBe(false);
      expect(commandQueueService.isQueueable('get_config')).toBe(false);
      expect(commandQueueService.isQueueable('fix_hotspot')).toBe(false);
    });
  });

  // ============================================
  // getQueueSummary
  // ============================================
  describe('getQueueSummary', () => {
    it('should return queue summary from view', async () => {
      const mockSummary = [
        {
          site_id: 'site-1',
          club_name: 'Club A',
          site_status: 'offline',
          pending_count: 3,
          highest_priority: 1,
          oldest_command: new Date('2024-01-01'),
          newest_command: new Date('2024-01-03'),
          command_types: ['update_config', 'deploy_video'],
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockSummary });

      const result = await commandQueueService.getQueueSummary();

      expect(result).toEqual(mockSummary);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('pending_commands_summary')
      );
    });
  });
});
