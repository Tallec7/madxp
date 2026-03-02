import { SiteConfiguration } from '../types';

// Mock database query
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

// Mock logger
jest.mock('../config/logger', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  __esModule: true,
}));

import { enrichConfigWithAnalyticsMetadata } from './config-analytics-metadata';

// Helper to build partial configs
const cfg = (partial: Record<string, unknown>): SiteConfiguration =>
  partial as unknown as SiteConfiguration;

beforeEach(() => {
  mockQuery.mockReset();
});

describe('enrichConfigWithAnalyticsMetadata', () => {
  it('returns enrichedCount 0 for empty config', async () => {
    const config = cfg({});
    const result = await enrichConfigWithAnalyticsMetadata(config);
    expect(result.enrichedCount).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns enrichedCount 0 when no sponsors/categories/timeCategories', async () => {
    const config = cfg({ sponsors: [], categories: [], timeCategories: [] });
    const result = await enrichConfigWithAnalyticsMetadata(config);
    expect(result.enrichedCount).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('enriches sponsors[] with analytics metadata', async () => {
    const config = cfg({
      sponsors: [
        { name: 'Sponsor A', path: 'videos/SPONSORS/sponsor-a.mp4' },
        { name: 'Sponsor B', path: 'videos/SPONSORS/sponsor-b.mp4' },
      ],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        { video_id: 'vid-1', filename: 'sponsor-a.mp4', advertiser_id: 'adv-1', analytics_category: 'sponsor' },
        { video_id: 'vid-2', filename: 'sponsor-b.mp4', advertiser_id: 'adv-2', analytics_category: 'sponsor' },
      ],
    });

    const result = await enrichConfigWithAnalyticsMetadata(config);
    expect(result.enrichedCount).toBe(2);

    const sponsors = config.sponsors;
    expect(sponsors[0].video_id).toBe('vid-1');
    expect(sponsors[0].advertiser_id).toBe('adv-1');
    expect(sponsors[0].sponsor_id).toBe('adv-1');
    expect(sponsors[0].analytics_category).toBe('sponsor');

    expect(sponsors[1].video_id).toBe('vid-2');
    expect(sponsors[1].advertiser_id).toBe('adv-2');
    expect(sponsors[1].analytics_category).toBe('sponsor');
  });

  it('enriches categories[].videos[] with analytics metadata', async () => {
    const config = cfg({
      categories: [
        {
          id: 'cat-1',
          name: 'Match',
          videos: [
            { name: 'Essai', path: 'videos/MATCH/essai.mp4' },
          ],
        },
      ],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        { video_id: 'vid-3', filename: 'essai.mp4', advertiser_id: null, analytics_category: 'jingle' },
      ],
    });

    const result = await enrichConfigWithAnalyticsMetadata(config);
    expect(result.enrichedCount).toBe(1);

    const video = config.categories[0].videos[0];
    expect(video.video_id).toBe('vid-3');
    expect(video.analytics_category).toBe('jingle');
  });

  it('enriches categories[].subCategories[].videos[]', async () => {
    const config = cfg({
      categories: [
        {
          id: 'cat-1',
          name: 'Match',
          videos: [],
          subCategories: [
            {
              id: 'sub-1',
              name: 'Actions',
              videos: [
                { name: 'Penalty', path: 'videos/MATCH/penalty.mp4' },
              ],
            },
          ],
        },
      ],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        { video_id: 'vid-4', filename: 'penalty.mp4', advertiser_id: null, analytics_category: 'ambiance' },
      ],
    });

    const result = await enrichConfigWithAnalyticsMetadata(config);
    expect(result.enrichedCount).toBe(1);

    const video = config.categories[0].subCategories![0].videos[0];
    expect(video.video_id).toBe('vid-4');
    expect(video.analytics_category).toBe('ambiance');
  });

  it('enriches timeCategories[].loopVideos[]', async () => {
    const config = cfg({
      timeCategories: [
        {
          id: 'tc-1',
          name: 'Mi-temps',
          loopVideos: [
            { name: 'Ad 1', path: 'videos/SPONSORS/ad1.mp4' },
          ],
        },
      ],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        { video_id: 'vid-5', filename: 'ad1.mp4', advertiser_id: 'adv-3', analytics_category: 'sponsor' },
      ],
    });

    const result = await enrichConfigWithAnalyticsMetadata(config);
    expect(result.enrichedCount).toBe(1);

    const video = config.timeCategories![0].loopVideos[0];
    expect(video.video_id).toBe('vid-5');
    expect(video.advertiser_id).toBe('adv-3');
    expect(video.analytics_category).toBe('sponsor');
  });

  it('handles videos not found in DB (no error, just skips)', async () => {
    const config = cfg({
      sponsors: [
        { name: 'Unknown', path: 'videos/SPONSORS/unknown.mp4' },
      ],
    });

    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await enrichConfigWithAnalyticsMetadata(config);
    expect(result.enrichedCount).toBe(0);

    // Fields should remain undefined
    expect(config.sponsors[0].video_id).toBeUndefined();
    expect(config.sponsors[0].analytics_category).toBeUndefined();
  });

  it('deduplicates filenames across different config sections', async () => {
    const config = cfg({
      sponsors: [
        { name: 'Shared', path: 'videos/SPONSORS/shared.mp4' },
      ],
      timeCategories: [
        {
          id: 'tc-1',
          name: 'Phase',
          loopVideos: [
            { name: 'Shared too', path: 'videos/TC/shared.mp4' },
          ],
        },
      ],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        { video_id: 'vid-6', filename: 'shared.mp4', advertiser_id: 'adv-4', analytics_category: 'sponsor' },
      ],
    });

    const result = await enrichConfigWithAnalyticsMetadata(config);
    // Both entries share the same filename, both get enriched
    expect(result.enrichedCount).toBe(2);
    expect(config.sponsors[0].video_id).toBe('vid-6');
    expect(config.timeCategories![0].loopVideos[0].video_id).toBe('vid-6');

    // Single query with deduplicated filenames
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const queryFilenames = mockQuery.mock.calls[0][1][0];
    expect(queryFilenames).toEqual(['shared.mp4']);
  });

  it('handles null advertiser_id gracefully (non-sponsor video)', async () => {
    const config = cfg({
      sponsors: [
        { name: 'Club video', path: 'videos/SPONSORS/club.mp4' },
      ],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        { video_id: 'vid-7', filename: 'club.mp4', advertiser_id: null, analytics_category: null },
      ],
    });

    const result = await enrichConfigWithAnalyticsMetadata(config);
    expect(result.enrichedCount).toBe(1);
    expect(config.sponsors[0].video_id).toBe('vid-7');
    expect(config.sponsors[0].advertiser_id).toBeUndefined();
    expect(config.sponsors[0].analytics_category).toBeUndefined();
  });
});
