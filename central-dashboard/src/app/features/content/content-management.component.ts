import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { Site, Group } from '../../core/models';
import { Subscription } from 'rxjs';
import { VideoVariantPanelComponent } from './video-variant-panel.component';
import {
  ContentManagementDataService,
  Video,
  PaginationInfo,
  Deployment,
  VideoDeploymentHistory,
  VideoName,
} from './content-management-data.service';
import { VideoUploadService } from './video-upload.service';
import { ContentDeploymentService } from './content-deployment.service';

@Component({
  selector: 'app-content-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, VideoVariantPanelComponent],
  templateUrl: './content-management.component.html',
  styleUrls: ['./content-management.component.scss']
})
export class ContentManagementComponent implements OnInit, OnDestroy {
  activeTab: 'videos' | 'deploy' | 'history' = 'videos';

  videos: Video[] = [];
  allVideos: VideoName[] = [];
  deployments: Deployment[] = [];
  sites: Site[] = [];
  groups: Group[] = [];

  videoSearch = '';
  videoPagination: PaginationInfo = { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false };
  showUploadModal = false;
  showHistoryModal = false;
  showImageModal = false;
  isLoadingHistory = false;
  isDragOver = false;
  isImageDragOver = false;
  selectedVideoForHistory: Video | null = null;
  videoHistory: VideoDeploymentHistory | null = null;
  previewingVideo: Video | null = null;

  private readonly dataService = inject(ContentManagementDataService);
  private readonly notificationService = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly uploadService = inject(VideoUploadService);
  readonly deployService = inject(ContentDeploymentService);
  private subscriptions = new Subscription();
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── Delegate to upload service ──
  get uploadForm() { return this.uploadService.uploadForm; }
  get isUploading() { return this.uploadService.isUploading; }
  get uploadProgress() { return this.uploadService.uploadProgress; }
  get uploadResults() { return this.uploadService.uploadResults; }
  get imageForm() { return this.uploadService.imageForm; }
  get isConvertingImage() { return this.uploadService.isConvertingImage; }
  get imageConversionProgress() { return this.uploadService.imageConversionProgress; }
  get imageConversionResult() { return this.uploadService.imageConversionResult; }
  get imagePreviewUrl() { return this.uploadService.imagePreviewUrl; }
  get durationOptions() { return this.uploadService.durationOptions; }

  // ── Delegate to deploy service ──
  get deployForm() { return this.deployService.deployForm; }
  get isDeploying() { return this.deployService.isDeploying; }

  ngOnInit(): void {
    this.loadVideos();
    this.loadAllVideos();
    this.loadDeployments();
    this.loadSites();
    this.loadGroups();
    this.subscriptions.add(this.deployService.subscribeToDeploymentProgress(this.deployments));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  // ── Delegate formatting to data service ──

  formatFileSize(bytes: number): string {
    return this.dataService.formatFileSize(bytes);
  }

  formatDuration(seconds: number): string {
    return this.dataService.formatDuration(seconds);
  }

  formatDate(date: Date | null): string {
    return this.dataService.formatDate(date);
  }

  getDeploymentStatusBadge(status: string): string {
    return this.dataService.getDeploymentStatusBadge(status);
  }

  getDeploymentStatusLabel(status: string): string {
    return this.dataService.getDeploymentStatusLabel(status);
  }

  // ── Data loading ──

  loadVideos(): void {
    this.dataService.loadVideos(this.videoPagination.page, this.videoPagination.limit, this.videoSearch).subscribe({
      next: (response) => {
        this.videos = response.data || [];
        if (response.pagination) {
          this.videoPagination = response.pagination;
        }
      },
      error: () => {}
    });
  }

  loadAllVideos(): void {
    this.dataService.loadAllVideoNames().subscribe({
      next: (names) => { this.allVideos = names || []; },
      error: () => {}
    });
  }

  loadDeployments(): void {
    this.dataService.loadDeployments().subscribe({
      next: (deployments) => { this.deployments = deployments; },
      error: () => {}
    });
  }

  loadSites(): void {
    this.dataService.loadSites().subscribe({ next: (sites) => { this.sites = sites; } });
  }

  loadGroups(): void {
    this.dataService.loadGroups().subscribe({ next: (groups) => { this.groups = groups; } });
  }

  // ── Pagination & search ──

  goToPage(page: number): void {
    if (page < 1 || page > this.videoPagination.totalPages) return;
    this.videoPagination.page = page;
    this.loadVideos();
  }

  onSearchChange(): void {
    this.videoPagination.page = 1;
    this.loadVideos();
  }

  onSearchDebounce(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => this.onSearchChange(), 300);
  }

  getPageNumbers(): number[] {
    const { page, totalPages } = this.videoPagination;
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: number[] = [1];
    if (page > 3) pages.push(-1);
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push(-1);
    pages.push(totalPages);
    return pages;
  }

