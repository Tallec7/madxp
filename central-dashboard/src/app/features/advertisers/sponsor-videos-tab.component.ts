import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { AvailableVideo, SponsorVideo } from './advertiser-detail.models';

@Component({
  selector: 'app-sponsor-videos-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="videos-tab">
      <div class="videos-header">
        <h2>Vidéos associées ({{ sponsorVideos.length }})</h2>
        <button class="btn btn-primary" (click)="openAddVideosModal()">
          + Ajouter des vidéos
        </button>
      </div>

      <div *ngIf="sponsorVideos.length === 0" class="empty-state">
        <p>Aucune vidéo associée à ce sponsor</p>
        <button class="btn btn-primary" (click)="openAddVideosModal()">
          Ajouter des vidéos
        </button>
      </div>

      <div *ngIf="sponsorVideos.length > 0" class="videos-list">
        <div *ngFor="let video of sponsorVideos" class="video-item">
          <div class="video-info">
            <h4>{{ video.original_name || video.filename || video.video_title || 'Sans titre' }}</h4>
            <div class="video-meta">
              <span *ngIf="video.duration || video.video_duration">{{ formatDuration(video.duration || video.video_duration || 0) }}</span>
              <span *ngIf="video.file_size">{{ formatFileSize(video.file_size) }}</span>
            </div>
            <div class="video-date" *ngIf="video.added_at || video.associated_at">
              Associée le {{ formatDate(video.added_at || video.associated_at) }}
            </div>
          </div>
          <div class="video-actions">
            <button
              class="btn btn-sm btn-danger"
              (click)="removeVideo(video.video_id)"
              [disabled]="removingVideo === video.video_id"
            >
              {{ removingVideo === video.video_id ? 'Suppression...' : 'Retirer' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Videos Modal -->
    <div class="modal-overlay" *ngIf="showAddVideosModal" (click)="closeAddVideosModal()">
      <div class="modal modal-lg" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Ajouter des vidéos</h2>
          <button class="close-btn" (click)="closeAddVideosModal()">x</button>
        </div>

        <div class="modal-body">
          <!-- Search -->
          <div class="search-box">
            <input
              type="text"
              [(ngModel)]="videoSearchTerm"
              (input)="filterAvailableVideos()"
              [placeholder]="'content.searchVideo' | translate"
            />
          </div>

          <!-- Loading -->
          <div *ngIf="loadingVideos" class="loading-small">
            <div class="spinner-small"></div>
            <span>Chargement des vidéos...</span>
          </div>

          <!-- Available Videos List -->
          <div *ngIf="!loadingVideos" class="available-videos-list">
            <div
              *ngFor="let video of filteredAvailableVideos"
              class="available-video-item"
              [class.selected]="isVideoSelected(video.id)"
              (click)="toggleVideoSelection(video.id)"
            >
              <div class="checkbox">
                <input
                  type="checkbox"
                  [checked]="isVideoSelected(video.id)"
                  (change)="toggleVideoSelection(video.id)"
                  (click)="$event.stopPropagation()"
                />
              </div>
              <div class="video-details">
                <h4>{{ video.title }}</h4>
                <div class="video-meta-small">
                  <span>{{ video.filename }}</span>
                  <span>{{ formatVideoDuration(video.duration) }}</span>
                  <span *ngIf="video.file_size">{{ formatFileSize(video.file_size) }}</span>
                </div>
              </div>
            </div>

            <div *ngIf="filteredAvailableVideos.length === 0" class="empty-state-small">
              <p *ngIf="videoSearchTerm">Aucune vidéo trouvée pour "{{ videoSearchTerm }}"</p>
              <p *ngIf="!videoSearchTerm">Aucune vidéo disponible à ajouter</p>
            </div>
          </div>

          <!-- Selected Count -->
          <div class="selection-info" *ngIf="selectedVideoIds.length > 0">
            {{ selectedVideoIds.length }} vidéo(s) sélectionnée(s)
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" (click)="closeAddVideosModal()">
            Annuler
          </button>
          <button
            class="btn btn-primary"
            (click)="addSelectedVideos()"
            [disabled]="selectedVideoIds.length === 0 || addingVideos"
          >
            {{ addingVideos ? 'Ajout...' : 'Ajouter (' + selectedVideoIds.length + ')' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Videos Tab */
    .videos-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .videos-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .videos-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .video-item {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      transition: box-shadow 0.2s;
    }

    .video-item:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .video-info {
      flex: 1;
    }

    .video-info h4 {
      margin: 0 0 0.5rem 0;
      color: #111827;
    }

    .video-meta {
      display: flex;
      gap: 1.5rem;
      font-size: 0.9rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }

    .video-date {
      font-size: 0.85rem;
      color: #9ca3af;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: white;
      border-radius: 8px;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-lg {
      max-width: 700px;
    }

    .modal-header {
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .close-btn:hover {
      background: #f3f4f6;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      padding: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
    }

    /* Search */
    .search-box {
      margin-bottom: 1rem;
    }

    .search-box input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.95rem;
    }

    .search-box input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .loading-small {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      color: #6b7280;
    }

    .spinner-small {
      border: 2px solid #f3f4f6;
      border-top-color: #2563eb;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .available-videos-list {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 1rem;
    }

    .available-video-item {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      border-bottom: 1px solid #f3f4f6;
      cursor: pointer;
      transition: background 0.2s;
    }

    .available-video-item:last-child {
      border-bottom: none;
    }

    .available-video-item:hover {
      background: #f9fafb;
    }

    .available-video-item.selected {
      background: #eff6ff;
    }

    .checkbox {
      display: flex;
      align-items: center;
    }

    .checkbox input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .video-details {
      flex: 1;
    }

    .video-details h4 {
      margin: 0 0 0.25rem 0;
      font-size: 1rem;
      color: #111827;
    }

    .video-meta-small {
      display: flex;
      gap: 1rem;
      font-size: 0.85rem;
      color: #6b7280;
    }

    .empty-state-small {
      padding: 2rem;
      text-align: center;
      color: #9ca3af;
    }

    .selection-info {
      padding: 0.75rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      color: #1e40af;
      font-weight: 500;
      text-align: center;
    }

    /* Buttons */
    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e5e7eb;
    }

    .btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #dc2626;
    }

    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }
  `]
})
export class SponsorVideosTabComponent {
  @Input() sponsorId = '';
  @Input() sponsorVideos: SponsorVideo[] = [];
  @Output() videosChanged = new EventEmitter<SponsorVideo[]>();

  // Add Videos Modal state
  availableVideos: AvailableVideo[] = [];
  filteredAvailableVideos: AvailableVideo[] = [];
  selectedVideoIds: string[] = [];
  videoSearchTerm = '';
  loadingVideos = false;
  addingVideos = false;
  removingVideo: string | null = null;
  showAddVideosModal = false;

  private api = inject(ApiService);
  private notification = inject(NotificationService);
  private confirmDialog = inject(ConfirmDialogService);

  openAddVideosModal(): void {
    this.showAddVideosModal = true;
    this.selectedVideoIds = [];
    this.videoSearchTerm = '';
    this.loadAvailableVideos();
  }

  closeAddVideosModal(): void {
    this.showAddVideosModal = false;
    this.selectedVideoIds = [];
    this.videoSearchTerm = '';
    this.availableVideos = [];
    this.filteredAvailableVideos = [];
  }

  loadAvailableVideos(): void {
    this.loadingVideos = true;

    this.api.get<{ data: AvailableVideo[]; pagination: unknown }>('/videos?limit=500')
      .subscribe({
        next: (response) => {
          const allVideos = response.data || [];
          const associatedIds = new Set(this.sponsorVideos.map(v => v.video_id));
          this.availableVideos = allVideos.filter(v => !associatedIds.has(v.id));
          this.filterAvailableVideos();
        },
        error: () => {
          this.notification.error('Erreur lors du chargement des vidéos');
        },
        complete: () => {
          this.loadingVideos = false;
        }
      });
  }

  filterAvailableVideos(): void {
    const term = this.videoSearchTerm.toLowerCase();
    this.filteredAvailableVideos = this.availableVideos.filter(video =>
      (video.title || '').toLowerCase().includes(term) ||
      (video.filename || '').toLowerCase().includes(term)
    );
  }

  isVideoSelected(videoId: string): boolean {
    return this.selectedVideoIds.includes(videoId);
  }

  toggleVideoSelection(videoId: string): void {
    const index = this.selectedVideoIds.indexOf(videoId);
    if (index === -1) {
      this.selectedVideoIds.push(videoId);
    } else {
      this.selectedVideoIds.splice(index, 1);
    }
  }

  addSelectedVideos(): void {
    if (this.selectedVideoIds.length === 0) return;

    this.addingVideos = true;

    this.api.post<{ success: boolean }>(`/analytics/advertisers/${this.sponsorId}/videos`, {
      video_ids: this.selectedVideoIds
    }).subscribe({
      next: () => {
        this.notification.success(`${this.selectedVideoIds.length} vidéo(s) ajoutée(s) avec succès`);
        this.closeAddVideosModal();
        // Reload sponsor videos
        this.api.get<{ success: boolean; data: { videos: SponsorVideo[] } }>(`/analytics/advertisers/${this.sponsorId}/videos`)
          .subscribe({
            next: (response) => {
              this.videosChanged.emit(response.data.videos || []);
            }
          });
      },
      error: () => {
        this.notification.error('Erreur lors de l\'ajout des vidéos');
      },
      complete: () => {
        this.addingVideos = false;
      }
    });
  }

  async removeVideo(videoId: string): Promise<void> {
    const ok = await this.confirmDialog.confirm('Retirer cette vidéo du sponsor ?');
    if (!ok) return;

    this.removingVideo = videoId;

    this.api.delete<{ success: boolean }>(`/analytics/advertisers/${this.sponsorId}/videos/${videoId}`)
      .subscribe({
        next: () => {
          const updated = this.sponsorVideos.filter(v => v.video_id !== videoId);
          this.videosChanged.emit(updated);
          this.notification.success('Vidéo retirée avec succès');
        },
        error: () => {
          this.notification.error('Erreur lors de la suppression');
        },
        complete: () => {
          this.removingVideo = null;
        }
      });
  }

  formatDuration(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0s';
    const s = Math.round(seconds);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  formatFileSize(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatVideoDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
