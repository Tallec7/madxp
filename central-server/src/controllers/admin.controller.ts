import { Response } from 'express';
import { AuthRequest } from '../types';
import { adminOpsService } from '../services/admin-ops.service';
import { AdminActionRequest, LocalClientInput } from '../types/admin';
import logger from '../config/logger';
import { PassThrough } from 'stream';
import socketService from '../services/socket.service';
import { siteRepository, videoFtpAuditRepository, analyticsRepository } from '../repositories';
import { videoFtpAuditService } from '../services/video-ftp-audit.service';


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
  // Required for Railway/nginx: prevents proxy buffering that causes ERR_HTTP2_PROTOCOL_ERROR
  res.setHeader('X-Accel-Buffering', 'no');
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

// =============================================================================
// PR2.2 — Video FTP orphan audit (admin diagnostic + manual trigger)
// =============================================================================

/**
 * GET /api/admin/video-ftp-orphans
 * Liste les vidéos dont le storage_path FTP est mort selon le dernier passage
 * du CRON `video_ftp_audit`. Réponse enrichie avec filename + reference_count
 * (nombre de sites qui référencent encore la vidéo).
 */
export const listVideoFtpOrphans = async (_req: AuthRequest, res: Response) => {
  try {
    const [warnings, counts] = await Promise.all([
      videoFtpAuditRepository.findAllActive(200),
      videoFtpAuditRepository.countActive(),
    ]);
    return res.json({
      summary: counts,
      warnings,
    });
  } catch (error) {
    logger.error('Error listing video FTP orphans:', error);
    return res.status(500).json({ error: 'Failed to list video FTP orphans' });
  }
};

/**
 * POST /api/admin/video-ftp-orphans/run
 * Déclenche manuellement un passage du CRON `video_ftp_audit`. Utile pour
 * tester ou re-vérifier rapidement après un cleanup FTP. Bloquant (timeout
 * client = HEAD * 8s par batch concurrent), à n'utiliser que sur démo/staging
 * pour des petits jeux de données.
 */
export const runVideoFtpAudit = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await videoFtpAuditService.auditAllVideos();
    return res.json({ ok: true, result });
  } catch (error) {
    logger.error('Error running video FTP audit on demand:', error);
    return res.status(500).json({ error: 'Failed to run video FTP audit' });
  }
};


/**
 * GET /api/admin/video-health
 * Vue agrégée "Santé vidéos flotte" pour le dashboard super_admin :
 * - orphelines FTP (totaux missing / unreachable + dernière exécution CRON)
 * - erreurs de lecture vidéo des dernières 24h, sommées et top par site
 *
 * Fait deux requêtes en parallèle. Pas de cache : la page est super_admin only
 * et les données changent au rythme du CRON nocturne (3h) + des analytics Pi.
 */
export const getFleetVideoHealth = async (_req: AuthRequest, res: Response) => {
  try {
    const last24hStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [ftpCounts, ftpWarnings, fleetErrors] = await Promise.all([
      videoFtpAuditRepository.countActive(),
      videoFtpAuditRepository.findAllActive(50),
      analyticsRepository.getFleetVideoPlaybackErrors(last24hStart, 25),
    ]);

    const totalErrors24h = fleetErrors.reduce((sum, row) => sum + row.error_count, 0);
    const lastFtpAuditAt = ftpWarnings[0]?.last_checked_at || null;

    return res.json({
      summary: {
        ftpOrphans: ftpCounts,
        videoErrors24h: totalErrors24h,
        sitesWithErrors: fleetErrors.length,
        lastFtpAuditAt,
      },
      topErrorSites: fleetErrors,
      ftpOrphans: ftpWarnings,
    });
  } catch (error) {
    logger.error('Error fetching fleet video health:', error);
    return res.status(500).json({ error: 'Failed to fetch fleet video health' });
  }
};
