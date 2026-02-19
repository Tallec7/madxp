import { Response } from 'express';
import { AuthRequest } from '../types';
import { adminOpsService } from '../services/admin-ops.service';
import { AdminActionRequest, LocalClientInput } from '../types/admin';
import logger from '../config/logger';
import { PassThrough } from 'stream';
import socketService from '../services/socket.service';
import { siteRepository } from '../repositories';
import { predictiveAlertsService } from '../services/predictive-alerts.service';

export const listJobs = (_req: AuthRequest, res: Response) => {
  return res.json({ jobs: adminOpsService.listJobs() });
};

export const triggerJob = (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body as AdminActionRequest;
    const requestedBy = req.user?.email || 'unknown';
    const job = adminOpsService.triggerAction(payload, requestedBy);
    return res.status(201).json({ job });
  } catch (error) {
    logger.warn('Invalid job request', { error });
    return res.status(400).json({ error: (error as Error).message });
  }
};

export const listClients = (_req: AuthRequest, res: Response) => {
  return res.json({ clients: adminOpsService.listClients() });
};

export const createClient = (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body as LocalClientInput;
    const client = adminOpsService.createClient(payload);
    return res.status(201).json({ client });
  } catch (error) {
    logger.warn('Invalid client payload', { error });
    return res.status(400).json({ error: (error as Error).message });
  }
};

export const syncClient = (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const client = adminOpsService.syncClient(id);
    return res.json({ client });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
};

export const streamJobs = (req: AuthRequest, res: Response) => {
  const stream = new PassThrough();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = adminOpsService.subscribeToJobs(job => send('job-update', job));
  const heartbeat = setInterval(() => send('keep-alive', 'ping'), 15000);

  send('seed', adminOpsService.listJobs());

  stream.pipe(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    stream.end();
  });
};

/**
 * Retourne l'état des connexions Socket.IO pour debug
 * Permet de comparer les sites "connectés" en mémoire vs en base de données
 */
export const getSocketDebugInfo = async (_req: AuthRequest, res: Response) => {
  try {
    // État Socket.IO en mémoire
    const socketInfo = socketService.getDebugInfo();

    // Sites marqués "online" en DB
    const dbOnlineSites = await siteRepository.findOnline();

    // Comparer les deux sources
    const socketConnectedSet = new Set(socketInfo.connectedSites);
    const dbOnlineSet = new Set(dbOnlineSites.map(s => s.id));

    // Sites dans Socket mais pas dans DB (rare)
    const inSocketNotInDb = socketInfo.connectedSites.filter(id => !dbOnlineSet.has(id));

    // Sites dans DB mais pas dans Socket (le problème probable)
    const inDbNotInSocket = dbOnlineSites.filter(s => !socketConnectedSet.has(s.id));

    return res.json({
      socketState: {
        connectedSites: socketInfo.connectedSites,
        connectedCount: socketInfo.connectedSites.length,
        pendingCommandsCount: socketInfo.pendingCommandsCount,
        lastPongReceived: socketInfo.lastPongReceived,
        isRedisConnected: socketService.isRedisConnected(),
      },
      databaseState: {
        onlineSites: dbOnlineSites,
        onlineCount: dbOnlineSites.length,
      },
      comparison: {
        inSocketNotInDb,
        inDbNotInSocket: inDbNotInSocket.map(s => ({
          id: s.id,
          siteName: s.site_name,
          lastSeenAt: s.last_seen_at,
          ageMs: s.last_seen_at ? Date.now() - new Date(s.last_seen_at).getTime() : null,
        })),
        synchronized: inSocketNotInDb.length === 0 && inDbNotInSocket.length === 0,
      },
    });
  } catch (error) {
    logger.error('Error getting socket debug info:', error);
    return res.status(500).json({ error: 'Failed to get socket debug info' });
  }
};

/**
 * Retourne le statut du service d'alertes prédictives
 */
export const getPredictiveAlertsStatus = async (_req: AuthRequest, res: Response) => {
  try {
    const status = predictiveAlertsService.getStatus();
    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Error getting predictive alerts status:', error);
    return res.status(500).json({ error: 'Failed to get predictive alerts status' });
  }
};

/**
 * Déclenche une vérification prédictive immédiate
 */
export const runPredictiveAlertsNow = async (_req: AuthRequest, res: Response) => {
  try {
    logger.info('[Admin] Manual predictive alerts check requested');
    const result = await predictiveAlertsService.runNow();
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error running predictive alerts:', error);
    return res.status(500).json({ error: 'Failed to run predictive alerts check' });
  }
};
