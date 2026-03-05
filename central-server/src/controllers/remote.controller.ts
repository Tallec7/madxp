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
import { videoVariantRepository } from '../repositories/video-variant.repository';
import socketService from '../services/socket.service';
import { commandQueueService } from '../services/command-queue.service';
import logger from '../config/logger';
import metricsService from '../services/metrics.service';
import { generateRemotePinToken } from '../middleware/remote-pin.middleware';
import { LicenseStatusResponse, SiteSubscriptionInfo, SubscriptionPlan, SuspensionReason } from '../types';

// Lazy import to avoid circular dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let subscriptionService: { computeLicenseStatus: (site: SiteSubscriptionInfo) => Promise<LicenseStatusResponse> } | null = null;
const getSubscriptionService = async () => {
  if (!subscriptionService) {
    const module = await import('../services/subscription.service');
    subscriptionService = module.subscriptionService;
  }
  return subscriptionService;
};

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

    // Compute license status for the cloud remote
    let licenseStatus: LicenseStatusResponse | null = null;
    try {
      const subService = await getSubscriptionService();
      licenseStatus = await subService.computeLicenseStatus({
        id: site.id,
        subscription_start: site.subscription_start ? String(site.subscription_start) : null,
        subscription_end: site.subscription_end ? String(site.subscription_end) : null,
        subscription_plan: (site.subscription_plan as SubscriptionPlan) || 'standard',
        suspended: !!(site.suspended),
        suspension_reason: (site.suspension_reason as SuspensionReason) || null,
        suspension_date: site.suspension_date ? String(site.suspension_date) : null,
        suspension_note: null,
        last_seen_at: site.last_seen_at ? site.last_seen_at.toISOString() : null,
      });
    } catch (error) {
      logger.warn('Error computing license status for remote', { siteId, error });
    }

    // Get recording state (ephemeral, in-memory)
    const recordingState = socketService.getRecordingState(siteId);

    // Pending config and commands info
    const pendingConfigVersionId = (site as Record<string, unknown>).pending_config_version_id || null;
    let pendingCommandsCount = 0;
    try {
      const pendingCommands = await commandQueueService.getPendingCommands(siteId);
      pendingCommandsCount = pendingCommands.length;
    } catch {
      // Non-blocking — pending_commands table may not exist yet
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
      licenseStatus: licenseStatus ? {
        status: licenseStatus.status,
        reason: licenseStatus.reason || null,
        daysLeft: licenseStatus.days_left ?? null,
        daysExpired: licenseStatus.days_expired ?? null,
        messageRemote: licenseStatus.message_remote || null,
        subscriptionEnd: licenseStatus.subscription_end || null,
        subscriptionPlan: licenseStatus.subscription_plan || null,
        canAutoUnblock: licenseStatus.can_auto_unblock ?? false,
        needsConnection: (licenseStatus.days_since_check ?? 0) > 10,
        daysSinceCheck: licenseStatus.days_since_check ?? null,
      } : null,
      recordingState: recordingState || { isRecording: false, isManualOverride: false },
      playerState: socketService.getPlayerState(siteId) || null,
      pendingConfigVersionId,
      pendingCommandsCount,
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

      // Secondary display: always enrich variants (Pi detects dual-display by hardware)
      response.secondaryDisplayEnabled = true; // compat cloud-remote
      try {
        // Build videoId → path map from _localVideos, then resolve secondary variants
        const localVideos = (localConfig._localVideos as Array<{ videoId?: string; path?: string }>) || [];
        const videoIdToPath = new Map<string, string>();
        for (const v of localVideos) {
          if (v.videoId && v.path) {
            videoIdToPath.set(v.videoId, v.path);
          }
        }
        const videoIds = [...videoIdToPath.keys()];
        if (videoIds.length > 0) {
          const secondaryVariants = await videoVariantRepository.findSecondaryVariantsForVideos(videoIds);
          // Return paths (used by the cloud remote) instead of video IDs
          response.secondaryVariantPaths = secondaryVariants
            .map(v => videoIdToPath.get(v.video_id))
            .filter((p): p is string => !!p);
        } else {
          response.secondaryVariantPaths = [];
        }
      } catch {
        // Non-blocking: if variant table doesn't exist yet
        response.secondaryVariantPaths = [];
      }
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
      'recording-toggle',
      'screenshot',
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

    // Vérifier que le socket est bien dans la room (détection connexion zombie)
    const room = io.sockets.adapter.rooms.get(siteId);
    if (!room || room.size === 0) {
      logger.warn('Cloud remote: zombie connection detected (in map but not in room)', {
        siteId,
        commandType: type,
        ip: req.ip,
      });
      metricsService.recordCommand(type, 'zombie');
      return res.status(503).json({
        error: 'Connexion instable',
        message: 'Le boîtier semble connecté mais ne reçoit plus les commandes. Il devrait se reconnecter automatiquement sous 30 secondes.',
      });
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

      case 'recording-toggle':
        eventName = 'recording-toggle';
        payload = { timestamp };
        break;

      case 'screenshot': {
        // Screenshot uses request-response HTTP pattern (v3.58+):
        // The controller waits for the Pi's screenshot-data response via Socket.IO,
        // then returns the image directly in the HTTP response.
        // This replaces the previous Socket.IO room relay which silently dropped
        // large base64 payloads (~60 KB) when the dashboard used polling transport.
        const piSocket = socketService.getConnectedSocket(siteId);
        if (!piSocket) {
          return res.status(503).json({ error: 'Socket du Pi non trouvé' });
        }

        const screenshotStart = Date.now();
        const screenshotTimeout = 8000; // 8s (before dashboard's 10s UI timeout)
        const screenshotData = await new Promise<Record<string, unknown> | null>((resolve) => {
          const timer = setTimeout(() => {
            piSocket.off('screenshot-data', handler);
            resolve(null);
          }, screenshotTimeout);

          const handler = (responseData: unknown) => {
            clearTimeout(timer);
            piSocket.off('screenshot-data', handler);
            resolve(responseData as Record<string, unknown>);
          };

          piSocket.on('screenshot-data', handler);
          io.to(siteId).emit('screenshot-request', { timestamp, quality: data?.quality || 0.5 });
        });

        const durationSeconds = (Date.now() - screenshotStart) / 1000;
        metricsService.recordCommand('screenshot', 'sent');
        metricsService.recordCommandLatency('screenshot', durationSeconds);
        logger.info('Cloud remote command sent', { siteId, commandType: type, eventName: 'screenshot-request', ip: req.ip });

        if (!screenshotData) {
          metricsService.recordCommand('screenshot', 'timeout');
          logger.warn('Screenshot timeout', { siteId, durationSeconds });
          return res.status(504).json({ error: 'timeout', message: 'Le Pi n\'a pas répondu (8s)' });
        }

        if (screenshotData.error) {
          metricsService.recordCommand('screenshot', 'pi_error');
          logger.warn('Screenshot Pi error', { siteId, error: screenshotData.error, durationSeconds });
          return res.status(502).json({ error: screenshotData.error, message: 'Erreur capture sur le Pi' });
        }

        const imageSize = typeof screenshotData.image === 'string' ? (screenshotData.image as string).length : 0;
        metricsService.recordCommand('screenshot', 'received');
        logger.info('Screenshot captured successfully', { siteId, durationSeconds, imageSize });
        return res.json({
          success: true,
          commandType: type,
          image: screenshotData.image,
          timestamp: screenshotData.timestamp,
          currentVideo: screenshotData.currentVideo,
          phase: screenshotData.phase,
          isManualMode: screenshotData.isManualMode,
        });
      }

      default:
        return res.status(400).json({ error: 'Type de commande non géré' });
    }

    io.to(siteId).emit(eventName, payload);
    metricsService.recordCommand(type, 'sent');

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
    metricsService.recordCommand(req.body?.type || 'unknown', 'error');
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
