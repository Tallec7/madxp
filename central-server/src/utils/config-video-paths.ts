/**
 * Utilitaire d'extraction des chemins vidéo depuis une SiteConfiguration.
 * Partagé entre draft.service et d'autres services.
 */

import { SiteConfiguration } from '../types';
import { sanitizeFilename } from './sanitize-filename';

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

/**
 * Normalise les chemins vidéo d'une SiteConfiguration avant envoi au Pi.
 *
 * config_profiles.configuration stocke des noms de fichiers plats (ex: "TV_BUT_01.mp4")
 * sans préfixe. Le Pi route /videos/ via nginx → admin-server:8080 ; une URL plate
 * http://neopro.local/TV_BUT_01.mp4 retourne 404 car nginx cherche dans webapp/.
 *
 * Si un chemin ne contient pas "/" on ajoute le préfixe selon sa position dans la config :
 *  - sponsors[], timeCategories[].loopVideos[] → videos/default/<filename>
 *  - categories[i].videos[]                   → videos/<category.id>/<filename>
 *  - categories[i].subCategories[j].videos[]  → videos/<category.id>/<subCat.id>/<filename>
 *
 * Mute la config en place (même pattern que enrichConfigWithDisplayVariants).
 */
export function normalizeConfigVideoPaths(config: SiteConfiguration): void {
  // Sanitize le filename + ajoute le préfixe `videos/default/` si manquant.
  // Si un path est déjà préfixé (`videos/foo/bar.mp4`), on conserve le directory
  // mais on sanitize quand même le filename — incident NLF 2026-05-09 où des
  // entries avaient été éditées manuellement avec des apostrophes / espaces / &
  // dans le filename, qui ne matchaient plus le fichier réel sur disque.
  const fix = (rawPath: string): string => {
    const lastSlash = rawPath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? rawPath.slice(0, lastSlash) : 'videos/default';
    const filename = lastSlash >= 0 ? rawPath.slice(lastSlash + 1) : rawPath;
    if (!filename) return rawPath;
    return `${dir}/${sanitizeFilename(filename)}`;
  };

  if (config.sponsors) {
    for (const video of config.sponsors) {
      if (video.path) video.path = fix(video.path);
    }
  }

  if (config.categories) {
    for (const category of config.categories) {
      if (category.videos) {
        for (const video of category.videos) {
          if (video.path) video.path = fix(video.path);
        }
      }
      if (category.subCategories) {
        for (const subCat of category.subCategories) {
          if (subCat.videos) {
            for (const video of subCat.videos) {
              if (video.path) video.path = fix(video.path);
            }
          }
        }
      }
    }
  }

  if (config.timeCategories) {
    for (const tc of config.timeCategories) {
      if (tc.loopVideos) {
        for (const video of tc.loopVideos) {
          if (video.path) video.path = fix(video.path);
        }
      }
    }
  }
}
