# Pitfalls Research — Template Studio v3

**Domain:** Multi-step admin wizard + Remotion live preview + DB clone on top of existing Angular 20 / Express / Remotion v2 engine
**Researched:** 2026-05-05
**Confidence:** HIGH — all pitfalls derived from reading the actual codebase (controller, repository, player component, preview service, smoke tests, ADR rules). No generic speculation.

---

## Critical Pitfalls

### Pitfall 1: Wizard step commit creates DB row at step 1, but zone slots (step 3) silently reference a non-existent `layer_id` if the user skips step 2

**What goes wrong:**
The wizard creates the `neopro_templates` row at step 1 ("Identité"), then creates `template_layers` rows at step 2 ("Fonds animés"). When the user navigates directly to step 3 without completing step 2, the Angular form for zones becomes active but there are zero layers. If the wizard allows saving a `template_text_fields` row without a `layer_id`, the NOT NULL constraint in PG fires a 500. Worse: if the constraint is missed server-side for any reason, the runtime ignores the slot entirely — it is silently excluded from render.

**Why it happens:**
Step navigation in multi-step wizards is typically controlled by step index state. It is tempting to enable forward navigation buttons after each API success rather than validating prerequisites. Step 3 builds the `layer_id` foreign-key dropdown from whatever is loaded in the Angular form at that moment — if the component re-initializes (route navigation, tab change), the dropdown re-fetches layers and finds none, leaving `layer_id` undefined.

**How to avoid:**

- Make step 2 completion a hard gate: the "Suivant" button to step 3 is disabled until `template_layers.length >= 1` is confirmed from the API response (not the form state).
- The step 3 zone creation form must validate `layer_id !== null` in the Joi schema server-side (`Joi.string().uuid().required()`), not just client-side.
- The `layer_id NOT NULL` constraint already exists in DB (ADR-086 invariant from `templates.md`) — do NOT add `IF NOT EXISTS` workarounds that relax it.

**Warning signs:**

- Step 3 zone form shows an empty "Fond animé parent" dropdown.
- Creating a zone returns 500 with PG error code `23502` (not_null_violation).
- The Player preview in step 3 renders correctly (because it uses variants/layers separately) while the saved zones are orphaned.

**Phase to address:** Phase A — must be enforced before step navigation is wired.

---

### Pitfall 2: React root leak — `TemplateStudioPlayerComponent` mounted inside `*ngFor` / conditional `*ngIf` without `ngOnDestroy` cleanup

**What goes wrong:**
`TemplateStudioPlayerComponent` creates a React root via `createRoot(this.hostRef.nativeElement)` in `ngAfterViewInit`. If the wizard conditionally renders/destroys this component (e.g., behind `*ngIf="currentStep >= 3"`) on every step change, and Angular's `OnDestroy` lifecycle is not reliably called (can happen with `ChangeDetectionStrategy.OnPush` + detached change detection), the old React root leaks. Each forward/back navigation between steps accumulates a new root. Symptoms: Player renders stack, memory grows, eventually Chrome GPU SharedImage saturation (known Pi5 trap — see MEMORY.md entry).

**Why it happens:**
The existing `ngOnDestroy` implementation in `template-studio-player.component.ts` (line 104-108) correctly calls `this.root.unmount()`. The trap is that v3 wizard will introduce step-based `*ngIf` on the entire right panel (including the player), whereas the v2 studio panel keeps the player permanently rendered in one mode. When the v3 step container destroys/recreates the component rapidly (e.g., step 2 → 3 → 2 → 3), Angular's `OnPush` + parent change detection can batch DOM operations, causing `ngAfterViewInit` to fire before `ngOnDestroy` of the previous instance completes.

**How to avoid:**

- Use `[hidden]` CSS instead of `*ngIf` on the player panel when toggling steps — keeps the React root alive and avoids mount/unmount cycles.
- If `*ngIf` is unavoidable (e.g., memory concerns), add a guard in `ngAfterViewInit`: check if `this.root` already exists before calling `createRoot`.
- Add a smoke test checking that `TemplateStudioPlayerComponent` declares `ngOnDestroy` and calls `this.root.unmount()`.

**Warning signs:**

