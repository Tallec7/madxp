const express = require('express');
const fs = require('fs');

/**
 * Captive portal endpoints — résolution IP→MAC→displayIndex pour Fire Stick.
 *
 * Phase 6 Plan 02 (CAPTIVE-02/03/04). Le bootstrap Angular du Fire Stick
 * appelle `GET /api/captive/whoami` au premier paint pour décider :
 *   - { mac, displayIndex: N, displayName } → redirect `/display/N`
 *   - 404 mac_not_found                     → device non-Fire Stick (phone, ordi,
 *                                             tablette) ou Fire Stick pas encore vu
 *                                             par dnsmasq.leases / arp.
 *                                             Angular boot normal → accès à /remote.
 *
 * Pipeline:
 *   1. Lit l'IP cliente depuis `X-Real-IP` (forwardé par nginx) sinon
 *      `req.socket.remoteAddress` (cas direct, dev local).
 *   2. Resolve la MAC via `receiversService.resolveMacByIp` (Plan 01,
 *      Map<ip, mac> populée par dnsmasq.leases watcher + arp -an).
 *   3. Si kind !== 'firestick' → 404 immédiat. Le wildcard DNS hijack
 *      (dnsmasq /#/) renvoie tous les devices vers le Pi. Les phones/tablettes/ordis
 *      ne doivent pas être interceptés par le flow d'assignation Fire Stick —
 *      ils accèdent directement à la télécommande (/remote, protégé par mdp).
 *   4. Résolution du displayIndex (priorité décroissante) :
 *      a. Assignation cloud via ADR-114 write-through (configuration.json displays[].receiver.mac)
 *      b. Assignation locale en cache (.receivers-cache.json via receiversService)
 *      c. Auto-assign : premier slot libre → persiste via receiversService.assignDisplay()
 *
 * Aucune intervention humaine requise : tout Fire Stick se voit attribuer un
 * displayIndex automatiquement au premier connect. L'admin panel Pi (:8080)
 * permet un override manuel si besoin (cas rare multi-écrans contenu différent).
 *
 * @param {object} deps
 * @param {{ resolveMacByIp: (ip: string) => string | null, getReceivers: () => Array, assignDisplay: (mac: string, index: number) => void }} deps.receiversService
 * @param {string} deps.configPath - chemin absolu vers `configuration.json`
 * @returns {import('express').Router}
 */
function createCaptiveRouter({ receiversService, configPath } = {}) {
  if (
    !receiversService ||
    typeof receiversService.resolveMacByIp !== 'function' ||
    typeof receiversService.assignDisplay !== 'function'
  ) {
    throw new Error('createCaptiveRouter: receiversService with resolveMacByIp() and assignDisplay() required');
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

    // Phones, tablets, computers have kind='browser'. The wildcard DNS hijack
    // sends them here too, but they must not be blocked by the Fire Stick
    // onboarding flow. 404 → Angular boots normally → user reaches /remote.
    const macLower = mac.toLowerCase();
    const receiver = receiversService.getReceivers().find((r) => r.mac?.toLowerCase() === macLower);
    if (!receiver || receiver.kind !== 'firestick') {
      return res.status(404).json({ error: 'mac_not_found', ip: clientIp });
    }

    let displays = [];
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      displays = Array.isArray(config?.displays) ? config.displays : [];
    } catch (err) {
      console.warn('[Captive] Failed to read configuration.json:', err.message);
      // Config illisible — on continue avec displays=[] pour tenter l'auto-assign via cache.
    }

    // Priorité 1 : assignation cloud (ADR-114 write-through dans configuration.json)
    const cloudAssigned = displays.find(
      (d) => d?.receiver?.mac && d.receiver.mac.toLowerCase() === macLower
    );
    if (cloudAssigned) {
      return res.json({ mac, displayIndex: cloudAssigned.index, displayName: cloudAssigned.name || null });
    }

    // Priorité 2 : assignation locale déjà en cache (.receivers-cache.json)
    if (receiver.displayIndex != null) {
      return res.json({ mac, displayIndex: receiver.displayIndex, displayName: null });
    }

    // Priorité 3 : auto-assign au premier slot libre
    const takenIndices = new Set(
      receiversService
        .getReceivers()
        .filter((r) => r.mac?.toLowerCase() !== macLower && r.displayIndex != null)
        .map((r) => r.displayIndex)
    );
    const candidateIndices = displays.length > 0 ? displays.map((d) => d.index) : [0];
    const freeIndex = candidateIndices.find((i) => !takenIndices.has(i)) ?? 0;

    receiversService.assignDisplay(mac, freeIndex);
    console.info(`[Captive] auto-assigned mac=${macLower} displayIndex=${freeIndex}`);

    return res.json({ mac, displayIndex: freeIndex, displayName: null });
  });

  return router;
}

module.exports = createCaptiveRouter;
