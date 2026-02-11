/**
 * Routes système pour le serveur admin Neopro
 *
 * Contrôleur mince — délègue au SystemService.
 *
 * - GET  /api/system                    -> Informations système
 * - GET  /api/version                   -> Informations de version
 * - GET  /api/logs/:service             -> Logs d'un service
 * - POST /api/services/:service/restart -> Redémarrer un service
 * - POST /api/system/reboot             -> Redémarrer le système
 * - POST /api/system/shutdown           -> Arrêter le système
 */

const express = require('express');

const { ValidationError, CommandError } = require('../services/errors');

/**
 * @param {Object} deps
 * @param {import('../services/system.service')} deps.systemService
 */
module.exports = function createSystemRouter({ systemService }) {
  const router = express.Router();

  // GET /api/system
  router.get('/api/system', async (req, res) => {
    const info = await systemService.getSystemInfo();
    res.json(info);
  });

  // GET /api/version
  router.get('/api/version', async (req, res) => {
    try {
      const info = await systemService.getVersionInfo();
      res.json(info);
    } catch (error) {
      console.error('[admin] Failed to load version info:', error);
      res.status(500).json({ error: 'Impossible de charger la version' });
    }
  });

  // GET /api/logs/:service
  router.get('/api/logs/:service', async (req, res) => {
    try {
      const logs = await systemService.getServiceLogs(req.params.service, req.query.lines || 100);
      res.json({ logs });
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/services/:service/restart
  router.post('/api/services/:service/restart', async (req, res) => {
    try {
      await systemService.restartService(req.params.service);
      res.json({ success: true, message: `Service ${req.params.service} redémarré` });
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/system/reboot
  router.post('/api/system/reboot', (req, res) => {
    res.json({ success: true, message: 'Redémarrage du système dans 5 secondes...' });
    systemService.reboot();
  });

  // POST /api/system/shutdown
  router.post('/api/system/shutdown', (req, res) => {
    res.json({ success: true, message: 'Arrêt du système dans 5 secondes...' });
    systemService.shutdown();
  });

  return router;
};
