import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { VideoItem, AddToTarget } from '../video-library.types';
import { DisplayConfig, CloudVideo } from '../../../../../core/models';
import { VideoVariantPanelComponent } from '../../../../content/video-variant-panel.component';
import {
  formatBytes,
  formatDate,
  formatDuration,
  getContentStatusLabel,
  getContentStatusClass,
  getOwnerTypeLabel,
} from '../video-library.utils';

/**
 * Side panel that shows full details for the currently selected video.
 * Extracted from `VideoLibraryComponent` as part of the decomposition
 * chantier (Phase B). Pure presentation: all state (selected video,
 * dropdown position, locks) is owned by the parent and passed in.
 */
@Component({
  selector: 'app-video-detail-panel',
  standalone: true,
  imports: [CommonModule, TranslateModule, VideoVariantPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-detail-panel.component.html',
  styleUrls: ['./video-detail-panel.component.scss'],
})
export class VideoDetailPanelComponent {
  @Input() video: VideoItem | null = null;
  @Input() siteType: string = '';
  @Input() configTargets: AddToTarget[] = [];
  @Input() configVideoLabels: Map<string, string[]> = new Map();
  @Input() configVideoTargets: Map<string, AddToTarget[]> = new Map();
  @Input() canUseSecondaryDisplay = false;
  @Input() totalDisplays = 1;
  @Input() siteDisplays: DisplayConfig[] = [];
  @Input() availableVideos: CloudVideo[] = [];
  /** For delete button — true when club user doesn't own this video */
  @Input() isClubLocked = false;
  /** For "Add to config" — same as isClubLocked but relaxed by grants (ADR-082) */
  @Input() isLockedForConfig = false;
  /** Parent-resolved boolean (deploy state is keyed by video.id) */
  @Input() isDeploying = false;
  // ADR-082 — Club grants (super_admin only)
  @Input() isSuperAdmin = false;
  @Input() videoGrants: { video_id: string; site_id: string; site_name: string; club_name: string | null }[] = [];
  @Input() grantsLoading = false;
  @Input() currentSiteId: string | null = null;
  @Input() currentSiteName = '';
  /** Parent-managed dropdown visibility — true when the "Add to" dropdown is open for this video */
  @Input() addToDropdownOpen = false;
  @Input() addToDropdownStyle: Record<string, string> = {};

  /** Set des video.id orphelins FTP pour ce site (chantier vidéos manquantes). */
  @Input() ftpOrphanVideoIds: ReadonlySet<string> = new Set<string>();

  @Output() closePanel = new EventEmitter<void>();
  @Output() addGrant = new EventEmitter<string>();
  @Output() removeGrant = new EventEmitter<string>();
  /** Demande de remplacement du binaire de cette vidéo (file picker côté parent). */
  @Output() replaceVideoFile = new EventEmitter<VideoItem>();
  @Output() toggleAddTo = new EventEmitter<{ video: VideoItem; event: Event }>();
  @Output() addToTargetSelect = new EventEmitter<{
    video: VideoItem;
    target: AddToTarget;
    event: Event;
  }>();
  @Output() deploy = new EventEmitter<{ video: VideoItem; event: Event }>();
  @Output() deleteVideo = new EventEmitter<{ video: VideoItem; event: Event }>();
  @Output() variantChanged = new EventEmitter<{ videoId: string; count: number; types: string[] }>();
  @Output() removeFromTarget = new EventEmitter<{ video: VideoItem; target: AddToTarget }>();

  // Expose pure formatters as instance fields so templates can call them directly.
  readonly formatBytes = formatBytes;
  readonly formatDate = formatDate;
  readonly formatDuration = formatDuration;
  readonly getContentStatusLabel = getContentStatusLabel;
  readonly getContentStatusClass = getContentStatusClass;
  readonly getOwnerTypeLabel = getOwnerTypeLabel;

  onClose(): void {
    this.closePanel.emit();
  }

  onToggleAddTo(video: VideoItem, event: Event): void {
    this.toggleAddTo.emit({ video, event });
  }

  onAddToTargetSelect(video: VideoItem, target: AddToTarget, event: Event): void {
    this.addToTargetSelect.emit({ video, target, event });
  }

  onDeploy(video: VideoItem, event: Event): void {
    this.deploy.emit({ video, event });
  }

  onDelete(video: VideoItem, event: Event): void {
    this.deleteVideo.emit({ video, event });
  }

  onRemoveFromTarget(video: VideoItem, target: AddToTarget): void {
    this.removeFromTarget.emit({ video, target });
  }

  isCurrentSiteGranted(): boolean {
    return this.videoGrants.some(g => g.site_id === this.currentSiteId);
  }

  onAddGrant(): void {
    if (this.currentSiteId) this.addGrant.emit(this.currentSiteId);
  }

  onRemoveGrant(siteId: string): void {
    this.removeGrant.emit(siteId);
  }

  /** True si la vidéo affichée est marquée orpheline FTP pour le site courant. */
  isOrphanedOnFtp(): boolean {
    return !!this.video?.id && this.ftpOrphanVideoIds.has(this.video.id);
  }

  onReplaceClick(): void {
    if (this.video) this.replaceVideoFile.emit(this.video);
  }
}
