/**
 * Template Studio v3 — Étape 1 (Identité).
 *
 * ReactiveForms standalone component. Held by parent shell via `[hidden]`
 * (Pitfall P2 — never `*ngIf`). Form values bubbled up via `@Output submit`;
 * parent persists immediately on Next via `dataService.createTemplate(...)`
 * (WIZARD-02 — no data loss on close).
 */

import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { DEFAULT_WIZARD_STATE, IdentityFormValue } from '../wizard-state.types';

@Component({
  selector: 'app-wizard-step-identity',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <form class="v3i" [formGroup]="form" (ngSubmit)="onSubmit()">
      <h2 class="v3i__title">Étape 1 — Identité</h2>
      <p class="v3i__lead">Donnez un nom à votre template et définissez son format.</p>

      <div class="v3i__row">
        <label for="v3i-name">Nom du template</label>
        <input
          id="v3i-name"
          type="text"
          formControlName="name"
          placeholder="Ex : Joueur Simple — Image"
        />
        <small
          class="v3i__err"
          *ngIf="form.controls.name.touched && form.controls.name.invalid"
        >
          Le nom doit faire entre 3 et 120 caractères
        </small>
      </div>

      <div class="v3i__row">
        <label for="v3i-desc">Description (optionnel)</label>
        <textarea
          id="v3i-desc"
          formControlName="description"
          rows="2"
          placeholder="À quoi sert ce template ?"
        ></textarea>
        <small
          class="v3i__err"
          *ngIf="form.controls.description.touched && form.controls.description.invalid"
        >
          La description est limitée à 500 caractères
        </small>
      </div>

      <div class="v3i__row v3i__row--3">
        <div>
          <label for="v3i-duration">Durée (secondes)</label>
          <input
            id="v3i-duration"
            type="number"
            formControlName="durationSec"
            step="0.1"
            min="0.5"
            max="60"
          />
          <small
            class="v3i__err"
            *ngIf="
              form.controls.durationSec.touched && form.controls.durationSec.invalid
            "
          >
            Durée comprise entre 0,5 et 60 s
          </small>
        </div>
        <div>
          <label for="v3i-fps">FPS</label>
          <input
            id="v3i-fps"
            type="number"
            formControlName="fps"
            min="24"
            max="60"
          />
          <small
            class="v3i__err"
            *ngIf="form.controls.fps.touched && form.controls.fps.invalid"
          >
            FPS entre 24 et 60
          </small>
        </div>
        <div>
          <label for="v3i-format">Format</label>
          <select id="v3i-format" [value]="currentFormatPreset()" (change)="applyFormatPreset($event)">
            <option value="1920x1080">1920×1080 (16:9 HD)</option>
            <option value="1080x1920">1080×1920 (9:16 vertical)</option>
            <option value="1080x1080">1080×1080 (carré)</option>
          </select>
          <small class="v3i__hint">{{ form.controls.width.value }}×{{ form.controls.height.value }}</small>
        </div>
      </div>

      <div class="v3i__actions">
        <button
          type="submit"
          class="btn btn-primary v3i__submit"
          [disabled]="form.invalid || saving"
        >
          {{ saving ? 'Création…' : 'Continuer →' }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .v3i {
        max-width: 640px;
      }
      .v3i__title {
        margin: 0 0 6px;
        font-size: 20px;
      }
      .v3i__lead {
        color: var(--muted, #94a3b8);
        margin: 0 0 24px;
      }
      .v3i__row {
        margin-bottom: 20px;
      }
      .v3i__row--3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
      }
      .v3i__row label {
        display: block;
        font-size: 13px;
        margin-bottom: 6px;
        font-weight: 500;
      }
      .v3i__row input,
      .v3i__row textarea,
      .v3i__row select {
        width: 100%;
        padding: 9px 12px;
        background: var(--surface-2, #1e293b);
        border: 1px solid var(--border, #334155);
        border-radius: 6px;
        color: var(--text, #f1f5f9);
        font: inherit;
      }
      .v3i__row input:focus,
      .v3i__row textarea:focus,
      .v3i__row select:focus {
        outline: none;
        border-color: var(--accent, #3b82f6);
      }
      .v3i__err {
        color: var(--err, #f87171);
        font-size: 12px;
        margin-top: 4px;
        display: block;
      }
      .v3i__hint {
        color: var(--muted, #94a3b8);
        font-size: 12px;
        margin-top: 4px;
        display: block;
      }
      .v3i__actions {
        margin-top: 32px;
        display: flex;
        justify-content: flex-end;
      }
      .v3i__submit:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class WizardStepIdentityComponent implements OnChanges {
  private fb = inject(FormBuilder);

  @Input() initialValue: IdentityFormValue = DEFAULT_WIZARD_STATE.identity;
  @Input() saving = false;
  @Output() next = new EventEmitter<IdentityFormValue>();

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(500)]],
    durationSec: [5.9, [Validators.required, Validators.min(0.5), Validators.max(60)]],
    fps: [30, [Validators.required, Validators.min(24), Validators.max(60)]],
    width: [1920, [Validators.required, Validators.min(320), Validators.max(3840)]],
    height: [1080, [Validators.required, Validators.min(240), Validators.max(2160)]],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialValue'] && this.initialValue && !this.form.dirty) {
      this.form.patchValue(this.initialValue, { emitEvent: false });
    }
  }

  currentFormatPreset(): string {
    const w = this.form.controls.width.value;
    const h = this.form.controls.height.value;
    return `${w}x${h}`;
  }

  applyFormatPreset(ev: Event): void {
    const target = ev.target as HTMLSelectElement;
    const [w, h] = target.value.split('x').map(Number);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      this.form.patchValue({ width: w, height: h });
      this.form.controls.width.markAsDirty();
      this.form.controls.height.markAsDirty();
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.next.emit(this.form.getRawValue() as IdentityFormValue);
  }
}
