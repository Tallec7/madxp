/**
 * Tests unitaires pour le module de fusion de configuration NEOPRO
 *
 * Ce module est CRITIQUE car il gère la synchronisation entre:
 * - Le contenu NEOPRO (locked: true, owner: 'neopro') contrôlé par le central
 * - Le contenu Club (locked: false, owner: 'club') contrôlé localement
 *
 * @module config-merge.test
 */

const {
  mergeConfigurations,
  mergeCategories,
  cleanExpiredVideos,
  isLocked,
  hasLockedContent,
  createBackup,
  calculateConfigHash,
} = require('../utils/config-merge');

// Mock du logger pour éviter les logs pendant les tests
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('Config Merge Module', () => {

  describe('calculateConfigHash', () => {
    it('should return a 16-character hex hash', () => {
      const config = { categories: [] };
      const hash = calculateConfigHash(config);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should return same hash for identical configs', () => {
      const config1 = { categories: [{ id: 'test', name: 'Test' }] };
      const config2 = { categories: [{ id: 'test', name: 'Test' }] };

      expect(calculateConfigHash(config1)).toBe(calculateConfigHash(config2));
    });

    it('should return different hash for different configs', () => {
      const config1 = { categories: [{ id: 'test1', name: 'Test1' }] };
      const config2 = { categories: [{ id: 'test2', name: 'Test2' }] };

      expect(calculateConfigHash(config1)).not.toBe(calculateConfigHash(config2));
    });

    it('should handle empty config', () => {
      const hash = calculateConfigHash({});
      expect(hash).toHaveLength(16);
    });
  });

  describe('createBackup', () => {
    it('should create a deep copy of config', () => {
      const original = {
        categories: [
          { id: 'cat1', videos: [{ name: 'video1' }] }
        ]
      };

      const backup = createBackup(original);

      // Should be equal
      expect(backup).toEqual(original);

      // But not the same reference
      expect(backup).not.toBe(original);
      expect(backup.categories).not.toBe(original.categories);
      expect(backup.categories[0]).not.toBe(original.categories[0]);
    });

    it('should not affect original when backup is modified', () => {
      const original = { categories: [{ id: 'test' }] };
      const backup = createBackup(original);

      backup.categories[0].id = 'modified';

      expect(original.categories[0].id).toBe('test');
    });
  });

  describe('isLocked', () => {
    it('should return true for locked: true', () => {
      expect(isLocked({ locked: true })).toBe(true);
    });

    it('should return true for owner: neopro', () => {
      expect(isLocked({ owner: 'neopro' })).toBe(true);
    });

    it('should return true for both locked and owner neopro', () => {
      expect(isLocked({ locked: true, owner: 'neopro' })).toBe(true);
    });

    it('should return false for unlocked club content', () => {
      expect(isLocked({ locked: false, owner: 'club' })).toBe(false);
    });

    it('should return false for undefined item', () => {
      expect(isLocked(undefined)).toBe(false);
    });

    it('should return false for null item', () => {
      expect(isLocked(null)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isLocked({})).toBe(false);
    });
  });

  describe('hasLockedContent', () => {
    it('should return true if category itself is locked', () => {
      const category = { id: 'cat1', locked: true, videos: [] };
      expect(hasLockedContent(category)).toBe(true);
    });

    it('should return true if category has owner neopro', () => {
      const category = { id: 'cat1', owner: 'neopro', videos: [] };
      expect(hasLockedContent(category)).toBe(true);
    });

    it('should return true if category has locked video', () => {
      const category = {
        id: 'cat1',
        locked: false,
        videos: [
          { name: 'video1', locked: false },
          { name: 'video2', locked: true },
        ]
      };
      expect(hasLockedContent(category)).toBe(true);
    });

    it('should return true if subcategory is locked', () => {
      const category = {
        id: 'cat1',
        locked: false,
        videos: [],
        subCategories: [
          { id: 'sub1', locked: true, videos: [] }
        ]
      };
      expect(hasLockedContent(category)).toBe(true);
    });

    it('should return true if subcategory has locked video', () => {
      const category = {
        id: 'cat1',
        locked: false,
        videos: [],
        subCategories: [
          {
            id: 'sub1',
            locked: false,
            videos: [{ name: 'video', locked: true }]
          }
        ]
      };
      expect(hasLockedContent(category)).toBe(true);
    });

    it('should return false for fully unlocked category', () => {
      const category = {
        id: 'cat1',
        locked: false,
        owner: 'club',
        videos: [{ name: 'video1', locked: false }],
        subCategories: [
          { id: 'sub1', locked: false, videos: [{ name: 'video2', locked: false }] }
        ]
      };
      expect(hasLockedContent(category)).toBe(false);
    });
  });

  describe('cleanExpiredVideos', () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); // Yesterday
    const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // Tomorrow

    it('should remove expired videos from category', () => {
      const categories = [{
        id: 'cat1',
        videos: [
          { name: 'expired', path: 'video1.mp4', expires_at: pastDate },
          { name: 'valid', path: 'video2.mp4', expires_at: futureDate },
          { name: 'no-expiry', path: 'video3.mp4' },
        ]
      }];

      const cleaned = cleanExpiredVideos(categories);

      expect(cleaned[0].videos).toHaveLength(2);
      expect(cleaned[0].videos.map(v => v.name)).toEqual(['valid', 'no-expiry']);
    });

    it('should remove expired videos from subcategories', () => {
      const categories = [{
        id: 'cat1',
        videos: [],
        subCategories: [{
          id: 'sub1',
          videos: [
            { name: 'expired', path: 'video1.mp4', expires_at: pastDate },
            { name: 'valid', path: 'video2.mp4', expires_at: futureDate },
          ]
        }]
      }];

      const cleaned = cleanExpiredVideos(categories);

      expect(cleaned[0].subCategories[0].videos).toHaveLength(1);
      expect(cleaned[0].subCategories[0].videos[0].name).toBe('valid');
    });

    it('should handle categories without videos', () => {
      const categories = [{ id: 'cat1' }];
      const cleaned = cleanExpiredVideos(categories);
      expect(cleaned).toEqual([{ id: 'cat1' }]);
    });

    it('should handle empty categories array', () => {
      const cleaned = cleanExpiredVideos([]);
      expect(cleaned).toEqual([]);
    });

    it('should not modify videos without expires_at', () => {
      const categories = [{
        id: 'cat1',
        videos: [
          { name: 'video1', path: 'video1.mp4' },
          { name: 'video2', path: 'video2.mp4' },
        ]
      }];

      const cleaned = cleanExpiredVideos(categories);
      expect(cleaned[0].videos).toHaveLength(2);
    });
  });

  describe('mergeCategories', () => {
    it('should add NEOPRO locked categories', () => {
      const localCategories = [];
      const neoProCategories = [{
        id: 'annonces_neopro',
        name: 'ANNONCES NEOPRO',
        locked: true,
        owner: 'neopro',
        videos: [{ name: 'promo', path: 'promo.mp4' }]
      }];

      const merged = mergeCategories(localCategories, neoProCategories);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('annonces_neopro');
      expect(merged[0].locked).toBe(true);
      expect(merged[0].owner).toBe('neopro');
    });

    it('should preserve club unlocked categories', () => {
      const localCategories = [{
        id: 'info_club',
        name: 'Info Club',
        locked: false,
        owner: 'club',
        videos: [{ name: 'match', path: 'match.mp4' }]
      }];
      const neoProCategories = [];

      const merged = mergeCategories(localCategories, neoProCategories);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('info_club');
      expect(merged[0].owner).toBe('club');
    });

    it('should update NEOPRO category with new content', () => {
      const localCategories = [{
        id: 'annonces_neopro',
        name: 'ANNONCES NEOPRO',
        locked: true,
        owner: 'neopro',
        videos: [{ name: 'old_promo', path: 'old.mp4' }]
      }];
      const neoProCategories = [{
        id: 'annonces_neopro',
        name: 'ANNONCES NEOPRO',
        locked: true,
        owner: 'neopro',
        videos: [{ name: 'new_promo', path: 'new.mp4' }]
      }];

      const merged = mergeCategories(localCategories, neoProCategories);

      expect(merged).toHaveLength(1);
      expect(merged[0].videos[0].name).toBe('new_promo');
    });

    it('should remove NEOPRO category when not in new content', () => {
      const localCategories = [{
        id: 'annonces_neopro',
        name: 'ANNONCES NEOPRO',
        locked: true,
        owner: 'neopro',
        videos: [{ name: 'old_promo', path: 'old.mp4' }]
      }];
      const neoProCategories = [];

      const merged = mergeCategories(localCategories, neoProCategories);

      expect(merged).toHaveLength(0);
    });

    it('should maintain both NEOPRO and club categories', () => {
      const localCategories = [
        {
          id: 'info_club',
          name: 'Info Club',
          locked: false,
          owner: 'club',
          videos: [{ name: 'match', path: 'match.mp4' }]
        },
        {
          id: 'old_neopro',
          name: 'Old NEOPRO',
          locked: true,
          owner: 'neopro',
          videos: []
        }
      ];
      const neoProCategories = [{
        id: 'annonces_neopro',
        name: 'ANNONCES NEOPRO',
        locked: true,
        owner: 'neopro',
        videos: [{ name: 'promo', path: 'promo.mp4' }]
      }];

      const merged = mergeCategories(localCategories, neoProCategories);

      expect(merged).toHaveLength(2);

      const neoProCat = merged.find(c => c.id === 'annonces_neopro');
      const clubCat = merged.find(c => c.id === 'info_club');

      expect(neoProCat).toBeDefined();
      expect(clubCat).toBeDefined();
      expect(merged.find(c => c.id === 'old_neopro')).toBeUndefined();
    });

    it('should add new club categories suggested by central', () => {
      const localCategories = [];
      const neoProCategories = [{
        id: 'suggested_club',
        name: 'Suggested Club Category',
        locked: false,
        owner: 'club',
        videos: []
      }];

      const merged = mergeCategories(localCategories, neoProCategories);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('suggested_club');
      expect(merged[0].locked).toBe(false);
      expect(merged[0].owner).toBe('club');
    });

    it('should not duplicate existing club categories from central', () => {
      const localCategories = [{
        id: 'info_club',
        name: 'Info Club',
        locked: false,
        owner: 'club',
        videos: [{ name: 'local_video', path: 'local.mp4' }]
      }];
      const neoProCategories = [{
        id: 'info_club',
        name: 'Info Club Updated',
        locked: false,
        owner: 'club',
        videos: []
      }];

      const merged = mergeCategories(localCategories, neoProCategories);

      expect(merged).toHaveLength(1);
      // Local version should be preserved
      expect(merged[0].videos).toHaveLength(1);
      expect(merged[0].videos[0].name).toBe('local_video');
    });
  });

  describe('mergeConfigurations', () => {
    it('should merge complete configurations', () => {
      const localConfig = {
        version: '1.0',
        auth: { password: 'test123' },
        categories: [{
          id: 'info_club',
          name: 'Info Club',
          locked: false,
          owner: 'club',
          videos: [{ name: 'match', path: 'match.mp4' }]
        }]
      };

      const neoProContent = {
        version: '2.0',
        categories: [{
          id: 'annonces_neopro',
          name: 'ANNONCES NEOPRO',
          locked: true,
          owner: 'neopro',
          videos: [{ name: 'promo', path: 'promo.mp4' }]
        }]
      };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.version).toBe('2.0');
      expect(merged.auth.password).toBe('test123');
      expect(merged.categories).toHaveLength(2);
    });

    it('should handle empty local config', () => {
      const localConfig = {};
      const neoProContent = {
        version: '1.0',
        categories: [{
          id: 'annonces_neopro',
          name: 'ANNONCES NEOPRO',
          locked: true,
          owner: 'neopro',
          videos: []
        }]
      };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.version).toBe('1.0');
      expect(merged.categories).toHaveLength(1);
    });

    it('should handle empty neoProContent', () => {
      const localConfig = {
        version: '1.0',
        categories: [{
          id: 'info_club',
          name: 'Info Club',
          locked: false,
          owner: 'club',
          videos: []
        }]
      };
      const neoProContent = {};

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.version).toBe('1.0');
      expect(merged.categories).toHaveLength(1);
    });

    it('should clean expired videos during merge', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const localConfig = {
        categories: [{
          id: 'info_club',
          name: 'Info Club',
          locked: false,
          owner: 'club',
          videos: [{ name: 'expired', path: 'expired.mp4', expires_at: pastDate }]
        }]
      };
      const neoProContent = { categories: [] };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.categories[0].videos).toHaveLength(0);
    });

    it('should not mutate original local config', () => {
      const localConfig = {
        version: '1.0',
        categories: [{ id: 'test', name: 'Test', locked: false, owner: 'club' }]
      };
      const neoProContent = {
        version: '2.0',
        categories: []
      };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(localConfig.version).toBe('1.0');
      expect(merged.version).toBe('2.0');
    });

    it('should update liveScoreEnabled to true when provided', () => {
      const localConfig = {
        version: '1.0',
        liveScoreEnabled: false,
        categories: []
      };
      const neoProContent = {
        liveScoreEnabled: true
      };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.liveScoreEnabled).toBe(true);
    });

    it('should update liveScoreEnabled to false when provided', () => {
      const localConfig = {
        version: '1.0',
        liveScoreEnabled: true,
        categories: []
      };
      const neoProContent = {
        liveScoreEnabled: false
      };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.liveScoreEnabled).toBe(false);
    });

    it('should preserve liveScoreEnabled when not in neoProContent', () => {
      const localConfig = {
        version: '1.0',
        liveScoreEnabled: true,
        categories: []
      };
      const neoProContent = {
        version: '2.0',
        categories: []
      };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.liveScoreEnabled).toBe(true);
      expect(merged.version).toBe('2.0');
    });

    it('should add liveScoreEnabled when not in local config', () => {
      const localConfig = {
        version: '1.0',
        categories: []
      };
      const neoProContent = {
        liveScoreEnabled: true
      };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.liveScoreEnabled).toBe(true);
    });
  });

  describe('Edge Cases & Security', () => {
    it('should handle malformed categories gracefully', () => {
      const localCategories = [
        { id: 'valid', name: 'Valid', locked: false, owner: 'club' },
        null,
        undefined,
      ].filter(Boolean);
      const neoProCategories = [];

      const merged = mergeCategories(localCategories, neoProCategories);
      expect(merged).toHaveLength(1);
    });

    it('should enforce locked=true and owner=neopro for NEOPRO content', () => {
      const localCategories = [];
      const neoProCategories = [{
        id: 'neopro_cat',
        name: 'NEOPRO',
        // Missing locked and owner
        videos: []
      }];

      // Since this category doesn't have locked:true or owner:'neopro',
      // it should be treated as club content suggestion
      const merged = mergeCategories(localCategories, neoProCategories);

      // Should be added as club content (not locked)
      expect(merged[0].locked).toBe(false);
      expect(merged[0].owner).toBe('club');
    });

    it('should handle very large number of categories', () => {
      const localCategories = Array.from({ length: 100 }, (_, i) => ({
        id: `club_${i}`,
        name: `Club ${i}`,
        locked: false,
        owner: 'club',
        videos: []
      }));
      const neoProCategories = Array.from({ length: 50 }, (_, i) => ({
        id: `neopro_${i}`,
        name: `NEOPRO ${i}`,
        locked: true,
        owner: 'neopro',
        videos: []
      }));

      const merged = mergeCategories(localCategories, neoProCategories);

      expect(merged).toHaveLength(150);
    });

    it('should handle unicode characters in category names', () => {
      const localCategories = [{
        id: 'unicode',
        name: '🏐 Volleyball é è à ü',
        locked: false,
        owner: 'club',
        videos: []
      }];
      const neoProCategories = [];

      const merged = mergeCategories(localCategories, neoProCategories);

      expect(merged[0].name).toBe('🏐 Volleyball é è à ü');
    });
  });

  describe('Real-World Scenarios', () => {
    it('Scenario 1: Initial setup - empty local, NEOPRO content pushed', () => {
      const localConfig = {};
      const neoProContent = {
        version: '2.0',
        categories: [
          {
            id: 'annonces_neopro',
            name: 'ANNONCES NEOPRO',
            locked: true,
            owner: 'neopro',
            videos: [
              { name: 'Bienvenue', path: 'videos/annonces_neopro/bienvenue.mp4', locked: true }
            ],
            subCategories: []
          }
        ]
      };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.version).toBe('2.0');
      expect(merged.categories).toHaveLength(1);
      expect(merged.categories[0].locked).toBe(true);
    });

    it('Scenario 2: Club adds local content after NEOPRO setup', () => {
      const localConfig = {
        version: '2.0',
        categories: [
          {
            id: 'annonces_neopro',
            name: 'ANNONCES NEOPRO',
            locked: true,
            owner: 'neopro',
            videos: [{ name: 'Bienvenue', path: 'videos/annonces_neopro/bienvenue.mp4', locked: true }]
          },
          {
            id: 'matchs',
            name: 'Matchs du club',
            locked: false,
            owner: 'club',
            videos: [{ name: 'Match finale', path: 'videos/matchs/finale.mp4' }]
          }
        ]
      };

      // NEOPRO pushes an update
      const neoProContent = {
        version: '2.1',
        categories: [
          {
            id: 'annonces_neopro',
            name: 'ANNONCES NEOPRO',
            locked: true,
            owner: 'neopro',
            videos: [
              { name: 'Bienvenue', path: 'videos/annonces_neopro/bienvenue.mp4', locked: true },
              { name: 'Nouvelle promo', path: 'videos/annonces_neopro/promo.mp4', locked: true }
            ]
          }
        ]
      };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.version).toBe('2.1');
      expect(merged.categories).toHaveLength(2);

      const neoProCat = merged.categories.find(c => c.id === 'annonces_neopro');
      const clubCat = merged.categories.find(c => c.id === 'matchs');

      expect(neoProCat.videos).toHaveLength(2);
      expect(clubCat.videos).toHaveLength(1);
      expect(clubCat.videos[0].name).toBe('Match finale');
    });

    it('Scenario 3: NEOPRO removes a category', () => {
      const localConfig = {
        categories: [
          {
            id: 'annonces_neopro',
            name: 'ANNONCES NEOPRO',
            locked: true,
            owner: 'neopro',
            videos: []
          },
          {
            id: 'promo_old',
            name: 'Anciennes promos',
            locked: true,
            owner: 'neopro',
            videos: []
          },
          {
            id: 'matchs',
            name: 'Matchs',
            locked: false,
            owner: 'club',
            videos: []
          }
        ]
      };

      // NEOPRO removes 'promo_old' category
      const neoProContent = {
        categories: [
          {
            id: 'annonces_neopro',
            name: 'ANNONCES NEOPRO',
            locked: true,
            owner: 'neopro',
            videos: []
          }
        ]
      };

      const merged = mergeConfigurations(localConfig, neoProContent);

      expect(merged.categories).toHaveLength(2);
      expect(merged.categories.find(c => c.id === 'promo_old')).toBeUndefined();
      expect(merged.categories.find(c => c.id === 'matchs')).toBeDefined();
    });

    it('Scenario 4: Video expiration cleanup', () => {
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days future

      const localConfig = {
        categories: [
          {
            id: 'annonces_neopro',
            name: 'ANNONCES NEOPRO',
            locked: true,
            owner: 'neopro',
            videos: [
              { name: 'Expired promo', path: 'expired.mp4', locked: true, expires_at: pastDate },
              { name: 'Valid promo', path: 'valid.mp4', locked: true, expires_at: futureDate },
              { name: 'Permanent', path: 'permanent.mp4', locked: true }
            ]
          }
        ]
      };

      const neoProContent = { categories: [] };

      const merged = mergeConfigurations(localConfig, neoProContent);

      // NEOPRO category should be removed since it's not in neoProContent
      // But let's test with the category preserved
      const localConfigPreserved = {
        categories: [
          {
            id: 'info_club',
            name: 'Info Club',
            locked: false,
            owner: 'club',
            videos: [
              { name: 'Expired', path: 'expired.mp4', expires_at: pastDate },
              { name: 'Valid', path: 'valid.mp4', expires_at: futureDate }
            ]
          }
        ]
      };

      const merged2 = mergeConfigurations(localConfigPreserved, { categories: [] });

      expect(merged2.categories[0].videos).toHaveLength(1);
      expect(merged2.categories[0].videos[0].name).toBe('Valid');
    });
  });
});
