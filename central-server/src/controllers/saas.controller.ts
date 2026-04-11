/**
 * SaaS Controller
 *
 * Endpoints pour les sites 100% SaaS (sans Raspberry Pi).
 * Le navigateur du club charge sa config et joue les vidéos directement
 * depuis le cloud (URLs FTP publiques).
 *
 * Sécurité: UUID du site (128 bits d'entropie) + rate limiting.
 */

import { Request, Response } from 'express';
import { siteRepository, configProfileRepository, videoRepository } from '../repositories';
import { getVideoUrl } from '../services/storage.service';
import { enrichConfigWithAnalyticsMetadata } from '../utils/config-analytics-metadata';
import { enrichConfigWithDisplayVariants } from '../utils/config-secondary-variants';
import { SiteConfiguration } from '../types';
import logger from '../config/logger';

interface VideoLike {
  path?: string;
  name?: string;
  type?: string;
  weight?: number;
  pinned?: boolean;
  variants?: { secondary?: { path: string } };
  [key: string]: unknown;
}

interface CategoryLike {
  id?: string;
  name?: string;
  videos?: VideoLike[];
  subCategories?: CategoryLike[];
  [key: string]: unknown;
}

interface TimeCategoryLike {
  id?: string;
  name?: string;
  icon?: string;
  color?: string;
  description?: string;
  categoryIds?: string[];
  loopVideos?: VideoLike[];
  [key: string]: unknown;
}

/**
 * Résout un chemin vidéo en URL FTP publique.
 * Utilise le storagePathMap (filename → storage_path) pour résoudre le vrai chemin FTP.
 * Fallback sur le filename direct si pas trouvé dans la map (anciens uploads à plat).
 */
function resolveVideoUrl(path: string | undefined, storagePathMap: Map<string, string>): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const filename = path.split('/').pop() || path;
  const storagePath = storagePathMap.get(filename);
  return getVideoUrl(storagePath || filename);
}

/**
 * Résout toutes les URLs vidéo dans un tableau de vidéos.
 */
function resolveVideoUrls(videos: VideoLike[], storagePathMap: Map<string, string>): VideoLike[] {
  return videos.map(v => {
    const resolved: VideoLike = {
      ...v,
      path: resolveVideoUrl(v.path, storagePathMap),
    };
    // Resolve variant paths: storage_path is already set by enrichConfigWithDisplayVariants,
    // so pass it directly to getVideoUrl instead of looking up in storagePathMap
    if (v.variants?.secondary?.path) {
      resolved.variants = {
        ...v.variants,
        secondary: { ...v.variants.secondary, path: getVideoUrl(v.variants.secondary.path) },
      };
    }
    return resolved;
  });
}

/**
 * Résout les URLs vidéo dans les catégories (récursif pour les sous-catégories).
 */
function resolveCategories(categories: CategoryLike[], storagePathMap: Map<string, string>): CategoryLike[] {
  return categories.map(cat => ({
    ...cat,
    videos: cat.videos ? resolveVideoUrls(cat.videos, storagePathMap) : [],
    subCategories: cat.subCategories ? resolveCategories(cat.subCategories, storagePathMap) : [],
  }));
}

/**
 * Résout les URLs vidéo dans les timeCategories.
 */
function resolveTimeCategories(timeCategories: TimeCategoryLike[], storagePathMap: Map<string, string>): TimeCategoryLike[] {
  return timeCategories.map(tc => ({
    ...tc,
    loopVideos: tc.loopVideos ? resolveVideoUrls(tc.loopVideos, storagePathMap) : [],
  }));
}

/**
 * Extract all video filenames from a config to batch-lookup thumbnails.
 * ADR-048: Collects filenames from sponsors, categories, and timeCategories.
 */
