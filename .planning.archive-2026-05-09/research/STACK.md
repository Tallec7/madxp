# Stack Research — Template Studio v3 Angular Wizard + Asset Manager

**Domain:** Multi-step admin wizard + file upload + drag-reorder + live preview — Angular 20 dashboard feature
**Researched:** 2026-05-05
**Confidence:** HIGH (all decisions grounded in the existing codebase, no external library guessing)

---

## What is already installed and working — do not re-evaluate

| Capability                                          | Already in codebase | Evidence                                                                             |
| --------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| Angular 20 Standalone Components                    | Yes                 | All remotion-templates components use `standalone: true`                             |
| `@angular/cdk@^20.0.0`                              | Yes                 | `central-dashboard/package.json`, used in `safe-portfolio.component.ts`              |
| `CdkDragDrop` + `moveItemInArray`                   | Yes                 | `safe-portfolio.component.ts` + `safe-proposals.component.ts` import and use it      |
| `RemotionPreviewService` + `postMessage` hot-reload | Yes                 | `remotion-preview.service.ts` + `template-preview.component.ts` (debounced at 150ms) |
| Angular Signals (`signal`, `computed`, `effect`)    | Yes                 | `my-templates.component.ts`                                                          |
| `FormsModule` (template-driven)                     | Yes                 | `create-template-wizard.component.ts`, `admin-layers-panel.component.ts`             |
| `ReactiveFormsModule` + `FormBuilder`               | Yes                 | `login.component.ts`, `forgot-password.component.ts`, `admin-ops.service.ts`         |
| `ffprobe` on the server                             | Yes                 | `thumbnail.service.ts:extractMetadata()` — extracts width, height, codec, fps        |

---

## Recommended Stack — New Capabilities Only

### 1. Multi-step Wizard (4-step navigation + per-step validation)

**Use: Angular Reactive Forms (`ReactiveFormsModule` + `FormBuilder`) — already in the project.**

The existing `create-template-wizard.component.ts` uses template-driven `FormsModule`. For v3 the wizard has more complex per-step validation logic (slug uniqueness, ≥1 layer constraint, option coherence). Reactive Forms give per-control validity access (`step1Form.valid`, `step1Form.controls.name.errors`) without `#template-ref` gymnastics.

Pattern:

```typescript
// wizard-step-identity.component.ts
@Component({ standalone: true, imports: [ReactiveFormsModule, CommonModule] })
export class WizardStepIdentityComponent {
  fb = inject(FormBuilder);
  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    durationSec: [5.9, [Validators.required, Validators.min(0.5)]],
    fps: [30, [Validators.required]],
    width: [1920],
    height: [1080],
  });
}
```

Per-step navigation: a parent `WizardShellComponent` holds `currentStep = signal<1|2|3|4|5>(1)`. Each step emits `stepValid` boolean output. Parent enables "Suivant" only when `stepValid === true`. No third-party stepper library needed — a plain `<div *ngIf="currentStep() === 2">` is sufficient and matches the existing `create-template-wizard.component.ts` pattern.

**Do NOT add Angular Material or PrimeNG for the stepper.** The existing dashboard has no Material dependency and adding it for one stepper introduces 50+ kB of theming overhead that will conflict with the custom SCSS system.

### 2. Drag-to-Reorder Layer Stack (Étape 2)

**Use: `@angular/cdk/drag-drop` — already installed, already used.**

```typescript
// Import in standalone component:
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

// Template:
// <ul cdkDropList (cdkDropListDropped)="onDrop($event)">
//   <li *ngFor="let layer of layers()" cdkDrag>{{ layer.name }}</li>
// </ul>

onDrop(event: CdkDragDrop<TemplateLayer[]>): void {
  const reordered = [...this.layers()];
  moveItemInArray(reordered, event.previousIndex, event.currentIndex);
  // Update z_index = array index + 1, then PATCH API
  this.layers.set(reordered);
}
```

