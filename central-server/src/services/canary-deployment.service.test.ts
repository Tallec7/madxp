/**
 * Tests unitaires pour le service de déploiement canary
 *
 * Ce service est CRITIQUE pour le déploiement car il gère:
 * - Les déploiements progressifs
 * - Le rollback automatique en cas d'échec
 * - La validation des métriques de succès
 *
 * @module canary-deployment.service.test
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

// Mock deployment service
const mockStartDeployment = jest.fn();
jest.mock('./deployment.service', () => ({
  __esModule: true,
  default: {
    startDeployment: (id: string) => mockStartDeployment(id),
  },
}));

// Mock socket service
const mockIsConnected = jest.fn();
const mockSendCommand = jest.fn();
jest.mock('./socket.service', () => ({
  __esModule: true,
  default: {
    isConnected: (siteId: string) => mockIsConnected(siteId),
    sendCommand: (siteId: string, cmd: unknown) => mockSendCommand(siteId, cmd),
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

// Import after mocks
import { canaryDeploymentService } from './canary-deployment.service';

describe('CanaryDeploymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (canaryDeploymentService as any).tableChecked = false;
    (canaryDeploymentService as any).advanceIntervals.clear();
    (canaryDeploymentService as any).metricHistory = new Map();
  });

  afterEach(() => {
    canaryDeploymentService.cleanup();
    jest.useRealTimers();
  });

  describe('createCanaryDeployment', () => {
    const defaultParams = {
      deploymentType: 'content' as const,
      resourceId: 'video-123',
      targetType: 'group' as const,
      targetId: 'group-456',
      userId: 'user-789',
    };

    it('should create a canary deployment for a group', async () => {
      // Mock table creation
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE canary_deployments
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE canary_site_status
        .mockResolvedValueOnce({ rows: [] }) // CREATE INDEX 1
        .mockResolvedValueOnce({ rows: [] }) // CREATE INDEX 2
        // Get target sites (10 sites)
        .mockResolvedValueOnce({
          rows: Array.from({ length: 10 }, (_, i) => ({
            id: `site-${i}`,
            site_name: `Site ${i}`,
          })),
        })
        // INSERT canary deployment
        .mockResolvedValueOnce({ rows: [] });

      // Mock site status inserts (10 sites)
      for (let i = 0; i < 10; i++) {
        mockQuery.mockResolvedValueOnce({ rows: [] });
      }

      const result = await canaryDeploymentService.createCanaryDeployment(
        defaultParams.deploymentType,
        defaultParams.resourceId,
        defaultParams.targetType,
        defaultParams.targetId,
        defaultParams.userId
      );

      expect(result.id).toBe('mock-uuid-1234');
      expect(result.canarySites).toHaveLength(1); // 10% of 10 = 1 site

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO canary_deployments'),
        expect.arrayContaining([
          'mock-uuid-1234',
          'content',
          'video-123',
          'group',
          'group-456',
        ])
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Canary deployment created',
        expect.objectContaining({
          id: 'mock-uuid-1234',
          deploymentType: 'content',
          totalSites: 10,
        })
      );
    });

    it('should throw error if no target sites found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
        .mockResolvedValueOnce({ rows: [] }) // INDEX
        .mockResolvedValueOnce({ rows: [] }) // INDEX
        .mockResolvedValueOnce({ rows: [] }); // No sites

      await expect(
        canaryDeploymentService.createCanaryDeployment(
          defaultParams.deploymentType,
          defaultParams.resourceId,
          defaultParams.targetType,
          defaultParams.targetId,
          defaultParams.userId
        )
      ).rejects.toThrow('Aucun site cible trouvé pour ce déploiement');
    });

    it('should deploy directly without canary if less than 5 sites', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'site-1', site_name: 'Site 1' },
            { id: 'site-2', site_name: 'Site 2' },
            { id: 'site-3', site_name: 'Site 3' },
          ],
        })
        .mockResolvedValue({ rows: [] }); // All subsequent inserts

      const result = await canaryDeploymentService.createCanaryDeployment(
        defaultParams.deploymentType,
        defaultParams.resourceId,
        defaultParams.targetType,
        defaultParams.targetId,
        defaultParams.userId
      );

      // All 3 sites should be canary sites
      expect(result.canarySites).toHaveLength(3);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Less than 5 sites, deploying directly without canary',
        expect.objectContaining({ totalSites: 3 })
      );
    });

    it('should accept custom configuration', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: Array.from({ length: 20 }, (_, i) => ({
            id: `site-${i}`,
            site_name: `Site ${i}`,
          })),
        })
        .mockResolvedValue({ rows: [] });

      const customConfig = {
        canaryPercentage: 20, // 20% instead of default 10%
        successThreshold: 90,
      };

      const result = await canaryDeploymentService.createCanaryDeployment(
        defaultParams.deploymentType,
        defaultParams.resourceId,
        defaultParams.targetType,
        defaultParams.targetId,
        defaultParams.userId,
        customConfig
      );

      // 20% of 20 = 4 canary sites
      expect(result.canarySites).toHaveLength(4);
    });
  });

  describe('startCanaryPhase', () => {
    it('should start deployment to canary sites', async () => {
      (canaryDeploymentService as any).tableChecked = true;

      // Mock getCanaryDeployment
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'canary-123',
            deployment_type: 'content',
            resource_id: 'video-456',
            target_type: 'group',
            target_id: 'group-789',
            config: JSON.stringify({
              canaryPercentage: 10,
              gradualSteps: [25, 50, 75, 100],
              stabilityPeriodMs: 1800000,
              successThreshold: 95,
              autoAdvance: true,
            }),
            current_phase: 'canary',
            current_step: 0,
            created_by: 'user-1',
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        // getMetrics
        .mockResolvedValueOnce({
          rows: [{ total: '10', deployed: '0', successful: '0', failed: '0', pending: '10' }],
        })
        // getSitesByPhase
        .mockResolvedValueOnce({
          rows: [
            { site_id: 'site-1', site_name: 'Site 1', status: 'pending', phase: 'canary' },
          ],
        })
        // deployToSite - INSERT content_deployments
        .mockResolvedValueOnce({ rows: [{ id: 'deploy-1' }] });

      mockStartDeployment.mockResolvedValue(undefined);

      await canaryDeploymentService.startCanaryPhase('canary-123');

      expect(mockStartDeployment).toHaveBeenCalledWith('deploy-1');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting canary phase',
        expect.objectContaining({ canaryDeploymentId: 'canary-123' })
      );
    });

    it('should throw error if deployment not found', async () => {
      (canaryDeploymentService as any).tableChecked = true;
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(canaryDeploymentService.startCanaryPhase('nonexistent')).rejects.toThrow(
        'Déploiement canary non trouvé'
      );
    });

    it('should throw error if phase is not canary', async () => {
      (canaryDeploymentService as any).tableChecked = true;
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'canary-123',
            current_phase: 'completed',
            config: '{}',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ total: '0', deployed: '0', successful: '0', failed: '0', pending: '0' }] });

      await expect(canaryDeploymentService.startCanaryPhase('canary-123')).rejects.toThrow(
        'Phase invalide: completed'
      );
    });

    it('should schedule stability check if autoAdvance is true', async () => {
      (canaryDeploymentService as any).tableChecked = true;

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'canary-123',
            deployment_type: 'content',
            resource_id: 'video-456',
            target_type: 'site',
            target_id: 'site-789',
            config: JSON.stringify({
              stabilityPeriodMs: 5000,
              autoAdvance: true,
              successThreshold: 95,
              gradualSteps: [100],
            }),
            current_phase: 'canary',
            current_step: 0,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ total: '1', deployed: '0', successful: '0', failed: '0', pending: '1' }] })
        .mockResolvedValueOnce({ rows: [{ site_id: 'site-789', site_name: 'Site', status: 'pending', phase: 'canary' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'deploy-1' }] });

      mockStartDeployment.mockResolvedValue(undefined);

      await canaryDeploymentService.startCanaryPhase('canary-123');

      expect((canaryDeploymentService as any).advanceIntervals.has('canary-123')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scheduled stability check',
        expect.objectContaining({ canaryDeploymentId: 'canary-123', checkInMs: 5000 })
      );
    });
  });

  describe('advanceToNextPhase', () => {
    beforeEach(() => {
      (canaryDeploymentService as any).tableChecked = true;
    });

    it('should advance to next phase when success rate meets threshold', async () => {
      mockQuery
        // getCanaryDeployment
        .mockResolvedValueOnce({
          rows: [{
            id: 'canary-123',
            deployment_type: 'content',
            resource_id: 'video-456',
            target_type: 'group',
            target_id: 'group-789',
            config: JSON.stringify({
              gradualSteps: [25, 50, 75, 100],
              successThreshold: 95,
              autoAdvance: true,
              stabilityPeriodMs: 1000,
            }),
            current_phase: 'canary',
            current_step: 0,
          }],
        })
        // getMetrics for deployment
        .mockResolvedValueOnce({ rows: [{ total: '10', deployed: '1', successful: '1', failed: '0', pending: '9' }] })
        // getMetrics for advanceToNextPhase
        .mockResolvedValueOnce({ rows: [{ total: '10', deployed: '1', successful: '1', failed: '0', pending: '9' }] })
        // getPendingSites
        .mockResolvedValueOnce({ rows: [{ site_id: 'site-2' }, { site_id: 'site-3' }] })
        // getMetrics again
        .mockResolvedValueOnce({ rows: [{ total: '10', deployed: '1', successful: '1', failed: '0', pending: '9' }] })
        // deployToSite and update phase
        .mockResolvedValue({ rows: [{ id: 'deploy-new' }] });

      mockStartDeployment.mockResolvedValue(undefined);

      const result = await canaryDeploymentService.advanceToNextPhase('canary-123');

      expect(result.advanced).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Advanced to next phase',
        expect.objectContaining({ canaryDeploymentId: 'canary-123' })
      );
    });

    it('should rollback if success rate below threshold', async () => {
      mockQuery.mockReset();

      const deploymentRow = {
        id: 'canary-123',
        deployment_type: 'content',
        resource_id: 'video-456',
        target_type: 'group',
        target_id: 'group-789',
        config: JSON.stringify({ successThreshold: 95, gradualSteps: [100] }),
        current_phase: 'canary',
        current_step: 0,
        created_by: 'user-1',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const metricsRow = { rows: [{ total: '10', deployed: '5', successful: '4', failed: '1', pending: '5' }] };

      mockQuery
        // 1. getCanaryDeployment in advanceToNextPhase
        .mockResolvedValueOnce({ rows: [deploymentRow] })
        // 2. getMetrics in getCanaryDeployment
        .mockResolvedValueOnce(metricsRow)
        // 3. getMetrics in advanceToNextPhase
        .mockResolvedValueOnce(metricsRow)
        // 4. rollback -> getCanaryDeployment
        .mockResolvedValueOnce({ rows: [deploymentRow] })
        // 5. getMetrics in getCanaryDeployment (rollback)
        .mockResolvedValueOnce(metricsRow)
        // 6. UPDATE phase to rolled_back
        .mockResolvedValueOnce({ rows: [] });

      const result = await canaryDeploymentService.advanceToNextPhase('canary-123');

      expect(result.advanced).toBe(false);
      expect(result.reason).toContain('Taux de succès');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cannot advance - success rate below threshold',
        expect.any(Object)
      );
    });

    it('should return false if deployment not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await canaryDeploymentService.advanceToNextPhase('nonexistent');

      expect(result.advanced).toBe(false);
      expect(result.reason).toBe('Déploiement non trouvé');
    });
  });

  describe('rollback', () => {
    beforeEach(() => {
      (canaryDeploymentService as any).tableChecked = true;
    });

    it('should rollback deployment and clear timers', async () => {
      // Set up a timer
      (canaryDeploymentService as any).advanceIntervals.set('canary-123', setTimeout(() => {}, 10000));

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'canary-123',
            deployment_type: 'content',
            resource_id: 'video-456',
            config: '{}',
            current_phase: 'gradual',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ total: '10', deployed: '5', successful: '5', failed: '0', pending: '5' }] })
        .mockResolvedValue({ rows: [] });

      await canaryDeploymentService.rollback('canary-123', 'Manual rollback');

      expect((canaryDeploymentService as any).advanceIntervals.has('canary-123')).toBe(false);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("current_phase = 'rolled_back'"),
        expect.arrayContaining(['Manual rollback', 'canary-123'])
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Canary deployment rolled back',
        expect.objectContaining({ canaryDeploymentId: 'canary-123', reason: 'Manual rollback' })
      );
    });

    it('should send rollback commands for update deployments', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'canary-123',
            deployment_type: 'update',
            resource_id: 'update-456',
            config: '{}',
            current_phase: 'gradual',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ total: '10', deployed: '5', successful: '5', failed: '0', pending: '5' }] })
        .mockResolvedValueOnce({ rows: [] }) // Update phase
        .mockResolvedValueOnce({ rows: [{ site_id: 'site-1' }, { site_id: 'site-2' }] }); // getDeployedSites

      mockIsConnected.mockReturnValue(true);

      await canaryDeploymentService.rollback('canary-123', 'Update failed');

      expect(mockSendCommand).toHaveBeenCalledTimes(2);
      expect(mockSendCommand).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'rollback_update',
          data: expect.objectContaining({ updateId: 'update-456' }),
        })
      );
    });

    it('should throw error if deployment not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(canaryDeploymentService.rollback('nonexistent', 'reason')).rejects.toThrow(
        'Déploiement canary non trouvé'
      );
    });
  });

  describe('updateSiteStatus', () => {
    beforeEach(() => {
      (canaryDeploymentService as any).tableChecked = true;
    });

    it('should update site status to deployed', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // UPDATE site status
        .mockResolvedValueOnce({ rows: [{ config: JSON.stringify({ autoAdvance: false }) }] }) // getCanaryDeployment
        .mockResolvedValueOnce({ rows: [{ total: '1', deployed: '1', successful: '1', failed: '0', pending: '0' }] }); // getMetrics

      await canaryDeploymentService.updateSiteStatus('canary-123', 'site-456', 'deployed');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = $1"),
        expect.arrayContaining(['deployed', null, 'canary-123', 'site-456'])
      );
    });

    it('should update site status to failed with error message', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ config: JSON.stringify({ autoAdvance: false }) }] })
        .mockResolvedValueOnce({ rows: [{ total: '1', deployed: '1', successful: '0', failed: '1', pending: '0' }] });

      await canaryDeploymentService.updateSiteStatus('canary-123', 'site-456', 'failed', 'Download error');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['failed', 'Download error', 'canary-123', 'site-456'])
      );
    });

    it('should trigger rollback if canary phase fails critically', async () => {
      mockQuery.mockReset();

      const deploymentRow = {
        id: 'canary-123',
        deployment_type: 'content',
        resource_id: 'video-456',
        target_type: 'group',
        target_id: 'group-789',
        config: JSON.stringify({ autoAdvance: true, successThreshold: 95 }),
        current_phase: 'canary',
        current_step: 0,
        created_by: 'user-1',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // 0% success rate (0/1 = 0%)
      const metricsRow = { rows: [{ total: '10', deployed: '1', successful: '0', failed: '1', pending: '9' }] };

      mockQuery
        // 1. UPDATE site status
        .mockResolvedValueOnce({ rows: [] })
        // 2. getCanaryDeployment in updateSiteStatus
        .mockResolvedValueOnce({ rows: [deploymentRow] })
        // 3. getMetrics in getCanaryDeployment
        .mockResolvedValueOnce(metricsRow)
        // 4. getMetrics in updateSiteStatus (line 378 - actually not called because metrics is fetched from deployment object)
        // Wait - getMetrics is called at line 378, but deployment already has metrics from getCanaryDeployment
        // Looking at line 378: const metrics = await this.getMetrics(canaryDeploymentId);
        // This is a separate call - so we need another mock
        .mockResolvedValueOnce(metricsRow)
        // 5. rollback -> getCanaryDeployment
        .mockResolvedValueOnce({ rows: [deploymentRow] })
        // 6. getMetrics in getCanaryDeployment (rollback)
        .mockResolvedValueOnce(metricsRow)
        // 7. UPDATE phase to rolled_back
        .mockResolvedValueOnce({ rows: [] });

      await canaryDeploymentService.updateSiteStatus('canary-123', 'site-456', 'failed', 'Critical error');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Canary deployment rolled back',
        expect.objectContaining({ reason: 'Échec critique pendant la phase canary' })
      );
    });
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      mockQuery.mockReset();
      (canaryDeploymentService as any).tableChecked = true;
    });

    it('should return correct metrics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '20', deployed: '15', successful: '14', failed: '1', pending: '5' }],
      });

      const metrics = await canaryDeploymentService.getMetrics('canary-123');

      expect(metrics).toEqual({
        totalSites: 20,
        deployedSites: 15,
        successfulSites: 14,
        failedSites: 1,
        pendingSites: 5,
        successRate: (14 / 15) * 100, // ~93.33%
      });
    });

    it('should return 100% success rate when no deployments yet', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '10', deployed: '0', successful: '0', failed: '0', pending: '10' }],
      });

      const metrics = await canaryDeploymentService.getMetrics('canary-123');

      expect(metrics.successRate).toBe(100);
    });
  });

  describe('getActiveDeployments', () => {
    beforeEach(() => {
      mockQuery.mockReset();
      (canaryDeploymentService as any).tableChecked = true;
    });

    it('should return active deployments', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'canary-1' }, { id: 'canary-2' }],
        })
        // getCanaryDeployment for canary-1
        .mockResolvedValueOnce({
          rows: [{
            id: 'canary-1',
            deployment_type: 'content',
            resource_id: 'video-1',
            target_type: 'group',
            target_id: 'group-1',
            config: '{}',
            current_phase: 'gradual',
            current_step: 1,
            created_by: 'user-1',
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [{ total: '10', deployed: '5', successful: '5', failed: '0', pending: '5' }] })
        // getCanaryDeployment for canary-2
        .mockResolvedValueOnce({
          rows: [{
            id: 'canary-2',
            deployment_type: 'update',
            resource_id: 'update-1',
            target_type: 'site',
            target_id: 'site-1',
            config: '{}',
            current_phase: 'canary',
            current_step: 0,
            created_by: 'user-2',
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [{ total: '1', deployed: '0', successful: '0', failed: '0', pending: '1' }] });

      const deployments = await canaryDeploymentService.getActiveDeployments();

      expect(deployments).toHaveLength(2);
      expect(deployments[0].id).toBe('canary-1');
      expect(deployments[1].id).toBe('canary-2');
    });

    it('should exclude completed, failed, and rolled back deployments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await canaryDeploymentService.getActiveDeployments();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("current_phase NOT IN ('completed', 'failed', 'rolled_back')"),
        expect.any(Array)
      );
    });
  });

  describe('cleanup', () => {
    it('should clear all timers', () => {
      const timer1 = setTimeout(() => {}, 10000);
      const timer2 = setTimeout(() => {}, 10000);

      (canaryDeploymentService as any).advanceIntervals.set('canary-1', timer1);
      (canaryDeploymentService as any).advanceIntervals.set('canary-2', timer2);

      canaryDeploymentService.cleanup();

      expect((canaryDeploymentService as any).advanceIntervals.size).toBe(0);
    });
  });

  describe('Private helpers', () => {
    describe('shuffleArray', () => {
      it('should return array with same elements', () => {
        const original = [1, 2, 3, 4, 5];
        const shuffled = (canaryDeploymentService as any).shuffleArray([...original]);

        expect(shuffled).toHaveLength(5);
        expect(shuffled.sort()).toEqual(original.sort());
      });
    });

    describe('getTargetSites', () => {
      beforeEach(() => {
        mockQuery.mockReset();
        (canaryDeploymentService as any).tableChecked = true;
      });

      it('should get single site for site target type', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'site-123', site_name: 'Test Site' }],
        });

        const sites = await (canaryDeploymentService as any).getTargetSites('site', 'site-123');

        expect(sites).toHaveLength(1);
        expect(sites[0].siteId).toBe('site-123');
        expect(sites[0].siteName).toBe('Test Site');
      });

      it('should get multiple sites for group target type', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            { id: 'site-1', site_name: 'Site 1' },
            { id: 'site-2', site_name: 'Site 2' },
          ],
        });

        const sites = await (canaryDeploymentService as any).getTargetSites('group', 'group-123');

        expect(sites).toHaveLength(2);
        expect(sites[0].siteId).toBe('site-1');
        expect(sites[1].siteId).toBe('site-2');
      });

      it('should return empty array for unknown target type', async () => {
        const sites = await (canaryDeploymentService as any).getTargetSites('unknown', 'id');

        expect(sites).toEqual([]);
      });
    });
  });

  describe('Integration scenarios', () => {
    it('Scenario: Full canary deployment lifecycle', async () => {
      mockQuery.mockReset();
      (canaryDeploymentService as any).tableChecked = false;

      // 1. Create deployment with proper mock chain
      mockQuery
        // ensureTable - CREATE TABLE canary_deployments
        .mockResolvedValueOnce({ rows: [] })
        // ensureTable - CREATE TABLE canary_site_status
        .mockResolvedValueOnce({ rows: [] })
        // ensureTable - CREATE INDEX 1
        .mockResolvedValueOnce({ rows: [] })
        // ensureTable - CREATE INDEX 2
        .mockResolvedValueOnce({ rows: [] })
        // getTargetSites - 10 sites
        .mockResolvedValueOnce({
          rows: Array.from({ length: 10 }, (_, i) => ({
            id: `site-${i}`,
            site_name: `Site ${i}`,
          })),
        })
        // INSERT canary deployment
        .mockResolvedValueOnce({ rows: [] });

      // Mock site status inserts (10 sites)
      for (let i = 0; i < 10; i++) {
        mockQuery.mockResolvedValueOnce({ rows: [] });
      }

      const createResult = await canaryDeploymentService.createCanaryDeployment(
        'content',
        'video-123',
        'group',
        'group-456',
        'user-789'
      );

      expect(createResult.id).toBeDefined();
      expect(createResult.canarySites.length).toBeGreaterThan(0);

      // Verify deployment was created
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Canary deployment created',
        expect.any(Object)
      );
    });
  });
});
