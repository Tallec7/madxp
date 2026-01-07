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
 * Liste des paramètres locaux qui ne doivent JAMAIS être écrasés par le central.
 * Ces paramètres sont spécifiques à chaque boîtier et configurés localement.
 */
const LOCAL_ONLY_SETTINGS = [
  'settings',        // language, timezone - configurés localement
  'siteId',          // Identifiant unique du site
  'siteName',        // Nom du site (peut être personnalisé)
  'clubName',        // Nom du club
  'apiKey',          // Clé API du boîtier
  'hotspot',         // Configuration WiFi hotspot (SSID, etc.) - si jamais stocké ici
  'localNetwork',    // Configuration réseau locale
];

/**
 * Fusionne la configuration locale avec le contenu NEOPRO
 *
 * @param {Object} localConfig - Configuration actuelle du Pi
 * @param {Object} neoProContent - Contenu NEOPRO à synchroniser
 * @returns {Object} Configuration fusionnée
 */
function mergeConfigurations(localConfig, neoProContent) {
  const result = JSON.parse(JSON.stringify(localConfig)); // Deep clone

  // ========================================================================
  // PROTECTION DES PARAMÈTRES LOCAUX
  // Ces paramètres ne doivent JAMAIS être écrasés par le central
  // ========================================================================
  const preservedLocalSettings = {};
  for (const key of LOCAL_ONLY_SETTINGS) {
    if (localConfig[key] !== undefined) {
      preservedLocalSettings[key] = JSON.parse(JSON.stringify(localConfig[key]));
    }
  }

  // Mettre à jour la version si nécessaire
  if (neoProContent.version) {
    result.version = neoProContent.version;
  }

  // Mettre à jour liveScoreEnabled (option premium contrôlée par NEOPRO)
  // Cette option active aussi l'accès aux options avancées de la télécommande
  if (neoProContent.liveScoreEnabled !== undefined) {
    result.liveScoreEnabled = neoProContent.liveScoreEnabled;
    logger.info(`[config-merge] liveScoreEnabled mis à jour: ${neoProContent.liveScoreEnabled}`);
  }

  // Mettre à jour scoreOverlay (configuration de l'apparence de l'overlay)
  if (neoProContent.scoreOverlay !== undefined) {
    result.scoreOverlay = neoProContent.scoreOverlay;
    logger.info(`[config-merge] scoreOverlay mis à jour: ${JSON.stringify(neoProContent.scoreOverlay)}`);
  }

  // ========================================================================
  // SPONSORS (Boucle par défaut)
  // Fusion intelligente : les sponsors NEOPRO sont contrôlés par le central,
  // les sponsors Club sont préservés
  // ========================================================================
  if (neoProContent.sponsors !== undefined) {
    result.sponsors = mergeSponsors(
      localConfig.sponsors || [],
      neoProContent.sponsors || []
    );
    logger.info(`[config-merge] Sponsors fusionnés: ${result.sponsors.length} vidéos`);
  }

  // ========================================================================
  // TIME CATEGORIES (Phases de match : avant/pendant/après)
  // Remplacement complet car géré entièrement par le central
  // ========================================================================
  if (neoProContent.timeCategories !== undefined) {
    result.timeCategories = neoProContent.timeCategories;
    logger.info(`[config-merge] TimeCategories mis à jour: ${(neoProContent.timeCategories || []).length} phases`);
  }

  // ========================================================================
  // CATEGORY MAPPINGS (Mapping analytics des catégories)
  // Remplacement complet car géré entièrement par le central
  // ========================================================================
  if (neoProContent.categoryMappings !== undefined) {
    result.categoryMappings = neoProContent.categoryMappings;
    logger.info(`[config-merge] CategoryMappings mis à jour: ${Object.keys(neoProContent.categoryMappings || {}).length} mappings`);
  }

  // Fusionner les catégories
  if (neoProContent.categories !== undefined) {
    result.categories = mergeCategories(
      localConfig.categories || [],
      neoProContent.categories || []
    );
  }

  // Nettoyer les vidéos expirées
  if (result.categories) {
    result.categories = cleanExpiredVideos(result.categories);
  }

  // ========================================================================
  // RESTAURATION DES PARAMÈTRES LOCAUX PROTÉGÉS
  // On s'assure que les paramètres locaux ne sont jamais perdus
  // ========================================================================
  for (const [key, value] of Object.entries(preservedLocalSettings)) {
    if (result[key] !== value) {
      logger.info(`[config-merge] Paramètre local préservé: ${key}`);
    }
    result[key] = value;
  }

  logger.info('[config-merge] Configuration fusionnée avec succès');
  return result;
}

