import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import { isAdmin } from '../middleware/auth';
import { agencyRepository } from '../repositories';

// ============================================================================
// AGENCY CONTROLLER
// Gestion des agences et accès portail agence
// ============================================================================

// ============================================================================
// AGENCY CRUD (Admin only)
// ============================================================================

/**
 * GET /api/agencies
 * Liste toutes les agences (admin) ou l'agence de l'utilisateur (agency role)
 */
export const listAgencies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (isAdmin(req.user?.role || 'viewer')) {
      // Admin voit toutes les agences avec compteur de sites
      const agencies = await agencyRepository.findAllWithSiteCount();
      res.json({
        success: true,
        data: {
          agencies,
          total: agencies.length,
        },
      });
    } else if (req.user?.role === 'agency' && req.user?.agency_id) {
      // Agence voit seulement la sienne
      const agencies = await agencyRepository.findByIdLimited(req.user.agency_id);
      res.json({
        success: true,
        data: {
          agencies,
          total: agencies.length,
        },
      });
    } else {
      res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
      return;
    }
  } catch (error) {
    logger.error('Error listing agencies:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des agences',
    });
  }
};

/**
 * GET /api/agencies/:id
 * Récupérer une agence par ID
 */
export const getAgency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID agence invalide',
      });
      return;
    }

    // Vérifier accès
    if (!isAdmin(req.user?.role || 'viewer') && req.user?.agency_id !== id) {
      res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
      return;
    }

    const agency = await agencyRepository.findAgencyById(id);

    if (!agency) {
      res.status(404).json({
        success: false,
        error: 'Agence non trouvée',
      });
      return;
    }

    res.json({
      success: true,
      data: { agency },
    });
  } catch (error) {
    logger.error('Error getting agency:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement de l\'agence',
    });
  }
};

/**
 * POST /api/agencies
 * Créer une nouvelle agence (admin only)
 */
export const createAgency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, logo_url, contact_name, contact_email, contact_phone, address, metadata } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: 'Le nom de l\'agence est requis',
      });
      return;
    }

    const agency = await agencyRepository.createAgency({
      name,
      description,
      logo_url,
      contact_name,
      contact_email,
      contact_phone,
      address,
      metadata,
    });

    logger.info('Agency created', { agencyId: agency.id, name, by: req.user?.email });

    res.status(201).json({
      success: true,
      data: agency,
    });
  } catch (error) {
    logger.error('Error creating agency:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de l\'agence',
    });
  }
};

/**
 * PUT /api/agencies/:id
 * Mettre à jour une agence (admin only)
 */
export const updateAgency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, logo_url, contact_name, contact_email, contact_phone, address, status, metadata } = req.body;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID agence invalide',
      });
      return;
    }

    const agency = await agencyRepository.updateAgency(id, {
      name,
      description,
      logo_url,
      contact_name,
      contact_email,
      contact_phone,
      address,
      status,
      metadata,
    });

    if (!agency) {
      res.status(404).json({
        success: false,
        error: 'Agence non trouvée',
      });
      return;
    }

    logger.info('Agency updated', { agencyId: id, by: req.user?.email });

    res.json({
      success: true,
      data: agency,
    });
  } catch (error) {
    logger.error('Error updating agency:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour de l\'agence',
    });
  }
};

/**
 * DELETE /api/agencies/:id
 * Supprimer une agence (admin only)
 */
export const deleteAgency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID agence invalide',
      });
      return;
    }

    const deleted = await agencyRepository.deleteAgency(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Agence non trouvée',
      });
      return;
    }

    logger.info('Agency deleted', { agencyId: id, by: req.user?.email });

    res.json({
      success: true,
      message: 'Agence supprimée',
    });
  } catch (error) {
    logger.error('Error deleting agency:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression de l\'agence',
    });
  }
};

// ============================================================================
// AGENCY-SITE ASSOCIATION (Admin only)
// ============================================================================

/**
 * POST /api/agencies/:id/sites
 * Associer des sites à une agence
 */
