import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { AuthRequest, UserRole } from '../types';
import logger from '../config/logger';
import { auditService } from '../services/audit.service';
import { formatPaginatedResponse, PaginationParams } from '../middleware/pagination';
import { commandQueueService } from '../services/command-queue.service';
import { isAdmin } from '../middleware/auth';
import { getFtpPublicUrl, isFtpConfigured } from '../config/ftp-storage';
import { getPublicUrl } from '../config/supabase';
import { validateShellCommand, getAllowedCommandsForRole } from '../middleware/remote-shell-security';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Génère l'URL publique pour une vidéo.
 * Détecte automatiquement si le fichier est sur FTP ou Supabase
 * en fonction du format du storage_path.
 */
function getVideoDownloadUrl(storagePath: string): string {
  // Si le path est juste un filename (pas de /) → c'est un fichier FTP
  const isFtpPath = !storagePath.includes('/');

  if (isFtpPath && isFtpConfigured()) {
    return getFtpPublicUrl(storagePath);
  }

  // Sinon c'est un chemin Supabase (ex: uploads/filename.mp4)
  return getPublicUrl(storagePath);
}

const BCRYPT_ROUNDS = 10;

// Seuils de connexion (en secondes)
// Un site est considéré "online" si heartbeat reçu dans ce délai
const ONLINE_THRESHOLD_SECONDS = 90; // 1min30 (3 heartbeats manqués max)
// Un site passe en "warning" si heartbeat entre ONLINE et WARNING
const WARNING_THRESHOLD_SECONDS = 180; // 3 minutes
// Au-delà de WARNING_THRESHOLD = offline

const generateApiKey = (): string => {
  return randomBytes(32).toString('hex');
};

/**
 * Hash une API key avec SHA256 (déterministe, permet comparaison SQL directe)
 * Note: On utilise SHA256 au lieu de bcrypt car on doit pouvoir chercher par hash en SQL.
 * L'API key elle-même est générée avec 32 bytes random (256 bits d'entropie),
 * donc même si SHA256 n'est pas un "password hash", la sécurité reste excellente.
 */
export const hashApiKey = (apiKey: string): string => {
  return createHash('sha256').update(apiKey).digest('hex');
};

/**
 * Vérifie une API key contre son hash SHA256
 */
export const verifyApiKey = (apiKey: string, hash: string): boolean => {
  return hashApiKey(apiKey) === hash;
};

