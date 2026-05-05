# Architecture Research — Template Studio v3

**Domain:** Angular 20 admin wizard + Express API extension
**Researched:** 2026-05-05
**Confidence:** HIGH (all sources read directly from codebase)

## Standard Architecture

### System Overview

```
central-dashboard/src/app/features/content/remotion-templates/
│
├── remotion-templates.component.ts        [MODIFIED] — adds Dupliquer button + nav to wizard
├── remotion-templates-data.service.ts     [MODIFIED] — adds validate(), testRender()
├── remotion-preview.service.ts            [UNCHANGED] — live hot-reload via postMessage
│
├── studio-v2/                             [UNCHANGED — "Mode avancé"]
│   ├── studio-v2-editor.component.ts
│   └── admin/
│       ├── admin-canvas-overlay.component.ts
│       ├── admin-field-editor.component.ts
│       ├── admin-layers-panel.component.ts
│       ├── admin-studio-panel.component.ts
│       └── admin-variants-panel.component.ts
│
├── studio-player/                         [UNCHANGED]
│   └── template-studio-player.component.ts  — React bridge for @remotion/player
│
└── studio-v3/                             [NEW]
    ├── wizard/
    │   ├── studio-v3-wizard.component.ts      — orchestrator (step state machine)
    │   ├── wizard-step-identity.component.ts  — Step 1: Nom + description
    │   ├── wizard-step-backgrounds.component.ts — Step 2: Fonds animés (variants)
    │   ├── wizard-step-zones.component.ts     — Step 3: Zones modifiables + preview
    │   └── wizard-step-options.component.ts   — Step 4: Options + validation
    ├── asset-manager/
    │   └── asset-manager-modal.component.ts   — modal réutilisable (step 2 + route /assets)
    └── validation-panel/
        └── validation-panel.component.ts      — 8 critères checklist + test render

central-server/src/
├── controllers/template-studio.controller.ts  [MODIFIED] — adds duplicate deep, validate, testRender
├── repositories/template-studio.repository.ts [MODIFIED] — adds duplicateDeep(), validateIntegrity()
└── __tests__/smoke/
    ├── smoke-template-studio-v3-vocabulary.test.ts   [NEW]
    ├── smoke-template-studio-v3-duplicate.test.ts    [NEW]
    ├── smoke-template-studio-v3-validation.test.ts   [NEW]
    └── smoke-template-studio-v3-asset-manager.test.ts [NEW]
```

### Component Responsibilities

| Component                              | Responsibility                                                             | New vs Modified |
| -------------------------------------- | -------------------------------------------------------------------------- | --------------- |
| `studio-v3-wizard.component.ts`        | Step state machine (1→2→3→4), holds shared WizardState, routes to save     | NEW             |
| `wizard-step-identity.component.ts`    | Form: nom + description, validates required fields before next             | NEW             |
| `wizard-step-backgrounds.component.ts` | Lists variants, triggers asset-manager-modal for WebM upload               | NEW             |
| `wizard-step-zones.component.ts`       | Text zones + image zones config, drives preview via RemotionPreviewService | NEW             |
| `wizard-step-options.component.ts`     | Options (enum/boolean), shows ValidationPanel, triggers testRender         | NEW             |
| `asset-manager-modal.component.ts`     | Lists uploaded WebM assets, upload new, returns selected URL               | NEW             |
| `validation-panel.component.ts`        | Calls POST /validate, displays 8 criteria, blocks publish if failed        | NEW             |
| `remotion-templates.component.ts`      | Adds "Dupliquer" button per card, "Nouveau template" link to wizard        | MODIFIED        |
| `remotion-templates-data.service.ts`   | Adds `validateTemplate()`, `testRender()`, `duplicateDeep()` methods       | MODIFIED        |
| `template-studio.controller.ts`        | Adds `duplicateDeep`, `validateIntegrity`, `testRender` handlers           | MODIFIED        |
| `template-studio.repository.ts`        | Adds `duplicateDeep()`, `validateTemplateIntegrity()`                      | MODIFIED        |

## Recommended Project Structure

```
studio-v3/
├── wizard/
│   ├── studio-v3-wizard.component.ts      # Standalone, single entry point
│   ├── wizard-step-identity.component.ts  # Standalone, lazy-imported by wizard
│   ├── wizard-step-backgrounds.component.ts
│   ├── wizard-step-zones.component.ts
│   └── wizard-step-options.component.ts
├── asset-manager/
│   └── asset-manager-modal.component.ts   # Standalone, usable standalone (route + modal)
└── validation-panel/
    └── validation-panel.component.ts       # Standalone, used in step 4 + potential debug
```

