/**
 * ADR-075 V3 Phase 1 — Visual drag-to-position (super_admin only).
 *
 * Overlay de positionnement interactif : affiche le canvas du template à
 * l'échelle (aspect-ratio `canvasWidth`/`canvasHeight`), avec une miniature
 * de la variante sélectionnée en fond et des poignées absolument positionnées
 * pour chaque text field / image slot. Drag = met à jour `position.x/y` (0-1).
 * Resize corner sur image = met à jour `position.width/height` (0-1).
 *
 * Les PATCH serveur sont debouncés (300ms) via `patchTextField` /
 * `patchImageSlot` pour ne pas spammer l'API pendant le drag.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  TemplateStudioView,
  TemplateVariant,
} from '../../remotion-templates.types';
import type {
  TemplateImageSlotUpdate,
  TemplateTextFieldUpdate,
} from '../../remotion-templates-data.service';

type DragMode = 'move' | 'resize';

interface DragState {
  kind: 'text' | 'image';
  id: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
}

@Component({
  selector: 'app-admin-canvas-overlay',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="aco" data-testid="admin-canvas-overlay" *ngIf="view">
      <header class="aco__head">
        <h4>Positionnement visuel</h4>
        <div class="aco__variant-picker" *ngIf="view.variants.length > 1">
          <button
            type="button"
            *ngFor="let v of view.variants"
            class="aco__variant-btn"
            [class.aco__variant-btn--active]="v.id === selectedVariantId"
            (click)="selectVariant(v)"
          >
            {{ v.name }}
          </button>
        </div>
      </header>

      <div
        #canvas
        class="aco__canvas"
        data-testid="admin-canvas"
        [style.aspectRatio]="view.canvasWidth + ' / ' + view.canvasHeight"
      >
        <img
          *ngIf="activeVariant?.thumbnailUrl as thumb"
          class="aco__bg"
          [src]="thumb"
          alt=""
        />
        <div *ngIf="!activeVariant?.thumbnailUrl" class="aco__bg aco__bg--placeholder">
          <span>Pas de miniature — upload une thumbnail sur la variante.</span>
        </div>

        <div
          *ngFor="let tf of view.textFields"
          class="aco__handle aco__handle--text"
          [attr.data-testid]="'drag-text-' + tf.slotKey"
          [style.left.%]="tf.position.x * 100"
          [style.top.%]="tf.position.y * 100"
          [style.width.%]="tf.maxWidth * 100"
          [style.textAlign]="tf.align"
          [style.color]="tf.color"
          [style.fontFamily]="tf.fontFamily"
          [style.fontSize.px]="scaledFontSize(tf.fontSize)"
          (pointerdown)="startDrag($event, 'text', tf.id, 'move')"
        >
          <span class="aco__tag">{{ tf.label }}</span>
          <span class="aco__preview">{{ tf.defaultValue || tf.label }}</span>
        </div>

        <div
          *ngFor="let slot of view.imageSlots"
          class="aco__handle aco__handle--image"
          [attr.data-testid]="'drag-image-' + slot.slotKey"
          [style.left.%]="slot.position.x * 100"
          [style.top.%]="slot.position.y * 100"
          [style.width.%]="slot.position.width * 100"
          [style.height.%]="slot.position.height * 100"
          (pointerdown)="startDrag($event, 'image', slot.id, 'move')"
        >
          <span class="aco__tag">{{ slot.label }}</span>
          <span
            class="aco__resize"
            [attr.data-testid]="'resize-image-' + slot.slotKey"
            (pointerdown)="startDrag($event, 'image', slot.id, 'resize')"
          ></span>
        </div>
      </div>

      <p class="aco__hint">
        Glisse les blocs pour repositionner, ou la poignée ⤡ pour redimensionner les images.
        Positions stockées en fraction (0–1) — le canvas se met à jour à l'échelle.
      </p>
    </div>
  `,
  styles: [`
    .aco { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; }
    .aco__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .aco__head h4 { margin: 0; font-size: 14px; }
    .aco__variant-picker { display: flex; gap: 4px; flex-wrap: wrap; }
    .aco__variant-btn { padding: 2px 8px; font-size: 11px; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; cursor: pointer; }
    .aco__variant-btn--active { background: #ede9fe; border-color: #6d28d9; color: #5b21b6; font-weight: 600; }
    .aco__canvas { position: relative; width: 100%; max-height: 480px; background: #111; border-radius: 6px; overflow: hidden; user-select: none; touch-action: none; }
    .aco__bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
    .aco__bg--placeholder { display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 12px; padding: 1rem; text-align: center; }
    .aco__handle { position: absolute; transform: translate(-50%, -50%); border: 2px dashed rgba(109, 40, 217, 0.9); border-radius: 4px; cursor: grab; min-width: 16px; min-height: 16px; box-sizing: border-box; }
    .aco__handle:active { cursor: grabbing; }
    .aco__handle--text { padding: 2px 4px; background: rgba(109, 40, 217, 0.15); line-height: 1.1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .aco__handle--image { background: rgba(59, 130, 246, 0.15); border-color: rgba(37, 99, 235, 0.9); }
    .aco__tag { position: absolute; top: -18px; left: 0; padding: 1px 5px; font-size: 10px; background: #6d28d9; color: #fff; border-radius: 3px; pointer-events: none; white-space: nowrap; }
    .aco__handle--image .aco__tag { background: #2563eb; }
    .aco__preview { display: inline-block; pointer-events: none; }
    .aco__resize { position: absolute; right: -6px; bottom: -6px; width: 14px; height: 14px; background: #2563eb; border: 2px solid #fff; border-radius: 50%; cursor: nwse-resize; }
    .aco__hint { margin: 0; font-size: 11px; color: #6b7280; }
  `],
})
export class AdminCanvasOverlayComponent {
  @Input({ required: true }) view!: TemplateStudioView;
  @Output() patchTextField = new EventEmitter<{ id: string; patch: TemplateTextFieldUpdate }>();
  @Output() patchImageSlot = new EventEmitter<{ id: string; patch: TemplateImageSlotUpdate }>();

  @ViewChild('canvas', { static: false }) canvasRef?: ElementRef<HTMLDivElement>;

  selectedVariantId: string | null = null;
  private drag: DragState | null = null;
  private emitTimers = new Map<string, ReturnType<typeof setTimeout>>();

  get activeVariant(): TemplateVariant | null {
    if (!this.view?.variants.length) return null;
    return (
      this.view.variants.find((v) => v.id === this.selectedVariantId) ??
      this.view.variants[0] ??
      null
    );
  }

  selectVariant(v: TemplateVariant): void {
    this.selectedVariantId = v.id;
  }

  /** Scale 1920px-reference fontSize down for the smaller overlay canvas. */
  scaledFontSize(fontSize: number): number {
    const canvas = this.canvasRef?.nativeElement;
    const canvasW = canvas?.getBoundingClientRect().width ?? 640;
    const refW = this.view?.canvasWidth ?? 1920;
    if (!refW) return fontSize;
    return Math.max(8, fontSize * (canvasW / refW));
  }

  startDrag(evt: PointerEvent, kind: 'text' | 'image', id: string, mode: DragMode): void {
    evt.preventDefault();
    evt.stopPropagation();
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const current = this.findCurrent(kind, id);
    if (!current) return;

    this.drag = {
      kind,
      id,
      mode,
      startClientX: evt.clientX,
      startClientY: evt.clientY,
      startX: current.x,
      startY: current.y,
      startW: current.w,
      startH: current.h,
    };
    (evt.target as HTMLElement).setPointerCapture?.(evt.pointerId);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  private findCurrent(
    kind: 'text' | 'image',
    id: string,
  ): { x: number; y: number; w: number; h: number } | null {
    if (kind === 'text') {
      const tf = this.view.textFields.find((f) => f.id === id);
      return tf ? { x: tf.position.x, y: tf.position.y, w: tf.maxWidth, h: 0 } : null;
    }
    const s = this.view.imageSlots.find((i) => i.id === id);
    return s ? { x: s.position.x, y: s.position.y, w: s.position.width, h: s.position.height } : null;
  }

  private readonly onPointerMove = (evt: PointerEvent): void => {
    if (!this.drag) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dx = (evt.clientX - this.drag.startClientX) / rect.width;
    const dy = (evt.clientY - this.drag.startClientY) / rect.height;

    if (this.drag.mode === 'move') {
      const x = clamp(this.drag.startX + dx, 0, 1);
      const y = clamp(this.drag.startY + dy, 0, 1);
      this.applyMove(this.drag.kind, this.drag.id, x, y);
    } else if (this.drag.mode === 'resize' && this.drag.kind === 'image') {
      const w = clamp(this.drag.startW + dx * 2, 0.05, 1);
      const h = clamp(this.drag.startH + dy * 2, 0.05, 1);
      this.applyResize(this.drag.id, w, h);
    }
  };

  private readonly onPointerUp = (): void => {
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.removeEventListener('pointermove', this.onPointerMove);
      canvas.removeEventListener('pointerup', this.onPointerUp);
      canvas.removeEventListener('pointercancel', this.onPointerUp);
    }
    this.drag = null;
  };

  private applyMove(kind: 'text' | 'image', id: string, x: number, y: number): void {
    if (kind === 'text') {
      const tf = this.view.textFields.find((f) => f.id === id);
      if (!tf) return;
      tf.position = { x, y };
      this.scheduleEmit(`t-${id}`, () =>
        this.patchTextField.emit({ id, patch: { positionX: x, positionY: y } }),
      );
    } else {
      const s = this.view.imageSlots.find((i) => i.id === id);
      if (!s) return;
      s.position = { ...s.position, x, y };
      this.scheduleEmit(`i-${id}`, () =>
        this.patchImageSlot.emit({ id, patch: { positionX: x, positionY: y } }),
      );
    }
  }

  private applyResize(id: string, width: number, height: number): void {
    const s = this.view.imageSlots.find((i) => i.id === id);
    if (!s) return;
    s.position = { ...s.position, width, height };
    this.scheduleEmit(`i-${id}`, () =>
      this.patchImageSlot.emit({ id, patch: { width, height } }),
    );
  }

  private scheduleEmit(key: string, fn: () => void): void {
    const existing = this.emitTimers.get(key);
    if (existing) clearTimeout(existing);
    this.emitTimers.set(
      key,
      setTimeout(() => {
        this.emitTimers.delete(key);
        fn();
      }, 300),
    );
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