This is identical to the pattern in `safe-portfolio.component.ts`. Zero new dependencies.

### 3. Debounced Remotion Player Hot-Reload (300ms)

**Use: `setTimeout` debounce via `RemotionPreviewService.sendPropsUpdate()` — existing pattern, not RxJS.**

The existing `template-preview.component.ts` already implements a `postMessageTimer` with 150ms debounce using plain `setTimeout`. For v3, extend to 300ms and wire from the reactive form:

```typescript
// In wizard step 3/4 component:
private previewTimer: ReturnType<typeof setTimeout> | null = null;

onFormChange(): void {
  if (this.previewTimer) clearTimeout(this.previewTimer);
  this.previewTimer = setTimeout(() => {
    this.previewService.sendPropsUpdate(this.iframeRef?.nativeElement, this.compositionId, this.buildProps());
  }, 300);
}

ngOnDestroy(): void {
  if (this.previewTimer) clearTimeout(this.previewTimer);
}
```

Wire `onFormChange()` to reactive form's `valueChanges` subscription:

```typescript
this.form.valueChanges
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe(() => this.onFormChange());
```

**Do NOT use `debounceTime` + `switchMap` pattern from RxJS for this.** The postMessage target is a side-effect, not a value transformation — `debounceTime` would require wrapping `sendPropsUpdate` in an Observable which adds indirection for no benefit. The `setTimeout` approach matches the established codebase pattern.

### 4. WebM Metadata Extraction (duration, dimensions, alpha channel detection)

This is the only genuinely new capability with no existing implementation. Two approaches exist; use **the server-side approach exclusively**.

#### 4a. Client-side approach (DO NOT USE)

The WebCodecs API (`VideoDecoder`) can decode a single frame and check whether the codec reports an alpha channel. However:

- `yuva420p` detection via WebCodecs is unreliable in 2026 — the `VideoDecoder.isConfigSupported({ codec: 'vp8.0' })` call doesn't expose pixel format
- Chromium-based browsers handle it differently depending on the version
- Adds client-side complexity with no reduction in server complexity (server still needs to store the result)
- `HTMLVideoElement.videoWidth/videoHeight` + `loadedmetadata` event correctly gives dimensions and duration, but gives NO alpha information

**Verdict: client-side alpha detection is not reliable. Don't implement it.**

#### 4b. Server-side approach via ffprobe (RECOMMENDED — HIGH confidence)

Extend `thumbnail.service.ts` `extractMetadata()` to include `pix_fmt` in the ffprobe `-show_entries` query:

```typescript
// In thumbnail.service.ts extractMetadata():
'-show_entries', 'stream=width,height,codec_name,bit_rate,r_frame_rate,pix_fmt:format=duration',

// Parse result:
const pixFmt: string = stream.pix_fmt || '';
const hasAlpha = pixFmt.includes('yuva') || pixFmt.includes('rgba') || pixFmt.includes('a420');
```

The `pix_fmt` field is standard ffprobe output. `yuva420p` is the WebM alpha pixel format — this is deterministic and reliable. ffprobe is already installed on the Railway node (used by `thumbnail.service.ts`) and already spawned for template assets via the existing `extractMetadata()` flow.

The upload controller `POST /api/remotion-templates/upload` then calls `extractMetadata()` after the multer disk save and stores the result on the layer row (or returns it in the API response for the client to display in the Asset Manager grid).

**No new npm package needed.** ffprobe is already a system dependency.

**Asset Manager metadata shape (returned by API):**

```typescript
interface WebmAssetMetadata {
  url: string;
  durationMs: number; // from ffprobe format.duration * 1000
  width: number; // stream.width
  height: number; // stream.height
  hasAlpha: boolean; // pix_fmt contains 'yuva'
  pixFmt: string; // raw pix_fmt for display/audit
  uploadedAt: string; // ISO date
  usedByCount: number; // COUNT of template_layers referencing this URL
}
```

### 5. Split-View Layout (Form | Player, Étapes 3–5)

