import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import {
  VideoItem,
  AddToTarget,
  VideoDeployState,
  SortField,
  SortDirection,
  VideoViewMode,
  VideoContentStatus,
  VideoOwnerType,
} from '../video-library.types';
import {
  formatBytes,
  formatDate,
  formatDuration,
  getContentStatusLabel,
  getContentStatusClass,
  getOwnerTypeLabel,
} from '../video-library.utils';

/**
 * Renders the visible video set as either a card grid or a sortable table,
 * including per-row inline actions (preview, add-to, deploy, variant, delete,
 * copy filename) and the bulk selection checkbox column.
 *
 * Stateless: parent owns the data, sort state, selection set, dropdown state
 * and deploy progress map. The sub-component only emits user intents.
 */
@Component({
  selector: 'app-video-library-list',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-library-list.component.html',
  styleUrls: ['./video-library-list.component.scss'],
})
export class VideoLibraryListComponent {
  @Input() pagedVideos: VideoItem[] = [];
  @Input() viewMode: VideoViewMode = 'grid';
  @Input() siteType: string = '';
  @Input() selectedPath: string = '';
  @Input() selectionMode: boolean = false;
  @Input() selectedVideos: Set<string> = new Set();
  @Input() sortField: SortField = 'filename';
  @Input() sortDirection: SortDirection = 'asc';
  @Input() configTargets: AddToTarget[] = [];
  @Input() addToDropdownVideo: VideoItem | null = null;
  @Input() addToDropdownStyle: Record<string, string> = {};
  @Input() totalDisplays: number = 1;
  @Input() canUseSecondaryDisplay: boolean = false;
  @Input() isClubUser: boolean = false;
  @Input() siteId: string | null = null;
  @Input() clubGrantedVideoIds: Set<string> = new Set();
  @Input() deployStates: Map<string, VideoDeployState> = new Map();
  @Input() allVideosCount: number = 0;
  @Input() filteredVideosCount: number = 0;
  @Input() isAllSelected: boolean = false;
  /** Set des video.id confirmés absents (HEAD/Range = 404) — désactive deploy/add-to + badge rouge ❌. */
  @Input() ftpOrphanVideoIds: ReadonlySet<string> = new Set<string>();
  /** Set des video.id non vérifiables (HEAD/Range timeout/5xx) — ne ne désactive pas, badge orange ⚠️. */
  @Input() ftpUnreachableVideoIds: ReadonlySet<string> = new Set<string>();

  @Output() videoSelect = new EventEmitter<VideoItem>();
  @Output() preview = new EventEmitter<{ video: VideoItem; event: Event }>();
  @Output() deploy = new EventEmitter<{ video: VideoItem; event: Event }>();
  @Output() deleteVideo = new EventEmitter<{ video: VideoItem; event: Event }>();
  @Output() variant = new EventEmitter<{ video: VideoItem; event: Event }>();
  @Output() copyFilename = new EventEmitter<{ video: VideoItem; event: Event }>();
  @Output() addToToggle = new EventEmitter<{ video: VideoItem; event: Event }>();
  @Output() addToTargetSelect = new EventEmitter<{ video: VideoItem; target: AddToTarget; event: Event }>();
  @Output() sortChange = new EventEmitter<SortField>();
  @Output() selectionToggle = new EventEmitter<{ video: VideoItem; event: Event }>();
  @Output() selectAllToggle = new EventEmitter<Event>();

  // Pure helpers re-exposed for the template
  formatBytes = formatBytes;
  formatDate = formatDate;
  formatDuration = formatDuration;
  getContentStatusLabel = getContentStatusLabel;
  getContentStatusClass = getContentStatusClass;
  getOwnerTypeLabel = getOwnerTypeLabel;

  onSelect(video: VideoItem): void {
    this.videoSelect.emit(video);
  }

  onPreview(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.preview.emit({ video, event });
  }

  onDeploy(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.deploy.emit({ video, event });
  }

  onDelete(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.deleteVideo.emit({ video, event });
  }

  onVariant(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.variant.emit({ video, event });
  }

  onCopyFilename(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.copyFilename.emit({ video, event });
  }

  onAddToToggle(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.addToToggle.emit({ video, event });
  }

  onAddToTargetSelect(video: VideoItem, target: AddToTarget, event: Event): void {
    event.stopPropagation();
    this.addToTargetSelect.emit({ video, target, event });
  }

  onSort(field: SortField): void {
    this.sortChange.emit(field);
  }

  onSelectionToggle(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.selectionToggle.emit({ video, event });
  }

  onSelectAllToggle(event: Event): void {
    this.selectAllToggle.emit(event);
  }

  getSortIcon(field: SortField): string {
    if (this.sortField !== field) return '';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  isSelected(video: VideoItem): boolean {
    return this.selectedVideos.has(video.path);
  }

  isUploadedForThisSite(video: VideoItem): boolean {
    return !!(this.siteId && video.uploadedForSiteId && video.uploadedForSiteId === this.siteId);
  }

  isClubLocked(video: VideoItem): boolean {
    if (!this.isClubUser) return false;
    return video.owner === 'neopro' || video.category?.toUpperCase() === 'NEOPRO' || !this.isUploadedForThisSite(video);
  }

  isLockedForConfig(video: VideoItem): boolean {
    if (!this.isClubUser) return false;
    if (video.id && this.clubGrantedVideoIds.has(video.id)) return false;
    return this.isClubLocked(video);
  }

  getDeployState(video: VideoItem): VideoDeployState | null {
    if (!video.id) return null;
    return this.deployStates.get(video.id) || null;
  }

  isDeploying(video: VideoItem): boolean {
    return this.getDeployState(video)?.status === 'deploying';
  }

  /** True si la vidéo est confirmée absente du FTP (HEAD/Range = 404) — bloque les actions. */
  isFtpOrphan(video: VideoItem): boolean {
    return !!video.id && this.ftpOrphanVideoIds.has(video.id);
  }

  /** True si la vidéo n'a pas pu être vérifiée (HEAD/Range timeout/5xx) — warning seul, ne bloque pas. */
  isFtpUnreachable(video: VideoItem): boolean {
    return !!video.id && this.ftpUnreachableVideoIds.has(video.id);
  }

  isDeployFailed(video: VideoItem): boolean {
    const state = this.getDeployState(video);
    return state?.status === 'error' || state?.status === 'timeout';
  }

  // Type-narrowing helpers — keep template terse
  asContentStatus(s: VideoContentStatus): VideoContentStatus { return s; }
  asOwnerType(o: VideoOwnerType): VideoOwnerType { return o; }
}
