/**
 * ADR-103 Phase 0.6 — sync-agent web-content-sync unit tests.
 *
 * Validates the pure helpers that merge cloud entries into the local
 * configuration.json + register the pseudo-category in timeCategories.
 */

jest.mock('../config', () => ({
  paths: { config: '/tmp/neopro-test/configuration.json' },
  logging: { path: '/tmp/neopro-test/logs/agent.log', level: 'silent' },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { _internal } = require('../services/web-content-sync');
const { mergeWebContent, registerWebContentInTimeCategories, WEB_CATEGORY_ID } = _internal;

describe('mergeWebContent', () => {
  it('returns categories unchanged when entries is empty and no prior pseudo-category', () => {
    const cats = [{ id: 'a', name: 'A', videos: [] }];
    expect(mergeWebContent(cats, [])).toEqual(cats);
  });

  it('strips a stale pseudo-category when entries is empty', () => {
    const cats = [
      { id: 'a', name: 'A', videos: [] },
      { id: WEB_CATEGORY_ID, name: 'Web / Live', videos: [{ name: 'old' }] },
    ];
    const out = mergeWebContent(cats, []);
    expect(out.find(c => c.id === WEB_CATEGORY_ID)).toBeUndefined();
    expect(out).toHaveLength(1);
  });

  it('appends a fresh pseudo-category when entries provided', () => {
    const cats = [{ id: 'a', name: 'A', videos: [] }];
    const entries = [
      { id: 'v1', name: 'My Page', contentType: 'web_page', externalUrl: 'https://example.com' },
    ];
    const out = mergeWebContent(cats, entries);
    const web = out.find(c => c.id === WEB_CATEGORY_ID);
    expect(web).toBeDefined();
    expect(web.videos).toHaveLength(1);
    expect(web.videos[0].path).toBe('https://example.com');
    expect(web.videos[0].contentType).toBe('web_page');
  });

  it('replaces existing pseudo-category atomically', () => {
    const cats = [
      { id: WEB_CATEGORY_ID, name: 'Web / Live', videos: [{ name: 'stale' }] },
    ];
    const out = mergeWebContent(cats, [
      { id: 'v2', name: 'New', contentType: 'livestream', externalUrl: 'https://live.example/x.m3u8' },
    ]);
    const web = out.find(c => c.id === WEB_CATEGORY_ID);
    expect(web.videos).toHaveLength(1);
    expect(web.videos[0].name).toBe('New');
  });
});

describe('registerWebContentInTimeCategories (ADR-103 Phase 0.6)', () => {
  it('returns [] for non-array input', () => {
    expect(registerWebContentInTimeCategories(undefined, true)).toEqual([]);
    expect(registerWebContentInTimeCategories(null, true)).toEqual([]);
  });

  it('adds web-content id to every timeCategory.categoryIds when hasWebContent', () => {
    const tcs = [
      { id: 'before', categoryIds: ['cat1'] },
      { id: 'during', categoryIds: ['cat1', 'cat2'] },
      { id: 'after', categoryIds: [] },
    ];
    const out = registerWebContentInTimeCategories(tcs, true);
    expect(out[0].categoryIds).toEqual(['cat1', WEB_CATEGORY_ID]);
    expect(out[1].categoryIds).toEqual(['cat1', 'cat2', WEB_CATEGORY_ID]);
    expect(out[2].categoryIds).toEqual([WEB_CATEGORY_ID]);
  });

  it('is idempotent — does not duplicate the id', () => {
    const tcs = [{ id: 'before', categoryIds: ['cat1', WEB_CATEGORY_ID] }];
    const out = registerWebContentInTimeCategories(tcs, true);
    expect(out[0].categoryIds).toEqual(['cat1', WEB_CATEGORY_ID]);
  });

  it('strips a stale id when hasWebContent is false', () => {
    const tcs = [
      { id: 'before', categoryIds: ['cat1', WEB_CATEGORY_ID] },
      { id: 'during', categoryIds: ['cat2'] },
    ];
    const out = registerWebContentInTimeCategories(tcs, false);
    expect(out[0].categoryIds).toEqual(['cat1']);
    expect(out[1].categoryIds).toEqual(['cat2']);
  });

  it('handles missing categoryIds array gracefully', () => {
    const tcs = [{ id: 'before' }];
    const out = registerWebContentInTimeCategories(tcs, true);
    expect(out[0].categoryIds).toEqual([WEB_CATEGORY_ID]);
  });
});
