---
phase: 02-ux-interactive
plan: 03
subsystem: dashboard
tags: [template-studio-v3, animation-picker, ux-02, hover-preview, vocabulary-banlist]

# Dependency graph
requires:
  - 'Plan 02-ux-interactive-01 — vocabulary smoke + ANIMATION_PRESET_LABELS'
  - 'Plan 02-ux-interactive-02 — WizardPreviewPanelComponent + hybrid debounce/blur + previewPropsChange Output'
  - 'Existing AnimationPreset / AnimationDirection types in remotion-templates.types.ts (supports `none` preset, no schema change needed)'
provides:
  - 'AnimationCardComponent — single card with visual + FR name + integrated in/out toggle, hover-only CSS keyframes'
  - 'AnimationPickerComponent — 5-card grid (4 presets + Aucune animation), maps card key + direction to v2 runtime shape'
  - 'AnimationValue type — { preset: fade|slide-up|slide-down|zoom|logo-pop; direction?: in|out } | null'
  - 'mapAnimationToPayload(v) — UI shape → backend payload (animation: AnimationPreset, animationDirection?)'
  - 'Animation FormControls on text + image zone forms (lifted by reset/openForm handlers)'
  - 'previewPropsChange.emit() on animation change — instant Player refresh (discrete picker click)'
  - 'Banlist extended: scaleFrom / scaleTo / durationMs no longer allowed as quoted string literals under studio-v3/'