### Structure Rationale

- **One directory per concern:** wizard/ owns navigation state, asset-manager/ is independently reusable, validation-panel/ is independently testable.
- **Standalone components everywhere:** matches Angular 20 pattern already used throughout this codebase (`create-template-wizard.component.ts`, `studio-v2-editor.component.ts`).
- **No separate data service for v3:** wizard reads via the existing `RemotionTemplatesDataService` (extended). A dedicated `StudioV3DataService` would duplicate API surface — avoid per dashboard rule pattern.

## Architectural Patterns

### Pattern 1: Single wizard component with internal step state (not route-per-step)

**What:** `studio-v3-wizard.component.ts` manages a `currentStep: 1 | 2 | 3 | 4` signal and renders step sub-components via `@switch`. No router involvement.

**When to use:** Wizard flows where:

- Steps share a mutable `WizardState` object (templateId, variantIds, collected form data)
- Steps 3 and 4 need live preview (both inject RemotionPreviewService via the wizard parent)
- The wizard opens as a modal or route that should not pollute browser history with intermediate steps

**Why not route-per-step:** Routes require serializing wizard state into URL params or a shared service. For a wizard that creates DB rows incrementally (template created at step 1, variants at step 2), routes add complexity without UX gain. The existing `create-template-wizard.component.ts` (v2) already uses this pattern.

**Trade-offs:**

- Pro: state sharing is trivial (parent property)
- Pro: no route guards to maintain
- Con: deep-linking to a step is not possible (acceptable — wizard starts fresh or from a duplicated template)

```typescript
// studio-v3-wizard.component.ts
interface WizardState {
  templateId: string | null;   // set at step 1 on template creation
  name: string;
  description: string;
  selectedVariantIds: string[];
  // ... collected across steps
}

currentStep = signal<1 | 2 | 3 | 4>(1);
state: WizardState = { templateId: null, name: '', description: '', selectedVariantIds: [] };

nextStep() { this.currentStep.update(s => (s < 4 ? s + 1 : s) as 1|2|3|4); }
prevStep() { this.currentStep.update(s => (s > 1 ? s - 1 : s) as 1|2|3|4); }
```

### Pattern 2: RemotionPreviewService live hot-reload via postMessage (existing, unchanged)

**What:** Steps 3 and 4 (zones + options) show a live preview pane using `<app-template-studio-player>`. The wizard holds a reference to the iframe element and calls `remotionPreviewService.sendPropsUpdate()` on every form change, debounced at 300ms.

**How to wire:**

- `wizard-step-zones.component.ts` and `wizard-step-options.component.ts` receive `@Input() templateId` and emit `@Output() previewPropsChange: RuntimePlayerState` on each change.
- `studio-v3-wizard.component.ts` owns the `<app-template-studio-player>` instance and binds it to the emitted state.
- This mirrors how `studio-v2-editor.component.ts` already works: it holds `playerState: RuntimePlayerState | null` and passes it to `<app-template-studio-player [state]="playerState">`.

**Key constraint:** `RemotionPreviewService.sendPropsUpdate()` requires a live `HTMLIFrameElement`. The player component (`template-studio-player.component.ts`) uses a React root mounted in a `<div #host>`. The wizard must NOT recreate the player on each step transition — keep it mounted in the wizard shell with `[hidden]` toggles on steps 1-2 (where preview is not needed).

**Debounce implementation:** 300ms debounce on the `previewPropsChange` event chain. In Angular 20 with signals, use `effect()` + `debounceTime` from RxJS, or a plain `setTimeout`/`clearTimeout` pattern (matching ADR-095 precedent in `admin-studio-panel.component.ts`).

```typescript
// wizard orchestrator — live preview wiring
onPreviewPropsChange(state: RuntimePlayerState) {
  clearTimeout(this._debounceTimer);
  this._debounceTimer = setTimeout(() => {
    this.playerState = state;
    this.cdr.markForCheck();
  }, 300);
}
```

### Pattern 3: Asset Manager as reusable standalone modal

**What:** `asset-manager-modal.component.ts` is a standalone component that can be:

