/**
 * Helpers purs de la Remote V2 — extraits du composant pour testabilité (US-V2-06).
 *
 * Aucune dépendance Angular / RxJS / DI : tout est synchrone et déterministe.
 * Tout helper avec state / side-effect reste dans `remote-v2.component.ts`.
 */
import { Configuration } from '../../interfaces/configuration.interface';
import { Category } from '../../interfaces/category.interface';
import { PiConfigVideoEntry } from '../../interfaces/video.interface';

export const TEAM_COLORS = ['#1f4e8c', '#cc384e', '#20473c', '#7d3aa3', '#c97a1e', '#2e2e2e'];

/** Hash positionnel stable d'une string vers un index dans `[0, mod[`. */
export function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

export function pickTeamColor(name: string | undefined): string {
  return TEAM_COLORS[hashIndex(name || '', TEAM_COLORS.length)];
}

/** 3 lettres max — initiales d'un nom d'équipe. */
export function teamShort(name: string | undefined): string {
  if (!name) return '–';
  const trimmed = name.trim();
  if (!trimmed) return '–';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return (parts[0][0] + parts[1][0] + (parts[2]?.[0] ?? '')).toUpperCase().slice(0, 3);
}

/** Format MM:SS pour durée >60s, sinon Xs. */
export function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

/** Identifiant de réconciliation pour les recents : id si présent, sinon path. */
export function videoKey(v: PiConfigVideoEntry): string | null {
  return v.id || v.path || null;
}

export function hasSubCategories(cat: Category): boolean {
  return Array.isArray(cat.subCategories) && cat.subCategories.length > 0;
}

export function categoryCount(cat: Category): number {
  if (hasSubCategories(cat)) {
    return (cat.subCategories || []).reduce((acc, s) => acc + (s.videos?.length || 0), 0);
  }
  return cat.videos?.length || 0;
}

export type VideoTag = 'secondary' | 'sponsor' | 'link';

export function videoTags(v: PiConfigVideoEntry): VideoTag[] {
  const tags: VideoTag[] = [];
  if (v.variants?.secondary) tags.push('secondary');
  if (v.sponsor_id || v.site_sponsor_id) tags.push('sponsor');
  if (v.contentType === 'web_page' || v.contentType === 'livestream') tags.push('link');
  return tags;
}

/**
 * Enrichit toutes les vidéos avec le `categoryId` de leur parent (US-V2-01).
 * Récursif sur subCategories pour préserver l'attribution analytics.
 */
export function enrichVideosWithCategoryId(config: Configuration): Configuration {
  const enrich = (cat: Category): Category => ({
    ...cat,
    videos: cat.videos?.map(v => ({ ...v, categoryId: cat.id })),
    subCategories: cat.subCategories?.map(enrich),
  });
  return { ...config, categories: config.categories?.map(enrich) || [] };
}

/** Aplatit toutes les vidéos d'une config (toutes phases + toutes profondeurs de sous-cat). */
export function flattenVideos(config: Configuration | null): PiConfigVideoEntry[] {
  if (!config) return [];
  const out: PiConfigVideoEntry[] = [];
  const collect = (cat: Category): void => {
    if (cat.videos) out.push(...cat.videos);
    if (cat.subCategories) cat.subCategories.forEach(collect);
  };
  (config.categories || []).forEach(collect);
  return out;
}

/** Retourne au max `limit` vidéos correspondant au query (case-insensitive sur `name`). */
export function searchVideos(
  videos: PiConfigVideoEntry[],
  query: string,
  limit = 50,
): PiConfigVideoEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return videos.filter(v => v.name?.toLowerCase().includes(q)).slice(0, limit);
}

/** Format MM:SS pour le warning watchdog (négatif clampé à 0). */
export function formatWarningTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Initiales d'un club/profil pour le badge header (max 2 lettres). */
export function clubInitials(profile: string | undefined): string {
  const source = profile || '';
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '–';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Libellé FR d'une boucle. */
export function loopLabel(p: 'neutral' | 'before' | 'during' | 'after'): string {
  if (p === 'neutral') return 'Sponsors';
  return p === 'before' ? 'Avant-match' : p === 'during' ? 'Match' : 'Après-match';
}
