/**
 * ADR-103 Phase 0.5 — Strip synthetic web_page/livestream entries from a config
 * BEFORE the URL resolver runs.
 *
 * The TV-side defensive filter introduced in Phase 0
 * (`raspberry/src/app/services/video-playback.service.ts`) checks `v.path`
 * against the synthetic `web_page-<ts>` / `livestream-<ts>` regex, but at that
 * point `path` has already been transformed to a JWT stream URL by
 * `saas.controller.resolveVideoUrls()` — the synthetic filename is hidden
 * inside the token, never visible as a string. As a result, the TV-side guard
 * never matches, and the rogue entry crashes the DoubleBuffer with
 * MEDIA_ELEMENT_ERROR (NLF SaaS regression observed 2026-04-29 even after
 * Phase 0 deploy v3.266.1).
 *
 * Phase 0.5 fixes the filter blind spot at the SOURCE: this helper is invoked
 * server-side, before resolveVideoUrls/buildPublicVideoUrl, when the path is
 * still the raw filename (e.g. `videos/default/web_page-1777392352039`).
 *
 * Stripping policy:
 *   - sponsors[]                  → drop synthetic entries
 *   - timeCategories[].loopVideos[] → drop synthetic entries (loop content only)
 *   - categories[].videos[]       → drop synthetic entries (recursive in subCategories)
 *
 * Note: the pseudo-category "Web / Live" injected at runtime by
 * `injectWebContentCategory` uses the *external_url* as path (never the
 * synthetic filename), so it is not affected by this filter.
 */

const SYNTHETIC_WEB_LIVE_RE = /(?:^|\/)(?:web_page|livestream)-\d+$/;

interface VideoEntryLike {
  path?: unknown;
  contentType?: unknown;
}

interface CategoryLike {
  id?: unknown;
  name?: unknown;
  videos?: VideoEntryLike[];
  subCategories?: CategoryLike[];
}

interface TimeCategoryLike {
  id?: unknown;
  name?: unknown;
  loopVideos?: VideoEntryLike[];
}

export function isSyntheticWebContentPath(rawPath: unknown): boolean {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return false;
  return SYNTHETIC_WEB_LIVE_RE.test(rawPath);
}

function stripVideoArray(arr: VideoEntryLike[] | undefined): { kept: VideoEntryLike[]; removed: number } {
  if (!Array.isArray(arr)) return { kept: [], removed: 0 };
  const kept = arr.filter(v => !isSyntheticWebContentPath(v?.path));
  return { kept, removed: arr.length - kept.length };
}

function stripCategories(categories: CategoryLike[] | undefined): { kept: CategoryLike[]; removed: number } {
  if (!Array.isArray(categories)) return { kept: [], removed: 0 };
  let removed = 0;
  const kept = categories.map(cat => {
    const { kept: vidsKept, removed: vidsRem } = stripVideoArray(cat.videos);
    const { kept: subsKept, removed: subsRem } = stripCategories(cat.subCategories);
    removed += vidsRem + subsRem;
    return { ...cat, videos: vidsKept, subCategories: subsKept };
  });
  return { kept, removed };
}

export interface StrippedConfigSummary {
  sponsorsRemoved: number;
  loopVideosRemoved: number;
  categoryVideosRemoved: number;
}

/**
 * Strip synthetic web_page/livestream entries from sponsors[], timeCategories[].loopVideos[],
 * and categories[].videos[] (recursive). Mutates the input config in place AND returns
 * a summary count for logging/metrics.
 *
 * Type uses `Record<string, unknown>` because the shape varies between callers
 * (saas.controller has VideoLike, remote.controller uses unknown[]). The function
 * works structurally on the keys it cares about.
 */
export function stripSyntheticWebContent(config: Record<string, unknown>): StrippedConfigSummary {
  const summary: StrippedConfigSummary = {
    sponsorsRemoved: 0,
    loopVideosRemoved: 0,
    categoryVideosRemoved: 0,
  };

  if (Array.isArray(config.sponsors)) {
    const { kept, removed } = stripVideoArray(config.sponsors as VideoEntryLike[]);
    config.sponsors = kept;
    summary.sponsorsRemoved = removed;
  }

  if (Array.isArray(config.timeCategories)) {
    let totalLoopRemoved = 0;
    config.timeCategories = (config.timeCategories as TimeCategoryLike[]).map(tc => {
      const { kept, removed } = stripVideoArray(tc.loopVideos);
      totalLoopRemoved += removed;
      return { ...tc, loopVideos: kept };
    });
    summary.loopVideosRemoved = totalLoopRemoved;
  }

  if (Array.isArray(config.categories)) {
    const { kept, removed } = stripCategories(config.categories as CategoryLike[]);
    config.categories = kept;
    summary.categoryVideosRemoved = removed;
  }

  return summary;
}