affects: [02-ux-interactive-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Hover-only CSS keyframes per preset (`[data-card="X"]:hover .anim-card__shape { animation: ... infinite }`) — no JS, no GPU loop'
    - 'Card key abstraction (`fade|slide|zoom|logo-pop|aucune`) with direction normalization at picker boundary (`slide` + `out` → `slide-down`, etc.)'
    - 'Backend `none` preset for "Aucune animation" — avoids forcing `animation: null` everywhere; existing AnimationPreset union already supports it'
    - 'Spread-payload pattern (`...mapAnimationToPayload(v.animation)`) — keeps create payload shape stable while threading two related fields'
    - '@Output() rename `select` → `cardSelect` to satisfy `@angular-eslint/no-output-native` (DOM event collision)'

key-files:
  created:
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-card.component.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-card.component.html'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-card.component.scss'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-picker.component.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-picker.component.html'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/animation-picker.component.scss'
    - '.planning/phases/02-ux-interactive/02-ux-interactive-03-SUMMARY.md'
  modified:
    - 'central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts (+3 banlist entries: scaleFrom, scaleTo, durationMs)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts (+animation FormControl x2 + AnimationPicker import + onAnimationChange + mapAnimationToPayload + 2 picker mounts in inline template)'

key-decisions:
  - 'Pre-existing untracked animation-card.* files (from interrupted run) matched plan spec exactly — kept as-is, then renamed `@Output() select` → `cardSelect` to satisfy lint'
  - 'Backend mapping keeps two scalar fields (`animation: AnimationPreset` + `animationDirection?`) instead of a JSON `{ preset, direction }` blob — preserves the existing repo colMap (createTextField/createImageSlot lines 632, 776) without migration'
  - '"Aucune animation" persists via `animation: "none"` (not NULL) — `AnimationPreset` union already includes `none`; the dashboard picker emits `null` but the boundary mapper translates'
  - 'Inline template embedding (not separate .html files) — wizard-step-zones.component.ts uses an inline template by Phase 1 design; deviation Rule 3 honored, contract identical'
  - '<app-animation-picker> placed AFTER the visibleIf field (just before form actions) — keeps the tactical "what / when / how" reading order aligned with the form scroll'
  - 'previewPropsChange emitted unconditionally on picker change (no debounce) — picker is a discrete control, not a typed stream; Plan 02-02 hybrid wiring covers all other fields'

requirements-completed: [UX-02]

# Metrics
duration: ~20min
completed: 2026-05-05
---

# Phase 2 Plan 03: Animation Cards UX Summary

**Animation choice surface in Step 3 is now a 5-card visual grid (4 presets from `ANIMATION_PRESET_LABELS` + "Aucune animation") with hover-only CSS preview and an integrated in/out direction toggle inside the selected card. Numeric parameters (`scaleFrom`/`scaleTo`/`durationMs`) are banned by the vocabulary smoke — the runtime engine remains parametric, but the v3 admin sees only design intent.**

## Performance

- **Duration:** ~20 min (post-resume; Task 1 + partial Task 2 inherited from prior session)
- **Started (resume):** 2026-05-05T14:18Z
- **Completed:** 2026-05-05T14:30Z
- **Tasks:** 2 (TDD: RED smoke → GREEN components → GREEN wiring)
- **Files created:** 6 components (3 card + 3 picker)
- **Files modified:** 2 (smoke + wizard-step-zones)
- **Commits:** 3 (one inherited from prior session at resume)

## Task Commits

1. **Task 1 — RED banlist (scaleFrom/scaleTo/durationMs)** — `777bb2fd` (test) — inherited from interrupted run
2. **Task 2 — AnimationCard + AnimationPicker components** — `bf4ef4ca` (feat)
3. **Task 3 — Wire AnimationPicker into Step 3 zones forms** — `382faa45` (feat)

## Component Public API

### `AnimationCardComponent`

```ts
@Input({ required: true }) cardKey!: AnimationCardKey;        // 'fade'|'slide'|'zoom'|'logo-pop'|'aucune'
@Input({ required: true }) label!: string;                     // FR label, sourced from ANIMATION_PRESET_LABELS in parent
@Input() selected = false;
@Input() direction: AnimationDirection = 'in';

@Output() cardSelect = new EventEmitter<void>();              // renamed from `select` (DOM event collision)
@Output() directionChange = new EventEmitter<AnimationDirection>();
```

Behavior:

- Hover: triggers a small CSS keyframes preview on `.anim-card__shape` (different keyframes per preset).
- Click: emits `cardSelect` (only if not already selected — prevents redundant emissions).
- Direction toggle (« Apparition » / « Sortie »): rendered ONLY when `selected` AND `cardKey` is one of `fade|slide|zoom`. Hidden for `logo-pop` (single behavior) and `aucune` (no animation).

### `AnimationPickerComponent`

```ts
@Input() value: AnimationValue = null;
@Output() valueChange = new EventEmitter<AnimationValue>();

export type AnimationValue =
  | { preset: 'fade'|'slide-up'|'slide-down'|'zoom'|'logo-pop'; direction?: 'in'|'out' }
  | null;
```

Renders 5 cards (declared once in CARDS const). The `selectedKey` getter normalizes `slide-up|slide-down` → `slide` for UI display. Click + direction toggle emit a single `valueChange` event with the persistence shape.

## Card Key → AnimationValue Mapping

| Card key   | Direction | AnimationValue                               | Notes                                  |
| ---------- | --------- | -------------------------------------------- | -------------------------------------- |
| `fade`     | `in`      | `{ preset: 'fade', direction: 'in' }`        |                                        |
| `fade`     | `out`     | `{ preset: 'fade', direction: 'out' }`       |                                        |
| `slide`    | `in`      | `{ preset: 'slide-up', direction: 'in' }`    | Direction picks slide-up vs slide-down |
| `slide`    | `out`     | `{ preset: 'slide-down', direction: 'out' }` |                                        |
| `zoom`     | `in`      | `{ preset: 'zoom', direction: 'in' }`        |                                        |
| `zoom`     | `out`     | `{ preset: 'zoom', direction: 'out' }`       | CONTEXT default                        |
| `logo-pop` | (n/a)     | `{ preset: 'logo-pop' }`                     | No direction toggle                    |
| `aucune`   | (n/a)     | `null`                                       | No toggle, no hover animation          |

## Backend Payload Mapping (`mapAnimationToPayload`)

```ts
function mapAnimationToPayload(v: AnimationValue): {
  animation: AnimationPreset;
  animationDirection?: AnimationDirection;
} {
  if (!v) return { animation: 'none' };
  if (v.preset === 'logo-pop') return { animation: 'logo-pop' };
  return { animation: v.preset, animationDirection: v.direction };
}
```

The repo colMap (template-studio.repository.ts lines 693, 835) already maps `animation` → `animation` and `animationDirection` → `animation_direction` columns. **No backend change needed.** `AnimationPreset` union already includes `'none'` (remotion-templates.types.ts L39).

## Vocabulary Source-of-Truth

| Source                       | Purpose                         | Used at                                     |
| ---------------------------- | ------------------------------- | ------------------------------------------- |
| `ANIMATION_PRESET_LABELS`    | FR preset names (single source) | `animation-picker.component.ts` CARDS const |
| Inline `'Aucune animation'`  | No-animation fallback           | `animation-picker.component.ts` 5th card    |
| Inline `Apparition`/`Sortie` | Direction toggle segment labels | `animation-card.component.html`             |

**No other inline FR strings.** All preset names trace back to `vocabulary.constants.ts`.

## Vocabulary Banlist Extension

Plan 02-01 banlist (5 entries: `layer|slot|pix_fmt|option_key|composition_id`) extended with 3 new entries (commit `777bb2fd`):

```ts
const BANLIST = [
  'layer',
  'slot',
  'pix_fmt',
  'option_key',
  'composition_id',
  'scaleFrom',
  'scaleTo',
  'durationMs', // ← Plan 02-03 / UX-02
] as const;
```

The smoke regex `(['"])${banned}\\1` matches only quoted bare-word literals — TypeScript identifiers like `wizard-step-backgrounds.component.ts:80 .durationMs` (property access) and JSDoc comments mentioning the banned word as plain prose are correctly NOT flagged. Confirmed: 5/5 vocabulary tests GREEN, no false positive.

## Wizard-Step-Zones Integration

Inline template (the file uses a Phase 1 inline `template:` string, not a separate `.html`):

- Two `<app-animation-picker>` mounts: one inside the text-zone `<form>`, one inside the image-zone `<form>`. Both are placed AFTER the visibleIf field, just before the form-actions row.
- The `animation` FormControl is `FormControl<AnimationValue>` (default `null`), declared on both `TextZoneFormShape` and `ImageZoneFormShape`. Reset handlers (`openTextForm` / `openImageForm`) reset to `null`.
- `onAnimationChange(scope, value)` updates the active form's animation control + marks dirty + emits `previewPropsChange` (Plan 02-02 hook → live Player refresh).
- Submit handlers spread `mapAnimationToPayload(v.animation)` into the `createTextField` / `createImageSlot` payloads.

## Pitfall Verification (grep snippets)

```bash
# AnimationPicker imported on the wizard
grep -n "AnimationPickerComponent" central-dashboard/.../wizard/wizard-step-zones.component.ts
# → 2 (import + imports array)

# 2 picker mounts (text + image forms)
grep -c "<app-animation-picker" central-dashboard/.../wizard/wizard-step-zones.component.ts
# → 2

# previewPropsChange emit on animation change
grep -n "previewPropsChange.emit" central-dashboard/.../wizard/wizard-step-zones.component.ts
# → in onAnimationChange + already-existing inline (blur)= bindings (Plan 02-02)

# ANIMATION_PRESET_LABELS source-of-truth respected
grep -n "ANIMATION_PRESET_LABELS" central-dashboard/.../wizard/animation-picker.component.ts
# → 5 entries in CARDS const

# No numeric param leak
grep -nrE "['\"](scaleFrom|scaleTo|durationMs)['\"]" central-dashboard/.../studio-v3/
# → 0 matches (only banlist entries in the smoke .test.ts file legitimately)
```

## Plan Contracts Consumed

| Contract                                       | Source plan               | Consumption                                                            |
| ---------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `ANIMATION_PRESET_LABELS`                      | Plan 01-fondations-01     | Imported by `animation-picker.component.ts` for FR card labels         |
| Vocabulary smoke + BANLIST                     | Plan 02-ux-interactive-01 | Banlist extended in-place with 3 numeric param strings                 |
| `previewPropsChange` Output + hybrid wiring    | Plan 02-ux-interactive-02 | Reused as-is — `onAnimationChange` emits it; live Player picks it up   |
| `WizardStepZonesComponent` typed forms         | Plan 01-fondations-04     | Both shapes extended with `animation: FormControl<AnimationValue>`     |
| `AnimationPreset` / `AnimationDirection` types | pre-Phase 1 (ADR-086)     | Reused — `'none'` value + scalar `animationDirection` accepted by repo |
| `createTextField` / `createImageSlot` repo     | pre-Phase 1               | Spread `mapAnimationToPayload(...)` — colMap already maps `animation`  |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `wizard-step-zones.component.ts` uses an inline template, not a separate `.html`**

- **Found during:** Task 3 (plan referenced editing `wizard-step-zones.component.html`)
- **Issue:** The file ships its template inline via `template:` literal (Phase 1 design). The plan's path-based edit instructions assumed an external HTML file.
- **Fix:** Edited the inline template inside the `template:` string. Contract identical (`<app-animation-picker [value]="..." (valueChange)="onAnimationChange(...)" />` mounted in both forms).
- **Committed in:** `382faa45`

**2. [Rule 3 — Blocking] `@Output() select` collides with DOM event name**

- **Found during:** Task 2 commit (Husky `eslint --fix --max-warnings=-1` failed with `@angular-eslint/no-output-native`)
- **Issue:** Plan-specified output name `select` is a standard DOM event — Angular ESLint rejects it.
- **Fix:** Renamed `@Output() select` → `@Output() cardSelect` on AnimationCardComponent + updated the picker template binding (`(cardSelect)="onSelectCard(c.key)"`). Internal method `onSelect()` kept (private to the component).
- **Committed in:** `bf4ef4ca`

**3. [Rule 3 — Blocking] AnimationValue plan shape doesn't match backend column shape**

- **Found during:** Task 3 (mapping payload to dataservice)
- **Issue:** Plan suggested treating `animation` as an opaque `{ preset, direction } | null` JSON blob. Repo + dataservice actually persist two scalar columns (`animation: AnimationPreset` + `animation_direction: AnimationDirection`). Forcing the JSON shape would require a schema change (out of scope).
- **Fix:** Added `mapAnimationToPayload(v)` boundary mapper. UI emits `AnimationValue`; repo gets `{ animation, animationDirection? }`. `null` (UI "Aucune") maps to `animation: 'none'` (backend already supports the `'none'` preset in `AnimationPreset` union — no migration needed).
- **Committed in:** `382faa45`

**4. [Rule 3 — Pre-existing inheritance] Untracked animation-card.\* files from interrupted run**

- **Found during:** Resume (3 untracked files in `git status`)
- **Issue:** Previous run died mid-Task-2 with the AnimationCard component already created on disk but not committed.
- **Fix:** Read all three files; verified content matches the plan spec exactly (only the lint rename in deviation #2 needed). Committed as part of Task 2 (`bf4ef4ca`).
- **Committed in:** `bf4ef4ca`

**Total deviations:** 4 (4 blocking auto-fixes, 0 architectural decisions). All necessary to align the plan with the real codebase shapes (inline templates, lint rules, scalar column persistence) and to absorb the prior-session resume cleanly.

## Issues Encountered

None — all blockers resolved via the deviation rules above. Husky pre-commit hook caught the lint issue at the right moment (Task 2 first attempt), confirming the i18n + ESLint guards are still active.

## Verification Snapshot

- **4/4 v3 smoke suites GREEN** (vocabulary 5/5, preview 5/5, duplicate 6/6, asset-manager 7/7) — 23/23 tests
- **`npm run test:smoke:smart` GREEN** (180/180 — only smoke-remotion picked up by diff at run time)
- **`ng build --configuration=development` clean** (~25s, studio-v3-wizard chunk 162.60 → 183.05 kB, +20 kB for the 2 new components + picker integration)
- **`grep -nrE "['\"](scaleFrom|scaleTo|durationMs)['\"]" studio-v3/`** → 0 hits outside the smoke test (banlist scope holds)

## User Setup Required

None — pure dashboard code. No env vars, no migrations, no FTP. Backend already accepts the payload shape.

## Manual UAT Checklist (next session)

- [ ] Open `/content/templates-remotion/new` in super_admin → reach Step 3 → click "Ajouter une zone texte".
- [ ] The form shows a row « Animation » with 5 cards (Apparition, Glissement, Zoom arrière, Logo Pop, Aucune animation).
- [ ] Hover « Apparition » → small fade animation runs in the card preview. Release hover → animation stops.
- [ ] Click « Glissement » → direction toggle « Apparition » / « Sortie » appears INSIDE the selected card. Other cards have no toggle.
- [ ] Click « Sortie » on the selected « Glissement » card → AnimationValue persists to the form as `{ preset: 'slide-down', direction: 'out' }`.
- [ ] Click « Logo Pop » → direction toggle does NOT appear (single-behavior preset).
- [ ] Click « Aucune animation » → no toggle, no hover animation. Form animation control set to `null`.
- [ ] Submit the zone → backend receives `animation: 'none'` (or the preset + direction). DB row in `template_text_fields` reflects the choice.
- [ ] The live Remotion Player to the right reflects the animation choice within ~300ms.
- [ ] Repeat the flow on the Image zone form — same UX, same persistence.

## Next Phase Readiness

Plan 02-ux-interactive-04 (visible_if click-to-highlight) can now:

- Trust that animation choice is decoupled from visible_if logic — the `animation` field is a sibling, not a parent of `visibleIf`. Highlighting zones via `selectedOptions` mutation on the runtime state is independent.
- Reuse the `<div class="wsz__field">` pattern + the `(blur)="previewPropsChange.emit()"` hybrid hook on any new visible_if input field.

Phase 3 (publication gate) inherits:

- The animation banlist guarantee — no new template can ship a `scaleFrom`/`scaleTo`/`durationMs` UI surface without breaking the smoke.
- The fact that `'none'` is the canonical no-animation marker — checklist criterion can validate that a published template uses only known preset values.

## Self-Check: PASSED

- [x] `central-dashboard/.../studio-v3/wizard/animation-card.component.ts` — FOUND
- [x] `central-dashboard/.../studio-v3/wizard/animation-card.component.html` — FOUND
- [x] `central-dashboard/.../studio-v3/wizard/animation-card.component.scss` — FOUND
- [x] `central-dashboard/.../studio-v3/wizard/animation-picker.component.ts` — FOUND
- [x] `central-dashboard/.../studio-v3/wizard/animation-picker.component.html` — FOUND
- [x] `central-dashboard/.../studio-v3/wizard/animation-picker.component.scss` — FOUND
- [x] Commit `777bb2fd` — FOUND (test: extend banlist with animation numeric params)
- [x] Commit `bf4ef4ca` — FOUND (feat: AnimationCard + AnimationPicker components)
- [x] Commit `382faa45` — FOUND (feat: wire AnimationPicker into Step 3 zones forms)
- [x] 4/4 v3 smoke suites GREEN (23/23 tests)
- [x] `npm run test:smoke:smart` GREEN (180/180)
- [x] `ng build` clean
- [x] No `'scaleFrom'`/`'scaleTo'`/`'durationMs'` quoted-literal under `studio-v3/`
- [x] `<app-animation-picker>` mounted exactly twice in wizard-step-zones inline template (text + image forms)

---

_Phase: 02-ux-interactive_
_Completed: 2026-05-05_