export const getSites = async (req: AuthRequest, res: Response) => {
  try {
    const { status, sport, region, search, subscription } = req.query;
    const pagination = req.pagination || { page: 1, limit: 20, offset: 0 };
    const userRole = req.user?.role || 'viewer';
    const userAgencyId = req.user?.agency_id;
    const userAdvertiserId = req.user?.advertiser_id ?? req.user?.sponsor_id;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    // Multi-tenant filtering based on user role
    if (userRole === 'agency') {
      if (userAgencyId) {
        // Agency users only see their assigned sites
        whereClause += ` AND s.id IN (SELECT site_id FROM agency_sites WHERE agency_id = $${paramIndex})`;
        params.push(userAgencyId);
        paramIndex++;
      } else {
        // Agency user without agency_id sees no sites
        whereClause += ` AND 1=0`;
      }
    } else if (userRole === 'advertiser' || userRole === 'sponsor') {
      if (userAdvertiserId) {
        // Advertiser users see sites where their videos are deployed
        // Videos are linked to advertisers via advertiser_videos table
        whereClause += ` AND s.id IN (
          SELECT DISTINCT cd.target_id FROM content_deployments cd
          JOIN advertiser_videos av ON av.video_id = cd.video_id
          WHERE av.advertiser_id = $${paramIndex} AND cd.target_type = 'site'
          UNION
          SELECT DISTINCT sg.site_id FROM site_groups sg
          JOIN content_deployments cd ON cd.target_id = sg.group_id AND cd.target_type = 'group'
          JOIN advertiser_videos av ON av.video_id = cd.video_id
          WHERE av.advertiser_id = $${paramIndex + 1}
        )`;
        params.push(userAdvertiserId, userAdvertiserId);
        paramIndex += 2;
      } else {
        // Advertiser user without advertiser_id sees no sites
        whereClause += ` AND 1=0`;
      }
    }
    // admin, super_admin, operator, viewer see all sites (no filter)

    if (status) {
      whereClause += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (sport) {
      whereClause += ` AND s.sports @> $${paramIndex}::jsonb`;
      params.push(JSON.stringify([sport]));
      paramIndex++;
    }

    if (region) {
      whereClause += ` AND s.location->>'region' = $${paramIndex}`;
      params.push(region);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (s.site_name ILIKE $${paramIndex} OR s.club_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filtre par statut d'abonnement
    if (subscription) {
      switch (subscription) {
        case 'active':
          // Actif: pas suspendu ET (pas de date de fin OU date de fin > aujourd'hui + 30 jours)
          whereClause += ` AND s.suspended = false AND (s.subscription_end IS NULL OR s.subscription_end > NOW() + INTERVAL '30 days')`;
          break;
        case 'expiring_soon':
          // Expire bientôt: pas suspendu ET date de fin dans les 30 prochains jours
          whereClause += ` AND s.suspended = false AND s.subscription_end IS NOT NULL AND s.subscription_end <= NOW() + INTERVAL '30 days' AND s.subscription_end > NOW()`;
          break;
        case 'grace_period':
          // Période de grâce: pas suspendu ET expiré depuis moins de 7 jours
          whereClause += ` AND s.suspended = false AND s.subscription_end IS NOT NULL AND s.subscription_end <= NOW() AND s.subscription_end > NOW() - INTERVAL '7 days'`;
          break;
        case 'suspended':
          // Suspendu manuellement
          whereClause += ` AND s.suspended = true`;
          break;
        case 'blocked':
          // Bloqué: expiré depuis plus de 7 jours (non suspendu manuellement)
          whereClause += ` AND s.suspended = false AND s.subscription_end IS NOT NULL AND s.subscription_end <= NOW() - INTERVAL '7 days'`;
          break;
        case 'trial':
          // En période d'essai
          whereClause += ` AND s.subscription_plan = 'trial' AND (s.subscription_end IS NULL OR s.subscription_end > NOW())`;
          break;
      }
    }

    // Requêtes paginée et count en parallèle
    const dataQuery = `SELECT s.* FROM sites s ${whereClause} ORDER BY s.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const countQuery = `SELECT COUNT(*) as count FROM sites s ${whereClause}`;

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
    const api_key_hash = hashApiKey(api_key);

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
    const newApiKeyHash = hashApiKey(newApiKey);

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
    // Récupérer tous les sites avec leur dernier heartbeat depuis la table metrics
    const sitesResult = await query(`
      SELECT
        s.id,
        s.status,
        s.last_seen_at,
        (SELECT recorded_at FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as last_metric_at
      FROM sites s
    `);

    const socketService = (await import('../services/socket.service')).default;
    const connectedSiteIds = new Set(socketService.getConnectedSites());
    const now = new Date();

    // Calculer les stats temps réel basées sur les connexions Socket.IO et les métriques récentes
    let online = 0;
    let offline = 0;
    let maintenance = 0;
    let error = 0;

    for (const site of sitesResult.rows as Array<{
      id: string;
      status: string;
      last_seen_at: Date | null;
      last_metric_at: Date | null;
    }>) {
      // Vérifier si connecté via Socket.IO
      const isConnectedNow = connectedSiteIds.has(site.id);

      // Utiliser le plus récent entre last_seen_at et last_metric_at
      const lastSeenFromSite = site.last_seen_at ? new Date(site.last_seen_at) : null;
      const lastSeenFromMetrics = site.last_metric_at ? new Date(site.last_metric_at) : null;

      let lastSeenAt: Date | null = null;
      if (lastSeenFromSite && lastSeenFromMetrics) {
        lastSeenAt = lastSeenFromSite > lastSeenFromMetrics ? lastSeenFromSite : lastSeenFromMetrics;
      } else {
        lastSeenAt = lastSeenFromSite || lastSeenFromMetrics;
      }

      const secondsSinceLastSeen = lastSeenAt
        ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
        : null;

      if (site.status === 'maintenance') {
        maintenance++;
      } else if (site.status === 'error') {
        error++;
      } else if (isConnectedNow || (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS)) {
        // Connecté via Socket.IO OU heartbeat reçu il y a moins d'1 minute
        online++;
      } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen < WARNING_THRESHOLD_SECONDS) {
        // Vu il y a moins de 2 minutes = warning (compté comme online)
        online++;
      } else {
        offline++;
      }
    }

    res.json({
      total_sites: sitesResult.rows.length,
      online,
      offline,
      maintenance,
      error,
    });
  } catch (err) {
    logger.error('Get site stats error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
};

export const getAllSitesConnectionStatus = async (req: AuthRequest, res: Response) => {
  try {
    // Récupérer tous les sites avec leur dernier heartbeat depuis la table metrics
    const sitesResult = await query(`
      SELECT
        s.id,
        s.site_name,
        s.club_name,
        s.status,
        s.last_seen_at,
        s.local_ip,
        (SELECT recorded_at FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as last_metric_at
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
      last_metric_at: Date | null;
    }>).map((site) => {
      const isConnectedNow = connectedSiteIds.has(site.id);

      // Utiliser le plus récent entre last_seen_at et last_metric_at
      const lastSeenFromSite = site.last_seen_at ? new Date(site.last_seen_at) : null;
      const lastSeenFromMetrics = site.last_metric_at ? new Date(site.last_metric_at) : null;

      let lastSeenAt: Date | null = null;
      if (lastSeenFromSite && lastSeenFromMetrics) {
        lastSeenAt = lastSeenFromSite > lastSeenFromMetrics ? lastSeenFromSite : lastSeenFromMetrics;
      } else {
        lastSeenAt = lastSeenFromSite || lastSeenFromMetrics;
      }

      const secondsSinceLastSeen = lastSeenAt
        ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
        : null;

      // Vérifier la santé de la connexion (détecte les connexions zombie)
      const connectionHealth = isConnectedNow ? socketService.getConnectionHealth(site.id) : null;
      const isHealthy = connectionHealth?.isHealthy ?? false;

      // Vérifier si c'est une vraie connexion zombie (socket morte mais flag actif)
      // Une connexion avec pong légèrement stale n'est PAS une zombie
      const isZombie = connectionHealth && !connectionHealth.socketConnected && connectionHealth.inMap;

      // Un site est "online" si connecté via Socket.IO, OU si heartbeat récent
      // On ne marque "warning" que pour les vraies connexions zombies
      let displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
      if (isConnectedNow && !isZombie) {
        // Connecté avec socket active = online (même si pong légèrement stale)
        displayStatus = 'online';
      } else if (isConnectedNow && isZombie) {
        // Connexion zombie : socket dans la map mais déconnectée = warning
        displayStatus = 'warning';
      } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS) {
        // Heartbeat reçu récemment = online
        displayStatus = 'online';
      } else if (secondsSinceLastSeen === null) {
        displayStatus = 'unknown';
      } else if (secondsSinceLastSeen < WARNING_THRESHOLD_SECONDS) {
        displayStatus = 'warning';
      } else {
        displayStatus = 'offline';
      }

      return {
        siteId: site.id,
        siteName: site.site_name,
        clubName: site.club_name,
        isConnected: isConnectedNow || (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS),
        displayStatus,
        lastSeenAt,
        secondsSinceLastSeen,
        localIp: site.local_ip,
        // Ajouter les infos de santé pour le debug
        health: connectionHealth ? {
          isHealthy: connectionHealth.isHealthy,
          reason: connectionHealth.reason,
        } : undefined,
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

  // Pour les commandes update_config, bloquer les sync_local_state pendant 60s
  // pour éviter qu'ils n'écrasent la config fraîchement déployée
  if (command === 'update_config') {
    await query(
      `UPDATE sites SET config_update_pending_until = NOW() + INTERVAL '60 seconds' WHERE id = $1`,
      [siteId]
    );
    logger.info('Config update pending lock set for 60s', { siteId, commandId });
  }

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
    // Si l'envoi échoue, lever le blocage
    if (command === 'update_config') {
      await query(`UPDATE sites SET config_update_pending_until = NULL WHERE id = $1`, [siteId]);
    }
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

    // Validation spéciale pour remote_shell
    if (command === 'remote_shell') {
      const userRole = req.user?.role as UserRole;

      // Vérifier que l'utilisateur a le droit d'utiliser le terminal
      if (!userRole || !['super_admin', 'superadmin', 'admin', 'operator'].includes(userRole)) {
        return res.status(403).json({
          error: 'Accès non autorisé au terminal distant',
          allowedCommands: [],
        });
      }

      // Valider la commande shell
      const shellCommand = data?.command;
      if (!shellCommand) {
        return res.status(400).json({ error: 'Commande shell requise (params.command)' });
      }

      const validation = validateShellCommand(shellCommand, userRole);
      if (!validation.valid) {
        logger.warn('Shell command blocked', {
          siteId: id,
          command: shellCommand.substring(0, 100),
          reason: validation.reason,
          user: req.user?.email,
          role: userRole,
        });

        // Audit log pour tentative bloquée
        auditService.log({
          action: 'REMOTE_SHELL_BLOCKED',
          userId: req.user?.id,
          targetType: 'site',
          targetId: id,
          details: {
            command: shellCommand.substring(0, 200),
            reason: validation.reason,
          },
        }, req);

        return res.status(403).json({
          error: validation.reason,
          allowedCommands: getAllowedCommandsForRole(userRole),
        });
      }

      // Audit log pour commande shell exécutée
      auditService.log({
        action: 'REMOTE_SHELL_EXECUTE',
        userId: req.user?.id,
        targetType: 'site',
        targetId: id,
        details: {
          command: validation.sanitizedCommand?.substring(0, 500),
        },
      }, req);

      // Les commandes shell ne doivent pas être mises en queue (besoin de connexion temps réel)
      // Forcer queueIfOffline = false pour remote_shell
      const socketService = (await import('../services/socket.service')).default;
      if (!socketService.isConnected(id)) {
        return res.status(503).json({
          error: 'Le site n\'est pas connecté. Le terminal distant nécessite une connexion active.',
        });
      }

      // Envoyer la commande avec la commande sanitizée
      const normalizedShellData = {
        ...data,
        command: validation.sanitizedCommand,
      };

      const { commandId } = await dispatchCommand(id, command, normalizedShellData, req.user?.id);

      // Retourner immédiatement le commandId - le résultat sera envoyé via WebSocket (command_completed)
      // Cela évite les timeouts 504 sur Railway Gateway (60s max)
      return res.status(202).json({
        success: true,
        commandId,
        status: 'pending',
        message: 'Commande envoyée. Le résultat sera reçu via WebSocket (événement command_completed).',
      });
    }

    // Si la commande update_config arrive avec "configuration", convertir en "neoProContent"
    // Le sync-agent attend neoProContent pour le merge intelligent
    let normalizedData = data;
    if (command === 'update_config' && data && data.configuration) {
      // Convertir { configuration, mode? } en { neoProContent, mode }
      const mode = data.mode || 'merge'; // Par défaut "merge" pour préserver le contenu local
      normalizedData = { ...data, neoProContent: data.configuration, mode };
      delete normalizedData.configuration;
      logger.info('update_config: converted configuration to neoProContent', { siteId: id, mode });
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

    logger.info('Getting logs for site', { siteId: id, service, lines });

    const { commandId } = await dispatchCommand(id, 'get_logs', { lines, service }, req.user?.id);
    logger.info('Command dispatched', { commandId, siteId: id });

    const result = await waitForCommandResult(commandId, 30000);
    logger.info('Command result received', { commandId, hasLogs: !!result?.logs, resultKeys: Object.keys(result || {}) });

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

export const getHotspotConfig = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'get_hotspot_config', {}, req.user?.id)).commandId,
      15000
    );

    res.json(result);
  } catch (error) {
    logger.error('Get hotspot config error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération de la configuration hotspot' });
  }
};

export const getHealthStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'get_health_status', {}, req.user?.id)).commandId,
      30000
    );

    res.json(result);
  } catch (error) {
    logger.error('Get health status error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'état de santé' });
  }
};

