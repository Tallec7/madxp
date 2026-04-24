import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { LocalVideo, CloudVideo, LocalStorage, SiteSponsor, DisplayConfig } from '../../../../core/models';
import { FeatureGateService } from '../../../../core/services/feature-gate.service';
import { ApiService } from '../../../../core/services/api.service';
import { VideoReconciliationService } from './video-reconciliation.service';
import { VideoRelevanceFilterService } from './video-relevance-filter.service';

interface VideoClubGrantRow {
  video_id: string;
  site_id: string;
  site_name: string;
  club_name: string | null;
}
// Types are extracted for reuse across the library's sub-components and data service.
// Re-exported below so external importers (video-manager, site-content-tab, tests) keep working.
import type {
  VideoContentStatus,
  VideoOwnerType,
  VideoItem,
  AddToTarget,
  VideoDeployStatus,
  VideoDeployState,
  SortField,
  SortDirection,
  VideoStatusFilter,
  VideoOwnerFilter,
  VideoViewMode,
} from './video-library.types';
import { VideoDetailPanelComponent } from './video-detail-panel/video-detail-panel.component';
import { VideoPreviewModalComponent } from './video-preview-modal/video-preview-modal.component';
import { VideoLibraryFiltersComponent } from './video-library-filters/video-library-filters.component';
import { VideoLibraryListComponent } from './video-library-list/video-library-list.component';
import { VideoBulkActionsBarComponent } from './video-bulk-actions-bar/video-bulk-actions-bar.component';
import { AddContentModalComponent } from '../../../../shared/components/add-content-modal/add-content-modal.component';
import { UploadedVideo } from '../../../../shared/components/video-upload-zone/video-upload-zone.component';

export type {
  VideoContentStatus,
  VideoOwnerType,
  VideoItem,
  AddToTarget,
  VideoDeployStatus,
  VideoDeployState,
  SortField,
  SortDirection,
  VideoStatusFilter,
  VideoOwnerFilter,
  VideoViewMode,
};

@Component({
  selector: 'app-video-library',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    VideoDetailPanelComponent,
    VideoPreviewModalComponent,
    VideoLibraryFiltersComponent,
    VideoLibraryListComponent,
    VideoBulkActionsBarComponent,
    AddContentModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-library.component.html',
  styleUrls: ['./video-library.component.scss']
})
export class VideoLibraryComponent implements OnChanges {
  @Input() siteType: string = '';
  @Input() videos: LocalVideo[] = [];
  @Input() cloudVideos: CloudVideo[] = [];
  @Input() storage: LocalStorage | null = null;
  @Input() selectedPath: string = '';
  @Input() deployStates: Map<string, VideoDeployState> = new Map();
  @Input() siteId: string | null = null; // Current site ID for showing "for this site" badge
  @Input() configVideoRoles: Map<string, Set<string>> = new Map(); // path → Set<'boucle'|'match'|'action'>
  @Input() configVideoLabels: Map<string, string[]> = new Map(); // path → named labels (e.g. 'Boucle : Accueil')
  @Input() pendingDeploymentVideoIds: Set<string> = new Set(); // IDs of videos with pending deployments
  @Input() secondaryVariantVideoIds: Set<string> = new Set(); // IDs of videos with secondary display variants
  @Input() videoVariantInfo: Map<string, { count: number; types: string[] }> = new Map(); // Phase 5H: variant counts per video
  @Input() totalDisplays: number = 1; // Phase 5H: total configured displays for X/N badge
  @Input() isClubUser = false;
  @Input() isSuperAdmin = false;
  @Input() currentSiteName = '';
  @Input() subscriptionPlan: string | null = null;
  @Input() featureOverrides: Record<string, boolean> | null = null;

  @Input() siteSponsors: SiteSponsor[] = []; // ADR-050: sponsors for status calc
  @Input() siteDisplays: DisplayConfig[] = [];
  @Input() availableVideos: CloudVideo[] = [];

