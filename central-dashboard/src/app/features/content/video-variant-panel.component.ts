import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpEventType, HttpEvent } from '@angular/common/http';
import { NotificationService } from '../../core/services/notification.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { DisplayConfig, CloudVideo } from '../../core/models';
import { ledSourceFormat, ledCellPx } from '../../core/utils/led-geometry';
import { LedRibbonPreviewComponent } from './led-ribbon-preview.component';
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

/**
 * Vrai pour `led-perimeter` et tout ruban additionnel du même club
 * (`led-perimeter-2`, `led-perimeter-3`, ...). ADR-143 : un club peut avoir
 * plusieurs rubans indépendants (bord de terrain, tribune...), chacun avec sa
 * propre géométrie — jamais celle du premier ruban trouvé sur le site.
 */
function isLedPerimeterFamily(displayType: string): boolean {
  return displayType === LED_PERIMETER_TYPE || displayType.startsWith(`${LED_PERIMETER_TYPE}-`);
}

/** Options de mise en page LED (PROP-014 §8 / ADR-134). Slugs alignés sur l'API. */
const LAYOUT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  // `centered` manquait alors que l'API l'accepte depuis toujours
  // (`validation.ts` : repeated|scrolling|stretched|centered) et que c'est le
  // choix le plus sûr pour une vidéo déjà au bon format — celui que le
  // classificateur propose le plus souvent.
  { value: 'centered', label: 'Centré' },
  { value: 'repeated', label: 'Répété' },
  { value: 'scrolling', label: 'Défilant' },
  { value: 'stretched', label: 'Étalé' },
];

/** Recommandation de cadrage (serveur : `led-content-fit.service.ts`). */
export interface FitRecommendation {
  scope: 'one-side' | 'full-ribbon';
  layout: string;
  target: { width: number; height: number };
  explanation: string;
  warnings: string[];
  exact: boolean;
}

