---
phase: 02-ux-interactive
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts
autonomous: true
requirements: [UX-01]
must_haves:
  truths:
    - "Tout fichier .ts/.html sous central-dashboard/.../studio-v3/ est interdit de contenir les chaînes string-quoted 'layer', 'slot', 'pix_fmt', 'option_key', 'composition_id' (banlist verrouillée par smoke test)."
    - "Les codes d'erreur backend (asset_alpha_required, duplicate_requires_v2, asset_in_use) sont traduits en français via ERROR_MESSAGES côté front — backend reste agnostique de la langue."
    - 'Les 14 labels métier de VOCABULARY_MAP existant restent figés (régression bloquée par smoke vocabulary).'
  artifacts:
    - path: 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts'
      provides: 'ERROR_MESSAGES const (FR strings keyed by backend snake_case codes), in addition to existing VOCABULARY_MAP and ANIMATION_PRESET_LABELS'
      contains: 'export const ERROR_MESSAGES'
    - path: 'central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts'
      provides: 'Existing 3 assertions + new banlist scan over studio-v3/ directory + ERROR_MESSAGES presence assertion'
      contains: 'BANLIST'
  key_links:
    - from: 'smoke-template-studio-v3-vocabulary.test.ts'
      to: 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/**/*.{ts,html}'
      via: 'fs.readdirSync recursive scan + regex match against banlist'
      pattern: "for\\s*\\(\\s*const\\s+banned\\s+of\\s+BANLIST"
    - from: 'vocabulary.constants.ts'
      to: 'Backend error codes returned by remotion-templates.controller.ts'
      via: 'ERROR_MESSAGES[code] lookup côté front'
      pattern: "ERROR_MESSAGES\\[.*?\\]"
---

## Phase 1 contracts consumed

- `central-dashboard/.../studio-v3/vocabulary.constants.ts` — Plan 01 created `VOCABULARY_MAP` (14 labels) + `ANIMATION_PRESET_LABELS` (5 entries). This plan EXTENDS the file with `ERROR_MESSAGES` — never modifies the existing exports.
- `central-server/.../smoke-template-studio-v3-vocabulary.test.ts` — Plan 01 wrote 3 assertions (file exists, contains every SPEC label, bans `'layer'`/`'slot'`/`'pix_fmt'` as string values inside that one file). This plan EXTENDS the test with: (1) banlist scan across the whole `studio-v3/` directory tree, (2) presence check on `ERROR_MESSAGES`, (3) extended banlist with `'option_key'` and `'composition_id'`.
- Backend already returns `400 asset_alpha_required`, `400 duplicate_requires_v2`, `409 asset_in_use { usedByPublishedCount }` (see `01-fondations-VERIFICATION.md` Key Link Verification). No backend change needed in this plan.

<objective>
Extend the v3 vocabulary contract so that (1) all backend error codes have a frozen FR translation in `ERROR_MESSAGES`, and (2) the smoke test enforces a hard banlist of DB jargon strings across the entire `studio-v3/` directory tree — not only inside `vocabulary.constants.ts`.

Purpose: Plans 02/03/04 will surface backend errors and add new UI strings. Without a directory-wide banlist + a centralized `ERROR_MESSAGES` map, the team will inevitably leak `'layer'`/`'slot'` literals or hardcode FR error strings inline. Smoke-first: the extended test must be RED before the new code is shipped, GREEN after.

Output: `vocabulary.constants.ts` exports a third frozen const `ERROR_MESSAGES`. The smoke test scans every `.ts`/`.html` file under `studio-v3/` and fails on banlist hits.
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
@.planning/phases/01-fondations/01-fondations-01-SUMMARY.md
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/testing.md
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
@central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts

<interfaces>
<!-- Existing exports the new code MUST NOT remove or rename -->

From central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (Plan 01 contract):

```typescript
export const VOCABULARY_MAP = {
  'Fond animé': 'template_layers',
  'Zone modifiable': 'template_text_fields | template_image_slots',
  // ... 14 entries total — DO NOT remove or rename
} as const;

export const ANIMATION_PRESET_LABELS = {
  fade: 'Apparition',
  'slide-up': 'Glissement',
  'slide-down': 'Glissement',
  zoom: 'Zoom arrière',
  'logo-pop': 'Logo Pop',
} as const;
```

Backend error codes produced by Phase 1 (verified in 01-fondations-VERIFICATION.md):

