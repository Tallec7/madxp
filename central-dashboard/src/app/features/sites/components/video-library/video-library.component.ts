import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { LocalVideo, CloudVideo, LocalStorage } from '../../../../core/models';
import { FeatureGateService } from '../../../../core/services/feature-gate.service';

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
  source: 'cloud' | 'local';
  lastModified?: string;
  uploadedForSiteId?: string | null; // Site for which this video was uploaded
  piCategory?: string | null;       // Category from Pi filesystem (for delete_video command)
  piSubcategory?: string | null;    // Subcategory from Pi filesystem
  advertiserName?: string | null;   // Advertiser company name (from advertiser_videos junction)
  hasSecondaryVariant?: boolean;    // Whether this video has a secondary display variant
  checksum?: string | null;         // File integrity checksum
  configRoles?: Set<string>;         // Roles in config: 'boucle', 'match', 'action' (empty = not in config)
  isDuplicate?: boolean;            // Whether another video shares the same checksum (duplicate file)
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

@Component({
  selector: 'app-video-library',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
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
  @Input() pendingDeploymentVideoIds: Set<string> = new Set(); // IDs of videos with pending deployments
  @Input() secondaryVariantVideoIds: Set<string> = new Set(); // IDs of videos with secondary display variants
  @Input() subscriptionPlan: string | null = null;
  @Input() featureOverrides: Record<string, boolean> | null = null;

  @Output() videoSelect = new EventEmitter<VideoItem>();
  @Output() videoPreview = new EventEmitter<VideoItem>();
  @Output() videoDeploy = new EventEmitter<VideoItem>();
  @Output() videoDelete = new EventEmitter<VideoItem>();
  @Output() videoVariant = new EventEmitter<VideoItem>();

  constructor(private gate: FeatureGateService) {}

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
  @Output() bulkDeploy = new EventEmitter<VideoItem[]>();
  @Output() bulkDelete = new EventEmitter<VideoItem[]>();

  filteredVideos: VideoItem[] = [];
  allVideos: VideoItem[] = [];
  categories: string[] = [];
  // Stats computed on filteredVideos (scoped to what's displayed)
  filteredTotalSize: number = 0;
  filteredTotalDuration: number = 0;
  filteredStatsOnPi: number = 0;
  filteredStatsInConfig: number = 0;
  filteredStatsWithVariant: number = 0;
  storagePercent: number = 0;

  searchQuery: string = '';
  statusFilter: 'relevant' | 'all' | 'on_pi' | 'to_deploy' | 'in_config' | 'deploy_error' | 'with_variant' = 'relevant';
  ownerFilter: 'all' | 'club' | 'neopro' = 'all';
  categoryFilter: string = 'all';

  sortField: SortField = 'filename';
  sortDirection: SortDirection = 'asc';

  // Selection mode
  selectionMode: boolean = false;
  selectedVideos: Set<string> = new Set(); // Set of video paths

  // Delete confirmation
  deleteConfirmVideo: VideoItem | null = null;

  previewVideo: VideoItem | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['videos'] || changes['cloudVideos'] || changes['secondaryVariantVideoIds'] || changes['configVideoRoles']) {
      this.processVideos();
      this.applyFilters();
    }
    if (changes['storage'] && this.storage) {
      this.storagePercent = (this.storage.used / this.storage.total) * 100;
    }
  }

  private processVideos(): void {
    // Build maps for comparison - using multiple keys for robust matching
    // Index filename → ALL local videos with that name (not just one)
    const localByFilename = new Map<string, typeof this.videos>();
    for (const v of this.videos) {
      const fnKey = v.filename.toLowerCase();
      if (!localByFilename.has(fnKey)) {
        localByFilename.set(fnKey, []);
      }
      localByFilename.get(fnKey)!.push(v);
    }
    const localByChecksum = new Map(
      this.videos.filter(v => v.checksum).map(v => [v.checksum!, v])
    );

    // Track which cloud videos we've already added to avoid duplicates
    const seenCloudIds = new Set<string>();
    // Track matched local video paths to avoid losing locals with duplicate filenames
    const matchedLocalPaths = new Set<string>();

    const cloudMapped: VideoItem[] = [];

    for (const cloud of this.cloudVideos) {
      // Skip if we've already processed a video with this ID
      if (seenCloudIds.has(cloud.id)) {
        continue;
      }

      seenCloudIds.add(cloud.id);

      // Try to find matching local video by checksum first, then by filename
      const filenameLower = cloud.filename.toLowerCase();
      let isOnPi = false;
      let localMatch = cloud.checksum ? localByChecksum.get(cloud.checksum) : undefined;
      if (localMatch) {
        isOnPi = true;
      } else {
        // Pick the first unmatched local video with same filename
        const locals = localByFilename.get(filenameLower) || [];
        localMatch = locals.find(l => !matchedLocalPaths.has(l.path));
        if (localMatch) {
          isOnPi = true;
        }
      }

      // Track matched local video by its unique path (not filename)
      if (localMatch) {
        matchedLocalPaths.add(localMatch.path);
      }

      cloudMapped.push({
        id: cloud.id,
        path: cloud.url,
        filename: cloud.filename,
        displayName: cloud.title || cloud.originalName || cloud.filename,
        category: cloud.category,
        subcategory: cloud.subcategory,
        size: cloud.size,
        duration: cloud.duration,
        isOnPi,
        owner: this.detectOwner(cloud.filename),
        source: 'cloud' as const,
        lastModified: cloud.updatedAt?.toString(),
        uploadedForSiteId: cloud.uploadedForSiteId,
        piCategory: localMatch?.category ?? null,
        piSubcategory: localMatch?.subcategory ?? null,
        advertiserName: cloud.advertiserName ?? null,
        hasSecondaryVariant: this.secondaryVariantVideoIds.has(cloud.id),
        checksum: cloud.checksum ?? null,
        configRoles: this.configVideoRoles.get(cloud.url),
      });
    }

    // Local videos not already represented by a cloud entry
    // Use path-based matching to avoid losing locals with duplicate filenames
    const localOnlyMapped: VideoItem[] = this.videos
      .filter(local => !matchedLocalPaths.has(local.path))
      .map(local => ({
        id: null,
        path: local.path,
        filename: local.filename,
        displayName: local.filename, // Local videos use filename directly
        category: local.category,
        subcategory: local.subcategory,
        size: local.size,
        duration: local.duration || null, // Use duration from Pi if available
        isOnPi: true,
        owner: this.detectOwner(local.path),
        source: 'local' as const,
        lastModified: local.lastModified,
        checksum: local.checksum ?? null,
        configRoles: this.configVideoRoles.get(local.path),
      }));

    this.allVideos = [...cloudMapped, ...localOnlyMapped];

    // Duplicate detection is deferred to applyFilters() so it runs on the visible set only

    const cats = new Set<string>();
    this.allVideos.forEach(v => {
      if (v.category) cats.add(v.category);
    });
    this.categories = Array.from(cats).sort();

    // Stats are computed in applyFilters() on the filtered set
  }

  /**
   * Determine if a video is "relevant" to this site:
   * - Already on the Pi (local)
   * - Used in the current configuration (in any category/phase loop)
   * - Specifically uploaded for this site (uploadedForSiteId matches)
   * - Has a pending deployment to this site
   */
  isVideoRelevant(video: VideoItem): boolean {
    // Already on the Pi
    if (video.isOnPi) return true;

    // Used in current configuration
    if (video.path && this.configVideoRoles.has(video.path)) return true;

    // Specifically uploaded for this site
    if (this.siteId && video.uploadedForSiteId === this.siteId) return true;

    // Has pending deployment to this site
    if (video.id && this.pendingDeploymentVideoIds.has(video.id)) return true;

    return false;
  }

  private detectOwner(pathOrFilename: string): 'club' | 'neopro' {
    const neoproPaths = ['SPONSORS', 'NEOPRO', 'PUBLICITES', 'ANIMATIONS', 'PUB_'];
    return neoproPaths.some(p => pathOrFilename.toUpperCase().includes(p)) ? 'neopro' : 'club';
  }

  toggleSort(field: SortField): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  getSortIcon(field: SortField): string {
    if (this.sortField !== field) return '';
    return this.sortDirection === 'asc' ? '↑' : '↓';
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
      filtered = filtered.filter(v => v.hasSecondaryVariant);
    }

    if (this.ownerFilter !== 'all') {
      filtered = filtered.filter(v => v.owner === this.ownerFilter);
    }

    if (this.categoryFilter !== 'all') {
      filtered = filtered.filter(v => v.category === this.categoryFilter);
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
    this.filteredStatsWithVariant = filtered.filter(v => v.hasSecondaryVariant).length;
  }

  selectVideo(video: VideoItem): void {
    this.selectedPath = video.path;
    this.videoSelect.emit(video);
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
    this.deleteConfirmVideo = video;
  }

  confirmDelete(): void {
    if (this.deleteConfirmVideo) {
      this.videoDelete.emit(this.deleteConfirmVideo);
      this.deleteConfirmVideo = null;
    }
  }

  cancelDelete(): void {
    this.deleteConfirmVideo = null;
  }

  // Selection methods
  toggleSelectionMode(): void {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this.selectedVideos.clear();
    }
  }

  isSelected(video: VideoItem): boolean {
    return this.selectedVideos.has(video.path);
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
      v.hasSecondaryVariant ? 'Oui' : 'Non',
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

  formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return '';
    }
  }

  formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '-';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}h${mins.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
}
