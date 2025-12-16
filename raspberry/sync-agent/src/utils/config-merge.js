/**
 * Module de fusion intelligente de configuration NEOPRO
 *
 * Règles de merge :
 * - Le contenu NEOPRO (locked: true, owner: 'neopro') est contrôlé par le central
 * - Le contenu Club (locked: false, owner: 'club') est préservé localement
 * - Les vidéos NEOPRO expirées sont automatiquement supprimées
 */

const logger = require('../logger');

/**
 * Fusionne la configuration locale avec le contenu NEOPRO
 *
 * @param {Object} localConfig - Configuration actuelle du Pi
 * @param {Object} neoProContent - Contenu NEOPRO à synchroniser
 * @returns {Object} Configuration fusionnée
 */
function mergeConfigurations(localConfig, neoProContent) {
  const result = JSON.parse(JSON.stringify(localConfig)); // Deep clone

  // Mettre à jour la version si nécessaire
  if (neoProContent.version) {
    result.version = neoProContent.version;
  }

  // Mettre à jour liveScoreEnabled (option premium contrôlée par NEOPRO)
  if (neoProContent.liveScoreEnabled !== undefined) {
    result.liveScoreEnabled = neoProContent.liveScoreEnabled;
    logger.info(`[config-merge] liveScoreEnabled mis à jour: ${neoProContent.liveScoreEnabled}`);
  }

  // Fusionner les catégories
  result.categories = mergeCategories(
    localConfig.categories || [],
    neoProContent.categories || []
  );

  // Nettoyer les vidéos expirées
  result.categories = cleanExpiredVideos(result.categories);

  logger.info('[config-merge] Configuration fusionnée avec succès');
  return result;
}

/**
 * Fusionne les tableaux de catégories
 *
 * @param {Array} localCategories - Catégories locales
 * @param {Array} neoProCategories - Catégories NEOPRO
 * @returns {Array} Catégories fusionnées
 */
function mergeCategories(localCategories, neoProCategories) {
  const result = [];
  const processedIds = new Set();

  // 1. Traiter les catégories NEOPRO (locked: true)
  for (const neoCat of neoProCategories) {
    if (neoCat.locked || neoCat.owner === 'neopro') {
      // Catégorie NEOPRO : utiliser la version du central
      result.push({
        ...neoCat,
        locked: true,
        owner: 'neopro',
      });
      processedIds.add(neoCat.id);
      logger.debug(`[config-merge] Catégorie NEOPRO ajoutée/mise à jour: ${neoCat.id}`);
    }
  }

  // 2. Préserver les catégories Club (non verrouillées)
  for (const localCat of localCategories) {
    if (processedIds.has(localCat.id)) {
      // Cette catégorie a été traitée comme NEOPRO, skip
      continue;
    }

    if (!localCat.locked && localCat.owner !== 'neopro') {
      // Catégorie Club : préserver telle quelle
      result.push({
        ...localCat,
        locked: false,
        owner: localCat.owner || 'club',
      });
      logger.debug(`[config-merge] Catégorie Club préservée: ${localCat.id}`);
    } else if (localCat.locked || localCat.owner === 'neopro') {
      // Ancienne catégorie NEOPRO qui n'est plus dans le nouveau contenu
      // → Ne pas la garder (elle a été supprimée côté central)
      logger.info(`[config-merge] Catégorie NEOPRO supprimée: ${localCat.id}`);
    }
  }

  // 3. Ajouter les nouvelles catégories Club du central (si elles existent)
  for (const neoCat of neoProCategories) {
    if (!neoCat.locked && neoCat.owner !== 'neopro' && !processedIds.has(neoCat.id)) {
      // Nouvelle catégorie Club suggérée par le central
      const existingLocal = localCategories.find((c) => c.id === neoCat.id);
      if (!existingLocal) {
        result.push({
          ...neoCat,
          locked: false,
          owner: 'club',
        });
        logger.debug(`[config-merge] Nouvelle catégorie Club ajoutée: ${neoCat.id}`);
      }
    }
  }

  return result;
}

/**
 * Supprime les vidéos expirées
 *
 * @param {Array} categories - Catégories à nettoyer
 * @returns {Array} Catégories nettoyées
 */
function cleanExpiredVideos(categories) {
  const now = new Date();

  return categories.map((cat) => {
    const cleanedCat = { ...cat };

    // Nettoyer les vidéos directes
    if (cleanedCat.videos) {
      cleanedCat.videos = cleanedCat.videos.filter((video) => {
        if (video.expires_at) {
          const expiresAt = new Date(video.expires_at);
          if (expiresAt < now) {
            logger.info(`[config-merge] Vidéo expirée supprimée: ${video.path}`);
            return false;
          }
        }
        return true;
      });
    }

    // Nettoyer les sous-catégories
    if (cleanedCat.subCategories) {
      cleanedCat.subCategories = cleanedCat.subCategories.map((subCat) => ({
        ...subCat,
        videos: (subCat.videos || []).filter((video) => {
          if (video.expires_at) {
            const expiresAt = new Date(video.expires_at);
            if (expiresAt < now) {
              logger.info(`[config-merge] Vidéo expirée supprimée: ${video.path}`);
              return false;
            }
          }
          return true;
        }),
      }));
    }

    return cleanedCat;
  });
}

/**
 * Vérifie si un élément est verrouillé (NEOPRO)
 *
 * @param {Object} item - Catégorie, sous-catégorie ou vidéo
 * @returns {boolean} true si verrouillé
 */
function isLocked(item) {
  if (!item) return false;
  return item.locked === true || item.owner === 'neopro';
}

/**
 * Vérifie si une catégorie contient du contenu verrouillé
 *
 * @param {Object} category - Catégorie à vérifier
 * @returns {boolean} true si contient du contenu verrouillé
 */
function hasLockedContent(category) {
  if (isLocked(category)) {
    return true;
  }

  // Vérifier les vidéos
  if (category.videos?.some((v) => isLocked(v))) {
    return true;
  }

  // Vérifier les sous-catégories
  if (category.subCategories?.some((sc) => isLocked(sc) || sc.videos?.some((v) => isLocked(v)))) {
    return true;
  }

  return false;
}

/**
 * Crée un backup de la configuration avant merge
 *
 * @param {Object} config - Configuration à sauvegarder
 * @returns {Object} Copie de la configuration
 */
function createBackup(config) {
  return JSON.parse(JSON.stringify(config));
}

/**
 * Calcule un hash simple de la configuration pour détecter les changements
 *
 * @param {Object} config - Configuration
 * @returns {string} Hash de la configuration
 */
function calculateConfigHash(config) {
  const crypto = require('crypto');
  const content = JSON.stringify(config);
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

module.exports = {
  mergeConfigurations,
  mergeCategories,
  cleanExpiredVideos,
  isLocked,
  hasLockedContent,
  createBackup,
  calculateConfigHash,
};
