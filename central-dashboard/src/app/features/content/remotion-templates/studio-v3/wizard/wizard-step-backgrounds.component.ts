/**
 * Template Studio v3 — Step 2 (Fonds animés) — ADR-110 / WIZARD-04.
 *
 * Drag-reorder layer stack (CdkDragDrop + moveItemInArray) → POST single
 * transactional `/:id/layers/reorder` with the new ordered list.
 *
 * Layer creation goes through `AssetManagerModalComponent` (Plan 02 dual-
 * context) opened with `[context]="'modal'"` and `(assetSelected)`/`(dismiss)`
 * wired. On asset pick, POST /:id/layers (positional dataservice signature)
 * with `{ name, videoUrl, zIndex, durationMs }` — those are the ONLY columns
 * the runtime expects (no `alpha`, no `parent_layer_id`, no `safe_zone`,
 * no `fit_mode` on template_layers — ADR-086 alpha lives on the WebM file
 * itself, surfaced via Plan 02 `WebmAssetMetadata.hasAlpha`).
 *
 * Pitfall P1 gate: `next` button disabled while `layers().length < 1` so a
 * super_admin can never reach Step 3 (Zones) with 0 layer (UI mirror of the
 * Joi `template_text_fields.layer_id` NOT NULL constraint).
 *
 * Vocabulary: « Fond animé » (Plan 01 frozen), « Continuer → » / « ← Retour »
 * (Plan 03 i18n hook contournement).
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
  WritableSignal,
  signal,
} from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';

import { RemotionTemplatesDataService } from '../../remotion-templates-data.service';
import type { TemplateLayer } from '../../remotion-templates.types';
import { AssetManagerModalComponent } from '../asset-manager/asset-manager-modal.component';

@Component({
  selector: 'app-wizard-step-backgrounds',
  standalone: true,
  imports: [CommonModule, DragDropModule, AssetManagerModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wsb">
      <header class="wsb__header">
        <h2>Étape 2 — Fonds animés</h2>
        <p class="wsb__hint">
          Empilez vos calques vidéo. L'ordre va de l'arrière (1) vers l'avant
          ({{ layers().length || 'N' }}). Glissez pour réordonner.
        </p>
      </header>

      <div class="wsb__list" cdkDropList (cdkDropListDropped)="onDrop($event)">
        <div
          *ngFor="let l of layers(); let i = index; trackBy: trackById"
          class="wsb__card"
          cdkDrag
        >
          <div class="wsb__card-handle" cdkDragHandle aria-label="Glisser">⋮⋮</div>
          <div class="wsb__card-thumb">
            <video
              *ngIf="l.videoUrl"
              [src]="l.videoUrl"
              muted
              playsinline
              preload="metadata"
            ></video>
            <span *ngIf="!l.videoUrl" class="wsb__card-empty">—</span>
          </div>
          <div class="wsb__card-meta">
            <h4>{{ l.name || 'Fond ' + (i + 1) }}</h4>
            <p>
              Position {{ i + 1 }} ·
              {{ formatDuration(l.durationMs) }}
            </p>
          </div>
          <button
            type="button"
            class="wsb__card-del"
            (click)="onDelete(l, $event)"
            [disabled]="deleting() === l.id"
            aria-label="Retirer ce fond"
          >
            ×
          </button>
        </div>

        <button
          type="button"
          class="wsb__add"
          (click)="openAssetManager()"
          [disabled]="creating()"
        >
          + Ajouter un fond animé
        </button>
      </div>

      <p *ngIf="errorMsg()" class="wsb__error" role="alert">{{ errorMsg() }}</p>

      <footer class="wsb__nav">
        <button type="button" class="btn" (click)="prev.emit()">← Retour</button>
        <button
          type="button"
          class="btn btn-primary"
          [disabled]="layers().length < 1 || creating()"
          (click)="next.emit()"
        >
          Continuer →
        </button>
      </footer>

      <app-asset-manager-modal
        *ngIf="assetManagerOpen()"
        [context]="'modal'"
        [respectAlphaRequired]="false"
        (assetSelected)="onAssetPicked($event)"
        (dismiss)="assetManagerOpen.set(false)"
      ></app-asset-manager-modal>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .wsb {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .wsb__header h2 {
        margin: 0 0 0.25rem;
        font-size: 1.4rem;
      }
      .wsb__hint {
        margin: 0;
        color: #6b7280;
        font-size: 0.92rem;
      }
      .wsb__list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .wsb__card {
        display: grid;
        grid-template-columns: 32px 96px 1fr 32px;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      }
      .wsb__card-handle {
        cursor: grab;
        text-align: center;
        font-size: 1.1rem;
        color: #9ca3af;
        user-select: none;
      }
      .wsb__card-thumb {
        width: 96px;
        height: 54px;
        background: #111;
        border-radius: 4px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .wsb__card-thumb video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .wsb__card-empty {
        color: #6b7280;
        font-size: 0.85rem;
      }
      .wsb__card-meta h4 {
        margin: 0 0 0.15rem;
        font-size: 0.95rem;
      }
      .wsb__card-meta p {
        margin: 0;
        color: #6b7280;
        font-size: 0.8rem;
      }
      .wsb__card-del {
        background: transparent;
        border: 0;
        color: #b91c1c;
        font-size: 1.4rem;
        cursor: pointer;
        line-height: 1;
      }
      .wsb__card-del:disabled {
        opacity: 0.5;
        cursor: wait;
      }
      .wsb__add {
        padding: 1rem;
        border: 2px dashed #cbd5e1;
        background: #f8fafc;
        color: #334155;
        border-radius: 8px;
        font-size: 0.95rem;
        cursor: pointer;
      }
      .wsb__add:hover {
        background: #f1f5f9;
      }
      .wsb__add:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      .wsb__error {
        margin: 0;
        padding: 0.75rem 1rem;
        background: #fee2e2;
        color: #b91c1c;
        border-left: 3px solid #b91c1c;
        border-radius: 4px;
        font-size: 0.9rem;
      }
      .wsb__nav {
        display: flex;
        justify-content: space-between;
        margin-top: 1rem;
      }
      .btn {
        padding: 0.6rem 1.2rem;
        border-radius: 6px;
        border: 1px solid #cbd5e1;
        background: #fff;
        cursor: pointer;
        font-size: 0.95rem;
      }
      .btn-primary {
        background: #2563eb;
        color: #fff;
        border-color: #2563eb;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .cdk-drag-preview {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        border-radius: 8px;
      }
      .cdk-drag-placeholder {
        opacity: 0.3;
      }
    `,
  ],
})
export class WizardStepBackgroundsComponent {
  /** Templated bound by the parent shell — required to address /:id endpoints. */
  @Input({ required: true }) templateId!: string;
  /**
   * Layer signal owned by the parent shell (form state lifted — Plan 03
   * pattern Pitfall P2). Step component never holds a fresh local signal.
   */
  @Input({ required: true }) layers!: WritableSignal<TemplateLayer[]>;

  /** Emitted after every backend mutation so the parent can update its state. */
  @Output() layersChange = new EventEmitter<TemplateLayer[]>();
  /** Plan 03 contract — NEVER `submit` (forbidden by no-output-native). */
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  private dataService = inject(RemotionTemplatesDataService);

  assetManagerOpen = signal(false);
  creating = signal(false);
  deleting = signal<string | null>(null);
  errorMsg = signal<string | null>(null);

  trackById(_: number, l: TemplateLayer): string {
    return l.id;
  }

  formatDuration(ms: number): string {
    return ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '—';
  }

  openAssetManager(): void {
    this.errorMsg.set(null);
    this.assetManagerOpen.set(true);
  }

  /**
   * WIZARD-04 — Drag-reorder.
   * Optimistic UI: reorder local list first, then POST. On error revert
   * (server is the source of truth — we replace with whatever it returns).
   */
  onDrop(ev: CdkDragDrop<TemplateLayer[]>): void {
    const before = this.layers();
    if (ev.previousIndex === ev.currentIndex) return;
    const next = [...before];
    moveItemInArray(next, ev.previousIndex, ev.currentIndex);
    this.layers.set(next);
    const orderedIds = next.map((l) => l.id);
    this.dataService.reorderLayers(this.templateId, orderedIds).subscribe({
      next: (server) => {
        this.layers.set(server);
        this.layersChange.emit(server);
      },
      error: () => {
        // Revert on failure.
        this.layers.set(before);
        this.errorMsg.set(
          "Le réordonnancement n'a pas pu être enregistré. Réessayez.",
        );
      },
    });
  }

  /**
   * WIZARD-04 — Asset picked from the modal. Creates a new layer with a
   * deterministic z_index = current count + 1 (always added on top).
   */
  onAssetPicked(ev: { url: string }): void {
    this.errorMsg.set(null);
    this.creating.set(true);
    const nextZ = this.layers().length + 1;
    this.dataService
      .createLayer(this.templateId, {
        name: `Fond ${nextZ}`,
        videoUrl: ev.url,
        zIndex: nextZ,
        // mask defaults to {0,0,0,0} server-side (mapLayer / createLayer).
        mask: { top: 0, bottom: 0, left: 0, right: 0 },
        durationMs: 5900,
      })
      .subscribe({
        next: (layer) => {
          const merged = [...this.layers(), layer];
          this.layers.set(merged);
          this.layersChange.emit(merged);
          this.creating.set(false);
          this.assetManagerOpen.set(false);
        },
        error: (err) => {
          this.creating.set(false);
          this.errorMsg.set(
            err?.error?.message ?? "L'ajout du fond animé a échoué.",
          );
        },
      });
  }

  /**
   * Delete with 409-aware error surfacing — Plan 01 contract:
   * `err.error.detail.usedByPublishedCount` carries the conflict count.
   */
  onDelete(l: TemplateLayer, ev: Event): void {
    ev.stopPropagation();
    if (!confirm(`Retirer le fond animé « ${l.name || 'sans nom'} » ?`)) return;
    this.errorMsg.set(null);
    this.deleting.set(l.id);
    this.dataService.deleteLayer(this.templateId, l.id).subscribe({
      next: () => {
        const merged = this.layers().filter((x) => x.id !== l.id);
        this.layers.set(merged);
        this.layersChange.emit(merged);
        this.deleting.set(null);
      },
      error: (err) => {
        this.deleting.set(null);
        const count = err?.error?.detail?.usedByPublishedCount ?? 0;
        if (err?.status === 409 || count > 0) {
          this.errorMsg.set(
            `Ce fond est utilisé par ${count} template(s) publié(s) — supprimez d'abord les clones.`,
          );
        } else {
          this.errorMsg.set(
            err?.error?.message ?? 'La suppression a échoué.',
          );
        }
      },
    });
  }
}
