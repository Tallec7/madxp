const express = require('express');
const fs = require('fs');

/**
 * Captive portal endpoints — résolution IP→MAC→displayIndex pour Fire Stick.
 *
 * Phase 6 Plan 02 (CAPTIVE-02/03/04). Le bootstrap Angular du Fire Stick
 * appelle `GET /api/captive/whoami` au premier paint pour décider :
 *   - { mac, displayIndex: N, displayName } → redirect `/?display=N`
 *   - { mac, displayIndex: null }           → afficher `/captive/wait?mac=...`
 *   - 404 mac_not_found                     → page d'erreur (Fire Stick pas encore vu
 *                                             par dnsmasq.leases / arp)
 *
 * Pipeline:
 *   1. Lit l'IP cliente depuis `X-Real-IP` (forwardé par nginx) sinon
 *      `req.socket.remoteAddress` (cas direct, dev local).
 *   2. Resolve la MAC via `receiversService.resolveMacByIp` (Plan 01,
 *      Map<ip, mac> populée par dnsmasq.leases watcher + arp -an).
 *   3. Lookup le `displayIndex` dans `configuration.json` local
 *      (`displays[].receiver.mac` — source de vérité Phase 4 ADR).
 *
 * Résilience: si `configuration.json` est illisible (ENOENT, JSON corrompu)
 * mais que la MAC est connue, retourne `displayIndex: null` plutôt qu'une
 * 5xx — le bootstrap traitera comme "non assigné" et affichera la page
 * d'attente, le bénévole pourra assigner depuis le dashboard.
 *
 * @param {object} deps
 * @param {{ resolveMacByIp: (ip: string) => string | null }} deps.receiversService
 * @param {string} deps.configPath - chemin absolu vers `configuration.json`
 * @returns {import('express').Router}
 */
function createCaptiveRouter({ receiversService, configPath } = {}) {
  if (!receiversService || typeof receiversService.resolveMacByIp !== 'function') {
    throw new Error('createCaptiveRouter: receiversService with resolveMacByIp() required');
  }
  if (!configPath || typeof configPath !== 'string') {
    throw new Error('createCaptiveRouter: configPath (string) required');
  }

  const router = express.Router();

  router.get('/whoami', (req, res) => {
    // Express normalize les headers en lowercase. nginx forward via `proxy_set_header X-Real-IP`.
    const clientIp = req.headers['x-real-ip'] || req.socket?.remoteAddress || '';
    const mac = receiversService.resolveMacByIp(clientIp);

    if (!mac) {
      return res.status(404).json({ error: 'mac_not_found', ip: clientIp });
    }

    let displays = [];
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      displays = Array.isArray(config?.displays) ? config.displays : [];
    } catch (err) {
      // Best-effort fallback: MAC connue mais config illisible → traiter comme non assigné.
      console.warn('[Captive] Failed to read configuration.json:', err.message);
      return res.json({ mac, displayIndex: null, displayName: null });
    }

    const macLower = mac.toLowerCase();
    const display = displays.find(
      (d) =>
        d &&
        d.receiver &&
        typeof d.receiver.mac === 'string' &&
        d.receiver.mac.toLowerCase() === macLower
    );

    return res.json({
      mac,
      displayIndex: display && typeof display.index === 'number' ? display.index : null,
      displayName: display ? display.name || null : null,
    });
  });

  return router;
}

module.exports = createCaptiveRouter;
