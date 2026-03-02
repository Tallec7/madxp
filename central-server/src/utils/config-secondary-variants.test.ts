/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { SiteConfiguration } from '../types';

// Mock repository
const mockFindSecondaryVariantsByFilenames = jest.fn();
jest.mock('../repositories/video-variant.repository', () => ({
  videoVariantRepository: {
    findSecondaryVariantsByFilenames: (...args: unknown[]) =>
      mockFindSecondaryVariantsByFilenames(...args),
  },
}));

// Mock logger
jest.mock('../config/logger', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  __esModule: true,
}));

import { enrichConfigWithSecondaryVariants } from './config-secondary-variants';

const cfg = (partial: Record<string, unknown>): SiteConfiguration =>
  partial as unknown as SiteConfiguration;

beforeEach(() => {
  mockFindSecondaryVariantsByFilenames.mockReset();
});

describe('enrichConfigWithSecondaryVariants', () => {
  it('returns enrichedCount 0 for empty config', async () => {
    const config = cfg({});
    const result = await enrichConfigWithSecondaryVariants(config);
    expect(result.enrichedCount).toBe(0);
    expect(mockFindSecondaryVariantsByFilenames).not.toHaveBeenCalled();
  });

  it('returns enrichedCount 0 when arrays are empty', async () => {
    const config = cfg({ sponsors: [], categories: [], timeCategories: [] });
    const result = await enrichConfigWithSecondaryVariants(config);
    expect(result.enrichedCount).toBe(0);
    expect(mockFindSecondaryVariantsByFilenames).not.toHaveBeenCalled();
  });

  it('enriches sponsors[] with secondary variants', async () => {
    const config = cfg({
      sponsors: [
        { name: 'A', path: 'videos/SPONSORS/sponsor-a.mp4' },
        { name: 'B', path: 'videos/SPONSORS/sponsor-b.mp4' },
      ],
    });

    mockFindSecondaryVariantsByFilenames.mockResolvedValueOnce([
      { filename: 'sponsor-a-sec.mp4', source_filename: 'sponsor-a.mp4', width: 1080, height: 1920, duration: 15 },
      { filename: 'sponsor-b-sec.mp4', source_filename: 'sponsor-b.mp4', width: 1080, height: 1920, duration: null },
    ]);

    const result = await enrichConfigWithSecondaryVariants(config);
    expect(result.enrichedCount).toBe(2);
    expect(config.sponsors![0].variants).toEqual({
      secondary: { path: 'videos-secondary/sponsor-a-sec.mp4', filename: 'sponsor-a-sec.mp4', width: 1080, height: 1920, duration: 15 },
    });
    expect(config.sponsors![1].variants).toEqual({
      secondary: { path: 'videos-secondary/sponsor-b-sec.mp4', filename: 'sponsor-b-sec.mp4', width: 1080, height: 1920, duration: undefined },
    });
  });

  it('enriches categories[].videos[] with secondary variants', async () => {
    const config = cfg({
      categories: [
        { name: 'Cat1', videos: [{ path: 'videos/CAT/vid1.mp4' }] },
      ],
    });

    mockFindSecondaryVariantsByFilenames.mockResolvedValueOnce([
      { filename: 'vid1-sec.mp4', source_filename: 'vid1.mp4', width: null, height: null, duration: null },
    ]);

    const result = await enrichConfigWithSecondaryVariants(config);
    expect(result.enrichedCount).toBe(1);
    expect(config.categories![0].videos[0].variants).toEqual({
      secondary: { path: 'videos-secondary/vid1-sec.mp4', filename: 'vid1-sec.mp4', width: undefined, height: undefined, duration: undefined },
    });
  });

  it('enriches categories[].subCategories[].videos[]', async () => {
    const config = cfg({
      categories: [
        {
          name: 'Cat1',
          videos: [],
          subCategories: [
            { name: 'Sub1', videos: [{ path: 'videos/SUB/sub1.mp4' }] },
          ],
        },
      ],
    });

    mockFindSecondaryVariantsByFilenames.mockResolvedValueOnce([
      { filename: 'sub1-sec.mp4', source_filename: 'sub1.mp4', width: 720, height: 1280, duration: 30 },
    ]);

    const result = await enrichConfigWithSecondaryVariants(config);
    expect(result.enrichedCount).toBe(1);
    expect(config.categories![0].subCategories![0].videos[0].variants).toEqual({
      secondary: { path: 'videos-secondary/sub1-sec.mp4', filename: 'sub1-sec.mp4', width: 720, height: 1280, duration: 30 },
    });
  });

  it('enriches timeCategories[].loopVideos[]', async () => {
    const config = cfg({
      timeCategories: [
        { name: 'HalfTime', loopVideos: [{ path: 'videos/TC/tc1.mp4' }] },
      ],
    });

    mockFindSecondaryVariantsByFilenames.mockResolvedValueOnce([
      { filename: 'tc1-sec.mp4', source_filename: 'tc1.mp4', width: 1080, height: 1920, duration: 10 },
    ]);

    const result = await enrichConfigWithSecondaryVariants(config);
    expect(result.enrichedCount).toBe(1);
    expect(config.timeCategories![0].loopVideos![0].variants).toEqual({
      secondary: { path: 'videos-secondary/tc1-sec.mp4', filename: 'tc1-sec.mp4', width: 1080, height: 1920, duration: 10 },
    });
  });

  it('returns enrichedCount 0 when DB returns no variants', async () => {
    const config = cfg({
      sponsors: [{ name: 'A', path: 'videos/SPONSORS/sponsor-a.mp4' }],
    });

    mockFindSecondaryVariantsByFilenames.mockResolvedValueOnce([]);

    const result = await enrichConfigWithSecondaryVariants(config);
    expect(result.enrichedCount).toBe(0);
    expect(config.sponsors![0].variants).toBeUndefined();
  });

  it('skips entries without path', async () => {
    const config = cfg({
      sponsors: [
        { name: 'A', path: '' },
        { name: 'B' },
      ],
    });

    const result = await enrichConfigWithSecondaryVariants(config);
    expect(result.enrichedCount).toBe(0);
    expect(mockFindSecondaryVariantsByFilenames).not.toHaveBeenCalled();
  });

  it('handles mixed sections in a single config', async () => {
    const config = cfg({
      sponsors: [{ name: 'S1', path: 'videos/SPONSORS/s1.mp4' }],
      categories: [{ name: 'C1', videos: [{ path: 'videos/CAT/c1.mp4' }] }],
      timeCategories: [{ name: 'TC', loopVideos: [{ path: 'videos/TC/tc1.mp4' }] }],
    });

    mockFindSecondaryVariantsByFilenames.mockResolvedValueOnce([
      { filename: 's1-sec.mp4', source_filename: 's1.mp4', width: 1080, height: 1920, duration: 15 },
      { filename: 'c1-sec.mp4', source_filename: 'c1.mp4', width: 1080, height: 1920, duration: 20 },
      // tc1 has no variant
    ]);

    const result = await enrichConfigWithSecondaryVariants(config);
    expect(result.enrichedCount).toBe(2);
    expect(mockFindSecondaryVariantsByFilenames).toHaveBeenCalledWith(['s1.mp4', 'c1.mp4', 'tc1.mp4']);
  });
});
