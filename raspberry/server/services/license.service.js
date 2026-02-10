const fs = require('fs');

/**
 * LicenseService - Reads and evaluates the cached license status.
 *
 * Logic:
 *  - No cache file → CONNECTION_WARNING (needs first connection)
 *  - Cache expired > 14 days → BLOCKED
 *  - Cache expired 7-14 days → GRACE_PERIOD
 *  - Otherwise → return cached data as-is
 */
class LicenseService {
  constructor({ licenseCachePath }) {
    this._cachePath = licenseCachePath;
    this._CACHE_TTL_DAYS = 7;
    this._GRACE_PERIOD_DAYS = 7;
  }

  getStatus() {
    if (!fs.existsSync(this._cachePath)) {
      return {
        status: 'CONNECTION_WARNING',
        reason: 'no_cache',
        message_remote: 'Veuillez connecter le bo\u00eetier \u00e0 Internet pour activer la licence.',
        needs_connection: true,
      };
    }

    const cacheData = JSON.parse(fs.readFileSync(this._cachePath, 'utf8'));

    if (cacheData.last_server_check) {
      const lastCheck = new Date(cacheData.last_server_check);
      const now = new Date();
      const daysSinceCheck = Math.floor((now - lastCheck) / (1000 * 60 * 60 * 24));

      // Cache expired > 14 days → blocked
      if (daysSinceCheck > this._CACHE_TTL_DAYS + this._GRACE_PERIOD_DAYS) {
        return {
          status: 'BLOCKED',
          reason: 'connection_required',
          days_since_check: daysSinceCheck,
          message_tv: 'Connexion Internet requise',
          message_remote: `Le bo\u00eetier n'a pas contact\u00e9 le serveur depuis ${daysSinceCheck} jours. Veuillez le connecter \u00e0 Internet.`,
          can_auto_unblock: true,
          needs_connection: true,
        };
      }

      // Grace period (7-14 days)
      if (daysSinceCheck > this._CACHE_TTL_DAYS) {
        const daysLeft = this._CACHE_TTL_DAYS + this._GRACE_PERIOD_DAYS - daysSinceCheck;
        return {
          status: 'GRACE_PERIOD',
          reason: 'connection_grace',
          days_since_check: daysSinceCheck,
          days_until_block: daysLeft,
          message_remote: `Connexion requise dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''} pour valider la licence.`,
          can_auto_unblock: true,
          needs_connection: true,
        };
      }

      cacheData.days_since_check = daysSinceCheck;
    }

    return cacheData;
  }
}

module.exports = LicenseService;
