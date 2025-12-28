import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';

// =============================================================================
// SPONSOR-SITES CONTROLLER
// Gestion des associations sponsors <-> sites avec contrats
// =============================================================================

interface SponsorSiteRow {
  [key: string]: unknown;
  sponsor_id: string;
  site_id: string;
  site_name: string;
  club_name: string;
  added_at: Date;
  contract_start: Date | null;
  contract_end: Date | null;
  is_active: boolean;
  contract_status: string;
  days_remaining: number | null;
}

interface SiteSponsorRow {
  [key: string]: unknown;
  sponsor_id: string;
  sponsor_name: string;
  logo_url: string | null;
  site_id: string;
  added_at: Date;
  contract_start: Date | null;
  contract_end: Date | null;
  is_active: boolean;
  contract_status: string;
}

// =============================================================================
// GET /api/sponsors/:id/sites
// Liste des sites associés à un sponsor avec statut de contrat
// =============================================================================

export const getSponsorSites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const includeInactive = req.query.include_inactive === 'true';

    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid sponsor ID' });
      return;
    }

    // Vérifier que le sponsor existe
    const sponsorCheck = await query('SELECT id, name FROM sponsors WHERE id = $1', [id]);
    if (sponsorCheck.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Sponsor not found' });
      return;
    }

    let whereClause = 'ss.sponsor_id = $1';
    if (!includeInactive) {
      whereClause += ' AND ss.is_active = true';
    }

    const result = await query<SponsorSiteRow>(
      `SELECT
        ss.sponsor_id,
        ss.site_id,
        s.site_name,
        s.club_name,
        ss.added_at,
        ss.contract_start,
        ss.contract_end,
        ss.is_active,
        CASE
          WHEN NOT ss.is_active THEN 'inactive'
          WHEN ss.contract_start IS NOT NULL AND ss.contract_start > CURRENT_DATE THEN 'pending'
          WHEN ss.contract_end IS NOT NULL AND ss.contract_end < CURRENT_DATE THEN 'expired'
          ELSE 'active'
        END as contract_status,
        CASE
          WHEN ss.contract_end IS NOT NULL AND ss.contract_end >= CURRENT_DATE
          THEN ss.contract_end - CURRENT_DATE
          ELSE NULL
        END as days_remaining
       FROM sponsor_sites ss
       JOIN sites s ON s.id = ss.site_id
       WHERE ${whereClause}
       ORDER BY ss.is_active DESC, ss.contract_start DESC NULLS LAST`,
      [id]
    );

    res.json({
      success: true,
      data: {
        sponsor: {
          id: sponsorCheck.rows[0].id,
          name: sponsorCheck.rows[0].name,
        },
        sites: result.rows.map(r => ({
          site_id: r.site_id,
          site_name: r.site_name,
          club_name: r.club_name,
          added_at: r.added_at,
          contract_start: r.contract_start,
          contract_end: r.contract_end,
          is_active: r.is_active,
          contract_status: r.contract_status,
          days_remaining: r.days_remaining,
        })),
        total: result.rowCount || 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching sponsor sites:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sponsor sites' });
  }
};

// =============================================================================
// POST /api/sponsors/:id/sites
// Associer un ou plusieurs sites à un sponsor
// =============================================================================

interface CreateSponsorSiteRequest {
  site_ids: string[];
  contract_start?: string;
  contract_end?: string;
}

export const addSitesToSponsor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { site_ids, contract_start, contract_end } = req.body as CreateSponsorSiteRequest;

    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid sponsor ID' });
      return;
    }

    if (!Array.isArray(site_ids) || site_ids.length === 0) {
      res.status(400).json({ success: false, error: 'site_ids must be a non-empty array' });
      return;
    }

    // Valider tous les site_ids
    const invalidIds = site_ids.filter(sId => !validateUuid(sId));
    if (invalidIds.length > 0) {
      res.status(400).json({
        success: false,
        error: `Invalid site IDs: ${invalidIds.join(', ')}`,
      });
      return;
    }

    // Vérifier que le sponsor existe
    const sponsorCheck = await query('SELECT id FROM sponsors WHERE id = $1', [id]);
    if (sponsorCheck.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Sponsor not found' });
      return;
    }

    // Vérifier que tous les sites existent
    const sitesCheck = await query(
      'SELECT id FROM sites WHERE id = ANY($1::uuid[])',
      [site_ids]
    );
    if (sitesCheck.rowCount !== site_ids.length) {
      const foundIds = sitesCheck.rows.map(r => r.id);
      const missingIds = site_ids.filter(sId => !foundIds.includes(sId));
      res.status(404).json({
        success: false,
        error: `Sites not found: ${missingIds.join(', ')}`,
      });
      return;
    }

    // Valider les dates si fournies
    let contractStartDate: Date | null = null;
    let contractEndDate: Date | null = null;

    if (contract_start) {
      contractStartDate = new Date(contract_start);
      if (isNaN(contractStartDate.getTime())) {
        res.status(400).json({ success: false, error: 'Invalid contract_start date' });
        return;
      }
    }

    if (contract_end) {
      contractEndDate = new Date(contract_end);
      if (isNaN(contractEndDate.getTime())) {
        res.status(400).json({ success: false, error: 'Invalid contract_end date' });
        return;
      }
    }

    // Vérifier que end >= start si les deux sont fournis
    if (contractStartDate && contractEndDate && contractEndDate < contractStartDate) {
      res.status(400).json({
        success: false,
        error: 'contract_end must be after contract_start',
      });
      return;
    }

    // Insérer les associations avec UPSERT
    const values = site_ids.map((_, idx) =>
      `($1, $${idx + 2}, $${site_ids.length + 2}, $${site_ids.length + 3}, true)`
    ).join(', ');

    await query(
      `INSERT INTO sponsor_sites (sponsor_id, site_id, contract_start, contract_end, is_active)
       VALUES ${values}
       ON CONFLICT (sponsor_id, site_id) DO UPDATE SET
         contract_start = COALESCE(EXCLUDED.contract_start, sponsor_sites.contract_start),
         contract_end = COALESCE(EXCLUDED.contract_end, sponsor_sites.contract_end),
         is_active = true`,
      [id, ...site_ids, contractStartDate, contractEndDate]
    );

    logger.info('Sites added to sponsor', {
      sponsorId: id,
      siteCount: site_ids.length,
      contractStart: contract_start,
      contractEnd: contract_end,
      addedBy: req.user?.email,
    });

    res.status(201).json({
      success: true,
      message: `${site_ids.length} site(s) associated with sponsor`,
    });
  } catch (error) {
    logger.error('Error adding sites to sponsor:', error);
    res.status(500).json({ success: false, error: 'Failed to add sites to sponsor' });
  }
};

