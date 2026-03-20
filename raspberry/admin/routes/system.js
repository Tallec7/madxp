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
 * - POST /api/system/apply-services     -> Appliquer services systemd + sudoers
 * - POST /api/system/fix-ownership      -> Fixer les permissions root:root avant OTA
 */

const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const path = require('path');

const execAsync = util.promisify(exec);
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

  // POST /api/system/apply-services
  // Copy systemd services & sudoers from deployed config into system locations.
  // Fixes Pi units stuck with old service files after OTA.
  router.post('/api/system/apply-services', async (req, res) => {
    try {
      const result = await systemService.applySystemdServices();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/system/fix-ownership
  // Fix root:root ownership on /home/pi/neopro/ and VERSION files.
  // Called by sync-agent pre-migration before OTA to prevent EACCES errors.
  // The admin-server runs WITHOUT NoNewPrivileges, so sudo works here.
  router.post('/api/system/fix-ownership', async (req, res) => {
    try {
      const result = await systemService.fixOwnership();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/system/validate
  // Run post-OTA validation checks and return structured report.
  // Called by dashboard or manually via SSH to verify Pi health.
  router.post('/api/system/validate', async (req, res) => {
    try {
      const scriptPath = path.join(__dirname, '../../scripts/validate-pi.sh');
      const { stdout } = await execAsync(`bash ${scriptPath} --json`, { timeout: 60000 });
      const report = JSON.parse(stdout.trim());
      const status = report.healthy ? 200 : 503;
      res.status(status).json(report);
    } catch (error) {
      // validate-pi.sh exits 1 on critical failure — parse stdout anyway
      if (error.stdout) {
        try {
          const report = JSON.parse(error.stdout.trim());
          res.status(503).json(report);
          return;
        } catch {
          // JSON parse failed, fall through
        }
      }
      res.status(500).json({ error: error.message, healthy: false });
    }
  });

  // GET /api/system/validate — same as POST but for easy browser/curl testing
  router.get('/api/system/validate', async (req, res) => {
    try {
      const scriptPath = path.join(__dirname, '../../scripts/validate-pi.sh');
      const { stdout } = await execAsync(`bash ${scriptPath} --json`, { timeout: 60000 });
      const report = JSON.parse(stdout.trim());
      const status = report.healthy ? 200 : 503;
      res.status(status).json(report);
    } catch (error) {
      if (error.stdout) {
        try {
          const report = JSON.parse(error.stdout.trim());
          res.status(503).json(report);
          return;
        } catch {
          // JSON parse failed, fall through
        }
      }
      res.status(500).json({ error: error.message, healthy: false });
    }
  });

  return router;
};
