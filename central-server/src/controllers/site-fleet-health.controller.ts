import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { memoryCache } from '../services/memory-cache.service';
import {
  siteRepository,
  metricsRepository,
} from '../repositories';

// Seuils de connexion (en secondes) — identiques à sites.controller.ts
const ONLINE_THRESHOLD_SECONDS = 90;
const WARNING_THRESHOLD_SECONDS = 180;

/**
 * Get fleet health data for the admin dashboard
 * Aggregates connection status, metrics, versions, and at-risk sites
 */
export const getFleetHealthData = async (req: AuthRequest, res: Response) => {
  try {
    // 1. Get all sites with their connection status, location, version, and latest metrics
    const fleetRows = await siteRepository.getFleetHealth();
    const sitesResult = { rows: fleetRows };

    const socketService = (await import('../services/socket.service')).default;
    const connectedSiteIds = new Set(socketService.getConnectedSites());
    const now = new Date();

    // Process sites
    interface SiteRow {
      id: string;
      site_name: string;
      club_name: string;
      status: string;
      last_seen_at: Date | null;
      local_ip: string | null;
      software_version: string | null;
      location: { city?: string; region?: string; lat?: number; lng?: number } | null;
      last_metric_at: Date | null;
      cpu_percent: number | null;
      memory_percent: number | null;
      temperature: number | null;
      disk_percent: number | null;
    }

    const sites = (sitesResult.rows as unknown as SiteRow[]).map((site) => {
      const isConnectedNow = connectedSiteIds.has(site.id);
      const lastSeenFromSite = site.last_seen_at ? new Date(site.last_seen_at) : null;
      const lastSeenFromMetrics = site.last_metric_at ? new Date(site.last_metric_at) : null;

      let lastSeenAt: Date | null = null;
      if (lastSeenFromSite && lastSeenFromMetrics) {
        lastSeenAt = lastSeenFromSite > lastSeenFromMetrics ? lastSeenFromSite : lastSeenFromMetrics;
      } else {
        lastSeenAt = lastSeenFromSite || lastSeenFromMetrics;
      }

      const secondsSinceLastSeen = lastSeenAt
        ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
        : null;

      const connectionHealth = isConnectedNow ? socketService.getConnectionHealth(site.id) : null;

      // Vérifier si c'est une vraie connexion zombie (socket morte mais flag actif)
      const isZombie = connectionHealth && !connectionHealth.socketConnected && connectionHealth.inMap;

      let displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
      if (isConnectedNow && !isZombie) {
        // Connecté avec socket active = online
        displayStatus = 'online';
      } else if (isConnectedNow && isZombie) {
        // Connexion zombie = warning
        displayStatus = 'warning';
      } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS) {
        displayStatus = 'online';
      } else if (secondsSinceLastSeen === null) {
        displayStatus = 'unknown';
      } else if (secondsSinceLastSeen < WARNING_THRESHOLD_SECONDS) {
        displayStatus = 'warning';
      } else {
        displayStatus = 'offline';
      }

      return {
        id: site.id,
        siteName: site.site_name,
        clubName: site.club_name,
        displayStatus,
        lastSeenAt,
        secondsSinceLastSeen,
        localIp: site.local_ip,
        softwareVersion: site.software_version,
        location: site.location,
        metrics: {
          cpu_percent: site.cpu_percent,
          memory_percent: site.memory_percent,
          temperature: site.temperature,
          disk_percent: site.disk_percent,
        },
      };
    });

    // 2. Calculate stats
    const stats = {
      total: sites.length,
      online: sites.filter((s) => s.displayStatus === 'online').length,
      warning: sites.filter((s) => s.displayStatus === 'warning').length,
      offline: sites.filter((s) => s.displayStatus === 'offline').length,
      unknown: sites.filter((s) => s.displayStatus === 'unknown').length,
    };

    // 3. Calculate health metrics
    let totalCpu = 0, totalMemory = 0, totalTemp = 0, sitesWithMetrics = 0;
    let sitesHighTemp = 0, sitesLowDisk = 0;

    for (const site of sites) {
      if (site.metrics.cpu_percent !== null) {
        totalCpu += site.metrics.cpu_percent;
        sitesWithMetrics++;
      }
      if (site.metrics.memory_percent !== null) {
        totalMemory += site.metrics.memory_percent;
      }
      if (site.metrics.temperature !== null) {
        totalTemp += site.metrics.temperature;
        if (site.metrics.temperature > 75) sitesHighTemp++;
      }
      if (site.metrics.disk_percent !== null && site.metrics.disk_percent > 90) {
        sitesLowDisk++;
      }
    }

    const health = {
      avg_cpu: sitesWithMetrics > 0 ? totalCpu / sitesWithMetrics : 0,
      avg_memory: sitesWithMetrics > 0 ? totalMemory / sitesWithMetrics : 0,
      avg_temperature: sitesWithMetrics > 0 ? totalTemp / sitesWithMetrics : 0,
      sites_high_temp: sitesHighTemp,
      sites_low_disk: sitesLowDisk,
    };

    // 4. Version distribution
    const versionCounts: Record<string, number> = {};
    for (const site of sites) {
      const version = site.softwareVersion || 'Inconnue';
      versionCounts[version] = (versionCounts[version] || 0) + 1;
    }
    const versionDistribution = Object.entries(versionCounts)
      .map(([version, count]) => ({
        version,
        count,
        percentage: (count / (sites.length || 1)) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 5. Sites by region
    const regionCounts: Record<string, { total: number; online: number }> = {};
    for (const site of sites) {
      const region = site.location?.region || 'Non définie';
      if (!regionCounts[region]) {
        regionCounts[region] = { total: 0, online: 0 };
      }
      regionCounts[region].total++;
      if (site.displayStatus === 'online') {
        regionCounts[region].online++;
      }
    }
    const sitesByRegion = Object.entries(regionCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // 6. At-risk sites
    const atRiskSites = sites.filter((site) => {
      // Offline for more than 1 hour
      if (site.displayStatus === 'offline' && site.secondsSinceLastSeen && site.secondsSinceLastSeen > 3600) {
        return true;
      }
      // High temperature
      if (site.metrics.temperature && site.metrics.temperature > 75) {
        return true;
      }
      // High CPU
      if (site.metrics.cpu_percent && site.metrics.cpu_percent > 90) {
        return true;
      }
      // Low disk
      if (site.metrics.disk_percent && site.metrics.disk_percent > 90) {
        return true;
      }
      // Warning status
      if (site.displayStatus === 'warning') {
        return true;
      }
      return false;
    }).slice(0, 10);

    res.json({
      sites,
      stats,
      health,
      versionDistribution,
      sitesByRegion,
      atRiskSites,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error('Get fleet health data error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données de santé de la flotte' });
  }
};

/**
 * Get fleet-wide average metrics
 * GET /api/sites/fleet-metrics
 * Returns average CPU, memory, temperature, disk usage across all online sites
 */
export const getFleetMetrics = async (req: AuthRequest, res: Response) => {
  try {
    // Cache fleet metrics for 30 seconds (data changes slowly)
    const cacheKey = 'fleet-metrics:global';
    const cached = memoryCache.get<{
      avgCpu: number;
      avgMemory: number;
      avgTemperature: number;
      avgDisk: number;
      sitesWithMetrics: number;
      timestamp: string;
    }>(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    // Get average metrics from the last hour for sites that have recent data
    const fleetAverages = await metricsRepository.getFleetAverages();

    const metrics = fleetAverages || {};

    const response = {
      avgCpu: Math.round((parseFloat(String(metrics.avg_cpu)) || 0) * 10) / 10,
      avgMemory: Math.round((parseFloat(String(metrics.avg_memory)) || 0) * 10) / 10,
      avgTemperature: Math.round((parseFloat(String(metrics.avg_temperature)) || 0) * 10) / 10,
      avgDisk: Math.round((parseFloat(String(metrics.avg_disk)) || 0) * 10) / 10,
      sitesWithMetrics: parseInt(String(metrics.sites_with_metrics), 10) || 0,
      timestamp: new Date().toISOString(),
    };

    // Cache for 30 seconds
    memoryCache.set(cacheKey, response, 30000);

    res.json(response);
  } catch (error) {
    logger.error('Get fleet metrics error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des métriques de la flotte' });
  }
};

/**
 * Get match history for a specific site
 * Returns recent matches with audience estimates, videos played, and duration
 */
export const getSiteMatchHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Verify site exists
    const siteInfo = await siteRepository.findBasicInfo(id);
    if (!siteInfo) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Get match history and aggregate stats in parallel
    const [matchRows, matchStats] = await Promise.all([
      siteRepository.getMatchHistory(id, limit),
      siteRepository.getMatchStats(id),
    ]);

    const stats = matchStats;

    const matches = matchRows.map((m) => ({
      id: m.id,
      matchDate: m.match_date || m.started_at,
      matchName: m.match_name || 'Match non nommé',
      audienceEstimate: m.audience_estimate,
      startedAt: m.started_at,
      endedAt: m.ended_at,
      durationMinutes: m.duration_seconds ? Math.round(m.duration_seconds / 60) : null,
      videosPlayed: m.videos_played,
      manualTriggers: m.manual_triggers,
      autoPlays: m.auto_plays,
    }));

    res.json({
      siteId: id,
      siteName: siteInfo.site_name,
      clubName: siteInfo.club_name || '',
      matches,
      stats: {
        totalMatches: parseInt(stats.total_matches),
        totalAudience: parseInt(stats.total_audience),
        avgAudience: Math.round(parseFloat(stats.avg_audience)),
        totalVideos: parseInt(stats.total_videos),
        totalDurationHours: Math.round(parseInt(stats.total_duration) / 3600),
      },
    });
  } catch (error) {
    logger.error('Get site match history error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique des matchs' });
  }
};
