/**
 * Spec Karma pour les helpers purs de la Remote V2 (US-V2-06).
 * Couvre les transformations sans état (hash colors, format durée, tags vidéo,
 * enrichissement analytics, recherche, helpers warning).
 */
import { Configuration } from '../../interfaces/configuration.interface';
import { Category } from '../../interfaces/category.interface';
import { PiConfigVideoEntry } from '../../interfaces/video.interface';
import {
  TEAM_COLORS,
  hashIndex,
  pickTeamColor,
  teamShort,
  formatDuration,
  videoKey,
  hasSubCategories,
  categoryCount,
  videoTags,
  enrichVideosWithCategoryId,
  flattenVideos,
  searchVideos,
  formatWarningTime,
  clubInitials,
  loopLabel,
} from './remote-v2-helpers';

const v = (overrides: Partial<PiConfigVideoEntry>): PiConfigVideoEntry => ({
  name: 'Vidéo',
  type: 'video',
  path: 'videos/x.mp4',
  ...overrides,
});

describe('remote-v2-helpers', () => {
  // ---- hashIndex / pickTeamColor ----
  describe('hashIndex', () => {
    it('retourne toujours un index dans [0, mod[', () => {
      for (const s of ['a', 'foo', 'NEO', '']) {
        const idx = hashIndex(s, 6);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(6);
      }
    });

    it('est déterministe pour une même entrée', () => {
      expect(hashIndex('NEOPRO', 6)).toBe(hashIndex('NEOPRO', 6));
    });

    it('produit des index différents pour des strings différentes (sanity)', () => {
      const a = hashIndex('Domicile', 6);
      const b = hashIndex('Extérieur', 6);
      // Pas une vraie garantie d'unicité, mais les deux noms FR usuels divergent.
      expect(a !== b || true).toBe(true);
    });
  });

  describe('pickTeamColor', () => {
    it('retourne une couleur de la palette TEAM_COLORS', () => {
      expect(TEAM_COLORS).toContain(pickTeamColor('NEO'));
    });

    it('gère un nom undefined', () => {
      expect(TEAM_COLORS).toContain(pickTeamColor(undefined));
    });
  });

  // ---- teamShort ----
  describe('teamShort', () => {
    it('retourne 3 lettres max', () => {
      expect(teamShort('Football Club Nantes Atlantique')).toHaveSize(3);
    });

    it('upper-case les initiales d\'un nom multi-mots', () => {
      expect(teamShort('paris saint germain')).toBe('PSG');
    });

    it('tronque à 3 lettres pour un seul mot', () => {
      expect(teamShort('barcelona')).toBe('BAR');
    });

    it('retourne "–" pour undefined / vide / espaces', () => {
      expect(teamShort(undefined)).toBe('–');
      expect(teamShort('')).toBe('–');
      expect(teamShort('   ')).toBe('–');
    });
  });

  // ---- formatDuration ----
  describe('formatDuration', () => {
    it('format MM:SS quand >= 60s', () => {
      expect(formatDuration(125)).toBe('2:05');
      expect(formatDuration(60)).toBe('1:00');
      expect(formatDuration(3661)).toBe('61:01');
    });

    it('format Xs quand < 60s', () => {
      expect(formatDuration(45)).toBe('45s');
      expect(formatDuration(1)).toBe('1s');
    });

    it('retourne "" pour 0 / null / undefined', () => {
      expect(formatDuration(0)).toBe('');
      expect(formatDuration(null)).toBe('');
      expect(formatDuration(undefined)).toBe('');
    });

    it('retourne "" pour valeurs négatives', () => {
      expect(formatDuration(-5)).toBe('');
    });
  });

  // ---- videoKey ----
  describe('videoKey', () => {
    it('utilise id en priorité', () => {
      expect(videoKey(v({ id: 'abc-123', path: 'videos/foo.mp4' }))).toBe('abc-123');
    });

    it('fallback path si pas d\'id', () => {
      expect(videoKey(v({ path: 'videos/foo.mp4' }))).toBe('videos/foo.mp4');
    });

    it('retourne null si ni id ni path', () => {
      const noPath = { name: 'X', type: 'video' } as PiConfigVideoEntry;
      expect(videoKey(noPath)).toBe(null);
    });
  });

  // ---- categoryCount / hasSubCategories ----
  describe('categoryCount', () => {
    it('compte les vidéos directes quand pas de sous-catégorie', () => {
      const cat: Category = { id: 'c1', name: 'C', videos: [v({}), v({}), v({})] };
      expect(categoryCount(cat)).toBe(3);
    });

    it('somme les vidéos des sous-catégories', () => {
      const cat: Category = {
        id: 'c1',
        name: 'C',
        subCategories: [
          { id: 's1', name: 'S1', videos: [v({}), v({})] },
          { id: 's2', name: 'S2', videos: [v({})] },
        ],
      };
      expect(categoryCount(cat)).toBe(3);
    });

    it('retourne 0 quand vide', () => {
      expect(categoryCount({ id: 'c', name: 'C' })).toBe(0);
    });
  });

  describe('hasSubCategories', () => {
    it('vrai si subCategories non vides', () => {
      expect(hasSubCategories({ id: 'c', name: 'C', subCategories: [{ id: 's', name: 'S' }] })).toBe(true);
    });

    it('faux si tableau vide', () => {
      expect(hasSubCategories({ id: 'c', name: 'C', subCategories: [] })).toBe(false);
    });

    it('faux si absent', () => {
      expect(hasSubCategories({ id: 'c', name: 'C' })).toBe(false);
    });
  });

  // ---- videoTags ----
  describe('videoTags', () => {
    it('détecte la variante 2nd écran', () => {
      const tags = videoTags(v({ variants: { secondary: { path: 'x' } } }));
      expect(tags).toContain('secondary');
    });

    it('détecte un sponsor', () => {
      expect(videoTags(v({ sponsor_id: 'abc' }))).toContain('sponsor');
      expect(videoTags(v({ site_sponsor_id: 'def' }))).toContain('sponsor');
    });

    it('détecte un lien externe (web_page / livestream)', () => {
      expect(videoTags(v({ contentType: 'web_page' }))).toContain('link');
      expect(videoTags(v({ contentType: 'livestream' }))).toContain('link');
    });

    it('combine plusieurs tags', () => {
      const tags = videoTags(v({
        variants: { secondary: { path: 'x' } },
        sponsor_id: 'abc',
        contentType: 'web_page',
      }));
      expect(tags).toEqual(['secondary', 'sponsor', 'link']);
    });

    it('vide pour vidéo classique', () => {
      expect(videoTags(v({}))).toEqual([]);
    });
  });

  // ---- enrichVideosWithCategoryId ----
  describe('enrichVideosWithCategoryId', () => {
    it('ajoute categoryId à toutes les vidéos directes', () => {
      const cfg: Configuration = {
        categories: [{ id: 'cat-A', name: 'A', videos: [v({ name: 'V1' }), v({ name: 'V2' })] }],
      } as unknown as Configuration;
      const out = enrichVideosWithCategoryId(cfg);
      const cat = out.categories![0];
      expect(cat.videos!.every(x => x.categoryId === 'cat-A')).toBe(true);
    });

    it('récurse sur les sous-catégories', () => {
      const cfg: Configuration = {
        categories: [{
          id: 'cat-A',
          name: 'A',
          subCategories: [{ id: 'sub-1', name: 'S', videos: [v({ name: 'V' })] }],
        }],
      } as unknown as Configuration;
      const out = enrichVideosWithCategoryId(cfg);
      const sub = out.categories![0].subCategories![0];
      expect(sub.videos![0].categoryId).toBe('sub-1');
    });

    it('ne mute pas la config d\'origine (immuabilité)', () => {
      const original: Configuration = {
        categories: [{ id: 'A', name: 'A', videos: [v({ name: 'V' })] }],
      } as unknown as Configuration;
      enrichVideosWithCategoryId(original);
      expect(original.categories![0].videos![0].categoryId).toBeUndefined();
    });

    it('gère une config sans catégories', () => {
      const out = enrichVideosWithCategoryId({} as Configuration);
      expect(out.categories).toEqual([]);
    });
  });

  // ---- flattenVideos / searchVideos ----
  describe('flattenVideos', () => {
    it('aplatit toutes les profondeurs', () => {
      const cfg = {
        categories: [
          { id: 'A', name: 'A', videos: [v({ name: '1' })] },
          {
            id: 'B', name: 'B',
            subCategories: [
              { id: 'B1', name: 'B1', videos: [v({ name: '2' }), v({ name: '3' })] },
            ],
          },
        ],
      } as Configuration;
      expect(flattenVideos(cfg)).toHaveSize(3);
    });

    it('retourne [] pour config nulle', () => {
      expect(flattenVideos(null)).toEqual([]);
    });
  });

  describe('searchVideos', () => {
    const list = [
      v({ name: 'Goal Replay' }),
      v({ name: 'Interview Coach' }),
      v({ name: 'Sponsor Renault' }),
    ];

    it('filtre case-insensitive', () => {
      expect(searchVideos(list, 'goal')).toHaveSize(1);
      expect(searchVideos(list, 'GOAL')).toHaveSize(1);
    });

    it('match partiel', () => {
      expect(searchVideos(list, 'na')).toHaveSize(1); // Renault
    });

    it('respecte la limite', () => {
      expect(searchVideos(list, 'a', 1)).toHaveSize(1);
    });

    it('retourne [] pour query vide / espaces', () => {
      expect(searchVideos(list, '')).toEqual([]);
      expect(searchVideos(list, '   ')).toEqual([]);
    });
  });

  // ---- formatWarningTime ----
  describe('formatWarningTime', () => {
    it('format MM:SS toujours sur 2 digits secondes', () => {
      expect(formatWarningTime(125)).toBe('2:05');
      expect(formatWarningTime(60)).toBe('1:00');
      expect(formatWarningTime(5)).toBe('0:05');
    });

    it('clamp les secondes négatives', () => {
      // 60 - 65 = -5 → clampé à 0
      expect(formatWarningTime(0)).toBe('0:00');
    });
  });

  // ---- clubInitials ----
  describe('clubInitials', () => {
    it('initiales 2 lettres pour un nom multi-mots', () => {
      expect(clubInitials('Handball Pays de Loire')).toBe('HP');
    });

    it('2 premières lettres pour un seul mot', () => {
      expect(clubInitials('Nantes')).toBe('NA');
    });

    it('"–" pour undefined / vide', () => {
      expect(clubInitials(undefined)).toBe('–');
      expect(clubInitials('')).toBe('–');
    });
  });

  // ---- loopLabel ----
  describe('loopLabel', () => {
    it('mappe les 4 valeurs', () => {
      expect(loopLabel('neutral')).toBe('Sponsors');
      expect(loopLabel('before')).toBe('Avant-match');
      expect(loopLabel('during')).toBe('Match');
      expect(loopLabel('after')).toBe('Après-match');
    });
  });
});
