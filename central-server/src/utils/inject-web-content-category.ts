import { videoRepository } from '../repositories';
import logger from '../config/logger';

interface CategoryLike {
  id: string;
  name: string;
  videos?: unknown[];
  subCategories?: CategoryLike[];
}

const WEB_CATEGORY_ID = 'web-content';

/**
 * ADR-088 — Injecte une pseudo-catégorie "Web / Live" dans la config.
 * Partagée entre `remote.controller`, `saas.controller` et sync-agent (via Pi config push)
 * pour exposer les web_page/livestream côté Remote sans modifier les profils config.
 */
export async function injectWebContentCategory(
  categories: CategoryLike[],
  siteId: string,
): Promise<CategoryLike[]> {
  const out = categories.filter(c => c.id !== WEB_CATEGORY_ID);
  try {
    const webContent = await videoRepository.findWebContentForSite(siteId);
    if (webContent.length === 0) return out;
    out.push({
      id: WEB_CATEGORY_ID,
      name: 'Web / Live',
      videos: webContent.map(row => ({
        name: row.name,
        path: row.external_url,
        contentType: row.content_type,
        externalUrl: row.external_url,
        durationSeconds: row.duration,
        thumbnailUrl: row.thumbnail_url ?? null,
      })),
    });
    return out;
  } catch (err) {
    logger.warn('injectWebContentCategory failed (non-fatal)', {
      siteId,
      error: (err as Error).message,
    });
    return out;
  }
}
