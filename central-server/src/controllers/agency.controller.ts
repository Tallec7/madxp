import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest, Agency } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import { isAdmin } from '../middleware/auth';

// ============================================================================
// AGENCY CONTROLLER
// Gestion des agences et accès portail agence
// ============================================================================

interface AgencySiteRow {
  site_id: string;
  site_name: string;
  club_name: string;
  location: Record<string, unknown>;
  status: string;
  last_seen_at: Date | null;
  software_version: string | null;
  videos_played_30d: number;
  screen_time_30d: number;
}

interface AgencyDashboardStats {
  total_sites: number;
  online_sites: number;
  offline_sites: number;
  total_videos_played_30d: number;
  total_screen_time_30d: number;
}

// ============================================================================
// AGENCY CRUD (Admin only)
// ============================================================================

/**
 * GET /api/agencies
 * Liste toutes les agences (admin) ou l'agence de l'utilisateur (agency role)
 */
export const listAgencies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let result;

    if (isAdmin(req.user?.role || 'viewer')) {
      // Admin voit toutes les agences
      result = await query<Agency>(
        `SELECT id, name, description, logo_url, contact_name, contact_email, contact_phone, status, created_at
         FROM agencies
         ORDER BY name ASC`
      );
    } else if (req.user?.role === 'agency' && req.user?.agency_id) {
      // Agence voit seulement la sienne
      result = await query<Agency>(
        `SELECT id, name, description, logo_url, contact_name, contact_email, contact_phone, status, created_at
         FROM agencies
         WHERE id = $1`,
        [req.user.agency_id]
      );
    } else {
      res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        agencies: result.rows,
        total: result.rowCount || 0,
      },
    });
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

    const result = await query<Agency>(
      `SELECT * FROM agencies WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Agence non trouvée',
      });
      return;
    }

    res.json({
      success: true,
      data: { agency: result.rows[0] },
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

    const result = await query<Agency>(
      `INSERT INTO agencies (name, description, logo_url, contact_name, contact_email, contact_phone, address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, description || null, logo_url || null, contact_name || null, contact_email || null, contact_phone || null, address || null, metadata || {}]
    );

    logger.info('Agency created', { agencyId: result.rows[0].id, name, by: req.user?.email });

    res.status(201).json({
      success: true,
      data: result.rows[0],
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

    const result = await query<Agency>(
      `UPDATE agencies
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           logo_url = COALESCE($3, logo_url),
           contact_name = COALESCE($4, contact_name),
           contact_email = COALESCE($5, contact_email),
           contact_phone = COALESCE($6, contact_phone),
           address = COALESCE($7, address),
           status = COALESCE($8, status),
           metadata = COALESCE($9, metadata),
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [name, description, logo_url, contact_name, contact_email, contact_phone, address, status, metadata, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Agence non trouvée',
      });
      return;
    }

    logger.info('Agency updated', { agencyId: id, by: req.user?.email });

    res.json({
      success: true,
      data: result.rows[0],
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

    const result = await query(`DELETE FROM agencies WHERE id = $1`, [id]);

    if (result.rowCount === 0) {
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
    const agencyCheck = await query(`SELECT id FROM agencies WHERE id = $1`, [id]);
    if (agencyCheck.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Agence non trouvée',
      });
      return;
    }

    // Insérer les associations
    const values = site_ids
      .filter(sid => validateUuid(sid))
      .map((sid, idx) => `($1, $${idx + 2}, $${site_ids.length + 2})`)
      .join(', ');

    if (!values) {
      res.status(400).json({
        success: false,
        error: 'Aucun site_id valide fourni',
      });
      return;
    }

    const params = [id, ...site_ids.filter(sid => validateUuid(sid)), req.user?.id];

    await query(
      `INSERT INTO agency_sites (agency_id, site_id, added_by)
       VALUES ${values}
       ON CONFLICT (agency_id, site_id) DO NOTHING`,
      params
    );

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

    const result = await query(
      `DELETE FROM agency_sites WHERE agency_id = $1 AND site_id = $2`,
      [id, siteId]
    );

    if (result.rowCount === 0) {
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

    if (!agencyId) {
      res.status(403).json({
        success: false,
        error: 'Accès réservé aux agences',
      });
      return;
    }

    // Récupérer les infos de l'agence
    const agencyResult = await query<Agency>(
      `SELECT id, name, logo_url, status, created_at
       FROM agencies WHERE id = $1`,
      [agencyId]
    );

    if (agencyResult.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Agence non trouvée',
      });
      return;
    }

    const agency = agencyResult.rows[0];

    // Stats globales
    const statsResult = await query<AgencyDashboardStats>(
      `SELECT
        COUNT(DISTINCT s.id) as total_sites,
        COUNT(DISTINCT CASE WHEN s.status = 'online' THEN s.id END) as online_sites,
        COUNT(DISTINCT CASE WHEN s.status = 'offline' THEN s.id END) as offline_sites,
        COALESCE(SUM(cds.videos_played), 0) as total_videos_played_30d,
        COALESCE(SUM(cds.screen_time_seconds), 0) as total_screen_time_30d
       FROM agency_sites as2
       JOIN sites s ON s.id = as2.site_id
       LEFT JOIN club_daily_stats cds ON cds.site_id = s.id
         AND cds.date >= CURRENT_DATE - INTERVAL '30 days'
       WHERE as2.agency_id = $1`,
      [agencyId]
    );

    const stats = statsResult.rows[0] || {
      total_sites: 0,
      online_sites: 0,
      offline_sites: 0,
      total_videos_played_30d: 0,
      total_screen_time_30d: 0,
    };

    // Alertes récentes sur les sites de l'agence
    const alertsResult = await query(
      `SELECT a.id, a.site_id, s.site_name, a.alert_type, a.severity, a.message, a.created_at
       FROM alerts a
       JOIN sites s ON s.id = a.site_id
       JOIN agency_sites as2 ON as2.site_id = s.id
       WHERE as2.agency_id = $1
         AND a.status = 'active'
       ORDER BY a.created_at DESC
       LIMIT 10`,
      [agencyId]
    );

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
        recent_alerts: alertsResult.rows,
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

    if (!agencyId) {
      res.status(403).json({
        success: false,
        error: 'Accès réservé aux agences',
      });
      return;
    }

    const result = await query<AgencySiteRow>(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        s.location,
        s.status,
        s.last_seen_at,
        s.software_version,
        COALESCE(stats.videos_played, 0) as videos_played_30d,
        COALESCE(stats.screen_time, 0) as screen_time_30d
       FROM agency_sites as2
       JOIN sites s ON s.id = as2.site_id
       LEFT JOIN (
         SELECT
           site_id,
           SUM(videos_played) as videos_played,
           SUM(screen_time_seconds) as screen_time
         FROM club_daily_stats
         WHERE date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY site_id
       ) stats ON stats.site_id = s.id
       WHERE as2.agency_id = $1
       ORDER BY s.club_name ASC`,
      [agencyId]
    );

    res.json({
      success: true,
      data: {
        sites: result.rows.map(r => ({
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
        total: result.rowCount || 0,
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
        error: 'Accès réservé aux agences',
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
    const accessCheck = await query(
      `SELECT 1 FROM agency_sites WHERE agency_id = $1 AND site_id = $2`,
      [agencyId, siteId]
    );

    if (accessCheck.rowCount === 0) {
      res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce site',
      });
      return;
    }

    // Récupérer les détails du site
    const siteResult = await query(
      `SELECT s.*,
              (SELECT json_agg(json_build_object('id', a.id, 'type', a.alert_type, 'severity', a.severity, 'message', a.message, 'created_at', a.created_at))
               FROM alerts a WHERE a.site_id = s.id AND a.status = 'active') as active_alerts
       FROM sites s
       WHERE s.id = $1`,
      [siteId]
    );

    if (siteResult.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Site non trouvé',
      });
      return;
    }

    // Stats 30 jours
    const statsResult = await query(
      `SELECT
        SUM(videos_played) as total_videos,
        SUM(screen_time_seconds) as total_screen_time,
        AVG(uptime_percent) as avg_uptime,
        COUNT(*) as active_days
       FROM club_daily_stats
       WHERE site_id = $1
         AND date >= CURRENT_DATE - INTERVAL '30 days'`,
      [siteId]
    );

    // Tendances 7 jours
    const trendsResult = await query(
      `SELECT
        date,
        videos_played,
        screen_time_seconds
       FROM club_daily_stats
       WHERE site_id = $1
         AND date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY date ASC`,
      [siteId]
    );

    res.json({
      success: true,
      data: {
        site: siteResult.rows[0],
        stats_30d: {
          total_videos: parseInt(String(statsResult.rows[0]?.total_videos)) || 0,
          total_screen_time: parseInt(String(statsResult.rows[0]?.total_screen_time)) || 0,
          avg_uptime: parseFloat(String(statsResult.rows[0]?.avg_uptime)) || 0,
          active_days: parseInt(String(statsResult.rows[0]?.active_days)) || 0,
        },
        trends: trendsResult.rows,
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

    if (!agencyId) {
      res.status(403).json({
        success: false,
        error: 'Accès réservé aux agences',
      });
      return;
    }

    const fromDate = (from as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = (to as string) || new Date().toISOString().split('T')[0];

    // Sites de l'agence
    const sitesResult = await query(
      `SELECT site_id FROM agency_sites WHERE agency_id = $1`,
      [agencyId]
    );

    if (sitesResult.rowCount === 0) {
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

    const siteIds = sitesResult.rows.map(r => r.site_id);

    // Summary
    const summaryResult = await query(
      `SELECT
        COUNT(DISTINCT site_id) as total_sites,
        SUM(videos_played) as total_videos,
        SUM(screen_time_seconds) as total_screen_time,
        ROUND(AVG(uptime_percent)::numeric, 1) as avg_uptime
       FROM club_daily_stats
       WHERE site_id = ANY($1::uuid[])
         AND date >= $2::date
         AND date <= $3::date`,
      [siteIds, fromDate, toDate]
    );

    // Par site
    const bySiteResult = await query(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        SUM(cds.videos_played) as videos_played,
        SUM(cds.screen_time_seconds) as screen_time,
        ROUND(AVG(cds.uptime_percent)::numeric, 1) as avg_uptime
       FROM sites s
       JOIN club_daily_stats cds ON cds.site_id = s.id
       WHERE s.id = ANY($1::uuid[])
         AND cds.date >= $2::date
         AND cds.date <= $3::date
       GROUP BY s.id, s.site_name, s.club_name
       ORDER BY videos_played DESC`,
      [siteIds, fromDate, toDate]
    );

    // Tendances
    const trendsResult = await query(
      `SELECT
        DATE(date) as date,
        SUM(videos_played) as videos_played,
        SUM(screen_time_seconds) as screen_time
       FROM club_daily_stats
       WHERE site_id = ANY($1::uuid[])
         AND date >= $2::date
         AND date <= $3::date
       GROUP BY DATE(date)
       ORDER BY date ASC`,
      [siteIds, fromDate, toDate]
    );

    const summary = summaryResult.rows[0];

    res.json({
      success: true,
      data: {
        period: { from: fromDate, to: toDate },
        summary: {
          total_sites: parseInt(String(summary?.total_sites)) || 0,
          total_videos: parseInt(String(summary?.total_videos)) || 0,
          total_screen_time: parseInt(String(summary?.total_screen_time)) || 0,
          avg_uptime: parseFloat(String(summary?.avg_uptime)) || 0,
        },
        by_site: bySiteResult.rows.map(r => ({
          site_id: r.site_id,
          site_name: r.site_name,
          club_name: r.club_name,
          videos_played: parseInt(String(r.videos_played)) || 0,
          screen_time: parseInt(String(r.screen_time)) || 0,
          avg_uptime: parseFloat(String(r.avg_uptime)) || 0,
        })),
        trends: trendsResult.rows.map(r => ({
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
