import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import {
  siteRepository,
  metricsRepository,
  analyticsRepository,
  configProfileRepository,
  siteSponsorRepository,
  alertRepository,
  softwareUpdateRepository,
} from '../repositories';

// Seuils de connexion (en secondes) — identiques à sites.controller.ts
const ONLINE_THRESHOLD_SECONDS = 90;
const WARNING_THRESHOLD_SECONDS = 180;

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

    // SaaS-specific metrics: connected browsers + video activity + trends/insights
    interface SaasDailyPoint {
      day: string;
      videosPlayed: number;
      screenTimeSeconds: number;
    }
    interface SaasTopVideo {
      filename: string;
      category: string;
      plays: number;
      avgCompletion: number;
    }
    interface SaasActiveProfile {
      id: string;
      name: string;
      displayName: string | null;
      loopVideoCount: number;
      sponsorCount: number;
    }
    interface SaasActiveSponsor {
      id: string;
      name: string;
      logoUrl: string | null;
      videoCount: number;
      totalImpressions: number;
    }
    interface LastOtaDeployment {
      version: string;
      status: string;
      completedAt: string | null;
      createdAt: string;
    }
    let saasMetrics: {
      connectedClients: number;
      todayVideosPlayed: number;
      todayScreenTime: number;
      todaySessions: number;
      weekVideosPlayed: number;
      weekScreenTime: number;
      weekCompletionRate: number;
      weekSponsorsDisplayed: number;
      // Trends (#1) — valeurs de la période précédente pour calculer ↑↓
      yesterdayVideosPlayed: number;
      yesterdayScreenTime: number;
      previousWeekCompletionRate: number;
      previousWeekVideosPlayed: number;
      // Sparklines (#2) — 7 derniers jours
      dailySparkline: SaasDailyPoint[];
      // Top vidéos (#3)
      topVideos: SaasTopVideo[];
      // Profil actif (#4)
      activeProfile: SaasActiveProfile | null;
      // Sponsors actifs (#5)
      activeSponsors: SaasActiveSponsor[];
      // Pi-only (option B) — dernière OTA + alertes actives (0/null pour SaaS)
      lastOtaDeployment: LastOtaDeployment | null;
      activeAlertsCount: number;
    } | null = null;

    // Engagement metrics sont calculees pour TOUS les sites (SaaS + Pi).
    // Les sites demo/test sont exclus pour eviter du bruit.
    if (site.site_type === 'saas' || site.site_type === 'pi' || !site.site_type) {
      const saasClientCount =
        site.site_type === 'saas' ? socketService.getSaasClientCount(id) : 0;
      const nowDate = new Date();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
      const previousWeekStart = new Date(weekStart);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);

      const [
        todayUsage,
        yesterdayUsage,
        weekUsage,
        previousWeekUsage,
        todaySessions,
        weekSponsors,
        weekCompletion,
        previousWeekCompletion,
        dailySeries,
        topVideosRows,
        defaultProfile,
        siteSponsorsList,
        lastOtaRow,
        activeAlertsCount,
      ] = await Promise.all([
        analyticsRepository.getDashboardUsage(id, todayStart.toISOString(), nowDate.toISOString()),
        analyticsRepository.getDashboardUsage(id, yesterdayStart.toISOString(), todayStart.toISOString()),
        analyticsRepository.getDashboardUsage(id, weekStart.toISOString(), nowDate.toISOString()),
        analyticsRepository.getDashboardUsage(id, previousWeekStart.toISOString(), weekStart.toISOString()),
        analyticsRepository.countSessions(id, todayStart.toISOString()),
        analyticsRepository.countSponsorsDisplayed(id, weekStart.toISOString()),
        analyticsRepository.getCompletionRate(id, weekStart.toISOString()),
        analyticsRepository.getCompletionRateRange(
          id,
          previousWeekStart.toISOString(),
          weekStart.toISOString()
        ),
        analyticsRepository.getDailyUsage(
          id,
          weekStart.toISOString().slice(0, 10),
          nowDate.toISOString().slice(0, 10)
        ),
        analyticsRepository.getTopVideos(id, weekStart.toISOString(), nowDate.toISOString(), 3),
        configProfileRepository.findDefaultForSite(id),
        siteSponsorRepository.listBySite(id).catch(() => []),
        softwareUpdateRepository.findLastForSite(id).catch(() => null),
        alertRepository.countActiveForSite(id).catch(() => 0),
      ]);

      // #4 — active profile : extraire le nombre de vidéos de boucle + sponsors depuis la config JSONB
      let activeProfile: SaasActiveProfile | null = null;
      if (defaultProfile) {
        const cfg = (defaultProfile.configuration || {}) as Record<string, unknown>;
        const loopVideos = Array.isArray((cfg as { loopVideos?: unknown[] }).loopVideos)
          ? ((cfg as { loopVideos: unknown[] }).loopVideos as unknown[]).length
          : 0;
        const sponsors = Array.isArray((cfg as { sponsors?: unknown[] }).sponsors)
          ? ((cfg as { sponsors: unknown[] }).sponsors as unknown[]).length
          : 0;
        activeProfile = {
          id: defaultProfile.id,
          name: defaultProfile.name,
          displayName: defaultProfile.display_name,
          loopVideoCount: loopVideos,
          sponsorCount: sponsors,
        };
      }

      // #5 — active sponsors : top 5 par impressions, uniquement actifs (avec vidéos)
      const activeSponsors: SaasActiveSponsor[] = siteSponsorsList
        .filter((s) => parseInt(s.video_count) > 0)
        .slice(0, 5)
        .map((s) => ({
          id: s.id,
          name: s.name,
          logoUrl: s.logo_url,
          videoCount: parseInt(s.video_count) || 0,
          totalImpressions: parseInt(s.total_impressions) || 0,
        }));

      saasMetrics = {
        connectedClients: saasClientCount,
        todayVideosPlayed: parseInt(todayUsage.videos_played),
        todayScreenTime: parseInt(todayUsage.screen_time_seconds),
        todaySessions,
        weekVideosPlayed: parseInt(weekUsage.videos_played),
        weekScreenTime: parseInt(weekUsage.screen_time_seconds),
        weekCompletionRate: weekCompletion,
        weekSponsorsDisplayed: weekSponsors,
        yesterdayVideosPlayed: parseInt(yesterdayUsage.videos_played),
        yesterdayScreenTime: parseInt(yesterdayUsage.screen_time_seconds),
        previousWeekCompletionRate: previousWeekCompletion,
        previousWeekVideosPlayed: parseInt(previousWeekUsage.videos_played),
        dailySparkline: dailySeries.map((d) => ({
          day: d.day,
          videosPlayed: d.videos_played,
          screenTimeSeconds: d.screen_time_seconds,
        })),
        topVideos: topVideosRows.map((v) => ({
          filename: v.video_filename,
          category: v.category,
          plays: parseInt(v.plays) || 0,
          avgCompletion: Math.round(v.avg_completion || 0),
        })),
        activeProfile,
        activeSponsors,
        lastOtaDeployment: lastOtaRow
          ? {
              version: lastOtaRow.version,
              status: lastOtaRow.status,
              completedAt: lastOtaRow.completed_at
                ? new Date(lastOtaRow.completed_at).toISOString()
                : null,
              createdAt: new Date(lastOtaRow.created_at).toISOString(),
            }
          : null,
        activeAlertsCount,
      };
    }

    // Réponse combinée
    res.json({
      site: {
        id: site.id,
        site_name: site.site_name,
        club_name: site.club_name,
        site_type: site.site_type,
        software_version: site.software_version,
        last_seen_at: site.last_seen_at,
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
