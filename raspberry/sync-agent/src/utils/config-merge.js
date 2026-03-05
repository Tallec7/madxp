// @ts-check

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
  'localSponsors',   // Sponsors créés localement par le bénévole (P3)
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

  // Mettre à jour watermark (configuration du watermark/logo en surimpression)
  if (neoProContent.watermark !== undefined) {
    result.watermark = neoProContent.watermark;
    logger.info(`[config-merge] watermark mis à jour: enabled=${neoProContent.watermark?.enabled}`);
  }

  // secondaryDisplayEnabled / secondaryDisplayResolution: supprimés.
  // Le Pi détecte le dual-display par hardware (DRM/sysfs + xrandr).
  // Nettoyage des anciennes clés si présentes dans le config entrant.
  if (neoProContent.secondaryDisplayEnabled !== undefined || neoProContent.ledEnabled !== undefined) {
    delete result.secondaryDisplayEnabled;
    delete result.ledEnabled;
    logger.info('[config-merge] secondaryDisplayEnabled ignoré (détection hardware autonome)');
  }
  if (neoProContent.secondaryDisplayResolution !== undefined || neoProContent.ledResolution !== undefined) {
    delete result.secondaryDisplayResolution;
    delete result.ledResolution;
    logger.info('[config-merge] secondaryDisplayResolution ignoré (EDID auto-détecte)');
  }

  // ========================================================================
  // AUTHENTIFICATION TÉLÉCOMMANDE (remotePassword, clubName)
  // Ces champs sont stockés dans la section "auth" pour /remote/login
  // ========================================================================
  if (neoProContent.remotePassword !== undefined || neoProContent.clubName !== undefined) {
    result.auth = result.auth || {};
    if (neoProContent.remotePassword) {
      result.auth.password = neoProContent.remotePassword;
      logger.info('[config-merge] Mot de passe télécommande mis à jour');
    }
    if (neoProContent.clubName) {
      result.auth.clubName = neoProContent.clubName;
      logger.info(`[config-merge] Nom du club mis à jour: ${neoProContent.clubName}`);
    }
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
  // PRÉSERVATION DES VARIANTS SECONDAIRES
  // Le central ne connaît pas les variants.secondary (injectés localement
  // par deploySecondaryVariant). On les ré-injecte après la fusion.
  // ========================================================================
  restoreSecondaryVariants(localConfig, result);

  // ========================================================================
  // SITE SPONSORS (métadonnées sponsors depuis le dashboard central)
  // Synchronise les sponsors du central vers localSponsors[] du Pi
  // ========================================================================
  if (neoProContent.siteSponsors !== undefined) {
    result.localSponsors = mergeSiteSponsors(
      localConfig.localSponsors || [],
      neoProContent.siteSponsors || []
    );
    logger.info(`[config-merge] Site sponsors synchronisés: ${result.localSponsors.length} sponsors`);
  }

  // ========================================================================
  // RESTAURATION DES PARAMÈTRES LOCAUX PROTÉGÉS
  // On s'assure que les paramètres locaux ne sont jamais perdus
  // (sauf localSponsors qui est maintenant géré par mergeSiteSponsors)
  // ========================================================================
  for (const [key, value] of Object.entries(preservedLocalSettings)) {
    // localSponsors est désormais fusionné via mergeSiteSponsors, ne pas écraser
    if (key === 'localSponsors' && neoProContent.siteSponsors !== undefined) {
      continue;
    }
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
 *
 * RÈGLE IMPORTANTE : Le central est la source de vérité pour les sponsors.
 * Tous les sponsors envoyés par le central remplacent les sponsors locaux.
 *
 * - Les sponsors NEOPRO (locked/owner=neopro) sont verrouillés et ne peuvent pas être modifiés localement
 * - Les sponsors Club (locked=false) peuvent être modifiés via le dashboard central
 * - L'ordre des sponsors est préservé tel qu'envoyé par le central
 *
 * @param {Array} localSponsors - Sponsors locaux (utilisé uniquement pour préserver les sponsors non présents dans le central)
 * @param {Array} centralSponsors - Sponsors envoyés par le central (source de vérité)
 * @returns {Array} Sponsors fusionnés
 */
function mergeSponsors(localSponsors, centralSponsors) {
  // Le central envoie la liste complète des sponsors à appliquer
  // On utilise directement cette liste en ajoutant les métadonnées appropriées
  const result = [];
  const processedPaths = new Set();

  // 1. Traiter tous les sponsors du central (NEOPRO et Club confondus)
  for (const sponsor of centralSponsors) {
    const isNeopro = sponsor.locked || sponsor.owner === 'neopro';
    result.push({
      ...sponsor,
      locked: isNeopro,
      owner: isNeopro ? 'neopro' : (sponsor.owner || 'club'),
    });
    if (sponsor.path) {
      processedPaths.add(sponsor.path);
    }
  }

  // 2. Préserver les sponsors Club locaux qui ne sont PAS dans la liste du central
  // (sponsors créés localement via la télécommande ou l'admin Pi)
  for (const sponsor of localSponsors) {
    // Ne garder que les sponsors Club locaux non traités
    if (!sponsor.locked && sponsor.owner !== 'neopro' && sponsor.path && !processedPaths.has(sponsor.path)) {
      result.push({
        ...sponsor,
        locked: false,
        owner: sponsor.owner || 'club',
      });
      logger.debug(`[config-merge] Sponsor local préservé (non présent dans central): ${sponsor.path}`);
    }
  }

  logger.info(`[config-merge] Sponsors fusionnés: ${result.length} (${centralSponsors.length} du central)`);
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
      // Si la catégorie existe localement avec du contenu et que le central
      // l'envoie vide, préserver la version locale (le club ne doit pas perdre ses vidéos)
      const localHasVideos = localCat && (localCat.videos || []).length > 0;
      const centralHasNoVideos = !centralCat.videos || centralCat.videos.length === 0;

      if (localCat && localHasVideos && centralHasNoVideos) {
        // Préserver la version locale qui contient du contenu
        result.push({
          ...localCat,
          locked: false,
          owner: localCat.owner || 'club',
        });
        processedIds.add(centralCat.id);
        logger.info(`[config-merge] Catégorie Club locale préservée (central vide): ${centralCat.id} (${centralCat.name})`);
      } else {
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

/**
 * Fusionne les sponsors du dashboard central avec les sponsors locaux du Pi.
 *
 * - Les sponsors central sont ajoutés/mis à jour dans localSponsors (avec centralId)
 * - Les sponsors purement locaux (sans centralId) sont préservés
 * - Dédoublonne par centralId ET par nom (case-insensitive)
 *
 * @param {Array} localSponsors - Sponsors locaux existants sur le Pi
 * @param {Array} centralSponsors - Sponsors envoyés par le dashboard central
 * @returns {Array} Sponsors fusionnés
 */
function mergeSiteSponsors(localSponsors, centralSponsors) {
  const result = [];
  const processedCentralIds = new Set();
  const processedNames = new Set();

  // 1. Mettre à jour / ajouter les sponsors du central
  for (const central of centralSponsors) {
    // Chercher un sponsor local existant lié à ce centralId
    const existingByCentralId = localSponsors.find(
      s => s.centralId && s.centralId === central.id
    );

    // Ou chercher par nom (case-insensitive) pour les sponsors créés localement
    // qui correspondent à un sponsor central
    const existingByName = !existingByCentralId
      ? localSponsors.find(
          s => !s.centralId && s.name.toLowerCase().trim() === central.name.toLowerCase().trim()
        )
      : null;

    const existing = existingByCentralId || existingByName;

    if (existing) {
      // Mettre à jour le sponsor existant avec les données du central
      // Source héritée du central : 'neopro' si annonceur réseau, sinon préserver la source locale
      const effectiveSource = central.source === 'neopro' ? 'neopro' : (existing.source || 'local');
      result.push({
        ...existing,
        centralId: central.id,
        name: central.name,
        contactEmail: central.contactEmail || existing.contactEmail || '',
        contactPhone: central.contactPhone || existing.contactPhone || '',
        videoFilenames: mergeVideoFilenames(existing.videoFilenames || [], central.videoFilenames || []),
        isActive: central.isActive !== undefined ? central.isActive : existing.isActive,
        source: effectiveSource,
        syncedAt: new Date().toISOString(),
      });
      processedCentralIds.add(central.id);
      processedNames.add(central.name.toLowerCase().trim());
      if (existing.localId) {
        logger.debug(`[config-merge] Sponsor local mis à jour depuis central: ${central.name} (${central.id})`);
      }
    } else {
      // Nouveau sponsor depuis le central — créer une entrée locale
      const localId = `ls_central_${Date.now()}_${central.id.substring(0, 8)}`;
      result.push({
        localId,
        centralId: central.id,
        name: central.name,
        contactEmail: central.contactEmail || '',
        contactPhone: central.contactPhone || '',
        videoFilenames: central.videoFilenames || [],
        isActive: central.isActive !== undefined ? central.isActive : true,
        source: central.source || 'neopro',
        createdAt: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
      });
      processedCentralIds.add(central.id);
      processedNames.add(central.name.toLowerCase().trim());
      logger.info(`[config-merge] Nouveau sponsor depuis central: ${central.name} (${central.id})`);
    }
  }

  // 2. Préserver les sponsors purement locaux (non présents dans le central)
  for (const local of localSponsors) {
    if (local.centralId && processedCentralIds.has(local.centralId)) {
      continue; // Déjà traité
    }
    if (!local.centralId && processedNames.has(local.name.toLowerCase().trim())) {
      continue; // Déjà fusionné par nom
    }
    result.push(local);
    logger.debug(`[config-merge] Sponsor local préservé: ${local.name} (${local.localId})`);
  }

  return result;
}

/**
 * Fusionne les listes de noms de fichiers vidéo (union des deux listes)
 * @param {string[]} localFilenames
 * @param {string[]} centralFilenames
 * @returns {string[]}
 */
function mergeVideoFilenames(localFilenames, centralFilenames) {
  const set = new Set([...localFilenames, ...centralFilenames]);
  return [...set];
}

/**
 * Ré-injecte les variants.secondary depuis la config locale vers la config fusionnée.
 * Le central n'envoie pas les variants (elles sont ajoutées localement par deploySecondaryVariant).
 * Après un merge qui remplace sponsors/categories/timeCategories, les variants sont perdues.
 * Cette fonction les restaure en matchant par chemin vidéo (path).
 *
 * @param {object} localConfig - Configuration locale avant merge
 * @param {object} mergedConfig - Configuration après merge (modifiée en place)
 */
function restoreSecondaryVariants(localConfig, mergedConfig) {
  // 1. Build path → variants map from local config
  const variantsMap = new Map();

  for (const s of localConfig.sponsors || []) {
    if (s.path && s.variants?.secondary) {
      variantsMap.set(s.path, s.variants);
    }
  }
  for (const cat of localConfig.categories || []) {
    for (const v of cat.videos || []) {
      if (v.path && v.variants?.secondary) {
        variantsMap.set(v.path, v.variants);
      }
    }
    for (const sub of cat.subCategories || []) {
      for (const v of sub.videos || []) {
        if (v.path && v.variants?.secondary) {
          variantsMap.set(v.path, v.variants);
        }
      }
    }
  }
  for (const tc of localConfig.timeCategories || []) {
    for (const v of tc.loopVideos || []) {
      if (v.path && v.variants?.secondary) {
        variantsMap.set(v.path, v.variants);
      }
    }
  }

  if (variantsMap.size === 0) return;

  // 2. Re-inject into merged config
  let restored = 0;
  for (const s of mergedConfig.sponsors || []) {
    const v = variantsMap.get(s.path);
    if (v) { s.variants = v; restored++; }
  }
  for (const cat of mergedConfig.categories || []) {
    for (const video of cat.videos || []) {
      const v = variantsMap.get(video.path);
      if (v) { video.variants = v; restored++; }
    }
    for (const sub of cat.subCategories || []) {
      for (const video of sub.videos || []) {
        const v = variantsMap.get(video.path);
        if (v) { video.variants = v; restored++; }
      }
    }
  }
  for (const tc of mergedConfig.timeCategories || []) {
    for (const video of tc.loopVideos || []) {
      const v = variantsMap.get(video.path);
      if (v) { video.variants = v; restored++; }
    }
  }

  if (restored > 0) {
    logger.info(`[config-merge] Variants secondaires restaurées: ${restored} vidéos (depuis ${variantsMap.size} variants locales)`);
  }
}

module.exports = {
  mergeConfigurations,
  mergeSponsors,
  mergeCategories,
  mergeSiteSponsors,
  cleanExpiredVideos,
  isLocked,
  hasLockedContent,
  createBackup,
  calculateConfigHash,
  restoreSecondaryVariants,
  LOCAL_ONLY_SETTINGS,
};
