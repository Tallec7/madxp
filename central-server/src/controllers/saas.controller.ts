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
import {
  siteRepository,
  configProfileRepository,
  videoRepository,
  remotePreferencesRepository,
} from '../repositories';
import { getVideoUrl } from '../services/storage.service';
import { signVideoStreamToken } from '../services/video-token.service';
import { metricsService } from '../services/metrics.service';
import { enrichConfigWithAnalyticsMetadata } from '../utils/config-analytics-metadata';
import { enrichConfigWithDisplayVariants, resolveDisplayTypesForSite } from '../utils/config-secondary-variants';
import { buildFuzzyIndex as buildFuzzyFilenameIndex, resolveStoragePath } from '../utils/filename-resolver';
import { SiteConfiguration } from '../types';
import { injectWebContentCategoryEx, registerWebContentInTimeCategories } from '../utils/inject-web-content-category';
import {
  collectSyntheticWebContentFilenames,
  resolveSyntheticWebContent,
  stripSyntheticWebContent,
} from '../utils/strip-synthetic-web-content';
import logger from '../config/logger';

interface VideoVariant {
  path: string;
  filename?: string;
  width?: number;
  height?: number;
  duration?: number;
}

interface VideoLike {
  path?: string;
  name?: string;
  type?: string;
  weight?: number;
  pinned?: boolean;
  // Index signature pour accepter tous display types : 'secondary', 'led-banner', 'totem', etc.
  variants?: Record<string, VideoVariant>;
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
 * Build the public URL the SaaS browser will hit for a given storage path.
 * ADR-068: when VIDEO_STREAM_PROXY_ENABLED=true, emit a short-lived signed
 * URL pointing at the streaming proxy; otherwise keep the direct FTP URL
 * for backwards compatibility during the feature flag rollout.
 */
function buildPublicVideoUrl(storagePath: string, siteId: string): string {
  if (process.env.VIDEO_STREAM_PROXY_ENABLED !== 'true') {
    return getVideoUrl(storagePath);
  }
  const base = (process.env.API_PUBLIC_URL || '').replace(/\/+$/, '');
  const token = signVideoStreamToken(storagePath, siteId);
  return `${base}/api/videos/stream?token=${encodeURIComponent(token)}`;
}

/**
 * Résout un chemin vidéo en URL publique (FTP direct ou proxy signé selon ADR-068).
 * ADR-083 : lookup exact puis fallback fuzzy (normalisation Unicode + casse +
 * espaces/points/tirets → _) pour auto-healing des configs legacy où filename
 * config ≠ filename DB (ex: spaces cloned from Pi, renames, accents).
 * Dernier recours = filename brut (anciens uploads à plat).
 */
function resolveVideoUrl(
  path: string | undefined,
  storagePathMap: Map<string, string>,
  fuzzyIndex: Map<string, string>,
  siteId: string
): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const filename = path.split('/').pop() || path;

  const { storagePath, result } = resolveStoragePath(filename, storagePathMap, fuzzyIndex);
  metricsService.recordVideoPathResolution(result);
  if (result === 'fuzzy') {
    logger.warn('SaaS config path drift healed via fuzzy match', {
      siteId,
      configFilename: filename,
      resolvedStoragePath: storagePath,
    });
  } else if (result === 'miss') {
    logger.warn('SaaS config path drift — no match found', { siteId, configFilename: filename });
  }
  return buildPublicVideoUrl(storagePath, siteId);
}

/**
 * Résout toutes les URLs vidéo dans un tableau de vidéos.
 */
function resolveVideoUrls(videos: VideoLike[], storagePathMap: Map<string, string>, fuzzyIndex: Map<string, string>, siteId: string): VideoLike[] {
  return videos.map(v => {
    const resolved: VideoLike = {
      ...v,
      path: resolveVideoUrl(v.path, storagePathMap, fuzzyIndex, siteId),
    };
    // Resolve variant paths: storage_path is already set by enrichConfigWithDisplayVariants,
    // so pass it directly to buildPublicVideoUrl instead of looking up in storagePathMap.
    // Itère sur tous les display types (secondary, led-banner, totem, …) — pas seulement
    // 'secondary' (régression PR #921 N-display côté URL resolution).
    if (v.variants) {
      const resolvedVariants: Record<string, VideoVariant> = {};
      for (const [displayType, variant] of Object.entries(v.variants)) {
        if (variant?.path) {
          resolvedVariants[displayType] = {
            ...variant,
            path: buildPublicVideoUrl(variant.path, siteId),
          };
        } else {
          resolvedVariants[displayType] = variant;
        }
      }
      resolved.variants = resolvedVariants;
    }
    return resolved;
  });
}

