import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { NotificationService } from '../../core/services/notification.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { DisplayConfig, CloudVideo } from '../../core/models';
import { environment } from '../../../environments/environment';

/** Fichier d'un côté pour une variante led-perimeter « par côté » (ADR-135). */
interface SideFile {
  side_index: number;
  filename: string;
  original_name: string | null;
  file_size: number;
  width: number | null;
  height: number | null;
  url?: string | null;
}

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
  side_files?: SideFile[] | null; // ADR-135 : 1 fichier par côté (mode « par côté »)
}

/** État d'un export LED async par display_type (PROP-014 §6 / étape 6). */
interface LedExportState {
  status: 'queued' | 'processing' | 'ready' | 'failed';
  url?: string | null;
  error?: string | null;
}

/** Avis de format LED renvoyé par l'API à l'upload (PROP-014 §6) — non bloquant. */
interface LedFormatNotice {
  verdict: 'exact' | 'resize' | 'incompatible' | 'unknown';
  message: string;
  ribbonWidth: number;
  ribbonHeight: number;
  videoWidth: number | null;
  videoHeight: number | null;
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
export class VideoVariantPanelComponent implements OnInit, OnDestroy {
  @Input() videoId!: string;
  @Input() autoOpen = false;
  @Input() siteDisplays: DisplayConfig[] = [];
  @Input() availableVideos: CloudVideo[] = [];
  /** Club consulté (la page sur laquelle on est). L'export LED plie pour CE club. */
  @Input() siteId: string | null = null;
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
  /** Avis de format LED par display_type (PROP-014 §6), affiché après upload. */
  formatNotices: Record<string, LedFormatNotice> = {};
  /** État d'export plié async par display_type (PROP-014 §6 / étape 6). */
  exportStates: Record<string, LedExportState> = {};
  private exportPollTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  readonly layoutOptions = LAYOUT_OPTIONS;

  /** Mode « par côté » ouvert dans l'UI par display_type (même sans fichier encore). */
  perSideUiOpen: Record<string, boolean> = {};
  /** Côté en cours d'upload (index) pour le spinner. */
  uploadingSide: number | null = null;
  /** Côté en cours d'association depuis la bibliothèque (index). */
  linkingSide: number | null = null;

  /** Le sélecteur de mise en page n'apparaît QUE pour les variantes led-perimeter (PROP-014 §8 : piloté par TYPE). */
  isLedPerimeter(type: string): boolean {
    return type === LED_PERIMETER_TYPE;
  }

  // --- Contenu LED « par côté » (ADR-135) ---

  /** Côtés du ruban LED du site (longueurs en m). Vide si pas de display led-perimeter. */
  get ledSides(): number[] {
    const d = this.siteDisplays?.find((x) => x.type === LED_PERIMETER_TYPE);
    return d?.led?.sides ?? [];
  }

  /** Une variante led-perimeter est « par côté » si elle a au moins un fichier de côté. */
  isPerSide(variant: VideoVariant): boolean {
    return (variant.side_files?.length ?? 0) > 0;
  }

  /** Le bloc « par côté » s'affiche si des fichiers existent OU si l'opérateur a choisi ce mode. */
  showPerSide(variant: VideoVariant): boolean {
    return this.isPerSide(variant) || !!this.perSideUiOpen[variant.display_type];
  }

  getSideFile(variant: VideoVariant, sideIndex: number): SideFile | null {
    return variant.side_files?.find((s) => s.side_index === sideIndex) ?? null;
  }

  /** Bascule uniforme / par côté (UI). Repasser en « uniforme » retire les fichiers par côté. */
  setPerSideMode(variant: VideoVariant, perSide: boolean): void {
    this.perSideUiOpen[variant.display_type] = perSide;
    if (!perSide) {
      (variant.side_files ?? []).forEach((s) => this.removeSideFile(variant, s.side_index));
    }
  }

  onSideFileSelected(event: Event, sideIndex: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadingSide = sideIndex;
    const formData = new FormData();
    formData.append('video', file);
    this.http
      .post(
        `${environment.apiUrl}/videos/${this.videoId}/variants/${LED_PERIMETER_TYPE}/sides/${sideIndex}`,
        formData,
        { withCredentials: true }
      )
      .subscribe({
        next: () => {
          this.uploadingSide = null;
          input.value = '';
          this.loadVariants();
        },
        error: (err) => {
          this.uploadingSide = null;
          this.notificationService.error(`Erreur upload côté : ${ErrorExtractor.getMessage(err)}`);
        },
      });
  }

  /** Associe une vidéo existante de la bibliothèque à un côté (sans upload). */
  onSideSourceSelected(event: Event, sideIndex: number): void {
    const select = event.target as HTMLSelectElement;
    const sourceVideoId = select.value;
    if (!sourceVideoId) return;
    this.linkingSide = sideIndex;
    this.http
      .post(
        `${environment.apiUrl}/videos/${this.videoId}/variants/${LED_PERIMETER_TYPE}/sides/${sideIndex}/from-video`,
        { source_video_id: sourceVideoId },
        { withCredentials: true }
      )
      .subscribe({
        next: () => {
          this.linkingSide = null;
          select.value = '';
          this.loadVariants();
        },
        error: (err) => {
          this.linkingSide = null;
          select.value = '';
          this.notificationService.error(`Erreur association côté : ${ErrorExtractor.getMessage(err)}`);
        },
      });
  }

