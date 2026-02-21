const path = require('path');
const fs = require('fs-extra');
const logger = require('../logger');

/**
 * Récupère l'état du buffer analytics unifié.
 *
 * Depuis v3.66 (consolidation pipelines), toutes les impressions (club + sponsor)
 * transitent par analytics_buffer.json. Le champ `sponsors` est un breakdown
 * des événements avec category='sponsor' dans ce même buffer.
 *
 * Si sponsor_impressions.json existe encore, il est signalé comme stale
 * pour nettoyage (fichier legacy de l'ancien Pipeline B).
 */
async function getAnalyticsBufferStatus() {
  logger.info('Retrieving analytics buffer status');

  const analyticsFilePath = path.join(
    process.env.HOME || '/home/pi',
    'neopro',
    'data',
    'analytics_buffer.json'
  );

  const legacySponsorFilePath = path.join(
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
      event_count: 0,
      oldest_event: null,
      newest_event: null,
    },
    legacy_sponsor_file: false,
  };

  // Unified analytics buffer
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

        // Breakdown: sponsor events within the unified buffer
        const sponsorEvents = data.filter(e => e.category === 'sponsor');
        result.sponsors.event_count = sponsorEvents.length;

        if (sponsorEvents.length > 0) {
          const sortedSponsors = sponsorEvents.sort((a, b) =>
            new Date(a.timestamp || a.played_at || 0).getTime() -
            new Date(b.timestamp || b.played_at || 0).getTime()
          );
          result.sponsors.oldest_event = sortedSponsors[0]?.timestamp || sortedSponsors[0]?.played_at || null;
          result.sponsors.newest_event = sortedSponsors[sortedSponsors.length - 1]?.timestamp || sortedSponsors[sortedSponsors.length - 1]?.played_at || null;
        }
      }
    } catch (parseError) {
      logger.warn('Failed to parse analytics buffer:', parseError.message);
    }
  }

  // Detect stale legacy file (Pipeline B remnant)
  if (await fs.pathExists(legacySponsorFilePath)) {
    result.legacy_sponsor_file = true;
    logger.warn(
      'Legacy sponsor_impressions.json still exists — this file is stale since pipeline consolidation (v3.66). ' +
      'It can be safely deleted.'
    );
  }

  return result;
}

module.exports = { getAnalyticsBufferStatus };
