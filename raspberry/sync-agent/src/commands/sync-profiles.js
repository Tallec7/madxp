// @ts-check
const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');
const { mergeConfigurations, calculateConfigHash } = require('../utils/config-merge');
const { atomicWriteJson } = require('../utils/safe-config-io');

const PROFILES_DIR = config.paths.root + '/webapp/profiles';
const CLUBS_JSON_PATH = PROFILES_DIR + '/clubs.json';
const ACTIVE_PROFILE_PATH = PROFILES_DIR + '/active-profile';
const CONFIG_PATH = config.paths.root + '/webapp/configuration.json';
const BACKUP_PATH = config.paths.root + '/webapp/configuration.backup.json';

/**
 * Synchronise tous les profils depuis le central server.
 * Ecrit chaque profil dans profiles/{id}.json, genere clubs.json,
 * nettoie les profils obsoletes, et applique le profil actif.
 *
 * @param {Object} data - { profiles: Array<{ id, name, display_name, city, sport, is_default, configuration }> }
 */
async function syncProfiles(data) {
  const { profiles } = data;

  if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
    throw new Error('Missing or empty profiles array in sync_profiles command');
  }

  logger.info('Syncing profiles', { count: profiles.length });

  // 1. Creer le dossier profiles/ s'il n'existe pas
  await fs.ensureDir(PROFILES_DIR);

  // 2. Ecrire chaque profil
  for (const profile of profiles) {
    const profilePath = `${PROFILES_DIR}/${profile.id}.json`;
    await atomicWriteJson(profilePath, profile.configuration);
    logger.info('Profile written', { id: profile.id, name: profile.name });

    // ADR-058 — metadata PIN (bcrypt hash) pour validation offline cote Pi.
    // Ecrit profiles/{id}.pin.json avec { remote_pin_required, remote_pin_hash, remote_pin_updated_at }
    // chmod 600 pour limiter la lecture du hash (defense-in-depth).
    const pinMetaPath = `${PROFILES_DIR}/${profile.id}.pin.json`;
    if (profile.remote_pin_required && profile.remote_pin_hash) {
      const meta = {
        remote_pin_required: true,
        remote_pin_hash: profile.remote_pin_hash,
        remote_pin_updated_at: profile.remote_pin_updated_at || null,
      };
      await fs.writeFile(pinMetaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });
      logger.info('Profile PIN metadata written', { id: profile.id });
    } else if (await fs.pathExists(pinMetaPath)) {
      // PIN retire cote cloud -> nettoyer le fichier local pour eviter les valid PIN orphelins
      await fs.remove(pinMetaPath);
      logger.info('Profile PIN metadata cleared', { id: profile.id });
    }
  }

  // 3. Generer clubs.json (metadata pour le club-selector Angular)
  const clubs = profiles.map((p) => ({
    id: p.id,
    name: p.display_name || p.name,
    city: p.city || '',
    sport: p.sport || '',
  }));
  await atomicWriteJson(CLUBS_JSON_PATH, clubs);
  logger.info('clubs.json generated', { count: clubs.length });

  // 4. Nettoyer les profils qui n'existent plus (et leurs metadata PIN associees)
  const existingFiles = await fs.readdir(PROFILES_DIR);
  const validIds = new Set(profiles.map((p) => p.id));
  for (const file of existingFiles) {
    if (file === 'clubs.json' || file === 'active-profile') continue;
    // Extraire l'id du profil (supporte "{id}.json" et "{id}.pin.json")
    const fileId = file.replace(/\.(pin\.)?json$/, '');
    if (!validIds.has(fileId)) {
      await fs.remove(`${PROFILES_DIR}/${file}`);
      logger.info('Removed stale profile', { file });
    }
  }

  // 5. Verifier/initialiser le profil actif
  let activeProfileId = null;
  if (await fs.pathExists(ACTIVE_PROFILE_PATH)) {
    activeProfileId = (await fs.readFile(ACTIVE_PROFILE_PATH, 'utf8')).trim();
  }
  if (!activeProfileId || !validIds.has(activeProfileId)) {
    const defaultProfile = profiles.find((p) => p.is_default) || profiles[0];
    activeProfileId = defaultProfile.id;
    await fs.writeFile(ACTIVE_PROFILE_PATH, activeProfileId);
    logger.info('Active profile set to default', { id: activeProfileId });
  }

  // 6. Appliquer le profil actif dans configuration.json
  await applyProfile(activeProfileId);

  return {
    success: true,
    profileCount: profiles.length,
    activeProfileId,
  };
}

/**
 * Switche vers un profil specifique (commande depuis le dashboard ou la remote).
 *
 * @param {Object} data - { profileId: string }
 */
async function switchProfile(data) {
  const { profileId } = data;

  if (!profileId) {
    throw new Error('Missing profileId in switch_profile command');
  }

  const profilePath = `${PROFILES_DIR}/${profileId}.json`;
  if (!await fs.pathExists(profilePath)) {
    throw new Error(`Profile ${profileId} not found at ${profilePath}`);
  }

  // Mettre a jour le marqueur de profil actif
  await fs.writeFile(ACTIVE_PROFILE_PATH, profileId);

  // Appliquer le profil
  await applyProfile(profileId);

  logger.info('Profile switched', { profileId });

  return { success: true, activeProfileId: profileId };
}

/**
 * Applique un profil comme configuration active.
 * Merge le contenu du profil (champs manages) avec les settings locaux preserves.
 *
 * @param {string} profileId
 */
async function applyProfile(profileId) {
  const profilePath = `${PROFILES_DIR}/${profileId}.json`;

  if (!await fs.pathExists(profilePath)) {
    throw new Error(`Profile file not found: ${profilePath}`);
  }

  // Lire la config locale actuelle
  let localConfig = {};
  if (await fs.pathExists(CONFIG_PATH)) {
    const localContent = await fs.readFile(CONFIG_PATH, 'utf8');
    localConfig = JSON.parse(localContent);
  }

  // Backup
  await atomicWriteJson(BACKUP_PATH, localConfig);

  // Lire le profil
  const profileContent = await fs.readFile(profilePath, 'utf8');
  const profileConfig = JSON.parse(profileContent);

  // Merge : le profil remplace les champs manages, les settings locaux sont preserves
  const hashBefore = calculateConfigHash(localConfig);
  const finalConfig = mergeConfigurations(localConfig, profileConfig);
  const hashAfter = calculateConfigHash(finalConfig);

  // Ecrire la configuration fusionnee (atomique : tmp + rename, ADR-028)
  await atomicWriteJson(CONFIG_PATH, finalConfig);

  logger.info('Profile applied to configuration.json', {
    profileId,
    hashBefore,
    hashAfter,
    changed: hashBefore !== hashAfter,
  });

  // Notifier l'application locale
  await notifyLocalApp();
}

/**
 * Notifie l'application locale du changement de configuration.
 */
async function notifyLocalApp() {
  const localSocket = require('../services/local-socket');
  localSocket.emit('config_updated');
  logger.info('Local server notified of config change');
}

module.exports = { syncProfiles, switchProfile };
