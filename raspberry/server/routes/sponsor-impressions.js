const express = require('express');
const { SITE_ID } = require('../helpers');

/**
 * Sponsor impressions buffer routes.
 * @param {object} deps
 * @param {import('../services/buffer.service')} deps.sponsorBuffer
 */
module.exports = function createSponsorRouter({ sponsorBuffer }) {
  const router = express.Router();

  // POST /api/sync/sponsor-impressions - Buffer sponsor impressions
  router.post('/api/sync/sponsor-impressions', async (req, res) => {
    try {
      const { impressions } = req.body;

      if (!impressions || !Array.isArray(impressions)) {
        return res.status(400).json({ error: 'impressions array required' });
      }

      // Transform: ensure each impression has site_id
      const transformFn = (items) =>
        items.map((imp) => ({
          ...imp,
          site_id: imp.site_id || SITE_ID,
        }));

      const result = await sponsorBuffer.add(impressions, transformFn);

      // Match the original response shape
      res.json({
        success: true,
        received: result.received,
        ...(result.forwarded
          ? { queued: 0, forwarded: true, recorded: result.recorded }
          : { queued: result.total }),
      });
    } catch (error) {
      console.error('[SponsorImpressions] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/sync/sponsor-impressions/stats - Buffer statistics
  router.get('/api/sync/sponsor-impressions/stats', (req, res) => {
    try {
      const stats = sponsorBuffer.getStats('played_at');
      res.json({
        count: stats.count,
        oldestImpression: stats.oldest,
        newestImpression: stats.newest,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