1. Opened as a dialog from `wizard-step-backgrounds.component.ts` (to pick/upload a WebM for a variant)
2. Routed to directly via `/content/templates-remotion/assets` (dedicated management page)

**How to make it reusable:** The component emits `@Output() assetSelected: EventEmitter<{ url: string }>` and `@Output() dismiss`. When used as a route, the parent route component wraps it and navigates away on dismiss.

**Why not a shared/components placement:** The asset manager is Template Studio domain-specific — it knows about `uploadStudioAsset()` and FTP template-assets paths. It belongs in `studio-v3/asset-manager/`, not in `shared/components/` which hosts domain-agnostic components like `video-search-select` and `video-upload-zone`.

### Pattern 4: Transactional deep clone for POST /duplicate

**What:** The existing `remotionTemplatesRepository.duplicate()` only clones `neopro_templates` (name, composition_id, description, props_schema, default_props). For v3, `POST /:id/duplicate` must also clone all related rows to produce a fully usable template.

**Tables to clone (in order, preserving FK relationships):**

```
1. neopro_templates          → new templateId
2. template_variants         → clone all rows, new variant IDs (needed for FK)
3. template_layers           → clone all rows, new layer IDs (needed for FK)
4. template_text_fields      → clone all rows, map old layer_id → new layer_id
5. template_image_slots      → clone all rows, map old layer_id → new layer_id
6. template_options          → clone all rows (no FK to variants/layers)
7. template_packshot_refs    → clone all rows (FK: packshot_template_id refs ANOTHER template — keep as-is, do not recurse)
```

**Implementation in `templateStudioRepository.duplicateDeep()`:**

```typescript
async duplicateDeep(sourceId: string, name?: string): Promise<TemplateV2> {
  // All within a BEGIN/COMMIT block using the pool client directly
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Clone root template
    const newTemplate = await client.query(`INSERT INTO neopro_templates ... RETURNING *`);
    const newId = newTemplate.rows[0].id;

    // 2. Clone variants (assets are NOT duplicated — same FTP URLs)
    const variants = await client.query(`SELECT * FROM template_variants WHERE template_id=$1`, [sourceId]);
    const variantIdMap: Record<string, string> = {};
    for (const v of variants.rows) {
      const res = await client.query(`INSERT INTO template_variants ... RETURNING id`);
      variantIdMap[v.id] = res.rows[0].id;
    }

    // 3. Clone layers
    const layers = await client.query(`SELECT * FROM template_layers WHERE template_id=$1`, [sourceId]);
    const layerIdMap: Record<string, string> = {};
    for (const l of layers.rows) {
      const res = await client.query(`INSERT INTO template_layers ... RETURNING id`);
      layerIdMap[l.id] = res.rows[0].id;
    }

    // 4. Clone text_fields — remap layer_id
    const textFields = await client.query(`SELECT * FROM template_text_fields WHERE template_id=$1`, [sourceId]);
    for (const tf of textFields.rows) {
      const newLayerId = tf.layer_id ? layerIdMap[tf.layer_id] : null;
      await client.query(`INSERT INTO template_text_fields ... (layer_id=$1)`, [newLayerId, ...]);
    }

    // 5. Clone image_slots — remap layer_id
    // 6. Clone template_options (no remapping needed)
    // 7. Clone template_packshot_refs (packshot_template_id kept as-is)

    await client.query('COMMIT');
    return await this.findV2ById(newId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

**Critical:** Use a DB transaction (`BEGIN/COMMIT`) — not Promise.all sequential INSERTs — because a partial clone (e.g. layers created but text_fields fail) leaves the DB in an unusable state. The existing `database.ts` pool exposes `pool.connect()` for transaction-scope clients.

**Assets are NOT copied:** Variants reference WebM URLs on FTP. Cloning asset bytes would bloat FTP and is not needed — the clone starts with the same background videos. The user can replace them via the asset manager after duplication. This is the "Dupliquer puis adapter" core UX principle.

## Data Flow

### Wizard Creation Flow

```
User clicks "Nouveau template"
    ↓
studio-v3-wizard.component (step=1: identity)
    ↓ [Next] → POST /api/remotion-templates (createTemplate)
    ↓ templateId stored in WizardState
    ↓
