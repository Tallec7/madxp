import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { timingSafeEqual } from 'crypto';
import { query } from '../config/database';
import { SocketData, CommandMessage, CommandResult, HeartbeatMessage } from '../types';
import logger from '../config/logger';
import { alertService } from './alert.service';

// Import différé pour éviter les dépendances circulaires
let deploymentService: { processPendingDeploymentsForSite: (siteId: string) => Promise<void> } | null = null;
const getDeploymentService = async () => {
  if (!deploymentService) {
    const module = await import('./deployment.service');
    deploymentService = module.default;
  }
  return deploymentService;
};

const secureCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

class SocketService {
  private io: SocketIOServer | null = null;
  private connectedSites: Map<string, Socket> = new Map();

  initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.io.on('connection', this.handleConnection.bind(this));

    logger.info('Socket.IO service initialized');
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

    // Compare API keys using timing-safe comparison
    if (!site.api_key || !secureCompare(site.api_key, apiKey)) {
      logger.error('Invalid API key', {
        siteId,
        siteName: site.site_name,
        storedKeyLength: site.api_key?.length,
        providedKeyLength: apiKey?.length
      });
      throw new Error('Clé API invalide');
    }

    (socket as any).siteId = siteId;
    (socket as any).siteName = site.site_name;

    this.connectedSites.set(siteId, socket);

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

    socket.on('sync_local_state', (state: any) => {
      this.handleSyncLocalState(siteId, state);
    });

    logger.info('Agent authenticated', { siteId, siteName: site.site_name, clientIp });

    // Traiter les déploiements en attente pour ce site
    this.processPendingDeployments(siteId);
  }

  private async processPendingDeployments(siteId: string) {
    try {
      const service = await getDeploymentService();
      await service.processPendingDeploymentsForSite(siteId);
    } catch (error) {
      logger.error('Error processing pending deployments on connect:', { siteId, error });
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

      // Update site status and local IP if provided
      const localIp = message.metrics.localIp || null;
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
    } catch (error) {
      logger.error('Error handling sync_local_state:', error);
    }
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

  sendCommand(siteId: string, command: CommandMessage): boolean {
    const socket = this.connectedSites.get(siteId);

    if (!socket) {
      logger.warn('Cannot send command: site not connected', { siteId });
      return false;
    }

    socket.emit('command', command);
    logger.info('Command sent to agent', { siteId, commandId: command.id, type: command.type });

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
}

export default new SocketService();
