/**
 * ADR-110 / Plan 02 — Asset Manager v3 (Bibliothèque de fonds animés).
 * Composant standalone dual-context (modal | page) :
 *   - context='modal' : monté depuis le wizard step 2, émet `assetSelected`
 *   - context='page'  : route /content/templates-remotion/assets, super_admin
 *
 * Consomme les endpoints backend Plan 02 :
 *   - GET    /api/remotion-templates/assets
 *   - POST   /api/remotion-templates/library/upload
 *   - DELETE /api/remotion-templates/assets/:assetId
 *
 * Vocabulaire UI : VOCABULARY_MAP (ADR-110, smoke test enforced).
 */

import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { RemotionTemplatesDataService } from '../../remotion-templates-data.service';
import type { WebmAssetMetadata } from '../../remotion-templates.types';

@Component({
  selector: 'app-asset-manager-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './asset-manager-modal.component.html',
  styleUrl: './asset-manager-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetManagerModalComponent implements OnInit {
  @Input() context: 'modal' | 'page' = 'modal';
  /** Quand le wizard ouvre la modal pour un slot avec respect_alpha=true. */
  @Input() respectAlphaRequired = false;
  @Output() assetSelected = new EventEmitter<{ url: string }>();
  @Output() dismiss = new EventEmitter<void>();

  private dataService = inject(RemotionTemplatesDataService);
  private route = inject(ActivatedRoute);

  assets = signal<WebmAssetMetadata[]>([]);
  loading = signal<boolean>(false);
  uploadError = signal<string | null>(null);
  uploadDetail = signal<string | null>(null);
  deleteError = signal<string | null>(null);
  uploading = signal<boolean>(false);

  ngOnInit(): void {
    const ctx = this.route.snapshot.data['context'];
    if (ctx === 'page') this.context = 'page';
    this.loadAssets();
  }

  private loadAssets(): void {
    this.loading.set(true);
    this.dataService.listLibraryAssets().subscribe({
      next: (a) => {
        this.assets.set(a);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadError.set(null);
    this.uploadDetail.set(null);
    this.uploading.set(true);
    this.dataService
      .uploadLibraryAsset(file, { respectAlpha: this.respectAlphaRequired })
      .subscribe({
        next: (a) => {
          this.assets.update((list) => [a, ...list]);
          this.uploading.set(false);
          // Reset l'input pour autoriser un re-upload du même fichier.
          input.value = '';
        },
        error: (err) => {
          const body = err?.error ?? {};
          this.uploadError.set(body.message ?? 'Upload échoué');
          this.uploadDetail.set(body.detail?.detectedPixFmt ?? null);
          this.uploading.set(false);
          input.value = '';
        },
      });
  }

  onDelete(asset: WebmAssetMetadata, ev: Event): void {
    ev.stopPropagation();
    const filename = this.filenameOf(asset.url);
    if (!confirm(`Supprimer ${filename} ?`)) return;
    this.deleteError.set(null);
    this.dataService.deleteLibraryAsset(asset.id).subscribe({
      next: () => {
        this.assets.update((list) => list.filter((x) => x.id !== asset.id));
      },
      error: (err) => {
        const body = err?.error ?? {};
        const count = body.detail?.usedByPublishedCount ?? 0;
        this.deleteError.set(
          `Ce fond est utilisé par ${count} template(s) publié(s) — supprimez d'abord les clones.`,
        );
      },
    });
  }

  onSelect(asset: WebmAssetMetadata): void {
    if (this.context === 'modal') this.assetSelected.emit({ url: asset.url });
  }

  onDismiss(): void {
    this.dismiss.emit();
  }

  filenameOf(url: string): string {
    return url.split('/').pop() ?? url;
  }

  formatDuration(ms: number): string {
    return ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '—';
  }

  formatDimensions(a: WebmAssetMetadata): string {
    return a.width > 0 && a.height > 0 ? `${a.width}×${a.height}` : '—';
  }
}
