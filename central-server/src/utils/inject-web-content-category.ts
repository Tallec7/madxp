import { videoRepository } from '../repositories';
import logger from '../config/logger';

interface CategoryLike {
  id: string;
  name: string;
  videos?: unknown[];
  subCategories?: CategoryLike[];
}

interface TimeCategoryLike {
  id?: string;
  name?: string;
  categoryIds?: string[];
}

export const WEB_CATEGORY_ID = 'web-content';
export const WEB_CATEGORY_NAME = 'Web / Live';

/**
 * ADR-089 — Injecte une pseudo-catégorie "Web / Live" dans la config.
 * Partagée entre `remote.controller`, `saas.controller` et sync-agent (via Pi config push)
 * pour exposer les web_page/livestream côté Remote sans modifier les profils config.
 *
 * Returns `{ categories, hasWebContent }` so the caller can decide whether to
 * patch timeCategories.categoryIds (cf. registerWebContentInTimeCategories).
 */
export async function injectWebContentCategory(
  categories: CategoryLike[],
  siteId: string,
): Promise<CategoryLike[]> {
  const { categories: out } = await injectWebContentCategoryEx(categories, siteId);
  return out;
}

/**
 * Extended version: returns whether web content was injected so the caller can
 * also patch timeCategories.categoryIds (the Remote V1 filters categories per
 * phase via timeCategory.categoryIds — without that link, "Web / Live" is
 * never visible — cf. ADR-103 Phase 0.6 visibility fix).
 */
export async function injectWebContentCategoryEx(
  categories: CategoryLike[],
  siteId: string,
): Promise<{ categories: CategoryLike[]; hasWebContent: boolean }> {
  const out = categories.filter(c => c.id !== WEB_CATEGORY_ID);
  try {
    const webContent = await videoRepository.findWebContentForSite(siteId);
    if (webContent.length === 0) return { categories: out, hasWebContent: false };
    out.push({
      id: WEB_CATEGORY_ID,
      name: WEB_CATEGORY_NAME,
      videos: webContent.map(row => ({
        name: row.name,
        path: row.external_url,
        contentType: row.content_type,
        externalUrl: row.external_url,
        durationSeconds: row.duration,
        thumbnailUrl: row.thumbnail_url ?? null,
      })),
    });
    return { categories: out, hasWebContent: true };
  } catch (err) {
    logger.warn('injectWebContentCategory failed (non-fatal)', {
      siteId,
      error: (err as Error).message,
    });
    return { categories: out, hasWebContent: false };
  }
}

/**
 * ADR-103 Phase 0.6 — register the web-content pseudo-category in every
 * timeCategory.categoryIds[] so the Remote V1 (which filters categories per
 * phase) actually displays "Web / Live".
 *
 * Idempotent: skips timeCategories that already contain WEB_CATEGORY_ID.
 * No-op when hasWebContent is false (no rows for this site → don't pollute
 * the categoryIds with a phantom id).
 */
export function registerWebContentInTimeCategories(
  timeCategories: TimeCategoryLike[] | undefined,
  hasWebContent: boolean,
): TimeCategoryLike[] {
  if (!Array.isArray(timeCategories)) return [];
  if (!hasWebContent) return timeCategories;
  return timeCategories.map(tc => {
    const ids = Array.isArray(tc.categoryIds) ? tc.categoryIds : [];
    if (ids.includes(WEB_CATEGORY_ID)) return tc;
    return { ...tc, categoryIds: [...ids, WEB_CATEGORY_ID] };
  });
}
