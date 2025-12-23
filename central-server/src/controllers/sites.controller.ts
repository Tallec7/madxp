import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { auditService } from '../services/audit.service';
import { formatPaginatedResponse, PaginationParams } from '../middleware/pagination';
import { commandQueueService } from '../services/command-queue.service';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BCRYPT_ROUNDS = 10;

const generateApiKey = (): string => {
  return randomBytes(32).toString('hex');
};

/**
 * Hash une API key avec bcrypt
 */
const hashApiKey = async (apiKey: string): Promise<string> => {
  return bcrypt.hash(apiKey, BCRYPT_ROUNDS);
};

/**
 * Vérifie une API key contre son hash
 */
export const verifyApiKey = async (apiKey: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(apiKey, hash);
};

export const getSites = async (req: AuthRequest, res: Response) => {
  try {
    const { status, sport, region, search } = req.query;
    const pagination = req.pagination || { page: 1, limit: 20, offset: 0 };

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (sport) {
      whereClause += ` AND sports @> $${paramIndex}::jsonb`;
      params.push(JSON.stringify([sport]));
      paramIndex++;
    }

    if (region) {
      whereClause += ` AND location->>'region' = $${paramIndex}`;
      params.push(region);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (site_name ILIKE $${paramIndex} OR club_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Requêtes paginée et count en parallèle
    const dataQuery = `SELECT * FROM sites ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const countQuery = `SELECT COUNT(*) as count FROM sites ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      query(dataQuery, [...params, pagination.limit, pagination.offset]),
      query(countQuery, params),
    ]);

    const total = parseInt((countResult.rows[0] as any)?.count || '0', 10);

    res.json(formatPaginatedResponse(dataResult.rows, total, pagination));
  } catch (error) {
    logger.error('Get sites error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des sites' });
  }
};

export const getSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT * FROM sites WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get site error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du site' });
  }
};

