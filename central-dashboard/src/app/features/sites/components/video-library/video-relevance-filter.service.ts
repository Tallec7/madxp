import { Injectable } from '@angular/core';
import { VideoItem } from './video-library.types';

export interface RelevanceContext {
  configVideoRoles: Map<string, Set<string>>;
  configVideoFilenames: Set<string>;
  siteId: string | null;
  pendingDeploymentVideoIds: Set<string>;
}

@Injectable({ providedIn: 'root' })
export class VideoRelevanceFilterService {
  /**
   * A video is "relevant" to the current site if any holds:
   * - Already on the Pi (local)
   * - Used in the active config (path or filename fallback)
   * - Specifically uploaded for this site
   * - Has a pending deployment to this site
   */
  isRelevant(video: VideoItem, ctx: RelevanceContext): boolean {
    if (video.isOnPi) return true;
    if (video.path && ctx.configVideoRoles.has(video.path)) return true;
    if (video.filename && ctx.configVideoFilenames.has(video.filename.toLowerCase())) return true;
    if (ctx.siteId && video.uploadedForSiteId === ctx.siteId) return true;
    if (video.id && ctx.pendingDeploymentVideoIds.has(video.id)) return true;
    return false;
  }
}
