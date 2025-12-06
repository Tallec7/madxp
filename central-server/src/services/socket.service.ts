import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createHash, timingSafeEqual } from 'crypto';
import { query } from '../config/database';
import { SocketData, CommandMessage, CommandResult, HeartbeatMessage } from '../types';
import logger from '../config/logger';

const hashApiKey = (apiKey: string): string => {
  return createHash('sha256').update(apiKey).digest('hex');
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
        logger.error('Agent authentication failed:', error);
        socket.emit('auth_error', { message: 'Authentification échouée' });
        socket.disconnect();
      }
    });

    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  private async authenticateAgent(socket: Socket, data: SocketData) {
    const { siteId, apiKey } = data;

    interface SiteAuthRow {
      id: string;
      site_name: string;
      api_key_hash: string;
      [column: string]: unknown;
    }

    const result = await query<SiteAuthRow>(
      'SELECT id, site_name, api_key_hash FROM sites WHERE id = $1',
      [siteId]
    );

    if (result.rows.length === 0) {
      throw new Error('Site non trouvé');
    }

    const site = result.rows[0];

    // Compare hashed API keys using timing-safe comparison
    const providedHash = hashApiKey(apiKey);
    if (!secureCompare(site.api_key_hash, providedHash)) {
      throw new Error('Clé API invalide');
    }

    (socket as any).siteId = siteId;
    (socket as any).siteName = site.site_name;

    this.connectedSites.set(siteId, socket);

    await query(
      'UPDATE sites SET status = $1, last_seen_at = NOW() WHERE id = $2',
      ['online', siteId]
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

    logger.info('Agent authenticated', { siteId, siteName: site.site_name });
  }

  private handleDisconnection(socket: Socket) {
    const siteId = (socket as any).siteId;

    if (siteId) {
      this.connectedSites.delete(siteId);

      query(
        'UPDATE sites SET status = $1, last_seen_at = NOW() WHERE id = $2',
        ['offline', siteId]
      ).catch((error) => {
        logger.error('Error updating site status on disconnect:', error);
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
          message.metrics.uptime,
        ]
      );

      await query(
        'UPDATE sites SET last_seen_at = NOW(), status = $1 WHERE id = $2',
        ['online', siteId]
      );

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

      logger.info('Command result received', { siteId, commandId: result.commandId, status: result.status });

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

  private async handleDeployProgress(siteId: string, progress: any) {
    try {
      if (progress.videoId) {
        await query(
          `UPDATE content_deployments
           SET progress = $1, status = 'in_progress'
           WHERE video_id = $2 AND target_id = $3 OR target_id IN (
             SELECT group_id FROM site_groups WHERE site_id = $3
           )`,
          [progress.progress, progress.videoId, siteId]
        );
      }

      if (this.io) {
        this.io.emit('deploy_progress', {
          siteId,
          ...progress,
        });
      }
    } catch (error) {
      logger.error('Error handling deploy progress:', error);
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