export const addSitesToAgency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { site_ids } = req.body;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID agence invalide',
      });
      return;
    }

    if (!Array.isArray(site_ids) || site_ids.length === 0) {
      res.status(400).json({
        success: false,
        error: 'site_ids doit être un tableau non vide',
      });
      return;
    }

    // Vérifier que l'agence existe
    const agencyExists = await agencyRepository.agencyExists(id);
    if (!agencyExists) {
      res.status(404).json({
        success: false,
        error: 'Agence non trouvée',
      });
      return;
    }

    // Filtrer les UUIDs valides
    const validSiteIds = site_ids.filter((sid: string) => validateUuid(sid));

    if (validSiteIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Aucun site_id valide fourni',
      });
      return;
    }

    // Insérer les associations
    await agencyRepository.addSites(id, validSiteIds, req.user?.id);

    logger.info('Sites added to agency', { agencyId: id, siteCount: site_ids.length, by: req.user?.email });

    res.status(201).json({
      success: true,
      message: `${site_ids.length} site(s) associé(s) à l'agence`,
    });
  } catch (error) {
    logger.error('Error adding sites to agency:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'association des sites',
    });
  }
};

/**
 * GET /api/agencies/:id/sites
 * Liste des sites associés à une agence (admin endpoint)
 */
export const getAgencySitesAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID agence invalide',
      });
      return;
    }

    // Vérifier que l'agence existe
    const agency = await agencyRepository.findAgencyIdName(id);
    if (!agency) {
      res.status(404).json({
        success: false,
        error: 'Agence non trouvée',
      });
      return;
    }

    // Récupérer les sites associés
    const sites = await agencyRepository.findAdminAgencySites(id);

    res.json({
      success: true,
      data: {
        agency,
        sites,
        total: sites.length,
      },
    });
  } catch (error) {
    logger.error('Error getting agency sites:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des sites de l\'agence',
    });
  }
};

/**
 * DELETE /api/agencies/:id/sites/:siteId
 * Retirer un site d'une agence
 */
export const removeSiteFromAgency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, siteId } = req.params;

    if (!validateUuid(id) || !validateUuid(siteId)) {
      res.status(400).json({
        success: false,
        error: 'ID invalide',
      });
      return;
    }

    const removed = await agencyRepository.removeSite(id, siteId);

    if (!removed) {
      res.status(404).json({
        success: false,
        error: 'Association non trouvée',
      });
      return;
    }

    logger.info('Site removed from agency', { agencyId: id, siteId, by: req.user?.email });

    res.json({
      success: true,
      message: 'Site retiré de l\'agence',
    });
  } catch (error) {
    logger.error('Error removing site from agency:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du retrait du site',
    });
  }
};

// ============================================================================
// AGENCY PORTAL (For agency users)
// ============================================================================

/**
 * GET /api/agency/dashboard
 * Dashboard de l'agence connectée
 */
export const getAgencyDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const agencyId = req.user?.agency_id;

    // Si pas d'agency_id, retourner données vides au lieu de 403
    if (!agencyId) {
      res.json({
        success: true,
        data: {
          agency: null,
          stats: {
            total_sites: 0,
            online_sites: 0,
            offline_sites: 0,
            total_videos_played_30d: 0,
            total_screen_time_30d: 0,
          },
          recent_alerts: [],
          message: 'Aucune agence associée à votre compte. Contactez un administrateur.',
        },
      });
      return;
    }

    // Récupérer les infos de l'agence
    const agency = await agencyRepository.findDashboardAgency(agencyId);

    if (!agency) {
      res.status(404).json({
        success: false,
        error: 'Agence non trouvée',
      });
      return;
    }

    // Stats globales
    const stats = await agencyRepository.findDashboardStats(agencyId);

    // Alertes récentes sur les sites de l'agence
    const recentAlerts = await agencyRepository.findDashboardAlerts(agencyId);

    res.json({
      success: true,
      data: {
        agency: {
          id: agency.id,
          name: agency.name,
          logo_url: agency.logo_url,
          status: agency.status,
        },
        stats: {
          total_sites: parseInt(String(stats.total_sites)) || 0,
          online_sites: parseInt(String(stats.online_sites)) || 0,
          offline_sites: parseInt(String(stats.offline_sites)) || 0,
          total_videos_played_30d: parseInt(String(stats.total_videos_played_30d)) || 0,
          total_screen_time_30d: parseInt(String(stats.total_screen_time_30d)) || 0,
        },
        recent_alerts: recentAlerts,
      },
    });
  } catch (error) {
    logger.error('Error fetching agency dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du dashboard',
    });
  }
};

/**
 * GET /api/agency/sites
 * Liste des sites gérés par l'agence
 */
