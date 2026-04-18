const fs = require('fs');

/**
 * HotspotService — expose le statut du hotspot WiFi local pour affichage QR
 * sur la TV (ADR-060 Phase 3 couche 2).
 *
 * Lit les credentials depuis `configuration.json.hotspot` (settings locaux
 * protégés du merge sync-agent). La rotation du PSK reste la responsabilité
 * du sync-agent (cf. raspberry/sync-agent/src/commands/hotspot.js).
 *
 * Le service ne **modifie jamais** la config — read-only.
 */
class HotspotService {
  /**
   * @param {object} opts
   * @param {string} opts.configPath - Chemin absolu vers configuration.json
   */
  constructor({ configPath }) {
    this._configPath = configPath;
  }

  /**
   * @returns {{ ssid: string | null, password: string | null, active: boolean, updatedAt: string | null }}
   */
  getStatus() {
    try {
      if (!fs.existsSync(this._configPath)) {
        return { ssid: null, password: null, active: false, updatedAt: null };
      }
      const raw = fs.readFileSync(this._configPath, 'utf8');
      const config = JSON.parse(raw);
      const hotspot = config?.hotspot || {};

      const ssid = typeof hotspot.ssid === 'string' && hotspot.ssid.length > 0 ? hotspot.ssid : null;
      const password =
        typeof hotspot.password === 'string' && hotspot.password.length >= 8 ? hotspot.password : null;
      const active = Boolean(hotspot.enabled) && ssid !== null && password !== null;
      const updatedAt = typeof hotspot.updatedAt === 'string' ? hotspot.updatedAt : null;

      return { ssid, password, active, updatedAt };
    } catch (err) {
      return { ssid: null, password: null, active: false, updatedAt: null };
    }
  }

  /**
   * Payload WiFi conforme au standard QR (`WIFI:T:WPA;S:...;P:...;;`).
   * Caractères spéciaux échappés (`\`, `;`, `,`, `:`, `"`).
   *
   * @returns {string | null} null si hotspot inactif ou credentials manquants
   */
  getQrPayload() {
    const { ssid, password, active } = this.getStatus();
    if (!active || !ssid || !password) return null;
    const esc = (s) => s.replace(/([\\;,:"])/g, '\\$1');
    return `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;`;
  }
}

module.exports = HotspotService;
