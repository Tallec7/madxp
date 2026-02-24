/**
 * Config Profiles Controller
 *
 * Gere les endpoints CRUD pour les profils de configuration multi-config.
 * Permet a un site d'avoir N profils selectionnables depuis la remote du Pi.
 */

import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import socketService from '../services/socket.service';
import { configProfileRepository } from '../repositories/config-profile.repository';
import { configHistoryRepository } from '../repositories/config-history.repository';

// --------------------------------------------------------------------------
// Validation schemas
// --------------------------------------------------------------------------

const createProfileSchema = Joi.object({
  name: Joi.string().max(255).required(),
  display_name: Joi.string().max(255).allow(null, ''),
  city: Joi.string().max(255).allow(null, ''),
  sport: Joi.string().max(100).allow(null, ''),
  sort_order: Joi.number().integer().min(0).default(0),
  is_default: Joi.boolean().default(false),
  configuration: Joi.object().required(),
});

const updateProfileSchema = Joi.object({
  name: Joi.string().max(255),
  display_name: Joi.string().max(255).allow(null, ''),
  city: Joi.string().max(255).allow(null, ''),
  sport: Joi.string().max(100).allow(null, ''),
  sort_order: Joi.number().integer().min(0),
  is_default: Joi.boolean(),
  configuration: Joi.object(),
}).min(1);

// --------------------------------------------------------------------------
// GET /api/sites/:siteId/profiles
// --------------------------------------------------------------------------

export const getProfiles = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    const site = await configHistoryRepository.findSiteBasic(siteId);
    if (!site) {
      return res.status(404).json({ error: 'Site non trouve' });
    }

    const profiles = await configProfileRepository.findBySite(siteId);
    const count = profiles.length;

    res.json({ site_id: siteId, count, profiles });
  } catch (error) {
    logger.error('Get profiles error:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation des profils' });
  }
};

// --------------------------------------------------------------------------
// GET /api/sites/:siteId/profiles/:profileId
// --------------------------------------------------------------------------

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { profileId } = req.params;

    const profile = await configProfileRepository.findById(profileId);
    if (!profile) {
      return res.status(404).json({ error: 'Profil non trouve' });
    }

    res.json(profile);
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ error: 'Erreur lors de la recuperation du profil' });
  }
};

// --------------------------------------------------------------------------
// POST /api/sites/:siteId/profiles
// --------------------------------------------------------------------------

export const createProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    const { error: validationError, value } = createProfileSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const site = await configHistoryRepository.findSiteBasic(siteId);
    if (!site) {
      return res.status(404).json({ error: 'Site non trouve' });
    }

    // Si c'est le premier profil, forcer is_default = true
    const existingCount = await configProfileRepository.countBySite(siteId);
    const isDefault = existingCount === 0 ? true : value.is_default;

    // Si le nouveau profil est default, unset l'ancien
    if (isDefault && existingCount > 0) {
      const currentDefault = await configProfileRepository.findDefaultForSite(siteId);
      if (currentDefault) {
        await configProfileRepository.update(currentDefault.id, { isDefault: false });
      }
    }

    const profile = await configProfileRepository.create({
      siteId,
      name: value.name,
      displayName: value.display_name,
      city: value.city,
      sport: value.sport,
      sortOrder: value.sort_order,
      isDefault,
      configuration: value.configuration,
      createdBy: req.user?.id,
    });

    logger.info('Config profile created', {
      siteId,
      profileId: profile.id,
      profileName: value.name,
      createdBy: req.user?.email,
    });

    res.status(201).json(profile);
  } catch (error) {
    logger.error('Create profile error:', error);
    res.status(500).json({ error: 'Erreur lors de la creation du profil' });
  }
};

// --------------------------------------------------------------------------
// PUT /api/sites/:siteId/profiles/:profileId
// --------------------------------------------------------------------------

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, profileId } = req.params;

    const { error: validationError, value } = updateProfileSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const existing = await configProfileRepository.findById(profileId);
    if (!existing || existing.site_id !== siteId) {
      return res.status(404).json({ error: 'Profil non trouve' });
    }

    // Si on set is_default = true, unset l'ancien default
    if (value.is_default === true && !existing.is_default) {
      await configProfileRepository.setDefault(siteId, profileId);
    }

    const updated = await configProfileRepository.update(profileId, {
      name: value.name,
      displayName: value.display_name,
      city: value.city,
      sport: value.sport,
      sortOrder: value.sort_order,
      isDefault: value.is_default,
      configuration: value.configuration,
      updatedBy: req.user?.id,
    });

    logger.info('Config profile updated', {
      siteId,
      profileId,
      updatedBy: req.user?.email,
    });

    res.json(updated);
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise a jour du profil' });
  }
};

// --------------------------------------------------------------------------
// DELETE /api/sites/:siteId/profiles/:profileId
// --------------------------------------------------------------------------