step=2 (backgrounds/variants)
    ↓ [Upload WebM] → asset-manager-modal → POST /:id/assets (uploadStudioAsset)
    ↓ [Select] → POST /:id/variants (createVariant with backgroundVideoUrl)
    ↓
step=3 (zones — text + image)
    ↓ [Any input change] → RemotionPreviewService.sendPropsUpdate (postMessage, debounce 300ms)
    ↓ [Add zone] → POST /:id/text-fields OR /:id/image-slots
    ↓ Live preview via <app-template-studio-player [state]>
    ↓
step=4 (options + validation)
    ↓ [Valider] → POST /:id/validate → validation-panel renders 8 criteria
    ↓ [Tester le rendu] → POST /:id/test-render → enqueues job → polls render-jobs/:jobId
    ↓ [Publier] → PATCH /:id/publish (only if all 8 criteria pass)
```

### Duplicate Flow

```
User clicks "Dupliquer" on template card
    ↓
remotion-templates.component.ts → dataService.duplicateTemplate(id, name?)
    ↓ POST /api/remotion-templates/:id/duplicate
    ↓ templateStudioRepository.duplicateDeep() — DB transaction clones 7 tables
    ↓ Returns new RemotionTemplate (unpublished)
    ↓ Route to /content/templates-remotion (list refreshed)
    ↓ User optionally opens wizard on the new template
```

### Live Preview State Flow (Steps 3-4)

```
WizardState (templateId, textValues, imageUploads, selectedVariantId, selectedOptions)
    ↓ [onChange on any field]
    ↓ wizard-step-zones/options emits previewPropsChange: RuntimePlayerState
    ↓ studio-v3-wizard handles with 300ms debounce
    ↓ this.playerState = newState → <app-template-studio-player [state]="playerState">
    ↓ TemplateStudioPlayerComponent.ngOnChanges → root.render(createElement(Player, inputProps))
    ↓ Player uses TemplateRuntime.tsx (unchanged) → renders video in-browser
