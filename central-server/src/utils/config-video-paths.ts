/**
 * Utilitaire d'extraction des chemins vidéo depuis une SiteConfiguration.
 * Partagé entre draft.service et predictive-alerts.service.
 */

import { SiteConfiguration } from '../types';

/**
 * Extrait tous les chemins de vidéos référencés dans une SiteConfiguration.
 * Parcourt sponsors[], categories[].videos[], categories[].subCategories[].videos[],
 * et timeCategories[].loopVideos[].
 *
 * @returns Liste dédupliquée de chemins vidéo
 */
export function extractVideoPaths(config: SiteConfiguration): string[] {
  const paths: string[] = [];

  // Sponsors (boucle par défaut)
  if (config.sponsors) {
    for (const sponsor of config.sponsors) {
      if (sponsor.path) {
        paths.push(sponsor.path);
      }
    }
  }

  // Categories
  if (config.categories) {
    for (const category of config.categories) {
      if (category.videos) {
        for (const video of category.videos) {
          if (video.path) {
            paths.push(video.path);
          }
        }
      }
      if (category.subCategories) {
        for (const subCat of category.subCategories) {
          if (subCat.videos) {
            for (const video of subCat.videos) {
              if (video.path) {
                paths.push(video.path);
              }
            }
          }
        }
      }
    }
  }

  // Time Categories (phases de match)
  if (config.timeCategories) {
    for (const timeCategory of config.timeCategories) {
      if (timeCategory.loopVideos) {
        for (const video of timeCategory.loopVideos) {
          if (video.path) {
            paths.push(video.path);
          }
        }
      }
    }
  }

  return [...new Set(paths)];
}

/**
 * Extrait le nom de fichier d'un chemin vidéo.
 * Ex: "videos/SPONSORS/video.mp4" → "video.mp4"
 */
export function extractFilenameFromPath(videoPath: string): string {
  const parts = videoPath.split('/');
  return parts[parts.length - 1];
}
