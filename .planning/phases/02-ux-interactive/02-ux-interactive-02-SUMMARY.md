---
phase: 02-ux-interactive
plan: 02
subsystem: dashboard
tags:
  [template-studio-v3, remotion-player, wizard, preview, hybrid-debounce, pitfall-p2, pitfall-p3]

# Dependency graph
requires:
  - 'Plan 01-fondations-03 — StudioV3WizardComponent shell with [hidden] step containers'
  - 'Plan 01-fondations-04 — WizardStepZonesComponent (typed ReactiveForms)'
  - 'Plan 02-ux-interactive-01 — ERROR_MESSAGES (available for backend error surfacing if needed)'
  - 'TemplateStudioPlayerComponent (existing v2) — RuntimePlayerState shape, React-rooted Player'
  - 'RemotionPreviewService.proxyUrl() (existing v2 pattern, ADR-087)'
provides:
  - 'WizardPreviewPanelComponent — standalone OnPush, single mount in shell, [hidden]-toggled (Pitfall P3 lock)'
  - 'RemotionPreviewService.buildRuntimePlayerState() — per-layer + per-variant proxyUrl recursion (Pitfall P2 lock)'
  - 'PREVIEW_FIXTURES — FR placeholder values (PRÉNOM NOM, NOM DU CLUB, logo/photo URLs)'
  - 'WizardState.previewState? extension — current Player props snapshot'
  - 'WizardStepZonesComponent.previewPropsChange Output — hybrid debounce(300)/blur signal'
  - 'StudioV3WizardComponent.computePreviewState() — fixture-aware state builder for the live Player'
  - 'Smoke smoke-template-studio-v3-preview (5 tests, GREEN) — locks single-mount, per-layer proxy, hybrid wiring'
