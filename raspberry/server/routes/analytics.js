const express = require('express');

/**
 * Analytics buffer routes.
 * @param {object} deps
 * @param {import('../services/buffer.service')} deps.analyticsBuffer
 */
module.exports = function createAnalyticsRouter({ analyticsBuffer }) {
  const router = express.Router();

  // POST /api/analytics - Buffer video play events
  router.post('/api/analytics', async (req, res) => {
    try {
      const { events } = req.body;

      if (!events || !Array.isArray(events)) {
        return res.status(400).json({ error: 'events array required' });
      }

      const result = await analyticsBuffer.add(events);

      // Match the original response shape
      res.json({
        success: true,
        received: result.received,
        ...(result.forwarded
          ? { forwarded: true, recorded: result.recorded }
          : { total: result.total }),
      });
    } catch (error) {
      console.error('[Analytics] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/analytics/stats - Buffer statistics
  router.get('/api/analytics/stats', (req, res) => {
    try {
      const stats = analyticsBuffer.getStats('played_at');
      res.json({
        count: stats.count,
        oldestEvent: stats.oldest,
        newestEvent: stats.newest,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
