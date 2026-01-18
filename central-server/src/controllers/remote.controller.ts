/**
 * Remote Cloud Controller
 *
 * Permet de contrôler un site Neopro à distance via le cloud.
 * Utile pour les réseaux avec isolation client (mesh WiFi, entreprise).
 *
 * Les commandes sont relayées via Socket.IO vers le Pi connecté.
 *
 * Date: 2026-01-18
 */

import { Response } from 'express';
import { AuthRequest } from '../types';
import { query } from '../config/database';
import socketService from '../services/socket.service';
import { auditService } from '../services/audit.service';
import logger from '../config/logger';

/**
 * Vérifie que l'utilisateur a accès au site
 */
async function verifyUserAccessToSite(userId: string, userRole: string, siteId: string): Promise<boolean> {
  // Super admin et admin ont accès à tous les sites
  if (userRole === 'super_admin' || userRole === 'admin') {
    return true;
  }

  // Operator: vérifier l'assignation au site
  if (userRole === 'operator') {
    const result = await query(
      `SELECT 1 FROM user_site_assignments WHERE user_id = $1 AND site_id = $2`,
      [userId, siteId]
    );
    return result.rows.length > 0;
  }

  // Autres rôles n'ont pas accès
  return false;
}

/**
 * GET /api/remote/:siteId/state
 * Récupère l'état actuel du site (vidéo en cours, phase, score, config)
 */
