import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { RemotionTemplate, TemplatePropDef } from './remotion-templates.types';

/**
 * Modal d'édition du schéma d'un template (admin only, ADR-055).
 *
 * Édition en JSON brut de `props_schema` (array de TemplatePropDef) et
 * `default_props` (record). Chaque save déclenche côté serveur un snapshot
 * automatique de la version précédente (trigger `trg_neopro_templates_snapshot`).
 *
 * L'édition JSON est volontairement simple : valeur par défaut suffisante pour
 * les cas admin, évite le coût d'un form builder pour un usage rare.
 */
@Component({
  selector: 'app-template-schema-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="modal-overlay"
      *ngIf="open"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      (click)="onBackdrop($event)"
      (keydown.escape)="onCancel()"
    >
      <div
        class="modal"
        role="presentation"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
      >
        <div class="modal-header">
          <h2>Éditer le schéma — {{ template?.name }}</h2>
          <button type="button" class="btn-close" aria-label="Fermer" (click)="onCancel()">✕</button>
        </div>

        <div class="modal-body">
          <div class="editor-group">
            <label for="schemaEditor">props_schema (JSON)</label>
            <textarea
              id="schemaEditor"
              rows="14"
              spellcheck="false"
              [(ngModel)]="schemaText"
              [class.error]="schemaError"
            ></textarea>
            <div class="error-hint" *ngIf="schemaError">{{ schemaError }}</div>
          </div>

          <div class="editor-group">
            <label for="defaultsEditor">default_props (JSON)</label>
            <textarea
              id="defaultsEditor"
              rows="10"
              spellcheck="false"
              [(ngModel)]="defaultsText"
              [class.error]="defaultsError"
            ></textarea>
            <div class="error-hint" *ngIf="defaultsError">{{ defaultsError }}</div>
          </div>

          <p class="info-hint">
            Chaque sauvegarde crée automatiquement une version de la configuration précédente,
            accessible via l'historique pour une restauration en un clic.
          </p>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" [disabled]="saving" (click)="onCancel()">
            Annuler
          </button>
          <button type="button" class="btn btn-primary" [disabled]="saving" (click)="onSave()">
            {{ saving ? 'Enregistrement...' : 'Enregistrer' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .modal-overlay {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, .6);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000;
    }
    .modal {
      background: #fff; border-radius: 12px; width: min(720px, 90vw);
      max-height: 90vh; display: flex; flex-direction: column;
      box-shadow: 0 20px 50px rgba(0, 0, 0, .3);
    }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
    }
    .modal-header h2 { margin: 0; font-size: 16px; }
    .btn-close {
      background: none; border: none; font-size: 20px; cursor: pointer; color: #6b7280;
    }
    .modal-body { padding: 20px; overflow-y: auto; flex: 1; }
    .editor-group { margin-bottom: 16px; }
    .editor-group label {
      display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px;
    }
    textarea {
      width: 100%;
      font-family: 'SF Mono', Consolas, monospace; font-size: 12px;
      border: 1px solid #d1d5db; border-radius: 6px; padding: 10px;
      resize: vertical; box-sizing: border-box;
    }
    textarea.error { border-color: #dc2626; background: #fef2f2; }
    .error-hint { color: #dc2626; font-size: 12px; margin-top: 4px; }
    .info-hint { color: #6b7280; font-size: 12px; margin-top: 4px; }
    .modal-footer {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 20px; border-top: 1px solid #e5e7eb;
    }
    .btn { padding: 8px 16px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-size: 14px; }
    .btn-secondary { background: #fff; border-color: #d1d5db; }
    .btn-primary { background: #8b5cf6; color: #fff; }
    .btn-primary:disabled, .btn-secondary:disabled { opacity: .6; cursor: not-allowed; }
  `],
})
export class TemplateSchemaEditorComponent implements OnChanges {
  @Input() open = false;
  @Input() template: RemotionTemplate | null = null;
  @Input() saving = false;

  @Output() saveSchema = new EventEmitter<{
    props_schema: TemplatePropDef[];
    default_props: Record<string, unknown>;
  }>();
  @Output() cancelEdit = new EventEmitter<void>();

  schemaText = '';
  defaultsText = '';
  schemaError: string | null = null;
  defaultsError: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['template'] || changes['open']) && this.open && this.template) {
      this.schemaText = JSON.stringify(this.template.props_schema ?? [], null, 2);
      this.defaultsText = JSON.stringify(this.template.default_props ?? {}, null, 2);
      this.schemaError = null;
      this.defaultsError = null;
    }
  }

  onBackdrop(_event: MouseEvent): void {
    if (!this.saving) this.cancelEdit.emit();
  }

  onCancel(): void {
    this.cancelEdit.emit();
  }

  onSave(): void {
    this.schemaError = null;
    this.defaultsError = null;

    let parsedSchema: unknown;
    try {
      parsedSchema = JSON.parse(this.schemaText);
    } catch (e) {
      this.schemaError = 'JSON invalide : ' + (e instanceof Error ? e.message : String(e));
      return;
    }
    if (!Array.isArray(parsedSchema)) {
      this.schemaError = 'props_schema doit être un tableau';
      return;
    }

    let parsedDefaults: unknown;
    try {
      parsedDefaults = JSON.parse(this.defaultsText);
    } catch (e) {
      this.defaultsError = 'JSON invalide : ' + (e instanceof Error ? e.message : String(e));
      return;
    }
    if (typeof parsedDefaults !== 'object' || parsedDefaults === null || Array.isArray(parsedDefaults)) {
      this.defaultsError = 'default_props doit être un objet';
      return;
    }

    this.saveSchema.emit({
      props_schema: parsedSchema as TemplatePropDef[],
      default_props: parsedDefaults as Record<string, unknown>,
    });
  }
}