export const createSite = async (req: AuthRequest, res: Response) => {
  try {
    const { site_name, club_name, location, sports, hardware_model } = req.body;

    // Check for existing sites with same name and generate unique name if needed
    let uniqueSiteName = site_name;
    const existingResult = await query(
      `SELECT site_name FROM sites WHERE site_name = $1 OR site_name ~ $2`,
      [site_name, `^${site_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`]
    );

    if (existingResult.rows.length > 0) {
      // Find the highest suffix number
      let maxSuffix = 0;
      for (const row of existingResult.rows as { site_name: string }[]) {
        if (row.site_name === site_name) {
          maxSuffix = Math.max(maxSuffix, 1);
        } else {
          const match = row.site_name.match(/-(\d+)$/);
          if (match) {
            maxSuffix = Math.max(maxSuffix, parseInt(match[1], 10) + 1);
          }
        }
      }
      if (maxSuffix > 0) {
        uniqueSiteName = `${site_name}-${maxSuffix}`;
      }
    }

    const id = uuidv4();
    const api_key = generateApiKey();
    const api_key_hash = await hashApiKey(api_key);

    const result = await query(
      `INSERT INTO sites (id, site_name, club_name, location, sports, hardware_model, api_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, site_name, club_name, location, sports, hardware_model, status, created_at`,
      [
        id,
        uniqueSiteName,
        club_name,
        location ? JSON.stringify(location) : null,
        sports ? JSON.stringify(sports) : null,
        hardware_model || 'Unknown',
        api_key_hash, // Stocker le hash, pas la clé en clair
      ]
    );

    logger.info('Site created', { siteId: id, siteName: uniqueSiteName, createdBy: req.user?.email });

    // Audit log
    auditService.logSiteCreated(id, uniqueSiteName, req);

    // Return the plain API key only once at creation time
    // IMPORTANT: L'utilisateur doit sauvegarder cette clé, elle ne sera plus jamais affichée
    res.status(201).json({
      ...result.rows[0],
      api_key,
      api_key_warning: 'Sauvegardez cette clé API. Elle ne sera plus jamais affichée.',
    });
  } catch (error) {
    logger.error('Create site error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({ error: 'Erreur lors de la création du site', details: errorMessage });
  }
};

export const updateSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { site_name, club_name, location, sports, status, live_score_enabled } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (site_name !== undefined) {
      updates.push(`site_name = $${paramIndex}`);
      params.push(site_name);
      paramIndex++;
    }

    if (club_name !== undefined) {
      updates.push(`club_name = $${paramIndex}`);
      params.push(club_name);
      paramIndex++;
    }

    if (location !== undefined) {
      updates.push(`location = $${paramIndex}`);
      params.push(JSON.stringify(location));
      paramIndex++;
    }

    if (sports !== undefined) {
      updates.push(`sports = $${paramIndex}`);
      params.push(JSON.stringify(sports));
      paramIndex++;
    }

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (live_score_enabled !== undefined) {
      updates.push(`live_score_enabled = $${paramIndex}`);
      params.push(live_score_enabled);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    params.push(id);
    const sqlQuery = `UPDATE sites SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;

    const result = await query(sqlQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    logger.info('Site updated', { siteId: id, updatedBy: req.user?.email });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update site error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du site' });
  }
};

export const deleteSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query<{ site_name: string; [key: string]: unknown }>(
      'DELETE FROM sites WHERE id = $1 RETURNING site_name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const siteName = result.rows[0].site_name;
    logger.info('Site deleted', { siteId: id, siteName, deletedBy: req.user?.email });

    // Audit log
    auditService.logSiteDeleted(id, siteName, req);

    res.json({ message: 'Site supprimé avec succès' });
  } catch (error) {
    logger.error('Delete site error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du site' });
  }
};

export const regenerateApiKey = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const newApiKey = generateApiKey();
    const newApiKeyHash = await hashApiKey(newApiKey);

    const result = await query(
      'UPDATE sites SET api_key = $1, updated_at = NOW() WHERE id = $2 RETURNING id, site_name, club_name, status, updated_at',
      [newApiKeyHash, id] // Stocker le hash
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    logger.info('API key regenerated', { siteId: id, regeneratedBy: req.user?.email });

    // Audit log
    auditService.logApiKeyRegenerated(id, req);

    // Return the new plain API key only once
    // IMPORTANT: L'utilisateur doit sauvegarder cette clé, elle ne sera plus jamais affichée
    res.json({
      ...result.rows[0],
      api_key: newApiKey,
      api_key_warning: 'Sauvegardez cette clé API. Elle ne sera plus jamais affichée.',
    });
  } catch (error) {
    logger.error('Regenerate API key error:', error);
    res.status(500).json({ error: 'Erreur lors de la régénération de la clé API' });
  }
};

export const getSiteMetrics = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { hours = 24 } = req.query;

    const result = await query(
      `SELECT * FROM metrics
       WHERE site_id = $1
       AND recorded_at > NOW() - INTERVAL '${parseInt(hours as string)} hours'
       ORDER BY recorded_at DESC`,
      [id]
    );

    res.json({
      site_id: id,
      period_hours: hours,
      metrics: result.rows,
    });
  } catch (error) {
    logger.error('Get site metrics error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des métriques' });
  }
};

export const getSiteStats = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total_sites,
        COUNT(*) FILTER (WHERE status = 'online') as online,
        COUNT(*) FILTER (WHERE status = 'offline') as offline,
        COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance,
        COUNT(*) FILTER (WHERE status = 'error') as error
      FROM sites
    `);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get site stats error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
};

