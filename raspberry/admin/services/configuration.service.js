/**
 * ConfigurationService — Gestion centralisée de configuration.json
 *
 * Single source of truth pour toutes les opérations de lecture/écriture
 * sur le fichier configuration.json. Utilisé par routes/config.js
 * et routes/videos.js (via VideoService).
 */

const fs = require('fs').promises;
const path = require('path');

const {
  NEOPRO_DIR,
  CONFIG_FILE_CANDIDATES,
  CONFIG_JSON_INDENT,
  canModifyCategory,
  isLocked,
} = require('../helpers');

const {
  NotFoundError,
  LockedError,
  ValidationError,
  DuplicateError,
} = require('./errors');

class ConfigurationService {
  /**
   * @param {Object} deps
   * @param {Object} deps.cache - CacheManager instance
   * @param {Object} deps.NAMESPACES - Cache namespace constants
   */
  constructor({ cache, NAMESPACES }) {
    this.cache = cache;
    this.NAMESPACES = NAMESPACES;
  }

  // ===========================================================================
  // CONFIG PATH RESOLUTION & CACHE
  // ===========================================================================

  /**
   * Résoudre le chemin vers configuration.json (avec cache 5 min).
   * @returns {Promise<string|null>}
   */
  async resolveConfigurationPath() {
    return this.cache.getOrSet(this.NAMESPACES.CONFIG, 'path', async () => {
      for (const candidate of CONFIG_FILE_CANDIDATES) {
        try {
          const stats = await fs.stat(candidate);
          if (stats.isFile()) {
            console.log('[admin] configuration.json detected at', candidate);
            return candidate;
          }
        } catch {
          // Ignorer et tester la suivante
        }
      }
      console.warn('[admin] Aucun configuration.json trouvé parmi', CONFIG_FILE_CANDIDATES);
      return null;
    }, 300000); // 5 minutes TTL
  }

  /**
   * Invalider les caches vidéo et config.
   */
  invalidateVideoCaches() {
    this.cache.invalidateNamespace(this.NAMESPACES.CONFIG);
    this.cache.invalidateNamespace(this.NAMESPACES.VIDEOS);
    console.log('[admin] Video and config caches invalidated');
  }

  // ===========================================================================
  // LOAD / SAVE
  // ===========================================================================

  /**
   * Charger configuration.json.
   * @returns {Promise<Object>}
   * @throws {NotFoundError} si le fichier n'est pas trouvé
   */
  async loadConfig() {
    const configPath = await this.resolveConfigurationPath();
    if (!configPath) {
      throw new NotFoundError('Configuration non trouvée');
    }
    const raw = await fs.readFile(configPath, 'utf8');
    return JSON.parse(raw);
  }

  /**
   * Sauvegarder configuration.json et invalider les caches.
   * @param {Object} config - L'objet configuration complet
   */
  async saveConfig(config) {
    const configPath = await this.resolveConfigurationPath();
    if (!configPath) {
      throw new NotFoundError('Impossible de localiser configuration.json');
    }
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    this.invalidateVideoCaches();
  }

  // ===========================================================================
  // CLUB CONFIG (club-config.json)
  // ===========================================================================

  /**
   * Lire club-config.json.
   * @returns {Promise<Object>}
   */
  async getClubConfig() {
    const configPath = path.join(NEOPRO_DIR, 'club-config.json');
    const data = await fs.readFile(configPath, 'utf8');
    return JSON.parse(data);
  }

  // ===========================================================================
  // SETTINGS
  // ===========================================================================

  /**
   * Obtenir les settings (language, timezone).
   * @returns {Promise<Object>}
   */
  async getSettings() {
    const config = await this.loadConfig();
    return config.settings || { language: 'fr', timezone: 'Europe/Paris' };
  }

  /**
   * Mettre à jour les settings.
   * @param {Object} params
   * @param {string} [params.language]
   * @param {string} [params.timezone]
   * @returns {Promise<Object>} settings mis à jour
   */
  async updateSettings({ language, timezone }) {
    const validLanguages = ['fr', 'en', 'es'];
    if (language && !validLanguages.includes(language)) {
      throw new ValidationError(`Langue invalide. Valeurs acceptées: ${validLanguages.join(', ')}`);
    }

    const config = await this.loadConfig();
    config.settings = config.settings || { language: 'fr', timezone: 'Europe/Paris' };

    if (language) config.settings.language = language;
    if (timezone) config.settings.timezone = timezone;

    await this.saveConfig(config);

    // Invalider aussi le cache config spécifiquement
    this.cache.delete(this.NAMESPACES.CONFIG, 'path');

    console.log(`[admin] Settings updated: language=${config.settings.language}, timezone=${config.settings.timezone}`);
    return config.settings;
  }

  // ===========================================================================
  // CATEGORIES
  // ===========================================================================

  /**
   * Lister toutes les catégories.
   * @returns {Promise<Array>}
   */
  async getCategories() {
    const config = await this.loadConfig();
    return config.categories || [];
  }

  /**
   * Créer une nouvelle catégorie.
   * @param {Object} params
   * @param {string} params.id
   * @param {string} params.name
   * @param {Array} [params.videos]
   * @param {Array} [params.subCategories]
   * @returns {Promise<Object>} la catégorie créée
   */
  async createCategory({ id, name, videos, subCategories }) {
    if (!id || !name) {
      throw new ValidationError('id et name sont requis');
    }

    const config = await this.loadConfig();
    config.categories = config.categories || [];

    if (config.categories.some(c => c.id === id)) {
      throw new DuplicateError('Une catégorie avec cet ID existe déjà');
    }

    const newCategory = {
      id,
      name,
      videos: videos || [],
      subCategories: subCategories || [],
    };

    config.categories.push(newCategory);
    await this.saveConfig(config);

    console.log('[admin] Category created:', id);
    return newCategory;
  }

