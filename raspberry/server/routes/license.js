const express = require('express');

/**
 * License status route.
 * @param {object} deps
 * @param {import('../services/license.service')} deps.licenseService
 */
module.exports = function createLicenseRouter({ licenseService }) {
  const router = express.Router();

  // GET /api/license-status - Returns cached license status from sync-agent
  router.get('/api/license-status', (req, res) => {
    try {
      const status = licenseService.getStatus();
      res.json(status);
    } catch (error) {
      console.error('[License] Error reading cache:', error.message);
      res.status(500).json({
        status: 'CONNECTION_WARNING',
        reason: 'cache_error',
        message_remote: 'Erreur lors de la lecture du statut de licence.',
        needs_connection: true,
      });
    }
  });

  return router;
};
