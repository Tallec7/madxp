/**
 * Config Profiles Controller
 *
 * Gere les endpoints CRUD pour les profils de configuration multi-config.
 * Permet a un site d'avoir N profils selectionnables depuis la remote du Pi.
 */

import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import { AuthRequest, SiteConfiguration } from '../types';
import logger from '../config/logger';
import socketService from '../services/socket.service';
import { metricsService } from '../services/metrics.service';
import { configProfileRepository } from '../repositories/config-profile.repository';
import { configHistoryRepository } from '../repositories/config-history.repository';
import { siteRepository } from '../repositories/site.repository';
import { enrichConfigWithDisplayVariants, resolveDisplayTypesForSite } from '../utils/config-secondary-variants';
import { enrichConfigWithAnalyticsMetadata } from '../utils/config-analytics-metadata';
import { autoResolveSponsorIds } from '../services/sponsor-auto-resolution.service';
import { isSyntheticWebContentPath } from '../utils/strip-synthetic-web-content';

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

const updateProfileConfigurationSchema = Joi.object({
  configuration: Joi.object().required(),
  mode: Joi.string().valid('replace', 'merge').optional(),
});

/**
 * ADR-103 Phase 0.5 — scan a config for synthetic web_page/livestream entries
 * (path = `web_page-<ts>` / `livestream-<ts>`) which would crash the TV when
 * routed through the MP4 pipeline. Returns the offending paths grouped by
 * location so the caller can build a precise 400 error.
 */
function findSyntheticWebContentPaths(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const c = config as Record<string, unknown>;
  const out: string[] = [];

  const scanArr = (arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const v of arr) {
      const path = (v as { path?: unknown })?.path;
      if (isSyntheticWebContentPath(path)) out.push(String(path));
    }
  };

  scanArr(c.sponsors);

  if (Array.isArray(c.timeCategories)) {
    for (const tc of c.timeCategories as Array<{ loopVideos?: unknown }>) {
      scanArr(tc.loopVideos);
    }
  }

  const scanCats = (cats: unknown): void => {
    if (!Array.isArray(cats)) return;
    for (const cat of cats as Array<{ videos?: unknown; subCategories?: unknown }>) {
      scanArr(cat.videos);
      scanCats(cat.subCategories);
    }
  };
  scanCats(c.categories);

  return out;
}

/**
 * Build the standard 400 response for synthetic web/livestream paths in a
 * config save. Returns true if the response was sent.
 */
function rejectIfSyntheticWebContent(res: Response, configuration: unknown): boolean {
  const offenders = findSyntheticWebContentPaths(configuration);
  if (offenders.length === 0) return false;
  res.status(400).json({
    error:
      "Cette configuration contient des entrées web_page / livestream avec un path synthétique " +
      "(ex: 'web_page-<timestamp>'), qui font crasher le lecteur TV. " +
      "Utilisez la pseudo-catégorie 'Web / Live' (auto-générée) pour lancer ces contenus depuis la télécommande, " +
      "ou laissez-les hors de la boucle vidéo. Voir ADR-089 / ADR-103.",
    code: 'SYNTHETIC_WEB_CONTENT_PATH_FORBIDDEN',
    offendingPaths: offenders.slice(0, 10),
  });
  return true;
}

/**
 * ADR-103 Phase 3 — find web/live entries in playback loops (sponsors[] or
 * timeCategories[].loopVideos[]) that LACK a positive `durationSeconds`.
 * Without a duration, the loop falls back on the WebContentService's 30s
 * default (Phase 2b safety) — fine to avoid stalling but not a deliberate
 * editorial choice. Block at save so the dashboard surfaces the issue.
 *
 * Categories[].videos[] are NOT checked — they don't auto-rotate, the user
 * launches them manually from the Remote and `durationMs ?? null` means
 * "no auto-close" (the page stays until the user navigates away).
 */
