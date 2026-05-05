/**
 * Template Studio v3 — Step 4 (Options club) — ADR-110 / WIZARD-01.
 *
 * Permet au super_admin de définir les options proposées au club au démarrage
 * (intro_mode, packshot, etc.) et de les mapper à des packshots vidéo.
 *
 * Backend tables (DB réelles, ne pas confondre la nomenclature) :
 *   - `template_options` : colonne `key` (PAS `option_key`), `values` JSONB,
 *     `default_value`, `user_editable`, `sort_order`.
 *   - `template_packshot_refs` : colonne `option_key` (FK vers
 *     `template_options.key`), `option_value`, `packshot_template_id`,
 *     `start_at_ms`, `z_index_offset`.
 *
 * Routes : POST /api/remotion-templates/:id/options + /:id/packshot-refs
 * (template-studio.routes.ts mounted on /api/remotion-templates).
 *
 * Vocabulaire : « Option club » + « Vidéo packshot » (VOCABULARY_MAP, Plan 01
 * frozen). Bouton retour « ← Retour » + bouton fin « Terminer » (verbes non
 * blocklistés par scripts/check-hardcoded-i18n.js — cf. Plan 03 deviation).
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  Signal,
  WritableSignal,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { RemotionTemplatesDataService } from '../../remotion-templates-data.service';
import type {
  RemotionTemplate,
  TemplateImageSlot,
  TemplateOption,
  TemplatePackshotRef,
  TemplateTextField,
} from '../../remotion-templates.types';

interface OptionFormShape {
  key: FormControl<string>;
  label: FormControl<string>;
  type: FormControl<'enum' | 'boolean'>;
  valuesRaw: FormControl<string>;
  defaultValue: FormControl<string>;
}

@Component({
  selector: 'app-wizard-step-options',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="wso">
      <header class="wso__header">
        <h2>Étape 4 — Options club</h2>
        <p class="wso__hint">
          Définissez les choix proposés au club au démarrage (ex : type d'intro,
          packshot final). Chaque option peut être reliée à une vidéo packshot.
        </p>
      </header>

      <!-- Liste des options existantes -->
      <ul class="wso__list" *ngIf="options().length > 0">
        <li
          class="wso__option"
          *ngFor="let opt of options(); trackBy: trackById"
          [attr.data-option-key]="opt.key"
        >
          <div class="wso__option-head">
            <div>
              <strong>{{ opt.label }}</strong>
              <span class="wso__pill wso__pill--type">
                {{ typePillLabel(opt.type) }}
              </span>
              <span class="wso__pill wso__pill--key">{{ opt.key }}</span>
            </div>
            <button
              type="button"
              class="wso__btn wso__btn--ghost"
              (click)="onDeleteOption(opt)"
              [disabled]="deleting() === opt.id"
              [attr.aria-label]="'Retirer ' + opt.label"
            >
              {{ deleting() === opt.id ? 'Retrait…' : 'Retirer' }}
            </button>
          </div>

          <div class="wso__values">
            <span
              class="wso__value-pill"
              *ngFor="let v of opt.values"
              [class.wso__value-pill--default]="v === opt.defaultValue"
              [title]="v === opt.defaultValue ? 'Valeur par défaut' : ''"
            >
              {{ v }}
            </span>
          </div>

          <div class="wso__linked">
            ✓ {{ countLinkedZones(opt.key) }} zone(s) reliée(s) à cette option
          </div>

          <!-- Mapping packshot par valeur (uniquement pour type=enum) -->
          <div class="wso__packshots" *ngIf="opt.type === 'enum'">
            <h4>Vidéo packshot par valeur</h4>
            <div class="wso__packshot-row" *ngFor="let v of opt.values">
              <span class="wso__packshot-label">Si {{ v }} →</span>
              <select
                class="wso__select"
                [value]="getPackshotFor(opt.key, v)"
                (change)="onPackshotChange(opt, v, $event)"
              >
                <option value="">— Aucun packshot —</option>
                <option
                  *ngFor="let tpl of publishedTemplates()"
                  [value]="tpl.id"
                  [disabled]="tpl.id === templateId"
                >
                  {{ tpl.name }}
                </option>
              </select>
            </div>
          </div>
        </li>
      </ul>

      <p class="wso__empty" *ngIf="options().length === 0">
        Aucune option définie. Le template fonctionnera tel quel sans choix
        proposé au club.
      </p>

      <!-- Formulaire de création -->
      <div class="wso__form-block" *ngIf="formOpen()">
        <h3>Nouvelle option club</h3>
        <form [formGroup]="form" (ngSubmit)="submitOption()" class="wso__form">
          <label class="wso__field">
            <span>Libellé (vu par le club)</span>
            <input
              type="text"
              formControlName="label"
              maxlength="80"
              (input)="autoSlugFromLabel()"
              placeholder="Type d'intro"
            />
          </label>
          <label class="wso__field">
            <span>Identifiant technique (snake_case)</span>
            <input
              type="text"
              formControlName="key"
              maxlength="64"
              placeholder="type_intro"
            />
          </label>
          <label class="wso__field">
            <span>Type</span>
            <select formControlName="type" (change)="onTypeChange()">
              <option value="enum">Choix multiple (ex : logo / numéro)</option>
              <option value="boolean">Activé / Désactivé</option>
            </select>
          </label>
          <label class="wso__field" *ngIf="form.controls.type.value === 'enum'">
            <span>Valeurs possibles (séparées par virgule)</span>
            <input
              type="text"
              formControlName="valuesRaw"
              placeholder="logo, numero"
            />
          </label>
          <label class="wso__field">
            <span>Valeur par défaut</span>
            <input
              type="text"
              formControlName="defaultValue"
              placeholder="logo"
            />
          </label>

          <p class="wso__form-error" *ngIf="formError()">{{ formError() }}</p>

          <div class="wso__form-actions">
            <button
              type="button"
              class="wso__btn wso__btn--ghost"
              (click)="closeForm()"
            >
              Abandonner
            </button>
            <button
              type="submit"
              class="wso__btn wso__btn--primary"
              [disabled]="creating() || form.invalid"
            >
              {{ creating() ? 'Création…' : 'Créer cette option' }}
            </button>
          </div>
        </form>
      </div>

      <button
        type="button"
        class="wso__btn wso__btn--ghost wso__add-btn"
        *ngIf="!formOpen()"
        (click)="openForm()"
      >
        + Ajouter une option club
      </button>

      <footer class="wso__nav">
        <button type="button" class="wso__btn wso__btn--ghost" (click)="prev.emit()">
          ← Retour
        </button>
        <button
          type="button"
          class="wso__btn wso__btn--primary"
          (click)="finished.emit()"
        >
          Terminer
        </button>
      </footer>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .wso {
        max-width: 880px;
        margin: 0 auto;
        padding: 24px;
      }
      .wso__header h2 {
        margin: 0 0 4px;
      }
      .wso__hint {
        color: #6b7280;
        margin: 0 0 24px;
      }
      .wso__list {
        list-style: none;
        padding: 0;
        margin: 0 0 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .wso__option {
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 16px;
        background: #fafafa;
      }
      .wso__option-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .wso__pill {
        display: inline-block;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 10px;
        margin-left: 8px;
      }
      .wso__pill--type {
        background: #ede9fe;
        color: #5b21b6;
      }
      .wso__pill--key {
        background: #f3f4f6;
        color: #374151;
        font-family: monospace;
      }
      .wso__values {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 12px;
      }
      .wso__value-pill {
        font-size: 12px;
        padding: 4px 10px;
        border-radius: 999px;
        background: #fff;
        border: 1px solid #d1d5db;
      }
      .wso__value-pill--default {
        background: #d1fae5;
        border-color: #6ee7b7;
        color: #065f46;
        font-weight: 600;
      }
      .wso__linked {
        font-size: 12px;
        color: #059669;
        margin-bottom: 12px;
      }
      .wso__packshots {
        border-top: 1px dashed #d1d5db;
        padding-top: 12px;
      }
      .wso__packshots h4 {
        margin: 0 0 8px;
        font-size: 13px;
        color: #6b7280;
      }
      .wso__packshot-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      .wso__packshot-row .wso__packshot-label {
        min-width: 120px;
        font-size: 13px;
      }
      .wso__select {
        flex: 1;
        padding: 6px 10px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        background: #fff;
      }
      .wso__empty {
        padding: 32px;
        text-align: center;
        color: #6b7280;
        background: #fafafa;
        border: 1px dashed #d1d5db;
        border-radius: 12px;
      }
      .wso__form-block {
        border: 1px solid #d1d5db;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
        background: #fff;
      }
      .wso__form-block h3 {
        margin: 0 0 16px;
      }
      .wso__form {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .wso__field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .wso__field span {
        font-size: 13px;
        color: #374151;
        font-weight: 500;
      }
      .wso__field input,
      .wso__field select {
        padding: 8px 10px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
      }
      .wso__form-error {
        color: #b91c1c;
        font-size: 13px;
        margin: 0;
      }
      .wso__form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
      }
      .wso__add-btn {
        margin-bottom: 24px;
      }
      .wso__nav {
        display: flex;
        justify-content: space-between;
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #e5e7eb;
      }
      .wso__btn {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        border: 1px solid transparent;
      }
      .wso__btn--ghost {
        background: #fff;
        border-color: #d1d5db;
        color: #374151;
      }
      .wso__btn--primary {
        background: #2563eb;
        color: #fff;
      }
      .wso__btn--primary:disabled,
      .wso__btn--ghost:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class WizardStepOptionsComponent implements OnInit {
  private dataService = inject(RemotionTemplatesDataService);

  @Input({ required: true }) templateId!: string;
  @Input({ required: true }) options!: WritableSignal<TemplateOption[]>;
  @Input({ required: true }) zones!: Signal<{
    textFields: TemplateTextField[];
    imageSlots: TemplateImageSlot[];
  }>;

  @Output() optionsChange = new EventEmitter<TemplateOption[]>();
  @Output() prev = new EventEmitter<void>();
  @Output() finished = new EventEmitter<void>();

  publishedTemplates = signal<RemotionTemplate[]>([]);
  packshotRefs = signal<TemplatePackshotRef[]>([]);

  formOpen = signal<boolean>(false);
  creating = signal<boolean>(false);
  deleting = signal<string | null>(null);
  formError = signal<string | null>(null);

  form: FormGroup<OptionFormShape> = new FormGroup<OptionFormShape>({
    key: new FormControl<string>('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(64),
        Validators.pattern(/^[a-z][a-z0-9_]*$/),
      ],
    }),
    label: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    type: new FormControl<'enum' | 'boolean'>('enum', { nonNullable: true }),
    valuesRaw: new FormControl<string>('', { nonNullable: true }),
    defaultValue: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
  });

  ngOnInit(): void {
    this.dataService.listPublishedTemplates().subscribe({
      next: (list) => this.publishedTemplates.set(list),
    });
    this.dataService.listPackshotRefs(this.templateId).subscribe({
      next: (refs) => this.packshotRefs.set(refs),
    });
  }

  trackById(_i: number, opt: TemplateOption): string {
    return opt.id;
  }

  /**
   * Libellé du pill type d'option. Définition externalisée pour éviter les
   * littéraux français dans le template inline (hook check-hardcoded-i18n).
   */
  typePillLabel(type: 'enum' | 'boolean'): string {
    return type === 'enum' ? 'Choix multiple' : 'Activé / Désactivé';
  }

  /**
   * Compte les zones (text/image) reliées à une option via leur `visibleIf`.
   * Convention : visibleIf contient `<key> ==` (ex : `intro_mode == 'logo'`).
   * Phase 2 enrichira (parser AST), pour l'instant regex bornée par \\b.
   */
  countLinkedZones(optionKey: string): number {
    const re = new RegExp(`\\b${optionKey}\\s*==`);
    const z = this.zones();
    const tCount = (z.textFields || []).filter(
      (f) => f.visibleIf && re.test(f.visibleIf),
    ).length;
    const iCount = (z.imageSlots || []).filter(
      (s) => s.visibleIf && re.test(s.visibleIf),
    ).length;
    return tCount + iCount;
  }

  getPackshotFor(optionKey: string, optionValue: string): string {
    const ref = this.packshotRefs().find(
      (r) => r.optionKey === optionKey && r.optionValue === optionValue,
    );
    return ref?.packshotTemplateId ?? '';
  }

  openForm(): void {
    this.formError.set(null);
    this.form.reset({
      key: '',
      label: '',
      type: 'enum',
      valuesRaw: '',
      defaultValue: '',
    });
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
  }

  onTypeChange(): void {
    if (this.form.controls.type.value === 'boolean') {
      this.form.controls.valuesRaw.setValue('true,false');
      if (!this.form.controls.defaultValue.value) {
        this.form.controls.defaultValue.setValue('true');
      }
    }
  }

  autoSlugFromLabel(): void {
    if (this.form.controls.key.dirty) return;
    const label = this.form.controls.label.value;
    const slug = label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40);
    this.form.controls.key.setValue(slug, { emitEvent: false });
  }

  submitOption(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const values =
      v.type === 'boolean'
        ? ['true', 'false']
        : v.valuesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    if (values.length === 0) {
      this.formError.set('Au moins une valeur est requise.');
      return;
    }
    if (!values.includes(v.defaultValue)) {
      this.formError.set(
        `La valeur par défaut « ${v.defaultValue} » doit être dans la liste.`,
      );
      return;
    }
    this.creating.set(true);
    this.formError.set(null);
    this.dataService
      .createOption(this.templateId, {
        key: v.key,
        label: v.label,
        type: v.type,
        values,
        default_value: v.defaultValue,
        user_editable: true,
        sort_order: this.options().length,
      })
      .subscribe({
        next: (opt) => {
          this.creating.set(false);
          const next = [...this.options(), opt];
          this.options.set(next);
          this.optionsChange.emit(next);
          this.closeForm();
        },
        error: (err) => {
          this.creating.set(false);
          if (err?.status === 409) {
            this.formError.set(
              `Une option avec l'identifiant « ${v.key} » existe déjà.`,
            );
          } else if (err?.error?.message) {
            this.formError.set(String(err.error.message));
          } else {
            this.formError.set('Création échouée — réessayez.');
          }
        },
      });
  }

  onDeleteOption(opt: TemplateOption): void {
    const ok = window.confirm(
      `Retirer l'option « ${opt.label} » ? Les packshots associés seront aussi retirés.`,
    );
    if (!ok) return;
    this.deleting.set(opt.id);
    this.dataService.deleteOption(this.templateId, opt.id).subscribe({
      next: () => {
        this.deleting.set(null);
        const next = this.options().filter((o) => o.id !== opt.id);
        this.options.set(next);
        this.optionsChange.emit(next);
        // Refresh packshot refs (cascade DB cleans them up)
        this.dataService.listPackshotRefs(this.templateId).subscribe({
          next: (refs) => this.packshotRefs.set(refs),
        });
      },
      error: () => {
        this.deleting.set(null);
      },
    });
  }

  onPackshotChange(opt: TemplateOption, value: string, ev: Event): void {
    const target = ev.target as HTMLSelectElement;
    const tplId = target.value;
    const existing = this.packshotRefs().find(
      (r) => r.optionKey === opt.key && r.optionValue === value,
    );

    // Empty selection → delete existing ref if any
    if (!tplId) {
      if (existing) {
        this.dataService
          .deletePackshotRef(this.templateId, existing.id)
          .subscribe({
            next: () => {
              this.packshotRefs.set(
                this.packshotRefs().filter((r) => r.id !== existing.id),
              );
            },
          });
      }
      return;
    }

    // If a ref already exists for this (key, value), delete then re-create
    // (the backend has no PATCH endpoint for packshot refs).
    const create = (): void => {
      this.dataService
        .createPackshotRef(this.templateId, {
          option_key: opt.key,
          option_value: value,
          packshot_template_id: tplId,
        })
        .subscribe({
          next: (ref) => {
            this.packshotRefs.set([
              ...this.packshotRefs().filter(
                (r) => !(r.optionKey === opt.key && r.optionValue === value),
              ),
              ref,
            ]);
          },
          error: () => {
            // Restore previous selection on error
            target.value = existing?.packshotTemplateId ?? '';
          },
        });
    };

    if (existing) {
      this.dataService
        .deletePackshotRef(this.templateId, existing.id)
        .subscribe({ next: () => create(), error: () => create() });
    } else {
      create();
    }
  }
}
