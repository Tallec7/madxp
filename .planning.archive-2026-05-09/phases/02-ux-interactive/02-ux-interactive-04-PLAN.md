---
phase: 02-ux-interactive
plan: 04
type: execute
wave: 3
depends_on: [02-ux-interactive-01, 02-ux-interactive-02]
files_modified:
  - central-server/src/repositories/template-studio.repository.ts
  - central-server/src/controllers/template-studio.controller.ts
  - central-server/src/middleware/validation.ts
  - central-server/src/routes/template-studio.routes.ts
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-options.test.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.html
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.scss
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html
autonomous: true
requirements: [UX-03]
must_haves:
  truths:
    - "Sous chaque option de Step 4, l'admin voit en inline « ✓ N zones reliées à cette option » sans action manuelle (auto-detect via regex `\\b{key}\\s*==` sur visibleIf — convention Plan 05 préservée)."
    - 'Cliquer sur le compteur surligne les zones concernées dans le Player ET scroll-into-view la zone correspondante en Step 3.'
    - "Supprimer une VALEUR d'option utilisée par ≥1 zone affiche une modal de confirmation FR ('Cette valeur est utilisée par N zones, qui deviendront toujours visibles si vous la supprimez. Continuer ?')."
    - "Renommer une CLÉ d'option auto-update les `visible_if` des zones concernées dans la même transaction DB (BEGIN/COMMIT) — atomique, jamais de drift."
  artifacts:
    - path: 'central-server/src/repositories/template-studio.repository.ts'
      provides: "Nouvelle méthode renameOptionKey(templateId, oldKey, newKey) — transactionnelle (BEGIN/COMMIT/ROLLBACK), UPDATE template_options.key + UPDATE des visible_if matching '\\b{oldKey}\\s*==' sur text_fields ET image_slots + UPDATE template_packshot_refs.option_key (FK)."
      contains: 'renameOptionKey'
    - path: 'central-server/src/controllers/template-studio.controller.ts'
      provides: 'Handler renameOptionKey — POST /:id/options/:optionId/rename body { newKey }, surface 400 conflict si newKey déjà utilisé, 200 returns updated counts.'
      contains: 'renameOptionKey'
    - path: 'central-server/src/__tests__/smoke/smoke-template-studio-v3-options.test.ts'
      provides: 'File-based smoke: assert renameOptionKey is wrapped in BEGIN/COMMIT, UPDATEs visible_if + packshot_refs, route POST /:id/options/:optionId/rename mounted with super_admin guard + Joi validation.'
      contains: 'renameOptionKey'
    - path: 'central-dashboard/.../wizard-step-options.component.ts'
      provides: 'Inline counter ✓ N (was Plan 05) + click handler emitting linkedZonesClick(optionKey) → consumed by shell to highlight in Player + scroll Step 3 ; modal confirmation on value removal ; rename UI calling new endpoint.'
      contains: 'onLinkedZonesClick'
  key_links:
    - from: 'wizard-step-options.component.ts countLinkedZones (Plan 05 existing)'
      to: 'Inline UI label ✓ N zones reliées (kept) + new (click) handler'
      via: '(click)="onLinkedZonesClick(opt.key)"'
      pattern: 'onLinkedZonesClick'
    - from: 'shell linkedZonesClick handler'
      to: 'WizardPreviewPanelComponent + Step 3 zone list scroll'
      via: 'shell.highlightZonesByOptionKey(key) — sets a signal read by preview panel for overlay + uses queryParam/anchor scroll for Step 3'
      pattern: 'highlightZonesByOptionKey|highlightedOptionKey'
    - from: 'renameOptionKey API'
      to: 'template_text_fields.visible_if + template_image_slots.visible_if + template_packshot_refs.option_key'
      via: 'Single BEGIN/COMMIT transaction, regex update OR FK propagation'
      pattern: "BEGIN[\\s\\S]+visible_if[\\s\\S]+packshot_refs[\\s\\S]+COMMIT"
---

## Phase 1 contracts consumed

- `WizardStepOptionsComponent` (Plan 01-05) — already has `countLinkedZones(optionKey: string): number` using regex `\b{key}\s*==` on `visibleIf` text + image. Already renders « ✓ N zones reliées » (verified in Plan 05 SUMMARY line 112). This plan EXTENDS the inline counter into a clickable element + adds value-removal modal + adds rename UI/endpoint.
- `templateStudioRepository` (Plan 01-01) — `getClient()` transactional pattern already established. New `renameOptionKey` follows the same BEGIN/COMMIT/ROLLBACK shape as `duplicateDeep` and `reorderLayers`.
- `template_options.key` + `template_packshot_refs.option_key` — Plan 01-05 documented these as the real DB columns (NOT `option_key` on template_options; `option_key` is the FK column on `template_packshot_refs` only). The rename must therefore UPDATE both `template_options.key` AND `template_packshot_refs.option_key` plus the regex-rewritten `visible_if` strings on text_fields + image_slots.
- `WizardPreviewPanelComponent` (Plan 02-02) — already mounted in shell. This plan ADDS an `@Input highlightedOptionKey: string | null` that, when set, draws semi-transparent overlays over the linked zones (visual highlight). Implementation can be CSS-only via a class on the player wrapper that styles a SVG/div overlay layer — keep simple for v3.0.
- `ERROR_MESSAGES` (Plan 02-01) — new error codes added: `option_key_conflict` (rename to a key already used), `option_value_in_use` (informational, NOT blocking — used by the modal).
- Plan 05 dataservice methods (`createOption`, `deleteOption`, `createPackshotRef`, etc.) — extended with new `renameOptionKey(templateId, optionId, newKey)`.

