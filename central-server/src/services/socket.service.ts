import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import jwt, { Secret } from 'jsonwebtoken';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { query } from '../config/database';
import { SocketData, CommandMessage, CommandResult, HeartbeatMessage } from '../types';
import logger from '../config/logger';
import { alertService } from './alert.service';
import { handleMatchConfig } from '../handlers/match-config.handler';
import { handleScoreUpdate, handleScoreReset } from '../handlers/score-update.handler';

// Import différé pour éviter les dépendances circulaires
let deploymentService: { processPendingDeploymentsForSite: (siteId: string) => Promise<void> } | null = null;
const getDeploymentService = async () => {
  if (!deploymentService) {
    const module = await import('./deployment.service');
    deploymentService = module.default;
  }
  return deploymentService;
};

let updateDeploymentService: { processPendingDeploymentsForSite: (siteId: string) => Promise<void>; handleDeploymentResult: (deploymentId: string, siteId: string, success: boolean, errorMessage?: string) => Promise<void>; updateProgress: (deploymentId: string, progress: number) => Promise<void> } | null = null;
const getUpdateDeploymentService = async () => {
  if (!updateDeploymentService) {
    const module = await import('./update-deployment.service');
    updateDeploymentService = module.default;
  }
  return updateDeploymentService;
};

let commandQueueService: { processPendingCommands: (siteId: string) => Promise<{ processed: number; failed: number; remaining: number }> } | null = null;
const getCommandQueueService = async () => {
  if (!commandQueueService) {
    const module = await import('./command-queue.service');
    commandQueueService = module.commandQueueService;
  }
  return commandQueueService;
};

/**
 * Hash une API key avec SHA256 (déterministe)
 */
const hashApiKey = (apiKey: string): string => {
  return createHash('sha256').update(apiKey).digest('hex');
};

/**
 * Vérifie une API key contre son hash SHA256
 * Utilise une comparaison timing-safe pour éviter les timing attacks
 */
const verifyApiKey = (providedKey: string, storedHash: string): boolean => {
  try {
    const providedHash = hashApiKey(providedKey);
    // Comparaison simple car SHA256 est déterministe
    // L'API key a 256 bits d'entropie donc timing attacks sont impraticables
    return providedHash === storedHash;
  } catch {
    return false;
  }
};

/**
 * Vérifie un JWT token et retourne le payload décodé
 */
const verifyJwtToken = (token: string): { id: string; email: string; role: string } | null => {
  try {
    const JWT_SECRET: Secret = process.env.JWT_SECRET || '';
    if (!JWT_SECRET) {
      logger.error('JWT_SECRET not configured');
      return null;
    }
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
    return decoded;
  } catch (error) {
    logger.error('JWT verification failed:', { error });
    return null;
  }
};

// Configuration des timeouts par type de commande (en ms)
const COMMAND_TIMEOUTS: Record<string, number> = {
  deploy_video: 10 * 60 * 1000,      // 10 minutes pour les gros fichiers
  update_config: 30 * 1000,           // 30 secondes
  update_software: 15 * 60 * 1000,    // 15 minutes pour les mises à jour
  reboot: 60 * 1000,                  // 1 minute
  restart_service: 60 * 1000,         // 1 minute
  get_logs: 30 * 1000,                // 30 secondes
  get_system_info: 15 * 1000,         // 15 secondes
  get_config: 15 * 1000,              // 15 secondes
  update_hotspot: 60 * 1000,          // 1 minute
  get_hotspot_config: 15 * 1000,      // 15 secondes
  network_diagnostics: 30 * 1000,     // 30 secondes pour les tests réseau
  default: 2 * 60 * 1000,             // 2 minutes par défaut
};

// Memory safety limits (reduced for Railway Hobby plan)
const MAX_PENDING_COMMANDS = 100; // Maximum pending commands in memory (was 500)
const MAX_PONG_ENTRIES = 50;      // Maximum pong tracking entries (was 200)

// DB/WebSocket sync interval and stale threshold
const DB_SYNC_INTERVAL_MS = 60000; // Sync DB status with WebSocket state every 60s
const STALE_ONLINE_THRESHOLD_MS = 90000; // Consider DB 'online' stale if last_seen_at > 90s ago

type ConfigCommandData = {
  configVersionId?: string;
} & Record<string, unknown>;

interface PendingCommand {
  commandId: string;
  siteId: string;
  type: string;
  sentAt: number;
  timeoutMs: number;
}

class SocketService {
  private io: SocketIOServer | null = null;
  private connectedSites: Map<string, Socket> = new Map();
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private timeoutCheckInterval: NodeJS.Timeout | null = null;
  private connectionHealthCheckInterval: NodeJS.Timeout | null = null;
  private dbSyncInterval: NodeJS.Timeout | null = null;
  private redisClient: RedisClientType | null = null;
  private redisSub: RedisClientType | null = null;
  // Track last pong received for each site to detect zombie connections
  private lastPongReceived: Map<string, number> = new Map();

  async initialize(httpServer: HTTPServer) {
    // Normalize origins like the HTTP middleware does
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ?.split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean);

    const isProduction = process.env.NODE_ENV === 'production';
    const hasAllowedOrigins = allowedOrigins && allowedOrigins.length > 0;

    // SECURITY: Fail-closed in production - reject all origins if ALLOWED_ORIGINS not configured
    if (isProduction && !hasAllowedOrigins) {
      logger.error('='.repeat(80));
      logger.error('SECURITY WARNING: Socket.IO CORS - ALLOWED_ORIGINS not configured in production!');
      logger.error('WebSocket connections from browsers will be REJECTED.');
      logger.error('Please set ALLOWED_ORIGINS environment variable (comma-separated list).');
      logger.error('='.repeat(80));
    }

