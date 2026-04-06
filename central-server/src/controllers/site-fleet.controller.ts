import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { getVideoUrl } from '../services/storage.service';
import { memoryCache } from '../services/memory-cache.service';
import {
  siteRepository,
  metricsRepository,
  timelineRepository,
  deploymentRepository,
  videoVariantRepository,
  analyticsRepository,
  configProfileRepository,
} from '../repositories';

// Seuils de connexion (en secondes) — identiques à sites.controller.ts
const ONLINE_THRESHOLD_SECONDS = 90;
const WARNING_THRESHOLD_SECONDS = 180;

export const getSiteMetrics = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { hours = 24 } = req.query;

    const metrics = await metricsRepository.findBySiteId(id, parseInt(hours as string));

    res.json({
      site_id: id,
      period_hours: hours,
      metrics,
    });
  } catch (error) {
    logger.error('Get site metrics error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des métriques' });
  }
};

export const getSiteStats = async (req: AuthRequest, res: Response) => {
  try {
    // Récupérer tous les sites avec leur dernier heartbeat depuis la table metrics
    const sitesRows = await siteRepository.getStats();
    const sitesResult = { rows: sitesRows };

    const socketService = (await import('../services/socket.service')).default;
    const connectedSiteIds = new Set(socketService.getConnectedSites());
    const now = new Date();

    // Calculer les stats temps réel basées sur les connexions Socket.IO et les métriques récentes
    let online = 0;
    let offline = 0;
    let maintenance = 0;
    let error = 0;

    for (const site of sitesResult.rows as Array<{
      id: string;
      status: string;
      last_seen_at: Date | null;
      last_metric_at: Date | null;
    }>) {
      // Vérifier si connecté via Socket.IO
      const isConnectedNow = connectedSiteIds.has(site.id);

      // Utiliser le plus récent entre last_seen_at et last_metric_at
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

      if (site.status === 'maintenance') {
        maintenance++;
      } else if (site.status === 'error') {
        error++;
      } else if (isConnectedNow || (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS)) {
        // Connecté via Socket.IO OU heartbeat reçu il y a moins d'1 minute
        online++;
      } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen < WARNING_THRESHOLD_SECONDS) {
        // Vu il y a moins de 2 minutes = warning (compté comme online)
        online++;
      } else {
        offline++;
      }
    }

    res.json({
      total_sites: sitesResult.rows.length,
      online,
      offline,
      maintenance,
      error,
    });
  } catch (err) {
    logger.error('Get site stats error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
};

export const getAllSitesConnectionStatus = async (req: AuthRequest, res: Response) => {
  try {
    // Utiliser le cache pour éviter les requêtes DB répétitives (TTL 10s)
    // Cache court car les données de connexion changent fréquemment
    const cacheKey = 'connection-status:all-sites';
    const cachedSites = memoryCache.get<Array<{
      id: string;
      site_name: string;
      club_name: string;
      status: string;
      last_seen_at: Date | null;
      local_ip: string | null;
      last_metric_at: Date | null;
    }>>(cacheKey);

    let sitesResult;
    if (cachedSites) {
      sitesResult = { rows: cachedSites };
    } else {
      // Récupérer tous les sites avec leur dernier heartbeat depuis la table metrics
      const rows = await siteRepository.findWithConnectionStatus();
      sitesResult = { rows };
      // Cache for 10 seconds
      memoryCache.set(cacheKey, rows, 10000);
    }

    const socketService = (await import('../services/socket.service')).default;
    const connectedSiteIds = new Set(socketService.getConnectedSites());
    const now = new Date();

    const sitesWithStatus = (sitesResult.rows as Array<{
      id: string;
      site_name: string;
      club_name: string;
      status: string;
      last_seen_at: Date | null;
      local_ip: string | null;
      last_metric_at: Date | null;
    }>).map((site) => {
      const isConnectedNow = connectedSiteIds.has(site.id);

      // Utiliser le plus récent entre last_seen_at et last_metric_at
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

      // Vérifier la santé de la connexion (détecte les connexions zombie)
      const connectionHealth = isConnectedNow ? socketService.getConnectionHealth(site.id) : null;

      // Vérifier si c'est une vraie connexion zombie (socket morte mais flag actif)
      // Une connexion avec pong légèrement stale n'est PAS une zombie
      const isZombie = connectionHealth && !connectionHealth.socketConnected && connectionHealth.inMap;

      // Un site est "online" si connecté via Socket.IO, OU si heartbeat récent
      // On ne marque "warning" que pour les vraies connexions zombies
      let displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
      if (isConnectedNow && !isZombie) {
        // Connecté avec socket active = online (même si pong légèrement stale)
        displayStatus = 'online';
      } else if (isConnectedNow && isZombie) {
        // Connexion zombie : socket dans la map mais déconnectée = warning
        displayStatus = 'warning';
      } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS) {
        // Heartbeat reçu récemment = online
        displayStatus = 'online';
      } else if (secondsSinceLastSeen === null) {
        displayStatus = 'unknown';
      } else if (secondsSinceLastSeen < WARNING_THRESHOLD_SECONDS) {
        displayStatus = 'warning';
      } else {
        displayStatus = 'offline';
      }

      return {
        siteId: site.id,
        siteName: site.site_name,
        clubName: site.club_name,
        isConnected: isConnectedNow || (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS),
        displayStatus,
        lastSeenAt,
        secondsSinceLastSeen,
        localIp: site.local_ip,
        // Ajouter les infos de santé pour le debug
        health: connectionHealth ? {
          isHealthy: connectionHealth.isHealthy,
          reason: connectionHealth.reason,
        } : undefined,
      };
    });

    // Calculer les stats globales
    const stats = {
      total: sitesWithStatus.length,
      online: sitesWithStatus.filter((s) => s.displayStatus === 'online').length,
      warning: sitesWithStatus.filter((s) => s.displayStatus === 'warning').length,
      offline: sitesWithStatus.filter((s) => s.displayStatus === 'offline').length,
      unknown: sitesWithStatus.filter((s) => s.displayStatus === 'unknown').length,
    };

    res.json({
      sites: sitesWithStatus,
      stats,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error('Get all sites connection status error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statuts de connexion' });
  }
};

/**
 * Endpoint de debug pour voir l'état interne des connexions WebSocket
 * GET /api/sites/debug/connections
 */
export const getConnectionsDebug = async (req: AuthRequest, res: Response) => {
  try {
    const socketService = (await import('../services/socket.service')).default;
    const debugInfo = socketService.getDebugInfo();

    // Ajouter les infos de la base de données pour comparaison
    const dbSitesResult = { rows: await siteRepository.findForDebug() };

    res.json({
      socketService: debugInfo,
      databaseOnlineSites: dbSitesResult.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Get connections debug error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des infos de debug' });
  }
};

export const getSiteConnectionStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Récupérer les infos du site
    const site = await siteRepository.findConnectionInfo(id);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Vérifier la connexion en temps réel via le socket
    const socketService = (await import('../services/socket.service')).default;
    const isConnectedNow = socketService.isConnected(id);

    // Récupérer le dernier heartbeat depuis la table metrics (source de vérité)
    const latestMetric = await metricsRepository.getLatestForSite(id);
    const lastMetricAt = latestMetric?.recorded_at || null;

    // Utiliser le plus récent entre last_seen_at (Socket.IO) et last_metric (table metrics)
    const lastSeenFromSite = site.last_seen_at ? new Date(site.last_seen_at) : null;
    const lastSeenFromMetrics = lastMetricAt ? new Date(lastMetricAt) : null;

    // Prendre le plus récent des deux
    let lastSeenAt: Date | null = null;
    if (lastSeenFromSite && lastSeenFromMetrics) {
      lastSeenAt = lastSeenFromSite > lastSeenFromMetrics ? lastSeenFromSite : lastSeenFromMetrics;
    } else {
      lastSeenAt = lastSeenFromSite || lastSeenFromMetrics;
    }

    const now = new Date();
    const secondsSinceLastSeen = lastSeenAt
      ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
      : null;

    // Déterminer le statut d'affichage
    // Un site est "online" si connecté via Socket.IO OU si on a reçu un heartbeat récemment
    let displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
    if (isConnectedNow) {
      displayStatus = 'online';
    } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS) {
      // Heartbeat reçu récemment = online (même sans Socket.IO direct)
      displayStatus = 'online';
    } else if (secondsSinceLastSeen === null) {
      displayStatus = 'unknown';
    } else if (secondsSinceLastSeen < WARNING_THRESHOLD_SECONDS) {
      // Heartbeat pas trop ancien = warning
      displayStatus = 'warning';
    } else {
      displayStatus = 'offline';
    }

    // Récupérer les statistiques de connexion récentes (24h)
    const stats = await metricsRepository.get24hStatsForSite(id);

    const heartbeatCount24h = parseInt(stats?.heartbeat_count || '0', 10);
    // Uptime estimé: heartbeat toutes les 30s = 2880 max par 24h
    const uptime24h = Math.min(100, (heartbeatCount24h / 2880) * 100);

    // Un site est considéré "connecté" si Socket.IO actif OU heartbeat récent
    const isEffectivelyConnected = isConnectedNow || (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS);

    // Récupérer l'état de santé détaillé de la connexion WebSocket
    const connectionHealth = socketService.getConnectionHealth(id);

    res.json({
      siteId: id,
      siteName: site.site_name,
      clubName: site.club_name,
      connection: {
        isConnected: isEffectivelyConnected,
        displayStatus,
        lastSeenAt,
        secondsSinceLastSeen,
        localIp: site.local_ip,
      },
      sync: {
        lastConfigSync: site.last_config_sync,
      },
      statistics: {
        heartbeats24h: heartbeatCount24h,
        uptime24h: Math.round(uptime24h * 100) / 100,
        firstHeartbeat24h: stats?.first_heartbeat,
        lastHeartbeat24h: stats?.last_heartbeat,
      },
      // Nouvel objet health pour détecter les connexions zombies
      health: {
        socketInMap: connectionHealth.inMap,
        socketConnected: connectionHealth.socketConnected,
        lastPongAgeMs: connectionHealth.lastPongAgeMs,
        isHealthy: connectionHealth.isHealthy,
        reason: connectionHealth.reason,
      },
    });
  } catch (error) {
    logger.error('Get site connection status error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du statut de connexion' });
  }
};

