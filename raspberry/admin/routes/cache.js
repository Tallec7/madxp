/**
 * Routes de gestion du cache pour le serveur admin Neopro
 *
 * - GET    /api/cache/stats -> Statistiques du cache
 * - DELETE /api/cache/clear -> Vider le cache (tout ou par namespace)
 * - GET    /api/cache/info  -> Informations détaillées sur le cache
 */

const express = require('express');

module.exports = function createCacheRouter(cache, NAMESPACES) {
  const router = express.Router();

  /**
   * GET /api/cache/stats
   * Obtenir les statistiques du cache
   */
  router.get('/api/cache/stats', (req, res) => {
    try {
      const stats = cache.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/cache/clear
   * Vider tout le cache ou un namespace spécifique
   * Query params: ?namespace=config (optionnel)
   */
  router.delete('/api/cache/clear', (req, res) => {
    try {
      const namespace = req.query.namespace;

      if (namespace) {
        if (!Object.values(NAMESPACES).includes(namespace)) {
          return res.status(400).json({
            error: 'Namespace invalide',
            validNamespaces: Object.values(NAMESPACES)
          });
        }
        cache.invalidateNamespace(namespace);
        res.json({
          success: true,
          message: `Cache du namespace '${namespace}' vidé avec succès`
        });
      } else {
        cache.clear();
        res.json({
          success: true,
          message: 'Tous les caches vidés avec succès'
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/cache/info
   * Obtenir des informations détaillées sur le cache
   */
  router.get('/api/cache/info', (req, res) => {
    try {
      const stats = cache.getStats();
      const info = {
        stats,
        namespaces: NAMESPACES,
        maxSize: 200,
        defaultTTL: 60000,
        hitRate: stats.total > 0
          ? ((stats.hits / stats.total) * 100).toFixed(2) + '%'
          : '0%'
      };
      res.json(info);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