function findWebLoopEntriesMissingDuration(config: unknown): Array<{ where: string; name: string; contentType: string }> {
  if (!config || typeof config !== 'object') return [];
  const c = config as Record<string, unknown>;
  const out: Array<{ where: string; name: string; contentType: string }> = [];

  const scan = (arr: unknown, where: string): void => {
    if (!Array.isArray(arr)) return;
    for (const v of arr as Array<{ contentType?: string; durationSeconds?: number | null; name?: string }>) {
      const ct = v?.contentType;
      if (ct !== 'web_page' && ct !== 'livestream') continue;
      const d = v?.durationSeconds;
      if (typeof d !== 'number' || !(d > 0)) {
        out.push({ where, name: v?.name ?? '(sans nom)', contentType: ct });
      }
    }
  };

  scan(c.sponsors, 'sponsors');
  if (Array.isArray(c.timeCategories)) {
    for (const tc of c.timeCategories as Array<{ id?: string; loopVideos?: unknown }>) {
      scan(tc.loopVideos, `timeCategories[${tc?.id ?? '?'}].loopVideos`);
    }
  }
  return out;
}

/**
 * Build the standard 400 response for web/live loop entries without
 * durationSeconds. Returns true if the response was sent.
 */
function rejectIfWebLoopMissingDuration(res: Response, configuration: unknown): boolean {
  const offenders = findWebLoopEntriesMissingDuration(configuration);
  if (offenders.length === 0) return false;
  // ADR-103 Phase 4 — observe blocked saves to detect parcours UX cassés.
  metricsService.recordWebLoopDurationRequiredBlock('config-profiles');
  res.status(400).json({
    error:
      "Une page web ou un livestream placé dans la boucle (sponsors ou phase) doit avoir une durée d'affichage > 0 secondes. " +
      "Renseignez le champ 'duration' à la création (page Contenu) ou laissez l'entrée hors de la boucle pour un usage manuel uniquement.",
    code: 'WEB_LOOP_DURATION_REQUIRED',
    offenders: offenders.slice(0, 10),
  });
  return true;
}

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

    // ADR-103 Phase 2 — synthetic web_page/livestream paths are now ACCEPTED
    // on save. Backend resolves them at read time (saas/remote controllers
    // call resolveSyntheticWebContent before sending to TV/Remote). Phase 0.5
    // strip remains as a safety net for entries whose DB row got deleted.
    void rejectIfSyntheticWebContent;

    // ADR-103 Phase 3 — refuse boucle entries (sponsors/loopVideos) with
    // contentType web_page/livestream that lack a positive durationSeconds.
    // The dashboard must collect this from the user before save.
    if (rejectIfWebLoopMissingDuration(res, value.configuration)) return;

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

    // ADR-103 Phase 2 — synthetic paths now resolved server-side at read time.
    // ADR-103 Phase 3 — refuse loop entries without durationSeconds (web/live).
    if (value.configuration && rejectIfWebLoopMissingDuration(res, value.configuration)) return;

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
// PUT /api/sites/:siteId/profiles/:profileId/configuration
// --------------------------------------------------------------------------

/**
 * Extracts neopro video paths from a config's sponsors (defaultVideos) and timeCategories (phase loops).
 * A video is considered neopro if owner !== 'club' (undefined/absent = neopro by default).
 */
function extractNeoproVideoPaths(config: Record<string, unknown>): Set<string> {
  const paths = new Set<string>();
  const sponsors = config.sponsors as Array<{ path?: string; owner?: string }> | undefined;
  if (Array.isArray(sponsors)) {
    for (const v of sponsors) {
      if (v.path && v.owner !== 'club') paths.add(v.path);
    }
  }
  const timeCategories = config.timeCategories as Array<{ loopVideos?: Array<{ path?: string; owner?: string }> }> | undefined;
  if (Array.isArray(timeCategories)) {
    for (const tc of timeCategories) {
      if (Array.isArray(tc.loopVideos)) {
        for (const v of tc.loopVideos) {
          if (v.path && v.owner !== 'club') paths.add(v.path);
        }
      }
    }
  }
  return paths;
}

