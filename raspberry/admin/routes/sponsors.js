/**
 * Routes sponsors pour le serveur admin Neopro
 *
 * Contrôleur mince — délègue au SponsorService.
 *
 * - GET    /api/sponsors                          -> Liste sponsors (locaux + NEOPRO)
 * - GET    /api/sponsors/:localId                 -> Détail sponsor
 * - POST   /api/sponsors                          -> Créer sponsor local
 * - PUT    /api/sponsors/:localId                 -> Modifier sponsor local
 * - DELETE /api/sponsors/:localId                 -> Supprimer sponsor local
 * - POST   /api/sponsors/:localId/videos          -> Lier vidéo
 * - DELETE /api/sponsors/:localId/videos/:filename -> Délier vidéo
 * - POST   /api/sponsors/:localId/loop            -> Ajouter à la boucle
 * - DELETE /api/sponsors/:localId/loop            -> Retirer de la boucle
 * - POST   /api/sponsors/:localId/phase           -> Ajouter à une phase
 * - DELETE /api/sponsors/:localId/phase           -> Retirer d'une phase
 * - GET    /api/sponsors/:localId/phases          -> Phases du sponsor
 */

const express = require('express');
const { NotFoundError, LockedError, ValidationError, DuplicateError } = require('../services/errors');

/**
 * @param {Object} deps
 * @param {import('../services/sponsor.service')} deps.sponsorService
 * @param {import('../services/sponsor-stats.service')} deps.sponsorStatsService
 */
module.exports = function createSponsorsRouter({ sponsorService, sponsorStatsService }) {
  const router = express.Router();

  /** Map service errors to HTTP status codes */
  function handleError(res, error) {
    if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof LockedError) return res.status(403).json({ error: error.message, locked: true });
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    if (error instanceof DuplicateError) return res.status(409).json({ error: error.message });
    console.error('[admin] Sponsor error:', error);
    return res.status(500).json({ error: error.message });
  }

  // ===========================================================================
  // STATS (before :localId routes to avoid parameter capture)
  // ===========================================================================

  // Get local sponsor stats (aggregated from buffer + history)
  router.get('/api/sponsors/stats', async (req, res) => {
    try {
      const days = parseInt(req.query.days, 10) || 30;
      const stats = await sponsorStatsService.getStats({ days });
      res.json(stats);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Persist current buffer into local history (called before flush)
  router.post('/api/sponsors/stats/persist', async (req, res) => {
    try {
      const result = await sponsorStatsService.persistCurrentBuffer();
      res.json({ success: true, ...result });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===========================================================================
  // CRUD
  // ===========================================================================

  // List all sponsors (local + NEOPRO read-only)
  router.get('/api/sponsors', async (req, res) => {
    try {
      const sponsors = await sponsorService.listSponsors();
      res.json({ sponsors });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get sponsor by localId
  router.get('/api/sponsors/:localId', async (req, res) => {
    try {
      const sponsor = await sponsorService.getSponsor(req.params.localId);
      res.json({ sponsor });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Create local sponsor
  router.post('/api/sponsors', async (req, res) => {
    try {
      const { name, contactEmail, contactPhone } = req.body;
      const sponsor = await sponsorService.createSponsor({ name, contactEmail, contactPhone });
      res.status(201).json({ sponsor });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Update local sponsor
  router.put('/api/sponsors/:localId', async (req, res) => {
    try {
      const sponsor = await sponsorService.updateSponsor(req.params.localId, req.body);
      res.json({ sponsor });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Delete local sponsor
  router.delete('/api/sponsors/:localId', async (req, res) => {
    try {
      await sponsorService.deleteSponsor(req.params.localId);
      res.json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===========================================================================
  // VIDEO LINKING
  // ===========================================================================

  // Link video to sponsor
  router.post('/api/sponsors/:localId/videos', async (req, res) => {
    try {
      const { filename } = req.body;
      const sponsor = await sponsorService.linkVideo(req.params.localId, filename);
      res.json({ sponsor });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Unlink video from sponsor
  router.delete('/api/sponsors/:localId/videos/:filename', async (req, res) => {
    try {
      const sponsor = await sponsorService.unlinkVideo(req.params.localId, req.params.filename);
      res.json({ sponsor });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===========================================================================
  // LOOP MANAGEMENT
  // ===========================================================================

  // Add sponsor's videos to the default loop
  router.post('/api/sponsors/:localId/loop', async (req, res) => {
    try {
      const sponsor = await sponsorService.addToLoop(req.params.localId);
      res.json({ sponsor });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Remove sponsor's videos from the default loop
  router.delete('/api/sponsors/:localId/loop', async (req, res) => {
    try {
      const sponsor = await sponsorService.removeFromLoop(req.params.localId);
      res.json({ sponsor });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ===========================================================================
  // PHASE MANAGEMENT (timeCategories[].loopVideos[])
  // ===========================================================================

  // Add sponsor's videos to a specific phase
  router.post('/api/sponsors/:localId/phase', async (req, res) => {
    try {
      const { phaseId } = req.body;
      const sponsor = await sponsorService.addToPhase(req.params.localId, phaseId);
      res.json({ sponsor });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Remove sponsor's videos from a specific phase
  router.delete('/api/sponsors/:localId/phase', async (req, res) => {
    try {
      const { phaseId } = req.body;
      const sponsor = await sponsorService.removeFromPhase(req.params.localId, phaseId);
      res.json({ sponsor });
    } catch (error) {
      handleError(res, error);
    }
  });

  // Get phases where a sponsor has entries
  router.get('/api/sponsors/:localId/phases', async (req, res) => {
    try {
      const phases = await sponsorService.getSponsorPhases(req.params.localId);
      res.json({ phases });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
};
