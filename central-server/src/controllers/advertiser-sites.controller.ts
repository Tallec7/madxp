import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';

// =============================================================================
// ADVERTISER-SITES CONTROLLER
// Gestion des associations annonceurs <-> sites avec contrats
// =============================================================================

interface AdvertiserSiteRow {
  [key: string]: unknown;
  advertiser_id: string;
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

interface SiteAdvertiserRow {
  [key: string]: unknown;
  advertiser_id: string;
  advertiser_name: string;
  logo_url: string | null;
  site_id: string;
  added_at: Date;
  contract_start: Date | null;
  contract_end: Date | null;
  is_active: boolean;
  contract_status: string;
}

// =============================================================================
// GET /api/advertisers/:id/sites
// Liste des sites associés à un annonceur avec statut de contrat
// =============================================================================

export const getAdvertiserSites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const includeInactive = req.query.include_inactive === 'true';

    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid advertiser ID' });
      return;
    }

    // Vérifier que l'annonceur existe
    const advertiserCheck = await query('SELECT id, name FROM advertisers WHERE id = $1', [id]);
    if (advertiserCheck.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Advertiser not found' });
      return;
    }

    let whereClause = 'ads.advertiser_id = $1';
    if (!includeInactive) {
      whereClause += ' AND ads.is_active = true';
    }

    const result = await query<AdvertiserSiteRow>(
      `SELECT
        ads.advertiser_id,
        ads.site_id,
        s.site_name,
        s.club_name,
        ads.added_at,
        ads.contract_start,
        ads.contract_end,
        ads.is_active,
        CASE
          WHEN NOT ads.is_active THEN 'inactive'
          WHEN ads.contract_start IS NOT NULL AND ads.contract_start > CURRENT_DATE THEN 'pending'
          WHEN ads.contract_end IS NOT NULL AND ads.contract_end < CURRENT_DATE THEN 'expired'
          ELSE 'active'
        END as contract_status,
        CASE
          WHEN ads.contract_end IS NOT NULL AND ads.contract_end >= CURRENT_DATE
          THEN ads.contract_end - CURRENT_DATE
          ELSE NULL
        END as days_remaining
       FROM advertiser_sites ads
       JOIN sites s ON s.id = ads.site_id
       WHERE ${whereClause}
       ORDER BY ads.is_active DESC, ads.contract_start DESC NULLS LAST`,
      [id]
    );

    res.json({
      success: true,
      data: {
        advertiser: {
          id: advertiserCheck.rows[0].id,
          name: advertiserCheck.rows[0].name,
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
    logger.error('Error fetching advertiser sites:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch advertiser sites' });
  }
};

// =============================================================================
// POST /api/advertisers/:id/sites
// Associer un ou plusieurs sites à un annonceur
// =============================================================================

interface CreateAdvertiserSiteRequest {
  site_ids: string[];
  contract_start?: string;
  contract_end?: string;
}

export const addSitesToAdvertiser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { site_ids, contract_start, contract_end } = req.body as CreateAdvertiserSiteRequest;

    if (!validateUuid(id)) {
      res.status(400).json({ success: false, error: 'Invalid advertiser ID' });
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

    // Vérifier que l'annonceur existe
    const advertiserCheck = await query('SELECT id FROM advertisers WHERE id = $1', [id]);
    if (advertiserCheck.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Advertiser not found' });
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
      `INSERT INTO advertiser_sites (advertiser_id, site_id, contract_start, contract_end, is_active)
       VALUES ${values}
       ON CONFLICT (advertiser_id, site_id) DO UPDATE SET
         contract_start = COALESCE(EXCLUDED.contract_start, advertiser_sites.contract_start),
         contract_end = COALESCE(EXCLUDED.contract_end, advertiser_sites.contract_end),
         is_active = true`,
      [id, ...site_ids, contractStartDate, contractEndDate]
    );

    logger.info('Sites added to advertiser', {
      advertiserId: id,
      siteCount: site_ids.length,
      contractStart: contract_start,
      contractEnd: contract_end,
      addedBy: req.user?.email,
    });

    res.status(201).json({
      success: true,
      message: `${site_ids.length} site(s) associated with advertiser`,
    });
  } catch (error) {
    logger.error('Error adding sites to advertiser:', error);
    res.status(500).json({ success: false, error: 'Failed to add sites to advertiser' });
  }
};

// =============================================================================
// PUT /api/advertisers/:advertiserId/sites/:siteId
// Modifier un contrat annonceur-site
// =============================================================================

interface UpdateAdvertiserSiteRequest {
  contract_start?: string | null;
  contract_end?: string | null;
  is_active?: boolean;
}

