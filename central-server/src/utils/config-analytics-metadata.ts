/**
 * Enrichit une SiteConfiguration avec les métadonnées analytics (video_id, advertiser_id, analytics_category).
 *
 * Parcourt toutes les vidéos de la configuration (sponsors, categories, timeCategories),
 * extrait les filenames, interroge la base pour récupérer les métadonnées,
 * et injecte video_id / advertiser_id / sponsor_id / analytics_category sur chaque entrée.
 *
 * Pattern identique à config-secondary-variants.ts.
 */

import { SiteConfiguration, SponsorVideo, CategoryVideo } from '../types';
import { query } from '../config/database';
import { extractFilenameFromPath } from './config-video-paths';
import logger from '../config/logger';

interface AnalyticsMetadata {
  video_id: string;
  filename: string;
  advertiser_id: string | null;
  analytics_category: string | null;
}

type VideoEntry = SponsorVideo | CategoryVideo;

/**
 * Enrichit la configuration avec les métadonnées analytics depuis la base de données.
 * Modifie la configuration en place et retourne le nombre d'entrées enrichies.
 */
export async function enrichConfigWithAnalyticsMetadata(
  config: SiteConfiguration
): Promise<{ config: SiteConfiguration; enrichedCount: number }> {
  // 1. Collecter tous les filenames uniques avec leurs setter callbacks
  const filenameToEntries = new Map<string, Array<{ setMetadata: (m: AnalyticsMetadata) => void }>>();

  const registerEntry = (
    entry: VideoEntry
  ): void => {
    if (!entry.path) return;
    const filename = extractFilenameFromPath(entry.path);
    if (!filenameToEntries.has(filename)) {
      filenameToEntries.set(filename, []);
    }
    filenameToEntries.get(filename)!.push({
      setMetadata: (m: AnalyticsMetadata) => {
        entry.video_id = m.video_id;
        entry.analytics_category = m.analytics_category ?? undefined;
        // SponsorVideo a advertiser_id + sponsor_id (rétrocompat)
        if ('advertiser_id' in entry || 'sponsor_id' in entry || m.advertiser_id) {
          (entry as SponsorVideo).advertiser_id = m.advertiser_id ?? undefined;
          (entry as SponsorVideo).sponsor_id = m.advertiser_id ?? undefined;
        }
        // CategoryVideo a sponsor_id
        if (m.advertiser_id && 'sponsor_id' in entry) {
          entry.sponsor_id = m.advertiser_id;
        }
      },
    });
  };

  // Sponsors (boucle par défaut)
  if (config.sponsors) {
    for (const sponsor of config.sponsors) {
      registerEntry(sponsor);
    }
  }

  // Categories
  if (config.categories) {
    for (const category of config.categories) {
      for (const video of category.videos || []) {
        registerEntry(video);
      }
      for (const subCat of category.subCategories || []) {
        for (const video of subCat.videos || []) {
          registerEntry(video);
        }
      }
    }
  }

  // Time Categories
  if (config.timeCategories) {
    for (const tc of config.timeCategories) {
      for (const video of tc.loopVideos || []) {
        registerEntry(video);
      }
    }
  }

  if (filenameToEntries.size === 0) {
    return { config, enrichedCount: 0 };
  }

  // 2. Requête bulk : filename → (video_id, advertiser_id, analytics_category)
  const filenames = [...filenameToEntries.keys()];
  const result = await query(
    `SELECT v.id as video_id, v.filename,
            av.advertiser_id,
            COALESCE(
              v.metadata->>'analytics_category',
              CASE WHEN av.advertiser_id IS NOT NULL THEN 'sponsor' ELSE NULL END
            ) as analytics_category
     FROM videos v
     LEFT JOIN advertiser_videos av ON av.video_id = v.id AND av.is_primary = true
     WHERE v.filename = ANY($1)`,
    [filenames]
  );

  const rows = result.rows as unknown as AnalyticsMetadata[];

  if (rows.length === 0) {
    return { config, enrichedCount: 0 };
  }

  // 3. Construire la map filename → metadata
  const metadataMap = new Map<string, AnalyticsMetadata>();
  for (const row of rows) {
    metadataMap.set(row.filename, row);
  }

  // 4. Injecter les métadonnées dans les entrées vidéo
  let enrichedCount = 0;
  for (const [filename, entries] of filenameToEntries) {
    const metadata = metadataMap.get(filename);
    if (metadata) {
      for (const entry of entries) {
        entry.setMetadata(metadata);
        enrichedCount++;
      }
    }
  }

  if (enrichedCount > 0) {
    logger.info('Config enriched with analytics metadata', {
      totalFilenames: filenames.length,
      metadataFound: rows.length,
      entriesEnriched: enrichedCount,
    });
  }

  return { config, enrichedCount };
}