/**
 * Extrait tous les filenames de vidéos référencés dans la config d'un site
 * (boucle par défaut sponsors[] + boucles par phase timeCategories[].loopVideos[]).
 */
function extractConfigVideoFilenames(config: Record<string, unknown>): Set<string> {
  const filenames = new Set<string>();

  const extractFromPath = (path: string): void => {
    if (!path) return;
    // Le path peut être "videos/default/01_NEOPRO.mp4" → extraire le filename
    const filename = path.split('/').pop();
    if (filename) filenames.add(filename.toLowerCase());
  };

  // Boucle par défaut
  const sponsors = config.sponsors as Array<{ path?: string }> | undefined;
  if (Array.isArray(sponsors)) {
    for (const s of sponsors) {
      if (s.path) extractFromPath(s.path);
    }
  }

  // Boucles par phase (timeCategories[].loopVideos[])
  const timeCategories = config.timeCategories as Array<{ loopVideos?: Array<{ path?: string }> }> | undefined;
  if (Array.isArray(timeCategories)) {
    for (const tc of timeCategories) {
      if (Array.isArray(tc.loopVideos)) {
        for (const lv of tc.loopVideos) {
          if (lv.path) extractFromPath(lv.path);
        }
      }
    }
  }

  return filenames;
}

export const getSiteLocalContent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const isClub = req.user?.role === 'club';

    // Récupérer le site, les vidéos cloud et les chemins déployés en parallèle
    const [site, allCloudVideoRows, deployedPathRows] = await Promise.all([
      siteRepository.findWithLocalContent(id),
      timelineRepository.getCloudVideos(500),
      deploymentRepository.getDeployedPathsForSite(id),
    ]);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Club users: filter cloud videos to only show their own + NEOPRO + videos in config
    let cloudVideoRows = allCloudVideoRows;
    if (isClub) {
      // For SaaS sites, config lives in config_profiles, not local_config_mirror
      let siteConfig: Record<string, unknown> | null = site.local_config_mirror as Record<string, unknown> | null;
      if (!siteConfig && site.site_type === 'saas') {
        const defaultProfile = await configProfileRepository.findDefaultForSite(id);
        if (defaultProfile) {
          siteConfig = defaultProfile.configuration;
        }
      }

      const configFilenames = siteConfig
        ? extractConfigVideoFilenames(siteConfig)
        : new Set<string>();

      cloudVideoRows = allCloudVideoRows.filter((v) =>
        v.uploaded_for_site_id === id
        || (v.category && v.category.toUpperCase() === 'NEOPRO')
        || configFilenames.has(v.filename.toLowerCase())
      );
    }

    // Formatter les vidéos cloud
    const cloudVideos = cloudVideoRows.map((v) => ({
      id: v.id,
      filename: v.filename,
      originalName: v.original_name,
      title: v.metadata?.title || v.original_name || v.filename,
      category: v.category,
      subcategory: v.subcategory,
      size: v.file_size,
      duration: v.duration,
      checksum: v.checksum,
      url: v.storage_path ? getVideoUrl(v.storage_path) : null,
      uploadedForSiteId: v.uploaded_for_site_id,
      createdAt: v.created_at,
      updatedAt: v.updated_at,
      advertiserName: v.advertiser_name,
    }));

    // Récupérer les IDs des vidéos ayant une variante secondaire
    const cloudVideoIds = cloudVideoRows.map((v) => v.id);
    const secondaryVariants = await videoVariantRepository.findSecondaryVariantsForVideos(cloudVideoIds);
    const secondaryVariantVideoIds = secondaryVariants.map((v) => v.video_id);
    const secondaryDisplayEnabled = site.secondary_display_enabled ?? false;

    // Chemins réels rapportés par le Pi après déploiement (videoId → path)
    const deployedPaths = deployedPathRows.map((r) => ({
      videoId: r.video_id,
      deployedPath: r.deployed_path,
      deployedFilename: r.deployed_filename,
    }));

    if (!site.local_config_mirror) {
      return res.json({
        siteId: id,
        siteName: site.site_name,
        clubName: site.club_name,
        hasContent: false,
        lastSync: null,
        configHash: null,
        configuration: null,
        localVideos: [],
        cloudVideos,
        localStorage: null,
        lastVideoSync: null,
        hotspotInfo: null,
        secondaryVariantVideoIds,
        secondaryDisplayEnabled,
        deployedPaths,
      });
    }

    // Type the config as any to access dynamic properties
    const config = site.local_config_mirror as Record<string, unknown>;

    // Extraire les vidéos, le stockage et les infos hotspot depuis la config enrichie
    const localVideos = (config._localVideos as Array<unknown>) || [];
    const localStorage = config._localStorage || null;
    const lastVideoSync = (config._lastVideoSync as string) || null;
    const hotspotInfo = config._hotspotInfo || null;

    // Retourner la config sans les champs internes (_prefixés)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _localVideos, _localStorage, _lastVideoSync, _hotspotSsid, _hotspotInfo, ...cleanConfig } = config;

    res.json({
      siteId: id,
      siteName: site.site_name,
      clubName: site.club_name,
      hasContent: true,
      lastSync: site.last_config_sync,
      configHash: site.local_config_hash,
      configuration: cleanConfig,
      localVideos,
      cloudVideos,
      localStorage,
      lastVideoSync,
      hotspotInfo,
      secondaryVariantVideoIds,
      secondaryDisplayEnabled,
      deployedPaths,
    });
  } catch (error) {
    logger.error('Get site local content error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du contenu local' });
  }
};

