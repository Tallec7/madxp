/**
 * Tests unitaires pour deploymentRepository.backfillDeployedPaths
 *
 * Vérifie la logique de matching checksum-first, filename-fallback
 * pour le backfill des deployed_path manquants.
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

import { deploymentRepository } from './deployment.repository';

describe('deploymentRepository.backfillDeployedPaths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 0 when localVideos is empty', async () => {
    const result = await deploymentRepository.backfillDeployedPaths('site-1', []);
    expect(result).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should return 0 when no deployments are missing deployed_path', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT returns no missing rows

    const result = await deploymentRepository.backfillDeployedPaths('site-1', [
      { filename: 'video.mp4', path: 'videos/CAT/video.mp4', checksum: 'abc' },
    ]);

    expect(result).toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(1); // Only the SELECT
  });

  it('should match by checksum and backfill deployed_path', async () => {
    // 1 deployment missing deployed_path
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'dep-1',
        video_id: 'vid-1',
        video_filename: 'original-name.mp4',
        video_checksum: 'sha256abc',
      }],
    });
    // UPDATE
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await deploymentRepository.backfillDeployedPaths('site-1', [
      { filename: 'renamed-on-pi.mp4', path: 'videos/SPONSORS/renamed-on-pi.mp4', checksum: 'sha256abc' },
    ]);

    expect(result).toBe(1);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    // The UPDATE should use the Pi's real path, not the cloud filename
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE content_deployments'),
      ['videos/SPONSORS/renamed-on-pi.mp4', 'renamed-on-pi.mp4', 'dep-1']
    );
  });

  it('should fallback to filename match when checksum is null', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'dep-2',
        video_id: 'vid-2',
        video_filename: 'ambiance.mp4',
        video_checksum: null,
      }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await deploymentRepository.backfillDeployedPaths('site-1', [
      { filename: 'ambiance.mp4', path: 'videos/AMBIANCE/ambiance.mp4' },
    ]);

    expect(result).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE content_deployments'),
      ['videos/AMBIANCE/ambiance.mp4', 'ambiance.mp4', 'dep-2']
    );
  });

  it('should NOT backfill when no match is found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'dep-3',
        video_id: 'vid-3',
        video_filename: 'deleted-video.mp4',
        video_checksum: 'xyz999',
      }],
    });

    const result = await deploymentRepository.backfillDeployedPaths('site-1', [
      { filename: 'other-video.mp4', path: 'videos/OTHER/other-video.mp4', checksum: 'different' },
    ]);

    expect(result).toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(1); // Only the SELECT, no UPDATE
  });

  it('should handle multiple deployments — some match, some not', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'dep-A', video_id: 'vid-A', video_filename: 'found.mp4', video_checksum: 'chk-A' },
        { id: 'dep-B', video_id: 'vid-B', video_filename: 'missing.mp4', video_checksum: 'chk-B' },
      ],
    });
    // UPDATE for dep-A
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await deploymentRepository.backfillDeployedPaths('site-1', [
      { filename: 'found.mp4', path: 'videos/SPONSORS/found.mp4', checksum: 'chk-A' },
      // No match for chk-B or missing.mp4
    ]);

    expect(result).toBe(1);
    expect(mockQuery).toHaveBeenCalledTimes(2); // SELECT + 1 UPDATE
  });

  it('should prefer checksum match over filename match', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'dep-4',
        video_id: 'vid-4',
        video_filename: 'sponsor.mp4',
        video_checksum: 'correct-checksum',
      }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await deploymentRepository.backfillDeployedPaths('site-1', [
      // Filename match exists but wrong checksum
      { filename: 'sponsor.mp4', path: 'videos/OLD/sponsor.mp4', checksum: 'wrong-checksum' },
      // Checksum match with different filename (Pi renamed it)
      { filename: 'sponsor-1.mp4', path: 'videos/SPONSORS/sponsor-1.mp4', checksum: 'correct-checksum' },
    ]);

    expect(result).toBe(1);
    // Should use the checksum-matched path, not the filename-matched path
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE content_deployments'),
      ['videos/SPONSORS/sponsor-1.mp4', 'sponsor-1.mp4', 'dep-4']
    );
  });
});
