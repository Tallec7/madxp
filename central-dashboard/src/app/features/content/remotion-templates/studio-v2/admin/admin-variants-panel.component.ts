import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { TemplateVariant } from '../../remotion-templates.types';
import type { TemplateVariantCreate } from '../../remotion-templates-data.service';
import { UrlUploadInputComponent } from './url-upload-input.component';

/**
 * ADR-075 Sprint 3 — Panel CRUD variants (super_admin).
 * Stateless : émet events que l'orchestrateur convertit en PATCH/POST/DELETE.
 */
@Component({
  selector: 'app-admin-variants-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, UrlUploadInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="avp" data-testid="admin-variants-panel">
      <header class="avp__header">
        <h4>Variants ({{ variants.length }})</h4>
        <button type="button" class="avp__add" (click)="openAdd = !openAdd">
          {{ openAdd ? 'Annuler' : '+ Nouveau variant' }}
        </button>
      </header>

      <form *ngIf="openAdd" class="avp__form" (ngSubmit)="submitNew()">
        <input placeholder="Nom" [(ngModel)]="draft.name" name="name" required />
        <app-url-upload-input
          [templateId]="templateId"
          [value]="draft.backgroundVideoUrl"
          placeholder="URL vidéo de fond"
          accept="video/*"
          (valueChange)="draft.backgroundVideoUrl = $event"
        ></app-url-upload-input>
        <app-url-upload-input
          [templateId]="templateId"
          [value]="draft.thumbnailUrl"
          placeholder="URL thumbnail (opt.)"
          accept="image/*,video/*"
          (valueChange)="draft.thumbnailUrl = $event || null"
        ></app-url-upload-input>
        <button type="submit" class="avp__save" [disabled]="!draft.name || !draft.backgroundVideoUrl">Créer</button>
      </form>

      <ul class="avp__list">
        <li *ngFor="let v of variants; let i = index" class="avp__item">
          <span class="avp__order">#{{ i + 1 }}</span>
          <input class="avp__name" [(ngModel)]="v.name" (change)="emitUpdate(v, { name: v.name })" />
          <app-url-upload-input
            class="avp__url"
            [templateId]="templateId"
            [value]="v.backgroundVideoUrl"
            placeholder="URL vidéo de fond"
            accept="video/*"
            (valueChange)="v.backgroundVideoUrl = $event; emitUpdate(v, { backgroundVideoUrl: $event })"
          ></app-url-upload-input>
          <button type="button" class="avp__btn" [disabled]="i === 0" (click)="moveUp(v, i)" title="Monter">↑</button>
          <button type="button" class="avp__btn" [disabled]="i === variants.length - 1" (click)="moveDown(v, i)" title="Descendre">↓</button>
          <button type="button" class="avp__delete" (click)="delete.emit(v.id)">Suppr.</button>
        </li>
      </ul>

      <p class="avp__empty" *ngIf="!variants.length">Aucun variant. Ajoutez-en au moins un.</p>
    </section>
  `,
  styles: [`
    .avp { display: flex; flex-direction: column; gap: 8px; }
    .avp__header { display: flex; align-items: center; gap: 12px; }
    .avp__header h4 { margin: 0; font-size: 14px; }
    .avp__add { margin-left: auto; padding: 4px 10px; font-size: 12px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer; }
    .avp__form { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; background: #f9fafb; border-radius: 6px; }
    .avp__form input { flex: 1 1 160px; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; }
    .avp__save { padding: 4px 10px; background: var(--studio-accent-500); color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .avp__save:disabled { opacity: 0.5; cursor: not-allowed; }
    .avp__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
    .avp__item { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; }
    .avp__order { font-size: 11px; color: #6b7280; min-width: 24px; }
    .avp__name { flex: 0 0 120px; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 12px; }
    .avp__url { flex: 1; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 12px; }
    .avp__btn { padding: 2px 6px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 3px; cursor: pointer; font-size: 11px; }
    .avp__btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .avp__delete { padding: 2px 6px; background: var(--studio-danger-bg); color: var(--studio-danger-fg); border: 1px solid var(--studio-danger-border); border-radius: 3px; cursor: pointer; font-size: 11px; }
    .avp__empty { font-size: 12px; color: #6b7280; font-style: italic; }
  `],
})
export class AdminVariantsPanelComponent {
  @Input({ required: true }) templateId = '';
  @Input({ required: true }) variants: TemplateVariant[] = [];
  @Output() create = new EventEmitter<TemplateVariantCreate>();
  @Output() update = new EventEmitter<{ id: string; patch: Partial<TemplateVariant> }>();
  @Output() delete = new EventEmitter<string>();

  openAdd = false;
  draft: TemplateVariantCreate = this.resetDraft();

  submitNew(): void {
    if (!this.draft.name || !this.draft.backgroundVideoUrl) return;
    this.create.emit({
      ...this.draft,
      sortOrder: this.variants.length,
      thumbnailUrl: this.draft.thumbnailUrl || null,
    });
    this.draft = this.resetDraft();
    this.openAdd = false;
  }

  emitUpdate(v: TemplateVariant, patch: Partial<TemplateVariant>): void {
    this.update.emit({ id: v.id, patch });
  }

  moveUp(v: TemplateVariant, i: number): void {
    if (i === 0) return;
    this.update.emit({ id: v.id, patch: { sortOrder: i - 1 } });
    this.update.emit({ id: this.variants[i - 1].id, patch: { sortOrder: i } });
  }

  moveDown(v: TemplateVariant, i: number): void {
    if (i === this.variants.length - 1) return;
    this.update.emit({ id: v.id, patch: { sortOrder: i + 1 } });
    this.update.emit({ id: this.variants[i + 1].id, patch: { sortOrder: i } });
  }

  private resetDraft(): TemplateVariantCreate {
    return {
      name: '',
      backgroundVideoUrl: '',
      thumbnailUrl: null,
      sortOrder: 0,
    };
  }
}
