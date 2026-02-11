// @ts-check
/** @typedef {import('./types').LicenseStatus} LicenseStatus */
/** @typedef {import('./types').LicenseCache} LicenseCache */

/**
 * License Cache Module
 *
 * Gère le cache local du statut de licence sur le Raspberry Pi.
 * Permet au Pi de fonctionner hors ligne pendant une durée limitée (7 jours)
 * avec une période de grâce supplémentaire (7 jours) avant blocage.
 *
 * Fichier cache : /home/pi/neopro/data/license_cache.json
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

// Configuration
const CONFIG = {
  CACHE_PATH: '/home/pi/neopro/data/license_cache.json',
  CACHE_TTL_DAYS: 7, // Cache valide pendant 7 jours
  GRACE_PERIOD_DAYS: 7, // 7 jours supplémentaires avant blocage
  BACKUP_PATH: '/home/pi/neopro/data/license_cache.backup.json'
};

/**
 * Structure du cache :
 * {
 *   status: 'VALID' | 'WARNING' | 'GRACE_PERIOD' | 'CONNECTION_WARNING' | 'BLOCKED',
 *   reason?: string,
 *   subscription_end?: string (ISO date),
 *   days_left?: number,
 *   days_expired?: number,
 *   can_auto_unblock?: boolean,
 *   message_tv?: string,
 *   message_remote?: string,
 *   cache_valid_until: string (ISO date),
 *   last_server_check: string (ISO date),
 *   last_updated: string (ISO date)
 * }
 */

class LicenseCache {
  constructor() {
    this.cache = null;
    this.ensureDataDirectory();
  }

  /**
   * S'assure que le dossier data existe
   */
  ensureDataDirectory() {
    const dataDir = path.dirname(CONFIG.CACHE_PATH);
    fs.ensureDirSync(dataDir);
  }

  /**
   * Charge le cache depuis le fichier
   * @returns {Object|null} Le cache ou null si invalide/inexistant
   */
  load() {
    try {
      if (!fs.existsSync(CONFIG.CACHE_PATH)) {
        logger.debug('License cache file does not exist');
        return null;
      }

      const content = fs.readFileSync(CONFIG.CACHE_PATH, 'utf8');
      this.cache = JSON.parse(content);

      // Validation basique
      if (!this.cache.last_server_check || !this.cache.status) {
        logger.warn('Invalid license cache structure');
        return null;
      }

      logger.debug('License cache loaded', {
        status: this.cache.status,
        lastCheck: this.cache.last_server_check
      });

      return this.cache;
    } catch (error) {
      logger.error('Failed to load license cache', { error: error.message });
      return null;
    }
  }

  /**
   * Sauvegarde le statut de licence reçu du serveur
   * @param {Object} serverStatus - Statut de licence du serveur
   */
  save(serverStatus) {
    try {
      // Créer une copie de sauvegarde avant d'écrire
      if (fs.existsSync(CONFIG.CACHE_PATH)) {
        fs.copyFileSync(CONFIG.CACHE_PATH, CONFIG.BACKUP_PATH);
      }

      const cacheData = {
        ...serverStatus,
        last_server_check: new Date().toISOString(),
        last_updated: new Date().toISOString()
      };

      fs.writeFileSync(CONFIG.CACHE_PATH, JSON.stringify(cacheData, null, 2), 'utf8');
      this.cache = cacheData;

      logger.info('License cache saved', {
        status: cacheData.status,
        reason: cacheData.reason,
        cacheValidUntil: cacheData.cache_valid_until
      });
    } catch (error) {
      logger.error('Failed to save license cache', { error: error.message });
    }
  }

  /**
   * Vérifie si le cache est dans sa période de validité (7 jours)
   * @returns {boolean}
   */
  isValid() {
    if (!this.cache || !this.cache.last_server_check) {
      return false;
    }

    const lastCheck = new Date(this.cache.last_server_check);
    const now = new Date();
    const daysSinceCheck = (now - lastCheck) / (1000 * 60 * 60 * 24);

    return daysSinceCheck <= CONFIG.CACHE_TTL_DAYS;
  }

  /**
   * Vérifie si on est dans la période de grâce (7-14 jours sans connexion)
   * @returns {boolean}
   */
  isInGracePeriod() {
    if (!this.cache || !this.cache.last_server_check) {
      return false;
    }

    const lastCheck = new Date(this.cache.last_server_check);
    const now = new Date();
    const daysSinceCheck = (now - lastCheck) / (1000 * 60 * 60 * 24);

    return daysSinceCheck > CONFIG.CACHE_TTL_DAYS &&
           daysSinceCheck <= (CONFIG.CACHE_TTL_DAYS + CONFIG.GRACE_PERIOD_DAYS);
  }

  /**
   * Vérifie si le blocage doit être actif (> 14 jours sans connexion)
   * @returns {boolean}
   */
  isExpired() {
    if (!this.cache || !this.cache.last_server_check) {
      // Si pas de cache du tout, on bloque par sécurité après 24h
      // (pour permettre la première connexion)
      return false;
    }

    const lastCheck = new Date(this.cache.last_server_check);
    const now = new Date();
    const daysSinceCheck = (now - lastCheck) / (1000 * 60 * 60 * 24);

    return daysSinceCheck > (CONFIG.CACHE_TTL_DAYS + CONFIG.GRACE_PERIOD_DAYS);
  }

