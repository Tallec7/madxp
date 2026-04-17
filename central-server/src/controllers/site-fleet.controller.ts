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
    if (filename) {
      const lower = filename.toLowerCase();
      filenames.add(lower);
      // Pi sanitizes spaces→underscores, so also index the reverse
      filenames.add(lower.replace(/_/g, ' '));
      filenames.add(lower.replace(/ /g, '_'));
    }
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

  // Catégories télécommande (categories[].videos[] + subCategories[].videos[])
  const categories = config.categories as Array<{ videos?: Array<{ path?: string }>; subCategories?: Array<{ videos?: Array<{ path?: string }> }> }> | undefined;
  if (Array.isArray(categories)) {
    for (const cat of categories) {
      if (Array.isArray(cat.videos)) {
        for (const v of cat.videos) {
          if (v.path) extractFromPath(v.path);
        }
      }
      if (Array.isArray(cat.subCategories)) {
        for (const subcat of cat.subCategories) {
          if (Array.isArray(subcat.videos)) {
            for (const v of subcat.videos) {
              if (v.path) extractFromPath(v.path);
            }
          }
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

    // For SaaS sites, config lives in config_profiles, not local_config_mirror
    let effectiveConfig: Record<string, unknown> | null = site.local_config_mirror as Record<string, unknown> | null;
    if (!effectiveConfig && site.site_type === 'saas') {
      const defaultProfile = await configProfileRepository.findDefaultForSite(id);
      if (defaultProfile) {
        effectiveConfig = defaultProfile.configuration;
      }
    }

    // Club users: filter cloud videos to only show their own + NEOPRO + videos in config
    let cloudVideoRows = allCloudVideoRows;
    if (isClub) {
      const configFilenames = effectiveConfig
        ? extractConfigVideoFilenames(effectiveConfig)
        : new Set<string>();

      cloudVideoRows = allCloudVideoRows.filter((v) =>
        v.uploaded_for_site_id === id
        || (v.category && v.category.toUpperCase() === 'NEOPRO')
        || configFilenames.has(v.filename.toLowerCase())
      );
    }

    const isSaasWithProfileConfig = !site.local_config_mirror && effectiveConfig !== null;

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
      thumbnail_url: v.thumbnail_url ?? null,
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

    if (!site.local_config_mirror && !isSaasWithProfileConfig) {
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
    // For SaaS sites, use the default profile config; otherwise local_config_mirror
    const config = effectiveConfig as Record<string, unknown>;

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
      lastSync: isSaasWithProfileConfig ? null : site.last_config_sync,
      configHash: isSaasWithProfileConfig ? null : site.local_config_hash,
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

// Re-export handlers from split files for barrel compatibility
export { getSiteDashboardData } from './site-fleet-dashboard.controller';
export { getSiteTimeline } from './site-fleet-timeline.controller';
export { getFleetHealthData, getFleetMetrics, getSiteMatchHistory } from './site-fleet-health.controller';
