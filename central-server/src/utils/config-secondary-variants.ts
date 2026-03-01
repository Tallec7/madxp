/**
 * Enrichit une SiteConfiguration avec les informations de variants secondaires.
 *
 * Parcourt toutes les vidéos de la configuration (sponsors, categories, timeCategories),
 * extrait les filenames, interroge la base pour récupérer les variants secondaires,
 * et injecte variants.secondary sur chaque entrée vidéo correspondante.
 */

import { SiteConfiguration, VideoVariants } from '../types';
import { videoVariantRepository } from '../repositories/video-variant.repository';
import { extractFilenameFromPath } from './config-video-paths';
import logger from '../config/logger';

/**
 * Enrichit la configuration avec les variants secondaires depuis la base de données.
 * Modifie la configuration en place et retourne le nombre de variants injectées.
 */
export async function enrichConfigWithSecondaryVariants(
  config: SiteConfiguration
): Promise<{ config: SiteConfiguration; enrichedCount: number }> {
  // 1. Extract all unique filenames from the config
  const filenameToEntries = new Map<string, Array<{ path: string; setVariants: (v: VideoVariants) => void }>>();

  const registerEntry = (
    path: string,
    setter: (v: VideoVariants) => void
  ): void => {
    const filename = extractFilenameFromPath(path);
    if (!filenameToEntries.has(filename)) {
      filenameToEntries.set(filename, []);
    }
    filenameToEntries.get(filename)!.push({ path, setVariants: setter });
  };

  // Sponsors
  if (config.sponsors) {
    for (const sponsor of config.sponsors) {
      if (sponsor.path) {
        registerEntry(sponsor.path, (v) => { sponsor.variants = v; });
      }
    }
  }

  // Categories
  if (config.categories) {
    for (const category of config.categories) {
      for (const video of category.videos || []) {
        if (video.path) {
          registerEntry(video.path, (v) => { video.variants = v; });
        }
      }
      for (const subCat of category.subCategories || []) {
        for (const video of subCat.videos || []) {
          if (video.path) {
            registerEntry(video.path, (v) => { video.variants = v; });
          }
        }
      }
    }
  }

  // Time Categories
  if (config.timeCategories) {
    for (const tc of config.timeCategories) {
      for (const video of tc.loopVideos || []) {
        if (video.path) {
          registerEntry(video.path, (v) => { video.variants = v; });
        }
      }
    }
  }

  if (filenameToEntries.size === 0) {
    return { config, enrichedCount: 0 };
  }

  // 2. Query secondary variants from DB
  const filenames = [...filenameToEntries.keys()];
  const variants = await videoVariantRepository.findSecondaryVariantsByFilenames(filenames);

  if (variants.length === 0) {
    return { config, enrichedCount: 0 };
  }

  // 3. Build filename → variant info map
  const variantMap = new Map<string, VideoVariants>();
  for (const v of variants) {
    const secondaryPath = `videos-secondary/${v.filename}`;
    variantMap.set(v.source_filename, {
      secondary: {
        path: secondaryPath,
        filename: v.filename,
        width: v.width ?? undefined,
        height: v.height ?? undefined,
        duration: v.duration ?? undefined,
      },
    });
  }

  // 4. Inject variants into config entries
  let enrichedCount = 0;
  for (const [filename, entries] of filenameToEntries) {
    const variant = variantMap.get(filename);
    if (variant) {
      for (const entry of entries) {
        entry.setVariants(variant);
        enrichedCount++;
      }
    }
  }

  if (enrichedCount > 0) {
    logger.info('Config enriched with secondary variants', {
      totalFilenames: filenames.length,
      variantsFound: variants.length,
      entriesEnriched: enrichedCount,
    });
  }

  return { config, enrichedCount };
}
