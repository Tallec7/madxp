import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../../../core/services/notification.service';
import { RemotionTemplatesDataService } from '../../remotion-templates-data.service';
import type { RemotionTemplate, TemplatePropDef } from '../../remotion-templates.types';

type WizardStep = 1 | 2 | 3 | 4;

/**
 * ADR-075 Sprint 3 — Wizard 4 étapes pour créer un template depuis le dashboard.
 * 1) Identité (nom + description)
 * 2) Composition Remotion (compositionId + mode)
 * 3) Métadonnées initiales (seeds optionnels)
 * 4) Revue + création
 *
 * Après création : l'admin passe en mode Studio pour composer variants/layers.
 */
@Component({
  selector: 'app-create-template-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="ctw__backdrop"
      (click)="dismiss.emit()"
      (keydown.escape)="dismiss.emit()"
      role="button"
      tabindex="0"
      data-testid="create-template-wizard"
    >
      <div
        class="ctw__modal"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
        role="dialog"
        aria-modal="true"
      >
        <header class="ctw__header">
          <h3>Nouveau template — Étape {{ step }}/4</h3>
          <button type="button" class="ctw__close" (click)="dismiss.emit()" aria-label="Fermer">×</button>
        </header>

        <div class="ctw__progress">
          <div class="ctw__progress-bar" [style.width.%]="(step / 4) * 100"></div>
        </div>

        <section class="ctw__body">
          <!-- Step 1 : Identité -->
          <div *ngIf="step === 1" class="ctw__step">
            <h4>Identité</h4>
            <label>
              Nom *
              <input type="text" [(ngModel)]="form.name" placeholder="Ex: But Simple v2" maxlength="120" />
            </label>
            <label>
              Description
              <textarea [(ngModel)]="form.description" rows="3" placeholder="À quoi sert ce template ?"></textarea>
            </label>
          </div>

          <!-- Step 2 : Composition -->
          <div *ngIf="step === 2" class="ctw__step">
            <h4>Composition Remotion</h4>
            <label>
              Composition ID *
              <input type="text" [(ngModel)]="form.compositionId" placeholder="Ex: ButV2, ScoreLive" />
            </label>
            <label>
              Mode
              <select [(ngModel)]="form.mode">
                <option value="v2">Studio V2 (variants + layers + slots)</option>
                <option value="v1">Legacy (props_schema)</option>
              </select>
            </label>
            <p class="ctw__hint">
              En mode Studio V2, la composition et ses variants seront ajoutés après création via les panels admin.
            </p>
          </div>

          <!-- Step 3 : Seeds -->
          <div *ngIf="step === 3" class="ctw__step">
            <h4>Métadonnées initiales</h4>
            <ng-container *ngIf="form.mode === 'v1'">
              <label>
                Props schema (JSON)
                <textarea [(ngModel)]="propsSchemaJson" rows="6" placeholder='[{"key":"score","label":"Score","type":"text","required":true}]'></textarea>
              </label>
              <label>
                Default props (JSON)
                <textarea [(ngModel)]="defaultPropsJson" rows="4" placeholder='{"score":"0"}'></textarea>
              </label>
              <p class="ctw__error" *ngIf="seedError">{{ seedError }}</p>
            </ng-container>
            <p *ngIf="form.mode === 'v2'" class="ctw__hint">
              Rien à saisir ici — le template V2 est créé vide, la composition se compose ensuite.
            </p>
          </div>

          <!-- Step 4 : Review -->
          <div *ngIf="step === 4" class="ctw__step">
            <h4>Revue</h4>
            <dl class="ctw__review">
              <dt>Nom</dt><dd>{{ form.name || '—' }}</dd>
              <dt>Description</dt><dd>{{ form.description || '—' }}</dd>
              <dt>Composition</dt><dd><code>{{ form.compositionId || '—' }}</code></dd>
              <dt>Mode</dt><dd>{{ form.mode === 'v2' ? 'Studio V2' : 'Legacy v1' }}</dd>
            </dl>
            <p class="ctw__error" *ngIf="submitError">{{ submitError }}</p>
          </div>
        </section>

        <footer class="ctw__footer">
          <button type="button" class="ctw__btn" (click)="back()" [disabled]="step === 1 || submitting">Précédent</button>
          <button type="button" class="ctw__btn ctw__btn--primary" *ngIf="step < 4" (click)="next()" [disabled]="!canAdvance()">
            Suivant
          </button>
          <button type="button" class="ctw__btn ctw__btn--primary" *ngIf="step === 4" (click)="submit()" [disabled]="submitting">
            {{ submitting ? 'Création…' : 'Créer le template' }}
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .ctw__backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .ctw__modal { background: #fff; border-radius: 8px; width: 560px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); overflow-y: auto; display: flex; flex-direction: column; }
    .ctw__header { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
    .ctw__header h3 { margin: 0; font-size: 16px; }
    .ctw__close { margin-left: auto; background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; }
    .ctw__progress { height: 3px; background: #f3f4f6; }
    .ctw__progress-bar { height: 100%; background: #7c3aed; transition: width 0.2s ease; }
    .ctw__body { padding: 20px; }
    .ctw__step { display: flex; flex-direction: column; gap: 12px; }
    .ctw__step h4 { margin: 0 0 8px; font-size: 14px; }
    .ctw__step label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
    .ctw__step input, .ctw__step textarea, .ctw__step select { padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; font-family: inherit; }
    .ctw__step textarea { font-family: monospace; font-size: 12px; resize: vertical; }
    .ctw__hint { margin: 0; font-size: 12px; color: #6b7280; font-style: italic; }
    .ctw__error { margin: 0; font-size: 12px; color: #b91c1c; }
    .ctw__review { display: grid; grid-template-columns: 120px 1fr; gap: 6px 12px; margin: 0; font-size: 13px; }
    .ctw__review dt { font-weight: 500; color: #6b7280; }
    .ctw__review dd { margin: 0; }
    .ctw__footer { display: flex; gap: 8px; padding: 12px 20px; border-top: 1px solid #e5e7eb; }
    .ctw__btn { padding: 6px 14px; font-size: 13px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer; }
    .ctw__btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .ctw__btn--primary { margin-left: auto; background: #7c3aed; color: #fff; border-color: #7c3aed; }
    .ctw__btn--primary:disabled { background: #a78bfa; border-color: #a78bfa; }
  `],
})
export class CreateTemplateWizardComponent {
  @Output() dismiss = new EventEmitter<void>();
  @Output() created = new EventEmitter<RemotionTemplate>();

  private api = inject(RemotionTemplatesDataService);
  private notifications = inject(NotificationService);

  step: WizardStep = 1;
  submitting = false;
  submitError: string | null = null;
  seedError: string | null = null;

  form = {
    name: '',
    description: '',
    compositionId: '',
    mode: 'v2' as 'v1' | 'v2',
  };

  propsSchemaJson = '[]';
  defaultPropsJson = '{}';

  canAdvance(): boolean {
    if (this.step === 1) return !!this.form.name.trim();
    if (this.step === 2) return !!this.form.compositionId.trim();
    if (this.step === 3) {
      if (this.form.mode === 'v2') return true;
      return this.validateSeeds();
    }
    return true;
  }

  next(): void {
    if (!this.canAdvance()) return;
    if (this.step < 4) this.step = (this.step + 1) as WizardStep;
  }

  back(): void {
    if (this.step > 1) this.step = (this.step - 1) as WizardStep;
  }

  submit(): void {
    if (this.submitting) return;
    this.submitError = null;
    const seeds = this.parseSeeds();
    if (seeds.error) {
      this.submitError = seeds.error;
      return;
    }
    this.submitting = true;
    this.api.createTemplate({
      name: this.form.name.trim(),
      composition_id: this.form.compositionId.trim(),
      description: this.form.description.trim() || null,
      props_schema: seeds.props_schema,
      default_props: seeds.default_props,
    }).subscribe({
      next: (tpl) => {
        this.submitting = false;
        this.notifications.success(`Template "${tpl.name}" créé`);
        this.created.emit(tpl);
      },
      error: (err) => {
        this.submitting = false;
        this.submitError = err?.error?.error || 'Erreur lors de la création';
      },
    });
  }

  private validateSeeds(): boolean {
    this.seedError = null;
    try {
      const schema = JSON.parse(this.propsSchemaJson || '[]');
      if (!Array.isArray(schema)) {
        this.seedError = 'props_schema doit être un tableau';
        return false;
      }
      JSON.parse(this.defaultPropsJson || '{}');
      return true;
    } catch {
      this.seedError = 'JSON invalide';
      return false;
    }
  }

  private parseSeeds(): {
    props_schema: TemplatePropDef[];
    default_props: Record<string, unknown>;
    error: string | null;
  } {
    if (this.form.mode === 'v2') {
      return { props_schema: [], default_props: {}, error: null };
    }
    try {
      return {
        props_schema: JSON.parse(this.propsSchemaJson || '[]') as TemplatePropDef[],
        default_props: JSON.parse(this.defaultPropsJson || '{}') as Record<string, unknown>,
        error: null,
      };
    } catch {
      return { props_schema: [], default_props: {}, error: 'JSON invalide dans les seeds' };
    }
  }
}
