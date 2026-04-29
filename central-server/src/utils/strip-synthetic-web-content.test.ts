/**
 * Unit tests for the synthetic web_page / livestream helpers (ADR-103
 * Phase 0.5 + Phase 2). Covers:
 *   - isSyntheticWebContentPath
 *   - collectSyntheticWebContentFilenames
 *   - resolveSyntheticWebContent (rewrites entries in-place from a lookup)
 *   - stripSyntheticWebContent (strips leftovers — Phase 0.5 safety net)
 */

import {
  isSyntheticWebContentPath,
  collectSyntheticWebContentFilenames,
  resolveSyntheticWebContent,
  stripSyntheticWebContent,
} from './strip-synthetic-web-content';

describe('isSyntheticWebContentPath', () => {
  it('matches bare synthetic filenames', () => {
    expect(isSyntheticWebContentPath('web_page-1777392352039')).toBe(true);
    expect(isSyntheticWebContentPath('livestream-1777392352039')).toBe(true);
  });

  it('matches synthetic filenames inside a folder path', () => {
    expect(isSyntheticWebContentPath('videos/default/web_page-1234')).toBe(true);
    expect(isSyntheticWebContentPath('videos/livestream-99')).toBe(true);
  });

  it('rejects normal storage paths', () => {
    expect(isSyntheticWebContentPath('videos/ab/cd-uuid.mp4')).toBe(false);
    expect(isSyntheticWebContentPath('videos/default/01_NEOPRO.mp4')).toBe(false);
  });

  it('rejects http(s) URLs (the resolved form)', () => {
    expect(isSyntheticWebContentPath('https://example.com/page')).toBe(false);
    expect(isSyntheticWebContentPath('http://example.com')).toBe(false);
  });

  it('rejects non-string + empty', () => {
    expect(isSyntheticWebContentPath(undefined)).toBe(false);
    expect(isSyntheticWebContentPath(null)).toBe(false);
    expect(isSyntheticWebContentPath('')).toBe(false);
    expect(isSyntheticWebContentPath(42)).toBe(false);
  });

  it('rejects similar-looking but invalid forms', () => {
    expect(isSyntheticWebContentPath('web_page-')).toBe(false);
    expect(isSyntheticWebContentPath('web_page-abc')).toBe(false);
    expect(isSyntheticWebContentPath('webpage-123')).toBe(false);
    expect(isSyntheticWebContentPath('web_page-123-trailing')).toBe(false);
  });
});

describe('collectSyntheticWebContentFilenames', () => {
  it('collects from sponsors[]', () => {
    const config = {
      sponsors: [
        { path: 'web_page-1' },
        { path: 'videos/x.mp4' },
        { path: 'livestream-2' },
      ],
    };
    const out = collectSyntheticWebContentFilenames(config).sort();
    expect(out).toEqual(['livestream-2', 'web_page-1']);
  });

  it('collects from timeCategories[].loopVideos[]', () => {
    const config = {
      timeCategories: [
        { id: 'before', loopVideos: [{ path: 'videos/default/web_page-3' }] },
        { id: 'after', loopVideos: [{ path: 'videos/y.mp4' }, { path: 'livestream-4' }] },
      ],
    };
    const out = collectSyntheticWebContentFilenames(config).sort();
    expect(out).toEqual(['livestream-4', 'web_page-3']);
  });

  it('collects from categories[].videos[] and recursive subCategories', () => {
    const config = {
      categories: [
        {
          id: 'cat1',
          videos: [{ path: 'web_page-5' }],
          subCategories: [
            { id: 'sub1', videos: [{ path: 'livestream-6' }, { path: 'videos/z.mp4' }] },
          ],
        },
      ],
    };
    const out = collectSyntheticWebContentFilenames(config).sort();
    expect(out).toEqual(['livestream-6', 'web_page-5']);
  });

  it('dedupes filenames across config sections', () => {
    const config = {
      sponsors: [{ path: 'web_page-7' }],
      timeCategories: [{ loopVideos: [{ path: 'web_page-7' }] }],
      categories: [{ videos: [{ path: 'web_page-7' }] }],
    };
    expect(collectSyntheticWebContentFilenames(config)).toEqual(['web_page-7']);
  });

  it('returns [] on empty / malformed configs', () => {
    expect(collectSyntheticWebContentFilenames({})).toEqual([]);
    expect(collectSyntheticWebContentFilenames({ sponsors: 'oops' as unknown })).toEqual([]);
    expect(collectSyntheticWebContentFilenames({ timeCategories: null as unknown })).toEqual([]);
  });
});