export const updateAdvertiserSite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { advertiserId, siteId } = req.params;
    const { contract_start, contract_end, is_active } = req.body as UpdateAdvertiserSiteRequest;

    if (!validateUuid(advertiserId) || !validateUuid(siteId)) {
      res.status(400).json({ success: false, error: 'Invalid advertiser or site ID' });
      return;
    }

    // Vérifier que l'association existe
    const check = await query(
      'SELECT advertiser_id, site_id FROM advertiser_sites WHERE advertiser_id = $1 AND site_id = $2',
      [advertiserId, siteId]
    );
    if (check.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Advertiser-site association not found' });
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

    params.push(advertiserId, siteId);

    await query(
      `UPDATE advertiser_sites
       SET ${updates.join(', ')}
       WHERE advertiser_id = $${paramIndex} AND site_id = $${paramIndex + 1}`,
      params
    );

    logger.info('Advertiser-site contract updated', {
      advertiserId,
      siteId,
      updates: { contract_start, contract_end, is_active },
      updatedBy: req.user?.email,
    });

    res.json({
      success: true,
      message: 'Advertiser-site contract updated successfully',
    });
  } catch (error) {
    logger.error('Error updating advertiser-site:', error);
    res.status(500).json({ success: false, error: 'Failed to update advertiser-site' });
  }
};

// =============================================================================
// DELETE /api/advertisers/:advertiserId/sites/:siteId
// Supprimer une association annonceur-site
// =============================================================================

export const removeSiteFromAdvertiser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { advertiserId, siteId } = req.params;
    const softDelete = req.query.soft !== 'false'; // Par défaut soft delete

    if (!validateUuid(advertiserId) || !validateUuid(siteId)) {
      res.status(400).json({ success: false, error: 'Invalid advertiser or site ID' });
      return;
    }

    if (softDelete) {
      // Soft delete: marquer is_active = false
      const result = await query(
        `UPDATE advertiser_sites SET is_active = false
         WHERE advertiser_id = $1 AND site_id = $2 AND is_active = true`,
        [advertiserId, siteId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ success: false, error: 'Active advertiser-site association not found' });
        return;
      }
    } else {
      // Hard delete
      const result = await query(
        'DELETE FROM advertiser_sites WHERE advertiser_id = $1 AND site_id = $2',
        [advertiserId, siteId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ success: false, error: 'Advertiser-site association not found' });
        return;
      }
    }

    logger.info('Site removed from advertiser', {
      advertiserId,
      siteId,
      hardDelete: !softDelete,
      removedBy: req.user?.email,
    });

    res.json({
      success: true,
      message: 'Site removed from advertiser',
    });
  } catch (error) {
    logger.error('Error removing site from advertiser:', error);
    res.status(500).json({ success: false, error: 'Failed to remove site from advertiser' });
  }
};

// =============================================================================
// GET /api/sites/:id/advertisers
// Liste des annonceurs associés à un site
// =============================================================================

export const getSiteAdvertisers = async (req: AuthRequest, res: Response): Promise<void> => {
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

    let whereClause = 'ads.site_id = $1';
    if (activeOnly) {
      whereClause += `
        AND ads.is_active = true
        AND (ads.contract_start IS NULL OR ads.contract_start <= CURRENT_DATE)
        AND (ads.contract_end IS NULL OR ads.contract_end >= CURRENT_DATE)`;
    }

    const result = await query<SiteAdvertiserRow>(
      `SELECT
        ads.advertiser_id,
        a.name as advertiser_name,
        a.logo_url,
        ads.site_id,
        ads.added_at,
        ads.contract_start,
        ads.contract_end,
        ads.is_active,
        CASE
          WHEN NOT ads.is_active THEN 'inactive'
          WHEN ads.contract_start IS NOT NULL AND ads.contract_start > CURRENT_DATE THEN 'pending'
          WHEN ads.contract_end IS NOT NULL AND ads.contract_end < CURRENT_DATE THEN 'expired'
          ELSE 'active'
        END as contract_status
       FROM advertiser_sites ads
       JOIN advertisers a ON a.id = ads.advertiser_id
       WHERE ${whereClause}
       ORDER BY a.name ASC`,
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
        advertisers: result.rows.map(r => ({
          advertiser_id: r.advertiser_id,
          advertiser_name: r.advertiser_name,
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
    logger.error('Error fetching site advertisers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch site advertisers' });
  }
};

// =============================================================================
// BACKWARD COMPATIBILITY - Alias for old 'sponsor' endpoints
// These will be removed after migration period
// =============================================================================

export const getSponsorSites = getAdvertiserSites;
export const addSitesToSponsor = addSitesToAdvertiser;
export const updateSponsorSite = updateAdvertiserSite;
export const removeSiteFromSponsor = removeSiteFromAdvertiser;
export const getSiteSponsors = getSiteAdvertisers;
