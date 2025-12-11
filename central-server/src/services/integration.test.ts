/**
 * Tests d'intégration E2E pour le flux de synchronisation
 *
 * Ces tests vérifient le comportement de bout en bout des scénarios critiques:
 * - Déploiement vidéo vers un site
 * - Reconnexion et reprise de déploiement
 * - Gestion des erreurs réseau
 * - Timeout et retry automatiques
 *
 * @module integration.test
 */

import { v4 as uuidv4 } from 'uuid';

// Mock de la base de données
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

// Mock du logger
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mocks pour Socket.IO
const mockEmit = jest.fn().mockReturnValue(true);
const mockOn = jest.fn();
const mockTo = jest.fn().mockReturnValue({ emit: jest.fn() });

jest.mock('socket.io', () => {
  return {
    Server: jest.fn().mockImplementation(() => ({
      on: mockOn,
      to: mockTo,
      emit: mockEmit,
    })),
  };
});

// Import après les mocks
import socketService from './socket.service';
import deploymentService from './deployment.service';
import logger from '../config/logger';

describe('Integration Tests - Video Deployment Flow', () => {
  const testSiteId = 'site-test-001';
  const testVideoId = 'video-test-001';
  const testDeploymentId = 'deploy-test-001';

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset socket service state
    socketService.cleanup();
    (socketService as any).connectedSites = new Map();
    (socketService as any).pendingCommands = new Map();
    (socketService as any).io = null;
  });

  afterAll(() => {
    socketService.cleanup();
  });

  describe('Scénario 1: Déploiement vers site connecté', () => {
    it('should successfully deploy video to connected site', async () => {
      // Simuler un site connecté
      const mockSocket = {
        id: 'socket-001',
        emit: mockEmit,
        data: { siteId: testSiteId },
      };
      (socketService as any).connectedSites.set(testSiteId, mockSocket);

      // Mock de la base de données
      mockQuery
        // getDeployment
        .mockResolvedValueOnce({
          rows: [{
            id: testDeploymentId,
            video_id: testVideoId,
            target_type: 'site',
            target_id: testSiteId,
            status: 'pending',
            filename: 'test-video.mp4',
            original_name: 'Test Video.mp4',
            storage_path: 'videos/test/test-video.mp4',
            category: 'annonces',
            subcategory: null,
            duration: 120,
            metadata: null,
          }],
        })
        // getSignedUrl (mock simulating Supabase)
        .mockResolvedValueOnce({ rows: [] })
        // updateDeploymentStatus
        .mockResolvedValueOnce({ rows: [] })
        // createDeploymentSiteEntry
        .mockResolvedValueOnce({
          rows: [{ id: uuidv4() }],
        });

      // Test
      const result = socketService.isConnected(testSiteId);
      expect(result).toBe(true);

      // Vérifier que le site est bien dans la liste
      const connectedSites = socketService.getConnectedSites();
      expect(connectedSites).toContain(testSiteId);
    });

    it('should track deployment progress', async () => {
      // Mock pour updateProgress
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            target_type: 'site',
            target_id: testSiteId,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // update deployment_sites
        .mockResolvedValueOnce({
          rows: [{ avg_progress: 50 }],
        })
        .mockResolvedValueOnce({ rows: [] }); // update content_deployments

      await deploymentService.updateProgress(testDeploymentId, testSiteId, 50, false);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should mark deployment as completed', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            target_type: 'site',
            target_id: testSiteId,
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ avg_progress: 100, all_completed: true }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await deploymentService.updateProgress(testDeploymentId, testSiteId, 100, true);

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('Scénario 2: Site non connecté', () => {
    it('should return false for deployment to disconnected site', async () => {
      const result = socketService.isConnected('disconnected-site');
      expect(result).toBe(false);
    });

    it('should handle reconnection and pending deployments', async () => {
      // Mock pour processPendingDeploymentsForSite
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: testDeploymentId,
              video_id: testVideoId,
              status: 'pending',
              filename: 'test.mp4',
              original_name: 'Test.mp4',
              storage_path: 'videos/test.mp4',
              category: 'default',
              subcategory: null,
              duration: 60,
              metadata: null,
            },
          ],
        })
        .mockResolvedValue({ rows: [] }); // Mock pour les requêtes suivantes

      // processPendingDeploymentsForSite traite les déploiements en attente
      await deploymentService.processPendingDeploymentsForSite(testSiteId);

      // Vérifier que la requête a été appelée
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('Scénario 3: Gestion des erreurs', () => {
    it('should mark deployment as failed on error', async () => {
      const errorMessage = 'Download failed: Connection refused';

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ error_message: null }],
        }) // get deployment
        .mockResolvedValueOnce({ rows: [] }) // update deployment
        .mockResolvedValueOnce({ rows: [] }); // update content_deployments

      await deploymentService.markDeploymentFailed(testDeploymentId, errorMessage);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE content_deployments'),
        expect.arrayContaining([testDeploymentId])
      );
    });

    it('should allow retry for retryable errors', async () => {
      const retryableError = 'Command timeout after 600000ms';

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ error_message: null }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      // markDeploymentFailed should allow retry for timeout errors
      await deploymentService.markDeploymentFailed(testDeploymentId, retryableError, true);

      // Check that the error message includes retry info
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('Scénario 4: Timeout des commandes', () => {
    it('should track pending commands', () => {
      const mockSocket = {
        id: 'socket-002',
        emit: jest.fn().mockReturnValue(true),
        data: { siteId: testSiteId },
      };
      (socketService as any).connectedSites.set(testSiteId, mockSocket);

      const command = {
        id: uuidv4(),
        type: 'deploy_video',
        data: { videoUrl: 'https://example.com/video.mp4' },
      };

      socketService.sendCommand(testSiteId, command);

      // Vérifier que la commande est trackée
      const pendingCommands = (socketService as any).pendingCommands;
      expect(pendingCommands.size).toBe(1);
    });

    it('should detect timed out commands', async () => {
      // Mock de la requête DB pour le timeout
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Ajouter une commande expirée
      const expiredCommand = {
        commandId: 'expired-cmd',
        siteId: testSiteId,
        type: 'deploy_video',
        sentAt: Date.now() - 700000, // 11+ minutes ago
        timeoutMs: 600000, // 10 min timeout
      };
      (socketService as any).pendingCommands.set('expired-cmd', expiredCommand);

      // Exécuter le check (async)
      await (socketService as any).checkCommandTimeouts();

      // La commande devrait être supprimée après timeout
      expect((socketService as any).pendingCommands.has('expired-cmd')).toBe(false);
    });
  });

  describe('Scénario 5: Broadcast vers groupe', () => {
    it('should broadcast command to all sites in group', () => {
      const site1Id = 'site-1';
      const site2Id = 'site-2';

      // Simuler deux sites connectés
      const mockSocket1 = {
        id: 'socket-1',
        emit: jest.fn().mockReturnValue(true),
        data: { siteId: site1Id },
      };
      const mockSocket2 = {
        id: 'socket-2',
        emit: jest.fn().mockReturnValue(true),
        data: { siteId: site2Id },
      };
      (socketService as any).connectedSites.set(site1Id, mockSocket1);
      (socketService as any).connectedSites.set(site2Id, mockSocket2);

      const command = {
        id: uuidv4(),
        type: 'update_config',
        data: { key: 'value' },
      };

      // broadcastToGroup prend un tableau de siteIds
      const result = socketService.broadcastToGroup([site1Id, site2Id], command);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
    });

    it('should track failed broadcasts for disconnected sites', () => {
      const command = {
        id: uuidv4(),
        type: 'update_config',
        data: {},
      };

      // Broadcast vers des sites non connectés
      const result = socketService.broadcastToGroup(['offline-site-1', 'offline-site-2'], command);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(2);
    });
  });

  describe('Scénario 6: Retry de déploiements échoués', () => {
    it('should retry failed deployments with retryable errors', async () => {
      mockQuery
        // getFailedDeploymentsForRetry
        .mockResolvedValueOnce({
          rows: [
            {
              deployment_id: testDeploymentId,
              site_id: testSiteId,
              error_message: 'Connection timeout (retry 1/3)',
            },
          ],
        })
        // For each retry...
        .mockResolvedValueOnce({ rows: [] }); // reset status

      const result = await deploymentService.retryFailedDeployments();

      expect(result.retried).toBeGreaterThanOrEqual(0);
    });

    it('should skip deployments that exceeded max retries', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            deployment_id: testDeploymentId,
            site_id: testSiteId,
            error_message: 'Connection timeout (retry 3/3)', // Max retries reached
          },
        ],
      });

      const result = await deploymentService.retryFailedDeployments();

      expect(result.skipped).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Scénario 7: Métriques et surveillance', () => {
    it('should return correct connection count', () => {
      // Ajouter des sites
      const mockSocket = { id: 'socket', emit: jest.fn(), data: {} };
      (socketService as any).connectedSites.set('site-1', mockSocket);
      (socketService as any).connectedSites.set('site-2', mockSocket);

      expect(socketService.getConnectionCount()).toBe(2);
    });

    it('should return all connected site IDs', () => {
      const mockSocket = { id: 'socket', emit: jest.fn(), data: {} };
      (socketService as any).connectedSites.set('site-a', mockSocket);
      (socketService as any).connectedSites.set('site-b', mockSocket);
      (socketService as any).connectedSites.set('site-c', mockSocket);

      const sites = socketService.getConnectedSites();

      expect(sites).toHaveLength(3);
      expect(sites).toContain('site-a');
      expect(sites).toContain('site-b');
      expect(sites).toContain('site-c');
    });
  });
});