    // In production without ALLOWED_ORIGINS, use false to reject all cross-origin requests
    // In development, allow all origins for easier testing
    const corsOrigin = hasAllowedOrigins
      ? allowedOrigins
      : isProduction
        ? false  // Reject all cross-origin in production
        : true;  // Allow all in development

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
        credentials: hasAllowedOrigins,
      },
      transports: ['websocket', 'polling'],
      // Configuration du ping/pong natif de Socket.IO pour détection des connexions mortes
      pingInterval: 25000,  // Envoyer un ping toutes les 25 secondes
      pingTimeout: 60000,   // Considérer déconnecté si pas de pong après 60 secondes
    });

    logger.info('Socket.IO CORS configuration', {
      isProduction,
      hasAllowedOrigins,
      allowedOrigins: hasAllowedOrigins ? allowedOrigins : 'none',
      corsMode: hasAllowedOrigins ? 'whitelist' : isProduction ? 'reject-all' : 'allow-all',
    });

    // Configuration Redis pour scalabilité horizontale
    await this.setupRedisAdapter();

    this.io.on('connection', this.handleConnection.bind(this));

    // Démarrer la vérification périodique des timeouts de commandes
    this.startCommandTimeoutChecker();

    // Démarrer la vérification de santé des connexions (ping/pong)
    this.startConnectionHealthCheck();

    // Démarrer la synchronisation DB/WebSocket pour corriger les status incohérents
    this.startDbStatusSync();

    logger.info('Socket.IO service initialized');
  }

  /**
   * Configure l'adapter Redis pour Socket.IO
   * Permet le scaling horizontal en partageant l'état des sockets entre instances
   */
  private async setupRedisAdapter(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      logger.warn('REDIS_URL not configured - Socket.IO running in single-instance mode');
      logger.warn('For horizontal scaling, set REDIS_URL environment variable');
      return;
    }

    try {
      // Créer les clients pub/sub pour Redis
      this.redisClient = createClient({ url: redisUrl });
      this.redisSub = this.redisClient.duplicate();

      // Gérer les erreurs de connexion
      this.redisClient.on('error', (err: Error) => {
        logger.error('Redis pub client error:', err);
      });
      this.redisSub.on('error', (err: Error) => {
        logger.error('Redis sub client error:', err);
      });

      // Connecter les clients
      await Promise.all([
        this.redisClient.connect(),
        this.redisSub.connect(),
      ]);

      // Configurer l'adapter Redis
      if (this.io) {
        this.io.adapter(createAdapter(this.redisClient, this.redisSub));
      }

      logger.info('Socket.IO Redis adapter configured for horizontal scaling', {
        redisUrl: redisUrl.replace(/\/\/.*@/, '//***@'), // Masquer les credentials
      });
    } catch (error) {
      logger.error('Failed to setup Redis adapter:', error);
      logger.warn('Falling back to single-instance mode');

      // Nettoyer en cas d'erreur
      if (this.redisClient) {
        try { await this.redisClient.quit(); } catch { /* ignore */ }
        this.redisClient = null;
      }
      if (this.redisSub) {
        try { await this.redisSub.quit(); } catch { /* ignore */ }
        this.redisSub = null;
      }
    }
  }

  /**
   * Démarre la vérification périodique des commandes en timeout
   */
  private startCommandTimeoutChecker() {
    // Vérifier toutes les 10 secondes
    this.timeoutCheckInterval = setInterval(() => {
      this.checkCommandTimeouts();
    }, 10000);
  }

  /**
   * Vérifie les commandes en attente qui ont dépassé leur timeout
   * Also enforces memory limits on pendingCommands Map
   */
  private async checkCommandTimeouts() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [commandId, pending] of this.pendingCommands.entries()) {
      const elapsed = now - pending.sentAt;

      if (elapsed >= pending.timeoutMs) {
        logger.warn('Command timeout reached', {
          commandId,
          siteId: pending.siteId,
          type: pending.type,
          timeoutMs: pending.timeoutMs,
          elapsedMs: elapsed,
        });

        // Marquer comme failed dans la base de données
        try {
          await query(
            `UPDATE remote_commands
             SET status = 'failed', error_message = $1, completed_at = NOW()
             WHERE id = $2 AND status IN ('pending', 'executing')`,
            [`Command timeout after ${Math.round(elapsed / 1000)}s`, commandId]
          );

          // Émettre un événement de timeout au dashboard
          if (this.io) {
            this.io.to('dashboard').emit('command_timeout', {
              siteId: pending.siteId,
              commandId,
              type: pending.type,
            });
          }
        } catch (error) {
          logger.error('Error marking command as timed out:', { commandId, error });
        }

        // Retirer de la liste des commandes en attente
        this.pendingCommands.delete(commandId);
        cleanedCount++;
      }
    }

    // Memory safety: if Map is still too large, remove oldest entries
    if (this.pendingCommands.size > MAX_PENDING_COMMANDS) {
      const entries = Array.from(this.pendingCommands.entries())
        .sort((a, b) => a[1].sentAt - b[1].sentAt); // Sort by oldest first

      const toRemove = entries.slice(0, this.pendingCommands.size - MAX_PENDING_COMMANDS);
      for (const [commandId, pending] of toRemove) {
        logger.warn('Removing old pending command due to memory limit', {
          commandId,
          siteId: pending.siteId,
          type: pending.type,
          ageMs: now - pending.sentAt,
        });
        this.pendingCommands.delete(commandId);
        cleanedCount++;

        // Mark as failed in DB
        query(
          `UPDATE remote_commands
           SET status = 'failed', error_message = 'Evicted from memory due to queue overflow', completed_at = NOW()
           WHERE id = $1 AND status IN ('pending', 'executing')`,
          [commandId]
        ).catch((err) => logger.error('Error marking evicted command as failed:', err));
      }
    }

    if (cleanedCount > 0) {
      logger.info('Command timeout check completed', {
        cleanedCount,
        remainingPendingCommands: this.pendingCommands.size,
      });
    }
  }

  /**
   * Démarre la vérification périodique de santé des connexions
   * Envoie des pings aux sites connectés et détecte les connexions zombies
   */
  private startConnectionHealthCheck() {
    // Vérifier toutes les 30 secondes (aligné avec le heartbeat)
    this.connectionHealthCheckInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, 30000);
  }

  /**
   * Vérifie la santé des connexions et supprime les connexions zombies
   */
  private checkConnectionHealth() {
    const now = Date.now();
    const staleThresholdMs = 60000; // 60 secondes sans pong = connexion zombie (réduit de 90s)

    for (const [siteId, socket] of this.connectedSites.entries()) {
      const lastPong = this.lastPongReceived.get(siteId);

      // Si on n'a jamais reçu de pong, initialiser
      if (!lastPong) {
        this.lastPongReceived.set(siteId, now);
      } else if (now - lastPong > staleThresholdMs) {
        // Connexion zombie détectée - le client ne répond plus aux pongs
        logger.warn('Zombie connection detected, forcing disconnect', {
          siteId,
          lastPongAgo: Math.round((now - lastPong) / 1000),
          staleThresholdMs,
        });

        // Forcer la déconnexion pour nettoyer l'état
        socket.disconnect(true);
        this.connectedSites.delete(siteId);
        this.lastPongReceived.delete(siteId);

        // Mettre à jour le statut en base
        query(
          'UPDATE sites SET status = $1, last_seen_at = NOW() WHERE id = $2',
          ['offline', siteId]
        ).catch((error) => {
          logger.error('Error updating site status on zombie disconnect:', error);
        });
      } else {
        // Envoyer un ping au site pour maintenir la connexion et détecter les zombies
        socket.emit('ping_check', { timestamp: now });
      }
    }
  }

  /**
   * Démarre la synchronisation périodique entre le status DB et l'état WebSocket
   * Corrige les sites qui sont marqués 'online' en DB mais ne sont plus connectés via WebSocket
   */
  private startDbStatusSync() {
    // Synchroniser toutes les 60 secondes
    this.dbSyncInterval = setInterval(() => {
      this.syncDbWithWebSocketState();
    }, DB_SYNC_INTERVAL_MS);
  }

  /**
   * Synchronise le status DB avec l'état réel des connexions WebSocket
   * Marque 'offline' les sites qui sont 'online' en DB mais pas dans connectedSites
   */
  private async syncDbWithWebSocketState() {
    try {
      const now = Date.now();

      // Récupérer les sites marqués 'online' en DB avec un last_seen_at dépassé
      const result = await query<{ id: string; site_name: string; last_seen_at: Date }>(
        `SELECT id, site_name, last_seen_at
         FROM sites
         WHERE status = 'online'
           AND last_seen_at < NOW() - INTERVAL '${Math.floor(STALE_ONLINE_THRESHOLD_MS / 1000)} seconds'`
      );

      let correctedCount = 0;

      for (const site of result.rows) {
        // Vérifier si le site est vraiment connecté via WebSocket
        if (!this.connectedSites.has(site.id)) {
          // Le site est marqué 'online' en DB mais n'est pas connecté via WebSocket
          // et son last_seen_at est dépassé -> le marquer offline
          const ageMs = now - new Date(site.last_seen_at).getTime();

          logger.warn('DB/WebSocket desync detected - marking site offline', {
            siteId: site.id,
            siteName: site.site_name,
            lastSeenAgoMs: ageMs,
            thresholdMs: STALE_ONLINE_THRESHOLD_MS,
          });

          await query(
            'UPDATE sites SET status = $1 WHERE id = $2',
            ['offline', site.id]
          );

          correctedCount++;
        }
      }

      if (correctedCount > 0) {
        logger.info('DB/WebSocket sync completed', {
          correctedSites: correctedCount,
          connectedSitesCount: this.connectedSites.size,
        });
      }
    } catch (error) {
      logger.error('Error syncing DB with WebSocket state:', error);
    }
  }

  private async handleConnection(socket: Socket) {
    logger.info('New socket connection', { socketId: socket.id });

    // Vérifier si c'est une connexion dashboard (JWT token dans auth)
    const authData = socket.handshake.auth;
    if (authData && authData.token && typeof authData.token === 'string') {
      // Dashboard connection avec JWT
      const decoded = verifyJwtToken(authData.token);
      if (decoded) {
        logger.info('Dashboard user authenticated via JWT', {
          userId: decoded.id,
          email: decoded.email,
          role: decoded.role
        });

        (socket as any).userId = decoded.id;
        (socket as any).userEmail = decoded.email;
        (socket as any).userRole = decoded.role;
        (socket as any).clientType = 'dashboard';

        // Joindre la room "dashboard" pour broadcast global
        socket.join('dashboard');

        socket.emit('authenticated', {
          message: 'Dashboard authentifié avec succès',
          userId: decoded.id,
          role: decoded.role,
        });

        // Pas besoin de timeout pour les dashboards
        socket.on('disconnect', () => {
          logger.info('Dashboard user disconnected', { userId: decoded.id, email: decoded.email });
        });

        return; // Connexion dashboard établie, pas besoin de 'authenticate' event
      } else {
        logger.warn('Invalid JWT token in dashboard connection', { socketId: socket.id });
        socket.emit('auth_error', { message: 'Token JWT invalide' });
        socket.disconnect();
        return;
      }
    }

    // Sinon, c'est une connexion Raspberry Pi (nécessite 'authenticate' event)
    // Timeout d'authentification : déconnecter si pas authentifié dans les 30 secondes
    // Protège contre les connexions fantômes qui consomment des ressources
    const authTimeout = setTimeout(() => {
      if (!(socket as any).siteId && !(socket as any).userId) {
        logger.warn('Authentication timeout, disconnecting socket', { socketId: socket.id });
        socket.disconnect(true);
      }
    }, 30000);

    socket.on('authenticate', async (data: SocketData) => {
      clearTimeout(authTimeout);
      try {
        await this.authenticateAgent(socket, data);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        logger.error('Agent authentication failed:', { error: errorMessage, siteId: data?.siteId });
        socket.emit('auth_error', { message: `Authentification échouée: ${errorMessage}` });
        socket.disconnect();
      }
    });

    socket.on('disconnect', () => {
      clearTimeout(authTimeout);
      this.handleDisconnection(socket);
    });
  }

  private async authenticateAgent(socket: Socket, data: SocketData) {
    const { siteId, apiKey } = data;

    logger.info('Authentication attempt', { siteId, apiKeyLength: apiKey?.length });

    if (!siteId || !apiKey) {
      logger.error('Missing credentials', { hasSiteId: !!siteId, hasApiKey: !!apiKey });
      throw new Error('Identifiants manquants');
    }

    const result = await query(
      'SELECT id, site_name, api_key FROM sites WHERE id = $1',
      [siteId]
    );

    if (result.rows.length === 0) {
      logger.error('Site not found', { siteId });
      throw new Error(`Site non trouvé: ${siteId}`);
    }

    const site = result.rows[0] as { id: string; site_name: string; api_key: string };

    // Vérifier l'API key avec SHA256
    const isValidKey = site.api_key && verifyApiKey(apiKey, site.api_key);
    if (!isValidKey) {
      logger.error('Invalid API key', {
        siteId,
        siteName: site.site_name,
        hasStoredKey: !!site.api_key,
      });
      throw new Error('Clé API invalide');
    }

    (socket as any).siteId = siteId;
    (socket as any).siteName = site.site_name;
    (socket as any).io = this.io; // Pour les handlers live-score qui font du broadcast

    this.connectedSites.set(siteId, socket);

    // Joindre la room du site pour le broadcast (live-score, etc.)
    socket.join(siteId);

    // Extract client IP address
    const clientIp = socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0].trim()
      || socket.handshake.address
      || null;

    await query(
      'UPDATE sites SET status = $1, last_seen_at = NOW(), last_ip = $3 WHERE id = $2',
      ['online', siteId, clientIp]
    );

    socket.emit('authenticated', {
      message: 'Authentification réussie',
      siteId,
    });

    // Create bound handlers for cleanup on disconnect
    const handlers = {
      heartbeat: (message: HeartbeatMessage) => this.handleHeartbeat(siteId, message),
      command_result: (result: CommandResult) => this.handleCommandResult(siteId, result),
      deploy_progress: (progress: any) => this.handleDeployProgress(siteId, progress),
      update_progress: (progress: any) => this.handleUpdateProgress(siteId, progress),
      sync_local_state: (state: any) => this.handleSyncLocalState(siteId, state),
      'match-config': (payload: any) => handleMatchConfig(socket, payload),
      'score-update': (payload: any) => handleScoreUpdate(socket, payload),
      'score-reset': () => handleScoreReset(socket),
      pong_check: () => this.lastPongReceived.set(siteId, Date.now()),
    };

    // Register all handlers
    socket.on('heartbeat', handlers.heartbeat);
    socket.on('command_result', handlers.command_result);
    socket.on('deploy_progress', handlers.deploy_progress);
    socket.on('update_progress', handlers.update_progress);
    socket.on('sync_local_state', handlers.sync_local_state);
    socket.on('match-config', handlers['match-config']);
    socket.on('score-update', handlers['score-update']);
    socket.on('score-reset', handlers['score-reset']);
    socket.on('pong_check', handlers.pong_check);

    // Store handlers reference for cleanup on disconnect
    (socket as any)._neoHandlers = handlers;

    // Initialiser le timestamp de pong à maintenant (connexion fraîche)
    this.lastPongReceived.set(siteId, Date.now());

    // Memory safety: limit lastPongReceived Map size
    if (this.lastPongReceived.size > MAX_PONG_ENTRIES) {
      const oldestSiteId = this.lastPongReceived.keys().next().value;
      if (oldestSiteId && !this.connectedSites.has(oldestSiteId)) {
        this.lastPongReceived.delete(oldestSiteId);
      }
    }

    logger.info('Agent authenticated', { siteId, siteName: site.site_name, clientIp });

    // Traiter les commandes et déploiements en attente pour ce site
    this.processPendingOnReconnect(siteId);
  }

  /**
   * Traite les commandes et déploiements en attente lors de la reconnexion d'un site
   */
  private async processPendingOnReconnect(siteId: string) {
    // Traiter les commandes en file d'attente
    try {
      const queueService = await getCommandQueueService();
      const result = await queueService.processPendingCommands(siteId);
      if (result.processed > 0) {
        logger.info('Pending commands processed on reconnect', {
          siteId,
          processed: result.processed,
          failed: result.failed,
          remaining: result.remaining,
        });
      }
    } catch (error) {
      logger.error('Error processing pending commands on connect:', { siteId, error });
    }

    // Traiter les déploiements de contenu en attente
    try {
      const service = await getDeploymentService();
      await service.processPendingDeploymentsForSite(siteId);
    } catch (error) {
      logger.error('Error processing pending content deployments on connect:', { siteId, error });
    }

    // Traiter les déploiements de mises à jour en attente
    try {
      const updateService = await getUpdateDeploymentService();
      await updateService.processPendingDeploymentsForSite(siteId);
    } catch (error) {
      logger.error('Error processing pending update deployments on connect:', { siteId, error });
    }
  }

  private handleDisconnection(socket: Socket) {
    const siteId = (socket as any).siteId;

    // Explicitly remove all registered handlers to prevent memory leaks
    const handlers = (socket as any)._neoHandlers;
    if (handlers) {
      socket.off('heartbeat', handlers.heartbeat);
      socket.off('command_result', handlers.command_result);
      socket.off('deploy_progress', handlers.deploy_progress);
      socket.off('update_progress', handlers.update_progress);
      socket.off('sync_local_state', handlers.sync_local_state);
      socket.off('match-config', handlers['match-config']);
      socket.off('score-update', handlers['score-update']);
      socket.off('score-reset', handlers['score-reset']);
      socket.off('pong_check', handlers.pong_check);
      delete (socket as any)._neoHandlers;
    }

    // Clean up any pending commands for this site if it disconnects unexpectedly
    if (siteId) {
      for (const [commandId, pending] of this.pendingCommands.entries()) {
        if (pending.siteId === siteId) {
          logger.warn('Cleaning up pending command for disconnected site', {
            commandId,
            siteId,
            type: pending.type,
          });
          this.pendingCommands.delete(commandId);

          // Mark as failed in DB (fire and forget)
          query(
            `UPDATE remote_commands
             SET status = 'failed', error_message = 'Site disconnected', completed_at = NOW()
             WHERE id = $1 AND status IN ('pending', 'executing')`,
            [commandId]
          ).catch((err) => logger.error('Error marking command as failed on disconnect:', err));
        }
      }
    }

    if (siteId) {
      const siteName = (socket as any).siteName || siteId;
      this.connectedSites.delete(siteId);
      this.lastPongReceived.delete(siteId);

      query(
        'UPDATE sites SET status = $1, last_seen_at = NOW() WHERE id = $2',
        ['offline', siteId]
      ).catch((error) => {
        logger.error('Error updating site status on disconnect:', error);
      });

      // Send Slack alert for site going offline
      alertService.siteOffline(siteId, siteName).catch((error) => {
        logger.error('Error sending offline alert:', error);
      });

      logger.info('Agent disconnected', { siteId });
    }

    logger.info('Socket disconnected', { socketId: socket.id });
  }

  private async handleHeartbeat(siteId: string, message: HeartbeatMessage) {
    try {
      // Le heartbeat prouve que la connexion est vivante - mettre à jour lastPongReceived
      this.lastPongReceived.set(siteId, Date.now());

      await query(
        `INSERT INTO metrics (site_id, cpu_usage, memory_usage, temperature, disk_usage, uptime, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          siteId,
          message.metrics.cpu,
          message.metrics.memory,
          message.metrics.temperature,
          message.metrics.disk,
          Math.floor(message.metrics.uptime),
        ]
      );

      // Update site status, local IP and version if provided
      const localIp = message.metrics.localIp || null;
      const softwareVersion =
        message.softwareVersion ||
        message.versionInfo?.version ||
        null;

      if (localIp) {
        await query(
          'UPDATE sites SET last_seen_at = NOW(), status = $1, local_ip = $3 WHERE id = $2',
          ['online', siteId, localIp]
        );
      } else {
        await query(
          'UPDATE sites SET last_seen_at = NOW(), status = $1 WHERE id = $2',
          ['online', siteId]
        );
      }

      if (softwareVersion) {
        await query(
          'UPDATE sites SET software_version = $2 WHERE id = $1',
          [siteId, softwareVersion]
        );
      }

      this.checkAlerts(siteId, message.metrics);
    } catch (error) {
      logger.error('Error handling heartbeat:', error);
    }
  }

  private async checkAlerts(siteId: string, metrics: any) {
    const alerts = [];

    if (metrics.temperature > 75) {
      alerts.push({
        type: 'high_temperature',
        severity: metrics.temperature > 80 ? 'critical' : 'warning',
        message: `Température élevée: ${metrics.temperature.toFixed(1)}°C`,
      });
    }

    if (metrics.disk > 90) {
      alerts.push({
        type: 'high_disk_usage',
        severity: metrics.disk > 95 ? 'critical' : 'warning',
        message: `Espace disque faible: ${metrics.disk.toFixed(1)}%`,
      });
    }

    if (metrics.memory > 90) {
      alerts.push({
        type: 'high_memory_usage',
        severity: 'warning',
        message: `Utilisation mémoire élevée: ${metrics.memory.toFixed(1)}%`,
      });
    }

    for (const alert of alerts) {
      const existing = await query(
        `SELECT id FROM alerts
         WHERE site_id = $1 AND alert_type = $2 AND status = 'active'
         AND created_at > NOW() - INTERVAL '1 hour'`,
        [siteId, alert.type]
      );

      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO alerts (site_id, alert_type, severity, message, status)
           VALUES ($1, $2, $3, $4, 'active')`,
          [siteId, alert.type, alert.severity, alert.message]
        );

        // Send Slack alert for critical metrics
        const siteResult = await query('SELECT club_name FROM sites WHERE id = $1', [siteId]);
        const clubName: string = (siteResult.rows[0]?.club_name as string) || siteId;

        if (alert.type === 'high_temperature') {
          alertService.highTemperature(siteId, clubName, metrics.temperature).catch((_e) => {/* ignore */});
        } else if (alert.type === 'high_disk_usage') {
          alertService.lowDiskSpace(siteId, clubName, metrics.disk).catch((_e) => {/* ignore */});
        }

        logger.warn('Alert created', { siteId, ...alert });
      }
    }
  }

  private async handleCommandResult(siteId: string, result: CommandResult) {
    try {
      // Retirer de la liste des commandes en attente (timeout annulé car on a reçu une réponse)
      this.pendingCommands.delete(result.commandId);

      await query(
        `UPDATE remote_commands
         SET status = $1, result = $2, error_message = $3, completed_at = NOW()
         WHERE id = $4`,
        [
          result.status === 'success' ? 'completed' : 'failed',
          result.result ? JSON.stringify(result.result) : null,
          result.error || null,
          result.commandId,
        ]
      );

      const commandRow = await query<{ command_type: string; command_data: Record<string, unknown> | null }>(
        `SELECT command_type, command_data
         FROM remote_commands
         WHERE id = $1`,
        [result.commandId]
      );

      const commandRecord = commandRow.rows[0];
      const commandData = (commandRecord?.command_data as ConfigCommandData | null) || null;
      const configVersionId = typeof commandData?.configVersionId === 'string' ? commandData.configVersionId : null;
      const updateDeploymentId =
        commandData && typeof (commandData as Record<string, unknown>).deploymentId === 'string'
          ? String((commandData as Record<string, unknown>).deploymentId)
          : null;

      if (
        result.status === 'success' &&
        commandRecord?.command_type === 'update_config' &&
        configVersionId
      ) {
        await this.clearPendingConfig(siteId, configVersionId);
      }

      if (commandRecord?.command_type === 'update_software' && updateDeploymentId) {
        const updateService = await getUpdateDeploymentService();
        if (result.status === 'success') {
          await updateService.handleDeploymentResult(updateDeploymentId, siteId, true);
        } else {
          await updateService.handleDeploymentResult(
            updateDeploymentId,
            siteId,
            false,
            result.error || 'Erreur inconnue'
          );
        }
      }

      logger.info('Command result received', {
        siteId,
        commandId: result.commandId,
        status: result.status,
        ...(result.status === 'error' && result.error ? { error: result.error } : {}),
      });

      if (this.io) {
        // Broadcaster aux dashboards connectés
        // Inclure le résultat pour les commandes qui en ont besoin (ex: remote_shell)
        this.io.to('dashboard').emit('command_completed', {
          siteId,
          commandId: result.commandId,
          commandType: commandRecord?.command_type,
          status: result.status,
          result: result.result || null,
          error: result.error || null,
        });
      }
    } catch (error) {
      logger.error('Error handling command result:', error);
    }
  }

  /**
   * Gère la synchronisation de l'état local depuis un Pi
   * Stocke le miroir de la configuration pour que NEOPRO puisse voir
   * ce qu'il y a sur chaque boîtier.
   */
  private async handleSyncLocalState(siteId: string, state: any) {
    try {
      const { configHash, config, videos, storage, hotspotSsid, hotspotInfo, timestamp } = state;

      logger.info('Received local state sync', {
        siteId,
        configHash,
        categoriesCount: config?.categories?.length || 0,
        videosCount: videos?.length || 0,
        hotspotSsid: hotspotSsid || hotspotInfo?.ssid || null,
        hotspotChannel: hotspotInfo?.channel || null,
        hotspotClients: hotspotInfo?.clients || 0,
        timestamp,
      });

      // Enrichir la config avec les vidéos, le stockage et les infos hotspot pour accès facile
      const enrichedConfig = {
        ...config,
        _localVideos: videos || [],
        _localStorage: storage || null,
        _hotspotSsid: hotspotSsid || hotspotInfo?.ssid || null,
        _hotspotInfo: hotspotInfo || null, // Infos complètes (ssid, channel, clients, isActive)
        _lastVideoSync: timestamp,
      };

      // Stocker le miroir de la configuration locale (enrichi avec vidéos)
      await query(
        `UPDATE sites
         SET local_config_mirror = $1,
             local_config_hash = $2,
             last_config_sync = NOW()
         WHERE id = $3`,
        [JSON.stringify(enrichedConfig), configHash, siteId]
      );

      // Émettre au dashboard pour mise à jour en temps réel
      if (this.io) {
        this.io.to('dashboard').emit('site_config_updated', {
          siteId,
          configHash,
          categoriesCount: config?.categories?.length || 0,
          videosCount: videos?.length || 0,
          timestamp,
        });
      }

      logger.info('Local state stored', { siteId, configHash, videosCount: videos?.length || 0 });
      await this.triggerPendingConfigSync(siteId);
    } catch (error) {
      logger.error('Error handling sync_local_state:', error);
    }
  }

  async triggerPendingConfigSync(siteId: string) {
    if (!this.isConnected(siteId)) {
      return;
    }

    try {
      const pendingVersion = await this.getPendingConfigVersion(siteId);
      if (!pendingVersion) {
        return;
      }

      if (await this.hasActiveConfigCommand(siteId, pendingVersion)) {
        return;
      }

      const configuration = await this.fetchConfigVersion(pendingVersion);
      if (!configuration) {
        await this.clearPendingConfig(siteId, pendingVersion);
        return;
      }

      await this.sendPendingConfigCommand(siteId, configuration, pendingVersion);
    } catch (error) {
      if ((error as any)?.code === '42703') {
        logger.warn('pending_config_version_id column missing - skipping pending config sync (run migration add-pending-config-column.sql)', {
          siteId,
        });
      } else {
        logger.error('Error triggering pending config sync:', { siteId, error });
      }
    }
  }

  private async getPendingConfigVersion(siteId: string): Promise<string | null> {
    const result = await query<{ pending_config_version_id: string | null }>(
      'SELECT pending_config_version_id FROM sites WHERE id = $1',
      [siteId]
    );
    return (result.rows[0]?.pending_config_version_id as string | null) ?? null;
  }

  private async fetchConfigVersion(versionId: string): Promise<Record<string, unknown> | null> {
    const result = await query<{ configuration: Record<string, unknown> | null }>(
      'SELECT configuration FROM config_history WHERE id = $1',
      [versionId]
    );
    return (result.rows[0]?.configuration as Record<string, unknown> | null) ?? null;
  }

  private async hasActiveConfigCommand(siteId: string, versionId: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM remote_commands
       WHERE site_id = $1
         AND command_type = 'update_config'
         AND status IN ('pending', 'executing')
         AND command_data ->> 'configVersionId' = $2
       LIMIT 1`,
      [siteId, versionId]
    );
    return result.rows.length > 0;
  }

  private async sendPendingConfigCommand(
    siteId: string,
    configuration: Record<string, unknown>,
    versionId: string
  ) {
    if (!this.isConnected(siteId)) {
      return;
    }

    const commandId = uuidv4();
    const commandPayload = {
      configuration,
      configVersionId: versionId,
    };

    await query(
      `INSERT INTO remote_commands (id, site_id, command_type, command_data, status)
       VALUES ($1, $2, 'update_config', $3, 'pending')`,
      [commandId, siteId, JSON.stringify(commandPayload)]
    );

    const sent = this.sendCommand(siteId, {
      id: commandId,
      type: 'update_config',
      data: commandPayload,
    });

    if (!sent) {
      await query(
        `UPDATE remote_commands
         SET status = 'failed', error_message = 'Site disconnected'
         WHERE id = $1`,
        [commandId]
      );
      return;
    }

    await query(
      `UPDATE remote_commands
       SET status = 'executing', executed_at = NOW()
       WHERE id = $1`,
      [commandId]
    );
  }

  private async clearPendingConfig(siteId: string, versionId: string) {
    await query(
      `UPDATE sites
       SET pending_config_version_id = NULL
       WHERE id = $1 AND pending_config_version_id = $2`,
      [siteId, versionId]
    );
  }

  private async handleDeployProgress(siteId: string, progress: any) {
    try {
      const { deploymentId, videoId, progress: progressValue, completed, error } = progress;

      if (deploymentId) {
        // Mise à jour directe du déploiement
        if (error) {
          await query(
            `UPDATE content_deployments
             SET status = 'failed', error_message = $1, completed_at = NOW()
             WHERE id = $2`,
            [error, deploymentId]
          );
        } else if (completed) {
          await query(
            `UPDATE content_deployments
             SET status = 'completed', progress = 100, completed_at = NOW()
             WHERE id = $1`,
            [deploymentId]
          );
        } else {
          await query(
            `UPDATE content_deployments
             SET progress = $1, status = 'in_progress'
             WHERE id = $2`,
            [progressValue || 0, deploymentId]
          );
        }
      } else if (videoId) {
        // Fallback: mise à jour par videoId
        await query(
          `UPDATE content_deployments
           SET progress = $1, status = 'in_progress'
           WHERE video_id = $2 AND (target_id = $3 OR target_id IN (
             SELECT group_id FROM site_groups WHERE site_id = $3
           ))`,
          [progressValue || 0, videoId, siteId]
        );
      }

      // Émettre le progress au dashboard
      if (this.io) {
        this.io.to('dashboard').emit('deploy_progress', {
          siteId,
          deploymentId,
          progress: progressValue,
          completed,
          error,
          ...progress,
        });
      }
    } catch (err) {
      logger.error('Error handling deploy progress:', err);
    }
  }

  /**
   * Gère les événements de progression de mise à jour logicielle
   */
  private async handleUpdateProgress(siteId: string, progress: any) {
    try {
      const { deploymentId, progress: progressValue, completed, error, version } = progress;

      logger.info('Update progress received', {
        siteId,
        deploymentId,
        progress: progressValue,
        completed,
        error,
        version,
      });

      const updateService = await getUpdateDeploymentService();
      const isCompletedByProgress =
        typeof progressValue === 'number' && Number.isFinite(progressValue) && progressValue >= 100;

      if (deploymentId) {
        if (error) {
          await updateService.handleDeploymentResult(deploymentId, siteId, false, error);
        } else if (completed || isCompletedByProgress) {
          await updateService.handleDeploymentResult(deploymentId, siteId, true);
        } else {
          await updateService.updateProgress(deploymentId, progressValue || 0);
        }
      }

      // Émettre le progress au dashboard
      if (this.io) {
        this.io.to('dashboard').emit('update_progress', {
          siteId,
          deploymentId,
          progress: progressValue,
          completed,
          error,
          version,
        });
      }
    } catch (err) {
      logger.error('Error handling update progress:', err);
    }
  }

  sendCommand(siteId: string, command: CommandMessage): boolean {
    const socket = this.connectedSites.get(siteId);

    if (!socket) {
      logger.warn('Cannot send command: site not in connectedSites map', { siteId });
      return false;
    }

    // Vérifier que la socket est réellement connectée (pas une connexion zombie)
    if (!socket.connected) {
      logger.warn('Cannot send command: socket exists but not connected (zombie)', {
        siteId,
        socketId: socket.id,
        commandType: command.type,
      });
      // Nettoyer la connexion zombie
      this.cleanupZombieConnection(siteId, socket);
      return false;
    }

    // Vérifier la fraîcheur du dernier pong pour détecter les connexions mortes
    const lastPong = this.lastPongReceived.get(siteId);
    const now = Date.now();
    if (lastPong && (now - lastPong) > 60000) {
      logger.warn('Cannot send command: last pong too old (stale connection)', {
        siteId,
        lastPongAgeMs: now - lastPong,
        commandType: command.type,
      });
      // Nettoyer la connexion stale
      this.cleanupZombieConnection(siteId, socket);
      return false;
    }

    // Déterminer le timeout pour ce type de commande
    const timeoutMs = COMMAND_TIMEOUTS[command.type] || COMMAND_TIMEOUTS.default;

    // Enregistrer la commande comme en attente
    this.pendingCommands.set(command.id, {
      commandId: command.id,
      siteId,
      type: command.type,
      sentAt: Date.now(),
      timeoutMs,
    });

    socket.emit('command', command);
    logger.info('Command sent to agent', {
      siteId,
      commandId: command.id,
      type: command.type,
      timeoutMs,
    });

    return true;
  }

  /**
   * Nettoie une connexion zombie (socket présente mais non fonctionnelle)
   */
  private cleanupZombieConnection(siteId: string, socket: Socket) {
    logger.info('Cleaning up zombie connection', { siteId, socketId: socket.id });

    // Forcer la déconnexion
    try {
      socket.disconnect(true);
    } catch (e) {
      logger.error('Error disconnecting zombie socket:', e);
    }

    // Nettoyer les maps
    this.connectedSites.delete(siteId);
    this.lastPongReceived.delete(siteId);

    // Mettre à jour le statut en base
    query('UPDATE sites SET status = $1, last_seen_at = NOW() WHERE id = $2', ['offline', siteId])
      .catch((error) => {
        logger.error('Error updating site status on zombie cleanup:', error);
      });
  }

  broadcastToGroup(siteIds: string[], command: CommandMessage) {
    let successCount = 0;
    let failureCount = 0;

    for (const siteId of siteIds) {
      if (this.sendCommand(siteId, command)) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    logger.info('Command broadcasted to group', {
      commandId: command.id,
      type: command.type,
      successCount,
      failureCount,
    });

    return { successCount, failureCount };
  }

  isConnected(siteId: string): boolean {
    return this.connectedSites.has(siteId);
  }

  getConnectedSites(): string[] {
    return Array.from(this.connectedSites.keys());
  }

  getConnectionCount(): number {
    return this.connectedSites.size;
  }

  /**
   * Retourne des informations de debug sur l'état des connexions
   */
  getDebugInfo(): {
    connectedSites: string[];
    lastPongReceived: Record<string, number>;
    pendingCommandsCount: number;
  } {
    const pongInfo: Record<string, number> = {};
    for (const [siteId, timestamp] of this.lastPongReceived.entries()) {
      pongInfo[siteId] = timestamp;
    }
    return {
      connectedSites: Array.from(this.connectedSites.keys()),
      lastPongReceived: pongInfo,
      pendingCommandsCount: this.pendingCommands.size,
    };
  }

  /**
   * Retourne l'état de santé détaillé d'une connexion pour un site
   * Utilisé par le dashboard pour afficher un indicateur de santé fiable
   */
  getConnectionHealth(siteId: string): {
    inMap: boolean;
    socketConnected: boolean;
    lastPongAgeMs: number | null;
    isHealthy: boolean;
    reason: string;
  } {
    const socket = this.connectedSites.get(siteId);
    const lastPong = this.lastPongReceived.get(siteId);
    const now = Date.now();
    const lastPongAgeMs = lastPong ? now - lastPong : null;

    // Critères de santé
    const inMap = !!socket;
    const socketConnected = socket?.connected ?? false;
    const pongFresh = lastPongAgeMs !== null && lastPongAgeMs < 60000;

    let isHealthy = false;
    let reason = 'unknown';

    if (!inMap) {
      reason = 'not_in_map';
    } else if (!socketConnected) {
      reason = 'socket_disconnected';
    } else if (!pongFresh) {
      reason = lastPongAgeMs === null ? 'no_pong_received' : 'pong_stale';
    } else {
      isHealthy = true;
      reason = 'healthy';
    }

    return {
      inMap,
      socketConnected,
      lastPongAgeMs,
      isHealthy,
      reason,
    };
  }

  /**
   * Arrête le service proprement (pour les tests et le shutdown)
   */
  async cleanup() {
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = null;
    }
    if (this.connectionHealthCheckInterval) {
      clearInterval(this.connectionHealthCheckInterval);
      this.connectionHealthCheckInterval = null;
    }
    if (this.dbSyncInterval) {
      clearInterval(this.dbSyncInterval);
      this.dbSyncInterval = null;
    }
    this.pendingCommands.clear();
    this.connectedSites.clear();
    this.lastPongReceived.clear();

    // Fermer les connexions Redis
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        this.redisClient = null;
      } catch (error) {
        logger.error('Error closing Redis pub client:', error);
      }
    }
    if (this.redisSub) {
      try {
        await this.redisSub.quit();
        this.redisSub = null;
      } catch (error) {
        logger.error('Error closing Redis sub client:', error);
      }
    }

    logger.info('Socket service cleaned up');
  }

  /**
   * Vérifie si Redis est connecté
   */
  isRedisConnected(): boolean {
    return this.redisClient !== null && this.redisClient.isOpen;
  }
}

export default new SocketService();
