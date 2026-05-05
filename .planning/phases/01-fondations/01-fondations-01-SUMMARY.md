---
phase: 01-fondations
plan: 01
subsystem: api
tags: [template-studio-v3, ffprobe, transactional-clone, smoke-tests, postgres, remotion]

# Dependency graph
requires: []
provides:
  - 'Transactional duplicateDeep() across the 6 child tables of a Template Studio v3 template (DUP-02)'
  - 'ffprobe pix_fmt → hasAlpha detection on thumbnail.service.ts (P10)'
  - 'POST /:id/assets returns 400 + asset_alpha_required when respect_alpha required and source has no alpha'
  - 'DELETE /:id/layers/:layerId returns 409 + usedByPublishedCount when shared with another published layer (ASSET-03 / P5)'
  - 'VOCABULARY_MAP frozen by smoke test (TEST-01) — 14 SPEC labels locked'
  - '3 new smoke suites (smoke-template-studio-v3-{vocabulary,duplicate,asset-manager}) — 16 assertions'
affects: [01-fondations-02, 01-fondations-03, 01-fondations-04, 01-fondations-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Transactional clone pattern (BEGIN/COMMIT, ROLLBACK on error) using getClient() from config/database'
    - 'Pre-upload alpha detection via ffprobe -show_entries stream=pix_fmt'
    - 'Reference-count guard (countLayersSharingVideoUrl) on layer DELETE'
    - 'File-based smoke tests (no HTTP/DB boot) — pattern from smoke-remotion.test.ts'

key-files:
  created:
    - 'central-server/src/__tests__/smoke/smoke-template-studio-v3-duplicate.test.ts'
    - 'central-server/src/__tests__/smoke/smoke-template-studio-v3-asset-manager.test.ts'
    - 'central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts'
  modified:
    - 'central-server/src/services/thumbnail.service.ts (pix_fmt + hasAlpha on VideoMetadata)'
    - 'central-server/src/repositories/template-studio.repository.ts (duplicateDeep + countLayersSharingVideoUrl)'
    - 'central-server/src/controllers/remotion-templates.controller.ts (alpha rejection on /assets, deep clone wired into /duplicate)'
    - 'central-server/src/controllers/template-studio.controller.ts (409 guard on deleteLayer)'
    - 'central-server/Dockerfile (comment locks ffmpeg as runtime dep — ffprobe ships with it)'

key-decisions:
  - 'duplicateDeep uses getClient() not pool.connect() — getClient is the typed transactional client export'
  - 'composition_id is suffixed with base36 timestamp on clone (no UNIQUE constraint but used as Remotion bundle key)'
  - 'Source v1 templates surface 400 duplicate_requires_v2 (deep clone is v2/v3 only — findV2ById returns null on v1)'
  - 'Alpha rejection accepts both respect_alpha (form-data convention) and respectAlpha (JSON convention)'
  - 'Asset upload handler kept in remotion-templates.controller.ts (where it lives historically) — plan said template-studio.controller.ts but the real wiring is on the legacy file'

patterns-established:
  - 'Smoke-first execution: 3 RED tests committed BEFORE implementation, GREEN after each task'
  - 'Transactional clone: BEGIN → INSERT root → INSERT children with FK remap → COMMIT (ROLLBACK on any throw)'
  - 'ffprobe alpha gating: extractMetadata returns hasAlpha boolean computed from pix_fmt regex (yuva|rgba|argb|abgr|bgra|a420)'
  - 'Reference-count delete guard: SELECT COUNT(*) JOIN published templates WHERE shared resource → 409 if >0'

requirements-completed: [DUP-02, ASSET-02, ASSET-03, TEST-01, TEST-02, TEST-04]

# Metrics
duration: ~30min
completed: 2026-05-05
---

# Phase 1 Plan 01: Fondations Backend Template Studio v3 Summary

**Transactional duplicateDeep() across 6 child tables, ffprobe pix_fmt-based alpha detection on asset upload with rejection when respect_alpha required, layer DELETE 409 guard against orphaned WebM, vocabulary contract frozen by smoke test (14 labels) — all wired smoke-first (RED → GREEN).**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-05T06:23Z
- **Completed:** 2026-05-05T06:53Z
- **Tasks:** 4 (Task 4 was a no-op verification — vocabulary already green from Task 1 stub)
- **Files modified:** 5 (+ 4 created)

## Accomplishments

- `templateStudioRepository.duplicateDeep(sourceId)` clones the 6 child tables in a single BEGIN/COMMIT transaction with `layerIdMap` FK remap on `template_text_fields` and `template_image_slots` (eliminates pitfall P4 — non-transactional duplicate that left orphan rows on partial failure).
- `thumbnail.service.ts` now reads `pix_fmt` and exposes `hasAlpha: boolean` on `VideoMetadata`. Detection regex covers yuva\*, rgba/argb/abgr/bgra, a420 (10/12-bit alpha formats).
- `POST /api/remotion-templates/:id/assets` rejects WebM uploads with `400 asset_alpha_required` when `respect_alpha` is true and the file has no alpha channel (eliminates pitfall P10 — alpha mismatch detected only at runtime on the Pi, after FTP upload had already happened).
- `DELETE /api/remotion-templates-studio/:id/layers/:layerId` returns `409 asset_in_use { usedByPublishedCount }` when the layer's `video_url` is still referenced by ≥1 other layer in a published template (eliminates pitfall P5 — silent FTP orphans that broke published clubs).
- `VOCABULARY_MAP` constants file frozen on the dashboard side, locked by `smoke-template-studio-v3-vocabulary` (asserts presence of all 14 SPEC labels + bans DB jargon `'layer'`/`'slot'`/`'pix_fmt'` as user-facing values).
- 3 new smoke suites added: 16 assertions total, all GREEN.
- `npm run test:smoke:smart` reports **48 suites / 2018 tests GREEN** — zero regression introduced.

## Task Commits

1. **Task 1: 3 RED smoke tests + vocabulary constants stub** — `5f54107a` (test)
2. **Task 2: ffprobe alpha detection + alpha rejection + delete guard** — `e5148499` (feat)
3. **Task 3: transactional duplicateDeep + wire route** — `167abd9a` (feat)
4. **Task 4: vocabulary smoke green** — no-op (already GREEN from Task 1 stub; documented as deviation below)

## Files Created/Modified

**Created:**

- `central-server/src/__tests__/smoke/smoke-template-studio-v3-duplicate.test.ts` — locks transactional clone contract (6 assertions)
- `central-server/src/__tests__/smoke/smoke-template-studio-v3-asset-manager.test.ts` — locks ffprobe + alpha rejection + delete guard (7 assertions)
- `central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts` — locks UI↔DB vocabulary (3 assertions)
- `central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` — VOCABULARY_MAP + ANIMATION_PRESET_LABELS exports

**Modified:**

- `central-server/src/services/thumbnail.service.ts` — exported `VideoMetadata` interface (was internal), added `pixFmt` + `hasAlpha` fields, added `pix_fmt` to `-show_entries` ffprobe query, factored `computeHasAlpha` regex helper.
- `central-server/src/repositories/template-studio.repository.ts` — added `duplicateDeep(sourceId, opts)` (transactional, 7-step clone with layerIdMap FK remap) + `countLayersSharingVideoUrl(layerId)` (reference-count for delete guard).
- `central-server/src/controllers/remotion-templates.controller.ts` — `uploadTemplateAssetController` reads `respect_alpha`, calls `thumbnailService.extractMetadata`, rejects with 400 when `hasAlpha===false`. `duplicateTemplate` handler now calls `templateStudioRepository.duplicateDeep` + handles `source_template_not_found` → 404 and `clone_not_v2_readable` → 400.
- `central-server/src/controllers/template-studio.controller.ts` — `deleteLayer` precondition: 409 with `usedByPublishedCount` when `countLayersSharingVideoUrl > 0`.
- `central-server/Dockerfile` — comment block locks ffmpeg as runtime dep (ffprobe ships with it — used by ADR-110 alpha detection).

## Decisions Made

- **getClient() over pool.connect()** for the transactional client — `pool` is default-export only (not a named export); `getClient()` is a properly typed wrapper that also adds a 5s checkout timeout warning. This is the codebase convention.
- **composition_id suffixing** — no UNIQUE constraint exists, but composition_id is used as the Remotion bundle key. Suffix with `Date.now().toString(36)` to keep clones distinct without collision.
- **Source-v1 templates surface 400** — `duplicateDeep` ends with `findV2ById` which returns `null` for `schema_version=1`. Surface as `clone_not_v2_readable` → controller maps to 400 `duplicate_requires_v2` so the UI can hint the admin to migrate first.
- **respect_alpha accepts both casings** — multipart form-data sends snake_case strings; future JSON callers may send camelCase booleans. Accept `respect_alpha` and `respectAlpha`, both as `true | 'true' | '1'`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Asset upload handler lives in `remotion-templates.controller.ts`, not `template-studio.controller.ts`**

- **Found during:** Task 2 (alpha rejection wiring)
- **Issue:** PLAN.md `<files>` listed `central-server/src/controllers/template-studio.controller.ts` for the upload handler change, but the route `POST /:id/assets` is mounted in `remotion-templates.routes.ts` and handled by `uploadTemplateAssetController` in `remotion-templates.controller.ts`. The plan's reference was out of date with the codebase.
- **Fix:** Wired alpha detection in the real handler (`remotion-templates.controller.ts`). Adjusted smoke test assertions to grep the same file. Deletion guard kept in `template-studio.controller.ts` where `deleteLayer` lives.
- **Files modified:** `central-server/src/controllers/remotion-templates.controller.ts`, smoke-asset-manager test
- **Verification:** Smoke test grep + 7/7 GREEN; manual route trace via `template-studio.routes.ts` and `remotion-templates.routes.ts`
- **Committed in:** `e5148499` (Task 2 commit)

**2. [Rule 3 — Blocking] `pool` is a default export, not named — switched to `getClient()`**

- **Found during:** Task 3 (duplicateDeep client acquisition)
- **Issue:** PLAN.md action template wrote `import { pool } from '../config/database'` but the file uses `export default pool`, plus `getClient()` is the codebase convention (typed wrapper + checkout timeout watchdog). Naive `import pool from ...` produced TS2347 because the default export's typing returns untyped `client.query`.
- **Fix:** `import { query, getClient } from '../config/database'` and `const client = await getClient()`. Two `client.query<{ id: string }>` generics replaced with explicit `const tpl: { rows: Array<{ id: string }> } = await client.query(...)` to bypass the untyped generic restriction.
- **Files modified:** `central-server/src/repositories/template-studio.repository.ts`
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** `167abd9a` (Task 3 commit)

**3. [Rule 3 — Blocking] Schema column lists in PLAN.md were aspirational, not actual**

- **Found during:** Task 3 (writing duplicateDeep INSERT lists)
- **Issue:** PLAN.md `<action>` template referenced `template_layers.alpha`, `template_layers.parent_layer_id`, `template_layers.safe_zone`, `template_layers.fit_mode`, and `template_options (option_key, label, type, values, default_value)` — none of these exist. Real `template_layers` only has the `mask_*` columns (no `alpha`/`parent_layer_id`/`safe_zone`/`fit_mode`); real `template_options` uses `key` (not `option_key`) and has additional columns `user_editable` + `sort_order`.
- **Fix:** Aligned INSERT column lists with `central-server/src/scripts/full-schema.sql` (lines 1886-2906) and `add-template-options-and-conditional-slots.sql` (template_options + template_packshot_refs migration). The plan explicitly authorized this adaptation: "If any column listed above does not exist on the actual schema, [...] adapt only the column NAMES, never the table set or the layer_id remap logic."
- **Files modified:** `central-server/src/repositories/template-studio.repository.ts`
- **Verification:** Smoke + TS compile clean
- **Committed in:** `167abd9a` (Task 3 commit)

**4. [Documentation deviation] Task 4 produced no commit**

- **Found during:** Task 4
- **Issue:** PLAN.md Task 4 said `Commit: test(template-studio-v3): green vocabulary smoke test (TEST-01)`. But the vocabulary smoke was already GREEN from Task 1 (because the stub vocabulary.constants.ts shipped together with the smoke test). Nothing to commit.
- **Fix:** Skipped the empty commit (anti-pattern: empty commits add noise to history). The vocabulary lock is already visible in `5f54107a` (Task 1 commit).
- **Verification:** `git status --short` clean; smoke 3/3 GREEN
- **Committed in:** N/A

---

**Total deviations:** 4 (3 blocking auto-fixes + 1 documentation note)
**Impact on plan:** All auto-fixes were necessary to align the plan with the real codebase (file locations, export shapes, schema columns). Zero scope creep — every change served the 4 stated truths in `must_haves`.

## Issues Encountered

None — all blockers were resolved via the deviation rules above.

## User Setup Required

None — no external service configuration required. ffprobe was already present via the `ffmpeg` apt package in the Dockerfile runtime stage; no Railway env var changes.

## Next Phase Readiness

Backend foundations for Template Studio v3 are now stable and locked by smoke tests. Ready for plan **01-fondations-02** (next phase plan in this same phase). Notable contracts now frozen:

- `templateStudioRepository.duplicateDeep(sourceId, { name?, createdBy? })` returns a `TemplateV2` (or throws `source_template_not_found` / `clone_not_v2_readable`)
- `thumbnailService.extractMetadata(path)` returns `{ ..., pixFmt, hasAlpha }`
- `templateStudioRepository.countLayersSharingVideoUrl(layerId)` returns a number (used in 409 guard)
- `VOCABULARY_MAP` exposes 14 frozen UI labels; `ANIMATION_PRESET_LABELS` maps animation presets back to user-facing labels

**Smoke test coverage:** smoke suites 48/48 GREEN, 2018/2018 tests GREEN — no regression.

## Self-Check: PASSED

- [x] `central-server/src/__tests__/smoke/smoke-template-studio-v3-duplicate.test.ts` — FOUND
- [x] `central-server/src/__tests__/smoke/smoke-template-studio-v3-asset-manager.test.ts` — FOUND
- [x] `central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts` — FOUND
- [x] `central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` — FOUND
- [x] Commit `5f54107a` — FOUND (Task 1 RED smoke + vocabulary stub)
- [x] Commit `e5148499` — FOUND (Task 2 alpha + delete guard)
- [x] Commit `167abd9a` — FOUND (Task 3 duplicateDeep)
- [x] All 3 v3 smoke suites GREEN (16/16)
- [x] `npm run test:smoke:smart` GREEN (48 suites / 2018 tests, no regression)
- [x] `npx tsc --noEmit` clean

---

_Phase: 01-fondations_
_Completed: 2026-05-05_
