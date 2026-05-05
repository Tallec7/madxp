/**
 * Template Studio v3 — Step 3 (Zones modifiables) — ADR-110 / WIZARD-05.
 *
 * Two sub-tabs (Zones texte / Zones image) with ReactiveForms-driven
 * creation of zones. Each zone has a MANDATORY layer_id (ADR-086 invariant
 * — `template_text_fields.layer_id` and `template_image_slots.layer_id`
 * are NOT NULL). The "Ajouter" button is disabled while `layers().length === 0`
 * (Pitfall P1 hard gate at the UI level — backend Joi already rejects null
 * layerId in plan 04).
 *
 * SAFE_ZONE_PRESETS keys MUST match the `template_image_slots.fit_mode`
 * CHECK constraint (full-schema.sql L2773): contain | cover |
 * fill-width-anchor-top | fill-height-anchor-left. The anchor is inferred
 * from the preset semantics (top-center for fill-width-anchor-top, etc.).
 *
 * Vocabulary: « Zone modifiable » / « Zone texte » / « Zone image » /
 * « Fond animé parent » / « Police » / « Limite caractères » /
 * « Quand cette zone apparaît » / « Zone sûre & cadrage » (Plan 01 frozen).
 *
 * Form state lives in this component (ReactiveForms is a transient editor —
 * the parent only owns the persisted lists). The lists themselves come from
 * the parent as `WritableSignal` inputs (Plan 03 lift pattern).
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  WritableSignal,
  computed,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { debounceTime } from 'rxjs/operators';

import { RemotionTemplatesDataService } from '../../remotion-templates-data.service';
import type {
  AnimationDirection,
  AnimationPreset,
  TemplateImageSlot,
  TemplateLayer,
  TemplateTextField,
} from '../../remotion-templates.types';
import {
  AnimationPickerComponent,
  type AnimationValue,
} from './animation-picker.component';

/**
 * Hardcoded font list — `template_fonts` table does not yet exist (cf.
 * .claude/rules/templates.md note). Mirrors the v2 admin-field-editor list.
 */
const FONT_FAMILIES = [
  'Anton',
  'Bebas Neue',
  'Montserrat',
  'Roboto',
  'Inter',
  'Oswald',
] as const;

/**
 * Safe-zone presets — keys MUST match `template_image_slots.fit_mode` CHECK
 * (full-schema.sql L2773). Anchor is inferred from preset semantics and
 * MUST match the `template_image_slots.anchor` 9-value CHECK.
 */
const SAFE_ZONE_PRESETS = [
  {
    key: 'fill-width-anchor-top',
    label: 'Photo en haut, déborde en bas',
    anchor: 'top-center',
  },
  {
    key: 'fill-height-anchor-left',
    label: 'Image plein cadre ancrée à gauche',
    anchor: 'center-left',
  },
  { key: 'contain', label: 'Logo centré (contain)', anchor: 'center' },
  { key: 'cover', label: 'Image plein cadre (cover)', anchor: 'center' },
] as const;

type SafeZonePresetKey = (typeof SAFE_ZONE_PRESETS)[number]['key'];

interface TextZoneFormShape {
  layerId: FormControl<string | null>;
  label: FormControl<string>;
  fontFamily: FormControl<string>;
  fontSize: FormControl<number>;
  color: FormControl<string>;
  textAlign: FormControl<'left' | 'center' | 'right'>;
  maxChars: FormControl<number>;
  visibleIf: FormControl<string>;
  animation: FormControl<AnimationValue>;
}

interface ImageZoneFormShape {
  layerId: FormControl<string | null>;
  label: FormControl<string>;
  safeZonePreset: FormControl<SafeZonePresetKey>;
  visibleIf: FormControl<string>;
  animation: FormControl<AnimationValue>;
}

/**
 * Plan 02-03 — Map AnimationValue (UI shape) to backend payload (separate
 * `animation` preset string + `animationDirection`). Backend supports
 * `'none'` as a preset (= "Aucune animation") so null values map to
 * `{ animation: 'none' }` — no schema changes needed (cf. AnimationPreset
 * union in remotion-templates.types.ts).
 */
