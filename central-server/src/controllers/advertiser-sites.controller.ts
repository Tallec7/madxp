import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import { advertiserRepository } from '../repositories';
import { advertiserPortalRepository } from '../repositories/advertiser-portal.repository';
import { siteRepository } from '../repositories';

// =============================================================================
// ADVERTISER-SITES CONTROLLER
// Gestion des associations annonceurs <-> sites avec contrats
// =============================================================================

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
    const advertiserName = await advertiserRepository.findName(id);
    if (!advertiserName) {
      res.status(404).json({ success: false, error: 'Advertiser not found' });
      return;
    }

    const result = await advertiserPortalRepository.getAdvertiserSites(id, includeInactive);

    res.json({
      success: true,
      data: {
        advertiser: {
          id,
          name: advertiserName,
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
  } catch (error: unknown) {
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
    const advertiserExists = await advertiserRepository.exists(id);
    if (!advertiserExists) {
      res.status(404).json({ success: false, error: 'Advertiser not found' });
      return;
    }

    // Vérifier que tous les sites existent
    const foundSites = await advertiserPortalRepository.findSitesByIds(site_ids);
    if (foundSites.length !== site_ids.length) {
      const foundIds = foundSites.map(r => r.id);
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
    await advertiserPortalRepository.addSites(id, site_ids, contractStartDate, contractEndDate);

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
  } catch (error: unknown) {
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
    const association = await advertiserPortalRepository.findAssociation(advertiserId, siteId);
    if (!association) {
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

    await advertiserPortalRepository.updateAssociation(advertiserId, siteId, updates, params);

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
  } catch (error: unknown) {
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
      const deactivated = await advertiserPortalRepository.deactivateAssociation(advertiserId, siteId);

      if (!deactivated) {
        res.status(404).json({ success: false, error: 'Active advertiser-site association not found' });
        return;
      }
    } else {
      // Hard delete
      const deleted = await advertiserPortalRepository.deleteAssociation(advertiserId, siteId);

      if (!deleted) {
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
  } catch (error: unknown) {
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
    const site = await siteRepository.findById(id);
    if (!site) {
      res.status(404).json({ success: false, error: 'Site not found' });
      return;
    }

    const result = await advertiserPortalRepository.getSiteAdvertisers(id, activeOnly);

    res.json({
      success: true,
      data: {
        site: {
          id: site.id,
          site_name: site.site_name,
          club_name: site.club_name,
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
  } catch (error: unknown) {
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
// getSiteSponsors backward-compat alias removed — replaced by site-sponsor.routes.ts
export const removeSiteFromSponsor = removeSiteFromAdvertiser;
