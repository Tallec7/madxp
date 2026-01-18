const path = require('path');
const fs = require('fs-extra');
const logger = require('../logger');

/**
 * Récupère l'état du buffer analytics
 * Taille du buffer, dernière vidange, événements en attente
 */
async function getAnalyticsBufferStatus() {
  logger.info('Retrieving analytics buffer status');

  const analyticsFilePath = path.join(
    process.env.HOME || '/home/pi',
    'neopro',
    'data',
    'analytics_buffer.json'
  );

  const sponsorFilePath = path.join(
    process.env.HOME || '/home/pi',
    'neopro',
    'data',
    'sponsor_impressions.json'
  );

  const result = {
    success: true,
    timestamp: new Date().toISOString(),
    analytics: {
      file_exists: false,
      event_count: 0,
      file_size_bytes: 0,
      oldest_event: null,
      newest_event: null,
    },
    sponsors: {
      file_exists: false,
      event_count: 0,
      file_size_bytes: 0,
      oldest_event: null,
      newest_event: null,
    },
  };

  // Analytics buffer
  if (await fs.pathExists(analyticsFilePath)) {
    const stats = await fs.stat(analyticsFilePath);
    result.analytics.file_exists = true;
    result.analytics.file_size_bytes = stats.size;

    try {
      const data = JSON.parse(await fs.readFile(analyticsFilePath, 'utf8'));
      if (Array.isArray(data)) {
        result.analytics.event_count = data.length;
        if (data.length > 0) {
          const sorted = data.sort((a, b) =>
            new Date(a.timestamp || a.played_at || 0).getTime() -
            new Date(b.timestamp || b.played_at || 0).getTime()
          );
          result.analytics.oldest_event = sorted[0]?.timestamp || sorted[0]?.played_at || null;
          result.analytics.newest_event = sorted[sorted.length - 1]?.timestamp || sorted[sorted.length - 1]?.played_at || null;
        }
      }
    } catch (parseError) {
      logger.warn('Failed to parse analytics buffer:', parseError.message);
    }
  }

  // Sponsor impressions buffer
  if (await fs.pathExists(sponsorFilePath)) {
    const stats = await fs.stat(sponsorFilePath);
    result.sponsors.file_exists = true;
    result.sponsors.file_size_bytes = stats.size;

    try {
      const data = JSON.parse(await fs.readFile(sponsorFilePath, 'utf8'));
      if (Array.isArray(data)) {
        result.sponsors.event_count = data.length;
        if (data.length > 0) {
          const sorted = data.sort((a, b) =>
            new Date(a.timestamp || a.viewed_at || 0).getTime() -
            new Date(b.timestamp || b.viewed_at || 0).getTime()
          );
          result.sponsors.oldest_event = sorted[0]?.timestamp || sorted[0]?.viewed_at || null;
          result.sponsors.newest_event = sorted[sorted.length - 1]?.timestamp || sorted[sorted.length - 1]?.viewed_at || null;
        }
      }
    } catch (parseError) {
      logger.warn('Failed to parse sponsor impressions buffer:', parseError.message);
    }
  }

  return result;
}

module.exports = { getAnalyticsBufferStatus };
