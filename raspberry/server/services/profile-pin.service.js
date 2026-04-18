const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

/**
 * ProfilePinService — validation PIN profil offline (ADR-058 Phase 1).
 *
 * Lit les metadata PIN ecrites par le sync-agent dans
 * `{PROFILES_DIR}/{profileId}.pin.json` (chmod 600), puis compare le PIN
 * saisi avec le hash bcrypt stocke. Utilise pour la telecommande locale
 * quand le cloud est injoignable.
 *
 * Lockout en memoire : 5 echecs / 10 min par cle `ip:profileId`.
 */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000;

class ProfilePinService {
  /**
   * @param {object} opts
   * @param {string} opts.profilesDir - Dossier contenant les {id}.pin.json
   */
  constructor({ profilesDir }) {
    this._profilesDir = profilesDir;
    /** @type {Map<string, { count: number, firstAt: number }>} */
    this._attempts = new Map();
  }

  _pinPath(profileId) {
    return path.join(this._profilesDir, `${profileId}.pin.json`);
  }

  /**
   * @param {string} profileId
   * @returns {{ remote_pin_required: boolean, remote_pin_hash: string | null } | null}
   */
  _readPinMeta(profileId) {
    const filePath = this._pinPath(profileId);
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[ProfilePin] Failed to parse pin meta', { profileId, error: e.message });
      return null;
    }
  }

  /**
   * Indique si un PIN est requis pour ce profil (offline).
   * @param {string} profileId
   */
  isPinRequired(profileId) {
    const meta = this._readPinMeta(profileId);
    return !!(meta && meta.remote_pin_required && meta.remote_pin_hash);
  }

  _lockoutKey(ip, profileId) {
    return `${ip || 'unknown'}:${profileId}`;
  }

  _checkLockout(key) {
    const entry = this._attempts.get(key);
    if (!entry) return { locked: false };
    if (Date.now() - entry.firstAt > LOCKOUT_MS) {
      this._attempts.delete(key);
      return { locked: false };
    }
    if (entry.count >= MAX_ATTEMPTS) {
      const retryInMs = LOCKOUT_MS - (Date.now() - entry.firstAt);
      return { locked: true, retryInMs };
    }
    return { locked: false };
  }

  _recordFailure(key) {
    const entry = this._attempts.get(key);
    if (!entry || Date.now() - entry.firstAt > LOCKOUT_MS) {
      this._attempts.set(key, { count: 1, firstAt: Date.now() });
    } else {
      entry.count += 1;
    }
  }

  _clearFailures(key) {
    this._attempts.delete(key);
  }

  /**
   * Verifie un PIN saisi cote local.
   * @param {object} args
   * @param {string} args.profileId
   * @param {string} args.pin
   * @param {string} [args.ip]
   * @returns {Promise<{ status: number, body: object }>}
   */
  async verify({ profileId, pin, ip }) {
    if (!profileId || typeof profileId !== 'string') {
      return { status: 400, body: { success: false, error: 'profileId requis' } };
    }
    if (!pin || typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
      return { status: 400, body: { success: false, error: 'PIN invalide (4-6 chiffres)' } };
    }

    const meta = this._readPinMeta(profileId);
    if (!meta || !meta.remote_pin_required || !meta.remote_pin_hash) {
      // Pas de PIN local configure → acces libre offline (aligne avec cloud).
      return { status: 200, body: { success: true, pinRequired: false } };
    }

    const key = this._lockoutKey(ip, profileId);
    const lock = this._checkLockout(key);
    if (lock.locked) {
      return {
        status: 429,
        body: {
          success: false,
          error: 'Trop de tentatives. Reessayez plus tard.',
          retryInMs: lock.retryInMs,
        },
      };
    }

    let match = false;
    try {
      match = await bcrypt.compare(pin, meta.remote_pin_hash);
    } catch (e) {
      console.error('[ProfilePin] bcrypt.compare error', { profileId, error: e.message });
      return { status: 500, body: { success: false, error: 'Erreur interne' } };
    }

    if (!match) {
      this._recordFailure(key);
      return { status: 401, body: { success: false, error: 'PIN incorrect' } };
    }

    this._clearFailures(key);
    return { status: 200, body: { success: true, pinRequired: true } };
  }
}

module.exports = ProfilePinService;
