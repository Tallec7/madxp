const express = require('express');

/**
 * HDMI-CEC status route.
 * @param {object} deps
 * @param {import('../services/hdmi.service')} deps.hdmiService
 */
module.exports = function createHdmiRouter({ hdmiService }) {
  const router = express.Router();

  // GET /api/hdmi-status - TV power state via HDMI-CEC
  router.get('/api/hdmi-status', async (req, res) => {
    try {
      const status = await hdmiService.getStatus();
      res.json(status);
    } catch (error) {
      console.error('[HDMI-CEC] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