export const updateProfileConfiguration = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, profileId } = req.params;

    const { error: validationError, value } = updateProfileConfigurationSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // ADR-103 Phase 2 — synthetic web_page/livestream paths are now ACCEPTED
    // on save. Backend resolves them at read time (saas/remote controllers
    // call resolveSyntheticWebContent before sending to TV/Remote). Phase 0.5
    // strip remains as a safety net for entries whose DB row got deleted.
    void rejectIfSyntheticWebContent;

    // ADR-103 Phase 3 — refuse boucle entries (sponsors/loopVideos) with
    // contentType web_page/livestream that lack a positive durationSeconds.
    // The dashboard must collect this from the user before save.
    if (rejectIfWebLoopMissingDuration(res, value.configuration)) return;

    const existing = await configProfileRepository.findById(profileId);
    if (!existing || existing.site_id !== siteId) {
      return res.status(404).json({ error: 'Profil non trouve' });
    }

    // Defense-in-depth: club users cannot remove or modify neopro videos from loops
    if (req.user?.role === 'club') {
      const oldConfig = (existing.configuration || {}) as Record<string, unknown>;
      const newConfig = (value.configuration || {}) as Record<string, unknown>;
      const oldNeopro = extractNeoproVideoPaths(oldConfig);
      const newNeopro = extractNeoproVideoPaths(newConfig);
      for (const path of oldNeopro) {
        if (!newNeopro.has(path)) {
          return res.status(403).json({
            error: 'Les vidéos NEOPRO ne peuvent pas être supprimées ou modifiées par un compte club',
          });
        }
      }
    }

    const updated = value.mode === 'merge'
      ? await configProfileRepository.mergeConfiguration(profileId, value.configuration, req.user?.id)
      : await configProfileRepository.update(profileId, {
          configuration: value.configuration,
          updatedBy: req.user?.id,
        });

    logger.info('Profile configuration updated', {
      siteId,
      profileId,
      profileName: existing.name,
      updatedBy: req.user?.email,
    });

    // Notify SaaS clients to reload config (non-blocking)
    const site = await siteRepository.findById(siteId);
    if (site?.site_type === 'saas') {
      socketService.emitSaasConfigUpdated(siteId, { updatedBy: req.user?.email });
    }

    res.json(updated);
  } catch (error) {
    logger.error('Update profile configuration error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise a jour de la configuration du profil' });
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

    // Enrichir la configuration avant sauvegarde et envoi
    let enrichedConfig = profile.configuration as SiteConfiguration;
    try {
      const { configuration: resolved, resolved: resolvedCount } =
        await autoResolveSponsorIds(siteId, enrichedConfig);
      if (resolvedCount > 0) enrichedConfig = resolved;
    } catch { /* non-fatal */ }

    try {
      const displayTypes = await resolveDisplayTypesForSite(siteId);
      await enrichConfigWithDisplayVariants(enrichedConfig, displayTypes);
    } catch { /* non-fatal */ }

    try {
      await enrichConfigWithAnalyticsMetadata(enrichedConfig);
    } catch { /* non-fatal */ }

    // Sauvegarder dans config_history avec profile_id
    const versionId = uuidv4();
    const lastVersion = await configHistoryRepository.findLastVersion(siteId);

    await configHistoryRepository.insertVersion({
      id: versionId,
      site_id: siteId,
      configuration: JSON.stringify(enrichedConfig),
      deployed_by: req.user?.id,
      comment: `Deploiement profil "${profile.name}"`,
      previous_version_id: lastVersion?.id || null,
      changes_summary: JSON.stringify([]),
    });

    // Mettre a jour le pending config
    await configHistoryRepository.updateSitePendingConfigVersion(siteId, versionId);

    // Trigger le sync vers le Pi
    await socketService.triggerPendingConfigSync(siteId);

    // Aussi synchroniser tous les profils pour que le Pi ait le dossier profiles/
    // (necessaire pour que le club-selector fonctionne sur la remote)
    const allProfiles = await configProfileRepository.findBySite(siteId);
    if (allProfiles.length > 1) {
      const enrichedProfiles = [];
      const allProfilesDisplayTypes = await resolveDisplayTypesForSite(siteId).catch(() => ['secondary']);
      for (const p of allProfiles) {
        let enrichedConfig = p.configuration as SiteConfiguration;

        try {
          const { configuration: resolved, resolved: resolvedCount } =
            await autoResolveSponsorIds(siteId, enrichedConfig);
          if (resolvedCount > 0) enrichedConfig = resolved;
        } catch { /* non-fatal */ }

        try {
          await enrichConfigWithDisplayVariants(enrichedConfig, allProfilesDisplayTypes);
        } catch { /* non-fatal */ }

        try {
          await enrichConfigWithAnalyticsMetadata(enrichedConfig);
        } catch { /* non-fatal */ }

        // ADR-058 — propager l'etat PIN profil au Pi pour validation offline.
        const pin = await configProfileRepository.findPin(p.id).catch(() => null);
        enrichedProfiles.push({
          id: p.id,
          name: p.name,
          display_name: p.display_name,
          city: p.city,
          sport: p.sport,
          is_default: p.is_default,
          configuration: enrichedConfig,
          remote_pin_required: !!pin?.remote_pin_required,
          remote_pin_hash: pin?.remote_pin_hash ?? null,
          remote_pin_updated_at: pin?.remote_pin_updated_at
            ? pin.remote_pin_updated_at.toISOString()
            : null,
        });
      }
      socketService.sendCommand(siteId, {
        id: uuidv4(),
        type: 'sync_profiles',
        data: { profiles: enrichedProfiles },
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

    // Enrichir chaque profil avant envoi au Pi
    const syncPayload = [];
    const syncProfilesDisplayTypes = await resolveDisplayTypesForSite(siteId).catch(() => ['secondary']);
    for (const p of profiles) {
      let enrichedConfig = p.configuration as SiteConfiguration;

      // Auto-résolution des sponsor IDs
      try {
        const { configuration: resolved, resolved: resolvedCount } =
          await autoResolveSponsorIds(siteId, enrichedConfig);
        if (resolvedCount > 0) {
          enrichedConfig = resolved;
          logger.info('Sponsor auto-resolution in profile sync', {
            siteId, profileId: p.id, resolved: resolvedCount,
          });
        }
      } catch (err) {
        logger.warn('Sponsor auto-resolution failed in profile sync (non-fatal)', {
          siteId, profileId: p.id, error: (err as Error).message,
        });
      }

      // Enrichir avec les variants display (secondary, led, etc.) selon les displays du site
      try {
        const { enrichedCount } = await enrichConfigWithDisplayVariants(enrichedConfig, syncProfilesDisplayTypes);
        if (enrichedCount > 0) {
          logger.info('Display variants enriched in profile sync', {
            siteId, profileId: p.id, enrichedCount, displayTypes: syncProfilesDisplayTypes,
          });
        }
      } catch (err) {
        logger.warn('Display variant enrichment failed in profile sync (non-fatal)', {
          siteId, profileId: p.id, error: (err as Error).message,
        });
      }

      // Enrichir avec les métadonnées analytics
      try {
        const { enrichedCount } = await enrichConfigWithAnalyticsMetadata(enrichedConfig);
        if (enrichedCount > 0) {
          logger.info('Analytics metadata enriched in profile sync', {
            siteId, profileId: p.id, enrichedCount,
          });
        }
      } catch (err) {
        logger.warn('Analytics metadata enrichment failed in profile sync (non-fatal)', {
          siteId, profileId: p.id, error: (err as Error).message,
        });
      }

      // ADR-058 — propager l'etat PIN profil au Pi pour validation offline.
      const pin = await configProfileRepository.findPin(p.id).catch(() => null);
      syncPayload.push({
        id: p.id,
        name: p.name,
        display_name: p.display_name,
        city: p.city,
        sport: p.sport,
        is_default: p.is_default,
        configuration: enrichedConfig,
        remote_pin_required: !!pin?.remote_pin_required,
        remote_pin_hash: pin?.remote_pin_hash ?? null,
        remote_pin_updated_at: pin?.remote_pin_updated_at
          ? pin.remote_pin_updated_at.toISOString()
          : null,
      });
    }

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