```

## Integration Points

### New vs Existing — explicit file-by-file

| File                                 | Action    | Integration Point                                                                                                                                                            |
| ------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `remotion-templates.component.ts`    | MODIFIED  | Add `(duplicate)` handler calling `dataService.duplicateTemplate()`, add "Nouveau" button routing to wizard                                                                  |
| `remotion-templates-data.service.ts` | MODIFIED  | Add `validateTemplate(id)`, `testRender(id, payload)` methods using existing `ApiService`                                                                                    |
| `app.routes.ts`                      | MODIFIED  | Add route `content/templates-remotion/new` → lazy-loads `StudioV3WizardComponent`; add `content/templates-remotion/assets` → lazy-loads `AssetManagerModalComponent` as page |
| `template-studio.controller.ts`      | MODIFIED  | Add `duplicateDeep`, `validateIntegrity`, `testRender` exports following existing `handleCreate` pattern                                                                     |
| `template-studio.repository.ts`      | MODIFIED  | Add `duplicateDeep()` (transactional), `validateTemplateIntegrity()` (read-only 8 checks)                                                                                    |
| `RemotionPreviewService`             | UNCHANGED | `sendPropsUpdate()` and `buildPreviewUrl()` used as-is by wizard steps 3-4                                                                                                   |
| `TemplateStudioPlayerComponent`      | UNCHANGED | Mounted once in wizard shell, receives `RuntimePlayerState` input                                                                                                            |
| `studio-v2/` components              | UNCHANGED | Remain accessible via "Mode avancé" button in `remotion-templates.component.ts`                                                                                              |
| `TemplateRuntime.tsx`                | UNCHANGED | Engine is not touched — v3 is UI only                                                                                                                                        |

### Backend Route Additions (in remotion-templates.routes.ts or template-studio.routes.ts)

```
POST /api/remotion-templates/:id/duplicate   → duplicateDeep (existing route exists but calls shallow duplicate — needs to route to new deep handler)
POST /api/remotion-templates/:id/validate    → validateIntegrity (NEW endpoint)
POST /api/remotion-templates/:id/test-render → testRender (NEW endpoint — enqueues a render job with dummy data)
```

**Mount order:** These new routes must be in `templateStudioRoutes` (mounted BEFORE `remotionTemplatesRoutes`) to avoid the `/:id` capture issue documented in the existing smoke tests.

**Existing duplicate route:** `remotion-templates.controller.ts` already has `duplicateTemplate` doing a shallow clone. The v3 deep duplicate can either replace or augment this depending on call signature. Recommended: replace the POST handler body to call `duplicateDeep()` — the route stays the same, the repository method changes. The Angular data service already calls `duplicateTemplate()` which POSTs to `/:id/duplicate`.

### Internal Boundaries

| Boundary                                                   | Communication                                                                                                                                                                                             | Notes                                                                                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `wizard-step-zones` ↔ `studio-v3-wizard`                   | `@Output() previewPropsChange: RuntimePlayerState`                                                                                                                                                        | Wizard owns player, steps own form                                                                                                               |
| `wizard-step-backgrounds` ↔ `asset-manager-modal`          | Angular dialog service or `*ngIf` toggle on an `@Input() visible`                                                                                                                                         | Modal must not be a native `<dialog>` — existing pattern in codebase uses backdrop div (see `create-template-wizard.component.ts:ctw__backdrop`) |
| `asset-manager-modal` ↔ route `/templates-remotion/assets` | Wrapper route component that hosts the modal without the backdrop, binds `(assetSelected)` to navigate away                                                                                               | One component, two contexts                                                                                                                      |
| `validation-panel` ↔ backend                               | `POST /:id/validate` returns `{ passed: boolean, criteria: { key, label, passed }[] }` — no DB write                                                                                                      | Read-only check, safe to call repeatedly                                                                                                         |
| `test-render` ↔ existing render pipeline                   | Reuses `POST /:id/render` with a dummy payload flag (`{ isDryRun: true }`) OR a dedicated `POST /:id/test-render` that calls the same `enqueueRender` with seed data from `scaffoldPlaceholders` fallback | Must return `job_id` for polling (async pattern, existing ADR-054)                                                                               |

## Smoke Test Scope

| Smoke file                                       | What it locks                                                                                                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke-template-studio-v3-vocabulary.test.ts`    | French UI labels in wizard components match the vocabulary mapping in SPEC (fond animé, zone modifiable, etc.) — prevents label drift                                                              |
| `smoke-template-studio-v3-duplicate.test.ts`     | `duplicateDeep()` clones all 7 tables; `POST /:id/duplicate` returns 201 with new id; new template is unpublished; FTP URLs are preserved unchanged                                                |
| `smoke-template-studio-v3-validation.test.ts`    | `POST /:id/validate` returns 8 named criteria; `published` flag cannot be set if validation fails (guard in publish handler)                                                                       |
| `smoke-template-studio-v3-asset-manager.test.ts` | Asset upload route exists with `super_admin` guard; list endpoint returns only `template-assets/studio/` scoped assets; `asset-manager-modal` component exports selector `app-asset-manager-modal` |

## Recommended Build Order

**Why this order:** Each phase unblocks the next. Steps 3-4 of the wizard depend on live preview, which depends on the player being wire-compatible. The duplicate button on the list is high-value and low-risk (backend already 90% done).

```
Phase A — Foundation (unblocks all wizard steps)
  1. Backend: duplicateDeep() in template-studio.repository.ts
     → replaces shallow duplicate in remotion-templates.controller.ts
     → smoke-template-studio-v3-duplicate.test.ts (write first, then implement)
  2. Backend: validateIntegrity() in template-studio.repository.ts
     → new POST /:id/validate endpoint
     → smoke-template-studio-v3-validation.test.ts
  3. Frontend: "Dupliquer" button on template cards in remotion-templates.component.ts
     → calls existing dataService.duplicateTemplate() (no new service method needed — already in data service)

Phase B — Wizard structure (unblocks steps 3-4)
  4. Frontend: studio-v3-wizard.component.ts (shell only, step state machine, player mount)
     → route content/templates-remotion/new in app.routes.ts
  5. Frontend: wizard-step-identity.component.ts (step 1 — no preview dependency)
  6. Frontend: wizard-step-backgrounds.component.ts (step 2 — needs asset-manager-modal)
  7. Frontend: asset-manager-modal.component.ts
     → route content/templates-remotion/assets in app.routes.ts
     → smoke-template-studio-v3-asset-manager.test.ts

Phase C — Live preview + validation (unblocks publish)
  8. Frontend: wizard-step-zones.component.ts (step 3 — depends on player mount from wizard shell)
  9. Frontend: wizard-step-options.component.ts (step 4 — depends on zones data)
  10. Frontend: validation-panel.component.ts (consumed by step 4)
  11. Backend: testRender endpoint (POST /:id/test-render)
      → reuses existing render pipeline (ADR-054)
  12. smoke-template-studio-v3-vocabulary.test.ts (write last — locks final labels)
```

