import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../../../core/services/notification.service';
import {
  RemotionTemplatesDataService,
  type TemplateLayerCreate,
  type TemplateVariantCreate,
} from '../../remotion-templates-data.service';
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="asp" *ngIf="view" data-testid="admin-studio-panel">
      <app-admin-variants-panel
        [templateId]="view.id"
        [variants]="view.variants"
        (create)="onCreateVariant($event)"
        (update)="onUpdateVariant($event)"
        (delete)="onDeleteVariant($event)"
      ></app-admin-variants-panel>

      <app-admin-layers-panel
        [templateId]="view.id"
        [layers]="view.layers"
        (create)="onCreateLayer($event)"
        (update)="onUpdateLayer($event)"
        (delete)="onDeleteLayer($event)"
      ></app-admin-layers-panel>

      <section class="asp__fields">
        <h4>Champs texte ({{ view.textFields.length }})</h4>
        <div class="asp__grid">
          <app-admin-field-editor
            *ngFor="let f of view.textFields"
            [field]="asTextField(f)"
            (patch)="onPatchTextField(f.id, $any($event))"
            (delete)="onDeleteTextField(f.id)"
          ></app-admin-field-editor>
        </div>
        <p class="asp__empty" *ngIf="!view.textFields.length">Aucun champ texte.</p>
      </section>

      <section class="asp__fields">
        <h4>Slots image ({{ view.imageSlots.length }})</h4>
        <div class="asp__grid">
          <app-admin-field-editor
            *ngFor="let s of view.imageSlots"
            [field]="asImageSlot(s)"
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
    .asp__fields h4 { margin: 0 0 8px; font-size: 14px; }
    .asp__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
    .asp__empty { font-size: 12px; color: #6b7280; font-style: italic; }
  `],
})
export class AdminStudioPanelComponent {
  @Input({ required: true }) view!: TemplateStudioView;
  @Output() changed = new EventEmitter<void>();

  private api = inject(RemotionTemplatesDataService);
  private notifications = inject(NotificationService);

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
  onPatchTextField(id: string, patch: Partial<TemplateTextField>): void {
    this.api.updateTextField(this.view.id, id, patch).subscribe({
      next: () => this.changed.emit(),
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
  onPatchImageSlot(id: string, patch: Partial<TemplateImageSlot>): void {
    this.api.updateImageSlot(this.view.id, id, patch).subscribe({
      next: () => this.changed.emit(),
      error: () => this.notifications.error('Échec mise à jour slot image'),
    });
  }

  onDeleteImageSlot(id: string): void {
    this.api.deleteImageSlot(this.view.id, id).subscribe({
      next: () => this.afterMutation('Slot image supprimé'),
      error: () => this.notifications.error('Échec suppression slot image'),
    });
  }

  private afterMutation(msg: string): void {
    this.notifications.success(msg);
    this.changed.emit();
  }
}
