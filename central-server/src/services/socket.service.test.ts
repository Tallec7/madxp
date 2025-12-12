/**
 * Tests unitaires pour le service Socket.IO
 *
 * Ce service est CRITIQUE car il gère:
 * - L'authentification des agents (boîtiers)
 * - La réception des heartbeats et métriques
 * - L'envoi des commandes aux boîtiers
 * - La synchronisation de l'état local
 * - Les alertes et notifications
 *
 * @module socket.service.test
 */

import { Server as HTTPServer } from 'http';
import { Socket } from 'socket.io';

// Mock dependencies before importing the service
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: mockQuery,
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

const mockAlertService = {
  siteOffline: jest.fn().mockResolvedValue(undefined),
  highTemperature: jest.fn().mockResolvedValue(undefined),
  lowDiskSpace: jest.fn().mockResolvedValue(undefined),
};
jest.mock('./alert.service', () => ({
  alertService: mockAlertService,
}));

// Mock deployment service
jest.mock('./deployment.service', () => ({
  default: {
    processPendingDeploymentsForSite: jest.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocks
import socketService from './socket.service';
import { SocketData, HeartbeatMessage, CommandResult } from '../types';

// Helper to create mock socket
const createMockSocket = (overrides: Partial<Socket> = {}): Partial<Socket> => {
  const eventHandlers: Map<string, Function> = new Map();

  return {
    id: 'socket-123',
    handshake: {
      headers: { 'x-forwarded-for': '203.0.113.1' },
      address: '127.0.0.1',
    } as any,
    on: jest.fn((event: string, handler: Function) => {
      eventHandlers.set(event, handler);
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    // Helper to trigger event handlers
    triggerEvent: (event: string, data?: any) => {
      const handler = eventHandlers.get(event);
      if (handler) handler(data);
    },
    ...overrides,
  } as any;
};

// Helper to get internal state
const getInternalState = () => {
  return {
    connectedSites: (socketService as any).connectedSites as Map<string, Socket>,
    io: (socketService as any).io,
  };
};

describe('SocketService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clean up any previous state
    socketService.cleanup();
    // Reset internal state
    (socketService as any).connectedSites = new Map();
    (socketService as any).pendingCommands = new Map();
    (socketService as any).io = null;
  });

  afterAll(() => {
    // Ensure proper cleanup to avoid Jest hanging
    socketService.cleanup();
  });

  describe('initialize', () => {
    it('should initialize Socket.IO server', () => {
      const mockHttpServer = {} as HTTPServer;

      // This would normally create a real Socket.IO server
      // For testing, we verify the service is ready
      expect(() => socketService.initialize(mockHttpServer)).not.toThrow();
    });
  });

  describe('authenticateAgent (private)', () => {
    const validSocketData: SocketData = {
      siteId: 'site-uuid-123',
      apiKey: 'valid-api-key-32chars-hex-string',
    };

    const mockSiteRow = {
      id: 'site-uuid-123',
      site_name: 'Test Site',
      api_key: 'valid-api-key-32chars-hex-string',
    };

    it('should authenticate agent with valid credentials', async () => {
      const mockSocket = createMockSocket();

      mockQuery
        .mockResolvedValueOnce({ rows: [mockSiteRow] }) // SELECT site
        .mockResolvedValueOnce({ rows: [] }); // UPDATE status

      // Call private method through reflection
      await (socketService as any).authenticateAgent(mockSocket, validSocketData);

      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        message: 'Authentification réussie',
        siteId: 'site-uuid-123',
      });

      // Should register event handlers
      expect(mockSocket.on).toHaveBeenCalledWith('heartbeat', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('command_result', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('deploy_progress', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('sync_local_state', expect.any(Function));
    });

    it('should reject authentication with missing siteId', async () => {
      const mockSocket = createMockSocket();
      const invalidData = { siteId: '', apiKey: 'some-key' };

      await expect(
        (socketService as any).authenticateAgent(mockSocket, invalidData)
      ).rejects.toThrow('Identifiants manquants');
    });

    it('should reject authentication with missing apiKey', async () => {
      const mockSocket = createMockSocket();
      const invalidData = { siteId: 'site-123', apiKey: '' };

      await expect(
        (socketService as any).authenticateAgent(mockSocket, invalidData)
      ).rejects.toThrow('Identifiants manquants');
    });

    it('should reject authentication for non-existent site', async () => {
      const mockSocket = createMockSocket();

      mockQuery.mockResolvedValueOnce({ rows: [] }); // No site found

      await expect(
        (socketService as any).authenticateAgent(mockSocket, validSocketData)
      ).rejects.toThrow('Site non trouvé');
    });

    it('should reject authentication with invalid API key', async () => {
      const mockSocket = createMockSocket();
      const wrongKeyData = {
        siteId: 'site-uuid-123',
        apiKey: 'wrong-api-key-different-length!',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ ...mockSiteRow, api_key: 'correct-key-32chars-hex-string' }],
      });

      await expect(
        (socketService as any).authenticateAgent(mockSocket, wrongKeyData)
      ).rejects.toThrow('Clé API invalide');
    });

    it('should update site status to online after authentication', async () => {
      const mockSocket = createMockSocket();

      mockQuery
        .mockResolvedValueOnce({ rows: [mockSiteRow] })
        .mockResolvedValueOnce({ rows: [] });

      await (socketService as any).authenticateAgent(mockSocket, validSocketData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sites SET status'),
        expect.arrayContaining(['online', 'site-uuid-123'])
      );
    });

    it('should extract client IP from x-forwarded-for header', async () => {
      const mockSocket = createMockSocket({
        handshake: {
          headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
          address: '127.0.0.1',
        } as any,
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [mockSiteRow] })
        .mockResolvedValueOnce({ rows: [] });

      await (socketService as any).authenticateAgent(mockSocket, validSocketData);

      // Should use first IP from x-forwarded-for
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('last_ip'),
        expect.arrayContaining(['203.0.113.1'])
      );
    });

    it('should add socket to connected sites map', async () => {
      const mockSocket = createMockSocket();

      mockQuery
        .mockResolvedValueOnce({ rows: [mockSiteRow] })
        .mockResolvedValueOnce({ rows: [] });

      await (socketService as any).authenticateAgent(mockSocket, validSocketData);

      const { connectedSites } = getInternalState();
      expect(connectedSites.has('site-uuid-123')).toBe(true);
    });
  });

  describe('handleDisconnection (private)', () => {
    it('should update site status to offline on disconnect', async () => {
      const mockSocket = createMockSocket();
      (mockSocket as any).siteId = 'site-uuid-123';
      (mockSocket as any).siteName = 'Test Site';

      // Add to connected sites first
      (socketService as any).connectedSites.set('site-uuid-123', mockSocket);

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleDisconnection(mockSocket);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sites SET status'),
        expect.arrayContaining(['offline', 'site-uuid-123'])
      );
    });

    it('should remove socket from connected sites', async () => {
      const mockSocket = createMockSocket();
      (mockSocket as any).siteId = 'site-uuid-123';

      (socketService as any).connectedSites.set('site-uuid-123', mockSocket);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleDisconnection(mockSocket);

      const { connectedSites } = getInternalState();
      expect(connectedSites.has('site-uuid-123')).toBe(false);
    });

    it('should send Slack alert for site going offline', async () => {
      const mockSocket = createMockSocket();
      (mockSocket as any).siteId = 'site-uuid-123';
      (mockSocket as any).siteName = 'Test Site';

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleDisconnection(mockSocket);

      expect(mockAlertService.siteOffline).toHaveBeenCalledWith(
        'site-uuid-123',
        'Test Site'
      );
    });

    it('should handle disconnect for unauthenticated socket', async () => {
      const mockSocket = createMockSocket();
      // No siteId set

      // Should not throw
      await (socketService as any).handleDisconnection(mockSocket);

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('handleHeartbeat (private)', () => {
    const heartbeatMessage: HeartbeatMessage = {
      siteId: 'site-uuid-123',
      timestamp: Date.now(),
      metrics: {
        cpu: 45.2,
        memory: 62.1,
        temperature: 52.3,
        disk: 78.5,
        uptime: 3600000,
        localIp: '192.168.1.100',
      },
    };

    it('should store metrics in database', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await (socketService as any).handleHeartbeat('site-uuid-123', heartbeatMessage);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO metrics'),
        expect.arrayContaining([
          'site-uuid-123',
          45.2,
          62.1,
          52.3,
          78.5,
          3600000,
        ])
      );
    });

    it('should update site last_seen_at and local_ip', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await (socketService as any).handleHeartbeat('site-uuid-123', heartbeatMessage);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sites SET last_seen_at'),
        expect.arrayContaining(['online', 'site-uuid-123', '192.168.1.100'])
      );
    });

    it('should create alert for high temperature (>75°C)', async () => {
      const hotMetrics = {
        ...heartbeatMessage,
        metrics: { ...heartbeatMessage.metrics, temperature: 78 },
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // INSERT metrics
        .mockResolvedValueOnce({ rows: [] }) // UPDATE sites
        .mockResolvedValueOnce({ rows: [] }) // Check existing alert
        .mockResolvedValueOnce({ rows: [] }) // INSERT alert
        .mockResolvedValueOnce({ rows: [{ club_name: 'Test Club' }] }); // Get club name

      await (socketService as any).handleHeartbeat('site-uuid-123', hotMetrics);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining(['site-uuid-123', 'high_temperature', 'warning'])
      );
    });

    it('should create critical alert for very high temperature (>80°C)', async () => {
      const veryHotMetrics = {
        ...heartbeatMessage,
        metrics: { ...heartbeatMessage.metrics, temperature: 85 },
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ club_name: 'Test Club' }] });

      await (socketService as any).handleHeartbeat('site-uuid-123', veryHotMetrics);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining(['site-uuid-123', 'high_temperature', 'critical'])
      );
    });

    it('should create alert for high disk usage (>90%)', async () => {
      const fullDiskMetrics = {
        ...heartbeatMessage,
        metrics: { ...heartbeatMessage.metrics, disk: 92 },
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ club_name: 'Test Club' }] });

      await (socketService as any).handleHeartbeat('site-uuid-123', fullDiskMetrics);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining(['site-uuid-123', 'high_disk_usage', 'warning'])
      );
    });

    it('should not create duplicate alerts within 1 hour', async () => {
      const hotMetrics = {
        ...heartbeatMessage,
        metrics: { ...heartbeatMessage.metrics, temperature: 78 },
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'existing-alert' }] }); // Alert exists

      await (socketService as any).handleHeartbeat('site-uuid-123', hotMetrics);

      // Should only have 3 queries (no INSERT alert)
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });
  });

  describe('handleCommandResult (private)', () => {
    const successResult: CommandResult = {
      commandId: 'cmd-uuid-123',
      status: 'success',
      result: { message: 'Command executed' },
    };

    const errorResult: CommandResult = {
      commandId: 'cmd-uuid-456',
      status: 'error',
      error: 'Command failed',
    };

    it('should update command status to completed on success', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            command_type: 'update_config',
            command_data: { configVersionId: 'cfg-42' },
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleCommandResult('site-uuid-123', successResult);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE remote_commands'),
        expect.arrayContaining([
          'completed',
          JSON.stringify({ message: 'Command executed' }),
          null,
          'cmd-uuid-123',
        ])
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sites'),
        expect.arrayContaining(['site-uuid-123', 'cfg-42'])
      );
    });

    it('should update command status to failed on error', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            command_type: 'update_config',
            command_data: { configVersionId: 'cfg-42' },
          }],
        });

      await (socketService as any).handleCommandResult('site-uuid-123', errorResult);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE remote_commands'),
        expect.arrayContaining([
          'failed',
          null,
          'Command failed',
          'cmd-uuid-456',
        ])
      );
    });

    it('should emit command_completed event', async () => {
      const mockIo = { emit: jest.fn() };
      (socketService as any).io = mockIo;

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            command_type: 'update_config',
            command_data: { configVersionId: 'cfg-42' },
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleCommandResult('site-uuid-123', successResult);

      expect(mockIo.emit).toHaveBeenCalledWith('command_completed', {
        siteId: 'site-uuid-123',
        commandId: 'cmd-uuid-123',
        status: 'success',
      });
    });
  });

  describe('handleSyncLocalState (private)', () => {
    const syncState = {
      configHash: 'abc123def456',
      config: {
        categories: [
          { id: 'cat1', name: 'Category 1' },
        ],
      },
      timestamp: '2025-12-11T10:00:00Z',
    };
    let triggerPendingConfigSyncSpy: jest.SpyInstance;

    beforeAll(() => {
      triggerPendingConfigSyncSpy = jest
        .spyOn(socketService as any, 'triggerPendingConfigSync')
        .mockResolvedValue(undefined);
    });

    beforeEach(() => {
      triggerPendingConfigSyncSpy.mockClear();
    });

    afterAll(() => {
      triggerPendingConfigSyncSpy.mockRestore();
    });

    it('should store local config mirror in database', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleSyncLocalState('site-uuid-123', syncState);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sites'),
        expect.arrayContaining([
          JSON.stringify(syncState.config),
          'abc123def456',
          'site-uuid-123',
        ])
      );
    });

    it('should emit site_config_updated event', async () => {
      const mockIo = { emit: jest.fn() };
      (socketService as any).io = mockIo;

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleSyncLocalState('site-uuid-123', syncState);

      expect(mockIo.emit).toHaveBeenCalledWith('site_config_updated', {
        siteId: 'site-uuid-123',
        configHash: 'abc123def456',
        categoriesCount: 1,
        timestamp: '2025-12-11T10:00:00Z',
      });
    });
  });

  describe('triggerPendingConfigSync', () => {
    it('should send pending configuration when a version is queued', async () => {
      const mockSocket = { id: 'socket-123', emit: jest.fn() } as unknown as Socket;
      (socketService as any).connectedSites.set('site-uuid-123', mockSocket);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ pending_config_version_id: 'cfg-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ configuration: { foo: 'bar' } }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await (socketService as any).triggerPendingConfigSync('site-uuid-123');

      const insertCall = mockQuery.mock.calls.find(([sql]) => (sql as string).includes('INSERT INTO remote_commands'));
      expect(insertCall).toBeDefined();
      const commandPayload = JSON.parse(insertCall![1][2] as string);
      expect(commandPayload.configVersionId).toBe('cfg-1');

      const updateCall = mockQuery.mock.calls.find(([sql]) => (sql as string).includes('UPDATE remote_commands'));
      expect(updateCall).toBeDefined();

      (socketService as any).connectedSites.delete('site-uuid-123');
    });
  });

  describe('handleDeployProgress (private)', () => {
    it('should update deployment progress', async () => {
      const progress = {
        deploymentId: 'deploy-uuid-123',
        videoId: 'video-uuid-456',
        progress: 50,
      };

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleDeployProgress('site-uuid-123', progress);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE content_deployments'),
        expect.arrayContaining([50, 'deploy-uuid-123'])
      );
    });

    it('should mark deployment as completed', async () => {
      const progress = {
        deploymentId: 'deploy-uuid-123',
        progress: 100,
        completed: true,
      };

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleDeployProgress('site-uuid-123', progress);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'completed'"),
        expect.arrayContaining(['deploy-uuid-123'])
      );
    });

    it('should mark deployment as failed on error', async () => {
      const progress = {
        deploymentId: 'deploy-uuid-123',
        error: 'Download failed',
      };

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleDeployProgress('site-uuid-123', progress);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        expect.arrayContaining(['Download failed', 'deploy-uuid-123'])
      );
    });

    it('should emit deploy_progress event', async () => {
      const mockIo = { emit: jest.fn() };
      (socketService as any).io = mockIo;

      const progress = {
        deploymentId: 'deploy-uuid-123',
        progress: 50,
      };

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (socketService as any).handleDeployProgress('site-uuid-123', progress);

      expect(mockIo.emit).toHaveBeenCalledWith('deploy_progress', expect.objectContaining({
        siteId: 'site-uuid-123',
        deploymentId: 'deploy-uuid-123',
        progress: 50,
      }));
    });
  });

  describe('sendCommand', () => {
    it('should send command to connected site', () => {
      const mockSocket = createMockSocket();
      (socketService as any).connectedSites.set('site-uuid-123', mockSocket);

      const command = {
        id: 'cmd-uuid-123',
        type: 'reboot',
        data: {},
      };

      const result = socketService.sendCommand('site-uuid-123', command);

      expect(result).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('command', command);
    });

    it('should return false for disconnected site', () => {
      const command = {
        id: 'cmd-uuid-123',
        type: 'reboot',
        data: {},
      };

      const result = socketService.sendCommand('nonexistent-site', command);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cannot send command: site not connected',
        expect.any(Object)
      );
    });
  });

  describe('broadcastToGroup', () => {
    it('should send command to all sites in group', () => {
      const mockSocket1 = createMockSocket();
      const mockSocket2 = createMockSocket();

      (socketService as any).connectedSites.set('site-1', mockSocket1);
      (socketService as any).connectedSites.set('site-2', mockSocket2);

      const command = {
        id: 'cmd-uuid-123',
        type: 'restart_service',
        data: { service: 'neopro-app' },
      };

      const result = socketService.broadcastToGroup(['site-1', 'site-2'], command);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(mockSocket1.emit).toHaveBeenCalledWith('command', command);
      expect(mockSocket2.emit).toHaveBeenCalledWith('command', command);
    });

    it('should track failures for disconnected sites', () => {
      const mockSocket = createMockSocket();
      (socketService as any).connectedSites.set('site-1', mockSocket);

      const command = {
        id: 'cmd-uuid-123',
        type: 'reboot',
        data: {},
      };

      const result = socketService.broadcastToGroup(['site-1', 'site-2', 'site-3'], command);

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(2);
    });
  });

  describe('isConnected', () => {
    it('should return true for connected site', () => {
      const mockSocket = createMockSocket();
      (socketService as any).connectedSites.set('site-uuid-123', mockSocket);

      expect(socketService.isConnected('site-uuid-123')).toBe(true);
    });

    it('should return false for disconnected site', () => {
      expect(socketService.isConnected('nonexistent-site')).toBe(false);
    });
  });

  describe('getConnectedSites', () => {
    it('should return list of connected site IDs', () => {
      (socketService as any).connectedSites.set('site-1', createMockSocket());
      (socketService as any).connectedSites.set('site-2', createMockSocket());

      const sites = socketService.getConnectedSites();

      expect(sites).toHaveLength(2);
      expect(sites).toContain('site-1');
      expect(sites).toContain('site-2');
    });

    it('should return empty array when no sites connected', () => {
      const sites = socketService.getConnectedSites();

      expect(sites).toHaveLength(0);
    });
  });

  describe('getConnectionCount', () => {
    it('should return number of connected sites', () => {
      (socketService as any).connectedSites.set('site-1', createMockSocket());
      (socketService as any).connectedSites.set('site-2', createMockSocket());
      (socketService as any).connectedSites.set('site-3', createMockSocket());

      expect(socketService.getConnectionCount()).toBe(3);
    });

    it('should return 0 when no sites connected', () => {
      expect(socketService.getConnectionCount()).toBe(0);
    });
  });

  describe('Security', () => {
    it('should use timing-safe comparison for API keys', async () => {
      // This is tested implicitly by the authentication tests
      // The secureCompare function uses crypto.timingSafeEqual
      // to prevent timing attacks

      const mockSocket = createMockSocket();
      const validData = {
        siteId: 'site-uuid-123',
        apiKey: 'valid-key-exactly-32-characters!',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'site-uuid-123',
          site_name: 'Test',
          api_key: 'different-key-32-chars-here!!',
        }],
      });

      // Different length keys should fail fast but still securely
      await expect(
        (socketService as any).authenticateAgent(mockSocket, validData)
      ).rejects.toThrow('Clé API invalide');
    });
  });

  describe('Command Timeout System', () => {
    it('should track pending commands when sent', () => {
      const mockSocket = createMockSocket();
      (socketService as any).connectedSites.set('site-123', mockSocket);

      const command = {
        id: 'cmd-uuid-123',
        type: 'get_config',
        data: {},
      };

      socketService.sendCommand('site-123', command);

      const pendingCommands = (socketService as any).pendingCommands as Map<string, any>;
      expect(pendingCommands.has('cmd-uuid-123')).toBe(true);

      const pending = pendingCommands.get('cmd-uuid-123');
      expect(pending.siteId).toBe('site-123');
      expect(pending.type).toBe('get_config');
      expect(pending.timeoutMs).toBe(15000); // get_config timeout is 15s
    });

    it('should use default timeout for unknown command types', () => {
      const mockSocket = createMockSocket();
      (socketService as any).connectedSites.set('site-123', mockSocket);

      const command = {
        id: 'cmd-uuid-456',
        type: 'unknown_command_type',
        data: {},
      };

      socketService.sendCommand('site-123', command);

      const pendingCommands = (socketService as any).pendingCommands as Map<string, any>;
      const pending = pendingCommands.get('cmd-uuid-456');
      expect(pending.timeoutMs).toBe(2 * 60 * 1000); // default timeout is 2 minutes
    });

    it('should remove pending command when result is received', async () => {
      // Add a pending command
      const pendingCommands = (socketService as any).pendingCommands as Map<string, any>;
      pendingCommands.set('cmd-to-complete', {
        commandId: 'cmd-to-complete',
        siteId: 'site-123',
        type: 'get_config',
        sentAt: Date.now(),
        timeoutMs: 15000,
      });

      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE query

      // Trigger command result
      const result = {
        commandId: 'cmd-to-complete',
        status: 'success',
        result: { config: {} },
      };

      await (socketService as any).handleCommandResult('site-123', result);

      expect(pendingCommands.has('cmd-to-complete')).toBe(false);
    });

    it('should mark timed out commands as failed', async () => {
      // Add an expired pending command
      const pendingCommands = (socketService as any).pendingCommands as Map<string, any>;
      pendingCommands.set('cmd-timed-out', {
        commandId: 'cmd-timed-out',
        siteId: 'site-123',
        type: 'get_config',
        sentAt: Date.now() - 20000, // 20 seconds ago
        timeoutMs: 15000, // 15 second timeout (expired)
      });

      // Setup mock for io emit
      const mockIo = { emit: jest.fn() };
      (socketService as any).io = mockIo;

      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE query

      // Manually call checkCommandTimeouts
      await (socketService as any).checkCommandTimeouts();

      // Should have called query to mark as failed
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        expect.arrayContaining(['cmd-timed-out'])
      );

      // Should have emitted timeout event
      expect(mockIo.emit).toHaveBeenCalledWith('command_timeout', {
        siteId: 'site-123',
        commandId: 'cmd-timed-out',
        type: 'get_config',
      });

      // Should have removed from pending
      expect(pendingCommands.has('cmd-timed-out')).toBe(false);
    });

    it('should not mark non-expired commands as failed', async () => {
      // Add a recent pending command (not expired)
      const pendingCommands = (socketService as any).pendingCommands as Map<string, any>;
      pendingCommands.set('cmd-still-pending', {
        commandId: 'cmd-still-pending',
        siteId: 'site-123',
        type: 'get_config',
        sentAt: Date.now() - 5000, // 5 seconds ago
        timeoutMs: 15000, // 15 second timeout (not expired)
      });

      await (socketService as any).checkCommandTimeouts();

      // Should NOT have called query
      expect(mockQuery).not.toHaveBeenCalled();

      // Should still be in pending
      expect(pendingCommands.has('cmd-still-pending')).toBe(true);
    });

    it('should cleanup resources on cleanup()', () => {
      // Setup some state
      const pendingCommands = (socketService as any).pendingCommands as Map<string, any>;
      const connectedSites = (socketService as any).connectedSites as Map<string, any>;

      pendingCommands.set('cmd-1', { commandId: 'cmd-1' });
      connectedSites.set('site-1', createMockSocket());

      // Call cleanup
      socketService.cleanup();

      // Verify cleanup
      expect(pendingCommands.size).toBe(0);
      expect(connectedSites.size).toBe(0);
    });
  });
});