- `400 { error: 'asset_alpha_required' }` — POST /api/remotion-templates/:id/assets when `respect_alpha=true` and source has no alpha (remotion-templates.controller.ts:348,865)
- `400 { error: 'duplicate_requires_v2' }` — POST /api/remotion-templates/:id/duplicate when source has `schema_version=1` (remotion-templates.controller.ts:645)
- `409 { error: 'asset_in_use', detail: { usedByPublishedCount: number } }` — DELETE /:id/layers/:layerId or DELETE /assets/:assetId when shared with a published template (remotion-templates.controller.ts:928, template-studio.controller.ts:221)
  </interfaces>
  </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend vocabulary smoke with directory-wide banlist (RED)</name>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts (full file)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (full file)
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-asset-manager.test.ts (reference pattern for fs.readdir / regex assertions)
  </read_first>
  <behavior>
    - Test 1: existing "exports a VOCABULARY_MAP const" stays green
    - Test 2: existing "contains every SPEC label key" stays green
    - Test 3: existing single-file banlist stays green
    - Test 4 (NEW): "exports an ERROR_MESSAGES const with FR strings for every Phase 1 backend error code" — RED until Task 2 ships
    - Test 5 (NEW): "no .ts/.html file under studio-v3/ contains banned DB jargon as a string-quoted value" — scans the entire directory tree, fails on first hit with file path + offending line. Banlist: 'layer', 'slot', 'pix_fmt', 'option_key', 'composition_id'. Must allow these as substrings of legitimate identifiers (e.g., `templateLayer`, `imageSlots`, `slotKey`) — only ban them as standalone string literals like `'layer'` or `"slot"`.
  </behavior>
  <action>
    Edit `central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts`. Append two new `it(...)` blocks at the end of the existing `describe(...)`. Do NOT modify the 3 existing assertions.

    Add at top-level (after existing imports):

    ```typescript
    const studioV3Dir = path.join(
      repoRoot,
      'central-dashboard',
      'src',
      'app',
      'features',
      'content',
      'remotion-templates',
      'studio-v3',
    );

    const BANLIST = ['layer', 'slot', 'pix_fmt', 'option_key', 'composition_id'] as const;

    function listFilesRecursive(dir: string, exts: string[]): string[] {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listFilesRecursive(full, exts));
        else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
      }
      return out;
    }
    ```

    Add Test 4 (will be RED until Task 2 commits ERROR_MESSAGES):

    ```typescript
    it('exports an ERROR_MESSAGES const with FR strings for every Phase 1 backend error code', () => {
      expect(content).toMatch(/export\s+const\s+ERROR_MESSAGES\b/);
      // The 3 codes thrown by Phase 1 backend (see 01-fondations-VERIFICATION.md)
      expect(content).toMatch(/asset_alpha_required\s*:\s*['"][^'"]+['"]/);
      expect(content).toMatch(/duplicate_requires_v2\s*:\s*['"][^'"]+['"]/);
      expect(content).toMatch(/asset_in_use\s*:\s*['"][^'"]+['"]/);
    });
    ```

    Add Test 5 (directory-wide banlist):

    ```typescript
    it('no studio-v3/ source file leaks DB jargon as a string-quoted value', () => {
      const files = listFilesRecursive(studioV3Dir, ['.ts', '.html']);
      // Exclude vocabulary.constants.ts from this scan — it intentionally
      // mentions DB column names on the right side of VOCABULARY_MAP for
      // traceability (e.g. 'template_layers'). Test 3 already covers it
      // with a stricter rule on bare singular forms.
      const scanFiles = files.filter((f) => !f.endsWith('vocabulary.constants.ts'));
      const offenders: string[] = [];
      for (const file of scanFiles) {
        const text = fs.readFileSync(file, 'utf8');
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          for (const banned of BANLIST) {
            // Match the bare word inside single OR double quotes only.
            // Allow templateLayer, slotKey, etc. (substrings of identifiers).
            const re = new RegExp(`(['"])${banned}\\1`);
            if (re.test(lines[i])) {
              offenders.push(`${path.relative(repoRoot, file)}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    });
    ```

    Then run from `/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server`:
    ```
    npx jest --testPathPattern='smoke/smoke-template-studio-v3-vocabulary' --no-coverage --forceExit
    ```
    Expect: Test 4 RED (no ERROR_MESSAGES yet). Tests 1-3 + 5 should currently be GREEN (unless an existing studio-v3 file already leaks — in which case fix immediately as part of this task before commit).

    Commit: `test(template-studio-v3): extend vocabulary smoke with banlist + ERROR_MESSAGES guard (UX-01)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-vocabulary' --no-coverage --forceExit 2>&1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "BANLIST" central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts` returns ≥1
    - `grep -n "ERROR_MESSAGES" central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts` returns ≥1
    - `grep -n "listFilesRecursive\|readdirSync" central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts` returns ≥1
    - Jest run reports exactly 1 failing test ("exports an ERROR_MESSAGES const ...") at this point — all other tests GREEN.
    - Commit hash exists with prefix `test(template-studio-v3)`.
  </acceptance_criteria>
  <done>RED smoke committed; only the ERROR_MESSAGES test fails (Tests 1-3 + Test 5 GREEN).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Ship ERROR_MESSAGES const (GREEN)</name>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (full file)
    - .planning/phases/02-ux-interactive/02-CONTEXT.md (decisions section, "Périmètre du vocabulaire métier (UX-01)")
  </read_first>
  <behavior>
    - The 3 codes thrown by Phase 1 backend get FR translations.
    - The const is `as const` (literal type preserved for downstream Plan 02/03/04 lookups).
    - Existing VOCABULARY_MAP and ANIMATION_PRESET_LABELS unchanged.
  </behavior>
  <action>
    Edit `central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts`. Append at the end of the file (after `ANIMATION_PRESET_LABELS`):

    ```typescript
    /**
     * Frozen FR translations for backend error codes (snake_case).
     *
     * Backend stays language-agnostic: routes return `{ error: '<code>' }`
     * and the dashboard looks the message up via `ERROR_MESSAGES[code]`.
     * Adding a new backend code requires:
     *   1. Adding the entry below (FR string).
     *   2. Updating smoke-template-studio-v3-vocabulary if the new code
     *      is a Phase 1/2/3 contract that should be locked.
     *
     * Plan 02/03/04 will add more entries (preview-related codes etc.).
     */
    export const ERROR_MESSAGES = {
      asset_alpha_required:
        "Ce fond nécessite la transparence (canal alpha) — ré-exportez en yuva420p.",
      duplicate_requires_v2:
        "Ce template ne peut pas être dupliqué (version 1 — migration requise).",
      asset_in_use:
        "Cet asset est utilisé par {N} template(s) publié(s) — désassignez-le d'abord.",
    } as const;

    export type ErrorMessageCode = keyof typeof ERROR_MESSAGES;
    ```

    The `{N}` placeholder is interpolated by the caller (e.g., `ERROR_MESSAGES.asset_in_use.replace('{N}', String(usedByPublishedCount))`). Phase 2 plans 02/03/04 will use this pattern.

    Run from `/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server`:
    ```
    npx jest --testPathPattern='smoke/smoke-template-studio-v3-vocabulary' --no-coverage --forceExit
    ```
    Expect: 5/5 GREEN.

    Run also `cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development` to confirm no TS regression on the existing `as const` consumers.

    Commit: `feat(template-studio-v3): ship ERROR_MESSAGES vocabulary map (UX-01)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-vocabulary' --no-coverage --forceExit 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export const ERROR_MESSAGES" central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` returns 1
    - `grep -nE "asset_alpha_required|duplicate_requires_v2|asset_in_use" central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` returns ≥3
    - `grep -n "as const" central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts` returns ≥3 (VOCABULARY_MAP, ANIMATION_PRESET_LABELS, ERROR_MESSAGES)
    - Smoke vocabulary 5/5 GREEN.
    - `ng build` clean.
    - Commit hash exists with prefix `feat(template-studio-v3)`.
  </acceptance_criteria>
  <done>5 vocabulary smoke tests GREEN, ERROR_MESSAGES exported, ng build clean. Plans 02/03/04 can now consume ERROR_MESSAGES safely.</done>
</task>

</tasks>

<verification>
- All 5 vocabulary smoke tests GREEN.
- `npm run test:smoke:smart` GREEN (no regression on adjacent suites).
- `cd central-dashboard && npx ng build --configuration=development` clean.
- `grep -rn "'layer'\|'slot'\|'pix_fmt'\|'option_key'\|'composition_id'" central-dashboard/src/app/features/content/remotion-templates/studio-v3/` (excluding vocabulary.constants.ts) returns 0 hits.
</verification>

<success_criteria>

- ERROR_MESSAGES is frozen (`as const`) with the 3 Phase 1 codes.
- Smoke vocabulary scans the entire studio-v3 tree and bans 5 jargon strings.
- Plans 02/03/04 have a contract to import (`import { ERROR_MESSAGES } from '../vocabulary.constants'`) instead of inlining FR error strings.
  </success_criteria>

<output>
After completion, create `.planning/phases/02-ux-interactive/02-ux-interactive-01-SUMMARY.md` documenting:
- ERROR_MESSAGES frozen entries
- Banlist enforcement scope (directory glob)
- Pattern for plans 02/03/04 to interpolate `{N}` placeholders
</output>
