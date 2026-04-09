import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { SponsorVideoDataService, Video, SponsorVideo } from './sponsor-video-data.service';
import { DragDropService } from './drag-drop.service';

@Component({
  selector: 'app-sponsor-videos',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule],
  templateUrl: './advertiser-videos.component.html',
  styleUrls: ['./advertiser-videos.component.scss']
})
export class SponsorVideosComponent implements OnInit {
  sponsorId = '';
  sponsorName = '';

  sponsorVideos: SponsorVideo[] = [];
  availableVideos: Video[] = [];
  filteredAvailableVideos: Video[] = [];

  selectedVideoIds: string[] = [];
  searchTerm = '';

  loading = false;
  error = '';
  removingId: string | null = null;
  adding = false;

  showAddModal = false;
  showPriorityModal = false;
  editingVideo: SponsorVideo | null = null;
  newPriority = 1;
  updatingPriority = false;

  private readonly videoDataService = inject(SponsorVideoDataService);
  private readonly dragDrop = inject(DragDropService<SponsorVideo>);
  private readonly notification = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  get draggingIndex(): number | null {
    return this.dragDrop.getDraggingIndex();
  }

  ngOnInit(): void {
    this.sponsorId = this.route.snapshot.params['id'];
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    this.videoDataService.loadSponsor(this.sponsorId).subscribe({
      next: (name) => {
        this.sponsorName = name;
        this.loadSponsorVideos();
        this.loadAvailableVideos();
      },
      error: () => {
        this.error = 'Sponsor non trouve';
        this.loading = false;
      }
    });
  }

  private loadSponsorVideos(): void {
    this.videoDataService.loadSponsorVideos(this.sponsorId).subscribe({
      next: (videos) => { this.sponsorVideos = videos; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  private loadAvailableVideos(): void {
    this.videoDataService.loadAvailableVideos().subscribe({
      next: (videos) => { this.availableVideos = videos; this.filteredAvailableVideos = videos; }
    });
  }

  // ── Add Modal ──

  openAddModal(): void {
    this.showAddModal = true;
    this.selectedVideoIds = [];
    this.searchTerm = '';
    this.filterAvailableVideos();
  }

  closeAddModal(): void {
    this.showAddModal = false;
    this.selectedVideoIds = [];
    this.searchTerm = '';
  }

  filterAvailableVideos(): void {
    const term = this.searchTerm.toLowerCase();
    const associatedIds = new Set(this.sponsorVideos.map(v => v.video_id));
    this.filteredAvailableVideos = this.availableVideos.filter(video => {
      const matchesSearch = video.title.toLowerCase().includes(term) || video.filename.toLowerCase().includes(term);
      return matchesSearch && !associatedIds.has(video.id);
    });
  }

  isSelected(videoId: string): boolean {
    return this.selectedVideoIds.includes(videoId);
  }

  toggleSelection(videoId: string): void {
    const index = this.selectedVideoIds.indexOf(videoId);
    if (index === -1) { this.selectedVideoIds.push(videoId); } else { this.selectedVideoIds.splice(index, 1); }
  }

  addSelectedVideos(): void {
    if (this.selectedVideoIds.length === 0) return;
    this.adding = true;

    this.videoDataService.addVideosToSponsor(this.sponsorId, this.selectedVideoIds).subscribe({
      next: () => { this.loadSponsorVideos(); this.closeAddModal(); this.adding = false; },
      error: () => { this.notification.error('Erreur lors de l\'ajout'); this.adding = false; }
    });
  }

  // ── Remove Video ──

  async removeVideo(videoId: string): Promise<void> {
    const ok = await this.confirmDialog.confirm('Retirer cette video du sponsor ?');
    if (!ok) return;

    this.removingId = videoId;
    this.videoDataService.removeVideoFromSponsor(this.sponsorId, videoId).subscribe({
      next: () => { this.sponsorVideos = this.sponsorVideos.filter(v => v.video_id !== videoId); this.removingId = null; },
      error: () => { this.notification.error('Erreur lors de la suppression'); this.removingId = null; }
    });
  }

  // ── Priority Modal ──

  editPriority(video: SponsorVideo): void {
    this.editingVideo = video;
    this.newPriority = video.priority;
    this.showPriorityModal = true;
  }

  closePriorityModal(): void {
    this.showPriorityModal = false;
    this.editingVideo = null;
  }

  savePriority(): void {
    if (!this.editingVideo) return;
    this.updatingPriority = true;

    this.videoDataService.updateVideoPriority(this.sponsorId, this.editingVideo.video_id, this.newPriority).subscribe({
      next: () => { this.loadSponsorVideos(); this.closePriorityModal(); this.updatingPriority = false; },
      error: () => { this.notification.error('Erreur lors de la sauvegarde'); this.updatingPriority = false; }
    });
  }

  // ── Drag and Drop ──

  onDragStart(event: DragEvent, index: number): void {
    this.dragDrop.startDrag(index);
    event.dataTransfer!.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  onDrop(event: DragEvent, targetIndex: number): void {
    event.preventDefault();
    const reordered = this.dragDrop.drop(this.sponsorVideos, targetIndex);
    if (!reordered) return;

    this.sponsorVideos = reordered;
    this.sponsorVideos.forEach((video, index) => { video.priority = index + 1; });
    this.saveOrder();
  }

  private saveOrder(): void {
    const updates = this.sponsorVideos.map(video => ({ video_id: video.video_id, priority: video.priority }));
    this.videoDataService.reorderVideos(this.sponsorId, updates).subscribe({
      error: () => { this.notification.error('Erreur lors de la reorganisation'); this.loadSponsorVideos(); }
    });
  }

  goBack(): void {
    this.router.navigate(['/advertisers', this.sponsorId]);
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  formatFileSize(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
  }
}