export const getAllSitesConnectionStatus = async (req: AuthRequest, res: Response) => {
  try {
    // Récupérer tous les sites avec leur dernier heartbeat
    const sitesResult = await query(`
      SELECT
        s.id,
        s.site_name,
        s.club_name,
        s.status,
        s.last_seen_at,
        s.local_ip
      FROM sites s
      ORDER BY s.site_name
    `);

    const socketService = (await import('../services/socket.service')).default;
    const connectedSiteIds = new Set(socketService.getConnectedSites());
    const now = new Date();

    const sitesWithStatus = (sitesResult.rows as Array<{
      id: string;
      site_name: string;
      club_name: string;
      status: string;
      last_seen_at: Date | null;
      local_ip: string | null;
    }>).map((site) => {
      const isConnectedNow = connectedSiteIds.has(site.id);
      const lastSeenAt = site.last_seen_at ? new Date(site.last_seen_at) : null;
      const secondsSinceLastSeen = lastSeenAt
        ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
        : null;

      let displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
      if (isConnectedNow) {
        displayStatus = 'online';
      } else if (secondsSinceLastSeen === null) {
        displayStatus = 'unknown';
      } else if (secondsSinceLastSeen < 120) {
        displayStatus = 'warning';
      } else {
        displayStatus = 'offline';
      }

      return {
        siteId: site.id,
        siteName: site.site_name,
        clubName: site.club_name,
        isConnected: isConnectedNow,
        displayStatus,
        lastSeenAt: site.last_seen_at,
        secondsSinceLastSeen,
        localIp: site.local_ip,
      };
    });

    // Calculer les stats globales
    const stats = {
      total: sitesWithStatus.length,
      online: sitesWithStatus.filter((s) => s.displayStatus === 'online').length,
      warning: sitesWithStatus.filter((s) => s.displayStatus === 'warning').length,
      offline: sitesWithStatus.filter((s) => s.displayStatus === 'offline').length,
      unknown: sitesWithStatus.filter((s) => s.displayStatus === 'unknown').length,
    };

    res.json({
      sites: sitesWithStatus,
      stats,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error('Get all sites connection status error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statuts de connexion' });
  }
};

/**
 * Endpoint de debug pour voir l'état interne des connexions WebSocket
 * GET /api/sites/debug/connections
 */
export const getConnectionsDebug = async (req: AuthRequest, res: Response) => {
  try {
    const socketService = (await import('../services/socket.service')).default;
    const debugInfo = socketService.getDebugInfo();

    // Ajouter les infos de la base de données pour comparaison
    const dbSitesResult = await query(`
      SELECT id, site_name, status, last_seen_at
      FROM sites
      WHERE status = 'online' OR last_seen_at > NOW() - INTERVAL '5 minutes'
      ORDER BY last_seen_at DESC
    `);

    res.json({
      socketService: debugInfo,
      databaseOnlineSites: dbSitesResult.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Get connections debug error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des infos de debug' });
  }
};

const validateCommandPayload = (command: string, data?: any) => {
  if (command === 'update_config') {
    const hasValidPayload = data && (
      data.configuration ||
      data.neoProContent ||
      (data.mode === 'update_agent' && data.agentFiles)
    );
    if (!hasValidPayload) {
      throw new HttpError(400, 'Commande update_config invalide: configuration, neoProContent ou agentFiles requis');
    }
  }
};

const ensureSiteConnected = async (siteId: string) => {
  const siteResult = await query('SELECT id, site_name, status FROM sites WHERE id = $1', [siteId]);
  if (siteResult.rows.length === 0) {
    throw new HttpError(404, 'Site non trouvé');
  }

  const socketService = (await import('../services/socket.service')).default;
  if (!socketService.isConnected(siteId)) {
    throw new HttpError(503, 'Site non connecté');
  }

  return { site: siteResult.rows[0], socketService };
};

const dispatchCommand = async (
  siteId: string,
  command: string,
  data: any,
  executedBy?: string
): Promise<{ commandId: string; siteName: string }> => {
  if (!command) {
    throw new HttpError(400, 'Commande requise');
  }

  validateCommandPayload(command, data);

  const { site, socketService } = await ensureSiteConnected(siteId);

  const commandId = uuidv4();
  await query(
    `INSERT INTO remote_commands (id, site_id, command_type, command_data, status, executed_by)
     VALUES ($1, $2, $3, $4, 'pending', $5)`,
    [commandId, siteId, command, data ? JSON.stringify(data) : null, executedBy]
  );

  const sent = socketService.sendCommand(siteId, {
    id: commandId,
    type: command,
    data: data || {},
  });

  if (!sent) {
    await query(
      `UPDATE remote_commands SET status = 'failed', error_message = 'Échec envoi' WHERE id = $1`,
      [commandId]
    );
    throw new HttpError(503, 'Échec de l\'envoi de la commande');
  }

  await query(
    `UPDATE remote_commands SET status = 'executing', executed_at = NOW() WHERE id = $1`,
    [commandId]
  );

  logger.info('Command sent to site', {
    siteId,
    siteName: site.site_name,
    command,
    commandId,
    sentBy: executedBy,
    hasPayload: !!data,
    payloadKeys: data ? Object.keys(data) : [],
  });

  return { commandId, siteName: site.site_name as string };
};

const waitForCommandResult = async (commandId: string, timeoutMs = 30000) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await query(
      `SELECT status, result, error_message FROM remote_commands WHERE id = $1`,
      [commandId]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0] as { status: string; result?: any; error_message?: string };

      if (row.status === 'completed') {
        const parsedResult = typeof row.result === 'string' ? JSON.parse(row.result) : row.result;
        return parsedResult || {};
      }

      if (row.status === 'failed') {
        throw new HttpError(500, row.error_message || 'Commande échouée');
      }
    }

    await wait(1000);
  }

  throw new HttpError(504, 'Timeout en attendant la réponse du boîtier');
};