export async function getRemoteState(req: AuthRequest, res: Response) {
  try {
    const { siteId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Vérifier l'accès au site
    const hasAccess = await verifyUserAccessToSite(userId, userRole, siteId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Accès non autorisé à ce site' });
    }

    // Récupérer les infos du site
    const siteResult = await query(
      `SELECT id, site_name, club_name, status, local_config_mirror, last_seen_at
       FROM sites WHERE id = $1`,
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const site = siteResult.rows[0];
    const localConfig = site.local_config_mirror || {};

    // Vérifier si le site est connecté
    const isConnected = socketService.isConnected(siteId);
    const connectionHealth = socketService.getConnectionHealth(siteId);

    res.json({
      siteId,
      siteName: site.site_name,
      clubName: site.club_name,
      status: site.status,
      isConnected,
      connectionHealth,
      lastSeenAt: site.last_seen_at,
      // Configuration locale (miroir)
      config: {
        sponsors: localConfig.sponsors || [],
        categories: localConfig.categories || [],
        timeCategories: localConfig.timeCategories || [],
        liveScoreEnabled: localConfig.liveScoreEnabled ?? false,
        scoreOverlay: localConfig.scoreOverlay || null,
        watermark: localConfig.watermark || null,
      },
      // Vidéos locales
      localVideos: localConfig._localVideos || [],
    });
  } catch (error) {
    logger.error('Error getting remote state:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/remote/:siteId/command
 * Envoie une commande au site (score, phase, vidéo, etc.)
 */
export async function sendRemoteCommand(req: AuthRequest, res: Response) {
  try {
    const { siteId } = req.params;
    const { type, data } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Vérifier l'accès au site
    const hasAccess = await verifyUserAccessToSite(userId, userRole, siteId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Accès non autorisé à ce site' });
    }

    // Valider le type de commande
    const validCommands = [
      'score-update',
      'score-reset',
      'phase-change',
      'play-video',
      'play-sponsors',
      'timer-update',
      'breaking-news',
      'match-config',
    ];

    if (!validCommands.includes(type)) {
      return res.status(400).json({ error: `Type de commande invalide: ${type}` });
    }

    // Vérifier si le site est connecté
    const isConnected = socketService.isConnected(siteId);
    if (!isConnected) {
      return res.status(503).json({
        error: 'Site non connecté',
        message: 'Le site n\'est pas connecté au cloud. Utilisez la télécommande locale (hotspot).',
      });
    }

    // Récupérer l'instance Socket.IO
    const io = socketService.getIO();
    if (!io) {
      return res.status(500).json({ error: 'Service Socket.IO non disponible' });
    }

    // Broadcaster la commande vers le site
    const timestamp = new Date().toISOString();
    let eventName: string;
    let payload: Record<string, unknown>;

    switch (type) {
      case 'score-update':
        eventName = 'score-update';
        payload = {
          homeTeam: data.homeTeam || '',
          awayTeam: data.awayTeam || '',
          homeScore: data.homeScore ?? 0,
          awayScore: data.awayScore ?? 0,
          period: data.period,
          matchTime: data.matchTime,
          timestamp,
        };
        break;

      case 'score-reset':
        eventName = 'score-reset';
        payload = { timestamp };
        break;

      case 'phase-change':
        eventName = 'phase-change';
        payload = {
          phase: data.phase || 'neutral',
          timestamp,
        };
        break;

      case 'play-video':
        eventName = 'command';
        payload = {
          type: 'video',
          data: data.video || null,
          timestamp,
        };
        break;

      case 'play-sponsors':
        eventName = 'command';
        payload = {
          type: 'sponsors',
          timestamp,
        };
        break;

      case 'timer-update':
        eventName = 'timer-update';
        payload = {
          action: data.action, // 'start', 'pause', 'reset', 'sync'
          time: data.time,
          timestamp,
        };
        break;

      case 'breaking-news':
        eventName = 'breaking-news';
        payload = {
          message: data.message || '',
          duration: data.duration || 10000,
          position: data.position || 'bottom',
          timestamp,
        };
        break;

      case 'match-config':
        eventName = 'match-info-updated';
        payload = {
          sessionId: data.sessionId,
          matchDate: data.matchDate,
          matchName: data.matchName,
          audienceEstimate: data.audienceEstimate,
          timestamp,
        };
        break;

      default:
        return res.status(400).json({ error: 'Type de commande non géré' });
    }

    // Envoyer via Socket.IO vers la room du site
    io.to(siteId).emit(eventName, payload);

    logger.info('Cloud remote command sent', {
      siteId,
      userId,
      commandType: type,
      eventName,
    });

    // Audit (fire and forget)
    auditService.log({
      userId,
      action: 'CLOUD_REMOTE_COMMAND',
      resourceType: 'site',
      resourceId: siteId,
      details: { commandType: type, eventName },
    }).catch(() => { /* ignore */ });

    res.json({
      success: true,
      message: 'Commande envoyée',
      commandType: type,
      timestamp,
    });
  } catch (error) {
    logger.error('Error sending remote command:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/remote/:siteId/videos
 * Liste les vidéos disponibles sur le site (pour la télécommande cloud)
 */
export async function getRemoteVideos(req: AuthRequest, res: Response) {
  try {
    const { siteId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Vérifier l'accès au site
    const hasAccess = await verifyUserAccessToSite(userId, userRole, siteId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Accès non autorisé à ce site' });
    }

    // Récupérer les vidéos locales depuis le miroir de config
    const siteResult = await query(
      `SELECT local_config_mirror FROM sites WHERE id = $1`,
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const localConfig = siteResult.rows[0].local_config_mirror || {};
    const localVideos = localConfig._localVideos || [];
    const categories = localConfig.categories || [];

    // Organiser les vidéos par catégorie
    const videosByCategory: Record<string, Array<{
      filename: string;
      path: string;
      category: string;
      subcategory: string | null;
      size: number;
      duration: number | null;
    }>> = {};

    for (const video of localVideos) {
      const cat = video.category || 'AUTRES';
      if (!videosByCategory[cat]) {
        videosByCategory[cat] = [];
      }
      videosByCategory[cat].push({
        filename: video.filename,
        path: video.path,
        category: video.category,
        subcategory: video.subcategory,
        size: video.size,
        duration: video.duration,
      });
    }

    res.json({
      categories,
      videosByCategory,
      totalVideos: localVideos.length,
    });
  } catch (error) {
    logger.error('Error getting remote videos:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}