/**
 * Résout les URLs vidéo dans les catégories (récursif pour les sous-catégories).
 */
function resolveCategories(categories: CategoryLike[], storagePathMap: Map<string, string>, fuzzyIndex: Map<string, string>, siteId: string): CategoryLike[] {
  return categories.map(cat => ({
    ...cat,
    videos: cat.videos ? resolveVideoUrls(cat.videos, storagePathMap, fuzzyIndex, siteId) : [],
    subCategories: cat.subCategories ? resolveCategories(cat.subCategories, storagePathMap, fuzzyIndex, siteId) : [],
  }));
}

/**
 * Résout les URLs vidéo dans les timeCategories.
 */
function resolveTimeCategories(timeCategories: TimeCategoryLike[], storagePathMap: Map<string, string>, fuzzyIndex: Map<string, string>, siteId: string): TimeCategoryLike[] {
  return timeCategories.map(tc => ({
    ...tc,
    loopVideos: tc.loopVideos ? resolveVideoUrls(tc.loopVideos, storagePathMap, fuzzyIndex, siteId) : [],
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

    // Write-through sites.displays → configuration.displays (symétrique ADR-114 Pi).
    // Le receiver SaaS lit configuration.displays[idx].type pour résoudre le displayType
    // (cf. tv.component.ts:resolveDisplayType). Sans cette synchronisation, modifier
    // sites.displays côté dashboard reste invisible du receiver tant que le profil
    // n'est pas réécrit manuellement → variants jamais résolues.
    try {
      const siteDisplays = await siteRepository.getDisplays(siteId);
      if (siteDisplays.length > 0) {
        (configuration as Record<string, unknown>).displays = siteDisplays;
      }
    } catch (err) {
      logger.warn('SaaS config: sites.displays write-through failed (non-fatal)', { siteId, error: err });
    }

    // Enrichir avec les variantes display (secondary, led, etc.) selon les displays du site
    try {
      const displayTypes = await resolveDisplayTypesForSite(siteId);
      await enrichConfigWithDisplayVariants(configuration as unknown as SiteConfiguration, displayTypes);
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

    // ADR-103 Phase 2 — first try to RESOLVE synthetic web_page/livestream entries
    // to their real shape (path = external_url, contentType, externalUrl,
    // durationSeconds). The dashboard "Add to..." flow saves them with the
    // synthetic filename until Phase 3 fixes the dashboard. Resolved entries
    // can play in loops + manual via WebContentService.
    const cfgAsRecord = configuration as Record<string, unknown>;
    const synthFilenames = collectSyntheticWebContentFilenames(cfgAsRecord);
    if (synthFilenames.length > 0) {
      try {
        const lookup = await videoRepository.findWebContentByFilenames(synthFilenames);
        const resolved = resolveSyntheticWebContent(cfgAsRecord, lookup);
        if (resolved.sponsorsResolved + resolved.loopVideosResolved + resolved.categoryVideosResolved > 0) {
          logger.info('SaaS config: resolved synthetic web_page/livestream entries (ADR-103 Phase 2)', { siteId, ...resolved });
        }
      } catch (err) {
        logger.warn('SaaS config: resolveSyntheticWebContent failed (non-fatal — strip will catch leftovers)', { siteId, error: err });
      }
    }

    // ADR-103 Phase 0.5 — strip any synthetic entries that COULD NOT be resolved
    // above (DB row deleted, mismatched, etc.). This prevents the TV from
    // ever seeing a synthetic path that would crash the DoubleBuffer.
    const stripSummary = stripSyntheticWebContent(cfgAsRecord);
    if (stripSummary.sponsorsRemoved + stripSummary.loopVideosRemoved + stripSummary.categoryVideosRemoved > 0) {
      logger.warn('SaaS config: stripped unresolvable synthetic web_page/livestream entries (ADR-103 Phase 0.5)', { siteId, ...stripSummary });
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

    // Then resolve video URLs (filename → storage_path) with fuzzy fallback (ADR-083)
    const fuzzyIndex = buildFuzzyFilenameIndex(storagePathMap);
    const resolvedSponsors = resolveVideoUrls(sponsorsWithThumbs, storagePathMap, fuzzyIndex, siteId);
    const resolvedCategories = resolveCategories(categoriesWithThumbs, storagePathMap, fuzzyIndex, siteId);
    const resolvedTimeCategories = resolveTimeCategories(timeCategoriesWithThumbs, storagePathMap, fuzzyIndex, siteId);

    // ADR-089 — Auto-inject pseudo-category "Web / Live" for Remote raspberry
    // ADR-103 Phase 0.6 — also register the pseudo-category id in every
    // timeCategory.categoryIds[] so the Remote V1 (which filters categories
    // per phase) actually displays it. Without this, the pseudo-category sits
    // in `categories[]` but is never reachable from the navigation flow.
    const { categories: categoriesWithWeb, hasWebContent } = await injectWebContentCategoryEx(
      resolvedCategories as Parameters<typeof injectWebContentCategoryEx>[0],
      siteId,
    );
    const timeCategoriesWithWeb = registerWebContentInTimeCategories(
      resolvedTimeCategories as Parameters<typeof registerWebContentInTimeCategories>[0],
      hasWebContent,
    );

    const resolvedConfig = {
      remote: configuration.remote || { title: `Télécommande ${site.club_name || site.site_name}` },
      auth: configuration.auth || { password: '', sessionDuration: 28800000 },
      version: configuration.version || '1.0',
      sponsors: resolvedSponsors,
      categories: categoriesWithWeb,
      timeCategories: timeCategoriesWithWeb,
      liveScoreEnabled: (configuration.liveScoreEnabled as boolean) ?? false,
      scoreOverlay: configuration.scoreOverlay || null,
      watermark: configuration.watermark || null,
      settings: configuration.settings || {},
      // displays: pré-rempli par le write-through sites.displays plus haut.
      // Sans ce champ dans resolvedConfig, le receiver TV tombe en fallback legacy
      // idx→'secondary' et ne peut pas résoudre les variantes 'led-banner' / 'totem'.
      displays: configuration.displays,
    };

    // Feature overrides (ADR-039 Phase 3) — exposés au navigateur SaaS pour le gating
    // côté client (ex: `remote_v2` toggle par site pour la télécommande V2).
    const featureOverrides: Record<string, boolean> = site.feature_overrides
      ? typeof site.feature_overrides === 'string'
        ? JSON.parse(site.feature_overrides)
        : (site.feature_overrides as Record<string, boolean>)
      : {};

    // Métadonnées du site
    const response = {
      siteId,
      siteName: site.site_name,
      clubName: site.club_name,
      sport: site.sport || null,
      featureOverrides,
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

    const result = profiles.map((p: { id: string; name: string; display_name: string | null; city: string | null; sport: string | null; is_default: boolean; sort_order: number; remote_pin_required?: boolean }) => ({
      id: p.id,
      name: p.name,
      displayName: p.display_name,
      city: p.city,
      sport: p.sport,
      isDefault: p.is_default,
      sortOrder: p.sort_order,
      pinRequired: !!p.remote_pin_required,
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

    // Write-through sites.displays → configuration.displays (cf. getSaasConfig).
    try {
      const siteDisplays = await siteRepository.getDisplays(siteId);
      if (siteDisplays.length > 0) {
        (configuration as Record<string, unknown>).displays = siteDisplays;
      }
    } catch (err) {
      logger.warn('SaaS profile config: sites.displays write-through failed (non-fatal)', { siteId, profileId, error: err });
    }

    try {
      const displayTypes = await resolveDisplayTypesForSite(siteId);
      await enrichConfigWithDisplayVariants(configuration as unknown as SiteConfiguration, displayTypes);
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

    // ADR-103 Phase 2 — resolve synthetic entries to their real shape, then strip leftovers.
    const cfgAsRecord = configuration as Record<string, unknown>;
    const synthFilenames = collectSyntheticWebContentFilenames(cfgAsRecord);
    if (synthFilenames.length > 0) {
      try {
        const lookup = await videoRepository.findWebContentByFilenames(synthFilenames);
        const resolved = resolveSyntheticWebContent(cfgAsRecord, lookup);
        if (resolved.sponsorsResolved + resolved.loopVideosResolved + resolved.categoryVideosResolved > 0) {
          logger.info('SaaS profile config: resolved synthetic web_page/livestream entries (ADR-103 Phase 2)', { siteId, profileId, ...resolved });
        }
      } catch (err) {
        logger.warn('SaaS profile config: resolveSyntheticWebContent failed (non-fatal)', { siteId, profileId, error: err });
      }
    }

    const stripSummary = stripSyntheticWebContent(cfgAsRecord);
    if (stripSummary.sponsorsRemoved + stripSummary.loopVideosRemoved + stripSummary.categoryVideosRemoved > 0) {
      logger.warn('SaaS profile config: stripped unresolvable synthetic web_page/livestream entries (ADR-103 Phase 0.5)', { siteId, profileId, ...stripSummary });
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

    // Then resolve video URLs (filename → storage_path) with fuzzy fallback (ADR-083)
    const fuzzyIndex = buildFuzzyFilenameIndex(storagePathMap);
    const resolvedSponsors = resolveVideoUrls(sponsorsWithThumbs, storagePathMap, fuzzyIndex, siteId);
    const resolvedCategories = resolveCategories(categoriesWithThumbs, storagePathMap, fuzzyIndex, siteId);
    const resolvedTimeCategories = resolveTimeCategories(timeCategoriesWithThumbs, storagePathMap, fuzzyIndex, siteId);

    // ADR-089 + ADR-103 Phase 0.6 — pseudo-category + register in timeCategories
    const { categories: categoriesWithWeb, hasWebContent } = await injectWebContentCategoryEx(
      resolvedCategories as Parameters<typeof injectWebContentCategoryEx>[0],
      siteId,
    );
    const timeCategoriesWithWeb = registerWebContentInTimeCategories(
      resolvedTimeCategories as Parameters<typeof registerWebContentInTimeCategories>[0],
      hasWebContent,
    );

    const resolvedConfig = {
      remote: configuration.remote || { title: `Télécommande ${profile.display_name || profile.name}` },
      auth: configuration.auth || { password: '', sessionDuration: 28800000 },
      version: configuration.version || '1.0',
      sponsors: resolvedSponsors,
      categories: categoriesWithWeb,
      timeCategories: timeCategoriesWithWeb,
      liveScoreEnabled: (configuration.liveScoreEnabled as boolean) ?? false,
      scoreOverlay: configuration.scoreOverlay || null,
      watermark: configuration.watermark || null,
      settings: configuration.settings || {},
      displays: configuration.displays,
    };

    const featureOverrides: Record<string, boolean> = site.feature_overrides
      ? typeof site.feature_overrides === 'string'
        ? JSON.parse(site.feature_overrides)
        : (site.feature_overrides as Record<string, boolean>)
      : {};

    return res.json({
      siteId,
      siteName: site.site_name,
      clubName: site.club_name,
      profileId: profile.id,
      profileName: profile.display_name || profile.name,
      sport: profile.sport || site.sport || null,
      featureOverrides,
      configuration: resolvedConfig,
    });
  } catch (error) {
    logger.error('Error loading SaaS profile config', { siteId: req.params.siteId, profileId: req.params.profileId, error });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/saas/:siteId/profiles/:profileId/preferences  (ADR-102)
 *
 * Charge les préférences UX (prefs + widgets) sauvegardées pour ce profil.
 * Retourne `{ prefs: {}, widgets: {} }` si aucune ligne — le frontend
 * applique ses defaults.
 */
export async function getRemotePreferences(req: Request, res: Response) {
  try {
    const { siteId, profileId } = req.params;

    const profile = await configProfileRepository.findById(profileId);
    if (!profile || profile.site_id !== siteId) {
      return res.status(404).json({ error: 'Profil non trouvé' });
    }

    const row = await remotePreferencesRepository.findBySiteAndProfile(siteId, profileId);

    return res.json({
      prefs: row?.prefs ?? {},
      widgets: row?.widgets ?? {},
      updatedAt: row?.updated_at ?? null,
    });
  } catch (error) {
    logger.error('Error loading remote preferences', {
      siteId: req.params.siteId,
      profileId: req.params.profileId,
      error,
    });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * PUT /api/saas/:siteId/profiles/:profileId/preferences  (ADR-102)
 *
 * Upsert des préférences UX. Body validé par Joi (whitelist stricte). Au
 * moins un des deux objets `prefs` / `widgets` doit être fourni — l'autre
 * est conservé tel quel via le `COALESCE` du repository.
 *
 * Sécurité : route protégée par `verifyRemotePin` (cf. saas.routes.ts) →
 * un client doit avoir le même token de device qu'utilisé pour lire la
 * config du profil. Impossible de polluer les prefs sans le PIN du profil
 * (si défini), ou ouvert si le profil n'a pas de PIN — comportement
 * cohérent avec la lecture publique de la config.
 */
export async function upsertRemotePreferences(req: Request, res: Response) {
  try {
    const { siteId, profileId } = req.params;

    const profile = await configProfileRepository.findById(profileId);
    if (!profile || profile.site_id !== siteId) {
      return res.status(404).json({ error: 'Profil non trouvé' });
    }

    const { prefs, widgets } = req.body as {
      prefs?: Record<string, unknown>;
      widgets?: Record<string, unknown>;
    };

    const row = await remotePreferencesRepository.upsert(siteId, profileId, { prefs, widgets });

    return res.json({
      prefs: row.prefs,
      widgets: row.widgets,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    logger.error('Error upserting remote preferences', {
      siteId: req.params.siteId,
      profileId: req.params.profileId,
      error,
    });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

