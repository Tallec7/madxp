/**
 * Tests for ConfigurationService
 */

const ConfigurationService = require('../services/configuration.service');
const { NotFoundError, LockedError, ValidationError, DuplicateError } = require('../services/errors');

// ---------------------------------------------------------------------------
// Mock fs
// ---------------------------------------------------------------------------

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      stat: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
    },
  };
});

const fs = require('fs').promises;

// ---------------------------------------------------------------------------
// Mock cache
// ---------------------------------------------------------------------------

function createMockCache() {
  const store = new Map();
  return {
    getOrSet: jest.fn(async (_ns, _key, factory, _ttl) => factory()),
    invalidateNamespace: jest.fn(),
    delete: jest.fn(),
    _store: store,
  };
}

const NAMESPACES = { CONFIG: 'config', VIDEOS: 'videos' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_CONFIG = {
  settings: { language: 'fr', timezone: 'Europe/Paris' },
  categories: [
    {
      id: 'football',
      name: 'Football',
      videos: [{ path: 'videos/FOOTBALL/clip.mp4' }],
      subCategories: [
        { id: 'juniors', name: 'Juniors', videos: [] },
      ],
    },
    {
      id: 'locked-cat',
      name: 'Locked',
      locked: true,
      videos: [],
      subCategories: [
        { id: 'locked-sub', name: 'Locked Sub', locked: true, videos: [] },
      ],
    },
  ],
  timeCategories: [
    { id: 'morning', name: 'Matin', categoryIds: ['football', 'locked-cat'] },
  ],
};

function setupConfigPath() {
  fs.stat.mockResolvedValue({ isFile: () => true });
}

function setupLoadConfig(config = SAMPLE_CONFIG) {
  setupConfigPath();
  fs.readFile.mockResolvedValue(JSON.stringify(config));
  fs.writeFile.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfigurationService', () => {
  let service;
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = createMockCache();
    service = new ConfigurationService({ cache, NAMESPACES });
  });

  // =========================================================================
  // resolveConfigurationPath
  // =========================================================================

  describe('resolveConfigurationPath', () => {
    it('should return the first valid candidate path', async () => {
      fs.stat.mockResolvedValueOnce({ isFile: () => true });

      const result = await service.resolveConfigurationPath();
      expect(result).toBeTruthy();
      expect(cache.getOrSet).toHaveBeenCalled();
    });

    it('should return null when no candidate exists', async () => {
      cache.getOrSet.mockImplementation(async (_ns, _key, factory) => factory());
      fs.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await service.resolveConfigurationPath();
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // invalidateVideoCaches
  // =========================================================================

  describe('invalidateVideoCaches', () => {
    it('should invalidate both CONFIG and VIDEOS namespaces', () => {
      service.invalidateVideoCaches();
      expect(cache.invalidateNamespace).toHaveBeenCalledWith(NAMESPACES.CONFIG);
      expect(cache.invalidateNamespace).toHaveBeenCalledWith(NAMESPACES.VIDEOS);
    });
  });

  // =========================================================================
  // loadConfig
  // =========================================================================

  describe('loadConfig', () => {
    it('should load and parse JSON', async () => {
      setupLoadConfig();
      const config = await service.loadConfig();
      expect(config).toHaveProperty('categories');
      expect(config.categories).toHaveLength(2);
    });

    it('should throw NotFoundError when path is null', async () => {
      cache.getOrSet.mockImplementation(async (_ns, _key, factory) => factory());
      fs.stat.mockRejectedValue(new Error('ENOENT'));

      await expect(service.loadConfig()).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // saveConfig
  // =========================================================================

  describe('saveConfig', () => {
    it('should write JSON and invalidate caches', async () => {
      setupConfigPath();
      fs.writeFile.mockResolvedValue(undefined);

      await service.saveConfig({ categories: [] });

      expect(fs.writeFile).toHaveBeenCalled();
      expect(cache.invalidateNamespace).toHaveBeenCalledWith(NAMESPACES.CONFIG);
      expect(cache.invalidateNamespace).toHaveBeenCalledWith(NAMESPACES.VIDEOS);
    });
  });

  // =========================================================================
  // getSettings
  // =========================================================================

  describe('getSettings', () => {
    it('should return settings from config', async () => {
      setupLoadConfig();
      const settings = await service.getSettings();
      expect(settings).toEqual({ language: 'fr', timezone: 'Europe/Paris' });
    });

    it('should return defaults when settings missing', async () => {
      setupLoadConfig({ categories: [] });
      const settings = await service.getSettings();
      expect(settings).toEqual({ language: 'fr', timezone: 'Europe/Paris' });
    });
  });

  // =========================================================================
  // updateSettings
  // =========================================================================

  describe('updateSettings', () => {
    it('should update language', async () => {
      setupLoadConfig();
      const result = await service.updateSettings({ language: 'en' });
      expect(result.language).toBe('en');
    });

    it('should update timezone', async () => {
      setupLoadConfig();
      const result = await service.updateSettings({ timezone: 'America/New_York' });
      expect(result.timezone).toBe('America/New_York');
    });

    it('should throw ValidationError for invalid language', async () => {
      setupLoadConfig();
      await expect(service.updateSettings({ language: 'invalid' })).rejects.toThrow(
        ValidationError,
      );
    });
  });

  // =========================================================================
  // getCategories
  // =========================================================================

  describe('getCategories', () => {
    it('should return categories array', async () => {
      setupLoadConfig();
      const categories = await service.getCategories();
      expect(categories).toHaveLength(2);
      expect(categories[0].id).toBe('football');
    });

    it('should return empty array when no categories', async () => {
      setupLoadConfig({});
      const categories = await service.getCategories();
      expect(categories).toEqual([]);
    });
  });

  // =========================================================================
  // createCategory
  // =========================================================================

  describe('createCategory', () => {
    it('should create a new category', async () => {
      setupLoadConfig();
      const result = await service.createCategory({ id: 'tennis', name: 'Tennis' });
      expect(result.id).toBe('tennis');
      expect(result.name).toBe('Tennis');
      expect(result.videos).toEqual([]);
      expect(result.subCategories).toEqual([]);
    });

    it('should throw ValidationError when id is missing', async () => {
      setupLoadConfig();
      await expect(service.createCategory({ name: 'Test' })).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when name is missing', async () => {
      setupLoadConfig();
      await expect(service.createCategory({ id: 'test' })).rejects.toThrow(ValidationError);
    });

    it('should throw DuplicateError for existing id', async () => {
      setupLoadConfig();
      await expect(
        service.createCategory({ id: 'football', name: 'Duplicate' }),
      ).rejects.toThrow(DuplicateError);
    });
  });

  // =========================================================================
  // updateCategory
  // =========================================================================

  describe('updateCategory', () => {
    it('should update category name', async () => {
      setupLoadConfig();
      const result = await service.updateCategory('football', { name: 'Foot' });
      expect(result.name).toBe('Foot');
    });

    it('should throw NotFoundError for unknown category', async () => {
      setupLoadConfig();
      await expect(service.updateCategory('unknown', { name: 'X' })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should throw LockedError for locked category', async () => {
      setupLoadConfig();
      await expect(
        service.updateCategory('locked-cat', { name: 'X' }),
      ).rejects.toThrow(LockedError);
    });
  });

  // =========================================================================
  // deleteCategory
  // =========================================================================

  describe('deleteCategory', () => {
    it('should delete category and clean timeCategories', async () => {
      setupLoadConfig();
      await service.deleteCategory('football');

      // Verify writeFile was called — the saved config should not have football
      const saveCall = fs.writeFile.mock.calls[0];
      const savedConfig = JSON.parse(saveCall[1]);
      expect(savedConfig.categories).toHaveLength(1);
      expect(savedConfig.categories[0].id).toBe('locked-cat');
      // timeCategories should have football removed
      expect(savedConfig.timeCategories[0].categoryIds).not.toContain('football');
    });

    it('should throw NotFoundError for unknown category', async () => {
      setupLoadConfig();
      await expect(service.deleteCategory('unknown')).rejects.toThrow(NotFoundError);
    });

    it('should throw LockedError for locked category', async () => {
      setupLoadConfig();
      await expect(service.deleteCategory('locked-cat')).rejects.toThrow(LockedError);
    });
  });

  // =========================================================================
  // createSubcategory
  // =========================================================================

  describe('createSubcategory', () => {
    it('should create a subcategory', async () => {
      setupLoadConfig();
      const result = await service.createSubcategory('football', {
        id: 'seniors',
        name: 'Seniors',
      });
      expect(result.id).toBe('seniors');
      expect(result.videos).toEqual([]);
    });

    it('should throw ValidationError for missing fields', async () => {
      setupLoadConfig();
      await expect(
        service.createSubcategory('football', { name: 'Test' }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for unknown category', async () => {
      setupLoadConfig();
      await expect(
        service.createSubcategory('unknown', { id: 'x', name: 'X' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw DuplicateError for existing subcategory id', async () => {
      setupLoadConfig();
      await expect(
        service.createSubcategory('football', { id: 'juniors', name: 'Dup' }),
      ).rejects.toThrow(DuplicateError);
    });
  });

  // =========================================================================
  // deleteSubcategory
  // =========================================================================

  describe('deleteSubcategory', () => {
    it('should delete a subcategory', async () => {
      setupLoadConfig();
      await service.deleteSubcategory('football', 'juniors');

      const saveCall = fs.writeFile.mock.calls[0];
      const savedConfig = JSON.parse(saveCall[1]);
      const cat = savedConfig.categories.find((c) => c.id === 'football');
      expect(cat.subCategories).toHaveLength(0);
    });

    it('should throw NotFoundError for unknown category', async () => {
      setupLoadConfig();
      await expect(service.deleteSubcategory('unknown', 'x')).rejects.toThrow(NotFoundError);
    });

    it('should throw LockedError for locked category', async () => {
      setupLoadConfig();
      await expect(
        service.deleteSubcategory('locked-cat', 'locked-sub'),
      ).rejects.toThrow(LockedError);
    });

    it('should throw NotFoundError for unknown subcategory', async () => {
      setupLoadConfig();
      await expect(
        service.deleteSubcategory('football', 'nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // getTimeCategories
  // =========================================================================

  describe('getTimeCategories', () => {
    it('should return timeCategories and category summaries', async () => {
      setupLoadConfig();
      const result = await service.getTimeCategories();
      expect(result.timeCategories).toHaveLength(1);
      expect(result.categories).toHaveLength(2);
      expect(result.categories[0]).toEqual({ id: 'football', name: 'Football' });
    });
  });

  // =========================================================================
  // updateTimeCategories
  // =========================================================================

  describe('updateTimeCategories', () => {
    it('should update timeCategories', async () => {
      setupLoadConfig();
      const newTC = [{ id: 'evening', name: 'Soir', categoryIds: ['football'] }];
      const result = await service.updateTimeCategories(newTC);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('evening');
    });

    it('should throw ValidationError for non-array input', async () => {
      setupLoadConfig();
      await expect(service.updateTimeCategories('invalid')).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for entries missing id/name', async () => {
      setupLoadConfig();
      await expect(service.updateTimeCategories([{ name: 'Test' }])).rejects.toThrow(
        ValidationError,
      );
    });

    it('should default categoryIds to empty array if missing', async () => {
      setupLoadConfig();
      const result = await service.updateTimeCategories([{ id: 'x', name: 'X' }]);
      expect(result[0].categoryIds).toEqual([]);
    });
  });
});