  /**
   * Calcule le statut effectif en tenant compte du cache et de sa fraîcheur
   * @returns {Object} Statut effectif avec message approprié
   */
  getEffectiveStatus() {
    this.load();

    // Cas 1: Pas de cache - première connexion ou cache corrompu
    if (!this.cache) {
      return {
        status: 'CONNECTION_WARNING',
        reason: 'no_cache',
        days_since_check: null,
        message_tv: 'Connexion au serveur requise',
        message_remote: 'Veuillez connecter le boîtier à Internet pour activer la licence.',
        needs_connection: true
      };
    }

    const lastCheck = new Date(this.cache.last_server_check);
    const now = new Date();
    const daysSinceCheck = Math.floor((now - lastCheck) / (1000 * 60 * 60 * 24));

    // Cas 2: Cache valide et statut serveur BLOCKED - respecter le blocage serveur
    if (this.cache.status === 'BLOCKED') {
      return {
        ...this.cache,
        days_since_check: daysSinceCheck,
        effective_reason: this.cache.reason || 'server_blocked'
      };
    }

    // Cas 3: Cache expiré (> 14 jours) - blocage pour connexion requise
    if (this.isExpired()) {
      return {
        status: 'BLOCKED',
        reason: 'connection_required',
        days_since_check: daysSinceCheck,
        original_status: this.cache.status,
        message_tv: 'Connexion Internet requise',
        message_remote: `Le boîtier n'a pas contacté le serveur depuis ${daysSinceCheck} jours. Veuillez le connecter à Internet.`,
        can_auto_unblock: true,
        needs_connection: true
      };
    }

    // Cas 4: En période de grâce (7-14 jours) - warning urgent
    if (this.isInGracePeriod()) {
      const daysLeft = CONFIG.CACHE_TTL_DAYS + CONFIG.GRACE_PERIOD_DAYS - daysSinceCheck;
      return {
        status: 'GRACE_PERIOD',
        reason: 'connection_grace',
        days_since_check: daysSinceCheck,
        days_until_block: daysLeft,
        original_status: this.cache.status,
        message_tv: null, // Pas de message sur TV pendant la grâce
        message_remote: `Connexion requise dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''} pour valider la licence.`,
        can_auto_unblock: true,
        needs_connection: true
      };
    }

    // Cas 5: Cache valide - retourner le statut serveur avec info de fraîcheur
    if (this.isValid()) {
      // Si le statut serveur indique un warning d'expiration imminente
      if (this.cache.status === 'WARNING' || this.cache.status === 'GRACE_PERIOD') {
        return {
          ...this.cache,
          days_since_check: daysSinceCheck,
          effective_reason: this.cache.reason
        };
      }

      // Statut OK
      return {
        status: 'VALID',
        reason: null,
        days_since_check: daysSinceCheck,
        subscription_end: this.cache.subscription_end,
        days_left: this.cache.days_left,
        message_tv: null,
        message_remote: null,
        needs_connection: false
      };
    }

    // Fallback - ne devrait pas arriver
    return {
      status: 'CONNECTION_WARNING',
      reason: 'cache_uncertain',
      days_since_check: daysSinceCheck,
      message_remote: 'Veuillez connecter le boîtier à Internet pour valider la licence.',
      needs_connection: true
    };
  }

  /**
   * Retourne le nombre de jours depuis la dernière vérification serveur
   * @returns {number|null}
   */
  getDaysSinceLastCheck() {
    if (!this.cache || !this.cache.last_server_check) {
      return null;
    }

    const lastCheck = new Date(this.cache.last_server_check);
    const now = new Date();
    return Math.floor((now - lastCheck) / (1000 * 60 * 60 * 24));
  }

  /**
   * Retourne le statut brut du cache (sans calcul de fraîcheur)
   * @returns {Object|null}
   */
  getRawStatus() {
    return this.cache;
  }

  /**
   * Supprime le cache (utilisé pour les tests ou reset)
   */
  clear() {
    try {
      if (fs.existsSync(CONFIG.CACHE_PATH)) {
        fs.unlinkSync(CONFIG.CACHE_PATH);
      }
      this.cache = null;
      logger.info('License cache cleared');
    } catch (error) {
      logger.error('Failed to clear license cache', { error: error.message });
    }
  }

  /**
   * Retourne les informations de configuration du cache
   * @returns {Object}
   */
  getConfig() {
    return {
      cacheTtlDays: CONFIG.CACHE_TTL_DAYS,
      gracePeriodDays: CONFIG.GRACE_PERIOD_DAYS,
      totalMaxOfflineDays: CONFIG.CACHE_TTL_DAYS + CONFIG.GRACE_PERIOD_DAYS,
      cachePath: CONFIG.CACHE_PATH
    };
  }
}

// Export singleton
const licenseCache = new LicenseCache();
module.exports = licenseCache;
module.exports.LicenseCache = LicenseCache;
module.exports.CONFIG = CONFIG;