export const getAgencySites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const agencyId = req.user?.agency_id;

    // Si pas d'agency_id, retourner données vides au lieu de 403
    if (!agencyId) {
      res.json({
        success: true,
        data: {
          sites: [],
          total: 0,
          message: 'Aucune agence associée à votre compte. Contactez un administrateur.',
        },
      });
      return;
    }

    const sites = await agencyRepository.findPortalSites(agencyId);

    res.json({
      success: true,
      data: {
        sites: sites.map(r => ({
          site_id: r.site_id,
          site_name: r.site_name,
          club_name: r.club_name,
          location: r.location,
          status: r.status,
          last_seen_at: r.last_seen_at,
          software_version: r.software_version,
          videos_played_30d: parseInt(String(r.videos_played_30d)) || 0,
          screen_time_30d: parseInt(String(r.screen_time_30d)) || 0,
        })),
        total: sites.length,
      },
    });
  } catch (error) {
    logger.error('Error fetching agency sites:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des sites',
    });
  }
};

/**
 * GET /api/agency/sites/:siteId
 * Détails d'un site de l'agence
 */
export const getAgencySiteDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const agencyId = req.user?.agency_id;
    const { siteId } = req.params;

    if (!agencyId) {
      res.status(403).json({
        success: false,
        error: 'Aucune agence associée à votre compte',
      });
      return;
    }

    if (!validateUuid(siteId)) {
      res.status(400).json({
        success: false,
        error: 'ID site invalide',
      });
      return;
    }

    // Vérifier que le site appartient à l'agence
    const hasAccess = await agencyRepository.sitebelongsToAgency(agencyId, siteId);

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce site',
      });
      return;
    }

    // Récupérer les détails du site
    const site = await agencyRepository.findSiteWithAlerts(siteId);

    if (!site) {
      res.status(404).json({
        success: false,
        error: 'Site non trouvé',
      });
      return;
    }

    // Stats 30 jours
    const stats30d = await agencyRepository.findSiteStats30d(siteId);

    // Tendances 7 jours
    const trends = await agencyRepository.findSiteTrends7d(siteId);

    res.json({
      success: true,
      data: {
        site,
        stats_30d: {
          total_videos: parseInt(String(stats30d.total_videos)) || 0,
          total_screen_time: parseInt(String(stats30d.total_screen_time)) || 0,
          avg_uptime: parseFloat(String(stats30d.avg_uptime)) || 0,
          active_days: parseInt(String(stats30d.active_days)) || 0,
        },
        trends,
      },
    });
  } catch (error) {
    logger.error('Error fetching agency site details:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des détails du site',
    });
  }
};

/**
 * GET /api/agency/stats
 * Stats agrégées de l'agence
 */
export const getAgencyStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const agencyId = req.user?.agency_id;
    const { from, to } = req.query;

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Si pas d'agency_id, retourner données vides
    if (!agencyId) {
      res.json({
        success: true,
        data: {
          period: { from: fromDate, to: toDate },
          summary: {
            total_sites: 0,
            total_videos: 0,
            total_screen_time: 0,
            avg_uptime: 0,
          },
          by_site: [],
          trends: [],
          message: 'Aucune agence associée à votre compte. Contactez un administrateur.',
        },
      });
      return;
    }

    // Sites de l'agence
    const siteIds = await agencyRepository.findAgencySiteIds(agencyId);

    if (siteIds.length === 0) {
      res.json({
        success: true,
        data: {
          period: { from: fromDate, to: toDate },
          summary: {
            total_sites: 0,
            total_videos: 0,
            total_screen_time: 0,
            avg_uptime: 0,
          },
          by_site: [],
          trends: [],
        },
      });
      return;
    }

    // Summary
    const summary = await agencyRepository.findStatsSummary(siteIds, fromDate, toDate);

    // Par site
    const bySiteRows = await agencyRepository.findStatsBySite(siteIds, fromDate, toDate);

    // Tendances
    const trendRows = await agencyRepository.findStatsTrends(siteIds, fromDate, toDate);

    res.json({
      success: true,
      data: {
        period: { from: fromDate, to: toDate },
        summary: {
          total_sites: parseInt(String(summary.total_sites)) || 0,
          total_videos: parseInt(String(summary.total_videos)) || 0,
          total_screen_time: parseInt(String(summary.total_screen_time)) || 0,
          avg_uptime: parseFloat(String(summary.avg_uptime)) || 0,
        },
        by_site: bySiteRows.map(r => ({
          site_id: r.site_id,
          site_name: r.site_name,
          club_name: r.club_name,
          videos_played: parseInt(String(r.videos_played)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
          avg_uptime: parseFloat(String(r.avg_uptime)) || 0,
        })),
        trends: trendRows.map(r => ({
          date: r.date,
          videos_played: parseInt(String(r.videos_played)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching agency stats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des statistiques',
    });
  }
};
