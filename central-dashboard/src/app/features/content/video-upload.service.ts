import { Injectable, inject } from '@angular/core';
import { NotificationService } from '../../core/services/notification.service';
import {
  ContentManagementDataService,
  ContentVideoRow,
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
  imageForm = { files: [] as File[], duration: 10, blurBackground: false };
  isConvertingImage = false;
  imageConversionProgress = 0;
  imageConversionResult: { success: boolean; message: string } | null = null;
  imagePreviewUrls: string[] = [];
  imageConversionDetails: { name: string; success: boolean; message: string }[] = [];
  currentConversionIndex = 0;

  readonly durationOptions = [
    { value: 5, label: '5 secondes' },
    { value: 10, label: '10 secondes' },
    { value: 15, label: '15 secondes' },
    { value: 30, label: '30 secondes' },
    { value: 60, label: '1 minute' },
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

  addImageFiles(files: File[]): void {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    files.forEach(f => {
      if (!allowedTypes.includes(f.type)) {
        this.notificationService.error(`Format non supporté : ${f.name}. Utilisez JPG, PNG ou WEBP.`);
        return;
      }
      this.imageForm.files.push(f);
      this.imagePreviewUrls.push(URL.createObjectURL(f));
    });
  }

  removeImageFile(index: number): void {
    URL.revokeObjectURL(this.imagePreviewUrls[index]);
    this.imageForm.files.splice(index, 1);
    this.imagePreviewUrls.splice(index, 1);
  }

  clearImageFiles(): void {
    this.imagePreviewUrls.forEach(u => URL.revokeObjectURL(u));
    this.imageForm.files = [];
    this.imagePreviewUrls = [];
  }

  resetImageForm(): void {
    this.clearImageFiles();
    this.imageForm = { files: [], duration: 10, blurBackground: false };
    this.imageConversionProgress = 0;
    this.imageConversionResult = null;
    this.imageConversionDetails = [];
    this.currentConversionIndex = 0;
  }

  convertImagesToVideo(onSuccess: () => void): void {
    const files = this.imageForm.files;
    if (files.length === 0 || this.isConvertingImage) return;

    this.isConvertingImage = true;
    this.imageConversionProgress = 0;
    this.imageConversionResult = null;
    this.imageConversionDetails = [];
    this.currentConversionIndex = 0;

    const convertNext = (index: number): void => {
      if (index >= files.length) {
        this.isConvertingImage = false;
        this.imageConversionProgress = 100;
        const successCount = this.imageConversionDetails.filter(d => d.success).length;
        this.imageConversionResult = {
          success: successCount > 0,
          message: `${successCount}/${files.length} image(s) convertie(s) en vidéo.`
        };
        if (successCount > 0) {
          this.notificationService.success(`${successCount} image(s) convertie(s) avec succès !`);
          onSuccess();
        }
        return;
      }

      this.currentConversionIndex = index;
      this.imageConversionProgress = Math.round((index / files.length) * 100);

      const formData = new FormData();
      formData.append('image', files[index]);
      formData.append('duration', this.imageForm.duration.toString());
      formData.append('blurBackground', this.imageForm.blurBackground.toString());

      this.dataService.convertImageToVideo(formData).subscribe({
        next: (response) => {
          this.imageConversionDetails.push({ name: files[index].name, success: true, message: response.message || 'OK' });
          convertNext(index + 1);
        },
        error: (error: unknown) => {
          const message = this.dataService.getErrorMessage(error);
          this.imageConversionDetails.push({ name: files[index].name, success: false, message });
          convertNext(index + 1);
        }
      });
    };

    convertNext(0);
  }
}