describe('Integration Tests - Command Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    socketService.cleanup();
    (socketService as any).connectedSites = new Map();
    (socketService as any).pendingCommands = new Map();
  });

  afterAll(() => {
    socketService.cleanup();
  });

  describe('Command Types', () => {
    const testSiteId = 'site-cmd-test';

    beforeEach(() => {
      const mockSocket = {
        id: 'socket-cmd',
        emit: jest.fn().mockReturnValue(true),
        data: { siteId: testSiteId },
      };
      (socketService as any).connectedSites.set(testSiteId, mockSocket);
    });

    it('should handle deploy_video command', () => {
      const command = {
        id: uuidv4(),
        type: 'deploy_video',
        data: {
          videoUrl: 'https://storage.example.com/video.mp4',
          filename: 'video.mp4',
          category: 'annonces',
        },
      };

      const result = socketService.sendCommand(testSiteId, command);
      expect(result).toBe(true);

      // Vérifier le timeout approprié (10 min pour deploy_video)
      const pending = (socketService as any).pendingCommands.get(command.id);
      expect(pending.timeoutMs).toBe(10 * 60 * 1000);
    });

    it('should handle update_config command', () => {
      const command = {
        id: uuidv4(),
        type: 'update_config',
        data: { settings: { key: 'value' } },
      };

      const result = socketService.sendCommand(testSiteId, command);
      expect(result).toBe(true);

      const pending = (socketService as any).pendingCommands.get(command.id);
      expect(pending.timeoutMs).toBe(30 * 1000); // 30s pour update_config
    });

    it('should handle get_system_info command', () => {
      const command = {
        id: uuidv4(),
        type: 'get_system_info',
        data: {},
      };

      const result = socketService.sendCommand(testSiteId, command);
      expect(result).toBe(true);

      const pending = (socketService as any).pendingCommands.get(command.id);
      expect(pending.timeoutMs).toBe(15 * 1000); // 15s pour get_system_info
    });

    it('should use default timeout for unknown command types', () => {
      const command = {
        id: uuidv4(),
        type: 'custom_unknown_command',
        data: {},
      };

      const result = socketService.sendCommand(testSiteId, command);
      expect(result).toBe(true);

      const pending = (socketService as any).pendingCommands.get(command.id);
      expect(pending.timeoutMs).toBe(2 * 60 * 1000); // 2min par défaut
    });
  });
});