function collectVideoFilenames(
  sponsors: VideoLike[],
  categories: CategoryLike[],
  timeCategories: TimeCategoryLike[]
): string[] {
  const filenames = new Set<string>();

  const extractFromVideo = (v: VideoLike) => {
    if (v.path) {
      const filename = v.path.split('/').pop();
      if (filename) filenames.add(filename);
    }
  };

  sponsors.forEach(extractFromVideo);

  const extractFromCategories = (cats: CategoryLike[]) => {
    for (const cat of cats) {
      cat.videos?.forEach(extractFromVideo);
      if (cat.subCategories) extractFromCategories(cat.subCategories);
    }
  };
  extractFromCategories(categories);

  timeCategories.forEach(tc => tc.loopVideos?.forEach(extractFromVideo));

  return Array.from(filenames);
}

/**
 * Enrich resolved videos with thumbnailUrl from DB.
 * ADR-048: Adds cloud thumbnail URLs to SaaS config responses.
 */
function applyThumbnails(videos: VideoLike[], thumbnailMap: Map<string, string>): VideoLike[] {
  return videos.map(v => {
    if (v.thumbnailUrl) return v; // Already has a thumbnail
    // Extract filename from path (before or after URL resolution)
    const pathStr = v.path as string;
    const filename = pathStr?.split('/').pop()?.split('?')[0];
    if (filename && thumbnailMap.has(filename)) {
      return { ...v, thumbnailUrl: thumbnailMap.get(filename) };
    }
    return v;
  });
}

function applyCategoryThumbnails(categories: CategoryLike[], thumbnailMap: Map<string, string>): CategoryLike[] {
  return categories.map(cat => ({
    ...cat,
    videos: cat.videos ? applyThumbnails(cat.videos, thumbnailMap) : [],
    subCategories: cat.subCategories ? applyCategoryThumbnails(cat.subCategories, thumbnailMap) : [],
  }));
}

function applyTimeCategoryThumbnails(timeCategories: TimeCategoryLike[], thumbnailMap: Map<string, string>): TimeCategoryLike[] {
  return timeCategories.map(tc => ({
    ...tc,
    loopVideos: tc.loopVideos ? applyThumbnails(tc.loopVideos, thumbnailMap) : [],
  }));
}

/**
 * GET /api/saas/:siteId/config
 *
 * Retourne la configuration complète d'un site SaaS avec toutes les URLs
 * vidéo résolues en URLs FTP publiques.
 */
