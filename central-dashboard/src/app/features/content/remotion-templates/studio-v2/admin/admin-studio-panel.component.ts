import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../../../core/services/notification.service';
import {
  RemotionTemplatesDataService,
  type TemplateImageSlotCreate,
  type TemplateImageSlotUpdate,
  type TemplateLayerCreate,
  type TemplateTextFieldCreate,
  type TemplateTextFieldUpdate,
  type TemplateVariantCreate,
} from '../../remotion-templates-data.service';
import { ClubTemplatesDataService } from '../../club-templates-data.service';
import type {
  TemplateImageSlot,
  TemplateLayer,
  TemplateStudioView,
  TemplateTextField,
  TemplateVariant,
} from '../../remotion-templates.types';
import { AdminFieldEditorComponent, type EditableField } from './admin-field-editor.component';
import { AdminVariantsPanelComponent } from './admin-variants-panel.component';
import { AdminLayersPanelComponent } from './admin-layers-panel.component';
import { AdminCanvasOverlayComponent } from './admin-canvas-overlay.component';

/**
 * ADR-075 Sprint 3 — Orchestrateur du mode édition admin.
 * Branche les 3 panels (variants / layers / fields) sur la data service et
 * re-charge la vue studio après chaque mutation pour garder l'UI cohérente.
 */
