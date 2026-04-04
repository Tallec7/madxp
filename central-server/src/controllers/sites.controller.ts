import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes, createHash } from 'crypto';
import { AuthRequest, UserRole } from '../types';
import logger from '../config/logger';
import { auditService } from '../services/audit.service';
import { formatPaginatedResponse } from '../middleware/pagination';
import { commandQueueService } from '../services/command-queue.service';
import { deriveHostnameSlug, deriveHostnameWithSuffix } from '../utils/hostname';
import {
  siteRepository,
  configProfileRepository,
  type ExtendedSiteFilters,
  type SubscriptionFilter,
  type UpdateSiteInput,
} from '../repositories';

// ============================================================================
// Helpers & Constants
// ============================================================================

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Seuils de connexion (en secondes)
// Un site est considéré "online" si heartbeat reçu dans ce délai
export const ONLINE_THRESHOLD_SECONDS = 90; // 1min30 (3 heartbeats manqués max)
// Un site passe en "warning" si heartbeat entre ONLINE et WARNING
export const WARNING_THRESHOLD_SECONDS = 180; // 3 minutes
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

// ============================================================================
// Core CRUD
// ============================================================================

export const getSites = async (req: AuthRequest, res: Response) => {
  try {
    const { status, sport, region, search, subscription } = req.query;
    const pagination = req.pagination || { page: 1, limit: 20, offset: 0 };
    const userRole = req.user?.role || 'viewer';
    const userAgencyId = req.user?.agency_id;
    const userAdvertiserId = req.user?.advertiser_id ?? req.user?.sponsor_id;

    const filters: ExtendedSiteFilters = {
      status: status as ExtendedSiteFilters['status'],
      sport: sport as string,
      region: region as string,
      search: search as string,
      subscription: subscription as SubscriptionFilter,
      userContext: {
        role: userRole as UserRole,
        agencyId: userAgencyId,
        advertiserId: userAdvertiserId,
      },
    };

    const { rows, total } = await siteRepository.findAllWithFilters(filters, {
      limit: pagination.limit,
      offset: pagination.offset,
    });

    res.json(formatPaginatedResponse(rows, total, pagination));
  } catch (error) {
    logger.error('Get sites error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des sites' });
  }
};

export const getSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const site = await siteRepository.findById(id);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    res.json(site);
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
    const existingRows = await siteRepository.findNameDuplicates(site_name);

    if (existingRows.length > 0) {
      // Find the highest suffix number
      let maxSuffix = 0;
      for (const row of existingRows) {
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

    const site = await siteRepository.create({
      id,
      siteName: uniqueSiteName,
      clubName: club_name,
      location,
      sports,
      hardwareModel: hardware_model || 'Unknown',
      apiKeyHash: api_key_hash,
    });

    // Derive hostname from club_name
    try {
      const baseHostname = deriveHostnameSlug(club_name);
      const existingHostnames = await siteRepository.findExistingHostnames();
      const hostname = deriveHostnameWithSuffix(baseHostname, existingHostnames);
      await siteRepository.updateHostnameSlug(id, hostname);
      logger.info('Hostname slug assigned', { siteId: id, hostname });
    } catch (hostnameError) {
      logger.warn('Failed to assign hostname slug (non-blocking)', {
        siteId: id,
        error: hostnameError instanceof Error ? hostnameError.message : String(hostnameError),
      });
    }

    logger.info('Site created', { siteId: id, siteName: uniqueSiteName, createdBy: req.user?.email });

    // Auto-creer un profil de configuration par defaut
    try {
      await configProfileRepository.create({
        siteId: id,
        name: 'Par defaut',
        displayName: club_name,
        city: location?.city || undefined,
        sport: Array.isArray(sports) && sports.length > 0 ? sports[0] : undefined,
        isDefault: true,
        configuration: {},
        createdBy: req.user?.id,
      });
      logger.info('Default config profile created', { siteId: id });
    } catch (profileError) {
      // Non-bloquant : si la table n'existe pas encore, on continue
      logger.warn('Failed to create default config profile (migration may not be applied yet)', {
        siteId: id,
        error: profileError instanceof Error ? profileError.message : String(profileError),
      });
    }

    // Audit log
    auditService.logSiteCreated(id, uniqueSiteName, req);

    // Return the plain API key only once at creation time
    // IMPORTANT: L'utilisateur doit sauvegarder cette clé, elle ne sera plus jamais affichée
    res.status(201).json({
      ...site,
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
    const { site_name, club_name, location, sports, status, live_score_enabled, avg_spectators, secondary_display_enabled, secondary_display_resolution } = req.body;

    const updateData: Record<string, unknown> = {};
    if (site_name !== undefined) updateData.site_name = site_name;
    if (club_name !== undefined) updateData.club_name = club_name;
    if (location !== undefined) updateData.location = JSON.stringify(location);
    if (sports !== undefined) updateData.sports = JSON.stringify(sports);
    if (status !== undefined) updateData.status = status;
    if (live_score_enabled !== undefined) updateData.live_score_enabled = live_score_enabled;
    if (avg_spectators !== undefined) updateData.avg_spectators = avg_spectators;
    if (secondary_display_enabled !== undefined) updateData.secondary_display_enabled = secondary_display_enabled;
    if (secondary_display_resolution !== undefined) updateData.secondary_display_resolution = secondary_display_resolution;
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    const site = await siteRepository.update(id, updateData as UpdateSiteInput);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Re-derive hostname when club_name changes
    if (club_name !== undefined) {
      try {
        const baseHostname = deriveHostnameSlug(club_name);
        const existingHostnames = await siteRepository.findExistingHostnames();
        const otherHostnames = existingHostnames.filter(h => h !== site.hostname_slug);
        const newHostname = deriveHostnameWithSuffix(baseHostname, otherHostnames);

        if (newHostname !== site.hostname_slug) {
          await siteRepository.updateHostnameSlug(id, newHostname);

          // Push hostname update to Pi
          await commandQueueService.sendOrQueue(id, 'update_hostname', {
            hostname: newHostname,
          });

          logger.info('Hostname updated and command queued', {
            siteId: id,
            oldHostname: site.hostname_slug,
            newHostname,
          });
        }
      } catch (hostnameError) {
        logger.warn('Failed to update hostname slug (non-blocking)', {
          siteId: id,
          error: hostnameError instanceof Error ? hostnameError.message : String(hostnameError),
        });
      }
    }

    logger.info('Site updated', { siteId: id, updatedBy: req.user?.email });

    res.json(site);
  } catch (error) {
    logger.error('Update site error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du site' });
  }
};

export const deleteSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const siteName = await siteRepository.delete(id);

    if (!siteName) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

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

    const site = await siteRepository.updateApiKey(id, newApiKeyHash);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    logger.info('API key regenerated', { siteId: id, regeneratedBy: req.user?.email });

    // Audit log
    auditService.logApiKeyRegenerated(id, req);

    // Return the new plain API key only once
    // IMPORTANT: L'utilisateur doit sauvegarder cette clé, elle ne sera plus jamais affichée
    res.json({
      ...site,
      api_key: newApiKey,
      api_key_warning: 'Sauvegardez cette clé API. Elle ne sera plus jamais affichée.',
    });
  } catch (error) {
    logger.error('Regenerate API key error:', error);
    res.status(500).json({ error: 'Erreur lors de la régénération de la clé API' });
  }
};

