const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

/**
 * ReceiversService — Détection passive des receivers WiFi connectés au hotspot Pi.
 *
 * Surveille `/var/lib/misc/dnsmasq.leases` (mtime polling) avec fallback `arp -an`
 * pour détecter les MACs présentes sur `wlan0`. Calcule un diff de l'état précédent
 * vs courant et émet `connected-receivers-changed` à chaque transition (idempotent).
 *
 * Pattern reproduit depuis `hdmi.service.js` (PROP-002 phase 5) — classe avec état
 * interne, parsing fs, fallback chains, pas de cache TTL (état refresh à chaque tick).
 *
 * Détection kind par OUI MAC :
 *  - Préfixes Amazon Fire Stick (OUI publics) → `kind: 'firestick'`
 *  - Sinon → `kind: 'browser'` (générique pour SaaS / staff phone)
 */

const LEASES_PATH = '/var/lib/misc/dnsmasq.leases';
const LEASES_POLL_MS = 10000; // 10s
const ARP_POLL_MS = 30000; // 30s

// OUI Amazon (3 premiers octets MAC, lowercase) — Fire TV / Fire Stick
const AMAZON_OUIS = [
  '0c:43:f9',
  '08:e6:38',
  '74:c2:46',
  'fc:65:de',
  'ac:bc:32',
  'f0:81:73',
  '40:b4:cd',
  '38:f7:3d',
  '68:54:fd',
];

const MAC_REGEX = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;
const ARP_LINE_REGEX = /at ([0-9a-f:]{17}) \[ether\] on wlan0/gi;

class ReceiversService {
  constructor() {
    /** @type {Map<string, { kind: string, lastSeenAt: string }>} */
    this._state = new Map();
    this._lastLeasesMtime = 0;
    this._io = null;
    this._leasesInterval = null;
    this._arpInterval = null;
  }

  /**
   * Démarre les polls (10s leases / 30s ARP) + scan initial immédiat.
   * @param {object} io - Instance Socket.IO (doit exposer `.emit(event, payload)`)
   */
  start(io) {
    this._io = io;
    console.info('[Receivers] Service started');

    this._leasesInterval = setInterval(() => this._scanLeases(), LEASES_POLL_MS);
    this._arpInterval = setInterval(() => {
      this._scanArp().catch((err) => {
        console.warn('[Receivers] ARP scan failed:', err.message);
      });
    }, ARP_POLL_MS);

    // Scan initial immédiat (best-effort)
    try {
      this._scanLeases();
    } catch (err) {
      console.warn('[Receivers] Initial leases scan failed:', err.message);
    }
    this._scanArp().catch((err) => {
      console.warn('[Receivers] Initial ARP scan failed:', err.message);
    });
  }

  /**
   * Arrête les polls. Idempotent.
   */
  stop() {
    if (this._leasesInterval) {
      clearInterval(this._leasesInterval);
      this._leasesInterval = null;
    }
    if (this._arpInterval) {
      clearInterval(this._arpInterval);
      this._arpInterval = null;
    }
    console.info('[Receivers] Service stopped');
  }

  /**
   * @returns {Array<{mac: string, kind: string, lastSeenAt: string}>}
   */
  getReceivers() {
    return Array.from(this._state.entries())
      .map(([mac, v]) => ({ mac, ...v }))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  /**
   * Infère le `kind` depuis le préfixe OUI (3 premiers octets de la MAC).
   * @param {string} mac - MAC address (lowercase ou mixed case)
   * @returns {'firestick'|'browser'}
   */
  _inferKind(mac) {
    const lower = mac.toLowerCase();
    const oui = lower.slice(0, 8);
    return AMAZON_OUIS.includes(oui) ? 'firestick' : 'browser';
  }

  /**
   * Lit `dnsmasq.leases` si mtime a changé, parse, diff l'état, émet si changé.
   */
  _scanLeases() {
    let stat;
    try {
      stat = fs.statSync(LEASES_PATH);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        console.warn('[Receivers] dnsmasq.leases missing — skipping scan');
        return;
      }
      console.warn('[Receivers] statSync failed:', err.message);
      return;
    }

    if (stat.mtimeMs === this._lastLeasesMtime) {
      return; // No change since last scan
    }
    this._lastLeasesMtime = stat.mtimeMs;

    let content;
    try {
      content = fs.readFileSync(LEASES_PATH, 'utf8');
    } catch (err) {
      console.warn('[Receivers] readFileSync failed:', err.message);
      return;
    }

    const currentMacs = new Set();
    const lines = String(content).split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const fields = trimmed.split(/\s+/);
      // Format: expiration mac ip hostname clientid
      if (fields.length < 2) continue;
      const mac = fields[1].toLowerCase();
      if (!MAC_REGEX.test(mac)) continue;
      currentMacs.add(mac);
    }

    let changed = false;
    const nowIso = new Date().toISOString();

    // Add / update
    for (const mac of currentMacs) {
      if (!this._state.has(mac)) {
        this._state.set(mac, { kind: this._inferKind(mac), lastSeenAt: nowIso });
        changed = true;
        console.info(`[Receivers] connected mac=${mac} kind=${this._state.get(mac).kind}`);
      } else {
        // Just refresh lastSeenAt; not a state change for emit purposes
        const entry = this._state.get(mac);
        entry.lastSeenAt = nowIso;
      }
    }

    // Remove disappeared MACs
    for (const mac of Array.from(this._state.keys())) {
      if (!currentMacs.has(mac)) {
        this._state.delete(mac);
        changed = true;
        console.info(`[Receivers] disconnected mac=${mac}`);
      }
    }

    if (changed) {
      console.info(`[Receivers] state updated count=${this._state.size}`);
      this._emitChange();
    }
  }

  /**
   * Fallback ARP : `arp -an` filtré sur wlan0, enrichit l'état avec les MACs
   * absentes de leases.
   */
  async _scanArp() {
    let stdout;
    try {
      const result = await execAsync('arp -an', { timeout: 5000 });
      stdout = result.stdout || '';
    } catch (err) {
      console.warn('[Receivers] arp -an failed:', err.message);
      return;
    }

    const matches = String(stdout).matchAll(ARP_LINE_REGEX);
    let changed = false;
    const nowIso = new Date().toISOString();

    for (const m of matches) {
      const mac = m[1].toLowerCase();
      if (!MAC_REGEX.test(mac)) continue;
      if (this._state.has(mac)) {
        // Refresh lastSeenAt only — not a state change
        this._state.get(mac).lastSeenAt = nowIso;
      } else {
        this._state.set(mac, { kind: this._inferKind(mac), lastSeenAt: nowIso });
        changed = true;
        console.info(`[Receivers] connected (via ARP) mac=${mac} kind=${this._state.get(mac).kind}`);
      }
    }

    if (changed) {
      this._emitChange();
    }
  }

  /**
   * Émet `connected-receivers-changed` sur le socket si `io` est défini.
   */
  _emitChange() {
    if (!this._io) return;
    this._io.emit('connected-receivers-changed', { receivers: this.getReceivers() });
  }
}

module.exports = ReceiversService;
