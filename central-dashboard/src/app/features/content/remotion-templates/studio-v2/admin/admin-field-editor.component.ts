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
  Anchor,
  AnimationPreset,
  FitMode,
  Overflow,
  TemplateImageSlot,
  TemplateLayer,
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
  'zoom',
  'logo-pop',
];

const ANCHORS: Anchor[] = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const FIT_MODES: FitMode[] = [
  'contain', 'cover', 'fill-width-anchor-top', 'fill-height-anchor-left',
];

const OVERFLOWS: Overflow[] = [
  'hidden', 'visible', 'top', 'bottom', 'left', 'right',
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
        <input
          class="afe__label"
          type="text"
          [(ngModel)]="f.value.label"
          (change)="emitPatch()"
          placeholder="Libellé"
          [attr.data-testid]="'admin-field-label-' + f.value.slotKey"
        />
        <code class="afe__key" title="Identifiant technique (slotKey)">{{ f.value.slotKey }}</code>
      </header>

      <section class="afe__section">
        <h5>Position</h5>
        <label>X (% horizontal)
          <input type="number" step="0.01" min="0" max="1"
                 [(ngModel)]="f.value.position.x" (change)="emitPatch()" />
        </label>
        <label>Y (% vertical)
          <input type="number" step="0.01" min="0" max="1"
                 [(ngModel)]="f.value.position.y" (change)="emitPatch()" />
        </label>
        <ng-container *ngIf="f.kind === 'image'">
          <label>Largeur (% canvas)
            <input type="number" step="0.01" min="0" max="1"
                   [(ngModel)]="$any(f.value).position.width" (change)="emitPatch()" />
          </label>
          <label>Hauteur (% canvas)
            <input type="number" step="0.01" min="0" max="1"
                   [(ngModel)]="$any(f.value).position.height" (change)="emitPatch()" />
          </label>
        </ng-container>
        <label *ngIf="f.kind === 'text'">Largeur max (% canvas)
          <input type="number" step="0.01" min="0" max="1"
                 [(ngModel)]="$any(f.value).maxWidth" (change)="emitPatch()" />
        </label>
        <p class="afe__hint">Astuce : glissez le slot sur le canvas pour positionner visuellement.</p>
      </section>

      <section class="afe__section" *ngIf="f.kind === 'text'">
        <h5>Visibilité</h5>
        <label class="afe__checkbox">
          <input type="checkbox" [(ngModel)]="$any(f.value).alwaysVisible" (change)="emitPatch()" />
          Toujours visible (ignore le timing)
        </label>
      </section>

      <section class="afe__section" *ngIf="f.kind !== 'text' || !$any(f.value).alwaysVisible">
        <h5>Timing</h5>
        <label>Apparition (s)
          <input type="number" step="0.1" [(ngModel)]="f.value.appearAt" (change)="emitPatch()" />
        </label>
        <label>Durée d'animation (s)
          <input type="number" step="0.1" [(ngModel)]="f.value.appearDuration" (change)="emitPatch()" />
        </label>
      </section>

      <section class="afe__section">
        <h5>Animation d'apparition</h5>
        <select [(ngModel)]="f.value.animation" (change)="emitPatch()">
          <option *ngFor="let a of animations" [value]="a">{{ a }}</option>
        </select>
      </section>

      <section class="afe__section"
               *ngIf="$any(f.value).animation === 'scale-in' ||
                      $any(f.value).animation === 'zoom' ||
                      $any(f.value).animation === 'logo-pop'">
        <h5>Échelle</h5>
        <label>Départ (ex. 0.7 = absent)
          <input type="number" step="0.05" min="0" max="5"
                 [(ngModel)]="$any(f.value).scaleFrom" (change)="emitPatch()" />
        </label>
        <label>Arrivée (ex. 1 = taille finale)
          <input type="number" step="0.05" min="0" max="5"
                 [(ngModel)]="$any(f.value).scaleTo" (change)="emitPatch()" />
        </label>
      </section>

      <!-- ADR-086 — Layer parent + direction animation -->
      <section class="afe__section" *ngIf="layers?.length">
        <h5>Calque parent</h5>
        <label>Calque
          <select [(ngModel)]="$any(f.value).layerId" (change)="emitPatch()">
            <option [ngValue]="null">— Aucun (timing autonome) —</option>
            <option *ngFor="let l of layers" [ngValue]="l.id">
              z{{ l.zIndex }} · {{ l.name }}
            </option>
          </select>
        </label>
        <label>Direction
          <select [(ngModel)]="$any(f.value).animationDirection" (change)="emitPatch()">
            <option value="in">Arrivée (in)</option>
            <option value="out">Sortie (out)</option>
          </select>
        </label>
        <label *ngIf="f.kind === 'text'" class="afe__checkbox">
          <input type="checkbox" [(ngModel)]="$any(f.value).respectAlpha"
                 [disabled]="!$any(f.value).layerId" (change)="emitPatch()" />
          Respecter l'alpha du calque (rendu sous)
        </label>
      </section>

      <!-- ADR-086 — Safe-zone image -->
      <section class="afe__section" *ngIf="f.kind === 'image'">
        <h5>Zone sûre & cadrage</h5>
        <label>Ancre
          <select [(ngModel)]="$any(f.value).anchor" (change)="emitPatch()">
            <option *ngFor="let a of anchors" [value]="a">{{ a }}</option>
          </select>
        </label>
        <label>Mode de cadrage
          <select [(ngModel)]="$any(f.value).fitMode" (change)="emitPatch()">
            <option *ngFor="let m of fitModes" [value]="m">{{ m }}</option>
          </select>
        </label>
        <label>Débordement
          <select [(ngModel)]="$any(f.value).overflow" (change)="emitPatch()">
            <option *ngFor="let o of overflows" [value]="o">{{ o }}</option>
          </select>
        </label>
        <label>Zone sûre — haut (%)
          <input type="number" step="0.5" min="0" max="100"
                 [(ngModel)]="$any(f.value).safeTopPct" (change)="emitPatch()" />
        </label>
        <label>Zone sûre — gauche (%)
          <input type="number" step="0.5" min="0" max="100"
                 [(ngModel)]="$any(f.value).safeLeftPct" (change)="emitPatch()" />
        </label>
        <label>Zone sûre — largeur (%)
          <input type="number" step="0.5" min="0" max="100"
                 [(ngModel)]="$any(f.value).safeWidthPct" (change)="emitPatch()" />
        </label>
        <label>Zone sûre — hauteur (%)
          <input type="number" step="0.5" min="0" max="100"
                 [(ngModel)]="$any(f.value).safeHeightPct" (change)="emitPatch()" />
        </label>
      </section>

      <section class="afe__section" *ngIf="f.kind === 'text'">
        <h5>Typographie</h5>
        <label>Police
          <select [(ngModel)]="$any(f.value).fontFamily" (change)="emitPatch()">
            <option *ngFor="let ff of fontFamilies" [value]="ff" [style.fontFamily]="ff">
              {{ ff }}
            </option>
          </select>
        </label>
        <label>Taille (px)
          <input type="number" min="8" max="400"
                 [(ngModel)]="$any(f.value).fontSize" (change)="emitPatch()" />
        </label>
        <label>Couleur
          <input type="color" [(ngModel)]="$any(f.value).color" (change)="emitPatch()" />
        </label>
        <label>Alignement
          <select [(ngModel)]="$any(f.value).align" (change)="emitPatch()">
            <option value="left">Gauche</option>
            <option value="center">Centre</option>
            <option value="right">Droite</option>
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
    .afe__kind { padding: 2px 8px; font-size: 11px; border-radius: 3px; background: #ede9fe; color: #6d28d9; flex-shrink: 0; }
    .afe__label { flex: 1 1 auto; min-width: 0; padding: 4px 8px; font-size: 13px; font-weight: 600; color: #111827; border: 1px solid transparent; border-radius: 4px; background: transparent; }
    .afe__label:hover { border-color: #d1d5db; background: #f9fafb; }
    .afe__label:focus { outline: none; border-color: #6d28d9; background: #fff; box-shadow: 0 0 0 2px rgba(109, 40, 217, 0.15); }
    .afe__key { font-size: 10px; color: #9ca3af; font-family: monospace; flex-shrink: 0; cursor: help; }
    .afe__hint { flex-basis: 100%; margin: 4px 0 0; font-size: 11px; color: #6b7280; font-style: italic; }
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
  @Input() layers: TemplateLayer[] | null = null;
  @Output() patch = new EventEmitter<
    TemplateTextFieldUpdate | TemplateImageSlotUpdate
  >();
  @Output() delete = new EventEmitter<void>();

  readonly animations = ANIMATIONS;
  readonly fontFamilies = FONT_FAMILIES;
  readonly anchors = ANCHORS;
  readonly fitModes = FIT_MODES;
  readonly overflows = OVERFLOWS;

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
        // ADR-086 — layerId est NOT NULL côté serveur, on n'envoie pas de null
        layerId: v.layerId ?? undefined,
        respectAlpha: v.respectAlpha,
        animationDirection: v.animationDirection,
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
        // ADR-086 — null autorisé (Joi .allow(null))
        layerId: v.layerId,
        anchor: v.anchor,
        fitMode: v.fitMode,
        safeTopPct: v.safeTopPct,
        safeLeftPct: v.safeLeftPct,
        safeWidthPct: v.safeWidthPct,
        safeHeightPct: v.safeHeightPct,
        overflow: v.overflow,
        animationDirection: v.animationDirection,
        scaleFrom: v.scaleFrom,
        scaleTo: v.scaleTo,
      }, [...(['aspectRatio'] as const), ...IMAGE_ADR086_NULLABLE_KEYS]);
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
/** ADR-086 — keys where Joi explicitly `.allow(null)` on image slots. */
const IMAGE_ADR086_NULLABLE_KEYS = [
  'layerId',
  'safeTopPct', 'safeLeftPct', 'safeWidthPct', 'safeHeightPct',
  'scaleFrom', 'scaleTo',
] as const;

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
