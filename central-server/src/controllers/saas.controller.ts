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
import { siteRepository, configProfileRepository } from '../repositories';
import { getVideoUrl } from '../services/storage.service';
import { enrichConfigWithAnalyticsMetadata } from '../utils/config-analytics-metadata';
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
 * Si le path est déjà une URL complète, le retourner tel quel.
 */
function resolveVideoUrl(path: string | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // Config profiles store Pi-local paths like "videos/default/file.mp4"
  // but FTP stores files flat at the root — strip the Pi-local prefix
  const filename = path.split('/').pop() || path;
  return getVideoUrl(filename);
}

/**
 * Résout toutes les URLs vidéo dans un tableau de vidéos.
 */
function resolveVideoUrls(videos: VideoLike[]): VideoLike[] {
  return videos.map(v => ({
    ...v,
    path: resolveVideoUrl(v.path),
    variants: v.variants?.secondary ? {
      secondary: { path: resolveVideoUrl(v.variants.secondary.path) },
    } : v.variants,
  }));
}

/**
 * Résout les URLs vidéo dans les catégories (récursif pour les sous-catégories).
 */
function resolveCategories(categories: CategoryLike[]): CategoryLike[] {
  return categories.map(cat => ({
    ...cat,
    videos: cat.videos ? resolveVideoUrls(cat.videos) : [],
    subCategories: cat.subCategories ? resolveCategories(cat.subCategories) : [],
  }));
}

/**
 * Résout les URLs vidéo dans les timeCategories.
 */
function resolveTimeCategories(timeCategories: TimeCategoryLike[]): TimeCategoryLike[] {
  return timeCategories.map(tc => ({
    ...tc,
    loopVideos: tc.loopVideos ? resolveVideoUrls(tc.loopVideos) : [],
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

    // Enrichir avec les métadonnées analytics (video_id, sponsor_id, analytics_category)
    // avant la résolution des URLs pour que resolveVideoUrls préserve ces champs via spread
    try {
      await enrichConfigWithAnalyticsMetadata(configuration as unknown as SiteConfiguration);
    } catch { /* non-fatal — la config reste jouable sans métadonnées analytics */ }

    // Résoudre toutes les URLs vidéo (config vide = site fraîchement créé, retourner les defaults)
    const sponsors = (configuration.sponsors as VideoLike[]) || [];
    const categories = (configuration.categories as CategoryLike[]) || [];
    const timeCategories = (configuration.timeCategories as TimeCategoryLike[]) || [];

    const resolvedConfig = {
      remote: configuration.remote || { title: `Télécommande ${site.club_name || site.site_name}` },
      auth: configuration.auth || { password: '', sessionDuration: 28800000 },
      version: configuration.version || '1.0',
      sponsors: resolveVideoUrls(sponsors),
      categories: resolveCategories(categories),
      timeCategories: resolveTimeCategories(timeCategories),
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
      await enrichConfigWithAnalyticsMetadata(configuration as unknown as SiteConfiguration);
    } catch { /* non-fatal */ }

    const sponsors = (configuration.sponsors as VideoLike[]) || [];
    const categories = (configuration.categories as CategoryLike[]) || [];
    const timeCategories = (configuration.timeCategories as TimeCategoryLike[]) || [];

    const resolvedConfig = {
      remote: configuration.remote || { title: `Télécommande ${profile.display_name || profile.name}` },
      auth: configuration.auth || { password: '', sessionDuration: 28800000 },
      version: configuration.version || '1.0',
      sponsors: resolveVideoUrls(sponsors),
      categories: resolveCategories(categories),
      timeCategories: resolveTimeCategories(timeCategories),
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
