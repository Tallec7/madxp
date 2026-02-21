import { extractVideoPaths, extractFilenameFromPath } from './config-video-paths';
import { SiteConfiguration } from '../types';

// Helper to build partial configs without TS strict complaints
const cfg = (partial: Record<string, unknown>): SiteConfiguration =>
  partial as unknown as SiteConfiguration;

describe('config-video-paths', () => {
  describe('extractVideoPaths', () => {
    it('returns empty array for config with no videos', () => {
      expect(extractVideoPaths(cfg({}))).toEqual([]);
    });

    it('extracts sponsor paths', () => {
      const config = cfg({
        sponsors: [
          { path: 'videos/SPONSORS/sponsor1.mp4' },
          { path: 'videos/SPONSORS/sponsor2.mp4' },
        ],
      });
      expect(extractVideoPaths(config)).toEqual([
        'videos/SPONSORS/sponsor1.mp4',
        'videos/SPONSORS/sponsor2.mp4',
      ]);
    });

    it('extracts category video paths', () => {
      const config = cfg({
        categories: [
          {
            videos: [
              { path: 'videos/MATCH/essai.mp4' },
              { path: 'videos/MATCH/penalty.mp4' },
            ],
          },
        ],
      });
      expect(extractVideoPaths(config)).toEqual([
        'videos/MATCH/essai.mp4',
        'videos/MATCH/penalty.mp4',
      ]);
    });

    it('extracts subcategory video paths', () => {
      const config = cfg({
        categories: [
          {
            videos: [],
            subCategories: [
              {
                videos: [
                  { path: 'videos/MATCH/BUT/joueur01.mp4' },
                  { path: 'videos/MATCH/BUT/joueur02.mp4' },
                ],
              },
            ],
          },
        ],
      });
      expect(extractVideoPaths(config)).toEqual([
        'videos/MATCH/BUT/joueur01.mp4',
        'videos/MATCH/BUT/joueur02.mp4',
      ]);
    });

    it('extracts timeCategory loopVideos paths', () => {
      const config = cfg({
        timeCategories: [
          {
            loopVideos: [
              { path: 'videos/PHASES/avant-match.mp4' },
              { path: 'videos/PHASES/mi-temps.mp4' },
            ],
          },
        ],
      });
      expect(extractVideoPaths(config)).toEqual([
        'videos/PHASES/avant-match.mp4',
        'videos/PHASES/mi-temps.mp4',
      ]);
    });

    it('deduplicates paths', () => {
      const config = cfg({
        sponsors: [{ path: 'videos/SPONSORS/dup.mp4' }],
        categories: [
          { videos: [{ path: 'videos/SPONSORS/dup.mp4' }] },
        ],
      });
      expect(extractVideoPaths(config)).toEqual(['videos/SPONSORS/dup.mp4']);
    });

    it('skips entries without path', () => {
      const config = cfg({
        sponsors: [
          { path: '' },
          { path: 'videos/SPONSORS/valid.mp4' },
          {},
        ],
        categories: [
          { videos: [{ path: '' }, { path: 'videos/MATCH/ok.mp4' }] },
        ],
      });
      expect(extractVideoPaths(config)).toEqual([
        'videos/SPONSORS/valid.mp4',
        'videos/MATCH/ok.mp4',
      ]);
    });

    it('extracts from full config with all sections', () => {
      const config = cfg({
        sponsors: [{ path: 'videos/SPONSORS/s1.mp4' }],
        categories: [
          {
            videos: [{ path: 'videos/MATCH/c1.mp4' }],
            subCategories: [
              { videos: [{ path: 'videos/MATCH/BUT/sc1.mp4' }] },
            ],
          },
        ],
        timeCategories: [
          { loopVideos: [{ path: 'videos/PHASES/tc1.mp4' }] },
        ],
      });

      const paths = extractVideoPaths(config);
      expect(paths).toHaveLength(4);
      expect(paths).toContain('videos/SPONSORS/s1.mp4');
      expect(paths).toContain('videos/MATCH/c1.mp4');
      expect(paths).toContain('videos/MATCH/BUT/sc1.mp4');
      expect(paths).toContain('videos/PHASES/tc1.mp4');
    });

    it('handles null/undefined sub-arrays gracefully', () => {
      const config = cfg({
        categories: [
          { videos: null, subCategories: null },
        ],
        timeCategories: [
          { loopVideos: null },
        ],
      });
      expect(extractVideoPaths(config)).toEqual([]);
    });
  });

  describe('extractFilenameFromPath', () => {
    it('extracts filename from simple path', () => {
      expect(extractFilenameFromPath('videos/SPONSORS/sponsor1.mp4')).toBe('sponsor1.mp4');
    });

    it('extracts filename from nested path', () => {
      expect(extractFilenameFromPath('videos/MATCH/BUT/JOUEUR_01.mp4')).toBe('JOUEUR_01.mp4');
    });

    it('handles filename only (no slashes)', () => {
      expect(extractFilenameFromPath('video.mp4')).toBe('video.mp4');
    });

    it('handles deeply nested paths', () => {
      expect(extractFilenameFromPath('a/b/c/d/e/f.mp4')).toBe('f.mp4');
    });
  });
});
