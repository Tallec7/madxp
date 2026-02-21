/**
 * SponsorStatsService — Calcul de statistiques locales pour les sponsors
 *
 * Lit les buffers d'impressions sponsors sur le Pi (données non encore envoyées
 * au central + historique local) pour offrir un aperçu immédiat au club staff,
 * sans dépendre d'une connexion internet.
 *
 * Sources de données :
 * - sponsor_impressions.json (impressions sponsors avec durée, complétion, etc.)
 * - configuration.json (noms des sponsors, vidéos liées)
 */

const fs = require('fs');
const path = require('path');

const NEOPRO_DATA_DIR = path.join(
  process.env.HOME || '/home/pi',
  'neopro',
  'data'
);
const IMPRESSIONS_FILE = path.join(NEOPRO_DATA_DIR, 'sponsor_impressions.json');
const ANALYTICS_FILE = path.join(NEOPRO_DATA_DIR, 'analytics_buffer.json');

// Fichier de stats agrégées persisté localement (survit aux flushes du buffer)
const STATS_HISTORY_FILE = path.join(NEOPRO_DATA_DIR, 'sponsor_stats_history.json');

class SponsorStatsService {
  /**
   * @param {Object} deps
   * @param {import('./configuration.service')} deps.configService
   */
  constructor({ configService }) {
    this._configService = configService;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Retourne un résumé global + détail par sponsor.
   * Combine les données du buffer courant + l'historique persisté.
   *
   * @param {Object} [options]
   * @param {number} [options.days=30] - Fenêtre en jours
   * @returns {Promise<Object>} { summary, sponsors, daily }
   */
  async getStats(options = {}) {
    const days = options.days || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffISO = cutoff.toISOString();

    // Charger toutes les sources
    const [impressions, config, history] = await Promise.all([
      this._readImpressions(),
      this._configService.loadConfig(),
      this._readHistory(),
    ]);

    // Fusionner le buffer courant avec l'historique
    const allImpressions = this._mergeWithHistory(impressions, history, cutoffISO);

    // Construire la map sponsor → nom
    const sponsorMap = this._buildSponsorMap(config);

    // Filtrer par fenêtre
    const filtered = allImpressions.filter(
      imp => imp.played_at && imp.played_at >= cutoffISO
    );

    // Agréger
    const summary = this._computeSummary(filtered);
    const sponsors = this._computePerSponsor(filtered, sponsorMap);
    const daily = this._computeDaily(filtered, days);

    return { summary, sponsors, daily, period: { days, from: cutoffISO } };
  }

  /**
   * Persiste un snapshot des stats courantes dans l'historique local.
   * Appelé périodiquement par le sync-agent ou au flush du buffer,
   * pour conserver les données même après envoi au central.
   */
  async persistCurrentBuffer() {
    const impressions = await this._readImpressions();
    if (impressions.length === 0) return;

    const history = await this._readHistory();

    // Dédupliquer par event_id
    const existingIds = new Set(history.map(h => h.event_id).filter(Boolean));
    const newEntries = impressions.filter(
      imp => imp.event_id && !existingIds.has(imp.event_id)
    );

    if (newEntries.length === 0) return;

    // Garder un résumé compact (pas tout l'objet)
    const compact = newEntries.map(imp => ({
      event_id: imp.event_id,
      video_filename: imp.video_filename,
      played_at: imp.played_at,
      duration_played: imp.duration_played || 0,
      video_duration: imp.video_duration || 0,
      completed: imp.completed || false,
      site_sponsor_id: imp.site_sponsor_id || null,
      _sponsorLocalId: imp._sponsorLocalId || null,
    }));

    history.push(...compact);

    // Purger les entrées > 90 jours pour éviter un fichier énorme
    const maxAge = new Date();
    maxAge.setDate(maxAge.getDate() - 90);
    const maxAgeISO = maxAge.toISOString();
    const pruned = history.filter(h => h.played_at >= maxAgeISO);

    this._writeHistory(pruned);

    return { added: compact.length, total: pruned.length };
  }

  // ===========================================================================
  // AGGREGATION HELPERS
  // ===========================================================================

  /**
   * Résumé global : total impressions, temps d'écran, complétion moyenne, etc.
   */
  _computeSummary(impressions) {
    if (impressions.length === 0) {
      return {
        total_impressions: 0,
        total_screen_time_seconds: 0,
        avg_completion_rate: 0,
        completed_count: 0,
        unique_videos: 0,
        active_days: 0,
      };
    }

    const totalDuration = impressions.reduce(
      (sum, imp) => sum + (imp.duration_played || 0), 0
    );
    const completedCount = impressions.filter(imp => imp.completed).length;
    const uniqueVideos = new Set(impressions.map(imp => imp.video_filename)).size;
    const uniqueDays = new Set(
      impressions.map(imp => imp.played_at?.slice(0, 10)).filter(Boolean)
    ).size;

    return {
      total_impressions: impressions.length,
      total_screen_time_seconds: totalDuration,
      avg_completion_rate: Math.round((completedCount / impressions.length) * 100),
      completed_count: completedCount,
      unique_videos: uniqueVideos,
      active_days: uniqueDays,
    };
  }

  /**
   * Stats par sponsor : regroupe par nom ou ID sponsor.
   */
  _computePerSponsor(impressions, sponsorMap) {
    const byKey = new Map();

    for (const imp of impressions) {
      // Identifier le sponsor : par _sponsorLocalId, site_sponsor_id ou video_filename
      const key = imp._sponsorLocalId
        || imp.site_sponsor_id
        || this._findSponsorKeyByVideo(imp.video_filename, sponsorMap)
        || 'unknown';

      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          name: sponsorMap.get(key)?.name || key,
          source: sponsorMap.get(key)?.source || 'unknown',
          impressions: 0,
          screen_time_seconds: 0,
          completed: 0,
          videos: new Set(),
        });
      }