@Component({
  selector: 'app-video-variant-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, LedRibbonPreviewComponent],
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
  /**
   * Ce composant est imbriqué dans une chaîne d'ancêtres OnPush
   * (video-manager → site-content-tab → video-library → video-detail-panel).
   * Un clic ouvrant la modale marque cette chaîne dirty pour SON tick, mais les
   * réponses HTTP arrivent sur un tick zone.js ultérieur non lié à un event
   * DOM interne à cette chaîne — sans markForCheck() explicite, Angular
   * s'arrête au premier ancêtre OnPush et ne redescend jamais jusqu'ici :
   * la mutation JS (`loading = false`) a bien lieu mais ne s'affiche jamais
   * (modale bloquée sur "Chargement...").
   */
  private cdr = inject(ChangeDetectorRef);

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

  /**
   * Recommandation de cadrage renvoyée par le serveur à l'upload (ADR-138 suite).
   * Traduit deux mesures — la vidéo, le terrain — en une phrase lisible, au lieu
   * de laisser choisir entre quatre options abstraites sans savoir laquelle
   * déforme le logo d'un sponsor.
   */
  fitRecommendations: Record<string, FitRecommendation> = {};
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
    return isLedPerimeterFamily(type);
  }

  // --- Contenu LED « par côté » (ADR-135) ---

  /**
   * Côtés du ruban LED de CE display précis (longueurs en m). Vide si pas de
   * display de ce type exact. ADR-143 : un club peut avoir plusieurs rubans
   * (`led-perimeter`, `led-perimeter-2`...), chacun avec ses propres côtés —
   * ne jamais retomber sur le premier display `led-perimeter` du site.
   */
  ledSides(displayType: string): number[] {
    const d = this.siteDisplays?.find((x) => x.type === displayType);
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

  onSideFileSelected(event: Event, sideIndex: number, variant: VideoVariant): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadingSide = sideIndex;
    const formData = new FormData();
    formData.append('video', file);
    this.http
      .post(
        `${environment.apiUrl}/videos/${this.videoId}/variants/${variant.display_type}/sides/${sideIndex}`,
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
          this.cdr.markForCheck();
        },
      });
  }

  /** Associe une vidéo existante de la bibliothèque à un côté (sans upload). */
  onSideSourceSelected(event: Event, sideIndex: number, variant: VideoVariant): void {
    const select = event.target as HTMLSelectElement;
    const sourceVideoId = select.value;
    if (!sourceVideoId) return;
    this.linkingSide = sideIndex;
    this.http
      .post(
        `${environment.apiUrl}/videos/${this.videoId}/variants/${variant.display_type}/sides/${sideIndex}/from-video`,
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
          this.cdr.markForCheck();
        },
      });
  }

  removeSideFile(variant: VideoVariant, sideIndex: number): void {
    this.http
      .delete(
        `${environment.apiUrl}/videos/${this.videoId}/variants/${variant.display_type}/sides/${sideIndex}`,
        { withCredentials: true }
      )
      .subscribe({
        next: () => this.loadVariants(),
        error: (err) => {
          this.notificationService.error(`Erreur suppression côté : ${ErrorExtractor.getMessage(err)}`);
          this.cdr.markForCheck();
        },
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

  /**
   * Format que le club doit produire pour cet écran (« Format recommandé »).
   *
   * Pour un ruban LED, c'est le RUBAN DÉROULÉ (Σ côtés × pitch × hauteur) — c'est ce
   * que `validateLedFormat` juge côté serveur, et il se dérive du terrain du club.
   * Avant, on affichait `display.resolution`, une constante de gabarit (`1920x1120`)
   * qui ne correspondait à aucun club réel. Pour les autres types, la résolution
   * standard reste la bonne réponse.
   */
  getFormatHint(display: DisplayConfig): string | null {
    if (isLedPerimeterFamily(display.type)) return ledSourceFormat(display.led);
    return display.resolution || null;
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
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.loaded = true;
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.linkingType = null;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        select.value = '';
        this.cdr.markForCheck();
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

    this.http.post<VideoVariant & { format_notice?: LedFormatNotice; fit_recommendation?: FitRecommendation }>(
      `${environment.apiUrl}/videos/${this.videoId}/variants`,
      formData,
      { withCredentials: true, reportProgress: true, observe: 'events' }
    ).subscribe({
      next: (event: HttpEvent<VideoVariant & { format_notice?: LedFormatNotice; fit_recommendation?: FitRecommendation }>) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress = Math.round((event.loaded / event.total) * 100);
          this.cdr.markForCheck();
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
          // Recommandation de cadrage : on PRÉ-SÉLECTIONNE la mise en page
          // proposée quand l'opérateur n'en a pas encore choisi une. Jamais
          // d'écrasement d'un choix existant — c'est une proposition, pas une
          // décision.
          if (variant.fit_recommendation) {
            this.fitRecommendations[displayType] = variant.fit_recommendation;
            if (!variant.layout) {
              this.applyRecommendedLayout(variant, variant.fit_recommendation.layout);
            }
          }
          this.emitChange();
          this.notificationService.success(`Variante ${this.getDisplayLabel(displayType)} uploadee`);
          this.cdr.markForCheck();
        }
      },
      error: (error) => {
        this.uploadingType = null;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur upload: ${message}`);
        this.cdr.markForCheck();
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
  /**
   * Applique la mise en page proposée par le serveur, en base et dans l'UI.
   * Appelée UNIQUEMENT quand l'opérateur n'a pas déjà choisi : une recommandation
   * ne doit jamais écraser une décision humaine.
   */
  private applyRecommendedLayout(variant: VideoVariant, layout: string): void {
    variant.layout = layout;
    this.http
      .patch<{ layout: string | null }>(
        `${environment.apiUrl}/videos/${this.videoId}/variants/${variant.display_type}/layout`,
        { layout },
        { withCredentials: true }
      )
      .subscribe({
        error: () => {
          // Silencieux : la proposition reste affichée, l'opérateur peut la
          // rejouer à la main. Échouer bruyamment sur une suggestion serait pire
          // que de ne rien proposer.
          variant.layout = null;
          this.cdr.markForCheck();
        },
      });
  }

  /**
   * Profil LED de CE display précis (géométrie du ruban), ou `null`. ADR-143 :
   * ne jamais retomber sur le premier `led-perimeter` du site — un club peut
   * en avoir plusieurs, chacun avec sa propre géométrie.
   */
  private ledProfileFor(displayType: string) {
    return this.siteDisplays?.find((d) => d.type === displayType)?.led ?? null;
  }

  /** Cadence du motif en px, pour que l'aperçu montre le BON nombre de copies. */
  ledCellPx(displayType: string): number {
    return ledCellPx(this.ledProfileFor(displayType));
  }

  /**
   * Cadre visé par l'aperçu : la cible recommandée par le serveur si on l'a,
   * sinon un côté déduit du profil. Sans profil, rien n'est prévisualisable.
   */
  previewTarget(displayType: string): { width: number; height: number } | null {
    const reco = this.fitRecommendations[displayType];
    if (reco) return reco.target;
    const led = this.ledProfileFor(displayType);
    if (!led || !led.sides?.length) return null;
    const mm = parseFloat(String(led.pitch).replace(/^P/i, ''));
    if (!Number.isFinite(mm) || mm <= 0) return null;
    return { width: Math.round(led.sides[0] * (1000 / mm)), height: led.height };
  }

  /** Libellé lisible de la mise en page proposée (« Centré », « Répété »…). */
  recommendedLayoutLabel(rec: FitRecommendation): string {
    return LAYOUT_OPTIONS.find((o) => o.value === rec.layout)?.label ?? 'Centré';
  }

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
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.deletingType = null;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.savingLayoutType = null;
        variant.layout = previous; // rollback optimiste
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.exportStates[type] = { status: 'failed', error: ErrorExtractor.getMessage(error) };
        this.notificationService.error(`Erreur export: ${ErrorExtractor.getMessage(error)}`);
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
      },
      error: () => {
        this.exportStates[type] = { status: 'failed', error: 'Erreur de suivi du job' };
        this.cdr.markForCheck();
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