  /**
   * Mettre à jour une catégorie.
   * @param {string} categoryId
   * @param {Object} updates - { name }
   * @returns {Promise<Object>} la catégorie mise à jour
   */
  async updateCategory(categoryId, updates) {
    const config = await this.loadConfig();
    config.categories = config.categories || [];

    const categoryIndex = config.categories.findIndex(c => c.id === categoryId);
    if (categoryIndex === -1) {
      throw new NotFoundError('Catégorie non trouvée');
    }

    const canModify = canModifyCategory(config.categories[categoryIndex]);
    if (!canModify.allowed) {
      throw new LockedError(canModify.reason);
    }

    if (updates.name) config.categories[categoryIndex].name = updates.name;

    await this.saveConfig(config);
    console.log('[admin] Category updated:', categoryId);

    return config.categories[categoryIndex];
  }

  /**
   * Supprimer une catégorie et nettoyer les timeCategories.
   * @param {string} categoryId
   */
  async deleteCategory(categoryId) {
    const config = await this.loadConfig();
    config.categories = config.categories || [];

    const categoryIndex = config.categories.findIndex(c => c.id === categoryId);
    if (categoryIndex === -1) {
      throw new NotFoundError('Catégorie non trouvée');
    }

    const category = config.categories[categoryIndex];
    const canModify = canModifyCategory(category);
    if (!canModify.allowed) {
      throw new LockedError(canModify.reason);
    }

    config.categories.splice(categoryIndex, 1);

    // Nettoyer timeCategories
    if (config.timeCategories) {
      config.timeCategories.forEach(tc => {
        tc.categoryIds = (tc.categoryIds || []).filter(id => id !== categoryId);
      });
    }

    await this.saveConfig(config);
    console.log('[admin] Category deleted:', categoryId);
  }

  // ===========================================================================
  // SUBCATEGORIES
  // ===========================================================================

  /**
   * Créer une sous-catégorie.
   * @param {string} categoryId
   * @param {Object} params
   * @param {string} params.id
   * @param {string} params.name
   * @param {Array} [params.videos]
   * @returns {Promise<Object>} la sous-catégorie créée
   */
  async createSubcategory(categoryId, { id, name, videos }) {
    if (!id || !name) {
      throw new ValidationError('id et name sont requis');
    }

    const config = await this.loadConfig();
    config.categories = config.categories || [];

    const category = config.categories.find(c => c.id === categoryId);
    if (!category) {
      throw new NotFoundError('Catégorie non trouvée');
    }

    category.subCategories = category.subCategories || [];

    if (category.subCategories.some(s => s.id === id)) {
      throw new DuplicateError('Une sous-catégorie avec cet ID existe déjà');
    }

    const newSubCategory = {
      id,
      name,
      videos: videos || [],
    };

    category.subCategories.push(newSubCategory);
    await this.saveConfig(config);

    console.log('[admin] SubCategory created:', categoryId, '/', id);
    return newSubCategory;
  }

  /**
   * Supprimer une sous-catégorie.
   * @param {string} categoryId
   * @param {string} subCategoryId
   */
  async deleteSubcategory(categoryId, subCategoryId) {
    const config = await this.loadConfig();
    config.categories = config.categories || [];

    const category = config.categories.find(c => c.id === categoryId);
    if (!category) {
      throw new NotFoundError('Catégorie non trouvée');
    }

    const canModifyCat = canModifyCategory(category);
    if (!canModifyCat.allowed) {
      throw new LockedError(canModifyCat.reason);
    }

    category.subCategories = category.subCategories || [];
    const subIndex = category.subCategories.findIndex(s => s.id === subCategoryId);
    if (subIndex === -1) {
      throw new NotFoundError('Sous-catégorie non trouvée');
    }

    const subcategory = category.subCategories[subIndex];
    if (isLocked(subcategory)) {
      throw new LockedError('Cette sous-catégorie est gérée par NEOPRO et ne peut pas être supprimée.');
    }

    category.subCategories.splice(subIndex, 1);
    await this.saveConfig(config);

    console.log('[admin] SubCategory deleted:', categoryId, '/', subCategoryId);
  }

  // ===========================================================================
  // TIME CATEGORIES
  // ===========================================================================

  /**
   * Obtenir les timeCategories avec les noms de catégories.
   * @returns {Promise<Object>} { timeCategories, categories }
   */
  async getTimeCategories() {
    const config = await this.loadConfig();
    return {
      timeCategories: config.timeCategories || [],
      categories: (config.categories || []).map(cat => ({
        id: cat.id,
        name: cat.name,
      })),
    };
  }

  /**
   * Mettre à jour les timeCategories.
   * @param {Array} timeCategories
   * @returns {Promise<Array>} les timeCategories mises à jour
   */
  async updateTimeCategories(timeCategories) {
    if (!Array.isArray(timeCategories)) {
      throw new ValidationError('timeCategories doit être un tableau');
    }

    for (const tc of timeCategories) {
      if (!tc.id || !tc.name) {
        throw new ValidationError('Chaque timeCategory doit avoir un id et un name');
      }
      if (!Array.isArray(tc.categoryIds)) {
        tc.categoryIds = [];
      }
    }

    const config = await this.loadConfig();
    config.timeCategories = timeCategories;
    await this.saveConfig(config);

    console.log('[admin] timeCategories updated:', timeCategories.length, 'entries');
    return config.timeCategories;
  }
}

module.exports = ConfigurationService;
