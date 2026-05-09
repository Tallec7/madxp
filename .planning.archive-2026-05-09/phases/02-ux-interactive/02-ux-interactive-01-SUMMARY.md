---
phase: 02-ux-interactive
plan: 01
subsystem: dashboard
tags: [template-studio-v3, vocabulary, error-messages, smoke-test, banlist]

# Dependency graph
requires:
  - 'VOCABULARY_MAP + ANIMATION_PRESET_LABELS exported from vocabulary.constants.ts (Phase 1 plan 01)'
  - 'Backend error codes asset_alpha_required / duplicate_requires_v2 / asset_in_use produced by Phase 1 controllers'
  - 'smoke-template-studio-v3-vocabulary 3 baseline assertions (Phase 1 plan 01)'
provides:
  - 'ERROR_MESSAGES const (FR strings keyed by snake_case backend codes) — frozen via `as const`, ErrorMessageCode type alias'
  - 'Directory-wide banlist scan over central-dashboard/.../studio-v3/**/*.{ts,html} — 5 forbidden DB jargon strings (layer/slot/pix_fmt/option_key/composition_id)'
  - '{N} placeholder convention for runtime interpolation (e.g. usedByPublishedCount)'
affects: [02-ux-interactive-02, 02-ux-interactive-03, 02-ux-interactive-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Directory-recursive smoke scan via fs.readdirSync({withFileTypes:true}) — pattern from smoke-template-studio-v3-asset-manager'
    - 'Quoted-bare-word regex banlist `(['"])${banned}\\1` — allows substrings of identifiers (templateLayer, slotKey) while banning standalone string literals'
    - 'Placeholder interpolation pattern `ERROR_MESSAGES.code.replace("{N}", String(value))` for backend payload context'

key-files:
  created:
    - '.planning/phases/02-ux-interactive/02-ux-interactive-01-SUMMARY.md'
  modified:
    - 'central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts (+48/-3 — 2 new it blocks + helper + BANLIST const)'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (+26 — ERROR_MESSAGES const + ErrorMessageCode type)'

key-decisions:
  - 'ERROR_MESSAGES exported as a third frozen `as const` map alongside VOCABULARY_MAP and ANIMATION_PRESET_LABELS — same vocabulary.constants.ts file (single source of truth for v3 lexicon)'
  - 'Banlist scan excludes vocabulary.constants.ts itself — Test 3 already covers it with stricter rules; the file legitimately mentions DB column names on the right side of VOCABULARY_MAP for traceability'
  - 'Regex `(['"])${banned}\\1` chosen over word-boundary `\\b` to allow templateLayer / slotKey / pixFmtMode identifiers — only standalone string literals are banned'
  - '{N} placeholder convention (vs ICU-style {count, plural}) — minimal, no library dependency; downstream plans interpolate via .replace() at call site'

requirements-completed: [UX-01]

# Metrics
duration: ~10min
completed: 2026-05-05
---

# Phase 2 Plan 01: Vocabulary Smoke Banlist + ERROR_MESSAGES Summary

**Frozen FR translations for the 3 Phase 1 backend error codes shipped in `ERROR_MESSAGES` (`as const`), and the vocabulary smoke now scans the entire `studio-v3/` directory tree to ban DB jargon string literals (`'layer'`, `'slot'`, `'pix_fmt'`, `'option_key'`, `'composition_id'`).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-05T09:45Z
- **Completed:** 2026-05-05T09:55Z
- **Tasks:** 2 (TDD: RED smoke → GREEN code)
- **Files modified:** 2

## Accomplishments

- **ERROR_MESSAGES const** ships 3 FR translations frozen by `as const`:
  - `asset_alpha_required` → "Ce fond nécessite la transparence (canal alpha) — ré-exportez en yuva420p."
  - `duplicate_requires_v2` → "Ce template ne peut pas être dupliqué (version 1 — migration requise)."
  - `asset_in_use` → "Cet asset est utilisé par {N} template(s) publié(s) — désassignez-le d'abord."
- **`ErrorMessageCode` type alias** exported (`keyof typeof ERROR_MESSAGES`) — Plans 02/03/04 import the type for typed lookup.
- **Smoke `smoke-template-studio-v3-vocabulary`** extended from 3 → 5 assertions:
  - Test 4: `ERROR_MESSAGES` const present + each Phase 1 code keyed with a non-empty string.
  - Test 5: directory-wide banlist scan via `listFilesRecursive(studioV3Dir, ['.ts','.html'])`, excludes `vocabulary.constants.ts`. Reports `<file>:<line>: <text>` on hit.
- **`npm run test:smoke:smart`** GREEN (180/180 — only smoke-remotion suite touched files).
- **`ng build --configuration=development`** clean (32.8s, no TS errors, `studio-v3-wizard-component` chunk unchanged at 147.68 kB).

## Banlist enforcement scope

```
central-dashboard/src/app/features/content/remotion-templates/studio-v3/**/*.{ts,html}
  ├── asset-manager/      ← scanned
  ├── wizard/             ← scanned
  ├── wizard-state.types.ts ← scanned
  └── vocabulary.constants.ts ← EXCLUDED (covered by Test 3 with stricter rules)

Banned string literals (singular DB jargon, exact match inside quotes):
  'layer'  "layer"
  'slot'   "slot"
  'pix_fmt'  "pix_fmt"
  'option_key'  "option_key"
  'composition_id'  "composition_id"

Allowed (substrings of identifiers — never quoted bare words):
  templateLayer, layerId, layers, slotKey, slots, pixFmt, optionKeys, compositionId, etc.
```

## {N} Placeholder Convention

Backend produces:

```json
{ "error": "asset_in_use", "detail": { "usedByPublishedCount": 3 } }
```

Frontend (Plans 02/03/04) interpolates at call site:

```typescript
import { ERROR_MESSAGES, ErrorMessageCode } from '../vocabulary.constants';

const code = err.error as ErrorMessageCode;
const msg = ERROR_MESSAGES[code].replace('{N}', String(err.detail?.usedByPublishedCount ?? '?'));
this.toastr.error(msg);
```

No ICU plural lib dependency. Codes without `{N}` (`asset_alpha_required`, `duplicate_requires_v2`) just render verbatim.

## Task Commits

1. **Task 1: Extend vocabulary smoke with banlist + ERROR_MESSAGES guard (RED)** — `c764fe89` (test)
2. **Task 2: Ship ERROR_MESSAGES vocabulary map (GREEN)** — `107f3d9c` (feat)

## Files Created/Modified

**Created:**

- `.planning/phases/02-ux-interactive/02-ux-interactive-01-SUMMARY.md` (this file)

**Modified:**

- `central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts` — added `studioV3Dir`, `BANLIST` const, `listFilesRecursive` helper, 2 new `it(...)` blocks (Test 4 ERROR_MESSAGES + Test 5 directory banlist).
- `central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` — appended `ERROR_MESSAGES` const (`as const`) with 3 entries + `ErrorMessageCode` type alias. Existing `VOCABULARY_MAP` and `ANIMATION_PRESET_LABELS` untouched.

## Decisions Made

- **Single file for v3 lexicon** — ERROR_MESSAGES lives next to VOCABULARY_MAP / ANIMATION_PRESET_LABELS so a future plan can grep one path for "v3 vocabulary" and refactor atomically. Splitting per concern would dilute the smoke contract.
- **Quoted-bare-word regex over word-boundary** — `(['"])${banned}\\1` only matches `'layer'` / `"layer"`, NOT `'layerId'` or `templateLayer`. This avoids false positives on legitimate identifiers while catching the exact UX leak (DB jargon shipped as user-visible string). Word-boundary `\\b` would over-match.
- **Exclude vocabulary.constants.ts from Test 5** — that file legitimately contains `'template_layers'`, `'template_text_fields | template_image_slots'` etc. on the right side of the VOCABULARY_MAP. Test 3 already covers it with the stricter rule (bans `'layer'`/`'slot'`/`'pix_fmt'` as bare singular forms in that one file).
- **`as const` over enum** — preserves literal types so downstream `ERROR_MESSAGES['asset_alpha_required']` is typed as the literal string, not `string`. Plays better with `keyof typeof` for `ErrorMessageCode`.
- **Backend stays language-agnostic** — confirmed in CONTEXT.md decisions: backend returns snake_case codes, frontend = source of truth UX. No FR string ever leaks into central-server.

## Deviations from Plan

None — plan executed exactly as written. Both tasks ran clean (RED → GREEN as specified), no blocking issues, no schema surprises, no auth gates. Smart smoke matched only `smoke-remotion` for the diff scope (vocabulary smoke + dashboard constants); the explicit vocabulary suite was run separately and confirmed 5/5 GREEN before commit.

## Issues Encountered

None.

## User Setup Required

None — pure code change, no env vars, no migrations, no FTP.

## Next Phase Readiness

Plan 02-ux-interactive-02 (Player live integration) can now:

- `import { ERROR_MESSAGES, ErrorMessageCode } from '../vocabulary.constants'` for typed error toasts on render/upload failures.
- Add new error codes (e.g. `preview_render_failed`) by appending to ERROR_MESSAGES + extending Test 4 in the same PR.
- Trust the directory banlist: any `'layer'` / `'slot'` / `'pix_fmt'` / `'option_key'` / `'composition_id'` introduced anywhere under `studio-v3/` will fail smoke immediately.

Plans 03 and 04 inherit the same guarantees.

## Self-Check: PASSED

- [x] `central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts` — FOUND (extended with BANLIST + ERROR_MESSAGES tests)
- [x] `central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` — FOUND (ERROR_MESSAGES + ErrorMessageCode exported)
- [x] Commit `c764fe89` — FOUND (Task 1 RED smoke extension)
- [x] Commit `107f3d9c` — FOUND (Task 2 ERROR_MESSAGES ship)
- [x] Vocabulary smoke 5/5 GREEN
- [x] `npm run test:smoke:smart` 180/180 GREEN (no regression)
- [x] `ng build` clean (32.8s, no TS errors)
- [x] Banlist scan returns 0 hits across studio-v3/ (excluding vocabulary.constants.ts)

---

_Phase: 02-ux-interactive_
_Completed: 2026-05-05_