export const deleteProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, profileId } = req.params;

    const existing = await configProfileRepository.findById(profileId);
    if (!existing || existing.site_id !== siteId) {
      return res.status(404).json({ error: 'Profil non trouve' });
    }

    // Interdire la suppression du dernier profil
    const count = await configProfileRepository.countBySite(siteId);
    if (count <= 1) {
      return res.status(400).json({ error: 'Impossible de supprimer le dernier profil d\'un site' });
    }

    // Si on supprime le default, promouvoir le prochain profil
    const wasDefault = existing.is_default;
    await configProfileRepository.deleteById(profileId);

    if (wasDefault) {
      const remaining = await configProfileRepository.findBySite(siteId);
      if (remaining.length > 0) {
        await configProfileRepository.setDefault(siteId, remaining[0].id);
      }
    }

    logger.info('Config profile deleted', {
      siteId,
      profileId,
      profileName: existing.name,
      deletedBy: req.user?.email,
    });

    res.json({ success: true, message: 'Profil supprime' });
  } catch (error) {
    logger.error('Delete profile error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du profil' });
  }
};

// --------------------------------------------------------------------------
// POST /api/sites/:siteId/profiles/:profileId/deploy
// --------------------------------------------------------------------------

export const deployProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, profileId } = req.params;

    const profile = await configProfileRepository.findById(profileId);
    if (!profile || profile.site_id !== siteId) {
      return res.status(404).json({ error: 'Profil non trouve' });
    }

    // Sauvegarder dans config_history avec profile_id
    const versionId = uuidv4();
    const lastVersion = await configHistoryRepository.findLastVersion(siteId);

    await configHistoryRepository.insertVersion({
      id: versionId,
      site_id: siteId,
      configuration: JSON.stringify(profile.configuration),
      deployed_by: req.user?.id,
      comment: `Deploiement profil "${profile.name}"`,
      previous_version_id: lastVersion?.id || null,
      changes_summary: JSON.stringify([]),
    });

    // Mettre a jour le pending config
    await configHistoryRepository.updateSitePendingConfigVersion(siteId, versionId);

    // Tracker le profil actif
    await configProfileRepository.updateSiteActiveProfile(siteId, profileId);

    // Trigger le sync vers le Pi
    await socketService.triggerPendingConfigSync(siteId);

    // Aussi synchroniser tous les profils pour que le Pi ait le dossier profiles/
    // (necessaire pour que le club-selector fonctionne sur la remote)
    const allProfiles = await configProfileRepository.findBySite(siteId);
    if (allProfiles.length > 1) {
      const syncPayload = allProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        display_name: p.display_name,
        city: p.city,
        sport: p.sport,
        is_default: p.is_default,
        configuration: p.configuration,
      }));
      socketService.sendCommand(siteId, {
        id: uuidv4(),
        type: 'sync_profiles',
        data: { profiles: syncPayload },
      });
    }

    logger.info('Config profile deployed', {
      siteId,
      profileId,
      profileName: profile.name,
      versionId,
      deployedBy: req.user?.email,
      profilesSynced: allProfiles.length > 1,
    });

    res.json({
      success: true,
      version_id: versionId,
      profile_id: profileId,
      profile_name: profile.name,
    });
  } catch (error) {
    logger.error('Deploy profile error:', error);
    res.status(500).json({ error: 'Erreur lors du deploiement du profil' });
  }
};

// --------------------------------------------------------------------------
// POST /api/sites/:siteId/profiles/sync
// --------------------------------------------------------------------------

export const syncProfiles = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    const site = await configHistoryRepository.findSiteBasic(siteId);
    if (!site) {
      return res.status(404).json({ error: 'Site non trouve' });
    }

    const profiles = await configProfileRepository.findBySite(siteId);

    if (profiles.length === 0) {
      return res.status(400).json({ error: 'Aucun profil a synchroniser' });
    }

    // Construire le payload pour le sync-agent
    const syncPayload = profiles.map((p) => ({
      id: p.id,
      name: p.name,
      display_name: p.display_name,
      city: p.city,
      sport: p.sport,
      is_default: p.is_default,
      configuration: p.configuration,
    }));

    // Envoyer la commande sync_profiles au Pi
    await socketService.sendCommand(siteId, {
      id: uuidv4(),
      type: 'sync_profiles',
      data: { profiles: syncPayload },
    });

    logger.info('Profiles sync triggered', {
      siteId,
      profileCount: profiles.length,
      triggeredBy: req.user?.email,
    });

    res.json({
      success: true,
      profile_count: profiles.length,
      profiles: profiles.map((p) => ({ id: p.id, name: p.name, is_default: p.is_default })),
    });
  } catch (error) {
    logger.error('Sync profiles error:', error);
    res.status(500).json({ error: 'Erreur lors de la synchronisation des profils' });
  }
};
