/**
 * Sponsor Auto-Resolution Service
 *
 * Résout automatiquement les site_sponsor_id pour toutes les vidéos d'une
 * SiteConfiguration au moment du déploiement.
 *
 * Logique :
 * 1. Collecte tous les paths vidéo (boucles, catégories, sous-catégories)
 * 2. Extrait le bare filename de chaque path
 * 3. Match en bulk contre site_sponsor_videos
 * 4. Injecte site_sponsor_id là où un match existe
 * 5. Respecte les overrides manuels (site_sponsor_id déjà défini)
 */

import logger from '../config/logger';
import { siteSponsorRepository } from '../repositories/site-sponsor.repository';
import { metricsService } from './metrics.service';
import type {
  SiteConfiguration,
} from '../types';

export interface SponsorAutoResolutionResult {
  /** Configuration enrichie avec les site_sponsor_id résolus */
  configuration: SiteConfiguration;
  /** Nombre de vidéos ayant reçu un site_sponsor_id */
  resolved: number;
  /** Nombre de vidéos avec un site_sponsor_id déjà défini (override manuel) */
  skipped: number;
  /** Nombre de vidéos sans match dans site_sponsor_videos */
  unresolved: number;
}

/** Vidéo avec un site_sponsor_id optionnel (union des types boucle + catégorie) */
interface VideoWithSponsor {
  path: string;
  site_sponsor_id?: string;
}

/**
 * Extrait le bare filename d'un path vidéo.
 * "videos/BOUCLE/07_A_L_AFFUT.mp4" → "07_A_L_AFFUT.mp4"
 */
function extractFilename(videoPath: string): string {
  const parts = videoPath.split('/');
  return parts[parts.length - 1] || videoPath;
}

/**
 * Collecte toutes les vidéos d'une SiteConfiguration avec leur emplacement.
 * Retourne des références mutables pour injection directe.
 */
function collectAllVideos(config: SiteConfiguration): VideoWithSponsor[] {
  const videos: VideoWithSponsor[] = [];

  // 1. Boucle par défaut (sponsors[])
  if (Array.isArray(config.sponsors)) {
    for (const video of config.sponsors) {
      videos.push(video);
    }
  }

  // 2. Boucles par phase (timeCategories[].loopVideos[])
  if (Array.isArray(config.timeCategories)) {
    for (const tc of config.timeCategories) {
      if (Array.isArray(tc.loopVideos)) {
        for (const video of tc.loopVideos) {
          videos.push(video);
        }
      }
    }
  }

  // 3. Catégories (categories[].videos[] + categories[].subCategories[].videos[])
  if (Array.isArray(config.categories)) {
    for (const cat of config.categories) {
      if (Array.isArray(cat.videos)) {
        for (const video of cat.videos) {
          videos.push(video as VideoWithSponsor);
        }
      }
      if (Array.isArray(cat.subCategories)) {
        for (const sub of cat.subCategories) {
          if (Array.isArray(sub.videos)) {
            for (const video of sub.videos) {
              videos.push(video as VideoWithSponsor);
            }
          }
        }
      }
    }
  }

  return videos;
}

/**
 * Auto-résout les site_sponsor_id pour toutes les vidéos d'une configuration.
 *
 * - Deep-clone la config (pas de mutation de l'original)
 * - Respecte les overrides manuels (site_sponsor_id déjà défini)
 * - Un seul appel DB bulk via resolveSiteSponsorIdsByFilenameBulk()
 */
export async function autoResolveSponsorIds(
  siteId: string,
  configuration: SiteConfiguration
): Promise<SponsorAutoResolutionResult> {
  // Deep-clone pour ne pas muter l'original
  const clonedConfig: SiteConfiguration = JSON.parse(JSON.stringify(configuration));

  const allVideos = collectAllVideos(clonedConfig);

  if (allVideos.length === 0) {
    return { configuration: clonedConfig, resolved: 0, skipped: 0, unresolved: 0 };
  }

  // Séparer les vidéos à résoudre de celles déjà assignées
  let skipped = 0;
  const toResolve: Array<{ video: VideoWithSponsor; filename: string }> = [];

  for (const video of allVideos) {
    if (video.site_sponsor_id) {
      skipped++;
      continue;
    }
    const filename = extractFilename(video.path);
    if (filename) {
      toResolve.push({ video, filename });
    }
  }

  if (toResolve.length === 0) {
    metricsService.recordSponsorAutoResolution('skipped', skipped);
    return { configuration: clonedConfig, resolved: 0, skipped, unresolved: 0 };
  }

  // Résolution bulk en un seul appel DB
  const pairs = toResolve.map(({ filename }) => ({ videoFilename: filename, siteId }));
  const resolutionMap = await siteSponsorRepository.resolveSiteSponsorIdsByFilenameBulk(pairs);

  // Injection des site_sponsor_id résolus
  let resolved = 0;
  let unresolved = 0;

  for (const { video, filename } of toResolve) {
    const key = `${filename}::${siteId}`;
    const siteSponsorId = resolutionMap.get(key);
    if (siteSponsorId) {
      video.site_sponsor_id = siteSponsorId;
      resolved++;
    } else {
      unresolved++;
    }
  }

  // Métriques Prometheus
  if (resolved > 0) metricsService.recordSponsorAutoResolution('resolved', resolved);
  if (skipped > 0) metricsService.recordSponsorAutoResolution('skipped', skipped);
  if (unresolved > 0) metricsService.recordSponsorAutoResolution('unresolved', unresolved);

  logger.info('Sponsor auto-resolution completed', {
    siteId,
    total: allVideos.length,
    resolved,
    skipped,
    unresolved,
  });

  return { configuration: clonedConfig, resolved, skipped, unresolved };
}
