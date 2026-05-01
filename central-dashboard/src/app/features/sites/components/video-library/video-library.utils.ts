/**
 * Video Library — shared pure formatter helpers
 *
 * These pure functions are consumed by the library's sub-components
 * (detail panel, preview modal, future filters/cards). The parent
 * `VideoLibraryComponent` keeps its own inline copies of `formatBytes`,
 * `formatDate`, and `formatDuration` — smoke tests assert the exact
 * null/zero branches live inside the parent class file, so we do not
 * delegate from there.
 */
import { VideoContentStatus, VideoOwnerType } from './video-library.types';

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '-';
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeIndex = Math.min(Math.max(i, 0), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(1)) + ' ' + sizes[safeIndex];
}

export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '';
  }
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '-';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}h${mins.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getContentStatusLabel(status: VideoContentStatus): string {
  switch (status) {
    case 'loop': return 'Boucle';
    case 'category': return 'Catégorie';
    case 'sponsor': return 'Sponsor';
    case 'to_deploy': return 'À déployer';
    default: return 'Disponible';
  }
}

export function getContentStatusClass(status: VideoContentStatus): string {
  switch (status) {
    case 'loop': return 'status-loop';
    case 'category': return 'status-category';
    case 'sponsor': return 'status-sponsor';
    case 'to_deploy': return 'status-to-deploy';
    default: return 'status-available';
  }
}

/**
 * ADR-103 Phase 3 v2 — content type icon for proactive UX.
 * Returns a single emoji icon (or empty string for plain video — the default
 * thumbnail already conveys "MP4"). Used in card thumbnails, list rows, and
 * detail panel.
 */
export function getContentTypeIcon(
  contentType: 'video' | 'web_page' | 'livestream' | undefined | null,
): string {
  switch (contentType) {
    case 'web_page': return '🌐';
    case 'livestream': return '📡';
    default: return '';
  }
}

/** ADR-103 Phase 3 v2 — human label for content type (tooltip + detail panel). */
export function getContentTypeLabel(
  contentType: 'video' | 'web_page' | 'livestream' | undefined | null,
): string {
  switch (contentType) {
    case 'web_page': return 'Page web';
    case 'livestream': return 'Livestream';
    default: return 'Vidéo';
  }
}

export function getOwnerTypeLabel(ownerType: VideoOwnerType): string {
  switch (ownerType) {
    case 'neopro': return 'NEOPRO';
    case 'sponsor': return 'Sponsor';
    case 'club': return 'Club';
    default: return 'Admin';
  }
}