/**
 * Endpoint agrégé qui combine connection status + metrics en une seule requête
 * Optimise le nombre d'appels API pour le dashboard temps réel
 */
export const getSiteDashboardData = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { hours = 24 } = req.query;

    // Récupérer les infos du site
    const site = await siteRepository.findConnectionInfo(id);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Vérifier la connexion en temps réel via le socket
    const socketService = (await import('../services/socket.service')).default;
    const isConnectedNow = socketService.isConnected(id);

    // Récupérer les métriques (inclut aussi le last_heartbeat)
    const metricsRows = await metricsRepository.findBySiteId(id, parseInt(hours as string));

    const lastMetricAt = metricsRows[0]?.recorded_at || null;

    // Utiliser le plus récent entre last_seen_at (Socket.IO) et last_metric (table metrics)
    const lastSeenFromSite = site.last_seen_at ? new Date(site.last_seen_at) : null;
    const lastSeenFromMetrics = lastMetricAt ? new Date(lastMetricAt) : null;

    let lastSeenAt: Date | null = null;
    if (lastSeenFromSite && lastSeenFromMetrics) {
      lastSeenAt = lastSeenFromSite > lastSeenFromMetrics ? lastSeenFromSite : lastSeenFromMetrics;
    } else {
      lastSeenAt = lastSeenFromSite || lastSeenFromMetrics;
    }

    const now = new Date();
    const secondsSinceLastSeen = lastSeenAt
      ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
      : null;

    // Déterminer le statut d'affichage
    let displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
    if (isConnectedNow) {
      displayStatus = 'online';
    } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS) {
      displayStatus = 'online';
    } else if (secondsSinceLastSeen === null) {
      displayStatus = 'unknown';
    } else if (secondsSinceLastSeen < WARNING_THRESHOLD_SECONDS) {
      displayStatus = 'warning';
    } else {
      displayStatus = 'offline';
    }

    // Récupérer les statistiques de connexion récentes (24h)
    const stats = await metricsRepository.get24hStatsForSite(id);

    // Récupérer l'état de santé détaillé de la connexion WebSocket
    const connectionHealth = socketService.getConnectionHealth(id);

    // SaaS-specific metrics: connected browsers + video activity
    let saasMetrics: {
      connectedClients: number;
      todayVideosPlayed: number;
      todayScreenTime: number;
      todaySessions: number;
      weekVideosPlayed: number;
      weekScreenTime: number;
      weekCompletionRate: number;
      weekSponsorsDisplayed: number;
    } | null = null;

    if (site.site_type === 'saas') {
      const saasClientCount = socketService.getSaasClientCount(id);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
      const now = new Date();

      const [todayUsage, weekUsage, todaySessions, weekSponsors, weekCompletion] = await Promise.all([
        analyticsRepository.getDashboardUsage(id, todayStart.toISOString(), now.toISOString()),
        analyticsRepository.getDashboardUsage(id, weekStart.toISOString(), now.toISOString()),
        analyticsRepository.countSessions(id, todayStart.toISOString()),
        analyticsRepository.countSponsorsDisplayed(id, weekStart.toISOString()),
        analyticsRepository.getCompletionRate(id, weekStart.toISOString()),
      ]);

      saasMetrics = {
        connectedClients: saasClientCount,
        todayVideosPlayed: parseInt(todayUsage.videos_played),
        todayScreenTime: parseInt(todayUsage.screen_time_seconds),
        todaySessions,
        weekVideosPlayed: parseInt(weekUsage.videos_played),
        weekScreenTime: parseInt(weekUsage.screen_time_seconds),
        weekCompletionRate: weekCompletion,
        weekSponsorsDisplayed: weekSponsors,
      };
    }

    // Réponse combinée
    res.json({
      site: {
        id: site.id,
        site_name: site.site_name,
        club_name: site.club_name,
      },
      connection: {
        isConnected: isConnectedNow || (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS),
        status: displayStatus,
        lastSeenAt,
        secondsSinceLastSeen,
        localIp: site.local_ip,
        lastConfigSync: site.last_config_sync,
        heartbeat_24h: {
          count: parseInt(stats.heartbeat_count as string),
          firstAt: stats.first_heartbeat,
          lastAt: stats.last_heartbeat,
        },
      },
      // Nouvel objet health pour détecter les connexions zombies
      health: {
        socketInMap: connectionHealth.inMap,
        socketConnected: connectionHealth.socketConnected,
        lastPongAgeMs: connectionHealth.lastPongAgeMs,
        isHealthy: connectionHealth.isHealthy,
        reason: connectionHealth.reason,
      },
      metrics: {
        period_hours: hours,
        data: metricsRows,
      },
      // SaaS-specific metrics (null for Pi sites)
      saasMetrics,
    });
  } catch (error) {
    logger.error('Get site dashboard data error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données du dashboard' });
  }
};

