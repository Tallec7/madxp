/**
 * HotspotDashboardService — ADR-073
 *
 * Expose au dashboard admin (:8080) les informations du hotspot local :
 *   - Clients WiFi actuellement associés (via `hostapd_cli all_sta`)
 *   - Événements hostapd bufferisés (association/deassociation/PSK mismatch)
 *   - Rotation de la PSK WiFi (génération aléatoire + sed hostapd.conf + restart)
 *
 * Le polling des clients est déclenché à la demande (pas de cron) pour éviter
 * de pénaliser la tenue réseau du Pi. Le dashboard rafraîchit toutes les 15s.
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const fsCore = require('fs');
const path = require('path');

const { execCommand, shellEscape } = require('../helpers');
const { NEOPRO_DIR } = require('../helpers');
const { CommandError, ValidationError } = require('./errors');

const HOSTAPD_CONF = '/etc/hostapd/hostapd.conf';
const HOSTAPD_CLI = '/usr/sbin/hostapd_cli';
const EVENTS_BUFFER = path.join(NEOPRO_DIR, 'data', 'hostapd-events-buffer.jsonl');
const EVENTS_HISTORY = path.join(NEOPRO_DIR, 'data', 'hostapd-events-history.jsonl');
const HISTORY_MAX_EVENTS = 500;

class HotspotDashboardService {
  /**
   * Liste les clients WiFi actuellement associés au hotspot.
   * Parse la sortie `hostapd_cli -i wlan0 all_sta` (format multi-ligne par client).
   * @returns {Promise<Array<{mac, connectedSec, rxPackets, txPackets, signal, rssi}>>}
   */
  async listClients() {
    const cmd = `sudo ${HOSTAPD_CLI} -i wlan0 all_sta 2>/dev/null`;
    const result = await execCommand(cmd);
    if (!result.success) {
      // hostapd peut être down — renvoie liste vide plutôt qu'une erreur
      return [];
    }
    return this.parseAllStaOutput(result.output);
  }

  /**
   * Parse pur (testable) de la sortie hostapd_cli all_sta.
   * Format : chaque client commence par "aa:bb:cc:dd:ee:ff" puis key=value sur lignes suivantes.
   */
  parseAllStaOutput(raw) {
    if (!raw || typeof raw !== 'string') return [];
    const clients = [];
    let current = null;

    for (const rawLine of raw.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(line)) {
        if (current) clients.push(current);
        current = { mac: line.toLowerCase() };
        continue;
      }
      if (!current) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx);
      const value = line.slice(eqIdx + 1);
      switch (key) {
        case 'connected_time': current.connectedSec = parseInt(value, 10) || 0; break;
        case 'rx_packets': current.rxPackets = parseInt(value, 10) || 0; break;
        case 'tx_packets': current.txPackets = parseInt(value, 10) || 0; break;
        case 'rx_bytes': current.rxBytes = parseInt(value, 10) || 0; break;
        case 'tx_bytes': current.txBytes = parseInt(value, 10) || 0; break;
        case 'signal': current.signal = parseInt(value, 10); break;
        case 'rx_rate_info': current.rxRateInfo = value; break;
        case 'tx_rate_info': current.txRateInfo = value; break;
        default: break;
      }
    }
    if (current) clients.push(current);
    return clients;
  }

  /**
   * Retourne les événements hostapd (buffer offline + historique).
   * Le buffer est flush par hostapd-telemetry.js quand le socket central se reconnecte ;
   * l'historique reste local pour affichage dashboard.
   */
  async getEvents({ limit = 100 } = {}) {
    const events = [];
    for (const file of [EVENTS_HISTORY, EVENTS_BUFFER]) {
      try {
        const raw = await fs.readFile(file, 'utf8');
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          try {
            events.push(JSON.parse(line));
          } catch {
            /* ligne corrompue ignorée */
          }
        }
      } catch {
        /* fichier absent ignoré */
      }
    }
    events.sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });
    return events.slice(0, Math.max(1, Math.min(limit, 1000)));
  }

  /**
   * Rotation de la PSK WiFi.
   * Génère une nouvelle clé via openssl, patch hostapd.conf, restart hostapd,
   * met à jour club-config.json (si présent).
   * @returns {Promise<{psk: string, generated: true}>}
   */
  async rotatePsk({ newPsk } = {}) {
    let psk = newPsk;
    if (psk) {
      if (typeof psk !== 'string' || psk.length < 8 || psk.length > 63) {
        throw new ValidationError('PSK doit faire entre 8 et 63 caractères');
      }
      // Caractères sudoers-safe (pas de newline, pas de sed delimiter)
      if (!/^[\x20-\x7E]+$/.test(psk) || /[\n\r|&;]/.test(psk)) {
        throw new ValidationError('PSK contient des caractères non imprimables ou shell-sensibles');
      }
    } else {
      psk = this._generatePsk();
    }

    // Patch hostapd.conf via sed (règle sudoers autorise sed -i * /etc/hostapd/hostapd.conf)
    const escaped = psk.replace(/[\/&]/g, '\\$&');
    const sedCmd = `sudo /usr/bin/sed -i 's|^wpa_passphrase=.*|wpa_passphrase=${escaped}|' ${HOSTAPD_CONF}`;
    const sedResult = await execCommand(sedCmd);
    if (!sedResult.success) {
      throw new CommandError(`Échec patch hostapd.conf : ${sedResult.error}`);
    }

    // Restart hostapd
    const restartResult = await execCommand('sudo /usr/bin/systemctl restart hostapd');
    if (!restartResult.success) {
      throw new CommandError(`Échec restart hostapd : ${restartResult.error}`);
    }

    // Update club-config.json (best effort, non-bloquant)
    try {
      const clubConfigPath = path.join(NEOPRO_DIR, 'club-config.json');
      if (fsCore.existsSync(clubConfigPath)) {
        const data = await fs.readFile(clubConfigPath, 'utf8');
        const config = JSON.parse(data);
        config.wifiPassword = psk;
        config.pskRotatedAt = new Date().toISOString();
        await fs.writeFile(clubConfigPath, JSON.stringify(config, null, 2));
      }
    } catch (error) {
      console.warn('[hotspot-dashboard] club-config.json update failed:', error.message);
    }

    return { psk, generated: !newPsk, rotatedAt: new Date().toISOString() };
  }

  _generatePsk() {
    // 16 octets base64 → ~22 chars, on strippe les chars problématiques et tronque
    return crypto.randomBytes(16).toString('base64').replace(/[/+=]/g, '').slice(0, 20) + 'Neo';
  }

  /**
   * Archive un événement dans history.jsonl (cap HISTORY_MAX_EVENTS).
   * Utilisé par la route POST /api/hotspot/events/archive (appelée depuis sync-agent
   * au flush du buffer) pour conserver un historique local même après envoi central.
   */
  async archiveEvent(event) {
    try {
      await fs.mkdir(path.dirname(EVENTS_HISTORY), { recursive: true });
      if (fsCore.existsSync(EVENTS_HISTORY)) {
        const stats = await fs.stat(EVENTS_HISTORY);
        if (stats.size > HISTORY_MAX_EVENTS * 200) {
          const raw = await fs.readFile(EVENTS_HISTORY, 'utf8');
          const lines = raw.split('\n').filter(Boolean).slice(-HISTORY_MAX_EVENTS + 1);
          await fs.writeFile(EVENTS_HISTORY, lines.join('\n') + '\n');
        }
      }
      await fs.appendFile(EVENTS_HISTORY, JSON.stringify(event) + '\n');
    } catch (error) {
      console.warn('[hotspot-dashboard] archive failed:', error.message);
    }
  }
}

module.exports = HotspotDashboardService;