**Use: CSS Grid — no library needed.**

```scss
// studio-v3-split.component.scss
.v3-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  height: 100%;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
    // Player moves below form on small screens
    .v3-split__player {
      order: -1;
      max-height: 300px;
    }
  }
}
```

The existing `studio-v2-editor.component.html` already implements a split layout (left panel + iframe right). v3 should replicate the same SCSS pattern, not introduce a JS-based splitter library. The breakpoint for collapsing is 1024px (matching the existing dashboard `$breakpoint-lg` convention visible in other SCSS files).

**Do NOT add `angular-split` or `split.js`.** These libraries are designed for user-resizable panels. v3 does not require user-resizable panels — a fixed 50/50 split that collapses at 1024px is sufficient per the mockup.

---

## Summary: What Needs to Be Added vs What Already Exists

| Capability                            | Verdict                                                   | Action required                                                           |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| 4-step wizard shell + step navigation | Angular built-in                                          | New component `WizardShellComponent` with `signal<step>`, no new libs     |
| Per-step form validation              | Angular `ReactiveFormsModule`                             | Already in project, use `FormBuilder` per step                            |
| Drag-to-reorder layers                | `@angular/cdk/drag-drop`                                  | Already installed, already used. Import `DragDropModule` in new component |
| Debounced live preview 300ms          | `setTimeout` + `RemotionPreviewService.sendPropsUpdate()` | Already implemented at 150ms, extend to 300ms                             |
| WebM duration + dimensions (client)   | `HTMLVideoElement` `loadedmetadata` event                 | Built-in browser API, no package                                          |
| WebM alpha channel detection          | ffprobe `pix_fmt` server-side                             | Extend `thumbnail.service.ts:extractMetadata()`, no new package           |
| Split-view layout                     | CSS Grid                                                  | No library — replicate `studio-v2` SCSS pattern                           |
| Asset Manager grid + upload           | Angular built-in + existing upload endpoint               | New component, reuse `POST /api/remotion-templates/upload`                |
| Wizard stepper UI chrome              | Custom CSS                                                | No Angular Material, no PrimeNG                                           |

**Net new npm dependencies: zero.**

---

## Alternatives Considered

| Capability              | Recommended                       | Alternative Considered                                | Why Not                                                                                                     |
| ----------------------- | --------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Wizard state management | `signal<step>` in shell component | NgRx or Akita store                                   | Overkill for a 5-step linear flow; NgRx not present in project                                              |
| Per-step validation     | `ReactiveFormsModule`             | Template-driven `FormsModule` (as in existing wizard) | Template-driven makes per-step `form.valid` access awkward; reactive forms already exist in the project     |
| Drag-to-reorder         | CDK DragDrop                      | `@dnd-kit/core` (React) or `Sortable.js`              | CDK is already installed; Sortable.js would require wrapping; dnd-kit is React-only                         |
| Alpha detection         | ffprobe server-side               | WebCodecs API client-side                             | WebCodecs `pix_fmt` exposure unreliable; server already runs ffprobe                                        |
| Live preview debounce   | `setTimeout` + `clearTimeout`     | RxJS `debounceTime` operator                          | Pattern already established in `template-preview.component.ts`; avoids Observable wrapping of a side-effect |
| Split view              | CSS Grid                          | `angular-split` library                               | No user-resizable split needed; CSS Grid matches existing studio-v2 layout pattern                          |

---

## What NOT to Add

