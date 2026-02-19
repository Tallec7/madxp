const express = require('express');

/**
 * Auth setup routes.
 * @param {object} deps
 * @param {import('../services/auth.service')} deps.authService
 */
module.exports = function createAuthRouter({ authService }) {
  const router = express.Router();

  // POST /api/auth/setup - Set initial password on first deployment
  router.post('/api/auth/setup', async (req, res) => {
    try {
      const result = await authService.setup(req.body.password);

      // The service returns { status, error } for validation/forbidden cases
      if (result.error) {
        return res.status(result.status).json({ success: false, error: result.error });
      }

      res.json(result);
    } catch (error) {
      console.error('[AuthSetup] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/auth/status - Check if initial setup is needed
  router.get('/api/auth/status', (req, res) => {
    try {
      const status = authService.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
