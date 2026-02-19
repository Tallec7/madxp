/**
 * Tests unitaires pour le service de déploiement
 *
 * Ce service est CRITIQUE car il gère:
 * - Le déploiement de vidéos vers les boîtiers
 * - La gestion des déploiements en attente
 * - Le suivi du progress des déploiements
 * - Le nettoyage des vidéos après déploiement complet
 *
 * @module deployment.service.test
 */

// Mock dependencies before importing the service
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

// Create mock functions for socket service
const mockIsConnected = jest.fn();
const mockSendCommand = jest.fn();

// Use a factory function that returns a new object each time
jest.mock('./socket.service', () => {
  return {
    __esModule: true,
    default: {
      isConnected: (siteId: string) => mockIsConnected(siteId),
      sendCommand: (siteId: string, command: unknown) => mockSendCommand(siteId, command),
    },
  };
});

// Mock commandQueueService.sendOrQueue
const mockSendOrQueue = jest.fn();
jest.mock('./command-queue.service', () => ({
  commandQueueService: {
    sendOrQueue: (...args: unknown[]) => mockSendOrQueue(...args),
  },
}));

const mockDeleteVideo = jest.fn();
const mockGetVideoUrl = jest.fn();
jest.mock('./storage.service', () => ({
  deleteVideo: (...args: unknown[]) => mockDeleteVideo(...args),
  getVideoUrl: (...args: unknown[]) => mockGetVideoUrl(...args),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

// Mock upload-verification.service (imported by deployment.service)
const mockGetDeploymentBlockedMessage = jest.fn();
jest.mock('./upload-verification.service', () => ({
  uploadVerificationService: {
    getDeploymentBlockedMessage: (...args: unknown[]) => mockGetDeploymentBlockedMessage(...args),
  },
}));

// Mock email.service (imported transitively via alerting.service)
jest.mock('./email.service', () => ({
  __esModule: true,
  default: {
    sendEmail: jest.fn(),
  },
}));

// Import after mocks
import deploymentService from './deployment.service';

describe('DeploymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetVideoUrl.mockReturnValue('https://storage.example.com/videos/test.mp4');
    mockIsConnected.mockReset();
    mockSendCommand.mockReset();
    mockSendOrQueue.mockReset();
    // Default sendOrQueue behavior: return sent=true if isConnected, queued=true otherwise
    mockSendOrQueue.mockImplementation((siteId: string) => {
      const isConnected = mockIsConnected(siteId);
      return Promise.resolve({
        sent: isConnected,
        queued: !isConnected,
        commandId: 'mock-uuid-1234',
        message: isConnected ? 'Commande envoyée au site.' : 'Commande mise en file d\'attente.',
      });
    });
  });

  describe('startDeployment', () => {
    const mockDeploymentRow = {
      id: 'deploy-uuid-123',
      video_id: 'video-uuid-456',
      target_type: 'site',
      target_id: 'site-uuid-789',
      filename: 'test-video.mp4',
      original_name: 'Test Video.mp4',
      category: 'annonces',
      subcategory: null,
      duration: 120,
      storage_path: 'videos/test-video.mp4',
      checksum: 'abc123def456789checksum',
      metadata: { title: 'Custom Title' },
      upload_status: 'ready',
      advertiser_id: null,
      analytics_category: null,
    };

    it('should start deployment to connected site', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockDeploymentRow] }) // Get deployment
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-789', siteName: 'Test Site' }] }) // Get targets
        .mockResolvedValueOnce({ rows: [] }); // Update status

      mockIsConnected.mockReturnValue(true);

      await deploymentService.startDeployment('deploy-uuid-123');

      // Now uses sendOrQueue instead of sendCommand directly
      expect(mockSendOrQueue).toHaveBeenCalledWith(
        'site-uuid-789',
        'deploy_video',
        expect.objectContaining({
          deploymentId: 'deploy-uuid-123',
          videoId: 'video-uuid-456',
          videoUrl: 'https://storage.example.com/videos/test.mp4',
        }),
        expect.objectContaining({
          priority: 3,
          expiresIn: 7 * 24 * 60 * 60 * 1000,
        })
      );

      // Should update status to in_progress
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'in_progress'"),
        expect.arrayContaining(['deploy-uuid-123'])
      );
    });

    it('should fail deployment if no targets found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockDeploymentRow] })
        .mockResolvedValueOnce({ rows: [] }) // No targets
        .mockResolvedValueOnce({ rows: [] }); // Fail deployment

      await deploymentService.startDeployment('deploy-uuid-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        expect.arrayContaining(['Aucun site cible trouvé', 'deploy-uuid-123'])
      );
    });

    it('should fail deployment if deployment not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Deployment not found
        .mockResolvedValueOnce({ rows: [] }); // Fail deployment

      await deploymentService.startDeployment('nonexistent-deploy');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        expect.any(Array)
      );
    });

    it('should queue deployment and set in_progress if no sites connected', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockDeploymentRow] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-789', siteName: 'Test Site' }] })
        .mockResolvedValueOnce({ rows: [] }); // Update to in_progress

      mockIsConnected.mockReturnValue(false);

      await deploymentService.startDeployment('deploy-uuid-123');

      // With sendOrQueue, offline sites are queued and deployment is set to in_progress
      // with a message indicating it's waiting for reconnection
      expect(mockSendOrQueue).toHaveBeenCalledWith(
        'site-uuid-789',
        'deploy_video',
        expect.any(Object),
        expect.objectContaining({
          priority: 3,
          expiresIn: 7 * 24 * 60 * 60 * 1000,
        })
      );

      // Should update to in_progress with "En attente de reconnexion" message
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'in_progress'"),
        expect.arrayContaining([expect.stringContaining('En attente de reconnexion')])
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deployment initiated',
        expect.objectContaining({
          successCount: 1,
          commandQueuedSites: ['Test Site'],
        })
      );
    });

    it('should deploy to group targets', async () => {
      const groupDeployment = {
        ...mockDeploymentRow,
        target_type: 'group',
        target_id: 'group-uuid-123',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [groupDeployment] })
        .mockResolvedValueOnce({
          rows: [
            { siteId: 'site-1', siteName: 'Site 1' },
            { siteId: 'site-2', siteName: 'Site 2' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      mockIsConnected.mockReturnValue(true);

      await deploymentService.startDeployment('deploy-uuid-123');

      // sendOrQueue is called for each site in the group
      expect(mockSendOrQueue).toHaveBeenCalledTimes(2);
    });

    it('should use metadata title when available', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockDeploymentRow] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-789', siteName: 'Test Site' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockIsConnected.mockReturnValue(true);

      await deploymentService.startDeployment('deploy-uuid-123');

      // sendOrQueue is called with originalName from metadata.title
      expect(mockSendOrQueue).toHaveBeenCalledWith(
        'site-uuid-789',
        'deploy_video',
        expect.objectContaining({
          originalName: 'Custom Title', // From metadata.title
        }),
        expect.any(Object)
      );
    });
  });

  describe('processPendingDeploymentsForSite', () => {
    const mockPendingDeployment = {
      id: 'deploy-pending-123',
      video_id: 'video-uuid-456',
      filename: 'pending-video.mp4',
      original_name: 'Pending Video.mp4',
      category: 'info',
      subcategory: null,
      duration: 60,
      storage_path: 'videos/pending-video.mp4',
      checksum: 'pending123checksum',
      metadata: null,
      advertiser_id: null,
      analytics_category: null,
    };

    it('should process pending deployments for newly connected site', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockPendingDeployment] }) // Get pending
        .mockResolvedValueOnce({ rows: [] }); // Update status

      mockIsConnected.mockReturnValue(true);

      await deploymentService.processPendingDeploymentsForSite('site-uuid-789');

      // Now uses sendOrQueue instead of sendCommand
      expect(mockSendOrQueue).toHaveBeenCalledWith(
        'site-uuid-789',
        'deploy_video',
        expect.objectContaining({
          deploymentId: 'deploy-pending-123',
        }),
        expect.any(Object)
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing pending deployments for site',
        expect.objectContaining({
          siteId: 'site-uuid-789',
          count: 1,
        })
      );
    });

    it('should do nothing if no pending deployments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await deploymentService.processPendingDeploymentsForSite('site-uuid-789');

      expect(mockSendCommand).not.toHaveBeenCalled();
    });

    it('should update status to in_progress after sending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockPendingDeployment] })
        .mockResolvedValueOnce({ rows: [] });

      mockIsConnected.mockReturnValue(true);
      mockSendCommand.mockReturnValue(true);

      await deploymentService.processPendingDeploymentsForSite('site-uuid-789');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'in_progress'"),
        expect.arrayContaining(['deploy-pending-123'])
      );
    });

    it('should handle errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      // Should not throw
      await expect(
        deploymentService.processPendingDeploymentsForSite('site-uuid-789')
      ).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing pending deployments for site:',
        expect.any(Object)
      );
    });
  });

  describe('updateProgress', () => {
    it('should update deployment progress', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ target_type: 'site', target_id: 'site-123' }] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-123', siteName: 'Test' }] })
        .mockResolvedValueOnce({ rows: [] });

      await deploymentService.updateProgress('deploy-uuid-123', 'site-123', 50, false);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE content_deployments'),
        expect.arrayContaining([50, 'deploy-uuid-123'])
      );
    });

    it('should mark as completed when progress is 100', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ target_type: 'site', target_id: 'site-123' }] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-123', siteName: 'Test' }] })
        .mockResolvedValueOnce({ rows: [] }) // Update progress
        .mockResolvedValueOnce({ rows: [{ video_id: 'video-123' }] }) // Get video_id
        .mockResolvedValueOnce({ rows: [] }) // Mark completed
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Check pending
        .mockResolvedValueOnce({ rows: [{ storage_path: 'videos/test.mp4' }] }); // Get storage path

      mockDeleteVideo.mockResolvedValue(true);

      await deploymentService.updateProgress('deploy-uuid-123', 'site-123', 100, true);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'completed'"),
        expect.arrayContaining(['deploy-uuid-123'])
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deployment completed',
        expect.objectContaining({ deploymentId: 'deploy-uuid-123' })
      );
    });

    it('should cleanup video when all deployments complete', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ target_type: 'site', target_id: 'site-123' }] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-123', siteName: 'Test' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ video_id: 'video-123' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // No pending
        .mockResolvedValueOnce({ rows: [{ storage_path: 'videos/cleanup-me.mp4' }] });

      mockDeleteVideo.mockResolvedValue(true);

      await deploymentService.updateProgress('deploy-uuid-123', 'site-123', 100, true);

      expect(mockDeleteVideo).toHaveBeenCalledWith('videos/cleanup-me.mp4');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Video file cleaned up from storage after all deployments completed',
        expect.any(Object)
      );
    });

    it('should not cleanup video if deployments still pending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ target_type: 'site', target_id: 'site-123' }] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-123', siteName: 'Test' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ video_id: 'video-123' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }); // 2 pending

      await deploymentService.updateProgress('deploy-uuid-123', 'site-123', 100, true);

      expect(mockDeleteVideo).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Video still has pending deployments, not cleaning up',
        expect.any(Object)
      );
    });

    it('should handle missing deployment gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No deployment found

      await deploymentService.updateProgress('nonexistent', 'site-123', 50, false);

      // Should return early without error
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('cancelDeployment', () => {
    it('should cancel pending deployment', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await deploymentService.cancelDeployment('deploy-uuid-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'cancelled'"),
        expect.arrayContaining(['deploy-uuid-123'])
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deployment cancelled',
        expect.objectContaining({ deploymentId: 'deploy-uuid-123' })
      );
    });

    it('should only cancel pending or in_progress deployments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await deploymentService.cancelDeployment('deploy-uuid-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('pending', 'in_progress')"),
        expect.any(Array)
      );
    });
  });

  describe('getTargetSites (private)', () => {
    it('should get single site target', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-123', siteName: 'Test Site' }] });

      const targets = await (deploymentService as any).getTargetSites('site', 'site-123');

      expect(targets).toHaveLength(1);
      expect(targets[0].siteId).toBe('site-123');
    });

    it('should get group targets', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { siteId: 'site-1', siteName: 'Site 1' },
          { siteId: 'site-2', siteName: 'Site 2' },
          { siteId: 'site-3', siteName: 'Site 3' },
        ],
      });

      const targets = await (deploymentService as any).getTargetSites('group', 'group-123');

      expect(targets).toHaveLength(3);
    });

    it('should return empty array for unknown target type', async () => {
      const targets = await (deploymentService as any).getTargetSites('unknown', 'some-id');

      expect(targets).toHaveLength(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle database errors in startDeployment', async () => {
      mockQuery
        .mockRejectedValueOnce(new Error('Database connection failed'))
        .mockResolvedValueOnce({ rows: [] });

      await deploymentService.startDeployment('deploy-uuid-123');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error starting deployment:',
        expect.any(Error)
      );

      // Should mark as failed
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        expect.arrayContaining(['Database connection failed'])
      );
    });

    it('should handle sendOrQueue failures', async () => {
      const mockDeployment = {
        id: 'deploy-uuid-123',
        video_id: 'video-uuid-456',
        target_type: 'site',
        target_id: 'site-uuid-789',
        filename: 'test.mp4',
        original_name: 'Test.mp4',
        category: null,
        subcategory: null,
        duration: null,
        storage_path: 'videos/test.mp4',
        checksum: 'socket-fail-checksum',
        metadata: null,
        upload_status: 'ready',
        advertiser_id: null,
        analytics_category: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockDeployment] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-789', siteName: 'Test' }] })
        .mockResolvedValueOnce({ rows: [] }); // Update error_message for failed sites

      mockIsConnected.mockReturnValue(true);
      // sendOrQueue fails completely (neither sent nor queued)
      mockSendOrQueue.mockResolvedValueOnce({
        sent: false,
        queued: false,
        commandId: null,
        message: 'Erreur lors de l\'envoi',
      });

      await deploymentService.startDeployment('deploy-uuid-123');

      // Should NOT update to in_progress since send and queue both failed
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining("status = 'in_progress'"),
        expect.any(Array)
      );

      // Should log error about failed sites
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Video deployment failed for all sites',
        expect.objectContaining({
          deploymentId: 'deploy-uuid-123',
          commandFailedSites: ['Test'],
        })
      );
    });
  });

  describe('Integration scenarios', () => {
    it('Scenario: Deploy to group with mixed connected/disconnected sites', async () => {
      const groupDeployment = {
        id: 'deploy-group-123',
        video_id: 'video-uuid-456',
        target_type: 'group',
        target_id: 'group-uuid-123',
        filename: 'group-video.mp4',
        original_name: 'Group Video.mp4',
        category: 'promo',
        subcategory: null,
        duration: 90,
        storage_path: 'videos/group-video.mp4',
        checksum: 'group-deploy-checksum',
        metadata: null,
        upload_status: 'ready',
        advertiser_id: null,
        analytics_category: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [groupDeployment] })
        .mockResolvedValueOnce({
          rows: [
            { siteId: 'site-1', siteName: 'Site 1' },
            { siteId: 'site-2', siteName: 'Site 2' },
            { siteId: 'site-3', siteName: 'Site 3' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // Update to in_progress

      // Site-1 and site-3 are connected, site-2 is offline
      // Use implementation based on siteId for consistent behavior
      mockIsConnected.mockImplementation((siteId: string) => {
        return siteId === 'site-1' || siteId === 'site-3';
      });

      await deploymentService.startDeployment('deploy-group-123');

      // sendOrQueue is called for all 3 sites
      expect(mockSendOrQueue).toHaveBeenCalledTimes(3);

      // New log format with commandSentSites and commandQueuedSites
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deployment initiated',
        expect.objectContaining({
          totalSites: 3,
          successCount: 3,
          commandSentSites: ['Site 1', 'Site 3'],
          commandQueuedSites: ['Site 2'],
        })
      );
    });

    it('Scenario: Site connects and receives pending deployments', async () => {
      const pendingDeployments = [
        {
          id: 'deploy-1',
          video_id: 'video-1',
          filename: 'video1.mp4',
          original_name: 'Video 1.mp4',
          category: 'cat1',
          subcategory: null,
          duration: 60,
          storage_path: 'videos/video1.mp4',
          checksum: 'checksum-video-1',
          metadata: null,
          advertiser_id: null,
          analytics_category: null,
        },
        {
          id: 'deploy-2',
          video_id: 'video-2',
          filename: 'video2.mp4',
          original_name: 'Video 2.mp4',
          category: 'cat2',
          subcategory: 'subcat',
          duration: 120,
          storage_path: 'videos/video2.mp4',
          checksum: 'checksum-video-2',
          metadata: { title: 'Custom Title 2' },
          advertiser_id: null,
          analytics_category: null,
        },
      ];

      // Need to mock query for:
      // 1. Get pending deployments
      // 2. Update status for first deployment
      // 3. Update status for second deployment
      mockQuery
        .mockResolvedValueOnce({ rows: pendingDeployments })
        .mockResolvedValueOnce({ rows: [] })  // update for deploy-1
        .mockResolvedValueOnce({ rows: [] }); // update for deploy-2

      mockIsConnected.mockReturnValue(true);

      await deploymentService.processPendingDeploymentsForSite('new-site-123');

      // sendOrQueue is called for each pending deployment
      expect(mockSendOrQueue).toHaveBeenCalledTimes(2);

      // First deployment
      expect(mockSendOrQueue).toHaveBeenCalledWith(
        'new-site-123',
        'deploy_video',
        expect.objectContaining({
          deploymentId: 'deploy-1',
          originalName: 'Video 1.mp4',
        }),
        expect.any(Object)
      );

      // Second deployment with custom title
      expect(mockSendOrQueue).toHaveBeenCalledWith(
        'new-site-123',
        'deploy_video',
        expect.objectContaining({
          deploymentId: 'deploy-2',
          originalName: 'Custom Title 2',
        }),
        expect.any(Object)
      );
    });
  });

  describe('Retry System', () => {
    describe('isRetryableError (private)', () => {
      it('should return true for timeout errors', () => {
        expect((deploymentService as any).isRetryableError('Command timeout after 30s')).toBe(true);
        expect((deploymentService as any).isRetryableError('Connection timeout')).toBe(true);
      });

      it('should return true for network errors', () => {
        expect((deploymentService as any).isRetryableError('Network error: ECONNREFUSED')).toBe(true);
        expect((deploymentService as any).isRetryableError('ETIMEDOUT')).toBe(true);
      });

      it('should return false for non-retryable errors', () => {
        expect((deploymentService as any).isRetryableError('Invalid video format')).toBe(false);
        expect((deploymentService as any).isRetryableError('Permission denied')).toBe(false);
        expect((deploymentService as any).isRetryableError(null)).toBe(false);
      });
    });

    describe('getRetryCount (private)', () => {
      it('should extract retry count from error message', () => {
        expect((deploymentService as any).getRetryCount('[retry 1/3] timeout error')).toBe(1);
        expect((deploymentService as any).getRetryCount('[retry 2/3] network error')).toBe(2);
        expect((deploymentService as any).getRetryCount('[retry 3/3] connection error')).toBe(3);
      });

      it('should return 0 if no retry info', () => {
        expect((deploymentService as any).getRetryCount('Simple error')).toBe(0);
        expect((deploymentService as any).getRetryCount(null)).toBe(0);
      });
    });

    describe('markDeploymentFailed', () => {
      it('should mark as pending for retry on retryable error', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ error_message: null, status: 'in_progress' }] })
          .mockResolvedValueOnce({ rows: [] });

        await deploymentService.markDeploymentFailed('deploy-123', 'Command timeout after 30s');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'pending'"),
          expect.arrayContaining(['[retry 1/3] Command timeout after 30s', 'deploy-123'])
        );
      });

      it('should mark as failed after max retries exhausted', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ error_message: '[retry 3/3] previous error', status: 'pending' }] })
          .mockResolvedValueOnce({ rows: [] });

        await deploymentService.markDeploymentFailed('deploy-123', 'Command timeout');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'failed'"),
          expect.arrayContaining([expect.stringContaining('exhausted'), 'deploy-123'])
        );
      });

      it('should mark as failed immediately for non-retryable errors', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ error_message: null, status: 'in_progress' }] })
          .mockResolvedValueOnce({ rows: [] });

        await deploymentService.markDeploymentFailed('deploy-123', 'Invalid video format');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'failed'"),
          expect.arrayContaining(['Invalid video format', 'deploy-123'])
        );
      });

      it('should not retry if allowRetry is false', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ error_message: null, status: 'in_progress' }] })
          .mockResolvedValueOnce({ rows: [] });

        await deploymentService.markDeploymentFailed('deploy-123', 'Command timeout', false);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'failed'"),
          expect.any(Array)
        );
      });
    });

    describe('retryDeployment', () => {
      it('should reset failed deployment and restart', async () => {
        const mockDeployment = {
          id: 'deploy-failed-123',
          video_id: 'video-123',
          target_type: 'site',
          target_id: 'site-123',
          filename: 'video.mp4',
          original_name: 'Video.mp4',
          category: 'default',
          subcategory: null,
          duration: 60,
          storage_path: 'videos/video.mp4',
          checksum: 'retry-checksum-123',
          metadata: null,
          upload_status: 'ready',
          advertiser_id: null,
          analytics_category: null,
        };

        mockQuery
          .mockResolvedValueOnce({ rows: [mockDeployment] }) // Find failed deployment
          .mockResolvedValueOnce({ rows: [] }) // Reset to pending
          .mockResolvedValueOnce({ rows: [mockDeployment] }) // startDeployment gets deployment
          .mockResolvedValueOnce({ rows: [{ siteId: 'site-123', siteName: 'Test' }] }) // Get targets
          .mockResolvedValueOnce({ rows: [] }); // Update status

        mockIsConnected.mockReturnValue(true);
        mockSendCommand.mockReturnValue(true);

        const result = await deploymentService.retryDeployment('deploy-failed-123');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'pending'"),
          expect.arrayContaining(['deploy-failed-123'])
        );
      });

      it('should return false if deployment not found or not failed', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await deploymentService.retryDeployment('nonexistent');

        expect(result).toBe(false);
      });
    });

    describe('retryFailedDeployments', () => {
      it('should retry pending deployments with retry markers', async () => {
        const pendingRetryDeployment = {
          id: 'deploy-retry-123',
          video_id: 'video-123',
          error_message: '[retry 1/3] Connection timeout',
          target_type: 'site',
          target_id: 'site-123',
          filename: 'video.mp4',
          original_name: 'Video.mp4',
          category: 'default',
          subcategory: null,
          duration: 60,
          storage_path: 'videos/video.mp4',
          checksum: 'retry-pending-checksum',
          metadata: null,
          advertiser_id: null,
          analytics_category: null,
        };

        mockQuery
          .mockResolvedValueOnce({ rows: [pendingRetryDeployment] }) // Get pending with retry
          .mockResolvedValueOnce({ rows: [{ siteId: 'site-123', siteName: 'Test' }] }) // Get targets
          .mockResolvedValueOnce({ rows: [] }); // Update to in_progress

        mockIsConnected.mockReturnValue(true);
        mockSendCommand.mockReturnValue(true);

        const result = await deploymentService.retryFailedDeployments();

        expect(result.retried).toBe(1);
        expect(result.skipped).toBe(0);
      });

      it('should skip deployments at max retry count', async () => {
        const maxRetriedDeployment = {
          id: 'deploy-maxed-123',
          video_id: 'video-123',
          error_message: '[retry 3/3] Connection timeout',
          target_type: 'site',
          target_id: 'site-123',
          filename: 'video.mp4',
          original_name: 'Video.mp4',
          category: 'default',
          subcategory: null,
          duration: 60,
          storage_path: 'videos/video.mp4',
          checksum: 'maxed-retry-checksum',
          metadata: null,
          advertiser_id: null,
          analytics_category: null,
        };

        mockQuery.mockResolvedValueOnce({ rows: [maxRetriedDeployment] });

        const result = await deploymentService.retryFailedDeployments();

        expect(result.retried).toBe(0);
        expect(result.skipped).toBe(1);
      });

      it('should return empty results on no pending retries', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await deploymentService.retryFailedDeployments();

        expect(result.retried).toBe(0);
        expect(result.skipped).toBe(0);
      });
    });
  });
});
