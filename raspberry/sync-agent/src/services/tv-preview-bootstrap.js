/**
 * TV preview bootstrap (SPEC-V2-TVMON-01 / ADR-101).
 *
 * Au boot du sync-agent : détecte le modèle Pi et écrit `settings.tvPreviewEnabled`
 * dans configuration.json. La règle V1 :
 *   - Pi 5 → enabled (true)
 *   - Pi 4 / unknown → disabled (false)  (charge CPU > seuil critique en software encode)
 *
 * Le socket-server lit ce flag au boot pour activer/désactiver la capacité MJPEG
 * (cf. raspberry/server/server.js → readTvPreviewEnabled).
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const { detectPiModel } = require('../metrics/hardware-metrics');

/**
 * @param {string} configPath - Chemin absolu vers configuration.json
 * @param {object} [opts]
 * @param {boolean} [opts.forceEnable] - override pour tests / Pi 4 expérimental
 * @returns {Promise<{piModel: string, isPi5: boolean, enabled: boolean, changed: boolean}>}
 */
async function bootstrapTvPreviewFlag(configPath, opts = {}) {
  const { model, isPi5 } = await detectPiModel();
  const enabled = opts.forceEnable === true ? true : isPi5;

  let cfg = {};
  let exists = false;
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      cfg = raw ? JSON.parse(raw) : {};
      exists = true;
    }
  } catch (err) {
    logger.warn('[tv-preview-bootstrap] Could not read configuration.json:', err.message);
    return { piModel: model, isPi5, enabled, changed: false };
  }

  cfg.settings = cfg.settings || {};
  const previous = cfg.settings.tvPreviewEnabled;
  if (previous === enabled) {
    logger.info(`[tv-preview-bootstrap] tvPreviewEnabled already aligned (${enabled})`, {
      piModel: model,
    });
    return { piModel: model, isPi5, enabled, changed: false };
  }

  cfg.settings.tvPreviewEnabled = enabled;

  // Écriture atomique cohérente avec ADR-028 (pattern utilisé partout pour configuration.json)
  const tmpPath = `${configPath}.tmp`;
  try {
    if (!exists) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    fs.writeFileSync(tmpPath, JSON.stringify(cfg, null, 2), 'utf8');
    fs.renameSync(tmpPath, configPath);
  } catch (err) {
    logger.error('[tv-preview-bootstrap] Failed to write configuration.json:', err.message);
    try { fs.unlinkSync(tmpPath); } catch { /* noop */ }
    return { piModel: model, isPi5, enabled, changed: false };
  }

  logger.info(`[tv-preview-bootstrap] tvPreviewEnabled set to ${enabled}`, {
    piModel: model,
    previous,
  });
  return { piModel: model, isPi5, enabled, changed: true };
}

module.exports = { bootstrapTvPreviewFlag };