export const runDiagnostics = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'run_diagnostics', {}, req.user?.id)).commandId,
      60000 // 60 secondes pour les diagnostics complets
    );

    res.json(result);
  } catch (error) {
    logger.error('Run diagnostics error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de l\'exécution des diagnostics' });
  }
};

export const getNetworkDiagnostics = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'network_diagnostics', {}, req.user?.id)).commandId,
      30000 // 30 secondes pour les diagnostics réseau
    );

    res.json(result);
  } catch (error) {
    logger.error('Network diagnostics error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors des diagnostics réseau' });
  }
};

export const fixHotspot = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { autoFix = false } = req.body;

    logger.info('Fixing hotspot', { siteId: id, autoFix });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'fix_hotspot', { autoFix }, req.user?.id)).commandId,
      120000 // 2 minutes pour le scan des canaux WiFi
    );

    res.json(result);
  } catch (error) {
    logger.error('Fix hotspot error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la réparation du hotspot' });
  }
};

export const getWifiBssidStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Getting WiFi BSSID status', { siteId: id });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'get_wifi_bssid_status', {}, req.user?.id)).commandId,
      30000 // 30 secondes pour le scan
    );

    res.json(result);
  } catch (error) {
    logger.error('Get WiFi BSSID status error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération du statut WiFi BSSID' });
  }
};