// ============================================================================
// Remote PIN Management
// ============================================================================

/**
 * GET /api/sites/:id/remote-pin
 * Retourne si un PIN est actif pour la télécommande cloud.
 */
export async function getRemotePinStatus(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    const site = await siteRepository.findById(id);
    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const pinHash = await siteRepository.getRemotePinHash(id);

    res.json({ pinEnabled: pinHash !== null });
  } catch (error) {
    logger.error('Error getting remote PIN status:', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/sites/:id/remote-pin
 * Définit un PIN pour la télécommande cloud.
 * Le PIN est hashé en SHA-256 et stocké en base.
 */
export async function setRemotePin(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { pin } = req.body;

    // Vérifier que le site existe
    const site = await siteRepository.findById(id);
    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Hasher le PIN
    const pinHash = createHash('sha256').update(pin).digest('hex');

    // Stocker le hash
    await siteRepository.setRemotePin(id, pinHash);

    logger.info('Remote PIN set for site', {
      siteId: id,
      userId: req.user?.id,
      siteName: site.site_name,
    });

    res.json({
      success: true,
      message: 'PIN de télécommande cloud défini avec succès',
    });
  } catch (error) {
    logger.error('Error setting remote PIN:', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * DELETE /api/sites/:id/remote-pin
 * Supprime le PIN de télécommande cloud (retour à l'accès libre).
 */
export async function clearRemotePin(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    // Vérifier que le site existe
    const site = await siteRepository.findById(id);
    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    await siteRepository.clearRemotePin(id);

    logger.info('Remote PIN cleared for site', {
      siteId: id,
      userId: req.user?.id,
      siteName: site.site_name,
    });

    res.json({
      success: true,
      message: 'PIN de télécommande cloud supprimé',
    });
  } catch (error) {
    logger.error('Error clearing remote PIN:', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ============================================================================
// Re-exports from sub-controllers for backward compatibility
// ============================================================================

export {
  sendCommand,
  getCommandStatus,
  getPendingCommands,
  cancelPendingCommand,
  clearPendingCommands,
  getQueueSummary,
} from './site-commands.controller';

export {
  getSiteLogs,
  getSystemInfo,
  getHotspotConfig,
  getHealthStatus,
  runDiagnostics,
  getNetworkDiagnostics,
  fixHotspot,
  getWifiBssidStatus,
  removeBssidLock,
  optimizeForMesh,
  scanWifiNetworks,
  connectWifiClient,
  exportDebugBundle,
} from './site-debug.controller';

export {
  getSiteMetrics,
  getSiteStats,
  getAllSitesConnectionStatus,
  getConnectionsDebug,
  getSiteConnectionStatus,
  getSiteLocalContent,
  getSiteDashboardData,
  getSiteTimeline,
  getFleetHealthData,
  getFleetMetrics,
  getSiteMatchHistory,
} from './site-fleet.controller';
