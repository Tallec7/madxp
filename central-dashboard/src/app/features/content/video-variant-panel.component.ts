import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { NotificationService } from '../../core/services/notification.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { DisplayConfig, CloudVideo } from '../../core/models';
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
  layout?: string | null; // PROP-014 §8 : mise en page (variantes led-perimeter)
}

const DISPLAY_ICONS: Record<string, string> = {
  tv: '📺',
  secondary: '🖥️',
  'led-banner': '🖥️',
  'led-wall': '🖥️',
  'led-perimeter': '🟥',
  totem: '📱',
};

/** Type d'écran LED périmétrique (PROP-014) — pilote l'affichage du sélecteur de mise en page. */
const LED_PERIMETER_TYPE = 'led-perimeter';

/** Options de mise en page LED (PROP-014 §8 / ADR-134). Slugs alignés sur l'API. */
const LAYOUT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'repeated', label: 'Répété' },
  { value: 'scrolling', label: 'Défilant' },
  { value: 'stretched', label: 'Étalé' },
];

@Component({
  selector: 'app-video-variant-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './video-variant-panel.component.html',
  styleUrls: ['./video-variant-panel.component.scss'],
})
export class VideoVariantPanelComponent implements OnInit {
  @Input() videoId!: string;
  @Input() autoOpen = false;
  @Input() siteDisplays: DisplayConfig[] = [];
  @Input() availableVideos: CloudVideo[] = [];
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
  linkingType: string | null = null;
  savingLayoutType: string | null = null;

  readonly layoutOptions = LAYOUT_OPTIONS;

  /** Le sélecteur de mise en page n'apparaît QUE pour les variantes led-perimeter (PROP-014 §8 : piloté par TYPE). */
  isLedPerimeter(type: string): boolean {
    return type === LED_PERIMETER_TYPE;
  }

  // F2 fallback: sites without displays[] configured get a virtual 'secondary' option
  get effectiveSiteDisplays(): DisplayConfig[] {
    if (this.siteDisplays && this.siteDisplays.length > 0) return this.siteDisplays;
    return [{ index: 0, type: 'secondary', name: '2e écran (défaut)' }];
  }

  get missingDisplays(): DisplayConfig[] {
    const existingTypes = new Set(this.variants.map(v => v.display_type));
    return this.effectiveSiteDisplays.filter(d => d.type !== 'tv' && !existingTypes.has(d.type));
  }

  isOrphanVariant(type: string): boolean {
    return !this.effectiveSiteDisplays.some(d => d.type === type);
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

  loadVariants(): void {
    this.loading = true;
    this.http.get<{ variants: VideoVariant[] }>(
      `${environment.apiUrl}/videos/${this.videoId}/variants`,
      { withCredentials: true }
    ).subscribe({
      next: (response) => {
        this.loading = false;
        this.loaded = true;
        this.variants = response.variants.filter(v => v.display_type !== 'tv');
        this.emitChange();
      },
      error: () => {
        this.loading = false;
        this.loaded = true;
      }
    });
  }

  onSourceVideoSelected(event: Event, displayType: string): void {
    const select = event.target as HTMLSelectElement;
    const sourceVideoId = select.value;
    if (!sourceVideoId) return;

    this.linkingType = displayType;

    this.http.post<VideoVariant>(
      `${environment.apiUrl}/videos/${this.videoId}/variants/from-video`,
      { display_type: displayType, source_video_id: sourceVideoId },
      { withCredentials: true }
    ).subscribe({
      next: (variant) => {
        this.linkingType = null;
        const idx = this.variants.findIndex(v => v.display_type === displayType);
        if (idx >= 0) {
          this.variants[idx] = variant;
        } else {
          this.variants = [...this.variants, variant];
        }
        this.emitChange();
        this.notificationService.success(`Variante ${this.getDisplayLabel(displayType)} associee`);
        select.value = '';
      },
      error: (error) => {
        this.linkingType = null;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        select.value = '';
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

  /**
   * Persiste la mise en page d'une variante LED (PATCH métadonnée, pas de re-upload).
   * Valeur vide → null (réinitialise). PROP-014 §8 / ADR-134.
   */
  onLayoutChange(variant: VideoVariant, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const layout = select.value === '' ? null : select.value;
    const previous = variant.layout ?? null;
    this.savingLayoutType = variant.display_type;

    this.http.patch<VideoVariant>(
      `${environment.apiUrl}/videos/${this.videoId}/variants/${variant.display_type}/layout`,
      { layout },
      { withCredentials: true }
    ).subscribe({
      next: (updated) => {
        this.savingLayoutType = null;
        variant.layout = updated.layout ?? null;
        this.notificationService.success(`Mise en page ${this.getDisplayLabel(variant.display_type)} enregistrée`);
      },
      error: (error) => {
        this.savingLayoutType = null;
        variant.layout = previous; // rollback optimiste
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
