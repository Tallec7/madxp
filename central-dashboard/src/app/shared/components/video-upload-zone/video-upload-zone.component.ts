/**
 * VideoUploadZoneComponent
 *
 * Composant d'upload de vidéos contextuel pour la page site.
 * Permet de glisser-déposer ou sélectionner des fichiers vidéo.
 * Les vidéos uploadées sont automatiquement associées au site.
 */

import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
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
  imports: [CommonModule, FormsModule, TranslateModule],
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
          accept="video/*,image/*"
          multiple
          hidden
        />
        <input
          type="file"
          #cameraInput
          (change)="onFileSelected($event)"
          accept="video/*"
          capture="environment"
          hidden
        />
        <div class="upload-content">
          <span class="upload-icon">{{ isUploading ? '...' : '+' }}</span>
          <span class="upload-text">
            {{ isUploading ? 'Upload en cours...' : 'Glisser des vidéos ou images ici ou cliquer pour sélectionner' }}
          </span>
          <span class="upload-hint">
            Les images sont converties en vidéo avec la durée et le fond choisis ci-dessous
          </span>
          <span class="upload-hint" *ngIf="siteName">
            Vidéos uploadées pour {{ siteName }}
          </span>
        </div>
      </div>

      <!-- Image conversion options (apply to dropped/selected images) -->
      <div class="image-options" (click)="$event.stopPropagation()">
        <span class="image-options-label">🖼️ Options images :</span>
        <label class="image-options-field">
          <span>Durée</span>
          <select [(ngModel)]="imageDuration" [disabled]="isUploading">
            <option *ngFor="let opt of durationOptions" [ngValue]="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label class="image-options-field checkbox">
          <input type="checkbox" [(ngModel)]="imageBlurBackground" [disabled]="isUploading" />
          <span>Fond flou</span>
        </label>
      </div>

      <!-- Mobile camera capture button (only on touch devices) -->
      <button
        type="button"
        class="camera-btn"
        *ngIf="isTouchDevice && !isUploading"
        (click)="$event.stopPropagation(); cameraInput.click()"
        [title]="'videoUpload.recordFromCamera' | translate">
        📹 {{ 'videoUpload.recordFromCamera' | translate }}
      </button>

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

    .camera-btn {
      display: block;
      margin: 0.75rem auto 0;
      padding: 0.625rem 1.25rem;
      background: var(--neo-hockey-dark, #2022E9);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .camera-btn:hover { opacity: 0.9; }

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

    .image-options {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: var(--bg-secondary, #f9f9f9);
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 6px;
      font-size: 0.85rem;
    }

    .image-options-label {
      color: var(--text-muted, #666);
      font-weight: 500;
    }

    .image-options-field {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      color: var(--text-primary, #333);
    }

    .image-options-field select {
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--border-color, #ccc);
      border-radius: 4px;
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #333);
      font-size: 0.85rem;
    }

    .image-options-field.checkbox {
      cursor: pointer;
    }

    .image-options-field input[type="checkbox"] {
      cursor: pointer;
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

    /* === Responsive === */
    @media (max-width: 768px) {
      .upload-zone {
        padding: 1rem;
      }

      .upload-zone p {
        font-size: 0.75rem;
      }

      .upload-item {
        flex-wrap: wrap;
        gap: 0.375rem;
      }

      .upload-name {
        flex-basis: 100%;
      }
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

  imageDuration = 10;
  imageBlurBackground = true;
  readonly durationOptions = [
    { value: 5, label: '5 s' },
    { value: 10, label: '10 s' },
    { value: 15, label: '15 s' },
    { value: 30, label: '30 s' },
    { value: 60, label: '60 s' },
  ];

  readonly isTouchDevice = typeof window !== 'undefined'
    && ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0);

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
    // Accepter vidéos ET images (images → converties en vidéo côté serveur)
    const mediaFiles = files.filter(file =>
      file.type.startsWith('video/') || file.type.startsWith('image/')
    );

    if (mediaFiles.length === 0) {
      return;
    }

    this.isUploading = true;
    this.completedVideos = [];

    for (const file of mediaFiles) {
      const uploadState: UploadState = {
        filename: file.name,
        progress: 0,
        status: 'uploading',
      };
      this.uploads.push(uploadState);
      if (file.type.startsWith('image/')) {
        this.uploadImage(file, uploadState);
      } else {
        this.uploadFile(file, uploadState);
      }
    }
  }

  private uploadImage(file: File, state: UploadState): void {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('duration', String(this.imageDuration));
    formData.append('blurBackground', String(this.imageBlurBackground));
    if (this.siteId) {
      formData.append('site_id', this.siteId);
    }

    this.http.post<UploadedVideo>(
      `${environment.apiUrl}/image-to-video`,
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
        state.error = error.error?.error || 'Erreur conversion image';
        this.checkAllComplete();
      },
    });
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
