/**
 * ADR-103 Phase 0.5 / Phase 2 — synthetic web_page/livestream config helpers.
 *
 * Phase 0.5 (strip): the TV-side defensive filter
 * (`raspberry/src/app/services/video-playback.service.ts`) cannot match
 * synthetic `web_page-<ts>` / `livestream-<ts>` paths once they've been
 * rewritten to a JWT stream URL by `saas.controller.resolveVideoUrls()`.
 * `stripSyntheticWebContent` removes them server-side BEFORE URL resolution.
 *
 * Phase 2 (resolve): when the dashboard adds a web_page / livestream video to
 * a sponsor / loop / category, it currently saves the entry with
 * `path = synthetic_filename` (no contentType, no externalUrl). Stripping
 * would lose the entry. Instead, `resolveSyntheticWebContent` looks up the
 * row in the `videos` table and **rewrites** the entry to the proper
 * `{ path: external_url, contentType, externalUrl, durationSeconds, name }`
 * shape so the TV's WebContentService can play it.
 *
 * Order matters: caller should resolve first (rewrite what we can), then
 * strip (drop the unresolved leftovers — DB row deleted, mismatched, etc.).
 *
 * Note: the pseudo-category "Web / Live" injected at runtime by
 * `injectWebContentCategory` uses the *external_url* as path (never the
 * synthetic filename), so it is not affected by either helper.
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
/**
 * ADR-103 Phase 2 — resolve synthetic web_page / livestream entries to their
 * proper runtime shape so they can play in loops and user categories.
 *
 * Walks `sponsors[]`, `timeCategories[].loopVideos[]`, and
 * `categories[].videos[]` (recursive). For each entry whose `path` matches
 * the synthetic filename pattern AND has a corresponding row in `lookup`,
 * rewrites it to:
 *   {
 *     ...originalEntry,                      // preserve weight, owner, etc.
 *     path: row.externalUrl,
 *     contentType: row.contentType,           // 'web_page' | 'livestream'
 *     externalUrl: row.externalUrl,
 *     durationSeconds: row.durationSeconds,
 *     name: originalEntry.name ?? row.name,
 *     type: row.contentType === 'web_page'
 *             ? 'text/html'
 *             : 'application/vnd.apple.mpegurl',
 *     thumbnailUrl: originalEntry.thumbnailUrl ?? row.thumbnailUrl,
 *   }
 *
 * Entries with synthetic paths NOT in `lookup` are left untouched — the
 * caller is expected to run `stripSyntheticWebContent` afterwards to drop
 * those (DB row deleted, lookup race, etc.).
 *
 * Returns the list of synthetic filenames seen during the walk so the
 * caller can do a single batch DB lookup beforehand
 * (`videoRepository.findWebContentByFilenames`).
 */
type WebContentRow = {
  contentType: 'web_page' | 'livestream';
  externalUrl: string;
  durationSeconds: number | null;
  name: string;
  thumbnailUrl: string | null;
};

function syntheticFilename(rawPath: unknown): string | null {
  if (typeof rawPath !== 'string') return null;
  const match = rawPath.match(/(?:^|\/)((?:web_page|livestream)-\d+)$/);
  return match ? match[1] : null;
}

export function collectSyntheticWebContentFilenames(config: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const visitArr = (arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const v of arr) {
      const f = syntheticFilename((v as { path?: unknown })?.path);
      if (f) out.add(f);
    }
  };
  visitArr(config.sponsors);
  if (Array.isArray(config.timeCategories)) {
    for (const tc of config.timeCategories as Array<{ loopVideos?: unknown }>) {
      visitArr(tc.loopVideos);
    }
  }
  const visitCats = (cats: unknown): void => {
    if (!Array.isArray(cats)) return;
    for (const cat of cats as Array<{ videos?: unknown; subCategories?: unknown }>) {
      visitArr(cat.videos);
      visitCats(cat.subCategories);
    }
  };
  visitCats(config.categories);
  return Array.from(out);
}

function rewriteEntry(entry: VideoEntryLike, row: WebContentRow): VideoEntryLike {
  return {
    ...entry,
    path: row.externalUrl,
    contentType: row.contentType,
    externalUrl: row.externalUrl,
    durationSeconds: row.durationSeconds,
    name: (entry as { name?: string }).name ?? row.name,
    type: row.contentType === 'web_page' ? 'text/html' : 'application/vnd.apple.mpegurl',
    thumbnailUrl: (entry as { thumbnailUrl?: string | null }).thumbnailUrl ?? row.thumbnailUrl,
  } as VideoEntryLike;
}

export interface ResolvedConfigSummary {
  sponsorsResolved: number;
  loopVideosResolved: number;
  categoryVideosResolved: number;
}

export function resolveSyntheticWebContent(
  config: Record<string, unknown>,
  lookup: Map<string, WebContentRow>,
): ResolvedConfigSummary {
  const summary: ResolvedConfigSummary = {
    sponsorsResolved: 0,
    loopVideosResolved: 0,
    categoryVideosResolved: 0,
  };
  if (lookup.size === 0) return summary;

  const resolveArr = (arr: VideoEntryLike[] | undefined): { out: VideoEntryLike[]; resolved: number } => {
    if (!Array.isArray(arr)) return { out: [], resolved: 0 };
    let resolved = 0;
    const out = arr.map(v => {
      const f = syntheticFilename(v?.path);
      if (!f) return v;
      const row = lookup.get(f);
      if (!row) return v;
      resolved++;
      return rewriteEntry(v, row);
    });
    return { out, resolved };
  };

  if (Array.isArray(config.sponsors)) {
    const { out, resolved } = resolveArr(config.sponsors as VideoEntryLike[]);
    config.sponsors = out;
    summary.sponsorsResolved = resolved;
  }

  if (Array.isArray(config.timeCategories)) {
    let total = 0;
    config.timeCategories = (config.timeCategories as TimeCategoryLike[]).map(tc => {
      const { out, resolved } = resolveArr(tc.loopVideos);
      total += resolved;
      return { ...tc, loopVideos: out };
    });
    summary.loopVideosResolved = total;
  }

  if (Array.isArray(config.categories)) {
    let total = 0;
    const walkCats = (cats: CategoryLike[]): CategoryLike[] => cats.map(cat => {
      const { out, resolved } = resolveArr(cat.videos);
      total += resolved;
      return {
        ...cat,
        videos: out,
        subCategories: cat.subCategories ? walkCats(cat.subCategories) : cat.subCategories,
      };
    });
    config.categories = walkCats(config.categories as CategoryLike[]);
    summary.categoryVideosResolved = total;
  }

  return summary;
}

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
