import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { NotificationService } from '../../core/services/notification.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { environment } from '../../../environments/environment';

interface VideoVariant {
  id: string;
  video_id: string;
  display_type: 'tv' | 'secondary';
  filename: string;
  original_name: string | null;
  file_size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  url: string | null;
  created_at: string;
}

@Component({
  selector: 'app-video-variant-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="variant-panel">
      <div class="variant-header" (click)="toggleOpen()">
        <span class="variant-icon">🖥️</span>
        <span class="variant-title">Variante ecran secondaire</span>
        <span class="variant-badge" *ngIf="secondaryVariant">1</span>
        <span class="variant-chevron">{{ isOpen ? '▲' : '▼' }}</span>
      </div>

      <div class="variant-body" *ngIf="isOpen">
        <div class="variant-loading" *ngIf="loading">Chargement...</div>

        <!-- Existing secondary variant -->
        <div class="variant-item" *ngIf="secondaryVariant && !loading">
          <div class="variant-info">
            <span class="variant-name">{{ secondaryVariant.original_name || secondaryVariant.filename }}</span>
            <span class="variant-meta">
              {{ formatFileSize(secondaryVariant.file_size) }}
              <ng-container *ngIf="secondaryVariant.width && secondaryVariant.height">
                · {{ secondaryVariant.width }}x{{ secondaryVariant.height }}
              </ng-container>
            </span>
          </div>
          <button
            class="btn btn-sm btn-danger"
            (click)="deleteVariant()"
            [disabled]="deleting"
          >
            {{ deleting ? '...' : 'Supprimer' }}
          </button>
        </div>

        <!-- Upload zone -->
        <div class="variant-upload" *ngIf="!secondaryVariant && !loading">
          <label class="upload-zone-compact" [class.uploading]="uploading">
            <input
              type="file"
              accept="video/*"
              (change)="onFileSelected($event)"
              hidden
              [disabled]="uploading"
            />
            {{ uploading ? 'Upload ' + uploadProgress + '%' : 'Uploader variante ecran secondaire' }}
          </label>
          <span class="upload-hint">Format adapte a l'ecran secondaire (panneau LED, TV tribunes, etc.)</span>
        </div>

        <!-- Replace variant -->
        <div class="variant-replace" *ngIf="secondaryVariant && !loading">
          <label class="upload-zone-compact small">
            <input
              type="file"
              accept="video/*"
              (change)="onFileSelected($event)"
              hidden
              [disabled]="uploading"
            />
            {{ uploading ? uploadProgress + '%' : 'Remplacer' }}
          </label>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .variant-panel {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 0.5rem;
    }

    .variant-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #f8fafc;
      cursor: pointer;
      user-select: none;
    }

    .variant-header:hover {
      background: #f1f5f9;
    }

    .variant-icon {
      font-size: 0.875rem;
    }

    .variant-title {
      font-size: 0.8125rem;
      font-weight: 500;
      color: #475569;
    }

    .variant-badge {
      background: #3b82f6;
      color: white;
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 0.0625rem 0.375rem;
      border-radius: 10px;
    }

    .variant-chevron {
      margin-left: auto;
      font-size: 0.625rem;
      color: #94a3b8;
    }

    .variant-body {
      padding: 0.75rem;
      border-top: 1px solid #e2e8f0;
    }

    .variant-loading {
      font-size: 0.8125rem;
      color: #94a3b8;
    }

    .variant-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .variant-info {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
    }

    .variant-name {
      font-size: 0.8125rem;
      font-weight: 500;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .variant-meta {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .variant-upload, .variant-replace {
      margin-top: 0.5rem;
    }

    .upload-zone-compact {
      display: inline-flex;
      align-items: center;
      padding: 0.375rem 0.75rem;
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      cursor: pointer;
      color: #64748b;
      font-size: 0.8125rem;
      transition: border-color 0.2s, color 0.2s;
    }

    .upload-zone-compact:hover:not(.uploading) {
      border-color: #3b82f6;
      color: #3b82f6;
    }

    .upload-zone-compact.uploading {
      cursor: wait;
      opacity: 0.7;
    }

    .upload-zone-compact.small {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
    }

    .upload-hint {
      display: block;
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 0.25rem;
    }

    .btn {
      padding: 0.375rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
    }

    .btn-sm {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
    }

    .btn-danger {
      background: #fee2e2;
      color: #dc2626;
    }

    .btn-danger:hover:not(:disabled) {
      background: #fecaca;
    }

    .btn-danger:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class VideoVariantPanelComponent {
  @Input() videoId!: string;

  private http = inject(HttpClient);
  private notificationService = inject(NotificationService);

  isOpen = false;
  loading = false;
  uploading = false;
  uploadProgress = 0;
  deleting = false;
  secondaryVariant: VideoVariant | null = null;

  toggleOpen(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen && !this.secondaryVariant && !this.loading) {
      this.loadVariants();
    }
  }

  loadVariants(): void {
    this.loading = true;
    this.http.get<{ variants: VideoVariant[] }>(
      `${environment.apiUrl}/videos/${this.videoId}/variants`,
      { withCredentials: true }
    ).subscribe({
      next: (response) => {
        this.loading = false;
        this.secondaryVariant = response.variants.find(v => v.display_type === 'secondary') || null;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading = true;
    this.uploadProgress = 0;

    const formData = new FormData();
    formData.append('video', file);
    formData.append('display_type', 'secondary');

    this.http.post<VideoVariant>(
      `${environment.apiUrl}/videos/${this.videoId}/variants`,
      formData,
      { withCredentials: true, reportProgress: true, observe: 'events' }
    ).subscribe({
      next: (event: HttpEvent<VideoVariant>) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress = Math.round((event.loaded / event.total) * 100);
        } else if (event.type === HttpEventType.Response && event.body) {
          this.uploading = false;
          this.secondaryVariant = event.body;
          this.notificationService.success('Variante ecran secondaire uploadee');
        }
      },
      error: (error) => {
        this.uploading = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur upload: ${message}`);
      }
    });

    // Reset input so same file can be re-selected
    input.value = '';
  }

  deleteVariant(): void {
    if (!this.secondaryVariant) return;
    this.deleting = true;

    this.http.delete(
      `${environment.apiUrl}/videos/${this.videoId}/variants/secondary`,
      { withCredentials: true }
    ).subscribe({
      next: () => {
        this.deleting = false;
        this.secondaryVariant = null;
        this.notificationService.success('Variante ecran secondaire supprimee');
      },
      error: (error) => {
        this.deleting = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