- Chrome devtools Memory tab shows React Fiber tree not garbage-collected after step navigation.
- Player renders an old template composition even after navigating to step 4.
- Console shows "Warning: An update to TemplateRuntime inside a test was not wrapped in act".

**Phase to address:** Phase B — where the live preview panel is introduced in steps 3/4.

---

### Pitfall 3: `proxyFtpUrls()` only proxies top-level string keys — nested `layers[].videoUrl` in wizard state bypasses the proxy and causes CORB in the Player

**What goes wrong:**
`RemotionPreviewService.proxyFtpUrls()` (line 39-45 in `remotion-preview.service.ts`) only iterates `Object.entries(props)` at depth 1. The v3 wizard constructs `RuntimePlayerState` with `layers: RuntimeLayer[]` where each layer has `videoUrl: string`. When the wizard passes this state to `TemplateStudioPlayerComponent`, the player receives raw `kalonpartners.bzh` URLs for the WebM layer videos — no proxy. The browser blocks these cross-origin Range requests with CORB/`NotSameOrigin`, so the video element loads but never paints (the silent GPU SharedImage bug from MEMORY.md applies here too).

**Why it happens:**
The v2 studio panel builds `RuntimePlayerState` through `recomputePlayerState()` in `admin-studio-panel.component.ts` which already manually calls `proxyUrl()` on each layer's `videoUrl` before building the state. The v3 wizard will build its state differently — likely assembling it directly from the API response (`GET /api/remotion-templates/:id/layers`) where `videoUrl` is the raw FTP URL. Developers will call `proxyFtpUrls(props)` expecting it to handle the full object, not realizing it is shallow.

**How to avoid:**

- Extend `proxyFtpUrls()` to handle known nested shapes: `layers[].videoUrl`, `variants[].backgroundVideoUrl` — or make it recursive with a depth guard.
- Alternatively, proxy at the state-assembly level: wherever `RuntimePlayerState` is constructed in the v3 wizard service, explicitly call `previewService.proxyUrl(layer.videoUrl)` for each layer.
- The existing `recomputePlayerState()` pattern in `admin-studio-panel.component.ts` is the reference implementation — follow it exactly, do not shortcut to `proxyFtpUrls(wholeState)`.

**Warning signs:**

- Player renders black panels where WebM background should be.
- Network tab shows `kalonpartners.bzh` requests returning `net::ERR_FAILED` or status 206 with `Access-Control-Allow-Origin` missing.
- No JS error is thrown — the failure is silent at the `<video>` element level.

**Phase to address:** Phase B — introduced when live preview is wired to wizard form state.

---

### Pitfall 4: `duplicateTemplate()` partial failure leaves orphan rows on FK child tables

**What goes wrong:**
`POST /api/remotion-templates/:id/duplicate` must INSERT into 6 tables sequentially: `neopro_templates`, `template_layers`, `template_text_fields`, `template_image_slots`, `template_options`, `template_packshot_refs`. If the INSERT into `template_image_slots` succeeds but `template_options` INSERT throws (e.g., unique constraint on `option_key`), the partial clone persists — a published=false template with layers and fields but no options, and the UI opens it in the wizard at step 3 where it appears complete but the checklist at step 5 will permanently fail on criterion 6 (`template_packshot_refs.option_key` broken).

**Why it happens:**
The existing `templateStudioRepository` uses individual `query()` calls without wrapping in `BEGIN/COMMIT`. The v2 CRUD operations are designed for single-row mutations where rollback is implicit (one INSERT fails = one row missing, easily retried). A duplicate operation is a multi-table write that must be atomic. Developers seeing the existing `handleCreate` pattern will replicate it, not noticing the lack of transaction wrapping.

**How to avoid:**

- Implement `duplicateTemplate()` in the repository using explicit `BEGIN` / `COMMIT` / `ROLLBACK` around all 6 INSERTs. This is the single most important architectural requirement for the duplicate endpoint.
- The repository currently accesses the pool via `query()` from `../config/database` — for a transaction, use `pool.connect()` + `client.query()` + `client.release()` pattern (consistent with other transactional repos in the codebase).
- Add a smoke test asserting that the `duplicateTemplate()` repository method contains the strings `BEGIN` and `ROLLBACK` (same pattern as `smoke-remotion.test.ts` which checks for `FOR UPDATE SKIP LOCKED`).

**Warning signs:**