## Anti-Patterns

### Anti-Pattern 1: Recreating the RemotionPreviewService or player per step

**What people do:** Mount `<app-template-studio-player>` inside each wizard step component so it appears locally.

**Why it's wrong:** The React root in `TemplateStudioPlayerComponent` is expensive to create. Mounting it 3 times (steps 2, 3, 4) would cause visible flicker and GPU SharedImage re-allocation (see `feedback_pi5_gpu_sharedimage_saturation.md` — same principle). Also, the `postMessage` target is the iframe's `contentWindow`, which resets on remount.

**Do this instead:** Mount the player once in `studio-v3-wizard.component.ts`. Show/hide with `[hidden]` (not `*ngIf`) on steps 1-2. Pass `RuntimePlayerState | null` down via `@Input()`.

### Anti-Pattern 2: Deep duplicate via N sequential HTTP calls from Angular

**What people do:** On "Dupliquer" click, the Angular component calls `createTemplate()`, then N `createVariant()`, then N `createLayer()`, etc.

**Why it's wrong:** Any failure mid-sequence leaves the DB in a partial state. 5+ round trips add latency visible to the user. The UI must handle partial failures and rollback manually.

**Do this instead:** Single `POST /:id/duplicate` → `duplicateDeep()` in a DB transaction. One request, atomic, one response.

### Anti-Pattern 3: Route-per-step with router state for wizard data

**What people do:** `/templates-remotion/new/step-1`, `/step-2`, with shared data in a service or router state `extras`.

**Why it's wrong:** Browser back/forward breaks the wizard. State in a service is leaked if user navigates away. Adds 4 route entries to app.routes.ts where 1 is sufficient.

**Do this instead:** Single route `/templates-remotion/new` → single wizard component with internal step signal.

### Anti-Pattern 4: fetch() in wizard components

**What people do:** Use `fetch('/api/remotion-templates/...')` directly in a wizard step for quick API calls.

**Why it's wrong:** Bypasses the Angular `ApiService` interceptor which handles JWT cookie auth and error normalization. Enforced by `smoke-dashboard-guards.test.ts`.

**Do this instead:** Always use `RemotionTemplatesDataService` methods which delegate to `ApiService`.

### Anti-Pattern 5: Placing asset-manager in shared/components/

**What people do:** Move `asset-manager-modal.component.ts` to `central-dashboard/src/app/shared/components/` because it's "reused".

**Why it's wrong:** It's reused within the same feature domain (Template Studio). `shared/components/` is for cross-feature, domain-agnostic components. Asset manager knows about template FTP paths, `uploadStudioAsset()`, and the `super_admin` context.

**Do this instead:** Keep it in `studio-v3/asset-manager/`. The route wrapper and wizard usage both import it from there.

## Sources

- Verified directly: `remotion-preview.service.ts` — postMessage API, `buildPreviewUrl()`, `sendPropsUpdate()` signatures
- Verified directly: `remotion-templates-data.service.ts` — existing methods including `duplicateTemplate()` (already calls POST /:id/duplicate)
- Verified directly: `template-studio.controller.ts` — existing patterns (handleCreate, handleUpdate, handleDelete, assertTemplateExists)
- Verified directly: `template-studio.repository.ts` — existing `duplicateDeep` gap (current `duplicate()` only clones neopro_templates root)
- Verified directly: `remotion-templates.repository.ts` — shallow `duplicate()` at line 235, only 6 fields cloned
- Verified directly: `template-studio-player.component.ts` — React root mounting pattern, `RuntimePlayerState` interface
- Verified directly: `create-template-wizard.component.ts` — existing wizard pattern (internal step state, not routes)
- Verified directly: `studio-v2-editor.component.ts` — player ownership pattern, debounced preview
- Verified directly: `app.routes.ts` — existing route structure for remotion-templates
- Verified directly: smoke test directory — 5 existing template smoke files, 0 v3 files yet
- Verified directly: `template-options.repository.ts` — confirms `template_options` and `template_packshot_refs` exist as separate tables requiring cloning

---

_Architecture research for: Template Studio v3 Angular + Express integration_
_Researched: 2026-05-05_
