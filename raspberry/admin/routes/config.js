/**
 * Routes de configuration pour le serveur admin Neopro
 *
 * Contrôleur mince — délègue au ConfigurationService.
 *
 * - GET    /api/config                                              -> Club configuration (club-config.json)
 * - GET    /api/configuration                                       -> Full configuration.json
 * - GET    /api/configuration/settings                              -> Language/timezone settings
 * - PUT    /api/configuration/settings                              -> Update language/timezone
 * - GET    /api/configuration/categories                            -> All categories
 * - POST   /api/configuration/categories                            -> Create a new category
 * - PUT    /api/configuration/categories/:categoryId                -> Update a category
 * - DELETE /api/configuration/categories/:categoryId                -> Delete a category
 * - POST   /api/configuration/categories/:categoryId/subcategories  -> Create subcategory
 * - DELETE /api/configuration/categories/:categoryId/subcategories/:subCategoryId -> Delete subcategory
 * - GET    /api/configuration/time-categories                       -> Get timeCategories
 * - PUT    /api/configuration/time-categories                       -> Update timeCategories
 */

const express = require('express');

const { NotFoundError, LockedError, ValidationError, DuplicateError } = require('../services/errors');

/**
 * @param {Object} deps
 * @param {import('../services/configuration.service')} deps.configService
 */
module.exports = function createConfigRouter({ configService }) {
  const router = express.Router();

  /** Map service errors to HTTP status codes */
  function handleError(res, error) {
    if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof LockedError) return res.status(403).json({ error: error.message, locked: true });
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    if (error instanceof DuplicateError) return res.status(400).json({ error: error.message });
    console.error('[admin] Config error:', error);
    return res.status(500).json({ error: error.message });
  }

  // GET /api/config - Club configuration
  router.get('/api/config', async (req, res) => {
    try {
      const config = await configService.getClubConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Configuration non trouvée' });
    }
  });

  // GET /api/configuration - Full configuration.json
  router.get('/api/configuration', async (req, res) => {
    try {
      const config = await configService.loadConfig();
      res.json(config);
    } catch (error) {
      handleError(res, error);
    }
  });

  // GET /api/configuration/settings
  router.get('/api/configuration/settings', async (req, res) => {
    try {
      const settings = await configService.getSettings();
      res.json({ settings });
    } catch (error) {
      handleError(res, error);
    }
  });

  // PUT /api/configuration/settings
  router.put('/api/configuration/settings', async (req, res) => {
    try {
      const settings = await configService.updateSettings(req.body);
      res.json({ success: true, settings });
    } catch (error) {
      handleError(res, error);
    }
  });

  // GET /api/configuration/categories
  router.get('/api/configuration/categories', async (req, res) => {
    try {
      const categories = await configService.getCategories();
      res.json({ categories });
    } catch (error) {
      handleError(res, error);
    }
  });

  // POST /api/configuration/categories
  router.post('/api/configuration/categories', async (req, res) => {
    try {
      const category = await configService.createCategory(req.body);
      res.json({ success: true, message: 'Catégorie créée', category });
    } catch (error) {
      handleError(res, error);
    }
  });

  // PUT /api/configuration/categories/:categoryId
  router.put('/api/configuration/categories/:categoryId', async (req, res) => {
    try {
      const category = await configService.updateCategory(req.params.categoryId, req.body);
      res.json({ success: true, message: 'Catégorie mise à jour', category });
    } catch (error) {
      handleError(res, error);
    }
  });

  // DELETE /api/configuration/categories/:categoryId
  router.delete('/api/configuration/categories/:categoryId', async (req, res) => {
    try {
      await configService.deleteCategory(req.params.categoryId);
      res.json({ success: true, message: 'Catégorie supprimée' });
    } catch (error) {
      handleError(res, error);
    }
  });

  // POST /api/configuration/categories/:categoryId/subcategories
  router.post('/api/configuration/categories/:categoryId/subcategories', async (req, res) => {
    try {
      const subCategory = await configService.createSubcategory(req.params.categoryId, req.body);
      res.json({ success: true, message: 'Sous-catégorie créée', subCategory });
    } catch (error) {
      handleError(res, error);
    }
  });

  // DELETE /api/configuration/categories/:categoryId/subcategories/:subCategoryId
  router.delete('/api/configuration/categories/:categoryId/subcategories/:subCategoryId', async (req, res) => {
    try {
      await configService.deleteSubcategory(req.params.categoryId, req.params.subCategoryId);
      res.json({ success: true, message: 'Sous-catégorie supprimée' });
    } catch (error) {
      handleError(res, error);
    }
  });

  // GET /api/configuration/time-categories
  router.get('/api/configuration/time-categories', async (req, res) => {
    try {
      const result = await configService.getTimeCategories();
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // PUT /api/configuration/time-categories
  router.put('/api/configuration/time-categories', async (req, res) => {
    try {
      const timeCategories = await configService.updateTimeCategories(req.body.timeCategories);
      res.json({ success: true, message: 'TimeCategories mis à jour', timeCategories });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
};
