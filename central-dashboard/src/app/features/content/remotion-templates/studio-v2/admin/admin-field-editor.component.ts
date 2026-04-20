import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type {
  AnimationPreset,
  TemplateImageSlot,
  TemplateTextField,
} from '../../remotion-templates.types';

export type EditableField =
  | { kind: 'text'; value: TemplateTextField }
  | { kind: 'image'; value: TemplateImageSlot };

const ANIMATIONS: AnimationPreset[] = [
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'scale-in',
  'blur-in',
];

/**
 * ADR-075 Sprint 3 — Éditeur de champ unique (text ou image).
 * Émet des patches partiels consommés par le parent pour PATCH serveur.
 */
@Component({
  selector: 'app-admin-field-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="afe" *ngIf="field as f" [attr.data-testid]="'admin-field-editor'">
      <header class="afe__header">
        <span class="afe__kind">{{ f.kind === 'text' ? 'Texte' : 'Image' }}</span>
        <strong>{{ f.value.label }}</strong>
        <code class="afe__key">{{ f.value.slotKey }}</code>
      </header>

      <section class="afe__section">
        <h5>Position</h5>
        <label>x <input type="number" [(ngModel)]="f.value.position.x" (change)="emitPatch()" /></label>
        <label>y <input type="number" [(ngModel)]="f.value.position.y" (change)="emitPatch()" /></label>
        <ng-container *ngIf="f.kind === 'image'">
          <label>width
            <input type="number" [(ngModel)]="$any(f.value).position.width" (change)="emitPatch()" />
          </label>
          <label>height
            <input type="number" [(ngModel)]="$any(f.value).position.height" (change)="emitPatch()" />
          </label>
        </ng-container>
        <label *ngIf="f.kind === 'text'">maxWidth
          <input type="number" [(ngModel)]="$any(f.value).maxWidth" (change)="emitPatch()" />
        </label>
      </section>

      <section class="afe__section">
        <h5>Timing (secondes)</h5>
        <label>appearAt
          <input type="number" step="0.1" [(ngModel)]="f.value.appearAt" (change)="emitPatch()" />
        </label>
        <label>appearDuration
          <input type="number" step="0.1" [(ngModel)]="f.value.appearDuration" (change)="emitPatch()" />
        </label>
      </section>

      <section class="afe__section">
        <h5>Animation</h5>
        <select [(ngModel)]="f.value.animation" (change)="emitPatch()">
          <option *ngFor="let a of animations" [value]="a">{{ a }}</option>
        </select>
      </section>

      <section class="afe__section" *ngIf="f.kind === 'text'">
        <h5>Typographie</h5>
        <label>fontFamily
          <input type="text" [(ngModel)]="$any(f.value).fontFamily" (change)="emitPatch()" />
        </label>
        <label>fontSize
          <input type="number" [(ngModel)]="$any(f.value).fontSize" (change)="emitPatch()" />
        </label>
        <label>color
          <input type="color" [(ngModel)]="$any(f.value).color" (change)="emitPatch()" />
        </label>
        <label>align
          <select [(ngModel)]="$any(f.value).align" (change)="emitPatch()">
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </select>
        </label>
      </section>

      <footer class="afe__footer">
        <button type="button" class="afe__delete" (click)="delete.emit()">Supprimer</button>
      </footer>
    </div>
  `,
  styles: [`
    .afe { display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; }
    .afe__header { display: flex; align-items: center; gap: 8px; }
    .afe__kind { padding: 2px 8px; font-size: 11px; border-radius: 3px; background: #ede9fe; color: #6d28d9; }
    .afe__key { font-size: 11px; color: #6b7280; margin-left: auto; }
    .afe__section { display: flex; flex-wrap: wrap; gap: 8px; }
    .afe__section h5 { flex-basis: 100%; margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; }
    .afe__section label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
    .afe__section input, .afe__section select { padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; }
    .afe__footer { display: flex; justify-content: flex-end; }
    .afe__delete { padding: 4px 10px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .afe__delete:hover { background: #fee2e2; }
  `],
})
export class AdminFieldEditorComponent {
  @Input({ required: true }) field!: EditableField;
  @Output() patch = new EventEmitter<
    Partial<TemplateTextField> | Partial<TemplateImageSlot>
  >();
  @Output() delete = new EventEmitter<void>();

  readonly animations = ANIMATIONS;

  emitPatch(): void {
    // Emit the current snapshot; the parent diffs against its own state
    // and issues the PATCH. Shallow clone to detach from our mutable ref.
    this.patch.emit({ ...this.field.value });
  }
}