- `POST /duplicate` returns 201 but the new template's step 5 checklist shows red on "Options cohérentes".
- DB contains a `neopro_templates` row with `published=false`, `name` ending in "(copie)", but `SELECT COUNT(*) FROM template_options WHERE template_id = $1` returns 0.
- Prometheus metric `neopro_template_studio_operations_total{resource=studio_view, status=error}` spikes after a duplicate attempt.

**Phase to address:** Phase A — the duplicate button is a Phase A deliverable, the transaction must be built in from day 1.

---

### Pitfall 5: "Duplicate without copying assets" + original template deleted = silent 404 on all clones' layer videos

**What goes wrong:**
The SPEC correctly states that `duplicateTemplate()` reuses the same `file_url` strings (pointing to Railway/FTP WebM assets) rather than copying the physical files. If the original template is later deleted (or its layers are deleted and new WebM assets are uploaded with different URLs), all clones share the same dead `file_url`. The clone's Player renders black, the checklist criterion 2 ("Tous les fonds animés résolvent HTTP 200") goes red, but the user sees no obvious cause because the clone itself was never touched.

**Why it happens:**
This is a deliberate architecture decision (correct for storage efficiency). The pitfall is the lack of a deletion guard. The SPEC mentions "Suppression bloquée si asset référencé par ≥ 1 layer publié" in the Asset Manager — but this guard applies to the Asset Manager UI. There is no equivalent guard on the `DELETE /api/remotion-templates/:id/layers/:layerId` endpoint or the template delete endpoint. If a super_admin deletes the original template's layers individually from the v2 "Mode avancé" studio, the guard is bypassed entirely.

**How to avoid:**

- Add a reference-count check in the layer DELETE endpoint: before deleting a layer, count how many OTHER templates' layers share the same `video_url` — if > 0, return 409 with a message "Ce fond est utilisé par N autres templates. Supprimez d'abord les clones ou uploadez un nouveau WebM."
- Add a smoke test verifying that `deleteLayer` in the repository (or the controller) performs a reference count check before deletion.
- The Asset Manager guard (UI-level) is necessary but not sufficient — the API guard is mandatory.

**Warning signs:**

- Clone template opens at step 5, all criteria green except criterion 2 (HTTP 200 check fails on `file_url`).
- `GET /api/remotion-templates/asset-proxy?url=<old-ftp-url>` returns 404.
- No error was logged at the time of deletion — the breakage is discovered only when the clone is opened.

**Phase to address:** Phase A (the guard must exist before the duplicate button ships) — even though it also touches the asset manager which is Phase A.

---

### Pitfall 6: Smoke test vocabulary mapping drift — Angular component field names diverge from the DB column names the smoke test checks

**What goes wrong:**
`smoke-template-studio-v3-vocabulary.test.ts` is designed to catch UI/DB mapping drift by asserting that Angular component source files contain specific strings (e.g., that the "Fond animé" label appears where `template_layers` is rendered). If a developer renames an Angular template variable (e.g., renames `layer.name` display to use `layer.label` after a refactor) without updating the smoke test, the test stays green while the vocabulary diverges silently. The opposite is also dangerous: if the smoke test checks for `'fond animé'` as a raw string but the label is generated dynamically from a lookup table, the test is trivially green while the runtime label is wrong.

**Why it happens:**
Vocabulary smoke tests written against file content rather than runtime behavior are inherently brittle. The existing pattern in the codebase (e.g., `smoke-remotion.test.ts` checking that controller files contain `remotionRenderJobRepository`) works because it tests structural wiring. Vocabulary tests checking user-facing strings are harder to keep aligned because strings live in HTML templates, i18n pipes, or TS constants — not always in predictable locations.

**How to avoid:**

- The smoke test should check the mapping TypeScript source file (a dedicated `vocabulary.constants.ts` or `v3-vocabulary-map.ts`) rather than the HTML template. The map exports: `UI_LABEL_MAP: Record<string, string>` where keys are DB column identifiers and values are the French UI labels.
- Test that this map file exists, exports a specific set of keys, and that the Angular component imports it (not hardcodes strings inline).
- This is the same principle as the existing `DragDropService<T>` extraction pattern — move the vocabulary into a single source of truth file that the smoke test can assert against.

**Warning signs:**

