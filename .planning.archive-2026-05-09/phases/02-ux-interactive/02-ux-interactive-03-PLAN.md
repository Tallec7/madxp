---
phase: 02-ux-interactive
plan: 03
type: execute
wave: 3
depends_on: [02-ux-interactive-01, 02-ux-interactive-02]
files_modified:
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-card.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-card.component.html
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-card.component.scss
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-picker.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-picker.component.html
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-picker.component.scss
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.html
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts
autonomous: true
requirements: [UX-02]
must_haves:
  truths:
    - "L'admin choisit une animation par card visuelle nommée FR (Apparition / Glissement / Zoom arrière / Logo Pop) — JAMAIS de slider scaleFrom/scaleTo/durationMs visible."
    - "Chaque zone peut avoir AU MAXIMUM 1 animation, et l'absence d'animation est explicitement représentée par une 5e card 'Aucune animation' (animation nullable, conforme runtime v2)."
    - 'La direction in/out est un toggle intégré DANS la card sélectionnée (pas une grille séparée 4×2).'
    - "L'effet visuel preview de la card est joué uniquement au HOVER (pas en boucle continue) — léger pour le GPU, non distrayant en grille."
  artifacts:
    - path: 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-card.component.ts'
      provides: 'Standalone Angular component pour une card animation : visual + name + direction toggle (in|out|null) intégré + hover CSS animation.'
      contains: 'AnimationCardComponent'
    - path: 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-picker.component.ts'
      provides: "Container component listant les 5 cards (4 presets + 'Aucune animation') ; exposé via @Input value + @Output valueChange."
      contains: 'AnimationPickerComponent'
  key_links:
    - from: 'wizard-step-zones.component.ts text/image form'
      to: 'AnimationPickerComponent'
      via: '<app-animation-picker [value]="form.controls.animation.value" (valueChange)="onAnimationChange($event)" />'
      pattern: 'app-animation-picker'
    - from: 'AnimationPickerComponent'
      to: 'ANIMATION_PRESET_LABELS (Plan 01 vocabulary lock)'
      via: "import { ANIMATION_PRESET_LABELS } from '../../vocabulary.constants'"
      pattern: 'ANIMATION_PRESET_LABELS'
    - from: 'smoke-template-studio-v3-vocabulary'
      to: 'Banlist enforcement on scaleFrom/scaleTo/durationMs in studio-v3/'
      via: 'Extended BANLIST scan including animation numeric param strings'
      pattern: 'scaleFrom|scaleTo|durationMs'
---

## Phase 1 contracts consumed

- `ANIMATION_PRESET_LABELS` (Plan 01-01) — exported from `studio-v3/vocabulary.constants.ts`. 5 entries: `fade → 'Apparition'`, `slide-up → 'Glissement'`, `slide-down → 'Glissement'`, `zoom → 'Zoom arrière'`, `logo-pop → 'Logo Pop'`. The animation picker MUST consume this map (not hardcode FR labels).
- `wizard-step-zones.component.ts` (Plan 01-04) — Step 3 typed ReactiveForms with text & image sub-tabs. Currently has NO `animation` control. This plan ADDS an `animation` FormControl on each form and binds the picker.
- `WizardState.zones.{textFields, imageSlots}` — Plan 03 contract. The `animation` property on the saved zone follows the v2 runtime nullable shape: `animation?: { preset: string; direction?: 'in' | 'out' } | null`.
- `ERROR_MESSAGES` (Plan 02-01) — available for surface, not directly used by this plan.
- `WizardPreviewPanelComponent` (Plan 02-02) — already mounted in shell. The animation choice triggers `previewPropsChange.emit()` via the same hybrid wiring as the existing fontFamily/fontSize controls (Plan 02-02 Task 3 pattern).

## Decisions baked from CONTEXT.md (verbatim)

- **5 options exactly** in the picker:
  1. `fade` (label "Apparition")
  2. `slide-up` (label "Glissement", direction in/out toggle decides up vs down at runtime — v2 picks slide-up for `direction: 'in'`, slide-down for `direction: 'out'`)
  3. `zoom` (label "Zoom arrière", direction `out` is the default per CONTEXT)
  4. `logo-pop` (label "Logo Pop", no direction toggle — pure pop)
  5. `aucune` (literal value, label "Aucune animation" — produces `animation: null` on save)
