/**
 * Remote Cloud Controller
 *
 * Permet de contrôler un site Neopro à distance via le cloud.
 * Utile pour les réseaux avec isolation client (mesh WiFi, entreprise).
 *
 * Les commandes sont relayées via Socket.IO vers le Pi connecté.
 *
 * IMPORTANT: Ces endpoints sont PUBLICS (pas d'authentification JWT requise)
 * car ils sont utilisés par les utilisateurs qui scannent le QR code
 * depuis leur téléphone (staff du club, bénévoles, etc.)
 *
 * La sécurité repose sur:
 * - L'UUID du site (128 bits d'entropie, difficile à deviner)
 * - Le rate limiting (30 req/min par IP)
 * - Le fait que le site doit être online pour recevoir les commandes
 *
 * Date: 2026-01-18
 */

import { Request, Response } from 'express';
import { siteRepository } from '../repositories';
import socketService from '../services/socket.service';
import logger from '../config/logger';

/**
 * GET /api/remote/:siteId/state
 * Récupère l'état actuel du site (vidéo en cours, phase, score, config)
 *
 * PUBLIC: Pas d'authentification requise (accès via QR code)
 */
export async function getRemoteState(req: Request, res: Response) {
  try {
    const { siteId } = req.params;

    // Récupérer les infos du site
    const site = await siteRepository.findById(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Cast localConfig pour accéder aux propriétés (type JSONB en DB)
    const localConfig = (site.local_config_mirror || {}) as Record<string, unknown>;

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
        sponsors: (localConfig.sponsors as unknown[]) || [],
        categories: (localConfig.categories as unknown[]) || [],
        timeCategories: (localConfig.timeCategories as unknown[]) || [],
        liveScoreEnabled: (localConfig.liveScoreEnabled as boolean) ?? false,
        scoreOverlay: localConfig.scoreOverlay || null,
        watermark: localConfig.watermark || null,
      },
      // Vidéos locales
      localVideos: (localConfig._localVideos as unknown[]) || [],
    });
  } catch (error) {
    logger.error('Error getting remote state:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/remote/:siteId/command
 * Envoie une commande au site (score, phase, vidéo, etc.)
 *
 * PUBLIC: Pas d'authentification requise (accès via QR code)
 */
export async function sendRemoteCommand(req: Request, res: Response) {
  try {
    const { siteId } = req.params;
    const { type, data } = req.body;

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
        eventName = 'cloud-remote-action';
        payload = {
          type: 'video',
          data: data.video || null,
          timestamp,
        };
        break;

      case 'play-sponsors':
        eventName = 'cloud-remote-action';
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
      commandType: type,
      eventName,
      ip: req.ip,
    });

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
 *
 * PUBLIC: Pas d'authentification requise (accès via QR code)
 */
export async function getRemoteVideos(req: Request, res: Response) {
  try {
    const { siteId } = req.params;

    // Récupérer les vidéos locales depuis le miroir de config
    const site = await siteRepository.findById(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Cast localConfig pour accéder aux propriétés (type JSONB en DB)
    const localConfig = (site.local_config_mirror || {}) as Record<string, unknown>;
    const localVideos = (localConfig._localVideos as Array<{
      filename: string;
      path: string;
      category: string;
      subcategory: string | null;
      size: number;
      duration: number | null;
    }>) || [];
    const categories = (localConfig.categories as unknown[]) || [];

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