/**
 * Fusionne les sponsors (boucle par défaut)
 * Les sponsors NEOPRO (locked/owner=neopro) sont contrôlés par le central
 * Les sponsors Club sont préservés
 *
 * @param {Array} localSponsors - Sponsors locaux
 * @param {Array} neoProSponsors - Sponsors du central
 * @returns {Array} Sponsors fusionnés
 */
function mergeSponsors(localSponsors, neoProSponsors) {
  const result = [];

  // 1. Ajouter tous les sponsors NEOPRO du central
  for (const sponsor of neoProSponsors) {
    if (sponsor.locked || sponsor.owner === 'neopro') {
      result.push({
        ...sponsor,
        locked: true,
        owner: 'neopro',
      });
    }
  }

  // 2. Préserver les sponsors Club locaux
  for (const sponsor of localSponsors) {
    if (!sponsor.locked && sponsor.owner !== 'neopro') {
      result.push({
        ...sponsor,
        locked: false,
        owner: sponsor.owner || 'club',
      });
    }
  }

  // 3. Ajouter les nouveaux sponsors Club du central (non présents localement)
  for (const sponsor of neoProSponsors) {
    if (!sponsor.locked && sponsor.owner !== 'neopro') {
      // Vérifier si ce sponsor existe déjà (par path ou nom)
      const exists = result.some(
        (s) => s.path === sponsor.path || (s.name === sponsor.name && s.name)
      );
      if (!exists) {
        result.push({
          ...sponsor,
          locked: false,
          owner: 'club',
        });
      }
    }
  }

  return result;
}

/**
 * Fusionne les tableaux de catégories
 *
 * Logique :
 * - Catégories NEOPRO (locked=true) : contrôlées par le central
 * - Catégories Club (locked=false) : le central peut les modifier via le dashboard
 *
 * @param {Array} localCategories - Catégories locales
 * @param {Array} centralCategories - Catégories envoyées par le central
 * @returns {Array} Catégories fusionnées
 */
function mergeCategories(localCategories, centralCategories) {
  const result = [];
  const processedIds = new Set();

  // 1. Traiter les catégories du central
  for (const centralCat of centralCategories) {
    const localCat = localCategories.find((c) => c.id === centralCat.id);

    if (centralCat.locked || centralCat.owner === 'neopro') {
      // Catégorie NEOPRO : utiliser la version du central
      result.push({
        ...centralCat,
        locked: true,
        owner: 'neopro',
      });
      processedIds.add(centralCat.id);
      logger.debug(`[config-merge] Catégorie NEOPRO ajoutée/mise à jour: ${centralCat.id}`);
    } else {
      // Catégorie Club envoyée par le central (modifiée via dashboard)
      // Utiliser la version du central qui contient les modifications
      result.push({
        ...centralCat,
        locked: false,
        owner: centralCat.owner || 'club',
      });
      processedIds.add(centralCat.id);
      if (localCat) {
        logger.info(`[config-merge] Catégorie Club mise à jour depuis le central: ${centralCat.id} (${centralCat.name})`);
      } else {
        logger.debug(`[config-merge] Nouvelle catégorie Club ajoutée: ${centralCat.id}`);
      }
    }
  }

  // 2. Préserver les catégories Club locales non présentes dans le central
  for (const localCat of localCategories) {
    if (processedIds.has(localCat.id)) {
      // Déjà traitée
      continue;
    }

    if (!localCat.locked && localCat.owner !== 'neopro') {
      // Catégorie Club locale non envoyée par le central : préserver
      result.push({
        ...localCat,
        locked: false,
        owner: localCat.owner || 'club',
      });
      logger.debug(`[config-merge] Catégorie Club locale préservée: ${localCat.id}`);
    } else if (localCat.locked || localCat.owner === 'neopro') {
      // Ancienne catégorie NEOPRO qui n'est plus dans le nouveau contenu
      // → Ne pas la garder (elle a été supprimée côté central)
      logger.info(`[config-merge] Catégorie NEOPRO supprimée: ${localCat.id}`);
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
  mergeSponsors,
  mergeCategories,
  cleanExpiredVideos,
  isLocked,
  hasLockedContent,
  createBackup,
  calculateConfigHash,
  LOCAL_ONLY_SETTINGS,
};
