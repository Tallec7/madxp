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
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  TemplateImageSlot,
  TemplateStudioView,
  TemplateVariant,
} from '../../remotion-templates.types';
import type {
  TemplateImageSlotUpdate,
  TemplateTextFieldUpdate,
} from '../../remotion-templates-data.service';

type DragMode = 'move' | 'resize';
type DragKind = 'text' | 'image' | 'safe-zone';

interface DragState {
  kind: DragKind;
  id: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  startFontSize?: number;
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

      <div class="aco__layer-picker" data-testid="layer-picker">
        <span class="aco__layer-label">Layer&nbsp;:</span>
        <button
          type="button"
          class="aco__layer-btn"
          [class.aco__layer-btn--active]="selectedLayerId === null"
          (click)="selectLayer(null)"
          data-testid="layer-btn-all"
        >
          Tous ({{ view.textFields.length + view.imageSlots.length }})
        </button>
        <button
          type="button"
          *ngFor="let l of view.layers"
          class="aco__layer-btn"
          [class.aco__layer-btn--active]="selectedLayerId === l.id"
          (click)="selectLayer(l.id)"
          [attr.data-testid]="'layer-btn-' + l.id"
        >
          {{ l.name }} ({{ countInLayer(l.id) }})
        </button>
        <button
          type="button"
          *ngIf="countInLayer(null) > 0"
          class="aco__layer-btn aco__layer-btn--orphan"
          [class.aco__layer-btn--active]="selectedLayerId === '__orphan__'"
          (click)="selectLayer('__orphan__')"
          data-testid="layer-btn-orphan"
          title="Slots sans layer (legacy)"
        >
          Sans layer ({{ countInLayer(null) }})
        </button>
      </div>

      <div
        #canvas
        class="aco__canvas"
        data-testid="admin-canvas"
        [style.aspectRatio]="view.canvasWidth + ' / ' + view.canvasHeight"
        (click)="onCanvasBackgroundClick($event)"
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
          [class.aco__handle--dimmed]="isDimmed(tf.layerId)"
          [class.aco__handle--selected]="isSelected('text', tf.id)"
          [attr.data-testid]="'drag-text-' + tf.slotKey"
          [style.left.%]="tf.position.x * 100"
          [style.top.%]="tf.position.y * 100"
          [style.width.%]="tf.maxWidth * 100"
          [style.textAlign]="tf.align"
          [style.color]="tf.color"
          [style.fontFamily]="tf.fontFamily"
          [style.fontSize.px]="scaledFontSize(tf.fontSize)"
          (pointerdown)="startDrag($event, 'text', tf.id, 'move', tf.layerId)"
        >
          <span class="aco__tag">{{ tf.label }}</span>
          <span class="aco__preview">{{ tf.defaultValue || tf.label }}</span>
          <span
            class="aco__resize aco__resize--text"
            [attr.data-testid]="'resize-text-' + tf.slotKey"
            (pointerdown)="startDrag($event, 'text', tf.id, 'resize', tf.layerId)"
            title="Glisser : horizontal = largeur (maxWidth), vertical = taille police"
          ></span>
        </div>

        <div
          *ngFor="let slot of view.imageSlots"
          class="aco__handle aco__handle--image"
          [class.aco__handle--dimmed]="isDimmed(slot.layerId)"
          [class.aco__handle--selected]="isSelected('image', slot.id)"
          [attr.data-testid]="'drag-image-' + slot.slotKey"
          [style.left.%]="slot.position.x * 100"
          [style.top.%]="slot.position.y * 100"
          [style.width.%]="slot.position.width * 100"
          [style.height.%]="slot.position.height * 100"
          (pointerdown)="startDrag($event, 'image', slot.id, 'move', slot.layerId)"
        >
          <span class="aco__tag">{{ slot.label }}</span>
          <span
            class="aco__resize"
            [attr.data-testid]="'resize-image-' + slot.slotKey"
            (pointerdown)="startDrag($event, 'image', slot.id, 'resize', slot.layerId)"
          ></span>
        </div>

