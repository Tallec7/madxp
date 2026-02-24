/**
 * VideoUploadZoneComponent
 *
 * Composant d'upload de vidéos contextuel pour la page site.
 * Permet de glisser-déposer ou sélectionner des fichiers vidéo.
 * Les vidéos uploadées sont automatiquement associées au site.
 */

import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { environment } from '@env/environment';

export interface UploadedVideo {
  id: string;
  filename: string;
  title: string;
  size: number;
  url: string;
  uploadedForSiteId: string | null;
}

interface UploadState {
  filename: string;
  progress: number;
  status: 'uploading' | 'complete' | 'error';
  error?: string;
  video?: UploadedVideo;
}

@Component({
  selector: 'app-video-upload-zone',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="upload-zone-container">
      <div
        class="upload-zone"
        [class.dragover]="isDragOver"
        [class.disabled]="isUploading"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
        (click)="fileInput.click()"
      >
        <input
          type="file"
          #fileInput
          (change)="onFileSelected($event)"
          accept="video/*"
          multiple
          hidden
        />
        <div class="upload-content">
          <span class="upload-icon">{{ isUploading ? '...' : '+' }}</span>
          <span class="upload-text">
            {{ isUploading ? 'Upload en cours...' : 'Glisser des vidéos ici ou cliquer pour sélectionner' }}
          </span>
          <span class="upload-hint" *ngIf="siteName">
            Vidéos uploadées pour {{ siteName }}
          </span>
        </div>
      </div>

      <!-- Upload progress -->
      <div class="uploads-list" *ngIf="uploads.length > 0">
        <div
          class="upload-item"
          *ngFor="let upload of uploads"
          [class.complete]="upload.status === 'complete'"
          [class.error]="upload.status === 'error'"
        >
          <span class="upload-filename">{{ upload.filename }}</span>
          <div class="upload-progress-bar" *ngIf="upload.status === 'uploading'">
            <div class="progress-fill" [style.width.%]="upload.progress"></div>
          </div>
          <span class="upload-status">
            <ng-container [ngSwitch]="upload.status">
              <span *ngSwitchCase="'uploading'">{{ upload.progress }}%</span>
              <span *ngSwitchCase="'complete'" class="success">Terminé</span>
              <span *ngSwitchCase="'error'" class="error">{{ upload.error }}</span>
            </ng-container>
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .upload-zone-container {
      margin-bottom: 1rem;
    }

    .upload-zone {
      border: 2px dashed var(--border-color, #ccc);
      border-radius: 8px;
      padding: 1.5rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: var(--bg-secondary, #f9f9f9);
    }

    .upload-zone:hover:not(.disabled) {
      border-color: var(--primary-color, #007bff);
      background: var(--bg-hover, #f0f7ff);
    }

    .upload-zone.dragover {
      border-color: var(--primary-color, #007bff);
      background: var(--bg-active, #e6f2ff);
      border-style: solid;
    }

    .upload-zone.disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .upload-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }

    .upload-icon {
      font-size: 2rem;
      color: var(--text-muted, #666);
    }

    .upload-text {
      font-size: 0.9rem;
      color: var(--text-primary, #333);
    }

    .upload-hint {
      font-size: 0.8rem;
      color: var(--text-muted, #666);
    }

    .uploads-list {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .upload-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem;
      background: var(--bg-secondary, #f5f5f5);
      border-radius: 4px;
      font-size: 0.85rem;
    }

    .upload-item.complete {
      background: var(--bg-success, #e8f5e9);
    }

    .upload-item.error {
      background: var(--bg-error, #ffebee);
    }

    .upload-filename {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .upload-progress-bar {
      width: 100px;
      height: 6px;
      background: var(--bg-tertiary, #ddd);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--primary-color, #007bff);
      transition: width 0.2s ease;
    }

    .upload-status {
      min-width: 60px;
      text-align: right;
    }

    .upload-status .success {
      color: var(--color-success, #4caf50);
    }

    .upload-status .error {
      color: var(--color-error, #f44336);
    }
  `]
})
export class VideoUploadZoneComponent {
  private readonly http = inject(HttpClient);

  @Input() siteId: string | null = null;
  @Input() siteName: string = '';
  @Output() uploadComplete = new EventEmitter<UploadedVideo>();
  @Output() allUploadsComplete = new EventEmitter<UploadedVideo[]>();

  isDragOver = false;
  isUploading = false;
  uploads: UploadState[] = [];

  private completedVideos: UploadedVideo[] = [];

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isUploading) {
      this.isDragOver = true;
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    if (this.isUploading) return;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadFiles(Array.from(files));
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      this.uploadFiles(Array.from(files));
    }
    // Reset input pour permettre de re-sélectionner le même fichier
    input.value = '';
  }

  private uploadFiles(files: File[]): void {
    // Filtrer les fichiers vidéo uniquement
    const videoFiles = files.filter(file => file.type.startsWith('video/'));

    if (videoFiles.length === 0) {
      return;
    }

    this.isUploading = true;
    this.completedVideos = [];

    // Créer les états d'upload
    for (const file of videoFiles) {
      const uploadState: UploadState = {
        filename: file.name,
        progress: 0,
        status: 'uploading',
      };
      this.uploads.push(uploadState);
      this.uploadFile(file, uploadState);
    }
  }

  private uploadFile(file: File, state: UploadState): void {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', file.name);
    if (this.siteId) {
      formData.append('site_id', this.siteId);
    }

    this.http.post<UploadedVideo>(
      `${environment.apiUrl}/videos`,
      formData,
      {
        withCredentials: true,
        reportProgress: true,
        observe: 'events',
      }
    ).subscribe({
      next: (event: HttpEvent<UploadedVideo>) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          state.progress = Math.round((event.loaded / event.total) * 100);
        } else if (event.type === HttpEventType.Response && event.body) {
          state.status = 'complete';
          state.progress = 100;
          state.video = event.body;
          this.completedVideos.push(event.body);
          this.uploadComplete.emit(event.body);
          this.checkAllComplete();
        }
      },
      error: (error) => {
        state.status = 'error';
        state.error = error.error?.error || 'Erreur upload';
        this.checkAllComplete();
      },
    });
  }

  private checkAllComplete(): void {
    const allDone = this.uploads.every(u => u.status !== 'uploading');
    if (allDone) {
      this.isUploading = false;
      if (this.completedVideos.length > 0) {
        this.allUploadsComplete.emit(this.completedVideos);
      }
      // Nettoyer après 3 secondes
      setTimeout(() => {
        this.uploads = this.uploads.filter(u => u.status === 'uploading');
      }, 3000);
    }
  }
}