- **Direction toggle**: only visible inside the selected card, NOT in non-selected cards. 2 segments: « Apparition » (= in) / « Sortie » (= out). For `logo-pop` and `aucune`, the toggle is hidden.
- **Hover preview**: a small CSS keyframes animation runs on `.anim-card:hover .anim-card__preview` only. No JS, no GPU intensive work. Preview is a small rectangle/circle/SVG that mimics the motion (slide left-right for slide, scale-up→down for zoom, fade-in for fade, scale+rotate for logo-pop).

<objective>
Replace the (currently absent or numeric-parametrized) animation chooser in Step 3 with a visual card grid: 5 cards (4 named presets + "Aucune animation"). Each card carries a name in FR (sourced from `ANIMATION_PRESET_LABELS`), a hover-only CSS preview animation, and — when selected — an in/out direction toggle integrated inside the card. Zero numeric parameters (`scaleFrom`/`scaleTo`/`durationMs`) are visible to the admin. The chosen value is emitted to the parent step form which persists `{ preset, direction }` via the existing zone create/update endpoints; selecting "Aucune animation" persists `null`.

Purpose: This is the heart of UX-02. The runtime engine (Remotion v2) is parametric, but the v3 admin is a creative CMS — the admin should not see "scaleFrom: 0.8" or "durationMs: 600" sliders. The cards close the gap between the engineering surface and the design intent.

Output:

- `AnimationCardComponent` — single card (visual + name + integrated direction toggle + hover preview).
- `AnimationPickerComponent` — container rendering the 5 cards in a responsive grid.
- Wiring on `wizard-step-zones.component.ts` (text + image forms): new `animation` FormControl, binding to the picker, and value mapping to `{ preset, direction } | null` on submit.
- Extended vocabulary smoke (`smoke-template-studio-v3-vocabulary.test.ts`) bans `scaleFrom`, `scaleTo`, `durationMs` as string literals in the studio-v3 directory tree.
  </objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-ux-interactive/02-CONTEXT.md
@.planning/phases/02-ux-interactive/02-ux-interactive-01-PLAN.md
@.planning/phases/02-ux-interactive/02-ux-interactive-02-PLAN.md
@.planning/phases/01-fondations/01-fondations-01-SUMMARY.md
@.planning/phases/01-fondations/01-fondations-04-SUMMARY.md
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/testing.md
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts

<interfaces>
<!-- Existing exports the new code MUST consume -->

From central-dashboard/.../studio-v3/vocabulary.constants.ts (Plan 01 contract — DO NOT modify):

```typescript
export const ANIMATION_PRESET_LABELS = {
  fade: 'Apparition',
  'slide-up': 'Glissement',
  'slide-down': 'Glissement',
  zoom: 'Zoom arrière',
  'logo-pop': 'Logo Pop',
} as const;
```

Animation persistence shape (v2 runtime, see ADR-086 + central-server template-studio.repository.ts colMap):

```typescript
// On template_text_fields and template_image_slots:
animation?: {
  preset: 'fade' | 'slide-up' | 'slide-down' | 'zoom' | 'logo-pop';
  direction?: 'in' | 'out';
} | null;
```

Selected value the picker emits (5 options exactly):

```typescript
type AnimationPickerValue =
  | { preset: 'fade'; direction: 'in' | 'out' } // 'Apparition'
  | { preset: 'slide-up' | 'slide-down'; direction: 'in' | 'out' } // 'Glissement'
  | { preset: 'zoom'; direction: 'in' | 'out' } // 'Zoom arrière'
  | { preset: 'logo-pop' } // 'Logo Pop' (no direction)
  | null; // 'Aucune animation'
```

