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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TemplatesStudioService } from '../../templates-studio.service';
import type {
  RequiredAsset,
  StudioAsset,
  TemplateAssetBindingsResult,
  TemplateSummary,
} from '../../templates-studio.types';

/**
 * ADR-125 — Page bindings d'un template.
 *
 * Affiche tous les slots déclarés dans `manifest.requiredAssets` et permet à
 * l'admin de binder chaque slot vers un asset de la library.
 *
 * Routes :
 *   /templates-studio/admin/assets             → liste des templates
 *   /templates-studio/admin/assets/:slug       → bindings du template
 *
 * Quand `:slug` est absent, on liste les templates avec leur statut "X/N
 * slots bindés" pour orienter l'admin vers ceux qui ont des trous.
 *
 * Modal "Choisir ou uploader" : 2 onglets
 * - Choisir dans la library (filtrée par mime compatible)
 * - Upload nouveau (drop-zone + auto-bind après upload réussi)
 */
@Component({
  selector: 'app-template-bindings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './template-bindings.component.html',
  styleUrls: ['./template-bindings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateBindingsComponent implements OnInit {
  private studio = inject(TemplatesStudioService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  loading = signal(true);
  errorMsg = signal<string | null>(null);
  successMsg = signal<string | null>(null);

  slug = signal<string | null>(null);
  template = signal<TemplateSummary | null>(null);
  bindings = signal<TemplateAssetBindingsResult | null>(null);

  // Vue catalogue (quand slug absent) : tous les templates + leur progression.
  templates = signal<TemplateSummary[]>([]);
  templatesProgress = signal<
    Record<string, { bound: number; required: number }>
  >({});

  // Modal d'assignation.
  modalSlot = signal<RequiredAsset | null>(null);
  modalTab = signal<'choose' | 'upload'>('choose');
  libraryAssets = signal<StudioAsset[]>([]);
  libraryLoading = signal(false);
  pendingFile = signal<File | null>(null);
  uploadingForSlot = signal(false);

  isTemplatesView = computed(() => !this.slug());

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug');
      this.slug.set(slug);
      if (slug) {
        this.loadBindings(slug);
      } else {
        this.loadTemplatesOverview();
      }
    });
  }

  // ── Templates overview ────────────────────────────────────────────────────

  private loadTemplatesOverview(): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.studio.listTemplates().subscribe({
      next: (templates) => {
        this.templates.set(templates);
        this.loading.set(false);
        // Charge la progression de chaque template (1 req par template).
        for (const t of templates) {
          this.studio.getTemplateAssetBindings(t.slug).subscribe({
            next: (res) => {
              const next = { ...this.templatesProgress() };
              next[t.slug] = {
                bound: res.bindings.length,
                required: res.required.length,
              };
              this.templatesProgress.set(next);
            },
            error: () => {
              // silently ignore — l'overview ne doit pas casser si 1 template fait 500.
            },
          });
        }
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.error ?? 'Erreur lors du chargement des templates');
        this.loading.set(false);
      },
    });
  }

  // ── Bindings d'un template ────────────────────────────────────────────────

  loadBindings(slug: string): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.studio.listTemplates().subscribe({
      next: (all) => {
        const tpl = all.find((t) => t.slug === slug);
        if (!tpl) {
          this.errorMsg.set(`Template ${slug} introuvable`);
          this.loading.set(false);
          return;
        }
        this.template.set(tpl);
        this.studio.getTemplateAssetBindings(slug).subscribe({
          next: (res) => {
            this.bindings.set(res);
            this.loading.set(false);
          },
          error: (err) => {
            this.errorMsg.set(
              err?.error?.error ?? 'Erreur lors du chargement des bindings',
            );
            this.loading.set(false);
          },
        });
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.error ?? 'Erreur lors du chargement');
        this.loading.set(false);
      },
    });
  }

  bindingForSlot(key: string) {
    return this.bindings()?.bindings.find((b) => b.asset_key === key) ?? null;
  }

  // ── Modal assign ──────────────────────────────────────────────────────────

  openSlotModal(slot: RequiredAsset): void {
    this.modalSlot.set(slot);
    this.modalTab.set('choose');
    this.pendingFile.set(null);
    this.loadLibraryForSlot(slot);
  }

  closeSlotModal(): void {
    this.modalSlot.set(null);
    this.pendingFile.set(null);
  }

  private loadLibraryForSlot(slot: RequiredAsset): void {
    this.libraryLoading.set(true);
    // Pré-filtre par mime du slot s'il est connu.
    const filters: { mime?: string } = {};
    if (slot.mime) {
      // ADR-127 : pour les slots font, élargir le filtre à `font/*` (l'admin
      // peut avoir uploadé du woff/ttf alors que le slot demande woff2 — on
      // accepte tous les types font et c'est le browser qui choisira).
      if (this.isFontSlot(slot)) {
        filters.mime = 'font/';
      } else {
        // 'image/png' ou 'video/mp4' → on peut prefilter sur le mime exact.
        filters.mime = slot.mime;
      }
    }
    this.studio.listStudioAssets({ ...filters, limit: 200 }).subscribe({
      next: (res) => {
        this.libraryAssets.set(res.assets);
        this.libraryLoading.set(false);
      },
      error: () => {
        this.libraryLoading.set(false);
      },
    });
  }

  selectFromLibrary(asset: StudioAsset): void {
    const slot = this.modalSlot();
    const slug = this.slug();
    if (!slot || !slug) return;
    this.studio.bindTemplateAsset(slug, slot.key, asset.id).subscribe({
      next: () => {
        this.successMsg.set(`Slot '${slot.key}' lié à ${asset.filename}`);
        this.closeSlotModal();
        this.loadBindings(slug);
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.error ?? 'Échec du binding');
      },
    });
  }

  removeBinding(slotKey: string): void {
    const slug = this.slug();
    if (!slug) return;
    if (!confirm(`Supprimer le binding du slot '${slotKey}' ?`)) return;
    this.studio.deleteTemplateAssetBinding(slug, slotKey).subscribe({
      next: () => {
        this.successMsg.set(`Binding ${slotKey} retiré`);
        this.loadBindings(slug);
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.error ?? 'Échec de la suppression');
      },
    });
  }

  // Upload tab.
  onPendingFile(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) this.pendingFile.set(file);
    target.value = '';
  }

  submitUploadAndBind(): void {
    const file = this.pendingFile();
    const slot = this.modalSlot();
    const slug = this.slug();
    if (!file || !slot || !slug || this.uploadingForSlot()) return;
    this.uploadingForSlot.set(true);
    this.errorMsg.set(null);
    // Tag automatique avec le slug + asset_key pour faciliter le retrouvage
    // ultérieur dans la library.
    const tags = [`template:${slug}`, `slot:${slot.key}`];
    this.studio.uploadStudioAsset(file, { tags }).subscribe({
      next: (asset) => {
        // Après upload (ou dédup), on bind directement le slot.
        this.studio.bindTemplateAsset(slug, slot.key, asset.id).subscribe({
          next: () => {
            this.uploadingForSlot.set(false);
            this.successMsg.set(
              asset.deduplicated
                ? `Asset existant réutilisé et lié à '${slot.key}'`
                : `Asset uploadé et lié à '${slot.key}'`,
            );
            this.closeSlotModal();
            this.loadBindings(slug);
          },
          error: (err) => {
            this.uploadingForSlot.set(false);
            this.errorMsg.set(
              err?.error?.error ?? 'Upload OK mais binding échoué',
            );
          },
        });
      },
      error: (err) => {
        this.uploadingForSlot.set(false);
        this.errorMsg.set(err?.error?.error ?? 'Échec upload');
      },
    });
  }

  goToTemplate(slug: string): void {
    this.router.navigate(['/templates-studio/admin/assets', slug]);
  }

  isImage(asset: StudioAsset): boolean {
    return asset.mime_type.startsWith('image/');
  }
  isVideo(asset: StudioAsset): boolean {
    return asset.mime_type.startsWith('video/');
  }
  /**
   * ADR-127 — détecte les assets font (woff2/woff/ttf, font/* ou
   * application/[x-]font-*). Pour ces assets, on n'affiche pas de preview
   * visuelle (pas de thumbnail) mais une icône Aa.
   */
  isFont(asset: StudioAsset): boolean {
    const m = asset.mime_type;
    return (
      m.startsWith('font/') ||
      m.startsWith('application/font-') ||
      m.startsWith('application/x-font-')
    );
  }
  /** True si le slot du manifest cible une font (mime font/* ou application/font-*). */
  isFontSlot(slot: RequiredAsset | null): boolean {
    if (!slot?.mime) return false;
    return (
      slot.mime.startsWith('font/') ||
      slot.mime.startsWith('application/font-') ||
      slot.mime.startsWith('application/x-font-')
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

  trackBySlug(_i: number, t: TemplateSummary): string {
    return t.slug;
  }
  trackByAssetKey(_i: number, slot: RequiredAsset): string {
    return slot.key;
  }
  trackByAssetId(_i: number, asset: StudioAsset): string {
    return asset.id;
  }

  dismissMessages(): void {
    this.errorMsg.set(null);
    this.successMsg.set(null);
  }
}
