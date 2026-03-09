/**
 * Tests unitaires pour deploy-progress.handler — deployed_path feedback
 *
 * Vérifie que le handler persiste le chemin réel rapporté par le Pi
 * dans content_deployments lors de la complétion du déploiement.
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

jest.mock('../services/metrics.service', () => ({
  metricsService: {
    recordDeployProgressEvent: jest.fn(),
  },
}));

import { handleDeployProgress } from './deploy-progress.handler';
import { SocketContext } from './socket-context';

const mockCtx: SocketContext = {
  getIO: jest.fn().mockReturnValue({
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  }),
} as unknown as SocketContext;

describe('handleDeployProgress — deployed_path feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('should persist deployedPath and deployedFilename on completion', async () => {
    await handleDeployProgress(mockCtx, 'site-123', {
      deploymentId: 'dep-1',
      videoId: 'vid-1',
      progress: 100,
      completed: true,
      deployedPath: 'videos/SPONSORS/Pub-été-2024.mp4',
      deployedFilename: 'Pub-été-2024.mp4',
    });

    // The completion UPDATE should include deployed_path and deployed_filename
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('deployed_path = COALESCE($2, deployed_path)'),
      ['dep-1', 'videos/SPONSORS/Pub-été-2024.mp4', 'Pub-été-2024.mp4']
    );
  });

  it('should persist null deployed_path when not provided (rétrocompat)', async () => {
    await handleDeployProgress(mockCtx, 'site-123', {
      deploymentId: 'dep-1',
      videoId: 'vid-1',
      progress: 100,
      completed: true,
    });

    // COALESCE(null, deployed_path) preserves existing value
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('deployed_path = COALESCE($2, deployed_path)'),
      ['dep-1', null, null]
    );
  });

  it('should persist deployedPath on auto-complete (progress >= 100 without completed flag)', async () => {
    await handleDeployProgress(mockCtx, 'site-123', {
      deploymentId: 'dep-1',
      videoId: 'vid-1',
      progress: 100,
      deployedPath: 'videos/UPLOADS/video.mp4',
      deployedFilename: 'video.mp4',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('deployed_path = COALESCE($2, deployed_path)'),
      ['dep-1', 'videos/UPLOADS/video.mp4', 'video.mp4']
    );
  });

  it('should NOT include deployedPath in error updates', async () => {
    await handleDeployProgress(mockCtx, 'site-123', {
      deploymentId: 'dep-1',
      videoId: 'vid-1',
      error: 'Checksum mismatch',
      deployedPath: 'videos/SPONSORS/corrupt.mp4',
    });

    // Error path should NOT include deployed_path
    const errorCall = mockQuery.mock.calls[0];
    expect(errorCall[0]).toContain("status = 'failed'");
    expect(errorCall[0]).not.toContain('deployed_path');
  });

  it('should NOT include deployedPath in progress updates', async () => {
    await handleDeployProgress(mockCtx, 'site-123', {
      deploymentId: 'dep-1',
      videoId: 'vid-1',
      progress: 50,
      deployedPath: 'videos/SPONSORS/inprogress.mp4',
    });

    // Progress update should NOT include deployed_path
    const progressCall = mockQuery.mock.calls[0];
    expect(progressCall[0]).not.toContain('deployed_path');
  });
});