      const entry = byKey.get(key);
      entry.impressions++;
      entry.screen_time_seconds += imp.duration_played || 0;
      if (imp.completed) entry.completed++;
      if (imp.video_filename) entry.videos.add(imp.video_filename);
    }

    return Array.from(byKey.values())
      .map(entry => ({
        key: entry.key,
        name: entry.name,
        source: entry.source,
        impressions: entry.impressions,
        screen_time_seconds: entry.screen_time_seconds,
        completion_rate: entry.impressions > 0
          ? Math.round((entry.completed / entry.impressions) * 100)
          : 0,
        video_count: entry.videos.size,
      }))
      .sort((a, b) => b.impressions - a.impressions);
  }

  /**
   * Tendance quotidienne : impressions par jour.
   */
  _computeDaily(impressions, days) {
    const byDay = new Map();

    // Initialiser tous les jours de la fenêtre
    const now = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { date: key, impressions: 0, screen_time: 0 });
    }

    for (const imp of impressions) {
      const day = imp.played_at?.slice(0, 10);
      if (day && byDay.has(day)) {
        byDay.get(day).impressions++;
        byDay.get(day).screen_time += imp.duration_played || 0;
      }
    }

    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  // ===========================================================================
  // SPONSOR MAP (local config → name mapping)
  // ===========================================================================

  /**
   * Construit une map clé → { name, source } depuis la configuration.
   */
  _buildSponsorMap(config) {
    const map = new Map();

    // Sponsors locaux
    for (const sponsor of (config.localSponsors || [])) {
      map.set(sponsor.localId, { name: sponsor.name, source: 'local' });
      if (sponsor.centralId) {
        map.set(sponsor.centralId, { name: sponsor.name, source: 'local' });
      }
      // Mapper aussi par filename pour le fallback
      for (const filename of (sponsor.videoFilenames || [])) {
        if (!map.has(`file:${filename}`)) {
          map.set(`file:${filename}`, { name: sponsor.name, source: 'local' });
        }
      }
    }

    // Sponsors NEOPRO (depuis la boucle)
    for (const loopEntry of (config.sponsors || [])) {
      if (loopEntry.locked || loopEntry.owner === 'neopro') {
        const key = loopEntry.site_sponsor_id || loopEntry.path;
        if (!map.has(key)) {
          map.set(key, {
            name: loopEntry.display_name || loopEntry.path,
            source: 'neopro',
          });
        }
        if (!map.has(`file:${loopEntry.path}`)) {
          map.set(`file:${loopEntry.path}`, {
            name: loopEntry.display_name || loopEntry.path,
            source: 'neopro',
          });
        }
      }
    }

    return map;
  }

  /**
   * Tente de trouver un sponsor par nom de fichier vidéo.
   */
  _findSponsorKeyByVideo(filename, sponsorMap) {
    if (!filename) return null;
    const entry = sponsorMap.get(`file:${filename}`);
    if (entry) {
      // Retrouver la clé principale
      for (const [key, val] of sponsorMap) {
        if (!key.startsWith('file:') && val.name === entry.name) return key;
      }
    }
    return null;
  }

  // ===========================================================================
  // FILE I/O
  // ===========================================================================

  /**
   * Lit le buffer d'impressions sponsors.
   */
  async _readImpressions() {
    return this._readJsonFile(IMPRESSIONS_FILE);
  }

  /**
   * Lit l'historique de stats persisté.
   */
  async _readHistory() {
    return this._readJsonFile(STATS_HISTORY_FILE);
  }

  /**
   * Écrit l'historique de stats.
   */
  _writeHistory(data) {
    try {
      const dir = path.dirname(STATS_HISTORY_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STATS_HISTORY_FILE, JSON.stringify(data));
    } catch (error) {
      console.error('[sponsor-stats] Failed to write history:', error.message);
    }
  }

  /**
   * Fusionne le buffer courant avec l'historique, en dédupliquant par event_id.
   */
  _mergeWithHistory(currentBuffer, history, cutoffISO) {
    const seen = new Set();
    const merged = [];

    // Historique d'abord (plus ancien)
    for (const entry of history) {
      if (entry.played_at && entry.played_at >= cutoffISO) {
        if (entry.event_id) {
          if (!seen.has(entry.event_id)) {
            seen.add(entry.event_id);
            merged.push(entry);
          }
        } else {
          merged.push(entry);
        }
      }
    }

    // Buffer courant (plus récent, prioritaire si doublon)
    for (const entry of currentBuffer) {
      if (entry.played_at && entry.played_at >= cutoffISO) {
        if (entry.event_id) {
          if (!seen.has(entry.event_id)) {
            seen.add(entry.event_id);
            merged.push(entry);
          }
        } else {
          merged.push(entry);
        }
      }
    }

    return merged;
  }

  /**
   * Lit un fichier JSON, retourne [] si absent ou invalide.
   */
  _readJsonFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.error(`[sponsor-stats] Failed to read ${path.basename(filePath)}:`, error.message);
    }
    return [];
  }
}

module.exports = SponsorStatsService;
