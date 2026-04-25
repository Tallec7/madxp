/**
 * Retire toutes les références à une vidéo (par filename ou video_id) d'une
 * configuration. Utilisé par la cascade DELETE (PR2.1) pour nettoyer les
 * `config_profiles.configuration` JSONB et `sites.local_config_mirror` quand
 * une vidéo est supprimée.
 *
 * Sans ce nettoyage, la cascade backend (PR2 — site_videos via SQL CASCADE
 * + push reload) laisse les profils JSONB référencer la vidéo morte. Le Pi /
 * SaaS télécharge la nouvelle config, voit la vidéo, l'ajoute à sa loop,
 * tente de la jouer → 404 → écran figé (incident PR #613).
 *
 * Pattern identique à `extractVideoPaths` : parcourt sponsors,
 * categories.videos, categories.subCategories.videos, timeCategories.loopVideos.
 */

import { extractFilenameFromPath } from './config-video-paths';

/**
 * Type minimal pour les configurations stockées en DB JSONB. Évite de coupler
 * cette util à `SiteConfiguration` (qui est strict-typé) : on accepte des
 * configs partielles / héritées de différents schemas (config_profiles
 * legacy vs nouveau).
 */
type ConfigShape = {
  sponsors?: Array<{ path?: string; video_id?: string } & Record<string, unknown>>;
  categories?: Array<{
    videos?: Array<{ path?: string; video_id?: string } & Record<string, unknown>>;
    subCategories?: Array<{
      videos?: Array<{ path?: string; video_id?: string } & Record<string, unknown>>;
    } & Record<string, unknown>>;
  } & Record<string, unknown>>;
  timeCategories?: Array<{
    loopVideos?: Array<{ path?: string; video_id?: string } & Record<string, unknown>>;
  } & Record<string, unknown>>;
} & Record<string, unknown>;

interface RemovalCriteria {
  videoId?: string;   // UUID — match exact sur entry.video_id
  filename?: string;  // ex "JOUEUR_85.mp4" — match exact sur extractFilenameFromPath(entry.path)
}

/**
 * Retourne true si l'entrée référence la vidéo à supprimer (par video_id ou
 * filename). Tolérant : si filename ne match pas le path complet, compare le
 * filename extrait.
 */
function entryMatches(
  entry: { path?: string; video_id?: string } & Record<string, unknown>,
  criteria: RemovalCriteria,
): boolean {
  if (criteria.videoId && entry.video_id === criteria.videoId) return true;
  if (criteria.filename && entry.path) {
    const entryFilename = extractFilenameFromPath(entry.path);
    if (entryFilename === criteria.filename) return true;
  }
  return false;
}

/**
 * Mute la config en place et retourne le nombre d'entrées retirées
 * (sponsors + categories.videos + subCategories.videos + timeCategories.loopVideos).
 */
export function removeVideoFromConfig(
  config: ConfigShape,
  criteria: RemovalCriteria,
): number {
  if (!criteria.videoId && !criteria.filename) {
    return 0;
  }

  let removed = 0;

  if (Array.isArray(config.sponsors)) {
    const before = config.sponsors.length;
    config.sponsors = config.sponsors.filter(s => !entryMatches(s, criteria));
    removed += before - config.sponsors.length;
  }

  if (Array.isArray(config.categories)) {
    for (const category of config.categories) {
      if (Array.isArray(category.videos)) {
        const before = category.videos.length;
        category.videos = category.videos.filter(v => !entryMatches(v, criteria));
        removed += before - category.videos.length;
      }
      if (Array.isArray(category.subCategories)) {
        for (const subCat of category.subCategories) {
          if (Array.isArray(subCat.videos)) {
            const before = subCat.videos.length;
            subCat.videos = subCat.videos.filter(v => !entryMatches(v, criteria));
            removed += before - subCat.videos.length;
          }
        }
      }
    }
  }

  if (Array.isArray(config.timeCategories)) {
    for (const timeCategory of config.timeCategories) {
      if (Array.isArray(timeCategory.loopVideos)) {
        const before = timeCategory.loopVideos.length;
        timeCategory.loopVideos = timeCategory.loopVideos.filter(v => !entryMatches(v, criteria));
        removed += before - timeCategory.loopVideos.length;
      }
    }
  }

  return removed;
}