  @Output() videoSelect = new EventEmitter<VideoItem>();
  @Output() videoPreview = new EventEmitter<VideoItem>();
  @Output() videoDeploy = new EventEmitter<VideoItem>();
  @Output() videoDelete = new EventEmitter<VideoItem>();
  @Output() videoVariant = new EventEmitter<VideoItem>();
  @Output() addToTarget = new EventEmitter<{ video: VideoItem; target: AddToTarget }>(); // ADR-050 Phase 2: add video to any config target

  @Input() configTargets: AddToTarget[] = []; // Available targets from config (built by site-content-tab)
  @Input() configVideoTargets: Map<string, AddToTarget[]> = new Map(); // Sprint 3: targets each video belongs to
  @Output() removeFromTarget = new EventEmitter<{ video: VideoItem; target: AddToTarget }>(); // Sprint 3

  // ADR-082: Club grants state
  clubGrantedVideoIds: Set<string> = new Set();
  videoGrants: VideoClubGrantRow[] = [];
  grantsLoading = false;

  constructor(
    private gate: FeatureGateService,
    private reconciliation: VideoReconciliationService,
    private relevanceFilter: VideoRelevanceFilterService,
    private api: ApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  @HostListener('document:click')
  onDocumentClick(): void {
    this.addToDropdownVideo = null;
  }

  get canUseSecondaryDisplay(): boolean {
    return this.gate.canAccess('secondary_display', {
      subscription_plan: this.subscriptionPlan,
      feature_overrides: this.featureOverrides,
    });
  }

  onVariant(video: VideoItem, event: Event): void {
    event.stopPropagation();
    if (!this.canUseSecondaryDisplay) return;
    this.videoVariant.emit(video);
  }

  onVariantChanged(event: { videoId: string; count: number; types: string[] }): void {
    this.variantChanged.emit(event);
    this.secondaryVariantChanged.emit();
  }
  @Output() secondaryVariantChanged = new EventEmitter<void>();
  @Output() variantChanged = new EventEmitter<{ videoId: string; count: number; types: string[] }>();
  @Output() bulkDeploy = new EventEmitter<VideoItem[]>();
  @Output() bulkDelete = new EventEmitter<VideoItem[]>();
  /** Emitted after a web_page or livestream is successfully created — parent should reload its video list. */
  @Output() webContentCreated = new EventEmitter<void>();
  /** Forwarded from the upload zone inside the add-content modal. */
  @Output() uploadComplete = new EventEmitter<UploadedVideo>();
  @Output() allUploadsComplete = new EventEmitter<UploadedVideo[]>();

  /** Unified add-content modal (Upload · Page web · Livestream). */
  addContentModalOpen = false;
  pendingDropFiles: File[] | null = null;
  isFileDraggedOverPage = false;
  private dragCounter = 0;

  openAddContentModal(): void {
    if (!this.siteId) return;
    this.pendingDropFiles = null;
    this.addContentModalOpen = true;
  }

  closeAddContentModal(): void {
    this.addContentModalOpen = false;
    this.pendingDropFiles = null;
  }

  @HostListener('document:dragenter', ['$event'])
  onDocumentDragEnter(event: DragEvent): void {
    if (!this.siteId || !this.hasFiles(event)) return;
    this.dragCounter++;
    if (!this.isFileDraggedOverPage) {
      this.isFileDraggedOverPage = true;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:dragover', ['$event'])
  onDocumentDragOver(event: DragEvent): void {
    if (!this.siteId || !this.hasFiles(event)) return;
    // Required to allow a drop anywhere on the page.
    event.preventDefault();
  }

  @HostListener('document:dragleave', ['$event'])
  onDocumentDragLeave(event: DragEvent): void {
    if (!this.siteId || !this.hasFiles(event)) return;
    this.dragCounter = Math.max(0, this.dragCounter - 1);
    if (this.dragCounter === 0 && this.isFileDraggedOverPage) {
      this.isFileDraggedOverPage = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:drop')
  onDocumentDrop(): void {
    this.dragCounter = 0;
    if (this.isFileDraggedOverPage) {
      this.isFileDraggedOverPage = false;
      this.cdr.markForCheck();
    }
  }

  onGlobalDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onGlobalDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onGlobalDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isFileDraggedOverPage = false;
    this.dragCounter = 0;
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0 || !this.siteId) return;
    this.pendingDropFiles = Array.from(files);
    this.addContentModalOpen = true;
    this.cdr.markForCheck();
  }

  private hasFiles(event: DragEvent): boolean {
    return !!event.dataTransfer?.types?.includes('Files');
  }

  onWebContentCreated(): void {
    this.addContentModalOpen = false;
    this.webContentCreated.emit();
  }

  filteredVideos: VideoItem[] = [];
  allVideos: VideoItem[] = [];
  categories: string[] = [];
  configLabelOptions: string[] = []; // Distinct config labels for filter dropdown
  // Stats computed on filteredVideos (scoped to what's displayed)
  filteredTotalSize: number = 0;
  filteredTotalDuration: number = 0;
  filteredStatsOnPi: number = 0;
  filteredStatsInConfig: number = 0;
  filteredStatsWithVariant: number = 0;
  // ADR-050: content status stats
  filteredStatsProgrammed: number = 0;
  filteredStatsAvailable: number = 0;
  storagePercent: number = 0;

  searchQuery: string = '';
  statusFilter: VideoStatusFilter = 'relevant';
  ownerFilter: VideoOwnerFilter = 'all';
  categoryFilter: string = 'all';

  sortField: SortField = 'filename';
  sortDirection: SortDirection = 'asc';

  // View mode
  viewMode: VideoViewMode = 'grid';

  // Pagination
  pageSizeOptions: (number | 'all')[] = [10, 25, 50, 'all'];
  pageSize: number | 'all' = 25;
  currentPage: number = 0;

  get effectivePageSize(): number {
    return this.pageSize === 'all' ? this.filteredVideos.length : this.pageSize;
  }
  get totalPages(): number {
    if (this.pageSize === 'all') return 1;
    return Math.max(1, Math.ceil(this.filteredVideos.length / this.pageSize));
  }
  get pagedVideos(): VideoItem[] {
    if (this.pageSize === 'all') return this.filteredVideos;
    const start = this.currentPage * this.pageSize;
    return this.filteredVideos.slice(start, start + this.pageSize);
  }

  goToPage(page: number): void {
    this.currentPage = Math.max(0, Math.min(page, this.totalPages - 1));
  }

  onPageSizeChange(value: string): void {
    this.pageSize = value === 'all' ? 'all' : parseInt(value, 10);
    this.currentPage = 0;
  }

  // Selection mode
  selectionMode: boolean = false;
  selectedVideos: Set<string> = new Set(); // Set of video paths

  previewVideo: VideoItem | null = null;

  // Detail panel
  detailVideo: VideoItem | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['videos'] || changes['cloudVideos'] || changes['secondaryVariantVideoIds'] || changes['configVideoRoles'] || changes['configVideoLabels']) {
      this.processVideos();
      this.applyFilters();
    }
    if (changes['storage'] && this.storage) {
      this.storagePercent = (this.storage.used / this.storage.total) * 100;
    }
    if ((changes['siteId'] || changes['isClubUser']) && this.isClubUser && this.siteId) {
      this.loadClubGrants(this.siteId);
    }
  }

  private loadClubGrants(siteId: string): void {
    this.api.get<{ videoIds: string[] }>(`/content/videos/grants-for-site/${siteId}`)
      .subscribe({ next: (res) => { this.clubGrantedVideoIds = new Set(res.videoIds); this.cdr.markForCheck(); } });
  }

  loadVideoGrants(videoId: string): void {
    if (!videoId) return;
    this.grantsLoading = true;
    this.videoGrants = [];
    this.api.get<{ grants: VideoClubGrantRow[] }>(`/content/videos/${videoId}/club-grants`)
      .subscribe({
        next: (res) => { this.videoGrants = res.grants; this.grantsLoading = false; this.cdr.markForCheck(); },
        error: () => { this.grantsLoading = false; this.cdr.markForCheck(); },
      });
  }

  onAddGrant(siteId: string): void {
    if (!this.detailVideo?.id) return;
    this.api.post<{ success: boolean }>(`/content/videos/${this.detailVideo.id}/club-grants`, { site_id: siteId })
      .subscribe({ next: () => this.loadVideoGrants(this.detailVideo!.id!) });
  }

  onRemoveGrant(siteId: string): void {
    if (!this.detailVideo?.id) return;
    this.api.delete<{ success: boolean }>(`/content/videos/${this.detailVideo.id}/club-grants/${siteId}`)
      .subscribe({ next: () => this.loadVideoGrants(this.detailVideo!.id!) });
  }

  private processVideos(): void {
    const result = this.reconciliation.reconcile({
      videos: this.videos,
      cloudVideos: this.cloudVideos,
      configVideoRoles: this.configVideoRoles,
      configVideoLabels: this.configVideoLabels,
      secondaryVariantVideoIds: this.secondaryVariantVideoIds,
      videoVariantInfo: this.videoVariantInfo,
      siteType: this.siteType,
      siteSponsors: this.siteSponsors,
    });
    this.allVideos = result.allVideos;
    this.configVideoFilenames = result.configVideoFilenames;
    this.categories = result.categories;
    this.configLabelOptions = result.configLabelOptions;
  }

  /**
   * Determine if a video is "relevant" to this site:
   * - Already on the Pi (local)
   * - Used in the current configuration (in any category/phase loop)
   * - Specifically uploaded for this site (uploadedForSiteId matches)
   * - Has a pending deployment to this site
   */
  isVideoRelevant(video: VideoItem): boolean {
    return this.relevanceFilter.isRelevant(video, {
      configVideoRoles: this.configVideoRoles,
      configVideoFilenames: this.configVideoFilenames,
      siteId: this.siteId,
      pendingDeploymentVideoIds: this.pendingDeploymentVideoIds,
    });
  }

  /** Filename-based index of configVideoRoles for fallback matching, populated by reconciliation. */
  private configVideoFilenames: Set<string> = new Set();

  toggleSort(field: SortField): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = [...this.allVideos];

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        v.displayName.toLowerCase().includes(q) ||
        v.filename.toLowerCase().includes(q) ||
        v.path.toLowerCase().includes(q) ||
        (v.advertiserName && v.advertiserName.toLowerCase().includes(q))
      );
    }

    if (this.statusFilter === 'relevant') {
      filtered = filtered.filter(v => this.isVideoRelevant(v));
    } else if (this.statusFilter === 'on_pi') {
      filtered = filtered.filter(v => v.isOnPi);
    } else if (this.statusFilter === 'to_deploy') {
      filtered = filtered.filter(v => !v.isOnPi);
    } else if (this.statusFilter === 'in_config') {
      filtered = filtered.filter(v => v.configRoles?.size);
    } else if (this.statusFilter === 'deploy_error') {
      filtered = filtered.filter(v => this.isDeployFailed(v));
    } else if (this.statusFilter === 'with_variant') {
      filtered = filtered.filter(v => (v.variantCount ?? 0) > 0);
    } else if (this.statusFilter === 'programmed') {
      filtered = filtered.filter(v => v.contentStatus !== 'available' && v.contentStatus !== 'to_deploy');
    } else if (this.statusFilter === 'available_only') {
      filtered = filtered.filter(v => v.contentStatus === 'available');
    }

    if (this.ownerFilter !== 'all') {
      filtered = filtered.filter(v => v.owner === this.ownerFilter);
    }

    if (this.categoryFilter !== 'all') {
      if (this.categoryFilter.startsWith('config:')) {
        const targetLabel = this.categoryFilter.substring(7);
        filtered = filtered.filter(v => {
          const labels = this.configVideoLabels.get(v.path);
          return labels?.includes(targetLabel);
        });
      } else {
        filtered = filtered.filter(v => v.category === this.categoryFilter);
      }
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (this.sortField) {
        case 'filename':
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'duration':
          comparison = (a.duration || 0) - (b.duration || 0);
          break;
        case 'lastModified': {
          const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
          const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          comparison = dateA - dateB;
          break;
        }
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
      }
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });

    this.filteredVideos = filtered;
    this.currentPage = 0;

    // Detect duplicates by checksum within the visible set only
    const checksumCounts = new Map<string, number>();
    for (const v of filtered) {
      if (v.checksum) {
        checksumCounts.set(v.checksum, (checksumCounts.get(v.checksum) || 0) + 1);
      }
    }
    for (const v of filtered) {
      v.isDuplicate = !!v.checksum && (checksumCounts.get(v.checksum!) || 0) > 1;
    }

    // Compute stats scoped to the displayed videos
    this.filteredTotalSize = filtered.reduce((sum, v) => sum + (v.size || 0), 0);
    this.filteredTotalDuration = filtered.reduce((sum, v) => sum + (v.duration || 0), 0);
    this.filteredStatsOnPi = filtered.filter(v => v.isOnPi).length;
    this.filteredStatsInConfig = filtered.filter(v => v.configRoles?.size).length;
    this.filteredStatsWithVariant = filtered.filter(v => (v.variantCount ?? 0) > 0).length;
    // ADR-050: content status stats
    this.filteredStatsProgrammed = filtered.filter(v => v.contentStatus !== 'available' && v.contentStatus !== 'to_deploy').length;
    this.filteredStatsAvailable = filtered.filter(v => v.contentStatus === 'available').length;
  }

  // "Add to" dropdown state
  addToDropdownVideo: VideoItem | null = null;
  addToDropdownStyle: Record<string, string> = {};

  toggleAddToDropdown(video: VideoItem, event: Event): void {
    event.stopPropagation();
    if (this.addToDropdownVideo === video) {
      this.addToDropdownVideo = null;
      return;
    }
    const trigger = event.target as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const dropdownMinWidth = 200;
    const dropdownEstimatedHeight = 240;
    const spaceOnLeft = rect.right;
    const spaceBelow = window.innerHeight - rect.bottom;
    const style: Record<string, string> = {};

    // Horizontal: right-aligned when there's room, left-aligned otherwise
    if (spaceOnLeft >= dropdownMinWidth) {
      style['left'] = `${rect.right}px`;
      style['transform'] = 'translateX(-100%)';
    } else {
      style['left'] = `${rect.left}px`;
      style['transform'] = 'none';
    }

    // Vertical: open downward unless there's not enough space below
    if (spaceBelow >= dropdownEstimatedHeight) {
      style['top'] = `${rect.bottom + 2}px`;
      style['bottom'] = 'auto';
    } else {
      style['top'] = 'auto';
      style['bottom'] = `${window.innerHeight - rect.top + 2}px`;
    }

    this.addToDropdownStyle = style;
    this.addToDropdownVideo = video;
  }

  closeAddToDropdown(): void {
    this.addToDropdownVideo = null;
  }

  onAddToTargetSelect(video: VideoItem, target: AddToTarget, event: Event): void {
    event.stopPropagation();
    this.addToTarget.emit({ video, target });
    this.addToDropdownVideo = null;
  }

  selectVideo(video: VideoItem): void {
    this.selectedPath = video.path;
    this.detailVideo = video;
    this.videoSelect.emit(video);
    if (this.isSuperAdmin && video.id) {
      this.loadVideoGrants(video.id);
    }
  }

  closeDetail(): void {
    this.detailVideo = null;
  }

  onPreview(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.previewVideo = video;
    this.videoPreview.emit(video);
  }

  closePreview(): void {
    this.previewVideo = null;
  }

  onDeploy(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.videoDeploy.emit(video);
  }

  onDelete(video: VideoItem, event: Event): void {
    event.stopPropagation();
    this.videoDelete.emit(video);
  }

  // Selection methods
  toggleSelectionMode(): void {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this.selectedVideos.clear();
    }
  }

  toggleSelection(video: VideoItem, event: Event): void {
    event.stopPropagation();
    if (this.selectedVideos.has(video.path)) {
      this.selectedVideos.delete(video.path);
    } else {
      this.selectedVideos.add(video.path);
    }
  }

  isAllSelected(): boolean {
    return this.filteredVideos.length > 0 &&
           this.filteredVideos.every(v => this.selectedVideos.has(v.path));
  }

  toggleSelectAll(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.filteredVideos.forEach(v => this.selectedVideos.add(v.path));
    } else {
      this.filteredVideos.forEach(v => this.selectedVideos.delete(v.path));
    }
  }

  getSelectedVideos(): VideoItem[] {
    return this.filteredVideos.filter(v => this.selectedVideos.has(v.path));
  }

  getSelectedToDeploy(): VideoItem[] {
    return this.getSelectedVideos().filter(v => !v.isOnPi && v.source === 'cloud');
  }

  getSelectedToDelete(): VideoItem[] {
    return this.getSelectedVideos();
  }

  onBulkDeploy(): void {
    const toDeploy = this.getSelectedToDeploy();
    if (toDeploy.length > 0) {
      this.bulkDeploy.emit(toDeploy);
      this.selectedVideos.clear();
    }
  }

  onBulkDelete(): void {
    const toDelete = this.getSelectedToDelete();
    if (toDelete.length > 0) {
      this.bulkDelete.emit(toDelete);
      this.selectedVideos.clear();
    }
  }

  onCopyFilename(video: VideoItem, event: Event): void {
    event.stopPropagation();
    navigator.clipboard.writeText(video.filename).catch(() => {
      // Fallback silencieux
    });
  }

  exportCsv(): void {
    const headers = ['Nom', 'Fichier', 'Catégorie', 'Durée (s)', 'Taille (octets)', 'Source', 'Sur Pi', 'Annonceur', 'Variante 2nd', 'En config', 'Checksum'];
    const rows = this.filteredVideos.map(v => [
      v.displayName,
      v.filename,
      v.category || '',
      v.duration?.toString() || '',
      v.size?.toString() || '',
      v.owner,
      v.isOnPi ? 'Oui' : 'Non',
      v.advertiserName || '',
      v.variantCount ? `${v.variantCount} (${v.variantTypes?.join(',') || ''})` : 'Non',
      v.configRoles?.size ? Array.from(v.configRoles).join('+') : 'Non',
      v.checksum || '',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `video-library-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  formatBytes(bytes: number | null | undefined): string {
    if (bytes == null || !Number.isFinite(bytes)) return '-';
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const safeIndex = Math.min(Math.max(i, 0), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(1)) + ' ' + sizes[safeIndex];
  }

  getDeployState(video: VideoItem): VideoDeployState | null {
    if (!video.id) return null;
    return this.deployStates.get(video.id) || null;
  }

  isDeploying(video: VideoItem): boolean {
    const state = this.getDeployState(video);
    return state?.status === 'deploying';
  }

  isDeployFailed(video: VideoItem): boolean {
    const state = this.getDeployState(video);
    return state?.status === 'error' || state?.status === 'timeout';
  }

  /**
   * Check if the video was specifically uploaded for the current site
   */
  isUploadedForThisSite(video: VideoItem): boolean {
    return !!(this.siteId && video.uploadedForSiteId && video.uploadedForSiteId === this.siteId);
  }

  /**
   * Club users cannot modify videos that are not explicitly their own uploads.
   * A video is "club-locked" for delete/edit if category is NEOPRO or it wasn't uploaded for their site.
   */
  isClubLocked(video: VideoItem): boolean {
    if (!this.isClubUser) return false;
    return video.owner === 'neopro' || video.category?.toUpperCase() === 'NEOPRO' || !this.isUploadedForThisSite(video);
  }

  /** ADR-082: True if super_admin granted this club access to place the video in config. */
  isClubGranted(video: VideoItem): boolean {
    return !!(video.id && this.clubGrantedVideoIds.has(video.id));
  }

  /** True when the "Add to config" dropdown should be locked (stricter than delete lock). */
  isLockedForConfig(video: VideoItem): boolean {
    if (!this.isClubUser) return false;
    if (this.isClubGranted(video)) return false;
    return this.isClubLocked(video);
  }
}
