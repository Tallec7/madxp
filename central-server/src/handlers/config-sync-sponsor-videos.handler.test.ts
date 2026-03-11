/**
 * Tests for syncVideoAssociations via resolveLocalSponsors.
 *
 * Verifies that when Pi sends localSponsors with videoFilenames,
 * the handler syncs those into site_sponsor_videos (add new, remove obsolete).
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
    recordSyncOperation: jest.fn(),
    recordSiteNetworkTypes: jest.fn(),
    recordSiteStabilityScore: jest.fn(),
    recordConfigDrift: jest.fn(),
    recordConfigSyncPending: jest.fn(),
    recordSponsorResolutionFailure: jest.fn(),
    recordSecondaryVariantEnrichment: jest.fn(),
  },
}));

const mockFindByNameAndSite = jest.fn();
const mockCreate = jest.fn();
const mockGetVideos = jest.fn();
const mockAddVideo = jest.fn();
const mockRemoveVideo = jest.fn();

jest.mock('../repositories/site-sponsor.repository', () => ({
  siteSponsorRepository: {
    findByNameAndSite: (...args: unknown[]) => mockFindByNameAndSite(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    getSponsorsForDeployment: jest.fn().mockResolvedValue([]),
    getVideos: (...args: unknown[]) => mockGetVideos(...args),
    addVideo: (...args: unknown[]) => mockAddVideo(...args),
    removeVideo: (...args: unknown[]) => mockRemoveVideo(...args),
  },
}));

const mockGetDeployedPaths = jest.fn();
jest.mock('../repositories/deployment.repository', () => ({
  deploymentRepository: {
    backfillDeployedPaths: jest.fn().mockResolvedValue(0),
    getDeployedPathsForSite: (...args: unknown[]) => mockGetDeployedPaths(...args),
  },
}));

jest.mock('../services/sponsor-auto-resolution.service', () => ({
  autoResolveSponsorIds: jest.fn().mockResolvedValue({ configuration: {}, resolved: 0 }),
}));

jest.mock('../utils/config-secondary-variants', () => ({
  enrichConfigWithSecondaryVariants: jest.fn().mockResolvedValue({ enrichedCount: 0 }),
}));

jest.mock('../utils/config-analytics-metadata', () => ({
  enrichConfigWithAnalyticsMetadata: jest.fn().mockResolvedValue({ enrichedCount: 0 }),
}));

import { handleSyncLocalState } from './config-sync.handler';
import { SocketContext } from './socket-context';

const mockCtx: SocketContext = {
  getIO: jest.fn().mockReturnValue({
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  }),
  connectedSites: new Map(),
} as unknown as SocketContext;

const mockSendLicenseStatus = jest.fn().mockResolvedValue(undefined);

describe('resolveLocalSponsors — video association sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no pending config, no pending sync count
    mockQuery.mockResolvedValue({ rows: [{ config_update_pending_until: null, count: '0' }] });
    // Default: no deployed paths
    mockGetDeployedPaths.mockResolvedValue([]);
    // Default: no existing videos
    mockGetVideos.mockResolvedValue([]);
    mockAddVideo.mockResolvedValue(undefined);
    mockRemoveVideo.mockResolvedValue(true);
  });

  it('should add video associations for new local sponsor', async () => {
    // Sponsor does not exist yet → will be created
    mockFindByNameAndSite.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'central-uuid-1' });

    await handleSyncLocalState(mockCtx, 'site-1', {
      configHash: 'hash1',
      config: { categories: [] },
      videos: [],
      storage: { total: 1000, used: 500, free: 500 },
      timestamp: new Date().toISOString(),
      localSponsors: [
        {
          localId: 'local-1',
          centralId: null,
          name: 'Sponsor A',
          videoFilenames: ['sponsor-a-intro.mp4', 'sponsor-a-outro.mp4'],
        },
      ],
    }, mockSendLicenseStatus);

    // Sponsor created
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Videos synced
    expect(mockGetVideos).toHaveBeenCalledWith('central-uuid-1');
    expect(mockAddVideo).toHaveBeenCalledTimes(2);
    expect(mockAddVideo).toHaveBeenCalledWith('central-uuid-1', null, 'sponsor-a-intro.mp4');
    expect(mockAddVideo).toHaveBeenCalledWith('central-uuid-1', null, 'sponsor-a-outro.mp4');
  });

  it('should resolve video_id from content_deployments when available', async () => {
    mockFindByNameAndSite.mockResolvedValue({ id: 'central-uuid-2' });
    mockGetDeployedPaths.mockResolvedValue([
      { video_id: 'video-uuid-1', deployed_path: 'videos/SPONSORS/ad.mp4', deployed_filename: 'ad.mp4' },
    ]);

    await handleSyncLocalState(mockCtx, 'site-1', {
      configHash: 'hash1',
      config: { categories: [] },
      videos: [],
      storage: { total: 1000, used: 500, free: 500 },
      timestamp: new Date().toISOString(),
      localSponsors: [
        {
          localId: 'local-2',
          centralId: null,
          name: 'Sponsor B',
          videoFilenames: ['ad.mp4'],
        },
      ],
    }, mockSendLicenseStatus);

    // Should pass the resolved video_id
    expect(mockAddVideo).toHaveBeenCalledWith('central-uuid-2', 'video-uuid-1', 'ad.mp4');
  });

  it('should remove obsolete video associations', async () => {
    mockFindByNameAndSite.mockResolvedValue({ id: 'central-uuid-3' });

    // Existing association that is no longer in Pi's list
    mockGetVideos.mockResolvedValue([
      { video_filename: 'old-video.mp4', video_id: null },
      { video_filename: 'still-used.mp4', video_id: null },
    ]);

    await handleSyncLocalState(mockCtx, 'site-1', {
      configHash: 'hash1',
      config: { categories: [] },
      videos: [],
      storage: { total: 1000, used: 500, free: 500 },
      timestamp: new Date().toISOString(),
      localSponsors: [
        {
          localId: 'local-3',
          centralId: null,
          name: 'Sponsor C',
          videoFilenames: ['still-used.mp4', 'new-video.mp4'],
        },
      ],
    }, mockSendLicenseStatus);

    // Should remove old-video.mp4
    expect(mockRemoveVideo).toHaveBeenCalledWith('central-uuid-3', 'old-video.mp4');
    expect(mockRemoveVideo).toHaveBeenCalledTimes(1);

    // Should add new-video.mp4
    expect(mockAddVideo).toHaveBeenCalledWith('central-uuid-3', null, 'new-video.mp4');
    expect(mockAddVideo).toHaveBeenCalledTimes(1);
  });

  it('should skip video sync when videoFilenames is empty', async () => {
    mockFindByNameAndSite.mockResolvedValue({ id: 'central-uuid-4' });

    await handleSyncLocalState(mockCtx, 'site-1', {
      configHash: 'hash1',
      config: { categories: [] },
      videos: [],
      storage: { total: 1000, used: 500, free: 500 },
      timestamp: new Date().toISOString(),
      localSponsors: [
        {
          localId: 'local-4',
          centralId: null,
          name: 'Sponsor D',
          videoFilenames: [],
        },
      ],
    }, mockSendLicenseStatus);

    // No video sync calls
    expect(mockGetVideos).not.toHaveBeenCalled();
    expect(mockAddVideo).not.toHaveBeenCalled();
  });

  it('should handle already-resolved sponsors (with centralId) for video sync', async () => {
    // Sponsor already has a centralId — skip creation, but still sync videos
    mockGetVideos.mockResolvedValue([]);

    await handleSyncLocalState(mockCtx, 'site-1', {
      configHash: 'hash1',
      config: { categories: [] },
      videos: [],
      storage: { total: 1000, used: 500, free: 500 },
      timestamp: new Date().toISOString(),
      localSponsors: [
        {
          localId: 'local-5',
          centralId: 'already-known-uuid',
          name: 'Sponsor E',
          videoFilenames: ['resolved-video.mp4'],
        },
      ],
    }, mockSendLicenseStatus);

    // Should NOT create sponsor (already has centralId)
    expect(mockFindByNameAndSite).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();

    // Should still sync videos using existing centralId
    expect(mockGetVideos).toHaveBeenCalledWith('already-known-uuid');
    expect(mockAddVideo).toHaveBeenCalledWith('already-known-uuid', null, 'resolved-video.mp4');
  });
});
