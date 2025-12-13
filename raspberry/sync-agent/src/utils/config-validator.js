/**
 * Validation du schema de configuration avec Joi
 * Garantit l'intégrité des données de configuration
 */

const Joi = require('joi');
const logger = require('../logger');

// Schema pour une vidéo
const videoSchema = Joi.object({
  name: Joi.string().required(),
  filename: Joi.string().required(),
  path: Joi.string().required(),
  type: Joi.string().default('video/mp4'),
  locked: Joi.boolean().default(false),
  deployed_at: Joi.string().isoDate().allow(null),
  expires_at: Joi.string().isoDate().allow(null),
  checksum: Joi.string().length(64).allow(null), // SHA256 hex
}).unknown(true); // Permettre des champs additionnels

// Schema pour une sous-catégorie
const subCategorySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  locked: Joi.boolean().default(false),
  videos: Joi.array().items(videoSchema).default([]),
}).unknown(true);

// Schema pour une catégorie
const categorySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  locked: Joi.boolean().default(false),
  owner: Joi.string().valid('neopro', 'club').default('club'),
  videos: Joi.array().items(videoSchema).default([]),
  subCategories: Joi.array().items(subCategorySchema).default([]),
}).unknown(true);

// Schema principal de configuration
const configurationSchema = Joi.object({
  version: Joi.string().default('2.0'),
  site_id: Joi.string().allow(null),
  club_name: Joi.string().allow(null),
  categories: Joi.array().items(categorySchema).default([]),
  settings: Joi.object().default({}),
  last_sync: Joi.string().isoDate().allow(null),
}).unknown(true);

/**
 * Valide et normalise une configuration
 * @param {object} config Configuration à valider
 * @returns {{ valid: boolean, value: object, errors: string[] }}
 */
function validateConfiguration(config) {
  const result = {
    valid: false,
    value: null,
    errors: [],
  };

  if (!config || typeof config !== 'object') {
    result.errors.push('Configuration invalide: doit être un objet');
    return result;
  }

  const { error, value } = configurationSchema.validate(config, {
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    result.errors = error.details.map(d => d.message);
    logger.warn('Configuration validation failed', { errors: result.errors });
    return result;
  }

  result.valid = true;
  result.value = value;
  return result;
}

/**
 * Valide une catégorie individuelle
 * @param {object} category Catégorie à valider
 * @returns {{ valid: boolean, value: object, errors: string[] }}
 */
function validateCategory(category) {
  const { error, value } = categorySchema.validate(category, {
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    return {
      valid: false,
      value: null,
      errors: error.details.map(d => d.message),
    };
  }

  return { valid: true, value, errors: [] };
}

/**
 * Valide une vidéo individuelle
 * @param {object} video Vidéo à valider
 * @returns {{ valid: boolean, value: object, errors: string[] }}
 */
function validateVideo(video) {
  const { error, value } = videoSchema.validate(video, {
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    return {
      valid: false,
      value: null,
      errors: error.details.map(d => d.message),
    };
  }

  return { valid: true, value, errors: [] };
}

/**
 * Nettoie une configuration en supprimant les entrées invalides
 * @param {object} config Configuration à nettoyer
 * @returns {object} Configuration nettoyée
 */
function sanitizeConfiguration(config) {
  if (!config || typeof config !== 'object') {
    return { categories: [], settings: {} };
  }

  const sanitized = {
    ...config,
    categories: [],
  };

  for (const category of (config.categories || [])) {
    const catValidation = validateCategory(category);
    if (catValidation.valid) {
      // Nettoyer les vidéos de la catégorie
      const cleanVideos = (category.videos || []).filter(v => {
        const vValidation = validateVideo(v);
        if (!vValidation.valid) {
          logger.warn('Removing invalid video from category', {
            category: category.name,
            video: v.name || v.filename,
            errors: vValidation.errors,
          });
        }
        return vValidation.valid;
      });

      // Nettoyer les sous-catégories
      const cleanSubCategories = (category.subCategories || []).map(sub => ({
        ...sub,
        videos: (sub.videos || []).filter(v => validateVideo(v).valid),
      }));

      sanitized.categories.push({
        ...category,
        videos: cleanVideos,
        subCategories: cleanSubCategories,
      });
    } else {
      logger.warn('Removing invalid category', {
        category: category.name || category.id,
        errors: catValidation.errors,
      });
    }
  }

  return sanitized;
}

module.exports = {
  validateConfiguration,
  validateCategory,
  validateVideo,
  sanitizeConfiguration,
  configurationSchema,
  categorySchema,
  videoSchema,
};
