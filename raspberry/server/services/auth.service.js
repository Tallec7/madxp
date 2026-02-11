const fs = require('fs');
const path = require('path');

/**
 * AuthService - First-time password setup and status checking.
 *
 * Reads/writes `configuration.json` on the Pi.
 * Broadcasts config reload to all Socket.IO clients after setup.
 */
class AuthService {
  /**
   * @param {object} opts
   * @param {string} opts.configPath - Path to configuration.json
   * @param {object} opts.io         - Socket.IO server instance (for broadcasting)
   */
  constructor({ configPath, io }) {
    this._configPath = configPath;
    this._io = io;
  }

  /**
   * Set the initial password during first deployment.
   * @param {string} password
   * @returns {object} { success: true }
   * @throws {object} { status, error } for validation / already-configured cases
   */
  async setup(password) {
    if (!password) {
      return { status: 400, error: 'Mot de passe requis' };
    }

    if (password.length < 4) {
      return { status: 400, error: 'Le mot de passe doit contenir au moins 4 caract\u00e8res' };
    }

    // Load existing config or create defaults
    let config = {
      remote: { title: 'NeoPro' },
      version: '1.0.0',
      categories: [],
      sponsors: [],
    };

    if (fs.existsSync(this._configPath)) {
      try {
        const data = fs.readFileSync(this._configPath, 'utf8');
        config = JSON.parse(data);
      } catch (e) {
        console.warn('[AuthSetup] Failed to parse existing config, using defaults');
      }
    }

    // Block if password is already set
    if (config.auth && config.auth.password) {
      return {
        status: 403,
        error: 'Un mot de passe est d\u00e9j\u00e0 configur\u00e9. Utilisez le panneau admin pour le modifier.',
      };
    }

    // Set the password
    config.auth = config.auth || {};
    config.auth.password = password;
    config.auth.configuredAt = new Date().toISOString();

    // Ensure directory exists
    const configDir = path.dirname(this._configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Save configuration
    fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2));

    console.log('[AuthSetup] Initial password configured successfully');

    // Notify all clients of config update
    this._io.emit('action', { type: 'reload-config', data: config });

    return { success: true };
  }

  /**
   * Check if initial setup is required.
   * @returns {object} { requiresSetup: boolean }
   */
  getStatus() {
    let requiresSetup = true;

    if (fs.existsSync(this._configPath)) {
      try {
        const data = fs.readFileSync(this._configPath, 'utf8');
        const config = JSON.parse(data);
        requiresSetup = !config.auth || !config.auth.password;
      } catch (e) {
        console.warn('[AuthStatus] Failed to parse config');
      }
    }

    return { requiresSetup };
  }
}

module.exports = AuthService;
