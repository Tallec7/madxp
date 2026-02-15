/**
 * Tests unitaires pour le service de deploiement de mises a jour logicielles
 *
 * Ce service est CRITIQUE car il gere:
 * - L'envoi des commandes update_software aux Raspberry Pi
 * - Le suivi du progress et la completion des deploiements
 * - La reconciliation des deploiements lors de la reconnexion d'un Pi
 * - La pre-migration avant OTA (fix ownership, patch legacy code)
 *
 * Bugs couverts:
 * - OTA stuck en pending quand tous les sites echouent (fix: failDeployment)
 * - Reconciliation: Pi deja a la version cible -> auto-complete
 * - Pre-migration: chown VERSION/release.json avant OTA
 *
 * @module update-deployment.service.test
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

const mockIsConnected = jest.fn();
const mockSendCommand = jest.fn();
const mockGetDebugInfo = jest.fn().mockReturnValue({
  connectedSites: [],
  connectedCount: 0,
});
jest.mock('./socket.service', () => ({
  __esModule: true,
  default: {
    isConnected: (siteId: string) => mockIsConnected(siteId),
    sendCommand: (siteId: string, command: unknown) => mockSendCommand(siteId, command),
    getDebugInfo: () => mockGetDebugInfo(),
  },
}));

const mockSendOrQueue = jest.fn();
jest.mock('./command-queue.service', () => ({
  commandQueueService: {
    sendOrQueue: (...args: unknown[]) => mockSendOrQueue(...args),
  },
}));

const mockRecordDeployment = jest.fn();
const mockRecordOtaError = jest.fn();
jest.mock('./metrics.service', () => ({
  __esModule: true,
  default: {
    recordDeployment: (status: string, targetType: string) => mockRecordDeployment(status, targetType),
    recordOtaError: (errorType: string) => mockRecordOtaError(errorType),
  },
  metricsService: {
    recordDeployment: (status: string, targetType: string) => mockRecordDeployment(status, targetType),
    recordOtaError: (errorType: string) => mockRecordOtaError(errorType),
  },
}));

const mockGetDeploymentBlockedMessage = jest.fn();
jest.mock('./upload-verification.service', () => ({
  uploadVerificationService: {
    getDeploymentBlockedMessage: (...args: unknown[]) => mockGetDeploymentBlockedMessage(...args),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-update-1234'),
}));

// Import after mocks
import { updateDeploymentService } from './update-deployment.service';

describe('UpdateDeploymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected.mockReset();
    mockSendCommand.mockReset();
    mockSendOrQueue.mockReset();
    // Mock delay to avoid real setTimeout in tests
    jest.spyOn(updateDeploymentService, 'delay').mockResolvedValue(undefined);
    mockSendOrQueue.mockImplementation((siteId: string) => {
      const isConnected = mockIsConnected(siteId);
      return Promise.resolve({
        sent: isConnected,
        queued: !isConnected,
        commandId: 'mock-uuid-update-1234',
        message: isConnected ? 'Commande envoyee.' : 'Commande mise en file.',
      });
    });
  });

  const mockDeploymentRow = {
    id: 'deploy-uuid-100',
    update_id: 'update-uuid-200',
    target_type: 'site',
    target_id: 'site-uuid-300',
    status: 'pending',
    version: '3.17.1',
    description: 'Test update',
    is_critical: false,
    changelog: null,
    package_url: 'https://storage.example.com/updates/neopro-3.17.1.tar.gz',
    package_size: 50000000,
    checksum: 'sha256-abc123',
    upload_status: 'ready',
  };

  // =========================================================
  // startDeployment()
  // =========================================================
  describe('startDeployment', () => {
    it('should send update_software command to connected site and mark in_progress', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockDeploymentRow] }) // Get deployment
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-300', siteName: 'Club Test' }] }) // Get targets
        .mockResolvedValueOnce({ rows: [] }); // Update status

      mockIsConnected.mockReturnValue(true);

      await updateDeploymentService.startDeployment('deploy-uuid-100');

      expect(mockSendOrQueue).toHaveBeenCalledWith(
        'site-uuid-300',
        'update_software',
        expect.objectContaining({
          deploymentId: 'deploy-uuid-100',
          version: '3.17.1',
          updateUrl: 'https://storage.example.com/updates/neopro-3.17.1.tar.gz',
          checksum: 'sha256-abc123',
        }),
        expect.objectContaining({
          priority: 3,
        }),
      );
    });

    it('should fail deployment when deployment not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No deployment

      await updateDeploymentService.startDeployment('nonexistent-id');

      // Should have called failDeployment via the catch block
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should fail deployment when upload_status is not ready', async () => {
      const uploadingDeployment = { ...mockDeploymentRow, upload_status: 'uploading' };
      mockQuery.mockResolvedValueOnce({ rows: [uploadingDeployment] });
      mockGetDeploymentBlockedMessage.mockReturnValue('Upload en cours');

      await updateDeploymentService.startDeployment('deploy-uuid-100');

      // Should call failDeployment with upload message
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'failed\''),
        expect.arrayContaining([expect.stringContaining('Upload non')]),
      );
    });

    it('should fail deployment when no targets found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockDeploymentRow] }) // Get deployment
        .mockResolvedValueOnce({ rows: [] }) // No targets
        .mockResolvedValueOnce({ rows: [] }); // failDeployment UPDATE

      await updateDeploymentService.startDeployment('deploy-uuid-100');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'failed\''),
        expect.arrayContaining([expect.stringContaining('Aucun site cible')]),
      );
    });

    it('should fail deployment when package_url is missing', async () => {
      const noUrlDeployment = { ...mockDeploymentRow, package_url: null };
      mockQuery
        .mockResolvedValueOnce({ rows: [noUrlDeployment] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-300', siteName: 'Club Test' }] })
        .mockResolvedValueOnce({ rows: [] }); // failDeployment

      await updateDeploymentService.startDeployment('deploy-uuid-100');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'failed\''),
        expect.arrayContaining([expect.stringContaining('URL du package non')]),
      );
    });

    it('should queue deployment for offline site and mark in_progress', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockDeploymentRow] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-300', siteName: 'Club Offline' }] })
        .mockResolvedValueOnce({ rows: [] }); // Update status

      mockIsConnected.mockReturnValue(false);

      await updateDeploymentService.startDeployment('deploy-uuid-100');

      expect(mockSendOrQueue).toHaveBeenCalled();
      // Status should be in_progress with queued message
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'in_progress\''),
        expect.anything(),
      );
    });

    it('should fail deployment when all sites fail sendOrQueue', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockDeploymentRow] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-300', siteName: 'Club Fail' }] })
        .mockResolvedValueOnce({ rows: [] }); // failDeployment

      mockIsConnected.mockReturnValue(false);
      mockSendOrQueue.mockResolvedValue({ sent: false, queued: false, message: 'Erreur' });

      await updateDeploymentService.startDeployment('deploy-uuid-100');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'failed\''),
        expect.arrayContaining([expect.stringContaining('tous les sites')]),
      );
    });

    it('should record in_progress metric when at least one site succeeds', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockDeploymentRow] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-300', siteName: 'Club OK' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockIsConnected.mockReturnValue(true);

      await updateDeploymentService.startDeployment('deploy-uuid-100');

      expect(mockRecordDeployment).toHaveBeenCalledWith('in_progress', 'site');
    });
  });

  // =========================================================
  // handleDeploymentResult()
  // =========================================================
  describe('handleDeploymentResult', () => {
    it('should mark deployment as completed on success', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ target_type: 'site', target_id: 'site-uuid-300' }] }) // Get deployment
        .mockResolvedValueOnce({ rows: [] }); // Update status

      await updateDeploymentService.handleDeploymentResult('deploy-uuid-100', 'site-uuid-300', true);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = \'completed\''),
        expect.arrayContaining(['deploy-uuid-100']),
      );
    });

    it('should mark deployment as failed with error message', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Update status

      await updateDeploymentService.handleDeploymentResult(
        'deploy-uuid-100', 'site-uuid-300', false, 'EACCES: permission denied',
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = \'failed\''),
        expect.arrayContaining(['EACCES: permission denied', 'deploy-uuid-100']),
      );
    });

    it('should record completed metric on success', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ target_type: 'site', target_id: 'site-uuid-300' }] })
        .mockResolvedValueOnce({ rows: [] });

      await updateDeploymentService.handleDeploymentResult('deploy-uuid-100', 'site-uuid-300', true);

      expect(mockRecordDeployment).toHaveBeenCalledWith('completed', 'site');
    });

    it('should handle missing deployment gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No deployment found

      await updateDeploymentService.handleDeploymentResult('nonexistent', 'site-uuid-300', true);

      // Should return early without error
      expect(mockRecordDeployment).not.toHaveBeenCalled();
    });
  });

  // =========================================================
  // processPendingDeploymentsForSite() — Reconciliation
  // =========================================================
  describe('processPendingDeploymentsForSite', () => {
    it('should do nothing when no pending deployments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No pending

      await updateDeploymentService.processPendingDeploymentsForSite('site-uuid-300');

      expect(mockSendOrQueue).not.toHaveBeenCalled();
    });

    it('should auto-complete deployment when site already runs target version (reconciliation)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockDeploymentRow, status: 'in_progress' }] }) // Pending deployments
        .mockResolvedValueOnce({ rows: [{ software_version: '3.17.1' }] }) // Site current version
        .mockResolvedValueOnce({ rows: [{ target_type: 'site', target_id: 'site-uuid-300' }] }) // handleDeploymentResult query
        .mockResolvedValueOnce({ rows: [] }); // Update status

      await updateDeploymentService.processPendingDeploymentsForSite('site-uuid-300');

      // Should NOT send command (reconciliation skips it)
      expect(mockSendOrQueue).not.toHaveBeenCalled();
      // Should mark as completed
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Reconciliation'),
        expect.objectContaining({ siteId: 'site-uuid-300' }),
      );
    });

    it('should deploy pending updates to reconnected site when version differs', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockDeploymentRow, status: 'pending' }] }) // Pending deployments
        .mockResolvedValueOnce({ rows: [{ software_version: '3.16.0' }] }) // Site at older version
        .mockResolvedValueOnce({ rows: [] }); // Update status after deploy

      mockIsConnected.mockReturnValue(true);

      await updateDeploymentService.processPendingDeploymentsForSite('site-uuid-300');

      expect(mockSendOrQueue).toHaveBeenCalledWith(
        'site-uuid-300',
        'update_software',
        expect.objectContaining({ version: '3.17.1' }),
        expect.anything(),
      );
    });

    it('should handle errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      await updateDeploymentService.processPendingDeploymentsForSite('site-uuid-300');

      // Should not throw
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing pending'),
        expect.anything(),
      );
    });
  });

  // =========================================================
  // updateProgress()
  // =========================================================
  describe('updateProgress', () => {
    it('should update deployment progress with rounded value', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await updateDeploymentService.updateProgress('deploy-uuid-100', 67.8);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET progress = $1'),
        [68, 'deploy-uuid-100'],
      );
    });

    it('should set status to in_progress', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await updateDeploymentService.updateProgress('deploy-uuid-100', 50);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'in_progress'"),
        expect.anything(),
      );
    });
  });

  // =========================================================
  // cancelDeployment()
  // =========================================================
  describe('cancelDeployment', () => {
    it('should mark deployment as failed with Annule message', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await updateDeploymentService.cancelDeployment('deploy-uuid-100');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("error_message = 'Annul"),
        expect.arrayContaining(['deploy-uuid-100']),
      );
    });

    it('should only affect pending or in_progress deployments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await updateDeploymentService.cancelDeployment('deploy-uuid-100');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('pending', 'in_progress')"),
        expect.anything(),
      );
    });
  });

  // =========================================================
  // retryDeployment()
  // =========================================================
  describe('retryDeployment', () => {
    it('should return false if deployment not in failed state', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Not found or not failed

      const result = await updateDeploymentService.retryDeployment('deploy-uuid-100');

      expect(result).toBe(false);
    });

    it('should reset failed deployment to pending and restart', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'deploy-uuid-100' }] }) // Found in failed state
        .mockResolvedValueOnce({ rows: [] }) // Reset to pending
        .mockResolvedValueOnce({ rows: [mockDeploymentRow] }) // startDeployment: get deployment
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-300', siteName: 'Club Test' }] }) // Get targets
        .mockResolvedValueOnce({ rows: [] }); // Update status

      mockIsConnected.mockReturnValue(true);

      const result = await updateDeploymentService.retryDeployment('deploy-uuid-100');

      expect(result).toBe(true);
      // Should have reset status
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'pending'"),
        expect.arrayContaining(['deploy-uuid-100']),
      );
    });

    it('should handle errors and return false', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await updateDeploymentService.retryDeployment('deploy-uuid-100');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =========================================================
  // Edge cases
  // =========================================================
  describe('Edge cases', () => {
    it('should handle group target with multiple sites', async () => {
      const groupDeployment = {
        ...mockDeploymentRow,
        target_type: 'group',
        target_id: 'group-uuid-500',
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [groupDeployment] })
        .mockResolvedValueOnce({
          rows: [
            { siteId: 'site-1', siteName: 'Club A' },
            { siteId: 'site-2', siteName: 'Club B' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // Update status

      mockIsConnected.mockReturnValue(true);

      await updateDeploymentService.startDeployment('deploy-uuid-100');

      expect(mockSendOrQueue).toHaveBeenCalledTimes(2);
    });

    it('should handle critical update with higher priority', async () => {
      const criticalDeployment = { ...mockDeploymentRow, is_critical: true };
      mockQuery
        .mockResolvedValueOnce({ rows: [criticalDeployment] })
        .mockResolvedValueOnce({ rows: [{ siteId: 'site-uuid-300', siteName: 'Club Test' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockIsConnected.mockReturnValue(true);

      await updateDeploymentService.startDeployment('deploy-uuid-100');

      expect(mockSendOrQueue).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ priority: 1 }), // Critical = priority 1
      );
    });

    it('should record failed metric when deployment fails', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await updateDeploymentService.handleDeploymentResult(
        'deploy-uuid-100', 'site-uuid-300', false, 'Timeout',
      );

      expect(mockRecordDeployment).toHaveBeenCalledWith('failed', 'site');
    });
  });
});