affects: [02-ux-interactive-03, 02-ux-interactive-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Single-mount React root via [hidden] sibling layout (NEVER *ngIf — Pitfall P3 GPU SharedImage leak prevention)'
    - 'Per-layer + per-variant proxyUrl() recursion via .map() (Pitfall P2 — shallow proxyFtpUrls insufficient for nested URLs)'
    - 'Hybrid live preview update: debounceTime(300) on visual controls + (blur) on text inputs (Pitfall 9 burst-typing race)'
    - 'Generic structurally-typed builder buildRuntimePlayerState<L,V,T,I>() — service stays framework-light, consumer casts to RuntimePlayerState'
    - 'Constructor effect() on signal state — recompute previewState only when references change (no feedback loop)'
    - 'FR fixture fallback per slotKey/label heuristic — club / prenom / nom keywords route to the matching PREVIEW_FIXTURES entry'

key-files:
  created:
    - 'central-server/src/__tests__/smoke/smoke-template-studio-v3-preview.test.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.html'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.scss'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/preview-fixtures.ts'
    - '.planning/phases/02-ux-interactive/02-ux-interactive-02-SUMMARY.md'
  modified:
    - 'central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts (+buildRuntimePlayerState 60 lines)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts (+previewState? optional + RuntimePlayerState import)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (+computePreviewState, +onPreviewPropsChange, +effect, +RemotionPreviewService injection)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (2-pane wrapper, single-mount preview panel sibling)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.scss (.v3w__panes grid 1fr 1fr, <1280px stack)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts (+previewPropsChange Output, +ngOnInit hybrid wiring, +(blur) on label/visibleIf)'

key-decisions:
  - 'wizard-state.types.ts lives at studio-v3/ root (not studio-v3/wizard/) — kept the existing path; the test resolves both.'
  - 'buildRuntimePlayerState is generic structural — service does not import RuntimePlayerState (avoids coupling to React-rooted player)'
  - 'computePreviewState skipped when layers.length === 0 — Player placeholder shows the FR CTA "Aller à l''étape Fonds animés" instead'
  - 'Fixture fallback heuristic on slotKey/label tokens (club / prenom / nom) — admin can override via defaultValue; future v3.1 may expose a "personnaliser fixtures" toggle'
  - 'Variants are passed empty [] from the wizard — wizard v3 has no variants column; the service still maps recursively (no-op when empty) so the contract holds for plan 03/04 if they introduce variants'
  - 'pipe300() local helper inside ngOnInit — resolved typed FormControl heterogeneity that broke the loop signature (TS2349 union of subscribe overloads)'
  - 'Doc comment on buildRuntimePlayerState carefully avoids the literal "proxyFtpUrls(state)" pattern — would have triggered the smoke negative assertion'
  - 'previewPropsChange shipped as Output stub in Task 2 commit (HTML contract) and wired in Task 3 commit (form behavior) — keeps each commit independently buildable'

requirements-completed: [PREV-01, PREV-02, PREV-03]

# Metrics
duration: ~25min
completed: 2026-05-05
---

# Phase 2 Plan 02: Live Remotion Player Preview Summary

**Live Remotion `<Player>` mounted EXACTLY ONCE in the wizard shell as a sibling of the 4 step containers, toggled via `[hidden]="currentStep() < 3"` (Pitfall P3 lock — never `*ngIf`). Form mutations from Step 3 push props through a hybrid hot-loop: `debounceTime(300)` for sliders/dropdowns/colors/numbers + `(blur)` event for text inputs (`label`, `visibleIf`). Every nested FTP URL — `layers[].videoUrl` AND `variants[].backgroundVideoUrl` — is run through `proxyUrl()` individually via `RemotionPreviewService.buildRuntimePlayerState()` (Pitfall P2 lock — shallow `proxyFtpUrls()` would leak raw `kalonpartners.bzh` URLs and silently CORB-block the Player).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-05T09:55Z
- **Completed:** 2026-05-05T10:20Z
- **Tasks:** 3 (TDD: RED smoke → GREEN component → GREEN wiring)
- **Files created:** 5
- **Files modified:** 6
- **Commits:** 3

## Task Commits

1. **Task 1 — RED smoke + fixtures + buildRuntimePlayerState + WizardState extension** — `3747eedf` (test)
2. **Task 2 — WizardPreviewPanelComponent + shell mount (single-mount + 2-pane layout)** — `2d6543d6` (feat)
3. **Task 3 — Hybrid debounce(300)/blur wiring on Step 3 form** — `826a2e2a` (feat)

## Component Public API

### `WizardPreviewPanelComponent`

```ts
@Input({ required: true }) state!: WizardState;
@Output() goToStep = new EventEmitter<WizardStep>();
```

Behavior:

- `state.layers.length > 0 && state.previewState` → renders `<app-template-studio-player [state]="state.previewState!" />`
- Otherwise → renders FR placeholder "Ajoutez un fond animé pour voir l'aperçu" + CTA "Aller à l'étape Fonds animés" (emits `goToStep.emit(2)`)

### `RemotionPreviewService.buildRuntimePlayerState(view)`

Generic builder — accepts a structurally-typed `view` shape, returns a `RuntimePlayerState`-compatible object. Per-layer and per-variant `proxyUrl()` is applied via `.map()`.

Input shape (minimum):

```ts
{
  layers?: Array<{ videoUrl: string; ... }>;
  variants?: Array<{ backgroundVideoUrl: string; ... }>;
  textFields?: T[];
  imageSlots?: I[];
  canvasWidth: number;
  canvasHeight: number;
  durationSeconds: number;
  fps: number;
  textValues?: Record<string, string>;
  imageUploads?: Record<string, string>;
  variantId?: string;
  selectedOptions?: Record<string, string>;
}
```

Output: same shape, with `layers[].videoUrl` and `variants[].backgroundVideoUrl` proxied through `proxyUrl()`, defaults applied for missing optional fields, and `variantId` defaulted to the first variant's `id` (or `''` if none).

### `WizardStepZonesComponent` (extended)

```ts
@Output() previewPropsChange = new EventEmitter<void>();
```

Emits whenever a visual control settles (300ms debounce) or a text input loses focus (blur). The shell's `onPreviewPropsChange()` handler recomputes `state.previewState`.

## Hybrid Debounce/Blur Control Mapping

| Control            | Type                  | Wiring                               |
| ------------------ | --------------------- | ------------------------------------ |
| `fontFamily`       | `<select>`            | `valueChanges` + `debounceTime(300)` |
| `fontSize`         | `<input type=number>` | `valueChanges` + `debounceTime(300)` |
| `color`            | `<input type=color>`  | `valueChanges` + `debounceTime(300)` |
| `textAlign`        | `<select>`            | `valueChanges` + `debounceTime(300)` |
| `maxChars`         | `<input type=number>` | `valueChanges` + `debounceTime(300)` |
| `layerId` (text)   | `<select>`            | `valueChanges` + `debounceTime(300)` |
| `layerId` (img)    | `<select>`            | `valueChanges` + `debounceTime(300)` |
| `safeZonePreset`   | `<select>`            | `valueChanges` + `debounceTime(300)` |
| `label` (text)     | `<input type=text>`   | `(blur)="previewPropsChange.emit()"` |
| `visibleIf` (text) | `<input type=text>`   | `(blur)="previewPropsChange.emit()"` |

## Pitfall Verification (grep snippets for downstream Plans 03/04)

**Pitfall P3 — single Player mount, never \*ngIf:**

```bash
# Exactly ONE mount of the preview panel in the shell HTML
grep -c "<app-wizard-preview-panel" central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html
# → 1

# [hidden] toggle present on the preview panel
grep -nE "<app-wizard-preview-panel[\s\S]*?\[hidden\]=" central-dashboard/.../studio-v3-wizard.component.html
# → 1 match

# *ngIf NEVER on the preview panel
grep -E "<app-wizard-preview-panel[\s\S]*?\*ngIf" central-dashboard/.../studio-v3-wizard.component.html
# → 0 matches
```

**Pitfall P2 — per-layer proxyUrl, never shallow proxyFtpUrls on the runtime state:**

```bash
# buildRuntimePlayerState declared on the service
grep -n "buildRuntimePlayerState" central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts
# → 2+ matches (declaration + call site in studio-v3-wizard)

# Per-element proxyUrl mapping on layers AND variants
grep -nE "layers\.map.*proxyUrl|variants\.map.*proxyUrl" central-dashboard/.../remotion-preview.service.ts
# → 2 matches (one per array)

# Negative: never call the shallow proxy on the whole runtime state
grep -nE "proxyFtpUrls\(\s*(state|playerState|runtime)" central-dashboard/.../remotion-preview.service.ts
# → 0 matches
```

**Pitfall 9 — hybrid debounce/blur (no per-keystroke API hammer):**

```bash
grep -n "debounceTime(300)\|(blur)=" central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-zones.component.ts
# → debounceTime(300) calls + 2 (blur)= bindings
```

## Phase 1 + Plan 02-01 Contracts Consumed

| Contract                                                                  | Source plan               | Consumption Plan 02-02                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `StudioV3WizardComponent` shell + `[hidden]` step containers              | Plan 01-fondations-03     | Preview panel mounted as a 5th sibling node, same `[hidden]` discipline (`currentStep() < 3`)                                                 |
| `WizardState` interface                                                   | Plan 01-fondations-03     | Extended with optional `previewState?: RuntimePlayerState                                                                                     | null`; `DEFAULT_WIZARD_STATE.previewState = null` |
| `WizardStepZonesComponent` typed ReactiveForms (text + image)             | Plan 01-fondations-04     | Extended with `previewPropsChange` Output + `ngOnInit` hybrid wiring on `fontFamily/fontSize/color/textAlign/maxChars/layerId/safeZonePreset` |
| `RemotionPreviewService.proxyUrl()` (existing v2, ADR-087)                | pre-Phase 1               | Reused as-is — called per-element inside `buildRuntimePlayerState`                                                                            |
| `TemplateStudioPlayerComponent` + `RuntimePlayerState` interface          | pre-Phase 1               | Reused unchanged — imported by `WizardPreviewPanelComponent`, single mount preserved                                                          |
| v2 `recomputePlayerState()` reference (admin-studio-panel, lines 338-360) | pre-Phase 1               | Pattern replicated exactly in `buildRuntimePlayerState` (per-element `.map()` over layers + variants)                                         |
| `ERROR_MESSAGES` (Plan 02-01)                                             | Plan 02-ux-interactive-01 | Available for backend asset-proxy errors — not yet surfaced in v3.0 (Player swallows 404 silently in v2 too)                                  |

## User Setup Required

**Asset placeholders not yet shipped** — the FR fixtures reference `/assets/preview/neopro-placeholder-logo.png` and `/assets/preview/neopro-placeholder-photo.png`. Daisy needs to drop these 2 PNG files into `central-dashboard/src/assets/preview/` before the manual UAT shows real placeholders. Without them, the `<img>` element will 404 silently (the Remotion `<Img>` will render a broken image icon). Suggestion: 1024×1024 SVG/PNG with the Neopro logo + a generic player photo silhouette, neutral grey background.

## Manual UAT Checklist (next session)

- [ ] Open `/content/templates-remotion/new` in super_admin — wizard renders, currentStep=1, NO Player visible (`[hidden]` cache).
- [ ] Complete step 1 (« Test wizard preview »), reach step 2 — still NO Player.
- [ ] Reach step 3 with no layer yet → preview panel appears with FR placeholder "Ajoutez un fond animé pour voir l'aperçu" + CTA "Aller à l'étape Fonds animés".
- [ ] Click CTA → wizard goes back to step 2.
- [ ] Add a WebM layer → return to step 3 → preview panel renders the WebM background (NOT a black panel = Pitfall P2 lock validated).
- [ ] Type in zone label field → Player does NOT update on every keystroke; updates only on `(blur)`.
- [ ] Change font size number control → Player updates within ~300ms.
- [ ] Navigate step 3 → step 1 → step 3 → no flash, no React root leak (Chrome devtools Memory tab shows stable React Fiber tree = Pitfall P3 lock validated).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `wizard-state.types.ts` lives at `studio-v3/` root, not `studio-v3/wizard/`**

- **Found during:** Task 1 (smoke test path resolution)
- **Issue:** Plan referenced `studio-v3/wizard/wizard-state.types.ts` but the real file is at `studio-v3/wizard-state.types.ts` (set by Plan 01-fondations-03).
- **Fix:** Edited the real file. Plans 03/04 already consume it via `import ... from '../wizard-state.types'` so the contract holds.
- **Committed in:** `3747eedf`

**2. [Rule 3 — Blocking] Smoke test regex `buildRuntimePlayerState\s*\(` failed on the generic signature**

- **Found during:** Task 1 (smoke run after shipping the service method)
- **Issue:** Method declared as `buildRuntimePlayerState<L,V,T,I>(view: ...)` — the `<` between the name and the open paren broke the test regex.
- **Fix:** Updated test regex to `buildRuntimePlayerState\s*[<(]` (allows generics OR direct paren).
- **Committed in:** `3747eedf`

**3. [Rule 3 — Blocking] My own doc comment matched the negative assertion `proxyFtpUrls(state)`**

- **Found during:** Task 1 (smoke run, test C still failing after fix #2)
- **Issue:** I wrote "Do NOT shortcut by calling `proxyFtpUrls(state)`" in the JSDoc comment — the smoke negative regex matched the literal pattern in the comment.
- **Fix:** Rewrote the comment to "Do NOT shortcut by calling the shallow `proxyFtpUrls` helper on the whole runtime state".
- **Committed in:** `3747eedf`

**4. [Rule 3 — Blocking] TS2349 — typed FormControl heterogeneity broke the `for` loop subscribe call**

- **Found during:** Task 3 (`ng build` after wiring debounceTime via a string-key loop)
- **Issue:** Iterating `['fontFamily', 'fontSize', ...]` with `this.textForm.controls[ctrl]` produced a union of FormControl types whose `.subscribe()` signatures are not call-compatible (TS2349). The loop `pipe(debounceTime(300), takeUntilDestroyed).subscribe(emit)` failed on the union.
- **Fix:** Replaced the loop with explicit per-control `pipe300(this.textForm.controls.X).subscribe(emit)` calls, using a generic local helper `pipe300<T>(ctrl): Observable<T>`. Same wiring, type-safe.
- **Committed in:** `826a2e2a`

**5. [Rule 3 — Blocking] `previewPropsChange` Output declared in Task 2 (not Task 3)**

- **Found during:** Task 2 (shell HTML referenced `(previewPropsChange)`, would break ng build if Output not present)
- **Issue:** Plan structured Task 2 as "shell mount" and Task 3 as "step wiring", but the shell HTML binds `(previewPropsChange)="onPreviewPropsChange()"` — without the Output declared, ng build fails on Task 2.
- **Fix:** Shipped the Output stub in Task 2 (with a comment pointing to Task 3 for the real wiring) so each commit is independently buildable. Task 3 then added `ngOnInit` and `(blur)` bindings without re-touching the Output declaration.
- **Committed in:** `2d6543d6` (stub) + `826a2e2a` (real wiring)

**Total deviations:** 5 (5 blocking auto-fixes, 0 architectural decisions). All necessary to align the plan with the real codebase shapes (typed forms, file paths, smoke test regex semantics) and to keep each commit atomically buildable.

## Issues Encountered

None — all blockers resolved via the deviation rules above before each commit.

## Next Phase Readiness

Plan 02-ux-interactive-03 (animation cards UX) can now:

- Trust that the Player is mounted once and props-driven — animation card selection on Step 3 just needs to push the new `animation` value into the form, which already triggers `previewPropsChange` via the existing debounced subscriptions.
- Reuse `PREVIEW_FIXTURES` for any future "preview a specific animation in isolation" feature.
- Trust Pitfall P2 + P3 are smoke-locked — adding new layer fields (e.g. `respect_alpha`) just needs to flow through `buildRuntimePlayerState` without re-introducing a shallow proxy shortcut.

Plan 02-ux-interactive-04 (visible_if feedback) can now:

- Highlight zones in the live Player by mutating `selectedOptions` on the runtime state and triggering `onPreviewPropsChange()` from the option panel — the existing effect picks it up.

## Self-Check: PASSED

- [x] `central-server/src/__tests__/smoke/smoke-template-studio-v3-preview.test.ts` — FOUND
- [x] `central-dashboard/.../studio-v3/wizard/wizard-preview-panel.component.ts` — FOUND
- [x] `central-dashboard/.../studio-v3/wizard/wizard-preview-panel.component.html` — FOUND
- [x] `central-dashboard/.../studio-v3/wizard/wizard-preview-panel.component.scss` — FOUND
- [x] `central-dashboard/.../studio-v3/wizard/preview-fixtures.ts` — FOUND (`PRÉNOM NOM` + `NOM DU CLUB` present)
- [x] Commit `3747eedf` — FOUND (test: RED smoke + fixtures + buildRuntimePlayerState)
- [x] Commit `2d6543d6` — FOUND (feat: WizardPreviewPanelComponent + shell mount)
- [x] Commit `826a2e2a` — FOUND (feat: hybrid debounce/blur wiring)
- [x] 5/5 smoke-template-studio-v3-preview tests GREEN
- [x] 23/23 smoke-template-studio-v3-\* tests GREEN (4 suites)
- [x] `npm run test:smoke:smart` GREEN (180/180 — only smoke-remotion picked up by diff)
- [x] `ng build --configuration=development` clean (~18s, studio-v3-wizard chunk 162.60 kB)
- [x] Per-layer + per-variant proxyUrl visible in service (grep returns 2 `.map(...proxyUrl` matches)
- [x] Single mount + [hidden] verified via shell HTML grep (1 mount, 0 \*ngIf)
- [x] Hybrid debounce(300) + (blur) verified in step-zones (grep returns both)

---

_Phase: 02-ux-interactive_
_Completed: 2026-05-05_