<objective>
Make the visible_if relationship between options (Step 4) and zones (Step 3) discoverable, clickable, and safely editable. Specifically:

1. **Auto-detection feedback (UX-03 core)** — The « ✓ N zones reliées » counter (Plan 05) becomes a clickable element. Click → the shell sets `highlightedOptionKey` signal → the Player draws overlays on the linked zones AND the wizard scrolls Step 3 into view (or opens it temporarily for highlight). Clicking elsewhere clears the highlight.

2. **Option VALUE removal confirmation** — When the admin removes a value from an option's value list (e.g., removes `'logo'` from `intro_mode = ['logo', 'numero']`), if any zone has `visibleIf` matching `intro_mode == 'logo'`, show a FR confirmation modal: « Cette valeur est utilisée par {N} zones, qui deviendront toujours visibles si vous la supprimez. Continuer ? ». Approve → proceed; cancel → abort.

3. **Option KEY rename — atomic transaction** — When the admin renames an option's `key` (e.g., `intro_mode` → `intro_type`), the backend must UPDATE in the SAME DB transaction: `template_options.key`, `template_packshot_refs.option_key` (FK), AND the regex-rewritten `visible_if` strings on `template_text_fields` and `template_image_slots` (replace `\bintro_mode\s*==` with `intro_type ==`). If any step fails → ROLLBACK → no drift.

Purpose: Without this, option-zone relationships are visible but inert. The admin can see "2 zones reliées" but cannot drill in. Worse, removing a value silently orphans visible_if conditions, and renaming a key breaks every linked zone simultaneously.

Output:

- New backend route `POST /:id/options/:optionId/rename` + repository `renameOptionKey()` + Joi schema + smoke `smoke-template-studio-v3-options.test.ts`.
- Dashboard: Plan 05's `WizardStepOptionsComponent` extended with click handler on the counter, value-removal modal, rename button.
- Preview panel `highlightedOptionKey` integration (visual overlay).
- Plan 02-01's `ERROR_MESSAGES` extended with `option_key_conflict` + `option_value_in_use`.
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
@.planning/phases/01-fondations/01-fondations-05-SUMMARY.md
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/testing.md
@central-server/src/repositories/template-studio.repository.ts
@central-server/src/controllers/template-studio.controller.ts
@central-server/src/middleware/validation.ts
@central-server/src/routes/template-studio.routes.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-options.component.ts
@central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts

<interfaces>
<!-- DB shapes from Plan 01-05 SUMMARY -->

template_options : { id, template_id, key, label, type, values JSONB, default_value, user_editable, sort_order }
^ rename target column

template_packshot_refs : { id, template_id, option_key VARCHAR(64) FK→template_options.key, option_value, packshot_template_id, ... }
^ FK column — also updated on rename

template_text_fields.visible_if : VARCHAR — string like "intro_mode == 'logo'" — needs regex rewrite on rename
template_image_slots.visible_if : VARCHAR — same shape

<!-- Existing repo transactional pattern (from duplicateDeep, Plan 01-01) -->

const client = await getClient();
try {
await client.query('BEGIN');
// ... N queries
await client.query('COMMIT');
} catch (e) {
await client.query('ROLLBACK');
throw e;
} finally {
client.release();
}

<!-- New endpoint shape -->

POST /api/remotion-templates/:id/options/:optionId/rename
Auth: super_admin (JWT) + sensitiveRateLimit (30/min)
Body: { "newKey": "new_key_string" }
Joi: newKey alphanumeric snake_case, 1-64 chars (matches template_options.key VARCHAR(64))

200 OK: { id, key (= newKey), updatedTextFields: number, updatedImageSlots: number, updatedPackshotRefs: number }
400 option_key_conflict: another option on the same template already uses this key
404: option not found
500: opaque

<!-- Existing Plan 05 inline counter (countLinkedZones) — kept; this plan adds (click) -->

