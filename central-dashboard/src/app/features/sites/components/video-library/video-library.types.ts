/**
 * Video Library — shared types
 *
 * Extracted from `video-library.component.ts` to allow reuse across the
 * component's data service and sub-components (detail panel, filters, cards).
 * See `project_video_library_redesign.md` — decomposition chantier.
 */

/** Content status — calculated from the active config (ADR-050 Phase 1) */
export type VideoContentStatus = 'loop' | 'category' | 'sponsor' | 'available' | 'to_deploy';

/** Owner type — determined from upload metadata (ADR-050 Phase 1) */
export type VideoOwnerType = 'club' | 'neopro' | 'sponsor' | 'admin';

export interface VideoItem {
  id: string | null;
  path: string;
  filename: string;
  displayName: string; // Title or original filename for display (filename may be UUID)
  category: string | null;
  subcategory: string | null;
  size: number;
  duration: number | null;
  isOnPi: boolean;
  owner: 'club' | 'neopro';
  ownerType: VideoOwnerType;         // ADR-050: enriched owner (club/neopro/sponsor/admin)
  contentStatus: VideoContentStatus; // ADR-050: status in the active config
  source: 'cloud' | 'local';
  lastModified?: string;
  uploadedForSiteId?: string | null; // Site for which this video was uploaded
  piCategory?: string | null;       // Category from Pi filesystem (for delete_video command)
  piSubcategory?: string | null;    // Subcategory from Pi filesystem
  advertiserName?: string | null;   // Advertiser company name (from advertiser_videos junction)
  hasSecondaryVariant?: boolean;    // Whether this video has a secondary display variant
  variantCount?: number;            // Number of display variants (Phase 5H N-display)
  variantTypes?: string[];          // Display types with variants (Phase 5H N-display)
  checksum?: string | null;         // File integrity checksum
  configRoles?: Set<string>;         // Roles in config: 'boucle', 'match', 'action' (empty = not in config)
  isDuplicate?: boolean;            // Whether another video shares the same checksum (duplicate file)
  thumbnailUrl?: string | null;     // Thumbnail image URL (generated at upload via ffmpeg)
}

/** Target for "Add to" action — identifies where to insert a video in the config */
export interface AddToTarget {
  type: 'loop' | 'match' | 'category';
  id: string;       // 'default' for sponsors[], phase id for timeCategories, category id for categories
  label: string;     // Display name for the target
  icon?: string;
}

export type VideoDeployStatus = 'idle' | 'deploying' | 'success' | 'error' | 'timeout';

export interface VideoDeployState {
  status: VideoDeployStatus;
  progress?: number;
  error?: string;
  commandId?: string;
}

export type SortField = 'filename' | 'size' | 'duration' | 'lastModified' | 'category';
export type SortDirection = 'asc' | 'desc';
