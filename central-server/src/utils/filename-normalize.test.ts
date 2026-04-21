import { normalizeFilename } from './filename-normalize';

describe('normalizeFilename (ADR-083)', () => {
  const canonical = '03_groupama_mp4';

  it.each([
    ['03_GROUPAMA.mp4'],
    ['03 GROUPAMA.mp4'],
    ['03-groupama.mp4'],
    ['03.GROUPAMA.mp4'],
    ['03__GROUPAMA.mp4'],
    ['03 - GROUPAMA.mp4'],
    ['03_Groupama.mp4'],
    ['03_groupama.mp4'],
  ])('collapses legacy drift variants → canonical (%s)', (input) => {
    expect(normalizeFilename(input)).toBe(canonical);
  });

  it('strips accents so écran matches ecran', () => {
    expect(normalizeFilename('Écran.MP4')).toBe(normalizeFilename('ecran.mp4'));
  });

  it('is idempotent on already-normalized filenames', () => {
    const once = normalizeFilename('video_intro.mp4');
    expect(normalizeFilename(once)).toBe(once);
  });

  it('does not collapse distinct filenames', () => {
    expect(normalizeFilename('01_intro.mp4')).not.toBe(normalizeFilename('02_intro.mp4'));
  });
});
