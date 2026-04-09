/**
 * Analytics Sync — periodic HTTP-based analytics sending.
 * Extracted from agent.js (ADR-044).
 */

const logger = require('../logger');
const { config } = require('../config');
const analyticsCollector = require('../analytics');

/**
 * Send buffered analytics to the central server via HTTP.
 * Independent of WebSocket connection.
 */
async function sendAnalytics() {
  // Les analytics sont envoyées via HTTP, indépendamment de la connexion WebSocket
  // On vérifie seulement que la configuration est valide
  if (!config.central?.url || !config.site?.id) {
    logger.warn('Cannot send analytics: missing central URL or site ID');
    return;
  }

  try {
    const result = await analyticsCollector.sendToServer(
      config.central.url,
      config.site.id
    );

    if (result.sent > 0) {
      logger.info('Analytics sent', { sent: result.sent, recorded: result.recorded });
    } else if (result.error) {
      logger.warn('Analytics send failed', { error: result.error });
    }
  } catch (error) {
    logger.error('Failed to send analytics', { error: error.message });
  }
}

/**
 * Start periodic analytics sync.
 * @param {object} agent - NeoproSyncAgent instance
 */
function startAnalyticsSync(agent) {
  const interval = config.monitoring?.analyticsInterval || 5 * 60 * 1000; // 5 minutes par défaut
  logger.info('Starting analytics sync', { interval });

  // Envoyer immédiatement les analytics en attente
  sendAnalytics();

  // Puis envoyer périodiquement
  agent.analyticsInterval = setInterval(() => {
    sendAnalytics();
  }, interval);
}

module.exports = {
  sendAnalytics,
  startAnalyticsSync,
};