  removeSideFile(variant: VideoVariant, sideIndex: number): void {
    this.http
      .delete(
        `${environment.apiUrl}/videos/${this.videoId}/variants/${LED_PERIMETER_TYPE}/sides/${sideIndex}`,
        { withCredentials: true }
      )
      .subscribe({
        next: () => this.loadVariants(),
        error: (err) =>
          this.notificationService.error(`Erreur suppression côté : ${ErrorExtractor.getMessage(err)}`),
      });
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

  ngOnDestroy(): void {
    Object.values(this.exportPollTimers).forEach((t) => clearTimeout(t));
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
    input.value = '';

    // Pour le LED périmétrique, on lit les dimensions côté client (sans ffprobe)
    // pour que le validateur de format serveur (PROP-014 §6) puisse juger.
    if (this.isLedPerimeter(displayType)) {
      this.readVideoDimensions(file).then((dims) => this.uploadVariant(file, displayType, dims));
    } else {
      this.uploadVariant(file, displayType, null);
    }
  }

  private uploadVariant(
    file: File,
    displayType: string,
    dims: { width: number; height: number } | null
  ): void {
    this.uploadingType = displayType;
    this.uploadProgress = 0;

    const formData = new FormData();
    formData.append('video', file);
    formData.append('display_type', displayType);
    if (dims) {
      formData.append('width', String(dims.width));
      formData.append('height', String(dims.height));
    }

    this.http.post<VideoVariant & { format_notice?: LedFormatNotice }>(
      `${environment.apiUrl}/videos/${this.videoId}/variants`,
      formData,
      { withCredentials: true, reportProgress: true, observe: 'events' }
    ).subscribe({
      next: (event: HttpEvent<VideoVariant & { format_notice?: LedFormatNotice }>) => {
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
          // Avis de format LED (PROP-014 §6) — informatif, non bloquant.
          if (variant.format_notice) {
            this.formatNotices[displayType] = variant.format_notice;
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
  }

  /** Lit les dimensions d'une vidéo via un <video> temporaire. Null si illisible. */
  private readVideoDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(
          video.videoWidth > 0 && video.videoHeight > 0
            ? { width: video.videoWidth, height: video.videoHeight }
            : null
        );
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      video.src = url;
    });
  }

  /** Classe CSS / sévérité de l'avis de format pour l'affichage. */
  formatNoticeClass(verdict: LedFormatNotice['verdict']): string {
    return `format-notice--${verdict}`;
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

  // --- Export plié async (PROP-014 §6 / étape 6) ---

  isExporting(type: string): boolean {
    const s = this.exportStates[type]?.status;
    return s === 'queued' || s === 'processing';
  }

  /** L'export plié plie pour le club consulté → un site doit être en contexte. */
  get canExportLed(): boolean {
    return !!this.siteId;
  }

  exportButtonLabel(type: string): string {
    return this.isExporting(type) ? 'Export en cours…' : 'Exporter le MP4 plié';
  }

  /** Enqueue un export plié (pour le club consulté) puis poll le statut. */
  exportLed(variant: VideoVariant): void {
    const type = variant.display_type;
    this.exportStates[type] = { status: 'queued' };

    this.http.post<{ job_id: string; status: string; output_url?: string | null; reused?: boolean }>(
      `${environment.apiUrl}/videos/${this.videoId}/variants/${type}/export`,
      { target_site_id: this.siteId },
      { withCredentials: true }
    ).subscribe({
      next: (res) => {
        // Réutilisation : ruban déjà plié pour ce club → prêt immédiatement.
        if (res.status === 'ready' && res.output_url) {
          this.exportStates[type] = { status: 'ready', url: res.output_url };
          this.notificationService.success('Ruban déjà disponible — prêt au téléchargement');
        } else {
          this.pollExport(type, res.job_id);
        }
      },
      error: (error) => {
        this.exportStates[type] = { status: 'failed', error: ErrorExtractor.getMessage(error) };
        this.notificationService.error(`Erreur export: ${ErrorExtractor.getMessage(error)}`);
      }
    });
  }

  private pollExport(type: string, jobId: string): void {
    // Cache-buster : sans ça, le navigateur peut servir le 1er statut depuis son
    // cache HTTP → le polling reste bloqué sur 'queued'/'processing' et ne voit
    // jamais 'ready' (incident 2026-06-03).
    this.http.get<{ status: string; output_url: string | null; error_msg: string | null }>(
      `${environment.apiUrl}/led-export-jobs/${jobId}?_=${Date.now()}`,
      { withCredentials: true }
    ).subscribe({
      next: (job) => {
        if (job.status === 'ready') {
          this.exportStates[type] = { status: 'ready', url: job.output_url };
          this.notificationService.success('Export plié prêt au téléchargement');
        } else if (job.status === 'failed') {
          this.exportStates[type] = { status: 'failed', error: job.error_msg };
          this.notificationService.error(`Export échoué: ${job.error_msg ?? 'erreur inconnue'}`);
        } else {
          this.exportStates[type] = { status: job.status === 'processing' ? 'processing' : 'queued' };
          this.exportPollTimers[type] = setTimeout(() => this.pollExport(type, jobId), 2000);
        }
      },
      error: () => {
        this.exportStates[type] = { status: 'failed', error: 'Erreur de suivi du job' };
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