describe('resolveSyntheticWebContent', () => {
  const lookup = new Map<string, {
    contentType: 'web_page' | 'livestream';
    externalUrl: string;
    durationSeconds: number | null;
    name: string;
    thumbnailUrl: string | null;
  }>([
    ['web_page-1', {
      contentType: 'web_page',
      externalUrl: 'https://example.com/page',
      durationSeconds: 30,
      name: 'My Page',
      thumbnailUrl: 'https://cdn/thumb.png',
    }],
    ['livestream-2', {
      contentType: 'livestream',
      externalUrl: 'https://example.com/live.m3u8',
      durationSeconds: null,
      name: 'My Live',
      thumbnailUrl: null,
    }],
  ]);

  it('rewrites a sponsor entry in-place with proper fields', () => {
    const config = { sponsors: [{ path: 'web_page-1', name: 'kept-name', weight: 5 }] };
    const summary = resolveSyntheticWebContent(config, lookup);
    expect(summary.sponsorsResolved).toBe(1);
    const out = (config.sponsors as Array<Record<string, unknown>>)[0];
    expect(out.path).toBe('https://example.com/page');
    expect(out.contentType).toBe('web_page');
    expect(out.externalUrl).toBe('https://example.com/page');
    expect(out.durationSeconds).toBe(30);
    // Name kept from original entry (do not overwrite a user-set label)
    expect(out.name).toBe('kept-name');
    // Weight + other fields preserved
    expect(out.weight).toBe(5);
    expect(out.type).toBe('text/html');
    expect(out.thumbnailUrl).toBe('https://cdn/thumb.png');
  });

  it('uses row name when entry has none', () => {
    const config = { sponsors: [{ path: 'web_page-1' }] };
    resolveSyntheticWebContent(config, lookup);
    expect((config.sponsors as Array<Record<string, unknown>>)[0].name).toBe('My Page');
  });

  it('rewrites livestream with the proper MIME type', () => {
    const config = { sponsors: [{ path: 'livestream-2' }] };
    resolveSyntheticWebContent(config, lookup);
    const out = (config.sponsors as Array<Record<string, unknown>>)[0];
    expect(out.type).toBe('application/vnd.apple.mpegurl');
    expect(out.contentType).toBe('livestream');
  });

  it('rewrites entries inside timeCategories[].loopVideos[]', () => {
    const config = {
      timeCategories: [
        { id: 'before', loopVideos: [{ path: 'web_page-1' }, { path: 'videos/x.mp4' }] },
      ],
    };
    const summary = resolveSyntheticWebContent(config, lookup);
    expect(summary.loopVideosResolved).toBe(1);
    const tc = (config.timeCategories as Array<{ loopVideos: Array<{ path: string }> }>)[0];
    expect(tc.loopVideos[0].path).toBe('https://example.com/page');
    expect(tc.loopVideos[1].path).toBe('videos/x.mp4');
  });

  it('rewrites entries inside categories[].videos[] and recursive subCategories', () => {
    const config = {
      categories: [
        {
          id: 'cat1',
          videos: [{ path: 'web_page-1' }],
          subCategories: [{ id: 'sub1', videos: [{ path: 'livestream-2' }] }],
        },
      ],
    };
    const summary = resolveSyntheticWebContent(config, lookup);
    expect(summary.categoryVideosResolved).toBe(2);
    const cat = (config.categories as Array<{ videos: Array<{ path: string }>; subCategories: Array<{ videos: Array<{ path: string }> }> }>)[0];
    expect(cat.videos[0].path).toBe('https://example.com/page');
    expect(cat.subCategories[0].videos[0].path).toBe('https://example.com/live.m3u8');
  });

  it('leaves untouched entries whose synthetic filename is NOT in the lookup', () => {
    const config = { sponsors: [{ path: 'web_page-deleted' }] };
    const summary = resolveSyntheticWebContent(config, lookup);
    expect(summary.sponsorsResolved).toBe(0);
    expect((config.sponsors as Array<Record<string, unknown>>)[0].path).toBe('web_page-deleted');
  });

  it('is a no-op when lookup is empty', () => {
    const config = { sponsors: [{ path: 'web_page-1' }] };
    const summary = resolveSyntheticWebContent(config, new Map());
    expect(summary.sponsorsResolved).toBe(0);
    expect((config.sponsors as Array<Record<string, unknown>>)[0].path).toBe('web_page-1');
  });
});

describe('stripSyntheticWebContent', () => {
  it('drops synthetic entries from sponsors[]', () => {
    const config = {
      sponsors: [
        { path: 'web_page-1' },
        { path: 'videos/x.mp4' },
      ],
    };
    const summary = stripSyntheticWebContent(config);
    expect(summary.sponsorsRemoved).toBe(1);
    expect(config.sponsors).toHaveLength(1);
    expect((config.sponsors as Array<Record<string, unknown>>)[0].path).toBe('videos/x.mp4');
  });

  it('drops synthetic entries from timeCategories[].loopVideos[]', () => {
    const config = {
      timeCategories: [
        { id: 'before', loopVideos: [{ path: 'web_page-1' }, { path: 'videos/y.mp4' }] },
      ],
    };
    const summary = stripSyntheticWebContent(config);
    expect(summary.loopVideosRemoved).toBe(1);
    const tc = (config.timeCategories as Array<{ loopVideos: Array<unknown> }>)[0];
    expect(tc.loopVideos).toHaveLength(1);
  });

  it('drops synthetic entries from categories.videos and subCategories', () => {
    const config = {
      categories: [
        {
          id: 'cat1',
          videos: [{ path: 'web_page-1' }],
          subCategories: [{ id: 'sub1', videos: [{ path: 'livestream-2' }, { path: 'videos/z.mp4' }] }],
        },
      ],
    };
    const summary = stripSyntheticWebContent(config);
    expect(summary.categoryVideosRemoved).toBe(2);
    const cat = (config.categories as Array<{ videos: Array<unknown>; subCategories: Array<{ videos: Array<unknown> }> }>)[0];
    expect(cat.videos).toHaveLength(0);
    expect(cat.subCategories[0].videos).toHaveLength(1);
  });

  it('is a no-op on a clean config', () => {
    const config = { sponsors: [{ path: 'videos/x.mp4' }] };
    const summary = stripSyntheticWebContent(config);
    expect(summary.sponsorsRemoved + summary.loopVideosRemoved + summary.categoryVideosRemoved).toBe(0);
    expect((config.sponsors as Array<Record<string, unknown>>)[0].path).toBe('videos/x.mp4');
  });
});