export const sendCommand = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { command, params: data, queueIfOffline = true, priority, expiresIn } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'Commande requise' });
    }

    // Si la commande update_config arrive sans mode, forcer "replace" pour déployer la config centrale
    let normalizedData = data;
    if (command === 'update_config' && data && !data.mode && data.configuration) {
      normalizedData = { ...data, mode: 'replace' };
    }

    validateCommandPayload(command, normalizedData);

    // Vérifier que le site existe
    const siteResult = await query('SELECT id, site_name FROM sites WHERE id = $1', [id]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Utiliser sendOrQueue si queueIfOffline est activé (défaut)
    if (queueIfOffline) {
      const result = await commandQueueService.sendOrQueue(
        id,
        command,
        normalizedData || {},
        {
          userId: req.user?.id,
          priority: priority || 5,
          expiresIn: expiresIn,
          description: `${command} via dashboard`,
        }
      );

      logger.info('Command sent or queued', {
        siteId: id,
        command,
        sent: result.sent,
        queued: result.queued,
        commandId: result.commandId,
        sentBy: req.user?.email,
      });

      return res.json({
        success: result.sent || result.queued,
        sent: result.sent,
        queued: result.queued,
        commandId: result.commandId,
        message: result.message,
      });
    }

    // Mode legacy: requiert une connexion temps réel
    const { commandId } = await dispatchCommand(id, command, normalizedData, req.user?.id);

    res.json({ success: true, sent: true, queued: false, commandId, message: 'Commande envoyée' });
  } catch (error) {
    logger.error('Send command error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la commande' });
  }
};

export const getCommandStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id, commandId } = req.params;

    const result = await query(
      `SELECT * FROM remote_commands WHERE id = $1 AND site_id = $2`,
      [commandId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get command status error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du statut' });
  }
};

export const getSiteLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const lines = parseInt(req.query.lines as string, 10) || 100;
    const service = (req.query.service as string) || 'neopro-app';

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'get_logs', { lines, service }, req.user?.id)).commandId,
      30000
    );

    const logsText = (result?.logs as string) || '';
    res.json({ logs: logsText.split('\n') });
  } catch (error) {
    logger.error('Get site logs error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération des logs' });
  }
};

export const getSystemInfo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'get_system_info', {}, req.user?.id)).commandId,
      20000
    );

    if (!result?.systemInfo) {
      throw new HttpError(500, 'Réponse système invalide');
    }

    res.json(result.systemInfo);
  } catch (error) {
    logger.error('Get system info error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération des informations système' });
  }
};

export const getSiteConnectionStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Récupérer les infos du site
    const siteResult = await query(
      `SELECT id, site_name, club_name, status, last_seen_at, local_ip, last_config_sync
       FROM sites WHERE id = $1`,
      [id]
    );

    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const site = siteResult.rows[0] as {
      id: string;
      site_name: string;
      club_name: string;
      status: string;
      last_seen_at: Date | null;
      local_ip: string | null;
      last_config_sync: Date | null;
    };

    // Vérifier la connexion en temps réel via le socket
    const socketService = (await import('../services/socket.service')).default;
    const isConnectedNow = socketService.isConnected(id);

    // Calculer le temps depuis la dernière connexion
    const lastSeenAt = site.last_seen_at ? new Date(site.last_seen_at) : null;
    const now = new Date();
    const secondsSinceLastSeen = lastSeenAt
      ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
      : null;

    // Déterminer le statut d'affichage
    let displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
    if (isConnectedNow) {
      displayStatus = 'online';
    } else if (secondsSinceLastSeen === null) {
      displayStatus = 'unknown';
    } else if (secondsSinceLastSeen < 120) {
      // Moins de 2 minutes = probablement juste un petit délai
      displayStatus = 'warning';
    } else {
      displayStatus = 'offline';
    }

    // Récupérer les statistiques de connexion récentes (24h)
    const statsResult = await query(
      `SELECT
         COUNT(*) as heartbeat_count,
         MIN(recorded_at) as first_heartbeat,
         MAX(recorded_at) as last_heartbeat
       FROM metrics
       WHERE site_id = $1 AND recorded_at > NOW() - INTERVAL '24 hours'`,
      [id]
    );

    const stats = statsResult.rows[0] as {
      heartbeat_count: string;
      first_heartbeat: Date | null;
      last_heartbeat: Date | null;
    };

    const heartbeatCount24h = parseInt(stats?.heartbeat_count || '0', 10);
    // Uptime estimé: heartbeat toutes les 30s = 2880 max par 24h
    const uptime24h = Math.min(100, (heartbeatCount24h / 2880) * 100);

    res.json({
      siteId: id,
      siteName: site.site_name,
      clubName: site.club_name,
      connection: {
        isConnected: isConnectedNow,
        displayStatus,
        lastSeenAt: site.last_seen_at,
        secondsSinceLastSeen,
        localIp: site.local_ip,
      },
      sync: {
        lastConfigSync: site.last_config_sync,
      },
      statistics: {
        heartbeats24h: heartbeatCount24h,
        uptime24h: Math.round(uptime24h * 100) / 100,
        firstHeartbeat24h: stats?.first_heartbeat,
        lastHeartbeat24h: stats?.last_heartbeat,
      },
    });
  } catch (error) {
    logger.error('Get site connection status error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du statut de connexion' });
  }
};