  // ── File selection UI handlers (delegate to uploadService) ──

  onFilesSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.uploadService.addFilesToSelection(Array.from(target.files || []) as File[]);
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isDragOver = true; }
  onDragLeave(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isDragOver = false; }

  onDrop(event: DragEvent): void {
    event.preventDefault(); event.stopPropagation(); this.isDragOver = false;
    const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith('video/'));
    this.uploadService.addFilesToSelection(files);
  }

  addFilesToSelection(files: File[]): void { this.uploadService.addFilesToSelection(files); }
  removeFile(index: number): void { this.uploadService.removeFile(index); }
  clearSelectedFiles(): void { this.uploadService.clearSelectedFiles(); }
  canUpload(): boolean { return this.uploadService.canUpload(); }

  closeUploadModal(): void {
    if (this.uploadService.isUploading) return;
    this.showUploadModal = false;
    this.uploadService.resetUploadForm();
  }

  uploadVideos(): void {
    this.uploadService.uploadVideos(() => { this.loadVideos(); this.loadAllVideos(); });
  }

  // ── Video CRUD actions ──

  async deleteVideo(video: Video): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      `Supprimer la vidéo "${video.title}" ?`,
      { title: 'Suppression', confirmLabel: 'Supprimer' },
    );
    if (ok) {
      this.dataService.deleteVideo(video.id).subscribe({
        next: () => {
          this.videos = this.videos.filter(v => v.id !== video.id);
          this.allVideos = this.allVideos.filter(v => v.id !== video.id);
        },
        error: (error: unknown) => {
          const message = this.dataService.getErrorMessage(error);
          this.notificationService.error(`Erreur lors de la suppression: ${message}`, {
            correlationId: this.dataService.getCorrelationId(error)
          });
        }
      });
    }
  }

  // ── Video history modal ──

  showVideoHistory(video: Video): void {
    this.selectedVideoForHistory = video;
    this.showHistoryModal = true;
    this.isLoadingHistory = true;
    this.videoHistory = null;

    this.dataService.loadVideoHistory(video.id).subscribe({
      next: (history) => { this.videoHistory = history; this.isLoadingHistory = false; },
      error: (error: unknown) => {
        this.notificationService.error('Erreur lors du chargement de l\'historique', {
          correlationId: this.dataService.getCorrelationId(error)
        });
        this.isLoadingHistory = false;
      }
    });
  }

  closeHistoryModal(): void {
    this.showHistoryModal = false;
    this.selectedVideoForHistory = null;
    this.videoHistory = null;
  }

  deployVideoFromHistory(): void {
    if (this.selectedVideoForHistory) {
      this.closeHistoryModal();
      this.deployVideo(this.selectedVideoForHistory);
    }
  }

  // ── Video preview modal ──

  previewVideo(video: Video): void { this.previewingVideo = video; }
  closePreview(): void { this.previewingVideo = null; }

  deployFromPreview(): void {
    if (this.previewingVideo) {
      const video = this.previewingVideo;
      this.closePreview();
      this.deployVideo(video);
    }
  }

  // ── Deploy actions (delegate to deployService) ──

  deployVideo(video: Video): void {
    this.deployService.addVideoToDeploy(video.id);
    this.activeTab = 'deploy';
  }

  getVideoTitleById(videoId: string): string {
    return this.deployService.getVideoTitleById(videoId, this.allVideos);
  }

  removeSelectedVideo(videoId: string): void { this.deployService.removeSelectedVideo(videoId); }
  clearSelectedVideos(): void { this.deployService.clearSelectedVideos(); }
  canDeploy(): boolean { return this.deployService.canDeploy(); }

  async startDeployment(): Promise<void> {
    const result = await this.deployService.startDeployment(this.allVideos, this.deployments);
    if (result.switchToHistory) {
      this.activeTab = 'history';
    }
  }

  // ── Image to Video (delegate to uploadService) ──

  closeImageModal(): void {
    if (this.uploadService.isConvertingImage) return;
    this.showImageModal = false;
    this.uploadService.resetImageForm();
  }

  onImageDragOver(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isImageDragOver = true; }
  onImageDragLeave(event: DragEvent): void { event.preventDefault(); event.stopPropagation(); this.isImageDragOver = false; }

  onImageDrop(event: DragEvent): void {
    event.preventDefault(); event.stopPropagation(); this.isImageDragOver = false;
    const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) { this.uploadService.setImageFile(files[0]); }
  }

  onImageSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) { this.uploadService.setImageFile(file); }
  }

  setImageFile(file: File): void { this.uploadService.setImageFile(file); }
  clearImageFile(): void { this.uploadService.clearImageFile(); }

  convertImageToVideo(): void {
    this.uploadService.convertImageToVideo(() => { this.loadVideos(); this.loadAllVideos(); });
  }
}
