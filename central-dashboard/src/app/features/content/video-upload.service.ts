import { Injectable, inject } from '@angular/core';
import { NotificationService } from '../../core/services/notification.service';
import {
  ContentManagementDataService,
  Video,
  VideoName,
  ImageToVideoResponse,
} from './content-management-data.service';

export interface UploadResult {
  name: string;
  success: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class VideoUploadService {
  private readonly dataService = inject(ContentManagementDataService);
  private readonly notificationService = inject(NotificationService);

  // ── Upload state ──
  uploadForm = { title: '', file: null as File | null, files: [] as File[] };
  isUploading = false;
  uploadProgress = 0;
  uploadResults: UploadResult[] = [];

  // ── Image conversion state ──
  imageForm = { file: null as File | null, duration: 10, blurBackground: false };
  isConvertingImage = false;
  imageConversionProgress = 0;
  imageConversionResult: { success: boolean; message: string } | null = null;
  imagePreviewUrl: string | null = null;

  readonly durationOptions = [
    { value: 5, label: '5 secondes' },
    { value: 10, label: '10 secondes' },
    { value: 15, label: '15 secondes' },
    { value: 30, label: '30 secondes' },
  ];

  // ── File selection ──

  addFilesToSelection(files: File[]): void {
    const maxFiles = 20;
    const remaining = maxFiles - this.uploadForm.files.length;
    const filesToAdd = files.slice(0, remaining);
    this.uploadForm.files = [...this.uploadForm.files, ...filesToAdd];

    if (files.length > remaining) {
      this.notificationService.warning(`Seulement ${remaining} fichier(s) ajouté(s). Maximum ${maxFiles} fichiers.`);
    }
  }

  removeFile(index: number): void {
    this.uploadForm.files.splice(index, 1);
  }

  clearSelectedFiles(): void {
    this.uploadForm.files = [];
  }

  canUpload(): boolean {
    return this.uploadForm.files.length > 0;
  }

  resetUploadForm(): void {
    this.uploadForm = { title: '', file: null, files: [] };
    this.uploadProgress = 0;
    this.uploadResults = [];
  }

  // ── Upload ──

  uploadVideos(onSuccess: () => void): void {
    if (!this.canUpload()) return;

    this.isUploading = true;
    this.uploadProgress = 10;
    this.uploadResults = [];

    const files = this.uploadForm.files;

    if (files.length === 1) {
      const formData = new FormData();
      if (this.uploadForm.title) {
        formData.append('title', this.uploadForm.title);
      }
      formData.append('video', files[0]);

      this.dataService.uploadVideo(formData).subscribe({
        next: () => {
          this.uploadProgress = 100;
          this.uploadResults = [{ name: files[0].name, success: true }];
          this.isUploading = false;
          this.notificationService.success('Video uploadee avec succes !');
          onSuccess();
        },
        error: (error: unknown) => {
          const message = this.dataService.getErrorMessage(error);
          this.uploadResults = [{ name: files[0].name, success: false, error: message }];
          this.notificationService.error('Erreur lors de l\'upload', {
            correlationId: this.dataService.getCorrelationId(error)
          });
          this.uploadProgress = 0;
          this.isUploading = false;
        }
      });
    } else {
      const formData = new FormData();
      files.forEach(file => formData.append('videos', file));

      this.dataService.uploadVideoBulk(formData).subscribe({
        next: (response) => {
          this.uploadProgress = 100;
          this.isUploading = false;

          this.uploadResults = [];
          if (response.files) {
            response.files.forEach(f => this.uploadResults.push({ name: f.title, success: true }));
          }
          if (response.errors) {
            response.errors.forEach(e => this.uploadResults.push({ name: e.name, success: false, error: e.error }));
          }

          if (response.success) {
            this.notificationService.success(response.message);
          } else {
            this.notificationService.warning(response.message);
          }

          onSuccess();
        },
        error: (error: unknown) => {
          const message = this.dataService.getErrorMessage(error);
          this.notificationService.error(`Erreur lors de l'upload: ${message}`, {
            correlationId: this.dataService.getCorrelationId(error)
          });
          this.uploadProgress = 0;
          this.isUploading = false;
        }
      });
    }
  }

  // ── Image conversion ──

  setImageFile(file: File): boolean {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.notificationService.error('Format non supporte. Utilisez JPG, PNG ou WEBP.');
      return false;
    }

    this.imageForm.file = file;

    if (this.imagePreviewUrl) {
      URL.revokeObjectURL(this.imagePreviewUrl);
    }
    this.imagePreviewUrl = URL.createObjectURL(file);
    return true;
  }

  clearImageFile(): void {
    this.imageForm.file = null;
    if (this.imagePreviewUrl) {
      URL.revokeObjectURL(this.imagePreviewUrl);
      this.imagePreviewUrl = null;
    }
  }

  resetImageForm(): void {
    this.clearImageFile();
    this.imageForm = { file: null, duration: 10, blurBackground: false };
    this.imageConversionProgress = 0;
    this.imageConversionResult = null;
  }

  convertImageToVideo(onSuccess: () => void): void {
    if (!this.imageForm.file || this.isConvertingImage) return;

    this.isConvertingImage = true;
    this.imageConversionProgress = 10;
    this.imageConversionResult = null;

    const formData = new FormData();
    formData.append('image', this.imageForm.file);
    formData.append('duration', this.imageForm.duration.toString());
    formData.append('blurBackground', this.imageForm.blurBackground.toString());

    const progressInterval = setInterval(() => {
      if (this.imageConversionProgress < 90) {
        this.imageConversionProgress += 10;
      }
    }, 500);

    this.dataService.convertImageToVideo(formData).subscribe({
      next: (response) => {
        clearInterval(progressInterval);
        this.imageConversionProgress = 100;
        this.isConvertingImage = false;
        this.imageConversionResult = {
          success: true,
          message: response.message || 'Video creee avec succes !'
        };
        this.notificationService.success(response.message || 'Image convertie en video !');
        onSuccess();
      },
      error: (error: unknown) => {
        clearInterval(progressInterval);
        this.isConvertingImage = false;
        this.imageConversionProgress = 0;
        const message = this.dataService.getErrorMessage(error);
        this.imageConversionResult = { success: false, message };
        this.notificationService.error(`Erreur: ${message}`, {
          correlationId: this.dataService.getCorrelationId(error)
        });
      }
    });
  }
}
