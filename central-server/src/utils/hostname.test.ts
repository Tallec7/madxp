import { deriveHostnameSlug, deriveHostnameWithSuffix } from './hostname';

describe('hostname utils', () => {
  describe('deriveHostnameSlug', () => {
    it('converts simple club name to hostname', () => {
      expect(deriveHostnameSlug('USAP')).toBe('neopro-usap');
    });

    it('handles spaces', () => {
      expect(deriveHostnameSlug('Racing 92')).toBe('neopro-racing-92');
      expect(deriveHostnameSlug('Stade Toulousain')).toBe('neopro-stade-toulousain');
    });

    it('strips accents', () => {
      expect(deriveHostnameSlug('Béziers')).toBe('neopro-beziers');
      expect(deriveHostnameSlug('Montpellier Hérault')).toBe('neopro-montpellier-herault');
      expect(deriveHostnameSlug('AS Saint-Étienne')).toBe('neopro-as-saint-etienne');
    });

    it('handles special characters', () => {
      expect(deriveHostnameSlug("Club de l'Étoile")).toBe('neopro-club-de-l-etoile');
      expect(deriveHostnameSlug('FC Nantes & Co.')).toBe('neopro-fc-nantes-co');
    });

    it('collapses consecutive hyphens', () => {
      expect(deriveHostnameSlug('Club   Multiple   Spaces')).toBe('neopro-club-multiple-spaces');
      expect(deriveHostnameSlug('A---B')).toBe('neopro-a-b');
    });

    it('trims leading and trailing hyphens from slug part', () => {
      expect(deriveHostnameSlug('-Leading')).toBe('neopro-leading');
      expect(deriveHostnameSlug('Trailing-')).toBe('neopro-trailing');
      expect(deriveHostnameSlug('---Both---')).toBe('neopro-both');
    });

    it('enforces 63 char max', () => {
      const longName = 'A'.repeat(100);
      const result = deriveHostnameSlug(longName);
      expect(result.length).toBeLessThanOrEqual(63);
      expect(result).toBe('neopro-' + 'a'.repeat(56));
    });

    it('handles empty string', () => {
      expect(deriveHostnameSlug('')).toBe('neopro-club');
    });

    it('handles whitespace only', () => {
      expect(deriveHostnameSlug('   ')).toBe('neopro-club');
    });

    it('handles purely special characters', () => {
      expect(deriveHostnameSlug('!!@@##')).toBe('neopro-club');
    });

    it('handles numbers', () => {
      expect(deriveHostnameSlug('Club 13')).toBe('neopro-club-13');
      expect(deriveHostnameSlug('42')).toBe('neopro-42');
    });

    it('handles real French club names', () => {
      expect(deriveHostnameSlug('NLF Paris')).toBe('neopro-nlf-paris');
      expect(deriveHostnameSlug('Rugby Club Massy')).toBe('neopro-rugby-club-massy');
      expect(deriveHostnameSlug('Section Paloise')).toBe('neopro-section-paloise');
      expect(deriveHostnameSlug('CA Brive')).toBe('neopro-ca-brive');
    });
  });

  describe('deriveHostnameWithSuffix', () => {
    it('returns base when no collision', () => {
      expect(deriveHostnameWithSuffix('neopro-usap', [])).toBe('neopro-usap');
      expect(deriveHostnameWithSuffix('neopro-usap', ['neopro-racing'])).toBe('neopro-usap');
    });

    it('appends -2 on first collision', () => {
      expect(deriveHostnameWithSuffix('neopro-usap', ['neopro-usap'])).toBe('neopro-usap-2');
    });

    it('increments suffix on multiple collisions', () => {
      expect(
        deriveHostnameWithSuffix('neopro-usap', ['neopro-usap', 'neopro-usap-2']),
      ).toBe('neopro-usap-3');
    });

    it('finds gap in suffixes', () => {
      expect(
        deriveHostnameWithSuffix('neopro-usap', ['neopro-usap', 'neopro-usap-2', 'neopro-usap-3']),
      ).toBe('neopro-usap-4');
    });

    it('handles length overflow by trimming base', () => {
      const longBase = 'neopro-' + 'a'.repeat(56); // exactly 63 chars
      const result = deriveHostnameWithSuffix(longBase, [longBase]);
      expect(result.length).toBeLessThanOrEqual(63);
      expect(result).toMatch(/-2$/);
    });
  });
});
