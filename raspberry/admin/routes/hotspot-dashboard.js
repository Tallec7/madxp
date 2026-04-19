/**
 * Routes dashboard hotspot local pour le serveur admin Neopro — ADR-073
 *
 * Contrôleur mince — délègue au HotspotDashboardService.
 *
 * - GET  /api/hotspot/clients        -> Liste clients WiFi associés
 * - GET  /api/hotspot/events         -> Événements hostapd (buffer + historique)
 * - POST /api/hotspot/rotate-psk     -> Rotation de la PSK WiFi
 * - POST /api/hotspot/events/archive -> Archive un événement (appelé par sync-agent)
 */

const express = require('express');
const { ValidationError, CommandError } = require('../services/errors');

/**
 * @param {Object} deps
 * @param {import('../services/hotspot-dashboard.service')} deps.hotspotDashboardService
 */
module.exports = function createHotspotDashboardRouter({ hotspotDashboardService }) {
  const router = express.Router();

  function handleError(res, error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    if (error instanceof CommandError) return res.status(500).json({ error: error.message });
    console.error('[admin] Hotspot dashboard error:', error);
    return res.status(500).json({ error: error.message });
  }

  router.get('/api/hotspot/clients', async (req, res) => {
    try {
      const clients = await hotspotDashboardService.listClients();
      res.json({ clients, count: clients.length });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get('/api/hotspot/events', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;
      const events = await hotspotDashboardService.getEvents({ limit });
      res.json({ events, count: events.length });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/api/hotspot/rotate-psk', async (req, res) => {
    try {
      const result = await hotspotDashboardService.rotatePsk(req.body || {});
      res.json({ success: true, ...result });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post('/api/hotspot/events/archive', async (req, res) => {
    try {
      const event = req.body;
      if (!event || typeof event !== 'object' || !event.eventType) {
        return res.status(400).json({ error: 'event {eventType,...} requis' });
      }
      await hotspotDashboardService.archiveEvent(event);
      res.json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
};
