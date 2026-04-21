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
import type {
  TemplateImageSlotUpdate,
  TemplateTextFieldUpdate,
} from '../../remotion-templates-data.service';

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
 * ADR-075 — Polices curated chargées côté dashboard.
 * - Google Fonts : chargées via `<link>` dans `index.html`
 * - Custom (Bulevar, General Sans) : chargées via @font-face dans `styles.scss`
 * Pour ajouter une Google Font : (1) ajouter ici, (2) ajouter au `<link>` dans
 * `index.html`, (3) s'assurer que le worker Remotion la charge aussi.
 * Pour ajouter une custom : (1) ajouter ici, (2) copier le fichier OTF dans
 * `templates-remotion/public/` + `central-dashboard/src/assets/fonts/`,
 * (3) ajouter l'@font-face dans `fonts.ts` (Remotion) et `styles.scss` (dashboard).
 */
const FONT_FAMILIES = [
  // Custom — OTF locales (non-Google)
  'Bulevar',
  'General Sans',
  // Display / impact (titres)
  'Anton',
  'Bebas Neue',
  'Oswald',
  'Teko',
  'Archivo Black',
  'Russo One',
  'Staatliches',
  'Bungee',
  'Abril Fatface',
  // Sans-serif modernes
  'Inter',
  'Roboto',
  'Montserrat',
  'Poppins',
  'Open Sans',
  'Raleway',
  'Work Sans',
  'Barlow',
  'DM Sans',
  'Nunito',
  'Figtree',
  // Serif élégants
  'Playfair Display',
  'Lora',
  'Merriweather',
  'Cormorant Garamond',
  // Monospace / tech
  'JetBrains Mono',
  'Space Mono',
  // Scripts / fun
  'Pacifico',
  'Caveat',
  'Permanent Marker',
] as const;

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

      <section class="afe__section" *ngIf="f.kind === 'text'">
        <h5>Visibilité</h5>
        <label class="afe__checkbox">
          <input type="checkbox" [(ngModel)]="$any(f.value).alwaysVisible" (change)="emitPatch()" />
          Toujours visible (sans timecode)
        </label>
      </section>

      <section class="afe__section" *ngIf="f.kind !== 'text' || !$any(f.value).alwaysVisible">
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

      <section class="afe__section" *ngIf="f.kind === 'text' && $any(f.value).animation === 'scale-in'">
        <h5>Scale-in</h5>
        <label>Départ
          <input type="number" step="0.05" min="0" max="5"
                 [(ngModel)]="$any(f.value).scaleFrom" (change)="emitPatch()" />
        </label>
        <label>Arrivée
          <input type="number" step="0.05" min="0" max="5"
                 [(ngModel)]="$any(f.value).scaleTo" (change)="emitPatch()" />
        </label>
      </section>

      <section class="afe__section" *ngIf="f.kind === 'text'">
        <h5>Typographie</h5>
        <label>fontFamily
          <select [(ngModel)]="$any(f.value).fontFamily" (change)="emitPatch()">
            <option *ngFor="let ff of fontFamilies" [value]="ff" [style.fontFamily]="ff">
              {{ ff }}
            </option>
          </select>
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
    .afe__checkbox { flex-direction: row !important; align-items: center; gap: 6px !important; cursor: pointer; }
    .afe__checkbox input[type="checkbox"] { width: 14px; height: 14px; padding: 0; cursor: pointer; }
    .afe__footer { display: flex; justify-content: flex-end; }
    .afe__delete { padding: 4px 10px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .afe__delete:hover { background: #fee2e2; }
  `],
})
export class AdminFieldEditorComponent {
  @Input({ required: true }) field!: EditableField;
  @Output() patch = new EventEmitter<
    TemplateTextFieldUpdate | TemplateImageSlotUpdate
  >();
  @Output() delete = new EventEmitter<void>();

  readonly animations = ANIMATIONS;
  readonly fontFamilies = FONT_FAMILIES;

  emitPatch(): void {
    if (this.field.kind === 'text') {
      const v = this.field.value;
      const patch: TemplateTextFieldUpdate = stripNullish({
        slotKey: v.slotKey,
        label: v.label,
        positionX: v.position.x,
        positionY: v.position.y,
        maxWidth: v.maxWidth,
        fontFamily: v.fontFamily,
        fontSize: v.fontSize,
        color: v.color,
        align: v.align,
        appearAt: v.appearAt,
        appearDuration: v.appearDuration,
        animation: v.animation,
        defaultValue: v.defaultValue,
        // maxChars: serveur accepte null explicitement (Joi `.allow(null)`)
        maxChars: v.maxChars ?? null,
        multiline: v.multiline,
        required: v.required,
        sortOrder: v.sortOrder,
        alwaysVisible: v.alwaysVisible,
        scaleFrom: v.scaleFrom,
        scaleTo: v.scaleTo,
      }, ['maxChars']);
      this.patch.emit(patch);
    } else {
      const v = this.field.value;
      const patch: TemplateImageSlotUpdate = stripNullish({
        slotKey: v.slotKey,
        label: v.label,
        positionX: v.position.x,
        positionY: v.position.y,
        width: v.position.width,
        height: v.position.height,
        appearAt: v.appearAt,
        appearDuration: v.appearDuration,
        animation: v.animation,
        // aspectRatio: serveur accepte null/'' explicitement
        aspectRatio: v.aspectRatio ?? null,
        required: v.required,
        sortOrder: v.sortOrder,
      }, ['aspectRatio']);
      this.patch.emit(patch);
    }
  }
}

/**
 * Les schémas Joi PATCH n'autorisent pas `null` sur la plupart des champs
 * (seulement `maxChars` / `aspectRatio`). Les colonnes DB étant nullable, un
 * template existant peut avoir `color: null`, `fontFamily: null`, etc. Sans
 * ce filtre, chaque frappe renvoyait un 400 car le payload contenait des
 * `null` interdits. On préserve les clés whitelist (qui autorisent null).
 */
function stripNullish<T extends Record<string, unknown>>(
  obj: T,
  keepNullKeys: ReadonlyArray<keyof T> = [],
): T {
  const out: Record<string, unknown> = {};
  const keepSet = new Set<string>(keepNullKeys as ReadonlyArray<string>);
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v === null && !keepSet.has(k)) continue;
    out[k] = v;
  }
  return out as T;
}