export const getSiteLocalContent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, site_name, club_name, local_config_mirror, local_config_hash, last_config_sync
       FROM sites WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const site = result.rows[0];

    if (!site.local_config_mirror) {
      return res.json({
        siteId: id,
        siteName: site.site_name,
        clubName: site.club_name,
        hasContent: false,
        lastSync: null,
        configHash: null,
        configuration: null
      });
    }

    res.json({
      siteId: id,
      siteName: site.site_name,
      clubName: site.club_name,
      hasContent: true,
      lastSync: site.last_config_sync,
      configHash: site.local_config_hash,
      configuration: site.local_config_mirror
    });
  } catch (error) {
    logger.error('Get site local content error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du contenu local' });
  }
};

// ============================================================================
// Command Queue Endpoints
// ============================================================================

/**
 * Récupère les commandes en attente pour un site
 */
export const getPendingCommands = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Vérifier que le site existe
    const siteResult = await query('SELECT id, site_name, club_name FROM sites WHERE id = $1', [id]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const commands = await commandQueueService.getPendingCommands(id);

    res.json({
      siteId: id,
      siteName: siteResult.rows[0].site_name,
      clubName: siteResult.rows[0].club_name,
      pendingCount: commands.length,
      commands,
    });
  } catch (error) {
    logger.error('Get pending commands error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des commandes en attente' });
  }
};

/**
 * Annule une commande en attente
 */
export const cancelPendingCommand = async (req: AuthRequest, res: Response) => {
  try {
    const { id, commandId } = req.params;

    // Vérifier que la commande appartient bien à ce site
    const cmdResult = await query(
      'SELECT id FROM pending_commands WHERE id = $1 AND site_id = $2',
      [commandId, id]
    );

    if (cmdResult.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    const deleted = await commandQueueService.cancelPendingCommand(commandId);

    if (deleted) {
      logger.info('Pending command cancelled', { commandId, siteId: id, cancelledBy: req.user?.email });
      res.json({ success: true, message: 'Commande annulée' });
    } else {
      res.status(404).json({ error: 'Commande non trouvée' });
    }
  } catch (error) {
    logger.error('Cancel pending command error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation de la commande' });
  }
};

/**
 * Annule toutes les commandes en attente pour un site
 */
export const clearPendingCommands = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Vérifier que le site existe
    const siteResult = await query('SELECT id, site_name FROM sites WHERE id = $1', [id]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const count = await commandQueueService.clearPendingCommands(id);

    logger.info('All pending commands cleared', { siteId: id, count, clearedBy: req.user?.email });

    res.json({
      success: true,
      message: `${count} commande(s) annulée(s)`,
      count,
    });
  } catch (error) {
    logger.error('Clear pending commands error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation des commandes' });
  }
};

/**
 * Récupère le résumé global de la queue de commandes
 */
export const getQueueSummary = async (req: AuthRequest, res: Response) => {
  try {
    const summary = await commandQueueService.getQueueSummary();

    const totalPending = summary.reduce((acc, s) => acc + s.pending_count, 0);

    res.json({
      totalPending,
      sitesWithPendingCommands: summary.length,
      sites: summary,
    });
  } catch (error) {
    logger.error('Get queue summary error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du résumé de la queue' });
  }
};
