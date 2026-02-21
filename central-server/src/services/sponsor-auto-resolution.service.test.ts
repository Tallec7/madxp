import { autoResolveSponsorIds } from './sponsor-auto-resolution.service';
import type { SiteConfiguration } from '../types';

// Mock dependencies
jest.mock('../config/database', () => ({
  query: jest.fn(),
}));
jest.mock('../config/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  __esModule: true,
}));
jest.mock('./metrics.service', () => ({
  metricsService: {
    recordSponsorAutoResolution: jest.fn(),
  },
  default: {
    recordSponsorAutoResolution: jest.fn(),
  },
  __esModule: true,
}));

import { siteSponsorRepository } from '../repositories/site-sponsor.repository';
import { metricsService } from './metrics.service';

// Mock the repository method directly
jest.spyOn(siteSponsorRepository, 'resolveSiteSponsorIdsByFilenameBulk')
  .mockImplementation(async () => new Map());

const mockResolveBulk = siteSponsorRepository.resolveSiteSponsorIdsByFilenameBulk as jest.MockedFunction<
  typeof siteSponsorRepository.resolveSiteSponsorIdsByFilenameBulk
>;
const mockMetrics = metricsService.recordSponsorAutoResolution as jest.MockedFunction<
  typeof metricsService.recordSponsorAutoResolution
>;

const SITE_ID = 'site-uuid-1234';
const SPONSOR_A_ID = 'sponsor-a-uuid';
const SPONSOR_B_ID = 'sponsor-b-uuid';

function buildConfig(overrides: Partial<SiteConfiguration> = {}): SiteConfiguration {
  return {
    sponsors: [],
    categories: [],
    ...overrides,
  };
}