- A PR renames an Angular `@Input()` property without touching the vocabulary constants file — smoke test stays green.
- A designer review session finds "Zone modifiable" displayed as "Slot" in one step and "Zone modifiable" in another.
- The vocabulary map file is not imported by the form component, meaning the component uses its own inline strings.

**Phase to address:** Phase B — when the French vocabulary is fully wired into the form components. Must be established before Phase C adds the checklist (which references the same vocabulary).

---

### Pitfall 7: Pre-publication checklist validator goes stale when new DB constraints are added without updating the 8-criterion checker

**What goes wrong:**
The SPEC defines 8 specific criteria for the publish-gate checklist (e.g., criterion 5: "Tous les `visible_if` référencent une `template_options.key` existante"). The smoke test `smoke-template-studio-v3-wizard-validation.test.ts` enforces these 8 criteria. If a future migration adds a new constraint (e.g., "font must exist in Remotion worker bundle" when ADR-110 Phase v3.2 ships `template_fonts`) but the validation endpoint is not updated, a template can be published with a broken font reference. The checklist passes because it does not know about the new constraint.

**Why it happens:**
The checklist validator is a `POST /api/remotion-templates/:id/validate` endpoint that will query the DB and run N checks. New checks are not automatically discovered — they must be added to the validator AND to the smoke test. The smoke test is easy to make pass by simply not testing the new constraint (the test passes by testing exactly the 8 criteria it knows about, not "all criteria in the codebase").

**How to avoid:**

- Implement the validator as a registry: an array of check functions, each returning `{ criterion: string; pass: boolean; detail?: string }`. The smoke test asserts `checks.length >= 8`, not `checks.length === 8` — this forces new checks to be added to the registry, not bypassed.
- When ADR-110 Phase v3.2 ships `template_fonts`, the font resolver check must be added to the registry in the same PR (enforced by the pre-push hook rule: "tout commit feat/fix non-trivial → au moins une doc MAJ").
- The `templates.md` rules file must document the current check count as a comment so reviewers notice when it lags.

**Warning signs:**

- `POST /validate` returns `{ criteria: [...], allPass: true }` with fewer than 8 items in the criteria array.
- A template with an unknown `font_family` (not in `FONT_FAMILIES`) is publishable because the font check is missing from the validator.
- Phase v3.2 ships without a PR that adds the font check to the validator.

**Phase to address:** Phase C — where the checklist validator is built. Must be designed as an extensible registry from day 1, not a hardcoded if-chain.

---

### Pitfall 8: Angular CDK DragDrop events captured by the Remotion Player React root in the split-panel layout

**What goes wrong:**
The step 3 layout has the zone list (left, Angular) and the Remotion Player (right, React). CDK DragDrop uses `document-level` `mousemove` and `pointerup` listeners. The React Player registers its own event listeners for scrubbing the timeline (the `controls: true` Remotion Player). When a drag starts on the left panel and the pointer moves over the right panel (Player area), the Player's React scrub handler intercepts the `pointermove` event before CDK's drag handler sees it — the drag position is frozen or jumps to the last known position outside the Player rect.

**Why it happens:**
This is the same class of issue documented in MEMORY.md ("drag events captured by player iframe") but this version has no iframe — the Player is mounted as a React root directly in the Angular DOM. Both React and CDK attach to `document` and `window`. React's synthetic event system (used by Remotion Player controls) calls `stopPropagation()` on pointer events for its internal scrub logic, which breaks CDK's global listener.

**How to avoid:**

- Use `pointer-events: none` CSS on the Player container while a CDK drag is active. Subscribe to CDK's `(cdkDragStarted)` and `(cdkDragEnded)` events on the zone list to toggle a CSS class on the Player wrapper.
- Alternatively, use CDK `DragRef.withBoundary()` to constrain drag to the left panel only, preventing the pointer from entering the Player area during drag.
- Do not use CDK DragDrop for the layer reorder in step 2 if the Player is visible in the same viewport — prefer custom drag with `mousedown`/`mousemove` constrained to a specific container.
- Write a unit test for the zone drag component that asserts `pointer-events: none` is applied on drag start.

**Warning signs:**

