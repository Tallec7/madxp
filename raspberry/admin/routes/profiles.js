/**
 * Routes profils pour le serveur admin Neopro
 *
 * Permet de lister et d'activer un profil multi-clubs localement,
 * sans connexion internet (offline-first).
 *
 * - GET  /api/profiles          -> Liste des profils disponibles sur le Pi
 * - GET  /api/profiles/active   -> Profil actif
 * - POST /api/profiles/:id/switch -> Activer un profil localement
 */

const express = require('express');

/**
 * @param {Object} deps
 * @param {import('../services/profile.service')} deps.profileService
 */
module.exports = function createProfilesRouter({ profileService }) {
  const router = express.Router();

  // GET /api/profiles
  router.get('/api/profiles', async (req, res) => {
    try {
      const profiles = await profileService.getProfiles();
      res.json({ profiles });
    } catch (error) {
      console.error('[admin] Erreur chargement profils:', error);
      res.status(500).json({ error: 'Impossible de charger les profils' });
    }
  });

  // GET /api/profiles/active
  router.get('/api/profiles/active', async (req, res) => {
    try {
      const profile = await profileService.getActiveProfile();
      if (!profile) {
        return res.json({ profile: null });
      }
      res.json({ profile });
    } catch (error) {
      console.error('[admin] Erreur chargement profil actif:', error);
      res.status(500).json({ error: 'Impossible de charger le profil actif' });
    }
  });

  // POST /api/profiles/:id/switch
  router.post('/api/profiles/:id/switch', async (req, res) => {
    try {
      const result = await profileService.switchProfile(req.params.id);
      res.json(result);
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        return res.status(404).json({ error: error.message });
      }
      if (error.code === 'INVALID_ID') {
        return res.status(400).json({ error: error.message });
      }
      console.error('[admin] Erreur switch profil:', error);
      res.status(500).json({ error: 'Impossible d\'activer le profil' });
    }
  });

  return router;
};
