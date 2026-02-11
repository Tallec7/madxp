/**
 * Remote Cloud Controller
 *
 * Permet de contrôler un site Neopro à distance via le cloud.
 * Utile pour les réseaux avec isolation client (mesh WiFi, entreprise).
 *
 * Les commandes sont relayées via Socket.IO vers le Pi connecté.
 *
 * Sécurité:
 * - UUID du site (128 bits d'entropie, difficile à deviner)
 * - Rate limiting (60 req/min par IP)
 * - PIN optionnel par site (4-6 chiffres, stocké en SHA-256)
 * - JWT token pour les sessions PIN (24h)
 */

import { Request, Response } from 'express';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { siteRepository } from '../repositories';
import socketService from '../services/socket.service';
import logger from '../config/logger';
import { generateRemotePinToken } from '../middleware/remote-pin.middleware';

// Compteur brute-force en mémoire (par IP + siteId)
const pinAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_WINDOW = 10 * 60 * 1000; // 10 minutes

// Nettoyage périodique du compteur
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pinAttempts.entries()) {
    if (now - value.lastAttempt > PIN_LOCKOUT_WINDOW) {
      pinAttempts.delete(key);
    }
  }
}, 60 * 1000); // Toutes les minutes

/**
 * GET /api/remote/:siteId/state
 * Récupère l'état actuel du site (vidéo en cours, phase, score, config)
 *
 * Si un PIN est configuré, retourne uniquement les infos de base
 * (pas de config ni vidéos) sauf si un token valide est fourni.
 */
export async function getRemoteState(req: Request, res: Response) {
  try {
    const { siteId } = req.params;

    const site = await siteRepository.findById(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const localConfig = (site.local_config_mirror || {}) as Record<string, unknown>;
    const isConnected = socketService.isConnected(siteId);
    const connectionHealth = socketService.getConnectionHealth(siteId);

    // Vérifier si un PIN est configuré
    const pinRequired = !!site.remote_pin_hash;

    // Si PIN requis, vérifier le token
    let pinVerified = false;
    if (pinRequired) {
      const token = req.headers['x-remote-token'] as string;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { siteId: string; type: string };
          pinVerified = decoded.type === 'remote-pin' && decoded.siteId === siteId;
        } catch {
          // Token invalide ou expiré — pinVerified reste false
        }
      }
    }

    // Réponse de base (toujours retournée)
    const response: Record<string, unknown> = {
      siteId,
      siteName: site.site_name,
      clubName: site.club_name,
      status: site.status,
      isConnected,
      connectionHealth,
      lastSeenAt: site.last_seen_at,
      pinRequired,
    };

    // Si pas de PIN ou PIN vérifié → retourner la config complète
    if (!pinRequired || pinVerified) {
      response.config = {
        sponsors: (localConfig.sponsors as unknown[]) || [],
        categories: (localConfig.categories as unknown[]) || [],
        timeCategories: (localConfig.timeCategories as unknown[]) || [],
        liveScoreEnabled: (localConfig.liveScoreEnabled as boolean) ?? false,
        scoreOverlay: localConfig.scoreOverlay || null,
        watermark: localConfig.watermark || null,
      };
      response.localVideos = (localConfig._localVideos as unknown[]) || [];
    }

    res.json(response);
  } catch (error) {
    logger.error('Error getting remote state:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/remote/:siteId/verify-pin
 * Vérifie le PIN et retourne un JWT token pour les requêtes suivantes.
 *
 * Protection brute-force: max 5 tentatives par IP+site en 10 minutes.
 */
export async function verifyPin(req: Request, res: Response) {
  try {
    const { siteId } = req.params;
    const { pin } = req.body;

    // Vérifier le rate limiting brute-force
    const attemptKey = `${req.ip}:${siteId}`;
    const attempts = pinAttempts.get(attemptKey);

    if (attempts && attempts.count >= MAX_PIN_ATTEMPTS) {
      const elapsed = Date.now() - attempts.lastAttempt;
      if (elapsed < PIN_LOCKOUT_WINDOW) {
        const retryAfter = Math.ceil((PIN_LOCKOUT_WINDOW - elapsed) / 1000);
        logger.warn('Remote PIN brute-force lockout', {
          siteId,
          ip: req.ip,
          attempts: attempts.count,
          retryAfter,
        });
        res.status(429).json({
          error: 'Trop de tentatives',
          message: `Trop de tentatives échouées. Réessayez dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          retryAfter,
        });
        return;
      }
      // Lockout expiré, reset
      pinAttempts.delete(attemptKey);
    }

    // Récupérer le hash du PIN
    const site = await siteRepository.findById(siteId);

    if (!site) {
      res.status(404).json({ error: 'Site non trouvé' });
      return;
    }

    if (!site.remote_pin_hash) {
      res.status(400).json({ error: 'Aucun PIN configuré pour ce site' });
      return;
    }

    // Vérifier le PIN
    const pinHash = createHash('sha256').update(pin).digest('hex');

    if (pinHash !== site.remote_pin_hash) {
      // Incrémenter le compteur
      const current = pinAttempts.get(attemptKey) || { count: 0, lastAttempt: 0 };
      current.count += 1;
      current.lastAttempt = Date.now();
      pinAttempts.set(attemptKey, current);

      logger.warn('Remote PIN verification failed', {
        siteId,
        ip: req.ip,
        attempts: current.count,
      });

      res.status(401).json({
        error: 'PIN incorrect',
        message: 'Le PIN saisi est incorrect.',
        attemptsRemaining: Math.max(0, MAX_PIN_ATTEMPTS - current.count),
      });
      return;
    }

    // PIN correct → générer le token
    pinAttempts.delete(attemptKey); // Reset le compteur

    const token = generateRemotePinToken(siteId);

    logger.info('Remote PIN verified successfully', {
      siteId,
      ip: req.ip,
    });

    res.json({
      success: true,
      token,
      expiresIn: 24 * 60 * 60, // 24h en secondes
    });
  } catch (error) {
    logger.error('Error verifying remote PIN:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/remote/:siteId/command
 * Envoie une commande au site (score, phase, vidéo, etc.)
 *
 * Protégé par le middleware verifyRemotePin si un PIN est configuré.
 */
export async function sendRemoteCommand(req: Request, res: Response) {
  try {
    const { siteId } = req.params;
    const { type, data } = req.body;

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

    const isConnected = socketService.isConnected(siteId);
    if (!isConnected) {
      return res.status(503).json({
        error: 'Site non connecté',
        message: 'Le site n\'est pas connecté au cloud. Utilisez la télécommande locale (hotspot).',
      });
    }

    const io = socketService.getIO();
    if (!io) {
      return res.status(500).json({ error: 'Service Socket.IO non disponible' });
    }

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
          action: data.action,
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
 * Protégé par le middleware verifyRemotePin si un PIN est configuré.
 */
export async function getRemoteVideos(req: Request, res: Response) {
  try {
    const { siteId } = req.params;

    const site = await siteRepository.findById(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

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