        <!-- ADR-086 — Safe-zone red rectangle (admin edits, user subit) -->
        <div
          *ngFor="let slot of view.imageSlots"
        >
          <div
            *ngIf="hasSafeZone(slot)"
            class="aco__safe-zone"
            [class.aco__handle--dimmed]="isDimmed(slot.layerId)"
            [attr.data-testid]="'safe-zone-' + slot.slotKey"
            [style.left.%]="slot.safeLeftPct"
            [style.top.%]="slot.safeTopPct"
            [style.width.%]="slot.safeWidthPct"
            [style.height.%]="slot.safeHeightPct"
            (pointerdown)="startSafeZoneDrag($event, slot.id, 'move')"
          >
            <span class="aco__tag aco__tag--safe">🛡 {{ slot.slotKey }} safe</span>
            <span
              class="aco__resize aco__resize--safe"
              [attr.data-testid]="'resize-safe-' + slot.slotKey"
              (pointerdown)="startSafeZoneDrag($event, slot.id, 'resize')"
            ></span>
          </div>
        </div>

        <div
          *ngIf="snapGuides.x !== null"
          class="aco__guide aco__guide--v"
          data-testid="snap-guide-x"
          [style.left.%]="snapGuides.x! * 100"
        ></div>
        <div
          *ngIf="snapGuides.y !== null"
          class="aco__guide aco__guide--h"
          data-testid="snap-guide-y"
          [style.top.%]="snapGuides.y! * 100"
        ></div>
      </div>

