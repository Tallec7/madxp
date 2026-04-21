import { buildFuzzyIndex, resolveStoragePath } from './filename-resolver';

describe('filename-resolver (ADR-083)', () => {
  const dbMap = new Map<string, string>([
    ['03_GROUPAMA.mp4', 'videos/61/61ddb802.mp4'],
    ['04_INTERMARCHE.mp4', 'videos/38/38ecf8cc.mp4'],
    ['ecran.mp4', 'videos/aa/aaaaaaaa.mp4'],
    ['intro.mp4', 'videos/bb/bbbbbbbb.mp4'],
  ]);

  describe('buildFuzzyIndex', () => {
    it('maps normalized keys to storage paths', () => {
      const idx = buildFuzzyIndex(dbMap);
      expect(idx.get('03_groupama_mp4')).toBe('videos/61/61ddb802.mp4');
      expect(idx.get('04_intermarche_mp4')).toBe('videos/38/38ecf8cc.mp4');
    });

    it('keeps first entry on collision', () => {
      const colliding = new Map<string, string>([
        ['Intro.mp4', 'first.mp4'],
        ['intro.mp4', 'second.mp4'], // normalizes to same key
      ]);
      const idx = buildFuzzyIndex(colliding);
      expect(idx.get('intro_mp4')).toBe('first.mp4');
    });
  });

  describe('resolveStoragePath', () => {
    const fuzzyIdx = buildFuzzyIndex(dbMap);

    it('returns exact match when filename is in storagePathMap', () => {
      expect(resolveStoragePath('03_GROUPAMA.mp4', dbMap, fuzzyIdx)).toEqual({
        storagePath: 'videos/61/61ddb802.mp4',
        result: 'exact',
      });
    });

    it('falls back to fuzzy match for legacy space variants', () => {
      expect(resolveStoragePath('03 GROUPAMA.mp4', dbMap, fuzzyIdx)).toEqual({
        storagePath: 'videos/61/61ddb802.mp4',
        result: 'fuzzy',
      });
    });

    it('falls back to fuzzy match for casing differences', () => {
      expect(resolveStoragePath('03_groupama.mp4', dbMap, fuzzyIdx)).toEqual({
        storagePath: 'videos/61/61ddb802.mp4',
        result: 'fuzzy',
      });
    });

    it('falls back to fuzzy match for accent variants', () => {
      expect(resolveStoragePath('Écran.mp4', dbMap, fuzzyIdx)).toEqual({
        storagePath: 'videos/aa/aaaaaaaa.mp4',
        result: 'fuzzy',
      });
    });

    it('falls back to fuzzy match for hyphen and dot separators', () => {
      expect(resolveStoragePath('04-intermarche.mp4', dbMap, fuzzyIdx).result).toBe('fuzzy');
      expect(resolveStoragePath('04.INTERMARCHE.MP4', dbMap, fuzzyIdx).result).toBe('fuzzy');
    });

    it('returns miss + raw filename when no match exists', () => {
      expect(resolveStoragePath('unknown.mp4', dbMap, fuzzyIdx)).toEqual({
        storagePath: 'unknown.mp4',
        result: 'miss',
      });
    });

    it('preserves exact precedence over fuzzy', () => {
      const mapWithBoth = new Map<string, string>([
        ['video.mp4', 'exact-path.mp4'],
        ['Video.MP4', 'fuzzy-path.mp4'],
      ]);
      const idx = buildFuzzyIndex(mapWithBoth);
      expect(resolveStoragePath('video.mp4', mapWithBoth, idx)).toEqual({
        storagePath: 'exact-path.mp4',
        result: 'exact',
      });
    });
  });
});