- In step 3, dragging a zone handle causes the Remotion Player timeline scrubber to jump.
- After releasing a drag handle, the CDK drop event fires at the wrong position (offset by the Player's scrub position change).
- The symptom only appears when the pointer crosses the left/right panel boundary during drag.

**Phase to address:** Phase B — when the split-panel layout with live preview is built.

---

### Pitfall 9: Debounce-300ms live preview fires an API call on every keystroke, accumulating in-flight PATCH requests that arrive out-of-order

**What goes wrong:**
The wizard's step 3 form debounces preview updates at 300ms (per SPEC). But the preview update logic calls `PATCH /api/remotion-templates/:id/text-fields/:fieldId` to persist the zone position — not just a client-side re-render. If the user types quickly, 3-4 PATCH requests are in flight simultaneously. They resolve in arbitrary order (Railway → PG has variable latency). The last persisted value may not be the user's final input. The Player preview shows the last rendered value (debounced correctly) but the DB stores the third-to-last keypress.

**Why it happens:**
The v2 `admin-canvas-overlay.component.ts` (line 8 in the ADR comment: "Les PATCH serveur sont debouncés (300ms) via `patchTextField`") correctly debounces the PATCH. The trap is that the v3 wizard will likely use a reactive form with `valueChanges.pipe(debounceTime(300))` that triggers both the preview re-render AND the PATCH. If the PATCH is also debounced (correct), a race is still possible because debounce does not cancel in-flight HTTP requests — it only delays new emissions.

**How to avoid:**

- Use `switchMap` instead of `mergeMap` or `exhaustMap` for the PATCH request observable: `valueChanges.pipe(debounceTime(300), switchMap(value => this.patchField(value)))`. `switchMap` cancels the previous in-flight request before issuing the new one (Angular `HttpClient` cancels the Observable, which cancels the XHR).
- Keep the preview update (local, client-side) separate from the persist PATCH — the preview updates on every debounced value, the PATCH uses `switchMap` to cancel in-flight writes.
- Add a smoke test checking that the data service method that patches zone position uses `switchMap` (or documents why it does not).

**Warning signs:**

- After typing quickly in the zone label field, saving the template shows a stale label in the published view.
- Network tab shows multiple PATCH requests to the same endpoint overlapping in time.
- The `neopro_template_studio_operations_total{resource=text_field, operation=update}` counter shows more updates than keystrokes (each in-flight request that completes increments it).

**Phase to address:** Phase B — when the live form→preview→persist loop is implemented.

---

### Pitfall 10: Asset Manager alpha detection is performed client-side (JavaScript) instead of server-side, giving false confidence for malformed WebM files

**What goes wrong:**
The SPEC requires rejecting uploads of WebM files without an alpha channel when the layer has `respect_alpha=true`. Alpha detection on WebM is not trivial: the codec must be `VP9` with `yuva420p` pixel format. A naive client-side check (e.g., reading the file MIME type or checking the extension) will pass for any `.webm` file, including VP8 files without alpha. The server-side check is the authoritative gate, but if it relies on the WebM container metadata (readable via `ffprobe`) rather than the actual pixel format, a VP9 file with alpha-compatible codec but no alpha pixels will pass.

**Why it happens:**
True alpha detection requires `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt`. Running `ffprobe` in a Railway Node.js container requires the `ffprobe` binary to be available in the Docker image. The existing `central-server/Dockerfile` (noted in CLAUDE.md) uses `node:20-slim` which does not include `ffprobe`. Developers aware of the constraint will skip server-side ffprobe and use a client-side heuristic instead.

**How to avoid:**

- Add `ffprobe` to the `central-server/Dockerfile` via `RUN apt-get install -y ffprobe` (part of `ffmpeg` package). Verify this does not break the Railway build (the Dockerfile already isolates from the root `package.json` per CLAUDE.md).
- Implement server-side alpha detection as a utility function that runs `ffprobe` via `child_process.execFile` (not `exec` — parameterized args prevent injection). Cache the result in the upload metadata.
- Do NOT trust client-side alpha detection as the gate — use it only for immediate UX feedback before the upload completes.
- The smoke test `smoke-template-studio-v3-asset-manager.test.ts` must assert that the upload route calls the server-side alpha detection function, not that it delegates to client state.

**Warning signs:**

- Uploading a VP8 WebM (no alpha) passes the asset manager validation.
- The Player renders the WebM layer opaque (no transparency) even though `respect_alpha=true` is set on the layer.
- `ffprobe` is not listed in the Dockerfile and no binary check is present in the upload handler.

**Phase to address:** Phase A — the Asset Manager upload guard is a Phase A deliverable.

---

## Technical Debt Patterns

| Shortcut                                    | Immediate Benefit                  | Long-term Cost                                             | When Acceptable                                                                 |
| ------------------------------------------- | ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Shallow `proxyFtpUrls()` (top-level only)   | Works for existing v2 simple props | Silently breaks when wizard state nests layer URLs         | Never — fix before Phase B                                                      |
| Alpha detection client-side only            | No Dockerfile change needed        | False-positive alpha flags, broken `respect_alpha` renders | Never — server gate is mandatory                                                |
| Duplicate without transaction               | Simpler repository code            | Orphan rows on any error, unrecoverable silently           | Never                                                                           |
| Wizard step gates only on client state      | Faster to implement                | Backend creates invalid rows if client is bypassed         | Never — Joi validation is mandatory                                             |
| Vocabulary strings inline in HTML templates | Fast to write                      | Smoke test cannot reliably verify them, drift inevitable   | Only in prototypes, not in Phase A+                                             |
| Player mounted with `*ngIf` per step        | Saves memory                       | React root leak on rapid step changes                      | Acceptable only if `ngOnDestroy` is verified to fire reliably in the test suite |

---

## Integration Gotchas

| Integration                               | Common Mistake                                                   | Correct Approach                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Remotion Player (React-in-Angular)        | Call `createRoot()` every time `state` changes                   | Create root once in `ngAfterViewInit`, call `root.render()` on state changes (existing pattern in `template-studio-player.component.ts`) |
| FTP URLs in Player                        | Pass raw `kalonpartners.bzh` URLs to `RuntimePlayerState.layers` | Proxy via `proxyUrl()` for EVERY nested URL, not just top-level props                                                                    |
| CDK DragDrop + React Player               | Assume pointer events are DOM-scoped                             | Apply `pointer-events: none` on Player wrapper during CDK drag lifecycle                                                                 |
| PG duplicate transaction                  | Use individual `query()` calls in sequence                       | Use `pool.connect()` + explicit `BEGIN/COMMIT/ROLLBACK`                                                                                  |
| WebM alpha detection                      | Use MIME type or extension as proxy                              | Run `ffprobe` server-side, require `ffprobe` in Dockerfile                                                                               |
| `validateParams()` on new duplicate route | Forget it (common — smoke enforces it)                           | Add `validateParams(paramSchemas.id)` on `POST /:id/duplicate` (smoke-dashboard-guards checks all parametrized routes)                   |

---

## Performance Traps

| Trap                                                             | Symptoms                                                             | Prevention                                                                                                        | When It Breaks                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `mergeMap` for PATCH on form valueChanges                        | DB stores stale value, Prometheus shows more updates than keystrokes | Use `switchMap` to cancel in-flight PATCH                                                                         | From the first fast typist            |
| Reloading full studio view after every zone mutation             | Each PATCH triggers `GET /studio` (7 sub-queries), perceptible flash | Apply patch locally (optimistic update), reload only on conflict (ADR-095 `applyHistoryPatch` anti-flash pattern) | At ~5 zones, flash becomes noticeable |
| Player re-renders on every form value emission without debounce  | React reconciler runs at 60Hz during typing                          | Debounce `state` input to Player at 300ms minimum                                                                 | Immediately on any fast input         |
| Checklist HTTP-200 probe for all layer URLs on every step 5 load | N concurrent HEAD requests to FTP on every navigation to step 5      | Cache results for 30s, only re-probe on explicit user action or URL change                                        | When a template has 5+ layers         |

---

## Security Mistakes

| Mistake                                                           | Risk                                                                             | Prevention                                                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Adding `POST /:id/duplicate` without `requireRole('super_admin')` | Any admin can clone templates → template sprawl, potential content policy bypass | Follow existing pattern — all Template Studio routes are `super_admin` only (smoke enforced in `api-routes.md` rule)             |
| Asset proxy route without rate limit                              | Proxied FTP bandwidth abuse via the asset-proxy endpoint                         | The existing `/api/remotion-templates/asset-proxy` already has a rate limit — do NOT add a new proxy endpoint that bypasses it   |
| Upload endpoint without Joi validation                            | Malformed body → unhandled exception in upload handler                           | `validate(schemas.upload)` + `validateParams(paramSchemas.id)` are mandatory on all new routes (smoke-dashboard-guards enforces) |
| Trusting client-provided `template_id` in duplicate payload       | A client could provide a different template ID in the body vs the URL param      | Use only `req.params.id`, never `req.body.templateId`                                                                            |

---

## UX Pitfalls

| Pitfall                                                                       | User Impact                                                                               | Better Approach                                                                                                                                 |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Step gate shows "Suivant" disabled with no explanation                        | Daisy (the target user) cannot tell why she cannot proceed                                | Show inline validation message: "Ajoutez au moins 1 fond animé avant de passer aux zones modifiables"                                           |
| Duplicate opens at step 1 (Identité) instead of step 3 (Zones)                | Designer must click through 2 completed steps to reach the only thing they want to change | Per SPEC: "Ouvre directement l'éditeur étape 3" — route the duplicate directly to step 3 with `routerLink` + `fragment` or wizard `goToStep(3)` |
| Checklist red items show only DB column names (e.g., "`visible_if` invalide") | Non-technical user does not understand                                                    | Use vocabulary map: "Condition d'apparition invalide — l'option référencée n'existe pas"                                                        |
| Asset Manager thumbnail for WebM shows first frame                            | First frame of an animation is often black or a fade-in — thumbnail is not representative | Generate thumbnail at 1s offset via `ffprobe -ss 1`                                                                                             |
| Publish button disabled with no tooltip                                       | User does not know how many criteria are failing                                          | Show a count badge: "3/8 critères incomplets" above the checklist, not just a disabled button                                                   |

---

## "Looks Done But Isn't" Checklist

- [ ] **Duplicate button:** The clone has `published=false` AND all 6 child tables are populated AND `packshot_refs` point to their original packshot templates — verify with `smoke-template-studio-v3-duplicate.test.ts` COUNT assertions on ALL 6 tables.
- [ ] **Checklist validator:** All 8 criteria are implemented as a registry (not hardcoded ifs) AND the smoke test asserts `criteria.length >= 8` AND the font check exists AND the HTTP-200 probe for layer URLs is included.
- [ ] **Alpha detection:** The upload endpoint calls a server-side `ffprobe`-based function AND `ffprobe` is present in the `central-server/Dockerfile`.
- [ ] **CORB prevention:** Every layer's `videoUrl` in `RuntimePlayerState` is proxied through `proxyUrl()` — not just top-level props.
- [ ] **Transaction safety:** `duplicateTemplate()` in the repository contains `BEGIN` and `ROLLBACK` — smoke test asserts this.
- [ ] **validateParams on all new routes:** `POST /:id/duplicate`, `POST /:id/validate`, `POST /upload` all have `validateParams` — smoke-dashboard-guards will catch this at pre-push.
- [ ] **Player lifecycle:** `ngOnDestroy` in `TemplateStudioPlayerComponent` is called when the wizard step changes — manual test: open step 3, go back to step 2, go to step 3 again, Chrome Memory tab should show no React root leak.
- [ ] **CDK drag + Player coexistence:** Dragging a zone handle while the Player is visible does not cause the Player scrubber to jump — manual test in step 3 split panel.
- [ ] **switchMap on PATCH:** The zone position PATCH uses `switchMap` (not `mergeMap`) — check the data service Observable chain.
- [ ] **Asset deletion guard:** `DELETE /:id/layers/:layerId` rejects with 409 if another template's layer shares the same `video_url`.

---

## Recovery Strategies

| Pitfall                                                    | Recovery Cost | Recovery Steps                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orphan rows from non-transactional duplicate               | MEDIUM        | Write a one-time cleanup script: `DELETE FROM neopro_templates WHERE published=false AND name LIKE '%(copie)%' AND id NOT IN (SELECT template_id FROM template_layers)` — then fix the transaction.                                                                                     |
| React root leak accumulated over session                   | LOW           | Browser page reload clears all roots. No data loss. Fix by adding `[hidden]` pattern.                                                                                                                                                                                                   |
| CORB on Player (layers not proxied)                        | LOW           | Add `proxyUrl()` call in the state builder. No DB change needed.                                                                                                                                                                                                                        |
| Checklist stuck at 7/8 because validator missing criterion | LOW           | Add criterion to registry, redeploy. No migration needed.                                                                                                                                                                                                                               |
| Alpha detection false-positive (VP8 passed as VP9)         | MEDIUM        | Re-upload the correct WebM. Add `ffprobe` to Dockerfile. Already-published templates with wrong codec continue to render opaque (no alpha) — operator must manually identify and re-upload affected assets.                                                                             |
| `file_url` dead link after original layer deleted          | HIGH          | Identify all clone templates sharing the dead URL (`SELECT template_id FROM template_layers WHERE video_url = '<dead_url>'`), restore the FTP asset (if available), or re-upload and manually PATCH the `video_url` for all affected rows. Preventable by the API-level deletion guard. |

---

## Pitfall-to-Phase Mapping

| Pitfall                                             | Prevention Phase | Verification                                                                                                                  |
| --------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Wizard step gates — orphan zones with null layer_id | Phase A          | Joi `layer_id.required()` on zone create; smoke test asserts this; step gate disabled until layer confirmed from API          |
| React root leak on step navigation                  | Phase B          | Manual test: step 3 → 2 → 3, Chrome Memory tab; unit test on `ngOnDestroy`                                                    |
| CORB — nested layer URLs not proxied                | Phase B          | Manual test: Player renders WebM with transparency; smoke test asserts `proxyUrl()` called per layer                          |
| Non-transactional duplicate                         | Phase A          | Smoke test: `duplicateTemplate()` contains `BEGIN`/`ROLLBACK`; integration test simulating mid-clone failure                  |
| Dead asset URLs after original layer deleted        | Phase A          | Smoke test: DELETE layer route checks reference count; manual test: delete original, verify clone checklist fails criterion 2 |
| Vocabulary mapping drift                            | Phase B          | Smoke test: vocabulary constants file exists, is imported by form components, exported keys match DB columns exactly          |
| Checklist validator stale                           | Phase C          | Registry pattern enforced; smoke test asserts `criteria.length >= 8`; PR checklist rule in `templates.md`                     |
| CDK DragDrop + Player event capture                 | Phase B          | Manual test: drag zone handle over Player area; unit test: Player wrapper has `pointer-events: none` class during drag        |
| Race condition on zone PATCH                        | Phase B          | Unit test: `switchMap` in zone PATCH observable; smoke test asserts the data service method signature                         |
| Alpha detection client-side only                    | Phase A          | Smoke test: upload route calls server-side alpha function; Dockerfile contains `ffprobe`                                      |

---

## Sources

- Codebase: `central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts` — CORB proxy implementation (HIGH confidence, read directly)
- Codebase: `central-dashboard/src/app/features/content/remotion-templates/studio-player/template-studio-player.component.ts` — React root lifecycle (HIGH confidence, read directly)
- Codebase: `central-dashboard/src/app/features/content/remotion-templates/studio-v2/admin/admin-canvas-overlay.component.ts` — DragDrop + debounce pattern (HIGH confidence, read directly)
- Codebase: `central-server/src/controllers/template-studio.controller.ts` — existing CRUD patterns, no transaction wrapping (HIGH confidence, read directly)
- Codebase: `central-server/src/repositories/template-studio.repository.ts` — individual `query()` calls without BEGIN/COMMIT (HIGH confidence, read directly)
- Codebase: `central-server/src/__tests__/smoke/smoke-remotion.test.ts` — smoke test pattern for structural wiring assertions (HIGH confidence, read directly)
- Project rules: `.claude/rules/templates.md` — invariants enforced by existing smoke tests (HIGH confidence)
- Project memory: `MEMORY.md` — Pi5 GPU SharedImage saturation (React roots), CORB/NotSameOrigin incidents, CSS display:none silent failures (HIGH confidence, direct project history)
- Spec: `docs/specs/features/template-studio-v3.spec.md` — canonical behaviors and edge cases (HIGH confidence, read directly)
- Project rules: `.claude/rules/api-routes.md` — rate limit anti-patterns, validateParams enforcement (HIGH confidence)

---

_Pitfalls research for: Template Studio v3 — admin wizard UX on existing Neopro Angular 20 + Remotion v2 system_
_Researched: 2026-05-05_
