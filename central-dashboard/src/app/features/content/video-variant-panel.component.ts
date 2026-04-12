import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { NotificationService } from '../../core/services/notification.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { DisplayConfig } from '../../core/models';
import { environment } from '../../../environments/environment';

interface VideoVariant {
  id: string;
  video_id: string;
  display_type: string;
  filename: string;
  original_name: string | null;
  file_size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  url: string | null;
  created_at: string;
}

const DISPLAY_ICONS: Record<string, string> = {
  tv: '📺',
  secondary: '🖥️',
  'led-banner': '🖥️',
  'led-wall': '🖥️',
  totem: '📱',
};

@Component({
  selector: 'app-video-variant-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="variant-panel">
      <!-- Main header -->
      <div class="variant-header" (click)="toggleOpen()">
        <span class="variant-icon">🖥️</span>
        <span class="variant-title">Variantes multi-ecran</span>
        <span class="variant-badge" *ngIf="variants.length">{{ variants.length }}</span>
        <span class="variant-chevron">{{ isOpen ? '▲' : '▼' }}</span>
      </div>

      <div class="variant-body" *ngIf="isOpen">
        <div class="variant-loading" *ngIf="loading">Chargement...</div>

        <!-- Accordion: one panel per existing variant -->
        <div class="accordion" *ngIf="!loading">
          <div class="accordion-item" *ngFor="let variant of variants; trackBy: trackByDisplayType">
            <div class="accordion-header" (click)="toggleAccordion(variant.display_type)">
              <span class="display-icon">{{ getIcon(variant.display_type) }}</span>
              <span class="display-label">{{ getDisplayLabel(variant.display_type) }}</span>
              <span class="variant-status variant-ok">&#10003;</span>
              <span class="accordion-chevron">{{ openPanels[variant.display_type] ? '▲' : '▼' }}</span>
            </div>
            <div class="accordion-body" *ngIf="openPanels[variant.display_type]">
              <div class="variant-item">
                <div class="variant-info">
                  <span class="variant-name">{{ variant.original_name || variant.filename }}</span>
                  <span class="variant-meta">
                    {{ formatFileSize(variant.file_size) }}
                    <ng-container *ngIf="variant.width && variant.height">
                      · {{ variant.width }}x{{ variant.height }}
                    </ng-container>
                  </span>
                </div>
                <div class="variant-actions">
                  <label class="upload-zone-compact small">
                    <input
                      type="file"
                      accept="video/*"
                      (change)="onFileSelected($event, variant.display_type)"
                      hidden
                      [disabled]="uploadingType === variant.display_type"
                    />
                    {{ uploadingType === variant.display_type ? uploadProgress + '%' : 'Remplacer' }}
                  </label>
                  <button
                    class="btn btn-sm btn-danger"
                    (click)="deleteVariant(variant.display_type)"
                    [disabled]="deletingType === variant.display_type"
                  >
                    {{ deletingType === variant.display_type ? '...' : 'Supprimer' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Panels for configured displays without variant -->
          <div class="accordion-item accordion-missing" *ngFor="let display of missingDisplays">
            <div class="accordion-header" (click)="toggleAccordion(display.type)">
              <span class="display-icon">{{ getIcon(display.type) }}</span>
              <span class="display-label">{{ display.name || display.type }}</span>
              <span class="variant-status variant-missing">&#10007;</span>
              <span class="accordion-chevron">{{ openPanels[display.type] ? '▲' : '▼' }}</span>
            </div>
            <div class="accordion-body" *ngIf="openPanels[display.type]">
              <label class="upload-zone-compact" [class.uploading]="uploadingType === display.type">
                <input
                  type="file"
                  accept="video/*"
                  (change)="onFileSelected($event, display.type)"
                  hidden
                  [disabled]="uploadingType === display.type"
                />
                {{ uploadingType === display.type ? 'Upload ' + uploadProgress + '%' : 'Uploader variante ' + (display.name || display.type) }}
              </label>
              <span class="upload-hint" *ngIf="display.resolution">Format recommande : {{ display.resolution }}</span>
            </div>
          </div>
        </div>

        <!-- Add variant for custom type -->
        <div class="add-variant" *ngIf="!loading">
          <div class="add-variant-row" *ngIf="showAddForm">
            <input
              class="form-input-sm"
              type="text"
              [(ngModel)]="newDisplayType"
              placeholder="Type (ex: led-banner)"
            />
            <label class="upload-zone-compact small" *ngIf="newDisplayType">
              <input
                type="file"
                accept="video/*"
                (change)="onFileSelected($event, sanitizeType(newDisplayType))"
                hidden
                [disabled]="!!uploadingType"
              />
              {{ uploadingType === sanitizeType(newDisplayType) ? uploadProgress + '%' : 'Uploader' }}
            </label>
            <button class="btn btn-sm btn-secondary" (click)="showAddForm = false">Annuler</button>
          </div>
          <button
            class="add-variant-trigger"
            *ngIf="!showAddForm"
            (click)="showAddForm = true"
          >
            + Ajouter variante pour un autre ecran
          </button>
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

    .variant-header:hover { background: #f1f5f9; }

    .variant-icon { font-size: 0.875rem; }

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

    .variant-chevron, .accordion-chevron {
      margin-left: auto;
      font-size: 0.625rem;
      color: #94a3b8;
    }

    .variant-body {
      padding: 0.5rem;
      border-top: 1px solid #e2e8f0;
    }

    .variant-loading {
      font-size: 0.8125rem;
      color: #94a3b8;
      padding: 0.25rem;
    }

    /* Accordion */
    .accordion {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .accordion-item {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }

    .accordion-missing { border-style: dashed; }

    .accordion-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.625rem;
      background: #f8fafc;
      cursor: pointer;
      user-select: none;
      font-size: 0.8125rem;
    }

    .accordion-header:hover { background: #f1f5f9; }

    .display-icon { font-size: 0.875rem; }

    .display-label {
      font-weight: 500;
      color: #334155;
    }

    .variant-status {
      font-size: 0.75rem;
      font-weight: 600;
    }

    .variant-ok { color: #22c55e; }
    .variant-missing { color: #f59e0b; }

    .accordion-body {
      padding: 0.5rem 0.625rem;
      border-top: 1px solid #e2e8f0;
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
      flex: 1;
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

    .variant-actions {
      display: flex;
      gap: 0.375rem;
      align-items: center;
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

    .upload-zone-compact.uploading { cursor: wait; opacity: 0.7; }
    .upload-zone-compact.small { font-size: 0.75rem; padding: 0.25rem 0.5rem; }

    .upload-hint {
      display: block;
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 0.25rem;
    }

    .btn { padding: 0.375rem 0.75rem; border-radius: 6px; font-size: 0.8125rem; font-weight: 500; cursor: pointer; border: none; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
    .btn-danger { background: #fee2e2; color: #dc2626; }
    .btn-danger:hover:not(:disabled) { background: #fecaca; }
    .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #e2e8f0; color: #475569; }
    .btn-secondary:hover { background: #cbd5e1; }

    /* Add variant */
    .add-variant { margin-top: 0.5rem; }

    .add-variant-trigger {
      display: inline-flex;
      padding: 0.25rem 0.5rem;
      border: none;
      background: none;
      cursor: pointer;
      color: #64748b;
      font-size: 0.75rem;
    }

    .add-variant-trigger:hover { color: #3b82f6; }

    .add-variant-row {
      display: flex;
      gap: 0.375rem;
      align-items: center;
    }

    .form-input-sm {
      padding: 0.25rem 0.5rem;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 0.75rem;
      width: 140px;
    }

    @media (max-width: 768px) {
      .variant-item { flex-wrap: wrap; gap: 0.375rem; }
      .variant-actions { width: 100%; justify-content: flex-end; }
      .add-variant-row { flex-wrap: wrap; }
    }
  `]
})
export class VideoVariantPanelComponent implements OnInit {
  @Input() videoId!: string;
  @Input() autoOpen = false;
  @Input() siteDisplays: DisplayConfig[] = [];
  @Output() variantChanged = new EventEmitter<{ videoId: string; count: number; types: string[] }>();

  private http = inject(HttpClient);
  private notificationService = inject(NotificationService);

  isOpen = false;
  loading = false;
  loaded = false;
  variants: VideoVariant[] = [];
  openPanels: Record<string, boolean> = {};
  uploadingType: string | null = null;
  uploadProgress = 0;
  deletingType: string | null = null;
  showAddForm = false;
  newDisplayType = '';

  get missingDisplays(): DisplayConfig[] {
    const existingTypes = new Set(this.variants.map(v => v.display_type));
    return this.siteDisplays.filter(d => d.type !== 'tv' && !existingTypes.has(d.type));
  }

  ngOnInit(): void {
    if (this.autoOpen) {
      this.isOpen = true;
    }
    this.loadVariants();
  }

  toggleOpen(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen && !this.loaded && !this.loading) {
      this.loadVariants();
    }
  }

  toggleAccordion(displayType: string): void {
    this.openPanels[displayType] = !this.openPanels[displayType];
  }

  trackByDisplayType(_: number, variant: VideoVariant): string {
    return variant.display_type;
  }

  getIcon(type: string): string {
    return DISPLAY_ICONS[type] || '🖥️';
  }

  getDisplayLabel(type: string): string {
    const display = this.siteDisplays.find(d => d.type === type);
    if (display) return display.name;
    // Fallback labels for common types
    const labels: Record<string, string> = {
      tv: 'TV',
      secondary: 'Ecran secondaire',
      'led-banner': 'Bandeau LED',
      'led-wall': 'Mur LED',
      totem: 'Totem',
    };
    return labels[type] || type;
  }

  sanitizeType(raw: string): string {
    return raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  }

  loadVariants(): void {
    this.loading = true;
    this.http.get<{ variants: VideoVariant[] }>(
      `${environment.apiUrl}/videos/${this.videoId}/variants`,
      { withCredentials: true }
    ).subscribe({
      next: (response) => {
        this.loading = false;
        this.loaded = true;
        // Filter out 'tv' type — the primary video IS the tv variant
        this.variants = response.variants.filter(v => v.display_type !== 'tv');
        this.emitChange();
      },
      error: () => {
        this.loading = false;
        this.loaded = true;
      }
    });
  }

  onFileSelected(event: Event, displayType: string): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingType = displayType;
    this.uploadProgress = 0;

    const formData = new FormData();
    formData.append('video', file);
    formData.append('display_type', displayType);

    this.http.post<VideoVariant>(
      `${environment.apiUrl}/videos/${this.videoId}/variants`,
      formData,
      { withCredentials: true, reportProgress: true, observe: 'events' }
    ).subscribe({
      next: (event: HttpEvent<VideoVariant>) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress = Math.round((event.loaded / event.total) * 100);
        } else if (event.type === HttpEventType.Response && event.body) {
          this.uploadingType = null;
          const variant = event.body;
          // Update or add variant in list
          const idx = this.variants.findIndex(v => v.display_type === displayType);
          if (idx >= 0) {
            this.variants[idx] = variant;
          } else {
            this.variants = [...this.variants, variant];
          }
          this.showAddForm = false;
          this.newDisplayType = '';
          this.emitChange();
          this.notificationService.success(`Variante ${this.getDisplayLabel(displayType)} uploadee`);
        }
      },
      error: (error) => {
        this.uploadingType = null;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur upload: ${message}`);
      }
    });

    input.value = '';
  }

  deleteVariant(displayType: string): void {
    this.deletingType = displayType;

    this.http.delete(
      `${environment.apiUrl}/videos/${this.videoId}/variants/${displayType}`,
      { withCredentials: true }
    ).subscribe({
      next: () => {
        this.deletingType = null;
        this.variants = this.variants.filter(v => v.display_type !== displayType);
        this.emitChange();
        this.notificationService.success(`Variante ${this.getDisplayLabel(displayType)} supprimee`);
      },
      error: (error) => {
        this.deletingType = null;
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

  private emitChange(): void {
    this.variantChanged.emit({
      videoId: this.videoId,
      count: this.variants.length,
      types: this.variants.map(v => v.display_type),
    });
  }
}