describe('Sponsor Auto-Resolution Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveBulk.mockResolvedValue(new Map());
  });

  // =========================================================================
  // Basic resolution
  // =========================================================================

  describe('basic resolution', () => {
    it('should resolve site_sponsor_id for matching videos in sponsors[]', async () => {
      const config = buildConfig({
        sponsors: [
          { name: 'A L AFFUT', path: 'videos/BOUCLE/07_A_L_AFFUT.mp4' },
          { name: 'GOLDEN CUP', path: 'videos/BOUCLE/GOLDEN_CUP.mp4' },
          { name: 'Intro', path: 'videos/BOUCLE/01_INTRO.mp4' },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`07_A_L_AFFUT.mp4::${SITE_ID}`, SPONSOR_A_ID],
        [`GOLDEN_CUP.mp4::${SITE_ID}`, SPONSOR_B_ID],
      ]));

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.resolved).toBe(2);
      expect(result.unresolved).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.configuration.sponsors[0].site_sponsor_id).toBe(SPONSOR_A_ID);
      expect(result.configuration.sponsors[1].site_sponsor_id).toBe(SPONSOR_B_ID);
      expect(result.configuration.sponsors[2].site_sponsor_id).toBeUndefined();
    });

    it('should resolve videos in timeCategories[].loopVideos[]', async () => {
      const config = buildConfig({
        timeCategories: [
          {
            id: 'before',
            name: 'Avant-match',
            loopVideos: [
              { name: 'A L AFFUT', path: 'videos/BOUCLE/07_A_L_AFFUT.mp4' },
              { name: 'Intro', path: 'videos/BOUCLE/01_INTRO.mp4' },
            ],
          },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`07_A_L_AFFUT.mp4::${SITE_ID}`, SPONSOR_A_ID],
      ]));

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.resolved).toBe(1);
      expect(result.unresolved).toBe(1);
      expect(result.configuration.timeCategories![0].loopVideos[0].site_sponsor_id).toBe(SPONSOR_A_ID);
      expect(result.configuration.timeCategories![0].loopVideos[1].site_sponsor_id).toBeUndefined();
    });

    it('should resolve videos in categories[].videos[]', async () => {
      const config = buildConfig({
        categories: [
          {
            id: 'focus',
            name: 'FOCUS PARTENAIRES',
            videos: [
              { name: 'A L AFFUT', path: 'A_L_AFFUT.mp4' },
              { name: 'DECATHLON', path: 'Decathlon FOCUS Partenaire.mp4' },
            ],
          },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`A_L_AFFUT.mp4::${SITE_ID}`, SPONSOR_A_ID],
        [`Decathlon FOCUS Partenaire.mp4::${SITE_ID}`, SPONSOR_B_ID],
      ]));

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.resolved).toBe(2);
      expect(result.configuration.categories[0].videos[0].site_sponsor_id).toBe(SPONSOR_A_ID);
      expect(result.configuration.categories[0].videos[1].site_sponsor_id).toBe(SPONSOR_B_ID);
    });

    it('should resolve videos in categories[].subCategories[].videos[]', async () => {
      const config = buildConfig({
        categories: [
          {
            id: 'parent',
            name: 'Parent',
            videos: [],
            subCategories: [
              {
                id: 'sub1',
                name: 'Sub Category',
                videos: [
                  { name: 'Sponsor Video', path: 'videos/CAT/sponsor_video.mp4' },
                ],
              },
            ],
          },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`sponsor_video.mp4::${SITE_ID}`, SPONSOR_A_ID],
      ]));

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.resolved).toBe(1);
      expect(result.configuration.categories[0].subCategories![0].videos[0].site_sponsor_id).toBe(SPONSOR_A_ID);
    });
  });

  // =========================================================================
  // Manual override
  // =========================================================================

  describe('manual override', () => {
    it('should NOT overwrite existing site_sponsor_id (manual override)', async () => {
      const manualId = 'manual-sponsor-uuid';
      const config = buildConfig({
        sponsors: [
          { name: 'Sponsor', path: 'videos/BOUCLE/video.mp4', site_sponsor_id: manualId },
        ],
      });

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.skipped).toBe(1);
      expect(result.resolved).toBe(0);
      expect(result.configuration.sponsors[0].site_sponsor_id).toBe(manualId);
      // Should NOT even call the bulk resolver for skipped videos
      expect(mockResolveBulk).not.toHaveBeenCalled();
    });

    it('should resolve unset videos while preserving manually set ones', async () => {
      const manualId = 'manual-sponsor-uuid';
      const config = buildConfig({
        sponsors: [
          { name: 'Manual', path: 'videos/BOUCLE/manual.mp4', site_sponsor_id: manualId },
          { name: 'Auto', path: 'videos/BOUCLE/auto.mp4' },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`auto.mp4::${SITE_ID}`, SPONSOR_A_ID],
      ]));

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.skipped).toBe(1);
      expect(result.resolved).toBe(1);
      expect(result.configuration.sponsors[0].site_sponsor_id).toBe(manualId);
      expect(result.configuration.sponsors[1].site_sponsor_id).toBe(SPONSOR_A_ID);
    });
  });

  // =========================================================================
  // Filename extraction
  // =========================================================================

  describe('filename extraction', () => {
    it('should extract bare filename from nested path', async () => {
      const config = buildConfig({
        sponsors: [
          { name: 'Deep Path', path: 'videos/BOUCLE/sub/deep/07_A_L_AFFUT.mp4' },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`07_A_L_AFFUT.mp4::${SITE_ID}`, SPONSOR_A_ID],
      ]));

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.resolved).toBe(1);
      expect(mockResolveBulk).toHaveBeenCalledWith([
        { videoFilename: '07_A_L_AFFUT.mp4', siteId: SITE_ID },
      ]);
    });

    it('should handle bare filename (no path separator)', async () => {
      const config = buildConfig({
        categories: [
          {
            id: 'cat',
            name: 'Cat',
            videos: [{ name: 'Video', path: 'bare_file.mp4' }],
          },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`bare_file.mp4::${SITE_ID}`, SPONSOR_A_ID],
      ]));

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.resolved).toBe(1);
      expect(mockResolveBulk).toHaveBeenCalledWith([
        { videoFilename: 'bare_file.mp4', siteId: SITE_ID },
      ]);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle empty config without crash', async () => {
      const config = buildConfig({ sponsors: [], categories: [], timeCategories: [] });

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.resolved).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.unresolved).toBe(0);
      expect(mockResolveBulk).not.toHaveBeenCalled();
    });

    it('should handle undefined timeCategories and categories', async () => {
      const config = buildConfig({
        sponsors: [{ name: 'V', path: 'video.mp4' }],
        timeCategories: undefined,
      });

      mockResolveBulk.mockResolvedValue(new Map());

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.unresolved).toBe(1);
    });

    it('should handle categories with no subCategories', async () => {
      const config = buildConfig({
        categories: [
          { id: 'c', name: 'C', videos: [{ name: 'V', path: 'v.mp4' }] },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map());

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.unresolved).toBe(1);
    });
  });

  // =========================================================================
  // Deep clone (no mutation)
  // =========================================================================

  describe('deep clone', () => {
    it('should NOT mutate the original configuration', async () => {
      const config = buildConfig({
        sponsors: [
          { name: 'Video', path: 'videos/BOUCLE/video.mp4' },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`video.mp4::${SITE_ID}`, SPONSOR_A_ID],
      ]));

      const result = await autoResolveSponsorIds(SITE_ID, config);

      // Original should be unmodified
      expect(config.sponsors[0].site_sponsor_id).toBeUndefined();
      // Clone should have the resolved ID
      expect(result.configuration.sponsors[0].site_sponsor_id).toBe(SPONSOR_A_ID);
    });
  });

  // =========================================================================
  // Bulk efficiency
  // =========================================================================

  describe('bulk efficiency', () => {
    it('should make exactly ONE DB call regardless of video count', async () => {
      const config = buildConfig({
        sponsors: [
          { name: 'V1', path: 'v1.mp4' },
          { name: 'V2', path: 'v2.mp4' },
        ],
        timeCategories: [
          { id: 'before', name: 'Before', loopVideos: [{ name: 'V3', path: 'v3.mp4' }] },
        ],
        categories: [
          { id: 'c', name: 'C', videos: [{ name: 'V4', path: 'v4.mp4' }] },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map());

      await autoResolveSponsorIds(SITE_ID, config);

      expect(mockResolveBulk).toHaveBeenCalledTimes(1);
      // Should contain all 4 videos in a single bulk call
      expect(mockResolveBulk).toHaveBeenCalledWith([
        { videoFilename: 'v1.mp4', siteId: SITE_ID },
        { videoFilename: 'v2.mp4', siteId: SITE_ID },
        { videoFilename: 'v3.mp4', siteId: SITE_ID },
        { videoFilename: 'v4.mp4', siteId: SITE_ID },
      ]);
    });

    it('should deduplicate same filename appearing in multiple locations', async () => {
      const config = buildConfig({
        sponsors: [
          { name: 'V1', path: 'videos/BOUCLE/video.mp4' },
        ],
        categories: [
          { id: 'c', name: 'C', videos: [{ name: 'V1', path: 'videos/CAT/video.mp4' }] },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`video.mp4::${SITE_ID}`, SPONSOR_A_ID],
      ]));

      const result = await autoResolveSponsorIds(SITE_ID, config);

      // Both should be resolved (same filename, same sponsor)
      expect(result.resolved).toBe(2);
      expect(result.configuration.sponsors[0].site_sponsor_id).toBe(SPONSOR_A_ID);
      expect(result.configuration.categories[0].videos[0].site_sponsor_id).toBe(SPONSOR_A_ID);
    });
  });

  // =========================================================================
  // Metrics
  // =========================================================================

  describe('metrics', () => {
    it('should record Prometheus metrics for resolved/skipped/unresolved', async () => {
      const config = buildConfig({
        sponsors: [
          { name: 'Manual', path: 'manual.mp4', site_sponsor_id: 'existing' },
          { name: 'Resolved', path: 'resolved.mp4' },
          { name: 'Unresolved', path: 'unresolved.mp4' },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`resolved.mp4::${SITE_ID}`, SPONSOR_A_ID],
      ]));

      await autoResolveSponsorIds(SITE_ID, config);

      expect(mockMetrics).toHaveBeenCalledWith('resolved', 1);
      expect(mockMetrics).toHaveBeenCalledWith('skipped', 1);
      expect(mockMetrics).toHaveBeenCalledWith('unresolved', 1);
    });

    it('should NOT record zero-count metrics', async () => {
      const config = buildConfig({ sponsors: [], categories: [] });

      await autoResolveSponsorIds(SITE_ID, config);

      expect(mockMetrics).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Cross-location resolution
  // =========================================================================

  describe('cross-location resolution', () => {
    it('should resolve across all config locations simultaneously', async () => {
      const config = buildConfig({
        sponsors: [
          { name: 'Loop Default', path: 'videos/BOUCLE/sponsor_a.mp4' },
        ],
        timeCategories: [
          {
            id: 'before',
            name: 'Avant-match',
            loopVideos: [
              { name: 'Phase Video', path: 'videos/BOUCLE/sponsor_b.mp4' },
            ],
          },
        ],
        categories: [
          {
            id: 'focus',
            name: 'FOCUS PARTENAIRES',
            videos: [
              { name: 'Cat Video', path: 'sponsor_c.mp4' },
            ],
            subCategories: [
              {
                id: 'sub',
                name: 'Sub',
                videos: [
                  { name: 'Sub Video', path: 'videos/SUB/sponsor_d.mp4' },
                ],
              },
            ],
          },
        ],
      });

      mockResolveBulk.mockResolvedValue(new Map([
        [`sponsor_a.mp4::${SITE_ID}`, 'uuid-a'],
        [`sponsor_b.mp4::${SITE_ID}`, 'uuid-b'],
        [`sponsor_c.mp4::${SITE_ID}`, 'uuid-c'],
        [`sponsor_d.mp4::${SITE_ID}`, 'uuid-d'],
      ]));

      const result = await autoResolveSponsorIds(SITE_ID, config);

      expect(result.resolved).toBe(4);
      expect(result.unresolved).toBe(0);
      expect(result.configuration.sponsors[0].site_sponsor_id).toBe('uuid-a');
      expect(result.configuration.timeCategories![0].loopVideos[0].site_sponsor_id).toBe('uuid-b');
      expect(result.configuration.categories[0].videos[0].site_sponsor_id).toBe('uuid-c');
      expect(result.configuration.categories[0].subCategories![0].videos[0].site_sponsor_id).toBe('uuid-d');
    });
  });
});
