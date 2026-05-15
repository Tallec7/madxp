import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TemplatesStudioService } from '../../templates-studio.service';
import type {
  StudioAsset,
  StudioAssetWithUsage,
} from '../../templates-studio.types';

/**
 * ADR-125 — Page library globale d'assets Studio.
 *
 * Catalogue partagé sur toute la flotte (super_admin / admin / operator). Pas
 * de notion de site_id. Permet à un designer Daisy d'uploader textures,
 * watermarks, vidéos d'overlay, etc. puis de les binder vers les slots des
 * templates depuis `/templates-studio/admin/assets/:slug`.
 *
 * UX :
 * - Grille responsive avec preview (image / video poster / icône fichier).
 * - Filtres : type (Tous / Images / Vidéos / Fonts), tag, search filename.
 * - Upload drop-zone + form tags.
 * - Click asset → modal détail (preview + usage list "Utilisé par X" + delete).
 * - Suppression : 409 si utilisé, message clair avec liste des bindings.
 */
@Component({
  selector: 'app-studio-asset-library',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './asset-library.component.html',
  styleUrls: ['./asset-library.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetLibraryComponent implements OnInit {
  private studio = inject(TemplatesStudioService);

  loading = signal(true);
  errorMsg = signal<string | null>(null);
  successMsg = signal<string | null>(null);

  assets = signal<StudioAsset[]>([]);
  total = signal(0);

  // Filtres locaux UI.
  searchTerm = signal('');
  selectedType = signal<'all' | 'image' | 'video' | 'font' | 'directory'>('all');
  selectedTag = signal<string>('');

  // Chips affichés en filtre type — typés strictement pour le template Angular.
  // ADR-128 — ajout 'directory' pour filtrer les séquences PNG frames.
  readonly typeChips: ReadonlyArray<{
    id: 'all' | 'image' | 'video' | 'font' | 'directory';
    label: string;
  }> = [
    { id: 'all', label: 'Tous' },
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Vidéos' },
    { id: 'font', label: 'Fonts' },
    { id: 'directory', label: 'Directories' },
  ];

  // Modal détail.
  selectedAsset = signal<StudioAssetWithUsage | null>(null);
  detailLoading = signal(false);

  // Upload state.
  uploading = signal(false);
  uploadProgress = signal<number>(0);
  pendingFile = signal<File | null>(null);
  pendingTags = signal<string>('');
  pendingFramePattern = signal<string>('');
  isDraggingOver = signal(false);
  /**
   * ADR-128 — mode upload : 'file' (asset standard) | 'directory' (ZIP de
   * PNG frames pour masque alpha). Toggle dans l'UI ; le `<input>` ouvre
   * soit `accept=image/*,video/*,font/*` soit `accept=.zip` selon le mode.
   */
  uploadMode = signal<'file' | 'directory'>('file');

  // Tags uniques computés depuis la liste actuelle.
  availableTags = computed(() => {
    const all = new Set<string>();
    for (const a of this.assets()) {
      for (const t of a.tags ?? []) all.add(t);
    }
    return Array.from(all).sort();
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    const filters: { tag?: string; mime?: string; search?: string } = {};
    if (this.selectedTag()) filters.tag = this.selectedTag();
    if (this.selectedType() !== 'all') {
      if (this.selectedType() === 'directory') {
        // ADR-128 — les directories ont un MIME spécifique
        // `application/x-png-frames` posé par le controller.
        filters.mime = 'application/x-png-frames';
      } else {
        // 'image' → 'image/*', 'video' → 'video/*', 'font' → 'font/*'.
        // ADR-127 : les fonts ont aussi des MIME `application/[x-]font-*`,
        // mais le préfixe `font/` couvre les uploads modernes (woff2 par défaut).
        filters.mime = `${this.selectedType()}/`;
      }
    }
    if (this.searchTerm()) filters.search = this.searchTerm();
    this.studio.listStudioAssets(filters).subscribe({
      next: (res) => {
        this.assets.set(res.assets);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: (err) => {
        const e = err?.error?.error;
        const msg =
          (typeof e === 'string' ? e : e?.message) ??
          err?.message ??
          'Erreur lors du chargement de la library';
        this.errorMsg.set(msg);
        this.loading.set(false);
      },
    });
  }

  onTypeChange(type: 'all' | 'image' | 'video' | 'font' | 'directory'): void {
    this.selectedType.set(type);
    this.load();
  }

  setUploadMode(mode: 'file' | 'directory'): void {
    if (this.uploadMode() === mode) return;
    this.uploadMode.set(mode);
    // Reset le pending file pour éviter d'envoyer un fichier au mauvais endpoint.
    this.pendingFile.set(null);
    this.pendingTags.set('');
    this.pendingFramePattern.set('');
  }

  onTagChange(tag: string): void {
    this.selectedTag.set(tag);
    this.load();
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    // Debounce manuel léger via setTimeout — évite 1 req/keystroke.
    setTimeout(() => {
      if (this.searchTerm() === value) this.load();
    }, 300);
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) this.pendingFile.set(file);
    target.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingOver.set(true);
  }
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingOver.set(false);
  }
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.pendingFile.set(file);
  }

  cancelUpload(): void {
    this.pendingFile.set(null);
    this.pendingTags.set('');
    this.pendingFramePattern.set('');
  }

  submitUpload(): void {
    const file = this.pendingFile();
    if (!file || this.uploading()) return;
    this.uploading.set(true);
    this.errorMsg.set(null);
    this.successMsg.set(null);
    const tags = this.pendingTags()
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const onSuccess = (asset: StudioAsset & { deduplicated?: boolean }) => {
      this.uploading.set(false);
      this.pendingFile.set(null);
      this.pendingTags.set('');
      this.pendingFramePattern.set('');
      this.successMsg.set(
        asset.deduplicated
          ? `Asset déjà existant — réutilisé (${asset.filename})`
          : `Asset uploadé : ${asset.filename}`,
      );
      this.load();
    };
    const onError = (err: { error?: { error?: unknown }; message?: string }) => {
      this.uploading.set(false);
      const e = err?.error?.error;
      const msg =
        (typeof e === 'string' ? e : (e as { message?: string } | undefined)?.message) ??
        err?.message ??
        'Échec upload';
      this.errorMsg.set(msg);
    };

    if (this.uploadMode() === 'directory') {
      const framePattern = this.pendingFramePattern().trim();
      this.studio
        .uploadStudioAssetDirectory(file, {
          tags,
          framePattern: framePattern.length > 0 ? framePattern : undefined,
        })
        .subscribe({ next: onSuccess, error: onError });
    } else {
      this.studio
        .uploadStudioAsset(file, { tags })
        .subscribe({ next: onSuccess, error: onError });
    }
  }

  // ── Modal détail ──────────────────────────────────────────────────────────

  openDetail(asset: StudioAsset): void {
    this.detailLoading.set(true);
    this.selectedAsset.set({ ...asset, usage: [] });
    this.studio.getStudioAsset(asset.id).subscribe({
      next: (full) => {
        this.selectedAsset.set(full);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailLoading.set(false);
      },
    });
  }

  closeDetail(): void {
    this.selectedAsset.set(null);
  }

  deleteSelected(): void {
    const asset = this.selectedAsset();
    if (!asset) return;
    if (!confirm(`Supprimer définitivement "${asset.filename}" ?`)) return;
    this.studio.deleteStudioAsset(asset.id).subscribe({
      next: () => {
        this.successMsg.set(`Asset supprimé : ${asset.filename}`);
        this.closeDetail();
        this.load();
      },
      error: (err) => {
        // 409 si utilisé : afficher la liste des templates concernés.
        const usage = err?.error?.usage as
          | Array<{ template_slug: string; asset_key: string }>
          | undefined;
        if (usage && usage.length > 0) {
          const refs = usage
            .map((u) => `${u.template_slug}.${u.asset_key}`)
            .join(', ');
          this.errorMsg.set(
            `Asset utilisé par : ${refs}. Retire les bindings d'abord.`,
          );
        } else {
          this.errorMsg.set(err?.error?.error ?? 'Erreur lors de la suppression');
        }
      },
    });
  }

  // ── Helpers UI ────────────────────────────────────────────────────────────

  isImage(asset: StudioAsset): boolean {
    return asset.asset_kind === 'file' && asset.mime_type.startsWith('image/');
  }
  isVideo(asset: StudioAsset): boolean {
    return asset.asset_kind === 'file' && asset.mime_type.startsWith('video/');
  }
  /**
   * ADR-127 — couvre `font/woff2`, `font/woff`, `font/ttf` et les MIME
   * legacy `application/font-*` / `application/x-font-*` (les fonts n'ont
   * pas de preview thumbnail, on affiche une icône à la place).
   */
  isFont(asset: StudioAsset): boolean {
    if (asset.asset_kind === 'directory') return false;
    const m = asset.mime_type;
    return (
      m.startsWith('font/') ||
      m.startsWith('application/font-') ||
      m.startsWith('application/x-font-')
    );
  }
  /** ADR-128 — séquence PNG frames (masque alpha animé). */
  isDirectory(asset: StudioAsset): boolean {
    return asset.asset_kind === 'directory';
  }
  /**
   * ADR-128 — préview de la 1ʳᵉ frame d'un asset directory. Construit
   * l'URL en interpolant `frame_pattern` avec l'index 1.
   */
  firstFrameUrl(asset: StudioAsset): string | null {
    if (asset.asset_kind !== 'directory' || !asset.frame_pattern) return null;
    const baseUrl = asset.url.endsWith('/') ? asset.url : `${asset.url}/`;
    return baseUrl + this.interpolateFramePattern(asset.frame_pattern, 1);
  }
  /**
   * ADR-128 — préview de la dernière frame d'un asset directory.
   */
  lastFrameUrl(asset: StudioAsset): string | null {
    if (
      asset.asset_kind !== 'directory' ||
      !asset.frame_pattern ||
      !asset.frame_count
    )
      return null;
    const baseUrl = asset.url.endsWith('/') ? asset.url : `${asset.url}/`;
    return baseUrl + this.interpolateFramePattern(asset.frame_pattern, asset.frame_count);
  }
  private interpolateFramePattern(pattern: string, frameIdx: number): string {
    return pattern.replace(/\{i:0(\d+)d\}/, (_match, padding) =>
      String(frameIdx).padStart(parseInt(padding, 10), '0'),
    );
  }

  formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  trackById(_i: number, asset: StudioAsset): string {
    return asset.id;
  }

  dismissMessages(): void {
    this.errorMsg.set(null);
    this.successMsg.set(null);
  }
}
