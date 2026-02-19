/**
 * Socket Service — Orchestrator for WebSocket communication.
 *
 * Owns the shared state (Socket.IO server, connection maps, pending commands)
 * and delegates business logic to specialized handler files.
 *
 * Public API is unchanged — all 14 consumer files continue to work.
 *
 * @see handlers/socket-context.ts for SocketContext interface
 * @see handlers/*.handler.ts for delegated logic
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createHash } from 'crypto';
import jwt, { Secret } from 'jsonwebtoken';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { query } from '../config/database';
import { SocketData, CommandMessage, CommandResult, HeartbeatMessage } from '../types';
import logger from '../config/logger';
import { alertService } from './alert.service';
import metricsService from './metrics.service';
import { handleMatchConfig } from '../handlers/match-config.handler';
import { handleScoreUpdate, handleScoreReset } from '../handlers/score-update.handler';

// Handler imports
import { SocketContext, PendingCommand } from '../handlers/socket-context';
import { handleHeartbeat } from '../handlers/heartbeat.handler';
import {
  sendCommand as dispatchSendCommand,
  broadcastToGroup as dispatchBroadcastToGroup,
  handleCommandResult,
  checkCommandTimeouts,
} from '../handlers/command-dispatch.handler';
import {
  handleSyncLocalState,
  triggerPendingConfigSync as configTriggerPendingConfigSync,
  clearPendingConfig,
} from '../handlers/config-sync.handler';
import { handleDeployProgress, handleUpdateProgress } from '../handlers/deploy-progress.handler';
import { sendLicenseStatus } from '../handlers/license.handler';
import { handleNetworkAlert, handleNetworkRecovered, handleNetworkRollback } from '../handlers/network-resilience.handler';
import { handleRecordingState, RecordingStateMessage } from '../handlers/recording-state.handler';
import {
  checkConnectionHealth,
  syncDbWithWebSocketState,
  getConnectionHealth as healthGetConnectionHealth,
  MAX_PONG_ENTRIES,
} from '../handlers/health-monitor.handler';
import { alertingService } from './alerting.service';

// ============================================================================
// Lazy service loaders (circular dependency avoidance)
// ============================================================================

let deploymentService: { processPendingDeploymentsForSite: (siteId: string) => Promise<void> } | null = null;
const getDeploymentService = async () => {
  if (!deploymentService) {
    const module = await import('./deployment.service');
    deploymentService = module.default;
  }
  return deploymentService;
};

let updateDeploymentService: {
  processPendingDeploymentsForSite: (siteId: string) => Promise<void>;
} | null = null;
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

// ============================================================================
// Utility functions
// ============================================================================

const hashApiKey = (apiKey: string): string => {
  return createHash('sha256').update(apiKey).digest('hex');
};

const verifyApiKey = (providedKey: string, storedHash: string): boolean => {
  try {
    const providedHash = hashApiKey(providedKey);
    return providedHash === storedHash;
  } catch {
    return false;
  }
};

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

// ============================================================================
// SocketService — Orchestrator
// ============================================================================

class SocketService {
  private io: SocketIOServer | null = null;
  private connectedSites: Map<string, Socket> = new Map();
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private lastPongReceived: Map<string, number> = new Map();
  private recordingStates: Map<string, { isRecording: boolean; isManualOverride: boolean; updatedAt: number }> = new Map();
  private playerStates: Map<string, import('../handlers/socket-context').PlayerState> = new Map();
  private timeoutCheckInterval: NodeJS.Timeout | null = null;
  private connectionHealthCheckInterval: NodeJS.Timeout | null = null;
  private dbSyncInterval: NodeJS.Timeout | null = null;
  private redisClient: RedisClientType | null = null;
  private redisSub: RedisClientType | null = null;

  /** Shared context passed to all handler functions */
  private get ctx(): SocketContext {
    return {
      getIO: () => this.io,
      connectedSites: this.connectedSites,
      pendingCommands: this.pendingCommands,
      lastPongReceived: this.lastPongReceived,
      recordingStates: this.recordingStates,
      playerStates: this.playerStates,
    };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async initialize(httpServer: HTTPServer) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ?.split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean);

    const isProduction = process.env.NODE_ENV === 'production';
    const hasAllowedOrigins = allowedOrigins && allowedOrigins.length > 0;

    if (isProduction && !hasAllowedOrigins) {
      logger.error('='.repeat(80));
      logger.error('SECURITY WARNING: Socket.IO CORS - ALLOWED_ORIGINS not configured in production!');
      logger.error('WebSocket connections from browsers will be REJECTED.');
      logger.error('Please set ALLOWED_ORIGINS environment variable (comma-separated list).');
      logger.error('='.repeat(80));
    }

    const corsOrigin = hasAllowedOrigins
      ? allowedOrigins
      : isProduction
        ? false
        : true;

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
        credentials: hasAllowedOrigins,
      },
      transports: ['websocket', 'polling'],
      pingInterval: 10000,
      pingTimeout: 20000,
    });

    logger.info('Socket.IO CORS configuration', {
      isProduction,
      hasAllowedOrigins,
      allowedOrigins: hasAllowedOrigins ? allowedOrigins : 'none',
      corsMode: hasAllowedOrigins ? 'whitelist' : isProduction ? 'reject-all' : 'allow-all',
    });

    await this.setupRedisAdapter();

    this.io.on('connection', this.handleConnection.bind(this));

    // Start periodic checks (delegated to handlers)
    this.timeoutCheckInterval = setInterval(() => {
      checkCommandTimeouts(this.ctx);
    }, 10000);

    this.connectionHealthCheckInterval = setInterval(() => {
      checkConnectionHealth(this.ctx);
    }, 15000);

    this.dbSyncInterval = setInterval(() => {
      syncDbWithWebSocketState(this.ctx);
    }, 60000);

    logger.info('Socket.IO service initialized');
  }

  private async setupRedisAdapter(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      logger.warn('REDIS_URL not configured - Socket.IO running in single-instance mode');
      logger.warn('For horizontal scaling, set REDIS_URL environment variable');
      return;
    }

    try {
      this.redisClient = createClient({ url: redisUrl });
      this.redisSub = this.redisClient.duplicate();

      this.redisClient.on('error', (err: Error) => {
        logger.error('Redis pub client error:', err);
      });
      this.redisSub.on('error', (err: Error) => {
        logger.error('Redis sub client error:', err);
      });

      await Promise.all([
        this.redisClient.connect(),
        this.redisSub.connect(),
      ]);

      if (this.io) {
        this.io.adapter(createAdapter(this.redisClient, this.redisSub));
      }

      logger.info('Socket.IO Redis adapter configured for horizontal scaling', {
        redisUrl: redisUrl.replace(/\/\/.*@/, '//***@'),
      });
    } catch (error) {
      logger.error('Failed to setup Redis adapter:', error);
      logger.warn('Falling back to single-instance mode');

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

  // ==========================================================================
  // CONNECTION LIFECYCLE
  // ==========================================================================

  private async handleConnection(socket: Socket) {
    logger.info('New socket connection', { socketId: socket.id });

    // Dashboard connection with JWT
    const authData = socket.handshake.auth;
    if (authData && authData.token && typeof authData.token === 'string') {
      const decoded = verifyJwtToken(authData.token);
      if (decoded) {
        logger.info('Dashboard user authenticated via JWT', {
          userId: decoded.id,
          email: decoded.email,
          role: decoded.role,
        });

        (socket as any).userId = decoded.id;
        (socket as any).userEmail = decoded.email;
        (socket as any).userRole = decoded.role;
        (socket as any).clientType = 'dashboard';

        socket.join('dashboard');

        socket.emit('authenticated', {
          message: 'Dashboard authentifié avec succès',
          userId: decoded.id,
          role: decoded.role,
        });

        socket.on('disconnect', (reason: string) => {
          logger.info('Dashboard user disconnected', { userId: decoded.id, email: decoded.email, reason });
          metricsService.recordSocketDisconnect(reason, 'dashboard');
        });

        return;
      } else {
        logger.warn('Invalid JWT token in dashboard connection', { socketId: socket.id });
        socket.emit('auth_error', { message: 'Token JWT invalide' });
        socket.disconnect();
        return;
      }
    }

    // Pi agent connection with auth timeout
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
        metricsService.recordPiAgentAuth('success');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        logger.error('Agent authentication failed:', { error: errorMessage, siteId: data?.siteId });
        metricsService.recordPiAgentAuth('failure', errorMessage);
        socket.emit('auth_error', { message: `Authentification échouée: ${errorMessage}` });
        socket.disconnect();
      }
    });

    socket.on('disconnect', (reason: string) => {
      clearTimeout(authTimeout);
      this.handleDisconnection(socket, reason);
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
    (socket as any).io = this.io;

    this.connectedSites.set(siteId, socket);
    socket.join(siteId);

    const clientIp = socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0].trim()
      || socket.handshake.address
      || null;

    await query(
      'UPDATE sites SET status = $1, last_seen_at = NOW(), last_ip = $3 WHERE id = $2',
      ['online', siteId, clientIp]
    );

    alertService.siteOnline(siteId, site.site_name).catch((error) => {
      logger.error('Error sending online alert:', error);
    });

    socket.emit('authenticated', {
      message: 'Authentification réussie',
      siteId,
    });

    // Wire up event handlers — delegate to handler files
    const ctx = this.ctx;
    const handlers = {
      heartbeat: (message: HeartbeatMessage) => handleHeartbeat(ctx, siteId, message),
      command_result: (cmdResult: CommandResult) =>
        handleCommandResult(ctx, siteId, cmdResult, clearPendingConfig),
      deploy_progress: (progress: Record<string, unknown>) => handleDeployProgress(ctx, siteId, progress),
      update_progress: (progress: Record<string, unknown>) => handleUpdateProgress(ctx, siteId, progress),
      sync_local_state: (state: Record<string, unknown>) =>
        handleSyncLocalState(ctx, siteId, state, sendLicenseStatus),
      'match-config': (payload: any) => handleMatchConfig(socket, payload),
      'score-update': (payload: any) => handleScoreUpdate(socket, payload),
      'score-reset': () => handleScoreReset(socket),
      pong_check: () => this.lastPongReceived.set(siteId, Date.now()),
      network_alert: (alert: Record<string, unknown>) => handleNetworkAlert(ctx, siteId, alert),
      network_rollback: (rollback: Record<string, unknown>) => handleNetworkRollback(ctx, siteId, rollback),
      network_recovered: (payload: Record<string, unknown>) => handleNetworkRecovered(ctx, siteId, payload),
      'recording-state': (message: RecordingStateMessage) => handleRecordingState(ctx, siteId, message),
    };

    // Register handlers with metrics tracking for inbound WebSocket messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withMetrics = (eventName: string, handler: (...args: any[]) => any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (...args: any[]) => {
        metricsService.recordWebsocketMessage('inbound', eventName);
        return handler(...args);
      };
    };

    socket.on('heartbeat', withMetrics('heartbeat', handlers.heartbeat));
    socket.on('command_result', withMetrics('command_result', handlers.command_result));
    socket.on('deploy_progress', withMetrics('deploy_progress', handlers.deploy_progress));
    socket.on('update_progress', withMetrics('update_progress', handlers.update_progress));
    socket.on('sync_local_state', withMetrics('sync_local_state', handlers.sync_local_state));
    socket.on('match-config', withMetrics('match-config', handlers['match-config']));
    socket.on('score-update', withMetrics('score-update', handlers['score-update']));
    socket.on('score-reset', withMetrics('score-reset', handlers['score-reset']));
    socket.on('pong_check', withMetrics('pong_check', handlers.pong_check));
    socket.on('network_alert', withMetrics('network_alert', handlers.network_alert));
    socket.on('network_rollback', withMetrics('network_rollback', handlers.network_rollback));
    socket.on('network_recovered', withMetrics('network_recovered', handlers.network_recovered));
    socket.on('recording-state', withMetrics('recording-state', handlers['recording-state']));

    // Cloud monitoring: relay screenshot data from Pi to dashboard (legacy Socket.IO path).
    // Since v3.58, the primary screenshot path is HTTP request-response in remote.controller.ts.
    // This relay is kept for backward compatibility and as a fallback.
    socket.on('screenshot-data', (data: unknown) => {
      metricsService.recordWebsocketMessage('inbound', 'screenshot-data');
      const payload = data as Record<string, unknown>;
      if (payload.error) {
        logger.warn('Screenshot failed on Pi', { siteId, error: payload.error });
      } else {
        const imageSize = typeof payload.image === 'string' ? (payload.image as string).length : 0;
        logger.info('Screenshot data received from Pi (Socket.IO relay)', { siteId, imageSize });
      }
      if (this.io) {
        this.io.to('dashboard').emit('screenshot-data', { siteId, ...payload });
      }
    });

    (socket as any)._neoHandlers = handlers;

    // Initialize pong timestamp
    this.lastPongReceived.set(siteId, Date.now());

    // Memory safety
    if (this.lastPongReceived.size > MAX_PONG_ENTRIES) {
      const oldestSiteId = this.lastPongReceived.keys().next().value;
      if (oldestSiteId && !this.connectedSites.has(oldestSiteId)) {
        this.lastPongReceived.delete(oldestSiteId);
      }
    }

    logger.info('Agent authenticated', { siteId, siteName: site.site_name, clientIp });

    // Process pending commands and deployments
    this.processPendingOnReconnect(siteId);
  }

  private async processPendingOnReconnect(siteId: string) {
    try {
      const queueService = await getCommandQueueService();
      const queueResult = await queueService.processPendingCommands(siteId);
      if (queueResult.processed > 0) {
        logger.info('Pending commands processed on reconnect', {
          siteId,
          processed: queueResult.processed,
          failed: queueResult.failed,
          remaining: queueResult.remaining,
        });
      }
    } catch (error) {
      logger.error('Error processing pending commands on connect:', { siteId, error });
    }

    try {
      const service = await getDeploymentService();
      await service.processPendingDeploymentsForSite(siteId);
    } catch (error) {
      logger.error('Error processing pending content deployments on connect:', { siteId, error });
    }

    try {
      const updateService = await getUpdateDeploymentService();
      await updateService.processPendingDeploymentsForSite(siteId);
    } catch (error) {
      logger.error('Error processing pending update deployments on connect:', { siteId, error });
    }

    try {
      await this.triggerPendingConfigSync(siteId);
    } catch (error) {
      logger.error('Error triggering pending config sync on connect:', { siteId, error });
    }
  }

  private handleDisconnection(socket: Socket, reason: string = 'unknown') {
    const siteId = (socket as any).siteId as string | undefined;
    const clientType = siteId ? 'agent' : ((socket as any).clientType === 'dashboard' ? 'dashboard' : 'unknown');
    metricsService.recordSocketDisconnect(reason, clientType as 'agent' | 'dashboard' | 'unknown');

    // Feed hourly disconnect counter for threshold-based alerting
    if (siteId) {
      alertingService.recordDisconnectEvent(siteId);
    }

    // Remove all registered handlers to prevent memory leaks
    const handlers = (socket as any)._neoHandlers as Record<string, (...args: unknown[]) => void> | undefined;
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
      socket.off('network_alert', handlers.network_alert);
      socket.off('network_rollback', handlers.network_rollback);
      socket.off('network_recovered', handlers.network_recovered);
      socket.off('recording-state', handlers['recording-state']);
      delete (socket as any)._neoHandlers;
    }

    // Clean up pending commands for disconnected site
    if (siteId) {
      for (const [commandId, pending] of this.pendingCommands.entries()) {
        if (pending.siteId === siteId) {
          logger.warn('Cleaning up pending command for disconnected site', {
            commandId,
            siteId,
            type: pending.type,
          });
          this.pendingCommands.delete(commandId);

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
      const siteName = ((socket as any).siteName as string) || siteId;
      this.connectedSites.delete(siteId);
      this.lastPongReceived.delete(siteId);
      this.recordingStates.delete(siteId);
      this.playerStates.delete(siteId);

      query(
        'UPDATE sites SET status = $1, last_seen_at = NOW() WHERE id = $2',
        ['offline', siteId]
      ).catch((error) => {
        logger.error('Error updating site status on disconnect:', error);
      });

      alertService.siteOffline(siteId, siteName).catch((error) => {
        logger.error('Error sending offline alert:', error);
      });

      logger.info('Agent disconnected', { siteId, reason });
    }

    logger.info('Socket disconnected', { socketId: socket.id, reason });
  }

  // ==========================================================================
  // PUBLIC API (delegated to handlers)
  // ==========================================================================

  sendCommand(siteId: string, command: CommandMessage): boolean {
    return dispatchSendCommand(this.ctx, siteId, command);
  }

  broadcastToGroup(siteIds: string[], command: CommandMessage): { successCount: number; failureCount: number } {
    return dispatchBroadcastToGroup(this.ctx, siteIds, command);
  }

  async triggerPendingConfigSync(siteId: string): Promise<void> {
    return configTriggerPendingConfigSync(
      this.ctx,
      siteId,
      (sid: string, cmd: CommandMessage) => this.sendCommand(sid, cmd)
    );
  }

  isConnected(siteId: string): boolean {
    return this.connectedSites.has(siteId);
  }

  getConnectedSocket(siteId: string): Socket | null {
    return this.connectedSites.get(siteId) || null;
  }

  getRecordingState(siteId: string): { isRecording: boolean; isManualOverride: boolean } | null {
    const state = this.recordingStates.get(siteId);
    return state ? { isRecording: state.isRecording, isManualOverride: state.isManualOverride } : null;
  }

  getPlayerState(siteId: string): import('../handlers/socket-context').PlayerState | null {
    return this.playerStates.get(siteId) || null;
  }

  getConnectedSites(): string[] {
    return Array.from(this.connectedSites.keys());
  }

  getConnectionCount(): number {
    return this.connectedSites.size;
  }

  getIO(): SocketIOServer | null {
    return this.io;
  }

  getDashboardConnectionCount(): number {
    if (!this.io) return 0;
    const room = this.io.sockets.adapter.rooms.get('dashboard');
    return room ? room.size : 0;
  }

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

  getConnectionHealth(siteId: string): {
    inMap: boolean;
    socketConnected: boolean;
    lastPongAgeMs: number | null;
    isHealthy: boolean;
    reason: string;
  } {
    return healthGetConnectionHealth(this.ctx, siteId);
  }

  /**
   * Send license status to a connected Pi in real-time.
   * Used after subscription changes (suspend, reactivate, extend, plan change)
   * to immediately notify the Pi without waiting for the next sync_local_state.
   */
  async pushLicenseStatus(siteId: string): Promise<void> {
    return sendLicenseStatus(this.ctx, siteId);
  }

  // ==========================================================================
  // INTERNAL HANDLER DELEGATION (used by tests via (service as any))
  // ==========================================================================

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private async handleHeartbeat(siteId: string, message: HeartbeatMessage) {
    return handleHeartbeat(this.ctx, siteId, message);
  }

  private async handleCommandResult(siteId: string, result: CommandResult) {
    return handleCommandResult(this.ctx, siteId, result, clearPendingConfig);
  }

  private async handleSyncLocalState(siteId: string, state: any) {
    return handleSyncLocalState(this.ctx, siteId, state, sendLicenseStatus);
  }

  private async handleDeployProgress(siteId: string, progress: any) {
    return handleDeployProgress(this.ctx, siteId, progress);
  }

  private async handleUpdateProgress(siteId: string, progress: any) {
    return handleUpdateProgress(this.ctx, siteId, progress);
  }

  private async handleNetworkAlert(siteId: string, alert: any) {
    return handleNetworkAlert(this.ctx, siteId, alert);
  }

  private async handleNetworkRollback(siteId: string, rollback: any) {
    return handleNetworkRollback(this.ctx, siteId, rollback);
  }

  private async sendLicenseStatus(siteId: string) {
    return sendLicenseStatus(this.ctx, siteId);
  }

  private async checkCommandTimeouts() {
    return checkCommandTimeouts(this.ctx);
  }

  private checkConnectionHealth() {
    return checkConnectionHealth(this.ctx);
  }

  private async syncDbWithWebSocketState() {
    return syncDbWithWebSocketState(this.ctx);
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

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

    // Notify all connected Pi devices that the server is shutting down,
    // so they can reconnect gracefully instead of experiencing an abrupt drop.
    if (this.io) {
      logger.info('Notifying connected sites of server shutdown', {
        connectedSites: this.connectedSites.size,
      });
      this.io.emit('server_shutdown', { reason: 'Server restarting, please reconnect.' });

      // Give clients a brief moment to receive the notification before closing
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Close all Socket.IO connections and stop accepting new ones
      this.io.disconnectSockets(true);
      this.io.close();
      this.io = null;
    }

    this.pendingCommands.clear();
    this.connectedSites.clear();
    this.lastPongReceived.clear();
    this.recordingStates.clear();
    this.playerStates.clear();

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

  isRedisConnected(): boolean {
    return this.redisClient !== null && this.redisClient.isOpen;
  }
}

export default new SocketService();