export async function getSaasConfig(req: Request, res: Response) {
  try {
    const { siteId } = req.params;

    const site = await siteRepository.findById(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    if (site.site_type !== 'saas') {
      return res.status(403).json({ error: 'Ce site n\'est pas un site SaaS' });
    }

    // Charger le profil par défaut ou le local_config_mirror
    let configuration: Record<string, unknown> = {};

    const defaultProfile = await configProfileRepository.findDefaultForSite(siteId);
    if (defaultProfile) {
      configuration = defaultProfile.configuration;
    } else if (site.local_config_mirror) {
      configuration = site.local_config_mirror as Record<string, unknown>;
    }

    // Enrichir avec les variantes display (secondary, etc.) pour le dual-display
    try {
      await enrichConfigWithDisplayVariants(configuration as unknown as SiteConfiguration);
    } catch (err) {
      logger.warn('SaaS config: enrichConfigWithDisplayVariants failed (non-fatal)', { siteId, error: err });
    }

    // Enrichir avec les métadonnées analytics (video_id, sponsor_id, analytics_category)
    // avant la résolution des URLs pour que resolveVideoUrls préserve ces champs via spread
    try {
      const { enrichedCount } = await enrichConfigWithAnalyticsMetadata(configuration as unknown as SiteConfiguration);
      if (enrichedCount === 0 && ((configuration.sponsors as unknown[]) || []).length > 0) {
        logger.warn('SaaS config: enrichConfigWithAnalyticsMetadata enriched 0 videos — sponsor analytics may be lost', { siteId });
      }
    } catch (err) {
      logger.warn('SaaS config: enrichConfigWithAnalyticsMetadata failed (non-fatal)', { siteId, error: err });
    }

    // Résoudre toutes les URLs vidéo (config vide = site fraîchement créé, retourner les defaults)
    const sponsors = (configuration.sponsors as VideoLike[]) || [];
    const categories = (configuration.categories as CategoryLike[]) || [];
    const timeCategories = (configuration.timeCategories as TimeCategoryLike[]) || [];

    // Batch-lookup storage paths and thumbnail URLs from DB
    const allFilenames = collectVideoFilenames(sponsors, categories, timeCategories);
    let storagePathMap = new Map<string, string>();
    let thumbnailMap = new Map<string, string>();
    if (allFilenames.length > 0) {
      try {
        storagePathMap = await videoRepository.findStoragePathsByFilenames(allFilenames);
      } catch (err) {
        logger.warn('SaaS config: storage path lookup failed (non-fatal)', { siteId, error: err });
      }
      try {
        thumbnailMap = await videoRepository.findThumbnailsByFilenames(allFilenames);
      } catch (err) {
        logger.warn('SaaS config: thumbnail lookup failed (non-fatal)', { siteId, error: err });
      }
    }

    // Apply thumbnails BEFORE URL resolution (paths still have original filenames)
    const sponsorsWithThumbs = applyThumbnails(sponsors, thumbnailMap);
    const categoriesWithThumbs = applyCategoryThumbnails(categories, thumbnailMap);
    const timeCategoriesWithThumbs = applyTimeCategoryThumbnails(timeCategories, thumbnailMap);

    // Then resolve video URLs (filename → storage_path)
    const resolvedSponsors = resolveVideoUrls(sponsorsWithThumbs, storagePathMap);
    const resolvedCategories = resolveCategories(categoriesWithThumbs, storagePathMap);
    const resolvedTimeCategories = resolveTimeCategories(timeCategoriesWithThumbs, storagePathMap);

    const resolvedConfig = {
      remote: configuration.remote || { title: `Télécommande ${site.club_name || site.site_name}` },
      auth: configuration.auth || { password: '', sessionDuration: 28800000 },
      version: configuration.version || '1.0',
      sponsors: resolvedSponsors,
      categories: resolvedCategories,
      timeCategories: resolvedTimeCategories,
      liveScoreEnabled: (configuration.liveScoreEnabled as boolean) ?? false,
      scoreOverlay: configuration.scoreOverlay || null,
      watermark: configuration.watermark || null,
      settings: configuration.settings || {},
    };

    // Métadonnées du site
    const response = {
      siteId,
      siteName: site.site_name,
      clubName: site.club_name,
      sport: site.sport || null,
      configuration: resolvedConfig,
    };

    logger.info('SaaS config loaded', { siteId, siteName: site.site_name });

    return res.json(response);
  } catch (error) {
    logger.error('Error loading SaaS config', { siteId: req.params.siteId, error });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/saas/:siteId/profiles
 *
 * Retourne la liste des profils disponibles pour un site SaaS (multi-profil).
 */
export async function getSaasProfiles(req: Request, res: Response) {
  try {
    const { siteId } = req.params;

    const site = await siteRepository.findById(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    if (site.site_type !== 'saas') {
      return res.status(403).json({ error: 'Ce site n\'est pas un site SaaS' });
    }

    const profiles = await configProfileRepository.findBySite(siteId);

    const result = profiles.map((p: { id: string; name: string; display_name: string | null; city: string | null; sport: string | null; is_default: boolean; sort_order: number }) => ({
      id: p.id,
      name: p.name,
      displayName: p.display_name,
      city: p.city,
      sport: p.sport,
      isDefault: p.is_default,
      sortOrder: p.sort_order,
    }));

    return res.json(result);
  } catch (error) {
    logger.error('Error loading SaaS profiles', { siteId: req.params.siteId, error });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/saas/:siteId/profiles/:profileId/config
 *
 * Retourne la configuration d'un profil spécifique avec URLs résolues.
 */
export async function getSaasProfileConfig(req: Request, res: Response) {
  try {
    const { siteId, profileId } = req.params;

    const site = await siteRepository.findById(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    if (site.site_type !== 'saas') {
      return res.status(403).json({ error: 'Ce site n\'est pas un site SaaS' });
    }

    const profile = await configProfileRepository.findById(profileId);

    if (!profile || profile.site_id !== siteId) {
      return res.status(404).json({ error: 'Profil non trouvé' });
    }

    const configuration = profile.configuration;

    try {
      await enrichConfigWithDisplayVariants(configuration as unknown as SiteConfiguration);
    } catch (err) {
      logger.warn('SaaS profile config: enrichConfigWithDisplayVariants failed (non-fatal)', { siteId, profileId, error: err });
    }

    try {
      const { enrichedCount } = await enrichConfigWithAnalyticsMetadata(configuration as unknown as SiteConfiguration);
      if (enrichedCount === 0 && ((configuration.sponsors as unknown[]) || []).length > 0) {
        logger.warn('SaaS profile config: enrichConfigWithAnalyticsMetadata enriched 0 videos — sponsor analytics may be lost', { siteId, profileId });
      }
    } catch (err) {
      logger.warn('SaaS profile config: enrichConfigWithAnalyticsMetadata failed (non-fatal)', { siteId, profileId, error: err });
    }

    const sponsors = (configuration.sponsors as VideoLike[]) || [];
    const categories = (configuration.categories as CategoryLike[]) || [];
    const timeCategories = (configuration.timeCategories as TimeCategoryLike[]) || [];

    // Batch-lookup storage paths and thumbnail URLs from DB
    const allFilenames = collectVideoFilenames(sponsors, categories, timeCategories);
    let storagePathMap = new Map<string, string>();
    let thumbnailMap = new Map<string, string>();
    if (allFilenames.length > 0) {
      try {
        storagePathMap = await videoRepository.findStoragePathsByFilenames(allFilenames);
      } catch (err) {
        logger.warn('SaaS profile config: storage path lookup failed (non-fatal)', { siteId, profileId, error: err });
      }
      try {
        thumbnailMap = await videoRepository.findThumbnailsByFilenames(allFilenames);
      } catch (err) {
        logger.warn('SaaS profile config: thumbnail lookup failed (non-fatal)', { siteId, profileId, error: err });
      }
    }

    // Apply thumbnails BEFORE URL resolution (paths still have original filenames)
    const sponsorsWithThumbs = applyThumbnails(sponsors, thumbnailMap);
    const categoriesWithThumbs = applyCategoryThumbnails(categories, thumbnailMap);
    const timeCategoriesWithThumbs = applyTimeCategoryThumbnails(timeCategories, thumbnailMap);

    // Then resolve video URLs (filename → storage_path)
    const resolvedSponsors = resolveVideoUrls(sponsorsWithThumbs, storagePathMap);
    const resolvedCategories = resolveCategories(categoriesWithThumbs, storagePathMap);
    const resolvedTimeCategories = resolveTimeCategories(timeCategoriesWithThumbs, storagePathMap);

    const resolvedConfig = {
      remote: configuration.remote || { title: `Télécommande ${profile.display_name || profile.name}` },
      auth: configuration.auth || { password: '', sessionDuration: 28800000 },
      version: configuration.version || '1.0',
      sponsors: resolvedSponsors,
      categories: resolvedCategories,
      timeCategories: resolvedTimeCategories,
      liveScoreEnabled: (configuration.liveScoreEnabled as boolean) ?? false,
      scoreOverlay: configuration.scoreOverlay || null,
      watermark: configuration.watermark || null,
      settings: configuration.settings || {},
    };

    return res.json({
      siteId,
      siteName: site.site_name,
      clubName: site.club_name,
      profileId: profile.id,
      profileName: profile.display_name || profile.name,
      sport: profile.sport || site.sport || null,
      configuration: resolvedConfig,
    });
  } catch (error) {
    logger.error('Error loading SaaS profile config', { siteId: req.params.siteId, profileId: req.params.profileId, error });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