// =============================================================================
// PUT /api/sponsors/:sponsorId/sites/:siteId
// Modifier un contrat sponsor-site
// =============================================================================

interface UpdateSponsorSiteRequest {
  contract_start?: string | null;
  contract_end?: string | null;
  is_active?: boolean;
}

export const updateSponsorSite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sponsorId, siteId } = req.params;
    const { contract_start, contract_end, is_active } = req.body as UpdateSponsorSiteRequest;

    if (!validateUuid(sponsorId) || !validateUuid(siteId)) {
      res.status(400).json({ success: false, error: 'Invalid sponsor or site ID' });
      return;
    }

    // Vérifier que l'association existe
    const check = await query(
      'SELECT sponsor_id, site_id FROM sponsor_sites WHERE sponsor_id = $1 AND site_id = $2',
      [sponsorId, siteId]
    );
    if (check.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Sponsor-site association not found' });
      return;
    }

    // Construire la requête de mise à jour dynamiquement
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (contract_start !== undefined) {
      if (contract_start === null) {
        updates.push(`contract_start = NULL`);
      } else {
        const date = new Date(contract_start);
        if (isNaN(date.getTime())) {
          res.status(400).json({ success: false, error: 'Invalid contract_start date' });
          return;
        }
        updates.push(`contract_start = $${paramIndex++}`);
        params.push(date);
      }
    }

    if (contract_end !== undefined) {
      if (contract_end === null) {
        updates.push(`contract_end = NULL`);
      } else {
        const date = new Date(contract_end);
        if (isNaN(date.getTime())) {
          res.status(400).json({ success: false, error: 'Invalid contract_end date' });
          return;
        }
        updates.push(`contract_end = $${paramIndex++}`);
        params.push(date);
      }
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: 'No fields to update' });
      return;
    }

    params.push(sponsorId, siteId);

    await query(
      `UPDATE sponsor_sites
       SET ${updates.join(', ')}
       WHERE sponsor_id = $${paramIndex} AND site_id = $${paramIndex + 1}`,
      params
    );

    logger.info('Sponsor-site contract updated', {
      sponsorId,
      siteId,
      updates: { contract_start, contract_end, is_active },
      updatedBy: req.user?.email,
    });

    res.json({
      success: true,
      message: 'Sponsor-site contract updated successfully',
    });
  } catch (error) {
    logger.error('Error updating sponsor-site:', error);
    res.status(500).json({ success: false, error: 'Failed to update sponsor-site' });
  }
};

