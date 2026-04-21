/**
 * Tests for filename-resolver utility (ADR-083)
 *
 * Validates buildFuzzyIndex() and resolveStoragePath() without HTTP wiring.
 */

import { buildFuzzyIndex, resolveStoragePath } from '../utils/filename-resolver';

describe('buildFuzzyIndex()', () => {
  it('returns empty map for empty input', () => {
    const result = buildFuzzyIndex(new Map());
    expect(result.size).toBe(0);
  });

  it('builds index with normalized keys', () => {
    // "03 GROUPAMA.mp4" → lowercase + spaces/dots→_ → "03_groupama_mp4"
    const map = new Map([['03 GROUPAMA.mp4', 'videos/default/03_GROUPAMA.mp4']]);
    const fuzzy = buildFuzzyIndex(map);
    expect(fuzzy.size).toBe(1);
    expect(fuzzy.has('03_groupama_mp4')).toBe(true);
  });

  it('keeps first entry on normalized key collision', () => {
    // Both "Foo Bar.mp4" and "foo bar.mp4" normalize to "foo_bar_mp4"
    const map = new Map([
      ['Foo Bar.mp4', 'path/to/foo_bar.mp4'],
      ['foo bar.mp4', 'path/to/other_foo_bar.mp4'],
    ]);
    const fuzzy = buildFuzzyIndex(map);
    expect(fuzzy.get('foo_bar_mp4')).toBe('path/to/foo_bar.mp4');
  });

  it('handles multiple distinct entries', () => {
    const map = new Map([
      ['video_a.mp4', 'path/a.mp4'],
      ['video_b.mp4', 'path/b.mp4'],
    ]);
    const fuzzy = buildFuzzyIndex(map);
    expect(fuzzy.size).toBe(2);
  });
});

describe('resolveStoragePath()', () => {
  const storageMap = new Map([
    ['03_GROUPAMA.mp4', 'videos/default/03_GROUPAMA.mp4'],
    ['exact_match.mp4', 'videos/default/exact_match.mp4'],
  ]);
  const fuzzyIndex = buildFuzzyIndex(storageMap);

  it('returns exact match when filename exists in storagePathMap', () => {
    const outcome = resolveStoragePath('exact_match.mp4', storageMap, fuzzyIndex);
    expect(outcome.result).toBe('exact');
    expect(outcome.storagePath).toBe('videos/default/exact_match.mp4');
  });

  it('returns fuzzy match for normalized filename variant', () => {
    // "03 GROUPAMA.mp4" normalizes to "03_groupama_mp4" which matches stored "03_GROUPAMA.mp4"
    const outcome = resolveStoragePath('03 GROUPAMA.mp4', storageMap, fuzzyIndex);
    expect(outcome.result).toBe('fuzzy');
    expect(outcome.storagePath).toBe('videos/default/03_GROUPAMA.mp4');
  });

  it('returns miss when filename has no match at all', () => {
    const outcome = resolveStoragePath('unknown_video.mp4', storageMap, fuzzyIndex);
    expect(outcome.result).toBe('miss');
    expect(outcome.storagePath).toBe('unknown_video.mp4');
  });

  it('miss returns raw filename as storagePath fallback', () => {
    const filename = 'videos/default/some_legacy_path.mp4';
    const outcome = resolveStoragePath(filename, new Map(), new Map());
    expect(outcome.storagePath).toBe(filename);
  });

  it('exact lookup takes priority over fuzzy', () => {
    // If "foo.mp4" is both in storageMap and fuzzyIndex, exact wins
    const map = new Map([['foo.mp4', 'exact/foo.mp4']]);
    const fuzzy = new Map([['foo.mp4', 'fuzzy/foo.mp4']]);
    const outcome = resolveStoragePath('foo.mp4', map, fuzzy);
    expect(outcome.result).toBe('exact');
    expect(outcome.storagePath).toBe('exact/foo.mp4');
  });
});