/**
 * Récupère la timeline des événements récents pour un site
 * Agrège: déploiements, commandes, alertes, changements de config
 * Utile pour le debugging et le suivi d'activité
 */
export const getSiteTimeline = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;
    const maxLimit = Math.min(parseInt(limit as string, 10), 50);

    // Vérifier que le site existe
    const siteInfo = await siteRepository.findBasicInfo(id);

    if (!siteInfo) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Récupérer les événements de plusieurs sources via le timeline repository
    const timelineData = await timelineRepository.getForSite(id, maxLimit);
    const deploymentsResult = { rows: timelineData.deployments, rowCount: timelineData.deployments.length };
    const commandsResult = { rows: timelineData.commands, rowCount: timelineData.commands.length };
    const configHistoryResult = { rows: timelineData.configs, rowCount: timelineData.configs.length };
    const alertsResult = { rows: timelineData.alerts, rowCount: timelineData.alerts.length };

    // Types pour les résultats de requêtes
    interface DeploymentRow {
      id: string;
      timestamp: string;
      status: string;
      video_name: string | null;
      category: string | null;
      progress: number | null;
      error_message: string | null;
      user_email: string | null;
    }
    interface CommandRow {
      id: string;
      timestamp: string;
      command_type: string;
      status: string;
      result: unknown;
      user_email: string | null;
    }
    interface ConfigRow {
      id: string;
      timestamp: string;
      comment: string | null;
      changes_summary: unknown[];
      user_email: string | null;
    }
    interface AlertRow {
      id: string;
      timestamp: string;
      alert_type: string;
      severity: string;
      message: string | null;
      resolved: boolean;
      resolved_at: string | null;
    }

    // Transformer les résultats en événements uniformes
    const events: Array<{
      id: string;
      type: string;
      timestamp: string;
      title: string;
      details: Record<string, unknown>;
      status?: string;
      user?: string;
    }> = [];

    // Déploiements
    for (const row of deploymentsResult.rows as unknown as DeploymentRow[]) {
      events.push({
        id: row.id,
        type: 'deployment',
        timestamp: row.timestamp,
        title: `Déploiement: ${row.video_name || 'Vidéo'}`,
        details: {
          category: row.category,
          progress: row.progress,
          error: row.error_message,
        },
        status: row.status,
        user: row.user_email || undefined,
      });
    }

    // Commandes
    for (const row of commandsResult.rows as unknown as CommandRow[]) {
      events.push({
        id: row.id,
        type: 'command',
        timestamp: row.timestamp,
        title: `Commande: ${row.command_type}`,
        details: {
          result: row.result,
        },
        status: row.status,
        user: row.user_email || undefined,
      });
    }

    // Configs
    for (const row of configHistoryResult.rows as unknown as ConfigRow[]) {
      const changesCount = Array.isArray(row.changes_summary)
        ? row.changes_summary.length
        : 0;
      events.push({
        id: row.id,
        type: 'config',
        timestamp: row.timestamp,
        title: row.comment || 'Mise à jour configuration',
        details: {
          changesCount,
        },
        status: 'completed',
        user: row.user_email || undefined,
      });
    }

    // Alertes
    for (const row of alertsResult.rows as unknown as AlertRow[]) {
      events.push({
        id: row.id,
        type: 'alert',
        timestamp: row.timestamp,
        title: row.message || `Alerte: ${row.alert_type}`,
        details: {
          alertType: row.alert_type,
          severity: row.severity,
          resolved: row.resolved,
          resolvedAt: row.resolved_at,
        },
        status: row.resolved ? 'resolved' : 'active',
      });
    }

    // Trier par timestamp décroissant et limiter
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limitedEvents = events.slice(0, maxLimit);

    res.json({
      siteId: id,
      siteName: siteInfo.site_name,
      events: limitedEvents,
      counts: {
        deployments: deploymentsResult.rowCount,
        commands: commandsResult.rowCount,
        configs: configHistoryResult.rowCount,
        alerts: alertsResult.rowCount,
      },
    });
  } catch (error) {
    logger.error('Get site timeline error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la timeline' });
  }
};

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