// =============================================================================
// DELETE /api/sponsors/:sponsorId/sites/:siteId
// Supprimer une association sponsor-site
// =============================================================================

export const removeSiteFromSponsor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sponsorId, siteId } = req.params;
    const softDelete = req.query.soft !== 'false'; // Par défaut soft delete

    if (!validateUuid(sponsorId) || !validateUuid(siteId)) {
      res.status(400).json({ success: false, error: 'Invalid sponsor or site ID' });
      return;
    }

    if (softDelete) {
      // Soft delete: marquer is_active = false
      const result = await query(
        `UPDATE sponsor_sites SET is_active = false
         WHERE sponsor_id = $1 AND site_id = $2 AND is_active = true`,
        [sponsorId, siteId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ success: false, error: 'Active sponsor-site association not found' });
        return;
      }
    } else {
      // Hard delete
      const result = await query(
        'DELETE FROM sponsor_sites WHERE sponsor_id = $1 AND site_id = $2',
        [sponsorId, siteId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ success: false, error: 'Sponsor-site association not found' });
        return;
      }
    }

    logger.info('Site removed from sponsor', {
      sponsorId,
      siteId,
      hardDelete: !softDelete,
      removedBy: req.user?.email,
    });

    res.json({
      success: true,
      message: 'Site removed from sponsor',
    });
  } catch (error) {
    logger.error('Error removing site from sponsor:', error);
    res.status(500).json({ success: false, error: 'Failed to remove site from sponsor' });
  }
};

// =============================================================================
// GET /api/sites/:id/sponsors
// Liste des sponsors associés à un site
// =============================================================================

export const getSiteSponsors = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const activeOnly = req.query.active_only !== 'false'; // Par défaut actifs uniquement

    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid site ID' });
      return;
    }

    // Vérifier que le site existe
    const siteCheck = await query('SELECT id, site_name, club_name FROM sites WHERE id = $1', [id]);
    if (siteCheck.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Site not found' });
      return;
    }

    let whereClause = 'ss.site_id = $1';
    if (activeOnly) {
      whereClause += `
        AND ss.is_active = true
        AND (ss.contract_start IS NULL OR ss.contract_start <= CURRENT_DATE)
        AND (ss.contract_end IS NULL OR ss.contract_end >= CURRENT_DATE)`;
    }

    const result = await query<SiteSponsorRow>(
      `SELECT
        ss.sponsor_id,
        sp.name as sponsor_name,
        sp.logo_url,
        ss.site_id,
        ss.added_at,
        ss.contract_start,
        ss.contract_end,
        ss.is_active,
        CASE
          WHEN NOT ss.is_active THEN 'inactive'
          WHEN ss.contract_start IS NOT NULL AND ss.contract_start > CURRENT_DATE THEN 'pending'
          WHEN ss.contract_end IS NOT NULL AND ss.contract_end < CURRENT_DATE THEN 'expired'
          ELSE 'active'
        END as contract_status
       FROM sponsor_sites ss
       JOIN sponsors sp ON sp.id = ss.sponsor_id
       WHERE ${whereClause}
       ORDER BY sp.name ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        site: {
          id: siteCheck.rows[0].id,
          site_name: siteCheck.rows[0].site_name,
          club_name: siteCheck.rows[0].club_name,
        },
        sponsors: result.rows.map(r => ({
          sponsor_id: r.sponsor_id,
          sponsor_name: r.sponsor_name,
          logo_url: r.logo_url,
          added_at: r.added_at,
          contract_start: r.contract_start,
          contract_end: r.contract_end,
          is_active: r.is_active,
          contract_status: r.contract_status,
        })),
        total: result.rowCount || 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching site sponsors:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch site sponsors' });
  }
};