function mapAnimationToPayload(
  v: AnimationValue,
): { animation: AnimationPreset; animationDirection?: AnimationDirection } {
  if (!v) return { animation: 'none' };
  if (v.preset === 'logo-pop') return { animation: 'logo-pop' };
  return { animation: v.preset, animationDirection: v.direction };
}

@Component({
  selector: 'app-wizard-step-zones',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AnimationPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wsz">
      <header class="wsz__header">
        <h2>Étape 3 — Zones modifiables</h2>
        <p class="wsz__hint">
          Ajoutez les zones que le club pourra remplir : zones texte (nom,
          score) ou zones image (logo, photo joueur). Chaque zone est
          rattachée à un fond animé parent.
        </p>
      </header>

      <div class="wsz__tabs">
        <button
          type="button"
          class="wsz__tab"
          [class.wsz__tab--active]="tab() === 'text'"
          (click)="tab.set('text')"
        >
          Zones texte ({{ textFields().length }})
        </button>
        <button
          type="button"
          class="wsz__tab"
          [class.wsz__tab--active]="tab() === 'image'"
          (click)="tab.set('image')"
        >
          Zones image ({{ imageSlots().length }})
        </button>
      </div>

      <p *ngIf="layers().length === 0" class="wsz__warn" role="alert">
        Ajoutez au moins 1 fond animé à l'étape 2 avant de créer des zones.
      </p>

      <!-- ── Zones texte ────────────────────────────────────────────── -->
      <section *ngIf="tab() === 'text'" class="wsz__pane">
        <ul class="wsz__list" *ngIf="textFields().length > 0">
          <li
            *ngFor="let tf of textFields(); trackBy: trackById"
            class="wsz__item"
          >
            <span class="wsz__item-label">{{ tf.label }}</span>
            <span class="wsz__item-meta"
              >Police: {{ tf.fontFamily }} · Taille:
              {{ tf.fontSize }}px</span
            >
            <button
              type="button"
              class="wsz__item-del"
              (click)="onDeleteText(tf)"
              [disabled]="deleting() === tf.id"
            >
              ×
            </button>
          </li>
        </ul>

        <button
          *ngIf="!showTextForm()"
          type="button"
          class="wsz__add"
          [disabled]="layers().length === 0"
          (click)="openTextForm()"
        >
          + Ajouter une zone texte
        </button>

        <form
          *ngIf="showTextForm()"
          [formGroup]="textForm"
          (ngSubmit)="submitText()"
          class="wsz__form"
        >
          <label class="wsz__field">
            <span>Fond animé parent</span>
            <select formControlName="layerId">
              <option *ngFor="let l of layers()" [value]="l.id">
                {{ l.name || 'Fond sans nom' }}
              </option>
            </select>
          </label>

          <label class="wsz__field">
            <span>Libellé</span>
            <input
              type="text"
              formControlName="label"
              maxlength="80"
              (blur)="previewPropsChange.emit()"
            />
          </label>

          <div class="wsz__row">
            <label class="wsz__field">
              <span>Police</span>
              <select formControlName="fontFamily">
                <option *ngFor="let f of fonts" [value]="f">{{ f }}</option>
              </select>
            </label>
            <label class="wsz__field">
              <span>Taille (px)</span>
              <input
                type="number"
                formControlName="fontSize"
                min="12"
                max="200"
              />
            </label>
            <label class="wsz__field">
              <span>Couleur</span>
              <input type="color" formControlName="color" />
            </label>
          </div>

          <div class="wsz__row">
            <label class="wsz__field">
              <span>Alignement</span>
              <select formControlName="textAlign">
                <option value="left">Gauche</option>
                <option value="center">Centre</option>
                <option value="right">Droite</option>
              </select>
            </label>
            <label class="wsz__field">
              <span>Limite caractères</span>
              <input
                type="number"
                formControlName="maxChars"
                min="1"
                max="200"
              />
            </label>
          </div>

          <label class="wsz__field">
            <span>Quand cette zone apparaît (optionnel)</span>
            <input
              type="text"
              formControlName="visibleIf"
              placeholder='ex: profil == "match"'
              (blur)="previewPropsChange.emit()"
            />
          </label>

          <div class="wsz__field">
            <span>Animation</span>
            <app-animation-picker
              [value]="textForm.controls.animation.value"
              (valueChange)="onAnimationChange('text', $event)"
            />
          </div>

          <div class="wsz__form-actions">
            <button
              type="button"
              class="btn"
              (click)="closeTextForm()"
              [disabled]="creating()"
            >
              Abandonner
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="textForm.invalid || creating()"
            >
              Créer la zone
            </button>
          </div>
        </form>
      </section>

      <!-- ── Zones image ────────────────────────────────────────────── -->
      <section *ngIf="tab() === 'image'" class="wsz__pane">
        <ul class="wsz__list" *ngIf="imageSlots().length > 0">
          <li
            *ngFor="let s of imageSlots(); trackBy: trackById"
            class="wsz__item"
          >
            <span class="wsz__item-label">{{ s.label }}</span>
            <span class="wsz__item-meta"
              >Cadrage: {{ s.fitMode }} · Ancre: {{ s.anchor }}</span
            >
            <button
              type="button"
              class="wsz__item-del"
              (click)="onDeleteImage(s)"
              [disabled]="deleting() === s.id"
            >
              ×
            </button>
          </li>
        </ul>

        <button
          *ngIf="!showImageForm()"
          type="button"
          class="wsz__add"
          [disabled]="layers().length === 0"
          (click)="openImageForm()"
        >
          + Ajouter une zone image
        </button>

        <form
          *ngIf="showImageForm()"
          [formGroup]="imageForm"
          (ngSubmit)="submitImage()"
          class="wsz__form"
        >
          <label class="wsz__field">
            <span>Fond animé parent</span>
            <select formControlName="layerId">
              <option *ngFor="let l of layers()" [value]="l.id">
                {{ l.name || 'Fond sans nom' }}
              </option>
            </select>
          </label>

          <label class="wsz__field">
            <span>Libellé</span>
            <input
              type="text"
              formControlName="label"
              maxlength="80"
              (blur)="previewPropsChange.emit()"
            />
          </label>

          <label class="wsz__field">
            <span>Zone sûre & cadrage</span>
            <select formControlName="safeZonePreset">
              <option *ngFor="let p of presets" [value]="p.key">
                {{ p.label }}
              </option>
            </select>
          </label>

          <label class="wsz__field">
            <span>Quand cette zone apparaît (optionnel)</span>
            <input
              type="text"
              formControlName="visibleIf"
              placeholder='ex: profil == "match"'
              (blur)="previewPropsChange.emit()"
            />
          </label>

          <div class="wsz__field">
            <span>Animation</span>
            <app-animation-picker
              [value]="imageForm.controls.animation.value"
              (valueChange)="onAnimationChange('image', $event)"
            />
          </div>

          <div class="wsz__form-actions">
            <button
              type="button"
              class="btn"
              (click)="closeImageForm()"
              [disabled]="creating()"
            >
              Abandonner
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="imageForm.invalid || creating()"
            >
              Créer la zone
            </button>
          </div>
        </form>
      </section>

      <p *ngIf="errorMsg()" class="wsz__error" role="alert">{{ errorMsg() }}</p>

      <footer class="wsz__nav">
        <button type="button" class="btn" (click)="prev.emit()">← Retour</button>
        <button
          type="button"
          class="btn btn-primary"
          (click)="next.emit()"
        >
          Continuer →
        </button>
      </footer>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .wsz {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .wsz__header h2 {
        margin: 0 0 0.25rem;
        font-size: 1.4rem;
      }
      .wsz__hint {
        margin: 0;
        color: #6b7280;
        font-size: 0.92rem;
      }
      .wsz__tabs {
        display: flex;
        gap: 0.5rem;
        border-bottom: 1px solid #e5e7eb;
      }
      .wsz__tab {
        padding: 0.6rem 1rem;
        background: transparent;
        border: 0;
        border-bottom: 2px solid transparent;
        font-size: 0.95rem;
        cursor: pointer;
        color: #6b7280;
      }
      .wsz__tab--active {
        color: #2563eb;
        border-bottom-color: #2563eb;
      }
      .wsz__warn {
        margin: 0;
        padding: 0.75rem 1rem;
        background: #fef3c7;
        color: #92400e;
        border-left: 3px solid #d97706;
        border-radius: 4px;
        font-size: 0.9rem;
      }
      .wsz__list {
        list-style: none;
        padding: 0;
        margin: 0 0 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .wsz__item {
        display: grid;
        grid-template-columns: 1fr auto 32px;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 0.75rem;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
      }
      .wsz__item-label {
        font-weight: 500;
      }
      .wsz__item-meta {
        font-size: 0.82rem;
        color: #6b7280;
      }
      .wsz__item-del {
        background: transparent;
        border: 0;
        color: #b91c1c;
        font-size: 1.2rem;
        cursor: pointer;
      }
      .wsz__add {
        padding: 0.9rem;
        border: 2px dashed #cbd5e1;
        background: #f8fafc;
        color: #334155;
        border-radius: 8px;
        font-size: 0.95rem;
        cursor: pointer;
      }
      .wsz__add:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .wsz__form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
        background: #f9fafb;
        border-radius: 6px;
      }
      .wsz__field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.88rem;
      }
      .wsz__field span {
        color: #374151;
        font-weight: 500;
      }
      .wsz__field input,
      .wsz__field select {
        padding: 0.5rem 0.6rem;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        font-size: 0.9rem;
        background: #fff;
      }
      .wsz__row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 0.75rem;
      }
      .wsz__form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .wsz__error {
        margin: 0;
        padding: 0.75rem 1rem;
        background: #fee2e2;
        color: #b91c1c;
        border-left: 3px solid #b91c1c;
        border-radius: 4px;
        font-size: 0.9rem;
      }
      .wsz__nav {
        display: flex;
        justify-content: space-between;
        margin-top: 1rem;
      }
      .btn {
        padding: 0.6rem 1.2rem;
        border-radius: 6px;
        border: 1px solid #cbd5e1;
        background: #fff;
        cursor: pointer;
        font-size: 0.95rem;
      }
      .btn-primary {
        background: #2563eb;
        color: #fff;
        border-color: #2563eb;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class WizardStepZonesComponent implements OnInit {
  @Input({ required: true }) templateId!: string;
  @Input({ required: true }) layers!: WritableSignal<TemplateLayer[]>;
  @Input({ required: true }) textFields!: WritableSignal<TemplateTextField[]>;
  @Input({ required: true }) imageSlots!: WritableSignal<TemplateImageSlot[]>;

  @Output() textFieldsChange = new EventEmitter<TemplateTextField[]>();
  @Output() imageSlotsChange = new EventEmitter<TemplateImageSlot[]>();
  @Output() prev = new EventEmitter<void>();
  /** Plan 03 contract — NEVER `submit` (forbidden by no-output-native). */
  @Output() next = new EventEmitter<void>();
  /**
   * Plan 02-02 (PREV-01) — hybrid live preview update:
   * - debounceTime(300) on dropdowns/colors/numbers (visual controls)
   * - (blur) event on text inputs (label, visibleIf) to avoid re-render per keystroke
   * Parent (StudioV3WizardComponent) catches the event and recomputes
   * state.previewState via RemotionPreviewService.buildRuntimePlayerState.
   * Stub here to honor the contract; real wiring lands in Task 3.
   */
  @Output() previewPropsChange = new EventEmitter<void>();

  private dataService = inject(RemotionTemplatesDataService);
  private destroyRef = inject(DestroyRef);

  readonly fonts = FONT_FAMILIES;
  readonly presets = SAFE_ZONE_PRESETS;

  tab = signal<'text' | 'image'>('text');
  showTextForm = signal(false);
  showImageForm = signal(false);
  creating = signal(false);
  deleting = signal<string | null>(null);
  errorMsg = signal<string | null>(null);

  /** Defensive computed used in templates if needed (currently inline). */
  readonly canCreateZone = computed(() => this.layers().length > 0);

  textForm = new FormGroup<TextZoneFormShape>({
    layerId: new FormControl<string | null>(null, {
      validators: [Validators.required],
    }),
    label: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    fontFamily: new FormControl<string>('Anton', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    fontSize: new FormControl<number>(56, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(12), Validators.max(200)],
    }),
    color: new FormControl<string>('#FFFFFF', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    textAlign: new FormControl<'left' | 'center' | 'right'>('center', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    maxChars: new FormControl<number>(40, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(200)],
    }),
    visibleIf: new FormControl<string>('', { nonNullable: true }),
    /** Plan 02-03 / UX-02 — null = "Aucune animation" (mapped to 'none' on submit). */
    animation: new FormControl<AnimationValue>(null),
  });

  imageForm = new FormGroup<ImageZoneFormShape>({
    layerId: new FormControl<string | null>(null, {
      validators: [Validators.required],
    }),
    label: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    safeZonePreset: new FormControl<SafeZonePresetKey>('contain', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    visibleIf: new FormControl<string>('', { nonNullable: true }),
    /** Plan 02-03 / UX-02 — null = "Aucune animation" (mapped to 'none' on submit). */
    animation: new FormControl<AnimationValue>(null),
  });

  /**
   * Plan 02-02 (PREV-01) — Hybrid debounce/blur wiring.
   * Visual controls (dropdowns/colors/numbers) push to the live Player via
   * debounceTime(300). Text inputs (label, visibleIf) use (blur) on the
   * <input> element directly (see template) — avoids re-render per keystroke.
   */
  ngOnInit(): void {
    const emit = (): void => this.previewPropsChange.emit();
    const pipe300 = <T>(ctrl: { valueChanges: import('rxjs').Observable<T> }) =>
      ctrl.valueChanges.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef));

    pipe300(this.textForm.controls.fontFamily).subscribe(emit);
    pipe300(this.textForm.controls.fontSize).subscribe(emit);
    pipe300(this.textForm.controls.color).subscribe(emit);
    pipe300(this.textForm.controls.textAlign).subscribe(emit);
    pipe300(this.textForm.controls.maxChars).subscribe(emit);
    // layerId on both forms is a dropdown — debounce too (visual control).
    pipe300(this.textForm.controls.layerId).subscribe(emit);

    pipe300(this.imageForm.controls.safeZonePreset).subscribe(emit);
    pipe300(this.imageForm.controls.layerId).subscribe(emit);
  }

  trackById(_: number, x: { id: string }): string {
    return x.id;
  }

  /**
   * Plan 02-03 / UX-02 — Animation picker change handler.
   * Updates the active form's animation control (text or image) and emits
   * `previewPropsChange` so the live Player picks up the new motion within
   * the existing hybrid wiring (instant: discrete picker click, no debounce).
   */
  onAnimationChange(scope: 'text' | 'image', value: AnimationValue): void {
    const ctrl =
      scope === 'text'
        ? this.textForm.controls.animation
        : this.imageForm.controls.animation;
    ctrl.setValue(value);
    ctrl.markAsDirty();
    this.previewPropsChange.emit();
  }

  openTextForm(): void {
    this.errorMsg.set(null);
    const firstLayer = this.layers()[0];
    this.textForm.reset({
      layerId: firstLayer?.id ?? null,
      label: '',
      fontFamily: 'Anton',
      fontSize: 56,
      color: '#FFFFFF',
      textAlign: 'center',
      maxChars: 40,
      visibleIf: '',
      animation: null,
    });
    this.showTextForm.set(true);
  }

  closeTextForm(): void {
    this.showTextForm.set(false);
  }

  openImageForm(): void {
    this.errorMsg.set(null);
    const firstLayer = this.layers()[0];
    this.imageForm.reset({
      layerId: firstLayer?.id ?? null,
      label: '',
      safeZonePreset: 'contain',
      visibleIf: '',
      animation: null,
    });
    this.showImageForm.set(true);
  }

  closeImageForm(): void {
    this.showImageForm.set(false);
  }

  /**
   * WIZARD-05 — Create text zone with mandatory layerId. UI guard mirrors
   * Joi server-side guard (Pitfall P1 — orphan zone protection).
   */
  submitText(): void {
    if (this.textForm.invalid) return;
    const v = this.textForm.getRawValue();
    if (!v.layerId) {
      this.errorMsg.set('Sélectionnez un fond animé parent.');
      return;
    }
    this.creating.set(true);
    const anim = mapAnimationToPayload(v.animation);
    this.dataService
      .createTextField(this.templateId, {
        slotKey: `text_${Date.now().toString(36)}`,
        label: v.label,
        positionX: 0.5,
        positionY: 0.5,
        fontFamily: v.fontFamily,
        fontSize: v.fontSize,
        color: v.color,
        align: v.textAlign,
        appearAt: 0,
        maxChars: v.maxChars,
        layerId: v.layerId,
        ...anim,
      })
      .subscribe({
        next: (tf) => {
          // Best-effort: the API doesn't yet accept visibleIf in the payload
          // (Plan 04 backend extends Joi but the existing serializer maps
          // the field via PATCH if needed — out of scope for v1 wizard).
          const merged = [...this.textFields(), tf];
          this.textFields.set(merged);
          this.textFieldsChange.emit(merged);
          this.creating.set(false);
          this.showTextForm.set(false);
        },
        error: (err) => {
          this.creating.set(false);
          this.errorMsg.set(
            err?.error?.message ?? 'La création de la zone texte a échoué.',
          );
        },
      });
  }

  /**
   * WIZARD-05 — Create image zone with mandatory layerId + safe-zone preset
   * mapped to the DB CHECK-valid (anchor, fitMode) couple.
   */
  submitImage(): void {
    if (this.imageForm.invalid) return;
    const v = this.imageForm.getRawValue();
    if (!v.layerId) {
      this.errorMsg.set('Sélectionnez un fond animé parent.');
      return;
    }
    const preset = SAFE_ZONE_PRESETS.find((p) => p.key === v.safeZonePreset);
    if (!preset) {
      this.errorMsg.set('Preset de cadrage invalide.');
      return;
    }
    this.creating.set(true);
    const anim = mapAnimationToPayload(v.animation);
    this.dataService
      .createImageSlot(this.templateId, {
        slotKey: `img_${Date.now().toString(36)}`,
        label: v.label,
        positionX: 0.5,
        positionY: 0.5,
        width: 0.4,
        height: 0.4,
        appearAt: 0,
        layerId: v.layerId,
        anchor: preset.anchor,
        fitMode: preset.key,
        ...anim,
      })
      .subscribe({
        next: (s) => {
          const merged = [...this.imageSlots(), s];
          this.imageSlots.set(merged);
          this.imageSlotsChange.emit(merged);
          this.creating.set(false);
          this.showImageForm.set(false);
        },
        error: (err) => {
          this.creating.set(false);
          this.errorMsg.set(
            err?.error?.message ?? 'La création de la zone image a échoué.',
          );
        },
      });
  }

  onDeleteText(tf: TemplateTextField): void {
    if (!confirm(`Retirer la zone texte « ${tf.label} » ?`)) return;
    this.errorMsg.set(null);
    this.deleting.set(tf.id);
    this.dataService.deleteTextField(this.templateId, tf.id).subscribe({
      next: () => {
        const merged = this.textFields().filter((x) => x.id !== tf.id);
        this.textFields.set(merged);
        this.textFieldsChange.emit(merged);
        this.deleting.set(null);
      },
      error: (err) => {
        this.deleting.set(null);
        this.errorMsg.set(
          err?.error?.message ?? 'La suppression a échoué.',
        );
      },
    });
  }

  onDeleteImage(s: TemplateImageSlot): void {
    if (!confirm(`Retirer la zone image « ${s.label} » ?`)) return;
    this.errorMsg.set(null);
    this.deleting.set(s.id);
    this.dataService.deleteImageSlot(this.templateId, s.id).subscribe({
      next: () => {
        const merged = this.imageSlots().filter((x) => x.id !== s.id);
        this.imageSlots.set(merged);
        this.imageSlotsChange.emit(merged);
        this.deleting.set(null);
      },
      error: (err) => {
        this.deleting.set(null);
        this.errorMsg.set(
          err?.error?.message ?? 'La suppression a échoué.',
        );
      },
    });
  }
}