export const removeBssidLock = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Removing BSSID lock', { siteId: id });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'remove_bssid_lock', {}, req.user?.id)).commandId,
      30000
    );

    res.json(result);
  } catch (error) {
    logger.error('Remove BSSID lock error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la suppression du verrouillage BSSID' });
  }
};

export const optimizeForMesh = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Optimizing for mesh WiFi', { siteId: id });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'optimize_for_mesh', {}, req.user?.id)).commandId,
      30000
    );

    res.json(result);
  } catch (error) {
    logger.error('Optimize for mesh error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de l\'optimisation pour mesh' });
  }
};

export const exportDebugBundle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Exporting debug bundle', { siteId: id });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'export_debug_bundle', {}, req.user?.id)).commandId,
      60000 // 60 secondes pour collecter toutes les données
    );

    res.json(result);
  } catch (error) {
    logger.error('Export debug bundle error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de l\'export du bundle de debug' });
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

    // Récupérer le dernier heartbeat depuis la table metrics (source de vérité)
    const lastMetricResult = await query(
      `SELECT recorded_at FROM metrics WHERE site_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [id]
    );
    const lastMetricAt = lastMetricResult.rows[0]?.recorded_at as Date | null;

    // Utiliser le plus récent entre last_seen_at (Socket.IO) et last_metric (table metrics)
    const lastSeenFromSite = site.last_seen_at ? new Date(site.last_seen_at) : null;
    const lastSeenFromMetrics = lastMetricAt ? new Date(lastMetricAt) : null;

    // Prendre le plus récent des deux
    let lastSeenAt: Date | null = null;
    if (lastSeenFromSite && lastSeenFromMetrics) {
      lastSeenAt = lastSeenFromSite > lastSeenFromMetrics ? lastSeenFromSite : lastSeenFromMetrics;
    } else {
      lastSeenAt = lastSeenFromSite || lastSeenFromMetrics;
    }

    const now = new Date();
    const secondsSinceLastSeen = lastSeenAt
      ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
      : null;

    // Déterminer le statut d'affichage
    // Un site est "online" si connecté via Socket.IO OU si on a reçu un heartbeat récemment
    let displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
    if (isConnectedNow) {
      displayStatus = 'online';
    } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS) {
      // Heartbeat reçu récemment = online (même sans Socket.IO direct)
      displayStatus = 'online';
    } else if (secondsSinceLastSeen === null) {
      displayStatus = 'unknown';
    } else if (secondsSinceLastSeen < WARNING_THRESHOLD_SECONDS) {
      // Heartbeat pas trop ancien = warning
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

    // Un site est considéré "connecté" si Socket.IO actif OU heartbeat récent
    const isEffectivelyConnected = isConnectedNow || (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS);

    // Récupérer l'état de santé détaillé de la connexion WebSocket
    const connectionHealth = socketService.getConnectionHealth(id);

    res.json({
      siteId: id,
      siteName: site.site_name,
      clubName: site.club_name,
      connection: {
        isConnected: isEffectivelyConnected,
        displayStatus,
        lastSeenAt,
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
      // Nouvel objet health pour détecter les connexions zombies
      health: {
        socketInMap: connectionHealth.inMap,
        socketConnected: connectionHealth.socketConnected,
        lastPongAgeMs: connectionHealth.lastPongAgeMs,
        isHealthy: connectionHealth.isHealthy,
        reason: connectionHealth.reason,
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

    // Récupérer le site et les vidéos cloud en parallèle
    const [siteResult, cloudVideosResult] = await Promise.all([
      query(
        `SELECT id, site_name, club_name, local_config_mirror, local_config_hash, last_config_sync
         FROM sites WHERE id = $1`,
        [id]
      ),
      query(
        `SELECT
           v.id,
           v.filename,
           v.original_name,
           v.category,
           v.subcategory,
           v.file_size,
           v.duration,
           v.checksum,
           v.storage_path,
           v.created_at,
           v.updated_at,
           v.metadata
         FROM videos v
         ORDER BY v.created_at DESC
         LIMIT 500`,
        []
      )
    ]);

    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const site = siteResult.rows[0];

    // Formatter les vidéos cloud
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cloudVideos = cloudVideosResult.rows.map((v: any) => ({
      id: v.id,
      filename: v.filename,
      originalName: v.original_name,
      title: v.metadata?.title || v.original_name || v.filename,
      category: v.category,
      subcategory: v.subcategory,
      size: v.file_size,
      duration: v.duration,
      checksum: v.checksum,
      url: v.storage_path ? getVideoDownloadUrl(v.storage_path) : null,
      createdAt: v.created_at,
      updatedAt: v.updated_at
    }));

    if (!site.local_config_mirror) {
      return res.json({
        siteId: id,
        siteName: site.site_name,
        clubName: site.club_name,
        hasContent: false,
        lastSync: null,
        configHash: null,
        configuration: null,
        localVideos: [],
        cloudVideos,
        localStorage: null,
        lastVideoSync: null,
        hotspotInfo: null
      });
    }

    // Type the config as any to access dynamic properties
    const config = site.local_config_mirror as Record<string, unknown>;

    // Extraire les vidéos, le stockage et les infos hotspot depuis la config enrichie
    const localVideos = (config._localVideos as Array<unknown>) || [];
    const localStorage = config._localStorage || null;
    const lastVideoSync = (config._lastVideoSync as string) || null;
    const hotspotInfo = config._hotspotInfo || null;

    // Retourner la config sans les champs internes (_prefixés)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _localVideos, _localStorage, _lastVideoSync, _hotspotSsid, _hotspotInfo, ...cleanConfig } = config;

    res.json({
      siteId: id,
      siteName: site.site_name,
      clubName: site.club_name,
      hasContent: true,
      lastSync: site.last_config_sync,
      configHash: site.local_config_hash,
      configuration: cleanConfig,
      localVideos,
      cloudVideos,
      localStorage,
      lastVideoSync,
      hotspotInfo
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

/**
 * Endpoint agrégé qui combine connection status + metrics en une seule requête
 * Optimise le nombre d'appels API pour le dashboard temps réel
 */
export const getSiteDashboardData = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { hours = 24 } = req.query;

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

    // Récupérer les métriques (inclut aussi le last_heartbeat)
    const metricsResult = await query(
      `SELECT * FROM metrics
       WHERE site_id = $1
       AND recorded_at > NOW() - INTERVAL '${parseInt(hours as string)} hours'
       ORDER BY recorded_at DESC`,
      [id]
    );

    const lastMetricAt = metricsResult.rows[0]?.recorded_at as Date | null;

    // Utiliser le plus récent entre last_seen_at (Socket.IO) et last_metric (table metrics)
    const lastSeenFromSite = site.last_seen_at ? new Date(site.last_seen_at) : null;
    const lastSeenFromMetrics = lastMetricAt ? new Date(lastMetricAt) : null;

    let lastSeenAt: Date | null = null;
    if (lastSeenFromSite && lastSeenFromMetrics) {
      lastSeenAt = lastSeenFromSite > lastSeenFromMetrics ? lastSeenFromSite : lastSeenFromMetrics;
    } else {
      lastSeenAt = lastSeenFromSite || lastSeenFromMetrics;
    }

    const now = new Date();
    const secondsSinceLastSeen = lastSeenAt
      ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
      : null;

    // Déterminer le statut d'affichage
    let displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
    if (isConnectedNow) {
      displayStatus = 'online';
    } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS) {
      displayStatus = 'online';
    } else if (secondsSinceLastSeen === null) {
      displayStatus = 'unknown';
    } else if (secondsSinceLastSeen < WARNING_THRESHOLD_SECONDS) {
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

    const stats = statsResult.rows[0];

    // Récupérer l'état de santé détaillé de la connexion WebSocket
    const connectionHealth = socketService.getConnectionHealth(id);

    // Réponse combinée
    res.json({
      site: {
        id: site.id,
        site_name: site.site_name,
        club_name: site.club_name,
      },
      connection: {
        isConnected: isConnectedNow || (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS),
        status: displayStatus,
        lastSeenAt,
        secondsSinceLastSeen,
        localIp: site.local_ip,
        lastConfigSync: site.last_config_sync,
        heartbeat_24h: {
          count: parseInt(stats.heartbeat_count as string),
          firstAt: stats.first_heartbeat,
          lastAt: stats.last_heartbeat,
        },
      },
      // Nouvel objet health pour détecter les connexions zombies
      health: {
        socketInMap: connectionHealth.inMap,
        socketConnected: connectionHealth.socketConnected,
        lastPongAgeMs: connectionHealth.lastPongAgeMs,
        isHealthy: connectionHealth.isHealthy,
        reason: connectionHealth.reason,
      },
      metrics: {
        period_hours: hours,
        data: metricsResult.rows,
      },
    });
  } catch (error) {
    logger.error('Get site dashboard data error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données du dashboard' });
  }
};

/**
 * Récupère la timeline des événements récents pour un site
 * Agrège: déploiements, commandes, alertes, changements de config
 * Utile pour le debugging et le suivi d'activité
 */
export const getSiteTimeline = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;
    const maxLimit = Math.min(parseInt(limit as string, 10), 50);

    // Vérifier que le site existe
    const siteResult = await query(
      `SELECT id, site_name FROM sites WHERE id = $1`,
      [id]
    );

    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Récupérer les événements de plusieurs sources et les combiner
    const [deploymentsResult, commandsResult, configHistoryResult, alertsResult] = await Promise.all([
      // 1. Derniers déploiements vers ce site
      query(
        `SELECT
           'deployment' as event_type,
           cd.id,
           cd.created_at as timestamp,
           cd.status,
           v.filename as video_name,
           v.category,
           cd.progress,
           cd.error_message,
           u.email as user_email
         FROM content_deployments cd
         LEFT JOIN videos v ON cd.video_id = v.id
         LEFT JOIN users u ON cd.deployed_by = u.id
         WHERE cd.target_id = $1 AND cd.target_type = 'site'
         ORDER BY cd.created_at DESC
         LIMIT $2`,
        [id, maxLimit]
      ),
      // 2. Dernières commandes envoyées
      query(
        `SELECT
           'command' as event_type,
           rc.id,
           rc.created_at as timestamp,
           rc.command_type,
           rc.status,
           rc.result,
           u.email as user_email
         FROM remote_commands rc
         LEFT JOIN users u ON rc.executed_by = u.id
         WHERE rc.site_id = $1
         ORDER BY rc.created_at DESC
         LIMIT $2`,
        [id, maxLimit]
      ),
      // 3. Historique des configurations
      query(
        `SELECT
           'config' as event_type,
           ch.id,
           ch.deployed_at as timestamp,
           ch.comment,
           ch.changes_summary,
           u.email as user_email
         FROM config_history ch
         LEFT JOIN users u ON ch.deployed_by = u.id
         WHERE ch.site_id = $1
         ORDER BY ch.deployed_at DESC
         LIMIT $2`,
        [id, maxLimit]
      ),
      // 4. Alertes récentes
      query(
        `SELECT
           'alert' as event_type,
           a.id,
           a.created_at as timestamp,
           a.alert_type,
           a.severity,
           a.message,
           a.status = 'resolved' as resolved,
           a.resolved_at
         FROM alerts a
         WHERE a.site_id = $1
         ORDER BY a.created_at DESC
         LIMIT $2`,
        [id, maxLimit]
      ),
    ]);

    // Types pour les résultats de requêtes
    interface DeploymentRow {
      id: string;
      timestamp: string;
      status: string;
      video_name: string | null;
      category: string | null;
      progress: number | null;
      error_message: string | null;
      user_email: string | null;
    }
    interface CommandRow {
      id: string;
      timestamp: string;
      command_type: string;
      status: string;
      result: unknown;
      user_email: string | null;
    }
    interface ConfigRow {
      id: string;
      timestamp: string;
      comment: string | null;
      changes_summary: unknown[];
      user_email: string | null;
    }
    interface AlertRow {
      id: string;
      timestamp: string;
      alert_type: string;
      severity: string;
      message: string | null;
      resolved: boolean;
      resolved_at: string | null;
    }

    // Transformer les résultats en événements uniformes
    const events: Array<{
      id: string;
      type: string;
      timestamp: string;
      title: string;
      details: Record<string, unknown>;
      status?: string;
      user?: string;
    }> = [];

    // Déploiements
    for (const row of deploymentsResult.rows as unknown as DeploymentRow[]) {
      events.push({
        id: row.id,
        type: 'deployment',
        timestamp: row.timestamp,
        title: `Déploiement: ${row.video_name || 'Vidéo'}`,
        details: {
          category: row.category,
          progress: row.progress,
          error: row.error_message,
        },
        status: row.status,
        user: row.user_email || undefined,
      });
    }

    // Commandes
    for (const row of commandsResult.rows as unknown as CommandRow[]) {
      events.push({
        id: row.id,
        type: 'command',
        timestamp: row.timestamp,
        title: `Commande: ${row.command_type}`,
        details: {
          result: row.result,
        },
        status: row.status,
        user: row.user_email || undefined,
      });
    }

    // Configs
    for (const row of configHistoryResult.rows as unknown as ConfigRow[]) {
      const changesCount = Array.isArray(row.changes_summary)
        ? row.changes_summary.length
        : 0;
      events.push({
        id: row.id,
        type: 'config',
        timestamp: row.timestamp,
        title: row.comment || 'Mise à jour configuration',
        details: {
          changesCount,
        },
        status: 'completed',
        user: row.user_email || undefined,
      });
    }

    // Alertes
    for (const row of alertsResult.rows as unknown as AlertRow[]) {
      events.push({
        id: row.id,
        type: 'alert',
        timestamp: row.timestamp,
        title: row.message || `Alerte: ${row.alert_type}`,
        details: {
          alertType: row.alert_type,
          severity: row.severity,
          resolved: row.resolved,
          resolvedAt: row.resolved_at,
        },
        status: row.resolved ? 'resolved' : 'active',
      });
    }

    // Trier par timestamp décroissant et limiter
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limitedEvents = events.slice(0, maxLimit);

    res.json({
      siteId: id,
      siteName: (siteResult.rows[0] as { site_name: string }).site_name,
      events: limitedEvents,
      counts: {
        deployments: deploymentsResult.rowCount,
        commands: commandsResult.rowCount,
        configs: configHistoryResult.rowCount,
        alerts: alertsResult.rowCount,
      },
    });
  } catch (error) {
    logger.error('Get site timeline error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la timeline' });
  }
};

/**
 * Get fleet health data for the admin dashboard
 * Aggregates connection status, metrics, versions, and at-risk sites
 */
export const getFleetHealthData = async (req: AuthRequest, res: Response) => {
  try {
    // 1. Get all sites with their connection status, location, version, and latest metrics
    const sitesResult = await query(`
      SELECT
        s.id,
        s.site_name,
        s.club_name,
        s.status,
        s.last_seen_at,
        s.local_ip,
        s.software_version,
        s.location,
        (SELECT recorded_at FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as last_metric_at,
        (SELECT cpu_percent FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as cpu_percent,
        (SELECT memory_percent FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as memory_percent,
        (SELECT temperature FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as temperature,
        (SELECT disk_percent FROM metrics WHERE site_id = s.id ORDER BY recorded_at DESC LIMIT 1) as disk_percent
      FROM sites s
      ORDER BY s.site_name
    `);

    const socketService = (await import('../services/socket.service')).default;
    const connectedSiteIds = new Set(socketService.getConnectedSites());
    const now = new Date();

    // Process sites
    interface SiteRow {
      id: string;
      site_name: string;
      club_name: string;
      status: string;
      last_seen_at: Date | null;
      local_ip: string | null;
      software_version: string | null;
      location: { city?: string; region?: string; lat?: number; lng?: number } | null;
      last_metric_at: Date | null;
      cpu_percent: number | null;
      memory_percent: number | null;
      temperature: number | null;
      disk_percent: number | null;
    }

    const sites = (sitesResult.rows as unknown as SiteRow[]).map((site) => {
      const isConnectedNow = connectedSiteIds.has(site.id);
      const lastSeenFromSite = site.last_seen_at ? new Date(site.last_seen_at) : null;
      const lastSeenFromMetrics = site.last_metric_at ? new Date(site.last_metric_at) : null;

      let lastSeenAt: Date | null = null;
      if (lastSeenFromSite && lastSeenFromMetrics) {
        lastSeenAt = lastSeenFromSite > lastSeenFromMetrics ? lastSeenFromSite : lastSeenFromMetrics;
      } else {
        lastSeenAt = lastSeenFromSite || lastSeenFromMetrics;
      }

      const secondsSinceLastSeen = lastSeenAt
        ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
        : null;

      const connectionHealth = isConnectedNow ? socketService.getConnectionHealth(site.id) : null;
      const isHealthy = connectionHealth?.isHealthy ?? false;

      let displayStatus: 'online' | 'offline' | 'warning' | 'unknown';
      if (isConnectedNow && isHealthy) {
        displayStatus = 'online';
      } else if (isConnectedNow && !isHealthy) {
        displayStatus = 'warning';
      } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen < ONLINE_THRESHOLD_SECONDS) {
        displayStatus = 'online';
      } else if (secondsSinceLastSeen === null) {
        displayStatus = 'unknown';
      } else if (secondsSinceLastSeen < WARNING_THRESHOLD_SECONDS) {
        displayStatus = 'warning';
      } else {
        displayStatus = 'offline';
      }

      return {
        id: site.id,
        siteName: site.site_name,
        clubName: site.club_name,
        displayStatus,
        lastSeenAt,
        secondsSinceLastSeen,
        localIp: site.local_ip,
        softwareVersion: site.software_version,
        location: site.location,
        metrics: {
          cpu_percent: site.cpu_percent,
          memory_percent: site.memory_percent,
          temperature: site.temperature,
          disk_percent: site.disk_percent,
        },
      };
    });

    // 2. Calculate stats
    const stats = {
      total: sites.length,
      online: sites.filter((s) => s.displayStatus === 'online').length,
      warning: sites.filter((s) => s.displayStatus === 'warning').length,
      offline: sites.filter((s) => s.displayStatus === 'offline').length,
      unknown: sites.filter((s) => s.displayStatus === 'unknown').length,
    };

    // 3. Calculate health metrics
    let totalCpu = 0, totalMemory = 0, totalTemp = 0, sitesWithMetrics = 0;
    let sitesHighTemp = 0, sitesLowDisk = 0;

    for (const site of sites) {
      if (site.metrics.cpu_percent !== null) {
        totalCpu += site.metrics.cpu_percent;
        sitesWithMetrics++;
      }
      if (site.metrics.memory_percent !== null) {
        totalMemory += site.metrics.memory_percent;
      }
      if (site.metrics.temperature !== null) {
        totalTemp += site.metrics.temperature;
        if (site.metrics.temperature > 75) sitesHighTemp++;
      }
      if (site.metrics.disk_percent !== null && site.metrics.disk_percent > 90) {
        sitesLowDisk++;
      }
    }

    const health = {
      avg_cpu: sitesWithMetrics > 0 ? totalCpu / sitesWithMetrics : 0,
      avg_memory: sitesWithMetrics > 0 ? totalMemory / sitesWithMetrics : 0,
      avg_temperature: sitesWithMetrics > 0 ? totalTemp / sitesWithMetrics : 0,
      sites_high_temp: sitesHighTemp,
      sites_low_disk: sitesLowDisk,
    };

    // 4. Version distribution
    const versionCounts: Record<string, number> = {};
    for (const site of sites) {
      const version = site.softwareVersion || 'Inconnue';
      versionCounts[version] = (versionCounts[version] || 0) + 1;
    }
    const versionDistribution = Object.entries(versionCounts)
      .map(([version, count]) => ({
        version,
        count,
        percentage: (count / (sites.length || 1)) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 5. Sites by region
    const regionCounts: Record<string, { total: number; online: number }> = {};
    for (const site of sites) {
      const region = site.location?.region || 'Non définie';
      if (!regionCounts[region]) {
        regionCounts[region] = { total: 0, online: 0 };
      }
      regionCounts[region].total++;
      if (site.displayStatus === 'online') {
        regionCounts[region].online++;
      }
    }
    const sitesByRegion = Object.entries(regionCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // 6. At-risk sites
    const atRiskSites = sites.filter((site) => {
      // Offline for more than 1 hour
      if (site.displayStatus === 'offline' && site.secondsSinceLastSeen && site.secondsSinceLastSeen > 3600) {
        return true;
      }
      // High temperature
      if (site.metrics.temperature && site.metrics.temperature > 75) {
        return true;
      }
      // High CPU
      if (site.metrics.cpu_percent && site.metrics.cpu_percent > 90) {
        return true;
      }
      // Low disk
      if (site.metrics.disk_percent && site.metrics.disk_percent > 90) {
        return true;
      }
      // Warning status
      if (site.displayStatus === 'warning') {
        return true;
      }
      return false;
    }).slice(0, 10);

    res.json({
      sites,
      stats,
      health,
      versionDistribution,
      sitesByRegion,
      atRiskSites,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error('Get fleet health data error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données de santé de la flotte' });
  }
};

/**
 * Get match history for a specific site
 * Returns recent matches with audience estimates, videos played, and duration
 */
export const getSiteMatchHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Verify site exists
    const siteResult = await query(
      'SELECT id, site_name, club_name FROM sites WHERE id = $1',
      [id]
    );
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Get match history from club_sessions
    // Only sessions with match_name OR audience_estimate are considered "matches"
    interface MatchRow {
      id: string;
      started_at: Date;
      ended_at: Date | null;
      duration_seconds: number | null;
      videos_played: number;
      manual_triggers: number;
      auto_plays: number;
      match_date: Date | null;
      match_name: string | null;
      audience_estimate: number | null;
    }

    const matchesResult = await query(
      `SELECT
        id,
        started_at,
        ended_at,
        duration_seconds,
        videos_played,
        manual_triggers,
        auto_plays,
        match_date,
        match_name,
        audience_estimate
      FROM club_sessions
      WHERE site_id = $1
        AND (match_name IS NOT NULL OR audience_estimate IS NOT NULL)
      ORDER BY COALESCE(match_date, started_at::date) DESC, started_at DESC
      LIMIT $2`,
      [id, limit]
    );

    // Get aggregate stats
    interface StatsRow {
      total_matches: string;
      total_audience: string;
      avg_audience: string;
      total_videos: string;
      total_duration: string;
    }

    const statsResult = await query(
      `SELECT
        COUNT(*) as total_matches,
        COALESCE(SUM(audience_estimate), 0) as total_audience,
        COALESCE(AVG(audience_estimate) FILTER (WHERE audience_estimate IS NOT NULL), 0) as avg_audience,
        COALESCE(SUM(videos_played), 0) as total_videos,
        COALESCE(SUM(duration_seconds), 0) as total_duration
      FROM club_sessions
      WHERE site_id = $1
        AND (match_name IS NOT NULL OR audience_estimate IS NOT NULL)`,
      [id]
    );

    const stats = statsResult.rows[0] as unknown as StatsRow;

    const matches = (matchesResult.rows as unknown as MatchRow[]).map((m) => ({
      id: m.id,
      matchDate: m.match_date || m.started_at,
      matchName: m.match_name || 'Match non nommé',
      audienceEstimate: m.audience_estimate,
      startedAt: m.started_at,
      endedAt: m.ended_at,
      durationMinutes: m.duration_seconds ? Math.round(m.duration_seconds / 60) : null,
      videosPlayed: m.videos_played,
      manualTriggers: m.manual_triggers,
      autoPlays: m.auto_plays,
    }));

    res.json({
      siteId: id,
      siteName: (siteResult.rows[0] as { site_name: string }).site_name,
      clubName: (siteResult.rows[0] as { club_name: string }).club_name,
      matches,
      stats: {
        totalMatches: parseInt(stats.total_matches),
        totalAudience: parseInt(stats.total_audience),
        avgAudience: Math.round(parseFloat(stats.avg_audience)),
        totalVideos: parseInt(stats.total_videos),
        totalDurationHours: Math.round(parseInt(stats.total_duration) / 3600),
      },
    });
  } catch (error) {
    logger.error('Get site match history error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique des matchs' });
  }
};
