const express = require('express');

/**
 * Profile PIN validation routes (ADR-058 Phase 1 — offline fallback).
 *
 * @param {object} deps
 * @param {import('../services/profile-pin.service')} deps.profilePinService
 */
module.exports = function createProfilePinRouter({ profilePinService }) {
  const router = express.Router();

  // GET /api/profiles/:profileId/pin-status — verifie si un PIN est requis offline
  router.get('/api/profiles/:profileId/pin-status', (req, res) => {
    try {
      const required = profilePinService.isPinRequired(req.params.profileId);
      res.json({ pinRequired: required });
    } catch (error) {
      console.error('[ProfilePin] status error', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/profiles/:profileId/verify-pin — valide le PIN saisi localement
  router.post('/api/profiles/:profileId/verify-pin', async (req, res) => {
    try {
      const { profileId } = req.params;
      const { pin } = req.body || {};
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const result = await profilePinService.verify({ profileId, pin, ip });
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error('[ProfilePin] verify error', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
