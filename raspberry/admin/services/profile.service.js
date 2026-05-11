/**
 * ProfileService — Gestion des profils multi-clubs sur le Pi (offline-first).
 *
 * Les profils sont synchés depuis le cloud par sync-agent et stockés dans
 * webapp/profiles/{id}.json. Ce service permet de lister et d'activer un
 * profil localement sans connexion internet.
 *
 * Source de vérité fichiers :
 *   webapp/profiles/clubs.json      — liste [{id, name, city, sport}]
 *   webapp/profiles/active-profile  — ID du profil actif (fichier texte)
 *   webapp/profiles/{id}.json       — configuration complète du profil
 *   webapp/configuration.json       — config active fusionnée (kiosk)
 */

const fs = require('fs').promises;
const path = require('path');
const { NEOPRO_DIR } = require('../helpers');

// Ces champs sont propres au boîtier et ne doivent jamais être écrasés par
// un profil cloud — miroir de LOCAL_ONLY_SETTINGS dans sync-agent/config-merge.
const LOCAL_ONLY_KEYS = [
  'settings',
  'siteId',
  'siteName',
  'clubName',
  'apiKey',
  'hotspot',
  'localNetwork',
  'localSponsors',
  'featureOverrides',
  'auth',
];

const PROFILES_DIR = path.join(NEOPRO_DIR, 'webapp', 'profiles');
const CLUBS_JSON_PATH = path.join(PROFILES_DIR, 'clubs.json');
const ACTIVE_PROFILE_PATH = path.join(PROFILES_DIR, 'active-profile');
const CONFIG_PATH = path.join(NEOPRO_DIR, 'webapp', 'configuration.json');

/**
 * Lit un fichier JSON, retourne `fallback` si absent ou invalide.
 */
async function readJsonSafe(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

/**
 * Écriture atomique : écrit dans un .tmp puis rename (ADR-028).
 */
async function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 4), 'utf8');
  await fs.rename(tmp, filePath);
}

class ProfileService {
  /**
   * Retourne la liste des profils disponibles sur le Pi.
   * Retourne [] si clubs.json est absent (Pi mono-club legacy sans multi-profils).
   *
   * @returns {Promise<Array<{id: string, name: string, city: string, sport: string, isActive: boolean}>>}
   */
  async getProfiles() {
    const clubs = await readJsonSafe(CLUBS_JSON_PATH, null);
    if (!clubs || !Array.isArray(clubs)) {
      return [];
    }

    const activeId = await this._readActiveProfileId();

    return clubs.map((club) => ({
      id: club.id,
      name: club.name || club.id,
      city: club.city || '',
      sport: club.sport || '',
      isActive: club.id === activeId,
    }));
  }

  /**
   * Retourne le profil actif avec ses métadonnées.
   * Retourne null si aucun profil actif (Pi legacy sans multi-profils).
   *
   * @returns {Promise<{id: string, name: string, city: string, sport: string}|null>}
   */
  async getActiveProfile() {
    const activeId = await this._readActiveProfileId();
    if (!activeId) return null;

    const clubs = await readJsonSafe(CLUBS_JSON_PATH, []);
    const meta = Array.isArray(clubs) ? clubs.find((c) => c.id === activeId) : null;

    return {
      id: activeId,
      name: meta?.name || activeId,
      city: meta?.city || '',
      sport: meta?.sport || '',
    };
  }

  /**
   * Active un profil localement sans connexion internet.
   *
   * Applique le même algorithme que sync-agent/commands/sync-profiles.js#applyProfile :
   *   1. Lit configuration.json courante pour préserver LOCAL_ONLY_KEYS
   *   2. Lit profiles/{id}.json (contenu cloud syncé)
   *   3. Fusionne : profil + LOCAL_ONLY_KEYS préservés
   *   4. Écrit configuration.json (atomique)
   *   5. Écrit profiles/active-profile
   *
   * @param {string} profileId
   * @returns {Promise<{success: boolean, activeProfileId: string}>}
   */
  async switchProfile(profileId) {
    if (!profileId || typeof profileId !== 'string') {
      throw Object.assign(new Error('profileId invalide'), { code: 'INVALID_ID' });
    }

    // Guard path traversal : l'ID ne doit pas contenir de séparateurs de chemin
    if (profileId.includes('/') || profileId.includes('\\') || profileId.includes('..')) {
      throw Object.assign(new Error('profileId invalide'), { code: 'INVALID_ID' });
    }

    const profilePath = path.join(PROFILES_DIR, `${profileId}.json`);
    let profileConfig;
    try {
      const content = await fs.readFile(profilePath, 'utf8');
      profileConfig = JSON.parse(content);
    } catch {
      throw Object.assign(new Error(`Profil ${profileId} introuvable`), { code: 'NOT_FOUND' });
    }

    // Préserver les settings locaux depuis configuration.json courant
    const localConfig = await readJsonSafe(CONFIG_PATH, {});
    const localOnly = {};
    for (const key of LOCAL_ONLY_KEYS) {
      if (localConfig[key] !== undefined) {
        localOnly[key] = JSON.parse(JSON.stringify(localConfig[key]));
      }
    }

    // Merge : profil cloud comme base, LOCAL_ONLY_KEYS par-dessus
    const merged = { ...profileConfig, ...localOnly };

    // Écriture atomique de configuration.json
    await atomicWriteJson(CONFIG_PATH, merged);

    // Mise à jour du marqueur de profil actif
    await fs.writeFile(ACTIVE_PROFILE_PATH, profileId, 'utf8');

    return { success: true, activeProfileId: profileId };
  }

  /**
   * Indique si des profils multi-clubs sont disponibles sur ce Pi.
   * Retourne false sur un Pi legacy (pas de clubs.json).
   *
   * @returns {Promise<boolean>}
   */
  async hasProfiles() {
    const profiles = await this.getProfiles();
    return profiles.length > 1;
  }

  // ---------------------------------------------------------------------------
  // Privé
  // ---------------------------------------------------------------------------

  async _readActiveProfileId() {
    try {
      const id = await fs.readFile(ACTIVE_PROFILE_PATH, 'utf8');
      return id.trim() || null;
    } catch {
      return null;
    }
  }
}

module.exports = ProfileService;
