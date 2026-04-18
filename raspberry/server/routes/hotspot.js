const express = require('express');

/**
 * Hotspot status + QR payload routes (ADR-060 Phase 3 couche 2).
 *
 * @param {object} deps
 * @param {import('../services/hotspot.service')} deps.hotspotService
 */
module.exports = function createHotspotRouter({ hotspotService }) {
  const router = express.Router();

  // GET /api/hotspot/status — SSID + flag actif (PAS de password exposé)
  router.get('/api/hotspot/status', (req, res) => {
    const status = hotspotService.getStatus();
    res.json({
      ssid: status.ssid,
      active: status.active,
      updatedAt: status.updatedAt,
    });
  });

  // GET /api/hotspot/qr-payload — chaine WIFI: complete (avec password)
  // Utilise uniquement en affichage TV local (pas exposé cross-origin au cloud)
  router.get('/api/hotspot/qr-payload', (req, res) => {
    const payload = hotspotService.getQrPayload();
    if (!payload) {
      return res.status(404).json({ error: 'hotspot_inactive' });
    }
    res.json({ payload });
  });

  return router;
};