| Avoid                                  | Why                                                                               | Use Instead                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Angular Material (`@angular/material`) | Not in project; adds 50+ kB + theming conflicts with custom SCSS                  | Custom CSS matching existing dashboard patterns                    |
| PrimeNG                                | Same reason; not in project                                                       | Custom CSS                                                         |
| `angular-split` / `split.js`           | User-resizable panels not required in spec                                        | CSS Grid with `@media` breakpoint                                  |
| `@dnd-kit/core`                        | React-only                                                                        | `@angular/cdk/drag-drop`                                           |
| `fluent-ffmpeg` npm                    | Not needed — `thumbnail.service.ts` already uses `spawn('ffprobe', ...)` directly | Extend existing `spawn` approach in `thumbnail.service.ts`         |
| WebCodecs API for alpha detection      | Unreliable pixel-format exposure across browser versions                          | ffprobe `pix_fmt` server-side                                      |
| `ngx-dropzone` or `ng2-file-upload`    | Overkill; existing upload uses `<input type="file">` + `FormData` + `ApiService`  | Reuse existing upload pattern from `url-upload-input.component.ts` |

---

## Integration Points with Existing Services

| v3 Feature                | Existing Service/Component to Reuse                                            | How                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Live preview              | `RemotionPreviewService.sendPropsUpdate()`                                     | Call with `iframeRef.nativeElement`, compositionId, props object                                                          |
| Live preview URL init     | `RemotionPreviewService.buildPreviewUrl()`                                     | Use for initial iframe `[src]` on step entry                                                                              |
| WebM upload               | `POST /api/remotion-templates/upload` (existing endpoint, `super_admin` guard) | Reuse from Asset Manager component; add `pix_fmt`/alpha to response                                                       |
| Layer metadata            | `template-studio.repository.ts`                                                | Add `extractMetadata` call after upload; store `has_alpha`, `duration_ms`, `width`, `height` on the `template_layers` row |
| Alpha extraction          | `thumbnail.service.ts:extractMetadata()`                                       | Extend to add `pix_fmt` to `-show_entries` and return `hasAlpha`                                                          |
| Drag reorder z_index sync | `template-studio.repository.ts`                                                | New `updateLayerOrder(templateId, orderedLayerIds[])` method updates `z_index` in a single transaction                    |
| Duplicate template        | `template-studio.controller.ts` + `template-studio.repository.ts`              | New `POST /api/remotion-templates/:id/duplicate` + `duplicateTemplate()` repo method                                      |

---

## Version Compatibility

| Package        | Version    | Compatible With         | Notes                                                                                            |
| -------------- | ---------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `@angular/cdk` | `^20.0.0`  | `@angular/core@^20.3.0` | Already installed, no version bump needed                                                        |
| `rxjs`         | `~7.8.0`   | Angular 20              | `takeUntilDestroyed` requires `DestroyRef` inject — available in Angular 16+, present in project |
| ffprobe        | system dep | Node.js 20+ Railway     | Already available in Railway Docker image (node:20-slim + ffmpeg)                                |

---

## Installation

No new packages to install. All capabilities covered by:

- `@angular/cdk` (already in `central-dashboard/package.json`)
- `@angular/forms` ReactiveFormsModule (already in `central-dashboard/package.json`)
- ffprobe system binary (already available on Railway)

---

## Sources

- Codebase audit: `central-dashboard/package.json` — Angular 20.3 + CDK 20.0 confirmed installed
- Codebase audit: `safe-portfolio.component.ts` — CDK DragDrop pattern confirmed working in project
- Codebase audit: `template-preview.component.ts` — setTimeout debounce pattern confirmed at 150ms
- Codebase audit: `remotion-preview.service.ts` — postMessage hot-reload channel confirmed
- Codebase audit: `thumbnail.service.ts:extractMetadata()` — ffprobe `-show_entries` confirmed; `pix_fmt` not yet in the query
- Codebase audit: `create-template-wizard.component.ts` — existing wizard uses FormsModule (template-driven); v3 should migrate step forms to ReactiveFormsModule
- Codebase audit: `my-templates.component.ts` — Angular Signals (`signal`, `computed`) confirmed in use
- Official ffprobe docs (training data, HIGH confidence) — `pix_fmt` field is standard; `yuva420p` = WebM alpha codec format, deterministic
- ADR-110 + `template-studio-v3.spec.md` — functional requirements source

---

_Stack research for: Template Studio v3 — Angular 20 wizard + asset manager_
_Researched: 2026-05-05_
