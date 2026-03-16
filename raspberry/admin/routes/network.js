/**
 * Routes réseau et WiFi pour le serveur admin Neopro
 *
 * Contrôleur mince — délègue au NetworkService.
 *
 * - GET    /api/network        -> Informations interfaces réseau
 * - GET    /api/wifi/scan      -> Scanner les réseaux WiFi disponibles
 * - POST   /api/wifi/connect   -> Connexion WiFi avec option BSSID lock
 * - GET    /api/wifi/current   -> Statut WiFi actuel
 * - DELETE /api/wifi/bssid-lock -> Supprimer le verrouillage BSSID
 * - POST   /api/hotspot/fix    -> Diagnostic et réparation du hotspot
 */

const express = require('express');

const { NotFoundError, ValidationError, CommandError } = require('../services/errors');

/**
 * @param {Object} deps
 * @param {import('../services/network.service')} deps.networkService
 */
module.exports = function createNetworkRouter({ networkService }) {
  const router = express.Router();

  /** Map service errors to HTTP status codes */
  function handleError(res, error) {
    if (error instanceof NotFoundError) return res.status(404).json({ success: false, error: error.message });
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    if (error instanceof CommandError) return res.status(500).json({ error: error.message });
    console.error('[admin] Network error:', error);
    return res.status(500).json({ error: error.message });
  }

  // GET /api/network
  router.get('/api/network', async (req, res) => {
    try {
      const info = await networkService.getNetworkInfo();
      res.json(info);
    } catch (error) {
      handleError(res, error);
    }
  });

  // GET /api/wifi/scan
  router.get('/api/wifi/scan', async (req, res) => {
    try {
      const result = await networkService.scanWifiNetworks();
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // POST /api/wifi/connect
  router.post('/api/wifi/connect', async (req, res) => {
    try {
      const result = await networkService.connectWifi(req.body);
      res.json({ success: true, ...result });
    } catch (error) {
      // Enrich mesh detection errors (service attaches meshDetected + apCount)
      if (error instanceof ValidationError && error.meshDetected) {
        return res.status(400).json({
          error: error.message,
          meshDetected: true,
          apCount: error.apCount,
        });
      }
      handleError(res, error);
    }
  });

  // GET /api/wifi/current
  router.get('/api/wifi/current', async (req, res) => {
    try {
      const status = await networkService.getCurrentWifiStatus();
      res.json(status);
    } catch (error) {
      handleError(res, error);
    }
  });

  // DELETE /api/wifi/bssid-lock
  router.delete('/api/wifi/bssid-lock', async (req, res) => {
    try {
      const result = await networkService.removeBssidLock();
      res.json({ success: true, ...result });
    } catch (error) {
      handleError(res, error);
    }
  });

  // POST /api/hotspot/fix
  router.post('/api/hotspot/fix', async (req, res) => {
    try {
      const result = await networkService.fixHotspot(req.body || {});
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
};
