import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { TemplateLayer } from '../../remotion-templates.types';
import type { TemplateLayerCreate } from '../../remotion-templates-data.service';
import { UrlUploadInputComponent } from './url-upload-input.component';

/**
 * ADR-075 Sprint 3 — Panel CRUD layers (z-index + mask) — super_admin.
 */
@Component({
  selector: 'app-admin-layers-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, UrlUploadInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="alp" data-testid="admin-layers-panel">
      <header class="alp__header">
        <h4>Layers ({{ layers.length }})</h4>
        <button type="button" class="alp__add" (click)="openAdd = !openAdd">
          {{ openAdd ? 'Annuler' : '+ Nouveau layer' }}
        </button>
      </header>

      <form *ngIf="openAdd" class="alp__form" (ngSubmit)="submitNew()">
        <input placeholder="Nom" [(ngModel)]="draft.name" name="name" required />
        <app-url-upload-input
          [templateId]="templateId"
          [value]="draft.videoUrl"
          placeholder="URL vidéo"
          accept="video/*"
          (valueChange)="draft.videoUrl = $event"
        ></app-url-upload-input>
        <input type="number" placeholder="z-index" [(ngModel)]="draft.zIndex" name="z" />
        <button type="submit" class="alp__save" [disabled]="!draft.name || !draft.videoUrl">Créer</button>
      </form>

      <ul class="alp__list">
        <li *ngFor="let l of layers" class="alp__item">
          <span class="alp__z">z={{ l.zIndex }}</span>
          <input class="alp__name" [(ngModel)]="l.name" (change)="emitUpdate(l, { name: l.name })" />
          <app-url-upload-input
            class="alp__url"
            [templateId]="templateId"
            [value]="l.videoUrl"
            placeholder="URL vidéo"
            accept="video/*"
            (valueChange)="l.videoUrl = $event; emitUpdate(l, { videoUrl: $event })"
          ></app-url-upload-input>
          <span class="alp__mask" title="mask top/bottom/left/right">
            {{ l.mask.top }}/{{ l.mask.bottom }}/{{ l.mask.left }}/{{ l.mask.right }}
          </span>
          <button type="button" class="alp__delete" (click)="delete.emit(l.id)">Suppr.</button>
        </li>
      </ul>

      <p class="alp__empty" *ngIf="!layers.length">Aucun layer.</p>
    </section>
  `,
  styles: [`
    .alp { display: flex; flex-direction: column; gap: 8px; }
    .alp__header { display: flex; align-items: center; gap: 12px; }
    .alp__header h4 { margin: 0; font-size: 14px; }
    .alp__add { margin-left: auto; padding: 4px 10px; font-size: 12px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer; }
    .alp__form { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; background: #f9fafb; border-radius: 6px; }
    .alp__form input { flex: 1 1 120px; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; }
    .alp__save { padding: 4px 10px; background: #7c3aed; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .alp__save:disabled { opacity: 0.5; cursor: not-allowed; }
    .alp__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
    .alp__item { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; }
    .alp__z { font-size: 11px; color: #6b7280; min-width: 40px; }
    .alp__name { flex: 0 0 120px; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 12px; }
    .alp__url { flex: 1; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 12px; }
    .alp__mask { font-size: 10px; color: #6b7280; font-family: monospace; }
    .alp__delete { padding: 2px 6px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 3px; cursor: pointer; font-size: 11px; }
    .alp__empty { font-size: 12px; color: #6b7280; font-style: italic; }
  `],
})
export class AdminLayersPanelComponent {
  @Input({ required: true }) templateId = '';
  @Input({ required: true }) layers: TemplateLayer[] = [];
  @Output() create = new EventEmitter<TemplateLayerCreate>();
  @Output() update = new EventEmitter<{ id: string; patch: Partial<TemplateLayer> }>();
  @Output() delete = new EventEmitter<string>();

  openAdd = false;
  draft: TemplateLayerCreate = this.resetDraft();

  submitNew(): void {
    if (!this.draft.name || !this.draft.videoUrl) return;
    this.create.emit({ ...this.draft });
    this.draft = this.resetDraft();
    this.openAdd = false;
  }

  emitUpdate(l: TemplateLayer, patch: Partial<TemplateLayer>): void {
    this.update.emit({ id: l.id, patch });
  }

  private resetDraft(): TemplateLayerCreate {
    return {
      name: '',
      videoUrl: '',
      zIndex: 0,
      mask: { top: 0, bottom: 0, left: 0, right: 0 },
      durationMs: 5000,
    };
  }
}
