/**
 * Tests for OrchestratedDeploymentService
 *
 * Tests the orchestrated deployment flow: videos first, then config.
 */

import { orchestratedDeploymentService } from './orchestrated-deployment.service';
import { query } from '../config/database';
import { draftService } from './draft.service';
import { commandQueueService } from './command-queue.service';
import logger from '../config/logger';

// Mock dependencies
jest.mock('../config/database');
jest.mock('./draft.service');
jest.mock('./command-queue.service');
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockDraftService = draftService as jest.Mocked<typeof draftService>;
const mockCommandQueue = commandQueueService as jest.Mocked<typeof commandQueueService>;

describe('OrchestratedDeploymentService', () => {
  const siteId = 'site-123';
  const userId = 'user-456';
  const draftId = 'draft-789';
  const orchestratedId = expect.any(String);

  const mockDraft = {
    id: draftId,
    site_id: siteId,
    name: 'Test Draft',
    configuration: {
      sponsors: [{ name: 'Sponsor1', path: 'videos/sponsor1.mp4' }],
      categories: [],
      timeCategories: [],
    },
    referenced_video_ids: ['video-1', 'video-2'],
    status: 'draft' as const,
    created_by: userId,
    updated_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockVideos = [
    { id: 'video-1', filename: 'video1.mp4', storage_path: 'uploads/video1.mp4', category: 'SPONSORS' },
    { id: 'video-2', filename: 'video2.mp4', storage_path: 'uploads/video2.mp4', category: 'SPONSORS' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('startDeployment', () => {
    it('should start a deployment with videos and config', async () => {
      // Arrange
      mockDraftService.getDraft.mockResolvedValue(mockDraft);
      mockDraftService.validateDraft.mockResolvedValue({
        valid: true,
        missingVideos: [],
        videosToDeploy: ['video-1', 'video-2'],
      });
      mockDraftService.getVideosToDeployForDraft.mockResolvedValue(mockVideos as any);
      mockDraftService.updateDraftStatus.mockResolvedValue(undefined);

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'orch-123',
          site_id: siteId,
          draft_id: draftId,
          status: 'deploying_videos',
          total_videos: 2,
          videos_completed: 0,
          videos_failed: 0,
          config_deployed: false,
          error_message: null,
          failed_video_ids: null,
          started_by: userId,
          started_at: new Date(),
          completed_at: null,
          configuration_snapshot: JSON.stringify(mockDraft.configuration),
        }],
        rowCount: 1,
      });

      // Mock video deployment inserts
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      mockCommandQueue.queueCommand.mockResolvedValue({
        queued: true,
        commandId: 'cmd-123',
        message: 'Command queued',
      });

      // Act
      const result = await orchestratedDeploymentService.startDeployment(siteId, userId);

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('deploying_videos');
      expect(result.total_videos).toBe(2);
      expect(mockDraftService.getDraft).toHaveBeenCalledWith(siteId);
      expect(mockDraftService.updateDraftStatus).toHaveBeenCalledWith(siteId, 'deploying');
      // 2 video deployments + 1 config update = at least 3 queueCommand calls
      expect(mockCommandQueue.queueCommand).toHaveBeenCalled();
    });

    it('should throw error when no draft exists', async () => {
      // Arrange
      mockDraftService.getDraft.mockResolvedValue(null);

      // Act & Assert
      await expect(
        orchestratedDeploymentService.startDeployment(siteId, userId)
      ).rejects.toThrow('Aucun brouillon trouvé pour ce site');
    });

    it('should handle deployment with no videos (config only)', async () => {
      // Arrange
      const draftNoVideos = { ...mockDraft, referenced_video_ids: [] };
      mockDraftService.getDraft.mockResolvedValue(draftNoVideos);
      mockDraftService.validateDraft.mockResolvedValue({
        valid: true,
        missingVideos: [],
        videosToDeploy: [],
      });
      mockDraftService.getVideosToDeployForDraft.mockResolvedValue([]);
      mockDraftService.updateDraftStatus.mockResolvedValue(undefined);

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'orch-456',
          site_id: siteId,
          draft_id: draftId,
          status: 'deploying_config',
          total_videos: 0,
          videos_completed: 0,
          videos_failed: 0,
          config_deployed: false,
          error_message: null,
          failed_video_ids: null,
          started_by: userId,
          started_at: new Date(),
          completed_at: null,
          configuration_snapshot: JSON.stringify(draftNoVideos.configuration),
        }],
        rowCount: 1,
      });
      mockCommandQueue.queueCommand.mockResolvedValue({
        queued: true,
        commandId: 'cmd-456',
        message: 'Command queued',
      });

      // Act
      const result = await orchestratedDeploymentService.startDeployment(siteId, userId);

      // Assert
      expect(result.status).toBe('deploying_config');
      expect(result.total_videos).toBe(0);
      // Only config update should be queued
      expect(mockCommandQueue.queueCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('onVideoDeploymentComplete', () => {
    it('should increment videos_completed on success', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{
            id: 'orch-123',
            total_videos: 2,
            videos_completed: 1,
            videos_failed: 0,
            status: 'deploying_videos',
          }],
          rowCount: 1,
        }); // SELECT for checkVideoDeploymentsComplete

      // Act
      await orchestratedDeploymentService.onVideoDeploymentComplete(
        'orch-123',
        'video-1',
        true
      );

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('videos_completed = videos_completed + 1'),
        ['orch-123']
      );
    });

    it('should increment videos_failed and record video id on failure', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({
          rows: [{
            id: 'orch-123',
            total_videos: 2,
            videos_completed: 0,
            videos_failed: 1,
            status: 'deploying_videos',
          }],
          rowCount: 1,
        });

      // Act
      await orchestratedDeploymentService.onVideoDeploymentComplete(
        'orch-123',
        'video-1',
        false,
        'Download failed'
      );

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('videos_failed = videos_failed + 1'),
        ['orch-123', 'video-1']
      );
    });

    it('should transition to deploying_config when all videos complete', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE increment
        .mockResolvedValueOnce({
          rows: [{
            id: 'orch-123',
            total_videos: 2,
            videos_completed: 2,
            videos_failed: 0,
            status: 'deploying_videos',
          }],
          rowCount: 1,
        }) // SELECT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE status

      // Act
      await orchestratedDeploymentService.onVideoDeploymentComplete(
        'orch-123',
        'video-2',
        true
      );

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'deploying_config'"),
        ['orch-123']
      );
    });

    it('should mark deployment as failed when all videos fail', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE increment failed
        .mockResolvedValueOnce({
          rows: [{
            id: 'orch-123',
            total_videos: 2,
            videos_completed: 0,
            videos_failed: 2,
            status: 'deploying_videos',
            draft_id: draftId,
          }],
          rowCount: 1,
        }) // SELECT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE status to failed
        .mockResolvedValueOnce({ rows: [{ draft_id: draftId }], rowCount: 1 }) // SELECT draft_id
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE draft status

      // Act
      await orchestratedDeploymentService.onVideoDeploymentComplete(
        'orch-123',
        'video-2',
        false,
        'Download failed'
      );

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        expect.arrayContaining(['Tous les déploiements vidéo ont échoué'])
      );
    });
  });

  describe('onConfigDeploymentComplete', () => {
    it('should mark deployment as completed on success', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'orch-123',
            videos_failed: 0,
            draft_id: draftId,
          }],
          rowCount: 1,
        }) // SELECT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE orchestrated
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE draft

      // Act
      await orchestratedDeploymentService.onConfigDeploymentComplete(
        'orch-123',
        true
      );

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = $1"),
        ['completed', 'orch-123']
      );
    });

    it('should mark as partial_failure when some videos failed', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'orch-123',
            videos_failed: 1,
            draft_id: draftId,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Act
      await orchestratedDeploymentService.onConfigDeploymentComplete(
        'orch-123',
        true
      );

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = $1"),
        ['partial_failure', 'orch-123']
      );
    });

    it('should mark deployment as failed on config failure', async () => {
      // Arrange
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'orch-123',
            draft_id: draftId,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ draft_id: draftId }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Act
      await orchestratedDeploymentService.onConfigDeploymentComplete(
        'orch-123',
        false,
        'Config update timeout'
      );

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        expect.arrayContaining(['Config update timeout'])
      );
    });
  });

  describe('getDeploymentProgress', () => {
    it('should return progress with calculated percentage', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'orch-123',
          status: 'deploying_videos',
          total_videos: 4,
          videos_completed: 2,
          videos_failed: 0,
          config_deployed: false,
          error_message: null,
          failed_video_ids: null,
          failed_filenames: null,
        }],
        rowCount: 1,
      });

      // Act
      const progress = await orchestratedDeploymentService.getDeploymentProgress('orch-123');

      // Assert
      expect(progress).not.toBeNull();
      expect(progress!.totalVideos).toBe(4);
      expect(progress!.videosCompleted).toBe(2);
      expect(progress!.overallProgress).toBe(40); // (2/4) * 80 = 40%
    });

    it('should return 100% when fully completed', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'orch-123',
          status: 'completed',
          total_videos: 2,
          videos_completed: 2,
          videos_failed: 0,
          config_deployed: true,
          error_message: null,
          failed_video_ids: null,
          failed_filenames: null,
        }],
        rowCount: 1,
      });

      // Act
      const progress = await orchestratedDeploymentService.getDeploymentProgress('orch-123');

      // Assert
      expect(progress!.overallProgress).toBe(100); // 80% videos + 20% config
    });

    it('should return null for non-existent deployment', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Act
      const progress = await orchestratedDeploymentService.getDeploymentProgress('non-existent');

      // Assert
      expect(progress).toBeNull();
    });

    it('should include failed video details', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'orch-123',
          status: 'partial_failure',
          total_videos: 3,
          videos_completed: 2,
          videos_failed: 1,
          config_deployed: true,
          error_message: null,
          failed_video_ids: ['video-3'],
          failed_filenames: ['failed-video.mp4'],
        }],
        rowCount: 1,
      });

      // Act
      const progress = await orchestratedDeploymentService.getDeploymentProgress('orch-123');

      // Assert
      expect(progress!.failedVideos).toHaveLength(1);
      expect(progress!.failedVideos[0].filename).toBe('failed-video.mp4');
    });
  });

  describe('getActiveDeployments', () => {
    it('should return only active deployments for a site', async () => {
      // Arrange
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'orch-1',
            site_id: siteId,
            status: 'deploying_videos',
            total_videos: 2,
            videos_completed: 1,
            videos_failed: 0,
            config_deployed: false,
            error_message: null,
            failed_video_ids: null,
            started_by: userId,
            started_at: new Date(),
            completed_at: null,
            configuration_snapshot: '{}',
          },
        ],
        rowCount: 1,
      });

      // Act
      const deployments = await orchestratedDeploymentService.getActiveDeployments(siteId);

      // Assert
      expect(deployments).toHaveLength(1);
      expect(deployments[0].status).toBe('deploying_videos');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status NOT IN ('completed', 'failed', 'partial_failure')"),
        [siteId]
      );
    });
  });
});
