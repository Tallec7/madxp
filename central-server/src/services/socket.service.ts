import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
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
 * Vérifie une API key contre son hash bcrypt
 * bcrypt.compare est déjà timing-safe par conception
 */
const verifyApiKey = async (providedKey: string, storedHash: string): Promise<boolean> => {
  try {
    return await bcrypt.compare(providedKey, storedHash);
  } catch {
    return false;
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
  private redisClient: RedisClientType | null = null;
  private redisSub: RedisClientType | null = null;

  async initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Configuration Redis pour scalabilité horizontale
    await this.setupRedisAdapter();

    this.io.on('connection', this.handleConnection.bind(this));

    // Démarrer la vérification périodique des timeouts de commandes
    this.startCommandTimeoutChecker();

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
   */
  private async checkCommandTimeouts() {
    const now = Date.now();

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
            this.io.emit('command_timeout', {
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
      }
    }
  }

  private async handleConnection(socket: Socket) {
    logger.info('New socket connection', { socketId: socket.id });

    socket.on('authenticate', async (data: SocketData) => {
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

    // Vérifier l'API key avec bcrypt (timing-safe par conception)
    const isValidKey = site.api_key && await verifyApiKey(apiKey, site.api_key);
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

    socket.on('heartbeat', (message: HeartbeatMessage) => {
      this.handleHeartbeat(siteId, message);
    });

    socket.on('command_result', (result: CommandResult) => {
      this.handleCommandResult(siteId, result);
    });

    socket.on('deploy_progress', (progress: any) => {
      this.handleDeployProgress(siteId, progress);
    });

    socket.on('update_progress', (progress: any) => {
      this.handleUpdateProgress(siteId, progress);
    });

    socket.on('sync_local_state', (state: any) => {
      this.handleSyncLocalState(siteId, state);
    });

    // Live Score - Match Configuration
    socket.on('match-config', (payload: any) => {
      handleMatchConfig(socket, payload);
    });

    // Live Score - Score Update
    socket.on('score-update', (payload: any) => {
      handleScoreUpdate(socket, payload);
    });

    // Live Score - Score Reset
    socket.on('score-reset', () => {
      handleScoreReset(socket);
    });

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

    if (siteId) {
      const siteName = (socket as any).siteName || siteId;
      this.connectedSites.delete(siteId);

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
        this.io.emit('command_completed', {
          siteId,
          commandId: result.commandId,
          status: result.status,
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
      const { configHash, config, timestamp } = state;

      logger.info('Received local state sync', {
        siteId,
        configHash,
        categoriesCount: config?.categories?.length || 0,
        timestamp,
      });

      // Stocker le miroir de la configuration locale
      await query(
        `UPDATE sites
         SET local_config_mirror = $1,
             local_config_hash = $2,
             last_config_sync = NOW()
         WHERE id = $3`,
        [JSON.stringify(config), configHash, siteId]
      );

      // Émettre au dashboard pour mise à jour en temps réel
      if (this.io) {
        this.io.emit('site_config_updated', {
          siteId,
          configHash,
          categoriesCount: config?.categories?.length || 0,
          timestamp,
        });
      }

      logger.info('Local state stored', { siteId, configHash });
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
        this.io.emit('deploy_progress', {
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
        this.io.emit('update_progress', {
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
      logger.warn('Cannot send command: site not connected', { siteId });
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
   * Arrête le service proprement (pour les tests et le shutdown)
   */
  async cleanup() {
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = null;
    }
    this.pendingCommands.clear();
    this.connectedSites.clear();

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