@Component({
  selector: 'app-admin-studio-panel',
  standalone: true,
  imports: [
    CommonModule,
    AdminFieldEditorComponent,
    AdminVariantsPanelComponent,
    AdminLayersPanelComponent,
    AdminCanvasOverlayComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="asp" *ngIf="view" data-testid="admin-studio-panel">
      <app-admin-canvas-overlay
        #canvasOverlay
        [view]="view"
        (patchTextField)="onPatchTextField($event.id, $event.patch)"
        (patchImageSlot)="onPatchImageSlot($event.id, $event.patch)"
      ></app-admin-canvas-overlay>

      <section class="asp__format" data-testid="admin-format-picker">
        <h4>Format du visuel</h4>
        <div class="asp__format-options">
          <button
            type="button"
            *ngFor="let preset of formatPresets"
            class="asp__format-btn"
            [class.asp__format-btn--active]="isActiveFormat(preset)"
            [attr.data-testid]="'format-' + preset.id"
            (click)="onSelectFormat(preset)"
          >
            <span class="asp__format-label">{{ preset.label }}</span>
            <span class="asp__format-dim">{{ preset.width }}×{{ preset.height }}</span>
          </button>
        </div>
        <p class="asp__format-hint">
          Appliqué à toutes les variantes et au rendu. Les positions (en %) restent relatives au canvas.
        </p>
      </section>

      <app-admin-variants-panel
        *ngIf="!clubMode"
        [templateId]="view.id"
        [variants]="view.variants"
        (create)="onCreateVariant($event)"
        (update)="onUpdateVariant($event)"
        (delete)="onDeleteVariant($event)"
      ></app-admin-variants-panel>

      <app-admin-layers-panel
        *ngIf="!clubMode"
        [templateId]="view.id"
        [layers]="view.layers"
        (create)="onCreateLayer($event)"
        (update)="onUpdateLayer($event)"
        (delete)="onDeleteLayer($event)"
      ></app-admin-layers-panel>

      <section class="asp__fields">
        <header class="asp__fields-head">
          <h4>Champs texte ({{ view.textFields.length }})</h4>
          <button
            *ngIf="!clubMode"
            type="button"
            class="asp__add"
            data-testid="admin-add-text-field"
            (click)="onAddTextField()"
          >
            + Ajouter un champ texte
          </button>
        </header>
        <div class="asp__grid">
          <app-admin-field-editor
            *ngFor="let f of view.textFields"
            [field]="asTextField(f)"
            [layers]="view.layers"
            (patch)="onPatchTextField(f.id, $any($event))"
            (delete)="onDeleteTextField(f.id)"
          ></app-admin-field-editor>
        </div>
        <p class="asp__empty" *ngIf="!view.textFields.length">Aucun champ texte.</p>
      </section>

      <section class="asp__fields">
        <header class="asp__fields-head">
          <h4>Slots image ({{ view.imageSlots.length }})</h4>
          <button
            *ngIf="!clubMode"
            type="button"
            class="asp__add"
            data-testid="admin-add-image-slot"
            (click)="onAddImageSlot()"
          >
            + Ajouter un slot image
          </button>
        </header>
        <div class="asp__grid">
          <app-admin-field-editor
            *ngFor="let s of view.imageSlots"
            [field]="asImageSlot(s)"
            [layers]="view.layers"
            (patch)="onPatchImageSlot(s.id, $any($event))"
            (delete)="onDeleteImageSlot(s.id)"
          ></app-admin-field-editor>
        </div>
        <p class="asp__empty" *ngIf="!view.imageSlots.length">Aucun slot image.</p>
      </section>
    </div>
  `,
  styles: [`
    .asp { display: flex; flex-direction: column; gap: 20px; }
    .asp__fields-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; gap: 8px; }
    .asp__fields h4 { margin: 0; font-size: 14px; }
    .asp__add { padding: 4px 10px; font-size: 12px; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; color: #111827; cursor: pointer; }
    .asp__add:hover { background: #f3f4f6; }
    .asp__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
    .asp__empty { font-size: 12px; color: #6b7280; font-style: italic; }
    .asp__format { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; }
    .asp__format h4 { margin: 0; font-size: 14px; }
    .asp__format-options { display: flex; flex-wrap: wrap; gap: 8px; }
    .asp__format-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 14px; min-width: 110px; border: 1px solid #d1d5db; border-radius: 6px; background: #f9fafb; cursor: pointer; color: #111827; }
    .asp__format-btn:hover { background: #f3f4f6; }
    .asp__format-btn--active { border-color: #6d28d9; background: #ede9fe; color: #5b21b6; font-weight: 600; }
    .asp__format-label { font-size: 13px; }
    .asp__format-dim { font-size: 11px; color: #6b7280; }
    .asp__format-btn--active .asp__format-dim { color: #6d28d9; }
    .asp__format-hint { margin: 0; font-size: 11px; color: #6b7280; }
  `],
})
export class AdminStudioPanelComponent {
  @Input({ required: true }) view!: TemplateStudioView;
  /** ADR-075 V3 Phase B — masque layers/variants + route les patches vers /api/club/*. */
  @Input() clubMode = false;
  @Output() changed = new EventEmitter<void>();

  @ViewChild('canvasOverlay') canvasOverlay?: AdminCanvasOverlayComponent;

  private api = inject(RemotionTemplatesDataService);
  private clubApi = inject(ClubTemplatesDataService);
  private notifications = inject(NotificationService);

  readonly formatPresets: ReadonlyArray<{ id: string; label: string; width: number; height: number }> = [
    { id: '16-9', label: '16:9 TV', width: 1920, height: 1080 },
    { id: '9-16', label: '9:16 Vertical', width: 1080, height: 1920 },
    { id: '1-1', label: '1:1 Carré', width: 1080, height: 1080 },
    { id: '4-5', label: '4:5 Portrait', width: 1080, height: 1350 },
  ];

  isActiveFormat(preset: { width: number; height: number }): boolean {
    return this.view.canvasWidth === preset.width && this.view.canvasHeight === preset.height;
  }

  onSelectFormat(preset: { width: number; height: number }): void {
    if (this.isActiveFormat(preset)) return;
    const svc = this.clubMode ? this.clubApi : this.api;
    svc
      .updateTemplate(this.view.id, {
        canvas_width: preset.width,
        canvas_height: preset.height,
      })
      .subscribe({
        next: () => this.afterMutation('Format mis à jour'),
        error: () => this.notifications.error('Échec mise à jour format'),
      });
  }

  asTextField(f: TemplateTextField): EditableField {
    return { kind: 'text', value: f };
  }

  asImageSlot(s: TemplateImageSlot): EditableField {
    return { kind: 'image', value: s };
  }

  // ── Variants ──
  onCreateVariant(payload: TemplateVariantCreate): void {
    this.api.createVariant(this.view.id, payload).subscribe({
      next: () => this.afterMutation('Variant créé'),
      error: () => this.notifications.error('Échec création variant'),
    });
  }

  onUpdateVariant(evt: { id: string; patch: Partial<TemplateVariant> }): void {
    this.api.updateVariant(this.view.id, evt.id, evt.patch).subscribe({
      next: () => this.changed.emit(),
      error: () => this.notifications.error('Échec mise à jour variant'),
    });
  }

  onDeleteVariant(id: string): void {
    this.api.deleteVariant(this.view.id, id).subscribe({
      next: () => this.afterMutation('Variant supprimé'),
      error: () => this.notifications.error('Échec suppression variant'),
    });
  }

  // ── Layers ──
  onCreateLayer(payload: TemplateLayerCreate): void {
    this.api.createLayer(this.view.id, payload).subscribe({
      next: () => this.afterMutation('Layer créé'),
      error: () => this.notifications.error('Échec création layer'),
    });
  }

  onUpdateLayer(evt: { id: string; patch: Partial<TemplateLayer> }): void {
    this.api.updateLayer(this.view.id, evt.id, evt.patch).subscribe({
      next: () => this.changed.emit(),
      error: () => this.notifications.error('Échec mise à jour layer'),
    });
  }

  onDeleteLayer(id: string): void {
    this.api.deleteLayer(this.view.id, id).subscribe({
      next: () => this.afterMutation('Layer supprimé'),
      error: () => this.notifications.error('Échec suppression layer'),
    });
  }

  // ── Text fields ──
  onAddTextField(): void {
    const slotKey = this.nextSlotKey(
      'text',
      this.view.textFields.map((f) => f.slotKey),
    );
    const payload: TemplateTextFieldCreate = {
      slotKey,
      label: `Texte ${this.view.textFields.length + 1}`,
      positionX: 0.5,
      positionY: 0.5,
      maxWidth: 0.8,
      fontFamily: 'Anton',
      fontSize: 48,
      color: '#FFFFFF',
      align: 'center',
      appearAt: 0.5,
      appearDuration: 0.4,
      animation: 'fade',
      defaultValue: '',
      maxChars: null,
      multiline: false,
      required: false,
      sortOrder: this.view.textFields.length,
    };
    this.api.createTextField(this.view.id, payload).subscribe({
      next: () => this.afterMutation('Champ texte ajouté'),
      error: () => this.notifications.error('Échec ajout champ texte'),
    });
  }

  onPatchTextField(id: string, patch: TemplateTextFieldUpdate): void {
    const svc = this.clubMode ? this.clubApi : this.api;
    // Ne PAS emit `changed` ici : le two-way binding ngModel a déjà mis à jour
    // le modèle local. Reload = unmount/remount des cartes → flash à chaque
    // keystroke. On reload uniquement après CREATE/DELETE (afterMutation).
    // Canvas refresh : la carte a muté `tf` in-place, l'overlay (OnPush) ne
    // re-render pas tout seul — on le pousse ici.
    this.canvasOverlay?.refresh();
    svc.updateTextField(this.view.id, id, patch).subscribe({
      error: () => this.notifications.error('Échec mise à jour champ texte'),
    });
  }

  onDeleteTextField(id: string): void {
    this.api.deleteTextField(this.view.id, id).subscribe({
      next: () => this.afterMutation('Champ texte supprimé'),
      error: () => this.notifications.error('Échec suppression champ texte'),
    });
  }

  // ── Image slots ──
  onAddImageSlot(): void {
    const slotKey = this.nextSlotKey(
      'image',
      this.view.imageSlots.map((s) => s.slotKey),
    );
    const payload: TemplateImageSlotCreate = {
      slotKey,
      label: `Image ${this.view.imageSlots.length + 1}`,
      positionX: 0.5,
      positionY: 0.5,
      width: 0.3,
      height: 0.3,
      appearAt: 0.5,
      appearDuration: 0.4,
      animation: 'fade',
      aspectRatio: null,
      required: false,
      sortOrder: this.view.imageSlots.length,
    };
    this.api.createImageSlot(this.view.id, payload).subscribe({
      next: () => this.afterMutation('Slot image ajouté'),
      error: () => this.notifications.error('Échec ajout slot image'),
    });
  }

  onPatchImageSlot(id: string, patch: TemplateImageSlotUpdate): void {
    const svc = this.clubMode ? this.clubApi : this.api;
    // Pas d'emit `changed` : voir onPatchTextField pour la raison (anti-flash).
    this.canvasOverlay?.refresh();
    svc.updateImageSlot(this.view.id, id, patch).subscribe({
      error: () => this.notifications.error('Échec mise à jour slot image'),
    });
  }

  onDeleteImageSlot(id: string): void {
    this.api.deleteImageSlot(this.view.id, id).subscribe({
      next: () => this.afterMutation('Slot image supprimé'),
      error: () => this.notifications.error('Échec suppression slot image'),
    });
  }

  private nextSlotKey(prefix: string, existing: string[]): string {
    const taken = new Set(existing);
    for (let i = 1; i <= 999; i++) {
      const key = `${prefix}${i}`;
      if (!taken.has(key)) return key;
    }
    return `${prefix}${Date.now()}`;
  }

  private afterMutation(msg: string): void {
    this.notifications.success(msg);
    this.changed.emit();
  }
}
