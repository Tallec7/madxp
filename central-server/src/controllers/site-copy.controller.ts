import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { auditService } from '../services/audit.service';
import { deriveHostnameSlug, deriveHostnameWithSuffix } from '../utils/hostname';
import {
  siteRepository,
  configProfileRepository,
} from '../repositories';

// Re-use helpers from sites.controller
import { generateApiKey, hashApiKey } from './sites.controller';
import { autoResolveSponsorIds } from '../services/sponsor-auto-resolution.service';
import type { SiteConfiguration } from '../types';

// ============================================================================
// Config Copy & Site Duplication
// ============================================================================

/**
 * POST /api/sites/:id/copy-config
 * Copie des profils de configuration du site source vers un site cible.
 * Mode ajout : les profils sont ajoutés sans supprimer les profils existants.
 * Si profile_ids est fourni, seuls ces profils sont copiés ; sinon tous.
 * Les conflits de nom sont résolus par suffixe " (copie)".
 */
export const copyConfig = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sourceSiteId } = req.params;
    const { target_site_id: targetSiteId, profile_ids: profileIds } = req.body;

    const [sourceSite, targetSite] = await Promise.all([
      siteRepository.findById(sourceSiteId),
      siteRepository.findById(targetSiteId),
    ]);

    if (!sourceSite) {
      return res.status(404).json({ error: 'Site source non trouvé' });
    }
    if (!targetSite) {
      return res.status(404).json({ error: 'Site cible non trouvé' });
    }
    if (sourceSiteId === targetSiteId) {
      return res.status(400).json({ error: 'Le site source et le site cible doivent être différents' });
    }

    let sourceProfiles = await configProfileRepository.findBySite(sourceSiteId);
    if (sourceProfiles.length === 0) {
      // Fallback: créer un profil par défaut à partir de local_config_mirror
      if (sourceSite.local_config_mirror && Object.keys(sourceSite.local_config_mirror).length > 0) {
        const fallbackProfile = await configProfileRepository.create({
          siteId: sourceSiteId,
          name: sourceSite.club_name || sourceSite.site_name || 'Default',
          isDefault: true,
          sortOrder: 0,
          configuration: sourceSite.local_config_mirror as Record<string, unknown>,
          createdBy: req.user?.id,
        });
        sourceProfiles = [fallbackProfile];
        logger.info('Created fallback profile from local_config_mirror for copy', { sourceSiteId });
      } else {
        return res.status(400).json({ error: 'Le site source n\'a aucun profil de configuration' });
      }
    }

    // Filtrer par profile_ids si fourni
    if (profileIds && profileIds.length > 0) {
      const idSet = new Set(profileIds as string[]);
      sourceProfiles = sourceProfiles.filter(p => idSet.has(p.id));
      if (sourceProfiles.length === 0) {
        return res.status(400).json({ error: 'Aucun profil trouvé parmi les IDs fournis' });
      }
    }

    // Récupérer les noms existants sur la cible pour éviter les doublons
    const existingProfiles = await configProfileRepository.findBySite(targetSiteId);
    const existingNames = new Set(existingProfiles.map(p => p.name.toLowerCase()));

    // Déterminer le sort_order de départ (après les profils existants)
    const maxSortOrder = existingProfiles.reduce((max, p) => Math.max(max, p.sort_order), -1);

    const copiedProfiles = [];
    for (let i = 0; i < sourceProfiles.length; i++) {
      const profile = sourceProfiles[i];

      // Résoudre les conflits de nom avec suffixe " (copie)"
      let name = profile.name;
      if (existingNames.has(name.toLowerCase())) {
        name = `${profile.name} (copie)`;
        // Si "(copie)" existe aussi, numéroter
        let counter = 2;
        while (existingNames.has(name.toLowerCase())) {
          name = `${profile.name} (copie ${counter})`;
          counter++;
        }
      }
      existingNames.add(name.toLowerCase());

      // Ré-résoudre les site_sponsor_id vers les sponsors du site cible
      let resolvedConfig = profile.configuration as SiteConfiguration;
      try {
        const { configuration: resolved, resolved: resolvedCount } =
          await autoResolveSponsorIds(targetSiteId, resolvedConfig);
        if (resolvedCount > 0) {
          resolvedConfig = resolved;
          logger.info('Sponsor auto-resolution in copied profile', {
            sourceSiteId, targetSiteId, profileName: name, resolved: resolvedCount,
          });
        }
      } catch { /* non-fatal */ }

      const copied = await configProfileRepository.create({
        siteId: targetSiteId,
        name,
        displayName: profile.display_name || undefined,
        city: profile.city || undefined,
        sport: profile.sport || undefined,
        sortOrder: maxSortOrder + 1 + i,
        isDefault: false, // Ne jamais écraser le profil par défaut de la cible
        configuration: resolvedConfig as Record<string, unknown>,
        createdBy: req.user?.id,
      });
      copiedProfiles.push(copied);
    }

    logger.info('Config profiles copied', {
      sourceSiteId,
      targetSiteId,
      profilesCopied: copiedProfiles.length,
      copiedBy: req.user?.email,
    });

    await auditService.log({
      action: 'CONFIG_COPIED',
      targetType: 'site',
      targetId: targetSiteId,
      userId: req.user?.id,
      details: { sourceSiteId, targetSiteId, profilesCopied: copiedProfiles.length },
    }, req);

    res.json({
      success: true,
      message: `${copiedProfiles.length} profil(s) copié(s) vers ${targetSite.site_name}`,
      profiles: copiedProfiles,
    });
  } catch (error) {
    logger.error('Copy config error:', error);
    res.status(500).json({ error: 'Erreur lors de la copie de la configuration' });
  }
};