      <p class="aco__hint">
        Glisse les blocs pour repositionner, ou la poignée ⤡ pour redimensionner.
        Un guide doré apparaît quand le centre snap au canvas ou à la safe-zone (±1.5%).
      </p>
    </div>
  `,
  styles: [`
    .aco { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; }
    .aco__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .aco__head h4 { margin: 0; font-size: 14px; }
    .aco__variant-picker { display: flex; gap: 4px; flex-wrap: wrap; }
    .aco__variant-btn { padding: 2px 8px; font-size: 11px; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; cursor: pointer; }
    .aco__variant-btn--active { background: var(--studio-accent-100); border-color: var(--studio-accent-600); color: var(--studio-accent-700); font-weight: 600; }
    .aco__layer-picker { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding: 6px 8px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }
    .aco__layer-label { font-size: 11px; color: #6b7280; font-weight: 600; margin-right: 4px; }
    .aco__layer-btn { padding: 3px 10px; font-size: 11px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer; color: #374151; }
    .aco__layer-btn:hover { background: #f3f4f6; }
    .aco__layer-btn--active { background: #0f766e; border-color: #0f766e; color: #fff; font-weight: 600; }
    .aco__layer-btn--orphan { border-style: dashed; color: #b45309; }
    .aco__layer-btn--orphan.aco__layer-btn--active { background: #b45309; border-color: #b45309; color: #fff; }
    .aco__handle--dimmed { opacity: 0.22; pointer-events: none !important; }
    .aco__handle--dimmed .aco__tag { opacity: 0.6; }
    .aco__handle--selected { outline: 3px solid #f59e0b; outline-offset: 2px; z-index: 10; box-shadow: 0 0 0 1px #fff, 0 4px 12px rgba(245, 158, 11, 0.4); }
    .aco__handle--selected .aco__tag { background: #f59e0b !important; color: #111; font-weight: 700; }
    .aco__canvas { position: relative; width: 100%; max-height: 480px; background: #111; border-radius: 6px; overflow: hidden; user-select: none; touch-action: none; }
    .aco__bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
    .aco__bg--placeholder { display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 12px; padding: 1rem; text-align: center; }
    .aco__handle { position: absolute; transform: translate(-50%, -50%); border: 2px dashed rgba(109, 40, 217, 0.9); border-radius: 4px; cursor: grab; min-width: 16px; min-height: 16px; box-sizing: border-box; }
    .aco__handle:active { cursor: grabbing; }
    .aco__handle--text { padding: 2px 4px; background: rgba(109, 40, 217, 0.15); line-height: 1.1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .aco__handle--image { background: rgba(59, 130, 246, 0.15); border-color: rgba(37, 99, 235, 0.9); }
    .aco__tag { position: absolute; top: -18px; left: 0; padding: 1px 5px; font-size: 10px; background: var(--studio-accent-600); color: #fff; border-radius: 3px; pointer-events: none; white-space: nowrap; }
    .aco__handle--image .aco__tag { background: #2563eb; }
    .aco__preview { display: inline-block; pointer-events: none; }
    .aco__resize { position: absolute; right: -6px; bottom: -6px; width: 14px; height: 14px; background: #2563eb; border: 2px solid #fff; border-radius: 50%; cursor: nwse-resize; }
    .aco__resize--text { background: var(--studio-accent-600); }
    .aco__safe-zone { position: absolute; transform: translate(-50%, -50%); border: 2px solid rgba(220, 38, 38, 0.9); background: rgba(220, 38, 38, 0.08); cursor: grab; box-sizing: border-box; pointer-events: auto; }
    .aco__safe-zone:active { cursor: grabbing; }
    .aco__tag--safe { background: #dc2626 !important; }
    .aco__resize--safe { background: #dc2626; }
    .aco__guide { position: absolute; background: #f59e0b; pointer-events: none; z-index: 20; box-shadow: 0 0 6px rgba(245, 158, 11, 0.8); }
    .aco__guide--v { top: 0; bottom: 0; width: 1px; transform: translateX(-0.5px); }
    .aco__guide--h { left: 0; right: 0; height: 1px; transform: translateY(-0.5px); }
    .aco__hint { margin: 0; font-size: 11px; color: #6b7280; }
  `],
})
export class AdminCanvasOverlayComponent {
  @Input({ required: true }) view!: TemplateStudioView;
  @Output() patchTextField = new EventEmitter<{ id: string; patch: TemplateTextFieldUpdate }>();
  @Output() patchImageSlot = new EventEmitter<{ id: string; patch: TemplateImageSlotUpdate }>();
  /** ADR-075 Sprint 3 #7 — émis en fin de drag pour alimenter l'historique undo/redo. */
  @Output() historyRecord = new EventEmitter<
    | { entity: 'text'; id: string; before: TemplateTextFieldUpdate; after: TemplateTextFieldUpdate }
    | { entity: 'image'; id: string; before: TemplateImageSlotUpdate; after: TemplateImageSlotUpdate }
  >();

  @ViewChild('canvas', { static: false }) canvasRef?: ElementRef<HTMLDivElement>;

  selectedVariantId: string | null = null;
  /** null = "Tous" ; '__orphan__' = slots sans layer (legacy) ; sinon layerId. */
  selectedLayerId: string | '__orphan__' | null = null;
  /** Slot sélectionné (focus visuel + cible pour snap/undo futurs). */
  selectedSlot: { kind: 'text' | 'image'; id: string } | null = null;
  /** Guides de snap visibles pendant le drag (fractions 0–1). */
  snapGuides: { x: number | null; y: number | null } = { x: null, y: null };
  private readonly SNAP_THRESHOLD = 0.015;
  private drag: DragState | null = null;
  private emitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private cdr = inject(ChangeDetectorRef);

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

  selectLayer(layerId: string | '__orphan__' | null): void {
    this.selectedLayerId = layerId;
    this.selectedSlot = null;
  }

  selectSlot(kind: 'text' | 'image', id: string): void {
    this.selectedSlot = { kind, id };
  }

  isSelected(kind: 'text' | 'image', id: string): boolean {
    return this.selectedSlot?.kind === kind && this.selectedSlot?.id === id;
  }

  onCanvasBackgroundClick(evt: MouseEvent): void {
    if (evt.target === this.canvasRef?.nativeElement) {
      this.selectedSlot = null;
    }
  }

  /** True si le slot doit être grisé (hors du layer sélectionné). */
  isDimmed(slotLayerId: string | null): boolean {
    if (this.selectedLayerId === null) return false;
    if (this.selectedLayerId === '__orphan__') return slotLayerId !== null;
    return slotLayerId !== this.selectedLayerId;
  }

  /** Compte les text fields + image slots appartenant à `layerId` (null = orphelins). */
  countInLayer(layerId: string | null): number {
    const tf = this.view.textFields.filter((f) => f.layerId === layerId).length;
    const is = this.view.imageSlots.filter((s) => s.layerId === layerId).length;
    return tf + is;
  }

  /** Scale 1920px-reference fontSize down for the smaller overlay canvas. */
  scaledFontSize(fontSize: number): number {
    const canvas = this.canvasRef?.nativeElement;
    const canvasW = canvas?.getBoundingClientRect().width ?? 640;
    const refW = this.view?.canvasWidth ?? 1920;
    if (!refW) return fontSize;
    return Math.max(8, fontSize * (canvasW / refW));
  }

  hasSafeZone(slot: TemplateImageSlot): boolean {
    return (
      slot.safeTopPct !== null &&
      slot.safeLeftPct !== null &&
      slot.safeWidthPct !== null &&
      slot.safeHeightPct !== null
    );
  }

  startSafeZoneDrag(evt: PointerEvent, id: string, mode: DragMode): void {
    evt.preventDefault();
    evt.stopPropagation();
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const slot = this.view.imageSlots.find((s) => s.id === id);
    if (!slot || !this.hasSafeZone(slot)) return;

    this.drag = {
      kind: 'safe-zone',
      id,
      mode,
      startClientX: evt.clientX,
      startClientY: evt.clientY,
      startX: slot.safeLeftPct ?? 0,
      startY: slot.safeTopPct ?? 0,
      startW: slot.safeWidthPct ?? 0,
      startH: slot.safeHeightPct ?? 0,
    };
    (evt.target as HTMLElement).setPointerCapture?.(evt.pointerId);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  startDrag(
    evt: PointerEvent,
    kind: 'text' | 'image',
    id: string,
    mode: DragMode,
    slotLayerId?: string | null,
  ): void {
    if (slotLayerId !== undefined && this.isDimmed(slotLayerId)) return;
    evt.preventDefault();
    evt.stopPropagation();
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    this.selectSlot(kind, id);

    const current = this.findCurrent(kind, id);
    if (!current) return;

    const startFontSize =
      kind === 'text' ? this.view.textFields.find((f) => f.id === id)?.fontSize : undefined;

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
      startFontSize,
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

    if (this.drag.kind === 'safe-zone') {
      if (this.drag.mode === 'move') {
        const leftPct = clamp(this.drag.startX + dx * 100, 0, 100);
        const topPct = clamp(this.drag.startY + dy * 100, 0, 100);
        this.applySafeZoneMove(this.drag.id, leftPct, topPct);
      } else {
        const widthPct = clamp(this.drag.startW + dx * 200, 1, 100);
        const heightPct = clamp(this.drag.startH + dy * 200, 1, 100);
        this.applySafeZoneResize(this.drag.id, widthPct, heightPct);
      }
      return;
    }

    if (this.drag.mode === 'move') {
      const rawX = clamp(this.drag.startX + dx, 0, 1);
      const rawY = clamp(this.drag.startY + dy, 0, 1);
      const snapped = this.applySnap(this.drag.kind, this.drag.id, rawX, rawY);
      this.applyMove(this.drag.kind, this.drag.id, snapped.x, snapped.y);
    } else if (this.drag.mode === 'resize' && this.drag.kind === 'image') {
      const w = clamp(this.drag.startW + dx * 2, 0.05, 1);
      const h = clamp(this.drag.startH + dy * 2, 0.05, 1);
      this.applyResize(this.drag.id, w, h);
    } else if (this.drag.mode === 'resize' && this.drag.kind === 'text') {
      const maxWidth = clamp(this.drag.startW + dx * 2, 0.05, 1);
      const refH = this.view?.canvasHeight ?? 1080;
      const baseFont = this.drag.startFontSize ?? 48;
      const fontSize = clamp(baseFont + dy * refH, 8, 400);
      this.applyTextResize(this.drag.id, maxWidth, fontSize);
    }
  };

  private applySafeZoneMove(id: string, leftPct: number, topPct: number): void {
    const slot = this.view.imageSlots.find((s) => s.id === id);
    if (!slot) return;
    slot.safeLeftPct = leftPct;
    slot.safeTopPct = topPct;
    this.scheduleEmit(`sz-${id}`, () =>
      this.patchImageSlot.emit({
        id,
        patch: { safeLeftPct: leftPct, safeTopPct: topPct },
      }),
    );
    this.cdr.markForCheck();
  }

  private applySafeZoneResize(id: string, widthPct: number, heightPct: number): void {
    const slot = this.view.imageSlots.find((s) => s.id === id);
    if (!slot) return;
    slot.safeWidthPct = widthPct;
    slot.safeHeightPct = heightPct;
    this.scheduleEmit(`sz-${id}`, () =>
      this.patchImageSlot.emit({
        id,
        patch: { safeWidthPct: widthPct, safeHeightPct: heightPct },
      }),
    );
    this.cdr.markForCheck();
  }

  private readonly onPointerUp = (): void => {
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.removeEventListener('pointermove', this.onPointerMove);
      canvas.removeEventListener('pointerup', this.onPointerUp);
      canvas.removeEventListener('pointercancel', this.onPointerUp);
    }
    this.emitHistoryForDrag();
    this.drag = null;
    if (this.snapGuides.x !== null || this.snapGuides.y !== null) {
      this.snapGuides = { x: null, y: null };
      this.cdr.markForCheck();
    }
  };

  /** Compare l'état initial du drag à l'état final et émet une entrée d'historique si ça a bougé. */
  private emitHistoryForDrag(): void {
    const d = this.drag;
    if (!d || d.kind === 'safe-zone') return;
    if (d.kind === 'text') {
      const tf = this.view.textFields.find((f) => f.id === d.id);
      if (!tf) return;
      if (d.mode === 'move') {
        if (tf.position.x === d.startX && tf.position.y === d.startY) return;
        this.historyRecord.emit({
          entity: 'text',
          id: d.id,
          before: { positionX: d.startX, positionY: d.startY },
          after: { positionX: tf.position.x, positionY: tf.position.y },
        });
      } else {
        const startFont = d.startFontSize ?? tf.fontSize;
        if (tf.maxWidth === d.startW && tf.fontSize === startFont) return;
        this.historyRecord.emit({
          entity: 'text',
          id: d.id,
          before: { maxWidth: d.startW, fontSize: startFont },
          after: { maxWidth: tf.maxWidth, fontSize: tf.fontSize },
        });
      }
      return;
    }
    const s = this.view.imageSlots.find((i) => i.id === d.id);
    if (!s) return;
    if (d.mode === 'move') {
      if (s.position.x === d.startX && s.position.y === d.startY) return;
      this.historyRecord.emit({
        entity: 'image',
        id: d.id,
        before: { positionX: d.startX, positionY: d.startY },
        after: { positionX: s.position.x, positionY: s.position.y },
      });
    } else {
      if (s.position.width === d.startW && s.position.height === d.startH) return;
      this.historyRecord.emit({
        entity: 'image',
        id: d.id,
        before: { width: d.startW, height: d.startH },
        after: { width: s.position.width, height: s.position.height },
      });
    }
  }

  /** Snap x/y au centre canvas (0.5) ou au centre safe-zone du slot (si image avec safe-zone). */
  private applySnap(
    kind: 'text' | 'image',
    id: string,
    x: number,
    y: number,
  ): { x: number; y: number } {
    const targetsX: number[] = [0.5];
    const targetsY: number[] = [0.5];

    if (kind === 'image') {
      const slot = this.view.imageSlots.find((s) => s.id === id);
      if (slot && this.hasSafeZone(slot)) {
        targetsX.push((slot.safeLeftPct! + slot.safeWidthPct! / 2) / 100);
        targetsY.push((slot.safeTopPct! + slot.safeHeightPct! / 2) / 100);
      }
    }

    let snappedX = x;
    let snappedY = y;
    let guideX: number | null = null;
    let guideY: number | null = null;

    for (const tx of targetsX) {
      if (Math.abs(x - tx) <= this.SNAP_THRESHOLD) {
        snappedX = tx;
        guideX = tx;
        break;
      }
    }
    for (const ty of targetsY) {
      if (Math.abs(y - ty) <= this.SNAP_THRESHOLD) {
        snappedY = ty;
        guideY = ty;
        break;
      }
    }

    if (guideX !== this.snapGuides.x || guideY !== this.snapGuides.y) {
      this.snapGuides = { x: guideX, y: guideY };
      this.cdr.markForCheck();
    }

    return { x: snappedX, y: snappedY };
  }

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
    this.cdr.markForCheck();
  }

  private applyTextResize(id: string, maxWidth: number, fontSize: number): void {
    const tf = this.view.textFields.find((f) => f.id === id);
    if (!tf) return;
    tf.maxWidth = maxWidth;
    tf.fontSize = Math.round(fontSize);
    this.scheduleEmit(`t-${id}`, () =>
      this.patchTextField.emit({
        id,
        patch: { maxWidth, fontSize: Math.round(fontSize) },
      }),
    );
    this.cdr.markForCheck();
  }

  private applyResize(id: string, width: number, height: number): void {
    const s = this.view.imageSlots.find((i) => i.id === id);
    if (!s) return;
    s.position = { ...s.position, width, height };
    this.scheduleEmit(`i-${id}`, () =>
      this.patchImageSlot.emit({ id, patch: { width, height } }),
    );
    this.cdr.markForCheck();
  }

  /** Called by parent after a field editor card emits a patch, so the overlay re-renders. */
  refresh(): void {
    this.cdr.markForCheck();
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
