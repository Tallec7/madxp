const express = require('express');
const { SITE_ID, SITE_NAME } = require('../helpers');

/**
 * Health check & site info routes.
 * @param {object} deps
 * @param {object} deps.io - Socket.IO server instance
 */
module.exports = function createHealthRouter({ io }) {
  const router = express.Router();

  // GET / - Health check (used by Render monitoring)
  router.get('/', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Neopro Socket.IO Server',
      connections: io.engine.clientsCount,
    });
  });

  // GET /api/site-info - Expose site_id for sponsor analytics
  router.get('/api/site-info', (req, res) => {
    res.json({
      siteId: SITE_ID || null,
      siteName: SITE_NAME,
      configured: !!SITE_ID,
    });
  });

  return router;
};
