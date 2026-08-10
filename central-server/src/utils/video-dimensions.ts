/**
 * Dimensions d'une vidéo à l'upload — le socle de tout diagnostic de format.
 *
 * ## Pourquoi
 *
 * Aucune dimension n'était stockée : `videos.metadata` ne contenait qu'un `title`,
 * et `video_variants.width/height` restaient NULL sur 100 % des rows. Conséquence,
 * `validateLedFormat()` — censé prévenir « ta vidéo ne correspond pas au ruban » —
 * tombait systématiquement en verdict `unknown`, et personne ne pouvait savoir ce
 * qui partait vraiment sur un écran.
 *
 * La capacité existait pourtant déjà : `thumbnailService.extractMetadata()` lit
 * width/height/durée via ffprobe depuis toujours, sans **aucun** consommateur. Ce
 * module se contente de la brancher, avec un contrat sûr pour un chemin d'upload.
 *
 * ## Contrat
 *
 * Ne lève **jamais** et ne bloque **jamais** un upload : une vidéo dont on ne sait
 * pas lire les dimensions doit continuer à s'uploader — on perd le diagnostic, pas
 * le fichier. `null` signifie « inconnu », jamais « invalide ».
 */

import { thumbnailService } from '../services/thumbnail.service';
import logger from '../config/logger';

/** Dimensions mesurées d'une vidéo. `null` quand ffprobe n'a rien pu lire. */
export interface VideoDimensions {
  width: number;
  height: number;
  /** Durée en secondes, arrondie au centième. `0` si illisible. */
  duration: number;
  /** Images par seconde. `0` si illisible. */
  fps: number;
}

/**
 * Mesure une vidéo sur disque. Renvoie `null` si le fichier est absent, illisible,
 * ou si ffprobe ne rend pas de dimensions exploitables.
 *
 * `extractMetadata` renvoie déjà `0` par défaut au lieu de lever — on traite ce `0`
 * comme « inconnu » plutôt que de persister des dimensions nulles, qui seraient
 * pires que l'absence : elles feraient croire à une mesure.
 */
export async function probeVideoDimensions(
  filePath: string | undefined | null
): Promise<VideoDimensions | null> {
  if (!filePath) return null;

  try {
    const meta = await thumbnailService.extractMetadata(filePath);
    if (!meta.width || !meta.height) {
      logger.debug('probeVideoDimensions: dimensions illisibles', { filePath });
      return null;
    }
    return {
      width: meta.width,
      height: meta.height,
      duration: Math.round(meta.duration * 100) / 100,
      fps: meta.fps,
    };
  } catch (error) {
    // Défensif : `extractMetadata` ne lève pas, mais un upload ne doit jamais
    // tomber à cause d'une sonde.
    logger.warn('probeVideoDimensions: sonde en échec (upload poursuivi)', {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Fragment à fusionner dans `videos.metadata`. Vide quand la mesure a échoué —
 * on n'écrit pas de clés à `null` qui pollueraient le JSONB sans rien apprendre.
 */
export function dimensionsMetadata(dim: VideoDimensions | null): Record<string, number> {
  if (!dim) return {};
  return {
    width: dim.width,
    height: dim.height,
    duration: dim.duration,
    ...(dim.fps > 0 ? { fps: dim.fps } : {}),
  };
}