The picker normalizes `slide-*`: when user picks the "Glissement" card with direction "in" → emits `{ preset: 'slide-up', direction: 'in' }`. When direction is "out" → `{ preset: 'slide-down', direction: 'out' }`. (Mirrors v2 ANIMATION_PRESET_LABELS map which has 5 keys but only 4 distinct UI cards.)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend vocabulary smoke banlist (RED → GREEN) + AnimationCard + AnimationPicker components</name>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts (Plan 02-01 output — has BANLIST + listFilesRecursive)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (ANIMATION_PRESET_LABELS source of truth)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts (existing typed form for text + image)
    - .planning/phases/02-ux-interactive/02-CONTEXT.md (decisions section "UX des cards d'animation")
  </read_first>
  <behavior>
    - Smoke vocabulary BANLIST is extended with `'scaleFrom'`, `'scaleTo'`, `'durationMs'`. Test verifies these strings don't appear as quoted values anywhere in `studio-v3/`.
    - AnimationCardComponent renders: a small visual preview (CSS background + ::before element animated on hover), a FR name (read from ANIMATION_PRESET_LABELS or 'Aucune animation' literal), and — when @Input selected is true — an in/out direction toggle (2 segment buttons).
    - AnimationPickerComponent renders 5 cards in CSS Grid (3 columns desktop, 1 column mobile). The currently selected card has the toggle visible. Click on a non-selected card emits a new value with the previous direction preserved (default to 'in' for first selection).
    - "Aucune animation" card has no direction toggle, no hover preview animation (just a static "—" or icon).
    - "Logo Pop" card has no direction toggle (single behavior).
  </behavior>
  <action>
    **Step A — Extend the smoke banlist.**

    Edit `central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts`. Locate the `BANLIST` array (added by Plan 02-01) and extend it:

    ```typescript
    const BANLIST = [
      'layer', 'slot', 'pix_fmt', 'option_key', 'composition_id',
      // Plan 02-03 (UX-02) — animation numeric params must NOT leak to UI strings
      'scaleFrom', 'scaleTo', 'durationMs',
    ] as const;
    ```

    The existing Test 5 ("no studio-v3/ source file leaks DB jargon as a string-quoted value") will now also cover the 3 new entries. Run the smoke to confirm it stays GREEN (it will be GREEN if no current studio-v3 file already contains `'scaleFrom'`/`'scaleTo'`/`'durationMs'` as a quoted literal — which it shouldn't, since those concepts haven't been exposed yet).

    Commit step A: `test(template-studio-v3): extend banlist with animation numeric params (UX-02)`

    **Step B — AnimationCardComponent.**

    Create `central-dashboard/.../studio-v3/wizard/animation-card.component.ts`:

    ```typescript
    import { CommonModule } from '@angular/common';
    import {
      ChangeDetectionStrategy,
      Component,
      EventEmitter,
      Input,
      Output,
    } from '@angular/core';

    /**
     * Plan 02-03 / UX-02 — Single animation card.
     *
     * Visual + FR name + (when selected) integrated in/out direction toggle.
     * Hover-only CSS preview animation (no JS, no GPU loop). Direction toggle
     * is hidden for `logo-pop` (single behavior) and `aucune` (no animation).
     *
     * NEVER expose scaleFrom/scaleTo/durationMs to the user — those numeric
     * params are baked into the runtime preset. Smoke vocabulary BANLIST
     * enforces this.
     */
    export type AnimationCardKey = 'fade' | 'slide' | 'zoom' | 'logo-pop' | 'aucune';
    export type AnimationDirection = 'in' | 'out';

    @Component({
      selector: 'app-animation-card',
      standalone: true,
      imports: [CommonModule],
      changeDetection: ChangeDetectionStrategy.OnPush,
      templateUrl: './animation-card.component.html',
      styleUrls: ['./animation-card.component.scss'],
    })
    export class AnimationCardComponent {
      @Input({ required: true }) cardKey!: AnimationCardKey;
      @Input({ required: true }) label!: string;       // FR label, sourced from ANIMATION_PRESET_LABELS in parent
      @Input() selected = false;
      @Input() direction: AnimationDirection = 'in';

      @Output() select = new EventEmitter<void>();
      @Output() directionChange = new EventEmitter<AnimationDirection>();

      get supportsDirection(): boolean {
        return this.cardKey === 'fade' || this.cardKey === 'slide' || this.cardKey === 'zoom';
      }

      onSelect(): void {
        if (!this.selected) this.select.emit();
      }

      onSetDirection(d: AnimationDirection, ev: Event): void {
        ev.stopPropagation();      // don't bubble to onSelect
        if (this.direction !== d) this.directionChange.emit(d);
      }
    }
    ```

    Create `animation-card.component.html`:
    ```html
    <button
      type="button"
      class="anim-card"
      [class.anim-card--selected]="selected"
      [attr.data-card]="cardKey"
      (click)="onSelect()"
    >
      <div class="anim-card__preview" [attr.data-preset]="cardKey">
        <div class="anim-card__shape"></div>
      </div>
      <div class="anim-card__name">{{ label }}</div>

      <div *ngIf="selected && supportsDirection" class="anim-card__toggle" (click)="$event.stopPropagation()">
        <button
          type="button"
          [class.anim-card__seg--active]="direction === 'in'"
          class="anim-card__seg"
          (click)="onSetDirection('in', $event)"
        >
          Apparition
        </button>
        <button
          type="button"
          [class.anim-card__seg--active]="direction === 'out'"
          class="anim-card__seg"
          (click)="onSetDirection('out', $event)"
        >
          Sortie
        </button>
      </div>
    </button>
    ```

    Create `animation-card.component.scss` — keyframes for hover only (anti-loop), one keyframes per preset:

    ```scss
    .anim-card {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 16px; background: #f8fafc;
      border: 2px solid transparent; border-radius: 8px;
      cursor: pointer; transition: border-color 150ms ease;
      &:hover { border-color: #cbd5e1; }
      &--selected { border-color: #2563eb; background: #eff6ff; }
    }
    .anim-card__preview {
      width: 80px; height: 60px; background: #e5e7eb;
      border-radius: 4px; overflow: hidden; position: relative;
    }
    .anim-card__shape {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 24px; height: 24px; background: #2563eb; border-radius: 4px;
      // Hover-only animation per preset (CONTEXT decision: no always-running)
    }
    .anim-card[data-card="fade"]:hover .anim-card__shape {
      animation: anim-fade 1s ease-in-out infinite;
    }
    .anim-card[data-card="slide"]:hover .anim-card__shape {
      animation: anim-slide 1s ease-in-out infinite;
    }
    .anim-card[data-card="zoom"]:hover .anim-card__shape {
      animation: anim-zoom 1s ease-in-out infinite;
    }
    .anim-card[data-card="logo-pop"]:hover .anim-card__shape {
      animation: anim-pop 1s ease-in-out infinite;
    }
    .anim-card[data-card="aucune"] .anim-card__shape {
      background: transparent; border: 1px dashed #9ca3af;
    }

    @keyframes anim-fade { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
    @keyframes anim-slide { 0% { transform: translate(-150%, -50%); } 100% { transform: translate(50%, -50%); } }
    @keyframes anim-zoom { 0%, 100% { transform: translate(-50%, -50%) scale(0.5); } 50% { transform: translate(-50%, -50%) scale(1.1); } }
    @keyframes anim-pop { 0% { transform: translate(-50%, -50%) scale(0.5) rotate(0); } 50% { transform: translate(-50%, -50%) scale(1.1) rotate(15deg); } 100% { transform: translate(-50%, -50%) scale(1) rotate(0); } }

    .anim-card__name { font-size: 13px; color: #1f2937; font-weight: 500; }
    .anim-card__toggle {
      display: flex; gap: 4px; margin-top: 4px;
      background: #fff; border-radius: 6px; padding: 2px;
    }
    .anim-card__seg {
      flex: 1; padding: 4px 8px; font-size: 12px; cursor: pointer;
      background: transparent; border: none; border-radius: 4px;
      &--active { background: #2563eb; color: #fff; }
    }
    ```

    **Step C — AnimationPickerComponent.**

    Create `animation-picker.component.ts`:

    ```typescript
    import { CommonModule } from '@angular/common';
    import {
      ChangeDetectionStrategy,
      Component,
      EventEmitter,
      Input,
      Output,
    } from '@angular/core';
    import { ANIMATION_PRESET_LABELS } from '../../vocabulary.constants';
    import { AnimationCardComponent, AnimationCardKey, AnimationDirection } from './animation-card.component';

    /**
     * Plan 02-03 / UX-02 — Animation picker (5 cards: 4 presets + 'Aucune animation').
     *
     * Selecting a card emits the persistence shape:
     *   - 'fade'      → { preset: 'fade', direction }
     *   - 'slide'     → { preset: direction === 'in' ? 'slide-up' : 'slide-down', direction }
     *   - 'zoom'      → { preset: 'zoom', direction }
     *   - 'logo-pop'  → { preset: 'logo-pop' }
     *   - 'aucune'    → null
     */
    export type AnimationValue =
      | { preset: 'fade' | 'slide-up' | 'slide-down' | 'zoom' | 'logo-pop'; direction?: AnimationDirection }
      | null;

    interface CardDef { key: AnimationCardKey; label: string; }

    const CARDS: CardDef[] = [
      { key: 'fade', label: ANIMATION_PRESET_LABELS.fade },          // 'Apparition'
      { key: 'slide', label: ANIMATION_PRESET_LABELS['slide-up'] },  // 'Glissement'
      { key: 'zoom', label: ANIMATION_PRESET_LABELS.zoom },          // 'Zoom arrière'
      { key: 'logo-pop', label: ANIMATION_PRESET_LABELS['logo-pop'] }, // 'Logo Pop'
      { key: 'aucune', label: 'Aucune animation' },
    ];

    @Component({
      selector: 'app-animation-picker',
      standalone: true,
      imports: [CommonModule, AnimationCardComponent],
      changeDetection: ChangeDetectionStrategy.OnPush,
      templateUrl: './animation-picker.component.html',
      styleUrls: ['./animation-picker.component.scss'],
    })
    export class AnimationPickerComponent {
      readonly cards = CARDS;

      @Input() value: AnimationValue = null;
      @Output() valueChange = new EventEmitter<AnimationValue>();

      get selectedKey(): AnimationCardKey {
        if (!this.value) return 'aucune';
        if (this.value.preset === 'fade') return 'fade';
        if (this.value.preset === 'slide-up' || this.value.preset === 'slide-down') return 'slide';
        if (this.value.preset === 'zoom') return 'zoom';
        if (this.value.preset === 'logo-pop') return 'logo-pop';
        return 'aucune';
      }

      get currentDirection(): AnimationDirection {
        if (!this.value) return 'in';
        return this.value.direction ?? 'in';
      }

      onSelectCard(key: AnimationCardKey): void {
        this.valueChange.emit(this.toValue(key, this.currentDirection));
      }

      onDirectionChange(d: AnimationDirection): void {
        this.valueChange.emit(this.toValue(this.selectedKey, d));
      }

      private toValue(key: AnimationCardKey, dir: AnimationDirection): AnimationValue {
        switch (key) {
          case 'aucune': return null;
          case 'fade': return { preset: 'fade', direction: dir };
          case 'slide': return { preset: dir === 'in' ? 'slide-up' : 'slide-down', direction: dir };
          case 'zoom': return { preset: 'zoom', direction: dir };
          case 'logo-pop': return { preset: 'logo-pop' };
        }
      }
    }
    ```

    `animation-picker.component.html`:
    ```html
    <div class="anim-picker">
      <app-animation-card
        *ngFor="let c of cards"
        [cardKey]="c.key"
        [label]="c.label"
        [selected]="selectedKey === c.key"
        [direction]="currentDirection"
        (select)="onSelectCard(c.key)"
        (directionChange)="onDirectionChange($event)"
      />
    </div>
    ```

    `animation-picker.component.scss`:
    ```scss
    .anim-picker {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      @media (max-width: 720px) { grid-template-columns: 1fr; }
    }
    ```

    **Run smoke + build:**
    ```
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-vocabulary' --no-coverage --forceExit
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development
    ```

    Expect: vocabulary smoke 5/5 GREEN, ng build clean.

    Commit step B+C: `feat(template-studio-v3): AnimationCard + AnimationPicker components (UX-02)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-vocabulary' --no-coverage --forceExit 2>&1 | tail -15 && cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development 2>&1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `grep -nE "'scaleFrom'|'scaleTo'|'durationMs'" central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts` returns ≥3 (banlist extended).
    - File `animation-card.component.ts` exists, exports `AnimationCardComponent`, `AnimationCardKey`, `AnimationDirection`.
    - File `animation-picker.component.ts` exists, exports `AnimationPickerComponent`, `AnimationValue`.
    - `grep -n "ANIMATION_PRESET_LABELS" central-dashboard/.../animation-picker.component.ts` returns ≥1.
    - `grep -n "Aucune animation" central-dashboard/.../animation-picker.component.ts` returns ≥1.
    - `grep -nE "scaleFrom|scaleTo|durationMs" central-dashboard/src/app/features/content/remotion-templates/studio-v3/` (recursive) returns 0.
    - All 5 vocabulary smoke tests GREEN.
    - `ng build` clean.
    - Commit hashes exist with prefixes `test(template-studio-v3)` and `feat(template-studio-v3)`.
  </acceptance_criteria>
  <done>Banlist extended, 2 components created, ng build clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire AnimationPicker into Step 3 zones form (text + image) + previewPropsChange hook</name>
  <read_first>
    - central-dashboard/.../studio-v3/wizard/wizard-step-zones.component.ts (full file — Plan 04 typed forms)
    - central-dashboard/.../studio-v3/wizard/wizard-step-zones.component.ts:567-583 (text form FormControl declarations — for placement of new animation control)
    - central-dashboard/.../studio-v3/wizard/animation-picker.component.ts (Task 1 output)
    - central-dashboard/.../remotion-templates/remotion-templates-data.service.ts (text-field + image-slot create/update payload signatures — to confirm `animation` field acceptance)
  </read_first>
  <behavior>
    - The text form gains a new typed FormControl: `animation: FormControl<AnimationValue>` (default null).
    - The image form gains the same.
    - The HTML template renders an `<app-animation-picker [value]="form.controls.animation.value" (valueChange)="form.controls.animation.setValue($event); previewPropsChange.emit()" />` block, labeled « Animation » in the FR section header.
    - The submit/onSubmit handler includes `animation: v.animation` in the payload sent to `dataservice.createTextField` / `createImageSlot`.
    - When the picker emits a new value, `previewPropsChange.emit()` fires (consumed by Plan 02-02 hybrid wiring → triggers buildRuntimePlayerState → Player updates within debounce 300ms — actually instant since it's a discrete picker click, not a stream).
    - Vocabulary smoke must stay GREEN (no `'scaleFrom'` etc. leaked through the new code).
  </behavior>
  <action>
    Edit `central-dashboard/.../studio-v3/wizard/wizard-step-zones.component.ts`:

    1. Import: `import { AnimationPickerComponent, type AnimationValue } from './animation-picker.component';`
    2. Add `AnimationPickerComponent` to the component's `imports: [...]` array.
    3. In the text form `FormGroup<...>` shape interface (around line 89-93), add: `animation: FormControl<AnimationValue>;`
    4. In the text form construction (around line 567+), add:
       ```typescript
       animation: new FormControl<AnimationValue>(null, { nonNullable: false }),
       ```
       NOTE: `nonNullable: false` because `null` IS a valid value (= "Aucune animation").
    5. In the form RESET handler (around line 615-620), add: `animation: null,`
    6. In the SUBMIT handler payload (around line 663-668 — `dataservice.createTextField` call), add: `animation: v.animation,`. Verify the dataservice already passes-through unknown fields (it does — repo Plan 04 added `visibleIf` similarly).
    7. REPEAT all 5 sub-steps for the IMAGE form (around lines for image FormGroup).

    Edit `wizard-step-zones.component.html`:

    Locate the « Animations » or analogous FR section in BOTH the text form and image form. If the existing template uses raw HTML labels like `<label>Animation</label>`, replace the existing animation editor (if any — Plan 04 left a placeholder, otherwise add new section) with:

    ```html
    <div class="wsz__field">
      <label class="wsz__label">Animation</label>
      <app-animation-picker
        [value]="form.controls.animation.value"
        (valueChange)="onAnimationChange($event)"
      />
    </div>
    ```

    Add a method `onAnimationChange(value: AnimationValue): void`:

    ```typescript
    onAnimationChange(value: AnimationValue): void {
      this.form.controls.animation.setValue(value);
      this.form.controls.animation.markAsDirty();
      this.previewPropsChange.emit();   // Plan 02-02 hybrid hook
    }
    ```

    Repeat the HTML + handler for the image form.

    **Backend payload check:**
    The Plan 04 SUMMARY confirms the repo `createTextField` / `createImageSlot` colMap includes the `animation` column (it has been a v2 column since ADR-086). Verify by `grep -n "'animation'" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server/src/repositories/template-studio.repository.ts`. If absent, this plan SHOULD add it to the colMap and INSERT column lists for both `createTextField` and `createImageSlot` (mirroring how Plan 04 added `visibleIf`). Document the diff in the SUMMARY if so.

    **i18n hook:** « Animation » is not on the blocklist (verified Plan 03/04/05 deviation lists). « Apparition » / « Sortie » / « Aucune animation » are not blocklisted either.

    **Run after wiring:**
    ```
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-' --no-coverage --forceExit
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npm run test:smoke:smart 2>&1 | tail -10
    ```

    Expect: 4 v3 smoke suites GREEN (preview 5/5, vocabulary 5/5, duplicate 6/6, asset-manager 7/7), ng build clean, smart smoke GREEN.

    Commit: `feat(template-studio-v3): wire AnimationPicker into Step 3 zones forms (UX-02)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-' --no-coverage --forceExit 2>&1 | tail -15 && cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development 2>&1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "AnimationPickerComponent" central-dashboard/.../studio-v3/wizard/wizard-step-zones.component.ts` returns ≥1 (import).
    - `grep -nE "animation:\s*FormControl<AnimationValue>" central-dashboard/.../wizard-step-zones.component.ts` returns ≥2 (text + image forms).
    - `grep -n "<app-animation-picker" central-dashboard/.../wizard-step-zones.component.html` returns ≥2 (text + image sub-tabs).
    - `grep -n "previewPropsChange.emit" central-dashboard/.../wizard-step-zones.component.ts` returns ≥1 (animation change triggers refresh).
    - `grep -nrE "scaleFrom|scaleTo|durationMs" central-dashboard/src/app/features/content/remotion-templates/studio-v3/` returns 0 (no leak).
    - All 4 v3 smoke suites GREEN.
    - `npm run test:smoke:smart` GREEN.
    - `ng build` clean.
    - Commit hash exists with prefix `feat(template-studio-v3)`.
  </acceptance_criteria>
  <done>Animation picker wired into both forms, previewPropsChange triggers Player refresh, no numeric param leak, all smokes GREEN.</done>