countLinkedZones(optionKey: string): number {
const re = new RegExp(`\\b${optionKey}\\s*==`);
const tf = this.zones().textFields.filter((f) => f.visibleIf && re.test(f.visibleIf)).length;
const is = this.zones().imageSlots.filter((s) => s.visibleIf && re.test(s.visibleIf)).length;
return tf + is;
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED smoke + transactional renameOptionKey backend (repo + Joi + controller + route)</name>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-duplicate.test.ts (file-based pattern reference for BEGIN/COMMIT/ROLLBACK assertion)
    - central-server/src/repositories/template-studio.repository.ts (duplicateDeep + reorderLayers transactional patterns; lines around the duplicateDeep BEGIN/COMMIT in Plan 01-01)
    - central-server/src/controllers/template-studio.controller.ts (Plan 04's reorderLayers handler shape — for mirroring the new rename handler structure)
    - central-server/src/routes/template-studio.routes.ts (route mount conventions, validateParams + sensitiveRateLimit + super_admin guard)
    - central-server/src/middleware/validation.ts (Plan 04 added templateStudioLayersReorder — same pattern)
  </read_first>
  <behavior>
    Smoke smoke-template-studio-v3-options asserts:
    - Test A: repository file contains `renameOptionKey` function declaration AND that function body contains `BEGIN`, `COMMIT`, `ROLLBACK` (transactional contract).
    - Test B: repository renameOptionKey body UPDATEs all 4 surfaces: `template_options` (key), `template_packshot_refs` (option_key FK), `template_text_fields` (visible_if), `template_image_slots` (visible_if). Use regex matching on `UPDATE template_text_fields[\s\S]+visible_if`, etc.
    - Test C: route file contains `POST /:id/options/:optionId/rename` (or matching pattern) mounted with `requireRole('super_admin')` AND `validate(...rename schema...)` AND `validateParams` AND `sensitiveRateLimit`.
    - Test D: validation middleware exports `templateStudioOptionRename` Joi schema with `newKey` validated as `Joi.string().pattern(/^[a-z][a-z0-9_]*$/).max(64).required()`.
    - Test E: controller surfaces `400 option_key_conflict` when the repo throws that string, and `404` when option not found.
    All RED until step B+C+D ship.
  </behavior>
  <action>
    **Step A — Create RED smoke.**

    Create `central-server/src/__tests__/smoke/smoke-template-studio-v3-options.test.ts`:

    ```typescript
    import * as fs from 'fs';
    import * as path from 'path';

    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const repoFile = path.join(repoRoot, 'central-server/src/repositories/template-studio.repository.ts');
    const ctrlFile = path.join(repoRoot, 'central-server/src/controllers/template-studio.controller.ts');
    const routeFile = path.join(repoRoot, 'central-server/src/routes/template-studio.routes.ts');
    const validationFile = path.join(repoRoot, 'central-server/src/middleware/validation.ts');

    describe('Template Studio v3 — option key rename + visible_if propagation (UX-03)', () => {
      it('A: repository renameOptionKey is wrapped in BEGIN/COMMIT/ROLLBACK', () => {
        const src = fs.readFileSync(repoFile, 'utf8');
        expect(src).toMatch(/(?:async\s+)?renameOptionKey\s*\(/);
        // Find the function body — naive but sufficient: locate function and assert all 3 keywords appear after it
        const idx = src.search(/renameOptionKey\s*\(/);
        const tail = src.slice(idx, idx + 4000);
        expect(tail).toContain('BEGIN');
        expect(tail).toContain('COMMIT');
        expect(tail).toContain('ROLLBACK');
      });

      it('B: renameOptionKey updates template_options, packshot_refs, text_fields visible_if, image_slots visible_if', () => {
        const src = fs.readFileSync(repoFile, 'utf8');
        const idx = src.search(/renameOptionKey\s*\(/);
        const tail = src.slice(idx, idx + 4000);
        expect(tail).toMatch(/UPDATE\s+template_options/);
        expect(tail).toMatch(/UPDATE\s+template_packshot_refs/);
        expect(tail).toMatch(/UPDATE\s+template_text_fields[\s\S]{0,400}visible_if/);
        expect(tail).toMatch(/UPDATE\s+template_image_slots[\s\S]{0,400}visible_if/);
      });

      it('C: route POST /:id/options/:optionId/rename is mounted with super_admin + validate + validateParams + rate limit', () => {
        const src = fs.readFileSync(routeFile, 'utf8');
        expect(src).toMatch(/['"`]\/:id\/options\/:optionId\/rename['"`]/);
        // Locate the route declaration; allow flexibility on order
        const renamePattern = /\/:id\/options\/:optionId\/rename[\s\S]{0,800}/;
        const block = src.match(renamePattern)?.[0] ?? '';
        expect(block).toMatch(/super_admin/);
        expect(block).toMatch(/validate\s*\(/);
        expect(block).toMatch(/validateParams/);
        expect(block).toMatch(/sensitiveRateLimit/);
      });

      it('D: validation middleware exports templateStudioOptionRename Joi schema', () => {
        const src = fs.readFileSync(validationFile, 'utf8');
        expect(src).toMatch(/templateStudioOptionRename\b/);
        // newKey must be a snake_case string limited to 64 chars
        const idx = src.search(/templateStudioOptionRename/);
        const tail = src.slice(idx, idx + 800);
        expect(tail).toMatch(/newKey/);
        expect(tail).toMatch(/Joi\.string\(\)/);
        expect(tail).toMatch(/\.max\(\s*64\s*\)/);
      });

      it('E: controller maps option_key_conflict → 400 and not_found → 404', () => {
        const src = fs.readFileSync(ctrlFile, 'utf8');
        const idx = src.search(/renameOptionKey/);
        expect(idx).toBeGreaterThan(-1);
        const tail = src.slice(idx, idx + 2000);
        expect(tail).toMatch(/option_key_conflict/);
        expect(tail).toMatch(/(?:status\s*\(\s*400\s*\)|400)/);
        expect(tail).toMatch(/(?:status\s*\(\s*404\s*\)|404)/);
      });
    });
    ```

    Run:
    ```
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-options' --no-coverage --forceExit
    ```
    Expect: 5/5 RED.

    Commit step A: `test(template-studio-v3): RED smoke for renameOptionKey transactional contract (UX-03)`

    **Step B — Implement renameOptionKey in repository.**

    Edit `central-server/src/repositories/template-studio.repository.ts`. Add (mirror the duplicateDeep transactional shape):

    ```typescript
    /**
     * Plan 02-04 / UX-03 — Atomic rename of an option key.
     *
     * Updates 4 surfaces in a single BEGIN/COMMIT transaction:
     *  1. template_options.key (the rename itself)
     *  2. template_packshot_refs.option_key (FK propagation)
     *  3. template_text_fields.visible_if  — regex rewrite of `\b<old>\s*==`
     *  4. template_image_slots.visible_if  — regex rewrite of `\b<old>\s*==`
     *
     * Throws:
     *   - 'option_key_conflict' when newKey is already used on the same template.
     *   - 'option_not_found'    when the (templateId, optionId) row does not exist.
     */
    async renameOptionKey(
      templateId: string,
      optionId: string,
      newKey: string,
    ): Promise<{
      id: string;
      key: string;
      updatedTextFields: number;
      updatedImageSlots: number;
      updatedPackshotRefs: number;
    }> {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // 1. Read the existing key (and confirm ownership)
        const existing: { rows: Array<{ id: string; key: string }> } = await client.query(
          'SELECT id, key FROM template_options WHERE id = $1 AND template_id = $2 FOR UPDATE',
          [optionId, templateId],
        );
        if (existing.rows.length === 0) {
          throw new Error('option_not_found');
        }
        const oldKey = existing.rows[0].key;
        if (oldKey === newKey) {
          // No-op rename; return current counts (zero updates).
          await client.query('COMMIT');
          return { id: optionId, key: newKey, updatedTextFields: 0, updatedImageSlots: 0, updatedPackshotRefs: 0 };
        }

        // 2. Conflict check
        const conflict: { rows: Array<{ id: string }> } = await client.query(
          'SELECT id FROM template_options WHERE template_id = $1 AND key = $2 AND id <> $3',
          [templateId, newKey, optionId],
        );
        if (conflict.rows.length > 0) {
          throw new Error('option_key_conflict');
        }

        // 3. Rename the option
        await client.query(
          'UPDATE template_options SET key = $1, updated_at = NOW() WHERE id = $2 AND template_id = $3',
          [newKey, optionId, templateId],
        );

        // 4. Propagate FK to packshot_refs
        const refs = await client.query(
          'UPDATE template_packshot_refs SET option_key = $1 WHERE template_id = $2 AND option_key = $3',
          [newKey, templateId, oldKey],
        );

        // 5. Rewrite visible_if on text_fields — PG regexp_replace, anchored on word boundary + ==
        // Pattern: '\b<oldKey>\s*==' replaced with '<newKey> =='. Use 'g' flag so multiple
        // occurrences in the same visible_if string are all updated.
        const tf = await client.query(
          `UPDATE template_text_fields
           SET visible_if = regexp_replace(visible_if, '\\m' || $1 || '\\M(\\s*)==', $2 || '\\1==', 'g')
           WHERE template_id = $3 AND visible_if ~ ('\\m' || $1 || '\\M\\s*==')`,
          [oldKey, newKey, templateId],
        );

        // 6. Same for image_slots
        const is = await client.query(
          `UPDATE template_image_slots
           SET visible_if = regexp_replace(visible_if, '\\m' || $1 || '\\M(\\s*)==', $2 || '\\1==', 'g')
           WHERE template_id = $3 AND visible_if ~ ('\\m' || $1 || '\\M\\s*==')`,
          [oldKey, newKey, templateId],
        );

        await client.query('COMMIT');

        return {
          id: optionId,
          key: newKey,
          updatedTextFields: tf.rowCount ?? 0,
          updatedImageSlots: is.rowCount ?? 0,
          updatedPackshotRefs: refs.rowCount ?? 0,
        };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    ```

    NOTE: The `\\m` and `\\M` are PG word-boundary escapes (left and right). The literal regex translates to `\m<oldKey>\M(\s*)==` which matches `oldKey` as a whole word followed by optional whitespace and `==`. Captures the whitespace into `\1` and reinserts it after `<newKey>`. This is the same convention as Plan 05's frontend `\b{key}\s*==` — kept consistent so that what the dashboard counts is what the backend rewrites.

    **Step C — Joi schema.**

    Edit `central-server/src/middleware/validation.ts`. Add (alongside existing `templateStudio*` schemas):

    ```typescript
    export const templateStudioOptionRename = Joi.object({
      newKey: Joi.string()
        .pattern(/^[a-z][a-z0-9_]*$/)
        .min(1)
        .max(64)
        .required()
        .messages({
          'string.pattern.base': 'newKey must be snake_case ASCII (start with letter, then [a-z0-9_]).',
        }),
    });
    ```

    **Step D — Controller handler.**

    Edit `central-server/src/controllers/template-studio.controller.ts`. Add a new exported async function `renameOptionKey`:

    ```typescript
    export const renameOptionKey = async (req: Request, res: Response): Promise<void> => {
      const { id, optionId } = req.params as { id: string; optionId: string };
      const { newKey } = req.body as { newKey: string };
      try {
        const result = await templateStudioRepository.renameOptionKey(id, optionId, newKey);
        metricsService.recordTemplateStudioOperation?.('option_rename', 'success');
        res.status(200).json(result);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === 'option_key_conflict') {
          res.status(400).json({ error: 'option_key_conflict' });
          return;
        }
        if (msg === 'option_not_found') {
          res.status(404).json({ error: 'option_not_found' });
          return;
        }
        logger.error('renameOptionKey unexpected', { id, optionId, err: msg });
        metricsService.recordTemplateStudioOperation?.('option_rename', 'error');
        res.status(500).json({ error: 'internal' });
      }
    };
    ```

    **Step E — Mount the route.**

    Edit `central-server/src/routes/template-studio.routes.ts`. Add (after existing `/options/:optionId` routes):

    ```typescript
    router.post(
      '/:id/options/:optionId/rename',
      requireRole('super_admin'),
      sensitiveRateLimit,
      validateParams(paramSchemas.idAndOptionId), // create this paramSchema if absent — uuid for both
      validate(templateStudioOptionRename),
      renameOptionKey,
    );
    ```

    If `paramSchemas.idAndOptionId` doesn't exist, add it in `validation.ts`:
    ```typescript
    export const paramSchemas = {
      // ... existing
      idAndOptionId: Joi.object({
        id: Joi.string().uuid().required(),
        optionId: Joi.string().uuid().required(),
      }),
    };
    ```

    **Run smoke + tsc:**
    ```
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx tsc --noEmit
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-options' --no-coverage --forceExit
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npm run test:smoke:smart 2>&1 | tail -10
    ```

    Expect: 5/5 options smoke GREEN, tsc clean, smart smoke GREEN.

    Commit Step B+C+D+E: `feat(template-studio-v3): transactional renameOptionKey endpoint (UX-03)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx tsc --noEmit 2>&1 | tail -5 && npx jest --testPathPattern='smoke/smoke-template-studio-v3-options' --no-coverage --forceExit 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - File `smoke-template-studio-v3-options.test.ts` exists with 5 tests.
    - `grep -n "renameOptionKey" central-server/src/repositories/template-studio.repository.ts` returns ≥2.
    - `grep -nE "BEGIN|COMMIT|ROLLBACK" central-server/src/repositories/template-studio.repository.ts` shows ≥3 occurrences inside the renameOptionKey body.
    - `grep -n "templateStudioOptionRename" central-server/src/middleware/validation.ts` returns ≥1.
    - `grep -n "/options/:optionId/rename" central-server/src/routes/template-studio.routes.ts` returns ≥1.
    - 5/5 options smoke GREEN.
    - `tsc --noEmit` clean.
    - Commit hashes exist with prefixes `test(template-studio-v3)` and `feat(template-studio-v3)`.
  </acceptance_criteria>
  <done>Backend rename endpoint shipped end-to-end with smoke + transaction + 4 surface updates.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Dashboard wiring — clickable counter, value-removal modal, rename UI, ERROR_MESSAGES extension</name>
  <read_first>
    - central-dashboard/.../studio-v3/wizard/wizard-step-options.component.ts (full file — Plan 05 output, has countLinkedZones, form, packshot mapping)
    - central-dashboard/.../studio-v3/wizard/wizard-step-options.component.html (Plan 05 inline counter rendering ~line 112)
    - central-dashboard/.../remotion-templates-data.service.ts (Plan 05 added 6 methods — extend with renameOptionKey)
    - central-dashboard/.../studio-v3/vocabulary.constants.ts (ERROR_MESSAGES Plan 02-01 — extend with 2 new codes)
    - central-dashboard/.../studio-v3/wizard/wizard-preview-panel.component.ts (Plan 02-02 — add @Input highlightedOptionKey)
    - central-dashboard/.../studio-v3/wizard/studio-v3-wizard.component.ts (shell — coordinate the highlight + scroll)
  </read_first>
  <behavior>
    - The « ✓ N zones reliées à cette option » span (Plan 05) becomes a `<button>` with `(click)="onLinkedZonesClick(opt.key)"` — emits `linkedZonesClick(optionKey)` to the parent shell.
    - The shell catches it and (1) sets a signal `highlightedOptionKey: WritableSignal<string | null>` (read by the preview panel), (2) navigates to step 3 if currentStep ≠ 3 (so the zone list is visible), (3) computes the first matching zone id and uses `document.getElementById(zoneId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })` after a microtask delay.
    - The preview panel reads the signal via `@Input highlightedOptionKey` and applies a CSS class to the player wrapper that adds an overlay to layer/zone bounding boxes matching the visibleIf — minimal v3.0: just add a colored border around the entire player while highlight is active + a small "Surlignage : <key>" label. Full bounding-box overlay is deferred to v3.1.
    - When the admin removes a value from `valuesRaw` (Plan 05 form field) and the value is referenced by ≥1 zone (regex matching `'<value>'` after `<key>`), show a confirm() modal (or a custom modal — confirm() is acceptable for v3.0). The modal text is built from `ERROR_MESSAGES.option_value_in_use.replace('{N}', String(count))`. Approve → proceed; cancel → revert the form value.
    - Add a "Renommer" button next to the existing key chip on each option card. Clicking it opens a small inline input + Save/Cancel. On Save → calls `dataservice.renameOptionKey(templateId, optionId, newKey)` → on success: refresh option list + optimistically update visibleIf in `state.zones` (so the counter updates immediately); on 400 `option_key_conflict` → show inline error using `ERROR_MESSAGES.option_key_conflict`.
    - ERROR_MESSAGES extended with:
      - `option_key_conflict`: "Une option avec l'identifiant « {KEY} » existe déjà sur ce template."
      - `option_value_in_use`: "Cette valeur est utilisée par {N} zones, qui deviendront toujours visibles si vous la supprimez. Continuer ?"
  </behavior>
  <action>
    **Step A — Extend ERROR_MESSAGES.**

    Edit `central-dashboard/.../studio-v3/vocabulary.constants.ts`. Add to the existing `ERROR_MESSAGES` const:

    ```typescript
    export const ERROR_MESSAGES = {
      asset_alpha_required: '... existing ...',
      duplicate_requires_v2: '... existing ...',
      asset_in_use: '... existing ...',
      // Plan 02-04 (UX-03)
      option_key_conflict:
        "Une option avec l'identifiant « {KEY} » existe déjà sur ce template.",
      option_value_in_use:
        "Cette valeur est utilisée par {N} zones, qui deviendront toujours visibles si vous la supprimez. Continuer ?",
    } as const;
    ```

    Confirm vocabulary smoke 5/5 still GREEN (it tests presence of `asset_alpha_required` etc., the new entries pass through).

    **Step B — Add renameOptionKey to dataservice.**

    Edit `central-dashboard/.../remotion-templates-data.service.ts`. Add:

    ```typescript
    renameOptionKey(
      templateId: string,
      optionId: string,
      newKey: string,
    ): Observable<{
      id: string;
      key: string;
      updatedTextFields: number;
      updatedImageSlots: number;
      updatedPackshotRefs: number;
    }> {
      return this.http.post<{
        id: string;
        key: string;
        updatedTextFields: number;
        updatedImageSlots: number;
        updatedPackshotRefs: number;
      }>(
        `${this.apiUrl}/remotion-templates/${templateId}/options/${optionId}/rename`,
        { newKey },
      );
    }
    ```

    **Step C — wizard-step-options.component.ts wiring.**

    1. Add `@Output() linkedZonesClick = new EventEmitter<string>();` next to existing outputs.
    2. Add a method `onLinkedZonesClick(optionKey: string): void { this.linkedZonesClick.emit(optionKey); }`.
    3. In the HTML template (around the existing « ✓ {{ countLinkedZones(opt.key) }} zone(s) reliée(s) » render — line ~112 per Plan 05 SUMMARY), change the `<span>` to a `<button>`:
       ```html
       <button
         type="button"
         class="wso__linked-counter"
         (click)="onLinkedZonesClick(opt.key)"
         [attr.aria-label]="'Voir les zones reliées à ' + opt.key"
       >
         ✓ {{ countLinkedZones(opt.key) }} zone(s) reliée(s) à cette option
       </button>
       ```
       Add SCSS:
       ```scss
       .wso__linked-counter {
         background: transparent; border: none; padding: 4px 8px;
         color: #2563eb; cursor: pointer; font-size: 13px;
         &:hover { text-decoration: underline; }
       }
       ```
    4. Add a `removeValue(opt: TemplateOption, value: string)` (or extend the existing valuesRaw editor) that:
       ```typescript
       removeValue(opt: TemplateOption, value: string): void {
         const re = new RegExp(`\\b${opt.key}\\s*==\\s*['"]${value}['"]`);
         const zones = this.zones();
         const linked =
           zones.textFields.filter((f) => f.visibleIf && re.test(f.visibleIf)).length +
           zones.imageSlots.filter((s) => s.visibleIf && re.test(s.visibleIf)).length;
         if (linked > 0) {
           const msg = ERROR_MESSAGES.option_value_in_use.replace('{N}', String(linked));
           if (!window.confirm(msg)) return;
         }
         // ... existing value removal logic (delete option then re-create with new values list)
       }
       ```
    5. Add a rename UI: an "Renommer" button next to the existing `<span class="wso__pill wso__pill--key">{{ opt.key }}</span>`. Toggling it opens an inline `<input>` + Sauvegarder/Annuler buttons. On save, call `dataservice.renameOptionKey(templateId, opt.id, newKey)`:
       ```typescript
       onRenameSubmit(opt: TemplateOption, newKey: string): void {
         this.dataservice.renameOptionKey(this.templateId, opt.id, newKey).subscribe({
           next: (res) => {
             // Optimistic local update of visibleIf strings + option key
             this.options.update((opts) =>
               opts.map((o) => (o.id === opt.id ? { ...o, key: res.key } : o)),
             );
             // Trigger a refresh of state.zones so countLinkedZones recomputes against new key.
             // Simplest: emit zonesRefreshNeeded to parent which re-fetches getStudioView.
             this.zonesRefreshNeeded.emit();
             this.renamingOptionId.set(null);
           },
           error: (err) => {
             if (err?.error?.error === 'option_key_conflict') {
               this.renameError.set(
                 ERROR_MESSAGES.option_key_conflict.replace('{KEY}', newKey),
               );
             } else {
               this.renameError.set('Erreur inattendue.');
             }
           },
         });
       }
       ```
       Add `@Output() zonesRefreshNeeded = new EventEmitter<void>();`. The parent shell catches this and re-runs `getStudioView` to hydrate state with rewritten visibleIf strings.

    **i18n hook:** Use « Renommer » (NOT « Modifier » which may be blocklisted), « Sauvegarder » (NOT « Confirmer » which IS blocklisted per Plan 03 deviation list), « Annuler »→« Abandonner » (Plan 03 deviation), « Voir » is fine.

    **Step D — Shell wiring.**

    Edit `studio-v3-wizard.component.ts`:

    ```typescript
    highlightedOptionKey = signal<string | null>(null);

    onLinkedZonesClick(optionKey: string): void {
      this.highlightedOptionKey.set(optionKey);
      // Switch to step 3 so the zone list is visible (preview panel stays mounted)
      if (this.currentStep() !== 3) this.goToStep(3);
      // Scroll the first matching zone into view in the next microtask
      setTimeout(() => {
        const re = new RegExp(`\\b${optionKey}\\s*==`);
        const tf = this.state().zones.textFields.find((f) => f.visibleIf && re.test(f.visibleIf));
        const is = this.state().zones.imageSlots.find((s) => s.visibleIf && re.test(s.visibleIf));
        const target = tf ?? is;
        if (target) document.getElementById(`zone-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Auto-clear highlight after a short period to avoid sticky state
        setTimeout(() => this.highlightedOptionKey.set(null), 4000);
      }, 0);
    }

    onZonesRefreshNeeded(): void {
      const id = this.state().templateId;
      if (id) this.resumeFromId(id);  // existing private — make public or wrap
    }
    ```

    HTML wiring on `<app-wizard-step-options>`:
    ```html
    <app-wizard-step-options
      ...
      (linkedZonesClick)="onLinkedZonesClick($event)"
      (zonesRefreshNeeded)="onZonesRefreshNeeded()"
    />
    ```

    HTML wiring on `<app-wizard-preview-panel>`:
    ```html
    <app-wizard-preview-panel
      [state]="state()"
      [highlightedOptionKey]="highlightedOptionKey()"
      [hidden]="currentStep() < 3"
      (goToStep)="goToStep($event)"
    />
    ```

    Edit `wizard-preview-panel.component.ts` to add `@Input() highlightedOptionKey: string | null = null;` and a CSS class binding on the player wrapper:
    ```html
    <div class="wpp" [class.wpp--highlight]="!!highlightedOptionKey">
      <ng-container *ngIf="hasLayer; else placeholder">
        <app-template-studio-player [state]="state.previewState!" />
      </ng-container>
      <div *ngIf="highlightedOptionKey" class="wpp__highlight-banner">
        Surlignage : {{ highlightedOptionKey }}
      </div>
      <!-- placeholder ng-template kept -->
    </div>
    ```
    SCSS:
    ```scss
    .wpp--highlight { box-shadow: 0 0 0 4px #facc15 inset; }
    .wpp__highlight-banner {
      position: absolute; top: 8px; right: 8px; padding: 4px 8px;
      background: #facc15; color: #1f2937; font-size: 12px; border-radius: 4px;
    }
    ```

    Also ensure each text-field/image-slot rendered card in step 3 (wizard-step-zones template) has `[id]="'zone-' + tf.id"` (or equivalent) on its outer wrapper so the scroll target works. If the existing template doesn't have this id, add it as part of this task — small change, document in SUMMARY.

    **Run all checks:**
    ```
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-' --no-coverage --forceExit
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development
    cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npm run test:smoke:smart 2>&1 | tail -10
    ```

    Expect: 5 v3 smoke suites GREEN (vocabulary, preview, duplicate, asset-manager, options), ng build clean, smart smoke GREEN (no regression).

    Commit: `feat(template-studio-v3): visible_if click-to-highlight + value-removal modal + rename UI (UX-03)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-' --no-coverage --forceExit 2>&1 | tail -20 && cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-dashboard && npx ng build --configuration=development 2>&1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "option_key_conflict\|option_value_in_use" central-dashboard/.../studio-v3/vocabulary.constants.ts` returns ≥2.
    - `grep -n "renameOptionKey" central-dashboard/.../remotion-templates-data.service.ts` returns ≥1.
    - `grep -n "linkedZonesClick" central-dashboard/.../studio-v3/wizard/wizard-step-options.component.ts` returns ≥2 (output decl + emit).
    - `grep -n "onLinkedZonesClick\|highlightedOptionKey" central-dashboard/.../studio-v3-wizard.component.ts` returns ≥2.
    - `grep -nE "highlightedOptionKey" central-dashboard/.../wizard-preview-panel.component.ts` returns ≥1.
    - `grep -nE "(window\\.confirm|option_value_in_use)" central-dashboard/.../wizard-step-options.component.ts` returns ≥1.
    - All 5 v3 smoke suites GREEN.
    - `npm run test:smoke:smart` GREEN (no regression).
    - `ng build` clean.
    - Commit hash exists with prefix `feat(template-studio-v3)`.
  </acceptance_criteria>
  <done>Click-to-highlight wired end-to-end, modal confirmation on value removal, rename UI calling transactional endpoint, all smokes GREEN.</done>
</task>

</tasks>

<verification>
- 5 v3 smoke suites GREEN (vocabulary 5/5, preview 5/5, duplicate 6/6, asset-manager 7/7, options 5/5).
- `npm run test:smoke:smart` GREEN — no regression.
- `cd central-server && npx tsc --noEmit` clean.
- `cd central-dashboard && npx ng build --configuration=development` clean.
- Manual UAT (deferred):
  - In Step 4, click « ✓ 2 zones reliées » under an option → wizard switches to step 3, the first linked zone scrolls into view, the player shows a yellow border + banner "Surlignage : intro_mode" for ~4s.
  - Remove a value from an option's values list when ≥1 zone uses it → confirm modal: « Cette valeur est utilisée par 1 zones, qui deviendront toujours visibles si vous la supprimez. Continuer ? ».
  - Rename an option key from `intro_mode` to `intro_type` → success → counter updates instantly; in DB, `template_text_fields.visible_if` now reads `intro_type == 'logo'` (verified via psql).
  - Try renaming to a key already used by another option → inline FR error: « Une option avec l'identifiant « X » existe déjà sur ce template. »
</verification>

<success_criteria>

- Inline counter (Plan 05) is now clickable and emits to the shell.
- Shell highlights linked zones via Player overlay + scroll-into-view in step 3.
- Value removal triggers FR confirmation modal when in use.
- Option key rename is atomic (BEGIN/COMMIT covers 4 surfaces); any failure rolls back; smoke enforces this.
- Backend errors surfaced in FR via ERROR_MESSAGES (no hardcoded strings).
  </success_criteria>

<output>
After completion, create `.planning/phases/02-ux-interactive/02-ux-interactive-04-SUMMARY.md` documenting:
- renameOptionKey API contract (request/response shape, error codes).
- Transactional surfaces table: which DB column gets updated, by which UPDATE statement.
- ERROR_MESSAGES new entries (verbatim FR strings).
- Highlight overlay implementation note (v3.0 minimal: yellow border banner; v3.1 deferred: per-zone bounding box).
- Manual UAT checklist for the verifier.
</output>