/**
 * POST /api/sites/:id/duplicate
 * Duplique un site complet (métadonnées + profils de configuration).
 */
export const duplicateSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id: sourceSiteId } = req.params;
    const { site_name: requestedName } = req.body;

    const sourceSite = await siteRepository.findById(sourceSiteId);
    if (!sourceSite) {
      return res.status(404).json({ error: 'Site source non trouvé' });
    }

    const baseName = requestedName || `${sourceSite.site_name} (copie)`;
    let uniqueName = baseName;
    const existingRows = await siteRepository.findNameDuplicates(baseName);
    if (existingRows.length > 0) {
      let maxSuffix = 0;
      for (const row of existingRows) {
        if (row.site_name === baseName) {
          maxSuffix = Math.max(maxSuffix, 1);
        } else {
          const match = row.site_name.match(/-(\d+)$/);
          if (match) {
            maxSuffix = Math.max(maxSuffix, parseInt(match[1], 10) + 1);
          }
        }
      }
      if (maxSuffix > 0) {
        uniqueName = `${baseName}-${maxSuffix}`;
      }
    }

    const newId = uuidv4();
    const newApiKey = generateApiKey();
    const newApiKeyHash = hashApiKey(newApiKey);

    const newSite = await siteRepository.create({
      id: newId,
      siteName: uniqueName,
      clubName: sourceSite.club_name || uniqueName,
      location: sourceSite.location ? JSON.stringify(sourceSite.location) : null,
      sports: sourceSite.sports ? JSON.stringify(sourceSite.sports) : null,
      hardwareModel: sourceSite.hardware_model || 'Unknown',
      apiKeyHash: newApiKeyHash,
      siteType: sourceSite.site_type || 'pi',
    });

    // Derive hostname
    try {
      const baseHostname = deriveHostnameSlug(sourceSite.club_name || uniqueName);
      const existingHostnames = await siteRepository.findExistingHostnames();
      const hostname = deriveHostnameWithSuffix(baseHostname, existingHostnames);
      await siteRepository.updateHostnameSlug(newId, hostname);
    } catch (hostnameError) {
      logger.warn('Failed to assign hostname slug for duplicated site', {
        siteId: newId,
        error: hostnameError instanceof Error ? hostnameError.message : String(hostnameError),
      });
    }

    // Copier les profils de configuration
    const sourceProfiles = await configProfileRepository.findBySite(sourceSiteId);
    let profilesCopied = 0;
    for (const profile of sourceProfiles) {
      await configProfileRepository.create({
        siteId: newId,
        name: profile.name,
        displayName: profile.display_name || undefined,
        city: profile.city || undefined,
        sport: profile.sport || undefined,
        sortOrder: profile.sort_order,
        isDefault: profile.is_default,
        configuration: profile.configuration,
        createdBy: req.user?.id,
      });
      profilesCopied++;
    }

    if (profilesCopied === 0) {
      await configProfileRepository.create({
        siteId: newId,
        name: 'Par defaut',
        displayName: sourceSite.club_name || uniqueName,
        isDefault: true,
        configuration: {},
        createdBy: req.user?.id,
      });
      profilesCopied = 1;
    }

    logger.info('Site duplicated', {
      sourceSiteId,
      newSiteId: newId,
      newSiteName: uniqueName,
      profilesCopied,
      duplicatedBy: req.user?.email,
    });

    await auditService.log({
      action: 'SITE_DUPLICATED',
      targetType: 'site',
      targetId: newId,
      userId: req.user?.id,
      details: { sourceSiteId, newSiteName: uniqueName, profilesCopied },
    }, req);

    res.status(201).json({
      ...newSite,
      api_key: newApiKey,
      api_key_warning: 'Sauvegardez cette clé API. Elle ne sera plus jamais affichée.',
      profilesCopied,
    });
  } catch (error) {
    logger.error('Duplicate site error:', error);
    res.status(500).json({ error: 'Erreur lors de la duplication du site' });
  }
};