</task>

</tasks>

<verification>
- 4 v3 smoke suites GREEN (vocabulary 5/5 with extended banlist, preview 5/5, duplicate 6/6, asset-manager 7/7).
- `npm run test:smoke:smart` GREEN.
- `cd central-dashboard && npx ng build --configuration=development` clean.
- `grep -nrE "scaleFrom|scaleTo|durationMs" central-dashboard/src/app/features/content/remotion-templates/studio-v3/` → 0 hits.
- Manual UAT (deferred):
  - In Step 3, the animation section shows 5 cards in a grid.
  - Hovering a card runs the small CSS animation; releasing hover stops it.
  - Clicking « Apparition » selects it; the in/out segment toggle appears INSIDE the card.
  - Clicking « Aucune animation » deselects any preset; no toggle appears; persistence saves `animation: null`.
  - The Player to the right reflects the chosen animation within ~300ms.
</verification>

<success_criteria>

- Exactly 5 cards in the picker (4 presets + "Aucune animation").
- No numeric parameter visible to the user.
- Direction toggle integrated INSIDE the selected card (not a 4×2 grid).
- Hover-only CSS animation (no GPU-burning loops in the grid view).
- Vocabulary banlist extended with `scaleFrom`/`scaleTo`/`durationMs`.
  </success_criteria>

<output>
After completion, create `.planning/phases/02-ux-interactive/02-ux-interactive-03-SUMMARY.md` documenting:
- AnimationCard / AnimationPicker public APIs
- Mapping table: card key → AnimationValue persistence shape
- Confirmation that ANIMATION_PRESET_LABELS is the single source of truth (no inline FR strings except 'Aucune animation' and 'Apparition'/'Sortie' direction toggle).
- If the repo colMap was extended for `animation`, list the diff for downstream Phase 3 reference.
</output>
